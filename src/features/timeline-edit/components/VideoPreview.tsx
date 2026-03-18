import React from 'react';
import { LayoutTemplate } from 'lucide-react';
import type { MediaFile, LayoutMode } from '../../../app/store/types';

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
}) => {
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
            <div className="bg-black rounded-2xl overflow-hidden shadow-xl mb-4 aspect-video relative flex items-center justify-center">
                <div className={`w-full h-full flex ${videoFiles.length > 1 ? 'flex-row' : ''}`}>
                    {masterVideo && (
                        <div className={`relative ${videoFiles.length > 1 ? 'flex-1 border-r border-gray-800' : 'w-full h-full'} overflow-hidden flex items-center justify-center bg-black`}>
                            <video
                                ref={masterVideoRef}
                                src={mediaUrls[masterVideo.id]}
                                className={`w-full h-full ${videoFiles.length > 1 && layoutMode === 'crop' ? 'object-cover' : 'object-contain'}`}
                                onLoadedMetadata={() => {
                                    if (masterVideoRef.current && duration === 0) {
                                        setDuration(masterVideoRef.current.duration);
                                    }
                                }}
                                onEnded={() => setIsPlaying(false)}
                                muted={allAudioFiles.length > 0}
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
                                src={mediaUrls[v.id]}
                                className={`w-full h-full ${layoutMode === 'crop' ? 'object-cover' : 'object-contain'}`}
                                muted
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
