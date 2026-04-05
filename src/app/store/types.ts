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
    width?: number; // Intrinsic width for layout
    height?: number; // Intrinsic height for layout
    duration?: number; // Total duration in seconds
    error?: string; // Loading or restoration error message
}

export interface FrameFaces {
    time: number;
    faces: { x: number; y: number; w: number; h: number }[];
}

export interface DirectorKeyframe {
    time: number;
    targetFace: { x: number; y: number; w: number; h: number };
}

export interface ShortsClip {
    id: string;
    startTime: number;
    endTime: number;
    enableFaceTracker: boolean;
    enableCaptions: boolean;
    coordinates?: any[]; // Face tracking coordinates (CropCoordinate)
    captionChunks?: any[]; // Transcription results
    assContent?: string; // Generated ASS subtitle content
    thumbnail?: string; // Base64 thumbnail
    frameFacesCache?: FrameFaces[]; // Cached multi-face analysis
    directorKeyframes?: DirectorKeyframe[]; // User tracked keyframes
}

export interface ShortsConfig {
    isActive: boolean;
    enableCaptions?: boolean;
    enableFaceTracker?: boolean;
    startTime?: number;
    endTime?: number;
    clips: ShortsClip[];
}


