import React, { useState, useCallback } from 'react';
import type { CutSegment } from '../../../app/store/types';

interface UseCutDragOptions {
    duration: number;
    setCuts: (cuts: CutSegment[]) => void;
    cutsRef: React.MutableRefObject<CutSegment[]>;
    zoom: number; // pixels per second
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useCutDrag({
    duration,
    setCuts,
    cutsRef,
    zoom,
    containerRef,
}: UseCutDragOptions) {
    const [dragging, setDragging] = useState<{ cutId: string; edge: 'start' | 'end' } | null>(null);

    const handleEdgeDrag = useCallback((e: React.MouseEvent, cutId: string, edge: 'start' | 'end') => {
        e.stopPropagation();
        e.preventDefault();

        if (!containerRef.current) return;

        const MIN_DUR = 0.05;
        setDragging({ cutId, edge });
        document.body.style.cursor = 'col-resize';

        const updateTime = (clientX: number) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const scrollLeft = containerRef.current.scrollLeft;
            
            // Calculate absolute x within the full-width timeline
            const x = clientX - rect.left + scrollLeft;
            
            // pixelsToTime
            const newTime = Math.max(0, Math.min(duration, x / zoom));

            setCuts(cutsRef.current.map(c => {
                if (c.id !== cutId) return c;
                if (edge === 'start') {
                    // Start cannot exceed (end - MIN_DUR) and must be >= 0
                    const val = Math.max(0, Math.min(c.end - MIN_DUR, newTime));
                    return { ...c, start: val };
                } else {
                    // End cannot be less than (start + MIN_DUR) and must be <= duration
                    const val = Math.min(duration, Math.max(c.start + MIN_DUR, newTime));
                    return { ...c, end: val };
                }
            }));
        };

        const onMove = (ev: MouseEvent) => {
            requestAnimationFrame(() => updateTime(ev.clientX));
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            setDragging(null);
            document.body.style.cursor = '';
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [duration, setCuts, cutsRef, zoom, containerRef]);

    return { dragging, handleEdgeDrag };
}
