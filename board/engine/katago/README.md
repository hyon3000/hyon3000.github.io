# KataGo in the browser (go.html levels Normal / Hard)

Everything runs client-side (static hosting, no server code). `katago.js` is the glue used by `../../engines.js`;
the neural net runs in a module Web Worker so the page stays responsive.

| go.html level | engine | net | where it runs |
|---|---|---|---|
| Easy (1) | GNU Go, default options (`../gnugo/`) | - | wasm in a hidden iframe |
| Normal (2) | KataGo | `models/web-katrain-small.bin.gz` = g170-b6c96-s175395328-d26788732 (3.8 MB) | WASM (SIMD), 4 s per move |
| Hard (3) | KataGo | `models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz.part0/.part1` = kata1-b18c384nbt (97.9 MB, stored as two parts below GitHub's file limit, joined in the browser) | WebGPU, 12 s per move. **If WebGPU is not available the page uses the small net with a 10 s budget and says so in the status line** (the big net on WASM manages only ~2-7 visits/s; set `KataGoGo.opt.ALLOW_BIG_ON_WASM = true` to force it) |

Time budgets, visit caps, nets: constants at the top of `katago.js`. Rules passed to KataGo: Chinese (area scoring, positional superko, no suicide) with the page's komi; handicap stones are put on the board as black setup stones.
Move legality is re-checked with the same rules as go.html; an illegal KataGo candidate is skipped (next best, then policy order). Pass is returned only if KataGo prefers it and the position is settled (ownership) or the opponent just passed. The engine never resigns.

## Files and licences

* `js/katago-engine/`, `lib/tfjs/` : KataGo inference + MCTS ported to TensorFlow.js by Sir-Teo/web-katrain (MIT, https://github.com/Sir-Teo/web-katrain), taken from the transpiled copy in Felix132383/katago-go. `lib/tfjs/tfjs-bundle.js` bundles TensorFlow.js 4.22 (Apache-2.0) with the WebGPU and WASM backends and pako (MIT/zlib); `*.wasm` are the tfjs-backend-wasm binaries (Apache-2.0).
* Networks: KataGo distributed training networks (https://katagotraining.org/), released under CC0 / public domain by the KataGo project (David J Wu "lightvector"). `web-katrain-small.bin.gz` is the small g170 b6c96 net shipped with web-katrain. (media.katagotraining.org sends no CORS headers, so the files are vendored here instead of fetched from the CDN.)
* KataGo itself (algorithm/feature definitions) is MIT / public-domain style licensed (https://github.com/lightvector/KataGo).
* `../gnugo/` is GNU Go (GPL) as before.

## Alternatives that were looked at

* toyoshi/katago-wasm (MIT): real KataGo C++ (Eigen) to WASM, ~150 visits/s b6c96 at 9x9 in node, but needs pthreads, i.e. SharedArrayBuffer, i.e. COOP/COEP headers that GitHub Pages cannot send (would need a service-worker shim), and no prebuilt binary (needs an emscripten build).
* saigo-online/katago-webgpu: KataGo evaluation on WebGPU (native + browser WASM), large C++ tree, no prebuilt drop-in.
* Yibooo/igo-ai: Next.js app around a KataGo WASM build (no licence file).
