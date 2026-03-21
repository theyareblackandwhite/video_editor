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
    cuts: { id: string; start: number; end: number }[];
    setCuts: (cuts: { id: string; start: number; end: number }[]) => void;
    fmtTime: (s: number) => string;
}

export const CutToolbar: React.FC<CutToolbarProps> = ({
    markIn,
    handleMarkIn,
    handleCutOut,
    masterVideo,
    cuts,
    setCuts,
    fmtTime,
}) => {
    const [showAutoCutSettings, setShowAutoCutSettings] = useState(false);
    const [isDetectingSilences, setIsDetectingSilences] = useState(false);
    // VAD Options
    const [speechProbThreshold, setSpeechProbThreshold] = useState(0.6);
    const [minSilenceSec, setMinSilenceSec] = useState(0.5);
    const [preRollSec, setPreRollSec] = useState(0.150);
    const [postRollSec, setPostRollSec] = useState(0.200);
    const [mergeGapSec, setMergeGapSec] = useState(0.400);

    const handleDetectSilences = async () => {
        if (!masterVideo) return;
        setIsDetectingSilences(true);
        try {
            const newCuts = await detectSilences(masterVideo, {
                speechProbThreshold, minSilenceSec, preRollSec, postRollSec, mergeGapSec
            });
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
                            speechProbThreshold={speechProbThreshold} setSpeechProbThreshold={setSpeechProbThreshold}
                            minSilenceSec={minSilenceSec} setMinSilenceSec={setMinSilenceSec}
                            preRollSec={preRollSec} setPreRollSec={setPreRollSec}
                            postRollSec={postRollSec} setPostRollSec={setPostRollSec}
                            mergeGapSec={mergeGapSec} setMergeGapSec={setMergeGapSec}
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
    speechProbThreshold: number; setSpeechProbThreshold: (v: number) => void;
    minSilenceSec: number; setMinSilenceSec: (v: number) => void;
    preRollSec: number; setPreRollSec: (v: number) => void;
    postRollSec: number; setPostRollSec: (v: number) => void;
    mergeGapSec: number; setMergeGapSec: (v: number) => void;
    isDetectingSilences: boolean;
    onDetect: () => void;
}

const AutoCutSettingsPopover: React.FC<AutoCutSettingsPopoverProps> = ({
    speechProbThreshold, setSpeechProbThreshold, minSilenceSec, setMinSilenceSec,
    preRollSec, setPreRollSec, postRollSec, setPostRollSec, mergeGapSec, setMergeGapSec,
    isDetectingSilences, onDetect
}) => (
    <div className="absolute top-full mt-2 left-0 w-[400px] bg-white rounded-xl shadow-xl border border-gray-200 p-5 z-50 overflow-hidden">
        <h4 className="font-semibold text-gray-800 mb-4 text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Yapay Zeka (AI) Analizi
        </h4>
        <div className="space-y-4">
            <div>
                <label className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Konuşma Olasılık Eşiği</span>
                    <span>{(speechProbThreshold * 100).toFixed(0)}%</span>
                </label>
                <input type="range" min="0.1" max="0.95" step="0.05" value={speechProbThreshold} onChange={e => setSpeechProbThreshold(Number(e.target.value))} className="w-full accent-purple-600" />
            </div>

            <div className="h-px bg-gray-100 w-full my-2"></div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Başlangıç Boşluğu</span>
                        <span>{preRollSec.toFixed(2)}s</span>
                    </label>
                    <input type="range" min="0" max="0.5" step="0.05" value={preRollSec} onChange={e => setPreRollSec(Number(e.target.value))} className="w-full accent-purple-600" />
                </div>
                <div>
                    <label className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Bitiş Boşluğu</span>
                        <span>{postRollSec.toFixed(2)}s</span>
                    </label>
                    <input type="range" min="0" max="0.5" step="0.05" value={postRollSec} onChange={e => setPostRollSec(Number(e.target.value))} className="w-full accent-purple-600" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="flex justify-between text-xs text-gray-600 mb-1 cursor-help" title="Ignore gaps smaller than this (merges segments)">
                        <span>Küçük Boşluk Birleştir</span>
                        <span>{mergeGapSec.toFixed(2)}s</span>
                    </label>
                    <input type="range" min="0.1" max="1.5" step="0.1" value={mergeGapSec} onChange={e => setMergeGapSec(Number(e.target.value))} className="w-full accent-purple-600" />
                </div>
                <div>
                    <label className="flex justify-between text-xs text-gray-600 mb-1 cursor-help" title="Ignore silences shorter than this">
                        <span>Min Sessizlik Sil</span>
                        <span>{minSilenceSec.toFixed(2)}s</span>
                    </label>
                    <input type="range" min="0.1" max="2" step="0.1" value={minSilenceSec} onChange={e => setMinSilenceSec(Number(e.target.value))} className="w-full accent-purple-600" />
                </div>
            </div>

            <button
                onClick={onDetect}
                disabled={isDetectingSilences}
                className="w-full mt-4 py-2.5 bg-gray-900 border border-transparent hover:border-purple-500 text-white rounded-lg text-sm font-semibold hover:bg-black transition-all disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-black/20"
            >
                {isDetectingSilences ? <Loader2 size={16} className="animate-spin text-purple-400" /> : <Scissors size={16} className="text-purple-400" />}
                Analiz Et
            </button>
        </div>
    </div>
);
