"""Batched torch re-implementation of the 3D Atari Breakout physics (../breakout3d.js) for reinforcement learning.
Shaft N x N x H (6 x 6 x 12): the paddle (half size hs) moves on the floor, the ball flies up to 5 layers of cubes (z = 7 .. 11).  Internal coordinates (x, y = floor, z = height).
One decision = 1/20 s = 12 sub-steps of 1/240 s.  The policy picks a TARGET (x, y) for the paddle (11 bins per axis); the paddle follows it like the game (x += (t - x) * min(1, 30 dt) per 1/60 s).
Score: +2 per hit, +100 per cleared layer, one ball only.  Items are not simulated; paddle size and ball speed are randomised."""
import math
import torch

N, H, LAYERS = 6, 12, 5
R = 0.28
NB = 21                         # per axis: the offset t (-1 .. 1) on the paddle where the ball should land
OBS = 12 + LAYERS * N * N


def new_layer(n, below, level, dev):
    """(n, N, N) hits (0 = empty) of a random layer; multi-hit cubes (2 / 3 / 5 hits) in clusters.  below: (n, N, N) or None"""
    out = torch.zeros(n, N, N, device=dev)
    tough = torch.zeros(n, N, N, dtype=torch.bool, device=dev)
    base = torch.tensor([0.07 + 0.005 * level, 0.5, 0.66, 0.8], device=dev)
    for i in range(N):
        for j in range(N):
            present = torch.rand(n, device=dev) < 0.9
            nb = torch.zeros(n, dtype=torch.long, device=dev)
            if i > 0:
                nb = nb + tough[:, i - 1, j].long()
            if j > 0:
                nb = nb + tough[:, i, j - 1].long()
            if below is not None:
                nb = nb + (below[:, i, j] > 1).long()
            p = (base[nb.clamp(max=3)] * (1 + 0.06 * (level - 1)) * 0.62).clamp(max=0.92)
            t = torch.rand(n, device=dev) < p
            q = torch.rand(n, device=dev)
            th = torch.where(q < 0.5, 2.0, torch.where(q < 0.8, 3.0, 5.0))
            out[:, i, j] = torch.where(present, torch.where(t, th, torch.ones(n, device=dev)), torch.zeros(n, device=dev))
            tough[:, i, j] = present & t
    return out


class Env3D:
    def __init__(self, B, dev="cuda", max_steps=1600):
        self.B, self.dev, self.max_steps = B, dev, max_steps
        z = lambda: torch.zeros(B, device=dev)
        self.x, self.y, self.z, self.vx, self.vy, self.vz = z(), z(), z(), z(), z(), z()
        self.px, self.py, self.hs, self.speed, self.t = z(), z(), z(), z(), z()
        self.phi = z()
        self.last_act = torch.full((B, 2), NB // 2, device=dev, dtype=torch.long); self.decided = torch.zeros(B, dtype=torch.bool, device=dev)
        self.hits = torch.zeros(B, LAYERS, N, N, device=dev)          # [layer index k = z - 7][x][y]; k = 0 is the bottom layer
        self.ar = torch.arange(B, device=dev)
        cell = torch.arange(N, device=dev).float()
        self.cx = cell[None, None, :, None].expand(1, LAYERS, N, N)
        self.cy = cell[None, None, None, :].expand(1, LAYERS, N, N)
        self.cz = (H - LAYERS + torch.arange(LAYERS, device=dev).float())[None, :, None, None].expand(1, LAYERS, N, N)
        self.reset(torch.ones(B, dtype=torch.bool, device=dev))

    def reset(self, m):
        idx = m.nonzero()[:, 0]
        n = idx.numel()
        if n == 0:
            return
        dev = self.dev
        level = int(torch.randint(1, 9, (1,)).item())
        layers = [None] * LAYERS
        below = None
        for k in range(LAYERS):
            layers[k] = new_layer(n, below, level, dev)
            below = layers[k]
        self.hits[idx] = torch.stack(layers, 1)
        self.hs[idx] = torch.where(torch.rand(n, device=dev) < 0.5, torch.empty(n, device=dev).uniform_(0.5, 2.5), torch.ones(n, device=dev))
        self.speed[idx] = torch.empty(n, device=dev).uniform_(8.5, 16.0)
        self.px[idx] = torch.empty(n, device=dev).uniform_(1.5, 4.5)
        self.py[idx] = torch.empty(n, device=dev).uniform_(1.5, 4.5)
        a = torch.rand(n, device=dev) * 2 * math.pi
        tt = 0.18 + torch.rand(n, device=dev) * 0.12
        d = torch.stack([torch.cos(a) * tt, torch.sin(a) * tt, torch.ones(n, device=dev)], 1)
        d = d / d.norm(dim=1, keepdim=True)
        self.x[idx], self.y[idx], self.z[idx] = self.px[idx], self.py[idx], 0.4
        self.vx[idx], self.vy[idx], self.vz[idx] = d[:, 0] * self.speed[idx], d[:, 1] * self.speed[idx], d[:, 2] * self.speed[idx]
        self.t[idx] = 0
        # curriculum: most episodes start with a shaft already dug through one column of cubes
        dig = torch.rand(n, device=dev) < 0.8
        ix = torch.randint(0, N, (n,), device=dev)
        iy = torch.randint(0, N, (n,), device=dev)
        depth = torch.where(torch.rand(n, device=dev) < 0.6, torch.full((n,), LAYERS, device=dev), torch.randint(1, LAYERS, (n,), device=dev))
        for k in range(LAYERS):
            cut = dig & (k < depth)
            self.hits[idx[cut], k, ix[cut], iy[cut]] = 0
        self.phi[idx] = self.channel()[idx]
        self.last_act[idx] = NB // 2
        self.decided[idx] = False

    def channel(self):
        """how far the best column is dug from the bottom layer upwards (0 .. 1)"""
        nz = (self.hits > 0)
        depth = torch.where(nz.any(1), nz.float().argmax(1).float(), torch.full((self.B, N, N), float(LAYERS), device=self.dev))
        return depth.flatten(1).max(1).values / LAYERS

    def landing(self):
        """(x, y) where the ball comes down to the floor (straight flight with wall bounces, cubes ignored) and the time it takes"""
        g = self.vz < -0.1
        tt = torch.where(g, (self.z - R) / (-self.vz).clamp(min=0.1), torch.zeros_like(self.z))
        out = []
        for p, v in ((self.x, self.vx), (self.y, self.vy)):
            xx = p + v * tt - R
            span = N - 2 * R
            m = torch.remainder(xx, 2 * span)
            out.append(torch.where(m > span, 2 * span - m, m) + R)
        return torch.where(g, out[0], self.x), torch.where(g, out[1], self.y), tt

    def obs(self):
        lx, ly, tt = self.landing()
        head = torch.stack([self.x / N, self.y / N, self.z / H, self.vx / self.speed, self.vy / self.speed, self.vz / self.speed,
                            self.px / N, self.py / N, self.hs / 2.5, lx / N, ly / N, (tt / 3.0).clamp(max=1.0)], 1)
        return torch.cat([head, (self.hits / 5.0).flatten(1)], 1)

    # ---- decision points: the policy chooses the aim (the offset t) once per fall of the ball (when it is 0.6 s from the floor); in between the last choice stays
    def needs_decision(self):
        _, _, tt = self.landing()
        return (self.vz < -0.1) & (tt <= 0.6) & ~self.decided

    def commit(self, m, act):
        self.last_act = torch.where(m[:, None], act, self.last_act)
        self.decided = (self.decided | m) & (self.vz < -0.1)

    def expert(self):
        """scripted player used to warm-start the policy: always aim the ball at the best column (open deepest from the bottom, nearest to where the ball comes down)"""
        nz = self.hits > 0
        depth = torch.where(nz.any(1), nz.float().argmax(1).float(), torch.full((self.B, N, N), float(LAYERS), device=self.dev))      # (B, N, N) empty layers from the bottom
        lx, ly, _ = self.landing()
        cell = torch.arange(N, device=self.dev).float() + 0.5
        dist = ((cell[None, :, None] - lx[:, None, None]) ** 2 + (cell[None, None, :] - ly[:, None, None]) ** 2).sqrt()
        score = (depth * 10.0 - dist * 0.3).flatten(1)
        b = score.argmax(1)
        ix, iy = b // N, b % N
        zt = (H - LAYERS + depth.flatten(1)[self.ar, b]).clamp(max=H - 0.5)
        zt = zt.clamp(min=3.0)
        tx = (1.5 * (cell[ix] - lx) / (0.7 * zt)).clamp(-1, 1)
        ty = (1.5 * (cell[iy] - ly) / (0.7 * zt)).clamp(-1, 1)
        return torch.stack([((tx + 1) / 2 * (NB - 1)).round().long(), ((ty + 1) / 2 * (NB - 1)).round().long()], 1)

    def target(self, act):
        lx, ly, _ = self.landing()
        tx = -1.0 + 2.0 * act[:, 0].float() / (NB - 1)
        ty = -1.0 + 2.0 * act[:, 1].float() / (NB - 1)
        clampx = lambda v: torch.minimum(torch.maximum(v, self.hs), N - self.hs)
        return clampx(lx - tx * self.hs), clampx(ly - ty * self.hs)

    def _clash(self, hits, x, y, z, margin):
        qx = torch.minimum(torch.maximum(x[:, None, None, None], self.cx), self.cx + 1)
        qy = torch.minimum(torch.maximum(y[:, None, None, None], self.cy), self.cy + 1)
        qz = torch.minimum(torch.maximum(z[:, None, None, None], self.cz), self.cz + 1)
        d2 = (x[:, None, None, None] - qx) ** 2 + (y[:, None, None, None] - qy) ** 2 + (z[:, None, None, None] - qz) ** 2
        return d2

    def step(self, act):
        B, dev, ar = self.B, self.dev, self.ar
        tx, ty = self.target(act)
        score = torch.zeros(B, device=dev)
        dead = torch.zeros(B, dtype=torch.bool, device=dev)
        dt = 1.0 / 240.0
        for i in range(12):
            if i % 4 == 0:
                k = min(1.0, 30.0 / 60.0)
                self.px = self.px + (tx - self.px) * k
                self.py = self.py + (ty - self.py) * k
                self.px = torch.minimum(torch.maximum(self.px, self.hs), N - self.hs)
                self.py = torch.minimum(torch.maximum(self.py, self.hs), N - self.hs)
            alive = ~dead
            self.x = torch.where(alive, self.x + self.vx * dt, self.x)
            self.y = torch.where(alive, self.y + self.vy * dt, self.y)
            self.z = torch.where(alive, self.z + self.vz * dt, self.z)
            for name, v in (("x", "vx"), ("y", "vy")):
                p, q = getattr(self, name), getattr(self, v)
                lo = p < R
                hi = p > N - R
                setattr(self, name, torch.where(lo, torch.full_like(p, R), torch.where(hi, torch.full_like(p, N - R), p)))
                setattr(self, v, torch.where(lo, q.abs(), torch.where(hi, -q.abs(), q)))
            top = self.z > H - R
            self.z = torch.where(top, torch.full_like(self.z, H - R), self.z)
            self.vz = torch.where(top, -self.vz.abs(), self.vz)
            # paddle
            pad = (self.vz < 0) & (self.z - R <= 0.15) & ((self.x - self.px).abs() <= self.hs + R * 0.8) & ((self.y - self.py).abs() <= self.hs + R * 0.8)
            dx = (self.x - self.px) / self.hs * 0.7 + (torch.rand(B, device=dev) - 0.5) * 0.12
            dy = (self.y - self.py) / self.hs * 0.7 + (torch.rand(B, device=dev) - 0.5) * 0.12
            m = torch.sqrt(dx ** 2 + dy ** 2 + 1.5 ** 2)
            self.z = torch.where(pad, torch.full_like(self.z, R + 0.15), self.z)
            self.vx = torch.where(pad, dx / m * self.speed, self.vx)
            self.vy = torch.where(pad, dy / m * self.speed, self.vy)
            self.vz = torch.where(pad, 1.5 / m * self.speed, self.vz)
            # cubes: the deepest contact is resolved
            d2 = self._clash(self.hits, self.x, self.y, self.z, R)
            contact = (d2 < R * R) & (self.hits > 0)
            key = torch.where(contact, d2, torch.full_like(d2, 1e9)).flatten(1)
            bd, bi = key.min(1)
            hit = bd < 1e8
            if hit.any():
                k = bi // (N * N)
                ix = (bi % (N * N)) // N
                iy = bi % N
                cxb, cyb, czb = ix.float(), iy.float(), (H - LAYERS + k).float()
                qx = torch.minimum(torch.maximum(self.x, cxb), cxb + 1)
                qy = torch.minimum(torch.maximum(self.y, cyb), cyb + 1)
                qz = torch.minimum(torch.maximum(self.z, czb), czb + 1)
                nx, ny, nz = self.x - qx, self.y - qy, self.z - qz
                mm = torch.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
                inside = mm < 1e-6
                nx = torch.where(inside, torch.zeros_like(nx), nx / mm.clamp(min=1e-6))
                ny = torch.where(inside, torch.zeros_like(ny), ny / mm.clamp(min=1e-6))
                nz = torch.where(inside, -torch.ones_like(nz), nz / mm.clamp(min=1e-6))
                vn = self.vx * nx + self.vy * ny + self.vz * nz
                refl = hit & (vn < 0)
                self.vx = torch.where(refl, self.vx - 2 * vn * nx, self.vx)
                self.vy = torch.where(refl, self.vy - 2 * vn * ny, self.vy)
                self.vz = torch.where(refl, self.vz - 2 * vn * nz, self.vz)
                self.x = torch.where(hit, qx + nx * R * 1.001, self.x)
                self.y = torch.where(hit, qy + ny * R * 1.001, self.y)
                self.z = torch.where(hit, qz + nz * R * 1.001, self.z)
                hi_ = hit.nonzero()[:, 0]
                self.hits[hi_, k[hi_], ix[hi_], iy[hi_]] -= 1
                score[hi_] += 2
                layer_empty = self.hits[hi_, k[hi_]].flatten(1).sum(1) == 0
                he = hi_[layer_empty]
                if he.numel():
                    score[he] += 100
                sp = torch.sqrt(self.vx ** 2 + self.vy ** 2 + self.vz ** 2).clamp(min=1e-6)
                sc = torch.where(hit, self.speed / sp, torch.ones_like(sp))
                self.vx, self.vy, self.vz = self.vx * sc, self.vy * sc, self.vz * sc
            # the lowest layer is gone: everything moves down one layer, a new layer appears at the top (waits while the ball is in the way)
            need = self.hits[:, 0].flatten(1).sum(1) == 0
            ni = need.nonzero()[:, 0]
            for _ in range(LAYERS):
                if ni.numel() == 0:
                    break
                newl = new_layer(ni.numel(), self.hits[ni, LAYERS - 1], 1 + int(torch.randint(0, 6, (1,)).item()), dev)
                cand = torch.cat([self.hits[ni, 1:], newl[:, None]], 1)
                d2c = self._clash(cand, self.x[ni], self.y[ni], self.z[ni], R)
                clash = ((d2c < (R + 0.35) ** 2) & (cand > 0)).flatten(1).any(1)
                ok = ni[~clash]
                if ok.numel() == 0:
                    break
                self.hits[ok] = cand[~clash]
                need = self.hits[:, 0].flatten(1).sum(1) == 0
                ni = need.nonzero()[:, 0]
            # never let the ball hover sideways forever
            sp = torch.sqrt(self.vx ** 2 + self.vy ** 2 + self.vz ** 2).clamp(min=1e-6)
            minz = sp * 0.3
            low = self.vz.abs() < minz
            hv = torch.sqrt(self.vx ** 2 + self.vy ** 2).clamp(min=1e-6)
            kk = torch.sqrt((sp ** 2 - minz ** 2).clamp(min=1e-6)) / hv
            self.vz = torch.where(low, torch.where(self.vz < 0, -minz, minz), self.vz)
            self.vx = torch.where(low, self.vx * kk, self.vx)
            self.vy = torch.where(low, self.vy * kk, self.vy)
            dead = dead | (self.z < -1.2)
        self.t = self.t + 1
        done = dead | (self.t >= self.max_steps)
        # shaping: get the ball ABOVE cubes (dig a shaft through the layers on one side, the ball then clears them from above): a little reward for being there
        ix = self.x.long().clamp(0, N - 1); iy = self.y.long().clamp(0, N - 1)
        col = self.hits[self.ar, :, ix, iy]                                          # (B, LAYERS) hits of the cubes in the ball's column
        zlow = (H - LAYERS + torch.arange(LAYERS, device=dev).float())[None, :] + 1.0   # top face of every cube layer
        behind = ((col > 0) & (zlow <= self.z[:, None] + 0.0)).any(1)
        phi = self.channel()
        reward = score / 20.0 - 4.0 * dead.float() + 0.1 * behind.float() - 0.0025 + 4.0 * (phi - self.phi)     # (the last term: potential-based reward for digging a shaft)
        self.phi = phi
        info = {"score": score, "dead": dead, "behind": behind.float()}
        self.reset(done)
        return self.obs(), reward, done, info
