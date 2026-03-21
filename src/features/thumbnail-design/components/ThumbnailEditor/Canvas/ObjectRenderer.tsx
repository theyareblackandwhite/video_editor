import React from 'react';
import { Text, Rect, Circle } from 'react-konva';
import { useThumbnailStore, type ThumbnailObject } from '../../../../../store/thumbnailSlice';
import { StickerImage } from './StickerImage';

interface ObjectRendererProps {
  obj: ThumbnailObject;
  handleDragMove: (e: any) => void;
  handleDragEnd: () => void;
}

export const ObjectRenderer: React.FC<ObjectRendererProps> = ({ obj, handleDragMove, handleDragEnd }) => {
  const { selectObject, updateThumbnailObject } = useThumbnailStore();

  const commonProps = {
    ...obj,
    key: obj.id,
    id: obj.id,
    draggable: true,
    onClick: () => selectObject(obj.id),
    onTap: () => selectObject(obj.id),
    onDragMove: handleDragMove,
    onDragEnd: (e: any) => {
      handleDragEnd();
      updateThumbnailObject(obj.id, {
        x: e.target.x(),
        y: e.target.y(),
      });
    },
    onTransformEnd: (e: any) => {
      const node = e.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      node.scaleX(1);
      node.scaleY(1);

      if (obj.type === 'text') {
         updateThumbnailObject(obj.id, {
           x: node.x(),
           y: node.y(),
           fontSize: Math.max(5, (obj.fontSize || 20) * scaleX),
           rotation: node.rotation(),
         });
      } else {
         updateThumbnailObject(obj.id, {
           x: node.x(),
           y: node.y(),
           width: Math.max(5, (obj.width || 100) * scaleX),
           height: Math.max(5, (obj.height || 100) * scaleY),
           rotation: node.rotation(),
         });
      }
    }
  };

  switch (obj.type) {
    case 'text':
      return <Text {...commonProps} />;
    case 'rect':
      return <Rect {...commonProps} />;
    case 'circle':
      return <Circle {...commonProps} radius={(obj.width || 100) / 2} />;
    case 'image':
      return <StickerImage key={obj.id} obj={obj} commonProps={commonProps} />;
    default:
      return null;
  }
};
