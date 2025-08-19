export interface ProcessingOptions {
  contrast?: number;
  brightness?: number;
  grayscale?: boolean;
  threshold?: number;
  cropBottom?: boolean;
  denoise?: boolean;
}

export function preprocessImage(
  canvas: HTMLCanvasElement,
  options: ProcessingOptions = {}
): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to get canvas context');

  const {
    contrast = 1.5,
    brightness = 1.1,
    grayscale = true,
    threshold = 0,
    cropBottom = true,
    denoise = false
  } = options;

  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Don't crop again if cropBottom is set - we already extracted the region
  // This option is now deprecated as extraction happens in extractCardRegion
  if (cropBottom && false) {
    const cropY = Math.floor(canvas.height * 0.75);
    const cropHeight = canvas.height - cropY;
    imageData = ctx.getImageData(0, cropY, canvas.width, cropHeight);
  }

  const data = imageData.data;

  // Apply filters
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Convert to grayscale if requested
    if (grayscale) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray;
    }

    // Apply brightness and contrast
    r = ((r / 255 - 0.5) * contrast + 0.5) * 255 * brightness;
    g = ((g / 255 - 0.5) * contrast + 0.5) * 255 * brightness;
    b = ((b / 255 - 0.5) * contrast + 0.5) * 255 * brightness;

    // Clamp values
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));

    // Apply threshold (binarization)
    if (threshold > 0) {
      const avg = (r + g + b) / 3;
      const value = avg > threshold ? 255 : 0;
      r = g = b = value;
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  // Simple denoise: median filter (3x3 kernel)
  if (denoise) {
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const neighbors = [];

        // Collect neighboring pixels
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            neighbors.push(data[nIdx]);
          }
        }

        // Get median value
        neighbors.sort((a, b) => a - b);
        const median = neighbors[4];

        output[idx] = median;
        output[idx + 1] = median;
        output[idx + 2] = median;
      }
    }

    imageData.data.set(output);
  }

  return imageData;
}

export function drawRegionGuide(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Draw the video frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Draw guide for positioning just the card bottom
  const centerY = canvas.height * 0.5;
  const guideHeight = 100; // Guide area for card bottom
  const guideWidth = Math.min(500, canvas.width * 0.7); // Guide width
  const centerX = canvas.width / 2;
  
  // Main scanning area indicator - narrower box
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]);
  
  // Draw rectangle guide
  ctx.beginPath();
  ctx.rect(
    centerX - guideWidth/2,
    centerY - guideHeight/2,
    guideWidth,
    guideHeight
  );
  ctx.stroke();
  
  // Visual guide for card positioning
  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 16px monospace'; // Smaller font
  ctx.textAlign = 'center';
  ctx.fillText('CARD BOTTOM ONLY', centerX, 30);
  
  // Example text showing what we're looking for
  ctx.font = '14px monospace';
  ctx.fillText('170/351 R', centerX, centerY - 5);
  ctx.fillText('C16 • EN', centerX, centerY + 15);
  
  // Reset text align
  ctx.textAlign = 'left';
  ctx.setLineDash([]);
}

export function extractCardRegion(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  regionType: 'full-bottom' | 'bottom-area' | 'full' | 'large-bottom' = 'full-bottom'
): HTMLCanvasElement {
  const tempCanvas = document.createElement('canvas');
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create temp canvas');

  let sourceY: number;
  let regionHeight: number;
  
  switch(regionType) {
    case 'full-bottom':
      // Crop to center area where the card bottom should be - larger region
      const cropWidth = Math.min(800, video.videoWidth * 0.8);
      const cropHeight = Math.min(250, video.videoHeight * 0.4);
      const cropX = (video.videoWidth - cropWidth) / 2;
      const cropY = (video.videoHeight - cropHeight) / 2;
      
      tempCanvas.width = cropWidth;
      tempCanvas.height = cropHeight;
      
      // Draw the cropped center region
      ctx.drawImage(
        video,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      );
      return tempCanvas;
    
    case 'large-bottom':
      // Focus on the bottom 20% of the center area where card info is
      const largeCropWidth = Math.min(640, video.videoWidth * 0.6);
      const largeCropHeight = Math.min(150, video.videoHeight * 0.2);
      const largeCropX = (video.videoWidth - largeCropWidth) / 2;
      // Position at bottom 30% of frame (where card bottom should be)
      const largeCropY = video.videoHeight * 0.7 - largeCropHeight / 2;
      
      tempCanvas.width = largeCropWidth;
      tempCanvas.height = largeCropHeight;
      
      ctx.drawImage(
        video,
        largeCropX, largeCropY, largeCropWidth, largeCropHeight,
        0, 0, largeCropWidth, largeCropHeight
      );
      return tempCanvas;
    case 'bottom-area':
      // Bottom 30% for when showing full card
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = Math.floor(video.videoHeight * 0.3);
      sourceY = video.videoHeight * 0.7;
      
      ctx.drawImage(
        video,
        0, sourceY, video.videoWidth, tempCanvas.height,
        0, 0, tempCanvas.width, tempCanvas.height
      );
      break;
    case 'full':
      // Full frame
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      sourceY = 0;
      
      ctx.drawImage(
        video,
        0, sourceY, video.videoWidth, tempCanvas.height,
        0, 0, tempCanvas.width, tempCanvas.height
      );
      break;
  }

  return tempCanvas;
}