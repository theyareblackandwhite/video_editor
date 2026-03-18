import { useRef, useEffect } from 'react';
import type { MediaFile } from '../../../app/store/types';

/**
 * Manages Object URL lifecycle for media files.
 * Creates URLs lazily and revokes them on cleanup.
 */
export function useMediaUrls(videoFiles: MediaFile[], audioFiles: MediaFile[]) {
    const urls = useRef<Record<string, string>>({});

    useEffect(() => {
        const urlMap = urls.current;
        videoFiles.forEach(v => {
            if (!urlMap[v.id]) urlMap[v.id] = URL.createObjectURL(v.file);
        });
        audioFiles.forEach(a => {
            if (!urlMap[a.id]) urlMap[a.id] = URL.createObjectURL(a.file);
        });
        return () => {
            Object.values(urlMap).forEach(url => URL.revokeObjectURL(url));
            urls.current = {};
        };
    }, [videoFiles, audioFiles]);

    return urls;
}
