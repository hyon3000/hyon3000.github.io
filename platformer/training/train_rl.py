#!/usr/bin/env python3.12
# Trains the Shape World auto player: behaviour cloning from the look-ahead planner -> DAgger -> PPO fine-tuning on the real JS simulation.
# Rollouts run inside headless Firefox pages (selenium); updates run in PyTorch (cuda).  usage: train_rl.py OUTDIR [--minutes N]
import sys, os, json, time, base64, threading, functools, http.server, socketserver, random, argparse
import numpy as np, torch, torch.nn as nn
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # .../platformer
D, H1, H2 = 604, 256, 128
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--workers', type=int, default=10); ap.add_argument('--minutes', type=float, default=60)
ap.add_argument('--bc_steps', type=int, default=14000); ap.add_argument('--dagger_rounds', type=int, default=3); ap.add_argument('--dagger_steps', type=int, default=5000); ap.add_argument('--resume', default='')
args = ap.parse_args(); os.makedirs(args.out, exist_ok=True)
dev = 'cuda' if torch.cuda.is_available() else 'cpu'

def serve():
    h = functools.partial(http.server.SimpleHTTPClient if False else http.server.SimpleHTTPRequestHandler, directory=os.path.dirname(ROOT)); h.log_message = lambda *a, **k: None
    socketserver.TCPServer.allow_reuse_address = True
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
srv = serve(); PORT = srv.server_port

class Worker:
    def __init__(self, k):
        o = Options(); o.add_argument('-headless'); self.d = webdriver.Firefox(options=o); self.d.set_script_timeout(3000); self.d.command_executor._client_config.timeout = 3000
        self.d.get('http://127.0.0.1:%d/platformer/training/train.html' % PORT); self.k = k
    def js(self, code, *a): return self.d.execute_script(code, *a)
    def close(self):
        try: self.d.quit()
        except Exception: pass

def par(workers, fn):
    res = [None] * len(workers); err = []
    def run(i):
        try: res[i] = fn(workers[i], i)
        except Exception as e: err.append(repr(e))
    ts = [threading.Thread(target=run, args=(i,)) for i in range(len(workers))]
    [t.start() for t in ts]; [t.join() for t in ts]
    if err: print('worker errors:', err[:2], flush=True)
    return res

class Net(nn.Module):
    def __init__(s):
        super().__init__(); s.l1 = nn.Linear(D, H1); s.l2 = nn.Linear(H1, H2); s.l3 = nn.Linear(H2, 5)
    def forward(s, x):
        x = torch.relu(s.l1(x)); x = torch.relu(s.l2(x)); return s.l3(x)
    def flat(s):
        parts = []
        for l in (s.l1, s.l2, s.l3):
            parts.append(l.weight.detach().cpu().numpy().T.astype(np.float32).ravel()); parts.append(l.bias.detach().cpu().numpy().astype(np.float32).ravel())
        return np.concatenate(parts)
    def b64(s): return base64.b64encode(s.flat().tobytes()).decode()

def dec_obs(b): return np.frombuffer(base64.b64decode(b), dtype=np.int8).reshape(-1, D).astype(np.float32) / 100.0
def dec(b, dt): return np.frombuffer(base64.b64decode(b), dtype=dt)

def make_specs(k, n=70, base=100):
    r = random.Random(1234 + k); out = []
    for j in range(n):
        out.append({'seed': base + k * 1000 + j, 'n': r.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 24, 25])})
    return out

def export(net, path, meta):
    js = 'window.SHAPE_AI = ' + json.dumps({'obs': D, 'h1': H1, 'h2': H2, 'out': 5, 'meta': meta, 'w': net.b64()}) + ';\n'
    open(path, 'w').write(js)

log = open(os.path.join(args.out, 'train.log'), 'a')
def P(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); log.write(s + '\n'); log.flush()

t_start = time.time()
P('starting workers', args.workers)
workers = par([None] * args.workers, lambda _, i: Worker(i)) if False else [None] * args.workers
def mk(i): workers[i] = Worker(i)
ts = [threading.Thread(target=mk, args=(i,)) for i in range(args.workers)]; [t.start() for t in ts]; [t.join() for t in ts]
sizes = par(workers, lambda w, i: w.js('return RL.init(arguments[0])', make_specs(i)))
P('level pools', sizes, 'in', round(time.time() - t_start), 's')

net = Net().to(dev)
if args.resume: net.load_state_dict(torch.load(args.resume)); P('resumed', args.resume)

# ---------------- phase 1: behaviour cloning from the planner
def bc_train(X, A, epochs=12, lr=1e-3, bs=2048):
    opt = torch.optim.Adam([p for l in (net.l1, net.l2, net.l3) for p in l.parameters()], lr=lr)
    Xt = torch.tensor(X, device=dev); At = torch.tensor(A, device=dev, dtype=torch.float32)
    n = len(Xt)
    for ep in range(epochs):
        perm = torch.randperm(n, device=dev); tot = 0; acc = 0
        for i in range(0, n, bs):
            idx = perm[i:i + bs]; out = net(Xt[idx])[:, :4]
            loss = nn.functional.binary_cross_entropy_with_logits(out, At[idx]); opt.zero_grad(); loss.backward(); opt.step()
            tot += loss.item() * len(idx); acc += ((out > 0).float() == At[idx]).float().mean().item() * len(idx)
        P('  bc epoch', ep, 'loss %.4f acc %.4f' % (tot / n, acc / n))
def bits_to_mat(a): return np.stack([(a >> k) & 1 for k in range(4)], 1).astype(np.float32)

if not args.resume:
    t0 = time.time()
    res = par(workers, lambda w, i: w.js('return RL.collectBC(arguments[0], false, 0)', args.bc_steps))
    X = np.concatenate([dec_obs(r['obs']) for r in res]); A = np.concatenate([bits_to_mat(dec(r['act'], np.uint8)) for r in res])
    P('BC data', X.shape, 'planner wins in collection', sum(r['wins'] for r in res), '/', sum(r['eps'] for r in res), 'episodes', round(time.time() - t0), 's')
    bc_train(X, A)
    DX, DA = [X], [A]
    # ---------------- phase 2: DAgger
    for rd in range(args.dagger_rounds):
        beta = [0.5, 0.25, 0.1, 0.0][min(rd, 3)]; t0 = time.time(); wb = net.b64()
        res = par(workers, lambda w, i: (w.js('RL.setWeights(arguments[0],arguments[1],arguments[2])', wb, H1, H2), w.js('return RL.collectBC(arguments[0], true, arguments[1])', args.dagger_steps, beta))[1])
        X2 = np.concatenate([dec_obs(r['obs']) for r in res]); A2 = np.concatenate([bits_to_mat(dec(r['act'], np.uint8)) for r in res]); DX.append(X2); DA.append(A2)
        P('DAgger round', rd, 'beta', beta, 'new', X2.shape[0], 'policy-driven episodes won', sum(r['wins'] for r in res), '/', sum(r['eps'] for r in res), round(time.time() - t0), 's')
        bc_train(np.concatenate(DX), np.concatenate(DA), epochs=8, lr=5e-4)
    torch.save(net.state_dict(), os.path.join(args.out, 'bc.pt')); export(net, os.path.join(args.out, 'ai-model-bc.js'), {'stage': 'bc+dagger'})

# ---------------- phase 3: PPO on the real simulator
def ppo(minutes, steps_per_worker=2048):
    opt = torch.optim.Adam(net.parameters(), lr=1.5e-4); gamma, lam = 0.995, 0.95; it = 0; best = -1; t_end = time.time() + minutes * 60
    while time.time() < t_end:
        t0 = time.time(); wb = net.b64()
        res = par(workers, lambda w, i: (w.js('RL.setWeights(arguments[0],arguments[1],arguments[2])', wb, H1, H2), w.js('return RL.rollout(arguments[0])', steps_per_worker))[1])
        res = [r for r in res if r]
        obs, act, lp, adv_l, ret_l = [], [], [], [], []
        wins = sum(r['wins'] for r in res); eps = sum(r['eps'] for r in res); deaths = sum(r['deaths'] for r in res)
        for r in res:
            o = torch.tensor(dec_obs(r['obs']), device=dev); a = dec(r['act'], np.uint8); v = dec(r['val'], np.float32); rew = dec(r['rew'], np.float32); dn = dec(r['done'], np.uint8)
            n = len(rew); adv = np.zeros(n, np.float32); last = 0.0; nv = r['lastVal']
            for t in reversed(range(n)):
                nxt = nv if t == n - 1 else v[t + 1]; nd = 1.0 - dn[t]
                delta = rew[t] + gamma * nxt * nd - v[t]; last = delta + gamma * lam * nd * last; adv[t] = last
            obs.append(o); act.append(torch.tensor(bits_to_mat(a), device=dev)); lp.append(torch.tensor(dec(r['lp'], np.float32), device=dev)); adv_l.append(torch.tensor(adv, device=dev)); ret_l.append(torch.tensor(adv + v, device=dev))
        O = torch.cat(obs); A = torch.cat(act); LP = torch.cat(lp); ADV = torch.cat(adv_l); RET = torch.cat(ret_l); n = len(O)
        ADVn = (ADV - ADV.mean()) / (ADV.std() + 1e-6)
        vf_only = it < 3
        for ep in range(4):
            perm = torch.randperm(n, device=dev)
            for i in range(0, n, 4096):
                idx = perm[i:i + 4096]; out = net(O[idx]); logit = out[:, :4]; v = out[:, 4]
                lpn = -nn.functional.binary_cross_entropy_with_logits(logit, A[idx], reduction='none').sum(1)
                ratio = torch.exp(lpn - LP[idx]); s1 = ratio * ADVn[idx]; s2 = torch.clamp(ratio, 0.8, 1.2) * ADVn[idx]
                pl_loss = -torch.min(s1, s2).mean(); vl = ((v - RET[idx]) ** 2).mean()
                p = torch.sigmoid(logit); ent = -(p * torch.log(p + 1e-8) + (1 - p) * torch.log(1 - p + 1e-8)).sum(1).mean()
                loss = (0 if vf_only else pl_loss) + 0.5 * vl - 0.003 * ent
                opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(), 0.5); opt.step()
        it += 1
        P('ppo it %d steps %d episodes %d wins %d deaths %d winrate %.3f vloss %.3f time %.0fs elapsed %.1fmin' % (it, n, eps, wins, deaths, wins / max(1, eps), vl.item(), time.time() - t0, (time.time() - t_start) / 60))
        if it % 10 == 0: torch.save(net.state_dict(), os.path.join(args.out, 'ppo_%d.pt' % it)); export(net, os.path.join(args.out, 'ai-model-latest.js'), {'stage': 'ppo', 'iter': it})
    torch.save(net.state_dict(), os.path.join(args.out, 'final.pt')); export(net, os.path.join(args.out, 'ai-model-final.js'), {'stage': 'ppo', 'iter': it})
if args.minutes > 0: ppo(args.minutes)
P('done in %.1f min' % ((time.time() - t_start) / 60))
for w in workers: w.close()
