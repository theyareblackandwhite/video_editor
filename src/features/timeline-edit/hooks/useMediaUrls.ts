import { useMemo } from 'react';
import { safeConvertFileSrc } from '../../../shared/utils/tauri';
import type { MediaFile } from '../../../app/store/types';

/**
 * Maps absolute file paths to Tauri asset protocol URLs for browser playback.
 */
export function useMediaUrls(videoFiles: MediaFile[], audioFiles: MediaFile[]) {
    return useMemo(() => {
        const urls: Record<string, string> = {};
        videoFiles.forEach(v => {
            urls[v.id] = safeConvertFileSrc(v.path);
        });
        audioFiles.forEach(a => {
            urls[a.id] = safeConvertFileSrc(a.path);
        });
        return urls;
    }, [videoFiles, audioFiles]);
}
