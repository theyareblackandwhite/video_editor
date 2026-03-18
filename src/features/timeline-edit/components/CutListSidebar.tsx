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
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 sticky top-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Kesim Listesi</h3>
            <p className="text-xs text-gray-400 mb-4">
                Çıkarılacak bölümler aşağıda listelenir. Kırmızı bölgeler son videoda olmayacaktır.
            </p>

            {sortedCuts.length === 0 ? (
                <div className="text-center py-10">
                    <Scissors size={32} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">Henüz kesim yok</p>
                    <p className="text-xs text-gray-300 mt-1">
                        Başlangıç noktası belirleyip, bitiş noktasında "Kes" butonuna basın.
                    </p>
                </div>
            ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
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

            {/* Summary */}
            {sortedCuts.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Toplam kesim</span>
                        <span className="font-semibold text-gray-800">{sortedCuts.length} bölüm</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-500">Çıkarılan süre</span>
                        <span className="font-mono font-semibold text-red-600">
                            {cuts.reduce((s, c) => s + (c.end - c.start), 0).toFixed(1)}s
                        </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-500">Kalan süre</span>
                        <span className="font-mono font-semibold text-green-600">
                            {(duration - cuts.reduce((s, c) => s + (c.end - c.start), 0)).toFixed(1)}s
                        </span>
                    </div>
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
