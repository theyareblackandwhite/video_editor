import React from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
    error: string | null;
    onReset: () => void;
}

export const SyncPhaseError: React.FC<Props> = ({ error, onReset }) => {
    return (
        <div className="flex flex-col items-center">
            <div className="bg-white rounded-2xl shadow-lg border border-red-100 p-10 w-full max-w-md text-center">
                <div className="mb-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
                        <AlertCircle size={32} className="text-red-600" />
                    </div>
                </div>

                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Senkronizasyon Başarısız
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                    {error || 'Ses dosyaları otomatik olarak hizalanamadı.'}
                </p>

                <button
                    onClick={onReset}
                    className="w-full py-3 px-6 bg-gray-100 text-gray-700 font-semibold rounded-xl
                        hover:bg-gray-200 transition-colors"
                >
                    Tekrar Dene
                </button>
            </div>
        </div>
    );
};
