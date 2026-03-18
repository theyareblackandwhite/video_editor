export interface CutSegment {
    id: string;
    start: number; // seconds
    end: number;   // seconds
}

export type LayoutMode = 'crop' | 'scale';
export type TransitionType = 'none' | 'crossfade';

export interface MediaFile {
    id: string;
    path: string; // Native absolute path for desktop
    name: string;
    type: string;
    size: number;
    syncOffset: number; // Offset relative to master
    isMaster?: boolean;
}

export interface ProjectState {
    currentStep: number;
    videoFiles: MediaFile[];
    audioFiles: MediaFile[];
    cuts: CutSegment[];
    layoutMode: LayoutMode;
    transitionType: TransitionType;
}

export interface Project {
    id: string;
    name: string;
    lastModified: number;
    state: ProjectState;
}
