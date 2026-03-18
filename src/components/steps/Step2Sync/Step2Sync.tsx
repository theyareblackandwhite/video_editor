import React, { useRef, useState, useCallback, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Wand2, Play, Pause, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Loader2, ZoomIn, ZoomOut, FileVideo, FileAudio } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { useAutoSync } from '../../../hooks/useAutoSync';
import { MAX_DECODE_DURATION_S } from '../../../utils/fileValidation';

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
    const [zoom, setZoom] = useState(50);
    const [masterAmp, setMasterAmp] = useState(1);
    const [targetAmp, setTargetAmp] = useState(1);
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

    // Audio elements for preview playback
    const videoAudioRef = useRef<HTMLAudioElement | null>(null);
    const externalAudioRef = useRef<HTMLAudioElement | null>(null);
    const videoUrlRef = useRef<string>('');
    const audioUrlRef = useRef<string>('');

    // WaveSurfer refs for unified view
    const masterContainer = useRef<HTMLDivElement>(null);
    const targetContainer = useRef<HTMLDivElement>(null);
    const masterWs = useRef<WaveSurfer | null>(null);
    const targetWs = useRef<WaveSurfer | null>(null);

    // WaveSurfer drag wrapper
    const waveformAreaRef = useRef<HTMLDivElement>(null);

    // Drag state
    const dragStartX = useRef<number | null>(null);
    const draggingOffsetStart = useRef<number>(0);
    const audioOffsetRef = useRef(syncOffset);
    const offsetTextRef = useRef<HTMLSpanElement>(null);

    // Create object URLs for playback and waveform rendering
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

    // Apply sync result to store
    useEffect(() => {
        if (results.length > 0) {
            results.forEach(res => {
                // Find if target is a video
                const isVideo = videoFiles.some(v => v.id === res.id);
                if (isVideo) {
                    // We shouldn't dispatch to store in an effect like this if we can avoid it.
                    // But we only want to update once when results arrive.
                    // Let's check current offset so we don't dispatch continuously
                    const vFile = videoFiles.find(v => v.id === res.id);
                    if (vFile && vFile.syncOffset !== res.offsetSeconds) {
                         setVideoSyncOffset(res.id, res.offsetSeconds);
                    }
                } else {
                    const aFile = audioFiles.find(a => a.id === res.id);
                    if (aFile && aFile.syncOffset !== res.offsetSeconds) {
                        setAudioSyncOffset(res.id, res.offsetSeconds);
                    }
                }
            });

            // Set first target as selected by default
            if (!selectedTargetId && targetFiles.length > 0) {
                setSelectedTargetId(targetFiles[0].id);
            }
        }
    }, [results, videoFiles, audioFiles, setVideoSyncOffset, setAudioSyncOffset, selectedTargetId, targetFiles]);

    // Update ref when selected target changes manually
    useEffect(() => {
        if (selectedTarget) {
            audioOffsetRef.current = selectedTarget.syncOffset;
        }
    }, [selectedTarget]);

    // ── Unified Waveform View ──
    useEffect(() => {
        if (phase !== 'done' || !masterVideo || !selectedTarget) return;
        if (!masterContainer.current || !targetContainer.current) return;

        // Cleanup
        if (masterWs.current) { masterWs.current.destroy(); masterWs.current = null; }
        if (targetWs.current) { targetWs.current.destroy(); targetWs.current = null; }

        const videoUrl = URL.createObjectURL(masterVideo.file);
        const audioUrl = URL.createObjectURL(selectedTarget.file);

        try {
            // Setup master (reference) waveform
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

            // Setup target (draggable) waveform
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

            // Sync playhead clicks
            masterWs.current.on('interaction', (newTime: number) => {
                if (videoAudioRef.current) {
                    videoAudioRef.current.currentTime = newTime;
                }
                if (externalAudioRef.current) {
                    externalAudioRef.current.currentTime = Math.max(0, newTime - audioOffsetRef.current);
                }
            });

            masterWs.current.on('ready', () => {
                try { masterWs.current?.zoom(zoom); } catch { /* */ }
            });
            targetWs.current.on('ready', () => {
                try { targetWs.current?.zoom(zoom); } catch { /* */ }
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
    }, [phase, masterVideo, selectedTarget]); // Deliberately omitting masterAmp and targetAmp to avoid recreating on amplitude change

    // Dynamically update amplitude without recreating WaveSurfer
    useEffect(() => {
        if (masterWs.current) {
            masterWs.current.setOptions({ barHeight: masterAmp });
        }
    }, [masterAmp]);

    useEffect(() => {
        if (targetWs.current) {
            targetWs.current.setOptions({ barHeight: targetAmp });
        }
    }, [targetAmp]);

    const updateAudioVisualPosition = useCallback((offsetTime: number) => {
        if (targetContainer.current) {
            const pixelOffset = offsetTime * zoom;
            targetContainer.current.style.transform = `translateX(${pixelOffset}px)`;
        }
    }, [zoom]);

    // Apply Zoom to both
    useEffect(() => {
        try {
            masterWs.current?.zoom(zoom);
            targetWs.current?.zoom(zoom);
        } catch { /* */ }
        updateAudioVisualPosition(audioOffsetRef.current);
    }, [zoom, updateAudioVisualPosition]);

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
    }, [isPreviewPlaying]);

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

    const handleNudge = (amount: number) => {
        if (isPreviewPlaying) {
            videoAudioRef.current?.pause();
            externalAudioRef.current?.pause();
            setIsPreviewPlaying(false);
        }
        const newOffset = syncOffset + amount;
        setSyncOffset(newOffset);
        audioOffsetRef.current = newOffset;
        updateAudioVisualPosition(newOffset);
    };

    const handleConfirm = () => {
        videoAudioRef.current?.pause();
        externalAudioRef.current?.pause();

        // Auto-cut the initial un-synchronized portion
        const maxOffset = Math.max(0, ...videoFiles.map(v => v.syncOffset), ...audioFiles.map(a => a.syncOffset));
        if (maxOffset > 0.1) {
            const { setCuts, cuts } = useAppStore.getState();
            const id = `auto-start-${Date.now()}`;
            setCuts([...cuts, { id, start: 0, end: maxOffset }]);
        }

        setStep(3);
    };

    // Drag handlers for manual offset adjustment
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (dragStartX.current === null) return;
        const deltaPixels = e.clientX - dragStartX.current;
        const deltaSeconds = deltaPixels / zoom;
        const newOffset = draggingOffsetStart.current + deltaSeconds;
        audioOffsetRef.current = newOffset;
        updateAudioVisualPosition(newOffset);

        if (offsetTextRef.current) {
            const sign = newOffset >= 0 ? '+' : '';
            offsetTextRef.current.innerText = `${sign}${newOffset.toFixed(3)}s`;
        }
    }, [zoom, updateAudioVisualPosition]);

    const handleMouseUp = useCallback(function onMouseUp() {
        if (dragStartX.current !== null) {
            setSyncOffset(audioOffsetRef.current);
        }
        dragStartX.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }, [handleMouseMove, setSyncOffset]);

    const handleMouseDown = (e: React.MouseEvent) => {
        dragStartX.current = e.clientX;
        draggingOffsetStart.current = audioOffsetRef.current;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // ── Render ──

    return (
        <div className="max-w-3xl mx-auto py-12 px-4">
            {/* Hidden audio elements for "done" phase preview */}
            <audio ref={videoAudioRef} src={videoUrlRef.current} preload="auto" onTimeUpdate={(e) => {
                if (e.currentTarget.currentTime >= MAX_DECODE_DURATION_S) {
                    e.currentTarget.pause();
                    if (externalAudioRef.current) externalAudioRef.current.pause();
                    setIsPreviewPlaying(false);
                }
            }} />
            <audio ref={externalAudioRef} src={audioUrlRef.current} preload="auto" />

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
                            <span ref={offsetTextRef} className="text-base font-mono font-bold text-blue-600">
                                {syncOffset >= 0 ? '+' : ''}{syncOffset.toFixed(3)}s
                            </span>
                        </div>
                    </div>

                    {/* ── Unified Interactive Waveform Editor ── */}
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 w-full">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
                            <p className="text-xs text-gray-500 flex-1">
                                Yeşil dalga formunu sürükleyerek kaymayı ince ayarlayabilirsiniz.
                            </p>

                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Master Amplitude controls */}
                                <div className="flex items-center gap-1 bg-gray-50 rounded-lg border border-gray-200 p-1" title="Kamera (Mavi) Dalga Boyu">
                                    <button onClick={() => setMasterAmp(a => Math.max(1, a - 1))} className="p-1 px-2 hover:bg-white rounded-md transition-colors text-indigo-600 font-bold" title="Küçült">
                                        -
                                    </button>
                                    <span className="px-1 text-xs font-mono text-indigo-600">Kam x{masterAmp}</span>
                                    <button onClick={() => setMasterAmp(a => Math.min(20, a + 1))} className="p-1 px-2 hover:bg-white rounded-md transition-colors text-indigo-600 font-bold" title="Büyüt">
                                        +
                                    </button>
                                </div>

                                {/* Target Amplitude controls */}
                                <div className="flex items-center gap-1 bg-gray-50 rounded-lg border border-gray-200 p-1" title="Mikrofon (Yeşil) Dalga Boyu">
                                    <button onClick={() => setTargetAmp(a => Math.max(1, a - 1))} className="p-1 px-2 hover:bg-white rounded-md transition-colors text-emerald-600 font-bold" title="Küçült">
                                        -
                                    </button>
                                    <span className="px-1 text-xs font-mono text-emerald-600">Mik x{targetAmp}</span>
                                    <button onClick={() => setTargetAmp(a => Math.min(20, a + 1))} className="p-1 px-2 hover:bg-white rounded-md transition-colors text-emerald-600 font-bold" title="Büyüt">
                                        +
                                    </button>
                                </div>

                                {/* Zoom controls */}
                                <div className="flex items-center gap-1 bg-gray-50 rounded-lg border border-gray-200 p-1">
                                    <button onClick={() => setZoom(z => Math.max(10, z - 10))} className="p-1.5 hover:bg-white rounded-md transition-colors" title="Uzaklaştır">
                                        <ZoomOut size={14} />
                                    </button>
                                    <span className="px-1 text-xs font-mono text-gray-500 w-10 text-center">{zoom}px</span>
                                    <button onClick={() => setZoom(z => Math.min(500, z + 10))} className="p-1.5 hover:bg-white rounded-md transition-colors" title="Yakınlaştır">
                                        <ZoomIn size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div ref={waveformAreaRef} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700 relative select-none">
                            {/* Video track (master reference) */}
                            <div className="relative border-b border-slate-700 bg-slate-800/50">
                                <span className="absolute left-3 top-2 text-[10px] font-bold text-indigo-400 bg-slate-900/80 px-2 py-0.5 rounded z-20 pointer-events-none">
                                    KAMERA (Referans)
                                </span>
                                <div ref={masterContainer} className="w-full" />
                            </div>

                            {/* Audio track (draggable target) */}
                            <div className="relative bg-slate-800/30">
                                <span className="absolute left-3 top-2 text-[10px] font-bold text-emerald-400 bg-slate-900/80 px-2 py-0.5 rounded z-20 pointer-events-none">
                                    {isSelectedVideo ? 'DİĞER KAMERA' : 'MİKROFON'} (Sürüklenebilir)
                                </span>
                                <div
                                    className="w-full overflow-hidden cursor-grab active:cursor-grabbing relative"
                                    onMouseDown={handleMouseDown}
                                >
                                    <div ref={targetContainer} className="w-full transition-transform duration-75 ease-out will-change-transform" />
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

                            <button
                                onClick={handlePreviewToggle}
                                className={`flex items-center justify-center gap-2 mx-4 px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm ${isPreviewPlaying
                                    ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                {isPreviewPlaying ? <Pause size={16} /> : <Play size={16} />}
                                {isPreviewPlaying ? 'Durdur' : 'Sonucu Dinle'}
                            </button>

                            <button onClick={() => handleNudge(0.01)} className="px-2 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors">
                                +0.01s <ChevronRight size={14} className="inline" />
                            </button>
                            <button onClick={() => handleNudge(0.1)} className="px-3 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors">
                                +0.1s
                            </button>
                        </div>
                    </div>

                    {/* ── Actions (always at bottom) ── */}
                    <div className="w-full max-w-md flex flex-col gap-3">

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
