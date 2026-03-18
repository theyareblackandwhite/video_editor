import { useState, useRef, useEffect, useCallback } from 'react';
import type { ExportConfig } from '../utils/ffmpegUtils';
import { buildFFmpegCommand } from '../utils/ffmpegUtils';
import { fetchFile } from '@ffmpeg/util';
import type { MediaFile, CutSegment } from '../../../app/store/types';

interface UseExportProcessProps {
    config: ExportConfig;
    masterVideo: MediaFile | undefined;
    videoFiles: MediaFile[];
    audioFiles: MediaFile[];
    cuts: CutSegment[];
    ffmpeg: any;
    isLoaded: boolean;
}

export type ExportPhase = 'config' | 'processing' | 'done';

export function useExportProcess({
    config,
    masterVideo,
    videoFiles,
    audioFiles,
    cuts,
    ffmpeg,
    isLoaded
}: UseExportProcessProps) {
    const [phase, setPhase] = useState<ExportPhase>('config');
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState('');
    const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
    const [outputUrl, setOutputUrl] = useState('');
    const [elapsedTime, setElapsedTime] = useState(0);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (outputUrl) URL.revokeObjectURL(outputUrl);
        };
    }, [outputUrl]);

    useEffect(() => {
        if (phase === 'processing') {
            timerRef.current = setInterval(() => setElapsedTime(t => t + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [phase]);

    const handleExport = useCallback(async () => {
        if (!masterVideo || !isLoaded) return;

        setPhase('processing');
        setProgress(0);
        setElapsedTime(0);
        setProgressLabel('FFmpeg başlatılıyor...');

        try {
            setProgressLabel('Video analiz ediliyor...');
            const tempVideo = document.createElement('video');
            tempVideo.src = URL.createObjectURL(masterVideo.file);
            await new Promise((resolve) => {
                tempVideo.onloadedmetadata = resolve;
            });
            const duration = tempVideo.duration;
            URL.revokeObjectURL(tempVideo.src);

            setProgressLabel('Dosyalar belleğe yükleniyor...');
            await ffmpeg.writeFile('input_video_0', await fetchFile(masterVideo.file));

            const otherVideos = videoFiles.filter(v => v.id !== masterVideo.id);
            for (let i = 0; i < otherVideos.length; i++) {
                await ffmpeg.writeFile(`input_video_${i + 1}`, await fetchFile(otherVideos[i].file));
            }

            if (config.includeAudio) {
                for (let i = 0; i < audioFiles.length; i++) {
                    await ffmpeg.writeFile(`input_audio_${i}`, await fetchFile(audioFiles[i].file));
                }
            }

            const args = buildFFmpegCommand(config, cuts, duration, videoFiles, audioFiles, masterVideo.id);
            console.log('FFmpeg Command:', args.join(' '));

            setProgressLabel('Video işleniyor...');
            ffmpeg.on('progress', ({ progress }: any) => {
                setProgress(Math.max(0, Math.min(1, progress)));
            });

            await ffmpeg.exec(args);

            setProgressLabel('Sonuç dosyası oluşturuluyor...');
            const outputFilename = `output.${config.format}`;
            const data = await ffmpeg.readFile(outputFilename);
            const blob = new Blob([data as any], { type: `video/${config.format}` });
            const url = URL.createObjectURL(blob);

            setOutputBlob(blob);
            setOutputUrl(url);
            setPhase('done');

            try {
                await ffmpeg.deleteFile('input_video_0');
                const otherVideos = videoFiles.filter(v => v.id !== masterVideo.id);
                for (let i = 0; i < otherVideos.length; i++) {
                    await ffmpeg.deleteFile(`input_video_${i + 1}`);
                }
                if (config.includeAudio) {
                    for (let i = 0; i < audioFiles.length; i++) {
                        await ffmpeg.deleteFile(`input_audio_${i}`);
                    }
                }
                await ffmpeg.deleteFile(outputFilename);
            } catch (cleanupErr) {
                console.warn('Cleanup warning:', cleanupErr);
            }

        } catch (e) {
            console.error('Export failed:', e);
            setPhase('config');
            alert(`Dışa aktarım başarısız oldu: ${e instanceof Error ? e.message : 'Bilinmeyen hata'}`);
        }
    }, [videoFiles, audioFiles, masterVideo, config, cuts, isLoaded, ffmpeg]);

    const handleDownload = useCallback(() => {
        if (!outputUrl || !masterVideo) return;
        const name = masterVideo.file.name.replace(/\.[^/.]+$/, '');
        const ext = config.format;
        const a = document.createElement('a');
        a.href = outputUrl;
        a.download = `${name}_podcut.${ext}`;
        a.click();
    }, [outputUrl, config.format, masterVideo]);

    const handleReset = useCallback(() => {
        setPhase('config');
        setOutputBlob(null);
    }, []);

    return {
        phase,
        progress,
        progressLabel,
        outputBlob,
        outputUrl,
        elapsedTime,
        handleExport,
        handleDownload,
        handleReset
    };
}
