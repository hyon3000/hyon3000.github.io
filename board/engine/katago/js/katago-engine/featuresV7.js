import { BOARD_SIZE } from './fastBoard.js';
import { getOpponent } from './utils/gameLogic.js';
const INPUT_SPATIAL_CHANNELS_V7 = 22;
const INPUT_GLOBAL_CHANNELS_V7 = 19;
export function createKataGoInputsV7Scratch() {
    const n = BOARD_SIZE * BOARD_SIZE;
    return {
        stones: new Uint8Array(n),
        visited: new Uint8Array(n),
        libertyMarked: new Uint8Array(n),
        stack: [],
        group: [],
        touchedLibs: []
    };
}
const idxNHWC = (x, y, c)=>(y * BOARD_SIZE + x) * INPUT_SPATIAL_CHANNELS_V7 + c;
export function fillInputsV7(args) {
    const { board, currentPlayer, moveHistory, komi } = args;
    const rules = args.rules ?? 'japanese';
    const pla = currentPlayer;
    const opp = getOpponent(pla);
    const spatial = args.outSpatial;
    const global = args.outGlobal;
    spatial.fill(0);
    global.fill(0);
    for(let pos = 0; pos < BOARD_SIZE * BOARD_SIZE; pos++)spatial[pos * INPUT_SPATIAL_CHANNELS_V7 + 0] = 1.0;
    const scratch = args.scratch ?? createKataGoInputsV7Scratch();
    const stones = scratch.stones;
    stones.fill(0);
    for(let y = 0; y < BOARD_SIZE; y++){
        for(let x = 0; x < BOARD_SIZE; x++){
            const v = board[y][x];
            if (v === null) continue;
            stones[y * BOARD_SIZE + x] = v === 'black' ? 1 : 2;
            if (v === pla) spatial[idxNHWC(x, y, 1)] = 1.0;
            else spatial[idxNHWC(x, y, 2)] = 1.0;
        }
    }
    const visited = scratch.visited;
    const libertyMarked = scratch.libertyMarked;
    const stack = scratch.stack;
    const group = scratch.group;
    const touchedLibs = scratch.touchedLibs;
    visited.fill(0);
    libertyMarked.fill(0);
    for(let pos = 0; pos < stones.length; pos++){
        const color = stones[pos];
        if (color === 0) continue;
        if (visited[pos]) continue;
        visited[pos] = 1;
        stack.length = 0;
        group.length = 0;
        touchedLibs.length = 0;
        stack.push(pos);
        group.push(pos);
        let liberties = 0;
        while(stack.length > 0){
            const p = stack.pop();
            const x = p % BOARD_SIZE;
            const y = p / BOARD_SIZE | 0;
            if (x + 1 < BOARD_SIZE) {
                const npos = p + 1;
                const ncolor = stones[npos];
                if (ncolor === 0) {
                    if (!libertyMarked[npos]) {
                        libertyMarked[npos] = 1;
                        touchedLibs.push(npos);
                        liberties++;
                    }
                } else if (ncolor === color && !visited[npos]) {
                    visited[npos] = 1;
                    stack.push(npos);
                    group.push(npos);
                }
            }
            if (x > 0) {
                const npos = p - 1;
                const ncolor = stones[npos];
                if (ncolor === 0) {
                    if (!libertyMarked[npos]) {
                        libertyMarked[npos] = 1;
                        touchedLibs.push(npos);
                        liberties++;
                    }
                } else if (ncolor === color && !visited[npos]) {
                    visited[npos] = 1;
                    stack.push(npos);
                    group.push(npos);
                }
            }
            if (y + 1 < BOARD_SIZE) {
                const npos = p + BOARD_SIZE;
                const ncolor = stones[npos];
                if (ncolor === 0) {
                    if (!libertyMarked[npos]) {
                        libertyMarked[npos] = 1;
                        touchedLibs.push(npos);
                        liberties++;
                    }
                } else if (ncolor === color && !visited[npos]) {
                    visited[npos] = 1;
                    stack.push(npos);
                    group.push(npos);
                }
            }
            if (y > 0) {
                const npos = p - BOARD_SIZE;
                const ncolor = stones[npos];
                if (ncolor === 0) {
                    if (!libertyMarked[npos]) {
                        libertyMarked[npos] = 1;
                        touchedLibs.push(npos);
                        liberties++;
                    }
                } else if (ncolor === color && !visited[npos]) {
                    visited[npos] = 1;
                    stack.push(npos);
                    group.push(npos);
                }
            }
        }
        for (const npos of touchedLibs)libertyMarked[npos] = 0;
        const plane = liberties === 1 ? 3 : liberties === 2 ? 4 : liberties === 3 ? 5 : -1;
        if (plane >= 0) {
            for (const gpos of group){
                const gx = gpos % BOARD_SIZE;
                const gy = gpos / BOARD_SIZE | 0;
                spatial[idxNHWC(gx, gy, plane)] = 1.0;
            }
        }
    }
    const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
    const passWouldEndGame = !!lastMove && (lastMove.x === -1 || lastMove.y === -1);
    const suppressHistory = args.conservativePassAndIsRoot === true && passWouldEndGame;
    const historyPlanes = [
        9,
        10,
        11,
        12,
        13
    ];
    const passGlobals = [
        0,
        1,
        2,
        3,
        4
    ];
    const expectedPlayers = [
        opp,
        pla,
        opp,
        pla,
        opp
    ];
    if (!suppressHistory) {
        for(let i = 0; i < 5; i++){
            const m = moveHistory[moveHistory.length - 1 - i];
            if (!m) break;
            if (m.player !== expectedPlayers[i]) break;
            if (m.x === -1 || m.y === -1) {
                global[passGlobals[i]] = 1.0;
            } else {
                spatial[idxNHWC(m.x, m.y, historyPlanes[i])] = 1.0;
            }
        }
    }
    const selfKomi = pla === 'white' ? komi : -komi;
    global[5] = selfKomi / 20.0;
    if (rules === 'japanese' || rules === 'korean') {
        global[9] = 1.0;
        global[10] = 1.0;
    }
    global[14] = !suppressHistory && passWouldEndGame ? 1.0 : 0.0;
    if (rules === 'chinese') {
        const boardAreaIsEven = BOARD_SIZE * BOARD_SIZE % 2 === 0;
        const drawableKomisAreEven = boardAreaIsEven;
        let komiFloor;
        if (drawableKomisAreEven) komiFloor = Math.floor(selfKomi / 2.0) * 2.0;
        else komiFloor = Math.floor((selfKomi - 1.0) / 2.0) * 2.0 + 1.0;
        let delta = selfKomi - komiFloor;
        if (delta < 0.0) delta = 0.0;
        if (delta > 2.0) delta = 2.0;
        let wave;
        if (delta < 0.5) wave = delta;
        else if (delta < 1.5) wave = 1.0 - delta;
        else wave = delta - 2.0;
        global[18] = wave;
    }
}
export function extractInputsV7(args) {
    const spatial = new Float32Array(BOARD_SIZE * BOARD_SIZE * INPUT_SPATIAL_CHANNELS_V7);
    const global = new Float32Array(INPUT_GLOBAL_CHANNELS_V7);
    fillInputsV7({
        ...args,
        outSpatial: spatial,
        outGlobal: global
    });
    return {
        spatial,
        global
    };
}
