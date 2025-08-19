/**
 * Simple, gentle preprocessing that preserves text detail
 */

export interface SimplePreprocessConfig {
  mode: 'minimal' | 'balanced' | 'enhanced';
}

export class SimplePreprocessor {
  /**
   * Minimal preprocessing - just enough to help OCR
   */
  processMinimal(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const output = document.createElement('canvas');
    const ctx = output.getContext('2d')!;
    
    // Keep original size - no aggressive upscaling
    output.width = canvas.width;
    output.height = canvas.height;
    
    // Draw original
    ctx.drawImage(canvas, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, output.width, output.height);
    const data = imageData.data;
    
    // Very gentle grayscale conversion only
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return output;
  }

  /**
   * Balanced preprocessing - gentle enhancement
   */
  processBalanced(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const output = document.createElement('canvas');
    const ctx = output.getContext('2d')!;
    
    // Moderate upscaling if very small
    const scale = canvas.width < 300 ? 1.5 : 1.0;
    output.width = Math.floor(canvas.width * scale);
    output.height = Math.floor(canvas.height * scale);
    
    // Use bicubic scaling for quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, output.width, output.height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, output.width, output.height);
    const data = imageData.data;
    
    // Grayscale + very gentle contrast adjustment
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      // Very gentle contrast enhancement (1.2x)
      const enhanced = Math.min(255, Math.max(0, ((gray / 255 - 0.5) * 1.2 + 0.5) * 255));
      
      data[i] = enhanced;
      data[i + 1] = enhanced;
      data[i + 2] = enhanced;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return output;
  }

  /**
   * Enhanced preprocessing - still gentle but more processing
   */
  processEnhanced(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const output = document.createElement('canvas');
    const ctx = output.getContext('2d')!;
    
    // Moderate upscaling for better OCR
    const scale = canvas.width < 400 ? Math.min(2.0, 400 / canvas.width) : 1.0;
    output.width = Math.floor(canvas.width * scale);
    output.height = Math.floor(canvas.height * scale);
    
    // High quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, output.width, output.height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, output.width, output.height);
    const data = imageData.data;
    
    // Calculate image statistics for adaptive processing
    let min = 255, max = 0, sum = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      min = Math.min(min, gray);
      max = Math.max(max, gray);
      sum += gray;
      count++;
    }
    const mean = sum / count;
    const range = max - min;
    
    // Adaptive enhancement based on image characteristics
    for (let i = 0; i < data.length; i += 4) {
      let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      // Normalize to full range if image is low contrast
      if (range < 100) {
        gray = ((gray - min) / range) * 255;
      }
      
      // Gentle gamma correction if image is too dark or bright
      if (mean < 80) {
        // Brighten dark images
        gray = Math.pow(gray / 255, 0.8) * 255;
      } else if (mean > 180) {
        // Darken bright images
        gray = Math.pow(gray / 255, 1.2) * 255;
      }
      
      // Very gentle contrast (1.3x)
      gray = Math.min(255, Math.max(0, ((gray / 255 - 0.5) * 1.3 + 0.5) * 255));
      
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return output;
  }

  /**
   * Process with all modes and return all results
   */
  processAll(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
    return [
      this.processMinimal(canvas),
      this.processBalanced(canvas),
      this.processEnhanced(canvas)
    ];
  }
}

export const simplePreprocessor = new SimplePreprocessor();