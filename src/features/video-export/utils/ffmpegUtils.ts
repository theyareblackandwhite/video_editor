import type { CutSegment, LayoutMode, TransitionType, MediaFile } from '../../../app/store/types';

export interface ExportConfig {
    format: 'mp4' | 'webm';
    quality: 'high' | 'medium' | 'low';
    includeAudio: boolean;
    applyCuts: boolean;
    normalizeAudio: boolean;
    layoutMode: LayoutMode;
    transitionType: TransitionType;
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
export const buildFFmpegCommand = (
    config: ExportConfig,
    cuts: CutSegment[],
    totalDuration: number,
    videoFiles: MediaFile[],
    audioFiles: MediaFile[],
    masterVideoId: string,
    outputPath: string
): string[] => {
    // Force terminal overwrite by default and disable stdin interaction
    const args: string[] = ['-y', '-nostdin'];
    const filterComplex: string[] = [];

    const masterVideo = videoFiles.find(v => v.id === masterVideoId)!;
    const otherVideos = videoFiles.filter(v => v.id !== masterVideoId);

    // 1. Inputs
    // Master video is always input 0
    args.push('-i', masterVideo.path);

    // Other videos are inputs 1 to N
    for (let i = 0; i < otherVideos.length; i++) {
        args.push('-i', otherVideos[i].path);
    }

    // Audio files are inputs N+1 to M
    const audioInputOffset = 1 + otherVideos.length;
    if (config.includeAudio) {
        for (let i = 0; i < audioFiles.length; i++) {
            args.push('-i', audioFiles[i].path);
        }
    }

    const segments = config.applyCuts ? getKeepSegments(cuts, totalDuration) : [{ start: 0, end: totalDuration }];
    const n = segments.length;

    // --- Fast Export (Passthrough) Detection ---
    // If there is only 1 video, no external audio, no cuts, no normalization, and no sync offset,
    // and the format matches the target format, we can use stream copy (-c:v copy).
    const isSingleVideo = otherVideos.length === 0 && masterVideo.syncOffset === 0;
    const hasExternalAudio = config.includeAudio && audioFiles.length > 0;
    const noCuts = !config.applyCuts || cuts.length === 0;
    const noNormalization = !config.normalizeAudio;
    // Check if the original video extension/type matches the target format to allow passthrough
    const isFormatMatch = masterVideo.name.toLowerCase().endsWith(config.format) || masterVideo.type.includes(config.format);

    if (isSingleVideo && !hasExternalAudio && noCuts && noNormalization && isFormatMatch) {
        args.push('-c:v', 'copy');

        // If the user explicitly disabled audio, remove it. Otherwise, copy it.
        if (!config.includeAudio) {
            args.push('-an');
        } else {
            args.push('-c:a', 'copy');
        }

        // essential for browser compatibility if mp4
        if (config.format === 'mp4') {
             args.push('-movflags', '+faststart');
        }
        args.push(outputPath);
        return args;
    }


    // --- Video Pre-processing (Layout & Sync) ---
    const videoStreams: string[] = [];

    if (otherVideos.length === 0) {
        // Single video
        videoStreams.push('0:v');
    } else {
        // Multiple videos side-by-side
        // First, apply sync offset to other videos
        const syncedVideos: string[] = ['[0:v]']; // master is always 0:v

        otherVideos.forEach((v, i) => {
            const inputIdx = i + 1;
            const offset = v.syncOffset;
            const syncedLabel = `v_synced_${inputIdx}`;

            if (offset !== 0) {
                if (offset > 0) {
                    // Video is late -> delay it (ffmpeg tpad filter is good for this, or setpts)
                    filterComplex.push(`[${inputIdx}:v]setpts=PTS+${offset}/TB[${syncedLabel}]`);
                } else {
                    // Video is early -> trim it
                    filterComplex.push(`[${inputIdx}:v]trim=start=${Math.abs(offset)},setpts=PTS-STARTPTS[${syncedLabel}]`);
                }
                syncedVideos.push(`[${syncedLabel}]`);
            } else {
                syncedVideos.push(`[${inputIdx}:v]`);
            }
        });

        // Stack them
        const layoutOutput = 'v_layout';
        const numVideos = syncedVideos.length;

        // Hstack them all. For better results we should scale/crop them first so they have same height.
        // For simplicity, let's use a standard 1080p target and scale/crop.
        // If layoutMode is 'crop', we crop to fill half screen (if 2 videos), etc.
        // For now, let's just use simple hstack which requires matching heights.
        const scaledVideos = [];
        for (let i = 0; i < numVideos; i++) {
            const scaleLabel = `v_scale_${i}`;
            // Simple scale to 720p height, preserving aspect ratio
            if (config.layoutMode === 'crop') {
                // Crop to square-ish then scale
                filterComplex.push(`${syncedVideos[i]}scale=-1:720:flags=fast_bilinear,crop=ih:ih:in_w/2-ih/2:0[${scaleLabel}]`);
            } else {
                filterComplex.push(`${syncedVideos[i]}scale=-1:720:flags=fast_bilinear,pad=ih*16/9:ih:(ow-iw)/2:0[${scaleLabel}]`);
            }
            scaledVideos.push(`[${scaleLabel}]`);
        }

        filterComplex.push(`${scaledVideos.join('')}hstack=inputs=${numVideos}[${layoutOutput}]`);
        videoStreams.push(`[${layoutOutput}]`);
    }

    // --- Audio Pre-processing (Sync & Mix) ---
    // Collect all audio sources
    const audioStreams: string[] = [];

    if (audioFiles.length === 0 || !config.includeAudio) {
        // Fallback to master video audio if no external mics
        audioStreams.push('0:a');
    } else {
        // We have external mics. Sync them.
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

    // Mix multiple audio streams into one if needed
    let finalAudioSource = audioStreams[0]; // defaults to first
    if (audioStreams.length > 1) {
        finalAudioSource = '[a_mixed]';
        filterComplex.push(`${audioStreams.join('')}amix=inputs=${audioStreams.length}:normalize=0${finalAudioSource}`);
    } else {
        // Ensure it has brackets if it's a filter output
        if (!finalAudioSource.startsWith('[')) finalAudioSource = `[${finalAudioSource}]`;
    }

    // --- Split Audio for Segments if needed ---
    let getAudioSource = (i?: number) => { void i; return finalAudioSource; }; // Keep parameter for compatibility
    // We only need to split if it's a filter output (has brackets) AND n > 1
    if (n > 1 && finalAudioSource.startsWith('[')) {
        const splitOutputs = Array.from({ length: n }, (_, i) => `[a_src_${i}]`).join('');
        filterComplex.push(`${finalAudioSource}asplit=${n}${splitOutputs}`);
        getAudioSource = (i?: number) => `[a_src_${i ?? 0}]`;
    }

    // Same for video
    let getVideoSource = (i?: number) => { void i; return videoStreams[0]; }; // Keep parameter for compatibility
    if (n > 1 && videoStreams[0].startsWith('[')) {
        const splitOutputs = Array.from({ length: n }, (_, i) => `[v_src_${i}]`).join('');
        filterComplex.push(`${videoStreams[0]}split=${n}${splitOutputs}`);
        getVideoSource = (i?: number) => `[v_src_${i ?? 0}]`;
    }


    const segmentsToConcat: string[] = [];

    // --- Trimming ---
    segments.forEach((seg, i) => {
        // Video Trim
        const vSrc = getVideoSource(i);
        const vLabel = `v_seg_${i}`;
        // If it's a file input e.g. '0:v', wrap in brackets for the filter
        const vInput = vSrc.startsWith('[') ? vSrc : `[${vSrc}]`;
        filterComplex.push(`${vInput}trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[${vLabel}]`);
        segmentsToConcat.push(`[${vLabel}]`);

        // Audio Trim
        const aSrc = getAudioSource(i);
        const aLabel = `a_seg_${i}`;
        const aInput = aSrc.startsWith('[') ? aSrc : `[${aSrc}]`;
        filterComplex.push(`${aInput}atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[${aLabel}]`);
        segmentsToConcat.push(`[${aLabel}]`);
    });

    // --- Concatenation / Transitions ---
    const outV = 'v_out';
    const outA = 'a_pre_norm';

    if (config.transitionType === 'crossfade' && n > 1) {
        // Crossfade logic
        // xfade requires precise offset calculation.
        // offset = sum(duration of previous segments) - (number of previous transitions * crossfade_duration)
        const transitionDuration = 1.0; // 1 second crossfade

        let currentVideoOutput = `[v_seg_0]`;
        let currentAudioOutput = `[a_seg_0]`;

        let accumulatedDuration = segments[0].end - segments[0].start;

        for (let i = 1; i < n; i++) {
            const segDuration = segments[i].end - segments[i].start;
            const offset = accumulatedDuration - transitionDuration;

            const nextVideoOut = i === n - 1 ? `[${outV}]` : `[v_xfade_${i}]`;
            const nextAudioOut = i === n - 1 ? `[${outA}]` : `[a_xfade_${i}]`;

            // We must format the offset so FFmpeg understands it (seconds)
            const offsetStr = Math.max(0, offset).toFixed(3);

            // Video crossfade
            filterComplex.push(`${currentVideoOutput}[v_seg_${i}]xfade=transition=fade:duration=${transitionDuration}:offset=${offsetStr}${nextVideoOut}`);

            // Audio crossfade
            // acrossfade works slightly differently, it crossfades between two streams.
            // Note: acrossfade filter applies to the *end* of the first stream and *start* of second.
            // d = duration of crossfade
            filterComplex.push(`${currentAudioOutput}[a_seg_${i}]acrossfade=d=${transitionDuration}${nextAudioOut}`);

            currentVideoOutput = nextVideoOut;
            currentAudioOutput = nextAudioOut;

            // Accumulated duration grows by the new segment minus the overlap
            accumulatedDuration += segDuration - transitionDuration;
        }

    } else {
        filterComplex.push(`${segmentsToConcat.join('')}concat=n=${n}:v=1:a=1[${outV}][${outA}]`);
    }

    // --- Loudness Normalization ---
    let finalAudio = `[${outA}]`;
    if (config.normalizeAudio) {
        finalAudio = '[a_out]';
        filterComplex.push(`[${outA}]loudnorm=I=-16:TP=-1.5:LRA=11${finalAudio}`);
    }

    // Add filter complex to args
    if (filterComplex.length > 0) {
        args.push('-filter_complex', filterComplex.join(';'));
    }

    // Map outputs
    args.push('-map', `[${outV}]`, '-map', finalAudio);

    // --- Encoding Settings ---
    args.push('-threads', '0'); // Use all available CPU cores for faster processing

    if (config.format === 'mp4') {
        const crf = config.quality === 'high' ? '23' : config.quality === 'medium' ? '28' : '32';
        args.push('-c:v', 'libx264', '-crf', crf, '-preset', 'ultrafast'); // 'ultrafast' for web performance
        args.push('-c:a', 'aac', '-b:a', '192k');
        // essential for browser compatibility
        args.push('-movflags', '+faststart');
    } else {
        // WebM
        const crf = config.quality === 'high' ? '30' : config.quality === 'medium' ? '35' : '40';
        args.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '4'); // 'realtime' and multi-threading options for vp9
        args.push('-c:a', 'libopus', '-b:a', '128k');
    }

    // Output filename
    args.push(outputPath);

    return args;
};
