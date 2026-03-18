import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
    masterAmp: number;
    setMasterAmp: React.Dispatch<React.SetStateAction<number>>;
    targetAmp: number;
    setTargetAmp: React.Dispatch<React.SetStateAction<number>>;
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    waveformAreaRef: React.RefObject<HTMLDivElement | null>;
    masterContainer: React.RefObject<HTMLDivElement | null>;
    targetContainer: React.RefObject<HTMLDivElement | null>;
    isSelectedVideo: boolean;
    handleMouseDown: (e: React.MouseEvent) => void;
}

export const WaveformEditor: React.FC<Props> = ({
    masterAmp, setMasterAmp,
    targetAmp, setTargetAmp,
    zoom, setZoom,
    waveformAreaRef,
    masterContainer,
    targetContainer,
    isSelectedVideo,
    handleMouseDown,
}) => {
    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 w-full mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
                <p className="text-xs text-gray-500 flex-1">
                    Yeşil dalga formunu sürükleyerek kaymayı ince ayarlayabilirsiniz.
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Master Amplitude controls */}
                    <div className="flex items-center gap-1 bg-gray-50 rounded-lg border border-gray-200 p-1" title="Kamera (Mavi) Dalga Boyu">
                        <button onClick={() => setMasterAmp(a => Math.max(1, a - 1))} className="p-1 px-2 hover:bg-white rounded-md transition-colors text-indigo-600 font-bold" title="Küçült">
                            -
                        </button>
                        <span className="px-1 text-xs font-mono text-indigo-600">Kam x{masterAmp}</span>
                        <button onClick={() => setMasterAmp(a => Math.min(20, a + 1))} className="p-1 px-2 hover:bg-white rounded-md transition-colors text-indigo-600 font-bold" title="Büyüt">
                            +
                        </button>
                    </div>

                    {/* Target Amplitude controls */}
                    <div className="flex items-center gap-1 bg-gray-50 rounded-lg border border-gray-200 p-1" title="Mikrofon (Yeşil) Dalga Boyu">
                        <button onClick={() => setTargetAmp(a => Math.max(1, a - 1))} className="p-1 px-2 hover:bg-white rounded-md transition-colors text-emerald-600 font-bold" title="Küçült">
                            -
                        </button>
                        <span className="px-1 text-xs font-mono text-emerald-600">Mik x{targetAmp}</span>
                        <button onClick={() => setTargetAmp(a => Math.min(20, a + 1))} className="p-1 px-2 hover:bg-white rounded-md transition-colors text-emerald-600 font-bold" title="Büyüt">
                            +
                        </button>
                    </div>

                    {/* Zoom controls */}
                    <div className="flex items-center gap-1 bg-gray-50 rounded-lg border border-gray-200 p-1">
                        <button onClick={() => setZoom(z => Math.max(10, z - 10))} className="p-1.5 hover:bg-white rounded-md transition-colors" title="Uzaklaştır">
                            <ZoomOut size={14} />
                        </button>
                        <span className="px-1 text-xs font-mono text-gray-500 w-10 text-center">{zoom}px</span>
                        <button onClick={() => setZoom(z => Math.min(500, z + 10))} className="p-1.5 hover:bg-white rounded-md transition-colors" title="Yakınlaştır">
                            <ZoomIn size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <div ref={waveformAreaRef} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700 relative select-none">
                {/* Video track (master reference) */}
                <div className="relative border-b border-slate-700 bg-slate-800/50">
                    <span className="absolute left-3 top-2 text-[10px] font-bold text-indigo-400 bg-slate-900/80 px-2 py-0.5 rounded z-20 pointer-events-none">
                        KAMERA (Referans)
                    </span>
                    <div ref={masterContainer} className="w-full" />
                </div>

                {/* Audio track (draggable target) */}
                <div className="relative bg-slate-800/30">
                    <span className="absolute left-3 top-2 text-[10px] font-bold text-emerald-400 bg-slate-900/80 px-2 py-0.5 rounded z-20 pointer-events-none">
                        {isSelectedVideo ? 'DİĞER KAMERA' : 'MİKROFON'} (Sürüklenebilir)
                    </span>
                    <div
                        className="w-full overflow-hidden cursor-grab active:cursor-grabbing relative"
                        onMouseDown={handleMouseDown}
                    >
                        <div ref={targetContainer} className="w-full will-change-transform" />
                    </div>
                </div>
            </div>
        </div>
    );
};
