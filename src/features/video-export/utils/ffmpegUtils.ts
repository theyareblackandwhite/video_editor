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
/**
 * Helper to determine if we can use ultra-fast passthrough (stream copy)
 */
const detectFastExport = (
    config: ExportConfig,
    masterVideo: MediaFile,
    otherVideos: MediaFile[],
    audioFiles: MediaFile[],
    cuts: CutSegment[]
): { isMatch: boolean; reason?: string } => {
    const isSingleVideo = otherVideos.length === 0 && masterVideo.syncOffset === 0;
    const hasExternalAudio = config.includeAudio && audioFiles.length > 0;
    const noCuts = !config.applyCuts || cuts.length === 0;
    const noNormalization = !config.normalizeAudio;
    const noRoundedCorners = config.borderRadius === 0;
    const isFormatMatch = Boolean(masterVideo.name?.toLowerCase().endsWith(config.format) || 
                         (masterVideo.type && masterVideo.type.includes(config.format)));

    const isMatch = isSingleVideo && !hasExternalAudio && noCuts && noNormalization && noRoundedCorners && isFormatMatch;
    return { isMatch };
};

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
    filterComplex: string[]
): string[] => {
    const otherVideos = videoFiles.filter(v => v.id !== masterVideoId);
    const videoStreams: string[] = [];

    if (otherVideos.length === 0) {
        videoStreams.push('0:v');
    } else {
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
                /**
                 * CROP MODE TRANSFORMATION LOGIC:
                 * 1. Scale: Height is set to 720 * user_scale. Width follows aspect ratio.
                 * 2. Pad: Add a large black margin (1000px) around the scaled video to allow "panning" into blackness without filter errors.
                 * 3. Crop: Extract a 720x720 square.
                 *    - Default position (centered): 1000 + (scaled_width - 720)/2
                 *    - User offset: Subtracted from default to match CSS translate (x% moves video right, so crop window moves left).
                 */
                const targetH = 720 * transform.scale;
                const padSize = 1000; // Safe margin for panning
                const outW = 720;
                const outH = 720;
                
                // s_w and s_h are variables in FFmpeg for the scaled input width/height before padding
                // However, we can use 'iw' and 'ih' inside crop because they refer to the padded input.
                // To refer to the scaled size (before padding), we use (in_w - 2*padSize).
                
                const filter = [
                    `scale=-2:${targetH}:flags=fast_bilinear`,
                    `pad=iw+${padSize * 2}:ih+${padSize * 2}:${padSize}:${padSize}:black`,
                    `crop=${outW}:${outH}:${padSize}+(in_w-${padSize * 2}-${outW})/2-(${transform.x}/100*(in_w-${padSize * 2})):${padSize}+(in_h-${padSize * 2}-${outH})/2-(${transform.y}/100*(in_h-${padSize * 2}))`
                ].join(',');
                
                filterComplex.push(`${syncedVideos[i]}${filter}[${scaleLabel}]`);
            } else {
                // Scale mode (Letterbox): Fit within 1280x720 with black bars
                filterComplex.push(`${syncedVideos[i]}scale=-2:720:flags=fast_bilinear,pad=ih*16/9:ih:(ow-iw)/2:0[${scaleLabel}]`);
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
const getEncodingArguments = (config: ExportConfig): string[] => {
    const args: string[] = ['-threads', '0'];

    if (config.format === 'mp4') {
        const crf = config.quality === 'high' ? '23' : config.quality === 'medium' ? '28' : '32';
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
            args.push('-crf', crf, '-preset', 'ultrafast');
        } else if (videoCodec === 'h264_nvenc') {
            args.push('-rc', 'vbr', '-cq', crf, '-preset', 'p1');
        } else if (videoCodec === 'h264_videotoolbox') {
            const qv = config.quality === 'high' ? '60' : config.quality === 'medium' ? '50' : '40';
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
    maxHeight?: number
): string[] => {
    const args: string[] = ['-y', '-nostdin'];
    const filterComplex: string[] = [];

    const masterVideo = videoFiles.find(v => v.id === masterVideoId)!;
    const otherVideos = videoFiles.filter(v => v.id !== masterVideoId);

    const currentShort = activeClip || (shortsConfig?.isActive ? {
        startTime: (shortsConfig as any).startTime || 0,
        endTime: (shortsConfig as any).endTime || totalDuration,
        enableFaceTracker: (shortsConfig as any).enableFaceTracker || false,
        enableCaptions: (shortsConfig as any).enableCaptions || false,
    } : null);

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

    const segments = config.applyCuts ? getKeepSegments(cuts, totalDuration) : [{ start: 0, end: totalDuration }];

    // 2. Fast Export Detection
    if (!currentShort && detectFastExport(config, masterVideo, otherVideos, audioFiles, cuts).isMatch && (!shortsConfig || !shortsConfig.isActive)) {
         args.push('-c:v', 'copy');
         if (!config.includeAudio) args.push('-an');
         else args.push('-c:a', 'copy');
         if (config.format === 'mp4') args.push('-movflags', '+faststart');
         args.push(outputPath);
         return args;
    }

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

        let vFilter = `${cropFilter}`;
        if (currentShort.enableCaptions && subtitleFile) {
            const safeSubtitlePath = subtitleFile.replace(/\\/g, '/').replace(/:/g, '\\\\:');
            vFilter += `,subtitles='${safeSubtitlePath}':fontsdir='/'`;
        }

        // Rescale for performance on web
        if (maxHeight) {
            vFilter += `,scale=-2:'min(ih,${maxHeight})':flags=fast_bilinear`;
        }

        filterComplex.push(`[0:v]${vFilter}${mappingVideo}`);
        filterComplex.push(`[0:a]asetpts=PTS-STARTPTS${mappingAudio}`);

    } else {
        // STANDARD EXPORT PATH
        const videoStreams = composeVideoFilter(videoFiles, masterVideoId, config.layoutMode, filterComplex);
        const audioInputOffset = 1 + otherVideos.length;
        const finalAudioSource = composeAudioFilter(audioFiles, audioInputOffset, config.includeAudio, filterComplex);

        let composedVideoStream = videoStreams[0];
        
        if (maxHeight) {
            const scaleLabel = '[v_capped]';
            filterComplex.push(`${composedVideoStream}scale=-2:'min(ih,${maxHeight})':flags=fast_bilinear${scaleLabel}`);
            composedVideoStream = scaleLabel;
        }

        if (config.borderRadius > 0) {
            const roundedLabel = '[v_rounded]';
            const w = config.layoutMode === 'crop' ? 720 * videoFiles.length : 1280;
            const h = 720;
            if (overlayMaskPath) {
                const maskInputIdx = 1 + otherVideos.length + (config.includeAudio ? audioFiles.length : 0);
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
