(() => {
const PI = 3.1415926535898;
const TR = 57.295779513082320876798154814105;

const canvas = document.getElementById("app");
const hud = document.getElementById("hud");
const RAWBLOCK_SOURCE = window.RAWBLOCK_DATA;
const EMBEDDED_TEXTURES = window.TEXTURE_DATA_URLS || [];
let renderer = null;

try {
  renderer = new window.FixedPipelineGL(canvas);
} catch (error) {
  if (hud) hud.textContent = `graphics init failed\n${error.message}`;
  throw error;
}

function now() {
  return performance.now();
}

function getDateP() {
  const d = new Date();
  const temp0 = BigInt(d.getDate()) + BigInt(d.getMonth()) * 32n + BigInt(d.getFullYear() - 1900) * 366n;
  let temp = temp0 * (temp0 % 5n) - temp0 % 10n;
  temp = (temp * temp * 125124524213n + 231n) / 5n + (temp % 20n);
  return Number(((temp % 21n) + 21n) % 21n);
}

function getHour() {
  return new Date().getHours() % 12;
}

function getMinute() {
  return new Date().getMinutes();
}

function randInt(max) {
  return Math.floor(Math.random() * max);
}

function create3d(x, y, z, value = 0) {
  return Array.from({ length: x }, () =>
    Array.from({ length: y }, () => Array.from({ length: z }, () => value)),
  );
}

function create4d(x, y, z, w, value = 0) {
  return Array.from({ length: x }, () =>
    Array.from({ length: y }, () =>
      Array.from({ length: z }, () => Array.from({ length: w }, () => value))),
  );
}

function clone3d(src) {
  return src.map((plane) => plane.map((row) => row.slice()));
}

function clone4d(src) {
  return src.map((a) => a.map((b) => b.map((c) => c.slice())));
}

function clear4d(arr, value = 0) {
  for (let x = 0; x < arr.length; x++)
    for (let y = 0; y < arr[x].length; y++)
      for (let z = 0; z < arr[x][y].length; z++)
        arr[x][y][z].fill(value);
}

const touchs = Array.from({ length: 40 }, () => ({
  flag: 0,
  x: 0,
  y: 0,
  oldx: 0,
  oldy: 0,
  setx: 0,
  sety: 0,
}));

const state = window.__ptState = {
  ready: false,
  activitysizex: 1,
  activitysizey: 1,
  startscreen: 1,
  goverflg: 0,
  about: 0,
  pause: false,
  depthColor: false,
  centerx: 0,
  centery: 0,
  wAngleX: 6,
  wAngleY: 6,
  wAngleZ: 0,
  t2: 0.085,
  floorz: 0,
  zDeltasum: 0,
  scrollstack: [],
  bi: 0,
  ci: 0,
  otp: 0,
  ft: 0,
  tts: false,
  tts2: false,
  rotMode4D: false, // false=XYZ rotation, true=XYW rotation
  upd: false,
  ul: 0,
  timestamp: 0,
  doubleTapState: { lastUpTime: 0, lastUpX: 0, lastUpY: 0 },
  vkspace: false,
  vkspace2: false,
  touchIds: new Map(),
  pointerPositions: new Map(),
  textures: [],
  rawblock: null,
  b: [create4d(7, 7, 7, 7), create4d(7, 7, 7, 7), create4d(7, 7, 7, 7), create4d(7, 7, 7, 7)],
  rbt: Array.from({ length: 6 }, () =>
    Array.from({ length: 2 }, () => create4d(7, 7, 7, 7))),
  nowblock: null,
  nextblock: null,
  holdblock: null,
  blk: create4d(7, 7, 26, 7),
  blockpos: [0, 0, 14, 0],
  blockpostmp: [0, 0, 14, 0],
  wAngleXW: 0,
  wAngleYW: 0,
  wAngleZW: 0,
  nowhb: 0,
  nowib: 0,
  holdhb: 0,
  holdib: 0,
  nexthb: 0,
  nextib: 0,
  monoonly: 0,
  spinlock: 0,
  hideblock: 0,
  hidenext: 0,
  score2x: 0,
  score: 0,
  lines: 0,
  level: 1,
  asc: 0,
  gt: 0,
  ht: 0,
  r1o: 0,
  r2o: 0,
  oh: 0,
  oscore: 0,
  itemInfoIndex: 0,
  itemInfoLastSwitch: 0,
};

// Item description overlay
window.itemsEnabled = new URLSearchParams(window.location.search).get('items') !== '0';
var itemsEnabled = window.itemsEnabled;
const overlayCanvas = document.createElement('canvas');
overlayCanvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;background:transparent';
canvas.parentElement.appendChild(overlayCanvas);
const ctx2d = overlayCanvas.getContext('2d');

const _isKo = /^ko/i.test(navigator.language || '');
const ITEM_DESC = _isKo ? {
  1:'자폭: 착지 시 주변 삭제', 2:'은폐: 현재 블록 숨김', 200:'거울상: 보드 좌우반전', 4:'득점강화: 점수 2배',
  5:'아이템제거', 6:'예측차단: 다음 블록 숨김', 8:'속도두배', 9:'속도절반',
  10:'홀드봉인', 11:'장애물 추가', 16:'시야봉인: 보드 숨김', 17:'폭탄블록 추가',
  91:'회전봉인', 20:'빈공간삭제', 21:'소형화', 22:'대형화', 30:'관통', 31:'상쇄',
  102:'상단삭제', 104:'단순화: 1칸 블록', 105:'종렬삭제', 106:'W열삭제', 116:'-2줄', 117:'+2줄',
  118:'범위삭제', 119:'전체삭제', 120:'시한폭탄', 121:'시한폭탄', 122:'시한폭탄',
  123:'시한폭탄', 124:'-3줄', 125:'+1줄', 126:'횡렬삭제', 127:'폭탄변환',
} : {
  1:'Self-Destruct', 2:'Conceal', 200:'Mirror', 4:'Score Boost: 2x', 5:'Item Clear',
  6:'No Preview', 8:'Speed Up', 9:'Slow Down', 10:'Hold Lock', 11:'Obstacle',
  16:'Blind', 17:'Bomb x3', 91:'Rot Lock', 20:'Gap Clear', 21:'Simplify',
  22:'PentaForce', 30:'Pierce', 31:'Cancel', 102:'Top Clear', 104:'Mono Only',
  105:'Col Del', 106:'W Del', 116:'-2 Lines', 117:'+2 Lines', 118:'Range Del', 119:'Full Clear',
  120:'Time Bomb', 121:'Time Bomb', 122:'Time Bomb', 123:'Time Bomb',
  124:'-3 Lines', 125:'+1 Line', 126:'Row Del', 127:'Bomb Convert',
};
const ITEM_GOOD = new Set([1,4,9,20,21,30,31,102,104,105,106,116,117,118,119,124,125,126]);

const texcoords = [
  0, 1,
  0, 0,
  1, 0,
  1, 1,
];
const texcoordsTiled = [
  0, 3,
  0, 0,
  3, 0,
  3, 3,
];

function normalizeTouch(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const activitysizex = rect.width || 1;
  const activitysizey = rect.height || 1;
  return {
    x: ((px / activitysizex) * 3 - 1.5) / 2.095,
    y: -((((py + activitysizey / 40) / activitysizey) * 3 - 1.5) * activitysizey / activitysizex / 2.095),
  };
}

function findFreeTouchSlot() {
  for (let i = 0; i < touchs.length; i += 1) {
    if (touchs[i].flag === 0) return i;
  }
  return -1;
}

function findPointerForSlot(slot) {
  for (const [pointerId, s] of state.touchIds.entries()) {
    if (s === slot) return pointerId;
  }
  return -1;
}

function getOrCreateTouchSlot(pointerId) {
  if (state.touchIds.has(pointerId)) return state.touchIds.get(pointerId);
  const slot = findFreeTouchSlot();
  if (slot === -1) return -1;
  state.touchIds.set(pointerId, slot);
  return slot;
}

function setTouchFromPointer(pointerId, clientX, clientY, flag = null) {
  const slot = getOrCreateTouchSlot(pointerId);
  if (slot < 0) return;
  const point = normalizeTouch(clientX, clientY);
  const touch = touchs[slot];
  touch.oldx = touch.x;
  touch.oldy = touch.y;
  touch.x = point.x;
  touch.y = point.y;
  if (flag === 1) {
    touch.oldx = point.x;
    touch.oldy = point.y;
    touch.setx = point.x;
    touch.sety = point.y;
  }
  if (flag !== null) {
    touch.flag = flag;
  }
  state.pointerPositions.set(pointerId, { clientX, clientY });
}

function normalizeTouchFlagsAfterPointerLoss() {
  for (let i = 0; i < touchs.length; i += 1) {
    const touch = touchs[i];
    if (touch.flag !== 0 && touch.flag < 20) {
      if (touch.flag === 1) touch.flag = 0;
      else if (touch.flag === 2) touch.flag = 3;
    } else if (touch.flag > 19) {
      touch.flag -= 20;
    }
  }
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  setTouchFromPointer(event.pointerId, event.clientX, event.clientY, 1);
});

canvas.addEventListener("pointermove", (event) => {
  if (state.touchIds.has(event.pointerId)) {
    setTouchFromPointer(event.pointerId, event.clientX, event.clientY);
  }
});

function clearPointer(pointerId, clientX, clientY) {
  if (!state.touchIds.has(pointerId)) {
    return;
  }
  const slot = state.touchIds.get(pointerId);
  const touch = touchs[slot];
  touch.oldx = touch.x;
  touch.oldy = touch.y;
  const point = normalizeTouch(clientX, clientY);
  touch.x = point.x;
  touch.y = point.y;
  if (touch.flag === 2 || touch.flag === 1) touch.flag = 3;
  state.touchIds.delete(pointerId);
  state.pointerPositions.delete(pointerId);
  for (const [activePointerId, activeSlot] of state.touchIds.entries()) {
    const activeTouch = touchs[activeSlot];
    activeTouch.oldx = activeTouch.x;
    activeTouch.oldy = activeTouch.y;
    const pos = state.pointerPositions.get(activePointerId);
    if (pos) {
      const normalized = normalizeTouch(pos.clientX, pos.clientY);
      activeTouch.x = normalized.x;
      activeTouch.y = normalized.y;
    }
    activeTouch.flag += 20;
  }
  normalizeTouchFlagsAfterPointerLoss();
}

canvas.addEventListener("pointerup", (event) => {
  clearPointer(event.pointerId, event.clientX, event.clientY);
});
canvas.addEventListener("pointercancel", (event) => clearPointer(event.pointerId, event.clientX, event.clientY));

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const point = normalizeTouch(event.clientX, event.clientY);
  zoom(-event.deltaY * 3, point.y);
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    state.vkspace2 = true;
  }
  if (event.code === "ArrowLeft" || event.code === "ArrowRight" ||
      event.code === "ArrowUp" || event.code === "ArrowDown") {
    if (!state.pause) {
      const screenAngle = event.code === "ArrowLeft" ? PI :
                          event.code === "ArrowRight" ? 0 :
                          event.code === "ArrowUp" ? PI / 2 : -PI / 2;
      let deg = screenAngle - state.r1o;
      while (deg < -PI) deg += 2 * PI;
      while (deg > PI) deg -= 2 * PI;
      if (-3 * PI / 4 < deg && deg <= -PI / 4) {
        move(1, 1);
      } else if (-PI / 4 < deg && deg <= PI / 4) {
        move(0, 1);
      } else if (PI / 4 < deg && deg <= 3 * PI / 4) {
        move(1, -1);
      } else {
        move(0, -1);
      }
    }
  }
  // Depth color toggle
  if (event.code === "Slash") {
    state.depthColor = !state.depthColor;
  }
  // W-axis movement
  if (event.code === "Comma") {
    move(3, -1);
  }
  if (event.code === "Period") {
    move(3, 1);
  }
  // XY rotation
  if (event.code === "KeyZ") {
    rotate(0, -1);
  }
  if (event.code === "KeyX") {
    rotate(0, 1);
  }
  // YZ rotation
  if (event.code === "KeyC") {
    rotate(1, -1);
  }
  if (event.code === "KeyV") {
    rotate(1, 1);
  }
  // XW rotation
  if (event.code === "KeyA") {
    rotate(3, -1);
  }
  if (event.code === "KeyS") {
    rotate(3, 1);
  }
  // XZ rotation
  if (event.code === "KeyR") {
    rotate(2, -1);
  }
  if (event.code === "KeyT") {
    rotate(2, 1);
  }
  // YW rotation
  if (event.code === "KeyD") {
    rotate(4, -1);
  }
  if (event.code === "KeyF") {
    rotate(4, 1);
  }
  // ZW rotation
  if (event.code === "KeyG") {
    rotate(5, -1);
  }
  if (event.code === "KeyH") {
    rotate(5, 1);
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    state.vkspace2 = false;
  }
});

async function loadTexture(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(renderer.createTextureFromImage(image));
    image.onerror = () => reject(new Error(`Failed to load ${path}`));
    image.src = path;
  });
}

async function tryLoadTextures() {
  const textures = [];
  for (let i = 0; i < 7; i += 1) {
    try {
      const source = EMBEDDED_TEXTURES[i] || `./assets/texture${i}.bmp`;
      textures.push(await loadTexture(source));
    } catch {
      break;
    }
  }
  state.textures = textures;
}

function resize() {
  renderer.resize();
  state.activitysizex = canvas.width;
  state.activitysizey = canvas.height;
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  renderer.matrixMode("PROJECTION");
  renderer.orthof(-1.5, 1.5, (-1.5 * canvas.height) / canvas.width, (1.5 * canvas.height) / canvas.width, 0.96, 20);
}

function clear3d(arr, value = 0) {
  for (let x = 0; x < arr.length; x += 1) {
    for (let y = 0; y < arr[x].length; y += 1) {
      arr[x][y].fill(value);
    }
  }
}

function zoom(zDelta, y) {
  state.zDeltasum += zDelta;
  state.t2 = 0.05 + state.zDeltasum * 0.00005;
  if (state.t2 <= 0) {
    state.t2 = 0.005;
  }
  if (zDelta > 0) {
    if (state.t2 > 0.05) {
      state.centery -= y * state.t2;
      if (state.scrollstack.length < 300) {
        state.scrollstack.push(state.centery);
      }
    } else {
      state.centery = 0;
    }
  } else if (state.scrollstack.length) {
    state.centery = state.scrollstack.pop();
  } else {
    state.centery = 0;
  }
}

function createNewBlock() {
  clear4d(state.b[2], 0);
  let blkcnt = 0;
  let x = 2;
  let y = 2;
  let z = 2;
  let w = 3;
  let blockcnt = randInt(32768);
  if (blockcnt > 8192) blockcnt = 6;
  else if (blockcnt > 2048) blockcnt = 7;
  else if (blockcnt > 512) blockcnt = 8;
  else if (blockcnt > 128) blockcnt = 9;
  else if (blockcnt > 32) blockcnt = 10;
  else if (blockcnt > 8) blockcnt = 11;
  else if (blockcnt > 4) blockcnt = 12;
  else if (blockcnt > 2) blockcnt = 13;
  else blockcnt = 14;
  let xh = 0, xl = 6;
  let yh = 0, yl = 6;
  let zh = 0, zl = 6;
  let wh = 0, wl = 6;
  while (blkcnt < blockcnt) {
    if (state.b[2][x][y][z][w] === 0) {
      blkcnt += 1;
      const _rv2={6:207,7:206,8:205,9:203,10:202,11:201,12:199,13:198,14:197}; state.b[2][x][y][z][w] = _rv2[blockcnt] || (158+blockcnt);
      if (x >= xh) xh = x; if (x <= xl) xl = x;
      if (y >= yh) yh = y; if (y <= yl) yl = y;
      if (z >= zh) zh = z; if (z <= zl) zl = z;
      if (w >= wh) wh = w; if (w <= wl) wl = w;
    }
    switch (randInt(8)) {
      case 0: x = Math.min(6, x + 1); break;
      case 1: x = Math.max(0, x - 1); break;
      case 2: y = Math.min(6, y + 1); break;
      case 3: y = Math.max(0, y - 1); break;
      case 4: z = Math.min(6, z + 1); break;
      case 5: z = Math.max(0, z - 1); break;
      case 6: w = Math.min(6, w + 1); break;
      default: w = Math.max(0, w - 1); break;
    }
  }
  xl = Math.floor((xl + xh) / 2) - 3;
  yl = Math.floor((yl + yh) / 2) - 3;
  zl = Math.floor((zl + zh) / 2) - 3;
  wl = Math.floor((wl + wh) / 2) - 3;
  for (let xi = 0; xi < 7; xi += 1) {
    for (let yi = 0; yi < 7; yi += 1) {
      for (let zi = 0; zi < 7; zi += 1) {
        for (let wi = 0; wi < 7; wi += 1) {
          const sx = xi + xl, sy = yi + yl, sz = zi + zl, sw = wi + wl;
          state.rawblock[56][xi][yi][zi][wi] =
            sx >= 0 && sx <= 6 && sy >= 0 && sy <= 6 && sz >= 0 && sz <= 6 && sw >= 0 && sw <= 6
              ? state.b[2][sx][sy][sz][sw]
              : 0;
        }
      }
    }
  }
}

function initBlockState() {
  loadHighScore();
  state.floorz = 0;
  state.nowhb = 0;
  state.nowib = 0;
  state.holdhb = 0;
  state.holdib = 0;
  state.nexthb = 0;
  state.nextib = 0;
  state.bi = 0;
  state.ci = 0;
  state.timestamp = 0;
  state.vkspace = false;
  state.vkspace2 = false;
  state.lines = 0;
  state.score = 0;
  state.level = 1;
  clear4d(state.blk, 0);
  state.asc = 0;
  state.monoonly = 0;
  state.spinlock = 0;
  state.hideblock = 0;
  state.hidenext = 0;
  state.score2x = 0;
  state.speedup = 0;
  state.speeddown = 0;
  state.holdlock = 0;
  state.blindboard = 0;
  state.bombnext = 0;
  state.compactPending = false;
  state.simplify2 = 0;
  state.pentaForce = 0;
  state.nowblock = state.b[0];
  state.nextblock = state.b[1];
  state.holdblock = state.b[3];
  clear4d(state.holdblock, 0);
  state.holdblock[3][3][3][3] = itemsEnabled ? 4 : 65;
  setnextblock();
  setnextblock();
}

function chooseBaseBlockIndex() {
  let b1;
  let b2;
  let b3;
  let b4;
  let b5;
  switch (state.level) {
    case 0: b1 = 50; b2 = 100; b3 = 100; b4 = 100; b5 = 100; break;
    case 1: b1 = 10; b2 = 30; b3 = 60; b4 = 100; b5 = 100; break;
    case 2: b1 = 6; b2 = 20; b3 = 40; b4 = 98; b5 = 100; break;
    case 3: b1 = 4; b2 = 10; b3 = 30; b4 = 95; b5 = 100; break;
    case 4: b1 = 3; b2 = 8; b3 = 34; b4 = 93; b5 = 99; break;
    case 5: b1 = 3; b2 = 7; b3 = 32; b4 = 90; b5 = 99; break;
    case 6: b1 = 2; b2 = 6; b3 = 31; b4 = 88; b5 = 99; break;
    case 7: b1 = 2; b2 = 5; b3 = 30; b4 = 86; b5 = 98; break;
    case 8: b1 = 2; b2 = 5; b3 = 29; b4 = 84; b5 = 98; break;
    case 9: b1 = 2; b2 = 5; b3 = 29; b4 = 82; b5 = 98; break;
    case 10: b1 = 2; b2 = 5; b3 = 28; b4 = 81; b5 = 97; break;
    case 11: b1 = 2; b2 = 5; b3 = 28; b4 = 80; b5 = 97; break;
    case 12: b1 = 2; b2 = 5; b3 = 28; b4 = 79; b5 = 97; break;
    case 13: b1 = 2; b2 = 5; b3 = 28; b4 = 78; b5 = 96; break;
    case 14: b1 = 2; b2 = 5; b3 = 27; b4 = 78; b5 = 96; break;
    case 15: b1 = 2; b2 = 5; b3 = 27; b4 = 77; b5 = 96; break;
    case 16: b1 = 2; b2 = 5; b3 = 27; b4 = 76; b5 = 96; break;
    default: b1 = 2; b2 = 5; b3 = 27; b4 = 75; b5 = 95; break;
  }
  if (state.monoonly) {
    b1 = 100;
    b2 = 100;
    b3 = 100;
    b4 = 100;
    state.monoonly -= 1;
  }
  let t = randInt(100);
  if (t < b1) t = 0;
  else if (t < b2) t = 1;
  else if (t < b3) t = 2 + randInt(2);
  else if (t < b4) t = 4 + randInt(7); // 7 free tetratesseracts
  else if (t < b5) t = 11 + randInt(26); // 26 free pentatesseracts (indices 11-36)
  else {
    // Hexa+ special blocks: I6(37), 2x2x2x1(38), 3x3x1x1(39), I7(40), 2x2x2x2(41), dynamic(56)
    const r = randInt(3);
    if (r === 0) { createNewBlock(); t = 56; }
    else { t = 37 + randInt(5); } // indices 37-41
  }
  return t;
}

function applySpecialAging() {
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 26; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        const value = state.blk[x][y][z][w];
        if (120 <= value && value < 123) {
          state.blk[x][y][z][w] += 1;
        } else if (value === 123) {
          for (let x2 = x - 1; x2 <= x + 1; x2 += 1) {
            for (let y2 = y - 1; y2 <= y + 1; y2 += 1) {
              for (let z2 = z - 1; z2 <= z + 1; z2 += 1) {
                for (let w2 = w - 1; w2 <= w + 1; w2 += 1) {
                if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && z2 >= 0 && z2 < 26 && w2 >= 0 && w2 < 7) {
                  state.blk[x2][y2][z2][w2] = randInt(4) !== 0 ? 98 : 0;
                }
                }
              }
            }
          }
        } else if (value === 32) {
          for (let x2 = x - 1; x2 <= x + 1; x2 += 1) {
            for (let y2 = y - 1; y2 <= y + 1; y2 += 1) {
              for (let z2 = z - 1; z2 <= z + 1; z2 += 1) {
                for (let w2 = w - 1; w2 <= w + 1; w2 += 1) {
                if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && z2 >= 0 && z2 < 26 && w2 >= 0 && w2 < 7) {
                  state.blk[x2][y2][z2][w2] = 0;
                }
                }
              }
            }
          }
        }
        }
      }
    }
  }
}

function assignCellFromProbability(baseIndex, x, y, z, w) {
  const raw = state.rawblock[baseIndex][x][y][z][w];
  if (raw === 0) {
    return 0;
  }
  if (!itemsEnabled) return raw;
  let u = (randInt(16384) + randInt(16384) * 16384) % 1000000;
  if (u < 100) return 116;
  if (u < 400) return 117;
  if (u < 700) return 118;
  if (u < 710) return 119;
  if (u < 1510) return 104;
  if (u < 2010) return 120;
  if (u < 3010) return 121;
  if (u < 3710) return 122;
  if (u < 4010) return 123;
  if (u < 4020) return 124;
  if (u < 4820) return 125;
  if (u < 5070) return 91;
  if (u < 5170) return 102;
  if (u < 5370) return 126;
  if (u < 5570) return 105;
  if (u < 5770) return 106;
  if (u < 5870) return 127;
  if (u < 5970) return 17;
  if (u < 6170) return 20;
  if (u < 6570) return 21;
  if (u < 7370) return 22;
  if (u < 7620) return 16;
  if (u < 7820) return 11;
  if (u < 8070) return 2;
  if (u < 9070) return 8;
  if (u < 10070) return 9;
  if (u < 10320) return 10;
  if (u < 11320) return 5;
  if (u < 11570) return 6;
  if (u < 13820) return 120;
  if (u < 23820) return 4;
  if (u < 24320) return 200; // mirror 0.05%
  if (baseIndex === 0 && randInt(10) === 0) return 1;
  if (baseIndex === 0 && randInt(20) === 0) {
    state.nexthb = 1;
    return 30;
  }
  if (baseIndex === 0 && randInt(10) === 1) return 1;
  if (baseIndex === 0 && randInt(5) < 2) {
    state.nextib = 1;
    return 31;
  }
  if (state.monoonly) return 12 + randInt(4);
  if (u > 20000 && u < 60000 && getHour() === 0 && getMinute() === 0) {
    const du = u - 20000;
    const bonus = [
      [4900, 116], [14700, 117], [14700, 118], [499, 119], [14700, 104],
      [171500, 120], [49000, 121], [34300, 122], [14700, 123], [1497, 124],
      [39200, 125], [12250, 91], [4900, 102], [9800, 126], [9800, 105],
      [4900, 127], [9800, 106], [9800, 1], [12250, 2], [49000, 5], [12250, 6], [40000, 4],
    ];
    const dp = getDateP();
    const entry = bonus[dp] || bonus[20];
    return du < entry[0] ? entry[1] : raw;
  }
  return raw;
}

function setnextblock() {
  state.asc = 0;
  [state.nextblock, state.nowblock] = [state.nowblock, state.nextblock];
  [state.nexthb, state.nowhb] = [state.nowhb, state.nexthb];
  [state.nextib, state.nowib] = [state.nowib, state.nextib];
  state.nexthb = 0;
  state.nextib = 0;
  applySpecialAging();

  const baseIndex = chooseBaseBlockIndex();
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        for (let w = 0; w < 7; w += 1) {
          state.nextblock[x][y][z][w] = assignCellFromProbability(baseIndex, x, y, z, w);
        }
      }
    }
  }

  state.blockpos[0] = 0;
  state.blockpos[1] = 0;
  state.blockpos[2] = 14;
  state.blockpos[3] = 0;

  [state.nextblock, state.nowblock] = [state.nowblock, state.nextblock];
  const i = randInt(4);
  const j = randInt(4);
  const k = randInt(4);
  for (let a = 0; a < i; a += 1) rotate(0, 1);
  for (let a = 0; a < j; a += 1) rotate(1, 1);
  for (let a = 0; a < k; a += 1) rotate(2, 1);
  [state.nextblock, state.nowblock] = [state.nowblock, state.nextblock];

  rotate2();
  return move(0, 0);
}

function rotate2() {
  const dst = state.b[2];
  // Helper to copy dst->rbt
  function copyToRbt(plane, dir) {
    for (let x = 0; x < 7; x++)
      for (let y = 0; y < 7; y++)
        for (let z = 0; z < 7; z++)
          for (let w = 0; w < 7; w++)
            state.rbt[plane][dir][x][y][z][w] = dst[x][y][z][w];
  }

  // rbt[0][0]: XY rotation CW (x,y)->(y,6-x)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[y][6 - x][z][w] = state.nowblock[x][y][z][w];
  copyToRbt(0, 0);

  // rbt[0][1]: XY rotation CCW (x,y)->(6-y,x)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[6 - y][x][z][w] = state.nowblock[x][y][z][w];
  copyToRbt(0, 1);

  // rbt[1][0]: YZ rotation (x,y,z)->(x,z,6-y)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[x][z][6 - y][w] = state.nowblock[x][y][z][w];
  copyToRbt(1, 0);

  // rbt[1][1]: YZ rotation reverse (x,y,z)->(x,6-z,y)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[x][6 - z][y][w] = state.nowblock[x][y][z][w];
  copyToRbt(1, 1);

  // rbt[2][0]: XZ rotation (x,y,z)->(z,y,6-x)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[z][y][6 - x][w] = state.nowblock[x][y][z][w];
  copyToRbt(2, 0);

  // rbt[2][1]: XZ rotation reverse (x,y,z)->(6-z,y,x)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[6 - z][y][x][w] = state.nowblock[x][y][z][w];
  copyToRbt(2, 1);

  // rbt[3][0]: XW rotation (x,w)->(w,6-x)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[w][y][z][6 - x] = state.nowblock[x][y][z][w];
  copyToRbt(3, 0);

  // rbt[3][1]: XW rotation reverse (x,w)->(6-w,x)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[6 - w][y][z][x] = state.nowblock[x][y][z][w];
  copyToRbt(3, 1);

  // rbt[4][0]: YW rotation (y,w)->(w,6-y)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[x][w][z][6 - y] = state.nowblock[x][y][z][w];
  copyToRbt(4, 0);

  // rbt[4][1]: YW rotation reverse (y,w)->(6-w,y)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[x][6 - w][z][y] = state.nowblock[x][y][z][w];
  copyToRbt(4, 1);

  // rbt[5][0]: ZW rotation (z,w)->(w,6-z)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[x][y][w][6 - z] = state.nowblock[x][y][z][w];
  copyToRbt(5, 0);

  // rbt[5][1]: ZW rotation reverse (z,w)->(6-w,z)
  clear4d(dst, 0);
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        for (let w = 0; w < 7; w++)
          dst[x][y][6 - w][z] = state.nowblock[x][y][z][w];
  copyToRbt(5, 1);
}

function rotate(pos, deg) {
  if (state.spinlock !== 0) return 0;
  if ((deg & 3) === 0) return 0;
  const temp = state.b[2];
  clear4d(temp, 0);
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        const value = state.nowblock[x][y][z][w];
        if (!value) continue;
        // pos: 0=XY, 1=YZ, 2=XZ, 3=XW, 4=YW, 5=ZW
        if (pos === 0) {
          if ((deg & 3) === 1) temp[6 - y][x][z][w] = value;
          else if ((deg & 3) === 2) temp[6 - y][6 - x][z][w] = value;
          else temp[y][6 - x][z][w] = value;
        } else if (pos === 1) {
          if ((deg & 3) === 1) temp[x][6 - z][y][w] = value;
          else if ((deg & 3) === 2) temp[x][6 - z][6 - y][w] = value;
          else temp[x][z][6 - y][w] = value;
        } else if (pos === 2) {
          if ((deg & 3) === 1) temp[6 - z][y][x][w] = value;
          else if ((deg & 3) === 2) temp[6 - z][y][6 - x][w] = value;
          else temp[z][y][6 - x][w] = value;
        } else if (pos === 3) {
          // XW rotation
          if ((deg & 3) === 1) temp[6 - w][y][z][x] = value;
          else if ((deg & 3) === 2) temp[6 - w][y][z][6 - x] = value;
          else temp[w][y][z][6 - x] = value;
        } else if (pos === 4) {
          // YW rotation
          if ((deg & 3) === 1) temp[x][6 - w][z][y] = value;
          else if ((deg & 3) === 2) temp[x][6 - w][z][6 - y] = value;
          else temp[x][w][z][6 - y] = value;
        } else {
          // ZW rotation (pos === 5)
          if ((deg & 3) === 1) temp[x][y][6 - w][z] = value;
          else if ((deg & 3) === 2) temp[x][y][6 - w][6 - z] = value;
          else temp[x][y][w][6 - z] = value;
        }
        }
      }
    }
  }

  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        const value = temp[x][y][z][w];
        if (!value) continue;
        const bx = x + state.blockpos[0];
        const by = y + state.blockpos[1];
        const bz = z + state.blockpos[2];
        const bw = w + state.blockpos[3];
        if (bx < 0 || bx > 6 || by < 0 || by > 6 || bz < 0 || bz > 25 || bw < 0 || bw > 6) {
          return 1;
        }
        const blockValue = state.blk[bx][by][bz][bw];
        if (blockValue !== 0 && blockValue !== 31) return 1;
        }
      }
    }
  }

  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        state.nowblock[x][y][z][w] = temp[x][y][z][w];
        if (
          state.nowblock[x][y][z][w] !== 0 &&
          state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]][w + state.blockpos[3]] === 31
        ) {
          state.nowblock[x][y][z][w] = 0;
          state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]][w + state.blockpos[3]] = 0;
        }
        }
      }
    }
  }

  rotate2();
  return 0;
}

function move(pos, deg) {
  for (;;) {
    let restart = false;
    state.blockpostmp[0] = state.blockpos[0];
    state.blockpostmp[1] = state.blockpos[1];
    state.blockpostmp[2] = state.blockpos[2];
    state.blockpostmp[3] = state.blockpos[3];
    state.blockpostmp[pos] += deg;

    outer:
    for (let x = 0; x < 7; x += 1) {
      for (let y = 0; y < 7; y += 1) {
        for (let z = 0; z < 7; z += 1) {
          for (let w = 0; w < 7; w += 1) {
          if (state.nowblock[x][y][z][w] === 0) continue;
          const bx = x + state.blockpostmp[0];
          const by = y + state.blockpostmp[1];
          const bz = z + state.blockpostmp[2];
          const bw = w + state.blockpostmp[3];
          if (bx < 0 || bx > 6 || by < 0 || by > 6 || bw < 0 || bw > 6) return 1;
          if (bz < 0) {
            if (state.nowhb) {
              for (let cx = 0; cx < 7; cx += 1) {
                for (let cy = 0; cy < 7; cy += 1) {
                  for (let cw = 0; cw < 7; cw += 1) {
                  let src = 0;
                  let dst = 0;
                  while (src < 25) {
                    if (state.blk[cx][cy][src][cw] !== 0) {
                      state.blk[cx][cy][dst][cw] = state.blk[cx][cy][src][cw];
                      if (
                        dst !== 0 &&
                        (
                          (state.blk[cx][cy][dst][cw] === 31 && state.blk[cx][cy][dst - 1][cw] !== 0 && state.blk[cx][cy][dst - 1][cw] !== 31) ||
                          (state.blk[cx][cy][dst - 1][cw] === 31 && state.blk[cx][cy][dst][cw] !== 0 && state.blk[cx][cy][dst][cw] !== 31)
                        )
                      ) {
                        state.blk[cx][cy][dst][cw] = 0;
                        state.blk[cx][cy][dst - 1][cw] = 0;
                        dst -= 2;
                      }
                      dst += 1;
                    }
                    src += 1;
                  }
                  while (dst < 25) {
                    state.blk[cx][cy][dst][cw] = 0;
                    dst += 1;
                  }
                  }
                }
              }
              removeline();
            }
            return 1;
          }
          if (bz > 25) return 1;

          const cell = state.blk[bx][by][bz][bw];
          if (state.nowhb === 0 && state.nowib === 0) {
            if (cell === 31) {
              state.blk[bx][by][bz][bw] = 0;
              state.nowblock[x][y][z][w] = 0;
              let hasAny = false;
              for (let x2 = 0; x2 < 7 && !hasAny; x2 += 1) {
                for (let y2 = 0; y2 < 7 && !hasAny; y2 += 1) {
                  for (let z2 = 0; z2 < 7 && !hasAny; z2 += 1) {
                    for (let w2 = 0; w2 < 7; w2 += 1) {
                    if (state.nowblock[x2][y2][z2][w2] !== 0) {
                      hasAny = true;
                      break;
                    }
                    }
                  }
                }
              }
              if (!hasAny) setnextblock();
              state.score += 40;
              restart = true;
              break outer;
            }
            if (cell) return 1;
          } else if (state.nowhb === 1) {
            if (cell === 31) {
              state.blk[bx][by][bz][bw] = 0;
              state.nowblock[x][y][z][w] = 0;
              setnextblock();
              state.score += 40;
              restart = true;
              break outer;
            }
            state.blk[bx][by][bz][bw] = 0;
          } else if (state.nowib === 1 && cell !== 31 && cell !== 0) {
            state.blk[bx][by][bz][bw] = 0;
            setnextblock();
            state.score += 40;
            restart = true;
            break outer;
          } else if (state.nowib === 1 && cell === 31) {
            return 1;
          }
          }
        }
      }
    }

    if (restart) {
      continue;
    }

    state.blockpos[0] = state.blockpostmp[0];
    state.blockpos[1] = state.blockpostmp[1];
    state.blockpos[2] = state.blockpostmp[2];
    state.blockpos[3] = state.blockpostmp[3];
    return 0;
  }
}

// coords4d: array of [x, y, w] tuples; z is the plane level
function processLine(cells, z, coords4d) {
  let tline2 = 0;
  for (const [x, y, w] of coords4d) {
    if (state.blk[x][y][z][w] === 0) return 0;
    if (state.blk[x][y][z][w] < 256) tline2 += 1;
  }
  let filled = tline2 ? 1 : 0;
  for (const [x, y, w] of coords4d) {
    const code = state.blk[x][y][z][w] & 255;
    if (code === 116) { cells.tline -= 2; state.blk[x][y][z][w] = 256; }
    else if (code === 117) { cells.tline += 2; state.blk[x][y][z][w] = 256; }
    else if (code === 118) {
      state.blk[x][y][z][w] = 256;
      for (let x2 = x - 1; x2 <= x + 1; x2 += 1) {
        for (let y2 = y - 1; y2 <= y + 1; y2 += 1) {
          for (let w2 = w - 1; w2 <= w + 1; w2 += 1) {
            if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && w2 >= 0 && w2 < 7) {
              for (let z2 = 0; z2 < 26; z2 += 1) state.blk[x2][y2][z2][w2] |= 256;
            }
          }
        }
      }
    } else if (code === 119) {
      clear4d(state.blk, 0);
      return { hardReset: true, filled };
    } else if (code === 104) { state.simplify2 = 0; state.pentaForce = 0; state.monoonly += 10; state.blk[x][y][z][w] = 256; }
    else if (code === 124) { cells.tline -= 3; state.blk[x][y][z][w] = 256; }
    else if (code === 125) { cells.tline += 1; state.blk[x][y][z][w] = 256; }
    else if (code === 91) { state.spinlock += 10; state.blk[x][y][z][w] = 256; }
    else if (code === 8) { state.speedup += 10; state.blk[x][y][z][w] = 256; }
    else if (code === 9) { state.speeddown += 10; state.blk[x][y][z][w] = 256; }
    else if (code === 10) { state.holdlock += 10; state.blk[x][y][z][w] = 256; }
    else if (code === 16) { state.blindboard = now() + 10000; state.blk[x][y][z][w] = 256; }
    else if (code === 17) { state.bombnext += 3; state.blk[x][y][z][w] = 256; }
    else if (code === 20) { state.compactPending = true; state.blk[x][y][z][w] = 256; }
    else if (code === 21) { state.monoonly = 0; state.pentaForce = 0; state.simplify2 += 15; state.blk[x][y][z][w] = 256; }
    else if (code === 22) { state.monoonly = 0; state.simplify2 = 0; state.pentaForce += 6; state.blk[x][y][z][w] = 256; }
    else if (code === 2) { state.hideblock += 10; state.blk[x][y][z][w] = 256; }
    else if (code === 6) { state.hidenext += 10; state.blk[x][y][z][w] = 256; }
    else if (code === 5) {
      for (let x2 = 0; x2 < 7; x2 += 1) {
        for (let y2 = 0; y2 < 7; y2 += 1) {
          for (let z2 = 0; z2 < 26; z2 += 1) {
            for (let w2 = 0; w2 < 7; w2 += 1) {
            if (state.blk[x2][y2][z2][w2] !== 0 && state.blk[x2][y2][z2][w2] !== 256) {
              state.blk[x2][y2][z2][w2] = 33 + (state.blk[x2][y2][z2][w2] % 31);
            }
            }
          }
        }
      }
      state.blk[x][y][z][w] = 256;
    } else if (code === 4) { state.score2x += 1; state.blk[x][y][z][w] = 256; }
    else if (code === 200) {
      // mirror board horizontally (flip x-axis)
      state.blk[x][y][z][w] = 256;
      for (let mz = 0; mz < 26; mz++) {
        for (let my = 0; my < 7; my++) {
          for (let mw = 0; mw < 7; mw++) {
            for (let mx = 0; mx < 3; mx++) {
              const tmp = state.blk[mx][my][mz][mw];
              state.blk[mx][my][mz][mw] = state.blk[6 - mx][my][mz][mw];
              state.blk[6 - mx][my][mz][mw] = tmp;
            }
          }
        }
      }
    }
    else if (code === 11) {
      state.blk[x][y][z][w] = 256;
      let count2 = 0;
      for (let i = 0; i < 50; i += 1) {
        const rx = randInt(6);
        const ry = randInt(6);
        const rz = randInt(6);
        const rw = randInt(6);
        if (
          state.blk[rx][ry][rz][rw] === 0 &&
          state.blk[rx + 1][ry][rz][rw] === 0 &&
          state.blk[rx][ry + 1][rz][rw] === 0 &&
          state.blk[rx][ry][rz + 1][rw] === 0
        ) {
          count2 += 1;
          state.blk[rx][ry][rz][rw] = 103;
        }
        if (count2 === 3) break;
      }
    } else if (code === 102) {
      for (let x2 = 0; x2 < 7; x2 += 1) {
        for (let y2 = 0; y2 < 7; y2 += 1) {
          for (let z2 = z; z2 < 26; z2 += 1)
            for (let w2 = 0; w2 < 7; w2 += 1) state.blk[x2][y2][z2][w2] = 256;
        }
      }
    } else if (code === 105) {
      state.blk[x][y][z][w] = 256;
      for (let x2 = x - 1; x2 <= x + 1; x2 += 1) {
        if (x2 >= 0 && x2 < 7) {
          for (let y2 = 0; y2 < 7; y2 += 1) {
            for (let z2 = 0; z2 < 26; z2 += 1)
              for (let w2 = 0; w2 < 7; w2 += 1) state.blk[x2][y2][z2][w2] |= 256;
          }
        }
      }
    } else if (code === 126) {
      state.blk[x][y][z][w] = 256;
      for (let x2 = 0; x2 < 7; x2 += 1) {
        for (let y2 = y - 1; y2 <= y + 1; y2 += 1) {
          if (y2 >= 0 && y2 < 7) {
            for (let z2 = 0; z2 < 26; z2 += 1)
              for (let w2 = 0; w2 < 7; w2 += 1) state.blk[x2][y2][z2][w2] |= 256;
          }
        }
      }
    } else if (code === 106) {
      state.blk[x][y][z][w] = 256;
      for (let w2 = w - 1; w2 <= w + 1; w2 += 1) {
        if (w2 >= 0 && w2 < 7) {
          for (let x2 = 0; x2 < 7; x2 += 1) {
            for (let y2 = 0; y2 < 7; y2 += 1) {
              for (let z2 = 0; z2 < 26; z2 += 1) state.blk[x2][y2][z2][w2] |= 256;
            }
          }
        }
      }
    } else if (code === 127) {
      state.blk[x][y][z][w] |= 256;
      for (let x2 = 0; x2 < 7; x2 += 1) {
        for (let y2 = 0; y2 < 7; y2 += 1) {
          for (let z2 = 0; z2 < 26; z2 += 1) {
            for (let w2 = 0; w2 < 7; w2 += 1) {
            if ((state.blk[x2][y2][z2][w2] & 255) !== 0 && randInt(10) === 0) {
              state.blk[x2][y2][z2][w2] = (state.blk[x2][y2][z2][w2] & 256) + 120;
            }
            }
          }
        }
      }
    } else {
      state.blk[x][y][z][w] |= 256;
    }
  }
  return { filled };
}

function removeline() {
  if (state.spinlock > 0) state.spinlock -= 1;
  if (state.hideblock > 0) state.hideblock -= 1;
  if (state.hidenext > 0) state.hidenext -= 1;
  if (state.speedup > 0) state.speedup -= 1;
  if (state.speeddown > 0) state.speeddown -= 1;
  if (state.holdlock > 0) state.holdlock -= 1;
  if (state.simplify2 > 0) state.simplify2 -= 1;
  if (state.pentaForce > 0) state.pentaForce -= 1;

  let filledline = 0;
  const cells = { tline: 0 };

  // XY planes at given (z, w): check all x,y filled
  for (let w = 0; w < 7; w += 1) {
    for (let x = 0; x < 7; x += 1) {
      for (let z = 0; z < 26; z += 1) {
        const coords = Array.from({ length: 7 }, (_, y) => [x, y, w]);
        const result = processLine(cells, z, coords);
        if (typeof result === "object" && result.hardReset) return 0;
        filledline += result.filled || 0;
      }
    }
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 26; z += 1) {
        const coords = Array.from({ length: 7 }, (_, x) => [x, y, w]);
        const result = processLine(cells, z, coords);
        if (typeof result === "object" && result.hardReset) return 0;
        filledline += result.filled || 0;
      }
    }
  }

  // XW planes at given (y, z): check all x,w filled
  for (let y = 0; y < 7; y += 1) {
    for (let z = 0; z < 26; z += 1) {
      const coords = [];
      for (let x = 0; x < 7; x += 1)
        for (let w = 0; w < 7; w += 1)
          coords.push([x, y, w]);
      const result = processLine(cells, z, coords);
      if (typeof result === "object" && result.hardReset) return 0;
      filledline += result.filled || 0;
    }
  }

  // YW planes at given (x, z): check all y,w filled
  for (let x = 0; x < 7; x += 1) {
    for (let z = 0; z < 26; z += 1) {
      const coords = [];
      for (let y = 0; y < 7; y += 1)
        for (let w = 0; w < 7; w += 1)
          coords.push([x, y, w]);
      const result = processLine(cells, z, coords);
      if (typeof result === "object" && result.hardReset) return 0;
      filledline += result.filled || 0;
    }
  }

  if (cells.tline < 0) {
    for (let z = 0; z < -cells.tline; z += 1) {
      for (let x = 0; x < 7; x += 1) {
        for (let y = 0; y < 7; y += 1)
          for (let w = 0; w < 7; w += 1) state.blk[x][y][z][w] = 256;
      }
    }
    cells.tline = 0;
  }

  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let w = 0; w < 7; w += 1) {
      let t = 0;
      for (let z = 0; z < 26; z += 1) {
        if (state.blk[x][y][z][w] < 256) {
          state.blk[x][y][t][w] = state.blk[x][y][z][w];
          t += 1;
        }
      }
      for (; t < 26; t += 1) state.blk[x][y][t][w] = 0;
      }
    }
  }

  if (cells.tline > 0) {
    for (let x = 0; x < 7; x += 1) {
      for (let y = 0; y < 7; y += 1) {
        for (let w = 0; w < 7; w += 1) {
        for (let z = 25 - cells.tline; z > -1; z -= 1) {
          state.blk[x][y][z + cells.tline][w] = state.blk[x][y][z][w];
        }
        for (let t = 0; t < cells.tline; t += 1) {
          state.blk[x][y][t][w] = randInt(2) !== 0 ? 103 : 0;
          if (x % 7 === (y + t) % 7) state.blk[x][y][t][w] = 0;
        }
        }
      }
    }
  }

  // Compacting: remove gaps in each (x,y,w) column along z-axis
  if (state.compactPending) {
    state.compactPending = false;
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) {
        for (let w = 0; w < 7; w++) {
          let t = 0;
          for (let z = 0; z < 26; z++) {
            if (state.blk[x][y][z][w] !== 0) {
              state.blk[x][y][t][w] = state.blk[x][y][z][w];
              t++;
            }
          }
          for (; t < 26; t++) state.blk[x][y][t][w] = 0;
        }
      }
    }
    // Count filled planes after compacting (XY, XW, YW at each z)
    let compactLines = 0;
    for (let z = 0; z < 26; z++) {
      // XY planes
      for (let w = 0; w < 7; w++) {
        let full = true;
        for (let x = 0; x < 7 && full; x++)
          for (let y = 0; y < 7 && full; y++)
            if (state.blk[x][y][z][w] === 0) full = false;
        if (full) { for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) state.blk[x][y][z][w] = 0; compactLines++; }
      }
      // XW planes
      for (let y = 0; y < 7; y++) {
        let full = true;
        for (let x = 0; x < 7 && full; x++)
          for (let w = 0; w < 7 && full; w++)
            if (state.blk[x][y][z][w] === 0) full = false;
        if (full) { for (let x = 0; x < 7; x++) for (let w = 0; w < 7; w++) state.blk[x][y][z][w] = 0; compactLines++; }
      }
      // YW planes
      for (let x = 0; x < 7; x++) {
        let full = true;
        for (let y = 0; y < 7 && full; y++)
          for (let w = 0; w < 7 && full; w++)
            if (state.blk[x][y][z][w] === 0) full = false;
        if (full) { for (let y = 0; y < 7; y++) for (let w = 0; w < 7; w++) state.blk[x][y][z][w] = 0; compactLines++; }
      }
    }
    if (compactLines > 0) {
      // Re-compact
      for (let x = 0; x < 7; x++)
        for (let y = 0; y < 7; y++)
          for (let w = 0; w < 7; w++) {
            let t = 0;
            for (let z = 0; z < 26; z++) {
              if (state.blk[x][y][z][w] !== 0) { state.blk[x][y][t][w] = state.blk[x][y][z][w]; t++; }
            }
            for (; t < 26; t++) state.blk[x][y][t][w] = 0;
          }
      state.lines += compactLines;
      state.score += 20 * compactLines;
      state.level = Math.floor((state.score + 600) / 800) + 1;
      if (state.level > 16) state.level = 16;
      filledline += compactLines;
    }
  }

  if (filledline !== 0) filledline += removeline();
  return filledline;
}

function stickblock() {
  state.asc = 0;
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        if (!state.nowblock[x][y][z][w]) continue;
        const bx = x + state.blockpos[0];
        const by = y + state.blockpos[1];
        const bz = z + state.blockpos[2];
        const bw = w + state.blockpos[3];
        if (bz + 1 < 26 && state.blk[bx][by][bz + 1][bw] !== 0) {
          let it = 0;
          let jt = 0;
          if (bz === 0 || state.blk[bx][by][bz - 1][bw] !== 0) it += 1;
          if (by === 6 || state.blk[bx][by + 1][bz][bw] !== 0) it += 1;
          if (y !== 6 && state.nowblock[x][y + 1][z][w] !== 0) jt += 1;
          if (by === 0 || state.blk[bx][by - 1][bz][bw] !== 0) it += 1;
          if (y !== 0 && state.nowblock[x][y - 1][z][w] !== 0) jt += 1;
          if (bx === 6 || state.blk[bx + 1][by][bz][bw] !== 0) it += 1;
          if (x !== 6 && state.nowblock[x + 1][y][z][w] !== 0) jt += 1;
          if (bx === 0 || state.blk[bx - 1][by][bz][bw] !== 0) it += 1;
          if (x !== 0 && state.nowblock[x - 1][y][z][w] !== 0) jt += 1;
          if (bw === 6 || state.blk[bx][by][bz][bw + 1] !== 0) it += 1;
          if (w !== 6 && state.nowblock[x][y][z][w + 1] !== 0) jt += 1;
          if (bw === 0 || state.blk[bx][by][bz][bw - 1] !== 0) it += 1;
          if (w !== 0 && state.nowblock[x][y][z][w - 1] !== 0) jt += 1;
          if (jt < 3 && it + jt > 3) state.asc += 1;
        }
        }
      }
    }
  }
  if (state.asc !== 0) state.asc -= 1;
  if (state.asc !== 0) {
    state.gt = 50 * Math.pow(4, state.asc);
    state.score += state.gt;
    state.ht = now();
  }
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        if (state.nowblock[x][y][z][w] === 0) continue;
        if (z + state.blockpos[2] > 8) return 1;
        state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]][w + state.blockpos[3]] = state.nowblock[x][y][z][w];
        }
      }
    }
  }
  return setnextblock();
}

function calculatescore(line) {
  state.lines += line;
  if (state.score2x > 2) state.score2x = 2;
  state.score += Math.floor(20 * line * Math.sqrt(line) * Math.pow(4, state.score2x)) * Math.pow(4, state.asc);
  if (state.score > 999999999) state.score = 999999999;
  state.score2x = 0;
  state.level = Math.floor((state.score + 600) / 800) + 1;
  if (state.level > 16) state.level = 16;
}

function gover() {
  state.oscore = state.score;
  try {
    const raw = localStorage.getItem('polytesseract_highscore');
    if (raw) {
      const data = JSON.parse(raw);
      const v = data.s * 51231 % 134 + data.s * 12241 % 142 + data.s * 1411 % 131 + data.s * 215 % 13 + data.s * 2;
      if (v === data.c) {
        if (data.s < state.score) {
          const ns = state.score;
          localStorage.setItem('polytesseract_highscore', JSON.stringify({ s: ns, c: ns * 51231 % 134 + ns * 12241 % 142 + ns * 1411 % 131 + ns * 215 % 13 + ns * 2 }));
        }
      } else {
        const ns = state.score;
        localStorage.setItem('polytesseract_highscore', JSON.stringify({ s: ns, c: ns * 51231 % 134 + ns * 12241 % 142 + ns * 1411 % 131 + ns * 215 % 13 + ns * 2 }));
      }
    } else {
      const ns = state.score;
      localStorage.setItem('polytesseract_highscore', JSON.stringify({ s: ns, c: ns * 51231 % 134 + ns * 12241 % 142 + ns * 1411 % 131 + ns * 215 % 13 + ns * 2 }));
    }
  } catch (_) {}
  state.goverflg = 1;
}

function loadHighScore() {
  try {
    const raw = localStorage.getItem('polytesseract_highscore');
    if (raw) {
      const data = JSON.parse(raw);
      const v = data.s * 51231 % 134 + data.s * 12241 % 142 + data.s * 1411 % 131 + data.s * 215 % 13 + data.s * 2;
      if (v === data.c) state.oh = data.s;
    }
  } catch (_) {}
}

function tryHoldSwap() {
  if (state.holdlock !== 0) return;
  if (state.hidenext !== 0) return;
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        if (state.holdblock[x][y][z][w] !== 0) {
          if (x + state.blockpos[0] < 0 || x + state.blockpos[0] > 6) return;
          if (y + state.blockpos[1] < 0 || y + state.blockpos[1] > 6) return;
          if (z + state.blockpos[2] < 0) return;
          if (w + state.blockpos[3] < 0 || w + state.blockpos[3] > 6) return;
          if (state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]][w + state.blockpos[3]] !== 0) return;
        }
        }
      }
    }
  }
  [state.holdblock, state.nowblock] = [state.nowblock, state.holdblock];
  [state.holdhb, state.nowhb] = [state.nowhb, state.holdhb];
  [state.holdib, state.nowib] = [state.nowib, state.holdib];
  rotate2();
}

function clickbutton(x, y) {
  x /= 0.96;
  y /= 0.96;
  if (state.goverflg === 1 && -0.25 < x && x < 0.25 && -0.31 > y && y > -0.46) {
    state.goverflg = 0;
    return 0;
  }
  if (state.goverflg === 1 && -0.25 < x && x < 0.25 && -0.51 > y && y > -0.66) {
    state.goverflg = 0;
    state.startscreen = 1;
    state.about = 0;
    return 0;
  }
  if (state.startscreen === 1 && state.about === 0 && -0.25 < x && x < 0.25 && -0.31 > y && y > -0.46) {
    state.startscreen = 0;
    return 0;
  }
  if (state.startscreen === 1 && -0.25 < x && x < 0.25 && -0.51 > y && y > -0.66) {
    state.about = (state.about + 1) % 5;
    return 0;
  }
  if (state.startscreen === 1 && state.about !== 0) {
    state.about = (state.about + 1) % 5;
    return 0;
  }
  // Minimap hit test: center (0.5, -0.34)
  if ((x - 0.5) * (x - 0.5) + (y + 0.265) * (y + 0.415) < 0.03) {
    state.floorz = (state.floorz + 1) % 7;
    return 0;
  }
  // Direction pad: circular hit test centered at (0.5, -1.125), 8 sectors (45° each), 2 ignored
  //   .  U  P        layout:  NW(ignore) N(Y+) NE(W+)
  //   L  .  R                 W(X-)      .     E(X+)
  //   M  D  .                 SW(W-)     S(Y-) SE(ignore)
  if ((x - 0.5) * (x - 0.5) + (y + 1.125) * (y + 1.125) < 0.13) {
    let deg = Math.atan2(y + 1.125, x - 0.5) - state.r1o;
    while (deg < -PI) deg += 2 * PI;
    while (deg > PI) deg -= 2 * PI;
    if (!state.pause) {
      const P8 = PI / 8;
      if (deg > 3*P8 && deg <= 5*P8) { move(1, -1); }           // N: Y- (screen up = Y-)
      else if (deg > P8 && deg <= 3*P8) { move(3, 1); }         // NE: W+
      else if (deg > -P8 && deg <= P8) { move(0, 1); }          // E: X+
      // SE (deg > -3*P8 && deg <= -P8): ignored
      else if (deg > -5*P8 && deg <= -3*P8) { move(1, 1); }    // S: Y+ (screen down = Y+)
      else if (deg > -7*P8 && deg <= -5*P8) { move(3, -1); }   // SW: W-
      else if (deg > 7*P8 || deg <= -7*P8) { move(0, -1); }    // W: X-
      // NW (deg > 5*P8 && deg <= 7*P8): ignored
    }
    return 0;
  }
  // 3×4 rotation buttons — expanded touch areas, no gaps
  // col boundaries: x = -0.69, -0.49, -0.29, -0.09
  // row boundaries: y = -1.50, -1.30, -1.10, -0.88, -0.66
  const rc0=-0.69, rc1=-0.49, rc2=-0.29, rc3=-0.09;
  const rr0=-1.50, rr1=-1.30, rr2=-1.10, rr3=-0.88, rr4=-0.66;
  if (rc0 < x && x < rc1 && rr0 < y && y < rr1) { rotate(0, -1); return 0; }  // XY CW
  if (rc1 < x && x < rc2 && rr0 < y && y < rr1) { rotate(1, -1); return 0; }  // YZ CW
  if (rc2 < x && x < rc3 && rr0 < y && y < rr1) { rotate(2, -1); return 0; }  // XZ CW
  if (rc0 < x && x < rc1 && rr1 < y && y < rr2) { rotate(0,  1); return 0; }  // XY CCW
  if (rc1 < x && x < rc2 && rr1 < y && y < rr2) { rotate(1,  1); return 0; }  // YZ CCW
  if (rc2 < x && x < rc3 && rr1 < y && y < rr2) { rotate(2,  1); return 0; }  // XZ CCW
  if (rc0 < x && x < rc1 && rr2 < y && y < rr3) { rotate(3, -1); return 0; }  // XW CW
  if (rc1 < x && x < rc2 && rr2 < y && y < rr3) { rotate(4, -1); return 0; }  // YW CW
  if (rc2 < x && x < rc3 && rr2 < y && y < rr3) { rotate(5, -1); return 0; }  // ZW CW
  if (rc0 < x && x < rc1 && rr3 < y && y < rr4) { rotate(3,  1); return 0; }  // XW CCW
  if (rc1 < x && x < rc2 && rr3 < y && y < rr4) { rotate(4,  1); return 0; }  // YW CCW
  if (rc2 < x && x < rc3 && rr3 < y && y < rr4) { rotate(5,  1); return 0; }  // ZW CCW
  // Right-side buttons — expanded touch areas
  if (0.15 > x && x > -0.10 && -1.50 < y && y < -1.28) { state.vkspace2 = true; return 0; }  // drop
  if (0.15 > x && x > -0.10 && -1.28 < y && y < -0.98) { tryHoldSwap(); return 0; }          // hold
  if (0.65 > x && x > 0.25 && 1.40 > y && y > 1.00) { state.pause = !state.pause; return 0; } // pause
  if (0.15 > x && x > -0.10 && -0.81 > y && y > -1.00) { state.depthColor = !state.depthColor; return 0; } // W color
  if (0.15 > x && x > -0.10 && -0.58 > y && y > -0.82) { state.rotMode4D = !state.rotMode4D; return 0; }   // XYZ/XYW
  if (-0.60 > y) return 0;
  return 1;
}

function handleTouches() {
  const t0 = touchs[0];
  const t1 = touchs[1];
  // Process pending up (flag=3) before multi-touch check, to enable double-tap detection
  if (t0.flag !== 0 && t1.flag !== 0) {
    // If one slot is up(3) and the other is down(1), process up first as double-tap candidate
    if ((t0.flag === 3 && t1.flag === 1) || (t0.flag === 1 && t1.flag === 3)) {
      const upSlot = t0.flag === 3 ? t0 : t1;
      const downSlot = t0.flag === 3 ? t1 : t0;
      // Record up for double-tap detection
      state.doubleTapState.lastUpTime = now();
      state.doubleTapState.lastUpX = upSlot.x;
      state.doubleTapState.lastUpY = upSlot.y;
      upSlot.flag = 0;
      // Now check if the down is a double-tap
      const dts = state.doubleTapState;
      const timeSinceUp = now() - dts.lastUpTime;
      const distFromUp = Math.hypot(downSlot.x - dts.lastUpX, downSlot.y - dts.lastUpY);
      if (timeSinceUp < 400 && distFromUp < 0.2 && downSlot.y > -0.65) {
        // tts2 removed (rotation mode via button)
      }
      // Copy down slot to t0 if needed
      if (downSlot !== t0) {
        t0.flag = downSlot.flag; t0.x = downSlot.x; t0.y = downSlot.y;
        t0.oldx = downSlot.oldx; t0.oldy = downSlot.oldy;
        t0.setx = downSlot.setx; t0.sety = downSlot.sety;
        downSlot.flag = 0;
      }
      // Fall through to single-touch flag===1 handler below
    } else {
      // Only process as genuine multi-touch if 2+ pointers are actually active
      if (state.touchIds.size >= 2) {
        if (t0.y > -0.6 && t1.y > -0.6 && t0.flag === 2 && t1.flag === 2) {
          const dist = Math.hypot(t0.x - t1.x, t0.y - t1.y);
          const odist = Math.hypot(t0.oldx - t1.oldx, t0.oldy - t1.oldy);
          zoom(1000 * (dist - odist), (t0.y + t1.y) / 2);
        }
        t0.flag = t0.flag === 1 ? 2 : t0.flag === 3 ? 0 : t0.flag;
        t1.flag = t1.flag === 1 ? 2 : t1.flag === 3 ? 0 : t1.flag;
        return;
      }
      // Stale flags with only 1 active pointer — clear orphan slot
      if (!state.touchIds.has(findPointerForSlot(0))) t0.flag = 0;
      if (!state.touchIds.has(findPointerForSlot(1))) t1.flag = 0;
      if (t0.flag === 0 && t1.flag !== 0) {
        t0.flag = t1.flag; t0.x = t1.x; t0.y = t1.y;
        t0.oldx = t1.oldx; t0.oldy = t1.oldy;
        t0.setx = t1.setx; t0.sety = t1.sety;
        t1.flag = 0;
      }
      // Fall through to single-touch handling
    }
  }
  if (t0.flag === 1) {
    state.otp = now();
    state.ft = 1;
    // Check for double-tap-drag: if within 300ms and close to last pointerup position
    const dts = state.doubleTapState;
    const timeSinceUp = now() - dts.lastUpTime;
    const distFromUp = Math.hypot(t0.x - dts.lastUpX, t0.y - dts.lastUpY);
    if (timeSinceUp < 300 && distFromUp < 0.15 && t0.y > -0.65) {
      // tts2 removed
    } else {
      // tts2 removed
    }
    if (clickbutton(t0.x, t0.y)) {
      if (t0.y > -0.65) {
        state.ci = 0;
        state.tts = true;
        state.bi = now();
      }
      t0.flag = 2;
      state.ul = 3;
    } else {
      state.tts = false;
      t0.flag = 2;
      state.ul = -1;
    }
  } else if (t0.flag === 3) {
    // Pointer up: record for double-tap detection, no clickbutton (already called on flag=1)
    state.doubleTapState.lastUpTime = now();
    state.doubleTapState.lastUpX = t0.x;
    state.doubleTapState.lastUpY = t0.y;
    if (state.tts) {
      state.tts = false;
      state.ci = now() - state.bi;
    } else {
      state.vkspace2 = false;
      state.ci = 0;
    }
    t0.flag = 0;
  } else if (t0.flag === 2) {
    if (state.otp + 80 < now()) {
      state.otp = now();
      if (state.ul === 0) { if (!clickbutton(t0.x, t0.y)) state.ul = -1; }
      else if (state.ul > 0) state.ul -= 1;
    }
    if (state.ft > 0) state.ft += 1;
    if (state.ft === 6) state.ft = 0;
    if (state.tts) state.upd = true;
    if (state.tts) state.upd = true; // tts handles drag rotation
  }
}

function updateFallingLogic() {
  if (state.timestamp + 6000 / (state.level / 3 + 5) < now() || state.vkspace2 || state.vkspace) {
    if (move(2, -1)) {
      if (stickblock()) {
        gover();
        initBlockState();
        return;
      }
      calculatescore(removeline());
    }
    state.timestamp = now();
  }
  if (now() - state.ht > 500) state.gt = 0;
  const t0 = touchs[0];
  if (state.upd) {
    if (!state.ft) {
      if (state.rotMode4D) {
        // XYW mode: rotate XW/YW camera angles
        if (Math.abs(t0.x - t0.oldx) < 0.2) state.wAngleXW += (t0.x - t0.oldx) * 100;
        if (Math.abs(t0.y - t0.oldy) < 0.2) state.wAngleYW -= (t0.y - t0.oldy) * 100;
      } else {
        // XYZ mode: rotate standard camera angles
        if (Math.abs(t0.x - t0.oldx) < 0.2) state.wAngleY += (t0.x - t0.oldx) * 100;
        if (Math.abs(t0.y - t0.oldy) < 0.2) state.wAngleX -= (t0.y - t0.oldy) * 100;
      }
    }
    state.upd = false;
  }
  if (state.ci > 300) {
    if (!state.ft) {
      if (state.rotMode4D) {
        if (Math.abs(t0.x - t0.oldx) < 0.2) state.wAngleXW += (t0.x - t0.oldx) * 100;
        if (Math.abs(t0.y - t0.oldy) < 0.2) state.wAngleYW -= (t0.y - t0.oldy) * 100;
      } else {
        if (Math.abs(t0.x - t0.oldx) < 0.2) state.wAngleY += (t0.x - t0.oldx) * 100;
        if (Math.abs(t0.y - t0.oldy) < 0.2) state.wAngleX -= (t0.y - t0.oldy) * 100;
      }
    }
  }
}

function lineStrip(points, color = [1, 1, 1, 1]) {
  renderer.color4f(...color);
  renderer.begin(GL.LINE_STRIP);
  for (const p of points) renderer.vertex3f(p[0], p[1], p[2] || 0);
  renderer.end();
}

const _defaultWhite = [1, 1, 1, 1];
function lines(points, color) {
  if (!color) color = _defaultWhite;
  renderer.color4f(color[0], color[1], color[2], color[3]);
  renderer.begin(GL.LINES);
  for (const p of points) renderer.vertex3f(p[0], p[1], p[2] || 0);
  renderer.end();
}

function pointsDraw(pointsList, color) {
  if (!color) color = _defaultWhite;
  renderer.color4f(color[0], color[1], color[2], color[3]);
  renderer.begin(GL.POINTS);
  for (const p of pointsList) renderer.vertex3f(p[0], p[1], p[2] || 0);
  renderer.end();
}

function drawPolylines(polylines, color = [1, 1, 1, 1]) {
  for (const points of polylines) {
    lineStrip(points, color);
  }
}

function drawLinesList(pairs, color = [1, 1, 1, 1]) {
  for (const pair of pairs) {
    lines(pair, color);
  }
}

function drawDigitAt(x, y, scale, digit, color = [1, 1, 1, 1]) {
  const s = scale;
  const p = (px, py) => [x + px * s, y + py * s, 0];
  switch (digit) {
    case "0":
      lineStrip([p(1, 0), p(0, 0), p(0, -2), p(1, -2), p(1, 0)], color);
      break;
    case "1":
      lineStrip([p(0.5, 0), p(0.5, -2)], color);
      break;
    case "2":
      lineStrip([p(0, 0), p(1, 0), p(1, -1), p(0, -1), p(0, -2), p(1, -2)], color);
      break;
    case "3":
      lineStrip([p(0, 0), p(1, 0), p(1, -1), p(0, -1), p(1, -1), p(1, -2), p(0, -2)], color);
      break;
    case "4":
      lineStrip([p(0, 0), p(0, -1), p(1, -1), p(1, 0), p(1, -2)], color);
      break;
    case "5":
      lineStrip([p(1, 0), p(0, 0), p(0, -1), p(1, -1), p(1, -2), p(0, -2)], color);
      break;
    case "6":
      lineStrip([p(1, 0), p(0, 0), p(0, -2), p(1, -2), p(1, -1), p(0, -1)], color);
      break;
    case "7":
      lineStrip([p(0, -1), p(0, 0), p(1, 0), p(1, -2)], color);
      break;
    case "8":
      lineStrip([p(0, 0), p(0, -2), p(1, -2), p(1, 0), p(0, 0), p(0, -1), p(1, -1)], color);
      break;
    case "9":
      lineStrip([p(1, -1), p(0, -1), p(0, 0), p(1, 0), p(1, -2), p(0, -2)], color);
      break;
    default:
      break;
  }
}

function drawDigitString(originX, originY, scale, text, count, color = [1, 1, 1, 1]) {
  const str = String(text);
  // C++ ilog alignment: ilog(x) = 9 - floor(log10(x)), offset = floor(ilog/2)
  const num = parseInt(str, 10) || 0;
  const ilog = count - Math.floor(Math.log10(num > 0 ? num : 1));
  const offset = Math.floor(ilog / 2);
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (/\d/.test(ch)) {
      drawDigitAt(originX + (12 + 2 * (i + offset)) * scale, originY, scale, ch, color);
    } else if (ch === "+") {
      // Draw + sign
      const px = originX + (12.5 + 2 * (i + offset)) * scale;
      const py = originY - scale;
      lines([[px - scale * 0.5, py, 0], [px + scale * 0.5, py, 0], [px, py - scale * 0.5, 0], [px, py + scale * 0.5, 0]], color);
    }
  }
}

function drawLetterAt(x, y, scale, letter, color = [1, 1, 1, 1]) {
  const s = scale;
  const p = (px, py) => [x + px * s, y + py * s, 0];
  switch (letter) {
    case "a":
      lineStrip([p(0, -1), p(0.5, 1), p(1, -1)], color);
      lines([p(0.25, 0), p(0.75, 0)], color);
      break;
    case "b":
      lineStrip([p(0, 1), p(0, -1), p(0.7, -1), p(1, -0.5), p(0.7, 0), p(1, 0.5), p(0.7, 1), p(0, 1)], color);
      lines([p(0, 0), p(0.7, 0)], color);
      break;
    case "c":
      lineStrip([p(1, 1), p(0, 1), p(0, -1), p(1, -1)], color);
      break;
    case "e":
      lineStrip([p(1, 1), p(0, 1), p(0, -1), p(1, -1)], color);
      lines([p(0, 0), p(1, 0)], color);
      break;
    case "g":
      lineStrip([p(1, 1), p(0, 1), p(0, -1), p(1, -1), p(1, 0), p(0.5, 0)], color);
      break;
    case "i":
      lines([p(0, 1), p(1, 1)], color);
      lines([p(0.5, 1), p(0.5, -1)], color);
      lines([p(0, -1), p(1, -1)], color);
      break;
    case "l":
      lineStrip([p(0, 1), p(0, -1), p(1, -1)], color);
      break;
    case "m":
      lineStrip([p(0, -1), p(0, 1), p(0.5, -1), p(1, 1), p(1, -1)], color);
      break;
    case "n":
      lineStrip([p(0, -1), p(0, 1), p(1, -1), p(1, 1)], color);
      break;
    case "o":
      lineStrip([p(1, 1), p(0, 1), p(0, -1), p(1, -1), p(1, 1)], color);
      break;
    case "p":
      lineStrip([p(0, -1), p(0, 1), p(1, 1), p(1, 0), p(0, 0)], color);
      break;
    case "r":
      lineStrip([p(0, -1), p(0, 1), p(1, 1), p(1, 0), p(0, 0), p(1, -1)], color);
      break;
    case "s":
      lineStrip([p(1, 1), p(0, 1), p(0, 0), p(1, 0), p(1, -1), p(0, -1)], color);
      break;
    case "t":
      lines([p(0, 1), p(1, 1)], color);
      lines([p(0.5, 1), p(0.5, -1)], color);
      break;
    case "u":
      lineStrip([p(0, 1), p(0, -1), p(1, -1), p(1, 1)], color);
      break;
    case "v":
      lineStrip([p(0, 1), p(0.5, -1), p(1, 1)], color);
      break;
    case "y":
      lineStrip([p(0, 1), p(0.5, 0.4), p(1, 1)], color);
      lines([p(0.5, 0.4), p(0.5, -1)], color);
      break;
    case "d":
      lineStrip([p(0, 1), p(0, -1), p(0.7, -1), p(1, -0.5), p(1, 0.5), p(0.7, 1), p(0, 1)], color);
      break;
    case "4":
      lineStrip([p(0, 1), p(0, 0), p(1, 0)], color);
      lines([p(0.7, 1), p(0.7, -1)], color);
      break;
    case "w":
      lineStrip([p(0, 1), p(0.25, -1), p(0.5, 0.3), p(0.75, -1), p(1, 1)], color);
      break;
    case "x":
      lines([p(0, 1), p(1, -1), p(0, -1), p(1, 1)], color);
      break;
    case "z":
      lineStrip([p(0, 1), p(1, 1), p(0, -1), p(1, -1)], color);
      break;
    case "f":
      lineStrip([p(1, 1), p(0, 1), p(0, -1)], color);
      lines([p(0, 0), p(0.7, 0)], color);
      break;
    case "h":
      lines([p(0, 1), p(0, -1), p(0, 0), p(1, 0), p(1, 1), p(1, -1)], color);
      break;
    case "j":
      lineStrip([p(1, 1), p(1, -0.5), p(0.5, -1), p(0, -0.5)], color);
      break;
    case "k":
      lines([p(0, 1), p(0, -1), p(0, 0), p(1, 1), p(0, 0), p(1, -1)], color);
      break;
    case "q":
      lineStrip([p(1, 1), p(0, 1), p(0, -1), p(1, -1), p(1, 1)], color);
      lines([p(0.5, -0.3), p(1, -1)], color);
      break;
    default:
      break;
  }
}

function drawWord(originX, originY, scale, text, color = [1, 1, 1, 1], spacing = 2) {
  let x = originX;
  for (const ch of text) {
    if (ch === " ") {
      x += spacing * scale;
      continue;
    }
    drawLetterAt(x, originY, scale, ch.toLowerCase(), color);
    x += spacing * scale;
  }
}

function drawGraphOverlay() {
  const c = [1, 1, 1, 1];
  renderer.pushMatrix();
  renderer.translatef(-0.1, 0.4, 0);
  drawPolylines([
    [[17 * 0.03, -2 * 0.03, 0], [16 * 0.03, -2 * 0.03, 0], [16 * 0.03, -3 * 0.03, 0], [17 * 0.03, -3 * 0.03, 0], [17 * 0.03, -4 * 0.03, 0], [16 * 0.03, -4 * 0.03, 0]],
    [[19 * 0.03, -2 * 0.03, 0], [18 * 0.03, -2 * 0.03, 0], [18 * 0.03, -4 * 0.03, 0], [19 * 0.03, -4 * 0.03, 0]],
    [[21 * 0.03, -2 * 0.03, 0], [20 * 0.03, -2 * 0.03, 0], [20 * 0.03, -4 * 0.03, 0], [21 * 0.03, -4 * 0.03, 0], [21 * 0.03, -2 * 0.03, 0]],
    [[22 * 0.03, -4 * 0.03, 0], [22 * 0.03, -2 * 0.03, 0], [23 * 0.03, -2 * 0.03, 0], [23 * 0.03, -3 * 0.03, 0], [22 * 0.03, -3 * 0.03, 0], [22.5 * 0.03, -3 * 0.03, 0], [23 * 0.03, -4 * 0.03, 0]],
    [[25 * 0.03, -2 * 0.03, 0], [24 * 0.03, -2 * 0.03, 0], [24 * 0.03, -3 * 0.03, 0], [25 * 0.03, -3 * 0.03, 0], [24 * 0.03, -3 * 0.03, 0], [24 * 0.03, -4 * 0.03, 0], [25 * 0.03, -4 * 0.03, 0]],
    [[16 * 0.03, 5 * 0.03, 0], [16 * 0.03, 3 * 0.03, 0], [17 * 0.03, 3 * 0.03, 0]],
    [[20 * 0.03, 3 * 0.03, 0], [20 * 0.03, 5 * 0.03, 0], [21 * 0.03, 3 * 0.03, 0], [21 * 0.03, 5 * 0.03, 0]],
    [[23 * 0.03, 3 * 0.03, 0], [22 * 0.03, 3 * 0.03, 0], [22 * 0.03, 5 * 0.03, 0], [23 * 0.03, 5 * 0.03, 0]],
    [[25 * 0.03, 5 * 0.03, 0], [24 * 0.03, 5 * 0.03, 0], [24 * 0.03, 4 * 0.03, 0], [25 * 0.03, 4 * 0.03, 0], [25 * 0.03, 3 * 0.03, 0], [24 * 0.03, 3 * 0.03, 0]],
  ], c);
  drawLinesList([
    [[18 * 0.03, 5 * 0.03, 0], [19 * 0.03, 5 * 0.03, 0]],
    [[18.5 * 0.03, 5 * 0.03, 0], [18.5 * 0.03, 3 * 0.03, 0]],
    [[18 * 0.03, 3 * 0.03, 0], [19 * 0.03, 3 * 0.03, 0]],
    [[22 * 0.03, 4 * 0.03, 0], [23 * 0.03, 4 * 0.03, 0]],
  ], c);
  pointsDraw([[26 * 0.03, -2.5 * 0.03, 0], [26 * 0.03, -3.5 * 0.03, 0], [26 * 0.03, 5 * 0.03, 0], [26 * 0.03, 3 * 0.03, 0]], c);
  drawDigitString(2 * 0.03, 2 * 0.03, 0.03, String(state.lines % 10000000), 7, [0, 1, 1, 1]);
  if (state.hidenext === 0) {
    drawPolylines([
      [[16 * 0.03, 24 * 0.03, 0], [16 * 0.03, 26 * 0.03, 0], [17 * 0.03, 24 * 0.03, 0], [17 * 0.03, 26 * 0.03, 0]],
      [[19 * 0.03, 24 * 0.03, 0], [18 * 0.03, 24 * 0.03, 0], [18 * 0.03, 26 * 0.03, 0], [19 * 0.03, 26 * 0.03, 0]],
    ], c);
    drawLinesList([
      [[19 * 0.03, 25 * 0.03, 0], [18 * 0.03, 25 * 0.03, 0]],
      [[21 * 0.03, 26 * 0.03, 0], [20 * 0.03, 24 * 0.03, 0]],
      [[21 * 0.03, 24 * 0.03, 0], [20 * 0.03, 26 * 0.03, 0]],
      [[22 * 0.03, 26 * 0.03, 0], [23 * 0.03, 26 * 0.03, 0]],
      [[22.5 * 0.03, 24 * 0.03, 0], [22.5 * 0.03, 26 * 0.03, 0]],
    ], c);
    pointsDraw([[24 * 0.03, 25.5 * 0.03, 0], [24 * 0.03, 24.5 * 0.03, 0]], c);
  }
  if (state.gt) {
    drawDigitString(0, -5 * 0.03, 0.03, "+" + String(Math.floor(state.gt) % 1000000000), 9, [0, 1, 1, 1]);
  } else {
    drawDigitString(0, -5 * 0.03, 0.03, String(state.score % 1000000000), 9, [0, 1, 1, 1]);
  }
  // Level label "lv" and digits (inline, no gap, below score)
  drawPolylines([
    [[16*0.03, -8*0.03, 0], [16*0.03, -10*0.03, 0], [17*0.03, -10*0.03, 0]],
    [[18*0.03, -8*0.03, 0], [18.5*0.03, -10*0.03, 0], [19*0.03, -8*0.03, 0]],
  ], c);
  drawDigitString(8 * 0.03, -8 * 0.03, 0.03, String(state.level), 2, [0, 1, 1, 1]);
  // Highscore label "highscore:" and digits (C++ graph() lines 4254-4445)
  drawPolylines([
    [[12*0.03,11*0.03,0],[13*0.03,11*0.03,0]],
  ], c);
  drawLinesList([
    [[12*0.03,10*0.03,0],[12*0.03,12*0.03,0]],
    [[13*0.03,10*0.03,0],[13*0.03,12*0.03,0]],
    [[14*0.03,10*0.03,0],[15*0.03,10*0.03,0]],
    [[14*0.03,12*0.03,0],[15*0.03,12*0.03,0]],
    [[14.5*0.03,10*0.03,0],[14.5*0.03,12*0.03,0]],
  ], c);
  drawPolylines([
    [[17*0.03,12*0.03,0],[16*0.03,12*0.03,0],[16*0.03,10*0.03,0],[17*0.03,10*0.03,0],[17*0.03,11*0.03,0],[16.5*0.03,11*0.03,0]],
    [[18*0.03,11*0.03,0],[19*0.03,11*0.03,0]],
  ], c);
  drawLinesList([
    [[18*0.03,10*0.03,0],[18*0.03,12*0.03,0]],
    [[19*0.03,10*0.03,0],[19*0.03,12*0.03,0]],
  ], c);
  drawPolylines([
    [[21*0.03,12*0.03,0],[20*0.03,12*0.03,0],[20*0.03,11*0.03,0],[21*0.03,11*0.03,0],[21*0.03,10*0.03,0],[20*0.03,10*0.03,0]],
    [[23*0.03,12*0.03,0],[22*0.03,12*0.03,0],[22*0.03,10*0.03,0],[23*0.03,10*0.03,0]],
    [[25*0.03,12*0.03,0],[24*0.03,12*0.03,0],[24*0.03,10*0.03,0],[25*0.03,10*0.03,0],[25*0.03,12*0.03,0]],
    [[26*0.03,10*0.03,0],[26*0.03,12*0.03,0],[27*0.03,12*0.03,0],[27*0.03,11*0.03,0],[26*0.03,11*0.03,0],[26.5*0.03,11*0.03,0],[27*0.03,10*0.03,0]],
    [[29*0.03,12*0.03,0],[28*0.03,12*0.03,0],[28*0.03,11*0.03,0],[29*0.03,11*0.03,0],[28*0.03,11*0.03,0],[28*0.03,10*0.03,0],[29*0.03,10*0.03,0]],
  ], c);
  pointsDraw([[30*0.03,11.5*0.03,0],[30*0.03,10.5*0.03,0]], c);
  drawDigitString(0, 9 * 0.03, 0.03, String(state.oh % 1000000000), 9, c);
  // Top-down minimap (w=3 slice)
  const minimapW = 3;
  renderer.pushMatrix();
  renderer.translatef(0.6, -0.69, 0);
  renderer.multMatrixf(buildZRotMatrix(state.r1o));
  renderer.scalef(0.8, 0.8, 0.8);
  for (let x = 0; x < 7; x++) {
    for (let y = 0; y < 7; y++) {
      for (let z = 25; z >= state.floorz; z--) {
        let value = state.blk[x][y][z][minimapW] & 255;
        const bx = x - state.blockpos[0];
        const by = y - state.blockpos[1];
        const bz = z - state.blockpos[2];
        const bw = minimapW - state.blockpos[3];
        if (bx >= 0 && bx < 7 && by >= 0 && by < 7 && bz >= 0 && bz < 7 && bw >= 0 && bw < 7 && (state.nowblock[bx][by][bz][bw] & 255) !== 0) {
          value = state.nowblock[bx][by][bz][bw] & 255;
        }
        if (value !== 0) {
          let pic = value;
          pic ^= 64;
          const R = pic >> 4;
          const G = (pic >> 2) & 3;
          const B = pic & 3;
          renderer.color3f((R + 1.2) / 4.4, (G + 1.2) / 4.4, (B + 1.2) / 4.4);
          renderer.begin(GL.TRIANGLE_FAN);
          renderer.vertex3f((x - 3.5) * 0.06, -(y - 3.5) * 0.06, 0);
          renderer.vertex3f((x - 2.5) * 0.06, -(y - 3.5) * 0.06, 0);
          renderer.vertex3f((x - 2.5) * 0.06, -(y - 2.5) * 0.06, 0);
          renderer.vertex3f((x - 3.5) * 0.06, -(y - 2.5) * 0.06, 0);
          renderer.end();
          break;
        }
      }
    }
  }
  renderer.color3f(1, 1, 1);
  for (let i = -3.5; i <= 3.5; i++) {
    renderer.begin(GL.LINES);
    renderer.vertex3f(-3.5 * 0.06, i * 0.06, 0);
    renderer.vertex3f(3.5 * 0.06, i * 0.06, 0);
    renderer.end();
  }
  for (let i = -3.5; i <= 3.5; i++) {
    renderer.begin(GL.LINES);
    renderer.vertex3f(i * 0.06, -3.5 * 0.06, 0);
    renderer.vertex3f(i * 0.06, 3.5 * 0.06, 0);
    renderer.end();
  }
  renderer.popMatrix();
  drawNextPreview();
  renderer.popMatrix();
}

function drawGameOverScorePanel() {
  const c = [0, 1, 1, 1];
  renderer.pushMatrix();
  renderer.translatef(-3, 0.5, 0);
  drawPolylines([
    [[17 * 0.1, -2 * 0.1, 0], [16 * 0.1, -2 * 0.1, 0], [16 * 0.1, -3 * 0.1, 0], [17 * 0.1, -3 * 0.1, 0], [17 * 0.1, -4 * 0.1, 0], [16 * 0.1, -4 * 0.1, 0]],
    [[19 * 0.1, -2 * 0.1, 0], [18 * 0.1, -2 * 0.1, 0], [18 * 0.1, -4 * 0.1, 0], [19 * 0.1, -4 * 0.1, 0]],
    [[21 * 0.1, -2 * 0.1, 0], [20 * 0.1, -2 * 0.1, 0], [20 * 0.1, -4 * 0.1, 0], [21 * 0.1, -4 * 0.1, 0], [21 * 0.1, -2 * 0.1, 0]],
    [[22 * 0.1, -4 * 0.1, 0], [22 * 0.1, -2 * 0.1, 0], [23 * 0.1, -2 * 0.1, 0], [23 * 0.1, -3 * 0.1, 0], [22 * 0.1, -3 * 0.1, 0], [22.5 * 0.1, -3 * 0.1, 0], [23 * 0.1, -4 * 0.1, 0]],
    [[25 * 0.1, -2 * 0.1, 0], [24 * 0.1, -2 * 0.1, 0], [24 * 0.1, -3 * 0.1, 0], [25 * 0.1, -3 * 0.1, 0], [24 * 0.1, -3 * 0.1, 0], [24 * 0.1, -4 * 0.1, 0], [25 * 0.1, -4 * 0.1, 0]],
  ], c);
  pointsDraw([[26 * 0.1, -2.5 * 0.1, 0], [26 * 0.1, -3.5 * 0.1, 0]], c);
  drawDigitString(1.5, -0.2, 0.1, String(state.oscore % 1000000000), 9, c);
  renderer.popMatrix();
}

function drawControlOverlay() {
  updateControlOrientation();
  renderer.pushMatrix();
  renderer.translatef(-0.45, -1.4, 0);
  if (state.spinlock === 0) {
    // 3×4 rotation button layout
    // Columns: XY(0), YZ(1), XZ(2) | XW(3), YW(4), ZW(5)
    // Row 0: 3D CW  (planes 0,1,2), Row 1: 3D CCW (planes 0,1,2)
    // Row 2: 4D CW  (planes 3,4,5), Row 3: 4D CCW (planes 3,4,5)
    // col0: x -0.235..−0.045, col1: x -0.035..0.155, col2: x 0.165..0.355
    // row0: y -0.095..0.095, row1: y 0.115..0.305, row2: y 0.325..0.515, row3: y 0.535..0.725
    drawPolylines([
      // Row 0: XY-CW, YZ-CW, XZ-CW (cyan)
      [[-0.235, -0.095, 1], [-0.045, -0.095, 1], [-0.045, 0.095, 1], [-0.235, 0.095, 1], [-0.235, -0.095, 1]],
      [[-0.035, -0.095, 1], [ 0.155, -0.095, 1], [ 0.155, 0.095, 1], [-0.035, 0.095, 1], [-0.035, -0.095, 1]],
      [[ 0.165, -0.095, 1], [ 0.355, -0.095, 1], [ 0.355, 0.095, 1], [ 0.165, 0.095, 1], [ 0.165, -0.095, 1]],
      // Row 1: XY-CCW, YZ-CCW, XZ-CCW (cyan)
      [[-0.235,  0.115, 1], [-0.045,  0.115, 1], [-0.045, 0.305, 1], [-0.235, 0.305, 1], [-0.235,  0.115, 1]],
      [[-0.035,  0.115, 1], [ 0.155,  0.115, 1], [ 0.155, 0.305, 1], [-0.035, 0.305, 1], [-0.035,  0.115, 1]],
      [[ 0.165,  0.115, 1], [ 0.355,  0.115, 1], [ 0.355, 0.305, 1], [ 0.165, 0.305, 1], [ 0.165,  0.115, 1]],
    ], [0, 1, 1, 1]);
    drawPolylines([
      // Row 2: XW-CW, YW-CW, ZW-CW (yellow)
      [[-0.235,  0.325, 1], [-0.045,  0.325, 1], [-0.045, 0.515, 1], [-0.235, 0.515, 1], [-0.235,  0.325, 1]],
      [[-0.035,  0.325, 1], [ 0.155,  0.325, 1], [ 0.155, 0.515, 1], [-0.035, 0.515, 1], [-0.035,  0.325, 1]],
      [[ 0.165,  0.325, 1], [ 0.355,  0.325, 1], [ 0.355, 0.515, 1], [ 0.165, 0.515, 1], [ 0.165,  0.325, 1]],
      // Row 3: XW-CCW, YW-CCW, ZW-CCW (yellow)
      [[-0.235,  0.535, 1], [-0.045,  0.535, 1], [-0.045, 0.725, 1], [-0.235, 0.725, 1], [-0.235,  0.535, 1]],
      [[-0.035,  0.535, 1], [ 0.155,  0.535, 1], [ 0.155, 0.725, 1], [-0.035, 0.725, 1], [-0.035,  0.535, 1]],
      [[ 0.165,  0.535, 1], [ 0.355,  0.535, 1], [ 0.355, 0.725, 1], [ 0.165, 0.725, 1], [ 0.165,  0.535, 1]],
    ], [1, 1, 0, 1]);
    // Draw block previews inside rotation buttons
    const rbtPositions = [
      [0, 0, -0.140,  0.000],  // Row 0 col 0: XY CW
      [1, 0,  0.060,  0.000],  // Row 0 col 1: YZ CW
      [2, 0,  0.260,  0.000],  // Row 0 col 2: XZ CW
      [0, 1, -0.140,  0.210],  // Row 1 col 0: XY CCW
      [1, 1,  0.060,  0.210],  // Row 1 col 1: YZ CCW
      [2, 1,  0.260,  0.210],  // Row 1 col 2: XZ CCW
      [3, 0, -0.140,  0.420],  // Row 2 col 0: XW CW
      [4, 0,  0.060,  0.420],  // Row 2 col 1: YW CW
      [5, 0,  0.260,  0.420],  // Row 2 col 2: ZW CW
      [3, 1, -0.140,  0.630],  // Row 3 col 0: XW CCW
      [4, 1,  0.060,  0.630],  // Row 3 col 1: YW CCW
      [5, 1,  0.260,  0.630],  // Row 3 col 2: ZW CCW
    ];
    for (const [axis, dir, tx, ty] of rbtPositions) {
      renderer.pushMatrix();
      renderer.translatef(tx, ty, 0);
      renderer.multMatrixf(buildViewRotationMatrix());
      for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 7; y++) {
          for (let z = 0; z < 7; z++) {
            for (let w = 0; w < 7; w++) {
            const value = state.rbt[axis][dir][x][y][z][w];
            if (!value) continue;
            drawBlockVisual(x, y, z + 1.5, w, value, 0.02, false);
            }
          }
        }
      }
      renderer.popMatrix();
    }
  }
  if (state.hidenext === 0) {
    drawPolylines([
      [[0.390, 0.120, 1], [0.570, 0.120, 1], [0.570, 0.300, 1], [0.390, 0.300, 1], [0.390, 0.120, 1]],
    ], [1, 0, 1, 1]);
  }
  renderer.popMatrix();
  drawHoldPreview();

  // Direction pad: 3x3 grid, 6 buttons
  //   .  U  P       U=Y+, P=W+
  //   L  .  R       L=X-, R=X+
  //   M  D  .       M=W-, D=Y-
  // Local coords: col0=-0.15 center, col1=0.00, col2=+0.15; row top=+0.15, mid=0.00, bot=-0.15
  renderer.pushMatrix();
  renderer.translatef(0.5, -1.125, 0);
  renderer.multMatrixf(buildZRotMatrix(state.r1o));
  renderer.scalef(1.3, 1.3, 1.3);
  // Draw 6 button outlines
  drawPolylines([
    // U: col1 row top
    [[-0.065, 0.085, 1], [0.065, 0.085, 1], [0.065, 0.215, 1], [-0.065, 0.215, 1], [-0.065, 0.085, 1]],
    // P: col2 row top (W+)
    [[0.085, 0.085, 1], [0.215, 0.085, 1], [0.215, 0.215, 1], [0.085, 0.215, 1], [0.085, 0.085, 1]],
    // L: col0 row mid
    [[-0.215, -0.065, 1], [-0.085, -0.065, 1], [-0.085, 0.065, 1], [-0.215, 0.065, 1], [-0.215, -0.065, 1]],
    // R: col2 row mid
    [[0.085, -0.065, 1], [0.215, -0.065, 1], [0.215, 0.065, 1], [0.085, 0.065, 1], [0.085, -0.065, 1]],
    // M: col0 row bot (W-)
    [[-0.215, -0.215, 1], [-0.085, -0.215, 1], [-0.085, -0.085, 1], [-0.215, -0.085, 1], [-0.215, -0.215, 1]],
    // D: col1 row bot
    [[-0.065, -0.215, 1], [0.065, -0.215, 1], [0.065, -0.085, 1], [-0.065, -0.085, 1], [-0.065, -0.215, 1]],
  ], [1, 1, 0, 1]);
  // Draw arrows for U/D/L/R as carets, P/M as straight arrows (W axis, not rotated with r1o)
  // U: up-caret ^ at (0.000, 0.150)
  drawPolylines([
    [[-0.02, 0.130, 1], [0.00, 0.150, 1], [0.02, 0.130, 1]],
    // D: down-caret v at (0.000, -0.150)
    [[-0.02, -0.130, 1], [0.00, -0.150, 1], [0.02, -0.130, 1]],
    // L: left-caret at (-0.150, 0.000)
    [[-0.130, -0.02, 1], [-0.150, 0.00, 1], [-0.130, 0.02, 1]],
    // R: right-caret at (0.150, 0.000)
    [[0.130, -0.02, 1], [0.150, 0.00, 1], [0.130, 0.02, 1]],
    // P: W+ up-arrow at local (0.150, 0.150)
    [[0.130, 0.130, 1], [0.150, 0.170, 1], [0.170, 0.130, 1]],
    [[0.150, 0.170, 1], [0.150, 0.130, 1]],
    // M: W- down-arrow at local (-0.150, -0.150)
    [[-0.170, -0.130, 1], [-0.150, -0.170, 1], [-0.130, -0.130, 1]],
    [[-0.150, -0.170, 1], [-0.150, -0.130, 1]],
  ], [1, 1, 0, 1]);
  renderer.popMatrix();

  // Drop button (white rectangle)
  drawPolylines([
    [[0.13, -1.30, 1], [-0.07, -1.30, 1], [-0.07, -1.50, 1], [0.13, -1.50, 1], [0.13, -1.30, 1]],
  ], [1, 1, 1, 1]);

  // Pause button
  renderer.pushMatrix();
  renderer.translatef(-0.015, -0.03, 0);
  renderer.scalef(1.2, 1.2, 1.2);
  drawPolylines([
    [[0.4, 1.20, 0], [0.415, 1.20, 0], [0.415, 1.27, 0], [0.4, 1.27, 0], [0.4, 1.20, 0]],
    [[0.43, 1.20, 0], [0.445, 1.20, 0], [0.445, 1.27, 0], [0.43, 1.27, 0], [0.43, 1.20, 0]],
    [[0.3475, 1.16, 0], [0.4975, 1.16, 0], [0.4975, 1.31, 0], [0.3475, 1.31, 0], [0.3475, 1.16, 0]],
  ], [1, 1, 1, 1]);
  renderer.popMatrix();

  // XYZ/XYW rotation mode toggle (red, y=-0.60~-0.80)
  const rmColor = state.rotMode4D ? [1, 0.3, 0.3, 1] : [0.5, 0, 0, 1];
  drawPolylines([
    [[-0.07, -0.60, 1], [0.13, -0.60, 1], [0.13, -0.80, 1], [-0.07, -0.80, 1], [-0.07, -0.60, 1]],
  ], rmColor);
  // XYZ/XYW label drawn via ctx2d in drawScene3d

  // Depth color toggle button (green square, y=-0.83~-1.00)
  const dcColor = state.depthColor ? [0, 1, 0.2, 1] : [0, 0.6, 0.1, 1];
  drawPolylines([
    [[-0.07, -0.83, 1], [0.13, -0.83, 1], [0.13, -1.00, 1], [-0.07, -1.00, 1], [-0.07, -0.83, 1]],
  ], dcColor);
  // "W" letter inside
  drawPolylines([
    [[-0.01, -0.85, 1], [0.01, -0.97, 1], [0.03, -0.88, 1], [0.05, -0.97, 1], [0.07, -0.85, 1]],
  ], dcColor);
}

function fillQuad(a, b, c, d, color) {
  if (renderer._batchActive) {
    renderer.batchQuad(a, b, c, d, color);
    return;
  }
  renderer.color4f(color[0], color[1], color[2], color[3]);
  renderer.begin(GL.TRIANGLE_FAN);
  renderer.vertex3f(a[0], a[1], a[2]);
  renderer.vertex3f(b[0], b[1], b[2]);
  renderer.vertex3f(c[0], c[1], c[2]);
  renderer.vertex3f(d[0], d[1], d[2]);
  renderer.end();
}

function drawTexture(index, vertices, color = [1, 1, 1, 1], tiled = false) {
  if (!state.textures[index]) return;
  renderer.bindTexture(state.textures[index]);
  renderer.drawTexturedQuad(vertices, tiled ? texcoordsTiled : texcoords, color);
}

// Pre-allocated return object for decodeBlockVisual (avoids allocation per call)
const _dbv = { pic: 0, color: [0, 0, 0, 0.6] };
function decodeBlockVisual(value) {
  let pic = value & 127;
  if ((value & 255) !== 0) pic ^= 64;
  const R = pic >> 4;
  const G = (pic >> 2) & 3;
  const B = pic & 3;
  let r = (R + 0.6) / 4.8;
  let g = (G + 0.8) / 4.4;
  let b = (B + 0.8) / 4.4;
  if ((value & 255) > 127) { r = Math.min(1, r * 0.7 + 0.12); g *= 0.6; b *= 0.6; }
  if (R === 0 && G === 0 && B === 0) {
    r = 0.02;
    g = 0.02;
    b = 0.02;
  }
  _dbv.pic = pic;
  _dbv.color[0] = r; _dbv.color[1] = g; _dbv.color[2] = b;
  return _dbv;
}

// Draw 24 tesseract faces with given vertex array and color
function drawTesseract24(v, fc) {
  const q = (a, b, c, d) => fillQuad(v[a], v[b], v[c], v[d], fc);
  // XY faces (z,w fixed)
  q(0, 8, 12, 4);  q(1, 9, 13, 5);  q(2, 10, 14, 6);  q(3, 11, 15, 7);
  // XZ faces (y,w fixed)
  q(0, 8, 10, 2);  q(1, 9, 11, 3);  q(4, 12, 14, 6);  q(5, 13, 15, 7);
  // XW faces (y,z fixed)
  q(0, 8, 9, 1);   q(2, 10, 11, 3);  q(4, 12, 13, 5);  q(6, 14, 15, 7);
  // YZ faces (x,w fixed)
  q(0, 4, 6, 2);   q(1, 5, 7, 3);   q(8, 12, 14, 10); q(9, 13, 15, 11);
  // YW faces (x,z fixed)
  q(0, 4, 5, 1);   q(2, 6, 7, 3);   q(8, 12, 13, 9);  q(10, 14, 15, 11);
  // ZW faces (x,y fixed)
  q(0, 2, 3, 1);   q(4, 6, 7, 5);   q(8, 10, 11, 9);  q(12, 14, 15, 13);
}

// Reusable vertex buffer for buildTesseractVerts (avoids 16 array allocations per call)
const _btVerts = Array.from({ length: 16 }, () => [0, 0, 0]);

// Build 16 tesseract vertices projected via p4 (inlined for zero allocation)
function buildTesseractVerts(cx, cy, cz, cw, s) {
  const cxw = _p4_cxw, sxw = _p4_sxw, cyw = _p4_cyw, syw = _p4_syw;
  for (let i = 0; i < 16; i++) {
    const x = cx + ((i & 8) ? s : -s);
    const y = cy + ((i & 4) ? s : -s);
    const z = cz + ((i & 2) ? s : -s);
    const w = cw + ((i & 1) ? s : -s);
    const nx = x * cxw - w * sxw;
    let dw = x * sxw + w * cxw;
    const nz = z * cyw - dw * syw;
    dw = z * syw + dw * cyw;
    const v = _btVerts[i];
    v[0] = nx + dw * 0.15;
    v[1] = y;
    v[2] = nz + dw * 0.15;
  }
  return _btVerts;
}

// Axis-pair indices for decoration faces: [vary1, vary2, fix1, fix2]
const _dtPairs = [[0,1,2,3],[0,2,1,3],[0,3,1,2],[1,2,0,3],[1,3,0,2],[2,3,0,1]];
// Pre-allocated buffers for drawTesseract (avoids per-call allocations)
const _dt_fc = [0, 0, 0, 0.6];
const _dt_bright = [0, 0, 0, 0.65];
const _dt_b = [0, 0, 0, 0];
const _dt_pt = [0, 0, 0, 0];
const _dt_cornerA = [-1, 1, 1, -1];
const _dt_cornerD = [-1, -1, 1, 1];
const _dt_p0 = [0, 0, 0], _dt_p1 = [0, 0, 0], _dt_p2 = [0, 0, 0], _dt_p3 = [0, 0, 0];
const _dt_pArr = [_dt_p0, _dt_p1, _dt_p2, _dt_p3];

// Draw tesseract: body (24 faces at size s) + bright decoration (24 faces)
// Decoration: varying axes at 0.85s, fixed axes at 1.0005s (sits on body surface)
function drawTesseract(cx, cy, cz, cw, s, color) {
  // Body faces
  const v = buildTesseractVerts(cx, cy, cz, cw, s);
  _dt_fc[0] = color[0]; _dt_fc[1] = color[1]; _dt_fc[2] = color[2];
  drawTesseract24(v, _dt_fc);
  // Decoration faces: 6 axis-pairs × 4 faces = 24
  const e = 1.0005 * s;
  const t = 0.85 * s;
  _dt_bright[0] = color[0] * 1.2; _dt_bright[1] = color[1] * 1.2; _dt_bright[2] = color[2] * 1.2;
  // Cached trig for inlined p4
  const cxw = _p4_cxw, sxw = _p4_sxw, cyw = _p4_cyw, syw = _p4_syw;
  const b = _dt_b, pt = _dt_pt;
  const cornerA = _dt_cornerA, cornerD = _dt_cornerD;
  for (let pi = 0; pi < 6; pi++) {
    const v1 = _dtPairs[pi][0], v2 = _dtPairs[pi][1], f1 = _dtPairs[pi][2], f2 = _dtPairs[pi][3];
    for (let fs1 = -1; fs1 <= 1; fs1 += 2) {
      for (let fs2 = -1; fs2 <= 1; fs2 += 2) {
        b[0] = cx; b[1] = cy; b[2] = cz; b[3] = cw;
        b[f1] += fs1 * e;
        b[f2] += fs2 * e;
        for (let ci = 0; ci < 4; ci++) {
          pt[0] = b[0]; pt[1] = b[1]; pt[2] = b[2]; pt[3] = b[3];
          pt[v1] += cornerA[ci] * t;
          pt[v2] += cornerD[ci] * t;
          const nx = pt[0] * cxw - pt[3] * sxw;
          let dw = pt[0] * sxw + pt[3] * cxw;
          const nz = pt[2] * cyw - dw * syw;
          dw = pt[2] * syw + dw * cyw;
          const dst = _dt_pArr[ci];
          dst[0] = nx + dw * 0.15; dst[1] = pt[1]; dst[2] = nz + dw * 0.15;
        }
        fillQuad(_dt_p0, _dt_p1, _dt_p2, _dt_p3, _dt_bright);
      }
    }
  }
}

function drawBlockArrayPreview(blockArray, scale) {
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        const value = blockArray[x][y][z][w];
        if (!value) continue;
        drawBlockVisual(x, y, z + 1.5, w, value, scale, false);
        }
      }
    }
  }
}

function drawHoldPreview() {
  if (state.hidenext !== 0) return;
  renderer.pushMatrix();
  renderer.translatef(-0.45, -1.4, 0);
  renderer.translatef(0.480, 0.210, 0);
  renderer.multMatrixf(buildViewRotationMatrix());
  drawBlockArrayPreview(state.holdblock, 0.02);
  renderer.popMatrix();
}

function drawNextPreview() {
  if (state.hidenext !== 0) return;
  renderer.pushMatrix();
  renderer.translatef(0.6, 0.55, 0);
  renderer.multMatrixf(buildViewRotationMatrix());
  drawBlockArrayPreview(state.nextblock, 0.03);
  renderer.popMatrix();
}

function jitterColor(divR, divG, divB, fallback) {
  const r = Math.min(1, Math.random() * (16384 / divR));
  const g = Math.min(1, Math.random() * (16384 / divG));
  const b = Math.min(1, Math.random() * (16384 / divB));
  return [
    Number.isFinite(r) ? r : fallback[0],
    Number.isFinite(g) ? g : fallback[1],
    Number.isFinite(b) ? b : fallback[2],
    1,
  ];
}

// Draw special decoration on all 4D tesseract faces
// Projects each 3D decoration vertex through p4 with block's w coordinate
// Then repeats on w-faces by swapping z↔w dimensions
// Uses module-level projection state to avoid creating closures per call
let _sp4d_mode = 0; // 0=normal, 1=z-face proj, 2=w-face proj
let _sp4d_glw = 0, _sp4d_glz = 0;
let _sp4d_origLS, _sp4d_origLN, _sp4d_origFQ;

function _sp4d_proj(pt) {
  return p4(pt[0], pt[1], pt[2] || 0, _sp4d_glw);
}
function _sp4d_projW(pt) {
  return p4(pt[0], pt[1], _sp4d_glz, pt[2] || 0);
}
function _sp4d_lineStripZ(pts, col) { _sp4d_origLS(pts.map(_sp4d_proj), col); }
function _sp4d_linesZ(pts, col) { _sp4d_origLN(pts.map(_sp4d_proj), col); }
function _sp4d_fillQuadZ(a, b, c, d, col) { _sp4d_origFQ(_sp4d_proj(a), _sp4d_proj(b), _sp4d_proj(c), _sp4d_proj(d), col); }
function _sp4d_lineStripW(pts, col) { _sp4d_origLS(pts.map(_sp4d_projW), col); }
function _sp4d_linesW(pts, col) { _sp4d_origLN(pts.map(_sp4d_projW), col); }
function _sp4d_fillQuadW(a, b, c, d, col) { _sp4d_origFQ(_sp4d_projW(a), _sp4d_projW(b), _sp4d_projW(c), _sp4d_projW(d), col); }

function drawSpecialPic4D(pic, glx, gly, glz, glw, t, color, val) {
  _sp4d_origLS = lineStrip; _sp4d_origLN = lines; _sp4d_origFQ = fillQuad;
  _sp4d_glw = glw; _sp4d_glz = glz;
  // Pass 1: z-faces
  lineStrip = _sp4d_lineStripZ;
  lines = _sp4d_linesZ;
  fillQuad = _sp4d_fillQuadZ;
  drawSpecialPic(pic, glx, gly, glz, t, color, val);
  // Pass 2: w-faces
  lineStrip = _sp4d_lineStripW;
  lines = _sp4d_linesW;
  fillQuad = _sp4d_fillQuadW;
  drawSpecialPic(pic, glx, gly, glw, t, color, val);
  // Restore
  lineStrip = _sp4d_origLS; lines = _sp4d_origLN; fillQuad = _sp4d_origFQ;
}

function drawSpecialPic(pic, x, y, z, t, color, val) {
  const e = 1.0005 * t;
  let specialColor = color;
  if (pic === 27) {
    specialColor = jitterColor(16384, 32768, 65536, color);
  } else if (pic === 68 || pic === 70) {
    specialColor = jitterColor(65536, 16384, 65536, color);
  } else if (pic === 40) {
    specialColor = jitterColor(16384, 16384, 16384, color);
  } else if (pic === 38 || pic === 41 || pic === 42 || pic === 52 || pic === 54 || pic === 55 || pic === 60 || pic === 62) {
    specialColor = jitterColor(65536, 65536, 16384, color);
  } else if (pic === 53 || pic === 56 || pic === 57 || pic === 58 || pic === 59 || pic === 61 || pic === 63 || pic === 65 || pic === 66 || pic === 69 || pic === 75 || pic === 94 || pic === 96) {
    specialColor = jitterColor(16384, 65536, 65536, color);
  } else if (pic === 72 || pic === 73 || pic === 74 || pic === 80 || pic === 81 || pic === 84 || pic === 85 || pic === 86) {
    specialColor = jitterColor(16384, 32768, 65536, color);
  }
  const q = (verts, alpha = 1) => fillQuad(verts[0], verts[1], verts[2], verts[3], [specialColor[0], specialColor[1], specialColor[2], alpha]);
  // Line color: complementary (inverted) for visibility, except bomb (pic 27)
  const lc = (pic === 27) ? specialColor : [1 - specialColor[0], 1 - specialColor[1], 1 - specialColor[2], specialColor[3]];
  if (pic === 27) {
    lineStrip([[0.6 * t + x, -0.6 * t + y, e + z], [0.6 * t + x, 0.6 * t + y, e + z], [-0.6 * t + x, 0.6 * t + y, e + z], [-0.6 * t + x, -0.6 * t + y, e + z], [0.2 * t + x, -0.6 * t + y, e + z], [-0.1 * t + x, -0.4 * t + y, e + z], [0.2 * t + x, -0.6 * t + y, e + z], [-0.1 * t + x, -0.8 * t + y, e + z]], lc);
    lines([[0.8 * t + x, 0.8 * t + y, e + z], [-0.8 * t + x, -0.8 * t + y, e + z], [-0.8 * t + x, 0.8 * t + y, e + z], [0.8 * t + x, -0.8 * t + y, e + z]], lc);
    lineStrip([[0.6 * t + x, -0.6 * t + y, -e + z], [0.6 * t + x, 0.6 * t + y, -e + z], [-0.6 * t + x, 0.6 * t + y, -e + z], [-0.6 * t + x, -0.6 * t + y, -e + z], [0.2 * t + x, -0.6 * t + y, -e + z], [-0.1 * t + x, -0.4 * t + y, -e + z], [0.2 * t + x, -0.6 * t + y, -e + z], [-0.1 * t + x, -0.8 * t + y, -e + z]], lc);
    lines([[0.8 * t + x, 0.8 * t + y, -e + z], [-0.8 * t + x, -0.8 * t + y, -e + z], [-0.8 * t + x, 0.8 * t + y, -e + z], [0.8 * t + x, -0.8 * t + y, -e + z]], lc);
    return true;
  }
  if (pic === 72) {
    lineStrip([[-0.5 * t + x, -0.5 * t + y, e + z], [0 + x, 0 + y, e + z], [-0.5 * t + x, 0.5 * t + y, e + z]], lc);
    lineStrip([[0 + x, -0.5 * t + y, e + z], [0.5 * t + x, 0 + y, e + z], [0 + x, 0.5 * t + y, e + z]], lc);
    lineStrip([[-0.5 * t + x, -0.5 * t + y, -e + z], [0 + x, 0 + y, -e + z], [-0.5 * t + x, 0.5 * t + y, -e + z]], lc);
    lineStrip([[0 + x, -0.5 * t + y, -e + z], [0.5 * t + x, 0 + y, -e + z], [0 + x, 0.5 * t + y, -e + z]], lc);
    return true;
  }
  if (pic === 73) {
    lineStrip([[0.5 * t + x, -0.5 * t + y, e + z], [0 + x, 0 + y, e + z], [0.5 * t + x, 0.5 * t + y, e + z]], lc);
    lineStrip([[0 + x, -0.5 * t + y, e + z], [-0.5 * t + x, 0 + y, e + z], [0 + x, 0.5 * t + y, e + z]], lc);
    lineStrip([[0.5 * t + x, -0.5 * t + y, -e + z], [0 + x, 0 + y, -e + z], [0.5 * t + x, 0.5 * t + y, -e + z]], lc);
    lineStrip([[0 + x, -0.5 * t + y, -e + z], [-0.5 * t + x, 0 + y, -e + z], [0 + x, 0.5 * t + y, -e + z]], lc);
    return true;
  }
  if (pic === 74) {
    lines([[-0.5 * t + x, -0.5 * t + y, e + z], [-0.5 * t + x, 0.5 * t + y, e + z]], lc);
    lines([[-0.5 * t + x, 0 + y, e + z], [0.5 * t + x, 0 + y, e + z]], lc);
    lines([[0.5 * t + x, -0.5 * t + y, e + z], [0.5 * t + x, 0.5 * t + y, e + z]], lc);
    lines([[-0.3 * t + x, -0.3 * t + y, e + z], [0.3 * t + x, 0.3 * t + y, e + z], [0.3 * t + x, -0.3 * t + y, e + z], [-0.3 * t + x, 0.3 * t + y, e + z]], lc);
    lines([[-0.5 * t + x, -0.5 * t + y, -e + z], [-0.5 * t + x, 0.5 * t + y, -e + z]], lc);
    lines([[-0.5 * t + x, 0 + y, -e + z], [0.5 * t + x, 0 + y, -e + z]], lc);
    lines([[0.5 * t + x, -0.5 * t + y, -e + z], [0.5 * t + x, 0.5 * t + y, -e + z]], lc);
    lines([[-0.3 * t + x, -0.3 * t + y, -e + z], [0.3 * t + x, 0.3 * t + y, -e + z], [0.3 * t + x, -0.3 * t + y, -e + z], [-0.3 * t + x, 0.3 * t + y, -e + z]], lc);
    return true;
  }
  // pic 75 (obstacle): filled cross (+ shape) on two faces
  if (pic === 75) {
    q([[0.3 * t + x, 0.1 * t + y, -e + z], [-0.3 * t + x, 0.1 * t + y, -e + z], [-0.3 * t + x, -0.1 * t + y, -e + z], [0.3 * t + x, -0.1 * t + y, -e + z]]);
    q([[0.3 * t + x, 0.1 * t + y, e + z], [-0.3 * t + x, 0.1 * t + y, e + z], [-0.3 * t + x, -0.1 * t + y, e + z], [0.3 * t + x, -0.1 * t + y, e + z]]);
    q([[0.1 * t + x, 0.3 * t + y, -e + z], [-0.1 * t + x, 0.3 * t + y, -e + z], [-0.1 * t + x, -0.3 * t + y, -e + z], [0.1 * t + x, -0.3 * t + y, -e + z]]);
    q([[0.1 * t + x, 0.3 * t + y, e + z], [-0.1 * t + x, 0.3 * t + y, e + z], [-0.1 * t + x, -0.3 * t + y, e + z], [0.1 * t + x, -0.3 * t + y, e + z]]);
    return true;
  }
  // pic 80 (blindboard): horizontal eye shape with X on two faces
  if (pic === 80) {
    const eyeTop = [], eyeBot = [];
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      const ex = (-0.7 + 1.4 * f) * t + x;
      const ey = -0.5 * t * Math.sin(f * Math.PI) + y;
      eyeTop.push([ex, ey, e + z]);
    }
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      const ex = (0.7 - 1.4 * f) * t + x;
      const ey = 0.5 * t * Math.sin(f * Math.PI) + y;
      eyeBot.push([ex, ey, e + z]);
    }
    lineStrip(eyeTop, lc);
    lineStrip(eyeBot, lc);
    lines([[-0.4 * t + x, -0.4 * t + y, e + z], [0.4 * t + x, 0.4 * t + y, e + z], [0.4 * t + x, -0.4 * t + y, e + z], [-0.4 * t + x, 0.4 * t + y, e + z]], lc);
    lineStrip(eyeTop.map(p => [p[0], p[1], -e + z]), lc);
    lineStrip(eyeBot.map(p => [p[0], p[1], -e + z]), lc);
    lines([[-0.4 * t + x, -0.4 * t + y, -e + z], [0.4 * t + x, 0.4 * t + y, -e + z], [0.4 * t + x, -0.4 * t + y, -e + z], [-0.4 * t + x, 0.4 * t + y, -e + z]], lc);
    return true;
  }
  if (pic === 81) {
    lineStrip([[-0.2*t+x, -0.6*t+y, e+z], [0.2*t+x, -0.6*t+y, e+z], [0.2*t+x, -0.2*t+y, e+z], [-0.2*t+x, -0.2*t+y, e+z], [-0.2*t+x, -0.6*t+y, e+z]], lc);
    lineStrip([[-0.5*t+x, 0.0+y, e+z], [-0.1*t+x, 0.0+y, e+z], [-0.1*t+x, 0.4*t+y, e+z], [-0.5*t+x, 0.4*t+y, e+z], [-0.5*t+x, 0.0+y, e+z]], lc);
    lineStrip([[0.1*t+x, 0.0+y, e+z], [0.5*t+x, 0.0+y, e+z], [0.5*t+x, 0.4*t+y, e+z], [0.1*t+x, 0.4*t+y, e+z], [0.1*t+x, 0.0+y, e+z]], lc);
    lineStrip([[-0.2*t+x, -0.6*t+y, -e+z], [0.2*t+x, -0.6*t+y, -e+z], [0.2*t+x, -0.2*t+y, -e+z], [-0.2*t+x, -0.2*t+y, -e+z], [-0.2*t+x, -0.6*t+y, -e+z]], lc);
    lineStrip([[-0.5*t+x, 0.0+y, -e+z], [-0.1*t+x, 0.0+y, -e+z], [-0.1*t+x, 0.4*t+y, -e+z], [-0.5*t+x, 0.4*t+y, -e+z], [-0.5*t+x, 0.0+y, -e+z]], lc);
    lineStrip([[0.1*t+x, 0.0+y, -e+z], [0.5*t+x, 0.0+y, -e+z], [0.5*t+x, 0.4*t+y, -e+z], [0.1*t+x, 0.4*t+y, -e+z], [0.1*t+x, 0.0+y, -e+z]], lc);
    return true;
  }
  if (pic === 84) {
    lines([[-0.25*t+x, 0.6*t+y, e+z], [-0.25*t+x, -0.1*t+y, e+z]], lc);
    lines([[0.25*t+x, 0.6*t+y, e+z], [0.25*t+x, -0.1*t+y, e+z]], lc);
    lineStrip([[-0.5*t+x, -0.1*t+y, e+z], [x, -0.6*t+y, e+z], [0.5*t+x, -0.1*t+y, e+z]], lc);
    lines([[-0.25*t+x, 0.6*t+y, -e+z], [-0.25*t+x, -0.1*t+y, -e+z]], lc);
    lines([[0.25*t+x, 0.6*t+y, -e+z], [0.25*t+x, -0.1*t+y, -e+z]], lc);
    lineStrip([[-0.5*t+x, -0.1*t+y, -e+z], [x, -0.6*t+y, -e+z], [0.5*t+x, -0.1*t+y, -e+z]], lc);
    return true;
  }
  if (pic === 85) {
    lineStrip([[-0.5*t+x,-0.3*t+y,e+z],[-.05*t+x,-0.3*t+y,e+z],[-.05*t+x,0.3*t+y,e+z],[-0.5*t+x,0.3*t+y,e+z],[-0.5*t+x,-0.3*t+y,e+z]], lc);
    lineStrip([[0.05*t+x,-0.3*t+y,e+z],[0.5*t+x,-0.3*t+y,e+z],[0.5*t+x,0.3*t+y,e+z],[0.05*t+x,0.3*t+y,e+z],[0.05*t+x,-0.3*t+y,e+z]], lc);
    lineStrip([[-0.5*t+x,-0.3*t+y,-e+z],[-.05*t+x,-0.3*t+y,-e+z],[-.05*t+x,0.3*t+y,-e+z],[-0.5*t+x,0.3*t+y,-e+z],[-0.5*t+x,-0.3*t+y,-e+z]], lc);
    lineStrip([[0.05*t+x,-0.3*t+y,-e+z],[0.5*t+x,-0.3*t+y,-e+z],[0.5*t+x,0.3*t+y,-e+z],[0.05*t+x,0.3*t+y,-e+z],[0.05*t+x,-0.3*t+y,-e+z]], lc);
    lineStrip([[-0.5*t+x,e+y,-0.3*t+z],[-.05*t+x,e+y,-0.3*t+z],[-.05*t+x,e+y,0.3*t+z],[-0.5*t+x,e+y,0.3*t+z],[-0.5*t+x,e+y,-0.3*t+z]], lc);
    lineStrip([[0.05*t+x,e+y,-0.3*t+z],[0.5*t+x,e+y,-0.3*t+z],[0.5*t+x,e+y,0.3*t+z],[0.05*t+x,e+y,0.3*t+z],[0.05*t+x,e+y,-0.3*t+z]], lc);
    lineStrip([[-0.5*t+x,-e+y,-0.3*t+z],[-.05*t+x,-e+y,-0.3*t+z],[-.05*t+x,-e+y,0.3*t+z],[-0.5*t+x,-e+y,0.3*t+z],[-0.5*t+x,-e+y,-0.3*t+z]], lc);
    lineStrip([[0.05*t+x,-e+y,-0.3*t+z],[0.5*t+x,-e+y,-0.3*t+z],[0.5*t+x,-e+y,0.3*t+z],[0.05*t+x,-e+y,0.3*t+z],[0.05*t+x,-e+y,-0.3*t+z]], lc);
    lineStrip([[e+x,-0.3*t+y,-0.5*t+z],[e+x,-0.3*t+y,-.05*t+z],[e+x,0.3*t+y,-.05*t+z],[e+x,0.3*t+y,-0.5*t+z],[e+x,-0.3*t+y,-0.5*t+z]], lc);
    lineStrip([[e+x,-0.3*t+y,0.05*t+z],[e+x,-0.3*t+y,0.5*t+z],[e+x,0.3*t+y,0.5*t+z],[e+x,0.3*t+y,0.05*t+z],[e+x,-0.3*t+y,0.05*t+z]], lc);
    lineStrip([[-e+x,-0.3*t+y,-0.5*t+z],[-e+x,-0.3*t+y,-.05*t+z],[-e+x,0.3*t+y,-.05*t+z],[-e+x,0.3*t+y,-0.5*t+z],[-e+x,-0.3*t+y,-0.5*t+z]], lc);
    lineStrip([[-e+x,-0.3*t+y,0.05*t+z],[-e+x,-0.3*t+y,0.5*t+z],[-e+x,0.3*t+y,0.5*t+z],[-e+x,0.3*t+y,0.05*t+z],[-e+x,-0.3*t+y,0.05*t+z]], lc);
    return true;
  }
  if (pic === 86) {
    lineStrip([[-0.55*t+x,-0.55*t+y,e+z],[-0.22*t+x,-0.55*t+y,e+z],[-0.22*t+x,-0.1*t+y,e+z],[-0.55*t+x,-0.1*t+y,e+z],[-0.55*t+x,-0.55*t+y,e+z]], lc);
    lineStrip([[-0.165*t+x,-0.55*t+y,e+z],[0.165*t+x,-0.55*t+y,e+z],[0.165*t+x,-0.1*t+y,e+z],[-0.165*t+x,-0.1*t+y,e+z],[-0.165*t+x,-0.55*t+y,e+z]], lc);
    lineStrip([[0.22*t+x,-0.55*t+y,e+z],[0.55*t+x,-0.55*t+y,e+z],[0.55*t+x,-0.1*t+y,e+z],[0.22*t+x,-0.1*t+y,e+z],[0.22*t+x,-0.55*t+y,e+z]], lc);
    lineStrip([[-0.4*t+x,0.05*t+y,e+z],[-0.03*t+x,0.05*t+y,e+z],[-0.03*t+x,0.5*t+y,e+z],[-0.4*t+x,0.5*t+y,e+z],[-0.4*t+x,0.05*t+y,e+z]], lc);
    lineStrip([[0.03*t+x,0.05*t+y,e+z],[0.4*t+x,0.05*t+y,e+z],[0.4*t+x,0.5*t+y,e+z],[0.03*t+x,0.5*t+y,e+z],[0.03*t+x,0.05*t+y,e+z]], lc);
    lineStrip([[-0.55*t+x,-0.55*t+y,-e+z],[-0.22*t+x,-0.55*t+y,-e+z],[-0.22*t+x,-0.1*t+y,-e+z],[-0.55*t+x,-0.1*t+y,-e+z],[-0.55*t+x,-0.55*t+y,-e+z]], lc);
    lineStrip([[-0.165*t+x,-0.55*t+y,-e+z],[0.165*t+x,-0.55*t+y,-e+z],[0.165*t+x,-0.1*t+y,-e+z],[-0.165*t+x,-0.1*t+y,-e+z],[-0.165*t+x,-0.55*t+y,-e+z]], lc);
    lineStrip([[0.22*t+x,-0.55*t+y,-e+z],[0.55*t+x,-0.55*t+y,-e+z],[0.55*t+x,-0.1*t+y,-e+z],[0.22*t+x,-0.1*t+y,-e+z],[0.22*t+x,-0.55*t+y,-e+z]], lc);
    lineStrip([[-0.4*t+x,0.05*t+y,-e+z],[-0.03*t+x,0.05*t+y,-e+z],[-0.03*t+x,0.5*t+y,-e+z],[-0.4*t+x,0.5*t+y,-e+z],[-0.4*t+x,0.05*t+y,-e+z]], lc);
    lineStrip([[0.03*t+x,0.05*t+y,-e+z],[0.4*t+x,0.05*t+y,-e+z],[0.4*t+x,0.5*t+y,-e+z],[0.03*t+x,0.5*t+y,-e+z],[0.03*t+x,0.05*t+y,-e+z]], lc);
    lineStrip([[-0.55*t+x,e+y,-0.55*t+z],[-0.22*t+x,e+y,-0.55*t+z],[-0.22*t+x,e+y,-0.1*t+z],[-0.55*t+x,e+y,-0.1*t+z],[-0.55*t+x,e+y,-0.55*t+z]], lc);
    lineStrip([[-0.165*t+x,e+y,-0.55*t+z],[0.165*t+x,e+y,-0.55*t+z],[0.165*t+x,e+y,-0.1*t+z],[-0.165*t+x,e+y,-0.1*t+z],[-0.165*t+x,e+y,-0.55*t+z]], lc);
    lineStrip([[0.22*t+x,e+y,-0.55*t+z],[0.55*t+x,e+y,-0.55*t+z],[0.55*t+x,e+y,-0.1*t+z],[0.22*t+x,e+y,-0.1*t+z],[0.22*t+x,e+y,-0.55*t+z]], lc);
    lineStrip([[-0.4*t+x,e+y,0.05*t+z],[-0.03*t+x,e+y,0.05*t+z],[-0.03*t+x,e+y,0.5*t+z],[-0.4*t+x,e+y,0.5*t+z],[-0.4*t+x,e+y,0.05*t+z]], lc);
    lineStrip([[0.03*t+x,e+y,0.05*t+z],[0.4*t+x,e+y,0.05*t+z],[0.4*t+x,e+y,0.5*t+z],[0.03*t+x,e+y,0.5*t+z],[0.03*t+x,e+y,0.05*t+z]], lc);
    lineStrip([[-0.55*t+x,-e+y,-0.55*t+z],[-0.22*t+x,-e+y,-0.55*t+z],[-0.22*t+x,-e+y,-0.1*t+z],[-0.55*t+x,-e+y,-0.1*t+z],[-0.55*t+x,-e+y,-0.55*t+z]], lc);
    lineStrip([[-0.165*t+x,-e+y,-0.55*t+z],[0.165*t+x,-e+y,-0.55*t+z],[0.165*t+x,-e+y,-0.1*t+z],[-0.165*t+x,-e+y,-0.1*t+z],[-0.165*t+x,-e+y,-0.55*t+z]], lc);
    lineStrip([[0.22*t+x,-e+y,-0.55*t+z],[0.55*t+x,-e+y,-0.55*t+z],[0.55*t+x,-e+y,-0.1*t+z],[0.22*t+x,-e+y,-0.1*t+z],[0.22*t+x,-e+y,-0.55*t+z]], lc);
    lineStrip([[-0.4*t+x,-e+y,0.05*t+z],[-0.03*t+x,-e+y,0.05*t+z],[-0.03*t+x,-e+y,0.5*t+z],[-0.4*t+x,-e+y,0.5*t+z],[-0.4*t+x,-e+y,0.05*t+z]], lc);
    lineStrip([[0.03*t+x,-e+y,0.05*t+z],[0.4*t+x,-e+y,0.05*t+z],[0.4*t+x,-e+y,0.5*t+z],[0.03*t+x,-e+y,0.5*t+z],[0.03*t+x,-e+y,0.05*t+z]], lc);
    lineStrip([[e+x,-0.55*t+y,-0.55*t+z],[e+x,-0.22*t+y,-0.55*t+z],[e+x,-0.22*t+y,-0.1*t+z],[e+x,-0.55*t+y,-0.1*t+z],[e+x,-0.55*t+y,-0.55*t+z]], lc);
    lineStrip([[e+x,-0.165*t+y,-0.55*t+z],[e+x,0.165*t+y,-0.55*t+z],[e+x,0.165*t+y,-0.1*t+z],[e+x,-0.165*t+y,-0.1*t+z],[e+x,-0.165*t+y,-0.55*t+z]], lc);
    lineStrip([[e+x,0.22*t+y,-0.55*t+z],[e+x,0.55*t+y,-0.55*t+z],[e+x,0.55*t+y,-0.1*t+z],[e+x,0.22*t+y,-0.1*t+z],[e+x,0.22*t+y,-0.55*t+z]], lc);
    lineStrip([[e+x,-0.4*t+y,0.05*t+z],[e+x,-0.03*t+y,0.05*t+z],[e+x,-0.03*t+y,0.5*t+z],[e+x,-0.4*t+y,0.5*t+z],[e+x,-0.4*t+y,0.05*t+z]], lc);
    lineStrip([[e+x,0.03*t+y,0.05*t+z],[e+x,0.4*t+y,0.05*t+z],[e+x,0.4*t+y,0.5*t+z],[e+x,0.03*t+y,0.5*t+z],[e+x,0.03*t+y,0.05*t+z]], lc);
    lineStrip([[-e+x,-0.55*t+y,-0.55*t+z],[-e+x,-0.22*t+y,-0.55*t+z],[-e+x,-0.22*t+y,-0.1*t+z],[-e+x,-0.55*t+y,-0.1*t+z],[-e+x,-0.55*t+y,-0.55*t+z]], lc);
    lineStrip([[-e+x,-0.165*t+y,-0.55*t+z],[-e+x,0.165*t+y,-0.55*t+z],[-e+x,0.165*t+y,-0.1*t+z],[-e+x,-0.165*t+y,-0.1*t+z],[-e+x,-0.165*t+y,-0.55*t+z]], lc);
    lineStrip([[-e+x,0.22*t+y,-0.55*t+z],[-e+x,0.55*t+y,-0.55*t+z],[-e+x,0.55*t+y,-0.1*t+z],[-e+x,0.22*t+y,-0.1*t+z],[-e+x,0.22*t+y,-0.55*t+z]], lc);
    lineStrip([[-e+x,-0.4*t+y,0.05*t+z],[-e+x,-0.03*t+y,0.05*t+z],[-e+x,-0.03*t+y,0.5*t+z],[-e+x,-0.4*t+y,0.5*t+z],[-e+x,-0.4*t+y,0.05*t+z]], lc);
    lineStrip([[-e+x,0.03*t+y,0.05*t+z],[-e+x,0.4*t+y,0.05*t+z],[-e+x,0.4*t+y,0.5*t+z],[-e+x,0.03*t+y,0.5*t+z],[-e+x,0.03*t+y,0.05*t+z]], lc);
    return true;
  }
  if (pic === 38) {
    q([[-0.7 * t + x, e + y, 0.7 * t + z], [0.7 * t + x, e + y, 0.7 * t + z], [0.7 * t + x, e + y, -0.7 * t + z], [-0.7 * t + x, e + y, -0.7 * t + z]]);
    q([[e + x, y, 0.7 * t + z], [e + x, 0.7 * t + y, 0.7 * t + z], [e + x, 0.7 * t + y, -0.7 * t + z], [e + x, y, -0.7 * t + z]]);
    q([[-e + x, y, 0.7 * t + z], [-e + x, 0.7 * t + y, 0.7 * t + z], [-e + x, 0.7 * t + y, -0.7 * t + z], [-e + x, y, -0.7 * t + z]]);
    q([[-0.7 * t + x, y, e + z], [0.7 * t + x, y, e + z], [0.7 * t + x, 0.7 * t + y, e + z], [-0.7 * t + x, 0.7 * t + y, e + z]]);
    q([[-0.7 * t + x, y, -e + z], [0.7 * t + x, y, -e + z], [0.7 * t + x, 0.7 * t + y, -e + z], [-0.7 * t + x, 0.7 * t + y, -e + z]]);
    return true;
  }
  if (pic === 40) {
    lineStrip([[-0.6 * t + x, -e + y, 0.6 * t + z], [0.6 * t + x, -e + y, 0.6 * t + z], [0.6 * t + x, -e + y, -0.6 * t + z], [-0.6 * t + x, -e + y, -0.6 * t + z], [-0.6 * t + x, -e + y, 0.6 * t + z]], lc);
    lineStrip([[-0.6 * t + x, e + y, 0.6 * t + z], [0.6 * t + x, e + y, 0.6 * t + z], [0.6 * t + x, e + y, -0.6 * t + z], [-0.6 * t + x, e + y, -0.6 * t + z], [-0.6 * t + x, e + y, 0.6 * t + z]], lc);
    lineStrip([[e + x, -0.6 * t + y, 0.6 * t + z], [e + x, 0.6 * t + y, 0.6 * t + z], [e + x, 0.6 * t + y, -0.6 * t + z], [e + x, -0.6 * t + y, -0.6 * t + z], [e + x, -0.6 * t + y, 0.6 * t + z]], lc);
    lineStrip([[-e + x, -0.6 * t + y, 0.6 * t + z], [-e + x, 0.6 * t + y, 0.6 * t + z], [-e + x, 0.6 * t + y, -0.6 * t + z], [-e + x, -0.6 * t + y, -0.6 * t + z], [-e + x, -0.6 * t + y, 0.6 * t + z]], lc);
    lineStrip([[-0.6 * t + x, -0.6 * t + y, e + z], [0.6 * t + x, -0.6 * t + y, e + z], [0.6 * t + x, 0.6 * t + y, e + z], [-0.6 * t + x, 0.6 * t + y, e + z], [-0.6 * t + x, -0.6 * t + y, e + z]], lc);
    lineStrip([[-0.6 * t + x, -0.6 * t + y, -e + z], [0.6 * t + x, -0.6 * t + y, -e + z], [0.6 * t + x, 0.6 * t + y, -e + z], [-0.6 * t + x, 0.6 * t + y, -e + z], [-0.6 * t + x, -0.6 * t + y, -e + z]], lc);
    return true;
  }
  if (pic === 56 || pic === 57 || pic === 58 || pic === 59 || pic === 63 || pic === 96) {
    lineStrip([[x, t + y, t + z], [x, -t + y, t + z], [x, -t + y, -t + z], [x, t + y, -t + z], [x, t + y, t + z]], lc);
    lineStrip([[t + x, y, t + z], [-t + x, y, t + z], [-t + x, y, -t + z], [t + x, y, -t + z], [t + x, y, t + z]], lc);
    lineStrip([[t + x, t + y, z], [-t + x, t + y, z], [-t + x, -t + y, z], [t + x, -t + y, z], [t + x, t + y, z]], lc);
    return true;
  }
  if (pic === 62) {
    lineStrip([[0.3 * t + x, 0.5 * t + y, -1.005 * t + z], [x, 0.7 * t + y, -1.005 * t + z], [x, -0.7 * t + y, -1.005 * t + z], [-0.3 * t + x, -0.5 * t + y, -1.005 * t + z]], lc);
    lineStrip([[-0.3 * t + x, 0.5 * t + y, 1.005 * t + z], [x, 0.7 * t + y, 1.005 * t + z], [x, -0.7 * t + y, 1.005 * t + z], [0.3 * t + x, -0.5 * t + y, 1.005 * t + z]], lc);
    lineStrip([[0.3 * t + x, 0.5 * t + y, 1.005 * t + z], [x, 0.7 * t + y, 1.005 * t + z], [x, -0.7 * t + y, 1.005 * t + z], [-0.3 * t + x, -0.5 * t + y, 1.005 * t + z]], lc);
    lineStrip([[0.5 * t + x, -0.3 * t + y, -1.005 * t + z], [0.7 * t + x, y, -1.005 * t + z], [-0.7 * t + x, y, -1.005 * t + z], [-0.5 * t + x, 0.3 * t + y, -1.005 * t + z]], lc);
    lineStrip([[0.5 * t + x, 0.3 * t + y, -1.005 * t + z], [0.7 * t + x, y, -1.005 * t + z], [-0.7 * t + x, y, -1.005 * t + z], [-0.5 * t + x, -0.3 * t + y, -1.005 * t + z]], lc);
    lineStrip([[0.5 * t + x, -0.3 * t + y, 1.005 * t + z], [0.7 * t + x, y, 1.005 * t + z], [-0.7 * t + x, y, 1.005 * t + z], [-0.5 * t + x, 0.3 * t + y, 1.005 * t + z]], lc);
    lineStrip([[0.5 * t + x, 0.3 * t + y, 1.005 * t + z], [0.7 * t + x, y, 1.005 * t + z], [-0.7 * t + x, y, 1.005 * t + z], [-0.5 * t + x, -0.3 * t + y, 1.005 * t + z]], lc);
    return true;
  }
  if (pic === 42) {
    // W Del: arrows on Z faces (z = ±e), which appear on W faces via z↔w swap in pass 2
    // X-direction arrows to distinguish from Row Del's Y-direction arrows
    lineStrip([[0.5 * t + x, -0.3 * t + y, e + z], [0.7 * t + x, y, e + z], [-0.7 * t + x, y, e + z], [-0.5 * t + x, 0.3 * t + y, e + z]], lc);
    lineStrip([[0.5 * t + x, 0.3 * t + y, e + z], [0.7 * t + x, y, e + z], [-0.7 * t + x, y, e + z], [-0.5 * t + x, -0.3 * t + y, e + z]], lc);
    lineStrip([[0.5 * t + x, -0.3 * t + y, -e + z], [0.7 * t + x, y, -e + z], [-0.7 * t + x, y, -e + z], [-0.5 * t + x, 0.3 * t + y, -e + z]], lc);
    lineStrip([[0.5 * t + x, 0.3 * t + y, -e + z], [0.7 * t + x, y, -e + z], [-0.7 * t + x, y, -e + z], [-0.5 * t + x, -0.3 * t + y, -e + z]], lc);
    lineStrip([[-0.3 * t + x, 0.5 * t + y, e + z], [x, 0.7 * t + y, e + z], [x, -0.7 * t + y, e + z], [0.3 * t + x, -0.5 * t + y, e + z]], lc);
    lineStrip([[-0.3 * t + x, -0.5 * t + y, e + z], [x, -0.7 * t + y, e + z], [x, 0.7 * t + y, e + z], [0.3 * t + x, 0.5 * t + y, e + z]], lc);
    lineStrip([[-0.3 * t + x, 0.5 * t + y, -e + z], [x, 0.7 * t + y, -e + z], [x, -0.7 * t + y, -e + z], [0.3 * t + x, -0.5 * t + y, -e + z]], lc);
    lineStrip([[-0.3 * t + x, -0.5 * t + y, -e + z], [x, -0.7 * t + y, -e + z], [x, 0.7 * t + y, -e + z], [0.3 * t + x, 0.5 * t + y, -e + z]], lc);
    return true;
  }
  if (pic === 41) {
    lineStrip([[-1.005 * t + x, 0.5 * t + y, -0.3 * t + z], [-1.005 * t + x, 0.7 * t + y, z], [-1.005 * t + x, -0.7 * t + y, z], [-1.005 * t + x, -0.5 * t + y, 0.3 * t + z]], lc);
    lineStrip([[-1.005 * t + x, 0.5 * t + y, 0.3 * t + z], [-1.005 * t + x, 0.7 * t + y, z], [-1.005 * t + x, -0.7 * t + y, z], [-1.005 * t + x, -0.5 * t + y, -0.3 * t + z]], lc);
    lineStrip([[1.005 * t + x, 0.5 * t + y, -0.3 * t + z], [1.005 * t + x, 0.7 * t + y, z], [1.005 * t + x, -0.7 * t + y, z], [1.005 * t + x, -0.5 * t + y, 0.3 * t + z]], lc);
    lineStrip([[1.005 * t + x, 0.5 * t + y, 0.3 * t + z], [1.005 * t + x, 0.7 * t + y, z], [1.005 * t + x, -0.7 * t + y, z], [1.005 * t + x, -0.5 * t + y, -0.3 * t + z]], lc);
    lineStrip([[-1.005 * t + x, -0.3 * t + y, 0.5 * t + z], [-1.005 * t + x, y, 0.7 * t + z], [-1.005 * t + x, y, -0.7 * t + z], [-1.005 * t + x, 0.3 * t + y, -0.5 * t + z]], lc);
    lineStrip([[-1.005 * t + x, 0.3 * t + y, 0.5 * t + z], [-1.005 * t + x, y, 0.7 * t + z], [-1.005 * t + x, y, -0.7 * t + z], [-1.005 * t + x, -0.3 * t + y, -0.5 * t + z]], lc);
    lineStrip([[1.005 * t + x, -0.3 * t + y, 0.5 * t + z], [1.005 * t + x, y, 0.7 * t + z], [1.005 * t + x, y, -0.7 * t + z], [1.005 * t + x, 0.3 * t + y, -0.5 * t + z]], lc);
    lineStrip([[1.005 * t + x, 0.3 * t + y, 0.5 * t + z], [1.005 * t + x, y, 0.7 * t + z], [1.005 * t + x, y, -0.7 * t + z], [1.005 * t + x, -0.3 * t + y, -0.5 * t + z]], lc);
    return true;
  }
  if (pic === 54) {
    lineStrip([[-0.3 * t + x, 0.5 * t + y, -1.005 * t + z], [x, 0.7 * t + y, -1.005 * t + z], [x, -0.7 * t + y, -1.005 * t + z], [0.3 * t + x, -0.5 * t + y, -1.005 * t + z]], lc);
    lineStrip([[0.3 * t + x, 0.5 * t + y, -1.005 * t + z], [x, 0.7 * t + y, -1.005 * t + z], [x, -0.7 * t + y, -1.005 * t + z], [-0.3 * t + x, -0.5 * t + y, -1.005 * t + z]], lc);
    lineStrip([[-0.3 * t + x, 0.5 * t + y, 1.005 * t + z], [x, 0.7 * t + y, 1.005 * t + z], [x, -0.7 * t + y, 1.005 * t + z], [0.3 * t + x, -0.5 * t + y, 1.005 * t + z]], lc);
    lineStrip([[0.3 * t + x, 0.5 * t + y, 1.005 * t + z], [x, 0.7 * t + y, 1.005 * t + z], [x, -0.7 * t + y, 1.005 * t + z], [-0.3 * t + x, -0.5 * t + y, 1.005 * t + z]], lc);
    lineStrip([[-1.005 * t + x, 0.5 * t + y, -0.3 * t + z], [-1.005 * t + x, 0.7 * t + y, z], [-1.005 * t + x, -0.7 * t + y, z], [-1.005 * t + x, -0.5 * t + y, 0.3 * t + z]], lc);
    lineStrip([[-1.005 * t + x, 0.5 * t + y, 0.3 * t + z], [-1.005 * t + x, 0.7 * t + y, z], [-1.005 * t + x, -0.7 * t + y, z], [-1.005 * t + x, -0.5 * t + y, -0.3 * t + z]], lc);
    lineStrip([[1.005 * t + x, 0.5 * t + y, -0.3 * t + z], [1.005 * t + x, 0.7 * t + y, z], [1.005 * t + x, -0.7 * t + y, z], [1.005 * t + x, -0.5 * t + y, 0.3 * t + z]], lc);
    lineStrip([[1.005 * t + x, 0.5 * t + y, 0.3 * t + z], [1.005 * t + x, 0.7 * t + y, z], [1.005 * t + x, -0.7 * t + y, z], [1.005 * t + x, -0.5 * t + y, -0.3 * t + z]], lc);
    return true;
  }
  if (pic === 55) {
    q([[0.5 * t + x, -e + y, 0.5 * t + z], [-0.5 * t + x, -e + y, 0.5 * t + z], [-0.5 * t + x, -e + y, 0.3 * t + z], [0.5 * t + x, -e + y, 0.3 * t + z]]);
    q([[0.5 * t + x, -e + y, -0.5 * t + z], [-0.5 * t + x, -e + y, -0.5 * t + z], [-0.5 * t + x, -e + y, -0.3 * t + z], [0.5 * t + x, -e + y, -0.3 * t + z]]);
    q([[-0.5 * t + x, -e + y, 0.5 * t + z], [-0.3 * t + x, -e + y, 0.5 * t + z], [-0.3 * t + x, -e + y, -0.5 * t + z], [-0.5 * t + x, -e + y, -0.5 * t + z]]);
    q([[0.5 * t + x, e + y, 0.5 * t + z], [-0.5 * t + x, e + y, 0.5 * t + z], [-0.5 * t + x, e + y, 0.3 * t + z], [0.5 * t + x, e + y, 0.3 * t + z]]);
    q([[0.5 * t + x, e + y, -0.5 * t + z], [-0.5 * t + x, e + y, -0.5 * t + z], [-0.5 * t + x, e + y, -0.3 * t + z], [0.5 * t + x, e + y, -0.3 * t + z]]);
    q([[-0.5 * t + x, e + y, 0.5 * t + z], [-0.3 * t + x, e + y, 0.5 * t + z], [-0.3 * t + x, e + y, -0.5 * t + z], [-0.5 * t + x, e + y, -0.5 * t + z]]);
    q([[0.5 * t + x, 0.5 * t + y, -e + z], [-0.5 * t + x, 0.5 * t + y, -e + z], [-0.5 * t + x, 0.3 * t + y, -e + z], [0.5 * t + x, 0.3 * t + y, -e + z]]);
    q([[0.5 * t + x, -0.5 * t + y, -e + z], [-0.5 * t + x, -0.5 * t + y, -e + z], [-0.5 * t + x, -0.3 * t + y, -e + z], [0.5 * t + x, -0.3 * t + y, -e + z]]);
    q([[0.5 * t + x, 0.5 * t + y, -e + z], [0.3 * t + x, 0.5 * t + y, -e + z], [0.3 * t + x, -0.5 * t + y, -e + z], [0.5 * t + x, -0.5 * t + y, -e + z]]);
    q([[0.5 * t + x, 0.5 * t + y, e + z], [-0.5 * t + x, 0.5 * t + y, e + z], [-0.5 * t + x, 0.3 * t + y, e + z], [0.5 * t + x, 0.3 * t + y, e + z]]);
    q([[0.5 * t + x, -0.5 * t + y, e + z], [-0.5 * t + x, -0.5 * t + y, e + z], [-0.5 * t + x, -0.3 * t + y, e + z], [0.5 * t + x, -0.3 * t + y, e + z]]);
    q([[-0.5 * t + x, 0.5 * t + y, e + z], [-0.3 * t + x, 0.5 * t + y, e + z], [-0.3 * t + x, -0.5 * t + y, e + z], [-0.5 * t + x, -0.5 * t + y, e + z]]);
    q([[-e + x, 0.5 * t + y, 0.5 * t + z], [-e + x, 0.5 * t + y, -0.5 * t + z], [-e + x, 0.3 * t + y, -0.5 * t + z], [-e + x, 0.3 * t + y, 0.5 * t + z]]);
    q([[-e + x, -0.5 * t + y, 0.5 * t + z], [-e + x, -0.5 * t + y, -0.5 * t + z], [-e + x, -0.3 * t + y, -0.5 * t + z], [-e + x, -0.3 * t + y, 0.5 * t + z]]);
    q([[-e + x, 0.5 * t + y, -0.5 * t + z], [-e + x, 0.5 * t + y, -0.3 * t + z], [-e + x, -0.5 * t + y, -0.3 * t + z], [-e + x, -0.5 * t + y, -0.5 * t + z]]);
    q([[e + x, 0.5 * t + y, 0.5 * t + z], [e + x, 0.5 * t + y, -0.5 * t + z], [e + x, 0.3 * t + y, -0.5 * t + z], [e + x, 0.3 * t + y, 0.5 * t + z]]);
    q([[e + x, -0.5 * t + y, 0.5 * t + z], [e + x, -0.5 * t + y, -0.5 * t + z], [e + x, -0.3 * t + y, -0.5 * t + z], [e + x, -0.3 * t + y, 0.5 * t + z]]);
    q([[e + x, 0.5 * t + y, 0.5 * t + z], [e + x, 0.5 * t + y, 0.3 * t + z], [e + x, -0.5 * t + y, 0.3 * t + z], [e + x, -0.5 * t + y, 0.5 * t + z]]);
    return true;
  }
  if (pic === 65) {
    // Self-destruct: same 3-orthogonal-rect pattern as time bombs (pic 56)
    lineStrip([[x, t + y, t + z], [x, -t + y, t + z], [x, -t + y, -t + z], [x, t + y, -t + z], [x, t + y, t + z]], lc);
    lineStrip([[t + x, y, t + z], [-t + x, y, t + z], [-t + x, y, -t + z], [t + x, y, -t + z], [t + x, y, t + z]], lc);
    lineStrip([[t + x, t + y, z], [-t + x, t + y, z], [-t + x, -t + y, z], [t + x, -t + y, z], [t + x, t + y, z]], lc);
    return true;
  }
  if (pic === 66) {
    lineStrip([[0.3 * t + x, -0.4 * t + y, -e + z], [0.3 * t + x, 0.2 * t + y, -e + z], [x, 0.4 * t + y, -e + z], [-0.3 * t + x, 0.2 * t + y, -e + z], [-0.3 * t + x, -0.4 * t + y, -e + z]], lc);
    lineStrip([[0.15 * t + x, 0.1 * t + y, -e + z], [0.05 * t + x, 0.1 * t + y, -e + z], [0.05 * t + x, -0.1 * t + y, -e + z]], lc);
    lines([[-0.05 * t + x, 0.1 * t + y, -e + z], [-0.15 * t + x, 0.1 * t + y, -e + z]], lc);
    lineStrip([[0.3 * t + x, -0.4 * t + y, e + z], [0.3 * t + x, 0.2 * t + y, e + z], [x, 0.4 * t + y, e + z], [-0.3 * t + x, 0.2 * t + y, e + z], [-0.3 * t + x, -0.4 * t + y, e + z]], lc);
    lineStrip([[-0.15 * t + x, 0.1 * t + y, e + z], [-0.05 * t + x, 0.1 * t + y, e + z], [-0.05 * t + x, -0.1 * t + y, e + z]], lc);
    lines([[0.05 * t + x, 0.1 * t + y, e + z], [0.15 * t + x, 0.1 * t + y, e + z]], lc);
    return true;
  }
  if (pic === 68) {
    lineStrip([[0.4 * t + x, 0.4 * t + y, e + z], [-0.4 * t + x, 0.4 * t + y, e + z], [-0.4 * t + x, -0.4 * t + y, e + z], [0.4 * t + x, -0.4 * t + y, e + z]], lc);
    lines([[x, 0.5 * t + y, e + z], [x, -0.5 * t + y, e + z]], lc);
    lineStrip([[0.4 * t + x, 0.4 * t + y, -e + z], [-0.4 * t + x, 0.4 * t + y, -e + z], [-0.4 * t + x, -0.4 * t + y, -e + z], [0.4 * t + x, -0.4 * t + y, -e + z]], lc);
    lines([[x, 0.5 * t + y, -e + z], [x, -0.5 * t + y, -e + z]], lc);
    return true;
  }
  if (pic === 69) {
    lines([
      [0.4 * t + x, 0.4 * t + y, e + z], [0.2 * t + x, 0.2 * t + y, e + z],
      [0.4 * t + x, -0.4 * t + y, e + z], [0.2 * t + x, -0.2 * t + y, e + z],
      [-0.4 * t + x, 0.4 * t + y, e + z], [-0.2 * t + x, 0.2 * t + y, e + z],
      [-0.4 * t + x, -0.4 * t + y, e + z], [-0.2 * t + x, -0.2 * t + y, e + z],
      [0.4 * t + x, 0.4 * t + y, -e + z], [0.2 * t + x, 0.2 * t + y, -e + z],
      [0.4 * t + x, -0.4 * t + y, -e + z], [0.2 * t + x, -0.2 * t + y, -e + z],
      [-0.4 * t + x, 0.4 * t + y, -e + z], [-0.2 * t + x, 0.2 * t + y, -e + z],
      [-0.4 * t + x, -0.4 * t + y, -e + z], [-0.2 * t + x, -0.2 * t + y, -e + z],
    ], lc);
    return true;
  }
  if (pic === 70) {
    lineStrip([[-0.2 * t + x, -0.4 * t + y, e + z], [-0.2 * t + x, 0.4 * t + y, e + z], [0.2 * t + x, -0.4 * t + y, e + z], [0.2 * t + x, 0.4 * t + y, e + z]], lc);
    lines([[0.5 * t + x, 0.5 * t + y, e + z], [-0.5 * t + x, -0.5 * t + y, e + z], [-0.5 * t + x, 0.5 * t + y, e + z], [0.5 * t + x, -0.5 * t + y, e + z]], lc);
    lineStrip([[-0.2 * t + x, -0.4 * t + y, -e + z], [-0.2 * t + x, 0.4 * t + y, -e + z], [0.2 * t + x, -0.4 * t + y, -e + z], [0.2 * t + x, 0.4 * t + y, -e + z]], lc);
    lines([[0.5 * t + x, 0.5 * t + y, -e + z], [-0.5 * t + x, -0.5 * t + y, -e + z], [-0.5 * t + x, 0.5 * t + y, -e + z], [0.5 * t + x, -0.5 * t + y, -e + z]], lc);
    return true;
  }
  if (pic === 94) {
    lines([[0.3 * t + x, 0.4 * t + y, -e + z], [-0.3 * t + x, 0.4 * t + y, -e + z], [x, 0.4 * t + y, -e + z], [x, 0.1 * t + y, -e + z]], lc);
    lineStrip([[-0.3 * t + x, 0.1 * t + y, -e + z], [-0.3 * t + x, -0.4 * t + y, -e + z], [0.3 * t + x, -0.4 * t + y, -e + z], [0.3 * t + x, 0.1 * t + y, -e + z], [-0.3 * t + x, 0.1 * t + y, -e + z]], lc);
    lines([[0.3 * t + x, 0.4 * t + y, e + z], [-0.3 * t + x, 0.4 * t + y, e + z], [x, 0.4 * t + y, e + z], [x, 0.1 * t + y, e + z]], lc);
    lineStrip([[-0.3 * t + x, 0.1 * t + y, e + z], [-0.3 * t + x, -0.4 * t + y, e + z], [0.3 * t + x, -0.4 * t + y, e + z], [0.3 * t + x, 0.1 * t + y, e + z], [-0.3 * t + x, 0.1 * t + y, e + z]], lc);
    return true;
  }
  if (pic === 61) {
    q([[0.3 * t + x, -e + y, 0.1 * t + z], [-0.3 * t + x, -e + y, 0.1 * t + z], [-0.3 * t + x, -e + y, -0.1 * t + z], [0.3 * t + x, -e + y, -0.1 * t + z]]);
    q([[-0.3 * t + x, e + y, 0.1 * t + z], [0.3 * t + x, e + y, 0.1 * t + z], [0.3 * t + x, e + y, -0.1 * t + z], [-0.3 * t + x, e + y, -0.1 * t + z]]);
    q([[0.3 * t + x, 0.1 * t + y, -e + z], [-0.3 * t + x, 0.1 * t + y, -e + z], [-0.3 * t + x, -0.1 * t + y, -e + z], [0.3 * t + x, -0.1 * t + y, -e + z]]);
    q([[0.3 * t + x, 0.1 * t + y, e + z], [-0.3 * t + x, 0.1 * t + y, e + z], [-0.3 * t + x, -0.1 * t + y, e + z], [0.3 * t + x, -0.1 * t + y, e + z]]);
    q([[-e + x, 0.1 * t + y, 0.3 * t + z], [-e + x, 0.1 * t + y, -0.3 * t + z], [-e + x, -0.1 * t + y, -0.3 * t + z], [-e + x, -0.1 * t + y, 0.3 * t + z]]);
    q([[e + x, 0.1 * t + y, 0.3 * t + z], [e + x, 0.1 * t + y, -0.3 * t + z], [e + x, -0.1 * t + y, -0.3 * t + z], [e + x, -0.1 * t + y, 0.3 * t + z]]);
    q([[0.1 * t + x, -e + y, 0.3 * t + z], [-0.1 * t + x, -e + y, 0.3 * t + z], [-0.1 * t + x, -e + y, -0.3 * t + z], [0.1 * t + x, -e + y, -0.3 * t + z]]);
    q([[-0.1 * t + x, e + y, 0.3 * t + z], [0.1 * t + x, e + y, 0.3 * t + z], [0.1 * t + x, e + y, -0.3 * t + z], [-0.1 * t + x, e + y, -0.3 * t + z]]);
    q([[0.1 * t + x, 0.3 * t + y, -e + z], [-0.1 * t + x, 0.3 * t + y, -e + z], [-0.1 * t + x, -0.3 * t + y, -e + z], [0.1 * t + x, -0.3 * t + y, -e + z]]);
    q([[0.1 * t + x, 0.3 * t + y, e + z], [-0.1 * t + x, 0.3 * t + y, e + z], [-0.1 * t + x, -0.3 * t + y, e + z], [0.1 * t + x, -0.3 * t + y, e + z]]);
    q([[-e + x, 0.3 * t + y, 0.1 * t + z], [-e + x, 0.3 * t + y, -0.1 * t + z], [-e + x, -0.3 * t + y, -0.1 * t + z], [-e + x, -0.3 * t + y, 0.1 * t + z]]);
    q([[e + x, 0.3 * t + y, 0.1 * t + z], [e + x, 0.3 * t + y, -0.1 * t + z], [e + x, -0.3 * t + y, -0.1 * t + z], [e + x, -0.3 * t + y, 0.1 * t + z]]);
    return true;
  }
  if (pic === 60) {
    q([[-0.8 * t + x, -e + y, 0.1 * t + z], [-0.4 * t + x, -e + y, 0.1 * t + z], [-0.4 * t + x, -e + y, -0.1 * t + z], [-0.8 * t + x, -e + y, -0.1 * t + z]]);
    q([[0.4 * t + x, -e + y, 0.1 * t + z], [0.8 * t + x, -e + y, 0.1 * t + z], [0.8 * t + x, -e + y, -0.1 * t + z], [0.4 * t + x, -e + y, -0.1 * t + z]]);
    q([[-0.8 * t + x, 0.1 * t + y, -e + z], [-0.4 * t + x, 0.1 * t + y, -e + z], [-0.4 * t + x, -0.1 * t + y, -e + z], [-0.8 * t + x, -0.1 * t + y, -e + z]]);
    q([[0.8 * t + x, 0.1 * t + y, -e + z], [0.4 * t + x, 0.1 * t + y, -e + z], [0.4 * t + x, -0.1 * t + y, -e + z], [0.8 * t + x, -0.1 * t + y, -e + z]]);
    q([[-e + x, 0.1 * t + y, -0.8 * t + z], [-e + x, 0.1 * t + y, -0.4 * t + z], [-e + x, -0.1 * t + y, -0.4 * t + z], [-e + x, -0.1 * t + y, -0.8 * t + z]]);
    q([[-e + x, 0.1 * t + y, 0.8 * t + z], [-e + x, 0.1 * t + y, 0.4 * t + z], [-e + x, -0.1 * t + y, 0.4 * t + z], [-e + x, -0.1 * t + y, 0.8 * t + z]]);
    q([[-0.8 * t + x, e + y, 0.1 * t + z], [-0.4 * t + x, e + y, 0.1 * t + z], [-0.4 * t + x, e + y, -0.1 * t + z], [-0.8 * t + x, e + y, -0.1 * t + z]]);
    q([[0.4 * t + x, e + y, 0.1 * t + z], [0.8 * t + x, e + y, 0.1 * t + z], [0.8 * t + x, e + y, -0.1 * t + z], [0.4 * t + x, e + y, -0.1 * t + z]]);
    q([[-0.8 * t + x, 0.1 * t + y, e + z], [-0.4 * t + x, 0.1 * t + y, e + z], [-0.4 * t + x, -0.1 * t + y, e + z], [-0.8 * t + x, -0.1 * t + y, e + z]]);
    q([[0.8 * t + x, 0.1 * t + y, e + z], [0.4 * t + x, 0.1 * t + y, e + z], [0.4 * t + x, -0.1 * t + y, e + z], [0.8 * t + x, -0.1 * t + y, e + z]]);
    q([[e + x, 0.1 * t + y, -0.8 * t + z], [e + x, 0.1 * t + y, -0.4 * t + z], [e + x, -0.1 * t + y, -0.4 * t + z], [e + x, -0.1 * t + y, -0.8 * t + z]]);
    q([[e + x, 0.1 * t + y, 0.8 * t + z], [e + x, 0.1 * t + y, 0.4 * t + z], [e + x, -0.1 * t + y, 0.4 * t + z], [e + x, -0.1 * t + y, 0.8 * t + z]]);
    q([[-0.2 * t + x, -e + y, 0.1 * t + z], [0.2 * t + x, -e + y, 0.1 * t + z], [0.2 * t + x, -e + y, -0.1 * t + z], [-0.2 * t + x, -e + y, -0.1 * t + z]]);
    q([[-0.2 * t + x, 0.1 * t + y, -e + z], [0.2 * t + x, 0.1 * t + y, -e + z], [0.2 * t + x, -0.1 * t + y, -e + z], [-0.2 * t + x, -0.1 * t + y, -e + z]]);
    q([[-e + x, 0.1 * t + y, -0.2 * t + z], [-e + x, 0.1 * t + y, 0.2 * t + z], [-e + x, -0.1 * t + y, 0.2 * t + z], [-e + x, -0.1 * t + y, -0.2 * t + z]]);
    q([[-0.2 * t + x, e + y, 0.1 * t + z], [0.2 * t + x, e + y, 0.1 * t + z], [0.2 * t + x, e + y, -0.1 * t + z], [-0.2 * t + x, e + y, -0.1 * t + z]]);
    q([[-0.2 * t + x, 0.1 * t + y, e + z], [0.2 * t + x, 0.1 * t + y, e + z], [0.2 * t + x, -0.1 * t + y, e + z], [-0.2 * t + x, -0.1 * t + y, e + z]]);
    q([[e + x, 0.1 * t + y, -0.2 * t + z], [e + x, 0.1 * t + y, 0.2 * t + z], [e + x, -0.1 * t + y, 0.2 * t + z], [e + x, -0.1 * t + y, -0.2 * t + z]]);
    return true;
  }
  if (pic === 52) {
    q([[-0.8 * t + x, -e + y, 0.1 * t + z], [-0.2 * t + x, -e + y, 0.1 * t + z], [-0.2 * t + x, -e + y, -0.1 * t + z], [-0.8 * t + x, -e + y, -0.1 * t + z]]);
    q([[0.2 * t + x, -e + y, 0.1 * t + z], [0.8 * t + x, -e + y, 0.1 * t + z], [0.8 * t + x, -e + y, -0.1 * t + z], [0.2 * t + x, -e + y, -0.1 * t + z]]);
    q([[-0.8 * t + x, 0.1 * t + y, -e + z], [-0.2 * t + x, 0.1 * t + y, -e + z], [-0.2 * t + x, -0.1 * t + y, -e + z], [-0.8 * t + x, -0.1 * t + y, -e + z]]);
    q([[0.8 * t + x, 0.1 * t + y, -e + z], [0.2 * t + x, 0.1 * t + y, -e + z], [0.2 * t + x, -0.1 * t + y, -e + z], [0.8 * t + x, -0.1 * t + y, -e + z]]);
    q([[-e + x, 0.1 * t + y, -0.8 * t + z], [-e + x, 0.1 * t + y, -0.2 * t + z], [-e + x, -0.1 * t + y, -0.2 * t + z], [-e + x, -0.1 * t + y, -0.8 * t + z]]);
    q([[-e + x, 0.1 * t + y, 0.8 * t + z], [-e + x, 0.1 * t + y, 0.2 * t + z], [-e + x, -0.1 * t + y, 0.2 * t + z], [-e + x, -0.1 * t + y, 0.8 * t + z]]);
    q([[-0.8 * t + x, e + y, 0.1 * t + z], [-0.2 * t + x, e + y, 0.1 * t + z], [-0.2 * t + x, e + y, -0.1 * t + z], [-0.8 * t + x, e + y, -0.1 * t + z]]);
    q([[0.2 * t + x, e + y, 0.1 * t + z], [0.8 * t + x, e + y, 0.1 * t + z], [0.8 * t + x, e + y, -0.1 * t + z], [0.2 * t + x, e + y, -0.1 * t + z]]);
    q([[-0.8 * t + x, 0.1 * t + y, e + z], [-0.2 * t + x, 0.1 * t + y, e + z], [-0.2 * t + x, -0.1 * t + y, e + z], [-0.8 * t + x, -0.1 * t + y, e + z]]);
    q([[0.8 * t + x, 0.1 * t + y, e + z], [0.2 * t + x, 0.1 * t + y, e + z], [0.2 * t + x, -0.1 * t + y, e + z], [0.8 * t + x, -0.1 * t + y, e + z]]);
    q([[e + x, 0.1 * t + y, -0.8 * t + z], [e + x, 0.1 * t + y, -0.2 * t + z], [e + x, -0.1 * t + y, -0.2 * t + z], [e + x, -0.1 * t + y, -0.8 * t + z]]);
    q([[e + x, 0.1 * t + y, 0.8 * t + z], [e + x, 0.1 * t + y, 0.2 * t + z], [e + x, -0.1 * t + y, 0.2 * t + z], [e + x, -0.1 * t + y, 0.8 * t + z]]);
    return true;
  }
  if (pic === 53) {
    q([[-0.8 * t + x, -e + y, 0.1 * t + z], [-0.2 * t + x, -e + y, 0.1 * t + z], [-0.2 * t + x, -e + y, -0.1 * t + z], [-0.8 * t + x, -e + y, -0.1 * t + z]]);
    q([[0.2 * t + x, -e + y, 0.1 * t + z], [0.8 * t + x, -e + y, 0.1 * t + z], [0.8 * t + x, -e + y, -0.1 * t + z], [0.2 * t + x, -e + y, -0.1 * t + z]]);
    q([[-0.8 * t + x, 0.1 * t + y, -e + z], [-0.2 * t + x, 0.1 * t + y, -e + z], [-0.2 * t + x, -0.1 * t + y, -e + z], [-0.8 * t + x, -0.1 * t + y, -e + z]]);
    q([[0.8 * t + x, 0.1 * t + y, -e + z], [0.2 * t + x, 0.1 * t + y, -e + z], [0.2 * t + x, -0.1 * t + y, -e + z], [0.8 * t + x, -0.1 * t + y, -e + z]]);
    q([[-e + x, 0.1 * t + y, -0.8 * t + z], [-e + x, 0.1 * t + y, -0.2 * t + z], [-e + x, -0.1 * t + y, -0.2 * t + z], [-e + x, -0.1 * t + y, -0.8 * t + z]]);
    q([[-e + x, 0.1 * t + y, 0.8 * t + z], [-e + x, 0.1 * t + y, 0.2 * t + z], [-e + x, -0.1 * t + y, 0.2 * t + z], [-e + x, -0.1 * t + y, 0.8 * t + z]]);
    q([[-0.8 * t + x, e + y, 0.1 * t + z], [-0.2 * t + x, e + y, 0.1 * t + z], [-0.2 * t + x, e + y, -0.1 * t + z], [-0.8 * t + x, e + y, -0.1 * t + z]]);
    q([[0.2 * t + x, e + y, 0.1 * t + z], [0.8 * t + x, e + y, 0.1 * t + z], [0.8 * t + x, e + y, -0.1 * t + z], [0.2 * t + x, e + y, -0.1 * t + z]]);
    q([[-0.8 * t + x, 0.1 * t + y, e + z], [-0.2 * t + x, 0.1 * t + y, e + z], [-0.2 * t + x, -0.1 * t + y, e + z], [-0.8 * t + x, -0.1 * t + y, e + z]]);
    q([[0.8 * t + x, 0.1 * t + y, e + z], [0.2 * t + x, 0.1 * t + y, e + z], [0.2 * t + x, -0.1 * t + y, e + z], [0.8 * t + x, -0.1 * t + y, e + z]]);
    q([[e + x, 0.1 * t + y, -0.8 * t + z], [e + x, 0.1 * t + y, -0.2 * t + z], [e + x, -0.1 * t + y, -0.2 * t + z], [e + x, -0.1 * t + y, -0.8 * t + z]]);
    q([[e + x, 0.1 * t + y, 0.8 * t + z], [e + x, 0.1 * t + y, 0.2 * t + z], [e + x, -0.1 * t + y, 0.2 * t + z], [e + x, -0.1 * t + y, 0.8 * t + z]]);
    q([[-0.6 * t + x, -e + y, 0.3 * t + z], [-0.4 * t + x, -e + y, 0.3 * t + z], [-0.4 * t + x, -e + y, -0.3 * t + z], [-0.6 * t + x, -e + y, -0.3 * t + z]]);
    q([[0.4 * t + x, -e + y, 0.3 * t + z], [0.6 * t + x, -e + y, 0.3 * t + z], [0.6 * t + x, -e + y, -0.3 * t + z], [0.4 * t + x, -e + y, -0.3 * t + z]]);
    q([[-0.6 * t + x, 0.3 * t + y, -e + z], [-0.4 * t + x, 0.3 * t + y, -e + z], [-0.4 * t + x, -0.3 * t + y, -e + z], [-0.6 * t + x, -0.3 * t + y, -e + z]]);
    q([[0.6 * t + x, 0.3 * t + y, -e + z], [0.4 * t + x, 0.3 * t + y, -e + z], [0.4 * t + x, -0.3 * t + y, -e + z], [0.6 * t + x, -0.3 * t + y, -e + z]]);
    q([[-e + x, 0.3 * t + y, -0.6 * t + z], [-e + x, 0.3 * t + y, -0.4 * t + z], [-e + x, -0.3 * t + y, -0.4 * t + z], [-e + x, -0.3 * t + y, -0.6 * t + z]]);
    q([[-e + x, 0.3 * t + y, 0.6 * t + z], [-e + x, 0.3 * t + y, 0.4 * t + z], [-e + x, -0.3 * t + y, 0.4 * t + z], [-e + x, -0.3 * t + y, 0.6 * t + z]]);
    q([[-0.6 * t + x, e + y, 0.3 * t + z], [-0.4 * t + x, e + y, 0.3 * t + z], [-0.4 * t + x, e + y, -0.3 * t + z], [-0.6 * t + x, e + y, -0.3 * t + z]]);
    q([[0.4 * t + x, e + y, 0.3 * t + z], [0.6 * t + x, e + y, 0.3 * t + z], [0.6 * t + x, e + y, -0.3 * t + z], [0.4 * t + x, e + y, -0.3 * t + z]]);
    q([[-0.6 * t + x, 0.3 * t + y, e + z], [-0.4 * t + x, 0.3 * t + y, e + z], [-0.4 * t + x, -0.3 * t + y, e + z], [-0.6 * t + x, -0.3 * t + y, e + z]]);
    q([[0.6 * t + x, 0.3 * t + y, e + z], [0.4 * t + x, 0.3 * t + y, e + z], [0.4 * t + x, -0.3 * t + y, e + z], [0.6 * t + x, -0.3 * t + y, e + z]]);
    q([[e + x, 0.3 * t + y, -0.6 * t + z], [e + x, 0.3 * t + y, -0.4 * t + z], [e + x, -0.3 * t + y, -0.4 * t + z], [e + x, -0.3 * t + y, -0.6 * t + z]]);
    q([[e + x, 0.3 * t + y, 0.6 * t + z], [e + x, 0.3 * t + y, 0.4 * t + z], [e + x, -0.3 * t + y, 0.4 * t + z], [e + x, -0.3 * t + y, 0.6 * t + z]]);
    return true;
  }
  if (pic === 67) {
    specialColor = [1, 1, 1, 0.8];
    const faces = [
      [[0.4*t+x, -e+y, -0.8*t+z], [0.4*t+x, -e+y, 0.8*t+z]],
      [[-0.2*t+x, -e+y, -0.8*t+z], [-0.7*t+x, -e+y, -0.3*t+z], [-0.7*t+x, -e+y, 0.3*t+z], [-0.2*t+x, -e+y, 0.8*t+z]],
      [[0.4*t+x, e+y, -0.8*t+z], [0.4*t+x, e+y, 0.8*t+z]],
      [[-0.2*t+x, e+y, -0.8*t+z], [-0.7*t+x, e+y, -0.3*t+z], [-0.7*t+x, e+y, 0.3*t+z], [-0.2*t+x, e+y, 0.8*t+z]],
      [[0.4*t+x, -0.8*t+y, -e+z], [0.4*t+x, 0.8*t+y, -e+z]],
      [[-0.2*t+x, -0.8*t+y, -e+z], [-0.7*t+x, -0.3*t+y, -e+z], [-0.7*t+x, 0.3*t+y, -e+z], [-0.2*t+x, 0.8*t+y, -e+z]],
    ];
    for (let i = 0; i < faces.length; i += 2) {
      lineStrip(faces[i], specialColor);
      lineStrip(faces[i+1], specialColor);
    }
    return true;
  }
  if (pic === 8 && (val & 255) === 200) {
    specialColor = [1, 1, 1, 0.8];
    lineStrip([[0.4*t+x, -0.8*t+y, e+z], [0.4*t+x, 0.8*t+y, e+z]], specialColor);
    lineStrip([[-0.2*t+x, -0.8*t+y, e+z], [-0.7*t+x, -0.3*t+y, e+z], [-0.7*t+x, 0.3*t+y, e+z], [-0.2*t+x, 0.8*t+y, e+z]], specialColor);
    lineStrip([[0.4*t+x, -0.8*t+y, -e+z], [0.4*t+x, 0.8*t+y, -e+z]], specialColor);
    lineStrip([[-0.2*t+x, -0.8*t+y, -e+z], [-0.7*t+x, -0.3*t+y, -e+z], [-0.7*t+x, 0.3*t+y, -e+z], [-0.2*t+x, 0.8*t+y, -e+z]], specialColor);
    return true;
  }
  return false;
}

// W-depth rainbow color: w=0 red, w=3 green, w=6 blue
function depthColorFromW(gridW) {
  const t = Math.max(0, Math.min(1, gridW / 6)); // 0..1
  let r, g, b;
  if (t < 0.333) {
    // red → yellow (r=1, g rises)
    const f = t / 0.333;
    r = 1; g = f; b = 0;
  } else if (t < 0.667) {
    // yellow → green → cyan (r falls, g=1, b rises)
    const f = (t - 0.333) / 0.334;
    r = 1 - f; g = 1; b = f * 0.5;
  } else {
    // cyan → blue (r=0, g falls, b=1)
    const f = (t - 0.667) / 0.333;
    r = 0; g = 1 - f; b = 0.5 + f * 0.5;
  }
  return [r, g, b, 0.6];
}

// Draw body only (tesseract or wireframe) — used in pass 1
function drawBlockBody(gridX, gridY, gridZ, gridW, value, scale) {
  const { pic, color } = decodeBlockVisual(value);
  const x = (gridX - 3) * 2 * scale;
  const z = (gridY - 3) * 2 * scale;
  const y = (gridZ - 4.5) * 2 * scale;
  const w = (gridW - 3) * 2 * scale;
  const base = state.depthColor ? depthColorFromW(gridW) : color;
  if (pic === 95) {
    renderer.lineWidth(1.4);
    const v = [];
    for (let i = 0; i < 16; i++) {
      v[i] = p4(x + ((i & 8) ? scale : -scale), y + ((i & 4) ? scale : -scale), z + ((i & 2) ? scale : -scale), w + ((i & 1) ? scale : -scale));
    }
    const edge = (a, b) => { lines([v[a], v[b]], base); };
    for (let i = 0; i < 16; i++) { if (!(i & 1)) edge(i, i | 1); }
    for (let i = 0; i < 16; i++) { if (!(i & 2)) edge(i, i | 2); }
    for (let i = 0; i < 16; i++) { if (!(i & 4)) edge(i, i | 4); }
    for (let i = 0; i < 16; i++) { if (!(i & 8)) edge(i, i | 8); }
    return;
  }
  drawTesseract(x, y, z, w, scale, base);
}

// Draw decoration only — used in pass 2 (depth test off)
function drawBlockDecor(gridX, gridY, gridZ, gridW, value, scale) {
  const { pic, color } = decodeBlockVisual(value);
  if (pic === 95) return; // wireframe has no decoration
  const x = (gridX - 3) * 2 * scale;
  const z = (gridY - 3) * 2 * scale;
  const y = (gridZ - 4.5) * 2 * scale;
  const w = (gridW - 3) * 2 * scale;
  const base = state.depthColor ? depthColorFromW(gridW) : color;
  drawSpecialPic4D(pic, x, y, z, w, scale, base, value);
}

// Combined draw for non-batched contexts (preview, items etc.)
function drawBlockVisual(gridX, gridY, gridZ, gridW, value, scale, highlight = false) {
  drawBlockBody(gridX, gridY, gridZ, gridW, value, scale);
  const { pic } = decodeBlockVisual(value);
  if (pic !== 95) {
    const gl = renderer.gl;
    gl.disable(gl.DEPTH_TEST);
    renderer.lineWidth(1.4);
    drawBlockDecor(gridX, gridY, gridZ, gridW, value, scale);
    renderer.lineWidth(1.4);
    gl.enable(gl.DEPTH_TEST);
  }
}

function updateControlOrientation() {
  const d1x2 = Math.cos(state.wAngleY / TR) * Math.cos(state.wAngleZ / TR);
  const d1y2 = Math.cos(state.wAngleZ / TR) * Math.sin(state.wAngleX / TR) * Math.sin(state.wAngleY / TR) + Math.cos(state.wAngleX / TR) * Math.sin(state.wAngleZ / TR);
  const d2x2 = Math.sin(state.wAngleY / TR);
  const d2y2 = -Math.cos(state.wAngleY / TR) * Math.sin(state.wAngleX / TR);
  let r1 = Number.POSITIVE_INFINITY;
  let r2 = Number.POSITIVE_INFINITY;
  if (d1x2 * d1x2 + d1y2 * d1y2 > 0.0001) r1 = Math.atan2(d1y2, d1x2);
  if (d2x2 * d2x2 + d2y2 * d2y2 > 0.0001) r2 = Math.atan2(d2y2, d2x2);
  if (!Number.isFinite(r1)) r1 = r2 - PI / 2;
  if (!Number.isFinite(r2)) r2 = r1 - PI / 2;
  if (r1 > r2 && r1 - r2 > PI) r2 += 2 * PI;
  if (r1 < r2 && r2 - r1 > PI) r1 += 2 * PI;
  if (r1 > r2) {
    state.r1o = (r1 + r2) / 2 + PI / 4;
    state.r2o = (r1 + r2) / 2 - PI / 4;
  } else {
    state.r1o = (r1 + r2) / 2 - PI / 4;
    state.r2o = (r1 + r2) / 2 + PI / 4;
  }
}

// Build combined 3D rotation matrix from YZ/XZ/XY plane angles (column-major)
// Replaces rotatef(wAngleX,1,0,0) * rotatef(wAngleY,0,1,0) * rotatef(wAngleZ,0,0,1)
// Pre-allocated matrix buffers (avoid per-frame Float32Array allocation)
const _viewRotBuf = new Float32Array(16);
const _zRotBuf = new Float32Array(16);
let _cachedViewRotAngles = { x: NaN, y: NaN, z: NaN };
let _cachedZRotAngle = NaN;

function buildViewRotationMatrix() {
  // Return cached matrix if angles unchanged this frame
  if (state.wAngleX === _cachedViewRotAngles.x &&
      state.wAngleY === _cachedViewRotAngles.y &&
      state.wAngleZ === _cachedViewRotAngles.z) {
    return _viewRotBuf;
  }
  _cachedViewRotAngles.x = state.wAngleX;
  _cachedViewRotAngles.y = state.wAngleY;
  _cachedViewRotAngles.z = state.wAngleZ;
  const a1 = state.wAngleX * Math.PI / 180;
  const a2 = state.wAngleY * Math.PI / 180;
  const a3 = state.wAngleZ * Math.PI / 180;
  const c1 = Math.cos(a1), s1 = Math.sin(a1);
  const c2 = Math.cos(a2), s2 = Math.sin(a2);
  const c3 = Math.cos(a3), s3 = Math.sin(a3);
  const m = _viewRotBuf;
  m[0] = c2*c3;       m[1] = s1*s2*c3+c1*s3;  m[2] = -c1*s2*c3+s1*s3; m[3] = 0;
  m[4] = -c2*s3;      m[5] = -s1*s2*s3+c1*c3; m[6] = c1*s2*s3+s1*c3;  m[7] = 0;
  m[8] = s2;          m[9] = -s1*c2;           m[10] = c1*c2;           m[11] = 0;
  m[12] = 0;          m[13] = 0;               m[14] = 0;               m[15] = 1;
  return _viewRotBuf;
}

// Build Z-axis rotation matrix from radians (column-major), cached
function buildZRotMatrix(angleRad) {
  if (angleRad === _cachedZRotAngle) return _zRotBuf;
  _cachedZRotAngle = angleRad;
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  const m = _zRotBuf;
  m[0]=c; m[1]=s; m[2]=0; m[3]=0; m[4]=-s; m[5]=c; m[6]=0; m[7]=0;
  m[8]=0; m[9]=0; m[10]=1; m[11]=0; m[12]=0; m[13]=0; m[14]=0; m[15]=1;
  return _zRotBuf;
}

// Cached trig values for p4 — updated once per frame via updateP4Cache()
let _p4_cxw = 1, _p4_sxw = 0, _p4_cyw = 1, _p4_syw = 0;

function updateP4Cache() {
  const axw = state.wAngleXW * Math.PI / 180;
  _p4_cxw = Math.cos(axw);
  _p4_sxw = Math.sin(axw);
  const ayw = state.wAngleYW * Math.PI / 180;
  _p4_cyw = Math.cos(ayw);
  _p4_syw = Math.sin(ayw);
}

// 4D GL-space point → projected 3D GL-space point
// Applies XW/YW rotation then orthographic W projection
// Uses cached trig values (call updateP4Cache() once per frame)
function p4(x, y, z, w) {
  // XW rotation (GL_x ↔ GL_w)
  const nx = x * _p4_cxw - w * _p4_sxw;
  let dw = x * _p4_sxw + w * _p4_cxw;
  // YW rotation (GL_z ↔ GL_w, since game_y = GL_z)
  const nz = z * _p4_cyw - dw * _p4_syw;
  dw = z * _p4_syw + dw * _p4_cyw;
  return [nx + dw * 0.15, y, nz + dw * 0.15];
}

// 4D->3D projection for game-grid coordinates (uses cached trig from updateP4Cache)
function project4Dto3D(x4, y4, z4, w4) {
  let dx = x4 - 3, dy = y4 - 3, dw = w4 - 3;
  // XW rotation (cached)
  const dx2 = dx * _p4_cxw - dw * _p4_sxw;
  let dw2 = dx * _p4_sxw + dw * _p4_cxw;
  // YW rotation (cached)
  const dy2 = dy * _p4_cyw - dw2 * _p4_syw;
  dw2 = dy * _p4_syw + dw2 * _p4_cyw;
  return { x: 3 + dx2 + dw2 * 0.15, y: 3 + dy2 + dw2 * 0.15, z: z4 };
}

function drawBoardAndBlocks() {
  const t2 = state.t2;

  // captureMode: skip board outline, only draw blocks
  if (!state.captureMode) {
  const floorY = -9.95 * t2 + state.floorz * 2 * t2;
  const floorFillTop = -9.975 * t2 + state.floorz * 2 * t2;
  const floorFillBottom = -10.025 * t2 + state.floorz * 2 * t2;
  const floorY2 = -10.05 * t2 + state.floorz * 2 * t2;

  const s7 = 7 * t2, s5 = 5 * t2, s3 = 3 * t2;

  // Floor fill quads — only at w=0
  fillQuad(p4(-s7, floorFillTop, -s7, 0), p4(s7, floorFillTop, -s7, 0), p4(s7, floorFillTop, s7, 0), p4(-s7, floorFillTop, s7, 0), [0.7, 0.7, 0.7, 1]);
  fillQuad(p4(-s7, floorFillBottom, -s7, 0), p4(s7, floorFillBottom, -s7, 0), p4(s7, floorFillBottom, s7, 0), p4(-s7, floorFillBottom, s7, 0), [0.7, 0.7, 0.7, 1]);

  // Helper: draw 12 edges of (x,y,w) cube at fixed z-height h, half-size s
  // Uses reusable vertex buffer to avoid allocating 24 arrays per call
  const _ceVerts = Array.from({ length: 24 }, () => [0, 0, 0]);
  function drawCubeEdges(h, s) {
    // Compute all 8 corner points (±s, h, ±s, ±s) — reuse across 3 edges each
    // Corners: [x_sign, z_sign, w_sign] → index 0..7
    // bit0=w_sign, bit1=z_sign, bit2=x_sign (0=negative, 1=positive)
    const ns = -s;
    const c0 = p4(ns, h, ns, ns); // ---
    const c1 = p4(ns, h, ns,  s); // --+
    const c2 = p4(ns, h,  s, ns); // -+-
    const c3 = p4(ns, h,  s,  s); // -++
    const c4 = p4( s, h, ns, ns); // +--
    const c5 = p4( s, h, ns,  s); // +-+
    const c6 = p4( s, h,  s, ns); // ++-
    const c7 = p4( s, h,  s,  s); // +++
    // 4 w-lines (flip w: bit0)
    _ceVerts[0] = c0; _ceVerts[1] = c1;   // --- to --+
    _ceVerts[2] = c2; _ceVerts[3] = c3;   // -+- to -++
    _ceVerts[4] = c4; _ceVerts[5] = c5;   // +-- to +-+
    _ceVerts[6] = c6; _ceVerts[7] = c7;   // ++- to +++
    // 4 z-lines (flip z: bit1)
    _ceVerts[8] = c0; _ceVerts[9] = c2;   // --- to -+-
    _ceVerts[10] = c1; _ceVerts[11] = c3;  // --+ to -++
    _ceVerts[12] = c4; _ceVerts[13] = c6;  // +-- to ++-
    _ceVerts[14] = c5; _ceVerts[15] = c7;  // +-+ to +++
    // 4 x-lines (flip x: bit2)
    _ceVerts[16] = c0; _ceVerts[17] = c4;  // --- to +--
    _ceVerts[18] = c1; _ceVerts[19] = c5;  // --+ to +-+
    _ceVerts[20] = c2; _ceVerts[21] = c6;  // -+- to ++-
    _ceVerts[22] = c3; _ceVerts[23] = c7;  // -++ to +++
    lines(_ceVerts);
  }

  // Floor levels: 3 concentric (x,y,w) cubes (±7, ±5, ±3) × 12 edges each
  drawCubeEdges(floorY, s7); drawCubeEdges(floorY, s5); drawCubeEdges(floorY, s3);
  drawCubeEdges(floorY2, s7); drawCubeEdges(floorY2, s5); drawCubeEdges(floorY2, s3);

  // Bottom grid when floorz=0: 3 concentric cubes
  if (state.floorz === 0) {
    const bY = -9.95 * t2;
    drawCubeEdges(bY, s7); drawCubeEdges(bY, s5); drawCubeEdges(bY, s3);
  }

  // Top band: outer cube only
  drawCubeEdges(6 * t2, s7);

  // Vertical pillars: 8 tesseract edges (x=±7, z=±7, w=±7)
  // Center of 8 vertices = (0,0,0) = rotation center
  for (const wx of [-s7, s7]) {
    lines([
      p4(-s7, floorY2, -s7, wx), p4(-s7, 6 * t2, -s7, wx),
      p4( s7, floorY2, -s7, wx), p4( s7, 6 * t2, -s7, wx),
      p4(-s7, floorY2,  s7, wx), p4(-s7, 6 * t2,  s7, wx),
      p4( s7, floorY2,  s7, wx), p4( s7, 6 * t2,  s7, wx),
      p4(-s7, 15 * t2, -s7, wx), p4(-s7, 6 * t2, -s7, wx),
      p4( s7, 15 * t2, -s7, wx), p4( s7, 6 * t2, -s7, wx),
      p4(-s7, 15 * t2,  s7, wx), p4(-s7, 6 * t2,  s7, wx),
      p4( s7, 15 * t2,  s7, wx), p4( s7, 6 * t2,  s7, wx),
    ]);
  }
  } // end if (!state.captureMode)

  // Pass 1: Draw all block bodies (depth test on, batched)
  renderer.beginBatch();
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 26; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        const value = state.blk[x][y][z][w];
        if (!value) continue;
        drawBlockBody(x, y, z, w, value, t2);
        }
      }
    }
  }
  if (!state.hideblock) {
    for (let x = 0; x < 7; x += 1) {
      for (let y = 0; y < 7; y += 1) {
        for (let z = 0; z < 7; z += 1) {
          for (let w = 0; w < 7; w += 1) {
          const value = state.nowblock[x][y][z][w];
          if (!value) continue;
          drawBlockBody(
            x + state.blockpos[0], y + state.blockpos[1],
            z + state.blockpos[2], w + state.blockpos[3],
            value, t2);
          }
        }
      }
    }
  }
  renderer.endBatch();

  // Pass 2: Draw all decorations (depth test off, batched)
  const gl2 = renderer.gl;
  gl2.disable(gl2.DEPTH_TEST);
  renderer.lineWidth(1.4);
  renderer.beginBatch();
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 26; z += 1) {
        for (let w = 0; w < 7; w += 1) {
        const value = state.blk[x][y][z][w];
        if (!value) continue;
        drawBlockDecor(x, y, z, w, value, t2);
        }
      }
    }
  }
  if (!state.hideblock) {
    for (let x = 0; x < 7; x += 1) {
      for (let y = 0; y < 7; y += 1) {
        for (let z = 0; z < 7; z += 1) {
          for (let w = 0; w < 7; w += 1) {
          const value = state.nowblock[x][y][z][w];
          if (!value) continue;
          drawBlockDecor(
            x + state.blockpos[0], y + state.blockpos[1],
            z + state.blockpos[2], w + state.blockpos[3],
            value, t2);
          }
        }
      }
    }
  }
  renderer.endBatch();
  renderer.lineWidth(1.4);
  gl2.enable(gl2.DEPTH_TEST);
}

function getActiveItemCodes4d() {
  const codes = new Set();
  for (let x = 0; x < 7; x++) {
    for (let y = 0; y < 7; y++) {
      for (let z = 0; z < 26; z++) {
        for (let w = 0; w < 7; w++) {
          const v = state.blk[x][y][z][w];
          if (v !== 0 && ITEM_DESC[v & 255]) codes.add(v & 255);
        }
      }
    }
  }
  const pieces = [state.nowblock, state.nextblock, state.holdblock];
  for (const blk of pieces) {
    if (!blk) continue;
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) {
        for (let z = 0; z < 7; z++) {
          for (let w = 0; w < 7; w++) {
            const v = blk[x][y][z][w];
            if (v !== 0 && ITEM_DESC[v & 255]) codes.add(v & 255);
          }
        }
      }
    }
  }
  return Array.from(codes).sort((a, b) => a - b);
}

function itemCodeToColor(code) {
  let pic = code ^ 64;
  const R = pic >> 4, G = (pic >> 2) & 3, B = pic & 3;
  const r = Math.floor((R + 0.6) / 4.8 * 255 * 1.4);
  const g = Math.floor((G + 0.8) / 4.4 * 255 * 1.4);
  const b = Math.floor((B + 0.8) / 4.4 * 255 * 1.4);
  return `rgb(${Math.min(255,r)},${Math.min(255,g)},${Math.min(255,b)})`;
}

function getItemInfoCode() {
  if (!itemsEnabled) return -1;
  const codes = getActiveItemCodes4d();
  if (codes.length === 0) { state.itemInfoIndex = 0; return -1; }
  const now = Date.now();
  if (now - state.itemInfoLastSwitch > 1000) {
    state.itemInfoIndex = (state.itemInfoIndex + 1) % codes.length;
    state.itemInfoLastSwitch = now;
  }
  if (state.itemInfoIndex >= codes.length) state.itemInfoIndex = 0;
  return codes[state.itemInfoIndex];
}

function overlayToPixel(ox, oy) {
  const w = state.activitysizex, h = state.activitysizey;
  const eyeX = ox * 1.8, eyeY = oy * 1.8 - 0.2;
  const ndcX = eyeX / 1.5, ndcY = eyeY / (1.5 * h / w);
  const px = (ndcX + 1) / 2 * w;
  const py = h - ((ndcY + 1) / 2 * (h * 41 / 40) + h / 40);
  return [px, py];
}

const ITEM_OX = -0.58, ITEM_OY = -0.55;
const ITEM_SCALE = 0.04;

function drawItemInfoBlock(code) {
  if (code < 0) return;
  renderer.pushMatrix();
  renderer.translatef(ITEM_OX, ITEM_OY, 0);
  renderer.multMatrixf(buildViewRotationMatrix());
  drawBlockVisual(3, 3, 4.5, 3, code, ITEM_SCALE, false);
  renderer.popMatrix();
}

function drawItemInfo3d(code) {
  ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (code < 0) return;
  const desc = ITEM_DESC[code] || '';
  const cw = overlayCanvas.width, ch = overlayCanvas.height;
  const [bx, by] = overlayToPixel(ITEM_OX, ITEM_OY);
  const blockHalf = ITEM_SCALE * 1.8 / 1.5 * cw / 2;
  const textX = bx + blockHalf + 6;
  const fontSize = Math.max(8, Math.floor(Math.min(ch * 0.025, cw * 0.035)));
  ctx2d.save();
  ctx2d.font = `bold ${fontSize}px sans-serif`;
  ctx2d.fillStyle = ITEM_GOOD.has(code) ? '#0ff' : '#f90';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(desc, textX, by, cw * 0.7);
  ctx2d.restore();
}

function drawScene3d() {
  updateP4Cache();
  const gl = renderer.gl;
  renderer.lineWidth(1.4);
  renderer.matrixMode("MODELVIEW");
  renderer.loadIdentity();
  renderer.clearColor(0, 0, 0, 0);
  renderer.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // Now enable blending for transparent 4D blocks
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  renderer.viewport(0, state.activitysizey / 40, state.activitysizex, (state.activitysizey * 41) / 40);
  renderer.loadIdentity();
  renderer.translatef(state.centerx - 0.6, state.centery, -4);
  renderer.multMatrixf(buildViewRotationMatrix());
  drawBoardAndBlocks();
  if (!state.captureMode) {
    updateControlOrientation();
    renderer.viewport(0, state.activitysizey / 40, state.activitysizex, (state.activitysizey * 41) / 40);
    renderer.loadIdentity();
    renderer.translatef(0, -0.2, -4);
    renderer.scalef(1.8, 1.8, 1.8);
    drawGraphOverlay();
    drawControlOverlay();
    const _itemCode = getItemInfoCode();
    drawItemInfoBlock(_itemCode);
    // Background texture
    renderer.viewport(0, 0, state.activitysizex, state.activitysizey);
    renderer.loadIdentity();
    renderer.translatef(0, 0, -4);
    drawTexture(1, [-10, 20, -9.9, -10, -20, -9.9, 10, -20, -9.9, 10, 20, -9.9], [0.4, 0.4, 0.4, 1], true);
    drawItemInfo3d(_itemCode);
    // XYZ/XYW button label via ctx2d
    const cw = overlayCanvas.width, ch = overlayCanvas.height;
    const [rbx, rby] = overlayToPixel(0.03, -0.70);
    const rfs = Math.max(8, Math.floor(cw * 0.035));
    ctx2d.save();
    ctx2d.font = `bold ${rfs}px monospace`;
    ctx2d.fillStyle = state.rotMode4D ? '#f55' : '#800';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(state.rotMode4D ? 'XYW' : 'XYZ', rbx, rby);
    ctx2d.restore();
  }
  gl.disable(gl.BLEND);
}

function drawMenuButtonBoxes() {
  lineStrip([[-0.55, -1.37], [0.55, -1.37], [0.55, -1.07], [-0.55, -1.07], [-0.55, -1.37]]);
  lineStrip([[-0.55, -0.95], [0.55, -0.95], [0.55, -0.65], [-0.55, -0.65], [-0.55, -0.95]]);
}

function drawExactMenuWord(word) {
  const c = [1, 1, 1, 1];
  if (word === "main") {
    let xt = -0.35;
    const yt = -1.2;
    lineStrip([[xt, yt - 0.1, 0], [xt, yt + 0.1, 0], [xt + 0.05, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt - 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    lines([[xt + 0.025, yt, 0], [xt + 0.075, yt, 0]], c);
    xt += 0.2;
    lines([[xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.05, yt - 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt - 0.1, 0], [xt, yt + 0.1, 0], [xt + 0.1, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0]], c);
    return;
  }
  if (word === "start") {
    let xt = -0.45;
    const yt = -0.8;
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt, 0], [xt + 0.1, yt, 0], [xt + 0.1, yt - 0.1, 0], [xt, yt - 0.1, 0]], c);
    xt += 0.2;
    lines([[xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.05, yt - 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt - 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    lines([[xt + 0.025, yt, 0], [xt + 0.075, yt, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt - 0.1, 0], [xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.1, yt, 0], [xt, yt, 0], [xt + 0.1, yt - 0.1, 0]], c);
    xt += 0.2;
    lines([[xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.05, yt - 0.1, 0]], c);
    return;
  }
  if (word === "retry") {
    let xt = -0.45;
    const yt = -0.8;
    // r
    lineStrip([[xt, yt - 0.1, 0], [xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.1, yt, 0], [xt, yt, 0], [xt + 0.1, yt - 0.1, 0]], c);
    xt += 0.2;
    // e
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    lines([[xt, yt, 0], [xt + 0.1, yt, 0]], c);
    xt += 0.2;
    // t
    lines([[xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.05, yt - 0.1, 0]], c);
    xt += 0.2;
    // r
    lineStrip([[xt, yt - 0.1, 0], [xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.1, yt, 0], [xt, yt, 0], [xt + 0.1, yt - 0.1, 0]], c);
    xt += 0.2;
    // y
    lineStrip([[xt, yt + 0.1, 0], [xt + 0.05, yt + 0.04, 0], [xt + 0.1, yt + 0.1, 0]], c);
    lines([[xt + 0.05, yt + 0.04, 0], [xt + 0.05, yt - 0.1, 0]], c);
    return;
  }
  if (word === "about") {
    let xt = -0.45;
    const yt = -1.22;
    lineStrip([[xt, yt - 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    lines([[xt + 0.025, yt, 0], [xt + 0.075, yt, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.07, yt - 0.1, 0], [xt + 0.1, yt - 0.05, 0], [xt + 0.07, yt, 0], [xt + 0.1, yt + 0.05, 0], [xt + 0.07, yt + 0.1, 0], [xt, yt + 0.1, 0]], c);
    lines([[xt, yt, 0], [xt + 0.07, yt, 0]], c);
    xt += 0.2;
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0]], c);
    xt += 0.2;
    lines([[xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.05, yt - 0.1, 0]], c);
    return;
  }
  if (word === "polytesseract") {
    const yt = 1.8;
    drawWord(-1.1, yt, 0.12, "polytesseract", c, 1.4);
    return;
  }
  if (word === "gameover") {
    let xt = -0.8;
    const yt = 0.5;
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0], [xt + 0.1, yt, 0], [xt + 0.05, yt, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt - 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    lines([[xt + 0.025, yt, 0], [xt + 0.075, yt, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt - 0.1, 0], [xt, yt + 0.1, 0], [xt + 0.05, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    lines([[xt, yt, 0], [xt + 0.1, yt, 0]], c);
    xt += 0.4;
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt + 0.1, 0], [xt + 0.05, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    lines([[xt, yt, 0], [xt + 0.1, yt, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt - 0.1, 0], [xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.1, yt, 0], [xt, yt, 0], [xt + 0.1, yt - 0.1, 0]], c);
    return;
  }
}

function drawPauseGlyph() {
  const c = [1, 1, 1, 1];
  let xt = -0.5;
  const yt = 0.0;
  renderer.lineWidth(2.8);
  lineStrip([[xt, yt - 0.1, 0], [xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.1, yt, 0], [xt, yt, 0]], c);
  xt += 0.2;
  lineStrip([[xt, yt - 0.1, 0], [xt + 0.05, yt + 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
  lines([[xt + 0.025, yt, 0], [xt + 0.075, yt, 0]], c);
  xt += 0.2;
  lineStrip([[xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0]], c);
  xt += 0.2;
  lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt, 0], [xt + 0.1, yt, 0], [xt + 0.1, yt - 0.1, 0], [xt, yt - 0.1, 0]], c);
  xt += 0.2;
  lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
  lines([[xt, yt, 0], [xt + 0.1, yt, 0]], c);
  renderer.lineWidth(1.4);
  drawPolylines([
    [[0.78, 2.15, 0], [0.98, 2.24, 0], [0.78, 2.33, 0], [0.78, 2.15, 0]],
    [[0.72, 2.08, 0], [1.05, 2.08, 0], [1.05, 2.40, 0], [0.72, 2.40, 0], [0.72, 2.08, 0]],
  ], [0, 1, 1, 1]);
}

function drawStartMenuGlyphs() {
  if (state.about === 0) {
    drawMenuButtonBoxes();
    drawExactMenuWord("about");
    drawExactMenuWord("start");
  }
  if (state.about < 2) {
    renderer.lineWidth(2.8);
    drawExactMenuWord("polytesseract");
    renderer.lineWidth(1.4);
  }
}

function drawGameOverGlyphs() {
  drawMenuButtonBoxes();
  drawExactMenuWord("main");
  drawExactMenuWord("retry");
  renderer.lineWidth(2.8);
  drawExactMenuWord("gameover");
  renderer.lineWidth(1.4);
  drawGameOverScorePanel();
}

function drawPauseScreen() {
  renderer.matrixMode("MODELVIEW");
  renderer.loadIdentity();
  renderer.clearColor(0, 0, 0, 0);
  renderer.clear(renderer.gl.COLOR_BUFFER_BIT | renderer.gl.DEPTH_BUFFER_BIT);
  renderer.viewport(0, state.activitysizey / 40, state.activitysizex, (state.activitysizey * 41) / 40);
  renderer.translatef(0, 0, -4);
  drawTexture(0, [-1, 2, -1, -1, -2, -1, 1, -2, -1, 1, 2, -1], [0.15, 0.15, 0.15, 1]);
  if (state.textures[6]) {
    const gl = renderer.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    { const bw = 1.6875, bh = bw * 1.3; drawTexture(6, [-bw, bh + 0.0, -0.99, -bw, -bh + 0.0, -0.99, bw, -bh + 0.0, -0.99, bw, bh + 0.0, -0.99], [0.5, 0.5, 0.5, 1]); }
    gl.disable(gl.BLEND);
  }
  drawPauseGlyph();
}

function drawStartScreen() {
  renderer.matrixMode("MODELVIEW");
  renderer.loadIdentity();
  renderer.clearColor(0, 0, 0, 0);
  renderer.clear(renderer.gl.COLOR_BUFFER_BIT | renderer.gl.DEPTH_BUFFER_BIT);
  renderer.viewport(0, state.activitysizey / 40, state.activitysizex, (state.activitysizey * 41) / 40);
  renderer.translatef(0, 0, -4);
  const variants = [
    [-1, 2, -1, -1, -2, -1, 1, -2, -1, 1, 2, -1],
    [-1.5, 2.25, -1, -1.5, -3.75, -1, 1.5, -3.75, -1, 1.5, 2.25, -1],
    [-1.5, 3.075, -1, -1.5, -2.925, -1, 1.5, -2.925, -1, 1.5, 3.075, -1],
    [-1.5, 3.075, -1, -1.5, -2.925, -1, 1.5, -2.925, -1, 1.5, 3.075, -1],
    [-1.5, 3.075, -1, -1.5, -2.925, -1, 1.5, -2.925, -1, 1.5, 3.075, -1],
  ];
  if (state.about === 0) {
    // Background texture (dark)
    if (state.textures.length) {
      drawTexture(0, variants[0], [0.15, 0.15, 0.15, 1]);
    }
    // Block scene overlay (texture 6) — aspect-ratio preserved
    if (state.textures[6]) {
      const gl = renderer.gl;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const bw = 1.6875, bh = bw * 1.3;
      drawTexture(6, [-bw, bh + 0.0, -0.99, -bw, -bh + 0.0, -0.99, bw, -bh + 0.0, -0.99, bw, bh + 0.0, -0.99], [1, 1, 1, 1]);
      gl.disable(gl.BLEND);
    }
    drawStartMenuGlyphs();
    // "4D Polycube" subtitle via 2D overlay (below title)
    const cw = overlayCanvas.width, ch = overlayCanvas.height;
    const fs = Math.max(10, Math.floor(cw * 0.035));
    ctx2d.save();
    ctx2d.font = `bold ${fs}px 'Noto Sans KR','Malgun Gothic',sans-serif`;
    ctx2d.fillStyle = '#888';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'top';
    ctx2d.fillText('4D Polycube', cw / 2, ch * 0.17 + fs);
    ctx2d.restore();
  }
}

function drawGameOverScreen() {
  renderer.matrixMode("MODELVIEW");
  renderer.loadIdentity();
  renderer.clearColor(0, 0, 0, 0);
  renderer.clear(renderer.gl.COLOR_BUFFER_BIT | renderer.gl.DEPTH_BUFFER_BIT);
  renderer.viewport(0, state.activitysizey / 40, state.activitysizex, (state.activitysizey * 41) / 40);
  renderer.translatef(0, 0, -4);
  drawTexture(0, [-1, 2, -1, -1, -2, -1, 1, -2, -1, 1, 2, -1], [0.5, 0.5, 0.5, 1]);
  if (state.textures[6]) {
    const gl = renderer.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    { const bw = 1.6875, bh = bw * 1.3; drawTexture(6, [-bw, bh + 0.0, -0.99, -bw, -bh + 0.0, -0.99, bw, -bh + 0.0, -0.99, bw, bh + 0.0, -0.99], [0.5, 0.5, 0.5, 1]); }
    gl.disable(gl.BLEND);
  }
  drawGameOverGlyphs();
}

function drawFrame() {
  handleTouches();
  if (state.ready && !state.startscreen && !state.pause && !state.goverflg) {
    updateFallingLogic();
  }

  if (state.startscreen === 1) { ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawStartScreen(); }
  else if (state.goverflg === 1) { ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawGameOverScreen(); }
  else if (state.pause) { ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawPauseScreen(); }
  else { if (state.captureMode) ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawScene3d(); }

  window.__polytesseractAbout = state.startscreen === 1 ? state.about : -1;
  requestAnimationFrame(drawFrame);
}

async function boot() {
  resize();
  await tryLoadTextures();
  state.rawblock = RAWBLOCK_SOURCE;
  initBlockState();
  state.ready = true;
  requestAnimationFrame(drawFrame);
}

window.__ptResize = resize;
window.addEventListener("resize", resize);
boot().catch((error) => {
  if (hud) hud.textContent = `boot failed\n${error.message}`;
  requestAnimationFrame(drawFrame);
});
})();
