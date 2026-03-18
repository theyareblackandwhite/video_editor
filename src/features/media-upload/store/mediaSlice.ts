import type { StateCreator } from 'zustand';
import type { AppState } from '../../../app/store';
import type { MediaFile } from '../../../app/store/types';
import { mediaStorage } from '../../../app/store/mediaStorage';

export interface MediaSlice {
    videoFiles: MediaFile[];
    audioFiles: MediaFile[];
    isHydratingMedia: boolean;

    addVideoFile: (file: File) => Promise<void>;
    removeVideoFile: (id: string) => Promise<void>;
    setMasterVideo: (id: string) => void;

    addAudioFile: (file: File) => Promise<void>;
    removeAudioFile: (id: string) => Promise<void>;

    hydrateMediaFiles: (projectId: string) => Promise<void>;
}

export const createMediaSlice: StateCreator<AppState, [], [], MediaSlice> = (set, get) => ({
    videoFiles: [],
    audioFiles: [],
    isHydratingMedia: false,

    addVideoFile: async (file) => {
        const id = crypto.randomUUID();
        await mediaStorage.saveMediaFile(id, file);
        set((state) => {
            const newFiles = [...state.videoFiles, { id, file, syncOffset: 0, isMaster: state.videoFiles.length === 0 }];
            return { videoFiles: newFiles };
        });
        get().updateProjectState();
    },

    removeVideoFile: async (id) => {
        await mediaStorage.deleteMediaFile(id);
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

    addAudioFile: async (file) => {
        const id = crypto.randomUUID();
        await mediaStorage.saveMediaFile(id, file);
        set((state) => {
            return { audioFiles: [...state.audioFiles, { id, file, syncOffset: 0 }] };
        });
        get().updateProjectState();
    },

    removeAudioFile: async (id) => {
        await mediaStorage.deleteMediaFile(id);
        set((state) => ({
            audioFiles: state.audioFiles.filter(f => f.id !== id)
        }));
        get().updateProjectState();
    },

    hydrateMediaFiles: async (projectId: string) => {
        set({ isHydratingMedia: true });
        try {
            const state = get();
            const project = state.projects.find(p => p.id === projectId);
            if (!project) return;

            const loadedVideoFiles: MediaFile[] = [];
            for (const meta of project.state.videoFiles) {
                const file = await mediaStorage.getMediaFile(meta.id);
                if (file) {
                    loadedVideoFiles.push({
                        id: meta.id,
                        file,
                        syncOffset: meta.syncOffset,
                        isMaster: meta.isMaster
                    });
                }
            }

            const loadedAudioFiles: MediaFile[] = [];
            for (const meta of project.state.audioFiles) {
                const file = await mediaStorage.getMediaFile(meta.id);
                if (file) {
                    loadedAudioFiles.push({
                        id: meta.id,
                        file,
                        syncOffset: meta.syncOffset,
                    });
                }
            }

            set({
                videoFiles: loadedVideoFiles,
                audioFiles: loadedAudioFiles,
            });
        } finally {
            set({ isHydratingMedia: false });
        }
    }
});
