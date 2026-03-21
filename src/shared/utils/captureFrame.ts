/**
 * Captures the current frame of an HTMLVideoElement and returns it as a base64 string.
 * @param videoElement The HTMLVideoElement to capture from.
 * @returns string (base64 JPEG data URL)
 */
export const captureVideoFrame = (videoElement: HTMLVideoElement): string => {
  const canvas = document.createElement('canvas');
  
  // Keep the same dimensions as the video source
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create 2D context for frame capture');
  }

  // Draw the current video frame onto the canvas
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  // Return base64 string
  return canvas.toDataURL('image/jpeg', 0.9);
};
