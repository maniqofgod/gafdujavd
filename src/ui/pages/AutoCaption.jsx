import React, { useState, useEffect } from 'react';

function AutoCaption() {

  // Sanitize filename for filesystem compatibility
  const sanitizeFilename = (filename) => {
    return filename
      .replace(/\r\n|\r|\n/g, ' ') // Replace newlines with spaces
      .replace(/[<>:*?\"|]+/g, '') // Remove invalid characters
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .substring(0, 100); // Limit length
  };
  const [files, setFiles] = useState([]); // Now array for multiple files
  const [wordsPerLine, setWordsPerLine] = useState(2);
  const [fontTemplate, setFontTemplate] = useState('default');
  const [fontSize, setFontSize] = useState(24);
  const [enableResize, setEnableResize] = useState(false);
  const [targetAspectRatio, setTargetAspectRatio] = useState('9:16');
  const [backgroundType, setBackgroundType] = useState('blur');
  const [croppingMode, setCroppingMode] = useState('auto');
  const [enableMirror, setEnableMirror] = useState(false);

  // Debug enableMirror state changes
  useEffect(() => {
    console.log('🎯 [DEBUG] enableMirror state changed:', enableMirror, 'type:', typeof enableMirror);
    console.trace('🎯 [DEBUG] enableMirror state change stack trace');
  }, [enableMirror]);

  // Auto-enable resizing when cropping mode is changed from default
  useEffect(() => {
    if (croppingMode !== 'auto' && !enableResize) {
      setEnableResize(true);
    }
  }, [croppingMode, enableResize]);

  // Auto-disable cropping strategy when background fill is blur edges
  useEffect(() => {
    if (backgroundType === 'blur') {
      setCroppingMode('auto');
    }
  }, [backgroundType]);
  const [enableTitle, setEnableTitle] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [bulkTitles, setBulkTitles] = useState([]); // Array of titles for bulk processing
  const [titleFontSize, setTitleFontSize] = useState(48);
  const [titlePosition, setTitlePosition] = useState('top');
  const [titleFontColor, setTitleFontColor] = useState('white');
  const [titleFont, setTitleFont] = useState('arial');

  // Subtitle Translation Settings
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('indonesia');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultVideos, setResultVideos] = useState([]); // Array for results
  const [isBulkMode, setIsBulkMode] = useState(false); // Track bulk mode
  const [videoSource, setVideoSource] = useState('upload'); // 'upload' or 'clips'
  const [clipperSessions, setClipperSessions] = useState([]); // Clipper sessions
  const [selectedClips, setSelectedClips] = useState([]); // Selected clips for captioning
  const [showClipSelector, setShowClipSelector] = useState(false); // Show clip selection modal
  const [showVideoPreview, setShowVideoPreview] = useState(false); // Show video preview modal
  const [previewClip, setPreviewClip] = useState(null); // Clip to preview
  const [videoStatuses, setVideoStatuses] = useState({}); // Video status tracking

  // Source Channel Settings
  const [enableSourceChannel, setEnableSourceChannel] = useState(false);
  const [sourceFont, setSourceFont] = useState('comic');
  const [sourceFontSize, setSourceFontSize] = useState(24);
  const [sourceFontColor, setSourceFontColor] = useState('white');
  const [sourcePosition, setSourcePosition] = useState('bottom-left');
  const [availableChannels, setAvailableChannels] = useState([]);
  const [selectedChannelName, setSelectedChannelName] = useState('');
  const [sessionChannelInfo, setSessionChannelInfo] = useState([]);

  // Load video statuses
  const loadVideoStatuses = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getAllVideoStatuses) {
        const statuses = await window.electronAPI.getAllVideoStatuses();
        const statusMap = {};
        statuses.forEach(status => {
          // Store original path
          statusMap[status.video_path] = status;

          // Normalize path separators for cross-platform compatibility
          const normalizedPath = status.video_path.replace(/\\/g, '/');
          statusMap[normalizedPath] = status;

          // Also store with backslash separators if original had forward slashes
          const backslashPath = status.video_path.replace(/\//g, '\\');
          statusMap[backslashPath] = status;
        });
        setVideoStatuses(statusMap);
      }
    } catch (error) {
      console.warn('Failed to load video statuses:', error);
    }
  };

  // Load available channels from clipper_sessions
  const loadAvailableChannels = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getClipperSessions) {
        const sessions = await window.electronAPI.getClipperSessions();
        const channels = new Set();
        const sessionChannels = [];

        sessions.forEach((session, index) => {
          if (session.channel_video && session.channel_video.trim()) {
            channels.add(session.channel_video.trim());
            sessionChannels.push({
              sessionNumber: index + 1,
              channelName: session.channel_video.trim()
            });
          }
        });

        setAvailableChannels(Array.from(channels).sort());
        setSessionChannelInfo(sessionChannels);
        console.log('Loaded available channels:', Array.from(channels));
        console.log('Session channel mapping:', sessionChannels);
      }
    } catch (error) {
      console.warn('Failed to load available channels:', error);
    }
  };

  // Get current channel name for preview
  const getCurrentChannelName = () => {
    // For clips mode, try to get channel from selected clip's session
    if (videoSource === 'clips' && selectedClips.length > 0) {
      // Since we don't have direct access to session data here, we'll use selectedChannelName
      // In a real implementation, you might want to load session data for each clip
      return selectedChannelName || 'Channel Name';
    }

    // For upload mode or general case
    return selectedChannelName || 'Channel Name';
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

  // Load available channels when component mounts
  useEffect(() => {
    loadAvailableChannels();
  }, []);

  // Reload channels when video source changes
  useEffect(() => {
    loadAvailableChannels();
  }, [videoSource]);

  // Load clip selection data from actual cut files (not saved sessions)
  useEffect(() => {
    const loadCutFilesForSelection = async () => {
      try {
        const existingFiles = await window.electronAPI.getExistingFiles();
        const cutFiles = existingFiles.cuts || [];

        // Get duration and caption content from txt file for each cut file
        const clipsWithDuration = await Promise.all(
          cutFiles.map(async (file, index) => {
            try {
              const duration = await window.electronAPI.getVideoDuration(file.outputPath);
              const endTime = duration && duration > 0 ? Math.round(duration * 100) / 100 : 0;

              // Try to read the caption content from the corresponding txt file
              let caption = file.displayName; // fallback to displayName
              try {
                const txtFilePath = file.outputPath.replace('.mp4', '.txt');
                caption = await window.electronAPI.readFile(txtFilePath);
                console.log('Read caption from txt file:', txtFilePath, 'content:', caption.substring(0, 100) + '...');
              } catch (captionError) {
                console.warn('Could not read caption file for:', file.displayName, 'error:', captionError.message);
                // Keep fallback caption as file.displayName
              }

              return {
                id: index + 1,
                name: file.displayName.replace(/^cuts_/, '').replace(/\.mp4$/, ''),
                outputPath: file.outputPath,
                start: 0, // All clips start from beginning
                end: endTime, // Use actual video duration
                caption: caption,
                score: 5,
                outputPath: file.outputPath
              };
            } catch (error) {
              console.warn('Could not get duration for clip:', file.displayName, error);
              return {
                id: index + 1,
                name: file.displayName.replace(/^cuts_/, '').replace(/\.mp4$/, ''),
                outputPath: file.outputPath,
                start: 0,
                end: 0,
                caption: file.displayName,
                score: 5,
                outputPath: file.outputPath
              };
            }
          })
        );

        // Convert cut files to session-like structure for the modal
        const mockSession = {
          id: 'from-disk',
          title: 'Riwayat Potongan',
          videoInfo: { title: 'Hasil Pemrosesan Cuts' },
          clips: clipsWithDuration,
          savedAt: new Date().toISOString()
        };

        setClipperSessions([mockSession]);
      } catch (error) {
        console.error('Error loading cut files:', error);
        setClipperSessions([]);
      }
    };

    if (videoSource === 'clips') {
      loadCutFilesForSelection();
      loadVideoStatuses(); // Load video statuses when clips are loaded
    }
  }, [videoSource]);

  // Reload video statuses when clip selector modal opens
  useEffect(() => {
    if (showClipSelector && videoSource === 'clips') {
      console.log('Clip selector modal opened, reloading video statuses...');
      loadVideoStatuses();
    }
  }, [showClipSelector]);

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

  // Auto-populate title immediately when enableTitle is checked for single videos/clips
  const handleTitleToggle = (checked) => {
    console.log('DEBUG: handleTitleToggle called with checked:', checked);
    console.log('DEBUG: State - files.length:', files.length, 'selectedClips.length:', selectedClips.length, 'isBulkMode:', isBulkMode, 'titleText:', `"${titleText}"`);

    setEnableTitle(checked);

    // Auto-populate title for single videos/clips when title overlay is enabled
    if (checked && !isBulkMode && !titleText.trim()) {
      console.log('DEBUG: Conditions met for auto-population');

      // Handle upload mode (files)
      if (files.length === 1) {
        const file = files[0];
        let defaultTitle = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
        // Clean up the filename for better display
        defaultTitle = defaultTitle.replace(/_/g, " ").replace(/-/g, " ");

        // Capitalize first letter of each word
        defaultTitle = defaultTitle.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');

        setTitleText(defaultTitle);
        console.log('Auto-populated title for single file:', defaultTitle);
      }
      // Handle clip mode (selectedClips)
      else if (selectedClips.length === 1) {
        const clip = selectedClips[0];
        console.log('DEBUG: Processing clip:', { name: clip.name, caption: clip.caption, id: clip.id });

        // Use clip name for auto-population, or existing caption if it's descriptive
        let defaultTitle = clip.caption || clip.name || `Clip ${clip.id}`;

        // Clean up the title if it looks like a filename
        if (defaultTitle.includes('.') || defaultTitle.includes('_') || defaultTitle.includes('-')) {
          defaultTitle = defaultTitle.replace(/\.[^/.]+$/, ""); // Remove extension
          defaultTitle = defaultTitle.replace(/_/g, " ").replace(/-/g, " ");
          defaultTitle = defaultTitle.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        }

        setTitleText(defaultTitle);
        console.log('Auto-populated title for single clip:', defaultTitle);
      } else {
        console.log('DEBUG: No auto-population condition met - files.length:', files.length, 'selectedClips.length:', selectedClips.length);
      }
    } else {
      console.log('DEBUG: Auto-population conditions not met - checked:', checked, 'isBulkMode:', isBulkMode, 'titleText.trim():', titleText.trim());
    }
  };

  const handleFileChange = (e) => {
    const allFiles = Array.from(e.target.files);
    const selectedFiles = allFiles.filter(file => file.type.startsWith('video/'));

    console.log('File Change Debug:', {
      totalFilesInInput: allFiles.length,
      validVideoFiles: selectedFiles.length,
      filteredFiles: allFiles.filter(f => !f.type.startsWith('video/')).map(f => ({ name: f.name, type: f.type }))
    });

    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setIsBulkMode(selectedFiles.length > 1); // Enable bulk mode if multiple files
      console.log('Bulk mode set to:', selectedFiles.length > 1);

      if (selectedFiles.length > 1) {
        setEnableTitle(false); // Auto-disable title for bulk
        console.log('Title auto-disabled for bulk mode');
      }
    } else if (allFiles.length > 0) {
      alert(`No valid video files selected. Please select video files.\nFound ${allFiles.length} files but none are valid video files.`);
    } else {
      alert('Please select at least one valid video file');
    }
  };

  const processVideos = async (videoSources) => {
    setIsProcessing(true);
    setProgress(`Starting video processing... (${videoSources.length} videos)`);
    setResultVideos([]);
    try {
      const BATCH_SIZE = 3;
      const totalBatches = Math.ceil(videoSources.length / BATCH_SIZE);

      // Create all batch promises
      const batchPromises = [];
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, videoSources.length);
        const batchVideos = videoSources.slice(start, end);

        const batchPromise = (async () => {
          const batchPromises = batchVideos.map(async (videoSource, indexInBatch) => {
            try {
              const formData = new FormData();

              // Handle file upload
              formData.append('file', videoSource.file);

              formData.append('words_per_line', wordsPerLine.toString());
              formData.append('font_template', fontTemplate);
              formData.append('font_size', fontSize.toString());

              // Video resize parameters
              if (enableResize) {
                formData.append('enable_resize', 'true');
                formData.append('target_aspect_ratio', targetAspectRatio);
                formData.append('background_type', backgroundType);
                formData.append('cropping_mode', croppingMode);
              } else {
                formData.append('enable_resize', 'false');
              }

              // Title overlay parameters
              if (enableTitle) {
                if (!isBulkMode) {
                  // Single mode - use titleText
                  console.log('DEBUG: titleText state =', `"${titleText}"`, 'length:', titleText ? titleText.length : 'N/A');
                  if (titleText && titleText.trim()) {
                    console.log('Sending title overlay - single mode:', titleText.trim());
                  formData.append('enable_title', 'true');
                  formData.append('title_text', titleText.trim());
                  formData.append('title_font', titleFont);
                  formData.append('title_font_size', titleFontSize.toString());
                  formData.append('title_font_color', titleFontColor);
                  formData.append('title_position', titlePosition);
                  } else {
                    console.log('No title text provided for single mode, disabling overlay');
                    formData.append('enable_title', 'false');
                  }
                } else {
                  // Bulk mode - use bulk titles
                  const globalIndex = start + indexInBatch;
                  const bulkTitle = bulkTitles[globalIndex];
                  if (bulkTitle && bulkTitle.trim()) {
                    console.log('Sending title overlay - bulk mode:', bulkTitle.trim());
                    formData.append('enable_title', 'true');
                    formData.append('title_text', bulkTitle.trim());
                    formData.append('title_font', titleFont);
                    formData.append('title_font_size', titleFontSize.toString());
                    formData.append('title_font_color', titleFontColor);
                    formData.append('title_position', titlePosition);
                  } else {
                    console.log('No bulk title provided for index:', globalIndex);
                    formData.append('enable_title', 'false');
                  }
                }
              } else {
                console.log('Title overlay disabled');
                formData.append('enable_title', 'false');
              }

              // Subtitle Translation parameters - skip if translation not enabled
              if (enableTranslation) {
                formData.append('enable_translation', 'true');
                formData.append('translation_target', targetLanguage);
              } else {
                formData.append('enable_translation', 'false');
              }

              // Mirror video parameter
              console.log('🎯 [FRONTEND] enableMirror state:', enableMirror, 'type:', typeof enableMirror);
              console.log('🎯 [FRONTEND] enableMirror.toString():', enableMirror.toString());
              formData.append('enable_mirror', enableMirror.toString());

              // Source channel overlay parameters
              if (enableSourceChannel) {
                formData.append('enable_source_channel', 'true');
                formData.append('source_font', sourceFont);
                formData.append('source_font_size', sourceFontSize.toString());
                formData.append('source_font_color', sourceFontColor);
                formData.append('source_position', sourcePosition);
              } else {
                formData.append('enable_source_channel', 'false');
              }

              // Send to backend
              const response = await fetch('http://localhost:8000/process-video', {
                method: 'POST',
                body: formData,
              });

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }

              // Handle the video response
              const videoBlob = await response.blob();
              const videoUrl = URL.createObjectURL(videoBlob);
              const filename = sanitizeFilename(videoSource.name);
              const downloadName = `captioned_${filename.replace(/\.[^/.]+$/, "")}.mp4`;

              return { url: videoUrl, filename, downloadName };

            } catch (error) {
              console.error(`Error processing video:`, error);
              const filename = sanitizeFilename(videoSource.name);
              return {
                url: null,
                filename,
                downloadName: null,
                error: error.message
              };
            }
          });

          return Promise.all(batchPromises);
        })();

        batchPromises.push(batchPromise);
      }

      // Process all batches concurrently
      console.log(`Starting ${totalBatches} batch(es) with ${batchPromises.length} promise(s)`);
      const batchResults = await Promise.all(batchPromises);
      console.log('All batches completed');
      const results = batchResults.flat();

      // Filter out errors and prepare successful results
      const successfulResults = results.filter(r => !r.error);

      // Auto-save successful results to localStorage - avoid duplicates
      const autocaptionHistory = JSON.parse(localStorage.getItem('autocaptionHistory') || '[]');

      // Get newly created files from disk to ensure we have correct metadata
      await window.electronAPI.getExistingFiles();

      // Wait a moment for file scanning to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get updated file list after processing
      const existingFiles = await window.electronAPI.getExistingFiles();
      const diskAutocaptionFiles = existingFiles.autocaption || [];

      // Create new valid results by matching successful processing results with disk files
      const newResults = successfulResults.map(result => {
        // Find the corresponding file on disk by trying to match filenames
        const expectedFilename = `captioned_${result.filename.replace(/^captioned_/, '').replace(/\.mp4$/, '')}.mp4`;
        const diskFile = diskAutocaptionFiles.find(diskFile =>
          diskFile.displayName && (
            diskFile.displayName.toLowerCase().includes(result.filename.replace(/^captioned_/, '').replace(/\.mp4$/, '').toLowerCase()) ||
            diskFile.filename.toLowerCase().includes(result.filename.replace(/^captioned_/, '').replace(/\.mp4$/, '').toLowerCase())
          )
        );

        if (diskFile) {
          // Use the actual disk file metadata
          return {
            id: Date.now() + Math.random(),
            outputPath: diskFile.outputPath, // Use correct disk path
            url: result.url, // Keep blob URL for immediate access
            createdAt: diskFile.createdAt,
            fileSize: diskFile.fileSize,
            autocaptionSource: 'upload'
          };
        } else {
          // Fallback - construct expected full path since file may not be scanned yet
          console.warn('Could not find disk file for:', result.filename);
          // Use a reasonable assumption for results directory based on platform
          const userDataPath = 'autocliper'; // Simplified path without platform detection
          const pathSep = '\\'; // Default to Windows path separator
          const fullExpectedPath = userDataPath + pathSep + 'autocliper' + pathSep + 'results' + pathSep + expectedFilename;

          return {
            id: Date.now() + Math.random(),
            outputPath: fullExpectedPath, // Full path instead of placeholder
            url: result.url,
            createdAt: new Date().toISOString(),
            fileSize: null,
            autocaptionSource: 'upload'
          };
        }
      }).filter(Boolean); // Remove any null results

      // Merge new results with existing history, avoiding duplicates based on outputPath
      const mergedHistory = [...autocaptionHistory];

      for (const newResult of newResults) {
        if (!newResult || !newResult.outputPath) continue;

        const existingIndex = mergedHistory.findIndex(existing =>
          existing && existing.outputPath && existing.outputPath === newResult.outputPath
        );

        if (existingIndex === -1) {
          // No duplicate found, add the new result
          mergedHistory.unshift(newResult); // Add to beginning (most recent)
          console.log(`Added new autocaption result: ${newResult.outputPath}`);
        } else {
          // Update existing entry with new metadata but keep the ID
          const existingId = mergedHistory[existingIndex].id;
          mergedHistory[existingIndex] = { ...newResult, id: existingId };
          // Move to front (most recent)
          const [updatedItem] = mergedHistory.splice(existingIndex, 1);
          mergedHistory.unshift(updatedItem);
          console.log(`Updated existing autocaption result: ${newResult.outputPath}`);
        }
      }

      // Keep only the most recent 50 entries
      const updatedHistory = mergedHistory.slice(0, 50);
      localStorage.setItem('autocaptionHistory', JSON.stringify(updatedHistory));

      // Update results with all videos, including errors for display
      setResultVideos(results);

      const successCount = successfulResults.length;
      const totalCount = videoSources.length;
      setProgress(`Completed! Processed ${successCount}/${totalCount} videos successfully.`);

      // Clear processing state after a short delay to show completion message
      setTimeout(() => {
        setIsProcessing(false);

        // Success notification - more detailed
        if (successCount > 0) {
          const successMessage = `✅ Subtitle creation completed successfully!\n\n📹 Processed: ${successCount}/${totalCount} videos\n💾 Saved in: Results folder\n\n🎬 All videos now have AI-generated captions!\n\n💡 Tip: Open the Results folder to see your captioned videos.`;
          alert(successMessage);
        }
      }, 2000);
    } catch (error) {
      console.error('Error in processVideos:', error);
      // Show error in progress
      setProgress(`Error: ${error.message}`);
      // Ensure processing state is cleared
      setIsProcessing(false);
    } finally {
      // Absolutely ensure processing state is cleared
      setIsProcessing(false);
    }
  };

  // Handle clip selection
  const handleClipSelection = (clip, isSelected) => {
    if (isSelected) {
      setSelectedClips(prev => [...prev, clip]);
    } else {
      setSelectedClips(prev => prev.filter(c => c.id !== clip.id));
    }
  };

  // Sync bulk mode with clip selection changes
  useEffect(() => {
    if (videoSource === 'clips') {
      setIsBulkMode(selectedClips.length > 1);
    }
  }, [selectedClips.length, videoSource]);

  // Initialize bulk titles when clips are selected
  useEffect(() => {
    if (videoSource === 'clips') {
      if (isBulkMode && selectedClips.length > 0) {
        // In bulk mode, initialize bulkTitles array based on selectedClips
        const newBulkTitles = selectedClips.map(clip => {
          // Use existing caption as default title, or empty string
          return clip.caption && clip.caption.trim() ? clip.caption.trim() : '';
        });
        setBulkTitles(newBulkTitles);
      } else if (!isBulkMode && selectedClips.length === 1) {
        // In single mode with one clip, don't override user input - let handleTitleToggle manage it
        // Reset bulkTitles to empty since we're not in bulk mode
        setBulkTitles([]);
      }
    } else if (videoSource === 'upload' && files.length > 0) {
      // Reset bulkTitles for files - files don't have captions
      setBulkTitles([]);
    }
  }, [selectedClips, videoSource, files.length, isBulkMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log('🎯 [SUBMIT] handleSubmit called');
    console.log('🎯 [SUBMIT] enableMirror state at submit:', enableMirror, 'type:', typeof enableMirror);

    if (videoSource === 'upload' && files.length === 0) {
      alert('Please select video files');
      return;
    }

    if (videoSource === 'clips' && selectedClips.length === 0) {
      alert('Please select clips to caption');
      return;
    }

    // For clips, validate that they have valid output paths and exist
    if (videoSource === 'clips') {
      const validClips = [];
      for (const clip of selectedClips) {
        if (!clip.outputPath) {
          console.warn(`Clip ${clip.name} has no output path - skipping`);
          continue;
        }
        validClips.push(clip);
      }

      if (validClips.length === 0) {
        alert('None of the selected clips have been processed yet. Please wait for clips to be generated first.');
        return;
      }

      if (validClips.length !== selectedClips.length) {
        alert(`${selectedClips.length - validClips.length} clips were skipped because they are not ready yet. Only ${validClips.length} clips will be processed.`);
      }
    }

    // Set bulk mode based on video source and selection count
    if (videoSource === 'upload') {
      setIsBulkMode(files.length > 1);
    } else if (videoSource === 'clips') {
      setIsBulkMode(selectedClips.length > 1);
    } else {
      setIsBulkMode(false);
    }

    if (videoSource === 'upload') {
      // Convert files to video source objects
      const videoSources = files.map(file => ({ file, name: file.name }));
      await processVideos(videoSources);
    } else if (videoSource === 'clips') {
      // Filter only valid clips for processing
      const validClips = selectedClips.filter(clip => clip.outputPath);
      setSelectedClips(validClips); // Update the UI to show only valid clips

      // Convert selected clips to video sources
      const videoSources = validClips.map(clip => ({
        file: null, // Clips use different processing
        name: clip.name,
        clip: clip,
        isFromClipHistory: true,
        clipPath: clip.outputPath
      }));
      await processClips(videoSources);
    }
  };

  // Process clips (similar to videos but from clip files)
  const processClips = async (clipSources) => {
    setIsProcessing(true);
    setProgress(`Starting clip processing... (${clipSources.length} clips)`);
    setResultVideos([]);

    try {
      const BATCH_SIZE = 3;
      const totalBatches = Math.ceil(clipSources.length / BATCH_SIZE);

      const batchPromises = [];
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, clipSources.length);
        const batchClips = clipSources.slice(start, end);

        const batchPromise = (async () => {
          const batchPromises = batchClips.map(async (clip) => {
            try {
              const formData = new FormData();

              // Debug logging
              console.log('Sending clip to backend:', {
                clipPath: clip.clipPath,
                clipName: clip.name,
                clipId: clip.id
              });

              // Use clip file path instead of uploaded file - ensure it's a string
              const filePath = String(clip.clipPath || '');
              formData.append('file_path', filePath);

              // Include the full caption content from the clip
              if (clip.caption && clip.caption.trim()) {
                formData.append('existing_caption', clip.caption.trim());
                console.log('Sending caption content to backend:', clip.caption.trim());
              }

              formData.append('words_per_line', wordsPerLine.toString());
              formData.append('font_template', fontTemplate);
              formData.append('font_size', fontSize.toString());

              // Video resize parameters
              if (enableResize) {
                formData.append('enable_resize', 'true');
                formData.append('target_aspect_ratio', targetAspectRatio);
                formData.append('background_type', backgroundType);
                formData.append('cropping_mode', croppingMode);
              } else {
                formData.append('enable_resize', 'false');
              }

              // Title overlay parameters for clips
              if (enableTitle) {
                // For clips, use bulkTitles if available, otherwise use main titleText
                const titleForThisClip = bulkTitles[start + batchClips.findIndex(c => c === clip)] ||
                                        (clip.caption && clip.caption.trim()) ||
                                        titleText.trim();

                if (titleForThisClip && titleForThisClip.trim()) {
                  formData.append('enable_title', 'true');
                  formData.append('title_text', titleForThisClip.trim());
                  formData.append('title_font', titleFont);
                  formData.append('title_font_size', titleFontSize.toString());
                  formData.append('title_font_color', titleFontColor);
                  formData.append('title_position', titlePosition);
                } else {
                  formData.append('enable_title', 'false');
                }
              } else {
                formData.append('enable_title', 'false');
              }

              // Subtitle Translation parameters - skip if translation not enabled
              if (enableTranslation) {
                formData.append('enable_translation', 'true');
                formData.append('translation_target', targetLanguage);
              } else {
                formData.append('enable_translation', 'false');
              }

              // Mirror video parameter
              console.log('🎯 [FRONTEND processClips] enableMirror state:', enableMirror, 'type:', typeof enableMirror);
              console.log('🎯 [FRONTEND processClips] enableMirror.toString():', enableMirror.toString());
              formData.append('enable_mirror', enableMirror.toString());

              // Source channel overlay parameters
              if (enableSourceChannel) {
                formData.append('enable_source_channel', 'true');
                formData.append('source_font', sourceFont);
                formData.append('source_font_size', sourceFontSize.toString());
                formData.append('source_font_color', sourceFontColor);
                formData.append('source_position', sourcePosition);
              } else {
                formData.append('enable_source_channel', 'false');
              }

              const response = await fetch('http://localhost:8000/process-video', {
                method: 'POST',
                body: formData,
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
              }

              const videoBlob = await response.blob();
              const videoUrl = URL.createObjectURL(videoBlob);
              const filename = sanitizeFilename(clip.name);
              const downloadName = `captioned_${filename.replace(/\.[^/.]+$/, "")}.mp4`;

              return { url: videoUrl, filename, downloadName };

            } catch (error) {
              console.error(`Error processing clip:`, error);
              const filename = sanitizeFilename(clip.name);
              return {
                url: null,
                filename,
                downloadName: null,
                error: error.message
              };
            }
          });

          return Promise.all(batchPromises);
        })();

        batchPromises.push(batchPromise);
      }

      const batchResults = await Promise.all(batchPromises);
      const results = batchResults.flat();

      const successfulResults = results.filter(r => !r.error);

      const autocaptionHistory = JSON.parse(localStorage.getItem('autocaptionHistory') || '[]');

      await window.electronAPI.getExistingFiles();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const existingFiles = await window.electronAPI.getExistingFiles();
      // Processed caption videos are always stored in the results/autocaption directory, regardless of source
      const diskFiles = existingFiles.autocaption || [];

      const newResults = successfulResults.map(result => {
        const expectedFilename = `captioned_${result.filename.replace(/^captioned_/, '').replace(/\.mp4$/, '')}.mp4`;
        const diskFile = diskFiles.find(diskFile =>
          diskFile.displayName && diskFile.filename && (
            diskFile.displayName.toLowerCase().includes(result.filename.replace(/^captioned_/, '').replace(/\.mp4$/, '').toLowerCase()) ||
            diskFile.filename.toLowerCase().includes(result.filename.replace(/^captioned_/, '').replace(/\.mp4$/, '').toLowerCase())
          )
        );

        if (diskFile) {
          return {
            id: Date.now() + Math.random(),
            outputPath: diskFile.outputPath,
            url: result.url,
            createdAt: diskFile.createdAt,
            fileSize: diskFile.fileSize,
            autocaptionSource: 'clip_history'
          };
        } else {
          const userDataPath = 'autocliper'; // Simplified path without platform detection
          const pathSep = '\\'; // Default to Windows path separator
          const fullExpectedPath = userDataPath + pathSep + 'autocliper' + pathSep + 'results' + pathSep + expectedFilename;

          return {
            id: Date.now() + Math.random(),
            outputPath: fullExpectedPath,
            url: result.url,
            createdAt: new Date().toISOString(),
            fileSize: null,
            autocaptionSource: 'clip_history'
          };
        }
      }).filter(Boolean);

      const mergedHistory = [...autocaptionHistory];
      for (const newResult of newResults) {
        const existingIndex = mergedHistory.findIndex(existing =>
          existing.outputPath === newResult.outputPath ||
          (existing.outputPath && newResult.outputPath &&
           existing.outputPath.split(/[/\\]/).pop() === newResult.outputPath.split(/[/\\]/).pop())
        );

        if (existingIndex === -1) {
          mergedHistory.unshift(newResult);
        } else {
          const existingId = mergedHistory[existingIndex].id;
          mergedHistory[existingIndex] = { ...newResult, id: existingId };
          const [updatedItem] = mergedHistory.splice(existingIndex, 1);
          mergedHistory.unshift(updatedItem);
        }
      }

      const updatedHistory = mergedHistory.slice(0, 50);
      localStorage.setItem('autocaptionHistory', JSON.stringify(updatedHistory));

      setResultVideos(results);

      const successCount = successfulResults.length;
      const totalCount = clipSources.length;
      setProgress(`Completed! Processed ${successCount}/${totalCount} clips successfully.`);

      setTimeout(() => {
        setIsProcessing(false);

        // Success notification - more detailed
        if (successCount > 0) {
          const successMessage = `✅ Clip subtitle creation completed successfully!\n\n📹 Processed: ${successCount}/${totalCount} clips\n💾 Saved in: Results folder\n\n🎬 All clips now have AI-generated captions!\n\n💡 Tip: Open the Results folder to see your captioned clips.`;
          alert(successMessage);
        }
      }, 2000);
    } catch (error) {
      console.error('Error in processClips:', error);
      setProgress(`Error: ${error.message}`);
      setIsProcessing(false);
    } finally {
      setIsProcessing(false);
    }
  };

  // Function to generate preview styles that EXACTLY match subtitle.py ASS formats
  // Converts ASS colors (&HBBGGRR) to CSS and maps BorderStyle, Outline, Shadow parameters
  const getTemplatePreviewStyles = (template) => {
    const baseFontSize = 30; // Larger for preview visibility

    // Helper: Convert ASS &HBBGGRR format to #RRGGBB CSS
    const assColorToCss = (assColor) => {
      if (!assColor || !assColor.startsWith('&H')) return 'white';

      // Remove &H prefix, reverse bytes: BBGG RR BB -> RR GGB
      const cleanColor = assColor.substring(2);
      if (cleanColor.length !== 6) return 'white';

      const bb = cleanColor.substring(0, 2);
      const gg = cleanColor.substring(2, 4);
      const rr = cleanColor.substring(4, 6);

      return `#${rr}${gg}${bb}`;
    };

    // Helper: Create shadow effects based on Outline, Shadow, BorderStyle values
    const createShadowEffects = (outlineColor, outlineWidth, shadowX, shadowY, borderStyle = 1, bold = false) => {
      let shadowEffects = [];

      // For BorderStyle=3 (solid box), create background
      if (borderStyle === 3) {
        return {
          background: 'rgba(0,0,0,0.9)',
          padding: '6px 12px',
          borderRadius: '2px',
          textShadow: 'none',
          border: 'none'
        };
      }

      // Outline (border) effect
      if (outlineWidth > 0) {
        const outline = `0 0 0 ${outlineWidth}px ${outlineColor}`;
        shadowEffects.push(outline);
      }

      // Shadow effect
      if (shadowX || shadowY) {
        const shadow = `${shadowX}px ${shadowY}px 4px rgba(0,0,0,0.8)`;
        shadowEffects.push(shadow);
      }

      return {
        textShadow: shadowEffects.length > 0 ? shadowEffects.join(', ') : bold ? '2px 2px 4px rgba(0,0,0,0.8)' : '1px 1px 2px rgba(0,0,0,0.7)',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '0'
      };
    };

    // Map exact ASS style definitions to CSS (matching subtitle.py 100%)
    const styleMap = {
      // 1. DEFAULT CLEAN: Putih bersih dengan outline hitam tipis
      "default": (() => {
        const primaryColor = assColorToCss('&HFFFFFF'); // White
        const outlineColor = assColorToCss('&H000000');   // Black
        const shadow = createShadowEffects(outlineColor, 1, 0, 0, 1, false);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'normal',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 2. VIRAL YELLOW (Ala Hormozi): Kuning terang, font Impact besar
      "alex-hormozi": (() => {
        const primaryColor = assColorToCss('&H00FFFF'); // Yellow
        const outlineColor = assColorToCss('&H000000');   // Black
        const shadow = createShadowEffects(outlineColor, 5, 2, 4, 1, true);

        return {
          fontFamily: 'Impact, sans-serif',
          fontSize: `${Math.round(baseFontSize * 1.25)}px`, // 25% bigger
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 3. KARAOKE GREEN: Hijau GLOW dengan outline hijau sendiri
      "emerald-highlight": (() => {
        const primaryColor = assColorToCss('&H00FF00');   // Green
        const secondaryColor = assColorToCss('&H0000FF');  // Blue
        const outlineColor = assColorToCss('&H00FF00');    // Green same as primary
        const shadow = createShadowEffects(outlineColor, 4, 6, 3, 1, true);

        return {
          fontFamily: 'Impact, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 4. MODERN BOX: KOTAK hitam SOLID (Netflix style) - BorderStyle=3
      "modern-clean": (() => {
        const primaryColor = assColorToCss('&HFFFFFF'); // White
        const outlineColor = assColorToCss('&H000000');   // Black
        const shadow = createShadowEffects(outlineColor, 0, 0, 0, 3, false); // BorderStyle=3 = solid box

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'normal',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 5. SOFT AESTHETIC: Font serif, putih, shadow lembut
      "cinematic-black": (() => {
        const primaryColor = assColorToCss('&HFFFFFF'); // White
        const outlineColor = assColorToCss('&H000000');   // Black
        const backColor = assColorToCss('&H80000000');    // 50% black
        const shadow = createShadowEffects(outlineColor, 1, 2, 2, 1, false);

        return {
          fontFamily: 'Georgia, serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'normal',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 6. MRBEAST STYLE: Putih dengan outline hitam SANGAT tebal
      "mrbeast-energy": (() => {
        const primaryColor = assColorToCss('&HFFFFFF'); // White
        const outlineColor = assColorToCss('&H000000');   // Black
        const shadow = createShadowEffects(outlineColor, 5, 4, 2, 1, true);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 7. NEON CYAN: Warna Cyan terang
      "neon-glow": (() => {
        const primaryColor = assColorToCss('&HFFFF00'); // Cyan (FF FF 00 = Cyan)
        const outlineColor = assColorToCss('&H000000');   // Black
        const shadow = createShadowEffects(outlineColor, 3, 0, 2, 1, true);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 8. FIRE RED: Merah menyala dengan outline putih
      "lemon-punch": (() => {
        const primaryColor = assColorToCss('&H0000FF');   // Red
        const outlineColor = assColorToCss('&HFFFFFF');    // White
        const shadow = createShadowEffects(outlineColor, 3, 0, 2, 1, true);

        return {
          fontFamily: 'Impact, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 9. MINIMALIST DARK: Teks hitam dengan outline putih tebal
      "minimalist-outline": (() => {
        const primaryColor = assColorToCss('&H000000');   // Black
        const outlineColor = assColorToCss('&HFFFFFF');    // White
        const shadow = createShadowEffects(outlineColor, 2, 0, 2, 1, false);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'normal',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          background: 'rgba(255,255,255,0.95)',
          ...shadow
        };
      })(),

      // 10. BOLD ORANGE: Oranye terang (CapCut style)
      "bold-gradient": (() => {
        const primaryColor = assColorToCss('&H00A5FF'); // Orange (00 A5 FF -> FF A5 00)
        const outlineColor = assColorToCss('&H000000');   // Black
        const shadow = createShadowEffects(outlineColor, 3, 1, 2, 1, true);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 11. TRANSPARENT BOX: Transparent background box
      "transparent-box": (() => {
        const primaryColor = assColorToCss('&HFFFFFF'); // White
        const outlineColor = assColorToCss('&H000000');   // Black
        const shadow = createShadowEffects(outlineColor, 0, 0, 2, 3, true);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 12. BLUE FOCUS: Biru elektrik
      "blue-focus": (() => {
        const primaryColor = assColorToCss('&HFF8000'); // Orange (FF 80 00 -> 00 80 FF = Orange)
        const outlineColor = assColorToCss('&H000000');   // Black
        const shadow = createShadowEffects(outlineColor, 3, 0, 2, 1, true);

        return {
          fontFamily: 'Impact, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // 13. SOCIAL CLEAN: Font standar, shadow tipis
      "social-clean": (() => {
        const primaryColor = assColorToCss('&HFFFFFF');   // White
        const outlineColor = assColorToCss('&H000000');    // Black
        const backColor = assColorToCss('&H40000000');     // 25% black
        const shadow = createShadowEffects(outlineColor, 1, 1, 2, 1, false);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'normal',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })(),

      // LEGACY TEMPLATES (for backward compatibility)
      "ali-abdaal": (() => {
        const primaryColor = assColorToCss('&H000000');   // Black
        const outlineColor = assColorToCss('&HFFFFFF');    // White
        const shadow = createShadowEffects(outlineColor, 2, 0, 2, 1, false);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'normal',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          background: 'rgba(255,255,255,0.95)',
          ...shadow
        };
      })(),

      "bubble": (() => {
        const primaryColor = assColorToCss('&H000000');   // Black
        const outlineColor = assColorToCss('&HFFFFFF');    // White
        const shadow = createShadowEffects(outlineColor, 2, 0, 2, 1, false);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          background: 'rgba(255,255,255,0.9)',
          borderRadius: '8px',
          padding: '6px 12px',
          ...shadow
        };
      })(),

      "word-by-word": (() => {
        const primaryColor = assColorToCss('&HFFFFFF'); // White
        const outlineColor = assColorToCss('&H000000');   // Black
        const shadow = createShadowEffects(outlineColor, 3, 0, 2, 1, false);

        return {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 'bold',
          color: primaryColor,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...shadow
        };
      })()
    };

    return styleMap[template] || styleMap["default"];
  };

  // Font template preview rendering function
  const getFontPreview = (template) => {
    const previewText = "Sample Caption";
    const previewStyles = getTemplatePreviewStyles(template);

    return (
      <div className="flex flex-col items-center space-y-2">
        <div className="px-4 py-2 bg-white/5 rounded-lg backdrop-blur-sm border border-white/10">
          <span
            className="block text-lg font-sans"
            style={previewStyles}
          >
            {previewText}
          </span>
        </div>
        <span className="text-xs text-gray-400 capitalize">{template.replace('-', ' ')}</span>
      </div>
    );
  };

  // Title template preview styles - UPDATED WITH FONT VARIETY & SIZES
  const getTitleTemplatePreviewStyles = (template) => {
    const templateMap = {
      "background_putih": {
        fontFamily: 'Arial, sans-serif',
        fontSize: '48px',
        fontWeight: 'bold',
        color: '#000000',
        background: 'rgba(255,255,255,0.9)',
        padding: '8px 16px',
        borderRadius: '4px',
        textShadow: '1px 1px 2px rgba(255,255,255,0.8)',
        border: '2px solid #000000'
      },
      "background_hitam": {
        fontFamily: 'Impact, sans-serif',
        fontSize: '52px',
        fontWeight: 'bold',
        color: '#FFFFFF',
        background: 'rgba(0,0,0,0.9)',
        padding: '8px 16px',
        borderRadius: '4px',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        border: '2px solid #FFFFFF'
      },
      "transparent_hitam": {
        fontFamily: 'Georgia, serif',
        fontSize: '50px',
        fontWeight: 'bold',
        color: '#FFFFFF',
        background: 'rgba(0,0,0,0.5)',
        padding: '8px 16px',
        borderRadius: '4px',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        border: '2px solid rgba(255,255,255,0.3)'
      },
      "transparent_putih": {
        fontFamily: 'Times New Roman, serif',
        fontSize: '46px',
        fontWeight: 'bold',
        color: '#000000',
        background: 'rgba(255,255,255,0.5)',
        padding: '8px 16px',
        borderRadius: '4px',
        textShadow: '1px 1px 2px rgba(255,255,255,0.8)',
        border: '2px solid rgba(0,0,0,0.3)'
      },
      "font_merah": {
        fontFamily: 'Arial, sans-serif',
        fontSize: '48px',
        fontWeight: 'bold',
        color: '#FF0000',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '0',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        border: 'none'
      },
      "font_biru": {
        fontFamily: 'Impact, sans-serif',
        fontSize: '52px',
        fontWeight: 'bold',
        color: '#0000FF',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '0',
        textShadow: '2px 2px 4px rgba(255,255,255,0.8)',
        border: 'none'
      },
      "font_hijau": {
        fontFamily: 'Georgia, serif',
        fontSize: '50px',
        fontWeight: 'bold',
        color: '#00FF00',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '0',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        border: 'none'
      },
      "font_kuning": {
        fontFamily: 'Times New Roman, serif',
        fontSize: '46px',
        fontWeight: 'bold',
        color: '#FFFF00',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '0',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        border: 'none'
      },
      "font_orange": {
        fontFamily: 'Arial, sans-serif',
        fontSize: '48px',
        fontWeight: 'bold',
        color: '#FFA500',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '0',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        border: 'none'
      },
      "font_pink": {
        fontFamily: 'Impact, sans-serif',
        fontSize: '52px',
        fontWeight: 'bold',
        color: '#FFC0CB',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '0',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        border: 'none'
      },
      "font_cyan": {
        fontFamily: 'Georgia, serif',
        fontSize: '50px',
        fontWeight: 'bold',
        color: '#00FFFF',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '0',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        border: 'none'
      },
      "font_magenta": {
        fontFamily: 'Times New Roman, serif',
        fontSize: '46px',
        fontWeight: 'bold',
        color: '#FF00FF',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '0',
        textShadow: '2px 2px 4px rgba(255,255,255,0.8)',
        border: 'none'
      }
    };

    return templateMap[template] || templateMap["background_hitam"];
  };

// Title preview rendering function
const getTitlePreview = () => {
  const previewText = titleText || "Your Title Here";

  // Create simple preview styles based on selected font and color
  const fontFamilyMap = {
    arial: 'Arial, sans-serif',
    impact: 'Impact, sans-serif',
    georgia: 'Georgia, serif',
    times: 'Times New Roman, serif',
    comic: 'Comic Sans MS, cursive'
  };

  const previewStyles = {
    fontFamily: fontFamilyMap[titleFont] || 'Arial, sans-serif',
    fontSize: `${Math.min(titleFontSize, 60)}px`,
    fontWeight: 'bold',
    color: titleFontColor,
    textAlign: 'center',
    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
    lineHeight: '1.2'
  };

  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="px-4 py-3 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg border border-gray-600/50 min-h-[80px] flex items-center justify-center">
        <span
          className="block text-center"
          style={previewStyles}
        >
          {previewText}
        </span>
      </div>
      <span className="text-xs text-gray-400 capitalize">{titleFont} - {titleFontColor}</span>
    </div>
  );
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Fixed Header */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-cyan-500/20">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-white">🔤 Auto Caption Video</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6">

        {/* Main Card */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl overflow-hidden shadow-2xl border border-cyan-500/10 mb-8">

          {/* Header */}
          <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 p-6 border-b border-cyan-500/20">
            <h2 className="text-2xl font-bold text-white flex items-center space-x-3">
              <span className="text-cyan-400">🎬</span>
              <span>Video Captioning</span>
            </h2>
            <p className="text-gray-300 text-sm mt-2">
              Choose a video source and customize your caption settings
            </p>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

              {/* Left Panel - Video Selection */}
              <div className="xl:col-span-2 space-y-6">
                {/* Source Selection */}
                <div className="bg-gradient-to-br from-gray-800/50 to-gray-700/50 rounded-xl p-6 border border-gray-600/30">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                    <span className="text-cyan-400">🎬</span>
                    <span>Select Video Source</span>
                  </h3>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button
                      onClick={() => {
                        setVideoSource('upload');
                        setSelectedClips([]);
                        setFiles([]);
                      }}
                      className={`flex items-center justify-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                        videoSource === 'upload'
                          ? 'bg-cyan-600 text-white shadow-lg'
                          : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 hover:text-white'
                      }`}
                    >
                      <span className="text-xl">📤</span>
                      <div className="text-left">
                        <div className="font-medium">Upload New Video</div>
                        <div className="text-xs opacity-75">From your computer</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setVideoSource('clips');
                        setSelectedClips([]);
                        setFiles([]);
                      }}
                      className={`flex items-center justify-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                        videoSource === 'clips'
                          ? 'bg-purple-600 text-white shadow-lg'
                          : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 hover:text-white'
                      }`}
                    >
                      <span className="text-xl">✂️</span>
                      <div className="text-left">
                        <div className="font-medium">Riwayat Potongan</div>
                        <div className="text-xs opacity-75">From clip history</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Upload Form */}
                {videoSource === 'upload' && (
                  <div className="bg-gradient-to-br from-gray-800/50 to-gray-700/50 rounded-xl p-6 border border-gray-600/30">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                      <span className="text-cyan-400">📤</span>
                      <span>Upload Video</span>
                    </h3>

                    <form onSubmit={handleSubmit}>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Video File</label>
                          <input
                            type="file"
                            accept="video/*"
                            multiple
                            onChange={handleFileChange}
                            className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors file:bg-gray-600 file:border-0 file:rounded-md file:px-3 file:py-1 file:text-sm file:text-white file:mr-3"
                          />

                          {/* Debug Info */}
                          <div className="mt-2 text-xs text-yellow-400 bg-gray-800/30 p-2 rounded">
                            DEBUG: files.length = {files.length} | isBulkMode = {isBulkMode.toString()} | enableTitle = {enableTitle.toString()}
                          </div>

                          {files.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {files.length === 1 ? (
                                <p className="text-sm text-cyan-400 flex items-center space-x-2">
                                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                  <span>
                                    Selected: {files[0].name} ({(files[0].size / 1024 / 1024).toFixed(2)} MB)
                                  </span>
                                </p>
                              ) : (
                                <>
                                  <p className="text-sm text-purple-400 font-medium mb-2">
                                    📁 Selected {files.length} files for bulk processing | {isBulkMode ? 'Bulk Mode Enabled' : 'Single Mode'}
                                  </p>
                                  <div className="max-h-32 overflow-y-auto space-y-1">
                                    {files.map((f, idx) => (
                                      <p key={idx} className="text-xs text-gray-400 flex items-center space-x-2">
                                        <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full flex-shrink-0"></span>
                                        <span className="truncate">
                                          {f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB)
                                        </span>
                                      </p>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </form>
                  </div>
                )}

                {/* Clip Selection */}
                {videoSource === 'clips' && (
                  <div className="bg-gradient-to-br from-gray-800/50 to-gray-700/50 rounded-xl p-6 border border-gray-600/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                        <span className="text-purple-400">✂️</span>
                        <span>Riwayat Potongan</span>
                      </h3>
                      <button
                        onClick={() => setShowClipSelector(true)}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all transform hover:scale-105"
                      >
                        Pilih Clip ({clipperSessions.flatMap(s => s.clips || []).length} tersedia)
                      </button>
                    </div>

                    {selectedClips.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <div className="text-4xl mb-4">📋</div>
                        <p className="font-medium">No clips selected yet</p>
                        <p className="text-sm">Click "Pilih Clip" to select clips for captioning</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-purple-400 font-medium">Selected clips ({selectedClips.length})</p>
                          <button
                            onClick={() => setSelectedClips([])}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Clear all
                          </button>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {selectedClips.map(clip => (
                            <div key={clip.id} className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                                  <span className="text-sm font-bold text-white">✂️</span>
                                </div>
                                <div>
                                  <p className="font-medium text-white">{clip.name}</p>
                                  <p className="text-xs text-gray-400">{clip.caption || `Clip ${clip.id}`}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleClipSelection(clip, false)}
                                className="w-6 h-6 rounded-full bg-red-600/80 hover:bg-red-500 flex items-center justify-center text-xs font-bold text-white transition-colors"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Panel - Settings */}
              <div className="xl:col-span-1 space-y-6">

                {/* Caption Settings */}
                <div className="bg-gradient-to-br from-orange-900/20 to-red-900/20 rounded-xl p-6 border border-orange-500/30">
                  <h3 className="text-lg font-semibold text-white mb-6 flex items-center space-x-2">
                    <span className="text-orange-400">⚙️</span>
                    <span>Caption Settings</span>
                  </h3>

                  <form onSubmit={handleSubmit} className="space-y-6">

                    {/* Words Per Line */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Words Per Caption Line</label>
                      <select
                        value={wordsPerLine}
                        onChange={(e) => setWordsPerLine(parseInt(e.target.value))}
                        className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
                      >
                        <option value={1}>1 word per line</option>
                        <option value={2}>2 words per line</option>
                        <option value={3}>3 words per line</option>
                      </select>
                      <p className="text-xs text-gray-400 mt-2">
                        Controls how many words appear on each caption line
                      </p>
                    </div>

                    {/* Font Template */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Caption Font Template</label>
                      <select
                        value={fontTemplate}
                        onChange={(e) => setFontTemplate(e.target.value)}
                        className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
                      >
                        <optgroup label="Clean & Professional">
                          <option value="default">Default Clean (Netflix Style)</option>
                          <option value="modern-clean">Modern Box (Netflix)</option>
                          <option value="cinematic-black">Soft Aesthetic</option>
                          <option value="social-clean">Social Clean</option>
                        </optgroup>
                        <optgroup label="Viral Creator Styles">
                          <option value="alex-hormozi">Viral Yellow (Alex Hormozi)</option>
                          <option value="mrbeast-energy">MrBeast Energy</option>
                          <option value="emerald-highlight">Karaoke Green (Highlight)</option>
                        </optgroup>
                        <optgroup label="Neon & Glow">
                          <option value="neon-glow">Neon Cyan (Tech/Gaming)</option>
                          <option value="lemon-punch">Fire Red (Intense)</option>
                          <option value="blue-focus">Blue Focus</option>
                        </optgroup>
                        <optgroup label="Minimalist">
                          <option value="minimalist-outline">Minimalist Dark</option>
                          <option value="bold-gradient">Bold Orange (CapCut)</option>
                          <option value="transparent-box">Transparent Box</option>
                        </optgroup>
                      </select>
                      <p className="text-xs text-gray-400 mt-2">
                        Choose a caption style template for your video
                      </p>

                      {/* Template Preview */}
                      <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-600/30">
                        <h5 className="text-xs font-medium text-gray-300 mb-3 flex items-center space-x-2">
                          <span>👀</span>
                          <span>Template Preview</span>
                        </h5>
                        <div className="flex items-center justify-center">
                          {getFontPreview(fontTemplate)}
                        </div>
                      </div>

                    </div>



                    {/* Font Size */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">Font Size: {fontSize}px</label>
                      <input
                        type="range"
                        min="40"
                        max="90"
                        step="5"
                        value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                        className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-orange"
                      />
                      <div className="flex justify-between text-xs text-gray-400 mt-2">
                        <span>Medium (40px)</span>
                        <span>Large (65px)</span>
                        <span>Extra Large (90px)</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Adjust the size of your caption text - larger font for better visibility
                      </p>
                    </div>

                    {/* Video Resize Settings */}
                    <div className="border-t border-gray-600 pt-6">
                      <h4 className="text-sm font-semibold text-white mb-4 flex items-center space-x-2">
                        <span>📐</span>
                        <span>Video Resize (Optional)</span>
                      </h4>

                      {/* Enable Resize Toggle */}
                      <div className="mb-4">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enableResize}
                            onChange={(e) => setEnableResize(e.target.checked)}
                            className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
                          />
                          <span className="text-sm font-medium text-gray-300">Enable video resizing</span>
                        </label>
                        <p className="text-xs text-gray-400 mt-1">
                          Resize video aspect ratio and add custom backgrounds
                        </p>
                      </div>

                      {/* Enable Mirror Toggle */}
                      <div className="mb-4">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enableMirror}
                            onChange={(e) => {
                              console.log('🎯 [CHECKBOX] Mirror checkbox clicked, current state:', enableMirror, 'new value:', e.target.checked);
                              setEnableMirror(e.target.checked);
                            }}
                            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <span className="text-sm font-medium text-gray-300">Mirror video (horizontal flip)</span>
                          {enableMirror && (
                            <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full border border-blue-500/30">
                              Active
                            </span>
                          )}
                        </label>
                        <p className="text-xs text-gray-400 mt-1">
                          Flip video horizontally (left-right mirror effect). Useful for creating mirror dance videos or fixing orientation.
                        </p>
                        {enableMirror && (
                          <div className="mt-2 p-2 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                            <p className="text-xs text-blue-300">
                              🔄 Mirror effect will be applied to your video(s). This will flip the video horizontally (left becomes right).
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Target Aspect Ratio - Only when resizing enabled */}
                      {enableResize && (
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-300 mb-2">Target Aspect Ratio</label>
                          <select
                            value={targetAspectRatio}
                            onChange={(e) => setTargetAspectRatio(e.target.value)}
                            className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-colors"
                          >
                            <option value="9:16">9:16 (Portrait - TikTok/IG Stories)</option>
                            <option value="1:1">1:1 (Square - Instagram)</option>
                            <option value="4:5">4:5 (Portrait - Instagram)</option>
                            <option value="16:9">16:9 (Landscape - YouTube)</option>
                          </select>
                        </div>
                      )}

                      {/* Background Fill - Only when resizing enabled */}
                      {enableResize && (
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-300 mb-2">Background Fill</label>
                          <select
                            value={backgroundType}
                            onChange={(e) => setBackgroundType(e.target.value)}
                            className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-colors"
                          >
                            <option value="blur">Blur edges (recommended)</option>
                            <option value="black">Solid black</option>
                            <option value="white">Solid white</option>
                            <option value="gradient">Gradient</option>
                          </select>
                        </div>
                      )}

                      {/* Cropping Strategy - Always visible but shows notice when disabled */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Cropping Strategy
                          {!enableResize && (
                            <span className="text-yellow-400 text-xs ml-2">(Enable resizing to use)</span>
                          )}
                          {enableResize && backgroundType === 'blur' && (
                            <span className="text-blue-400 text-xs ml-2">(Auto-disabled with blur edges)</span>
                          )}
                        </label>
                        <select
                          value={croppingMode}
                          onChange={(e) => setCroppingMode(e.target.value)}
                          disabled={!enableResize || backgroundType === 'blur'}
                          className={`w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg transition-colors ${
                            !enableResize || backgroundType === 'blur'
                              ? 'cursor-not-allowed opacity-50'
                              : 'focus:border-purple-400 focus:ring-1 focus:ring-purple-400'
                          }`}
                        >
                          <optgroup label="Auto & Smart">
                            <option value="auto">Auto (smart crop to avoid cutting people)</option>
                            <option value="best">Best fit (minimal person cropping)</option>
                          </optgroup>
                          <optgroup label="Center & Balanced">
                            <option value="center">Center crop</option>
                          </optgroup>
                          <optgroup label="Directional">
                            <option value="top">Top crop</option>
                            <option value="bottom">Bottom crop</option>
                            <option value="left">Left crop</option>
                            <option value="right">Right crop</option>
                          </optgroup>
                          <optgroup label="Corner-Based">
                            <option value="top-left">Top-left corner</option>
                            <option value="top-right">Top-right corner</option>
                            <option value="bottom-left">Bottom-left corner</option>
                            <option value="bottom-right">Bottom-right corner</option>
                          </optgroup>
                          <optgroup label="Preserve All">
                            <option value="no-crop">No crop (add padding)</option>
                          </optgroup>
                        </select>
                        <p className="text-xs text-gray-400 mt-1">
                          {!enableResize
                            ? "Enable video resizing above to access cropping options"
                            : backgroundType === 'blur'
                              ? "Cropping strategy is auto-disabled when using blur edges background"
                              : "How to handle content that doesn't fit the new aspect ratio"
                          }
                        </p>
                      </div>
                    </div>

                    {/* Title Overlay Settings */}
                    <div className="border-t border-gray-600 pt-6">
                      <h4 className="text-sm font-semibold text-white mb-4 flex items-center space-x-2">
                        <span>📝</span>
                        <span>Title Overlay (Optional)</span>
                      </h4>

                      {/* Enable Title Toggle */}
                      <div className="mb-4">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enableTitle}
                            onChange={(e) => handleTitleToggle(e.target.checked)}
                            className="w-4 h-4 text-green-600 bg-gray-700 border-gray-600 rounded focus:ring-green-500 focus:ring-2"
                          />
                          <span className="text-sm font-medium text-gray-300">Add title overlay</span>
                        </label>
                        <p className="text-xs text-gray-400 mt-1">
                          Add custom title text like "POV: [Your Text]" to your video
                        </p>
                      </div>

                      {enableTitle && (
                        <div className="space-y-4 pl-4 border-l-2 border-gray-600">
                          {/* Bulk Mode vs Single Mode */}
                          {!isBulkMode ? (
                            /* Single Video Mode */
                            <>
                              {/* Title Text Input */}
                              <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Title Text</label>
                                <div className="relative">
                                  <textarea
                                    value={titleText}
                                    onChange={(e) => setTitleText(e.target.value)}
                                    placeholder="Enter your title text (e.g., POV: Learning Something New)"
                                    className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-green-400 focus:ring-1 focus:ring-green-400 transition-colors resize-vertical pr-12"
                                    maxLength={200}
                                    rows={3}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => pasteFromClipboard(setTitleText)}
                                    className="absolute right-2 top-2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                                    title="Paste from clipboard"
                                  >
                                    📋
                                  </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                  Max 200 characters. Example: "POV: First Day at Work"
                                </p>
                              </div>
                            </>
                          ) : (
                            /* Bulk Mode - Show title input for each video or clip */
                            <>
                              <div className="text-sm text-yellow-400 font-medium mb-3">
                                📋 Bulk Mode: Configure titles for each {videoSource === 'clips' ? 'clip' : 'video'}
                              </div>
                              <div className="space-y-3 max-h-48 overflow-y-auto">
                                {videoSource === 'upload' ? (
                                  // File uploads
                                  files.map((file, index) => (
                                    <div key={index} className="bg-gray-800/50 rounded-lg p-3">
                                      <label className="block text-sm font-medium text-gray-300 mb-2">
                                        {file.name.length > 30 ? file.name.substring(0, 27) + '...' : file.name}
                                      </label>
                                      <textarea
                                        value={bulkTitles[index] || ''}
                                        onChange={(e) => {
                                          const newTitles = [...bulkTitles];
                                          newTitles[index] = e.target.value;
                                          setBulkTitles(newTitles);
                                        }}
                                        placeholder={`Title for video ${index + 1}`}
                                        className="w-full bg-gray-700/50 border border-gray-600 text-white px-3 py-2 rounded-lg focus:border-green-400 focus:ring-1 focus:ring-green-400 transition-colors text-sm resize-vertical"
                                        maxLength={200}
                                        rows={2}
                                      />
                                    </div>
                                  ))
                                ) : (
                                  // Clip selections
                                  selectedClips.map((clip, index) => (
                                    <div key={clip.id} className="bg-gray-800/50 rounded-lg p-3">
                                      <label className="block text-sm font-medium text-gray-300 mb-2">
                                        {clip.name.length > 30 ? clip.name.substring(0, 27) + '...' : clip.name}
                                      </label>
                                      <div className="relative">
                                        <textarea
                                          value={bulkTitles[index] || ''}
                                          onChange={(e) => {
                                            const newTitles = [...bulkTitles];
                                            newTitles[index] = e.target.value;
                                            setBulkTitles(newTitles);
                                          }}
                                          placeholder={`Title for clip ${index + 1}`}
                                          className="w-full bg-gray-700/50 border border-gray-600 text-white px-3 py-2 rounded-lg focus:border-green-400 focus:ring-1 focus:ring-green-400 transition-colors text-sm resize-vertical pr-10"
                                          maxLength={200}
                                          rows={2}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => pasteFromClipboard((text) => {
                                            const newTitles = [...bulkTitles];
                                            newTitles[index] = text;
                                            setBulkTitles(newTitles);
                                          })}
                                          className="absolute right-2 top-2 bg-gray-600 hover:bg-gray-500 text-white px-1.5 py-0.5 rounded text-xs transition-colors"
                                          title="Paste from clipboard"
                                        >
                                          📋
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-2">
                                Enter unique titles for each {videoSource === 'clips' ? 'clip' : 'video'}. You can leave some empty if you don't want titles.
                              </p>
                            </>
                          )}

                          {/* Title Font Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Title Font</label>
                            <select
                              value={titleFont}
                              onChange={(e) => setTitleFont(e.target.value)}
                              className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-green-400 focus:ring-1 focus:ring-green-400 transition-colors"
                            >
                              <option value="arial">Arial (Clean, Professional)</option>
                              <option value="impact">Impact (Bold, Strong)</option>
                              <option value="georgia">Georgia (Elegant, Serif)</option>
                              <option value="times">Times New Roman (Classic, Serif)</option>
                              <option value="comic">Comic Sans (Playful)</option>
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                              Choose the font style for your title text
                            </p>
                          </div>

                          {/* Title Font Color */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Title Font Color</label>
                            <select
                              value={titleFontColor}
                              onChange={(e) => setTitleFontColor(e.target.value)}
                              className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-green-400 focus:ring-1 focus:ring-green-400 transition-colors"
                            >
                              <option value="white">White</option>
                              <option value="black">Black</option>
                              <option value="red">Red</option>
                              <option value="blue">Blue</option>
                              <option value="green">Green</option>
                              <option value="yellow">Yellow</option>
                              <option value="orange">Orange</option>
                              <option value="pink">Pink</option>
                              <option value="cyan">Cyan</option>
                              <option value="magenta">Magenta</option>
                              <option value="purple">Purple</option>
                              <option value="gray">Gray</option>
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                              Choose the color for your title text
                            </p>
                          </div>

                          {/* Title Preview */}
                          <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-600/30">
                            <h5 className="text-xs font-medium text-gray-300 mb-3 flex items-center space-x-2">
                              <span>👀</span>
                              <span>Title Preview</span>
                            </h5>
                            <div className="flex items-center justify-center">
                              {getTitlePreview()}
                            </div>
                          </div>

                          {/* Title Font Size */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-3">Title Font Size: {titleFontSize}px</label>
                            <input
                              type="range"
                              min="24"
                              max="96"
                              step="4"
                              value={titleFontSize}
                              onChange={(e) => setTitleFontSize(parseInt(e.target.value))}
                              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-green"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-2">
                              <span>Small (24px)</span>
                              <span>Medium (48px)</span>
                              <span>Large (96px)</span>
                            </div>
                          </div>

                          {/* Title Position */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Title Position</label>
                            <select
                              value={titlePosition}
                              onChange={(e) => setTitlePosition(e.target.value)}
                              className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-green-400 focus:ring-1 focus:ring-green-400 transition-colors"
                            >
                              <option value="top">Top of Video</option>
                              <option value="bottom">Bottom of Video</option>
                              <option value="center">Center of Video</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Source Channel Settings */}
                    <div className="border-t border-gray-600 pt-6">
                      <h4 className="text-sm font-semibold text-white mb-4 flex items-center space-x-2">
                        <span>📺</span>
                        <span>Source Channel Display (Optional)</span>
                      </h4>

                      {/* Enable Source Channel Toggle */}
                      <div className="mb-4">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enableSourceChannel}
                            onChange={(e) => setEnableSourceChannel(e.target.checked)}
                            className="w-4 h-4 text-yellow-600 bg-gray-700 border-gray-600 rounded focus:ring-yellow-500 focus:ring-2"
                          />
                          <span className="text-sm font-medium text-gray-300">Display source channel</span>
                        </label>
                        <p className="text-xs text-gray-400 mt-1">
                          Add "source : [channel name]" text to your videos (Comic Sans font, medium size)
                        </p>
                      </div>

                      {/* Session Channel List */}
                      {enableSourceChannel && sessionChannelInfo.length > 0 && (
                        <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                          <h5 className="text-sm font-medium text-yellow-300 mb-2">Available Sessions & Channels:</h5>
                          <div className="space-y-1 text-xs text-gray-300">
                            {sessionChannelInfo.map((session, index) => (
                              <div key={index} className="flex items-center space-x-2">
                                <span className="text-yellow-400 font-medium">•</span>
                                <span>Session {session.sessionNumber}: {session.channelName}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Source Channel Settings */}
                      {enableSourceChannel && (
                        <div className="pl-4 border-l-2 border-gray-600">
                          {/* Source Position Selection */}
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">Position</label>
                            <select
                              value={sourcePosition}
                              onChange={(e) => setSourcePosition(e.target.value)}
                              className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-colors"
                            >
                              <option value="top-left">Kiri Atas (Top Left)</option>
                              <option value="top-right">Kanan Atas (Top Right)</option>
                              <option value="bottom-left">Kiri Bawah (Bottom Left)</option>
                              <option value="bottom-right">Kanan Bawah (Bottom Right)</option>
                              <option value="center">Tengah (Center)</option>
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                              Pilih posisi teks channel di video
                            </p>
                          </div>

                          {/* Source Font Selection */}
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">Source Font</label>
                            <select
                              value={sourceFont}
                              onChange={(e) => setSourceFont(e.target.value)}
                              className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-colors"
                            >
                              <option value="arial">Arial (Clean, Professional)</option>
                              <option value="impact">Impact (Bold, Strong)</option>
                              <option value="georgia">Georgia (Elegant, Serif)</option>
                              <option value="times">Times New Roman (Classic, Serif)</option>
                              <option value="comic">Comic Sans (Playful)</option>
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                              Choose the font style for source channel text
                            </p>
                          </div>

                          {/* Source Font Color */}
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">Source Font Color</label>
                            <select
                              value={sourceFontColor}
                              onChange={(e) => setSourceFontColor(e.target.value)}
                              className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-colors"
                            >
                              <option value="white">White</option>
                              <option value="black">Black</option>
                              <option value="red">Red</option>
                              <option value="blue">Blue</option>
                              <option value="green">Green</option>
                              <option value="yellow">Yellow</option>
                              <option value="orange">Orange</option>
                              <option value="pink">Pink</option>
                              <option value="cyan">Cyan</option>
                              <option value="magenta">Magenta</option>
                              <option value="purple">Purple</option>
                              <option value="gray">Gray</option>
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                              Choose the color for source channel text
                            </p>
                          </div>

                          {/* Source Font Size */}
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-3">Source Font Size: {sourceFontSize}px</label>
                            <input
                              type="range"
                              min="16"
                              max="48"
                              step="2"
                              value={sourceFontSize}
                              onChange={(e) => setSourceFontSize(parseInt(e.target.value))}
                              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-yellow"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-2">
                              <span>Small (16px)</span>
                              <span>Medium (32px)</span>
                              <span>Large (48px)</span>
                            </div>
                          </div>

                          {/* Source Preview */}
                          <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-600/30">
                            <h5 className="text-xs font-medium text-gray-300 mb-3 flex items-center space-x-2">
                              <span>👀</span>
                              <span>Source Preview</span>
                            </h5>
                            <div className="flex items-center justify-center">
                              <div className="px-4 py-2 bg-white/5 rounded-lg backdrop-blur-sm border border-white/10">
                                <span
                                  className="block text-lg font-sans"
                                  style={{
                                    fontFamily: sourceFont === 'comic' ? 'Comic Sans MS, cursive' :
                                               sourceFont === 'arial' ? 'Arial, sans-serif' :
                                               sourceFont === 'impact' ? 'Impact, sans-serif' :
                                               sourceFont === 'georgia' ? 'Georgia, serif' :
                                               'Times New Roman, serif',
                                    fontSize: `${Math.min(sourceFontSize, 40)}px`,
                                    color: sourceFontColor,
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
                                  }}
                                >
                                  source : {getCurrentChannelName()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Subtitle Translation Settings */}
                    <div className="border-t border-gray-600 pt-6">
                      <h4 className="text-sm font-semibold text-white mb-4 flex items-center space-x-2">
                        <span>🌐</span>
                        <span>Subtitle Translation (Optional)</span>
                      </h4>

                      {/* Enable Translation Toggle */}
                      <div className="mb-4">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enableTranslation}
                            onChange={(e) => setEnableTranslation(e.target.checked)}
                            className="w-4 h-4 text-teal-600 bg-gray-700 border-gray-600 rounded focus:ring-teal-500 focus:ring-2"
                          />
                          <span className="text-sm font-medium text-gray-300">Enable subtitle translation</span>
                        </label>
                        <p className="text-xs text-gray-400 mt-1">
                          Translate subtitles to another language using AI (detects source language automatically)
                        </p>
                      </div>

                      {/* Translation Target Language */}
                      {enableTranslation && (
                        <div className="pl-4 border-l-2 border-gray-600">
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">Target Language</label>
                            <select
                              value={targetLanguage}
                              onChange={(e) => setTargetLanguage(e.target.value)}
                              className="w-full bg-gray-700/50 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-colors"
                            >
                              <option value="indonesia">🇮🇩 Indonesian (Bahasa Indonesia)</option>
                              <option value="sunda">🇮🇩 Sundanese (Bahasa Sunda)</option>
                              <option value="inggris">🇺🇸 English</option>
                              <option value="jepang">🇯🇵 Japanese (日本語)</option>
                              <option value="korea">🇰🇷 Korean (한국어)</option>
                              <option value="china">🇨🇳 Chinese (中文)</option>
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                              Choose the language to translate subtitles to. AI will detect the original language automatically.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isProcessing || (videoSource === 'upload' && files.length === 0) || (videoSource === 'clips' && selectedClips.length === 0)}
                      className={`w-full flex items-center justify-center space-x-2 px-6 py-4 rounded-lg font-semibold text-white transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                        isProcessing || (videoSource === 'upload' && files.length === 0) || (videoSource === 'clips' && selectedClips.length === 0)
                          ? 'bg-gray-600 cursor-not-allowed'
                          : videoSource === 'clips'
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-xl'
                            : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-xl'
                      }`}
                    >
                      {isProcessing ? (
                        <>
                          <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <span>🎬</span>
                          <span>
                            {videoSource === 'clips' && selectedClips.length > 1 ? `Process ${selectedClips.length} Clips` :
                             videoSource === 'clips' && selectedClips.length === 1 ? 'Caption Selected Clip' :
                             files.length > 1 ? `Process ${files.length} Videos` : 'Generate Auto Captions'}
                          </span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Info Card */}
                <div className="bg-gradient-to-br from-blue-900/20 to-cyan-900/20 rounded-xl p-6 border border-blue-500/30">
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center space-x-2">
                    <span className="text-blue-400">ℹ️</span>
                    <span>How it works</span>
                  </h4>
                  <ul className="text-xs text-gray-300 space-y-2">
                    <li>• Upload video files (supports multiple files)</li>
                    <li>• AI extracts audio and generates transcript</li>
                    <li>• Captions are burned directly into your videos</li>
                    <li>• Download your properly captioned videos</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Processing Status */}
        {isProcessing && (
          <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col">
            <div className="flex-shrink-0 p-6 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-b border-cyan-500/20">
              <div className="flex items-center justify-center space-x-4">
                <div className="text-2xl">🔄</div>
                <h2 className="text-2xl font-bold text-white">
                  Generating Auto Captions...
                </h2>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-6">
              <div className="relative mb-8">
                <div className="w-24 h-24 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl">🚀</span>
                </div>
              </div>

              <div className="text-center space-y-4 mb-8">
                <h3 className="text-xl font-semibold text-cyan-300">Processing Video</h3>
                <p className="text-gray-400 text-sm">{progress || 'Initializing...'}</p>

                {/* Progress Steps */}
                <div className="space-y-2 text-sm text-gray-400">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                    <span>Extracting audio from video...</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                    <span>AI transcription processing...</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                    <span>Generating subtitle file...</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                    <span>Burning captions to video...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
      {resultVideos.length > 0 && (
        <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 rounded-2xl p-8 border border-green-500/30">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-xl font-bold text-green-400 mb-2 flex items-center space-x-2">
                <span>✅</span>
                <span>{resultVideos.length > 1 ? `${resultVideos.length} Captioned Videos Generated Successfully!` : 'Captioned Video Generated Successfully!'}</span>
              </h3>
              <div className="text-sm text-gray-400">
                <p>Your videos have been processed with AI-generated captions.</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={async () => {
                  if (window.confirm('Apakah Anda yakin ingin menghapus semua hasil caption? Tindakan ini tidak dapat dibatalkan.')) {
                    try {
                      // Delete actual files from disk first
                      await window.electronAPI.deleteAllAutocaptionFiles();

                      // Clear the UI display
                      setResultVideos([]);

                      // Clear localStorage history
                      localStorage.removeItem('autocaptionHistory');

                      alert('Semua hasil caption telah berhasil dihapus.');
                    } catch (error) {
                      console.error('Error deleting caption files:', error);
                      alert('Gagal menghapus beberapa file. Silakan coba lagi.');
                    }
                  }
                }}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all transform hover:scale-105 shadow-xl flex items-center space-x-2"
              >
                <span>🗑️</span>
                <span>Hapus Semua</span>
              </button>
            </div>
          </div>

          {/* Videos Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {resultVideos.map((video, idx) => (
              <div key={idx} className={`rounded-lg overflow-hidden ${video.error ? 'bg-red-950 border border-red-500/30' : 'bg-gray-900'}`}>
                {video.error ? (
                  <div className="h-48 bg-red-900/20 flex flex-col items-center justify-center p-4">
                    <span className="text-4xl mb-2">❌</span>
                    <p className="text-red-400 text-sm text-center">Processing failed</p>
                    <p className="text-red-500 text-xs text-center mt-2">{video.error}</p>
                  </div>
                ) : (
                  <div className="h-48 bg-gray-800 flex items-center justify-center relative overflow-hidden">
                    <video
                      className="w-full h-full object-contain"
                      src={video.url}
                      muted
                      preload="metadata"
                      style={{ maxWidth: '100%', maxHeight: '100%' }}
                    />
                  </div>
                )}
                <div className="p-4">
                  <h4 className={`${video.error ? 'text-red-300' : 'text-white'} font-medium mb-2 truncate`}>
                    {video.filename}
                  </h4>
                  {video.error ? (
                    <div className="w-full bg-red-600/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm text-center">
                      Failed to process
                    </div>
                  ) : (
                    <div className="flex justify-center space-x-2">
                      <button
                        className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-all transform hover:scale-105 shadow-xl flex items-center justify-center space-x-1"
                        onClick={() => window.open(video.url, '_blank')}
                      >
                        <span>📺</span>
                        <span>Play</span>
                      </button>
                      <button
                        className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-all transform hover:scale-105 shadow-xl flex items-center justify-center"
                        onClick={async () => {
                          if (window.confirm('Apakah Anda yakin ingin menghapus file caption ini? Tindakan ini tidak dapat dibatalkan.')) {
                            try {
                              // Remove from local storage if it's saved there
                              const autocaptionHistory = JSON.parse(localStorage.getItem('autocaptionHistory') || '[]');
                              const updatedHistory = autocaptionHistory.filter(item =>
                                item.outputPath !== video.outputPath
                              );
                              localStorage.setItem('autocaptionHistory', JSON.stringify(updatedHistory));

                              // Delete file from disk
                              const result = await window.electronAPI.deleteAutocaptionFile(video.outputPath);

                              // Remove from UI display
                              setResultVideos(prev => prev.filter(v => v.outputPath !== video.outputPath));

                              if (result.success) {
                                alert(`File caption berhasil dihapus. Dihapus ${result.deletedFiles.length} file.`);
                              } else {
                                alert('File berhasil dihapus dari tampilan, namun beberapa file terkait mungkin tidak terhapus.');
                              }
                            } catch (error) {
                              console.error('Error deleting file:', error);
                              alert('Gagal menghapus file. Silakan coba lagi.');
                            }
                          }
                        }}
                      >
                        <span>🗑️</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      </div>

      {/* Clip Selector Modal */}
      {showClipSelector && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowClipSelector(false)}
          ></div>

          {/* Modal Content */}
          <div className="relative bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl shadow-2xl border border-purple-500/20 max-w-6xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 p-6 border-b border-purple-500/20">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                  <span className="text-purple-400">📋</span>
                  <span>Pilih Clips untuk Caption</span>
                </h3>
                <button
                  onClick={() => setShowClipSelector(false)}
                  className="w-8 h-8 rounded-lg bg-red-600/80 hover:bg-red-500 flex items-center justify-center text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <p className="text-gray-300 text-sm mt-2">
                Select clips from your cutting history to add AI-generated captions
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {clipperSessions.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-6xl mb-4">🎬</div>
                  <p className="text-lg mb-2">No clipper sessions found</p>
                  <p className="text-sm">Create some clips first using the Clipper tool</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {clipperSessions.map(session => (
                    <div key={session.id} className="bg-gray-900/50 rounded-xl p-4 border border-gray-600/30">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                            <span className="text-sm font-bold text-white">🎬</span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-purple-300">{session.title || 'Unnamed Session'}</h4>
                            <p className="text-xs text-gray-400">
                              Created: {new Date(session.savedAt).toLocaleDateString()} •
                              {session.clips ? session.clips.length : 0} clips •
                              Source: {session.videoInfo?.title?.slice(0, 50) || 'Unknown'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Clips in this session */}
                      <div className="space-y-3">
                        {session.clips && session.clips.length > 0 ? (
                          session.clips.map(clip => {
                            const isSelected = selectedClips.some(sc => sc.id === clip.id);
                            return (
                              <div
                                key={clip.id}
                                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-purple-600/20 border-purple-400'
                                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                }`}
                                onClick={() => handleClipSelection(clip, !isSelected)}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                                      isSelected
                                        ? 'bg-purple-400 border-purple-400'
                                        : 'border-gray-500 hover:border-gray-400'
                                    }`}>
                                      {isSelected && (
                                        <span className="text-xs font-bold text-white">✓</span>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-3">
                                      <div className="w-10 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                                        <span className="text-sm font-bold text-white">✂️</span>
                                      </div>
                                      {/* Preview Button */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewClip(clip);
                                          setShowVideoPreview(true);
                                        }}
                                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors flex items-center space-x-1"
                                        title="Preview clip"
                                      >
                                        <span>👀</span>
                                        <span>Preview</span>
                                      </button>
                                      <div className="flex-1">
                                        <p className="font-medium text-white">{clip.name || `Clip ${clip.id}`}</p>
                                        <p className="text-xs text-gray-400">
                                          {Math.round((clip.end - clip.start) * 10) / 10}s •
                                          {clip.caption ? ` "${clip.caption.slice(0, 50)}${clip.caption.length > 50 ? '...' : ''}"` : ' No caption'}
                                          {clip.outputPath ? (
                                            (() => {
                                              // Check both original path and normalized path for cross-platform compatibility
                                              const status = videoStatuses[clip.outputPath] || videoStatuses[clip.outputPath.replace(/\\/g, '/')];
                                              return status?.is_autocaptioned ? (
                                                <span className="text-orange-400 font-medium"> • Caption Done</span>
                                              ) : (
                                                <span className="text-green-400 font-medium"> • ✓ Ready</span>
                                              );
                                            })()
                                          ) : (
                                            ' • Pending'
                                          )}
                                        </p>
                                        <StatusIndicators videoPath={clip.outputPath} />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-xs text-gray-400 font-mono">
                                    {Math.floor(clip.start / 60)}:{(clip.start % 60).toString().padStart(2, '0')} -
                                    {Math.floor(clip.end / 60)}:{(clip.end % 60).toString().padStart(2, '0')}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-gray-400 text-sm text-center py-4">No clips in this session</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-750/50 p-4 border-t border-gray-600/20 flex justify-between items-center">
              <div className="text-sm text-gray-400">
                {selectedClips.length} clips selected
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowClipSelector(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowClipSelector(false)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all transform hover:scale-105 ${
                    selectedClips.length > 0
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  disabled={selectedClips.length === 0}
                >
                  Done ({selectedClips.length} selected)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Preview Modal */}
      {showVideoPreview && previewClip && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={() => {
              setShowVideoPreview(false);
              setPreviewClip(null);
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
                    setPreviewClip(null);
                  }}
                  className="w-8 h-8 rounded-lg bg-red-600/80 hover:bg-red-500 flex items-center justify-center text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <p className="text-gray-300 text-sm mt-2">
                {previewClip.name || `Clip ${previewClip.id}`}
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="flex flex-col items-center space-y-4">
                {/* Video Player */}
                <div className="w-full max-w-2xl bg-gray-900 rounded-lg overflow-hidden">
                  <video
                    className="w-full h-auto max-h-[60vh] object-contain"
                    src={previewClip.outputPath ? `file:///${previewClip.outputPath.replace(/\\/g, '/')}` : ''}
                    controls
                    autoPlay
                    muted
                    onError={(e) => {
                      console.error('Video preview failed to load:', e);
                    }}
                  />
                </div>

                {/* Clip Info */}
                <div className="w-full max-w-2xl bg-gray-800/50 rounded-lg p-4 border border-gray-600/30">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Duration:</span>
                      <span className="text-white ml-2">
                        {Math.round((previewClip.end - previewClip.start) * 10) / 10}s
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Time Range:</span>
                      <span className="text-white ml-2 font-mono">
                        {Math.floor(previewClip.start / 60)}:{(previewClip.start % 60).toString().padStart(2, '0')} -
                        {Math.floor(previewClip.end / 60)}:{(previewClip.end % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                  {previewClip.caption && (
                    <div className="mt-4">
                      <span className="text-gray-400">Caption:</span>
                      <p className="text-white mt-1 italic">"{previewClip.caption}"</p>
                    </div>
                  )}
                  <StatusIndicators videoPath={previewClip.outputPath} />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-750/50 p-4 border-t border-gray-600/20 flex justify-end">
              <button
                onClick={() => {
                  setShowVideoPreview(false);
                  setPreviewClip(null);
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

export default AutoCaption;
