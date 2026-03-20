import React, { useState } from 'react';
import { Scissors, Trash2, Plus, AudioLines, Loader2 } from 'lucide-react';
import type { MediaFile } from '../../../app/store/types';
import { detectSilences } from '../../../shared/utils/audio';

interface CutToolbarProps {
    markIn: number | null;
    currentTime: number;
    handleMarkIn: () => void;
    handleCutOut: () => void;
    masterVideo: MediaFile | undefined;
    videoFiles: MediaFile[];
    audioFiles: MediaFile[];
    cuts: { id: string; start: number; end: number }[];
    setCuts: (cuts: { id: string; start: number; end: number }[]) => void;
    fmtTime: (s: number) => string;
}

export const CutToolbar: React.FC<CutToolbarProps> = ({
    markIn,
    handleMarkIn,
    handleCutOut,
    masterVideo,
    videoFiles,
    audioFiles,
    cuts,
    setCuts,
    fmtTime,
}) => {
    const [showAutoCutSettings, setShowAutoCutSettings] = useState(false);
    const [isDetectingSilences, setIsDetectingSilences] = useState(false);
    const [silenceThreshold, setSilenceThreshold] = useState(-35);
    const [silenceDuration, setSilenceDuration] = useState(0.5);

    const handleDetectSilences = async () => {
        if (!masterVideo) return;
        setIsDetectingSilences(true);
        try {
            const newCuts = await detectSilences(masterVideo, videoFiles, audioFiles, silenceThreshold, silenceDuration);
            if (newCuts.length > 0) {
                setCuts([...cuts, ...newCuts]);
                alert(`${newCuts.length} sessiz bölüm bulundu ve kesim listesine eklendi.`);
            } else {
                alert(`Belirtilen ayarlara uygun sessiz bölüm bulunamadı.`);
            }
            setShowAutoCutSettings(false);
        } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e));
            console.error('Silence detection failed:', err);
            alert(`Sessizlik algılama başarısız oldu: ${err.message}`);
        } finally {
            setIsDetectingSilences(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-2 w-full">
                <div className="relative w-full">
                    <button
                        onClick={() => setShowAutoCutSettings(!showAutoCutSettings)}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
                    >
                        <AudioLines size={14} />
                        Otomatik Kes
                    </button>

                    {showAutoCutSettings && (
                        <AutoCutSettingsPopover
                            silenceThreshold={silenceThreshold}
                            setSilenceThreshold={setSilenceThreshold}
                            silenceDuration={silenceDuration}
                            setSilenceDuration={setSilenceDuration}
                            isDetectingSilences={isDetectingSilences}
                            onDetect={handleDetectSilences}
                        />
                    )}
                </div>

                {cuts.length > 0 && (
                    <button
                        onClick={() => {
                            if (window.confirm('Tüm kesimleri silmek istediğinize emin misiniz?')) {
                                setCuts([]);
                            }
                        }}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                    >
                        <Trash2 size={14} />
                        Sıfırla
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-2 w-full border-t border-gray-100 pt-3">
                <button
                    onClick={handleMarkIn}
                    className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-semibold transition-all ${markIn !== null ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                    {markIn !== null ? <Trash2 size={14} /> : <Plus size={14} />}
                    {markIn !== null ? `İptal: ${fmtTime(markIn)}` : 'Başlangıç'}
                </button>
                <button
                    onClick={handleCutOut}
                    disabled={markIn === null}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-bold bg-red-600 text-white
                        hover:bg-red-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm shadow-red-600/20"
                >
                    <Scissors size={14} />
                    Kes
                </button>
            </div>
        </div>
    );

};

/* ── Auto Cut Settings Popover ── */

interface AutoCutSettingsPopoverProps {
    silenceThreshold: number;
    setSilenceThreshold: (v: number) => void;
    silenceDuration: number;
    setSilenceDuration: (v: number) => void;
    isDetectingSilences: boolean;
    onDetect: () => void;
}

const AutoCutSettingsPopover: React.FC<AutoCutSettingsPopoverProps> = ({
    silenceThreshold,
    setSilenceThreshold,
    silenceDuration,
    setSilenceDuration,
    isDetectingSilences,
    onDetect,
}) => (
    <div className="absolute top-full mt-2 left-0 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50">
        <h4 className="font-semibold text-gray-800 mb-3 text-sm">Otomatik Kesim Ayarları</h4>
        <div className="space-y-4">
            <div>
                <label className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Hassasiyet (dB)</span>
                    <span>{silenceThreshold} dB</span>
                </label>
                <input
                    type="range" min="-60" max="-10" value={silenceThreshold}
                    onChange={e => setSilenceThreshold(Number(e.target.value))}
                    className="w-full accent-purple-600"
                />
            </div>
            <div>
                <label className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Min. Sessizlik Süresi</span>
                    <span>{silenceDuration}s</span>
                </label>
                <input
                    type="range" min="0.1" max="2" step="0.1" value={silenceDuration}
                    onChange={e => setSilenceDuration(Number(e.target.value))}
                    className="w-full accent-purple-600"
                />
            </div>
            <button
                onClick={onDetect}
                disabled={isDetectingSilences}
                className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 flex justify-center items-center gap-2"
            >
                {isDetectingSilences ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
                Sessizlikleri Bul ve Kes
            </button>
        </div>
    </div>
);
