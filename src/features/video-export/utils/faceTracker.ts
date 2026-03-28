import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

export interface CropCoordinate {
    time: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

let faceDetector: FaceDetector | null = null;
let globalSimulatedTimeMs = 0;

async function initFaceDetector() {
    if (faceDetector) return faceDetector;
    console.log("[FaceTracker] Loading Vision Tasks WASM and Model...");
    
    // Set a timeout for Wasm fetch just in case it hangs
    const visionPromise = FilesetResolver.forVisionTasks(
        "/models/mediapipe"
    );
    
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("MediaPipe Wasm download timeout (10s). Lütfen internet bağlantınızı kontrol edip tekrar deneyin.")), 10000);
    });

    const vision = await Promise.race([visionPromise, timeoutPromise]);
    console.log("[FaceTracker] Vision WASM loaded. Creating FaceDetector...");

    faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "/models/mediapipe/blaze_face_short_range.tflite",
            delegate: "GPU"
        },
        runningMode: "VIDEO",
    });
    console.log("[FaceTracker] FaceDetector initialized successfully.");
    return faceDetector;
}

export async function analyzeVideoForShorts(
    videoUrl: string, 
    startTime: number,
    endTime: number,
    onProgress: (p: number) => void,
    signal?: AbortSignal
): Promise<CropCoordinate[]> {
    try {
        console.log("[FaceTracker] Starting analysis. Source:", videoUrl.substring(0, 50) + "...");
        // Add a slight fake progress update so the UI knows we are loading models
        onProgress(0.01); 
        const detector = await initFaceDetector();
        console.log("[FaceTracker] Face detector ready. Creating video element...");
        
        return await new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous'; // Required to prevent WebGL tainted canvas error
            video.src = videoUrl;
            video.loop = false;
            video.muted = true;
            video.playsInline = true;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            const coordinates: CropCoordinate[] = [];
            const fps = 5; // Analyze at 5 fps
            const stepTime = 1 / fps;

            let targetW = 0;
            let targetH = 0;
            let smoothedCenterX = -1;
            let smoothedCenterY = -1;
            let lastFaceCenterX = -1;
            let lastFaceCenterY = -1;
            const alpha = 0.2; // Smoothing factor

            const processFrame = async () => {
                if (signal?.aborted) {
                    console.log("[FaceTracker] Analysis aborted by user.");
                    return reject(new Error('Aborted'));
                }
                
                if (!ctx) return reject(new Error('No canvas context found.'));

                try {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                } catch (err) {
                    console.error("[FaceTracker] Canvas draw error:", err);
                    return reject(err);
                }
                
                // Detect face using video directly if possible, or canvas as fallback
                // Strict monotonically increasing time required by MediaPipe
                globalSimulatedTimeMs += (1000 / fps);
                let detections;
                try {
                    // Wasm sometimes fails if video duration or state is weird, fallback to canvas
                    detections = detector.detectForVideo(canvas, globalSimulatedTimeMs);
                } catch (err) {
                    console.error("[FaceTracker] detectForVideo error:", err);
                    return reject(err);
                }
                
                let currentFaceX = lastFaceCenterX !== -1 ? lastFaceCenterX : canvas.width / 2;
                let currentFaceY = lastFaceCenterY !== -1 ? lastFaceCenterY : canvas.height / 2;

                if (detections && detections.detections && detections.detections.length > 0) {
                    const face = detections.detections[0].boundingBox;
                    if (face) {
                        currentFaceX = face.originX + (face.width / 2);
                        currentFaceY = face.originY + (face.height / 2);
                        lastFaceCenterX = currentFaceX;
                        lastFaceCenterY = currentFaceY;
                    }
                }

                // Exponential Moving Average
                if (smoothedCenterX === -1) {
                    smoothedCenterX = currentFaceX;
                    smoothedCenterY = currentFaceY;
                } else {
                    smoothedCenterX = alpha * currentFaceX + (1 - alpha) * smoothedCenterX;
                    smoothedCenterY = alpha * currentFaceY + (1 - alpha) * smoothedCenterY;
                }

                // Calculate crop box (x,y is top-left)
                let cropX = smoothedCenterX - targetW / 2;
                let cropY = smoothedCenterY - targetH / 2;

                // Constrain
                if (cropX < 0) cropX = 0;
                if (cropY < 0) cropY = 0;
                if (cropX + targetW > canvas.width) cropX = canvas.width - targetW;
                if (cropY + targetH > canvas.height) cropY = canvas.height - targetH;

                coordinates.push({
                    time: Math.round(video.currentTime * 1000) / 1000,
                    x: Math.round(cropX),
                    y: Math.round(cropY),
                    w: targetW,
                    h: targetH
                });

                const duration = endTime - startTime;
                const currentRelTime = video.currentTime - startTime;
                const progress = duration > 0 ? (currentRelTime / duration) : 1;
                onProgress(Math.min(Math.max(progress, 0), 1));

                // Next frame
                if (video.currentTime + stepTime <= endTime && video.currentTime + stepTime < video.duration) {
                    // Yield explicitly to prevent UI thread starvation
                    setTimeout(() => {
                        video.currentTime += stepTime;
                    }, 10);
                } else {
                    console.log("[FaceTracker] Analysis complete. Coordinates generated:", coordinates.length);
                    resolve(coordinates);
                }
            };

            video.addEventListener('seeked', processFrame);

            video.addEventListener('loadeddata', () => {
                console.log("[FaceTracker] Video loadeddata fired. Dur:", video.duration);
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                targetH = canvas.height;
                targetW = Math.round((targetH * 9) / 16);
                if (targetW > canvas.width) {
                     targetW = canvas.width;
                     targetH = Math.round((targetW * 16) / 9);
                }
                
                if (endTime <= startTime) {
                    console.warn("[FaceTracker] endTime <= startTime. Aborting.");
                    return resolve([]);
                }
                
                if (signal?.aborted) {
                    return reject(new Error('Aborted'));
                }
                
                // We must ensure the very first frame gets processed.
                // If the video is AT the startTime, we just call processFrame.
                // Otherwise we seek.
                if (Math.abs(video.currentTime - startTime) > 0.05) {
                    video.currentTime = startTime;
                } else {
                    // Start process immediately since we're already exactly where we want to be.
                    processFrame();
                }
            });

            video.addEventListener('error', (_e) => {
                console.error("[FaceTracker] Video loaded error:", video.error);
                reject(new Error("Video loading error: " + (video.error?.message || String(video.error))));
            });

            // Trigger load to be safe
            video.load();
            
            // Handle immediate aborts
            if (signal) {
                signal.addEventListener('abort', () => {
                    video.pause();
                    video.removeAttribute('src');
                    video.load();
                    reject(new Error('Aborted'));
                });
            }
        });
    } catch (err) {
        console.error("[FaceTracker] Fatal error:", err);
        throw err;
    }
}

export function interpolateCrop(coords: CropCoordinate[], targetFps: number = 30): CropCoordinate[] {
    if (coords.length < 2) return coords;
    
    const interpolated: CropCoordinate[] = [];
    const step = 1 / targetFps;

    for (let i = 0; i < coords.length - 1; i++) {
        const start = coords[i];
        const end = coords[i + 1];
        const duration = end.time - start.time;
        
        if (duration <= 0) continue;
        
        // Number of frames to insert
        const numFrames = Math.max(1, Math.round(duration / step));
        const actualStep = duration / numFrames;
        
        for (let j = 0; j < numFrames; j++) {
            const t = j / numFrames;
            interpolated.push({
                time: start.time + (j * actualStep),
                x: start.x + t * (end.x - start.x),
                y: start.y + t * (end.y - start.y),
                w: start.w + t * (end.w - start.w),
                h: start.h + t * (end.h - start.h)
            });
        }
    }
    
    // Add the very last coordinate
    interpolated.push(coords[coords.length - 1]);
    
    return interpolated;
}
