# Mahjong (Riichi) theme - credits and licences

Files: `mahjong.html` (UI), `mahjong-core.js` (rules engine + AI), `mj/` (vendored library, tile art, icon).

## Hand evaluation (agari / yaku / han / fu / points)

Vendored in `mj/riichi-bundle.js` (plain JavaScript, **not transpiled**; only a tiny CommonJS `require` shim wraps the
original sources). Three npm packages by takayama-lily, all **MIT** (copyright (c) 2020 takayama-lily, see `mj/LICENSE-riichi.txt`):

* `riichi` 1.2.0 - https://github.com/takayama-lily/riichi  (yaku, han, fu, point calculation)
* `agari` - https://github.com/takayama-lily/agari  (winning-hand decomposition)
* `syanten` - https://github.com/takayama-lily/syanten  (shanten; only used in the unit tests as a cross-check)

One local modification: in `riichi.calcFu` the penchan-wait fu (+2 fu for 12-3 / 7-89 waits) compared against a boolean and
never fired; it is patched (marked `PATCH`). The game's own shanten calculation (used by the AI) is an independent
implementation in `mahjong-core.js` (the library's `syanten` takes ~0.5 ms per call, too slow for the AI); it agreed with the
library on 39,997 of 40,000 random 13/14-tile hands, and an exhaustive brute-force search confirmed the engine's value on all 3
hands where they differ (the library's shanten is one too high there).

## Tile artwork

`mj/tiles/*.svg`: FluffyStuff/riichi-mahjong-tiles (https://github.com/FluffyStuff/riichi-mahjong-tiles), **CC0 / public
domain** (`mj/LICENSE-tiles.txt`). The tile bodies/backs are drawn with CSS; only the face glyphs are used.
`mj/iconmahjong.png` (16x16) was drawn for this project (no third-party art); copy it to `card/iconmahjong.png` for the shell.

## Game / AI

Rules engine, UI and heuristic AI are original code for this project (no external AI model). Rules: 4-player Japanese riichi
mahjong, East round only (East 1-4, dealer repeats), 25,000 start, 136 tiles with 3 red fives, kuitan, double ron, no pao,
no uma/oka. Online play is not supported (the link layer only supports 2 peers).

## Shell integration (card/index.html - to be added by hand)

* Theme id `mahjong`: add `'mahjong'` to `TH`, a name (`KO ? '마작' : 'Mahjong'`) to `NAMES`, a menu item
  `<li class="th thmahjong" onclick="return runMenu(function(){ setTheme('mahjong'); });"><a href="#">　마작</a></li>`,
  and the icon file `iconmahjong.png` (the shell loads `icon<theme>.png`).
* The page defines `window.newGame()`, `window.giveHint()`, `window.toggleAuto()` (returns boolean) and calls
  `parent.setAutoMark(on)`; the page itself also handles F2/F3/F4.
* Suggested shell help text (EN): `<b>Riichi Mahjong</b>: you (South) vs 3 computers, East round only. Tap a tile twice (or drag it up) to discard; Chi/Pon/Kan/Ron/Tsumo/Riichi buttons appear below the table. Hint (F4) marks the recommended move, Auto (F3) lets the computer play your seat. Online play is not available.`
  (KO): `<b>리치 마작</b>: 나(남가)와 컴퓨터 3명, 동풍전. 패를 두 번 누르거나 위로 끌어 버리세요. 치/퐁/깡/론/쯔모/리치 버튼은 테이블 아래에 나타납니다. 힌트(F4)는 추천 수를 표시하고, 자동(F3)은 컴퓨터가 내 자리를 대신 플레이합니다. 온라인 대전은 지원하지 않습니다.`
