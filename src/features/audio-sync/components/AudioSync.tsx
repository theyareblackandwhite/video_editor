import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { CheckCircle } from 'lucide-react';
import { useAppStore } from '../../../app/store';
import { useAutoSync } from '../hooks/useAutoSync';
import { useWaveformSync } from '../hooks/useWaveformSync';
import { useDragOffset } from '../hooks/useDragOffset';
import { useSyncPreview } from '../hooks/useSyncPreview';
import { MAX_DECODE_DURATION_S } from '../../../shared/utils/fileValidation';

import { SyncPhaseIdle } from './SyncPhaseIdle';
import { SyncPhaseProcessing } from './SyncPhaseProcessing';
import { SyncPhaseError } from './SyncPhaseError';
import { SyncPhaseNoTargets } from './SyncPhaseNoTargets';
import { TargetSelector } from './TargetSelector';
import { WaveformEditor } from './WaveformEditor';
import { NudgeControls } from './NudgeControls';

export const AudioSync: React.FC = () => {
    const {
        videoFiles, audioFiles,
        setVideoSyncOffset, setAudioSyncOffset,
        setStep
    } = useAppStore();
    const { phase, progress, results, error, runSyncMultiple, reset } = useAutoSync();

    const masterVideo = videoFiles.find(v => v.isMaster) || videoFiles[0];

    // Memoize target files to avoid dependency array issues
    const targetFiles = useMemo(() => [
        ...videoFiles.filter(v => v.id !== masterVideo?.id),
        ...audioFiles
    ], [videoFiles, audioFiles, masterVideo?.id]);

    const [zoom, setZoom] = useState(50);
    const [masterAmp, setMasterAmp] = useState(1);
    const [targetAmp, setTargetAmp] = useState(1);
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

    // Get the currently selected target file for manual editing
    const selectedTarget = targetFiles.find(f => f.id === selectedTargetId) || targetFiles[0];
    const isSelectedVideo = videoFiles.some(v => v.id === selectedTarget?.id);

    const setSyncOffset = useCallback((offset: number) => {
        if (!selectedTarget) return;
        if (isSelectedVideo) {
            setVideoSyncOffset(selectedTarget.id, offset);
        } else {
            setAudioSyncOffset(selectedTarget.id, offset);
        }
    }, [isSelectedVideo, selectedTarget, setVideoSyncOffset, setAudioSyncOffset]);
    
    const syncOffset = selectedTarget?.syncOffset || 0;
    const audioOffsetRef = useRef(syncOffset);
    const offsetTextRef = useRef<HTMLSpanElement>(null);
    const waveformAreaRef = useRef<HTMLDivElement>(null);
    const videoAudioRef = useRef<HTMLAudioElement | null>(null);
    const externalAudioRef = useRef<HTMLAudioElement | null>(null);
    const videoUrlRef = useRef<string>('');
    const audioUrlRef = useRef<string>('');

    // Obtain object URLs for playback and waveform rendering
    useEffect(() => {
        if (masterVideo?.path) {
            videoUrlRef.current = convertFileSrc(masterVideo.path);
        }
        if (selectedTarget?.path) {
            audioUrlRef.current = convertFileSrc(selectedTarget.path);
        }
    }, [masterVideo?.id, selectedTarget?.id]);

    const appliedResultsRef = useRef<string>('');
    useEffect(() => {
        if (results.length > 0) {
            const resultsKey = JSON.stringify(results);
            if (appliedResultsRef.current === resultsKey) return;
            
            results.forEach(res => {
                const isVideo = videoFiles.some(v => v.id === res.id);
                if (isVideo) {
                    setVideoSyncOffset(res.id, res.offsetSeconds);
                } else {
                    setAudioSyncOffset(res.id, res.offsetSeconds);
                }
            });
            appliedResultsRef.current = resultsKey;

            if (!selectedTargetId && targetFiles.length > 0) {
                setSelectedTargetId(targetFiles[0].id);
            }
        }
    }, [results, videoFiles, audioFiles, setVideoSyncOffset, setAudioSyncOffset, selectedTargetId, targetFiles]);

    useEffect(() => {
        if (selectedTarget) {
            audioOffsetRef.current = selectedTarget.syncOffset;
        }
    }, [selectedTarget]);

    useEffect(() => {
        if (offsetTextRef.current) {
            const sign = syncOffset >= 0 ? '+' : '';
            offsetTextRef.current.textContent = `${sign}${syncOffset.toFixed(3)}s`;
        }
    }, [syncOffset]);

    // Custom Hooks
    const { masterContainer, targetContainer, masterWs, updateAudioVisualPosition } = useWaveformSync({
        phase,
        masterVideo,
        selectedTarget,
        masterAmp,
        targetAmp,
        zoom,
        audioOffsetRef,
        videoAudioRef,
        externalAudioRef,
    });

    const { isPreviewPlaying, setIsPreviewPlaying, handlePreviewToggle } = useSyncPreview({
        videoAudioRef,
        externalAudioRef,
        syncOffset,
        masterWs,
    });

    const { handleMouseDown } = useDragOffset({
        audioOffsetRef,
        offsetTextRef,
        zoom,
        updateAudioVisualPosition,
        setSyncOffset,
    });

    // Event Handlers
    const handleAutoSync = useCallback(() => {
        if (masterVideo && targetFiles.length > 0) {
            runSyncMultiple(masterVideo, targetFiles);
        }
    }, [masterVideo, targetFiles, runSyncMultiple]);

    const handleNudge = (amount: number) => {
        if (isPreviewPlaying) {
            videoAudioRef.current?.pause();
            externalAudioRef.current?.pause();
            setIsPreviewPlaying(false);
        }
        const newOffset = syncOffset + amount;
        setSyncOffset(newOffset);
        audioOffsetRef.current = newOffset;
        updateAudioVisualPosition(newOffset);
    };

    const handleConfirm = () => {
        videoAudioRef.current?.pause();
        externalAudioRef.current?.pause();

        // Auto-cut the initial un-synchronized portion
        const maxOffset = Math.max(0, ...videoFiles.map(v => v.syncOffset), ...audioFiles.map(a => a.syncOffset));
        if (maxOffset > 0.1) {
            const { setCuts, cuts } = useAppStore.getState();
            const id = `auto-start-${Date.now()}`;
            setCuts([...cuts, { id, start: 0, end: maxOffset }]);
        }

        setStep(3);
    };

    return (
        <div className="max-w-full mx-auto px-4">
            <audio ref={videoAudioRef} src={videoUrlRef.current} preload="auto" onTimeUpdate={(e) => {
                if (e.currentTarget.currentTime >= MAX_DECODE_DURATION_S) {
                    e.currentTarget.pause();
                    if (externalAudioRef.current) externalAudioRef.current.pause();
                    setIsPreviewPlaying(false);
                }
            }} />
            <audio ref={externalAudioRef} src={audioUrlRef.current} preload="auto" />

            {targetFiles.length === 0 && <SyncPhaseNoTargets setStep={setStep} />}

            {targetFiles.length > 0 && phase === 'idle' && <SyncPhaseIdle onAutoSync={handleAutoSync} />}

            {phase === 'processing' && <SyncPhaseProcessing progress={progress} />}

            {phase === 'done' && results.length > 0 && (
                <div className="flex flex-col items-center gap-6">
                    <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-6 w-full text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                            <CheckCircle size={24} className="text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            Senkronizasyon Tamamlandı!
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Tüm dosyalar master videoya göre hizalandı. İnce ayar yapmak isterseniz aşağıdan bir dosya seçebilirsiniz.
                        </p>
                    </div>

                    <TargetSelector
                        targetFiles={targetFiles}
                        videoFiles={videoFiles}
                        selectedTargetId={selectedTargetId}
                        setSelectedTargetId={setSelectedTargetId}
                        results={results}
                    />

                    <div className="flex items-center justify-between w-full px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div>
                            <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                Seçili Kaynak: {selectedTarget?.name}
                            </span>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {(() => {
                                    const conf = results.find(r => r.id === selectedTarget?.id)?.confidence || 0;
                                    if (conf > 0.5) return 'Yüksek güvenilirlik ile eşleştirildi';
                                    if (conf > 0.2) return 'Orta güvenilirlik — manuel kontrol önerilir';
                                    return 'Düşük güvenilirlik — manuel düzenleme önerilir';
                                })()}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100 text-center">
                            <span className="block text-[10px] text-gray-400 uppercase tracking-wider">Kayma</span>
                            <span ref={offsetTextRef} className="text-base font-mono font-bold text-blue-600">
                                {/* Text content is managed via effect and refs to prevent React crashes */}
                            </span>
                        </div>
                    </div>

                    <WaveformEditor
                        masterAmp={masterAmp} setMasterAmp={setMasterAmp}
                        targetAmp={targetAmp} setTargetAmp={setTargetAmp}
                        zoom={zoom} setZoom={setZoom}
                        waveformAreaRef={waveformAreaRef}
                        masterContainer={masterContainer}
                        targetContainer={targetContainer}
                        isSelectedVideo={isSelectedVideo}
                        handleMouseDown={handleMouseDown}
                    />

                    <NudgeControls
                        onNudge={handleNudge}
                        isPreviewPlaying={isPreviewPlaying}
                        onPreviewToggle={handlePreviewToggle}
                    />

                    <div className="w-full max-w-md flex flex-col gap-3">
                        <button
                            onClick={handleConfirm}
                            className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl
                                hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-600/30
                                active:scale-[0.98] transition-all text-lg"
                        >
                            Onayla ve Devam Et
                        </button>
                    </div>
                </div>
            )}

            {phase === 'error' && <SyncPhaseError error={error} onReset={reset} />}
        </div>
    );
};
