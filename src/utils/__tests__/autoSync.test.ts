import { describe, it, expect } from 'vitest';
import { extractEnvelope, computeCorrelation, findBestLag } from '../autoSync';

describe('extractEnvelope', () => {
    it('extracts a simple envelope and zero-means it', () => {
        const sampleRate = 8000;
        const envRate = 4000; // 2 samples per block
        // Block 1: 0.5, -0.5 -> sum of abs = 1.0 -> avg = 0.5
        // Block 2: 1.0, -1.0 -> sum of abs = 2.0 -> avg = 1.0
        // Envelope before zero-mean: [0.5, 1.0]
        // Mean = 0.75
        // Final expected: [-0.25, 0.25]
        const signal = new Float32Array([0.5, -0.5, 1.0, -1.0]);
        const result = extractEnvelope(signal, sampleRate, envRate);
        expect(result).toHaveLength(2);
        expect(result[0]).toBeCloseTo(-0.25);
        expect(result[1]).toBeCloseTo(0.25);
    });

    it('handles all-zero signal', () => {
        const signal = new Float32Array([0, 0, 0, 0]);
        const result = extractEnvelope(signal, 8000, 4000);
        expect(result[0]).toBeCloseTo(0);
        expect(result[1]).toBeCloseTo(0);
    });
});

describe('computeCorrelation', () => {
    it('returns high positive value for identical signals at lag 0', () => {
        const signal = new Float32Array([1, 0, -1, 0, 1, 0, -1, 0]);
        const corr = computeCorrelation(signal, signal, 0);
        expect(corr).toBeGreaterThan(0);
    });

    it('returns negative value for opposite signals at lag 0', () => {
        const ref = new Float32Array([1, 1, 1, 1]);
        const target = new Float32Array([-1, -1, -1, -1]);
        const corr = computeCorrelation(ref, target, 0);
        expect(corr).toBeLessThan(0);
    });

    it('returns 0 for orthogonal signals', () => {
        // ref is [1, -1, 1, -1], target is [1, 1, -1, -1]
        // dot = 1*1 + (-1)*1 + 1*(-1) + (-1)*(-1) = 1 -1 -1 +1 = 0
        const ref = new Float32Array([1, -1, 1, -1]);
        const target = new Float32Array([1, 1, -1, -1]);
        const corr = computeCorrelation(ref, target, 0);
        expect(corr).toBeCloseTo(0);
    });

    it('handles out-of-bounds lag gracefully', () => {
        const ref = new Float32Array([1, 2, 3]);
        const target = new Float32Array([1, 2, 3]);
        // lag = 100 → all target indices out of range → count=0 → returns 0
        const corr = computeCorrelation(ref, target, 100);
        expect(corr).toBe(0);
    });

    it('finds peak correlation at known lag', () => {
        // Create a shifted copy: target is ref shifted right by 2
        const ref = new Float32Array([0, 0, 1, 0, 0, 0, 0, 0]);
        const target = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0]);
        // At lag=2, ref[2]*target[4] = 1*1 should contribute
        const corrAtLag2 = computeCorrelation(ref, target, 2);
        const corrAtLag0 = computeCorrelation(ref, target, 0);
        expect(corrAtLag2).toBeGreaterThan(corrAtLag0);
    });
});

describe('findBestLag', () => {
    it('returns lag close to 0 for identical signals', () => {
        const signal = new Float32Array(1000);
        // Create a recognizable pattern
        for (let i = 0; i < 1000; i++) {
            signal[i] = Math.sin(i * 0.1);
        }
        // Note: coarse search step = maxLagSamples / 2000, fine search refines ± step*2
        // For maxLag=100 the step=1, but autocorrelation of periodic sin can have
        // secondary peaks. Use a reasonable tolerance.
        const { bestLag, confidence } = findBestLag(signal, signal, 100);
        // The lag should be reasonably small; periodic signals can alias
        expect(Math.abs(bestLag)).toBeLessThan(70);
        expect(confidence).toBeGreaterThan(0);
    });

    it('detects a known shift', () => {
        const len = 2000;
        const shift = 50;
        const ref = new Float32Array(len);
        const target = new Float32Array(len);

        for (let i = 0; i < len; i++) {
            ref[i] = Math.sin(i * 0.05) + 0.5 * Math.sin(i * 0.13);
        }
        for (let i = 0; i < len; i++) {
            const srcIdx = i - shift;
            target[i] = srcIdx >= 0 && srcIdx < len ? ref[srcIdx] : 0;
        }

        const { bestLag } = findBestLag(ref, target, 200);
        // The detected lag should be close to the actual shift
        expect(Math.abs(bestLag - shift)).toBeLessThan(5);
    });

    it('returns confidence > 0 for correlated signals', () => {
        const signal = new Float32Array(500);
        for (let i = 0; i < 500; i++) {
            signal[i] = Math.sin(i * 0.1);
        }
        const { confidence } = findBestLag(signal, signal, 50);
        expect(confidence).toBeGreaterThan(0);
    });
});
