// @ts-ignore
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

import type { FrameFaces, DirectorKeyframe } from '../../../app/store/types';

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
): Promise<FrameFaces[]> {
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

            const frameFacesCache: FrameFaces[] = [];
            const fps = 5; // Analyze at 5 fps
            const stepTime = 1 / fps;

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
                
                const faces = [];
                if (detections && detections.detections) {
                    for (const d of detections.detections) {
                        if (d.boundingBox) {
                            faces.push({
                                x: d.boundingBox.originX,
                                y: d.boundingBox.originY,
                                w: d.boundingBox.width,
                                h: d.boundingBox.height
                            });
                        }
                    }
                }

                frameFacesCache.push({
                    time: Math.round(video.currentTime * 1000) / 1000,
                    faces
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
                    console.log("[FaceTracker] Analysis complete. Frames generated:", frameFacesCache.length);
                    resolve(frameFacesCache);
                }
            };

            video.addEventListener('seeked', processFrame);

            video.addEventListener('loadeddata', () => {
                console.log("[FaceTracker] Video loadeddata fired. Dur:", video.duration);
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // We don't need targetW logic here anymore
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

export function buildTrajectory(
    cache: FrameFaces[],
    keyframes: DirectorKeyframe[],
    videoWidth: number,
    videoHeight: number
): CropCoordinate[] {
    if (!cache || cache.length === 0) return [];

    let targetH = videoHeight;
    let targetW = Math.round((targetH * 9) / 16);
    if (targetW > videoWidth) {
        targetW = videoWidth;
        targetH = Math.round((targetW * 16) / 9);
    }

    // Sort keyframes by time ascending
    const sortedKfs = [...keyframes].sort((a, b) => a.time - b.time);
    
    // If no keyframes, fallback to center of the video or the very first face
    let currentTargetCenter = { x: videoWidth / 2, y: videoHeight / 2 };
    
    if (sortedKfs.length > 0) {
        const firstFace = sortedKfs[0].targetFace;
        currentTargetCenter = { 
            x: firstFace.x + (firstFace.w / 2), 
            y: firstFace.y + (firstFace.h / 2) 
        };
    } else if (cache[0].faces.length > 0) {
        const firstFace = cache[0].faces[0];
        currentTargetCenter = { 
            x: firstFace.x + (firstFace.w / 2), 
            y: firstFace.y + (firstFace.h / 2) 
        };
    }

    const coordinates: CropCoordinate[] = [];
    let smoothedCenterX = currentTargetCenter.x;
    let smoothedCenterY = currentTargetCenter.y;
    const alpha = 0.2; // Smoothing factor
    
    let kfIndex = 0;

    for (const frame of cache) {
        // Did we cross a new keyframe?
        while (kfIndex < sortedKfs.length && frame.time >= sortedKfs[kfIndex].time - 0.05) {
            const face = sortedKfs[kfIndex].targetFace;
            currentTargetCenter = { x: face.x + (face.w / 2), y: face.y + (face.h / 2) };
            kfIndex++;
        }

        // Find the face closest to currentTargetCenter
        if (frame.faces.length > 0) {
            let closestFace = frame.faces[0];
            let minDistance = Infinity;

            for (const face of frame.faces) {
                const cx = face.x + (face.w / 2);
                const cy = face.y + (face.h / 2);
                const dist = Math.hypot(cx - currentTargetCenter.x, cy - currentTargetCenter.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestFace = face;
                }
            }

            // Dist > 20% of screen width indicates we probably lost the tracker
            if (minDistance < videoWidth * 0.3) {
                currentTargetCenter = { 
                    x: closestFace.x + (closestFace.w / 2), 
                    y: closestFace.y + (closestFace.h / 2) 
                };
            }
        }

        // Apply EMA smoothing
        smoothedCenterX = alpha * currentTargetCenter.x + (1 - alpha) * smoothedCenterX;
        smoothedCenterY = alpha * currentTargetCenter.y + (1 - alpha) * smoothedCenterY;

        let cropX = smoothedCenterX - targetW / 2;
        let cropY = smoothedCenterY - targetH / 2;

        if (cropX < 0) cropX = 0;
        if (cropY < 0) cropY = 0;
        if (cropX + targetW > videoWidth) cropX = videoWidth - targetW;
        if (cropY + targetH > videoHeight) cropY = videoHeight - targetH;

        coordinates.push({
            time: frame.time,
            x: Math.round(cropX),
            y: Math.round(cropY),
            w: targetW,
            h: targetH
        });
    }

    return coordinates;
}
