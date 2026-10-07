"""Batched torch re-implementation of the 2D Atari Breakout physics (../breakout2d.js) for reinforcement learning.
One decision = 1/20 s = 12 physics sub-steps of 1/240 s (like the game).  The policy picks a TARGET x for the paddle (21 bins); the paddle follows it like the game does
(x += (target - x) * min(1, 40 dt) per 1/60 s frame).  Items are not simulated, but the paddle length and the ball speed are randomised so the policy copes with them.
Score: +2 per hit, +100 per cleared row, one ball only (a fallen ball ends the episode).  The reward is the score change / 20 minus a penalty when the ball falls."""
import math
import torch

FW, FH = 100.0, 130.0
COLS, ROWS = 10, 5
BW, BH, TOP = 10.0, 4.4, 12.0
PY, PH, R = FH - 9.0, 2.4, 1.6
NBINS = 41                      # the action = the offset t (-1 .. 1) on the paddle where the ball should land: the ball leaves at the angle 62 deg * t (3 deg steps)
OBS = 8 + ROWS * COLS


def new_rows(n, below, level, dev):
    """a random row per env: hits (0 = empty); multi-hit bricks (2 / 3 / 5 hits) come in clusters (like the game).  below: (n, COLS) hits of the row beneath or None"""
    out = torch.zeros(n, COLS, device=dev)
    left_t = torch.zeros(n, device=dev, dtype=torch.bool)
    base = torch.tensor([0.07 + 0.005 * level, 0.5, 0.66, 0.8], device=dev)
    for c in range(COLS):
        present = torch.rand(n, device=dev) < 0.92
        nb = left_t.long()
        if below is not None:
            nb = nb + (below[:, c] > 1).long()
        tough = torch.rand(n, device=dev) < (base[nb.clamp(max=3)] * (1 + 0.06 * (level - 1))).clamp(max=0.92)
        q = torch.rand(n, device=dev)
        th = torch.where(q < 0.5, 2.0, torch.where(q < 0.8, 3.0, 5.0))
        out[:, c] = torch.where(present, torch.where(tough, th, torch.ones(n, device=dev)), torch.zeros(n, device=dev))
        left_t = present & tough
    return out


class Env2D:
    def __init__(self, B, dev="cuda", max_steps=1600):
        self.B, self.dev, self.max_steps = B, dev, max_steps
        z = lambda: torch.zeros(B, device=dev)
        self.x, self.y, self.vx, self.vy = z(), z(), z(), z()
        self.px, self.pw, self.speed, self.t = z(), z(), z(), z()
        self.phi = z()
        self.last_act = torch.full((B,), NBINS // 2, device=dev, dtype=torch.long); self.decided = torch.zeros(B, dtype=torch.bool, device=dev)
        self.hits = torch.zeros(B, ROWS, COLS, device=dev)
        self.ar = torch.arange(B, device=dev)
        self.reset(torch.ones(B, dtype=torch.bool, device=dev))

    # ---------------------------------------------------------------- reset
    def reset(self, m):
        idx = m.nonzero()[:, 0]
        n = idx.numel()
        if n == 0:
            return
        dev = self.dev
        level = int(torch.randint(1, 9, (1,)).item())
        rows = [None] * ROWS
        below = None
        for r in range(ROWS - 1, -1, -1):
            rows[r] = new_rows(n, below, level, dev)
            below = rows[r]
        self.hits[idx] = torch.stack(rows, 1)
        self.pw[idx] = torch.where(torch.rand(n, device=dev) < 0.5, torch.empty(n, device=dev).uniform_(9.0, 38.0), torch.full((n,), 19.0, device=dev))
        self.speed[idx] = torch.empty(n, device=dev).uniform_(70.0, 135.0)
        self.px[idx] = torch.empty(n, device=dev).uniform_(20.0, 80.0)
        a = (torch.rand(n, device=dev) * 40 - 20) * math.pi / 180
        self.x[idx] = self.px[idx]
        self.y[idx] = PY - R
        self.vx[idx] = self.speed[idx] * torch.sin(a)
        self.vy[idx] = -self.speed[idx] * torch.cos(a)
        self.t[idx] = 0
        # curriculum: most episodes start with a channel already dug through one column (the ball can then get BEHIND the bricks and clear them from above)
        dig = torch.rand(n, device=dev) < 0.8
        col = torch.randint(0, COLS, (n,), device=dev)
        depth = torch.where(torch.rand(n, device=dev) < 0.6, torch.full((n,), ROWS, device=dev), torch.randint(1, ROWS, (n,), device=dev))
        for r in range(ROWS):
            cut = dig & (r >= ROWS - depth)
            self.hits[idx[cut], r, col[cut]] = 0
        self.phi[idx] = self.channel()[idx]
        self.last_act[idx] = NBINS // 2
        self.decided[idx] = False

    def channel(self):
        """how far the best column is dug from the bottom row upwards (0 .. 1)"""
        nz = (self.hits.flip(1) > 0)
        depth = torch.where(nz.any(1), nz.float().argmax(1).float(), torch.full((self.B, COLS), float(ROWS), device=self.dev))
        return depth.max(1).values / ROWS

    # ---------------------------------------------------------------- observation
    def landing(self):
        """x where the ball reaches the paddle line (straight flight + wall bounces, bricks ignored) and the time it takes"""
        vy = self.vy
        tt = torch.where(vy > 0.5, (PY - R - self.y) / vy.clamp(min=0.5), torch.zeros_like(vy))
        xx = self.x + self.vx * tt - R
        span = FW - 2 * R
        m = torch.remainder(xx, 2 * span)
        xl = torch.where(m > span, 2 * span - m, m) + R
        xl = torch.where(vy > 0.5, xl, self.x)
        return xl, tt

    def obs(self):
        xl, tt = self.landing()
        return torch.cat([torch.stack([self.x / FW, self.y / FH, self.vx / self.speed, self.vy / self.speed, self.px / FW, self.pw / 40.0, xl / FW, (tt / 3.0).clamp(max=1.0)], 1),
                          (self.hits / 5.0).flatten(1)], 1)

    # ---- decision points: the policy chooses the aim (the offset t) once per descent of the ball (when it is 0.6 s from the paddle); in between the last choice stays
    def needs_decision(self):
        _, tt = self.landing()
        return (self.vy > 0.5) & (tt <= 0.6) & ~self.decided

    def commit(self, m, act):
        self.last_act = torch.where(m, act, self.last_act)
        self.decided = (self.decided | m) & (self.vy > 0.5)

    def expert(self):
        """scripted player used to warm-start the policy: always aim the ball at the best column to dig (the one that is open deepest from the bottom, nearest to where the ball comes down):
        once a column is open the ball slips through, gets behind the bricks and clears them from above.  Returns the action (bin of the offset t)."""
        nz = self.hits > 0
        rr = torch.arange(ROWS, device=self.dev).float()[None, :, None].expand(self.B, ROWS, COLS)
        low = torch.where(nz, rr, torch.full_like(rr, -1.0)).max(1).values                  # lowest brick row per column (-1: column empty)
        depth = ROWS - 1 - low                                                              # empty cells from the bottom
        xl, _ = self.landing()
        cxs = (torch.arange(COLS, device=self.dev).float() + 0.5) * BW
        score = depth * 10.0 - (cxs[None, :] - xl[:, None]).abs() * 0.05
        c = score.argmax(1)
        lowc = low[self.ar, c]
        ytar = TOP + (lowc + 1.0) * BH
        tan = (cxs[c] - xl) / (PY - ytar)
        t = (torch.atan(tan) / (62 * math.pi / 180)).clamp(-1, 1)
        return ((t + 1) / 2 * (NBINS - 1)).round().long()

    def target(self, act):
        xl, _ = self.landing()
        t = -1.0 + 2.0 * act.float() / (NBINS - 1)
        return torch.minimum(torch.maximum(xl - t * self.pw / 2, self.pw / 2), FW - self.pw / 2)

    # ---------------------------------------------------------------- physics
    def _cells(self, x, y):
        c0 = torch.floor((x - R) / BW).clamp(0, COLS - 1).long()
        c1 = torch.floor((x + R) / BW).clamp(0, COLS - 1).long()
        r0 = torch.floor((y - R - TOP) / BH).clamp(0, ROWS - 1).long()
        r1 = torch.floor((y + R - TOP) / BH).clamp(0, ROWS - 1).long()
        return torch.stack([r0, r0, r1, r1], 1), torch.stack([c0, c1, c0, c1], 1)

    def _ball_hits_grid(self, hits, x, y, margin):
        cx = (torch.arange(COLS, device=self.dev).float() + 0.5) * BW
        cy = TOP + (torch.arange(ROWS, device=self.dev).float() + 0.5) * BH
        dx = (x[:, None, None] - cx[None, None, :]).abs() - BW / 2
        dy = (y[:, None, None] - cy[None, :, None]).abs() - BH / 2
        d2 = dx.clamp(min=0) ** 2 + dy.clamp(min=0) ** 2
        return ((d2 < margin ** 2) & (hits > 0)).flatten(1).any(1)

    def step(self, act):
        """act: (B,) long.  returns obs, reward, done, info(score delta, rows cleared)"""
        B, dev, ar = self.B, self.dev, self.ar
        tgt = self.target(act)
        score = torch.zeros(B, device=dev)
        rows_cleared = torch.zeros(B, device=dev)
        dead = torch.zeros(B, dtype=torch.bool, device=dev)
        dt = 1.0 / 240.0
        for i in range(12):
            if i % 4 == 0:                                                         # the paddle follows its target once per 1/60 s frame
                self.px = self.px + (tgt - self.px) * min(1.0, 40.0 / 60.0)
                self.px = torch.minimum(torch.maximum(self.px, self.pw / 2), FW - self.pw / 2)
            alive = ~dead
            self.x = torch.where(alive, self.x + self.vx * dt, self.x)
            self.y = torch.where(alive, self.y + self.vy * dt, self.y)
            # walls
            l = self.x < R; r = self.x > FW - R
            self.x = torch.where(l, torch.full_like(self.x, R), torch.where(r, torch.full_like(self.x, FW - R), self.x))
            self.vx = torch.where(l, self.vx.abs(), torch.where(r, -self.vx.abs(), self.vx))
            t = self.y < R
            self.y = torch.where(t, torch.full_like(self.y, R), self.y)
            self.vy = torch.where(t, self.vy.abs(), self.vy)
            # paddle
            pad = (self.vy > 0) & (self.y + R >= PY) & (self.y - R <= PY + PH) & ((self.x - self.px).abs() <= self.pw / 2 + R * 0.8)
            tt = ((self.x - self.px) / (self.pw / 2)).clamp(-1, 1)
            ang = tt * (62 * math.pi / 180) + (torch.rand(B, device=dev) - 0.5) * 0.14
            self.y = torch.where(pad, torch.full_like(self.y, PY - R), self.y)
            self.vx = torch.where(pad, self.speed * torch.sin(ang), self.vx)
            self.vy = torch.where(pad, -self.speed * torch.cos(ang), self.vy)
            # bricks: the cell overlapped most is hit
            rr, cc = self._cells(self.x, self.y)
            hv = self.hits[ar[:, None], rr, cc]
            cx = (cc.float() + 0.5) * BW
            cy = TOP + (rr.float() + 0.5) * BH
            dx = self.x[:, None] - cx
            dy = self.y[:, None] - cy
            pxn = BW / 2 + R - dx.abs()
            pyn = BH / 2 + R - dy.abs()
            valid = (hv > 0) & (pxn > 0) & (pyn > 0)
            pen = torch.where(valid, torch.minimum(pxn, pyn), torch.full_like(pxn, -1.0))
            best = pen.argmax(1)
            hit = pen[ar, best] > 0
            rb, cb = rr[ar, best], cc[ar, best]
            dxb, dyb, pxb, pyb = dx[ar, best], dy[ar, best], pxn[ar, best], pyn[ar, best]
            sidex = hit & (pxb < pyb)
            sidey = hit & ~(pxb < pyb)
            self.vx = torch.where(sidex, torch.where(dxb > 0, self.vx.abs(), -self.vx.abs()), self.vx)
            self.x = torch.where(sidex, self.x + torch.where(dxb > 0, pxb, -pxb), self.x)
            self.vy = torch.where(sidey, torch.where(dyb > 0, self.vy.abs(), -self.vy.abs()), self.vy)
            self.y = torch.where(sidey, self.y + torch.where(dyb > 0, pyb, -pyb), self.y)
            hi = hit.nonzero()[:, 0]
            if hi.numel():
                self.hits[hi, rb[hi], cb[hi]] -= 1
                score[hi] += 2
                empty = self.hits[hi, rb[hi]].sum(1) == 0
                he = hi[empty]
                if he.numel():
                    score[he] += 100
                    rows_cleared[he] += 1
            # the bottom row is gone: everything moves down one row, a new row appears at the top (waits while the ball is in the way)
            need = (self.hits[:, ROWS - 1].sum(1) == 0)
            ni = need.nonzero()[:, 0]
            for _ in range(ROWS):
                if ni.numel() == 0:
                    break
                newr = new_rows(ni.numel(), self.hits[ni, 0], 1 + int(torch.randint(0, 6, (1,)).item()), dev)
                cand = torch.cat([newr[:, None], self.hits[ni, :ROWS - 1]], 1)
                clash = self._ball_hits_grid(cand, self.x[ni], self.y[ni], R + 0.4)
                ok = ni[~clash]
                if ok.numel():
                    self.hits[ok] = cand[~clash]
                still = ok.numel() > 0
                need = (self.hits[:, ROWS - 1].sum(1) == 0)
                ni = need.nonzero()[:, 0]
                if not still:
                    break
            # keep the ball from running (nearly) horizontally
            sp = torch.sqrt(self.vx ** 2 + self.vy ** 2).clamp(min=1e-6)
            minv = sp * 0.22
            low = self.vy.abs() < minv
            vy2 = torch.where(self.vy < 0, -minv, minv)
            vx2 = torch.where(self.vx < 0, -1.0, 1.0) * torch.sqrt((sp ** 2 - minv ** 2).clamp(min=0))
            self.vy = torch.where(low, vy2, self.vy)
            self.vx = torch.where(low, vx2, self.vx)
            dead = dead | (self.y - R > FH)
        self.t = self.t + 1
        truncated = self.t >= self.max_steps
        # shaping: the classic trick is to dig a channel on one side and get the ball BEHIND the bricks (it then clears the rows from above): a little reward for being there
        rowsum = self.hits.sum(2)
        top_row = torch.where(rowsum > 0, torch.arange(ROWS, device=dev).float()[None, :].expand(B, ROWS), torch.full((B, ROWS), 99.0, device=dev)).min(1).values
        behind = (self.y < TOP + top_row * BH - R) & (top_row < 99)
        phi = self.channel()
        reward = score / 20.0 - 4.0 * dead.float() + 0.1 * behind.float() - 0.0025 + 4.0 * (phi - self.phi)     # (the last term: potential-based reward for digging a channel)
        self.phi = phi
        info_behind = behind.float()
        done = dead | truncated
        info = {"score": score, "rows": rows_cleared, "dead": dead, "behind": info_behind}
        self.reset(done)
        return self.obs(), reward, done, info
