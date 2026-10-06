"""Print what the agent actually does: ASCII boards of a game + 'how sloppy is it' statistics."""
import sys, numpy as np, torch
import simlib
from simlib import VecEnv
from rnnnet import RNet, GreedyAgent, SearchAgent
ckpt = sys.argv[1] if len(sys.argv) > 1 else "runs/e1/chk60.pt"
search = int(sys.argv[2]) if len(sys.argv) > 2 else 5
dev = torch.device("cuda")
net = RNet().to(dev); net.load_state_dict(torch.load(ckpt)); net.eval()
N = 24
env = VecEnv(N, 11, items=True)
agent = SearchAgent(net, N, dev, K=search) if search else GreedyAgent(net, N, dev)
holes, bump, maxh, avoid, moves, holds, plen, newholes_total = [], [], [], 0, 0, 0, [], 0
shown = 0
for t in range(700):
    act = agent.act(env)            # env.gen() was called inside
    # features of the chosen candidate: [348]=holes/20, [349]=bumpiness/40, [350]=maxh/20 (after the plan)
    f = env.feats
    for i in range(N):
        k = act[i]
        if env.done[i, k]: continue
        h_after = f[i, k, 348] * 20
        alive = [q for q in range(env.counts[i]) if not env.done[i, q]]
        best_h = min(f[i, q, 348] * 20 for q in alive)
        holes.append(h_after); bump.append(f[i, k, 349] * 40); maxh.append(f[i, k, 350] * 20)
        moves += 1; holds += int(env.info[i, k, 0])
        if h_after > best_h + 0.5: avoid += 1          # a placement with fewer holes existed
        plen.append(1 + env.info[i, k, 0] + env.info[i, k, 1] + abs(env.info[i, k, 2]))
    env.step(act)
holes, bump, maxh = map(np.array, (holes, bump, maxh))
print(f"decisions {moves}: mean holes on the board {holes.mean():.1f}, bumpiness {bump.mean():.1f}, stack height {maxh.mean():.1f}")
print(f"  boards with >=10 holes: {np.mean(holes >= 10)*100:.0f}%, with <=2 holes: {np.mean(holes <= 2)*100:.0f}%")
print(f"  chose a placement that leaves more holes although a hole-free-er one existed: {avoid/moves*100:.0f}% of decisions")
print(f"  hold used in {holds/moves*100:.0f}% of decisions; inputs per piece {np.mean(plen):.1f}")
