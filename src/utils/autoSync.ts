/**
 * Auto-sync utility: finds the time offset between two audio tracks
 * using cross-correlation in the time domain.
 *
 * Both tracks should contain the same audio content recorded from
 * different sources (e.g., camera mic vs. external mic).
 */

import { estimateSyncMemoryMB, MAX_DECODE_DURATION_S, formatFileSize } from './fileValidation';

import { type CutSegment } from '../store/useAppStore';

export interface AutoSyncResult {
    /** Offset in seconds. Positive = audio starts later than video. */
    offsetSeconds: number;
    /** Confidence score 0–1. Higher = more reliable. */
    confidence: number;
}

const TARGET_SAMPLE_RATE = 8000; // Downsample to 8kHz for speed
const MAX_OFFSET_SECONDS = 30;  // Maximum expected drift between tracks

/** Maximum combined memory (MB) allowed before aborting decode. */
const MAX_COMBINED_MEMORY_MB = 4096; // 4 GB — modern browsers handle this fine

/**
 * Decode a File to mono Float32Array at a target sample rate.
 * @param maxDuration If provided, only decode up to this many seconds.
 */
async function decodeToMono(
    file: File,
    sampleRate: number,
    maxDuration?: number
): Promise<Float32Array> {
    const arrayBuffer = await file.arrayBuffer();

    // Use OfflineAudioContext to decode & resample in one step
    const tempCtx = new AudioContext();
    const decoded = await tempCtx.decodeAudioData(arrayBuffer);
    await tempCtx.close();

    const useDuration = maxDuration
        ? Math.min(decoded.duration, maxDuration)
        : decoded.duration;
    const length = Math.ceil(useDuration * sampleRate);

    const offlineCtx = new OfflineAudioContext(1, length, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0, 0, useDuration);

    const rendered = await offlineCtx.startRendering();
    return rendered.getChannelData(0);
}

/**
 * Normalize a signal to [-1, 1] range.
 */
export function normalize(signal: Float32Array): Float32Array {
    let max = 0;
    for (let i = 0; i < signal.length; i++) {
        const abs = Math.abs(signal[i]);
        if (abs > max) max = abs;
    }
    if (max === 0) return signal;

    const result = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i++) {
        result[i] = signal[i] / max;
    }
    return result;
}

/**
 * Compute cross-correlation between two signals at various lag values.
 * Returns the lag (in samples) that produces the maximum correlation.
 */
export function findBestLag(
    reference: Float32Array,
    target: Float32Array,
    maxLagSamples: number
): { bestLag: number; confidence: number } {
    // Use a chunk of the reference signal for correlation
    // (don't need the entire signal, just enough to find the pattern)
    const chunkSize = Math.min(reference.length, target.length, TARGET_SAMPLE_RATE * 30); // 30s chunk
    const refChunk = reference.slice(0, chunkSize);

    let bestCorrelation = -Infinity;
    let bestLag = 0;
    let sumCorrelations = 0;
    let correlationCount = 0;

    // Test lags from -maxLagSamples to +maxLagSamples
    // Negative lag = target starts before reference
    // Positive lag = target starts after reference
    const step = Math.max(1, Math.floor(maxLagSamples / 2000)); // Coarse search first

    // Phase 1: Coarse search
    const coarseCandidates: number[] = [];
    for (let lag = -maxLagSamples; lag <= maxLagSamples; lag += step) {
        const corr = computeCorrelation(refChunk, target, lag);
        sumCorrelations += Math.abs(corr);
        correlationCount++;

        if (corr > bestCorrelation) {
            bestCorrelation = corr;
            bestLag = lag;
        }
        coarseCandidates.push(lag);
    }

    // Phase 2: Fine search around the best coarse candidate
    const fineRange = step * 2;
    for (let lag = bestLag - fineRange; lag <= bestLag + fineRange; lag++) {
        if (lag < -maxLagSamples || lag > maxLagSamples) continue;
        const corr = computeCorrelation(refChunk, target, lag);

        if (corr > bestCorrelation) {
            bestCorrelation = corr;
            bestLag = lag;
        }
    }

    // Compute confidence: ratio of best correlation to average
    const avgCorrelation = sumCorrelations / correlationCount;
    const confidence = avgCorrelation > 0
        ? Math.min(1, bestCorrelation / (avgCorrelation * 3))
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

            worker.onmessage = (e: MessageEvent<{ offsetSeconds: number; confidence: number }>) => {
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
            const normVideo = normalize(videoSamples);
            const normAudio = normalize(audioSamples);
            const maxLagSamples = Math.floor(MAX_OFFSET_SECONDS * TARGET_SAMPLE_RATE);
            const { bestLag, confidence } = findBestLag(normVideo, normAudio, maxLagSamples);
            resolve({
                offsetSeconds: bestLag / TARGET_SAMPLE_RATE,
                confidence,
            });
        }
    });
}

/**
 * Main entry point: auto-sync two media files.
 *
 * Architecture:
 * 1. Decode on main thread (AudioContext required)
 * 2. Offload normalize + cross-correlation to Web Worker
 *
 * @param videoFile - The video file (reference track)
 * @param audioFile - The external audio file (to be aligned)
 * @param onProgress - Optional progress callback (0-1)
 * @returns The offset and confidence
 */
export async function autoSyncFiles(
    videoFile: File,
    audioFile: File,
    onProgress?: (progress: number) => void
): Promise<AutoSyncResult> {
    onProgress?.(0.1);

    // Step 0: Pre-decode memory safety check
    // Use sync-specific estimation that accounts for the actual decode pipeline:
    //   compressed ArrayBuffer + intermediate AudioBuffer + tiny resampled output
    const estimatedMB =
        estimateSyncMemoryMB(videoFile, MAX_DECODE_DURATION_S, TARGET_SAMPLE_RATE) +
        estimateSyncMemoryMB(audioFile, MAX_DECODE_DURATION_S, TARGET_SAMPLE_RATE);
    if (estimatedMB > MAX_COMBINED_MEMORY_MB) {
        throw new Error(
            `Toplam tahmini bellek kullanımı çok yüksek (${formatFileSize(estimatedMB * 1024 * 1024)}). ` +
            `Tarayıcı çökebilir. Lütfen daha küçük dosyalar kullanın.`
        );
    }

    // Step 1: Decode both files to mono PCM (main thread — AudioContext required)
    const [videoSamples, audioSamples] = await Promise.all([
        decodeToMono(videoFile, TARGET_SAMPLE_RATE, MAX_DECODE_DURATION_S),
        decodeToMono(audioFile, TARGET_SAMPLE_RATE, MAX_DECODE_DURATION_S),
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
export async function detectSilences(
    file: File,
    thresholdDb: number,
    minDurationSeconds: number
): Promise<CutSegment[]> {
    // 1. Decode the file to mono audio (we can use a lower sample rate like 8kHz to speed this up,
    //    but we need to decode the FULL file, not just MAX_DECODE_DURATION_S).
    // Note: decodeToMono takes maxDuration, but we pass undefined to decode everything.
    const sampleRate = 8000;
    const samples = await decodeToMono(file, sampleRate);

    // 2. Convert thresholdDb to linear amplitude
    // dB = 20 * log10(amplitude) => amplitude = 10 ^ (dB / 20)
    const thresholdLinear = Math.pow(10, thresholdDb / 20);

    const minSamples = Math.floor(minDurationSeconds * sampleRate);
    const cuts: CutSegment[] = [];

    let silenceStartSample = -1;

    // To avoid cutting off words too sharply, we use a small sliding window or just simple state machine.
    // For performance, we check chunks (e.g. 0.1s chunks) to see if the max amplitude is below threshold.
    const chunkSize = Math.floor(0.1 * sampleRate);

    for (let i = 0; i < samples.length; i += chunkSize) {
        const endIdx = Math.min(i + chunkSize, samples.length);

        // Find max absolute amplitude in this chunk
        let maxAmp = 0;
        for (let j = i; j < endIdx; j++) {
            const abs = Math.abs(samples[j]);
            if (abs > maxAmp) {
                maxAmp = abs;
            }
        }

        const isSilent = maxAmp < thresholdLinear;

        if (isSilent) {
            if (silenceStartSample === -1) {
                silenceStartSample = i;
            }
        } else {
            if (silenceStartSample !== -1) {
                // End of silence
                const silenceSamples = i - silenceStartSample;
                if (silenceSamples >= minSamples) {
                    cuts.push({
                        id: `auto-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                        start: silenceStartSample / sampleRate,
                        end: i / sampleRate
                    });
                }
                silenceStartSample = -1;
            }
        }
    }

    // Handle case where file ends with silence
    if (silenceStartSample !== -1) {
        const silenceSamples = samples.length - silenceStartSample;
        if (silenceSamples >= minSamples) {
            cuts.push({
                id: `auto-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                start: silenceStartSample / sampleRate,
                end: samples.length / sampleRate
            });
        }
    }

    return cuts;
}
