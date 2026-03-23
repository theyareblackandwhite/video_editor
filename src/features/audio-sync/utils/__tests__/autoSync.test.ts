import { describe, it, expect } from 'vitest';
import { extractTransientEnvelope, computeCorrelation, findBestLagInRange } from '../syncMath';

describe('extractTransientEnvelope', () => {
    it('extracts a simple envelope and zero-means it', () => {
        const sampleRate = 8000;
        const envRate = 4000; // 2 samples per block
        // Block 1: [0.5, -0.5] -> RMS = sqrt((0.25+0.25)/2) = 0.5
        // Block 2: [1.0, -1.0] -> RMS = sqrt((1+1)/2) = 1.0
        // Envelope before diff: [0.5, 1.0]
        // Diff (Transients): [1.0-0.5] = [0.5]
        // Zero-mean of [0.5] = [0]
        const signal = new Float32Array([0.5, -0.5, 1.0, -1.0]);
        const result = extractTransientEnvelope(signal, sampleRate, envRate);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeCloseTo(0);
    });

    it('handles all-zero signal', () => {
        const signal = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]);
        const result = extractTransientEnvelope(signal, 8000, 4000);
        expect(result[0]).toBeCloseTo(0);
    });
});

describe('computeCorrelation', () => {
    it('returns high positive value for identical signals at lag 0', () => {
        const signal = new Float32Array([1, 0, -1, 0, 1, 0, -1, 0]);
        const corr = computeCorrelation(signal, signal, 0);
        expect(corr).toBeGreaterThan(0);
    });

    it('returns negative value for opposite signals at lag 0', () => {
        const ref = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
        const target = new Float32Array([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
        const corr = computeCorrelation(ref, target, 0);
        expect(corr).toBeLessThan(0);
    });

    it('returns 0 for orthogonal signals', () => {
        const ref = new Float32Array([1, -1, 1, -1, 1, -1, 1, -1, 1, -1]);
        const target = new Float32Array([1, 1, -1, -1, 1, 1, -1, -1, 1, 1]);
        const corr = computeCorrelation(ref, target, 0);
        expect(corr).toBeCloseTo(0);
    });

    it('handles out-of-bounds lag gracefully', () => {
        const ref = new Float32Array([1, 2, 3]);
        const target = new Float32Array([1, 2, 3]);
        const corr = computeCorrelation(ref, target, 100);
        expect(corr).toBe(0);
    });

    it('finds peak correlation at known lag', () => {
        const ref = new Float32Array([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
        const target = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
        const corrAtLag2 = computeCorrelation(ref, target, 2);
        const corrAtLag0 = computeCorrelation(ref, target, 0);
        expect(corrAtLag2).toBeGreaterThan(corrAtLag0);
    });
});

describe('findBestLagInRange', () => {
    it('returns lag close to 0 for identical signals', () => {
        const signal = new Float32Array(1000);
        for (let i = 0; i < 1000; i++) {
            signal[i] = Math.sin(i * 0.1);
        }
        const { bestLag, confidence } = findBestLagInRange(signal, signal, -100, 100);
        expect(Math.abs(bestLag)).toBeLessThan(5);
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

        const { bestLag } = findBestLagInRange(ref, target, 0, 200);
        expect(Math.abs(bestLag - shift)).toBeLessThan(2);
    });

    it('returns confidence > 0 for correlated signals', () => {
        const signal = new Float32Array(500);
        for (let i = 0; i < 500; i++) {
            signal[i] = Math.sin(i * 0.1);
        }
        const { confidence } = findBestLagInRange(signal, signal, -50, 50);
        expect(confidence).toBeGreaterThan(0);
    });
});

