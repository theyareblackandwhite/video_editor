import React, { useRef, useState, useCallback, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Wand2, Play, Pause, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Settings2, Loader2, ZoomIn, ZoomOut, SkipBack, FileVideo, FileAudio } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { useAutoSync } from '../../../hooks/useAutoSync';

export const Step2Sync: React.FC = () => {
    const {
        videoFiles, audioFiles,
        setVideoSyncOffset, setAudioSyncOffset,
        setStep
    } = useAppStore();
    const { phase, progress, results, error, runSyncMultiple, reset } = useAutoSync();

    const masterVideo = videoFiles.find(v => v.isMaster) || videoFiles[0];

    // Memoize target files to avoid dependency array issues
    const targetFiles = React.useMemo(() => [
        ...videoFiles.filter(v => v.id !== masterVideo?.id),
        ...audioFiles
    ], [videoFiles, audioFiles, masterVideo?.id]);

    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const [showManual, setShowManual] = useState(false);
    const [zoom, setZoom] = useState(50);
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

    // Get the currently selected target file for manual editing
    const selectedTarget = targetFiles.find(f => f.id === selectedTargetId) || targetFiles[0];
    const isSelectedVideo = videoFiles.some(v => v.id === selectedTarget?.id);

    const setSyncOffset = useCallback((offset: number) => {
        if (!selectedTarget) return;
        if (isSelectedVideo) {
            setVideoSyncOffset(selectedTarget.id, offset);
        } else {
            setAudioSyncOffset(selectedTarget.id, offset);
        }
    }, [isSelectedVideo, selectedTarget, setVideoSyncOffset, setAudioSyncOffset]);
    const syncOffset = selectedTarget?.syncOffset || 0;

    // Manual mode playback state
    const [isManualPlaying, setIsManualPlaying] = useState(false);
    const [manualCurrentTime, setManualCurrentTime] = useState(0);
    const [manualDuration, setManualDuration] = useState(0);
    const animFrameRef = useRef<number | null>(null);

    // Audio elements for preview playback
    const videoAudioRef = useRef<HTMLAudioElement | null>(null);
    const externalAudioRef = useRef<HTMLAudioElement | null>(null);
    const videoUrlRef = useRef<string>('');
    const audioUrlRef = useRef<string>('');

    // Manual mode audio elements (separate from the "done" preview ones)
    const manualVideoAudioRef = useRef<HTMLAudioElement | null>(null);
    const manualExternalAudioRef = useRef<HTMLAudioElement | null>(null);
    const manualVideoUrlRef = useRef<string>('');
    const manualAudioUrlRef = useRef<string>('');

    // WaveSurfer refs for preview waveforms (read-only, shown in done state)
    const previewVideoContainer = useRef<HTMLDivElement>(null);
    const previewAudioContainer = useRef<HTMLDivElement>(null);
    const previewVideoWs = useRef<WaveSurfer | null>(null);
    const previewAudioWs = useRef<WaveSurfer | null>(null);

    // WaveSurfer refs for manual mode (interactive, draggable)
    const manualVideoContainer = useRef<HTMLDivElement>(null);
    const manualAudioContainer = useRef<HTMLDivElement>(null);
    const manualVideoWs = useRef<WaveSurfer | null>(null);
    const manualAudioWs = useRef<WaveSurfer | null>(null);

    // Playback cursor ref
    const playbackCursorRef = useRef<HTMLDivElement>(null);
    const waveformAreaRef = useRef<HTMLDivElement>(null);

    // Drag state for manual mode
    const dragStartX = useRef<number | null>(null);
    const draggingOffsetStart = useRef<number>(0);
    const audioOffsetRef = useRef(syncOffset);

    // Create object URLs for done-phase preview playback
    useEffect(() => {
        if (masterVideo?.file) {
            videoUrlRef.current = URL.createObjectURL(masterVideo.file);
        }
        if (selectedTarget?.file) {
            audioUrlRef.current = URL.createObjectURL(selectedTarget.file);
        }
        return () => {
            if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
            if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        };
    }, [masterVideo, selectedTarget]);

    // Create object URLs for manual mode playback
    useEffect(() => {
        if (!showManual) return;
        if (masterVideo?.file) {
            manualVideoUrlRef.current = URL.createObjectURL(masterVideo.file);
        }
        if (selectedTarget?.file) {
            manualAudioUrlRef.current = URL.createObjectURL(selectedTarget.file);
        }
        return () => {
            if (manualVideoUrlRef.current) { URL.revokeObjectURL(manualVideoUrlRef.current); manualVideoUrlRef.current = ''; }
            if (manualAudioUrlRef.current) { URL.revokeObjectURL(manualAudioUrlRef.current); manualAudioUrlRef.current = ''; }
        };
    }, [showManual, masterVideo, selectedTarget]);

    // Apply sync result to store
    useEffect(() => {
        if (results.length > 0) {
            results.forEach(res => {
                const isVideo = videoFiles.some(v => v.id === res.id);
                if (isVideo) {
                    setVideoSyncOffset(res.id, res.offsetSeconds);
                } else {
                    setAudioSyncOffset(res.id, res.offsetSeconds);
                }

                // Update local ref if this is the selected target
                if (res.id === selectedTarget?.id) {
                    audioOffsetRef.current = res.offsetSeconds;
                }
            });

            // Set first target as selected by default
            if (!selectedTargetId && targetFiles.length > 0) {
                setSelectedTargetId(targetFiles[0].id);
            }
        }
    }, [results, videoFiles, setVideoSyncOffset, setAudioSyncOffset, selectedTarget, selectedTargetId, targetFiles]);

    // Update ref when selected target changes manually
    useEffect(() => {
        if (selectedTarget) {
            audioOffsetRef.current = selectedTarget.syncOffset;
        }
    }, [selectedTarget]);

    // ── Preview Waveforms (read-only, shown in done state) ──
    useEffect(() => {
        if (phase !== 'done' || !masterVideo || !selectedTarget) return;
        if (!previewVideoContainer.current || !previewAudioContainer.current) return;

        // Cleanup
        if (previewVideoWs.current) { previewVideoWs.current.destroy(); previewVideoWs.current = null; }
        if (previewAudioWs.current) { previewAudioWs.current.destroy(); previewAudioWs.current = null; }

        const videoUrl = URL.createObjectURL(masterVideo.file);
        const audioUrl = URL.createObjectURL(selectedTarget.file);

        try {
            previewVideoWs.current = WaveSurfer.create({
                container: previewVideoContainer.current,
                waveColor: '#6366F1',
                progressColor: '#4338CA',
                cursorColor: 'transparent',
                height: 64,
                normalize: true,
                interact: false,
                hideScrollbar: true,
                barWidth: 2,
                barGap: 1,
                barRadius: 2,
            });
            previewVideoWs.current.load(videoUrl);

            previewAudioWs.current = WaveSurfer.create({
                container: previewAudioContainer.current,
                waveColor: '#10B981',
                progressColor: '#059669',
                cursorColor: 'transparent',
                height: 64,
                normalize: true,
                interact: false,
                hideScrollbar: true,
                barWidth: 2,
                barGap: 1,
                barRadius: 2,
            });
            previewAudioWs.current.load(audioUrl);
        } catch (e) {
            console.error('Preview waveform error:', e);
        }

        return () => {
            if (previewVideoWs.current) { previewVideoWs.current.destroy(); previewVideoWs.current = null; }
            if (previewAudioWs.current) { previewAudioWs.current.destroy(); previewAudioWs.current = null; }
            URL.revokeObjectURL(videoUrl);
            URL.revokeObjectURL(audioUrl);
        };
    }, [phase, masterVideo, selectedTarget]);

    // ── Manual Mode Waveforms (interactive, draggable) ──
    useEffect(() => {
        if (!showManual || !masterVideo || !selectedTarget) return;
        if (!manualVideoContainer.current || !manualAudioContainer.current) return;

        // Cleanup
        if (manualVideoWs.current) { manualVideoWs.current.destroy(); manualVideoWs.current = null; }
        if (manualAudioWs.current) { manualAudioWs.current.destroy(); manualAudioWs.current = null; }

        const videoUrl = URL.createObjectURL(masterVideo.file);
        const audioUrl = URL.createObjectURL(selectedTarget.file);

        try {
            manualVideoWs.current = WaveSurfer.create({
                container: manualVideoContainer.current,
                waveColor: '#6366F1',
                progressColor: '#4338CA',
                cursorColor: 'transparent',
                autoCenter: true,
                height: 100,
                normalize: true,
                minPxPerSec: 10,
                interact: true,
                hideScrollbar: false,
                autoScroll: true,
            });

            manualAudioWs.current = WaveSurfer.create({
                container: manualAudioContainer.current,
                waveColor: '#10B981',
                progressColor: '#059669',
                cursorColor: 'transparent',
                autoCenter: false,
                height: 100,
                normalize: true,
                minPxPerSec: 10,
                interact: false,
                hideScrollbar: true,
                autoScroll: false,
            });

            manualVideoWs.current.load(videoUrl);
            manualAudioWs.current.load(audioUrl);

            // When clicking on the video waveform, seek audio to matching position
            manualVideoWs.current.on('interaction', (newTime: number) => {
                seekManualTo(newTime);
            });

            // Apply zoom and get duration once ready
            manualVideoWs.current.on('ready', () => {
                try { manualVideoWs.current?.zoom(zoom); } catch { /* */ }
                const dur = manualVideoWs.current?.getDuration() ?? 0;
                setManualDuration(dur);
            });
            manualAudioWs.current.on('ready', () => {
                try { manualAudioWs.current?.zoom(zoom); } catch { /* */ }
                updateAudioVisualPosition(audioOffsetRef.current);
            });
        } catch (e) {
            console.error('Manual waveform error:', e);
        }

        return () => {
            stopManualPlayback();
            if (manualVideoWs.current) { manualVideoWs.current.destroy(); manualVideoWs.current = null; }
            if (manualAudioWs.current) { manualAudioWs.current.destroy(); manualAudioWs.current = null; }
            URL.revokeObjectURL(videoUrl);
            URL.revokeObjectURL(audioUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showManual, masterVideo, selectedTarget]);

    const stopManualPlayback = useCallback(() => {
        manualVideoAudioRef.current?.pause();
        manualExternalAudioRef.current?.pause();
        setIsManualPlaying(false);
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
    }, []);

    const updateAudioVisualPosition = useCallback((offsetTime: number) => {
        if (manualAudioContainer.current) {
            const pixelOffset = offsetTime * zoom;
            manualAudioContainer.current.style.transform = `translateX(${pixelOffset}px)`;
        }
    }, [zoom]);

    // Zoom effect for manual mode
    useEffect(() => {
        if (!showManual) return;
        try {
            manualVideoWs.current?.zoom(zoom);
            manualAudioWs.current?.zoom(zoom);
        } catch { /* */ }
        updateAudioVisualPosition(audioOffsetRef.current);
    }, [zoom, showManual, updateAudioVisualPosition]);

    // Stop manual playback when manual mode is hidden
    useEffect(() => {
        if (!showManual) {
            stopManualPlayback();
        }
    }, [showManual, stopManualPlayback]);

    // ── Manual Playback Cursor Animation ──
    const updatePlaybackCursor = useCallback(function tick() {
        if (!manualVideoAudioRef.current) return;

        const currentTime = manualVideoAudioRef.current.currentTime;
        setManualCurrentTime(currentTime);

        // Update WaveSurfer progress visuals
        if (manualVideoWs.current) {
            const dur = manualVideoWs.current.getDuration();
            if (dur > 0) {
                manualVideoWs.current.seekTo(currentTime / dur);
            }
        }

        // Move the custom cursor
        if (playbackCursorRef.current && waveformAreaRef.current) {
            const waveformWidth = waveformAreaRef.current.scrollWidth;
            const waveformScroll = waveformAreaRef.current.scrollLeft;
            const containerWidth = waveformAreaRef.current.clientWidth;
            const dur = manualDuration || manualVideoAudioRef.current.duration || 1;
            const positionInPixels = (currentTime / dur) * waveformWidth;
            const relativePos = positionInPixels - waveformScroll;

            // If cursor goes off-screen, auto-scroll
            if (relativePos > containerWidth - 50 || relativePos < 50) {
                waveformAreaRef.current.scrollLeft = positionInPixels - containerWidth / 2;
            }

            const clampedPos = Math.max(0, Math.min(relativePos, containerWidth));
            playbackCursorRef.current.style.left = `${clampedPos}px`;
            playbackCursorRef.current.style.display = 'block';
        }

        if (isManualPlaying) {
            animFrameRef.current = requestAnimationFrame(tick);
        }
    }, [isManualPlaying, manualDuration]);

    // Start/stop animation loop when playing state changes
    useEffect(() => {
        if (isManualPlaying) {
            animFrameRef.current = requestAnimationFrame(updatePlaybackCursor);
        } else {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
        }
        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [isManualPlaying, updatePlaybackCursor]);

    // ── Handlers ──

    const handleAutoSync = useCallback(() => {
        if (masterVideo && targetFiles.length > 0) {
            runSyncMultiple(masterVideo.file, targetFiles);
        }
    }, [masterVideo, targetFiles, runSyncMultiple]);

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
    }, [isPreviewPlaying, syncOffset]);

    // ── Manual mode playback ──
    const seekManualTo = useCallback((timeSeconds: number) => {
        if (manualVideoAudioRef.current) {
            manualVideoAudioRef.current.currentTime = timeSeconds;
        }
        if (manualExternalAudioRef.current) {
            const offset = audioOffsetRef.current;
            // Audio time = video time - offset
            const audioTime = timeSeconds - offset;
            manualExternalAudioRef.current.currentTime = Math.max(0, audioTime);
        }
        setManualCurrentTime(timeSeconds);

        // Update WaveSurfer visual positions
        if (manualVideoWs.current) {
            const dur = manualVideoWs.current.getDuration();
            if (dur > 0) {
                manualVideoWs.current.seekTo(timeSeconds / dur);
            }
        }
    }, []);


    const handleManualPlayPause = useCallback(() => {
        if (!manualVideoAudioRef.current || !manualExternalAudioRef.current) return;

        if (isManualPlaying) {
            stopManualPlayback();
        } else {
            const offset = audioOffsetRef.current;
            const videoTime = manualVideoAudioRef.current.currentTime;
            const audioTime = videoTime - offset;
            manualExternalAudioRef.current.currentTime = Math.max(0, audioTime);

            manualVideoAudioRef.current.play();
            manualExternalAudioRef.current.play();
            setIsManualPlaying(true);
        }
    }, [isManualPlaying, stopManualPlayback]);

    const handleManualRestart = useCallback(() => {
        stopManualPlayback();
        seekManualTo(0);
    }, [stopManualPlayback, seekManualTo]);

    // Handle cursor drag for seeking
    const handleCursorDrag = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const startX = e.clientX;
        const startTime = manualCurrentTime;

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!waveformAreaRef.current) return;
            const deltaPixels = moveEvent.clientX - startX;
            const dur = manualDuration || 1;
            const containerWidth = waveformAreaRef.current.scrollWidth;
            const deltaSeconds = (deltaPixels / containerWidth) * dur;
            const newTime = Math.max(0, Math.min(dur, startTime + deltaSeconds));
            seekManualTo(newTime);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [manualCurrentTime, manualDuration, seekManualTo]);

    // Click on waveform area to seek
    const handleWaveformClick = useCallback((e: React.MouseEvent) => {
        if (!waveformAreaRef.current) return;
        const rect = waveformAreaRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left + waveformAreaRef.current.scrollLeft;
        const totalWidth = waveformAreaRef.current.scrollWidth;
        const dur = manualDuration || 1;
        const newTime = (clickX / totalWidth) * dur;
        seekManualTo(Math.max(0, Math.min(dur, newTime)));
    }, [manualDuration, seekManualTo]);

    const handleNudge = (amount: number) => {
        stopManualPlayback();
        const newOffset = syncOffset + amount;
        setSyncOffset(newOffset);
        audioOffsetRef.current = newOffset;
        updateAudioVisualPosition(newOffset);
    };

    const handleConfirm = () => {
        videoAudioRef.current?.pause();
        externalAudioRef.current?.pause();
        stopManualPlayback();
        setStep(3);
    };

    // Drag handlers for manual mode (offset dragging on audio waveform)
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (dragStartX.current === null) return;
        const deltaPixels = e.clientX - dragStartX.current;
        const deltaSeconds = deltaPixels / zoom;
        const newOffset = draggingOffsetStart.current + deltaSeconds;
        audioOffsetRef.current = newOffset;
        setSyncOffset(newOffset);
        updateAudioVisualPosition(newOffset);
    }, [zoom, setSyncOffset, updateAudioVisualPosition]);

    const handleMouseUp = useCallback(function onMouseUp() {
        dragStartX.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }, [handleMouseMove]);

    const handleMouseDown = (e: React.MouseEvent) => {
        dragStartX.current = e.clientX;
        draggingOffsetStart.current = audioOffsetRef.current;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Format time as mm:ss
    const formatTime = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // ── Render ──

    return (
        <div className="max-w-3xl mx-auto py-12 px-4">
            {/* Hidden audio elements for "done" phase preview */}
            <audio ref={videoAudioRef} src={videoUrlRef.current} preload="auto" />
            <audio ref={externalAudioRef} src={audioUrlRef.current} preload="auto" />

            {/* Hidden audio elements for manual mode playback */}
            {showManual && (
                <>
                    <audio ref={manualVideoAudioRef} src={manualVideoUrlRef.current} preload="auto" />
                    <audio ref={manualExternalAudioRef} src={manualAudioUrlRef.current} preload="auto" />
                </>
            )}

            {/* Header */}
            <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-gray-900">Ses Senkronizasyonu</h2>
                <p className="mt-2 text-gray-500">
                    Kamera sesini harici mikrofon kaydıyla hizalayın.
                </p>
            </div>

            {/* ── No targets to sync ── */}
            {targetFiles.length === 0 && (
                <div className="flex flex-col items-center">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
                        <div className="mb-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50">
                                <CheckCircle size={32} className="text-blue-500" />
                            </div>
                        </div>

                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            Senkronize Edilecek Dosya Yok
                        </h3>
                        <p className="text-gray-500 text-sm mb-8">
                            Yalnızca tek bir video yüklediğiniz için senkronizasyon gerekmiyor.
                            Doğrudan düzenlemeye geçebilirsiniz.
                        </p>

                        <button
                            onClick={() => setStep(3)}
                            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl
                                hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/30
                                active:scale-[0.98] transition-all text-lg"
                        >
                            Düzenlemeye Devam Et
                        </button>
                    </div>
                </div>
            )}

            {/* ── Phase: Idle ── */}
            {targetFiles.length > 0 && phase === 'idle' && (
                <div className="flex flex-col items-center">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
                        <div className="mb-6">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                                <Wand2 size={36} className="text-white" />
                            </div>
                        </div>

                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            Otomatik Senkronizasyon
                        </h3>
                        <p className="text-gray-500 text-sm mb-8">
                            Ses dalgalarını analiz ederek otomatik hizalama yapacağız.
                        </p>

                        <button
                            onClick={handleAutoSync}
                            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl
                                hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/30
                                active:scale-[0.98] transition-all text-lg"
                        >
                            <div className="flex items-center justify-center gap-3">
                                <Wand2 size={22} />
                                Otomatik Eşle
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Phase: Processing ── */}
            {phase === 'processing' && (
                <div className="flex flex-col items-center">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
                        <div className="mb-6">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                                <Loader2 size={36} className="text-white animate-spin" />
                            </div>
                        </div>

                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            Ses Analiz Ediliyor...
                        </h3>
                        <p className="text-gray-500 text-sm mb-6">
                            En iyi hizalamayı bulmak için dalga formları karşılaştırılıyor.
                        </p>

                        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-2">%{Math.round(progress * 100)}</p>
                    </div>
                </div>
            )}

            {/* ── Phase: Done ── */}
            {phase === 'done' && results.length > 0 && (
                <div className="flex flex-col items-center gap-6">
                    {/* Success header */}
                    <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-6 w-full text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                            <CheckCircle size={24} className="text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            Senkronizasyon Tamamlandı!
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Tüm dosyalar master videoya göre hizalandı. İnce ayar yapmak isterseniz aşağıdan bir dosya seçebilirsiniz.
                        </p>
                    </div>

                    {/* Target Selection Tabs */}
                    {targetFiles.length > 1 && (
                        <div className="flex flex-wrap justify-center gap-2 w-full">
                            {targetFiles.map(target => {
                                const isVideo = videoFiles.some(v => v.id === target.id);
                                const isSelected = selectedTargetId === target.id || (!selectedTargetId && targetFiles[0].id === target.id);
                                const Icon = isVideo ? FileVideo : FileAudio;
                                return (
                                    <button
                                        key={target.id}
                                        onClick={() => setSelectedTargetId(target.id)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border
                                            ${isSelected
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                    >
                                        <Icon size={16} />
                                        <span className="truncate max-w-[150px]">{target.file.name}</span>
                                        {(results.find(r => r.id === target.id)?.confidence ?? 1) < 0.2 && (
                                            <AlertCircle size={14} className="text-amber-500" aria-label="Düşük güvenilirlik" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Selected Target Confidence & Offset */}
                    <div className="flex items-center justify-between w-full px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div>
                            <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                {isSelectedVideo ? <FileVideo size={16}/> : <FileAudio size={16}/>}
                                Seçili Kaynak: {selectedTarget?.file.name}
                            </span>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {(() => {
                                    const conf = results.find(r => r.id === selectedTarget?.id)?.confidence || 0;
                                    if (conf > 0.5) return 'Yüksek güvenilirlik ile eşleştirildi';
                                    if (conf > 0.2) return 'Orta güvenilirlik — manuel kontrol önerilir';
                                    return 'Düşük güvenilirlik — manuel düzenleme önerilir';
                                })()}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100 text-center">
                            <span className="block text-[10px] text-gray-400 uppercase tracking-wider">Kayma</span>
                            <span className="text-base font-mono font-bold text-blue-600">
                                {syncOffset >= 0 ? '+' : ''}{syncOffset.toFixed(3)}s
                            </span>
                        </div>
                    </div>

                    {/* Waveform Preview (always visible) */}
                    <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700 w-full">
                        <div className="relative border-b border-slate-700 p-2">
                            <span className="absolute left-3 top-2 text-[10px] font-bold text-indigo-400 bg-slate-900/80 px-2 py-0.5 rounded z-10">
                                KAMERA
                            </span>
                            <div ref={previewVideoContainer} className="w-full h-[64px]" />
                        </div>
                        <div className="relative p-2">
                            <span className="absolute left-3 top-2 text-[10px] font-bold text-emerald-400 bg-slate-900/80 px-2 py-0.5 rounded z-10">
                                {isSelectedVideo ? 'DİĞER KAMERA' : 'MİKROFON'}
                            </span>
                            <div ref={previewAudioContainer} className="w-full h-[64px]" />
                        </div>
                    </div>

                    {/* Manual adjust toggle */}
                    <button
                        onClick={() => setShowManual(!showManual)}
                        className={`flex items-center gap-2 text-sm transition-colors ${showManual ? 'text-blue-600 font-medium' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <Settings2 size={14} />
                        {showManual ? 'Manuel Düzenlemeyi Gizle' : 'Olmadı, Manuel Düzenlemeye Geç'}
                    </button>

                    {/* ── Manual Mode: Full Interactive Waveforms with Playback ── */}
                    {showManual && (
                        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 w-full">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2 text-center uppercase tracking-wider">
                                Manuel Hizalama
                            </h4>
                            <p className="text-xs text-gray-400 text-center mb-4">
                                Yeşil dalga formunu sürükleyerek kamera sesiyle hizalayın. Oynat butonuyla sonucu dinleyin, çizgiyi sürükleyerek istediğiniz yere atlayın.
                            </p>

                            {/* Playback controls + Zoom controls */}
                            <div className="flex items-center justify-between mb-4">
                                {/* Playback controls */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleManualRestart}
                                        className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                                        title="Başa Dön"
                                    >
                                        <SkipBack size={18} />
                                    </button>
                                    <button
                                        onClick={handleManualPlayPause}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${isManualPlaying
                                                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-600/20'
                                            }`}
                                    >
                                        {isManualPlaying ? <Pause size={16} /> : <Play size={16} />}
                                        {isManualPlaying ? 'Durdur' : 'Oynat'}
                                    </button>
                                </div>

                                {/* Time display */}
                                <div className="text-xs font-mono text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                                    {formatTime(manualCurrentTime)} / {formatTime(manualDuration)}
                                </div>

                                {/* Zoom controls */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setZoom(z => Math.max(10, z - 10))}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <ZoomOut size={16} />
                                    </button>
                                    <span className="px-2 text-xs font-mono text-gray-500 w-12 text-center">{zoom}px</span>
                                    <button
                                        onClick={() => setZoom(z => Math.min(500, z + 10))}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <ZoomIn size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Dual waveform editor with playback cursor */}
                            <div
                                ref={waveformAreaRef}
                                className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700 relative select-none"
                                onClick={handleWaveformClick}
                            >
                                {/* Playback cursor line */}
                                <div
                                    ref={playbackCursorRef}
                                    className="absolute top-0 bottom-0 z-40 pointer-events-auto cursor-col-resize"
                                    style={{ display: 'none', left: 0, width: '12px', transform: 'translateX(-6px)' }}
                                    onMouseDown={handleCursorDrag}
                                >
                                    {/* Visible cursor line */}
                                    <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                                    {/* Cursor handle top */}
                                    <div className="absolute left-1/2 -translate-x-1/2 -top-0.5 w-3 h-3 bg-amber-400 rounded-full shadow-lg border-2 border-amber-300" />
                                    {/* Cursor handle bottom */}
                                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-0.5 w-3 h-3 bg-amber-400 rounded-full shadow-lg border-2 border-amber-300" />
                                </div>

                                {/* Center guideline */}
                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-red-500/40 z-30 pointer-events-none" />
                                <div className="absolute left-1/2 top-2 -translate-x-1/2 bg-red-600/60 text-white/80 text-[10px] px-1.5 py-0.5 rounded z-30 pointer-events-none font-mono">
                                    MERKEZ
                                </div>

                                {/* Video track (reference) */}
                                <div className="relative border-b border-slate-700 bg-slate-800/50">
                                    <span className="absolute left-3 top-2 text-[10px] font-bold text-indigo-400 bg-slate-900/80 px-2 py-0.5 rounded z-20">
                                        KAMERA (Referans)
                                    </span>
                                    <div ref={manualVideoContainer} className="w-full h-[100px]" />
                                </div>

                                {/* Audio track (draggable) */}
                                <div className="relative bg-slate-800/30">
                                    <span className="absolute left-3 top-2 text-[10px] font-bold text-emerald-400 bg-slate-900/80 px-2 py-0.5 rounded z-20 pointer-events-none">
                                        {isSelectedVideo ? 'DİĞER KAMERA' : 'MİKROFON'} (Sürüklenebilir)
                                    </span>
                                    <div
                                        className="w-full overflow-hidden cursor-grab active:cursor-grabbing relative h-[100px]"
                                        onMouseDown={handleMouseDown}
                                    >
                                        <div ref={manualAudioContainer} className="w-full h-full transition-transform duration-75 ease-out will-change-transform" />
                                    </div>
                                </div>
                            </div>

                            {/* Fine tuning nudge buttons */}
                            <div className="flex items-center justify-center gap-2 mt-4">
                                <button onClick={() => handleNudge(-0.1)} className="px-3 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors">
                                    -0.1s
                                </button>
                                <button onClick={() => handleNudge(-0.01)} className="px-2 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors">
                                    <ChevronLeft size={14} className="inline" /> -0.01s
                                </button>
                                <div className="px-4 py-2 bg-gray-50 rounded-lg border border-gray-200 text-center min-w-[100px]">
                                    <span className="block text-[10px] text-gray-400 uppercase">Kayma</span>
                                    <span className={`font-mono font-bold text-sm ${syncOffset !== 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                                        {syncOffset >= 0 ? '+' : ''}{syncOffset.toFixed(3)}s
                                    </span>
                                </div>
                                <button onClick={() => handleNudge(0.01)} className="px-2 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors">
                                    +0.01s <ChevronRight size={14} className="inline" />
                                </button>
                                <button onClick={() => handleNudge(0.1)} className="px-3 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors">
                                    +0.1s
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Actions (always at bottom) ── */}
                    <div className="w-full max-w-md flex flex-col gap-3">
                        {!showManual && (
                            <button
                                onClick={handlePreviewToggle}
                                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl
                                    hover:bg-gray-50 transition-colors font-medium shadow-sm"
                            >
                                {isPreviewPlaying ? <Pause size={18} /> : <Play size={18} />}
                                {isPreviewPlaying ? 'Önizlemeyi Durdur' : 'Sonucu Dinle'}
                            </button>
                        )}

                        <button
                            onClick={handleConfirm}
                            className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl
                                hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-600/30
                                active:scale-[0.98] transition-all text-lg"
                        >
                            Onayla ve Devam Et
                        </button>
                    </div>
                </div>
            )}

            {/* ── Phase: Error ── */}
            {phase === 'error' && (
                <div className="flex flex-col items-center">
                    <div className="bg-white rounded-2xl shadow-lg border border-red-100 p-10 w-full max-w-md text-center">
                        <div className="mb-4">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
                                <AlertCircle size={32} className="text-red-600" />
                            </div>
                        </div>

                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            Senkronizasyon Başarısız
                        </h3>
                        <p className="text-gray-500 text-sm mb-6">
                            {error || 'Ses dosyaları otomatik olarak hizalanamadı.'}
                        </p>

                        <button
                            onClick={reset}
                            className="w-full py-3 px-6 bg-gray-100 text-gray-700 font-semibold rounded-xl
                                hover:bg-gray-200 transition-colors"
                        >
                            Tekrar Dene
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
