// sprites shared by both renderers
(function () {
'use strict';
const HUES = [180, 320, 50, 120, 270, 20, 210, 90, 0, 300, 150, 240];
const body = [], orb = [], head = [];
function mk(sz, fn) { const c = document.createElement('canvas'); c.width = c.height = sz; fn(c.getContext('2d'), sz); return c; }
for (let i = 0; i < 12; i++) {
  const h = HUES[i];
  body.push([0, 1].map(function (shade) {
    return mk(64, function (x, s) {
      const g = x.createRadialGradient(s * 0.38, s * 0.34, s * 0.04, s / 2, s / 2, s * 0.5);
      g.addColorStop(0, 'hsl(' + h + ',100%,' + (shade ? 82 : 76) + '%)'); g.addColorStop(0.45, 'hsl(' + h + ',95%,' + (shade ? 56 : 48) + '%)'); g.addColorStop(1, 'hsl(' + h + ',90%,' + (shade ? 30 : 24) + '%)');
      x.fillStyle = g; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 1, 0, 6.2832); x.fill();
    });
  }));
  orb.push(mk(48, function (x, s) {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'hsla(' + h + ',100%,92%,1)'); g.addColorStop(0.28, 'hsla(' + h + ',100%,65%,0.95)'); g.addColorStop(0.55, 'hsla(' + h + ',100%,55%,0.35)'); g.addColorStop(1, 'hsla(' + h + ',100%,50%,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }));
}
window.SnakeSprites = { HUES, body, orb, css: function (i) { return 'hsl(' + HUES[i % 12] + ',100%,65%)'; } };
})();
