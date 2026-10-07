import sys, os, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env2048 import all_moves, spawn, new_boards, spawn_count
from net2048 import Net
def evaluate(ck, H, W, n=256, maxmoves=4000):
    c = torch.load(ck, map_location="cuda"); net = Net(c["ch"], c["layers"]).cuda(); net.load_state_dict(c["net"]); net.eval()
    b = new_boards(n, H, W, "cuda"); alive = torch.ones(n, dtype=torch.bool, device="cuda"); score = torch.zeros(n, device="cuda"); mx = torch.zeros(n, device="cuda"); sp = spawn_count(H, W)
    for t in range(maxmoves):
        bs, re, sc, lg = all_moves(b)
        with torch.no_grad(): v = net(bs.flatten(0, 1)).view(4, n)
        q = torch.where(lg, re * 0.1 + 0.99 * v, torch.full_like(v, -1e9)); act = q.argmax(0); term = ~lg.any(0)
        ar = torch.arange(n, device="cuda"); score += torch.where(alive & ~term, sc[act, ar], torch.zeros_like(score))
        alive &= ~term
        if not alive.any(): break
        nb = spawn(bs[act, ar].clone(), sp); b = torch.where(alive[:, None, None], nb, b)
        mx = torch.maximum(mx, b.flatten(1).amax(1).float())
    return score.mean().item(), (mx >= 11).float().mean().item(), mx.median().item(), int((~alive).sum())
for ck in sys.argv[1:]:
    for H, W in [(4, 4), (6, 6)]:
        s, w, m, dead = evaluate(ck, H, W, 256 if H == 4 else 64, 4000 if H == 4 else 1500)
        print(f"{ck} {H}x{W}: avg score {s:.0f}  reached 2048: {w*100:.0f}%  median max tile 2^{int(m)}  (games ended: {dead})", flush=True)
