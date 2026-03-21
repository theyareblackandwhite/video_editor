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
import { TransportControls, ShortcutHints } from './TransportControls';
import { CutToolbar } from './CutToolbar';
import { WaveformTimeline } from './WaveformTimeline';
import { CutListSidebar } from './CutListSidebar';

export const TimelineEdit: React.FC<{ masterVideoRef: React.RefObject<HTMLVideoElement | null> }> = ({ masterVideoRef }) => {
    const { videoFiles, audioFiles, cuts, setCuts, layoutMode, setLayoutMode, updateVideoTransform } = useAppStore();

    /* ── derived state ── */
    const masterVideo = useMemo(() => videoFiles.find(v => v.isMaster) || videoFiles[0], [videoFiles]);
    const otherVideos = useMemo(() => videoFiles.filter(v => v.id !== masterVideo?.id), [videoFiles, masterVideo]);
    const allAudioFiles = useMemo(() => audioFiles, [audioFiles]);
    const otherVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
    const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
    const waveContainerRef = useRef<HTMLDivElement>(null);
    const timelineContainerRef = useRef<HTMLDivElement>(null);

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

    const { zoom, setZoom } = useWaveform({
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
        zoom,
        containerRef: timelineContainerRef,
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
        <div className="w-full pl-64 pr-8 py-8">
            {/* ── Main Layout (Relative container for absolute sidebar) ── */}
            <div className="relative">

                {/* ── Left Sidebar: Controls (Absolute) ── */}
                <div className="absolute right-full mr-8 top-0 w-48 shrink-0 flex flex-col gap-4 hidden xl:flex">
                    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 sticky top-6">
                        <TransportControls
                            isPlaying={isPlaying}
                            togglePlay={togglePlay}
                            skip={skip}
                            layoutMode={layoutMode}
                            setLayoutMode={setLayoutMode}
                            hasMultipleVideos={videoFiles.length > 1}
                        />

                        <div className="my-4 border-t border-gray-100" />

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

                        <div className="mt-8 pt-4 border-t border-gray-50 opacity-60">
                            <ShortcutHints />
                        </div>
                    </div>
                </div>

                {/* ── Right Content: Preview & Timeline (Full Width) ── */}
                <div className="w-full flex flex-col gap-6">
                    {/* Fallback for smaller screens where absolute sidebar might overflow */}
                    <div className="xl:hidden bg-white rounded-2xl shadow-md border border-gray-100 p-4 mb-6">
                         <div className="flex flex-col gap-4">
                            <TransportControls
                                isPlaying={isPlaying}
                                togglePlay={togglePlay}
                                skip={skip}
                                layoutMode={layoutMode}
                                setLayoutMode={setLayoutMode}
                                hasMultipleVideos={videoFiles.length > 1}
                            />
                            <div className="border-t border-gray-100 my-2" />
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
                         </div>
                    </div>


                    <VideoPreview
                        masterVideo={masterVideo}
                        otherVideos={otherVideos}
                        allAudioFiles={allAudioFiles}
                        videoFiles={videoFiles}
                        layoutMode={layoutMode}
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
                        updateVideoTransform={updateVideoTransform}
                    />

                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                        <WaveformTimeline
                            waveContainerRef={waveContainerRef}
                            timelineContainerRef={timelineContainerRef}
                            zoom={zoom}
                            setZoom={setZoom}
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
            </div>



                {/* ── Bottom Section: Cut List ── */}
                <div className="w-full mt-6">
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
    );
};


