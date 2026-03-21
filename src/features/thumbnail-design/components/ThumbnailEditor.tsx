import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Text, Rect, Circle, Transformer } from 'react-konva';
import useImage from 'use-image';
import { useThumbnailStore, type ThumbnailObject } from '../../../store/thumbnailSlice';
import { captureVideoFrame } from '../../../shared/utils/captureFrame';
import { useAppStore } from '../../../app/store';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Type, Square, Circle as CircleIcon, Trash2, Pickaxe, ChevronUp, ChevronDown, ArrowUpToLine, ArrowDownToLine, Image as ImageIcon, Download } from 'lucide-react';

const FONTS = ['Inter', 'Impact', 'Montserrat', 'Oswald', 'Roboto', 'Arial'];

const StickerImage = ({ obj, commonProps }: { obj: ThumbnailObject, commonProps: any }) => {
  const [image] = useImage(obj.src || '', 'anonymous');
  return <KonvaImage image={image} {...commonProps} />;
};

interface ThumbnailEditorProps {
  masterVideoRef?: React.RefObject<HTMLVideoElement | null>;
}

const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;

export const ThumbnailEditor: React.FC<ThumbnailEditorProps> = ({ masterVideoRef: externalRef }) => {
  const { videoFiles } = useAppStore();
  const {
    thumbnailBackground,
    thumbnailObjects,
    bgOverlayOpacity,
    setThumbnailBackground,
    setBgOverlayOpacity,
    selectedObjectId,
    selectObject,
    addThumbnailObject,
    updateThumbnailObject,
    removeThumbnailObject,
    moveObjectUp,
    moveObjectDown,
    bringToFront,
    sendToBack
  } = useThumbnailStore();

  const stageRef = useRef<any>(null);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [stageScale, setStageScale] = useState(1);
  const [bgImage] = useImage(thumbnailBackground || '', 'anonymous');

  const masterVideo = videoFiles.find(v => v.isMaster) || videoFiles[0];
  const videoSrc = masterVideo ? convertFileSrc(masterVideo.path) : '';

  // Attach transformer to selected object
  useEffect(() => {
    if (selectedObjectId) {
      const selectedNode = layerRef.current?.findOne('#' + selectedObjectId);
      if (selectedNode && trRef.current) {
        trRef.current.nodes([selectedNode]);
        trRef.current.getLayer().batchDraw();
      }
    } else if (trRef.current) {
      trRef.current.nodes([]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedObjectId, thumbnailObjects]);

  // Handle responsive scaling
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const { clientWidth } = containerRef.current;
      const scale = clientWidth / STAGE_WIDTH;
      setStageScale(scale);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle keyboard shortcuts (Delete / Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT');
      if (isInput) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId) {
        removeThumbnailObject(selectedObjectId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjectId, removeThumbnailObject]);

  const handleCapture = () => {
    // Try external ref first, then internal
    const videoEl = externalRef?.current || internalVideoRef.current;
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
      addThumbnailObject({ ...baseObj, width: 100, height: 100 }); // Konva uses radius = width/2 often or radius prop. Let's use radius.
    }
  };

  const renderObject = (obj: ThumbnailObject) => {
    const commonProps = {
      ...obj,
      key: obj.id,
      id: obj.id, // For transformer findOne
      draggable: true,
      onClick: () => selectObject(obj.id),
      onTap: () => selectObject(obj.id),
      onDragEnd: (e: any) => {
        updateThumbnailObject(obj.id, {
          x: e.target.x(),
          y: e.target.y(),
        });
      },
      onTransformEnd: (e: any) => {
        const node = e.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        node.scaleX(1);
        node.scaleY(1);

        if (obj.type === 'text') {
           updateThumbnailObject(obj.id, {
             x: node.x(),
             y: node.y(),
             fontSize: Math.max(5, (obj.fontSize || 20) * scaleX),
             rotation: node.rotation(),
           });
        } else {
           updateThumbnailObject(obj.id, {
             x: node.x(),
             y: node.y(),
             width: Math.max(5, (obj.width || 100) * scaleX),
             height: Math.max(5, (obj.height || 100) * scaleY),
             rotation: node.rotation(),
           });
        }
      }
    };

    switch (obj.type) {
      case 'text':
        return <Text {...commonProps} />;
      case 'rect':
        return <Rect {...commonProps} />;
      case 'circle':
        // Map width/height to radius
        return <Circle {...commonProps} radius={(obj.width || 100) / 2} />;
      case 'image':
        return <StickerImage key={obj.id} obj={obj} commonProps={commonProps} />;
      default:
        return null;
    }
  };

  const selectedNode = thumbnailObjects.find(o => o.id === selectedObjectId);

  return (
    <div className="flex flex-col w-full h-full bg-slate-900 overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Pickaxe className="w-5 h-5 text-blue-500" />
          Kapak Tasarımı
        </h2>
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

      {/* Editor Main Area */}
      <div 
        ref={containerRef}
        className="flex-1 w-full flex items-center justify-center p-8 bg-black relative"
      >
        {/* Stage Wrapper */}
        <div 
          style={{ width: STAGE_WIDTH * stageScale, height: STAGE_HEIGHT * stageScale }}
          className="shadow-2xl ring-1 ring-white/10 overflow-hidden relative"
        >
          <Stage
            ref={stageRef}
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
            scaleX={stageScale}
            scaleY={stageScale}
            onMouseDown={(e) => {
              if (e.target === e.target.getStage()) {
                selectObject(null);
              }
            }}
          >
            <Layer ref={layerRef}>
              {bgImage && (
                <KonvaImage
                  image={bgImage}
                  width={STAGE_WIDTH}
                  height={STAGE_HEIGHT}
                />
              )}
              {bgOverlayOpacity > 0 && (
                <Rect
                  x={0}
                  y={0}
                  width={STAGE_WIDTH}
                  height={STAGE_HEIGHT}
                  fill="black"
                  opacity={bgOverlayOpacity / 100}
                  listening={false}
                />
              )}
              {thumbnailObjects.map(renderObject)}
              
              {/* Transformer enables resizing and rotating */}
              {selectedObjectId && (
                <Transformer
                  ref={trRef}
                  boundBoxFunc={(oldBox, newBox) => {
                    // Limit minimum size
                    if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                      return oldBox;
                    }
                    return newBox;
                  }}
                />
              )}
            </Layer>
          </Stage>
        </div>

        {/* Video Preview Sidepanel & Properties Sidebar container */}
        <div className="absolute top-8 right-8 flex flex-col gap-4 w-64 z-50">
          
          {/* Properties Panel */}
          {selectedObjectId && selectedNode && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
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
                
                {(selectedNode.type === 'text' || selectedNode.type === 'rect' || selectedNode.type === 'circle') && (
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
          )}

          {/* Background Properties Panel */}
          {!selectedObjectId && (
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
          )}

          {/* Video Preview Sidepanel */}
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
        </div>

        {/* Empty State Overlay */}
        {!thumbnailBackground && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40 pr-80 transition-opacity">
            <p className="text-slate-400 text-lg bg-slate-800/90 px-8 py-4 rounded-full border border-slate-700 shadow-2xl backdrop-blur-md">
              Sağdaki önizlemeden bir kare yakalayın ✨
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
