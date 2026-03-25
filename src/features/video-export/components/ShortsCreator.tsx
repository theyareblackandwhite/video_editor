import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '../../../app/store';
import { analyzeVideoForShorts } from '../utils/faceTracker';
import type { CropCoordinate } from '../utils/faceTracker';
import type { ShortsClip } from '../../../app/store/types';
import { captureVideoFrame } from '../../../shared/utils/captureFrame';
import { buildFFmpegCommand } from '../utils/ffmpegUtils';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import {
    Loader2, Play, Pause, Sparkles, Settings, Smartphone,
    Upload, X, Film, Plus, Trash2, Edit2, Check, Download,
    RotateCcw
} from 'lucide-react';

export const ShortsCreator: React.FC = () => {
    const { shortsConfig, setShortsConfig } = useAppStore();
    const clips = shortsConfig?.clips || [];

    // Standalone video for Shorts
    const [shortsVideoFile, setShortsVideoFile] = useState<File | null>(null);
    const [shortsVideoUrl, setShortsVideoUrl] = useState<string>('');

    // Local editor state
    const [startTime, setStartTime] = useState(0);
    const [endTime, setEndTime] = useState(60);
    const [enableFaceTracker, setEnableFaceTracker] = useState(true);
    const [editingClipId, setEditingClipId] = useState<string | null>(null);

    const [status, setStatus] = useState<'idle' | 'analyzing' | 'preview'>('idle');
    const [progress, setProgress] = useState(0);
    const [coordinates, setCoordinates] = useState<CropCoordinate[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const [isPlaying, setIsPlaying] = useState(false);
    const [exportingClipId, setExportingClipId] = useState<string | null>(null);
    const [exportProgress, setExportProgress] = useState(0);

    const videoRef = useRef<HTMLVideoElement>(null);
    const cropBoxRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);


    // Cleanup
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
        setShortsConfig({ isActive: true, clips: [] });
        setStatus('idle');
        setCoordinates([]);
        setEditingClipId(null);
    }, [shortsVideoUrl, setShortsConfig]);

    const handleNativeUpload = async () => {
        try {
            // Check if we are in Tauri
            if (!(window as any).__TAURI_INTERNALS__) {
                alert('Bu özellik yalnızca masaüstü uygulamasında çalışır.');
                return;
            }

            const selected = await open({
                multiple: false,
                filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv'] }]
            });

            if (selected && !Array.isArray(selected)) {
                // In Tauri 2.0, selected is the path (string)
                const path = selected;
                // For the preview, we can use convertFileSrc
                const { convertFileSrc } = await import('@tauri-apps/api/core');
                const assetUrl = convertFileSrc(path);

                // Create a dummy File object for local state compatibility
                const file = { name: path.split('/').pop() || 'video.mp4', path } as any;
                
                setShortsVideoFile(file);
                setShortsVideoUrl(assetUrl);
                setStatus('idle');
                setCoordinates([]);
            }
        } catch (err) {
            console.error('File selection failed:', err);
            alert('Dosya seçimi başarısız oldu: ' + err);
        }
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
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
            if (video.currentTime > endTime) {
                video.currentTime = startTime;
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
    }, [startTime, endTime]);

    // Crop box rendering
    useEffect(() => {
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
                    if (enableFaceTracker && coordinates.length > 0) {
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
    }, [enableFaceTracker, coordinates]);

    const runAnalysis = async () => {
        if (!shortsVideoUrl) return;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();
        setStatus('analyzing');
        setProgress(0);
        try {
            const coords = await analyzeVideoForShorts(
                shortsVideoUrl,
                startTime,
                endTime,
                (p) => setProgress(p),
                abortControllerRef.current.signal
            );
            setCoordinates(coords);
            setStatus('preview');
            if (videoRef.current) {
                videoRef.current.currentTime = startTime;
                videoRef.current.play().catch(console.error);
            }
        } catch (err) {
            if (err instanceof Error && err.message === 'Aborted') return;
            console.error('Analysis failed:', err);
            alert('Yüz analizi başarısız oldu: ' + err);
            setStatus('idle');
        }
    };

    const handleExportClip = async (clip: ShortsClip) => {
        if (!shortsVideoUrl) return;

        // Platform Check
        const isTauri = !!(window as any).__TAURI_INTERNALS__;
        if (!isTauri) {
            alert('Dışa aktarım işlemi sadece masaüstü uygulamasında desteklenmektedir.');
            return;
        }

        const videoFiles = useAppStore.getState().videoFiles;
        const layoutMode = useAppStore.getState().layoutMode;
        const transitionType = useAppStore.getState().transitionType;
        const borderRadius = useAppStore.getState().borderRadius;

        const config = {
            format: 'mp4' as const,
            quality: 'high' as const,
            includeAudio: true,
            applyCuts: false,
            normalizeAudio: false,
            layoutMode,
            transitionType,
            borderRadius,
        };

        let cropFile: string | undefined = undefined;

        try {
            const selectedPath = await save({
                filters: [{ name: 'Video', extensions: ['mp4'] }],
                defaultPath: `short_${clip.id.slice(0, 4)}.mp4`
            });

            if (!selectedPath) return;

            setExportingClipId(clip.id);
            setExportProgress(0);

            // Face Tracking analysis if enabled for this specific clip
            if (clip.enableFaceTracker) {
                const coords = await analyzeVideoForShorts(shortsVideoUrl, clip.startTime, clip.endTime, (p) => setExportProgress(p * 0.5));
                if (coords && coords.length > 0) {
                    cropFile = selectedPath + '.crop.txt';
                    const lines = coords.map((c, i) => {
                        const nextTime = i < coords.length - 1 ? coords[i + 1].time : clip.endTime;
                        return `${c.time.toFixed(3)}-${nextTime.toFixed(3)} [enter] crop x ${Math.round(c.x)}, crop y ${Math.round(c.y)}, crop w ${Math.round(c.w)}, crop h ${Math.round(c.h)};`;
                    });
                    await writeTextFile(cropFile, lines.join('\n'));
                }
            }

            const masterVideoId = videoFiles.find(v => v.isMaster)?.id || (videoFiles.length > 0 ? videoFiles[0].id : 'shorts-master');

            // Use system path if available, otherwise fallback to url (which will likely fail FFmpeg if it's a blob)
            const nativePath = (shortsVideoFile as any).path || shortsVideoUrl;
            const dummyMaster: any = { id: masterVideoId, path: nativePath, name: 'shorts.mp4', isMaster: true };

            const args = buildFFmpegCommand(
                config,
                [],
                videoRef.current?.duration || 0,
                [dummyMaster],
                [],
                masterVideoId,
                selectedPath,
                cropFile,
                undefined,
                clip
            );

            // Create command
            const cmd = Command.create('ffmpeg', args);
            
            // Execute with stderr tracking
            cmd.stderr.on('data', (line) => {
                const match = line.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/);
                if (match) {
                    const h = parseInt(match[1], 10);
                    const m = parseInt(match[2], 10);
                    const s = parseFloat(match[3]);
                    const timeInSeconds = h * 3600 + m * 60 + s;
                    const duration = clip.endTime - clip.startTime;
                    const p = Math.max(0.01, Math.min(1, timeInSeconds / duration));
                    setExportProgress(clip.enableFaceTracker ? 0.5 + p * 0.5 : p);
                }
            });

            // Log output for debugging
            cmd.stdout.on('data', line => console.log('FFmpeg stdout:', line));

            const result = await cmd.execute();
            if (result.code !== 0) throw new Error(`FFmpeg failed: ${result.stderr}`);

            alert('Short başarıyla dışa aktarıldı!');
        } catch (err) {
            console.error('Export failed:', err);
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('invoke')) {
                alert('Tauri IPC hatası: Uygulamanın güncel olduğundan ve masaüstü modunda çalıştığından emin olun.');
            } else {
                alert('Dışa aktarım hatası: ' + msg);
            }
        } finally {
            setExportingClipId(null);
            setExportProgress(0);
            if (cropFile) await remove(cropFile).catch(() => { });
        }
    };

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play().catch(console.error);
        } else {
            video.pause();
        }
    };

    const addOrUpdateClip = () => {
        const video = videoRef.current;
        let thumbnail = '';
        if (video) {
            try {
                thumbnail = captureVideoFrame(video);
            } catch (e) {
                console.error("Thumbnail capture failed", e);
            }
        }

        const newClip: ShortsClip = {
            id: editingClipId || crypto.randomUUID(),
            startTime,
            endTime,
            enableFaceTracker,
            thumbnail
        };

        if (editingClipId) {
            setShortsConfig({
                clips: clips.map(c => c.id === editingClipId ? newClip : c)
            });
            setEditingClipId(null);
        } else {
            setShortsConfig({
                clips: [...clips, newClip]
            });
        }
    };

    const deleteClip = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setShortsConfig({
            clips: clips.filter(c => c.id !== id)
        });
        if (editingClipId === id) {
            setEditingClipId(null);
        }
    };

    const editClip = (clip: ShortsClip) => {
        setStartTime(clip.startTime);
        setEndTime(clip.endTime);
        setEnableFaceTracker(clip.enableFaceTracker);
        setEditingClipId(clip.id);
        setStatus('idle');
        setCoordinates([]);
        if (videoRef.current) {
            videoRef.current.currentTime = clip.startTime;
        }
    };

    const removeVideo = () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        if (shortsVideoUrl) URL.revokeObjectURL(shortsVideoUrl);
        setShortsVideoFile(null);
        setShortsVideoUrl('');
        setShortsConfig({ isActive: false, clips: [] });
        setStatus('idle');
        setCoordinates([]);
    };

    if (!shortsVideoFile) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0f0f0f]">
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleNativeUpload}
                    className={`
                        w-full max-w-2xl aspect-video rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-6 transition-all duration-500 group relative overflow-hidden cursor-pointer
                        ${isDragging ? 'border-purple-500 bg-purple-500/10 scale-[1.02]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-purple-500/30'}
                    `}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center group-hover:scale-110 group-hover:bg-purple-500/10 transition-all duration-500">
                        <Upload className="w-10 h-10 text-white/20 group-hover:text-purple-400" />
                    </div>
                    <div className="text-center space-y-2 relative z-10">
                        <h3 className="text-2xl font-semibold text-white/90">Shorts & Reels Oluşturucu</h3>
                        <p className="text-white/40 max-w-sm">Herhangi bir videoyu sosyal medya için dikey (9:16) formata dönüştürün.</p>
                    </div>
                    <div className="px-8 py-3 bg-white text-black rounded-xl font-bold hover:scale-105 transition-transform z-10">
                        Video Seç
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50 text-gray-900 overflow-hidden font-sans">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <Smartphone className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Shorts Creator</h2>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Multi-Clip Management</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={removeVideo}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
                        title="Videoyu Kaldır"
                    >
                        <RotateCcw className="w-5 h-5 text-gray-400 group-hover:text-gray-900 transition-colors" />
                    </button>
                    <button
                        onClick={removeVideo}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
                        title="Kapat"
                    >
                        <X className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 relative">
                <div className="flex-1 flex min-h-0">
                    {/* Video Player Section */}
                    <div className="flex-[2] flex flex-col bg-[#000] border-r border-white/5 relative group">
                        <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
                            <div className="relative group max-h-full max-w-full w-fit h-fit flex items-center justify-center">
                                <video
                                    ref={videoRef}
                                    src={shortsVideoUrl}
                                    className="max-h-full max-w-full rounded-lg shadow-2xl cursor-pointer block"
                                    playsInline
                                    onClick={togglePlay}
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    onEnded={() => setIsPlaying(false)}
                                />

                                {/* Crop Overlay */}
                                <div ref={cropBoxRef} className="absolute border-2 border-purple-500 bg-purple-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none transition-all duration-75" />

                                {/* Centered Play/Pause Button on Hover */}
                                <button
                                    onClick={togglePlay}
                                    className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 scale-90 group-hover:scale-100 transition-transform">
                                        {isPlaying ? <Pause className="w-8 h-8 fill-white" /> : <Play className="w-8 h-8 fill-white ml-1" />}
                                    </div>
                                </button>

                                {/* Analysis Status */}
                                {status === 'analyzing' && (
                                    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 text-gray-900 text-center p-6">
                                        <div className="relative mb-6">
                                            <div className="w-24 h-24 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Smartphone className="w-8 h-8 text-purple-600" />
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-black mb-4 tracking-tight uppercase">Yapay Zeka Analiz Ediyor</h3>
                                        <div className="w-72 bg-gray-100 rounded-full h-3 overflow-hidden mb-3">
                                            <div className="bg-gradient-to-r from-purple-600 to-pink-600 h-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
                                        </div>
                                        <span className="text-purple-600 font-mono text-xl font-black">{Math.round(progress * 100)}%</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Settings Panel */}
                    <div className="w-80 flex flex-col bg-white border-l border-gray-200 overflow-y-auto custom-scrollbar">
                        <div className="p-6 space-y-8">
                            {/* Time Selection */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-widest">
                                    <Settings className="w-3.5 h-3.5" />
                                    <span>Klip Ayarları</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Başlangıç</p>
                                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center justify-between group hover:border-gray-200 transition-colors">
                                            <input
                                                type="number"
                                                min={0}
                                                step={0.1}
                                                value={startTime}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setStartTime(val);
                                                    if (videoRef.current) videoRef.current.currentTime = val;
                                                }}
                                                className="bg-transparent border-none text-gray-900 focus:outline-none w-16 font-mono font-bold"
                                            />
                                            <button onClick={() => { if (videoRef.current) setStartTime(videoRef.current.currentTime); }} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-900 transition-all">
                                                <Check className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Bitiş</p>
                                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center justify-between group hover:border-gray-200 transition-colors">
                                            <input
                                                type="number"
                                                max={videoRef.current?.duration || 100}
                                                step={0.1}
                                                value={endTime}
                                                onChange={(e) => setEndTime(parseFloat(e.target.value))}
                                                className="bg-transparent border-none text-gray-900 focus:outline-none w-16 font-mono font-bold"
                                            />
                                            <button onClick={() => { if (videoRef.current) setEndTime(videoRef.current.currentTime); }} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-900 transition-all">
                                                <Check className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Face Tracker Toggle */}
                            <section className="space-y-4">
                                <div className="p-4 bg-purple-500/5 rounded-2xl border border-purple-500/10 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-400 text-[10px] font-bold uppercase tracking-widest">
                                            <Sparkles className="w-3.5 h-3.5" />
                                            <span>AI Yüz Takibi</span>
                                        </div>
                                        <button
                                            onClick={() => setEnableFaceTracker(!enableFaceTracker)}
                                            className={`w-10 h-5 rounded-full p-1 transition-all duration-300 ${enableFaceTracker ? 'bg-purple-600' : 'bg-white/10'}`}
                                        >
                                            <div className={`w-3 h-3 bg-white rounded-full transition-transform duration-300 ${enableFaceTracker ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                                        Konuşmacıyı otomatik olarak algılar ve dikey kadrajda ortalar.
                                    </p>
                                    {enableFaceTracker && (
                                        <button
                                            onClick={runAnalysis}
                                            disabled={status === 'analyzing'}
                                            className="w-full py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                                        >
                                            {status === 'analyzing' ? 'Analiz Ediliyor...' : 'Yüz Analizini Başlat'}
                                        </button>
                                    )}
                                </div>
                            </section>

                            {/* Add Button */}
                            <div className="pt-4">
                                <button
                                    onClick={addOrUpdateClip}
                                    className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-3 hover:bg-gray-800 active:scale-[0.98] transition-all overflow-hidden relative group"
                                >
                                    <span>
                                        {editingClipId ? 'Değişiklikleri Kaydet' : 'Shorts Olarak Ekle'}
                                    </span>
                                    {editingClipId ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                </button>
                                {editingClipId && (
                                    <button
                                        onClick={() => setEditingClipId(null)}
                                        className="w-full mt-3 py-3 text-gray-400 hover:text-gray-900 text-[10px] font-bold uppercase tracking-wider transition-colors"
                                    >
                                        Düzenlemeyi İptal Et
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Clips Gallery Footer */}
                <div className="h-64 bg-white border-t border-gray-200 p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Film className="w-4 h-4 text-purple-600" />
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">Klipler ({clips.length})</h3>
                        </div>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar flex-1 min-h-0">
                        {clips.map((clip) => (
                            <div
                                key={clip.id}
                                onClick={() => editClip(clip)}
                                className={`relative h-full aspect-[9/16] rounded-xl overflow-hidden cursor-pointer group flex-shrink-0 border-2 transition-all duration-300 ${editingClipId === clip.id ? 'border-purple-500 scale-105 z-10 shadow-2xl shadow-purple-500/20' : 'border-white/5 hover:border-white/20'}`}
                            >
                                {/* Thumbnail */}
                                {clip.thumbnail ? (
                                    <img src={clip.thumbnail} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                ) : (
                                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                        <Film className="w-6 h-6 text-gray-300" />
                                    </div>
                                )}

                                {/* Action HUD */}
                                <div className="absolute inset-0 bg-gradient-to-t from-gray-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <div
                                            className="flex-1 py-1.5 bg-white/90 hover:bg-white rounded-md flex items-center justify-center shadow-sm"
                                            title="Düzenlemek İçin Tıkla"
                                        >
                                            <Edit2 size={12} className="text-gray-900" />
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteClip(clip.id, e); }}
                                            className="py-1.5 px-2 bg-red-500/20 hover:bg-red-500/40 rounded-md text-red-500"
                                            title="Sil"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleExportClip(clip); }}
                                        disabled={exportingClipId !== null}
                                        className="w-full py-2 bg-purple-600 hover:bg-purple-500 rounded-md text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-purple-900/40"
                                    >
                                        {exportingClipId === clip.id ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin" />
                                                {Math.round(exportProgress * 100)}%
                                            </>
                                        ) : (
                                            <>
                                                <Download size={12} />
                                                İndir
                                            </>
                                        )}
                                    </button>
                                </div>

                                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-mono text-white/80">
                                    {clip.startTime.toFixed(1)}s - {clip.endTime.toFixed(1)}s
                                </div>
                            </div>
                        ))}

                        {/* Add New Clip Card */}
                        {!editingClipId && (
                            <button
                                onClick={() => {
                                    setEditingClipId(null);
                                    setStartTime(videoRef.current?.currentTime || 0);
                                    setEndTime(Math.min(videoRef.current?.duration || 100, (videoRef.current?.currentTime || 0) + 15));
                                }}
                                className="h-full aspect-[9/16] rounded-xl border-2 border-dashed border-white/10 hover:border-white/30 hover:bg-white/[0.02] transition-all flex flex-col items-center justify-center gap-3 text-white/20 hover:text-white/40 group flex-shrink-0"
                            >
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Plus className="w-6 h-6" />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Yeni Klip</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
