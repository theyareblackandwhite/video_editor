import { describe, it, expect } from 'vitest';
import { createSyntheticSignal, validateCorrelationResult } from './syncHarness';
import { createFFmpegHarness } from './ffmpegHarness';

describe('Harness Infrastructure Verification', () => {
    describe('SyncHarness', () => {
        it('generates synthetic signals with correct peaks', () => {
            const peaks = [100, 500];
            const signal = createSyntheticSignal(1000, 44100, peaks);
            expect(signal.data[100]).toBe(1.0);
            expect(signal.data[500]).toBe(1.0);
            expect(signal.data[0]).toBeLessThan(0.1);
        });

        it('validates correlation results correctly', () => {
            const result = validateCorrelationResult(50, 51, 2);
            expect(result.isValid).toBe(true);
            expect(result.error).toBe(1);

            const failResult = validateCorrelationResult(50, 100, 2);
            expect(failResult.isValid).toBe(false);
        });
    });

    describe('FFmpegMockHarness', () => {
        it('simulates file system and CLI execution', async () => {
            const ffmpeg = createFFmpegHarness();
            await ffmpeg.load();
            
            const mockData = new Uint8Array([1, 2, 3]);
            await ffmpeg.writeFile('input.mp4', mockData);
            
            await ffmpeg.exec(['-i', 'input.mp4', 'output.mp3']);
            
            expect(ffmpeg.lastCommand).toContain('input.mp4');
            const readBack = await ffmpeg.readFile('input.mp4');
            expect(readBack).toEqual(mockData);
        });

        it('throws if input file is missing in virtual FS', async () => {
            const ffmpeg = createFFmpegHarness();
            await expect(ffmpeg.exec(['-i', 'missing.mp4', 'out.mp3']))
                .rejects.toThrow('Input file \'missing.mp4\' not found');
        });
    });
});
