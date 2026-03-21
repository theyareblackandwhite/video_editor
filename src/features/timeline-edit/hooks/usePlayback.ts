import { useRef, useState, useCallback, useEffect } from 'react';
import type { MediaFile, CutSegment } from '../../../app/store/types';

interface UsePlaybackOptions {
    masterVideoRef: React.RefObject<HTMLVideoElement | null>;
    otherVideoRefs: React.MutableRefObject<Record<string, HTMLVideoElement | null>>;
    audioRefs: React.MutableRefObject<Record<string, HTMLAudioElement | null>>;
    otherVideos: MediaFile[];
    allAudioFiles: MediaFile[];
    cuts: CutSegment[];
    duration: number;
}

export function usePlayback({
    masterVideoRef,
    otherVideoRefs,
    audioRefs,
    otherVideos,
    allAudioFiles,
    cuts,
    duration,
}: UsePlaybackOptions) {
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    /* ── sync all media to time t ── */
    const seekTo = useCallback((t: number) => {
        setCurrentTime(t);

        if (masterVideoRef.current) {
            masterVideoRef.current.currentTime = t;
        }

        otherVideos.forEach(v => {
            const el = otherVideoRefs.current[v.id];
            if (el) {
                el.currentTime = Math.max(0, t - v.syncOffset);
            }
        });

        allAudioFiles.forEach(a => {
            const el = audioRefs.current[a.id];
            if (el) {
                el.currentTime = Math.max(0, t - a.syncOffset);
            }
        });
    }, [masterVideoRef, otherVideoRefs, audioRefs, otherVideos, allAudioFiles]);

    /* Stable ref so WaveSurfer click handler always uses latest seekTo */
    const seekToRef = useRef(seekTo);
    useEffect(() => { seekToRef.current = seekTo; }, [seekTo]);

    /* ── play / pause ── */
    const togglePlay = useCallback(() => {
        if (!masterVideoRef.current) return;

        if (isPlaying) {
            masterVideoRef.current.pause();
            otherVideos.forEach(v => otherVideoRefs.current[v.id]?.pause());
            allAudioFiles.forEach(a => audioRefs.current[a.id]?.pause());
            setIsPlaying(false);
        } else {
            seekTo(masterVideoRef.current.currentTime);
            masterVideoRef.current.play();
            otherVideos.forEach(v => otherVideoRefs.current[v.id]?.play());
            allAudioFiles.forEach(a => audioRefs.current[a.id]?.play());
            setIsPlaying(true);
        }
    }, [isPlaying, seekTo, masterVideoRef, otherVideoRefs, audioRefs, otherVideos, allAudioFiles]);

    /* ── skip ── */
    const skip = useCallback((dt: number) => {
        seekTo(Math.max(0, Math.min(duration, currentTime + dt)));
    }, [seekTo, currentTime, duration]);

    /* ── Sync state with hardware events ── */
    useEffect(() => {
        const video = masterVideoRef.current;
        if (!video) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
        };
    }, [masterVideoRef]);

    /* ── time update loop (with ripple-delete skip) ── */
    useEffect(() => {
        if (!isPlaying) return;
        
        let raf: number;
        const tick = () => {
            const video = masterVideoRef.current;
            if (video) {
                if (video.seeking) {
                    raf = requestAnimationFrame(tick);
                    return;
                }

                const t = video.currentTime;
                let foundGap = false;
                
                for (const cut of cuts) {
                    if (t >= cut.start && t < cut.end) {
                        console.log(`[Playback] Skipping cut: ${cut.start}s -> ${cut.end}s (current: ${t}s)`);
                        seekToRef.current(cut.end + 0.015);
                        foundGap = true;
                        break;
                    }
                }

                if (!foundGap) {
                    setCurrentTime(t);
                }
            }
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => {
            if (raf) cancelAnimationFrame(raf);
        };
    }, [isPlaying, cuts, masterVideoRef]);

    return {
        currentTime,
        setCurrentTime,
        isPlaying,
        setIsPlaying,
        seekTo,
        seekToRef,
        togglePlay,
        skip,
    };
}
