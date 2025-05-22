// 声明Electron API接口
interface ElectronAPI {
  selectDirectory: () => Promise<string | null>;
  saveConfig: (config: any) => Promise<boolean>;
  getConfig: () => Promise<any>;
  submitFeedback: (data: { email: string, content: string }) => Promise<{ success: boolean, message: string }>;
  onPythonReady: (callback: (url: string) => void) => void;
  onPythonError: (callback: (message: string) => void) => void;
  getAnnouncements: () => Promise<any>;
  
  // 更新相关API
  checkForUpdates: () => Promise<any>;
  onUpdateAvailable: (callback: (info: any) => void) => void;
  onUpdateDownloaded: (callback: (info: any) => void) => void;
  onUpdateError: (callback: (error: any) => void) => void;
  onDownloadProgress: (callback: (progressObj: any) => void) => void;
}

// 为window对象声明electronAPI属性
declare interface Window {
  electronAPI: ElectronAPI;
} 