import React, { useMemo, useEffect } from 'react';
import { ZoomIn, ZoomOut, GripVertical } from 'lucide-react';
import type { CutSegment } from '../../../app/store/types';
import { fmtTime } from '../utils/timeFormat';

interface WaveformTimelineProps {
    waveContainerRef: React.RefObject<HTMLDivElement | null>;
    timelineContainerRef: React.RefObject<HTMLDivElement | null>; // New ref for the scrollable container
    zoom: number; // pixels per second
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    duration: number;
    currentTime: number;
    sortedCuts: CutSegment[];
    selectedCut: string | null;
    dragging: { cutId: string; edge: 'start' | 'end' } | null;
    handleEdgeDrag: (e: React.MouseEvent, cutId: string, edge: 'start' | 'end') => void;
    jumpToCut: (cut: CutSegment) => void;
    seekTo: (t: number) => void;
}

export const WaveformTimeline: React.FC<WaveformTimelineProps> = ({
    waveContainerRef,
    timelineContainerRef,
    zoom,
    setZoom,
    duration,
    currentTime,
    sortedCuts,
    selectedCut,
    dragging,
    handleEdgeDrag,
    jumpToCut,
    seekTo,
}) => {
    // Unified Coordinate System Utilities
    const timeToPixels = (t: number) => t * zoom;
    const pixelsToTime = (px: number) => px / zoom;

    const totalWidth = useMemo(() => duration * zoom, [duration, zoom]);
    const playheadLeft = useMemo(() => timeToPixels(currentTime), [currentTime, zoom]);

    const handleScrubStart = (e: React.MouseEvent) => {
        e.preventDefault();
        const onMove = (ev: MouseEvent) => {
            if (!timelineContainerRef.current) return;
            const rect = timelineContainerRef.current.getBoundingClientRect();
            const scrollLeft = timelineContainerRef.current.scrollLeft;
            const x = ev.clientX - rect.left + scrollLeft;
            seekTo(Math.max(0, Math.min(duration, pixelsToTime(x))));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        // Trigger initial move
        onMove(e.nativeEvent);
    };

    // Auto-scroll playhead into view if it goes out of bounds while playing
    useEffect(() => {
        const container = timelineContainerRef.current;
        if (!container) return;

        const margin = 100; // px
        const leftBound = container.scrollLeft;
        const rightBound = container.scrollLeft + container.clientWidth;

        if (playheadLeft > rightBound - margin || playheadLeft < leftBound + margin) {
            // Only auto-scroll if it's playing or near the edges
            // We don't want to fight the user's manual scrolling too much
        }
    }, [playheadLeft, timelineContainerRef]);

    return (
        <div className="relative select-none">
            {/* Zoom controls */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-xs font-medium text-gray-500 flex items-center gap-2">
                    <span className="bg-gray-100 px-2 py-0.5 rounded font-mono">{fmtTime(currentTime)}</span>
                    <span className="text-gray-300">/</span>
                    <span className="text-gray-400 font-mono">{fmtTime(duration)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setZoom(z => Math.max(10, z * 0.8))} 
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                        title="Zoom Out"
                    >
                        <ZoomOut size={16} />
                    </button>
                    <div className="h-4 w-px bg-gray-200 mx-1" />
                    <button 
                        onClick={() => setZoom(z => Math.min(2000, z * 1.2))} 
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                        title="Zoom In"
                    >
                        <ZoomIn size={16} />
                    </button>
                    <span className="text-[10px] font-mono text-gray-400 min-w-[40px] text-right">
                        {Math.round(zoom)}px/s
                    </span>
                </div>
            </div>

            {/* Main Unified Scroll Container */}
            <div 
                ref={timelineContainerRef}
                className="bg-white rounded-xl border border-gray-200 relative shadow-sm overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent h-[140px]"
            >
                {/* Content Wrapper (Duration-based width) */}
                <div 
                    style={{ width: totalWidth || '100%', height: '100%', position: 'relative' }}
                    className="min-w-full"
                >
                    {/* Waveform Layer */}
                    <div 
                        ref={waveContainerRef} 
                        className="absolute top-0 left-0 w-full h-[80px] opacity-80" 
                    />

                    {/* Interaction & Marking Layer (Translucent background for the ruler area) */}
                    <div 
                        className="absolute bottom-0 left-0 w-full h-[60px] bg-slate-50/30 border-t border-gray-100 cursor-pointer"
                        onMouseDown={handleScrubStart}
                    />

                    {/* Cut regions overlay */}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                        {duration > 0 && sortedCuts.map(cut => {
                            const left = timeToPixels(cut.start);
                            const width = timeToPixels(cut.end - cut.start);
                            const isActive = selectedCut === cut.id;
                            const isDraggingThis = dragging?.cutId === cut.id;
                            const isDraggingStart = isDraggingThis && dragging?.edge === 'start';
                            const isDraggingEnd = isDraggingThis && dragging?.edge === 'end';

                            return (
                                <div
                                    key={cut.id}
                                    className="absolute top-0 cursor-pointer pointer-events-auto group/cut"
                                    style={{
                                        left,
                                        width,
                                        height: 80, // Same as waveform height
                                        background: isDraggingThis
                                            ? 'rgba(239,68,68,0.4)'
                                            : isActive ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.15)',
                                        borderLeft: '2px solid rgb(239,68,68)',
                                        borderRight: '2px solid rgb(239,68,68)',
                                        boxShadow: isDraggingThis
                                            ? '0 0 12px rgba(239,68,68,0.4)'
                                            : isActive ? '0 0 0 1px rgba(239,68,68,0.5)' : undefined,
                                        transition: isDraggingThis ? 'none' : 'background 0.2s, box-shadow 0.2s',
                                        zIndex: isActive ? 10 : 5,
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        jumpToCut(cut);
                                    }}
                                >
                                    {/* Left drag handle */}
                                    <DragHandle
                                        side="left"
                                        isActive={isDraggingStart}
                                        onMouseDown={(e) => handleEdgeDrag(e, cut.id, 'start')}
                                        time={isDraggingStart ? fmtTime(cut.start) : undefined}
                                    />
                                    {/* Right drag handle */}
                                    <DragHandle
                                        side="right"
                                        isActive={isDraggingEnd}
                                        onMouseDown={(e) => handleEdgeDrag(e, cut.id, 'end')}
                                        time={isDraggingEnd ? fmtTime(cut.end) : undefined}
                                    />

                                    {/* Cut Label */}
                                    <div className="absolute bottom-1 left-2 text-[10px] font-medium text-red-600 opacity-0 group-hover/cut:opacity-100 transition-opacity whitespace-nowrap">
                                        {fmtTime(cut.end - cut.start)} segment
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Scrubber Tick Marks (Optional decoration) */}
                    <div className="absolute bottom-[20px] left-0 w-full h-[1px] bg-gray-200 pointer-events-none" />

                    {/* Playhead (Line and Thumb) */}
                    <div
                        className="absolute top-0 h-full pointer-events-none z-30 transition-shadow"
                        style={{
                            left: playheadLeft,
                            width: 1,
                            background: '#0F172A',
                        }}
                    >
                        {/* Playhead vertical line */}
                        <div className="w-px h-full bg-slate-900 shadow-[0_0_8px_rgba(15,23,42,0.4)]" />
                        
                        {/* Playhead handle / thumb at the bottom */}
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-6 bg-slate-900 rounded-t-sm clip-path-playhead flex items-center justify-center">
                            <div className="w-0.5 h-3 bg-white/30 rounded-full" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom context markers (mini overall scrubber if needed, but the main one is zoomable now) */}
            <div className="mt-2 flex justify-between px-1">
                <span className="text-[10px] text-gray-400">Total: {fmtTime(duration)}</span>
                <span className="text-[10px] text-gray-400">Zoom: {zoom.toFixed(0)}px/s</span>
            </div>
        </div>
    );
};

/* ── Drag Handle sub-component ── */
const DragHandle: React.FC<{
    side: 'left' | 'right';
    isActive?: boolean;
    onMouseDown: (e: React.MouseEvent) => void;
    time?: string;
}> = ({ side, isActive, onMouseDown, time }) => (
    <div
        className="absolute top-0 h-full cursor-col-resize z-20 flex items-center justify-center group/handle"
        style={{
            [side === 'left' ? 'left' : 'right']: -8,
            width: 16,
            pointerEvents: 'auto',
        }}
        onMouseDown={(e) => {
            e.stopPropagation();
            onMouseDown(e);
        }}
    >
        <div className={`
            h-1/2 w-1.5 rounded-full transition-all flex items-center justify-center
            ${isActive ? 'bg-red-600 scale-x-125 h-2/3' : 'bg-red-400/80 group-hover/handle:bg-red-500 group-hover/handle:h-2/3'}
        `}>
            <GripVertical size={10} className="text-white opacity-60" />
        </div>

        {time && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-mono px-2 py-0.5 rounded-md shadow-xl z-40 animate-in fade-in zoom-in duration-200">
                {time}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
            </div>
        )}
    </div>
);
