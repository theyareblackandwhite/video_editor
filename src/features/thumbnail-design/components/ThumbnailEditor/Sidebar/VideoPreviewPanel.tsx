import React from 'react';
import { useAppStore } from '../../../../../app/store';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';
import { safeConvertFileSrc } from '../../../../../shared/utils/tauri';
import { captureVideoFrame } from '../../../../../shared/utils/captureFrame';

interface VideoPreviewPanelProps {
  externalVideoRef?: React.RefObject<HTMLVideoElement | null>;
  internalVideoRef: React.RefObject<HTMLVideoElement | null>;
}

export const VideoPreviewPanel: React.FC<VideoPreviewPanelProps> = ({ externalVideoRef, internalVideoRef }) => {
  const { videoFiles } = useAppStore();
  const { setThumbnailBackground } = useThumbnailStore();

  const masterVideo = videoFiles.find(v => v.isMaster) || videoFiles[0];
  const videoSrc = masterVideo ? safeConvertFileSrc(masterVideo.path) : '';

  const handleCapture = () => {
    const videoEl = externalVideoRef?.current || internalVideoRef.current;
    if (videoEl) {
      try {
        const base64 = captureVideoFrame(videoEl);
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
        <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-700 relative">
          <video
            ref={internalVideoRef}
            src={videoSrc}
            className="w-full h-full object-contain pointer-events-auto"
            controls
          />
        </div>
        <button
          onClick={handleCapture}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 cursor-pointer"
        >
          Tam Bu Kareyi Yakala
        </button>
        <p className="text-[10px] text-slate-500 text-center leading-relaxed font-medium">
          Videonun istediğiniz saniyesine gelin ve kare yakalayın.
        </p>
      </div>
    </div>
  );
};
