// Pixel sprites of the shooter (drawn from small bitmaps), shared by the 2D and the 3D page.
(function () {
  'use strict';
  /* ---------- sprites: '.' empty, other characters index into the palette ---------- */
  function mk(rows, pal) {
    var c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
    var g = c.getContext('2d');
    for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) { var ch = rows[y][x]; if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }
    return c;
  }
  var SHIP = mk(['.....w.....', '.....w.....', '....www....', '....wbw....', '.r.wwbww.r.', '.r.wwwww.r.', 'wwwwwwwwwww', 'ww.wwrww.ww', 'w...rrr...w'], { w: '#e8eef8', b: '#46a0ff', r: '#ff4a3a' });
  function beeF(wing, p) {
    return wing ? mk(['.y.....y.', '.yy...yy.', '.yyyyyyy.', 'yy.yyy.yy', 'yyyyyyyyy', '.bybybyb.', '..b...b..', '.b.....b.'], p)
                : mk(['.........', 'y.y...y.y', 'yyyyyyyyy', 'yy.yyy.yy', 'yyyyyyyyy', '.bybybyb.', '..b...b..', '..b...b..'], p);
  }
  function flyF(wing, p) {
    return wing ? mk(['r.r.....r.r', 'rrr.....rrr', 'rrrrrrrrrrr', '.rrwrrrwrr.', '.rrrrrrrrr.', '..rrw.wrr..', '...r...r...', '..r.....r..'], p)
                : mk(['...........', 'r.r.....r.r', 'rrrrrrrrrrr', 'rrrwrrrwrrr', '.rrrrrrrrr.', '..rrw.wrr..', '..r.....r..', '...........'], p);
  }
  function bossF(wing, p) {
    return wing ? mk(['g.g.....g.g', 'ggg.ggg.ggg', 'ggggggggggg', 'gwwgggggwwg', 'ggwgggggwgg', '.ggggpgggg.', '..gg.p.gg..', '.gg..p..gg.', '.g.......g.'], p)
                : mk(['...g...g...', 'g.ggg.ggg.g', 'ggggggggggg', 'gwwgggggwwg', 'ggwgggggwgg', '.ggggpgggg.', '..gg.p.gg..', '..g..p..g..', '...........'], p);
  }
  var PB = { bee: { y: '#ffd23c', b: '#3c8cff', w: '#fff' }, fly: { r: '#ff3c3c', w: '#fff' }, boss: { g: '#38d05a', w: '#fff', p: '#c050ff' }, bossHit: { g: '#8a6cff', w: '#fff', p: '#ffd23c' } };
  var SPR = {
    ship: SHIP,
    e: [[beeF(0, PB.bee), beeF(1, PB.bee)], [flyF(0, PB.fly), flyF(1, PB.fly)], [bossF(0, PB.boss), bossF(1, PB.boss)]],
    boss2: [bossF(0, PB.bossHit), bossF(1, PB.bossHit)]
  };
  window.ShooterSprites = SPR;
})();
