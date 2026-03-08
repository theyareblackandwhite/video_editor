import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import {
    Play, Pause, Scissors, Trash2, ChevronLeft, ChevronRight,
    SkipBack, SkipForward, ZoomIn, ZoomOut, Plus, GripVertical, LayoutTemplate, AudioLines, Loader2
} from 'lucide-react';
import { useAppStore, type CutSegment } from '../../../store/useAppStore';
import { detectSilences } from '../../../utils/autoSync';

/* ── helpers ── */
const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${m}:${String(sec).padStart(2, '0')}.${ms}`;
};

let idCounter = 0;
const uid = () => `seg-${++idCounter}-${Date.now()}`;

export const Step3Edit: React.FC = () => {
    const { videoFiles, audioFiles, cuts, setCuts, layoutMode, setLayoutMode, setStep } = useAppStore();

    /* ── derived state ── */
    const masterVideo = videoFiles.find(v => v.isMaster) || videoFiles[0];
    const otherVideos = videoFiles.filter(v => v.id !== masterVideo?.id);
    const allAudioFiles = audioFiles;

    /* ── refs ── */
    const masterVideoRef = useRef<HTMLVideoElement>(null);
    const otherVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
    const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
    const waveContainerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);

    // Store object URLs for all files
    const mediaUrls = useRef<Record<string, string>>({});

    /* ── state ── */
    const [isDetectingSilences, setIsDetectingSilences] = useState(false);
    const [silenceThreshold, setSilenceThreshold] = useState(-35); // dB
    const [silenceDuration, setSilenceDuration] = useState(0.5); // seconds
    const [showAutoCutSettings, setShowAutoCutSettings] = useState(false);

    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [zoom, setZoom] = useState(80);
    const [waveScroll, setWaveScroll] = useState({ left: 0, width: 0 });
    const [markIn, setMarkIn] = useState<number | null>(null);
    const [selectedCut, setSelectedCut] = useState<string | null>(null);
    const [dragging, setDragging] = useState<{ cutId: string; edge: 'start' | 'end' } | null>(null);

    /* ref to always access latest cuts during drag (avoids stale closure) */
    const cutsRef = useRef(cuts);
    useEffect(() => { cutsRef.current = cuts; }, [cuts]);

    /* ── create object URLs ── */
    useEffect(() => {
        const urls = mediaUrls.current;
        videoFiles.forEach(v => {
            if (!urls[v.id]) urls[v.id] = URL.createObjectURL(v.file);
        });
        audioFiles.forEach(a => {
            if (!urls[a.id]) urls[a.id] = URL.createObjectURL(a.file);
        });
        return () => {
            Object.values(urls).forEach(url => URL.revokeObjectURL(url));
            mediaUrls.current = {};
        };
    }, [videoFiles, audioFiles]);

    /* ── sync video/audio time ── */
    const seekTo = useCallback((t: number) => {
        setCurrentTime(t);

        // Master Video
        if (masterVideoRef.current) {
            masterVideoRef.current.currentTime = t;
        }

        // Other Videos
        otherVideos.forEach(v => {
            const el = otherVideoRefs.current[v.id];
            if (el) {
                el.currentTime = Math.max(0, t - v.syncOffset);
            }
        });

        // Audio Files
        allAudioFiles.forEach(a => {
            const el = audioRefs.current[a.id];
            if (el) {
                el.currentTime = Math.max(0, t - a.syncOffset);
            }
        });
    }, [otherVideos, allAudioFiles]);

    /* Stable ref so WaveSurfer click handler always uses latest seekTo without causing re-init */
    const seekToRef = useRef(seekTo);
    useEffect(() => { seekToRef.current = seekTo; }, [seekTo]);

    /* Stable ref for zoom so the ready handler reads the current value */
    const zoomRef = useRef(zoom);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    /* ── WaveSurfer init (audio waveform on timeline) ── */
    useEffect(() => {
        // Always use master video for waveform — it represents the master timeline.
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
            // Only set duration from WaveSurfer if video hasn't set it yet
            setDuration(prev => prev > 0 ? prev : d);
            // Read current zoom from ref (not stale closure)
            try { wsRef.current?.zoom(zoomRef.current); } catch { /* */ }

            // Track WaveSurfer's scroll position and content width
            const updateScrollInfo = () => {
                const el = waveContainerRef.current?.querySelector<HTMLElement>('div') as HTMLElement | null;
                if (el) {
                    setWaveScroll({ left: el.scrollLeft, width: el.scrollWidth });
                }
            };

            // Wait one frame for WaveSurfer to fully render its canvas
            requestAnimationFrame(() => {
                updateScrollInfo();
            });

            // Observe scroll events on the WaveSurfer wrapper
            const scrollEls = waveContainerRef.current?.querySelectorAll('div') || [];
            scrollEls.forEach(el => {
                el.addEventListener('scroll', updateScrollInfo);
            });
        });
        wsRef.current.on('click', (progress: number) => {
            const t = progress * (wsRef.current?.getDuration() || 0);
            seekToRef.current(t); // Use ref — always latest, no dependency
        });

        return () => {
            if (wsRef.current) { wsRef.current.destroy(); wsRef.current = null; }
            // Do not revoke here, managed by the URL effect
        };
        // Only re-init when master video changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [masterVideo?.id]);

    /* ── zoom ── */
    useEffect(() => {
        try { wsRef.current?.zoom(zoom); } catch { /* */ }
        // Update content width after zoom
        requestAnimationFrame(() => {
            const el = waveContainerRef.current?.querySelector<HTMLElement>('div') as HTMLElement | null;
            if (el) {
                setWaveScroll(prev => ({ ...prev, width: el.scrollWidth }));
            }
        });
    }, [zoom]);

    /* ── time update loop (with ripple-delete skip) ── */
    useEffect(() => {
        if (!isPlaying) return;
        let raf: number;
        const tick = () => {
            if (masterVideoRef.current) {
                const t = masterVideoRef.current.currentTime;
                // Skip over cut regions
                let skipped = false;
                for (const cut of cuts) {
                    if (t >= cut.start && t < cut.end) {
                        seekToRef.current(cut.end); // Jump to end of cut
                        skipped = true;
                        break;
                    }
                }
                if (!skipped) {
                    setCurrentTime(t);
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [isPlaying, cuts]);

    /* ── play / pause ── */
    const togglePlay = useCallback(() => {
        if (!masterVideoRef.current) return;

        if (isPlaying) {
            masterVideoRef.current.pause();
            otherVideos.forEach(v => otherVideoRefs.current[v.id]?.pause());
            allAudioFiles.forEach(a => audioRefs.current[a.id]?.pause());
            setIsPlaying(false);
        } else {
            // Sync all positions before playing
            seekTo(masterVideoRef.current.currentTime);

            masterVideoRef.current.play();
            otherVideos.forEach(v => otherVideoRefs.current[v.id]?.play());
            allAudioFiles.forEach(a => audioRefs.current[a.id]?.play());
            setIsPlaying(true);
        }
    }, [isPlaying, seekTo, otherVideos, allAudioFiles]);

    /* ── skip ── */
    const skip = useCallback((dt: number) => {
        seekTo(Math.max(0, Math.min(duration, currentTime + dt)));
    }, [seekTo, currentTime, duration]);

    /* ── cut operations ── */
    const handleMarkIn = useCallback(() => setMarkIn(prev => prev !== null ? null : currentTime), [currentTime]);

    const handleCutOut = useCallback(() => {
        if (markIn === null) return;
        const start = Math.min(markIn, currentTime);
        const end = Math.max(markIn, currentTime);
        if (end - start < 0.1) return; // too short

        setCuts([...cuts, { id: uid(), start, end }]);
        setMarkIn(null);
    }, [markIn, currentTime, cuts, setCuts]);

    const removeCut = useCallback((id: string) => {
        setCuts(cuts.filter(c => c.id !== id));
        if (selectedCut === id) setSelectedCut(null);
    }, [cuts, setCuts, selectedCut]);

    const jumpToCut = (cut: CutSegment) => {
        setSelectedCut(cut.id);
        seekTo(cut.start);
    };


    /* ── sorted cuts ── */
    const sortedCuts = useMemo(() =>
        [...cuts].sort((a, b) => a.start - b.start),
        [cuts]
    );

    /* ── timeline progress ── */
    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    /* ── drag handle for cut edges ── */
    const handleEdgeDrag = useCallback((e: React.MouseEvent, cutId: string, edge: 'start' | 'end') => {
        e.stopPropagation();
        e.preventDefault();
        const cut = cutsRef.current.find(c => c.id === cutId);
        if (!cut) return;

        const totalPx = waveScroll.width || 1;
        const startX = e.clientX;
        const origStart = cut.start;
        const origEnd = cut.end;
        const MIN_DUR = 0.05;

        setDragging({ cutId, edge });
        document.body.style.cursor = 'col-resize';

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const dt = (dx / totalPx) * duration;
            setCuts(cutsRef.current.map(c => {
                if (c.id !== cutId) return c;
                if (edge === 'start') {
                    return { ...c, start: Math.max(0, Math.min(origEnd - MIN_DUR, origStart + dt)) };
                } else {
                    return { ...c, end: Math.min(duration, Math.max(origStart + MIN_DUR, origEnd + dt)) };
                }
            }));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            setDragging(null);
            document.body.style.cursor = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [duration, setCuts, waveScroll.width]);

    /* ── nudge a cut edge by delta seconds ── */
    const nudgeCutEdge = useCallback((cutId: string, edge: 'start' | 'end', delta: number) => {
        setCuts(cutsRef.current.map(c => {
            if (c.id !== cutId) return c;
            const MIN_DUR = 0.05;
            if (edge === 'start') {
                const newStart = Math.max(0, Math.min(c.end - MIN_DUR, c.start + delta));
                return { ...c, start: newStart };
            } else {
                const newEnd = Math.min(duration, Math.max(c.start + MIN_DUR, c.end + delta));
                return { ...c, end: newEnd };
            }
        }));
    }, [duration, setCuts]);

    /* ── keyboard shortcuts ── */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore when typing in input/textarea/contenteditable
            const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;

            switch (e.key.toLowerCase()) {
                case ' ':           // Space → Play/Pause
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'i':           // I → Mark In
                    e.preventDefault();
                    handleMarkIn();
                    break;
                case 'o':           // O → Cut Out
                case 'x':           // X → Cut Out (alternative)
                    e.preventDefault();
                    handleCutOut();
                    break;
                case 'arrowleft':   // ← → Skip -1s
                    e.preventDefault();
                    skip(-1);
                    break;
                case 'arrowright':  // → → Skip +1s
                    e.preventDefault();
                    skip(1);
                    break;
                case 'j':           // J → Skip -5s
                    e.preventDefault();
                    skip(-5);
                    break;
                case 'l':           // L → Skip +5s
                    e.preventDefault();
                    skip(5);
                    break;
                case 'delete':      // Delete → Remove selected cut
                case 'backspace':
                    if (selectedCut) {
                        e.preventDefault();
                        removeCut(selectedCut);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, handleMarkIn, handleCutOut, skip, selectedCut, removeCut]);

    /* ── auto detect silences ── */
    const handleDetectSilences = async () => {
        if (!masterVideo) return;
        setIsDetectingSilences(true);
        try {
            // Use the master video for silence detection
            // Ideally, we might mix all audio streams, but master is usually a good proxy
            const newCuts = await detectSilences(masterVideo.file, silenceThreshold, silenceDuration);

            // Merge with existing cuts (simple append for now)
            if (newCuts.length > 0) {
                setCuts([...cuts, ...newCuts]);
                alert(`${newCuts.length} sessiz bölüm bulundu ve kesim listesine eklendi.`);
            } else {
                alert(`Belirtilen ayarlara uygun sessiz bölüm bulunamadı.`);
            }
            setShowAutoCutSettings(false);
        } catch (e) {
            console.error('Silence detection failed:', e);
            alert("Sessizlik algılama başarısız oldu. Dosya çok büyük olabilir veya tarayıcı desteklemiyor olabilir.");
        } finally {
            setIsDetectingSilences(false);
        }
    };

    /* ── render ── */
    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Düzenle & Kes</h2>
                    <p className="text-sm text-gray-500">Kesim noktalarını belirleyerek videoyu düzenleyin.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setStep(2)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                    >
                        Geri
                    </button>
                    <button
                        onClick={() => setStep(4)}
                        className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl
                            hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all"
                    >
                        Dışa Aktar →
                    </button>
                </div>
            </div>

            {/* ── Main Layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Video Preview (left) ── */}
                <div className="lg:col-span-2">

                    {/* Layout Controls */}
                    {videoFiles.length > 1 && (
                        <div className="flex items-center gap-2 mb-4 bg-white p-2 rounded-xl shadow-sm border border-gray-100 w-fit">
                            <span className="text-sm font-medium text-gray-600 px-2">Görünüm:</span>
                            <button
                                onClick={() => setLayoutMode('scale')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${layoutMode === 'scale' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                <LayoutTemplate size={16} /> Orijinal (Boşluklu)
                            </button>
                            <button
                                onClick={() => setLayoutMode('crop')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${layoutMode === 'crop' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                <LayoutTemplate size={16} className="rotate-90" /> Kırpılmış (Tam Ekran)
                            </button>
                        </div>
                    )}

                    {/* Video player grid */}
                    <div className="bg-black rounded-2xl overflow-hidden shadow-xl mb-4 aspect-video relative flex items-center justify-center">
                        <div className={`w-full h-full flex ${videoFiles.length > 1 ? 'flex-row' : ''}`}>
                            {masterVideo && (
                                <div className={`relative ${videoFiles.length > 1 ? 'flex-1 border-r border-gray-800' : 'w-full h-full'} overflow-hidden flex items-center justify-center bg-black`}>
                                    <video
                                        ref={masterVideoRef}
                                        src={mediaUrls.current[masterVideo.id]}
                                        className={`w-full h-full ${videoFiles.length > 1 && layoutMode === 'crop' ? 'object-cover' : 'object-contain'}`}
                                        onLoadedMetadata={() => {
                                            if (masterVideoRef.current && duration === 0) {
                                                setDuration(masterVideoRef.current.duration);
                                            }
                                        }}
                                        onEnded={() => setIsPlaying(false)}
                                        muted={allAudioFiles.length > 0} // Mute video if we have external audio
                                    />
                                    {videoFiles.length > 1 && (
                                        <span className="absolute top-2 left-2 bg-black/60 text-white/80 text-[10px] px-2 py-1 rounded font-mono">MASTER</span>
                                    )}
                                </div>
                            )}

                            {otherVideos.map(v => (
                                <div key={v.id} className="relative flex-1 overflow-hidden flex items-center justify-center bg-black border-l border-gray-800">
                                    <video
                                        ref={el => { if (el) otherVideoRefs.current[v.id] = el; }}
                                        src={mediaUrls.current[v.id]}
                                        className={`w-full h-full ${layoutMode === 'crop' ? 'object-cover' : 'object-contain'}`}
                                        muted // Mute secondary videos
                                    />
                                    <span className="absolute top-2 left-2 bg-black/60 text-white/80 text-[10px] px-2 py-1 rounded font-mono">KAMERA 2</span>
                                </div>
                            ))}
                        </div>

                        {/* Hidden Audio Elements */}
                        {allAudioFiles.map(a => (
                            <audio
                                key={a.id}
                                ref={el => { if (el) audioRefs.current[a.id] = el; }}
                                src={mediaUrls.current[a.id]}
                                preload="auto"
                            />
                        ))}

                        {/* Time overlay */}
                        <div className="absolute bottom-3 left-3 bg-black/70 text-white px-3 py-1 rounded-lg font-mono text-sm">
                            {fmtTime(currentTime)} / {fmtTime(duration)}
                        </div>

                        {/* Mark In indicator */}
                        {markIn !== null && (
                            <div className="absolute top-3 right-3 bg-red-600/90 text-white px-3 py-1 rounded-lg text-xs font-semibold animate-pulse">
                                Başlangıç: {fmtTime(markIn)}
                            </div>
                        )}
                    </div>

                    {/* ── Transport Controls ── */}
                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4">
                        <div className="flex items-center justify-center gap-4 mb-4">
                            <button onClick={() => skip(-5)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="-5s">
                                <SkipBack size={20} />
                            </button>
                            <button onClick={() => skip(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="-1s">
                                <ChevronLeft size={20} />
                            </button>
                            <button
                                onClick={togglePlay}
                                className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-600/30 hover:shadow-xl active:scale-95 transition-all"
                            >
                                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                            </button>
                            <button onClick={() => skip(1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="+1s">
                                <ChevronRight size={20} />
                            </button>
                            <button onClick={() => skip(5)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="+5s">
                                <SkipForward size={20} />
                            </button>
                        </div>

                        {/* Cut buttons */}
                        <div className="flex items-center justify-between mb-4">

                            <div className="relative">
                                <button
                                    onClick={() => setShowAutoCutSettings(!showAutoCutSettings)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
                                >
                                    <AudioLines size={16} />
                                    Otomatik Sessizlik Kes
                                </button>

                                {showAutoCutSettings && (
                                    <div className="absolute top-full mt-2 left-0 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50">
                                        <h4 className="font-semibold text-gray-800 mb-3 text-sm">Otomatik Kesim Ayarları</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="flex justify-between text-xs text-gray-600 mb-1">
                                                    <span>Hassasiyet (dB)</span>
                                                    <span>{silenceThreshold} dB</span>
                                                </label>
                                                <input
                                                    type="range" min="-60" max="-10" value={silenceThreshold}
                                                    onChange={e => setSilenceThreshold(Number(e.target.value))}
                                                    className="w-full accent-purple-600"
                                                />
                                            </div>
                                            <div>
                                                <label className="flex justify-between text-xs text-gray-600 mb-1">
                                                    <span>Min. Sessizlik Süresi</span>
                                                    <span>{silenceDuration}s</span>
                                                </label>
                                                <input
                                                    type="range" min="0.1" max="2" step="0.1" value={silenceDuration}
                                                    onChange={e => setSilenceDuration(Number(e.target.value))}
                                                    className="w-full accent-purple-600"
                                                />
                                            </div>
                                            <button
                                                onClick={handleDetectSilences}
                                                disabled={isDetectingSilences}
                                                className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 flex justify-center items-center gap-2"
                                            >
                                                {isDetectingSilences ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
                                                Sessizlikleri Bul ve Kes
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleMarkIn}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${markIn !== null ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                >
                                    {markIn !== null ? <Trash2 size={16} /> : <Plus size={16} />}
                                    {markIn !== null ? `Kaldır: ${fmtTime(markIn)}` : 'Başlangıç İşaretle'}
                                </button>
                                <button
                                    onClick={handleCutOut}
                                    disabled={markIn === null}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white
                                        hover:bg-red-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-red-600/20"
                                >
                                    <Scissors size={16} />
                                    Kes
                                </button>
                            </div>
                        </div>

                        {/* Keyboard shortcut hints */}
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                            {[
                                { key: 'Space', label: 'Oynat/Duraklat' },
                                { key: 'I', label: 'Başlangıç' },
                                { key: 'O / X', label: 'Kes' },
                                { key: 'J / L', label: '±5s' },
                                { key: '← / →', label: '±1s' },
                            ].map(s => (
                                <span key={s.key} className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                                    <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-mono font-semibold text-gray-500">{s.key}</kbd>
                                    {s.label}
                                </span>
                            ))}
                        </div>

                        {/* ── Timeline / Waveform ── */}
                        <div className="relative">
                            {/* Zoom controls */}
                            <div className="flex items-center justify-end gap-1 mb-2">
                                <button onClick={() => setZoom(z => Math.max(10, z - 10))} className="p-1 hover:bg-gray-100 rounded transition-colors">
                                    <ZoomOut size={14} />
                                </button>
                                <span className="text-[10px] font-mono text-gray-400 w-10 text-center">{zoom}px</span>
                                <button onClick={() => setZoom(z => Math.min(500, z + 10))} className="p-1 hover:bg-gray-100 rounded transition-colors">
                                    <ZoomIn size={14} />
                                </button>
                            </div>

                            {/* Waveform */}
                            <div className="bg-white rounded-xl overflow-hidden border border-gray-200 relative shadow-sm">
                                <div ref={waveContainerRef} className="w-full h-[80px]" />

                                {/* Cut regions overlay – React-rendered, scroll-synced */}
                                <div
                                    className="absolute top-0 left-0 h-full overflow-hidden pointer-events-none"
                                    style={{ width: '100%' }}
                                >
                                    <div style={{
                                        width: waveScroll.width > 0 ? waveScroll.width : '100%',
                                        height: '100%',
                                        position: 'relative',
                                        transform: `translateX(-${waveScroll.left}px)`,
                                    }}>
                                        {duration > 0 && sortedCuts.map(cut => {
                                            const left = (cut.start / duration) * 100;
                                            const w = ((cut.end - cut.start) / duration) * 100;
                                            {
                                                const isActive = selectedCut === cut.id;
                                                const isDraggingThis = dragging?.cutId === cut.id;
                                                const isDraggingStart = isDraggingThis && dragging?.edge === 'start';
                                                const isDraggingEnd = isDraggingThis && dragging?.edge === 'end';
                                                return (
                                                    <div
                                                        key={cut.id}
                                                        className="absolute top-0 h-full cursor-pointer pointer-events-auto group/cut"
                                                        style={{
                                                            left: `${left}%`,
                                                            width: `${w}%`,
                                                            background: isDraggingThis
                                                                ? 'rgba(239,68,68,0.55)'
                                                                : isActive ? 'rgba(239,68,68,0.45)' : 'rgba(239,68,68,0.25)',
                                                            borderLeft: '2px solid rgb(239,68,68)',
                                                            borderRight: '2px solid rgb(239,68,68)',
                                                            boxShadow: isDraggingThis
                                                                ? '0 0 8px 2px rgba(239,68,68,0.5)'
                                                                : isActive ? '0 0 0 2px rgba(248,113,113,0.8)' : undefined,
                                                            transition: isDraggingThis ? 'none' : 'background 0.15s, box-shadow 0.15s',
                                                        }}
                                                        onClick={() => jumpToCut(cut)}
                                                        title={`${fmtTime(cut.start)} → ${fmtTime(cut.end)}`}
                                                    >
                                                        {/* Left drag handle */}
                                                        <div
                                                            className="absolute top-0 h-full cursor-col-resize z-20 flex items-center justify-center"
                                                            style={{
                                                                left: -6,
                                                                width: 12,
                                                                background: isDraggingStart
                                                                    ? 'rgba(220,38,38,0.95)'
                                                                    : 'rgba(239,68,68,0.7)',
                                                                borderRadius: '3px 0 0 3px',
                                                                transition: isDraggingStart ? 'none' : 'background 0.15s, box-shadow 0.15s',
                                                                boxShadow: isDraggingStart ? '0 0 6px rgba(220,38,38,0.6)' : undefined,
                                                            }}
                                                            onMouseDown={(e) => handleEdgeDrag(e, cut.id, 'start')}
                                                        >
                                                            <GripVertical size={10} className="text-white/90" />
                                                            {/* Tooltip while dragging */}
                                                            {isDraggingStart && (
                                                                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg z-30">
                                                                    {fmtTime(cut.start)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* Right drag handle */}
                                                        <div
                                                            className="absolute top-0 h-full cursor-col-resize z-20 flex items-center justify-center"
                                                            style={{
                                                                right: -6,
                                                                width: 12,
                                                                background: isDraggingEnd
                                                                    ? 'rgba(220,38,38,0.95)'
                                                                    : 'rgba(239,68,68,0.7)',
                                                                borderRadius: '0 3px 3px 0',
                                                                transition: isDraggingEnd ? 'none' : 'background 0.15s, box-shadow 0.15s',
                                                                boxShadow: isDraggingEnd ? '0 0 6px rgba(220,38,38,0.6)' : undefined,
                                                            }}
                                                            onMouseDown={(e) => handleEdgeDrag(e, cut.id, 'end')}
                                                        >
                                                            <GripVertical size={10} className="text-white/90" />
                                                            {/* Tooltip while dragging */}
                                                            {isDraggingEnd && (
                                                                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg z-30">
                                                                    {fmtTime(cut.end)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                        })}

                                        {/* Playhead */}
                                        <div
                                            className="absolute top-0 h-full pointer-events-none z-10"
                                            style={{
                                                left: `${progressPercent}%`,
                                                width: 2,
                                                background: 'rgba(15,23,42,0.85)',
                                                boxShadow: '0 0 4px rgba(15,23,42,0.3)',
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Scrubber bar with draggable thumb */}
                            <div
                                className="mt-3 h-2 bg-gray-200 rounded-full cursor-pointer relative group"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                    seekTo(pct * duration);
                                }}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    const bar = e.currentTarget;
                                    const scrub = (ev: MouseEvent) => {
                                        const rect = bar.getBoundingClientRect();
                                        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                                        seekTo(pct * duration);
                                    };
                                    scrub(e.nativeEvent);
                                    const onUp = () => {
                                        document.removeEventListener('mousemove', scrub);
                                        document.removeEventListener('mouseup', onUp);
                                    };
                                    document.addEventListener('mousemove', scrub);
                                    document.addEventListener('mouseup', onUp);
                                }}
                            >
                                {/* Progress fill */}
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full pointer-events-none"
                                    style={{ width: `${progressPercent}%` }}
                                />
                                {/* Draggable thumb */}
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-10"
                                    style={{ left: `${progressPercent}%` }}
                                >
                                    <div className="w-4 h-4 -ml-2 rounded-full bg-blue-600 border-2 border-white shadow-md
                                        group-hover:scale-125 transition-transform" />
                                </div>
                                {/* Cut markers */}
                                {sortedCuts.map(cut => (
                                    <div
                                        key={cut.id}
                                        className="absolute top-0 h-full bg-red-500/50 pointer-events-none"
                                        style={{
                                            left: `${(cut.start / duration) * 100}%`,
                                            width: `${((cut.end - cut.start) / duration) * 100}%`
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Cut List (right sidebar) ── */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 sticky top-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">Kesim Listesi</h3>
                        <p className="text-xs text-gray-400 mb-4">
                            Çıkarılacak bölümler aşağıda listelenir. Kırmızı bölgeler son videoda olmayacaktır.
                        </p>

                        {sortedCuts.length === 0 ? (
                            <div className="text-center py-10">
                                <Scissors size={32} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-sm text-gray-400">Henüz kesim yok</p>
                                <p className="text-xs text-gray-300 mt-1">
                                    Başlangıç noktası belirleyip, bitiş noktasında "Kes" butonuna basın.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                                {sortedCuts.map((cut, i) => (
                                    <div
                                        key={cut.id}
                                        onClick={() => jumpToCut(cut)}
                                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all
                                            ${selectedCut === cut.id
                                                ? 'bg-red-50 border-2 border-red-300'
                                                : 'bg-gray-50 border border-gray-100 hover:bg-gray-100'
                                            }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs text-gray-400 font-medium">Kesim {i + 1}</span>
                                            {/* Start time with nudge */}
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); nudgeCutEdge(cut.id, 'start', -0.1); }}
                                                    className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="Başlangıcı 0.1s geri al"
                                                >
                                                    <ChevronLeft size={12} />
                                                </button>
                                                <span className="font-mono text-xs font-semibold text-gray-700 w-12 text-center">
                                                    {fmtTime(cut.start)}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); nudgeCutEdge(cut.id, 'start', 0.1); }}
                                                    className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="Başlangıcı 0.1s ileri al"
                                                >
                                                    <ChevronRight size={12} />
                                                </button>
                                                <span className="text-gray-300 mx-0.5">→</span>
                                                {/* End time with nudge */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); nudgeCutEdge(cut.id, 'end', -0.1); }}
                                                    className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="Bitişi 0.1s geri al"
                                                >
                                                    <ChevronLeft size={12} />
                                                </button>
                                                <span className="font-mono text-xs font-semibold text-gray-700 w-12 text-center">
                                                    {fmtTime(cut.end)}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); nudgeCutEdge(cut.id, 'end', 0.1); }}
                                                    className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="Bitişi 0.1s ileri al"
                                                >
                                                    <ChevronRight size={12} />
                                                </button>
                                            </div>
                                            <span className="text-[10px] text-gray-400">
                                                {(cut.end - cut.start).toFixed(1)}s süre
                                            </span>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeCut(cut.id); }}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Summary */}
                        {sortedCuts.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Toplam kesim</span>
                                    <span className="font-semibold text-gray-800">{sortedCuts.length} bölüm</span>
                                </div>
                                <div className="flex justify-between text-sm mt-1">
                                    <span className="text-gray-500">Çıkarılan süre</span>
                                    <span className="font-mono font-semibold text-red-600">
                                        {cuts.reduce((s, c) => s + (c.end - c.start), 0).toFixed(1)}s
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm mt-1">
                                    <span className="text-gray-500">Kalan süre</span>
                                    <span className="font-mono font-semibold text-green-600">
                                        {(duration - cuts.reduce((s, c) => s + (c.end - c.start), 0)).toFixed(1)}s
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
