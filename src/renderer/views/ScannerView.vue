<template>
  <div class="scanner-view">
    <div class="scanner-header">
      <h2>Card Scanner - Streaming Pipeline</h2>
      <div class="scanner-controls">
        <select v-model="selectedCamera" @change="initCamera" :disabled="isProcessing">
          <option v-for="device in cameras" :key="device.deviceId" :value="device.deviceId">
            {{ device.label || `Camera ${cameras.indexOf(device) + 1}` }}
          </option>
        </select>
        <button @click="toggleCamera" :disabled="isProcessing">
          {{ cameraActive ? 'Stop Camera' : 'Start Camera' }}
        </button>
        <button @click="toggleRealTime" :disabled="!cameraActive" class="mode-toggle">
          {{ realTimeMode ? 'Switch to Snapshot' : 'Switch to Streaming' }}
        </button>
      </div>
    </div>

    <div class="scanner-content">
      <div class="video-container">
        <video ref="videoElement" autoplay playsinline></video>
        <canvas ref="overlayCanvas" class="overlay-canvas"></canvas>
        <canvas ref="canvasElement" :style="{ display: showCanvas ? 'block' : 'none' }"></canvas>
        <canvas ref="processCanvas" style="display: none;"></canvas>
        <div v-if="cameraActive" class="capture-overlay">
          <div class="scan-status">
            <span :class="['status-indicator', { 
              active: isScanning, 
              stable: streamingStatus.isStable,
              processing: streamingStatus.cardPresent && !streamingStatus.isStable 
            }]"></span>
            <span>{{ scanStatus }}</span>
          </div>
          
          <!-- Streaming status display -->
          <div v-if="realTimeMode" class="streaming-status">
            <div class="stability-indicator">
              <div class="stability-bar">
                <div class="stability-fill" :style="{ 
                  width: `${streamingStatus.stabilityScore * 100}%`,
                  backgroundColor: streamingStatus.isStable ? '#4CAF50' : '#FFC107'
                }"></div>
              </div>
              <span class="stability-label">{{ streamingStatus.isStable ? 'Stable' : 'Hold steady...' }}</span>
            </div>
            
            <!-- Live hypotheses display -->
            <div v-if="streamingHypotheses.size > 0" class="live-hypotheses">
              <div v-for="[field, data] in streamingHypotheses" :key="field" class="hypothesis-row">
                <span class="field-name">{{ field }}:</span>
                <span class="field-value">{{ data.value }}</span>
                <span class="field-confidence">({{ Math.round(data.confidence * 100) }}%)</span>
              </div>
            </div>
            
            <!-- FPS display in debug mode -->
            <div v-if="debugMode" class="fps-display">
              <span>Fast: {{ streamingStatus.fps.fast.toFixed(1) }}fps</span>
              <span>Med: {{ streamingStatus.fps.medium.toFixed(1) }}fps</span>
              <span>Slow: {{ streamingStatus.fps.slow.toFixed(1) }}fps</span>
            </div>
          </div>
          
          <button v-if="!realTimeMode" @click="captureImage" :disabled="isProcessing" class="capture-btn">
            {{ isProcessing ? 'Processing...' : 'Scan Card' }}
          </button>
        </div>
      </div>

      <!-- Scanned Cards Queue -->
      <div class="scan-queue" v-if="scannedCards.length > 0">
        <div class="queue-header">
          <h3>Scanned Cards ({{ scannedCards.length }})</h3>
          <button @click="addAllToCollection" class="bulk-add-btn" :disabled="scannedCards.length === 0">
            Add All to Collection
          </button>
        </div>
        <div class="queue-list">
          <div v-for="(item, index) in scannedCards" :key="index" class="queue-item">
            <div class="card-info">
              <div class="card-name">{{ item.card.name }}</div>
              <div class="card-details">
                {{ item.card.setCode }} #{{ item.card.collectorNumber }}
                <span class="confidence-badge">{{ Math.round(item.confidence) }}%</span>
              </div>
            </div>
            <div class="card-actions">
              <label class="foil-toggle">
                <input type="checkbox" v-model="item.isFoil" />
                <span>Foil</span>
              </label>
              <input type="number" v-model="item.quantity" min="1" max="99" class="quantity-input" />
              <button @click="removeFromQueue(index)" class="remove-btn">×</button>
            </div>
          </div>
        </div>
        <div class="queue-footer">
          <button @click="clearQueue" class="clear-btn">Clear All</button>
        </div>
      </div>

      <div v-if="lastResult && false" class="scan-result">
        <h3>Scan Result</h3>
        <div class="result-content">
          <p><strong>Detected Text:</strong> {{ lastResult.text }}</p>
          <p><strong>Confidence:</strong> {{ Math.round(lastResult.confidence) }}%</p>
          <div v-if="lastResult.card">
            <h4>Card Found!</h4>
            <p><strong>Name:</strong> {{ lastResult.card.name }}</p>
            <p><strong>Set:</strong> {{ lastResult.card.set_name }}</p>
            <p><strong>Number:</strong> {{ lastResult.card.collector_number }}</p>
            <button @click="addToCollection(lastResult.card)" class="add-btn">
              Add to Collection
            </button>
          </div>
          <div v-else-if="lastResult.error">
            <p class="error">{{ lastResult.error }}</p>
          </div>
        </div>
      </div>

      <div class="manual-input">
        <h3>Manual Input</h3>
        <div class="input-group">
          <input v-model="manualSetCode" placeholder="Set Code (e.g., NEO)" />
          <input v-model="manualCardNumber" placeholder="Card Number (e.g., 234)" />
          <button @click="manualSearch" :disabled="!manualSetCode || !manualCardNumber">
            Search
          </button>
        </div>
      </div>

      <div class="processing-settings">
        <h3>Processing Settings</h3>
        <label>
          <input type="checkbox" v-model="showCanvas" /> Show processed image
        </label>
        <label>
          <input type="checkbox" v-model="showMetrics" /> Show quality metrics
        </label>
        <label>
          <input type="checkbox" v-model="settings.grayscale" /> Grayscale
        </label>
        <label>
          <input type="checkbox" v-model="settings.cropBottom" /> Focus on bottom region
        </label>
        <label>
          Contrast: <input type="range" v-model.number="settings.contrast" min="0.5" max="3" step="0.1" />
          {{ settings.contrast }}
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import scryfallAPI from '../api/scryfall';
import { preprocessImage, drawRegionGuide, extractCardRegion } from '../utils/imageProcessing';
import { getEnhancedOCRService, destroyEnhancedOCRService } from '../utils/enhancedOCRService';
import { smartRegionExtractor } from '../utils/smartRegionExtractor';
import { extractMagicCardInfo } from '../utils/cardOCROptimizer';
import { frameQualityAnalyzer, type QualityMetrics } from '../utils/frameQualityAnalyzer';
import { visualAlignmentGuide, type ScanState } from '../utils/visualAlignmentGuide';
import { streamingOCRService, type StreamingStatus, type StreamingEvent } from '../utils/streamingOCRService';
import magicSetsData from '../data/magicSets.json';

const videoElement = ref<HTMLVideoElement>();
const canvasElement = ref<HTMLCanvasElement>();
const processCanvas = ref<HTMLCanvasElement>();
const overlayCanvas = ref<HTMLCanvasElement>(); // For alignment guide
const cameras = ref<MediaDeviceInfo[]>([]);
const selectedCamera = ref<string>('');
const cameraActive = ref(false);
const isProcessing = ref(false);
const isScanning = ref(false);
const lastResult = ref<any>(null);
const manualSetCode = ref('');
const manualCardNumber = ref('');

// Scanned cards queue
interface ScannedCard {
  card: any;
  confidence: number;
  isFoil: boolean;
  quantity: number;
  detectedAt: Date;
}
const scannedCards = ref<ScannedCard[]>([]);
const realTimeMode = ref(false);
const currentConfidence = ref(0);
const scanStatus = ref('Initializing OCR...');
const showCanvas = ref(false);
const showMetrics = ref(false); // Show quality metrics debug info
const debugMode = ref(true); // Show FPS and debug info - ENABLED FOR TESTING
const settings = ref({
  grayscale: true,
  cropBottom: true,
  contrast: 1.5,
  brightness: 1.1,
  threshold: 0,
  denoise: false
});

// Streaming pipeline state
const streamingStatus = ref<StreamingStatus>({
  isRunning: false,
  cardPresent: false,
  isStable: false,
  stabilityScore: 0,
  currentHypotheses: new Map(),
  fps: { fast: 0, medium: 0, slow: 0 }
});
const streamingHypotheses = computed(() => streamingStatus.value.currentHypotheses);

// Smart OCR state machine
type SmartOCRState = 'idle' | 'monitoring' | 'stable' | 'processing' | 'cooldown';
const smartOCRState = ref<SmartOCRState>('idle');
const currentMetrics = ref<QualityMetrics | null>(null);
const stableFrameCount = ref(0);
const lastSmartProcessTime = ref(0);
const SMART_PROCESS_INTERVAL = 300; // Process every 300ms when stable (faster)
const STABLE_FRAMES_REQUIRED = 2; // Need only 2 stable frames before processing
const COOLDOWN_TIME = 800; // Wait 0.8s after successful scan for faster continuous scanning
const MAX_PARALLEL_SCANS = 3; // Run up to 3 OCR scans in parallel
const PARALLEL_SCAN_DELAY = 150; // Start new scan every 150ms when in ready state

let stream: MediaStream | null = null;
let animationFrameId: number | null = null;
let monitoringFrameId: number | null = null; // For quality monitoring
let lastProcessTime = 0;
const PROCESS_INTERVAL = 1000; // Legacy processing interval
let detectedCards = new Map<string, number>(); // For confidence accumulation
let isOCRReady = false;
let enhancedOCR = getEnhancedOCRService();
let recentlyScanned = new Set<string>(); // Prevent duplicate scanning within 5 seconds
let activeScans = 0; // Track number of active parallel scans
let scanAbortController: AbortController | null = null; // To cancel parallel scans

async function getCameras() {
  try {
    // Just enumerate devices without requesting permission yet
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameras.value = devices.filter(device => device.kind === 'videoinput');
    
    if (cameras.value.length > 0 && !selectedCamera.value) {
      selectedCamera.value = cameras.value[0].deviceId;
    }
    
    // If no cameras found, might need permission first
    if (cameras.value.length === 0) {
      console.log('[Camera] No cameras found, permission may be needed');
    }
  } catch (error) {
    console.error('Failed to get cameras:', error);
  }
}

async function setupOCR() {
  try {
    // Don't initialize OCR immediately - use lazy initialization
    scanStatus.value = 'OCR ready - will initialize on first scan';
    isOCRReady = true; // Mark as ready since we'll do lazy init
    console.log('[Scanner] OCR service ready for lazy initialization');
  } catch (error) {
    console.error('Failed to setup Enhanced OCR:', error);
    scanStatus.value = 'OCR setup failed';
  }
}

async function processOCRResult(result: any) {
  // Only log high confidence results
  if (result.confidence > 0.7) {
    console.log('[Scanner] High confidence result:', result.text?.substring(0, 40) || result.text, 'conf:', result.confidence.toFixed(2));
  }
  currentConfidence.value = result.confidence * 100;
  
  // Much lower threshold for smart mode since we pre-validate frame quality
  const confidenceThreshold = realTimeMode.value && smartOCRState.value === 'processing' ? 0.2 : 0.7;
  if (result.confidence < confidenceThreshold) {
    if (result.confidence > 0.15) {
      scanStatus.value = `Confidence: ${(result.confidence * 100).toFixed(0)}% (need ${Math.round(confidenceThreshold * 100)}%)`;
    } else {
      scanStatus.value = `Low confidence - adjust position`;
    }
    return;
  }
  
  // Check if OCR result already has card info extracted
  let cardInfo: { setCode: string; cardNumber: string } | null = null;
  
  if (result.setCode && result.cardNumber) {
    // Enhanced OCR already extracted the info
    cardInfo = {
      setCode: result.setCode,
      cardNumber: result.cardNumber
    };
    console.log('[Scanner] Using pre-extracted card info:', cardInfo);
  } else if (result.text) {
    // Legacy path - extract from text
    console.log('[Scanner] Extracting card info from text:', result.text);
    cardInfo = extractCardInfo(result.text);
  }
  
  if (cardInfo) {
    console.log('[Scanner] Card info found:', cardInfo, 'confidence:', result.confidence);
    const key = `${cardInfo.setCode}/${cardInfo.cardNumber}`;
    
    // Check if we recently scanned this card (within last 5 seconds)
    if (recentlyScanned.has(key)) {
      console.log('[Scanner] Card already scanned recently:', key);
      scanStatus.value = `Already scanned: ${cardInfo.setCode} #${cardInfo.cardNumber}`;
      return;
    }
    
    console.log('[Scanner] New card, proceeding to add:', key);
    
    const currentCount = detectedCards.get(key) || 0;
    detectedCards.set(key, currentCount + 1);
    
    // For smart mode, process immediately since we already validated quality
    // Check activeScans > 0 instead of smartOCRState since parallel scans may complete after state changes
    const shouldProcess = realTimeMode.value && activeScans > 0
      ? true 
      : (!realTimeMode.value || currentCount >= 2);
    
    if (shouldProcess) {
      console.log('[Scanner] Should process card, calling addToScanQueue...');
      scanStatus.value = 'Adding to queue...';
      const success = await addToScanQueue(cardInfo.setCode, cardInfo.cardNumber, result.confidence);
      
      console.log('[Scanner] addToScanQueue result:', success);
      
      if (success) {
        // Mark as recently scanned
        recentlyScanned.add(key);
        setTimeout(() => recentlyScanned.delete(key), 5000); // Clear after 5 seconds
        
        scanStatus.value = `✓ Added ${cardInfo.setCode} #${cardInfo.cardNumber} to queue`;
        detectedCards.clear();
        
        // Continue scanning for more cards
        setTimeout(() => {
          if (realTimeMode.value) {
            scanStatus.value = 'Ready for next card';
          }
        }, 1500);
      } else {
        console.log('[Scanner] Failed to add card to queue');
      }
    } else {
      scanStatus.value = `Verifying ${cardInfo.setCode} #${cardInfo.cardNumber}...`;
    }
  } else {
    scanStatus.value = `Scanning...`;
  }
}

async function initCamera() {
  if (!selectedCamera.value) return;
  
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // Request camera with autofocus capabilities
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: selectedCamera.value,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // Add focus constraints for better OCR
        focusMode: { ideal: 'continuous' } as any,
        exposureMode: { ideal: 'continuous' } as any,
        whiteBalanceMode: { ideal: 'continuous' } as any
      }
    };
    
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    if (videoElement.value) {
      videoElement.value.srcObject = stream;
      cameraActive.value = true;
      
      // Set up focus monitoring
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && 'getCapabilities' in videoTrack) {
        const capabilities = videoTrack.getCapabilities() as any;
        console.log('[Camera] Capabilities:', capabilities);
        
        // Apply manual focus if available
        if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
          const settings = videoTrack.getSettings() as any;
          console.log('[Camera] Current settings:', settings);
        }
      }
    }
  } catch (error) {
    console.error('Failed to init camera:', error);
    cameraActive.value = false;
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  cameraActive.value = false;
  realTimeMode.value = false;
  stopSmartMonitoring();
}

async function captureImage() {
  console.log('[Scanner] Capture image clicked');
  if (!videoElement.value || !canvasElement.value || !isOCRReady) {
    console.log('[Scanner] Not ready:', { video: !!videoElement.value, canvas: !!canvasElement.value, ocr: isOCRReady });
    return;
  }
  
  isProcessing.value = true;
  const video = videoElement.value;
  const canvas = canvasElement.value;
  const processCanv = processCanvas.value!;
  
  try {
    console.log('[Scanner] Using smart region extraction for optimal text detection...');
    
    // Use smart region extractor to find best text regions
    const regions = smartRegionExtractor.extractRegions(video, {
      strategy: 'multi-region',
      useEdgeDetection: false, // Keep simple for now
      targetWidth: 640,
      targetHeight: 120
    });

    console.log(`[Scanner] Extracted ${regions.length} candidate regions`);

    // Use the best region for OCR
    const bestRegion = regions[0];
    if (!bestRegion) {
      scanStatus.value = 'No suitable text regions found';
      return;
    }

    console.log(`[Scanner] Using region with confidence ${bestRegion.confidence.toFixed(2)} (strategy: ${bestRegion.strategy})`);
    console.log(`[Scanner] Region dimensions: ${bestRegion.canvas.width}x${bestRegion.canvas.height} at (${bestRegion.region.x}, ${bestRegion.region.y})`);

    // Show processed region if enabled
    if (showCanvas.value) {
      canvas.width = bestRegion.canvas.width;
      canvas.height = bestRegion.canvas.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bestRegion.canvas, 0, 0);
      }
    }

    // Use enhanced OCR with multi-strategy processing (lazy initialization)
    const ocrResult = await enhancedOCR.scanCard(bestRegion.canvas, 'magic-card');
    
    console.log('[Scanner] Enhanced OCR result:', {
      text: ocrResult.text,
      confidence: ocrResult.confidence,
      success: ocrResult.success,
      strategy: ocrResult.strategy,
      cardNumber: ocrResult.cardNumber,
      setCode: ocrResult.setCode
    });

    if (ocrResult.metadata?.allResults) {
      console.log('[Scanner] All OCR attempts:', ocrResult.metadata.allResults.map(r => 
        `${r.strategy}: "${r.text}" (${(r.confidence * 100).toFixed(1)}%)`
      ));
    }

    await processOCRResult(ocrResult);
  } catch (error) {
    console.error('[Scanner] Capture error:', error);
    lastResult.value = {
      error: 'Failed to capture image',
    };
  } finally {
    isProcessing.value = false;
  }
}

function processVideoFrame() {
  if (!realTimeMode.value || !videoElement.value || !isOCRReady) {
    animationFrameId = null;
    return;
  }
  
  const now = Date.now();
  if (now - lastProcessTime >= PROCESS_INTERVAL) {
    lastProcessTime = now;
    isScanning.value = true;
    
    const video = videoElement.value;
    const canvas = canvasElement.value!;
    const processCanv = processCanvas.value!;
    
    // Draw guide overlay
    if (showCanvas.value) {
      drawRegionGuide(canvas, video);
    }
    
    // Extract and process region
    try {
      // Extract optimized region for real-time detection
      const regions = smartRegionExtractor.extractRegions(video, {
        strategy: 'card-bottom', // Faster single region for real-time
        targetWidth: 400, // Larger for better text capture
        targetHeight: 80,  // Taller for multi-line text
        useEdgeDetection: false // Keep fast for real-time
      });

      if (regions.length === 0) {
        scanStatus.value = 'No text region detected';
        setTimeout(() => { isScanning.value = false; }, 100);
        return;
      }

      const region = regions[0];
      
      // Show processed region if enabled
      if (showCanvas.value) {
        canvas.width = region.canvas.width;
        canvas.height = region.canvas.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(region.canvas, 0, 0);
        }
      }

      // Use fast OCR configuration for real-time (lazy initialization)
      enhancedOCR.scanCard(region.canvas, 'fast-scan').then(result => {
        if (result.confidence > 0.4) { // Lower threshold for real-time
          console.log(`[Scanner] Real-time OCR: "${result.text}" (${(result.confidence * 100).toFixed(1)}%)`);
          processOCRResult(result);
        } else if (result.confidence > 0.2) {
          currentConfidence.value = result.confidence * 100;
          scanStatus.value = `Scanning... ${Math.round(result.confidence * 100)}%`;
        }
      }).catch(error => {
        console.error('[Scanner] Real-time OCR error:', error);
      });
    } catch (error) {
      console.error('Frame processing error:', error);
    }
    
    setTimeout(() => {
      isScanning.value = false;
    }, 100);
  }
  
  // Use requestVideoFrameCallback if available, otherwise requestAnimationFrame
  if ('requestVideoFrameCallback' in videoElement.value) {
    (videoElement.value as any).requestVideoFrameCallback(() => {
      processVideoFrame();
    });
  } else {
    animationFrameId = requestAnimationFrame(processVideoFrame);
  }
}

function toggleRealTime() {
  realTimeMode.value = !realTimeMode.value;
  
  if (realTimeMode.value) {
    // Use new streaming pipeline
    scanStatus.value = 'Streaming mode - position card';
    detectedCards.clear();
    startStreamingPipeline();
  } else {
    scanStatus.value = 'Snapshot mode';
    stopStreamingPipeline();
  }
}

/**
 * Start the streaming OCR pipeline
 */
async function startStreamingPipeline() {
  if (!videoElement.value || !processCanvas.value) return;
  
  // Set up canvases
  const video = videoElement.value;
  processCanvas.value.width = video.videoWidth || 640;
  processCanvas.value.height = video.videoHeight || 480;
  
  // Set up overlay canvas for alignment guide
  if (overlayCanvas.value) {
    overlayCanvas.value.width = video.videoWidth || 640;
    overlayCanvas.value.height = video.videoHeight || 480;
    
    // Draw initial guide
    visualAlignmentGuide.setState('detecting');
    visualAlignmentGuide.drawGuide(overlayCanvas.value, 'detecting');
  }
  
  // Configure streaming service
  streamingOCRService.updateConfig({
    fastLoopFps: 30,
    mediumLoopFps: 7,
    slowLoopFps: 2,
    enableSymbolClassification: true,
    enableAutoCommit: true,
    debugMode: debugMode.value
  });
  
  // Set up event listeners
  streamingOCRService.on('stability-changed', handleStabilityChange);
  streamingOCRService.on('hypotheses-updated', handleHypothesesUpdate);
  streamingOCRService.on('card-identified', handleCardIdentified);
  streamingOCRService.on('card-committed', handleCardCommitted);
  
  // Start the streaming pipeline
  await streamingOCRService.start(videoElement.value, processCanvas.value);
  
  // Start status update loop
  updateStreamingStatus();
}

/**
 * Stop the streaming OCR pipeline
 */
function stopStreamingPipeline() {
  streamingOCRService.stop();
  
  // Remove event listeners
  streamingOCRService.off('stability-changed', handleStabilityChange);
  streamingOCRService.off('hypotheses-updated', handleHypothesesUpdate);
  streamingOCRService.off('card-identified', handleCardIdentified);
  streamingOCRService.off('card-committed', handleCardCommitted);
  
  // Reset status
  streamingStatus.value = {
    isRunning: false,
    cardPresent: false,
    isStable: false,
    stabilityScore: 0,
    currentHypotheses: new Map(),
    fps: { fast: 0, medium: 0, slow: 0 }
  };
}

/**
 * Handle streaming events
 */
function handleStabilityChange(event: StreamingEvent) {
  const { isStable, score } = event.data;
  scanStatus.value = isStable ? 'Card stable - reading...' : 'Hold card steady...';
  
  // Update visual alignment guide
  if (overlayCanvas.value) {
    visualAlignmentGuide.setState(isStable ? 'processing' : 'detecting');
    visualAlignmentGuide.drawGuide(overlayCanvas.value, isStable ? 'processing' : 'detecting');
  }
}

function handleHypothesesUpdate(event: StreamingEvent) {
  // Hypotheses are automatically updated in the status
  // Could add visual feedback here
}

function handleCardIdentified(event: StreamingEvent) {
  const { identification, shouldCommit } = event.data;
  
  if (!shouldCommit && identification.confidence >= 0.7) {
    // Show as pending for user confirmation
    scanStatus.value = `Found: ${identification.setCode}/${identification.collectorNumber} (${Math.round(identification.confidence * 100)}%)`;
  }
}

async function handleCardCommitted(event: StreamingEvent) {
  const { card } = event.data;
  
  // Lookup the card in Scryfall
  try {
    const scryfallCard = await scryfallAPI.getCardBySetAndNumber(card.setCode, card.collectorNumber);
    
    if (scryfallCard) {
      // Add to scanned cards queue
      scannedCards.value.push({
        card: scryfallCard,
        confidence: card.confidence * 100,
        isFoil: false,
        quantity: 1,
        detectedAt: new Date()
      });
      
      // Visual feedback
      visualAlignmentGuide.setState('success');
      scanStatus.value = `Scanned: ${scryfallCard.name}`;
      
      // Prevent duplicate scanning
      const cardKey = `${card.setCode}/${card.collectorNumber}`;
      recentlyScanned.add(cardKey);
      setTimeout(() => recentlyScanned.delete(cardKey), 5000);
    }
  } catch (error) {
    console.error('[Streaming] Failed to lookup card:', error);
    scanStatus.value = 'Card lookup failed';
  }
}

/**
 * Update streaming status periodically
 */
function updateStreamingStatus() {
  if (!realTimeMode.value) return;
  
  streamingStatus.value = streamingOCRService.getStatus();
  
  // Update confidence display
  if (streamingStatus.value.pendingIdentification) {
    currentConfidence.value = streamingStatus.value.pendingIdentification.confidence * 100;
  }
  
  requestAnimationFrame(updateStreamingStatus);
}

/**
 * Smart monitoring system - continuously checks frame quality
 */
function startSmartMonitoring() {
  if (!realTimeMode.value || !videoElement.value || !overlayCanvas.value) return;
  
  const video = videoElement.value;
  const overlay = overlayCanvas.value;
  
  // Set overlay canvas size to match video
  overlay.width = video.videoWidth || 640;
  overlay.height = video.videoHeight || 480;
  
  // Monitoring loop
  function monitor() {
    if (!realTimeMode.value) {
      stopSmartMonitoring();
      return;
    }
    
    // Create temp canvas for analysis with willReadFrequently optimization
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = overlay.width;
    tempCanvas.height = overlay.height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    
    // Analyze frame quality
    const metrics = frameQualityAnalyzer.analyzeFrame(tempCanvas);
    currentMetrics.value = metrics;
    
    // Update visual guide based on metrics
    let guideState: ScanState = 'idle';
    
    if (!metrics.isReady) {
      if (metrics.edgeDensity < 20) {
        guideState = 'idle';
        scanStatus.value = 'Position card in frame';
      } else if (metrics.focusScore < 40) {
        guideState = 'detecting';
        scanStatus.value = 'Card detected - improve focus';
      } else if (metrics.motionScore > 10) {
        guideState = 'detecting';
        scanStatus.value = 'Hold card steady';
      } else {
        guideState = 'detecting';
        scanStatus.value = 'Aligning...';
      }
      stableFrameCount.value = 0;
    } else {
      // Frame is ready
      stableFrameCount.value++;
      
      if (stableFrameCount.value >= STABLE_FRAMES_REQUIRED) {
        guideState = 'ready';
        scanStatus.value = 'Ready - starting scan';
        
        // Trigger parallel processing if not in cooldown
        const now = Date.now();
        if (smartOCRState.value !== 'cooldown' && activeScans < MAX_PARALLEL_SCANS) {
          // Check if enough time has passed since last scan start
          if (now - lastSmartProcessTime.value >= PARALLEL_SCAN_DELAY) {
            triggerParallelSmartProcessing();
          }
        }
      } else {
        guideState = 'detecting';
        scanStatus.value = `Stabilizing... ${stableFrameCount.value}/${STABLE_FRAMES_REQUIRED}`;
      }
    }
    
    // Update visual guide
    visualAlignmentGuide.setState(guideState);
    if (showMetrics.value) {
      visualAlignmentGuide.setMetrics(metrics);
    }
    visualAlignmentGuide.drawGuide(overlay, guideState, { 
      showMetrics: showMetrics.value 
    });
    
    // Continue monitoring
    monitoringFrameId = requestAnimationFrame(monitor);
  }
  
  monitor();
}

/**
 * Stop smart monitoring
 */
function stopSmartMonitoring() {
  if (monitoringFrameId) {
    cancelAnimationFrame(monitoringFrameId);
    monitoringFrameId = null;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Cancel all parallel scans
  if (scanAbortController) {
    scanAbortController.abort();
    scanAbortController = null;
  }
  activeScans = 0;
  
  smartOCRState.value = 'idle';
  stableFrameCount.value = 0;
  
  // Clear overlay
  if (overlayCanvas.value) {
    const ctx = overlayCanvas.value.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, overlayCanvas.value.width, overlayCanvas.value.height);
    }
  }
}

/**
 * Trigger parallel smart OCR processing
 */
async function triggerParallelSmartProcessing() {
  if (!videoElement.value || !isOCRReady || activeScans >= MAX_PARALLEL_SCANS) return;
  
  // Track this scan
  activeScans++;
  lastSmartProcessTime.value = Date.now();
  
  // Create abort signal for this scan
  if (!scanAbortController) {
    scanAbortController = new AbortController();
  }
  
  const signal = scanAbortController.signal;
  
  // Add a small delay between parallel scans to get different frames
  const scanDelay = (activeScans - 1) * 100; // First scan starts immediately, then 100ms between each
  
  setTimeout(() => {
    // Run scan asynchronously without blocking other scans
    processSmartScan(signal).then(success => {
      activeScans--;
      
      if (success) {
        // Cancel all other parallel scans
        if (scanAbortController) {
          scanAbortController.abort();
          scanAbortController = null;
        }
        activeScans = 0;
        
        // Enter cooldown
        smartOCRState.value = 'cooldown';
        setTimeout(() => {
          if (smartOCRState.value === 'cooldown') {
            smartOCRState.value = 'monitoring';
            stableFrameCount.value = 0;
          }
        }, COOLDOWN_TIME);
      }
    }).catch(error => {
      activeScans--;
      console.error('[Smart OCR] Parallel scan error:', error);
    });
  }, scanDelay);
}

/**
 * Process a single smart scan (can run in parallel)
 */
async function processSmartScan(signal: AbortSignal): Promise<boolean> {
  if (!videoElement.value) return false;
  
  const video = videoElement.value;
  
  // Log which scan this is
  const scanId = Date.now() + Math.random();
  console.log(`[Smart OCR] Starting scan ${scanId} (${activeScans} active)`);
  
  // Set state to processing for at least one scan
  if (smartOCRState.value !== 'processing' && smartOCRState.value !== 'cooldown') {
    smartOCRState.value = 'processing';
  }
  
  visualAlignmentGuide.setState('processing');
  scanStatus.value = `Processing... (${activeScans} active)`;
  
  try {
    // Check if aborted
    if (signal.aborted) {
      console.log(`[Smart OCR] Scan ${scanId} aborted before extraction`);
      return false;
    }
    
    // Each scan extracts a fresh frame from the current video position
    // This ensures parallel scans work on different frames
    const regions = smartRegionExtractor.extractRegions(video, {
      strategy: 'card-bottom',  // Focus on bottom-left corner
      targetWidth: 400,   // Smaller width for just the card number area
      targetHeight: 80,   // Reduced height - just 2 lines of text (170/351 and C16)
      useEdgeDetection: false,
      regionOfInterest: {  // Custom ROI for bottom-left corner
        x: 0.2,
        y: 0.5,    // Move down to focus on text
        width: 0.25,
        height: 0.15  // Reduced height for tighter text focus
      }
    });
    
    if (regions.length === 0) {
      throw new Error('No text regions found');
    }
    
    const bestRegion = regions[0];
    console.log(`[Smart OCR] Processing region (${bestRegion.canvas.width}x${bestRegion.canvas.height})`);
    
    // Show processed region if enabled
    if (showCanvas.value && canvasElement.value) {
      canvasElement.value.width = bestRegion.canvas.width;
      canvasElement.value.height = bestRegion.canvas.height;
      const ctx = canvasElement.value.getContext('2d');
      if (ctx) {
        ctx.drawImage(bestRegion.canvas, 0, 0);
      }
    }
    
    // Check if aborted before OCR
    if (signal.aborted) {
      console.log(`[Smart OCR] Scan ${scanId} aborted before OCR`);
      return false;
    }
    
    // Use robust 'smart-realtime' config with all strategies
    const ocrResult = await enhancedOCR.scanCard(bestRegion.canvas, 'smart-realtime');
    
    // Check if aborted after OCR
    if (signal.aborted) {
      console.log(`[Smart OCR] Scan ${scanId} aborted after OCR`);
      return false;
    }
    
    console.log(`[Smart OCR] Scan ${scanId} result:`, {
      text: ocrResult.text,
      confidence: ocrResult.confidence,
      success: ocrResult.success
    });
    
    // Much lower threshold for smart mode - we trust our frame quality validation
    // Accept results above 20% if we have both card number and set code
    const hasValidData = ocrResult.cardNumber && ocrResult.setCode;
    const meetsThreshold = ocrResult.confidence > 0.2;
    
    if (ocrResult.success || (meetsThreshold && hasValidData)) {
      console.log(`[Smart OCR] Scan ${scanId} SUCCESS! Processing with confidence:`, ocrResult.confidence, 'cardNumber:', ocrResult.cardNumber, 'setCode:', ocrResult.setCode);
      visualAlignmentGuide.setState('success');
      await processOCRResult(ocrResult);
      return true; // Success!
    } else {
      // Not successful, but don't change state since other scans might succeed
      if (ocrResult.confidence > 0.15) {
        console.log(`[Smart OCR] Scan ${scanId}: Low confidence ${Math.round(ocrResult.confidence * 100)}%`);
      }
      return false;
    }
  } catch (error) {
    if (!signal.aborted) {
      console.error('[Smart OCR] Processing error:', error);
    }
    return false;
  }
}


function extractCardInfo(text: string): { setCode: string; cardNumber: string } | null {
  // Use the optimized extractor with set validation
  const result = extractMagicCardInfo(text);
  
  if (result) {
    // Validate against known sets
    const setInfo = magicSetsData.sets[result.setCode as keyof typeof magicSetsData.sets];
    if (setInfo) {
      const cardNum = parseInt(result.cardNumber);
      if (cardNum > 0 && cardNum <= setInfo.cards) {
        console.log(`[Scanner] Valid card: ${result.setCode} #${result.cardNumber} from "${setInfo.name}"`);
        return result;
      } else {
        console.log(`[Scanner] Invalid card number ${cardNum} for set ${result.setCode} (max: ${setInfo.cards})`);
      }
    } else {
      console.log(`[Scanner] Unknown set code: ${result.setCode}`);
      // Still return it, might be a new set
      return result;
    }
  }
  
  return null;
}

async function addToScanQueue(setCode: string, cardNumber: string, confidence: number): Promise<boolean> {
  try {
    // Check if already in queue
    const existingIndex = scannedCards.value.findIndex(
      item => item.card.setCode === setCode && item.card.collectorNumber === cardNumber
    );
    
    if (existingIndex >= 0) {
      // Increment quantity instead of adding duplicate
      scannedCards.value[existingIndex].quantity++;
      console.log(`[Scanner] Incremented quantity for ${setCode} #${cardNumber}`);
      return true;
    }
    
    // Fetch card data from Scryfall
    const card = await scryfallAPI.getCard(setCode, cardNumber);
    if (card) {
      const dbCard = scryfallAPI.convertToDbCard(card);
      
      // Add to queue
      scannedCards.value.push({
        card: dbCard,
        confidence: confidence * 100,
        isFoil: false,
        quantity: 1,
        detectedAt: new Date()
      });
      
      console.log(`[Scanner] Added ${dbCard.name} to queue`);
      return true;
    } else {
      scanStatus.value = `Card not found: ${setCode}/${cardNumber}`;
      return false;
    }
  } catch (error) {
    console.error('Failed to add card to queue:', error);
    scanStatus.value = 'Failed to fetch card data';
    return false;
  }
}

function removeFromQueue(index: number) {
  const card = scannedCards.value[index];
  scannedCards.value.splice(index, 1);
  console.log(`[Scanner] Removed ${card.card.name} from queue`);
}

function clearQueue() {
  scannedCards.value = [];
  recentlyScanned.clear();
  console.log('[Scanner] Cleared scan queue');
}

async function addAllToCollection() {
  if (scannedCards.value.length === 0) return;
  
  try {
    for (const item of scannedCards.value) {
      // Add each card with its quantity and foil status
      for (let i = 0; i < item.quantity; i++) {
        const cardToSave = { ...item.card, isFoil: item.isFoil };
        await (window as any).electronAPI.saveCard(cardToSave);
      }
    }
    
    alert(`Added ${scannedCards.value.length} unique cards to collection!`);
    clearQueue();
  } catch (error) {
    console.error('Failed to add cards to collection:', error);
    alert('Failed to add some cards to collection');
  }
}

async function fetchCardData(setCode: string, cardNumber: string) {
  try {
    const card = await scryfallAPI.getCard(setCode, cardNumber);
    if (card) {
      const dbCard = scryfallAPI.convertToDbCard(card);
      lastResult.value = {
        text: `${setCode} #${cardNumber}`,
        confidence: currentConfidence.value,
        card: dbCard
      };
      scanStatus.value = 'Card found!';
    } else {
      lastResult.value = {
        text: `${setCode} #${cardNumber}`,
        confidence: currentConfidence.value,
        error: `Card not found: ${setCode}/${cardNumber}`
      };
      scanStatus.value = 'Card not found';
    }
  } catch (error) {
    console.error('Failed to fetch card:', error);
    lastResult.value = {
      error: 'Failed to fetch card data'
    };
    scanStatus.value = 'Fetch failed';
  }
}

async function manualSearch() {
  if (!manualSetCode.value || !manualCardNumber.value) return;
  await fetchCardData(manualSetCode.value, manualCardNumber.value);
}

async function addToCollection(card: any) {
  try {
    await (window as any).electronAPI.saveCard(card);
    alert(`${card.name} added to collection!`);
  } catch (error) {
    console.error('Failed to add to collection:', error);
    alert('Failed to add card to collection');
  }
}

async function toggleCamera() {
  if (cameraActive.value) {
    stopCamera();
  } else {
    // First time starting camera - may need to request permission
    if (cameras.value.length === 0) {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ video: true })
          .then(s => s.getTracks().forEach(t => t.stop())); // Stop immediately, just needed permission
        
        // Now get the camera list again
        await getCameras();
      } catch (error) {
        console.error('Camera permission denied:', error);
        alert('Camera permission is required to scan cards');
        return;
      }
    }
    await initCamera();
  }
}

watch(settings, () => {
  // Clear detection cache when settings change
  detectedCards.clear();
});

onMounted(async () => {
  await getCameras();
  await setupOCR();
  // Don't auto-start camera
});

onUnmounted(async () => {
  stopCamera();
  stopStreamingPipeline();
  stopSmartMonitoring();
  await streamingOCRService.destroy();
  destroyEnhancedOCRService();
});
</script>

<style scoped>
.scanner-view {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.scanner-header {
  margin-bottom: 20px;
}

.scanner-controls {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.scanner-content {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}

.video-container {
  position: relative;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.video-container video,
.video-container canvas {
  width: 100%;
  height: auto;
  display: block;
}

.overlay-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}

.capture-overlay {
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(0, 0, 0, 0.7);
  padding: 15px;
  border-radius: 8px;
}

.scan-status {
  display: flex;
  align-items: center;
  gap: 10px;
  color: white;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #888;
}

.status-indicator.active {
  background: #00ff00;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.capture-btn {
  padding: 10px 20px;
  font-size: 16px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.capture-btn:disabled {
  background: #888;
  cursor: not-allowed;
}

.confidence-bar {
  position: relative;
  height: 30px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 15px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confidence-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, #f44336, #ff9800, #4caf50);
  transition: width 0.3s ease;
}

.confidence-bar span {
  position: relative;
  color: white;
  font-weight: bold;
  z-index: 1;
}

.scan-result,
.manual-input,
.processing-settings {
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.scan-result h3,
.manual-input h3,
.processing-settings h3 {
  margin-top: 0;
  margin-bottom: 15px;
}

.result-content p {
  margin: 10px 0;
}

.error {
  color: #f44336;
}

.input-group {
  display: flex;
  gap: 10px;
}

.input-group input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.input-group button {
  padding: 8px 16px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.add-btn {
  padding: 8px 16px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 10px;
}

/* Streaming pipeline styles */
.streaming-status {
  margin-top: 15px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
}

.stability-indicator {
  margin-bottom: 10px;
}

.stability-bar {
  width: 100%;
  height: 20px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 5px;
}

.stability-fill {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
  border-radius: 10px;
}

.stability-label {
  color: white;
  font-size: 14px;
}

.live-hypotheses {
  margin-top: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 5px;
}

.hypothesis-row {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
  color: white;
  font-size: 13px;
}

.field-name {
  font-weight: bold;
  margin-right: 10px;
  min-width: 100px;
}

.field-value {
  flex: 1;
  font-family: monospace;
}

.field-confidence {
  margin-left: 10px;
  opacity: 0.7;
}

.fps-display {
  margin-top: 10px;
  display: flex;
  gap: 15px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-family: monospace;
}

.status-indicator.stable {
  background: #4CAF50;
  animation: pulse 1s infinite;
}

.status-indicator.processing {
  background: #FFC107;
  animation: pulse 0.5s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.processing-settings label {
  display: block;
  margin: 10px 0;
}

.processing-settings input[type="checkbox"] {
  margin-right: 8px;
}

.processing-settings input[type="range"] {
  width: 200px;
  margin-left: 10px;
}

.mode-toggle {
  background: #9C27B0;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.ocr-toggle {
  background: #FF5722;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}

.ocr-toggle.paddle {
  background: #00BCD4;
}

.ocr-toggle:hover {
  opacity: 0.9;
  transform: scale(1.05);
}

/* Scan Queue Styles */
.scan-queue {
  background: #f9f9f9;
  border: 2px solid #4CAF50;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
  max-height: 400px;
  overflow-y: auto;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #ddd;
}

.queue-header h3 {
  margin: 0;
  color: #333;
}

.bulk-add-btn {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.bulk-add-btn:hover {
  background: #45a049;
}

.bulk-add-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.queue-list {
  max-height: 250px;
  overflow-y: auto;
}

.queue-item {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
}

.queue-item:hover {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.card-info {
  flex: 1;
}

.card-name {
  font-weight: bold;
  font-size: 14px;
  color: #333;
}

.card-details {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.confidence-badge {
  background: #2196F3;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  margin-left: 8px;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.foil-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}

.foil-toggle input[type="checkbox"] {
  cursor: pointer;
}

.quantity-input {
  width: 50px;
  padding: 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
}

.remove-btn {
  background: #f44336;
  color: white;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-btn:hover {
  background: #d32f2f;
}

.queue-footer {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #ddd;
  text-align: center;
}

.clear-btn {
  background: #ff9800;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.clear-btn:hover {
  background: #f57c00;
}
</style>