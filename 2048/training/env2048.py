"""Batched 2048 on torch tensors (any board size).  Boards hold exponents: 0 = empty, k = tile 2^k.
Rules are the ones of ../game.js: a move slides + merges (each tile merges at most once per move), then
spawn_count(R, C) = max(1, round(sqrt(R*C)/4)) tiles (90% a 2, 10% a 4) appear on random empty cells."""
import math
import torch


def spawn_count(R, C):
    return max(1, int(math.floor(math.sqrt(R * C) / 4 + 0.5)))


def _left(b):
    """slide + merge every row to the left.  b: (..., W) long.  returns (new, reward_exp_sum, reward_score)"""
    W = b.shape[-1]
    idx = torch.arange(W, device=b.device)

    def compact(x):
        key = (x == 0).long() * W + idx
        return torch.gather(x, -1, key.argsort(-1))

    a = compact(b)
    rexp = torch.zeros(a.shape[:-1], device=b.device)
    rsc = torch.zeros(a.shape[:-1], device=b.device)
    for j in range(W - 1):
        m = (a[..., j] == a[..., j + 1]) & (a[..., j] > 0)
        a[..., j] = a[..., j] + m.long()
        a[..., j + 1] = torch.where(m, torch.zeros_like(a[..., j + 1]), a[..., j + 1])
        e = a[..., j].float()
        rexp = rexp + m.float() * e
        rsc = rsc + m.float() * torch.pow(2.0, e)
    return compact(a), rexp, rsc


def move(b, d):
    """b: (B,H,W) long, d: 0 left 1 right 2 up 3 down.  returns new board, reward (sum of merged exponents), score gain, moved(bool)"""
    if d == 0:
        x = b
    elif d == 1:
        x = b.flip(-1)
    elif d == 2:
        x = b.transpose(1, 2)
    else:
        x = b.transpose(1, 2).flip(-1)
    n, re, rs = _left(x.clone())
    if d == 1:
        n = n.flip(-1)
    elif d == 2:
        n = n.transpose(1, 2)
    elif d == 3:
        n = n.flip(-1).transpose(1, 2)
    moved = (n != b).flatten(1).any(1)
    return n, re.sum(1), rs.sum(1), moved


def all_moves(b):
    """-> boards (4,B,H,W), reward_exp (4,B), score (4,B), legal (4,B)"""
    out = [move(b, d) for d in range(4)]
    return (torch.stack([o[0] for o in out]), torch.stack([o[1] for o in out]),
            torch.stack([o[2] for o in out]), torch.stack([o[3] for o in out]))


def spawn(b, n):
    B, H, W = b.shape
    for _ in range(n):
        r = torch.rand(B, H * W, device=b.device)
        r = torch.where(b.flatten(1) == 0, r, torch.full_like(r, -1.0))
        pos = r.argmax(1)
        ok = r.gather(1, pos[:, None])[:, 0] >= 0
        val = 1 + (torch.rand(B, device=b.device) < 0.1).long()
        flat = b.flatten(1)
        flat.scatter_(1, pos[:, None], torch.where(ok, val, flat.gather(1, pos[:, None])[:, 0])[:, None])
    return b


def new_boards(B, H, W, device):
    b = torch.zeros(B, H, W, dtype=torch.long, device=device)
    return spawn(b, spawn_count(H, W) + 1)
