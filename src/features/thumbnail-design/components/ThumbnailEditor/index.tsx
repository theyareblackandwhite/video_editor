import React, { useRef } from 'react';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { CanvasArea } from './Canvas/CanvasArea';
import { useThumbnailShortcuts } from '../../hooks/useThumbnailShortcuts';

interface ThumbnailEditorProps {
  masterVideoRef?: React.RefObject<HTMLVideoElement | null>;
}

export const ThumbnailEditor: React.FC<ThumbnailEditorProps> = ({ masterVideoRef }) => {
  const stageRef = useRef<any>(null);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  
  // Register global shortcuts
  useThumbnailShortcuts();

  return (
    <div className="flex flex-col w-full h-full bg-slate-900 overflow-hidden">
      <Toolbar 
        stageRef={stageRef} 
        externalVideoRef={masterVideoRef} 
        internalVideoRef={internalVideoRef} 
      />

      <div className="flex-1 w-full flex items-center justify-center p-8 bg-black relative">
        <CanvasArea stageRef={stageRef} />
        
        <Sidebar 
          externalVideoRef={masterVideoRef} 
          internalVideoRef={internalVideoRef} 
        />
      </div>
    </div>
  );
};
