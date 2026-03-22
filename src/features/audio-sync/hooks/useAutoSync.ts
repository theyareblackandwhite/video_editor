import { useState, useCallback } from 'react';
import { autoSyncFiles } from '../utils/autoSync';
import { type MediaFile } from '../../../app/store/types';

export type SyncPhase = 'idle' | 'processing' | 'done' | 'error';

export interface SyncTargetResult {
    id: string; // The MediaFile ID
    offsetSeconds: number;
    confidence: number;
    error?: string;
}

interface UseAutoSyncReturn {
    phase: SyncPhase;
    progress: number;
    results: SyncTargetResult[];
    error: string | null;
    runSyncMultiple: (master: MediaFile, targets: MediaFile[]) => Promise<void>;
    runMagicSync: (videos: MediaFile[], audios: MediaFile[]) => Promise<void>;
    reset: () => void;
}

export function useAutoSync(): UseAutoSyncReturn {
    const [phase, setPhase] = useState<SyncPhase>('idle');
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<SyncTargetResult[]>([]);
    const [error, setError] = useState<string | null>(null);

    const runSyncMultiple = useCallback(async (master: MediaFile, targets: MediaFile[]) => {
        setPhase('processing');
        setProgress(0);
        setResults([]);
        setError(null);

        try {
            const finalResults: SyncTargetResult[] = [];

            for (let i = 0; i < targets.length; i++) {
                const target = targets[i];
                try {
                    // Update progress proportionally
                    const baseProgress = i / targets.length;
                    const syncResult = await autoSyncFiles(master.path, target.path, (p) => {
                        setProgress(baseProgress + (p / targets.length));
                    });
                    finalResults.push({
                        id: target.id,
                        offsetSeconds: syncResult.offsetSeconds,
                        confidence: syncResult.confidence
                    });
                } catch (err) {
                    console.error(`Failed to sync target ${target.id}:`, err);
                    finalResults.push({
                        id: target.id,
                        offsetSeconds: 0,
                        confidence: 0,
                        error: err instanceof Error ? err.message : 'Sync failed'
                    });
                }
            }

            setResults(finalResults);
            setPhase('done');
            setProgress(1);
        } catch (err) {
            console.error('Auto-sync failed:', err);
            setError(err instanceof Error ? err.message : 'Auto-sync failed');
            setPhase('error');
        }
    }, []);

    const runMagicSync = useCallback(async (videos: MediaFile[], audios: MediaFile[]) => {
        setPhase('processing');
        setProgress(0);
        setResults([]);
        setError(null);

        try {
            const finalResults: SyncTargetResult[] = [];
            const pairsCount = Math.min(videos.length, audios.length);

            for (let i = 0; i < pairsCount; i++) {
                const video = videos[i];
                const audio = audios[i];
                try {
                    const baseProgress = i / pairsCount;
                    const syncResult = await autoSyncFiles(video.path, audio.path, (p) => {
                        setProgress(baseProgress + (p / pairsCount));
                    });
                    finalResults.push({
                        id: audio.id, // Targeting audio for the offset
                        offsetSeconds: syncResult.offsetSeconds,
                        confidence: syncResult.confidence
                    });
                } catch (err) {
                    console.error(`Failed to sync pair ${video.name} & ${audio.name}:`, err);
                    finalResults.push({
                        id: audio.id,
                        offsetSeconds: 0,
                        confidence: 0,
                        error: err instanceof Error ? err.message : 'Sync failed'
                    });
                }
            }

            setResults(finalResults);
            setPhase('done');
            setProgress(1);
        } catch (err) {
            console.error('Magic auto-sync failed:', err);
            setError(err instanceof Error ? err.message : 'Magic auto-sync failed');
            setPhase('error');
        }
    }, []);

    const reset = useCallback(() => {
        setPhase('idle');
        setProgress(0);
        setResults([]);
        setError(null);
    }, []);

    return { phase, progress, results, error, runSyncMultiple, runMagicSync, reset };
}
