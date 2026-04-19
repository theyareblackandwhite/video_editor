import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ShortsClip } from '../../../app/store/types';

const MIN_RANGE_SEC = 0.1;

function clampTime(t: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, t));
}

function formatTimeLabel(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s.toFixed(1)}s`;
    const secStr = s < 10 ? `0${s.toFixed(1)}` : s.toFixed(1);
    return `${m}:${secStr}`;
}

function timeFromClientX(clientX: number, track: HTMLDivElement, duration: number): number {
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = rect.width > 0 ? x / rect.width : 0;
    return clampTime(ratio * duration, 0, duration);
}

export interface ClipRangePickerProps {
    duration: number;
    startTime: number;
    endTime: number;
    currentTime: number;
    clips: ShortsClip[];
    onStartChange: (t: number) => void;
    onEndChange: (t: number) => void;
    onSeek: (t: number) => void;
}

export const ClipRangePicker: React.FC<ClipRangePickerProps> = ({
    duration,
    startTime,
    endTime,
    currentTime,
    clips,
    onStartChange,
    onEndChange,
    onSeek,
}) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const startRef = useRef(startTime);
    const endRef = useRef(endTime);
    const [dragEdge, setDragEdge] = useState<'start' | 'end' | null>(null);

    startRef.current = startTime;
    endRef.current = endTime;

    const pct = useCallback(
        (t: number) => (duration > 0 ? clampTime((t / duration) * 100, 0, 100) : 0),
        [duration]
    );

    useEffect(() => {
        if (!dragEdge || !trackRef.current) return;

        const track = trackRef.current;

        const onMove = (ev: MouseEvent) => {
            const t = timeFromClientX(ev.clientX, track, duration);
            if (dragEdge === 'start') {
                const end = endRef.current;
                onStartChange(clampTime(t, 0, end - MIN_RANGE_SEC));
            } else {
                const st = startRef.current;
                onEndChange(clampTime(t, st + MIN_RANGE_SEC, duration));
            }
        };

        const onUp = () => setDragEdge(null);

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [dragEdge, duration, onEndChange, onStartChange]);

    const handleTrackPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0 || !trackRef.current || duration <= 0) return;
        const t = timeFromClientX(e.clientX, trackRef.current, duration);
        onSeek(t);
    };

    const disabled = duration <= 0 || !Number.isFinite(duration);

    return (
        <div className={`w-full max-w-3xl mx-auto space-y-2 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex justify-between text-[10px] font-mono text-gray-400 uppercase tracking-wide">
                <span>{formatTimeLabel(0)}</span>
                <span className="text-purple-300/90">
                    Seçim {formatTimeLabel(startTime)} — {formatTimeLabel(endTime)}
                </span>
                <span>{formatTimeLabel(duration)}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center rounded-lg bg-gray-900/90 border border-gray-700/60 px-3 py-2">
                <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">
                        Başlangıç (sn)
                    </span>
                    <span className="text-sm font-mono font-bold text-purple-200 tabular-nums">
                        {startTime.toFixed(1)}
                    </span>
                </div>
                <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">
                        Oynatma (sn)
                    </span>
                    <span className="text-sm font-mono font-bold text-amber-200 tabular-nums">
                        {Number.isFinite(currentTime) ? currentTime.toFixed(1) : '0.0'}
                    </span>
                </div>
                <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">
                        Bitiş (sn)
                    </span>
                    <span className="text-sm font-mono font-bold text-pink-200 tabular-nums">
                        {endTime.toFixed(1)}
                    </span>
                </div>
            </div>

            <div className="relative select-none" aria-hidden={disabled}>
                {/* Saved clip markers */}
                <div className="relative h-2 mb-1 rounded overflow-hidden bg-gray-800/80">
                    {clips.map((clip) => {
                        const left = pct(clip.startTime);
                        const width = Math.max(0.2, pct(clip.endTime) - left);
                        return (
                            <div
                                key={clip.id}
                                className="absolute top-0 bottom-0 bg-emerald-500/35 border-x border-emerald-400/50 pointer-events-none"
                                style={{ left: `${left}%`, width: `${width}%` }}
                                title={`Kayıtlı: ${formatTimeLabel(clip.startTime)}–${formatTimeLabel(clip.endTime)}`}
                            />
                        );
                    })}
                </div>

                <div
                    ref={trackRef}
                    className="relative h-10 rounded-lg bg-gray-800 cursor-pointer border border-gray-700/80 overflow-hidden"
                    onMouseDown={handleTrackPointerDown}
                >
                    {/* Dim outside selection */}
                    <div
                        className="absolute inset-y-0 left-0 bg-black/45 pointer-events-none"
                        style={{ width: `${pct(startTime)}%` }}
                    />
                    <div
                        className="absolute inset-y-0 right-0 bg-black/45 pointer-events-none"
                        style={{ width: `${100 - pct(endTime)}%` }}
                    />

                    {/* Selected range */}
                    <div
                        className="absolute inset-y-0 bg-gradient-to-r from-purple-600/50 to-pink-600/50 border-y border-white/10 pointer-events-none"
                        style={{
                            left: `${pct(startTime)}%`,
                            width: `${Math.max(0, pct(endTime) - pct(startTime))}%`,
                        }}
                    />

                    {/* Playhead */}
                    {duration > 0 && (
                        <div
                            className="absolute top-0 bottom-0 w-px bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] pointer-events-none z-10"
                            style={{ left: `${pct(currentTime)}%` }}
                        />
                    )}

                    {/* Handles */}
                    <button
                        type="button"
                        aria-label="Klip başlangıcı"
                        className="absolute top-1/2 z-20 -translate-y-1/2 -translate-x-1/2 w-3 h-8 rounded-md bg-white border-2 border-purple-500 shadow-lg cursor-ew-resize hover:scale-110 transition-transform"
                        style={{ left: `${pct(startTime)}%` }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragEdge('start');
                        }}
                    />
                    <button
                        type="button"
                        aria-label="Klip bitişi"
                        className="absolute top-1/2 z-20 -translate-y-1/2 -translate-x-1/2 w-3 h-8 rounded-md bg-white border-2 border-pink-500 shadow-lg cursor-ew-resize hover:scale-110 transition-transform"
                        style={{ left: `${pct(endTime)}%` }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragEdge('end');
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
