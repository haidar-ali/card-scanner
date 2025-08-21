export interface ElectronAPI {
  selectImage: () => Promise<string>;
  getAppPath: () => Promise<string>;
  getCameras: () => Promise<MediaDeviceInfo[]>;
  saveCard: (card: any) => Promise<any>;
  getCards: () => Promise<any[]>;
  deleteCard: (id: string) => Promise<boolean>;
  updateCard: (id: string, updates: any) => Promise<boolean>;
  fetchCardData: (setCode: string, number: string) => Promise<any>;
  getCollectionStats: () => Promise<{ totalCards: number; totalValue: number }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}