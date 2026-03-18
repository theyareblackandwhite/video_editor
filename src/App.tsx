import React, { useRef, useEffect, useState } from 'react';
import { MediaUpload } from './features/media-upload';
import { AudioSync } from './features/audio-sync';
import { TimelineEdit } from './features/timeline-edit';
import { VideoExport } from './features/video-export';
import { useAppStore } from './app/store';
import { ErrorBoundary } from './shared/ui';
import { StepBar } from './shared/ui';

const StepComponents: Record<number, React.FC> = {
  1: MediaUpload,
  2: AudioSync,
  3: TimelineEdit,
  4: VideoExport,
};

function App() {
  const { currentStep } = useAppStore();
  const [displayedStep, setDisplayedStep] = useState(currentStep);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [animating, setAnimating] = useState(false);
  const prevStepRef = useRef(currentStep);

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
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <StepBar />
      <main className="max-w-7xl mx-auto p-4">
        <div className={`transition-all duration-300 ease-out ${getTransformClass()}`}>
          <ErrorBoundary>
            <Component />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

export default App;
