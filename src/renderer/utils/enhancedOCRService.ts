/**
 * Enhanced OCR Service with Multi-Strategy Processing
 * Combines advanced preprocessing with optimized Tesseract.js configuration
 */

import Tesseract from 'tesseract.js';
import { advancedImageProcessor, type PreprocessingConfig, type ProcessingResult } from './advancedImageProcessor';
import { magicCardProcessor, type MagicCardResult } from './magicCardProcessor';
import { simplePreprocessor } from './simplePreprocessor';

export interface OCRConfig {
  // Tesseract configuration
  lang: string;
  oem: number;
  psm: number;
  tesseditCharWhitelist?: string;
  tesseditPagesegMode?: number;
  preserveInterwordSpaces?: number;
  
  // Custom OCR settings
  minConfidence: number;
  maxRetries: number;
  strategies: PreprocessingConfig[];
  useConsensus: boolean;
}

export interface OCRResult {
  text: string;
  confidence: number;
  cardNumber?: string;
  totalCards?: string;
  setCode?: string;
  success: boolean;
  strategy?: string;
  metadata?: {
    allResults?: OCRAttempt[];
    consensusDetails?: ConsensusResult;
    processingTime: number;
  };
}

interface OCRAttempt {
  text: string;
  confidence: number;
  strategy: string;
  cardInfo?: {
    cardNumber?: string;
    totalCards?: string;
    setCode?: string;
  };
}

interface ConsensusResult {
  cardNumber?: { value: string; votes: number; confidence: number };
  setCode?: { value: string; votes: number; confidence: number };
  totalVotes: number;
}

export class EnhancedOCRService {
  private worker: Tesseract.Worker | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // Default configurations for different card types
  private static readonly CARD_CONFIGS: Record<string, OCRConfig> = {
    'magic-card': {
      lang: 'eng',
      oem: 1, // LSTM OCR Engine Mode
      psm: 6, // Single uniform block - better for Magic card text blocks
      tesseditCharWhitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ •·-',
      tesseditPagesegMode: 6,
      preserveInterwordSpaces: 1,
      minConfidence: 0.4, // Lower threshold for testing
      maxRetries: 4, // Try more attempts
      strategies: [
        { strategy: 'card-optimized' },
        { strategy: 'high-contrast' },
        { strategy: 'adaptive' },
        { strategy: 'multi-stage' }
      ],
      useConsensus: true
    },
    'smart-realtime': {
      // Optimized for speed - fewer strategies since we run multiple parallel scans
      lang: 'eng',
      oem: 1,
      psm: 6,
      tesseditCharWhitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ •·-',
      tesseditPagesegMode: 6,
      preserveInterwordSpaces: 1,
      minConfidence: 0.2, // Much lower threshold - we trust frame quality validation
      maxRetries: 3, // Fewer retries for speed
      strategies: [
        { strategy: 'high-contrast' }, // This seems to work best based on logs
        { strategy: 'adaptive' },       // Good second option
        { strategy: 'card-optimized' }  // Fallback
        // Skip multi-stage since it's redundant and slow
      ],
      useConsensus: true
    },
    'fast-scan': {
      // Legacy config - kept for backward compatibility
      lang: 'eng',
      oem: 1,
      psm: 8,
      tesseditCharWhitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ •·-',
      minConfidence: 0.3,
      maxRetries: 3,
      strategies: [
        { strategy: 'simple-minimal' },
        { strategy: 'simple-balanced' },
        { strategy: 'simple-enhanced' }
      ],
      useConsensus: true
    }
  };

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Return existing initialization promise if already in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      console.log('[EnhancedOCR] Starting Tesseract worker initialization...');
      
      // Add timeout to prevent hanging
      const initPromise = this.initializeTesseract();
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Tesseract initialization timeout')), 15000);
      });

      await Promise.race([initPromise, timeoutPromise]);
      
      this.isInitialized = true;
      console.log('[EnhancedOCR] Initialized successfully');
    } catch (error) {
      console.error('[EnhancedOCR] Initialization failed:', error);
      this.initializationPromise = null; // Reset so we can retry
      throw error;
    }
  }

  private async initializeTesseract(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[EnhancedOCR] Creating Tesseract worker...');
      
      // Use setTimeout to ensure this runs asynchronously
      setTimeout(async () => {
        try {
          // Create worker with minimal logging to avoid blocking
          this.worker = await Tesseract.createWorker('eng', 1, {
            logger: (m) => {
              // Only log major steps
              if (m.status === 'loading tesseract core' || 
                  m.status === 'initializing tesseract' || 
                  m.status === 'loading language traineddata') {
                console.log(`[EnhancedOCR] ${m.status}: ${Math.round(m.progress * 100)}%`);
              }
            }
          });

          console.log('[EnhancedOCR] Worker created, setting parameters...');

          await this.worker.setParameters({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '7'
          });

          console.log('[EnhancedOCR] Parameters set');
          resolve();
        } catch (error) {
          console.error('[EnhancedOCR] Tesseract initialization error:', error);
          reject(error);
        }
      }, 0); // Let current execution stack complete first
    });
  }

  async scanCard(
    canvas: HTMLCanvasElement,
    configType: keyof typeof EnhancedOCRService.CARD_CONFIGS = 'magic-card'
  ): Promise<OCRResult> {
    // Lazy initialization - only initialize when actually needed
    if (!this.isInitialized) {
      console.log('[EnhancedOCR] Lazy initializing on first scan...');
      await this.initialize();
    }

    const config = EnhancedOCRService.CARD_CONFIGS[configType];
    const startTime = Date.now();
    const attempts: OCRAttempt[] = [];

    try {
      // Step 0: Try specialized Magic card processor first
      console.log('[EnhancedOCR] Trying specialized Magic card processor...');
      const magicResults = await magicCardProcessor.processCardInfo(canvas);
      
      for (const magicResult of magicResults) {
        try {
          const ocrResult = await this.performOCR(magicResult.canvas, config);
          console.log(`[EnhancedOCR] Magic processor result: "${ocrResult.text}" (${(ocrResult.confidence * 100).toFixed(1)}%)`);
          
          if (ocrResult.confidence > 0.3) {
            const cardInfo = this.extractCardInfo(ocrResult.text);
            attempts.push({
              text: ocrResult.text,
              confidence: ocrResult.confidence,
              strategy: 'magic-card-specialized',
              cardInfo
            });
          }
        } catch (error) {
          console.warn('[EnhancedOCR] Magic processor failed:', error);
        }
      }
      
      // Step 1: Apply multiple preprocessing strategies IN PARALLEL for speed
      console.log(`[EnhancedOCR] Processing ${config.strategies.length} strategies in parallel:`, config.strategies.map(s => s.strategy));
      
      // Process all strategies in parallel
      const preprocessingPromises = config.strategies.map(async (strategyConfig) => {
        try {
          // Use simple preprocessor for fast-scan strategies
          if (strategyConfig.strategy.startsWith('simple-')) {
            let processedCanvas: HTMLCanvasElement;
            switch (strategyConfig.strategy) {
              case 'simple-minimal':
                processedCanvas = simplePreprocessor.processMinimal(canvas);
                break;
              case 'simple-balanced':
                processedCanvas = simplePreprocessor.processBalanced(canvas);
                break;
              case 'simple-enhanced':
                processedCanvas = simplePreprocessor.processEnhanced(canvas);
                break;
              default:
                processedCanvas = canvas;
            }
            
            return [{
              canvas: processedCanvas,
              confidence: 0.5,
              strategy: strategyConfig.strategy,
              metadata: {
                originalSize: { width: canvas.width, height: canvas.height },
                processedSize: { width: processedCanvas.width, height: processedCanvas.height },
                operations: [strategyConfig.strategy]
              }
            }];
          } else {
            // Use advanced processor for other strategies
            const results = await advancedImageProcessor.processImage(canvas, strategyConfig);
            console.log(`[EnhancedOCR] Strategy ${strategyConfig.strategy} completed with ${results.length} result(s)`);
            return results;
          }
        } catch (error) {
          console.warn(`[EnhancedOCR] Strategy ${strategyConfig.strategy} failed:`, error);
          return [];
        }
      });
      
      // Wait for all preprocessing to complete
      const allResults = await Promise.all(preprocessingPromises);
      const preprocessingResults = allResults.flat();

      // Step 2: Sort by processing quality and try OCR on best candidates
      const sortedResults = preprocessingResults
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, config.maxRetries);

      console.log(`[EnhancedOCR] Trying ${sortedResults.length} preprocessing strategies`);

      // Step 3: Perform OCR on each preprocessed image
      for (const result of sortedResults) {
        try {
          const ocrResult = await this.performOCR(result.canvas, config);
          const cardInfo = this.extractCardInfo(ocrResult.text);
          
          const attempt: OCRAttempt = {
            text: ocrResult.text,
            confidence: ocrResult.confidence,
            strategy: result.strategy,
            cardInfo
          };

          attempts.push(attempt);

          console.log(`[EnhancedOCR] Strategy '${result.strategy}': "${ocrResult.text}" (${(ocrResult.confidence * 100).toFixed(1)}%)`);

          // Early exit for high confidence results
          if (ocrResult.confidence >= 0.9 && cardInfo.cardNumber && cardInfo.setCode) {
            console.log(`[EnhancedOCR] High confidence result found, stopping early`);
            break;
          }
        } catch (error) {
          console.warn(`[EnhancedOCR] Strategy '${result.strategy}' failed:`, error);
        }
      }

      // Step 4: Determine best result
      let finalResult: OCRResult;

      if (config.useConsensus && attempts.length > 1) {
        finalResult = this.generateConsensusResult(attempts, config);
      } else {
        // Use the highest confidence result
        const bestAttempt = attempts.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        );
        
        finalResult = this.createResultFromAttempt(bestAttempt, config);
      }

      finalResult.metadata = {
        allResults: attempts,
        processingTime: Date.now() - startTime
      };

      console.log(`[EnhancedOCR] Final result: "${finalResult.text}" (${(finalResult.confidence * 100).toFixed(1)}%)`);
      return finalResult;

    } catch (error) {
      console.error('[EnhancedOCR] Scan failed:', error);
      return {
        text: '',
        confidence: 0,
        success: false,
        metadata: {
          allResults: attempts,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  private async performOCR(canvas: HTMLCanvasElement, config: OCRConfig): Promise<{ text: string; confidence: number }> {
    if (!this.worker) throw new Error('OCR worker not initialized');

    // Configure Tesseract for this specific attempt
    await this.worker.setParameters({
      tessedit_pageseg_mode: config.psm.toString(),
      tessedit_char_whitelist: config.tesseditCharWhitelist || '',
      preserve_interword_spaces: config.preserveInterwordSpaces?.toString() || '1'
    });

    const { data } = await this.worker.recognize(canvas);
    return {
      text: data.text.trim(),
      confidence: data.confidence / 100 // Normalize to 0-1
    };
  }

  private extractCardInfo(text: string): { cardNumber?: string; totalCards?: string; setCode?: string } {
    const result: { cardNumber?: string; totalCards?: string; setCode?: string } = {};

    // Pattern for card numbers with fraction: "170/351", "234/350", etc.
    const cardNumberMatch = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
    if (cardNumberMatch) {
      // Remove leading zeros from card number (013 → 13)
      result.cardNumber = parseInt(cardNumberMatch[1]).toString();
      result.totalCards = cardNumberMatch[2];
      
      // Remove the card number from text to avoid matching it as set code
      text = text.replace(cardNumberMatch[0], '');
    } else {
      // Alternative format: "R 0033" or just "0033" or "013" (rarity letter + padded number)
      // Look for 2-4 digit numbers, potentially preceded by a single letter (rarity)
      const altNumberMatch = text.match(/\b[RMUC]?\s*(\d{2,4})\b/);
      if (altNumberMatch) {
        // Remove leading zeros (013 → 13, 0033 → 33)
        const cardNum = parseInt(altNumberMatch[1]).toString();
        result.cardNumber = cardNum;
        
        // Remove this from text to avoid confusion
        text = text.replace(altNumberMatch[0], '');
      }
    }

    // Look for set codes - prioritize known Magic set patterns
    // First check for 3-letter codes which are most common (EMN, OGW, NEO, etc.)
    const threeLetterMatch = text.match(/\b([A-Z]{3})\b/);
    
    // Check for Commander sets (C16, C17, etc.)
    const commanderMatch = text.match(/\b(C\d{2})\b/);
    
    // Check for sets with numbers (M21, M3C, CN2, etc.)
    const numberedSetMatch = text.match(/\b([A-Z]\d{2}|[A-Z]{2}\d|[A-Z]\d[A-Z])\b/);
    
    // Check for 2 or 4 letter codes (less common)
    const otherLetterMatch = text.match(/\b([A-Z]{2}|[A-Z]{4})\b/);
    
    // Prioritize matches - 3-letter codes are most common for modern sets
    if (threeLetterMatch && !threeLetterMatch[1].includes('R')) {
      // Avoid RRR, RR which are rarity indicators not set codes
      result.setCode = threeLetterMatch[1];
    } else if (commanderMatch) {
      result.setCode = commanderMatch[1];
    } else if (numberedSetMatch) {
      result.setCode = numberedSetMatch[1];
    } else if (otherLetterMatch && otherLetterMatch[1] !== 'RR' && otherLetterMatch[1] !== 'EN') {
      // Avoid common false positives like RR (rarity) or EN (language)
      result.setCode = otherLetterMatch[1];
    }

    return result;
  }

  private generateConsensusResult(attempts: OCRAttempt[], config: OCRConfig): OCRResult {
    const consensus: ConsensusResult = { totalVotes: attempts.length };
    
    // Vote on card numbers
    const cardNumbers = new Map<string, { votes: number; totalConfidence: number }>();
    const setCodes = new Map<string, { votes: number; totalConfidence: number }>();

    for (const attempt of attempts) {
      if (attempt.cardInfo?.cardNumber) {
        const key = attempt.cardInfo.cardNumber;
        const existing = cardNumbers.get(key) || { votes: 0, totalConfidence: 0 };
        cardNumbers.set(key, {
          votes: existing.votes + 1,
          totalConfidence: existing.totalConfidence + attempt.confidence
        });
      }

      if (attempt.cardInfo?.setCode) {
        const key = attempt.cardInfo.setCode;
        const existing = setCodes.get(key) || { votes: 0, totalConfidence: 0 };
        setCodes.set(key, {
          votes: existing.votes + 1,
          totalConfidence: existing.totalConfidence + attempt.confidence
        });
      }
    }

    // Determine consensus winners
    if (cardNumbers.size > 0) {
      const [cardNumber, data] = Array.from(cardNumbers.entries())
        .sort((a, b) => b[1].votes - a[1].votes || b[1].totalConfidence - a[1].totalConfidence)[0];
      
      consensus.cardNumber = {
        value: cardNumber,
        votes: data.votes,
        confidence: data.totalConfidence / data.votes
      };
    }

    if (setCodes.size > 0) {
      const [setCode, data] = Array.from(setCodes.entries())
        .sort((a, b) => b[1].votes - a[1].votes || b[1].totalConfidence - a[1].totalConfidence)[0];
      
      consensus.setCode = {
        value: setCode,
        votes: data.votes,
        confidence: data.totalConfidence / data.votes
      };
    }

    // Calculate overall confidence based on consensus strength
    const cardNumberConfidence = consensus.cardNumber?.confidence || 0;
    const setCodeConfidence = consensus.setCode?.confidence || 0;
    const consensusStrength = Math.max(
      consensus.cardNumber?.votes || 0,
      consensus.setCode?.votes || 0
    ) / attempts.length;

    const overallConfidence = ((cardNumberConfidence + setCodeConfidence) / 2) * consensusStrength;

    // Build final text
    const parts: string[] = [];
    if (consensus.cardNumber && consensus.cardNumber.votes >= 2) {
      const totalCards = attempts.find(a => a.cardInfo?.cardNumber === consensus.cardNumber?.value)?.cardInfo?.totalCards;
      parts.push(`${consensus.cardNumber.value}${totalCards ? `/${totalCards}` : ''}`);
    }
    if (consensus.setCode && consensus.setCode.votes >= 2) {
      parts.push(consensus.setCode.value);
    }

    const success = parts.length > 0 && overallConfidence >= config.minConfidence;

    return {
      text: parts.join(' '),
      confidence: overallConfidence,
      cardNumber: consensus.cardNumber?.value,
      totalCards: attempts.find(a => a.cardInfo?.cardNumber === consensus.cardNumber?.value)?.cardInfo?.totalCards,
      setCode: consensus.setCode?.value,
      success,
      strategy: 'consensus',
      metadata: {
        consensusDetails: consensus
      }
    };
  }

  private createResultFromAttempt(attempt: OCRAttempt, config: OCRConfig): OCRResult {
    const success = attempt.confidence >= config.minConfidence && 
                   !!(attempt.cardInfo?.cardNumber || attempt.cardInfo?.setCode);

    return {
      text: attempt.text,
      confidence: attempt.confidence,
      cardNumber: attempt.cardInfo?.cardNumber,
      totalCards: attempt.cardInfo?.totalCards,
      setCode: attempt.cardInfo?.setCode,
      success,
      strategy: attempt.strategy
    };
  }

  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      console.log('[EnhancedOCR] Worker terminated');
    }
  }
}

// Singleton instance
let enhancedOCRService: EnhancedOCRService | null = null;

export function getEnhancedOCRService(): EnhancedOCRService {
  if (!enhancedOCRService) {
    enhancedOCRService = new EnhancedOCRService();
  }
  return enhancedOCRService;
}

export function destroyEnhancedOCRService(): void {
  if (enhancedOCRService) {
    enhancedOCRService.destroy();
    enhancedOCRService = null;
  }
}