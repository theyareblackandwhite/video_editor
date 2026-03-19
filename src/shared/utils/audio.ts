import { Command } from '@tauri-apps/plugin-shell';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { type CutSegment } from '../../app/store/types';

/**
 * Extracts audio to a temporary WAV file using Native FFmpeg.
 */
async function extractAudioWav(
    sourcePath: string,
    sampleRate: number,
    maxDuration?: number
): Promise<string> {
    const dataDir = await appDataDir();
    const outPath = await join(dataDir, `temp_audio_${Date.now()}_${crypto.randomUUID()}.wav`);

    const args = ['-i', sourcePath];
    if (maxDuration) {
        args.push('-t', maxDuration.toString());
    }
    args.push('-ac', '1', '-ar', sampleRate.toString(), '-f', 'wav', '-y', outPath);

    const cmd = Command.create('ffmpeg', args);
    const { code, stderr } = await cmd.execute();
    if (code !== 0) {
        throw new Error(`FFmpeg ses çıkarma hatası: ${stderr}`);
    }
    return outPath;
}

/**
 * Decode an absolute file path to mono Float32Array at a target sample rate.
 * Uses native FFmpeg to avoid out-of-memory crashes on large video files.
 */
export async function decodeToMono(
    filePath: string,
    sampleRate: number,
    maxDuration?: number
): Promise<Float32Array> {
    // 1. Extract raw wav via FFmpeg native shell
    const wavPath = await extractAudioWav(filePath, sampleRate, maxDuration);
    
    // 2. Fetch the extracted wav into browser memory
    const assetUrl = convertFileSrc(wavPath);
    const response = await fetch(assetUrl);
    const arrayBuffer = await response.arrayBuffer();
    
    // 3. Decode tiny ArrayBuffer
    const tempCtx = new AudioContext(); // AudioContext is standard for decodeAudioData
    const decoded = await tempCtx.decodeAudioData(arrayBuffer);
    
    // WebKit/Safari requires the context to be closed if not used for playback
    if (tempCtx.state !== 'closed') {
        try { await tempCtx.close(); } catch { /* ignore */ }
    }
    
    return decoded.getChannelData(0);
}

/**
 * Detect silent regions in an audio file.
 * Returns a list of segments representing the silences.
 */
export async function detectSilences(
    filePath: string,
    thresholdDb: number,
    minDurationSeconds: number
): Promise<CutSegment[]> {
    const sampleRate = 8000;
    const samples = await decodeToMono(filePath, sampleRate);

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
                        id: `auto-${Date.now()}-${crypto.randomUUID()}`,
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
                id: `auto-${Date.now()}-${crypto.randomUUID()}`,
                start: silenceStartSample / sampleRate,
                end: samples.length / sampleRate
            });
        }
    }

    return cuts;
}
