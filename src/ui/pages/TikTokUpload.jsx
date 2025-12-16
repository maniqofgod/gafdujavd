import React, { useState, useEffect } from 'react';

function TikTokUpload() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [uploadHistory, setUploadHistory] = useState([]);
  const [file, setFile] = useState(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [privacyLevel, setPrivacyLevel] = useState('SELF_ONLY');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [contentOptions, setContentOptions] = useState({});
  const [existingFiles, setExistingfiles] = useState(null);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [contentLanguage, setContentLanguage] = useState('id');
  const [isFromBrowse, setIsFromBrowse] = useState(false);
  const [videoStatuses, setVideoStatuses] = useState({});

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

  // Load video statuses
  const loadVideoStatuses = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getAllVideoStatuses) {
        const statuses = await window.electronAPI.getAllVideoStatuses();
        const statusMap = {};
        statuses.forEach(status => {
          statusMap[status.video_path] = status;
        });
        setVideoStatuses(statusMap);
      }
    } catch (error) {
      console.warn('Failed to load video statuses:', error);
    }
  };

  // Status indicator component
  const StatusIndicators = ({ videoPath }) => {
    const status = videoStatuses[videoPath];

    if (!status) return null;

    return (
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {status.is_clipped && (
          <span className="px-1.5 py-0.5 bg-purple-600/20 text-purple-400 text-xs rounded-full border border-purple-500/30">
            ✂️ Sudah di Clip
          </span>
        )}
        {status.is_autocaptioned && (
          <span className="px-1.5 py-0.5 bg-green-600/20 text-green-400 text-xs rounded-full border border-green-500/30">
            📝 Auto Caption
          </span>
        )}
        {status.youtube_uploaded && (
          <span className="px-1.5 py-0.5 bg-red-600/20 text-red-400 text-xs rounded-full border border-red-500/30">
            📤 Upload: {status.youtube_account || 'Unknown'}
          </span>
        )}
      </div>
    );
  };

  // Load accounts on mount
  useEffect(() => {
    loadAccounts();
    loadUploadHistory();
  }, []);

  const loadAccounts = async () => {
    try {
      const accounts = await window.electronAPI.tiktokGetAccounts();
      setAccounts(accounts);
      if (accounts.length > 0 && !selectedAccount) {
        setSelectedAccount(accounts[0].open_id);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const loadUploadHistory = async () => {
    try {
      // Load history for all accounts (pass null to get all)
      const history = await window.electronAPI.tiktokGetUploadHistory(null);
      setUploadHistory(history);
    } catch (error) {
      console.error('Upload error:', error);

      // Handle specific error messages with better user guidance
      let displayMessage = `Upload gagal: ${error.message}`;

      if (error.message.includes('silakan login ulang dengan tombol') ||
          error.message.includes(' sudah expired')) {
        displayMessage = '🚨 Token TikTok sudah expired. Klik tombol 🔄 "Login Ulang" untuk memperbarui token.';
      }

      setUploadStatus(displayMessage);

      // Refresh accounts list if token expired
      if (error.message.includes('Token TikTok') && error.message.includes('expired')) {
        console.log('Token expired, refreshing accounts list...');
        loadAccounts();
      }
    }
  };

  // Handle auth events
  useEffect(() => {
    const handleAuthSuccess = (event, data) => {
      console.log('TikTok auth success:', data);
      if (data && data.account) {
        alert(`✅ Akun TikTok berhasil ditambahkan:\n${data.account.display_name} (${data.account.username})`);
        loadAccounts(); // Refresh accounts list
      }
    };

    const handleAuthError = (event, error) => {
      console.error('TikTok auth error:', error);
      alert(`❌ Gagal menambahkan akun TikTok: ${error || 'Terjadi kesalahan yang tidak diketahui'}`);
    };

    window.electronAPI.onProgress?.(() => {}); // Dummy handler to expose the event system

    // Listen for auth events (we'll add these to preload later)
    // For now, we'll handle this synchronously in the oauth call

    return () => {
      // Cleanup if needed
    };
  }, []);

  const handleAddAccountClick = async (isReauth = false) => {
    try {
      // Check if OAuth credentials are configured
      const clientKey = await window.electronAPI.getTikTokClientKey();
      const clientSecret = await window.electronAPI.getTikTokClientSecret();

      if (!clientKey || !clientSecret) {
        alert('TikTok OAuth credentials belum dikonfigurasi. Silakan ke Settings untuk mengatur Client Key dan Client Secret.');
        return;
      }

      // Show progress message to user
      const message = isReauth
        ? `Login ulang akan memperbarui token untuk akun: ${accounts.find(a => a.open_id == selectedAccount)?.display_name || 'Terpilih'}`
        : 'Otomatis membuka browser default untuk autentikasi TikTok. Silakan ikuti petunjuknya dan kembali ke aplikasi ini.';

      alert(message);

      // Start OAuth flow with system browser, pass account ID if re-authenticating
      const result = await window.electronAPI.tiktokStartOAuth(isReauth ? selectedAccount : null);

      if (result && result.account) {
        const action = isReauth ? 'diperbarui' : 'ditambahkan';
        alert(`✅ Akun TikTok berhasil ${action}:\n${result.account.display_name} (${result.account.username})`);
        loadAccounts(); // Refresh accounts list

        // If re-authenticating, try to refresh the account list and ensure selected account still exists
        if (isReauth && !accounts.find(a => a.open_id == selectedAccount)) {
          // If selected account was removed/replaced, select the first available
          const freshAccounts = await window.electronAPI.tiktokGetAccounts();
          if (freshAccounts.length > 0) {
            setSelectedAccount(freshAccounts[0].open_id);
          }
        }
      } else {
        alert('❌ Gagal menambahkan akun TikTok: Tidak ada respons yang valid');
      }

    } catch (error) {
      console.error('Error starting OAuth:', error);

      // Provide specific error handling for common issues
      let errorMessage = error.message;

      if (errorMessage.includes('EADDRINUSE')) {
        errorMessage = `Port untuk server OAuth sedang digunakan.\n\nSolusi:\n1. Tutup aplikasi ini sepenuhnya (bukan hanya close window)\n2. Tunggu 10 detik untuk cleanup\n3. Buka aplikasi lagi dan coba lagi\n\nJika masih error, restart komputer Anda.`;
      } else if (errorMessage.includes('Unable to find available port')) {
        errorMessage = `Tidak dapat menemukan port yang tersedia untuk autentikasi.\n\nSolusi:\n1. Restart aplikasi\n2. Jika masih error, restart komputer\n3. Buka Task Manager dan tutup semua proses node.js yang tidak perlu`;
      } else if (errorMessage.toLowerCase().includes('browser')) {
        errorMessage = `Tidak dapat membuka browser default.\n\nSolusi:\n1. Pastikan browser default Anda berfungsi (Chrome/Firefox/Edge)\n2. Coba restart browser\n3. Jika menggunakan antivirus, izinkan aplikasi ini`;
      } else if (errorMessage.includes('OAuth timeout')) {
        errorMessage = `Autentikasi timeout.\n\nSolusi:\n1. Pastikan anda menyelesaikan login TikTok di browser\n2. Klik "Allow" pada permission yang diminta\n3. Kembali ke Auto Clipper setelah selesai`;
      }

      alert('Error autentikasi TikTok:\n\n' + errorMessage);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type.startsWith('video/')) {
      setFile(selectedFile);
      setIsFromBrowse(false); // File dari input langsung
    }
  };

  const generateContent = async () => {
    if (!file) return;

    try {
      const result = await window.electronAPI.tiktokGenerateContent({
        fileName: file.name,
        userId: selectedAccount,
        options: { language: contentLanguage }
      });
      setGeneratedContent(result);

      // Auto-fill form with generated content
      if (result.title) {
        setVideoTitle(result.title);
      } else if (result.clips && Array.isArray(result.clips) && result.clips.length > 0) {
        alert('Konten yang dihasilkan tidak sesuai format untuk TikTok. Menggunakan nama file sebagai judul.');
        setVideoTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      }

      // TikTok doesn't use description/tags like YouTube, just title
    } catch (error) {
      console.error('Error generating AI content:', error);
      alert('Error generating AI content: ' + error.message);
    }
  };

  const generateContentFromCaption = async () => {
    if (!file) return;

    try {
      let finalCaption = '';

      // First try to get caption from file property (for cuts)
      if (file.caption) {
        finalCaption = file.caption;
      }
      // For autocaption files, try to find the captions text file
      else if (file.path && (file.outputPath || file.path).includes('results') && (file.outputPath || file.path).endsWith('.mp4')) {
        const videoPath = file.outputPath || file.path;
        const baseName = videoPath.replace(/\.mp4$/, '');
        const captionsFilePath = baseName + '_captions.txt';

        try {
          // Try to read the captions text file that was saved during processing
          const captionsText = await window.electronAPI.readFile(captionsFilePath);

          if (captionsText && captionsText.trim()) {
            finalCaption = captionsText
              .trim()
              .replace(/\n\s*\n/g, ' ')
              .replace(/\n/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          } else {
            finalCaption = file.displayName || file.filename || '';
          }
        } catch (readError) {
          console.warn('Could not read captions file, using displayName:', readError);
          finalCaption = file.displayName || file.filename || '';
        }
      }

      // Fallback: use displayName, filename, or title
      if (!finalCaption) {
        finalCaption = file.displayName || file.filename ||
                      (file.name ? file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim() : '') ||
                      file.title || '';
      }

      // Ensure we have content, even if minimal
      if (!finalCaption) {
        finalCaption = 'Video content';
      }

      // Extract title from first line or meaningful beginning for TikTok
      let title = '';
      const cleanedCaption = finalCaption.trim();

      if (cleanedCaption.includes('\n')) {
        const lines = cleanedCaption.split('\n').filter(line => line.trim());
        title = lines[0].trim();
      } else {
        if (cleanedCaption.length <= 100) {
          title = cleanedCaption;
        } else {
          let breakPoint = 100;
          const sentenceEnd = cleanedCaption.substring(0, 100).lastIndexOf('.');
          if (sentenceEnd > 60) breakPoint = sentenceEnd + 1;
          title = cleanedCaption.substring(0, breakPoint).trim();
        }
      }

      // Ensure title is not empty
      if (!title) {
        title = 'Video Clip';
      }

      const captionContent = {
        title: title,
        method: 'direct_caption',
        language: contentLanguage,
        generated: false,
        source: file.caption ? 'caption' : 'filename'
      };

      setGeneratedContent(captionContent);
      setVideoTitle(captionContent.title);

    } catch (error) {
      console.error('Error processing caption content:', error);
      alert('Error processing caption content: ' + error.message);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !selectedAccount || !videoTitle.trim()) {
      alert('Harap pilih file video, akun, dan isi judul video');
      return;
    }

    setIsUploading(true);
    setUploadStatus('Memulai upload...');
    setUploadProgress(10);

    try {
      // Prepare upload data
      const uploadData = {
        accountId: selectedAccount,
        videoFile: file,
        title: videoTitle.trim(),
        privacy_level: privacyLevel
      };

      const result = await window.electronAPI.tiktokUploadVideo(uploadData);

      if (result.success) {
        setUploadStatus('Upload berhasil! Video akan muncul di inbox TikTok Anda.');
        setUploadProgress(100);

        // Show success notification
        const successMessage = `✅ Upload TikTok Berhasil!\n\n📹 Video berhasil dikirim ke inbox TikTok Anda\n🎯 Status: Menunggu review TikTok\n\nBuka aplikasi TikTok untuk melihat dan mempublish video.`;

        // Create browser notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('TikTok Upload Berhasil!', {
            body: 'Video berhasil dikirim ke inbox TikTok Anda. Buka aplikasi TikTok untuk publish.',
            icon: '/assets/icon.ico'
          });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              new Notification('TikTok Upload Berhasil!', {
                body: 'Video berhasil dikirim ke inbox TikTok Anda. Buka aplikasi TikTok untuk publish.',
                icon: '/assets/icon.ico'
              });
            }
          });
        }

        alert(successMessage);

        // Reset form after successful upload
        setTimeout(() => {
          setFile(null);
          setVideoTitle('');
          setPrivacyLevel('SELF_ONLY');
          setIsUploading(false);
          setUploadProgress(0);
          loadUploadHistory(); // Refresh history
        }, 2000);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus(`Upload gagal: ${error.message}`);
      setIsUploading(false);
      setUploadProgress(0);

      // Handle specific TikTok errors
      let displayMessage = error.message;
      let userFriendlyMessage = '';

      if (error.message.includes('Token TikTok') && error.message.includes('expired')) {
        userFriendlyMessage = `❌ TOKEN TIKTOK EXPIRED!\n\nToken autentikasi TikTok sudah kadaluarsa.\n\nSolusi:\nKlik tombol "🔄 Login Ulang" untuk memperbarui token.`;
      } else {
        userFriendlyMessage = `❌ Upload gagal!\n\nError: ${displayMessage}`;
      }

      // Show failure notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('TikTok Upload Gagal', {
          body: userFriendlyMessage.replace(/❌.*!\n\n/, '').replace(/\n\n.*/s, ''),
          icon: '/icon.ico'
        });
      }

      alert(userFriendlyMessage);

      // Refresh accounts list if token expired
      if (error.message.includes('Token TikTok') && error.message.includes('expired')) {
        console.log('Token expired, refreshing accounts list...');
        loadAccounts();
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const loadExistingFiles = async () => {
    try {
      const files = await window.electronAPI.getExistingFiles();
      console.log('Loaded existing files:', files);
      setExistingfiles(files);

      // Load video statuses for the files
      loadVideoStatuses();
    } catch (error) {
      console.error('Error loading existing files:', error);
      setExistingfiles({ cuts: [], autocaption: [] });
    }
  };

  const handleSelectExistingFile = (selectedFile) => {
    // Create a virtual file object from the selected existing file
    const fileObject = {
      name: selectedFile.outputPath.split('/').pop().split('\\').pop(),
      path: selectedFile.outputPath,
      size: selectedFile.fileSize,
      type: 'video/mp4',
      caption: selectedFile.caption,
      displayName: selectedFile.displayName
    };

    setFile(fileObject);
    setIsFromBrowse(true);
    setShowFileBrowser(false);

    // Auto-fill title from caption or filename
    const title = selectedFile.caption || selectedFile.filename ||
                  selectedFile.outputPath.split('/').pop().split('\\').pop().replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
    setVideoTitle(title);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('id-ID');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Fixed Header */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-pink-500/20">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">🎵 TikTok Upload</h1>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="text-gray-400 hover:text-pink-400"
            >
              ⚙️ Akun Settings
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6">

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden m-4">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-gray-900 z-10 pb-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">TikTok Akun Settings</h2>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="text-gray-400 hover:text-red-400 text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-auto max-h-[calc(80vh-6rem)] pt-4">
                {/* Add Account Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Tambah Akun TikTok</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Login ke TikTok untuk menambahkan akun. OAuth credentials harus sudah dikonfigurasi di Settings.
                  </p>
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      handleAddAccountClick();
                    }}
                    className="w-full bg-pink-600 hover:bg-pink-500 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                  >
                    <span>🎵</span>
                    <span>Login dengan TikTok</span>
                  </button>
                </div>

                {/* Existing Accounts */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Akun Terhubung ({accounts.length})</h3>
                  {accounts.length === 0 ? (
                    <p className="text-gray-400">Belum ada akun yang terhubung</p>
                  ) : (
                    <div className="space-y-3">
                      {accounts.map(account => (
                        <div key={account.open_id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <img src={account.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                            <div>
                              <p className="text-white font-medium">{account.display_name}</p>
                              <p className="text-gray-400 text-sm">@{account.username}</p>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              const accountToDelete = account;
                              if (window.confirm(`Apakah Anda yakin ingin menghapus akun "${accountToDelete.display_name} (@${accountToDelete.username})"? Tindakan ini tidak dapat dibatalkan.`)) {
                                try {
                                  const result = await window.electronAPI.tiktokRemoveAccount(accountToDelete.open_id);
                                  if (result.success) {
                                    alert(`Akun "${accountToDelete.display_name}" berhasil dihapus`);
                                    loadAccounts();
                                    if (selectedAccount == accountToDelete.open_id) {
                                      const freshAccounts = await window.electronAPI.tiktokGetAccounts();
                                      setSelectedAccount(freshAccounts.length > 0 ? freshAccounts[0].open_id : '');
                                    }
                                  } else {
                                    alert('Gagal menghapus akun: ' + result.message);
                                  }
                                } catch (error) {
                                  console.error('Error deleting account:', error);
                                  alert('Terjadi kesalahan saat menghapus akun: ' + error.message);
                                }
                              }
                            }}
                            className="text-red-400 hover:text-red-300"
                          >
                            Hapus
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Upload Form */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl overflow-hidden shadow-2xl border border-pink-500/10">

            <div className="bg-gradient-to-r from-pink-600/20 to-purple-600/20 p-6 border-b border-pink-500/20">
              <h2 className="text-2xl font-bold text-white">Upload Video Baru</h2>
              <p className="text-gray-300 text-sm mt-2">
                Pilih video dan konfigurasikan pengaturan upload TikTok
              </p>
            </div>

            <div className="p-8">
              <form onSubmit={handleUpload} className="space-y-6">

                {/* Account Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Pilih Akun TikTok</label>
                  <div className="flex space-x-2">
                    <select
                      value={selectedAccount}
                      onChange={(e) => setSelectedAccount(e.target.value)}
                      className="flex-1 bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-pink-400 focus:ring-1 focus:ring-pink-400 transition-colors"
                      required
                    >
                      <option value="">Pilih akun...</option>
                      {accounts.map(account => (
                        <option key={account.open_id} value={account.open_id}>
                          {account.display_name} (@{account.username})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddAccountClick}
                      disabled={!selectedAccount}
                      className="px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center whitespace-nowrap"
                      title="Login ulang akun yang dipilih"
                    >
                      🔄 Login Ulang
                    </button>
                  </div>
                  {!selectedAccount && (
                    <p className="text-sm text-gray-500 mt-1">Pilih akun untuk menggunakan tombol login ulang</p>
                  )}
                </div>

                {/* Video File */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">File Video</label>
                  <div className="flex space-x-2 mb-3">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      className="flex-1 bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-pink-400 focus:ring-1 focus:ring-pink-400 transition-colors file:bg-gray-600 file:border-0 file:rounded-md file:px-3 file:py-1 file:text-sm file:text-white file:mr-3"
                      required={false}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        loadExistingFiles();
                        setShowFileBrowser(true);
                      }}
                      className="px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center whitespace-nowrap"
                      title="Browse existing processed videos"
                    >
                      📂 Browse Existing
                    </button>
                  </div>
                  {file && (
                    <p className="mt-2 text-sm text-pink-400">
                      Selected: {file.name} ({formatFileSize(file.size)})
                    </p>
                  )}
                  {!file && (
                    <p className="mt-2 text-sm text-gray-500">
                      Choose a video file or click "Browse Existing" to select from processed videos
                    </p>
                  )}
                </div>

                {/* Generate Content Buttons */}
                {file && (
                  <div className="space-y-4">
                    {/* AI Content Generation */}
                    {!isFromBrowse && (
                      <div className="flex gap-2">
                        <select
                          value={contentLanguage}
                          onChange={(e) => setContentLanguage(e.target.value)}
                          className="flex-1 bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-pink-400 focus:ring-1 focus:ring-pink-400 transition-colors"
                        >
                          <option value="id">🇮🇩 Bahasa Indonesia</option>
                          <option value="en">🇺🇸 English</option>
                          <option value="ja">🇯🇵 日本語</option>
                          <option value="ko">🇰🇷 한국어</option>
                          <option value="es">🇪🇸 Español</option>
                          <option value="fr">🇫🇷 Français</option>
                          <option value="de">🇩🇪 Deutsch</option>
                          <option value="zh">🇨🇳 中文</option>
                        </select>
                        <button
                          type="button"
                          onClick={generateContent}
                          className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-4 py-3 rounded-lg font-medium transition-all transform hover:scale-105 shadow-xl flex items-center justify-center space-x-2"
                          title="Generate content using AI with selected language"
                        >
                          <span>🤖</span>
                          <span>Generate dengan AI</span>
                        </button>
                      </div>
                    )}

                    {/* Caption-based Content Generation */}
                    <button
                      type="button"
                      onClick={generateContentFromCaption}
                      className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 shadow-xl flex items-center justify-center space-x-2"
                      title="Generate content from existing video captions"
                    >
                      <span>📝</span>
                      <span>Generate dengan Caption</span>
                    </button>
                  </div>
                )}

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Judul Video
                    <span className="text-xs text-gray-400 ml-2">
                      ({videoTitle.length}/100 karakter)
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      maxLength={100}
                      className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 pr-12 rounded-lg focus:border-pink-400 focus:ring-1 focus:ring-pink-400 transition-colors"
                      placeholder="Masukkan judul video..."
                      required
                    />
                    <button
                      type="button"
                      onClick={() => pasteFromClipboard(setVideoTitle)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                      title="Paste from clipboard"
                    >
                      📋
                    </button>
                  </div>
                </div>

                {/* Privacy Level */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">Privacy Level</label>
                  <select
                    value={privacyLevel}
                    onChange={(e) => setPrivacyLevel(e.target.value)}
                    className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-pink-400 focus:ring-1 focus:ring-pink-400 transition-colors"
                  >
                    <option value="PUBLIC_TO_EVERYONE">Public to Everyone</option>
                    <option value="MUTUAL_FOLLOW_FRIENDS">Mutual Follow Friends</option>
                    <option value="FOLLOWER_OF_CREATOR">Follower of Creator</option>
                    <option value="SELF_ONLY">Private (Self Only)</option>
                  </select>
                </div>

                {/* Upload Button */}
                <button
                  type="submit"
                  disabled={isUploading || !file || !selectedAccount}
                  className={`w-full flex items-center justify-center space-x-2 px-6 py-4 rounded-lg font-semibold text-white transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                    isUploading || !file || !selectedAccount
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 shadow-xl'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <span>🎵</span>
                      <span>Upload ke TikTok</span>
                    </>
                  )}
                </button>

                {/* Upload Progress */}
                {isUploading && (
                  <div className="bg-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-300">{uploadStatus}</span>
                      <span className="text-sm text-pink-400">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-600 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-pink-600 to-purple-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Upload History */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl overflow-hidden shadow-2xl border border-purple-500/10">

            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 p-6 border-b border-purple-500/20">
              <h2 className="text-2xl font-bold text-white">Riwayat Upload</h2>
              <p className="text-gray-300 text-sm mt-2">
                Video yang sudah diupload ke TikTok
              </p>
            </div>

            <div className="p-8">
              {uploadHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🎵</div>
                  <p className="text-gray-400">Belum ada video yang diupload</p>
                </div>
              ) : (
                <>
                  {/* Clear All History Button */}
                  <div className="mb-6">
                    <button
                      onClick={async () => {
                        if (window.confirm('Apakah Anda yakin ingin menghapus semua riwayat upload untuk semua akun?')) {
                          try {
                            await window.electronAPI.tiktokClearUploadHistory(null);
                            loadUploadHistory();
                          } catch (error) {
                            alert('Gagal menghapus riwayat: ' + error.message);
                          }
                        }
                      }}
                      className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
                      title="Hapus semua riwayat upload"
                    >
                      <span>🗑️</span>
                      <span>Clear All History</span>
                    </button>
                  </div>

                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {uploadHistory.map(video => (
                      <div key={video.id} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600/30">
                        <div className="flex items-start space-x-4">
                          <div className="flex-shrink-0 w-20 h-12 bg-gray-600 rounded flex items-center justify-center">
                            <span className="text-xs">🎵</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-medium truncate">{video.title}</h3>
                            <p className="text-gray-400 text-sm">{formatDate(video.uploadedAt)}</p>
                            <p className="text-gray-400 text-sm">{video.accountName}</p>

                            <div className="mt-2 flex items-center space-x-2">
                              <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                                video.status === 'Berhasil'
                                  ? 'bg-green-600/20 text-green-400'
                                  : 'bg-red-600/20 text-red-400'
                              }`}>
                                {video.status}
                              </span>
                              {video.privacy_level && (
                                <span className="text-xs text-gray-500">
                                  {video.privacy_level === 'PUBLIC_TO_EVERYONE' ? '🌐 Publik' :
                                   video.privacy_level === 'SELF_ONLY' ? '🔒 Private' :
                                   '👥 Limited'}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Delete Button */}
                          <button
                            onClick={async () => {
                              if (window.confirm(`Apakah Anda yakin ingin menghapus "${video.title}" dari riwayat upload?`)) {
                                try {
                                  await window.electronAPI.tiktokDeleteHistoryItem(video.id);
                                  loadUploadHistory();
                                } catch (error) {
                                  alert('Gagal menghapus item: ' + error.message);
                                }
                              }
                            }}
                            className="text-red-400 hover:text-red-300 transition-colors"
                            title="Hapus dari riwayat"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Generated Content Display */}
        {generatedContent && (
          <div className="mt-8 bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-2xl p-8 border border-purple-500/30">
            <h3 className="text-xl font-bold text-purple-400 mb-4">
              Konten yang Dihasilkan | Method: {
                generatedContent.generated ? 'AI Generated' :
                generatedContent.method === 'direct_caption' ? 'Direct Caption' :
                'Basic Fallback'
              }
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-purple-300 mb-2">Judul</h4>
                <p className="text-white text-sm">{generatedContent.title || 'No title generated'}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-purple-300 mb-2">Bahasa</h4>
                <p className="text-white text-sm">{generatedContent.language || 'Unknown'}</p>
              </div>
            </div>
          </div>
        )}

        {/* File Browser Modal */}
        {showFileBrowser && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-6 max-w-6xl w-full max-h-[80vh] overflow-auto m-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Browse Existing Videos</h2>
                <button
                  onClick={() => setShowFileBrowser(false)}
                  className="text-gray-400 hover:text-red-400 text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Cuts Directory (Potongan) */}
                <div>
                  <h3 className="text-lg font-semibold text-cyan-400 mb-4">📹 Potongan (Clips)</h3>
                  <div className="space-y-3">
                    {existingFiles && existingFiles.cuts && existingFiles.cuts.length > 0 ? (
                      existingFiles.cuts.map((clip, index) => (
                        <div key={index} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-medium truncate">
                              {clip.caption || clip.outputPath.split('/').pop().split('\\').pop().replace(/\.[^/.]+$/, '').replace(/_/g, ' ')}
                            </h4>
                            <p className="text-gray-400 text-sm">
                              {formatFileSize(clip.fileSize)} • {clip.duration ? `${clip.duration}s` : ''} • {formatDate(clip.createdAt)}
                            </p>
                            <StatusIndicators videoPath={clip.outputPath} />
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewVideo(clip);
                                setShowVideoPreview(true);
                              }}
                              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1"
                              title="Preview video"
                            >
                              <span>👀</span>
                              <span>Preview</span>
                            </button>
                            <button
                              onClick={() => handleSelectExistingFile(clip)}
                              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                            >
                              Pilih
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <p>Tidak ada video potongan yang tersedia</p>
                        <p className="text-sm mt-1">Buat potongan video terlebih dahulu di halaman Clipper</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto Caption Directory */}
                <div>
                  <h3 className="text-lg font-semibold text-purple-400 mb-4">🎬 Auto Caption</h3>
                  <div className="space-y-3">
                    {existingFiles && existingFiles.autocaption && existingFiles.autocaption.length > 0 ? (
                      existingFiles.autocaption.map((video, index) => (
                        <div key={index} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-medium truncate">
                              {video.displayName}
                            </h4>
                            <p className="text-gray-400 text-sm">
                              {formatFileSize(video.fileSize)} • {formatDate(video.createdAt)}
                            </p>
                            <StatusIndicators videoPath={video.outputPath} />
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewVideo(video);
                                setShowVideoPreview(true);
                              }}
                              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1"
                              title="Preview video"
                            >
                              <span>👀</span>
                              <span>Preview</span>
                            </button>
                            <button
                              onClick={() => handleSelectExistingFile(video)}
                              className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                            >
                              Pilih
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <p>Tidak ada video auto caption yang tersedia</p>
                        <p className="text-sm mt-1">Proses video dengan auto caption terlebih dahulu</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowFileBrowser(false)}
                  className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Video Preview Modal */}
      {showVideoPreview && previewVideo && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={() => {
              setShowVideoPreview(false);
              setPreviewVideo(null);
            }}
          ></div>

          {/* Modal Content */}
          <div className="relative bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl shadow-2xl border border-blue-500/20 max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 p-6 border-b border-blue-500/20">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                  <span className="text-blue-400">👀</span>
                  <span>Video Preview</span>
                </h3>
                <button
                  onClick={() => {
                    setShowVideoPreview(false);
                    setPreviewVideo(null);
                  }}
                  className="w-8 h-8 rounded-lg bg-red-600/80 hover:bg-red-500 flex items-center justify-center text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <p className="text-gray-300 text-sm mt-2">
                {previewVideo.displayName || previewVideo.caption || previewVideo.outputPath.split('/').pop().split('\\').pop().replace(/\.[^/.]+$/, '').replace(/_/g, ' ')}
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="flex flex-col items-center space-y-4">
                {/* Video Player */}
                <div className="w-full max-w-2xl bg-gray-900 rounded-lg overflow-hidden">
                  <video
                    className="w-full h-auto max-h-[60vh] object-contain"
                    src={previewVideo.outputPath ? `file:///${previewVideo.outputPath.replace(/\\/g, '/')}` : ''}
                    controls
                    autoPlay
                    muted
                    onError={(e) => {
                      console.error('Video preview failed to load:', e);
                    }}
                  />
                </div>

                {/* Video Info */}
                <div className="w-full max-w-2xl bg-gray-800/50 rounded-lg p-4 border border-gray-600/30">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">File Size:</span>
                      <span className="text-white ml-2">
                        {formatFileSize(previewVideo.fileSize)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Created:</span>
                      <span className="text-white ml-2">
                        {formatDate(previewVideo.createdAt)}
                      </span>
                    </div>
                  </div>
                  {previewVideo.caption && (
                    <div className="mt-4">
                      <span className="text-gray-400">Caption:</span>
                      <p className="text-white mt-1 italic">"{previewVideo.caption}"</p>
                    </div>
                  )}
                  <StatusIndicators videoPath={previewVideo.outputPath} />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-750/50 p-4 border-t border-gray-600/20 flex justify-end">
              <button
                onClick={() => {
                  setShowVideoPreview(false);
                  setPreviewVideo(null);
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default TikTokUpload;
