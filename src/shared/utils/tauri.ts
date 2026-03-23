import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Checks if the application is running in a Tauri environment.
 */
export const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

/**
 * Safely converts a file path to a URL that can be loaded by the webview.
 * Provides a fallback for non-Tauri environments (like standard browsers)
 * to prevent crashes.
 */
export function safeConvertFileSrc(path: string): string {
    if (!path) return '';
    
    if (isTauri()) {
        try {
            return convertFileSrc(path);
        } catch (e) {
            console.error('Tauri convertFileSrc failed:', e);
        }
    }
    
    // Fallback for web browser:
    // In a standard browser, absolute filesystem paths won't work anyway,
    // but returning the path is better than throwing an "undefined" error.
    return path;
}
