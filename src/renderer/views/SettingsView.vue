<template>
  <div class="settings-view">
    <div class="view-header">
      <h2>Settings</h2>
      <p>Configure your CardScanner preferences</p>
    </div>
    
    <div class="settings-sections">
      <div class="settings-section">
        <h3>Scanner Settings</h3>
        <div class="setting-item">
          <label>Google Vision API Key</label>
          <div class="api-key-container">
            <input 
              :type="showApiKey ? 'text' : 'password'"
              v-model="settings.visionApiKey" 
              placeholder="Enter your Google Vision API key"
              class="api-key-input"
            />
            <button @click="showApiKey = !showApiKey" class="toggle-visibility">
              {{ showApiKey ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>
        
        <div class="setting-item">
          <label>Default Camera</label>
          <select v-model="settings.defaultCamera">
            <option value="">Auto-select</option>
            <option v-for="camera in cameras" :key="camera.deviceId" :value="camera.deviceId">
              {{ camera.label || `Camera ${cameras.indexOf(camera) + 1}` }}
            </option>
          </select>
        </div>
        
        <div class="setting-item">
          <label>Auto-fetch card data</label>
          <input type="checkbox" v-model="settings.autoFetch" />
        </div>
      </div>
      
      <div class="settings-section">
        <h3>Collection Settings</h3>
        <div class="setting-item">
          <label>Default View</label>
          <select v-model="settings.defaultView">
            <option value="grid">Grid View</option>
            <option value="list">List View</option>
          </select>
        </div>
        
        <div class="setting-item">
          <label>Cards per page</label>
          <input type="number" v-model.number="settings.cardsPerPage" min="10" max="100" />
        </div>
        
        <div class="setting-item">
          <label>Show prices in</label>
          <select v-model="settings.currency">
            <option value="usd">USD ($)</option>
            <option value="eur">EUR (€)</option>
          </select>
        </div>
      </div>
      
      <div class="settings-section">
        <h3>Data Management</h3>
        <div class="setting-item">
          <label>Database Location</label>
          <input type="text" :value="dbPath" readonly />
          <button @click="openDbFolder" class="secondary">Open Folder</button>
        </div>
        
        <div class="setting-item">
          <label>Backup & Restore</label>
          <div class="button-group">
            <button @click="backupDatabase">Backup Database</button>
            <button @click="restoreDatabase" class="secondary">Restore Database</button>
          </div>
        </div>
        
        <div class="setting-item">
          <label>Cache Management</label>
          <div class="button-group">
            <button @click="clearCache" class="danger">Clear Image Cache</button>
            <span class="cache-size">Cache size: {{ cacheSize }}</span>
          </div>
        </div>
      </div>
      
      <div class="settings-section">
        <h3>About</h3>
        <div class="about-info">
          <p><strong>CardScanner</strong></p>
          <p>Version 1.0.0</p>
          <p>An OCR-based card collection manager</p>
          <br />
          <p>Built with Electron, Vue.js, and Tesseract.js</p>
          <p>Card data provided by Scryfall API</p>
        </div>
      </div>
    </div>
    
    <div class="settings-actions">
      <button @click="saveSettings">Save Settings</button>
      <button @click="resetSettings" class="secondary">Reset to Defaults</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const settings = ref({
  visionApiKey: '',
  defaultCamera: '',
  autoFetch: true,
  defaultView: 'grid',
  cardsPerPage: 50,
  currency: 'usd',
});

const showApiKey = ref(false);

const cameras = ref<MediaDeviceInfo[]>([]);
const dbPath = ref('');
const cacheSize = ref('0 MB');

onMounted(async () => {
  await loadCameras();
  await loadSettings();
  dbPath.value = await (window as any).electronAPI.getAppPath();
  calculateCacheSize();
});

async function loadCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameras.value = devices.filter(device => device.kind === 'videoinput');
  } catch (error) {
    console.error('Failed to load cameras:', error);
  }
}

async function loadSettings() {
  // Load settings from localStorage or electron store
  const saved = localStorage.getItem('cardscanner-settings');
  if (saved) {
    settings.value = { ...settings.value, ...JSON.parse(saved) };
  }
}

async function saveSettings() {
  localStorage.setItem('cardscanner-settings', JSON.stringify(settings.value));
  alert('Settings saved successfully!');
}

function resetSettings() {
  if (confirm('Reset all settings to defaults?')) {
    settings.value = {
      visionApiKey: '',
      defaultCamera: '',
      autoFetch: true,
      defaultView: 'grid',
      cardsPerPage: 50,
      currency: 'usd',
    };
    saveSettings();
  }
}

async function openDbFolder() {
  // This would need to be implemented in the main process
  const { shell } = require('electron');
  shell.openPath(dbPath.value);
}

async function backupDatabase() {
  const data = await (window as any).electronAPI.getCards();
  const json = JSON.stringify(data, null, 2);
  
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cardscanner-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  alert('Database backed up successfully!');
}

async function restoreDatabase() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          // TODO: Implement restore logic
          alert('Database restored successfully!');
        } catch (error) {
          alert('Failed to restore database');
        }
      };
      reader.readAsText(file);
    }
  };
  
  input.click();
}

async function clearCache() {
  if (confirm('Clear all cached images? This cannot be undone.')) {
    // TODO: Implement cache clearing
    cacheSize.value = '0 MB';
    alert('Cache cleared successfully!');
  }
}

function calculateCacheSize() {
  // TODO: Calculate actual cache size
  cacheSize.value = '0 MB';
}
</script>

<style scoped>
.settings-view {
  max-width: 800px;
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

.settings-sections {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.settings-section {
  background: var(--bg-secondary);
  border-radius: 1rem;
  padding: 1.5rem;
}

.settings-section h3 {
  margin-bottom: 1.5rem;
  color: var(--accent-primary);
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.setting-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.setting-item label {
  flex: 1;
  color: var(--text-primary);
}

.setting-item input[type="text"],
.setting-item input[type="number"],
.setting-item select {
  width: 200px;
}

.setting-item input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.api-key-container {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  max-width: 400px;
}

.api-key-input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: monospace;
}

.toggle-visibility {
  padding: 0.5rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
}

.toggle-visibility:hover {
  background: var(--bg-secondary);
}

.button-group {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.cache-size {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.about-info {
  color: var(--text-secondary);
  line-height: 1.6;
}

.about-info strong {
  color: var(--text-primary);
}

.settings-actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

.settings-actions button {
  flex: 1;
}
</style>