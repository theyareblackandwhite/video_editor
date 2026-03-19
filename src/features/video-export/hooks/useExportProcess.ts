import { useState, useRef, useEffect, useCallback } from 'react';
import { Command, Child } from '@tauri-apps/plugin-shell';
import { save } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
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
            tempVideo.src = convertFileSrc(masterVideo.path);
            await new Promise((resolve, reject) => {
                tempVideo.onloadedmetadata = resolve;
                tempVideo.onerror = () => reject(new Error('Videonun metadataları okunamadı. Format desteklenmiyor olabilir.'));
            });
            const duration = tempVideo.duration;

            setProgressLabel('Video işleniyor...');

            // 3. Build command and execute
            const args = buildFFmpegCommand(config, cuts, duration, videoFiles, audioFiles, masterVideo.id, selectedPath);

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
