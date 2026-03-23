/**
 * Auto-sync utility: finds the time offset between two audio tracks
 * using Web Worker for CPU-intensive cross-correlation.
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
const MAX_OFFSET_SECONDS = 60;  // Maximum expected drift between tracks

/**
 * Run the CPU-intensive correlation in a Web Worker.
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
        } catch (err) {
            // Worker desteklenmiyorsa veya başka hata varsa direkt reddet (Main thread fallback iptal edildi)
            reject(new Error("Web Worker başlatılamadı. Senkronizasyon işlemi için Worker desteği gereklidir."));
        }
    });
}

/**
 * Main entry point: auto-sync two media files.
 *
 * Architecture:
 * 1. Decode to tiny WAV chunks using Native FFmpeg (disk-based, memory-safe).
 * 2. Fetch those chunks into memory.
 * 3. Offload format + cross-correlation to Web Worker.
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

    // Step 1: Decode to mono PCM
    const [videoSamples, audioSamples] = await Promise.all([
        decodeToMono(videoPath, TARGET_SAMPLE_RATE, MAX_DECODE_DURATION_S),
        decodeToMono(audioPath, TARGET_SAMPLE_RATE, MAX_DECODE_DURATION_S),
    ]);

    onProgress?.(0.4);

    // Step 2 + 3: Offload heavy processing to Web Worker
    const result = await runCorrelationInWorker(videoSamples, audioSamples);

    onProgress?.(1.0);

    return result;
}
