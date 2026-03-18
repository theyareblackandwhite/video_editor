import React from 'react';
import { ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';

interface Props {
    onNudge: (amount: number) => void;
    isPreviewPlaying: boolean;
    onPreviewToggle: () => void;
}

export const NudgeControls: React.FC<Props> = ({
    onNudge,
    isPreviewPlaying,
    onPreviewToggle,
}) => {
    return (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <button onClick={() => onNudge(-0.1)} className="px-3 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors">
                -0.1s
            </button>
            <button onClick={() => onNudge(-0.01)} className="px-2 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors border border-gray-200 shadow-sm bg-white hover:bg-gray-50">
                <ChevronLeft size={14} className="inline mr-1" /> -0.01s
            </button>

            <button
                onClick={onPreviewToggle}
                className={`flex items-center justify-center gap-2 mx-2 sm:mx-4 px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm ${isPreviewPlaying
                    ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                    : 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                    }`}
            >
                {isPreviewPlaying ? <Pause size={16} /> : <Play size={16} />}
                {isPreviewPlaying ? 'Durdur' : 'Sonucu Dinle'}
            </button>

            <button onClick={() => onNudge(0.01)} className="px-2 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors border border-gray-200 shadow-sm bg-white hover:bg-gray-50">
                +0.01s <ChevronRight size={14} className="inline ml-1" />
            </button>
            <button onClick={() => onNudge(0.1)} className="px-3 py-2 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-mono transition-colors">
                +0.1s
            </button>
        </div>
    );
};
