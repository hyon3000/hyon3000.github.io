import { tf } from '../../lib/tfjs/tfjs-bundle.js';
import { getAnimationNow } from './utils/animationFrame.js';
import { postprocessKataGoV8 } from './evalV8.js';
import { expectedWhiteScoreValue, getSqrtBoardArea } from './scoreValue.js';
import { ENGINE_MAX_TIME_MS, ENGINE_MAX_VISITS } from './limits.js';
import { BLACK, WHITE, EMPTY, BOARD_AREA, BOARD_SIZE, PASS_MOVE, NEIGHBOR_COUNTS, NEIGHBOR_LIST, NEIGHBOR_STARTS, opponentOf, playMove, undoMove, computeLadderFeaturesV7KataGoInto, computeLadderedStonesV7KataGoInto, computeAreaMapV7KataGoInto, computeLibertyMap, computeLibertyMapInto, updateLibertyMapForSeeds } from './fastBoard.js';
import { fillInputsV7Fast } from './featuresV7Fast.js';
import { POLICY_OPTIMISM, ROOT_POLICY_OPTIMISM } from './searchParams.js';
const hasOwnership = (out)=>{
    return 'ownership' in out;
};
let expandScratch = null;
let expandScratchBoardArea = 0;
const getExpandScratch = ()=>{
    if (!expandScratch || expandScratchBoardArea !== BOARD_AREA) {
        expandScratch = {
            moves: new Int16Array(BOARD_AREA),
            logits: new Float32Array(BOARD_AREA),
            priors: new Float64Array(BOARD_AREA),
            topMoves: new Int16Array(BOARD_AREA),
            topPriors: new Float64Array(BOARD_AREA),
            order: []
        };
        expandScratchBoardArea = BOARD_AREA;
    }
    return expandScratch;
};
class Node {
    playerToMove;
    visits = 0;
    valueSum = 0;
    scoreLeadSum = 0;
    scoreMeanSum = 0;
    scoreMeanSqSum = 0;
    utilitySum = 0;
    utilitySqSum = 0;
    nnUtility = null;
    ownership = null;
    inFlight = 0;
    pendingEval = false;
    edges = null;
    constructor(playerToMove){
        this.playerToMove = playerToMove;
    }
}
function playerToColor(p) {
    return p === 'black' ? BLACK : WHITE;
}
function colorToPlayer(c) {
    return c === BLACK ? 'black' : 'white';
}
function boardStateToStones(board) {
    const stones = new Uint8Array(BOARD_AREA);
    for(let y = 0; y < BOARD_SIZE; y++){
        for(let x = 0; x < BOARD_SIZE; x++){
            const v = board[y]?.[x] ?? null;
            if (!v) continue;
            stones[y * BOARD_SIZE + x] = v === 'black' ? BLACK : WHITE;
        }
    }
    return stones;
}
function computeKoPointFromPrevious(args) {
    const { previousBoard, moveHistory } = args;
    if (!previousBoard) return -1;
    const last = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
    if (!last || last.x < 0 || last.y < 0) return -1;
    const prevStones = boardStateToStones(previousBoard);
    const pos = {
        stones: prevStones,
        koPoint: -1
    };
    const captureStack = [];
    playMove(pos, last.y * BOARD_SIZE + last.x, playerToColor(last.player), captureStack);
    return pos.koPoint;
}
function computeKoPointAfterMove(previousBoard, move) {
    if (!previousBoard || !move || move.x < 0 || move.y < 0) return -1;
    const prevStones = boardStateToStones(previousBoard);
    const pos = {
        stones: prevStones,
        koPoint: -1
    };
    const captureStack = [];
    playMove(pos, move.y * BOARD_SIZE + move.x, playerToColor(move.player), captureStack);
    return pos.koPoint;
}
function takeRecentMoves(rootMoves, pathMoves, max, out = []) {
    out.length = 0;
    const pushCopy = (src)=>{
        const idx = out.length;
        let dst = out[idx];
        if (!dst) {
            dst = {
                move: src.move,
                player: src.player
            };
            out[idx] = dst;
        } else {
            dst.move = src.move;
            dst.player = src.player;
        }
        out.length = idx + 1;
    };
    for(let i = pathMoves.length - 1; i >= 0 && out.length < max; i--)pushCopy(pathMoves[i]);
    for(let i = rootMoves.length - 1; i >= 0 && out.length < max; i--)pushCopy(rootMoves[i]);
    out.reverse();
    return out;
}
function normalizeRegionOfInterest(roi) {
    if (!roi) return null;
    const xMin = Math.max(0, Math.min(BOARD_SIZE - 1, Math.min(roi.xMin, roi.xMax)));
    const xMax = Math.max(0, Math.min(BOARD_SIZE - 1, Math.max(roi.xMin, roi.xMax)));
    const yMin = Math.max(0, Math.min(BOARD_SIZE - 1, Math.min(roi.yMin, roi.yMax)));
    const yMax = Math.max(0, Math.min(BOARD_SIZE - 1, Math.max(roi.yMin, roi.yMax)));
    const isSinglePoint = xMin === xMax && yMin === yMax;
    const isWholeBoard = xMin === 0 && yMin === 0 && xMax === BOARD_SIZE - 1 && yMax === BOARD_SIZE - 1;
    if (isSinglePoint || isWholeBoard) return null;
    return {
        xMin,
        xMax,
        yMin,
        yMax
    };
}
function buildAllowedMovesMask(roi) {
    const normalized = normalizeRegionOfInterest(roi);
    if (!normalized) return null;
    const allowed = new Uint8Array(BOARD_AREA);
    for(let y = normalized.yMin; y <= normalized.yMax; y++){
        const rowOff = y * BOARD_SIZE;
        for(let x = normalized.xMin; x <= normalized.xMax; x++){
            allowed[rowOff + x] = 1;
        }
    }
    return allowed;
}
function expandNode(args) {
    const { node, stones, koPoint, policyLogits, passLogit, maxChildren } = args;
    const policyScale = args.policyOutputScaling ?? 1.0;
    const pla = node.playerToMove;
    const opp = opponentOf(pla);
    const sym = args.policyLogitsSymmetry ?? 0;
    const symOff = sym * BOARD_AREA;
    const symPosMap = sym === 0 ? null : getSymPosMap();
    const libs = args.libertyMap ?? computeLibertyMap(stones);
    const scratch = getExpandScratch();
    const movesScratch = scratch.moves;
    const logitsScratch = scratch.logits;
    const priorsScratch = scratch.priors;
    let moveCount = 0;
    const passLogitScaled = passLogit * policyScale;
    let maxLogit = passLogitScaled;
    const allowedMoves = args.allowedMoves;
    for(let p = 0; p < BOARD_AREA; p++){
        if (allowedMoves && allowedMoves[p] === 0) continue;
        if (stones[p] !== EMPTY) continue;
        if (p === koPoint) continue;
        let hasEmptyNeighbor = false;
        let captures = false;
        let connectsToSafeGroup = false;
        const nStart = NEIGHBOR_STARTS[p];
        const nCount = NEIGHBOR_COUNTS[p];
        for(let i = 0; i < nCount; i++){
            const n = NEIGHBOR_LIST[nStart + i];
            const c = stones[n];
            if (c === EMPTY) {
                hasEmptyNeighbor = true;
                break;
            }
            if (c === opp) {
                if (libs[n] === 1) {
                    captures = true;
                    break;
                }
                continue;
            }
            if (c === pla && libs[n] > 1) {
                connectsToSafeGroup = true;
                break;
            }
        }
        if (!hasEmptyNeighbor && !captures && !connectsToSafeGroup) continue;
        const symPos = sym === 0 ? p : symPosMap[symOff + p];
        const logit = policyLogits[symPos] * policyScale;
        movesScratch[moveCount] = p;
        logitsScratch[moveCount] = logit;
        if (logit > maxLogit) maxLogit = logit;
        moveCount++;
    }
    let sum = 0;
    for(let i = 0; i < moveCount; i++){
        const v = Math.exp(logitsScratch[i] - maxLogit);
        priorsScratch[i] = v;
        sum += v;
    }
    const passPriorRaw = Math.exp(passLogitScaled - maxLogit);
    sum += passPriorRaw;
    const invSum = 1.0 / sum;
    for(let i = 0; i < moveCount; i++)priorsScratch[i] *= invSum;
    const passPrior = passPriorRaw * invSum;
    if (args.policyOut) {
        const out = args.policyOut;
        out.fill(-1);
        for(let i = 0; i < moveCount; i++)out[movesScratch[i]] = priorsScratch[i];
        out[PASS_MOVE] = passPrior;
    }
    const topMoves = scratch.topMoves;
    const topPriors = scratch.topPriors;
    const maxKids = Math.max(0, maxChildren);
    let topCount = 0;
    let minIdx = 0;
    for(let i = 0; i < moveCount; i++){
        const prior = priorsScratch[i];
        if (topCount < maxKids) {
            topMoves[topCount] = movesScratch[i];
            topPriors[topCount] = prior;
            topCount++;
            if (topCount === maxKids) {
                minIdx = 0;
                for(let j = 1; j < topCount; j++){
                    if (topPriors[j] < topPriors[minIdx]) minIdx = j;
                }
            }
        } else if (maxKids > 0 && prior > topPriors[minIdx]) {
            topMoves[minIdx] = movesScratch[i];
            topPriors[minIdx] = prior;
            minIdx = 0;
            for(let j = 1; j < topCount; j++){
                if (topPriors[j] < topPriors[minIdx]) minIdx = j;
            }
        }
    }
    const order = scratch.order;
    order.length = topCount;
    for(let i = 0; i < topCount; i++)order[i] = i;
    order.sort((a, b)=>{
        const diff = topPriors[b] - topPriors[a];
        if (diff !== 0) return diff;
        return topMoves[a] - topMoves[b];
    });
    const edges = new Array(topCount + 1);
    let edgeIdx = 0;
    for(let i = 0; i < order.length; i++){
        const idx = order[i];
        edges[edgeIdx++] = {
            move: topMoves[idx],
            prior: topPriors[idx],
            child: null
        };
    }
    edges[edgeIdx++] = {
        move: PASS_MOVE,
        prior: passPrior,
        child: null
    };
    node.edges = edges;
}
async function buildRootEval(args) {
    const includeOwnership = args.ownershipMode !== 'none';
    const rootEval = await evaluateRootEval({
        model: args.model,
        includeOwnership,
        rules: args.rules,
        rootSymmetrySamples: args.rootSymmetrySamples,
        policyOptimism: ROOT_POLICY_OPTIMISM,
        komi: args.komi,
        outputScaleMultiplier: args.outputScaleMultiplier,
        state: {
            stones: args.rootStones,
            koPoint: args.rootKoPoint,
            prevStones: args.rootPrevStones,
            prevKoPoint: args.rootPrevKoPoint,
            prevPrevStones: args.rootPrevPrevStones,
            prevPrevKoPoint: args.rootPrevPrevKoPoint,
            currentPlayer: args.currentPlayer,
            recentMoves: takeRecentMoves(args.rootMoves, [], 5),
            conservativePassAndIsRoot: args.conservativePass
        }
    });
    const rootLibertyMap = new Uint8Array(rootEval.libertyMap);
    const rootOwnership = new Float32Array(BOARD_AREA);
    if (includeOwnership) {
        if (!rootEval.ownership) throw new Error('Missing ownership output');
        const rootOwnershipSign = args.currentPlayer === 'black' ? 1 : -1;
        const rootSym = rootEval.symmetry;
        const rootSymOff = rootSym * BOARD_AREA;
        const symPosMap = rootSym === 0 ? null : getSymPosMap();
        for(let i = 0; i < BOARD_AREA; i++){
            const symPos = rootSym === 0 ? i : symPosMap[rootSymOff + i];
            rootOwnership[i] = rootOwnershipSign * activatedOwnership(rootEval, symPos, args.outputScaleMultiplier);
        }
    }
    const rootAllowedMoves = buildAllowedMovesMask(args.regionOfInterest);
    const rootPolicy = new Float32Array(BOARD_AREA + 1);
    const policyNode = args.node ?? new Node(playerToColor(args.currentPlayer));
    const previousEdges = args.preserveExistingChildren === true ? policyNode.edges : null;
    expandNode({
        node: policyNode,
        stones: args.rootStones,
        koPoint: args.rootKoPoint,
        policyLogits: rootEval.policy,
        policyLogitsSymmetry: rootEval.symmetry,
        passLogit: rootEval.passLogit,
        maxChildren: args.maxChildren,
        libertyMap: rootEval.libertyMap,
        allowedMoves: rootAllowedMoves ?? undefined,
        policyOut: rootPolicy,
        policyOutputScaling: args.outputScaleMultiplier
    });
    if (previousEdges && policyNode.edges) {
        const previousByMove = new Map();
        for (const edge of previousEdges)previousByMove.set(edge.move, edge);
        for (const edge of policyNode.edges){
            const previous = previousByMove.get(edge.move);
            if (!previous) continue;
            edge.child = previous.child;
            edge.pvCache = previous.pvCache;
        }
    }
    const recentScoreCenter = computeRecentScoreCenter(-rootEval.blackScoreMean);
    const rootValue = 2 * rootEval.blackWinProb - 1;
    const rootUtility = computeBlackUtilityFromEval({
        blackWinProb: rootEval.blackWinProb,
        blackNoResultProb: rootEval.blackNoResultProb,
        blackScoreMean: rootEval.blackScoreMean,
        blackScoreStdev: rootEval.blackScoreStdev,
        recentScoreCenter
    });
    const rootScoreMeanSq = rootEval.blackScoreStdev * rootEval.blackScoreStdev + rootEval.blackScoreMean * rootEval.blackScoreMean;
    return {
        rootLibertyMap,
        rootOwnership,
        rootPolicy,
        rootValue,
        rootScoreLead: rootEval.blackScoreLead,
        rootScoreMean: rootEval.blackScoreMean,
        rootScoreMeanSq,
        rootUtility,
        recentScoreCenter
    };
}
const WIN_LOSS_UTILITY_FACTOR = 1.0;
const STATIC_SCORE_UTILITY_FACTOR = 0.1;
const DYNAMIC_SCORE_UTILITY_FACTOR = 0.3;
const DYNAMIC_SCORE_CENTER_ZERO_WEIGHT = 0.2;
const DYNAMIC_SCORE_CENTER_SCALE = 0.75;
const NO_RESULT_UTILITY_FOR_WHITE = 0.0;
function computeRecentScoreCenter(expectedWhiteScore) {
    let recentScoreCenter = expectedWhiteScore * (1.0 - DYNAMIC_SCORE_CENTER_ZERO_WEIGHT);
    const cap = getSqrtBoardArea() * DYNAMIC_SCORE_CENTER_SCALE;
    if (recentScoreCenter > expectedWhiteScore + cap) recentScoreCenter = expectedWhiteScore + cap;
    if (recentScoreCenter < expectedWhiteScore - cap) recentScoreCenter = expectedWhiteScore - cap;
    return recentScoreCenter;
}
function computeBlackUtilityFromEval(args) {
    const sqrtBoardArea = getSqrtBoardArea();
    const blackLossProb = 1.0 - args.blackWinProb - args.blackNoResultProb;
    const whiteWinLossValue = blackLossProb - args.blackWinProb;
    const whiteScoreMean = -args.blackScoreMean;
    const whiteScoreStdev = args.blackScoreStdev;
    const staticScoreValue = expectedWhiteScoreValue({
        whiteScoreMean,
        whiteScoreStdev,
        center: 0.0,
        scale: 2.0,
        sqrtBoardArea
    });
    const dynamicScoreValue = DYNAMIC_SCORE_UTILITY_FACTOR === 0.0 ? 0.0 : expectedWhiteScoreValue({
        whiteScoreMean,
        whiteScoreStdev,
        center: args.recentScoreCenter,
        scale: DYNAMIC_SCORE_CENTER_SCALE,
        sqrtBoardArea
    });
    const whiteUtility = whiteWinLossValue * WIN_LOSS_UTILITY_FACTOR + args.blackNoResultProb * NO_RESULT_UTILITY_FOR_WHITE + staticScoreValue * STATIC_SCORE_UTILITY_FACTOR + dynamicScoreValue * DYNAMIC_SCORE_UTILITY_FACTOR;
    return -whiteUtility;
}
const VALUE_WEIGHT_EXPONENT = 0.25;
const USE_NOISE_PRUNING = true;
const NOISE_PRUNE_UTILITY_SCALE = 0.15;
const NOISE_PRUNING_CAP = 1e50;
const SQRT_3 = Math.sqrt(3);
function tDistCdf3(z) {
    const u = z / SQRT_3;
    const term = u / (1 + u * u);
    return 0.5 + (Math.atan(u) + term) / Math.PI;
}
function pruneNoiseWeight(stats) {
    if (stats.length <= 1) return stats.reduce((acc, s)=>acc + s.weightAdjusted, 0);
    stats.sort((a, b)=>b.policy - a.policy);
    let utilitySumSoFar = 0;
    let weightSumSoFar = 0;
    let rawPolicySumSoFar = 0;
    for (const s of stats){
        const utility = s.selfUtility;
        const oldWeight = s.weightAdjusted;
        const rawPolicy = Math.max(1e-30, s.policy);
        let newWeight = oldWeight;
        if (weightSumSoFar > 0 && rawPolicySumSoFar > 0) {
            const avgUtilitySoFar = utilitySumSoFar / weightSumSoFar;
            const utilityGap = avgUtilitySoFar - utility;
            if (utilityGap > 0) {
                const weightShareFromRawPolicy = weightSumSoFar * rawPolicy / rawPolicySumSoFar;
                const lenientWeightShareFromRawPolicy = 2.0 * weightShareFromRawPolicy;
                if (oldWeight > lenientWeightShareFromRawPolicy) {
                    const excessWeight = oldWeight - lenientWeightShareFromRawPolicy;
                    let weightToSubtract = excessWeight * (1.0 - Math.exp(-utilityGap / NOISE_PRUNE_UTILITY_SCALE));
                    if (weightToSubtract > NOISE_PRUNING_CAP) weightToSubtract = NOISE_PRUNING_CAP;
                    newWeight = oldWeight - weightToSubtract;
                    s.weightAdjusted = newWeight;
                }
            }
        }
        utilitySumSoFar += utility * newWeight;
        weightSumSoFar += newWeight;
        rawPolicySumSoFar += rawPolicy;
    }
    return weightSumSoFar;
}
function downweightBadChildrenAndNormalizeWeight(args) {
    const stats = args.stats;
    const desiredTotalWeight = args.desiredTotalWeight;
    if (stats.length === 0 || args.currentTotalWeight <= 0) return;
    if (VALUE_WEIGHT_EXPONENT === 0) {
        let currentTotalWeight = args.currentTotalWeight;
        for (const s of stats){
            if (s.weightAdjusted < args.amountToPrune) {
                currentTotalWeight -= s.weightAdjusted;
                s.weightAdjusted = 0;
                continue;
            }
            const newWeight = s.weightAdjusted - args.amountToSubtract;
            if (newWeight <= 0) {
                currentTotalWeight -= s.weightAdjusted;
                s.weightAdjusted = 0;
            } else {
                currentTotalWeight -= args.amountToSubtract;
                s.weightAdjusted = newWeight;
            }
        }
        if (currentTotalWeight > 0 && currentTotalWeight !== desiredTotalWeight) {
            const factor = desiredTotalWeight / currentTotalWeight;
            for (const s of stats)s.weightAdjusted *= factor;
        }
        return;
    }
    const stdevs = new Array(stats.length);
    let simpleValueSum = 0;
    for(let i = 0; i < stats.length; i++){
        const s = stats[i];
        const weight = s.weightAdjusted;
        if (weight <= 0) continue;
        const precision = 1.5 * Math.sqrt(weight);
        stdevs[i] = Math.sqrt(1e-8 + 1.0 / precision);
        simpleValueSum += s.selfUtility * weight;
    }
    const simpleValue = simpleValueSum / args.currentTotalWeight;
    let totalNewUnnormWeight = 0;
    for(let i = 0; i < stats.length; i++){
        const s = stats[i];
        if (s.weightAdjusted < args.amountToPrune) {
            s.weightAdjusted = 0;
            continue;
        }
        const newWeight = s.weightAdjusted - args.amountToSubtract;
        if (newWeight <= 0) {
            s.weightAdjusted = 0;
            continue;
        }
        s.weightAdjusted = newWeight;
        const stdev = stdevs[i];
        if (!stdev || stdev <= 0) continue;
        const z = (s.selfUtility - simpleValue) / stdev;
        const p = tDistCdf3(z) + 0.0001;
        s.weightAdjusted *= Math.pow(p, VALUE_WEIGHT_EXPONENT);
        totalNewUnnormWeight += s.weightAdjusted;
    }
    if (totalNewUnnormWeight <= 0) return;
    const factor = desiredTotalWeight / totalNewUnnormWeight;
    for (const s of stats)s.weightAdjusted *= factor;
}
function computeWeightedRootStats(args) {
    const stats = args.children;
    if (stats.length === 0) {
        const rootValue = args.rootSelf.value;
        const rootScoreSelfplay = args.rootSelf.scoreMean;
        const rootScoreMeanSq = args.rootSelf.scoreMeanSq;
        const rootScoreStdev = Math.sqrt(Math.max(0, rootScoreMeanSq - rootScoreSelfplay * rootScoreSelfplay));
        return {
            rootValue,
            rootWinRate: (rootValue + 1) * 0.5,
            rootScoreLead: args.rootSelf.scoreLead,
            rootScoreSelfplay,
            rootScoreStdev
        };
    }
    let totalWeight = 0;
    for (const s of stats)totalWeight += s.weightAdjusted;
    if (USE_NOISE_PRUNING) totalWeight = pruneNoiseWeight(stats);
    downweightBadChildrenAndNormalizeWeight({
        stats,
        currentTotalWeight: totalWeight,
        desiredTotalWeight: totalWeight,
        amountToSubtract: 0,
        amountToPrune: 0
    });
    let weightSum = 0;
    let valueSum = 0;
    let scoreMeanSum = 0;
    let scoreMeanSqSum = 0;
    let scoreLeadSum = 0;
    for (const s of stats){
        if (s.weightAdjusted <= 0) continue;
        weightSum += s.weightAdjusted;
        valueSum += s.weightAdjusted * s.value;
        scoreMeanSum += s.weightAdjusted * s.scoreMean;
        scoreMeanSqSum += s.weightAdjusted * s.scoreMeanSq;
        scoreLeadSum += s.weightAdjusted * s.scoreLead;
    }
    weightSum += args.rootSelf.weight;
    valueSum += args.rootSelf.weight * args.rootSelf.value;
    scoreMeanSum += args.rootSelf.weight * args.rootSelf.scoreMean;
    scoreMeanSqSum += args.rootSelf.weight * args.rootSelf.scoreMeanSq;
    scoreLeadSum += args.rootSelf.weight * args.rootSelf.scoreLead;
    if (weightSum <= 0) {
        const rootValue = args.rootSelf.value;
        const rootScoreSelfplay = args.rootSelf.scoreMean;
        const rootScoreMeanSq = args.rootSelf.scoreMeanSq;
        const rootScoreStdev = Math.sqrt(Math.max(0, rootScoreMeanSq - rootScoreSelfplay * rootScoreSelfplay));
        return {
            rootValue,
            rootWinRate: (rootValue + 1) * 0.5,
            rootScoreLead: args.rootSelf.scoreLead,
            rootScoreSelfplay,
            rootScoreStdev
        };
    }
    const rootValue = valueSum / weightSum;
    const rootScoreSelfplay = scoreMeanSum / weightSum;
    const rootScoreMeanSq = scoreMeanSqSum / weightSum;
    const rootScoreStdev = Math.sqrt(Math.max(0, rootScoreMeanSq - rootScoreSelfplay * rootScoreSelfplay));
    return {
        rootValue,
        rootWinRate: (rootValue + 1) * 0.5,
        rootScoreLead: scoreLeadSum / weightSum,
        rootScoreSelfplay,
        rootScoreStdev
    };
}
function hasLadderCandidates(libertyMap) {
    for(let i = 0; i < libertyMap.length; i++){
        const v = libertyMap[i];
        if (v === 1 || v === 2) return true;
    }
    return false;
}
function buildLibertySeeds(args) {
    let count = 0;
    const push = (pos)=>{
        if (count < args.out.length) args.out[count++] = pos;
    };
    const pushWithNeighbors = (pos)=>{
        push(pos);
        const nStart = NEIGHBOR_STARTS[pos];
        const nCount = NEIGHBOR_COUNTS[pos];
        for(let i = 0; i < nCount; i++)push(NEIGHBOR_LIST[nStart + i]);
    };
    if (args.move !== PASS_MOVE) pushWithNeighbors(args.move);
    for(let i = args.captureStart; i < args.captureStack.length; i++){
        pushWithNeighbors(args.captureStack[i]);
    }
    return count;
}
function averageTreeOwnership(node) {
    const out = new Float32Array(BOARD_AREA);
    const outSq = new Float32Array(BOARD_AREA);
    const visits = node.visits;
    const minProp = 0.5 / Math.pow(Math.max(1, visits), 0.75);
    const pruneProp = minProp * 0.01;
    const accumulate = (map, prop)=>{
        for(let i = 0; i < BOARD_AREA; i++){
            const v = map[i];
            out[i] += prop * v;
            outSq[i] += prop * v * v;
        }
    };
    const traverse = (n, desiredProp)=>{
        if (!n.ownership) return false;
        if (desiredProp < minProp) {
            accumulate(n.ownership, desiredProp);
            return true;
        }
        const edges = n.edges;
        if (!edges || edges.length === 0) {
            accumulate(n.ownership, desiredProp);
            return true;
        }
        let childrenWeightSum = 0;
        let relativeChildrenWeightSum = 0;
        const childWeights = [];
        const childNodes = [];
        for (const e of edges){
            const child = e.child;
            if (!child || child.visits <= 0) continue;
            const w = child.visits;
            childWeights.push(w);
            childNodes.push(child);
            childrenWeightSum += w;
            relativeChildrenWeightSum += w * w;
        }
        const parentNNWeight = 1.0;
        const denom = childrenWeightSum + parentNNWeight;
        const desiredPropFromChildren = denom > 0 ? desiredProp * childrenWeightSum / denom : 0;
        let selfProp = denom > 0 ? desiredProp * parentNNWeight / denom : desiredProp;
        if (desiredPropFromChildren <= 0 || relativeChildrenWeightSum <= 0) {
            selfProp += desiredPropFromChildren;
        } else {
            for(let i = 0; i < childNodes.length; i++){
                const w = childWeights[i];
                const childProp = w * w * desiredPropFromChildren / relativeChildrenWeightSum;
                if (childProp < pruneProp) {
                    selfProp += childProp;
                    continue;
                }
                const ok = traverse(childNodes[i], childProp);
                if (!ok) selfProp += childProp;
            }
        }
        accumulate(n.ownership, selfProp);
        return true;
    };
    traverse(node, 1.0);
    const stdev = new Float32Array(BOARD_AREA);
    for(let i = 0; i < BOARD_AREA; i++){
        const mean = out[i];
        const variance = outSq[i] - mean * mean;
        stdev[i] = Math.sqrt(Math.max(0, variance));
    }
    return {
        ownership: out,
        ownershipStdev: stdev
    };
}
const CPUCT_EXPLORATION = 1.0;
const CPUCT_EXPLORATION_LOG = 0.45;
const CPUCT_EXPLORATION_BASE = 500;
const CPUCT_UTILITY_STDEV_PRIOR = 0.4;
const CPUCT_UTILITY_STDEV_PRIOR_WEIGHT = 2.0;
const CPUCT_UTILITY_STDEV_SCALE = 0.85;
const FPU_REDUCTION_MAX = 0.2;
const ROOT_FPU_REDUCTION_MAX = 0.1;
const FPU_LOSS_PROP = 0.0;
const ROOT_FPU_LOSS_PROP = 0.0;
const FPU_PARENT_WEIGHT_BY_VISITED_POLICY = true;
const FPU_PARENT_WEIGHT_BY_VISITED_POLICY_POW = 2.0;
const FPU_PARENT_WEIGHT = 0.0;
const TOTALCHILDWEIGHT_PUCT_OFFSET = 0.01;
function cpuctExploration(totalChildWeight) {
    return CPUCT_EXPLORATION + CPUCT_EXPLORATION_LOG * Math.log((totalChildWeight + CPUCT_EXPLORATION_BASE) / CPUCT_EXPLORATION_BASE);
}
function exploreScaling(totalChildWeight, parentUtilityStdevFactor) {
    return cpuctExploration(totalChildWeight) * Math.sqrt(totalChildWeight + TOTALCHILDWEIGHT_PUCT_OFFSET) * parentUtilityStdevFactor;
}
class Rand {
    spare = null;
    nextBool(p) {
        return Math.random() < p;
    }
    nextGaussian() {
        if (this.spare !== null) {
            const v = this.spare;
            this.spare = null;
            return v;
        }
        let u = 0;
        let v = 0;
        let s = 0;
        while(s === 0 || s >= 1){
            u = Math.random() * 2 - 1;
            v = Math.random() * 2 - 1;
            s = u * u + v * v;
        }
        const mul = Math.sqrt(-2 * Math.log(s) / s);
        this.spare = v * mul;
        return u * mul;
    }
}
function selectEdge(node, isRoot, wideRootNoise, rand) {
    const edges = node.edges;
    if (!edges || edges.length === 0) throw new Error('selectEdge called on unexpanded node');
    const pla = node.playerToMove;
    const sign = pla === BLACK ? 1 : -1;
    let totalChildWeight = 0;
    let policyProbMassVisited = 0;
    for (const e of edges){
        const child = e.child;
        if (!child) continue;
        const w = child.visits + child.inFlight;
        if (w <= 0) continue;
        totalChildWeight += w;
        policyProbMassVisited += e.prior;
    }
    const visits = node.visits;
    const weightSum = visits;
    const parentUtility = visits > 0 ? node.utilitySum / visits : 0;
    const parentUtilitySqAvg = visits > 0 ? node.utilitySqSum / visits : parentUtility * parentUtility;
    const variancePrior = CPUCT_UTILITY_STDEV_PRIOR * CPUCT_UTILITY_STDEV_PRIOR;
    const variancePriorWeight = CPUCT_UTILITY_STDEV_PRIOR_WEIGHT;
    let parentUtilityStdev;
    if (visits <= 0 || weightSum <= 1) {
        parentUtilityStdev = CPUCT_UTILITY_STDEV_PRIOR;
    } else {
        const utilitySq = parentUtility * parentUtility;
        let utilitySqAvg = parentUtilitySqAvg;
        if (utilitySqAvg < utilitySq) utilitySqAvg = utilitySq;
        parentUtilityStdev = Math.sqrt(Math.max(0, ((utilitySq + variancePrior) * variancePriorWeight + utilitySqAvg * weightSum) / (variancePriorWeight + weightSum - 1.0) - utilitySq));
    }
    const parentUtilityStdevFactor = 1.0 + CPUCT_UTILITY_STDEV_SCALE * (parentUtilityStdev / CPUCT_UTILITY_STDEV_PRIOR - 1.0);
    let parentUtilityForFPU = parentUtility;
    const parentNNUtility = node.nnUtility ?? parentUtility;
    if (FPU_PARENT_WEIGHT_BY_VISITED_POLICY) {
        const avgWeight = Math.min(1.0, Math.pow(policyProbMassVisited, FPU_PARENT_WEIGHT_BY_VISITED_POLICY_POW));
        parentUtilityForFPU = avgWeight * parentUtility + (1.0 - avgWeight) * parentNNUtility;
    } else if (FPU_PARENT_WEIGHT > 0.0) {
        parentUtilityForFPU = FPU_PARENT_WEIGHT * parentNNUtility + (1.0 - FPU_PARENT_WEIGHT) * parentUtility;
    }
    const fpuReductionMax = isRoot ? ROOT_FPU_REDUCTION_MAX : FPU_REDUCTION_MAX;
    const fpuLossProp = isRoot ? ROOT_FPU_LOSS_PROP : FPU_LOSS_PROP;
    const reduction = fpuReductionMax * Math.sqrt(Math.max(0, policyProbMassVisited));
    let fpuValue = pla === BLACK ? parentUtilityForFPU - reduction : parentUtilityForFPU + reduction;
    const utilityRadius = WIN_LOSS_UTILITY_FACTOR + STATIC_SCORE_UTILITY_FACTOR + DYNAMIC_SCORE_UTILITY_FACTOR;
    const lossValue = pla === BLACK ? -utilityRadius : utilityRadius;
    fpuValue = fpuValue + (lossValue - fpuValue) * fpuLossProp;
    const scaling = exploreScaling(totalChildWeight, parentUtilityStdevFactor);
    let bestEdge = edges[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    const applyWideRootNoise = isRoot && wideRootNoise > 0;
    const wideRootNoisePolicyExponent = applyWideRootNoise ? 1.0 / (4.0 * wideRootNoise + 1.0) : 1.0;
    for (const e of edges){
        const child = e.child;
        const childWeight = child ? child.visits + child.inFlight : 0;
        let childUtility = child && child.visits > 0 ? child.utilitySum / child.visits : fpuValue;
        let prior = e.prior;
        if (applyWideRootNoise) {
            prior = Math.pow(prior, wideRootNoisePolicyExponent);
            if (rand.nextBool(0.5)) {
                const bonus = wideRootNoise * Math.abs(rand.nextGaussian());
                childUtility += pla === BLACK ? bonus : -bonus;
            }
        }
        const explore = scaling * prior / (1.0 + childWeight);
        const score = explore + sign * childUtility;
        if (score > bestScore) {
            bestScore = score;
            bestEdge = e;
        }
    }
    return bestEdge;
}
function moveToGtp(move) {
    if (move === PASS_MOVE) return 'pass';
    const x = move % BOARD_SIZE;
    const y = move / BOARD_SIZE | 0;
    const col = x >= 8 ? x + 1 : x;
    const letter = String.fromCharCode(65 + col);
    return `${letter}${BOARD_SIZE - y}`;
}
function buildPv(edge, maxDepth) {
    const pvMoves = [
        edge.move
    ];
    let node = edge.child;
    let depth = 1;
    while(node && node.edges && node.edges.length > 0 && depth < maxDepth){
        let best = null;
        let bestVisits = 0;
        for (const e of node.edges){
            const v = e.child ? e.child.visits : 0;
            if (v > bestVisits) {
                bestVisits = v;
                best = e;
            }
        }
        if (!best || bestVisits <= 0) break;
        pvMoves.push(best.move);
        node = best.child;
        depth++;
    }
    return pvMoves.map(moveToGtp);
}
function getPvForEdge(edge, maxDepth) {
    const visits = edge.child?.visits ?? 0;
    const cache = edge.pvCache;
    if (cache && cache.visits === visits && cache.depth === maxDepth) return cache.pv;
    const pv = buildPv(edge, maxDepth);
    edge.pvCache = {
        visits,
        depth: maxDepth,
        pv
    };
    return pv;
}
const NUM_SYMMETRIES = 8;
let symPosMapBoardArea = 0;
let SYM_POS_MAP = new Int16Array(0);
const buildSymPosMap = ()=>{
    const n = BOARD_SIZE;
    const map = new Int16Array(NUM_SYMMETRIES * BOARD_AREA);
    for(let sym = 0; sym < NUM_SYMMETRIES; sym++){
        const symOff = sym * BOARD_AREA;
        const mirror = sym >= 4;
        const rot = sym & 3;
        for(let y = 0; y < n; y++){
            for(let x = 0; x < n; x++){
                const sx = mirror ? n - 1 - x : x;
                const sy = y;
                let tx;
                let ty;
                if (rot === 0) {
                    tx = sx;
                    ty = sy;
                } else if (rot === 1) {
                    tx = sy;
                    ty = n - 1 - sx;
                } else if (rot === 2) {
                    tx = n - 1 - sx;
                    ty = n - 1 - sy;
                } else {
                    tx = n - 1 - sy;
                    ty = sx;
                }
                map[symOff + y * n + x] = ty * n + tx;
            }
        }
    }
    return map;
};
const getSymPosMap = ()=>{
    const expectedSize = NUM_SYMMETRIES * BOARD_AREA;
    if (symPosMapBoardArea !== BOARD_AREA || SYM_POS_MAP.length !== expectedSize) {
        SYM_POS_MAP = buildSymPosMap();
        symPosMapBoardArea = BOARD_AREA;
    }
    return SYM_POS_MAP;
};
function clampRootSymmetrySamples(samples) {
    if (typeof samples !== 'number' || !Number.isFinite(samples)) return 1;
    return Math.max(1, Math.min(NUM_SYMMETRIES, Math.floor(samples)));
}
export function rootSymmetrySamplesForBackend(backend) {
    if (backend === 'webgpu') return NUM_SYMMETRIES;
    if (backend === 'wasm') return 4;
    return 1;
}
function averageRootEvals(evals, outputScaleMultiplier) {
    const first = evals[0];
    if (!first) throw new Error('No root evaluations to average');
    if (evals.length === 1) return first;
    const inv = 1.0 / evals.length;
    const symPosMap = getSymPosMap();
    const policyProbSums = new Float64Array(BOARD_AREA);
    const ownershipSums = first.ownership ? new Float64Array(BOARD_AREA) : null;
    let passProbSum = 0;
    let blackWinProb = 0;
    let blackScoreLead = 0;
    let blackScoreMean = 0;
    let blackScoreMeanSq = 0;
    let blackNoResultProb = 0;
    for (const ev of evals){
        const sym = ev.symmetry;
        const symOff = sym * BOARD_AREA;
        let maxLogit = ev.passLogit;
        for(let p = 0; p < BOARD_AREA; p++){
            const logit = ev.policy[p];
            if (logit > maxLogit) maxLogit = logit;
        }
        let probSum = Math.exp(ev.passLogit - maxLogit);
        for(let p = 0; p < BOARD_AREA; p++)probSum += Math.exp(ev.policy[p] - maxLogit);
        const probScale = inv / probSum;
        passProbSum += Math.exp(ev.passLogit - maxLogit) * probScale;
        for(let p = 0; p < BOARD_AREA; p++){
            const symPos = sym === 0 ? p : symPosMap[symOff + p];
            policyProbSums[p] += Math.exp(ev.policy[symPos] - maxLogit) * probScale;
            if (ownershipSums) {
                if (!ev.ownership) throw new Error('Missing ownership output');
                ownershipSums[p] += activatedOwnership(ev, symPos, outputScaleMultiplier) * inv;
            }
        }
        blackWinProb += ev.blackWinProb * inv;
        blackScoreLead += ev.blackScoreLead * inv;
        blackScoreMean += ev.blackScoreMean * inv;
        blackScoreMeanSq += (ev.blackScoreStdev * ev.blackScoreStdev + ev.blackScoreMean * ev.blackScoreMean) * inv;
        blackNoResultProb += ev.blackNoResultProb * inv;
    }
    const minPolicyProb = 1e-30;
    const policy = new Float32Array(BOARD_AREA);
    for(let p = 0; p < BOARD_AREA; p++)policy[p] = Math.log(Math.max(minPolicyProb, policyProbSums[p]));
    let ownership;
    if (ownershipSums) {
        ownership = new Float32Array(BOARD_AREA);
        for(let p = 0; p < BOARD_AREA; p++)ownership[p] = ownershipSums[p];
    }
    return {
        policy,
        symmetry: 0,
        passLogit: Math.log(Math.max(minPolicyProb, passProbSum)),
        blackWinProb,
        blackScoreLead,
        blackScoreMean,
        blackScoreStdev: Math.sqrt(Math.max(0, blackScoreMeanSq - blackScoreMean * blackScoreMean)),
        blackNoResultProb,
        libertyMap: new Uint8Array(first.libertyMap),
        areaMap: new Uint8Array(first.areaMap),
        ownership,
        ownershipIsActivated: ownership ? true : undefined
    };
}
async function evaluateRootEval(args) {
    const rootSymmetrySamples = clampRootSymmetrySamples(args.rootSymmetrySamples);
    if (rootSymmetrySamples <= 1) {
        return (await evaluateBatch({
            model: args.model,
            includeOwnership: args.includeOwnership,
            rules: args.rules,
            nnRandomize: false,
            policyOptimism: args.policyOptimism,
            komi: args.komi,
            states: [
                {
                    ...args.state,
                    symmetry: 0
                }
            ]
        }))[0];
    }
    const states = new Array(rootSymmetrySamples);
    for(let symmetry = 0; symmetry < rootSymmetrySamples; symmetry++){
        states[symmetry] = {
            ...args.state,
            symmetry
        };
    }
    return averageRootEvals(await evaluateBatch({
        model: args.model,
        includeOwnership: args.includeOwnership,
        rules: args.rules,
        nnRandomize: false,
        policyOptimism: args.policyOptimism,
        komi: args.komi,
        states
    }), args.outputScaleMultiplier);
}
let EMPTY_AREA_MAP = new Uint8Array(BOARD_AREA);
let evalScratchNoArea = null;
let evalScratchWithArea = null;
let evalScratchBoardArea = BOARD_AREA;
function getEvalScratch(args) {
    const { batch, includeAreaFeature } = args;
    if (evalScratchBoardArea !== BOARD_AREA) {
        evalScratchNoArea = null;
        evalScratchWithArea = null;
        evalScratchBoardArea = BOARD_AREA;
        EMPTY_AREA_MAP = new Uint8Array(BOARD_AREA);
    }
    const neededSpatial = batch * BOARD_AREA * 22;
    const neededGlobal = batch * 19;
    const neededMaps = batch * BOARD_AREA;
    const neededPolicy = batch * BOARD_AREA;
    const existing = includeAreaFeature ? evalScratchWithArea : evalScratchNoArea;
    if (existing && existing.spatialBatch.length >= neededSpatial && existing.globalBatch.length >= neededGlobal && existing.libertyMapScratch.length >= neededMaps && existing.symmetries.length >= batch && existing.policyScratch.length >= neededPolicy && existing.passScratch.length >= batch && (!includeAreaFeature || existing.areaMapScratch && existing.areaMapScratch.length >= neededMaps)) {
        return existing;
    }
    const scratch = {
        spatialBatch: new Float32Array(neededSpatial),
        globalBatch: new Float32Array(neededGlobal),
        libertyMapScratch: new Uint8Array(neededMaps),
        areaMapScratch: includeAreaFeature ? new Uint8Array(neededMaps) : null,
        ladderedStonesScratch: new Uint8Array(BOARD_AREA),
        ladderWorkingMovesScratch: new Uint8Array(BOARD_AREA),
        prevLadderedStonesScratch: new Uint8Array(BOARD_AREA),
        prevPrevLadderedStonesScratch: new Uint8Array(BOARD_AREA),
        symmetries: new Uint8Array(batch),
        spatialScratch: new Float32Array(BOARD_AREA * 22),
        globalScratch: new Float32Array(19),
        policyScratch: new Float32Array(neededPolicy),
        passScratch: new Float32Array(batch)
    };
    if (includeAreaFeature) evalScratchWithArea = scratch;
    else evalScratchNoArea = scratch;
    return scratch;
}
function activatedOwnership(ev, pos, outputScaleMultiplier) {
    const raw = ev.ownership[pos];
    return ev.ownershipIsActivated ? raw : Math.tanh(raw * outputScaleMultiplier);
}
async function evaluateBatch(args) {
    const { model, states } = args;
    const includeOwnership = args.includeOwnership === true;
    const rules = args.rules;
    const nnRandomize = args.nnRandomize;
    const policyOptimism = Math.max(0, Math.min(args.policyOptimism, 1));
    const includeAreaFeature = rules === 'chinese';
    const batch = states.length;
    const scratch = getEvalScratch({
        batch,
        includeAreaFeature
    });
    const spatialBatch = scratch.spatialBatch.subarray(0, batch * BOARD_AREA * 22);
    const globalBatch = scratch.globalBatch.subarray(0, batch * 19);
    const libertyMapScratch = scratch.libertyMapScratch.subarray(0, batch * BOARD_AREA);
    const areaMapScratch = includeAreaFeature ? scratch.areaMapScratch.subarray(0, batch * BOARD_AREA) : null;
    const symmetries = scratch.symmetries.subarray(0, batch);
    const spatialScratch = scratch.spatialScratch;
    const globalScratch = scratch.globalScratch;
    for(let i = 0; i < batch; i++){
        const state = states[i];
        const libertyMap = libertyMapScratch.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA);
        if (state.libertyMap) libertyMap.set(state.libertyMap);
        else computeLibertyMapInto(state.stones, libertyMap);
        const areaMap = includeAreaFeature ? computeAreaMapV7KataGoInto(state.stones, areaMapScratch.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA)) : EMPTY_AREA_MAP;
        if (hasLadderCandidates(libertyMap)) {
            computeLadderFeaturesV7KataGoInto({
                stones: state.stones,
                koPoint: state.koPoint,
                currentPlayer: playerToColor(state.currentPlayer),
                outLadderedStones: scratch.ladderedStonesScratch,
                outLadderWorkingMoves: scratch.ladderWorkingMovesScratch
            });
        } else {
            scratch.ladderedStonesScratch.fill(0);
            scratch.ladderWorkingMovesScratch.fill(0);
        }
        const recentMoves = state.recentMoves;
        const lastRecentMove = recentMoves.length > 0 ? recentMoves[recentMoves.length - 1] : null;
        const passWouldEndGame = lastRecentMove?.move === PASS_MOVE;
        const suppressHistory = state.conservativePassAndIsRoot === true && passWouldEndGame;
        const pla = state.currentPlayer;
        const opp = pla === 'black' ? 'white' : 'black';
        const expectedPlayers = [
            opp,
            pla,
            opp,
            pla,
            opp
        ];
        let numTurnsOfHistoryIncluded = 0;
        if (!suppressHistory) {
            for(let h = 0; h < 5; h++){
                const m = recentMoves[recentMoves.length - 1 - h];
                if (!m) break;
                if (m.player !== expectedPlayers[h]) break;
                numTurnsOfHistoryIncluded++;
            }
        }
        const prevLadderStones = numTurnsOfHistoryIncluded < 1 ? state.stones : state.prevStones;
        const prevLadderKoPoint = numTurnsOfHistoryIncluded < 1 ? state.koPoint : state.prevKoPoint;
        const prevPrevLadderStones = numTurnsOfHistoryIncluded < 2 ? prevLadderStones : state.prevPrevStones;
        const prevPrevLadderKoPoint = numTurnsOfHistoryIncluded < 2 ? prevLadderKoPoint : state.prevPrevKoPoint;
        const prevLibertyMap = prevLadderStones === state.stones ? libertyMap : state.prevLibertyMap;
        if (prevLibertyMap && !hasLadderCandidates(prevLibertyMap)) {
            scratch.prevLadderedStonesScratch.fill(0);
        } else {
            computeLadderedStonesV7KataGoInto({
                stones: prevLadderStones,
                koPoint: prevLadderKoPoint,
                outLadderedStones: scratch.prevLadderedStonesScratch
            });
        }
        const prevPrevLibertyMap = prevPrevLadderStones === prevLadderStones ? prevLibertyMap : state.prevPrevLibertyMap;
        if (prevPrevLibertyMap && !hasLadderCandidates(prevPrevLibertyMap)) {
            scratch.prevPrevLadderedStonesScratch.fill(0);
        } else {
            computeLadderedStonesV7KataGoInto({
                stones: prevPrevLadderStones,
                koPoint: prevPrevLadderKoPoint,
                outLadderedStones: scratch.prevPrevLadderedStonesScratch
            });
        }
        fillInputsV7Fast({
            stones: state.stones,
            koPoint: state.koPoint,
            currentPlayer: state.currentPlayer,
            recentMoves,
            komi: state.komi ?? args.komi,
            rules,
            conservativePassAndIsRoot: state.conservativePassAndIsRoot,
            libertyMap,
            areaMap: includeAreaFeature ? areaMap : undefined,
            ladderedStones: scratch.ladderedStonesScratch,
            ladderWorkingMoves: scratch.ladderWorkingMovesScratch,
            prevLadderedStones: scratch.prevLadderedStonesScratch,
            prevPrevLadderedStones: scratch.prevPrevLadderedStonesScratch,
            outSpatial: spatialScratch,
            outGlobal: globalScratch
        });
        const requestedSymmetry = state.symmetry;
        const sym = typeof requestedSymmetry === 'number' && Number.isFinite(requestedSymmetry) ? Math.max(0, Math.min(NUM_SYMMETRIES - 1, Math.floor(requestedSymmetry))) : nnRandomize ? Math.random() * NUM_SYMMETRIES | 0 : 0;
        symmetries[i] = sym;
        const spatialOffset = i * BOARD_AREA * 22;
        if (sym === 0) {
            spatialBatch.set(spatialScratch, spatialOffset);
        } else {
            const symOff = sym * BOARD_AREA;
            const symPosMap = getSymPosMap();
            const src = spatialScratch;
            for(let pos = 0; pos < BOARD_AREA; pos++){
                const dstPos = symPosMap[symOff + pos];
                const srcBase = pos * 22;
                const dstBase = spatialOffset + dstPos * 22;
                for(let c = 0; c < 22; c++){
                    spatialBatch[dstBase + c] = src[srcBase + c];
                }
            }
        }
        globalBatch.set(globalScratch, i * 19);
    }
    const spatialTensor = tf.tensor4d(spatialBatch, [
        batch,
        BOARD_SIZE,
        BOARD_SIZE,
        22
    ]);
    const globalTensor = tf.tensor2d(globalBatch, [
        batch,
        19
    ]);
    const out = includeOwnership ? model.forward(spatialTensor, globalTensor) : model.forwardPolicyValue(spatialTensor, globalTensor);
    const ownershipPromise = includeOwnership && hasOwnership(out) ? out.ownership.data() : Promise.resolve(null);
    const [policyArr, passArr, valueArr, scoreArr, ownershipArr] = await Promise.all([
        out.policy.data(),
        out.policyPass.data(),
        out.value.data(),
        out.scoreValue.data(),
        ownershipPromise
    ]);
    spatialTensor.dispose();
    globalTensor.dispose();
    out.policy.dispose();
    out.policyPass.dispose();
    out.value.dispose();
    out.scoreValue.dispose();
    if (hasOwnership(out)) out.ownership.dispose();
    const policyChannels = model.policyOutChannels;
    const usePolicyOptimism = policyChannels === 2 || policyChannels === 4 && model.modelVersion >= 16;
    const mix = usePolicyOptimism ? policyOptimism : 0;
    let policyLogits = policyArr;
    let passLogits = passArr;
    if (policyChannels > 1) {
        const mixedPolicy = scratch.policyScratch.subarray(0, batch * BOARD_AREA);
        const mixedPass = scratch.passScratch.subarray(0, batch);
        for(let i = 0; i < batch; i++){
            const baseOff = i * BOARD_AREA * policyChannels;
            const outOff = i * BOARD_AREA;
            for(let p = 0; p < BOARD_AREA; p++){
                const src = baseOff + p * policyChannels;
                const base = policyArr[src];
                const opt = policyArr[src + 1];
                mixedPolicy[outOff + p] = base + (opt - base) * mix;
            }
            const passBase = passArr[i * policyChannels];
            const passOpt = passArr[i * policyChannels + 1];
            mixedPass[i] = passBase + (passOpt - passBase) * mix;
        }
        policyLogits = mixedPolicy;
        passLogits = mixedPass;
    }
    const results = [];
    for(let i = 0; i < batch; i++){
        const pOff = i * BOARD_AREA;
        const sym = symmetries[i];
        const policy = policyLogits.subarray(pOff, pOff + BOARD_AREA);
        const ownership = includeOwnership ? ownershipArr.subarray(pOff, pOff + BOARD_AREA) : undefined;
        const passLogit = passLogits[i];
        const vOff = i * 3;
        const sOff = i * 4;
        const evaled = postprocessKataGoV8({
            nextPlayer: states[i].currentPlayer,
            valueLogits: valueArr.subarray(vOff, vOff + 3),
            scoreValue: scoreArr.subarray(sOff, sOff + 4),
            postProcessParams: model.postProcessParams
        });
        results.push({
            policy,
            symmetry: sym,
            passLogit,
            blackWinProb: evaled.blackWinProb,
            blackScoreLead: evaled.blackScoreLead,
            blackScoreMean: evaled.blackScoreMean,
            blackScoreStdev: evaled.blackScoreStdev,
            blackNoResultProb: evaled.blackNoResultProb,
            libertyMap: libertyMapScratch.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA),
            areaMap: includeAreaFeature ? areaMapScratch.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA) : EMPTY_AREA_MAP,
            ownership
        });
    }
    return results;
}
export class MctsSearch {
    model;
    ownershipMode;
    maxChildren;
    currentPlayer;
    komi;
    rules;
    nnRandomize;
    conservativePass;
    wideRootNoise;
    rootSymmetrySamples;
    outputScaleMultiplier;
    rootStones;
    rootKoPoint;
    rootPrevStones;
    rootPrevKoPoint;
    rootMoves;
    rootLibertyMap;
    rootPrevLibertyMap;
    rootNode;
    rootPolicy;
    rootOwnership;
    recentScoreCenter;
    rand;
    rootSelfValue;
    rootSelfScoreLead;
    rootSelfScoreMean;
    rootSelfScoreMeanSq;
    rootSelfUtility;
    jobStonesScratch = new Uint8Array(0);
    jobPrevStonesScratch = new Uint8Array(0);
    jobPrevPrevStonesScratch = new Uint8Array(0);
    jobLibertyMapScratch = new Uint8Array(0);
    jobPrevLibertyMapScratch = new Uint8Array(0);
    jobPrevPrevLibertyMapScratch = new Uint8Array(0);
    jobRecentMovesScratch = [];
    libertyMapStack = [];
    libertySeedsScratch = new Int16Array(BOARD_AREA * 5);
    treeOwnershipCache = null;
    constructor(args){
        this.model = args.model;
        this.ownershipMode = args.ownershipMode;
        this.maxChildren = args.maxChildren;
        this.currentPlayer = args.currentPlayer;
        this.komi = args.komi;
        this.rules = args.rules;
        this.nnRandomize = args.nnRandomize;
        this.conservativePass = args.conservativePass;
        this.wideRootNoise = args.wideRootNoise;
        this.rootSymmetrySamples = args.rootSymmetrySamples;
        this.rootStones = args.rootStones;
        this.rootKoPoint = args.rootKoPoint;
        this.rootPrevStones = args.rootPrevStones;
        this.rootPrevKoPoint = args.rootPrevKoPoint;
        this.rootMoves = args.rootMoves;
        this.rootNode = args.rootNode;
        this.rootLibertyMap = args.rootLibertyMap;
        this.rootPrevLibertyMap = args.rootPrevLibertyMap;
        this.rootPolicy = args.rootPolicy;
        this.rootOwnership = args.rootOwnership;
        this.recentScoreCenter = args.recentScoreCenter;
        this.rand = args.rand;
        this.outputScaleMultiplier = args.outputScaleMultiplier;
        this.rootSelfValue = args.rootSelfValue;
        this.rootSelfScoreLead = args.rootSelfScoreLead;
        this.rootSelfScoreMean = args.rootSelfScoreMean;
        this.rootSelfScoreMeanSq = args.rootSelfScoreMeanSq;
        this.rootSelfUtility = args.rootSelfUtility;
    }
    static async create(args) {
        const outputScaleMultiplier = args.model.postProcessParams?.outputScaleMultiplier ?? 1.0;
        const rootSymmetrySamples = clampRootSymmetrySamples(args.rootSymmetrySamples);
        const rootStones = boardStateToStones(args.board);
        const rootKoPoint = computeKoPointFromPrevious({
            board: args.board,
            previousBoard: args.previousBoard,
            moveHistory: args.moveHistory
        });
        const rootPrevStones = args.previousBoard ? boardStateToStones(args.previousBoard) : rootStones;
        const rootPrevKoPoint = computeKoPointAfterMove(args.previousPreviousBoard, args.moveHistory.length >= 2 ? args.moveHistory[args.moveHistory.length - 2] : null);
        const rootPrevPrevStones = args.previousPreviousBoard ? boardStateToStones(args.previousPreviousBoard) : rootPrevStones;
        const rootPrevPrevKoPoint = -1;
        const rootMoves = args.moveHistory.map((m)=>({
                move: m.x < 0 || m.y < 0 ? PASS_MOVE : m.y * BOARD_SIZE + m.x,
                player: m.player
            }));
        const rootNode = new Node(playerToColor(args.currentPlayer));
        const { rootLibertyMap, rootOwnership, rootPolicy, rootValue, rootScoreLead, rootScoreMean, rootScoreMeanSq, rootUtility, recentScoreCenter } = await buildRootEval({
            model: args.model,
            ownershipMode: args.ownershipMode,
            rules: args.rules,
            rootSymmetrySamples,
            komi: args.komi,
            currentPlayer: args.currentPlayer,
            conservativePass: args.conservativePass,
            rootStones,
            rootKoPoint,
            rootPrevStones,
            rootPrevKoPoint,
            rootPrevPrevStones,
            rootPrevPrevKoPoint,
            rootMoves,
            maxChildren: args.maxChildren,
            regionOfInterest: args.regionOfInterest,
            outputScaleMultiplier,
            node: rootNode
        });
        rootNode.ownership = rootOwnership;
        rootNode.visits = 1;
        rootNode.valueSum = rootValue;
        rootNode.scoreLeadSum = rootScoreLead;
        rootNode.scoreMeanSum = rootScoreMean;
        rootNode.scoreMeanSqSum = rootScoreMeanSq;
        rootNode.utilitySum = rootUtility;
        rootNode.utilitySqSum = rootUtility * rootUtility;
        rootNode.nnUtility = rootUtility;
        const rootPrevLibertyMap = rootPrevStones === rootStones ? rootLibertyMap : computeLibertyMapInto(rootPrevStones, new Uint8Array(BOARD_AREA));
        return new MctsSearch({
            model: args.model,
            ownershipMode: args.ownershipMode,
            maxChildren: args.maxChildren,
            currentPlayer: args.currentPlayer,
            komi: args.komi,
            rules: args.rules,
            nnRandomize: args.nnRandomize,
            conservativePass: args.conservativePass,
            wideRootNoise: args.wideRootNoise,
            rootSymmetrySamples,
            rootStones,
            rootKoPoint,
            rootPrevStones,
            rootPrevKoPoint,
            rootMoves,
            rootNode,
            rootLibertyMap,
            rootPrevLibertyMap,
            rootPolicy,
            rootOwnership,
            recentScoreCenter,
            rand: new Rand(),
            outputScaleMultiplier,
            rootSelfValue: rootValue,
            rootSelfScoreLead: rootScoreLead,
            rootSelfScoreMean: rootScoreMean,
            rootSelfScoreMeanSq: rootScoreMeanSq,
            rootSelfUtility: rootUtility
        });
    }
    async reRootToChild(args) {
        const edges = this.rootNode.edges;
        if (!edges || edges.length === 0) return false;
        const target = edges.find((edge)=>edge.move === args.move);
        if (!target?.child) return false;
        const child = target.child;
        if (child.playerToMove !== playerToColor(args.currentPlayer)) return false;
        const rootStones = boardStateToStones(args.board);
        const rootKoPoint = computeKoPointFromPrevious({
            board: args.board,
            previousBoard: args.previousBoard,
            moveHistory: args.moveHistory
        });
        const rootPrevStones = args.previousBoard ? boardStateToStones(args.previousBoard) : rootStones;
        const rootPrevKoPoint = computeKoPointAfterMove(args.previousPreviousBoard, args.moveHistory.length >= 2 ? args.moveHistory[args.moveHistory.length - 2] : null);
        const rootPrevPrevStones = args.previousPreviousBoard ? boardStateToStones(args.previousPreviousBoard) : rootPrevStones;
        const rootPrevPrevKoPoint = -1;
        const rootMoves = args.moveHistory.map((m)=>({
                move: m.x < 0 || m.y < 0 ? PASS_MOVE : m.y * BOARD_SIZE + m.x,
                player: m.player
            }));
        const shouldExpandRoot = !child.edges || child.edges.length === 0;
        const { rootLibertyMap, rootOwnership, rootPolicy, rootValue, rootScoreLead, rootScoreMean, rootScoreMeanSq, rootUtility, recentScoreCenter } = await buildRootEval({
            model: this.model,
            ownershipMode: this.ownershipMode,
            rules: args.rules,
            rootSymmetrySamples: this.rootSymmetrySamples,
            komi: args.komi,
            currentPlayer: args.currentPlayer,
            conservativePass: this.conservativePass,
            rootStones,
            rootKoPoint,
            rootPrevStones,
            rootPrevKoPoint,
            rootPrevPrevStones,
            rootPrevPrevKoPoint,
            rootMoves,
            maxChildren: this.maxChildren,
            regionOfInterest: args.regionOfInterest,
            outputScaleMultiplier: this.outputScaleMultiplier,
            node: child,
            preserveExistingChildren: !shouldExpandRoot
        });
        const rootPrevLibertyMap = rootPrevStones === rootStones ? rootLibertyMap : computeLibertyMapInto(rootPrevStones, new Uint8Array(BOARD_AREA));
        if (shouldExpandRoot) {
            child.visits = 1;
            child.valueSum = rootValue;
            child.scoreLeadSum = rootScoreLead;
            child.scoreMeanSum = rootScoreMean;
            child.scoreMeanSqSum = rootScoreMeanSq;
            child.utilitySum = rootUtility;
            child.utilitySqSum = rootUtility * rootUtility;
        }
        child.nnUtility = rootUtility;
        child.pendingEval = false;
        child.inFlight = 0;
        child.ownership = rootOwnership;
        this.rootNode = child;
        this.rootStones = rootStones;
        this.rootKoPoint = rootKoPoint;
        this.rootPrevStones = rootPrevStones;
        this.rootPrevKoPoint = rootPrevKoPoint;
        this.rootMoves = rootMoves;
        this.rootLibertyMap = rootLibertyMap;
        this.rootPrevLibertyMap = rootPrevLibertyMap;
        this.rootPolicy = rootPolicy;
        this.rootOwnership = rootOwnership;
        this.recentScoreCenter = recentScoreCenter;
        this.rootSelfValue = rootValue;
        this.rootSelfScoreLead = rootScoreLead;
        this.rootSelfScoreMean = rootScoreMean;
        this.rootSelfScoreMeanSq = rootScoreMeanSq;
        this.rootSelfUtility = rootUtility;
        this.currentPlayer = args.currentPlayer;
        this.treeOwnershipCache = null;
        return true;
    }
    async run(args) {
        const maxVisits = Math.max(16, Math.min(args.visits, ENGINE_MAX_VISITS));
        const maxTimeMs = Math.max(25, Math.min(args.maxTimeMs, ENGINE_MAX_TIME_MS));
        const batchSize = Math.max(1, Math.min(args.batchSize, 64));
        const shouldAbort = args.shouldAbort;
        if (shouldAbort?.()) return true;
        if (this.rootNode.visits >= maxVisits) return shouldAbort?.() ?? false;
        const neededBoardCapacity = batchSize * BOARD_AREA;
        if (this.jobStonesScratch.length < neededBoardCapacity) this.jobStonesScratch = new Uint8Array(neededBoardCapacity);
        if (this.jobPrevStonesScratch.length < neededBoardCapacity) this.jobPrevStonesScratch = new Uint8Array(neededBoardCapacity);
        if (this.jobPrevPrevStonesScratch.length < neededBoardCapacity) this.jobPrevPrevStonesScratch = new Uint8Array(neededBoardCapacity);
        if (this.jobLibertyMapScratch.length < neededBoardCapacity) this.jobLibertyMapScratch = new Uint8Array(neededBoardCapacity);
        if (this.jobPrevLibertyMapScratch.length < neededBoardCapacity) this.jobPrevLibertyMapScratch = new Uint8Array(neededBoardCapacity);
        if (this.jobPrevPrevLibertyMapScratch.length < neededBoardCapacity) this.jobPrevPrevLibertyMapScratch = new Uint8Array(neededBoardCapacity);
        const sim = {
            stones: this.rootStones.slice(),
            koPoint: this.rootKoPoint
        };
        const captureStack = [];
        const undoMoves = [];
        const undoPlayers = [];
        const undoSnapshots = [];
        const pathMoves = [];
        const libertyMapStack = this.libertyMapStack;
        libertyMapStack[0] = this.rootLibertyMap;
        const libertySeedsScratch = this.libertySeedsScratch;
        const deadline = getAnimationNow() + maxTimeMs;
        let timeCheckCounter = 0;
        const timeCheckMask = 0x1f;
        const timeExceeded = ()=>{
            if ((timeCheckCounter++ & timeCheckMask) !== 0) return false;
            return getAnimationNow() >= deadline;
        };
        while(this.rootNode.visits < maxVisits && !timeExceeded()){
            if (shouldAbort?.()) return true;
            const jobs = [];
            let attempts = 0;
            while(jobs.length < batchSize && this.rootNode.visits + jobs.length < maxVisits && !timeExceeded()){
                if (shouldAbort?.()) break;
                attempts++;
                if (attempts > batchSize * 8) break;
                undoMoves.length = 0;
                undoPlayers.length = 0;
                undoSnapshots.length = 0;
                pathMoves.length = 0;
                sim.stones.set(this.rootStones);
                sim.koPoint = this.rootKoPoint;
                libertyMapStack[0] = this.rootLibertyMap;
                let depth = 0;
                const path = [
                    this.rootNode
                ];
                let node = this.rootNode;
                let player = this.rootNode.playerToMove;
                while(node.edges && node.edges.length > 0){
                    const e = selectEdge(node, node === this.rootNode, this.wideRootNoise, this.rand);
                    const move = e.move;
                    const snapshot = playMove(sim, move, player, captureStack);
                    undoMoves.push(move);
                    undoPlayers.push(player);
                    undoSnapshots.push(snapshot);
                    const prevLibertyMap = libertyMapStack[depth] ?? this.rootLibertyMap;
                    let nextLibertyMap = libertyMapStack[depth + 1];
                    if (!nextLibertyMap) nextLibertyMap = new Uint8Array(BOARD_AREA);
                    nextLibertyMap.set(prevLibertyMap);
                    const seedCount = buildLibertySeeds({
                        move,
                        captureStack,
                        captureStart: snapshot.captureStart,
                        out: libertySeedsScratch
                    });
                    if (seedCount > 0) {
                        updateLibertyMapForSeeds(sim.stones, libertySeedsScratch, seedCount, nextLibertyMap);
                    }
                    libertyMapStack[depth + 1] = nextLibertyMap;
                    depth++;
                    const pathIdx = pathMoves.length;
                    const pathPlayer = colorToPlayer(player);
                    let pathEntry = pathMoves[pathIdx];
                    if (!pathEntry) {
                        pathEntry = {
                            move,
                            player: pathPlayer
                        };
                        pathMoves[pathIdx] = pathEntry;
                    } else {
                        pathEntry.move = move;
                        pathEntry.player = pathPlayer;
                    }
                    pathMoves.length = pathIdx + 1;
                    if (!e.child) e.child = new Node(opponentOf(player));
                    node = e.child;
                    player = node.playerToMove;
                    path.push(node);
                    if (!node.edges) break;
                }
                if (node.pendingEval) {
                    for(let i = undoMoves.length - 1; i >= 0; i--){
                        undoMove(sim, undoMoves[i], undoPlayers[i], undoSnapshots[i], captureStack);
                    }
                    continue;
                }
                node.pendingEval = true;
                for (const n of path)n.inFlight++;
                const jobIdx = jobs.length;
                const leafStones = this.jobStonesScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
                leafStones.set(sim.stones);
                const leafKoPoint = sim.koPoint;
                let prevStones = leafStones;
                let prevKoPoint = leafKoPoint;
                let prevPrevStones = leafStones;
                let prevPrevKoPoint = leafKoPoint;
                const leafPlayer = colorToPlayer(player);
                const leafDepth = depth;
                const leafLibertyMap = libertyMapStack[leafDepth] ?? this.rootLibertyMap;
                const leafLibertyBuf = this.jobLibertyMapScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
                leafLibertyBuf.set(leafLibertyMap);
                let prevLibertyMap;
                let prevPrevLibertyMap;
                if (leafDepth >= 1) {
                    const prevLiberty = libertyMapStack[leafDepth - 1] ?? this.rootLibertyMap;
                    const prevLibertyBuf = this.jobPrevLibertyMapScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
                    prevLibertyBuf.set(prevLiberty);
                    prevLibertyMap = prevLibertyBuf;
                    if (leafDepth >= 2) {
                        const prevPrevLiberty = libertyMapStack[leafDepth - 2];
                        if (prevPrevLiberty) {
                            const prevPrevLibertyBuf = this.jobPrevPrevLibertyMapScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
                            prevPrevLibertyBuf.set(prevPrevLiberty);
                            prevPrevLibertyMap = prevPrevLibertyBuf;
                        }
                    } else {
                        const prevPrevLibertyBuf = this.jobPrevPrevLibertyMapScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
                        prevPrevLibertyBuf.set(this.rootPrevLibertyMap);
                        prevPrevLibertyMap = prevPrevLibertyBuf;
                    }
                }
                if (undoMoves.length >= 1) {
                    const lastIdx = undoMoves.length - 1;
                    undoMove(sim, undoMoves[lastIdx], undoPlayers[lastIdx], undoSnapshots[lastIdx], captureStack);
                    if (lastIdx === 0) {
                        prevStones = this.rootStones;
                        prevKoPoint = this.rootKoPoint;
                        prevPrevStones = this.rootPrevStones;
                        prevPrevKoPoint = this.rootPrevKoPoint;
                    } else {
                        const prevBuf = this.jobPrevStonesScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
                        prevBuf.set(sim.stones);
                        prevStones = prevBuf;
                        prevKoPoint = sim.koPoint;
                        const secondIdx = undoMoves.length - 2;
                        undoMove(sim, undoMoves[secondIdx], undoPlayers[secondIdx], undoSnapshots[secondIdx], captureStack);
                        if (secondIdx === 0) {
                            prevPrevStones = this.rootStones;
                            prevPrevKoPoint = this.rootKoPoint;
                        } else {
                            const prevPrevBuf = this.jobPrevPrevStonesScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
                            prevPrevBuf.set(sim.stones);
                            prevPrevStones = prevPrevBuf;
                            prevPrevKoPoint = sim.koPoint;
                        }
                        for(let i = secondIdx - 1; i >= 0; i--){
                            undoMove(sim, undoMoves[i], undoPlayers[i], undoSnapshots[i], captureStack);
                        }
                    }
                }
                const recentMovesScratch = this.jobRecentMovesScratch[jobIdx] ?? (this.jobRecentMovesScratch[jobIdx] = []);
                jobs.push({
                    leaf: node,
                    path,
                    stones: leafStones,
                    koPoint: leafKoPoint,
                    libertyMap: leafLibertyBuf,
                    prevStones,
                    prevKoPoint,
                    prevLibertyMap,
                    prevPrevStones,
                    prevPrevKoPoint,
                    prevPrevLibertyMap,
                    currentPlayer: leafPlayer,
                    recentMoves: takeRecentMoves(this.rootMoves, pathMoves, 5, recentMovesScratch)
                });
            }
            if (jobs.length === 0) break;
            const includeOwnership = this.ownershipMode === 'tree';
            const evals = await evaluateBatch({
                model: this.model,
                includeOwnership,
                rules: this.rules,
                nnRandomize: this.nnRandomize,
                policyOptimism: POLICY_OPTIMISM,
                komi: this.komi,
                states: jobs
            });
            timeCheckCounter = 0;
            for(let i = 0; i < jobs.length; i++){
                const job = jobs[i];
                const ev = evals[i];
                if (includeOwnership) {
                    if (!ev.ownership) throw new Error('Missing ownership output');
                    const ownershipSign = job.currentPlayer === 'black' ? 1 : -1;
                    const own = new Float32Array(BOARD_AREA);
                    const sym = ev.symmetry;
                    const symOff = sym * BOARD_AREA;
                    const symPosMap = sym === 0 ? null : getSymPosMap();
                    for(let p = 0; p < BOARD_AREA; p++){
                        const symPos = sym === 0 ? p : symPosMap[symOff + p];
                        own[p] = ownershipSign * Math.tanh(ev.ownership[symPos] * this.outputScaleMultiplier);
                    }
                    job.leaf.ownership = own;
                }
                expandNode({
                    node: job.leaf,
                    stones: job.stones,
                    koPoint: job.koPoint,
                    policyLogits: ev.policy,
                    policyLogitsSymmetry: ev.symmetry,
                    passLogit: ev.passLogit,
                    maxChildren: this.maxChildren,
                    libertyMap: ev.libertyMap,
                    policyOutputScaling: this.outputScaleMultiplier
                });
                const leafValue = 2 * ev.blackWinProb - 1;
                const leafUtility = computeBlackUtilityFromEval({
                    blackWinProb: ev.blackWinProb,
                    blackNoResultProb: ev.blackNoResultProb,
                    blackScoreMean: ev.blackScoreMean,
                    blackScoreStdev: ev.blackScoreStdev,
                    recentScoreCenter: this.recentScoreCenter
                });
                job.leaf.nnUtility = leafUtility;
                for (const n of job.path){
                    n.visits += 1;
                    n.valueSum += leafValue;
                    n.scoreLeadSum += ev.blackScoreLead;
                    n.scoreMeanSum += ev.blackScoreMean;
                    n.scoreMeanSqSum += ev.blackScoreStdev * ev.blackScoreStdev + ev.blackScoreMean * ev.blackScoreMean;
                    n.utilitySum += leafUtility;
                    n.utilitySqSum += leafUtility * leafUtility;
                    n.inFlight -= 1;
                }
                job.leaf.pendingEval = false;
            }
            if (shouldAbort?.()) return true;
        }
        return shouldAbort?.() ?? false;
    }
    getAnalysis(args) {
        const topK = Math.max(1, Math.min(args.topK, 50));
        const includeMovesOwnership = args.includeMovesOwnership === true;
        const cloneBuffers = args.cloneBuffers !== false;
        const analysisPvLen = Math.max(0, Math.min(args.analysisPvLen, 60));
        const pvDepth = 1 + analysisPvLen;
        const edges = this.rootNode.edges ?? [];
        const EMPTY_PV = [];
        const childStats = [];
        const topMoves = [];
        let orderIndex = 0;
        let minIdx = -1;
        const isBetter = (a, b)=>a.visits > b.visits || a.visits === b.visits && a.orderIndex < b.orderIndex;
        const isWorse = (a, b)=>a.visits < b.visits || a.visits === b.visits && a.orderIndex > b.orderIndex;
        const updateMinIdx = ()=>{
            minIdx = 0;
            for(let i = 1; i < topMoves.length; i++){
                if (isWorse(topMoves[i], topMoves[minIdx])) minIdx = i;
            }
        };
        for (const e of edges){
            const child = e.child;
            if (!child || child.visits <= 0) continue;
            const q = child.valueSum / child.visits;
            const winRate = (q + 1) * 0.5;
            const scoreLead = child.scoreLeadSum / child.visits;
            const scoreSelfplay = child.scoreMeanSum / child.visits;
            const scoreMeanSq = child.scoreMeanSqSum / child.visits;
            const scoreStdev = Math.sqrt(Math.max(0, scoreMeanSq - scoreSelfplay * scoreSelfplay));
            const utility = child.utilitySum / child.visits;
            childStats.push({
                weightAdjusted: child.visits,
                selfUtility: utility,
                policy: e.prior,
                value: q,
                scoreLead,
                scoreMean: scoreSelfplay,
                scoreMeanSq
            });
            const row = {
                edge: e,
                move: e.move,
                visits: child.visits,
                winRate,
                scoreLead,
                scoreSelfplay,
                scoreStdev,
                prior: e.prior,
                pv: EMPTY_PV,
                orderIndex: orderIndex++
            };
            if (topMoves.length < topK) {
                topMoves.push(row);
                if (topMoves.length === topK) updateMinIdx();
            } else if (minIdx >= 0 && isBetter(row, topMoves[minIdx])) {
                topMoves[minIdx] = row;
                updateMinIdx();
            }
        }
        topMoves.sort((a, b)=>{
            const diff = b.visits - a.visits;
            if (diff !== 0) return diff;
            return a.orderIndex - b.orderIndex;
        });
        for (const row of topMoves)row.pv = getPvForEdge(row.edge, pvDepth);
        const rootStats = computeWeightedRootStats({
            children: childStats,
            rootSelf: {
                value: this.rootSelfValue,
                scoreLead: this.rootSelfScoreLead,
                scoreMean: this.rootSelfScoreMean,
                scoreMeanSq: this.rootSelfScoreMeanSq,
                utility: this.rootSelfUtility,
                weight: 1
            }
        });
        const rootWinRate = rootStats.rootWinRate;
        const rootScoreLead = rootStats.rootScoreLead;
        const rootScoreSelfplay = rootStats.rootScoreSelfplay;
        const rootScoreStdev = rootStats.rootScoreStdev;
        const best = topMoves[0] ?? null;
        const bestScoreLead = best ? best.scoreLead : rootScoreLead;
        const sign = this.currentPlayer === 'black' ? 1 : -1;
        const moves = topMoves.map((m, i)=>{
            const pointsLost = sign * (rootScoreLead - m.scoreLead);
            const relativePointsLost = sign * (bestScoreLead - m.scoreLead);
            const winRateLost = sign * (rootWinRate - m.winRate);
            const x = m.move === PASS_MOVE ? -1 : m.move % BOARD_SIZE;
            const y = m.move === PASS_MOVE ? -1 : m.move / BOARD_SIZE | 0;
            return {
                x,
                y,
                winRate: m.winRate,
                winRateLost,
                scoreLead: m.scoreLead,
                scoreSelfplay: m.scoreSelfplay,
                scoreStdev: m.scoreStdev,
                visits: m.visits,
                pointsLost,
                relativePointsLost,
                order: i,
                prior: m.prior,
                pv: m.pv,
                ownership: includeMovesOwnership && m.edge.child?.ownership ? cloneBuffers ? new Float32Array(m.edge.child.ownership) : m.edge.child.ownership : undefined
            };
        });
        let ownership;
        let ownershipStdev;
        if (this.ownershipMode === 'tree') {
            const visits = this.rootNode.visits;
            let cached = this.treeOwnershipCache;
            const refreshIntervalMs = args.ownershipRefreshIntervalMs ?? 0;
            const now = getAnimationNow();
            if (!cached) {
                cached = {
                    visits,
                    timestamp: now,
                    ...averageTreeOwnership(this.rootNode)
                };
                this.treeOwnershipCache = cached;
            } else if (cached.visits !== visits && (refreshIntervalMs <= 0 || now - cached.timestamp >= refreshIntervalMs)) {
                cached = {
                    visits,
                    timestamp: now,
                    ...averageTreeOwnership(this.rootNode)
                };
                this.treeOwnershipCache = cached;
            }
            ownership = cloneBuffers ? new Float32Array(cached.ownership) : cached.ownership;
            ownershipStdev = cloneBuffers ? new Float32Array(cached.ownershipStdev) : cached.ownershipStdev;
        } else {
            ownership = cloneBuffers ? new Float32Array(this.rootOwnership) : this.rootOwnership;
            ownershipStdev = new Float32Array(BOARD_AREA);
        }
        const policyOut = cloneBuffers ? new Float32Array(this.rootPolicy) : this.rootPolicy;
        return {
            rootWinRate,
            rootScoreLead,
            rootScoreSelfplay,
            rootScoreStdev,
            rootVisits: this.rootNode.visits,
            ownership,
            ownershipStdev,
            policy: policyOut,
            moves
        };
    }
}
export async function analyzeMcts(args) {
    const outputScaleMultiplier = args.model.postProcessParams?.outputScaleMultiplier ?? 1.0;
    const maxVisits = Math.max(16, Math.min(args.visits ?? 256, ENGINE_MAX_VISITS));
    const maxTimeMs = Math.max(25, Math.min(args.maxTimeMs ?? 800, ENGINE_MAX_TIME_MS));
    const batchSize = Math.max(1, Math.min(args.batchSize ?? (tf.getBackend() === 'webgpu' ? 16 : 4), 64));
    const maxChildren = Math.max(4, Math.min(args.maxChildren ?? 64, 361));
    const topK = Math.max(1, Math.min(args.topK ?? 10, 50));
    const analysisPvLen = Math.max(0, Math.min(args.analysisPvLen ?? 15, 60));
    const wideRootNoise = Math.max(0, Math.min(args.wideRootNoise ?? 0.04, 5));
    const rules = args.rules ?? 'japanese';
    const nnRandomize = args.nnRandomize !== false;
    const rootSymmetrySamples = clampRootSymmetrySamples(args.rootSymmetrySamples ?? rootSymmetrySamplesForBackend(tf.getBackend()));
    const pvDepth = 1 + analysisPvLen;
    const rand = new Rand();
    const rootStones = boardStateToStones(args.board);
    const rootKoPoint = computeKoPointFromPrevious({
        board: args.board,
        previousBoard: args.previousBoard,
        moveHistory: args.moveHistory
    });
    const rootPrevStones = args.previousBoard ? boardStateToStones(args.previousBoard) : rootStones;
    const rootPrevKoPoint = computeKoPointAfterMove(args.previousPreviousBoard, args.moveHistory.length >= 2 ? args.moveHistory[args.moveHistory.length - 2] : null);
    const rootPrevPrevStones = args.previousPreviousBoard ? boardStateToStones(args.previousPreviousBoard) : rootPrevStones;
    const rootPrevPrevKoPoint = -1;
    const rootMoves = args.moveHistory.map((m)=>({
            move: m.x < 0 || m.y < 0 ? PASS_MOVE : m.y * BOARD_SIZE + m.x,
            player: m.player
        }));
    const rootPos = {
        stones: rootStones.slice(),
        koPoint: rootKoPoint
    };
    const rootNode = new Node(playerToColor(args.currentPlayer));
    const rootEval = await evaluateRootEval({
        model: args.model,
        includeOwnership: true,
        rules,
        rootSymmetrySamples,
        policyOptimism: ROOT_POLICY_OPTIMISM,
        komi: args.komi,
        outputScaleMultiplier,
        state: {
            stones: rootPos.stones,
            koPoint: rootPos.koPoint,
            prevStones: rootPrevStones,
            prevKoPoint: rootPrevKoPoint,
            prevPrevStones: rootPrevPrevStones,
            prevPrevKoPoint: rootPrevPrevKoPoint,
            currentPlayer: args.currentPlayer,
            recentMoves: takeRecentMoves(rootMoves, [], 5)
        }
    });
    if (!rootEval.ownership) throw new Error('Missing ownership output');
    const rootOwnershipSign = args.currentPlayer === 'black' ? 1 : -1;
    const rootOwnership = new Float32Array(BOARD_AREA);
    const rootSym = rootEval.symmetry;
    const rootSymOff = rootSym * BOARD_AREA;
    const symPosMap = rootSym === 0 ? null : getSymPosMap();
    for(let i = 0; i < BOARD_AREA; i++){
        const symPos = rootSym === 0 ? i : symPosMap[rootSymOff + i];
        rootOwnership[i] = rootOwnershipSign * activatedOwnership(rootEval, symPos, outputScaleMultiplier);
    }
    const rootAllowedMoves = buildAllowedMovesMask(args.regionOfInterest);
    const rootPolicy = new Float32Array(BOARD_AREA + 1);
    expandNode({
        node: rootNode,
        stones: rootPos.stones,
        koPoint: rootPos.koPoint,
        policyLogits: rootEval.policy,
        policyLogitsSymmetry: rootSym,
        passLogit: rootEval.passLogit,
        maxChildren,
        libertyMap: rootEval.libertyMap,
        allowedMoves: rootAllowedMoves ?? undefined,
        policyOut: rootPolicy,
        policyOutputScaling: outputScaleMultiplier
    });
    rootNode.ownership = rootOwnership;
    const recentScoreCenter = computeRecentScoreCenter(-rootEval.blackScoreMean);
    const rootValue = 2 * rootEval.blackWinProb - 1;
    const rootUtility = computeBlackUtilityFromEval({
        blackWinProb: rootEval.blackWinProb,
        blackNoResultProb: rootEval.blackNoResultProb,
        blackScoreMean: rootEval.blackScoreMean,
        blackScoreStdev: rootEval.blackScoreStdev,
        recentScoreCenter
    });
    rootNode.visits = 1;
    rootNode.valueSum = rootValue;
    rootNode.scoreLeadSum = rootEval.blackScoreLead;
    rootNode.scoreMeanSum = rootEval.blackScoreMean;
    const rootScoreMeanSq = rootEval.blackScoreStdev * rootEval.blackScoreStdev + rootEval.blackScoreMean * rootEval.blackScoreMean;
    rootNode.scoreMeanSqSum = rootScoreMeanSq;
    rootNode.utilitySum = rootUtility;
    rootNode.utilitySqSum = rootUtility * rootUtility;
    rootNode.nnUtility = rootUtility;
    const sim = {
        stones: rootStones.slice(),
        koPoint: rootKoPoint
    };
    const captureStack = [];
    const undoMoves = [];
    const undoPlayers = [];
    const undoSnapshots = [];
    const pathMoves = [];
    const deadline = getAnimationNow() + maxTimeMs;
    let timeCheckCounter = 0;
    const timeCheckMask = 0x1f;
    const timeExceeded = ()=>{
        if ((timeCheckCounter++ & timeCheckMask) !== 0) return false;
        return getAnimationNow() >= deadline;
    };
    while(rootNode.visits < maxVisits && !timeExceeded()){
        const jobs = [];
        let attempts = 0;
        while(jobs.length < batchSize && rootNode.visits + jobs.length < maxVisits && !timeExceeded()){
            attempts++;
            if (attempts > batchSize * 8) break;
            undoMoves.length = 0;
            undoPlayers.length = 0;
            undoSnapshots.length = 0;
            pathMoves.length = 0;
            sim.stones.set(rootStones);
            sim.koPoint = rootKoPoint;
            const path = [
                rootNode
            ];
            let node = rootNode;
            let player = rootNode.playerToMove;
            while(node.edges && node.edges.length > 0){
                const e = selectEdge(node, node === rootNode, wideRootNoise, rand);
                const move = e.move;
                const snapshot = playMove(sim, move, player, captureStack);
                undoMoves.push(move);
                undoPlayers.push(player);
                undoSnapshots.push(snapshot);
                const pathIdx = pathMoves.length;
                const pathPlayer = colorToPlayer(player);
                let pathEntry = pathMoves[pathIdx];
                if (!pathEntry) {
                    pathEntry = {
                        move,
                        player: pathPlayer
                    };
                    pathMoves[pathIdx] = pathEntry;
                } else {
                    pathEntry.move = move;
                    pathEntry.player = pathPlayer;
                }
                pathMoves.length = pathIdx + 1;
                if (!e.child) e.child = new Node(opponentOf(player));
                node = e.child;
                player = node.playerToMove;
                path.push(node);
                if (!node.edges) break;
            }
            if (node.pendingEval) {
                for(let i = undoMoves.length - 1; i >= 0; i--){
                    undoMove(sim, undoMoves[i], undoPlayers[i], undoSnapshots[i], captureStack);
                }
                continue;
            }
            node.pendingEval = true;
            for (const n of path)n.inFlight++;
            const leafStones = sim.stones.slice();
            const leafKoPoint = sim.koPoint;
            let prevStones = leafStones;
            let prevKoPoint = leafKoPoint;
            let prevPrevStones = leafStones;
            let prevPrevKoPoint = leafKoPoint;
            const leafPlayer = colorToPlayer(player);
            if (undoMoves.length >= 1) {
                const lastIdx = undoMoves.length - 1;
                undoMove(sim, undoMoves[lastIdx], undoPlayers[lastIdx], undoSnapshots[lastIdx], captureStack);
                if (lastIdx === 0) {
                    prevStones = rootStones;
                    prevKoPoint = rootKoPoint;
                    prevPrevStones = rootPrevStones;
                    prevPrevKoPoint = rootPrevKoPoint;
                } else {
                    prevStones = sim.stones.slice();
                    prevKoPoint = sim.koPoint;
                    const secondIdx = undoMoves.length - 2;
                    undoMove(sim, undoMoves[secondIdx], undoPlayers[secondIdx], undoSnapshots[secondIdx], captureStack);
                    if (secondIdx === 0) {
                        prevPrevStones = rootStones;
                        prevPrevKoPoint = rootKoPoint;
                    } else {
                        prevPrevStones = sim.stones.slice();
                        prevPrevKoPoint = sim.koPoint;
                    }
                    for(let i = secondIdx - 1; i >= 0; i--){
                        undoMove(sim, undoMoves[i], undoPlayers[i], undoSnapshots[i], captureStack);
                    }
                }
            }
            jobs.push({
                leaf: node,
                path,
                stones: leafStones,
                koPoint: leafKoPoint,
                prevStones,
                prevKoPoint,
                prevPrevStones,
                prevPrevKoPoint,
                currentPlayer: leafPlayer,
                recentMoves: takeRecentMoves(rootMoves, pathMoves, 5)
            });
        }
        if (jobs.length === 0) break;
        const evals = await evaluateBatch({
            model: args.model,
            includeOwnership: true,
            rules,
            nnRandomize,
            policyOptimism: POLICY_OPTIMISM,
            komi: args.komi,
            states: jobs
        });
        timeCheckCounter = 0;
        for(let i = 0; i < jobs.length; i++){
            const job = jobs[i];
            const ev = evals[i];
            if (!ev.ownership) throw new Error('Missing ownership output');
            const ownershipSign = job.currentPlayer === 'black' ? 1 : -1;
            const own = new Float32Array(BOARD_AREA);
            const sym = ev.symmetry;
            const symOff = sym * BOARD_AREA;
            const symPosMap = sym === 0 ? null : getSymPosMap();
            for(let p = 0; p < BOARD_AREA; p++){
                const symPos = sym === 0 ? p : symPosMap[symOff + p];
                own[p] = ownershipSign * Math.tanh(ev.ownership[symPos] * outputScaleMultiplier);
            }
            job.leaf.ownership = own;
            expandNode({
                node: job.leaf,
                stones: job.stones,
                koPoint: job.koPoint,
                policyLogits: ev.policy,
                policyLogitsSymmetry: ev.symmetry,
                passLogit: ev.passLogit,
                maxChildren,
                libertyMap: ev.libertyMap,
                policyOutputScaling: outputScaleMultiplier
            });
            const leafValue = 2 * ev.blackWinProb - 1;
            const leafUtility = computeBlackUtilityFromEval({
                blackWinProb: ev.blackWinProb,
                blackNoResultProb: ev.blackNoResultProb,
                blackScoreMean: ev.blackScoreMean,
                blackScoreStdev: ev.blackScoreStdev,
                recentScoreCenter
            });
            job.leaf.nnUtility = leafUtility;
            for (const n of job.path){
                n.visits += 1;
                n.valueSum += leafValue;
                n.scoreLeadSum += ev.blackScoreLead;
                n.scoreMeanSum += ev.blackScoreMean;
                n.scoreMeanSqSum += ev.blackScoreStdev * ev.blackScoreStdev + ev.blackScoreMean * ev.blackScoreMean;
                n.utilitySum += leafUtility;
                n.utilitySqSum += leafUtility * leafUtility;
                n.inFlight -= 1;
            }
            job.leaf.pendingEval = false;
        }
    }
    const edges = rootNode.edges ?? [];
    const childStats = [];
    const moveRows = [];
    for (const e of edges){
        const child = e.child;
        if (!child || child.visits <= 0) continue;
        const q = child.valueSum / child.visits;
        const winRate = (q + 1) * 0.5;
        const scoreLead = child.scoreLeadSum / child.visits;
        const scoreSelfplay = child.scoreMeanSum / child.visits;
        const scoreMeanSq = child.scoreMeanSqSum / child.visits;
        const scoreStdev = Math.sqrt(Math.max(0, scoreMeanSq - scoreSelfplay * scoreSelfplay));
        const utility = child.utilitySum / child.visits;
        childStats.push({
            weightAdjusted: child.visits,
            selfUtility: utility,
            policy: e.prior,
            value: q,
            scoreLead,
            scoreMean: scoreSelfplay,
            scoreMeanSq
        });
        moveRows.push({
            edge: e,
            move: e.move,
            visits: child.visits,
            winRate,
            scoreLead,
            scoreSelfplay,
            scoreStdev,
            prior: e.prior,
            pv: getPvForEdge(e, pvDepth)
        });
    }
    moveRows.sort((a, b)=>b.visits - a.visits);
    const rootStats = computeWeightedRootStats({
        children: childStats,
        rootSelf: {
            value: rootValue,
            scoreLead: rootEval.blackScoreLead,
            scoreMean: rootEval.blackScoreMean,
            scoreMeanSq: rootScoreMeanSq,
            utility: rootUtility,
            weight: 1
        }
    });
    const rootWinRate = rootStats.rootWinRate;
    const rootScoreLead = rootStats.rootScoreLead;
    const rootScoreSelfplay = rootStats.rootScoreSelfplay;
    const rootScoreStdev = rootStats.rootScoreStdev;
    const topMoves = moveRows.slice(0, Math.min(topK, moveRows.length));
    const best = topMoves[0] ?? null;
    const bestScoreLead = best ? best.scoreLead : rootScoreLead;
    const sign = args.currentPlayer === 'black' ? 1 : -1;
    const moves = topMoves.map((m)=>{
        const pointsLost = sign * (rootScoreLead - m.scoreLead);
        const relativePointsLost = sign * (bestScoreLead - m.scoreLead);
        const winRateLost = sign * (rootWinRate - m.winRate);
        const x = m.move === PASS_MOVE ? -1 : m.move % BOARD_SIZE;
        const y = m.move === PASS_MOVE ? -1 : m.move / BOARD_SIZE | 0;
        return {
            x,
            y,
            winRate: m.winRate,
            winRateLost,
            scoreLead: m.scoreLead,
            scoreSelfplay: m.scoreSelfplay,
            scoreStdev: m.scoreStdev,
            visits: m.visits,
            pointsLost,
            relativePointsLost,
            order: 0,
            prior: m.prior,
            pv: m.pv
        };
    });
    moves.sort((a, b)=>b.visits - a.visits);
    moves.forEach((m, i)=>m.order = i);
    const { ownership, ownershipStdev } = averageTreeOwnership(rootNode);
    return {
        rootWinRate,
        rootScoreLead,
        rootScoreSelfplay,
        rootScoreStdev,
        rootVisits: rootNode.visits,
        ownership,
        ownershipStdev,
        policy: rootPolicy,
        moves
    };
}
