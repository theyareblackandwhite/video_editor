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

/**
 * Captures an entire preview container including multiple videos, their layouts,
 * and current transforms (zoom/pan) applied to them.
 */
export const capturePreviewContainer = (container: HTMLElement): string => {
  const canvas = document.createElement('canvas');
  
  // Use scale for higher quality snapshot
  const pixelRatio = window.devicePixelRatio || 2;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * pixelRatio;
  canvas.height = rect.height * pixelRatio;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context');
  
  ctx.scale(pixelRatio, pixelRatio);

  // Fill container background (default to black)
  const containerStyle = window.getComputedStyle(container);
  ctx.fillStyle = containerStyle.backgroundColor || '#000';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const videos = Array.from(container.querySelectorAll('video'));

  videos.forEach(video => {
    if (video.readyState < 2) return;

    const wrapper = video.parentElement;
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const style = window.getComputedStyle(video);

    // X, Y position relative to container
    const wx = wrapperRect.left - rect.left;
    const wy = wrapperRect.top - rect.top;

    ctx.save();

    // Clip to wrapper to respect overflow-hidden (in case of scaled videos)
    ctx.beginPath();
    ctx.rect(wx, wy, wrapperRect.width, wrapperRect.height);
    ctx.clip();

    // Calculate object-fit: contain dimensions
    const videoRatio = video.videoWidth / video.videoHeight;
    const wrapperRatio = wrapperRect.width / wrapperRect.height;
    
    let drawW, drawH;
    
    // For our TimelineEdit, videos usually fill the area or contain
    if (style.objectFit === 'contain' || style.objectFit === '') {
      if (videoRatio > wrapperRatio) {
        drawW = wrapperRect.width;
        drawH = wrapperRect.width / videoRatio;
      } else {
        drawH = wrapperRect.height;
        drawW = wrapperRect.height * videoRatio;
      }
    } else {
      drawW = wrapperRect.width;
      drawH = wrapperRect.height;
    }

    // Center in wrapper
    let drawX = wx + (wrapperRect.width - drawW) / 2;
    let drawY = wy + (wrapperRect.height - drawH) / 2;

    // Apply CSS transforms
    const transform = style.transform;
    if (transform && transform !== 'none') {
      // transform origin is typically center
      ctx.translate(wx + wrapperRect.width / 2, wy + wrapperRect.height / 2);
      const domMatrix = new DOMMatrix(transform);
      ctx.transform(domMatrix.a, domMatrix.b, domMatrix.c, domMatrix.d, domMatrix.e, domMatrix.f);
      ctx.translate(-(wx + wrapperRect.width / 2), -(wy + wrapperRect.height / 2));
    }

    ctx.drawImage(video, drawX, drawY, drawW, drawH);
    ctx.restore();

    // Draw right border if any (split-screen divider)
    const wrapperStyle = window.getComputedStyle(wrapper);
    const borderRight = parseFloat(wrapperStyle.borderRightWidth);
    if (borderRight > 0) {
      ctx.fillStyle = wrapperStyle.borderRightColor;
      ctx.fillRect(wx + wrapperRect.width - borderRight, wy, borderRight, wrapperRect.height);
    }
  });

  return canvas.toDataURL('image/jpeg', 0.9);
};
