import React from 'react';
import { Square, Circle as CircleIcon, ArrowRight } from 'lucide-react';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';

interface ElementItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const ElementItem: React.FC<ElementItemProps> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-700/60 hover:border-blue-500/50 transition-all group grayscale hover:grayscale-0"
  >
    <div className="text-slate-400 group-hover:text-blue-400 transition-colors">
      {icon}
    </div>
    <span className="text-[10px] font-medium text-slate-500 group-hover:text-slate-300 uppercase tracking-tighter">
      {label}
    </span>
  </button>
);

const StickerItem: React.FC<{ url: string; label: string; onClick: () => void }> = ({ url, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-2 p-2 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-700/60 hover:border-blue-500/50 transition-all group"
  >
    <div className="w-10 h-10 flex items-center justify-center">
      <img src={url} alt={label} className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform" />
    </div>
    <span className="text-[10px] font-medium text-slate-500 group-hover:text-slate-300 uppercase tracking-tighter truncate w-full text-center">
      {label}
    </span>
  </button>
);

export const ElementsPanel: React.FC = () => {
  const { addThumbnailObject } = useThumbnailStore();

  const addShape = (type: 'rect' | 'circle', extra = {}) => {
    addThumbnailObject({
      type,
      x: 100,
      y: 100,
      width: 150,
      height: 150,
      fill: '#3b82f6',
      rotation: 0,
      ...extra
    });
  };

  const addSticker = (url: string) => {
    addThumbnailObject({
      type: 'image',
      x: 200,
      y: 200,
      width: 200,
      height: 200,
      src: url,
      rotation: 0,
    });
  };

  const stickers = [
    { label: 'Subscribe', url: 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png' },
    { label: 'YouTube', url: 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png' }, // Redundant but for demo
    { label: 'Like', url: 'https://cdn-icons-png.flaticon.com/512/1067/1067446.png' },
    { label: 'Bell', url: 'https://cdn-icons-png.flaticon.com/512/1827/1827347.png' },
    { label: 'Arrow', url: 'https://cdn-icons-png.flaticon.com/512/271/271228.png' },
    { label: 'Shocked', url: 'https://cdn-icons-png.flaticon.com/512/1791/1791330.png' },
    { label: 'Fire', url: 'https://cdn-icons-png.flaticon.com/512/426/426833.png' },
    { label: 'Money', url: 'https://cdn-icons-png.flaticon.com/512/2488/2488749.png' },
  ];

  return (
    <div className="flex flex-col gap-6 p-1">
      <section>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">Temel Şekiller</h4>
        <div className="grid grid-cols-3 gap-2">
          <ElementItem 
            icon={<Square className="w-6 h-6" />} 
            label="Kare" 
            onClick={() => addShape('rect')} 
          />
          <ElementItem 
            icon={<CircleIcon className="w-6 h-6" />} 
            label="Daire" 
            onClick={() => addShape('circle')} 
          />
          <ElementItem 
            icon={<ArrowRight className="w-6 h-6" />} 
            label="Ok" 
            onClick={() => addSticker('https://cdn-icons-png.flaticon.com/512/271/271228.png')} 
          />
        </div>
      </section>

      <section>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">YouTube & Sosyal</h4>
        <div className="grid grid-cols-3 gap-2">
          {stickers.slice(0, 4).map((s, i) => (
            <StickerItem key={i} {...s} onClick={() => addSticker(s.url)} />
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">Stickerlar</h4>
        <div className="grid grid-cols-3 gap-2">
          {stickers.slice(4).map((s, i) => (
            <StickerItem key={i} {...s} onClick={() => addSticker(s.url)} />
          ))}
        </div>
      </section>
    </div>
  );
};
