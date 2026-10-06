import ctypes, hashlib, json, os, pathlib, subprocess
import numpy as np

HERE = pathlib.Path(__file__).parent
DIM = int(os.environ.get("DIM", "3"))


def build(dim):
    src = HERE / "sim_nd.cpp"
    tag = hashlib.md5(src.read_bytes() + str(dim).encode()).hexdigest()[:10]
    so = HERE / f"libnd{dim}_{tag}.so"
    if not so.exists():
        subprocess.check_call(["g++", "-O3", "-march=native", "-fopenmp", "-shared", "-fPIC", f"-DDIM={dim}", "-o", str(so), str(src)])
    return so


_lib = ctypes.CDLL(str(build(DIM)))
_lib.vec_new.restype = ctypes.c_void_p
_lib.vec_new.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_int]
_lib.vec_free.argtypes = [ctypes.c_void_p]
for f in ("num_features", "max_cands", "num_ids", "num_id_slots", "summary_dim", "dim", "rot_depth"):
    getattr(_lib, f).restype = ctypes.c_int
NF, MAXC, KIDS, NIDS, SD = _lib.num_features(), _lib.max_cands(), _lib.num_ids(), _lib.num_id_slots(), _lib.summary_dim()
_lib.battle_view_dim.restype = ctypes.c_int; _lib.battle_q_dim.restype = ctypes.c_int; _lib.env_time.restype = ctypes.c_double; _lib.env_use.restype = ctypes.c_int
VIEWD, QD = _lib.battle_view_dim(), _lib.battle_q_dim()
NW_ = 7 if DIM == 4 else 1
NB_CELLS, NP_CELLS = 49 * 26 * NW_, 343 * NW_
_lib.battle_state_dim.restype = ctypes.c_int; BSD = _lib.battle_state_dim()


def _p(a): return a.ctypes.data_as(ctypes.c_void_p)


def load_raw():
    p = HERE / f"raw{DIM}.npy"
    a = np.ascontiguousarray(np.load(p), dtype=np.int16)
    _lib.set_raw(_p(a), a.shape[0])
    return a


RAW = load_raw()


class VecEnv:
    def __init__(self, n, seed=0, items=True, seeds=None, maxc=None):
        self.n = n
        if seeds is None:
            seeds = (np.arange(n, dtype=np.uint64) * 2654435761 + seed * 40503 + 12345) % (2 ** 32)
        self.seeds = np.ascontiguousarray(seeds, dtype=np.uint32)
        self.h = _lib.vec_new(n, _p(self.seeds), int(items))
        self.mc = maxc or MAXC
        self.feats = np.zeros((n, MAXC, NF), np.float32)
        self.ids = np.full((n, MAXC, KIDS), -1, np.int16)
        self.sumc = np.zeros((n, MAXC, SD), np.float32)
        self.sumact = np.zeros((n, SD), np.float32)
        self.gain = np.zeros((n, MAXC), np.float32)
        self.counts = np.zeros(n, np.int32)
        self.first = np.zeros(n, np.int32)
        self.rootmaxh = np.zeros(n, np.int32)
        self.lines = np.zeros((n, MAXC), np.float32)
        self.done = np.zeros((n, MAXC), np.uint8)
        self.info = np.zeros((n, MAXC, 8), np.int32)
        self.ep = np.zeros((n, 4), np.float32)

    def gen(self):
        _lib.vec_gen(ctypes.c_void_p(self.h), _p(self.feats), _p(self.ids), _p(self.counts), _p(self.lines), _p(self.done), _p(self.info),
                     _p(self.sumc), _p(self.sumact), _p(self.first), _p(self.rootmaxh), _p(self.gain))

    def step(self, act, maxpieces=100000):
        act = np.ascontiguousarray(act, dtype=np.int32)
        _lib.vec_step(ctypes.c_void_p(self.h), _p(act), maxpieces, _p(self.ep))
        return self.ep

    def summary(self, i):
        out = np.zeros(16, np.int64)
        _lib.env_summary(ctypes.c_void_p(self.h), i, _p(out))
        return out

    # ---- battle mode
    def set_battle(self, on=True, item_scale=1):
        _lib.vec_set_battle(ctypes.c_void_p(self.h), int(on), int(item_scale))

    def reset_one(self, i): _lib.vec_reset_one(ctypes.c_void_p(self.h), int(i))

    def queue(self, i):
        out = np.zeros(11, np.int32); _lib.env_queue(ctypes.c_void_p(self.h), int(i), _p(out)); return out

    def use(self, i, mode): return _lib.env_use(ctypes.c_void_p(self.h), int(i), int(mode))

    def receive(self, i, code): _lib.env_receive(ctypes.c_void_p(self.h), int(i), int(code))

    def push(self, i, code): _lib.env_push(ctypes.c_void_p(self.h), int(i), int(code))

    def steal_from(self, i, other, j): _lib.env_steal(ctypes.c_void_p(self.h), int(i), ctypes.c_void_p(other.h), int(j))

    def view(self, i):
        out = np.zeros(VIEWD, np.float32); _lib.env_view(ctypes.c_void_p(self.h), int(i), _p(out)); return out

    def qfeat(self, i):
        out = np.zeros(QD, np.float32); _lib.env_qfeat(ctypes.c_void_p(self.h), int(i), _p(out)); return out

    def rootfeat(self, i):
        out = np.zeros(NF, np.float32); _lib.env_rootfeat(ctypes.c_void_p(self.h), int(i), _p(out)); return out

    def bstate(self, opp):
        """[n, BSD] state for the item-use decision of every env against `opp`, plus the queue lengths"""
        out = np.zeros((self.n, BSD), np.float32); qn = np.zeros(self.n, np.int32)
        _lib.vec_bstate(ctypes.c_void_p(self.h), ctypes.c_void_p(opp.h), _p(out), _p(qn)); return out, qn

    def qpos(self):
        out = np.zeros((self.n, 4), np.int32); _lib.vec_qpos(ctypes.c_void_p(self.h), _p(out)); return out

    def qfront(self):
        out = np.zeros(self.n, np.int32); _lib.vec_qfront(ctypes.c_void_p(self.h), _p(out)); return out

    def buse(self, opp, mode):
        mode = np.ascontiguousarray(mode, dtype=np.int32); used = np.zeros(self.n, np.int32)
        _lib.vec_buse(ctypes.c_void_p(self.h), ctypes.c_void_p(opp.h), _p(mode), _p(used)); return used

    def times(self):
        out = np.zeros(self.n); _lib.vec_times(ctypes.c_void_p(self.h), _p(out)); return out

    def snapshot(self, i):
        from simnd import NB_CELLS, NP_CELLS
        blk = np.zeros(NB_CELLS, np.uint8); now = np.zeros(NP_CELLS, np.uint8); pos = np.zeros(4, np.int32); qn = np.zeros(1, np.int32)
        _lib.env_snapshot(ctypes.c_void_p(self.h), int(i), _p(blk), _p(now), _p(pos), _p(qn)); return blk, now, pos, int(qn[0])

    def time(self, i): return _lib.env_time(ctypes.c_void_p(self.h), int(i))

    def check_equiv(self, i, k):
        return _lib.check_equiv(ctypes.c_void_p(self.h), i, k)

    def __del__(self):
        try: _lib.vec_free(ctypes.c_void_p(self.h))
        except Exception: pass
