import { fillInputsV7Fast } from './featuresV7Fast.js';
import { BLACK, BOARD_AREA, BOARD_SIZE, PASS_MOVE, WHITE, computeAreaMapV7KataGoInto, computeLadderFeaturesV7KataGoInto, computeLadderedStonesV7KataGoInto, computeLibertyMapInto, playMove } from './fastBoard.js';
let scratch = null;
function getScratch() {
    if (scratch && scratch.area === BOARD_AREA) return scratch;
    const koSimStones = new Uint8Array(BOARD_AREA);
    scratch = {
        area: BOARD_AREA,
        stones: new Uint8Array(BOARD_AREA),
        prevStones: new Uint8Array(BOARD_AREA),
        prevPrevStones: new Uint8Array(BOARD_AREA),
        koSimStones,
        koSimPos: {
            stones: koSimStones,
            koPoint: -1
        },
        koCaptureStack: [],
        libertyMap: new Uint8Array(BOARD_AREA),
        areaMap: new Uint8Array(BOARD_AREA),
        ladderedStones: new Uint8Array(BOARD_AREA),
        ladderWorkingMoves: new Uint8Array(BOARD_AREA),
        prevLadderedStones: new Uint8Array(BOARD_AREA),
        prevPrevLadderedStones: new Uint8Array(BOARD_AREA)
    };
    return scratch;
}
export function playerToColor(p) {
    return p === 'black' ? BLACK : WHITE;
}
export function boardStateToStonesInto(board, out) {
    out.fill(0);
    for(let y = 0; y < BOARD_SIZE; y++){
        const row = board[y];
        for(let x = 0; x < BOARD_SIZE; x++){
            const v = row?.[x] ?? null;
            if (!v) continue;
            out[y * BOARD_SIZE + x] = v === 'black' ? BLACK : WHITE;
        }
    }
}
export function movesToRecentMoves(moves) {
    const out = new Array(moves.length);
    for(let i = 0; i < moves.length; i++){
        const m = moves[i];
        out[i] = {
            move: m.x < 0 || m.y < 0 ? PASS_MOVE : m.y * BOARD_SIZE + m.x,
            player: m.player
        };
    }
    return out;
}
export function countHistoryTurnsIncluded(args) {
    const lastMove = args.recentMoves.length > 0 ? args.recentMoves[args.recentMoves.length - 1] : null;
    const passWouldEndGame = lastMove?.move === PASS_MOVE;
    if (args.conservativePassAndIsRoot && passWouldEndGame) return 0;
    const pla = args.currentPlayer;
    const opp = pla === 'black' ? 'white' : 'black';
    const expectedPlayers = [
        opp,
        pla,
        opp,
        pla,
        opp
    ];
    let included = 0;
    for(let i = 0; i < 5; i++){
        const m = args.recentMoves[args.recentMoves.length - 1 - i];
        if (!m) break;
        if (m.player !== expectedPlayers[i]) break;
        included++;
    }
    return included;
}
export function computeKoPointAfterMove(previousStones, move) {
    if (!move || move.x < 0 || move.y < 0) return -1;
    const s = getScratch();
    s.koSimStones.set(previousStones);
    s.koSimPos.koPoint = -1;
    s.koCaptureStack.length = 0;
    try {
        playMove(s.koSimPos, move.y * BOARD_SIZE + move.x, playerToColor(move.player), s.koCaptureStack);
        return s.koSimPos.koPoint;
    } catch  {
        return -1;
    }
}
export function fillInputsV7FastForPosition(args) {
    const s = getScratch();
    boardStateToStonesInto(args.board, s.stones);
    if (args.previousBoard) boardStateToStonesInto(args.previousBoard, s.prevStones);
    else s.prevStones.set(s.stones);
    if (args.previousPreviousBoard) boardStateToStonesInto(args.previousPreviousBoard, s.prevPrevStones);
    else s.prevPrevStones.set(s.prevStones);
    const lastMove = args.moveHistory.length > 0 ? args.moveHistory[args.moveHistory.length - 1] : null;
    const prevMove = args.moveHistory.length >= 2 ? args.moveHistory[args.moveHistory.length - 2] : null;
    const koPoint = args.previousBoard ? computeKoPointAfterMove(s.prevStones, lastMove) : -1;
    const prevKoPoint = args.previousPreviousBoard ? computeKoPointAfterMove(s.prevPrevStones, prevMove) : -1;
    const prevPrevKoPoint = -1;
    const recentMoves = movesToRecentMoves(args.moveHistory);
    const numTurnsOfHistoryIncluded = countHistoryTurnsIncluded({
        recentMoves,
        currentPlayer: args.currentPlayer,
        conservativePassAndIsRoot: args.conservativePassAndIsRoot
    });
    const prevLadderStones = numTurnsOfHistoryIncluded < 1 ? s.stones : s.prevStones;
    const prevLadderKoPoint = numTurnsOfHistoryIncluded < 1 ? koPoint : prevKoPoint;
    const prevPrevLadderStones = numTurnsOfHistoryIncluded < 2 ? prevLadderStones : s.prevPrevStones;
    const prevPrevLadderKoPoint = numTurnsOfHistoryIncluded < 2 ? prevLadderKoPoint : prevPrevKoPoint;
    computeLibertyMapInto(s.stones, s.libertyMap);
    if (args.rules === 'chinese') computeAreaMapV7KataGoInto(s.stones, s.areaMap);
    computeLadderFeaturesV7KataGoInto({
        stones: s.stones,
        koPoint,
        currentPlayer: playerToColor(args.currentPlayer),
        outLadderedStones: s.ladderedStones,
        outLadderWorkingMoves: s.ladderWorkingMoves
    });
    computeLadderedStonesV7KataGoInto({
        stones: prevLadderStones,
        koPoint: prevLadderKoPoint,
        outLadderedStones: s.prevLadderedStones
    });
    computeLadderedStonesV7KataGoInto({
        stones: prevPrevLadderStones,
        koPoint: prevPrevLadderKoPoint,
        outLadderedStones: s.prevPrevLadderedStones
    });
    fillInputsV7Fast({
        stones: s.stones,
        koPoint,
        currentPlayer: args.currentPlayer,
        recentMoves,
        komi: args.komi,
        rules: args.rules,
        conservativePassAndIsRoot: args.conservativePassAndIsRoot,
        libertyMap: s.libertyMap,
        areaMap: args.rules === 'chinese' ? s.areaMap : undefined,
        ladderedStones: s.ladderedStones,
        prevLadderedStones: s.prevLadderedStones,
        prevPrevLadderedStones: s.prevPrevLadderedStones,
        ladderWorkingMoves: s.ladderWorkingMoves,
        outSpatial: args.outSpatial,
        outGlobal: args.outGlobal
    });
}
