import React, { useEffect } from 'react';
import { Text, Rect, Circle, Label, Tag } from 'react-konva';
import { useThumbnailStore, type ThumbnailObject } from '../../../../../store/thumbnailSlice';
import { StickerImage } from './StickerImage';
import { loadGoogleFont } from '../../../../../shared/utils/fontLoader';

interface ObjectRendererProps {
  obj: ThumbnailObject;
  handleDragMove: (e: any) => void;
  handleDragEnd: () => void;
}

export const ObjectRenderer: React.FC<ObjectRendererProps> = ({ obj, handleDragMove, handleDragEnd }) => {
  const { selectObject, updateThumbnailObject } = useThumbnailStore();

  // Load font if it's a text object
  useEffect(() => {
    if (obj.type === 'text' && obj.fontFamily) {
      loadGoogleFont(obj.fontFamily);
    }
  }, [obj.type, obj.fontFamily]);

  if (obj.isVisible === false) return null;

  const commonProps = {
    ...obj,
    key: obj.id,
    id: obj.id,
    draggable: !obj.isLocked,
    onClick: (e: any) => {
      if (obj.isLocked) return;
      e.cancelBubble = true;
      selectObject(obj.id);
    },
    onTap: (e: any) => {
      if (obj.isLocked) return;
      e.cancelBubble = true;
      selectObject(obj.id);
    },
    onDragMove: handleDragMove,
    onDragEnd: (e: any) => {
      if (obj.isLocked) return;
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
      if (obj.textBackgroundEnabled) {
        return (
          <Label {...commonProps}>
            <Tag 
              fill={obj.textBackgroundColor || '#000000'} 
              padding={obj.padding || 10}
              cornerRadius={5}
            />
            <Text 
              {...obj} 
              x={0} 
              y={0} 
              draggable={false}
              onClick={undefined}
              onTap={undefined}
            />
          </Label>
        );
      }
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
