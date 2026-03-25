export interface CutSegment {
    id: string;
    start: number; // seconds
    end: number;   // seconds
}

export type LayoutMode = 'crop' | 'scale';
export type TransitionType = 'none' | 'crossfade';

export interface VideoTransform {
    scale: number;
    x: number; // Normalized percentage -100 to 100
    y: number; // Normalized percentage -100 to 100
}

export interface MediaFile {
    id: string;
    path: string; // Native absolute path for desktop or blob URL for web
    name: string;
    type: string;
    size: number;
    file?: File; // In-memory reference to the file object (web)
    syncOffset: number; // Offset relative to master
    isMaster?: boolean;
    isMuted?: boolean;
    transform?: VideoTransform;
    error?: string; // Loading or restoration error message
}

export interface ShortsClip {
    id: string;
    startTime: number;
    endTime: number;
    enableFaceTracker: boolean;
    thumbnail?: string; // Base64 thumbnail for the gallery
}

export interface ShortsConfig {
    isActive: boolean;
    clips: ShortsClip[];
}


