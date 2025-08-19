/**
 * Streaming ROI Manager - Medium Loop (4-10fps)
 * Tracks Regions of Interest and performs lightweight OCR
 */

import Tesseract from 'tesseract.js';

export interface ROIDefinition {
  name: 'footer' | 'title' | 'symbol' | 'types' | 'collector_number' | 'set_code';
  bounds: { x: number; y: number; width: number; height: number }; // Normalized 0-1
  preprocessVariants: ('otsu' | 'sauvola' | 'adaptive')[];
}

export interface OCRHypothesis {
  field: string;
  text: string;
  confidence: number;
  timestamp: number;
  preprocessMethod: string;
}

export interface ROIResults {
  hypotheses: Map<string, OCRHypothesis[]>; // field -> hypotheses
  symbolCandidates?: { setCode: string; confidence: number }[];
  lastProcessed: number;
}

export class StreamingROIManager {
  private roiDefinitions: ROIDefinition[] = [
    {
      name: 'collector_number',
      bounds: { x: 0.05, y: 0.85, width: 0.25, height: 0.08 }, // Very bottom-left - where "204/205" would be
      preprocessVariants: ['otsu', 'adaptive', 'sauvola']
    },
    {
      name: 'set_code', 
      bounds: { x: 0.75, y: 0.85, width: 0.2, height: 0.08 }, // Very bottom-right - where "EMN" would be
      preprocessVariants: ['otsu', 'sauvola', 'adaptive']
    },
    {
      name: 'footer',
      bounds: { x: 0.05, y: 0.8, width: 0.9, height: 0.15 }, // Entire bottom strip for debugging
      preprocessVariants: ['otsu', 'sauvola']
    }
  ];
  
  private worker: Tesseract.Worker | null = null;
  private currentHypotheses = new Map<string, OCRHypothesis[]>();
  private lastHomography: number[][] | null = null;
  private cachedROIs = new Map<string, HTMLCanvasElement>();
  
  async initialize(): Promise<void> {
    if (!this.worker) {
      console.log('[ROIManager] Initializing Tesseract worker...');
      try {
        this.worker = await Tesseract.createWorker('eng', 1, {
          logger: (m) => {
            // Only log important messages, suppress verbose statistics
            if (m.status === 'initializing tesseract' || m.status === 'loading language traineddata') {
              console.log(`[ROIManager] ${m.status}`);
            }
          }
        });
        
        await this.worker.setParameters({
          tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/-',  // Just what we need for collector numbers and set codes
          tessedit_pageseg_mode: '7', // Single text line - might work better than single word
          preserve_interword_spaces: '1',  // Keep spaces to detect multiple parts
          tessedit_min_orientation_margin: '0',  // Help with slightly rotated text
          debug_file: '/dev/null'  // Suppress debug output
        });
        
        console.log('[ROIManager] Tesseract worker initialized');
      } catch (error) {
        console.error('[ROIManager] Failed to initialize Tesseract:', error);
        throw error;
      }
    }
  }
  
  /**
   * Process ROIs when card is stable
   */
  async processROIs(
    rectifiedCanvas: HTMLCanvasElement,
    homography: number[][],
    forceUpdate = false
  ): Promise<ROIResults> {
    // Check if homography changed significantly
    const homographyChanged = this.hasHomographyChanged(homography);
    
    if (!forceUpdate && !homographyChanged && this.cachedROIs.size > 0) {
      // Reuse cached ROIs if pose hasn't changed
      return this.processCachedROIs();
    }
    
    // Extract new ROIs
    this.lastHomography = homography;
    this.cachedROIs.clear();
    
    for (const roi of this.roiDefinitions) {
      if (roi.name === 'symbol') continue; // Skip symbol for OCR
      
      const extracted = this.extractROI(rectifiedCanvas, roi);
      this.cachedROIs.set(roi.name, extracted);
      
      // First try without ANY preprocessing
      const rawResult = await this.runQuickOCR(extracted, roi.name);
      if (rawResult.text.length > 0) {
        console.log(`[ROI] ${roi.name} (RAW): "${rawResult.text}" (conf: ${rawResult.confidence.toFixed(2)})`);
      }
      
      if (rawResult.confidence > 0.3 && rawResult.text.length > 0) {
        const hypothesis: OCRHypothesis = {
          field: roi.name,
          text: rawResult.text,
          confidence: rawResult.confidence,
          timestamp: Date.now(),
          preprocessMethod: 'raw'
        };
        this.addHypothesis(roi.name, hypothesis);
      }
      
      // Then try with preprocessing variants
      for (const variant of roi.preprocessVariants) {
        const processed = this.preprocessROI(extracted, variant);
        const result = await this.runQuickOCR(processed, roi.name);
        
        // Only log if we detected something
        if (result.text.length > 0) {
          console.log(`[ROI] ${roi.name} (${variant}): "${result.text}" (conf: ${result.confidence.toFixed(2)})`);
        }
        
        if (result.confidence > 0.3 && result.text.length > 0) { // Lower threshold to see more detections
          const hypothesis: OCRHypothesis = {
            field: roi.name,
            text: result.text,
            confidence: result.confidence,
            timestamp: Date.now(),
            preprocessMethod: variant
          };
          
          this.addHypothesis(roi.name, hypothesis);
        }
      }
    }
    
    // Clean old hypotheses (older than 2 seconds)
    this.cleanOldHypotheses();
    
    return {
      hypotheses: new Map(this.currentHypotheses),
      lastProcessed: Date.now()
    };
  }
  
  /**
   * Extract symbol region for CNN classification
   */
  extractSymbolROI(rectifiedCanvas: HTMLCanvasElement): HTMLCanvasElement {
    // Since we're focused on bottom edge only, we don't have a symbol region
    // Return a dummy canvas for now
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    return canvas;
  }
  
  private extractROI(source: HTMLCanvasElement, roi: ROIDefinition): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    
    // First check if source canvas has any content
    const sourceCtx = source.getContext('2d', { willReadFrequently: true })!;
    
    // Check center pixel
    const centerX = Math.floor(source.width / 2);
    const centerY = Math.floor(source.height / 2);
    const centerData = sourceCtx.getImageData(centerX, centerY, 1, 1).data;
    
    // Check if it's all white
    const isWhite = centerData[0] === 255 && centerData[1] === 255 && centerData[2] === 255;
    const isEmpty = centerData[0] === 0 && centerData[1] === 0 && centerData[2] === 0 && centerData[3] === 0;
    
    if (isEmpty || isWhite) {
      console.warn(`[ExtractROI] Source canvas issue for ${roi.name}: isEmpty=${isEmpty}, isWhite=${isWhite}`);
      console.warn(`[ExtractROI] Source dimensions: ${source.width}x${source.height}`);
      console.warn(`[ExtractROI] Center pixel RGBA: [${centerData[0]}, ${centerData[1]}, ${centerData[2]}, ${centerData[3]}]`);
    }
    
    // Convert normalized bounds to pixel coordinates
    const x = Math.floor(roi.bounds.x * source.width);
    const y = Math.floor(roi.bounds.y * source.height);
    const width = Math.floor(roi.bounds.width * source.width);
    const height = Math.floor(roi.bounds.height * source.height);
    
    // Set canvas size based on ROI type - scale up for better OCR
    if (roi.name === 'collector_number' || roi.name === 'set_code') {
      // Much higher resolution for small text
      canvas.width = Math.min(width * 3, 600);  // 3x scale
      canvas.height = Math.min(height * 3, 150); // 3x scale
    } else {
      canvas.width = Math.min(width * 2, 800);  // 2x scale for footer
      canvas.height = Math.min(height * 2, 200);
    }
    
    // Extract and potentially upscale
    ctx.drawImage(
      source,
      x, y, width, height,
      0, 0, canvas.width, canvas.height
    );
    
    return canvas;
  }
  
  private preprocessROI(canvas: HTMLCanvasElement, method: string): HTMLCanvasElement {
    const processed = document.createElement('canvas');
    const ctx = processed.getContext('2d', { willReadFrequently: true })!;
    processed.width = canvas.width;
    processed.height = canvas.height;
    ctx.drawImage(canvas, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, processed.width, processed.height);
    const data = imageData.data;
    
    // Check if image is not completely black before preprocessing
    let hasContent = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) {
        hasContent = true;
        break;
      }
    }
    
    if (!hasContent) {
      console.log(`[Preprocess] Warning: Image appears to be black/empty before ${method}`);
      return canvas; // Return original if empty
    }
    
    switch (method) {
      case 'otsu':
        this.applyOtsuThreshold(imageData);
        break;
      case 'sauvola':
        this.applySauvolaThreshold(imageData);
        break;
      case 'adaptive':
        this.applyAdaptiveThreshold(imageData);
        break;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return processed;
  }
  
  private applyOtsuThreshold(imageData: ImageData): void {
    const data = imageData.data;
    const histogram = new Array(256).fill(0);
    
    // Convert to grayscale and build histogram
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.floor(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = data[i + 1] = data[i + 2] = gray;
      histogram[gray]++;
    }
    
    // Find Otsu threshold
    const total = data.length / 4;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 0;
    
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      
      wF = total - wB;
      if (wF === 0) break;
      
      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      
      const variance = wB * wF * (mB - mF) * (mB - mF);
      
      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }
    
    // Apply threshold
    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
  }
  
  private applySauvolaThreshold(imageData: ImageData): void {
    const { data, width, height } = imageData;
    const windowSize = 15;
    const k = 0.5;
    const R = 128;
    
    // Convert to grayscale first
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.floor(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
    
    const output = new Uint8ClampedArray(data);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Calculate local statistics
        let sum = 0;
        let sumSq = 0;
        let count = 0;
        
        const halfWindow = Math.floor(windowSize / 2);
        for (let wy = Math.max(0, y - halfWindow); wy < Math.min(height, y + halfWindow + 1); wy++) {
          for (let wx = Math.max(0, x - halfWindow); wx < Math.min(width, x + halfWindow + 1); wx++) {
            const idx = (wy * width + wx) * 4;
            const value = data[idx];
            sum += value;
            sumSq += value * value;
            count++;
          }
        }
        
        const mean = sum / count;
        const variance = (sumSq / count) - (mean * mean);
        const stdDev = Math.sqrt(variance);
        
        const threshold = mean * (1 + k * ((stdDev / R) - 1));
        
        const idx = (y * width + x) * 4;
        const value = data[idx] > threshold ? 255 : 0;
        output[idx] = output[idx + 1] = output[idx + 2] = value;
      }
    }
    
    // Copy back
    for (let i = 0; i < data.length; i++) {
      data[i] = output[i];
    }
  }
  
  private applyAdaptiveThreshold(imageData: ImageData): void {
    const { data, width, height } = imageData;
    const blockSize = 11;
    const C = 2;
    
    // Convert to grayscale
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.floor(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
    
    const output = new Uint8ClampedArray(data);
    const halfBlock = Math.floor(blockSize / 2);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        
        for (let by = Math.max(0, y - halfBlock); by < Math.min(height, y + halfBlock + 1); by++) {
          for (let bx = Math.max(0, x - halfBlock); bx < Math.min(width, x + halfBlock + 1); bx++) {
            sum += data[(by * width + bx) * 4];
            count++;
          }
        }
        
        const mean = sum / count;
        const idx = (y * width + x) * 4;
        const value = data[idx] > (mean - C) ? 255 : 0;
        output[idx] = output[idx + 1] = output[idx + 2] = value;
      }
    }
    
    // Copy back
    for (let i = 0; i < data.length; i++) {
      data[i] = output[i];
    }
  }
  
  private async runQuickOCR(canvas: HTMLCanvasElement, field?: string): Promise<{ text: string; confidence: number }> {
    if (!this.worker) {
      await this.initialize();
    }
    
    try {
      // Debug: Log canvas dimensions only once per ROI type
      if (!this.debuggedSizes.has(`${field}_${canvas.width}x${canvas.height}`)) {
        console.log(`[OCR Debug] ${field} canvas size: ${canvas.width}x${canvas.height}`);
        this.debuggedSizes.add(`${field}_${canvas.width}x${canvas.height}`);
      }
      
      // Check canvas content before OCR
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Check if canvas is all white or empty
      let hasNonWhitePixels = false;
      let totalPixels = 0;
      let whitePixels = 0;
      
      for (let i = 0; i < data.length; i += 4) {
        totalPixels++;
        if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) {
          whitePixels++;
        } else if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) {
          hasNonWhitePixels = true;
        }
      }
      
      const whitePercentage = (whitePixels / totalPixels) * 100;
      
      // Convert canvas to data URL for debugging (only log first time for each field)
      if (!this.debuggedFields.has(field || 'unknown')) {
        const dataUrl = canvas.toDataURL();
        console.log(`[OCR Debug] ${field} content check: ${whitePercentage.toFixed(1)}% white, hasContent: ${hasNonWhitePixels}`);
        console.log(`[OCR Debug] ${field} sample: ${dataUrl}`);
        
        this.debuggedFields.add(field || 'unknown');
      }
      
      // If canvas is mostly white, skip OCR to reduce noise
      if (whitePercentage > 95) {
        return { text: '', confidence: 0 };
      }
      
      const { data: ocrData } = await this.worker!.recognize(canvas);
      return {
        text: ocrData.text.trim(),
        confidence: ocrData.confidence / 100
      };
    } catch (error) {
      console.warn('[ROIManager] OCR failed:', error);
      return { text: '', confidence: 0 };
    }
  }
  
  private debugged = false;
  private debuggedSizes = new Set<string>();
  private debuggedFields = new Set<string>();
  
  private addHypothesis(field: string, hypothesis: OCRHypothesis): void {
    if (!this.currentHypotheses.has(field)) {
      this.currentHypotheses.set(field, []);
    }
    
    const hypotheses = this.currentHypotheses.get(field)!;
    
    // Check if similar hypothesis already exists
    const similar = hypotheses.find(h => 
      h.text === hypothesis.text && 
      h.preprocessMethod === hypothesis.preprocessMethod
    );
    
    if (similar) {
      // Update confidence with exponential moving average
      similar.confidence = similar.confidence * 0.7 + hypothesis.confidence * 0.3;
      similar.timestamp = hypothesis.timestamp;
    } else {
      hypotheses.push(hypothesis);
      
      // Keep only top 5 hypotheses per field
      if (hypotheses.length > 5) {
        hypotheses.sort((a, b) => b.confidence - a.confidence);
        hypotheses.length = 5;
      }
    }
  }
  
  private cleanOldHypotheses(): void {
    const now = Date.now();
    const maxAge = 2000; // 2 seconds
    
    for (const [field, hypotheses] of this.currentHypotheses) {
      const filtered = hypotheses.filter(h => now - h.timestamp < maxAge);
      if (filtered.length > 0) {
        this.currentHypotheses.set(field, filtered);
      } else {
        this.currentHypotheses.delete(field);
      }
    }
  }
  
  private hasHomographyChanged(homography: number[][]): boolean {
    if (!this.lastHomography) return true;
    
    // Check if homography changed significantly
    let maxDiff = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        maxDiff = Math.max(maxDiff, Math.abs(homography[i][j] - this.lastHomography[i][j]));
      }
    }
    
    return maxDiff > 0.01; // Threshold for significant change
  }
  
  private async processCachedROIs(): Promise<ROIResults> {
    // Process cached ROIs without re-extraction
    for (const [name, canvas] of this.cachedROIs) {
      const roi = this.roiDefinitions.find(r => r.name === name)!;
      
      for (const variant of roi.preprocessVariants) {
        const processed = this.preprocessROI(canvas, variant);
        const result = await this.runQuickOCR(processed);
        
        if (result.confidence > 0.3) {
          const hypothesis: OCRHypothesis = {
            field: name,
            text: result.text,
            confidence: result.confidence,
            timestamp: Date.now(),
            preprocessMethod: variant
          };
          
          this.addHypothesis(name, hypothesis);
        }
      }
    }
    
    this.cleanOldHypotheses();
    
    return {
      hypotheses: new Map(this.currentHypotheses),
      lastProcessed: Date.now()
    };
  }
  
  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export const streamingROIManager = new StreamingROIManager();