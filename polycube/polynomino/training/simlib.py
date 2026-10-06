import ctypes, hashlib, json, pathlib, subprocess
import numpy as np

HERE = pathlib.Path(__file__).parent


def build():
    """Compile sim.cpp to a content-addressed .so (never overwrites a library another process has loaded)."""
    src = HERE / "sim.cpp"
    tag = hashlib.md5(src.read_bytes()).hexdigest()[:10]
    so = HERE / f"libsim_{tag}.so"
    if not so.exists():
        subprocess.check_call(["g++", "-O3", "-march=native", "-fopenmp", "-shared", "-fPIC", "-o", str(so), str(src)])
    return so


_lib = ctypes.CDLL(str(build()))
_lib.vec_new.restype = ctypes.c_void_p
_lib.vec_new.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_int]
_lib.vec_free.argtypes = [ctypes.c_void_p]
_lib.vec_set_item_scale.argtypes = [ctypes.c_void_p, ctypes.c_double]
_lib.vec_set_item_mask.argtypes = [ctypes.c_void_p, ctypes.c_int]
_lib.vec_set_group_scale.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
_lib.vec_set_restart.argtypes = [ctypes.c_void_p, ctypes.c_double]
_lib.vec_set_curriculum.argtypes = [ctypes.c_void_p, ctypes.c_double, ctypes.c_double, ctypes.c_double]
_lib.max_cands.restype = ctypes.c_int
_lib.num_features.restype = ctypes.c_int
MAXC = _lib.max_cands()
NF = _lib.num_features()
KIDS = _lib.num_ids()
NIDS = _lib.num_id_slots()
NT = _lib.num_types()
SD = 80
_lib.battle_view_dim.restype = ctypes.c_int; _lib.battle_q_dim.restype = ctypes.c_int; _lib.battle_state_dim.restype = ctypes.c_int; _lib.env_use.restype = ctypes.c_int
VIEWD, QD, BSD = _lib.battle_view_dim(), _lib.battle_q_dim(), _lib.battle_state_dim()

def set_crisis_hold_type(v):
    _lib.set_crisis_hold_type(int(v))


def set_crisis_height(base, span):
    _lib.set_crisis_height(int(base), int(span))


def set_input_gap(ms):
    _lib.set_input_gap(int(ms))

_blocks = json.loads((HERE / "blocks.json").read_text())
_counts = np.array([len(b["cells"]) for b in _blocks], dtype=np.int32)
_vals = np.array([b["val"] for b in _blocks], dtype=np.int32)
_flat = np.array([v for b in _blocks for cell in b["cells"] for v in cell], dtype=np.int32)
_lib.set_blocks(len(_blocks), _counts.ctypes.data_as(ctypes.c_void_p), _vals.ctypes.data_as(ctypes.c_void_p),
                _flat.ctypes.data_as(ctypes.c_void_p))


def _p(a): return a.ctypes.data_as(ctypes.c_void_p)


class VecEnv:
    def __init__(self, n, seed=0, items=True, seeds=None):
        self.n = n
        if seeds is None:
            seeds = (np.arange(n, dtype=np.uint64) * 2654435761 + seed * 40503 + 12345) % (2 ** 32)
        self.seeds = np.ascontiguousarray(seeds, dtype=np.uint32)
        self.h = _lib.vec_new(n, _p(self.seeds), int(items))
        self.feats = np.zeros((n, MAXC, NF), np.float32)
        self.ids = np.full((n, MAXC, KIDS), -1, np.int16)
        self.ev = np.zeros((n, MAXC, 2), np.int32)
        self.sumc = np.zeros((n, MAXC, SD), np.float32)   # per-candidate event summary (what this plan would trigger)
        self.sumact = np.zeros((n, SD), np.float32)       # events since the previous decision (zeros at a game start)
        self.pierce = np.zeros((n, MAXC), np.uint8)       # candidate places a pierce piece
        self.rootmaxh = np.zeros(n, np.int32)             # stack height at this decision
        self.gain = np.zeros((n, MAXC), np.float32)        # game score gained by each candidate plan
        self.restarted = np.zeros(n, np.int32)           # this game was started from a remembered near-failure state
        self.first = np.zeros(n, np.int32)               # 1 = first decision of a game: reset the recurrent memory
        self.counts = np.zeros(n, np.int32)
        self.lines = np.zeros((n, MAXC), np.float32)
        self.done = np.zeros((n, MAXC), np.uint8)
        self.info = np.zeros((n, MAXC, 4), np.int32)  # hold, rot, dcol, status
        self.ep = np.zeros((n, 4), np.float32)

    def gen(self):
        _lib.vec_gen(ctypes.c_void_p(self.h), _p(self.feats), _p(self.ids), _p(self.counts), _p(self.lines), _p(self.ev), _p(self.done), _p(self.info), _p(self.sumc), _p(self.sumact), _p(self.first), _p(self.pierce), _p(self.rootmaxh), _p(self.restarted), _p(self.gain))

    def step(self, act, maxpieces=100000):
        act = np.ascontiguousarray(act, dtype=np.int32)
        _lib.vec_step(ctypes.c_void_p(self.h), _p(act), maxpieces, _p(self.ep))
        return self.ep

    def summary(self, i):
        out = np.zeros(16, np.int64)
        _lib.env_summary(ctypes.c_void_p(self.h), i, _p(out))
        return out

    def reset_all(self):
        _lib.vec_reset_all(ctypes.c_void_p(self.h))

    def set_restart(self, prob):
        _lib.vec_set_restart(ctypes.c_void_p(self.h), float(prob))

    def expand(self, parents):
        """parents [n,K] int32 candidate indices (-1 = none) -> child candidate arrays [n*K, MAXC, ...]"""
        parents = np.ascontiguousarray(parents, dtype=np.int32); K = parents.shape[1]; nk = self.n * K
        out = dict(feats=np.zeros((nk, MAXC, NF), np.float32), ids=np.full((nk, MAXC, KIDS), -1, np.int16), counts=np.zeros(nk, np.int32),
                   done=np.zeros((nk, MAXC), np.uint8), lines=np.zeros((nk, MAXC), np.float32), sumc=np.zeros((nk, MAXC, SD), np.float32), gain=np.zeros((nk, MAXC), np.float32))
        _lib.vec_expand(ctypes.c_void_p(self.h), _p(parents), K, _p(out["feats"]), _p(out["ids"]), _p(out["counts"]), _p(out["done"]), _p(out["lines"]), _p(out["sumc"]), _p(out["gain"]))
        return out

    def expand2(self, parents, child_idx):
        """3-ply: parents [n,K1] (root candidate indices), child_idx [n*K1,K2] (candidate indices of each parent's follow-up decision)"""
        parents = np.ascontiguousarray(parents, dtype=np.int32); child_idx = np.ascontiguousarray(child_idx, dtype=np.int32)
        K1 = parents.shape[1]; K2 = child_idx.shape[1]; nk = self.n * K1 * K2
        out = dict(feats=np.zeros((nk, MAXC, NF), np.float32), ids=np.full((nk, MAXC, KIDS), -1, np.int16), counts=np.zeros(nk, np.int32),
                   done=np.zeros((nk, MAXC), np.uint8), lines=np.zeros((nk, MAXC), np.float32), sumc=np.zeros((nk, MAXC, SD), np.float32), gain=np.zeros((nk, MAXC), np.float32))
        _lib.vec_expand2(ctypes.c_void_p(self.h), _p(parents), K1, _p(child_idx), K2, _p(out["feats"]), _p(out["ids"]), _p(out["counts"]), _p(out["done"]), _p(out["lines"]), _p(out["sumc"]), _p(out["gain"]))
        return out

    def set_curriculum(self, crisis=0.0, crisis_hold=0.0, pierce=0.0):
        _lib.vec_set_curriculum(ctypes.c_void_p(self.h), crisis, crisis_hold, pierce)

    def set_group_scale(self, sc):
        a = np.ascontiguousarray(sc, dtype=np.float64); assert a.shape == (12,)
        _lib.vec_set_group_scale(ctypes.c_void_p(self.h), _p(a))

    def set_item_mask(self, m):
        _lib.vec_set_item_mask(ctypes.c_void_p(self.h), int(m))

    def set_item_scale(self, s):
        _lib.vec_set_item_scale(ctypes.c_void_p(self.h), float(s))

    def stats(self):
        out = np.zeros(800, np.int64)
        _lib.vec_stats(ctypes.c_void_p(self.h), _p(out))
        return out

    def inject(self, i, which, value):
        _lib.env_inject(ctypes.c_void_p(self.h), i, which, ctypes.c_longlong(value))

    # ---- battle mode (see sim.cpp: eaten items are queued; the front item can be used on myself / sent to the opponent)
    def set_battle(self, on=True, item_scale=1): _lib.vec_set_battle(ctypes.c_void_p(self.h), int(on), int(item_scale), _p(self.seeds))
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
    def snapshot(self, i):
        board = np.zeros(200, np.uint8); piece = np.zeros(48, np.int32); npc = np.zeros(1, np.int32); qn = np.zeros(1, np.int32)
        _lib.env_snapshot(ctypes.c_void_p(self.h), int(i), _p(board), _p(piece), _p(npc), _p(qn)); return board, piece[:3 * int(npc[0])].reshape(-1, 3), int(qn[0])
    def bstate(self, opp):
        out = np.zeros((self.n, BSD), np.float32); qn = np.zeros(self.n, np.int32)
        _lib.vec_bstate(ctypes.c_void_p(self.h), ctypes.c_void_p(opp.h), _p(out), _p(qn)); return out, qn
    def qpos(self):
        out = np.zeros((self.n, 4), np.int32); _lib.vec_qpos(ctypes.c_void_p(self.h), _p(out)); return out
    def buse(self, opp, mode):
        mode = np.ascontiguousarray(mode, dtype=np.int32); used = np.zeros(self.n, np.int32)
        _lib.vec_buse(ctypes.c_void_p(self.h), ctypes.c_void_p(opp.h), _p(mode), _p(used)); return used
    def times(self):
        out = np.zeros(self.n); _lib.vec_times(ctypes.c_void_p(self.h), _p(out)); return out

    def __del__(self):
        try: _lib.vec_free(ctypes.c_void_p(self.h))
        except Exception: pass
