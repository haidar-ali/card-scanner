/**
 * Canvas-based Card Detection Service
 * Lightweight card detection using Canvas API and edge detection
 */

export interface CardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export class CanvasCardDetector {
  private lastDetection: CardBounds | null = null;
  
  /**
   * Detect card boundaries using edge detection
   */
  async detectCard(canvas: HTMLCanvasElement): Promise<CardBounds | null> {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    
    // Find edges using Sobel operator
    const edges = this.detectEdges(imageData);
    
    // Find card boundaries
    const bounds = this.findCardBoundaries(edges, width, height);
    
    if (bounds) {
      this.lastDetection = bounds;
      console.log('[CardDetector] Card detected:', bounds);
    }
    
    return bounds;
  }
  
  /**
   * Detect edges using Sobel operator
   */
  private detectEdges(imageData: ImageData): Uint8ClampedArray {
    const { data, width, height } = imageData;
    const edges = new Uint8ClampedArray(width * height);
    
    // Sobel kernels
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        // Apply Sobel kernels
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4;
            const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += gray * sobelX[kernelIdx];
            gy += gray * sobelY[kernelIdx];
          }
        }
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = Math.min(255, magnitude);
      }
    }
    
    return edges;
  }
  
  /**
   * Find card boundaries from edge map
   */
  private findCardBoundaries(edges: Uint8ClampedArray, width: number, height: number): CardBounds | null {
    // Find strong vertical edges (card left/right boundaries)
    const verticalProjection = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = height * 0.2; y < height * 0.8; y++) {
        sum += edges[Math.floor(y) * width + x];
      }
      verticalProjection[x] = sum;
    }
    
    // Find strong horizontal edges (card top/bottom boundaries)
    const horizontalProjection = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = width * 0.2; x < width * 0.8; x++) {
        sum += edges[y * width + Math.floor(x)];
      }
      horizontalProjection[y] = sum;
    }
    
    // Find peaks in projections (card boundaries)
    const leftEdge = this.findFirstPeak(verticalProjection, 0, width * 0.5);
    const rightEdge = this.findLastPeak(verticalProjection, width * 0.5, width);
    const topEdge = this.findFirstPeak(horizontalProjection, 0, height * 0.5);
    const bottomEdge = this.findLastPeak(horizontalProjection, height * 0.5, height);
    
    // Validate detected boundaries
    if (leftEdge === -1 || rightEdge === -1 || topEdge === -1 || bottomEdge === -1) {
      return null;
    }
    
    const cardWidth = rightEdge - leftEdge;
    const cardHeight = bottomEdge - topEdge;
    
    // Validate aspect ratio (MTG cards are approximately 2.5" x 3.5", ratio ~0.714)
    const aspectRatio = cardWidth / cardHeight;
    if (aspectRatio < 0.5 || aspectRatio > 1.0) {
      return null;
    }
    
    // Validate size (card should be significant portion of frame)
    const area = cardWidth * cardHeight;
    const frameArea = width * height;
    if (area < frameArea * 0.1 || area > frameArea * 0.9) {
      return null;
    }
    
    return {
      x: leftEdge,
      y: topEdge,
      width: cardWidth,
      height: cardHeight,
      confidence: this.calculateConfidence(edges, leftEdge, topEdge, cardWidth, cardHeight, width)
    };
  }
  
  /**
   * Find first significant peak in projection
   */
  private findFirstPeak(projection: Float32Array, start: number, end: number): number {
    const threshold = Math.max(...Array.from(projection)) * 0.3;
    
    for (let i = start; i < end; i++) {
      if (projection[i] > threshold) {
        // Find local maximum
        while (i < end - 1 && projection[i + 1] > projection[i]) {
          i++;
        }
        return i;
      }
    }
    
    return -1;
  }
  
  /**
   * Find last significant peak in projection
   */
  private findLastPeak(projection: Float32Array, start: number, end: number): number {
    const threshold = Math.max(...Array.from(projection)) * 0.3;
    
    for (let i = end - 1; i >= start; i--) {
      if (projection[i] > threshold) {
        // Find local maximum
        while (i > start && projection[i - 1] > projection[i]) {
          i--;
        }
        return i;
      }
    }
    
    return -1;
  }
  
  /**
   * Calculate detection confidence
   */
  private calculateConfidence(
    edges: Uint8ClampedArray,
    x: number,
    y: number,
    width: number,
    height: number,
    imageWidth: number
  ): number {
    // Calculate edge strength along boundaries
    let edgeStrength = 0;
    let count = 0;
    
    // Top and bottom edges
    for (let dx = 0; dx < width; dx++) {
      edgeStrength += edges[y * imageWidth + (x + dx)];
      edgeStrength += edges[(y + height) * imageWidth + (x + dx)];
      count += 2;
    }
    
    // Left and right edges
    for (let dy = 0; dy < height; dy++) {
      edgeStrength += edges[(y + dy) * imageWidth + x];
      edgeStrength += edges[(y + dy) * imageWidth + (x + width)];
      count += 2;
    }
    
    const avgEdgeStrength = edgeStrength / count / 255;
    
    // Calculate aspect ratio score
    const aspectRatio = width / height;
    const targetRatio = 0.714; // MTG card ratio
    const ratioScore = 1 - Math.abs(aspectRatio - targetRatio) / targetRatio;
    
    // Combine scores
    return avgEdgeStrength * 0.7 + ratioScore * 0.3;
  }
  
  /**
   * Extract the bottom portion of detected card for collector info
   */
  extractCardBottom(
    canvas: HTMLCanvasElement,
    cardBounds: CardBounds,
    bottomRatio: number = 0.25
  ): HTMLCanvasElement {
    const bottomHeight = Math.floor(cardBounds.height * bottomRatio);
    const bottomY = cardBounds.y + cardBounds.height - bottomHeight;
    
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
    
    ctx.strokeStyle = cardBounds.confidence > 0.8 ? 'lime' : 'yellow';
    ctx.lineWidth = 3;
    ctx.strokeRect(cardBounds.x, cardBounds.y, cardBounds.width, cardBounds.height);
    
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

export const canvasCardDetector = new CanvasCardDetector();