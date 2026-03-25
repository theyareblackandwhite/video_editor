import { useState, useRef, useEffect, useCallback } from 'react';
import { Command, Child } from '@tauri-apps/plugin-shell';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, remove, readFile } from '@tauri-apps/plugin-fs';
import { safeConvertFileSrc } from '../../../shared/utils/tauri';
import { useAppStore } from '../../../app/store';
import type { ExportConfig } from '../utils/ffmpegUtils';
import { buildFFmpegCommand } from '../utils/ffmpegUtils';
import type { MediaFile, CutSegment } from '../../../app/store/types';

interface UseExportProcessProps {
    config: ExportConfig;
    masterVideo: MediaFile | undefined;
    videoFiles: MediaFile[];
    audioFiles: MediaFile[];
    cuts: CutSegment[];
}

import { analyzeVideoForShorts } from '../utils/faceTracker';

export type ExportPhase = 'config' | 'processing' | 'done';

export function useExportProcess({
    config,
    masterVideo,
    videoFiles,
    audioFiles,
    cuts,
}: UseExportProcessProps) {
    const [phase, setPhase] = useState<ExportPhase>('config');
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState('');
    const [outputPath, setOutputPath] = useState<string>('');
    const [elapsedTime, setElapsedTime] = useState(0);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const childProcessRef = useRef<Child | null>(null);
    const lastErrorMessageRef = useRef<string>('');

    useEffect(() => {
        if (phase === 'processing') {
            timerRef.current = setInterval(() => setElapsedTime(t => t + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { 
            if (timerRef.current) clearInterval(timerRef.current);
            // Cleanup: Kill process if unmounting during processing
            if (childProcessRef.current) {
                childProcessRef.current.kill().catch(err => console.error('Failed to kill process on unmount:', err));
            }
        };
    }, [phase]);

    const handleExport = useCallback(async () => {
        if (!masterVideo) return;

        let fakeProgressInterval: ReturnType<typeof setInterval> | null = null;
        let cropFile: string | undefined = undefined;
        let subtitleFile: string | undefined = undefined;
        let tempAudioPath: string | undefined = undefined;

        try {
            // 1. Pick where to save native file
            const nameBase = masterVideo.name.replace(/\.[^/.]+$/, '');
            const selectedPath = await save({
                filters: [{
                    name: 'Video',
                    extensions: [config.format]
                }],
                defaultPath: `${nameBase}_podcut.${config.format}`
            });

            if (!selectedPath) {
                // User cancelled
                setPhase('config');
                return;
            }

            setPhase('processing');
            setProgress(0);
            setElapsedTime(0);
            setProgressLabel('Video analiz ediliyor...');
            setOutputPath(selectedPath);
            lastErrorMessageRef.current = '';

            // 2. Get accurate duration quickly
            const tempVideo = document.createElement('video');
            tempVideo.src = safeConvertFileSrc(masterVideo.path);
            await new Promise((resolve, reject) => {
                tempVideo.onloadedmetadata = resolve;
                tempVideo.onerror = () => reject(new Error('Videonun metadataları okunamadı. Format desteklenmiyor olabilir.'));
            });
            const duration = tempVideo.duration;

            setProgressLabel('Video işleniyor...');
            
            // Check shorts config
            const appState = useAppStore.getState();
            const shortsConfig = appState.shortsConfig;
            
            if (shortsConfig && shortsConfig.isActive) {
                if (shortsConfig.enableFaceTracker) {
                    setProgressLabel('Yüz analizi yapılıyor...');
                    try {
                        const videoSrc = safeConvertFileSrc(masterVideo.path);
                        const coords = await analyzeVideoForShorts(videoSrc, shortsConfig.startTime ?? 0, shortsConfig.endTime ?? duration, (p) => setProgress(p));
                        if (coords && coords.length > 0) {
                            cropFile = selectedPath + '.crop.txt';
                            const lines = [];
                            for (let i = 0; i < coords.length; i++) {
                                const c = coords[i];
                                const nextTime = i < coords.length - 1 ? coords[i+1].time : (shortsConfig.endTime ?? duration);
                                lines.push(`${c.time.toFixed(3)}-${nextTime.toFixed(3)} [enter] crop x ${Math.round(c.x)}, crop y ${Math.round(c.y)}, crop w ${Math.round(c.w)}, crop h ${Math.round(c.h)};`);
                            }
                            await writeTextFile(cropFile, lines.join('\n'));
                        }
                    } catch (err) {
                        console.error("Face analysis failed:", err);
                    }
                }

                if (shortsConfig.enableCaptions) {
                    setProgressLabel('Ses metne dönüştürülüyor...');
                    try {
                        tempAudioPath = selectedPath + '.export_cc.wav';
                        const exArgs = [
                            '-y', '-i', masterVideo.path,
                            '-ss', (shortsConfig.startTime ?? 0).toString(),
                            '-t', ((shortsConfig.endTime ?? duration) - (shortsConfig.startTime ?? 0)).toString(),
                            '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
                            tempAudioPath
                        ];
                        const extractCmd = Command.create('ffmpeg', exArgs);
                        const exResult = await extractCmd.execute();
                        if (exResult.code === 0) {
                            const rawAudio = await readFile(tempAudioPath);
                            const audioCtx = new window.AudioContext({ sampleRate: 16000 });
                            const audioBuffer = await audioCtx.decodeAudioData(rawAudio.buffer.slice(0));
                            const float32Data = audioBuffer.getChannelData(0);

                            const worker = new Worker(new URL('../utils/transcriber.ts', import.meta.url), { type: 'module' });
                            await new Promise<void>((resolve, reject) => {
                                worker.onmessage = async (e) => {
                                    if (e.data.status === 'ready') {
                                        worker.postMessage({ type: 'transcribe', audioData: float32Data });
                                    } else if (e.data.status === 'done') {
                                        subtitleFile = selectedPath + '.ass';
                                        await writeTextFile(subtitleFile, e.data.assContent);
                                        worker.terminate();
                                        resolve();
                                    } else if (e.data.status === 'error') {
                                        worker.terminate();
                                        reject(new Error(e.data.error));
                                    } else if (e.data.status === 'processing') {
                                        setProgressLabel('Altyazılar sekanslanıyor...');
                                    }
                                };
                                worker.postMessage({ type: 'init' });
                            });
                        }
                    } catch (err) {
                        console.error("Caption generation failed:", err);
                    }
                }

                setProgressLabel('Kısa video (Shorts) oluşturuluyor...');
            }

            // 3. Build command and execute
            const safeSubtitle = subtitleFile || undefined;
            const safeCrop = cropFile || undefined;
            const args = buildFFmpegCommand(config, cuts, duration, videoFiles, audioFiles, masterVideo.id, selectedPath, safeCrop, shortsConfig, undefined, safeSubtitle);

            const cmd = Command.create('ffmpeg', args);
            
            let hasSeenTime = false;

            cmd.stderr.on('data', (line: string) => {
                // Parse FFmpeg output
                const match = line.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/);
                if (match) {
                    hasSeenTime = true;
                    const h = parseInt(match[1], 10);
                    const m = parseInt(match[2], 10);
                    const s = parseFloat(match[3]);
                    const timeInSeconds = h * 3600 + m * 60 + s;
                    setProgress(Math.max(0, Math.min(1, timeInSeconds / duration)));
                } 
                
                // Capture error messages
                if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('invalid')) {
                    lastErrorMessageRef.current = line.trim();
                    console.warn('FFmpeg error detected:', line);
                }
            });

            // Start a safety timeout: if progress is fast (passthrough) or doesn't log time properly
            fakeProgressInterval = setInterval(() => {
                if (!hasSeenTime) {
                   setProgress(p => {
                       const next = p + 0.1;
                       if (next >= 0.9) {
                           // If we hit 90% with fake progress, it might be stuck
                           // According to user request: kill the process if it hits 90% fake progress and hangs
                           console.warn('Process seems stuck at 90% (fake progress). Killing...');
                           childProcessRef.current?.kill().catch(console.error);
                           return 0.9;
                       }
                       return next;
                   });
                }
            }, 500);

            // Wait for command to close
            const resultCode = await new Promise<number>((resolve, reject) => {
                cmd.on('close', (data) => resolve(data.code ?? -1));
                cmd.on('error', (err) => {
                    lastErrorMessageRef.current = `Command error: ${err}`;
                    reject(new Error(`Command failure: ${err}`));
                });

                // Actually start the process
                cmd.spawn().then(child => {
                    childProcessRef.current = child;
                }).catch(reject);
            });

            if (resultCode !== 0) {
                const errorDetail = lastErrorMessageRef.current || `Exit code ${resultCode}`;
                throw new Error(`FFmpeg hatası: ${errorDetail}`);
            }

            setProgress(1);
            setProgressLabel('Tamamlandı');
            setPhase('done');

        } catch (e) {
            console.error('Export failed:', e);
            setPhase('config');
            const message = e instanceof Error ? e.message : String(e);
            alert(`Dışa aktarım başarısız oldu:\n\n${message}`);
        } finally {
            if (fakeProgressInterval) clearInterval(fakeProgressInterval);
            childProcessRef.current = null;
            // Clean up files if we created them
            if (cropFile) {
                 remove(cropFile).catch(() => {});
            }
            if (subtitleFile) {
                 remove(subtitleFile).catch(() => {});
            }
            if (tempAudioPath) {
                 remove(tempAudioPath).catch(() => {});
            }
        }
    }, [videoFiles, audioFiles, masterVideo, config, cuts]);

    const handleReset = useCallback(() => {
        setPhase('config');
        setOutputPath('');
        setProgress(0);
        setElapsedTime(0);
        lastErrorMessageRef.current = '';
    }, []);

    return {
        phase,
        progress,
        progressLabel,
        outputPath,
        elapsedTime,
        handleExport,
        handleReset
    };
}
