import React, { useEffect } from 'react';
import { 
  Trash2, ArrowUpToLine, ChevronUp, ChevronDown, ArrowDownToLine,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight
} from 'lucide-react';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';
import { GOOGLE_FONTS, loadGoogleFont } from '../../../../../shared/utils/fontLoader';

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

  // Load font when it changes
  useEffect(() => {
    if (selectedNode?.type === 'text' && selectedNode.fontFamily) {
      loadGoogleFont(selectedNode.fontFamily);
    }
  }, [selectedNode?.fontFamily, selectedNode?.type]);

  if (!selectedObjectId || !selectedNode) return null;

  const toggleStyle = (style: 'bold' | 'italic') => {
    const current = selectedNode.fontStyle || 'normal';
    let next = 'normal';
    
    if (style === 'bold') {
      if (current.includes('bold')) {
        next = current.replace('bold', '').trim() || 'normal';
      } else {
        next = current === 'normal' ? 'bold' : `${current} bold`;
      }
    } else if (style === 'italic') {
      if (current.includes('italic')) {
        next = current.replace('italic', '').trim() || 'normal';
      } else {
        next = current === 'normal' ? 'italic' : `italic ${current}`;
      }
    }
    updateThumbnailObject(selectedObjectId, { fontStyle: next });
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl mb-4 max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar">
      <div className="p-3 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center sticky top-0 z-10">
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
              <textarea
                value={selectedNode.text || ''}
                onChange={(e) => updateThumbnailObject(selectedObjectId, { text: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[60px] resize-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Font Ailesi</label>
              <select
                value={selectedNode.fontFamily || 'Inter'}
                onChange={(e) => updateThumbnailObject(selectedObjectId, { fontFamily: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {GOOGLE_FONTS.map(font => (
                  <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Format</label>
                <div className="flex bg-slate-900 border border-slate-700 rounded p-1">
                  <button
                    onClick={() => toggleStyle('bold')}
                    className={`flex-1 p-1.5 rounded flex justify-center transition-all ${
                      selectedNode.fontStyle?.includes('bold') ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleStyle('italic')}
                    className={`flex-1 p-1.5 rounded flex justify-center transition-all ${
                      selectedNode.fontStyle?.includes('italic') ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => updateThumbnailObject(selectedObjectId, { 
                      textDecoration: selectedNode.textDecoration === 'underline' ? 'none' : 'underline' 
                    })}
                    className={`flex-1 p-1.5 rounded flex justify-center transition-all ${
                      selectedNode.textDecoration === 'underline' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Underline className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Hizalama</label>
                <div className="flex bg-slate-900 border border-slate-700 rounded p-1">
                  <button
                    onClick={() => updateThumbnailObject(selectedObjectId, { align: 'left' })}
                    className={`flex-1 p-1.5 rounded flex justify-center transition-all ${
                      selectedNode.align === 'left' || !selectedNode.align ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => updateThumbnailObject(selectedObjectId, { align: 'center' })}
                    className={`flex-1 p-1.5 rounded flex justify-center transition-all ${
                      selectedNode.align === 'center' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => updateThumbnailObject(selectedObjectId, { align: 'right' })}
                    className={`flex-1 p-1.5 rounded flex justify-center transition-all ${
                      selectedNode.align === 'right' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400">Satır Yük.</label>
                  <span className="text-[10px] text-slate-500">{selectedNode.lineHeight || 1}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={selectedNode.lineHeight || 1}
                  onChange={(e) => updateThumbnailObject(selectedObjectId, { lineHeight: Number(e.target.value) })}
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400">Harf Aralığı</label>
                  <span className="text-[10px] text-slate-500">{selectedNode.letterSpacing || 0}</span>
                </div>
                <input
                  type="range"
                  min="-5"
                  max="20"
                  step="1"
                  value={selectedNode.letterSpacing || 0}
                  onChange={(e) => updateThumbnailObject(selectedObjectId, { letterSpacing: Number(e.target.value) })}
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-300">Vurgu Arka Planı (Highlight)</label>
                <div 
                  onClick={() => updateThumbnailObject(selectedObjectId, { textBackgroundEnabled: !selectedNode.textBackgroundEnabled })}
                  className={`w-10 h-5 rounded-full relative transition-all cursor-pointer ${
                    selectedNode.textBackgroundEnabled ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${
                    selectedNode.textBackgroundEnabled ? 'left-6' : 'left-1'
                  }`} />
                </div>
              </div>

              {selectedNode.textBackgroundEnabled && (
                <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-[10px] text-slate-500">Kutu Rengi</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={selectedNode.textBackgroundColor || '#000000'}
                          onChange={(e) => updateThumbnailObject(selectedObjectId, { textBackgroundColor: e.target.value })}
                          className="w-8 h-8 rounded border border-slate-700 bg-slate-900 p-0.5 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={selectedNode.textBackgroundColor || '#000000'}
                          onChange={(e) => updateThumbnailObject(selectedObjectId, { textBackgroundColor: e.target.value })}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white uppercase"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 w-20">
                      <label className="text-[10px] text-slate-500">Padding</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={selectedNode.padding || 10}
                        onChange={(e) => updateThumbnailObject(selectedObjectId, { padding: Number(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {['text', 'rect', 'circle', 'image'].includes(selectedNode.type) && (
          <div className="flex flex-col gap-1 mt-2 pt-4 border-t border-slate-700">
            <label className="text-xs text-slate-400">
              {selectedNode.type === 'text' ? 'Metin Rengi' : 'Renk (Dolgu)'}
            </label>
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
            <div className="flex flex-col gap-1 mt-2 pt-4 border-t border-slate-700">
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
            
            <div className="flex flex-col gap-1 mt-2 pt-4 border-t border-slate-700">
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
