import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';
import { isTauri } from '../../../shared/utils/tauri';
import { validateFileSize, type FileSizeValidation } from '../../../shared/utils/fileValidation';
import type { MediaFile } from '../../../app/store/types';

interface UseFilePickerOptions {
    accept: Record<string, string[]>;
    type: 'video' | 'audio';
    multiple?: boolean;
}

export type PickedFile = Omit<MediaFile, 'id' | 'syncOffset' | 'isMaster'>;

interface UseFilePickerReturn {
    pickFile: () => Promise<PickedFile | null>;
    isLoading: boolean;
    error: string | null;
    warning: string | null;
}

export const useFilePicker = ({ accept, type }: UseFilePickerOptions): UseFilePickerReturn => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    const applyValidation = (size: number): FileSizeValidation => {
        const result = validateFileSize(size, type);
        setWarning(result.warning ?? null);
        if (!result.ok) {
            setError(result.error ?? 'Dosya boyutu sınırı aşıldı.');
        }
        return result;
    };

    const pickFile = async (): Promise<PickedFile | null> => {
        setIsLoading(true);
        setError(null);
        setWarning(null);
        console.log(`[useFilePicker] Picking ${type} file...`);
        
        try {
            if (isTauri()) {
                const extensions = Object.values(accept).flat().map(ext => ext.replace('.', ''));
                const selected = await open({
                    multiple: false,
                    filters: [{
                        name: type === 'video' ? 'Video Dosyaları' : 'Ses Dosyaları',
                        extensions
                    }]
                });

                if (selected) {
                    const path = Array.isArray(selected) ? selected[0] : selected;
                    if (typeof path !== 'string') return null;

                    let size = 0;
                    try {
                        const fileStat = await stat(path);
                        size = fileStat.size || 0;
                    } catch (statErr) {
                        console.warn(`[useFilePicker] Could not get file size:`, statErr);
                    }
                    
                    const name = path.split(/[/\\]/).pop() || 'unknown';
                    const ext = name.split('.').pop()?.toLowerCase() || '';
                    const mimeType = type === 'video' ? `video/${ext === 'mkv' ? 'x-matroska' : ext}` : `audio/${ext}`;

                    if (size > 0) applyValidation(size);
                    return { path, name, size, type: mimeType };
                }
            } else {
                // WEB FALLBACK
                return new Promise((resolve) => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    const acceptString = Object.keys(accept).join(',');
                    input.accept = acceptString;
                    
                    input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            const validation = applyValidation(file.size);
                            if (!validation.ok) {
                                resolve(null);
                                return;
                            }
                            
                            // Create a Blob URL so it can be played/fetched in the browser
                            const path = URL.createObjectURL(file);
                            resolve({
                                path,
                                name: file.name,
                                size: file.size,
                                type: file.type || (type === 'video' ? 'video/mp4' : 'audio/mpeg'),
                                file // Return the actual file object for persistence
                            });
                        } else {
                            resolve(null);
                        }
                    };
                    
                    input.oncancel = () => resolve(null);
                    input.click();
                });
            }
        } catch (err: unknown) {
            console.error(`[useFilePicker] Error during pick:`, err);
            if (err instanceof Error) {
                setError(err.message || 'Dosya seçilirken hata oluştu');
            }
        } finally {
            setIsLoading(false);
        }
        return null;
    };

    return { pickFile, isLoading, error, warning };
};
