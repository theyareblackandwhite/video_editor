import { create } from 'zustand';

export interface ThumbnailObject {
  id: string;
  type: 'text' | 'rect' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  text?: string;
  fontSize?: number;
  draggable?: boolean;
  [key: string]: any; // For additional Konva properties
}

interface ThumbnailState {
  thumbnailBackground: string | null; // Base64 image
  thumbnailObjects: ThumbnailObject[];
  selectedObjectId: string | null;

  // Actions
  setThumbnailBackground: (base64: string | null) => void;
  addThumbnailObject: (object: Omit<ThumbnailObject, 'id'>) => void;
  updateThumbnailObject: (id: string, updates: Partial<ThumbnailObject>) => void;
  removeThumbnailObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  moveObjectUp: (id: string) => void;
  moveObjectDown: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  clearThumbnail: () => void;
}

export const useThumbnailStore = create<ThumbnailState>((set) => ({
  thumbnailBackground: null,
  thumbnailObjects: [],
  selectedObjectId: null,

  setThumbnailBackground: (base64) => set({ thumbnailBackground: base64 }),

  addThumbnailObject: (object) => set((state) => {
    const newObject: ThumbnailObject = {
      ...object,
      id: crypto.randomUUID()
    } as ThumbnailObject;
    return {
      thumbnailObjects: [...state.thumbnailObjects, newObject]
    };
  }),

  updateThumbnailObject: (id, updates) => set((state) => ({
    thumbnailObjects: state.thumbnailObjects.map((obj) =>
      obj.id === id ? { ...obj, ...updates } : obj
    )
  })),

  removeThumbnailObject: (id) => set((state) => ({
    thumbnailObjects: state.thumbnailObjects.filter((obj) => obj.id !== id),
    selectedObjectId: state.selectedObjectId === id ? null : state.selectedObjectId
  })),

  selectObject: (id) => set({ selectedObjectId: id }),

  moveObjectUp: (id) => set((state) => {
    const index = state.thumbnailObjects.findIndex(obj => obj.id === id);
    if (index === -1 || index === state.thumbnailObjects.length - 1) return state;
    const newObjects = [...state.thumbnailObjects];
    [newObjects[index], newObjects[index + 1]] = [newObjects[index + 1], newObjects[index]];
    return { thumbnailObjects: newObjects };
  }),

  moveObjectDown: (id) => set((state) => {
    const index = state.thumbnailObjects.findIndex(obj => obj.id === id);
    if (index === -1 || index === 0) return state;
    const newObjects = [...state.thumbnailObjects];
    [newObjects[index], newObjects[index - 1]] = [newObjects[index - 1], newObjects[index]];
    return { thumbnailObjects: newObjects };
  }),

  bringToFront: (id) => set((state) => {
    const obj = state.thumbnailObjects.find(o => o.id === id);
    if (!obj) return state;
    const filtered = state.thumbnailObjects.filter(o => o.id !== id);
    return { thumbnailObjects: [...filtered, obj] };
  }),

  sendToBack: (id) => set((state) => {
    const obj = state.thumbnailObjects.find(o => o.id === id);
    if (!obj) return state;
    const filtered = state.thumbnailObjects.filter(o => o.id !== id);
    return { thumbnailObjects: [obj, ...filtered] };
  }),

  clearThumbnail: () => set({
    thumbnailBackground: null,
    thumbnailObjects: [],
    selectedObjectId: null
  })
}));
