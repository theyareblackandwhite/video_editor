/**
 * Web Worker for CPU-intensive sync correlation.
 *
 * Implements a Coarse-to-Fine search with Transient Envelope
 * extraction, 300Hz-3000Hz Bandpass filtering, Normalized Cross-Correlation (NCC),
 * and Mode-based Validation across 30-second blocks.
 */

const COARSE_RATE = 100;
const FINE_RATE = 1000;
const BLOCK_SECONDS = 30;

function bandpassFilter(signal: Float32Array, sampleRate: number): Float32Array {
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

function normalizeEnvelope(env: Float32Array): Float32Array {
    let sum = 0;
    for (let i = 0; i < env.length; i++) {
        sum += env[i];
    }
    const mean = sum / env.length;

    // Sinyalin DC bileşenini (Ortalamayı) tamamen kaldırıp Zero-mean yapıyoruz
    // Bu işlem korelasyonda "sessizliklerin" üst üste binip sahte skor üretmesini %100 engeller.
    let variance = 0;
    for (let i = 0; i < env.length; i++) {
        env[i] -= mean;
        variance += env[i] * env[i];
    }
    const stdDev = Math.sqrt(variance / env.length);

    // 3-Sigma clipping to ignore massive explosions (after zero-mean)
    // Zero-mean sonrası ortalama = 0 olduğu için limit doğrudan +/- 3*stdDev olur
    const clipLimit = stdDev * 3;
    const minLimit = -stdDev * 3;

    let maxAbs = 0;
    for (let i = 0; i < env.length; i++) {
        let val = env[i];
        if (val > clipLimit) val = clipLimit;
        else if (val < minLimit) val = minLimit;
        
        env[i] = val;
        const absVal = Math.abs(val);
        if (absVal > maxAbs) maxAbs = absVal;
    }

    if (maxAbs === 0) return env;
    
    for (let i = 0; i < env.length; i++) {
        env[i] /= maxAbs;
    }
    return env;
}

function extractTransientEnvelope(signal: Float32Array, sampleRate: number, targetRate: number): Float32Array {
    const samplesPerBlock = Math.floor(sampleRate / targetRate);
    const envLength = Math.floor(signal.length / samplesPerBlock);
    const envelope = new Float32Array(envLength);

    let prevSample = 0;
    let sum = 0;

    for (let i = 0; i < envLength; i++) {
        let maxAmp = 0;
        const offset = i * samplesPerBlock;
        for (let j = 0; j < samplesPerBlock; j++) {
            const currentSample = signal[offset + j];
            // First-derivative highlights high frequency peaks naturally
            const diff = Math.abs(currentSample - prevSample);
            prevSample = currentSample;

            if (diff > maxAmp) {
                maxAmp = diff;
            }
        }
        envelope[i] = maxAmp;
        sum += maxAmp;
    }

    const mean = sum / envLength;
    for (let i = 0; i < envLength; i++) {
        envelope[i] -= mean;
    }

    // Korelasyon kalitesi için tüm sinyali orantılayıp [-1..1] arası yapıyoruz
    return normalizeEnvelope(envelope);
}

function computeCorrelation(ref: Float32Array, target: Float32Array, lag: number): number {
    const start = Math.max(0, -lag);
    const end = Math.min(ref.length, target.length - lag);

    if (start >= end) return 0;

    let sumDot = 0;
    for (let i = start; i < end; i++) {
        sumDot += ref[i] * target[i + lag];
    }

    // Önemli: Uç noktalarda patlamayı (false positive) engellemek için, 
    // overlap değerine göre değil bloğun GLOBAL uzunluğuna göre normalize ediyoruz!!!
    // Aksi takdirde 1 saniyelik çok kısa overlap (-29s gibi) tesadüfi devasa bir pik yaratabilir.
    return sumDot / ref.length;
}

function findBestLagInRange(
    refChunk: Float32Array,
    target: Float32Array,
    minLag: number,
    maxLag: number
): { bestLag: number; confidence: number } {
    let bestCorrelation = -Infinity;
    let bestLag = 0;
    let sumCorrelations = 0;
    let correlationCount = 0;

    // Expand search space to integer lag bounds
    for (let lag = Math.floor(minLag); lag <= Math.ceil(maxLag); lag++) {
        const corr = computeCorrelation(refChunk, target, lag);
        sumCorrelations += Math.abs(corr);
        correlationCount++;

        if (corr > bestCorrelation) {
            bestCorrelation = corr;
            bestLag = lag;
        }
    }

    const avgCorrelation = correlationCount > 0 ? (sumCorrelations / correlationCount) : 0;
    const confidence = avgCorrelation > 0
        ? Math.min(1, bestCorrelation / (avgCorrelation * 5))
        : 0;

    return { bestLag, confidence };
}

/* ── Worker message handler ── */

export interface SyncWorkerInput {
    videoSamples: Float32Array;
    audioSamples: Float32Array;
    maxOffsetSeconds: number;
    sampleRate: number;
}

export interface SyncWorkerOutput {
    offsetSeconds: number;
    confidence: number;
    coarseOffset: number;
    fineOffset: number;
}

self.onmessage = (e: MessageEvent<SyncWorkerInput>) => {
    const { videoSamples, audioSamples, maxOffsetSeconds, sampleRate } = e.data;

    // Step 1: Bandpass Filter (300-3000Hz)
    const refFiltered = bandpassFilter(videoSamples, sampleRate);
    const tgtFiltered = bandpassFilter(audioSamples, sampleRate);

    // Prepare Coarse & Fine Transient Envelopes
    const refEnvCoarse = extractTransientEnvelope(refFiltered, sampleRate, COARSE_RATE);
    const tgtEnvCoarse = extractTransientEnvelope(tgtFiltered, sampleRate, COARSE_RATE);

    const refEnvFine = extractTransientEnvelope(refFiltered, sampleRate, FINE_RATE);
    const tgtEnvFine = extractTransientEnvelope(tgtFiltered, sampleRate, FINE_RATE);

    const blockLenCoarse = BLOCK_SECONDS * COARSE_RATE;
    const blockLenFine = BLOCK_SECONDS * FINE_RATE;

    const numBlocks = Math.max(1, Math.floor(refEnvCoarse.length / blockLenCoarse));
    const maxLagCoarse = Math.floor(maxOffsetSeconds * COARSE_RATE);
    const fineSearchWindow = Math.floor(0.2 * FINE_RATE); // +/- 200ms

    const offsets: Array<{ coarseOffsetSec: number; fineOffsetSec: number; confidence: number }> = [];

    // Step 2 & 3: Two-stage search inside Mode validation blocks
    for (let i = 0; i < numBlocks; i++) {
        const startCoarse = i * blockLenCoarse;
        const endCoarse = Math.min(startCoarse + blockLenCoarse, refEnvCoarse.length);
        const refChunkCoarse = refEnvCoarse.subarray(startCoarse, endCoarse);

        // Kaba Arama (Coarse): (-30s, +30s) global offset
        // Chunk'un başlangıcına göre lag'i kaydırmalıyız ki global offset düzgün aransın
        const minCoarseLag = -maxLagCoarse + startCoarse;
        const maxCoarseLag =  maxLagCoarse + startCoarse;

        const { bestLag: coarseLag, confidence: coarseConf } = findBestLagInRange(
            refChunkCoarse, tgtEnvCoarse, minCoarseLag, maxCoarseLag
        );
        
        // Hassas Arama (Fine): +/- 200ms @ 1000Hz
        const startFine = i * blockLenFine;
        const endFine = Math.min(startFine + blockLenFine, refEnvFine.length);
        const refChunkFine = refEnvFine.subarray(startFine, endFine);

        const centerFineLag = Math.round((coarseLag / COARSE_RATE) * FINE_RATE);
        
        const { bestLag: fineLag, confidence: fineConf } = findBestLagInRange(
            refChunkFine,
            tgtEnvFine,
            centerFineLag - fineSearchWindow,
            centerFineLag + fineSearchWindow
        );

        // Convert chunk-local lag back to global seconds offset
        // lag represents: index of tgt - index of ref chunk start
        // Therefore, true global offset = (lag - start) / rate
        const coarseOffsetSec = (coarseLag - startCoarse) / COARSE_RATE;
        const fineOffsetSec = (fineLag - startFine) / FINE_RATE;

        // Eşik değeri (Threshold): Eğer belirli bir eşleşme yoksa (silence/gürültü) bloğu dahil etme
        // Not: fineConf dar bir alanda hesaplandığı için ortalaması aşırı yüksektir ve 0.3'ün altında kalır.
        // Orijinal geniş alan güvenirliği olan coarseConf baz alınmalıdır.
        if (coarseConf >= 0.3) {
            offsets.push({ coarseOffsetSec, fineOffsetSec, confidence: coarseConf });
        }
    }

    // Step 4: Mode-based Validation
    // Bucket offsets by 20ms windows to determine final offset
    const buckets = new Map<number, typeof offsets>();
    for (const off of offsets) {
        const bucket = Math.round(off.fineOffsetSec * 50); // 50 buckets per sec
        if (!buckets.has(bucket)) buckets.set(bucket, []);
        buckets.get(bucket)!.push(off);
    }

    let largestBucket: typeof offsets = [];
    for (const items of buckets.values()) {
        if (items.length > largestBucket.length) {
            largestBucket = items;
        }
    }

    if (largestBucket.length === 0) {
        self.postMessage({ offsetSeconds: 0, confidence: 0, coarseOffset: 0, fineOffset: 0 });
        return;
    }

    let sumFine = 0;
    let sumCoarse = 0;
    let sumConf = 0;
    for (const off of largestBucket) {
        sumFine += off.fineOffsetSec;
        sumCoarse += off.coarseOffsetSec;
        sumConf += off.confidence;
    }

    const n = largestBucket.length;
    let finalConfidence = sumConf / n;

    // Penalty for inconsistency: if blocks disagree, or discarded due to low confidence
    const consistencyRatio = n / numBlocks;
    finalConfidence *= consistencyRatio;

    const finalFineOffset = sumFine / n;
    const finalCoarseOffset = sumCoarse / n;

    // Step 5: Post final result (NCC integrated via computeNCC already)
    // Matematiksel olarak "lag", Video[i] = Audio[i + lag] formülünden gelir.
    // Eğer Audio 18s sonra başlıyorsa, lag negatiftir (-18s).
    // Ancak UI tarafında "Audio starts later" pozitiftir (+18s). Bu yüzden ters çeviriyoruz.
    const result: SyncWorkerOutput = {
        offsetSeconds: -finalFineOffset, 
        confidence: finalConfidence,
        fineOffset: -finalFineOffset,
        coarseOffset: -finalCoarseOffset
    };

    self.postMessage(result);
};
