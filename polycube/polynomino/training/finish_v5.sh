#!/bin/bash
# wait for the v5 training to end, evaluate best/last at normal item frequency, export the better one to the web build
cd /home/a/Desktop/stuff/polycube/polynomino/training
while pgrep -f "out runs/v5" > /dev/null; do sleep 30; done
best=runs/v5/last.pt; bm=-1
for ck in runs/v5/last.pt runs/v5/best.pt; do
  [ -f "$ck" ] || continue
  m=$(python3.12 eval_policy.py --ckpt $ck --episodes 150 --envs 150 2>&1 | tee -a finish_v5_eval.log | sed -n 's/.*survival: mean \([0-9]*\) pieces.*/\1/p')
  echo "$ck -> mean $m" >> finish_v5.log
  if [ -n "$m" ] && [ "$m" -gt "$bm" ]; then bm=$m; best=$ck; fi
done
python3.12 export_model.py --ckpt $best >> finish_v5.log 2>&1
echo "exported $best (mean $bm)" >> finish_v5.log
