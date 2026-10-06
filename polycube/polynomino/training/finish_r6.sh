#!/bin/bash
# after training: evaluate (one game per env, normal item frequency), with and without the memory, export the better checkpoint
cd /home/a/Desktop/stuff/polycube/polynomino/training
while pgrep -f "out runs/r6" > /dev/null; do sleep 30; done
best=runs/r6/last.pt; bm=-1
for ck in runs/r6/last.pt runs/r6/best.pt; do
  [ -f "$ck" ] || continue
  m=$(python3.12 eval_policy.py --ckpt $ck --envs 200 2>&1 | tee -a finish_r6_eval.log | sed -n 's/.*survival: mean \([0-9]*\) pieces.*/\1/p')
  echo "$ck -> mean $m" >> finish_r6.log
  if [ -n "$m" ] && [ "$m" -gt "$bm" ]; then bm=$m; best=$ck; fi
done
python3.12 eval_policy.py --ckpt $best --envs 200 --nomemory 2>&1 | sed -n 1,3p >> finish_r6.log
python3.12 export_model.py --ckpt $best >> finish_r6.log 2>&1
echo "exported $best (mean $bm)" >> finish_r6.log
