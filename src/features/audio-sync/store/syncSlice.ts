import type { StateCreator } from 'zustand';
import type { AppState } from '../../../app/store';

export interface SyncSlice {
    setVideoSyncOffset: (id: string, offset: number) => void;
    setAudioSyncOffset: (id: string, offset: number) => void;
    setVideoMuted: (id: string, isMuted: boolean) => void;
    setAudioMuted: (id: string, isMuted: boolean) => void;
}

export const createSyncSlice: StateCreator<AppState, [], [], SyncSlice> = (set, get) => ({
    setVideoSyncOffset: (id, offset) => {
        set((state) => ({
            videoFiles: state.videoFiles.map(f => f.id === id ? { ...f, syncOffset: offset } : f)
        }));
        get().updateProjectState();
    },

    setAudioSyncOffset: (id, offset) => {
        set((state) => ({
            audioFiles: state.audioFiles.map(f => f.id === id ? { ...f, syncOffset: offset } : f)
        }));
        get().updateProjectState();
    },

    setVideoMuted: (id, isMuted) => {
        set((state) => ({
            videoFiles: state.videoFiles.map(f => f.id === id ? { ...f, isMuted } : f)
        }));
        get().updateProjectState();
    },

    setAudioMuted: (id, isMuted) => {
        set((state) => ({
            audioFiles: state.audioFiles.map(f => f.id === id ? { ...f, isMuted } : f)
        }));
        get().updateProjectState();
    },
});
