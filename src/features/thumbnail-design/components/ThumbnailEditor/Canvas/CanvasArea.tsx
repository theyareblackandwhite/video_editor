import React, { useRef } from 'react';
import { useStageScale } from '../../../hooks/useStageScale';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';
import { KonvaStage } from './KonvaStage';

interface CanvasAreaProps {
  stageRef: React.RefObject<any>;
}

export const CanvasArea: React.FC<CanvasAreaProps> = ({ stageRef }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { stageScale, STAGE_WIDTH, STAGE_HEIGHT } = useStageScale(containerRef);
  const { thumbnailBackground } = useThumbnailStore();

  return (
    <div 
      ref={containerRef}
      className="flex-1 w-full flex items-center justify-center p-8 bg-black relative"
    >
      {/* Stage Wrapper */}
      <div 
        style={{ width: STAGE_WIDTH * stageScale, height: STAGE_HEIGHT * stageScale }}
        className="shadow-2xl ring-1 ring-white/10 overflow-hidden relative"
      >
        <KonvaStage 
          stageRef={stageRef}
          stageScale={stageScale}
          stageWidth={STAGE_WIDTH}
          stageHeight={STAGE_HEIGHT}
        />
      </div>
      
      {/* Empty State Overlay */}
      {!thumbnailBackground && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40 pr-80 transition-opacity">
          <p className="text-slate-400 text-lg bg-slate-800/90 px-8 py-4 rounded-full border border-slate-700 shadow-2xl backdrop-blur-md">
            Sağdaki önizlemeden bir kare yakalayın ✨
          </p>
        </div>
      )}
    </div>
  );
};
