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

function clone3d(src) {
  return src.map((plane) => plane.map((row) => row.slice()));
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

window.itemsEnabled = new URLSearchParams(window.location.search).get('items') !== '0';
var itemsEnabled = window.itemsEnabled;

const state = {
  ready: false,
  activitysizex: 1,
  activitysizey: 1,
  startscreen: 1,
  goverflg: 0,
  about: 0,
  pause: false,
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
  upd: false,
  ul: 0,
  timestamp: 0,
  vkspace: false,
  vkspace2: false,
  touchIds: new Map(),
  pointerPositions: new Map(),
  textures: [],
  rawblock: null,
  b: [create3d(7, 7, 7), create3d(7, 7, 7), create3d(7, 7, 7), create3d(7, 7, 7)],
  rbt: Array.from({ length: 3 }, () =>
    Array.from({ length: 2 }, () => create3d(7, 7, 7))),
  nowblock: null,
  nextblock: null,
  holdblock: null,
  blk: create3d(7, 7, 26),
  blockpos: [0, 0, 14],
  blockpostmp: [0, 0, 14],
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
  speedup: 0,
  speeddown: 0,
  holdlock: 0,
  blindboard: 0,
  bombnext: 0,
  compactPending: false,
  simplify2: 0,
  pentaForce: 0,
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

// 2D overlay canvas for item info text
const overlayCanvas = document.createElement('canvas');
overlayCanvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;background:transparent';
canvas.parentElement.appendChild(overlayCanvas);
const ctx2d = overlayCanvas.getContext('2d');

const _isKo = /^ko/i.test(navigator.language || '');
const ITEM_DESC = _isKo ? {
  1:'자폭: 착지 시 주변 삭제', 2:'은폐: 현재 블록 숨김', 200:'거울상: 보드 좌우반전', 19:'지그재그: 각 층 블록 재배치', 4:'득점강화: 점수 2배',
  5:'아이템제거', 6:'예측차단: 다음 블록 숨김', 8:'속도증가: x2.5', 9:'속도감소: x0.4',
  10:'홀드봉인', 11:'장애물: 장애물블록 3개 추가', 16:'시야봉인: 보드 숨김', 17:'폭탄블록5개: 5블록에 폭탄', 18:'구멍: 블록 30% 제거',
  91:'회전봉인', 20:'빈공간삭제', 21:'소형화: 8턴간 3칸 이하', 22:'대형화', 30:'관통', 31:'상쇄',
  102:'상단삭제', 104:'모노전용: 1칸 블록만', 105:'종렬삭제', 116:'-2줄', 117:'+2줄',
  118:'범위삭제', 119:'전체삭제', 120:'시한폭탄', 121:'시한폭탄', 122:'시한폭탄',
  123:'시한폭탄', 124:'-3줄', 125:'+1줄', 126:'횡렬삭제', 127:'폭탄변환',
} : {
  1:'Self-Destruct', 2:'Conceal', 200:'Mirror', 19:'Zigzag: Shuffle each layer', 4:'Score Boost: 2x', 5:'Item Clear',
  6:'No Preview', 8:'Speed Up: x2.5', 9:'Slow Down: x0.4', 10:'Hold Lock', 11:'Obstacle: Add 3 obstacle blocks',
  16:'Blind', 17:'Bomb x5: Next 5 have bombs', 18:'Hole: Remove 30% blocks', 91:'Rot Lock', 20:'Gap Clear', 21:'Simplify: ≤3 cells 8 turns',
  22:'PentaForce', 30:'Pierce', 31:'Cancel', 102:'Top Clear', 104:'Mono Only',
  105:'Col Del', 116:'-2 Lines', 117:'+2 Lines', 118:'Range Del', 119:'Full Clear',
  120:'Time Bomb', 121:'Time Bomb', 122:'Time Bomb', 123:'Time Bomb',
  124:'-3 Lines', 125:'+1 Line', 126:'Row Del', 127:'Bomb Convert',
};
const ITEM_GOOD = new Set([1,4,9,20,21,30,31,102,104,105,116,117,118,119,124,125,126]);

const texcoords = [
  0, 1,
  0, 0,
  1, 0,
  1, 1,
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
  if (touch.flag === 2) touch.flag = 3;
  else if (touch.flag === 1) touch.flag = 0;
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

canvas.addEventListener("pointerup", (event) => clearPointer(event.pointerId, event.clientX, event.clientY));
canvas.addEventListener("pointercancel", (event) => clearPointer(event.pointerId, event.clientX, event.clientY));

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const point = normalizeTouch(event.clientX, event.clientY);
  zoom(-event.deltaY * 3, point.y);
}, { passive: false });

// Key repeat: DAS 170ms then ARR 50ms for movement; rotation = single fire
const _keyRepeatTimers = {};
const _KEY_DAS = 170;
const _KEY_ARR = 50;
const _rotTicket = {};

function _execKey(code) {
  if (code === "ShiftRight" || code === "ShiftLeft") { state.vkspace2 = true; return; }
  if (code === "Space") {
    // Hard drop: move down until stuck, then place block
    const _hb = state.nowblock;
    while (!move(2, -1)) { if (state.nowblock !== _hb) break; }
    if (state.nowblock !== _hb) { state.timestamp = now(); return; }
    if (stickblock()) { gover(); initBlockState(); return; }
    calculatescore(removeline());
    state.timestamp = now();
    return;
  }
  if (code === "ArrowLeft" || code === "ArrowRight" ||
      code === "ArrowUp" || code === "ArrowDown") {
    if (!state.pause) {
      const screenAngle = code === "ArrowLeft" ? PI :
                          code === "ArrowRight" ? 0 :
                          code === "ArrowUp" ? PI / 2 : -PI / 2;
      let deg = screenAngle - state.r1o;
      while (deg < -PI) deg += 2 * PI;
      while (deg > PI) deg -= 2 * PI;
      if (-3 * PI / 4 < deg && deg <= -PI / 4) move(1, 1);
      else if (-PI / 4 < deg && deg <= PI / 4) move(0, 1);
      else if (PI / 4 < deg && deg <= 3 * PI / 4) move(1, -1);
      else move(0, -1);
    }
    return;
  }
  if (code === "KeyZ") { rotate(0, -1); return; }
  if (code === "KeyX") { rotate(0, 1); return; }
}

function _isRotKey(code) { return code === "KeyZ" || code === "KeyX"; }
function _isMoveKey(code) { return "ArrowLeft ArrowRight ArrowUp ArrowDown".indexOf(code) >= 0; }

window.addEventListener("keydown", (event) => {
  const code = event.code;
  if (_isRotKey(code)) {
    if (_rotTicket['_t' + code]) { clearTimeout(_rotTicket['_t' + code]); _rotTicket['_t' + code] = 0; }
    if (_rotTicket[code] !== false) {
      _rotTicket[code] = false;
      _execKey(code);
    }
    return;
  }
  if (_isMoveKey(code)) {
    if (_moveUpTimer[code]) { clearTimeout(_moveUpTimer[code]); delete _moveUpTimer[code]; }
    if (!_keyRepeatTimers[code]) {
      _execKey(code);
      _keyRepeatTimers[code] = setTimeout(() => {
        _keyRepeatTimers[code] = setInterval(() => _execKey(code), _KEY_ARR);
      }, _KEY_DAS);
    }
    return;
  }
  _execKey(code);
});

const _moveUpTimer = {};
window.addEventListener("keyup", (event) => {
  const code = event.code;
  if (_isMoveKey(code)) {
    _moveUpTimer[code] = setTimeout(() => {
      if (_keyRepeatTimers[code]) { clearTimeout(_keyRepeatTimers[code]); clearInterval(_keyRepeatTimers[code]); delete _keyRepeatTimers[code]; }
      delete _moveUpTimer[code];
    }, 15);
  } else {
    if (_keyRepeatTimers[code]) { clearTimeout(_keyRepeatTimers[code]); clearInterval(_keyRepeatTimers[code]); delete _keyRepeatTimers[code]; }
  }
  if (_isRotKey(code)) _rotTicket['_t' + code] = setTimeout(() => { _rotTicket[code] = true; }, 15);
  if (code === "ShiftRight" || code === "ShiftLeft") state.vkspace2 = false;
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
  for (let i = 0; i < 6; i += 1) {
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
  clear3d(state.b[2], 0);
  let blkcnt = 0;
  let x = 2;
  let y = 2;
  let z = 2;
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
  let xh = 0;
  let xl = 6;
  let yh = 0;
  let yl = 6;
  let zh = 0;
  let zl = 6;
  while (blkcnt < blockcnt) {
    if (state.b[2][x][y][z] === 0) {
      blkcnt += 1;
      const _rv2={6:207,7:206,8:205,9:203,10:202,11:201,12:199,13:198,14:197}; state.b[2][x][y][z] = _rv2[blockcnt] || (158+blockcnt);
      if (x >= xh) xh = x;
      if (x <= xl) xl = x;
      if (y >= yh) yh = y;
      if (y <= yl) yl = y;
      if (z >= zh) zh = z;
      if (z <= zl) zl = z;
    }
    switch (randInt(6)) {
      case 0: x = Math.min(6, x + 1); break;
      case 1: x = Math.max(0, x - 1); break;
      case 2: y = Math.min(6, y + 1); break;
      case 3: y = Math.max(0, y - 1); break;
      case 4: z = Math.min(6, z + 1); break;
      default: z = Math.max(0, z - 1); break;
    }
  }
  xl = Math.floor((xl + xh) / 2) - 3;
  yl = Math.floor((yl + yh) / 2) - 3;
  zl = Math.floor((zl + zh) / 2) - 3;
  for (let xi = 0; xi < 7; xi += 1) {
    for (let yi = 0; yi < 7; yi += 1) {
      for (let zi = 0; zi < 7; zi += 1) {
        const sx = xi + xl;
        const sy = yi + yl;
        const sz = zi + zl;
        state.rawblock[56][xi][yi][zi] =
          sx >= 0 && sx <= 6 && sy >= 0 && sy <= 6 && sz >= 0 && sz <= 6
            ? state.b[2][sx][sy][sz]
            : 0;
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
  clear3d(state.blk, 0);
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
  clear3d(state.holdblock, 0);
  if (itemsEnabled) {
    let _hv = 4;
    const _mr = randInt(100);
    if (_mr < 10) _hv = 1;
    else if (_mr < 20) { _hv = 30; state.holdhb = 1; }
    else if (_mr < 60) _hv = 31;
    else {
      const _u = randInt(250000);
      if(_u<100)_hv=116;else if(_u<400)_hv=117;else if(_u<700)_hv=118;else if(_u<720)_hv=119;else if(_u<1520)_hv=104;else if(_u<2020)_hv=120;else if(_u<3020)_hv=121;else if(_u<3720)_hv=122;else if(_u<4020)_hv=123;else if(_u<4070)_hv=124;else if(_u<4870)_hv=125;else if(_u<5120)_hv=91;else if(_u<5220)_hv=102;else if(_u<5420)_hv=126;else if(_u<5620)_hv=105;else if(_u<5920)_hv=127;else if(_u<6020)_hv=17;else if(_u<6220)_hv=20;else if(_u<7020)_hv=21;else if(_u<7820)_hv=22;else if(_u<8070)_hv=16;else if(_u<8270)_hv=11;else if(_u<8520)_hv=2;else if(_u<9520)_hv=8;else if(_u<10520)_hv=9;else if(_u<10770)_hv=10;else if(_u<11770)_hv=5;else if(_u<12020)_hv=6;else if(_u<14270)_hv=120;else if(_u<24270)_hv=200;else if(_u<24570)_hv=19;else if(_u<24870)_hv=18;
    }
    state.holdblock[3][3][3] = _hv;
  } else { state.holdblock[3][3][3] = 65; }
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
  if (state.simplify2 > 0) {
    state.simplify2 -= 1;
    return randInt(4);
  }
  if (state.pentaForce > 0) {
    state.pentaForce -= 1;
    return 12 + randInt(29); // penta+ (index 12-40)
  }
  let t = randInt(100);
  if (t < b1) t = 0;
  else if (t < b2) t = 1;
  else if (t < b3) t = 2 + randInt(2);
  else if (t < b4) t = 4 + randInt(8);
  else if (t < b5) t = 12 + randInt(29);
  else {
    if (randInt(2)) {
      createNewBlock();
      t = 56;
    } else {
      t = 41 + randInt(15);
    }
  }
  return t;
}

function applySpecialAging() {
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 26; z += 1) {
        const value = state.blk[x][y][z];
        if (120 <= value && value < 123) {
          state.blk[x][y][z] += 1;
        } else if (value === 123) {
          for (let x2 = x - 1; x2 <= x + 1; x2 += 1) {
            for (let y2 = y - 1; y2 <= y + 1; y2 += 1) {
              for (let z2 = z - 1; z2 <= z + 1; z2 += 1) {
                if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && z2 >= 0 && z2 < 26) {
                  state.blk[x2][y2][z2] = randInt(4) !== 0 ? 98 : 0;
                }
              }
            }
          }
        } else if (value === 32) {
          for (let x2 = x - 1; x2 <= x + 1; x2 += 1) {
            for (let y2 = y - 1; y2 <= y + 1; y2 += 1) {
              for (let z2 = z - 1; z2 <= z + 1; z2 += 1) {
                if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && z2 >= 0 && z2 < 26) {
                  state.blk[x2][y2][z2] = 0;
                }
              }
            }
          }
        }
      }
    }
  }
}

function assignCellFromProbability(baseIndex, x, y, z) {
  const raw = state.rawblock[baseIndex][x][y][z];
  if (raw === 0) {
    return 0;
  }
  if (!itemsEnabled) return raw;
  let u = (randInt(16384) + randInt(16384) * 16384) % 1000000;
  if (u < 100) return 116;
  if (u < 400) return 117;
  if (u < 700) return 118;
  if (u < 720) return 119;
  if (u < 1520) return 104;
  if (u < 2020) return 120;
  if (u < 3020) return 121;
  if (u < 3720) return 122;
  if (u < 4020) return 123;
  if (u < 4070) return 124;
  if (u < 4870) return 125;
  if (u < 5120) return 91;
  if (u < 5220) return 102;
  if (u < 5420) return 126;
  if (u < 5620) return 105;
  if (u < 5920) return 127;
  if (u < 6020) return 17;
  if (u < 6220) return 20;
  if (u < 7020) return 21;
  if (u < 7820) return 22;
  if (u < 8070) return 16;
  if (u < 8270) return 11;
  if (u < 8520) return 2;
  if (u < 9520) return 8;
  if (u < 10520) return 9;
  if (u < 10770) return 10;
  if (u < 11770) return 5;
  if (u < 12020) return 6;
  if (u < 14270) return 120;
  if (u < 24270) return 4;
  if (u < 24570) return 200; // mirror 0.03%
  if (u < 24870) return 19; // zigzag 0.03%
  if (u < 25170) return 18; // hole 0.03%
  if (baseIndex === 0) {
    const _mr = randInt(100);
    if (_mr < 10) return 1; // selfdestruct 10%
    if (_mr < 20) { state.nexthb = 1; return 30; } // pierce 10%
    if (_mr < 60) return 31; // cancel 40%
  }
  if (state.monoonly || (state.simplify2 > 0 && baseIndex === 0)) return 12 + randInt(4);
  if (u > 20000 && u < 60000 && getHour() === 0 && getMinute() === 0) {
    const du = u - 20000;
    const bonus = [
      [4900, 116], [14700, 117], [14700, 118], [499, 119], [14700, 104],
      [171500, 120], [49000, 121], [34300, 122], [14700, 123], [1497, 124],
      [39200, 125], [12250, 91], [4900, 102], [9800, 126], [9800, 105],
      [4900, 127], [9800, 1], [12250, 2], [49000, 5], [12250, 6], [40000, 4],
      [4900, 19], [4900, 18],
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
  state.nexthb = 0;
  applySpecialAging();

  const baseIndex = chooseBaseBlockIndex();
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        state.nextblock[x][y][z] = assignCellFromProbability(baseIndex, x, y, z);
      }
    }
  }

  // simplify2: special block assignment
  if (state.simplify2 > 0) {
    let _cellCount = 0;
    for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) if (state.nextblock[x][y][z] !== 0) _cellCount++;
    const _sr = randInt(100);
    if (_sr < 40) {
      // 40%: all cancel
      for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) if (state.nextblock[x][y][z] !== 0) state.nextblock[x][y][z] = 31;
    } else if (_sr < 50) { // 10%: all pierce or selfdestruct
      // mono 10% / 2-3mino 1%: all pierce or all selfdestruct
      const _sv = randInt(2) === 0 ? 30 : 1;
      if (_sv === 30) state.nexthb = 1;
      for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) if (state.nextblock[x][y][z] !== 0) state.nextblock[x][y][z] = _sv;
    }
    // else: keep original cells (normal item assignment already applied)
  }

  // bombnext: force bomb(s) into the piece
  if (state.bombnext > 0) {
    const cells = [];
    for (let x = 0; x < 7; x++)
      for (let y = 0; y < 7; y++)
        for (let z = 0; z < 7; z++)
          if (state.nextblock[x][y][z] !== 0) cells.push([x, y, z]);
    if (cells.length > 0) {
      const bombTypes = [120, 121, 122, 123, 127];
      const bombCount = cells.length >= 5 ? 2 : 1;
      const used = new Set();
      for (let b = 0; b < bombCount && b < cells.length; b++) {
        let bi;
        do { bi = randInt(cells.length); } while (used.has(bi));
        used.add(bi);
        const [bx, by, bz] = cells[bi];
        state.nextblock[bx][by][bz] = bombTypes[randInt(bombTypes.length)];
      }
      state.bombnext -= 1;
    }
  }

  state.blockpos[0] = 0;
  state.blockpos[1] = 0;
  state.blockpos[2] = 14;

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
  // rbt[0][0]: xy rotation CW (y -> 6-x)
  for (let x = 0; x < 7; x++) {
    for (let y = 0; y < 7; y++) {
      for (let z = 0; z < 7; z++) {
        dst[y][6 - x][z] = state.nowblock[x][y][z];
      }
    }
  }
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        state.rbt[0][0][x][y][z] = dst[x][y][z];

  // rbt[0][1]: xy rotation CCW (6-y -> x)
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        dst[6 - y][x][z] = state.nowblock[x][y][z];
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        state.rbt[0][1][x][y][z] = dst[x][y][z];

  // rbt[1][0]: yz rotation (x, z, 6-y)
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        dst[x][z][6 - y] = state.nowblock[x][y][z];
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        state.rbt[1][0][x][y][z] = dst[x][y][z];

  // rbt[1][1]: yz rotation reverse (x, 6-z, y)
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        dst[x][6 - z][y] = state.nowblock[x][y][z];
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        state.rbt[1][1][x][y][z] = dst[x][y][z];

  // rbt[2][0]: xz rotation (z, y, 6-x)
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        dst[z][y][6 - x] = state.nowblock[x][y][z];
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        state.rbt[2][0][x][y][z] = dst[x][y][z];

  // rbt[2][1]: xz rotation reverse (6-z, y, x)
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        dst[6 - z][y][x] = state.nowblock[x][y][z];
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 7; z++)
        state.rbt[2][1][x][y][z] = dst[x][y][z];
}

function _com3d(blk) {
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++)
    if (blk[x][y][z]) { sx += x; sy += y; sz += z; n++; }
  return n ? [Math.round(sx / n), Math.round(sy / n), Math.round(sz / n)] : [3, 3, 3];
}

function _checkRotated3d(temp, dx, dy, dz) {
  for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) {
    if (!temp[x][y][z]) continue;
    const bx = x + state.blockpos[0] + dx;
    const by = y + state.blockpos[1] + dy;
    const bz = z + state.blockpos[2] + dz;
    if (bx < 0 || bx > 6 || by < 0 || by > 6 || bz < 0 || bz > 25) return false;
    const v = state.blk[bx][by][bz];
    if (v !== 0 && v !== 31) return false;
  }
  return true;
}

function rotate(pos, deg) {
  if (state.spinlock !== 0) return 0;
  if ((deg & 3) === 0) return 0;

  // Compute center of mass before rotation
  const [cx, cy, cz] = _com3d(state.nowblock);

  const temp = state.b[2];
  clear3d(temp, 0);
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        const value = state.nowblock[x][y][z];
        if (!value) continue;
        if (pos === 0) {
          if ((deg & 3) === 1) temp[6 - y][x][z] = value;
          else if ((deg & 3) === 2) temp[6 - y][6 - x][z] = value;
          else temp[y][6 - x][z] = value;
        } else if (pos === 1) {
          if ((deg & 3) === 1) temp[x][6 - z][y] = value;
          else if ((deg & 3) === 2) temp[x][6 - z][6 - y] = value;
          else temp[x][z][6 - y] = value;
        } else if ((deg & 3) === 1) {
          temp[6 - z][y][x] = value;
        } else if ((deg & 3) === 2) {
          temp[6 - z][y][6 - x] = value;
        } else {
          temp[z][y][6 - x] = value;
        }
      }
    }
  }

  // Compute center of mass after rotation, compensate drift
  const [nx, ny, nz] = _com3d(temp);
  const comDx = cx - nx, comDy = cy - ny, comDz = cz - nz;
  if (comDx !== 0 || comDy !== 0 || comDz !== 0) {
    // Shift temp to preserve center of mass
    let canShift = true;
    for (let x = 0; x < 7 && canShift; x++) for (let y = 0; y < 7 && canShift; y++) for (let z = 0; z < 7; z++) {
      if (!temp[x][y][z]) continue;
      const tx = x + comDx, ty = y + comDy, tz = z + comDz;
      if (tx < 0 || tx >= 7 || ty < 0 || ty >= 7 || tz < 0 || tz >= 7) { canShift = false; break; }
    }
    if (canShift) {
      if (!rotate._temp2) rotate._temp2 = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => new Array(7).fill(0)));
      const temp2 = rotate._temp2;
      clear3d(temp2, 0);
      for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) {
        if (temp[x][y][z]) temp2[x + comDx][y + comDy][z + comDz] = temp[x][y][z];
      }
      clear3d(temp, 0);
      for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) temp[x][y][z] = temp2[x][y][z];
    }
  }

  // Try basic rotation
  if (_checkRotated3d(temp, 0, 0, 0)) {
    // Apply
    for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) {
      state.nowblock[x][y][z] = temp[x][y][z];
      if (state.nowblock[x][y][z] !== 0 &&
          state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]] === 31) {
        state.nowblock[x][y][z] = 0;
        state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]] = 0;
      }
    }
    rotate2();
    return 0;
  }

  // Wall kick: try offsets (3D: 18 directions = ±1 on each axis + diagonals)
  const kicks = [
    [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,-1],
    [1,1,0],[1,-1,0],[-1,1,0],[-1,-1,0],
    [1,0,-1],[-1,0,-1],[0,1,-1],[0,-1,-1],
    [2,0,0],[-2,0,0],[0,2,0],[0,-2,0],[0,0,-2],
  ];
  for (const [kx, ky, kz] of kicks) {
    if (_checkRotated3d(temp, kx, ky, kz)) {
      state.blockpos[0] += kx;
      state.blockpos[1] += ky;
      state.blockpos[2] += kz;
      for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) {
        state.nowblock[x][y][z] = temp[x][y][z];
        if (state.nowblock[x][y][z] !== 0 &&
            state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]] === 31) {
          state.nowblock[x][y][z] = 0;
          state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]] = 0;
        }
      }
      rotate2();
      return 0;
    }
  }

  return 1;
}

// Resolve interactions in a column array (bottom to top)
// pierce(30): destroys normal below, mutual destruction with pierce/cancel
// cancel(31): mutual destruction with non-cancel (not cancel-cancel)
function resolveColumn(col) {
  const result = [];
  for (let k = 0; k < col.length; k++) {
    result.push(col[k]);
    let changed = true;
    while (changed && result.length >= 2) {
      changed = false;
      const top = result[result.length - 1];
      const below = result[result.length - 2];
      const topIs30 = (top & 255) === 30, topIs31 = (top & 255) === 31;
      const belowIs30 = (below & 255) === 30, belowIs31 = (below & 255) === 31;
      const topSpecial = topIs30 || topIs31, belowSpecial = belowIs30 || belowIs31;
      if (topIs30 && !belowSpecial) {
        // pierce above normal: destroy normal, pierce stays
        result.splice(result.length - 2, 1);
        changed = true;
      } else if (topIs30 && belowIs30) {
        // pierce + pierce: both destroyed
        result.pop(); result.pop();
        changed = true;
      } else if ((topIs30 && belowIs31) || (topIs31 && belowIs30)) {
        // pierce + cancel: both destroyed
        result.pop(); result.pop();
        changed = true;
      } else if ((topIs31 && !belowSpecial) || (!topSpecial && belowIs31)) {
        // cancel + non-cancel: both destroyed
        result.pop(); result.pop();
        changed = true;
      }
    }
  }
  return result;
}

function move(pos, deg) {
  // Pre-check: if ANY cell hard-stops, reject move without cancellation
  if (state.nowhb === 0) {
    const _tp = [state.blockpos[0], state.blockpos[1], state.blockpos[2]];
    _tp[pos] += deg;
    for (let x = 0; x < 7; x += 1) for (let y = 0; y < 7; y += 1) for (let z = 0; z < 7; z += 1) {
      if (state.nowblock[x][y][z] === 0) continue;
      const bx = x + _tp[0], by = y + _tp[1], bz = z + _tp[2];
      if (bx < 0 || bx > 6 || by < 0 || by > 6 || bz < 0 || bz > 25) return 1;
      const cell = state.blk[bx][by][bz];
      const myVal = state.nowblock[x][y][z];
      if ((cell === 31 && myVal !== 31) || (myVal === 31 && cell !== 0 && cell !== 31)) continue;
      if (cell !== 0) return 1;
    }
  }
  else if (state.nowhb === 1) {
    // Pierce pre-check: only floor/boundary is hard stop
    const _tp = [state.blockpos[0], state.blockpos[1], state.blockpos[2]];
    _tp[pos] += deg;
    for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) {
      if (state.nowblock[x][y][z] === 0) continue;
      const bx = x + _tp[0], by = y + _tp[1], bz = z + _tp[2];
      if (bx < 0 || bx > 6 || by < 0 || by > 6 || bz < 0 || bz > 25) return 1;
    }
  }

  for (;;) {
    let restart = false;
    state.blockpostmp[0] = state.blockpos[0];
    state.blockpostmp[1] = state.blockpos[1];
    state.blockpostmp[2] = state.blockpos[2];
    state.blockpostmp[pos] += deg;

    outer:
    for (let x = 0; x < 7; x += 1) {
      for (let y = 0; y < 7; y += 1) {
        for (let z = 0; z < 7; z += 1) {
          if (state.nowblock[x][y][z] === 0) continue;
          const bx = x + state.blockpostmp[0];
          const by = y + state.blockpostmp[1];
          const bz = z + state.blockpostmp[2];
          if (bx < 0 || bx > 6 || by < 0 || by > 6) return 1;
          if (bz < 0) {
            return 1;
          }
          if (bz > 25) return 1;

          const cell = state.blk[bx][by][bz];
          if (state.nowhb === 0) {
            if (cell === 31 && state.nowblock[x][y][z] !== 31) {
              state.blk[bx][by][bz] = 0;
              state.nowblock[x][y][z] = 0;
              let hasAny = false;
              for (let x2 = 0; x2 < 7 && !hasAny; x2 += 1) {
                for (let y2 = 0; y2 < 7 && !hasAny; y2 += 1) {
                  for (let z2 = 0; z2 < 7; z2 += 1) {
                    if (state.nowblock[x2][y2][z2] !== 0) {
                      hasAny = true;
                      break;
                    }
                  }
                }
              }
              if (!hasAny) setnextblock();
              state.score += 40;
              restart = true;
              break outer;
            }
            if (state.nowblock[x][y][z] === 31 && cell !== 0 && cell !== 31) {
              // cancel cell of falling block hits normal block: mutual destruction
              state.blk[bx][by][bz] = 0;
              state.nowblock[x][y][z] = 0;
              let hasAny2 = false;
              for (let x2 = 0; x2 < 7 && !hasAny2; x2 += 1) for (let y2 = 0; y2 < 7 && !hasAny2; y2 += 1) for (let z2 = 0; z2 < 7; z2 += 1) { if (state.nowblock[x2][y2][z2] !== 0) { hasAny2 = true; break; } }
              if (!hasAny2) setnextblock();
              state.score += 40;
              restart = true;
              break outer;
            }
            if (cell) return 1;
          } else if (state.nowhb === 1) {
            if (cell === 31 || cell === 30) {
              state.blk[bx][by][bz] = 0;
              state.nowblock[x][y][z] = 0;
              let hasAny3 = false;
              for (let x2 = 0; x2 < 7 && !hasAny3; x2 += 1) for (let y2 = 0; y2 < 7 && !hasAny3; y2 += 1) for (let z2 = 0; z2 < 7; z2 += 1) { if (state.nowblock[x2][y2][z2] !== 0) { hasAny3 = true; break; } }
              if (!hasAny3) setnextblock();
              state.score += 40;
              restart = true;
              break outer;
            }
            state.blk[bx][by][bz] = 0;
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
    return 0;
  }
}

function processLine(cells, z, coords) {
  let tline2 = 0;
  for (const [x, y] of coords) {
    if (state.blk[x][y][z] === 0) return 0;
    if (state.blk[x][y][z] < 256) tline2 += 1;
  }
  let filled = tline2 ? 1 : 0;
  // Pre-scan for mirror (code 200) before processing - early returns might skip it
  let _mirrorFlag = false;
  for (const [x2, y2] of coords) {
    if ((state.blk[x2][y2][z] & 255) === 200) { _mirrorFlag = true; state.blk[x2][y2][z] = (state.blk[x2][y2][z] & 256); }
  }
  for (const [x, y] of coords) {
    const code = state.blk[x][y][z] & 255;
    if (code === 116) { cells.tline -= 2; state.blk[x][y][z] = 256; }
    else if (code === 117) { cells.tline += 2; state.blk[x][y][z] = 256; }
    else if (code === 118) {
      state.blk[x][y][z] = 256;
      for (let x2 = x - 1; x2 <= x + 1; x2 += 1) {
        for (let y2 = y - 1; y2 <= y + 1; y2 += 1) {
          if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7) {
            for (let z2 = 0; z2 < 26; z2 += 1) state.blk[x2][y2][z2] |= 256;
          }
        }
      }
    } else if (code === 119) {
      clear3d(state.blk, 0);
      return { hardReset: true, filled };
    } else if (code === 104) { state.simplify2 = 0; state.pentaForce = 0; state.monoonly += 11; state.blk[x][y][z] = 256; }
    else if (code === 124) { cells.tline -= 3; state.blk[x][y][z] = 256; }
    else if (code === 125) { cells.tline += 1; state.blk[x][y][z] = 256; }
    else if (code === 91) { state.spinlock += 10; state.blk[x][y][z] = 256; }
    else if (code === 8) { state.speedup += 10; state.blk[x][y][z] = 256; }
    else if (code === 9) { state.speeddown += 10; state.blk[x][y][z] = 256; }
    else if (code === 10) { state.holdlock += 10; state.blk[x][y][z] = 256; }
    else if (code === 16) { state.blindboard = now() + 10000; state.blk[x][y][z] = 256; }
    else if (code === 17) { state.bombnext += 6; state.blk[x][y][z] = 256; }
    else if (code === 20) { state.compactPending = true; state.blk[x][y][z] = 256; }
    else if (code === 21) { state.monoonly = 0; state.pentaForce = 0; state.simplify2 += 9; state.blk[x][y][z] = 256; }
    else if (code === 22) { state.monoonly = 0; state.simplify2 = 0; state.pentaForce += 9; state.blk[x][y][z] = 256; }
    else if (code === 2) { state.hideblock += 10; state.blk[x][y][z] = 256; }
    else if (code === 6) { state.hidenext += 10; state.blk[x][y][z] = 256; }
    else if (code === 5) {
      for (let x2 = 0; x2 < 7; x2 += 1) {
        for (let y2 = 0; y2 < 7; y2 += 1) {
          for (let z2 = 0; z2 < 26; z2 += 1) {
            if (state.blk[x2][y2][z2] !== 0 && state.blk[x2][y2][z2] !== 256) {
              state.blk[x2][y2][z2] = 33 + (state.blk[x2][y2][z2] % 31);
            }
          }
        }
      }
      state.blk[x][y][z] = 256;
    } else if (code === 4) { state.score2x += 1; state.blk[x][y][z] = 256; }
    // code 200 (mirror) handled by pre-scan above
    else if (code === 11) {
      state.blk[x][y][z] = 256;
      let count2 = 0;
      for (let i = 0; i < 50; i += 1) {
        const rx = randInt(6);
        const ry = randInt(6);
        const rz = randInt(6);
        if (
          state.blk[rx][ry][rz] === 0 &&
          state.blk[rx + 1][ry][rz] === 0 &&
          state.blk[rx][ry + 1][rz] === 0 &&
          state.blk[rx][ry][rz + 1] === 0
        ) {
          count2 += 1;
          state.blk[rx][ry][rz] = 103;
        }
        if (count2 === 3) break;
      }
    } else if (code === 102) {
      for (let x2 = 0; x2 < 7; x2 += 1) {
        for (let y2 = 0; y2 < 7; y2 += 1) {
          for (let z2 = z; z2 < 26; z2 += 1) state.blk[x2][y2][z2] = 256;
        }
      }
    } else if (code === 105) {
      state.blk[x][y][z] = 256;
      for (let x2 = x - 1; x2 <= x + 1; x2 += 1) {
        if (x2 >= 0 && x2 < 7) {
          for (let y2 = 0; y2 < 7; y2 += 1) {
            for (let z2 = 0; z2 < 26; z2 += 1) state.blk[x2][y2][z2] |= 256;
          }
        }
      }
    } else if (code === 126) {
      state.blk[x][y][z] = 256;
      for (let x2 = 0; x2 < 7; x2 += 1) {
        for (let y2 = y - 1; y2 <= y + 1; y2 += 1) {
          if (y2 >= 0 && y2 < 7) {
            for (let z2 = 0; z2 < 26; z2 += 1) state.blk[x2][y2][z2] |= 256;
          }
        }
      }
    } else if (code === 127) {
      state.blk[x][y][z] |= 256;
      for (let x2 = 0; x2 < 7; x2 += 1) {
        for (let y2 = 0; y2 < 7; y2 += 1) {
          for (let z2 = 0; z2 < 26; z2 += 1) {
            if ((state.blk[x2][y2][z2] & 255) !== 0 && randInt(100) < 30) {
              state.blk[x2][y2][z2] = (state.blk[x2][y2][z2] & 256) + 120 + randInt(4);
            }
          }
        }
      }
    } else if (code === 18) {
      // Hole: remove 30% of all blocks
      state.blk[x][y][z] |= 256;
      for (let x2 = 0; x2 < 7; x2 += 1) {
        for (let y2 = 0; y2 < 7; y2 += 1) {
          for (let z2 = 0; z2 < 26; z2 += 1) {
            if ((state.blk[x2][y2][z2] & 255) !== 0 && randInt(100) < 30) {
              state.blk[x2][y2][z2] = state.blk[x2][y2][z2] & 256;
            }
          }
        }
      }
    } else if (code === 19) {
      // Zigzag: shuffle blocks within each z-layer
      state.blk[x][y][z] |= 256;
      for (let z2 = 0; z2 < 26; z2 += 1) {
        const vals = [];
        const positions = [];
        for (let x2 = 0; x2 < 7; x2 += 1) {
          for (let y2 = 0; y2 < 7; y2 += 1) {
            const v = state.blk[x2][y2][z2] & 255;
            if (v !== 0) vals.push(v);
            positions.push([x2, y2]);
          }
        }
        // Clear all positions in this layer
        for (const [px, py] of positions) {
          state.blk[px][py][z2] = state.blk[px][py][z2] & 256;
        }
        // Shuffle positions
        for (let i = positions.length - 1; i > 0; i--) {
          const j = randInt(i + 1);
          [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        // Place blocks at first N shuffled positions
        for (let i = 0; i < vals.length; i++) {
          const [px, py] = positions[i];
          state.blk[px][py][z2] = (state.blk[px][py][z2] & 256) + vals[i];
        }
      }
    } else {
      state.blk[x][y][z] |= 256;
    }
  }
  if (_mirrorFlag) {
    for (let z2 = 0; z2 < 26; z2++) {
      for (let y2 = 0; y2 < 7; y2++) {
        for (let i = 0; i < 3; i++) {
          const tmp = state.blk[i][y2][z2];
          state.blk[i][y2][z2] = state.blk[6-i][y2][z2];
          state.blk[6-i][y2][z2] = tmp;
        }
      }
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

  let filledline = 0;
  const cells = { tline: 0 };

  for (let x = 0; x < 7; x += 1) {
    for (let z = 0; z < 26; z += 1) {
      const coords = Array.from({ length: 7 }, (_, y) => [x, y]);
      const result = processLine(cells, z, coords);
      if (typeof result === "object" && result.hardReset) return 0;
      filledline += result.filled || 0;
    }
  }
  for (let y = 0; y < 7; y += 1) {
    for (let z = 0; z < 26; z += 1) {
      const coords = Array.from({ length: 7 }, (_, x) => [x, y]);
      const result = processLine(cells, z, coords);
      if (typeof result === "object" && result.hardReset) return 0;
      filledline += result.filled || 0;
    }
  }

  if (cells.tline < 0) {
    for (let z = 0; z < -cells.tline; z += 1) {
      for (let x = 0; x < 7; x += 1) {
        for (let y = 0; y < 7; y += 1) state.blk[x][y][z] = 256;
      }
    }
    cells.tline = 0;
  }

  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      let t = 0;
      for (let z = 0; z < 26; z += 1) {
        if (state.blk[x][y][z] < 256) {
          state.blk[x][y][t] = state.blk[x][y][z];
          t += 1;
        }
      }
      for (; t < 26; t += 1) state.blk[x][y][t] = 0;
    }
  }

  if (cells.tline > 0) {
    for (let x = 0; x < 7; x += 1) {
      for (let y = 0; y < 7; y += 1) {
        for (let z = 25 - cells.tline; z > -1; z -= 1) {
          state.blk[x][y][z + cells.tline] = state.blk[x][y][z];
        }
        for (let t = 0; t < cells.tline; t += 1) {
          state.blk[x][y][t] = randInt(2) !== 0 ? 103 : 0;
          if (x % 7 === (y + t) % 7) state.blk[x][y][t] = 0;
        }
      }
    }
  }

  // 빈공간삭제: compact all (x,y) columns along z, then count extra filled lines
  if (state.compactPending) {
    state.compactPending = false;
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) {
        const col = [];
        for (let z = 0; z < 26; z++) { if (state.blk[x][y][z] !== 0) col.push(state.blk[x][y][z]); }
        const resolved = resolveColumn(col);
        for (let z = 0; z < 26; z++) { state.blk[x][y][z] = z < resolved.length ? resolved[z] : 0; }
      }
    }
    // Count and remove filled lines (x-rows and y-rows at each z)
    let compactLines = 0;
    for (let z = 0; z < 26; z++) {
      // Check x-rows
      for (let x = 0; x < 7; x++) {
        let full = true;
        for (let y = 0; y < 7; y++) { if (state.blk[x][y][z] === 0) { full = false; break; } }
        if (full) { for (let y = 0; y < 7; y++) state.blk[x][y][z] = 0; compactLines++; }
      }
      // Check y-rows
      for (let y = 0; y < 7; y++) {
        let full = true;
        for (let x = 0; x < 7; x++) { if (state.blk[x][y][z] === 0) { full = false; break; } }
        if (full) { for (let x = 0; x < 7; x++) state.blk[x][y][z] = 0; compactLines++; }
      }
    }
    if (compactLines > 0) {
      // Re-compact with resolve
      for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 7; y++) {
          const col = [];
          for (let z = 0; z < 26; z++) { if (state.blk[x][y][z] !== 0) col.push(state.blk[x][y][z]); }
          const resolved = resolveColumn(col);
          for (let z = 0; z < 26; z++) { state.blk[x][y][z] = z < resolved.length ? resolved[z] : 0; }
        }
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
        if (!state.nowblock[x][y][z]) continue;
        if (state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2] + 1] !== 0) {
          let it = 0;
          let jt = 0;
          if (z + state.blockpos[2] === 0 || state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2] - 1] !== 0) it += 1;
          if (y + state.blockpos[1] === 6 || state.blk[x + state.blockpos[0]][y + state.blockpos[1] + 1][z + state.blockpos[2]] !== 0) it += 1;
          if (y !== 6 && state.nowblock[x][y + 1][z] !== 0) jt += 1;
          if (y + state.blockpos[1] === 0 || state.blk[x + state.blockpos[0]][y + state.blockpos[1] - 1][z + state.blockpos[2]] !== 0) it += 1;
          if (y !== 0 && state.nowblock[x][y - 1][z] !== 0) jt += 1;
          if (x + state.blockpos[0] === 6 || state.blk[x + state.blockpos[0] + 1][y + state.blockpos[1]][z + state.blockpos[2]] !== 0) it += 1;
          if (x !== 6 && state.nowblock[x + 1][y][z] !== 0) jt += 1;
          if (x + state.blockpos[0] === 0 || state.blk[x + state.blockpos[0] - 1][y + state.blockpos[1]][z + state.blockpos[2]] !== 0) it += 1;
          if (x !== 0 && state.nowblock[x - 1][y][z] !== 0) jt += 1;
          if (jt < 3 && it + jt > 3) state.asc += 1;
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
        if (state.nowblock[x][y][z] === 0) continue;
        if (z + state.blockpos[2] > 8) return 1;
        state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]] = state.nowblock[x][y][z];
      }
    }
  }
  // 자폭: placed immediately triggers 3x3x3 destruction
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        if (state.nowblock[x][y][z] !== 0 && (state.nowblock[x][y][z] & 255) === 1) {
          const bx = x + state.blockpos[0];
          const by = y + state.blockpos[1];
          const bz = z + state.blockpos[2];
          for (let x2 = bx - 1; x2 <= bx + 1; x2 += 1) {
            for (let y2 = by - 1; y2 <= by + 1; y2 += 1) {
              for (let z2 = bz - 1; z2 <= bz + 1; z2 += 1) {
                if (x2 >= 0 && x2 < 7 && y2 >= 0 && y2 < 7 && z2 >= 0 && z2 < 26) {
                  state.blk[x2][y2][z2] = 0;
                }
              }
            }
          }
        }
      }
    }
  }
  // After placing pierce block, resolve column interactions
  if (state.nowhb === 1) {
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) {
        const col = [];
        for (let z = 0; z < 26; z++) { if (state.blk[x][y][z] !== 0) col.push(state.blk[x][y][z]); }
        const resolved = resolveColumn(col);
        for (let z = 0; z < 26; z++) { state.blk[x][y][z] = z < resolved.length ? resolved[z] : 0; }
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
    const raw = localStorage.getItem('polycube_highscore');
    if (raw) {
      const data = JSON.parse(raw);
      const v = data.s * 51231 % 134 + data.s * 12241 % 142 + data.s * 1411 % 131 + data.s * 215 % 13 + data.s * 2;
      if (v === data.c) {
        if (data.s < state.score) {
          const ns = state.score;
          localStorage.setItem('polycube_highscore', JSON.stringify({ s: ns, c: ns * 51231 % 134 + ns * 12241 % 142 + ns * 1411 % 131 + ns * 215 % 13 + ns * 2 }));
        }
      } else {
        const ns = state.score;
        localStorage.setItem('polycube_highscore', JSON.stringify({ s: ns, c: ns * 51231 % 134 + ns * 12241 % 142 + ns * 1411 % 131 + ns * 215 % 13 + ns * 2 }));
      }
    } else {
      const ns = state.score;
      localStorage.setItem('polycube_highscore', JSON.stringify({ s: ns, c: ns * 51231 % 134 + ns * 12241 % 142 + ns * 1411 % 131 + ns * 215 % 13 + ns * 2 }));
    }
  } catch (_) {}
  state.goverflg = 1;
}

function loadHighScore() {
  try {
    const raw = localStorage.getItem('polycube_highscore');
    if (raw) {
      const data = JSON.parse(raw);
      const v = data.s * 51231 % 134 + data.s * 12241 % 142 + data.s * 1411 % 131 + data.s * 215 % 13 + data.s * 2;
      if (v === data.c) state.oh = data.s;
    }
  } catch (_) {}
}

function tryHoldSwap() {
  if (state.hidenext !== 0) return;
  if (state.holdlock !== 0) return;
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        if (state.holdblock[x][y][z] !== 0) {
          if (x + state.blockpos[0] < 0 || x + state.blockpos[0] > 6) return;
          if (y + state.blockpos[1] < 0 || y + state.blockpos[1] > 6) return;
          if (z + state.blockpos[2] < 0) return;
          const _hc = state.blk[x + state.blockpos[0]][y + state.blockpos[1]][z + state.blockpos[2]];
          if (_hc !== 0) { if (state.holdhb === 1 && _hc !== 31 && _hc !== 30) continue; return; }
        }
      }
    }
  }
  [state.holdblock, state.nowblock] = [state.nowblock, state.holdblock];
  [state.holdhb, state.nowhb] = [state.nowhb, state.holdhb];
  // Pierce: immediately destroy overlapping board cells
  if (state.nowhb === 1) {
    for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) {
      if (state.nowblock[x][y][z] === 0) continue;
      const bx = x + state.blockpos[0], by = y + state.blockpos[1], bz = z + state.blockpos[2];
      if (bx >= 0 && bx <= 6 && by >= 0 && by <= 6 && bz >= 0 && bz <= 25 && state.blk[bx][by][bz] !== 0) {
        state.blk[bx][by][bz] = 0;
      }
    }
  }
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
    state.about = (state.about + 1) % 10;
    return 0;
  }
  if (state.startscreen === 1 && state.about !== 0) {
    state.about = (state.about + 1) % 10;
    return 0;
  }
  if ((x - 0.5) * (x - 0.5) + (y + 0.325) * (y + 0.475) < 0.03) {
    state.floorz = (state.floorz + 1) % 7;
    return 2;
  }
  if ((x - 0.45) * (x - 0.45) + (y + 1.095) * (y + 1.095) < 0.09) {
    let deg = Math.atan2(y + 1.095, x - 0.45) - state.r1o;
    while (deg < -PI) deg += 2 * PI;
    while (deg > PI) deg -= 2 * PI;
    if (-3 * PI / 4 < deg && deg <= -PI / 4) {
      if (!state.pause) move(1, 1);
    } else if (-PI / 4 < deg && deg <= PI / 4) {
      if (!state.pause) move(0, 1);
    } else if (PI / 4 < deg && deg <= 3 * PI / 4) {
      if (!state.pause) move(1, -1);
    } else if (!state.pause) {
      move(0, -1);
    }
    return 0;
  }
  if (-0.285 < x && x < -0.095 && -1.295 < y && y < -1.105) { rotate(0, -1); return 2; }
  if (-0.285 < x && x < -0.095 && -1.085 < y && y < -0.895) { rotate(0, 1); return 2; }
  if (-0.495 < x && x < -0.305 && -1.295 < y && y < -1.105) { rotate(1, -1); return 2; }
  if (-0.495 < x && x < -0.305 && -1.085 < y && y < -0.895) { rotate(1, 1); return 2; }
  if (-0.705 < x && x < -0.505 && -1.295 < y && y < -1.105) { rotate(2, -1); return 2; }
  if (-0.705 < x && x < -0.505 && -1.085 < y && y < -0.895) { rotate(2, 1); return 2; }
  if (0.13 > x && x > -0.07 && -1.30 < y && y < -1.10) { state.vkspace2 = true; return 0; }
  if (0.13 > x && x > -0.07 && -1.10 < y && y < -0.80) { tryHoldSwap(); return 0; }
  if (0.6 > x && x > 0.3 && 1.35 > y && y > 1.05) { state.pause = !state.pause; return 0; }
  if (-0.60 > y) return 0;
  return 1;
}

function handleTouches() {
  const t0 = touchs[0];
  const t1 = touchs[1];
  if (t0.flag !== 0 && t1.flag !== 0) {
    if (t0.y > -0.6 && t1.y > -0.6 && t0.flag === 2 && t1.flag === 2) {
      const dist = Math.hypot(t0.x - t1.x, t0.y - t1.y);
      const odist = Math.hypot(t0.oldx - t1.oldx, t0.oldy - t1.oldy);
      zoom(1000 * (dist - odist), (t0.y + t1.y) / 2);
    }
    t0.flag = t0.flag === 1 ? 2 : t0.flag === 3 ? 0 : t0.flag;
    t1.flag = t1.flag === 1 ? 2 : t1.flag === 3 ? 0 : t1.flag;
    return;
  }
  if (t0.flag === 1) {
    state.otp = now();
    state.ft = 1;
    state._lastBtnType = clickbutton(t0.x, t0.y);
    if (state._lastBtnType) {
      if (t0.y > -0.65) {
        state.ci = 0;
        state.tts = true;
        state.bi = now();
      }
    } else {
      state.tts = false;
    }
    t0.flag = 2;
    state.ul = 3;
  } else if (t0.flag === 3) {
    if (state.tts) {
      state.tts = false;
      state.ci = now() - state.bi;
    } else {
      state.vkspace2 = false;
      state.ci = 0;
    }
    t0.flag = 0;
  } else if (t0.flag === 2) {
    if (state._lastBtnType !== 2) {
      const elapsed = now() - state.otp;
      if ((state.ul > 0 && elapsed > 170) || (state.ul === 0 && elapsed > 50)) {
        state.otp = now();
        if (state.ul > 0) state.ul = 0;
        else clickbutton(t0.x, t0.y);
      }
    }
    if (state.ft > 0) state.ft += 1;
    if (state.ft === 6) state.ft = 0;
    if (state.tts) state.upd = true;
  }
}

function updateFallingLogic() {
  let fallInterval = 6000 / (state.level / 3 + 5);
  if (state.speedup > 0) fallInterval *= 0.4;
  if (state.speeddown > 0) fallInterval *= 2.5;
  if (state.timestamp + fallInterval < now() || state.vkspace2 || state.vkspace) {
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
      if (Math.abs(t0.x - t0.oldx) < 0.2) state.wAngleY += (t0.x - t0.oldx) * 100;
      if (Math.abs(t0.y - t0.oldy) < 0.2) state.wAngleX -= (t0.y - t0.oldy) * 100;
    }
    state.upd = false;
  }
  if (state.ci > 300) {
    if (!state.ft) {
      if (Math.abs(t0.x - t0.oldx) < 0.2) state.wAngleY += (t0.x - t0.oldx) * 100;
      if (Math.abs(t0.y - t0.oldy) < 0.2) state.wAngleX -= (t0.y - t0.oldy) * 100;
    }
  }
}

function lineStrip(points, color = [1, 1, 1, 1]) {
  renderer.color4f(...color);
  renderer.begin(GL.LINE_STRIP);
  for (const p of points) renderer.vertex3f(p[0], p[1], p[2] || 0);
  renderer.end();
}

function lines(points, color = [1, 1, 1, 1]) {
  renderer.color4f(...color);
  renderer.begin(GL.LINES);
  for (const p of points) renderer.vertex3f(p[0], p[1], p[2] || 0);
  renderer.end();
}

function pointsDraw(pointsList, color = [1, 1, 1, 1]) {
  renderer.color4f(...color);
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
  // Top-down minimap
  renderer.pushMatrix();
  renderer.translatef(0.6, -0.75, 0);
  renderer.rotatef(state.r1o * TR, 0, 0, 1);
  renderer.scalef(0.8, 0.8, 0.8);
  for (let x = 0; x < 7; x++) {
    for (let y = 0; y < 7; y++) {
      for (let z = 25; z >= state.floorz; z--) {
        let value = state.blk[x][y][z] & 255;
        const bx = x - state.blockpos[0];
        const by = y - state.blockpos[1];
        const bz = z - state.blockpos[2];
        let failing = false;
        if (bx >= 0 && bx < 7 && by >= 0 && by < 7 && bz >= 0 && bz < 7 && (state.nowblock[bx][by][bz] & 255) !== 0) {
          value = state.nowblock[bx][by][bz] & 255;
          failing = true;
        }
        if (value !== 0) {
          let pic = value & 127;
          pic ^= 64;
          const R = pic >> 4;
          const G = (pic >> 2) & 3;
          const B = pic & 3;
          const _hi = (value & 255) > 127;
          renderer.color3f(_hi ? Math.min(1, (R+1.2)/4.8*0.7+0.12) : (R+1.2)/4.8, (G+1.2)/4.4*(_hi?0.6:1), (B+1.2)/4.4*(_hi?0.6:1));
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
  renderer.translatef(-0.45, -1.2, 0);
  if (state.spinlock === 0) {
    drawPolylines([
      [[0.115, -0.095, 1], [0.305, -0.095, 1], [0.305, 0.095, 1], [0.115, 0.095, 1], [0.115, -0.095, 1]],
      [[0.115, 0.115, 1], [0.305, 0.115, 1], [0.305, 0.305, 1], [0.115, 0.305, 1], [0.115, 0.115, 1]],
      [[-0.095, -0.095, 1], [0.095, -0.095, 1], [0.095, 0.095, 1], [-0.095, 0.095, 1], [-0.095, -0.095, 1]],
      [[-0.095, 0.115, 1], [0.095, 0.115, 1], [0.095, 0.305, 1], [-0.095, 0.305, 1], [-0.095, 0.115, 1]],
      [[-0.115, -0.095, 1], [-0.305, -0.095, 1], [-0.305, 0.095, 1], [-0.115, 0.095, 1], [-0.115, -0.095, 1]],
      [[-0.115, 0.115, 1], [-0.305, 0.115, 1], [-0.305, 0.305, 1], [-0.115, 0.305, 1], [-0.115, 0.115, 1]],
    ], [0, 1, 1, 1]);
    // Draw block previews inside rotation buttons
    const rbtPositions = [
      [0, 0, 0.210, 0],      // rbt[0][0] -> button at (0.115..0.305, -0.095..0.095)
      [0, 1, 0.210, 0.210],  // rbt[0][1] -> button at (0.115..0.305, 0.115..0.305)
      [1, 0, 0, 0],          // rbt[1][0] -> button at (-0.095..0.095, -0.095..0.095)
      [1, 1, 0, 0.210],      // rbt[1][1] -> button at (-0.095..0.095, 0.115..0.305)
      [2, 0, -0.210, 0],     // rbt[2][0] -> button at (-0.305..-0.115, -0.095..0.095)
      [2, 1, -0.210, 0.210], // rbt[2][1] -> button at (-0.305..-0.115, 0.115..0.305)
    ];
    for (const [axis, dir, tx, ty] of rbtPositions) {
      renderer.pushMatrix();
      renderer.translatef(tx, ty, 0);
      renderer.rotatef(state.wAngleX, 1, 0, 0);
      renderer.rotatef(state.wAngleY, 0, 1, 0);
      renderer.rotatef(state.wAngleZ, 0, 0, 1);
      for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 7; y++) {
          for (let z = 0; z < 7; z++) {
            const value = state.rbt[axis][dir][x][y][z];
            if (!value) continue;
            drawBlockVisual(x, y, z + 1.5, value, 0.02, false);
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

  renderer.pushMatrix();
  renderer.translatef(0.5, -1.125, 0);
  renderer.rotatef(state.r1o * TR, 0, 0, 1);
  renderer.scalef(1.3, 1.3, 1.3);
  drawPolylines([
    [[0.46 - 0.375, -0.99 + 0.925, 1], [0.59 - 0.375, -0.99 + 0.925, 1], [0.59 - 0.375, -0.86 + 0.925, 1], [0.46 - 0.375, -0.86 + 0.925, 1], [0.46 - 0.375, -0.99 + 0.925, 1]],
    [[0.16 - 0.375, -0.99 + 0.925, 1], [0.29 - 0.375, -0.99 + 0.925, 1], [0.29 - 0.375, -0.86 + 0.925, 1], [0.16 - 0.375, -0.86 + 0.925, 1], [0.16 - 0.375, -0.99 + 0.925, 1]],
    [[0.31 - 0.375, -1.01 + 0.925, 1], [0.44 - 0.375, -1.01 + 0.925, 1], [0.44 - 0.375, -1.14 + 0.925, 1], [0.31 - 0.375, -1.14 + 0.925, 1], [0.31 - 0.375, -1.01 + 0.925, 1]],
    [[0.31 - 0.375, -0.84 + 0.925, 1], [0.44 - 0.375, -0.84 + 0.925, 1], [0.44 - 0.375, -0.71 + 0.925, 1], [0.31 - 0.375, -0.71 + 0.925, 1], [0.31 - 0.375, -0.84 + 0.925, 1]],
    [[0.355 - 0.375, -0.795 + 0.925, 1], [0.375 - 0.375, -0.775 + 0.925, 1], [0.395 - 0.375, -0.795 + 0.925, 1]],
    [[0.355 - 0.375, -1.055 + 0.925, 1], [0.375 - 0.375, -1.075 + 0.925, 1], [0.395 - 0.375, -1.055 + 0.925, 1]],
    [[0.225 - 0.375, -0.945 + 0.925, 1], [0.205 - 0.375, -0.925 + 0.925, 1], [0.225 - 0.375, -0.905 + 0.925, 1]],
    [[0.525 - 0.375, -0.945 + 0.925, 1], [0.545 - 0.375, -0.925 + 0.925, 1], [0.525 - 0.375, -0.905 + 0.925, 1]],
  ], [1, 1, 0, 1]);
  renderer.popMatrix();

  drawPolylines([
    [[0.13, -1.10, 1], [-0.07, -1.10, 1], [-0.07, -1.30, 1], [0.13, -1.30, 1], [0.13, -1.10, 1]],
  ], [1, 1, 1, 1]);

  renderer.pushMatrix();
  renderer.translatef(-0.015, -0.03, 0);
  renderer.scalef(1.2, 1.2, 1.2);
  drawPolylines([
    [[0.4, 1.20, 0], [0.415, 1.20, 0], [0.415, 1.27, 0], [0.4, 1.27, 0], [0.4, 1.20, 0]],
    [[0.43, 1.20, 0], [0.445, 1.20, 0], [0.445, 1.27, 0], [0.43, 1.27, 0], [0.43, 1.20, 0]],
    [[0.3475, 1.16, 0], [0.4975, 1.16, 0], [0.4975, 1.31, 0], [0.3475, 1.31, 0], [0.3475, 1.16, 0]],
  ], [1, 1, 1, 1]);
  renderer.popMatrix();
}

function fillQuad(a, b, c, d, color = [1, 1, 1, 0.35]) {
  renderer.color4f(...color);
  renderer.begin(GL.TRIANGLE_FAN);
  renderer.vertex3f(...a);
  renderer.vertex3f(...b);
  renderer.vertex3f(...c);
  renderer.vertex3f(...d);
  renderer.end();
}

const texcoordsTiled = [0, 3, 0, 0, 3, 0, 3, 3];
function drawTexture(index, vertices, color = [1, 1, 1, 1]) {
  if (!state.textures[index]) return;
  renderer.bindTexture(state.textures[index]);
  // Use tiled UVs for background (index 1), normal UVs for others
  renderer.drawTexturedQuad(vertices, index === 1 ? texcoordsTiled : texcoords, color);
}

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
  return { pic, color: [r, g, b, 1] };
}

function drawCube(cx, cy, cz, scale, color) {
  const s = scale;
  const x0 = cx - s;
  const x1 = cx + s;
  const y0 = cy - s;
  const y1 = cy + s;
  const z0 = cz - s;
  const z1 = cz + s;
  const faceColor = [color[0], color[1], color[2], 1];
  fillQuad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], faceColor);
  fillQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], faceColor);
  fillQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], faceColor);
  fillQuad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], faceColor);
  fillQuad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], faceColor);
  fillQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], faceColor);
}

function drawBlockArrayPreview(blockArray, scale) {
  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 7; z += 1) {
        const value = blockArray[x][y][z];
        if (!value) continue;
        drawBlockVisual(x, y, z + 1.5, value, scale, false);
      }
    }
  }
}

function drawHoldPreview() {
  if (state.hidenext !== 0) return;
  renderer.pushMatrix();
  renderer.translatef(-0.45, -1.2, 0);
  renderer.translatef(0.480, 0.210, 0);
  renderer.rotatef(state.wAngleX, 1, 0, 0);
  renderer.rotatef(state.wAngleY, 0, 1, 0);
  renderer.rotatef(state.wAngleZ, 0, 0, 1);
  drawBlockArrayPreview(state.holdblock, 0.02);
  renderer.popMatrix();
}

function drawNextPreview() {
  if (state.hidenext !== 0) return;
  renderer.pushMatrix();
  renderer.translatef(0.6, 0.55, 0);
  renderer.rotatef(state.wAngleX, 1, 0, 0);
  renderer.rotatef(state.wAngleY, 0, 1, 0);
  renderer.rotatef(state.wAngleZ, 0, 0, 1);
  drawBlockArrayPreview(state.nextblock, 0.03);
  renderer.popMatrix();
}

function drawWireCube(cx, cy, cz, scale, color) {
  const s = scale;
  lineStrip([[cx - s, cy + s, cz + s], [cx + s, cy + s, cz + s], [cx + s, cy + s, cz - s], [cx - s, cy + s, cz - s], [cx - s, cy + s, cz + s]], color);
  lineStrip([[cx - s, cy - s, cz + s], [cx + s, cy - s, cz + s], [cx + s, cy - s, cz - s], [cx - s, cy - s, cz - s], [cx - s, cy - s, cz + s]], color);
  lineStrip([[cx + s, cy - s, cz + s], [cx + s, cy + s, cz + s], [cx + s, cy + s, cz - s], [cx + s, cy - s, cz - s], [cx + s, cy - s, cz + s]], color);
  lineStrip([[cx - s, cy - s, cz + s], [cx - s, cy + s, cz + s], [cx - s, cy + s, cz - s], [cx - s, cy - s, cz - s], [cx - s, cy - s, cz + s]], color);
  lineStrip([[cx + s, cy - s, cz + s], [cx + s, cy + s, cz + s], [cx - s, cy + s, cz + s], [cx - s, cy - s, cz + s], [cx + s, cy - s, cz + s]], color);
  lineStrip([[cx + s, cy - s, cz - s], [cx + s, cy + s, cz - s], [cx - s, cy + s, cz - s], [cx - s, cy - s, cz - s], [cx + s, cy - s, cz - s]], color);
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

function drawSpecialPic(pic, x, y, z, t, color, val) {
  const e = 1.0005 * t;
  let specialColor = color;
  if (pic === 27) {
    specialColor = jitterColor(16384, 32768, 65536, color);
  } else if (pic === 68 || pic === 70) {
    specialColor = jitterColor(65536, 16384, 65536, color);
  } else if (pic === 40) {
    specialColor = jitterColor(16384, 16384, 16384, color);
  } else if (pic === 38 || pic === 41 || pic === 52 || pic === 54 || pic === 55 || pic === 60 || pic === 62) {
    specialColor = jitterColor(65536, 65536, 16384, color);
  } else if (pic === 53 || pic === 56 || pic === 57 || pic === 58 || pic === 59 || pic === 61 || pic === 63 || pic === 65 || pic === 66 || pic === 69 || pic === 75 || pic === 94 || pic === 96) {
    specialColor = jitterColor(16384, 65536, 65536, color);
  } else if (pic === 72 || pic === 73 || pic === 74 || pic === 80 || pic === 81 || pic === 84 || pic === 85 || pic === 86) {
    specialColor = jitterColor(16384, 32768, 65536, color);
  }
  const q = (verts, alpha = 1) => fillQuad(verts[0], verts[1], verts[2], verts[3], [specialColor[0], specialColor[1], specialColor[2], alpha]);
  const lc = specialColor;
  if (pic === 27) {
    lineStrip([[0.6 * t + x, -0.6 * t + y, e + z], [0.6 * t + x, 0.6 * t + y, e + z], [-0.6 * t + x, 0.6 * t + y, e + z], [-0.6 * t + x, -0.6 * t + y, e + z], [0.2 * t + x, -0.6 * t + y, e + z], [-0.1 * t + x, -0.4 * t + y, e + z], [0.2 * t + x, -0.6 * t + y, e + z], [-0.1 * t + x, -0.8 * t + y, e + z]], lc);
    lines([[0.8 * t + x, 0.8 * t + y, e + z], [-0.8 * t + x, -0.8 * t + y, e + z], [-0.8 * t + x, 0.8 * t + y, e + z], [0.8 * t + x, -0.8 * t + y, e + z]], lc);
    lineStrip([[0.6 * t + x, -0.6 * t + y, -e + z], [0.6 * t + x, 0.6 * t + y, -e + z], [-0.6 * t + x, 0.6 * t + y, -e + z], [-0.6 * t + x, -0.6 * t + y, -e + z], [0.2 * t + x, -0.6 * t + y, -e + z], [-0.1 * t + x, -0.4 * t + y, -e + z], [0.2 * t + x, -0.6 * t + y, -e + z], [-0.1 * t + x, -0.8 * t + y, -e + z]], lc);
    lines([[0.8 * t + x, 0.8 * t + y, -e + z], [-0.8 * t + x, -0.8 * t + y, -e + z], [-0.8 * t + x, 0.8 * t + y, -e + z], [0.8 * t + x, -0.8 * t + y, -e + z]], lc);
    return true;
  }
  // pic 82 (hole): three dashes at 12, 4, 8 o'clock positions
  if (pic === 82) {
    // 12 o'clock: horizontal dash at top
    lines([[- 0.15*t+x, -0.55*t+y, e+z], [0.15*t+x, -0.55*t+y, e+z]], lc);
    // 4 o'clock: dash at lower-right (120 deg)
    lines([[0.33*t+x, 0.17*t+y, e+z], [0.48*t+x, 0.43*t+y, e+z]], lc);
    // 8 o'clock: dash at lower-left (240 deg)
    lines([[-0.48*t+x, 0.43*t+y, e+z], [-0.33*t+x, 0.17*t+y, e+z]], lc);
    // Back face
    lines([[-0.15*t+x, -0.55*t+y, -e+z], [0.15*t+x, -0.55*t+y, -e+z]], lc);
    lines([[0.33*t+x, 0.17*t+y, -e+z], [0.48*t+x, 0.43*t+y, -e+z]], lc);
    lines([[-0.48*t+x, 0.43*t+y, -e+z], [-0.33*t+x, 0.17*t+y, -e+z]], lc);
    return true;
  }
  // pic 67 (zigzag): Z letter on front and back
  if (pic === 83) {
    lineStrip([[-0.5*t+x, 0.5*t+y, e+z], [0.5*t+x, 0.5*t+y, e+z], [-0.5*t+x, -0.5*t+y, e+z], [0.5*t+x, -0.5*t+y, e+z]], lc);
    lineStrip([[-0.5*t+x, 0.5*t+y, -e+z], [0.5*t+x, 0.5*t+y, -e+z], [-0.5*t+x, -0.5*t+y, -e+z], [0.5*t+x, -0.5*t+y, -e+z]], lc);
    return true;
  }
  // pic 72 (speedup >>): double right arrows on two faces
  if (pic === 72) {
    lineStrip([[-0.5 * t + x, -0.5 * t + y, e + z], [0 + x, 0 + y, e + z], [-0.5 * t + x, 0.5 * t + y, e + z]], lc);
    lineStrip([[0 + x, -0.5 * t + y, e + z], [0.5 * t + x, 0 + y, e + z], [0 + x, 0.5 * t + y, e + z]], lc);
    lineStrip([[-0.5 * t + x, -0.5 * t + y, -e + z], [0 + x, 0 + y, -e + z], [-0.5 * t + x, 0.5 * t + y, -e + z]], lc);
    lineStrip([[0 + x, -0.5 * t + y, -e + z], [0.5 * t + x, 0 + y, -e + z], [0 + x, 0.5 * t + y, -e + z]], lc);
    return true;
  }
  // pic 73 (speeddown <<): double left arrows on two faces
  if (pic === 73) {
    lineStrip([[0.5 * t + x, -0.5 * t + y, e + z], [0 + x, 0 + y, e + z], [0.5 * t + x, 0.5 * t + y, e + z]], lc);
    lineStrip([[0 + x, -0.5 * t + y, e + z], [-0.5 * t + x, 0 + y, e + z], [0 + x, 0.5 * t + y, e + z]], lc);
    lineStrip([[0.5 * t + x, -0.5 * t + y, -e + z], [0 + x, 0 + y, -e + z], [0.5 * t + x, 0.5 * t + y, -e + z]], lc);
    lineStrip([[0 + x, -0.5 * t + y, -e + z], [-0.5 * t + x, 0 + y, -e + z], [0 + x, 0.5 * t + y, -e + z]], lc);
    return true;
  }
  // pic 74 (holdlock HX): H with X on two faces
  if (pic === 74) {
    // H shape
    lines([[-0.5 * t + x, -0.5 * t + y, e + z], [-0.5 * t + x, 0.5 * t + y, e + z]], lc);
    lines([[-0.5 * t + x, 0 + y, e + z], [0.5 * t + x, 0 + y, e + z]], lc);
    lines([[0.5 * t + x, -0.5 * t + y, e + z], [0.5 * t + x, 0.5 * t + y, e + z]], lc);
    // X cross
    lines([[-0.3 * t + x, -0.3 * t + y, e + z], [0.3 * t + x, 0.3 * t + y, e + z], [0.3 * t + x, -0.3 * t + y, e + z], [-0.3 * t + x, 0.3 * t + y, e + z]], lc);
    // back face
    lines([[-0.5 * t + x, -0.5 * t + y, -e + z], [-0.5 * t + x, 0.5 * t + y, -e + z]], lc);
    lines([[-0.5 * t + x, 0 + y, -e + z], [0.5 * t + x, 0 + y, -e + z]], lc);
    lines([[0.5 * t + x, -0.5 * t + y, -e + z], [0.5 * t + x, 0.5 * t + y, -e + z]], lc);
    lines([[-0.3 * t + x, -0.3 * t + y, -e + z], [0.3 * t + x, 0.3 * t + y, -e + z], [0.3 * t + x, -0.3 * t + y, -e + z], [-0.3 * t + x, 0.3 * t + y, -e + z]], lc);
    return true;
  }
  // pic 80 (blindboard): horizontal eye shape with X on two faces
  if (pic === 80) {
    // Horizontal eye: top arc and bottom arc approximated with lineStrip
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
    // X cross
    lines([[-0.4 * t + x, -0.4 * t + y, e + z], [0.4 * t + x, 0.4 * t + y, e + z], [0.4 * t + x, -0.4 * t + y, e + z], [-0.4 * t + x, 0.4 * t + y, e + z]], lc);
    // Back face
    lineStrip(eyeTop.map(p => [p[0], p[1], -e + z]), lc);
    lineStrip(eyeBot.map(p => [p[0], p[1], -e + z]), lc);
    lines([[-0.4 * t + x, -0.4 * t + y, -e + z], [0.4 * t + x, 0.4 * t + y, -e + z], [0.4 * t + x, -0.4 * t + y, -e + z], [-0.4 * t + x, 0.4 * t + y, -e + z]], lc);
    return true;
  }
  // pic 81 (bombnext): 品 shape on two faces
  if (pic === 81) {
    // Front face: top 밭 + two bottom 밭
    lineStrip([[-0.2*t+x, -0.6*t+y, e+z], [0.2*t+x, -0.6*t+y, e+z], [0.2*t+x, -0.2*t+y, e+z], [-0.2*t+x, -0.2*t+y, e+z], [-0.2*t+x, -0.6*t+y, e+z]], lc);
    lines([[0+x, -0.6*t+y, e+z], [0+x, -0.2*t+y, e+z], [-0.2*t+x, -0.4*t+y, e+z], [0.2*t+x, -0.4*t+y, e+z]], lc);
    lineStrip([[-0.5*t+x, 0.0+y, e+z], [-0.1*t+x, 0.0+y, e+z], [-0.1*t+x, 0.4*t+y, e+z], [-0.5*t+x, 0.4*t+y, e+z], [-0.5*t+x, 0.0+y, e+z]], lc);
    lines([[-0.3*t+x, 0.0+y, e+z], [-0.3*t+x, 0.4*t+y, e+z], [-0.5*t+x, 0.2*t+y, e+z], [-0.1*t+x, 0.2*t+y, e+z]], lc);
    lineStrip([[0.1*t+x, 0.0+y, e+z], [0.5*t+x, 0.0+y, e+z], [0.5*t+x, 0.4*t+y, e+z], [0.1*t+x, 0.4*t+y, e+z], [0.1*t+x, 0.0+y, e+z]], lc);
    lines([[0.3*t+x, 0.0+y, e+z], [0.3*t+x, 0.4*t+y, e+z], [0.1*t+x, 0.2*t+y, e+z], [0.5*t+x, 0.2*t+y, e+z]], lc);
    // Back face
    lineStrip([[-0.2*t+x, -0.6*t+y, -e+z], [0.2*t+x, -0.6*t+y, -e+z], [0.2*t+x, -0.2*t+y, -e+z], [-0.2*t+x, -0.2*t+y, -e+z], [-0.2*t+x, -0.6*t+y, -e+z]], lc);
    lines([[0+x, -0.6*t+y, -e+z], [0+x, -0.2*t+y, -e+z], [-0.2*t+x, -0.4*t+y, -e+z], [0.2*t+x, -0.4*t+y, -e+z]], lc);
    lineStrip([[-0.5*t+x, 0.0+y, -e+z], [-0.1*t+x, 0.0+y, -e+z], [-0.1*t+x, 0.4*t+y, -e+z], [-0.5*t+x, 0.4*t+y, -e+z], [-0.5*t+x, 0.0+y, -e+z]], lc);
    lines([[-0.3*t+x, 0.0+y, -e+z], [-0.3*t+x, 0.4*t+y, -e+z], [-0.5*t+x, 0.2*t+y, -e+z], [-0.1*t+x, 0.2*t+y, -e+z]], lc);
    lineStrip([[0.1*t+x, 0.0+y, -e+z], [0.5*t+x, 0.0+y, -e+z], [0.5*t+x, 0.4*t+y, -e+z], [0.1*t+x, 0.4*t+y, -e+z], [0.1*t+x, 0.0+y, -e+z]], lc);
    lines([[0.3*t+x, 0.0+y, -e+z], [0.3*t+x, 0.4*t+y, -e+z], [0.1*t+x, 0.2*t+y, -e+z], [0.5*t+x, 0.2*t+y, -e+z]], lc);
    return true;
  }
  // pic 85 (Simplify2): two boxes on two faces
  if (pic === 85) {
    // Two boxes on all 6 faces
    // Front/Back (z faces)
    lineStrip([[-0.5*t+x,-0.3*t+y,e+z],[-.05*t+x,-0.3*t+y,e+z],[-.05*t+x,0.3*t+y,e+z],[-0.5*t+x,0.3*t+y,e+z],[-0.5*t+x,-0.3*t+y,e+z]], lc);
    lineStrip([[0.05*t+x,-0.3*t+y,e+z],[0.5*t+x,-0.3*t+y,e+z],[0.5*t+x,0.3*t+y,e+z],[0.05*t+x,0.3*t+y,e+z],[0.05*t+x,-0.3*t+y,e+z]], lc);
    lineStrip([[-0.5*t+x,-0.3*t+y,-e+z],[-.05*t+x,-0.3*t+y,-e+z],[-.05*t+x,0.3*t+y,-e+z],[-0.5*t+x,0.3*t+y,-e+z],[-0.5*t+x,-0.3*t+y,-e+z]], lc);
    lineStrip([[0.05*t+x,-0.3*t+y,-e+z],[0.5*t+x,-0.3*t+y,-e+z],[0.5*t+x,0.3*t+y,-e+z],[0.05*t+x,0.3*t+y,-e+z],[0.05*t+x,-0.3*t+y,-e+z]], lc);
    // Top/Bottom (y faces)
    lineStrip([[-0.5*t+x,e+y,-0.3*t+z],[-.05*t+x,e+y,-0.3*t+z],[-.05*t+x,e+y,0.3*t+z],[-0.5*t+x,e+y,0.3*t+z],[-0.5*t+x,e+y,-0.3*t+z]], lc);
    lineStrip([[0.05*t+x,e+y,-0.3*t+z],[0.5*t+x,e+y,-0.3*t+z],[0.5*t+x,e+y,0.3*t+z],[0.05*t+x,e+y,0.3*t+z],[0.05*t+x,e+y,-0.3*t+z]], lc);
    lineStrip([[-0.5*t+x,-e+y,-0.3*t+z],[-.05*t+x,-e+y,-0.3*t+z],[-.05*t+x,-e+y,0.3*t+z],[-0.5*t+x,-e+y,0.3*t+z],[-0.5*t+x,-e+y,-0.3*t+z]], lc);
    lineStrip([[0.05*t+x,-e+y,-0.3*t+z],[0.5*t+x,-e+y,-0.3*t+z],[0.5*t+x,-e+y,0.3*t+z],[0.05*t+x,-e+y,0.3*t+z],[0.05*t+x,-e+y,-0.3*t+z]], lc);
    // Left/Right (x faces)
    lineStrip([[e+x,-0.3*t+y,-0.5*t+z],[e+x,-0.3*t+y,-.05*t+z],[e+x,0.3*t+y,-.05*t+z],[e+x,0.3*t+y,-0.5*t+z],[e+x,-0.3*t+y,-0.5*t+z]], lc);
    lineStrip([[e+x,-0.3*t+y,0.05*t+z],[e+x,-0.3*t+y,0.5*t+z],[e+x,0.3*t+y,0.5*t+z],[e+x,0.3*t+y,0.05*t+z],[e+x,-0.3*t+y,0.05*t+z]], lc);
    lineStrip([[-e+x,-0.3*t+y,-0.5*t+z],[-e+x,-0.3*t+y,-.05*t+z],[-e+x,0.3*t+y,-.05*t+z],[-e+x,0.3*t+y,-0.5*t+z],[-e+x,-0.3*t+y,-0.5*t+z]], lc);
    lineStrip([[-e+x,-0.3*t+y,0.05*t+z],[-e+x,-0.3*t+y,0.5*t+z],[-e+x,0.3*t+y,0.5*t+z],[-e+x,0.3*t+y,0.05*t+z],[-e+x,-0.3*t+y,0.05*t+z]], lc);
    return true;
  }
  // pic 86 (PentaForce): 3 boxes top + 2 boxes bottom on two faces
  if (pic === 86) {
    // Front: top 3
    lineStrip([[-0.55*t+x,-0.55*t+y,e+z],[-0.22*t+x,-0.55*t+y,e+z],[-0.22*t+x,-0.1*t+y,e+z],[-0.55*t+x,-0.1*t+y,e+z],[-0.55*t+x,-0.55*t+y,e+z]], lc);
    lineStrip([[-0.165*t+x,-0.55*t+y,e+z],[0.165*t+x,-0.55*t+y,e+z],[0.165*t+x,-0.1*t+y,e+z],[-0.165*t+x,-0.1*t+y,e+z],[-0.165*t+x,-0.55*t+y,e+z]], lc);
    lineStrip([[0.22*t+x,-0.55*t+y,e+z],[0.55*t+x,-0.55*t+y,e+z],[0.55*t+x,-0.1*t+y,e+z],[0.22*t+x,-0.1*t+y,e+z],[0.22*t+x,-0.55*t+y,e+z]], lc);
    // Front: bottom 2
    lineStrip([[-0.4*t+x,0.05*t+y,e+z],[-0.03*t+x,0.05*t+y,e+z],[-0.03*t+x,0.5*t+y,e+z],[-0.4*t+x,0.5*t+y,e+z],[-0.4*t+x,0.05*t+y,e+z]], lc);
    lineStrip([[0.03*t+x,0.05*t+y,e+z],[0.4*t+x,0.05*t+y,e+z],[0.4*t+x,0.5*t+y,e+z],[0.03*t+x,0.5*t+y,e+z],[0.03*t+x,0.05*t+y,e+z]], lc);
    // Back
    lineStrip([[-0.55*t+x,-0.55*t+y,-e+z],[-0.22*t+x,-0.55*t+y,-e+z],[-0.22*t+x,-0.1*t+y,-e+z],[-0.55*t+x,-0.1*t+y,-e+z],[-0.55*t+x,-0.55*t+y,-e+z]], lc);
    lineStrip([[-0.165*t+x,-0.55*t+y,-e+z],[0.165*t+x,-0.55*t+y,-e+z],[0.165*t+x,-0.1*t+y,-e+z],[-0.165*t+x,-0.1*t+y,-e+z],[-0.165*t+x,-0.55*t+y,-e+z]], lc);
    lineStrip([[0.22*t+x,-0.55*t+y,-e+z],[0.55*t+x,-0.55*t+y,-e+z],[0.55*t+x,-0.1*t+y,-e+z],[0.22*t+x,-0.1*t+y,-e+z],[0.22*t+x,-0.55*t+y,-e+z]], lc);
    lineStrip([[-0.4*t+x,0.05*t+y,-e+z],[-0.03*t+x,0.05*t+y,-e+z],[-0.03*t+x,0.5*t+y,-e+z],[-0.4*t+x,0.5*t+y,-e+z],[-0.4*t+x,0.05*t+y,-e+z]], lc);
    lineStrip([[0.03*t+x,0.05*t+y,-e+z],[0.4*t+x,0.05*t+y,-e+z],[0.4*t+x,0.5*t+y,-e+z],[0.03*t+x,0.5*t+y,-e+z],[0.03*t+x,0.05*t+y,-e+z]], lc);
    // Top face (+y): 3 top + 2 bottom mapped to xz plane
    lineStrip([[-0.55*t+x,e+y,-0.55*t+z],[-0.22*t+x,e+y,-0.55*t+z],[-0.22*t+x,e+y,-0.1*t+z],[-0.55*t+x,e+y,-0.1*t+z],[-0.55*t+x,e+y,-0.55*t+z]], lc);
    lineStrip([[-0.165*t+x,e+y,-0.55*t+z],[0.165*t+x,e+y,-0.55*t+z],[0.165*t+x,e+y,-0.1*t+z],[-0.165*t+x,e+y,-0.1*t+z],[-0.165*t+x,e+y,-0.55*t+z]], lc);
    lineStrip([[0.22*t+x,e+y,-0.55*t+z],[0.55*t+x,e+y,-0.55*t+z],[0.55*t+x,e+y,-0.1*t+z],[0.22*t+x,e+y,-0.1*t+z],[0.22*t+x,e+y,-0.55*t+z]], lc);
    lineStrip([[-0.4*t+x,e+y,0.05*t+z],[-0.03*t+x,e+y,0.05*t+z],[-0.03*t+x,e+y,0.5*t+z],[-0.4*t+x,e+y,0.5*t+z],[-0.4*t+x,e+y,0.05*t+z]], lc);
    lineStrip([[0.03*t+x,e+y,0.05*t+z],[0.4*t+x,e+y,0.05*t+z],[0.4*t+x,e+y,0.5*t+z],[0.03*t+x,e+y,0.5*t+z],[0.03*t+x,e+y,0.05*t+z]], lc);
    // Bottom face (-y)
    lineStrip([[-0.55*t+x,-e+y,-0.55*t+z],[-0.22*t+x,-e+y,-0.55*t+z],[-0.22*t+x,-e+y,-0.1*t+z],[-0.55*t+x,-e+y,-0.1*t+z],[-0.55*t+x,-e+y,-0.55*t+z]], lc);
    lineStrip([[-0.165*t+x,-e+y,-0.55*t+z],[0.165*t+x,-e+y,-0.55*t+z],[0.165*t+x,-e+y,-0.1*t+z],[-0.165*t+x,-e+y,-0.1*t+z],[-0.165*t+x,-e+y,-0.55*t+z]], lc);
    lineStrip([[0.22*t+x,-e+y,-0.55*t+z],[0.55*t+x,-e+y,-0.55*t+z],[0.55*t+x,-e+y,-0.1*t+z],[0.22*t+x,-e+y,-0.1*t+z],[0.22*t+x,-e+y,-0.55*t+z]], lc);
    lineStrip([[-0.4*t+x,-e+y,0.05*t+z],[-0.03*t+x,-e+y,0.05*t+z],[-0.03*t+x,-e+y,0.5*t+z],[-0.4*t+x,-e+y,0.5*t+z],[-0.4*t+x,-e+y,0.05*t+z]], lc);
    lineStrip([[0.03*t+x,-e+y,0.05*t+z],[0.4*t+x,-e+y,0.05*t+z],[0.4*t+x,-e+y,0.5*t+z],[0.03*t+x,-e+y,0.5*t+z],[0.03*t+x,-e+y,0.05*t+z]], lc);
    // Right face (+x): mapped to yz plane
    lineStrip([[e+x,-0.55*t+y,-0.55*t+z],[e+x,-0.22*t+y,-0.55*t+z],[e+x,-0.22*t+y,-0.1*t+z],[e+x,-0.55*t+y,-0.1*t+z],[e+x,-0.55*t+y,-0.55*t+z]], lc);
    lineStrip([[e+x,-0.165*t+y,-0.55*t+z],[e+x,0.165*t+y,-0.55*t+z],[e+x,0.165*t+y,-0.1*t+z],[e+x,-0.165*t+y,-0.1*t+z],[e+x,-0.165*t+y,-0.55*t+z]], lc);
    lineStrip([[e+x,0.22*t+y,-0.55*t+z],[e+x,0.55*t+y,-0.55*t+z],[e+x,0.55*t+y,-0.1*t+z],[e+x,0.22*t+y,-0.1*t+z],[e+x,0.22*t+y,-0.55*t+z]], lc);
    lineStrip([[e+x,-0.4*t+y,0.05*t+z],[e+x,-0.03*t+y,0.05*t+z],[e+x,-0.03*t+y,0.5*t+z],[e+x,-0.4*t+y,0.5*t+z],[e+x,-0.4*t+y,0.05*t+z]], lc);
    lineStrip([[e+x,0.03*t+y,0.05*t+z],[e+x,0.4*t+y,0.05*t+z],[e+x,0.4*t+y,0.5*t+z],[e+x,0.03*t+y,0.5*t+z],[e+x,0.03*t+y,0.05*t+z]], lc);
    // Left face (-x)
    lineStrip([[-e+x,-0.55*t+y,-0.55*t+z],[-e+x,-0.22*t+y,-0.55*t+z],[-e+x,-0.22*t+y,-0.1*t+z],[-e+x,-0.55*t+y,-0.1*t+z],[-e+x,-0.55*t+y,-0.55*t+z]], lc);
    lineStrip([[-e+x,-0.165*t+y,-0.55*t+z],[-e+x,0.165*t+y,-0.55*t+z],[-e+x,0.165*t+y,-0.1*t+z],[-e+x,-0.165*t+y,-0.1*t+z],[-e+x,-0.165*t+y,-0.55*t+z]], lc);
    lineStrip([[-e+x,0.22*t+y,-0.55*t+z],[-e+x,0.55*t+y,-0.55*t+z],[-e+x,0.55*t+y,-0.1*t+z],[-e+x,0.22*t+y,-0.1*t+z],[-e+x,0.22*t+y,-0.55*t+z]], lc);
    lineStrip([[-e+x,-0.4*t+y,0.05*t+z],[-e+x,-0.03*t+y,0.05*t+z],[-e+x,-0.03*t+y,0.5*t+z],[-e+x,-0.4*t+y,0.5*t+z],[-e+x,-0.4*t+y,0.05*t+z]], lc);
    lineStrip([[-e+x,0.03*t+y,0.05*t+z],[-e+x,0.4*t+y,0.05*t+z],[-e+x,0.4*t+y,0.5*t+z],[-e+x,0.03*t+y,0.5*t+z],[-e+x,0.03*t+y,0.05*t+z]], lc);
    return true;
  }
  // pic 84 (빈공간삭제): thick down arrow on two faces
  if (pic === 84) {
    // Front face: two vertical lines + V (arrow pointing down, -y)
    lines([[-0.25*t+x, 0.6*t+y, e+z], [-0.25*t+x, -0.1*t+y, e+z]], lc);
    lines([[0.25*t+x, 0.6*t+y, e+z], [0.25*t+x, -0.1*t+y, e+z]], lc);
    lineStrip([[-0.5*t+x, -0.1*t+y, e+z], [x, -0.6*t+y, e+z], [0.5*t+x, -0.1*t+y, e+z]], lc);
    // Back face
    lines([[-0.25*t+x, 0.6*t+y, -e+z], [-0.25*t+x, -0.1*t+y, -e+z]], lc);
    lines([[0.25*t+x, 0.6*t+y, -e+z], [0.25*t+x, -0.1*t+y, -e+z]], lc);
    lineStrip([[-0.5*t+x, -0.1*t+y, -e+z], [x, -0.6*t+y, -e+z], [0.5*t+x, -0.1*t+y, -e+z]], lc);
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
    // self-destruct: 3 perpendicular squares/cross (same as bombs)
    lineStrip([[x, t + y, t + z], [x, -t + y, t + z], [x, -t + y, -t + z], [x, t + y, -t + z], [x, t + y, t + z]], lc);
    lineStrip([[t + x, y, t + z], [-t + x, y, t + z], [-t + x, y, -t + z], [t + x, y, -t + z], [t + x, y, t + z]], lc);
    lineStrip([[t + x, t + y, z], [-t + x, t + y, z], [-t + x, -t + y, z], [t + x, -t + y, z], [t + x, t + y, z]], lc);
    return true;
  }
  if (pic === 75) {
    // obstacle: filled cross (+ shape) on two faces
    q([[0.3 * t + x, 0.1 * t + y, -e + z], [-0.3 * t + x, 0.1 * t + y, -e + z], [-0.3 * t + x, -0.1 * t + y, -e + z], [0.3 * t + x, -0.1 * t + y, -e + z]]);
    q([[0.3 * t + x, 0.1 * t + y, e + z], [-0.3 * t + x, 0.1 * t + y, e + z], [-0.3 * t + x, -0.1 * t + y, e + z], [0.3 * t + x, -0.1 * t + y, e + z]]);
    q([[0.1 * t + x, 0.3 * t + y, -e + z], [-0.1 * t + x, 0.3 * t + y, -e + z], [-0.1 * t + x, -0.3 * t + y, -e + z], [0.1 * t + x, -0.3 * t + y, -e + z]]);
    q([[0.1 * t + x, 0.3 * t + y, e + z], [-0.1 * t + x, 0.3 * t + y, e + z], [-0.1 * t + x, -0.3 * t + y, e + z], [0.1 * t + x, -0.3 * t + y, e + z]]);
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
  // pic 8: 거울상 (mirror) — trapezoid (| on front/back z faces
  if (pic === 8 && (val & 255) === 200) {
    specialColor = [1, 1, 1, 0.8];
    // Front face (+z): vertical bar | + angled line (
    lineStrip([[0.4*t+x, -0.8*t+y, e+z], [0.4*t+x, 0.8*t+y, e+z]], specialColor);
    lineStrip([[-0.2*t+x, -0.8*t+y, e+z], [-0.7*t+x, -0.3*t+y, e+z], [-0.7*t+x, 0.3*t+y, e+z], [-0.2*t+x, 0.8*t+y, e+z]], specialColor);
    // Back face (-z)
    lineStrip([[0.4*t+x, -0.8*t+y, -e+z], [0.4*t+x, 0.8*t+y, -e+z]], specialColor);
    lineStrip([[-0.2*t+x, -0.8*t+y, -e+z], [-0.7*t+x, -0.3*t+y, -e+z], [-0.7*t+x, 0.3*t+y, -e+z], [-0.2*t+x, 0.8*t+y, -e+z]], specialColor);
    return true;
  }
  return false;
}

function drawBlockVisual(gridX, gridY, gridZ, value, scale, highlight = false) {
  const { pic, color } = decodeBlockVisual(value);
  const x = (gridX - 3) * 2 * scale;
  const z = (gridY - 3) * 2 * scale;
  const y = (gridZ - 4.5) * 2 * scale;
  const base = color;
  if (pic === 95) {
    renderer.lineWidth(1.4);
    drawWireCube(x, y, z, scale, base);
    return;
  }
  // Always draw solid cube body first (C++ lines 4704-4731)
  drawCube(x, y, z, scale, base);
  // Draw special decorations on top
  if (drawSpecialPic(pic, x, y, z, scale, base, value)) {
    renderer.lineWidth(1.4);
    return;
  }
  // Default case: brighter face quads at tlf=t*0.85 (C++ lines 5829-5867)
  const tlf = scale * 0.85;
  const e = 1.0005 * scale;
  const bright = [base[0] * 1.2, base[1] * 1.2, base[2] * 1.2, 1];
  fillQuad([-tlf + x, -e + y, tlf + z], [tlf + x, -e + y, tlf + z], [tlf + x, -e + y, -tlf + z], [-tlf + x, -e + y, -tlf + z], bright);
  fillQuad([-tlf + x, e + y, tlf + z], [tlf + x, e + y, tlf + z], [tlf + x, e + y, -tlf + z], [-tlf + x, e + y, -tlf + z], bright);
  fillQuad([e + x, -tlf + y, tlf + z], [e + x, tlf + y, tlf + z], [e + x, tlf + y, -tlf + z], [e + x, -tlf + y, -tlf + z], bright);
  fillQuad([-e + x, -tlf + y, tlf + z], [-e + x, tlf + y, tlf + z], [-e + x, tlf + y, -tlf + z], [-e + x, -tlf + y, -tlf + z], bright);
  fillQuad([-tlf + x, -tlf + y, e + z], [tlf + x, -tlf + y, e + z], [tlf + x, tlf + y, e + z], [-tlf + x, tlf + y, e + z], bright);
  fillQuad([-tlf + x, -tlf + y, -e + z], [tlf + x, -tlf + y, -e + z], [tlf + x, tlf + y, -e + z], [-tlf + x, tlf + y, -e + z], bright);
  renderer.lineWidth(1.4);
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

function drawBoardAndBlocks() {
  if (state.blindboard > now()) return;
  const t2 = state.t2;
  const floorY = -9.95 * t2 + state.floorz * 2 * t2;
  const floorFillTop = -9.975 * t2 + state.floorz * 2 * t2;
  const floorFillBottom = -10.025 * t2 + state.floorz * 2 * t2;
  const floorY2 = -10.05 * t2 + state.floorz * 2 * t2;

  fillQuad([-7 * t2, floorFillTop, -7 * t2], [7 * t2, floorFillTop, -7 * t2], [7 * t2, floorFillTop, 7 * t2], [-7 * t2, floorFillTop, 7 * t2], [0.7, 0.7, 0.7, 1]);
  fillQuad([-7 * t2, floorFillBottom, -7 * t2], [7 * t2, floorFillBottom, -7 * t2], [7 * t2, floorFillBottom, 7 * t2], [-7 * t2, floorFillBottom, 7 * t2], [0.7, 0.7, 0.7, 1]);
  lineStrip([[-7 * t2, floorY, -7 * t2], [7 * t2, floorY, -7 * t2], [7 * t2, floorY, 7 * t2], [-7 * t2, floorY, 7 * t2], [-7 * t2, floorY, -7 * t2]]);
  lineStrip([[-5 * t2, floorY, -5 * t2], [5 * t2, floorY, -5 * t2], [5 * t2, floorY, 5 * t2], [-5 * t2, floorY, 5 * t2], [-5 * t2, floorY, -5 * t2]]);
  lineStrip([[-3 * t2, floorY, -3 * t2], [3 * t2, floorY, -3 * t2], [3 * t2, floorY, 3 * t2], [-3 * t2, floorY, 3 * t2], [-3 * t2, floorY, -3 * t2]]);
  lines([
    [-7 * t2, floorY, -1 * t2], [7 * t2, floorY, -1 * t2],
    [-7 * t2, floorY, 1 * t2], [7 * t2, floorY, 1 * t2],
    [t2, floorY, 7 * t2], [t2, floorY, -7 * t2],
    [-t2, floorY, -7 * t2], [-t2, floorY, 7 * t2],
  ]);
  lineStrip([[-7 * t2, floorY2, -7 * t2], [7 * t2, floorY2, -7 * t2], [7 * t2, floorY2, 7 * t2], [-7 * t2, floorY2, 7 * t2], [-7 * t2, floorY2, -7 * t2]]);
  lineStrip([[-5 * t2, floorY2, -5 * t2], [5 * t2, floorY2, -5 * t2], [5 * t2, floorY2, 5 * t2], [-5 * t2, floorY2, 5 * t2], [-5 * t2, floorY2, -5 * t2]]);
  lineStrip([[-3 * t2, floorY2, -3 * t2], [3 * t2, floorY2, -3 * t2], [3 * t2, floorY2, 3 * t2], [-3 * t2, floorY2, 3 * t2], [-3 * t2, floorY2, -3 * t2]]);
  lines([
    [-7 * t2, floorY2, -1 * t2], [7 * t2, floorY2, -1 * t2],
    [-7 * t2, floorY2, 1 * t2], [7 * t2, floorY2, 1 * t2],
    [t2, floorY2, 7 * t2], [t2, floorY2, -7 * t2],
    [-t2, floorY2, -7 * t2], [-t2, floorY2, 7 * t2],
  ]);
  lineStrip([[-7 * t2, floorY2, -7 * t2], [7 * t2, floorY2, -7 * t2], [7 * t2, floorY2, 7 * t2], [-7 * t2, floorY2, 7 * t2], [-7 * t2, floorY2, -7 * t2]]);
  lineStrip([[-7 * t2, 6 * t2, -7 * t2], [7 * t2, 6 * t2, -7 * t2], [7 * t2, 6 * t2, 7 * t2], [-7 * t2, 6 * t2, 7 * t2], [-7 * t2, 6 * t2, -7 * t2]]);
  if (state.floorz === 0) {
    lineStrip([[-7 * t2, -9.95 * t2, -7 * t2], [7 * t2, -9.95 * t2, -7 * t2], [7 * t2, -9.95 * t2, 7 * t2], [-7 * t2, -9.95 * t2, 7 * t2], [-7 * t2, -9.95 * t2, -7 * t2]]);
    lineStrip([[-5 * t2, -9.95 * t2, -5 * t2], [5 * t2, -9.95 * t2, -5 * t2], [5 * t2, -9.95 * t2, 5 * t2], [-5 * t2, -9.95 * t2, 5 * t2], [-5 * t2, -9.95 * t2, -5 * t2]]);
    lineStrip([[-3 * t2, -9.95 * t2, -3 * t2], [3 * t2, -9.95 * t2, -3 * t2], [3 * t2, -9.95 * t2, 3 * t2], [-3 * t2, -9.95 * t2, 3 * t2], [-3 * t2, -9.95 * t2, -3 * t2]]);
    lines([
      [-7 * t2, -9.95 * t2, -1 * t2], [7 * t2, -9.95 * t2, -1 * t2],
      [-7 * t2, -9.95 * t2, 1 * t2], [7 * t2, -9.95 * t2, 1 * t2],
      [t2, -9.95 * t2, 7 * t2], [t2, -9.95 * t2, -7 * t2],
      [-t2, -9.95 * t2, -7 * t2], [-t2, -9.95 * t2, 7 * t2],
    ]);
  }
  lines([
    [-7 * t2, floorY2, -7 * t2], [-7 * t2, 6 * t2, -7 * t2],
    [7 * t2, floorY2, -7 * t2], [7 * t2, 6 * t2, -7 * t2],
    [-7 * t2, floorY2, 7 * t2], [-7 * t2, 6 * t2, 7 * t2],
    [7 * t2, floorY2, 7 * t2], [7 * t2, 6 * t2, 7 * t2],
    [-7 * t2, 15 * t2, -7 * t2], [-7 * t2, 6 * t2, -7 * t2],
    [7 * t2, 15 * t2, -7 * t2], [7 * t2, 6 * t2, -7 * t2],
    [-7 * t2, 15 * t2, 7 * t2], [-7 * t2, 6 * t2, 7 * t2],
    [7 * t2, 15 * t2, 7 * t2], [7 * t2, 6 * t2, 7 * t2],
  ]);

  for (let x = 0; x < 7; x += 1) {
    for (let y = 0; y < 7; y += 1) {
      for (let z = 0; z < 26; z += 1) {
        const value = state.blk[x][y][z];
        if (!value) continue;
        drawBlockVisual(x, y, z, value, t2);
      }
    }
  }

  if (!state.hideblock) {
    for (let x = 0; x < 7; x += 1) {
      for (let y = 0; y < 7; y += 1) {
        for (let z = 0; z < 7; z += 1) {
          const value = state.nowblock[x][y][z];
          if (!value) continue;
          drawBlockVisual(
            x + state.blockpos[0],
            y + state.blockpos[1],
            z + state.blockpos[2],
            value,
            t2,
            true,
          );
        }
      }
    }
  }
}

function getActiveItemCodes3d() {
  const codes = new Set();
  for (let x = 0; x < 7; x++) {
    for (let y = 0; y < 7; y++) {
      for (let z = 0; z < 26; z++) {
        const v = state.blk[x][y][z];
        if (v !== 0 && ITEM_DESC[v & 255]) codes.add(v & 255);
      }
    }
  }
  const pieces = [state.nowblock, state.nextblock, state.holdblock];
  for (const blk of pieces) {
    if (!blk) continue;
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) {
        for (let z = 0; z < 7; z++) {
          const v = blk[x][y][z];
          if (v !== 0 && ITEM_DESC[v & 255]) codes.add(v & 255);
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
  const codes = getActiveItemCodes3d();
  if (codes.length === 0) { state.itemInfoIndex = 0; return -1; }
  const now = Date.now();
  if (now - state.itemInfoLastSwitch > 1000) {
    state.itemInfoIndex = (state.itemInfoIndex + 1) % codes.length;
    state.itemInfoLastSwitch = now;
  }
  if (state.itemInfoIndex >= codes.length) state.itemInfoIndex = 0;
  return codes[state.itemInfoIndex];
}

// Convert overlay-space (ox, oy) to CSS pixel coordinates
function overlayToPixel(ox, oy) {
  const w = state.activitysizex, h = state.activitysizey;
  const eyeX = ox * 1.8, eyeY = oy * 1.8 - 0.2;
  const ndcX = eyeX / 1.5, ndcY = eyeY / (1.5 * h / w);
  const px = (ndcX + 1) / 2 * w;
  const py = h - ((ndcY + 1) / 2 * (h * 41 / 40) + h / 40);
  return [px, py];
}

// Shared overlay position for the block icon
const ITEM_OX = -0.58, ITEM_OY = -0.735;
const ITEM_SCALE = 0.04;

// Draw 3D block icon in WebGL (called within the overlay matrix context)
function drawItemInfoBlock(code) {
  if (code < 0) return;
  renderer.pushMatrix();
  renderer.translatef(ITEM_OX, ITEM_OY, 0);
  renderer.rotatef(25, 1, 0, 0);
  renderer.rotatef(-30, 0, 1, 0);
  drawBlockVisual(3, 3, 4.5, code, ITEM_SCALE, false);
  renderer.popMatrix();
}

// Draw text on 2D overlay (called after WebGL rendering)
function drawItemInfo3d(code) {
  ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (code < 0) return;
  const desc = ITEM_DESC[code] || '';
  const cw = overlayCanvas.width, ch = overlayCanvas.height;
  const [bx, by] = overlayToPixel(ITEM_OX, ITEM_OY);
  // Block visual half-width in pixels
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
  renderer.lineWidth(1.4);
  renderer.matrixMode("MODELVIEW");
  renderer.loadIdentity();
  renderer.clearColor(0, 0, 0, 0);
  renderer.clear(renderer.gl.COLOR_BUFFER_BIT | renderer.gl.DEPTH_BUFFER_BIT);
  renderer.viewport(0, state.activitysizey / 40, state.activitysizex, (state.activitysizey * 41) / 40);
  renderer.translatef(state.centerx - 0.6, state.centery, -4);
  renderer.rotatef(state.wAngleX, 1, 0, 0);
  renderer.rotatef(state.wAngleY, 0, 1, 0);
  renderer.rotatef(state.wAngleZ, 0, 0, 1);
  drawBoardAndBlocks();
  updateControlOrientation();
  renderer.viewport(0, state.activitysizey / 40, state.activitysizex, (state.activitysizey * 41) / 40);
  renderer.loadIdentity();
  renderer.translatef(0, -0.2, -4);
  renderer.scalef(1.8, 1.8, 1.8);
  drawGraphOverlay();
  drawControlOverlay();
  const _itemCode = getItemInfoCode();
  drawItemInfoBlock(_itemCode);
  // Background texture (C++ draw() lines 3200-3219: texture[1] at z=-9.9)
  renderer.viewport(0, 0, state.activitysizex, state.activitysizey);
  renderer.loadIdentity();
  renderer.translatef(0, 0, -4);
  drawTexture(1, [-10, 20, -9.9, -10, -20, -9.9, 10, -20, -9.9, 10, 20, -9.9], [0.4, 0.4, 0.4, 1]);
  drawItemInfo3d(_itemCode);
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
  if (word === "polycube") {
    let xt = -0.8;
    const yt = 1.8;
    lineStrip([[xt, yt - 0.1, 0], [xt, yt + 0.1, 0], [xt + 0.1, yt + 0.1, 0], [xt + 0.1, yt, 0], [xt, yt, 0]], c);
    xt += 0.2;
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt + 0.1, 0], [xt + 0.05, yt + 0.04, 0], [xt + 0.1, yt + 0.1, 0]], c);
    lines([[xt + 0.05, yt + 0.04, 0], [xt + 0.05, yt - 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0], [xt + 0.1, yt + 0.1, 0]], c);
    xt += 0.2;
    lineStrip([[xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.07, yt - 0.1, 0], [xt + 0.1, yt - 0.05, 0], [xt + 0.07, yt, 0], [xt + 0.1, yt + 0.05, 0], [xt + 0.07, yt + 0.1, 0], [xt, yt + 0.1, 0]], c);
    lines([[xt, yt, 0], [xt + 0.07, yt, 0]], c);
    xt += 0.2;
    lineStrip([[xt + 0.1, yt + 0.1, 0], [xt, yt + 0.1, 0], [xt, yt - 0.1, 0], [xt + 0.1, yt - 0.1, 0]], c);
    lines([[xt, yt, 0], [xt + 0.1, yt, 0]], c);
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
    drawExactMenuWord("polycube");
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
  drawTexture(0, [-1, 2, -1, -1, -2, -1, 1, -2, -1, 1, 2, -1], [0.5, 0.5, 0.5, 1]);
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
    const textureIndex = Math.min(state.about, Math.max(0, state.textures.length - 1));
    if (state.textures.length) {
      drawTexture(textureIndex, variants[state.about], [0.5, 0.5, 0.5, 1]);
    }
    drawStartMenuGlyphs();
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
  else drawScene3d();

  window.__polycubeAbout = state.startscreen === 1 ? state.about : -1;
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

window.addEventListener("resize", resize);
boot().catch((error) => {
  if (hud) hud.textContent = `boot failed\n${error.message}`;
  requestAnimationFrame(drawFrame);
});
})();
