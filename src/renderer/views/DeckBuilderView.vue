<template>
  <div class="deck-builder-view">
    <div class="view-header">
      <h2>Deck Builder</h2>
      <p>Build and manage your decks</p>
    </div>
    
    <div class="coming-soon">
      <div class="icon">🎴</div>
      <h3>Coming Soon</h3>
      <p>Deck building features will be available in the next update.</p>
      <p>Features planned:</p>
      <ul>
        <li>Create and manage multiple decks</li>
        <li>Drag and drop deck building</li>
        <li>Format validation (Standard, Modern, Commander, etc.)</li>
        <li>Mana curve analysis</li>
        <li>Export to popular deck formats</li>
        <li>AI-powered deck suggestions</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
// Deck builder logic will be implemented here
</script>

<style scoped>
.deck-builder-view {
  max-width: 1200px;
  margin: 0 auto;
}

.view-header {
  margin-bottom: 2rem;
}

.view-header h2 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.view-header p {
  color: var(--text-secondary);
}

.coming-soon {
  background: var(--bg-secondary);
  border-radius: 1rem;
  padding: 4rem 2rem;
  text-align: center;
  margin-top: 4rem;
}

.coming-soon .icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.coming-soon h3 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--accent-primary);
}

.coming-soon p {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.coming-soon ul {
  list-style: none;
  padding: 0;
  margin: 2rem auto 0;
  max-width: 400px;
  text-align: left;
}

.coming-soon li {
  padding: 0.5rem 0;
  padding-left: 1.5rem;
  position: relative;
  color: var(--text-secondary);
}

.coming-soon li:before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--success);
}
</style>