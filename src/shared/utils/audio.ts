import { Command } from '@tauri-apps/plugin-shell';
import { tempDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { mkdir, exists } from '@tauri-apps/plugin-fs';
import { type CutSegment } from '../../app/store/types';

/**
 * Extracts audio to a temporary WAV file using Native FFmpeg.
 */
async function extractAudioWav(
    sourcePath: string,
    sampleRate: number,
    maxDuration?: number
): Promise<string> {
    const dataDir = await tempDir();
    
    // Ensure data directory exists (though tempDir usually exists)
    try {
        if (!(await exists(dataDir))) {
            await mkdir(dataDir, { recursive: true });
        }
    } catch (e) {
        console.error('CRITICAL: Could not check/create tempDir:', e);
        throw new Error(`Geçici dizin oluşturulamadı: ${e}`);
    }

    const outPath = await join(dataDir, `temp_audio_${Date.now()}_${crypto.randomUUID()}.wav`);
    console.log('Extracting audio to:', outPath);

    const args = ['-i', sourcePath];
    if (maxDuration) {
        args.push('-t', maxDuration.toString());
    }
    args.push('-ac', '1', '-ar', sampleRate.toString(), '-f', 'wav', '-y', outPath);

    const tryCommand = async (cmdName: string) => {
        try {
            const cmd = Command.create(cmdName, args);
            const result = await cmd.execute();
            if (result.code === 0) return true;
            console.error(`FFmpeg (${cmdName}) failed with code ${result.code}:`, result.stderr);
            return result.stderr;
        } catch (e) {
            console.warn(`FFmpeg (${cmdName}) execution failed:`, e);
            return String(e);
        }
    };

    // 1. Try default ffmpeg
    const res1 = await tryCommand('ffmpeg');
    if (res1 === true) return outPath;

    // 2. Try homebrew path fallback on Mac
    const res2 = await tryCommand('/opt/homebrew/bin/ffmpeg');
    if (res2 === true) return outPath;

    // If both failed, throw a descriptive error
    throw new Error(`FFmpeg ses çıkarma başarısız oldu. \nHata 1: ${res1}\nHata 2: ${res2}`);
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
    console.log('Starting decodeToMono for:', filePath);
    // 1. Extract raw wav via FFmpeg native shell
    const wavPath = await extractAudioWav(filePath, sampleRate, maxDuration);
    console.log('WAV extracted to:', wavPath);
    
    // 2. Fetch the extracted wav into browser memory
    const assetUrl = convertFileSrc(wavPath);
    console.log('Asset URL:', assetUrl);
    
    let arrayBuffer: ArrayBuffer;
    try {
        const response = await fetch(assetUrl);
        if (!response.ok) {
            throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
        }
        arrayBuffer = await response.arrayBuffer();
        console.log('ArrayBuffer loaded, size:', arrayBuffer.byteLength);
    } catch (e) {
        console.error('Failed to fetch extracted audio:', e);
        throw new Error(`Ses dosyası yüklenemedi: ${e}`);
    }
    
    // 3. Decode tiny ArrayBuffer
    try {
        const tempCtx = new AudioContext(); // AudioContext is standard for decodeAudioData
        const decoded = await tempCtx.decodeAudioData(arrayBuffer);
        console.log('Audio decoded successfully, duration:', decoded.duration);
        
        // WebKit/Safari requires the context to be closed if not used for playback
        if (tempCtx.state !== 'closed') {
            try { await tempCtx.close(); } catch { /* ignore */ }
        }
        
        return decoded.getChannelData(0);
    } catch (e) {
        console.error('Failed to decode audio data:', e);
        throw new Error(`Ses verisi çözülemedi. Dosya bozuk veya çok büyük olabilir: ${e}`);
    }
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
    let lastYieldTime = Date.now();
    const YIELD_INTERVAL_MS = 16; // Yield every ~frame (16ms)

    for (let i = 0; i < samples.length; i += chunkSize) {
        // Yield to main thread to keep UI responsive
        if (Date.now() - lastYieldTime > YIELD_INTERVAL_MS) {
            await new Promise(resolve => setTimeout(resolve, 0));
            lastYieldTime = Date.now();
        }

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
