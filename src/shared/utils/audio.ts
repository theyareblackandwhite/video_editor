import { Command } from '@tauri-apps/plugin-shell';
import { tempDir, join } from '@tauri-apps/api/path';
import { isTauri, safeConvertFileSrc } from './tauri';
import { mkdir, exists } from '@tauri-apps/plugin-fs';
import { type CutSegment, type MediaFile } from '../../app/store/types';
import { NonRealTimeVAD } from '@ricky0123/vad-web';

/**
 * Extracts audio to a temporary WAV file using Native FFmpeg.
 */
async function extractAudioWav(
    sourcePath: string,
    sampleRate: number,
    maxDuration?: number
): Promise<string> {
    const dataDir = await tempDir();
    
    // Ensure data directory exists
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

    const res1 = await tryCommand('ffmpeg');
    if (res1 === true) return outPath;

    // Use the alias defined in Tauri capabilities, NOT the raw path
    const res2 = await tryCommand('ffmpeg-brew');
    if (res2 === true) return outPath;

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
    
    let arrayBuffer: ArrayBuffer;

    if (isTauri()) {
        // 1. Extract raw wav via FFmpeg native shell
        const wavPath = await extractAudioWav(filePath, sampleRate, maxDuration);
        console.log('WAV extracted to:', wavPath);
        
        // 2. Fetch the extracted wav into browser memory
        const assetUrl = safeConvertFileSrc(wavPath);
        console.log('Asset URL:', assetUrl);
        
        try {
            const response = await fetch(assetUrl);
            if (!response.ok) {
                throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
            }
            arrayBuffer = await response.arrayBuffer();
        } catch (e) {
            console.error('Failed to fetch extracted audio:', e);
            throw new Error(`Ses dosyası yüklenemedi: ${e}`);
        }
    } else {
        // Web fallback: fetch directly
        console.warn('Web mode: decoding directly via browser AudioContext');
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
            }
            arrayBuffer = await response.arrayBuffer();
        } catch (e) {
            console.error('Failed to fetch audio for web decode:', e);
            throw new Error(`Ses dosyası yüklenemedi: ${e}`);
        }
    }
    
    // 3. Decode into Float32Array
    try {
        const tempCtx = new AudioContext();
        let decoded = await tempCtx.decodeAudioData(arrayBuffer);
        console.log('Audio decoded successfully, duration:', decoded.duration, 'SR:', decoded.sampleRate);
        
        // Use OfflineAudioContext to resample if necessary
        if (decoded.sampleRate !== sampleRate) {
            console.log(`Resampling from ${decoded.sampleRate}Hz to ${sampleRate}Hz...`);
            const offlineCtx = new OfflineAudioContext(
                1, 
                Math.ceil(decoded.duration * sampleRate), 
                sampleRate
            );
            const source = offlineCtx.createBufferSource();
            source.buffer = decoded;
            source.connect(offlineCtx.destination);
            source.start();
            const resampled = await offlineCtx.startRendering();
            decoded = resampled;
        }

        let channelData = decoded.getChannelData(0);

        // Crop if maxDuration is set (primarily for web fallback where FFmpeg didn't crop)
        if (!isTauri() && maxDuration && decoded.duration > maxDuration) {
            const numSamples = Math.floor(maxDuration * sampleRate);
            channelData = channelData.slice(0, numSamples);
        }

        if (tempCtx.state !== 'closed') {
            try { await tempCtx.close(); } catch { /* ignore */ }
        }
        
        return channelData;
    } catch (e) {
        console.error('Failed to decode audio data:', e);
        throw new Error(`Ses verisi çözülemedi. Dosya bozuk veya çok büyük olabilir: ${e}`);
    }
}

/**
 * Detect silent regions in a synchronized timeline.
 * Returns a list of segments representing the silences.
 */
export interface VadDetectionOptions {
    speechProbThreshold: number; 
    minSilenceSec: number;       
    preRollSec: number;          
    postRollSec: number;         
    mergeGapSec: number;         
}

export async function detectSilences(
    masterVideo: MediaFile,
    options: VadDetectionOptions
): Promise<CutSegment[]> {
    const sampleRate = 16000;
    
    // 1. Get samples via decodeToMono (which now handles web fallback)
    const samples = await decodeToMono(masterVideo.path, sampleRate);


    // Initialize VAD model
    // The model URLs are stored in the public/models directory locally.
    // We attach window.location.origin so Vite ignores the dynamic import pipeline.
    console.log("Loading Silero VAD ONNX model...");
    const vad = await NonRealTimeVAD.new({
        modelURL: window.location.origin + "/models/silero_vad_legacy.onnx",
        ortConfig(ort: any) {
            ort.env.wasm.wasmPaths = window.location.origin + "/models/";
        },
        positiveSpeechThreshold: options.speechProbThreshold,
        negativeSpeechThreshold: 0.35,
        redemptionMs: 200,      // requires ~200ms of < 0.35 to stop
        minSpeechMs: 64,        // Ignore tiny < 64ms spikes
    });

    console.log("Running VAD inference...");
    let speechSegmentsIterator;
    try {
        speechSegmentsIterator = await vad.run(samples, sampleRate);
    } catch (e) {
         console.error('VAD Inference failed:', e);
         throw new Error(`VAD motoru çalıştırılamadı: ${e}`);
    }
    
    // Collect speech segments
    const speechSegments = [];
    for await (const segment of speechSegmentsIterator) {
        const startSec = segment.start / 1000;
        const endSec = segment.end / 1000;
        speechSegments.push({ start: startSec, end: endSec });
    }

    console.log(`Detected ${speechSegments.length} initial speech segments.`);

    // 4. Look-ahead Padding & Small Gap Merger
    const finalSpeechSegments: { start: number, end: number }[] = [];
    
    for (const seg of speechSegments) {
        const paddedStart = Math.max(0.0, seg.start - options.preRollSec);
        const paddedEnd = seg.end + options.postRollSec;

        if (finalSpeechSegments.length === 0) {
            finalSpeechSegments.push({ start: paddedStart, end: paddedEnd });
        } else {
            const prevSeg = finalSpeechSegments[finalSpeechSegments.length - 1];
            const gapBetween = paddedStart - prevSeg.end;

            // Merge segments if the gap between them is less than specified mergeGapSec
            if (gapBetween < options.mergeGapSec) {
                // Extend previous segment end to encompass this one
                prevSeg.end = Math.max(prevSeg.end, paddedEnd);
            } else {
                finalSpeechSegments.push({ start: paddedStart, end: paddedEnd });
            }
        }
    }

    // 6. Invert Speech to "Silence Cuts"
    const totalDuration = samples.length / sampleRate;
    const cuts: CutSegment[] = [];
    let lastSpeechEnd = 0.0;

    for (const speech of finalSpeechSegments) {
        // Everything between the end of the last speech and start of this speech is cuttable silence
        if (speech.start > lastSpeechEnd) {
            const silenceDuration = speech.start - lastSpeechEnd;
            if (silenceDuration >= options.minSilenceSec) {
                cuts.push({
                    id: `auto-${Date.now()}-${crypto.randomUUID()}`,
                    start: lastSpeechEnd,
                    end: speech.start
                });
            }
        }
        lastSpeechEnd = speech.end;
    }

    // Check for trailing silence at the end of the video
    if (lastSpeechEnd < totalDuration) {
        const silenceDuration = totalDuration - lastSpeechEnd;
        if (silenceDuration >= options.minSilenceSec) {
            cuts.push({
                id: `auto-${Date.now()}-${crypto.randomUUID()}`,
                start: lastSpeechEnd,
                end: totalDuration
            });
        }
    }

    console.log(`Generated ${cuts.length} silence cuts to remove.`);

    return cuts;
}
