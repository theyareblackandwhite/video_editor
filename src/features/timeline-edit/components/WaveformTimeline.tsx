import React from 'react';
import { ZoomIn, ZoomOut, GripVertical } from 'lucide-react';
import type { CutSegment } from '../../../app/store/types';
import { fmtTime } from '../utils/timeFormat';

interface WaveformTimelineProps {
    waveContainerRef: React.RefObject<HTMLDivElement | null>;
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    waveScroll: { left: number; width: number };
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
    zoom,
    setZoom,
    waveScroll,
    duration,
    currentTime,
    sortedCuts,
    selectedCut,
    dragging,
    handleEdgeDrag,
    jumpToCut,
    seekTo,
}) => {
    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="relative">
            {/* Zoom controls */}
            <div className="flex items-center justify-end gap-1 mb-2">
                <button onClick={() => setZoom(z => Math.max(0.1, z - 5))} className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <ZoomOut size={14} />
                </button>
                <span className="text-[10px] font-mono text-gray-400 w-12 text-center">{zoom.toFixed(1)}px</span>
                <button onClick={() => setZoom(z => Math.min(1000, z + 5))} className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <ZoomIn size={14} />
                </button>
            </div>

            {/* Waveform */}
            <div className="bg-white rounded-xl overflow-hidden border border-gray-200 relative shadow-sm">
                <div ref={waveContainerRef} className="w-full h-[80px]" />

                {/* Cut regions overlay */}
                <div
                    className="absolute top-0 left-0 h-full overflow-hidden pointer-events-none"
                    style={{ width: '100%' }}
                >
                    <div style={{
                        width: waveScroll.width > 0 ? waveScroll.width : '100%',
                        height: '100%',
                        position: 'relative',
                        transform: `translateX(-${waveScroll.left}px)`,
                    }}>
                        {duration > 0 && sortedCuts.map(cut => {
                            const left = (cut.start / duration) * 100;
                            const w = ((cut.end - cut.start) / duration) * 100;
                            const isActive = selectedCut === cut.id;
                            const isDraggingThis = dragging?.cutId === cut.id;
                            const isDraggingStart = isDraggingThis && dragging?.edge === 'start';
                            const isDraggingEnd = isDraggingThis && dragging?.edge === 'end';

                            return (
                                <div
                                    key={cut.id}
                                    className="absolute top-0 h-full cursor-pointer pointer-events-auto group/cut"
                                    style={{
                                        left: `${left}%`,
                                        width: `${w}%`,
                                        background: isDraggingThis
                                            ? 'rgba(239,68,68,0.55)'
                                            : isActive ? 'rgba(239,68,68,0.45)' : 'rgba(239,68,68,0.25)',
                                        borderLeft: '2px solid rgb(239,68,68)',
                                        borderRight: '2px solid rgb(239,68,68)',
                                        boxShadow: isDraggingThis
                                            ? '0 0 8px 2px rgba(239,68,68,0.5)'
                                            : isActive ? '0 0 0 2px rgba(248,113,113,0.8)' : undefined,
                                        transition: isDraggingThis ? 'none' : 'background 0.15s, box-shadow 0.15s',
                                    }}
                                    onClick={() => jumpToCut(cut)}
                                    title={`${fmtTime(cut.start)} → ${fmtTime(cut.end)}`}
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
                                </div>
                            );
                        })}

                        {/* Playhead */}
                        <div
                            className="absolute top-0 h-full pointer-events-none z-10"
                            style={{
                                left: `${progressPercent}%`,
                                width: 2,
                                background: 'rgba(15,23,42,0.85)',
                                boxShadow: '0 0 4px rgba(15,23,42,0.3)',
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Scrubber bar */}
            <div
                className="mt-3 h-2 bg-gray-200 rounded-full cursor-pointer relative group"
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    seekTo(pct * duration);
                }}
                onMouseDown={(e) => {
                    e.preventDefault();
                    const bar = e.currentTarget;
                    const scrub = (ev: MouseEvent) => {
                        const rect = bar.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                        seekTo(pct * duration);
                    };
                    scrub(e.nativeEvent);
                    const onUp = () => {
                        document.removeEventListener('mousemove', scrub);
                        document.removeEventListener('mouseup', onUp);
                    };
                    document.addEventListener('mousemove', scrub);
                    document.addEventListener('mouseup', onUp);
                }}
            >
                {/* Progress fill */}
                <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full pointer-events-none"
                    style={{ width: `${progressPercent}%` }}
                />
                {/* Draggable thumb */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-10"
                    style={{ left: `${progressPercent}%` }}
                >
                    <div className="w-4 h-4 -ml-2 rounded-full bg-blue-600 border-2 border-white shadow-md
                        group-hover:scale-125 transition-transform" />
                </div>
                {/* Cut markers on scrubber */}
                {sortedCuts.map(cut => (
                    <div
                        key={cut.id}
                        className="absolute top-0 h-full bg-red-500/50 pointer-events-none"
                        style={{
                            left: `${(cut.start / duration) * 100}%`,
                            width: `${((cut.end - cut.start) / duration) * 100}%`
                        }}
                    />
                ))}
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
        className="absolute top-0 h-full cursor-col-resize z-20 flex items-center justify-center"
        style={{
            [side === 'left' ? 'left' : 'right']: -6,
            width: 12,
            background: isActive ? 'rgba(220,38,38,0.95)' : 'rgba(239,68,68,0.7)',
            borderRadius: side === 'left' ? '3px 0 0 3px' : '0 3px 3px 0',
            transition: isActive ? 'none' : 'background 0.15s, box-shadow 0.15s',
            boxShadow: isActive ? '0 0 6px rgba(220,38,38,0.6)' : undefined,
        }}
        onMouseDown={onMouseDown}
    >
        <GripVertical size={10} className="text-white/90" />
        {time && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg z-30">
                {time}
            </div>
        )}
    </div>
);
