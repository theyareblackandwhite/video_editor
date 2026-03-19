import { useState, useRef, useEffect, useCallback } from 'react';
import { Command } from '@tauri-apps/plugin-shell';
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

    useEffect(() => {
        if (phase === 'processing') {
            timerRef.current = setInterval(() => setElapsedTime(t => t + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [phase]);

    const handleExport = useCallback(async () => {
        if (!masterVideo) return;

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

            // 2. Get accurate duration quickly
            const tempVideo = document.createElement('video');
            tempVideo.src = convertFileSrc(masterVideo.path);
            await new Promise((resolve) => {
                tempVideo.onloadedmetadata = resolve;
            });
            const duration = tempVideo.duration;

            setProgressLabel('Video işleniyor...');

            // 3. Build command and execute
            const args = buildFFmpegCommand(config, cuts, duration, videoFiles, audioFiles, masterVideo.id, selectedPath);

            const cmd = Command.create('ffmpeg', args);
            
            let hasSeenTime = false;

            cmd.stderr.on('data', (line: string) => {
                // Parse FFmpeg output
                // Example: time=00:00:05.12
                // Sometimes time can be negative or weird: time=-577014:32:22.77
                const match = line.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/);
                if (match) {
                    hasSeenTime = true;
                    const h = parseInt(match[1], 10);
                    const m = parseInt(match[2], 10);
                    const s = parseFloat(match[3]);
                    const timeInSeconds = h * 3600 + m * 60 + s;
                    setProgress(Math.max(0, Math.min(1, timeInSeconds / duration)));
                } else if (line.toLowerCase().includes('error')) {
                    console.warn('FFmpeg stderr error:', line);
                }
            });

            // Start a safety timeout: if progress is fast (passthrough) or doesn't log time properly,
            // we at least show fake progress or just wait for close.
            // Stream copy runs too fast to reliably stream stderr sometimes.
            const fakeProgressInterval = setInterval(() => {
                if (!hasSeenTime) {
                   setProgress(p => Math.min(0.9, p + 0.1));
                }
            }, 500);

            // Wait for command to close
            let resultCode: number;
            try {
                resultCode = await new Promise<number>((resolve, reject) => {
                    cmd.on('close', (data) => resolve(data.code ?? -1));
                    cmd.on('error', (err) => reject(new Error(`Command failure: ${err}`)));

                    // Actually start the process
                    cmd.spawn().catch(reject);
                });
            } finally {
                clearInterval(fakeProgressInterval);
            }

            if (resultCode !== 0) {
                throw new Error(`FFmpeg error (code ${resultCode}). Lütfen konsolu kontrol edin.`);
            }

            setProgress(1);
            setProgressLabel('Tamamlandı');
            setPhase('done');

        } catch (e) {
            console.error('Export failed:', e);
            setPhase('config');
            alert(`Dışa aktarım başarısız oldu: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [videoFiles, audioFiles, masterVideo, config, cuts]);

    const handleReset = useCallback(() => {
        setPhase('config');
        setOutputPath('');
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
