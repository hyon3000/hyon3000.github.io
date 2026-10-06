"""Recurrent afterstate value network + greedy agent helper.

V(afterstate c | memory) :  enc = Wd x + Emb(item ids)                       (state of the board after the plan)
                            h_c = GRU(h_prev, summary of what plan c would trigger)
                            V   = MLP(relu(enc + Wm h_c))
h_prev is a 128-d GRU state carried through the whole game: after every executed decision it absorbs the summary of
what actually happened (item types triggered / placed, lines, explosions, garbage, hold, holes/height change), so the
network can learn by itself what to remember and for how long, e.g. that the board is a mess *because* an item went off
many decisions ago.
"""
import os
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as Fn
from simlib import NF, NIDS, SD

H = 128
VSCALE = 100.0
GAMMA = 0.997
DEATH = float(os.environ.get("DEATH", "-10"))
REWARD = os.environ.get("REWARD", "score")   # 'score': 1 + min(game score gained, SCORE_CLIP)/SCORE_DIV ; 'survival': 1 ; 'lines': 1 + 2*lines^2 (old checkpoints)
SCORE_CLIP, SCORE_DIV = 600.0, float(os.environ.get("SCORE_DIV", "50"))
BASE = float(os.environ.get("REWARD_BASE", "1.0"))   # reward every decision gets irrespective of the score (1 = survival bonus; ~0 = score only)
LINE_REWARD = 1.0 if REWARD == "lines" else 0.0   # reward per decision = 1 + LINE_REWARD*2*lines^2 ; 0 = pure survival (low variance, no incentive to gamble for big clears)
VMIN, VMAX = -20.0, float(os.environ.get("VMAX", "400" if REWARD == "survival" else "1500"))      # (VMAX env: the value clamp; a net pre-trained on bigger returns needs 1500)   # survival-only: true value <= 1/(1-gamma) = 333
HOLE_W = 0.0   # shaping: reward per hole removed (penalty per hole created); annealed by the trainer together with the survival bonus
XCLIP = 3.0                  # event summaries fed to the GRU are clipped


class RNet(nn.Module):
    def __init__(self, hidden=(256, 256, 128), mem=H):
        super().__init__()
        self.dense = nn.Linear(NF, hidden[0])
        self.emb = nn.EmbeddingBag(NIDS + 1, hidden[0], mode="sum", padding_idx=NIDS)
        nn.init.normal_(self.emb.weight, 0, 0.05)
        with torch.no_grad(): self.emb.weight[NIDS].zero_()
        self.gru = nn.GRU(SD, mem, batch_first=True)
        self.wm = nn.Linear(mem, hidden[0], bias=False)       # random init like every other weight: the memory is in use from the first update
        self.ln = nn.LayerNorm(hidden[0])                      # keeps the memory path from blowing the activations up
        layers, d = [], hidden[0]
        for h in hidden[1:]:
            layers += [nn.Linear(d, h), nn.ReLU()]; d = h
        layers += [nn.Linear(d, 1)]
        self.mlp = nn.Sequential(*layers)

    def gru_step(self, x, h):
        """one GRU step with the nn.GRU weights (identical math, any leading batch shape flattened by the caller)"""
        x = torch.clamp(x, -XCLIP, XCLIP)
        gi = Fn.linear(x, self.gru.weight_ih_l0, self.gru.bias_ih_l0)
        gh = Fn.linear(h, self.gru.weight_hh_l0, self.gru.bias_hh_l0)
        i_r, i_z, i_n = gi.chunk(3, -1); h_r, h_z, h_n = gh.chunk(3, -1)
        r = torch.sigmoid(i_r + h_r); z = torch.sigmoid(i_z + h_z)
        n = torch.tanh(i_n + r * h_n)
        return (1 - z) * n + z * h

    def value(self, x, ids, hc):
        ids = ids.long(); ids = torch.where(ids < 0, torch.full_like(ids, NIDS), ids)
        return self.mlp(torch.relu(self.ln(self.dense(x) + self.emb(ids) + self.wm(hc)))).squeeze(-1)


def _holes_delta(sumc):
    return sumc[..., 78] * 10.0    # holes created by the plan (summary slot 78 = delta holes / 10; 0 while the board is hidden)


def reward_of(lines, done, gain=None, sumc=None):
    if REWARD == "score" and gain is not None:
        r = BASE + np.clip(gain, 0.0, SCORE_CLIP) / SCORE_DIV
    else:
        r = 1.0 + LINE_REWARD * 2.0 * lines * lines
    if HOLE_W > 0 and sumc is not None:
        r = r - HOLE_W * _holes_delta(sumc)
    return np.where(done > 0, DEATH, r).astype(np.float32)


@torch.no_grad()
def candidate_q(net, x, ids, rew, valid, sumc, hprev):
    """Q(c) = r(c) + gamma * V(c | h_prev) for every candidate. x [N,C,NF], sumc [N,C,SD], hprev [N,H]."""
    N, C = x.shape[:2]
    hc = net.gru_step(sumc.reshape(N * C, -1), hprev[:, None].expand(N, C, hprev.shape[-1]).reshape(N * C, -1))
    v = (net.value(x.reshape(N * C, -1), ids.reshape(N * C, -1), hc).reshape(N, C) * VSCALE).clamp(VMIN, VMAX)
    return (rew + GAMMA * v).masked_fill(~valid, -1e9)


class Round:
    """tensors of one decision round for all envs"""
    def __init__(self, env, dev):
        cmax = int(env.counts.max()); self.cmax = cmax
        self.x = torch.from_numpy(env.feats[:, :cmax]).to(dev)
        self.ids = torch.from_numpy(env.ids[:, :cmax]).to(dev)
        self.sumc = torch.from_numpy(env.sumc[:, :cmax]).to(dev)
        self.sumact = torch.from_numpy(env.sumact).to(dev)
        self.first = torch.from_numpy(env.first).to(dev) > 0
        self.rew = torch.from_numpy(reward_of(env.lines[:, :cmax], env.done[:, :cmax], env.gain[:, :cmax], env.sumc[:, :cmax])).to(dev)
        inr = torch.arange(cmax, device=dev)[None] < torch.from_numpy(env.counts).to(dev)[:, None]
        dn = torch.from_numpy(env.done[:, :cmax]).to(dev) > 0
        alive = inr & ~dn
        self.valid = torch.where(alive.any(1, keepdim=True), alive, inr)   # forced death: any candidate
        self.chosen_dead_fn = lambda act_np: env.done[np.arange(env.n), act_np] > 0


class GreedyAgent:
    """plays greedily with the recurrent memory carried over the game (evaluation)"""
    def __init__(self, net, n, dev, memory=True):
        self.net, self.dev, self.memory = net, dev, memory
        self.h = torch.zeros(n, H, device=dev)

    @torch.no_grad()
    def act(self, env):
        env.gen()
        r = Round(env, self.dev)
        if not self.memory:   # ablation: the network sees no history at all (state and event summaries zeroed)
            r.sumact = torch.zeros_like(r.sumact); r.sumc = torch.zeros_like(r.sumc); self.h = torch.zeros_like(self.h)
        h = torch.where(r.first[:, None], torch.zeros_like(self.h), self.h)
        self.h = self.net.gru_step(r.sumact, h)
        q = candidate_q(self.net, r.x, r.ids, r.rew, r.valid, r.sumc, self.h)
        return q.argmax(1).cpu().numpy()


class SearchAgent(GreedyAgent):
    """2-ply search: the K best candidates by the value net are each played on to the next decision with the exact rules, and the
    best follow-up is looked at:  Q2(parent) = r(parent) + gamma * max_child [ r(child) + gamma * V(child) ]"""
    def __init__(self, net, n, dev, K=5, memory=True):
        super().__init__(net, n, dev, memory); self.K = K

    @torch.no_grad()
    def act(self, env):
        env.gen(); N = env.n; K = self.K
        r = Round(env, self.dev)
        h = torch.where(r.first[:, None], torch.zeros_like(self.h), self.h)
        self.h = self.net.gru_step(r.sumact, h)
        C = r.x.shape[1]
        hc = self.net.gru_step(r.sumc.reshape(N * C, -1), self.h[:, None].expand(N, C, self.h.shape[-1]).reshape(N * C, -1)).reshape(N, C, -1)
        v = (self.net.value(r.x.reshape(N * C, -1), r.ids.reshape(N * C, -1), hc.reshape(N * C, -1)).reshape(N, C) * VSCALE).clamp(VMIN, VMAX)
        q1 = (r.rew + GAMMA * v).masked_fill(~r.valid, -1e9)
        k = min(K, C)
        top = q1.topk(k, dim=1)
        parents = torch.where(top.values > -1e8, top.indices, torch.full_like(top.indices, -1))
        if k < K: parents = torch.cat([parents, torch.full((N, K - k), -1, device=self.dev, dtype=parents.dtype)], 1)
        ch = env.expand(parents.cpu().numpy().astype(np.int32))
        cm = int(max(1, ch["counts"].max()))
        cx = torch.from_numpy(ch["feats"][:, :cm]).to(self.dev); ci = torch.from_numpy(ch["ids"][:, :cm]).to(self.dev)
        cs = torch.from_numpy(ch["sumc"][:, :cm]).to(self.dev)
        cr = torch.from_numpy(reward_of(ch["lines"][:, :cm], ch["done"][:, :cm], ch["gain"][:, :cm], ch["sumc"][:, :cm])).to(self.dev)
        cnt = torch.from_numpy(ch["counts"]).to(self.dev)
        inr = torch.arange(cm, device=self.dev)[None] < cnt.clamp(min=0)[:, None]
        alive = inr & ~(torch.from_numpy(ch["done"][:, :cm]).to(self.dev) > 0)
        valid = torch.where(alive.any(1, keepdim=True), alive, inr)
        pidx = parents.clamp(min=0)
        hp = hc[torch.arange(N, device=self.dev)[:, None], pidx].reshape(N * K, -1)   # memory after the parent's own events
        qc = candidate_q(self.net, cx, ci, cr, valid, cs, hp)                       # [N*K, cm]
        best_child = qc.max(1).values
        best_child = torch.where(cnt > 0, best_child, torch.full_like(best_child, DEATH))   # child game already over -> death
        best_child = torch.where(cnt == 0, torch.zeros_like(best_child), best_child)
        q2 = top.values if False else None
        rp = r.rew.gather(1, pidx)                                                   # parent rewards [N,K]
        q2 = rp + GAMMA * best_child.reshape(N, K)
        q2 = q2.masked_fill(parents < 0, -1e9)
        pick = q2.argmax(1)
        return parents[torch.arange(N, device=self.dev), pick].cpu().numpy()


class Search3Agent(SearchAgent):
    """3-ply search: Q3(p) = r(p) + g * max over the K2 best follow-ups c of [ r(c) + g * max over their follow-ups [ r + g*V ] ]"""
    def __init__(self, net, n, dev, K=5, K2=3, memory=True):
        super().__init__(net, n, dev, K=K, memory=memory); self.K2 = K2

    @torch.no_grad()
    def act(self, env):
        env.gen(); N = env.n; K = self.K; K2 = self.K2; dev = self.dev
        r = Round(env, dev)
        h = torch.where(r.first[:, None], torch.zeros_like(self.h), self.h)
        self.h = self.net.gru_step(r.sumact, h)
        C = r.x.shape[1]; H_ = self.h.shape[-1]
        hc = self.net.gru_step(r.sumc.reshape(N * C, -1), self.h[:, None].expand(N, C, H_).reshape(N * C, -1)).reshape(N, C, -1)
        v = (self.net.value(r.x.reshape(N * C, -1), r.ids.reshape(N * C, -1), hc.reshape(N * C, -1)).reshape(N, C) * VSCALE).clamp(VMIN, VMAX)
        q1 = (r.rew + GAMMA * v).masked_fill(~r.valid, -1e9)
        k = min(K, C); top = q1.topk(k, dim=1)
        parents = torch.where(top.values > -1e8, top.indices, torch.full_like(top.indices, -1))
        if k < K: parents = torch.cat([parents, torch.full((N, K - k), -1, device=dev, dtype=parents.dtype)], 1)
        pnp = parents.cpu().numpy().astype(np.int32)
        ch = env.expand(pnp)
        cm = int(max(1, ch["counts"].max()))
        def level(ch_, hprev):
            cx = torch.from_numpy(ch_["feats"][:, :cm]).to(dev); ci = torch.from_numpy(ch_["ids"][:, :cm]).to(dev); cs = torch.from_numpy(ch_["sumc"][:, :cm]).to(dev)
            cr = torch.from_numpy(reward_of(ch_["lines"][:, :cm], ch_["done"][:, :cm], ch_["gain"][:, :cm], ch_["sumc"][:, :cm])).to(dev)
            cnt = torch.from_numpy(ch_["counts"]).to(dev)
            inr = torch.arange(cm, device=dev)[None] < cnt.clamp(min=0)[:, None]
            alive = inr & ~(torch.from_numpy(ch_["done"][:, :cm]).to(dev) > 0)
            valid = torch.where(alive.any(1, keepdim=True), alive, inr)
            hcc = self.net.gru_step(cs.reshape(-1, cs.shape[-1]), hprev[:, None].expand(-1, cm, hprev.shape[-1]).reshape(-1, hprev.shape[-1])).reshape(-1, cm, hprev.shape[-1])
            vv = (self.net.value(cx.reshape(-1, cx.shape[-1]), ci.reshape(-1, ci.shape[-1]), hcc.reshape(-1, hcc.shape[-1])).reshape(-1, cm) * VSCALE).clamp(VMIN, VMAX)
            return (cr + GAMMA * vv).masked_fill(~valid, -1e9), cr, hcc, cnt
        pidx = parents.clamp(min=0)
        hp = hc[torch.arange(N, device=dev)[:, None], pidx].reshape(N * K, -1)
        q2c, cr, hcc, cnt = level(ch, hp)                                   # [N*K, cm] value of every follow-up of every parent
        k2 = min(K2, cm); top2 = q2c.topk(k2, dim=1)
        cidx = torch.where(top2.values > -1e8, top2.indices, torch.full_like(top2.indices, -1))
        if k2 < K2: cidx = torch.cat([cidx, torch.full((N * K, K2 - k2), -1, device=dev, dtype=cidx.dtype)], 1)
        g = env.expand2(pnp, cidx.cpu().numpy().astype(np.int32))
        cm = int(max(1, g["counts"].max()))
        hsel = hcc[torch.arange(N * K, device=dev)[:, None], cidx.clamp(min=0)].reshape(N * K * K2, -1)   # memory after the follow-up's own events
        q3g, _, _, gcnt = level(g, hsel)
        best_g = q3g.max(1).values
        best_g = torch.where(gcnt > 0, best_g, torch.full_like(best_g, DEATH)); best_g = torch.where(gcnt == 0, torch.zeros_like(best_g), best_g)
        crc = cr.gather(1, cidx.clamp(min=0))                               # reward of each selected follow-up [N*K, K2]
        q_child = crc + GAMMA * best_g.reshape(N * K, K2)
        q_child = q_child.masked_fill(cidx < 0, -1e9)
        best_child = q_child.max(1).values
        best_child = torch.where(best_child < -1e8, torch.full_like(best_child, DEATH), best_child)
        rp = r.rew.gather(1, pidx)
        q3 = (rp + GAMMA * best_child.reshape(N, K)).masked_fill(parents < 0, -1e9)
        pick = q3.argmax(1)
        return parents[torch.arange(N, device=dev), pick].cpu().numpy()

@torch.no_grad()
def search2(net, tgt, env, r, hprev, K, dev):
    """Search used INSIDE training: the K best candidates (online net) are played on with the exact rules and the best follow-up is looked at.
    Returns the action chosen by the 2-ply value (online net) and the 2-ply backed-up value of that action evaluated with the target net
    (double-DQN style) -- the target for the previous decision's afterstate, i.e. a search-improved bootstrap instead of a 1-ply max."""
    N = env.n; C = r.x.shape[1]; ar = torch.arange(N, device=dev)
    def parent_q(m):
        hc = m.gru_step(r.sumc.reshape(N * C, -1), hprev[:, None].expand(N, C, hprev.shape[-1]).reshape(N * C, -1)).reshape(N, C, -1)
        v = (m.value(r.x.reshape(N * C, -1), r.ids.reshape(N * C, -1), hc.reshape(N * C, -1)).reshape(N, C) * VSCALE).clamp(VMIN, VMAX)
        return hc, (r.rew + GAMMA * v).masked_fill(~r.valid, -1e9)
    hc_o, q1 = parent_q(net); hc_t, _ = parent_q(tgt)
    k = min(K, C); top = q1.topk(k, dim=1)
    parents = torch.where(top.values > -1e8, top.indices, torch.full_like(top.indices, -1))
    if k < K: parents = torch.cat([parents, torch.full((N, K - k), -1, device=dev, dtype=parents.dtype)], 1)
    ch = env.expand(parents.cpu().numpy().astype(np.int32))
    cm = int(max(1, ch["counts"].max()))
    cx = torch.from_numpy(ch["feats"][:, :cm]).to(dev); ci = torch.from_numpy(ch["ids"][:, :cm]).to(dev); cs = torch.from_numpy(ch["sumc"][:, :cm]).to(dev)
    cr = torch.from_numpy(reward_of(ch["lines"][:, :cm], ch["done"][:, :cm], ch["gain"][:, :cm], ch["sumc"][:, :cm])).to(dev)
    cnt = torch.from_numpy(ch["counts"]).to(dev)
    inr = torch.arange(cm, device=dev)[None] < cnt.clamp(min=0)[:, None]
    alive = inr & ~(torch.from_numpy(ch["done"][:, :cm]).to(dev) > 0)
    valid = torch.where(alive.any(1, keepdim=True), alive, inr)
    pidx = parents.clamp(min=0); rp = r.rew.gather(1, pidx)
    def values(m, hc):
        hp = hc[ar[:, None], pidx].reshape(N * K, -1)
        best = candidate_q(m, cx, ci, cr, valid, cs, hp).max(1).values
        best = torch.where(cnt > 0, best, torch.full_like(best, DEATH)); best = torch.where(cnt == 0, torch.zeros_like(best), best)
        return (rp + GAMMA * best.reshape(N, K)).masked_fill(parents < 0, -1e9)
    q2o = values(net, hc_o); q2t = values(tgt, hc_t)
    pick = q2o.argmax(1)
    act = parents[ar, pick]; ys = q2t[ar, pick]
    ok = act >= 0
    return act, ys, ok
