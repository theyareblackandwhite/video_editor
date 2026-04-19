import type { CutSegment, LayoutMode, TransitionType, MediaFile, ShortsConfig, ShortsClip } from '../../../app/store/types';

export interface ExportConfig {
    format: 'mp4' | 'webm';
    quality: 'high' | 'medium' | 'low';
    includeAudio: boolean;
    applyCuts: boolean;
    normalizeAudio: boolean;
    layoutMode: LayoutMode;
    transitionType: TransitionType;
    borderRadius: number; // px, 0 = sharp corners
}


/**
 * Converts a list of "cuts" (regions to remove) into a list of "segments" (regions to keep).
 * @param cuts The cuts to remove.
 * @param totalDuration The total duration of the video.
 * @returns A list of segments { start, end } to keep.
 */
export const getKeepSegments = (cuts: CutSegment[], totalDuration: number) => {
    if (cuts.length === 0) {
        return [{ start: 0, end: totalDuration }];
    }

    // Sort cuts by start time
    const sortedCuts = [...cuts].sort((a, b) => a.start - b.start);

    // Merge overlapping cuts
    const mergedCuts: CutSegment[] = [];
    if (sortedCuts.length > 0) {
        let currentCut = sortedCuts[0];
        for (let i = 1; i < sortedCuts.length; i++) {
            const nextCut = sortedCuts[i];
            if (nextCut.start < currentCut.end) {
                // Overlap found, merge
                currentCut.end = Math.max(currentCut.end, nextCut.end);
            } else {
                mergedCuts.push(currentCut);
                currentCut = nextCut;
            }
        }
        mergedCuts.push(currentCut);
    }

    const segments = [];
    let currentTime = 0;

    for (const cut of mergedCuts) {
        if (cut.start > currentTime) {
            segments.push({ start: currentTime, end: cut.start });
        }
        currentTime = Math.max(currentTime, cut.end);
    }

    if (currentTime < totalDuration) {
        segments.push({ start: currentTime, end: totalDuration });
    }

    return segments;
};

/**
 * Builds the FFmpeg command arguments for exporting the video.
 *
 * Strategy:
 * 1. Inputs: Video (0) and optionally External Audio (1).
 * 2. Audio Processing:
 *    - If external audio: use input 1, apply sync offset.
 *    - If internal audio: use input 0.
 *    - Normalize loudness if requested.
 * 3. Cuts:
 *    - Generate keep segments.
 *    - Apply trim/atrim filters for each segment.
 *    - Concat segments.
 * 4. Encoding:
 *    - Set codecs and quality.
 */

/** Stream-copy / remux tiers (faster than full decode+encode). Keyframe caveat for cut tiers: see classifyExportTier. */
export type ExportTier =
    | 'full-copy'
    | 'single-segment-copy'
    | 'multi-segment-copy'
    | 'video-copy'
    | 'full-reencode';

const isFormatMatchForRemux = (config: ExportConfig, masterVideo: MediaFile): boolean =>
    Boolean(
        masterVideo.name?.toLowerCase().endsWith(config.format) ||
            (masterVideo.type && masterVideo.type.includes(config.format))
    );

/**
 * ffconcat list for concat demuxer with inpoint/outpoint (stream copy).
 * Paths should use forward slashes; single quotes in paths are escaped for the concat file format.
 */
export const buildConcatListContent = (
    segments: { start: number; end: number }[],
    srcPath: string
): string => {
    const normalizedPath = srcPath.replace(/\\/g, '/');
    const escapedPath = normalizedPath.replace(/'/g, "'\\''");
    const lines = ['ffconcat version 1.0'];
    for (const seg of segments) {
        lines.push(`file '${escapedPath}'`);
        lines.push(`inpoint ${seg.start}`);
        lines.push(`outpoint ${seg.end}`);
    }
    return lines.join('\n');
};

type RemuxGate = {
    isSingleVideo: boolean;
    hasExternalAudio: boolean;
    noCuts: boolean;
    noNormalization: boolean;
    noRoundedCorners: boolean;
    formatMatch: boolean;
};

const readRemuxGate = (
    config: ExportConfig,
    masterVideo: MediaFile,
    otherVideos: MediaFile[],
    audioFiles: MediaFile[],
    cuts: CutSegment[]
): RemuxGate => ({
    isSingleVideo: otherVideos.length === 0 && masterVideo.syncOffset === 0,
    hasExternalAudio: config.includeAudio && audioFiles.length > 0,
    noCuts: !config.applyCuts || cuts.length === 0,
    noNormalization: !config.normalizeAudio,
    noRoundedCorners: config.borderRadius === 0,
    formatMatch: isFormatMatchForRemux(config, masterVideo),
});

/**
 * Classifies export into remux tiers vs full re-encode.
 * For `single-segment-copy` / `multi-segment-copy`, cut boundaries align to keyframes (stream copy), not sample-accurate trim.
 */
/* eslint-disable complexity -- linear tier checks; each branch maps to one ExportTier */
export const classifyExportTier = (
    config: ExportConfig,
    masterVideo: MediaFile,
    otherVideos: MediaFile[],
    audioFiles: MediaFile[],
    cuts: CutSegment[],
    totalDuration: number,
    concatListPathAvailable: boolean,
    blockFastRemuxTiers: boolean
): ExportTier => {
    if (blockFastRemuxTiers) {
        return 'full-reencode';
    }

    const g = readRemuxGate(config, masterVideo, otherVideos, audioFiles, cuts);
    const segments = config.applyCuts ? getKeepSegments(cuts, totalDuration) : [{ start: 0, end: totalDuration }];
    const segmentDurationOk =
        segments.length > 0 && segments.every((s) => s.end > s.start && Number.isFinite(s.start) && Number.isFinite(s.end));

    if (
        g.isSingleVideo &&
        !g.hasExternalAudio &&
        g.noCuts &&
        g.noNormalization &&
        g.noRoundedCorners &&
        g.formatMatch
    ) {
        return 'full-copy';
    }

    const canStreamCopyCuts =
        g.isSingleVideo &&
        !g.hasExternalAudio &&
        g.noNormalization &&
        g.noRoundedCorners &&
        g.formatMatch &&
        config.applyCuts &&
        cuts.length > 0 &&
        segmentDurationOk;

    if (canStreamCopyCuts) {
        if (segments.length === 1) return 'single-segment-copy';
        if (segments.length > 1 && concatListPathAvailable) return 'multi-segment-copy';
    }

    if (g.isSingleVideo && g.noCuts && g.noRoundedCorners && g.formatMatch) {
        return 'video-copy';
    }

    return 'full-reencode';
};
/* eslint-enable complexity */

/** Map composeAudioFilter output to a -map target (input stream vs filter label). */
const mapAudioSelectArg = (finalAudioSource: string): string => {
    if (finalAudioSource.startsWith('[')) {
        const inner = finalAudioSource.slice(1, -1);
        if (/^\d+:a$/.test(inner)) {
            return inner;
        }
        return finalAudioSource;
    }
    return finalAudioSource;
};

const wrapAudioFilterInput = (finalAudioSource: string): string =>
    finalAudioSource.startsWith('[') ? finalAudioSource : `[${finalAudioSource}]`;

const getTier4AudioCodecArgs = (config: ExportConfig): string[] =>
    config.format === 'mp4' ? ['-c:a', 'aac', '-b:a', '192k'] : ['-c:a', 'libopus', '-b:a', '128k'];

/**
 * Applies a rounded-corner alpha mask to a video stream.
 * Uses format=yuva420p to enable alpha, then geq to zero-out corner pixels.
 * @param inputLabel  e.g. '[v_layout]' or '0:v'
 * @param outputLabel e.g. '[v_rounded]'
 * @param w           video width in px
 * @param h           video height in px
 * @param r           corner radius in px
 * @param filterComplex mutable array of filter graph segments
 * @param overlayMaskPath optional path to a PNG mask for faster "fake" rounded corners
 */
const applyRoundedCornersFilter = (
    inputLabel: string,
    outputLabel: string,
    w: number,
    h: number,
    r: number,
    filterComplex: string[],
    overlayMaskPath?: string
): void => {
    const inLabel = inputLabel.startsWith('[') ? inputLabel : `[${inputLabel}]`;

    if (overlayMaskPath) {
        // Overlay method (Fast): Uses a pre-generated mask image
        // The mask is expected to be a PNG with black corners and transparent center
        // It should match the video dimensions (w x h)
        // We assume the mask is input index 'mask_input_idx'
        // But since we don't know the index here, we'll assume it's the LAST input added in buildFFmpegCommand
        // Actually, it's better to pass the label of the mask stream.
        filterComplex.push(`${inLabel}[mask]overlay=format=auto${outputLabel}`);
        return;
    }

    // GEQ method (Slow but flexible)
    // Clamp radius so it can never exceed half the smaller dimension
    const clampedR = Math.min(r, Math.floor(Math.min(w, h) / 2));

    // Alpha expression: returns 0 (transparent) in each of the 4 rounded corners,
    // 255 (opaque) everywhere else.
    const alphaExpr = [
        `if(`,
        `  lte(X,${clampedR})*lte(Y,${clampedR})*gt(hypot(X-${clampedR}\\,Y-${clampedR})\\,${clampedR})`,   // top-left
        `+ lte(X,${clampedR})*gte(Y,H-${clampedR})*gt(hypot(X-${clampedR}\\,Y-(H-${clampedR}))\\,${clampedR})`, // bottom-left
        `+ gte(X,W-${clampedR})*lte(Y,${clampedR})*gt(hypot(X-(W-${clampedR})\\,Y-${clampedR})\\,${clampedR})`, // top-right
        `+ gte(X,W-${clampedR})*gte(Y,H-${clampedR})*gt(hypot(X-(W-${clampedR})\\,Y-(H-${clampedR}))\\,${clampedR}),`, // bottom-right
        `0,255)` // inside corner → transparent else opaque
    ].join('');

    filterComplex.push(`${inLabel}format=yuva420p,geq=lum='p(X\\,Y)':cb='p(X\\,Y)':cr='p(X\\,Y)':a='${alphaExpr}'${outputLabel}`);
};

/**
 * Handles video layout and synchronization
 */
const composeVideoFilter = (
    videoFiles: MediaFile[],
    masterVideoId: string,
    layoutMode: LayoutMode,
    filterComplex: string[],
    isDesktop: boolean
): string[] => {
    const otherVideos = videoFiles.filter(v => v.id !== masterVideoId);
    const videoStreams: string[] = [];
    // We use a standard layout canvas (1080p) to guarantee stable filters during hstack/crop.
    const baseRes = 1080;

    if (otherVideos.length === 0) {
        if (isDesktop) {
            filterComplex.push(`[0:v]scale=-2:${baseRes}:flags=lanczos[v_scaled_base]`);
            videoStreams.push('[v_scaled_base]');
        } else {
            videoStreams.push('0:v');
        }
    } else {
        // For layouts (hstack/crop), videos MUST have identical height.
        const syncedVideos: string[] = ['[0:v]'];
        otherVideos.forEach((v, i) => {
            const inputIdx = i + 1;
            const offset = v.syncOffset;
            const syncedLabel = `v_synced_${inputIdx}`;

            if (offset !== 0) {
                if (offset > 0) {
                    filterComplex.push(`[${inputIdx}:v]setpts=PTS+${offset}/TB[${syncedLabel}]`);
                } else {
                    filterComplex.push(`[${inputIdx}:v]trim=start=${Math.abs(offset)},setpts=PTS-STARTPTS[${syncedLabel}]`);
                }
                syncedVideos.push(`[${syncedLabel}]`);
            } else {
                syncedVideos.push(`[${inputIdx}:v]`);
            }
        });

        const scaledVideos = [];
        for (let i = 0; i < syncedVideos.length; i++) {
            const v = videoFiles.find(file => {
                if (i === 0) return file.id === masterVideoId;
                return file.id === otherVideos[i - 1].id;
            })!;
            const transform = v.transform || { scale: 1, x: 0, y: 0 };
            const scaleLabel = `v_scale_${i}`;

            if (layoutMode === 'crop') {
                const targetH = baseRes * transform.scale;
                const padSize = 1000;
                const outW = baseRes;
                const outH = baseRes;

                const filter = [
                    `scale=-2:${targetH}:flags=lanczos`,
                    `pad=iw+${padSize * 2}:ih+${padSize * 2}:${padSize}:${padSize}:black`,
                    `crop=${outW}:${outH}:${padSize}+(in_w-${padSize * 2}-${outW})/2-(${transform.x}/100*(in_w-${padSize * 2})):${padSize}+(in_h-${padSize * 2}-${outH})/2-(${transform.y}/100*(in_h-${padSize * 2}))`
                ].join(',');

                filterComplex.push(`${syncedVideos[i]}${filter}[${scaleLabel}]`);
            } else {
                // Scale mode (Letterbox): Fit within 1280x720 or 1920x1080 with black bars
                filterComplex.push(`${syncedVideos[i]}scale=-2:${baseRes}:flags=lanczos,pad=ih*16/9:ih:(ow-iw)/2:0[${scaleLabel}]`);
            }
            scaledVideos.push(`[${scaleLabel}]`);
        }

        const layoutOutput = 'v_layout';
        filterComplex.push(`${scaledVideos.join('')}hstack=inputs=${scaledVideos.length}[${layoutOutput}]`);
        videoStreams.push(`[${layoutOutput}]`);
    }

    return videoStreams;
};

/**
 * Handles audio synchronization and mixing
 */
const composeAudioFilter = (
    audioFiles: MediaFile[],
    audioInputOffset: number,
    includeAudio: boolean,
    filterComplex: string[]
): string => {
    const audioStreams: string[] = [];

    if (audioFiles.length === 0 || !includeAudio) {
        audioStreams.push('0:a');
    } else {
        audioFiles.forEach((a, i) => {
            const inputIdx = audioInputOffset + i;
            const offset = a.syncOffset;
            const syncedLabel = `a_synced_${inputIdx}`;

            if (offset !== 0) {
                const delayMs = Math.round(Math.abs(offset) * 1000);
                if (offset > 0) {
                    filterComplex.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs}[${syncedLabel}]`);
                } else {
                    filterComplex.push(`[${inputIdx}:a]atrim=start=${Math.abs(offset)},asetpts=PTS-STARTPTS[${syncedLabel}]`);
                }
                audioStreams.push(`[${syncedLabel}]`);
            } else {
                audioStreams.push(`[${inputIdx}:a]`);
            }
        });
    }

    let finalAudioSource = audioStreams[0];
    if (audioStreams.length > 1) {
        finalAudioSource = '[a_mixed]';
        filterComplex.push(`${audioStreams.join('')}amix=inputs=${audioStreams.length}:normalize=0${finalAudioSource}`);
    } else if (!finalAudioSource.startsWith('[')) {
        finalAudioSource = `[${finalAudioSource}]`;
    }

    return finalAudioSource;
};

/**
 * Applies trimming, splitting, and transitions (crossfade or concat)
 */
const applyTrimmingAndTransitions = (
    config: ExportConfig,
    segments: { start: number; end: number }[],
    videoSource: string,
    audioSource: string,
    filterComplex: string[]
): { outV: string; outA: string } => {
    const n = segments.length;
    let getVideoSource = (i: number) => { void i; return videoSource; };
    let getAudioSource = (i: number) => { void i; return audioSource; };

    // Split sources if needed for multiple segments
    if (n > 1) {
        if (videoSource.startsWith('[')) {
            const splitOutputs = Array.from({ length: n }, (_, i) => `[v_src_${i}]`).join('');
            filterComplex.push(`${videoSource}split=${n}${splitOutputs}`);
            getVideoSource = (i: number) => `[v_src_${i}]`;
        }
        if (audioSource.startsWith('[')) {
            const splitOutputs = Array.from({ length: n }, (_, i) => `[a_src_${i}]`).join('');
            filterComplex.push(`${audioSource}asplit=${n}${splitOutputs}`);
            getAudioSource = (i: number) => `[a_src_${i}]`;
        }
    }

    const segmentsToConcat: string[] = [];
    segments.forEach((seg, i) => {
        const vSrc = getVideoSource(i);
        const vLabel = `v_seg_${i}`;
        const vInput = vSrc.startsWith('[') ? vSrc : `[${vSrc}]`;
        filterComplex.push(`${vInput}trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[${vLabel}]`);
        segmentsToConcat.push(`[${vLabel}]`);

        const aSrc = getAudioSource(i);
        const aLabel = `a_seg_${i}`;
        const aInput = aSrc.startsWith('[') ? aSrc : `[${aSrc}]`;
        filterComplex.push(`${aInput}atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[${aLabel}]`);
        segmentsToConcat.push(`[${aLabel}]`);
    });

    let outV = 'v_out';
    let outA = 'a_pre_norm';

    if (n > 1) {
        if (config.transitionType === 'crossfade') {
            const transitionDuration = 1.0;
            let currentVideoOutput = `[v_seg_0]`;
            let currentAudioOutput = `[a_seg_0]`;
            let accumulatedDuration = segments[0].end - segments[0].start;

            for (let i = 1; i < n; i++) {
                const segDuration = segments[i].end - segments[i].start;
                const offset = accumulatedDuration - transitionDuration;
                const nextVideoOut = i === n - 1 ? `[${outV}]` : `[v_xfade_${i}]`;
                const nextAudioOut = i === n - 1 ? `[${outA}]` : `[a_xfade_${i}]`;
                const offsetStr = Math.max(0, offset).toFixed(3);

                filterComplex.push(`${currentVideoOutput}[v_seg_${i}]xfade=transition=fade:duration=${transitionDuration}:offset=${offsetStr}${nextVideoOut}`);
                filterComplex.push(`${currentAudioOutput}[a_seg_${i}]acrossfade=d=${transitionDuration}${nextAudioOut}`);

                currentVideoOutput = nextVideoOut;
                currentAudioOutput = nextAudioOut;
                accumulatedDuration += segDuration - transitionDuration;
            }
        } else {
            filterComplex.push(`${segmentsToConcat.join('')}concat=n=${n}:v=1:a=1[${outV}][${outA}]`);
        }
    } else {
        // Only 1 segment, no need for concat or xfade
        outV = 'v_seg_0';
        outA = 'a_seg_0';
    }

    return { outV, outA };
};

/**
 * Gets encoding arguments based on format, quality, and OS
 */
// eslint-disable-next-line complexity -- OS-specific codec branches
const getEncodingArguments = (config: ExportConfig): string[] => {
    const args: string[] = ['-threads', '0'];

    if (config.format === 'mp4') {
        // Use more professional CRF values for high quality (16 is practically visually lossless for x264)
        const crf = config.quality === 'high' ? '16' : config.quality === 'medium' ? '23' : '28';
        let osType = 'unknown';
        if (typeof navigator !== 'undefined') {
            const ua = navigator.userAgent.toLowerCase();
            if (ua.includes('mac') && !ua.includes('windows')) osType = 'macos';
            else if (ua.includes('win')) osType = 'windows';
        }

        let videoCodec = 'libx264';
        if (osType === 'macos') videoCodec = 'h264_videotoolbox';
        else if (osType === 'windows') videoCodec = 'h264_nvenc';

        args.push('-c:v', videoCodec);
        if (videoCodec === 'libx264') {
            // Use better preset to ensure high quality (medium instead of ultrafast)
            const preset = config.quality === 'high' ? 'medium' : config.quality === 'medium' ? 'fast' : 'veryfast';
            args.push('-crf', crf, '-preset', preset);
        } else if (videoCodec === 'h264_nvenc') {
            // Use better preset for NVENC (p6/p7 is high quality, p1 is performance)
            const preset = config.quality === 'high' ? 'p6' : config.quality === 'medium' ? 'p4' : 'p2';
            args.push('-rc', 'vbr', '-cq', crf, '-preset', preset);
        } else if (videoCodec === 'h264_videotoolbox') {
            const qv = config.quality === 'high' ? '80' : config.quality === 'medium' ? '60' : '40';
            args.push('-q:v', qv);
        }

        args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
    } else {
        const crf = config.quality === 'high' ? '30' : config.quality === 'medium' ? '35' : '40';
        args.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '4');
        args.push('-c:a', 'libopus', '-b:a', '128k');
    }

    return args;
};

const buildRemuxFullCopyArgs = (
    config: ExportConfig,
    masterVideo: MediaFile,
    outputPath: string
): string[] => {
    const remuxArgs: string[] = ['-y', '-nostdin', '-i', masterVideo.path];
    remuxArgs.push('-c:v', 'copy');
    if (!config.includeAudio) remuxArgs.push('-an');
    else remuxArgs.push('-c:a', 'copy');
    if (config.format === 'mp4') remuxArgs.push('-movflags', '+faststart');
    remuxArgs.push(outputPath);
    return remuxArgs;
};

const buildRemuxSingleSegmentCopyArgs = (
    config: ExportConfig,
    masterVideo: MediaFile,
    seg: { start: number; end: number },
    outputPath: string
): string[] => {
    const remuxArgs: string[] = ['-y', '-nostdin'];
    if (seg.start > 0) remuxArgs.push('-ss', seg.start.toString());
    remuxArgs.push('-i', masterVideo.path);
    remuxArgs.push('-t', (seg.end - seg.start).toString());
    remuxArgs.push('-c:v', 'copy');
    if (!config.includeAudio) remuxArgs.push('-an');
    else remuxArgs.push('-c:a', 'copy');
    if (config.format === 'mp4') remuxArgs.push('-movflags', '+faststart');
    remuxArgs.push(outputPath);
    return remuxArgs;
};

const buildRemuxMultiSegmentConcatArgs = (
    config: ExportConfig,
    concatListPath: string,
    outputPath: string
): string[] => {
    const remuxArgs: string[] = [
        '-y',
        '-nostdin',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-c:v',
        'copy',
    ];
    if (!config.includeAudio) remuxArgs.push('-an');
    else remuxArgs.push('-c:a', 'copy');
    if (config.format === 'mp4') remuxArgs.push('-movflags', '+faststart');
    remuxArgs.push(outputPath);
    return remuxArgs;
};

const buildRemuxVideoCopyArgs = (
    config: ExportConfig,
    masterVideo: MediaFile,
    audioFiles: MediaFile[],
    outputPath: string
): string[] => {
    const remuxArgs: string[] = ['-y', '-nostdin', '-i', masterVideo.path];
    if (config.includeAudio) {
        audioFiles.forEach((a) => remuxArgs.push('-i', a.path));
    }
    const tier4Fc: string[] = [];
    if (config.includeAudio) {
        const audioInputOffset = 1;
        const finalAudioSource = composeAudioFilter(
            audioFiles,
            audioInputOffset,
            config.includeAudio,
            tier4Fc
        );
        const graphBeforeLoudnorm = tier4Fc.length > 0;
        let mapAudio = mapAudioSelectArg(finalAudioSource);
        if (config.normalizeAudio) {
            tier4Fc.push(
                `${wrapAudioFilterInput(finalAudioSource)}loudnorm=I=-16:TP=-1.5:LRA=11[a_t4_out]`
            );
            mapAudio = '[a_t4_out]';
        }
        if (tier4Fc.length > 0) {
            remuxArgs.push('-filter_complex', tier4Fc.join(';'));
        }
        remuxArgs.push('-map', '0:v', '-map', mapAudio);
        remuxArgs.push('-c:v', 'copy');
        const needsAudioReencode = graphBeforeLoudnorm || config.normalizeAudio;
        if (needsAudioReencode) {
            remuxArgs.push(...getTier4AudioCodecArgs(config));
        } else {
            remuxArgs.push('-c:a', 'copy');
        }
    } else {
        remuxArgs.push('-map', '0:v', '-an', '-c:v', 'copy');
    }
    if (config.format === 'mp4') remuxArgs.push('-movflags', '+faststart');
    remuxArgs.push(outputPath);
    return remuxArgs;
};

const tryBuildRemuxTierCommand = (
    config: ExportConfig,
    masterVideo: MediaFile,
    otherVideos: MediaFile[],
    audioFiles: MediaFile[],
    cuts: CutSegment[],
    totalDuration: number,
    segments: { start: number; end: number }[],
    concatListPath: string | undefined,
    remuxSafe: boolean,
    outputPath: string
): string[] | null => {
    if (!remuxSafe) {
        return null;
    }

    let tier = classifyExportTier(
        config,
        masterVideo,
        otherVideos,
        audioFiles,
        cuts,
        totalDuration,
        Boolean(concatListPath),
        false
    );
    if (tier === 'multi-segment-copy' && !concatListPath) {
        tier = 'full-reencode';
    }

    if (tier === 'full-copy') {
        return buildRemuxFullCopyArgs(config, masterVideo, outputPath);
    }
    if (tier === 'single-segment-copy') {
        return buildRemuxSingleSegmentCopyArgs(config, masterVideo, segments[0], outputPath);
    }
    if (tier === 'multi-segment-copy' && concatListPath) {
        return buildRemuxMultiSegmentConcatArgs(config, concatListPath, outputPath);
    }
    if (tier === 'video-copy') {
        return buildRemuxVideoCopyArgs(config, masterVideo, audioFiles, outputPath);
    }
    return null;
};

/* eslint-disable complexity -- FFmpeg argv assembly: shorts vs standard + remux fast paths delegated */
export const buildFFmpegCommand = (
    config: ExportConfig,
    cuts: CutSegment[],
    totalDuration: number,
    videoFiles: MediaFile[],
    audioFiles: MediaFile[],
    masterVideoId: string,
    outputPath: string,
    cropFile?: string,
    shortsConfig?: ShortsConfig,
    activeClip?: ShortsClip,
    subtitleFile?: string,
    overlayMaskPath?: string,
    maxHeight?: number,
    concatListPath?: string,
    isWeb?: boolean
): string[] => {
    const masterVideo = videoFiles.find(v => v.id === masterVideoId)!;
    const otherVideos = videoFiles.filter(v => v.id !== masterVideoId);

    const currentShort =
        activeClip ||
        (shortsConfig?.isActive
            ? {
                  startTime: shortsConfig.startTime ?? 0,
                  endTime: shortsConfig.endTime ?? totalDuration,
                  enableFaceTracker: shortsConfig.enableFaceTracker ?? false,
                  enableCaptions: shortsConfig.enableCaptions ?? false,
              }
            : null);

    const segments = currentShort
        ? [{ start: 0, end: totalDuration }]
        : config.applyCuts
          ? getKeepSegments(cuts, totalDuration)
          : [{ start: 0, end: totalDuration }];

    const remuxSafe =
        !overlayMaskPath &&
        !currentShort &&
        (!shortsConfig || !shortsConfig.isActive);

    const remuxCmd = tryBuildRemuxTierCommand(
        config,
        masterVideo,
        otherVideos,
        audioFiles,
        cuts,
        totalDuration,
        segments,
        concatListPath,
        remuxSafe,
        outputPath
    );
    if (remuxCmd) {
        return remuxCmd;
    }

    const args: string[] = ['-y', '-nostdin'];
    const filterComplex: string[] = [];

    // 1. Inputs
    if (currentShort) {
        // FAST SEEKING for Shorts: Apply -ss and -t to the input itself
        args.push('-ss', currentShort.startTime.toString());
        args.push('-t', (currentShort.endTime - currentShort.startTime).toString());
        args.push('-i', masterVideo.path);

        // Note: For shorts, we currently ignore other videos and audio files for simplicity in this path
    } else {
        args.push('-i', masterVideo.path);
        otherVideos.forEach(v => args.push('-i', v.path));
        if (config.includeAudio) {
            audioFiles.forEach(a => args.push('-i', a.path));
        }
    }

    // Add mask input if provided
    if (overlayMaskPath && !currentShort) {
        args.push('-i', overlayMaskPath);
    }

    const isDesktop = !isWeb;

    // 3. Audio/Video Filter Composition
    let mappingVideo = '';
    let mappingAudio = '';

    if (currentShort) {
        // SHORTS FILTER PATH: Optimized and direct
        mappingVideo = '[v_shorts_out]';
        mappingAudio = '[a_shorts_out]';

        let cropFilter = `crop=w='trunc(ih*9/16/2)*2':h='trunc(ih/2)*2':x='(iw-ow)/2':y=0`;
        if (currentShort.enableFaceTracker && cropFile) {
            const safePath = cropFile.replace(/\\/g, '/').replace(/:/g, '\\\\:');
            cropFilter = `sendcmd=f='${safePath}',crop=w='trunc(ih*9/16/2)*2':h='trunc(ih/2)*2':x=0:y=0`;
        }

        let vFilter = `setpts=PTS-STARTPTS,${cropFilter}`;
        // Burn-in via `subtitles=` requires libass (bundled sidecar on Tauri; WASM build on web).
        if (currentShort.enableCaptions && subtitleFile) {
            // FFmpeg subtitles filter path escaping:
            // 1. Backslashes become forward slashes (FFmpeg prefers this)
            // 2. Colons must be escaped on Windows (e.g., C\:...)
            // 3. Single quotes must be escaped for the filter parser
            const escapedPath = subtitleFile
                .replace(/\\/g, '/')
                .replace(/:/g, '\\\\:')
                .replace(/ /g, '\\ ')
                .replace(/'/g, "\\\\'");

            // Web/WASM needs fontsdir=/fonts to find the virtual fonts; native uses system fonts.
            const fontsDirOption = isWeb ? ':fontsdir=/fonts' : '';

            // force_style ensures font mapping works even if the ASS file style is generic.
            vFilter += `,subtitles=filename='${escapedPath}'${fontsDirOption}:force_style='Fontname=Arial Bold'`;
        }

        // Rescale for performance on web, ensuring even dimensions for libx264
        if (maxHeight) {
            vFilter += `,scale=-2:'trunc(min(ih,${maxHeight})/2)*2':flags=lanczos`;
        }

        filterComplex.push(`[0:v]${vFilter}${mappingVideo}`);
        filterComplex.push(`[0:a]asetpts=PTS-STARTPTS${mappingAudio}`);

    } else {
        // STANDARD EXPORT PATH
        const videoStreams = composeVideoFilter(videoFiles, masterVideoId, config.layoutMode, filterComplex, isDesktop);
        const audioInputOffset = 1 + otherVideos.length;
        const finalAudioSource = composeAudioFilter(audioFiles, audioInputOffset, config.includeAudio, filterComplex);

        let composedVideoStream = videoStreams[0];

        if (maxHeight) {
            const scaleLabel = '[v_capped]';
            filterComplex.push(`${composedVideoStream}scale=-2:'min(ih,${maxHeight})':flags=lanczos${scaleLabel}`);
            composedVideoStream = scaleLabel;
        }

        if (config.borderRadius > 0) {
            const roundedLabel = '[v_rounded]';
            const baseRes = 1080;
            let w = masterVideo.width || 1920;
            let h = masterVideo.height || 1080;

            if (otherVideos.length > 0) {
                w = config.layoutMode === 'crop' ? baseRes * videoFiles.length : Math.round(baseRes * 16 / 9);
                h = baseRes;
            }

            if (overlayMaskPath) {
                const maskInputIdx = 1 + otherVideos.length + (config.includeAudio ? audioFiles.length : 0);
                // Simple scale filter to match exact width and height
                filterComplex.push(`[${maskInputIdx}:v]scale=${w}:${h}[mask]`);
            }
            applyRoundedCornersFilter(composedVideoStream, roundedLabel, w, h, config.borderRadius, filterComplex, overlayMaskPath);
            composedVideoStream = roundedLabel;
        }

        const { outV, outA } = applyTrimmingAndTransitions(config, segments, composedVideoStream, finalAudioSource, filterComplex);

        mappingAudio = `[${outA}]`;
        if (config.normalizeAudio) {
            mappingAudio = '[a_out]';
            filterComplex.push(`[${outA}]loudnorm=I=-16:TP=-1.5:LRA=11${mappingAudio}`);
        }
        mappingVideo = `[${outV}]`;
    }

    // 6. Build final command
    if (filterComplex.length > 0) {
        args.push('-filter_complex', filterComplex.join(';'));
    }
    args.push('-map', mappingVideo, '-map', mappingAudio);
    args.push(...getEncodingArguments(config));
    args.push(outputPath);

    return args;
};
/* eslint-enable complexity */
