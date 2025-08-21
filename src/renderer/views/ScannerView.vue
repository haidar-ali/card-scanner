<template>
  <div class="scanner-view">
    <div class="scanner-header">
      <h2>Card Scanner</h2>
      <div class="scanner-controls">
        <select v-model="selectedCamera" @change="initCamera" :disabled="isProcessing">
          <option v-for="device in cameras" :key="device.deviceId" :value="device.deviceId">
            {{ device.label || `Camera ${cameras.indexOf(device) + 1}` }}
          </option>
        </select>
        <button @click="toggleCamera" :disabled="isProcessing || !visionApiKey">
          {{ cameraActive ? 'Stop Camera' : 'Start Camera' }}
        </button>
        
        <!-- Stability indicator -->
        <div v-if="cameraActive" class="stability-indicator-compact">
          <span class="stability-text" :style="{ color: streamingStatus.isStable ? '#4CAF50' : '#FFC107' }">
            {{ streamingStatus.isStable ? '● Stable' : '● Hold steady' }}
          </span>
          <div class="stability-bar-compact">
            <div class="stability-fill" :style="{ 
              width: `${streamingStatus.stabilityScore * 100}%`,
              backgroundColor: streamingStatus.isStable ? '#4CAF50' : '#FFC107'
            }"></div>
          </div>
        </div>
        
        <!-- Scan status -->
        <span v-if="cameraActive" class="scan-status-text">{{ scanStatus }}</span>
      </div>
      
      <!-- Vision API status/warning -->
      <div v-if="!visionApiKey" class="api-key-warning">
        <span>⚠️ Google Vision API key required. Please configure in <router-link to="/settings">Settings</router-link></span>
      </div>
    </div>

    <div class="scanner-content">
      <div class="left-section">
        <div class="video-container">
          <video ref="videoElement" autoplay playsinline></video>
          <canvas ref="overlayCanvas" class="overlay-canvas"></canvas>
          <canvas ref="canvasElement" :style="{ display: showCanvas ? 'block' : 'none' }"></canvas>
          <canvas ref="processCanvas" style="display: none;"></canvas>
          
          <!-- Success checkmark overlay -->
          <div v-if="showSuccessCheckmark" class="success-checkmark">
            <div class="checkmark-circle">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="38" stroke="#4CAF50" stroke-width="4" fill="none" />
                <path d="M20 40 L32 52 L60 24" stroke="#4CAF50" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <p>Card scanned! You can change the card now.</p>
          </div>
        </div>
        
        <!-- Manual Input - Under video -->
        <div class="manual-input-compact">
          <input v-model="manualSetCode" placeholder="Set Code" />
          <input v-model="manualCardNumber" placeholder="Card #" />
          <button @click="manualSearch" :disabled="!manualSetCode || !manualCardNumber">
            Search
          </button>
        </div>
        
        <!-- Debug ROI Panel - Under manual input -->
        <div v-if="debugMode" class="debug-panel">
          <h4>ROI Debug</h4>
          <div class="debug-images">
            <div v-for="[field, dataUrl] in debugCanvases" :key="field" class="debug-image">
              <label>{{ field }}</label>
              <img v-if="dataUrl && dataUrl.startsWith('data:')" :src="dataUrl" :alt="field" />
              <div v-else class="no-image">No image</div>
              <span class="debug-text">{{ streamingHypotheses.get(field)?.value || 'N/A' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Scanned Cards Queue - On the right -->
      <div class="scan-queue" v-if="scannedCards.length > 0">
        <div class="queue-header">
          <h3>Scanned ({{ scannedCards.length }})</h3>
          <button @click="addAllToCollection" class="add-all-btn">
            Add All
          </button>
        </div>
        <div class="queue-list">
          <div v-for="(item, index) in [...scannedCards].reverse()" :key="scannedCards.length - 1 - index" class="queue-card">
            <img 
              :src="item.card.imageUriSmall" 
              :alt="item.card.name"
              class="card-thumbnail"
            />
            <div class="card-info">
              <div class="card-name">{{ item.card.name }}</div>
              <div class="card-set">{{ item.card.setCode }} · #{{ item.card.collectorNumber }}</div>
              <div class="card-price" v-if="item.card.priceUsd">${{ item.card.priceUsd }}</div>
            </div>
            <div class="card-controls">
              <button @click="removeFromQueue(scannedCards.length - 1 - index)" class="remove-btn" title="Remove">
                ×
              </button>
              <div class="quantity-control">
                <button @click="item.quantity = Math.max(1, item.quantity - 1)" class="qty-btn">-</button>
                <span class="qty-display">{{ item.quantity }}</span>
                <button @click="item.quantity++" class="qty-btn">+</button>
              </div>
              <label class="foil-checkbox" :class="{ checked: item.isFoil }">
                <input type="checkbox" v-model="item.isFoil" />
                <span>✨</span>
              </label>
            </div>
          </div>
        </div>
        <div class="queue-footer">
          <button @click="clearQueue" class="clear-queue-btn">Clear</button>
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


      <!--<div class="processing-settings">
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
      </div>-->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, inject } from 'vue';
import scryfallAPI from '../api/scryfall';
import { preprocessImage, drawRegionGuide, extractCardRegion } from '../utils/imageProcessing';
import { getEnhancedOCRService, destroyEnhancedOCRService } from '../utils/enhancedOCRService';
import { smartRegionExtractor } from '../utils/smartRegionExtractor';
import { extractMagicCardInfo } from '../utils/cardOCROptimizer';
import { frameQualityAnalyzer, type QualityMetrics } from '../utils/frameQualityAnalyzer';
import { visualAlignmentGuide, type ScanState } from '../utils/visualAlignmentGuide';
import { streamingOCRService, type StreamingStatus, type StreamingEvent } from '../utils/streamingOCRService';
import { streamingROIManager } from '../utils/streamingROIManager';
import { getVisionService, setVisionApiKey } from '../utils/googleVisionService';
import { temporalOCRFusion } from '../utils/temporalOCRFusion';
import { canvasCardDetector, type CardBounds } from '../utils/canvasCardDetector';
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
const realTimeMode = ref(true); // Always true now, no toggle
const currentConfidence = ref(0);

// Vision AI Configuration
const visionApiKey = ref(''); // Loaded from settings
// Vision AI is always used now - no toggle
const visionEnabled = ref(false);
const visionProcessing = ref(false); // Track if Vision AI is currently processing
const lastStabilityState = ref(false); // Track stability state changes
const scanStatus = ref('Initializing OCR...');
const showSuccessCheckmark = ref(false); // Show checkmark when card is scanned
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

// Debug canvases for ROI visualization
const debugCanvases = ref<Map<string, string>>(new Map());

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
  
  // Skip all OCR processing if Vision AI is enabled
  if (visionEnabled.value) {
    console.log('[Scanner] Vision AI enabled - skipping OCR processing');
    return;
  }
  
  // Only process OCR if Vision AI is not available
  if (!visionEnabled.value) {
    console.log('[Scanner] Vision AI not available - please configure Vision AI key');
    scanStatus.value = 'Vision AI required - please add API key';
    return;
  }
  
  // This code should never be reached since we require Vision AI
  let cardInfo: { setCode: string; cardNumber: string } | null = null;
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
  // Don't change realTimeMode - it should always be true now
  // realTimeMode.value = false;  // REMOVED - was breaking restart
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

// Removed toggleRealTime - always streaming now

// Card border detection using OpenCV for accurate card boundaries
async function detectCardBounds(canvas: HTMLCanvasElement): Promise<{x: number, y: number, width: number, height: number, confidence: number} | null> {
  const cardBounds = await canvasCardDetector.detectCard(canvas);
  
  if (!cardBounds) {
    // Commented out for cleaner logs - too frequent
    // console.log('[CardDetection] No card detected');
    return null;
  }
  
  console.log('[CardDetection] Canvas detector found card:', {
    bounds: cardBounds,
    confidence: `${(cardBounds.confidence * 100).toFixed(0)}%`
  });
  
  // Extract bottom portion of the detected card
  const bottomCropRatio = 0.25; // Bottom 25% for collector info
  const bottomHeight = Math.floor(cardBounds.height * bottomCropRatio);
  const bottomY = cardBounds.y + cardBounds.height - bottomHeight;
  
  return {
    x: cardBounds.x,
    y: bottomY,
    width: cardBounds.width,
    height: bottomHeight,
    confidence: cardBounds.confidence // Include confidence for threshold check
  };
}

// Legacy edge detection method (keeping for reference but not using)
async function detectCardBoundsLegacy(canvas: HTMLCanvasElement): Promise<{x: number, y: number, width: number, height: number} | null> {
  try {
    console.log('[CardDetection] Detecting card boundaries using edge detection...');
    
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Convert to grayscale for edge detection
    const grayscale = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.floor(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayscale[i / 4] = gray;
    }
    
    // Detect edges using simple gradient approach
    // Scan from center outward to find card boundaries
    const centerX = Math.floor(canvas.width / 2);
    const centerY = Math.floor(canvas.height / 2);
    
    // Helper function to check if position has strong edge
    const hasEdge = (x: number, y: number, threshold: number = 30): boolean => {
      if (x <= 1 || x >= canvas.width - 2 || y <= 1 || y >= canvas.height - 2) return false;
      
      const idx = y * canvas.width + x;
      const center = grayscale[idx];
      
      // Check horizontal and vertical gradients
      const left = grayscale[idx - 1];
      const right = grayscale[idx + 1];
      const top = grayscale[idx - canvas.width];
      const bottom = grayscale[idx + canvas.width];
      
      const hGrad = Math.abs(right - left);
      const vGrad = Math.abs(bottom - top);
      
      return Math.max(hGrad, vGrad) > threshold;
    };
    
    // Find card boundaries by scanning from center
    let cardLeft = centerX;
    let cardRight = centerX;
    let cardTop = centerY;
    let cardBottom = centerY;
    
    // Find card edges more accurately by looking for consistent edges
    let foundLeft = false, foundRight = false, foundTop = false, foundBottom = false;
    
    // Scan left from center - look for vertical edge
    // Continue scanning to find the actual left edge
    let lastValidLeft = centerX;
    for (let x = centerX; x > 20; x -= 2) {
      let edgeCount = 0;
      // Check vertical line for edges
      for (let y = centerY - 100; y <= centerY + 100; y += 5) {
        if (hasEdge(x, y, 25)) edgeCount++;
      }
      // Keep updating left as long as we find edges
      if (edgeCount >= 8) {
        lastValidLeft = x ; // Add small offset to stay inside card
        foundLeft = true;
      } else if (foundLeft && edgeCount < 3) {
        // We've passed the left edge
        break;
      }
    }
    cardLeft = lastValidLeft;
    
    // Scan right from center
    let lastValidRight = centerX;
    for (let x = centerX; x < canvas.width - 20; x += 2) {
      let edgeCount = 0;
      for (let y = centerY - 100; y <= centerY + 100; y += 5) {
        if (hasEdge(x, y, 25)) edgeCount++;
      }
      if (edgeCount >= 8) {
        lastValidRight = x; // Subtract small offset to stay inside card
        foundRight = true;
      } else if (foundRight && edgeCount < 3) {
        // We've passed the right edge
        break;
      }
    }
    cardRight = lastValidRight;
    
    // Scan top from center - continue scanning to find the actual top edge
    let lastValidTop = centerY;
    for (let y = centerY; y > 20; y -= 2) {
      let edgeCount = 0;
      // Check horizontal line for edges
      for (let x = centerX - 100; x <= centerX + 100; x += 5) {
        if (hasEdge(x, y, 25)) edgeCount++;
      }
      // Keep updating top as long as we find edges
      if (edgeCount >= 8) {
        lastValidTop = y;
        foundTop = true;
      } else if (foundTop && edgeCount < 3) {
        // We've passed the top edge
        break;
      }
    }
    cardTop = lastValidTop;
    
    // Scan bottom from center - continue scanning to find the actual bottom edge
    // Don't stop at the first edge, keep going to find the card's actual bottom
    let lastValidBottom = centerY;
    for (let y = centerY; y < canvas.height - 20; y += 2) {
      let edgeCount = 0;
      for (let x = centerX - 100; x <= centerX + 100; x += 5) {
        if (hasEdge(x, y, 25)) edgeCount++;
      }
      // Keep updating bottom as long as we find edges
      if (edgeCount >= 8) {
        lastValidBottom = y;
        foundBottom = true;
      } else if (foundBottom && edgeCount < 3) {
        // We've passed the bottom edge
        break;
      }
    }
    cardBottom = lastValidBottom;
    
    // Check if we found all edges
    const allEdgesFound = foundLeft && foundRight && foundTop && foundBottom;
    
    if (!allEdgesFound) {
      console.log('[CardDetection] Not all edges found:', {foundLeft, foundRight, foundTop, foundBottom});
      // Use wider search if initial edge detection failed
      if (!foundLeft) cardLeft = Math.max(20, centerX - 200);
      if (!foundRight) cardRight = Math.min(canvas.width - 20, centerX + 200);  
      if (!foundTop) cardTop = Math.max(20, centerY - 250);
      if (!foundBottom) cardBottom = Math.min(canvas.height - 20, centerY + 250);
    }
    
    // Ensure we have valid dimensions (not zero width or height)
    if (cardRight <= cardLeft) {
      console.log('[CardDetection] Invalid width detected, using default width');
      const defaultCardWidth = Math.floor(canvas.width * 0.4);
      cardLeft = centerX - defaultCardWidth / 2;
      cardRight = centerX + defaultCardWidth / 2;
    }
    
    if (cardBottom <= cardTop) {
      console.log('[CardDetection] Invalid height detected, using default height');
      const defaultCardHeight = Math.floor(canvas.height * 0.7);
      cardTop = centerY - defaultCardHeight / 2;
      cardBottom = centerY + defaultCardHeight / 2;
    }
    
    const cardWidth = cardRight - cardLeft;
    const cardHeight = cardBottom - cardTop;
    
    // Validate detected card
    const aspectRatio = cardWidth / cardHeight;
    const areaRatio = (cardWidth * cardHeight) / (canvas.width * canvas.height);
    
    console.log('[CardDetection] Found card region:', {
      left: cardLeft, right: cardRight, top: cardTop, bottom: cardBottom,
      width: cardWidth, height: cardHeight, aspectRatio: aspectRatio.toFixed(2)
    });
    
    // More lenient validation - Magic cards can appear at various angles/distances
    if (cardWidth < 100 || cardHeight < 140 || cardWidth > canvas.width * 0.9 || cardHeight > canvas.height * 0.9) {
      console.log('[CardDetection] Invalid dimensions, adjusting to reasonable defaults');
      // Use a reasonable center crop
      const defaultWidth = Math.floor(canvas.width * 0.6);
      const defaultHeight = Math.floor(defaultWidth / 0.714);
      cardLeft = Math.floor((canvas.width - defaultWidth) / 2);
      cardTop = Math.floor((canvas.height - defaultHeight) / 2);
      cardRight = cardLeft + defaultWidth;
      cardBottom = cardTop + defaultHeight;
    }
    
    // Now extract the bottom portion of the DETECTED CARD (not the whole image)
    // We want the bottom 25% of the actual card for collector info
    // But shift it up slightly to catch the collector number area better
    const bottomCropRatio = 0.30; // Bottom 30% of the card 
    const cardActualHeight = cardBottom - cardTop;
    // Shift up by 10% to better capture the collector info area (not the very bottom edge)
    const bottomCropY = cardBottom - Math.floor(cardActualHeight * (bottomCropRatio + 0.05));
    
    // Use the detected card width but pull in the edges slightly to avoid background
    // Negative margin means we crop IN from the detected edges
    const horizontalMargin = -5; // Pull in by 10 pixels on each side
    const finalX = Math.max(0, cardLeft - horizontalMargin);
    const finalY = Math.max(0, bottomCropY);
    const finalWidth = Math.min(cardRight - cardLeft + 2 * horizontalMargin, canvas.width - finalX);
    const finalHeight = Math.min(cardBottom - bottomCropY + 5, canvas.height - finalY);
    
    console.log('[CardDetection] Card detected:', {
      fullCard: {left: cardLeft, top: cardTop, right: cardRight, bottom: cardBottom},
      cardDimensions: {width: cardRight - cardLeft, height: cardBottom - cardTop},
      bottomCrop: {x: finalX, y: finalY, width: finalWidth, height: finalHeight},
      bottomCropInfo: {
        cropRatio: bottomCropRatio,
        bottomCropY: bottomCropY,
        cropHeight: cardBottom - bottomCropY
      },
      aspectRatio,
      areaRatio,
      canvasSize: `${canvas.width}x${canvas.height}`
    });
    
    return {x: finalX, y: finalY, width: finalWidth, height: finalHeight};
    
  } catch (error) {
    console.error('[CardDetection] Error detecting card bounds:', error);
    return null;
  }
}

// Vision AI configuration handlers
// Test Vision API connection
async function testVisionConnection(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;
  
  try {
    // Initialize Vision service with the API key
    setVisionApiKey(apiKey);
    const visionService = getVisionService();
    
    // Test the connection
    const isValid = await visionService.testConnection();
    
    if (isValid) {
      console.log('[Scanner] Vision API key validated successfully');
    } else {
      console.warn('[Scanner] Vision API key validation failed');
    }
    
    return isValid;
  } catch (error) {
    console.error('[Scanner] Vision API test error:', error);
    return false;
  }
}

// Removed watch for useVisionAI - Vision AI is always used now

// Debounce control for Vision AI
let lastVisionTriggerTime = 0;
const VISION_DEBOUNCE_MS = 3000; // Minimum 3 seconds between Vision AI calls

// Track if we've already processed this stable state
let lastProcessedStableId = 0;

// Track consecutive frames with good card detection (not perfect stability)
let consecutiveGoodFrames = 0;
const REQUIRED_GOOD_FRAMES = 5; // Need 5 consecutive good frames (about 0.15 seconds at 30fps) - reduced for handheld
let lastCardCheckTime = 0;
const CARD_CHECK_INTERVAL = 100; // Check every 100ms
let lastVisionAICallTime = 0;
const VISION_AI_COOLDOWN = 3000; // 3 second cooldown between Vision AI calls

// Two-tier confidence tracking
let initialCardLocked = false;
let lockedCardBounds: {x: number, y: number, width: number, height: number} | null = null;
const INITIAL_MIN_CONFIDENCE = 0.40; // Higher confidence to start tracking
const SUSTAINED_MIN_CONFIDENCE = 0.30; // Lower confidence once locked on
const MAX_POSITION_DRIFT = 50; // Max pixels the card can move between frames
const MAX_CARD_WIDTH = 600; // Cards shouldn't be wider than this (false detection)

// Watch for card presence and reasonable stability (not perfect stability)
watch(
  () => ({
    cardPresent: streamingStatus.value.cardPresent,
    stabilityScore: streamingStatus.value.stabilityScore,
    isStable: streamingStatus.value.isStable
  }),
  async ({ cardPresent, stabilityScore, isStable }) => {
    // Check if we have a card with reasonable quality (not perfect stability)
    const hasGoodCard = cardPresent && stabilityScore > 0.5; // Lowered from 0.7 to 0.5 for handheld

    // Debounce check - prevent rapid triggers
    const now = Date.now();
    const timeSinceLastTrigger = now - lastVisionTriggerTime;
    const timeSinceLastCheck = now - lastCardCheckTime;
    
    // Don't check too frequently
    if (timeSinceLastCheck < CARD_CHECK_INTERVAL) {
      return;
    }
    lastCardCheckTime = now;
    
    // Skip if we're processing
    if (visionProcessing.value) {
      return;
    }
    
    // Skip if we're still in cooldown from last Vision AI call
    const timeSinceLastVisionCall = now - lastVisionAICallTime;
    if (timeSinceLastVisionCall < VISION_AI_COOLDOWN) {
      return;
    }
    
    // Check conditions for Vision AI trigger (with debounce)
    if (hasGoodCard && !visionProcessing.value && 
        visionEnabled.value &&
        timeSinceLastTrigger > VISION_DEBOUNCE_MS) {

      // Pre-capture confidence check - don't even stop streaming if confidence is too low
      const preCheckCanvas = document.createElement('canvas');
      const preCtx = preCheckCanvas.getContext('2d')!;
      
      // Use fixed dimensions if processCanvas isn't ready yet
      const FIXED_WIDTH = 960;
      const FIXED_HEIGHT = 540;
      preCheckCanvas.width = processCanvas.value?.width || FIXED_WIDTH;
      preCheckCanvas.height = processCanvas.value?.height || FIXED_HEIGHT;
      
      // Force a fresh frame capture to avoid cached detection
      preCtx.clearRect(0, 0, preCheckCanvas.width, preCheckCanvas.height);

      // Draw from video or processCanvas
      if (videoElement.value) {
        // Always draw from video for fresh frame
        preCtx.drawImage(videoElement.value, 0, 0, preCheckCanvas.width, preCheckCanvas.height);
      } else {
        console.warn('[Scanner] No video element available for Vision AI capture');
        return;
      }

      const preliminaryBounds = await detectCardBounds(preCheckCanvas);
      
      // Log card detection result
      /*if (preliminaryBounds) {
        console.log('[Scanner] Card detected with', (preliminaryBounds.confidence * 100).toFixed(0) + '% confidence, required:', INITIAL_MIN_CONFIDENCE);
      } else {
        console.log('[Scanner] No card detected by canvasCardDetector');
      }*/

      // Bounds validation - reject obvious false detections
      if (preliminaryBounds && preliminaryBounds.width > MAX_CARD_WIDTH) {
        // This is likely a false detection (too wide to be a card)
        consecutiveGoodFrames = 0;
        initialCardLocked = false;
        lockedCardBounds = null;
        scanStatus.value = `False detection - card too wide`;
        return;
      }
      
      // Two-tier confidence system
      const requiredConfidence = initialCardLocked ? SUSTAINED_MIN_CONFIDENCE : INITIAL_MIN_CONFIDENCE;
      
      if (!preliminaryBounds || preliminaryBounds.confidence < requiredConfidence) {
        // Reset tracking if we can't maintain minimum confidence
        consecutiveGoodFrames = 0;
        if (!initialCardLocked) {
          scanStatus.value = `Detecting card... (${preliminaryBounds ? Math.round(preliminaryBounds.confidence * 100) : 0}% confidence, need ${Math.round(requiredConfidence * 100)}%)`;
        } else {
          // Lost lock on card
          initialCardLocked = false;
          lockedCardBounds = null;
          scanStatus.value = `Lost card tracking - reacquiring...`;
        }
        return;
      }
      
      // Check position stability if we have a locked card
      if (lockedCardBounds) {
        const xDrift = Math.abs(preliminaryBounds.x - lockedCardBounds.x);
        const yDrift = Math.abs(preliminaryBounds.y - lockedCardBounds.y);
        
        if (xDrift > MAX_POSITION_DRIFT || yDrift > MAX_POSITION_DRIFT) {
          // Card moved too much - probably a different detection
          console.log('[Scanner] Card position drift too large - resetting');
          consecutiveGoodFrames = 0;
          initialCardLocked = false;
          lockedCardBounds = null;
          return;
        }
      }
      
      // First good detection - lock onto this card
      if (!initialCardLocked && preliminaryBounds.confidence >= INITIAL_MIN_CONFIDENCE) {
        initialCardLocked = true;
        lockedCardBounds = {
          x: preliminaryBounds.x,
          y: preliminaryBounds.y,
          width: preliminaryBounds.width,
          height: preliminaryBounds.height
        };
        console.log('[Scanner] Locked onto card with', (preliminaryBounds.confidence * 100).toFixed(0) + '% confidence');
      }
      
      // Update locked bounds with current position (moving average)
      if (lockedCardBounds) {
        lockedCardBounds.x = (lockedCardBounds.x * 0.7 + preliminaryBounds.x * 0.3);
        lockedCardBounds.y = (lockedCardBounds.y * 0.7 + preliminaryBounds.y * 0.3);
        lockedCardBounds.width = (lockedCardBounds.width * 0.7 + preliminaryBounds.width * 0.3);
        lockedCardBounds.height = (lockedCardBounds.height * 0.7 + preliminaryBounds.height * 0.3);
      }
      
      // Increment consecutive good frames
      consecutiveGoodFrames++;
      
      // Check if we have enough consecutive good frames
      if (consecutiveGoodFrames < REQUIRED_GOOD_FRAMES) {
        console.log('[Scanner] Building confidence:', consecutiveGoodFrames, '/', REQUIRED_GOOD_FRAMES, 'frames');
        scanStatus.value = `Card detected (${Math.round(preliminaryBounds.confidence * 100)}%) - stabilizing... ${consecutiveGoodFrames}/${REQUIRED_GOOD_FRAMES}`;
        return; // Keep streaming, need more stable frames
      }
      
      // Check if we're still in cooldown period
      const timeSinceLastCall = Date.now() - lastVisionAICallTime;
      if (timeSinceLastCall < VISION_AI_COOLDOWN) {
        const remainingCooldown = Math.ceil((VISION_AI_COOLDOWN - timeSinceLastCall) / 1000);
        if (consecutiveGoodFrames === REQUIRED_GOOD_FRAMES) { // Only log once when we first hit the required frames
          console.log(`[Scanner] Vision AI cooldown active - waiting ${remainingCooldown}s before next scan`);
        }
        scanStatus.value = `Cooldown: ${remainingCooldown}s until next scan`;
        consecutiveGoodFrames = 0; // Reset frame counter during cooldown
        initialCardLocked = false; // Reset card lock during cooldown
        lockedCardBounds = null;
        canvasCardDetector.reset(); // Clear cached detection during cooldown
        return;
      }
      
      console.log('[Scanner] 🎯 Card confidence sufficient and stable after', REQUIRED_GOOD_FRAMES, 'frames - CALLING VISION AI NOW');
      
      // Record the time of this Vision AI call
      lastVisionAICallTime = Date.now();
      
      // Reset counter and lock for next detection
      consecutiveGoodFrames = 0;
      initialCardLocked = false;
      lockedCardBounds = null;
      
      // Reset the card detector to prevent detecting the same card position
      canvasCardDetector.reset();
      
      lastVisionTriggerTime = now;
      visionProcessing.value = true;
      scanStatus.value = 'Vision AI processing...';
      
      // NOW stop streaming right before Vision AI call (not during cooldown)
      stopStreamingPipeline();
      
      try {
        // Use the already captured canvas with good confidence
        const capturedCanvas = preCheckCanvas;
        const cardBounds = preliminaryBounds;
        
        // We already know card is detected with good confidence
        if (!cardBounds) {
          // This shouldn't happen but handle it anyway
          console.warn('[Scanner] Unexpected: no card boundaries');
          visionProcessing.value = false;
          scanStatus.value = 'Card detection failed';
          // Resume scanning after a short delay
          setTimeout(() => {
            if (realTimeMode.value) {
              showCanvas.value = false;
              startStreamingPipeline();
            }
          }, 1000);
          return;
        }
        
        let croppedCanvas = capturedCanvas;
        
        if (cardBounds) {
          console.log('[Scanner] Cropping to detected card bounds with buffer');
          
          // Add a small buffer (5% on each side) to ensure we get everything
          const bufferPercent = 0.05;
          const bufferX = Math.floor(cardBounds.width * bufferPercent);
          const bufferY = Math.floor(cardBounds.height * bufferPercent);
          
          // Calculate buffered bounds (but stay within canvas limits)
          const bufferedBounds = {
            x: Math.max(0, cardBounds.x - bufferX),
            y: Math.max(0, cardBounds.y - bufferY),
            width: Math.min(capturedCanvas.width - (cardBounds.x - bufferX), cardBounds.width + (bufferX * 2)),
            height: Math.min(capturedCanvas.height - (cardBounds.y - bufferY), cardBounds.height + (bufferY * 2))
          };
          
          // Scale up the cropped region for better OCR (2x scaling)
          const scaleFactor = 2;
          croppedCanvas = document.createElement('canvas');
          const cropCtx = croppedCanvas.getContext('2d')!;
          
          // Set canvas size to scaled dimensions
          croppedCanvas.width = bufferedBounds.width * scaleFactor;
          croppedCanvas.height = bufferedBounds.height * scaleFactor;
          
          // Enable image smoothing for better quality when scaling
          cropCtx.imageSmoothingEnabled = true;
          cropCtx.imageSmoothingQuality = 'high';
          
          // Draw the cropped and scaled region with buffer
          cropCtx.drawImage(
            capturedCanvas, 
            bufferedBounds.x, bufferedBounds.y, bufferedBounds.width, bufferedBounds.height,
            0, 0, croppedCanvas.width, croppedCanvas.height
          );
          
          console.log('[Scanner] Scaled crop for Vision AI:', croppedCanvas.width, 'x', croppedCanvas.height);
        }
        
        // Show the captured card in the UI - full size
        if (canvasElement.value) {
          const displayCtx = canvasElement.value.getContext('2d')!;
          // Match video container size for full display
          canvasElement.value.width = 960;
          canvasElement.value.height = 540;
          displayCtx.drawImage(capturedCanvas, 0, 0, 960, 540);
          showCanvas.value = true; // Show the captured card full size
        }
        
        // Add CROPPED image to debug view - this is what would be sent to Vision AI
        const croppedDataUrl = croppedCanvas.toDataURL();
        const fullDataUrl = capturedCanvas.toDataURL();
        
        // Force Vue reactivity by creating a new Map
        const newDebugCanvases = new Map(debugCanvases.value);
        newDebugCanvases.set('vision_ai_capture', croppedDataUrl);
        newDebugCanvases.set('full_capture', fullDataUrl);
        debugCanvases.value = newDebugCanvases;
        
        console.log('[Scanner] Calling Vision AI with cropped card image');
        console.log('[Scanner] Full capture size:', capturedCanvas.width, 'x', capturedCanvas.height);
        console.log('[Scanner] Cropped card size:', croppedCanvas.width, 'x', croppedCanvas.height);
        console.log('[Scanner] Debug images added:', newDebugCanvases.size, 'images');
        console.log('[Scanner] Vision capture data URL length:', croppedDataUrl.length);
        
        // Call Vision AI with cropped image
        const visionService = getVisionService();
        const visionResult = await visionService.extractCardInfo(croppedCanvas); // Send cropped image
        
        console.log('[Scanner] Vision AI full response:', visionResult);
        console.log('[Scanner] Raw text detected:', visionResult.raw_text);
        
        if (visionResult.collector_number && visionResult.set_code) {
          console.log('[Scanner] Vision AI successfully extracted:');
          console.log('  - Set Code:', visionResult.set_code);
          console.log('  - Collector Number:', visionResult.collector_number);
          console.log('  - Confidence:', visionResult.confidence);
          
          // Add to scan queue directly
          scanStatus.value = 'Adding to queue...';
          const success = await addToScanQueue(visionResult.set_code, visionResult.collector_number, visionResult.confidence);
          
          if (success) {
            scanStatus.value = `✓ Added ${visionResult.set_code} #${visionResult.collector_number} to queue`;
            
            // Show success checkmark
            showSuccessCheckmark.value = true;
            setTimeout(() => {
              showSuccessCheckmark.value = false;
            }, 2500);
            
            // Wait for user to remove card before resuming
            setTimeout(async () => {
              scanStatus.value = 'Ready for next card';
              showCanvas.value = false; // Hide captured image, show video
              
              // Ensure video is playing before restarting pipeline
              if (videoElement.value && videoElement.value.paused) {
                try {
                  await videoElement.value.play();
                  console.log('[Scanner] Video playback resumed');
                } catch (error) {
                  console.error('[Scanner] Failed to resume video:', error);
                }
              }
              
              startStreamingPipeline(); // Resume scanning for next card
            }, 2000);
          }
        } else {
          console.log('[Scanner] Vision AI could not extract complete card info');
          console.log('  - Set Code found:', visionResult.set_code || 'No');
          console.log('  - Collector Number found:', visionResult.collector_number || 'No');
          console.log('  - Error:', visionResult.error || 'None');
          console.log('  - Raw text:', visionResult.raw_text?.substring(0, 200) || 'None');
          
          scanStatus.value = `Vision AI: ${visionResult.error || 'Could not detect both set code and collector number'}`;
          
          // Resume scanning after showing error
          setTimeout(async () => {
            if (realTimeMode.value) {
              showCanvas.value = false; // Hide captured image, show video
              
              // Ensure video is playing before restarting pipeline
              if (videoElement.value && videoElement.value.paused) {
                try {
                  await videoElement.value.play();
                  console.log('[Scanner] Video playback resumed after error');
                } catch (error) {
                  console.error('[Scanner] Failed to resume video:', error);
                }
              }
              
              startStreamingPipeline();
            }
          }, 3000);
        }
      } catch (error) {
        console.error('[Scanner] Vision AI error:', error);
        scanStatus.value = 'Vision AI error - resuming OCR';
        // Resume scanning on error
        setTimeout(async () => {
          if (realTimeMode.value) {
            showCanvas.value = false; // Hide captured image, show video
            
            // Ensure video is playing before restarting pipeline
            if (videoElement.value && videoElement.value.paused) {
              try {
                await videoElement.value.play();
                console.log('[Scanner] Video playback resumed after exception');
              } catch (error) {
                console.error('[Scanner] Failed to resume video:', error);
              }
            }
            
            startStreamingPipeline();
          }
        }, 2000);
      } finally {
        visionProcessing.value = false;
      }
    }
    
    // Reset counter if card is lost or quality drops too much
    if (!hasGoodCard && consecutiveGoodFrames > 0) {
      console.log('[Scanner] Card quality dropped - resetting counter');
      consecutiveGoodFrames = 0; // Reset the counter
      scanStatus.value = 'Position card in view...';
    }
  }
);

/**
 * Start the streaming OCR pipeline
 */
async function startStreamingPipeline() {
  if (!videoElement.value || !processCanvas.value) return;
  
  // Set up canvases with fixed dimensions for consistent ROI positioning
  const video = videoElement.value;
  // Always use fixed dimensions regardless of actual video resolution
  const FIXED_WIDTH = 960;
  const FIXED_HEIGHT = 540;
  
  processCanvas.value.width = FIXED_WIDTH;
  processCanvas.value.height = FIXED_HEIGHT;
  
  // Set up overlay canvas for alignment guide
  if (overlayCanvas.value) {
    overlayCanvas.value.width = FIXED_WIDTH;
    overlayCanvas.value.height = FIXED_HEIGHT;
    
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
  
  // Lookup the card in Scryfall (use getCard method that exists)
  try {
    const scryfallCard = await scryfallAPI.getCard(card.setCode, card.collectorNumber);
    
    if (scryfallCard) {
      const dbCard = scryfallAPI.convertToDbCard(scryfallCard);
      
      // Add to scanned cards queue
      scannedCards.value.push({
        card: dbCard,
        confidence: card.confidence * 100,
        isFoil: false,
        quantity: 1,
        detectedAt: new Date()
      });
      
      // Visual feedback - show success state
      visualAlignmentGuide.setState('success');
      scanStatus.value = `✓ Scanned: ${dbCard.name}`;
      console.log('[Streaming] Card successfully scanned:', dbCard.name);
      
      // Pause scanning for 3 seconds to allow user to change card
      // This gives visual feedback and prevents re-scanning the same card
      streamingOCRService.updateConfig({ enableAutoCommit: false });
      
      // After 3 seconds, reset and resume scanning
      setTimeout(() => {
        // Reset the temporal fusion to clear voting history
        temporalOCRFusion.reset();
        
        // Change visual state back to detecting
        visualAlignmentGuide.setState('detecting');
        scanStatus.value = 'Ready for next card';
        
        // Re-enable auto-commit
        streamingOCRService.updateConfig({ enableAutoCommit: true });
      }, 3000);
      
      // Prevent duplicate scanning for 5 seconds
      const cardKey = `${card.setCode}/${card.collectorNumber}`;
      recentlyScanned.add(cardKey);
      setTimeout(() => recentlyScanned.delete(cardKey), 5000);
    } else {
      console.warn('[Streaming] Card not found in Scryfall:', `${card.setCode}/${card.collectorNumber}`);
      scanStatus.value = `Card not found: ${card.setCode}/${card.collectorNumber}`;
      visualAlignmentGuide.setState('error');
      
      // Reset after 2 seconds
      setTimeout(() => {
        visualAlignmentGuide.setState('detecting');
        scanStatus.value = 'Scanning...';
      }, 2000);
    }
  } catch (error) {
    console.error('[Streaming] Failed to lookup card:', error);
    scanStatus.value = 'Card lookup failed';
    visualAlignmentGuide.setState('error');
    
    // Reset after 2 seconds
    setTimeout(() => {
      visualAlignmentGuide.setState('detecting');
      scanStatus.value = 'Scanning...';
    }, 2000);
  }
}

/**
 * Update streaming status periodically
 */
var statusUpdateCounter = 0; // Use var so it's accessible in watch
function updateStreamingStatus() {
  if (!realTimeMode.value) {
    console.log('[Scanner] updateStreamingStatus stopped - realTimeMode is false');
    return;
  }
  
  streamingStatus.value = streamingOCRService.getStatus();
  
  // Remove status update logging - it's too frequent
  statusUpdateCounter++;
  
  // Update confidence display
  if (streamingStatus.value.pendingIdentification) {
    currentConfidence.value = streamingStatus.value.pendingIdentification.confidence * 100;
  }
  
  // Update debug canvases periodically from streamingROIManager
  updateDebugCanvases();
  
  requestAnimationFrame(updateStreamingStatus);
}

/**
 * Update debug canvases from streamingROIManager
 */
function updateDebugCanvases() {
  if (!debugMode.value || !realTimeMode.value) return;
  
  // Get debug canvases from streamingROIManager
  const roiCanvases = streamingROIManager.getDebugCanvases();
  
  // Preserve Vision AI capture images if they exist
  const currentDebugCanvases = new Map(debugCanvases.value);
  const visionCapture = currentDebugCanvases.get('vision_ai_capture');
  const fullCapture = currentDebugCanvases.get('full_capture');
  
  // Convert canvas elements to data URLs
  const newDebugCanvases = new Map();
  for (const [name, canvas] of roiCanvases) {
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      try {
        const dataUrl = canvas.toDataURL();
        if (dataUrl && dataUrl.length > 100) { // Valid data URL
          newDebugCanvases.set(name, dataUrl);
        }
      } catch (e) {
        // Skip invalid canvases
      }
    }
  }
  
  // Restore Vision AI captures if they exist
  if (visionCapture) {
    newDebugCanvases.set('vision_ai_capture', visionCapture);
  }
  if (fullCapture) {
    newDebugCanvases.set('full_capture', fullCapture);
  }
  
  // Only update if we have valid canvases
  if (newDebugCanvases.size > 0) {
    debugCanvases.value = newDebugCanvases;
  }
}

/**
 * Smart monitoring system - continuously checks frame quality
 */
function startSmartMonitoring() {
  if (!realTimeMode.value || !videoElement.value || !overlayCanvas.value) return;
  
  const video = videoElement.value;
  const overlay = overlayCanvas.value;
  
  // Use fixed dimensions for consistent guide positioning
  const FIXED_WIDTH = 960;
  const FIXED_HEIGHT = 540;
  overlay.width = FIXED_WIDTH;
  overlay.height = FIXED_HEIGHT;
  
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
        // Create a clean serializable object for IPC
        const cardToSave = {
          ...item.card,
          isFoil: item.isFoil,
          // Convert Date to ISO string for serialization
          scannedAt: item.detectedAt ? item.detectedAt.toISOString() : new Date().toISOString()
        };
        
        // Clean up the object for IPC serialization
        const cleanCard = JSON.parse(JSON.stringify(cardToSave, (key, value) => {
          // Remove undefined values
          if (value === undefined) return null;
          // Remove functions
          if (typeof value === 'function') return null;
          // Keep everything else
          return value;
        }));
        
        await (window as any).electronAPI.saveCard(cleanCard);
      }
    }
    
    // Refresh collection stats after adding cards
    const refreshStats = inject('refreshStats') as (() => Promise<void>) | undefined;
    if (refreshStats) {
      await refreshStats();
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
  // Check for API key first
  if (!visionApiKey.value) {
    alert('Please configure your Google Vision API key in Settings first');
    return;
  }
  
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
    // Always start streaming mode immediately
    startStreamingPipeline();
  }
}

watch(settings, () => {
  // Clear detection cache when settings change
  detectedCards.clear();
});

onMounted(async () => {
  await getCameras();
  
  // Canvas card detector doesn't need initialization
  console.log('[Scanner] Canvas card detector ready');
  console.log('[Scanner] Initial vision enabled status:', visionEnabled.value);
  
  await setupOCR();
  
  // Load Vision API key from settings
  const settings = localStorage.getItem('cardscanner-settings');
  if (settings) {
    const parsed = JSON.parse(settings);
    if (parsed.visionApiKey) {
      visionApiKey.value = parsed.visionApiKey;
      const isValid = await testVisionConnection(parsed.visionApiKey);
      visionEnabled.value = isValid;
    }
  }
  
  // Watch for settings changes
  setInterval(() => {
    const currentSettings = localStorage.getItem('cardscanner-settings');
    if (currentSettings) {
      const parsed = JSON.parse(currentSettings);
      if (parsed.visionApiKey !== visionApiKey.value) {
        visionApiKey.value = parsed.visionApiKey || '';
        if (parsed.visionApiKey) {
          testVisionConnection(parsed.visionApiKey).then(isValid => {
            visionEnabled.value = isValid;
          });
        } else {
          visionEnabled.value = false;
        }
      }
    }
  }, 1000);
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

.vision-ai-config {
  margin-top: 15px;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vision-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
}

.vision-toggle input[type="checkbox"] {
  width: 18px;
  height: 18px;
}

.api-key-input {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.api-key-field {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}

.status-ok {
  color: #4CAF50;
  font-weight: bold;
  font-size: 14px;
}

.status-error {
  color: #f44336;
  font-weight: bold;
  font-size: 14px;
}

/* Compact stability indicator in header */
.stability-indicator-compact {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 15px;
  padding: 8px 15px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 25px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.stability-bar-compact {
  width: 100px;
  height: 8px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  overflow: hidden;
}

.stability-text {
  font-size: 14px;
  font-weight: 600;
  min-width: 90px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.scan-status-text {
  margin-left: auto;
  font-size: 14px;
  color: #666;
  padding: 8px 15px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 20px;
}

/* API key warning */
.api-key-warning {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 10px 15px;
  margin-top: 10px;
  color: #856404;
  font-size: 14px;
}

.api-key-warning a {
  color: #0066cc;
  text-decoration: none;
  font-weight: 500;
}

.api-key-warning a:hover {
  text-decoration: underline;
}

/* Success checkmark overlay */
.success-checkmark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.85);
  border-radius: 20px;
  padding: 30px;
  z-index: 100;
  text-align: center;
  animation: fadeInScale 0.3s ease-out;
}

.checkmark-circle {
  margin-bottom: 15px;
}

.success-checkmark p {
  color: white;
  font-size: 16px;
  margin: 0;
  font-weight: 500;
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.scanner-content {
  display: flex;
  gap: 20px;
}

.left-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.video-container {
  position: relative;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  /* Fixed size container for consistent ROI positioning */
  width: 960px;  /* Fixed width - half of 1920 for reasonable display size */
  height: 540px; /* Fixed height - maintains 16:9 aspect ratio */
  margin: 0 auto; /* Center the container */
}

.video-container video,
.video-container canvas {
  /* Fixed size to ensure consistent ROI extraction */
  width: 960px;
  height: 540px;
  display: block;
  object-fit: cover; /* Ensures video fills container without distortion */
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

/* Removed controls-below-video - now using header controls */

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
.manual-input-compact {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  align-items: center;
}

.manual-input-compact input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.manual-input-compact button {
  padding: 8px 20px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.manual-input-compact button:hover:not(:disabled) {
  background: #45a049;
}

.manual-input-compact button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

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
  width: 400px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  flex-shrink: 0;
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

/* Debug Panel Styles */
.debug-panel {
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid #4CAF50;
  border-radius: 8px;
  padding: 10px;
  width: 100%;
}

.debug-panel h4 {
  color: white;
  margin: 0 0 10px 0;
  font-size: 14px;
  text-align: center;
}

.debug-images {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.debug-image {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 5px;
}

.debug-image .no-image {
  width: 100px;
  height: 60px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px dashed #666;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  font-size: 12px;
}

.debug-image label {
  color: white;
  font-size: 11px;
  margin-bottom: 5px;
  text-transform: uppercase;
}

.debug-image img {
  border: 1px solid #4CAF50;
  border-radius: 2px;
  max-width: 200px;
  height: auto;
  image-rendering: pixelated; /* Keep pixels sharp for OCR debug */
}

.debug-text {
  color: #4CAF50;
  font-size: 12px;
  font-family: monospace;
  margin-top: 5px;
  min-height: 16px;
  text-align: center;
}

/* ===== REDESIGNED SCAN QUEUE STYLES ===== */
/* Override old queue styles with modern design */

.scan-queue {
  background: #ffffff !important;
  border: 1px solid #e0e0e0 !important;
  border-radius: 12px !important;
  width: 360px !important;
  max-height: calc(100vh - 160px) !important;
  display: flex !important;
  flex-direction: column !important;
  flex-shrink: 0 !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  padding: 0 !important;
  overflow: visible !important;
}

.queue-header {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  padding: 14px 16px !important;
  border-bottom: 1px solid #e0e0e0 !important;
  background: #fafafa !important;
  border-radius: 12px 12px 0 0 !important;
  margin-bottom: 0 !important;
}

.queue-header h3 {
  margin: 0 !important;
  color: #333 !important;
  font-size: 15px !important;
  font-weight: 600 !important;
}

.add-all-btn {
  padding: 6px 14px !important;
  background: #4CAF50 !important;
  color: white !important;
  border: none !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  transition: all 0.2s !important;
}

.add-all-btn:hover {
  background: #45a049 !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3) !important;
}

.queue-list {
  flex: 1 !important;
  overflow-y: auto !important;
  padding: 8px !important;
  max-height: none !important;
}

.queue-list::-webkit-scrollbar {
  width: 6px !important;
}

.queue-list::-webkit-scrollbar-thumb {
  background: #ddd !important;
  border-radius: 3px !important;
}

.queue-card {
  background: white !important;
  border: 1px solid #e8e8e8 !important;
  border-radius: 8px !important;
  padding: 8px !important;
  margin-bottom: 6px !important;
  display: flex !important;
  gap: 10px !important;
  align-items: center !important;
  transition: all 0.2s !important;
}

.queue-card:hover {
  border-color: #4CAF50 !important;
  box-shadow: 0 2px 6px rgba(76, 175, 80, 0.15) !important;
}

.card-thumbnail {
  width: 46px !important;
  height: 64px !important;
  object-fit: cover !important;
  border-radius: 4px !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important;
}

.queue-card .card-info {
  flex: 1 !important;
  min-width: 0 !important;
}

.queue-card .card-name {
  font-weight: 600 !important;
  font-size: 13px !important;
  color: #2c3e50 !important;
  margin-bottom: 2px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.card-set {
  font-size: 11px !important;
  color: #7f8c8d !important;
  margin-bottom: 2px !important;
}

.card-price {
  font-size: 12px !important;
  color: #27ae60 !important;
  font-weight: 600 !important;
}

.card-controls {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  align-items: flex-end !important;
}

.queue-card .remove-btn {
  width: 20px !important;
  height: 20px !important;
  border-radius: 50% !important;
  border: none !important;
  background: #f5f5f5 !important;
  color: #999 !important;
  cursor: pointer !important;
  font-size: 16px !important;
  line-height: 1 !important;
  padding: 0 !important;
  transition: all 0.2s !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.queue-card .remove-btn:hover {
  background: #ff5252 !important;
  color: white !important;
}

.quantity-control {
  display: flex !important;
  align-items: center !important;
  gap: 2px !important;
  background: #f5f5f5 !important;
  border-radius: 20px !important;
  padding: 2px !important;
}

.qty-btn {
  width: 18px !important;
  height: 18px !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer !important;
  font-size: 11px !important;
  color: #666 !important;
  border-radius: 50% !important;
  transition: background 0.2s !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.qty-btn:hover {
  background: rgba(0, 0, 0, 0.1) !important;
}

.qty-display {
  min-width: 16px !important;
  text-align: center !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #333 !important;
}

.foil-checkbox {
  position: relative !important;
  cursor: pointer !important;
  width: 22px !important;
  height: 22px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #f5f5f5 !important;
  border-radius: 50% !important;
  transition: all 0.2s !important;
}

.foil-checkbox input {
  position: absolute !important;
  opacity: 0 !important;
  cursor: pointer !important;
}

.foil-checkbox span {
  font-size: 12px !important;
  opacity: 0.3 !important;
  transition: all 0.2s !important;
}

.foil-checkbox.checked {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
}

.foil-checkbox.checked span {
  opacity: 1 !important;
}

.queue-footer {
  padding: 10px 16px !important;
  border-top: 1px solid #e0e0e0 !important;
  display: flex !important;
  justify-content: center !important;
  background: #fafafa !important;
  border-radius: 0 0 12px 12px !important;
  margin-top: 0 !important;
}

.clear-queue-btn {
  padding: 5px 14px !important;
  background: white !important;
  color: #666 !important;
  border: 1px solid #e0e0e0 !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  transition: all 0.2s !important;
}

.clear-queue-btn:hover {
  background: #ff5252 !important;
  color: white !important;
  border-color: #ff5252 !important;
}
</style>