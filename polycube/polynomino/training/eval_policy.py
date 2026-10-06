"""Evaluate a checkpoint greedily in the simulator and report survival + how items are handled."""
import argparse, collections, numpy as np, torch
from simlib import VecEnv, NF
from rnnnet import RNet, GreedyAgent, SearchAgent, Search3Agent

NAMES = {1: "self-destruct", 2: "conceal", 4: "score x4", 5: "item clear", 6: "hide next", 8: "speed up", 9: "speed down", 10: "hold lock",
         11: "obstacles", 16: "BLIND", 17: "bomb x5", 18: "hole 30%", 19: "zigzag", 20: "gap clear", 21: "simplify", 22: "penta force",
         30: "pierce", 31: "cancel", 91: "rot lock", 102: "top clear", 104: "mono only", 116: "-2 lines", 117: "+2 lines", 118: "range del",
         119: "FULL CLEAR", 120: "bomb t3", 121: "bomb t2", 122: "bomb t1", 123: "bomb t0", 124: "-3 lines", 125: "+1 line", 126: "row del",
         127: "bomb convert", 200: "mirror", 204: "reinforce"}
GOOD = {1, 4, 9, 20, 21, 30, 31, 102, 104, 116, 117, 118, 119, 124, 125, 126, 204}

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="runs/r1/last.pt")
ap.add_argument("--episodes", type=int, default=150)
ap.add_argument("--envs", type=int, default=150)
ap.add_argument("--maxpieces", type=int, default=1000000000)
ap.add_argument("--minutes", type=float, default=30, help="time limit of the evaluation")
ap.add_argument("--budget", type=int, default=1000000, help="total blocks to play over all games (renewal evaluation)")
ap.add_argument("--noitems", action="store_true")
ap.add_argument("--crisis", type=float, default=-1, help="diagnostic: start every game on a bad board (probability)")
ap.add_argument("--crisis_hold", type=float, default=0.0, help="...with a pierce piece in the hold (probability)")
ap.add_argument("--depth3", type=int, default=0, help="3-ply search: follow-ups kept per parent (0 = 2-ply)")
ap.add_argument("--crisis_type", type=int, default=30, help="special piece in the hold of a crisis start: 30 pierce, 31 cancel, 1 self-destruct")
ap.add_argument("--crisis_base", type=int, default=9, help="start height of bad boards")
ap.add_argument("--search", type=int, default=0, help="2-ply search over the K best candidates (0 = greedy)")
ap.add_argument("--gap", type=int, default=200, help="ms between inputs (diagnostic; the web AI uses 200)")
ap.add_argument("--nomemory", action="store_true", help="ablation: switch the recurrent memory off at inference")
ap.add_argument("--seed", type=int, default=99)
a = ap.parse_args()
dev = torch.device("cuda")
import simlib; simlib.set_input_gap(a.gap); simlib.set_crisis_height(a.crisis_base, 4); simlib.set_crisis_hold_type(a.crisis_type)
net = RNet().to(dev); net.load_state_dict(torch.load(a.ckpt)); net.eval()
env = VecEnv(a.envs, a.seed, items=not a.noitems)
if a.crisis >= 0: env.set_curriculum(a.crisis, a.crisis_hold, 0.0); env.reset_all()
N = a.envs; done_eps = []; steps = 0
agent = (Search3Agent(net, N, dev, K=a.search, K2=a.depth3, memory=not a.nomemory) if a.depth3 else SearchAgent(net, N, dev, K=a.search, memory=not a.nomemory)) if a.search else GreedyAgent(net, N, dev, memory=not a.nomemory)
# Renewal evaluation (no block limit): every env plays on, a dead game is replaced by a fresh one at once. After a total budget of blocks the death
# rate per block p = deaths / blocks is measured; the expected survival is 1 / p blocks (exact for a constant death rate).
import time; t0 = time.time(); blocks = 0; deaths = 0; sc_tot = 0.0
while blocks < a.budget and time.time() - t0 < a.minutes * 60:
    act = agent.act(env)
    ep = env.step(act, a.maxpieces); steps += N; blocks += N; last = ep.copy()
    for e in ep:
        if e[0] > 0: deaths += 1; done_eps.append(e.copy()); sc_tot += e[1]
def poisson_ci(d):
    try:
        from scipy.stats import chi2
        return (chi2.ppf(0.025, 2 * d) / 2 if d > 0 else 0.0), chi2.ppf(0.975, 2 * (d + 1)) / 2
    except Exception:
        return max(0.0, d - 1.96 * d ** 0.5), d + 1.96 * (d + 1) ** 0.5 + 1
lo, hi = poisson_ci(deaths)
sc_tot += sum(e[1] for e in last if e[0] == 0)      # (the games still running count with what they have so far)
print(f"{blocks} blocks played in {(time.time()-t0)/60:.1f} min, {deaths} deaths")
print(f"SCORE per block {sc_tot/blocks:.2f}  (score per 1000 blocks {1000*sc_tot/blocks:.0f})")
if deaths: print(f"death rate {deaths/blocks:.2e} per block -> expected survival {blocks/deaths:.0f} blocks  (95% interval {blocks/hi:.0f} .. {blocks/lo if lo > 0 else float('inf'):.0f})")
else: print(f"no death in {blocks} blocks: expected survival above {blocks/hi:.0f} blocks (95%)")
if not done_eps: raise SystemExit
E = np.array(done_eps)
st = env.stats(); pieces_total = E[:, 3].sum()
print(f"{'NOITEMS' if a.noitems else 'ITEMS'} ckpt={a.ckpt} episodes={len(E)}")
print(f" survival: mean {E[:,3].mean():.0f} pieces, median {np.median(E[:,3]):.0f}, reached cap {a.maxpieces}: {(E[:,0]==2).mean()*100:.0f}%, "
      f"mean lines {E[:,2].mean():.0f}, mean score {E[:,1].mean():.0f}")
print(" milestones (games reaching N lines before dying or the cap):", {m: f"{np.mean(E[:,2] >= m)*100:.0f}%" for m in (100, 500, 1000, 2000)})
lv = st[560:577]; tot = max(1, lv.sum())
print(" level at death:", {i: int(lv[i]) for i in range(1, 17) if lv[i]})
per = 1000.0 / max(1, pieces_total)
print(f" per 1000 pieces: bomb explosions {st[256]*per:.1f}, garbage rows added {st[257]*per:.1f}, rows removed by -lines items {st[258]*per:.1f}, full lines {st[259]*per:.1f}")
if not a.noitems:
    print(" item            placed  triggered  trig/placed  (good?)")
    rows = []
    for c in range(1, 256):
        pl, tr = st[300 + c], st[c]
        if pl >= 20: rows.append((pl, c, tr))
    for pl, c, tr in sorted(rows, reverse=True):
        print(f"  {NAMES.get(c, c):<14}{pl:>7}{tr:>10}{tr/pl:>12.2f}   {'good' if c in GOOD else 'bad'}")

# ---- what kills the agent? state at death vs. how often that state occurs at all ----
names = ["speed-up", "speed-down", "BLIND", "hide-next", "rot-lock", "hold-lock", "mono-only", "simplify", "penta-force", "reinforce",
         "bomb-next", "bomb exploded <=10 ago", "garbage rows <=10 ago", "level 16"]
deaths, decs = st[600], max(1, st[619])
print(f" deaths analysed: {deaths}; decisions observed: {decs}")
print(" state at death        P(state|death)  P(state|any time)  risk ratio")
for k, nm in enumerate(names):
    pd, pa = st[601 + k] / max(1, deaths), st[620 + k] / decs
    print(f"  {nm:<22}{pd:>10.2f}{pa:>17.2f}{(pd / pa if pa > 0 else float('nan')):>12.2f}")
tot = max(1, st[700:704].sum())
print(f" chosen plan outcome: done {st[700]/tot:.3f}  invalid {st[701]/tot:.3f}  cut short by gravity {st[702]/tot:.3f}  dead {st[703]/tot:.4f}")
for nm, base in (("speed-up active", 710), ("speed-down active", 715)):
    t2 = st[base:base + 4].sum()
    if t2: print(f"   while {nm}: done {st[base]/t2:.3f}  invalid {st[base+1]/t2:.3f}  cut short {st[base+2]/t2:.3f}  dead {st[base+3]/t2:.4f}  ({t2} decisions)")

# ---- pierce pieces: held for later, and used when the board is bad? ----
cur, held, inhold, usedh, used, used_hi, hsum, hn, uh_sum = st[730], st[731], st[732], st[733], st[735], st[738], st[736], max(1, st[737]), st[734]
print(f" pierce pieces: falling at {cur} decisions, swapped into the hold at {held} ({held/max(1,cur)*100:.0f}%)")
print(f"   waiting in the hold at {inhold} decisions; used straight out of the hold {usedh}x; total uses {used}")
if used:
    print(f"   board height when a pierce piece is used: mean {uh_sum/used:.1f} rows (any decision: {hsum/hn:.1f}); used at >=14 rows: {used_hi/used*100:.0f}%")

# ---- anatomy of the deaths ----
nd = max(1, st[741])
print(f" deaths analysed (>=45 decisions old): {st[741]}")
print(f"   stack height 40 decisions before death {st[742]/nd:.1f} rows -> at death {st[743]/nd:.1f} rows; holes {st[745]/nd:.1f} -> {st[744]/nd:.1f}")
print(f"   sudden jump of >=4 rows in one decision within the last 20: {st[740]/nd*100:.0f}% of deaths (mean largest jump {st[746]/nd:.1f}); "
      f"healthy (<=10 rows) 40 decisions earlier: {st[747]/nd*100:.0f}%; holes grew by >=8: {st[748]/nd*100:.0f}%")
