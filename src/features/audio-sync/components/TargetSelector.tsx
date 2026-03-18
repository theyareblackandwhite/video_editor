import React from 'react';
import { FileVideo, FileAudio, AlertCircle } from 'lucide-react';
import type { MediaFile } from '../../../app/store/types';

interface Props {
    targetFiles: MediaFile[];
    videoFiles: MediaFile[];
    selectedTargetId: string | null;
    setSelectedTargetId: (id: string) => void;
    results: any[];
}

export const TargetSelector: React.FC<Props> = ({
    targetFiles,
    videoFiles,
    selectedTargetId,
    setSelectedTargetId,
    results,
}) => {
    if (targetFiles.length <= 1) return null;

    return (
        <div className="flex flex-wrap justify-center gap-2 w-full mb-4">
            {targetFiles.map(target => {
                const isVideo = videoFiles.some(v => v.id === target.id);
                const isSelected = selectedTargetId === target.id || (!selectedTargetId && targetFiles[0].id === target.id);
                const Icon = isVideo ? FileVideo : FileAudio;
                return (
                    <button
                        key={target.id}
                        onClick={() => setSelectedTargetId(target.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border
                            ${isSelected
                                ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <Icon size={16} />
                        <span className="truncate max-w-[150px]">{target.name}</span>
                        {(results.find(r => r.id === target.id)?.confidence ?? 1) < 0.2 && (
                            <AlertCircle size={14} className="text-amber-500" aria-label="Düşük güvenilirlik" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};
