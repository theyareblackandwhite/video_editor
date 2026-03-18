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
        try {
            const extensions = Object.values(accept).flat().map(ext => ext.replace('.', ''));
            const selected = await open({
                multiple: false,
                filters: [{
                    name: type === 'video' ? 'Video Dosyaları' : 'Ses Dosyaları',
                    extensions
                }]
            });

            if (selected && typeof selected === 'string') {
                const path = selected;
                const fileStat = await stat(path);
                const size = fileStat.size || 0;
                
                const name = path.split(/[/\\]/).pop() || 'unknown';
                
                const ext = name.split('.').pop()?.toLowerCase() || '';
                const mimeType = type === 'video' ? `video/${ext === 'mkv' ? 'x-matroska' : ext}` : `audio/${ext}`;

                const validation = applyValidation(size);
                if (!validation.ok) return null;

                return { path, name, size, type: mimeType };
            }
        } catch (err: unknown) {
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
