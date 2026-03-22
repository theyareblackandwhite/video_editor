import React from 'react';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';
import { PropertiesPanel } from './PropertiesPanel';
import { BackgroundPanel } from './BackgroundPanel';
import { VideoPreviewPanel } from './VideoPreviewPanel';
import { LayersPanel } from './LayersPanel';

interface SidebarProps {
  externalVideoRef?: React.RefObject<HTMLVideoElement | null>;
  internalVideoRef: React.RefObject<HTMLVideoElement | null>;
}

export const Sidebar: React.FC<SidebarProps> = ({ externalVideoRef, internalVideoRef }) => {
  const { selectedObjectId } = useThumbnailStore();

  return (
    <div className="absolute top-8 right-8 flex flex-col gap-4 w-64 z-50">
      <LayersPanel />
      {selectedObjectId ? <PropertiesPanel /> : <BackgroundPanel />}
      <VideoPreviewPanel externalVideoRef={externalVideoRef} internalVideoRef={internalVideoRef} />
    </div>
  );
};
