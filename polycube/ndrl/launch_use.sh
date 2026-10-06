#!/bin/bash
# waits for the behaviour cloning of the item-use net, then starts PPO (DIM=$1, placement ckpt $2, extra env in the rest)
D=$1; CK=$2; shift 2
until grep -q "^saved" bcu$D.log || grep -q "Traceback" bcu$D.log; do sleep 15; done
grep -q "^saved" bcu$D.log || exit 1
env DIM=$D "$@" nohup python3.12 duel_ppo.py --placement $CK --init runs/use$D/bc.pt --out runs/use${D}p --n 64 --maxdec 400 --soft 0.15 --ent 0.02 --minutes 150 --eval_every 12 > use${D}p.log 2>&1
