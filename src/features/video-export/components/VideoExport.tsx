import React, { useState } from 'react';
import { useAppStore } from '../../../app/store';
import type { ExportConfig } from '../utils/ffmpegUtils';
import { useExportProcess } from '../hooks/useExportProcess';

import { ExportConfigPanel } from './ExportConfigPanel';
import { ExportSummary } from './ExportSummary';
import { ExportProcessing } from './ExportProcessing';
import { ExportDone } from './ExportDone';

export const VideoExport: React.FC = () => {
    const { videoFiles, audioFiles, cuts, layoutMode, transitionType } = useAppStore();

    const masterVideo = videoFiles.find(v => v.isMaster) || videoFiles[0];

    const [config, setConfig] = useState<ExportConfig>({
        format: 'mp4',
        quality: 'high',
        includeAudio: audioFiles.length > 0,
        applyCuts: cuts.length > 0,
        normalizeAudio: false,
        layoutMode,
        transitionType
    });

    const estimatedSize = masterVideo
        ? (() => {
            const baseSize = masterVideo.size * (1 + (videoFiles.length - 1) * 0.5);
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
        phase, progress, progressLabel, outputPath, elapsedTime,
        handleExport, handleReset
    } = useExportProcess({
        config, masterVideo, videoFiles, audioFiles, cuts
    });

    return (
        <div className="max-w-full mx-auto px-4">
            {phase === 'config' && (
                <>

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

            {phase === 'done' && outputPath && (
                <ExportDone 
                    outputPath={outputPath} 
                    config={config} 
                    elapsedTime={elapsedTime} 
                    onReset={handleReset} 
                />
            )}
        </div>
    );
};
