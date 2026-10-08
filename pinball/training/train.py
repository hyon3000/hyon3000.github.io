"""PPO for the 3D Pinball auto player.
Setup:  ./setup_game.sh && (cd /tmp/pbgame && python3.12 -m http.server 8765 --bind 127.0.0.1 &)      (local copy of the web build, NOT part of the repo)
Run:    python3.12 train.py --out runs/p1 --envs 16 --minutes 90
Every env is one headless Firefox running the game on a virtual clock (harness.html); the state (ball x, y, score) is read from the wasm heap by ../ai.js."""
import argparse, os, sys, time, threading, json, traceback
import numpy as np, torch, torch.nn as nn
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pbenv import Env, NOBS, NACT

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='runs/p1'); ap.add_argument('--envs', type=int, default=16); ap.add_argument('--T', type=int, default=128)
ap.add_argument('--minutes', type=float, default=90); ap.add_argument('--hid', type=int, default=128); ap.add_argument('--lr', type=float, default=3e-4)
ap.add_argument('--gamma', type=float, default=0.995); ap.add_argument('--lam', type=float, default=0.95); ap.add_argument('--ent', type=float, default=0.003)
ap.add_argument('--rscale', type=float, default=3000.0); ap.add_argument('--alive', type=float, default=0.01); ap.add_argument('--lost', type=float, default=1.0); ap.add_argument('--rclip', type=float, default=1.0)
ap.add_argument('--resume', default=''); ap.add_argument('--seed', type=int, default=0)
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)
torch.manual_seed(args.seed); np.random.seed(args.seed)
dev = torch.device('cuda' if torch.cuda.is_available() else 'cpu')


class Net(nn.Module):
    def __init__(s, hid):
        super().__init__()
        s.body = nn.Sequential(nn.Linear(NOBS, hid), nn.Tanh(), nn.Linear(hid, hid), nn.Tanh())
        s.pi = nn.Linear(hid, NACT)
        s.vb = nn.Sequential(nn.Linear(NOBS, hid), nn.Tanh(), nn.Linear(hid, hid), nn.Tanh()); s.v = nn.Linear(hid, 1)      # separate value network (its large, noisy loss must not shrink the policy updates)
        nn.init.orthogonal_(s.pi.weight, 0.01); nn.init.zeros_(s.pi.bias)
    def forward(s, x):
        return s.pi(s.body(x)), s.v(s.vb(x)).squeeze(-1)


net = Net(args.hid).to(dev)
if args.resume: net.load_state_dict(torch.load(args.resume, map_location=dev))
opt = torch.optim.Adam(net.parameters(), lr=args.lr, eps=1e-5)


def np_weights():
    sd = {k: v.detach().cpu().numpy().astype(np.float32) for k, v in net.state_dict().items()}
    return sd


def np_forward(W, x):
    h = np.tanh(W['body.0.weight'] @ x + W['body.0.bias']); h = np.tanh(W['body.2.weight'] @ h + W['body.2.bias'])
    g = np.tanh(W['vb.0.weight'] @ x + W['vb.0.bias']); g = np.tanh(W['vb.2.weight'] @ g + W['vb.2.bias'])
    return W['pi.weight'] @ h + W['pi.bias'], float(W['v.weight'] @ g + W['v.bias'])


class Worker:
    def __init__(s, i):
        s.i = i; s.rng = np.random.default_rng(args.seed * 1000 + i); s.env = None; s.games = []; s.balls = []; s.fr = 0; s.restarts = 0
        s.ball_ret = 0.0; s.ball_score = 0; s.ball_len = 0; s.lens = []
    def ensure(s):
        if s.env is None:
            s.env = Env(); s.o = s.env.obs
    def rollout(s, W, T):
        O = np.zeros((T, NOBS), np.float32); A = np.zeros(T, np.int64); LP = np.zeros(T, np.float32); V = np.zeros(T + 1, np.float32); R = np.zeros(T, np.float32); D = np.zeros(T, np.float32)
        t = 0; tries = 0
        while t < T:
            try:
                s.ensure()
                lg, v = np_forward(W, s.o)
                p = np.exp(lg - lg.max()); p /= p.sum(); a = int(s.rng.choice(NACT, p=p))
                o2, dsc, done, over = s.env.step(a)
                r = min(args.rclip, dsc / args.rscale) + args.alive - (args.lost if done else 0.0)
                O[t] = s.o; A[t] = a; LP[t] = np.log(p[a] + 1e-8); V[t] = v; R[t] = r; D[t] = 1.0 if done else 0.0
                s.ball_score += dsc; s.ball_len += 1
                if done: s.balls.append(s.ball_score); s.ball_score = 0; s.lens.append(s.ball_len); s.ball_len = 0
                if over: s.games.append(s.env.game_scores[-1])
                s.o = o2; t += 1
            except Exception as e:
                print('worker', s.i, 'error', repr(e)[:200], flush=True); s.restarts += 1
                try: s.env.close()
                except Exception: pass
                s.env = None; tries += 1
                if tries > 5: raise
                if t > 0: D[t - 1] = 1.0
        _, vl = np_forward(W, s.o); V[T] = vl
        s.fr = s.env.frames
        return O, A, LP, V, R, D


def gae(V, R, D):
    T = len(R); adv = np.zeros(T, np.float32); last = 0.0
    for t in reversed(range(T)):
        nd = 1.0 - D[t]
        delta = R[t] + args.gamma * V[t + 1] * nd - V[t]
        last = delta + args.gamma * args.lam * nd * last; adv[t] = last
    return adv, adv + V[:T]


def main():
    workers = [Worker(i) for i in range(args.envs)]
    pool = ThreadPoolExecutor(args.envs)
    t0 = time.time(); it = 0; steps = 0; best = -1; log = open(os.path.join(args.out, 'log.txt'), 'a'); allgames = []
    while time.time() - t0 < args.minutes * 60:
        W = np_weights(); tt = time.time()
        res = list(pool.map(lambda w: w.rollout(W, args.T), workers))
        t_roll = time.time() - tt
        O = np.concatenate([r[0] for r in res]); A = np.concatenate([r[1] for r in res]); LP = np.concatenate([r[2] for r in res])
        advs, rets = zip(*[gae(r[3], r[4], r[5]) for r in res]); ADV = np.concatenate(advs); RET = np.concatenate(rets)
        steps += len(O)
        o_t = torch.tensor(O, device=dev); a_t = torch.tensor(A, device=dev); lp_t = torch.tensor(LP, device=dev); ret_t = torch.tensor(RET, device=dev)
        adv_t = torch.tensor((ADV - ADV.mean()) / (ADV.std() + 1e-8), device=dev)
        frac = 1.0 - (time.time() - t0) / (args.minutes * 60); lr = args.lr * max(0.1, frac)
        for g in opt.param_groups: g['lr'] = lr
        n = len(O)
        for ep in range(4):
            perm = torch.randperm(n, device=dev)
            for i in range(0, n, 512):
                idx = perm[i:i + 512]
                lg, v = net(o_t[idx]); dist = torch.distributions.Categorical(logits=lg)
                ratio = torch.exp(dist.log_prob(a_t[idx]) - lp_t[idx])
                l_pi = -torch.min(ratio * adv_t[idx], torch.clamp(ratio, 0.8, 1.2) * adv_t[idx]).mean()
                l_v = 0.5 * ((v - ret_t[idx]) ** 2).mean(); ent = dist.entropy().mean()
                loss = l_pi + 0.5 * l_v - args.ent * ent
                opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(list(net.body.parameters()) + list(net.pi.parameters()), 0.5); nn.utils.clip_grad_norm_(list(net.vb.parameters()) + list(net.v.parameters()), 1.0); opt.step()
        it += 1
        for w in workers: allgames += w.games; w.games = []
        balls = [b for w in workers for b in w.balls[-50:]]; lens = [b for w in workers for b in w.lens[-50:]]
        recent = allgames[-30:]
        mean_g = float(np.mean(recent)) if recent else float('nan')
        fr = sum(w.fr for w in workers); el = time.time() - t0
        line = 'it %d steps %d games %d recent30 %.0f ballmean %.0f balllen %.0f ent %.3f rollout %.1fs elapsed %.0fs frames/s %.0f restarts %d' % (it, steps, len(allgames), mean_g, np.mean(balls) if balls else 0, np.mean(lens) if lens else 0, ent.item(), t_roll, el, fr / el, sum(w.restarts for w in workers))
        print(line, flush=True); log.write(line + '\n'); log.flush()
        torch.save(net.state_dict(), os.path.join(args.out, 'last.pt'))
        if len(allgames) >= 30 and mean_g > best:
            best = mean_g; torch.save(net.state_dict(), os.path.join(args.out, 'best.pt'))
        json.dump(allgames, open(os.path.join(args.out, 'games.json'), 'w'))
    for w in workers:
        if w.env: w.env.close()


if __name__ == '__main__':
    main()
