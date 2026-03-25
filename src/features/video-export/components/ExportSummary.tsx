import React from 'react';
import { HardDrive, Download } from 'lucide-react';
import type { ExportConfig } from '../utils/ffmpegUtils';
import type { MediaFile } from '../../../app/store/types';
import { formatFileSize } from '../../../shared/utils';
import { useAppStore } from '../../../app/store';

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
    videoFilesCount: number;
    audioFilesCount: number;
    cutsCount: number;
    estimatedSize: number;
    onExport: () => void;
}

export const ExportSummary: React.FC<Props> = ({
    config,
    masterVideo,
    videoFilesCount,
    audioFilesCount,
    cutsCount,
    estimatedSize,
    onExport
}) => {
    const { shortsConfig } = useAppStore();

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
                        <span className="text-gray-500">Shorts / Reels</span>
                        <span className={`font-medium ${shortsConfig?.isActive ? 'text-indigo-600' : 'text-gray-400'}`}>
                            {shortsConfig?.isActive ? 'Aktif (9:16)' : 'Kapalı'}
                        </span>
                    </div>
                    {shortsConfig?.isActive && (
                         <div className="flex justify-between text-[10px] text-gray-400 -mt-2">
                            <span>AI Yüz Takibi ({Math.round(shortsConfig.startTime)}s-{Math.round(shortsConfig.endTime)}s)</span>
                            <span>{shortsConfig.enableFaceTracker ? 'Aktif' : 'Kapalı'}</span>
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
