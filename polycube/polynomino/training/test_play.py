"""End-to-end: the real app.js game loop with the AI switched on (aiTick), model loaded from web/ai-model.js."""
import pathlib, sys, time, quickjs
src = open(pathlib.Path(__file__).parent / "test_lockstep.py").read()
prelude = src[src.index('ctx = quickjs.Context()'):src.index('env = VecEnv')]
web = pathlib.Path(__file__).parent.parent / "web"
PIECES = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--pieces=")), 200))
ITEMS = "--noitems" not in sys.argv
SEED = 5
exec(prelude.replace('ITEMS = "--noitems" not in sys.argv', ''))
ctx.eval((web / "ai-model.js").read_text())
ctx.eval(f"""
var P = window.__poly, S = P.state;
P.setItems({'true' if ITEMS else 'false'});
S.rawblock = window.RAWBLOCK_DATA_2D; S.ready = true; S.startscreen = 0; __rs = {SEED}; P.init();
PolyAI.load(window.POLY_AI_MODEL);
P.ai.on = true; P.ai.speed = 2;
var games = 0, frames = 0, maxLevel = 0;
function run(n) {{ while (P.ai.pieces < n && frames < 200000) {{ frames++; __t += 16; if (S.goverflg) games++; P.logicFrame(); if (S.level > maxLevel) maxLevel = S.level; }} }}
""")
t = time.time(); ctx.eval(f"run({PIECES})")
print("pieces", ctx.eval("P.ai.pieces"), "games over", ctx.eval("games"), "score", ctx.eval("S.score"), "lines", ctx.eval("S.lines"), "level", ctx.eval("maxLevel"), f"{time.time()-t:.1f}s")
