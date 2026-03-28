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
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
                quantized: true,
                progress_callback: (p: any) => {
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
            const totalDuration = audioData.length / 16000;
            
            // Using Float32Array 16kHz audio data
            const result = await transcriber(audioData, {
                task: 'transcribe',
                language: 'turkish',
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: 'word',
                callback_function: () => {}
            });
            
            // ── 1. Hallucination detection ──────────────────────────────────
            // Whisper hallucinates on silence/music by repeating the same word
            // hundreds of times. Detect runs of 4+ identical texts and discard them.
            const rawChunks: any[] = result.chunks || [];
            
            const isHallucination = (chunks: any[]): boolean => {
                if (chunks.length < 4) return false;
                const counts: Record<string, number> = {};
                for (const c of chunks) {
                    const key = (c.text || '').trim().toLowerCase();
                    counts[key] = (counts[key] || 0) + 1;
                }
                const total = chunks.length;
                // If any single word makes up >60% of all chunks → hallucination
                return Object.values(counts).some(v => v / total > 0.6);
            };

            // Deduplicate consecutive identical chunks
            const deduplicateChunks = (chunks: any[]): any[] => {
                const result: any[] = [];
                for (let i = 0; i < chunks.length; i++) {
                    const cur = (chunks[i].text || '').trim().toLowerCase();
                    const prev = i > 0 ? (chunks[i - 1].text || '').trim().toLowerCase() : null;
                    if (cur !== prev) {
                        result.push(chunks[i]);
                    }
                }
                return result;
            };
            
            // ── 2. Build processedChunks ────────────────────────────────────
            let processedChunks: any[];
            
            if (isHallucination(rawChunks)) {
                console.warn('[Transcriber] Whisper hallüsinasyonu tespit edildi. Chunk\'lar temizleniyor.');
                // Try to recover from result.text if it differs from hallucinated word
                const hallWord = (rawChunks[0]?.text || '').trim().toLowerCase();
                const cleanText = (result.text || '').replace(new RegExp(`(\\s*${hallWord}){3,}`, 'gi'), '').trim();
                processedChunks = cleanText
                    ? [{ text: cleanText, timestamp: [0, totalDuration] }]
                    : [];
            } else if (!Array.isArray(rawChunks) || rawChunks.length === 0) {
                // Fall back to sentence-level
                processedChunks = result.text?.trim()
                    ? [{ text: result.text.trim(), timestamp: [0, totalDuration] }]
                    : [];
            } else {
                processedChunks = deduplicateChunks(rawChunks);
            }

            // ── 3. Normalize timestamps ─────────────────────────────────────
            // Clamp to [0, totalDuration] and fix null/out-of-range values
            processedChunks = processedChunks.map((c: any) => {
                const ts = Array.isArray(c.timestamp) ? c.timestamp : [null, null];
                let t0 = typeof ts[0] === 'number' ? ts[0] : null;
                let t1 = typeof ts[1] === 'number' ? ts[1] : null;

                // Clamp: timestamps must be within [0, totalDuration]
                if (t0 !== null) t0 = Math.max(0, Math.min(t0, totalDuration));
                if (t1 !== null) t1 = Math.max(0, Math.min(t1, totalDuration));
                // Ensure t1 > t0
                if (t0 !== null && t1 !== null && t1 <= t0) t1 = Math.min(t0 + 0.3, totalDuration);

                return {
                    text: c.text?.trim() || '',
                    timestamp: [t0, t1]
                };
            }).filter((c: any) => c.text.length > 0);

            console.log('[Transcriber] Final chunk sayısı:', processedChunks.length,
                processedChunks.slice(0, 3).map((c: any) => `"${c.text}" [${c.timestamp[0]}s-${c.timestamp[1]}s]`));

            const assContent = generateAssSubtitle(processedChunks);
            self.postMessage({ status: 'done', assContent, chunks: processedChunks });
        } catch (err: any) {
            console.error('[Transcriber] HATA:', err);
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
Style: Hormozi,sans-serif,64,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,5,30,30,200,1

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
