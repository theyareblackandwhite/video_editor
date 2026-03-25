import type { StateCreator } from 'zustand';
import type { AppState } from '../../../app/store';
import type { CutSegment, LayoutMode, TransitionType } from '../../../app/store/types';

export interface TimelineSlice {
    cuts: CutSegment[];
    layoutMode: LayoutMode;
    transitionType: TransitionType;
    borderRadius: number; // px, 0 = sharp corners

    setCuts: (cuts: CutSegment[]) => void;
    setLayoutMode: (mode: LayoutMode) => void;
    setTransitionType: (type: TransitionType) => void;
    setBorderRadius: (r: number) => void;
}

export const createTimelineSlice: StateCreator<AppState, [], [], TimelineSlice> = (set, get) => ({
    cuts: [],
    layoutMode: 'crop',
    transitionType: 'none',
    borderRadius: 0,

    setCuts: (cuts) => {
        set({ cuts });
        get().updateProjectState();
    },
    setLayoutMode: (layoutMode) => {
        set({ layoutMode });
        get().updateProjectState();
    },
    setTransitionType: (transitionType) => {
        set({ transitionType });
        get().updateProjectState();
    },
    setBorderRadius: (borderRadius) => {
        set({ borderRadius });
        get().updateProjectState();
    },
});
