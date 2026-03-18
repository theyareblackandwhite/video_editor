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

        // Check for SharedArrayBuffer support (required for multi-threaded FFmpeg)
        if (!self.crossOriginIsolated) {
            console.error('SharedArrayBuffer is not available. Check COOP/COEP headers.');
            setMessage('Tarayıcı güvenli ortamda değil veya COOP/COEP başlıkları eksik. Lütfen HTTPS kullandığınızdan ve sunucu yapılandırmasını kontrol ettiğinizden emin olun.');
            setIsLoading(false);
            return;
        }

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
            const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
            setMessage(`FFmpeg yüklenemedi: ${errorMessage}. Lütfen sayfayı yenileyip tekrar deneyin.`);
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
