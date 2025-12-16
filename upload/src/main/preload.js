window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type]);
  }
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startProcess: (url) => ipcRenderer.invoke('start-process', url),
  bulkAddKeys: (keys) => ipcRenderer.invoke('bulk-add-keys', keys),
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  deleteApiKey: (apiId) => ipcRenderer.invoke('delete-api-key', apiId),
  validateSingleApiKey: (apiKey) => ipcRenderer.invoke('validate-single-api-key', apiKey),
  getCookiesPath: () => ipcRenderer.invoke('get-cookies-path'),
  setCookiesPath: (path) => ipcRenderer.invoke('set-cookies-path', path),
  convertAndSaveCookies: (cookiesJson) => ipcRenderer.invoke('convert-and-save-cookies', cookiesJson),
  saveNetscapeCookies: (cookiesText) => ipcRenderer.invoke('save-netscape-cookies', cookiesText),
  getApifyApiKey: () => ipcRenderer.invoke('get-apify-api-key'),
  setApifyApiKey: (apiKey) => ipcRenderer.invoke('set-apify-api-key', apiKey),

  // Clipper sessions
  saveClipperSession: (session) => ipcRenderer.invoke('save-clipper-session', session),
  getClipperSessions: () => ipcRenderer.invoke('get-clipper-sessions'),
  deleteClipperSession: (sessionId) => ipcRenderer.invoke('delete-clipper-session', sessionId),

  cutVideoClip: (clipData) => ipcRenderer.invoke('cut-video-clip', clipData),
  createVideoPreview: (previewData) => ipcRenderer.invoke('create-video-preview', previewData),
  deletePreviewClip: (previewPath) => ipcRenderer.invoke('delete-preview-clip', previewPath),

  onProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('progress', handler);
    return handler; // Return the handler for potential removal
  },
  // Video cutting event listeners removed - now using synchronous return values from IPC invokes

  // Listener management - only remove all for specific event to avoid conflicts
  removeAllListeners: (event) => ipcRenderer.removeAllListeners(event),
  removeProgressListener: (handler) => ipcRenderer.removeListener('progress', handler),

  // File operations
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  openVideoPreview: (filePath) => ipcRenderer.invoke('open-video-preview', filePath),
  closePreviewWindow: () => ipcRenderer.invoke('close-preview-window'),
  resizePreviewWindow: (dimensions) => ipcRenderer.invoke('resize-preview-window', dimensions),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  deleteMultipleFiles: (filePaths) => ipcRenderer.invoke('delete-multiple-files', filePaths),
  deleteAllAutocaptionFiles: () => ipcRenderer.invoke('delete-all-autocaption-files'),
  deleteTempFiles: () => ipcRenderer.invoke('delete-temp-files'),

  // Results events
  onNewDownload: (callback) => ipcRenderer.on('new-download', (_, data) => callback(data)),
  onNewCut: (callback) => ipcRenderer.on('new-cut', (_, data) => callback(data)),

  // File scanning
  getExistingFiles: () => ipcRenderer.invoke('get-existing-files'),

  // Transcript loading
  loadTranscriptByVideoId: (videoId) => ipcRenderer.invoke('load-transcript-by-video-id', videoId),



  // YouTube upload functions
  youtubeGetAuthUrl: () => ipcRenderer.invoke('youtube-get-auth-url'),
  youtubeHandleAuthCallback: (code) => ipcRenderer.invoke('youtube-handle-auth-callback', code),
  youtubeGetAccounts: () => ipcRenderer.invoke('youtube-get-accounts'),
  youtubeUploadVideo: (videoData) => ipcRenderer.invoke('youtube-upload-video', videoData),
  youtubeGetUploadHistory: (userId) => ipcRenderer.invoke('youtube-get-upload-history', userId),
  youtubeRemoveAccount: (accountId) => ipcRenderer.invoke('youtube-remove-account', accountId),
  youtubeDeleteHistoryItem: (historyId) => ipcRenderer.invoke('youtube-delete-history-item', historyId),
  youtubeClearUploadHistory: (userId) => ipcRenderer.invoke('youtube-clear-upload-history', userId),
  youtubeGenerateContent: (data) => ipcRenderer.invoke('youtube-generate-content', data),
  youtubeGenerateContentFromCaption: (data) => ipcRenderer.invoke('youtube-generate-content-from-caption', data),
  youtubeStartOAuth: (accountId = null) => ipcRenderer.invoke('youtube-start-oauth', accountId),

  // YouTube OAuth settings
  getYouTubeClientId: () => ipcRenderer.invoke('get-youtube-client-id'),
  getYouTubeClientSecret: () => ipcRenderer.invoke('get-youtube-client-secret'),
  setYouTubeClientId: (clientId) => ipcRenderer.invoke('set-youtube-client-id', clientId),
  setYouTubeClientSecret: (clientSecret) => ipcRenderer.invoke('set-youtube-client-secret', clientSecret),

  // TikTok upload functions
  tiktokGetAuthUrl: () => ipcRenderer.invoke('tiktok-get-auth-url'),
  tiktokHandleAuthCallback: (code) => ipcRenderer.invoke('tiktok-handle-auth-callback', code),
  tiktokGetAccounts: () => ipcRenderer.invoke('tiktok-get-accounts'),
  tiktokUploadVideo: (videoData) => ipcRenderer.invoke('tiktok-upload-video', videoData),
  tiktokGetUploadHistory: (userId) => ipcRenderer.invoke('tiktok-get-upload-history', userId),
  tiktokRemoveAccount: (accountId) => ipcRenderer.invoke('tiktok-remove-account', accountId),
  tiktokDeleteHistoryItem: (historyId) => ipcRenderer.invoke('tiktok-delete-history-item', historyId),
  tiktokClearUploadHistory: (userId) => ipcRenderer.invoke('tiktok-clear-upload-history', userId),
  tiktokGenerateContent: (data) => ipcRenderer.invoke('tiktok-generate-content', data),
  tiktokGenerateContentFromCaption: (data) => ipcRenderer.invoke('tiktok-generate-content-from-caption', data),
  tiktokStartOAuth: (accountId = null) => ipcRenderer.invoke('tiktok-start-oauth', accountId),

  // TikTok OAuth settings
  getTikTokClientKey: () => ipcRenderer.invoke('get-tiktok-client-key'),
  getTikTokClientSecret: () => ipcRenderer.invoke('get-tiktok-client-secret'),
  setTikTokClientKey: (clientKey) => ipcRenderer.invoke('set-tiktok-client-key', clientKey),
  setTikTokClientSecret: (clientSecret) => ipcRenderer.invoke('set-tiktok-client-secret', clientSecret),

  // Gemini model selection
  getSelectedModel: () => ipcRenderer.invoke('get-selected-model'),
  setSelectedModel: (model) => ipcRenderer.invoke('set-selected-model', model),

  // Prompt management
  getPrompt: () => ipcRenderer.invoke('get-prompt'),
  setPrompt: (prompt) => ipcRenderer.invoke('set-prompt', prompt),

  // Temp directory for previews
  getTempDir: () => ipcRenderer.invoke('get-temp-dir'),

  // App data path for dynamic path resolution
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),

  // Video duration
  getVideoDuration: (videoPath) => ipcRenderer.invoke('get-video-duration', videoPath),

  // File stats
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),

  // Create video URL for large files
  createVideoUrl: (filePath) => ipcRenderer.invoke('create-video-url', filePath),

  // Video status tracking
  getAllVideoStatuses: () => ipcRenderer.invoke('get-all-video-statuses'),
  updateVideoStatus: (videoPath, updates) => ipcRenderer.invoke('update-video-status', videoPath, updates),
  getVideoStatus: (videoPath) => ipcRenderer.invoke('get-video-status', videoPath),
  deleteVideoStatus: (videoPath) => ipcRenderer.invoke('delete-video-status', videoPath),

  // Backup and restore settings
  backupSettings: () => ipcRenderer.invoke('backup-settings'),
  restoreSettings: (backupData) => ipcRenderer.invoke('restore-settings', backupData),
  exportSettingsBackup: (filePath) => ipcRenderer.invoke('export-settings-backup', filePath),
  importSettingsBackup: (filePath) => ipcRenderer.invoke('import-settings-backup', filePath),

  // Dialog functions for backup/restore
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options)
});

console.log('Preload script loaded successfully');
