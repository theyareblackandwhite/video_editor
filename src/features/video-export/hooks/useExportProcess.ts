import { useState, useRef, useEffect, useCallback } from 'react';
import { Command, Child } from '@tauri-apps/plugin-shell';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, remove, readFile } from '@tauri-apps/plugin-fs';
import { safeConvertFileSrc, isTauri } from '../../../shared/utils/tauri';
import { useAppStore } from '../../../app/store';
import type { ExportConfig } from '../utils/ffmpegUtils';
import { buildFFmpegCommand } from '../utils/ffmpegUtils';
import type { MediaFile, CutSegment } from '../../../app/store/types';
import { analyzeVideoForShorts } from '../utils/faceTracker';
import { exportVideoWeb } from '../utils/ffmpegWeb';

interface UseExportProcessProps {
    config: ExportConfig;
    masterVideo: MediaFile | undefined;
    videoFiles: MediaFile[];
    audioFiles: MediaFile[];
    cuts: CutSegment[];
}

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
            if (childProcessRef.current) {
                childProcessRef.current.kill().catch(err => console.error('Failed to kill process on unmount:', err));
            }
        };
    }, [phase]);

    const handleExport = useCallback(async () => {
        if (!masterVideo) return;

        const isTauriEnv = isTauri();
        let fakeProgressInterval: ReturnType<typeof setInterval> | null = null;
        let cropFile: string | undefined = undefined;
        let subtitleFile: string | undefined = undefined;
        let tempAudioPath: string | undefined = undefined;
        
        let cropFileContent: string | undefined = undefined;
        let subtitleFileContent: string | undefined = undefined;

        try {
            let selectedPath = '';

            if (isTauriEnv) {
                const nameBase = masterVideo.name.replace(/\.[^/.]+$/, '');
                const result = await save({
                    filters: [{
                        name: 'Video',
                        extensions: [config.format]
                    }],
                    defaultPath: `${nameBase}_podcut.${config.format}`
                });

                if (!result) {
                    setPhase('config');
                    return;
                }
                selectedPath = result;
            } else {
                selectedPath = `${masterVideo.name.replace(/\.[^/.]+$/, '')}_podcut.${config.format}`;
            }

            setPhase('processing');
            setProgress(0);
            setElapsedTime(0);
            setProgressLabel('Video analiz ediliyor...');
            setOutputPath(selectedPath);
            lastErrorMessageRef.current = '';

            const tempVideo = document.createElement('video');
            tempVideo.src = safeConvertFileSrc(masterVideo.path);
            await new Promise((resolve, reject) => {
                tempVideo.onloadedmetadata = resolve;
                tempVideo.onerror = () => reject(new Error('Videonun metadataları okunamadı. Format desteklenmiyor olabilir.'));
            });
            const duration = tempVideo.duration;

            setProgressLabel('Video işleniyor...');
            
            const appState = useAppStore.getState();
            const shortsConfig = appState.shortsConfig;
            
            if (shortsConfig && shortsConfig.isActive) {
                if (shortsConfig.enableFaceTracker) {
                    setProgressLabel('Yüz analizi yapılıyor...');
                    try {
                        const videoSrc = safeConvertFileSrc(masterVideo.path);
                        const coords = await analyzeVideoForShorts(videoSrc, shortsConfig.startTime ?? 0, shortsConfig.endTime ?? duration, (p: number) => setProgress(p));
                        if (coords && coords.length > 0) {
                            const lines = [];
                            for (let i = 0; i < coords.length; i++) {
                                const c = coords[i];
                                const nextTime = i < coords.length - 1 ? coords[i+1].time : (shortsConfig.endTime ?? duration);
                                lines.push(`${c.time.toFixed(3)}-${nextTime.toFixed(3)} [enter] crop x ${Math.round(c.x)}, crop y ${Math.round(c.y)}, crop w ${Math.round(c.w)}, crop h ${Math.round(c.h)};`);
                            }
                            cropFileContent = lines.join('\n');
                            
                            if (isTauriEnv) {
                                cropFile = selectedPath + '.crop.txt';
                                await writeTextFile(cropFile, cropFileContent);
                            }
                        }
                    } catch (err) {
                        console.error("Face analysis failed:", err);
                    }
                }

                if (shortsConfig.enableCaptions) {
                    setProgressLabel('Ses metne dönüştürülüyor...');
                    try {
                        const audioCtx = new window.AudioContext({ sampleRate: 16000 });
                        let float32Data: Float32Array;

                        if (isTauriEnv) {
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
                                const audioBuffer = await audioCtx.decodeAudioData(rawAudio.buffer.slice(0));
                                float32Data = audioBuffer.getChannelData(0);
                            } else {
                                throw new Error('Ses ayıklama başarısız oldu.');
                            }
                        } else {
                            const response = await fetch(safeConvertFileSrc(masterVideo.path));
                            const arrayBuffer = await response.arrayBuffer();
                            const fullAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                            
                            const startSample = Math.floor((shortsConfig.startTime ?? 0) * 16000);
                            const endSample = Math.floor((shortsConfig.endTime ?? duration) * 16000);
                            float32Data = fullAudioBuffer.getChannelData(0).slice(startSample, endSample);
                        }

                        const worker = new Worker(new URL('../utils/transcriber.ts', import.meta.url), { type: 'module' });
                        await new Promise<void>((resolve, reject) => {
                            worker.onmessage = async (e) => {
                                if (e.data.status === 'ready') {
                                    worker.postMessage({ type: 'transcribe', audioData: float32Data });
                                } else if (e.data.status === 'done') {
                                    subtitleFileContent = e.data.assContent;
                                    if (isTauriEnv) {
                                        subtitleFile = selectedPath + '.ass';
                                        await writeTextFile(subtitleFile, subtitleFileContent!);
                                    }
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
                    } catch (err) {
                        console.error("Caption generation failed:", err);
                    }
                }

                setProgressLabel('Kısa video (Shorts) oluşturuluyor...');
            }

            if (isTauriEnv) {
                const safeSubtitle = subtitleFile || undefined;
                const safeCrop = cropFile || undefined;
                const args = buildFFmpegCommand(config, cuts, duration, videoFiles, audioFiles, masterVideo.id, selectedPath, safeCrop, shortsConfig, undefined, safeSubtitle);

                const cmd = Command.create('ffmpeg', args);
                let hasSeenTime = false;

                cmd.stderr.on('data', (line: string) => {
                    const match = line.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/);
                    if (match) {
                        hasSeenTime = true;
                        const h = parseInt(match[1], 10);
                        const m = parseInt(match[2], 10);
                        const s = parseFloat(match[3]);
                        const timeInSeconds = h * 3600 + m * 60 + s;
                        setProgress(Math.max(0, Math.min(1, timeInSeconds / duration)));
                    } 
                    if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('invalid')) {
                        lastErrorMessageRef.current = line.trim();
                    }
                });

                fakeProgressInterval = setInterval(() => {
                    if (!hasSeenTime) {
                       setProgress(p => {
                           const next = p + 0.1;
                           if (next >= 0.9) {
                               childProcessRef.current?.kill().catch(console.error);
                               return 0.9;
                           }
                           return next;
                       });
                    }
                }, 500);

                const resultCode = await new Promise<number>((resolve, reject) => {
                    cmd.on('close', (data) => resolve(data.code ?? -1));
                    cmd.on('error', (err: any) => reject(new Error(`Command failure: ${err}`)));
                    cmd.spawn().then(child => { childProcessRef.current = child; }).catch(reject);
                });

                if (resultCode !== 0) throw new Error(`FFmpeg hatası: ${lastErrorMessageRef.current || `Kod ${resultCode}`}`);
            } else {
                setProgressLabel('Web motoru hazırlanıyor (FFmpeg.wasm)...');
                const resultData = await exportVideoWeb(
                    config,
                    masterVideo,
                    videoFiles,
                    audioFiles,
                    cuts,
                    duration,
                    (p: number) => setProgress(p),
                    (log: string) => console.log('[FFmpeg-Web]', log),
                    shortsConfig,
                    undefined,
                    cropFileContent,
                    subtitleFileContent
                );

                const regularBuffer = new ArrayBuffer(resultData.length);
                new Uint8Array(regularBuffer).set(resultData);
                
                const blob = new Blob([regularBuffer], { type: config.format === 'mp4' ? 'video/mp4' : 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedPath;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 100);
            }

            setProgress(1);
            setProgressLabel('Tamamlandı');
            setPhase('done');

        } catch (e: any) {
            console.error('Export failed:', e);
            setPhase('config');
            const message = e instanceof Error ? e.message : String(e);
            alert(`Dışa aktarım başarısız oldu:\n\n${message}`);
        } finally {
            if (fakeProgressInterval) clearInterval(fakeProgressInterval);
            childProcessRef.current = null;
            if (isTauriEnv) {
                if (cropFile) remove(cropFile).catch(() => {});
                if (subtitleFile) remove(subtitleFile).catch(() => {});
                if (tempAudioPath) remove(tempAudioPath).catch(() => {});
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
