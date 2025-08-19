/**
 * Specialized Magic Card Text Processor
 * Optimized specifically for Magic: The Gathering card collector information
 */

export interface MagicCardResult {
  text: string;
  confidence: number;
  cardNumber?: string;
  totalCards?: string;
  setCode?: string;
  canvas: HTMLCanvasElement;
}

export class MagicCardProcessor {
  /**
   * Process a canvas specifically for Magic card collector information
   * Expected format: "170/351 R" or "C16 • EN" etc.
   */
  async processCardInfo(sourceCanvas: HTMLCanvasElement): Promise<MagicCardResult[]> {
    const results: MagicCardResult[] = [];
    
    // Try multiple preprocessing approaches optimized for card text
    const processors = [
      this.processForNumberSlashFormat.bind(this),
      this.processForSetCodeFormat.bind(this),
      this.processForRarityFormat.bind(this)
    ];
    
    for (const processor of processors) {
      try {
        const result = await processor(sourceCanvas);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.warn('[MagicCardProcessor] Processor failed:', error);
      }
    }
    
    return results;
  }
  
  /**
   * Optimized for "170/351" format
   */
  private async processForNumberSlashFormat(sourceCanvas: HTMLCanvasElement): Promise<MagicCardResult | null> {
    const canvas = this.cloneCanvas(sourceCanvas);
    
    // Step 1: Convert to grayscale for better number recognition
    this.convertToGrayscale(canvas);
    
    // Step 2: Increase contrast dramatically for numbers
    this.applyContrast(canvas, 3.0);
    
    // Step 3: Apply binary threshold optimized for printed numbers
    this.applyBinaryThreshold(canvas, 120);
    
    // Step 4: Upscale for better small text recognition
    if (canvas.width < 600) {
      this.upscaleCanvas(canvas, 4);
    }
    
    // Step 5: Clean up noise that might interfere with number recognition
    this.removeSmallNoise(canvas);
    
    return {
      text: '',
      confidence: 0.8,
      canvas,
    };
  }
  
  /**
   * Optimized for set codes like "C16", "NEO", "AFR"
   */
  private async processForSetCodeFormat(sourceCanvas: HTMLCanvasElement): Promise<MagicCardResult | null> {
    const canvas = this.cloneCanvas(sourceCanvas);
    
    // Step 1: Sharpen text for better letter recognition
    this.applySharpeningFilter(canvas, 2.5);
    
    // Step 2: Enhance contrast for alpha characters
    this.applyContrast(canvas, 2.5);
    
    // Step 3: Convert to grayscale
    this.convertToGrayscale(canvas);
    
    // Step 4: Apply threshold optimized for letters
    this.applyBinaryThreshold(canvas, 140);
    
    return {
      text: '',
      confidence: 0.7,
      canvas,
    };
  }
  
  /**
   * Optimized for rarity symbols and mixed text
   */
  private async processForRarityFormat(sourceCanvas: HTMLCanvasElement): Promise<MagicCardResult | null> {
    const canvas = this.cloneCanvas(sourceCanvas);
    
    // Step 1: Moderate preprocessing to preserve both numbers and letters
    this.convertToGrayscale(canvas);
    this.applyContrast(canvas, 2.2);
    this.applySharpeningFilter(canvas, 1.8);
    
    // Step 2: Adaptive threshold to handle varying backgrounds
    this.applyAdaptiveThreshold(canvas);
    
    return {
      text: '',
      confidence: 0.6,
      canvas,
    };
  }
  
  // Helper Methods
  
  private cloneCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    ctx.drawImage(sourceCanvas, 0, 0);
    return canvas;
  }
  
  private convertToGrayscale(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    ctx.putImageData(imageData, 0, 0);
  }
  
  private applyContrast(canvas: HTMLCanvasElement, contrast: number): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, ((data[i] / 255 - 0.5) * contrast + 0.5) * 255));
      data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] / 255 - 0.5) * contrast + 0.5) * 255));
      data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] / 255 - 0.5) * contrast + 0.5) * 255));
    }

    ctx.putImageData(imageData, 0, 0);
  }
  
  private applyBinaryThreshold(canvas: HTMLCanvasElement, threshold: number): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const value = gray > threshold ? 255 : 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }

    ctx.putImageData(imageData, 0, 0);
  }
  
  private upscaleCanvas(canvas: HTMLCanvasElement, scale: number): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    const newWidth = Math.floor(canvas.width * scale);
    const newHeight = Math.floor(canvas.height * scale);
    
    // Create temporary canvas
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCtx.putImageData(originalImageData, 0, 0);
    
    // Resize main canvas
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Use nearest neighbor for crisp text scaling
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
  }
  
  private applySharpeningFilter(canvas: HTMLCanvasElement, intensity: number): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    const output = new Uint8ClampedArray(data);

    // Sharpening kernel
    const kernel = [
      0, -intensity, 0,
      -intensity, 1 + 4 * intensity, -intensity,
      0, -intensity, 0
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          output[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, sum));
        }
      }
    }

    ctx.putImageData(new ImageData(output, width, height), 0, 0);
  }
  
  private applyAdaptiveThreshold(canvas: HTMLCanvasElement): void {
    // Simple adaptive threshold implementation
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    // Calculate local thresholds
    const blockSize = 15;
    
    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        // Calculate mean for this block
        let sum = 0;
        let count = 0;
        
        for (let by = y; by < Math.min(y + blockSize, height); by++) {
          for (let bx = x; bx < Math.min(x + blockSize, width); bx++) {
            const idx = (by * width + bx) * 4;
            sum += data[idx]; // Use red channel (already grayscale)
            count++;
          }
        }
        
        const threshold = sum / count - 10; // Slightly below mean
        
        // Apply threshold to this block
        for (let by = y; by < Math.min(y + blockSize, height); by++) {
          for (let bx = x; bx < Math.min(x + blockSize, width); bx++) {
            const idx = (by * width + bx) * 4;
            const value = data[idx] > threshold ? 255 : 0;
            data[idx] = value;
            data[idx + 1] = value;
            data[idx + 2] = value;
          }
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  private removeSmallNoise(canvas: HTMLCanvasElement): void {
    // Simple noise removal by removing isolated pixels
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    const output = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // Count white neighbors
        let whiteNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
            if (data[neighborIdx] > 128) whiteNeighbors++;
          }
        }
        
        // If isolated (few white neighbors), make it black
        if (whiteNeighbors < 2 && data[idx] > 128) {
          output[idx] = 0;
          output[idx + 1] = 0;
          output[idx + 2] = 0;
        }
      }
    }
    
    ctx.putImageData(new ImageData(output, width, height), 0, 0);
  }
}

export const magicCardProcessor = new MagicCardProcessor();