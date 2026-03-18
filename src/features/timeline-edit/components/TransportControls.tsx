import React from 'react';
import {
    Play, Pause, ChevronLeft, ChevronRight,
    SkipBack, SkipForward
} from 'lucide-react';

interface TransportControlsProps {
    isPlaying: boolean;
    togglePlay: () => void;
    skip: (dt: number) => void;
}

export const TransportControls: React.FC<TransportControlsProps> = ({
    isPlaying,
    togglePlay,
    skip,
}) => {
    return (
        <div className="flex items-center justify-center gap-4 mb-4">
            <button onClick={() => skip(-5)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="-5s">
                <SkipBack size={20} />
            </button>
            <button onClick={() => skip(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="-1s">
                <ChevronLeft size={20} />
            </button>
            <button
                onClick={togglePlay}
                className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-600/30 hover:shadow-xl active:scale-95 transition-all"
            >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button onClick={() => skip(1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="+1s">
                <ChevronRight size={20} />
            </button>
            <button onClick={() => skip(5)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="+5s">
                <SkipForward size={20} />
            </button>
        </div>
    );
};

/* ── Keyboard shortcut hints ── */
const SHORTCUTS = [
    { key: 'Space', label: 'Oynat/Duraklat' },
    { key: 'I', label: 'Başlangıç' },
    { key: 'O / X', label: 'Kes' },
    { key: 'J / L', label: '±5s' },
    { key: '← / →', label: '±1s' },
];

export const ShortcutHints: React.FC = () => (
    <div className="flex items-center justify-center gap-3 flex-wrap">
        {SHORTCUTS.map(s => (
            <span key={s.key} className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-mono font-semibold text-gray-500">{s.key}</kbd>
                {s.label}
            </span>
        ))}
    </div>
);
