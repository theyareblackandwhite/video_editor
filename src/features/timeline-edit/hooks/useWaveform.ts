import { useRef, useState, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { MediaFile } from '../../../app/store/types';

interface UseWaveformOptions {
    masterVideo: MediaFile | undefined;
    mediaUrls: React.MutableRefObject<Record<string, string>>;
    waveContainerRef: React.RefObject<HTMLDivElement | null>;
    seekToRef: React.MutableRefObject<(t: number) => void>;
    setDuration: React.Dispatch<React.SetStateAction<number>>;
}

export function useWaveform({
    masterVideo,
    mediaUrls,
    waveContainerRef,
    seekToRef,
    setDuration,
}: UseWaveformOptions) {
    const wsRef = useRef<WaveSurfer | null>(null);
    const [zoom, setZoom] = useState(80);
    const [waveScroll, setWaveScroll] = useState({ left: 0, width: 0 });

    /* Stable ref for zoom so the ready handler reads the current value */
    const zoomRef = useRef(zoom);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    /* ── WaveSurfer init ── */
    useEffect(() => {
        if (!masterVideo || !waveContainerRef.current) return;
        if (wsRef.current) { wsRef.current.destroy(); wsRef.current = null; }

        const url = mediaUrls.current[masterVideo.id] || URL.createObjectURL(masterVideo.file);
        wsRef.current = WaveSurfer.create({
            container: waveContainerRef.current,
            waveColor: '#818CF8',
            progressColor: '#4F46E5',
            cursorColor: '#EF4444',
            height: 80,
            normalize: true,
            minPxPerSec: 10,
            interact: true,
            hideScrollbar: false,
            autoScroll: true,
            barWidth: 2,
            barGap: 1,
            barRadius: 1,
        });

        wsRef.current.load(url);
        wsRef.current.on('ready', (d) => {
            setDuration(prev => prev > 0 ? prev : d);
            try { wsRef.current?.zoom(zoomRef.current); } catch { /* */ }

            const updateScrollInfo = () => {
                const el = waveContainerRef.current?.querySelector<HTMLElement>('div') as HTMLElement | null;
                if (el) {
                    setWaveScroll({ left: el.scrollLeft, width: el.scrollWidth });
                }
            };

            requestAnimationFrame(() => { updateScrollInfo(); });

            const scrollEls = waveContainerRef.current?.querySelectorAll('div') || [];
            scrollEls.forEach(el => {
                el.addEventListener('scroll', updateScrollInfo);
            });
        });
        wsRef.current.on('click', (progress: number) => {
            const t = progress * (wsRef.current?.getDuration() || 0);
            seekToRef.current(t);
        });

        return () => {
            if (wsRef.current) { wsRef.current.destroy(); wsRef.current = null; }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [masterVideo?.id]);

    /* ── zoom effect ── */
    useEffect(() => {
        try { wsRef.current?.zoom(zoom); } catch { /* */ }
        requestAnimationFrame(() => {
            const el = waveContainerRef.current?.querySelector<HTMLElement>('div') as HTMLElement | null;
            if (el) {
                setWaveScroll(prev => ({ ...prev, width: el.scrollWidth }));
            }
        });
    }, [zoom, waveContainerRef]);

    return { wsRef, zoom, setZoom, waveScroll };
}
