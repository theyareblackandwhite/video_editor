import { useRef, useState, useCallback, useMemo } from 'react';
import type { CutSegment } from '../../../app/store/types';
import { uid } from '../utils/timeFormat';

interface UseCutOperationsOptions {
    cuts: CutSegment[];
    setCuts: (cuts: CutSegment[]) => void;
    currentTime: number;
    duration: number;
    seekTo: (t: number) => void;
}

export function useCutOperations({
    cuts,
    setCuts,
    currentTime,
    duration,
    seekTo,
}: UseCutOperationsOptions) {
    const [markIn, setMarkIn] = useState<number | null>(null);
    const [selectedCut, setSelectedCut] = useState<string | null>(null);

    /* ref to always access latest cuts during drag (avoids stale closure) */
    const cutsRef = useRef(cuts);
    cutsRef.current = cuts;

    /* ── mark in / cut out ── */
    const handleMarkIn = useCallback(() => setMarkIn(prev => prev !== null ? null : currentTime), [currentTime]);

    const handleCutOut = useCallback(() => {
        if (markIn === null) return;
        const start = Math.min(markIn, currentTime);
        const end = Math.max(markIn, currentTime);
        if (end - start < 0.1) return;

        setCuts([...cuts, { id: uid(), start, end }]);
        setMarkIn(null);
    }, [markIn, currentTime, cuts, setCuts]);

    const removeCut = useCallback((id: string) => {
        setCuts(cuts.filter(c => c.id !== id));
        if (selectedCut === id) setSelectedCut(null);
    }, [cuts, setCuts, selectedCut]);

    const jumpToCut = (cut: CutSegment) => {
        setSelectedCut(cut.id);
        seekTo(cut.start);
    };

    /* ── nudge a cut edge by delta seconds ── */
    const nudgeCutEdge = useCallback((cutId: string, edge: 'start' | 'end', delta: number) => {
        setCuts(cutsRef.current.map(c => {
            if (c.id !== cutId) return c;
            const MIN_DUR = 0.05;
            if (edge === 'start') {
                const newStart = Math.max(0, Math.min(c.end - MIN_DUR, c.start + delta));
                return { ...c, start: newStart };
            } else {
                const newEnd = Math.min(duration, Math.max(c.start + MIN_DUR, c.end + delta));
                return { ...c, end: newEnd };
            }
        }));
    }, [duration, setCuts]);

    /* ── sorted cuts ── */
    const sortedCuts = useMemo(() =>
        [...cuts].sort((a, b) => a.start - b.start),
        [cuts]
    );

    return {
        markIn,
        selectedCut,
        setSelectedCut,
        cutsRef,
        handleMarkIn,
        handleCutOut,
        removeCut,
        jumpToCut,
        nudgeCutEdge,
        sortedCuts,
    };
}
