import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;
let isInitialized = false;

export async function initializeOCR(): Promise<void> {
  if (isInitialized && worker) return;
  
  console.log('[OCR] Starting initialization with Tesseract.js...');
  
  try {
    // According to Context7 docs, createWorker now takes language as first param
    // createWorker(langs?: string | string[], oem?: number, options?: object)
    worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        // Only log important status changes, not every percentage
        if (m.status && !m.status.includes('recognizing text')) {
          console.log('[OCR]', m.status);
        }
      }
    });
    
    console.log('[OCR] Setting parameters...');
    
    // Optimize for speed over accuracy for real-time scanning
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/#- ',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '0',
    });
    
    isInitialized = true;
    console.log('[OCR] Initialization complete');
  } catch (error) {
    console.error('[OCR] Failed to initialize:', error);
    throw error;
  }
}

export async function processImageData(imageData: ImageData): Promise<{
  text: string;
  confidence: number;
}> {
  console.log('[OCR] Processing image data:', { width: imageData.width, height: imageData.height });
  
  if (!isInitialized || !worker) {
    console.log('[OCR] Not initialized, initializing now...');
    await initializeOCR();
  }
  
  try {
    // Convert ImageData to canvas for Tesseract
    console.log('[OCR] Creating canvas for processing...');
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to get canvas context');
    
    ctx.putImageData(imageData, 0, 0);
    
    // Process with Tesseract
    console.log('[OCR] Running recognition...');
    const { data } = await worker!.recognize(canvas);
    
    const text = data.text.trim();
    const confidence = data.confidence / 100;
    
    console.log('[OCR] Extracted text:', text);
    console.log('[OCR] Confidence:', confidence);
    
    // Also log any words found for debugging
    if (data.words && data.words.length > 0) {
      console.log('[OCR] Words found:', data.words.map(w => w.text).join(' | '));
    }
    
    return {
      text,
      confidence
    };
  } catch (error) {
    console.error('[OCR] Processing error:', error);
    return {
      text: '',
      confidence: 0
    };
  }
}

export function destroyOCR(): void {
  if (worker) {
    console.log('[OCR] Terminating worker...');
    worker.terminate();
    worker = null;
    isInitialized = false;
  }
}