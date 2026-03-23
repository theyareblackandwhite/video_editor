/**
 * Web Worker for CPU-intensive sync correlation.
 *
 * Implements a Coarse-to-Fine search with RMS Envelope
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
    for (let i = 0; i < env.length; i++) {
        env[i] -= mean;
    }

    return env;
}

function extractTransientEnvelope(signal: Float32Array, sampleRate: number, targetRate: number): Float32Array {
    const samplesPerBlock = Math.floor(sampleRate / targetRate);
    const envLength = Math.floor(signal.length / samplesPerBlock);
    const envelope = new Float32Array(envLength);

    for (let i = 0; i < envLength; i++) {
        let sumSquared = 0;
        const offset = i * samplesPerBlock;
        for (let j = 0; j < samplesPerBlock; j++) {
            const currentSample = signal[offset + j];
            // RMS (Root Mean Square) - Enerji yoğunluğunu hesapla
            sumSquared += currentSample * currentSample;
        }
        envelope[i] = Math.sqrt(sumSquared / samplesPerBlock);
    }

    // "Transients" - Sinyalin değişim oranına bakarak sesin başladığı anları parlat
    // current - previous, sadece artışları (pozitif) al
    const deltaEnvelope = new Float32Array(envLength);
    for (let i = 0; i < envLength - 1; i++) {
        const diff = envelope[i + 1] - envelope[i];
        deltaEnvelope[i] = diff > 0 ? diff : 0;
    }
    // Son eleman padding olarak 0 kalır

    // Korelasyon kalitesi için tüm sinyali Zero-mean yapıyoruz
    return normalizeEnvelope(deltaEnvelope);
}

function computeCorrelation(ref: Float32Array, target: Float32Array, lag: number): number {
    const start = Math.max(0, -lag);
    const end = Math.min(ref.length, target.length - lag);
    const overlap = end - start;

    if (overlap < ref.length * 0.1) return 0; // Çok küçük kesişimlerde geçersiz say

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
    // Sinyaller Zero-mean olduğu için saf Pearson korelasyon kat sayısı hesaplanıyor
    // Değer her zaman [-1, 1] aralığında olur
    const ncc = sumDot / Math.sqrt(sumRefSq * sumTgtSq);

    // Kısmi overlap durumlarında rastgele yüksek eşleşmeleri engellemek için
    // overlap oranına göre penaltı uygula
    const overlapRatio = overlap / ref.length;
    return ncc * overlapRatio;
}

function findBestLagInRange(
    refChunk: Float32Array,
    target: Float32Array,
    minLag: number,
    maxLag: number
): { bestLag: number; confidence: number } {
    let bestCorrelation = -Infinity;
    let bestLag = 0;
    
    const corrs: number[] = [];

    // Expand search space to integer lag bounds
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
    
    // Z-score calculation to find how much of an outlier the best lag is
    let zScore = 0;
    if (std > 0) {
        zScore = (bestCorrelation - mean) / std;
    }

    return { bestLag, confidence: zScore };
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

    // Prepare Coarse & Fine Transient Envelopes (Step 2 RMS Extraction applies inside)
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

    // Step 3: Two-stage search inside Mode validation blocks
    for (let i = 0; i < numBlocks; i++) {
        const startCoarse = i * blockLenCoarse;
        const endCoarse = Math.min(startCoarse + blockLenCoarse, refEnvCoarse.length);
        const refChunkCoarse = refEnvCoarse.subarray(startCoarse, endCoarse);

        // Kaba Arama (Coarse): (-30s, +30s) global offset
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
        const coarseOffsetSec = (coarseLag - startCoarse) / COARSE_RATE;
        const fineOffsetSec = (fineLag - startFine) / FINE_RATE;

        // Step 5 pt1: Eşik değeri (Threshold): Eğer belirli bir eşleşme yoksa bloğu dahil etme
        // Mode (Bucket) analizi için sadece belirli bir güvenilirliğe ulaşmış blokları kovalara al.
        // Z-score metriği kullanıyoruz. 3.0 z-score veya üzeri, istatistiksel olarak anlamlı bir "outlier" zirvesidir.
        if (coarseConf >= 3.0) {
            offsets.push({ coarseOffsetSec, fineOffsetSec, confidence: coarseConf });
        }
    }

    // Step 5 pt2: Mode-based Validation
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
