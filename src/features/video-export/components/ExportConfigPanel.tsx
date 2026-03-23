import React from 'react';
import { Film, Settings, Sparkles, Volume2, FileVideo, AudioLines, Check } from 'lucide-react';
import type { ExportConfig } from '../utils/ffmpegUtils';

const QUALITY_LABELS: Record<ExportConfig['quality'], { label: string; desc: string; icon: string }> = {
    high: { label: 'Yüksek Kalite', desc: 'Orijinal çözünürlük, büyük dosya', icon: '🎬' },
    medium: { label: 'Orta Kalite', desc: 'Dengeli boyut ve kalite', icon: '📹' },
    low: { label: 'Düşük Kalite', desc: 'Hızlı dışa aktarım, küçük dosya', icon: '📱' },
};

const FORMAT_LABELS: Record<ExportConfig['format'], { label: string; desc: string }> = {
    mp4: { label: 'MP4 (H.264)', desc: 'En yaygın format, her yerde oynatılır' },
    webm: { label: 'WebM (VP9)', desc: 'Web dostu, küçük boyut' },
};


interface Props {
    config: ExportConfig;
    setConfig: React.Dispatch<React.SetStateAction<ExportConfig>>;
    audioFilesCount: number;
    cutsCount: number;
}

export const ExportConfigPanel: React.FC<Props> = ({ config, setConfig, audioFilesCount, cutsCount }) => {
    return (
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Film size={18} className="text-gray-500" />
                    <h3 className="font-semibold text-gray-800">Video Formatı</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {(Object.entries(FORMAT_LABELS) as [ExportConfig['format'], typeof FORMAT_LABELS['mp4']][]).map(([key, val]) => (
                        <button
                            key={key}
                            onClick={() => setConfig(c => ({ ...c, format: key }))}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${config.format === key
                                ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-100'
                                : 'border-gray-100 hover:border-gray-300 bg-white'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-sm text-gray-800">{val.label}</span>
                                {config.format === key && <Check size={16} className="text-blue-600" />}
                            </div>
                            <span className="text-xs text-gray-400">{val.desc}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Settings size={18} className="text-gray-500" />
                    <h3 className="font-semibold text-gray-800">Kalite</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {(Object.entries(QUALITY_LABELS) as [ExportConfig['quality'], typeof QUALITY_LABELS['high']][]).map(([key, val]) => (
                        <button
                            key={key}
                            onClick={() => setConfig(c => ({ ...c, quality: key }))}
                            className={`p-4 rounded-xl border-2 text-center transition-all ${config.quality === key
                                ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-100'
                                : 'border-gray-100 hover:border-gray-300 bg-white'
                                }`}
                        >
                            <span className="text-2xl block mb-2">{val.icon}</span>
                            <span className="font-semibold text-sm text-gray-800 block">{val.label}</span>
                            <span className="text-[10px] text-gray-400">{val.desc}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={18} className="text-gray-500" />
                    <h3 className="font-semibold text-gray-800">Seçenekler</h3>
                </div>
                <div className="space-y-3">
                    {audioFilesCount > 0 && (
                        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-3">
                                <Volume2 size={16} className="text-gray-500" />
                                <div>
                                    <span className="text-sm font-medium text-gray-800">Harici sesi dahil et</span>
                                    <span className="text-xs text-gray-400 block">{audioFilesCount} mikrofon kaydı</span>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={config.includeAudio}
                                onChange={e => setConfig(c => ({ ...c, includeAudio: e.target.checked }))}
                                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                            />
                        </label>
                    )}
                    {cutsCount > 0 && (
                        <div className="space-y-2">
                            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <FileVideo size={16} className="text-gray-500" />
                                    <div>
                                        <span className="text-sm font-medium text-gray-800">Kesimleri uygula</span>
                                        <span className="text-xs text-gray-400 block">{cutsCount} kesim bölümü çıkarılacak</span>
                                    </div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={config.applyCuts}
                                    onChange={e => setConfig(c => ({ ...c, applyCuts: e.target.checked }))}
                                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                />
                            </label>

                            {config.applyCuts && (
                                <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors ml-4 border-l-2 border-blue-500">
                                    <div className="flex items-center gap-3">
                                        <Sparkles size={16} className="text-gray-500" />
                                        <div>
                                            <span className="text-sm font-medium text-gray-800">Yumuşak Geçiş (Crossfade)</span>
                                            <span className="text-xs text-gray-400 block">Kesimler arasına yumuşak geçiş ekle</span>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={config.transitionType === 'crossfade'}
                                        onChange={e => setConfig(c => ({ ...c, transitionType: e.target.checked ? 'crossfade' : 'none' }))}
                                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                    />
                                </label>
                            )}
                        </div>
                    )}
                    <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3">
                            <AudioLines size={16} className="text-gray-500" />
                            <div>
                                <span className="text-sm font-medium text-gray-800">Ses dengeleme (Loudnorm)</span>
                                <span className="text-xs text-gray-400 block">Spotify/Netflix standardında ses seviyesi (EBU R128)</span>
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            checked={config.normalizeAudio}
                            onChange={e => setConfig(c => ({ ...c, normalizeAudio: e.target.checked }))}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                    </label>
                </div>
            </div>
        </div>
    );
};
