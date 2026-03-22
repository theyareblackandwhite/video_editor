import React, { useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Line } from 'react-konva';
import useImage from 'use-image';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';
import { useMagneticSnapping } from '../../../hooks/useMagneticSnapping';
import { ObjectRenderer } from './ObjectRenderer';

interface KonvaStageProps {
  stageScale: number;
  stageWidth: number;
  stageHeight: number;
  stageRef: React.RefObject<any>;
}

export const KonvaStage: React.FC<KonvaStageProps> = ({ stageScale, stageWidth, stageHeight, stageRef }) => {
  const {
    thumbnailBackground,
    thumbnailObjects,
    bgOverlayOpacity,
    selectedObjectId,
    selectObject
  } = useThumbnailStore();

  const layerRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [bgImage] = useImage(thumbnailBackground || '', 'anonymous');

  const { guidelines, handleDragMove, handleDragEnd } = useMagneticSnapping(stageWidth, stageHeight);

  // Attach transformer to selected object
  useEffect(() => {
    if (selectedObjectId) {
      const selectedObj = thumbnailObjects.find(o => o.id === selectedObjectId);
      const isLocked = selectedObj?.isLocked;
      const isVisible = selectedObj?.isVisible !== false;

      if (isLocked || !isVisible) {
        trRef.current?.nodes([]);
        return;
      }

      const selectedNode = layerRef.current?.findOne('#' + selectedObjectId);
      if (selectedNode && trRef.current) {
        trRef.current.nodes([selectedNode]);
        trRef.current.getLayer().batchDraw();
      }
    } else if (trRef.current) {
      trRef.current.nodes([]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedObjectId, thumbnailObjects]);

  return (
    <Stage
      ref={stageRef}
      width={stageWidth}
      height={stageHeight}
      scaleX={stageScale}
      scaleY={stageScale}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) {
          selectObject(null);
        }
      }}
    >
      <Layer ref={layerRef}>
        {bgImage && (
          <KonvaImage
            image={bgImage}
            width={stageWidth}
            height={stageHeight}
          />
        )}
        {bgOverlayOpacity > 0 && (
          <Rect
            x={0}
            y={0}
            width={stageWidth}
            height={stageHeight}
            fill="black"
            opacity={bgOverlayOpacity / 100}
            listening={false}
          />
        )}
        
        {thumbnailObjects.map(obj => (
          <ObjectRenderer 
            key={obj.id} 
            obj={obj} 
            handleDragMove={handleDragMove}
            handleDragEnd={handleDragEnd}
          />
        ))}
        
        {/* Magnetic Guidelines */}
        {guidelines.map((line: any, i: number) => (
          <Line
            key={`guideline-${i}`}
            points={line.points}
            stroke="#f55656"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
        ))}
        
        {/* Transformer enables resizing and rotating */}
        {selectedObjectId && (
          <Transformer
            ref={trRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                return oldBox;
              }
              return newBox;
            }}
          />
        )}
      </Layer>
    </Stage>
  );
};
