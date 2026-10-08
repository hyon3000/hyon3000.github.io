const softPlus = (x)=>{
    if (x > 20) return x;
    if (x < -20) return Math.exp(x);
    return Math.log1p(Math.exp(x));
};
export function postprocessKataGoV8(args) {
    const { nextPlayer, valueLogits, scoreValue } = args;
    const postProcessParams = args.postProcessParams;
    const outputScaleMultiplier = postProcessParams?.outputScaleMultiplier ?? 1.0;
    const winLogits = valueLogits[0] * outputScaleMultiplier;
    const lossLogits = valueLogits[1] * outputScaleMultiplier;
    const noResultLogits = valueLogits[2] * outputScaleMultiplier;
    const maxLogits = Math.max(winLogits, lossLogits, noResultLogits);
    let winProb = Math.exp(winLogits - maxLogits);
    let lossProb = Math.exp(lossLogits - maxLogits);
    let noResultProb = Math.exp(noResultLogits - maxLogits);
    const probSum = winProb + lossProb + noResultProb;
    winProb /= probSum;
    lossProb /= probSum;
    noResultProb /= probSum;
    const scoreMeanMultiplier = postProcessParams?.scoreMeanMultiplier ?? 20.0;
    const scoreStdevMultiplier = postProcessParams?.scoreStdevMultiplier ?? 20.0;
    const leadMultiplier = postProcessParams?.leadMultiplier ?? 20.0;
    const scoreMeanPreScaled = scoreValue[0] * outputScaleMultiplier;
    const scoreStdevPreSoftplus = scoreValue[1] * outputScaleMultiplier;
    const leadPreScaled = scoreValue[2] * outputScaleMultiplier;
    let scoreMean = scoreMeanPreScaled * scoreMeanMultiplier;
    const scoreStdev = softPlus(scoreStdevPreSoftplus) * scoreStdevMultiplier;
    let scoreMeanSq = scoreMean * scoreMean + scoreStdev * scoreStdev;
    let lead = leadPreScaled * leadMultiplier;
    scoreMean *= 1.0 - noResultProb;
    scoreMeanSq *= 1.0 - noResultProb;
    lead *= 1.0 - noResultProb;
    const blackWinProb = nextPlayer === 'black' ? winProb : lossProb;
    const blackScoreLead = nextPlayer === 'black' ? lead : -lead;
    const blackScoreMean = nextPlayer === 'black' ? scoreMean : -scoreMean;
    const blackScoreStdev = Math.sqrt(Math.max(0, scoreMeanSq - scoreMean * scoreMean));
    const blackNoResultProb = noResultProb;
    return {
        blackWinProb,
        blackScoreLead,
        blackScoreMean,
        blackScoreStdev,
        blackNoResultProb
    };
}
