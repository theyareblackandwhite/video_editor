import type { StateCreator } from 'zustand';
import type { AppState } from './index';
import type { Project, VideoTransform, ShortsConfig } from './types';
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
    updateProjectState: (immediate?: boolean) => void;
    updateVideoTransform: (id: string, transform: Partial<VideoTransform>) => void;
    shortsConfig?: ShortsConfig;
    setShortsConfig: (config: Partial<ShortsConfig>) => void;
    hydrateProject: (projectId: string) => Promise<void>;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const createAppSlice: StateCreator<AppState, [], [], AppSlice> = (set, get) => ({
    currentStep: 1,
    setStep: (step) => {
        set({ currentStep: step });
        get().updateProjectState(true);
    },

    shortsConfig: undefined,
    setShortsConfig: (config) => {
        set((state) => ({
            shortsConfig: state.shortsConfig ? { ...state.shortsConfig, ...config } : { isActive: false, startTime: 0, endTime: 60, enableFaceTracker: true, ...config }
        }));
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
                shortsConfig: { isActive: false, startTime: 0, endTime: 60, enableFaceTracker: true }
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
                        shortsConfig: nextProject.state.shortsConfig,
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
                        shortsConfig: undefined,
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

    updateProjectState: (immediate = false) => {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }

        const save = () => {
            const currentMetadata = {
                videoFiles: get().videoFiles,
                audioFiles: get().audioFiles,
                cuts: get().cuts,
                currentStep: get().currentStep,
                layoutMode: get().layoutMode,
                transitionType: get().transitionType,
                shortsConfig: get().shortsConfig,
            };

            const projectId = get().currentProjectId;
            if (!projectId) return;

            console.log(`[appSlice] ${immediate ? 'Immediate' : 'Auto-saving'} project ${projectId} state...`, currentMetadata);

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
        };

        if (immediate) {
            save();
        } else {
            saveTimeout = setTimeout(save, 1000); // 1-second debounce
        }
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

        console.log(`[appSlice] Hydrating project ${projectId} with binary restoration...`);

        // Create a copy of storage metadata while restoring actual File objects from IndexedDB
        const restoredVideoFiles: typeof project.state.videoFiles = [];
        for (const vf of project.state.videoFiles) {
            const file = await mediaStorage.getMediaFile(vf.id);
            if (file) {
                // If we restored a file, we MUST regenerate the blob URL because the old one is revoked/invalid
                const path = URL.createObjectURL(file);
                restoredVideoFiles.push({ ...vf, file, path });
            } else {
                console.warn(`[appSlice] Could not restore video file content for ${vf.id}`);
                restoredVideoFiles.push(vf);
            }
        }

        const restoredAudioFiles: typeof project.state.audioFiles = [];
        for (const af of project.state.audioFiles) {
            const file = await mediaStorage.getMediaFile(af.id);
            if (file) {
                const path = URL.createObjectURL(file);
                restoredAudioFiles.push({ ...af, file, path });
            } else {
                console.warn(`[appSlice] Could not restore audio file content for ${af.id}`);
                restoredAudioFiles.push(af);
            }
        }

        // Restore all project state
        set({
            currentStep: project.state.currentStep || 1,
            cuts: project.state.cuts || [],
            layoutMode: project.state.layoutMode || 'crop',
            transitionType: project.state.transitionType || 'none',
            videoFiles: restoredVideoFiles,
            audioFiles: restoredAudioFiles,
            shortsConfig: project.state.shortsConfig,
        });

        console.log(`[appSlice] Project ${projectId} hydrated successfully.`);
    }
});
