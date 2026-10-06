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
from simnd import NF, NIDS, SD

H = 128
VSCALE = 100.0
GAMMA = 0.997
DEATH = float(os.environ.get("DEATH", "-10"))
REWARD = os.environ.get("REWARD", "score")   # 'score': 1 + min(game score gained, SCORE_CLIP)/SCORE_DIV ; 'survival': 1 ; 'lines': 1 + 2*lines^2 (old checkpoints)
ITEM_BONUS = float(os.environ.get("ITEM_BONUS", "0"))   # battle placement: reward per item eaten (an eaten item is ammunition, not a hazard)
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
    from simnd import DIM
    return sumc[..., 30] * ((49 if DIM == 3 else 343) // 2 + 5)    # holes created by the plan (summary slot 30 = delta holes / (ncol/2+5))


def reward_of(lines, done, gain=None, sumc=None):
    if REWARD == "score" and gain is not None:
        r = BASE + np.clip(gain, 0.0, SCORE_CLIP) / SCORE_DIV
    else:
        r = 1.0 + LINE_REWARD * 2.0 * lines * lines
    if ITEM_BONUS > 0 and sumc is not None:
        r = r + ITEM_BONUS * sumc[..., 5:17].sum(-1) * 3.0     # sumc[5+g] = items of group g triggered / 3
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


