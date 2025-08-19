/**
 * Streaming OCR Service
 * Orchestrates the multi-rate pipeline with three loops
 */

import { cardStabilityTracker, type StabilityMetrics } from './cardStabilityTracker';
import { streamingROIManager, type ROIResults } from './streamingROIManager';
import { temporalOCRFusion, type CardIdentification } from './temporalOCRFusion';
import { setSymbolClassifier, type SymbolClassification } from './setSymbolClassifier';

export interface StreamingOCRConfig {
  fastLoopFps: number; // Target FPS for stability tracking (30)
  mediumLoopFps: number; // Target FPS for ROI processing (4-10)
  slowLoopFps: number; // Target FPS for fusion/commit (1-3)
  enableSymbolClassification: boolean;
  enableAutoCommit: boolean;
  debugMode: boolean;
}

export interface StreamingStatus {
  isRunning: boolean;
  cardPresent: boolean;
  isStable: boolean;
  stabilityScore: number;
  currentHypotheses: Map<string, { value: string; confidence: number; votes: number }>;
  pendingIdentification?: CardIdentification;
  lastCommittedCard?: CardIdentification;
  fps: { fast: number; medium: number; slow: number };
}

export type StreamingEventType = 
  | 'stability-changed'
  | 'hypotheses-updated'
  | 'card-identified'
  | 'card-committed'
  | 'error';

export interface StreamingEvent {
  type: StreamingEventType;
  data: any;
  timestamp: number;
}

export class StreamingOCRService {
  private config: StreamingOCRConfig = {
    fastLoopFps: 30,
    mediumLoopFps: 7,
    slowLoopFps: 2,
    enableSymbolClassification: false,  // Disabled since we're only scanning bottom edge
    enableAutoCommit: true,
    debugMode: true  // Enable to see what's being detected
  };
  
  private status: StreamingStatus = {
    isRunning: false,
    cardPresent: false,
    isStable: false,
    stabilityScore: 0,
    currentHypotheses: new Map(),
    fps: { fast: 0, medium: 0, slow: 0 }
  };
  
  // Loop control
  private fastLoopInterval: number | null = null;
  private mediumLoopInterval: number | null = null;
  private slowLoopInterval: number | null = null;
  private fastLoopRAF: number | null = null;
  
  // Performance tracking
  private frameCounters = { fast: 0, medium: 0, slow: 0 };
  private fpsTimers = { fast: 0, medium: 0, slow: 0 };
  
  // State
  private currentVideo: HTMLVideoElement | null = null;
  private currentCanvas: HTMLCanvasElement | null = null;
  private lastStabilityMetrics: StabilityMetrics | null = null;
  private lastROIResults: ROIResults | null = null;
  private symbolCandidates: SymbolClassification[] = [];
  
  // Event handlers
  private eventListeners = new Map<StreamingEventType, Set<(event: StreamingEvent) => void>>();
  
  constructor() {
    // Initialize services
    this.initialize();
  }
  
  private async initialize(): Promise<void> {
    await Promise.all([
      streamingROIManager.initialize(),
      setSymbolClassifier.initialize()
    ]);
  }
  
  /**
   * Start the streaming pipeline
   */
  async start(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<void> {
    if (this.status.isRunning) {
      console.warn('[StreamingOCR] Already running');
      return;
    }
    
    console.log('[StreamingOCR] Starting streaming pipeline');
    
    this.currentVideo = video;
    this.currentCanvas = canvas;
    this.status.isRunning = true;
    
    // Reset state
    cardStabilityTracker.reset();
    temporalOCRFusion.reset();
    this.symbolCandidates = [];
    
    // Start the three loops
    this.startFastLoop();
    this.startMediumLoop();
    this.startSlowLoop();
    
    // Start FPS counter
    this.startFpsCounter();
    
    this.emitEvent('stability-changed', { isStable: false });
  }
  
  /**
   * Stop the streaming pipeline
   */
  stop(): void {
    if (!this.status.isRunning) return;
    
    console.log('[StreamingOCR] Stopping streaming pipeline');
    
    this.status.isRunning = false;
    
    // Stop all loops
    if (this.fastLoopRAF) {
      cancelAnimationFrame(this.fastLoopRAF);
      this.fastLoopRAF = null;
    }
    if (this.mediumLoopInterval) {
      clearInterval(this.mediumLoopInterval);
      this.mediumLoopInterval = null;
    }
    if (this.slowLoopInterval) {
      clearInterval(this.slowLoopInterval);
      this.slowLoopInterval = null;
    }
    
    // Reset state
    this.currentVideo = null;
    this.currentCanvas = null;
    this.lastStabilityMetrics = null;
    this.lastROIResults = null;
  }
  
  /**
   * Fast Loop: Card detection and stability tracking (30fps)
   */
  private startFastLoop(): void {
    const targetFrameTime = 1000 / this.config.fastLoopFps;
    let lastTime = 0;
    
    const loop = (timestamp: number) => {
      if (!this.status.isRunning) return;
      
      // Throttle to target FPS
      if (timestamp - lastTime < targetFrameTime) {
        this.fastLoopRAF = requestAnimationFrame(loop);
        return;
      }
      
      lastTime = timestamp;
      this.frameCounters.fast++;
      
      if (!this.currentVideo || !this.currentCanvas) {
        this.fastLoopRAF = requestAnimationFrame(loop);
        return;
      }
      
      try {
        // Draw current frame to canvas
        const ctx = this.currentCanvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(this.currentVideo, 0, 0, this.currentCanvas.width, this.currentCanvas.height);
        
        // Analyze stability
        const metrics = cardStabilityTracker.analyzeFrame(this.currentCanvas);
        this.lastStabilityMetrics = metrics;
        
        // Update status
        const wasStable = this.status.isStable;
        const wasPresent = this.status.cardPresent;
        this.status.cardPresent = metrics.cardPresent;
        this.status.isStable = metrics.isStable;
        this.status.stabilityScore = metrics.stabilityScore;
        
        // Debug logging every 30 frames (1 second)
        if (this.frameCounters.fast % 30 === 0 && this.config.debugMode) {
          console.log(`[FastLoop] Status:`, {
            cardPresent: metrics.cardPresent,
            isStable: metrics.isStable,
            stabilityScore: metrics.stabilityScore.toFixed(2),
            sharpness: metrics.sharpnessScore.toFixed(1),
            motion: metrics.motionDelta.toFixed(1),
            consecutiveStable: metrics.consecutiveStableFrames
          });
        }
        
        // Emit event if stability changed
        if (wasStable !== metrics.isStable || wasPresent !== metrics.cardPresent) {
          this.emitEvent('stability-changed', {
            isStable: metrics.isStable,
            score: metrics.stabilityScore
          });
          
          if (this.config.debugMode) {
            console.log(`[FastLoop] Stability changed: ${metrics.isStable} (score: ${metrics.stabilityScore.toFixed(2)})`);
          }
        }
      } catch (error) {
        console.error('[FastLoop] Error:', error);
      }
      
      this.fastLoopRAF = requestAnimationFrame(loop);
    };
    
    this.fastLoopRAF = requestAnimationFrame(loop);
  }
  
  /**
   * Medium Loop: ROI extraction and lightweight OCR (4-10fps)
   */
  private startMediumLoop(): void {
    const interval = 1000 / this.config.mediumLoopFps;
    
    this.mediumLoopInterval = setInterval(async () => {
      if (!this.status.isRunning) return;
      
      this.frameCounters.medium++;
      
      // Only process if card is stable
      if (!this.status.isStable || !this.currentVideo) {
        return;
      }
      
      try {
        // Get rectified crop from stability tracker
        const rectifiedCanvas = cardStabilityTracker.getRectifiedCrop(this.currentVideo);
        
        if (!rectifiedCanvas) {
          if (this.config.debugMode && this.frameCounters.medium % 10 === 0) {
            console.log('[MediumLoop] No rectified canvas available');
          }
          return;
        }
        
        console.log('[MediumLoop] Processing ROIs from rectified canvas');
        
        // Process ROIs
        const roiResults = await streamingROIManager.processROIs(
          rectifiedCanvas,
          [[1, 0, 0], [0, 1, 0], [0, 0, 1]] // Placeholder homography
        );
        
        this.lastROIResults = roiResults;
        
        if (this.config.debugMode && roiResults.hypotheses.size > 0) {
          console.log('[MediumLoop] ROI hypotheses:', 
            Array.from(roiResults.hypotheses.entries()).map(([field, hyps]) => 
              `${field}: ${hyps[0]?.text || 'none'}`
            )
          );
        }
        
        // Symbol classification (if enabled)
        if (this.config.enableSymbolClassification && this.frameCounters.medium % 3 === 0) {
          const symbolROI = streamingROIManager.extractSymbolROI(rectifiedCanvas);
          const symbolResults = await setSymbolClassifier.classifySymbol(symbolROI);
          
          if (symbolResults.length > 0) {
            this.symbolCandidates = symbolResults;
            
            if (this.config.debugMode) {
              console.log(`[MediumLoop] Symbol candidates:`, symbolResults.map(s => `${s.setCode}(${s.confidence.toFixed(2)})`));
            }
          }
        }
        
        // Update current hypotheses for UI
        const stats = temporalOCRFusion.getVotingStats();
        this.status.currentHypotheses = new Map(
          Array.from(stats.entries()).map(([field, data]) => [
            field,
            { value: data.leading, confidence: data.confidence, votes: data.votes }
          ])
        );
        
        this.emitEvent('hypotheses-updated', {
          hypotheses: this.status.currentHypotheses,
          symbolCandidates: this.symbolCandidates
        });
        
        if (this.config.debugMode && roiResults.hypotheses.size > 0) {
          console.log(`[MediumLoop] Hypotheses:`, 
            Array.from(roiResults.hypotheses.entries()).map(([field, hyps]) => 
              `${field}: ${hyps[0]?.text || 'none'}`
            )
          );
        }
      } catch (error) {
        console.error('[MediumLoop] Error:', error);
      }
    }, interval);
  }
  
  /**
   * Slow Loop: Temporal fusion and card commitment (1-3fps)
   */
  private startSlowLoop(): void {
    const interval = 1000 / this.config.slowLoopFps;
    
    this.slowLoopInterval = setInterval(() => {
      if (!this.status.isRunning) return;
      
      this.frameCounters.slow++;
      
      // Only process if we have ROI results
      if (!this.lastROIResults || !this.lastROIResults.hypotheses.size) {
        return;
      }
      
      try {
        // Perform temporal fusion
        const fusionResult = temporalOCRFusion.processHypotheses(
          this.lastROIResults.hypotheses,
          this.symbolCandidates
        );
        
        if (fusionResult.identification) {
          this.status.pendingIdentification = fusionResult.identification;
          
          this.emitEvent('card-identified', {
            identification: fusionResult.identification,
            shouldCommit: fusionResult.shouldCommit
          });
          
          if (this.config.debugMode) {
            console.log(`[SlowLoop] Card identified:`, 
              `${fusionResult.identification.setCode}/${fusionResult.identification.collectorNumber}`,
              `(confidence: ${fusionResult.identification.confidence.toFixed(2)}, commit: ${fusionResult.shouldCommit})`
            );
          }
          
          // Auto-commit if enabled and confidence is high
          if (fusionResult.shouldCommit && this.config.enableAutoCommit) {
            this.commitCard(fusionResult.identification);
          }
        }
      } catch (error) {
        console.error('[SlowLoop] Error:', error);
      }
    }, interval);
  }
  
  /**
   * Commit a card identification
   */
  private commitCard(identification: CardIdentification): void {
    this.status.lastCommittedCard = identification;
    
    this.emitEvent('card-committed', {
      card: identification,
      timestamp: Date.now()
    });
    
    console.log('[StreamingOCR] Card committed:', 
      `${identification.setCode}/${identification.collectorNumber}`,
      `"${identification.title || 'Unknown'}"`,
      `(confidence: ${identification.confidence.toFixed(2)})`
    );
    
    // Reset for next card
    temporalOCRFusion.reset();
    this.status.pendingIdentification = undefined;
  }
  
  /**
   * Manual commit trigger
   */
  manualCommit(): void {
    if (this.status.pendingIdentification) {
      this.commitCard(this.status.pendingIdentification);
    }
  }
  
  /**
   * FPS counter
   */
  private startFpsCounter(): void {
    setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.fpsTimers.fast) / 1000;
      
      if (elapsed > 0) {
        this.status.fps = {
          fast: this.frameCounters.fast / elapsed,
          medium: this.frameCounters.medium / elapsed,
          slow: this.frameCounters.slow / elapsed
        };
        
        // Reset counters
        this.frameCounters = { fast: 0, medium: 0, slow: 0 };
        this.fpsTimers = { fast: now, medium: now, slow: now };
      }
    }, 1000);
  }
  
  /**
   * Event handling
   */
  on(type: StreamingEventType, callback: (event: StreamingEvent) => void): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(callback);
  }
  
  off(type: StreamingEventType, callback: (event: StreamingEvent) => void): void {
    this.eventListeners.get(type)?.delete(callback);
  }
  
  private emitEvent(type: StreamingEventType, data: any): void {
    const event: StreamingEvent = { type, data, timestamp: Date.now() };
    this.eventListeners.get(type)?.forEach(callback => callback(event));
  }
  
  /**
   * Get current status
   */
  getStatus(): StreamingStatus {
    return { ...this.status };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<StreamingOCRConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart loops if running
    if (this.status.isRunning && this.currentVideo && this.currentCanvas) {
      this.stop();
      this.start(this.currentVideo, this.currentCanvas);
    }
  }
  
  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    this.stop();
    await streamingROIManager.destroy();
  }
}

// Singleton instance
export const streamingOCRService = new StreamingOCRService();