import React, { useState, useEffect } from 'react';

function Results({ onBack }) {
  const [downloadHistory, setDownloadHistory] = useState([]);
  const [cutHistory, setCutHistory] = useState([]);
  const [autocaptionHistory, setAutocaptionHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('downloads');
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [captionModal, setCaptionModal] = useState({ isOpen: false, caption: '', title: '' });
  const [videoStatuses, setVideoStatuses] = useState({});

  const fetchAndSetHistory = async () => {
    // Get existing files from AppData directories as the source of truth
    let existingFiles = { downloads: [], cuts: [], autocaption: [] };
    try {
      existingFiles = await window.electronAPI.getExistingFiles();
    } catch (error) {
      console.warn('Error loading existing files from disk:', error);
    }

    // Load from localStorage
    const savedDownloads = JSON.parse(localStorage.getItem('downloadHistory') || '[]');
    const savedCuts = JSON.parse(localStorage.getItem('cutHistory') || '[]');
    const savedAutocaptionHistory = JSON.parse(localStorage.getItem('autocaptionHistory') || '[]');

    // Combine localStorage data with existing files, prioritizing existing files and ensuring uniqueness
    const currentDownloadsOnDisk = new Set(existingFiles.downloads.map(item => item.filePath));
    const validatedDownloads = savedDownloads.filter(item => currentDownloadsOnDisk.has(item.filePath));
    const mergedDownloads = [...validatedDownloads];
    // Add any new files found on disk that weren't in localStorage (e.g., manually added)
    existingFiles.downloads.forEach(file => {
      if (!mergedDownloads.some(item => item.filePath === file.filePath)) {
        mergedDownloads.push(file);
      }
    });

    const currentCutsOnDisk = new Set(existingFiles.cuts.map(item => item.outputPath));
    const validatedCuts = savedCuts.filter(item => currentCutsOnDisk.has(item.outputPath));
    const mergedCuts = [...validatedCuts];
    // Add any new files found on disk that weren't in localStorage
    for (const file of existingFiles.cuts) {
      if (!mergedCuts.some(item => item.outputPath === file.outputPath)) {
        // Create a more complete entry for files found on disk
        // Extract filename from path, use reasonable defaults, and get duration from file size
        const fileName = file.outputPath ? file.outputPath.split(/[/\\]/).pop().replace('.mp4', '') : 'Cut Clip';

        // For old cuts found on disk but not in localStorage, get accurate duration
        let duration = undefined;
        try {
          duration = await window.electronAPI.getVideoDuration(file.outputPath);
        } catch (error) {
          console.warn('Could not get duration for cut file:', file.outputPath, error.message);
        }

        mergedCuts.push({
          ...file,
          id: Date.now() + Math.random(),
          name: fileName,
          caption: file.caption || fileName, // Use filename as fallback caption if none provided
          duration: file.duration || duration // Use duration from file or calculated estimate
        });
      }
    }

    // For autocaption - only use disk files as the single source of truth
    // Don't merge with localStorage to avoid duplicates
    const mergedAutocaption = [];

    // Only add files found on disk (these are the actual processed files)
    existingFiles.autocaption.forEach(diskItem => {
      mergedAutocaption.push({
        id: Date.now() + Math.random(),
        outputPath: diskItem.outputPath,
        url: null, // No blob URL for files loaded from disk
        createdAt: diskItem.createdAt,
        fileSize: diskItem.fileSize,
        autocaptionSource: 'result',
        displayName: diskItem.displayName || diskItem.filename
      });
    });

    // Clear old localStorage entries that are no longer needed
    localStorage.setItem('autocaptionHistory', JSON.stringify([]));

    // Sort by creation date, most recent first
    mergedDownloads.sort((a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime());
    mergedCuts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    mergedAutocaption.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    setDownloadHistory(mergedDownloads);
    setCutHistory(mergedCuts);
    setAutocaptionHistory(mergedAutocaption);

    // Update localStorage to reflect the validated state
    localStorage.setItem('downloadHistory', JSON.stringify(mergedDownloads));
    localStorage.setItem('cutHistory', JSON.stringify(mergedCuts));
    localStorage.setItem('autocaptionHistory', JSON.stringify(mergedAutocaption));
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

  // Load data from localStorage and existing files, listen for new downloads/cuts
  useEffect(() => {
    fetchAndSetHistory(); // Initial load
    loadVideoStatuses(); // Load video statuses

    // Listen for new downloads/cuts
    const handleNewDownload = (event, data) => {
      if (data && data.title) {
        setDownloadHistory(prev => {
          const updated = [data, ...prev.filter(item => item.filePath !== data.filePath).slice(0, 49)]; // Add new, avoid duplicates, keep last 50
          localStorage.setItem('downloadHistory', JSON.stringify(updated));
          return updated;
        });
      }
    };

    const handleNewCut = (event, data) => {
      if (data && data.caption) {
        setCutHistory(prev => {
          const updated = [data, ...prev.filter(item => item.outputPath !== data.outputPath).slice(0, 49)]; // Add new, avoid duplicates, keep last 50
          localStorage.setItem('cutHistory', JSON.stringify(updated));
          return updated;
        });
      }
    };

    window.electronAPI.onNewDownload(handleNewDownload);
    window.electronAPI.onNewCut(handleNewCut);

    setHasLoadedData(true);

    return () => {
      window.electronAPI.removeAllListeners();
    };
  }, []);

  const loadExistingFiles = async () => {
    await fetchAndSetHistory(); // Reload all data
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (seconds) => {
    if (seconds === undefined || seconds === null) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleDeleteDownload = async (filePathToDelete) => {
    if (!window.confirm("Are you sure you want to delete this downloaded video? This action cannot be undone.")) {
      return;
    }
    try {
      // Delete the video file
      await window.electronAPI.deleteFile(filePathToDelete);

      // Also try to delete associated transcript file if it exists
      try {
        const transcriptFilePath = filePathToDelete.replace('.mp4', '.txt');
        await window.electronAPI.deleteFile(transcriptFilePath);
      } catch (transcriptError) {
        // Ignore if transcript file doesn't exist
      }

      setDownloadHistory(prev => {
        const updated = prev.filter(item => item.filePath !== filePathToDelete);
        localStorage.setItem('downloadHistory', JSON.stringify(updated));
        return updated;
      });
      alert('Downloaded video deleted successfully.');
    } catch (error) {
      console.error('Error deleting downloaded video:', error);
      alert('Failed to delete downloaded video: ' + error.message);
    }
  };

  const handleDeleteAllDownloads = async () => {
    if (!window.confirm("Are you sure you want to delete ALL downloaded videos? This action cannot be undone.")) {
      return;
    }
    try {
      // Delete video files
      const filePathsToDelete = downloadHistory.map(item => item.filePath);
      await window.electronAPI.deleteMultipleFiles(filePathsToDelete);

      // Also try to delete associated transcript files
      const transcriptFilePathsToDelete = downloadHistory
        .map(item => item.filePath.replace('.mp4', '.txt'))
        .filter(path => path); // Remove any null/undefined paths

      if (transcriptFilePathsToDelete.length > 0) {
        try {
          await window.electronAPI.deleteMultipleFiles(transcriptFilePathsToDelete);
        } catch (transcriptError) {
          // Ignore errors when deleting transcript files - they might not exist
          console.warn('Some transcript files could not be deleted:', transcriptError.message);
        }
      }

      setDownloadHistory([]);
      localStorage.setItem('downloadHistory', JSON.stringify([]));
      alert('All downloaded videos deleted successfully.');
    } catch (error) {
      console.error('Error deleting all downloaded videos:', error);
      alert('Failed to delete all downloaded videos: ' + error.message);
    }
  };

  const handleDeleteCut = async (outputPathToDelete) => {
    if (!window.confirm("Are you sure you want to delete this cut clip? This action cannot be undone.")) {
      return;
    }
    try {
      // Delete the video file
      await window.electronAPI.deleteFile(outputPathToDelete);

      // Also try to delete associated caption file if it exists (same name as video but .txt extension)
      try {
        const captionFilePath = outputPathToDelete.replace('.mp4', '.txt');
        await window.electronAPI.deleteFile(captionFilePath);
      } catch (captionError) {
        // Ignore if caption file doesn't exist
      }

      setCutHistory(prev => {
        const updated = prev.filter(item => item.outputPath !== outputPathToDelete);
        localStorage.setItem('cutHistory', JSON.stringify(updated));
        return updated;
      });
      alert('Cut clip deleted successfully.');
    } catch (error) {
      console.error('Error deleting cut clip:', error);
      alert('Failed to delete cut clip: ' + error.message);
    }
  };

  const handleDeleteAllCuts = async () => {
    if (!window.confirm("Are you sure you want to delete ALL cut clips? This action cannot be undone.")) {
      return;
    }
    try {
      // Delete video files
      const filePathsToDelete = cutHistory.map(item => item.outputPath);
      await window.electronAPI.deleteMultipleFiles(filePathsToDelete);

      // Also try to delete associated caption files
      const captionFilePathsToDelete = cutHistory
        .map(item => item.outputPath.replace('.mp4', '.txt'))
        .filter(path => path); // Remove any null/undefined paths

      if (captionFilePathsToDelete.length > 0) {
        try {
          await window.electronAPI.deleteMultipleFiles(captionFilePathsToDelete);
        } catch (captionError) {
          // Ignore errors when deleting caption files - they might not exist
          console.warn('Some caption files could not be deleted:', captionError.message);
        }
      }

      setCutHistory([]);
      localStorage.setItem('cutHistory', JSON.stringify([]));
      alert('All cut clips deleted successfully.');
    } catch (error) {
      console.error('Error deleting all cut clips:', error);
      alert('Failed to delete all cut clips: ' + error.message);
    }
  };

  const formatCaptionForDisplay = (captionText) => {
    if (!captionText) return '';

    // Handle both escaped newlines (\n) and actual newlines
    let formatted = captionText.replace(/\\n/g, '\n'); // Convert escaped to actual
    // If no escaped newlines found, check if we already have actual newlines

    // Split into lines and ensure proper formatting
    const lines = formatted.split('\n').filter(line => line.trim() !== ''); // Remove empty lines

    // Make first line (title) uppercase if it's not already
    if (lines.length > 0 && lines[0]) {
      lines[0] = lines[0].toUpperCase();
    }

    // Join back with double newlines for paragraphs, single for other sections
    return lines.join('\n\n');
  };

  const openCaptionModal = (cut) => {
    const captionText = cut.caption || '';
    const lines = captionText.split('\n').filter(line => line.trim() !== '');
    const title = lines.length > 0 ? lines[0].toUpperCase() : (captionText.substring(0, 50).toUpperCase() + '...');

    setCaptionModal({
      isOpen: true,
      caption: captionText,
      title: title
    });
  };

  const closeCaptionModal = () => {
    setCaptionModal({ isOpen: false, caption: '', title: '' });
  };

  const copyCaptionToClipboard = async () => {
    try {
      // Format caption properly for copy
      const formattedCaption = formatCaptionForDisplay(captionModal.caption);
      await navigator.clipboard.writeText(formattedCaption);
      alert('Judul/Deskripsi berhasil disalin ke clipboard!');
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      const formattedCaption = formatCaptionForDisplay(captionModal.caption);
      textArea.value = formattedCaption;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Judul/Deskripsi berhasil disalin ke clipboard!');
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

  return (
    <div className="p-8" data-scrollable="true">
      <div className="max-w-6xl mx-auto">
        {/* Tabs */}
        <div className="flex space-x-1 mb-4">
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'downloads'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            onClick={() => setActiveTab('downloads')}
          >
            Downloads ({downloadHistory.length})
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'cuts'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            onClick={() => setActiveTab('cuts')}
          >
            Potongan ({cutHistory.length})
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'autocaption'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            onClick={() => setActiveTab('autocaption')}
          >
            Auto Caption ({autocaptionHistory.length})
          </button>
        </div>

        {/* Downloads Tab */}
        {activeTab === 'downloads' && (
          <div className="space-y-6">
            <div className="liquid-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                    <span className="text-xl">📥</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold">Riwayat Download</h3>
                    <p className="text-xs text-gray-400">{downloadHistory.length} video tersimpan</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleDeleteAllDownloads}
                    className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    disabled={downloadHistory.length === 0}
                  >
                    Hapus Semua
                  </button>
                  <button
                    onClick={loadExistingFiles}
                    className="text-cyan-400 hover:text-cyan-300 text-sm"
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>

              {downloadHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📭</div>
                  <p className="text-gray-400 text-lg mb-2">Belum ada video yang didownload</p>
                  <p className="text-gray-500 text-sm">Download video YouTube pertama Anda untuk melihatnya di sini</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {downloadHistory.filter(download => download && download.title).map((download, idx) => (
                    <div key={idx} className="group glass-input p-3 rounded-lg hover:ring-2 hover:ring-cyan-500/50 transition-all duration-300">
                      <div className="flex items-start space-x-3">
                        {/* Video Thumbnail Placeholder */}
                        <div className="flex-shrink-0 w-16 h-12 bg-gradient-to-br from-green-600 to-emerald-600 rounded flex items-center justify-center">
                          <span className="text-xs font-bold text-white">CC</span>
                        </div>

                        {/* Video Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-cyan-300 text-sm group-hover:text-cyan-200 transition-colors cursor-pointer truncate">
                                {download.title}
                              </h4>
                              <p className="text-xs text-gray-400 mt-1 flex items-center truncate">
                                <span className="mr-1">🌐</span>
                                {download.url && download.url.length > 40 ? `${download.url.substring(0, 40)}...` : (download.url || 'No URL')}
                              </p>
                              <StatusIndicators videoPath={download.filePath} />
                            </div>

                            {/* Status & Size */}
                            <div className="flex flex-col items-end space-y-1 ml-2">
                              <div className="flex items-center space-x-1">
                                {download.transcriptAvailable && (
                                  <span className="px-1.5 py-0.5 bg-green-600/20 text-green-400 text-xs rounded-full">
                                    📝 Available
                                  </span>
                                )}
                                {download.fileSize && (
                                  <span className="px-1.5 py-0.5 bg-blue-600/20 text-blue-300 text-xs rounded-full">
                                    {formatFileSize(download.fileSize)}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 flex items-center">
                                <span className="mr-1">📅</span>
                                {formatTimestamp(download.downloadedAt)}
                              </p>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center space-x-2 mt-3">
                            <button
                              className="flex items-center space-x-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 transform hover:scale-105"
                              onClick={() => window.electronAPI.openVideoPreview(download.filePath)}
                            >
                              <span>▶️</span>
                              <span>Mainkan</span>
                            </button>
                            <button
                              className="flex items-center space-x-1.5 text-gray-400 hover:text-cyan-300 px-2 py-1.5 rounded text-xs transition-colors"
                              onClick={() => window.electronAPI.openFolder(download.filePath)}
                            >
                              <span>📁</span>
                              <span>Folder</span>
                            </button>
                            <button
                              onClick={() => handleDeleteDownload(download.filePath)}
                              className="flex items-center space-x-1.5 text-red-400 hover:text-red-300 px-2 py-1.5 rounded text-xs transition-colors"
                            >
                              <span>🗑️</span>
                              <span>Hapus</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cuts Tab */}
        {activeTab === 'cuts' && (
          <div className="space-y-6">
            <div className="liquid-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                    <span className="text-xl">✂️</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold">Riwayat Potongan</h3>
                    <p className="text-xs text-gray-400">{cutHistory.length} clip tersimpan</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleDeleteAllCuts}
                    className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    disabled={cutHistory.length === 0}
                  >
                    Hapus Semua
                  </button>
                  <button
                    onClick={loadExistingFiles}
                    className="text-cyan-400 hover:text-cyan-300 text-sm"
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>

              {cutHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🎬</div>
                  <p className="text-gray-400 text-lg mb-2">Belum ada video yang dipotong</p>
                  <p className="text-gray-500 text-sm">Gunakan Clipper untuk memotong video menjadi Shorts yang viral</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {cutHistory.map((cut, idx) => (
                    <div key={idx} className="group glass-input p-3 rounded-lg hover:ring-2 hover:ring-purple-500/50 transition-all duration-300">
                      <div className="flex items-start space-x-3">
                        {/* Clip Thumbnail Placeholder */}
                        <div className="flex-shrink-0 w-16 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded flex items-center justify-center">
                          <div className="text-lg">✂️</div>
                        </div>

                          {/* Clip Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-purple-300 text-sm group-hover:text-purple-200 transition-colors cursor-pointer truncate">
                                {cut.caption && cut.caption.length > 75 ? cut.caption.substring(0, 75) + '...' : cut.caption}
                              </h4>
                              {cut.duration !== undefined && (
                                <p className="text-xs text-orange-300 flex items-center mt-1">
                                  <span className="mr-1">🕒</span>
                                  {formatDuration(cut.duration)}
                                </p>
                              )}
                              <StatusIndicators videoPath={cut.outputPath} />
                            </div>

                            {/* Status & Size */}
                            <div className="flex flex-col items-end space-y-1 ml-2">
                              <div className="flex items-center space-x-1">
                                {cut.fileSize && (
                                  <span className="px-1.5 py-0.5 bg-blue-600/20 text-blue-300 text-xs rounded-full">
                                    {formatFileSize(cut.fileSize)}
                                  </span>
                                )}
                                <span className="px-1.5 py-0.5 bg-green-600/20 text-green-400 text-xs rounded-full">
                                  ✅ Ready
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 flex items-center">
                                <span className="mr-1">📅</span>
                                {formatTimestamp(cut.createdAt)}
                              </p>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center space-x-2 mt-3">
                            <button
                              className="flex items-center space-x-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 transform hover:scale-105"
                              onClick={() => window.electronAPI.openVideoPreview(cut.outputPath)}
                            >
                              <span>▶️</span>
                              <span>Mainkan</span>
                            </button>
                            <button
                              className="flex items-center space-x-1.5 text-gray-400 hover:text-cyan-300 px-2 py-1.5 rounded text-xs transition-colors"
                              onClick={() => window.electronAPI.openFolder(cut.outputPath)}
                            >
                              <span>📁</span>
                              <span>Folder</span>
                            </button>
                            <button
                              className="flex items-center space-x-1.5 text-green-400 hover:text-green-300 px-2 py-1.5 rounded text-xs transition-colors"
                              onClick={async () => {
                                try {
                                  // Use the existing outputPath and replace .mp4 with .txt to get caption file path
                                  const captionFilePath = cut.outputPath ? cut.outputPath.replace('.mp4', '.txt') : null;

                                  if (captionFilePath) {
                                    const content = await window.electronAPI.readFile(captionFilePath);
                                    if (content && content.trim()) {
                                      openCaptionModal({
                                        ...cut,
                                        caption: content.trim()
                                      });
                                    } else {
                                      alert('File judul/deskripsi tidak ditemukan atau kosong.');
                                    }
                                  } else {
                                    alert('Error: Path file tidak valid.');
                                  }
                                } catch (error) {
                                  console.error('Error membaca file judul/deskripsi:', error);
                                  alert('Error membaca file judul/deskripsi: ' + error.message);
                                }
                              }}
                            >
                              <span>📋</span>
                              <span>Judul/Deskripsi</span>
                            </button>
                            {cut.srtPath && (
                              <button
                                className="flex items-center space-x-1.5 text-orange-400 hover:text-orange-300 px-2 py-1.5 rounded text-xs transition-colors"
                                onClick={() => window.electronAPI.openFile(cut.srtPath)}
                              >
                                <span>📝</span>
                                <span>SRT</span>
                              </button>
                            )}
                            {cut.assPath && (
                              <button
                                className="flex items-center space-x-1.5 text-purple-400 hover:text-purple-300 px-2 py-1.5 rounded text-xs transition-colors"
                                onClick={() => window.electronAPI.openFile(cut.assPath)}
                              >
                                <span>🎬</span>
                                <span>ASS</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteCut(cut.outputPath)}
                              className="flex items-center space-x-1.5 text-red-400 hover:text-red-300 px-2 py-1.5 rounded text-xs transition-colors"
                            >
                              <span>🗑️</span>
                              <span>Hapus</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Auto Caption Tab */}
        {activeTab === 'autocaption' && (
          <div className="space-y-6">
            <div className="liquid-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                    <span className="text-xl">📝</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold">Hasil Auto Caption</h3>
                    <p className="text-xs text-gray-400">{autocaptionHistory.length} video tersimpan</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={async () => {
                      if (!window.confirm("Are you sure you want to delete ALL autocaption results? This action cannot be undone.")) {
                        return;
                      }
                      try {
                        // Delete video files from disk first
                        const filePathsToDelete = autocaptionHistory
                          .map(item => item.outputPath)
                          .filter(path => path); // Remove null/undefined paths
                        if (filePathsToDelete.length > 0) {
                          await window.electronAPI.deleteMultipleFiles(filePathsToDelete);
                        }

                        // Also try to delete associated caption files (_captions.txt and .caption files)
                        const captionFilePathsToDelete = autocaptionHistory
                          .map(item => [
                            item.outputPath.replace('.mp4', '_captions.txt'),
                            item.outputPath.replace('.mp4', '.caption')
                          ])
                          .flat()
                          .filter(path => path); // Remove null/undefined paths

                        if (captionFilePathsToDelete.length > 0) {
                          try {
                            await window.electronAPI.deleteMultipleFiles(captionFilePathsToDelete);
                          } catch (captionError) {
                            // Ignore errors when deleting caption files - they might not exist
                            console.warn('Some caption files could not be deleted:', captionError.message);
                          }
                        }

                        // Clear the UI display
                        setAutocaptionHistory([]);
                        localStorage.setItem('autocaptionHistory', JSON.stringify([]));

                        alert('All autocaption results deleted successfully.');
                      } catch (error) {
                        console.error('Error deleting all autocaption results:', error);
                        alert('Failed to delete all autocaption results: ' + error.message);
                      }
                    }}
                    className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    disabled={autocaptionHistory.length === 0}
                  >
                    Hapus Semua
                  </button>
                  <button
                    onClick={loadExistingFiles}
                    className="text-cyan-400 hover:text-cyan-300 text-sm"
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>

              {autocaptionHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <p className="text-gray-400 text-lg mb-2">Belum ada video yang di-auto caption</p>
                  <p className="text-gray-500 text-sm">Gunakan Auto Caption untuk membuat video dengan subtitle otomatis</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {autocaptionHistory.map((item, idx) => (
                    <div key={idx} className="group glass-input p-3 rounded-lg hover:ring-2 hover:ring-green-500/50 transition-all duration-300">
                      <div className="flex items-start space-x-3">
                        {/* Video Thumbnail Placeholder */}
                        <div className="flex-shrink-0 w-16 h-12 bg-gradient-to-br from-green-600 to-emerald-600 rounded flex items-center justify-center">
                          <span className="text-lg">�</span>
                        </div>

                        {/* Video Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-green-300 text-sm group-hover:text-green-200 transition-colors cursor-pointer truncate">
                                {(item.displayName || (item.outputPath ? item.outputPath.split(/[/\\]/).pop().replace(/^captioned_/, '').replace(/\.mp4$/, '').replace(/_/g, ' ') : 'Unknown Video')).substring(0, 75)}
                              </h4>
                              <p className="text-xs text-gray-400 mt-1 flex items-center truncate">
                                <span className="mr-1">🎬</span>
                                Auto-captioned video
                              </p>
                              <StatusIndicators videoPath={item.outputPath} />
                            </div>

                            {/* Status */}
                            <div className="flex flex-col items-end space-y-1 ml-2">
                              <span className="px-1.5 py-0.5 bg-green-600/20 text-green-400 text-xs rounded-full">
                                ✅ Completed
                              </span>
                              <p className="text-xs text-gray-500 flex items-center">
                                <span className="mr-1">📅</span>
                                {formatTimestamp(item.createdAt)}
                              </p>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center space-x-2 mt-3">
                            <button
                              className="flex items-center space-x-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 transform hover:scale-105"
                              onClick={() => window.electronAPI.openVideoPreview(item.outputPath)}
                              disabled={!item.outputPath}
                            >
                              <span>▶️</span>
                              <span>Mainkan</span>
                            </button>
                            <button
                              className="flex items-center space-x-1.5 text-gray-400 hover:text-cyan-300 px-2 py-1.5 rounded text-xs transition-colors"
                              onClick={() => window.electronAPI.openFolder(item.outputPath)}
                              disabled={!item.outputPath}
                            >
                              <span>📁</span>
                              <span>Folder</span>
                            </button>
                            {item.outputPath && (
                              <button
                                className="flex items-center space-x-1.5 text-green-400 hover:text-green-300 px-2 py-1.5 rounded text-xs transition-colors"
                                onClick={() => {
                                  // Look for corresponding captions file
                                  const captionFilePath = item.outputPath.replace('.mp4', '_captions.txt');
                                  // Try to read the captions file
                                  if (window.electronAPI && window.electronAPI.readFile) {
                                    window.electronAPI.readFile(captionFilePath)
                                      .then((content) => {
                                        if (content && content.trim()) {
                                          openCaptionModal({
                                            caption: content.trim(),
                                            outputPath: item.outputPath
                                          });
                                        } else {
                                          alert('No captions available for this video.');
                                        }
                                      })
                                      .catch(() => {
                                        alert('No captions available for this video.');
                                      });
                                  } else {
                                    alert('Capions feature not available.');
                                  }
                                }}
                              >
                                <span>📋</span>
                                <span>Caption</span>
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                if (!window.confirm("Are you sure you want to delete this autocaption result? This action cannot be undone.")) {
                                  return;
                                }
                                try {
                                  if (item.outputPath) {
                                    await window.electronAPI.deleteFile(item.outputPath);
                                    // Also try to delete the captions file if it exists
                                    const captionFilePath = item.outputPath.replace('.mp4', '_captions.txt');
                                    try {
                                      await window.electronAPI.deleteFile(captionFilePath);
                                    } catch (captionDeleteError) {
                                      // Ignore if captions file doesn't exist
                                    }
                                  }
                                  setAutocaptionHistory(prev => {
                                    const updated = prev.filter((_, i) => i !== idx);
                                    localStorage.setItem('autocaptionHistory', JSON.stringify(updated));
                                    return updated;
                                  });
                                  alert('Autocaption result deleted successfully.');
                                } catch (error) {
                                  console.error('Error deleting autocaption result:', error);
                                  alert('Failed to delete autocaption result: ' + error.message);
                                }
                              }}
                              className="flex items-center space-x-1.5 text-red-400 hover:text-red-300 px-2 py-1.5 rounded text-xs transition-colors"
                              disabled={!item.outputPath}
                            >
                              <span>🗑️</span>
                              <span>Hapus</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Caption Modal */}
        {captionModal.isOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="liquid-card p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Judul/Deskripsi</h3>
                <button
                  onClick={closeCaptionModal}
                  className="text-gray-400 hover:text-white text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 font-mono text-sm text-gray-300 whitespace-pre-wrap">
                  {formatCaptionForDisplay(captionModal.caption)}
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  onClick={copyCaptionToClipboard}
                  className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <span>📋</span>
                  <span>Copy</span>
                </button>
                <button
                  onClick={closeCaptionModal}
                  className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Results;
