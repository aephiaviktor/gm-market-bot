const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('botApi', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  saveSettings: (config) => ipcRenderer.invoke('settings:save', config),
  startBot: () => ipcRenderer.invoke('bot:start'),
  stopBot: () => ipcRenderer.invoke('bot:stop'),
  cancelOrder: (payload) => ipcRenderer.invoke('bot:cancel-order', payload),
  getBotStatus: () => ipcRenderer.invoke('bot:status'),
  rerunAssets: (assets) => ipcRenderer.invoke('bot:rerun-assets', assets),
  onLog: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('bot-log', wrapped);
    return () => ipcRenderer.removeListener('bot-log', wrapped);
  },
  onStatus: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('bot-status', wrapped);
    return () => ipcRenderer.removeListener('bot-status', wrapped);
  },
});
