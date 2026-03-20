import React from 'react';
import { Scissors, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CutSegment } from '../../../app/store/types';
import { fmtTime } from '../utils/timeFormat';

interface CutListSidebarProps {
    sortedCuts: CutSegment[];
    cuts: CutSegment[];
    selectedCut: string | null;
    duration: number;
    jumpToCut: (cut: CutSegment) => void;
    removeCut: (id: string) => void;
    nudgeCutEdge: (cutId: string, edge: 'start' | 'end', delta: number) => void;
}

export const CutListSidebar: React.FC<CutListSidebarProps> = ({
    sortedCuts,
    cuts,
    selectedCut,
    duration,
    jumpToCut,
    removeCut,
    nudgeCutEdge,
}) => {
    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">Kesim Listesi</h3>
                    <p className="text-sm text-gray-500">
                        Çıkarılacak bölümler aşağıda listelenir. Kırmızı bölgeler son videoda olmayacaktır.
                    </p>
                </div>
                {sortedCuts.length > 0 && (
                    <div className="flex gap-6 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Kesimler</span>
                            <span className="text-sm font-bold text-gray-800">{sortedCuts.length}</span>
                        </div>
                        <div className="flex flex-col items-center border-l border-gray-200 pl-6">
                            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Çıkarılan</span>
                            <span className="text-sm font-bold text-red-600">
                                {cuts.reduce((s, c) => s + (c.end - c.start), 0).toFixed(1)}s
                            </span>
                        </div>
                        <div className="flex flex-col items-center border-l border-gray-200 pl-6">
                            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Kalan</span>
                            <span className="text-sm font-bold text-green-600">
                                {(duration - cuts.reduce((s, c) => s + (c.end - c.start), 0)).toFixed(1)}s
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {sortedCuts.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <Scissors size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-lg font-medium text-gray-500">Henüz kesim noktası yok</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                        Başlangıç noktası belirleyip, bitiş noktasında "Kes" butonuna basarak videodan bölüm çıkarabilirsiniz.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {sortedCuts.map((cut, i) => (
                        <CutListItem
                            key={cut.id}
                            cut={cut}
                            index={i}
                            isSelected={selectedCut === cut.id}
                            onJump={() => jumpToCut(cut)}
                            onRemove={() => removeCut(cut.id)}
                            onNudge={(edge, delta) => nudgeCutEdge(cut.id, edge, delta)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

/* ── Individual Cut Item ── */
const CutListItem: React.FC<{
    cut: CutSegment;
    index: number;
    isSelected: boolean;
    onJump: () => void;
    onRemove: () => void;
    onNudge: (edge: 'start' | 'end', delta: number) => void;
}> = ({ cut, index, isSelected, onJump, onRemove, onNudge }) => (
    <div
        onClick={onJump}
        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all
            ${isSelected
                ? 'bg-red-50 border-2 border-red-300'
                : 'bg-gray-50 border border-gray-100 hover:bg-gray-100'
            }`}
    >
        <div className="flex-1 min-w-0">
            <span className="text-xs text-gray-400 font-medium">Kesim {index + 1}</span>
            <div className="flex items-center gap-1 mt-0.5">
                <NudgeButton direction="back" onClick={(e) => { e.stopPropagation(); onNudge('start', -0.1); }} title="Başlangıcı 0.1s geri al" />
                <span className="font-mono text-xs font-semibold text-gray-700 w-12 text-center">
                    {fmtTime(cut.start)}
                </span>
                <NudgeButton direction="forward" onClick={(e) => { e.stopPropagation(); onNudge('start', 0.1); }} title="Başlangıcı 0.1s ileri al" />
                <span className="text-gray-300 mx-0.5">→</span>
                <NudgeButton direction="back" onClick={(e) => { e.stopPropagation(); onNudge('end', -0.1); }} title="Bitişi 0.1s geri al" />
                <span className="font-mono text-xs font-semibold text-gray-700 w-12 text-center">
                    {fmtTime(cut.end)}
                </span>
                <NudgeButton direction="forward" onClick={(e) => { e.stopPropagation(); onNudge('end', 0.1); }} title="Bitişi 0.1s ileri al" />
            </div>
            <span className="text-[10px] text-gray-400">
                {(cut.end - cut.start).toFixed(1)}s süre
            </span>
        </div>
        <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
            <Trash2 size={16} />
        </button>
    </div>
);

const NudgeButton: React.FC<{
    direction: 'back' | 'forward';
    onClick: (e: React.MouseEvent) => void;
    title: string;
}> = ({ direction, onClick, title }) => (
    <button
        onClick={onClick}
        className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
        title={title}
    >
        {direction === 'back' ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
    </button>
);
