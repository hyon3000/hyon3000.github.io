"""Export rawblock-data.js shapes to blocks.json using quickjs (so the sim uses the exact game data)."""
import json, pathlib, quickjs
here = pathlib.Path(__file__).parent
src = (here.parent / "web" / "rawblock-data.js").read_text()
ctx = quickjs.Context()
ctx.eval("var window = {};")
ctx.eval(src)
blocks = json.loads(ctx.eval("JSON.stringify(window.RAWBLOCK_DATA_2D.map(function(b){return {cells: b.cells, val: b.val}}))"))
(here / "blocks.json").write_text(json.dumps(blocks))
print(len(blocks), "blocks;", "max cells", max(len(b["cells"]) for b in blocks))
