import { useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { MediaFile } from '../../../app/store/types';

/**
 * Maps absolute file paths to Tauri asset protocol URLs for browser playback.
 */
export function useMediaUrls(videoFiles: MediaFile[], audioFiles: MediaFile[]) {
    return useMemo(() => {
        const urls: Record<string, string> = {};
        videoFiles.forEach(v => {
            urls[v.id] = convertFileSrc(v.path);
        });
        audioFiles.forEach(a => {
            urls[a.id] = convertFileSrc(a.path);
        });
        return urls;
    }, [videoFiles, audioFiles]);
}
