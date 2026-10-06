#!/bin/bash
# after training: evaluate (one episode per env, normal item frequency) and export the better checkpoint to the web build
cd /home/a/Desktop/stuff/polycube/polynomino/training
while pgrep -f "out runs/v6" > /dev/null; do sleep 30; done
best=runs/v6/last.pt; bm=-1
for ck in runs/v6/last.pt runs/v6/best.pt; do
  [ -f "$ck" ] || continue
  m=$(python3.12 eval_policy.py --ckpt $ck --envs 200 2>&1 | tee -a finish_v6_eval.log | sed -n 's/.*survival: mean \([0-9]*\) pieces.*/\1/p')
  echo "$ck -> mean $m" >> finish_v6.log
  if [ -n "$m" ] && [ "$m" -gt "$bm" ]; then bm=$m; best=$ck; fi
done
python3.12 export_model.py --ckpt $best >> finish_v6.log 2>&1
echo "exported $best (mean $bm)" >> finish_v6.log
