"""Battle mode (3D / 4D): two players on two boards, items are stored and used on demand, the one who survives longer wins.

The placement of every block still comes from the solo value network (greedy). What this file adds is the item decision: before every block the
player may use the FRONT item of its queue on itself, on the opponent, or wait. The decision net sees what a player can see of the opponent
(its window: cells are only normal / special, plus how many items it holds), its own board features and its own item queue.
Reward: +1 for outlasting the opponent, -1 for dying first (0 if nobody died), plus potential-based shaping on the height difference.
"""
import argparse, os, sys, time, collections, numpy as np, torch, torch.nn as nn, torch.nn.functional as Fn
DIM = int(os.environ.get("DIM", "3"))
if DIM == 2:       # 2D: the polynomino simulator and its value net (same battle API, see polynomino/training/sim.cpp)
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "polynomino", "training"))
    from simlib import VecEnv, NF, VIEWD, QD, BSD, MAXC
else:
    from simnd import VecEnv, DIM, NF, VIEWD, QD, BSD, MAXC
from rnnnet import RNet, GreedyAgent

SELF_RULE = {9, 20, 21, 102, 104, 116, 118, 119, 124, 126, 105, 106, 204}      # the web AI's old rule: helpful items on itself, the rest on the opponent


QPOS = 4
NA = 1 + 2 * QPOS      # 0 wait; 2k+1 / 2k+2: take item k of the first QPOS (touch the slots k times, then use the front item) and use it on me / throw it at the opponent
SURE_SELF = {9, 20, 21, 102, 105, 116, 118, 119, 124, 126}              # clearly helpful: never given to the opponent (see battle.js B.forbidden)
SURE_OPP = {2, 4, 6, 8, 10, 11, 16, 17, 22, 91, 117, 125, 127}          # clearly harmful: never used on myself
_IS_SELF = np.zeros(512, bool); _IS_SELF[list(SURE_SELF)] = True
_IS_OPP = np.zeros(512, bool); _IS_OPP[list(SURE_OPP)] = True


def action_mask(env):
    """[n, NA] which actions make sense: wait always; item k only if it exists, and not on the side that is clearly wrong for it"""
    codes = env.qpos(); m = np.zeros((env.n, NA), bool); m[:, 0] = True
    for k in range(QPOS):
        c = codes[:, k]; here = c > 0
        m[:, 1 + 2 * k] = here & ~_IS_OPP[c]
        m[:, 2 + 2 * k] = here & ~_IS_SELF[c]
    return m


class UseNet(nn.Module):
    """Q(state, a) for the NA item-use actions"""
    def __init__(self, d=BSD, h=256):
        super().__init__()
        self.f = nn.Sequential(nn.Linear(d, h), nn.ReLU(), nn.Linear(h, h), nn.ReLU(), nn.Linear(h, NA))
    def forward(self, x): return self.f(x)


def front_code(env_q):          # env_q: [n, 11] queue snapshots
    return env_q[:, 1]


class Duel:
    def __init__(self, n, placement_ckpt, dev, seed=0, item_scale=8, maxdec=600, placement_b=None):
        self.n, self.dev, self.maxdec = n, dev, maxdec
        self.A = VecEnv(n, seed * 2 + 1, items=True); self.B = VecEnv(n, seed * 2 + 2, items=True)
        self.A.set_battle(True, item_scale); self.B.set_battle(True, item_scale)
        net = RNet().to(dev); net.load_state_dict(torch.load(placement_ckpt, map_location=dev)); net.eval()
        netB = net
        if placement_b:                                        # a different placement net for the second player (e.g. battle-trained vs solo-trained)
            netB = RNet().to(dev); netB.load_state_dict(torch.load(placement_b, map_location=dev)); netB.eval()
        self.agA, self.agB = GreedyAgent(net, n, dev), GreedyAgent(netB, n, dev)
        self.dec = np.zeros(n, np.int32)
        self.stats = collections.Counter()

    def finish(self, deadA, deadB, capA, capB, tA, tB):
        """winner per duel: +1 A, -1 B, 0 draw/none; done mask"""
        win = np.zeros(self.n, np.int8)
        both = deadA & deadB
        win[deadA & ~deadB] = -1; win[deadB & ~deadA] = 1
        win[both] = np.where(tA[both] > tB[both], 1, np.where(tA[both] < tB[both], -1, 0))
        done = deadA | deadB | capA | capB
        return win, done

    def reset_done(self, done):
        for i in np.nonzero(done)[0]:
            self.A.reset_one(i); self.B.reset_one(i)
        self.dec[done] = 0

    def round(self, polA, polB, maxpieces=100000):
        """one decision of both players in every duel. pol(x, qn) -> mode array. Returns dict with states/actions/outcome."""
        A, B, n = self.A, self.B, self.n
        xa, qa = A.bstate(B); xb, qb = B.bstate(A)
        vA, vB = action_mask(A), action_mask(B)
        ma, mb = polA(xa, vA), polB(xb, vB)
        ma = np.where(vA[np.arange(n), ma], ma, 0); mb = np.where(vB[np.arange(n), mb], mb, 0)
        ua = A.buse(B, ma); ub = B.buse(A, mb)
        tA, tB = A.times(), B.times()
        actA = self.agA.act(A); actB = self.agB.act(B)
        epA = A.step(actA, maxpieces).copy(); epB = B.step(actB, maxpieces).copy()
        self.dec += 1
        deadA, deadB = epA[:, 0] == 1, epB[:, 0] == 1
        capA, capB = epA[:, 0] == 2, epB[:, 0] == 2
        timeup = self.dec >= self.maxdec
        win, done = self.finish(deadA, deadB, capA | timeup, capB | timeup, tA, tB)
        return dict(xa=xa, xb=xb, ma=ma, mb=mb, ua=ua, ub=ub, win=win, done=done, qa=qa, qb=qb, va=vA, vb=vB)


def pol_never(x, v): return np.zeros(len(x), np.int32)
def pol_random(x, v):
    r = np.random.rand(*v.shape) * v; return r.argmax(1).astype(np.int32)       # uniformly among the sensible actions
def pol_rule(duel_side):
    """the old rule: the front item at once, on me if clearly helpful (SELF_RULE), else at the opponent"""
    def f(x, v):
        front = duel_side.qpos()[:, 0]; a = np.where(front == 0, 0, np.where(np.isin(front, list(SELF_RULE)), 1, 2)).astype(np.int32)
        return np.where(v[np.arange(len(a)), a], a, 0).astype(np.int32)
    return f
def pol_net(net, dev, eps=0.0):
    @torch.no_grad()
    def f(x, v):
        q = net(torch.from_numpy(x).to(dev)).cpu().numpy(); q[~v] = -1e9
        a = q.argmax(1).astype(np.int32)
        if eps > 0:
            r = np.random.rand(len(x)) < eps
            if r.any(): a[r] = pol_random(x[r], v[r])
        return a
    return f


def evaluate(duel, polA, polB, games=200, maxdec=600):
    """win / lose / draw of A against B over `games` finished duels"""
    res = collections.Counter(); lens = []
    done_games = 0; t0 = time.time()
    duel.reset_done(np.ones(duel.n, bool))
    while done_games < games:
        r = duel.round(polA, polB)
        d = r['done']
        for i in np.nonzero(d)[0]:
            res[int(r['win'][i])] += 1; lens.append(int(duel.dec[i])); done_games += 1
        duel.reset_done(d)
    tot = sum(res.values())
    return dict(win=res[1] / tot, lose=res[-1] / tot, draw=res[0] / tot, games=tot, mean_len=float(np.mean(lens)))


def main():
    """evaluation of the reference policies against the old rule (training is in duel_ppo.py)"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--placement", required=True); ap.add_argument("--n", type=int, default=96); ap.add_argument("--item_scale", type=int, default=8)
    ap.add_argument("--maxdec", type=int, default=500); ap.add_argument("--games", type=int, default=100); ap.add_argument("--placement_b", default="")
    a = ap.parse_args(); dev = torch.device("cuda")
    duel = Duel(a.n, a.placement, dev, item_scale=a.item_scale, maxdec=a.maxdec, placement_b=a.placement_b or None)
    for name, pol in (("never", pol_never), ("random", pol_random), ("rule", pol_rule(duel.A))):
        r = evaluate(duel, pol, pol_rule(duel.B), a.games); print(f"A={name:8s} vs B=rule : {r}", flush=True)


if __name__ == "__main__":
    main()
