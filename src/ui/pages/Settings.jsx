import React, { useState, useEffect } from 'react';

function Settings({ onBack }) {
  // Modal states
  const [showYouTubeCookiesModal, setShowYouTubeCookiesModal] = useState(false);
  const [showApifyModal, setShowApifyModal] = useState(false);
  const [showYouTubeOAuthModal, setShowYouTubeOAuthModal] = useState(false);
  const [showTikTokOAuthModal, setShowTikTokOAuthModal] = useState(false);
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showCleanModal, setShowCleanModal] = useState(false);

  // API Keys related states
  const [apiKeys, setApiKeys] = useState([]);
  const [bulkKeys, setBulkKeys] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fullApiKeys, setFullApiKeys] = useState([]);

  // YouTube Cookies states
  const [cookiesPath, setCookiesPath] = useState('');
  const [netscapeCookies, setNetscapeCookies] = useState('');
  const [jsonCookies, setJsonCookies] = useState('');
  const [isConvertingCookies, setIsConvertingCookies] = useState(false);
  const [isSavingNetscape, setIsSavingNetscape] = useState(false);

  // Apify API Key states
  const [apifyApiKey, setApifyApiKey] = useState('');

  // YouTube OAuth states
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  // TikTok OAuth states
  const [tiktokClientKey, setTiktokClientKey] = useState('');
  const [tiktokClientSecret, setTiktokClientSecret] = useState('');

  // Gemini Model states
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');

  // Prompt states
  const [customPrompt, setCustomPrompt] = useState('');

  // Backup & Restore states
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupData, setBackupData] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreText, setRestoreText] = useState('');

  // Paste from clipboard helper
  const pasteFromClipboard = async (callback) => {
    try {
      const text = await navigator.clipboard.readText();
      callback(text);
    } catch (error) {
      console.warn('Failed to paste from clipboard:', error);
      alert('Gagal mengakses clipboard. Pastikan browser memiliki izin untuk mengakses clipboard.');
    }
  };

  useEffect(() => {
    // Load existing API keys and cookies path
    loadApiKeys();
    loadCookiesPath();
    loadApifyApiKey();
    loadYouTubeCredentials();
    loadTikTokCredentials();
    loadSelectedModel();
    loadCustomPrompt();
  }, []);

  const loadApiKeys = async () => {
    try {
      const keys = await window.electronAPI.getApiKeys();
      setFullApiKeys(keys); // Store full keys for operations
      // Mask API keys for display (show first and last few characters)
      const maskedKeys = keys.map(key => ({
        ...key,
        apiKey: key.apiKey.length > 10 ?
          key.apiKey.substring(0, 6) + '...' + key.apiKey.substring(key.apiKey.length - 4) :
          key.apiKey
      }));
      setApiKeys(maskedKeys);
    } catch (error) {
      console.error('Error loading API keys:', error);
      setApiKeys([]);
      setFullApiKeys([]);
    }
  };

  const handleBulkAdd = async () => {
    if (!bulkKeys.trim()) return;

    setIsLoading(true);
    try {
      const result = await window.electronAPI.bulkAddKeys(bulkKeys);
      console.log('Bulk add result:', result);

      // Show success message with details
      if (result && result.totalInDB !== undefined) {
        alert(`API Keys Added Successfully!\n\n` +
              `Total Keys Processed: ${result.totalInput}\n` +
              `Keys Added: ${result.addedToDB}\n` +
              `Total Keys in Database: ${result.totalInDB}\n` +
              `Available Slots: ${result.availableSlots}`);
      } else if (result && result.error) {
        alert(`Error: ${result.error}`);
      } else {
        alert(`API keys added successfully!`);
      }

      setBulkKeys('');
      loadApiKeys(); // Refresh the list
    } catch (error) {
      console.error('Error adding API keys:', error);
      alert(`Error adding API keys: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidateApiKey = async (apiId) => {
    try {
      // Find the full API key
      const fullKey = fullApiKeys.find(key => key.id === apiId);
      if (!fullKey) {
      alert('Kunci API tidak ditemukan');
        return;
      }

      const result = await window.electronAPI.validateSingleApiKey(fullKey.apiKey);
      alert(`${result.isValid ? '✅ API key is valid!' : '❌ API key is invalid!'}\n${result.message}`);
      loadApiKeys(); // Refresh the list to update status
    } catch (error) {
      console.error('Error validating API key:', error);
      alert(`Error validating API key: ${error.message}`);
    }
  };

  const handleDeleteApiKey = async (apiId) => {
      if (!confirm('Apakah Anda yakin ingin menghapus kunci API ini?')) return;

    try {
      const result = await window.electronAPI.deleteApiKey(apiId);
      if (result.success) {
        alert('✅ API key deleted successfully!');
        loadApiKeys(); // Refresh the list
      } else {
        alert('❌ Failed to delete API key');
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
      alert(`Error deleting API key: ${error.message}`);
    }
  };

  const handleSetApifyApiKey = async () => {
    try {
      await window.electronAPI.setApifyApiKey(apifyApiKey.trim());
      alert('✅ Apify API key updated successfully! Processing Mode transcripts should now work.');
      loadApifyApiKey(); // Refresh to show new key
    } catch (error) {
      console.error('Error setting Apify API key:', error);
      alert(`Error setting Apify API key: ${error.message}`);
    }
  };

  const loadCookiesPath = async () => {
    try {
      const path = await window.electronAPI.getCookiesPath();
      setCookiesPath(path || '');
    } catch (error) {
      console.error('Error loading cookies path:', error);
      setCookiesPath('');
    }
  };

  const loadApifyApiKey = async () => {
    try {
      const key = await window.electronAPI.getApifyApiKey();
      setApifyApiKey(key || '');
    } catch (error) {
      console.error('Error loading Apify API key:', error);
      setApifyApiKey('');
    }
  };

  const loadYouTubeCredentials = async () => {
    try {
      const id = await window.electronAPI.getYouTubeClientId();
      const secret = await window.electronAPI.getYouTubeClientSecret();
      setClientId(id || '');
      setClientSecret(secret || '');
    } catch (error) {
      console.error('Error loading YouTube credentials:', error);
      setClientId('');
      setClientSecret('');
    }
  };

  const loadSelectedModel = async () => {
    try {
      const model = await window.electronAPI.getSelectedModel();
      setSelectedModel(model);
    } catch (error) {
      console.error('Error loading selected model:', error);
      setSelectedModel('gemini-2.0-flash');
    }
  };

  const loadCustomPrompt = async () => {
    try {
      const prompt = await window.electronAPI.getPrompt();
      setCustomPrompt(prompt || '');
    } catch (error) {
      console.error('Error loading custom prompt:', error);
      setCustomPrompt('');
    }
  };

  const loadTikTokCredentials = async () => {
    try {
      const key = await window.electronAPI.getTikTokClientKey();
      const secret = await window.electronAPI.getTikTokClientSecret();
      setTiktokClientKey(key || '');
      setTiktokClientSecret(secret || '');
    } catch (error) {
      console.error('Error loading TikTok credentials:', error);
      setTiktokClientKey('');
      setTiktokClientSecret('');
    }
  };

  const handleSetTikTokCredentials = async () => {
    try {
      // Save both Client Key and Client Secret
      if (tiktokClientKey.trim()) {
        await window.electronAPI.setTikTokClientKey(tiktokClientKey.trim());
      }
      if (tiktokClientSecret.trim()) {
        await window.electronAPI.setTikTokClientSecret(tiktokClientSecret.trim());
      }

      alert('✅ TikTok OAuth credentials updated successfully!');
      loadTikTokCredentials(); // Refresh to show new values
    } catch (error) {
      console.error('Error setting TikTok credentials:', error);
      alert(`Error setting TikTok credentials: ${error.message}`);
    }
  };

  const handleSetYouTubeCredentials = async () => {
    try {
      // Save both Client ID and Client Secret
      if (clientId.trim()) {
        await window.electronAPI.setYouTubeClientId(clientId.trim());
      }
      if (clientSecret.trim()) {
        await window.electronAPI.setYouTubeClientSecret(clientSecret.trim());
      }

      alert('✅ YouTube OAuth credentials updated successfully!');
      loadYouTubeCredentials(); // Refresh to show new values
    } catch (error) {
      console.error('Error setting YouTube credentials:', error);
      alert(`Error setting YouTube credentials: ${error.message}`);
    }
  };

  const handleSetCookiesPath = async () => {
    try {
      await window.electronAPI.setCookiesPath(cookiesPath.trim());
      alert('✅ Cookies path updated successfully! YouTube downloads should now bypass bot detection.');
      loadCookiesPath(); // Refresh to show new path
    } catch (error) {
      console.error('Error setting cookies path:', error);
      alert(`Error setting cookies path: ${error.message}`);
    }
  };

  const handleSaveNetscapeCookies = async () => {
    if (!netscapeCookies.trim()) return;

    setIsSavingNetscape(true);
    try {
      const result = await window.electronAPI.saveNetscapeCookies(netscapeCookies.trim());
      if (result.success) {
        alert(`✅ Netscape cookies saved successfully!\n\nPath: ${result.path}\n\nYouTube downloads should now work.`);
        setNetscapeCookies('');
        loadCookiesPath(); // Refresh to show new path
      } else {
        alert(`❌ Failed to save cookies: ${result.message}`);
      }
    } catch (error) {
      console.error('Error saving Netscape cookies:', error);
      alert(`❌ Failed to save cookies: ${error.message}`);
    } finally {
      setIsSavingNetscape(false);
    }
  };

  const handleConvertCookies = async () => {
    if (!jsonCookies.trim()) return;

    setIsConvertingCookies(true);
    try {
      const result = await window.electronAPI.convertAndSaveCookies(jsonCookies.trim());
      if (result.success) {
        alert(`✅ Cookies converted and saved successfully!\n\nPath: ${result.path}\n\nYouTube downloads should now work.`);
        setJsonCookies('');
        loadCookiesPath(); // Refresh to show new path
      } else {
        alert(`❌ Failed to convert cookies: ${result.message}`);
      }
    } catch (error) {
      console.error('Error converting cookies:', error);
      alert(`❌ Failed to convert cookies: ${error.message}`);
    } finally {
      setIsConvertingCookies(false);
    }
  };

  const handleSetModel = async (model) => {
    try {
      await window.electronAPI.setSelectedModel(model);
      setSelectedModel(model);
      alert(`✅ Model berhasil diubah ke: ${model}`);
    } catch (error) {
      console.error('Error setting model:', error);
      alert(`❌ Gagal mengubah model: ${error.message}`);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'invalid': return 'text-red-400';
      case 'pending': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const handleDeleteTempFiles = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus semua file temp? Ini tidak dapat dibatalkan.')) return;

    setIsLoading(true);
    try {
      const result = await window.electronAPI.deleteTempFiles();
      if (result.success) {
        alert('✅ Temp files berhasil dihapus!\n\n' + result.message);
      } else {
        alert('⚠️ Beberapa file temp gagal dihapus.\n\n' + result.message);
      }
    } catch (error) {
      console.error('Error deleting temp files:', error);
      alert(`❌ Gagal menghapus file temp: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-cyan-400 mr-4"
        >
          ← Kembali
        </button>
        <h1 className="page-title">Pengaturan</h1>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* YouTube Cookies */}
        <div
          className="liquid-card p-6 cursor-pointer hover:bg-gray-800/60 transition-colors"
          onClick={() => setShowYouTubeCookiesModal(true)}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">🍪</div>
            <h3 className="text-lg font-semibold mb-2 text-red-400">YouTube Cookies</h3>
            <p className="text-sm text-gray-400">REQUIRED for Downloads</p>
            {cookiesPath ? (
              <div className="mt-3 text-xs text-green-400">✅ Configured</div>
            ) : (
              <div className="mt-3 text-xs text-red-400">❌ Not Set</div>
            )}
          </div>
        </div>

        {/* Apify API Key */}
        <div
          className="liquid-card p-6 cursor-pointer hover:bg-gray-800/60 transition-colors"
          onClick={() => setShowApifyModal(true)}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">📄</div>
            <h3 className="text-lg font-semibold mb-2 text-green-400">Apify API Key</h3>
            <p className="text-sm text-gray-400">REQUIRED for Processing Mode</p>
            {apifyApiKey ? (
              <div className="mt-3 text-xs text-green-400">✅ Configured</div>
            ) : (
              <div className="mt-3 text-xs text-red-400">❌ Not Set</div>
            )}
          </div>
        </div>

        {/* YouTube OAuth Credentials */}
        <div
          className="liquid-card p-6 cursor-pointer hover:bg-gray-800/60 transition-colors"
          onClick={() => setShowYouTubeOAuthModal(true)}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">📤</div>
            <h3 className="text-lg font-semibold mb-2 text-red-400">YouTube OAuth Credentials</h3>
            <p className="text-sm text-gray-400">Required for YouTube uploads</p>
            {clientId && clientSecret ? (
              <div className="mt-3 text-xs text-green-400">✅ Configured</div>
            ) : (
              <div className="mt-3 text-xs text-red-400">❌ Not Set</div>
            )}
          </div>
        </div>

        {/* TikTok OAuth Credentials */}
        <div
          className="liquid-card p-6 cursor-pointer hover:bg-gray-800/60 transition-colors"
          onClick={() => setShowTikTokOAuthModal(true)}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">🎵</div>
            <h3 className="text-lg font-semibold mb-2 text-pink-400">TikTok OAuth Credentials</h3>
            <p className="text-sm text-gray-400">Required for TikTok uploads</p>
            {tiktokClientKey && tiktokClientSecret ? (
              <div className="mt-3 text-xs text-green-400">✅ Configured</div>
            ) : (
              <div className="mt-3 text-xs text-red-400">❌ Not Set</div>
            )}
          </div>
        </div>

        {/* Bulk Add API Keys, Gemini AI Model Selection, Manage API Keys */}
        <div
          className="liquid-card p-6 cursor-pointer hover:bg-gray-800/60 transition-colors"
          onClick={() => setShowApiKeysModal(true)}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-lg font-semibold mb-2 text-purple-400">Bulk Add API Keys</h3>
            <p className="text-sm text-gray-400">Gemini AI Model Selection & Manage API Keys</p>
            <div className="mt-3 text-xs text-cyan-400">{apiKeys.length} Keys • {selectedModel}</div>
          </div>
        </div>

        {/* Manage Prompt */}
        <div
          className="liquid-card p-6 cursor-pointer hover:bg-gray-800/60 transition-colors"
          onClick={() => setShowPromptModal(true)}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-lg font-semibold mb-2">Manage Prompt</h3>
            <p className="text-sm text-gray-400">Customize AI prompt for clip analysis</p>
            <div className="mt-3 text-xs text-green-400">✅ Configured</div>
          </div>
        </div>

        {/* Backup & Restore Settings */}
        <div
          className="liquid-card p-6 cursor-pointer hover:bg-gray-800/60 transition-colors"
          onClick={() => setShowBackupModal(true)}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">💾</div>
            <h3 className="text-lg font-semibold mb-2 text-blue-400">Backup & Restore Settings</h3>
            <p className="text-sm text-gray-400">Backup and restore all settings</p>
            {backupData ? (
              <div className="mt-3 text-xs text-green-400">📋 Has Backup</div>
            ) : (
              <div className="mt-3 text-xs text-gray-400">No Backup</div>
            )}
          </div>
        </div>

        {/* Clean Processing Files */}
        <div
          className="liquid-card p-6 cursor-pointer hover:bg-gray-800/60 transition-colors md:col-span-2 lg:col-span-1"
          onClick={() => setShowCleanModal(true)}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">🗑️</div>
            <h3 className="text-lg font-semibold mb-2 text-orange-400">Clean Processing Files</h3>
            <p className="text-sm text-gray-400">Clean temp files from processing</p>
            <div className="mt-3 text-xs text-orange-400">⚠️ Action Required</div>
          </div>
        </div>
      </div>

        {/* YouTube Cookies Modal */}
        {showYouTubeCookiesModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-hidden m-4">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-gray-900 z-10 pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">🍪 YouTube Cookies - REQUIRED for Downloads</h2>
                  <button
                    onClick={() => setShowYouTubeCookiesModal(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-auto max-h-[calc(80vh-6rem)] pt-4">
                <div className="mb-6">
                  <p className="text-red-400 mb-4">
                    <strong>YouTube now requires cookies for all downloads</strong> to bypass bot detection.
                    Without cookies, downloads will fail with "Sign in to confirm you're not a bot" error.
                  </p>

                  {!cookiesPath && (
                    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
                      <p className="text-red-300 text-sm">
                        🚨 <strong>No cookies file configured.</strong> YouTube downloads will fail until you set this up.
                      </p>
                    </div>
                  )}

                  <p className="text-gray-300 mb-4">
                    <strong>How to export cookies:</strong><br/>
                    1. Install the <strong>"Get Cookies.txt LOCALLY"</strong> extension for <strong>Chrome</strong>/<strong>Firefox</strong><br/>
                    2. Visit <strong>YouTube.com</strong> and make sure you're logged in<br/>
                    3. Use the extension to export cookies to a .txt file<br/>
                    4. Copy the full path and paste it below
                  </p>

                  <div className="flex space-x-4">
                    <input
                      type="text"
                      value={cookiesPath}
                      onChange={(e) => setCookiesPath(e.target.value)}
                      className="glass-input flex-1 p-4"
                      placeholder="C:\Users\YourName\Downloads\youtube_cookies.txt"
                    />
                    <button
                      onClick={handleSetCookiesPath}
                      className="neon-button px-6 py-2 rounded-lg font-semibold"
                    >
                      Save Path
                    </button>
                  </div>

                  {cookiesPath && (
                    <p className="text-green-400 text-sm mt-2">
                      ✅ Cookies path configured: {cookiesPath}
                    </p>
                  )}
                </div>

                {/* Netscape Cookies Importer */}
                <div className="border-t border-gray-600 pt-6 mb-6">
                  <h4 className="text-lg font-semibold mb-3 text-cyan-400">📋 Netscape Cookies Import</h4>
                  <p className="text-gray-300 text-sm mb-4">
                    If you already have cookies in Netscape format (from yt-dlp or browser export), paste them here:
                  </p>
                  <div className="relative">
                    <textarea
                      value={netscapeCookies}
                      onChange={(e) => setNetscapeCookies(e.target.value)}
                      className="glass-textarea w-full h-32 p-4 mb-4 pr-12"
                      placeholder="# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	1794203314	LOGIN_INFO	AFmmF2sw..."
                      disabled={isSavingNetscape}
                    />
                    <button
                      type="button"
                      onClick={() => pasteFromClipboard(setNetscapeCookies)}
                      className="absolute right-2 top-2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                      title="Paste from clipboard"
                      disabled={isSavingNetscape}
                    >
                      📋
                    </button>
                  </div>
                  <button
                    onClick={handleSaveNetscapeCookies}
                    disabled={isSavingNetscape || !netscapeCookies.trim()}
                    className="neon-button px-6 py-2 rounded-lg font-semibold mr-4"
                  >
                    {isSavingNetscape ? 'Saving...' : 'Save Netscape Cookies'}
                  </button>
                </div>

                {/* JSON Cookies Converter */}
                <div className="border-t border-gray-600 pt-6">
                  <h4 className="text-lg font-semibold mb-3 text-cyan-400">🔄 Chrome JSON Cookies Import</h4>
                  <p className="text-gray-300 text-sm mb-4">
                    If you have Chrome developer cookies export, paste them here and we'll convert them automatically:
                  </p>
                  <textarea
                    value={jsonCookies}
                    onChange={(e) => setJsonCookies(e.target.value)}
                    className="glass-textarea w-full h-32 p-4 mb-4"
                    placeholder={`[{"domain": ".youtube.com", "name": "LOGIN_INFO", "value": "..."}, ...]`}
                    disabled={isConvertingCookies}
                  />
                  <button
                    onClick={handleConvertCookies}
                    disabled={isConvertingCookies || !jsonCookies.trim()}
                    className="neon-button px-6 py-2 rounded-lg font-semibold"
                  >
                    {isConvertingCookies ? 'Converting...' : 'Convert & Save Cookies'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Apify API Key Modal */}
        {showApifyModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden m-4">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-gray-900 z-10 pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">📄 Apify API Key - REQUIRED for Processing Mode</h2>
                  <button
                    onClick={() => setShowApifyModal(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-auto max-h-[calc(80vh-6rem)] pt-4">
                <div className="mb-6">
                  <p className="text-green-400 mb-4">
                    <strong>Processing Mode uses Apify to fetch YouTube transcripts.</strong>
                    Get your API key from <a href="https://apify.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">https://apify.com</a>.
                  </p>

                  {!apifyApiKey && (
                    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
                      <p className="text-red-300 text-sm">
                        🚨 <strong>No Apify API key configured.</strong> Processing Mode transcripts will not work.
                      </p>
                    </div>
                  )}

                  <p className="text-gray-300 mb-4">
                    <strong>How to get Apify API key:</strong><br/>
                    1. Sign up for an account at <a href="https://apify.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">https://apify.com</a><br/>
                    2. Go to Settings → Integrations and copy your API key<br/>
                    3. Paste it below to enable Processing Mode transcripts
                  </p>

                  <div className="flex space-x-4">
                    <div className="relative flex-1">
                      <input
                        type="password"
                        value={apifyApiKey}
                        onChange={(e) => setApifyApiKey(e.target.value)}
                        className="glass-input w-full p-4 pr-12"
                        placeholder="Enter your Apify API key..."
                      />
                      <button
                        type="button"
                        onClick={() => pasteFromClipboard(setApifyApiKey)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                        title="Paste from clipboard"
                      >
                        📋
                      </button>
                    </div>
                    <button
                      onClick={handleSetApifyApiKey}
                      className="neon-button px-6 py-2 rounded-lg font-semibold"
                    >
                      Save Key
                    </button>
                  </div>

                  {apifyApiKey && (
                    <p className="text-green-400 text-sm mt-2">
                      ✅ Apify API key configured
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* YouTube OAuth Credentials Modal */}
        {showYouTubeOAuthModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden m-4">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-gray-900 z-10 pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">📤 YouTube OAuth Credentials</h2>
                  <button
                    onClick={() => setShowYouTubeOAuthModal(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-auto max-h-[calc(80vh-6rem)] pt-4">
                <div className="mb-6">
                  <p className="text-red-400 mb-4">
                    <strong>Required for YouTube uploads.</strong> Configure OAuth credentials to enable YouTube account connection and video uploads.
                  </p>

                  {!clientId && !clientSecret && (
                    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
                      <p className="text-red-300 text-sm">
                        🚨 <strong>YouTube OAuth credentials not configured.</strong> YouTube upload features will not work until you set up these credentials.
                      </p>
                    </div>
                  )}

                  <p className="text-gray-300 mb-4">
                    <strong>How to get Google OAuth credentials:</strong><br/>
                    1. Go to <a href="https://console.developers.google.com/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Google Cloud Console</a><br/>
                    2. Create a new project or select existing one<br/>
                    3. Enable the YouTube Data API v3<br/>
                    4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"<br/>
                    5. Set application type to "Desktop application"<br/>
                    6. Copy the Client ID and Client Secret below
                  </p>

                  <div className="grid grid-cols-1 gap-6">
                    {/* Client ID */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Client ID</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          className="glass-input w-full p-4 pr-12"
                          placeholder="Enter your Google Client ID..."
                        />
                        <button
                          type="button"
                          onClick={() => pasteFromClipboard(setClientId)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                          title="Paste from clipboard"
                        >
                          📋
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Your OAuth 2.0 Client ID from Google Cloud Console
                      </p>
                    </div>

                    {/* Client Secret */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Client Secret</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                          className="glass-input w-full p-4 pr-12"
                          placeholder="Enter your Google Client Secret..."
                        />
                        <button
                          type="button"
                          onClick={() => pasteFromClipboard(setClientSecret)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                          title="Paste from clipboard"
                        >
                          📋
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Your OAuth 2.0 Client Secret from Google Cloud Console
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <button
                      onClick={handleSetYouTubeCredentials}
                      disabled={!clientId.trim() && !clientSecret.trim()}
                      className="neon-button px-6 py-2 rounded-lg font-semibold"
                    >
                      Save Credentials
                    </button>
                  </div>

                  {clientId && clientSecret && (
                    <p className="text-green-400 text-sm mt-2">
                      ✅ YouTube OAuth credentials configured - You can now add YouTube accounts in the Upload tab
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TikTok OAuth Credentials Modal */}
        {showTikTokOAuthModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden m-4">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-gray-900 z-10 pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">🎵 TikTok OAuth Credentials</h2>
                  <button
                    onClick={() => setShowTikTokOAuthModal(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-auto max-h-[calc(80vh-6rem)] pt-4">
                <div className="mb-6">
                  <p className="text-pink-400 mb-4">
                    <strong>Required for TikTok uploads.</strong> Configure OAuth credentials to enable TikTok account connection and video uploads.
                  </p>

                  {!tiktokClientKey && !tiktokClientSecret && (
                    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
                      <p className="text-red-300 text-sm">
                        🚨 <strong>TikTok OAuth credentials not configured.</strong> TikTok upload features will not work until you set up these credentials.
                      </p>
                    </div>
                  )}

                  <p className="text-gray-300 mb-4">
                    <strong>How to get TikTok OAuth credentials:</strong><br/>
                    1. Go to <a href="https://developers.tiktok.com/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">TikTok for Developers</a><br/>
                    2. Create a new app or select existing one<br/>
                    3. Go to "App Details" → "App Credentials"<br/>
                    4. Copy the Client Key and Client Secret below
                  </p>

                  <div className="grid grid-cols-1 gap-6">
                    {/* Client Key */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Client Key</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={tiktokClientKey}
                          onChange={(e) => setTiktokClientKey(e.target.value)}
                          className="glass-input w-full p-4 pr-12"
                          placeholder="Enter your TikTok Client Key..."
                        />
                        <button
                          type="button"
                          onClick={() => pasteFromClipboard(setTiktokClientKey)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                          title="Paste from clipboard"
                        >
                          📋
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Your Client Key from TikTok Developers
                      </p>
                    </div>

                    {/* Client Secret */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Client Secret</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={tiktokClientSecret}
                          onChange={(e) => setTiktokClientSecret(e.target.value)}
                          className="glass-input w-full p-4 pr-12"
                          placeholder="Enter your TikTok Client Secret..."
                        />
                        <button
                          type="button"
                          onClick={() => pasteFromClipboard(setTiktokClientSecret)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                          title="Paste from clipboard"
                        >
                          📋
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Your Client Secret from TikTok Developers
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <button
                      onClick={handleSetTikTokCredentials}
                      disabled={!tiktokClientKey.trim() && !tiktokClientSecret.trim()}
                      className="neon-button px-6 py-2 rounded-lg font-semibold"
                    >
                      Save Credentials
                    </button>
                  </div>

                  {tiktokClientKey && tiktokClientSecret && (
                    <p className="text-green-400 text-sm mt-2">
                      ✅ TikTok OAuth credentials configured - You can now add TikTok accounts in the Upload tab
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API Keys Modal */}
        {showApiKeysModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-5xl w-full max-h-[90vh] overflow-hidden m-4">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-gray-900 z-10 pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">🤖 Bulk Add API Keys, Gemini AI Model Selection & Manage API Keys</h2>
                  <button
                    onClick={() => setShowApiKeysModal(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-auto max-h-[calc(90vh-6rem)] pt-4">
                {/* Bulk Add Section */}
                <div className="mb-8">
                  <h3 className="text-xl font-semibold mb-4 text-purple-400">Bulk Add API Keys</h3>
                  <p className="text-gray-300 mb-4">
                    Paste multiple Gemini API keys below (one per line). Keys will be validated before adding.
                  </p>
                  <div className="relative">
                    <textarea
                      value={bulkKeys}
                      onChange={(e) => setBulkKeys(e.target.value)}
                      className="glass-textarea w-full h-32 p-4 mb-4 pr-12"
                      placeholder="Paste your API keys here..."
                    />
                    <button
                      type="button"
                      onClick={() => pasteFromClipboard(setBulkKeys)}
                      className="absolute right-2 top-2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                      title="Paste from clipboard"
                    >
                      📋
                    </button>
                  </div>
                  <button
                    onClick={handleBulkAdd}
                    disabled={isLoading || !bulkKeys.trim()}
                    className="neon-button px-6 py-2 rounded-lg font-semibold"
                  >
                    {isLoading ? 'Adding...' : 'Add API Keys'}
                  </button>
                </div>

                {/* Gemini Model Selection */}
                <div className="mb-8">
                  <h3 className="text-xl font-semibold mb-4 text-purple-400">🤖 Gemini AI Model Selection</h3>
                  <p className="text-gray-300 mb-6">
                    <strong className="text-purple-400">Pilih model Gemini AI yang ingin digunakan</strong> untuk semua fitur AI dalam aplikasi (YouTube content generation, dll).
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Model Saat Ini</label>
                      <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-white font-medium">{selectedModel}</span>
                            <p className="text-sm text-gray-400 mt-1">
                              {selectedModel === 'gemini-2.5-flash' ?
                                'Model terbaru dengan kemampuan advanced' :
                                'Model stabil yang telah terbukti handal'
                              }
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-cyan-400 bg-cyan-900/30 px-2 py-1 rounded">
                              ACTIVE
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Pilih Model Baru</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                          onClick={() => handleSetModel('gemini-2.0-flash')}
                          disabled={selectedModel === 'gemini-2.0-flash'}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            selectedModel === 'gemini-2.0-flash'
                              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                              : 'border-gray-600 hover:border-cyan-400 hover:bg-cyan-400/5 text-gray-300 hover:text-white'
                          }`}
                        >
                          <div className="font-medium mb-1">Gemini 2.0 Flash</div>
                          <p className="text-xs opacity-75">Model stabil dan reliable</p>
                          {selectedModel === 'gemini-2.0-flash' && (
                            <div className="mt-2 text-xs text-cyan-400">✓ Dipilih</div>
                          )}
                        </button>

                        <button
                          onClick={() => handleSetModel('gemini-2.5-flash')}
                          disabled={selectedModel === 'gemini-2.5-flash'}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            selectedModel === 'gemini-2.5-flash'
                              ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                              : 'border-gray-600 hover:border-purple-400 hover:bg-purple-400/5 text-gray-300 hover:text-white'
                          }`}
                        >
                          <div className="font-medium mb-1">Gemini 2.5 Flash</div>
                          <p className="text-xs opacity-75">Model terbaru dengan kemampuan advanced</p>
                          {selectedModel === 'gemini-2.5-flash' && (
                            <div className="mt-2 text-xs text-purple-400">✓ Dipilih</div>
                          )}
                        </button>
                      </div>

                      <div className="mt-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                        <h4 className="text-sm font-medium text-blue-400 mb-2">ℹ️ Info Model</h4>
                        <div className="text-xs text-gray-300 space-y-1">
                          <p>• <strong>Gemini 2.0 Flash</strong>: Model yang sudah matang, stabil, dan hemat token</p>
                          <p>• <strong>Gemini 2.5 Flash</strong>: Model terbaru dengan kemampuan yang lebih baik, tapi mungkin lebih mahal</p>
                          <p>• Pengaturan ini berlaku untuk semua fitur AI di aplikasi</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Manage API Keys Section */}
                <div>
                  <h3 className="text-xl font-semibold mb-4">🔑 Manage API Keys</h3>
                  <div className="mb-6">
                    <p className="text-gray-300 mb-4">
                      Here you can manage your Gemini API keys. Use the bulk add section above or add individual keys here.
                    </p>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm text-gray-400">
                        Total Keys: {apiKeys.length}
                      </span>
                      <button
                        onClick={loadApiKeys}
                        className="text-cyan-400 hover:text-cyan-300 text-sm"
                        disabled={isLoading}
                      >
                        🔄 Refresh
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {apiKeys.length > 0 ? (
                      apiKeys.map(key => (
                        <div key={key.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-600/30">
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="font-mono text-white">{key.apiKey}</div>
                              <div className="mt-1">
                                <span className={`text-sm ${getStatusColor(key.status)}`}>
                                  {key.status.toUpperCase()}
                                </span>
                                <span className="ml-4 text-xs text-gray-400">
                                  Added: {new Date(key.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <div className="flex space-x-2 ml-4">
                              <button
                                onClick={() => handleValidateApiKey(key.id)}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm px-3 py-1 rounded font-medium transition-colors"
                                disabled={isLoading}
                              >
                                Check Valid
                              </button>
                              <button
                                onClick={() => handleDeleteApiKey(key.id)}
                                className="bg-red-600 hover:bg-red-500 text-white text-sm px-3 py-1 rounded font-medium transition-colors"
                                disabled={isLoading}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12">
                        <div className="text-4xl mb-4">🔑</div>
                        <p className="text-gray-400">No API keys added yet.</p>
                        <p className="text-sm text-gray-500 mt-2">Use the bulk add section above to add your first API keys.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Prompt Modal */}
        {showPromptModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-hidden m-4">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-gray-900 z-10 pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">💬 Edit AI Prompt</h2>
                  <button
                    onClick={() => setShowPromptModal(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-auto max-h-[calc(80vh-6rem)] pt-4">
                <div className="mb-6">
                  <p className="text-gray-300 mb-4">
                    Customize the AI prompt used for video clip analysis. This prompt determines how the AI analyzes transcripts and generates viral clips.
                  </p>
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
                    <h4 className="text-sm font-medium text-blue-400 mb-2">ℹ️ How it works</h4>
                    <div className="text-xs text-gray-300 space-y-2">
                      <p>• The prompt is used when analyzing YouTube videos for viral clips</p>
                      <p>• Leave empty to use the default prompt</p>
                      <p>• Changes take effect immediately for new analyses</p>

                      <div className="mt-3 p-3 bg-gray-800/50 rounded border-l-2 border-cyan-400">
                        <p className="font-medium text-cyan-300 mb-1">💡 Cara menggunakan AI untuk memperbaiki prompt:</p>
                        <p className="mb-2">1. Copy "Current Prompt" di atas</p>
                        <p className="mb-2">2. Paste ke AI tools (ChatGPT, Claude, dll)</p>
                        <p className="mb-2">3. Berikan instruksi seperti ini:</p>
                        <div className="bg-gray-900/50 p-2 rounded text-xs font-mono mt-2">
                          "tolong buatkan atau perbaiki prompt ini agar lebih sempurna lagi dan sesuai dengan yang dibicarakan, hashtag, suggested_caption, content_type agar lebih sesuai dan yang dilarang tolong jangan diubah"
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Current Prompt Display */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">Current Prompt (Read-Only)</label>
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600/30 max-h-64 overflow-y-auto">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                        {customPrompt || `ROLE
You are an expert Social Media Strategist and Video Editor for TikTok/Reels. You possess a "viral sense" to identify moments that maintain high retention.

GOAL
Extract the TOP 5-10 most engaging clips from the transcript provided below.
The clips must be punchy, standalone, and attention-grabbing (Vertical Video Format).

INPUT DATA
TRANSCRIPT_STATUS: \${transcriptStatus}
DATA:
\${transcriptStatus === "AVAILABLE" ? transcriptText.substring(0, 800000) : "TRANSCRIPT: NOT_AVAILABLE"}

STRICT EDITING RULES (MUST FOLLOW):

1. DURATION CONTROL (CRITICAL):
   - MINIMUM: 30 Seconds (Absolutely NO clips under 30s).
   - MAXIMUM: 90 Seconds.
   - LOGIC: If a potential viral segment is only 15-20 seconds, you MUST include the sentences immediately BEFORE (setup) or AFTER (context) it to extend the duration until it hits at least 30 seconds.

2. THE "HOOK" PRINCIPLE:
   - The "start" timestamp MUST align with a strong opening line (Start of a sentence).
   - Good Hooks: A question, a controversial statement, high energy, or "Did you know?".
   - Bad Hooks: "Um..", "So...", silence, or starting in the middle of a sentence.

3. STANDALONE CONTEXT:
   - The clip must tell a complete mini-story or deliver a complete tip.
   - It must NOT end abruptly in the middle of a sentence.

4. LANGUAGE & TONE:
   - Detect the language of the transcript automatically.
   - "Reason" and "Caption" MUST be in the SAME language as the transcript.
   - Caption style: Casual, viral, social-media native.

5. NO EMOJIS POLICY (STRICT):
   - You must NOT use any emojis (e.g., 🔥, 🚀, 😂) in the "reason" or "suggested_caption".
   - The output must be PLAIN TEXT ONLY.
   - Exception: The symbol "#" is ALLOWED for hashtags.

6. HASHTAG INTEGRATION:
   - Do NOT create a separate JSON field for hashtags.
   - You MUST append 3-5 relevant, high-traffic viral hashtags at the VERY END of the "suggested_caption".
   - Leave a blank line before the hashtags.

7. ACCURATE CATEGORIZATION:
   - You MUST classify each clip into one of the following specific categories based on its content:
     "Education", "Trending Today", "Sex/Relationships", "Movie Spoiler", "Politics", "Tutorial", "Podcast Highlight", "FYP/Viral", "Comedy", "Drama", or "Motivation".

OUTPUT FORMAT
- Return ONLY a raw JSON array.
- Do NOT use Markdown formatting (no \`\`\`json).
- Do NOT add any introductory text.

JSON STRUCTURE
[
  {
    "start": "MM:SS",
    "end": "MM:SS",
    "duration_seconds": 45,
    "virality_score": 9.5,
    "reason": "[Why is this viral? Write in Transcript Language. NO EMOJIS]",
    "suggested_caption": "Hook Headline [Transcript Language]\\n\\nEngaging summary/question for the audience... [NO EMOJIS]\\n\\n#ViralTag #TopicTag #Trending",
    "content_type": "Select from: Education, Trending Today, Sex/Relationships, Movie Spoiler, Politics, Tutorial, Podcast Highlight, FYP/Viral, Comedy, Drama, or Motivation",
    "transcript_excerpt": "The first few words of the clip..."
  }
]

\${transcriptStatus === "NOT_AVAILABLE" ? "Output: []" : "Action: Find 5-10 viral clips. STRICTLY follow the 30s minimum rule. NO EMOJIS allowed. Include hashtags inside the caption. Output JSON only."}`}
                      </pre>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      This is the prompt currently being used by the AI. You can copy this to ask AI tools or modify it below.
                    </p>
                  </div>

                  {/* Custom Prompt Editor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">Edit Custom Prompt</label>
                    <div className="relative">
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        className="glass-textarea w-full h-96 p-4 pr-12 text-sm"
                        placeholder="Enter your custom AI prompt here... Leave empty to use default prompt."
                      />
                      <button
                        type="button"
                        onClick={() => pasteFromClipboard(setCustomPrompt)}
                        className="absolute right-2 top-2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                        title="Paste from clipboard"
                      >
                        📋
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Leave empty to use the default prompt shown above. Custom prompts override the default.
                    </p>
                  </div>

                  <div className="flex justify-end space-x-4">
                    <button
                      onClick={() => {
                        setCustomPrompt('');
                        loadCustomPrompt();
                      }}
                      className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                    >
                      Reset to Default
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await window.electronAPI.setPrompt(customPrompt);
                          alert('✅ Prompt updated successfully!');
                          setShowPromptModal(false);
                        } catch (error) {
                          console.error('Error saving prompt:', error);
                          alert(`❌ Failed to save prompt: ${error.message}`);
                        }
                      }}
                      className="neon-button px-6 py-2 rounded-lg font-semibold"
                    >
                      Save Prompt
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Backup Modal */}
        {showBackupModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-hidden m-4">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-gray-900 z-10 pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">💾 Backup & Restore Settings</h2>
                  <button
                    onClick={() => setShowBackupModal(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-auto max-h-[calc(90vh-6rem)] pt-4">
                <div className="mb-6">
                  <p className="text-blue-400 mb-4">
                    <strong>Backup semua pengaturan sensitif</strong> seperti API keys, client secrets, dan konfigurasi lainnya.
                    Backup dapat di-restore kapan saja untuk memulihkan semua pengaturan.
                  </p>
                </div>

                {/* Backup Section */}
                <div className="mb-8">
                  <h3 className="text-xl font-semibold mb-4 text-cyan-400">📤 Create Backup</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    Buat backup dari semua pengaturan (API keys, client secrets, model selection, dll).
                    Backup akan tersimpan dalam memori aplikasi.
                  </p>
                  <button
                    onClick={async () => {
                      if (!confirm('Buat backup dari semua pengaturan? Backup akan tersimpan dalam aplikasi.')) return;

                      setIsBackingUp(true);
                      try {
                        const result = await window.electronAPI.backupSettings();
                        if (result.success) {
                          setBackupData(JSON.stringify(result.data, null, 2));
                          alert('✅ Backup berhasil dibuat!\n\nData backup tersimpan dalam aplikasi.');
                        } else {
                          alert(`❌ Gagal membuat backup: ${result.error}`);
                        }
                      } catch (error) {
                        console.error('Error creating backup:', error);
                        alert(`❌ Error: ${error.message}`);
                      } finally {
                        setIsBackingUp(false);
                      }
                    }}
                    disabled={isBackingUp}
                    className="neon-button px-6 py-2 rounded-lg font-semibold mr-4"
                  >
                    {isBackingUp ? '🔄 Membuat Backup...' : '📤 Buat Backup'}
                  </button>

                  <button
                    onClick={async () => {
                      if (!backupData.trim()) {
                        alert('❌ Tidak ada data backup. Buat backup terlebih dahulu.');
                        return;
                      }

                      try {
                        const result = await window.electronAPI.exportSettingsBackup(
                          await window.electronAPI.showSaveDialog({
                            title: 'Simpan Backup Settings',
                            defaultPath: `autocliper_backup_${new Date().toISOString().slice(0, 10)}.json`,
                            filters: [{ name: 'JSON Files', extensions: ['json'] }]
                          })
                        );

                        if (result.success) {
                          alert(`✅ Backup berhasil diekspor!\n\nLokasi: ${result.filePath}`);
                        } else {
                          alert(`❌ Gagal mengekspor backup: ${result.error}`);
                        }
                      } catch (error) {
                        console.error('Error exporting backup:', error);
                        alert(`❌ Error: ${error.message}`);
                      }
                    }}
                    disabled={!backupData.trim() || isExporting}
                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold"
                  >
                    {isExporting ? '🔄 Mengekspor...' : '💾 Ekspor ke File'}
                  </button>
                </div>

                {/* Restore Section */}
                <div>
                  <h3 className="text-xl font-semibold mb-4 text-orange-400">📥 Restore Settings</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    <strong className="text-red-400">PERINGATAN: Restore akan mengganti semua pengaturan saat ini!</strong><br/>
                    Pastikan Anda telah membuat backup sebelum melakukan restore.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <button
                      onClick={() => {
                        setShowRestoreModal(true);
                        setRestoreText('');
                      }}
                      disabled={isRestoring}
                      className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-lg font-semibold"
                    >
                      {isRestoring ? '🔄 Memulihkan...' : '📋 Restore dari Text'}
                    </button>

                    <button
                      onClick={async () => {
                        if (!confirm('⚠️ RESTORE akan MENGGANTI semua pengaturan saat ini!\n\nApakah Anda yakin ingin melanjutkan?')) return;

                        try {
                          const filePath = await window.electronAPI.showOpenDialog({
                            title: 'Pilih File Backup',
                            filters: [{ name: 'JSON Files', extensions: ['json'] }],
                            properties: ['openFile']
                          });

                          if (filePath) {
                            setIsRestoring(true);
                            const result = await window.electronAPI.importSettingsBackup(filePath);

                            if (result.success) {
                              alert('✅ Settings berhasil di-restore dari file!\n\nAplikasi akan dimuat ulang untuk menerapkan perubahan.');
                              setShowBackupModal(false);
                              // Reload the page to apply restored settings
                              window.location.reload();
                            } else {
                              alert(`❌ Gagal restore settings: ${result.error}`);
                            }
                          }
                        } catch (error) {
                          console.error('Error importing backup:', error);
                          alert(`❌ Error: ${error.message}`);
                        } finally {
                          setIsRestoring(false);
                        }
                      }}
                      disabled={isRestoring}
                      className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-semibold"
                    >
                      {isRestoring ? '🔄 Memulihkan...' : '📁 Restore dari File'}
                    </button>
                  </div>
                </div>

                {/* Backup Data Display */}
                {backupData && (
                  <div className="border-t border-gray-600 pt-6">
                    <h3 className="text-xl font-semibold mb-4 text-green-400">📋 Backup Data (JSON)</h3>
                    <p className="text-gray-300 text-sm mb-4">
                      Data backup dalam format JSON. Anda dapat menyalin ini untuk disimpan secara manual.
                    </p>
                    <div className="relative">
                      <textarea
                        value={backupData}
                        readOnly
                        className="glass-textarea w-full h-48 p-4 text-xs font-mono"
                        placeholder="Backup data akan muncul di sini..."
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(backupData);
                          alert('✅ Backup data berhasil disalin ke clipboard!');
                        }}
                        className="absolute right-2 top-2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                        title="Copy to clipboard"
                      >
                        📋
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      ⚠️ Jaga kerahasiaan data ini - berisi API keys dan informasi sensitif lainnya.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Clean Processing Files Modal */}
        {showCleanModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden m-4">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-gray-900 z-10 pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">🗑️ Clean Processing Files</h2>
                  <button
                    onClick={() => setShowCleanModal(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-auto max-h-[calc(80vh-6rem)] pt-4">
                <div className="mb-6">
                  <p className="text-orange-400 mb-4">
                    Bersihkan semua file yang dihasilkan dari proses download, potongan clip, dan auto caption (termasuk video dan caption files).
                    File transcript akan dipertahankan untuk penggunaan di masa depan.
                  </p>

                  <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
                    <p className="text-red-300 text-sm">
                      <strong>⚠️ PERINGATAN:</strong> Tindakan ini tidak dapat dibatalkan!
                      Pastikan Anda telah mencadangkan file penting sebelum melanjutkan.
                    </p>
                  </div>

                  <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600/30 mb-6">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">File yang akan dihapus:</h4>
                    <ul className="text-xs text-gray-400 space-y-1">
                      <li>• Video clips yang telah dipotong</li>
                      <li>• File caption/subtitle yang dihasilkan</li>
                      <li>• File video sementara dari download</li>
                      <li>• File processing cache</li>
                    </ul>
                    <h4 className="text-sm font-medium text-gray-300 mt-3 mb-2">File yang dipertahankan:</h4>
                    <ul className="text-xs text-green-400 space-y-1">
                      <li>• File transcript asli</li>
                      <li>• Pengaturan aplikasi</li>
                      <li>• API keys dan konfigurasi</li>
                    </ul>
                  </div>
                </div>

                <div className="flex justify-end space-x-4">
                  <button
                    onClick={() => setShowCleanModal(false)}
                    className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteTempFiles}
                    disabled={isLoading}
                    className="neon-button-danger px-6 py-2 rounded-lg font-semibold flex items-center space-x-2"
                  >
                    <span>🗑️</span>
                    <span>{isLoading ? 'Cleaning...' : 'Clean Processing Files'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Restore Modal */}
        {showRestoreModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden m-4">
              {/* Header */}
              <div className="pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">📥 Restore Settings from Text</h2>
                  <button
                    onClick={() => setShowRestoreModal(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="pt-4">
                <div className="mb-6">
                  <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-4">
                    <p className="text-red-300 text-sm">
                      <strong>⚠️ PERINGATAN:</strong> Restore akan <strong>MENGGANTI</strong> semua pengaturan saat ini!
                      Pastikan Anda telah membuat backup sebelum melanjutkan.
                    </p>
                  </div>

                  <p className="text-gray-300 text-sm mb-4">
                    Paste data backup JSON di bawah ini. Data backup biasanya berisi API keys, client secrets, dan konfigurasi lainnya.
                  </p>

                  <div className="relative">
                    <textarea
                      value={restoreText}
                      onChange={(e) => setRestoreText(e.target.value)}
                      className="glass-textarea w-full h-64 p-4 pr-12 text-sm font-mono"
                      placeholder={`Paste backup JSON data here...`}
                      disabled={isRestoring}
                    />
                    <button
                      type="button"
                      onClick={() => pasteFromClipboard(setRestoreText)}
                      className="absolute right-2 top-2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                      title="Paste from clipboard"
                      disabled={isRestoring}
                    >
                      📋
                    </button>
                  </div>
                </div>

                <div className="flex justify-end space-x-4">
                  <button
                    onClick={() => setShowRestoreModal(false)}
                    className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                    disabled={isRestoring}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!restoreText.trim()) {
                        alert('❌ Silakan paste data backup JSON terlebih dahulu.');
                        return;
                      }

                      if (!confirm('⚠️ RESTORE akan MENGGANTI semua pengaturan saat ini!\n\nApakah Anda yakin ingin melanjutkan?')) return;

                      setIsRestoring(true);
                      try {
                        const backupData = JSON.parse(restoreText);
                        const result = await window.electronAPI.restoreSettings(backupData);

                        if (result.success) {
                          alert('✅ Settings berhasil di-restore!\n\nAplikasi akan dimuat ulang untuk menerapkan perubahan.');
                          setShowRestoreModal(false);
                          setShowBackupModal(false);
                          // Reload the page to apply restored settings
                          window.location.reload();
                        } else {
                          alert(`❌ Gagal restore settings: ${result.error}`);
                        }
                      } catch (error) {
                        console.error('Error restoring backup:', error);
                        alert(`❌ Error: ${error.message}`);
                      } finally {
                        setIsRestoring(false);
                      }
                    }}
                    disabled={isRestoring || !restoreText.trim()}
                    className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-lg font-semibold"
                  >
                    {isRestoring ? '🔄 Memulihkan...' : '📥 Restore Settings'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default Settings;
