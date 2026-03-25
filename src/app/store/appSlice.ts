import type { StateCreator } from 'zustand';
import type { AppState } from './index';
import type { VideoTransform, ShortsConfig } from './types';
import { mediaStorage } from './mediaStorage';

export interface AppSlice {
    currentStep: number;
    setStep: (step: number) => void;

    resetSession: () => void;
    updateVideoTransform: (id: string, transform: Partial<VideoTransform>) => void;
    shortsConfig?: ShortsConfig;
    setShortsConfig: (config: Partial<ShortsConfig>) => void;
    hydrateSession: () => Promise<void>;
}

export const createAppSlice: StateCreator<AppState, [], [], AppSlice> = (set, get) => ({
    currentStep: 1,
    setStep: (step) => {
        set({ currentStep: step });
    },

    shortsConfig: undefined,
    setShortsConfig: (config) => {
        set((state) => ({
            shortsConfig: state.shortsConfig ? { ...state.shortsConfig, ...config } : { isActive: false, clips: [], ...config }
        }));
    },

    resetSession: () => {
        // Clear all media from IndexedDB
        const { videoFiles, audioFiles } = get();
        [...videoFiles, ...audioFiles].forEach(f => {
            mediaStorage.deleteMediaFile(f.id).catch(console.error);
        });

        set({
            currentStep: 1,
            videoFiles: [],
            audioFiles: [],
            cuts: [],
            layoutMode: 'crop',
            transitionType: 'none',
            shortsConfig: { isActive: false, clips: [] }
        });
    },

    updateVideoTransform: (id, transform) => {
        set((state) => ({
            videoFiles: state.videoFiles.map(f => {
                if (f.id === id) {
                    const currentTransform = f.transform || { scale: 1, x: 0, y: 0 };
                    return {
                        ...f,
                        transform: {
                            ...currentTransform,
                            ...transform,
                        }
                    };
                }
                return f;
            })
        }));
    },

    hydrateSession: async () => {
        const state = get();
        if (state.videoFiles.length === 0 && state.audioFiles.length === 0) return;

        console.log(`[appSlice] Hydrating session with binary restoration...`);

        // Restore actual File objects from IndexedDB
        const restoredVideoFiles: typeof state.videoFiles = [];
        for (const vf of state.videoFiles) {
            const file = await mediaStorage.getMediaFile(vf.id);
            if (file) {
                const path = URL.createObjectURL(file);
                restoredVideoFiles.push({ ...vf, file, path, error: undefined });
            } else {
                console.warn(`[appSlice] Could not restore video file content for ${vf.id}`);
                restoredVideoFiles.push({ ...vf, error: 'restoration_failed' });
            }
        }

        const restoredAudioFiles: typeof state.audioFiles = [];
        for (const af of state.audioFiles) {
            const file = await mediaStorage.getMediaFile(af.id);
            if (file) {
                const path = URL.createObjectURL(file);
                restoredAudioFiles.push({ ...af, file, path, error: undefined });
            } else {
                console.warn(`[appSlice] Could not restore audio file content for ${af.id}`);
                restoredAudioFiles.push({ ...af, error: 'restoration_failed' });
            }
        }

        set({
            videoFiles: restoredVideoFiles,
            audioFiles: restoredAudioFiles,
        });

        console.log(`[appSlice] Session hydrated successfully.`);
    }
});
