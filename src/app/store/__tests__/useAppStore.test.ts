import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../index';

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
        const mockVideo = new File([''], 'test.mp4', { type: 'video/mp4' });
        await useAppStore.getState().addVideoFile(mockVideo);
        expect(useAppStore.getState().videoFiles[0].file).toBe(mockVideo);
        expect(useAppStore.getState().videoFiles[0].isMaster).toBe(true);

        const mockVideo2 = new File([''], 'test2.mp4', { type: 'video/mp4' });
        await useAppStore.getState().addVideoFile(mockVideo2);
        expect(useAppStore.getState().videoFiles).toHaveLength(2);
        expect(useAppStore.getState().videoFiles[1].isMaster).toBeFalsy();
    });

    it('handles audio files', async () => {
        const mockAudio = new File([''], 'test.mp3', { type: 'audio/mp3' });
        await useAppStore.getState().addAudioFile(mockAudio);
        expect(useAppStore.getState().audioFiles[0].file).toBe(mockAudio);
    });

    it('setVideoSyncOffset updates syncOffset', async () => {
        await useAppStore.getState().addVideoFile(new File([''], 't.mp4'));
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
