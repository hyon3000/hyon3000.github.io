# Polynomino RL agent

Afterstate Double-DQN trained on a C++ port of the game (`sim.cpp`, items included); inference runs in the
browser in plain JS (`../web/ai.js` + `../web/ai-model.js`). Play with the **AI** button or the `A` key.

## How it plays
- **Inputs**: hold / rotate / move / hard drop, **one input per 200 ms**. Gravity keeps running on the game's real clock in
  between (level speed, speed-up / speed-down items).
- **Decision** = a whole plan (`[hold] + k×rotate + n×move + hard drop`), enumerated by *executing its inputs one by one* on a
  copy of the game with a virtual clock (real `rotate()/move()/moveDown()/stickblock()/removeline()`), so wall kicks, locks,
  cancel/pierce pieces, bombs, garbage, gravity and every item effect are exact.
- **Value network + memory**: V(afterstate | memory). A GRU state is carried through the whole game and absorbs, after every
  decision, a summary of what happened (item types triggered / placed, lines, explosions, garbage, hold, holes / height change).
- **2-ply search** (the biggest single gain): the K=5 best candidates are each played on to the next decision with the exact rules,
  the best follow-up is looked at: `Q2(p) = r(p) + γ·max_c [ r(c) + γ·V(c | memory after p) ]`. Same net, greedy → search:
  mean survival 1240 → 2817 pieces, 10% → 86% of games reaching the 3000-piece cap (items 1x, 200 games). Thinking time is
  given back to the game clock in the browser (the search does not make the piece fall).
- **Observation cuts**: while the board is hidden (blind item) the agent plans on the board it remembers plus its own predictions;
  while NEXT is hidden the upcoming and held piece are not given to the network.
- Reward = survival (+1 per decision, death −10); `LINE_REWARD` env var re-enables the old line bonus (needed to evaluate old checkpoints).

## What was tried (and measured)
See the git log / chat history; short version: more training time does not help once a run has plateaued (60 min = 300 min);
item-specific tricks are not needed; the item groups that hurt most are obstacles, gap-clear, +lines, shuffles, bombs; deaths are a slow
build-up of holes (87%) rather than shocks (13%); halving the input gap adds +28%; search adds +127%.

## Shell integration (Help > Cheat... > Solve Automatically, F3)
`../autosolve-bridge.js` is a tiny game-agnostic bridge between the Win98 shell (`../../index.html`) and the game iframe,
using `postMessage` (works on `file://` too):

| direction | message |
|---|---|
| shell → game | `{type:'polycube-autosolve', cmd:'status' \| 'toggle' \| 'start' \| 'stop'}` |
| game → shell | `{type:'polycube-autosolve-status', supported, dim, running, solving}` (on request and on every change) |

A game opts in by including the bridge and calling
`PolyAutoSolve.register({dim, isRunning, isSolving, start, stop})`. The bridge never starts a solve while `isRunning()` is
false, and a game that does not register simply never answers, so the menu entry stays inert. The entry is never greyed out.
2D (polynomino) is wired up in `web/app.js`; **3D / 4D only need their own `register(...)` + a model/plan enumerator**.
While solving, the agent presses the same keys a player would (`ShiftLeft` hold, `KeyZ` rotate, `ArrowLeft/Right`, `Enter`
hard drop), one every 200 ms; it stops on game over / start screen. The model file (`web/ai-model.js`, ~6 MB) is fetched
on first use. `test_bridge.py` exercises the protocol against the real `app.js`.

## Files
- `sim.cpp`, `simlib.py` — game port + vectorised env (ctypes, OpenMP). RNG = mulberry32 so it can be replayed in JS.
- `train_rnn.py` — the training used now (recurrent value net, R2D2-style sequence replay, general mechanisms: restarts from remembered
  near-failure states, prioritised replay; item-specific curricula exist but default to off). `train.py`/`rnnnet.py`: older/shared parts.
- `train.py` (legacy, memory-less) — training (`python3.12 train.py --minutes 150 --out runs/v4`; `--noitems` for `?items=0`). Defaults: γ=0.997, 1-step targets
  (n-step=10 stalled learning in A/B tests, γ=0.997 did not), item frequency annealed 2x→1x.
- `eval_policy.py` — greedy evaluation of a checkpoint: survival, and per-item placed/triggered stats; `--noitems` for the baseline.
- `test_model_js.py` — JS forward pass vs PyTorch.
- `export_model.py` — `runs/.../best.pt` → `../web/ai-model.js` (float16 tables, plain-JS inference).
- `test_lockstep.py` — runs the REAL `web/app.js` frame loop (DOM stubbed, quickjs, 1 ms frames) next to the C++ sim with
  the same RNG and compares, at every decision, the game state and every candidate (action, outcome, features).
  Blind / speed / hide-next / rotation-lock / hold-lock states are injected at random. `--greedy --noitems --noinject --seed=N --decisions=N`.
- `test_play.py` — end-to-end: the AI playing through the real game loop with the exported model.
- `export_blocks.py` — regenerate `blocks.json` from `web/rawblock-data.js` (needed if piece shapes change).

If `web/app.js` game rules change, re-run `test_lockstep.py`; any divergence means `sim.cpp` must be updated and the model retrained.
