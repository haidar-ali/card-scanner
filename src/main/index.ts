import 'reflect-metadata';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { initDatabase } from '../database/connection';
import Tesseract from 'tesseract.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1b26',
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(async () => {
  await initDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// IPC Handlers

// OCR Handler using Tesseract.js
ipcMain.handle('ocr-scan', async (event, imageBase64: string) => {
  try {
    console.log('[Main] Starting Tesseract OCR scan...');
    
    const result = await Tesseract.recognize(
      imageBase64,
      'eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`[Tesseract] Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      }
    );
    
    const text = result.data.text;
    const confidence = result.data.confidence;
    
    // Extract card info from text
    const cardNumberMatch = text.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
    const setCodeMatch = text.match(/\b([A-Z0-9]{2,4})\b/);
    
    return {
      text: text.trim(),
      confidence: confidence,
      cardNumber: cardNumberMatch ? cardNumberMatch[1] : null,
      totalCards: cardNumberMatch ? cardNumberMatch[2] : null,
      setCode: setCodeMatch ? setCodeMatch[1] : null,
      success: !!(cardNumberMatch || setCodeMatch)
    };
  } catch (error) {
    console.error('[Main] Tesseract OCR error:', error);
    throw error;
  }
});

ipcMain.handle('ocr-status', async () => {
  // Tesseract is always ready when imported
  return true;
});

ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp'] }
    ]
  });
  return result.filePaths[0];
});

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

// Database handlers
ipcMain.handle('save-card', async (event, card) => {
  const { getDatabase } = await import('../database/connection');
  const { Card } = await import('../database/entities/Card');
  
  try {
    const db = getDatabase();
    const repository = db.getRepository(Card);
    
    // Check if card exists
    const existing = await repository.findOne({ where: { id: card.id } });
    
    if (existing) {
      // Update quantity
      existing.quantity += 1;
      await repository.save(existing);
      return existing;
    } else {
      // Create new card
      const newCard = repository.create(card);
      await repository.save(newCard);
      return newCard;
    }
  } catch (error) {
    console.error('Failed to save card:', error);
    throw error;
  }
});

ipcMain.handle('get-cards', async () => {
  const { getDatabase } = await import('../database/connection');
  const { Card } = await import('../database/entities/Card');
  
  try {
    const db = getDatabase();
    const repository = db.getRepository(Card);
    return await repository.find();
  } catch (error) {
    console.error('Failed to get cards:', error);
    return [];
  }
});

ipcMain.handle('update-card', async (event, id, updates) => {
  const { getDatabase } = await import('../database/connection');
  const { Card } = await import('../database/entities/Card');
  
  try {
    const db = getDatabase();
    const repository = db.getRepository(Card);
    await repository.update(id, updates);
    return true;
  } catch (error) {
    console.error('Failed to update card:', error);
    throw error;
  }
});

ipcMain.handle('delete-card', async (event, id) => {
  const { getDatabase } = await import('../database/connection');
  const { Card } = await import('../database/entities/Card');
  
  try {
    const db = getDatabase();
    const repository = db.getRepository(Card);
    await repository.delete(id);
    return true;
  } catch (error) {
    console.error('Failed to delete card:', error);
    throw error;
  }
});

// Scryfall API handler
ipcMain.handle('fetch-card-data', async (event, setCode, number) => {
  const axios = (await import('axios')).default;
  
  try {
    const response = await axios.get(
      `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${number}`,
      {
        headers: {
          'User-Agent': 'CardScanner/1.0.0',
          'Accept': 'application/json',
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch card data:', error);
    return null;
  }
});