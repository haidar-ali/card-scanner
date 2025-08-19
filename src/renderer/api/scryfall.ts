import axios, { AxiosInstance } from 'axios';

interface ScryfallCard {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  colors?: string[];
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    png: string;
    art_crop: string;
    border_crop: string;
  };
  prices: {
    usd?: string;
    usd_foil?: string;
    eur?: string;
    eur_foil?: string;
  };
  cmc?: number;
  legalities: Record<string, string>;
  set_name: string;
  artist?: string;
  scryfall_uri: string;
}

class ScryfallAPI {
  private client: AxiosInstance;
  private rateLimitDelay = 100; // milliseconds between requests
  private lastRequestTime = 0;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.scryfall.com',
      headers: {
        'User-Agent': 'CardScanner/1.0.0',
        'Accept': 'application/json',
      },
    });
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  async getCard(setCode: string, collectorNumber: string): Promise<ScryfallCard | null> {
    try {
      await this.enforceRateLimit();
      
      const response = await this.client.get<ScryfallCard>(
        `/cards/${setCode.toLowerCase()}/${collectorNumber}`
      );
      
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch card ${setCode}/${collectorNumber}:`, error);
      return null;
    }
  }

  async searchCards(query: string): Promise<ScryfallCard[]> {
    try {
      await this.enforceRateLimit();
      
      const response = await this.client.get('/cards/search', {
        params: { q: query },
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error('Failed to search cards:', error);
      return [];
    }
  }

  async getCardByName(name: string, setCode?: string): Promise<ScryfallCard | null> {
    try {
      await this.enforceRateLimit();
      
      const params: any = { fuzzy: name };
      if (setCode) {
        params.set = setCode.toLowerCase();
      }
      
      const response = await this.client.get<ScryfallCard>('/cards/named', { params });
      
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch card by name ${name}:`, error);
      return null;
    }
  }

  async getSets() {
    try {
      await this.enforceRateLimit();
      
      const response = await this.client.get('/sets');
      return response.data.data || [];
    } catch (error) {
      console.error('Failed to fetch sets:', error);
      return [];
    }
  }

  // Convert Scryfall card to our database format
  convertToDbCard(scryfallCard: ScryfallCard): any {
    return {
      id: scryfallCard.id,
      name: scryfallCard.name,
      setCode: scryfallCard.set,
      collectorNumber: scryfallCard.collector_number,
      rarity: scryfallCard.rarity,
      colors: scryfallCard.colors || [],
      manaCost: scryfallCard.mana_cost,
      typeLine: scryfallCard.type_line,
      oracleText: scryfallCard.oracle_text,
      power: scryfallCard.power,
      toughness: scryfallCard.toughness,
      imageUri: scryfallCard.image_uris?.normal,
      imageUriSmall: scryfallCard.image_uris?.small,
      imageUriNormal: scryfallCard.image_uris?.normal,
      imageUriLarge: scryfallCard.image_uris?.large,
      priceUsd: scryfallCard.prices.usd ? parseFloat(scryfallCard.prices.usd) : undefined,
      priceEur: scryfallCard.prices.eur ? parseFloat(scryfallCard.prices.eur) : undefined,
      cmc: scryfallCard.cmc,
      legalities: JSON.stringify(scryfallCard.legalities),
      setName: scryfallCard.set_name,
      artist: scryfallCard.artist,
      scryfallUri: scryfallCard.scryfall_uri,
    };
  }
}

export default new ScryfallAPI();
export { ScryfallCard };