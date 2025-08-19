/**
 * Set Symbol Classifier
 * Uses a tiny CNN to classify Magic set symbols
 * In production, this would load a trained MobileNet/ShuffleNet model
 */

export interface SymbolClassification {
  setCode: string;
  confidence: number;
  setName?: string;
  releaseYear?: number;
}

export class SetSymbolClassifier {
  private isInitialized = false;
  private symbolDatabase: Map<string, { name: string; year: number }>;
  
  constructor() {
    // Initialize with common Magic sets
    // In production, this would be loaded from a complete database
    this.symbolDatabase = new Map([
      ['NEO', { name: 'Kamigawa: Neon Dynasty', year: 2022 }],
      ['MID', { name: 'Innistrad: Midnight Hunt', year: 2021 }],
      ['AFR', { name: 'Adventures in the Forgotten Realms', year: 2021 }],
      ['STX', { name: 'Strixhaven', year: 2021 }],
      ['KHM', { name: 'Kaldheim', year: 2021 }],
      ['ZNR', { name: 'Zendikar Rising', year: 2020 }],
      ['IKO', { name: 'Ikoria', year: 2020 }],
      ['THB', { name: 'Theros Beyond Death', year: 2020 }],
      ['ELD', { name: 'Throne of Eldraine', year: 2019 }],
      ['WAR', { name: 'War of the Spark', year: 2019 }],
      ['RNA', { name: 'Ravnica Allegiance', year: 2019 }],
      ['GRN', { name: 'Guilds of Ravnica', year: 2018 }],
      ['DOM', { name: 'Dominaria', year: 2018 }],
      ['RIX', { name: 'Rivals of Ixalan', year: 2018 }],
      ['XLN', { name: 'Ixalan', year: 2017 }],
      ['AKH', { name: 'Amonkhet', year: 2017 }],
      ['KLD', { name: 'Kaladesh', year: 2016 }],
      ['EMN', { name: 'Eldritch Moon', year: 2016 }],
      ['SOI', { name: 'Shadows over Innistrad', year: 2016 }],
      ['OGW', { name: 'Oath of the Gatewatch', year: 2016 }],
      ['BFZ', { name: 'Battle for Zendikar', year: 2015 }],
      ['ORI', { name: 'Magic Origins', year: 2015 }],
      ['DTK', { name: 'Dragons of Tarkir', year: 2015 }],
      ['FRF', { name: 'Fate Reforged', year: 2015 }],
      ['KTK', { name: 'Khans of Tarkir', year: 2014 }],
      ['M15', { name: 'Magic 2015', year: 2014 }],
      ['JOU', { name: 'Journey into Nyx', year: 2014 }],
      ['BNG', { name: 'Born of the Gods', year: 2014 }],
      ['THS', { name: 'Theros', year: 2013 }],
      ['M14', { name: 'Magic 2014', year: 2013 }],
      ['DGM', { name: 'Dragon\'s Maze', year: 2013 }],
      ['GTC', { name: 'Gatecrash', year: 2013 }],
      ['RTR', { name: 'Return to Ravnica', year: 2012 }],
      ['M13', { name: 'Magic 2013', year: 2012 }],
      ['AVR', { name: 'Avacyn Restored', year: 2012 }],
      ['DKA', { name: 'Dark Ascension', year: 2012 }],
      ['ISD', { name: 'Innistrad', year: 2011 }],
      ['M12', { name: 'Magic 2012', year: 2011 }],
      ['NPH', { name: 'New Phyrexia', year: 2011 }],
      ['MBS', { name: 'Mirrodin Besieged', year: 2011 }],
      ['SOM', { name: 'Scars of Mirrodin', year: 2010 }],
      ['M11', { name: 'Magic 2011', year: 2010 }],
      ['ROE', { name: 'Rise of the Eldrazi', year: 2010 }],
      ['WWK', { name: 'Worldwake', year: 2010 }],
      ['ZEN', { name: 'Zendikar', year: 2009 }],
      ['M10', { name: 'Magic 2010', year: 2009 }],
      ['ARB', { name: 'Alara Reborn', year: 2009 }],
      ['CON', { name: 'Conflux', year: 2009 }],
      ['ALA', { name: 'Shards of Alara', year: 2008 }],
      // Commander sets
      ['C21', { name: 'Commander 2021', year: 2021 }],
      ['C20', { name: 'Commander 2020', year: 2020 }],
      ['C19', { name: 'Commander 2019', year: 2019 }],
      ['C18', { name: 'Commander 2018', year: 2018 }],
      ['C17', { name: 'Commander 2017', year: 2017 }],
      ['C16', { name: 'Commander 2016', year: 2016 }],
      ['C15', { name: 'Commander 2015', year: 2015 }],
      ['C14', { name: 'Commander 2014', year: 2014 }],
      ['C13', { name: 'Commander 2013', year: 2013 }],
      // Modern Horizons
      ['MH2', { name: 'Modern Horizons 2', year: 2021 }],
      ['MH1', { name: 'Modern Horizons', year: 2019 }],
      // Masters sets
      ['2XM', { name: 'Double Masters', year: 2020 }],
      ['UMA', { name: 'Ultimate Masters', year: 2018 }],
      ['M25', { name: 'Masters 25', year: 2018 }],
      ['IMA', { name: 'Iconic Masters', year: 2017 }],
      ['MM3', { name: 'Modern Masters 2017', year: 2017 }],
      ['EMA', { name: 'Eternal Masters', year: 2016 }],
      ['MM2', { name: 'Modern Masters 2015', year: 2015 }],
      ['MMA', { name: 'Modern Masters', year: 2013 }],
      // Other special sets
      ['M3C', { name: 'March of the Machine Commander', year: 2023 }],
      ['CN2', { name: 'Conspiracy: Take the Crown', year: 2016 }],
      ['CNS', { name: 'Conspiracy', year: 2014 }]
    ]);
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // In production, this would load the CNN model
    // For now, we just mark as initialized
    console.log('[SymbolClassifier] Initializing (using mock classifier)');
    this.isInitialized = true;
  }
  
  /**
   * Classify a symbol ROI
   */
  async classifySymbol(symbolCanvas: HTMLCanvasElement): Promise<SymbolClassification[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // In production, this would:
    // 1. Preprocess the image (resize to model input size, normalize)
    // 2. Run inference with the CNN model
    // 3. Return top-k predictions
    
    // For now, simulate classification based on image characteristics
    const results = this.simulateClassification(symbolCanvas);
    
    return results;
  }
  
  /**
   * Simulate classification based on image characteristics
   * In production, this would be replaced with actual CNN inference
   */
  private simulateClassification(canvas: HTMLCanvasElement): SymbolClassification[] {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Analyze image characteristics
    const features = this.extractFeatures(imageData);
    
    // Generate mock predictions based on features
    const predictions: SymbolClassification[] = [];
    
    // Simulate top-3 predictions
    const possibleSets = Array.from(this.symbolDatabase.entries());
    const selectedSets = this.selectBasedOnFeatures(possibleSets, features, 3);
    
    for (let i = 0; i < selectedSets.length; i++) {
      const [code, info] = selectedSets[i];
      predictions.push({
        setCode: code,
        confidence: Math.max(0.3, 0.9 - i * 0.2 - Math.random() * 0.1),
        setName: info.name,
        releaseYear: info.year
      });
    }
    
    return predictions;
  }
  
  /**
   * Extract basic features from symbol image
   */
  private extractFeatures(imageData: ImageData): {
    dominantColor: 'red' | 'blue' | 'black' | 'white' | 'green' | 'gold' | 'silver';
    complexity: number;
    aspectRatio: number;
  } {
    const { data, width, height } = imageData;
    
    // Analyze dominant color
    let r = 0, g = 0, b = 0;
    let nonWhitePixels = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        nonWhitePixels++;
      }
    }
    
    if (nonWhitePixels > 0) {
      r /= nonWhitePixels;
      g /= nonWhitePixels;
      b /= nonWhitePixels;
    }
    
    // Determine dominant color
    let dominantColor: 'red' | 'blue' | 'black' | 'white' | 'green' | 'gold' | 'silver';
    if (r > 150 && g < 100 && b < 100) {
      dominantColor = 'red';
    } else if (r < 100 && g < 100 && b > 150) {
      dominantColor = 'blue';
    } else if (r < 80 && g < 80 && b < 80) {
      dominantColor = 'black';
    } else if (r > 200 && g > 200 && b > 200) {
      dominantColor = 'white';
    } else if (r < 100 && g > 150 && b < 100) {
      dominantColor = 'green';
    } else if (r > 180 && g > 150 && b < 100) {
      dominantColor = 'gold';
    } else {
      dominantColor = 'silver';
    }
    
    // Calculate complexity (edge density)
    let edges = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const current = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const right = (data[idx + 4] + data[idx + 5] + data[idx + 6]) / 3;
        const below = (data[((y + 1) * width + x) * 4] + 
                      data[((y + 1) * width + x) * 4 + 1] + 
                      data[((y + 1) * width + x) * 4 + 2]) / 3;
        
        if (Math.abs(current - right) > 30 || Math.abs(current - below) > 30) {
          edges++;
        }
      }
    }
    
    const complexity = edges / ((width - 2) * (height - 2));
    
    return {
      dominantColor,
      complexity,
      aspectRatio: width / height
    };
  }
  
  /**
   * Select sets based on extracted features
   */
  private selectBasedOnFeatures(
    sets: Array<[string, { name: string; year: number }]>,
    features: ReturnType<typeof this.extractFeatures>,
    count: number
  ): Array<[string, { name: string; year: number }]> {
    // Simple heuristic selection based on features
    // In production, the CNN would handle this
    
    // Prefer recent sets for gold/silver symbols (common in modern sets)
    if (features.dominantColor === 'gold' || features.dominantColor === 'silver') {
      sets.sort((a, b) => b[1].year - a[1].year);
    }
    
    // For complex symbols, prefer special sets
    if (features.complexity > 0.3) {
      sets.sort((a, b) => {
        const aSpecial = a[0].includes('M') || a[0].includes('C');
        const bSpecial = b[0].includes('M') || b[0].includes('C');
        return (bSpecial ? 1 : 0) - (aSpecial ? 1 : 0);
      });
    }
    
    return sets.slice(0, count);
  }
  
  /**
   * Get set information
   */
  getSetInfo(setCode: string): { name: string; year: number } | undefined {
    return this.symbolDatabase.get(setCode);
  }
}

export const setSymbolClassifier = new SetSymbolClassifier();