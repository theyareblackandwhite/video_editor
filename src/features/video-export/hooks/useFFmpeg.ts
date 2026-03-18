import { useRef, useState, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export const useFFmpeg = () => {
    const ffmpegRef = useRef(new FFmpeg());
    const [isLoaded, setIsLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        const ffmpeg = ffmpegRef.current;
        if (ffmpeg.loaded) {
            setIsLoaded(true);
            return;
        }

        setIsLoading(true);
        // Load from local public directory — avoids CORS/COEP issues with CDN
        const baseURL = `${window.location.origin}/ffmpeg-mt`;
        try {
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript')
            });
            setIsLoaded(true);
        } catch (error) {
            console.error('Failed to load FFmpeg:', error);
            setMessage('FFmpeg yüklenemedi. Lütfen sayfayı yenileyip tekrar deneyin.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        ffmpeg: ffmpegRef.current,
        isLoaded,
        isLoading,
        load,
        message,
        setMessage
    };
};
