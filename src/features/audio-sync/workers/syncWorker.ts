import { 
    bandpassFilter, 
    extractTransientEnvelope, 
    findBestLagInRange 
} from '../utils/syncMath';

const COARSE_RATE = 100;
const FINE_RATE = 1000;
const BLOCK_SECONDS = 30;

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
        
        const { bestLag: fineLag } = findBestLagInRange(
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
        console.log(`[SyncBlock ${i}] offset: ${fineOffsetSec.toFixed(3)}s, Z: ${coarseConf.toFixed(2)}`);
        if (coarseConf >= 3.0) {
            offsets.push({ coarseOffsetSec, fineOffsetSec, confidence: coarseConf });
        }
    }

    // Step 5 pt2: Mode-based Validation
    // Bucket offsets by 500ms windows to determine final offset
    // Drift (sample rate mismatch) causes offsets to vary across blocks, so narrow buckets fail.
    const buckets = new Map<number, typeof offsets>();
    for (const off of offsets) {
        const bucket = Math.round(off.fineOffsetSec * 2); // 2 buckets per sec (500ms)
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
