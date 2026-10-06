#!/bin/bash
cd /home/a/Desktop/stuff/polycube/ndrl
while kill -0 2283652 2>/dev/null; do sleep 20; done
sleep 5
DIM=4 PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True python3.12 train_nd.py --envs 64 --minutes 420 --out runs/p4a --eps_steps 1.5e6 --batch 32 --maxpieces 1500 --capacity 3000 > runs_p4a.log 2>&1
