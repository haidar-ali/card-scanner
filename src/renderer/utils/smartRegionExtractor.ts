/**
 * Smart Region Extractor for Card Text Detection
 * Uses edge detection and pattern recognition to find optimal text regions
 */

export interface RegionConfig {
  strategy: 'card-bottom' | 'adaptive' | 'multi-region' | 'edge-guided';
  targetWidth?: number;
  targetHeight?: number;
  padding?: number;
  useEdgeDetection?: boolean; // Uses Canvas-based edge detection
  contrastThreshold?: number;
  regionOfInterest?: {  // Optional custom region to focus on
    x: number;      // Percentage from left (0-1)
    y: number;      // Percentage from top (0-1)
    width: number;  // Percentage of video width (0-1)
    height: number; // Percentage of video height (0-1)
  };
}

export interface ExtractedRegion {
  canvas: HTMLCanvasElement;
  region: { x: number; y: number; width: number; height: number };
  confidence: number;
  strategy: string;
  metadata: {
    originalSize: { width: number; height: number };
    edgeCount?: number;
    textLikelihood?: number;
  };
}

export class SmartRegionExtractor {
  /**
   * Extract optimal regions for card text OCR
   */
  extractRegions(
    video: HTMLVideoElement,
    config: RegionConfig = { strategy: 'card-bottom' }
  ): ExtractedRegion[] {
    const regions: ExtractedRegion[] = [];

    switch (config.strategy) {
      case 'card-bottom':
        regions.push(this.extractCardBottom(video, config));
        break;
      case 'adaptive':
        regions.push(...this.extractAdaptiveRegions(video, config));
        break;
      case 'multi-region':
        regions.push(...this.extractMultipleRegions(video, config));
        break;
      case 'edge-guided':
        regions.push(...this.extractEdgeGuidedRegions(video, config));
        break;
    }

    return regions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract the bottom region where Magic card info typically appears
   */
  private extractCardBottom(video: HTMLVideoElement, config: RegionConfig): ExtractedRegion {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    
    let x: number, y: number, regionWidth: number, regionHeight: number;
    
    if (config.regionOfInterest) {
      // Use custom region of interest - focused on bottom-left corner
      x = Math.floor(config.regionOfInterest.x * sourceWidth);
      y = Math.floor(config.regionOfInterest.y * sourceHeight);
      regionWidth = Math.floor(config.regionOfInterest.width * sourceWidth);
      regionHeight = Math.floor(config.regionOfInterest.height * sourceHeight);
    } else {
      // Default: center-bottom region
      const targetWidth = config.targetWidth || Math.min(400, sourceWidth * 0.5);
      const targetHeight = config.targetHeight || Math.min(80, sourceHeight * 0.1);
      x = (sourceWidth - targetWidth) / 2;
      y = sourceHeight * 0.87;
      regionWidth = targetWidth;
      regionHeight = targetHeight;
    }
    
    // Set canvas to target dimensions
    const targetWidth = config.targetWidth || regionWidth;
    const targetHeight = config.targetHeight || regionHeight;
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Extract and scale the region to target size
    ctx.drawImage(
      video,
      x, y, regionWidth, regionHeight,
      0, 0, targetWidth, targetHeight
    );

    // Calculate confidence based on text-like characteristics
    const confidence = this.calculateTextLikelihood(canvas);

    return {
      canvas,
      region: { x, y, width: regionWidth, height: regionHeight },
      confidence,
      strategy: 'card-bottom',
      metadata: {
        originalSize: { width: sourceWidth, height: sourceHeight },
        textLikelihood: confidence
      }
    };
  }

  /**
   * Use adaptive analysis to find best text regions
   */
  private extractAdaptiveRegions(video: HTMLVideoElement, config: RegionConfig): ExtractedRegion[] {
    const regions: ExtractedRegion[] = [];
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true })!;

    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Analyze different vertical positions
    const positions = [0.65, 0.7, 0.75, 0.8]; // Different heights to check
    
    for (const position of positions) {
      const region = this.extractRegionAtPosition(video, position, config);
      if (region.confidence > 0.3) { // Only include promising regions
        regions.push(region);
      }
    }

    return regions;
  }

  /**
   * Extract multiple overlapping regions for comprehensive coverage
   */
  private extractMultipleRegions(video: HTMLVideoElement, config: RegionConfig): ExtractedRegion[] {
    const regions: ExtractedRegion[] = [];

    // Different region configurations
    const configurations = [
      { position: 0.75, width: 0.6, height: 0.12 }, // Standard card bottom
      { position: 0.78, width: 0.5, height: 0.1 },  // Narrower, lower
      { position: 0.72, width: 0.7, height: 0.15 }, // Wider, higher
      { position: 0.8, width: 0.4, height: 0.08 }   // Very focused
    ];

    for (const conf of configurations) {
      const region = this.extractCustomRegion(video, conf, config);
      regions.push(region);
    }

    return regions;
  }

  /**
   * Use edge detection to guide region extraction
   */
  private extractEdgeGuidedRegions(video: HTMLVideoElement, config: RegionConfig): ExtractedRegion[] {
    if (!config.useEdgeDetection) {
      return [this.extractCardBottom(video, config)];
    }

    // Create canvas for edge detection
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Apply edge detection
    const edges = this.detectEdges(tempCanvas);
    
    // Find regions with high edge density (likely text areas)
    const textRegions = this.findTextRegions(edges, video);
    
    return textRegions.map(region => this.extractSpecificRegion(video, region, config));
  }

  private extractRegionAtPosition(
    video: HTMLVideoElement,
    verticalPosition: number,
    config: RegionConfig
  ): ExtractedRegion {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const width = config.targetWidth || Math.min(600, video.videoWidth * 0.6);
    const height = config.targetHeight || Math.min(100, video.videoHeight * 0.12);
    const x = (video.videoWidth - width) / 2;
    const y = video.videoHeight * verticalPosition;

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(video, x, y, width, height, 0, 0, width, height);

    const confidence = this.calculateTextLikelihood(canvas);

    return {
      canvas,
      region: { x, y, width, height },
      confidence,
      strategy: `adaptive-${verticalPosition}`,
      metadata: {
        originalSize: { width: video.videoWidth, height: video.videoHeight },
        textLikelihood: confidence
      }
    };
  }

  private extractCustomRegion(
    video: HTMLVideoElement,
    config: { position: number; width: number; height: number },
    regionConfig: RegionConfig
  ): ExtractedRegion {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const width = video.videoWidth * config.width;
    const height = video.videoHeight * config.height;
    const x = (video.videoWidth - width) / 2;
    const y = video.videoHeight * config.position;

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(video, x, y, width, height, 0, 0, width, height);

    const confidence = this.calculateTextLikelihood(canvas);

    return {
      canvas,
      region: { x, y, width, height },
      confidence,
      strategy: `multi-region-${config.position}`,
      metadata: {
        originalSize: { width: video.videoWidth, height: video.videoHeight },
        textLikelihood: confidence
      }
    };
  }

  private extractSpecificRegion(
    video: HTMLVideoElement,
    region: { x: number; y: number; width: number; height: number },
    config: RegionConfig
  ): ExtractedRegion {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    canvas.width = region.width;
    canvas.height = region.height;

    ctx.drawImage(
      video,
      region.x, region.y, region.width, region.height,
      0, 0, region.width, region.height
    );

    const confidence = this.calculateTextLikelihood(canvas);

    return {
      canvas,
      region,
      confidence,
      strategy: 'edge-guided',
      metadata: {
        originalSize: { width: video.videoWidth, height: video.videoHeight },
        textLikelihood: confidence
      }
    };
  }

  /**
   * Calculate how likely a region contains readable text
   */
  private calculateTextLikelihood(canvas: HTMLCanvasElement): number {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Factors that indicate text presence
    let edgeCount = 0;
    let contrastVariations = 0;
    let horizontalPatterns = 0;

    // Edge detection (simplified)
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = (y * canvas.width + x) * 4;
        const current = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Check surrounding pixels
        const right = (data[idx + 4] + data[idx + 5] + data[idx + 6]) / 3;
        const below = (data[(y + 1) * canvas.width * 4 + x * 4] + 
                      data[(y + 1) * canvas.width * 4 + x * 4 + 1] + 
                      data[(y + 1) * canvas.width * 4 + x * 4 + 2]) / 3;

        if (Math.abs(current - right) > 30 || Math.abs(current - below) > 30) {
          edgeCount++;
        }
      }
    }

    // Horizontal line detection (text typically has horizontal patterns)
    for (let y = 0; y < canvas.height; y += 5) {
      let lineVariation = 0;
      let prevPixel = 0;
      
      for (let x = 0; x < canvas.width; x += 2) {
        const idx = (y * canvas.width + x) * 4;
        const pixel = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        if (x > 0 && Math.abs(pixel - prevPixel) > 20) {
          lineVariation++;
        }
        prevPixel = pixel;
      }
      
      if (lineVariation > 3 && lineVariation < canvas.width / 10) {
        horizontalPatterns++;
      }
    }

    // Contrast variation
    const pixels = [];
    for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
      pixels.push((data[i] + data[i + 1] + data[i + 2]) / 3);
    }
    
    const mean = pixels.reduce((a, b) => a + b) / pixels.length;
    const variance = pixels.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / pixels.length;
    const contrast = Math.sqrt(variance) / 255;

    // Calculate composite score
    const edgeScore = Math.min(1, edgeCount / (canvas.width * canvas.height * 0.1));
    const contrastScore = Math.min(1, contrast * 3);
    const patternScore = Math.min(1, horizontalPatterns / (canvas.height / 10));

    const likelihood = (edgeScore * 0.4 + contrastScore * 0.4 + patternScore * 0.2);
    
    return Math.min(1, Math.max(0, likelihood));
  }

  /**
   * Simple edge detection for text region finding
   */
  private detectEdges(canvas: HTMLCanvasElement): ImageData {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const edges = new Uint8ClampedArray(data.length);

    // Sobel edge detection
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = (y * canvas.width + x) * 4;
        
        // Get surrounding pixels
        const tl = data[((y - 1) * canvas.width + (x - 1)) * 4];
        const tm = data[((y - 1) * canvas.width + x) * 4];
        const tr = data[((y - 1) * canvas.width + (x + 1)) * 4];
        const ml = data[(y * canvas.width + (x - 1)) * 4];
        const mr = data[(y * canvas.width + (x + 1)) * 4];
        const bl = data[((y + 1) * canvas.width + (x - 1)) * 4];
        const bm = data[((y + 1) * canvas.width + x) * 4];
        const br = data[((y + 1) * canvas.width + (x + 1)) * 4];

        // Sobel X
        const sobelX = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        // Sobel Y  
        const sobelY = (bl + 2 * bm + br) - (tl + 2 * tm + tr);
        
        const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
        const value = Math.min(255, magnitude);
        
        edges[idx] = value;
        edges[idx + 1] = value;
        edges[idx + 2] = value;
        edges[idx + 3] = 255;
      }
    }

    return new ImageData(edges, canvas.width, canvas.height);
  }

  /**
   * Find regions with high edge density (likely text)
   */
  private findTextRegions(edges: ImageData, video: HTMLVideoElement): Array<{x: number, y: number, width: number, height: number}> {
    const regions = [];
    const blockSize = 50; // Size of blocks to analyze
    const threshold = 20; // Minimum edge density

    for (let y = 0; y < edges.height - blockSize; y += blockSize / 2) {
      for (let x = 0; x < edges.width - blockSize; x += blockSize / 2) {
        let edgeCount = 0;
        
        // Count edges in this block
        for (let by = y; by < Math.min(y + blockSize, edges.height); by++) {
          for (let bx = x; bx < Math.min(x + blockSize, edges.width); bx++) {
            const idx = (by * edges.width + bx) * 4;
            if (edges.data[idx] > 100) {
              edgeCount++;
            }
          }
        }
        
        if (edgeCount > threshold) {
          regions.push({
            x: x,
            y: y,
            width: Math.min(blockSize * 2, edges.width - x),
            height: Math.min(blockSize, edges.height - y)
          });
        }
      }
    }

    return regions;
  }
}

export const smartRegionExtractor = new SmartRegionExtractor();