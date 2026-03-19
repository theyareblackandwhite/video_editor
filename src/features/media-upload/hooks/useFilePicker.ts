import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';
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
            const extensions = Object.values(accept).flat().map(ext => ext.replace('.', ''));
            console.log(`[useFilePicker] Filters:`, extensions);
            
            const selected = await open({
                multiple: false,
                filters: [{
                    name: type === 'video' ? 'Video Dosyaları' : 'Ses Dosyaları',
                    extensions
                }]
            });

            console.log(`[useFilePicker] Selected file:`, selected);

            if (selected) {
                const path = Array.isArray(selected) ? selected[0] : selected;
                
                if (typeof path !== 'string') {
                    console.error(`[useFilePicker] Invalid path:`, path);
                    return null;
                }

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

                if (size > 0) {
                    const validation = applyValidation(size);
                    if (!validation.ok) {
                        console.error(`[useFilePicker] Size validation failed:`, validation.error);
                        return null;
                    }
                }

                return { path, name, size, type: mimeType };
            } else {
                console.log(`[useFilePicker] Selection cancelled by user.`);
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
