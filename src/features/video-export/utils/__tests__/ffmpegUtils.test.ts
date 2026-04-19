import { describe, it, expect } from 'vitest';
import {
    getKeepSegments,
    buildFFmpegCommand,
    classifyExportTier,
    buildConcatListContent,
} from '../ffmpegUtils';
import type { CutSegment } from '../../../../app/store';

/* ─── getKeepSegments ─── */

describe('getKeepSegments', () => {
    it('returns full duration when no cuts', () => {
        const result = getKeepSegments([], 60);
        expect(result).toEqual([{ start: 0, end: 60 }]);
    });

    it('returns two segments for a single middle cut', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 10, end: 20 }];
        const result = getKeepSegments(cuts, 60);
        expect(result).toEqual([
            { start: 0, end: 10 },
            { start: 20, end: 60 },
        ]);
    });

    it('handles cut at the very start', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 0, end: 10 }];
        const result = getKeepSegments(cuts, 60);
        expect(result).toEqual([{ start: 10, end: 60 }]);
    });

    it('handles cut at the very end', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 50, end: 60 }];
        const result = getKeepSegments(cuts, 60);
        expect(result).toEqual([{ start: 0, end: 50 }]);
    });

    it('merges overlapping cuts', () => {
        const cuts: CutSegment[] = [
            { id: '1', start: 5, end: 15 },
            { id: '2', start: 10, end: 25 },
        ];
        const result = getKeepSegments(cuts, 60);
        // Merged cut: 5–25
        expect(result).toEqual([
            { start: 0, end: 5 },
            { start: 25, end: 60 },
        ]);
    });

    it('handles adjacent non-overlapping cuts', () => {
        const cuts: CutSegment[] = [
            { id: '1', start: 10, end: 20 },
            { id: '2', start: 30, end: 40 },
        ];
        const result = getKeepSegments(cuts, 60);
        expect(result).toEqual([
            { start: 0, end: 10 },
            { start: 20, end: 30 },
            { start: 40, end: 60 },
        ]);
    });

    it('returns empty array when cut covers entire duration', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 0, end: 60 }];
        const result = getKeepSegments(cuts, 60);
        expect(result).toEqual([]);
    });

    it('handles unsorted cuts correctly', () => {
        const cuts: CutSegment[] = [
            { id: '2', start: 30, end: 40 },
            { id: '1', start: 10, end: 20 },
        ];
        const result = getKeepSegments(cuts, 60);
        expect(result).toEqual([
            { start: 0, end: 10 },
            { start: 20, end: 30 },
            { start: 40, end: 60 },
        ]);
    });

    it('handles cut with start equal to another cut end (touching)', () => {
        const cuts: CutSegment[] = [
            { id: '1', start: 10, end: 20 },
            { id: '2', start: 20, end: 30 },
        ];
        const result = getKeepSegments(cuts, 60);
        // These don't overlap (nextCut.start === currentCut.end, not <)
        // so they should NOT merge, but the gap between them is 0
        expect(result).toEqual([
            { start: 0, end: 10 },
            { start: 30, end: 60 },
        ]);
    });
});

/* ─── classifyExportTier ─── */

describe('classifyExportTier', () => {
    const baseConfig = {
        format: 'mp4' as const,
        quality: 'high' as const,
        includeAudio: true,
        applyCuts: false,
        normalizeAudio: false,
        layoutMode: 'crop' as const,
        transitionType: 'none' as const,
        borderRadius: 0,
    };
    const mockMasterVideo = {
        id: 'm1',
        path: '/m.mp4',
        name: 'm.mp4',
        type: 'video/mp4',
        size: 1000,
        syncOffset: 0,
        isMaster: true,
    };
    const mockAudio = { id: 'a1', path: '/a.mp3', name: 'a.mp3', type: 'audio/mp3', size: 500, syncOffset: 0 };

    it('returns full-copy for baseline passthrough', () => {
        expect(
            classifyExportTier(
                baseConfig,
                mockMasterVideo,
                [],
                [],
                [],
                60,
                false,
                false
            )
        ).toBe('full-copy');
    });

    it('returns single-segment-copy when one keep segment and cuts applied', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 0, end: 10 }];
        expect(
            classifyExportTier(
                { ...baseConfig, applyCuts: true },
                mockMasterVideo,
                [],
                [],
                cuts,
                60,
                false,
                false
            )
        ).toBe('single-segment-copy');
    });

    it('returns multi-segment-copy when multiple keep segments and concat list available', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 10, end: 20 }];
        expect(
            classifyExportTier(
                { ...baseConfig, applyCuts: true },
                mockMasterVideo,
                [],
                [],
                cuts,
                60,
                true,
                false
            )
        ).toBe('multi-segment-copy');
    });

    it('returns full-reencode when multiple segments but concat list not available', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 10, end: 20 }];
        expect(
            classifyExportTier(
                { ...baseConfig, applyCuts: true },
                mockMasterVideo,
                [],
                [],
                cuts,
                60,
                false,
                false
            )
        ).toBe('full-reencode');
    });

    it('returns video-copy when normalizeAudio and no cuts', () => {
        expect(
            classifyExportTier(
                { ...baseConfig, normalizeAudio: true },
                mockMasterVideo,
                [],
                [],
                [],
                60,
                false,
                false
            )
        ).toBe('video-copy');
    });

    it('returns video-copy when external audio and no cuts', () => {
        expect(
            classifyExportTier(baseConfig, mockMasterVideo, [], [mockAudio], [], 60, false, false)
        ).toBe('video-copy');
    });

    it('returns full-reencode when blockFastRemuxTiers is true', () => {
        expect(
            classifyExportTier(baseConfig, mockMasterVideo, [], [], [], 60, false, true)
        ).toBe('full-reencode');
    });
});

/* ─── buildConcatListContent ─── */

describe('buildConcatListContent', () => {
    it('emits ffconcat with inpoint and outpoint per segment', () => {
        const text = buildConcatListContent(
            [
                { start: 0, end: 10 },
                { start: 20, end: 60 },
            ],
            '/tmp/video.mp4'
        );
        expect(text).toContain('ffconcat version 1.0');
        expect(text).toContain("file '/tmp/video.mp4'");
        expect(text).toContain('inpoint 0');
        expect(text).toContain('outpoint 10');
        expect(text).toContain('inpoint 20');
        expect(text).toContain('outpoint 60');
    });

    it('escapes single quotes in paths', () => {
        const text = buildConcatListContent([{ start: 0, end: 5 }], "/Users/foo/bar's.mp4");
        expect(text).toContain("file '/Users/foo/bar'\\''s.mp4'");
    });
});

/* ─── buildFFmpegCommand ─── */

describe('buildFFmpegCommand', () => {
    const baseConfig = {
        format: 'mp4' as const,
        quality: 'high' as const,
        includeAudio: true,
        applyCuts: false,
        normalizeAudio: false,
        layoutMode: 'crop' as const,
        transitionType: 'none' as const,
        borderRadius: 0,
    };

    const mockMasterVideo = { id: 'm1', path: '/m.mp4', name: 'm.mp4', type: 'video/mp4', size: 1000, syncOffset: 0, isMaster: true };
    const mockAudio = { id: 'a1', path: '/a.mp3', name: 'a.mp3', type: 'audio/mp3', size: 500, syncOffset: 0 };

    it('uses video stream copy with AAC loudnorm when normalizeAudio is true (tier 4)', () => {
        const args = buildFFmpegCommand(
            { ...baseConfig, normalizeAudio: true },
            [],
            60,
            [mockMasterVideo],
            [],
            'm1',
            '/output.mp4'
        );
        expect(args).toContain('-c:v');
        expect(args).toContain('copy');
        expect(args.some((a) => typeof a === 'string' && a.includes('loudnorm'))).toBe(true);
        expect(args).toContain('-c:a');
        expect(args).toContain('aac');
        expect(args).not.toContain('libx264');
        expect(args).toContain('-movflags');
    });

    it('tier 4 video-copy ignores quality for video (stream copy) when normalizeAudio is true', () => {
        const high = buildFFmpegCommand(
            { ...baseConfig, quality: 'high', normalizeAudio: true },
            [],
            60,
            [mockMasterVideo],
            [],
            'm1',
            '/output.mp4'
        );
        const low = buildFFmpegCommand(
            { ...baseConfig, quality: 'low', normalizeAudio: true },
            [],
            60,
            [mockMasterVideo],
            [],
            'm1',
            '/output-low.mp4'
        );
        expect(high).not.toContain('libx264');
        expect(low).not.toContain('libx264');
        expect(high.filter((a) => a === 'copy').length).toBeGreaterThanOrEqual(1);
        expect(low.filter((a) => a === 'copy').length).toBeGreaterThanOrEqual(1);
    });

    it('uses video stream copy with Opus loudnorm on webm when normalizeAudio is true (tier 4)', () => {
        const webmMaster = {
            ...mockMasterVideo,
            name: 'm.webm',
            type: 'video/webm',
            path: '/m.webm',
        };
        const args = buildFFmpegCommand(
            { ...baseConfig, format: 'webm', normalizeAudio: true },
            [],
            60,
            [webmMaster],
            [],
            'm1',
            '/output.webm'
        );
        expect(args).toContain('-c:v');
        expect(args).toContain('copy');
        expect(args.some((a) => typeof a === 'string' && a.includes('loudnorm'))).toBe(true);
        expect(args).toContain('libopus');
        expect(args).not.toContain('libvpx-vp9');
        expect(args[args.length - 1]).toBe('/output.webm');
    });

    it('uses stream copy (passthrough) when there are no cuts, no external audio, and no normalization', () => {
        const args = buildFFmpegCommand(baseConfig, [], 60, [mockMasterVideo], [], 'm1', '/output.mp4');
        expect(args).toContain('copy');
        expect(args).not.toContain('libx264');
        expect(args).not.toContain('-filter_complex');
        expect(args).toContain('-nostdin');
    });

    it('includes second input when external audio is present', () => {
        const args = buildFFmpegCommand(baseConfig, [], 60, [mockMasterVideo], [mockAudio], 'm1', '/output.mp4');
        expect(args).toContain('/a.mp3');
    });

    it('does not include second input without external audio', () => {
        const args = buildFFmpegCommand({ ...baseConfig, includeAudio: false }, [], 60, [mockMasterVideo], [mockAudio], 'm1', '/output.mp4');
        expect(args).not.toContain('input_audio_0');
    });

    it('includes adelay filter for positive sync offset with external audio', () => {
        const a2 = { ...mockAudio, syncOffset: 2.5 };
        const args = buildFFmpegCommand(baseConfig, [], 60, [mockMasterVideo], [a2], 'm1', '/output.mp4');
        const filterIdx = args.indexOf('-filter_complex');
        expect(filterIdx).toBeGreaterThan(-1);
        const filterStr = args[filterIdx + 1];
        // 2.5s = 2500ms
        expect(filterStr).toContain('adelay=2500');
    });

    it('includes atrim filter for negative sync offset with external audio', () => {
        const a2 = { ...mockAudio, syncOffset: -1.0 };
        const args = buildFFmpegCommand(baseConfig, [], 60, [mockMasterVideo], [a2], 'm1', '/output.mp4');
        const filterIdx = args.indexOf('-filter_complex');
        const filterStr = args[filterIdx + 1];
        expect(filterStr).toContain('atrim=start=1');
    });

    it('applies trim+concat filters when cuts are enabled without concat list (multi-segment full reencode)', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 10, end: 20 }];
        const args = buildFFmpegCommand({ ...baseConfig, applyCuts: true }, cuts, 60, [mockMasterVideo], [], 'm1', '/output.mp4');
        const filterIdx = args.indexOf('-filter_complex');
        const filterStr = args[filterIdx + 1];
        expect(filterStr).toContain('trim=');
        expect(filterStr).toContain('concat=');
    });

    it('uses single-segment stream copy when one keep segment (tier 2)', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 0, end: 10 }];
        const args = buildFFmpegCommand(
            { ...baseConfig, applyCuts: true },
            cuts,
            60,
            [mockMasterVideo],
            [],
            'm1',
            '/output.mp4'
        );
        expect(args).toContain('-ss');
        expect(args).toContain('10');
        expect(args).toContain('-t');
        expect(args).toContain('50');
        expect(args).toContain('-c:v');
        expect(args).toContain('copy');
        expect(args).not.toContain('-filter_complex');
    });

    it('uses concat demuxer stream copy when concat list path provided (tier 3)', () => {
        const cuts: CutSegment[] = [{ id: '1', start: 10, end: 20 }];
        const args = buildFFmpegCommand(
            { ...baseConfig, applyCuts: true },
            cuts,
            60,
            [mockMasterVideo],
            [],
            'm1',
            '/output.mp4',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            '/tmp/concat.txt'
        );
        expect(args).toContain('-f');
        expect(args).toContain('concat');
        expect(args).toContain('-safe');
        expect(args).toContain('0');
        expect(args).toContain('/tmp/concat.txt');
        expect(args).toContain('-c:v');
        expect(args).toContain('copy');
        expect(args).not.toContain('-filter_complex');
    });

    it('tier 4 uses video copy and AAC when external audio has no sync offset', () => {
        const args = buildFFmpegCommand(baseConfig, [], 60, [mockMasterVideo], [mockAudio], 'm1', '/output.mp4');
        expect(args).toContain('-c:v');
        expect(args).toContain('copy');
        expect(args).toContain('/a.mp3');
        expect(args).not.toContain('-filter_complex');
        expect(args).toContain('-c:a');
        expect(args).toContain('copy');
    });

    it('includes loudnorm filter when normalizeAudio is true', () => {
        const args = buildFFmpegCommand({ ...baseConfig, normalizeAudio: true }, [], 60, [mockMasterVideo], [], 'm1', '/output.mp4');
        const filterIdx = args.indexOf('-filter_complex');
        const filterStr = args[filterIdx + 1];
        expect(filterStr).toContain('loudnorm');
    });

    it('output filename matches format', () => {
        const mp4Args = buildFFmpegCommand(baseConfig, [], 60, [mockMasterVideo], [], 'm1', '/out.mp4');
        expect(mp4Args[mp4Args.length - 1]).toBe('/out.mp4');

        const webmArgs = buildFFmpegCommand({ ...baseConfig, format: 'webm' }, [], 60, [mockMasterVideo], [], 'm1', '/out.webm');
        expect(webmArgs[webmArgs.length - 1]).toBe('/out.webm');
    });

    it('does NOT include geq filter when borderRadius is 0', () => {
        const args = buildFFmpegCommand(baseConfig, [], 60, [mockMasterVideo], [], 'm1', '/output.mp4');
        // borderRadius=0 means fast-export passthrough → no filter_complex at all
        expect(args).not.toContain('-filter_complex');
        expect(args).not.toContain('geq');
    });

    it('includes geq rounded-corner filter when borderRadius > 0', () => {
        const args = buildFFmpegCommand(
            { ...baseConfig, borderRadius: 20, normalizeAudio: true },
            [],
            60,
            [mockMasterVideo],
            [],
            'm1',
            '/output.mp4'
        );
        const filterIdx = args.indexOf('-filter_complex');
        expect(filterIdx).toBeGreaterThan(-1);
        const filterStr = args[filterIdx + 1];
        expect(filterStr).toContain('geq');
        expect(filterStr).toContain('yuva420p');
        expect(filterStr).toContain('hypot');
    });
});
