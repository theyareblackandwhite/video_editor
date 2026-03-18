import React, { useState, useCallback } from 'react';
import type { CutSegment } from '../../../app/store/types';

interface UseCutDragOptions {
    duration: number;
    setCuts: (cuts: CutSegment[]) => void;
    cutsRef: React.MutableRefObject<CutSegment[]>;
    waveScrollWidth: number;
}

export function useCutDrag({
    duration,
    setCuts,
    cutsRef,
    waveScrollWidth,
}: UseCutDragOptions) {
    const [dragging, setDragging] = useState<{ cutId: string; edge: 'start' | 'end' } | null>(null);

    const handleEdgeDrag = useCallback((e: React.MouseEvent, cutId: string, edge: 'start' | 'end') => {
        e.stopPropagation();
        e.preventDefault();
        const cut = cutsRef.current.find(c => c.id === cutId);
        if (!cut) return;

        const totalPx = waveScrollWidth || 1;
        const startX = e.clientX;
        const origStart = cut.start;
        const origEnd = cut.end;
        const MIN_DUR = 0.05;

        setDragging({ cutId, edge });
        document.body.style.cursor = 'col-resize';

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const dt = (dx / totalPx) * duration;
            setCuts(cutsRef.current.map(c => {
                if (c.id !== cutId) return c;
                if (edge === 'start') {
                    return { ...c, start: Math.max(0, Math.min(origEnd - MIN_DUR, origStart + dt)) };
                } else {
                    return { ...c, end: Math.min(duration, Math.max(origStart + MIN_DUR, origEnd + dt)) };
                }
            }));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            setDragging(null);
            document.body.style.cursor = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [duration, setCuts, cutsRef, waveScrollWidth]);

    return { dragging, handleEdgeDrag };
}
