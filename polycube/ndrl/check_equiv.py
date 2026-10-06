import numpy as np, collections
from simnd import *
n=int(__import__("sys").argv[1]) if len(__import__("sys").argv)>1 else 24; env=VecEnv(n,5); rng=np.random.default_rng(1); bad=collections.Counter(); tot=0
for it in range(int(__import__("sys").argv[2]) if len(__import__("sys").argv)>2 else 120):
    env.gen()
    for i in range(n):
        for k in rng.choice(env.counts[i], size=min(6,env.counts[i]), replace=False):
            r=env.check_equiv(i,int(k)); tot+=1
            if r: bad[r]+=1
    live=(np.arange(MAXC)[None]<env.counts[:,None])&(env.done==0)
    act=np.array([rng.choice(np.nonzero(live[i])[0]) if live[i].any() else 0 for i in range(n)],np.int32)
    env.step(act,3000)
print("checked",tot,"mismatch",dict(bad))
