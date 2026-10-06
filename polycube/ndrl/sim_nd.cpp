// Exact C++ port of the polycube (DIM=3) / polytesseract (DIM=4) game rules + candidate-plan generation for afterstate RL.
// Compile twice: -DDIM=3 / -DDIM=4.  RNG = mulberry32 (the JS lockstep harness uses the same generator as Math.random).
#include <cstdint>
#include <cstring>
#include <cmath>
#include <vector>
#include <algorithm>
#include <omp.h>
#include <initializer_list>
#ifndef DIM
#define DIM 3
#endif
constexpr int NW = DIM == 4 ? 7 : 1;
constexpr int NB = 7 * 7 * 26 * NW;      // board cells
constexpr int NP = 7 * 7 * 7 * NW;       // piece box cells
constexpr int NPOS = DIM == 4 ? 6 : 3;   // rotation planes
constexpr int PRUNE_K = DIM == 4 ? 192 : 0;   // 0 = keep every candidate
constexpr int MAXC = DIM == 4 ? 256 : 1536;
constexpr int SD = 40;                   // event-summary size
constexpr int NTS = 44;                  // item slots
constexpr int KIDS = 48;
constexpr double GAP_MS = 200.0;
static inline int bidx(int x, int y, int z, int w) { return ((x * 7 + y) * 26 + z) * NW + w; }
static inline int pidx(int x, int y, int z, int w) { return ((x * 7 + y) * 7 + z) * NW + w; }
static int PXd[NP], PYd[NP], PZd[NP], PWd[NP];
static int16_t RAW[56][NP];              // rawblock tables 0..55 (56 is dynamic and lives in the game)
static bool rawLoaded = false;
static int slotOf[512];
static int groupOf[512];
static const int ITEM_CODES[] = {1, 2, 4, 5, 6, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 22, 30, 31, 32, 91, 102, 103, 104, 105, 106, 116, 117, 118, 119,
                                 120, 121, 122, 123, 124, 125, 126, 127, 200, 204};
static void initTables() {
    for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int z = 0; z < 7; z++) for (int w = 0; w < NW; w++) {
        int i = pidx(x, y, z, w); PXd[i] = x; PYd[i] = y; PZd[i] = z; PWd[i] = w;
    }
    for (int i = 0; i < 512; i++) { slotOf[i] = -1; groupOf[i] = -1; }
    int n = 0; for (int c : ITEM_CODES) slotOf[c] = n++;
    auto G = [&](std::initializer_list<int> l, int g) { for (int c : l) groupOf[c] = g; };
    G({120, 121, 122, 123, 127, 17}, 0); G({117, 125}, 1); G({11}, 2); G({19, 200, 18}, 3); G({8, 9, 10, 91, 16, 2, 6}, 4);
    G({21, 22, 104}, 5); G({116, 124}, 6); G({118, 126, 105, 106, 102, 1}, 7); G({119, 5}, 8); G({20}, 9); G({4, 204}, 10); G({30, 31}, 11);
}

struct Rng {
    uint32_t s;
    double next() {
        s += 0x6D2B79F5u; uint32_t t = s;
        t = (uint32_t)((int32_t)(t ^ (t >> 15)) * (int32_t)(t | 1));
        t ^= t + (uint32_t)((int32_t)(t ^ (t >> 7)) * (int32_t)(t | 61));
        return (double)(t ^ (t >> 14)) / 4294967296.0;
    }
    int ri(int m) { return (int)std::floor(next() * m); }
};

struct Ev { int trig[12]; int placed[12]; int boom, garb, lines, hold, gain; };

struct G {
    int16_t blk[NB];
    int16_t P[3][NP]; int now, nxt, hld;
    int16_t tmp[NP], tmp2[NP], raw56[NP];
    int nowhb, nexthb, holdhb;
    int bp[4], bpt[4];
    int score, lines, level, asc, monoonly, spinlock, hideblock, hidenext, score2x, speedup, speeddown, holdlock, bombnext, simplify2, pentaForce, reinforce, rfUpgrade;
    bool compactPending, over, items, ovf = false;      // ovf: lines were added and the stack now reaches above the ceiling = game over
    double blindUntil, nowT;
    Rng rng;
    Ev ev;

    int ri(int m) { return rng.ri(m); }
    const int16_t* rawOf(int idx) const { return idx == 56 ? raw56 : RAW[idx]; }

    // ------------------------------------------------------------------ piece generation
    void createNewBlock() {
        int16_t* b = tmp; memset(b, 0, sizeof(tmp));
        int blkcnt = 0, x = 2, y = 2, z = 2, w = 3;
        int bc = ri(32768);
        if (bc > 8192) bc = 6; else if (bc > 2048) bc = 7; else if (bc > 512) bc = 8; else if (bc > 128) bc = 9; else if (bc > 32) bc = 10;
        else if (bc > 8) bc = 11; else if (bc > 4) bc = 12; else if (bc > 2) bc = 13; else bc = 14;
        int lo[4] = {6, 6, 6, 6}, hi[4] = {0, 0, 0, 0};
        if (DIM == 3) w = 0;
        int rv = 158 + bc;
        switch (bc) { case 6: rv = 207; break; case 7: rv = 206; break; case 8: rv = 205; break; case 9: rv = 203; break; case 10: rv = 202; break;
                      case 11: rv = 201; break; case 12: rv = 199; break; case 13: rv = 198; break; case 14: rv = 197; break; }
        while (blkcnt < bc) {
            if (b[pidx(x, y, z, w)] == 0) {
                blkcnt++; b[pidx(x, y, z, w)] = rv;
                int c4[4] = {x, y, z, w};
                for (int d = 0; d < DIM; d++) { if (c4[d] >= hi[d]) hi[d] = c4[d]; if (c4[d] <= lo[d]) lo[d] = c4[d]; }
            }
            int r = ri(DIM == 4 ? 8 : 6);
            switch (r) {
                case 0: x = std::min(6, x + 1); break; case 1: x = std::max(0, x - 1); break;
                case 2: y = std::min(6, y + 1); break; case 3: y = std::max(0, y - 1); break;
                case 4: z = std::min(6, z + 1); break;
                case 5: if (DIM == 4) z = std::max(0, z - 1); else z = std::max(0, z - 1); break;
                case 6: w = std::min(6, w + 1); break;
                default: if (DIM == 4) w = std::max(0, w - 1); else z = std::max(0, z - 1); break;
            }
        }
        int off[4] = {0, 0, 0, 0};
        for (int d = 0; d < DIM; d++) off[d] = (int)std::floor((lo[d] + hi[d]) / 2.0) - 3;
        for (int xi = 0; xi < 7; xi++) for (int yi = 0; yi < 7; yi++) for (int zi = 0; zi < 7; zi++) for (int wi = 0; wi < NW; wi++) {
            int sx = xi + off[0], sy = yi + off[1], sz = zi + off[2], sw = wi + off[3];
            bool in = sx >= 0 && sx <= 6 && sy >= 0 && sy <= 6 && sz >= 0 && sz <= 6 && (DIM == 3 || (sw >= 0 && sw <= 6));
            raw56[pidx(xi, yi, zi, wi)] = in ? b[pidx(sx, sy, sz, sw)] : 0;
        }
    }

    int chooseBase() {
        int b1, b2, b3, b4, b5;
        switch (level) {
            case 1: b1 = 10; b2 = 30; b3 = 60; b4 = 100; b5 = 100; break;
            case 2: b1 = 6; b2 = 20; b3 = 40; b4 = 98; b5 = 100; break;
            case 3: b1 = 4; b2 = 10; b3 = 30; b4 = 95; b5 = 100; break;
            case 4: b1 = 3; b2 = 8; b3 = 34; b4 = 93; b5 = 99; break;
            case 5: case 6: b1 = 3; b2 = 7; b3 = 32; b4 = 90; b5 = 99; break;
            case 7: case 8: b1 = 2; b2 = 6; b3 = 31; b4 = 88; b5 = 99; break;
            case 9: case 10: case 11: b1 = 2; b2 = 5; b3 = 30; b4 = 86; b5 = 98; break;
            case 12: case 13: case 14: case 15: b1 = 2; b2 = 5; b3 = 29; b4 = 84; b5 = 98; break;
            default: b1 = 2; b2 = 5; b3 = 29; b4 = 82; b5 = 98; break;
        }
        if (monoonly) { b1 = b2 = b3 = b4 = 100; monoonly -= 1; }
        if (simplify2 > 0) { simplify2 -= 1; return ri(4); }
        if (pentaForce > 0) { pentaForce -= 1; return DIM == 4 ? 11 + ri(26) : 12 + ri(29); }
        int t = ri(100);
        if (t < b1) t = 0;
        else if (t < b2) t = 1;
        else if (t < b3) t = 2 + ri(2);
        else if (t < b4) t = DIM == 4 ? 4 + ri(7) : 4 + ri(8);
        else if (t < b5) t = DIM == 4 ? 11 + ri(26) : 12 + ri(29);
        else if (DIM == 4) { int r = ri(3); if (r == 0) { createNewBlock(); t = 56; } else t = 37 + ri(5); }
        else { if (ri(2)) { createNewBlock(); t = 56; } else t = 41 + ri(15); }
        return t;
    }

    void applyAging() {
        for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int z = 0; z < 26; z++) for (int w = 0; w < NW; w++) {
            int v = blk[bidx(x, y, z, w)];
            if (120 <= v && v < 123) blk[bidx(x, y, z, w)] += 1;
            else if (v == 123) {
                ev.boom++;
                int R = reinforce > 0 ? 2 : 1;
                for (int x2 = x - R; x2 <= x + R; x2++) for (int y2 = y - R; y2 <= y + R; y2++) for (int z2 = z - R; z2 <= z + R; z2++)
                    for (int w2 = (DIM == 4 ? w - R : 0); w2 <= (DIM == 4 ? w + R : 0); w2++)
                        if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && z2 >= 0 && z2 < 26 && w2 >= 0 && w2 < NW)
                            blk[bidx(x2, y2, z2, w2)] = ri(4) != 0 ? 98 : 0;
            } else if (v == 32) {
                for (int x2 = x - 1; x2 <= x + 1; x2++) for (int y2 = y - 1; y2 <= y + 1; y2++) for (int z2 = z - 1; z2 <= z + 1; z2++)
                    for (int w2 = (DIM == 4 ? w - 1 : 0); w2 <= (DIM == 4 ? w + 1 : 0); w2++)
                        if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && z2 >= 0 && z2 < 26 && w2 >= 0 && w2 < NW) blk[bidx(x2, y2, z2, w2)] = 0;
            }
        }
    }

    static int itemFromU(int u) {
        if (DIM == 3) {
            static const int T[][2] = {{100, 116}, {400, 117}, {700, 118}, {720, 119}, {1520, 104}, {4020, 120}, {5270, 121}, {6120, 122}, {6520, 123}, {6570, 124},
                {7370, 125}, {7620, 91}, {7720, 102}, {7920, 126}, {8120, 105}, {8420, 127}, {8520, 17}, {8720, 20}, {9520, 21}, {10320, 22}, {10570, 16}, {10770, 11},
                {11020, 2}, {12020, 8}, {13020, 9}, {13270, 10}, {14270, 5}, {14520, 6}, {14820, 204}, {24820, 4}, {25120, 200}, {25420, 19}, {25720, 18}};
            for (auto& t : T) if (u < t[0]) return t[1];
        } else {
            static const int T[][2] = {{100, 116}, {400, 117}, {700, 118}, {720, 119}, {1520, 104}, {4020, 120}, {5270, 121}, {6120, 122}, {6520, 123}, {6570, 124},
                {7370, 125}, {7620, 91}, {7720, 102}, {7870, 126}, {8020, 105}, {8120, 106}, {8420, 127}, {8520, 17}, {8720, 20}, {9520, 21}, {10320, 22}, {10570, 16},
                {10770, 11}, {11020, 2}, {12020, 8}, {13020, 9}, {13270, 10}, {14270, 5}, {14520, 6}, {14820, 204}, {24820, 4}, {25120, 200}, {25420, 19}, {25720, 18}};
            for (auto& t : T) if (u < t[0]) return t[1];
        }
        return 0;
    }

    int assignCell(int base, int raw) {
        if (raw == 0) return 0;
        if (!items) return raw;
        int ua = ri(16384); int ub = ri(16384); int u = (ua + ub * 16384) % 1000000;
        if (itemScale > 1) u /= itemScale;                           // (training only) items k times as frequent
        int it = itemFromU(u);
        if (it == 4 && battle && ri(16) != 0) return raw;            // battle mode: the score-boost ('steal') block is 1/16 as common
        if (it) return it;
        if (base == 0) {
            int mr = ri(100);
            if (mr < 10) return 1;
            if (mr < 20) { if (reinforce > 0) { rfUpgrade = 30; return raw; } nexthb = 1; return 30; }
            if (mr < 60) { if (reinforce > 0) { rfUpgrade = 31; return raw; } return 31; }
        }
        if (monoonly || (simplify2 > 0 && base == 0)) return 12 + ri(4);
        return raw;
    }

    int setnextblock() {
        asc = 0;
        std::swap(nxt, now); std::swap(nexthb, nowhb); nexthb = 0;
        applyAging();
        int base = chooseBase();
        const int16_t* rw = rawOf(base);
        int16_t* nb = P[nxt];
        for (int i = 0; i < NP; i++) nb[i] = (int16_t)assignCell(base, rw[i]);
        if (simplify2 > 0) {
            int cnt = 0; for (int i = 0; i < NP; i++) if (nb[i]) cnt++;
            (void)cnt;
            int sr = ri(100);
            if (sr < 40) { for (int i = 0; i < NP; i++) if (nb[i]) nb[i] = 31; nexthb = 0; }
            else if (sr < 50) {
                int sv = ri(2) == 0 ? 30 : 1; if (sv == 30) nexthb = 1;
                for (int i = 0; i < NP; i++) if (nb[i]) nb[i] = sv;
            }
        }
        if (rfUpgrade) {
            int code = rfUpgrade; rfUpgrade = 0;
            int idx = 2 + ri(2);
            memset(nb, 0, sizeof(int16_t) * NP);
            const int16_t* r2 = rawOf(idx);
            for (int i = 0; i < NP; i++) if (r2[i]) nb[i] = code;
            nexthb = code == 30 ? 1 : 0;
        }
        if (DIM == 3 && bombnext > 0) {
            int cells[NP], nc = 0;
            for (int i = 0; i < NP; i++) if (nb[i]) cells[nc++] = i;
            if (nc > 0) {
                static const int BT[5] = {120, 121, 122, 123, 127};
                int bc = nc >= 5 ? 2 : 1; bool used[NP] = {false};
                for (int b = 0; b < bc && b < nc; b++) {
                    int bi; do { bi = ri(nc); } while (used[bi]);
                    used[bi] = true; nb[cells[bi]] = BT[ri(5)];
                }
                bombnext -= 1;
            }
        }
        tie[nxt] = 0;
        if (battle && nbq > 0) { makeMono(nxt); tie[nxt] = bq[0]; for (int k = 1; k < nbq; k++) bq[k - 1] = bq[k]; nbq--; }   // battle mode: the block after a position item is a plain single cube of its own
        bp[0] = 0; bp[1] = 0; bp[2] = 14; bp[3] = 0;
        std::swap(nxt, now);
        int i = ri(4), j = ri(4), k = ri(4);
        for (int a = 0; a < i; a++) rotateFn(0, 1);
        for (int a = 0; a < j; a++) rotateFn(1, 1);
        for (int a = 0; a < k; a++) rotateFn(2, 1);
        std::swap(nxt, now);
        return moveFn(0, 0);
    }

    // ------------------------------------------------------------------ rotation
    static void rotmap(int pos, int d, int x, int y, int z, int w, int& tx, int& ty, int& tz, int& tw) {
        tx = x; ty = y; tz = z; tw = w;
        switch (pos) {
            case 0: if (d == 1) { tx = 6 - y; ty = x; } else if (d == 2) { tx = 6 - y; ty = 6 - x; } else { tx = y; ty = 6 - x; } break;
            case 1: if (d == 1) { ty = 6 - z; tz = y; } else if (d == 2) { ty = 6 - z; tz = 6 - y; } else { ty = z; tz = 6 - y; } break;
            case 2: if (d == 1) { tx = 6 - z; tz = x; } else if (d == 2) { tx = 6 - z; tz = 6 - x; } else { tx = z; tz = 6 - x; } break;
            case 3: if (d == 1) { tx = 6 - w; tw = x; } else if (d == 2) { tx = 6 - w; tw = 6 - x; } else { tx = w; tw = 6 - x; } break;
            case 4: if (d == 1) { ty = 6 - w; tw = y; } else if (d == 2) { ty = 6 - w; tw = 6 - y; } else { ty = w; tw = 6 - y; } break;
            default: if (d == 1) { tz = 6 - w; tw = z; } else if (d == 2) { tz = 6 - w; tw = 6 - z; } else { tz = w; tw = 6 - z; } break;
        }
    }
    static void com(const int16_t* b, int* c) {
        double s[4] = {0, 0, 0, 0}; int n = 0;
        for (int i = 0; i < NP; i++) if (b[i]) { s[0] += PXd[i]; s[1] += PYd[i]; s[2] += PZd[i]; s[3] += PWd[i]; n++; }
        for (int d = 0; d < 4; d++) c[d] = n ? (int)std::floor(s[d] / n + 0.5) : 3;
    }
    bool checkRot(const int16_t* t, int dx, int dy, int dz, int dw) const {
        for (int i = 0; i < NP; i++) {
            if (!t[i]) continue;
            int bx = PXd[i] + bp[0] + dx, by = PYd[i] + bp[1] + dy, bz = PZd[i] + bp[2] + dz, bw = PWd[i] + bp[3] + dw;
            if (bx < 0 || bx > 6 || by < 0 || by > 6 || bz < 0 || bz > 25 || bw < 0 || bw > NW - 1) return false;
            int v = blk[bidx(bx, by, bz, bw)];
            if (v != 0 && v != 31) return false;
        }
        return true;
    }
    void applyRot(const int16_t* t) {
        int16_t* nb = P[now];
        for (int i = 0; i < NP; i++) {
            nb[i] = t[i];
            if (nb[i] != 0) {
                int id = bidx(PXd[i] + bp[0], PYd[i] + bp[1], PZd[i] + bp[2], PWd[i] + bp[3]);
                if (blk[id] == 31) { nb[i] = 0; blk[id] = 0; }
            }
        }
    }
    // pure shape rotation with centre-of-mass compensation (no board): dst <- rot(src)
    static void rotShape(const int16_t* src, int16_t* dst, int16_t* scratch, int pos, int deg) {
        int d = deg & 3;
        int c0[4]; com(src, c0);
        memset(dst, 0, sizeof(int16_t) * NP);
        for (int i = 0; i < NP; i++) {
            int v = src[i]; if (!v) continue;
            int tx, ty, tz, tw; rotmap(pos, d, PXd[i], PYd[i], PZd[i], PWd[i], tx, ty, tz, tw);
            dst[pidx(tx, ty, tz, tw)] = (int16_t)v;
        }
        int c1[4]; com(dst, c1);
        int dd[4] = {c0[0] - c1[0], c0[1] - c1[1], c0[2] - c1[2], c0[3] - c1[3]};
        if (DIM == 3) dd[3] = 0;
        if (dd[0] || dd[1] || dd[2] || dd[3]) {
            bool can = true;
            for (int i = 0; i < NP && can; i++) {
                if (!dst[i]) continue;
                int tx = PXd[i] + dd[0], ty = PYd[i] + dd[1], tz = PZd[i] + dd[2], tw = PWd[i] + dd[3];
                if (tx < 0 || tx >= 7 || ty < 0 || ty >= 7 || tz < 0 || tz >= 7 || tw < 0 || tw >= NW) can = false;
            }
            if (can) {
                memset(scratch, 0, sizeof(int16_t) * NP);
                for (int i = 0; i < NP; i++) if (dst[i]) scratch[pidx(PXd[i] + dd[0], PYd[i] + dd[1], PZd[i] + dd[2], PWd[i] + dd[3])] = dst[i];
                memcpy(dst, scratch, sizeof(int16_t) * NP);
            }
        }
    }
    int rotateFn(int pos, int deg) {
        if (spinlock != 0) return 0;
        if ((deg & 3) == 0) return 0;
        rotShape(P[now], tmp, tmp2, pos, deg);
        if (checkRot(tmp, 0, 0, 0, 0)) { applyRot(tmp); return 0; }
        static const int K3[18][4] = {{1,0,0,0},{-1,0,0,0},{0,1,0,0},{0,-1,0,0},{0,0,-1,0},{1,1,0,0},{1,-1,0,0},{-1,1,0,0},{-1,-1,0,0},
            {1,0,-1,0},{-1,0,-1,0},{0,1,-1,0},{0,-1,-1,0},{2,0,0,0},{-2,0,0,0},{0,2,0,0},{0,-2,0,0},{0,0,-2,0}};
        static const int K4[30][4] = {{1,0,0,0},{-1,0,0,0},{0,1,0,0},{0,-1,0,0},{0,0,-1,0},{0,0,0,1},{0,0,0,-1},{1,1,0,0},{1,-1,0,0},{-1,1,0,0},{-1,-1,0,0},
            {1,0,-1,0},{-1,0,-1,0},{0,1,-1,0},{0,-1,-1,0},{1,0,0,1},{-1,0,0,1},{0,1,0,1},{0,-1,0,1},{1,0,0,-1},{-1,0,0,-1},{0,1,0,-1},{0,-1,0,-1},
            {2,0,0,0},{-2,0,0,0},{0,2,0,0},{0,-2,0,0},{0,0,-2,0},{0,0,0,2},{0,0,0,-2}};
        int nk = DIM == 4 ? 30 : 18;
        for (int k = 0; k < nk; k++) {
            const int* kk = DIM == 4 ? K4[k] : K3[k];
            if (checkRot(tmp, kk[0], kk[1], kk[2], kk[3])) {
                bp[0] += kk[0]; bp[1] += kk[1]; bp[2] += kk[2]; bp[3] += kk[3];
                applyRot(tmp); return 0;
            }
        }
        return 1;
    }

    // ------------------------------------------------------------------ pierce / cancel column resolution
    static int resolveColumn(const int16_t* col, int n, int16_t* out) {
        int m = 0;
        for (int k = 0; k < n; k++) {
            out[m++] = col[k];
            bool changed = true;
            while (changed && m >= 2) {
                changed = false;
                int top = out[m - 1], below = out[m - 2];
                bool t30 = (top & 255) == 30, t31 = (top & 255) == 31, b30 = (below & 255) == 30, b31 = (below & 255) == 31;
                bool ts = t30 || t31, bs = b30 || b31;
                if (t30 && !bs) { out[m - 2] = out[m - 1]; m -= 1; changed = true; }
                else if (t30 && b30) { m -= 2; changed = true; }
                else if ((t30 && b31) || (t31 && b30)) { m -= 2; changed = true; }
                else if ((t31 && !bs) || (!ts && b31)) { m -= 2; changed = true; }
            }
        }
        return m;
    }
    void resolveAllColumns() {
        for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) {
            int16_t col[26], res[26]; int n = 0;
            for (int z = 0; z < 26; z++) { int v = blk[bidx(x, y, z, w)]; if (v != 0) col[n++] = (int16_t)v; }
            int m = resolveColumn(col, n, res);
            for (int z = 0; z < 26; z++) blk[bidx(x, y, z, w)] = z < m ? res[z] : 0;
        }
    }

    bool pieceEmpty() const { const int16_t* b = P[now]; for (int i = 0; i < NP; i++) if (b[i]) return false; return true; }

    // ------------------------------------------------------------------ movement
    int moveFn(int pos, int deg) {
        const int16_t* nb = P[now];
        {
            int tp[4] = {bp[0], bp[1], bp[2], bp[3]}; tp[pos] += deg;
            if (nowhb == 0) {
                for (int i = 0; i < NP; i++) {
                    if (!nb[i]) continue;
                    int bx = PXd[i] + tp[0], by = PYd[i] + tp[1], bz = PZd[i] + tp[2], bw = PWd[i] + tp[3];
                    if (bx < 0 || bx > 6 || by < 0 || by > 6 || bz < 0 || bz > 25 || bw < 0 || bw > NW - 1) return 1;
                    int cell = blk[bidx(bx, by, bz, bw)], my = nb[i];
                    if ((cell == 31 && my != 31) || (my == 31 && cell != 0 && cell != 31)) continue;
                    if (cell != 0) return 1;
                }
            } else if (nowhb == 1) {
                for (int i = 0; i < NP; i++) {
                    if (!nb[i]) continue;
                    int bx = PXd[i] + tp[0], by = PYd[i] + tp[1], bz = PZd[i] + tp[2], bw = PWd[i] + tp[3];
                    if (bx < 0 || bx > 6 || by < 0 || by > 6 || bz < 0 || bz > 25 || bw < 0 || bw > NW - 1) return 1;
                }
            }
        }
        for (;;) {
            bool restart = false;
            for (int d = 0; d < 4; d++) bpt[d] = bp[d];
            bpt[pos] += deg;
            int16_t* nbp = P[now];
            for (int i = 0; i < NP; i++) {
                if (nbp[i] == 0) continue;
                int bx = PXd[i] + bpt[0], by = PYd[i] + bpt[1], bz = PZd[i] + bpt[2], bw = PWd[i] + bpt[3];
                if (bx < 0 || bx > 6 || by < 0 || by > 6 || bw < 0 || bw > NW - 1) return 1;
                if (bz < 0) return 1;
                if (bz > 25) return 1;
                int id = bidx(bx, by, bz, bw);
                int cell = blk[id];
                if (nowhb == 0) {
                    if (cell == 31 && nbp[i] != 31) {
                        blk[id] = 0; nbp[i] = 0;
                        if (pieceEmpty()) setnextblock();
                        score += 40; ev.gain += 40; restart = true; break;
                    }
                    if (nbp[i] == 31 && cell != 0 && cell != 31) {
                        blk[id] = 0; nbp[i] = 0;
                        if (pieceEmpty()) setnextblock();
                        score += 40; ev.gain += 40; restart = true; break;
                    }
                    if (cell) return 1;
                } else if (nowhb == 1) {
                    if (cell == 31 || cell == 30) {
                        blk[id] = 0; nbp[i] = 0;
                        if (pieceEmpty()) setnextblock();
                        score += 40; ev.gain += 40; restart = true; break;
                    }
                    blk[id] = 0;
                }
            }
            if (restart) continue;
            for (int d = 0; d < 4; d++) bp[d] = bpt[d];
            return 0;
        }
    }

    // ------------------------------------------------------------------ lines
    // ------------------------------------------------------------------ battle mode (items are stored, then used on demand)
    bool battle; int16_t q[10]; int qn; int bq[16], nbq, tie[4]; int itemScale;      // position items wait for a single cube of their own: tie[slot] = the item of the block in that slot
    static bool storable(int code) {
        if (slotOf[code] < 0) return false;
        return !(code == 1 || code == 30 || code == 31 || code == 32 || code == 103 || (code >= 120 && code <= 123));
    }
    static bool positional(int code) { return code == 118 || code == 126 || code == 105 || code == 106 || code == 102; }
    // effect of ONE item cell (code) at (x, y, z, w); tline collects the +/- line items. Returns -1 when the board was wiped (full clear).
    int applyCell(int code, int x, int y, int z, int w, int& tline) {
        int id = bidx(x, y, z, w);
        bool enf = reinforce > 0;
        (void)id;
            if (code == 116) { tline -= enf ? 4 : 2; blk[id] = 256; }
            else if (code == 117) { tline += enf ? 4 : 2; blk[id] = 256; }
            else if (code == 118) {
                blk[id] = 256; int R = enf ? 2 : 1;
                for (int x2 = x - R; x2 <= x + R; x2++) for (int y2 = y - R; y2 <= y + R; y2++)
                    for (int w2 = (DIM == 4 ? w - R : 0); w2 <= (DIM == 4 ? w + R : 0); w2++)
                        if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && w2 >= 0 && w2 < NW) for (int z2 = 0; z2 < 26; z2++) blk[bidx(x2, y2, z2, w2)] |= 256;
            } else if (code == 119) { memset(blk, 0, sizeof(blk)); return -1; }
            else if (code == 104) { simplify2 = 0; pentaForce = 0; monoonly += enf ? 22 : 11; blk[id] = 256; }
            else if (code == 124) { tline -= enf ? 6 : 3; blk[id] = 256; }
            else if (code == 125) { tline += enf ? 2 : 1; blk[id] = 256; }
            else if (code == 91) { spinlock += enf ? 20 : 10; blk[id] = 256; }
            else if (code == 8) { speedup += enf ? 20 : 10; blk[id] = 256; }
            else if (code == 9) { speeddown += enf ? 20 : 10; blk[id] = 256; }
            else if (code == 10) { holdlock += enf ? 30 : 15; blk[id] = 256; }
            else if (code == 16) { blindUntil = nowT + (enf ? 20000 : 10000); blk[id] = 256; }
            else if (code == 17) { bombnext += enf ? 12 : 6; blk[id] = 256; }
            else if (code == 20) { compactPending = true; blk[id] = 256; }
            else if (code == 21) { monoonly = 0; pentaForce = 0; simplify2 += enf ? 18 : 9; blk[id] = 256; }
            else if (code == 22) { monoonly = 0; simplify2 = 0; pentaForce += enf ? 18 : 9; blk[id] = 256; }
            else if (code == 2) { hideblock += enf ? 20 : 10; blk[id] = 256; }
            else if (code == 6) { hidenext += enf ? 40 : 20; blk[id] = 256; }
            else if (code == 5) {
                if (enf) {
                    int mn = 1 << 30;
                    for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int z2 = 0; z2 < 26; z2++) for (int w2 = 0; w2 < NW; w2++) {
                        int v = blk[bidx(x2, y2, z2, w2)];
                        if (DIM == 3) { if (v != 0 && v != 256) { int cv = 33 + (v % 31); if (cv < mn) mn = cv; } }
                        else { int vv = v & 255; if (vv != 0) { int cv = 33 + (vv % 31); if (cv < mn) mn = cv; } }
                    }
                    if (mn != (1 << 30)) {
                        for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int z2 = 0; z2 < 26; z2++) for (int w2 = 0; w2 < NW; w2++) {
                            int i2 = bidx(x2, y2, z2, w2);
                            if (DIM == 3) { if (blk[i2] != 0 && blk[i2] != 256) blk[i2] = mn; }
                            else { if ((blk[i2] & 255) != 0) blk[i2] = (blk[i2] & 256) + mn; }
                        }
                    }
                } else {
                    for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int z2 = 0; z2 < 26; z2++) for (int w2 = 0; w2 < NW; w2++) {
                        int i2 = bidx(x2, y2, z2, w2);
                        if (blk[i2] != 0 && blk[i2] != 256) blk[i2] = 33 + (blk[i2] % 31);
                    }
                }
                blk[id] = 256;
            } else if (code == 204) { reinforce = 20; blk[id] = 256; }
            else if (code == 4) { if (!battle) score2x += enf ? 2 : 1; blk[id] = 256; }
            else if (code == 11) {
                blk[id] = 256; int count2 = 0;
                for (int i = 0; i < 50; i++) {
                    int rx = ri(6), ry = ri(6), rz = ri(6), rw = DIM == 4 ? ri(6) : 0;
                    if (blk[bidx(rx, ry, rz, rw)] == 0 && blk[bidx(rx + 1, ry, rz, rw)] == 0 && blk[bidx(rx, ry + 1, rz, rw)] == 0 && blk[bidx(rx, ry, rz + 1, rw)] == 0) {
                        count2++; blk[bidx(rx, ry, rz, rw)] = 103;
                    }
                    if (count2 == (enf ? 5 : 3)) break;
                }
            } else if (code == 102) {
                for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int z2 = z; z2 < 26; z2++) for (int w2 = 0; w2 < NW; w2++) blk[bidx(x2, y2, z2, w2)] = 256;
            } else if (code == 105) {
                blk[id] = 256; int R = enf ? 2 : 1;
                for (int x2 = x - R; x2 <= x + R; x2++) if (x2 >= 0 && x2 < 7)
                    for (int y2 = 0; y2 < 7; y2++) for (int z2 = 0; z2 < 26; z2++) for (int w2 = 0; w2 < NW; w2++) blk[bidx(x2, y2, z2, w2)] |= 256;
            } else if (code == 126) {
                blk[id] = 256; int R = enf ? 2 : 1;
                for (int x2 = 0; x2 < 7; x2++) for (int y2 = y - R; y2 <= y + R; y2++) if (y2 >= 0 && y2 < 7)
                    for (int z2 = 0; z2 < 26; z2++) for (int w2 = 0; w2 < NW; w2++) blk[bidx(x2, y2, z2, w2)] |= 256;
            } else if (DIM == 4 && code == 106) {
                blk[id] = 256; int R = enf ? 2 : 1;
                for (int w2 = w - R; w2 <= w + R; w2++) if (w2 >= 0 && w2 < 7)
                    for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int z2 = 0; z2 < 26; z2++) blk[bidx(x2, y2, z2, w2)] |= 256;
            } else if (code == 127) {
                int rate = enf ? 50 : 20; blk[id] |= 256;
                for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int z2 = 0; z2 < 26; z2++) for (int w2 = 0; w2 < NW; w2++) {
                    int i2 = bidx(x2, y2, z2, w2);
                    if ((blk[i2] & 255) != 0 && ri(100) < rate) blk[i2] = (blk[i2] & 256) + 120 + ri(4);
                }
            } else if (code == 18) {
                blk[id] |= 256;
                for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int z2 = 0; z2 < 26; z2++) for (int w2 = 0; w2 < NW; w2++) {
                    int i2 = bidx(x2, y2, z2, w2);
                    if ((blk[i2] & 255) != 0 && ri(100) < (enf ? 60 : 30)) blk[i2] = blk[i2] & 256;
                }
            } else if (code == 19) {
                blk[id] |= 256;
                if (enf) {
                    int maxZ = 0;
                    for (int z2 = 0; z2 < 26; z2++) for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int w2 = 0; w2 < NW; w2++)
                        if ((blk[bidx(x2, y2, z2, w2)] & 255) != 0 && z2 > maxZ) maxZ = z2;
                    std::vector<int> vals, occ, all;
                    for (int z2 = 0; z2 <= maxZ; z2++) for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int w2 = 0; w2 < NW; w2++) {
                        int i2 = bidx(x2, y2, z2, w2); all.push_back(i2);
                        int v = blk[i2] & 255; if (v != 0) { vals.push_back(v); occ.push_back(i2); }
                    }
                    for (int i2 : occ) blk[i2] = blk[i2] & 256;
                    for (int i = (int)all.size() - 1; i > 0; i--) { int j = ri(i + 1); std::swap(all[i], all[j]); }
                    for (size_t i = 0; i < vals.size(); i++) blk[all[i]] = (blk[all[i]] & 256) + vals[i];
                } else {
                    for (int z2 = 0; z2 < 26; z2++) {
                        std::vector<int> vals, pos;
                        for (int x2 = 0; x2 < 7; x2++) for (int y2 = 0; y2 < 7; y2++) for (int w2 = 0; w2 < NW; w2++) {
                            int i2 = bidx(x2, y2, z2, w2); int v = blk[i2] & 255; if (v != 0) vals.push_back(v); pos.push_back(i2);
                        }
                        for (int i2 : pos) blk[i2] = blk[i2] & 256;
                        for (int i = (int)pos.size() - 1; i > 0; i--) { int j = ri(i + 1); std::swap(pos[i], pos[j]); }
                        for (size_t i = 0; i < vals.size(); i++) blk[pos[i]] = (blk[pos[i]] & 256) + vals[i];
                    }
                }
            } else blk[id] |= 256;

        return 0;
    }

    int processLine(int& tline, int z, const int8_t (*co)[3], int n) {
        int tline2 = 0;
        for (int k = 0; k < n; k++) {
            int v = blk[bidx(co[k][0], co[k][1], z, co[k][2])];
            if (v == 0) return 0;
            if (v < 256) tline2++;
        }
        int filled = tline2 ? 1 : 0;
        bool mirror = false;
        for (int k = 0; k < n; k++) {
            int id = bidx(co[k][0], co[k][1], z, co[k][2]);
            if ((blk[id] & 255) == 200) {
                if (battle) { if (qn < 10) q[qn++] = 200; blk[id] = 256; }          // battle mode: stored (beyond 10 it is thrown away)
                else { mirror = true; blk[id] = blk[id] & 256; }
            }
        }
        bool enf = reinforce > 0;
        for (int k = 0; k < n; k++) {
            int x = co[k][0], y = co[k][1], w = co[k][2];
            int id = bidx(x, y, z, w);
            int code = blk[id] & 255;
            if (groupOf[code] >= 0 && code != 30 && code != 31) ev.trig[groupOf[code]]++;
            if (battle && storable(code)) {                         // battle mode: the item goes into the queue instead of taking effect
                if (qn < 10) q[qn++] = (int16_t)code;         // (beyond 10 the new item is thrown away)
                blk[id] = 256; continue;
            }
            if (applyCell(code, x, y, z, w, tline) < 0) return -1;
        }
        if (mirror) {
            for (int z2 = 0; z2 < 26; z2++) for (int y2 = 0; y2 < 7; y2++) for (int w2 = 0; w2 < NW; w2++) for (int i = 0; i < 3; i++) {
                int a = bidx(i, y2, z2, w2), b = bidx(6 - i, y2, z2, w2); std::swap(blk[a], blk[b]);
            }
        }
        return filled;
    }

    void compactColumns() { resolveAllColumns(); }

    // board clean-up after item effects: remove marked cells, +/- lines, gap clear. Returns the extra lines made by the gap clear.
    int settle(int tline) {
        int cl = 0;
        if (tline < 0) {
            for (int z = 0; z < -tline && z < 26; z++) for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) blk[bidx(x, y, z, w)] = 256;
            tline = 0;
        }
        for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) {
            int t = 0;
            for (int z = 0; z < 26; z++) { int v = blk[bidx(x, y, z, w)]; if (v < 256) { blk[bidx(x, y, t, w)] = v; t++; } }
            for (; t < 26; t++) blk[bidx(x, y, t, w)] = 0;
        }
        if (tline > 0) {
            ev.garb += tline;
            for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) {
                for (int z = 25 - tline; z > -1; z--) blk[bidx(x, y, z + tline, w)] = blk[bidx(x, y, z, w)];
                for (int t = 0; t < tline && t < 26; t++) {
                    blk[bidx(x, y, t, w)] = ri(2) != 0 ? 103 : 0;
                    if (x % 7 == (y + t) % 7) blk[bidx(x, y, t, w)] = 0;
                }
            }
            for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) for (int z = 9; z < 26; z++) if (blk[bidx(x, y, z, w)] != 0) ovf = true;
        }
        if (compactPending) {
            compactPending = false;
            compactColumns();
            for (int z = 0; z < 26; z++) {
                if (DIM == 3) {
                    for (int x = 0; x < 7; x++) {
                        bool full = true; for (int y = 0; y < 7; y++) if (blk[bidx(x, y, z, 0)] == 0) { full = false; break; }
                        if (full) { for (int y = 0; y < 7; y++) blk[bidx(x, y, z, 0)] = 0; cl++; }
                    }
                    for (int y = 0; y < 7; y++) {
                        bool full = true; for (int x = 0; x < 7; x++) if (blk[bidx(x, y, z, 0)] == 0) { full = false; break; }
                        if (full) { for (int x = 0; x < 7; x++) blk[bidx(x, y, z, 0)] = 0; cl++; }
                    }
                } else {
                    for (int w = 0; w < 7; w++) {
                        bool full = true; for (int x = 0; x < 7 && full; x++) for (int y = 0; y < 7 && full; y++) if (blk[bidx(x, y, z, w)] == 0) full = false;
                        if (full) { for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) blk[bidx(x, y, z, w)] = 0; cl++; }
                    }
                    for (int y = 0; y < 7; y++) {
                        bool full = true; for (int x = 0; x < 7 && full; x++) for (int w = 0; w < 7 && full; w++) if (blk[bidx(x, y, z, w)] == 0) full = false;
                        if (full) { for (int x = 0; x < 7; x++) for (int w = 0; w < 7; w++) blk[bidx(x, y, z, w)] = 0; cl++; }
                    }
                    for (int x = 0; x < 7; x++) {
                        bool full = true; for (int y = 0; y < 7 && full; y++) for (int w = 0; w < 7 && full; w++) if (blk[bidx(x, y, z, w)] == 0) full = false;
                        if (full) { for (int y = 0; y < 7; y++) for (int w = 0; w < 7; w++) blk[bidx(x, y, z, w)] = 0; cl++; }
                    }
                }
            }
            if (cl > 0) {
                compactColumns();
                lines += cl; score += 20 * cl; ev.gain += 20 * cl;
                level = (int)std::floor((score + 600) / 800.0) + 1; if (level > 16) level = 16;
            }
        }
        return cl;
    }

    void makeMono(int slot) {            // the block in `slot` becomes a plain single cell (never a special block)
        int16_t* nb = P[slot]; memset(nb, 0, sizeof(int16_t) * NP);
        const int16_t* r = rawOf(0);
        for (int i = 0; i < NP; i++) nb[i] = r[i] ? 12 : 0;      // the yellow single cube of the mono-only item (a plain block: never special)
        if (slot == nxt) nexthb = 0;
    }
    // use an item on this board (own item or one sent by the opponent). Position items act at the centre of the NEXT block to fall, which is made a single cube.
    void useItem(int code) {
        if (positional(code)) { if (!tie[nxt]) { makeMono(nxt); tie[nxt] = code; } else if (nbq < 16) bq[nbq++] = code; return; }
        int tl = 0; int id0 = bidx(0, 0, 0, 0), keep = blk[id0];
        int r = applyCell(code, 0, 0, 0, 0, tl);
        if (r >= 0 && blk[id0] == 256 && keep < 256 && code != 5 && code != 18 && code != 19 && code != 119 && code != 200) blk[id0] = keep;   // the used item is not a cell of the board
        settle(r < 0 ? 0 : tl);
        if (ovf) { ovf = false; over = true; }
    }
    void battleLocked() {          // a block has just been put on the board
        int code = tie[now];
        if (!code) return;
        tie[now] = 0;
        const int16_t* nb = P[now]; double sum[4] = {0, 0, 0, 0}; int n = 0;
        for (int i = 0; i < NP; i++) if (nb[i]) { sum[0] += PXd[i] + bp[0]; sum[1] += PYd[i] + bp[1]; sum[2] += PZd[i] + bp[2]; sum[3] += PWd[i] + bp[3]; n++; }
        if (!n) return;
        auto cl = [](double v, int hi) { int r = (int)std::floor(v + 0.5); return std::min(hi, std::max(0, r)); };
        int cx = cl(sum[0] / n, 6), cy = cl(sum[1] / n, 6), cz = cl(sum[2] / n, 25), cw = DIM == 4 ? cl(sum[3] / n, 6) : 0;
        int tl = 0; int r = applyCell(code, cx, cy, cz, cw, tl); settle(r < 0 ? 0 : tl);
    }

    int removeline() {
        if (spinlock > 0) spinlock--; if (hideblock > 0) hideblock--; if (hidenext > 0) hidenext--;
        if (speedup > 0) speedup--; if (speeddown > 0) speeddown--; if (holdlock > 0) holdlock--;
        int filledline = 0, tline = 0;
        int8_t co[49][3];
        if (DIM == 3) {
            for (int x = 0; x < 7; x++) for (int z = 0; z < 26; z++) {
                for (int y = 0; y < 7; y++) { co[y][0] = x; co[y][1] = y; co[y][2] = 0; }
                int r = processLine(tline, z, co, 7); if (r < 0) return 0; filledline += r;
            }
            for (int y = 0; y < 7; y++) for (int z = 0; z < 26; z++) {
                for (int x = 0; x < 7; x++) { co[x][0] = x; co[x][1] = y; co[x][2] = 0; }
                int r = processLine(tline, z, co, 7); if (r < 0) return 0; filledline += r;
            }
        } else {
            for (int w = 0; w < 7; w++) {
                for (int x = 0; x < 7; x++) for (int z = 0; z < 26; z++) {
                    for (int y = 0; y < 7; y++) { co[y][0] = x; co[y][1] = y; co[y][2] = w; }
                    int r = processLine(tline, z, co, 7); if (r < 0) return 0; filledline += r;
                }
                for (int y = 0; y < 7; y++) for (int z = 0; z < 26; z++) {
                    for (int x = 0; x < 7; x++) { co[x][0] = x; co[x][1] = y; co[x][2] = w; }
                    int r = processLine(tline, z, co, 7); if (r < 0) return 0; filledline += r;
                }
            }
            for (int y = 0; y < 7; y++) for (int z = 0; z < 26; z++) {
                int n = 0; for (int x = 0; x < 7; x++) for (int w = 0; w < 7; w++) { co[n][0] = x; co[n][1] = y; co[n][2] = w; n++; }
                int r = processLine(tline, z, co, n); if (r < 0) return 0; filledline += r;
            }
            for (int x = 0; x < 7; x++) for (int z = 0; z < 26; z++) {
                int n = 0; for (int y = 0; y < 7; y++) for (int w = 0; w < 7; w++) { co[n][0] = x; co[n][1] = y; co[n][2] = w; n++; }
                int r = processLine(tline, z, co, n); if (r < 0) return 0; filledline += r;
            }
        }
        filledline += settle(tline);
        if (filledline != 0) filledline += removeline();
        return filledline;
    }

    int stickblock() {
        asc = 0;
        const int16_t* nb = P[now];
        for (int i = 0; i < NP; i++) {
            if (!nb[i]) continue;
            int x = PXd[i], y = PYd[i], z = PZd[i], w = PWd[i];
            int bx = x + bp[0], by = y + bp[1], bz = z + bp[2], bw = w + bp[3];
            bool above = (bz + 1 >= 26) ? (DIM == 3) : (blk[bidx(bx, by, bz + 1, bw)] != 0);
            if (!above) continue;
            int it = 0, jt = 0;
            if (bz == 0 || blk[bidx(bx, by, bz - 1, bw)] != 0) it++;
            if (by == 6 || blk[bidx(bx, by + 1, bz, bw)] != 0) it++;
            if (y != 6 && nb[pidx(x, y + 1, z, w)] != 0) jt++;
            if (by == 0 || blk[bidx(bx, by - 1, bz, bw)] != 0) it++;
            if (y != 0 && nb[pidx(x, y - 1, z, w)] != 0) jt++;
            if (bx == 6 || blk[bidx(bx + 1, by, bz, bw)] != 0) it++;
            if (x != 6 && nb[pidx(x + 1, y, z, w)] != 0) jt++;
            if (bx == 0 || blk[bidx(bx - 1, by, bz, bw)] != 0) it++;
            if (x != 0 && nb[pidx(x - 1, y, z, w)] != 0) jt++;
            if (DIM == 4) {
                if (bw == 6 || blk[bidx(bx, by, bz, bw + 1)] != 0) it++;
                if (w != 6 && nb[pidx(x, y, z, w + 1)] != 0) jt++;
                if (bw == 0 || blk[bidx(bx, by, bz, bw - 1)] != 0) it++;
                if (w != 0 && nb[pidx(x, y, z, w - 1)] != 0) jt++;
            }
            if (jt < 3 && it + jt > 3) asc++;
        }
        if (asc != 0) asc--;
        if (asc != 0) { int gt = 50 * (int)std::pow(4.0, asc); score += gt; ev.gain += gt; }
        for (int i = 0; i < NP; i++) {
            if (!nb[i]) continue;
            if (PZd[i] + bp[2] > 8) return 1;
            blk[bidx(PXd[i] + bp[0], PYd[i] + bp[1], PZd[i] + bp[2], PWd[i] + bp[3])] = nb[i];
        }
        for (int i = 0; i < NP; i++) { int c = nb[i] & 255; if (nb[i] && groupOf[c] >= 0) ev.placed[groupOf[c]]++; }
        int R = reinforce > 0 ? 2 : 1;
        for (int i = 0; i < NP; i++) {
            if (nb[i] != 0 && (nb[i] & 255) == 1) {
                int bx = PXd[i] + bp[0], by = PYd[i] + bp[1], bz = PZd[i] + bp[2], bw = PWd[i] + bp[3];
                for (int x2 = bx - R; x2 <= bx + R; x2++) for (int y2 = by - R; y2 <= by + R; y2++) for (int z2 = bz - R; z2 <= bz + R; z2++)
                    for (int w2 = (DIM == 4 ? bw - R : 0); w2 <= (DIM == 4 ? bw + R : 0); w2++)
                        if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && z2 >= 0 && z2 < 26 && w2 >= 0 && w2 < NW) blk[bidx(x2, y2, z2, w2)] = 0;
            }
        }
        if (nowhb == 1) resolveAllColumns();
        if (battle) battleLocked();
        return setnextblock();
    }

    void calculatescore(int line) {
        if (reinforce > 0 && line > 0) reinforce = std::max(0, reinforce - line);
        lines += line;
        if (score2x > 2) score2x = 2;
        int before = score;
        double add = std::floor(20.0 * line * std::sqrt((double)line) * std::pow(4.0, score2x)) * std::pow(4.0, asc);
        double s = score + add; if (s > 999999999) s = 999999999;
        score = (int)s; score2x = 0;
        level = (int)std::floor((score + 600) / 800.0) + 1; if (level > 16) level = 16;
        ev.gain += score - before; ev.lines += line;
    }

    void tryHoldSwap() {
        if (hidenext != 0) return;
        if (holdlock != 0) return;
        const int16_t* hb = P[hld];
        for (int i = 0; i < NP; i++) {
            if (!hb[i]) continue;
            int bx = PXd[i] + bp[0], by = PYd[i] + bp[1], bz = PZd[i] + bp[2], bw = PWd[i] + bp[3];
            if (bx < 0 || bx > 6) return;
            if (by < 0 || by > 6) return;
            if (bz < 0) return;
            if (DIM == 4 && (bw < 0 || bw > 6)) return;
            int hc = blk[bidx(bx, by, bz, bw)];   // (z above 25 cannot happen at spawn height)
            if (hc != 0) { if (holdhb == 1 && hc != 31 && hc != 30) continue; return; }
        }
        std::swap(hld, now); std::swap(holdhb, nowhb);
        if (DIM == 3 && nowhb == 1) {
            const int16_t* nb = P[now];
            for (int i = 0; i < NP; i++) {
                if (!nb[i]) continue;
                int bx = PXd[i] + bp[0], by = PYd[i] + bp[1], bz = PZd[i] + bp[2];
                if (bx >= 0 && bx <= 6 && by >= 0 && by <= 6 && bz >= 0 && bz <= 25 && blk[bidx(bx, by, bz, 0)] != 0) blk[bidx(bx, by, bz, 0)] = 0;
            }
        }
        ev.hold++;
    }

    // Enter key: hard drop and placement. returns: 0 = placed, 1 = game over, 2 = the piece was destroyed in flight (next piece spawned)
    int hardDrop() {
        int hb = now;
        while (!moveFn(2, -1)) { if (now != hb) break; }
        if (now != hb) return 2;
        if (stickblock()) { over = true; return 1; }
        int l = removeline(); calculatescore(l);
        if (ovf) { ovf = false; over = true; return 1; }
        return 0;
    }

    void initGame() {
        nowhb = nexthb = holdhb = 0; score = lines = 0; level = 1; asc = 0; monoonly = spinlock = hideblock = hidenext = score2x = speedup = speeddown = holdlock = 0;
        bombnext = simplify2 = pentaForce = reinforce = rfUpgrade = 0; compactPending = false; over = false; ovf = false; blindUntil = 0;
        memset(blk, 0, sizeof(blk)); qn = 0; nbq = 0; tie[0] = tie[1] = tie[2] = tie[3] = 0;
        now = 0; nxt = 1; hld = 2;
        memset(P[hld], 0, sizeof(int16_t) * NP);
        int c = pidx(3, 3, 3, DIM == 4 ? 3 : 0);
        if (items) {
            int hv = 4; int mr = ri(100);
            if (mr < 10) hv = 1;
            else if (mr < 20) { hv = 30; holdhb = 1; }
            else if (mr < 60) hv = 31;
            else {
                int u = ri(250000);
                // hold-item table (cumulative thresholds differ slightly between the games)
                if (DIM == 3) {
                    static const int T[][2] = {{100,116},{400,117},{700,118},{720,119},{1520,104},{2020,120},{3020,121},{3720,122},{4020,123},{4070,124},{4870,125},{5120,91},
                        {5220,102},{5420,126},{5620,105},{5920,127},{6020,17},{6220,20},{7020,21},{7820,22},{8070,16},{8270,11},{8520,2},{9520,8},{10520,9},{10770,10},
                        {11770,5},{12020,6},{12320,204},{14570,120},{24570,200},{24870,19},{25170,18}};
                    for (auto& t : T) if (u < t[0]) { hv = t[1]; break; }
                } else {
                    static const int T[][2] = {{100,116},{400,117},{700,118},{720,119},{1520,104},{2020,120},{3020,121},{3720,122},{4020,123},{4070,124},{4870,125},{5120,91},
                        {5220,102},{5420,126},{5620,105},{5820,106},{6120,127},{6220,17},{6420,20},{7220,21},{8020,22},{8270,16},{8470,11},{8720,2},{9720,8},{10720,9},
                        {10970,10},{11970,5},{12220,6},{12520,204},{14770,120},{24770,200},{25070,19},{25370,18}};
                    for (auto& t : T) if (u < t[0]) { hv = t[1]; break; }
                }
            }
            if (battle && hv == 4 && ri(16) != 0) hv = 65;      // battle mode: the score-boost block is 1/16 as common
            P[hld][c] = hv;
        } else P[hld][c] = 65;
        setnextblock(); setnextblock();
        memset(&ev, 0, sizeof(ev));
    }
    double fallInterval() const {
        double fi = 6000.0 / (std::min(level, 12) / 3.0 + 5.0);
        if (speedup > 0) fi *= reinforce > 0 ? 0.2 : 0.4;
        if (speeddown > 0) fi *= reinforce > 0 ? 5.0 : 2.5;
        return fi;
    }
};

// ====================================================================== features
constexpr int NCOL = 49 * NW;
constexpr int NLAY = 10;
constexpr int NDEF = DIM == 4 ? 4 : 2;
constexpr int NSCAL = 24;
constexpr int PDESC = DIM + 2;
constexpr int NF = NCOL * 2 + NLAY + NLAY * NDEF + NSCAL + 2 * PDESC;
constexpr int ID_BOARD = NTS * 26;
constexpr int ID_NEXT = ID_BOARD;
constexpr int ID_HOLD = ID_BOARD + NTS;
constexpr int NIDS = ID_BOARD + 2 * NTS;

struct Obs { bool blind, hideNext; };

static void pieceDesc(const int16_t* b, float* f, int16_t* ids, int& nid, int idBase) {
    int n = 0, lo[4] = {9, 9, 9, 9}, hi[4] = {-1, -1, -1, -1};
    for (int i = 0; i < NP; i++) {
        if (!b[i]) continue;
        n++; int c4[4] = {PXd[i], PYd[i], PZd[i], PWd[i]};
        for (int d = 0; d < DIM; d++) { lo[d] = std::min(lo[d], c4[d]); hi[d] = std::max(hi[d], c4[d]); }
        int s = slotOf[b[i] & 255];
        if (s >= 0 && nid < KIDS) ids[nid++] = (int16_t)(idBase + s);
    }
    f[0] = n / 20.0f;
    float ex[4]; for (int d = 0; d < DIM; d++) ex[d] = n ? (hi[d] - lo[d] + 1) / 7.0f : 0.f;
    std::sort(ex, ex + DIM);
    for (int d = 0; d < DIM; d++) f[1 + d] = ex[d];
    f[1 + DIM] = n ? 1.f : 0.f;
}

// features of the afterstate in c. visible board = c.blk; pieces that fall next / are held are shown unless hidden.
static void fillFeatures(const G& c, bool blind, float* f, int16_t* ids) {
    int nid = 0; memset(f, 0, sizeof(float) * NF);
    int hgt[NCOL]; int holes[NCOL];
    int maxh = 0, totHoles = 0, ncell = 0;
    int layCnt[NLAY] = {0};
    for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) {
        int col = (x * 7 + y) * NW + w, top = -1, occ = 0;
        for (int z = 0; z < 26; z++) {
            int v = c.blk[bidx(x, y, z, w)];
            if (v) { top = z; occ++; if (z < NLAY) layCnt[z]++; int s = slotOf[v & 255]; if (s >= 0 && nid < KIDS - 8) ids[nid++] = (int16_t)(s * 26 + z); }
        }
        hgt[col] = top + 1; holes[col] = top + 1 - occ; maxh = std::max(maxh, top + 1); totHoles += holes[col]; ncell += occ;
    }
    for (int i = 0; i < NCOL; i++) { f[i] = std::min(hgt[i], 15) / 9.0f; f[NCOL + i] = std::min(holes[i], 15) / 9.0f; }
    int o = 2 * NCOL;
    for (int z = 0; z < NLAY; z++) f[o + z] = layCnt[z] / (float)NCOL;
    o += NLAY;
    for (int z = 0; z < NLAY; z++) {
        if (DIM == 3) {
            int mx = 7, my = 7;
            for (int x = 0; x < 7; x++) { int k = 0; for (int y = 0; y < 7; y++) if (c.blk[bidx(x, y, z, 0)]) k++; mx = std::min(mx, 7 - k); }
            for (int y = 0; y < 7; y++) { int k = 0; for (int x = 0; x < 7; x++) if (c.blk[bidx(x, y, z, 0)]) k++; my = std::min(my, 7 - k); }
            f[o + z * 2] = mx / 7.0f; f[o + z * 2 + 1] = my / 7.0f;
        } else {
            int mx = 7, my = 7, mp1 = 49, mp2 = 49;
            for (int w = 0; w < 7; w++) {
                for (int x = 0; x < 7; x++) { int k = 0; for (int y = 0; y < 7; y++) if (c.blk[bidx(x, y, z, w)]) k++; mx = std::min(mx, 7 - k); }
                for (int y = 0; y < 7; y++) { int k = 0; for (int x = 0; x < 7; x++) if (c.blk[bidx(x, y, z, w)]) k++; my = std::min(my, 7 - k); }
            }
            for (int y = 0; y < 7; y++) { int k = 0; for (int x = 0; x < 7; x++) for (int w = 0; w < 7; w++) if (c.blk[bidx(x, y, z, w)]) k++; mp1 = std::min(mp1, 49 - k); }
            for (int x = 0; x < 7; x++) { int k = 0; for (int y = 0; y < 7; y++) for (int w = 0; w < 7; w++) if (c.blk[bidx(x, y, z, w)]) k++; mp2 = std::min(mp2, 49 - k); }
            f[o + z * 4] = mx / 7.0f; f[o + z * 4 + 1] = my / 7.0f; f[o + z * 4 + 2] = mp1 / 49.0f; f[o + z * 4 + 3] = mp2 / 49.0f;
        }
    }
    o += NLAY * NDEF;
    int bump = 0;
    for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) {
        int h0 = hgt[(x * 7 + y) * NW + w];
        if (x < 6) bump += std::abs(h0 - hgt[((x + 1) * 7 + y) * NW + w]);
        if (y < 6) bump += std::abs(h0 - hgt[(x * 7 + y + 1) * NW + w]);
        if (NW > 1 && w < 6) bump += std::abs(h0 - hgt[(x * 7 + y) * NW + w + 1]);
    }
    float* s = f + o;
    s[0] = maxh / 10.0f; s[1] = totHoles / (float)(NCOL) ; s[2] = bump / (float)(NCOL * 2); s[3] = ncell / (float)(NCOL * 4); s[4] = c.level / 16.0f;
    s[5] = c.speedup > 0; s[6] = c.speeddown > 0; s[8] = c.hideblock > 0;
    s[11] = c.spinlock > 0; s[13] = c.hidenext > 0; s[14] = blind;
    s[22] = c.nowhb; s[23] = c.holdhb;      // (other slots stay 0: those counters are not visible to a player)
    o += NSCAL;
    if (c.hidenext == 0) {
        pieceDesc(c.P[c.now], f + o, ids, nid, ID_NEXT);
        pieceDesc(c.P[c.hld], f + o + PDESC, ids, nid, ID_HOLD);
    }
    for (int i = nid; i < KIDS; i++) ids[i] = -1;
}

static void summarize(const Ev& e, const G* c, int maxh0, int holes0, float* s, bool hideBoard = false) {
    memset(s, 0, sizeof(float) * SD);
    s[0] = e.lines / 4.0f; s[1] = e.gain / 200.0f; s[2] = e.boom / 4.0f; s[3] = e.garb / 4.0f; s[4] = e.hold;
    for (int g = 0; g < 12; g++) { s[5 + g] = e.trig[g] / 3.0f; s[17 + g] = e.placed[g] / 3.0f; }
    if (c) {
        int maxh = 0, holes = 0;
        for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) {
            int top = -1, occ = 0;
            for (int z = 0; z < 26; z++) if (c->blk[bidx(x, y, z, w)]) { top = z; occ++; }
            maxh = std::max(maxh, top + 1); holes += top + 1 - occ;
        }
        if (!hideBoard) { s[29] = (maxh - maxh0) / 3.0f; s[30] = (holes - holes0) / (float)(NCOL / 2 + 5); }
        s[31] = c->blindUntil > c->nowT; s[32] = c->hidenext > 0; s[33] = c->speedup > 0; s[34] = c->speeddown > 0;
        s[35] = c->spinlock > 0; s[36] = c->hideblock > 0;
    }
}
static void boardStats(const G& g, int& maxh, int& holes) {
    maxh = 0; holes = 0;
    for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) {
        int top = -1, occ = 0;
        for (int z = 0; z < 26; z++) if (g.blk[bidx(x, y, z, w)]) { top = z; occ++; }
        maxh = std::max(maxh, top + 1); holes += top + 1 - occ;
    }
}

// ====================================================================== candidates
struct Plan { int8_t hd, nrot; uint8_t rot[10]; int8_t d[4]; };
struct Node { int16_t p[NP]; uint8_t seq[10]; int depth; int lo[4], hi[4]; };

static uint64_t hashPiece(const int16_t* p, int* lo) {
    uint64_t h = 1469598103934665603ull;
    for (int i = 0; i < NP; i++) {
        int v = p[i]; if (!v) continue;
        int k = pidx(PXd[i] - lo[0], PYd[i] - lo[1], PZd[i] - lo[2], PWd[i] - lo[3]) * 1000 + v;
        h = (h ^ (uint64_t)k) * 1099511628211ull;
    }
    return h;
}
static void bbox(const int16_t* p, int* lo, int* hi) {
    for (int d = 0; d < 4; d++) { lo[d] = 9; hi[d] = -1; }
    for (int i = 0; i < NP; i++) if (p[i]) {
        int c4[4] = {PXd[i], PYd[i], PZd[i], PWd[i]};
        for (int d = 0; d < 4; d++) { lo[d] = std::min(lo[d], c4[d]); hi[d] = std::max(hi[d], c4[d]); }
    }
}
constexpr int ROT_DEPTH = DIM == 4 ? 6 : 4;
constexpr int MAXNODES = DIM == 4 ? 400 : 120;

// orientations reachable from the piece in `pc` by single-axis 90-degree rotations (free space), keyed by canonical shape
static int enumNodes(const int16_t* start, int spin, std::vector<Node>& out) {
    out.clear();
    Node n0; memcpy(n0.p, start, sizeof(n0.p)); n0.depth = 0; memset(n0.seq, 0, sizeof(n0.seq)); bbox(n0.p, n0.lo, n0.hi);
    std::vector<uint64_t> keys; keys.push_back(hashPiece(n0.p, n0.lo)); out.push_back(n0);
    if (spin) return 1;
    int16_t scratch[NP];
    for (size_t qi = 0; qi < out.size(); qi++) {
        if (out[qi].depth >= ROT_DEPTH) continue;
        for (int pos = 0; pos < NPOS; pos++) for (int dg = 0; dg < 2; dg++) {
            Node nn; nn.depth = out[qi].depth + 1; memcpy(nn.seq, out[qi].seq, sizeof(nn.seq)); nn.seq[out[qi].depth] = (uint8_t)(pos * 2 + dg);
            G::rotShape(out[qi].p, nn.p, scratch, pos, dg == 0 ? -1 : 1);
            bbox(nn.p, nn.lo, nn.hi);
            uint64_t h = hashPiece(nn.p, nn.lo);
            bool dup = false; for (uint64_t k : keys) if (k == h) { dup = true; break; }
            if (dup) continue;
            keys.push_back(h); out.push_back(nn);
            if ((int)out.size() >= MAXNODES) return (int)out.size();
        }
    }
    return (int)out.size();
}

// what the agent can NOT see is removed from the state it plans on: effect counters the game never shows (reinforce, mono/simplify/penta
// force, hold lock, score x4, pending gap clear, bomb-next) and, while "conceal" is active, the item values of the falling piece (it is drawn
// as a faint wireframe). Visible: spin lock (rotation controls vanish), hide-next, blind, speed (the piece visibly falls faster / slower).
static void maskRoot(G& r) {
    r.reinforce = 0; r.monoonly = 0; r.simplify2 = 0; r.pentaForce = 0; r.bombnext = 0; r.holdlock = 0; r.score2x = 0; r.compactPending = false;
    if (r.hideblock > 0) { int16_t* p = r.P[r.now]; for (int i = 0; i < NP; i++) if (p[i]) p[i] = 98; r.nowhb = 0; }
}

struct Cand {
    Plan plan; bool dead; int lines, gain;
    float feat[NF]; int16_t ids[KIDS]; float sum[SD];
};

static uint32_t trialSeed(uint32_t seed0, uint32_t dec) { return (uint32_t)(seed0 + (uint32_t)((int32_t)dec * (int32_t)0x9E3779B1)) ^ 0x9E3779B9u; }

struct Env {
    G g; G bel; bool belValid; uint32_t seed0, dec; int pieces; int first; int restarted;
    int lastMaxh; float sa[SD]; int holdBan;
    // observation: the board the agent can see
    bool blindNow() const { return g.items && g.blindUntil > g.nowT; }
    // statistics
    long long stat[64];
};

// builds the root game the agent plans on (belief board while blind) and generates candidates
struct Tup { int8_t hd; int16_t ni; int8_t bx, by, bw; int H; int order; };

static int genCands(Env& e, Cand* out, int cap) {
    bool blind = e.blindNow();
    G root = e.g;
    if (blind && e.belValid) memcpy(root.blk, e.bel.blk, sizeof(root.blk));
    double fi = root.fallInterval();      // the fall speed itself is visible
    maskRoot(root);
    int maxh0, holes0; boardStats(root, maxh0, holes0);
    uint32_t ts = trialSeed(e.seed0, e.dec);
    int maxOcc = maxh0;
    int hmap[NCOL];
    for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) {
        int top = -1; for (int z = 25; z >= 0; z--) if (root.blk[bidx(x, y, z, w)]) { top = z; break; }
        hmap[(x * 7 + y) * NW + w] = top + 1;
    }
    std::vector<Node> nodes[2]; G bases[2]; bool okHd[2] = {true, false};
    std::vector<Tup> tups; tups.reserve(4096);
    int order = 0;
    for (int hd = 0; hd < 2; hd++) {
        bases[hd] = root;
        if (hd == 1) {
            if (e.holdBan) continue;
            int nowBefore = bases[1].now; bases[1].tryHoldSwap();
            if (bases[1].now == nowBefore) continue;
            okHd[1] = true;
        }
        enumNodes(bases[hd].P[bases[hd].now], bases[hd].spinlock != 0, nodes[hd]);
        for (int ni = 0; ni < (int)nodes[hd].size(); ni++) {
            Node& nd = nodes[hd][ni];
            int cx[64], cy[64], cz[64], cw[64], nc = 0;
            for (int i = 0; i < NP && nc < 64; i++) if (nd.p[i]) { cx[nc] = PXd[i]; cy[nc] = PYd[i]; cz[nc] = PZd[i]; cw[nc] = PWd[i]; nc++; }
            for (int bw = -nd.lo[3]; bw <= (NW - 1) - nd.hi[3]; bw++) for (int bx = -nd.lo[0]; bx <= 6 - nd.hi[0]; bx++) for (int by = -nd.lo[1]; by <= 6 - nd.hi[1]; by++) {
                int nin = hd + nd.depth + std::abs(bx) + std::abs(by) + std::abs(bw) + 1;
                double tBefore = GAP_MS * (nin - 1);
                int fallen = (int)std::floor(tBefore / fi);
                if (14 + nd.lo[2] - fallen < maxOcc + 1) continue;
                Tup t; t.hd = hd; t.ni = ni; t.bx = bx; t.by = by; t.bw = bw; t.order = order++; t.H = 0;
                if (PRUNE_K) {
                    int zl = -100;
                    for (int c = 0; c < nc; c++) zl = std::max(zl, hmap[((cx[c] + bx) * 7 + cy[c] + by) * NW + cw[c] + bw] - cz[c]);
                    int zlow[NCOL]; int touched[64], nt = 0; int sumz = 0, maxres = 0;
                    for (int c = 0; c < nc; c++) {
                        int col = ((cx[c] + bx) * 7 + cy[c] + by) * NW + cw[c] + bw; int z = cz[c] + zl;
                        sumz += z; maxres = std::max(maxres, z + 1);
                        bool seen = false; for (int q = 0; q < nt; q++) if (touched[q] == col) { seen = true; break; }
                        if (!seen) { touched[nt++] = col; zlow[col] = z; } else zlow[col] = std::min(zlow[col], z);
                    }
                    int holes = 0; for (int q = 0; q < nt; q++) holes += zlow[touched[q]] - hmap[touched[q]];
                    t.H = 40 * holes + 20 * maxres + (10 * sumz) / std::max(1, nc);
                }
                tups.push_back(t);
            }
        }
    }
    if (PRUNE_K && (int)tups.size() > PRUNE_K) {
        std::vector<int> idx(tups.size()); for (size_t i = 0; i < idx.size(); i++) idx[i] = (int)i;
        std::stable_sort(idx.begin(), idx.end(), [&](int a, int b) { return tups[a].H < tups[b].H; });
        idx.resize(PRUNE_K); std::sort(idx.begin(), idx.end());
        std::vector<Tup> keep; keep.reserve(PRUNE_K); for (int i : idx) keep.push_back(tups[i]); tups.swap(keep);
    }
    int nc = 0;
    for (auto& tp : tups) {
        if (nc >= cap) break;
        Cand& c = out[nc];
        Node& nd = nodes[tp.hd][tp.ni];
        int nin = tp.hd + nd.depth + std::abs(tp.bx) + std::abs(tp.by) + std::abs(tp.bw) + 1;
        G t = bases[tp.hd]; t.rng.s = ts; t.ev = Ev{}; t.ev.hold = tp.hd;
        memcpy(t.P[t.now], nd.p, sizeof(nd.p));
        t.bp[0] = tp.bx; t.bp[1] = tp.by; t.bp[2] = 14; t.bp[3] = tp.bw;
        t.nowT = root.nowT + GAP_MS * (nin - 1);
        int r = t.hardDrop();
        c.plan.hd = tp.hd; c.plan.nrot = nd.depth; memcpy(c.plan.rot, nd.seq, sizeof(nd.seq)); c.plan.d[0] = tp.bx; c.plan.d[1] = tp.by; c.plan.d[2] = 0; c.plan.d[3] = tp.bw;
        c.dead = r == 1; c.lines = t.ev.lines; c.gain = t.ev.gain;
        if (c.dead) { memset(c.feat, 0, sizeof(c.feat)); for (int i = 0; i < KIDS; i++) c.ids[i] = -1; memset(c.sum, 0, sizeof(c.sum)); }
        else {
            t.nowT += GAP_MS;
            bool bl = t.items && t.blindUntil > t.nowT;
            fillFeatures(t, bl, c.feat, c.ids);
            summarize(t.ev, &t, maxh0, holes0, c.sum);
        }
        nc++;
    }
    if (nc == 0) {   // every plan was gated away: fall back to the plain hard drop of the current orientation
        G t = root; t.rng.s = ts; t.ev = Ev{}; Cand& c = out[0];
        int r = t.hardDrop(); memset(&c.plan, 0, sizeof(Plan));
        c.dead = r == 1; c.lines = t.ev.lines; c.gain = t.ev.gain;
        if (c.dead) { memset(c.feat, 0, sizeof(c.feat)); for (int i = 0; i < KIDS; i++) c.ids[i] = -1; memset(c.sum, 0, sizeof(c.sum)); }
        else { fillFeatures(t, false, c.feat, c.ids); summarize(t.ev, &t, maxh0, holes0, c.sum); }
        nc = 1;
    }
    (void)blind; (void)okHd;
    return nc;
}

// execute a plan on the true game with real inputs. Returns 0 ok, 1 game over.
static int execPlan(G& g, const Plan& p, int& nin) {
    nin = 0;
    if (p.hd) { g.tryHoldSwap(); nin++; }
    for (int i = 0; i < p.nrot; i++) { int k = p.rot[i]; g.rotateFn(k >> 1, (k & 1) ? 1 : -1); nin++; }
    static const int axis[4] = {0, 1, 2, 3};
    for (int d : {0, 1, 3}) {
        int n = std::abs(p.d[d]), sg = p.d[d] > 0 ? 1 : -1;
        for (int i = 0; i < n; i++) { g.moveFn(axis[d], sg); nin++; }
    }
    g.nowT += GAP_MS * nin;       // the drop happens at the end of the plan
    nin++;
    return g.hardDrop();
}

// ====================================================================== vector API
struct Vec { int n; std::vector<Env> envs; std::vector<std::vector<Cand>> cands; std::vector<int> counts; };

extern "C" {
void set_raw(const int16_t* data, int n) {
    initTables();
    for (int k = 0; k < std::min(n, 56); k++) memcpy(RAW[k], data + (size_t)k * NP, sizeof(int16_t) * NP);
    rawLoaded = true;
}
int num_features() { return NF; }
int max_cands() { return MAXC; }
int num_ids() { return KIDS; }
int num_id_slots() { return NIDS; }
int summary_dim() { return SD; }
int dim() { return DIM; }
int rot_depth() { return ROT_DEPTH; }

static void resetEnv(Env& e, bool full) {
    e.g.initGame(); e.belValid = false; e.pieces = 0; e.first = 1; e.restarted = 0; e.g.nowT = 0;
    (void)full;
}
void* vec_new(int n, const uint32_t* seeds, int items) {
    Vec* v = new Vec(); v->n = n; v->envs.resize(n); v->cands.resize(n); v->counts.assign(n, 0);
    for (int i = 0; i < n; i++) {
        Env& e = v->envs[i]; memset(&e, 0, sizeof(Env));
        e.seed0 = seeds[i]; e.dec = 0; e.g.rng.s = seeds[i]; e.g.items = items != 0;
        resetEnv(e, true);
        v->cands[i].resize(MAXC);
    }
    return v;
}
void vec_free(void* h) { delete (Vec*)h; }

void vec_gen(void* h, float* feats, int16_t* ids, int* counts, float* lines, uint8_t* done, int32_t* info, float* sumc, float* sumact, int* first, int* rootmaxh, float* gain) {
    Vec* v = (Vec*)h;
#pragma omp parallel for schedule(dynamic, 1)
    for (int i = 0; i < v->n; i++) {
        Env& e = v->envs[i];
        int nc = genCands(e, v->cands[i].data(), MAXC);
        v->counts[i] = nc; counts[i] = nc; first[i] = e.first;
        int mh, ho; G* src = &e.g; boardStats(*src, mh, ho); rootmaxh[i] = mh;
        for (int k = 0; k < nc; k++) {
            Cand& c = v->cands[i][k];
            size_t o = (size_t)i * MAXC + k;
            memcpy(feats + o * NF, c.feat, sizeof(float) * NF);
            memcpy(ids + o * KIDS, c.ids, sizeof(int16_t) * KIDS);
            memcpy(sumc + o * SD, c.sum, sizeof(float) * SD);
            lines[o] = (float)c.lines; done[o] = c.dead; gain[o] = (float)c.gain;
            int32_t* inf = info + o * 8; inf[0] = c.plan.hd; inf[1] = c.plan.nrot; inf[2] = c.plan.d[0]; inf[3] = c.plan.d[1]; inf[4] = c.plan.d[3];
            int code = 0; for (int r = 0; r < c.plan.nrot; r++) code = code * 12 + c.plan.rot[r]; inf[5] = code; inf[6] = 0; inf[7] = 0;
        }
        // the summary of what really happened since the previous decision lives in e.stat (kept as floats below)
        memcpy(sumact + (size_t)i * SD, e.sa, sizeof(float) * SD);
    }
}
}  // extern C

extern "C" {
void vec_step(void* h, const int* act, int maxpieces, float* ep) {
    Vec* v = (Vec*)h;
#pragma omp parallel for schedule(dynamic, 1)
    for (int i = 0; i < v->n; i++) {
        Env& e = v->envs[i];
        if (e.g.over) {      // an item (lines added to a stack without room) has already killed this game
            ep[i * 4 + 0] = 1; ep[i * 4 + 1] = (float)e.g.score; ep[i * 4 + 2] = (float)e.g.lines; ep[i * 4 + 3] = (float)e.pieces;
            e.g.initGame(); e.belValid = false; e.pieces = 0; e.first = 1; e.g.nowT = 0; e.holdBan = 0; memset(e.sa, 0, sizeof(e.sa)); continue;
        }
        int k = act[i]; if (k < 0 || k >= v->counts[i]) k = 0;
        Cand c = v->cands[i][k];
        bool blindBefore = e.blindNow();
        int maxh0, holes0; boardStats(e.g, maxh0, holes0);
        G pre; bool needPre = true;   // the board the agent saw when it chose (needed for the belief if the board goes dark)
        pre = e.g; if (blindBefore && e.belValid) memcpy(pre.blk, e.bel.blk, sizeof(pre.blk));
        uint32_t ts = trialSeed(e.seed0, e.dec);
        (void)needPre;
        maskRoot(pre);
        if (c.plan.hd) {   // the hold key is pressed; if the hold is locked nothing happens, the player notices and re-plans without hold
            G probe = e.g; probe.tryHoldSwap();
            if (probe.now == e.g.now) {
                e.g.nowT += GAP_MS; e.holdBan = 1; e.dec++; memset(e.sa, 0, sizeof(e.sa)); e.first = 0;
                ep[i * 4 + 0] = 0; ep[i * 4 + 1] = (float)e.g.score; ep[i * 4 + 2] = (float)e.g.lines; ep[i * 4 + 3] = (float)e.pieces;
                continue;
            }
        }
        e.holdBan = 0;
        e.g.ev = Ev{};
        int nin = 0;
        int r = execPlan(e.g, c.plan, nin);
        e.g.nowT += GAP_MS;
        e.pieces++; e.dec++;
        summarize(e.g.ev, &e.g, maxh0, holes0, e.sa, blindBefore || e.blindNow());
        if (r != 1 && e.g.items && e.g.blindUntil > e.g.nowT) {
            // the board is hidden: the agent keeps its own prediction (the chosen plan replayed on what it could see)
            pre.rng.s = ts; pre.ev = Ev{}; int n2; pre.nowT = e.g.nowT - GAP_MS * nin; execPlan(pre, c.plan, n2);
            memcpy(e.bel.blk, pre.blk, sizeof(pre.blk)); e.belValid = true;
        } else e.belValid = false;
        e.first = 0;
        float st = 0;
        if (r == 1) st = 1; else if (e.pieces >= maxpieces) st = 2;
        ep[i * 4 + 0] = st; ep[i * 4 + 1] = (float)e.g.score; ep[i * 4 + 2] = (float)e.g.lines; ep[i * 4 + 3] = (float)e.pieces;
        if (st > 0) { e.g.initGame(); e.belValid = false; e.pieces = 0; e.first = 1; e.g.nowT = 0; e.holdBan = 0; memset(e.sa, 0, sizeof(e.sa)); }
    }
}

// debug: does executing candidate k with real inputs give exactly what its trial (free-space orientation + drop) gave?
int check_equiv(void* h, int i, int k) {
    Vec* v = (Vec*)h; Env& e = v->envs[i]; Cand& c = v->cands[i][k];
    G root = e.g; if (e.blindNow() && e.belValid) memcpy(root.blk, e.bel.blk, sizeof(root.blk));
    maskRoot(root);
    uint32_t ts = trialSeed(e.seed0, e.dec);
    G base = root; if (c.plan.hd) base.tryHoldSwap();
    G t = base; t.rng.s = ts; t.ev = Ev{};
    int16_t a[NP], b2[NP], sc[NP]; memcpy(a, t.P[t.now], sizeof(a));
    for (int r = 0; r < c.plan.nrot; r++) { int kk = c.plan.rot[r]; G::rotShape(a, b2, sc, kk >> 1, (kk & 1) ? 1 : -1); memcpy(a, b2, sizeof(a)); }
    memcpy(t.P[t.now], a, sizeof(a)); t.bp[0] = c.plan.d[0]; t.bp[1] = c.plan.d[1]; t.bp[2] = 14; t.bp[3] = c.plan.d[3];
    int nin0 = c.plan.hd + c.plan.nrot + std::abs(c.plan.d[0]) + std::abs(c.plan.d[1]) + std::abs(c.plan.d[3]);
    t.nowT = root.nowT + GAP_MS * nin0; t.hardDrop();
    G r2 = root; r2.rng.s = ts; r2.ev = Ev{}; int nin; execPlan(r2, c.plan, nin);
    if (memcmp(t.blk, r2.blk, sizeof(t.blk)) != 0) return 1;
    if (t.score != r2.score || t.lines != r2.lines || t.level != r2.level) return 2;
    if (t.rng.s != r2.rng.s) return 3;
    for (int q = 0; q < NP; q++) if (t.P[t.now][q] != r2.P[r2.now][q]) return 4;
    return 0;
}
void env_summary(void* h, int i, int64_t* out) {
    Vec* v = (Vec*)h; Env& e = v->envs[i]; const G& g = e.g;
    int64_t cs = 0; for (int k = 0; k < NB; k++) cs = (cs * 131 + g.blk[k] + 7) % 1000000007LL;
    out[0] = g.score; out[1] = g.lines; out[2] = g.level; out[3] = g.rng.s; out[4] = cs;
    int64_t pc = 0; for (int k = 0; k < NP; k++) pc = (pc * 131 + g.P[g.now][k] + 7) % 1000000007LL; out[5] = pc;
    int64_t hc = 0; for (int k = 0; k < NP; k++) hc = (hc * 131 + g.P[g.hld][k] + 7) % 1000000007LL; out[6] = hc;
    int64_t nc2 = 0; for (int k = 0; k < NP; k++) nc2 = (nc2 * 131 + g.P[g.nxt][k] + 7) % 1000000007LL; out[7] = nc2;
    out[8] = g.nowhb; out[9] = g.nexthb; out[10] = g.holdhb; out[11] = g.bp[0] * 1000 + g.bp[1] * 100 + g.bp[2];
    out[12] = (int64_t)g.nowT; out[13] = g.speedup * 1000000LL + g.spinlock * 10000 + g.hidenext * 100 + g.holdlock; out[14] = e.dec; out[15] = (int64_t)g.blindUntil;
}
}

// ====================================================================== battle mode API
static inline bool visSpecial(int code) { return slotOf[code] >= 0 && code != 32 && code != 103 && code != 98; }   // what the opponent window shows as a special block
constexpr int VIEWD = 32;                        // what a player sees of the opponent window (cells are only normal / special) + its item count
constexpr int QPOS = 4;                           // the first QPOS items of the queue are told apart (one-hot each); the model may take any of them
constexpr int QD = 1 + QPOS * NTS + NTS;           // own item queue: length, one-hot of the first QPOS items, histogram of all queued items
extern "C" {
void vec_set_battle(void* h, int on, int itemScale) {
    Vec* v = (Vec*)h;
    for (int i = 0; i < v->n; i++) { Env& e = v->envs[i]; e.g.battle = on != 0; e.g.itemScale = itemScale < 1 ? 1 : itemScale; e.g.rng.s = e.seed0; e.g.initGame(); e.belValid = false; e.pieces = 0; e.first = 1; e.g.nowT = 0; e.dec = 0; }
}
void vec_reset_one(void* h, int i) { Vec* v = (Vec*)h; Env& e = v->envs[i]; e.g.initGame(); e.belValid = false; e.pieces = 0; e.first = 1; e.g.nowT = 0; e.holdBan = 0; memset(e.sa, 0, sizeof(e.sa)); }
// own queue -> out[0] = length, out[1..10] = codes
void env_queue(void* h, int i, int32_t* out) { Env& e = ((Vec*)h)->envs[i]; out[0] = e.g.qn; for (int k = 0; k < 10; k++) out[1 + k] = k < e.g.qn ? e.g.q[k] : 0; }
// take the front item. mode 1: use it on this board at once; mode 2: just take it (the caller sends it to the opponent). Returns the code (0 = none).
int env_use(void* h, int i, int mode) {
    Env& e = ((Vec*)h)->envs[i]; G& g = e.g;
    if (g.qn <= 0 || g.over) return 0;
    // mode: 1 / 2 = the front item on me / taken for the opponent; 2k+1 / 2k+2 = the same after the player has touched the slots k times
    // (each touch sends the front item to the back), i.e. any of the first items can be picked
    int rk = (mode - 1) >> 1; mode = 1 + ((mode - 1) & 1);
    if (rk >= g.qn) return 0;
    for (int r = 0; r < rk; r++) { int c0 = g.q[0]; for (int k = 1; k < g.qn; k++) g.q[k - 1] = g.q[k]; g.q[g.qn - 1] = (int16_t)c0; }
    int code = g.q[0]; for (int k = 1; k < g.qn; k++) g.q[k - 1] = g.q[k]; g.qn--;
    if (mode == 1 && code != 4) g.useItem(code);          // the score-boost block ('steal') does nothing on yourself
    return code;
}
void env_receive(void* h, int i, int code) { Env& e = ((Vec*)h)->envs[i]; if (code != 4 && !e.g.over) e.g.useItem(code); }
// steal: everything in `from`'s queue goes to `to` (what does not fit is lost)
void env_steal(void* hf, int i, void* ht, int j) {
    G& a = ((Vec*)hf)->envs[i].g; G& b = ((Vec*)ht)->envs[j].g;
    for (int k = 0; k < a.qn; k++) if (b.qn < 10) b.q[b.qn++] = a.q[k];
    a.qn = 0;
}
// what the opponent window shows (cells are only normal / special) -> out[VIEWD]
static void viewOf(const G& g, float* out) {
    memset(out, 0, sizeof(float) * VIEWD);
    int hgt[NCOL], maxh = 0, holes = 0, nn = 0, ns = 0, layer[NLAY] = {0};
    for (int x = 0; x < 7; x++) for (int y = 0; y < 7; y++) for (int w = 0; w < NW; w++) {
        int col = (x * 7 + y) * NW + w, top = -1, occ = 0;
        for (int z = 0; z < 26; z++) {
            int v = g.blk[bidx(x, y, z, w)];
            if (v) { top = z; occ++; if (visSpecial(v & 255)) ns++; else nn++; if (z < NLAY) layer[z]++; }
        }
        hgt[col] = top + 1; maxh = std::max(maxh, top + 1); holes += top + 1 - occ;
    }
    out[0] = maxh / 10.0f; double sh = 0; for (int c = 0; c < NCOL; c++) sh += hgt[c];
    out[1] = (float)(sh / NCOL / 10.0); out[2] = holes / (float)(NCOL / 2 + 5); out[3] = nn / (float)(NCOL * 4); out[4] = ns / 20.0f; out[5] = g.qn / 10.0f;
    for (int c = 0; c < NCOL; c++) out[6 + std::min(hgt[c], 9)] += 1.0f / NCOL;
    out[16] = 0;                                  // (spare)
    const int16_t* nb = g.P[g.now]; double sum[4] = {0, 0, 0, 0}; int np = 0;
    for (int k = 0; k < NP; k++) if (nb[k]) { sum[0] += PXd[k] + g.bp[0]; sum[1] += PYd[k] + g.bp[1]; sum[2] += PZd[k] + g.bp[2]; sum[3] += PWd[k] + g.bp[3]; np++; }
    if (np) { out[17] = (float)(sum[0] / np / 6); out[18] = (float)(sum[1] / np / 6); out[19] = (float)(sum[2] / np / 25); out[20] = DIM == 4 ? (float)(sum[3] / np / 6) : 0; out[21] = np / 20.0f; }
    for (int z = 0; z < NLAY; z++) out[22 + z] = layer[z] / (float)NCOL;
}
void env_view(void* h, int i, float* out) { viewOf(((Vec*)h)->envs[i].g, out); }
// own state for the item-use decision: queue features
void env_qfeat(void* h, int i, float* out) {
    const G& g = ((Vec*)h)->envs[i].g;
    memset(out, 0, sizeof(float) * QD);
    out[0] = g.qn / 10.0f;
    for (int k = 0; k < g.qn && k < QPOS; k++) { int s = slotOf[g.q[k]]; if (s >= 0) out[1 + k * NTS + s] = 1; }
    for (int k = 0; k < g.qn; k++) { int s = slotOf[g.q[k]]; if (s >= 0) out[1 + QPOS * NTS + s] += 0.5f; }
}
// the dense board features of the current state (as if the pieces were already placed): for the item-use decision
void env_rootfeat(void* h, int i, float* out) {
    Env& e = ((Vec*)h)->envs[i]; int16_t ids[KIDS];
    G root = e.g; bool blind = e.blindNow();
    if (blind && e.belValid) memcpy(root.blk, e.bel.blk, sizeof(root.blk));          // while the board is hidden the player knows only what it remembers
    maskRoot(root);                                                                  // and only what is visible (no hidden counters, no concealed piece)
    fillFeatures(root, blind, out, ids);
}
// sanitised copy of a game as sent to the opponent: cell classes 0 / 1 normal / 2 special, the falling piece likewise, its position, its item count
void env_snapshot(void* h, int i, uint8_t* blk, uint8_t* now, int32_t* pos, int32_t* qn) {
    const G& g = ((Vec*)h)->envs[i].g;
    for (int k = 0; k < NB; k++) { int v = g.blk[k]; blk[k] = v == 0 ? 0 : (visSpecial(v & 255) ? 2 : 1); }
    for (int k = 0; k < NP; k++) { int v = g.P[g.now][k]; now[k] = v == 0 ? 0 : (visSpecial(v & 255) ? 2 : 1); }
    for (int d = 0; d < 4; d++) pos[d] = g.bp[d];
    *qn = g.qn;
}
void env_push(void* h, int i, int code) { G& g = ((Vec*)h)->envs[i].g; if (g.qn < 10) g.q[g.qn++] = (int16_t)code; }
int battle_view_dim() { return VIEWD; }
int battle_q_dim() { return QD; }
int env_over(void* h, int i) { return ((Vec*)h)->envs[i].g.over ? 1 : 0; }
double env_time(void* h, int i) { return ((Vec*)h)->envs[i].g.nowT; }
}  // extern C

extern "C" {
// state for the item-use decision of every duel: own board features, opponent window view, own view, own item queue
int battle_state_dim() { return NF + 2 * VIEWD + QD; }
void vec_times(void* h, double* out) { Vec* a = (Vec*)h; for (int i = 0; i < a->n; i++) out[i] = a->envs[i].g.nowT; }
void vec_bstate(void* hs, void* ho, float* out, int32_t* qn) {
    Vec* a = (Vec*)hs; int D = NF + 2 * VIEWD + QD;
    for (int i = 0; i < a->n; i++) {
        float* o = out + (size_t)i * D;
        env_rootfeat(hs, i, o); env_view(ho, i, o + NF);
        { Env& e = a->envs[i]; G mine = e.g; if (e.blindNow() && e.belValid) memcpy(mine.blk, e.bel.blk, sizeof(mine.blk)); viewOf(mine, o + NF + VIEWD); }   // my own window: the board I know of
        env_qfeat(hs, i, o + NF + 2 * VIEWD);
        qn[i] = a->envs[i].g.qn;
    }
}
// apply the chosen item-use decision of every duel: mode 0 = nothing, 1 = front item on myself, 2 = front item on the opponent (the score-boost 'steal' item takes
// the opponent's whole queue). used[i] = the code that was used (0 = none)
// codes of the first QPOS queue items of every env (0 = empty), out[n * QPOS]
void vec_qpos(void* hs, int32_t* out) { Vec* a = (Vec*)hs; for (int i = 0; i < a->n; i++) { G& g = a->envs[i].g; for (int k = 0; k < QPOS; k++) out[i * QPOS + k] = (k < g.qn && !g.over) ? g.q[k] : 0; } }
// front item code of every env's queue (0 = empty)
void vec_qfront(void* hs, int32_t* out) { Vec* a = (Vec*)hs; for (int i = 0; i < a->n; i++) { G& g = a->envs[i].g; out[i] = (g.qn > 0 && !g.over) ? g.q[0] : 0; } }
void vec_buse(void* hs, void* ho, const int32_t* mode, int32_t* used) {
    Vec* a = (Vec*)hs;
    for (int i = 0; i < a->n; i++) {
        used[i] = 0;
        if (mode[i] == 0) continue;
        int code = env_use(hs, i, mode[i]);
        used[i] = code;
        if (((mode[i] - 1) & 1) && code) { if (code == 4) env_steal(ho, i, hs, i); else env_receive(ho, i, code); }
    }
}
}
