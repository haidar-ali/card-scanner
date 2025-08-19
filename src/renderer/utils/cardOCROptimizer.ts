// Specialized OCR optimization for Magic: The Gathering cards

export interface OCRStrategy {
  name: string;
  preprocess: (imageData: ImageData) => ImageData;
  confidence: number;
  lastResult?: string;
}

// Known Magic set codes (3-4 letter codes)
const KNOWN_SET_CODES = [
  'NEO', 'DMU', 'BRO', 'ONE', 'MOM', 'MAT', 'WOE', 'LCI', 'MKM', 'OTJ', 'BLB',
  'DSK', 'FDN', 'AFR', 'MID', 'VOW', 'SNC', 'CLB', 'DMC', '2X2', 'UNF', 'BRC',
  'J21', 'J22', 'STA', 'MYS', 'KHM', 'STX', 'MH2', 'MH3', 'CMM', 'CMD', 'C21',
  'ZNR', 'IKO', 'THB', 'ELD', 'M21', 'M20', 'WAR', 'RNA', 'GRN', 'DOM', 'RIX',
  'XLN', 'HOU', 'AKH', 'AER', 'KLD', 'EMN', 'SOI', 'OGW', 'BFZ',
  // Commander sets
  'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20', 'C21', 'C22', 'C23',
  'CM1', 'CM2', 'CNS', 'CN2', 'CMR', 'CMA', 'CMD', 'CMC'
];

export function createOCRStrategies(): OCRStrategy[] {
  return [
    {
      name: 'raw-grayscale',
      preprocess: (imageData) => applyGrayscaleOnly(imageData),
      confidence: 0
    },
    {
      name: 'high-contrast-black',
      preprocess: (imageData) => applyHighContrastBlack(imageData),
      confidence: 0
    },
    {
      name: 'high-contrast-white',
      preprocess: (imageData) => applyHighContrastWhite(imageData),
      confidence: 0
    },
    {
      name: 'adaptive-threshold',
      preprocess: (imageData) => applyAdaptiveThreshold(imageData),
      confidence: 0
    }
  ];
}

function applyGrayscaleOnly(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

function applyHighContrastWhite(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Optimize for white text on dark background
    const value = gray > 128 ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

function applyHighContrastBlack(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Optimize for black text on light background
    const value = gray < 128 ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

function applyEdgeEnhancement(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;
  const output = new Uint8ClampedArray(data);
  
  // Sobel edge detection kernel
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let pixelX = 0;
      let pixelY = 0;
      
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const idx = ((y + j) * width + (x + i)) * 4;
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const kernelIdx = (j + 1) * 3 + (i + 1);
          pixelX += gray * sobelX[kernelIdx];
          pixelY += gray * sobelY[kernelIdx];
        }
      }
      
      const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
      const value = magnitude > 50 ? 0 : 255; // Invert for text
      const idx = (y * width + x) * 4;
      output[idx] = output[idx + 1] = output[idx + 2] = value;
    }
  }
  
  return new ImageData(output, width, height);
}

function applyAdaptiveThreshold(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;
  const output = new Uint8ClampedArray(data);
  
  // Convert to grayscale first
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  
  // Apply adaptive threshold with local mean
  const windowSize = 15;
  const offset = Math.floor(windowSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      for (let wy = Math.max(0, y - offset); wy <= Math.min(height - 1, y + offset); wy++) {
        for (let wx = Math.max(0, x - offset); wx <= Math.min(width - 1, x + offset); wx++) {
          sum += gray[wy * width + wx];
          count++;
        }
      }
      
      const mean = sum / count;
      const idx = y * width + x;
      const value = gray[idx] > mean - 10 ? 255 : 0;
      
      const pixelIdx = idx * 4;
      output[pixelIdx] = output[pixelIdx + 1] = output[pixelIdx + 2] = value;
      output[pixelIdx + 3] = 255;
    }
  }
  
  return new ImageData(output, width, height);
}

export function validateSetCode(code: string): boolean {
  // Check if it's a known set code
  const upperCode = code.toUpperCase();
  return KNOWN_SET_CODES.includes(upperCode) || 
         // Allow some flexibility for new sets
         (upperCode.length >= 3 && upperCode.length <= 4 && /^[A-Z0-9]+$/.test(upperCode));
}

export function extractMagicCardInfo(text: string): { setCode: string; cardNumber: string } | null {
  console.log('[Card OCR] Analyzing text:', text);
  
  // Look for the specific pattern: "170/351 R\nC16 EN"
  // Priority patterns for Magic card bottom text
  const highPriorityPatterns = [
    // Number/Total Rarity on one line, set code on next: "170/351 R\nC16"
    /(\d{1,3})\s*\/\s*\d{1,3}\s*[RUCMrucm]?[\s\S]*?\b([C]?\d{0,2}[A-Z]{2,4})\s*(?:EN|en)?/gi,
    // Look for C16 pattern specifically (Commander sets)
    /(\d{1,3})\s*\/\s*\d{1,3}[\s\S]*?\b(C[\dl]\d{1,2})\b/gi,
    // Standard pattern with line break
    /(\d{1,3})\s*\/\s*\d{1,3}\s*[RUCMrucm]?\s*\n\s*([A-Z0-9]{3,4})\b/gi,
  ];
  
  // Try high priority patterns first
  for (const pattern of highPriorityPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const cardNumber = match[1];
      let setCode = match[2].toUpperCase();
      
      // Fix common OCR mistakes
      setCode = setCode.replace(/^CL(\d+)/, 'C$1'); // Cl16 -> C16
      setCode = setCode.replace(/^CI(\d+)/, 'C$1'); // CI16 -> C16
      
      // Validate it's a reasonable card number and known set
      const cardNum = parseInt(cardNumber);
      if (cardNum > 0 && cardNum <= 500) {
        if (KNOWN_SET_CODES.includes(setCode)) {
          console.log(`[Card OCR] Found high priority match: ${setCode} #${cardNumber}`);
          return { setCode, cardNumber: cardNumber.replace(/^0+/, '') };
        }
      }
    }
  }
  
  // Fallback to finding individual components
  const numberPattern = /(\d{1,3})\s*(?:\/\s*\d{1,3})?\s*[RUCMrucm]?\b/g;
  const numberMatches = [...text.matchAll(numberPattern)];
  
  // Look for set codes - they're usually 3 capital letters, sometimes 4
  // But avoid common words that appear in card text
  const setPattern = /\b([A-Z0-9]{3,4})\b(?!\s+(?:the|for|and|put|onto|your|each|may|way|hen|who|can|has|get|was|are)\b)/gi;
  const setMatches = [...text.matchAll(setPattern)];
  
  // Also look for patterns where set and number are close together
  const combinedPatterns = [
    // Set code with bullet/dot separator: "NEO • EN"
    /\b([A-Z]{3,4})\s*[·•]\s*[A-Z]{2}\b/gi,
    // Set code alone on a line
    /^([A-Z]{3,4})$/gm,
    // Number then set: "234 NEO"
    /(\d{1,3})\s+([A-Z]{3,4})\b/gi,
    // Set then number: "NEO 234"
    /\b([A-Z]{3,4})\s+(\d{1,3})\b/gi,
  ];
  
  const candidates: Array<{ setCode: string; cardNumber: string; score: number }> = [];
  
  // Process combined patterns first (higher priority)
  for (const pattern of combinedPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      let setCode: string, cardNumber: string;
      
      // Check if first capture is a number or set code
      if (/^\d/.test(match[1])) {
        cardNumber = match[1];
        setCode = match[2] || '';
      } else {
        setCode = match[1];
        cardNumber = match[2] || '';
      }
      
      // If we only got set code from this pattern, try to find the number
      if (setCode && !cardNumber && numberMatches.length > 0) {
        cardNumber = numberMatches[0][1];
      }
      
      if (setCode && cardNumber) {
        setCode = setCode.toUpperCase().trim();
        
        // Fix common OCR mistakes
        setCode = setCode.replace(/^CL(\d+)/, 'C$1'); // Cl16 -> C16
        setCode = setCode.replace(/^CI(\d+)/, 'C$1'); // CI16 -> C16
        
        cardNumber = cardNumber.replace(/^0+/, '');
        
        // Score based on known set codes and reasonable card numbers
        let score = 0;
        if (KNOWN_SET_CODES.includes(setCode)) score += 10;
        if (setCode.length === 3) score += 3;
        if (parseInt(cardNumber) <= 400 && parseInt(cardNumber) >= 1) score += 2;
        
        candidates.push({ setCode, cardNumber, score });
      }
    }
  }
  
  // If no combined patterns worked, try to piece together from individual matches
  if (candidates.length === 0 && setMatches.length > 0 && numberMatches.length > 0) {
    // Get the most likely number (usually the first one that looks like a collector number)
    let bestNumber = '';
    for (const numMatch of numberMatches) {
      const num = parseInt(numMatch[1]);
      if (num >= 1 && num <= 500) {
        bestNumber = numMatch[1];
        break;
      }
    }
    
    if (bestNumber) {
      for (const setMatch of setMatches) {
        let setCode = setMatch[1].toUpperCase();
        
        // Fix common OCR mistakes
        setCode = setCode.replace(/^CL(\d+)/, 'C$1'); // Cl16 -> C16
        setCode = setCode.replace(/^CI(\d+)/, 'C$1'); // CI16 -> C16
        
        if (KNOWN_SET_CODES.includes(setCode)) {
          const cardNumber = bestNumber.replace(/^0+/, '');
          candidates.push({ setCode, cardNumber, score: 8 });
        } else if (setCode.match(/^C\d{2}$/)) {
          // Commander set pattern
          const cardNumber = bestNumber.replace(/^0+/, '');
          candidates.push({ setCode, cardNumber, score: 6 });
        }
      }
    }
  }
  
  // Return best candidate
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    console.log(`[Card OCR] Best match: ${best.setCode} #${best.cardNumber} (score: ${best.score})`);
    return { setCode: best.setCode, cardNumber: best.cardNumber };
  }
  
  console.log('[Card OCR] No valid card info found');
  return null;
}

// Auto-focus helper
export function calculateFocusScore(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // If image is too small, skip focus check
  if (width < 100 || height < 50) {
    return 100; // Assume focused for small regions
  }
  
  let variance = 0;
  let mean = 0;
  let count = 0;
  
  // Calculate Laplacian variance (measure of focus)
  // Sample every few pixels for performance
  const step = Math.max(1, Math.floor(Math.min(width, height) / 50));
  
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const idx = (y * width + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      
      // Simplified gradient calculation
      const rightIdx = ((y * width + (x + step)) * 4);
      const bottomIdx = (((y + step) * width + x) * 4);
      
      const grayRight = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
      const grayBottom = 0.299 * data[bottomIdx] + 0.587 * data[bottomIdx + 1] + 0.114 * data[bottomIdx + 2];
      
      const gradX = Math.abs(gray - grayRight);
      const gradY = Math.abs(gray - grayBottom);
      const gradient = gradX + gradY;
      
      mean += gradient;
      variance += gradient * gradient;
      count++;
    }
  }
  
  if (count === 0) return 100; // Default to focused if no pixels processed
  
  mean /= count;
  variance = variance / count - mean * mean;
  
  // Scale the variance for better interpretation
  return Math.sqrt(variance) * 10; // Higher value = better focus
}