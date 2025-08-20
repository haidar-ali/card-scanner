/**
 * OpenCV.js Card Detection Service
 * Robust card detection using contour detection and rectangle finding
 */

import { loadOpenCV } from './opencvLoader';

export interface CardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export class OpenCVCardDetector {
  private initialized = false;
  private lastDetection: CardBounds | null = null;
  private cv: any = null;
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('[OpenCV] Starting initialization...');
    
    try {
      // Load OpenCV.js dynamically
      this.cv = await loadOpenCV();
      
      this.initialized = true;
      console.log('[OpenCV] Card detector initialized successfully');
    } catch (error) {
      console.error('[OpenCV] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Detect card boundaries using OpenCV contour detection
   */
  async detectCard(canvas: HTMLCanvasElement): Promise<CardBounds | null> {
    // Auto-initialize if needed
    if (!this.initialized) {
      console.log('[OpenCV] Auto-initializing...');
      try {
        await this.initialize();
      } catch (error) {
        console.error('[OpenCV] Failed to initialize:', error);
        return null;
      }
    }
    
    let src: any = null;
    let gray: any = null;
    let blurred: any = null;
    let edges: any = null;
    let contours: any = null;
    let hierarchy: any = null;
    
    try {
      console.log('[OpenCV] Starting card detection...');
      // Convert canvas to OpenCV Mat
      src = this.cv.imread(canvas);
      
      // Convert to grayscale
      gray = new this.cv.Mat();
      this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY);
      
      // Apply Gaussian blur to reduce noise
      blurred = new this.cv.Mat();
      const ksize = new this.cv.Size(5, 5);
      this.cv.GaussianBlur(gray, blurred, ksize, 1, 1);
      
      // Edge detection using Canny
      edges = new this.cv.Mat();
      this.cv.Canny(blurred, edges, 50, 150);
      
      // Find contours
      contours = new this.cv.MatVector();
      hierarchy = new this.cv.Mat();
      this.cv.findContours(edges, contours, hierarchy, this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE);
      
      // Find the largest rectangular contour
      let bestRect: CardBounds | null = null;
      let maxArea = 0;
      
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        
        // Approximate polygon
        const perimeter = this.cv.arcLength(contour, true);
        const approx = new this.cv.Mat();
        this.cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
        
        // Check if it's a quadrilateral (4 vertices)
        if (approx.rows === 4) {
          // Get bounding rectangle
          const rect = this.cv.boundingRect(contour);
          const area = rect.width * rect.height;
          const aspectRatio = rect.width / rect.height;
          
          // Validate card-like proportions
          // Magic cards have aspect ratio around 0.714 (2.5" x 3.5")
          // But allow some flexibility for perspective
          if (area > maxArea && 
              area > (canvas.width * canvas.height * 0.05) && // At least 5% of image
              area < (canvas.width * canvas.height * 0.9) &&  // At most 90% of image
              aspectRatio > 0.5 && aspectRatio < 1.2) {
            
            maxArea = area;
            bestRect = {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              confidence: Math.min(1.0, area / (canvas.width * canvas.height * 0.5))
            };
          }
        }
        
        approx.delete();
        contour.delete();
      }
      
      // If no quadrilateral found, try to find largest rectangular contour
      if (!bestRect) {
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const rect = this.cv.boundingRect(contour);
          const area = rect.width * rect.height;
          const aspectRatio = rect.width / rect.height;
          
          // More lenient criteria for fallback
          if (area > maxArea && 
              area > (canvas.width * canvas.height * 0.03) &&
              aspectRatio > 0.4 && aspectRatio < 1.5) {
            
            maxArea = area;
            bestRect = {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              confidence: Math.min(0.8, area / (canvas.width * canvas.height * 0.5))
            };
          }
          
          contour.delete();
        }
      }
      
      this.lastDetection = bestRect;
      
      if (bestRect) {
        console.log('[OpenCV] Card detected:', bestRect);
      }
      
      return bestRect;
      
    } catch (error) {
      console.error('[OpenCV] Detection error:', error);
      return null;
    } finally {
      // Clean up OpenCV objects
      if (src) src.delete();
      if (gray) gray.delete();
      if (blurred) blurred.delete();
      if (edges) edges.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
    }
  }
  
  /**
   * Extract the bottom portion of detected card for collector info
   */
  extractCardBottom(
    canvas: HTMLCanvasElement, 
    cardBounds: CardBounds, 
    bottomRatio: number = 0.25
  ): HTMLCanvasElement {
    // Calculate bottom crop area
    const bottomHeight = Math.floor(cardBounds.height * bottomRatio);
    const bottomY = cardBounds.y + cardBounds.height - bottomHeight;
    
    // Create cropped canvas
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cardBounds.width;
    croppedCanvas.height = bottomHeight;
    
    const ctx = croppedCanvas.getContext('2d')!;
    ctx.drawImage(
      canvas,
      cardBounds.x, bottomY, cardBounds.width, bottomHeight,
      0, 0, cardBounds.width, bottomHeight
    );
    
    return croppedCanvas;
  }
  
  /**
   * Draw debug visualization of detected card
   */
  drawDebugOverlay(canvas: HTMLCanvasElement, cardBounds: CardBounds): void {
    const ctx = canvas.getContext('2d')!;
    
    // Draw rectangle around detected card
    ctx.strokeStyle = cardBounds.confidence > 0.8 ? 'lime' : 'yellow';
    ctx.lineWidth = 3;
    ctx.strokeRect(cardBounds.x, cardBounds.y, cardBounds.width, cardBounds.height);
    
    // Draw confidence score
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(cardBounds.x, cardBounds.y - 25, 150, 20);
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText(
      `Card: ${(cardBounds.confidence * 100).toFixed(0)}%`,
      cardBounds.x + 5,
      cardBounds.y - 8
    );
  }
  
  getLastDetection(): CardBounds | null {
    return this.lastDetection;
  }
  
  reset(): void {
    this.lastDetection = null;
  }
}

export const opencvCardDetector = new OpenCVCardDetector();