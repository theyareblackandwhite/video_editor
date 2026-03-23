/**
 * Core mathematical functions for audio synchronization.
 * Shared between syncWorker and tests.
 */

export function bandpassFilter(signal: Float32Array, sampleRate: number): Float32Array {
    const output = new Float32Array(signal.length);
    // 300Hz High-pass
    const rcHigh = 1.0 / (2 * Math.PI * 300);
    const dt = 1.0 / sampleRate;
    const alphaHigh = rcHigh / (rcHigh + dt);

    // 3000Hz Low-pass
    const rcLow = 1.0 / (2 * Math.PI * 3000);
    const alphaLow = dt / (rcLow + dt);

    let hpPrev = 0;
    let inPrev = 0;
    let lpPrev = 0;

    for (let i = 0; i < signal.length; i++) {
        const x = signal[i];
        
        // High-pass step
        const hp = alphaHigh * (hpPrev + x - inPrev);
        inPrev = x;
        hpPrev = hp;

        // Low-pass step
        const lp = lpPrev + alphaLow * (hp - lpPrev);
        lpPrev = lp;
        
        output[i] = lp;
    }
    return output;
}

export function normalizeEnvelope(env: Float32Array): Float32Array {
    let sum = 0;
    for (let i = 0; i < env.length; i++) {
        sum += env[i];
    }
    const mean = sum / env.length;

    // Zero-mean the signal to prevent false matches on silence
    for (let i = 0; i < env.length; i++) {
        env[i] -= mean;
    }

    return env;
}

export function extractTransientEnvelope(signal: Float32Array, sampleRate: number, targetRate: number): Float32Array {
    const samplesPerBlock = Math.floor(sampleRate / targetRate);
    if (samplesPerBlock === 0) return normalizeEnvelope(signal); // Fallback if rates matching/very low

    const envLength = Math.floor(signal.length / samplesPerBlock);
    const envelope = new Float32Array(envLength);

    for (let i = 0; i < envLength; i++) {
        let sumSquared = 0;
        const offset = i * samplesPerBlock;
        for (let j = 0; j < samplesPerBlock; j++) {
            const currentSample = signal[offset + j];
            sumSquared += currentSample * currentSample;
        }
        envelope[i] = Math.sqrt(sumSquared / samplesPerBlock);
    }

    // "Transients" - Detect spikes/onsets
    const deltaEnvelope = new Float32Array(envLength);
    for (let i = 0; i < envLength - 1; i++) {
        const diff = envelope[i + 1] - envelope[i];
        deltaEnvelope[i] = diff > 0 ? diff : 0;
    }

    return normalizeEnvelope(deltaEnvelope);
}

export function computeCorrelation(ref: Float32Array, target: Float32Array, lag: number): number {
    const start = Math.max(0, -lag);
    const end = Math.min(ref.length, target.length - lag);
    const overlap = end - start;

    if (overlap < ref.length * 0.1) return 0;

    let sumDot = 0;
    let sumRefSq = 0;
    let sumTgtSq = 0;

    for (let i = start; i < end; i++) {
        const rVal = ref[i];
        const tVal = target[i + lag];
        
        sumDot += rVal * tVal;
        sumRefSq += rVal * rVal;
        sumTgtSq += tVal * tVal;
    }

    if (sumRefSq === 0 || sumTgtSq === 0) return 0;

    // Normalized Cross-Correlation (NCC)
    const ncc = sumDot / Math.sqrt(sumRefSq * sumTgtSq);

    // Apply overlap penalty
    const overlapRatio = overlap / ref.length;
    return ncc * overlapRatio;
}

export function findBestLagInRange(
    refChunk: Float32Array,
    target: Float32Array,
    minLag: number,
    maxLag: number
): { bestLag: number; confidence: number } {
    let bestCorrelation = -Infinity;
    let bestLag = 0;
    
    const corrs: number[] = [];

    for (let lag = Math.floor(minLag); lag <= Math.ceil(maxLag); lag++) {
        const corr = computeCorrelation(refChunk, target, lag);
        corrs.push(corr);

        if (corr > bestCorrelation) {
            bestCorrelation = corr;
            bestLag = lag;
        }
    }

    const n = corrs.length;
    if (n === 0) return { bestLag: 0, confidence: 0 };
    
    let sum = 0;
    for (let i = 0; i < n; i++) sum += corrs[i];
    const mean = sum / n;
    
    let sumSqDiff = 0;
    for (let i = 0; i < n; i++) {
        const diff = corrs[i] - mean;
        sumSqDiff += diff * diff;
    }
    const std = Math.sqrt(sumSqDiff / n);
    
    let zScore = 0;
    if (std > 0) {
        zScore = (bestCorrelation - mean) / std;
    }

    return { bestLag, confidence: zScore };
}
