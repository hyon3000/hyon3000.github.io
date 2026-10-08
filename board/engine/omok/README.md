# Omok / Gomoku engine for board/omok.html

Engine: **Rapfi** (https://github.com/dhbloo/rapfi) 0.43.02 by dhbloo - alpha-beta search with a mix9svq NNUE evaluation
(a top-ranked engine in the Gomocup tournaments), compiled to WebAssembly with Emscripten. License: **GNU GPL v3** (see `LICENSE-GPL-3.0.txt`);
because it is GPL, this directory (the engine files and `worker.js` that drives them) is GPL-3 as well, and Rapfi's source is at the URL above.

Files
- `rapfi-single-simd128.js/.wasm` - single-thread build with WASM SIMD (used when the browser supports SIMD)
- `rapfi-single.js/.wasm` - single-thread build without SIMD (fallback)
- `rapfi.data` - config + NNUE weights (20 MB): `mix9svqfreestyle_bsmix` (free-style) and `mix9svqstandard_bs15` (standard, exactly five)
- `worker.js` - Web Worker that loads the module and speaks the Gomocup/Piskvork text protocol (START / INFO / BOARD ... DONE)
- `../../omok-engine.js` - page side: `omokEngine(state, level) -> Promise({x,y})`, level mapping, never returns an occupied point

Where the binaries come from: the WASM builds are the ones published in the web app https://github.com/CyanXLab/GomokuAI (`public/build/`, "Rapfi 0.43.02,
commit 3aedf3a"), which is built from the upstream Rapfi sources. I did not rebuild them myself and could not verify the build byte-for-byte against upstream.
Modifications: the original data package also contained the Renju weights (20 MB) - they were removed (and the `.js` file table / `config.toml`
adjusted: renju weight entries dropped, `coord_conversion_mode = "none"` so that x,y are plain 0-based column/row). The engine code itself is untouched.
Multi-threaded builds are not used (they need cross-origin isolation headers, which a static host does not send).

Levels used by omok-engine.js (single thread, rule 0 = free-style, 1 = standard):
- Easy: depth <= 4 (about 100 ms), plus 15 % random nearby moves unless a five can be made / must be stopped
- Normal: 0.6 s per move
- Hard: 3 s per move (depth ~20 on a desktop CPU, about 150k nodes/s in Firefox)

If the worker cannot start (very old browser, file://), omok-engine.js falls back to a small built-in pattern scorer so the page stays playable.
