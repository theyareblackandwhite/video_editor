import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../index';

vi.mock('idb-keyval', () => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    clear: vi.fn(),
    keys: vi.fn(),
}));

describe('useAppStore', () => {
    beforeEach(() => {
        // Reset the store state before each test
        const { setState } = useAppStore;
        setState({
            currentStep: 1,
            videoFiles: [],
            audioFiles: [],
            cuts: [],
            layoutMode: 'crop',
            transitionType: 'none',
        });
    });

    it('has correct initial state', () => {
        const state = useAppStore.getState();
        expect(state.currentStep).toBe(1);
        expect(state.videoFiles).toEqual([]);
        expect(state.audioFiles).toEqual([]);
        expect(state.cuts).toEqual([]);
        expect(state.layoutMode).toBe('crop');
        expect(state.transitionType).toBe('none');
    });

    it('setStep updates currentStep', () => {
        useAppStore.getState().setStep(3);
        expect(useAppStore.getState().currentStep).toBe(3);
    });

    it('handles video files', async () => {
        const mockVideo = { path: '/test.mp4', name: 'test.mp4', type: 'video/mp4', size: 1000 };
        await useAppStore.getState().addVideoFile(mockVideo);
        expect(useAppStore.getState().videoFiles[0].path).toBe('/test.mp4');
        expect(useAppStore.getState().videoFiles[0].isMaster).toBe(true);

        const mockVideo2 = { path: '/test2.mp4', name: 'test2.mp4', type: 'video/mp4', size: 2000 };
        await useAppStore.getState().addVideoFile(mockVideo2);
        expect(useAppStore.getState().videoFiles).toHaveLength(2);
        expect(useAppStore.getState().videoFiles[1].isMaster).toBeFalsy();
    });

    it('handles audio files', async () => {
        const mockAudio = { path: '/test.mp3', name: 'test.mp3', type: 'audio/mp3', size: 500 };
        await useAppStore.getState().addAudioFile(mockAudio);
        expect(useAppStore.getState().audioFiles[0].path).toBe('/test.mp3');
    });

    it('setVideoSyncOffset updates syncOffset', async () => {
        await useAppStore.getState().addVideoFile({ path: '/t.mp4', name: 't.mp4', type: 'video/mp4', size: 100 });
        const id = useAppStore.getState().videoFiles[0].id;
        useAppStore.getState().setVideoSyncOffset(id, 1.5);
        expect(useAppStore.getState().videoFiles[0].syncOffset).toBe(1.5);
    });

    it('setCuts stores and retrieves cut array', () => {
        const cuts = [
            { id: 'c1', start: 5, end: 10 },
            { id: 'c2', start: 20, end: 30 },
        ];
        useAppStore.getState().setCuts(cuts);
        expect(useAppStore.getState().cuts).toEqual(cuts);
    });

    it('setCuts replaces previous cuts entirely', () => {
        useAppStore.getState().setCuts([{ id: 'c1', start: 0, end: 5 }]);
        useAppStore.getState().setCuts([{ id: 'c2', start: 10, end: 15 }]);
        const { cuts } = useAppStore.getState();
        expect(cuts).toHaveLength(1);
        expect(cuts[0].id).toBe('c2');
    });

    it('hydrateProject restores all project state to root', async () => {
        const projectId = 'test-project-123';
        const projectCuts = [{ id: 'c1', start: 1, end: 2 }];
        
        // Mock a project in the store
        const project = {
            id: projectId,
            name: 'Test Project',
            lastModified: Date.now(),
            state: {
                currentStep: 3,
                videoFiles: [],
                audioFiles: [],
                cuts: projectCuts,
                layoutMode: 'scale' as const,
                transitionType: 'crossfade' as const,
            }
        };

        useAppStore.setState({ 
            projects: [project], 
            currentProjectId: projectId,
            currentStep: 1,
            cuts: []
        });
        
        // Run hydration
        await useAppStore.getState().hydrateProject(projectId);
        
        const state = useAppStore.getState();
        expect(state.currentStep).toBe(3);
        expect(state.cuts).toEqual(projectCuts);
        expect(state.layoutMode).toBe('scale');
        expect(state.transitionType).toBe('crossfade');
    });
});
