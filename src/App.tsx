import React, { useRef, useEffect, useState } from 'react';
import { MediaUpload } from './features/media-upload';
import { AudioSync } from './features/audio-sync';
import { TimelineEdit } from './features/timeline-edit';
import { ThumbnailEditor } from './features/thumbnail-design';
import { ShortsCreator } from './features/video-export/components/ShortsCreator';
import { VideoExport } from './features/video-export';
import { useAppStore } from './app/store';
import { useThumbnailStore } from './store/thumbnailSlice';
import { captureVideoFrame, capturePreviewContainer } from './shared/utils/captureFrame';
import { ErrorBoundary } from './shared/ui';
import { StepBar } from './shared/ui';
import { CheckCircle2 } from 'lucide-react';

const StepComponents: Record<number, React.FC<any>> = {
  1: MediaUpload,
  2: AudioSync,
  3: TimelineEdit,
  4: ThumbnailEditor,
  5: VideoExport,
  6: ShortsCreator,
};

function App() {
  const { currentStep, videoFiles, audioFiles, hydrateSession } = useAppStore();

  const [displayedStep, setDisplayedStep] = useState(currentStep);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [animating, setAnimating] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const prevStepRef = useRef(currentStep);
  const masterVideoRef = useRef<HTMLVideoElement>(null);

  // Monitor store hydration
  useEffect(() => {
    const unsub = useAppStore.persist.onHydrate(() => setIsHydrated(false));
    const unsubFinish = useAppStore.persist.onFinishHydration(() => setIsHydrated(true));
    
    // Initial check
    if (useAppStore.persist.hasHydrated()) {
      setIsHydrated(true);
    }

    return () => {
      unsub();
      unsubFinish();
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    // Check if we need to hydrate the binary data (Blob URLs)
    const state = useAppStore.getState();
    if (state.videoFiles.length > 0 || state.audioFiles.length > 0) {
      // If we have metadata but no actual File objects (after refresh), hydrate
      const needsHydration = state.videoFiles.some(vf => !vf.file && !vf.error);
      if (needsHydration) {
        hydrateSession().catch(console.error);
      }
    }
  }, [isHydrated, hydrateSession]);

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
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-[100] flex items-center px-4 h-16">
          <div className="flex items-center gap-2 mr-6 flex-shrink-0">
             <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                <CheckCircle2 size={20} className="text-white" />
             </div>
             <span className="font-black text-xl tracking-tighter text-gray-900">PODCUT</span>
          </div>

          {/* Dynamic Title based on Step */}
          <div className="hidden lg:block mr-4 flex-shrink-0 animate-in fade-in slide-in-from-left-4 duration-500 min-w-[140px]">
            {currentStep === 1 && (
              <>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">Medya Yükle</h2>
                <p className="text-[10px] text-gray-500 font-medium">Dosyalarınızı ekleyin</p>
              </>
            )}
            {currentStep === 2 && (
              <>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">Ses Senkronize</h2>
                <p className="text-[10px] text-gray-500 font-medium">Kamera & Mikrofon eşleme</p>
              </>
            )}
            {currentStep === 3 && (
              <>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">Düzenle & Kes</h2>
                <p className="text-[10px] text-gray-500 font-medium">Kesim noktalarınızı belirleyin</p>
              </>
            )}
            {currentStep === 4 && (
              <>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">Kapak Tasarla</h2>
                <p className="text-[10px] text-gray-500 font-medium">Video görselini hazırlayın</p>
              </>
            )}
            {currentStep === 5 && (
              <>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">Dışa Aktar</h2>
                <p className="text-[10px] text-gray-500 font-medium">Videonuzu kaydedin</p>
              </>
            )}
            {currentStep === 6 && (
              <>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">Shorts Oluştur</h2>
                <p className="text-[10px] text-gray-500 font-medium">Sosyal medya için kes</p>
              </>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <StepBar hideLogo />
          </div>

          <div className="flex items-center gap-3 ml-4 flex-shrink-0 min-w-[200px] justify-end animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Standardized Back Button (Steps 2-6) */}
            {currentStep > 1 && (
              <button
                onClick={() => {
                  const targetStep = currentStep === 3 && videoFiles.length <= 1 && audioFiles.length === 0 ? 1 : currentStep - 1;
                  useAppStore.getState().setStep(targetStep);
                }}
                className="px-4 py-2 bg-white text-gray-600 text-sm rounded-xl hover:bg-gray-50 transition-all font-semibold border border-gray-200 shadow-sm active:scale-95"
              >
                ← Geri
              </button>
            )}

            {/* Step-specific Next Buttons */}
            {currentStep === 3 && (
              <button
                onClick={() => {
                  const previewEl = document.getElementById('video-preview-container');
                  if (previewEl) {
                    try {
                      // Capture the entire layout (including crops, multi-cam)
                      const base64 = capturePreviewContainer(previewEl);
                      useThumbnailStore.getState().setThumbnailBackground(base64);
                    } catch (err) {
                      console.error("Preview capture failed, falling back to master video:", err);
                      // Fallback
                      const videoEl = masterVideoRef.current;
                      if (videoEl) {
                        try {
                          const base64 = captureVideoFrame(videoEl);
                          useThumbnailStore.getState().setThumbnailBackground(base64);
                        } catch (fallbackErr) {
                          console.error("Auto-capture failed:", fallbackErr);
                        }
                      }
                    }
                  } else {
                    const videoEl = masterVideoRef.current;
                    if (videoEl) {
                      try {
                        const base64 = captureVideoFrame(videoEl);
                        useThumbnailStore.getState().setThumbnailBackground(base64);
                      } catch (err) {
                        console.error("Auto-capture failed:", err);
                      }
                    }
                  }
                  useAppStore.getState().setStep(4);
                }}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl
                  hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all"
              >
                Kapak Tasarla →
              </button>
            )}
            {currentStep === 4 && (
              <button
                onClick={() => useAppStore.getState().setStep(5)}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl
                  hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all"
              >
                Dışa Aktar →
              </button>
            )}
            {currentStep === 5 && (
              <button
                onClick={() => useAppStore.getState().setStep(6)}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl
                  hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all"
              >
                Shorts Oluştur →
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4">
          <div className="max-w-7xl mx-auto">
            <div className={`transition-all duration-300 ease-out ${getTransformClass()}`}>
              <ErrorBoundary>
                <Component masterVideoRef={masterVideoRef} />
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
