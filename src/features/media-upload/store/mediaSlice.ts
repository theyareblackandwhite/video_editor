import type { StateCreator } from 'zustand';
import type { AppState } from '../../../app/store';
import type { MediaFile } from '../../../app/store/types';

export interface MediaSlice {
    videoFiles: MediaFile[];
    audioFiles: MediaFile[];

    addVideoFile: (file: File) => void;
    removeVideoFile: (id: string) => void;
    setMasterVideo: (id: string) => void;

    addAudioFile: (file: File) => void;
    removeAudioFile: (id: string) => void;
}

export const createMediaSlice: StateCreator<AppState, [], [], MediaSlice> = (set) => ({
    videoFiles: [],
    audioFiles: [],

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

    addAudioFile: (file) => set((state) => {
        const id = Math.random().toString(36).substring(7);
        return { audioFiles: [...state.audioFiles, { id, file, syncOffset: 0 }] };
    }),

    removeAudioFile: (id) => set((state) => ({
        audioFiles: state.audioFiles.filter(f => f.id !== id)
    })),
});
