Janggi engine (written for this project, no third-party code).

- `../../janggi-core.js` - rules and move generation (shared with the page `janggi.html`), `Janggi.Position`
- `worker.js` - Web Worker: iterative-deepening alpha-beta (PVS), transposition table (1M entries), killer/history ordering,
  capture quiescence, check extension, repetition = draw. Request `{id, rows, turn, moves, ms, maxDepth, noise}` -> `{id, type:'move', m, depth, nodes, eval, ms}`.
- `../../janggi-engine.js` - adapter used by the page (`window.attachEngine`); levels: Easy depth 2 + noise, Normal 0.8 s, Hard 4 s;
  falls back to a greedy capture player when workers are unavailable (e.g. file://).

Rules chosen: moves that leave the own general in check or facing the enemy general are illegal (so no "bikjang"), pass allowed when not in check,
threefold repetition = draw, 200 plies without capture -> point count (13/7/5/3/3/2, Han +1.5).
