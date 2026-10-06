#!/bin/bash
cd /home/a/Desktop/stuff/polycube/polynomino/training
i=0
for cfg in "A2 0.99 1" "B2 0.99 10" "C2 0.997 10"; do
  set -- $cfg
  nohup python3.12 train.py --minutes 4 --envs 256 --out runs/$1 --gamma $2 --nstep $3 --item_scale0 1 --eps_steps 1e6 > exp$1.log 2>&1 &
done
wait
