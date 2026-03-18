import React from 'react';
import { Wand2 } from 'lucide-react';

interface Props {
    onAutoSync: () => void;
}

export const SyncPhaseIdle: React.FC<Props> = ({ onAutoSync }) => {
    return (
        <div className="flex flex-col items-center">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
                <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                        <Wand2 size={36} className="text-white" />
                    </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Otomatik Senkronizasyon
                </h3>
                <p className="text-gray-500 text-sm mb-8">
                    Ses dalgalarını analiz ederek otomatik hizalama yapacağız.
                </p>
                <button
                    onClick={onAutoSync}
                    className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl
                        hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/30
                        active:scale-[0.98] transition-all text-lg"
                >
                    <div className="flex items-center justify-center gap-3">
                        <Wand2 size={22} />
                        Otomatik Eşle
                    </div>
                </button>
            </div>
        </div>
    );
};
