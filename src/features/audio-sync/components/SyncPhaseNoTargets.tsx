import React from 'react';
import { CheckCircle } from 'lucide-react';

interface Props {
    setStep: (step: number) => void;
}

export const SyncPhaseNoTargets: React.FC<Props> = ({ setStep }) => {
    return (
        <div className="flex flex-col items-center">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
                <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50">
                        <CheckCircle size={32} className="text-blue-500" />
                    </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Senkronize Edilecek Dosya Yok
                </h3>
                <p className="text-gray-500 text-sm mb-8">
                    Yalnızca tek bir video yüklediğiniz için senkronizasyon gerekmiyor.
                    Doğrudan düzenlemeye geçebilirsiniz.
                </p>
                <button
                    onClick={() => setStep(3)}
                    className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl
                        hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/30
                        active:scale-[0.98] transition-all text-lg"
                >
                    Düzenlemeye Devam Et
                </button>
            </div>
        </div>
    );
};
