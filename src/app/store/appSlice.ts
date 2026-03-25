import type { StateCreator } from 'zustand';
import type { AppState } from './index';
import type { Project, VideoTransform } from './types';
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
    updateVideoTransform: (id: string, transform: Partial<VideoTransform>) => void;
    hydrateProject: (projectId: string) => Promise<void>;
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
                borderRadius: 0,
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
            borderRadius: 0,
        }));
    },

    switchProject: (id) => {
        get().hydrateProject(id).catch(console.error);
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
            const currentMetadata = {
                videoFiles: get().videoFiles,
                audioFiles: get().audioFiles,
                cuts: get().cuts,
                currentStep: get().currentStep,
                layoutMode: get().layoutMode,
                transitionType: get().transitionType,
                borderRadius: get().borderRadius,
            };

            const projectId = get().currentProjectId;
            if (!projectId) return;

            console.log(`[appSlice] Auto-saving project ${projectId} state...`, currentMetadata);

            set((state) => ({
                projects: state.projects.map(p =>
                    p.id === projectId
                        ? {
                            ...p,
                            lastModified: Date.now(),
                            state: {
                                ...p.state,
                                ...currentMetadata,
                            }
                        }
                        : p
                )
            }));
        }, 1000); // 1-second debounce
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
        get().updateProjectState();
    },

    hydrateProject: async (projectId) => {
        const { projects } = get();
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        // Restore all project state synchronously
        set({
            currentStep: project.state.currentStep || 1,
            cuts: project.state.cuts || [],
            layoutMode: project.state.layoutMode || 'crop',
            transitionType: project.state.transitionType || 'none',
            borderRadius: project.state.borderRadius ?? 0,
            videoFiles: project.state.videoFiles || [],
            audioFiles: project.state.audioFiles || [],
        });
    }
});
