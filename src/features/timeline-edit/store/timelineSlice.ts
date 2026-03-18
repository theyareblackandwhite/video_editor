import type { StateCreator } from 'zustand';
import type { AppState } from '../../../app/store';
import type { CutSegment, LayoutMode, TransitionType } from '../../../app/store/types';

export interface TimelineSlice {
    cuts: CutSegment[];
    layoutMode: LayoutMode;
    transitionType: TransitionType;

    setCuts: (cuts: CutSegment[]) => void;
    setLayoutMode: (mode: LayoutMode) => void;
    setTransitionType: (type: TransitionType) => void;
}

export const createTimelineSlice: StateCreator<AppState, [], [], TimelineSlice> = (set) => ({
    cuts: [],
    layoutMode: 'crop',
    transitionType: 'none',

    setCuts: (cuts) => set({ cuts }),
    setLayoutMode: (layoutMode) => set({ layoutMode }),
    setTransitionType: (transitionType) => set({ transitionType }),
});
