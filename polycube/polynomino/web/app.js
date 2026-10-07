(() => {
const canvas = document.getElementById("app");
const hud = document.getElementById("hud");
const RAWBLOCK_SOURCE = window.RAWBLOCK_DATA_2D;
const EMBEDDED_TEXTURES = window.TEXTURE_DATA_URLS || [];

const BOARD_W = 10;
const BOARD_H = 20;
const BLOCK_SIZE = 7; // block bounding box

let ctx = null;
try {
  ctx = canvas.getContext("2d");
} catch (error) {
  if (hud) hud.textContent = `graphics init failed\n${error.message}`;
  throw error;
}

// virtual clock: the AI evaluates plans in what-if time (see aiRunPlan); normally the real clock
let _vnow = null;
const BATTLE = !!window.__battle;   // battle mode (see ../battle.js)

function now() {
  return _vnow !== null ? _vnow : performance.now();
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

function create2d(w, h, value = 0) {
  return Array.from({ length: h }, () => Array(w).fill(value));
}

function clone2d(src) {
  return src.map(row => row.slice());
}

// Touch system
const touchs = Array.from({ length: 40 }, () => ({
  flag: 0, x: 0, y: 0, oldx: 0, oldy: 0, setx: 0, sety: 0,
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
  timestamp: 0,
  vkspace: false,
  vkspace2: false,
  touchIds: new Map(),
  pointerPositions: new Map(),
  textures: [],
  rawblock: null,
  // Board: board[row][col], row 0 = bottom
  board: create2d(BOARD_W, BOARD_H),
  // Current block as list of [row, col] cells + val
  nowblock: [],   // {cells: [[r,c],...], val: number}
  nextblock: [],
  holdblock: null,
  blockpos: [0, 0], // [row, col] offset for nowblock
  blockpostmp: [0, 0],
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
  reinforce: 0,
  _cTrig: {}, _cPlaced: {}, _cBoom: 0, _cGarb: 0, _cHold: 0,
  score: 0,
  lines: 0,
  level: 1,
  asc: 0,
  gt: 0,
  ht: 0,
  oh: 0,
  oscore: 0,
  bi: 0,
  ci: 0,
  otp: 0,
  ft: 0,
  tts: false,
  upd: false,
  ul: 0,
  // Layout computed in resize
  cellSize: 0,
  boardX: 0,
  boardY: 0,
  canvasW: 0,
  canvasH: 0,
  // Soft drop key held
  softDrop: false,
  // Item info cycling
  itemInfoIndex: 0,
  itemInfoLastSwitch: 0,
};

// Texture loading (for start screen background)
let startTexture = null;
let startBgImage = null;
if (window.POLYNOMINO_START_BG) {
  startBgImage = new Image();
  startBgImage.src = window.POLYNOMINO_START_BG;
}

async function loadTexture(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
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
  if (textures.length > 0) startTexture = textures[0];
}

// Normalize touch coordinates to canvas-relative pixel coords
function normalizeTouch(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: (clientX - rect.left) * dpr,
    y: (clientY - rect.top) * dpr,
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
  if (flag !== null) touch.flag = flag;
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
  if (!state.touchIds.has(pointerId)) return;
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

// Keyboard
// Key repeat: DAS 170ms then ARR 50ms for movement; rotation = single fire
const _keyRepeatTimers = {};
const _KEY_DAS = 170;
const _KEY_ARR = 50;
const _rotTicket = {};

function _execKey(code) {
  if (state.goverflg || state.startscreen || state.pause) return;
  if (code === "Enter") {
    // Hard drop: move down until stuck, then lock (continue through cancels)
    const _hb = state.nowblock;
    let mr;
    while ((mr = moveDown()) !== 1) { if (state.nowblock !== _hb) break; }
    if (state.nowblock !== _hb) { state.timestamp = now(); return; }
    if (stickblock()) {
      gover();
      initBlockState();
      return;
    }
    calculatescore(removeline()); if (state._ovf) overflowDie();
    state.timestamp = now();
    return;
  }
  if (code === "Space") { state.vkspace2 = true; return; }
  if (code === "ArrowLeft") { move(-1); return; }
  if (code === "ArrowRight") { move(1); return; }
  if (code === "ArrowUp" || code === "KeyZ") { rotate(1); return; }
  if (code === "KeyX") { rotate(-1); return; }
  if (code === "ArrowDown") { rotate(-1); return; }
  if (code === "ShiftLeft" || code === "ShiftRight") { tryHoldSwap(); return; }
}

function _isRotKey(code) { return code === "ArrowUp" || code === "ArrowDown" || code === "KeyZ" || code === "KeyX"; }
function _isMoveKey(code) { return code === "ArrowLeft" || code === "ArrowRight"; }

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
  if (code === "Space") state.vkspace2 = false;
});

// Resize
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  state.canvasW = canvas.width;
  state.canvasH = canvas.height;
  state.activitysizex = canvas.width;
  state.activitysizey = canvas.height;

  // Compute board layout
  const maxBoardH = state.canvasH * 0.82;
  const maxBoardW = state.canvasW * 0.55;
  const cellFromH = Math.floor(maxBoardH / BOARD_H);
  const cellFromW = Math.floor(maxBoardW / BOARD_W);
  state.cellSize = Math.max(4, Math.min(cellFromH, cellFromW));
  state.boardX = Math.floor((state.canvasW - state.cellSize * BOARD_W) * 0.3);
  state.boardY = Math.floor(state.canvasH * 0.07);
}

// ====== BLOCK DATA ======
// Blocks loaded from window.RAWBLOCK_DATA_2D: array of {cells:[[r,c],...], val:number}
// We also need a "create new random block" for hexa+ random generation

function createNewBlock() {
  // Generate a random connected polyomino
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

  const grid = create2d(BLOCK_SIZE, BLOCK_SIZE);
  let r = 3, c = 3;
  let blkcnt = 0;
  const _rv={6:207,7:206,8:205,9:203,10:202,11:201,12:199,13:198,14:197};
  const val = _rv[blockcnt] || (158+blockcnt);
  let _stuck = 0;
  while (blkcnt < blockcnt) {
    if (grid[r][c] === 0) {
      grid[r][c] = val;
      blkcnt += 1;
      _stuck = 0;
    } else {
      _stuck++;
      if (_stuck > 20) {
        // Escape: find empty cell adjacent to ANY filled cell
        const adj = [];
        for (let rr = 0; rr < BLOCK_SIZE; rr++) for (let cc = 0; cc < BLOCK_SIZE; cc++) {
          if (grid[rr][cc] !== 0) {
            if (rr > 0 && grid[rr-1][cc] === 0) adj.push([rr-1,cc]);
            if (rr < BLOCK_SIZE-1 && grid[rr+1][cc] === 0) adj.push([rr+1,cc]);
            if (cc > 0 && grid[rr][cc-1] === 0) adj.push([rr,cc-1]);
            if (cc < BLOCK_SIZE-1 && grid[rr][cc+1] === 0) adj.push([rr,cc+1]);
          }
        }
        if (adj.length > 0) { [r,c] = adj[randInt(adj.length)]; _stuck = 0; continue; }
      }
    }
    switch (randInt(4)) {
      case 0: r = Math.min(BLOCK_SIZE - 1, r + 1); break;
      case 1: r = Math.max(0, r - 1); break;
      case 2: c = Math.min(BLOCK_SIZE - 1, c + 1); break;
      default: c = Math.max(0, c - 1); break;
    }
  }
  // Extract cells centered
  const cells = [];
  let rMin = BLOCK_SIZE, rMax = 0, cMin = BLOCK_SIZE, cMax = 0;
  for (let rr = 0; rr < BLOCK_SIZE; rr++) {
    for (let cc = 0; cc < BLOCK_SIZE; cc++) {
      if (grid[rr][cc] !== 0) {
        cells.push([rr, cc]);
        rMin = Math.min(rMin, rr);
        rMax = Math.max(rMax, rr);
        cMin = Math.min(cMin, cc);
        cMax = Math.max(cMax, cc);
      }
    }
  }
  const cr = Math.floor((rMin + rMax) / 2);
  const cc2 = Math.floor((cMin + cMax) / 2);
  return { cells: cells.map(([rr, cc]) => [rr - cr, cc - cc2]), val };
}

function chooseBaseBlockIndex() {
  let b1, b2, b3, b4, b5;
  switch (state.level) {
    case 1:  b1=5;  b2=15;  b3=30;  b4=100; b5=100; break;
    case 2:  b1=3;  b2=10;  b3=20;  b4=98;  b5=100; break;
    case 3:  b1=2;  b2=5;   b3=15;  b4=95;  b5=100; break;
    case 4:  b1=2;  b2=4;   b3=17;  b4=93;  b5=99;  break;
    case 5: case 6:   b1=2;  b2=4;   b3=16;  b4=90;  b5=99;  break;
    case 7: case 8:   b1=1;  b2=3;   b3=16;  b4=88;  b5=99;  break;
    case 9: case 10: case 11:  b1=1;  b2=3;   b3=15;  b4=86;  b5=98;  break;
    case 12: case 13: case 14: case 15:  b1=1;  b2=3;   b3=15;  b4=84;  b5=98;  break;
    default: b1=1;  b2=3;   b3=15;  b4=82;  b5=98;  break;
  }
  if (state.monoonly) {
    b1 = 100; b2 = 100; b3 = 100; b4 = 100;
    state.monoonly -= 1;
  }
  if (state.simplify2 > 0) {
    state.simplify2 -= 1;
    return randInt(4);
  }
  if (state.pentaForce > 0) {
    state.pentaForce -= 1;
    return 11 + randInt(18); // penta (index 11-28)
  }
  let t = randInt(100);
  if (t < b1) t = 0; // mono
  else if (t < b2) t = 1; // di
  else if (t < b3) t = 2 + randInt(2); // tri
  else if (t < b4) t = 4 + randInt(7); // tetra (7 one-sided: 4-10)
  else if (t < b5) t = 11 + randInt(18); // penta (18 one-sided: 11-28)
  else {
    // hexa+ / septomino+ / random
    if (randInt(3) === 0) {
      return -1; // signal to create random block
    } else {
      // Pick from hexa (29-88) or septomino+ (89-91)
      t = 29 + randInt(Math.max(1, (state.rawblock ? state.rawblock.length : 93) - 29));
      if (!state.rawblock || t >= state.rawblock.length) return -1;
    }
  }
  return t;
}

function assignCellValue(baseVal) {
  if (baseVal === 0) return 0;
  if (!itemsEnabled) return baseVal;
  let u = (randInt(16384) + randInt(16384) * 16384) % 1000000;
  if (u < 100) return 116;    // 2-: 0.01%
  if (u < 400) return 117;    // 2+: 0.03%
  if (u < 700) return 118;    // 범위삭제: 0.03%
  if (u < 720) return 119;    // 전체삭제: 0.002%
  if (u < 1520) return 104;   // 모노전용: 0.08%
  if (u < 4020) return 120;   // 시한폭탄0: 0.25%
  if (u < 5270) return 121;   // 시한폭탄1: 0.125%
  if (u < 6120) return 122;   // 시한폭탄2: 0.085%
  if (u < 6520) return 123;   // 시한폭탄3: 0.04%
  if (u < 6570) return 124;   // 3-: 0.005%
  if (u < 7370) return 125;   // 1+: 0.08%
  if (u < 7620) return 91;    // 회전봉인: 0.025%
  if (u < 7720) return 102;   // 상단삭제: 0.01%
  if (u < 8120) return 126;   // 횡렬삭제: 0.04%
  if (u < 8420) return 127;   // 폭탄변환: 0.03%
  if (u < 8520) return 17;    // 폭탄블록5개: 0.01%
  if (u < 8720) return 20;    // 빈공간삭제: 0.02%
  if (u < 9520) return 21;    // 소형화: 0.08%
  if (u < 10320) return 22;   // 대형화: 0.08%
  if (u < 10570) return 16;   // 시야봉인: 0.025%
  if (u < 10770) return 11;   // 장애물: 0.02%
  if (u < 11020) return 2;    // 은폐: 0.025%
  if (u < 12020) return 8;    // 속도증가: 0.1%
  if (u < 13020) return 9;    // 속도감소: 0.1%
  if (u < 13270) return 10;   // 홀드봉인: 0.025%
  if (u < 14270) return 5;    // 아이템제거: 0.1%
  if (u < 14520) return 6;    // 예측차단: 0.025%
  if (u < 14820) return 204;  // 강화: 0.03%
  if (u < 24820) return (BATTLE && randInt(16) !== 0) ? baseVal : 4;    // 득점강화: ~1% (battle mode: 1/16 of that; the block is a steal-items item there)
  if (u < 25120) return 200;  // 거울상: 0.03%
  if (u < 25420) return 19;   // 지그재그: 0.03%
  if (u < 25720) return 18;   // 구멍: 0.03%
  if (state._assignIsMonoBlock) {
    const _mr = randInt(100);
    if (_mr < 10) return 1; // selfdestruct 10%
    if (_mr < 20) {
      if (state.reinforce > 0) { state._rfUpgrade = 30; return baseVal; } // defer to multi-cell
      state.nexthb = 1; return 30; // pierce 10%
    }
    if (_mr < 60) {
      if (state.reinforce > 0) { state._rfUpgrade = 31; return baseVal; } // defer to multi-cell
      return 31; // cancel 40%
    }
  }
  if (state.monoonly || (state.simplify2 > 0 && state._assignIsMonoBlock)) return 12 + randInt(4);
  if (u > 20000 && u < 60000 && getHour() === 0 && getMinute() === 0) {
    const du = u - 20000;
    const bonus = [
      [4900, 116], [14700, 117], [14700, 118], [499, 119], [14700, 104],
      [171500, 120], [49000, 121], [34300, 122], [14700, 123], [1497, 124],
      [39200, 125], [12250, 91], [4900, 102], [9800, 126],
      [4900, 127], [9800, 1], [12250, 2], [49000, 5], [12250, 6], [40000, 4], [4900, 19], [4900, 18],
    ];
    const dp = getDateP();
    const entry = bonus[dp] || bonus[20];
    return du < entry[0] ? entry[1] : baseVal;
  }
  return baseVal;
}

// Block representation: {cells: [[r,c],...], vals: [val,...]}
// cells are relative offsets from center

function makeBlockPiece(baseCells, baseVal, isMono) {
  const cells = baseCells.map(c => [...c]);
  state._assignIsMonoBlock = !!isMono;
  const vals = cells.map(() => assignCellValue(baseVal));
  state._assignIsMonoBlock = false;
  return { cells, vals };
}

function generateBlock() {
  const idx = chooseBaseBlockIndex();
  let baseCells, baseVal;
  if (idx === -1 || !state.rawblock || idx >= state.rawblock.length) {
    const nb = createNewBlock();
    baseCells = nb.cells;
    baseVal = nb.val;
  } else {
    const src = state.rawblock[idx];
    baseCells = src.cells.map(c => [...c]);
    baseVal = src.val;
  }
  const isMono = (idx === 0) || (baseCells.length === 1);
  const piece = makeBlockPiece(baseCells, baseVal, isMono);
  // Random initial rotation
  const rots = randInt(4);
  for (let i = 0; i < rots; i++) {
    rotateCellsCW(piece);
  }
  // bombnext: force bomb(s) into the piece
  if (state.bombnext > 0) {
    const bombTypes = [120, 121, 122, 123, 127];
    const bombCount = piece.vals.length >= 5 ? 2 : 1;
    const used = new Set();
    for (let b = 0; b < bombCount && b < piece.vals.length; b++) {
      let bi;
      do { bi = randInt(piece.vals.length); } while (used.has(bi));
      used.add(bi);
      piece.vals[bi] = bombTypes[randInt(bombTypes.length)];
    }
    state.bombnext -= 1;
  }
  // simplify2: special block assignment
  if (state.simplify2 > 0) {
    const _sr = randInt(100);
    if (_sr < 40) {
      piece.vals = piece.vals.map(() => 31); // 40%: all cancel
      state.nexthb = 0;
    } else if (_sr < 50) { // 10%: all pierce or selfdestruct
      const _sv = randInt(2) === 0 ? 30 : 1;
      if (_sv === 30) state.nexthb = 1;
      piece.vals = piece.vals.map(() => _sv); // all pierce or selfdestruct
    }
  }
  // Reinforce upgrade: mono pierce/cancel → 2-3 cell pierce/cancel
  if (state._rfUpgrade) {
    const _rfCode = state._rfUpgrade;
    state._rfUpgrade = 0;
    const _rfIdx = 2 + randInt(2); // tri(2) or tri(3) = 2-3 cell block
    if (state.rawblock && _rfIdx < state.rawblock.length) {
      const src = state.rawblock[_rfIdx];
      piece.cells = src.cells.map(c => [...c]);
      piece.vals = piece.cells.map(() => _rfCode);
      if (_rfCode === 30) state.nexthb = 1;
      else state.nexthb = 0;
      const rr = randInt(4);
      for (let i = 0; i < rr; i++) rotateCellsCW(piece);
    }
  }
  return piece;
}

function _centerOfMass(piece) {
  let sr = 0, sc = 0;
  for (const [r, c] of piece.cells) { sr += r; sc += c; }
  const n = piece.cells.length;
  return [Math.round(sr / n), Math.round(sc / n)];
}

function rotateCellsCW(piece) {
  // Compute integer center of mass before rotation
  const [cr, cc] = _centerOfMass(piece);
  // Rotate each cell CW around center of mass: (r,c) -> (-(c-cc)+cr, (r-cr)+cc)
  for (let i = 0; i < piece.cells.length; i++) {
    const [r, c] = piece.cells[i];
    piece.cells[i] = [-(c - cc) + cr, (r - cr) + cc];
  }
  // Compensate integer center of mass drift
  const [nr, nc] = _centerOfMass(piece);
  if (nr !== cr || nc !== cc) {
    const dr = cr - nr, dc = cc - nc;
    for (let i = 0; i < piece.cells.length; i++) {
      piece.cells[i] = [piece.cells[i][0] + dr, piece.cells[i][1] + dc];
    }
  }
}

function rotateCellsCCW(piece) {
  const [cr, cc] = _centerOfMass(piece);
  // Rotate each cell CCW around center of mass: (r,c) -> ((c-cc)+cr, -(r-cr)+cc)
  for (let i = 0; i < piece.cells.length; i++) {
    const [r, c] = piece.cells[i];
    piece.cells[i] = [(c - cc) + cr, -(r - cr) + cc];
  }
  const [nr, nc] = _centerOfMass(piece);
  if (nr !== cr || nc !== cc) {
    const dr = cr - nr, dc = cc - nc;
    for (let i = 0; i < piece.cells.length; i++) {
      piece.cells[i] = [piece.cells[i][0] + dr, piece.cells[i][1] + dc];
    }
  }
}

function clonePiece(piece) {
  return {
    cells: piece.cells.map(c => [...c]),
    vals: [...piece.vals],
    _mono: piece._mono || 0,
  };
}

// ====== GAME LOGIC ======

function initBlockState() {
  loadHighScore();
  if (BATTLE) { PolyBattle.clear(); _bq.length = 0; }
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
  state.softDrop = false;
  state.lines = 0;
  state.score = 0;
  state.level = 1;
  state.board = create2d(BOARD_W, BOARD_H);
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
  state.reinforce = 0;
  state._cTrig = {}; state._cPlaced = {}; state._cBoom = 0; state._cGarb = 0; state._cHold = 0;
  // Start with random special item in hold (monomino)
  let _hv = 4;
  if (itemsEnabled) {
    const _mr = randInt(100);
    if (_mr < 10) _hv = 1;
    else if (_mr < 20) { _hv = 30; state.holdhb = 1; }
    else if (_mr < 60) _hv = 31;
    else {
      const _u = randInt(250000);
      if(_u<100)_hv=116;else if(_u<400)_hv=117;else if(_u<700)_hv=118;else if(_u<720)_hv=119;else if(_u<1520)_hv=104;else if(_u<2020)_hv=120;else if(_u<3020)_hv=121;else if(_u<3720)_hv=122;else if(_u<4020)_hv=123;else if(_u<4070)_hv=124;else if(_u<4870)_hv=125;else if(_u<5120)_hv=91;else if(_u<5220)_hv=102;else if(_u<5620)_hv=126;else if(_u<5920)_hv=127;else if(_u<6020)_hv=17;else if(_u<6220)_hv=20;else if(_u<7020)_hv=21;else if(_u<7820)_hv=22;else if(_u<8070)_hv=16;else if(_u<8270)_hv=11;else if(_u<8920)_hv=2;else if(_u<9920)_hv=8;else if(_u<10920)_hv=9;else if(_u<11170)_hv=10;else if(_u<12170)_hv=5;else if(_u<12420)_hv=6;else if(_u<12720)_hv=204;else if(_u<14970)_hv=120;else if(_u<24970)_hv=200;else if(_u<25270)_hv=19;else if(_u<25570)_hv=18;
    }
  } else { _hv = 65; }
  if (BATTLE && _hv === 4 && randInt(16) !== 0) _hv = 65;   // battle mode: the score-boost block is 1/16 as common
  state.holdblock = { cells: [[0, 0]], vals: [_hv] };
  state.nextblock = generateBlock();
  setnextblock();
}

function setnextblock() {
  state.asc = 0;
  state.nowblock = state.nextblock;
  state.nowhb = state.nexthb;
  state.nexthb = 0;
  applySpecialAging();
  state.nextblock = generateBlock();
  if (BATTLE && _bq.length) { state.nextblock = battleMonoPiece(); state.nextblock._mono = _bq.shift(); state.nexthb = 0; }   // battle mode: the block after a position item is a plain single cell of its own

  // Position block at top center
  // Find the bounding box of the block
  let minR = Infinity, maxR = -Infinity;
  let minC = Infinity, maxC = -Infinity;
  for (const [r, c] of state.nowblock.cells) {
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  }
  // Place so top of block is at row BOARD_H-1 (top visible row)
  const startRow = BOARD_H - 1 - maxR;
  const centerOffset = Math.floor((minC + maxC) / 2);
  const startCol = Math.floor(BOARD_W / 2) - centerOffset;
  // Clamp col so all cells are in bounds
  let adjCol = startCol;
  const leftMost = adjCol + minC;
  const rightMost = adjCol + maxC;
  if (leftMost < 0) adjCol -= leftMost;
  if (rightMost >= BOARD_W) adjCol -= (rightMost - BOARD_W + 1);
  state.blockpos = [startRow, adjCol];

  // Check if placed block overlaps existing - game over
  return checkCollision(state.nowblock, state.blockpos[0], state.blockpos[1]) ? 1 : 0;
}

function checkCollision(piece, row, col) {
  for (const [r, c] of piece.cells) {
    const br = row + r;
    const bc = col + c;
    if (bc < 0 || bc >= BOARD_W || br < 0) return true;
    if (br >= BOARD_H) continue; // above board is ok during spawn
    if (state.board[br][bc] !== 0) return true;
  }
  return false;
}

function move(dcol) {
  const newCol = state.blockpos[1] + dcol;
  if (state.nowhb === 0) {
    // Cancel-aware collision check
    let hasHard = false, hasSoft = false;
    for (let i = 0; i < state.nowblock.cells.length; i++) {
      const [r, c] = state.nowblock.cells[i];
      const br = state.blockpos[0] + r, bc = newCol + c;
      if (bc < 0 || bc >= BOARD_W || br < 0) { hasHard = true; break; }
      if (br >= BOARD_H) continue;
      const cell = state.board[br][bc];
      if (cell === 0) continue;
      const myVal = state.nowblock.vals[i];
      if ((cell === 31 && myVal !== 31) || (myVal === 31 && cell !== 0 && cell !== 31)) { hasSoft = true; continue; }
      hasHard = true; break;
    }
    if (hasHard) return 1;
    if (hasSoft) {
      for (let i = state.nowblock.cells.length - 1; i >= 0; i--) {
        const [r, c] = state.nowblock.cells[i];
        const br = state.blockpos[0] + r, bc = newCol + c;
        if (br < 0 || br >= BOARD_H) continue;
        const cell = state.board[br][bc], myVal = state.nowblock.vals[i];
        if ((cell === 31 && myVal !== 31) || (myVal === 31 && cell !== 0 && cell !== 31)) {
          state.board[br][bc] = 0;
          state.nowblock.cells.splice(i, 1);
          state.nowblock.vals.splice(i, 1);
          state.score += 40;
        }
      }
      if (state.nowblock.cells.length === 0) { setnextblock(); return 2; }
    }
    state.blockpos[1] = newCol;
    return 0;
  }
  if (state.nowhb === 1) {
    // Pierce horizontal: destroy normals, mutual destruction with cancel/pierce
    for (let i = 0; i < state.nowblock.cells.length; i++) {
      const [r, c] = state.nowblock.cells[i];
      if (newCol + c < 0 || newCol + c >= BOARD_W || state.blockpos[0] + r < 0) return 1;
    }
    for (let i = state.nowblock.cells.length - 1; i >= 0; i--) {
      const [r, c] = state.nowblock.cells[i];
      const br = state.blockpos[0] + r, bc = newCol + c;
      if (br >= BOARD_H || br < 0) continue;
      const cell = state.board[br][bc];
      if (cell === 31 || cell === 30) {
        state.board[br][bc] = 0;
        state.nowblock.cells.splice(i, 1);
        state.nowblock.vals.splice(i, 1);
        state.score += 40;
      } else if (cell !== 0) {
        state.board[br][bc] = 0;
      }
    }
    if (state.nowblock.cells.length === 0) { setnextblock(); return 2; }
    state.blockpos[1] = newCol;
    return 0;
  }
  if (!checkCollision(state.nowblock, state.blockpos[0], newCol)) {
    state.blockpos[1] = newCol;
    return 0;
  }
  return 1;
}

// Resolve interactions in a column array (bottom to top)
// pierce(30): destroys normal below, mutual destruction with pierce/cancel
// cancel(31): mutual destruction with normal (not cancel-cancel)
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
        // cancel + normal or normal + cancel: both destroyed
        result.pop(); result.pop();
        changed = true;
      }
    }
  }
  return result;
}

function moveDown() {
  const newRow = state.blockpos[0] - 1;
  let restart;

  // Pre-check: if ANY cell would hard-stop, lock entire block without cancellation
  if (state.nowhb === 0) {
    for (let i = 0; i < state.nowblock.cells.length; i++) {
      const [r, c] = state.nowblock.cells[i];
      const br = newRow + r;
      const bc = state.blockpos[1] + c;
      if (bc < 0 || bc >= BOARD_W || br < 0) return 1;
      if (br >= BOARD_H) continue;
      const cell = state.board[br][bc];
      const myVal = state.nowblock.vals[i];
      if ((cell === 31 && myVal !== 31) || (myVal === 31 && cell !== 0 && cell !== 31)) continue;
      if (cell !== 0) return 1;
    }
  } else if (state.nowhb === 1) {
    // Pierce pre-check: only floor/boundary is hard stop
    for (let i = 0; i < state.nowblock.cells.length; i++) {
      const [r, c] = state.nowblock.cells[i];
      const br = newRow + r;
      const bc = state.blockpos[1] + c;
      if (bc < 0 || bc >= BOARD_W || br < 0) return 1;
    }
  }

  // Polycube-matching collision loop (while + restart)
  while (true) {
    restart = false;

    for (let i = 0; i < state.nowblock.cells.length; i++) {
      const [r, c] = state.nowblock.cells[i];
      const br = newRow + r;
      const bc = state.blockpos[1] + c;

      // Out of bounds horizontally
      if (bc < 0 || bc >= BOARD_W) return 1;

      // Below board bottom
      if (br < 0) {
        return 1;
      }

      // Above board top - ok
      if (br >= BOARD_H) continue;

      const cell = state.board[br][bc];

      // Normal block (not 상쇄, not 관통)
      if (state.nowhb === 0) {
        if (cell === 31 && state.nowblock.vals[i] !== 31) {
          // Normal block cell hits cancel on board: mutual destruction
          state.board[br][bc] = 0;
          state.nowblock.cells.splice(i, 1);
          state.nowblock.vals.splice(i, 1);
          state.score += 40;
          if (state.nowblock.cells.length === 0) { setnextblock(); return 2; }
          restart = true;
          break;
        }
        if (state.nowblock.vals[i] === 31 && cell !== 0 && cell !== 31) {
          // cancel cell hits normal block: mutual destruction, keep falling
          state.board[br][bc] = 0;
          state.nowblock.cells.splice(i, 1);
          state.nowblock.vals.splice(i, 1);
          state.score += 40;
          if (state.nowblock.cells.length === 0) { setnextblock(); return 2; }
          restart = true;
          break;
        }
        if (cell !== 0) return 1; // normal collision → stick
      }
      // 상쇄 block
      else if (state.nowhb === 1) {
        if (cell === 31 || cell === 30) {
          // pierce/cancel hits pierce: mutual destruction
          state.board[br][bc] = 0;
          state.nowblock.cells.splice(i, 1);
          state.nowblock.vals.splice(i, 1);
          state.score += 40;
          if (state.nowblock.cells.length === 0) { setnextblock(); return 2; }
          restart = true;
          break;
        }
        if (cell !== 0) {
          state.board[br][bc] = 0; // 상쇄 erases normal blocks
        }
      }
    }

    if (restart) continue;
    // Movement succeeded
    state.blockpos[0] = newRow;
    return 0;
  }
}

function rotate(dir) {
  if (state.spinlock !== 0) return 0;
  const test = clonePiece(state.nowblock);
  if (dir === 1) rotateCellsCW(test);
  else rotateCellsCCW(test);

  // Try basic rotation
  if (!checkCollision(test, state.blockpos[0], state.blockpos[1])) {
    if (dir === 1) rotateCellsCW(state.nowblock);
    else rotateCellsCCW(state.nowblock);
    return 0;
  }
  // Wall kick: try offsets
  const kicks = [[0, 1], [0, -1], [0, 2], [0, -2], [1, 0], [-1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of kicks) {
    if (!checkCollision(test, state.blockpos[0] + dr, state.blockpos[1] + dc)) {
      if (dir === 1) rotateCellsCW(state.nowblock);
      else rotateCellsCCW(state.nowblock);
      state.blockpos[0] += dr;
      state.blockpos[1] += dc;
      return 0;
    }
  }
  return 1;
}

function applySpecialAging() {
  for (let r = 0; r < BOARD_H; r++) {
    for (let c = 0; c < BOARD_W; c++) {
      const value = state.board[r][c];
      if (120 <= value && value < 123) {
        state.board[r][c] += 1;
      } else if (value === 123) {
        state._evBoom = (state._evBoom || 0) + 1; state._cBoom = (state._cBoom || 0) + 1;
        // Bomb explodes 3x3 (reinforce: 5x5)
        const _bRange = state.reinforce > 0 ? 2 : 1;
        for (let r2 = r - _bRange; r2 <= r + _bRange; r2++) {
          for (let c2 = c - _bRange; c2 <= c + _bRange; c2++) {
            if (r2 >= 0 && r2 < BOARD_H && c2 >= 0 && c2 < BOARD_W) {
              state.board[r2][c2] = randInt(4) !== 0 ? 98 : 0;
            }
          }
        }
      } else if (value === 32) {
        // Immediate explosion 3x3
        for (let r2 = r - 1; r2 <= r + 1; r2++) {
          for (let c2 = c - 1; c2 <= c + 1; c2++) {
            if (r2 >= 0 && r2 < BOARD_H && c2 >= 0 && c2 < BOARD_W) {
              state.board[r2][c2] = 0;
            }
          }
        }
      }
    }
  }
}

function stickblock() {
  state.asc = 0;
  // Calculate tight fit bonus
  for (let i = 0; i < state.nowblock.cells.length; i++) {
    const [r, c] = state.nowblock.cells[i];
    const br = state.blockpos[0] + r;
    const bc = state.blockpos[1] + c;
    if (br < 0 || br >= BOARD_H || bc < 0 || bc >= BOARD_W) continue;

    // Count adjacent occupied cells (board) and self-adjacent (block)
    let it = 0; // board neighbors
    let jt = 0; // block neighbors
    // Check below
    if (br === 0 || (br > 0 && state.board[br - 1][bc] !== 0)) it += 1;
    // Check above
    if (br === BOARD_H - 1 || (br < BOARD_H - 1 && state.board[br + 1][bc] !== 0)) it += 1;
    // Check left
    if (bc === 0 || (bc > 0 && state.board[br][bc - 1] !== 0)) it += 1;
    // Check right
    if (bc === BOARD_W - 1 || (bc < BOARD_W - 1 && state.board[br][bc + 1] !== 0)) it += 1;

    // Count block neighbors
    for (let j = 0; j < state.nowblock.cells.length; j++) {
      if (j === i) continue;
      const [r2, c2] = state.nowblock.cells[j];
      const dr = (state.blockpos[0] + r2) - br;
      const dc = (state.blockpos[1] + c2) - bc;
      if (Math.abs(dr) + Math.abs(dc) === 1) jt += 1;
    }
    // 2D: 4 neighbors max, so threshold is >2 (3+ sides touching)
    if (jt < 2 && it + jt > 2) state.asc += 1;
  }
  if (state.asc !== 0) state.asc -= 1;
  if (state.asc !== 0) {
    state.gt = 50 * Math.pow(4, state.asc);
    state.score += state.gt;
    state.ht = now();
  }

  // Place block on board
  for (let i = 0; i < state.nowblock.cells.length; i++) {
    const [r, c] = state.nowblock.cells[i];
    const br = state.blockpos[0] + r;
    const bc = state.blockpos[1] + c;
    if (br >= BOARD_H) return 1; // game over if block is placed above the visible board
    if (br >= 0 && br < BOARD_H && bc >= 0 && bc < BOARD_W) {
      state.board[br][bc] = state.nowblock.vals[i];
      const _pv = state.nowblock.vals[i] & 255; state._cPlaced[_pv] = (state._cPlaced[_pv] || 0) + 1;
    }
  }
  // 자폭: placed immediately triggers 3x3 destruction (reinforce: 5x5)
  const _sdRange = state.reinforce > 0 ? 2 : 1;
  for (let i = 0; i < state.nowblock.cells.length; i++) {
    if ((state.nowblock.vals[i] & 255) === 1) {
      const br = state.blockpos[0] + state.nowblock.cells[i][0];
      const bc = state.blockpos[1] + state.nowblock.cells[i][1];
      for (let r2 = br - _sdRange; r2 <= br + _sdRange; r2++) {
        for (let c2 = bc - _sdRange; c2 <= bc + _sdRange; c2++) {
          if (r2 >= 0 && r2 < BOARD_H && c2 >= 0 && c2 < BOARD_W) {
            state.board[r2][c2] = 0;
          }
        }
      }
    }
  }
  // After placing pierce block, resolve column interactions
  if (state.nowhb === 1) {
    for (let c = 0; c < BOARD_W; c++) {
      const col = [];
      for (let r = 0; r < BOARD_H; r++) { if (state.board[r][c] !== 0) col.push(state.board[r][c]); }
      const resolved = resolveColumn(col);
      for (let r = 0; r < BOARD_H; r++) { state.board[r][c] = r < resolved.length ? resolved[r] : 0; }
    }
  }
  if (BATTLE) battleLocked();   // delayed battle-mode items that are centred on this block
  return setnextblock();
}

// effect of ONE item cell (code) located at (row, c); acc.tline collects the +/- line items. Shared by line clears and by battle-mode slots.
function applyItemCell(code, row, c, acc, _enf) {
    if (code === 116) { acc.tline -= (_enf ? 4 : 2); state.board[row][c] = 256; }
    else if (code === 117) { acc.tline += (_enf ? 4 : 2); state.board[row][c] = 256; }
    else if (code === 118) {
      // 범위삭제: x좌표 +-1열 삭제 (reinforce: +-2)
      state.board[row][c] = 256;
      const _rdRange = _enf ? 2 : 1;
      for (let c2 = c - _rdRange; c2 <= c + _rdRange; c2++) {
        if (c2 >= 0 && c2 < BOARD_W) {
          for (let r2 = 0; r2 < BOARD_H; r2++) state.board[r2][c2] |= 256;
        }
      }
    } else if (code === 119) {
      // All clear
      state.board = create2d(BOARD_W, BOARD_H);
      return 'reset';
    } else if (code === 104) { state.simplify2 = 0; state.pentaForce = 0; state.monoonly += (_enf ? 22 : 11); state.board[row][c] = 256; }
    else if (code === 124) { acc.tline -= (_enf ? 6 : 3); state.board[row][c] = 256; }
    else if (code === 125) { acc.tline += (_enf ? 2 : 1); state.board[row][c] = 256; }
    else if (code === 91) { state.spinlock += (_enf ? 20 : 10); state.board[row][c] = 256; }
    else if (code === 8) { state.speedup += (_enf ? 20 : 10); state.board[row][c] = 256; }
    else if (code === 9) { state.speeddown += (_enf ? 20 : 10); state.board[row][c] = 256; }
    else if (code === 10) { state.holdlock += (_enf ? 30 : 15); state.board[row][c] = 256; }
    else if (code === 16) { state.blindboard = now() + (_enf ? 20000 : 10000); state.board[row][c] = 256; }
    else if (code === 17) { state.bombnext += (_enf ? 12 : 6); state.board[row][c] = 256; }
    else if (code === 20) { state.compactPending = true; state.board[row][c] = 256; }
    else if (code === 21) { state.monoonly = 0; state.pentaForce = 0; state.simplify2 += (_enf ? 18 : 9); state.board[row][c] = 256; }
    else if (code === 22) { state.monoonly = 0; state.simplify2 = 0; state.pentaForce += (_enf ? 18 : 9); state.board[row][c] = 256; }
    else if (code === 2) { state.hideblock += (_enf ? 20 : 10); state.board[row][c] = 256; }
    else if (code === 6) { state.hidenext += (_enf ? 40 : 20); state.board[row][c] = 256; }
    else if (code === 5) {
      // Erase items (reinforce: unify all to min value)
      if (_enf) {
        // Reinforce: convert all to normal, then unify to min converted color
        let _minV = 999;
        for (let r2 = 0; r2 < BOARD_H; r2++) {
          for (let c2 = 0; c2 < BOARD_W; c2++) {
            const _v = state.board[r2][c2];
            if (_v !== 0 && _v < 256) {
              const _cv = 33 + (_v % 31);
              if (_cv < _minV) _minV = _cv;
            }
          }
        }
        if (_minV < 999) {
          for (let r2 = 0; r2 < BOARD_H; r2++) {
            for (let c2 = 0; c2 < BOARD_W; c2++) {
              if (state.board[r2][c2] !== 0 && state.board[r2][c2] < 256) {
                state.board[r2][c2] = _minV;
              }
            }
          }
        }
      } else {
        for (let r2 = 0; r2 < BOARD_H; r2++) {
          for (let c2 = 0; c2 < BOARD_W; c2++) {
            if (state.board[r2][c2] !== 0 && state.board[r2][c2] !== 256) {
              state.board[r2][c2] = 33 + (state.board[r2][c2] % 31);
            }
          }
        }
      }
      state.board[row][c] = 256;
    } else if (code === 204) {
      // Enforcement: enhance next 20 line clears
      state.reinforce = 20;
      state.board[row][c] = 256;
    } else if (code === 4) { if (!BATTLE) state.score2x += (_enf ? 2 : 1); state.board[row][c] = 256; }   // battle mode: no score effect (used on the opponent it steals the items in its slots)
    else if (code === 11) {
      // 장애물: 랜덤 위치 장애물
      state.board[row][c] = 256;
      const _obsMax = _enf ? 5 : 3;
      let count = 0;
      for (let i = 0; i < 50; i++) {
        const rr = randInt(BOARD_H - 1);
        const cc = randInt(BOARD_W - 1);
        if (state.board[rr][cc] === 0 &&
            state.board[rr][cc + 1] === 0 &&
            (rr + 1 >= BOARD_H || state.board[rr + 1][cc] === 0)) {
          count += 1;
          state.board[rr][cc] = 103;
        }
        if (count === _obsMax) break;
      }
    } else if (code === 102) {
      // 상단삭제: clear above this row
      for (let r2 = row; r2 < BOARD_H; r2++) {
        for (let c2 = 0; c2 < BOARD_W; c2++) state.board[r2][c2] = 256;
      }
    } else if (code === 126) {
      // xz del -> in 2D, clear +-1 rows (reinforce: +-2)
      state.board[row][c] = 256;
      const _rdRng = _enf ? 2 : 1;
      for (let r2 = row - _rdRng; r2 <= row + _rdRng; r2++) {
        if (r2 >= 0 && r2 < BOARD_H) {
          for (let c2 = 0; c2 < BOARD_W; c2++) state.board[r2][c2] |= 256;
        }
      }
    } else if (code === 127) {
      // Bomb creator
      const _bcRate = state.reinforce > 0 ? 50 : 20;
      state.board[row][c] |= 256;
      for (let r2 = 0; r2 < BOARD_H; r2++) {
        for (let c2 = 0; c2 < BOARD_W; c2++) {
          if ((state.board[r2][c2] & 255) !== 0 && randInt(100) < _bcRate) {
            state.board[r2][c2] = (state.board[r2][c2] & 256) + 120 + randInt(4);
          }
        }
      }
    } else if (code === 18) {
      // Hole: remove 30% of all blocks (reinforce: 60%)
      state.board[row][c] |= 256;
      for (let r2 = 0; r2 < BOARD_H; r2++) {
        for (let c2 = 0; c2 < BOARD_W; c2++) {
          if ((state.board[r2][c2] & 255) !== 0 && randInt(100) < (_enf ? 60 : 30)) {
            state.board[r2][c2] = state.board[r2][c2] & 256;
          }
        }
      }
    } else if (code === 19) {
      // Zigzag: shuffle blocks (reinforce: across all rows; normal: per-row)
      state.board[row][c] |= 256;
      if (_enf) {
        // Enforced: shuffle across all rows up to max occupied row
        let _maxR = 0;
        for (let r2 = 0; r2 < BOARD_H; r2++) for (let c2 = 0; c2 < BOARD_W; c2++) {
          if ((state.board[r2][c2] & 255) !== 0 && r2 > _maxR) _maxR = r2;
        }
        const _vals = [];
        const _occupied = [];
        for (let r2 = 0; r2 <= _maxR; r2++) for (let c2 = 0; c2 < BOARD_W; c2++) {
          const v = state.board[r2][c2] & 255;
          if (v !== 0) { _vals.push(v); _occupied.push([r2, c2]); }
        }
        // All positions (0 to maxR) for redistribution
        const _allPos = [];
        for (let r2 = 0; r2 <= _maxR; r2++) for (let c2 = 0; c2 < BOARD_W; c2++) _allPos.push([r2, c2]);
        // Clear occupied cells
        for (const [_r, _c] of _occupied) state.board[_r][_c] = state.board[_r][_c] & 256;
        // Shuffle all positions, pick first vals.length
        for (let i = _allPos.length - 1; i > 0; i--) { const j = randInt(i + 1); [_allPos[i], _allPos[j]] = [_allPos[j], _allPos[i]]; }
        for (let i = 0; i < _vals.length; i++) {
          const [_r, _c] = _allPos[i];
          state.board[_r][_c] = (state.board[_r][_c] & 256) + _vals[i];
        }
      } else {
        for (let r2 = 0; r2 < BOARD_H; r2++) {
          const vals = [];
          const cols = [];
          for (let c2 = 0; c2 < BOARD_W; c2++) {
            const v = state.board[r2][c2] & 255;
            if (v !== 0) vals.push(v);
            cols.push(c2);
          }
          // Clear all cells in this row
          for (const c2 of cols) {
            state.board[r2][c2] = state.board[r2][c2] & 256;
          }
          // Shuffle column positions
          for (let i = cols.length - 1; i > 0; i--) {
            const j = randInt(i + 1);
            [cols[i], cols[j]] = [cols[j], cols[i]];
          }
          // Place blocks at first N shuffled positions
          for (let i = 0; i < vals.length; i++) {
            state.board[r2][cols[i]] = (state.board[r2][cols[i]] & 256) + vals[i];
          }
        }
      }
    } else {
      state.board[row][c] |= 256;
    }
  return '';
}

function processLine(row) {
  let tline = 0;
  let filled = 0;
  let hasNonMarked = false;
  for (let c = 0; c < BOARD_W; c++) {
    if (state.board[row][c] === 0) return { filled: 0, tline: 0 };
    if (state.board[row][c] < 256) hasNonMarked = true;
  }
  filled = hasNonMarked ? 1 : 0;

  // Pre-scan for mirror before processing (early returns skip it)
  let _mirrorFlag = false;
  for (let c2 = 0; c2 < BOARD_W; c2++) {
    if ((state.board[row][c2] & 255) === 200 && BATTLE && PolyBattle.store(200)) { state.board[row][c2] = 256; }
    else if ((state.board[row][c2] & 255) === 200) { _mirrorFlag = true; state.board[row][c2] = (state.board[row][c2] & 256); state._cTrig[200] = (state._cTrig[200] || 0) + 1; }
  }

  const _enf = state.reinforce > 0;
  const _acc = { tline: 0 };
  for (let c = 0; c < BOARD_W; c++) {
    const code = state.board[row][c] & 255;
    if (code !== 0) state._cTrig[code] = (state._cTrig[code] || 0) + 1;
    if (BATTLE && PolyBattle.store(code)) { state.board[row][c] = 256; continue; }   // battle mode: the item goes into a slot instead
    const _ar = applyItemCell(code, row, c, _acc, _enf);
    if (_ar === 'reset') return { filled, tline: 0, hardReset: true };
  }
  if (_mirrorFlag) {
    for (let r2 = 0; r2 < BOARD_H; r2++) {
      for (let i = 0; i < Math.floor(BOARD_W / 2); i++) {
        const tmp = state.board[r2][i];
        state.board[r2][i] = state.board[r2][BOARD_W - 1 - i];
        state.board[r2][BOARD_W - 1 - i] = tmp;
      }
    }
  }
  tline = _acc.tline;
  return { filled, tline };
}

// board clean-up after item effects: remove marked cells, +/- lines (totalTline), gap clear. Returns the extra lines made by the gap clear.
function settleBoard(totalTline) {
  var compactLines = 0;
  if (totalTline < 0) {
    // Remove bottom rows
    for (let r = 0; r < -totalTline && r < BOARD_H; r++) {
      for (let c = 0; c < BOARD_W; c++) state.board[r][c] = 256;
    }
    totalTline = 0;
  }

  // Compact: remove cells >= 256, shift column down (like polycube cell-level compaction)
  for (let c = 0; c < BOARD_W; c++) {
    let t = 0;
    for (let r = 0; r < BOARD_H; r++) {
      if (state.board[r][c] < 256) {
        state.board[t][c] = state.board[r][c];
        t++;
      }
    }
    for (; t < BOARD_H; t++) {
      state.board[t][c] = 0;
    }
  }

  if (totalTline > 0) {
    state._evGarb = (state._evGarb || 0) + totalTline; state._cGarb = (state._cGarb || 0) + totalTline;
    // Add garbage lines at bottom
    for (let r = BOARD_H - totalTline; r < BOARD_H; r++) for (let c = 0; c < BOARD_W; c++) if (state.board[r][c] !== 0) state._ovf = true;   // pushed out of the board: dead
    for (let r = BOARD_H - 1; r >= totalTline; r--) {
      for (let c = 0; c < BOARD_W; c++) state.board[r][c] = state.board[r - totalTline][c];
    }
    for (let r = 0; r < totalTline; r++) {
      for (let c = 0; c < BOARD_W; c++) {
        state.board[r][c] = randInt(2) !== 0 ? 103 : 0;
        if (c % BOARD_W === (r) % BOARD_W) state.board[r][c] = 0;
      }
    }
  }

  // 빈공간삭제: compact all columns with interaction resolution
  if (state.compactPending) {
    state.compactPending = false;
    for (let c = 0; c < BOARD_W; c++) {
      const col = [];
      for (let r = 0; r < BOARD_H; r++) {
        if (state.board[r][c] !== 0) col.push(state.board[r][c]);
      }
      const resolved = resolveColumn(col);
      for (let r = 0; r < BOARD_H; r++) {
        state.board[r][c] = r < resolved.length ? resolved[r] : 0;
      }
    }
    // Count and remove filled lines (no score multiplier, just base 20 per line)
    for (let r = 0; r < BOARD_H; r++) {
      let full = true;
      for (let c = 0; c < BOARD_W; c++) {
        if (state.board[r][c] === 0) { full = false; break; }
      }
      if (full) {
        for (let c = 0; c < BOARD_W; c++) state.board[r][c] = 0;
        compactLines++;
      }
    }
    if (compactLines > 0) {
      // Re-compact after removing lines
      for (let c = 0; c < BOARD_W; c++) {
        let t = 0;
        for (let r = 0; r < BOARD_H; r++) {
          if (state.board[r][c] !== 0) { state.board[t][c] = state.board[r][c]; t++; }
        }
        for (; t < BOARD_H; t++) state.board[t][c] = 0;
      }
      state.lines += compactLines;
      state.score += 20 * compactLines;
      state.level = Math.floor((state.score + 600) / 800) + 1;
      if (state.level > 16) state.level = 16;
    }
  }

  return compactLines;
}

function removeline() {
  if (state.spinlock > 0) state.spinlock -= 1;
  if (state.hideblock > 0) state.hideblock -= 1;
  if (state.hidenext > 0) state.hidenext -= 1;
  if (state.speedup > 0) state.speedup -= 1;
  if (state.speeddown > 0) state.speeddown -= 1;
  if (state.holdlock > 0) state.holdlock -= 1;

  let filledline = 0;
  let totalTline = 0;

  for (let r = 0; r < BOARD_H; r++) {
    const result = processLine(r);
    if (result.hardReset) return 0;
    filledline += result.filled || 0;
    totalTline += result.tline || 0;
  }

  filledline += settleBoard(totalTline);

  if (filledline !== 0) filledline += removeline();
  return filledline;
}

function calculatescore(line) {
  state.lines += line;
  if (state.score2x > 3) state.score2x = 3;
  state.score += Math.floor(20 * line * Math.sqrt(line) * Math.pow(4, state.score2x)) * Math.pow(4, state.asc);
  if (state.score > 999999999) state.score = 999999999;
  state.score2x = 0;
  state.level = Math.floor((state.score + 600) / 800) + 1;
  if (state.level > 16) state.level = 16;
  if (state.reinforce > 0 && line > 0) state.reinforce = Math.max(0, state.reinforce - line);
}

function overflowDie() {          // lines were added to a stack that has no room for them: game over
  state._ovf = false;
  if (state.goverflg || state.startscreen) return false;
  gover(); initBlockState(); return true;
}
function gover() {
  state.oscore = state.score;
  if (!window.__btOpp && !window.__battle) try {   // (battle mode records a cumulative score instead: battle.js)
    const raw = localStorage.getItem('polynomino_highscore');
    if (raw) {
      const data = JSON.parse(raw);
      const v = data.s * 51231 % 134 + data.s * 12241 % 142 + data.s * 1411 % 131 + data.s * 215 % 13 + data.s * 2;
      if (v === data.c) {
        if (data.s < state.score) {
          const ns = state.score;
          localStorage.setItem('polynomino_highscore', JSON.stringify({ s: ns, c: ns * 51231 % 134 + ns * 12241 % 142 + ns * 1411 % 131 + ns * 215 % 13 + ns * 2 }));
        }
      } else {
        const ns = state.score;
        localStorage.setItem('polynomino_highscore', JSON.stringify({ s: ns, c: ns * 51231 % 134 + ns * 12241 % 142 + ns * 1411 % 131 + ns * 215 % 13 + ns * 2 }));
      }
    } else {
      const ns = state.score;
      localStorage.setItem('polynomino_highscore', JSON.stringify({ s: ns, c: ns * 51231 % 134 + ns * 12241 % 142 + ns * 1411 % 131 + ns * 215 % 13 + ns * 2 }));
    }
  } catch (_) {}
  state.goverflg = 1;
}

function loadHighScore() {
  try {
    const raw = localStorage.getItem('polynomino_highscore');
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
  if (state.holdblock === null) {
    state.holdblock = clonePiece(state.nowblock);
    state.holdhb = state.nowhb;
    setnextblock();
    return;
  }
  // Check if hold block fits at current position
  if (state.holdhb === 1) {
    // Pierce: only blocked by cancel(31) and boundaries
    for (let i = 0; i < state.holdblock.cells.length; i++) {
      const [r, c] = state.holdblock.cells[i];
      const br = state.blockpos[0] + r, bc = state.blockpos[1] + c;
      if (bc < 0 || bc >= BOARD_W || br < 0) return;
      if (br >= BOARD_H) continue;
      if (state.board[br][bc] === 31 || state.board[br][bc] === 30) return;
    }
  } else {
    if (checkCollision(state.holdblock, state.blockpos[0], state.blockpos[1])) return;
  }
  const tmp = state.nowblock;
  state.nowblock = state.holdblock;
  state.holdblock = tmp;
  const tmphb = state.nowhb;
  state.nowhb = state.holdhb;
  state.holdhb = tmphb;
  state._cHold = (state._cHold || 0) + 1;
  // Pierce: immediately destroy overlapping board cells
  if (state.nowhb === 1) {
    for (let i = 0; i < state.nowblock.cells.length; i++) {
      const [r, c] = state.nowblock.cells[i];
      const br = state.blockpos[0] + r, bc = state.blockpos[1] + c;
      if (br >= 0 && br < BOARD_H && bc >= 0 && bc < BOARD_W && state.board[br][bc] !== 0) {
        state.board[br][bc] = 0;
      }
    }
  }
}

// ====== TOUCH CONTROLS ======
// Button layout coordinates (in canvas pixels)
function getButtonLayout() {
  const cw = state.canvasW;
  const ch = state.canvasH;
  const btnSize = Math.min(cw * 0.13, ch * 0.08);
  const bottomY = ch * 0.82;
  const gap = btnSize * 0.2;

  // Left side: rotation buttons (toward center)
  const rotX = cw * 0.18;
  const rotCWBtn = { x: rotX - btnSize / 2, y: bottomY - btnSize - gap / 2, w: btnSize, h: btnSize, action: 'rotateCW', label: 'CW' };
  const rotCCWBtn = { x: rotX - btnSize / 2, y: bottomY + gap / 2, w: btnSize, h: btnSize, action: 'rotateCCW', label: 'CCW' };

  // Right side: move buttons (same height as soft drop)
  const moveX = cw * 0.75;
  const moveLeftBtn = { x: moveX - btnSize - gap, y: bottomY - btnSize - gap / 2, w: btnSize, h: btnSize, action: 'moveLeft', label: '<' };
  const moveRightBtn = { x: moveX + gap, y: bottomY - btnSize - gap / 2, w: btnSize, h: btnSize, action: 'moveRight', label: '>' };
  // Soft drop button below (same height as hold)
  const dropBtn = { x: moveX - btnSize / 2, y: bottomY + gap / 2, w: btnSize, h: btnSize, action: 'drop', label: 'DROP' };

  // Center: hold (top) + hard drop (bottom, shifted left)
  const centerX = cw * 0.44;
  const holdBtn = { x: centerX - btnSize / 2, y: bottomY - btnSize - gap / 2, w: btnSize, h: btnSize, action: 'hold', label: 'HOLD', color: '#cc4488' };
  const hardDropBtn = { x: centerX - btnSize / 2, y: bottomY + gap / 2, w: btnSize, h: btnSize, action: 'hardDrop', label: '▼▼' };

  // Pause button (top right)
  const pauseSize = btnSize * 0.9;
  const pauseBtn = { x: cw - pauseSize - 4 - pauseSize / 4, y: 4 + pauseSize / 4, w: pauseSize, h: pauseSize, action: 'pause', label: '||' };

  return BATTLE ? [rotCWBtn, rotCCWBtn, moveLeftBtn, moveRightBtn, hardDropBtn, dropBtn, holdBtn]   // no pause in battle mode
                : [rotCWBtn, rotCCWBtn, moveLeftBtn, moveRightBtn, hardDropBtn, dropBtn, holdBtn, pauseBtn];
}

function hitTestButtons(px, py) {
  const buttons = getButtonLayout();
  const candidates = [];

  for (const btn of buttons) {
    const expandX = btn.w * 0.5;
    const expandY = btn.h * 0.5;
    if (px >= btn.x - expandX && px <= btn.x + btn.w + expandX &&
        py >= btn.y - expandY && py <= btn.y + btn.h + expandY) {
      const cx = btn.x + btn.w / 2;
      const cy = btn.y + btn.h / 2;
      const dx = px - cx;
      const dy = py - cy;
      candidates.push({ btn, distanceSq: dx * dx + dy * dy });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distanceSq - b.distanceSq);
  return candidates[0].btn.action;
}

function clickbutton(px, py) {
  // Menu screens
  const cw = state.canvasW;
  const ch = state.canvasH;

  // Pause: any touch resumes
  if (state.pause) {
    state.pause = false;
    if (state._pauseStart && state.blindboard > 0) {
      state.blindboard += now() - state._pauseStart;
    }
    state._pauseStart = 0;
    return 0;
  }

  if (state.goverflg === 1) {
    // Retry button
    if (py > ch * 0.62 && py < ch * 0.68 && px > cw * 0.3 && px < cw * 0.7) {
      if (BATTLE) { PolyBattle.replay(() => { state.goverflg = 0; }); return 0; }   // waits until the opponent has restarted too
      state.goverflg = 0;
      return 0;
    }
    // Main button
    if (py > ch * 0.72 && py < ch * 0.78 && px > cw * 0.3 && px < cw * 0.7) {
      if (BATTLE && !PolyBattle.canLeave()) return 0;                                  // not while the opponent is still playing
      state.goverflg = 0;
      state.startscreen = 1;
      state.about = 0;
      return 0;
    }
    return 0;
  }

  if (state.startscreen === 1) {
    if (state.about !== 0) {
      state.about = (state.about + 1) % 5;
      return 0;
    }
    // Start button
    if (py > ch * 0.52 && py < ch * 0.60 && px > cw * 0.3 && px < cw * 0.7) {
      if (BATTLE) PolyBattle.begin(() => { state.startscreen = 0; });   // the pairing window comes first
      else state.startscreen = 0;
      return 0;
    }
    // About button
    if (py > ch * 0.62 && py < ch * 0.70 && px > cw * 0.3 && px < cw * 0.7) {
      state.about = (state.about + 1) % 5;
      return 0;
    }
    return 0;
  }

  // Game buttons
  const action = hitTestButtons(px, py);
  if (action === 'rotateCW') { rotate(1); return 0; }
  if (action === 'rotateCCW') { rotate(-1); return 0; }
  if (action === 'moveLeft') { move(-1); return 0; }
  if (action === 'moveRight') { move(1); return 0; }
  if (action === 'hardDrop') {
    const _hb = state.nowblock;
    let mr;
    while ((mr = moveDown()) !== 1) { if (state.nowblock !== _hb) break; }
    if (state.nowblock !== _hb) { state.timestamp = now(); return 0; }
    if (stickblock()) { gover(); initBlockState(); return 0; }
    calculatescore(removeline()); if (state._ovf) overflowDie();
    state.timestamp = now();
    return 0;
  }
  if (action === 'drop') { state.vkspace2 = true; return 0; }
  if (action === 'hold') { tryHoldSwap(); return 0; }
  if (action === 'pause' && !BATTLE) {
    state.pause = !state.pause;
    if (state.pause) state._pauseStart = now();
    else if (state._pauseStart && state.blindboard > 0) {
      state.blindboard += now() - state._pauseStart;
      state._pauseStart = 0;
    }
    return 0;
  }

  return 1;
}

function handleTouches() {
  const t0 = touchs[0];
  if (t0.flag === 1) {
    state.otp = now();
    state.ft = 1;
    clickbutton(t0.x, t0.y);
    state.tts = false;
    t0.flag = 2;
    state.ul = 3;
  } else if (t0.flag === 3) {
    state.vkspace2 = false;
    state.ci = 0;
    t0.flag = 0;
  } else if (t0.flag === 2) {
    const action = hitTestButtons(t0.x, t0.y);
    const isRot = action === 'rotateCW' || action === 'rotateCCW';
    if (!isRot) {
      const elapsed = now() - state.otp;
      if ((state.ul > 0 && elapsed > 170) || (state.ul === 0 && elapsed > 50)) {
        state.otp = now();
        if (state.ul > 0) state.ul = 0;
        else {
          if (action === 'moveLeft') move(-1);
          else if (action === 'moveRight') move(1);
        }
      }
    }
  }
}

// ====== UPDATE ======
function updateFallingLogic() {
  // NES Tetris standard gravity (frames per drop at 60fps → ms)
  const gravityTable = [800,717,633,550,467,383,300,217];
  const fallSpeed = gravityTable[Math.min(state.level - 1, gravityTable.length - 1)];
  // vkspace2 (Space) = soft drop (20× speed, Tetris guideline standard)
  let speedMult = state.vkspace2 ? 0.05 : 1;
  if (state.speedup > 0 && speedMult === 1) speedMult = state.reinforce > 0 ? 0.2 : 0.4;
  if (state.speeddown > 0 && speedMult === 1) speedMult = state.reinforce > 0 ? 5.0 : 2.5;
  const doFall = state.timestamp + fallSpeed * speedMult < now();
  if (doFall) {
    if (window.__fallLog) { const w = (window.__pid = window.__pid || new WeakMap()); if (!w.has(state.nowblock)) w.set(state.nowblock, (window.__pidN = (window.__pidN || 0) + 1)); window.__fallLog.push([now(), state.level, fallSpeed * speedMult, w.get(state.nowblock)]); }   // measurement hook
    const mr = moveDown();
    if (mr === 2) {
      // Block was destroyed (상쇄 interaction) — next block already spawned
      state.vkspace2 = false;
      state.timestamp = now() + fallSpeed; // delay before new block starts falling
    } else if (mr === 1) {
      // Can't move down, stick
      if (stickblock()) {
        gover();
        initBlockState();
        return;
      }
      calculatescore(removeline()); if (state._ovf) overflowDie();
      state.timestamp = now();
    } else {
      state.timestamp = now();
    }
  }
  if (now() - state.ht > 500) state.gt = 0;
}

// ====== RENDERING ======

// Line-drawn character system for UI text
function drawLineChar(ctx, x, y, scale, char, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, scale * 0.09);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const w = scale * 0.7;
  const h = scale;
  // segments: arrays of [x0,y0,x1,y1] as fractions of w,h
  const segs = {
    '0': [[w,0,0,0],[0,0,0,h],[0,h,w,h],[w,h,w,0]],
    '1': [[w/2,0,w/2,h]],
    '2': [[0,0,w,0],[w,0,w,h/2],[w,h/2,0,h/2],[0,h/2,0,h],[0,h,w,h]],
    '3': [[0,0,w,0],[w,0,w,h/2],[w,h/2,0,h/2],[0,h/2,w,h/2],[w,h/2,w,h],[w,h,0,h]],
    '4': [[0,0,0,h/2],[0,h/2,w,h/2],[w,0,w,h]],
    '5': [[w,0,0,0],[0,0,0,h/2],[0,h/2,w,h/2],[w,h/2,w,h],[w,h,0,h]],
    '6': [[w,0,0,0],[0,0,0,h],[0,h,w,h],[w,h,w,h/2],[w,h/2,0,h/2]],
    '7': [[0,h/2,0,0],[0,0,w,0],[w,0,w,h]],
    '8': [[0,0,0,h],[0,h,w,h],[w,h,w,0],[w,0,0,0],[0,h/2,w,h/2]],
    '9': [[w,h/2,0,h/2],[0,h/2,0,0],[0,0,w,0],[w,0,w,h],[w,h,0,h]],
    'S': [[w,0,0,0],[0,0,0,h/2],[0,h/2,w,h/2],[w,h/2,w,h],[w,h,0,h]],
    'C': [[w,0,0,0],[0,0,0,h],[0,h,w,h]],
    'O': [[0,0,w,0],[w,0,w,h],[w,h,0,h],[0,h,0,0]],
    'R': [[0,0,0,h],[0,0,w,0],[w,0,w,h/2],[w,h/2,0,h/2],[0,h/2,w,h]],
    'E': [[w,0,0,0],[0,0,0,h],[0,h,w,h],[0,h/2,w*0.7,h/2]],
    'L': [[0,0,0,h],[0,h,w,h]],
    'I': [[w/2,0,w/2,h],[w*0.2,0,w*0.8,0],[w*0.2,h,w*0.8,h]],
    'N': [[0,h,0,0],[0,0,w,h],[w,h,w,0]],
    'V': [[0,0,w/2,h],[w/2,h,w,0]],
    'H': [[0,0,0,h],[w,0,w,h],[0,h/2,w,h/2]],
    'G': [[w,0,0,0],[0,0,0,h],[0,h,w,h],[w,h,w,h/2],[w,h/2,w/2,h/2]],
    'P': [[0,h,0,0],[0,0,w,0],[w,0,w,h/2],[w,h/2,0,h/2]],
    'T': [[0,0,w,0],[w/2,0,w/2,h]],
    'A': [[0,h,0,0],[0,0,w,0],[w,0,w,h],[0,h/2,w,h/2]],
    'M': [[0,h,0,0],[0,0,w/2,h/2],[w/2,h/2,w,0],[w,0,w,h]],
    'Y': [[0,0,w/2,h/2],[w,0,w/2,h/2],[w/2,h/2,w/2,h]],
    'U': [[0,0,0,h],[0,h,w,h],[w,h,w,0]],
    'B': [[0,0,0,h],[0,0,w*0.8,0],[w*0.8,0,w*0.8,h/2],[w*0.8,h/2,0,h/2],[0,h/2,w,h/2],[w,h/2,w,h],[w,h,0,h]],
    'X': [[0,0,w,h],[w,0,0,h]],
    'D': [[0,0,0,h],[0,0,w*0.7,0],[w*0.7,0,w,h*0.25],[w,h*0.25,w,h*0.75],[w,h*0.75,w*0.7,h],[w*0.7,h,0,h]],
    'F': [[w,0,0,0],[0,0,0,h],[0,h/2,w*0.7,h/2]],
    'W': [[0,0,0,h],[0,h,w/2,h/2],[w/2,h/2,w,h],[w,h,w,0]],
    'K': [[0,0,0,h],[w,0,0,h/2],[0,h/2,w,h]],
    'J': [[w,0,w,h],[w,h,0,h],[0,h,0,h*0.7]],
    'Q': [[0,0,w,0],[w,0,w,h],[w,h,0,h],[0,h,0,0],[w*0.5,h*0.5,w,h]],
    'Z': [[0,0,w,0],[w,0,0,h],[0,h,w,h]],
    ':': [],
    '+': [[w/2,h*0.2,w/2,h*0.8],[w*0.1,h/2,w*0.9,h/2]],
    ' ': [],
  };
  const s = segs[char];
  if (!s) return;
  // Special: colon draws two dots
  if (char === ':') {
    ctx.beginPath();
    ctx.arc(x + w/2, y + h*0.3, scale*0.08, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w/2, y + h*0.7, scale*0.08, 0, Math.PI*2);
    ctx.stroke();
    return;
  }
  for (const seg of s) {
    ctx.beginPath();
    ctx.moveTo(x + seg[0], y + seg[1]);
    ctx.lineTo(x + seg[2], y + seg[3]);
    ctx.stroke();
  }
}

function drawLineString(ctx, x, y, scale, str, color) {
  const spacing = scale * 0.85;
  for (let i = 0; i < str.length; i++) {
    drawLineChar(ctx, x + i * spacing, y, scale, str[i].toUpperCase(), color);
  }
}

// drawing target of the block / item cell drawing: the main canvas, except for the battle-mode opponent window and item sprites
let _dc = ctx;
function valToColor(val) {
  let pic = val & 127;
  if ((val & 255) !== 0) pic ^= 64;
  const R = pic >> 4;
  const G = (pic >> 2) & 3;
  const B = pic & 3;
  let r = Math.floor((R + 0.6) / 4.8 * 255);
  let g = Math.floor((G + 0.8) / 4.4 * 255);
  let b = Math.floor((B + 0.8) / 4.4 * 255);
  if (R === 0 && G === 0 && B === 0) { r = 5; g = 5; b = 5; }
  if ((val & 255) > 127) { r = Math.min(255, Math.floor(r * 0.7 + 30)); g = Math.floor(g * 0.6); b = Math.floor(b * 0.6); }
  return `rgb(${r},${g},${b})`;
}

function valToColorBright(val) {
  let pic = val & 127;
  if ((val & 255) !== 0) pic ^= 64;
  const R = pic >> 4;
  const G = (pic >> 2) & 3;
  const B = pic & 3;
  let r = Math.min(255, Math.floor((R + 0.6) / 4.8 * 255 * 1.4));
  let g = Math.min(255, Math.floor((G + 0.8) / 4.4 * 255 * 1.4));
  let b = Math.min(255, Math.floor((B + 0.8) / 4.4 * 255 * 1.4));
  if ((val & 255) > 127) { r = Math.min(255, Math.floor(r * 0.7 + 30)); g = Math.floor(g * 0.6); b = Math.floor(b * 0.6); }
  if (R === 0 && G === 0 && B === 0) { r = 12; g = 12; b = 12; }
  return `rgb(${r},${g},${b})`;
}

function drawCell(x, y, w, h, val) {
  const code = val & 255;
  // val 31 (상쇄): wireframe only, white lines
  if (code === 31) {
    _dc.strokeStyle = '#ffffff';
    _dc.lineWidth = Math.max(1, w * 0.08);
    _dc.strokeRect(x + 1, y + 1, w - 2, h - 2);
    return;
  }
  const border = Math.max(1, w * 0.08);
  _dc.fillStyle = valToColor(val);
  _dc.fillRect(x, y, w, h);
  // Inner brighter face
  _dc.fillStyle = valToColorBright(val);
  _dc.fillRect(x + border, y + border, w - border * 2, h - border * 2);
  // Special item decorations
  drawCellDecoration(x, y, w, h, val);
}


function drawCellDecoration(x, y, w, h, val) {
  const code = val & 255;
  if (code === 0) return;
  const cx = x + w / 2, cy = y + h / 2;
  const s = w * 0.45;
  _dc.save();
  _dc.beginPath();
  _dc.rect(x, y, w, h);
  _dc.clip();
  _dc.lineWidth = Math.max(1, w * 0.06);
  _dc.lineCap = 'round';

  // pic 65 (self-destruct): 3 perpendicular squares/cross (same as bombs)
  if (code === 1) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    _dc.beginPath();
    _dc.moveTo(cx + s, cy - s);
    _dc.lineTo(cx - s, cy - s);
    _dc.lineTo(cx - s, cy + s);
    _dc.lineTo(cx + s, cy + s);
    _dc.closePath();
    _dc.stroke();
    _dc.beginPath();
    _dc.moveTo(cx, cy - s); _dc.lineTo(cx, cy + s);
    _dc.moveTo(cx + s, cy); _dc.lineTo(cx - s, cy);
    _dc.stroke();
  }
  // pic 75 (obstacle): filled cross (+ shape)
  if (code === 11) {
    _dc.fillStyle = 'rgba(0,0,0,0.4)';
    _dc.beginPath();
    _dc.moveTo(cx + 0.3*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.3*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.3*s, cy + 0.1*s);
    _dc.lineTo(cx + 0.3*s, cy + 0.1*s);
    _dc.fill();
    _dc.beginPath();
    _dc.moveTo(cx + 0.1*s, cy - 0.3*s);
    _dc.lineTo(cx - 0.1*s, cy - 0.3*s);
    _dc.lineTo(cx - 0.1*s, cy + 0.3*s);
    _dc.lineTo(cx + 0.1*s, cy + 0.3*s);
    _dc.fill();
  }
  // pic 66 (hide): pentagon house + window marks — XZ-face lineStrip+lines
  if (code === 2) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    // house outline: [0.3,-0.4]->[0.3,0.2]->[0,0.4]->[-0.3,0.2]->[-0.3,-0.4]
    _dc.beginPath();
    _dc.moveTo(cx + 0.3*s, cy + 0.4*s);
    _dc.lineTo(cx + 0.3*s, cy - 0.2*s);
    _dc.lineTo(cx,          cy - 0.4*s);
    _dc.lineTo(cx - 0.3*s, cy - 0.2*s);
    _dc.lineTo(cx - 0.3*s, cy + 0.4*s);
    _dc.stroke();
    // window mark: lineStrip [-0.15,0.1]->[-0.05,0.1]->[-0.05,-0.1]
    _dc.beginPath();
    _dc.moveTo(cx - 0.15*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.05*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.05*s, cy + 0.1*s);
    _dc.stroke();
    // window mark: lines [0.05,0.1]->[0.15,0.1]
    _dc.beginPath();
    _dc.moveTo(cx + 0.05*s, cy - 0.1*s);
    _dc.lineTo(cx + 0.15*s, cy - 0.1*s);
    _dc.stroke();
  }
  // pic 68 (x2): 3-sided square + vertical line — XZ-face lineStrip+lines
  if (code === 4) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    // 3-sided square: [0.4,0.4]->[-0.4,0.4]->[-0.4,-0.4]->[0.4,-0.4]
    _dc.beginPath();
    _dc.moveTo(cx + 0.4*s, cy - 0.4*s);
    _dc.lineTo(cx - 0.4*s, cy - 0.4*s);
    _dc.lineTo(cx - 0.4*s, cy + 0.4*s);
    _dc.lineTo(cx + 0.4*s, cy + 0.4*s);
    _dc.stroke();
    // vertical line: [0,0.5]->[0,-0.5]
    _dc.beginPath();
    _dc.moveTo(cx, cy - 0.5*s);
    _dc.lineTo(cx, cy + 0.5*s);
    _dc.stroke();
  }
  // pic 69 (erase): 4 short diagonal lines from corners — XZ-face lines
  if (code === 5) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    _dc.beginPath();
    _dc.moveTo(cx + 0.4*s, cy - 0.4*s); _dc.lineTo(cx + 0.2*s, cy - 0.2*s);
    _dc.moveTo(cx + 0.4*s, cy + 0.4*s); _dc.lineTo(cx + 0.2*s, cy + 0.2*s);
    _dc.moveTo(cx - 0.4*s, cy - 0.4*s); _dc.lineTo(cx - 0.2*s, cy - 0.2*s);
    _dc.moveTo(cx - 0.4*s, cy + 0.4*s); _dc.lineTo(cx - 0.2*s, cy + 0.2*s);
    _dc.stroke();
  }
  // pic 70 (hidenext): N/zigzag + X cross — XZ-face lineStrip+lines
  if (code === 6) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    // zigzag: [-0.2,-0.4]->[-0.2,0.4]->[0.2,-0.4]->[0.2,0.4]
    _dc.beginPath();
    _dc.moveTo(cx - 0.2*s, cy + 0.4*s);
    _dc.lineTo(cx - 0.2*s, cy - 0.4*s);
    _dc.lineTo(cx + 0.2*s, cy + 0.4*s);
    _dc.lineTo(cx + 0.2*s, cy - 0.4*s);
    _dc.stroke();
    // X cross: [0.5,0.5]->[-0.5,-0.5], [-0.5,0.5]->[0.5,-0.5]
    _dc.beginPath();
    _dc.moveTo(cx + 0.5*s, cy - 0.5*s); _dc.lineTo(cx - 0.5*s, cy + 0.5*s);
    _dc.moveTo(cx - 0.5*s, cy - 0.5*s); _dc.lineTo(cx + 0.5*s, cy + 0.5*s);
    _dc.stroke();
  }
  // pic for spin lock (code 91)
  if (code === 91) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    // square with arrow: [0.6,-0.6]->[0.6,0.6]->[-0.6,0.6]->[-0.6,-0.6]->[0.2,-0.6]->[-0.1,-0.4],[0.2,-0.6]->[-0.1,-0.8]
    _dc.beginPath();
    _dc.moveTo(cx + 0.6*s, cy + 0.6*s);
    _dc.lineTo(cx + 0.6*s, cy - 0.6*s);
    _dc.lineTo(cx - 0.6*s, cy - 0.6*s);
    _dc.lineTo(cx - 0.6*s, cy + 0.6*s);
    _dc.lineTo(cx + 0.2*s, cy + 0.6*s);
    _dc.lineTo(cx - 0.1*s, cy + 0.4*s);
    _dc.moveTo(cx + 0.2*s, cy + 0.6*s);
    _dc.lineTo(cx - 0.1*s, cy + 0.8*s);
    _dc.stroke();
    // diagonal X: [0.8,0.8]->[-0.8,-0.8], [-0.8,0.8]->[0.8,-0.8]
    _dc.beginPath();
    _dc.moveTo(cx + 0.8*s, cy - 0.8*s); _dc.lineTo(cx - 0.8*s, cy + 0.8*s);
    _dc.moveTo(cx - 0.8*s, cy - 0.8*s); _dc.lineTo(cx + 0.8*s, cy + 0.8*s);
    _dc.stroke();
  }
  // code 8 (speedup >>): double right arrows
  if (code === 8) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 1.5;
    _dc.beginPath();
    _dc.moveTo(cx - 0.5*s, cy - 0.5*s); _dc.lineTo(cx, cy); _dc.lineTo(cx - 0.5*s, cy + 0.5*s);
    _dc.moveTo(cx, cy - 0.5*s); _dc.lineTo(cx + 0.5*s, cy); _dc.lineTo(cx, cy + 0.5*s);
    _dc.stroke();
    _dc.lineWidth = 1;
  }
  // code 9 (speeddown <<): double left arrows
  if (code === 9) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 1.5;
    _dc.beginPath();
    _dc.moveTo(cx + 0.5*s, cy - 0.5*s); _dc.lineTo(cx, cy); _dc.lineTo(cx + 0.5*s, cy + 0.5*s);
    _dc.moveTo(cx, cy - 0.5*s); _dc.lineTo(cx - 0.5*s, cy); _dc.lineTo(cx, cy + 0.5*s);
    _dc.stroke();
    _dc.lineWidth = 1;
  }
  // code 10 (holdlock HX): H shape with X overlay
  if (code === 10) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 1.5;
    // H shape
    _dc.beginPath();
    _dc.moveTo(cx - 0.5*s, cy - 0.5*s); _dc.lineTo(cx - 0.5*s, cy + 0.5*s);
    _dc.moveTo(cx - 0.5*s, cy); _dc.lineTo(cx + 0.5*s, cy);
    _dc.moveTo(cx + 0.5*s, cy - 0.5*s); _dc.lineTo(cx + 0.5*s, cy + 0.5*s);
    _dc.stroke();
    // X cross
    _dc.beginPath();
    _dc.moveTo(cx - 0.3*s, cy - 0.3*s); _dc.lineTo(cx + 0.3*s, cy + 0.3*s);
    _dc.moveTo(cx + 0.3*s, cy - 0.3*s); _dc.lineTo(cx - 0.3*s, cy + 0.3*s);
    _dc.stroke();
    _dc.lineWidth = 1;
  }
  // code 16 (blindboard): horizontal eye shape with X
  if (code === 16) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 1.5;
    // Horizontal eye: two arcs (top and bottom)
    _dc.beginPath();
    _dc.moveTo(cx - 0.7*s, cy);
    _dc.quadraticCurveTo(cx, cy - 0.5*s, cx + 0.7*s, cy);
    _dc.quadraticCurveTo(cx, cy + 0.5*s, cx - 0.7*s, cy);
    _dc.stroke();
    // Pupil
    _dc.beginPath();
    _dc.arc(cx, cy, 0.15*s, 0, Math.PI*2);
    _dc.stroke();
    // X cross over eye
    _dc.beginPath();
    _dc.moveTo(cx - 0.4*s, cy - 0.4*s); _dc.lineTo(cx + 0.4*s, cy + 0.4*s);
    _dc.moveTo(cx + 0.4*s, cy - 0.4*s); _dc.lineTo(cx - 0.4*s, cy + 0.4*s);
    _dc.stroke();
    _dc.lineWidth = 1;
  }
  // code 17 (bombnext): 品 shape (1 box on top, 2 boxes on bottom)
  if (code === 17) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 1.5;
    // Top 밭 (box + cross)
    _dc.strokeRect(cx - 0.2*s, cy - 0.6*s, 0.4*s, 0.4*s);
    _dc.beginPath(); _dc.moveTo(cx, cy - 0.6*s); _dc.lineTo(cx, cy - 0.2*s); _dc.moveTo(cx - 0.2*s, cy - 0.4*s); _dc.lineTo(cx + 0.2*s, cy - 0.4*s); _dc.stroke();
    // Bottom-left 밭
    _dc.strokeRect(cx - 0.5*s, cy + 0.0*s, 0.4*s, 0.4*s);
    _dc.beginPath(); _dc.moveTo(cx - 0.3*s, cy); _dc.lineTo(cx - 0.3*s, cy + 0.4*s); _dc.moveTo(cx - 0.5*s, cy + 0.2*s); _dc.lineTo(cx - 0.1*s, cy + 0.2*s); _dc.stroke();
    // Bottom-right 밭
    _dc.strokeRect(cx + 0.1*s, cy + 0.0*s, 0.4*s, 0.4*s);
    _dc.beginPath(); _dc.moveTo(cx + 0.3*s, cy); _dc.lineTo(cx + 0.3*s, cy + 0.4*s); _dc.moveTo(cx + 0.1*s, cy + 0.2*s); _dc.lineTo(cx + 0.5*s, cy + 0.2*s); _dc.stroke();
    _dc.lineWidth = 1;
  }
  // code 21 (Simplify2): two boxes side by side
  if (code === 21) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 1.5;
    _dc.strokeRect(cx - 0.5*s, cy - 0.3*s, 0.45*s, 0.6*s);
    _dc.strokeRect(cx + 0.05*s, cy - 0.3*s, 0.45*s, 0.6*s);
    _dc.lineWidth = 1;
  }
  // code 22 (PentaForce): 3 boxes on top, 2 on bottom
  if (code === 22) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 1.5;
    // Top row: 3 boxes
    _dc.strokeRect(cx - 0.55*s, cy - 0.55*s, 0.33*s, 0.45*s);
    _dc.strokeRect(cx - 0.165*s, cy - 0.55*s, 0.33*s, 0.45*s);
    _dc.strokeRect(cx + 0.22*s, cy - 0.55*s, 0.33*s, 0.45*s);
    // Bottom row: 2 boxes
    _dc.strokeRect(cx - 0.4*s, cy + 0.05*s, 0.37*s, 0.45*s);
    _dc.strokeRect(cx + 0.03*s, cy + 0.05*s, 0.37*s, 0.45*s);
    _dc.lineWidth = 1;
  }
  // code 20 (빈공간삭제): thick down arrow (two vertical lines + V)
  if (code === 20) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 2;
    // Two vertical lines
    _dc.beginPath();
    _dc.moveTo(cx - 0.25*s, cy - 0.6*s); _dc.lineTo(cx - 0.25*s, cy + 0.1*s);
    _dc.moveTo(cx + 0.25*s, cy - 0.6*s); _dc.lineTo(cx + 0.25*s, cy + 0.1*s);
    _dc.stroke();
    // V shape (arrowhead)
    _dc.beginPath();
    _dc.moveTo(cx - 0.5*s, cy + 0.1*s); _dc.lineTo(cx, cy + 0.6*s); _dc.lineTo(cx + 0.5*s, cy + 0.1*s);
    _dc.stroke();
    _dc.lineWidth = 1;
  }
  // pic 38 (updel): top half filled — XZ-face quad
  if (code === 102) {
    _dc.fillStyle = 'rgba(0,0,0,0.4)';
    // quad: [-0.7,0]->[0.7,0]->[0.7,0.7]->[-0.7,0.7] (y flipped: top half)
    _dc.beginPath();
    _dc.moveTo(cx - 0.7*s, cy);
    _dc.lineTo(cx + 0.7*s, cy);
    _dc.lineTo(cx + 0.7*s, cy - 0.7*s);
    _dc.lineTo(cx - 0.7*s, cy - 0.7*s);
    _dc.fill();
  }
  // pic 40 (mono): rectangle outline (0.6 size) — XZ-face lineStrip
  if (code === 104) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    // closed rect: [-0.6,-0.6]->[0.6,-0.6]->[0.6,0.6]->[-0.6,0.6]->[-0.6,-0.6]
    _dc.beginPath();
    _dc.moveTo(cx - 0.6*s, cy + 0.6*s);
    _dc.lineTo(cx + 0.6*s, cy + 0.6*s);
    _dc.lineTo(cx + 0.6*s, cy - 0.6*s);
    _dc.lineTo(cx - 0.6*s, cy - 0.6*s);
    _dc.closePath();
    _dc.stroke();
  }
  // pic 52 (2-): two separated horizontal bars — XZ-face quads
  if (code === 116) {
    _dc.fillStyle = 'rgba(0,0,0,0.4)';
    // left bar: x in [-0.8, -0.2], y in [-0.1, 0.1]
    _dc.beginPath();
    _dc.moveTo(cx - 0.8*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.2*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.2*s, cy + 0.1*s);
    _dc.lineTo(cx - 0.8*s, cy + 0.1*s);
    _dc.fill();
    // right bar: x in [0.2, 0.8], y in [-0.1, 0.1]
    _dc.beginPath();
    _dc.moveTo(cx + 0.8*s, cy - 0.1*s);
    _dc.lineTo(cx + 0.2*s, cy - 0.1*s);
    _dc.lineTo(cx + 0.2*s, cy + 0.1*s);
    _dc.lineTo(cx + 0.8*s, cy + 0.1*s);
    _dc.fill();
  }
  // pic 53 (2+): two bars + two cross bars — XZ-face quads
  if (code === 117) {
    _dc.fillStyle = 'rgba(0,0,0,0.4)';
    // left horizontal bar: x in [-0.8, -0.2], y in [-0.1, 0.1]
    _dc.beginPath();
    _dc.moveTo(cx - 0.8*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.2*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.2*s, cy + 0.1*s);
    _dc.lineTo(cx - 0.8*s, cy + 0.1*s);
    _dc.fill();
    // right horizontal bar: x in [0.2, 0.8], y in [-0.1, 0.1]
    _dc.beginPath();
    _dc.moveTo(cx + 0.8*s, cy - 0.1*s);
    _dc.lineTo(cx + 0.2*s, cy - 0.1*s);
    _dc.lineTo(cx + 0.2*s, cy + 0.1*s);
    _dc.lineTo(cx + 0.8*s, cy + 0.1*s);
    _dc.fill();
    // left vertical cross: x in [-0.6, -0.4], y in [-0.3, 0.3]
    _dc.beginPath();
    _dc.moveTo(cx - 0.6*s, cy - 0.3*s);
    _dc.lineTo(cx - 0.4*s, cy - 0.3*s);
    _dc.lineTo(cx - 0.4*s, cy + 0.3*s);
    _dc.lineTo(cx - 0.6*s, cy + 0.3*s);
    _dc.fill();
    // right vertical cross: x in [0.4, 0.6], y in [-0.3, 0.3]
    _dc.beginPath();
    _dc.moveTo(cx + 0.6*s, cy - 0.3*s);
    _dc.lineTo(cx + 0.4*s, cy - 0.3*s);
    _dc.lineTo(cx + 0.4*s, cy + 0.3*s);
    _dc.lineTo(cx + 0.6*s, cy + 0.3*s);
    _dc.fill();
  }
  // pic 54 (VC): bowtie/hourglass lines — XZ-face lineStrips
  if (code === 118) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    // first bowtie line: [-0.3,0.5]->[0,0.7]->[0,-0.7]->[0.3,-0.5]
    _dc.beginPath();
    _dc.moveTo(cx - 0.3*s, cy - 0.5*s);
    _dc.lineTo(cx,          cy - 0.7*s);
    _dc.lineTo(cx,          cy + 0.7*s);
    _dc.lineTo(cx + 0.3*s, cy + 0.5*s);
    _dc.stroke();
    // second bowtie line: [0.3,0.5]->[0,0.7]->[0,-0.7]->[-0.3,-0.5]
    _dc.beginPath();
    _dc.moveTo(cx + 0.3*s, cy - 0.5*s);
    _dc.lineTo(cx,          cy - 0.7*s);
    _dc.lineTo(cx,          cy + 0.7*s);
    _dc.lineTo(cx - 0.3*s, cy + 0.5*s);
    _dc.stroke();
  }
  // pic 55 (AC): C-shape frame (3 bars forming C) — XZ-face quads
  if (code === 119) {
    _dc.fillStyle = 'rgba(0,0,0,0.4)';
    // top bar: x in [-0.5, 0.5], y in [0.3, 0.5]
    _dc.beginPath();
    _dc.moveTo(cx + 0.5*s, cy - 0.5*s);
    _dc.lineTo(cx - 0.5*s, cy - 0.5*s);
    _dc.lineTo(cx - 0.5*s, cy - 0.3*s);
    _dc.lineTo(cx + 0.5*s, cy - 0.3*s);
    _dc.fill();
    // bottom bar: x in [-0.5, 0.5], y in [-0.5, -0.3]
    _dc.beginPath();
    _dc.moveTo(cx + 0.5*s, cy + 0.5*s);
    _dc.lineTo(cx - 0.5*s, cy + 0.5*s);
    _dc.lineTo(cx - 0.5*s, cy + 0.3*s);
    _dc.lineTo(cx + 0.5*s, cy + 0.3*s);
    _dc.fill();
    // left vertical bar: x in [-0.5, -0.3], y in [-0.5, 0.5]
    _dc.beginPath();
    _dc.moveTo(cx - 0.5*s, cy - 0.5*s);
    _dc.lineTo(cx - 0.3*s, cy - 0.5*s);
    _dc.lineTo(cx - 0.3*s, cy + 0.5*s);
    _dc.lineTo(cx - 0.5*s, cy + 0.5*s);
    _dc.fill();
  }
  // pic 56-59,63,96 (bombs): 3 perpendicular squares/cross — center-plane lineStrips
  if (code >= 120 && code <= 123) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    // XY-plane square: [1,1]->[-1,1]->[-1,-1]->[1,-1]->[1,1]
    _dc.beginPath();
    _dc.moveTo(cx + s, cy - s);
    _dc.lineTo(cx - s, cy - s);
    _dc.lineTo(cx - s, cy + s);
    _dc.lineTo(cx + s, cy + s);
    _dc.closePath();
    _dc.stroke();
    // cross from YZ and XZ plane squares projected
    _dc.beginPath();
    _dc.moveTo(cx, cy - s); _dc.lineTo(cx, cy + s);
    _dc.moveTo(cx + s, cy); _dc.lineTo(cx - s, cy);
    _dc.stroke();
  }
  // pic 60 (3-): three separated bars — XZ-face quads
  if (code === 124) {
    _dc.fillStyle = 'rgba(0,0,0,0.4)';
    // left bar: x in [-0.8, -0.4], y in [-0.1, 0.1]
    _dc.beginPath();
    _dc.moveTo(cx - 0.8*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.4*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.4*s, cy + 0.1*s);
    _dc.lineTo(cx - 0.8*s, cy + 0.1*s);
    _dc.fill();
    // right bar: x in [0.4, 0.8], y in [-0.1, 0.1]
    _dc.beginPath();
    _dc.moveTo(cx + 0.8*s, cy - 0.1*s);
    _dc.lineTo(cx + 0.4*s, cy - 0.1*s);
    _dc.lineTo(cx + 0.4*s, cy + 0.1*s);
    _dc.lineTo(cx + 0.8*s, cy + 0.1*s);
    _dc.fill();
    // center bar: x in [-0.2, 0.2], y in [-0.1, 0.1]
    _dc.beginPath();
    _dc.moveTo(cx - 0.2*s, cy - 0.1*s);
    _dc.lineTo(cx + 0.2*s, cy - 0.1*s);
    _dc.lineTo(cx + 0.2*s, cy + 0.1*s);
    _dc.lineTo(cx - 0.2*s, cy + 0.1*s);
    _dc.fill();
  }
  // pic 61 (+1): cross shape (same as 65 on all faces) — XZ-face quads
  if (code === 125) {
    _dc.fillStyle = 'rgba(0,0,0,0.4)';
    // horizontal bar: x in [-0.3, 0.3], y in [-0.1, 0.1]
    _dc.beginPath();
    _dc.moveTo(cx + 0.3*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.3*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.3*s, cy + 0.1*s);
    _dc.lineTo(cx + 0.3*s, cy + 0.1*s);
    _dc.fill();
    // vertical bar: x in [-0.1, 0.1], y in [-0.3, 0.3]
    _dc.beginPath();
    _dc.moveTo(cx + 0.1*s, cy - 0.3*s);
    _dc.lineTo(cx - 0.1*s, cy - 0.3*s);
    _dc.lineTo(cx - 0.1*s, cy + 0.3*s);
    _dc.lineTo(cx + 0.1*s, cy + 0.3*s);
    _dc.fill();
  }
  // pic 62 (xzdel): bowtie shape — XZ-face lineStrips
  if (code === 126) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    // line 1: [-0.3,0.5]->[0,0.7]->[0,-0.7]->[0.3,-0.5]
    _dc.beginPath();
    _dc.moveTo(cx - 0.3*s, cy - 0.5*s);
    _dc.lineTo(cx,          cy - 0.7*s);
    _dc.lineTo(cx,          cy + 0.7*s);
    _dc.lineTo(cx + 0.3*s, cy + 0.5*s);
    _dc.stroke();
    // line 2: [0.3,0.5]->[0,0.7]->[0,-0.7]->[-0.3,-0.5]
    _dc.beginPath();
    _dc.moveTo(cx + 0.3*s, cy - 0.5*s);
    _dc.lineTo(cx,          cy - 0.7*s);
    _dc.lineTo(cx,          cy + 0.7*s);
    _dc.lineTo(cx - 0.3*s, cy + 0.5*s);
    _dc.stroke();
    // line 3: [0.5,-0.3]->[0.7,0]->[-0.7,0]->[-0.5,0.3]
    _dc.beginPath();
    _dc.moveTo(cx + 0.5*s, cy + 0.3*s);
    _dc.lineTo(cx + 0.7*s, cy);
    _dc.lineTo(cx - 0.7*s, cy);
    _dc.lineTo(cx - 0.5*s, cy - 0.3*s);
    _dc.stroke();
    // line 4: [0.5,0.3]->[0.7,0]->[-0.7,0]->[-0.5,-0.3]
    _dc.beginPath();
    _dc.moveTo(cx + 0.5*s, cy - 0.3*s);
    _dc.lineTo(cx + 0.7*s, cy);
    _dc.lineTo(cx - 0.7*s, cy);
    _dc.lineTo(cx - 0.5*s, cy + 0.3*s);
    _dc.stroke();
  }
  // val 30 (관통): T-shape + box decoration (古 shape, matching polycube pic 94)
  if (code === 30) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    // horizontal line at top
    _dc.beginPath();
    _dc.moveTo(cx + 0.3*s, cy - 0.4*s);
    _dc.lineTo(cx - 0.3*s, cy - 0.4*s);
    _dc.stroke();
    // vertical stem from center down
    _dc.beginPath();
    _dc.moveTo(cx, cy - 0.4*s);
    _dc.lineTo(cx, cy - 0.1*s);
    _dc.stroke();
    // box below (closed rectangle)
    _dc.beginPath();
    _dc.moveTo(cx - 0.3*s, cy - 0.1*s);
    _dc.lineTo(cx - 0.3*s, cy + 0.4*s);
    _dc.lineTo(cx + 0.3*s, cy + 0.4*s);
    _dc.lineTo(cx + 0.3*s, cy - 0.1*s);
    _dc.closePath();
    _dc.stroke();
  }
  // pic 63/96 (bombcr/explode): 3 perpendicular squares/cross
  if (code === 127) {
    _dc.strokeStyle = 'rgba(0,0,0,0.5)';
    _dc.beginPath();
    _dc.moveTo(cx + s, cy - s);
    _dc.lineTo(cx - s, cy - s);
    _dc.lineTo(cx - s, cy + s);
    _dc.lineTo(cx + s, cy + s);
    _dc.closePath();
    _dc.stroke();
    _dc.beginPath();
    _dc.moveTo(cx, cy - s); _dc.lineTo(cx, cy + s);
    _dc.moveTo(cx + s, cy); _dc.lineTo(cx - s, cy);
    _dc.stroke();
  }
  // pic 93 (reinforce): "x2" text
  if (code === 204) {
    _dc.strokeStyle = 'rgba(180,30,30,0.8)';
    _dc.lineWidth = Math.max(1, w * 0.06);
    // 5-pointed star (red)
    _dc.beginPath();
    const sr = s * 0.55, si = s * 0.22;
    for (let i = 0; i < 5; i++) {
      const a1 = (i * 72 - 90) * Math.PI / 180;
      const a2 = ((i * 72 + 36) - 90) * Math.PI / 180;
      _dc.lineTo(cx + sr * Math.cos(a1), cy + sr * Math.sin(a1));
      _dc.lineTo(cx + si * Math.cos(a2), cy + si * Math.sin(a2));
    }
    _dc.closePath();
    _dc.stroke();
  }
  // code 200: 거울상 (mirror) — trapezoid (|
  if (code === 200) {
    _dc.strokeStyle = 'rgba(255,255,255,0.7)';
    _dc.lineWidth = Math.max(1, w * 0.07);
    // Right vertical bar |
    _dc.beginPath();
    _dc.moveTo(cx + s * 0.4, cy - s * 0.8);
    _dc.lineTo(cx + s * 0.4, cy + s * 0.8);
    _dc.stroke();
    // Left angled line ( — trapezoid shape
    _dc.beginPath();
    _dc.moveTo(cx - s * 0.2, cy - s * 0.8);
    _dc.lineTo(cx - s * 0.7, cy - s * 0.3);
    _dc.lineTo(cx - s * 0.7, cy + s * 0.3);
    _dc.lineTo(cx - s * 0.2, cy + s * 0.8);
    _dc.stroke();
  }
  // Hole: three dashes at 12, 4, 8 o'clock
  if (code === 18) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 2;
    _dc.beginPath();
    // 12 o'clock
    _dc.moveTo(cx - 0.15*s, cy - 0.55*s);
    _dc.lineTo(cx + 0.15*s, cy - 0.55*s);
    // 4 o'clock (lower-right)
    _dc.moveTo(cx + 0.33*s, cy + 0.17*s);
    _dc.lineTo(cx + 0.48*s, cy + 0.43*s);
    // 8 o'clock (lower-left)
    _dc.moveTo(cx - 0.48*s, cy + 0.43*s);
    _dc.lineTo(cx - 0.33*s, cy + 0.17*s);
    _dc.stroke();
  }
  // Zigzag: Z letter
  if (code === 19) {
    _dc.strokeStyle = 'rgba(0,0,0,0.6)';
    _dc.lineWidth = 2;
    _dc.beginPath();
    _dc.moveTo(cx - 0.5*s, cy - 0.5*s);
    _dc.lineTo(cx + 0.5*s, cy - 0.5*s);
    _dc.lineTo(cx - 0.5*s, cy + 0.5*s);
    _dc.lineTo(cx + 0.5*s, cy + 0.5*s);
    _dc.stroke();
  }
  _dc.restore();
}

function drawBoard() {
  const cs = state.cellSize;
  const bx = state.boardX;
  const by = state.boardY;

  // Board background
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(bx, by, cs * BOARD_W, cs * BOARD_H);

  // Grid lines
  ctx.strokeStyle = '#1a1a2a';
  ctx.lineWidth = 1;
  for (let r = 0; r <= BOARD_H; r++) {
    const y = by + (BOARD_H - r) * cs;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(bx + cs * BOARD_W, y);
    ctx.stroke();
  }
  for (let c = 0; c <= BOARD_W; c++) {
    const x = bx + c * cs;
    ctx.beginPath();
    ctx.moveTo(x, by);
    ctx.lineTo(x, by + cs * BOARD_H);
    ctx.stroke();
  }

  // Blind board: skip board cells, ghost, and current block rendering
  if (state.blindboard > now()) {
    ctx.strokeStyle = '#445';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, cs * BOARD_W, cs * BOARD_H);
    return;
  }

  // Board cells (row 0 = bottom, drawn from bottom)
  for (let r = 0; r < BOARD_H; r++) {
    for (let c = 0; c < BOARD_W; c++) {
      const val = state.board[r][c];
      if (val === 0 || val >= 256) continue;
      const x = bx + c * cs;
      const y = by + (BOARD_H - 1 - r) * cs;
      drawCell(x, y, cs, cs, val);
    }
  }

  // Ghost piece (drop preview)
  if (!state.hideblock && state.nowblock && state.nowblock.cells) {
    let ghostRow = state.blockpos[0];
    while (!checkCollision(state.nowblock, ghostRow - 1, state.blockpos[1])) {
      ghostRow--;
    }
    if (ghostRow !== state.blockpos[0]) {
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < state.nowblock.cells.length; i++) {
        const [r, c] = state.nowblock.cells[i];
        const br = ghostRow + r;
        const bc = state.blockpos[1] + c;
        if (br >= 0 && br < BOARD_H && bc >= 0 && bc < BOARD_W) {
          const x = bx + bc * cs;
          const y = by + (BOARD_H - 1 - br) * cs;
          drawCell(x, y, cs, cs, state.nowblock.vals[i]);
        }
      }
      ctx.globalAlpha = 1.0;
    }
  }

  // Current block
  if (state.nowblock && state.nowblock.cells) {
    if (state.hideblock > 0) {
      // Conceal: thin dark edge lines only, no fill/decoration
      for (let i = 0; i < state.nowblock.cells.length; i++) {
        const [r, c] = state.nowblock.cells[i];
        const br = state.blockpos[0] + r;
        const bc = state.blockpos[1] + c;
        if (br >= 0 && br < BOARD_H && bc >= 0 && bc < BOARD_W) {
          const x = bx + bc * cs;
          const y = by + (BOARD_H - 1 - br) * cs;
          ctx.strokeStyle = 'rgba(40,40,55,0.6)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cs, cs);
        }
      }
    } else {
      for (let i = 0; i < state.nowblock.cells.length; i++) {
        const [r, c] = state.nowblock.cells[i];
        const br = state.blockpos[0] + r;
        const bc = state.blockpos[1] + c;
        if (br >= 0 && br < BOARD_H && bc >= 0 && bc < BOARD_W) {
          const x = bx + bc * cs;
          const y = by + (BOARD_H - 1 - br) * cs;
          drawCell(x, y, cs, cs, state.nowblock.vals[i]);
        }
      }
    }
  }

  // Board outline
  ctx.strokeStyle = '#445';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, cs * BOARD_W, cs * BOARD_H);
}

function drawBlockPreview(piece, cx, cy, previewCellSize) {
  if (!piece || !piece.cells || piece.cells.length === 0) return;
  const pcs = previewCellSize;
  for (let i = 0; i < piece.cells.length; i++) {
    const [r, c] = piece.cells[i];
    const x = cx + c * pcs;
    const y = cy - r * pcs;
    drawCell(x, y, pcs, pcs, piece.vals[i]);
  }
}

function drawSidePanel() {
  const cs = state.cellSize;
  const bx = state.boardX;
  const by = state.boardY;
  const cw = state.canvasW;
  const panelWidth = cw - (bx + BOARD_W * cs) - cs * 0.3;
  const labelScale = Math.max(5, panelWidth * 0.12);
  const numScale = Math.max(5, panelWidth * 0.12);
  const previewCs = cs * 0.7;

  // Right panel area
  const rx = bx + BOARD_W * cs + cs * 0.8;
  const panelW = cw - rx - cs * 0.3;
  const panelCx = rx + panelW / 2;
  let row = 0;
  const rowH = numScale * 2.2;

  // 1. NEXT: label + block preview (start below pause button)
  const panelStartY = by + labelScale * 3;
  if (state.hidenext === 0) {
    drawLineStringCentered(ctx, panelCx, panelStartY + rowH * row, labelScale, 'NEXT:', '#888');
    row++;
    const nextCx = rx + previewCs * 2;
    const nextCy = panelStartY + rowH * row;
    drawBlockPreview(state.nextblock, nextCx, nextCy, previewCs);
    row += 2;
  }

  // 2. HIGHSCORE:
  drawLineStringCentered(ctx, panelCx, panelStartY + rowH * row, labelScale, BATTLE ? 'TOTAL:' : 'HIGH:', '#888');
  row++;
  drawCenteredDigits(ctx, panelCx, panelStartY + rowH * row, numScale, BATTLE && window.PolyBattle ? PolyBattle.total : state.oh, 9, '#0ff');
  row++;

  // 3. LINES:
  drawLineStringCentered(ctx, panelCx, panelStartY + rowH * row, labelScale, 'LINES:', '#888');
  row++;
  drawCenteredDigits(ctx, panelCx, panelStartY + rowH * row, numScale, state.lines, 6, '#0ff');
  row++;

  // 4. SCORE: (or +bonus when gt>0)
  drawLineStringCentered(ctx, panelCx, panelStartY + rowH * row, labelScale, 'SCORE:', '#888');
  row++;
  if (state.gt > 0) {
    const bonusStr = '+' + String(Math.floor(state.gt));
    drawLineStringCentered(ctx, panelCx, panelStartY + rowH * row, numScale, bonusStr, '#0ff');
  } else {
    drawCenteredDigits(ctx, panelCx, panelStartY + rowH * row, numScale, state.score, 9, '#0ff');
  }
  row++;

  // 5. LEVEL:
  drawLineStringCentered(ctx, panelCx, panelStartY + rowH * row, labelScale, 'LEVEL:', '#888');
  row++;
  drawCenteredDigits(ctx, panelCx, panelStartY + rowH * row, numScale, state.level, 3, '#0ff');
  row++;

  // Left panel: Hold (block only, no label)
  const lx = bx - cs * 5.5;
  if (state.hidenext === 0 && lx > 0) {
    if (state.holdblock) {
      const holdCx = lx + previewCs * 2;
      const holdCy = by + numScale * 3;
      drawBlockPreview(state.holdblock, holdCx, holdCy, previewCs);
    }
  }
}

function drawRotatedPreviewInButton(btn, dir) {
  if (!state.nowblock || !state.nowblock.cells || state.nowblock.cells.length === 0) return;
  const test = clonePiece(state.nowblock);
  if (dir === 1) rotateCellsCW(test);
  else rotateCellsCCW(test);

  // Find bounding box of rotated piece
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const [r, c] of test.cells) {
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  const bw = maxC - minC + 1;
  const bh = maxR - minR + 1;
  const maxDim = Math.max(bw, bh);
  const cellSz = Math.max(2, (btn.w * 0.7) / Math.max(maxDim, 3));
  const ox = btn.x + btn.w / 2 - (bw * cellSz) / 2;
  const oy = btn.y + btn.h / 2 - (bh * cellSz) / 2;

  for (let i = 0; i < test.cells.length; i++) {
    const [r, c] = test.cells[i];
    const px = ox + (c - minC) * cellSz;
    const py = oy + (maxR - r) * cellSz;
    drawCell(px, py, cellSz, cellSz, test.vals[i]);
  }
}

function drawTouchButtons() {
  const buttons = getButtonLayout();
  for (const btn of buttons) {
    const isHold = btn.action === 'hold';
    const isPause = btn.action === 'pause';
    const isRotCW = btn.action === 'rotateCW';
    const isRotCCW = btn.action === 'rotateCCW';
    const isMoveLeft = btn.action === 'moveLeft';
    const isMoveRight = btn.action === 'moveRight';
    const isDrop = btn.action === 'drop';
    const isHardDrop = btn.action === 'hardDrop';

    // Background fill
    ctx.fillStyle = isHold ? 'rgba(200,60,120,0.3)' : 'rgba(60,60,80,0.35)';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

    // Border
    if (isHold) {
      ctx.strokeStyle = '#f0f';
    } else if (isRotCW || isRotCCW) {
      ctx.strokeStyle = '#0ff';
    } else {
      ctx.strokeStyle = '#556';
    }
    ctx.lineWidth = 1;
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    // Content
    const cx = btn.x + btn.w / 2;
    const cy = btn.y + btn.h / 2;
    const arrowSize = btn.w * 0.3;

    if (isRotCW) {
      drawRotatedPreviewInButton(btn, 1);
    } else if (isRotCCW) {
      drawRotatedPreviewInButton(btn, -1);
    } else if (isMoveLeft) {
      // Draw "<" arrow
      ctx.strokeStyle = '#aab';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + arrowSize, cy - arrowSize);
      ctx.lineTo(cx - arrowSize, cy);
      ctx.lineTo(cx + arrowSize, cy + arrowSize);
      ctx.stroke();
    } else if (isMoveRight) {
      // Draw ">" arrow
      ctx.strokeStyle = '#aab';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - arrowSize, cy - arrowSize);
      ctx.lineTo(cx + arrowSize, cy);
      ctx.lineTo(cx - arrowSize, cy + arrowSize);
      ctx.stroke();
    } else if (isHardDrop) {
      // Draw double downward arrow ▼▼
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      const a = arrowSize * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - a, cy - a * 0.8);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + a, cy - a * 0.8);
      ctx.moveTo(cx - a, cy + a * 0.2);
      ctx.lineTo(cx, cy + a);
      ctx.lineTo(cx + a, cy + a * 0.2);
      ctx.stroke();
    } else if (isDrop) {
      // Draw downward arrow (soft drop)
      ctx.strokeStyle = '#aab';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - arrowSize, cy - arrowSize);
      ctx.lineTo(cx, cy + arrowSize);
      ctx.lineTo(cx + arrowSize, cy - arrowSize);
      ctx.stroke();
    } else if (isPause) {
      // Draw "||" two vertical bars
      ctx.strokeStyle = '#0ff';
      ctx.lineWidth = 1.5;
      const barH = btn.h * 0.4;
      const barGap = btn.w * 0.12;
      ctx.beginPath();
      ctx.moveTo(cx - barGap, cy - barH / 2);
      ctx.lineTo(cx - barGap, cy + barH / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + barGap, cy - barH / 2);
      ctx.lineTo(cx + barGap, cy + barH / 2);
      ctx.stroke();
    }
    // Hold button: draw held block preview inside
    if (isHold && state.holdblock && state.holdblock.cells && state.holdblock.cells.length > 0) {
      let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
      for (const [r, c] of state.holdblock.cells) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
      const bw = maxC - minC + 1;
      const bh = maxR - minR + 1;
      const maxDim = Math.max(bw, bh);
      const cellSz = Math.max(2, (btn.w * 0.7) / Math.max(maxDim, 3));
      const ox = btn.x + btn.w / 2 - (bw * cellSz) / 2;
      const oy = btn.y + btn.h / 2 - (bh * cellSz) / 2;
      for (let i = 0; i < state.holdblock.cells.length; i++) {
        const [r, c] = state.holdblock.cells[i];
        const px = ox + (c - minC) * cellSz;
        const py = oy + (maxR - r) * cellSz;
        drawCell(px, py, cellSz, cellSz, state.holdblock.vals[i]);
      }
    }
  }
}

function drawLineStringCentered(ctx, cx, y, scale, str, color) {
  const spacing = scale * 0.85;
  const totalW = str.length * spacing;
  drawLineString(ctx, cx - totalW / 2, y, scale, str, color);
}

function drawCenteredDigits(ctx, cx, y, scale, num, count, color) {
  const s = String(num);
  const offset = Math.floor((count - Math.floor(Math.log10(num > 0 ? num : 1) + 1)) / 2);
  const spacing = scale * 0.85;
  const totalW = count * spacing;
  const startX = cx - totalW / 2 + offset * spacing;
  drawLineString(ctx, startX, y, scale, s, color);
}

function drawStartScreen() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, state.canvasW, state.canvasH);

  // Background: stacked blocks graphic
  if (startBgImage && startBgImage.complete) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(startBgImage, 0, 0, state.canvasW, state.canvasH);
    ctx.globalAlpha = 1.0;
  } else if (startTexture) {
    ctx.globalAlpha = 0.3;
    ctx.drawImage(startTexture, 0, 0, state.canvasW, state.canvasH);
    ctx.globalAlpha = 1.0;
  }

  const cw = state.canvasW;
  const ch = state.canvasH;

  // Title using line-drawn letters
  const titleScale = Math.max(20, cw * 0.065);
  ctx.lineWidth = 1.5;
  drawLineStringCentered(ctx, cw / 2, ch * 0.18, titleScale, 'POLYNOMINO', '#fff');
  if (BATTLE) drawLineStringCentered(ctx, cw / 2, ch * 0.18 + titleScale * 1.5, Math.max(8, titleScale * 0.34), 'BATTLE MODE', '#8cf');

  if (state.about === 0) {
    // Start button box
    const btnW = cw * 0.35;
    const btnH = ch * 0.06;
    const btnLabelScale = Math.max(10, btnH * 0.5);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(cw / 2 - btnW / 2, ch * 0.52, btnW, btnH);
    drawLineStringCentered(ctx, cw / 2, ch * 0.52 + btnH * 0.25, btnLabelScale, 'START', '#fff');

    // About button box
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(cw / 2 - btnW / 2, ch * 0.62, btnW, btnH);
    drawLineStringCentered(ctx, cw / 2, ch * 0.62 + btnH * 0.25, btnLabelScale, 'ABOUT', '#fff');

    // Other games hint
    const _fs = Math.max(9, Math.floor(cw * 0.028));
    ctx.font = 'bold ' + _fs + 'px monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Also: Polycube (3D) · Polytesseract (4D)', cw / 2, ch * 0.78);
    ctx.fillText('Switch in Game > Theme', cw / 2, ch * 0.78 + _fs * 1.3);
  }
}

function drawGameOverScreen() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, state.canvasW, state.canvasH);

  // Background: stacked blocks graphic
  if (startBgImage && startBgImage.complete) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(startBgImage, 0, 0, state.canvasW, state.canvasH);
    ctx.globalAlpha = 1.0;
  } else if (startTexture) {
    ctx.globalAlpha = 0.3;
    ctx.drawImage(startTexture, 0, 0, state.canvasW, state.canvasH);
    ctx.globalAlpha = 1.0;
  }

  const cw = state.canvasW;
  const ch = state.canvasH;

  // Title using line-drawn letters
  const titleScale = Math.max(18, cw * 0.06);
  ctx.lineWidth = 1.5;
  if (BATTLE) {            // battle mode: WIN / LOSE / DRAW instead of GAME OVER (same line font, same place)
    const w = window.PolyBattle && PolyBattle.result && PolyBattle.result();
    if (w) drawLineStringCentered(ctx, cw / 2, ch * 0.15, titleScale, w.toUpperCase(), w === 'win' ? '#5f5' : (w === 'lose' ? '#f66' : '#ccc'));
  } else drawLineStringCentered(ctx, cw / 2, ch * 0.15, titleScale, 'GAME OVER', '#fff');

  // Score label and digits (large, 2x)
  const labelScale = Math.max(14, cw * 0.055);
  const scoreScale = Math.max(20, cw * 0.09);
  drawLineStringCentered(ctx, cw / 2, ch * 0.28, labelScale, 'SCORE:', '#888');
  drawLineStringCentered(ctx, cw / 2, ch * 0.37, scoreScale, String(state.oscore), '#0ff');

  // High score
  drawLineStringCentered(ctx, cw / 2, ch * 0.46, labelScale, BATTLE ? 'TOTAL:' : 'HIGH:', '#888');
  drawLineStringCentered(ctx, cw / 2, ch * 0.53, scoreScale * 0.7, String(BATTLE && window.PolyBattle ? PolyBattle.total : state.oh), '#fff');

  // Button boxes
  const btnW = cw * 0.35;
  const btnH = ch * 0.06;
  const btnLabelScale = Math.max(10, btnH * 0.5);

  // Retry button
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cw / 2 - btnW / 2, ch * 0.62, btnW, btnH);
  drawLineStringCentered(ctx, cw / 2, ch * 0.62 + btnH * 0.25, btnLabelScale, 'RETRY', '#fff');

  // Main button
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cw / 2 - btnW / 2, ch * 0.72, btnW, btnH);
  drawLineStringCentered(ctx, cw / 2, ch * 0.72 + btnH * 0.25, btnLabelScale, 'MAIN', '#fff');
}

function drawPauseScreen() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, state.canvasW, state.canvasH);

  // Background: polynomino start screen image
  if (startBgImage && startBgImage.complete) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(startBgImage, 0, 0, state.canvasW, state.canvasH);
    ctx.globalAlpha = 1.0;
  } else if (startTexture) {
    ctx.globalAlpha = 0.3;
    ctx.drawImage(startTexture, 0, 0, state.canvasW, state.canvasH);
    ctx.globalAlpha = 1.0;
  }

  const cw = state.canvasW;
  const ch = state.canvasH;

  // "PAUSE" in large line-drawn letters
  const titleScale = Math.max(18, cw * 0.06);
  ctx.lineWidth = 1.5;
  drawLineStringCentered(ctx, cw / 2, ch * 0.40, titleScale, 'PAUSE', '#fff');

  // Resume button: square + right-pointing triangle, top-right corner (like polycube)
  const boxSize = Math.max(30, cw * 0.12);
  const bx = cw - boxSize - cw * 0.06;
  const by = ch * 0.04;
  ctx.strokeStyle = '#0ff';
  ctx.lineWidth = Math.max(2, boxSize * 0.06);
  ctx.strokeRect(bx, by, boxSize, boxSize);
  // Play triangle inside
  const mx = bx + boxSize * 0.35, my = by + boxSize * 0.25;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(mx + boxSize * 0.4, by + boxSize * 0.5);
  ctx.lineTo(mx, by + boxSize * 0.75);
  ctx.closePath();
  ctx.stroke();
}

// --- Item info overlay ---
const _isKo = /^ko/i.test(navigator.language || '');
const ITEM_DESC = _isKo ? {
  1:'자폭: 착지 즉시 주변 파괴', 2:'은폐: 현재 블록 숨김', 200:'거울상: 보드 좌우반전', 19:'지그재그: 각 행 블록 재배치', 4:'득점강화: 점수 4배 (중첩 16배)',
  5:'아이템제거: 판 위 아이템 제거', 6:'예측차단: 다음 블록 숨김', 8:'속도증가: x2.5', 9:'속도감소: x0.4',
  10:'홀드봉인: 15턴간 홀드 불가', 11:'장애물: 랜덤 위치 장애물 3개', 16:'시야봉인: 보드 숨김', 17:'폭탄블록5개: 5블록에 폭탄', 18:'구멍: 블록 30% 제거',
  91:'회전봉인: 10턴간 회전 불가', 20:'빈공간삭제: 모든 빈공간 정리', 21:'소형화: 8턴간 3칸 이하', 22:'대형화: 8턴간 5칸 이상', 30:'관통: 낙하경로 블록파괴', 31:'상쇄: 블록과 닿으면 상호삭제',
  102:'상단삭제: 위의 블록 모두 제거', 104:'모노전용: 1칸 블록만', 116:'-2줄: 바닥 2줄 제거', 117:'+2줄: 바닥에 2줄 추가',
  118:'범위삭제: 주변 열 전체삭제', 119:'전체삭제: 판 전체 클리어', 120:'시한폭탄: 3턴후 폭발', 121:'시한폭탄: 2턴후 폭발', 122:'시한폭탄: 1턴후 폭발',
  123:'시한폭탄: 폭발 임박', 124:'-3줄: 바닥 3줄 제거', 125:'+1줄: 바닥에 1줄 추가', 126:'횡렬삭제: 해당 행 삭제', 127:'폭탄변환: 30%확률 폭탄화',
  204:'강화: 20턴간 효과 2배',
} : {
  1:'Self-Destruct: 3x3 boom', 2:'Conceal: Hide piece 10t', 200:'Mirror: Flip board', 19:'Zigzag: Shuffle each row', 4:'Score Boost: x4 (stack x16)', 5:'Item Clear: Remove items',
  6:'No Preview: Hide next 20t', 8:'Speed Up: x2.5', 9:'Slow Down: x0.4', 10:'Hold Lock: 15 turns', 11:'Obstacle: 3 random',
  16:'Blind: Hide board 10sec', 17:'Bomb x5: Next 5 have bombs', 18:'Hole: Remove 30% blocks', 91:'Rot Lock: 10 turns', 20:'Gap Clear: Remove gaps', 21:'Simplify: ≤3 cells 8 turns',
  22:'PentaForce: ≥5 cells 8 turns', 30:'Pierce: Destroy in path', 31:'Cancel: Mutual delete', 102:'Top Clear: All above', 104:'Mono Only: 1-cell 10 turns',
  116:'-2 Lines: Remove 2', 117:'+2 Lines: Add 2 lines', 118:'Range Del: ±1 columns', 119:'Full Clear: Wipe board',
  120:'Time Bomb: 3t to blow', 121:'Time Bomb: 2t to blow', 122:'Time Bomb: 1t to blow', 123:'Time Bomb: Imminent',
  124:'-3 Lines: Remove 3', 125:'+1 Line: Add 1 line', 126:'Row Del: Delete row', 127:'Bomb Convert: 30% bomb',
  204:'Enforce: x2 effects 20 turns',
};
// 유리=beneficial(cyan), 불리=harmful(orange) — matches about section
// battle mode: the score-boost block steals the items from the opponent's slots (see ../battle.js)
if (BATTLE) ITEM_DESC[4] = _isKo ? '강탈: 상대에게 쓰면 상대 슬롯 아이템을 전부 뺏음' : 'Steal: on the opponent = take all its slot items';
const ITEM_GOOD = new Set([1,4,9,20,21,30,31,102,104,116,117,118,119,124,125,126,204]);

function getActiveItemCodes() {
  const codes = new Set();
  for (let r = 0; r < BOARD_H; r++) {
    for (let c = 0; c < BOARD_W; c++) {
      const v = state.board[r][c];
      if (v !== 0 && ITEM_DESC[v & 255]) codes.add(v & 255);
    }
  }
  const pieces = [state.nowblock, state.nextblock, state.holdblock];
  for (const p of pieces) {
    if (p && p.vals) {
      for (const v of p.vals) {
        if (ITEM_DESC[v & 255]) codes.add(v & 255);
      }
    }
  }
  return Array.from(codes).sort((a, b) => a - b);
}

function drawItemInfo() {
  if (!itemsEnabled) return;
  const codes = getActiveItemCodes();
  if (codes.length === 0) { state.itemInfoIndex = 0; return; }

  const now = Date.now();
  if (now - state.itemInfoLastSwitch > 1000) {
    state.itemInfoIndex = (state.itemInfoIndex + 1) % codes.length;
    state.itemInfoLastSwitch = now;
  }
  if (state.itemInfoIndex >= codes.length) state.itemInfoIndex = 0;

  const code = codes[state.itemInfoIndex];
  const desc = ITEM_DESC[code] || '';

  const boardBottom = state.boardY + state.cellSize * BOARD_H;
  const btnSize = Math.min(state.canvasW * 0.13, state.canvasH * 0.08);
  const buttonTop = state.canvasH * 0.82 - btnSize - btnSize * 0.1;
  const gapH = buttonTop - boardBottom;
  if (gapH < 8) return;

  const textY = boardBottom + gapH * 0.5;
  const blockSize = Math.min(gapH * 0.65, state.cellSize * 0.9);
  const startX = Math.max(state.canvasW * 0.02, state.boardX);

  drawCell(startX, textY - blockSize / 2, blockSize, blockSize, code);

  const fontSize = Math.max(8, Math.min(blockSize * 0.75, gapH * 0.45));
  ctx.save();
  ctx.font = `bold ${Math.floor(fontSize)}px sans-serif`;
  ctx.fillStyle = ITEM_GOOD.has(code) ? '#0ff' : '#f90';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const maxTextW = state.canvasW - startX - blockSize - fontSize * 0.5;
  const txt = ctx.measureText(desc).width > maxTextW ? desc.substring(0, Math.floor(desc.length * maxTextW / ctx.measureText(desc).width)) : desc;
  ctx.fillText(txt, startX + blockSize + fontSize * 0.3, textY);
  ctx.restore();
}

function drawScene() {
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, state.canvasW, state.canvasH);

  // Background texture (like polycube's texture[1] behind the board)
  if (state.textures && state.textures[1]) {
    ctx.globalAlpha = 0.3;
    ctx.drawImage(state.textures[1], 0, 0, state.canvasW, state.canvasH);
    ctx.globalAlpha = 1.0;
  }

  const X = battleXform();           // battle mode: everything but the control buttons is drawn 1.5x smaller (the buttons stay where they are in normal mode)
  if (X) { ctx.save(); ctx.translate(X.ox, X.oy); ctx.scale(X.s, X.s); }
  drawBoard();
  if (X) ctx.translate(-BT_HUD_DX * state.canvasW, 0);
  drawSidePanel();
  if (X) ctx.translate(BT_HUD_DX * state.canvasW, 0);
  drawItemInfo();
  if (BATTLE) battleDrawSlots();
  if (X) ctx.restore();
  drawTouchButtons();
}

// ====== AI PLAYER ======
// A trained afterstate-value network (web/ai.js + web/ai-model.js) plays with the same inputs a human has,
// but at most ONE input (hold / rotate / move / hard drop) every 200 ms while gravity keeps running.
// To evaluate a plan we really execute its inputs on a saved copy of the game with a virtual clock
// (real rotate()/move()/stickblock()/removeline(), gravity between inputs), so item effects, cancel/pierce,
// bombs, garbage lines, speed up/down... are all reflected; the state is then restored.
// While the board is hidden (blind item) the AI does not see it: it plans on the board it remembers plus
// its own predictions. While NEXT is hidden (hide-next item) it does not see the next/held piece either.
const AI_GAP = 200;
const AI_GRAVITY = [800, 717, 633, 550, 467, 383, 300, 217];
const AI_MAXC = 128;
const AI_TRIAL_MASK = 0x9E3779B9;
const ai = { on: false, plan: null, piece: null, lastAct: 0, overAt: 0, pieces: 0, belief: null, beliefValid: false, h: null, snap: null, lastSumAct: null, thinkEst: 0, gen: null, sliceEnd: 0, planFor: null, planT0: 0 };

function hardDrop() {
  const _hb = state.nowblock;
  let mr;
  while ((mr = moveDown()) !== 1) { if (state.nowblock !== _hb) break; }
  if (state.nowblock !== _hb) { state.timestamp = now(); return; }
  if (stickblock()) { gover(); initBlockState(); return; }
  calculatescore(removeline()); if (state._ovf) overflowDie();
  state.timestamp = now();
}

// hard drop for what-if evaluation: same as hardDrop() but never ends/resets the game
function aiTrialDrop() {
  const _hb = state.nowblock;
  let mr;
  while ((mr = moveDown()) !== 1) { if (state.nowblock !== _hb) break; }
  if (state.nowblock !== _hb) return { dead: false, lines: 0 };
  if (stickblock()) return { dead: true, lines: 0 };
  const l = removeline();
  calculatescore(l);
  if (state._ovf) { state._ovf = false; return { dead: true, lines: l }; }
  return { dead: false, lines: l };
}

const AI_FIELDS = ['nowhb', 'nexthb', 'holdhb', 'score', 'lines', 'level', 'asc', 'gt', 'ht', 'monoonly', 'spinlock',
  'hideblock', 'hidenext', 'score2x', 'speedup', 'speeddown', 'holdlock', 'blindboard', 'bombnext', 'compactPending',
  'simplify2', 'pentaForce', 'reinforce', '_assignIsMonoBlock', '_rfUpgrade', 'timestamp', 'vkspace2', '_cBoom', '_cGarb', '_cHold'];

function aiSave() {
  const s = {};
  for (const k of AI_FIELDS) s[k] = state[k];
  s.board = clone2d(state.board);
  s.now = clonePiece(state.nowblock);
  s.next = clonePiece(state.nextblock);
  s.hold = state.holdblock ? clonePiece(state.holdblock) : null;
  s.pos = [state.blockpos[0], state.blockpos[1]];
  s.cTrig = Object.assign({}, state._cTrig); s.cPlaced = Object.assign({}, state._cPlaced);
  if (BATTLE) { s.bSlots = PolyBattle.slots.slice(); s.bq = _bq.slice(); }   // battle mode: the item queue / the position items waiting for a single cell are part of what a what-if run changes (the ties live on the cloned pieces)
  return s;
}
function aiLoad(s) {
  state._ovf = false;
  for (const k of AI_FIELDS) state[k] = s[k];
  state.board = clone2d(s.board);
  state.nowblock = clonePiece(s.now);
  state.nextblock = clonePiece(s.next);
  state.holdblock = s.hold ? clonePiece(s.hold) : null;
  state.blockpos = [s.pos[0], s.pos[1]];
  state._cTrig = Object.assign({}, s.cTrig); state._cPlaced = Object.assign({}, s.cPlaced);
  if (BATTLE && s.bSlots) { PolyBattle.slots = s.bSlots.slice(); _bq.length = 0; for (const c of s.bq) _bq.push(c); }
}

// what the value network sees after a plan (obs = what the AI could observe at decision time)
function aiPost(lines, placedN, obs) {
  const st = state;
  return {
    board: st.board, now: st.nowblock, nowhb: st.nowhb, hold: st.holdblock, holdhb: st.holdhb,
    spinlock: st.spinlock, hidenext: st.hidenext, holdlock: st.holdlock, score2x: st.score2x, monoonly: st.monoonly,
    simplify2: st.simplify2, pentaForce: st.pentaForce, bombnext: st.bombnext, reinforce: st.reinforce,
    compactPending: st.compactPending, level: st.level, speedup: st.speedup, speeddown: st.speeddown,
    lines: lines, placedN: placedN, blind: obs.blind, blindRemain: obs.blindRemain, hideNext: obs.hideNext,
    boom: st._evBoom || 0, garb: st._evGarb || 0,
  };
}

// cumulative event counters + board shape: the raw material of the agent's event memory (see PolyAI.summarize)
function aiCounters(board) {
  let holes = 0, maxh = 0;
  for (let c = 0; c < BOARD_W; c++) {
    let h = 0;
    for (let r = BOARD_H - 1; r >= 0; r--) if (board[r][c] !== 0) { h = r + 1; break; }
    maxh = Math.max(maxh, h);
    for (let r = 0; r < h; r++) if (board[r][c] === 0) holes++;
  }
  return { trig: Object.assign({}, state._cTrig), placed: Object.assign({}, state._cPlaced), boom: state._cBoom, garb: state._cGarb,
    hold: state._cHold, lines: state.lines, holes: holes, maxh: maxh };
}

function aiKey(dead, c) {
  const st = state;
  return dead + '|' + st.board.map(r => r.join(',')).join(';') + '|' + st.holdblock.cells.join(';') + st.holdblock.vals.join(',') +
    '|' + st.nowblock.cells.join(';') + st.nowblock.vals.join(',') + '|' + st.score + '|' + st.holdhb + '|' + st.nowhb +
    '|' + c.lastAct + '|' + st.timestamp + '|' + st.blockpos[0] + ',' + st.blockpos[1];
}

// ---- what-if gravity (updateFallingLogic on the virtual clock) ----
function aiNextFall(f) {
  const interval = AI_GRAVITY[Math.min(state.level - 1, 7)];
  let mult = 1;
  if (state.speedup > 0 && mult === 1) mult = state.reinforce > 0 ? 0.2 : 0.4;
  if (state.speeddown > 0 && mult === 1) mult = state.reinforce > 0 ? 5.0 : 2.5;
  return Math.max(Math.floor(state.timestamp + interval * mult) + 1, f);
}
// process gravity for frames [c.f, to). 0 = ok, 1 = current piece replaced (stop), 2 = game over
function aiAdvance(c, to) {
  while (true) {
    const tf = aiNextFall(c.f);
    if (tf >= to) { if (to > c.f) c.f = to; return 0; }
    _vnow = tf; c.f = tf + 1;
    const s0 = state.nowblock, base = AI_GRAVITY[Math.min(state.level - 1, 7)];
    const mr = moveDown();
    if (mr === 2) state.timestamp = tf + base;
    else if (mr === 1) {
      if (stickblock()) return 2;
      const l = removeline(); calculatescore(l); c.lines += l; state.timestamp = tf;
      if (state._ovf) { state._ovf = false; return 2; }
    } else state.timestamp = tf;
    if (state.nowblock !== s0) return 1;
  }
}

const P_DONE = 0, P_INVALID = 1, P_INTERRUPTED = 2, P_DEAD = 3;
// Execute [hold] + k*rotate + |dcol|*move + hard drop, one input per AI_GAP with gravity in between.
function aiRunPlan(c, hd, k, dcol) {
  c.lines = 0; state._evBoom = 0; state._evGarb = 0;
  let ref = state.nowblock;
  const total = (hd ? 1 : 0) + k + Math.abs(dcol) + 1;
  for (let j = 0; j < total; j++) {
    const a = (hd && j === 0) ? 'H' : (j < (hd ? 1 : 0) + k ? 'R' : (j < total - 1 ? (dcol < 0 ? 'L' : 'X') : 'D'));
    const T = c.lastAct + AI_GAP;
    if (aiAdvance(c, T) === 2) return P_DEAD;
    if (state.nowblock !== ref) return P_INTERRUPTED;
    _vnow = T; c.lastAct = T; c.f = T;
    let ok = true, dead = false;
    switch (a) {
      case 'H': tryHoldSwap(); if (state.nowblock === ref) ok = false; else ref = state.nowblock; break;
      case 'R': ok = state.spinlock === 0 && rotate(1) === 0; break;
      case 'L': ok = move(-1) !== 1; break;
      case 'X': ok = move(1) !== 1; break;
      case 'D': { const r = aiTrialDrop(); dead = r.dead; c.lines += r.lines; state.timestamp = T; break; }
    }
    if (dead) return P_DEAD;
    if (aiAdvance(c, T + 1) === 2) return P_DEAD;
    if (!ok) return P_INVALID;
    if (a === 'D') return P_DONE;
    if (state.nowblock !== ref) return P_INTERRUPTED;
  }
  return P_DONE;
}

// Enumerate every plan the AI could carry out from the current state, evaluated with what-if execution.
// Returns candidates [{hold, rot, dcol, status, dead, lines, boom, garb, feat, postBoard}] in a fixed order.
// ---- planning is written as generators so that the search can be time-sliced between game frames ----
// While the AI thinks the game must run exactly as for a human player (gravity included), so it never blocks the game loop for long:
// aiRunSlice() runs a few ms of search per frame; every slice saves the real game state first and puts it back afterwards, so the
// what-if trials (virtual clock, copies of the state) can never leak into the real game.
function aiSliceExpired() { if (window.__aiSliceHook) return window.__aiSliceHook(); return performance.now() > ai.sliceEnd; }

// Enumerate every plan from a saved decision state `root` (state at decision time tNow). Used at the real decision and,
// for the 2-ply search, at the child decision after a candidate plan has been played on.
function* aiEnumerateCoreG(root, tNow, rootC, obs, blind, withFeatures, seed) {
  const hook = window.__rngHook;
  const placedN = root.now.cells.length;
  const cands = [], seen = new Set();
  const tryPlan = (hd, k, dc) => {
    aiLoad(root);
    if (hook) hook.set(seed);
    const c = { f: tNow, lastAct: tNow - AI_GAP, lines: 0 };
    const st = aiRunPlan(c, hd, k, dc);
    if (st === P_INVALID) return st;
    if (cands.length >= AI_MAXC) return st;
    const dead = st === P_DEAD;
    const key = aiKey(dead ? 1 : 0, c);
    if (!seen.has(key)) {
      seen.add(key);
      const cd = { hold: hd, rot: k, dcol: dc, status: st, dead: dead, lines: c.lines, gain: state.score - root.score, boom: state._evBoom || 0, garb: state._evGarb || 0, feat: null, postBoard: clone2d(state.board) };
      if (withFeatures && !dead) { cd.feat = PolyAI.features(aiPost(c.lines, placedN, obs)); cd.sum = PolyAI.summarize(rootC, aiCounters(state.board), blind); }
      cands.push(cd);
    }
    return st;
  };
  for (let hd = 0; hd < 2; hd++) {
    for (let k = 0; k < 4; k++) {
      if (tryPlan(hd, k, 0) === P_INVALID) break;
      for (let dir = -1; dir <= 1; dir += 2) {
        for (let dc = 1; dc < 30; dc++) {
          const r = tryPlan(hd, k, dc * dir);
          if (r === P_INVALID || r === P_INTERRUPTED) break;
          if (aiSliceExpired()) yield;
        }
      }
      if (aiSliceExpired()) yield;
    }
  }
  _vnow = null;
  return cands;   // (the callers put the real random stream back)
}

// bookkeeping at a decision root, on the REAL game state (not inside a time slice): event memory + the test hook
function aiBeginDecision() {
  // event memory: fold what happened since the previous decision into the traces (before anything else happens at this root)
  const cnt0 = aiCounters(state.board);
  // (the memory is a recurrent net: its state absorbs the events of the decision just finished; a game start feeds zeros)
  ai.lastSumAct = ai.snap ? PolyAI.summarize(ai.snap, cnt0, state.blindboard > now()) : new Float32Array(PolyAI.SD);
  ai.h = PolyAI.hiddenStep(ai.snap ? ai.h : null, ai.lastSumAct);
  ai.snap = cnt0;
  if (BATTLE) { aiBattleUse(); aiBattleCtx(); }               // battle mode: which stored item to use / throw now? then the plans (after the memory update: as in training)
  if (window.__aiPreEnum) window.__aiPreEnum(); // test hook
}

// ---- battle mode: the item-use decision (state must equal vec_bstate in sim.cpp) ----
// [own board features][what I see of the opponent window][what I see of my own window][own item queue]
function battleClassSnapshot(board) {            // cell classes 0 empty / 1 normal / 2 special, row-major with row 0 = bottom
  const b = new Uint8Array(BOARD_H * BOARD_W);
  for (let r = 0; r < BOARD_H; r++) for (let c = 0; c < BOARD_W; c++) { const v = board[r][c]; b[r * BOARD_W + c] = v === 0 || v >= 256 ? 0 : (ITEM_DESC[v & 255] ? 2 : 1); }
  return b;
}
function battleViewFeat(board, piece, qn) {      // board: Uint8Array classes; piece: [[row, col, class], ...]
  const out = new Float32Array(32), hgt = new Array(BOARD_W).fill(0), layer = new Array(10).fill(0);
  let maxh = 0, holes = 0, nn = 0, ns = 0;
  for (let c = 0; c < BOARD_W; c++) {
    let top = -1, occ = 0;
    for (let r = 0; r < BOARD_H; r++) { const v = board[r * BOARD_W + c]; if (v) { top = r; occ++; if (v === 2) ns++; else nn++; if (r < 10) layer[r]++; } }
    hgt[c] = top + 1; if (top + 1 > maxh) maxh = top + 1; holes += top + 1 - occ;
  }
  let sh = 0; for (let c = 0; c < BOARD_W; c++) sh += hgt[c];
  out[0] = maxh / 20; out[1] = sh / BOARD_W / 20; out[2] = holes / 20; out[3] = nn / 100; out[4] = ns / 20; out[5] = qn / 10;
  for (let c = 0; c < BOARD_W; c++) out[6 + Math.min(Math.floor(hgt[c] / 2), 9)] += 1 / BOARD_W;
  let sr = 0, sc = 0; const np = piece.length;
  for (const [r, c] of piece) { sr += r; sc += c; }
  if (np) { out[17] = sc / np / (BOARD_W - 1); out[18] = sr / np / (BOARD_H - 1); out[21] = np / 20; }
  for (let z = 0; z < 10; z++) out[22 + z] = layer[z] / BOARD_W;
  return out;
}
function battleQFeat(slots) {
  const NT = PolyAI.NT, QPOS = 4, out = new Float32Array(1 + (QPOS + 1) * NT); out[0] = slots.length / 10;
  for (let k = 0; k < slots.length && k < QPOS; k++) { const t = PolyAI.typeIndex(slots[k]); if (t !== undefined) out[1 + k * NT + t] = 1; }
  for (const code of slots) { const t = PolyAI.typeIndex(code); if (t !== undefined) out[1 + QPOS * NT + t] += 0.5; }
  return out;
}
function battleBState(oppSnap, oppQn) {
  const blind = state.blindboard > now(), board = (blind && ai.belief) ? ai.belief : state.board;
  const obs = { blind: blind ? 1 : 0, blindRemain: 0, hideNext: state.hidenext > 0 ? 1 : 0 };
  const P = aiPost(0, state.nowblock.cells.length, obs); P.board = board; P.boom = 0; P.garb = 0;
  const f = PolyAI.features(P).f;
  const mine = battleClassSnapshot(board), piece = state.nowblock.cells.map((cl) => [state.blockpos[0] + cl[0], state.blockpos[1] + cl[1]]);
  const oppPiece = oppSnap.piece.map((p) => [p[0], p[1]]);
  const x = new Float32Array(f.length + 64 + 1 + 5 * PolyAI.NT);
  x.set(f, 0); x.set(battleViewFeat(oppSnap.board, oppPiece, oppQn), f.length); x.set(battleViewFeat(mine, piece, PolyBattle.slots.length), f.length + 32); x.set(battleQFeat(PolyBattle.slots), f.length + 64);
  return x;
}
let _nSeen = 0, _newT = 0;
// actions: 0 wait; 2k+1 / 2k+2 = take item k of the first 4 (touch the slots k times, then use the front item) and use it on me / throw it at the opponent
function aiBattleUse() {
  const os = PolyBattle.oppState && PolyBattle.oppState();
  const tn = performance.now();               // like a person, it lets a new item sit in its slot for a moment before using anything
  if (PolyBattle.slots.length > _nSeen) _newT = tn;
  _nSeen = PolyBattle.slots.length;
  if (!PolyBattle.slots.length) return;
  if (tn - _newT < 1500) return;
  if (!PolyAI.hasBattle() || !os) { PolyBattle.aiUseSlots(); _nSeen = PolyBattle.slots.length; return; }       // no battle network: the solo one + the old rule
  const x = battleBState(os.snap, os.qn), slots = PolyBattle.slots, NFf = x.length - 64 - (1 + 5 * PolyAI.NT);
  const ctx = new Float32Array(32 + 1 + 5 * PolyAI.NT); ctx.set(x.subarray(NFf, NFf + 32), 0); ctx.set(x.subarray(NFf + 64), 32);
  const q = PolyAI.itemAdv(x.subarray(0, NFf), ai.h, ctx);
  let best = 0;
  for (let a2 = 1; a2 < q.length; a2++) {
    const k = (a2 - 1) >> 1, tg = 1 + ((a2 - 1) & 1);
    if (k >= slots.length || k >= 4) continue;
    if (PolyBattle.forbidden && PolyBattle.forbidden(slots[k]) === tg) continue;     // clearly helpful items are never given away, clearly harmful ones never used on myself
    if (q[a2] > q[best]) best = a2;
  }
  if (best > 0) { PolyBattle.useAt((best - 1) >> 1, ((best - 1) & 1) ? 'opponent' : 'self'); _nSeen = PolyBattle.slots.length; }
}
// the plans are valued knowing what the opponent window shows and which items I hold (after the item decision)
function aiBattleCtx() {
  const os = PolyBattle.oppState && PolyBattle.oppState();
  if (!PolyAI.hasBattle() || !os) { PolyAI.setCtx(null); return; }
  const ctx = new Float32Array(32 + 1 + 5 * PolyAI.NT);
  ctx.set(battleViewFeat(os.snap.board, os.snap.piece.map((p) => [p[0], p[1]]), os.qn), 0); ctx.set(battleQFeat(PolyBattle.slots), 32);
  PolyAI.setCtx(ctx);
}

function* aiEnumerateG(withFeatures) {
  const hook = window.__rngHook, rng0 = hook ? hook.get() : null;
  const tNow = now();
  const blind = state.blindboard > tNow;
  const obs = { blind: blind ? 1 : 0, blindRemain: blind ? Math.min(1, (state.blindboard - tNow) / 20000) : 0, hideNext: state.hidenext > 0 ? 1 : 0 };
  if (!blind) ai.beliefValid = false;
  else if (!ai.beliefValid) { ai.belief = clone2d(state.board); ai.beliefValid = true; }
  let root = aiSave();
  if (blind) root.board = clone2d(ai.belief); // the remembered board, not the true one
  // the game keeps running while the AI thinks: plan for the state about `shift` ms from now (0 in the test harness)
  let tPlan = tNow;
  const shift = (_vnow === null && !window.__rngHook) ? Math.round(ai.thinkEst || 0) : 0;
  if (shift > 0) {
    aiLoad(root);
    const c = { f: tNow, lastAct: tNow - AI_GAP, lines: 0 };
    let over = false;
    for (;;) { const r = aiAdvance(c, tNow + shift); if (r === 2) { over = true; break; } if (r === 0) break; }
    if (!over) { root = aiSave(); tPlan = tNow + shift; }
    _vnow = null;
  }
  const rootC = aiCounters(root.board);
  let seed = hook ? ((rng0 ^ AI_TRIAL_MASK) >>> 0) : 0;
  // NEXT is hidden (human view): the simulation must not use the real next piece, plan against a random piece of the game's distribution
  if (obs.hideNext) { aiLoad(root); if (hook) hook.set(seed); root.next = clonePiece(generateBlock()); if (hook) seed = hook.get(); }
  const cands = yield* aiEnumerateCoreG(root, tPlan, rootC, obs, blind, withFeatures, seed);
  if (hook) hook.set(rng0);
  ai.ctx = { root: root, tNow: tPlan };
  return cands;
}

// 2-ply search helper: play candidate `p` on to the next decision with the exact rules and enumerate the follow-up plans there.
// Returns the child candidates (with features), or [] when the game is already over.
function* aiChildrenG(p) {
  const ctx = ai.ctx, hook = window.__rngHook, rng0 = hook ? hook.get() : null;
  aiLoad(ctx.root);
  if (hook) hook.set((rng0 ^ AI_TRIAL_MASK) >>> 0);
  const c = { f: ctx.tNow, lastAct: ctx.tNow - AI_GAP, lines: 0 };
  const st = aiRunPlan(c, p.hold, p.rot, p.dcol);
  let out = [], over = st === P_DEAD;
  if (!over) {
    const td = c.lastAct + AI_GAP;        // the next moment the AI may act (passive gravity locks may happen before)
    for (;;) { const r = aiAdvance(c, td); if (r === 2) { over = true; break; } if (r === 0) break; }
    if (!over) {
      const tc = td, croot = aiSave();
      const blind = state.blindboard > tc;
      const obs = { blind: blind ? 1 : 0, blindRemain: blind ? Math.min(1, (state.blindboard - tc) / 20000) : 0, hideNext: state.hidenext > 0 ? 1 : 0 };
      let seed = hook ? ((hook.get() ^ AI_TRIAL_MASK) >>> 0) : 0;
      if (obs.hideNext) { if (hook) hook.set(seed); croot.next = clonePiece(generateBlock()); if (hook) seed = hook.get(); }   // NEXT hidden here too
      out = yield* aiEnumerateCoreG(croot, tc, aiCounters(croot.board), obs, blind, true, seed);
    }
  }
  _vnow = null;
  if (hook) hook.set(rng0);
  return over ? [] : out;
}

const AI_SEARCH_K = 5;   // 2-ply search over the K best candidates (0 = greedy); lowered automatically when thinking gets slow
function aiSearchK() { const e = ai.thinkEst || 0; return e > 300 ? 0 : (e > 160 ? 3 : AI_SEARCH_K); }
function* aiChooseG(cands) {
  if (window.__aiForcePick) { aiLoad(ai.realCur); _vnow = null; return PolyAI.pick(cands, ai.h); }   // (identity restored by the slice driver afterwards)   // test hook: the harness chooses the candidate (and reads the real state)
  const q1 = PolyAI.qValues(cands, ai.h);
  const order = [];
  for (let i = 0; i < cands.length; i++) if (q1[i] > -1e8 && !cands[i].dead) order.push(i);
  order.sort((x, y) => q1[y] - q1[x]);
  const K = aiSearchK();
  if (K <= 0 || order.length < 2) return PolyAI.pick(cands, ai.h);
  // Q2(parent) = r(parent) + gamma * max over follow-ups [ r + gamma * V ], follow-ups enumerated with the exact game rules
  let best = null, bestQ = -Infinity;
  for (const i of order.slice(0, K)) {
    const p = cands[i];
    const hp = PolyAI.hiddenStep(ai.h, p.sum);            // memory after the parent's own events
    const ch = yield* aiChildrenG(p);
    let bestChild = PolyAI.DEATH_R;
    if (ch.length) { const qc = PolyAI.qValues(ch, hp); for (const q of qc) if (q > bestChild) bestChild = q; }
    const q2 = PolyAI.rewardOf(p) + PolyAI.GAMMA * bestChild;
    if (q2 > bestQ) { bestQ = q2; best = p; }
    if (aiSliceExpired()) yield;
  }
  return best || PolyAI.pick(cands, ai.h);
}

function* aiPlanG() {
  const plan = [];
  if (!window.PolyAI || !PolyAI.isLoaded()) { plan.push('D'); return plan; }
  const cands = yield* aiEnumerateG(true);
  const best = yield* aiChooseG(cands);
  if (!best) { plan.push('D'); return plan; }
  ai.belief = clone2d(best.postBoard); ai.beliefValid = true; // what the AI expects the board to look like afterwards
  if (best.hold) plan.push('H');
  for (let i = 0; i < best.rot; i++) plan.push('R');
  for (let i = 0; i < Math.abs(best.dcol); i++) plan.push(best.dcol < 0 ? 'L' : 'X');
  plan.push('D');
  return plan;
}

// run a few ms of a planning generator; the real game state is saved before and restored after (the what-if trials use copies)
function aiRunSlice(gen, budgetMs) {
  const cur = aiSave();
  const keep = { now: state.nowblock, next: state.nextblock, hold: state.holdblock };   // the game and the AI compare piece objects (identity)
  ai.realCur = cur;
  ai.sliceEnd = performance.now() + budgetMs;
  if (window.__aiSliceReset) window.__aiSliceReset();   // test hook
  let r;
  try { do { r = gen.next(); } while (!r.done && !aiSliceExpired()); }
  finally {
    _vnow = null; aiLoad(cur);
    // put the original piece objects back (same content), so "was the piece replaced?" keeps meaning what it means in the game
    for (const [name, obj] of [['nowblock', keep.now], ['nextblock', keep.next], ['holdblock', keep.hold]]) {
      if (obj && state[name]) { obj.cells = state[name].cells; obj.vals = state[name].vals; state[name] = obj; }
    }
  }
  return r;
}
// synchronous planning (tests, tools): no slicing
function aiMakePlan() {
  aiBeginDecision();
  const r = aiRunSlice(aiPlanG(), Infinity);
  return r.value;
}

// The AI presses the same keys a player does (through the keyboard handler), then checks whether it had an effect.
const AI_KEYS = { H: 'ShiftLeft', R: 'KeyZ', L: 'ArrowLeft', X: 'ArrowRight', D: 'Enter' };
function aiPressKey(act) {
  const piece = state.nowblock, c0 = state.blockpos[1], cell0 = piece.cells[0];
  _execKey(AI_KEYS[act]);
  if (act === 'D') return true;
  if (state.nowblock !== piece) return act !== 'R';       // hold swapped / piece replaced
  // a successful rotation rebuilds the cell arrays (even when the shape looks identical, e.g. the square)
  if (act === 'R') return piece.cells[0] !== cell0;
  return state.blockpos[1] !== c0;                         // L / X: moved sideways?
}
// returns true when the action succeeded
function aiExec(act) { return aiPressKey(act); }

function aiTick() {
  if (!ai.on || !state.ready) return;
  if (state.startscreen || state.goverflg) {
    if (!ai.autoRestart) { aiStop(); return; }          // auto-solve ends with the game
    if (state.startscreen) { state.startscreen = 0; return; }
    const t0 = now();
    if (!ai.overAt) ai.overAt = t0;
    if (t0 - ai.overAt > 1200) { state.goverflg = 0; ai.overAt = 0; ai.plan = null; ai.beliefValid = false; ai.h = null; ai.snap = null; ai.gen = null; }
    return;
  }
  if (state.pause) return;
  const t = now();
  ai.overAt = 0;
  if (t - ai.lastAct < AI_GAP) return; // one input per 200 ms
  if (ai.gen || ai.piece !== state.nowblock || !ai.plan) {
    // (re)plan; the work is spread over several frames, the game keeps running (and the piece keeps falling) in the meantime
    if (!ai.gen) { aiBeginDecision(); ai.gen = aiPlanG(); ai.planFor = state.nowblock; ai.planT0 = performance.now(); }
    const r = aiRunSlice(ai.gen, 6);
    if (!r.done) return;
    ai.gen = null;
    const dt = performance.now() - ai.planT0;
    ai.thinkEst = Math.min(400, 0.6 * (ai.thinkEst || 0) + 0.4 * dt);
    if (state.nowblock !== ai.planFor || state.startscreen || state.goverflg) { ai.plan = null; return; }   // the piece was replaced meanwhile
    ai.plan = r.value; ai.piece = state.nowblock;
  }
  const act = ai.plan.shift();
  const ok = aiExec(act);
  ai.lastAct = now();   // the next input comes 200 ms after this one
  if (act === 'D') { ai.plan = null; ai.pieces++; }
  else if (!ok && (act === 'H' || !(state.blindboard > now()))) ai.plan = null; // deviated (blocked move, replaced piece...): replan at the next input slot;
  // while the board is hidden a blocked rotation/move is invisible to a human, so it is not noticed either (the hold slot stays visible)
  else if (act === 'H') ai.piece = state.nowblock;
  else if (!ai.plan.length) ai.plan = null;
}

function aiIsRunning() { return !!state.ready && !state.startscreen && !state.goverflg; }

function aiUpdateHud() {
  if (hud) hud.textContent = ai.on ? 'AI  (1 input / 0.2s)  [A / F3] off' : (ai.loading ? 'AI model loading...' : '');
  const b = document.getElementById('aibtn');
  if (b) { b.classList.toggle('on', ai.on); b.textContent = ai.on ? 'AI ON' : 'AI'; }
  if (window.PolyAutoSolve) window.PolyAutoSolve.notify();
}

function aiStop() {
  ai.on = false; ai.plan = null; ai.piece = null; ai.overAt = 0; ai.beliefValid = false; ai.loading = false; ai.h = null; ai.snap = null; ai.gen = null;
  aiUpdateHud();
}

// the model file is large: fetch it the first time auto-solve is used
function aiEnsureModel(cb) {
  if (window.PolyAI && PolyAI.isLoaded()) { cb(true); return; }
  // battle mode: the battle network (placement + items in one); normal mode (or no battle file): the solo network
  let url = BATTLE ? './web/ai-battle.js' : './web/ai-model.js', vr = BATTLE ? 'POLY_AI_BATTLE_2D' : 'POLY_AI_MODEL';
  const done = () => {
    try { PolyAI.load(window[vr]); } catch (e) { if (hud) hud.textContent = 'AI model load failed: ' + e.message; cb(false); return; }
    cb(true);
  };
  const fetchScript = (u, ok, err) => { const sc = document.createElement('script'); sc.src = u; sc.onload = ok; sc.onerror = err; document.head.appendChild(sc); };
  if (window[vr]) { done(); return; }
  fetchScript(url, done, () => {
    if (BATTLE) { url = './web/ai-model.js'; vr = 'POLY_AI_MODEL'; if (window[vr]) { done(); return; } fetchScript(url, done, () => { if (hud) hud.textContent = 'AI model missing (web/ai-model.js)'; cb(false); }); return; }   // (no battle network file: the solo one + the old item rule)
    if (hud) hud.textContent = 'AI model missing (web/ai-model.js)'; cb(false);
  });
}

function aiStart() {
  if (ai.on || ai.loading || !aiIsRunning() || !window.PolyAI) return;
  ai.loading = true; aiUpdateHud();
  aiEnsureModel((ok) => {
    ai.loading = false;
    if (!ok || !aiIsRunning()) { aiUpdateHud(); return; }   // no model, or the game ended while loading
    ai.on = true; ai.plan = null; ai.piece = null; ai.overAt = 0; ai.beliefValid = false; ai.lastAct = now(); ai.h = null; ai.snap = null; ai.gen = null;
    state.vkspace2 = false;
    aiUpdateHud();
  });
}
function aiToggle() { if (ai.on) aiStop(); else aiStart(); }

window.PolyAIControl = { toggle: aiToggle, start: aiStart, stop: aiStop, isOn: () => ai.on };
// shell integration (Cheat > Solve Automatically): see ../autosolve-bridge.js
if (window.PolyAutoSolve) {
  window.PolyAutoSolve.register({ dim: 2, isRunning: aiIsRunning, isSolving: () => ai.on || ai.loading, start: aiStart, stop: aiStop });
}
window.addEventListener('keydown', (e) => {
  if ((e.code === 'KeyA' && !e.repeat) || (e.code === 'F3' && !e.repeat)) { if (e.code === 'F3') e.preventDefault(); aiToggle(); }
});
// test/debug hook (not used by the game itself)

// ---- battle mode: use a stored item on the own board ----
// Location-dependent items need a cell: the tallest column / the top row of the stack are used (the item was not picked up at a spot).
// Items whose effect depends on a centre (range / row / top delete) cannot use the spot where they were eaten, because battle-mode items are used later.
// Their centre is the centre of a block: the block that is falling when the item is used (or, if none is falling, the next one), rounded to
// whole cells and kept on the board. The effect happens when that block has locked.
const BATTLE_POS = { 118: 1, 126: 1, 102: 1 };
const _bq = [];      // codes of position items (row / column / top delete) that wait for a single cell of their own
function battleMonoPiece() { return { cells: [[0, 0]], vals: [12], _mono: 0 }; }       // the yellow single cell of the mono-only item (a plain block: never special)
function battleApplyStored(code) {
  if (state.goverflg || state.startscreen) return;
  if (BATTLE_POS[code]) {              // the NEXT block to fall is a single cell (shown in the preview); the item acts at its centre when it has locked
    if (!state.nextblock._mono) { state.nextblock = battleMonoPiece(); state.nextblock._mono = code; state.nexthb = 0; } else _bq.push(code);
    return;
  }
  const acc = { tline: 0 }, keep = state.board[0][0];
  const res = applyItemCell(code, 0, 0, acc, state.reinforce > 0);
  if (res !== 'reset' && state.board[0][0] === 256 && keep < 256 && ![5, 18, 19, 119, 200].includes(code)) state.board[0][0] = keep;   // the used item is not a cell of the board
  settleBoard(res === 'reset' ? 0 : acc.tline);
  if (state._ovf) overflowDie();
}
function battleLocked() {                       // called when a block has just been put on the board
  const code = state.nowblock._mono || 0;
  if (!code) return;
  state.nowblock._mono = 0;
  let sr = 0, sc = 0, n = state.nowblock.cells.length;
  for (const [r, c] of state.nowblock.cells) { sr += state.blockpos[0] + r; sc += state.blockpos[1] + c; }
  const row = Math.min(BOARD_H - 1, Math.max(0, Math.round(sr / n))), col = Math.min(BOARD_W - 1, Math.max(0, Math.round(sc / n)));   // the centre, rounded, kept on the board
  window.__btCenter = [row, col];   // (for tests)
  const acc = { tline: 0 };
  const res = applyItemCell(code, row, col, acc, state.reinforce > 0);
  settleBoard(res === 'reset' ? 0 : acc.tline);
}
// a small row of slots right above the special-block description line (see drawItemInfo)
// battle mode (while a game is running, own window): the part above the control buttons is drawn at 2/3 size, the opponent column takes the left third
function battleBtnTop() { const b = getButtonLayout(); let t = state.canvasH; for (const x of b) t = Math.min(t, x.y); return t; }
function battleXform() {
  const B = window.PolyBattle; if (!BATTLE || window.__btOpp || !B || !B.split) return null;
  const xf = B.xf || { s: 2 / 3, ox: state.canvasW / 3 }, yb = battleBtnTop();      // (scale and left edge: set by battle.js from the room the opponent window leaves)
  return { s: xf.s, ox: xf.ox, oy: yb * (1 - xf.s) / 2 };
}
const BT_HUD_DX = 0.04;                 // battle mode: the score panel sits this much (x canvas width) closer to the block area
function battleExtent() { return [Math.min(battleSlotRectN()[0], state.boardX), state.canvasW * (0.94 - BT_HUD_DX)]; }   // the horizontal extent of everything above the buttons
function battleTr(r) { const X = battleXform(); return X ? [X.ox + X.s * r[0], X.oy + X.s * r[1], X.s * r[2], X.s * r[3]] : r; }
function battleSlotRect() { return battleTr(battleSlotRectN()); }
function battleSlotRectN() {
  const boardBottom = state.boardY + state.cellSize * BOARD_H;
  const btnSize = Math.min(state.canvasW * 0.13, state.canvasH * 0.08);
  const gapH = state.canvasH * 0.82 - btnSize - btnSize * 0.1 - boardBottom;
  const textY = boardBottom + gapH * 0.5, blockSize = Math.min(gapH * 0.65, state.cellSize * 0.9), s = state.cellSize;
  const left = state.canvasW * 0.18 - btnSize / 2;                                  // the left end of the box = the left line of the rotation buttons (see getButtonLayout)
  const W = 2 * (state.boardX + state.cellSize * BOARD_W / 2 - left), H = (W - 3) / 10 + 3;     // the centre of the box = the centre of the board; exactly 10 square cells fit inside
  return [left, textY - blockSize / 2 - H - 3, W, H];
}
// the item block images of the stored items (no border, no slot boxes: packed from the left)
function battleDrawSlots() {
  const B = window.PolyBattle; if (!B || !B.slots) return;
  const X = battleXform(), inv = X ? 1 / X.s : 1, r = battleSlotRectN(), sz = (r[2] - 3 * inv) / B.SLOTS;   // (the border is 1.5 screen pixels wide whatever the scale)
  ctx.save(); ctx.strokeStyle = '#9ab'; ctx.lineWidth = 1.5 * inv; ctx.strokeRect(r[0] + 0.75 * inv, r[1] + 0.75 * inv, r[2] - 1.5 * inv, r[3] - 1.5 * inv); ctx.restore();   // the box around the 1x10 area (edge only)
  for (let i = 0; i < B.slots.length; i++) drawCell(r[0] + 1.5 * inv + i * sz + sz * 0.08, r[1] + 1.5 * inv + sz * 0.08, sz * 0.84, sz * 0.84, B.slots[i]);   // packed from the left
}
// ---- battle mode: the opponent is rendered HERE from a sanitised state (nothing is copied from the other page) ----
// every cell is only empty (0) / normal block (1) / special block (2): the type of a special block cannot be told
function battleSnapshot() {
  const cls = (v) => (v === 0 || v >= 256) ? 0 : (ITEM_DESC[v & 255] ? 2 : 1);
  const board = new Uint8Array(BOARD_H * BOARD_W);
  for (let r = 0; r < BOARD_H; r++) for (let c = 0; c < BOARD_W; c++) board[r * BOARD_W + c] = cls(state.board[r][c]);
  const piece = [];
  if (state.nowblock && state.nowblock.cells) for (let i = 0; i < state.nowblock.cells.length; i++) {
    const [r, c] = state.nowblock.cells[i]; piece.push([state.blockpos[0] + r, state.blockpos[1] + c, cls(state.nowblock.vals[i])]);
  }
  return { board, piece, blind: state.blindboard > now() };       // (blind: the board is hidden from this player: its window is hidden for the opponent too)
}
function battleMakeOpp(areaEl, slotEl) {
  const cv = document.createElement('canvas'), sc = document.createElement('canvas');
  areaEl.appendChild(cv); slotEl.appendChild(sc);
  const c1 = cv.getContext('2d'), c2 = sc.getContext('2d');
  const FILL = ['', '#6e6e6e', '#a4a4a4'], EDGE = ['', '#555555', '#7e7e7e'];      // all normal blocks one grey, special blocks a slightly lighter grey
  const fit = (c) => { const w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } };
  const cell = (g, x, y, s, k) => { const b = Math.max(1, s * 0.08); g.fillStyle = EDGE[k]; g.fillRect(x, y, s, s); g.fillStyle = FILL[k]; g.fillRect(x + b, y + b, s - 2 * b, s - 2 * b); };
  return {
    draw(snap, codes) {
      fit(cv); fit(sc);
      const cw = cv.width, cs = cw / BOARD_W, oy = cv.height - cs * BOARD_H;
      c1.fillStyle = '#0a0a12'; c1.fillRect(0, 0, cw, cv.height);
      c1.strokeStyle = '#1a1a2a'; c1.lineWidth = 1; c1.beginPath();
      for (let r = 0; r <= BOARD_H; r++) { const y = oy + r * cs; c1.moveTo(0, y); c1.lineTo(cw, y); }
      for (let c = 0; c <= BOARD_W; c++) { c1.moveTo(c * cs, oy); c1.lineTo(c * cs, cv.height); }
      c1.stroke();
      if (!snap.blind) for (let r = 0; r < BOARD_H; r++) for (let c = 0; c < BOARD_W; c++) { const k = snap.board[r * BOARD_W + c]; if (k) cell(c1, c * cs, oy + (BOARD_H - 1 - r) * cs, cs, k); }
      if (!snap.blind) for (const [r, c, k] of snap.piece) if (r >= 0 && r < BOARD_H && c >= 0 && c < BOARD_W && k) cell(c1, c * cs, oy + (BOARD_H - 1 - r) * cs, cs, k);
      c1.strokeStyle = '#445'; c1.strokeRect(0.5, oy + 0.5, cw - 1, cs * BOARD_H - 1);
      // the opponent's stored items: real colours, packed from the left, 1 x 10 square cells
      c2.fillStyle = '#05050e'; c2.fillRect(0, 0, sc.width, sc.height);
      const sz = sc.width / 10;
      _dc = c2;
      for (let i = 0; i < codes.length && i < 10; i++) drawCell(i * sz + sz * 0.08, sz * 0.08, sz * 0.84, sz * 0.84, codes[i]);
      _dc = ctx;
    },
    icon(code, sprite) {
      const g = sprite.getContext('2d'); g.clearRect(0, 0, sprite.width, sprite.height);
      _dc = g; drawCell(4, 4, sprite.width - 8, sprite.height - 8, code); _dc = ctx;
    }
  };
}
function battleBoardRect() { return battleTr([state.boardX, state.boardY, state.cellSize * BOARD_W, state.cellSize * BOARD_H]); }
if (BATTLE) PolyBattle.attach({ itemDesc: (c) => ITEM_DESC[c], applyStored: battleApplyStored,
  isReady: () => !!state.ready, autostart: () => { state.startscreen = 0; },
  isPlaying: () => !!state.ready && !state.startscreen && !state.goverflg,
  stats: () => ({ score: state.goverflg ? state.oscore : state.score, lines: state.lines, level: state.level, over: state.goverflg }),
  pieceInfo: () => ({ pos: state.blockpos.slice(), cells: state.nowblock ? state.nowblock.cells.map((c) => [c[0], c[1]]) : [] }),
  boardRect: battleBoardRect, boardRectN: () => [state.boardX, state.boardY, state.cellSize * BOARD_W, state.cellSize * BOARD_H], extent: battleExtent, snapshot: battleSnapshot, makeOppRenderer: battleMakeOpp,
  background: () => ({ url: EMBEDDED_TEXTURES[1] || './assets/texture1.bmp', dim: '5,5,16,0.7' }), slotRect: battleSlotRect, btnTop: battleBtnTop, restart: () => { state.goverflg = 0; },
  forceOver: () => { if (state.ready && !state.startscreen && !state.goverflg) { gover(); initBlockState(); } },   // the other side died: this game ends too
  overLayout: () => ({ resY: 0.085, msgY: 0.66, mask: [0.612, 0.788] }) });
window.__poly = { battleBState: (typeof battleBState === 'function' ? battleBState : null), gover: () => gover(), state, ai, logicFrame: () => logicFrame(), init: () => initBlockState(), aiEnumerate: (f) => { aiBeginDecision(); return aiRunSlice(aiEnumerateG(f), Infinity).value; }, aiChildren: (p) => aiRunSlice(aiChildrenG(p), Infinity).value, aiExec, aiMakePlan, aiToggle, aiPressKey,
  setItems: (v) => { itemsEnabled = v; } };

function logicFrame() {
  handleTouches();
  aiTick();
  if (state.ready && !state.startscreen && !state.pause && !state.goverflg) {
    updateFallingLogic();
  }
}

function drawFrame() {
  if (window.__frameLog) { const t = performance.now(); if (window.__lastFrameT) window.__frameLog.push(t - window.__lastFrameT); window.__lastFrameT = t; }
  logicFrame();

  if (state.startscreen === 1) drawStartScreen();
  else if (state.goverflg === 1) drawGameOverScreen();
  else if (state.pause) drawPauseScreen();
  else drawScene();

  window.__polynominoAbout = state.startscreen === 1 ? state.about : -1;
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
