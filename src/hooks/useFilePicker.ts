import { useState } from 'react';
import { validateFileSize, type FileSizeValidation } from '../utils/fileValidation';

interface UseFilePickerOptions {
    accept: Record<string, string[]>;
    type: 'video' | 'audio';
    multiple?: boolean;
}

interface UseFilePickerReturn {
    pickFile: () => Promise<File | null>;
    isLoading: boolean;
    error: string | null;
    warning: string | null;
}

export const useFilePicker = ({ accept, type }: UseFilePickerOptions): UseFilePickerReturn => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    const applyValidation = (file: File): FileSizeValidation => {
        const result = validateFileSize(file, type);
        setWarning(result.warning ?? null);
        if (!result.ok) {
            setError(result.error ?? 'Dosya boyutu sınırı aşıldı.');
        }
        return result;
    };

    const pickFile = async (): Promise<File | null> => {
        setIsLoading(true);
        setError(null);
        setWarning(null);
        try {
            // Check if File System Access API is supported
            if ('showOpenFilePicker' in window) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const handles = await (window as any).showOpenFilePicker({
                        types: [
                            {
                                description: 'Media Files',
                                accept: accept,
                            },
                        ],
                        multiple: false,
                    });

                    if (handles && handles.length > 0) {
                        const file = await handles[0].getFile();
                        const validation = applyValidation(file);
                        if (!validation.ok) return null;
                        return file;
                    }
                } catch (err: unknown) {
                    // User cancelled or other error
                    if (err instanceof Error && err.name !== 'AbortError') {
                        console.error("File System Access API error:", err);
                        throw err;
                    }
                    return null;
                }
            } else {
                // Fallback to standard input
                return new Promise((resolve) => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = Object.values(accept).flat().join(',');

                    input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files && files.length > 0) {
                            const file = files[0];
                            const validation = applyValidation(file);
                            if (!validation.ok) {
                                resolve(null);
                                return;
                            }
                            resolve(file);
                        } else {
                            resolve(null);
                        }
                    };
                    input.click();
                });
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== 'AbortError') {
                setError(err.message || 'Error selecting file');
            }
        } finally {
            setIsLoading(false);
        }
        return null;
    };

    return { pickFile, isLoading, error, warning };
};
