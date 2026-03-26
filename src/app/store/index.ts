import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idbStorage } from './middleware';
import { createAppSlice, type AppSlice } from './appSlice';
import { createMediaSlice, type MediaSlice } from '../../features/media-upload/store/mediaSlice';
import { createSyncSlice, type SyncSlice } from '../../features/audio-sync/store/syncSlice';
import { createTimelineSlice, type TimelineSlice } from '../../features/timeline-edit/store/timelineSlice';
import { stateValidator } from './middleware/stateValidator';

// Re-export types for backward compatibility
export type { CutSegment, LayoutMode, TransitionType, MediaFile } from './types';
export type { AppSlice } from './appSlice';
export type { MediaSlice } from '../../features/media-upload/store/mediaSlice';
export type { SyncSlice } from '../../features/audio-sync/store/syncSlice';
export type { TimelineSlice } from '../../features/timeline-edit/store/timelineSlice';

export type AppState = AppSlice & MediaSlice & SyncSlice & TimelineSlice;

export const useAppStore = create<AppState>()(
    persist(
        stateValidator(
            (...a) => ({
                ...createAppSlice(...a),
                ...createMediaSlice(...a),
                ...createSyncSlice(...a),
                ...createTimelineSlice(...a),
            })
        ),
        {
            name: 'video-editor-storage',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            storage: idbStorage as any,
            partialize: (state) => ({
                currentStep: state.currentStep,
                videoFiles: state.videoFiles.map(f => ({ ...f, file: undefined, path: '' })), // Metadata only
                audioFiles: state.audioFiles.map(f => ({ ...f, file: undefined, path: '' })),
                cuts: state.cuts,
                layoutMode: state.layoutMode,
                transitionType: state.transitionType,
                borderRadius: state.borderRadius,
                shortsConfig: state.shortsConfig,
            }) as any,
        }
    )
);
