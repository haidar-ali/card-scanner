/**
 * Temporal OCR Fusion - Slow Loop (1-3fps)
 * Performs temporal voting, confusion-aware fusion, and commits results
 */

import type { OCRHypothesis } from './streamingROIManager';

export interface FusedField {
  value: string;
  confidence: number;
  votes: number;
  totalVotes: number;
  alternatives: Array<{ value: string; votes: number; confidence: number }>;
}

export interface CardIdentification {
  setCode?: string;
  collectorNumber?: string;
  title?: string;
  types?: string;
  confidence: number;
  era: 'modern' | 'middle' | 'early' | 'unknown'; // M15+, 1998-2014, 1993-1997
  uniqueMatch?: {
    scryfallId?: string;
    name: string;
    set: string;
    collectorNumber: string;
    imageUrl?: string;
  };
}

export interface TemporalFusionConfig {
  minVotes: number; // Minimum votes to accept a value
  confusionPairs: Map<string, string>; // Character confusion mapping
  confidenceThreshold: number; // Minimum confidence to commit
  votingWindow: number; // Time window for voting (ms)
}

export class TemporalOCRFusion {
  private readonly config: TemporalFusionConfig = {
    minVotes: 3,
    confusionPairs: new Map([
      ['O', '0'], ['0', 'O'],
      ['I', '1'], ['1', 'I'], ['l', '1'],
      ['S', '5'], ['5', 'S'],
      ['Z', '2'], ['2', 'Z'],
      ['B', '8'], ['8', 'B'],
      ['G', '6'], ['6', 'G'],
      ['q', '9'], ['9', 'q'],
      ['/', '7'], ['7', '/']
    ]),
    confidenceThreshold: 0.85,
    votingWindow: 2000 // 2 seconds
  };
  
  private voteHistory = new Map<string, Array<{ value: string; confidence: number; timestamp: number }>>();
  private commitHistory: CardIdentification[] = [];
  private lastCommitTime = 0;
  private readonly COMMIT_COOLDOWN = 1000; // 1 second between commits
  
  /**
   * Process hypotheses and attempt to commit a card identification
   */
  processHypotheses(
    hypotheses: Map<string, OCRHypothesis[]>,
    symbolCandidates?: { setCode: string; confidence: number }[]
  ): { shouldCommit: boolean; identification?: CardIdentification } {
    const now = Date.now();
    
    // Update vote history
    this.updateVoteHistory(hypotheses);
    
    // Clean old votes
    this.cleanOldVotes();
    
    // Perform temporal fusion
    const fusedFields = this.fuseFields();
    
    // Check if we have enough confidence to commit
    if (now - this.lastCommitTime < this.COMMIT_COOLDOWN) {
      return { shouldCommit: false };
    }
    
    // Try to identify the card
    const identification = this.identifyCard(fusedFields, symbolCandidates);
    
    if (identification && identification.confidence >= this.config.confidenceThreshold) {
      // Check for early exit conditions
      if (this.shouldCommitEarly(identification, fusedFields)) {
        this.lastCommitTime = now;
        this.commitHistory.push(identification);
        return { shouldCommit: true, identification };
      }
    }
    
    // Check if we should show top candidates to user
    if (identification && identification.confidence >= 0.7) {
      return { shouldCommit: false, identification };
    }
    
    return { shouldCommit: false };
  }
  
  /**
   * Update vote history with new hypotheses
   */
  private updateVoteHistory(hypotheses: Map<string, OCRHypothesis[]>): void {
    for (const [field, fieldHypotheses] of hypotheses) {
      if (!this.voteHistory.has(field)) {
        this.voteHistory.set(field, []);
      }
      
      const history = this.voteHistory.get(field)!;
      
      for (const hypothesis of fieldHypotheses) {
        // Normalize the value
        const normalized = this.normalizeValue(hypothesis.text, field);
        
        history.push({
          value: normalized,
          confidence: hypothesis.confidence,
          timestamp: hypothesis.timestamp
        });
      }
      
      // Keep history size manageable
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }
    }
  }
  
  /**
   * Normalize OCR text based on field type
   */
  private normalizeValue(text: string, field: string): string {
    let normalized = text.trim().toUpperCase();
    
    // Field-specific normalization
    switch (field) {
      case 'collector_number':
      case 'footer':
        // Extract number from text like "013/280", "R 0033", etc.
        const numberMatch = normalized.match(/(\d+)/);
        if (numberMatch) {
          // Remove leading zeros
          normalized = parseInt(numberMatch[1]).toString();
        }
        break;
        
      case 'set_code':
        // Extract 2-5 letter codes
        const codeMatch = normalized.match(/\b([A-Z]{2,5})\b/);
        if (codeMatch) {
          normalized = codeMatch[1];
        }
        break;
        
      case 'title':
        // Keep title case
        normalized = text.trim();
        break;
    }
    
    return normalized;
  }
  
  /**
   * Perform temporal fusion with confusion-aware voting
   */
  private fuseFields(): Map<string, FusedField> {
    const fusedFields = new Map<string, FusedField>();
    
    for (const [field, history] of this.voteHistory) {
      const validVotes = history.filter(v => 
        Date.now() - v.timestamp < this.config.votingWindow
      );
      
      if (validVotes.length === 0) continue;
      
      // Group votes by value (considering confusion pairs)
      const voteGroups = this.groupVotesWithConfusion(validVotes);
      
      // Sort groups by total confidence
      const sortedGroups = Array.from(voteGroups.entries())
        .map(([value, votes]) => ({
          value,
          votes: votes.length,
          totalConfidence: votes.reduce((sum, v) => sum + v.confidence, 0),
          avgConfidence: votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length
        }))
        .sort((a, b) => b.totalConfidence - a.totalConfidence);
      
      if (sortedGroups.length === 0) continue;
      
      const winner = sortedGroups[0];
      
      fusedFields.set(field, {
        value: winner.value,
        confidence: winner.avgConfidence,
        votes: winner.votes,
        totalVotes: validVotes.length,
        alternatives: sortedGroups.slice(1, 3).map(g => ({
          value: g.value,
          votes: g.votes,
          confidence: g.avgConfidence
        }))
      });
    }
    
    return fusedFields;
  }
  
  /**
   * Group votes considering character confusion
   */
  private groupVotesWithConfusion(
    votes: Array<{ value: string; confidence: number; timestamp: number }>
  ): Map<string, typeof votes> {
    const groups = new Map<string, typeof votes>();
    
    for (const vote of votes) {
      let grouped = false;
      
      // Check if this vote is similar to an existing group
      for (const [groupKey, groupVotes] of groups) {
        if (this.areValuesSimilar(vote.value, groupKey)) {
          groupVotes.push(vote);
          grouped = true;
          break;
        }
      }
      
      if (!grouped) {
        groups.set(vote.value, [vote]);
      }
    }
    
    // Merge groups that are similar
    const mergedGroups = new Map<string, typeof votes>();
    const processed = new Set<string>();
    
    for (const [key, votes] of groups) {
      if (processed.has(key)) continue;
      
      const merged = [...votes];
      processed.add(key);
      
      for (const [otherKey, otherVotes] of groups) {
        if (key !== otherKey && !processed.has(otherKey) && this.areValuesSimilar(key, otherKey)) {
          merged.push(...otherVotes);
          processed.add(otherKey);
        }
      }
      
      // Use the most common value as the key
      const valueCounts = new Map<string, number>();
      for (const vote of merged) {
        valueCounts.set(vote.value, (valueCounts.get(vote.value) || 0) + 1);
      }
      const mostCommon = Array.from(valueCounts.entries())
        .sort((a, b) => b[1] - a[1])[0][0];
      
      mergedGroups.set(mostCommon, merged);
    }
    
    return mergedGroups;
  }
  
  /**
   * Check if two values are similar considering confusion pairs
   */
  private areValuesSimilar(a: string, b: string): boolean {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    
    let differences = 0;
    const maxLen = Math.max(a.length, b.length);
    
    for (let i = 0; i < maxLen; i++) {
      const charA = a[i] || '';
      const charB = b[i] || '';
      
      if (charA !== charB) {
        // Check if it's a known confusion pair
        const isConfusionPair = 
          (this.config.confusionPairs.get(charA) === charB) ||
          (this.config.confusionPairs.get(charB) === charA);
        
        if (!isConfusionPair) {
          differences++;
        }
      }
    }
    
    return differences <= 1; // Allow one non-confusion difference
  }
  
  /**
   * Identify the card based on fused fields
   */
  private identifyCard(
    fusedFields: Map<string, FusedField>,
    symbolCandidates?: { setCode: string; confidence: number }[]
  ): CardIdentification | null {
    const setCode = fusedFields.get('set_code')?.value || 
                   fusedFields.get('footer')?.value?.match(/[A-Z]{2,5}/)?.[0];
    const collectorNumber = fusedFields.get('collector_number')?.value ||
                           fusedFields.get('footer')?.value?.match(/\d+/)?.[0];
    const title = fusedFields.get('title')?.value;
    const types = fusedFields.get('types')?.value;
    
    // Determine era based on available information
    const era = this.determineEra(setCode, collectorNumber, symbolCandidates);
    
    // Calculate overall confidence
    const fieldConfidences = Array.from(fusedFields.values()).map(f => f.confidence);
    const avgConfidence = fieldConfidences.length > 0 
      ? fieldConfidences.reduce((a, b) => a + b, 0) / fieldConfidences.length
      : 0;
    
    // Adjust confidence based on field completeness
    let confidence = avgConfidence;
    if (setCode && collectorNumber) {
      confidence *= 1.2; // Boost for having key fields
    }
    if (symbolCandidates && symbolCandidates.length > 0) {
      confidence *= 1.1; // Boost for symbol detection
    }
    confidence = Math.min(1, confidence);
    
    return {
      setCode,
      collectorNumber,
      title,
      types,
      confidence,
      era
    };
  }
  
  /**
   * Determine the card era for lookup strategy
   */
  private determineEra(
    setCode?: string,
    collectorNumber?: string,
    symbolCandidates?: { setCode: string; confidence: number }[]
  ): 'modern' | 'middle' | 'early' | 'unknown' {
    // M15+ cards have clear set codes and collector numbers
    if (setCode && collectorNumber && /^\d+$/.test(collectorNumber)) {
      // Check if it's a known modern set (would need actual set database)
      return 'modern';
    }
    
    // 1998-2014 cards have symbols but less consistent numbering
    if (symbolCandidates && symbolCandidates.length > 0 && symbolCandidates[0].confidence > 0.7) {
      return 'middle';
    }
    
    // Early cards lack collector numbers
    if (!collectorNumber || collectorNumber === '') {
      return 'early';
    }
    
    return 'unknown';
  }
  
  /**
   * Check if we should commit early
   */
  private shouldCommitEarly(
    identification: CardIdentification,
    fusedFields: Map<string, FusedField>
  ): boolean {
    // Early exit conditions
    
    // 1. High confidence with key fields
    if (identification.confidence >= 0.9 && 
        identification.setCode && 
        identification.collectorNumber) {
      return true;
    }
    
    // 2. Strong consensus on all fields
    const strongConsensus = Array.from(fusedFields.values()).every(field => 
      field.votes >= this.config.minVotes && 
      field.confidence >= 0.8
    );
    if (strongConsensus) {
      return true;
    }
    
    // 3. No changes for multiple reads
    const recentHistory = this.commitHistory.slice(-3);
    if (recentHistory.length >= 3) {
      const allSame = recentHistory.every(h => 
        h.setCode === identification.setCode &&
        h.collectorNumber === identification.collectorNumber
      );
      if (allSame) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Clean old votes outside the voting window
   */
  private cleanOldVotes(): void {
    const now = Date.now();
    
    for (const [field, history] of this.voteHistory) {
      const filtered = history.filter(v => 
        now - v.timestamp < this.config.votingWindow * 2 // Keep a bit longer for analysis
      );
      
      if (filtered.length > 0) {
        this.voteHistory.set(field, filtered);
      } else {
        this.voteHistory.delete(field);
      }
    }
  }
  
  /**
   * Get current voting statistics for UI display
   */
  getVotingStats(): Map<string, { 
    leading: string; 
    confidence: number; 
    votes: number; 
    alternatives: string[] 
  }> {
    const stats = new Map();
    const fusedFields = this.fuseFields();
    
    for (const [field, fused] of fusedFields) {
      stats.set(field, {
        leading: fused.value,
        confidence: fused.confidence,
        votes: fused.votes,
        alternatives: fused.alternatives.map(a => a.value)
      });
    }
    
    return stats;
  }
  
  /**
   * Reset fusion state
   */
  reset(): void {
    this.voteHistory.clear();
    this.commitHistory = [];
    this.lastCommitTime = 0;
  }
}

export const temporalOCRFusion = new TemporalOCRFusion();