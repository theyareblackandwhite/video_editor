import { useRef, useCallback, useEffect } from 'react';

interface UseDragOffsetOptions {
    audioOffsetRef: React.MutableRefObject<number>;
    offsetTextRef: React.RefObject<HTMLSpanElement | null>;
    zoom: number;
    updateAudioVisualPosition: (offsetTime: number) => void;
    setSyncOffset: (offset: number) => void;
}

export function useDragOffset({
    audioOffsetRef,
    offsetTextRef,
    zoom,
    updateAudioVisualPosition,
    setSyncOffset,
}: UseDragOffsetOptions) {
    const dragStartX = useRef<number | null>(null);
    const draggingOffsetStart = useRef<number>(0);

    const zoomRef = useRef(zoom);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    const setSyncOffsetRef = useRef(setSyncOffset);
    useEffect(() => { setSyncOffsetRef.current = setSyncOffset; }, [setSyncOffset]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (dragStartX.current === null) return;
        const deltaPixels = e.clientX - dragStartX.current;
        const currentZoom = zoomRef.current;
        const deltaSeconds = deltaPixels / currentZoom;
        const newOffset = draggingOffsetStart.current + deltaSeconds;
        audioOffsetRef.current = newOffset;
        updateAudioVisualPosition(newOffset);

        if (offsetTextRef.current) {
            const sign = newOffset >= 0 ? '+' : '';
            offsetTextRef.current.innerText = `${sign}${newOffset.toFixed(3)}s`;
        }
    }, [updateAudioVisualPosition, offsetTextRef, audioOffsetRef]);

    const handleMouseUp = useCallback(function onMouseUp() {
        if (dragStartX.current !== null) {
            setSyncOffsetRef.current(audioOffsetRef.current);
        }
        dragStartX.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }, [handleMouseMove, audioOffsetRef]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        dragStartX.current = e.clientX;
        draggingOffsetStart.current = audioOffsetRef.current;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove, handleMouseUp, audioOffsetRef]);

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    return { handleMouseDown };
}
