/**
 * Auto-sync utility: finds the time offset between two audio tracks
 * using cross-correlation in the time domain.
 *
 * Both tracks should contain the same audio content recorded from
 * different sources (e.g., camera mic vs. external mic).
 */

import { MAX_DECODE_DURATION_S } from '../../../shared/utils/fileValidation';

import { decodeToMono } from '../../../shared/utils/audio';

export interface AutoSyncResult {
    /** Final best offset in seconds. Positive = audio starts later than video. */
    offsetSeconds: number;
    /** Confidence score 0–1. Higher = more reliable. */
    confidence: number;
    /** Fine-grained search best offset */
    fineOffset?: number;
    /** Coarse-grained search best offset */
    coarseOffset?: number;
}

export const TARGET_SAMPLE_RATE = 8000; // Downsample to 8kHz for speed
const MAX_OFFSET_SECONDS = 30;  // Maximum expected drift between tracks
const envelopeCache = new WeakMap<Float32Array, Map<number, Float32Array>>();

/**
 * Extract a low-resolution envelope from a raw audio signal.
 * Instead of cross-correlating raw phase (which can be inverted or slightly shifted),
 * correlating the volume envelope is vastly more robust against different mics,
 * noise profiles, and slight pitch shifts.
 */
export function extractEnvelope(signal: Float32Array, sampleRate: number, targetEnvelopeRate: number = 100): Float32Array {
    // Check cache: signal object + targetEnvelopeRate
    let signalCache = envelopeCache.get(signal);
    if (!signalCache) {
        signalCache = new Map();
        envelopeCache.set(signal, signalCache);
    }

    const cached = signalCache.get(targetEnvelopeRate);
    if (cached) return cached;

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

    // Zero-mean the envelope so silent parts don't artificially inflate correlation
    let mean = 0;
    for (let i = 0; i < envelope.length; i++) {
        mean += envelope[i];
    }
    mean /= envelope.length;

    for (let i = 0; i < envelope.length; i++) {
        envelope[i] -= mean;
    }

    signalCache.set(targetEnvelopeRate, envelope);
    return envelope;
}

/**
 * Compute cross-correlation between two signals at various lag values.
 * Uses a two-pass approach for accuracy and speed.
 */
export function findBestLag(
    reference: Float32Array,
    target: Float32Array,
    maxLagSamples: number
): { bestLag: number; confidence: number } {
    const chunkSize = Math.min(reference.length, target.length, 3000); // 30s at 100Hz
    const refChunk = reference.slice(0, chunkSize);

    let bestCorrelation = -Infinity;
    let bestLag = 0;
    let sumCorrelations = 0;
    let correlationCount = 0;

    // We can just scan every single lag because envelope rate is so low (e.g. 100Hz).
    for (let lag = -maxLagSamples; lag <= maxLagSamples; lag++) {
        const corr = computeCorrelation(refChunk, target, lag);
        sumCorrelations += Math.abs(corr);
        correlationCount++;

        if (corr > bestCorrelation) {
            bestCorrelation = corr;
            bestLag = lag;
        }
    }

    // Compute confidence: ratio of best correlation to average
    const avgCorrelation = sumCorrelations / correlationCount;
    // With zero-mean envelopes, a good match is usually significantly higher than the noise floor
    const confidence = avgCorrelation > 0
        ? Math.min(1, bestCorrelation / (avgCorrelation * 5))
        : 0;

    return { bestLag, confidence };
}

/**
 * Compute normalized cross-correlation at a specific lag.
 */
export function computeCorrelation(
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

    // Normalize by the overlap length to prevent biasing towards smaller lags (larger overlaps)
    return sum / (end - start);
}

/**
 * Run the CPU-intensive correlation in a Web Worker.
 * Falls back to main-thread execution if Worker creation fails.
 */
function runCorrelationInWorker(
    videoSamples: Float32Array,
    audioSamples: Float32Array
): Promise<AutoSyncResult> {
    return new Promise((resolve, reject) => {
        try {
            const worker = new Worker(
                new URL('../workers/syncWorker.ts', import.meta.url),
                { type: 'module' }
            );

            worker.onmessage = (e: MessageEvent<AutoSyncResult>) => {
                resolve(e.data);
                worker.terminate();
            };

            worker.onerror = (err) => {
                worker.terminate();
                reject(new Error(`Worker hatası: ${err.message}`));
            };

            // Transfer buffers (zero-copy) — note: originals become unusable
            worker.postMessage(
                {
                    videoSamples,
                    audioSamples,
                    maxOffsetSeconds: MAX_OFFSET_SECONDS,
                    sampleRate: TARGET_SAMPLE_RATE,
                },
                [videoSamples.buffer, audioSamples.buffer]
            );
        } catch {
            // Worker not supported or creation failed → fallback to main thread
            const targetEnvelopeRate = 100;
            const envVideo = extractEnvelope(videoSamples, TARGET_SAMPLE_RATE, targetEnvelopeRate);
            const envAudio = extractEnvelope(audioSamples, TARGET_SAMPLE_RATE, targetEnvelopeRate);

            const maxLagSamples = Math.floor(MAX_OFFSET_SECONDS * targetEnvelopeRate);

            const { bestLag, confidence } = findBestLag(envVideo, envAudio, maxLagSamples);

            const offset = bestLag / targetEnvelopeRate;
            resolve({
                offsetSeconds: offset,
                confidence,
                fineOffset: offset,
                coarseOffset: offset,
            });
        }
    });
}

/**
 * Main entry point: auto-sync two media files.
 *
 * Architecture:
 * 1. Decode to tiny WAV chunks using Native FFmpeg (disk-based, memory-safe).
 * 2. Fetch those chunks into memory.
 * 3. Offload normalize + cross-correlation to Web Worker.
 *
 * @param videoPath - The absolute path of the video file
 * @param audioPath - The absolute path of the external audio file
 * @param onProgress - Optional progress callback (0-1)
 * @returns The offset and confidence
 */
export async function autoSyncFiles(
    videoPath: string,
    audioPath: string,
    onProgress?: (progress: number) => void
): Promise<AutoSyncResult> {
    onProgress?.(0.1);

    // native FFmpeg extracts only what's needed, very memory efficient.
    // Memory limit checks on the original file sizes are no longer applicable.

    // Step 1: Extract 3 mins & decode to mono PCM
    const [videoSamples, audioSamples] = await Promise.all([
        decodeToMono(videoPath, TARGET_SAMPLE_RATE, MAX_DECODE_DURATION_S),
        decodeToMono(audioPath, TARGET_SAMPLE_RATE, MAX_DECODE_DURATION_S),
    ]);

    onProgress?.(0.4);

    // Step 2 + 3: Normalize & correlate in Web Worker (off main thread)
    const result = await runCorrelationInWorker(videoSamples, audioSamples);

    onProgress?.(1.0);

    return result;
}

/**
 * Detect silences in an audio/video file.
 * Returns an array of cut segments representing the silence regions.
 *
 * @param file The media file to analyze
 * @param thresholdDb The volume threshold in dB (e.g. -35)
 * @param minDurationSeconds The minimum duration in seconds to consider it a silence
 */

