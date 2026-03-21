import { useState, useCallback } from 'react';

export const useMagneticSnapping = (STAGE_WIDTH: number, STAGE_HEIGHT: number) => {
  const [guidelines, setGuidelines] = useState<any[]>([]);

  const handleDragMove = useCallback((e: any) => {
    const node = e.target;
    const layer = node.getLayer();
    
    // Use relativeTo layer to avoid stage scale affecting the bounding box
    const box = node.getClientRect({ relativeTo: layer });
    const pos = node.position();

    // Snapping threshold
    const SNAP_THRESHOLD = 10;
    
    // Define snap targets (center and edges)
    const verticalTargets = [0, STAGE_WIDTH / 2, STAGE_WIDTH];
    const horizontalTargets = [0, STAGE_HEIGHT / 2, STAGE_HEIGHT];
    
    const objLeft = box.x;
    const objCenterX = box.x + box.width / 2;
    const objRight = box.x + box.width;
    
    const objTop = box.y;
    const objCenterY = box.y + box.height / 2;
    const objBottom = box.y + box.height;
    
    let snapX: number | null = null;
    let snapY: number | null = null;
    let offsetX = 0;
    let offsetY = 0;
    
    const newGuidelines: any[] = [];
    
    let minDistanceX = Infinity;
    for (const target of verticalTargets) {
      const distLeft = Math.abs(target - objLeft);
      if (distLeft < SNAP_THRESHOLD && distLeft < minDistanceX) {
        minDistanceX = distLeft;
        snapX = target;
        offsetX = target - objLeft;
      }
      const distCenter = Math.abs(target - objCenterX);
      if (distCenter < SNAP_THRESHOLD && distCenter < minDistanceX) {
        minDistanceX = distCenter;
        snapX = target;
        offsetX = target - objCenterX;
      }
      const distRight = Math.abs(target - objRight);
      if (distRight < SNAP_THRESHOLD && distRight < minDistanceX) {
        minDistanceX = distRight;
        snapX = target;
        offsetX = target - objRight;
      }
    }
    
    let minDistanceY = Infinity;
    for (const target of horizontalTargets) {
        const distTop = Math.abs(target - objTop);
        if (distTop < SNAP_THRESHOLD && distTop < minDistanceY) {
            minDistanceY = distTop;
            snapY = target;
            offsetY = target - objTop;
        }
        const distCenterY = Math.abs(target - objCenterY);
        if (distCenterY < SNAP_THRESHOLD && distCenterY < minDistanceY) {
            minDistanceY = distCenterY;
            snapY = target;
            offsetY = target - objCenterY;
        }
        const distBottom = Math.abs(target - objBottom);
        if (distBottom < SNAP_THRESHOLD && distBottom < minDistanceY) {
            minDistanceY = distBottom;
            snapY = target;
            offsetY = target - objBottom;
        }
    }
    
    if (snapX !== null || snapY !== null) {
        const newPos = { ...pos };
        if (snapX !== null) {
            newPos.x += offsetX;
            newGuidelines.push({
                points: [snapX, 0, snapX, STAGE_HEIGHT],
                orientation: 'V'
            });
        }
        if (snapY !== null) {
            newPos.y += offsetY;
            newGuidelines.push({
                points: [0, snapY, STAGE_WIDTH, snapY],
                orientation: 'H'
            });
        }
        node.position(newPos);
    }
    
    setGuidelines(newGuidelines);
  }, [STAGE_WIDTH, STAGE_HEIGHT]);

  const handleDragEnd = useCallback(() => {
    setGuidelines([]);
  }, []);

  return { guidelines, handleDragMove, handleDragEnd };
};
