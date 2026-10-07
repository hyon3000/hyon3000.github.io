import argparse, os, sys, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env2d import Env2D, OBS, NBINS
from ppo import Net, train
ap = argparse.ArgumentParser(); ap.add_argument("--minutes", type=float, default=30); ap.add_argument("--envs", type=int, default=2048); ap.add_argument("--out", default="runs/b2d"); ap.add_argument("--resume", default="")
a = ap.parse_args(); os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
env = Env2D(a.envs, "cuda"); net = Net(OBS, [NBINS]).cuda()
if a.resume: net.load_state_dict(torch.load(a.resume))
train(env, net, a.minutes, a.out, make_act=lambda act: act[:, 0])
