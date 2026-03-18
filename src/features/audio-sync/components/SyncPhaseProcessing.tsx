import React from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
    progress: number;
}

export const SyncPhaseProcessing: React.FC<Props> = ({ progress }) => {
    return (
        <div className="flex flex-col items-center">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
                <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                        <Loader2 size={36} className="text-white animate-spin" />
                    </div>
                </div>

                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Ses Analiz Ediliyor...
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                    En iyi hizalamayı bulmak için dalga formları karşılaştırılıyor.
                </p>

                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                </div>
                <p className="text-xs text-gray-400 mt-2">%{Math.round(progress * 100)}</p>
            </div>
        </div>
    );
};
