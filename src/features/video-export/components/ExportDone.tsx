import React from 'react';
import { Check, FolderOpen } from 'lucide-react';
import type { ExportConfig } from '../utils/ffmpegUtils';
import { useAppStore } from '../../../app/store';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { formatTime } from '../../../shared/utils';

const QUALITY_LABELS: Record<ExportConfig['quality'], { label: string }> = {
    high: { label: 'Yüksek Kalite' },
    medium: { label: 'Orta Kalite' },
    low: { label: 'Düşük Kalite' },
};


interface Props {
    outputPath: string;
    config: ExportConfig;
    elapsedTime: number;
    onReset: () => void;
}

export const ExportDone: React.FC<Props> = ({
    outputPath,
    config,
    elapsedTime,
    onReset
}) => {
    const setStep = useAppStore(s => s.setStep);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="bg-white rounded-2xl shadow-xl border border-green-100 p-10 w-full max-w-lg text-center">
                <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 shadow-lg shadow-green-100">
                        <Check size={40} className="text-green-600" />
                    </div>
                </div>

                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    Dışa Aktarım Tamamlandı! 🎉
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                    Videonuz başarıyla işlendi ve indirilmeye hazır.
                </p>

                {outputPath && (
                    <div className="bg-black rounded-xl overflow-hidden mb-6 aspect-video">
                        <video
                            src={convertFileSrc(outputPath)}
                            className="w-full h-full object-contain"
                            controls
                            playsInline
                        />
                    </div>
                )}

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-6 text-left">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <span className="text-gray-400 block text-xs">Format</span>
                            <span className="font-medium text-gray-800">{config.format.toUpperCase()}</span>
                        </div>
                        <div>
                            <span className="text-gray-400 block text-xs">Konum</span>
                            <span className="font-medium text-gray-800 text-xs break-all">{outputPath}</span>
                        </div>
                        <div>
                            <span className="text-gray-400 block text-xs">Kalite</span>
                            <span className="font-medium text-gray-800">{QUALITY_LABELS[config.quality].label}</span>
                        </div>
                        <div>
                            <span className="text-gray-400 block text-xs">Süre</span>
                            <span className="font-medium text-gray-800">{formatTime(elapsedTime)}</span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={async () => {
                        try {
                            await open(outputPath);
                        } catch (e) {
                            console.error('Dosya açılamadı', e);
                        }
                    }}
                    className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl
                        hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-600/30
                        active:scale-[0.98] transition-all text-lg mb-3"
                >
                    <div className="flex items-center justify-center gap-3">
                        <FolderOpen size={22} />
                        Videoyu Oynat
                    </div>
                </button>

                <div className="flex gap-3">
                    <button
                        onClick={onReset}
                        className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium text-sm"
                    >
                        Farklı Ayarlarla Dışa Aktar
                    </button>
                    <button
                        onClick={() => setStep(1)}
                        className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium text-sm"
                    >
                        Yeni Proje Başlat
                    </button>
                </div>
            </div>
        </div>
    );
};
