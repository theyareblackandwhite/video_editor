import React, { useEffect, useState, useRef } from 'react';
import { analyzeVideoForShorts } from '../utils/faceTracker';
import type { CropCoordinate } from '../utils/faceTracker';
import type { MediaFile } from '../../../app/store/types';
import { safeConvertFileSrc } from '../../../shared/utils/tauri';
import { Loader2, Play, Pause, Check, X } from 'lucide-react';

interface Props {
    masterVideo: MediaFile;
    enableFaceTracker: boolean;
    onConfirm: (coordinates?: CropCoordinate[]) => void;
    onCancel: () => void;
}

export const ShortsPreview: React.FC<Props> = ({ masterVideo, enableFaceTracker, onConfirm, onCancel }) => {
    const [status, setStatus] = useState<'analyzing' | 'preview'>('analyzing');
    const [progress, setProgress] = useState(0);
    const [coordinates, setCoordinates] = useState<CropCoordinate[]>([]);
    
    const [isPlaying, setIsPlaying] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);
    const cropBoxRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);

    const videoSrc = safeConvertFileSrc(masterVideo.path);

    useEffect(() => {
        let isMounted = true;

        const runAnalysis = async () => {
            if (!enableFaceTracker) {
                // Static center crop
                if (isMounted) {
                    setStatus('preview');
                }
                return;
            }

            try {
                const coords = await analyzeVideoForShorts(
                    videoSrc, 
                    0, 
                    60, // Fallback since MediaFile lacks duration
                    (p) => {
                        if (isMounted) setProgress(p);
                    }
                );
                if (isMounted) {
                    setCoordinates(coords);
                    setStatus('preview');
                }
            } catch (err) {
                console.error("Face analysis failed:", err);
                alert("Yüz analizi başarısız oldu: " + err);
                if (isMounted) onCancel();
            }
        };

        runAnalysis();

        return () => {
            isMounted = false;
        };
    }, [videoSrc, enableFaceTracker, onCancel]);

    // Render loop for the crop box
    useEffect(() => {
        if (status !== 'preview') return;

        const updateCropBox = () => {
            const video = videoRef.current;
            const box = cropBoxRef.current;
            if (video && box) {
                // Determine scale between displayed video and actual video
                // The video object-fit is 'contain'
                const displayW = video.clientWidth;
                const displayH = video.clientHeight;
                const videoW = video.videoWidth;
                const videoH = video.videoHeight;
                
                if (videoW && videoH) {
                    const scale = Math.min(displayW / videoW, displayH / videoH);
                    const drawW = videoW * scale;
                    const drawH = videoH * scale;
                    // Center offsets
                    const offsetX = (displayW - drawW) / 2;
                    const offsetY = (displayH - drawH) / 2;

                    const time = video.currentTime;
                    
                    let targetCrop = { x: 0, y: 0, w: Math.round((videoH * 9) / 16), h: videoH };

                    if (enableFaceTracker && coordinates.length > 0) {
                        // Find closest coordinate by time
                        let closest = coordinates[0];
                        let minDiff = Infinity;
                        for (const c of coordinates) {
                            const diff = Math.abs(c.time - time);
                            if (diff < minDiff) {
                                minDiff = diff;
                                closest = c;
                            }
                        }
                        targetCrop = closest;
                    } else {
                        // Center crop fallback
                        if (targetCrop.w > videoW) {
                            targetCrop.w = videoW;
                            targetCrop.h = Math.round((videoW * 16) / 9);
                        }
                        targetCrop.x = (videoW - targetCrop.w) / 2;
                        targetCrop.y = (videoH - targetCrop.h) / 2;
                    }

                    // Apply to DOM
                    box.style.width = `${targetCrop.w * scale}px`;
                    box.style.height = `${targetCrop.h * scale}px`;
                    box.style.left = `${offsetX + targetCrop.x * scale}px`;
                    box.style.top = `${offsetY + targetCrop.y * scale}px`;
                }
            }
            rafRef.current = requestAnimationFrame(updateCropBox);
        };

        rafRef.current = requestAnimationFrame(updateCropBox);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [status, coordinates, enableFaceTracker]);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    if (status === 'analyzing') {
        return (
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 size={48} className="text-indigo-500 animate-spin mb-6" />
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Yapay Zeka ile Yüz Takibi Analizi</h2>
                <p className="text-gray-500 text-center max-w-md mb-6">
                    Video içindeki konuşmacının hareketleri analiz edilerek akıllı odaklama ayarlanıyor...
                </p>
                <div className="w-full max-w-md bg-gray-100 rounded-full h-3 mb-2 overflow-hidden shadow-inner">
                    <div 
                        className="bg-indigo-500 h-3 rounded-full transition-all duration-300" 
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    ></div>
                </div>
                <span className="text-sm font-medium text-gray-600">
                    {Math.round(progress * 100)}%
                </span>
                
                <button 
                    onClick={onCancel}
                    className="mt-8 text-sm text-gray-400 hover:text-red-500 transition-colors"
                >
                    İptal Et
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-xl font-semibold text-gray-800">Shorts Önizleme</h2>
                    <p className="text-sm text-gray-500">Mavi alan 9:16 formatında kırpılacak kısmı gösterir.</p>
                </div>
                <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                    <X size={24} />
                </button>
            </div>

            <div className="relative bg-black rounded-lg overflow-hidden flex-1 min-h-[400px] mb-4 group select-none">
                <video 
                    ref={videoRef}
                    src={videoSrc}
                    className="absolute inset-0 w-full h-full object-contain"
                    autoPlay
                    loop
                    muted
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onClick={togglePlay}
                />
                {/* Crop Overlay Window */}
                <div 
                    ref={cropBoxRef}
                    className="absolute border-4 border-indigo-500 bg-indigo-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none transition-all duration-75"
                ></div>
                
                {/* Play/Pause UI */}
                <button 
                    onClick={togglePlay}
                    className="absolute bottom-4 left-4 bg-black/60 text-white p-3 rounded-full hover:bg-black/80 transition-colors backdrop-blur-md"
                >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
            </div>

            <div className="flex justify-end gap-3">
                <button 
                    onClick={onCancel}
                    className="px-6 py-2.5 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                    Geri Dön
                </button>
                <button 
                    onClick={() => onConfirm(enableFaceTracker ? coordinates : undefined)}
                    className="px-6 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                    <Check size={18} />
                    Onayla ve Dışa Aktar
                </button>
            </div>
        </div>
    );
};
