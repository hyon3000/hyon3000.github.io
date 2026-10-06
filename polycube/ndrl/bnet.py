"""One network for the whole battle decision (3D / 4D): where to put the block AND which stored item to throw at whom (or use on myself) and when.

BRNet = RNet (recurrent afterstate value network, see rnnnet.py) + two additions that share its weights:
  * a battle context  ctx = [opponent window (VIEWD), my item queue (QD)]  is added to the state encoding of every candidate plan, so the value of
    a plan knows what the opponent looks like and which items are waiting (a zero-initialised layer: at the start it is exactly the solo network)
  * an item head: A(s, a) for the NA item actions {wait, take item k of the first QPOS and use it on me / throw it at the opponent}, computed from the
    same encoding of the current board + memory + context. A(s, wait) = 0 by construction; A(s, a) is the advantage of the item action over waiting.
Q(s, a) = max_plan Q(plan) + A(s, a)  (so the value of a state is  max_p Q + max_a A  and the placement targets bootstrap through the item decision).
"""
import numpy as np
import torch, torch.nn as nn
from duel_nd import NA, NF, VIEWD, QD      # (duel_nd picks the simulator of DIM = 2 / 3 / 4 and puts the right rnnnet on the path)
from rnnnet import RNet, H, VSCALE, GAMMA, VMIN, VMAX

CTXD = VIEWD + QD


class BRNet(RNet):
    def __init__(self, hidden=(256, 256, 128), mem=H):
        super().__init__(hidden, mem)
        self.cdense = nn.Linear(CTXD, hidden[0])
        nn.init.zeros_(self.cdense.weight); nn.init.zeros_(self.cdense.bias)
        self.ih1 = nn.Linear(hidden[0], 128); self.ih2 = nn.Linear(128, NA)
        nn.init.zeros_(self.ih2.weight); nn.init.zeros_(self.ih2.bias)

    def value(self, x, ids, hc, ctx=None):
        ids = ids.long(); ids = torch.where(ids < 0, torch.full_like(ids, self.emb.num_embeddings - 1), ids)
        z = self.dense(x) + self.emb(ids) + self.wm(hc)
        if ctx is not None: z = z + self.cdense(ctx)
        return self.mlp(torch.relu(self.ln(z))).squeeze(-1)

    def item_adv(self, xr, ctx, h):
        """A(s, a) / VSCALE for the NA item actions; column 0 (wait) is 0"""
        z = torch.relu(self.ln(self.dense(xr) + self.wm(h) + self.cdense(ctx)))
        a = self.ih2(torch.relu(self.ih1(z)))
        return a - a[:, :1]


@torch.no_grad()
def candidate_q_b(net, x, ids, rew, valid, sumc, hprev, ctx):
    """Q(c) = r(c) + gamma * V(c | h_prev, ctx).  x [N,C,NF], sumc [N,C,SD], hprev [N,H], ctx [N,CTXD]"""
    N, C = x.shape[:2]
    hc = net.gru_step(sumc.reshape(N * C, -1), hprev[:, None].expand(N, C, hprev.shape[-1]).reshape(N * C, -1))
    cx = ctx[:, None].expand(N, C, ctx.shape[-1]).reshape(N * C, -1)
    v = (net.value(x.reshape(N * C, -1), ids.reshape(N * C, -1), hc, cx).reshape(N, C) * VSCALE).clamp(VMIN, VMAX)
    return (rew + GAMMA * v).masked_fill(~valid, -1e9)
