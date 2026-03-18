import { type CutSegment } from '../../app/store/types';

/**
 * Decode a File to mono Float32Array at a target sample rate.
 * @param maxDuration If provided, only decode up to this many seconds.
 */
export async function decodeToMono(
    file: File,
    sampleRate: number,
    maxDuration?: number
): Promise<Float32Array> {
    const arrayBuffer = await file.arrayBuffer();

    // Use OfflineAudioContext to decode & resample in one step
    const tempCtx = new AudioContext();
    const decoded = await tempCtx.decodeAudioData(arrayBuffer);
    await tempCtx.close();

    const useDuration = maxDuration
        ? Math.min(decoded.duration, maxDuration)
        : decoded.duration;
    const length = Math.ceil(useDuration * sampleRate);

    const offlineCtx = new OfflineAudioContext(1, length, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0, 0, useDuration);

    const rendered = await offlineCtx.startRendering();
    return rendered.getChannelData(0);
}

/**
 * Detect silent regions in an audio file.
 * Returns a list of segments representing the silences.
 */
export async function detectSilences(
    file: File,
    thresholdDb: number,
    minDurationSeconds: number
): Promise<CutSegment[]> {
    const sampleRate = 8000;
    const samples = await decodeToMono(file, sampleRate);

    // Convert thresholdDb to linear amplitude
    const thresholdLinear = Math.pow(10, thresholdDb / 20);

    const minSamples = Math.floor(minDurationSeconds * sampleRate);
    const cuts: CutSegment[] = [];

    let silenceStartSample = -1;

    // Process in small chunks for a bit more efficiency (though still all in memory)
    const chunkSize = Math.floor(0.1 * sampleRate);

    for (let i = 0; i < samples.length; i += chunkSize) {
        const endIdx = Math.min(i + chunkSize, samples.length);

        let maxAmp = 0;
        for (let j = i; j < endIdx; j++) {
            const abs = Math.abs(samples[j]);
            if (abs > maxAmp) {
                maxAmp = abs;
            }
        }

        const isSilent = maxAmp < thresholdLinear;

        if (isSilent) {
            if (silenceStartSample === -1) {
                silenceStartSample = i;
            }
        } else {
            if (silenceStartSample !== -1) {
                const silenceSamples = i - silenceStartSample;
                if (silenceSamples >= minSamples) {
                    cuts.push({
                        id: `auto-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                        start: silenceStartSample / sampleRate,
                        end: i / sampleRate
                    });
                }
                silenceStartSample = -1;
            }
        }
    }

    // Handle case where file ends with silence
    if (silenceStartSample !== -1) {
        const silenceSamples = samples.length - silenceStartSample;
        if (silenceSamples >= minSamples) {
            cuts.push({
                id: `auto-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                start: silenceStartSample / sampleRate,
                end: samples.length / sampleRate
            });
        }
    }

    return cuts;
}
