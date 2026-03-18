import React, { useState, useEffect } from 'react';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { useAppStore } from '../../../app/store';
import { useFFmpeg } from '../hooks/useFFmpeg';
import type { ExportConfig } from '../utils/ffmpegUtils';
import { useExportProcess } from '../hooks/useExportProcess';

import { ExportConfigPanel } from './ExportConfigPanel';
import { ExportSummary } from './ExportSummary';
import { ExportProcessing } from './ExportProcessing';
import { ExportDone } from './ExportDone';

export const VideoExport: React.FC = () => {
    const { videoFiles, audioFiles, cuts, layoutMode, transitionType, setStep } = useAppStore();
    const { ffmpeg, load, isLoaded, isLoading: isFfmpegLoading, message: ffmpegMessage } = useFFmpeg();

    const masterVideo = videoFiles.find(v => v.isMaster) || videoFiles[0];

    const [config, setConfig] = useState<ExportConfig>({
        format: 'mp4',
        quality: 'high',
        includeAudio: audioFiles.length > 0,
        applyCuts: cuts.length > 0,
        normalizeAudio: true,
        layoutMode,
        transitionType
    });

    useEffect(() => {
        load();
    }, [load]);

    const estimatedSize = masterVideo
        ? (() => {
            const baseSize = masterVideo.file.size * (1 + (videoFiles.length - 1) * 0.5);
            const qualityMultiplier = config.quality === 'high' ? 1 : config.quality === 'medium' ? 0.6 : 0.3;
            const formatMultiplier = config.format === 'webm' ? 0.7 : 1;
            let cutReduction = 1;
            if (config.applyCuts && cuts.length > 0) {
                cutReduction = 0.8;
            }
            return Math.round(baseSize * qualityMultiplier * formatMultiplier * cutReduction);
        })()
        : 0;

    const {
        phase, progress, progressLabel, outputBlob, outputUrl, elapsedTime,
        handleExport, handleDownload, handleReset
    } = useExportProcess({
        config, masterVideo, videoFiles, audioFiles, cuts, ffmpeg, isLoaded
    });

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            {phase === 'config' && (
                <>
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Dışa Aktar</h2>
                            <p className="text-sm text-gray-500">Çıktı ayarlarını seçin ve videonuzu kaydedin.</p>
                        </div>
                        <button
                            onClick={() => setStep(3)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                        >
                            <ArrowLeft size={16} /> Geri
                        </button>
                    </div>

                    {!isLoaded && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                            <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="font-semibold text-yellow-800">FFmpeg Yükleniyor...</h4>
                                <p className="text-sm text-yellow-700 mt-1">
                                    Video işleme motoru tarayıcınıza yükleniyor. İlk yükleme internet hızınıza bağlı olarak zaman alabilir.
                                </p>
                                {isFfmpegLoading && <Loader2 className="animate-spin mt-2 text-yellow-600" size={20} />}
                                {ffmpegMessage && <p className="text-sm text-red-600 mt-2">{ffmpegMessage}</p>}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <ExportConfigPanel 
                            config={config} 
                            setConfig={setConfig} 
                            audioFilesCount={audioFiles.length} 
                            cutsCount={cuts.length} 
                        />
                        <ExportSummary 
                            config={config}
                            masterVideo={masterVideo}
                            videoFilesCount={videoFiles.length}
                            audioFilesCount={audioFiles.length}
                            cutsCount={cuts.length}
                            estimatedSize={estimatedSize}
                            onExport={handleExport}
                            isLoaded={isLoaded}
                            isFfmpegLoading={isFfmpegLoading}
                        />
                    </div>
                </>
            )}

            {phase === 'processing' && (
                <ExportProcessing 
                    progress={progress} 
                    progressLabel={progressLabel} 
                    elapsedTime={elapsedTime} 
                />
            )}

            {phase === 'done' && outputBlob && (
                <ExportDone 
                    outputBlob={outputBlob} 
                    outputUrl={outputUrl} 
                    config={config} 
                    elapsedTime={elapsedTime} 
                    onDownload={handleDownload} 
                    onReset={handleReset} 
                />
            )}
        </div>
    );
};
