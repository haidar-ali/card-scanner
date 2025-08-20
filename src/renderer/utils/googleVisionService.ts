/**
 * Google Vision AI Service for MTG Card Text Extraction
 * Provides high-accuracy OCR using Google Vision API
 */

interface VisionResult {
  collector_number?: string;
  set_code?: string;
  confidence: number;
  raw_text?: string;
  error?: string;
}

export class GoogleVisionService {
  private apiKey: string;
  private apiUrl = 'https://vision.googleapis.com/v1/images:annotate';
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  /**
   * Extract collector number and set code from MTG card image
   */
  async extractCardInfo(canvas: HTMLCanvasElement): Promise<VisionResult> {
    try {
      console.log('[VisionAI] Starting card text extraction...');
      
      // Convert canvas to base64
      const imageBase64 = this.canvasToBase64(canvas);
      
      // Prepare Vision API request
      const requestBody = {
        requests: [{
          image: {
            content: imageBase64
          },
          features: [{
            type: 'TEXT_DETECTION',
            maxResults: 1
          }]
        }]
      };
      
      // Call Vision API
      const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`Vision API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.responses?.[0]?.error) {
        throw new Error(`Vision API error: ${data.responses[0].error.message}`);
      }
      
      const textAnnotations = data.responses?.[0]?.textAnnotations;
      if (!textAnnotations || textAnnotations.length === 0) {
        console.warn('[VisionAI] No text detected in image');
        return { confidence: 0, error: 'No text detected' };
      }
      
      // Get full detected text
      const fullText = textAnnotations[0].description || '';
      console.log('[VisionAI] Detected text (full):', fullText);
      console.log('[VisionAI] Text length:', fullText.length, 'characters');
      
      // Extract MTG card information
      const result = this.parseCardInfo(fullText);
      
      console.log('[VisionAI] Extracted info:', result);
      
      return {
        ...result,
        raw_text: fullText,
        confidence: result.collector_number && result.set_code ? 0.95 : 0.5
      };
      
    } catch (error) {
      console.error('[VisionAI] Extraction failed:', error);
      return {
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Parse MTG card information from detected text
   * Vision AI gets the full rectified card image, so we can be more precise about layout
   */
  private parseCardInfo(text: string): Pick<VisionResult, 'collector_number' | 'set_code'> {
    const result: Pick<VisionResult, 'collector_number' | 'set_code'> = {};
    
    // Extract collector number - two main patterns:
    // Pattern 1: Letter (C/U/R/M) + Number (e.g., "R 0033") → Use "R 33" (remove leading zeros)
    // Pattern 2: Number/Total + Letter (e.g., "204/205 R") → Use just "204" (number before slash)
    // Also handle: # prefix (e.g., "#0033")
    // IMPORTANT: Must have 3+ digits in total to avoid matching power/toughness like "7/4"
    
    // Try Pattern 2 first: Number/Total + Letter (e.g., "204/205 R", "130/205 R")
    // Both numbers should be 1-4 digits, and total should typically be 3+ digits to be a collector number
    const slashLetterPattern = /(\d{1,4})\/(\d{2,4})\s*([CURM])/g;
    const slashLetterMatches = [...text.matchAll(slashLetterPattern)];
    
    if (slashLetterMatches.length > 0) {
      // For multiple matches, prefer the one that appears later in the text (likely bottom of card)
      const bestMatch = slashLetterMatches[slashLetterMatches.length - 1];
      // Use only the number before the slash and remove leading zeros
      const numberBeforeSlash = bestMatch[1];
      result.collector_number = String(parseInt(numberBeforeSlash, 10));
      console.log('[VisionAI] Found collector number (slash format):', bestMatch[0], '-> using:', result.collector_number);
    } else {
      // Try Pattern 1: Letter + Number (e.g., "R 0033", "U 123")
      const letterNumberPattern = /\b([CURM])\s*(\d{1,4})\b/g;
      const letterMatches = [...text.matchAll(letterNumberPattern)];
      
      if (letterMatches.length > 0) {
        const letter = letterMatches[0][1];
        const number = letterMatches[0][2];
        // Remove leading zeros from the number and return just the number (no rarity letter for API)
        const cleanedNumber = String(parseInt(number, 10));
        result.collector_number = cleanedNumber;
        console.log('[VisionAI] Found collector number (letter format):', letterMatches[0][0], '-> cleaned:', cleanedNumber, '(removed rarity letter for API)');
      } else {
        // Try with # prefix (e.g., "#0033")
        const hashPattern = /#(\d{1,4})/g;
        const hashMatches = [...text.matchAll(hashPattern)];
        
        if (hashMatches.length > 0) {
          // Remove leading zeros for the API
          const number = hashMatches[0][1];
          result.collector_number = String(parseInt(number, 10));
          console.log('[VisionAI] Found collector number (# format):', '#' + hashMatches[0][1], '-> cleaned:', result.collector_number);
        } else {
          // Fallback: Try standalone 3-4 digit number at bottom of card
          const numberOnlyPattern = /\b(\d{3,4})\b/g;
          const numberMatches = [...text.matchAll(numberOnlyPattern)];
          
          // Filter out year (2004) and take appropriate number
          const validNumbers = numberMatches
            .map(m => m[0])
            .filter(n => n !== '2004' && n !== '2003' && n !== '2002' && n !== '2001'); // Filter out copyright years
          
          if (validNumbers.length > 0) {
            // Remove leading zeros for the API
            result.collector_number = String(parseInt(validNumbers[0], 10));
            console.log('[VisionAI] Found collector number (number only):', validNumbers[0], '-> cleaned:', result.collector_number);
          }
        }
      }
    }
    
    // Extract set code (2-4 letter uppercase codes, common MTG patterns)
    // Set codes appear right before language codes (EN or FR)
    // Pattern: SETCODE-LANGUAGE (e.g., "EMN-EN", "M3C-FR")
    // Also handle spaces: "EMN EN", "M3C FR"
    const setWithLanguagePattern = /\b([A-Z0-9]{2,4})[\s-](EN|FR)\b/g;
    const setLangMatches = [...text.matchAll(setWithLanguagePattern)];
    
    if (setLangMatches.length > 0) {
      // If we found a set code right before a language code, use it
      result.set_code = setLangMatches[0][1]; // Get the set code part (before EN/FR)
      console.log('[VisionAI] Found set code with language pattern:', setLangMatches[0][0], '-> using:', result.set_code);
    } else {
      // Fallback: look for set codes using the old pattern
      const setPattern = /\b[A-Z0-9]{2,4}\b/g;
      const setMatches = [...text.matchAll(setPattern)];
      
      if (setMatches.length > 0) {
        // Filter out common false positives (English words and language codes)
        const commonWords = ['THE', 'AND', 'FOR', 'YOU', 'ARE', 'NOT', 'BUT', 'CAN', 
                            'OF', 'TO', 'IN', 'IT', 'IS', 'BE', 'AS', 'AT', 'SO', 'WE', 
                            'HE', 'BY', 'OR', 'ON', 'DO', 'IF', 'ME', 'MY', 'UP', 'AN', 
                            'GO', 'NO', 'US', 'AM', 'END', 'EN', 'FR', 'DE', 'ES', 'IT', 
                            'PT', 'JP', 'CN', 'KR', 'RU', 'TM']; // Added TM to avoid trademark
      
        // Look for set codes near the collector number
        const lines = text.split('\n');
        
        // Find the line with the collector number if we found one
        let collectorLine = -1;
        if (result.collector_number) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('#' + result.collector_number) || 
                lines[i].includes('#00' + result.collector_number) || 
                lines[i].includes('#0' + result.collector_number)) {
              collectorLine = i;
              break;
            }
          }
        }
        
        // Look for set code on the same line or nearby lines as collector number
        if (collectorLine >= 0) {
          // Check same line and next line
          const nearbyText = lines.slice(collectorLine, Math.min(collectorLine + 2, lines.length)).join(' ');
          const nearbyMatches = [...nearbyText.matchAll(setPattern)];
          const validNearbySets = nearbyMatches
            .map(match => match[0])
            .filter(code => !commonWords.includes(code.toUpperCase()) && 
                           code.match(/[A-Z]/) && // Must have at least one letter
                           code !== result.collector_number); // Don't match the collector number
          
          if (validNearbySets.length > 0) {
            // Prefer codes with mix of letters and numbers (like M3C)
            const alphanumericCodes = validNearbySets.filter(code => /[A-Z]/.test(code) && /\d/.test(code));
            result.set_code = alphanumericCodes.length > 0 ? alphanumericCodes[0] : validNearbySets[0];
            console.log('[VisionAI] Found set code near collector number:', result.set_code);
          }
        }
        
        // If no set code found near collector number, search bottom of card
        if (!result.set_code) {
          const bottomLines = lines.slice(-3).join(' '); // Last 3 lines
          const bottomMatches = [...bottomLines.matchAll(setPattern)];
          const validBottomSets = bottomMatches
            .map(match => match[0])
            .filter(code => !commonWords.includes(code.toUpperCase()) && 
                           code.match(/[A-Z]/)); // Must have at least one letter
          
          if (validBottomSets.length > 0) {
            // Prefer codes with mix of letters and numbers (like M3C)
            const alphanumericCodes = validBottomSets.filter(code => /[A-Z]/.test(code) && /\d/.test(code));
            result.set_code = alphanumericCodes.length > 0 ? alphanumericCodes[0] : validBottomSets[0];
            console.log('[VisionAI] Found set code in bottom area:', result.set_code);
          }
        }
      }
    }
    
    // Enhanced set code extraction if we have collector number
    if (result.collector_number && !result.set_code) {
      // Look for set codes in the same line or nearby lines as collector number
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes(result.collector_number)) {
          const lineSetMatch = line.match(/\b[A-Z]{3}\b/);
          if (lineSetMatch) {
            result.set_code = lineSetMatch[0];
            console.log('[VisionAI] Found set code in collector line:', result.set_code);
            break;
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * Convert canvas to base64 string for Vision API
   */
  private canvasToBase64(canvas: HTMLCanvasElement): string {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    return dataUrl.split(',')[1]; // Remove data:image/jpeg;base64, prefix
  }
  
  /**
   * Test if API key is valid
   */
  async testConnection(): Promise<boolean> {
    try {
      // Create a small test canvas
      const testCanvas = document.createElement('canvas');
      testCanvas.width = 100;
      testCanvas.height = 100;
      const ctx = testCanvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = 'black';
      ctx.font = '20px Arial';
      ctx.fillText('TEST', 20, 50);
      
      const result = await this.extractCardInfo(testCanvas);
      return !result.error;
    } catch (error) {
      console.error('[VisionAI] Connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance for the app
let visionService: GoogleVisionService | null = null;

export function getVisionService(apiKey?: string): GoogleVisionService {
  if (!visionService && apiKey) {
    visionService = new GoogleVisionService(apiKey);
  } else if (!visionService) {
    throw new Error('Vision service not initialized. Provide API key first.');
  }
  return visionService;
}

export function setVisionApiKey(apiKey: string): void {
  visionService = new GoogleVisionService(apiKey);
}