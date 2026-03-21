import { useEffect } from 'react';
import { useThumbnailStore } from '../../../store/thumbnailSlice';

export const useThumbnailShortcuts = () => {
  const { selectedObjectId, removeThumbnailObject } = useThumbnailStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT');
      if (isInput) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId) {
        removeThumbnailObject(selectedObjectId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjectId, removeThumbnailObject]);
};
