import React from 'react';
import { 
  Type, Square, Circle as CircleIcon, ImageIcon, 
  Eye, EyeOff, Lock, Unlock, GripVertical, Layers as LayersIcon
} from 'lucide-react';
import { useThumbnailStore, type ThumbnailObject } from '../../../../../store/thumbnailSlice';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableItemProps {
  obj: ThumbnailObject;
}

const SortableLayerItem: React.FC<SortableItemProps> = ({ obj }) => {
  const { 
    selectedObjectId, 
    selectObject, 
    toggleVisibility, 
    toggleLock 
  } = useThumbnailStore();
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: obj.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  const isSelected = selectedObjectId === obj.id;

  const getIcon = () => {
    switch (obj.type) {
      case 'text': return <Type className="w-4 h-4" />;
      case 'rect': return <Square className="w-4 h-4" />;
      case 'circle': return <CircleIcon className="w-4 h-4" />;
      case 'image': return <ImageIcon className="w-4 h-4" />;
      default: return null;
    }
  };

  const getLabel = () => {
    if (obj.type === 'text') return obj.text?.substring(0, 20) || 'Metin';
    if (obj.type === 'image') return 'Görsel';
    if (obj.type === 'rect') return 'Kare';
    if (obj.type === 'circle') return 'Daire';
    return 'Obje';
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => selectObject(obj.id)}
      className={`group flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
        isSelected 
          ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
          : 'bg-slate-900/40 border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-slate-500 hover:text-slate-300">
        <GripVertical className="w-4 h-4" />
      </div>
      
      <div className={`p-1.5 rounded ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>
        {getIcon()}
      </div>
      
      <span className={`text-xs font-medium flex-1 truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
        {getLabel()}
      </span>
      
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleVisibility(obj.id);
          }}
          className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${
            obj.isVisible === false ? 'text-red-400' : 'text-slate-400 hover:text-white'
          }`}
          title={obj.isVisible === false ? 'Göster' : 'Gizle'}
        >
          {obj.isVisible === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleLock(obj.id);
          }}
          className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${
            obj.isLocked ? 'text-yellow-400' : 'text-slate-400 hover:text-white'
          }`}
          title={obj.isLocked ? 'Kilidi Kaldır' : 'Kilitle'}
        >
          {obj.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

export const LayersPanel: React.FC = () => {
  const { thumbnailObjects, reorderObjects } = useThumbnailStore();
  
  // Reverse objects for the UI so "top" in list is "front" in Konva
  const reversedObjects = [...thumbnailObjects].reverse();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = reversedObjects.findIndex((item) => item.id === active.id);
      const newIndex = reversedObjects.findIndex((item) => item.id === over.id);
      
      const newReversedOrder = arrayMove(reversedObjects, oldIndex, newIndex);
      // Reverse back to Konva order (bottom to top)
      reorderObjects([...newReversedOrder].reverse());
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden shadow-xl mb-4 flex flex-col max-h-[400px]">
      <div className="p-3 border-b border-slate-700 bg-slate-900/80 flex items-center gap-2">
        <LayersIcon className="w-4 h-4 text-blue-500" />
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex-1">Katmanlar</h3>
        <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full font-bold">
          {thumbnailObjects.length}
        </span>
      </div>
      
      <div className="p-3 overflow-y-auto custom-scrollbar flex-1">
        {thumbnailObjects.length === 0 ? (
          <div className="py-8 px-4 text-center border-2 border-dashed border-slate-700/50 rounded-lg">
            <p className="text-xs text-slate-500">Henüz bir katman yok</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={reversedObjects.map(obj => obj.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-1.5">
                {reversedObjects.map((obj) => (
                  <SortableLayerItem key={obj.id} obj={obj} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};
