import React from 'react';
import { Trash2, ArrowUpToLine, ChevronUp, ChevronDown, ArrowDownToLine } from 'lucide-react';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';

const FONTS = ['Inter', 'Impact', 'Montserrat', 'Oswald', 'Roboto', 'Arial'];

export const PropertiesPanel: React.FC = () => {
  const {
    thumbnailObjects,
    selectedObjectId,
    updateThumbnailObject,
    removeThumbnailObject,
    bringToFront,
    moveObjectUp,
    moveObjectDown,
    sendToBack
  } = useThumbnailStore();

  const selectedNode = thumbnailObjects.find(o => o.id === selectedObjectId);
  if (!selectedObjectId || !selectedNode) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl mb-4">
      <div className="p-3 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Özellikler</h3>
        <button
          onClick={() => removeThumbnailObject(selectedObjectId)}
          className="p-1.5 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded transition-colors"
          title="Objeyi Sil"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 flex flex-col gap-4">
        {/* Layering Controls */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-slate-400">Katman (Sıralama)</label>
          <div className="grid grid-cols-4 gap-1">
            <button
              onClick={() => bringToFront(selectedObjectId)}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded flex justify-center transition-colors"
              title="En Üste Getir"
            >
              <ArrowUpToLine className="w-4 h-4" />
            </button>
            <button
              onClick={() => moveObjectUp(selectedObjectId)}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded flex justify-center transition-colors"
              title="Bir Katman Üste"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => moveObjectDown(selectedObjectId)}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded flex justify-center transition-colors"
              title="Bir Katman Alta"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={() => sendToBack(selectedObjectId)}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded flex justify-center transition-colors"
              title="En Alta Gönder"
            >
              <ArrowDownToLine className="w-4 h-4" />
            </button>
          </div>
        </div>

        {selectedNode.type === 'text' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Metin</label>
              <input
                type="text"
                value={selectedNode.text || ''}
                onChange={(e) => updateThumbnailObject(selectedObjectId, { text: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Font</label>
              <select
                value={selectedNode.fontFamily || 'Inter'}
                onChange={(e) => updateThumbnailObject(selectedObjectId, { fontFamily: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {FONTS.map(font => (
                  <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                ))}
              </select>
            </div>
          </>
        )}
        
        {['text', 'rect', 'circle'].includes(selectedNode.type) && (
          <div className="flex flex-col gap-1 mt-2">
            <label className="text-xs text-slate-400">Renk (Dolgu)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedNode.fill || '#ffffff'}
                onChange={(e) => updateThumbnailObject(selectedObjectId, { fill: e.target.value })}
                className="w-8 h-8 rounded border border-slate-700 bg-slate-900 p-0.5 cursor-pointer"
              />
              <input
                type="text"
                value={selectedNode.fill || '#ffffff'}
                onChange={(e) => updateThumbnailObject(selectedObjectId, { fill: e.target.value })}
                className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 uppercase"
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'text' && (
          <>
            <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-slate-700">
              <label className="text-xs text-slate-400">Dış Çizgi (Stroke)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedNode.stroke || '#000000'}
                  onChange={(e) => updateThumbnailObject(selectedObjectId, { stroke: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-700 bg-slate-900 p-0.5 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={selectedNode.strokeWidth || 0}
                  onChange={(e) => updateThumbnailObject(selectedObjectId, { strokeWidth: Number(e.target.value) })}
                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="Boyut"
                />
              </div>
            </div>
            
            <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-slate-700">
              <label className="text-xs text-slate-400">Gölge (Shadow)</label>
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="color"
                  value={selectedNode.shadowColor || '#000000'}
                  onChange={(e) => updateThumbnailObject(selectedObjectId, { shadowColor: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-700 bg-slate-900 p-0.5 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={selectedNode.shadowBlur || 0}
                  onChange={(e) => updateThumbnailObject(selectedObjectId, { shadowBlur: Number(e.target.value) })}
                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="Bulanıklık"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-6">X/Y:</span>
                <input
                  type="number"
                  value={selectedNode.shadowOffsetX || 0}
                  onChange={(e) => updateThumbnailObject(selectedObjectId, { shadowOffsetX: Number(e.target.value) })}
                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  value={selectedNode.shadowOffsetY || 0}
                  onChange={(e) => updateThumbnailObject(selectedObjectId, { shadowOffsetY: Number(e.target.value) })}
                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
