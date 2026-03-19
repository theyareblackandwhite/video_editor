import React, { useRef, useState, useMemo } from 'react';
import { useAppStore } from '../../../app/store';
import { fmtTime } from '../utils/timeFormat';

import { useMediaUrls } from '../hooks/useMediaUrls';
import { usePlayback } from '../hooks/usePlayback';
import { useWaveform } from '../hooks/useWaveform';
import { useCutOperations } from '../hooks/useCutOperations';
import { useCutDrag } from '../hooks/useCutDrag';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

import { VideoPreview } from './VideoPreview';
import { TransportControls } from './TransportControls';
import { CutToolbar } from './CutToolbar';
import { WaveformTimeline } from './WaveformTimeline';
import { CutListSidebar } from './CutListSidebar';

export const TimelineEdit: React.FC = () => {
    const { videoFiles, audioFiles, cuts, setCuts, layoutMode, setLayoutMode, setStep } = useAppStore();

    /* ── derived state ── */
    const masterVideo = useMemo(() => videoFiles.find(v => v.isMaster) || videoFiles[0], [videoFiles]);
    const otherVideos = useMemo(() => videoFiles.filter(v => v.id !== masterVideo?.id), [videoFiles, masterVideo]);
    const allAudioFiles = useMemo(() => audioFiles, [audioFiles]);

    /* ── refs ── */
    const masterVideoRef = useRef<HTMLVideoElement>(null);
    const otherVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
    const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
    const waveContainerRef = useRef<HTMLDivElement>(null);

    const [duration, setDuration] = useState(0);

    /* ── hooks ── */
    const mediaUrls = useMediaUrls(videoFiles, audioFiles);

    const {
        currentTime,
        isPlaying,
        setIsPlaying,
        seekTo,
        seekToRef,
        togglePlay,
        skip,
    } = usePlayback({
        masterVideoRef,
        otherVideoRefs,
        audioRefs,
        otherVideos,
        allAudioFiles,
        cuts,
        duration,
    });

    const { zoom, setZoom, waveScroll } = useWaveform({
        masterVideo,
        mediaUrls,
        waveContainerRef,
        seekToRef,
        setDuration,
    });

    const {
        markIn,
        selectedCut,
        cutsRef,
        handleMarkIn,
        handleCutOut,
        removeCut,
        jumpToCut,
        nudgeCutEdge,
        sortedCuts,
    } = useCutOperations({
        cuts,
        setCuts,
        currentTime,
        duration,
        seekTo,
    });

    const { dragging, handleEdgeDrag } = useCutDrag({
        duration,
        setCuts,
        cutsRef,
        waveScrollWidth: waveScroll.width,
    });

    useKeyboardShortcuts({
        togglePlay,
        handleMarkIn,
        handleCutOut,
        skip,
        selectedCut,
        removeCut,
    });

    /* ── render ── */
    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Düzenle & Kes</h2>
                    <p className="text-sm text-gray-500">Kesim noktalarını belirleyerek videoyu düzenleyin.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setStep(2)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                    >
                        Geri
                    </button>
                    <button
                        onClick={() => setStep(4)}
                        className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl
                            hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all"
                    >
                        Dışa Aktar →
                    </button>
                </div>
            </div>

            {/* ── Main Layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Left Column ── */}
                <div className="lg:col-span-2">
                    <VideoPreview
                        masterVideo={masterVideo}
                        otherVideos={otherVideos}
                        allAudioFiles={allAudioFiles}
                        videoFiles={videoFiles}
                        layoutMode={layoutMode}
                        setLayoutMode={setLayoutMode}
                        mediaUrls={mediaUrls}
                        masterVideoRef={masterVideoRef}
                        otherVideoRefs={otherVideoRefs}
                        audioRefs={audioRefs}
                        duration={duration}
                        setDuration={setDuration}
                        setIsPlaying={setIsPlaying}
                        currentTime={currentTime}
                        markIn={markIn}
                        fmtTime={fmtTime}
                    />

                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4">
                        <TransportControls
                            isPlaying={isPlaying}
                            togglePlay={togglePlay}
                            skip={skip}
                        />

                        <CutToolbar
                            markIn={markIn}
                            handleMarkIn={handleMarkIn}
                            handleCutOut={handleCutOut}
                            masterVideo={masterVideo}
                            videoFiles={videoFiles}
                            audioFiles={audioFiles}
                            cuts={cuts}
                            setCuts={setCuts}
                            fmtTime={fmtTime}
                            currentTime={currentTime}
                        />

                        <WaveformTimeline
                            waveContainerRef={waveContainerRef}
                            zoom={zoom}
                            setZoom={setZoom}
                            waveScroll={waveScroll}
                            duration={duration}
                            currentTime={currentTime}
                            sortedCuts={sortedCuts}
                            selectedCut={selectedCut}
                            dragging={dragging}
                            handleEdgeDrag={handleEdgeDrag}
                            jumpToCut={jumpToCut}
                            seekTo={seekTo}
                        />
                    </div>
                </div>

                {/* ── Right Sidebar ── */}
                <div className="lg:col-span-1">
                    <CutListSidebar
                        sortedCuts={sortedCuts}
                        cuts={cuts}
                        selectedCut={selectedCut}
                        duration={duration}
                        jumpToCut={jumpToCut}
                        removeCut={removeCut}
                        nudgeCutEdge={nudgeCutEdge}
                    />
                </div>
            </div>
        </div>
    );
};
