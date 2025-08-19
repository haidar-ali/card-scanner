/**
 * Card Stability Tracker - Fast Loop (30fps)
 * Detects card presence, estimates pose, and determines stability
 */

export interface CardPose {
  corners: { x: number; y: number }[];
  homography: number[][]; // 3x3 transformation matrix
  timestamp: number;
}

export interface StabilityMetrics {
  isStable: boolean;
  stabilityScore: number; // 0-1
  sharpnessScore: number; // Variance of Laplacian
  motionDelta: number; // Pixels moved
  rotationDelta: number; // Degrees rotated
  consecutiveStableFrames: number;
  cardPresent: boolean;
  readyToRead: boolean;
}

export class CardStabilityTracker {
  private lastPose: CardPose | null = null;
  private poseHistory: CardPose[] = [];
  private stabilityHistory: boolean[] = [];
  private readonly HISTORY_SIZE = 10;
  private loggedDrawInfo = false;
  private loggedRectified = false;
  private loggedVideoState = false;
  
  // Thresholds
  private readonly MOTION_THRESHOLD = 5; // pixels
  private readonly ROTATION_THRESHOLD = 1.5; // degrees
  private readonly SHARPNESS_THRESHOLD = 50; // Variance of Laplacian - lowered for testing
  private readonly STABILITY_FRAMES_REQUIRED = 5; // ~150ms at 30fps - lowered for testing
  private readonly MIN_CARD_AREA = 0.1; // 10% of frame
  private readonly MAX_CARD_AREA = 0.9; // 90% of frame

  /**
   * Process a frame and determine card stability
   */
  analyzeFrame(canvas: HTMLCanvasElement): StabilityMetrics {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Step 1: Detect card presence and corners
    const cardDetection = this.detectCard(imageData);
    
    if (!cardDetection.found) {
      // For now, always assume card is present to test the pipeline
      // In production, implement proper card detection
      cardDetection.found = true;
      cardDetection.corners = this.getDefaultCorners(canvas.width, canvas.height);
    }
    
    // Step 2: Calculate sharpness
    const sharpness = this.calculateSharpness(imageData, cardDetection.corners);
    
    // Step 3: Estimate homography
    const homography = this.estimateHomography(cardDetection.corners, canvas.width, canvas.height);
    
    const currentPose: CardPose = {
      corners: cardDetection.corners,
      homography,
      timestamp: Date.now()
    };
    
    // Step 4: Calculate motion and rotation deltas
    let motionDelta = 0;
    let rotationDelta = 0;
    
    if (this.lastPose) {
      motionDelta = this.calculateMotion(this.lastPose, currentPose);
      rotationDelta = this.calculateRotation(this.lastPose, currentPose);
    }
    
    // Step 5: Determine stability
    const isFrameStable = 
      motionDelta < this.MOTION_THRESHOLD &&
      rotationDelta < this.ROTATION_THRESHOLD &&
      sharpness > this.SHARPNESS_THRESHOLD;
    
    // Update history
    this.poseHistory.push(currentPose);
    if (this.poseHistory.length > this.HISTORY_SIZE) {
      this.poseHistory.shift();
    }
    
    this.stabilityHistory.push(isFrameStable);
    if (this.stabilityHistory.length > this.STABILITY_FRAMES_REQUIRED) {
      this.stabilityHistory.shift();
    }
    
    // Count consecutive stable frames
    const consecutiveStableFrames = this.stabilityHistory.filter(s => s).length;
    const isStable = consecutiveStableFrames >= this.STABILITY_FRAMES_REQUIRED;
    
    // Calculate overall stability score
    const stabilityScore = this.calculateStabilityScore(
      motionDelta, rotationDelta, sharpness, consecutiveStableFrames
    );
    
    this.lastPose = currentPose;
    
    return {
      isStable,
      stabilityScore,
      sharpnessScore: sharpness,
      motionDelta,
      rotationDelta,
      consecutiveStableFrames,
      cardPresent: true,
      readyToRead: isStable && sharpness > this.SHARPNESS_THRESHOLD
    };
  }
  
  /**
   * Get the current best rectified crop if stable
   */
  getRectifiedCrop(video: HTMLVideoElement): HTMLCanvasElement | null {
    // For testing, always return a crop if we think we're stable
    if (!this.lastPose) {
      console.log('[Stability] No pose available for rectified crop');
      return null;
    }
    
    // Check stability
    const stableFrames = this.stabilityHistory.filter(s => s).length;
    if (stableFrames < this.STABILITY_FRAMES_REQUIRED) {
      console.log(`[Stability] Not stable enough: ${stableFrames}/${this.STABILITY_FRAMES_REQUIRED} frames`);
      // For testing, return crop anyway if we have some stability
      if (stableFrames < 2) return null;
    }
    
    // Debug video state
    if (!this.loggedVideoState) {
      console.log(`[Stability] Video state: width=${video.videoWidth}, height=${video.videoHeight}, readyState=${video.readyState}, paused=${video.paused}`);
      this.loggedVideoState = true;
    }
    
    // Make sure video has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn('[Stability] Video has invalid dimensions!');
      return null;
    }
    
    // Create rectified canvas matching video dimensions for now
    const rectifiedCanvas = document.createElement('canvas');
    const ctx = rectifiedCanvas.getContext('2d', { willReadFrequently: true })!;
    
    // Use video dimensions to avoid scaling issues
    rectifiedCanvas.width = video.videoWidth;
    rectifiedCanvas.height = video.videoHeight;
    
    // Apply inverse homography to get top-down view
    this.applyPerspectiveTransform(video, rectifiedCanvas, this.lastPose.homography);
    
    // Only log first rectified crop
    if (!this.loggedRectified) {
      console.log('[Stability] Returning rectified crop');
      this.loggedRectified = true;
    }
    return rectifiedCanvas;
  }
  
  /**
   * Reset tracker state
   */
  reset(): void {
    this.lastPose = null;
    this.poseHistory = [];
    this.stabilityHistory = [];
  }
  
  // Private helper methods
  
  private detectCard(imageData: ImageData): { found: boolean; corners: { x: number; y: number }[] } {
    // Simplified card detection using edge density and largest quadrilateral
    const edges = this.detectEdges(imageData);
    const contours = this.findContours(edges);
    
    if (contours.length === 0) {
      return { found: false, corners: [] };
    }
    
    // Find largest quadrilateral
    const quad = this.findLargestQuadrilateral(contours, imageData.width, imageData.height);
    
    if (!quad) {
      return { found: false, corners: [] };
    }
    
    return { found: true, corners: quad };
  }
  
  private detectEdges(imageData: ImageData): Uint8ClampedArray {
    const { data, width, height } = imageData;
    const edges = new Uint8ClampedArray(width * height);
    
    // Sobel edge detection
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // Get surrounding pixels (grayscale)
        const tl = (data[((y - 1) * width + (x - 1)) * 4] + data[((y - 1) * width + (x - 1)) * 4 + 1] + data[((y - 1) * width + (x - 1)) * 4 + 2]) / 3;
        const tm = (data[((y - 1) * width + x) * 4] + data[((y - 1) * width + x) * 4 + 1] + data[((y - 1) * width + x) * 4 + 2]) / 3;
        const tr = (data[((y - 1) * width + (x + 1)) * 4] + data[((y - 1) * width + (x + 1)) * 4 + 1] + data[((y - 1) * width + (x + 1)) * 4 + 2]) / 3;
        const ml = (data[(y * width + (x - 1)) * 4] + data[(y * width + (x - 1)) * 4 + 1] + data[(y * width + (x - 1)) * 4 + 2]) / 3;
        const mr = (data[(y * width + (x + 1)) * 4] + data[(y * width + (x + 1)) * 4 + 1] + data[(y * width + (x + 1)) * 4 + 2]) / 3;
        const bl = (data[((y + 1) * width + (x - 1)) * 4] + data[((y + 1) * width + (x - 1)) * 4 + 1] + data[((y + 1) * width + (x - 1)) * 4 + 2]) / 3;
        const bm = (data[((y + 1) * width + x) * 4] + data[((y + 1) * width + x) * 4 + 1] + data[((y + 1) * width + x) * 4 + 2]) / 3;
        const br = (data[((y + 1) * width + (x + 1)) * 4] + data[((y + 1) * width + (x + 1)) * 4 + 1] + data[((y + 1) * width + (x + 1)) * 4 + 2]) / 3;
        
        // Sobel X and Y
        const sobelX = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        const sobelY = (bl + 2 * bm + br) - (tl + 2 * tm + tr);
        
        const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
        edges[y * width + x] = Math.min(255, magnitude);
      }
    }
    
    return edges;
  }
  
  private findContours(edges: Uint8ClampedArray): Array<{ x: number; y: number }[]> {
    // Simplified contour detection - find connected edge components
    // This is a placeholder - in production, you'd use a proper contour detection algorithm
    const contours: Array<{ x: number; y: number }[]> = [];
    
    // For now, return a dummy contour representing typical card corners
    // In real implementation, this would detect actual edges
    return contours;
  }
  
  private findLargestQuadrilateral(
    contours: Array<{ x: number; y: number }[]>,
    width: number,
    height: number
  ): { x: number; y: number }[] | null {
    // For now, return approximate card corners based on typical card position
    // In production, this would use proper quadrilateral detection
    return this.getDefaultCorners(width, height);
  }
  
  private getDefaultCorners(width: number, height: number): { x: number; y: number }[] {
    // Assume card is roughly centered and takes up 60-80% of frame
    const cardWidth = width * 0.7;
    const cardHeight = height * 0.8;
    const left = (width - cardWidth) / 2;
    const top = (height - cardHeight) / 2;
    
    return [
      { x: left, y: top },                          // Top-left
      { x: left + cardWidth, y: top },              // Top-right
      { x: left + cardWidth, y: top + cardHeight }, // Bottom-right
      { x: left, y: top + cardHeight }               // Bottom-left
    ];
  }
  
  private calculateSharpness(imageData: ImageData, corners: { x: number; y: number }[]): number {
    // Variance of Laplacian - higher values indicate sharper image
    const { data, width, height } = imageData;
    
    // Calculate bounding box of card
    const minX = Math.min(...corners.map(c => c.x));
    const maxX = Math.max(...corners.map(c => c.x));
    const minY = Math.min(...corners.map(c => c.y));
    const maxY = Math.max(...corners.map(c => c.y));
    
    let sum = 0;
    let count = 0;
    const values: number[] = [];
    
    // Apply Laplacian kernel within card bounds
    for (let y = Math.max(1, minY); y < Math.min(height - 1, maxY); y += 2) {
      for (let x = Math.max(1, minX); x < Math.min(width - 1, maxX); x += 2) {
        const idx = (y * width + x) * 4;
        const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Laplacian kernel
        const top = (data[((y - 1) * width + x) * 4] + data[((y - 1) * width + x) * 4 + 1] + data[((y - 1) * width + x) * 4 + 2]) / 3;
        const bottom = (data[((y + 1) * width + x) * 4] + data[((y + 1) * width + x) * 4 + 1] + data[((y + 1) * width + x) * 4 + 2]) / 3;
        const left = (data[(y * width + (x - 1)) * 4] + data[(y * width + (x - 1)) * 4 + 1] + data[(y * width + (x - 1)) * 4 + 2]) / 3;
        const right = (data[(y * width + (x + 1)) * 4] + data[(y * width + (x + 1)) * 4 + 1] + data[(y * width + (x + 1)) * 4 + 2]) / 3;
        
        const laplacian = top + bottom + left + right - 4 * center;
        values.push(laplacian);
        sum += laplacian;
        count++;
      }
    }
    
    if (count === 0) return 0;
    
    // Calculate variance
    const mean = sum / count;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
    
    return variance;
  }
  
  private estimateHomography(
    corners: { x: number; y: number }[],
    width: number,
    height: number
  ): number[][] {
    // Estimate homography matrix for perspective transform
    // This maps card corners to a standard rectangle
    
    // Target rectangle (standard card aspect ratio)
    const targetWidth = 800;
    const targetHeight = 1120;
    
    const srcPoints = corners;
    const dstPoints = [
      { x: 0, y: 0 },
      { x: targetWidth, y: 0 },
      { x: targetWidth, y: targetHeight },
      { x: 0, y: targetHeight }
    ];
    
    // Simplified homography calculation
    // In production, use proper homography estimation (e.g., getPerspectiveTransform)
    return this.computeHomography(srcPoints, dstPoints);
  }
  
  private computeHomography(
    src: { x: number; y: number }[],
    dst: { x: number; y: number }[]
  ): number[][] {
    // Placeholder for homography computation
    // In production, implement proper DLT algorithm
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];
  }
  
  private calculateMotion(prev: CardPose, current: CardPose): number {
    // Calculate average corner movement
    let totalDelta = 0;
    for (let i = 0; i < 4; i++) {
      const dx = current.corners[i].x - prev.corners[i].x;
      const dy = current.corners[i].y - prev.corners[i].y;
      totalDelta += Math.sqrt(dx * dx + dy * dy);
    }
    return totalDelta / 4;
  }
  
  private calculateRotation(prev: CardPose, current: CardPose): number {
    // Calculate rotation change based on corner positions
    const prevAngle = Math.atan2(
      prev.corners[1].y - prev.corners[0].y,
      prev.corners[1].x - prev.corners[0].x
    );
    const currentAngle = Math.atan2(
      current.corners[1].y - current.corners[0].y,
      current.corners[1].x - current.corners[0].x
    );
    
    return Math.abs(currentAngle - prevAngle) * (180 / Math.PI);
  }
  
  private calculateStabilityScore(
    motion: number,
    rotation: number,
    sharpness: number,
    stableFrames: number
  ): number {
    // Combine metrics into overall stability score
    const motionScore = Math.max(0, 1 - motion / this.MOTION_THRESHOLD);
    const rotationScore = Math.max(0, 1 - rotation / this.ROTATION_THRESHOLD);
    const sharpnessScore = Math.min(1, sharpness / this.SHARPNESS_THRESHOLD);
    const frameScore = Math.min(1, stableFrames / this.STABILITY_FRAMES_REQUIRED);
    
    return (motionScore * 0.3 + rotationScore * 0.2 + sharpnessScore * 0.3 + frameScore * 0.2);
  }
  
  private applyPerspectiveTransform(
    source: HTMLVideoElement | HTMLCanvasElement,
    target: HTMLCanvasElement,
    homography: number[][]
  ): void {
    const ctx = target.getContext('2d', { willReadFrequently: true })!;
    
    // Don't fill with white - we want the actual video content!
    
    // For testing, extract just the bottom-left corner where collector number is
    // This simulates what a proper homography transform would do
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    
    // For testing: Just use the entire video frame
    // We're not detecting the card position, so let's use everything
    const extractX = 0;
    const extractY = 0;
    const extractWidth = sourceWidth;
    const extractHeight = sourceHeight;
    
    // Draw the entire source to target for now (no cropping)
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, target.width, target.height);
    
    // Verify we actually have image data
    const testData = ctx.getImageData(target.width/2, target.height/2, 1, 1).data;
    const hasContent = testData[0] !== 255 || testData[1] !== 255 || testData[2] !== 255; // Check if not pure white
    
    // Debug: Check multiple points
    const corners = [
      ctx.getImageData(0, 0, 1, 1).data,
      ctx.getImageData(target.width-1, 0, 1, 1).data,
      ctx.getImageData(0, target.height-1, 1, 1).data,
      ctx.getImageData(target.width-1, target.height-1, 1, 1).data
    ];
    
    const allWhite = corners.every(c => c[0] === 255 && c[1] === 255 && c[2] === 255);
    
    // Only log if we don't have content (error case) or first time
    if (allWhite && !this.loggedDrawInfo) {
      console.log(`[Stability] Warning: Canvas is all white after drawing video!`);
      console.log(`[Stability] Video dimensions: ${sourceWidth}x${sourceHeight}, Canvas: ${target.width}x${target.height}`);
      console.log(`[Stability] Video element:`, source instanceof HTMLVideoElement ? 'Is video element' : 'Is canvas');
      if (source instanceof HTMLVideoElement) {
        console.log(`[Stability] Video state: paused=${source.paused}, ended=${source.ended}, readyState=${source.readyState}`);
      }
      this.loggedDrawInfo = true;
    } else if (!this.loggedDrawInfo) {
      console.log(`[Stability] Initial draw: ${sourceWidth}x${sourceHeight} to ${target.width}x${target.height}, has content: ${hasContent}`);
      this.loggedDrawInfo = true;
    }
  }
}

export const cardStabilityTracker = new CardStabilityTracker();