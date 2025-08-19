import { OCREngine } from 'tesseract-wasm';

let ocrEngine: OCREngine | null = null;

interface OCRMessage {
  type: 'init' | 'process';
  imageData?: ImageData;
  config?: {
    lang?: string;
  };
}

interface OCRResult {
  text: string;
  confidence: number;
  lines: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
}

async function initializeOCR(lang = 'eng') {
  if (ocrEngine) {
    ocrEngine.destroy();
  }

  ocrEngine = new OCREngine();
  
  // Load WASM binary from CDN
  const wasmResponse = await fetch('https://unpkg.com/tesseract-wasm@0.10.0/dist/tesseract-core.wasm');
  const wasmBinary = await wasmResponse.arrayBuffer();
  await ocrEngine.loadWasmBinary(wasmBinary);
  
  // Load language model
  const modelUrl = `https://unpkg.com/tesseract-wasm@0.10.0/dist/tessdata/${lang}.traineddata`;
  const response = await fetch(modelUrl);
  const languageData = await response.arrayBuffer();
  
  await ocrEngine.loadLanguage(lang, new Uint8Array(languageData));
  await ocrEngine.initialize(lang);
  
  postMessage({ type: 'initialized' });
}

async function processImage(imageData: ImageData): Promise<OCRResult> {
  if (!ocrEngine) {
    throw new Error('OCR Engine not initialized');
  }

  // Set image for processing
  ocrEngine.setImage(imageData);
  
  // Get text and confidence
  const text = ocrEngine.getText().trim();
  const confidence = ocrEngine.getMeanTextConfidence();
  
  // Get line-level details
  const lines: OCRResult['lines'] = [];
  const lineBoxes = ocrEngine.getTextLines();
  
  for (const line of lineBoxes) {
    lines.push({
      text: line.text,
      confidence: line.confidence,
      bbox: line.bbox
    });
  }
  
  return {
    text,
    confidence,
    lines
  };
}

// Handle messages from main thread
self.addEventListener('message', async (event: MessageEvent<OCRMessage>) => {
  const { type, imageData, config } = event.data;
  
  try {
    switch (type) {
      case 'init':
        await initializeOCR(config?.lang || 'eng');
        break;
        
      case 'process':
        if (!imageData) {
          throw new Error('No image data provided');
        }
        const result = await processImage(imageData);
        postMessage({ type: 'result', data: result });
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Cleanup on worker termination
self.addEventListener('unload', () => {
  if (ocrEngine) {
    ocrEngine.destroy();
  }
});