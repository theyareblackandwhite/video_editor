import { describe, it, expect } from 'vitest';
import {
    formatFileSize,
    validateFileSize,
    estimateMemoryUsageMB,
    estimateSyncMemoryMB,
    FILE_SIZE_LIMITS,
    MEMORY_MULTIPLIER,
    MAX_DECODE_DURATION_S,
} from '../fileValidation';

/* ── formatFileSize ── */

describe('formatFileSize', () => {
    it('formats bytes under 1 MB as KB', () => {
        expect(formatFileSize(512 * 1024)).toBe('512 KB');
    });

    it('formats bytes in MB range', () => {
        expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    });

    it('formats bytes in GB range', () => {
        expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
    });

    it('formats 0 bytes', () => {
        expect(formatFileSize(0)).toBe('0 KB');
    });

    it('formats exactly 1 GB', () => {
        expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    });
});

/* ── validateFileSize ── */

describe('validateFileSize', () => {
    const MB = 1024 * 1024;

    const makeFile = (sizeMB: number): File => {
        return { size: sizeMB * MB } as File;
    };

    it('returns ok for small video file', () => {
        const result = validateFileSize(makeFile(100), 'video');
        expect(result.ok).toBe(true);
        expect(result.warning).toBeUndefined();
        expect(result.error).toBeUndefined();
    });

    it('returns warning for video above warn threshold', () => {
        const result = validateFileSize(makeFile(FILE_SIZE_LIMITS.VIDEO_WARN_MB + 1), 'video');
        expect(result.ok).toBe(true);
        expect(result.warning).toBeDefined();
        expect(result.error).toBeUndefined();
    });

    it('returns error for video above max threshold', () => {
        const result = validateFileSize(makeFile(FILE_SIZE_LIMITS.VIDEO_MAX_MB + 1), 'video');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('returns ok for small audio file', () => {
        const result = validateFileSize(makeFile(50), 'audio');
        expect(result.ok).toBe(true);
        expect(result.warning).toBeUndefined();
    });

    it('returns warning for audio above warn threshold', () => {
        const result = validateFileSize(makeFile(FILE_SIZE_LIMITS.AUDIO_WARN_MB + 1), 'audio');
        expect(result.ok).toBe(true);
        expect(result.warning).toBeDefined();
    });

    it('returns error for audio above max threshold', () => {
        const result = validateFileSize(makeFile(FILE_SIZE_LIMITS.AUDIO_MAX_MB + 1), 'audio');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('includes file size in warning message', () => {
        const result = validateFileSize(makeFile(600), 'video');
        expect(result.warning).toContain('600.0 MB');
    });

    it('includes file size in error message', () => {
        const result = validateFileSize(makeFile(2100), 'video');
        expect(result.error).toContain('2.05 GB');
    });
});

/* ── estimateMemoryUsageMB ── */

describe('estimateMemoryUsageMB', () => {
    const MB = 1024 * 1024;

    it('estimates memory correctly', () => {
        const file = { size: 100 * MB } as File;
        expect(estimateMemoryUsageMB(file)).toBe(100 * MEMORY_MULTIPLIER);
    });

    it('returns 0 for empty file', () => {
        const file = { size: 0 } as File;
        expect(estimateMemoryUsageMB(file)).toBe(0);
    });
});

/* ── estimateSyncMemoryMB ── */

describe('estimateSyncMemoryMB', () => {
    const MB = 1024 * 1024;

    const makeFile = (sizeMB: number): File => {
        return { size: sizeMB * MB } as File;
    };

    it('estimates much less than file.size × 6 for large files', () => {
        // A 1 GB file should NOT produce a 6 GB estimate (the old bug)
        const file = makeFile(1024);
        const estimate = estimateSyncMemoryMB(file);
        // Should be roughly 1024 (compressed) + 1536 (decoded 1.5×) + tiny PCM
        // ≈ 2560 MB, NOT 6144 MB
        expect(estimate).toBeLessThan(3000);
        expect(estimate).toBeGreaterThan(2000);
    });

    it('produces small estimate for small files', () => {
        const file = makeFile(50);
        const estimate = estimateSyncMemoryMB(file);
        // 50 + 75 + tiny = ~125 MB
        expect(estimate).toBeLessThan(200);
    });

    it('returns near-zero for empty file', () => {
        const file = makeFile(0);
        const estimate = estimateSyncMemoryMB(file);
        // Only the tiny PCM output remains
        expect(estimate).toBeLessThan(5);
    });

    it('uses default duration and sample rate from constants', () => {
        const file = makeFile(100);
        const withDefaults = estimateSyncMemoryMB(file);
        const withExplicit = estimateSyncMemoryMB(file, MAX_DECODE_DURATION_S, 8000);
        expect(withDefaults).toBe(withExplicit);
    });

    it('allows a 1 GB video + 100 MB audio through the 4 GB limit', () => {
        const videoEstimate = estimateSyncMemoryMB(makeFile(1024));
        const audioEstimate = estimateSyncMemoryMB(makeFile(100));
        const combined = videoEstimate + audioEstimate;
        // Combined should be well under 4096 MB
        expect(combined).toBeLessThan(4096);
    });
});
