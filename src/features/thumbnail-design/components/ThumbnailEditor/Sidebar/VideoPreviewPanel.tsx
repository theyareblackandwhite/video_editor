import React, { useRef, useState, useMemo } from 'react';
import { useAppStore } from '../../../../../app/store';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';
import { capturePreviewContainer } from '../../../../../shared/utils/captureFrame';
import { VideoPreview } from '../../../../timeline-edit/components/VideoPreview';
import { useMediaUrls } from '../../../../timeline-edit/hooks/useMediaUrls';
import { usePlayback } from '../../../../timeline-edit/hooks/usePlayback';
import { fmtTime } from '../../../../timeline-edit/utils/timeFormat';

interface VideoPreviewPanelProps {
  externalVideoRef?: React.RefObject<HTMLVideoElement | null>;
  internalVideoRef: React.RefObject<HTMLVideoElement | null>;
}

export const VideoPreviewPanel: React.FC<VideoPreviewPanelProps> = ({ internalVideoRef }) => {
  const { videoFiles, audioFiles, cuts, layoutMode, updateVideoTransform, borderRadius } = useAppStore();
  const { setThumbnailBackground } = useThumbnailStore();

  const masterVideo = useMemo(() => videoFiles.find(v => v.isMaster) || videoFiles[0], [videoFiles]);
  const otherVideos = useMemo(() => videoFiles.filter(v => v.id !== masterVideo?.id), [videoFiles, masterVideo]);
  const allAudioFiles = useMemo(() => audioFiles, [audioFiles]);

  const otherVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const [duration, setDuration] = useState(0);

  const mediaUrls = useMediaUrls(videoFiles, audioFiles);

  const {
      currentTime,
      isPlaying,
      setIsPlaying,
      seekTo,
      togglePlay,
  } = usePlayback({
      masterVideoRef: internalVideoRef,
      otherVideoRefs,
      audioRefs,
      otherVideos,
      allAudioFiles,
      cuts,
      duration,
  });

  const previewContainerId = 'thumbnail-video-preview-container';

  const handleCapture = () => {
    const previewEl = document.getElementById(previewContainerId);
    if (previewEl) {
      try {
        const base64 = capturePreviewContainer(previewEl);
        setThumbnailBackground(base64);
      } catch (error) {
        console.error('Frame capture failed:', error);
      }
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
      <div className="p-3 border-b border-slate-700 bg-slate-900/50">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Video Kaynağı</h3>
      </div>
      <div className="p-4 flex flex-col gap-4">
        {/* We wrap VideoPreview in a custom ID so it doesn't conflict with TimelineEdit if it were open (though only one is open) */}
        <div id={previewContainerId} className="relative w-full aspect-video rounded-lg overflow-hidden border border-slate-700 group cursor-pointer" onClick={togglePlay}>
          {masterVideo ? (
             <div className="w-full h-full pointer-events-none">
               <VideoPreview
                  masterVideo={masterVideo}
                  otherVideos={otherVideos}
                  allAudioFiles={allAudioFiles}
                  videoFiles={videoFiles}
                  layoutMode={layoutMode}
                  mediaUrls={mediaUrls}
                  masterVideoRef={internalVideoRef}
                  otherVideoRefs={otherVideoRefs}
                  audioRefs={audioRefs}
                  duration={duration}
                  setDuration={setDuration}
                  setIsPlaying={setIsPlaying}
                  currentTime={currentTime}
                  markIn={null}
                  fmtTime={fmtTime}
                  updateVideoTransform={updateVideoTransform}
                  borderRadius={borderRadius}
               />
             </div>
          ) : (
            <div className="w-full h-full bg-black flex items-center justify-center">
              <span className="text-gray-500 text-xs text-center">Video Yok</span>
            </div>
          )}
          
          {/* Custom Play/Pause Overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/20">
                  {isPlaying ? (
                    <span className="text-white font-bold text-xs pause-icon">||</span>
                  ) : (
                    <span className="text-white font-bold text-xs play-icon ml-1">▶</span>
                  )}
              </div>
          </div>
        </div>

        {/* Scrubber / Progress Bar */}
        <div className="flex flex-col gap-1">
          <input 
            type="range" 
            min={0} 
            max={duration || 100} 
            value={currentTime} 
            onChange={(e) => seekTo(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>{fmtTime(currentTime)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        <button
          onClick={handleCapture}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 cursor-pointer"
        >
          Tam Bu Kareyi Yakala
        </button>
        <p className="text-[10px] text-slate-500 text-center leading-relaxed font-medium">
          Videonun istediğiniz saniyesine gelin ve düzenlemelerinizle kare yakalayın.
        </p>
      </div>
    </div>
  );
};
