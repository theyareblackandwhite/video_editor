import React, { useRef, useEffect, useState } from 'react';
import { MediaUpload } from './features/media-upload';
import { AudioSync } from './features/audio-sync';
import { TimelineEdit } from './features/timeline-edit';
import { VideoExport } from './features/video-export';
import { useAppStore } from './app/store';
import { ErrorBoundary, ProjectSidebar } from './shared/ui';
import { StepBar } from './shared/ui';
import { Menu } from 'lucide-react';

const StepComponents: Record<number, React.FC> = {
  1: MediaUpload,
  2: AudioSync,
  3: TimelineEdit,
  4: VideoExport,
};

function App() {
  const { currentStep, createProject, switchProject, hydrateProject } = useAppStore();
  const projectsLength = useAppStore(state => state.projects.length);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const firstProjectId = useAppStore(state => state.projects[0]?.id);

  const [displayedStep, setDisplayedStep] = useState(currentStep);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [animating, setAnimating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const prevStepRef = useRef(currentStep);

  useEffect(() => {
    // If no projects exist, create the default one.
    if (projectsLength === 0) {
      createProject('Adsız Proje 1');
    } else if (projectsLength > 0 && !currentProjectId && firstProjectId) {
      // If there are projects but none is selected, switch to the first one
      switchProject(firstProjectId);
      hydrateProject(firstProjectId).catch(console.error);
    } else if (currentProjectId) {
      // Perform initial hydration if we reload the page and have a current project
      // Because current files are not persisted to localStorage.
      const state = useAppStore.getState();
      if (state.videoFiles.length === 0 && state.audioFiles.length === 0) {
        const project = state.projects.find(p => p.id === currentProjectId);
        if (project && (project.state.videoFiles.length > 0 || project.state.audioFiles.length > 0)) {
          hydrateProject(currentProjectId).catch(console.error);
        }
      }
    }
  }, [projectsLength, currentProjectId, firstProjectId, createProject, switchProject, hydrateProject]);

  useEffect(() => {
    if (currentStep !== prevStepRef.current) {
      // Defer state updates to avoid React's set-state-in-effect warning
      const direction = currentStep > prevStepRef.current ? 'right' : 'left';

      queueMicrotask(() => {
        setDirection(direction);
        setAnimating(true);
      });

      // After exit animation, swap content and do enter animation
      const timer = setTimeout(() => {
        setDisplayedStep(currentStep);
        prevStepRef.current = currentStep;
        // Short delay to allow the new content to mount before enter animation
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setAnimating(false);
          });
        });
      }, 200); // matches exit animation duration

      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  const Component = StepComponents[displayedStep] || MediaUpload;

  // Animation classes
  const getTransformClass = () => {
    if (!animating && displayedStep === currentStep) {
      return 'translate-x-0 opacity-100';
    }
    if (animating && displayedStep !== currentStep) {
      // Exiting: slide out
      return direction === 'right'
        ? '-translate-x-8 opacity-0'
        : 'translate-x-8 opacity-0';
    }
    // Entering: start from offset
    return direction === 'right'
      ? 'translate-x-8 opacity-0'
      : '-translate-x-8 opacity-0';
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex h-screen overflow-hidden">
      <ProjectSidebar isOpen={sidebarOpen} />
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-[100] flex items-center px-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 mr-4 hover:bg-gray-100 rounded-lg text-gray-600 transition-all active:scale-95"
            title={sidebarOpen ? "Menüyü Kapat" : "Menüyü Aç"}
          >
            <Menu size={24} />
          </button>
          <div className="flex-1">
            <StepBar hideLogo />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4">
          <div className="max-w-7xl mx-auto">
            <div className={`transition-all duration-300 ease-out ${getTransformClass()}`}>
              <ErrorBoundary>
                <Component />
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
