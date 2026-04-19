import React from 'react';
import { HardDrive, Download, Monitor } from 'lucide-react';
import type { ExportConfig } from '../utils/ffmpegUtils';
import type { MediaFile } from '../../../app/store/types';
import { formatFileSize } from '../../../shared/utils';
import { isTauri } from '../../../shared/utils/tauri';

const QUALITY_LABELS: Record<ExportConfig['quality'], { label: string }> = {
    high: { label: 'Yüksek Kalite' },
    medium: { label: 'Orta Kalite' },
    low: { label: 'Düşük Kalite' },
};

const FORMAT_LABELS: Record<ExportConfig['format'], { label: string }> = {
    mp4: { label: 'MP4 (H.264)' },
    webm: { label: 'WebM (VP9)' },
};


interface Props {
    config: ExportConfig;
    masterVideo?: MediaFile;
    /** Master video duration in seconds (for heavy-job native-FFmpeg tip on web). */
    duration?: number;
    videoFilesCount: number;
    audioFilesCount: number;
    cutsCount: number;
    estimatedSize: number;
    onExport: () => void;
}

export const ExportSummary: React.FC<Props> = ({
    config,
    masterVideo,
    duration,
    videoFilesCount,
    audioFilesCount,
    cutsCount,
    estimatedSize,
    onExport
}) => {
    const showNativeTip =
        !isTauri() &&
        ((duration ?? 0) > 600 ||
            (masterVideo?.width ?? 0) > 1920 ||
            (masterVideo?.height ?? 0) > 1080);

    return (
        <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 sticky top-6">
                <h3 className="font-semibold text-gray-800 mb-4">Özet</h3>

                <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Kaynak</span>
                        <span className="font-medium text-gray-800 truncate max-w-[150px]">
                            {masterVideo?.name || '—'} {videoFilesCount > 1 && `(+${videoFilesCount - 1} kamera)`}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Format</span>
                        <span className="font-medium text-gray-800">{FORMAT_LABELS[config.format].label}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Kalite</span>
                        <span className="font-medium text-gray-800">{QUALITY_LABELS[config.quality].label}</span>
                    </div>
                    {audioFilesCount > 0 && (
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Harici ses</span>
                            <span className={`font-medium ${config.includeAudio ? 'text-green-600' : 'text-gray-400'}`}>
                                {config.includeAudio ? `${audioFilesCount} dahil` : 'Hariç'}
                            </span>
                        </div>
                    )}
                    {cutsCount > 0 && (
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Kesimler</span>
                            <span className={`font-medium ${config.applyCuts ? 'text-green-600' : 'text-gray-400'}`}>
                                {config.applyCuts ? `${cutsCount} bölüm` : 'Uygulanmayacak'}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Ses dengeleme</span>
                        <span className={`font-medium ${config.normalizeAudio ? 'text-green-600' : 'text-gray-400'}`}>
                            {config.normalizeAudio ? 'Aktif (EBU R128)' : 'Kapalı'}
                        </span>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 mb-6">
                    <div className="flex items-center gap-2 text-sm">
                        <HardDrive size={14} className="text-gray-400" />
                        <span className="text-gray-500">Tahmini boyut:</span>
                        <span className="font-semibold text-gray-800">{formatFileSize(estimatedSize)}</span>
                    </div>
                </div>

                {showNativeTip && (
                    <div
                        className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-950"
                        role="status"
                    >
                        <div className="flex gap-2">
                            <Monitor size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
                            <p>
                                <span className="font-semibold">Masaüstü uygulaması önerilir.</span>{' '}
                                Uzun veya yüksek çözünürlüklü işlerde Tauri sürümü yerel FFmpeg kullanır: genelde çok daha hızlıdır ve tarayıcıdaki WASM bellek
                                sınırından etkilenmez.
                            </p>
                        </div>
                    </div>
                )}

                <button
                    onClick={onExport}
                    className={`w-full py-4 px-6 font-semibold rounded-xl text-lg transition-all shadow-lg
                        bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-600/30 active:scale-[0.98]
                        `}
                >
                    <div className="flex items-center justify-center gap-3">
                        <Download size={22} />
                        Dışa Aktar
                    </div>
                </button>
            </div>
        </div>
    );
}
