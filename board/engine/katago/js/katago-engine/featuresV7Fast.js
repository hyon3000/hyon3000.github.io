import { getOpponent } from './utils/gameLogic.js';
import { BLACK, WHITE, EMPTY, PASS_MOVE, BOARD_SIZE, computeLibertyMap, computeAreaMapV7KataGo } from './fastBoard.js';
const INPUT_SPATIAL_CHANNELS_V7 = 22;
const INPUT_GLOBAL_CHANNELS_V7 = 19;
const idxNHWC = (x, y, c)=>(y * BOARD_SIZE + x) * INPUT_SPATIAL_CHANNELS_V7 + c;
function playerToColor(p) {
    return p === 'black' ? BLACK : WHITE;
}
export function fillInputsV7Fast(args) {
    const { stones, koPoint, currentPlayer, recentMoves, komi } = args;
    const rules = args.rules ?? 'japanese';
    const pla = currentPlayer;
    const opp = getOpponent(pla);
    const plaColor = playerToColor(pla);
    const oppColor = playerToColor(opp);
    const spatial = args.outSpatial;
    const global = args.outGlobal;
    spatial.fill(0);
    global.fill(0);
    for(let pos = 0; pos < BOARD_SIZE * BOARD_SIZE; pos++)spatial[pos * INPUT_SPATIAL_CHANNELS_V7 + 0] = 1.0;
    if (koPoint >= 0 && koPoint < BOARD_SIZE * BOARD_SIZE) {
        const x = koPoint % BOARD_SIZE;
        const y = koPoint / BOARD_SIZE | 0;
        spatial[idxNHWC(x, y, 6)] = 1.0;
    }
    const libs = args.libertyMap ?? computeLibertyMap(stones);
    for(let y = 0; y < BOARD_SIZE; y++){
        for(let x = 0; x < BOARD_SIZE; x++){
            const pos = y * BOARD_SIZE + x;
            const v = stones[pos];
            if (v === EMPTY) continue;
            if (v === plaColor) spatial[idxNHWC(x, y, 1)] = 1.0;
            else if (v === oppColor) spatial[idxNHWC(x, y, 2)] = 1.0;
            const l = libs[pos];
            if (l === 1) spatial[idxNHWC(x, y, 3)] = 1.0;
            else if (l === 2) spatial[idxNHWC(x, y, 4)] = 1.0;
            else if (l === 3) spatial[idxNHWC(x, y, 5)] = 1.0;
        }
    }
    if (args.ladderedStones || args.prevLadderedStones || args.prevPrevLadderedStones || args.ladderWorkingMoves) {
        const l0 = args.ladderedStones;
        const l1 = args.prevLadderedStones;
        const l2 = args.prevPrevLadderedStones;
        const lm = args.ladderWorkingMoves;
        for(let y = 0; y < BOARD_SIZE; y++){
            for(let x = 0; x < BOARD_SIZE; x++){
                const pos = y * BOARD_SIZE + x;
                if (l0 && l0[pos]) spatial[idxNHWC(x, y, 14)] = 1.0;
                if (l1 && l1[pos]) spatial[idxNHWC(x, y, 15)] = 1.0;
                if (l2 && l2[pos]) spatial[idxNHWC(x, y, 16)] = 1.0;
                if (lm && lm[pos]) spatial[idxNHWC(x, y, 17)] = 1.0;
            }
        }
    }
    if (rules === 'chinese') {
        const area = args.areaMap ?? computeAreaMapV7KataGo(stones);
        for(let y = 0; y < BOARD_SIZE; y++){
            for(let x = 0; x < BOARD_SIZE; x++){
                const pos = y * BOARD_SIZE + x;
                const v = area[pos];
                if (v === plaColor) spatial[idxNHWC(x, y, 18)] = 1.0;
                else if (v === oppColor) spatial[idxNHWC(x, y, 19)] = 1.0;
            }
        }
    }
    const lastMove = recentMoves.length > 0 ? recentMoves[recentMoves.length - 1] : null;
    const passWouldEndGame = lastMove?.move === PASS_MOVE;
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
            const m = recentMoves[recentMoves.length - 1 - i];
            if (!m) break;
            if (m.player !== expectedPlayers[i]) break;
            if (m.move === PASS_MOVE) {
                global[passGlobals[i]] = 1.0;
            } else {
                const x = m.move % BOARD_SIZE;
                const y = m.move / BOARD_SIZE | 0;
                spatial[idxNHWC(x, y, historyPlanes[i])] = 1.0;
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
export function extractInputsV7Fast(args) {
    const spatial = new Float32Array(BOARD_SIZE * BOARD_SIZE * INPUT_SPATIAL_CHANNELS_V7);
    const global = new Float32Array(INPUT_GLOBAL_CHANNELS_V7);
    fillInputsV7Fast({
        ...args,
        outSpatial: spatial,
        outGlobal: global
    });
    return {
        spatial,
        global
    };
}
