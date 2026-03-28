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
import { decodeToMono } from '../../../shared/utils/audio';
import { exportVideoWeb } from '../utils/ffmpegWeb';

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
    const [enableCaptions, setEnableCaptions] = useState(false);
    const [editingClipId, setEditingClipId] = useState<string | null>(null);

    const [status, setStatus] = useState<'idle' | 'analyzing' | 'preview'>('idle');
    const [progress, setProgress] = useState(0);
    const [coordinates, setCoordinates] = useState<CropCoordinate[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const [isPlaying, setIsPlaying] = useState(false);
    const [exportingClipId, setExportingClipId] = useState<string | null>(null);
    const [exportProgress, setExportProgress] = useState(0);

    const [captionChunks, setCaptionChunks] = useState<any[]>([]);
    const [captionStatus, setCaptionStatus] = useState<'idle' | 'generating' | 'done'>('idle');
    const [captionProgress, setCaptionProgress] = useState(0);
    const [captionFileName, setCaptionFileName] = useState('');
    const [currentCropWidth, setCurrentCropWidth] = useState<number>(320);
    const [currentCropLeft, setCurrentCropLeft] = useState<number>(0);

    const videoRef = useRef<HTMLVideoElement>(null);
    const cropBoxRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
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

    const handleUploadClick = () => {
        if ((window as any).__TAURI_INTERNALS__) {
            handleNativeUpload();
        } else {
            fileInputRef.current?.click();
        }
    };

    const handleNativeUpload = async () => {
        try {
            // Check if we are in Tauri
            if (!(window as any).__TAURI_INTERNALS__) {
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
                const rawName = path ? path.match(/[^\\\\/]+$/)?.[0] : undefined;
                const file = { name: rawName || 'video.mp4', path } as any;

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
                    const cropW = targetCrop.w * scale;
                    const cropH = targetCrop.h * scale;
                    const left = offsetX + targetCrop.x * scale;
                    const top = offsetY + targetCrop.y * scale;
                    
                    box.style.width = `${cropW}px`;
                    box.style.height = `${cropH}px`;
                    box.style.left = `${left}px`;
                    box.style.top = `${top}px`;
                    
                    if (Math.abs(currentCropWidth - cropW) > 1) {
                        setCurrentCropWidth(cropW);
                    }
                    if (Math.abs(currentCropLeft - left) > 1) {
                        setCurrentCropLeft(left);
                    }
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
            setEnableFaceTracker(true);
            setStatus('preview');
            if (videoRef.current) {
                videoRef.current.currentTime = startTime;
                videoRef.current.play().catch(console.error);
            }
        } catch (err) {
            if (err instanceof Error && err.message === 'Aborted') return;
            console.error('Analysis failed:', err);
            alert('Yüz analizi başarısız oldu: ' + err);
            setEnableFaceTracker(false);
            setStatus('idle');
        }
    };

    const generateCaptionPreview = async () => {
        if (!shortsVideoUrl) return;
        setCaptionStatus('generating');

        try {
            const nativePath = (shortsVideoFile as any).path || shortsVideoUrl;

            // Extract audio as float32 mono for Whisper (16kHz)
            // Only extract the selected segment to speed up transcription
            const float32Data = await decodeToMono(nativePath, 16000, endTime - startTime, startTime);

            const worker = new Worker(new URL('../utils/transcriber.ts', import.meta.url), { type: 'module' });
            worker.onerror = (e) => console.error('[Caption] Worker error:', e.message, e);

            await new Promise<void>((resolve, reject) => {
                worker.onmessage = async (e) => {
                    if (e.data.status === 'loading_model') {
                        // Keep loading within 0-40% range
                        const loadProgress = (e.data.progress || 0) * 0.4;
                        setCaptionProgress(loadProgress);
                        setCaptionFileName(`Yapay Zeka Hazırlanıyor: ${e.data.file || 'Model'}`);
                    } else if (e.data.status === 'ready') {
                        // Jump to 45% when ready
                        setCaptionProgress(45);
                        setCaptionFileName('Ses dalgaları analiz ediliyor...');
                        worker.postMessage({ type: 'transcribe', audioData: float32Data });
                    } else if (e.data.status === 'processing') {
                        setCaptionProgress(55);
                        setCaptionFileName('Konuşmalar tanımlanıyor...');
                        // Smoothly increment to make it feel alive
                        const interval = setInterval(() => {
                            setCaptionProgress(prev => {
                                if (prev >= 98) {
                                    clearInterval(interval);
                                    return 98;
                                }
                                return prev + (Math.random() * 2);
                            });
                        }, 800);
                        (worker as any)._interval = interval;
                    } else if (e.data.status === 'done') {
                        if ((worker as any)._interval) clearInterval((worker as any)._interval);
                        setCaptionFileName('Altyazılar yerleştiriliyor...');
                        setCaptionProgress(100);
                        setCaptionChunks(e.data.chunks || []);
                        setTimeout(() => {
                            worker.terminate();
                            resolve();
                        }, 500);
                    } else if (e.data.status === 'error') {
                        if ((worker as any)._interval) clearInterval((worker as any)._interval);
                        console.error('[Caption] Worker error:', e.data.error);
                        worker.terminate();
                        reject(new Error(e.data.error));
                    }
                };
                worker.postMessage({ type: 'init' });
            });

            setCaptionStatus('done');
            setEnableCaptions(true);
            if (videoRef.current) {
                videoRef.current.currentTime = startTime;
                videoRef.current.play().catch(console.error);
            }
        } catch (err) {
            console.error('[Caption] Error:', err);
            alert("Altyazı oluşturulamadı: " + err);
            setEnableCaptions(false);
            setCaptionStatus('idle');
        }
    };


    const handleExportClip = async (clip: ShortsClip) => {
        if (!shortsVideoUrl) return;

        const isTauri = !!(window as any).__TAURI_INTERNALS__;
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

        setExportingClipId(clip.id);
        setExportProgress(0);

        try {
            let selectedPath: string | undefined = undefined;
            if (isTauri) {
                const result = await save({
                    filters: [{ name: 'Video', extensions: ['mp4'] }],
                    defaultPath: `short_${clip.id.slice(0, 4)}.mp4`
                });
                if (!result) {
                    setExportingClipId(null);
                    return;
                }
                selectedPath = result;
            }

            // 1. Prepare Sidecar Data (Crop & Subtitles)
            let cropFileContent: string | undefined = undefined;
            let subtitleFileContent: string | undefined = undefined;
            let cropFilePath: string | undefined = undefined;
            let subtitleFilePath: string | undefined = undefined;

            // Face Tracking analysis if enabled
            if (clip.enableFaceTracker) {
                const coords = await analyzeVideoForShorts(shortsVideoUrl, clip.startTime, clip.endTime, (p) => setExportProgress(p * 0.3));
                if (coords && coords.length > 0) {
                    const cropLines: string[] = [];
                    coords.forEach((c, i) => {
                        const nextTime = i < coords.length - 1 ? coords[i + 1].time : clip.endTime;
                        // Adjust times to be relative to the clip start for input-seeking (-ss)
                        const relStart = Math.max(0, c.time - clip.startTime);
                        const relEnd = Math.max(0, nextTime - clip.startTime);

                        // Only include if it's a valid interval within the clip range
                        if (relEnd <= relStart) return;

                        const timeRange = `${relStart.toFixed(3)}-${relEnd.toFixed(3)}`;
                        // Format: [START-END] [FLAGS] TARGET COMMAND ARG;
                        // Each line is a separate command entry for FFmpeg parser to be happy
                        cropLines.push(`${timeRange} [enter] crop x ${Math.floor(c.x)};`);
                        cropLines.push(`${timeRange} [enter] crop y ${Math.floor(c.y)};`);
                        cropLines.push(`${timeRange} [enter] crop w ${Math.floor(c.w / 2) * 2};`);
                        cropLines.push(`${timeRange} [enter] crop h ${Math.floor(c.h / 2) * 2};`);
                    });
                    cropFileContent = cropLines.join('\n');
                    
                    if (isTauri && selectedPath) {
                        cropFilePath = selectedPath + '.crop.txt';
                        await writeTextFile(cropFilePath, cropFileContent);
                    }
                }
            }

            // Transcription if enabled
            if (clip.enableCaptions) {
                const nativePath = (shortsVideoFile as any).path || shortsVideoUrl;
                
                // For transcription, we always use the web-optimized worker path
                const float32Data = await decodeToMono(nativePath, 16000, clip.endTime - clip.startTime, clip.startTime);
                const worker = new Worker(new URL('../utils/transcriber.ts', import.meta.url), { type: 'module' });
                
                subtitleFileContent = await new Promise<string>((resolve, reject) => {
                    worker.onmessage = (e) => {
                        if (e.data.status === 'ready') {
                            worker.postMessage({ type: 'transcribe', audioData: float32Data });
                        } else if (e.data.status === 'done') {
                            worker.terminate();
                            resolve(e.data.assContent);
                        } else if (e.data.status === 'error') {
                            worker.terminate();
                            reject(new Error(e.data.error));
                        }
                    };
                    worker.postMessage({ type: 'init' });
                });

                if (isTauri && selectedPath && subtitleFileContent) {
                    subtitleFilePath = selectedPath + '.ass';
                    await writeTextFile(subtitleFilePath, subtitleFileContent);
                }
            }

            const masterVideoId = videoFiles.find(v => v.isMaster)?.id || (videoFiles.length > 0 ? videoFiles[0].id : 'shorts-master');
            const nativePath = (shortsVideoFile as any).path || shortsVideoUrl;
            const dummyMaster: any = { 
                id: masterVideoId, 
                path: nativePath, 
                name: shortsVideoFile?.name || 'shorts.mp4', 
                type: shortsVideoFile?.type || 'video/mp4', 
                isMaster: true,
                file: shortsVideoFile
            };

            if (isTauri && selectedPath) {
                // TAURI PATH: Use native Command
                if (nativePath.startsWith('blob:')) {
                    throw new Error('Lütfen Shorts videonuzu "Video Seç" butonuna tıklayarak tekrar yükleyin.');
                }

                const args = buildFFmpegCommand(
                    config, [], videoRef.current?.duration || 0, [dummyMaster], [],
                    masterVideoId, selectedPath, cropFilePath, undefined, clip, subtitleFilePath
                );

                const cmd = Command.create('ffmpeg', args);
                cmd.stderr.on('data', (line) => {
                    const match = line.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/);
                    if (match) {
                        const h = parseInt(match[1], 10), m = parseInt(match[2], 10), s = parseFloat(match[3]);
                        const timeInSeconds = h * 3600 + m * 60 + s;
                        const duration = clip.endTime - clip.startTime;
                        const p = Math.max(0.01, Math.min(1, timeInSeconds / duration));
                        setExportProgress(0.3 + p * 0.7);
                    }
                });

                const result = await cmd.execute();
                if (result.code !== 0) throw new Error(`FFmpeg failed: ${result.stderr}`);
                
                // Cleanup Tauri sidecars
                if (cropFilePath) await remove(cropFilePath).catch(() => { });
                if (subtitleFilePath) await remove(subtitleFilePath).catch(() => { });

            } else {
                // WEB PATH: Use FFmpeg.wasm
                const resultData = await exportVideoWeb(
                    config,
                    dummyMaster,
                    [dummyMaster],
                    [],
                    [],
                    videoRef.current?.duration || 0,
                    (p) => setExportProgress(0.3 + p * 0.7),
                    (log) => console.log('[Shorts-Web-FFmpeg]', log),
                    undefined,
                    clip,
                    cropFileContent,
                    subtitleFileContent
                );
                
                if (cropFileContent) {
                    console.log('[Shorts-Export] Generated crop.txt:\n', cropFileContent);
                }

                // Browser Download
                // Ensure we have a regular ArrayBuffer (SharedArrayBuffer can't always be used in Blob directly)
                const finalBuffer = (resultData.buffer instanceof SharedArrayBuffer)
                    ? new Uint8Array(resultData)
                    : resultData;
                    
                const blob = new Blob([finalBuffer as any], { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `short_${clip.id.slice(0, 4)}.mp4`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            alert('Short başarıyla dışa aktarıldı!');
        } catch (err) {
            console.error('Export failed:', err);
            alert('Dışa aktarım hatası: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setExportingClipId(null);
            setExportProgress(0);
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
            enableCaptions,
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
        setEnableCaptions(clip.enableCaptions || false);
        setEditingClipId(clip.id);
        setStatus(clip.enableFaceTracker ? 'preview' : 'idle');
        setCaptionStatus(clip.enableCaptions ? 'done' : 'idle');
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
        setCaptionChunks([]);
        setCaptionStatus('idle');
    };

    if (!shortsVideoFile) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0f0f0f]">
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleUploadClick}
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
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) loadVideoFile(file);
                    }}
                    accept="video/*"
                    className="hidden"
                />
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
                                    className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity z-30"
                                >
                                    <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 scale-90 group-hover:scale-100 transition-transform">
                                        {isPlaying ? <Pause className="w-8 h-8 fill-white" /> : <Play className="w-8 h-8 fill-white ml-1" />}
                                    </div>
                                </button>

                                {/* Caption Overlay — perfectly synced with crop box position */}
                                {enableCaptions && captionChunks.length > 0 && (
                                    <div 
                                        className="absolute pointer-events-none flex flex-col items-center z-20 pb-12"
                                        style={{
                                            left: `${currentCropLeft}px`,
                                            width: `${currentCropWidth}px`,
                                            bottom: 0
                                        }}
                                    >
                                        <CaptionRenderer chunks={captionChunks} videoRef={videoRef} startTime={startTime} maxWidth={currentCropWidth} />
                                    </div>
                                )}

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

                            {/* Face Tracker Section */}
                            <section className="space-y-4">
                                <div className="p-4 bg-purple-500/5 rounded-2xl border border-purple-500/10 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-400 text-[10px] font-bold uppercase tracking-widest">
                                            <Sparkles className="w-3.5 h-3.5" />
                                            <span>AI Yüz Takibi</span>
                                        </div>
                                        {enableFaceTracker && status === 'preview' && (
                                            <button 
                                                onClick={() => {
                                                    setEnableFaceTracker(false);
                                                    setStatus('idle');
                                                    setCoordinates([]);
                                                }}
                                                className="p-1 hover:bg-purple-500/20 rounded-lg text-purple-400 transition-colors"
                                                title="Kaldır"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                                        Konuşmacıyı otomatik olarak algılar ve dikey kadrajda ortalar.
                                    </p>
                                    <button
                                        onClick={runAnalysis}
                                        disabled={status === 'analyzing'}
                                        className={`w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 relative overflow-hidden ${
                                            status === 'preview' 
                                            ? 'bg-purple-600 text-white' 
                                            : 'bg-purple-600/20 hover:bg-purple-600/40 text-purple-400'
                                        }`}
                                    >
                                        {status === 'analyzing' && (
                                            <div 
                                                className="absolute inset-y-0 left-0 bg-purple-500/20 transition-all duration-300 pointer-events-none"
                                                style={{ width: `${progress * 100}%` }}
                                            />
                                        )}
                                        <span className="relative z-10 flex items-center gap-2">
                                            {status === 'analyzing' ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Analiz Ediliyor %{Math.round(progress * 100)}
                                                </>
                                            ) : status === 'preview' ? (
                                                <>
                                                    <Check className="w-3 h-3" />
                                                    Analiz Tamamlandı
                                                </>
                                            ) : (
                                                'Yüz Analizini Başlat'
                                            )}
                                        </span>
                                    </button>
                                </div>
                            </section>

                            {/* Auto Captions Section */}
                            <section className="space-y-4 pt-1">
                                <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-bold uppercase tracking-widest">
                                            <span className="font-serif font-black text-sm leading-none bg-indigo-500 text-white rounded px-1.5 py-0.5">CC</span>
                                            <span>Oto-Altyazı (AI)</span>
                                        </div>
                                        {enableCaptions && captionStatus === 'done' && (
                                            <button
                                                onClick={() => {
                                                    setEnableCaptions(false);
                                                    setCaptionStatus('idle');
                                                    setCaptionChunks([]);
                                                }}
                                                className="p-1 hover:bg-indigo-500/20 rounded-lg text-indigo-400 transition-colors"
                                                title="Kaldır"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                                        Videonuzdaki konuşmaları metne dönüştürür ve dinamik (Hormozi stili) altyazı ekler. Whisper AI modeliyle yerel olarak çalışır.
                                    </p>
                                    <div className="space-y-3">
                                        <button
                                            onClick={generateCaptionPreview}
                                            disabled={captionStatus === 'generating'}
                                            className={`w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 relative overflow-hidden ${
                                                captionStatus === 'done'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400'
                                            }`}
                                        >
                                            {captionStatus === 'generating' && (
                                                <div 
                                                    className="absolute inset-y-0 left-0 bg-indigo-500/20 transition-all duration-300 pointer-events-none"
                                                    style={{ width: `${captionProgress}%` }}
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-2 truncate px-2">
                                                {captionStatus === 'generating' ? (
                                                    <>
                                                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                                        <span className="truncate">{captionFileName || 'Altyazılar'}</span>
                                                        <span className="shrink-0">%{Math.round(captionProgress)}</span>
                                                    </>
                                                ) : captionStatus === 'done' ? (
                                                    <>
                                                        <Check className="w-3 h-3 shrink-0" />
                                                        Altyazılar Hazır
                                                    </>
                                                ) : (
                                                    'Altyazıları Oluştur'
                                                )}
                                            </span>
                                        </button>
                                    </div>
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

// Real-Time Preview Caption Renderer
const CaptionRenderer: React.FC<{ chunks: any[], videoRef: React.RefObject<HTMLVideoElement | null>, startTime: number, maxWidth?: number }> = ({ chunks, videoRef, startTime, maxWidth = 320 }) => {
    const [currentLine, setCurrentLine] = useState<{ word: string, isHighlight: boolean }[]>([]);

    useEffect(() => {
        const lines: { start: number, end: number, words: { text: string, start: number, end: number }[] }[] = [];
        let curLine: any[] = [];

        let lastEnd = startTime;

        for (const c of chunks) {
            // Provide fallback timestamps if still null, spacing them slightly
            if (c.timestamp[0] === null) c.timestamp[0] = lastEnd - startTime;
            if (c.timestamp[1] === null) c.timestamp[1] = c.timestamp[0] + 0.5;
            lastEnd = c.timestamp[1] + startTime;

            if (curLine.length >= 4) {
                const s = curLine[0].timestamp[0] !== null ? curLine[0].timestamp[0] + startTime : startTime;
                const e = curLine[curLine.length - 1].timestamp[1] !== null ? curLine[curLine.length - 1].timestamp[1] + startTime : startTime + 2;
                lines.push({
                    start: s,
                    end: e,
                    words: curLine.map(w => ({ text: w.text || "", start: w.timestamp[0] + startTime, end: w.timestamp[1] + startTime }))
                });
                curLine = [];
            }
            curLine.push(c);
        }
        if (curLine.length > 0) {
            const s = curLine[0].timestamp[0] !== null ? curLine[0].timestamp[0] + startTime : startTime;
            const e = curLine[curLine.length - 1].timestamp[1] !== null ? curLine[curLine.length - 1].timestamp[1] + startTime : startTime + 2;
            lines.push({
                start: s,
                end: e,
                words: curLine.map(w => ({ text: w.text || "", start: w.timestamp[0] + startTime, end: w.timestamp[1] + startTime }))
            });
        }

        let rafId: number;
        const update = () => {
            if (videoRef.current) {
                const t = videoRef.current.currentTime;
                const line = lines.find(l => t >= l.start - 0.2 && t <= l.end + 0.2);

                if (line) {
                    const display = line.words.map((w) => {
                        // determine the active word dynamically (first word where time <= end)
                        // If multiple, just pick exactly inside boundaries, or cascade
                        const isHighlight = t >= w.start && t <= w.end;
                        return {
                            word: w.text,
                            isHighlight
                        };
                    });

                    // Fallback to highlighting first word if none match exactly but time is within line
                    if (!display.some(w => w.isHighlight) && display.length > 0) {
                        display[0].isHighlight = true;
                    }

                    setCurrentLine(display);
                } else {
                    setCurrentLine([]);
                }
            }
            rafId = requestAnimationFrame(update);
        };
        rafId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(rafId);
    }, [chunks, videoRef, startTime]);

    if (currentLine.length === 0) return null;

    return (
        <div
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '2px 6px',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '0 8px',
                lineHeight: 1.0,
                width: '100%',
                maxWidth: `${maxWidth - 20}px`, // Tighter margin
                margin: '0 auto',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
            }}
        >
            {currentLine.map((w, i) => (
                <span
                    key={i}
                    style={{
                        fontFamily: '"Bebas Neue", "Anton", "Arial Black", sans-serif',
                        fontSize: '24px', // Optimized for vertical 9:16 fit
                        letterSpacing: '0.01em',
                        fontWeight: '400',
                        color: w.isHighlight ? '#FFE234' : '#FFFFFF',
                        textTransform: 'uppercase',
                        WebkitTextStroke: w.isHighlight ? '1px #B8860B' : '1.5px #000000',
                        paintOrder: 'stroke fill',
                        textShadow: '0 4px 12px rgba(0,0,0,1)',
                        transition: 'all 0.1s ease',
                        display: 'inline-block',
                        transform: w.isHighlight ? 'scale(1.15)' : 'scale(1)',
                        zIndex: w.isHighlight ? 1 : 0,
                        margin: '2px 0'
                    }}
                >
                    {w.word}
                </span>
            ))}
        </div>
    );
};

