export class KataGoBinModelParser {
    data;
    idx = 0;
    decoder = new TextDecoder('utf-8');
    constructor(data){
        this.data = data;
    }
    skipWhitespace() {
        while(this.idx < this.data.length){
            const b = this.data[this.idx];
            if (b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09) {
                this.idx++;
                continue;
            }
            break;
        }
    }
    readToken() {
        this.skipWhitespace();
        const start = this.idx;
        while(this.idx < this.data.length){
            const b = this.data[this.idx];
            if (b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09) break;
            this.idx++;
        }
        if (this.idx <= start) {
            throw new Error('Unexpected EOF while reading token');
        }
        return this.decoder.decode(this.data.subarray(start, this.idx));
    }
    readInt() {
        const tok = this.readToken();
        const value = Number.parseInt(tok, 10);
        if (!Number.isFinite(value)) throw new Error(`Invalid int token: ${tok}`);
        return value;
    }
    readFloatAscii() {
        const tok = this.readToken();
        const value = Number.parseFloat(tok);
        if (!Number.isFinite(value)) throw new Error(`Invalid float token: ${tok}`);
        return value;
    }
    readBinaryFloats(count) {
        this.skipWhitespace();
        const marker = this.data.subarray(this.idx, this.idx + 5);
        if (marker.length !== 5 || marker[0] !== 0x40 || marker[1] !== 0x42 || marker[2] !== 0x49 || marker[3] !== 0x4e || marker[4] !== 0x40) {
            throw new Error('Expected @BIN@ marker');
        }
        this.idx += 5;
        const byteLen = count * 4;
        const absStart = this.data.byteOffset + this.idx;
        const absEnd = absStart + byteLen;
        if (absEnd > this.data.buffer.byteLength) throw new Error('Unexpected EOF while reading binary floats');
        const buf = this.data.buffer.slice(absStart, absEnd);
        this.idx += byteLen;
        this.skipWhitespace();
        return new Float32Array(buf);
    }
}
export function parseBatchNormV8(p) {
    p.readToken();
    const channels = p.readInt();
    const epsilon = p.readFloatAscii();
    const hasScale = p.readInt() !== 0;
    const hasBias = p.readInt() !== 0;
    const mean = p.readBinaryFloats(channels);
    const variance = p.readBinaryFloats(channels);
    const scale = hasScale ? p.readBinaryFloats(channels) : new Float32Array(channels).fill(1);
    const bias = hasBias ? p.readBinaryFloats(channels) : new Float32Array(channels).fill(0);
    const mergedScale = new Float32Array(channels);
    const mergedBias = new Float32Array(channels);
    for(let i = 0; i < channels; i++){
        const ms = scale[i] / Math.sqrt(variance[i] + epsilon);
        mergedScale[i] = ms;
        mergedBias[i] = bias[i] - ms * mean[i];
    }
    return {
        channels,
        mergedScale,
        mergedBias
    };
}
export function parseActivationNameV8(p) {
    return p.readToken();
}
export function parseActivationKind(p, modelVersion) {
    p.readToken();
    if (modelVersion < 11) return 'relu';
    const kindTok = p.readToken();
    if (kindTok === 'ACTIVATION_IDENTITY') return 'identity';
    if (kindTok === 'ACTIVATION_RELU') return 'relu';
    if (kindTok === 'ACTIVATION_MISH') return 'mish';
    throw new Error(`Unsupported activation kind token: ${kindTok}`);
}
export function parseConv2d(p) {
    const name = p.readToken();
    const kernelY = p.readInt();
    const kernelX = p.readInt();
    const inChannels = p.readInt();
    const outChannels = p.readInt();
    const dilationY = p.readInt();
    const dilationX = p.readInt();
    const weights = p.readBinaryFloats(kernelY * kernelX * inChannels * outChannels);
    return {
        name,
        kernelY,
        kernelX,
        inChannels,
        outChannels,
        dilationY,
        dilationX,
        weights
    };
}
export function parseMatMul(p) {
    const name = p.readToken();
    const inChannels = p.readInt();
    const outChannels = p.readInt();
    const weights = p.readBinaryFloats(inChannels * outChannels);
    return {
        name,
        inChannels,
        outChannels,
        weights
    };
}
export function parseMatBias(p) {
    const name = p.readToken();
    const channels = p.readInt();
    const weights = p.readBinaryFloats(channels);
    return {
        name,
        channels,
        weights
    };
}
