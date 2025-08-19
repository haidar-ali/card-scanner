/**
 * Advanced Image Preprocessing for OCR Accuracy Enhancement
 * Uses Sharp, OpenCV.js, and Canvas for optimal card text detection
 */

// Temporarily disable OpenCV to prevent hanging
// import { loadOpenCV, isOpenCVReady, getOpenCV } from './opencvLoader';

export interface PreprocessingConfig {
  strategy: 'card-optimized' | 'high-contrast' | 'adaptive' | 'multi-stage';
  upscale?: number;
  denoise?: boolean;
  sharpen?: boolean;
  adaptiveThreshold?: boolean;
  morphological?: boolean;
  deskew?: boolean;
}

export interface ProcessingResult {
  canvas: HTMLCanvasElement;
  confidence: number;
  strategy: string;
  metadata: {
    originalSize: { width: number; height: number };
    processedSize: { width: number; height: number };
    operations: string[];
  };
}

export class AdvancedImageProcessor {
  private isOpenCVReady = false;
  private initializationPromise: Promise<any> | null = null;

  constructor() {
    console.log('[ImageProcessor] Initialized with Canvas preprocessing');
    // Don't load OpenCV in constructor - only when actually needed
  }

  private initializeOpenCVIfNeeded() {
    // OpenCV disabled for now to prevent hanging
    this.isOpenCVReady = false;
  }

  /**
   * Main preprocessing function that applies multiple strategies
   */
  async processImage(
    canvas: HTMLCanvasElement,
    config: PreprocessingConfig = { strategy: 'card-optimized' }
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    console.log(`[ImageProcessor] Processing strategy: ${config.strategy}`);
    
    // Apply the specified strategy
    switch (config.strategy) {
      case 'card-optimized':
        results.push(await this.cardOptimizedPreprocessing(canvas));
        break;
      case 'high-contrast':
        results.push(await this.highContrastPreprocessing(canvas));
        break;
      case 'adaptive':
        results.push(await this.adaptivePreprocessing(canvas));
        break;
      case 'multi-stage':
        // Apply all base strategies sequentially
        console.log('[ImageProcessor] Running multi-stage: card-optimized, high-contrast, adaptive');
        results.push(await this.cardOptimizedPreprocessing(canvas));
        results.push(await this.highContrastPreprocessing(canvas));
        results.push(await this.adaptivePreprocessing(canvas));
        break;
    }

    console.log(`[ImageProcessor] Strategy ${config.strategy} produced ${results.length} results`);
    return results;
  }

  /**
   * Card-optimized preprocessing: Best for Magic card text detection
   */
  private async cardOptimizedPreprocessing(sourceCanvas: HTMLCanvasElement): Promise<ProcessingResult> {
    const operations: string[] = [];
    const canvas = this.cloneCanvas(sourceCanvas);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const originalSize = { width: canvas.width, height: canvas.height };

    // Step 1: Upscale for better small text recognition
    if (canvas.width < 600) {
      const scale = Math.min(2.5, 600 / canvas.width); // Moderate upscaling to preserve quality
      this.upscaleCanvas(canvas, scale);
      operations.push(`upscale-${scale}x`);
    }

    // Step 2: Apply adaptive preprocessing based on image characteristics
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const brightness = this.calculateBrightness(imageData);
    const contrast = this.calculateContrast(imageData);
    
    operations.push(`brightness-${brightness.toFixed(2)}`);
    operations.push(`contrast-${contrast.toFixed(2)}`);

    // Step 3: Denoise if needed (low light/high ISO)
    if (brightness < 0.3 || this.detectNoise(imageData)) {
      this.applyBilateralFilter(canvas);
      operations.push('bilateral-denoise');
    }

    // Step 4: Adaptive thresholding for uneven lighting
    if (this.isOpenCVReady && contrast < 0.4) {
      this.applyAdaptiveThreshold(canvas);
      operations.push('adaptive-threshold');
    } else {
      // Fallback: Canvas-based preprocessing with gentle enhancement
      this.applyCanvasEnhancement(canvas, { 
        contrast: Math.max(1.3, 1.8 - contrast), // Gentle contrast to preserve text
        brightness: Math.max(1.0, 1.2 - brightness) // Slight brightness adjustment
      });
      operations.push('canvas-enhancement');
    }

    // Step 5: Gentle sharpen for text edges
    this.applySharpeningFilter(canvas, 0.8);
    operations.push('gentle-sharpen');

    // Step 6: Morphological operations to clean up
    if (this.isOpenCVReady) {
      this.applyMorphologicalOperations(canvas);
      operations.push('morphological-clean');
    }

    return {
      canvas,
      confidence: this.estimateProcessingQuality(canvas),
      strategy: 'card-optimized',
      metadata: {
        originalSize,
        processedSize: { width: canvas.width, height: canvas.height },
        operations
      }
    };
  }

  /**
   * High contrast preprocessing: Balanced text/background separation
   */
  private async highContrastPreprocessing(sourceCanvas: HTMLCanvasElement): Promise<ProcessingResult> {
    console.log('[ImageProcessor] Starting high-contrast preprocessing');
    const operations: string[] = [];
    const canvas = this.cloneCanvas(sourceCanvas);
    const originalSize = { width: canvas.width, height: canvas.height };

    // Step 1: Upscale for better small text recognition
    if (canvas.width < 500) {
      const scale = Math.min(3.5, 500 / canvas.width);
      this.upscaleCanvas(canvas, scale);
      operations.push(`upscale-${scale}x`);
    }

    // Step 2: Convert to grayscale first
    this.convertToGrayscale(canvas);
    operations.push('grayscale');

    // Step 3: Apply gentle sharpening to preserve text detail
    this.applySharpeningFilter(canvas, 1.0);
    operations.push('gentle-sharpening');

    // Step 4: Moderate contrast enhancement to preserve text
    this.applyCanvasEnhancement(canvas, { contrast: 1.6, brightness: 1.1 });
    operations.push('moderate-contrast');

    // Step 5: Skip histogram equalization - it destroys text
    // Don't apply histogram equalization for text
    
    // Step 6: Skip binarization - Tesseract works better with grayscale
    // Let Tesseract handle thresholding internally

    // Step 7: Morphological operations to clean up text
    if (this.isOpenCVReady) {
      this.applyMorphologicalOpening(canvas);
      operations.push('morphological-opening');
    } else {
      // Canvas-based noise removal
      this.removeSmallNoise(canvas);
      operations.push('noise-removal');
    }

    const confidence = this.estimateProcessingQuality(canvas);
    console.log(`[ImageProcessor] High-contrast preprocessing complete, confidence: ${confidence.toFixed(2)}`);

    return {
      canvas,
      confidence,
      strategy: 'high-contrast',
      metadata: {
        originalSize,
        processedSize: { width: canvas.width, height: canvas.height },
        operations
      }
    };
  }

  /**
   * Adaptive preprocessing: Analyzes image and applies best techniques
   */
  private async adaptivePreprocessing(sourceCanvas: HTMLCanvasElement): Promise<ProcessingResult> {
    console.log('[ImageProcessor] Starting adaptive preprocessing');
    const operations: string[] = [];
    const canvas = this.cloneCanvas(sourceCanvas);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const originalSize = { width: canvas.width, height: canvas.height };

    // Step 1: Upscale small regions for better text recognition
    if (canvas.width < 600) {
      const scale = Math.min(3, 600 / canvas.width);
      this.upscaleCanvas(canvas, scale);
      operations.push(`upscale-${scale}x`);
    }

    // Step 2: Analyze image characteristics
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const analysis = this.analyzeImage(imageData);
    operations.push(`brightness-${analysis.brightness.toFixed(2)}`);
    operations.push(`contrast-${analysis.contrast.toFixed(2)}`);

    // Step 3: Apply adaptive enhancements
    if (analysis.isLowLight) {
      this.applyCanvasEnhancement(canvas, { brightness: 1.5, contrast: 1.4 });
      operations.push('low-light-enhancement');
    } else {
      // Standard enhancement for normal lighting
      this.applyCanvasEnhancement(canvas, { brightness: 1.1, contrast: 1.4 });
      operations.push('standard-enhancement');
    }

    // Step 4: Noise reduction if needed
    if (analysis.hasNoise) {
      this.applyBilateralFilter(canvas);
      operations.push('noise-reduction');
    }

    // Step 5: Convert to grayscale for better OCR
    this.convertToGrayscale(canvas);
    operations.push('grayscale');

    // Step 6: Apply gentle sharpening for text edges
    this.applySharpeningFilter(canvas, analysis.isBlurry ? 1.2 : 0.8);
    operations.push('gentle-sharpening');

    // Step 7: Adaptive thresholding
    if (analysis.needsThresholding) {
      if (this.isOpenCVReady) {
        this.applyAdaptiveThreshold(canvas);
        operations.push('adaptive-threshold');
      } else {
        // Fallback threshold based on image characteristics
        const threshold = analysis.brightness > 0.5 ? 140 : 100;
        this.applyThreshold(canvas, threshold);
        operations.push(`threshold-${threshold}`);
      }
    }

    const confidence = this.estimateProcessingQuality(canvas);
    console.log(`[ImageProcessor] Adaptive preprocessing complete, confidence: ${confidence.toFixed(2)}`);

    return {
      canvas,
      confidence,
      strategy: 'adaptive',
      metadata: {
        originalSize,
        processedSize: { width: canvas.width, height: canvas.height },
        operations
      }
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

  private upscaleCanvas(canvas: HTMLCanvasElement, scale: number): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    const newWidth = Math.floor(canvas.width * scale);
    const newHeight = Math.floor(canvas.height * scale);
    
    // Create temporary canvas for scaling
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCtx.putImageData(originalImageData, 0, 0);
    
    // Resize main canvas
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Use high-quality scaling for text
    ctx.imageSmoothingEnabled = true; // Enable smoothing to prevent jagged edges
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
  }

  private calculateBrightness(imageData: ImageData): number {
    const data = imageData.data;
    let total = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      total += (r + g + b) / 3;
    }
    
    return total / (data.length / 4) / 255;
  }

  private calculateContrast(imageData: ImageData): number {
    const data = imageData.data;
    const values: number[] = [];
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      values.push((r + g + b) / 3);
    }
    
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance) / 255;
  }

  private detectNoise(imageData: ImageData): boolean {
    // Simple noise detection based on high-frequency variations
    const data = imageData.data;
    let variations = 0;
    const threshold = 30;
    
    for (let i = 4; i < data.length - 4; i += 4) {
      const current = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const prev = (data[i - 4] + data[i - 3] + data[i - 2]) / 3;
      
      if (Math.abs(current - prev) > threshold) {
        variations++;
      }
    }
    
    return variations > (data.length / 4) * 0.1; // More than 10% variations
  }

  private applyCanvasEnhancement(canvas: HTMLCanvasElement, options: { contrast?: number; brightness?: number }): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const { contrast = 1, brightness = 1 } = options;

    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast and brightness
      data[i] = Math.min(255, Math.max(0, ((data[i] / 255 - 0.5) * contrast + 0.5) * 255 * brightness));
      data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] / 255 - 0.5) * contrast + 0.5) * 255 * brightness));
      data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] / 255 - 0.5) * contrast + 0.5) * 255 * brightness));
    }

    ctx.putImageData(imageData, 0, 0);
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

  private applyThreshold(canvas: HTMLCanvasElement, threshold: number): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Apply softer thresholding to preserve text detail
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Use a smoother transition instead of hard binary
      let value;
      if (gray < threshold - 20) {
        value = 0;
      } else if (gray > threshold + 20) {
        value = 255;
      } else {
        // Smooth transition in the middle range
        value = ((gray - (threshold - 20)) / 40) * 255;
      }
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private applySharpeningFilter(canvas: HTMLCanvasElement, intensity: number = 0.7): void {
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
        for (let c = 0; c < 3; c++) { // RGB channels
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

  private applyBilateralFilter(canvas: HTMLCanvasElement): void {
    // Simplified bilateral filter implementation
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    const output = new Uint8ClampedArray(data);

    const spatialSigma = 2;
    const intensitySigma = 20;
    const kernelSize = 5;
    const halfKernel = Math.floor(kernelSize / 2);

    for (let y = halfKernel; y < height - halfKernel; y++) {
      for (let x = halfKernel; x < width - halfKernel; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let weightSum = 0;
          const centerIdx = (y * width + x) * 4 + c;
          const centerValue = data[centerIdx];

          for (let ky = -halfKernel; ky <= halfKernel; ky++) {
            for (let kx = -halfKernel; kx <= halfKernel; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              const value = data[idx];
              
              const spatialWeight = Math.exp(-(kx * kx + ky * ky) / (2 * spatialSigma * spatialSigma));
              const intensityWeight = Math.exp(-Math.pow(value - centerValue, 2) / (2 * intensitySigma * intensitySigma));
              const weight = spatialWeight * intensityWeight;
              
              sum += value * weight;
              weightSum += weight;
            }
          }

          output[centerIdx] = sum / weightSum;
        }
      }
    }

    ctx.putImageData(new ImageData(output, width, height), 0, 0);
  }

  // OpenCV.js operations (disabled for now)
  private applyAdaptiveThreshold(canvas: HTMLCanvasElement): void {
    // OpenCV disabled - use Canvas fallback
    this.applyCanvasEnhancement(canvas, { contrast: 2.0, brightness: 1.2 });
  }

  private applyOtsuThreshold(canvas: HTMLCanvasElement): void {
    // OpenCV disabled - use Canvas fallback with fixed threshold
    this.applyThreshold(canvas, 128);
  }

  private applyMorphologicalOperations(canvas: HTMLCanvasElement): void {
    // OpenCV disabled - skip morphological operations for now
    console.log('[ImageProcessor] Morphological operations skipped (OpenCV disabled)');
  }

  private applyMorphologicalOpening(canvas: HTMLCanvasElement): void {
    // OpenCV disabled - skip morphological operations for now
    console.log('[ImageProcessor] Morphological opening skipped (OpenCV disabled)');
  }

  private analyzeImage(imageData: ImageData) {
    const brightness = this.calculateBrightness(imageData);
    const contrast = this.calculateContrast(imageData);
    const hasNoise = this.detectNoise(imageData);

    return {
      brightness,
      contrast,
      hasNoise,
      isLowLight: brightness < 0.3,
      isBlurry: contrast < 0.2,
      needsThresholding: contrast < 0.4 && brightness > 0.2
    };
  }

  private applyHistogramEqualization(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Calculate histogram
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      histogram[data[i]]++; // Using red channel (already grayscale)
    }
    
    // Calculate cumulative distribution
    const cdf = new Array(256);
    cdf[0] = histogram[0];
    for (let i = 1; i < 256; i++) {
      cdf[i] = cdf[i - 1] + histogram[i];
    }
    
    // Normalize CDF
    const totalPixels = data.length / 4;
    for (let i = 0; i < 256; i++) {
      cdf[i] = Math.round((cdf[i] / totalPixels) * 255);
    }
    
    // Apply equalization
    for (let i = 0; i < data.length; i += 4) {
      const newValue = cdf[data[i]];
      data[i] = newValue;
      data[i + 1] = newValue;
      data[i + 2] = newValue;
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

  private estimateProcessingQuality(canvas: HTMLCanvasElement): number {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const contrast = this.calculateContrast(imageData);
    const brightness = this.calculateBrightness(imageData);
    
    // Enhanced quality metric based on text-friendly characteristics
    const contrastScore = Math.min(1, contrast * 2.5); // High contrast is good for text
    const brightnessScore = 1 - Math.abs(brightness - 0.5) * 1.5; // Medium brightness is optimal
    const edgeScore = this.calculateEdgeScore(imageData);
    
    // Weighted combination favoring high contrast and good edge definition
    return Math.min(1, Math.max(0, contrastScore * 0.4 + brightnessScore * 0.3 + edgeScore * 0.3));
  }

  private calculateEdgeScore(imageData: ImageData): number {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    let edgeCount = 0;
    let totalPixels = 0;
    
    // Simple edge detection
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const current = data[idx];
        const right = data[idx + 4];
        const below = data[(y + 1) * width * 4 + x * 4];
        
        if (Math.abs(current - right) > 30 || Math.abs(current - below) > 30) {
          edgeCount++;
        }
        totalPixels++;
      }
    }
    
    return Math.min(1, (edgeCount / totalPixels) * 10); // Normalize edge density
  }
}

// Lazy initialization - don't create until needed
let advancedImageProcessorInstance: AdvancedImageProcessor | null = null;

export function getAdvancedImageProcessor(): AdvancedImageProcessor {
  if (!advancedImageProcessorInstance) {
    advancedImageProcessorInstance = new AdvancedImageProcessor();
  }
  return advancedImageProcessorInstance;
}

// Backward compatibility
export const advancedImageProcessor = {
  processImage: (...args: any[]) => getAdvancedImageProcessor().processImage(...args)
};