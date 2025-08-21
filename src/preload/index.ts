import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  selectImage: () => ipcRenderer.invoke('select-image'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // Camera API
  getCameras: async () => {
    return await navigator.mediaDevices.enumerateDevices()
      .then(devices => devices.filter(device => device.kind === 'videoinput'));
  },
  
  // OCR API
  ocrScan: (imageBase64: string) => ipcRenderer.invoke('ocr-scan', imageBase64),
  ocrStatus: () => ipcRenderer.invoke('ocr-status'),
  
  // Database operations
  saveCard: (card: any) => ipcRenderer.invoke('save-card', card),
  getCards: () => ipcRenderer.invoke('get-cards'),
  deleteCard: (id: string) => ipcRenderer.invoke('delete-card', id),
  updateCard: (id: string, updates: any) => ipcRenderer.invoke('update-card', id, updates),
  
  // Scryfall API
  fetchCardData: (setCode: string, number: string) => 
    ipcRenderer.invoke('fetch-card-data', setCode, number),
  
  // Collection Stats
  getCollectionStats: () => ipcRenderer.invoke('get-collection-stats'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;