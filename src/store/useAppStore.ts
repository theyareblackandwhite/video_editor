import { create } from 'zustand';

export interface CutSegment {
    id: string;
    start: number; // seconds
    end: number;   // seconds
}

export type LayoutMode = 'crop' | 'scale';
export type TransitionType = 'none' | 'crossfade';

export interface MediaFile {
    id: string;
    file: File;
    syncOffset: number; // Offset relative to master
    isMaster?: boolean;
}

interface AppState {
    currentStep: number;
    videoFiles: MediaFile[];
    audioFiles: MediaFile[];
    cuts: CutSegment[];
    layoutMode: LayoutMode;
    transitionType: TransitionType;

    setStep: (step: number) => void;

    // File Management
    addVideoFile: (file: File) => void;
    removeVideoFile: (id: string) => void;
    setMasterVideo: (id: string) => void;
    setVideoSyncOffset: (id: string, offset: number) => void;

    addAudioFile: (file: File) => void;
    removeAudioFile: (id: string) => void;
    setAudioSyncOffset: (id: string, offset: number) => void;

    // Editing & Config
    setCuts: (cuts: CutSegment[]) => void;
    setLayoutMode: (mode: LayoutMode) => void;
    setTransitionType: (type: TransitionType) => void;
}

export const useAppStore = create<AppState>((set) => ({
    currentStep: 1,
    videoFiles: [],
    audioFiles: [],
    cuts: [],
    layoutMode: 'crop',
    transitionType: 'none',

    setStep: (step) => set({ currentStep: step }),

    addVideoFile: (file) => set((state) => {
        const id = Math.random().toString(36).substring(7);
        const newFiles = [...state.videoFiles, { id, file, syncOffset: 0, isMaster: state.videoFiles.length === 0 }];
        return { videoFiles: newFiles };
    }),

    removeVideoFile: (id) => set((state) => {
        const remaining = state.videoFiles.filter(f => f.id !== id);
        // Ensure there's always one master if files remain
        if (remaining.length > 0 && !remaining.some(f => f.isMaster)) {
            remaining[0].isMaster = true;
        }
        return { videoFiles: remaining };
    }),

    setMasterVideo: (id) => set((state) => ({
        videoFiles: state.videoFiles.map(f => ({ ...f, isMaster: f.id === id }))
    })),

    setVideoSyncOffset: (id, offset) => set((state) => ({
        videoFiles: state.videoFiles.map(f => f.id === id ? { ...f, syncOffset: offset } : f)
    })),

    addAudioFile: (file) => set((state) => {
        const id = Math.random().toString(36).substring(7);
        return { audioFiles: [...state.audioFiles, { id, file, syncOffset: 0 }] };
    }),

    removeAudioFile: (id) => set((state) => ({
        audioFiles: state.audioFiles.filter(f => f.id !== id)
    })),

    setAudioSyncOffset: (id, offset) => set((state) => ({
        audioFiles: state.audioFiles.map(f => f.id === id ? { ...f, syncOffset: offset } : f)
    })),

    setCuts: (cuts) => set({ cuts }),
    setLayoutMode: (layoutMode) => set({ layoutMode }),
    setTransitionType: (transitionType) => set({ transitionType }),
}));
