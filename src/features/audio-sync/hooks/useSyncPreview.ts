import { useState, useCallback, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface UseSyncPreviewOptions {
    videoAudioRef: React.RefObject<HTMLAudioElement | null>;
    externalAudioRef: React.RefObject<HTMLAudioElement | null>;
    syncOffset: number;
    masterWs: React.MutableRefObject<WaveSurfer | null>;
}

export function useSyncPreview({
    videoAudioRef,
    externalAudioRef,
    syncOffset,
    masterWs,
}: UseSyncPreviewOptions) {
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

    const handlePreviewToggle = useCallback(() => {
        if (!videoAudioRef.current || !externalAudioRef.current) return;

        if (isPreviewPlaying) {
            videoAudioRef.current.pause();
            externalAudioRef.current.pause();
            setIsPreviewPlaying(false);
        } else {
            const offset = syncOffset;
            if (offset >= 0) {
                externalAudioRef.current.currentTime = 0;
                videoAudioRef.current.currentTime = offset;
            } else {
                videoAudioRef.current.currentTime = 0;
                externalAudioRef.current.currentTime = -offset;
            }
            videoAudioRef.current.play();
            externalAudioRef.current.play();
            setIsPreviewPlaying(true);
        }
    }, [isPreviewPlaying, syncOffset, videoAudioRef, externalAudioRef]);

    // Keep waveforms in sync with videoAudio playback
    useEffect(() => {
        const audioEl = videoAudioRef.current;
        if (!audioEl) return;

        const updatePlayhead = () => {
            const ct = audioEl.currentTime;
            if (masterWs.current) {
                const dur = masterWs.current.getDuration() || 1;
                masterWs.current.seekTo(ct / dur);
            }
        };

        let frame: number;
        const tick = () => {
            if (isPreviewPlaying) {
                updatePlayhead();
                frame = requestAnimationFrame(tick);
            }
        };

        if (isPreviewPlaying) {
            frame = requestAnimationFrame(tick);
        }

        return () => {
            if (frame) cancelAnimationFrame(frame);
        };
    }, [isPreviewPlaying, masterWs, videoAudioRef]);

    return { isPreviewPlaying, setIsPreviewPlaying, handlePreviewToggle };
}
