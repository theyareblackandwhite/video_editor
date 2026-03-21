import { useRef, useState, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { MediaFile } from '../../../app/store/types';

interface UseWaveformOptions {
    masterVideo: MediaFile | undefined;
    mediaUrls: Record<string, string>;
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

    /* Stable ref for zoom so the ready handler reads the current value */
    const zoomRef = useRef(zoom);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    /* ── WaveSurfer init ── */
    useEffect(() => {
        if (!masterVideo || !waveContainerRef.current) return;
        if (wsRef.current) { wsRef.current.destroy(); wsRef.current = null; }

        const url = mediaUrls[masterVideo.id];
        wsRef.current = WaveSurfer.create({
            container: waveContainerRef.current,
            waveColor: '#818CF8',
            progressColor: '#4F46E5',
            cursorColor: 'transparent', // Custom playhead handles this
            height: 80,
            normalize: true,
            minPxPerSec: zoomRef.current, // Start with current zoom
            interact: true,
            hideScrollbar: true, // Use our custom container scroll
            autoScroll: false, // We handle scrolling
            barWidth: 2,
            barGap: 1,
            barRadius: 1,
        });

        wsRef.current.load(url);
        wsRef.current.on('ready', (d) => {
            setDuration(prev => prev > 0 ? prev : d);
            
            // Initial zoom-to-fit if needed, otherwise use current zoom
            if (waveContainerRef.current && d > 0) {
                const containerWidth = waveContainerRef.current.clientWidth;
                const fitZoom = Math.max(10, (containerWidth * 0.95) / d);
                setZoom(fitZoom);
                wsRef.current?.zoom(fitZoom);
            } else {
                try { wsRef.current?.zoom(zoomRef.current); } catch { /* */ }
            }
        });

        wsRef.current.on('click', (progress: number) => {
            const t = progress * (wsRef.current?.getDuration() || 0);
            seekToRef.current(t);
        });

        return () => {
            if (wsRef.current) {
                wsRef.current.destroy();
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [masterVideo?.id]);

    /* ── zoom effect ── */
    useEffect(() => {
        try { wsRef.current?.zoom(zoom); } catch { /* */ }
    }, [zoom]);

    return { wsRef, zoom, setZoom };
}
