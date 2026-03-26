import { pipeline, env } from '@xenova/transformers';

// Disable fetching models from local files (since it's a browser/Tauri environment with no direct node fs access for models)
env.allowLocalModels = false;
// Ensure we use browser cache for models
env.useBrowserCache = true;

// Define specific paths to prevent 'importScripts' errors in Blob/Worker scenarios under Vite
// See: https://github.com/xenova/transformers.js/issues/366
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';
// Disable attempting to load a nested worker, which throws importScripts errors when loaded via blob URL
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false; // Add this line to ensure no proxy worker is used

// Web Worker instance state
let transcriber: any = null;

self.addEventListener('message', async (e) => {
    const { type, audioData } = e.data;

    if (type === 'init' || !transcriber) {
        try {
            self.postMessage({ status: 'loading' });
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
                quantized: true,
                progress_callback: (p: any) => {
                    // Report download/loading progress
                    self.postMessage({ 
                        status: 'loading_model', 
                        progress: p.progress, 
                        file: p.file 
                    });
                }
            });
            self.postMessage({ status: 'ready' });
            if (type === 'init') return;
        } catch (err: any) {
            self.postMessage({ status: 'error', error: err?.toString() });
            return;
        }
    }

    if (type === 'transcribe' && audioData) {
        try {
            self.postMessage({ status: 'processing' });
            // Using Float32Array 16kHz audio data
            const result = await transcriber(audioData, {
                task: 'transcribe',
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: 'word',
                callback_function: () => {
                    // Report transcription progress
                    // Transformers-JS might give chunk info here if it's long
                }
            });
            
            const assContent = generateAssSubtitle(result.chunks);
            self.postMessage({ status: 'done', assContent, chunks: result.chunks });
        } catch (err: any) {
            self.postMessage({ status: 'error', error: err?.message || err?.toString() });
        }
    }
});

// Helper to escape ASS subtitle format characters
const escapeAss = (text: string) => {
    return text.replace(/,/g, '،').replace(/}/g, '').replace(/{/g, '').trim();
};

export const generateAssSubtitle = (chunks: any[]): string => {
    // Generate ASS Subtitle format "Hormozi" Style
    let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hormozi,Arial Black,64,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,5,30,30,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const maxWordsPerLine = 4;
    let currentLine: any[] = [];
    
    // Format seconds to H:MM:SS.cc
    const formatTime = (secs: number) => {
        if (isNaN(secs) || secs < 0) secs = 0;
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        const cs = Math.floor((secs % 1) * 100);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
    };

    const flushLine = (words: any[]) => {
        if (words.length === 0) return '';
        const start = words[0].timestamp[0];
        const end = words[words.length - 1].timestamp[1];
        
        if (start === null || end === null) return '';

        let result = '';
        for (let i = 0; i < words.length; i++) {
            const wStart = words[i].timestamp[0];
            const wEnd = words[i].timestamp[1];
            
            const actualStart = wStart !== null ? wStart : start;
            const actualEnd = wEnd !== null ? wEnd : end;

            // Highlight word i in yellow (&H00FFFF& in BGR), other words in white (&HFFFFFF&)
            const text = words.map((w, index) => {
                const cleanW = escapeAss(w.text || "");
                if (index === i) {
                    return `{\\c&H00FFFF&}${cleanW}{\\c&HFFFFFF&}`;
                }
                return cleanW;
            }).join(' ');

            result += `Dialogue: 0,${formatTime(actualStart)},${formatTime(actualEnd)},Hormozi,,0,0,0,,${text}\n`;
        }
        return result;
    };

    if (!chunks || !Array.isArray(chunks)) return ass;

    // Word precision chunks (from Whisper tiny 'word' timestamps)
    for (const chunk of chunks) {
        if (currentLine.length >= maxWordsPerLine) {
            ass += flushLine(currentLine);
            currentLine = [];
        }
        currentLine.push(chunk);
    }
    
    if (currentLine.length > 0) {
        ass += flushLine(currentLine);
    }

    return ass;
};
