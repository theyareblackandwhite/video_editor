import React from 'react';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';

export const BackgroundPanel: React.FC = () => {
  const { bgOverlayOpacity, setBgOverlayOpacity } = useThumbnailStore();

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl mb-4">
      <div className="p-3 border-b border-slate-700 bg-slate-900/50">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Arka Plan Karartma</h3>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <input
          type="range"
          min="0"
          max="100"
          value={bgOverlayOpacity}
          onChange={(e) => setBgOverlayOpacity(Number(e.target.value))}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <div className="flex justify-between text-xs text-slate-400 font-medium">
          <span>%0</span>
          <span>%{bgOverlayOpacity} Opaklık</span>
        </div>
      </div>
    </div>
  );
};
