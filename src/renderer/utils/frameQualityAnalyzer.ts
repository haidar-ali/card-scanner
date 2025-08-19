/**
 * Frame Quality Analyzer for Smart OCR Triggering
 * Analyzes video frames for focus, stability, and alignment
 */

export interface QualityMetrics {
  focusScore: number;      // 0-100: Higher is sharper
  motionScore: number;     // 0-100: Lower is more stable
  alignmentScore: number;  // 0-100: Higher is better aligned
  edgeDensity: number;     // 0-100: Higher means more text-like edges
  brightness: number;      // 0-100: Optimal around 50
  contrast: number;        // 0-100: Higher is better for text
  isReady: boolean;        // Overall readiness for OCR
}

export interface FrameAnalysisConfig {
  focusThreshold: number;      // Min focus score (default: 40)
  motionThreshold: number;     // Max motion allowed (default: 10)
  alignmentThreshold: number;  // Min alignment score (default: 60)
  edgeThreshold: number;       // Min edge density (default: 30)
  targetRegion: {             // Where card should be positioned
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class FrameQualityAnalyzer {
  private previousFrame: ImageData | null = null;
  private frameHistory: QualityMetrics[] = [];
  private readonly HISTORY_SIZE = 5;
  
  private defaultConfig: FrameAnalysisConfig = {
    focusThreshold: 40,
    motionThreshold: 10,
    alignmentThreshold: 60,
    edgeThreshold: 30,
    targetRegion: {
      x: 0.2,   // 20% from left - focus on bottom-left corner
      y: 0.5,   // 50% from top - lower portion where card info is
      width: 0.25,  // 25% of video width - just the left corner
      height: 0.15  // 15% of video height - tighter focus on text lines
    }
  };

  /**
   * Analyze a video frame for OCR readiness
   */
  analyzeFrame(
    canvas: HTMLCanvasElement,
    config: Partial<FrameAnalysisConfig> = {}
  ): QualityMetrics {
    const cfg = { ...this.defaultConfig, ...config };
    // Use willReadFrequently if creating new context
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Calculate target region in pixels
    const targetX = Math.floor(cfg.targetRegion.x * canvas.width);
    const targetY = Math.floor(cfg.targetRegion.y * canvas.height);
    const targetWidth = Math.floor(cfg.targetRegion.width * canvas.width);
    const targetHeight = Math.floor(cfg.targetRegion.height * canvas.height);
    
    // Extract target region for analysis
    const targetData = ctx.getImageData(targetX, targetY, targetWidth, targetHeight);
    
    // Calculate individual metrics
    const focusScore = this.calculateFocusScore(targetData);
    const motionScore = this.calculateMotionScore(imageData);
    const edgeDensity = this.calculateEdgeDensity(targetData);
    const alignmentScore = this.calculateAlignmentScore(targetData, edgeDensity);
    const brightness = this.calculateBrightness(targetData);
    const contrast = this.calculateContrast(targetData);
    
    // Determine overall readiness
    const isReady = 
      focusScore >= cfg.focusThreshold &&
      motionScore <= cfg.motionThreshold &&
      alignmentScore >= cfg.alignmentThreshold &&
      edgeDensity >= cfg.edgeThreshold &&
      brightness > 20 && brightness < 80 && // Not too dark or bright
      contrast > 20; // Sufficient contrast
    
    const metrics: QualityMetrics = {
      focusScore,
      motionScore,
      alignmentScore,
      edgeDensity,
      brightness,
      contrast,
      isReady
    };
    
    // Update history for stability tracking
    this.frameHistory.push(metrics);
    if (this.frameHistory.length > this.HISTORY_SIZE) {
      this.frameHistory.shift();
    }
    
    // Store frame for motion detection
    this.previousFrame = imageData;
    
    return metrics;
  }

  /**
   * Calculate focus score using Laplacian variance
   */
  private calculateFocusScore(imageData: ImageData): number {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    if (width < 50 || height < 50) return 100; // Too small to analyze
    
    let variance = 0;
    let mean = 0;
    let count = 0;
    
    // Sample every few pixels for performance
    const step = Math.max(2, Math.floor(Math.min(width, height) / 40));
    
    for (let y = step; y < height - step; y += step) {
      for (let x = step; x < width - step; x += step) {
        const idx = (y * width + x) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        
        // Calculate Laplacian (edge strength)
        const center = gray;
        const top = 0.299 * data[((y - step) * width + x) * 4] + 
                    0.587 * data[((y - step) * width + x) * 4 + 1] + 
                    0.114 * data[((y - step) * width + x) * 4 + 2];
        const bottom = 0.299 * data[((y + step) * width + x) * 4] + 
                       0.587 * data[((y + step) * width + x) * 4 + 1] + 
                       0.114 * data[((y + step) * width + x) * 4 + 2];
        const left = 0.299 * data[(y * width + (x - step)) * 4] + 
                     0.587 * data[(y * width + (x - step)) * 4 + 1] + 
                     0.114 * data[(y * width + (x - step)) * 4 + 2];
        const right = 0.299 * data[(y * width + (x + step)) * 4] + 
                      0.587 * data[(y * width + (x + step)) * 4 + 1] + 
                      0.114 * data[(y * width + (x + step)) * 4 + 2];
        
        const laplacian = Math.abs(4 * center - top - bottom - left - right);
        mean += laplacian;
        variance += laplacian * laplacian;
        count++;
      }
    }
    
    if (count === 0) return 0;
    
    mean /= count;
    variance = variance / count - mean * mean;
    
    // Scale to 0-100 range (empirically determined)
    const score = Math.min(100, Math.sqrt(variance) * 2);
    return score;
  }

  /**
   * Calculate motion score by comparing with previous frame
   */
  private calculateMotionScore(imageData: ImageData): number {
    if (!this.previousFrame) return 0; // No previous frame, assume no motion
    
    const data = imageData.data;
    const prevData = this.previousFrame.data;
    const length = data.length;
    
    // Sample pixels for performance
    let totalDiff = 0;
    let samples = 0;
    const step = 16; // Sample every 16th pixel
    
    for (let i = 0; i < length; i += step * 4) {
      const currGray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const prevGray = 0.299 * prevData[i] + 0.587 * prevData[i + 1] + 0.114 * prevData[i + 2];
      totalDiff += Math.abs(currGray - prevGray);
      samples++;
    }
    
    // Average difference per pixel (0-255 scale)
    const avgDiff = totalDiff / samples;
    
    // Scale to 0-100 (0 = no motion, 100 = maximum motion)
    return Math.min(100, (avgDiff / 255) * 200);
  }

  /**
   * Calculate edge density (indicates presence of text)
   */
  private calculateEdgeDensity(imageData: ImageData): number {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    let edgePixels = 0;
    let totalPixels = 0;
    const threshold = 30; // Edge detection threshold
    
    // Sobel edge detection (simplified)
    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const idx = (y * width + x) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        
        // Horizontal gradient
        const leftIdx = (y * width + (x - 1)) * 4;
        const rightIdx = (y * width + (x + 1)) * 4;
        const grayLeft = 0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
        const grayRight = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
        const gradX = Math.abs(grayRight - grayLeft);
        
        // Vertical gradient
        const topIdx = ((y - 1) * width + x) * 4;
        const bottomIdx = ((y + 1) * width + x) * 4;
        const grayTop = 0.299 * data[topIdx] + 0.587 * data[topIdx + 1] + 0.114 * data[topIdx + 2];
        const grayBottom = 0.299 * data[bottomIdx] + 0.587 * data[bottomIdx + 1] + 0.114 * data[bottomIdx + 2];
        const gradY = Math.abs(grayBottom - grayTop);
        
        const gradient = Math.sqrt(gradX * gradX + gradY * gradY);
        if (gradient > threshold) {
          edgePixels++;
        }
        totalPixels++;
      }
    }
    
    // Percentage of pixels that are edges (text typically 5-20%)
    const density = (edgePixels / totalPixels) * 100;
    
    // Scale to 0-100 where 10% edge density = 100 score
    return Math.min(100, density * 10);
  }

  /**
   * Calculate alignment score based on edge distribution
   */
  private calculateAlignmentScore(imageData: ImageData, edgeDensity: number): number {
    // If not enough edges, can't determine alignment
    if (edgeDensity < 20) return 0;
    
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Check horizontal edge distribution (text should be horizontally distributed)
    let rowsWithEdges = 0;
    const threshold = 30;
    
    for (let y = 0; y < height; y += 2) {
      let hasEdge = false;
      for (let x = 1; x < width - 1; x += 4) {
        const idx = (y * width + x) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const nextIdx = (y * width + (x + 1)) * 4;
        const grayNext = 0.299 * data[nextIdx] + 0.587 * data[nextIdx + 1] + 0.114 * data[nextIdx + 2];
        
        if (Math.abs(gray - grayNext) > threshold) {
          hasEdge = true;
          break;
        }
      }
      if (hasEdge) rowsWithEdges++;
    }
    
    // Good alignment = edges distributed across many rows
    const distribution = (rowsWithEdges / (height / 2)) * 100;
    
    // Combine with edge density for final score
    return Math.min(100, (distribution + edgeDensity) / 2);
  }

  /**
   * Calculate average brightness
   */
  private calculateBrightness(imageData: ImageData): number {
    const data = imageData.data;
    let total = 0;
    let pixels = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      total += gray;
      pixels++;
    }
    
    return (total / pixels / 255) * 100;
  }

  /**
   * Calculate contrast (standard deviation of brightness)
   */
  private calculateContrast(imageData: ImageData): number {
    const data = imageData.data;
    const values: number[] = [];
    
    for (let i = 0; i < data.length; i += 16) { // Sample for performance
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      values.push(gray);
    }
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    
    return Math.min(100, (Math.sqrt(variance) / 255) * 400);
  }

  /**
   * Check if quality has been stable for N frames
   */
  isStable(minFrames: number = 3): boolean {
    if (this.frameHistory.length < minFrames) return false;
    
    const recentFrames = this.frameHistory.slice(-minFrames);
    return recentFrames.every(m => m.isReady);
  }

  /**
   * Get average metrics over recent frames
   */
  getAverageMetrics(): QualityMetrics | null {
    if (this.frameHistory.length === 0) return null;
    
    const sum = this.frameHistory.reduce((acc, m) => ({
      focusScore: acc.focusScore + m.focusScore,
      motionScore: acc.motionScore + m.motionScore,
      alignmentScore: acc.alignmentScore + m.alignmentScore,
      edgeDensity: acc.edgeDensity + m.edgeDensity,
      brightness: acc.brightness + m.brightness,
      contrast: acc.contrast + m.contrast,
      isReady: false
    }), {
      focusScore: 0,
      motionScore: 0,
      alignmentScore: 0,
      edgeDensity: 0,
      brightness: 0,
      contrast: 0,
      isReady: false
    });
    
    const count = this.frameHistory.length;
    return {
      focusScore: sum.focusScore / count,
      motionScore: sum.motionScore / count,
      alignmentScore: sum.alignmentScore / count,
      edgeDensity: sum.edgeDensity / count,
      brightness: sum.brightness / count,
      contrast: sum.contrast / count,
      isReady: this.frameHistory[this.frameHistory.length - 1].isReady
    };
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.previousFrame = null;
    this.frameHistory = [];
  }
}

export const frameQualityAnalyzer = new FrameQualityAnalyzer();