import React from 'react';
import { FileVideo, FileAudio, X, AlertCircle, Plus, Star } from 'lucide-react';
import { useAppStore, type MediaFile } from '../../../app/store';
import { useFilePicker } from '../hooks/useFilePicker';
import { isTauri } from '../../../shared/utils/tauri';
import { ask } from '@tauri-apps/plugin-dialog';

const EmptyCard: React.FC<{
    type: 'video' | 'audio';
    onPick: () => void;
    isLoading: boolean;
    error?: string | null;
}> = ({ type, onPick, isLoading, error: errorMsg }) => {
    const isVideo = type === 'video';
    const label = isVideo ? 'Video Ekle (Kamera)' : 'Ses Ekle (Mikrofon)';

    return (
        <div
            className="relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer border-gray-300 hover:border-blue-500 hover:bg-blue-50"
            onClick={onPick}
        >
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Plus size={24} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{label}</h3>
            {!isVideo && <span className="text-xs text-blue-500 font-medium mb-2">(İsteğe bağlı)</span>}
            <p className="text-sm text-gray-500 text-center">
                Seçmek için tıklayın veya sürükleyip bırakın<br />
                <span className="text-xs opacity-75">
                    {isVideo ? 'MP4, MOV, WebM' : 'MP3, WAV, AAC'}
                </span>
            </p>
            {isLoading && <p className="text-sm text-blue-600 mt-2">Yükleniyor...</p>}
            {errorMsg && (
                <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 w-full">
                    <AlertCircle size={14} className="text-red-600 mt-0.5 shrink-0" />
                    <span className="text-xs text-red-700">{errorMsg}</span>
                </div>
            )}
        </div>
    );
};

const FileItem: React.FC<{
    mediaFile: MediaFile;
    type: 'video' | 'audio';
    onRemove: () => void;
    onSetMaster?: () => void;
}> = ({ mediaFile, type, onRemove, onSetMaster }) => {
    const isVideo = type === 'video';
    const Icon = isVideo ? FileVideo : FileAudio;
    const { name, size, isMaster } = mediaFile;

    return (
        <div className={`relative border-2 rounded-xl p-4 flex items-center gap-4 transition-all duration-200 bg-white
            ${isMaster ? 'border-amber-400 shadow-sm' : 'border-gray-200'}
        `}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0
                ${isMaster ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-500'}
            `}>
                <Icon size={24} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{name}</h3>
                    {isMaster && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                            <Star size={10} className="fill-amber-700" /> MASTER
                        </span>
                    )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{(size / (1024 * 1024)).toFixed(2)} MB</p>

                {isVideo && !isMaster && onSetMaster && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onSetMaster(); }}
                        className="mt-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                        Master Olarak Belirle
                    </button>
                )}
            </div>

            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors shrink-0"
                title="Dosyayı kaldır"
            >
                <X size={16} />
            </button>
        </div>
    );
};

export const MediaUpload: React.FC = () => {
    const {
        videoFiles, audioFiles,
        addVideoFile, removeVideoFile, setMasterVideo,
        addAudioFile, removeAudioFile,
        setStep
    } = useAppStore();

    const videoPicker = useFilePicker({
        accept: { 'video/*': ['.mp4', '.mov', '.webm', '.mkv'] },
        type: 'video',
    });

    const audioPicker = useFilePicker({
        accept: { 'audio/*': ['.mp3', '.wav', '.aac', '.m4a'] },
        type: 'audio',
    });

    const handleRemoveVideo = async (id: string, name: string) => {
        let confirmed = false;
        if (isTauri()) {
            confirmed = await ask(`${name} videosunu silmek istediğinize emin misiniz?`, {
                title: 'Dosyayı Sil',
                kind: 'warning',
                okLabel: 'Sil',
                cancelLabel: 'İptal'
            });
        } else {
            confirmed = window.confirm(`${name} videosunu silmek istediğinize emin misiniz?`);
        }
        if (confirmed) removeVideoFile(id);
    };

    const handleRemoveAudio = async (id: string, name: string) => {
        let confirmed = false;
        if (isTauri()) {
            confirmed = await ask(`${name} ses dosyasını silmek istediğinize emin misiniz?`, {
                title: 'Dosyayı Sil',
                kind: 'warning',
                okLabel: 'Sil',
                cancelLabel: 'İptal'
            });
        } else {
            confirmed = window.confirm(`${name} ses dosyasını silmek istediğinize emin misiniz?`);
        }
        if (confirmed) removeAudioFile(id);
    };

    const handlePickVideo = async () => {
        const file = await videoPicker.pickFile();
        if (file) addVideoFile(file);
    };

    const handlePickAudio = async () => {
        const file = await audioPicker.pickFile();
        if (file) addAudioFile(file);
    };

    const canProceed = videoFiles.length > 0;

    return (
        <div className="max-w-full mx-auto px-4 pt-6">

            <div className="grid md:grid-cols-2 gap-8 mb-12">
                {/* Videos Section */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                            <FileVideo size={20} className="text-blue-500" />
                            Videolar ({videoFiles.length})
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {videoFiles.map(vf => (
                            <FileItem
                                key={vf.id}
                                mediaFile={vf}
                                type="video"
                                onRemove={() => handleRemoveVideo(vf.id, vf.name)}
                                onSetMaster={() => setMasterVideo(vf.id)}
                            />
                        ))}
                        <EmptyCard
                            type="video"
                            onPick={handlePickVideo}
                            isLoading={videoPicker.isLoading}
                            error={videoPicker.error}
                        />
                    </div>
                </div>

                {/* Audios Section */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                            <FileAudio size={20} className="text-emerald-500" />
                            Ses Dosyaları ({audioFiles.length})
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {audioFiles.map(af => (
                            <FileItem
                                key={af.id}
                                mediaFile={af}
                                type="audio"
                                onRemove={() => handleRemoveAudio(af.id, af.name)}
                            />
                        ))}
                        <EmptyCard
                            type="audio"
                            onPick={handlePickAudio}
                            isLoading={audioPicker.isLoading}
                            error={audioPicker.error}
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-center">
                <button
                    onClick={() => {
                        if (canProceed) {
                            // If there's more than 1 file total, we probably need syncing
                            const needsSync = videoFiles.length > 1 || audioFiles.length > 0;
                            setStep(needsSync ? 2 : 3);
                        }
                    }}
                    disabled={!canProceed}
                    className={`
                        flex items-center px-8 py-3 rounded-full text-lg font-semibold transition-all
                        ${canProceed
                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }
                    `}
                >
                    {(videoFiles.length > 1 || audioFiles.length > 0) ? 'Senkronizasyona Devam Et' : 'Düzenlemeye Devam Et'}
                </button>
            </div>
        </div>
    );
};
