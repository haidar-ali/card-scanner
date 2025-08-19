<template>
  <div class="collection-view">
    <div class="collection-header">
      <h2>My Collection</h2>
      <div class="header-actions">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Search cards..."
          class="search-input"
        />
        <select v-model="viewMode" class="view-toggle">
          <option value="grid">Grid View</option>
          <option value="list">List View</option>
        </select>
        <button @click="exportCollection" class="secondary">
          📥 Export
        </button>
      </div>
    </div>

    <div class="filters">
      <select v-model="filterSet">
        <option value="">All Sets</option>
        <option v-for="set in uniqueSets" :key="set" :value="set">
          {{ set }}
        </option>
      </select>
      
      <select v-model="filterRarity">
        <option value="">All Rarities</option>
        <option value="common">Common</option>
        <option value="uncommon">Uncommon</option>
        <option value="rare">Rare</option>
        <option value="mythic">Mythic</option>
      </select>
      
      <select v-model="sortBy">
        <option value="name">Name</option>
        <option value="setCode">Set</option>
        <option value="cmc">Mana Cost</option>
        <option value="dateAdded">Date Added</option>
        <option value="priceUsd">Price</option>
      </select>
    </div>

    <div v-if="loading" class="loading-container">
      <div class="loading"></div>
      <p>Loading collection...</p>
    </div>

    <div v-else-if="filteredCards.length === 0" class="empty-state">
      <p>No cards found</p>
      <router-link to="/scanner">
        <button>Start Scanning Cards</button>
      </router-link>
    </div>

    <div v-else :class="['cards-container', viewMode]">
      <div 
        v-for="card in filteredCards" 
        :key="card.id"
        :class="['card-display', viewMode]"
        @click="selectCard(card)"
      >
        <img 
          v-if="viewMode === 'grid'" 
          :src="card.imageUriNormal || card.imageUri" 
          :alt="card.name"
        />
        
        <div v-if="viewMode === 'list'" class="list-content">
          <img :src="card.imageUriSmall" :alt="card.name" />
          <div class="card-details">
            <h3>{{ card.name }}</h3>
            <p>{{ card.setName }} ({{ card.setCode }}) #{{ card.collectorNumber }}</p>
            <p class="card-type">{{ card.typeLine }}</p>
          </div>
          <div class="card-meta">
            <span class="quantity">Qty: {{ card.quantity }}</span>
            <span class="condition">{{ card.condition }}</span>
            <span class="price">${{ card.priceUsd || '0.00' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Card Detail Modal -->
    <div v-if="selectedCard" class="modal" @click="selectedCard = null">
      <div class="modal-content" @click.stop>
        <button class="close-btn" @click="selectedCard = null">✕</button>
        
        <div class="modal-body">
          <img :src="selectedCard.imageUriLarge || selectedCard.imageUri" :alt="selectedCard.name" />
          
          <div class="card-full-details">
            <h2>{{ selectedCard.name }}</h2>
            <p class="mana-cost">{{ selectedCard.manaCost }}</p>
            <p class="type-line">{{ selectedCard.typeLine }}</p>
            
            <div v-if="selectedCard.oracleText" class="oracle-text">
              <p>{{ selectedCard.oracleText }}</p>
            </div>
            
            <div v-if="selectedCard.power || selectedCard.toughness" class="stats">
              <span>{{ selectedCard.power }}/{{ selectedCard.toughness }}</span>
            </div>
            
            <div class="metadata">
              <div class="meta-item">
                <label>Set:</label>
                <span>{{ selectedCard.setName }} ({{ selectedCard.setCode }})</span>
              </div>
              <div class="meta-item">
                <label>Number:</label>
                <span>#{{ selectedCard.collectorNumber }}</span>
              </div>
              <div class="meta-item">
                <label>Rarity:</label>
                <span>{{ selectedCard.rarity }}</span>
              </div>
              <div class="meta-item">
                <label>Artist:</label>
                <span>{{ selectedCard.artist }}</span>
              </div>
            </div>
            
            <div class="collection-info">
              <div class="info-row">
                <label>Quantity:</label>
                <input 
                  type="number" 
                  v-model.number="selectedCard.quantity" 
                  @change="updateCard"
                  min="0"
                />
              </div>
              <div class="info-row">
                <label>Condition:</label>
                <select v-model="selectedCard.condition" @change="updateCard">
                  <option value="NM">Near Mint</option>
                  <option value="LP">Lightly Played</option>
                  <option value="MP">Moderately Played</option>
                  <option value="HP">Heavily Played</option>
                  <option value="DMG">Damaged</option>
                </select>
              </div>
              <div class="info-row">
                <label>Notes:</label>
                <textarea 
                  v-model="selectedCard.notes" 
                  @change="updateCard"
                  rows="3"
                ></textarea>
              </div>
            </div>
            
            <div class="modal-actions">
              <button @click="removeCard" class="danger">Remove from Collection</button>
              <a :href="selectedCard.scryfallUri" target="_blank">
                <button class="secondary">View on Scryfall</button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const cards = ref<any[]>([]);
const loading = ref(true);
const searchQuery = ref('');
const viewMode = ref<'grid' | 'list'>('grid');
const filterSet = ref('');
const filterRarity = ref('');
const sortBy = ref('name');
const selectedCard = ref<any>(null);

onMounted(async () => {
  await loadCards();
});

async function loadCards() {
  loading.value = true;
  try {
    cards.value = await (window as any).electronAPI.getCards() || [];
  } catch (error) {
    console.error('Failed to load cards:', error);
    cards.value = [];
  } finally {
    loading.value = false;
  }
}

const uniqueSets = computed(() => {
  const sets = new Set(cards.value.map(c => c.setName || c.setCode));
  return Array.from(sets).sort();
});

const filteredCards = computed(() => {
  let result = cards.value;
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(card => 
      card.name.toLowerCase().includes(query) ||
      card.typeLine?.toLowerCase().includes(query) ||
      card.oracleText?.toLowerCase().includes(query)
    );
  }
  
  if (filterSet.value) {
    result = result.filter(card => 
      card.setName === filterSet.value || card.setCode === filterSet.value
    );
  }
  
  if (filterRarity.value) {
    result = result.filter(card => card.rarity === filterRarity.value);
  }
  
  // Sort
  result = [...result].sort((a, b) => {
    switch (sortBy.value) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'setCode':
        return (a.setCode || '').localeCompare(b.setCode || '');
      case 'cmc':
        return (a.cmc || 0) - (b.cmc || 0);
      case 'dateAdded':
        return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
      case 'priceUsd':
        return (b.priceUsd || 0) - (a.priceUsd || 0);
      default:
        return 0;
    }
  });
  
  return result;
});

function selectCard(card: any) {
  selectedCard.value = { ...card };
}

async function updateCard() {
  if (!selectedCard.value) return;
  
  try {
    await (window as any).electronAPI.updateCard(selectedCard.value.id, {
      quantity: selectedCard.value.quantity,
      condition: selectedCard.value.condition,
      notes: selectedCard.value.notes,
    });
    
    // Update in local array
    const index = cards.value.findIndex(c => c.id === selectedCard.value.id);
    if (index >= 0) {
      cards.value[index] = { ...selectedCard.value };
    }
  } catch (error) {
    console.error('Failed to update card:', error);
  }
}

async function removeCard() {
  if (!selectedCard.value || !confirm('Remove this card from your collection?')) return;
  
  try {
    await (window as any).electronAPI.deleteCard(selectedCard.value.id);
    cards.value = cards.value.filter(c => c.id !== selectedCard.value.id);
    selectedCard.value = null;
  } catch (error) {
    console.error('Failed to remove card:', error);
  }
}

async function exportCollection() {
  const data = cards.value.map(card => ({
    name: card.name,
    set: card.setCode,
    number: card.collectorNumber,
    quantity: card.quantity,
    condition: card.condition,
    price: card.priceUsd,
  }));
  
  const csv = [
    'Name,Set,Number,Quantity,Condition,Price',
    ...data.map(row => 
      `"${row.name}","${row.set}","${row.number}",${row.quantity},"${row.condition}",${row.price || 0}`
    )
  ].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'collection.csv';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.collection-view {
  max-width: 1600px;
  margin: 0 auto;
}

.collection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.collection-header h2 {
  font-size: 2rem;
}

.header-actions {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-input {
  width: 300px;
}

.filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.loading-container, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: var(--text-secondary);
}

.cards-container.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.cards-container.list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card-display.grid {
  cursor: pointer;
  transition: transform 0.2s;
}

.card-display.grid:hover {
  transform: scale(1.05);
}

.card-display.grid img {
  width: 100%;
  height: auto;
  border-radius: 0.5rem;
}

.card-display.list {
  background: var(--bg-secondary);
  border-radius: 0.5rem;
  padding: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.card-display.list:hover {
  background: var(--hover-bg);
}

.list-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.list-content img {
  width: 60px;
  height: 84px;
  object-fit: cover;
  border-radius: 0.25rem;
}

.card-details {
  flex: 1;
}

.card-details h3 {
  margin-bottom: 0.25rem;
}

.card-details p {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.card-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.card-meta span {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.card-meta .price {
  color: var(--success);
  font-weight: 600;
}

/* Modal Styles */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-secondary);
  border-radius: 1rem;
  max-width: 1000px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: var(--bg-tertiary);
  border: none;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  font-size: 1.25rem;
  cursor: pointer;
  z-index: 10;
}

.modal-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  padding: 2rem;
}

.modal-body img {
  width: 100%;
  height: auto;
  border-radius: 0.5rem;
}

.card-full-details h2 {
  margin-bottom: 0.5rem;
}

.mana-cost {
  color: var(--accent-primary);
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.type-line {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.oracle-text {
  background: var(--bg-tertiary);
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  line-height: 1.6;
}

.stats {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--accent-secondary);
  margin-bottom: 1rem;
}

.metadata {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.meta-item {
  display: flex;
  gap: 0.5rem;
}

.meta-item label {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.collection-info {
  background: var(--bg-tertiary);
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-row label {
  width: 100px;
  color: var(--text-secondary);
}

.info-row input,
.info-row select,
.info-row textarea {
  flex: 1;
}

.modal-actions {
  display: flex;
  gap: 1rem;
}

.modal-actions button {
  flex: 1;
}
</style>