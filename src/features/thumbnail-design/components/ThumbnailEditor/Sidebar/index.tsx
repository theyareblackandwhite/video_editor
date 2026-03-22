import React, { useState } from 'react';
import { useThumbnailStore } from '../../../../../store/thumbnailSlice';
import { PropertiesPanel } from './PropertiesPanel';
import { BackgroundPanel } from './BackgroundPanel';
import { VideoPreviewPanel } from './VideoPreviewPanel';
import { LayersPanel } from './LayersPanel';
import { SidebarTabs, type SidebarTab } from './SidebarTabs';
import { ElementsPanel } from './ElementsPanel';
import { TemplatesPanel } from './TemplatesPanel';

interface SidebarProps {
  externalVideoRef?: React.RefObject<HTMLVideoElement | null>;
  internalVideoRef: React.RefObject<HTMLVideoElement | null>;
}

export const Sidebar: React.FC<SidebarProps> = ({ externalVideoRef, internalVideoRef }) => {
  const { selectedObjectId } = useThumbnailStore();
  const [activeTab, setActiveTab] = useState<SidebarTab>('edit');

  return (
    <div className="absolute top-8 right-8 flex flex-col gap-4 w-64 z-50 h-[calc(100vh-100px)]">
      <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-4">
        {activeTab === 'edit' && (
          <>
            <LayersPanel />
            {selectedObjectId ? <PropertiesPanel /> : <BackgroundPanel />}
          </>
        )}

        {activeTab === 'elements' && <ElementsPanel />}
        {activeTab === 'templates' && <TemplatesPanel />}
      </div>

      <VideoPreviewPanel externalVideoRef={externalVideoRef} internalVideoRef={internalVideoRef} />
    </div>
  );
};
