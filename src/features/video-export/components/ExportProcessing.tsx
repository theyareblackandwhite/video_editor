import React from 'react';
import { Loader2, Clock } from 'lucide-react';
import { formatTime } from '../../../shared/utils';


interface Props {
    progress: number;
    progressLabel: string;
    elapsedTime: number;
    onCancel: () => void;
}

export const ExportProcessing: React.FC<Props> = ({ progress, progressLabel, elapsedTime, onCancel }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 w-full max-w-lg text-center">
                <div className="mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                        <Loader2 size={36} className="text-white animate-spin" />
                    </div>
                </div>

                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Video İşleniyor
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                    {progressLabel}
                </p>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden mb-3 shadow-inner">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out relative"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    >
                        <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                    </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mb-8">
                    <span>%{Math.round(progress * 100)}</span>
                    <span className="flex items-center gap-1">
                        <Clock size={12} /> {formatTime(elapsedTime)}
                    </span>
                </div>

                <div className="pt-4 border-t border-gray-50">
                    <button
                        onClick={onCancel}
                        className="px-8 py-2.5 text-sm font-bold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-95"
                    >
                        İptal Et
                    </button>
                </div>
            </div>
        </div>
    );
};
