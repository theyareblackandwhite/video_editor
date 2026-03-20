import {
    Play, Pause, ChevronLeft, ChevronRight,
    SkipBack, SkipForward, LayoutTemplate
} from 'lucide-react';
import type { LayoutMode } from '../../../app/store/types';

interface TransportControlsProps {
    isPlaying: boolean;
    togglePlay: () => void;
    skip: (dt: number) => void;
    layoutMode: LayoutMode;
    setLayoutMode: (mode: LayoutMode) => void;
    hasMultipleVideos: boolean;
}

export const TransportControls: React.FC<TransportControlsProps> = ({
    isPlaying,
    togglePlay,
    skip,
    layoutMode,
    setLayoutMode,
    hasMultipleVideos,
}) => {
    return (
        <div className="flex items-center justify-between mb-6">
            {/* Left: Layout Toggle */}
            <div className="flex-1">
                {hasMultipleVideos && (
                    <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-200 w-fit">
                        <button
                            onClick={() => setLayoutMode('scale')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${layoutMode === 'scale' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'}`}
                            title="Orijinal (Boşluklu)"
                        >
                            <LayoutTemplate size={14} /> <span className="hidden sm:inline">Orijinal</span>
                        </button>
                        <button
                            onClick={() => setLayoutMode('crop')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${layoutMode === 'crop' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'}`}
                            title="Kırpılmış (Tam Ekran)"
                        >
                            <LayoutTemplate size={14} className="rotate-90" /> <span className="hidden sm:inline">Kırpılmış</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Center: Playback Controls */}
            <div className="flex items-center gap-3">
                <button onClick={() => skip(-5)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500" title="-5s">
                    <SkipBack size={20} />
                </button>
                <button onClick={() => skip(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500" title="-1s">
                    <ChevronLeft size={20} />
                </button>
                <button
                    onClick={togglePlay}
                    className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-600/30 hover:shadow-xl active:scale-95 transition-all"
                >
                    {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <button onClick={() => skip(1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500" title="+1s">
                    <ChevronRight size={20} />
                </button>
                <button onClick={() => skip(5)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500" title="+5s">
                    <SkipForward size={20} />
                </button>
            </div>

            {/* Right: Empty spacer to center the playback controls */}
            <div className="flex-1" />
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
