import React, { useRef, useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import type { MediaFile, LayoutMode, VideoTransform } from '../../../app/store/types';

interface VideoPreviewProps {
    masterVideo: MediaFile | undefined;
    otherVideos: MediaFile[];
    allAudioFiles: MediaFile[];
    videoFiles: MediaFile[];
    layoutMode: LayoutMode;
    mediaUrls: Record<string, string>;
    masterVideoRef: React.RefObject<HTMLVideoElement | null>;
    otherVideoRefs: React.MutableRefObject<Record<string, HTMLVideoElement | null>>;
    audioRefs: React.MutableRefObject<Record<string, HTMLAudioElement | null>>;
    duration: number;
    setDuration: React.Dispatch<React.SetStateAction<number>>;
    setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    setLayoutMode: (mode: LayoutMode) => void;
    currentTime: number;
    markIn: number | null;
    fmtTime: (s: number) => string;
    updateVideoTransform: (id: string, transform: Partial<VideoTransform>) => void;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
    masterVideo,
    otherVideos,
    allAudioFiles,
    videoFiles,
    layoutMode,
    mediaUrls,
    masterVideoRef,
    otherVideoRefs,
    audioRefs,
    duration,
    setDuration,
    setIsPlaying,
    setLayoutMode,
    currentTime,
    markIn,
    fmtTime,
    updateVideoTransform,
}) => {
    /* ── Drag & Zoom Context ── */
    const dragRef = useRef<{ id: string, startX: number, startY: number, initialX: number, initialY: number } | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);

    const handleMouseDown = (e: React.MouseEvent, v: MediaFile) => {
        if (layoutMode !== 'crop') return;
        const transform = v.transform || { scale: 1, x: 0, y: 0 };
        dragRef.current = {
            id: v.id,
            startX: e.clientX,
            startY: e.clientY,
            initialX: transform.x,
            initialY: transform.y
        };
        setDraggingId(v.id);
        e.preventDefault();
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current) return;
        const { id, startX, startY, initialX, initialY } = dragRef.current;
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        
        const deltaX = ((e.clientX - startX) / rect.width) * 100;
        const deltaY = ((e.clientY - startY) / rect.height) * 100;

        updateVideoTransform(id, { 
            x: Math.round(initialX + deltaX), 
            y: Math.round(initialY + deltaY) 
        });
    };

    const handleMouseUp = () => {
        dragRef.current = null;
        setDraggingId(null);
    };

    const handleWheel = (e: React.WheelEvent, v: MediaFile) => {
        if (layoutMode !== 'crop') return;
        
        const transform = v.transform || { scale: 1, x: 0, y: 0 };
        const zoomStep = 0.05;
        const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
        
        const newScale = Math.min(Math.max(transform.scale + delta, 1), 5);
        
        if (newScale !== transform.scale) {
            updateVideoTransform(v.id, { scale: parseFloat(newScale.toFixed(2)) });
        }
    };

    const getVideoStyle = (v: MediaFile): React.CSSProperties => {
        if (layoutMode !== 'crop') return {};
        const { scale = 1, x = 0, y = 0 } = v.transform || {};
        return {
            transform: `scale(${scale}) translate(${x}%, ${y}%)`,
            objectFit: 'contain',
            width: '100%',
            height: '100%',
            transition: draggingId ? 'none' : 'transform 0.1s ease-out',
            pointerEvents: 'none' // Ensure video doesn't intercept events from container
        };
    };

    return (
        <>
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
            <div 
                className={`bg-black rounded-2xl overflow-hidden shadow-xl mb-4 aspect-video relative flex items-center justify-center ${draggingId ? 'cursor-grabbing' : ''}`}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div className={`w-full h-full flex ${videoFiles.length > 1 ? 'flex-row' : ''}`}>
                    {masterVideo && (
                        <div 
                            className={`group relative ${videoFiles.length > 1 ? 'flex-1 border-r border-gray-800' : 'w-full h-full'} overflow-hidden flex items-center justify-center bg-black ${layoutMode === 'crop' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            onMouseDown={(e) => handleMouseDown(e, masterVideo)}
                            onWheel={(e) => handleWheel(e, masterVideo)}
                        >
                            <video
                                ref={masterVideoRef}
                                src={mediaUrls[masterVideo.id]}
                                style={getVideoStyle(masterVideo)}
                                className={`w-full h-full ${videoFiles.length > 1 && layoutMode === 'crop' ? '' : 'object-contain'}`}
                                onLoadedMetadata={() => {
                                    if (masterVideoRef.current && duration === 0) {
                                        setDuration(masterVideoRef.current.duration);
                                    }
                                }}
                                onEnded={() => setIsPlaying(false)}
                                muted={allAudioFiles.length > 0}
                            />
                            {videoFiles.length > 1 && (
                                <span className="absolute top-2 left-2 bg-black/60 text-white/80 text-[10px] px-2 py-1 rounded font-mono pointer-events-none">MASTER</span>
                            )}
                            
                            {/* Visual Zoom Indicator */}
                            {layoutMode === 'crop' && (masterVideo.transform?.scale || 1) > 1 && (
                                <span className="absolute bottom-2 right-2 bg-black/40 text-white/60 text-[9px] px-1.5 py-0.5 rounded font-mono pointer-events-none opacity-0 group-hover:opacity-100">
                                    {masterVideo.transform?.scale.toFixed(2)}x
                                </span>
                            )}
                        </div>
                    )}

                    {otherVideos.map(v => (
                        <div 
                            key={v.id} 
                            className={`group relative flex-1 overflow-hidden flex items-center justify-center bg-black border-l border-gray-800 ${layoutMode === 'crop' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            onMouseDown={(e) => handleMouseDown(e, v)}
                            onWheel={(e) => handleWheel(e, v)}
                        >
                            <video
                                ref={el => { if (el) otherVideoRefs.current[v.id] = el; }}
                                src={mediaUrls[v.id]}
                                style={getVideoStyle(v)}
                                className="w-full h-full"
                                muted
                            />
                            <span className="absolute top-2 left-2 bg-black/60 text-white/80 text-[10px] px-2 py-1 rounded font-mono pointer-events-none">KAMERA 2</span>
                            
                            {/* Visual Zoom Indicator */}
                            {layoutMode === 'crop' && (v.transform?.scale || 1) > 1 && (
                                <span className="absolute bottom-2 right-2 bg-black/40 text-white/60 text-[9px] px-1.5 py-0.5 rounded font-mono pointer-events-none opacity-0 group-hover:opacity-100">
                                    {v.transform?.scale.toFixed(2)}x
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Interaction Hints (Only in Crop Mode) */}
                {layoutMode === 'crop' && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-white/50 text-[10px] pointer-events-none select-none">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                            <span>Sürükle: <b>Kaydır (Pan)</b></span>
                        </div>
                        <div className="w-[1px] h-3 bg-white/10" />
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                            <span>Tekerlek: <b>Zoom</b></span>
                        </div>
                    </div>
                )}

                {/* Hidden Audio Elements */}
                {allAudioFiles.map(a => (
                    <audio
                        key={a.id}
                        ref={el => { if (el) audioRefs.current[a.id] = el; }}
                        src={mediaUrls[a.id]}
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
        </>
    );
};
