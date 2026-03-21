import { useState, useEffect } from 'react';
import type { RefObject } from 'react';

export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;

export const useStageScale = (containerRef: RefObject<HTMLDivElement | null>) => {
  const [stageScale, setStageScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const { clientWidth } = containerRef.current;
      const scale = clientWidth / STAGE_WIDTH;
      setStageScale(scale);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [containerRef]);

  return { stageScale, STAGE_WIDTH, STAGE_HEIGHT };
};
