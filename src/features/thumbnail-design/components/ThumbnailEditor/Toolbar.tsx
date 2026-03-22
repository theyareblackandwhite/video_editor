import React from 'react';
import { Type, Square, Circle as CircleIcon, Pickaxe, ImageIcon, Download, Undo, Redo } from 'lucide-react';
import { useThumbnailStore } from '../../../../store/thumbnailSlice';
import { captureVideoFrame } from '../../../../shared/utils/captureFrame';
import { STAGE_WIDTH, STAGE_HEIGHT } from '../../hooks/useStageScale';
import { useStore } from 'zustand';

interface ToolbarProps {
  stageRef: React.RefObject<any>;
  externalVideoRef?: React.RefObject<HTMLVideoElement | null>;
  internalVideoRef: React.RefObject<HTMLVideoElement | null>;
}

export const Toolbar: React.FC<ToolbarProps> = ({ stageRef, externalVideoRef, internalVideoRef }) => {
  const { addThumbnailObject, setThumbnailBackground, selectObject } = useThumbnailStore();
  
  // Use useStore to subscribe to the temporal store for reactivity
  const { undo, redo, pastStates, futureStates } = useStore(useThumbnailStore.temporal, (state) => state);

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

  const handleDownload = () => {
    if (!stageRef.current) return;
    
    // Deselect object before download so transformer isn't visible
    selectObject(null);
    
    // Use setTimeout to ensure re-render happens before capture
    setTimeout(() => {
      if (!stageRef.current) return;
      const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = 'kapak-tasarimi.png';
      link.href = uri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, 100);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        addThumbnailObject({
          type: 'image',
          x: STAGE_WIDTH / 2 - 100,
          y: STAGE_HEIGHT / 2 - 100,
          width: 200,
          height: 200,
          src: base64
        });
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleAddObject = (type: 'text' | 'rect' | 'circle') => {
    const baseObj = {
      type,
      x: STAGE_WIDTH / 2 - 100,
      y: STAGE_HEIGHT / 2 - 50,
      fill: type === 'text' ? '#ffffff' : '#3b82f6',
    };

    if (type === 'text') {
      addThumbnailObject({ ...baseObj, text: 'Yeni Metin', fontSize: 60 });
    } else if (type === 'rect') {
      addThumbnailObject({ ...baseObj, width: 200, height: 100 });
    } else if (type === 'circle') {
      addThumbnailObject({ ...baseObj, width: 100, height: 100 }); 
    }
  };

  return (
    <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Pickaxe className="w-5 h-5 text-blue-500" />
          Kapak Tasarımı
        </h2>
        
        <div className="flex gap-1 ml-4 border-l border-slate-700 pl-4">
          <button
            onClick={() => undo()}
            disabled={pastStates.length === 0}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-all sm:flex hidden"
            title="Geri Al (Ctrl+Z)"
          >
            <Undo className="w-5 h-5" />
          </button>
          <button
            onClick={() => redo()}
            disabled={futureStates.length === 0}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-all sm:flex hidden"
            title="İleri Al (Ctrl+Y)"
          >
            <Redo className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex gap-2 border-r border-slate-700 pr-4">
          <button
            onClick={() => handleAddObject('text')}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-colors text-sm font-medium"
          >
            <Type className="w-4 h-4" /> Metin
          </button>
          <button
            onClick={() => handleAddObject('rect')}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-colors text-sm font-medium"
          >
            <Square className="w-4 h-4" /> Kare
          </button>
          <button
            onClick={() => handleAddObject('circle')}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-colors text-sm font-medium"
          >
            <CircleIcon className="w-4 h-4" /> Daire
          </button>
          <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-colors text-sm font-medium cursor-pointer">
            <ImageIcon className="w-4 h-4" /> Görsel
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        </div>
        <button
          onClick={handleCapture}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors text-sm font-bold cursor-pointer"
        >
          Mevcut Kareyi Yakala
        </button>
        <button
          onClick={handleDownload}
          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors text-sm font-bold cursor-pointer flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> İndir
        </button>
      </div>
    </div>
  );
};
