"""Which item groups hurt? Same checkpoint, greedy play, item groups switched on one at a time / left out one at a time."""
import argparse, numpy as np, torch
from simlib import VecEnv
from rnnnet import RNet, GreedyAgent

GROUPS = ["bombs", "+lines (117,125)", "obstacles (11)", "shuffles (hole,zigzag,mirror,item-clear)", "timing/visibility (speed,blind,locks,hide)",
          "piece-size (simplify,penta,mono-only)", "-lines (116,124)", "range delete (118)", "top clear / row del / FULL CLEAR (102,126,119)",
          "gap clear (20)", "score x4 / reinforce (4,204)", "special mono (cancel,pierce,self-destruct)"]
ALL = (1 << len(GROUPS)) - 1
ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="runs/r1/last.pt")
ap.add_argument("--episodes", type=int, default=120)
ap.add_argument("--maxpieces", type=int, default=1500)
ap.add_argument("--loo", action="store_true", help="also leave-one-out")
a = ap.parse_args()
dev = torch.device("cuda")
net = RNet().to(dev); net.load_state_dict(torch.load(a.ckpt)); net.eval()

def run(items, mask, seed=7):
    env = VecEnv(a.episodes, seed, items=items)
    if items: env.set_item_mask(mask)
    res = []; agent = GreedyAgent(net, a.episodes, dev); seen = np.zeros(a.episodes, bool)
    while not seen.all():
        act = agent.act(env)
        ep = env.step(act, a.maxpieces)
        for i, e in enumerate(ep):
            if e[0] > 0 and not seen[i]: seen[i] = True; res.append((e[3], e[0] == 2))   # one game per env (no short-game bias)
    r = np.array(res); return r[:, 0].mean(), (r[:, 1]).mean()

print(f"checkpoint {a.ckpt}, {a.episodes} episodes, cap {a.maxpieces} pieces\n")
base_none = run(False, 0); print(f"{'NO items':<55} mean {base_none[0]:6.0f}  reached cap {base_none[1]*100:3.0f}%", flush=True)
base_all = run(True, ALL); print(f"{'ALL items':<55} mean {base_all[0]:6.0f}  reached cap {base_all[1]*100:3.0f}%", flush=True)
print("\n-- only ONE group switched on --")
for g, nm in enumerate(GROUPS):
    m, c = run(True, 1 << g); print(f"{nm:<55} mean {m:6.0f}  reached cap {c*100:3.0f}%   loss vs no-items {base_none[0]-m:6.0f}", flush=True)
if a.loo:
    print("\n-- ALL groups except one --")
    for g, nm in enumerate(GROUPS):
        m, c = run(True, ALL & ~(1 << g)); print(f"{nm:<55} mean {m:6.0f}  reached cap {c*100:3.0f}%   gain vs all-items {m-base_all[0]:6.0f}", flush=True)
