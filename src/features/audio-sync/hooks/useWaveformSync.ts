import { useEffect, useRef, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import WaveSurfer from 'wavesurfer.js';
import type { MediaFile } from '../../../app/store/types';

interface UseWaveformSyncOptions {
    phase: string;
    masterVideo: MediaFile | undefined;
    selectedTarget: MediaFile | undefined;
    masterAmp: number;
    targetAmp: number;
    zoom: number;
    audioOffsetRef: React.MutableRefObject<number>;
    videoAudioRef: React.RefObject<HTMLAudioElement | null>;
    externalAudioRef: React.RefObject<HTMLAudioElement | null>;
}

export function useWaveformSync({
    phase,
    masterVideo,
    selectedTarget,
    masterAmp,
    targetAmp,
    zoom,
    audioOffsetRef,
    videoAudioRef,
    externalAudioRef,
}: UseWaveformSyncOptions) {
    const masterContainer = useRef<HTMLDivElement>(null);
    const targetContainer = useRef<HTMLDivElement>(null);
    const masterWs = useRef<WaveSurfer | null>(null);
    const targetWs = useRef<WaveSurfer | null>(null);
    const zoomRef = useRef(zoom);

    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    const updateAudioVisualPosition = useCallback((offsetTime: number) => {
        if (!masterWs.current || !targetWs.current || !targetContainer.current) return;
        const masterScroll = masterWs.current.getScroll();
        const currentZoom = zoomRef.current;
        const pixelOffset = offsetTime * currentZoom;
        const targetTimelinePos = masterScroll - pixelOffset;

        if (targetTimelinePos < 0) {
            targetWs.current.setScroll(0);
            targetContainer.current.style.transform = `translateX(${-targetTimelinePos}px)`;
        } else {
            targetWs.current.setScroll(targetTimelinePos);
            targetContainer.current.style.transform = `translateX(0px)`;
        }
    }, []);

    // ── Unified Waveform View ──
    useEffect(() => {
        if (phase !== 'done' || !masterVideo || !selectedTarget) return;
        if (!masterContainer.current || !targetContainer.current) return;

        // Cleanup
        if (masterWs.current) { masterWs.current.destroy(); masterWs.current = null; }
        if (targetWs.current) { targetWs.current.destroy(); targetWs.current = null; }

        const videoUrl = convertFileSrc(masterVideo.path);
        const audioUrl = convertFileSrc(selectedTarget.path);

        try {
            masterWs.current = WaveSurfer.create({
                container: masterContainer.current,
                waveColor: '#6366F1',
                progressColor: '#4338CA',
                cursorColor: '#F59E0B',
                cursorWidth: 2,
                height: 80,
                barHeight: masterAmp,
                normalize: true,
                minPxPerSec: 10,
                interact: true,
                hideScrollbar: false,
                autoScroll: true,
            });

            targetWs.current = WaveSurfer.create({
                container: targetContainer.current,
                waveColor: '#10B981',
                progressColor: '#059669',
                cursorColor: 'transparent',
                height: 80,
                barHeight: targetAmp,
                normalize: true,
                minPxPerSec: 10,
                interact: false,
                hideScrollbar: true,
                autoScroll: false,
            });

            masterWs.current.load(videoUrl);
            targetWs.current.load(audioUrl);

            masterWs.current.on('interaction', (newTime: number) => {
                if (videoAudioRef.current) {
                    videoAudioRef.current.currentTime = newTime;
                }
                if (externalAudioRef.current) {
                    externalAudioRef.current.currentTime = Math.max(0, newTime - audioOffsetRef.current);
                }
            });

            masterWs.current.on('scroll', () => {
                updateAudioVisualPosition(audioOffsetRef.current);
            });

            masterWs.current.on('ready', () => {
                try { masterWs.current?.zoom(zoomRef.current); } catch { /* */ }
            });
            targetWs.current.on('ready', () => {
                try { targetWs.current?.zoom(zoomRef.current); } catch { /* */ }
                updateAudioVisualPosition(audioOffsetRef.current);
            });
        } catch (e) {
            console.error('Waveform error:', e);
        }

        return () => {
            if (masterWs.current) { masterWs.current.destroy(); masterWs.current = null; }
            if (targetWs.current) { targetWs.current.destroy(); targetWs.current = null; }
            URL.revokeObjectURL(videoUrl);
            URL.revokeObjectURL(audioUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, masterVideo?.id, selectedTarget?.id]);

    useEffect(() => {
        if (masterWs.current) masterWs.current.setOptions({ barHeight: masterAmp });
    }, [masterAmp]);

    useEffect(() => {
        if (targetWs.current) targetWs.current.setOptions({ barHeight: targetAmp });
    }, [targetAmp]);

    useEffect(() => {
        try {
            masterWs.current?.zoom(zoom);
            targetWs.current?.zoom(zoom);
        } catch { /* */ }
        updateAudioVisualPosition(audioOffsetRef.current);
    }, [zoom, updateAudioVisualPosition, audioOffsetRef]);

    return { masterContainer, targetContainer, masterWs, targetWs, updateAudioVisualPosition };
}
