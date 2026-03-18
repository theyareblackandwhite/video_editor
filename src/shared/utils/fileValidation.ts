/**
 * File size validation and memory estimation utilities.
 *
 * Browser-based decodeAudioData loads the entire file into memory.
 * These utilities provide safety guards against tab crashes.
 */

/* ── Limits (MB) ── */
export const FILE_SIZE_LIMITS = {
    VIDEO_WARN_MB: 500,
    VIDEO_MAX_MB: 2048,
    AUDIO_WARN_MB: 200,
    AUDIO_MAX_MB: 1024,
} as const;

/**
 * Empirical multiplier: raw PCM in memory ≈ 2–4× the compressed file size.
 * We use 3 as a reasonable middle ground.
 */
export const MEMORY_MULTIPLIER = 3;

/** Maximum audio duration (seconds) to decode for sync correlation. */
export const MAX_DECODE_DURATION_S = 180; // 3 minutes as requested

/* ── Helpers ── */

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Format bytes into a human-readable string (KB / MB / GB).
 */
export function formatFileSize(bytes: number): string {
    if (bytes < MB) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }
    if (bytes < GB) {
        return `${(bytes / MB).toFixed(1)} MB`;
    }
    return `${(bytes / GB).toFixed(2)} GB`;
}

/* ── Validation ── */

export interface FileSizeValidation {
    /** true if the file can be used */
    ok: boolean;
    /** Non-blocking warning message (file usable but risky) */
    warning?: string;
    /** Blocking error message (file rejected) */
    error?: string;
}

/**
 * Validate file size against thresholds.
 * Returns Turkish-language messages for the UI.
 */
export function validateFileSize(
    size: number,
    type: 'video' | 'audio'
): FileSizeValidation {
    const sizeMB = size / MB;
    const maxMB = type === 'video' ? FILE_SIZE_LIMITS.VIDEO_MAX_MB : FILE_SIZE_LIMITS.AUDIO_MAX_MB;
    const warnMB = type === 'video' ? FILE_SIZE_LIMITS.VIDEO_WARN_MB : FILE_SIZE_LIMITS.AUDIO_WARN_MB;
    const label = type === 'video' ? 'Video' : 'Ses';

    if (sizeMB > maxMB) {
        return {
            ok: false,
            error: `${label} dosyası çok büyük (${formatFileSize(size)}). Maksimum izin verilen boyut ${formatFileSize(maxMB * MB)}. Lütfen daha küçük bir dosya seçin.`,
        };
    }

    if (sizeMB > warnMB) {
        return {
            ok: true,
            warning: `${label} dosyası büyük (${formatFileSize(size)}). Tarayıcı performansı düşebilir veya bellek hatası oluşabilir.`,
        };
    }

    return { ok: true };
}

/**
 * Estimate peak memory usage (MB) when decoding a media file to raw PCM.
 */
export function estimateMemoryUsageMB(size: number): number {
    return (size / MB) * MEMORY_MULTIPLIER;
}

/**
 * Estimate peak memory (MB) specifically for the sync decode pipeline.
 *
 * Browser decodeAudioData requires the full compressed file in an ArrayBuffer,
 * then produces a decoded AudioBuffer. However, we only use at most
 * `maxDurationS` seconds re-sampled to `targetSampleRate` Hz mono (Float32).
 *
 * Peak memory ≈ compressed ArrayBuffer + intermediate decoded AudioBuffer + output PCM.
 * The intermediate AudioBuffer is the largest unknown — we estimate it as
 * size × 1.5 (stereo 16-bit decode is roughly 2×, but codecs vary).
 */
export function estimateSyncMemoryMB(
    size: number,
    maxDurationS: number = MAX_DECODE_DURATION_S,
    targetSampleRate: number = 8000
): number {
    const compressedMB = size / MB;
    // Intermediate AudioBuffer: conservative 1.5× of compressed size
    const decodedEstimateMB = compressedMB * 1.5;
    // Final mono Float32 output (tiny): maxDurationS × sampleRate × 4 bytes
    const outputMB = (maxDurationS * targetSampleRate * 4) / MB;
    return compressedMB + decodedEstimateMB + outputMB;
}
