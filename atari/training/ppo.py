"""Small PPO for the vectorised torch environments (discrete multi-head actions)."""
import time
import torch
import torch.nn as nn
import torch.nn.functional as F


class Net(nn.Module):
    def __init__(self, obs, heads, hid=256):
        super().__init__()
        self.heads, self.hid = list(heads), hid
        self.body = nn.Sequential(nn.Linear(obs, hid), nn.Tanh(), nn.Linear(hid, hid), nn.Tanh())
        self.pi = nn.Linear(hid, sum(heads))
        self.v = nn.Linear(hid, 1)
        nn.init.orthogonal_(self.pi.weight, 0.01)

    def forward(self, x):
        h = self.body(x)
        return list(self.pi(h).split(self.heads, -1)), self.v(h)[:, 0]


def sample(net, obs, greedy=False):
    logits, v = net(obs)
    acts, lp = [], 0
    for l in logits:
        d = torch.distributions.Categorical(logits=l)
        a = l.argmax(-1) if greedy else d.sample()
        acts.append(a)
        lp = lp + d.log_prob(a)
    return torch.stack(acts, -1), lp, v


def train(env, net, minutes, out, horizon=128, epochs=4, mb=8192, lr=3e-4, gamma=0.997, lam=0.97, clip=0.2, ent=0.01, log_every=30, make_act=None):
    dev = env.dev
    opt = torch.optim.Adam(net.parameters(), lr=lr, eps=1e-5)
    obs = env.obs()
    t0 = time.time(); last = 0; it = 0; ep_r = torch.zeros(env.B, device=dev); ep_len = torch.zeros(env.B, device=dev)
    stats = {"ret": [], "len": [], "score": 0.0, "n": 0, "dead": 0.0, "behind": 0.0}
    best = -1e9
    while time.time() - t0 < minutes * 60:
        frac = (time.time() - t0) / (minutes * 60)
        for g in opt.param_groups:
            g["lr"] = lr * (1 - 0.9 * frac)
        O, A, LP, V, RW, DN, MK = [], [], [], [], [], [], []
        for _ in range(horizon):
            with torch.no_grad():
                a, lp, v = sample(net, obs)
            if hasattr(env, "needs_decision"):                       # the policy only decides at decision points; in between the last choice stays
                m = env.needs_decision()
                a = torch.where(m[:, None], a, env.last_act.reshape(env.B, -1))
                env.commit(m, a if a.shape[1] > 1 else a[:, 0])
            else:
                m = torch.ones(env.B, dtype=torch.bool, device=dev)
            nobs, r, d, info = env.step(make_act(a))
            O.append(obs); A.append(a); LP.append(lp); V.append(v); RW.append(r); DN.append(d.float()); MK.append(m.float())
            ep_r += r; ep_len += 1
            stats["score"] += info["score"].sum().item(); stats["n"] += env.B; stats["dead"] += info["dead"].float().sum().item(); stats["behind"] += info["behind"].sum().item()
            if d.any():
                stats["ret"] += ep_r[d].tolist(); stats["len"] += ep_len[d].tolist()
                ep_r[d] = 0; ep_len[d] = 0
            obs = nobs
        with torch.no_grad():
            _, _, nv = sample(net, obs)
        adv = torch.zeros(horizon, env.B, device=dev); last_gae = 0
        for t in reversed(range(horizon)):
            nxt = nv if t == horizon - 1 else V[t + 1]
            delta = RW[t] + gamma * nxt * (1 - DN[t]) - V[t]
            last_gae = delta + gamma * lam * (1 - DN[t]) * last_gae
            adv[t] = last_gae
        ret = adv + torch.stack(V)
        O = torch.stack(O).flatten(0, 1); A = torch.stack(A).flatten(0, 1); LP = torch.stack(LP).flatten(); MK = torch.stack(MK).flatten(); adv = adv.flatten(); ret = ret.flatten()
        sel = MK > 0.5
        adv = (adv - adv[sel].mean()) / (adv[sel].std() + 1e-8)
        N = O.shape[0]
        for _ in range(epochs):
            perm = torch.randperm(N, device=dev)
            for i in range(0, N, mb):
                ix = perm[i:i + mb]
                logits, v = net(O[ix])
                lp = 0; en = 0
                for k, l in enumerate(logits):
                    d = torch.distributions.Categorical(logits=l)
                    lp = lp + d.log_prob(A[ix][:, k]); en = en + d.entropy()
                ratio = (lp - LP[ix]).exp()
                w = MK[ix]; wsum = w.sum().clamp(min=1.0)
                pl = -(torch.min(ratio * adv[ix], ratio.clamp(1 - clip, 1 + clip) * adv[ix]) * w).sum() / wsum
                vl = F.mse_loss(v, ret[ix])
                loss = pl + 0.5 * vl - ent * (en * w).sum() / wsum
                opt.zero_grad(set_to_none=True); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(), 0.5); opt.step()
        it += 1
        if time.time() - last > log_every:
            last = time.time()
            n = max(1, len(stats["ret"]))
            r = sum(stats["ret"]) / n if stats["ret"] else 0.0
            ln = sum(stats["len"]) / n if stats["len"] else 0.0
            print(f"t {(time.time()-t0)/60:6.1f}m it {it} eps {len(stats['ret'])} ret {r:7.2f} len {ln:7.1f} score/decision {stats['score']/max(1,stats['n']):6.3f} deaths/1k {1000*stats['dead']/max(1,stats['n']):6.2f} behind% {100*stats['behind']/max(1,stats['n']):5.1f}", flush=True)
            if r > best and len(stats["ret"]) > 50:
                best = r; torch.save(net.state_dict(), out + "_best.pt")
            torch.save(net.state_dict(), out + "_last.pt")
            stats = {"ret": [], "len": [], "score": 0.0, "n": 0, "dead": 0.0, "behind": 0.0}
    torch.save(net.state_dict(), out + "_last.pt")
