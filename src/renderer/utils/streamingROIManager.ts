/**
 * Streaming ROI Manager - Simplified version without Tesseract
 * Tracks Regions of Interest for Vision AI processing
 */

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
  // No longer tracking individual ROIs since Vision AI handles everything
  private roiDefinitions: ROIDefinition[] = [];
  
  private currentHypotheses = new Map<string, OCRHypothesis[]>();
  private lastHomography: number[][] | null = null;
  private cachedROIs = new Map<string, HTMLCanvasElement>();
  private debugCanvases = new Map<string, HTMLCanvasElement>();
  private lastDrawnDebug = new Map<string, string>();
  
  async initialize(): Promise<void> {
    // No Tesseract initialization needed
    console.log('[ROIManager] Initialized (Vision AI only mode)');
    this.resetDebugTracking();
  }
  
  /**
   * Process ROIs when card is stable - now just extracts regions for Vision AI
   */
  async processROIs(
    rectifiedCanvas: HTMLCanvasElement,
    homography: number[][],
    quality: number
  ): Promise<ROIResults> {
    this.lastHomography = homography;
    
    // Extract ROI regions for potential Vision AI processing
    for (const roi of this.roiDefinitions) {
      const roiCanvas = this.extractROI(rectifiedCanvas, roi);
      this.cachedROIs.set(roi.name, roiCanvas);
      
      // Update debug canvas
      if (this.debugCanvases.has(roi.name)) {
        const debugCanvas = this.debugCanvases.get(roi.name)!;
        const ctx = debugCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
        ctx.drawImage(roiCanvas, 0, 0);
      }
    }
    
    return {
      hypotheses: this.currentHypotheses,
      lastProcessed: Date.now()
    };
  }
  
  private extractROI(canvas: HTMLCanvasElement, roi: ROIDefinition): HTMLCanvasElement {
    const x = Math.floor(roi.bounds.x * canvas.width);
    const y = Math.floor(roi.bounds.y * canvas.height);
    const width = Math.floor(roi.bounds.width * canvas.width);
    const height = Math.floor(roi.bounds.height * canvas.height);
    
    const roiCanvas = document.createElement('canvas');
    roiCanvas.width = width;
    roiCanvas.height = height;
    
    const ctx = roiCanvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
    
    return roiCanvas;
  }
  
  /**
   * Get cached ROI canvas
   */
  getCachedROI(name: string): HTMLCanvasElement | null {
    return this.cachedROIs.get(name) || null;
  }
  
  /**
   * Get current hypotheses
   */
  getHypotheses(): Map<string, OCRHypothesis[]> {
    return this.currentHypotheses;
  }
  
  /**
   * Reset all state
   */
  reset(): void {
    this.currentHypotheses.clear();
    this.cachedROIs.clear();
    this.lastHomography = null;
  }
  
  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    this.reset();
    console.log('[ROIManager] Destroyed');
  }
  
  /**
   * Get debug canvases for visualization
   */
  getDebugCanvases(): Map<string, HTMLCanvasElement> {
    if (this.debugCanvases.size === 0) {
      // Create debug canvases on first access
      for (const roi of this.roiDefinitions) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(roi.bounds.width * 960);
        canvas.height = Math.floor(roi.bounds.height * 540);
        this.debugCanvases.set(roi.name, canvas);
      }
    }
    return this.debugCanvases;
  }
  
  private resetDebugTracking(): void {
    this.lastDrawnDebug.clear();
  }
}

export const streamingROIManager = new StreamingROIManager();