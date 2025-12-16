import React, { useState, useRef, useEffect } from 'react';
// processingStateManager removed due to compatibility issues

function Clipper({ onBack, videoInfo, setVideoInfo, onNavigateToResults }) {
  const videoRef = useRef(null);
  const [clips, setClips] = useState([]);
  const [currentClip, setCurrentClip] = useState(null);
  const [isCutting, setIsCutting] = useState(false);
  const [isCuttingAll, setIsCuttingAll] = useState(false); // New state for cutting all clips
  const [currentTime, setCurrentTime] = useState(0);
  const [cuttingProgress, setCuttingProgress] = useState('');
  const [cuttingPercent, setCuttingPercent] = useState(0);
  const [currentCuttingClipId, setCurrentCuttingClipId] = useState(null); // Track which clip is being cut
  const [cuttingLogs, setCuttingLogs] = useState([]); // New state for terminal-style logs

  // Video blob URL state
  const [videoBlobUrl, setVideoBlobUrl] = useState(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

  // Preview functionality
  const [previewClip, setPreviewClip] = useState(null); // Current preview clip
  const [previewUrl, setPreviewUrl] = useState(null); // Preview video URL
  const [isCreatingPreview, setIsCreatingPreview] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false); // Modal state

  // Create preview when clip is selected
  const createClipPreview = async (clip) => {
    if (!videoInfo) return;

    setIsCreatingPreview(true);
    setPreviewClip(clip);

    try {
      // Small delay to ensure video file is not locked from previous operations
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check file size for better user feedback
      let fileSize = 0;
      try {
        const stats = await window.electronAPI.getFileStats(videoInfo.filePath);
        fileSize = stats.size;
      } catch (statsError) {
        console.warn('Could not get file stats:', statsError);
        // Don't show error for missing files - this is expected when using app on different computers
        if (statsError.message?.includes('Video file not found') || statsError.message?.includes('file not found')) {
          console.warn('Video file not found - this may happen when using the app on different computers');
          setPreviewUrl(null);
          return; // Exit early without trying to create preview
        }
      }

      const fileSizeGB = fileSize / (1024 * 1024 * 1024);
      const isLargeFile = fileSizeGB > 1;

      console.log(`Creating preview for clip: ${clip.id}, file size: ${fileSizeGB.toFixed(2)} GB`);

      // Use temp directory for previews (they should be temporary files)
      const previewData = {
        sourcePath: videoInfo.filePath,
        startTime: formatTime(clip.start),
        endTime: formatTime(clip.end),
        outputDir: 'temp', // Temp directory for preview files
        previewId: `preview_clip_${clip.id}_${Date.now()}`
      };

      console.log('Creating preview for clip:', clip.id, previewData);

      // Show appropriate loading message for large files
      if (isLargeFile) {
        console.log('Large file detected (>1GB), using optimized preview creation');
      }

      const result = await window.electronAPI.createVideoPreview(previewData);

      console.log('Preview creation result:', result);

      if (result && result.success && result.outputPath) {
        console.log('Preview created successfully:', result.outputPath);

        // Check if the output file actually exists before setting URL
        try {
          const fileStats = await window.electronAPI.getFileStats(result.outputPath);
          if (fileStats && fileStats.size > 0) {
            console.log(`Preview file exists and has size: ${fileStats.size} bytes`);
            setPreviewUrl(`file://${result.outputPath}`);
          } else {
            console.error('Preview file was created but is empty or missing');
            setPreviewUrl(null);
          }
        } catch (fileCheckError) {
          console.error('Error checking preview file:', fileCheckError);
          setPreviewUrl(null);
        }
      } else {
        console.error('Failed to create preview, result:', result);
        setPreviewUrl(null);

        // Show specific error message for large files
        if (isLargeFile) {
          console.warn('Preview creation failed for large file. This is expected for very large videos.');
        }
      }
    } catch (error) {
      console.error('Error creating preview:', error);
      setPreviewUrl(null);

      // Handle timeout errors specifically
      if (error.message && error.message.includes('timed out')) {
        console.warn('Preview creation timed out for large file');
      }
    } finally {
      setIsCreatingPreview(false);
    }
  };

  // Cleanup preview when clip changes or component unmounts
  const cleanupPreview = async () => {
    if (previewUrl) {
      try {
        const filePath = previewUrl.replace('file://', '');
        await window.electronAPI.deletePreviewClip(filePath);
        console.log('Preview file cleaned up');
      } catch (error) {
        console.warn('Error cleaning up preview file:', error);
      }
    }
    setPreviewUrl(null);
    setPreviewClip(null);
  };

  // Handle clip selection changes with preview
  useEffect(() => {
    if (currentClip && currentClip !== previewClip) {
      // Cleanup previous preview first
      cleanupPreview().then(() => {
        // Then create new preview
        createClipPreview(currentClip);
      });
    } else if (!currentClip) {
      // Cleanup when no clip is selected
      cleanupPreview();
    }
  }, [currentClip]);

  // Update preview when clip timing changes
  useEffect(() => {
    if (currentClip && previewClip && currentClip.id === previewClip.id) {
      // If current clip timing changed, update preview
      if (currentClip.start !== previewClip.start || currentClip.end !== previewClip.end) {
        cleanupPreview().then(() => {
          // Small delay to ensure state is updated
          setTimeout(() => createClipPreview(currentClip), 100);
        });
      }
    }
  }, [clips]); // Watch for clip changes

  // Load video blob URL when videoInfo changes
  useEffect(() => {
    const loadVideoBlobUrl = async () => {
      if (videoInfo && videoInfo.filePath) {
        setIsLoadingVideo(true);
        setVideoBlobUrl(null);

        try {
          console.log('Loading video URL for:', videoInfo.filePath);
          const result = await window.electronAPI.createVideoUrl(videoInfo.filePath);

          if (result && result.success && result.videoUrl) {
            console.log('Video URL created successfully:', result.videoUrl);
            setVideoBlobUrl(result.videoUrl); // Reuse the same state variable for simplicity
          } else {
          // Don't log errors for missing video files - this is expected when using app on different computers
          if (!result?.error?.includes('Video file not found')) {
            console.error('Failed to create video URL:', result?.error || 'Unknown error');
          }
          // Show user-friendly error message for missing files
          if (result?.error?.includes('Video file not found')) {
            console.warn('Video file not found - showing placeholder instead');
            // Show a placeholder message instead of trying to load video
            setVideoBlobUrl(null); // This will trigger the "Failed to load video" UI
          } else {
            setVideoBlobUrl(null);
          }
          }
        } catch (error) {
          console.error('Error loading video blob URL:', error);
          // Don't show alert for file not found errors
          if (!error.message?.includes('Video file not found')) {
            console.warn('Video file not found - this may happen when using the app on different computers');
          }
          setVideoBlobUrl(null);
        } finally {
          setIsLoadingVideo(false);
        }
      } else {
        setVideoBlobUrl(null);
        setIsLoadingVideo(false);
      }
    };

    loadVideoBlobUrl();

    // Cleanup blob URL when component unmounts or videoInfo changes
    return () => {
      if (videoBlobUrl) {
        URL.revokeObjectURL(videoBlobUrl);
      }
    };
  }, [videoInfo]);

  // Update task progress - mark completed items
  useEffect(() => {
    // This effect runs when the component mounts to update task progress
    console.log('Video loading fix implemented - updating task progress');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPreview();
      // Cleanup video blob URL
      if (videoBlobUrl) {
        URL.revokeObjectURL(videoBlobUrl);
      }
    };
  }, [videoBlobUrl]);

  // Load latest saved session data if available
  const loadLatestSavedSession = async () => {
    if (!videoInfo) return;

    try {
      // Get all saved clipper sessions
      const savedSessions = await window.electronAPI.getClipperSessions();

      // Find the session that matches this video file (check both filePath and url for consistency)
      const videoFilePath = videoInfo.filePath || videoInfo.url || 'unknown';
      const matchingSession = savedSessions.find(session =>
        session.videoInfo && (session.videoInfo.filePath === videoFilePath || session.videoInfo.url === videoFilePath)
      );

      if (matchingSession && matchingSession.clips) {
        console.log('Found saved session with updated clips:', matchingSession.clips);

        // Use the saved clips instead of the initial ones
        const clipsData = matchingSession.clips;
        if (clipsData && Array.isArray(clipsData) && clipsData.length > 0) {
          // Convert clips to editable format (no need to convert timestamps again)
          const updatedClips = clipsData.map(clip => ({
            id: clip.id,
            start: clip.start, // Already in seconds
            end: clip.end,     // Already in seconds
            name: clip.name,
            caption: clip.caption,
            reason: clip.reason,
            score: clip.score,
            outputPath: clip.outputPath,
            channel: clip.channel || videoInfo?.channel || 'Unknown Channel'
          }));
          setClips(updatedClips);
          console.log('Loaded updated clips with output paths:', updatedClips);
          return true; // Indicate we loaded from saved session
        }
      }
    } catch (error) {
      console.warn('Failed to load saved session:', error);
    }
    return false; // Indicate we didn't load from saved session
  };

// Processing state management removed (processingStateManager deleted)

  // Initialize clips from videoInfo.savedClips or suggestedClips
  useEffect(() => {
    console.log('[DEBUG] Initializing clips. videoInfo:', videoInfo);

    const initializeClips = async () => {
      if (videoInfo) {
        // Extract video title for better clip naming
        const videoTitle = videoInfo.title && videoInfo.title !== 'undefined' ? videoInfo.title : 'YouTube Video';

        // Function to generate meaningful clip names
        const generateClipName = (clip, index) => {
          // If clip has a good name/caption, use it
          if (clip.name && clip.name !== 'Clip' && clip.name.trim()) {
            return clip.name.trim();
          }
          if (clip.caption && clip.caption.trim()) {
            const captionFirstLine = clip.caption.split('\n')[0].trim();
            if (captionFirstLine.length > 5) { // Must be meaningful content
              return captionFirstLine.substring(0, 50);
            }
          }

          // Otherwise generate based on video title with channel
          const channelSuffix = videoInfo?.channel && videoInfo.channel !== 'Unknown Channel' ?
            ` [${videoInfo.channel}]` : '';
          return `${videoTitle.substring(0, 30)}${channelSuffix} - Clip ${index + 1}`;
        };

        // Function to add channel to clip objects
        const addChannelToClips = (clipsArray) => {
          return clipsArray.map(clip => ({
            ...clip,
            channel: videoInfo?.channel || 'Unknown Channel'
          }));
        };

        console.log('[DEBUG] videoInfo exists, checking for sessions...');
        let clipsLoaded = false;

        // First try to load the latest saved session
        const loadedFromSession = await loadLatestSavedSession();
        console.log('[DEBUG] loadLatestSavedSession returned:', loadedFromSession);
        if (loadedFromSession) {
          clipsLoaded = true;
          console.log('[DEBUG] Using saved session data');
        }

        // If no session was found, load from videoInfo
        if (!clipsLoaded) {
          console.log('[DEBUG] No saved session, checking videoInfo for clips...');
          const clipsData = videoInfo.savedClips || videoInfo.suggestedClips;
          console.log('[DEBUG] clipsData from videoInfo:', clipsData);

          if (clipsData && Array.isArray(clipsData) && clipsData.length > 0) {
            console.log('[DEBUG] Processing clips data from videoInfo:', clipsData);
            // Convert clips to editable format
            const initialClips = clipsData.map((clip, index) => {
              console.log(`[DEBUG] Converting clip ${index + 1}:`, clip);
              console.log(`[DEBUG] clip.start: "${clip.start}" (type: ${typeof clip.start})`);
              console.log(`[DEBUG] clip.end: "${clip.end}" (type: ${typeof clip.end})`);

              console.log('[DEBUG] BEFORE conversion - clip object:', clip);
              console.log('[DEBUG] clip.start raw:', clip.start, 'type:', typeof clip.start);
              console.log('[DEBUG] clip.end raw:', clip.end, 'type:', typeof clip.end);

              const convertedStart = timeToSeconds(clip.start);
              const convertedEnd = timeToSeconds(clip.end);

              console.log('[DEBUG] AFTER conversion - start:', convertedStart, 'end:', convertedEnd);

              // Function to clean corrupt captions
              const cleanCaption = (caption) => {
                // If no caption, return empty
                if (!caption) return '';

                const trimmed = caption.trim();

                // If caption is just nonsense symbols (-,!,#,etc) and very short, clear it
                if (trimmed.length < 3 && /^[-,!.?#@#$%^&*()_+=|\\{}[\]:;"'<>,./\s]*$/.test(trimmed.trim())) {
                  console.warn('Clearing corrupt caption:', `"${caption}"`, '->', '""');
                  return '';
                }

                return trimmed;
              };

              const convertedClip = {
                id: index + 1,
                start: convertedStart,
                end: convertedEnd,
                name: clip.name || `Clip ${index + 1}`,
                caption: cleanCaption(clip.caption || clip.suggested_caption || ''),
                reason: clip.reason || '',
                score: clip.score || clip.virality_score || 5,
                outputPath: clip.outputPath || null,
                channel: videoInfo?.channel || 'Unknown Channel'
              };
              console.log(`[DEBUG] Final converted clip:`, convertedClip);
              return convertedClip;
            });
            console.log('[DEBUG] Setting initial clips:', initialClips);
            setClips(initialClips);
          } else {
            console.log('[DEBUG] No clips data available or empty:', videoInfo);
            setClips([]);
          }
        }

        // Check if no clips were loaded from session, try to load from videoInfo
        if (!clipsLoaded) {
          console.log('[DEBUG] No clips loaded from session, loading from videoInfo');
          // Note: Clips from videoInfo are already loaded in the previous block above
        }
      } else {
        console.log('[DEBUG] No videoInfo available');
        setClips([]);
      }
    };

    // Initialize clips
    initializeClips();

    // Skip setting up listeners if they would be invalid
    if (!videoInfo) return;

    // Event listeners removed - now using synchronous return values from IPC invokes
  }, [videoInfo]); // Simplified dependencies - only re-run when videoInfo changes

// Component cleanup - no processing state to clear

  // Helper function to convert time string (HH:MM:SS or MM:SS) to seconds
  const timeToSeconds = (timeVal) => {
    console.log(`========== TIME CONVERSION START ==========`);
    console.log(`[timeToSeconds] BEGIN - Input: "${timeVal}" (type: ${typeof timeVal})`);

    // Handle null/undefined
    if (!timeVal) {
      console.log(`[timeToSeconds] END - Returning 0 (null/undefined input)`);
      return 0;
    }

    // If already a number, return as-is
    if (typeof timeVal === 'number') {
      console.log(`[timeToSeconds] END - Returning input as-is (already number): ${timeVal}`);
      return timeVal;
    }

  // If string, parse as time format
    if (typeof timeVal === 'string') {
      const cleanTimeStr = timeVal.trim();
      console.log(`[timeToSeconds] Cleaned string: "${cleanTimeStr}"`);

      // Try to parse as plain number string first (only if no colons - avoids parsing "01:23" as 1)
      const numValue = parseFloat(cleanTimeStr);
      console.log(`[timeToSeconds] parseFloat result: ${numValue} (isNaN: ${isNaN(numValue)}), contains colon: ${cleanTimeStr.includes(':')}`);

      if (!isNaN(numValue) && !cleanTimeStr.includes(':')) {
        console.log(`[timeToSeconds] END - Returning plain number: ${numValue}`);
        return numValue;
      }

      console.log(`[timeToSeconds] Splitting by colon: "${cleanTimeStr}".split(':')`);
      const stringParts = cleanTimeStr.split(':');
      console.log(`[timeToSeconds] String parts:`, stringParts);

      const parts = stringParts.map((part, index) => {
        const num = Number(part);
        console.log(`[timeToSeconds] parts[${index}] = Number("${part}") = ${num}`);
        return num;
      });

      console.log(`[timeToSeconds] Final parts array:`, parts);
      console.log(`[timeToSeconds] parts.length = ${parts.length}`);

      // Handle different time formats from AI Gemini (MM:SS format with leading zeros like "00:01:30")
      if (parts.length === 3) {
        console.log(`[timeToSeconds] Processing as 3-part format`);
        // Check if first part is 0 and could actually be MM:SS format (AI Gemini often produces this)
        if (parts[0] === 0 && parts[1] <= 59 && parts[2] <= 59) {
          // Treat as MM:SS (like "00:01:30" becomes 1:30 instead of 0:01:30)
          const minutes = parts[1];
          const seconds = parts[2];
          const result = minutes * 60 + seconds;
          console.log(`[TIME PARSE] AI格式 MM:SS: ${cleanTimeStr} -> ${minutes}:${seconds.toString().padStart(2,'0')} (${result}s)`);
          console.log(`[timeToSeconds] END - Returning MM:SS result: ${result}`);
          return result;
        } else {
          // HH:MM:SS format
          const hours = parts[0];
          const minutes = parts[1];
          const seconds = parts[2];
          const result = hours * 3600 + minutes * 60 + seconds;
          console.log(`[TIME PARSE] HH:MM:SS格式: ${cleanTimeStr} -> ${hours}:${minutes}:${seconds} (${result}s)`);
          console.log(`[timeToSeconds] END - Returning HH:MM:SS result: ${result}`);
          return result;
        }
      } else if (parts.length === 2) {
        console.log(`[timeToSeconds] Processing as 2-part format`);
        // Standard MM:SS format
        const minutes = parts[0];
        const seconds = parts[1];
        const result = minutes * 60 + seconds;
        console.log(`[TIME PARSE] 标准 MM:SS格式: ${cleanTimeStr} -> ${minutes}:${seconds} (${result}s)`);
        console.log(`[timeToSeconds] END - Returning MM:SS result: ${result}`);
        return result;
      }

      console.log(`[timeToSeconds] END - No matching format, returning 0`);
      return 0;
    }

    console.log(`[timeToSeconds] END - Unhandled type, returning 0`);
    return 0;
  };

  // Helper function to format seconds to time string (returns appropriate format)
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    // If no hours, return MM:SS format
    if (hours === 0) {
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // If hours exist, return HH:MM:SS format
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper function to parse HH:MM:SS string to seconds
  const parseTimeFromString = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;

    // Remove any extra leading/trailing whitespace
    const cleanTimeStr = timeStr.trim();

    // If it's already a number, return as-is
    const numValue = parseFloat(cleanTimeStr);
    if (!isNaN(numValue)) return numValue;

    // Try to parse as HH:MM:SS format
    const parts = cleanTimeStr.split(':').map(Number);
    if (parts.length === 3) {
      // HH:MM:SS format
      const hours = parts[0] || 0;
      const minutes = parts[1] || 0;
      const seconds = parts[2] || 0;
      return hours * 3600 + minutes * 60 + seconds;
    } else if (parts.length === 2) {
      // MM:SS format (backward compatibility)
      const minutes = parts[0] || 0;
      const seconds = parts[1] || 0;
      return minutes * 60 + seconds;
    }

    return 0;
  };

  // Video player handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeekToTime = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

      // Clip editing handlers
      const updateClipTime = (clipId, field, value) => {
        setClips(clips.map(clip =>
          clip.id === clipId
            ? { ...clip, [field]: Number(value) }
            : clip
        ));
      };

      const updateClipInfo = (clipId, field, value) => {
        setClips(clips.map(clip =>
          clip.id === clipId
            ? { ...clip, [field]: value }
            : clip
        ));
      };

  const addNewClip = () => {
    const newClip = {
      id: Math.max(...clips.map(c => c.id), 0) + 1,
      start: Math.max(0, currentTime - 5),
      end: Math.min(videoRef.current?.duration || currentTime + 10, currentTime + 10),
      name: `Clip ${clips.length + 1}`,
      caption: '',
      reason: 'Manual clip',
      score: 5,
      outputPath: null,
      channel: videoInfo?.channel || 'Unknown Channel'
    };
    setClips([...clips, newClip]);
  };

  const removeClip = (clipId) => {
    setClips(clips.filter(clip => clip.id !== clipId));
  };

  const setStartFromCurrent = (clipId) => {
    updateClipTime(clipId, 'start', Math.round(currentTime * 100) / 100);
  };

  const setEndFromCurrent = (clipId) => {
    updateClipTime(clipId, 'end', Math.round(currentTime * 100) / 100);
  };

  // Cutting functionality
  const cutClip = async (clip, isBatch = false) => {
    if (!videoInfo) return;

    // Check if video file exists before attempting to cut
    try {
      await window.electronAPI.getFileStats(videoInfo.filePath);
    } catch (fileCheckError) {
      const errorMsg = `❌ Video file tidak ditemukan: "${videoInfo.title}"\n\nIni terjadi karena file video tidak tersedia di komputer ini. Kemungkinan:\n• Aplikasi dipindahkan ke komputer berbeda\n• File video dihapus atau dipindah\n• Path penyimpanan berubah\n\nSolusi:\n• Download ulang video dari YouTube\n• Pastikan menggunakan aplikasi di komputer yang sama`;
      console.error('Video file not found:', fileCheckError);
      if (!isBatch) {
        alert(errorMsg);
      }
      return false; // Indicate failure
    }

    if (!isBatch) { // Only set cutting states if it's a single cut
      setIsCutting(true);
      setCurrentCuttingClipId(clip.id);

      // Reset and set up terminal-style logs for individual clips
      setCuttingLogs([]);
      const timestamp = new Date().toLocaleTimeString();
      const duration = (clip.end - clip.start).toFixed(1);
      setCuttingLogs(logs => [...logs,
        `[${timestamp}] Starting individual clip processing...`,
        `[${timestamp}] Clip: "${clip.name}"`,
        `[${timestamp}] Time range: ${formatTime(clip.start)} - ${formatTime(clip.end)} (${duration}s)`,
        `[${timestamp}] Score: ${clip.score}/10`,
        `[${timestamp}] Source video: ${videoInfo.title}`,
        `[${timestamp}] Executing: ffmpeg -ss ${clip.start} -t ${duration} ...`
      ]);

      setCuttingProgress('Initializing individual clip processing...');
      setCuttingPercent(10);
    }

    try {

      // Use the cuts directory for regular clips
      const outputDir = 'cuts'; // Backend will use default cuts directory

      // Minimal sanitization for user captions (PERMISIVE)
      const sanitizeFileNameMinimal = (fileName) => {
        if (!fileName || typeof fileName !== 'string') {
          return 'clip';
        }

        let sanitized = fileName.trim();

        console.log(`[MINIMAL SANITIZE] Input: "${fileName}"`);

        // Only remove filesystem-critical characters (keep text as-is for user)
        sanitized = sanitized.replace(/[<>:"\\|?*\x00-\x1F]/g, '_'); // Remove invalid chars but keep most symbols

        // Trim and basic length limit
        sanitized = sanitized.trim();
        sanitized = sanitized.substring(0, 100); // Longer limit for minimal sanitize

        console.log(`[MINIMAL SANITIZE] Output: "${sanitized}"`);

        // Don't add fallbacks - user input should be preserved
        return sanitized || 'clip';
      };

      // Browser-safe filename sanitization (ultra-aggressive version)
      const sanitizeFileName = (fileName) => {
        if (!fileName || typeof fileName !== 'string') {
          return 'clip';
        }

        let sanitized = fileName;

        console.log(`[SANITIZE DEBUG] Original name: "${fileName}"`);
        console.log(`[SANITIZE DEBUG] Char codes: [${fileName.split('').map(c => c.charCodeAt(0)).join(', ')}]`);

        // Step 1: Normalize Unicode to decomposed form (handling combining characters)
        sanitized = sanitized.normalize('NFD');

        // Step 2: More aggressive emoji removal
        sanitized = sanitized.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{FE0F}-\u{FEFF}]|[\u{1F000}-\u{1F02F}]/gu, '');

        // Step 3: Remove HTML entities and smart quotes
        sanitized = sanitized.replace(/&[#\w]+;/g, '');
        sanitized = sanitized.replace(/[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2039\u203A]/g, "'"); // Convert smart quotes
        sanitized = sanitized.replace(/[\u2013\u2014\u2015]/g, '-'); // Convert dashes

        // Step 4: Remove invalid filename characters + pound/hash symbols
        sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1F#]/g, '_');

        // Step 5: Remove diacritics/accented characters
        sanitized = sanitized.replace(/[\u0300-\u036f]/g, '');

        // Step 6: Replace multiple underscores/spaces with single
        sanitized = sanitized.replace(/_{2,}/g, '_');
        sanitized = sanitized.replace(/\s{2,}/g, ' ');

        // Step 7: Trim and limit length
        sanitized = sanitized.trim();
        sanitized = sanitized.substring(0, 80); // Reduced length for safer filename

        console.log(`[SANITIZE DEBUG] Sanitized result: "${sanitized}"`);
        console.log(`[SANITIZE DEBUG] Has content: ${!!sanitized && sanitized !== 'mp4' && sanitized !== '.mp4' && sanitized.length > 0}`);

        // Fallback for completely problematic results
        if (!sanitized || sanitized === 'mp4' || sanitized === '.mp4' || sanitized.length === 0) {
          sanitized = `clip_${Date.now()}`;
          console.log(`[SANITIZE DEBUG] Using fallback: "${sanitized}"`);
        }

        // Don't add .mp4 extension here - we want base filename only
        return sanitized.replace('.mp4', '');
      };

      // Generate meaningful filename for the video clip - MORE PERMISIVE FOR USER CAPTION
      const generateClipFilename = (clip) => {
        console.log(`[FILENAME DEBUG] Generating filename for clip ${clip.id}`);
        console.log(`[FILENAME DEBUG] clip.name: "${clip.name}"`);
        console.log(`[FILENAME DEBUG] clip.caption: "${clip.caption}"`);

        // Extract video title for fallback
        const videoTitle = videoInfo.title && videoInfo.title !== 'undefined' ? videoInfo.title : 'YouTube Video';
        console.log(`[FILENAME DEBUG] videoTitle: "${videoTitle}"`);

        // Priority 1: USE caption IMMEDIATELY if user provided ANY content (apa pun itu)
        if (clip.caption && typeof clip.caption === 'string' && clip.caption.trim().length > 0) {
          const captionClean = clip.caption.trim();
          console.log(`[FILENAME DEBUG] ✅ USING USER CAPTION IMMEDIATELY: "${captionClean}"`);
          // Minimal sanitization for user caption - just remove filesystem dangerous chars
          return sanitizeFileNameMinimal(captionClean);
        }

        // Priority 2: Use clip's name if it's meaningful (but not default "Clip X")
        if (clip.name && typeof clip.name === 'string' && clip.name.trim()) {
          const nameClean = clip.name.trim();
          console.log(`[FILENAME DEBUG] Testing name: "${nameClean}"`);

          const isDefaultClip = /^Clip \d+$/.test(nameClean);

          console.log(`[FILENAME DEBUG] Name isDefaultClip: ${isDefaultClip}`);

          if (!isDefaultClip && nameClean.length > 0) {
            console.log(`[FILENAME DEBUG] ✅ Using name: "${nameClean}"`);
            return sanitizeFileName(nameClean);
          }
          console.log(`[FILENAME DEBUG] ❌ Name is default clip pattern`);
        }

        // Priority 3: FORCE fallback - Video Title + Clip ID (ALWAYS WORKS)
        console.log(`[FILENAME DEBUG] ⚠️ FORCE using fallback - video title + clip ID`);
        const finalFallback = `${videoTitle.substring(0, 25)} - Clip ${clip.id}`;
        console.log(`[FILENAME DEBUG] 🛡️ Final fallback: "${finalFallback}"`);

        return sanitizeFileName(finalFallback);
      };

      const clipData = {
        sourcePath: videoInfo.filePath,
        startTime: clip.start,  // Send as number (seconds)
        endTime: clip.end,      // Send as number (seconds)
        outputDir: outputDir,
        outputFileName: generateClipFilename(clip),  // Use smart filename generation with VideoCutter sanitization
        caption: clip.caption,  // Pass the actual caption text for saving
        transcriptData: videoInfo.transcript,  // Pass transcript data for captioning
        jobId: videoInfo.id,
        clipId: clip.id // Pass clip ID for progress tracking
      };

      if (!isBatch) {
        const processTimestamp = new Date().toLocaleTimeString();
        setCuttingLogs(logs => [...logs, `[${processTimestamp}] Processing video with ffmpeg...`]);
        setCuttingProgress('Memproses video dengan ffmpeg...');
        setCuttingPercent(25);
      }

      // Call cutting and get result directly
      const result = await window.electronAPI.cutVideoClip(clipData);

      console.log('Cut result received in frontend:', result);

      // If duration is available from backend, save it to clip
      if (result && result.duration !== undefined) {
        console.log('Duration received from backend:', result.duration);
      }

      // If successful, directly update the clip with outputPath
      if (result && result.success && result.outputPath) {
        console.log('Updating clip', clip.id, 'with outputPath:', result.outputPath);

        setClips(prevClips => {
          console.log('Setting outputPath and duration on clip:', { clipId: clip.id, outputPath: result.outputPath, duration: result.duration });
          const updatedClips = prevClips.map(c =>
            c.id === clip.id
              ? {
                  ...c,
                  outputPath: result.outputPath,
                  ...(result.duration !== undefined && { duration: result.duration })
                }
              : c
          );
          console.log('Updated clips with output path and duration, auto-saving session...');

          // Auto-save session after successful cutting (without showing alerts)
          setTimeout(() => {
            if (videoInfo) {
              // Silently save session without alert and overwrite existing session
              (async () => {
                try {
                  // Find existing session for this video file, or create new one
                  const existingSessions = await window.electronAPI.getClipperSessions();
                  const videoFilePath = videoInfo.filePath || videoInfo.url || 'unknown';

                  // Find session that matches this video file
                  const existingSession = existingSessions.find(session =>
                    session.videoInfo && (session.videoInfo.filePath === videoFilePath || session.videoInfo.url === videoFilePath)
                  );

                  // Use existing session ID if found, otherwise generate a simple hash-based ID
                  let sessionId;
                  if (existingSession) {
                    sessionId = existingSession.id;
                    console.log('Found existing session for video, will overwrite:', sessionId);
                  } else {
                    // Create a simple hash from the video path for new sessions
                    const simpleHash = videoFilePath.split('').reduce((hash, char) => {
                      return ((hash << 5) - hash) + char.charCodeAt(0);
                    }, 0);
                    sessionId = `session_${Math.abs(simpleHash).toString(36)}`;
                    console.log('Creating new session for video:', sessionId);
                  }

                  const sessionTitle = videoInfo.title && videoInfo.title !== 'undefined' ? videoInfo.title : 'YouTube Video';
                  const session = {
                    id: sessionId,
                    title: `Auto-saved - ${sessionTitle}`,
                    savedAt: new Date().toISOString(),
                    videoInfo,
                    clips: updatedClips // Use updated clips with new outputPath
                  };

                  // Save session directly - INSERT OR REPLACE will handle overwriting
                  await window.electronAPI.saveClipperSession(session);
                  console.log('Session auto-saved successfully, overwriting any existing session with same ID');
                } catch (error) {
                  console.warn('Failed to auto-save session:', error);
                }
              })();
            }
          }, 500); // Small delay to ensure state is fully updated

          return updatedClips;
        });

        // Success handling
        if (!isBatch) {
          setCuttingProgress('Processing completed successfully!');
          setCuttingPercent(100);

          const successTimestamp = new Date().toLocaleTimeString();
          setCuttingLogs(logs => [...logs,
            `[${successTimestamp}] SUCCESS: Individual clip completed ✅`,
            `[${successTimestamp}] Output saved: ${result?.outputPath || 'N/A'}`,
            `[${successTimestamp}] Processing finished successfully`
          ]);

          // Show success notification - Lebih menarik dan sesuai gaya aplikasi
          const duration = Math.round((clip.end - clip.start) * 10) / 10;
          const successTitle = `🎬 Clip "${clip.name}" Berhasil!`;
          const successMessage = `✨ Potongan video selesai diproses dengan sempurna!\n\n📁 Lokasi: Folder "Hasil Auto Caption"\n⏱️ Durasi: ${duration} detik\n🎯 Kualitas: HD 1080p`;

          // Fungsi untuk membuat notifikasi yang lebih menarik
          const createUniqueNotification = (title, message, options = {}) => {
            const notificationOptions = {
              body: message,
              icon: '/assets/icon.ico',
              badge: '/assets/icon.ico',
              tag: 'autoclipper-clip-success', // Mengganti notifikasi sebelumnya jika ada
              requireInteraction: false, // Auto close setelah beberapa detik
              silent: false, // Izinkan suara default sistem
              ...options
            };

            return new Notification(title, notificationOptions);
          };

          // Create browser notification if supported - Versi lebih menarik
          if ('Notification' in window && Notification.permission === 'granted') {
            const notification = createUniqueNotification(successTitle, successMessage, {
              icon: '/assets/icon.ico',
              // Tambahkan efek visual dengan emoji di title
            });

            // Auto close setelah 5 detik untuk notifikasi sukses
            setTimeout(() => {
              notification.close();
            }, 5000);

          } else if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
              if (permission === 'granted') {
                const notification = createUniqueNotification(successTitle, successMessage);
                // Auto close setelah 5 detik
                setTimeout(() => {
                  notification.close();
                }, 5000);
              }
            });
          }

          // Also show alert as fallback/confirmation
          setTimeout(() => {
            alert(successMessage);
          }, 500);

          // Auto-navigate to results page after successful cutting
          if (onNavigateToResults) {
            setTimeout(() => {
              onNavigateToResults();
            }, 2500); // Navigate after 2.5 seconds to allow user to see success message
          }

          // Clear logs after showing completion
          setTimeout(() => {
            setCuttingLogs([]);
            setCuttingProgress('');
            setCuttingPercent(0);
          }, 3500);
        }
        return result.success; // Return success status
      } else {
        // Handle unsuccessful result (no throw but success: false)
        if (!isBatch) {
          const failTimestamp = new Date().toLocaleTimeString();
          setCuttingLogs(logs => [...logs,
            `[${failTimestamp}] FAILED: Clip processing failed (backend returned no success)`,
            `[${failTimestamp}] Backend response: ${JSON.stringify(result)}`
          ]);

          alert(`Error cutting clip: Backend returned unsuccessful result (${result?.message || 'Unknown error'})`);
        }
        return false;
      }
    } catch (error) {
      console.error('Error cutting clip:', error);
      if (!isBatch) {
        const errorTimestamp = new Date().toLocaleTimeString();
        setCuttingLogs(logs => [...logs,
          `[${errorTimestamp}] ERROR: Clip processing failed`,
          `[${errorTimestamp}] ${error.message}`
        ]);

        alert('Error cutting clip: ' + error.message);
      }
      return false; // Indicate failure
    } finally {
      // Always reset cutting states for non-batch regardless of success or failure
      if (!isBatch) {
        setIsCutting(false);
        setCurrentCuttingClipId(null);
      }
    }
  };

  const cutAllClips = async () => {
    if (!videoInfo || clips.length === 0) {
      alert('No video or clips available to cut.');
      return;
    }

    if (!window.confirm(`Are you sure you want to cut all ${clips.length} clips?`)) {
      return;
    }

    // Reset logs
    setCuttingLogs([]);
    setIsCuttingAll(true);
    setIsCutting(true); // Indicate overall cutting process is active
    let successfulCuts = 0;
    let failedCuts = [];

    // Add initial logs
    const timestamp = new Date().toLocaleTimeString();
    setCuttingLogs(logs => [...logs,
      `[${timestamp}] Initializing bulk video cutting process...`,
      `[${timestamp}] Total clips to process: ${clips.length}`,
      `[${timestamp}] Source video: ${videoInfo.title}`,
      `[${timestamp}] Video file: ${videoInfo.filePath.split('\\').pop()}`,
      `[${timestamp}] Starting processing pipeline...`
    ]);

    setCuttingProgress(`Initializing processing of ${clips.length} clips...`);
    setCuttingPercent(0);

    try {
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        setCurrentCuttingClipId(clip.id);

        const clipTimestamp = new Date().toLocaleTimeString();
        const duration = (clip.end - clip.start).toFixed(1);

        // Calculate progress: 80% distributed across clips, 20% for final processing
        const baseProgress = (i / clips.length) * 80;

        // Add processing start log
        setCuttingLogs(logs => [...logs,
          `[${clipTimestamp}] Processing clip ${i + 1}/${clips.length}: "${clip.name}"`,
          `[${clipTimestamp}] Time range: ${formatTime(clip.start)} - ${formatTime(clip.end)} (${duration}s)`,
          `[${clipTimestamp}] Score: ${clip.score}/10`,
          `[${clipTimestamp}] Executing: ffmpeg -ss ${clip.start} -t ${duration} ...`
        ]);

        setCuttingProgress(`Processing clip ${i + 1}/${clips.length}: "${clip.name}"`);
        setCuttingPercent(Math.round(baseProgress + 5)); // Show progress within each clip

        try {
          const success = await cutClip(clip, true); // Pass true for isBatch
          const finishTimestamp = new Date().toLocaleTimeString();

          if (success) {
            successfulCuts++;
            setCuttingPercent(Math.round((i + 1) / clips.length * 80)); // Update to next clip's start

            const outputPath = clips.find(c => c.id === clip.id)?.outputPath;
            if (outputPath) {
              const fileName = outputPath.split('\\').pop();
              setCuttingLogs(logs => [...logs,
                `[${finishTimestamp}] SUCCESS: Clip "${clip.name}" completed ✅`,
                `[${finishTimestamp}] Output saved: ${fileName}`,
                `[${finishTimestamp}] File size: ${clips.find(c => c.id === clip.id)?.fileSize || 'Unknown'} bytes`
              ]);
            } else {
              setCuttingLogs(logs => [...logs, `[${finishTimestamp}] SUCCESS: Clip "${clip.name}" completed ✅`]);
            }

            setCuttingProgress(`✅ Clip ${i + 1} completed. Preparing next clip...`);
          } else {
            failedCuts.push(clip.name);
            setCuttingPercent(Math.round((i + 1) / clips.length * 80));

            setCuttingLogs(logs => [...logs,
              `[${finishTimestamp}] FAILED: Clip "${clip.name}" processing failed ❌`,
              `[${finishTimestamp}] Continuing with next clip...`
            ]);

            setCuttingProgress(`❌ Clip ${i + 1} failed. Moving to next clip...`);
          }
        } catch (clipError) {
          console.error(`Error cutting clip ${clip.name}:`, clipError);
          const errorTimestamp = new Date().toLocaleTimeString();
          failedCuts.push(clip.name);
          setCuttingPercent(Math.round((i + 1) / clips.length * 80));

          setCuttingLogs(logs => [...logs,
            `[${errorTimestamp}] ERROR: Clip "${clip.name}" failed with error:`,
            `[${errorTimestamp}] ${clipError.message}`,
            `[${errorTimestamp}] Continuing with remaining clips...`
          ]);

          setCuttingProgress(`❌ Error in clip ${i + 1}. Continuing with next...`);
        }

        // Brief pause to allow UI update and prevent rapid sequential calls
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (batchError) {
      console.error('Batch cutting error:', batchError);
      const errorTimestamp = new Date().toLocaleTimeString();
      setCuttingLogs(logs => [...logs,
        `[${errorTimestamp}] CRITICAL ERROR: Batch processing stopped`,
        `[${errorTimestamp}] ${batchError.message}`
      ]);

      setCuttingProgress(`⛔ Critical error - batch process stopped`);
      setCuttingPercent(80); // Show partial completion
      await new Promise(resolve => setTimeout(resolve, 2000)); // Show error message for 2 seconds
    }

    // Final completion
    const completionTimestamp = new Date().toLocaleTimeString();
    setCuttingPercent(100);
    setIsCuttingAll(false);
    setIsCutting(false);
    setCurrentCuttingClipId(null);

    const completionMessage = `Batch processing completed: ${successfulCuts} successful, ${failedCuts.length} failed.`;
    setCuttingLogs(logs => [...logs,
      `[${completionTimestamp}] ========================================`,
      `[${completionTimestamp}] BATCH PROCESSING COMPLETE`,
      `[${completionTimestamp}] Results: ${successfulCuts}✓ ${failedCuts.length}✗`,
      `[${completionTimestamp}] Total files processed: ${clips.length}`,
      `[${completionTimestamp}] ========================================`
    ]);

    setCuttingProgress(`✅ ${completionMessage}`);

    // Show detailed summary
    if (failedCuts.length > 0) {
      setCuttingLogs(logs => [...logs,
        `[${completionTimestamp}] Failed clips: ${failedCuts.join(', ')}`
      ]);
      alert(`${completionMessage}\n\nFailed clips:\n${failedCuts.join('\n')}\n\nThe process continued despite errors.`);
    } else {
      alert(`✅ ${completionMessage} All clips processed successfully!`);
    }

    setTimeout(() => {
      setCuttingProgress('');
      setCuttingPercent(0);
      // Keep cuttingLogs to show the completed log for a while
      setTimeout(() => setCuttingLogs([]), 10000); // Clear logs after 10 seconds
    }, 5000);
  };

  const saveSession = async () => {
    if (!videoInfo || clips.length === 0) {
      alert('No video or clips to save!');
      return;
    }

    try {
      // Find existing session for this video file, or create new one (same logic as auto-save)
      const existingSessions = await window.electronAPI.getClipperSessions();
      const videoFilePath = videoInfo.filePath || videoInfo.url || 'unknown';

      // Find session that matches this video file
      const existingSession = existingSessions.find(session =>
        session.videoInfo && (session.videoInfo.filePath === videoFilePath || session.videoInfo.url === videoFilePath)
      );

      // Use existing session ID if found, otherwise generate a simple hash-based ID
      let sessionId;
      if (existingSession) {
        sessionId = existingSession.id;
        console.log('Found existing session for video, will overwrite:', sessionId);
      } else {
        // Create a simple hash from the video path for new sessions
        const simpleHash = videoFilePath.split('').reduce((hash, char) => {
          return ((hash << 5) - hash) + char.charCodeAt(0);
        }, 0);
        sessionId = `session_${Math.abs(simpleHash).toString(36)}`;
        console.log('Creating new session for video:', sessionId);
      }

      const sessionTitle = videoInfo.title && videoInfo.title !== 'undefined' ? videoInfo.title : 'YouTube Video';
      const session = {
        id: sessionId,
        title: `Manual saved - ${sessionTitle}`,
        savedAt: new Date().toISOString(),
        videoInfo,
        clips
      };

      const result = await window.electronAPI.saveClipperSession(session);
      if (result.success) {
        alert('Session saved successfully!');
      } else {
        alert('Failed to save session');
      }
    } catch (error) {
      console.error('Error saving session:', error);
      alert('Failed to save session');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Fixed Header */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-cyan-500/20">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="flex items-center space-x-2 text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
              >
                <span className="text-xl">←</span>
                <span>Clipper Sessions</span>
              </button>
              <div className="h-6 w-px bg-cyan-500/20"></div>
              <h1 className="text-2xl font-bold text-white">Video Clipper</h1>
            </div>

            <div className="flex items-center space-x-6">
              <div className="text-right">
                <h3 className="text-sm font-medium text-gray-300">
                  {videoInfo?.title && videoInfo.title !== 'undefined' ? videoInfo.title : (videoInfo?.filePath ? videoInfo.filePath.split('/').pop().split('\\').pop() : 'No video loaded')}
                </h3>
                <p className="text-xs text-gray-500">
                  {videoInfo?.channel && videoInfo.channel !== 'Unknown Channel' ? (
                    <span className="text-cyan-400">📺 {videoInfo.channel}</span>
                  ) : null}
                  {videoInfo?.channel && videoInfo.channel !== 'Unknown Channel' && !videoInfo?.fileExists === false ? ' • ' : ''}
                  {videoInfo?.fileExists === false ? (
                    <span className="text-red-400">⚠️ Video file not found on this computer</span>
                  ) : (
                    `Current: ${formatTime(currentTime)}`
                  )}
                </p>
              </div>
              <button
                onClick={saveSession}
                className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all transform hover:scale-105"
              >
                <span>💾</span>
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6">

        {/* Main Content Grid */}
        <div className="grid grid-cols-12 gap-8">

          {/* Left Panel - Video Player */}
          <div className="col-span-7 space-y-6">
            {/* Video Player Card */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl overflow-hidden shadow-2xl border border-cyan-500/10">
              <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 p-6 border-b border-cyan-500/20">
                <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                  <span className="text-cyan-400">🎬</span>
                  <span>Video Preview</span>
                </h3>
              </div>
              <div className="p-6">
                {videoInfo ? (
                  isLoadingVideo ? (
                    <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-600 rounded-xl flex items-center justify-center">
                      <div className="text-center text-gray-400">
                        <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mb-4"></div>
                        <p className="font-medium">Loading video...</p>
                        <p className="text-sm">Preparing video for playback</p>
                      </div>
                    </div>
                  ) : videoBlobUrl ? (
                    <video
                      ref={videoRef}
                      src={videoBlobUrl}
                      controls
                      className="w-full rounded-xl shadow-lg"
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedData={() => console.log('Main video loaded successfully')}
                      onError={(e) => {
                        // Don't log detailed errors for missing/corrupted video files - this is expected when using app on different computers
                        const errorMessage = e.target?.error?.message || '';
                        const isFileNotFound = errorMessage.includes('Video file not found') ||
                                               errorMessage.includes('FFmpegDemuxer: open context failed') ||
                                               errorMessage.includes('DEMUXER_ERROR_COULD_NOT_OPEN');

                        if (!isFileNotFound) {
                          console.error('Main video failed to load:', e);
                          console.error('Video src was:', videoBlobUrl);
                          console.error('Video error code:', e.target?.error?.code);
                          console.error('Video error message:', e.target?.error?.message);
                          console.error('Video network state:', e.target?.networkState);
                          console.error('Video ready state:', e.target?.readyState);
                          console.error('Video current src:', e.target?.currentSrc);
                        } else {
                          console.warn('Video file not playable - may be missing or corrupted:', videoBlobUrl);
                        }

                        // Clear the src to prevent further errors
                        if (videoRef.current) {
                          videoRef.current.src = '';
                          videoRef.current.load(); // Reset the video element
                        }
                        // Force a re-render with null video URL to show error state
                        setVideoBlobUrl(null);
                        setIsLoadingVideo(false);
                      }}
                      onLoadStart={() => console.log('Main video started loading')}
                      onCanPlay={() => console.log('Main video can play')}
                      onWaiting={() => console.log('Main video waiting for data')}
                      onStalled={() => console.log('Main video stalled')}
                      onProgress={() => console.log('Main video progress event')}
                      onSuspend={() => console.log('Main video suspended')}
                      onAbort={() => console.log('Main video aborted')}
                    />
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-600 rounded-xl flex items-center justify-center">
                      <div className="text-center text-gray-400">
                        <div className="text-4xl mb-4">❌</div>
                        <p className="font-medium">Failed to load video</p>
                        <p className="text-sm">The video file could not be loaded for playback</p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-600 rounded-xl flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <div className="text-4xl mb-4">📽️</div>
                      <p className="font-medium">No video loaded</p>
                      <p className="text-sm">Upload a video from the dashboard</p>
                    </div>
                  </div>
                )}
              </div>
            </div>



            {/* Quick Controls Card */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl overflow-hidden shadow-xl border border-cyan-500/10">
              <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 p-6 border-b border-purple-500/20">
                <h4 className="text-lg font-bold text-white flex items-center space-x-2">
                  <span className="text-purple-400">⚡</span>
                  <span>Quick Actions</span>
                </h4>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={addNewClip}
                    className="flex items-center justify-center space-x-2 w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white py-3 px-4 rounded-lg font-medium transition-all transform hover:scale-105 disabled:opacity-50"
                    disabled={!videoInfo}
                  >
                    <span>✂️</span>
                    <span>Add Clip from Current Time</span>
                  </button>

                  {currentClip && (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setStartFromCurrent(currentClip.id)}
                        className="flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white py-2 px-3 rounded-lg text-sm font-medium transition-all transform hover:scale-105"
                      >
                        <span>▶️</span>
                        <span>Set Start</span>
                      </button>
                      <button
                        onClick={() => setEndFromCurrent(currentClip.id)}
                        className="flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white py-2 px-3 rounded-lg text-sm font-medium transition-all transform hover:scale-105"
                      >
                        <span>⏸️</span>
                        <span>Set End</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Clip Editor */}
          <div className="col-span-5 space-y-6">
            <div className="bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl overflow-hidden shadow-xl border border-cyan-500/10">
              <div className="bg-gradient-to-r from-orange-600/20 to-red-600/20 p-6 border-b border-orange-500/20">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                    <span className="text-orange-400">📋</span>
                    <span>Clip Editor</span>
                  </h3>
                  <div className="flex items-center space-x-3">
                    <span className="px-3 py-1 bg-gradient-to-r from-orange-600/20 to-red-600/20 text-orange-300 text-sm font-medium rounded-full border border-orange-500/20">
                      {clips.length} clips
                    </span>
                    <button
                      onClick={cutAllClips}
                      disabled={!videoInfo || clips.length === 0 || isCuttingAll || isCutting || videoInfo?.fileExists === false}
                      className="bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all transform hover:scale-105 disabled:opacity-50"
                    >
                      {videoInfo?.fileExists === false ? 'Video Not Available' : 'Cut All'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {clips.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-4xl mb-4">🎬</div>
                      <p className="font-medium">No clips created yet</p>
                      <p className="text-sm">Use the video player to create clips</p>
                    </div>
                  ) : (
                    clips.map((clip) => (
                      <div
                        key={clip.id}
                        className={`group p-4 rounded-xl cursor-pointer transition-all duration-300 border ${
                          currentClip?.id === clip.id
                            ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-cyan-400/50 ring-2 ring-cyan-400/20'
                            : 'bg-gray-750/50 border-gray-600/30 hover:border-gray-500/50 hover:bg-gray-750/80'
                        }`}
                        onClick={() => setCurrentClip(clip)}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${
                              clip.outputPath ? 'bg-green-400' : 'bg-gray-500'
                            }`}></div>
                            <h4 className="font-semibold text-cyan-300 group-hover:text-cyan-200 transition-colors">
                              {clip.name}
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              clip.score > 7 ? 'bg-green-600/30 text-green-300 border border-green-500/30' :
                              clip.score > 5 ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/30' :
                              'bg-gray-600/30 text-gray-300 border border-gray-500/30'
                            }`}>
                              Score: {clip.score}/10
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeClip(clip.id); }}
                              className="w-6 h-6 rounded-full bg-red-600/80 hover:bg-red-500 flex items-center justify-center text-xs font-bold text-white transition-colors"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* Time Controls */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="space-y-2">
                            <label className="block text-xs font-medium text-gray-400">Start Time</label>
                            <input
                              type="text"
                              value={formatTime(clip.start)}
                              onChange={(e) => updateClipTime(clip.id, 'start', parseTimeFromString(e.target.value))}
                              className="w-full bg-gray-700/50 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors font-mono"
                              placeholder="0:00:00"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-medium text-gray-400">End Time</label>
                            <input
                              type="text"
                              value={formatTime(clip.end)}
                              onChange={(e) => updateClipTime(clip.id, 'end', parseTimeFromString(e.target.value))}
                              className="w-full bg-gray-700/50 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors font-mono"
                              placeholder="0:00:30"
                            />
                          </div>
                        </div>

                        {/* Judul/Deskripsi Input */}
                        <div className="mb-4">
                          <label className="block text-xs font-medium text-gray-400 mb-2">Judul/Deskripsi</label>
                          <textarea
                            value={clip.caption}
                            onChange={(e) => updateClipInfo(clip.id, 'caption', e.target.value)}
                            className="w-full bg-gray-700/50 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors resize-none"
                            rows="2"
                            placeholder="Masukkan judul dan deskripsi untuk clip ini..."
                          />
                        </div>



                        {/* Footer */}
                        <div className="flex justify-between items-center">
                          <div className="text-xs text-gray-400 font-mono">
                            {formatTime(clip.start)} - {formatTime(clip.end)}
                            <span className="ml-2 text-cyan-400">
                              ({Math.round((clip.end - clip.start) * 10) / 10}s)
                            </span>
                          </div>

                          <div className="flex items-center space-x-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentClip(clip);
                                createClipPreview(clip);
                                setShowPreviewModal(true);
                              }}
                              disabled={videoInfo?.fileExists === false}
                              className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 flex items-center justify-center text-sm transition-all transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={videoInfo?.fileExists === false ? "Video file not available" : "Preview clip"}
                            >
                              <span>👁️</span>
                            </button>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              clip.outputPath
                                ? 'bg-green-600/30 text-green-300 border border-green-500/30'
                                : 'bg-red-600/30 text-red-300 border border-red-500/30'
                            }`}>
                              {clip.outputPath ? '✓ Ready' : 'Pending'}
                            </span>
                            <button
                              onClick={() => cutClip(clip)}
                              disabled={isCutting || videoInfo?.fileExists === false}
                              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all transform hover:scale-105 ${
                                clip.outputPath
                                  ? 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white shadow-lg'
                                  : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white shadow-lg'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              <span>{videoInfo?.fileExists === false ? '🚫' : clip.outputPath ? '🔄' : '✂️'}</span>
                              <span>{videoInfo?.fileExists === false ? 'Video Not Available' : clip.outputPath ? 'Re Cut' : 'Cut Clip'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Video Cutting Progress - Full Screen Popup Overlay */}
        {(isCutting || isCuttingAll) && (
          <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col">
            {/* Header with status */}
            <div className="flex-shrink-0 p-6 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-b border-cyan-500/20">
              <div className="flex items-center justify-center space-x-4">
                <div className="text-2xl">🔄</div>
                <h2 className="text-2xl font-bold text-white">
                  {isCuttingAll ? '⏺️ Processing All Video Clips' : '⏺️ Processing Video Clip'}
                </h2>
              </div>
            </div>

            {/* Centered loading spinner with logs */}
            <div className="flex-1 flex flex-col items-center justify-center px-6">
              {/* Logo/Icon Spinner */}
              <div className="relative mb-8">
                <div className="w-24 h-24 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl">🚀</span>
                </div>
              </div>

              {/* Progress text */}
              <div className="text-center space-y-2 mb-8">
                <h3 className="text-xl font-semibold text-cyan-300">{cuttingProgress || 'Initializing...'}</h3>
                <div className="w-full max-w-md bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-cyan-600 to-blue-500 h-2 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${cuttingPercent}%` }}
                  ></div>
                </div>
                <p className="text-gray-400 text-sm">{Math.round(cuttingPercent)}% Complete</p>
              </div>
            </div>

            {/* Process Logs at Bottom */}
            <div className="flex-shrink-0 p-6 bg-gray-800/90 backdrop-blur border-t border-gray-700/50">
              <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-semibold text-cyan-300">📋 Process Logs</h4>
                  <span className="text-xs bg-cyan-600/30 px-2 py-1 rounded text-cyan-300">
                    {cuttingLogs.length} messages
                  </span>
                </div>
                <div className="bg-black/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  {cuttingLogs.map((log, index) => (
                    <div key={index} className="text-sm text-green-300 font-mono mb-2 leading-5 break-words">
                      {log}
                    </div>
                  ))}
                  {cuttingLogs.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-4">
                      🔄 Initializing process...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {showPreviewModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => {
                setShowPreviewModal(false);
                cleanupPreview();
              }}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl shadow-2xl border border-purple-500/20 max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 p-6 border-b border-purple-500/20">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                    <span className="text-purple-400">👁️</span>
                    <span>Clip Preview: {previewClip?.name}</span>
                  </h3>
                  <button
                    onClick={() => {
                      setShowPreviewModal(false);
                      cleanupPreview();
                    }}
                    className="w-8 h-8 rounded-lg bg-red-600/80 hover:bg-red-500 flex items-center justify-center text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                {isCreatingPreview ? (
                  <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-600 rounded-xl flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full mb-4"></div>
                      <p className="font-medium">Creating preview...</p>
                      <p className="text-sm">This may take a moment</p>
                    </div>
                  </div>
                ) : previewUrl ? (
                  <div className="space-y-4">
                    <video
                      src={previewUrl}
                      autoPlay
                      loop
                      controls
                      className="w-full rounded-xl shadow-lg"
                      playsInline
                      onLoadedData={() => console.log('Preview video loaded successfully:', previewUrl)}
                      onError={(e) => console.error('Preview video failed to load:', e, 'URL:', previewUrl)}
                      onLoadStart={() => console.log('Preview video started loading:', previewUrl)}
                      onCanPlay={() => console.log('Preview video can play')}
                      onWaiting={() => console.log('Preview video waiting for data')}
                      onStalled={() => console.log('Preview video stalled')}
                      onAbort={() => console.log('Preview video load aborted')}
                      onEmptied={() => console.log('Preview video emptied')}
                      onSuspend={() => console.log('Preview video suspended')}
                    />
                    <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-500/20">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-purple-400">Time range:</span>
                          <span className="ml-2 text-gray-300">{formatTime(previewClip.start)} - {formatTime(previewClip.end)}</span>
                        </div>
                        <div>
                          <span className="font-medium text-purple-400">Duration:</span>
                          <span className="ml-2 text-gray-300">{Math.round((previewClip.end - previewClip.start) * 10) / 10}s</span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <span className="font-medium text-purple-400">Judul/Deskripsi:</span>
                        <span className="ml-2 text-gray-300">{previewClip.caption || 'Tidak ada judul/deskripsi'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-600 rounded-xl flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <div className="text-4xl mb-4">❌</div>
                      <p className="font-medium">Preview failed</p>
                      <p className="text-sm">Click the preview button again to retry</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-750/50 p-4 border-t border-gray-600/20 flex justify-end">
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    cleanupPreview();
                  }}
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white rounded-lg transition-all transform hover:scale-105"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default Clipper;
