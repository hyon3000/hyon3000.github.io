import { tf } from '../../lib/tfjs/tfjs-bundle.js';
function makeBn(bn) {
    const scale = tf.tensor4d(bn.mergedScale, [
        1,
        1,
        1,
        bn.channels
    ]);
    const bias = tf.tensor4d(bn.mergedBias, [
        1,
        1,
        1,
        bn.channels
    ]);
    return {
        scale,
        bias
    };
}
function makeConv(conv) {
    const filter = tf.tensor4d(conv.weights, [
        conv.kernelY,
        conv.kernelX,
        conv.inChannels,
        conv.outChannels
    ]);
    return {
        kernelY: conv.kernelY,
        kernelX: conv.kernelX,
        inChannels: conv.inChannels,
        outChannels: conv.outChannels,
        dilationY: conv.dilationY,
        dilationX: conv.dilationX,
        filter
    };
}
function makeMatMul(mm) {
    const w = tf.tensor2d(mm.weights, [
        mm.inChannels,
        mm.outChannels
    ]);
    return {
        inChannels: mm.inChannels,
        outChannels: mm.outChannels,
        w
    };
}
function makeMatBias(bias) {
    const b = tf.tensor2d(bias.weights, [
        1,
        bias.channels
    ]);
    return {
        channels: bias.channels,
        b
    };
}
function applyActivation4D(x, kind) {
    if (kind === 'identity') return x;
    if (kind === 'relu') return tf.relu(x);
    return tf.mul(x, tf.tanh(tf.softplus(x)));
}
function applyActivation2D(x, kind) {
    if (kind === 'identity') return x;
    if (kind === 'relu') return tf.relu(x);
    return tf.mul(x, tf.tanh(tf.softplus(x)));
}
function bnAct(x, bn, activation) {
    const y = tf.add(tf.mul(x, bn.scale), bn.bias);
    return applyActivation4D(y, activation);
}
function conv2d(x, conv) {
    return tf.conv2d(x, conv.filter, 1, 'same', 'NHWC', [
        conv.dilationY,
        conv.dilationX
    ]);
}
function poolRowsGPool(x) {
    const boardSize = x.shape[1] ?? 19;
    const factor = (boardSize - 14) * 0.1;
    const mean = tf.mean(x, [
        1,
        2
    ]);
    const max = tf.max(x, [
        1,
        2
    ]);
    return tf.concat([
        mean,
        mean.mul(factor),
        max
    ], 1);
}
function poolRowsValueHead(x) {
    const boardSize = x.shape[1] ?? 19;
    const base = boardSize - 14;
    const factor1 = base * 0.1;
    const factor2 = base * base * 0.01 - 0.1;
    const mean = tf.mean(x, [
        1,
        2
    ]);
    return tf.concat([
        mean,
        mean.mul(factor1),
        mean.mul(factor2)
    ], 1);
}
export class KataGoModelV8Tf {
    modelName;
    modelVersion;
    postProcessParams;
    policyOutChannels;
    scoreValueChannels;
    trunkConv1;
    trunkGInput;
    trunkBlocks;
    trunkTipBN;
    trunkTipActivation;
    p1;
    g1;
    g1BN;
    g1Activation;
    gpoolToBias;
    p1BN;
    p1Activation;
    p2;
    passMul;
    passBias;
    passActivation;
    passMul2;
    v1;
    v1BN;
    v1Activation;
    v2;
    v2Bias;
    v2Activation;
    v3;
    v3Bias;
    sv3;
    sv3Bias;
    ownership;
    constructor(parsed){
        this.modelName = parsed.modelName;
        this.modelVersion = parsed.modelVersion;
        this.postProcessParams = parsed.postProcessParams;
        this.policyOutChannels = parsed.policyOutChannels;
        this.scoreValueChannels = parsed.scoreValueChannels;
        this.trunkConv1 = makeConv(parsed.trunk.conv1);
        this.trunkGInput = makeMatMul(parsed.trunk.ginput);
        const toTfBlock = (b)=>{
            if (b.kind === 'ordinary') {
                return {
                    kind: 'ordinary',
                    preBN: makeBn(b.preBN),
                    preActivation: b.preActivation,
                    w1: makeConv(b.w1),
                    midBN: makeBn(b.midBN),
                    midActivation: b.midActivation,
                    w2: makeConv(b.w2)
                };
            }
            if (b.kind === 'gpool') {
                return {
                    kind: 'gpool',
                    preBN: makeBn(b.preBN),
                    preActivation: b.preActivation,
                    w1a: makeConv(b.w1a),
                    w1b: makeConv(b.w1b),
                    gpoolBN: makeBn(b.gpoolBN),
                    gpoolActivation: b.gpoolActivation,
                    w1r: makeMatMul(b.w1r),
                    midBN: makeBn(b.midBN),
                    midActivation: b.midActivation,
                    w2: makeConv(b.w2)
                };
            }
            return {
                kind: 'nested_bottleneck',
                numBlocks: b.numBlocks,
                preBN: makeBn(b.preBN),
                preActivation: b.preActivation,
                preConv: makeConv(b.preConv),
                blocks: b.blocks.map(toTfBlock),
                postBN: makeBn(b.postBN),
                postActivation: b.postActivation,
                postConv: makeConv(b.postConv)
            };
        };
        this.trunkBlocks = parsed.trunk.blocks.map(toTfBlock);
        this.trunkTipBN = makeBn(parsed.trunk.tipBN);
        this.trunkTipActivation = parsed.trunk.tipActivation;
        this.p1 = makeConv(parsed.policy.p1);
        this.g1 = makeConv(parsed.policy.g1);
        this.g1BN = makeBn(parsed.policy.g1BN);
        this.g1Activation = parsed.policy.g1Activation;
        this.gpoolToBias = makeMatMul(parsed.policy.gpoolToBias);
        this.p1BN = makeBn(parsed.policy.p1BN);
        this.p1Activation = parsed.policy.p1Activation;
        this.p2 = makeConv(parsed.policy.p2);
        this.passMul = makeMatMul(parsed.policy.passMul);
        this.passBias = parsed.policy.passBias ? makeMatBias(parsed.policy.passBias) : undefined;
        this.passActivation = parsed.policy.passActivation;
        this.passMul2 = parsed.policy.passMul2 ? makeMatMul(parsed.policy.passMul2) : undefined;
        this.v1 = makeConv(parsed.value.v1);
        this.v1BN = makeBn(parsed.value.v1BN);
        this.v1Activation = parsed.value.v1Activation;
        this.v2 = makeMatMul(parsed.value.v2);
        this.v2Bias = makeMatBias(parsed.value.v2Bias);
        this.v2Activation = parsed.value.v2Activation;
        this.v3 = makeMatMul(parsed.value.v3);
        this.v3Bias = makeMatBias(parsed.value.v3Bias);
        this.sv3 = makeMatMul(parsed.value.sv3);
        this.sv3Bias = makeMatBias(parsed.value.sv3Bias);
        this.ownership = makeConv(parsed.value.ownership);
    }
    forward(spatial, global) {
        return tf.tidy(()=>{
            const trunk = this.forwardTrunk(spatial, global);
            let p1Out = conv2d(trunk, this.p1);
            const g1Out = conv2d(trunk, this.g1);
            const g1Out2 = bnAct(g1Out, this.g1BN, this.g1Activation);
            const g1Concat = poolRowsGPool(g1Out2);
            const g1Bias = tf.matMul(g1Concat, this.gpoolToBias.w);
            p1Out = p1Out.add(g1Bias.reshape([
                g1Bias.shape[0],
                1,
                1,
                g1Bias.shape[1]
            ]));
            const p1Out2 = bnAct(p1Out, this.p1BN, this.p1Activation);
            const policy = conv2d(p1Out2, this.p2);
            const policyPass = this.forwardPolicyPass(g1Concat);
            const v1Out = conv2d(trunk, this.v1);
            const v1Out2 = bnAct(v1Out, this.v1BN, this.v1Activation);
            const v1Mean = poolRowsValueHead(v1Out2);
            let v2Out = tf.matMul(v1Mean, this.v2.w);
            v2Out = v2Out.add(this.v2Bias.b);
            v2Out = applyActivation2D(v2Out, this.v2Activation);
            let value = tf.matMul(v2Out, this.v3.w);
            value = value.add(this.v3Bias.b);
            let scoreValue = tf.matMul(v2Out, this.sv3.w);
            scoreValue = scoreValue.add(this.sv3Bias.b);
            if (this.scoreValueChannels > 4) {
                scoreValue = scoreValue.slice([
                    0,
                    0
                ], [
                    scoreValue.shape[0],
                    4
                ]);
            }
            const ownership = conv2d(v1Out2, this.ownership);
            return {
                policy,
                policyPass,
                value,
                scoreValue,
                ownership
            };
        });
    }
    forwardPolicyValue(spatial, global) {
        return tf.tidy(()=>{
            const trunk = this.forwardTrunk(spatial, global);
            let p1Out = conv2d(trunk, this.p1);
            const g1Out = conv2d(trunk, this.g1);
            const g1Out2 = bnAct(g1Out, this.g1BN, this.g1Activation);
            const g1Concat = poolRowsGPool(g1Out2);
            const g1Bias = tf.matMul(g1Concat, this.gpoolToBias.w);
            p1Out = p1Out.add(g1Bias.reshape([
                g1Bias.shape[0],
                1,
                1,
                g1Bias.shape[1]
            ]));
            const p1Out2 = bnAct(p1Out, this.p1BN, this.p1Activation);
            const policy = conv2d(p1Out2, this.p2);
            const policyPass = this.forwardPolicyPass(g1Concat);
            const v1Out = conv2d(trunk, this.v1);
            const v1Out2 = bnAct(v1Out, this.v1BN, this.v1Activation);
            const v1Mean = poolRowsValueHead(v1Out2);
            let v2Out = tf.matMul(v1Mean, this.v2.w);
            v2Out = v2Out.add(this.v2Bias.b);
            v2Out = applyActivation2D(v2Out, this.v2Activation);
            let value = tf.matMul(v2Out, this.v3.w);
            value = value.add(this.v3Bias.b);
            let scoreValue = tf.matMul(v2Out, this.sv3.w);
            scoreValue = scoreValue.add(this.sv3Bias.b);
            if (this.scoreValueChannels > 4) {
                scoreValue = scoreValue.slice([
                    0,
                    0
                ], [
                    scoreValue.shape[0],
                    4
                ]);
            }
            return {
                policy,
                policyPass,
                value,
                scoreValue
            };
        });
    }
    forwardValueOnly(spatial, global) {
        return tf.tidy(()=>{
            const trunk = this.forwardTrunk(spatial, global);
            const v1Out = conv2d(trunk, this.v1);
            const v1Out2 = bnAct(v1Out, this.v1BN, this.v1Activation);
            const v1Mean = poolRowsValueHead(v1Out2);
            let v2Out = tf.matMul(v1Mean, this.v2.w);
            v2Out = v2Out.add(this.v2Bias.b);
            v2Out = applyActivation2D(v2Out, this.v2Activation);
            let value = tf.matMul(v2Out, this.v3.w);
            value = value.add(this.v3Bias.b);
            let scoreValue = tf.matMul(v2Out, this.sv3.w);
            scoreValue = scoreValue.add(this.sv3Bias.b);
            if (this.scoreValueChannels > 4) {
                scoreValue = scoreValue.slice([
                    0,
                    0
                ], [
                    scoreValue.shape[0],
                    4
                ]);
            }
            return {
                value,
                scoreValue
            };
        });
    }
    forwardTrunk(spatial, global) {
        let trunk = conv2d(spatial, this.trunkConv1);
        const ginput = tf.matMul(global, this.trunkGInput.w);
        trunk = trunk.add(ginput.reshape([
            ginput.shape[0],
            1,
            1,
            ginput.shape[1]
        ]));
        trunk = this.applyBlockStack(trunk, this.trunkBlocks);
        return bnAct(trunk, this.trunkTipBN, this.trunkTipActivation);
    }
    forwardPolicyPass(gpool) {
        let pass = tf.matMul(gpool, this.passMul.w);
        if (this.passBias && this.passActivation && this.passMul2) {
            pass = pass.add(this.passBias.b);
            pass = applyActivation2D(pass, this.passActivation);
            pass = tf.matMul(pass, this.passMul2.w);
        }
        return pass;
    }
    applyBlockStack(trunk, blocks) {
        for (const block of blocks){
            if (block.kind === 'ordinary') {
                const a = bnAct(trunk, block.preBN, block.preActivation);
                const b = conv2d(a, block.w1);
                const c = bnAct(b, block.midBN, block.midActivation);
                const d = conv2d(c, block.w2);
                trunk = trunk.add(d);
                continue;
            }
            if (block.kind === 'gpool') {
                const a = bnAct(trunk, block.preBN, block.preActivation);
                let regularOut = conv2d(a, block.w1a);
                const gpoolOut = conv2d(a, block.w1b);
                const gpoolOut2 = bnAct(gpoolOut, block.gpoolBN, block.gpoolActivation);
                const gpoolConcat = poolRowsGPool(gpoolOut2);
                const gpoolBias = tf.matMul(gpoolConcat, block.w1r.w);
                regularOut = regularOut.add(gpoolBias.reshape([
                    gpoolBias.shape[0],
                    1,
                    1,
                    gpoolBias.shape[1]
                ]));
                const c = bnAct(regularOut, block.midBN, block.midActivation);
                const d = conv2d(c, block.w2);
                trunk = trunk.add(d);
                continue;
            }
            const a = bnAct(trunk, block.preBN, block.preActivation);
            let mid = conv2d(a, block.preConv);
            mid = this.applyBlockStack(mid, block.blocks);
            const c = bnAct(mid, block.postBN, block.postActivation);
            const d = conv2d(c, block.postConv);
            trunk = trunk.add(d);
        }
        return trunk;
    }
    dispose() {
        const tensors = [
            this.trunkConv1.filter,
            this.trunkGInput.w,
            this.trunkTipBN.scale,
            this.trunkTipBN.bias,
            this.p1.filter,
            this.g1.filter,
            this.g1BN.scale,
            this.g1BN.bias,
            this.gpoolToBias.w,
            this.p1BN.scale,
            this.p1BN.bias,
            this.p2.filter,
            this.passMul.w,
            ...this.passBias ? [
                this.passBias.b
            ] : [],
            ...this.passMul2 ? [
                this.passMul2.w
            ] : [],
            this.v1.filter,
            this.v1BN.scale,
            this.v1BN.bias,
            this.v2.w,
            this.v2Bias.b,
            this.v3.w,
            this.v3Bias.b,
            this.sv3.w,
            this.sv3Bias.b,
            this.ownership.filter
        ];
        const pushBlockTensors = (block)=>{
            tensors.push(block.preBN.scale, block.preBN.bias);
            if (block.kind === 'ordinary') {
                tensors.push(block.w1.filter, block.midBN.scale, block.midBN.bias, block.w2.filter);
                return;
            }
            if (block.kind === 'gpool') {
                tensors.push(block.w1a.filter, block.w1b.filter, block.gpoolBN.scale, block.gpoolBN.bias, block.w1r.w, block.midBN.scale, block.midBN.bias, block.w2.filter);
                return;
            }
            tensors.push(block.preConv.filter);
            for (const inner of block.blocks)pushBlockTensors(inner);
            tensors.push(block.postBN.scale, block.postBN.bias, block.postConv.filter);
        };
        for (const block of this.trunkBlocks)pushBlockTensors(block);
        tf.dispose(tensors);
    }
}
