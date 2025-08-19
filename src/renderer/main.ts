import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import './style.css';

// Import views
import ScannerView from './views/ScannerView.vue';
import CollectionView from './views/CollectionView.vue';
import DeckBuilderView from './views/DeckBuilderView.vue';
import SettingsView from './views/SettingsView.vue';

// Define routes
const routes = [
  { path: '/', redirect: '/scanner' },
  { path: '/scanner', name: 'Scanner', component: ScannerView },
  { path: '/collection', name: 'Collection', component: CollectionView },
  { path: '/deck-builder', name: 'DeckBuilder', component: DeckBuilderView },
  { path: '/settings', name: 'Settings', component: SettingsView },
];

// Create router
const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// Create and mount app
const app = createApp(App);
app.use(router);
app.mount('#app');