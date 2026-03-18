export interface CutSegment {
    id: string;
    start: number; // seconds
    end: number;   // seconds
}

export type LayoutMode = 'crop' | 'scale';
export type TransitionType = 'none' | 'crossfade';

export interface MediaFile {
    id: string;
    file: File;
    syncOffset: number; // Offset relative to master
    isMaster?: boolean;
}
