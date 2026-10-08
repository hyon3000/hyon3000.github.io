"""Headless-Firefox environment for the SpaceCadetPinball web build with a virtual clock (harness.html) - see README at the top of train.py.
Observation: PinballAI features (ball x, y, 2 velocity steps, previous action, score gain), read from the wasm heap; 4 actions (flipper combos); decision every 4 frames."""
import time
import numpy as np
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

URL = 'http://127.0.0.1:8765/harness.html'
NOBS = 12
NACT = 4


class Env:
    def __init__(self, url=URL):
        o = Options(); o.add_argument('-headless')
        self.d = webdriver.Firefox(options=o)
        self.d.set_script_timeout(120); self.url = url
        self.frames = 0
        self.load()

    def load(self):
        self.d.get(self.url)
        t = time.time()
        while not self.d.execute_script('return PB.hasLoop()'):
            time.sleep(0.2)
            if time.time() - t > 60: raise RuntimeError('game did not start')
        self.d.execute_script('PB.step(420);')
        if not self.d.execute_script('return E.init()'): raise RuntimeError('ball record not found')
        self.over_pending = False
        self.score = 0; self.game_scores = []; self.ep_ret = 0
        r = self.d.execute_script('return E.first()')
        self._take(r)
        return self.obs

    def _take(self, r):
        self.frames += r.get('frames', 0)
        if r.get('timeout'):
            raise RuntimeError('timeout %s' % r)
        self.obs = np.array(r['obs'], np.float32) if r['obs'] is not None else None
        self.rscore = r['score']; self.done = r['done']; self.over = r['over']; self.stuck = r['stuck']
        return r

    def step(self, a):
        """returns obs, score_delta, done(ball lost), over(game over). After done the next live obs is fetched automatically (obs returned is of the NEW ball)."""
        prev = self.score
        r = self.d.execute_script('return E.step(arguments[0])', int(a))
        self._take(r)
        self.score = self.rscore
        dsc = self.score - prev
        done, over = self.done, self.over
        if done:
            if over:
                self.game_scores.append(self.score)
            r2 = self.d.execute_script('return E.next(arguments[0])', 1 if over else 0)
            self._take(r2)
            self.score = 0 if over else self.rscore
            if r2.get('done'):                     # ball vanished again immediately (should not happen)
                pass
        return self.obs, dsc, bool(done), bool(over)

    def close(self):
        try: self.d.quit()
        except Exception: pass
