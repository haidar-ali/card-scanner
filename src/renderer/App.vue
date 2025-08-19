<template>
  <div id="app">
    <nav class="sidebar">
      <div class="logo">
        <h1>📇 CardScanner</h1>
      </div>
      
      <ul class="nav-items">
        <li>
          <router-link to="/scanner" class="nav-link">
            <span class="icon">📷</span>
            <span>Scanner</span>
          </router-link>
        </li>
        <li>
          <router-link to="/collection" class="nav-link">
            <span class="icon">📚</span>
            <span>Collection</span>
          </router-link>
        </li>
        <li>
          <router-link to="/deck-builder" class="nav-link">
            <span class="icon">🎴</span>
            <span>Deck Builder</span>
          </router-link>
        </li>
        <li>
          <router-link to="/settings" class="nav-link">
            <span class="icon">⚙️</span>
            <span>Settings</span>
          </router-link>
        </li>
      </ul>
      
      <div class="stats">
        <div class="stat-item">
          <span class="label">Total Cards</span>
          <span class="value">{{ totalCards }}</span>
        </div>
        <div class="stat-item">
          <span class="label">Collection Value</span>
          <span class="value">${{ collectionValue }}</span>
        </div>
      </div>
    </nav>
    
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const totalCards = ref(0);
const collectionValue = ref('0.00');

onMounted(async () => {
  // TODO: Load stats from database
  totalCards.value = 0;
  collectionValue.value = '0.00';
});
</script>

<style scoped>
#app {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.sidebar {
  width: 250px;
  background: var(--bg-secondary);
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
}

.logo {
  margin-bottom: 3rem;
  text-align: center;
}

.logo h1 {
  font-size: 1.5rem;
  font-weight: 600;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.nav-items {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
}

.nav-items li {
  margin-bottom: 0.5rem;
}

.nav-link {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
}

.nav-link:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.nav-link.router-link-active {
  background: var(--accent-primary);
  color: white;
}

.nav-link .icon {
  margin-right: 0.75rem;
  font-size: 1.25rem;
}

.stats {
  margin-top: auto;
  padding-top: 2rem;
  border-top: 1px solid var(--border-color);
}

.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.stat-item .label {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.stat-item .value {
  font-weight: 600;
  color: var(--accent-primary);
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}
</style>