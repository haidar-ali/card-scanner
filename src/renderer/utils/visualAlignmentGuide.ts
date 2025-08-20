/**
 * Visual Alignment Guide for Card Scanning
 * Provides on-screen guidance for optimal card positioning
 */

export interface GuideConfig {
  targetRegion: {
    x: number;      // Percentage from left (0-1)
    y: number;      // Percentage from top (0-1)
    width: number;   // Percentage of canvas width (0-1)
    height: number;  // Percentage of canvas height (0-1)
  };
  processRegion?: {  // Optional inner region for actual processing
    x: number;
    y: number;
    width: number;
    height: number;
  };
  colors: {
    idle: string;
    detecting: string;
    ready: string;
    processing: string;
    success: string;
    error: string;
  };
  showMetrics: boolean;
  showInstructions: boolean;
}

export type ScanState = 'idle' | 'detecting' | 'ready' | 'processing' | 'success' | 'error';

export class VisualAlignmentGuide {
  private currentState: ScanState = 'idle';
  private message: string = 'Position entire card within the frame';
  private metrics: any = null;
  private animationFrame = 0;
  
  private defaultConfig: GuideConfig = {
    targetRegion: {
      x: 0.25,      // 25% from left - center the card
      y: 0.15,      // 15% from top - show full card height
      width: 0.50,  // 50% of width - full card width
      height: 0.70  // 70% of height - full card height (typical Magic card aspect ratio)
    },
    processRegion: {  // Optional inner region - can be smaller for focus area
      x: 0.30,      // 30% from left - inner card area
      y: 0.20,      // 20% from top - inner card area  
      width: 0.40,  // 40% width - inner card area
      height: 0.60  // 60% height - inner card area
    },
    colors: {
      idle: 'rgba(255, 255, 255, 0.3)',
      detecting: 'rgba(255, 200, 0, 0.5)',
      ready: 'rgba(0, 255, 0, 0.6)',
      processing: 'rgba(0, 150, 255, 0.7)',
      success: 'rgba(0, 255, 0, 0.9)',
      error: 'rgba(255, 0, 0, 0.6)'
    },
    showMetrics: false,
    showInstructions: true
  };

  /**
   * Draw alignment guide overlay on canvas
   */
  drawGuide(
    canvas: HTMLCanvasElement,
    state?: ScanState,
    config: Partial<GuideConfig> = {}
  ): void {
    const cfg = { ...this.defaultConfig, ...config };
    const ctx = canvas.getContext('2d')!;
    
    if (state) {
      this.currentState = state;
    }
    
    // Update animation frame
    this.animationFrame = (this.animationFrame + 1) % 60;
    
    // Clear any previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate target region in pixels
    const targetX = Math.floor(cfg.targetRegion.x * canvas.width);
    const targetY = Math.floor(cfg.targetRegion.y * canvas.height);
    const targetWidth = Math.floor(cfg.targetRegion.width * canvas.width);
    const targetHeight = Math.floor(cfg.targetRegion.height * canvas.height);
    
    // Draw darkened overlay outside target region
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Clear the target region
    ctx.clearRect(targetX, targetY, targetWidth, targetHeight);
    
    // Draw target region border (outer guide)
    const color = cfg.colors[this.currentState];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.globalAlpha = 0.5;
    
    // Draw outer rectangle (card positioning guide)
    ctx.strokeRect(targetX, targetY, targetWidth, targetHeight);
    ctx.setLineDash([]);
    
    // Draw process region (inner rectangle for actual OCR area)
    if (cfg.processRegion) {
      const processX = Math.floor(cfg.processRegion.x * canvas.width);
      const processY = Math.floor(cfg.processRegion.y * canvas.height);
      const processWidth = Math.floor(cfg.processRegion.width * canvas.width);
      const processHeight = Math.floor(cfg.processRegion.height * canvas.height);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = this.currentState === 'processing' ? 4 : 3;
      ctx.globalAlpha = 1;
      
      // Add pulsing effect for certain states
      if (this.currentState === 'ready' || this.currentState === 'processing') {
        const pulse = Math.sin(this.animationFrame * 0.1) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
      }
      
      // Draw inner rectangle (actual scanning area)
      ctx.strokeRect(processX, processY, processWidth, processHeight);
      
      // Draw corner brackets for the process region
      this.drawCornerBrackets(ctx, processX, processY, processWidth, processHeight, color);
      
      // Add label for process region
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(processX, processY - 25, 100, 20);
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('SCAN AREA', processX + 5, processY - 15);
    } else {
      // Fallback to drawing brackets on outer region
      this.drawCornerBrackets(ctx, targetX, targetY, targetWidth, targetHeight, color);
    }
    
    // Draw center crosshair for alignment
    if (this.currentState === 'idle' || this.currentState === 'detecting') {
      this.drawCrosshair(ctx, targetX + targetWidth/2, targetY + targetHeight/2, 20, color);
    }
    
    // Draw scan lines animation when processing
    if (this.currentState === 'processing') {
      this.drawScanLines(ctx, targetX, targetY, targetWidth, targetHeight);
    }
    
    // Reset alpha
    ctx.globalAlpha = 1;
    
    // Draw status message
    this.drawStatusMessage(ctx, canvas.width, canvas.height);
    
    // Draw instructions
    if (cfg.showInstructions) {
      this.drawInstructions(ctx, targetX, targetY, targetWidth, targetHeight);
    }
    
    // Draw metrics if enabled
    if (cfg.showMetrics && this.metrics) {
      this.drawMetrics(ctx, canvas.width, canvas.height);
    }
  }

  /**
   * Draw corner brackets for target region
   */
  private drawCornerBrackets(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ): void {
    const bracketLength = 30;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + bracketLength);
    ctx.lineTo(x, y);
    ctx.lineTo(x + bracketLength, y);
    ctx.stroke();
    
    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + width - bracketLength, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + bracketLength);
    ctx.stroke();
    
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x, y + height - bracketLength);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + bracketLength, y + height);
    ctx.stroke();
    
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + width - bracketLength, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width, y + height - bracketLength);
    ctx.stroke();
  }

  /**
   * Draw crosshair for center alignment
   */
  private drawCrosshair(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number,
    color: string
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY);
    ctx.lineTo(centerX + size, centerY);
    ctx.stroke();
    
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - size);
    ctx.lineTo(centerX, centerY + size);
    ctx.stroke();
    
    ctx.setLineDash([]);
  }

  /**
   * Draw animated scan lines
   */
  private drawScanLines(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const scanLineY = y + (this.animationFrame * 2) % height;
    
    // Horizontal scan line
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, scanLineY);
    ctx.lineTo(x + width, scanLineY);
    ctx.stroke();
    
    // Glow effect
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, scanLineY);
    ctx.lineTo(x + width, scanLineY);
    ctx.stroke();
  }

  /**
   * Draw status message
   */
  private drawStatusMessage(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const message = this.getStatusMessage();
    const padding = 20;
    const boxHeight = 50;
    const boxY = canvasHeight - boxHeight - padding;
    
    // Background box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(padding, boxY, canvasWidth - padding * 2, boxHeight);
    
    // Status icon
    const iconX = padding + 15;
    const iconY = boxY + boxHeight / 2;
    this.drawStatusIcon(ctx, iconX, iconY);
    
    // Status text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, iconX + 30, iconY);
  }

  /**
   * Draw status icon
   */
  private drawStatusIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const radius = 8;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    
    switch (this.currentState) {
      case 'idle':
        ctx.fillStyle = 'gray';
        break;
      case 'detecting':
        ctx.fillStyle = 'orange';
        break;
      case 'ready':
        ctx.fillStyle = 'lime';
        break;
      case 'processing':
        ctx.fillStyle = 'cyan';
        break;
      case 'success':
        ctx.fillStyle = 'green';
        break;
      case 'error':
        ctx.fillStyle = 'red';
        break;
    }
    
    ctx.fill();
    
    // Add pulsing animation for active states
    if (this.currentState === 'processing' || this.currentState === 'ready') {
      const pulse = Math.sin(this.animationFrame * 0.15) * 0.5 + 0.5;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Draw instructions
   */
  private drawInstructions(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    const instruction = this.getInstruction();
    const textY = y - 10;
    
    // Draw background for better readability
    const textWidth = ctx.measureText(instruction).width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x + width/2 - textWidth/2 - 10, textY - 20, textWidth + 20, 25);
    
    // Draw instruction text
    ctx.fillStyle = 'white';
    ctx.fillText(instruction, x + width / 2, textY);
  }

  /**
   * Draw quality metrics
   */
  private drawMetrics(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (!this.metrics) return;
    
    const x = 20;
    const y = 20;
    const lineHeight = 20;
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - 5, y - 5, 200, lineHeight * 6 + 10);
    
    // Metrics text
    ctx.fillStyle = 'white';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    const metrics = [
      `Focus: ${this.metrics.focusScore?.toFixed(0) || 0}%`,
      `Motion: ${this.metrics.motionScore?.toFixed(0) || 0}%`,
      `Alignment: ${this.metrics.alignmentScore?.toFixed(0) || 0}%`,
      `Edge Density: ${this.metrics.edgeDensity?.toFixed(0) || 0}%`,
      `Brightness: ${this.metrics.brightness?.toFixed(0) || 0}%`,
      `Contrast: ${this.metrics.contrast?.toFixed(0) || 0}%`
    ];
    
    metrics.forEach((metric, i) => {
      ctx.fillText(metric, x, y + i * lineHeight);
    });
  }

  /**
   * Get status message based on current state
   */
  private getStatusMessage(): string {
    switch (this.currentState) {
      case 'idle':
        return 'Position the bottom of your card in the frame';
      case 'detecting':
        return 'Detecting card... Hold steady';
      case 'ready':
        return 'Card detected! Hold position for scanning';
      case 'processing':
        return 'Scanning card information...';
      case 'success':
        return 'Card successfully scanned!';
      case 'error':
        return 'Unable to read card. Try adjusting position';
      default:
        return this.message;
    }
  }

  /**
   * Get instruction based on current state
   */
  private getInstruction(): string {
    switch (this.currentState) {
      case 'idle':
        return 'Position collector number (like "204/205") in the LEFT box';
      case 'detecting':
        return 'Aligning... Keep card steady';
      case 'ready':
        return 'Perfect! Hold still';
      case 'processing':
        return 'Reading collector number and set code...';
      case 'success':
        return 'Ready for next card';
      case 'error':
        return 'Adjust lighting or focus';
      default:
        return '';
    }
  }

  /**
   * Update guide state
   */
  setState(state: ScanState, message?: string): void {
    this.currentState = state;
    if (message) {
      this.message = message;
    }
  }

  /**
   * Update quality metrics for display
   */
  setMetrics(metrics: any): void {
    this.metrics = metrics;
  }

  /**
   * Get current state
   */
  getState(): ScanState {
    return this.currentState;
  }
}

export const visualAlignmentGuide = new VisualAlignmentGuide();