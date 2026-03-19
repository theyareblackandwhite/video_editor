/**
 * Common formatting utilities.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Format bytes into a human-readable string (KB / MB / GB).
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < MB) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }
    if (bytes < GB) {
        return `${(bytes / MB).toFixed(1)} MB`;
    }
    return `${(bytes / GB).toFixed(2)} GB`;
}

/**
 * Format seconds into M:SS format.
 */
export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
