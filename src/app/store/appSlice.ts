import type { StateCreator } from 'zustand';
import type { AppState } from './index';
import type { Project } from './types';
import { mediaStorage } from './mediaStorage';

export interface AppSlice {
    currentStep: number;
    setStep: (step: number) => void;

    projects: Project[];
    currentProjectId: string | null;

    createProject: (name: string) => void;
    switchProject: (id: string) => void;
    deleteProject: (id: string) => void;
    renameProject: (id: string, newName: string) => void;
    updateProjectState: () => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const createAppSlice: StateCreator<AppState, [], [], AppSlice> = (set, get) => ({
    currentStep: 1,
    setStep: (step) => {
        set({ currentStep: step });
        get().updateProjectState();
    },

    projects: [],
    currentProjectId: null,

    createProject: (name) => {
        const id = crypto.randomUUID();
        const newProject: Project = {
            id,
            name,
            lastModified: Date.now(),
            state: {
                currentStep: 1,
                videoFiles: [],
                audioFiles: [],
                cuts: [],
                layoutMode: 'crop',
                transitionType: 'none',
            }
        };

        set((state) => ({
            projects: [...state.projects, newProject],
            currentProjectId: id,
            currentStep: 1,
            videoFiles: [],
            audioFiles: [],
            cuts: [],
            layoutMode: 'crop',
            transitionType: 'none',
        }));
    },

    switchProject: (id) => {
        const { projects } = get();
        const project = projects.find(p => p.id === id);
        if (!project) return;

        // Note: the actual files (File/Blob objects) will be hydrated by a helper asynchronously
        // Here we just set the metadata and other primitive state. The helper will listen and hydrate mediaFiles.
        set({
            currentProjectId: id,
            currentStep: project.state.currentStep,
            cuts: project.state.cuts,
            layoutMode: project.state.layoutMode,
            transitionType: project.state.transitionType,
            // We clear files temporarily while hydration happens
            videoFiles: [],
            audioFiles: [],
        });
    },

    deleteProject: (id) => {
        const state = get();
        const projectToDelete = state.projects.find(p => p.id === id);

        if (projectToDelete) {
            // Delete media files from IndexedDB asynchronously to avoid storage leaks
            const allMediaIds = [
                ...projectToDelete.state.videoFiles.map(f => f.id),
                ...projectToDelete.state.audioFiles.map(f => f.id)
            ];

            Promise.all(allMediaIds.map(mediaId => mediaStorage.deleteMediaFile(mediaId)))
                .catch(err => console.error("Failed to delete project media files:", err));
        }

        set((state) => {
            const newProjects = state.projects.filter(p => p.id !== id);

            if (state.currentProjectId === id) {
                // If we deleted the active project, switch to the first available one, or null
                const nextProject = newProjects.length > 0 ? newProjects[0] : null;

                if (nextProject) {
                    return {
                        projects: newProjects,
                        currentProjectId: nextProject.id,
                        currentStep: nextProject.state.currentStep,
                        cuts: nextProject.state.cuts,
                        layoutMode: nextProject.state.layoutMode,
                        transitionType: nextProject.state.transitionType,
                        videoFiles: [],
                        audioFiles: [],
                    };
                } else {
                    return {
                        projects: newProjects,
                        currentProjectId: null,
                        currentStep: 1,
                        cuts: [],
                        layoutMode: 'crop',
                        transitionType: 'none',
                        videoFiles: [],
                        audioFiles: [],
                    };
                }
            }
            return { projects: newProjects };
        });
    },

    renameProject: (id, newName) => {
        set((state) => ({
            projects: state.projects.map(p => p.id === id ? { ...p, name: newName, lastModified: Date.now() } : p)
        }));
    },

    updateProjectState: () => {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }

        saveTimeout = setTimeout(() => {
            const state = get();
            if (!state.currentProjectId) return;

            const videoFilesMeta = state.videoFiles.map(f => ({
                id: f.id,
                name: f.file.name,
                type: f.file.type,
                size: f.file.size,
                syncOffset: f.syncOffset,
                isMaster: f.isMaster
            }));

            const audioFilesMeta = state.audioFiles.map(f => ({
                id: f.id,
                name: f.file.name,
                type: f.file.type,
                size: f.file.size,
                syncOffset: f.syncOffset,
            }));

            set((state) => ({
                projects: state.projects.map(p =>
                    p.id === state.currentProjectId
                        ? {
                            ...p,
                            lastModified: Date.now(),
                            state: {
                                currentStep: state.currentStep,
                                videoFiles: videoFilesMeta,
                                audioFiles: audioFilesMeta,
                                cuts: state.cuts,
                                layoutMode: state.layoutMode,
                                transitionType: state.transitionType,
                            }
                        }
                        : p
                )
            }));
        }, 1000); // 1-second debounce
    }
});
