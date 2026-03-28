import type { StateCreator } from 'zustand';
import type { AppState } from '../../../app/store';
import type { MediaFile } from '../../../app/store/types';
import { mediaStorage } from '../../../app/store/mediaStorage';
import { isTauri } from '../../../shared/utils/tauri';

export interface MediaSlice {
    videoFiles: MediaFile[];
    audioFiles: MediaFile[];

    addVideoFile: (fileInfo: Omit<MediaFile, 'id' | 'syncOffset' | 'isMaster'>) => void;
    removeVideoFile: (id: string) => void;
    setMasterVideo: (id: string) => void;

    addAudioFile: (fileInfo: Omit<MediaFile, 'id' | 'syncOffset'>) => void;
    removeAudioFile: (id: string) => void;
}

export const createMediaSlice: StateCreator<AppState, [], [], MediaSlice> = (set, get) => ({
    videoFiles: [],
    audioFiles: [],

    addVideoFile: (fileInfo) => {
        const id = crypto.randomUUID();
        const { file } = fileInfo;
        
        // Persist to IndexedDB if file is present AND not running in Tauri
        if (file && !isTauri()) {
            mediaStorage.saveMediaFile(id, file).catch(err => console.error("Failed to save video file:", err));
        }

        set((state) => {
            const newFile: MediaFile = { ...fileInfo, id, syncOffset: 0, isMaster: state.videoFiles.length === 0 };
            return { videoFiles: [...state.videoFiles, newFile] };
        });
        get().updateProjectState();
    },

    removeVideoFile: (id) => {
        set((state) => {
            const remaining = state.videoFiles.filter(f => f.id !== id);
            // Ensure there's always one master if files remain
            if (remaining.length > 0 && !remaining.some(f => f.isMaster)) {
                remaining[0].isMaster = true;
            }
            return { videoFiles: remaining };
        });
        get().updateProjectState();
    },

    setMasterVideo: (id) => {
        set((state) => ({
            videoFiles: state.videoFiles.map(f => ({ ...f, isMaster: f.id === id }))
        }));
        get().updateProjectState();
    },

    addAudioFile: (fileInfo) => {
        const id = crypto.randomUUID();
        const { file } = fileInfo;
        
        // Persist to IndexedDB if file is present AND not running in Tauri
        if (file && !isTauri()) {
            mediaStorage.saveMediaFile(id, file).catch(err => console.error("Failed to save audio file:", err));
        }

        set((state) => {
            return { audioFiles: [...state.audioFiles, { ...fileInfo, id, syncOffset: 0 }] };
        });
        get().updateProjectState();
    },

    removeAudioFile: (id) => {
        set((state) => ({
            audioFiles: state.audioFiles.filter(f => f.id !== id)
        }));
        get().updateProjectState();
    }
});
