import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '../../../app/store';
import { analyzeVideoForShorts } from '../utils/faceTracker';
import type { CropCoordinate } from '../utils/faceTracker';
import { Loader2, Play, Pause, Sparkles, Settings, Smartphone, Upload, X, Film } from 'lucide-react';

export const ShortsCreator: React.FC = () => {
    const { shortsConfig, setShortsConfig } = useAppStore();
    const config = shortsConfig || { isActive: false, startTime: 0, endTime: 60, enableFaceTracker: true };

    // Standalone video for Shorts (independent from main project)
    const [shortsVideoFile, setShortsVideoFile] = useState<File | null>(null);
    const [shortsVideoUrl, setShortsVideoUrl] = useState<string>('');

    const [status, setStatus] = useState<'idle' | 'analyzing' | 'preview'>('idle');
    const [progress, setProgress] = useState(0);
    const [coordinates, setCoordinates] = useState<CropCoordinate[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const [isPlaying, setIsPlaying] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const cropBoxRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cleanup blob URL on unmount or when file changes
    useEffect(() => {
        return () => {
            if (shortsVideoUrl) URL.revokeObjectURL(shortsVideoUrl);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, []);

    const loadVideoFile = useCallback((file: File) => {
        if (!file.type.startsWith('video/')) return;
        if (shortsVideoUrl) URL.revokeObjectURL(shortsVideoUrl);
        const url = URL.createObjectURL(file);
        setShortsVideoFile(file);
        setShortsVideoUrl(url);
        setShortsConfig({ isActive: false, startTime: 0, endTime: 60, enableFaceTracker: config.enableFaceTracker });
        setStatus('idle');
        setCoordinates([]);
    }, [shortsVideoUrl, config.enableFaceTracker, setShortsConfig]);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) loadVideoFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) loadVideoFile(file);
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleTimeUpdate = () => {
            if (video.currentTime > config.endTime) {
                video.currentTime = config.startTime;
            }
        };
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('timeupdate', handleTimeUpdate);
        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, [config.startTime, config.endTime]);

    // Crop box rendering
    useEffect(() => {
        if (!config.isActive) return;
        const updateCropBox = () => {
            const video = videoRef.current;
            const box = cropBoxRef.current;
            if (video && box) {
                const displayW = video.clientWidth;
                const displayH = video.clientHeight;
                const videoW = video.videoWidth;
                const videoH = video.videoHeight;
                if (videoW && videoH) {
                    const scale = Math.min(displayW / videoW, displayH / videoH);
                    const drawW = videoW * scale;
                    const drawH = videoH * scale;
                    const offsetX = (displayW - drawW) / 2;
                    const offsetY = (displayH - drawH) / 2;
                    const time = video.currentTime;
                    let targetCrop = { x: 0, y: 0, w: Math.round((videoH * 9) / 16), h: videoH };
                    if (config.enableFaceTracker && coordinates.length > 0) {
                        let closest = coordinates[0];
                        let minDiff = Infinity;
                        for (const c of coordinates) {
                            const diff = Math.abs(c.time - time);
                            if (diff < minDiff) { minDiff = diff; closest = c; }
                        }
                        targetCrop = closest;
                    } else {
                        if (targetCrop.w > videoW) {
                            targetCrop.w = videoW;
                            targetCrop.h = Math.round((videoW * 16) / 9);
                        }
                        targetCrop.x = (videoW - targetCrop.w) / 2;
                        targetCrop.y = (videoH - targetCrop.h) / 2;
                    }
                    box.style.width = `${targetCrop.w * scale}px`;
                    box.style.height = `${targetCrop.h * scale}px`;
                    box.style.left = `${offsetX + targetCrop.x * scale}px`;
                    box.style.top = `${offsetY + targetCrop.y * scale}px`;
                }
            }
            rafRef.current = requestAnimationFrame(updateCropBox);
        };
        rafRef.current = requestAnimationFrame(updateCropBox);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [config.isActive, config.enableFaceTracker, coordinates]);

    const runAnalysis = async () => {
        if (!shortsVideoUrl) return;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();
        setStatus('analyzing');
        setProgress(0);
        try {
            const coords = await analyzeVideoForShorts(
                shortsVideoUrl,
                config.startTime,
                config.endTime,
                (p) => setProgress(p),
                abortControllerRef.current.signal
            );
            setCoordinates(coords);
            setStatus('preview');
            if (videoRef.current) {
                videoRef.current.currentTime = config.startTime;
                videoRef.current.play().catch(console.error);
            }
        } catch (err) {
            if (err instanceof Error && err.message === 'Aborted') return;
            console.error('Analysis failed:', err);
            alert('Yüz analizi başarısız oldu: ' + err);
            setStatus('idle');
        }
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) videoRef.current.pause();
        else videoRef.current.play();
    };

    const removeVideo = () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        if (shortsVideoUrl) URL.revokeObjectURL(shortsVideoUrl);
        setShortsVideoFile(null);
        setShortsVideoUrl('');
        setShortsConfig({ isActive: false });
        setStatus('idle');
        setCoordinates([]);
    };

    // ─── Upload screen ───────────────────────────────────────────────────────────
    if (!shortsVideoFile) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center">
                <div className="w-24 h-24 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-6">
                    <Smartphone size={48} />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-3 text-center">Shorts & Reels Oluşturucu</h2>
                <p className="text-gray-500 text-base mb-10 max-w-xl text-center">
                    Herhangi bir videoyu yükleyin ve sosyal medya için dikey (9:16) formata dönüştürün. Yapay zeka destekli yüz takibi ile konuşmacı her zaman merkezde kalır.
                </p>

                {/* Drop zone */}
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                        w-full max-w-xl border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all
                        ${isDragging
                            ? 'border-indigo-500 bg-indigo-50 scale-[1.02]'
                            : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50'
                        }
                    `}
                >
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${isDragging ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                        <Upload size={32} />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold text-gray-700 text-lg">Video dosyasını sürükleyin veya seçin</p>
                        <p className="text-gray-400 text-sm mt-1">MP4, MOV, AVI, MKV desteklenir</p>
                    </div>
                    <div className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all text-sm">
                        Dosya Seç
                    </div>
                </div>
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileInput} />
            </div>
        );
    }

    // ─── Activate Shorts screen ──────────────────────────────────────────────────
    if (!config.isActive) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center text-center">
                {/* Video preview card */}
                <div className="w-full max-w-xl bg-gray-900 rounded-2xl overflow-hidden mb-8 shadow-xl relative group">
                    <video
                        src={shortsVideoUrl}
                        className="w-full max-h-64 object-contain"
                        controls
                        playsInline
                    />
                    <button
                        onClick={removeVideo}
                        className="absolute top-3 right-3 bg-black/60 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                        title="Videoyu kaldır"
                    >
                        <X size={16} />
                    </button>
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md">
                        <Film size={12} />
                        <span className="truncate max-w-[200px]">{shortsVideoFile.name}</span>
                    </div>
                </div>

                <div className="w-24 h-24 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-6">
                    <Smartphone size={48} />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Shorts Formatını Aktifleştir</h2>
                <p className="text-gray-500 text-lg mb-8 max-w-xl">
                    Videonuzu sosyal medya için dikey (9:16) formata dönüştürün. Yapay zeka destekli yüz takibi ile konuşmacı her zaman merkezde kalsın.
                </p>
                <button
                    onClick={() => setShortsConfig({ isActive: true })}
                    className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:scale-105 transition-all"
                >
                    Shorts Formatını Aktifleştir
                </button>
                <button
                    onClick={removeVideo}
                    className="mt-6 text-gray-400 hover:text-gray-600 font-medium"
                >
                    Farklı video seç
                </button>
            </div>
        );
    }

    // ─── Main editor ─────────────────────────────────────────────────────────────
    return (
        <div className="max-w-7xl mx-auto px-4 h-full flex flex-col xl:flex-row gap-6">

            {/* Left side: Preview */}
            <div className="flex-1 flex flex-col min-h-[400px] xl:min-h-0 bg-black rounded-2xl overflow-hidden relative group shadow-lg">
                <video
                    ref={videoRef}
                    src={shortsVideoUrl}
                    className="absolute inset-0 w-full h-full object-contain"
                    playsInline
                    onClick={togglePlay}
                    onLoadedMetadata={(e) => {
                        const duration = e.currentTarget.duration;
                        if (config.endTime > duration) {
                            setShortsConfig({ endTime: duration });
                        }
                        e.currentTarget.currentTime = config.startTime;
                    }}
                />

                {/* Crop overlay */}
                <div
                    ref={cropBoxRef}
                    className="absolute border-4 border-indigo-500 bg-indigo-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none transition-all duration-75"
                />

                {status === 'analyzing' && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10 text-white">
                        <Loader2 size={48} className="animate-spin mb-4 text-indigo-400" />
                        <h3 className="text-lg font-bold mb-2">Video Analiz Ediliyor...</h3>
                        <div className="w-64 bg-gray-700 rounded-full h-2 overflow-hidden mb-2">
                            <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
                        </div>
                        <span className="text-sm">{Math.round(progress * 100)}%</span>
                    </div>
                )}

                <button
                    onClick={togglePlay}
                    className="absolute bottom-4 left-4 bg-black/60 text-white p-3 rounded-full hover:bg-black/80 transition-colors backdrop-blur-md z-20"
                >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button
                    onClick={() => { if (videoRef.current) videoRef.current.currentTime = config.startTime; }}
                    className="absolute bottom-4 left-16 bg-black/60 text-white px-3 py-2 rounded-lg text-sm hover:bg-black/80 transition-colors backdrop-blur-md z-20"
                >
                    Başa Dön
                </button>

                {/* File info */}
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md z-20">
                    <Film size={12} />
                    <span className="truncate max-w-[180px]">{shortsVideoFile.name}</span>
                </div>
                <button
                    onClick={removeVideo}
                    className="absolute top-3 right-3 bg-black/60 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors z-20"
                    title="Farklı video seç"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Right side: Controls */}
            <div className="w-full xl:w-96 flex flex-col gap-6 shrink-0">
                <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 flex flex-col gap-6">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            <Smartphone size={20} className="text-indigo-600" /> Shorts Ayarları
                        </h3>
                        <button
                            onClick={() => {
                                if (abortControllerRef.current) abortControllerRef.current.abort();
                                setShortsConfig({ isActive: false });
                                setStatus('idle');
                            }}
                            className="text-sm text-red-500 hover:text-red-700 font-medium"
                        >
                            Kapat
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Başlangıç Zamanı (sn)</label>
                            <input
                                type="number"
                                min={0}
                                max={config.endTime}
                                step={1}
                                value={Math.round(config.startTime)}
                                onChange={e => {
                                    const val = Number(e.target.value);
                                    setShortsConfig({ startTime: val });
                                    if (videoRef.current) videoRef.current.currentTime = val;
                                }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Bitiş Zamanı (sn)</label>
                            <input
                                type="number"
                                min={config.startTime + 1}
                                step={1}
                                value={Math.round(config.endTime)}
                                onChange={e => setShortsConfig({ endTime: Number(e.target.value) })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            />
                            <p className="text-xs text-gray-400 mt-1">Süre: {Math.round(config.endTime - config.startTime)} saniye (Max 60sn önerilir)</p>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors border-l-2 border-indigo-500">
                            <div className="flex items-center gap-3">
                                <Sparkles size={16} className="text-indigo-600" />
                                <div>
                                    <span className="text-sm font-medium text-gray-800">Yapay Zeka ile Yüz Takibi</span>
                                    <span className="text-xs text-gray-400 block">Konuşmacıyı otomatik takip et</span>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={config.enableFaceTracker}
                                onChange={e => setShortsConfig({ enableFaceTracker: e.target.checked })}
                                className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                        </label>
                    </div>

                    {config.enableFaceTracker && (
                        <button
                            onClick={runAnalysis}
                            disabled={status === 'analyzing'}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {status === 'analyzing' ? <Loader2 className="animate-spin" /> : <Settings size={18} />}
                            {status === 'analyzing' ? 'Analiz Ediliyor...' : 'Yüz Analizini Başlat (Önizle)'}
                        </button>
                    )}
                </div>

                <div className="flex-1" />

                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800 mb-4">
                    Belirlediğiniz zaman aralığı (<strong>{Math.round(config.startTime)}sn - {Math.round(config.endTime)}sn</strong>) sadece Shorts dışa aktarımı için geçerli olacaktır.
                </div>
            </div>
        </div>
    );
};
