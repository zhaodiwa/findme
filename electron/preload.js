const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程公开API
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件夹操作
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  
  // 配置操作
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // 用户反馈
  submitFeedback: (data) => ipcRenderer.invoke('submit-feedback', data),
  
  // 公告功能
  getAnnouncements: () => ipcRenderer.invoke('get-announcements'),
  
  // 事件监听
  onPythonReady: (callback) => {
    ipcRenderer.on('python-ready', (event, url) => callback(url));
  },
  onPythonError: (callback) => {
    ipcRenderer.on('python-error', (event, message) => callback(message));
  },
  onPythonPreparing: (callback) => {
    ipcRenderer.on('python-preparing', (event, url) => callback(url));
  },
  
  // 自动更新相关
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, error) => callback(error));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, progressObj) => callback(progressObj));
  }
}); 