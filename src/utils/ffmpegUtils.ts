import type { CutSegment } from '../store/useAppStore';

export interface ExportConfig {
    format: 'mp4' | 'webm';
    quality: 'high' | 'medium' | 'low';
    includeAudio: boolean;
    applyCuts: boolean;
    normalizeAudio: boolean;
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
    syncOffset: number,
    hasExternalAudio: boolean
): string[] => {
    const args: string[] = [];

    // 1. Inputs
    args.push('-i', 'input_video');
    if (config.includeAudio && hasExternalAudio) {
        args.push('-i', 'input_audio');
    }

    const segments = config.applyCuts ? getKeepSegments(cuts, totalDuration) : [{ start: 0, end: totalDuration }];
    const filterComplex: string[] = [];

    // --- Audio Pre-processing (Sync) ---
    // Define the audio source label: [a_src]
    let audioSource = '0:a';
    if (config.includeAudio && hasExternalAudio) {
        audioSource = '1:a';
        // Apply sync offset
        if (syncOffset !== 0) {
            const delayMs = Math.round(Math.abs(syncOffset) * 1000);
            if (syncOffset > 0) {
                // Audio is late -> delay it
                filterComplex.push(`[${audioSource}]adelay=${delayMs}|${delayMs}[a_synced]`);
                audioSource = 'a_synced';
            } else {
                // Audio is early -> trim start
                // Note: 'atrim' is better than -ss for complex filter graphs
                filterComplex.push(`[${audioSource}]atrim=start=${Math.abs(syncOffset)}[a_synced]`);
                // We also need to reset timestamps after trim
                filterComplex.push(`[a_synced]asetpts=PTS-STARTPTS[a_synced_pts]`);
                audioSource = 'a_synced_pts';
            }
        }
    } else if (!config.includeAudio) {
        // No audio requested
        // (Handled later by not including audio stream in output map, or mapping dummy silence)
        // But for now let's assume if includeAudio is false, we just mute or drop audio.
        // If the user unchecks "Include External Audio" but there is video audio, we use video audio?
        // The UI checkbox says "Harici sesi dahil et" (Include external audio).
        // If unchecked, we fall back to video audio (0:a).
        audioSource = '0:a';
    }

    // --- Cutting (Trimming) ---
    // We need to trim both video and audio for each segment

    const n = segments.length;

    // If audioSource is a filter output (not a file stream like "0:a") and we have multiple segments,
    // we MUST split the stream because filter outputs cannot be consumed multiple times.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let getAudioSource: (index: number) => string = (index) => audioSource;
    const isAudioFilterOutput = !/^\d+:a$/.test(audioSource);

    if (n > 1 && isAudioFilterOutput) {
        // Split audio source into n streams: [a_src_0][a_src_1]...
        const splitOutputs = Array.from({ length: n }, (_, i) => `[a_src_${i}]`).join('');
        filterComplex.push(`[${audioSource}]asplit=${n}${splitOutputs}`);
        getAudioSource = (i: number) => `a_src_${i}`;
    }

    const segmentsToConcat: string[] = [];

    segments.forEach((seg, i) => {
        // Video Trim
        // Input stream [0:v] can be reused multiple times without splitting
        const vLabel = `v${i}`;
        filterComplex.push(`[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[${vLabel}]`);
        segmentsToConcat.push(`[${vLabel}]`);

        // Audio Trim
        const aLabel = `a${i}`;
        const currentAudioSource = getAudioSource(i);

        filterComplex.push(`[${currentAudioSource}]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[${aLabel}]`);
        segmentsToConcat.push(`[${aLabel}]`);
    });

    // --- Concatenation ---
    const outV = 'v_out';
    const outA = 'a_pre_norm'; // Output of concat, input to norm

    // Concat filter expects interleaved streams: [v0][a0][v1][a1]...
    filterComplex.push(
        `${segmentsToConcat.join('')}concat=n=${n}:v=1:a=1[${outV}][${outA}]`
    );

    // --- Loudness Normalization ---
    let finalAudio = outA;
    if (config.normalizeAudio) {
        finalAudio = 'a_out';
        filterComplex.push(`[${outA}]loudnorm=I=-16:TP=-1.5:LRA=11[${finalAudio}]`);
    }

    // Add filter complex to args
    args.push('-filter_complex', filterComplex.join(';'));

    // Map outputs
    args.push('-map', `[${outV}]`, '-map', `[${finalAudio}]`);

    // --- Encoding Settings ---
    if (config.format === 'mp4') {
        const crf = config.quality === 'high' ? '18' : config.quality === 'medium' ? '23' : '28';
        args.push('-c:v', 'libx264', '-crf', crf, '-preset', 'ultrafast'); // 'ultrafast' for web performance
        args.push('-c:a', 'aac', '-b:a', '192k');
        // essential for browser compatibility
        args.push('-movflags', '+faststart');
    } else {
        // WebM
        const crf = config.quality === 'high' ? '30' : config.quality === 'medium' ? '35' : '40';
        args.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-deadline', 'realtime'); // 'realtime' for speed
        args.push('-c:a', 'libopus', '-b:a', '128k');
    }

    // Output filename
    args.push(`output.${config.format}`);

    return args;
};
