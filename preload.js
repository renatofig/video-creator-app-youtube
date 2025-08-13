const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Funções de interação com o sistema
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  setStartupBehavior: (isEnabled) => ipcRenderer.send('set-startup-behavior', isEnabled), // Simplificado

  // Controle da Automação
  showStartMenu: (options) => ipcRenderer.send('show-start-menu', options),
  startAutomation: (options) => ipcRenderer.send('start-automation', options),
  showStopMenu: () => ipcRenderer.send('show-stop-menu'),
  onAutomationStarted: (callback) => ipcRenderer.on('automation-started', () => callback()),
  onVideoComplete: (callback) => ipcRenderer.on('video-complete', () => callback()),
  onAutomationError: (callback) => ipcRenderer.on('automation-error', () => callback()),
  
  // Gerenciamento de Configuração
  loadDefaultConfig: () => ipcRenderer.invoke('load-default-config'),
  saveDefaultConfig: (config) => ipcRenderer.send('save-default-config', config),
  saveConfigFileAs: (config) => ipcRenderer.invoke('save-config-file-as', config),
  openConfigFile: () => ipcRenderer.invoke('open-config-file'),
  onConfigUpdated: (callback) => ipcRenderer.on('config-updated', (_event, config) => callback(config)),
  
  // Funções para a funcionalidade "Salvar ao Sair"
  setDirtyState: (isDirty) => ipcRenderer.send('set-dirty-state', isDirty),
  onGetConfig: (callback) => ipcRenderer.on('get-config', () => callback()),

  // Comunicação e Status
  onLogUpdate: (callback) => ipcRenderer.on('log-update', (_event, value) => callback(value)),
  onInvalidSchedule: (callback) => ipcRenderer.on('invalid-schedule', (_event, value) => callback(value)),
  
  // Autenticação YouTube
  youtubeLogin: (credentials) => ipcRenderer.send('youtube-login', credentials),
  youtubeLogout: () => ipcRenderer.send('youtube-logout'),
});