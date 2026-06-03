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
  if (code === "Space") {
    // Hard drop: move down until stuck, then lock (continue through cancels)
    let mr;
    while ((mr = moveDown()) !== 1) { if (state.nowblock.cells.length === 0) break; }
    if (state.nowblock.cells.length === 0) {
      setnextblock();
      state.timestamp = now();
      return;
    }
    if (stickblock()) {
      gover();
      initBlockState();
      return;
    }
    calculatescore(removeline());
    state.timestamp = now();
    return;
  }
  if (code === "ShiftRight") { state.vkspace2 = true; return; }
  if (code === "ArrowLeft") { move(-1); return; }
  if (code === "ArrowRight") { move(1); return; }
  if (code === "ArrowUp" || code === "KeyZ") { rotate(1); return; }
  if (code === "KeyX") { rotate(-1); return; }
  if (code === "ArrowDown") { rotate(-1); return; }
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
  if (code === "ShiftRight") state.vkspace2 = false;
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
    case 0:  b1=25; b2=50;  b3=50;  b4=100; b5=100; break;
    case 1:  b1=5;  b2=15;  b3=30;  b4=100; b5=100; break;
    case 2:  b1=3;  b2=10;  b3=20;  b4=98;  b5=100; break;
    case 3:  b1=2;  b2=5;   b3=15;  b4=95;  b5=100; break;
    case 4:  b1=2;  b2=4;   b3=17;  b4=93;  b5=99;  break;
    case 5:  b1=2;  b2=4;   b3=16;  b4=90;  b5=99;  break;
    case 6:  b1=1;  b2=3;   b3=16;  b4=88;  b5=99;  break;
    case 7:  b1=1;  b2=3;   b3=15;  b4=86;  b5=98;  break;
    case 8:  b1=1;  b2=3;   b3=15;  b4=84;  b5=98;  break;
    case 9:  b1=1;  b2=3;   b3=15;  b4=82;  b5=98;  break;
    case 10: b1=1;  b2=3;   b3=14;  b4=81;  b5=97;  break;
    case 11: b1=1;  b2=3;   b3=14;  b4=80;  b5=97;  break;
    case 12: b1=1;  b2=3;   b3=14;  b4=79;  b5=97;  break;
    case 13: b1=1;  b2=3;   b3=14;  b4=78;  b5=96;  break;
    case 14: b1=1;  b2=3;   b3=14;  b4=78;  b5=96;  break;
    case 15: b1=1;  b2=3;   b3=14;  b4=77;  b5=96;  break;
    case 16: b1=1;  b2=3;   b3=14;  b4=76;  b5=96;  break;
    default: b1=1;  b2=3;   b3=14;  b4=75;  b5=95;  break;
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
  if (u < 5620) return 126;
  if (u < 5920) return 127;
  if (u < 6020) return 17;
  if (u < 6220) return 20;
  if (u < 7020) return 21;
  if (u < 7820) return 22;
  if (u < 8070) return 16;
  if (u < 8270) return 11;
  if (u < 8670) return baseVal;
  if (u < 8920) return 2;
  if (u < 9920) return 8;
  if (u < 10920) return 9;
  if (u < 11170) return 10;
  if (u < 12170) return 5;
  if (u < 12420) return 6;
  if (u < 14670) return 120;
  if (u < 24670) return 4;
  if (u < 24970) return 200; // mirror 0.03%
  if (u < 25270) return 19; // zigzag 0.03%
  if (u < 25570) return 18; // hole 0.03%
  if (state._assignIsMonoBlock && randInt(10) === 0) return 1;
  if (state._assignIsMonoBlock && randInt(20) === 0) {
    state.nexthb = 1;
    return 30;
  }
  if (state._assignIsMonoBlock && randInt(10) === 1) return 1;
  if (state._assignIsMonoBlock && randInt(5) < 2) {
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
  if (state.simplify2 > 0 && piece.cells.length >= 2 && piece.cells.length <= 3 && randInt(10) < 4) {
    piece.vals = piece.vals.map(() => 31);
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
  };
}

// ====== GAME LOGIC ======

function initBlockState() {
  loadHighScore();
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
  // Start with random special item in hold (monomino)
  let _hv = 4;
  if (itemsEnabled) {
    if (randInt(10) === 0) { _hv = [1,30,31][randInt(3)]; }
    else { const _u = randInt(250000); if(_u<100)_hv=116;else if(_u<400)_hv=117;else if(_u<700)_hv=118;else if(_u<720)_hv=119;else if(_u<1520)_hv=104;else if(_u<2020)_hv=120;else if(_u<3020)_hv=121;else if(_u<3720)_hv=122;else if(_u<4020)_hv=123;else if(_u<4070)_hv=124;else if(_u<4870)_hv=125;else if(_u<5120)_hv=91;else if(_u<5220)_hv=102;else if(_u<5620)_hv=126;else if(_u<5920)_hv=127;else if(_u<6020)_hv=17;else if(_u<6220)_hv=20;else if(_u<7020)_hv=21;else if(_u<7820)_hv=22;else if(_u<8070)_hv=16;else if(_u<8270)_hv=11;else if(_u<8920)_hv=2;else if(_u<9920)_hv=8;else if(_u<10920)_hv=9;else if(_u<11170)_hv=10;else if(_u<12170)_hv=5;else if(_u<12420)_hv=6;else if(_u<14670)_hv=120;else if(_u<24970)_hv=200;else if(_u<25270)_hv=19;else if(_u<25570)_hv=18; }
  } else { _hv = 65; }
  state.holdblock = { cells: [[0, 0]], vals: [_hv] };
  state.nextblock = generateBlock();
  setnextblock();
}

function setnextblock() {
  state.asc = 0;
  state.nowblock = state.nextblock;
  state.nowhb = state.nexthb;
  state.nowib = state.nextib;
  state.nexthb = 0;
  state.nextib = 0;
  applySpecialAging();
  state.nextblock = generateBlock();

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
  if (state.nowhb === 0 && state.nowib === 0) {
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
  if (!checkCollision(state.nowblock, state.blockpos[0], newCol)) {
    state.blockpos[1] = newCol;
    return 0;
  }
  return 1;
}

function moveDown() {
  const newRow = state.blockpos[0] - 1;
  let restart;

  // Pre-check: if ANY cell would hard-stop, lock entire block without cancellation
  if (state.nowhb === 0 && state.nowib === 0) {
    for (let i = 0; i < state.nowblock.cells.length; i++) {
      const [r, c] = state.nowblock.cells[i];
      const br = newRow + r;
      const bc = state.blockpos[1] + c;
      if (bc < 0 || bc >= BOARD_W || br < 0) return 1;
      if (br >= BOARD_H) continue;
      const cell = state.board[br][bc];
      const myVal = state.nowblock.vals[i];
      // cancel-vs-normal: not a hard stop (would cancel if moving)
      if ((cell === 31 && myVal !== 31) || (myVal === 31 && cell !== 0 && cell !== 31)) continue;
      // anything else non-empty: hard stop
      if (cell !== 0) return 1;
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
        if (state.nowhb) {
          // 상쇄 at bottom: compact columns, cancel adjacent 관통/normal pairs
          for (let cc = 0; cc < BOARD_W; cc++) {
            const col = [];
            for (let rr = 0; rr < BOARD_H; rr++) {
              if (state.board[rr][cc] !== 0) col.push(state.board[rr][cc]);
            }
            const result = [];
            for (let k = 0; k < col.length; k++) {
              result.push(col[k]);
              if (result.length >= 2) {
                const a = result[result.length - 1], b = result[result.length - 2];
                if ((a === 31 && b !== 0 && b !== 31) || (b === 31 && a !== 0 && a !== 31)) {
                  result.pop(); result.pop();
                }
              }
            }
            for (let rr = 0; rr < BOARD_H; rr++) {
              state.board[rr][cc] = rr < result.length ? result[rr] : 0;
            }
          }
          removeline();
        }
        return 1; // can't go below board
      }

      // Above board top - ok
      if (br >= BOARD_H) continue;

      const cell = state.board[br][bc];

      // Normal block (not 상쇄, not 관통)
      if (state.nowhb === 0 && state.nowib === 0) {
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
      // 관통 block hits normal
      else if (state.nowib === 1 && cell !== 31 && cell !== 0) {
        state.board[br][bc] = 0;
        state.score += 40;
        setnextblock();
        return 2; // block destroyed, next block spawned
      }
      // 관통 blocked by another 관통
      else if (state.nowib === 1 && cell === 31) {
        return 1;
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
        // Bomb explodes 3x3
        for (let r2 = r - 1; r2 <= r + 1; r2++) {
          for (let c2 = c - 1; c2 <= c + 1; c2++) {
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
    }
  }
  // 자폭: placed immediately triggers 3x3 destruction
  for (let i = 0; i < state.nowblock.cells.length; i++) {
    if ((state.nowblock.vals[i] & 255) === 1) {
      const br = state.blockpos[0] + state.nowblock.cells[i][0];
      const bc = state.blockpos[1] + state.nowblock.cells[i][1];
      for (let r2 = br - 1; r2 <= br + 1; r2++) {
        for (let c2 = bc - 1; c2 <= bc + 1; c2++) {
          if (r2 >= 0 && r2 < BOARD_H && c2 >= 0 && c2 < BOARD_W) {
            state.board[r2][c2] = 0;
          }
        }
      }
    }
  }
  return setnextblock();
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
    if ((state.board[row][c2] & 255) === 200) { _mirrorFlag = true; state.board[row][c2] = (state.board[row][c2] & 256); }
  }

  for (let c = 0; c < BOARD_W; c++) {
    const code = state.board[row][c] & 255;
    if (code === 116) { tline -= 2; state.board[row][c] = 256; }
    else if (code === 117) { tline += 2; state.board[row][c] = 256; }
    else if (code === 118) {
      // 범위삭제: x좌표 +-1열 삭제
      state.board[row][c] = 256;
      for (let c2 = c - 1; c2 <= c + 1; c2++) {
        if (c2 >= 0 && c2 < BOARD_W) {
          for (let r2 = 0; r2 < BOARD_H; r2++) state.board[r2][c2] |= 256;
        }
      }
    } else if (code === 119) {
      // All clear
      state.board = create2d(BOARD_W, BOARD_H);
      return { filled, tline: 0, hardReset: true };
    } else if (code === 104) { state.simplify2 = 0; state.pentaForce = 0; state.monoonly += 11; state.board[row][c] = 256; }
    else if (code === 124) { tline -= 3; state.board[row][c] = 256; }
    else if (code === 125) { tline += 1; state.board[row][c] = 256; }
    else if (code === 91) { state.spinlock += 10; state.board[row][c] = 256; }
    else if (code === 8) { state.speedup += 10; state.board[row][c] = 256; }
    else if (code === 9) { state.speeddown += 10; state.board[row][c] = 256; }
    else if (code === 10) { state.holdlock += 10; state.board[row][c] = 256; }
    else if (code === 16) { state.blindboard = now() + 10000; state.board[row][c] = 256; }
    else if (code === 17) { state.bombnext += 6; state.board[row][c] = 256; }
    else if (code === 20) { state.compactPending = true; state.board[row][c] = 256; }
    else if (code === 21) { state.monoonly = 0; state.pentaForce = 0; state.simplify2 += 16; state.board[row][c] = 256; }
    else if (code === 22) { state.monoonly = 0; state.simplify2 = 0; state.pentaForce += 9; state.board[row][c] = 256; }
    else if (code === 2) { state.hideblock += 10; state.board[row][c] = 256; }
    else if (code === 6) { state.hidenext += 10; state.board[row][c] = 256; }
    else if (code === 5) {
      // Erase items
      for (let r2 = 0; r2 < BOARD_H; r2++) {
        for (let c2 = 0; c2 < BOARD_W; c2++) {
          if (state.board[r2][c2] !== 0 && state.board[r2][c2] !== 256) {
            state.board[r2][c2] = 33 + (state.board[r2][c2] % 31);
          }
        }
      }
      state.board[row][c] = 256;
    } else if (code === 4) { state.score2x += 1; state.board[row][c] = 256; }
    else if (code === 11) {
      // 장애물: 랜덤 위치 장애물 3개
      state.board[row][c] = 256;
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
        if (count === 3) break;
      }
    } else if (code === 102) {
      // 상단삭제: clear above this row
      for (let r2 = row; r2 < BOARD_H; r2++) {
        for (let c2 = 0; c2 < BOARD_W; c2++) state.board[r2][c2] = 256;
      }
    } else if (code === 126) {
      // xz del -> in 2D, clear +-1 rows
      state.board[row][c] = 256;
      for (let r2 = row - 1; r2 <= row + 1; r2++) {
        if (r2 >= 0 && r2 < BOARD_H) {
          for (let c2 = 0; c2 < BOARD_W; c2++) state.board[r2][c2] |= 256;
        }
      }
    } else if (code === 105) {
      // 종렬삭제: clear +-1 columns
      state.board[row][c] = 256;
      for (let c2 = c - 1; c2 <= c + 1; c2++) {
        if (c2 >= 0 && c2 < BOARD_W) {
          for (let r2 = 0; r2 < BOARD_H; r2++) state.board[r2][c2] |= 256;
        }
      }
    } else if (code === 127) {
      // Bomb creator
      state.board[row][c] |= 256;
      for (let r2 = 0; r2 < BOARD_H; r2++) {
        for (let c2 = 0; c2 < BOARD_W; c2++) {
          if ((state.board[r2][c2] & 255) !== 0 && randInt(100) < 30) {
            state.board[r2][c2] = (state.board[r2][c2] & 256) + 120 + randInt(4);
          }
        }
      }
    } else if (code === 18) {
      // Hole: remove 30% of all blocks
      state.board[row][c] |= 256;
      for (let r2 = 0; r2 < BOARD_H; r2++) {
        for (let c2 = 0; c2 < BOARD_W; c2++) {
          if ((state.board[r2][c2] & 255) !== 0 && randInt(100) < 30) {
            state.board[r2][c2] = state.board[r2][c2] & 256;
          }
        }
      }
    } else if (code === 19) {
      // Zigzag: shuffle blocks within each row
      state.board[row][c] |= 256;
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
    } else {
      state.board[row][c] |= 256;
    }
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
  return { filled, tline };
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
    // Add garbage lines at bottom
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

  // 빈공간삭제: compact all columns (remove gaps), then count extra filled lines
  if (state.compactPending) {
    state.compactPending = false;
    for (let c = 0; c < BOARD_W; c++) {
      let t = 0;
      for (let r = 0; r < BOARD_H; r++) {
        if (state.board[r][c] !== 0) {
          state.board[t][c] = state.board[r][c];
          t++;
        }
      }
      for (; t < BOARD_H; t++) state.board[t][c] = 0;
    }
    // Count and remove filled lines (no score multiplier, just base 20 per line)
    let compactLines = 0;
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
      filledline += compactLines;
    }
  }

  if (filledline !== 0) filledline += removeline();
  return filledline;
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
    state.holdib = state.nowib;
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
  const tmpib = state.nowib;
  state.nowib = state.holdib;
  state.holdib = tmpib;
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
  // Hard drop button below (same height as hold)
  const hardDropBtn = { x: moveX - btnSize / 2, y: bottomY + gap / 2, w: btnSize, h: btnSize, action: 'hardDrop', label: '▼▼' };

  // Center: drop + hold (shifted left)
  const centerX = cw * 0.44;
  const dropBtn = { x: centerX - btnSize / 2, y: bottomY - btnSize - gap / 2, w: btnSize, h: btnSize, action: 'drop', label: 'DROP' };
  const holdBtn = { x: centerX - btnSize / 2, y: bottomY + gap / 2, w: btnSize, h: btnSize, action: 'hold', label: 'HOLD', color: '#cc4488' };

  // Pause button (top right)
  const pauseSize = btnSize * 0.9;
  const pauseBtn = { x: cw - pauseSize - 4 - pauseSize / 4, y: 4 + pauseSize / 4, w: pauseSize, h: pauseSize, action: 'pause', label: '||' };

  return [rotCWBtn, rotCCWBtn, moveLeftBtn, moveRightBtn, hardDropBtn, dropBtn, holdBtn, pauseBtn];
}

function hitTestButtons(px, py) {
  const buttons = getButtonLayout();
  for (const btn of buttons) {
    if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
      return btn.action;
    }
  }
  return null;
}

function clickbutton(px, py) {
  // Menu screens
  const cw = state.canvasW;
  const ch = state.canvasH;

  // Pause: any touch resumes
  if (state.pause) {
    state.pause = false;
    return 0;
  }

  if (state.goverflg === 1) {
    // Retry button
    if (py > ch * 0.62 && py < ch * 0.68 && px > cw * 0.3 && px < cw * 0.7) {
      state.goverflg = 0;
      return 0;
    }
    // Main button
    if (py > ch * 0.72 && py < ch * 0.78 && px > cw * 0.3 && px < cw * 0.7) {
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
      state.startscreen = 0;
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
    let mr;
    while ((mr = moveDown()) !== 1) { if (state.nowblock.cells.length === 0) break; }
    if (state.nowblock.cells.length === 0) { setnextblock(); state.timestamp = now(); return 0; }
    if (stickblock()) { gover(); initBlockState(); return 0; }
    calculatescore(removeline());
    state.timestamp = now();
    return 0;
  }
  if (action === 'drop') { state.vkspace2 = true; return 0; }
  if (action === 'hold') { tryHoldSwap(); return 0; }
  if (action === 'pause') { state.pause = !state.pause; return 0; }

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
  const gravityTable = [800,717,633,550,467,383,300,217,133];
  const fallSpeed = gravityTable[Math.min(state.level - 1, gravityTable.length - 1)];
  // vkspace2 (ShiftRight) = fast drop (not instant), softDrop = medium speed
  let speedMult = state.vkspace2 ? 0.025 : 1;
  if (state.speedup > 0 && speedMult === 1) speedMult = 0.4;
  if (state.speeddown > 0 && speedMult === 1) speedMult = 2.5;
  const doFall = state.timestamp + fallSpeed * speedMult < now();
  if (doFall) {
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
      calculatescore(removeline());
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
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, w * 0.08);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    return;
  }
  const border = Math.max(1, w * 0.08);
  ctx.fillStyle = valToColor(val);
  ctx.fillRect(x, y, w, h);
  // Inner brighter face
  ctx.fillStyle = valToColorBright(val);
  ctx.fillRect(x + border, y + border, w - border * 2, h - border * 2);
  // Special item decorations
  drawCellDecoration(x, y, w, h, val);
}


function drawCellDecoration(x, y, w, h, val) {
  const code = val & 255;
  if (code === 0) return;
  const cx = x + w / 2, cy = y + h / 2;
  const s = w * 0.45;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.lineCap = 'round';

  // pic 65 (self-destruct): 3 perpendicular squares/cross (same as bombs)
  if (code === 1) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx + s, cy - s);
    ctx.lineTo(cx - s, cy - s);
    ctx.lineTo(cx - s, cy + s);
    ctx.lineTo(cx + s, cy + s);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
    ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s, cy);
    ctx.stroke();
  }
  // pic 75 (obstacle): filled cross (+ shape)
  if (code === 11) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.moveTo(cx + 0.3*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.3*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.3*s, cy + 0.1*s);
    ctx.lineTo(cx + 0.3*s, cy + 0.1*s);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 0.1*s, cy - 0.3*s);
    ctx.lineTo(cx - 0.1*s, cy - 0.3*s);
    ctx.lineTo(cx - 0.1*s, cy + 0.3*s);
    ctx.lineTo(cx + 0.1*s, cy + 0.3*s);
    ctx.fill();
  }
  // pic 66 (hide): pentagon house + window marks — XZ-face lineStrip+lines
  if (code === 2) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    // house outline: [0.3,-0.4]->[0.3,0.2]->[0,0.4]->[-0.3,0.2]->[-0.3,-0.4]
    ctx.beginPath();
    ctx.moveTo(cx + 0.3*s, cy + 0.4*s);
    ctx.lineTo(cx + 0.3*s, cy - 0.2*s);
    ctx.lineTo(cx,          cy - 0.4*s);
    ctx.lineTo(cx - 0.3*s, cy - 0.2*s);
    ctx.lineTo(cx - 0.3*s, cy + 0.4*s);
    ctx.stroke();
    // window mark: lineStrip [-0.15,0.1]->[-0.05,0.1]->[-0.05,-0.1]
    ctx.beginPath();
    ctx.moveTo(cx - 0.15*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.05*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.05*s, cy + 0.1*s);
    ctx.stroke();
    // window mark: lines [0.05,0.1]->[0.15,0.1]
    ctx.beginPath();
    ctx.moveTo(cx + 0.05*s, cy - 0.1*s);
    ctx.lineTo(cx + 0.15*s, cy - 0.1*s);
    ctx.stroke();
  }
  // pic 68 (x2): 3-sided square + vertical line — XZ-face lineStrip+lines
  if (code === 4) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    // 3-sided square: [0.4,0.4]->[-0.4,0.4]->[-0.4,-0.4]->[0.4,-0.4]
    ctx.beginPath();
    ctx.moveTo(cx + 0.4*s, cy - 0.4*s);
    ctx.lineTo(cx - 0.4*s, cy - 0.4*s);
    ctx.lineTo(cx - 0.4*s, cy + 0.4*s);
    ctx.lineTo(cx + 0.4*s, cy + 0.4*s);
    ctx.stroke();
    // vertical line: [0,0.5]->[0,-0.5]
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.5*s);
    ctx.lineTo(cx, cy + 0.5*s);
    ctx.stroke();
  }
  // pic 69 (erase): 4 short diagonal lines from corners — XZ-face lines
  if (code === 5) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx + 0.4*s, cy - 0.4*s); ctx.lineTo(cx + 0.2*s, cy - 0.2*s);
    ctx.moveTo(cx + 0.4*s, cy + 0.4*s); ctx.lineTo(cx + 0.2*s, cy + 0.2*s);
    ctx.moveTo(cx - 0.4*s, cy - 0.4*s); ctx.lineTo(cx - 0.2*s, cy - 0.2*s);
    ctx.moveTo(cx - 0.4*s, cy + 0.4*s); ctx.lineTo(cx - 0.2*s, cy + 0.2*s);
    ctx.stroke();
  }
  // pic 70 (hidenext): N/zigzag + X cross — XZ-face lineStrip+lines
  if (code === 6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    // zigzag: [-0.2,-0.4]->[-0.2,0.4]->[0.2,-0.4]->[0.2,0.4]
    ctx.beginPath();
    ctx.moveTo(cx - 0.2*s, cy + 0.4*s);
    ctx.lineTo(cx - 0.2*s, cy - 0.4*s);
    ctx.lineTo(cx + 0.2*s, cy + 0.4*s);
    ctx.lineTo(cx + 0.2*s, cy - 0.4*s);
    ctx.stroke();
    // X cross: [0.5,0.5]->[-0.5,-0.5], [-0.5,0.5]->[0.5,-0.5]
    ctx.beginPath();
    ctx.moveTo(cx + 0.5*s, cy - 0.5*s); ctx.lineTo(cx - 0.5*s, cy + 0.5*s);
    ctx.moveTo(cx - 0.5*s, cy - 0.5*s); ctx.lineTo(cx + 0.5*s, cy + 0.5*s);
    ctx.stroke();
  }
  // pic for spin lock (code 91)
  if (code === 91) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    // square with arrow: [0.6,-0.6]->[0.6,0.6]->[-0.6,0.6]->[-0.6,-0.6]->[0.2,-0.6]->[-0.1,-0.4],[0.2,-0.6]->[-0.1,-0.8]
    ctx.beginPath();
    ctx.moveTo(cx + 0.6*s, cy + 0.6*s);
    ctx.lineTo(cx + 0.6*s, cy - 0.6*s);
    ctx.lineTo(cx - 0.6*s, cy - 0.6*s);
    ctx.lineTo(cx - 0.6*s, cy + 0.6*s);
    ctx.lineTo(cx + 0.2*s, cy + 0.6*s);
    ctx.lineTo(cx - 0.1*s, cy + 0.4*s);
    ctx.moveTo(cx + 0.2*s, cy + 0.6*s);
    ctx.lineTo(cx - 0.1*s, cy + 0.8*s);
    ctx.stroke();
    // diagonal X: [0.8,0.8]->[-0.8,-0.8], [-0.8,0.8]->[0.8,-0.8]
    ctx.beginPath();
    ctx.moveTo(cx + 0.8*s, cy - 0.8*s); ctx.lineTo(cx - 0.8*s, cy + 0.8*s);
    ctx.moveTo(cx - 0.8*s, cy - 0.8*s); ctx.lineTo(cx + 0.8*s, cy + 0.8*s);
    ctx.stroke();
  }
  // code 8 (speedup >>): double right arrows
  if (code === 8) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 0.5*s, cy - 0.5*s); ctx.lineTo(cx, cy); ctx.lineTo(cx - 0.5*s, cy + 0.5*s);
    ctx.moveTo(cx, cy - 0.5*s); ctx.lineTo(cx + 0.5*s, cy); ctx.lineTo(cx, cy + 0.5*s);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // code 9 (speeddown <<): double left arrows
  if (code === 9) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 0.5*s, cy - 0.5*s); ctx.lineTo(cx, cy); ctx.lineTo(cx + 0.5*s, cy + 0.5*s);
    ctx.moveTo(cx, cy - 0.5*s); ctx.lineTo(cx - 0.5*s, cy); ctx.lineTo(cx, cy + 0.5*s);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // code 10 (holdlock HX): H shape with X overlay
  if (code === 10) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    // H shape
    ctx.beginPath();
    ctx.moveTo(cx - 0.5*s, cy - 0.5*s); ctx.lineTo(cx - 0.5*s, cy + 0.5*s);
    ctx.moveTo(cx - 0.5*s, cy); ctx.lineTo(cx + 0.5*s, cy);
    ctx.moveTo(cx + 0.5*s, cy - 0.5*s); ctx.lineTo(cx + 0.5*s, cy + 0.5*s);
    ctx.stroke();
    // X cross
    ctx.beginPath();
    ctx.moveTo(cx - 0.3*s, cy - 0.3*s); ctx.lineTo(cx + 0.3*s, cy + 0.3*s);
    ctx.moveTo(cx + 0.3*s, cy - 0.3*s); ctx.lineTo(cx - 0.3*s, cy + 0.3*s);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // code 16 (blindboard): horizontal eye shape with X
  if (code === 16) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    // Horizontal eye: two arcs (top and bottom)
    ctx.beginPath();
    ctx.moveTo(cx - 0.7*s, cy);
    ctx.quadraticCurveTo(cx, cy - 0.5*s, cx + 0.7*s, cy);
    ctx.quadraticCurveTo(cx, cy + 0.5*s, cx - 0.7*s, cy);
    ctx.stroke();
    // Pupil
    ctx.beginPath();
    ctx.arc(cx, cy, 0.15*s, 0, Math.PI*2);
    ctx.stroke();
    // X cross over eye
    ctx.beginPath();
    ctx.moveTo(cx - 0.4*s, cy - 0.4*s); ctx.lineTo(cx + 0.4*s, cy + 0.4*s);
    ctx.moveTo(cx + 0.4*s, cy - 0.4*s); ctx.lineTo(cx - 0.4*s, cy + 0.4*s);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // code 17 (bombnext): 品 shape (1 box on top, 2 boxes on bottom)
  if (code === 17) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    // Top 밭 (box + cross)
    ctx.strokeRect(cx - 0.2*s, cy - 0.6*s, 0.4*s, 0.4*s);
    ctx.beginPath(); ctx.moveTo(cx, cy - 0.6*s); ctx.lineTo(cx, cy - 0.2*s); ctx.moveTo(cx - 0.2*s, cy - 0.4*s); ctx.lineTo(cx + 0.2*s, cy - 0.4*s); ctx.stroke();
    // Bottom-left 밭
    ctx.strokeRect(cx - 0.5*s, cy + 0.0*s, 0.4*s, 0.4*s);
    ctx.beginPath(); ctx.moveTo(cx - 0.3*s, cy); ctx.lineTo(cx - 0.3*s, cy + 0.4*s); ctx.moveTo(cx - 0.5*s, cy + 0.2*s); ctx.lineTo(cx - 0.1*s, cy + 0.2*s); ctx.stroke();
    // Bottom-right 밭
    ctx.strokeRect(cx + 0.1*s, cy + 0.0*s, 0.4*s, 0.4*s);
    ctx.beginPath(); ctx.moveTo(cx + 0.3*s, cy); ctx.lineTo(cx + 0.3*s, cy + 0.4*s); ctx.moveTo(cx + 0.1*s, cy + 0.2*s); ctx.lineTo(cx + 0.5*s, cy + 0.2*s); ctx.stroke();
    ctx.lineWidth = 1;
  }
  // code 21 (Simplify2): two boxes side by side
  if (code === 21) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 0.5*s, cy - 0.3*s, 0.45*s, 0.6*s);
    ctx.strokeRect(cx + 0.05*s, cy - 0.3*s, 0.45*s, 0.6*s);
    ctx.lineWidth = 1;
  }
  // code 22 (PentaForce): 3 boxes on top, 2 on bottom
  if (code === 22) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    // Top row: 3 boxes
    ctx.strokeRect(cx - 0.55*s, cy - 0.55*s, 0.33*s, 0.45*s);
    ctx.strokeRect(cx - 0.165*s, cy - 0.55*s, 0.33*s, 0.45*s);
    ctx.strokeRect(cx + 0.22*s, cy - 0.55*s, 0.33*s, 0.45*s);
    // Bottom row: 2 boxes
    ctx.strokeRect(cx - 0.4*s, cy + 0.05*s, 0.37*s, 0.45*s);
    ctx.strokeRect(cx + 0.03*s, cy + 0.05*s, 0.37*s, 0.45*s);
    ctx.lineWidth = 1;
  }
  // code 20 (빈공간삭제): thick down arrow (two vertical lines + V)
  if (code === 20) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    // Two vertical lines
    ctx.beginPath();
    ctx.moveTo(cx - 0.25*s, cy - 0.6*s); ctx.lineTo(cx - 0.25*s, cy + 0.1*s);
    ctx.moveTo(cx + 0.25*s, cy - 0.6*s); ctx.lineTo(cx + 0.25*s, cy + 0.1*s);
    ctx.stroke();
    // V shape (arrowhead)
    ctx.beginPath();
    ctx.moveTo(cx - 0.5*s, cy + 0.1*s); ctx.lineTo(cx, cy + 0.6*s); ctx.lineTo(cx + 0.5*s, cy + 0.1*s);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // pic 38 (updel): top half filled — XZ-face quad
  if (code === 102) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    // quad: [-0.7,0]->[0.7,0]->[0.7,0.7]->[-0.7,0.7] (y flipped: top half)
    ctx.beginPath();
    ctx.moveTo(cx - 0.7*s, cy);
    ctx.lineTo(cx + 0.7*s, cy);
    ctx.lineTo(cx + 0.7*s, cy - 0.7*s);
    ctx.lineTo(cx - 0.7*s, cy - 0.7*s);
    ctx.fill();
  }
  // pic 40 (mono): rectangle outline (0.6 size) — XZ-face lineStrip
  if (code === 104) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    // closed rect: [-0.6,-0.6]->[0.6,-0.6]->[0.6,0.6]->[-0.6,0.6]->[-0.6,-0.6]
    ctx.beginPath();
    ctx.moveTo(cx - 0.6*s, cy + 0.6*s);
    ctx.lineTo(cx + 0.6*s, cy + 0.6*s);
    ctx.lineTo(cx + 0.6*s, cy - 0.6*s);
    ctx.lineTo(cx - 0.6*s, cy - 0.6*s);
    ctx.closePath();
    ctx.stroke();
  }
  // pic 52 (2-): two separated horizontal bars — XZ-face quads
  if (code === 116) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    // left bar: x in [-0.8, -0.2], y in [-0.1, 0.1]
    ctx.beginPath();
    ctx.moveTo(cx - 0.8*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.2*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.2*s, cy + 0.1*s);
    ctx.lineTo(cx - 0.8*s, cy + 0.1*s);
    ctx.fill();
    // right bar: x in [0.2, 0.8], y in [-0.1, 0.1]
    ctx.beginPath();
    ctx.moveTo(cx + 0.8*s, cy - 0.1*s);
    ctx.lineTo(cx + 0.2*s, cy - 0.1*s);
    ctx.lineTo(cx + 0.2*s, cy + 0.1*s);
    ctx.lineTo(cx + 0.8*s, cy + 0.1*s);
    ctx.fill();
  }
  // pic 53 (2+): two bars + two cross bars — XZ-face quads
  if (code === 117) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    // left horizontal bar: x in [-0.8, -0.2], y in [-0.1, 0.1]
    ctx.beginPath();
    ctx.moveTo(cx - 0.8*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.2*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.2*s, cy + 0.1*s);
    ctx.lineTo(cx - 0.8*s, cy + 0.1*s);
    ctx.fill();
    // right horizontal bar: x in [0.2, 0.8], y in [-0.1, 0.1]
    ctx.beginPath();
    ctx.moveTo(cx + 0.8*s, cy - 0.1*s);
    ctx.lineTo(cx + 0.2*s, cy - 0.1*s);
    ctx.lineTo(cx + 0.2*s, cy + 0.1*s);
    ctx.lineTo(cx + 0.8*s, cy + 0.1*s);
    ctx.fill();
    // left vertical cross: x in [-0.6, -0.4], y in [-0.3, 0.3]
    ctx.beginPath();
    ctx.moveTo(cx - 0.6*s, cy - 0.3*s);
    ctx.lineTo(cx - 0.4*s, cy - 0.3*s);
    ctx.lineTo(cx - 0.4*s, cy + 0.3*s);
    ctx.lineTo(cx - 0.6*s, cy + 0.3*s);
    ctx.fill();
    // right vertical cross: x in [0.4, 0.6], y in [-0.3, 0.3]
    ctx.beginPath();
    ctx.moveTo(cx + 0.6*s, cy - 0.3*s);
    ctx.lineTo(cx + 0.4*s, cy - 0.3*s);
    ctx.lineTo(cx + 0.4*s, cy + 0.3*s);
    ctx.lineTo(cx + 0.6*s, cy + 0.3*s);
    ctx.fill();
  }
  // pic 54 (VC): bowtie/hourglass lines — XZ-face lineStrips
  if (code === 118) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    // first bowtie line: [-0.3,0.5]->[0,0.7]->[0,-0.7]->[0.3,-0.5]
    ctx.beginPath();
    ctx.moveTo(cx - 0.3*s, cy - 0.5*s);
    ctx.lineTo(cx,          cy - 0.7*s);
    ctx.lineTo(cx,          cy + 0.7*s);
    ctx.lineTo(cx + 0.3*s, cy + 0.5*s);
    ctx.stroke();
    // second bowtie line: [0.3,0.5]->[0,0.7]->[0,-0.7]->[-0.3,-0.5]
    ctx.beginPath();
    ctx.moveTo(cx + 0.3*s, cy - 0.5*s);
    ctx.lineTo(cx,          cy - 0.7*s);
    ctx.lineTo(cx,          cy + 0.7*s);
    ctx.lineTo(cx - 0.3*s, cy + 0.5*s);
    ctx.stroke();
  }
  // pic 55 (AC): C-shape frame (3 bars forming C) — XZ-face quads
  if (code === 119) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    // top bar: x in [-0.5, 0.5], y in [0.3, 0.5]
    ctx.beginPath();
    ctx.moveTo(cx + 0.5*s, cy - 0.5*s);
    ctx.lineTo(cx - 0.5*s, cy - 0.5*s);
    ctx.lineTo(cx - 0.5*s, cy - 0.3*s);
    ctx.lineTo(cx + 0.5*s, cy - 0.3*s);
    ctx.fill();
    // bottom bar: x in [-0.5, 0.5], y in [-0.5, -0.3]
    ctx.beginPath();
    ctx.moveTo(cx + 0.5*s, cy + 0.5*s);
    ctx.lineTo(cx - 0.5*s, cy + 0.5*s);
    ctx.lineTo(cx - 0.5*s, cy + 0.3*s);
    ctx.lineTo(cx + 0.5*s, cy + 0.3*s);
    ctx.fill();
    // left vertical bar: x in [-0.5, -0.3], y in [-0.5, 0.5]
    ctx.beginPath();
    ctx.moveTo(cx - 0.5*s, cy - 0.5*s);
    ctx.lineTo(cx - 0.3*s, cy - 0.5*s);
    ctx.lineTo(cx - 0.3*s, cy + 0.5*s);
    ctx.lineTo(cx - 0.5*s, cy + 0.5*s);
    ctx.fill();
  }
  // pic 56-59,63,96 (bombs): 3 perpendicular squares/cross — center-plane lineStrips
  if (code >= 120 && code <= 123) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    // XY-plane square: [1,1]->[-1,1]->[-1,-1]->[1,-1]->[1,1]
    ctx.beginPath();
    ctx.moveTo(cx + s, cy - s);
    ctx.lineTo(cx - s, cy - s);
    ctx.lineTo(cx - s, cy + s);
    ctx.lineTo(cx + s, cy + s);
    ctx.closePath();
    ctx.stroke();
    // cross from YZ and XZ plane squares projected
    ctx.beginPath();
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
    ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s, cy);
    ctx.stroke();
  }
  // pic 60 (3-): three separated bars — XZ-face quads
  if (code === 124) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    // left bar: x in [-0.8, -0.4], y in [-0.1, 0.1]
    ctx.beginPath();
    ctx.moveTo(cx - 0.8*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.4*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.4*s, cy + 0.1*s);
    ctx.lineTo(cx - 0.8*s, cy + 0.1*s);
    ctx.fill();
    // right bar: x in [0.4, 0.8], y in [-0.1, 0.1]
    ctx.beginPath();
    ctx.moveTo(cx + 0.8*s, cy - 0.1*s);
    ctx.lineTo(cx + 0.4*s, cy - 0.1*s);
    ctx.lineTo(cx + 0.4*s, cy + 0.1*s);
    ctx.lineTo(cx + 0.8*s, cy + 0.1*s);
    ctx.fill();
    // center bar: x in [-0.2, 0.2], y in [-0.1, 0.1]
    ctx.beginPath();
    ctx.moveTo(cx - 0.2*s, cy - 0.1*s);
    ctx.lineTo(cx + 0.2*s, cy - 0.1*s);
    ctx.lineTo(cx + 0.2*s, cy + 0.1*s);
    ctx.lineTo(cx - 0.2*s, cy + 0.1*s);
    ctx.fill();
  }
  // pic 61 (+1): cross shape (same as 65 on all faces) — XZ-face quads
  if (code === 125) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    // horizontal bar: x in [-0.3, 0.3], y in [-0.1, 0.1]
    ctx.beginPath();
    ctx.moveTo(cx + 0.3*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.3*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.3*s, cy + 0.1*s);
    ctx.lineTo(cx + 0.3*s, cy + 0.1*s);
    ctx.fill();
    // vertical bar: x in [-0.1, 0.1], y in [-0.3, 0.3]
    ctx.beginPath();
    ctx.moveTo(cx + 0.1*s, cy - 0.3*s);
    ctx.lineTo(cx - 0.1*s, cy - 0.3*s);
    ctx.lineTo(cx - 0.1*s, cy + 0.3*s);
    ctx.lineTo(cx + 0.1*s, cy + 0.3*s);
    ctx.fill();
  }
  // pic 62 (xzdel): bowtie shape — XZ-face lineStrips
  if (code === 126) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    // line 1: [-0.3,0.5]->[0,0.7]->[0,-0.7]->[0.3,-0.5]
    ctx.beginPath();
    ctx.moveTo(cx - 0.3*s, cy - 0.5*s);
    ctx.lineTo(cx,          cy - 0.7*s);
    ctx.lineTo(cx,          cy + 0.7*s);
    ctx.lineTo(cx + 0.3*s, cy + 0.5*s);
    ctx.stroke();
    // line 2: [0.3,0.5]->[0,0.7]->[0,-0.7]->[-0.3,-0.5]
    ctx.beginPath();
    ctx.moveTo(cx + 0.3*s, cy - 0.5*s);
    ctx.lineTo(cx,          cy - 0.7*s);
    ctx.lineTo(cx,          cy + 0.7*s);
    ctx.lineTo(cx - 0.3*s, cy + 0.5*s);
    ctx.stroke();
    // line 3: [0.5,-0.3]->[0.7,0]->[-0.7,0]->[-0.5,0.3]
    ctx.beginPath();
    ctx.moveTo(cx + 0.5*s, cy + 0.3*s);
    ctx.lineTo(cx + 0.7*s, cy);
    ctx.lineTo(cx - 0.7*s, cy);
    ctx.lineTo(cx - 0.5*s, cy - 0.3*s);
    ctx.stroke();
    // line 4: [0.5,0.3]->[0.7,0]->[-0.7,0]->[-0.5,-0.3]
    ctx.beginPath();
    ctx.moveTo(cx + 0.5*s, cy - 0.3*s);
    ctx.lineTo(cx + 0.7*s, cy);
    ctx.lineTo(cx - 0.7*s, cy);
    ctx.lineTo(cx - 0.5*s, cy + 0.3*s);
    ctx.stroke();
  }
  // val 30 (관통): T-shape + box decoration (古 shape, matching polycube pic 94)
  if (code === 30) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    // horizontal line at top
    ctx.beginPath();
    ctx.moveTo(cx + 0.3*s, cy - 0.4*s);
    ctx.lineTo(cx - 0.3*s, cy - 0.4*s);
    ctx.stroke();
    // vertical stem from center down
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.4*s);
    ctx.lineTo(cx, cy - 0.1*s);
    ctx.stroke();
    // box below (closed rectangle)
    ctx.beginPath();
    ctx.moveTo(cx - 0.3*s, cy - 0.1*s);
    ctx.lineTo(cx - 0.3*s, cy + 0.4*s);
    ctx.lineTo(cx + 0.3*s, cy + 0.4*s);
    ctx.lineTo(cx + 0.3*s, cy - 0.1*s);
    ctx.closePath();
    ctx.stroke();
  }
  // pic 63/96 (bombcr/explode): 3 perpendicular squares/cross
  if (code === 127) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx + s, cy - s);
    ctx.lineTo(cx - s, cy - s);
    ctx.lineTo(cx - s, cy + s);
    ctx.lineTo(cx + s, cy + s);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
    ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s, cy);
    ctx.stroke();
  }
  // code 200: 거울상 (mirror) — trapezoid (|
  if (code === 200) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, w * 0.07);
    // Right vertical bar |
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.4, cy - s * 0.8);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.8);
    ctx.stroke();
    // Left angled line ( — trapezoid shape
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy - s * 0.8);
    ctx.lineTo(cx - s * 0.7, cy - s * 0.3);
    ctx.lineTo(cx - s * 0.7, cy + s * 0.3);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.8);
    ctx.stroke();
  }
  // Hole: three dashes at 12, 4, 8 o'clock
  if (code === 18) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // 12 o'clock
    ctx.moveTo(cx - 0.15*s, cy - 0.55*s);
    ctx.lineTo(cx + 0.15*s, cy - 0.55*s);
    // 4 o'clock (lower-right)
    ctx.moveTo(cx + 0.33*s, cy + 0.17*s);
    ctx.lineTo(cx + 0.48*s, cy + 0.43*s);
    // 8 o'clock (lower-left)
    ctx.moveTo(cx - 0.48*s, cy + 0.43*s);
    ctx.lineTo(cx - 0.33*s, cy + 0.17*s);
    ctx.stroke();
  }
  // Zigzag: Z letter
  if (code === 19) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 0.5*s, cy - 0.5*s);
    ctx.lineTo(cx + 0.5*s, cy - 0.5*s);
    ctx.lineTo(cx - 0.5*s, cy + 0.5*s);
    ctx.lineTo(cx + 0.5*s, cy + 0.5*s);
    ctx.stroke();
  }
  ctx.restore();
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
    // Board outline only
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
  if (!state.hideblock && state.nowblock && state.nowblock.cells) {
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
  drawLineStringCentered(ctx, panelCx, panelStartY + rowH * row, labelScale, 'HIGH:', '#888');
  row++;
  drawCenteredDigits(ctx, panelCx, panelStartY + rowH * row, numScale, state.oh, 9, '#0ff');
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
      ctx.strokeStyle = '#ff0';
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
  drawLineStringCentered(ctx, cw / 2, ch * 0.15, titleScale, 'GAME OVER', '#fff');

  // Score label and digits (large, 2x)
  const labelScale = Math.max(14, cw * 0.055);
  const scoreScale = Math.max(20, cw * 0.09);
  drawLineStringCentered(ctx, cw / 2, ch * 0.28, labelScale, 'SCORE:', '#888');
  drawLineStringCentered(ctx, cw / 2, ch * 0.37, scoreScale, String(state.oscore), '#0ff');

  // High score
  drawLineStringCentered(ctx, cw / 2, ch * 0.46, labelScale, 'HIGH:', '#888');
  drawLineStringCentered(ctx, cw / 2, ch * 0.53, scoreScale * 0.7, String(state.oh), '#fff');

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
  1:'자폭: 착지 시 주변 삭제', 2:'은폐: 현재 블록 숨김', 200:'거울상: 보드 좌우반전', 19:'지그재그: 각 행 블록 재배치', 4:'득점강화: 점수 2배',
  5:'아이템제거', 6:'예측차단: 다음 블록 숨김', 8:'속도증가: x2.5', 9:'속도감소: x0.4',
  10:'홀드봉인', 11:'장애물: 장애물블록 3개 추가', 16:'시야봉인: 보드 숨김', 17:'폭탄블록5개: 5블록에 폭탄', 18:'구멍: 블록 30% 제거',
  91:'회전봉인', 20:'빈공간삭제', 21:'소형화: 3칸 이하 블록만', 22:'대형화', 30:'관통', 31:'상쇄',
  102:'상단삭제', 104:'모노전용: 1칸 블록만', 105:'종렬삭제', 116:'-2줄', 117:'+2줄',
  118:'범위삭제', 119:'전체삭제', 120:'시한폭탄', 121:'시한폭탄', 122:'시한폭탄',
  123:'시한폭탄', 124:'-3줄', 125:'+1줄', 126:'횡렬삭제', 127:'폭탄변환',
} : {
  1:'Self-Destruct: Delete nearby on land', 2:'Conceal: Hide current block', 200:'Mirror: Flip board L/R', 19:'Zigzag: Shuffle each row', 4:'Score Boost: 2x points', 5:'Item Clear: Remove all items',
  6:'No Preview: Hide next block', 8:'Speed Up: x2.5 drop speed', 9:'Slow Down: x0.4 drop speed', 10:'Hold Lock: Disable hold', 11:'Obstacle: Add 3 obstacle blocks',
  16:'Blind: Hide board', 17:'Bomb x5: Next 5 have bombs', 18:'Hole: Remove 30% blocks', 91:'Rot Lock: Disable rotation', 20:'Gap Clear: Remove empty gaps', 21:'Simplify: ≤3 cell blocks only',
  22:'PentaForce: Larger blocks', 30:'Pierce: Pass through blocks', 31:'Cancel: Erase on contact', 102:'Top Clear: Delete top rows', 104:'Mono Only: 1-cell blocks only',
  105:'Col Del: Delete a column', 116:'-2 Lines: Remove 2 rows', 117:'+2 Lines: Add 2 rows', 118:'Range Del: Area delete', 119:'Full Clear: Clear entire board',
  120:'Time Bomb: Explodes later', 121:'Time Bomb: Explodes later', 122:'Time Bomb: Explodes later', 123:'Time Bomb: Explodes later',
  124:'-3 Lines: Remove 3 rows', 125:'+1 Line: Add 1 row', 126:'Row Del: Delete a row', 127:'Bomb Convert: Turn blocks to bombs',
};
// 유리=beneficial(cyan), 불리=harmful(orange) — matches about section
const ITEM_GOOD = new Set([1,4,9,20,21,30,31,102,104,105,116,117,118,119,124,125,126]);

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
  const startX = state.boardX;

  drawCell(startX, textY - blockSize / 2, blockSize, blockSize, code);

  const fontSize = Math.max(8, Math.min(blockSize * 0.75, gapH * 0.45));
  ctx.save();
  ctx.font = `bold ${Math.floor(fontSize)}px sans-serif`;
  ctx.fillStyle = ITEM_GOOD.has(code) ? '#0ff' : '#f90';
  ctx.textBaseline = 'middle';
  const maxTextW = state.cellSize * BOARD_W - blockSize - fontSize * 0.5;
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

  drawBoard();
  drawSidePanel();
  drawItemInfo();
  drawTouchButtons();
}

function drawFrame() {
  handleTouches();
  if (state.ready && !state.startscreen && !state.pause && !state.goverflg) {
    updateFallingLogic();
  }

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
