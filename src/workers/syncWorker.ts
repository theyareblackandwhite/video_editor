/**
 * Web Worker for CPU-intensive sync correlation.
 *
 * Receives two Float32Arrays (reference + target), runs normalize + findBestLag,
 * and posts back the result. This keeps the main thread free for UI.
 */

/* ── Constants (duplicated from autoSync.ts to keep worker self-contained) ── */
const ENVELOPE_RATE = 100;
const ANALYSIS_CHUNK_SECONDS = 30;

/* ── Pure functions (same as autoSync.ts exports) ── */

function extractEnvelope(signal: Float32Array, sampleRate: number, targetEnvelopeRate: number = 100): Float32Array {
    const samplesPerBlock = Math.floor(sampleRate / targetEnvelopeRate);
    const envelopeLength = Math.floor(signal.length / samplesPerBlock);
    const envelope = new Float32Array(envelopeLength);

    // Apply pre-emphasis to highlight transients/claps
    let prevSample = 0;

    for (let i = 0; i < envelopeLength; i++) {
        let maxAmp = 0;
        const offset = i * samplesPerBlock;
        for (let j = 0; j < samplesPerBlock; j++) {
            // First-order difference highlights high-frequency transients
            const currentSample = signal[offset + j];
            const diff = Math.abs(currentSample - prevSample);
            prevSample = currentSample;

            // Peak picking within the block preserves sharp spikes better than averaging
            if (diff > maxAmp) {
                maxAmp = diff;
            }
        }
        envelope[i] = maxAmp;
    }

    let mean = 0;
    for (let i = 0; i < envelope.length; i++) {
        mean += envelope[i];
    }
    mean /= envelope.length;

    for (let i = 0; i < envelope.length; i++) {
        envelope[i] -= mean;
    }

    return envelope;
}

function computeCorrelation(
    ref: Float32Array,
    target: Float32Array,
    lag: number
): number {
    const start = Math.max(0, -lag);
    const end = Math.min(ref.length, target.length - lag);

    if (start >= end) return 0;

    let sum = 0;
    for (let i = start; i < end; i++) {
        sum += ref[i] * target[i + lag];
    }

    return sum / (end - start);
}

function findBestLag(
    reference: Float32Array,
    target: Float32Array,
    maxLagSamples: number
): { bestLag: number; confidence: number } {

    const chunkSize = Math.min(
        reference.length,
        target.length,
        ENVELOPE_RATE * ANALYSIS_CHUNK_SECONDS
    );
    const refChunk = reference.slice(0, chunkSize);

    let bestCorrelation = -Infinity;
    let bestLag = 0;

    let sumCorrelations = 0;
    let correlationCount = 0;

    for (let lag = -maxLagSamples; lag <= maxLagSamples; lag++) {
        const corr = computeCorrelation(refChunk, target, lag);
        sumCorrelations += Math.abs(corr);
        correlationCount++;

        if (corr > bestCorrelation) {
            bestCorrelation = corr;
            bestLag = lag;
        }
    }

    const avgCorrelation = sumCorrelations / correlationCount;
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
}

self.onmessage = (e: MessageEvent<SyncWorkerInput>) => {
    const { videoSamples, audioSamples, maxOffsetSeconds, sampleRate } = e.data;

    // Step 1: Extract zero-mean envelope
    const envVideo = extractEnvelope(videoSamples, sampleRate, ENVELOPE_RATE);
    const envAudio = extractEnvelope(audioSamples, sampleRate, ENVELOPE_RATE);

    // Step 2: Cross-correlate
    const maxLagSamples = Math.floor(maxOffsetSeconds * ENVELOPE_RATE);
    const { bestLag, confidence } = findBestLag(envVideo, envAudio, maxLagSamples);

    // Step 3: Convert to seconds
    const offsetSeconds = bestLag / ENVELOPE_RATE;

    const result: SyncWorkerOutput = { offsetSeconds, confidence };
    self.postMessage(result);
};
