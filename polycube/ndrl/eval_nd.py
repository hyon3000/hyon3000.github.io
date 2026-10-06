"""Greedy evaluation of a checkpoint: one game per env (unbiased), survival / lines / score."""
import argparse, numpy as np, torch
from simnd import VecEnv, DIM
from rnnnet import RNet, GreedyAgent
ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", required=True); ap.add_argument("--episodes", type=int, default=64); ap.add_argument("--maxpieces", type=int, default=1000000000)
ap.add_argument("--minutes", type=float, default=30, help="time limit of the evaluation")
ap.add_argument("--budget", type=int, default=2000000, help="total blocks to play over all games (renewal evaluation)")
ap.add_argument("--noitems", action="store_true"); ap.add_argument("--seed", type=int, default=99); ap.add_argument("--nomemory", action="store_true")
a = ap.parse_args()
dev = torch.device("cuda"); net = RNet().to(dev); net.load_state_dict(torch.load(a.ckpt)); net.eval()
env = VecEnv(a.episodes, a.seed, items=not a.noitems); N = a.episodes
agent = GreedyAgent(net, N, dev, memory=not a.nomemory)
# Renewal evaluation (no block limit): every env plays on, a dead game is replaced by a fresh one at once. After a total budget of blocks
# the death rate per block p = deaths / blocks is measured; the expected survival is 1 / p blocks (exact for a constant death rate).
import time; t0 = time.time(); blocks = 0; deaths = 0; eps = []; sc = ln = 0.0
while blocks < a.budget and time.time() - t0 < a.minutes * 60:
    ep = env.step(agent.act(env), a.maxpieces); blocks += N; last = ep.copy()
    for e in ep:
        if e[0] > 0: deaths += 1; eps.append(e.copy()); sc += e[1]; ln += e[2]
def poisson_ci(d):
    try:
        from scipy.stats import chi2
        return (chi2.ppf(0.025, 2 * d) / 2 if d > 0 else 0.0), chi2.ppf(0.975, 2 * (d + 1)) / 2
    except Exception:
        return max(0.0, d - 1.96 * d ** 0.5), d + 1.96 * (d + 1) ** 0.5 + 1
lo, hi = poisson_ci(deaths)
sc += sum(e[1] for e in last if e[0] == 0); ln += sum(e[2] for e in last if e[0] == 0)      # (the games still running count with what they have so far)
print(f"DIM {DIM} {'NOITEMS' if a.noitems else 'ITEMS'} {a.ckpt}: {blocks} blocks played in {(time.time()-t0)/60:.1f} min, {deaths} deaths")
print(f"SCORE per block {sc/blocks:.2f}  (score per 1000 blocks {1000*sc/blocks:.0f}), lines per block {ln/blocks:.3f}")
if deaths:
    print(f"death rate {deaths/blocks:.2e} per block -> expected survival {blocks/deaths:.0f} blocks  (95% interval {blocks/hi:.0f} .. {blocks/lo if lo > 0 else float('inf'):.0f})")
    E = np.array(eps); print(f"finished games: mean {E[:,3].mean():.0f} blocks, median {np.median(E[:,3]):.0f}, longest {E[:,3].max():.0f}; mean lines {E[:,2].mean():.0f}, mean score {E[:,1].mean():.0f}")
else:
    print(f"no death in {blocks} blocks: expected survival above {blocks/hi:.0f} blocks (95%)")
