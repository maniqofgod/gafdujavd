// Enhanced ffmpeg path detection for both dev and production
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

// Access Electron app if available (from global set in main.js)
const electron = require('electron');
const app = electron.app || global.app;

function getFfmpegPath() {
  // Check if we're in production (built app)
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked'))) {
    const prodPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    if (fs.existsSync(prodPath)) {
      console.log('Using production ffmpeg path:', prodPath);
      return prodPath;
    }
  }

  // Check development path
  const devPaths = [
    path.join(__dirname, '..', '..', 'node_modules', '.bin', 'ffmpeg.exe'),
    path.join(__dirname, '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    path.join(process.cwd(), 'node_modules', '.bin', 'ffmpeg.exe'),
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  ];

  for (const testPath of devPaths) {
    if (fs.existsSync(testPath)) {
      console.log('Using development ffmpeg path:', testPath);
      return testPath;
    }
  }

  console.error('ffmpeg binary not found in any expected location');
  throw new Error('ffmpeg binary not found. Please reinstall dependencies.');
}

const ffmpegPath = getFfmpegPath();
ffmpeg.setFfmpegPath(ffmpegPath);

class VideoCutter {
  async createPreviewClip(sourcePath, startTime, endTime, outputDir, previewId) {
    // Check if source file exists before proceeding
    if (!fs.existsSync(sourcePath)) {
      console.error('Source video file not found:', sourcePath);
      throw new Error('Source video file not found: ' + sourcePath + '. This may happen when using the app on different computers where the video files are not available.');
    }

    const resolvedOutputDir = this.resolveOutputDir(outputDir);
    const outputFileName = `preview_${previewId}.mp4`;
    const outputPath = path.join(resolvedOutputDir, outputFileName);

    // Calculate duration but limit to max 30 seconds for preview
    const startSeconds = this.timestampToSeconds(startTime);
    const endSeconds = this.timestampToSeconds(endTime);
    const clipDuration = Math.min(endSeconds - startSeconds, 30);
    const finalDuration = Math.max(clipDuration, 1); // Minimum 1 second

    console.log(`Creating preview clip: ${outputPath} from ${startTime} to ${endTime} (${finalDuration}s)`);

    // Check source file size to optimize processing for large files
    let sourceFileSize = 0;
    try {
      const stats = await fs.promises.stat(sourcePath);
      sourceFileSize = stats.size;
      console.log(`Source file size: ${(sourceFileSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
    } catch (error) {
      console.warn('Could not check source file size:', error);
    }

    // For files > 1GB, use more aggressive optimization
    const isLargeFile = sourceFileSize > (1024 * 1024 * 1024); // 1GB threshold

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg(sourcePath)
        .setStartTime(startSeconds)
        .setDuration(finalDuration);

      if (isLargeFile) {
        // Aggressive optimization for large files
        console.log('Using optimized settings for large file (>1GB)');
        ffmpegCommand
          .outputOptions([
            '-y', // Overwrite output files
            '-vf', 'scale=480:270', // Even smaller resolution for large files
            '-preset', 'ultrafast', // Fastest encoding preset
            '-crf', '28', // Higher compression (lower quality but faster)
            '-movflags', '+faststart', // Optimize for web playback
            '-avoid_negative_ts', 'make_zero' // Handle timestamp issues
          ]);
      } else {
        // Standard optimization for normal files
        ffmpegCommand
          .outputOptions([
            '-y', // Overwrite output files
            '-vf', 'scale=640:360', // Standard preview resolution
            '-preset', 'fast', // Fast encoding preset
            '-crf', '23', // Good quality compression
            '-movflags', '+faststart' // Optimize for web playback
          ]);
      }

      ffmpegCommand
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          console.log('Preview creation progress:', progress.percent ? `${progress.percent.toFixed(1)}%` : 'processing...');
        })
        .on('end', () => {
          console.log('Preview clip created successfully:', outputPath);
          resolve({ success: true, outputPath });
        })
        .on('error', (err) => {
          console.error('Error creating preview clip:', err);
          reject(err);
        });

      // Set timeout for large files (5 minutes max)
      if (isLargeFile) {
        setTimeout(() => {
          ffmpegCommand.kill('SIGKILL');
          reject(new Error('Preview creation timed out for large file'));
        }, 5 * 60 * 1000); // 5 minutes
      }

      ffmpegCommand.run();
    });
  }

  async cutVideo(sourcePath, startTime, endTime, outputDir, outputFileName, caption = null, transcriptData = null, skipSubtitles = false) {
    // Check if source file exists before proceeding
    if (!fs.existsSync(sourcePath)) {
      console.error('Source video file not found:', sourcePath);
      throw new Error('Source video file not found: ' + sourcePath + '. This may happen when using the app on different computers where the video files are not available.');
    }

    // Calculate duration for sending back to frontend
    const duration = Math.round(this.calculateDuration(startTime, endTime) * 100) / 100; // Round to 2 decimal places

    // Handle outputDir as string identifiers
    const resolvedOutputDir = this.resolveOutputDir(outputDir);

    // Sanitize filename for filesystem compatibility
    const sanitizedFileName = this.sanitizeFileName(outputFileName);
    const outputPath = path.join(resolvedOutputDir, sanitizedFileName);

    // Track video status - mark as clipped and inherit channel info from source
    try {
      const geminiStore = require('./geminiStore');

      // Try to get channel information from the source video
      let channelInfo = {};
      try {
        const sourceStatus = await geminiStore.getVideoStatus(sourcePath);
        if (sourceStatus && sourceStatus.youtube_channel) {
          channelInfo.youtube_channel = sourceStatus.youtube_channel;
          console.log('[VideoCutter] Inheriting channel info from source:', sourceStatus.youtube_channel);
        }
      } catch (channelError) {
        console.warn('[VideoCutter] Could not get channel info from source:', channelError.message);
      }

      await geminiStore.updateVideoStatus(outputPath, {
        original_filename: path.basename(sourcePath),
        is_clipped: true,
        ...channelInfo
      });
      console.log('[VideoCutter] Marked video as clipped:', outputPath);
    } catch (statusError) {
      console.warn('[VideoCutter] Failed to update video status:', statusError);
    }

    // Save caption to a text file alongside the video if provided
    let captionPath = null;
    if (caption) {
      // Create caption filename that matches video filename exactly
      const captionFileName = this.createCaptionFileName(sanitizedFileName);
      captionPath = path.join(resolvedOutputDir, captionFileName);

      try {
        await fs.promises.writeFile(captionPath, caption.trim(), 'utf8');
        console.log(`[VideoCutter] Caption file saved: ${captionPath}`);
      } catch (captionError) {
        console.error('Failed to save caption file:', captionError);
        captionPath = null;
      }
    }

    // If skipSubtitles is true, do simple cutting without any subtitle processing
    if (skipSubtitles) {
      return new Promise((resolve, reject) => {
        ffmpeg(sourcePath)
          .setStartTime(startTime)
          .setDuration(this.calculateDuration(startTime, endTime))
          .outputOptions(['-y'])
          .output(outputPath)
          .on('end', () => resolve({ success: true, outputPath, captionPath, duration }))
          .on('error', (err) => reject(err))
          .run();
      });
    }

    // Original subtitle processing logic for backward compatibility
    let hasSubtitles = false;
    let finalOutputPath = outputPath;

    // Check for subtitle processing conditions
    if (transcriptData && transcriptData.trim()) {
      hasSubtitles = true;
      // Process transcript-based subtitles
      const relevantTranscript = this.extractTranscriptForTimeRange(transcriptData, this.timestampToSeconds(startTime), this.timestampToSeconds(endTime));

      // Create video with burned subtitles
      const targetOutputDir = outputDir === 'cuts' ? resolvedOutputDir : path.join(dataDir, 'results', 'autocaption');

      // Ensure target directory exists
      if (!fs.existsSync(targetOutputDir)) {
        fs.mkdirSync(targetOutputDir, { recursive: true });
      }

      const targetFileName = outputDir === 'cuts' ? sanitizedFileName : `captioned_${sanitizedFileName}`;
      finalOutputPath = path.join(targetOutputDir, targetFileName);

      // Simple cutting for transcript processing (simplified)
      await new Promise((resolve, reject) => {
        ffmpeg(sourcePath)
          .setStartTime(startTime)
          .setDuration(this.calculateDuration(startTime, endTime))
          .outputOptions(['-y'])
          .output(finalOutputPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });
    }

    // Return results
    if (!hasSubtitles) {
      return new Promise((resolve, reject) => {
        ffmpeg(sourcePath)
          .setStartTime(startTime)
          .setDuration(this.calculateDuration(startTime, endTime))
          .outputOptions(['-y'])
          .output(outputPath)
          .on('end', () => resolve({ success: true, outputPath, captionPath, duration }))
          .on('error', (err) => reject(err))
          .run();
      });
    } else {
      return Promise.resolve({ success: true, outputPath: finalOutputPath, captionPath, duration });
    }
  }

  calculateDuration(start, end) {
    const startSeconds = this.timestampToSeconds(start);
    const endSeconds = this.timestampToSeconds(end);
    return endSeconds - startSeconds;
  }

  timestampToSeconds(timestamp) {
    if (typeof timestamp === 'number') return timestamp;
    if (typeof timestamp === 'string') {
      const parts = timestamp.split(':').map(Number);
      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
      } else if (parts.length === 2) {
        return parts[0] * 60 + (parts[1] || 0);
      } else if (parts.length === 1) {
        return parts[0] || 0;
      }
    }
    return 0;
  }

  resolveOutputDir(outputDir) {
    if (typeof outputDir === 'string') {
      // Use portable path relative to exe location for portability across computers
      const exeDir = path.dirname(process.execPath);
      const dataDir = path.join(exeDir, 'data');

      const outputDirMap = {
        'downloads': path.join(dataDir, 'download'),
        'cuts': path.join(dataDir, 'cuts'),
        'results': path.join(dataDir, 'results'),
        'temp': path.join(dataDir, 'temp'),
        'uploads': path.join(dataDir, 'uploads'),
        'transcripts': path.join(dataDir, 'transcripts'),
        'autocaption': path.join(dataDir, 'results')
      };

      if (outputDirMap[outputDir]) {
        if (!fs.existsSync(outputDirMap[outputDir])) {
          fs.mkdirSync(outputDirMap[outputDir], { recursive: true });
        }
        return outputDirMap[outputDir];
      }

      if (path.isAbsolute(outputDir)) {
        return outputDir;
      }

      const tempPath = path.join(dataDir, 'temp', outputDir);
      if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath, { recursive: true });
      }
      return tempPath;
    }
    return outputDir;
  }

  getUserDataPath() {
    if (global.app && typeof global.app.getPath === 'function') {
      try {
        return global.app.getPath('userData');
      } catch (e) {
        console.warn('Could not get app userData path, falling back to env');
      }
    }

    if (process.platform === 'win32') {
      return path.join(process.env.APPDATA || 'C:\\Users\\Default\\AppData\\Roaming', 'autocliper');
    } else if (process.platform === 'darwin') {
      return path.join(process.env.HOME || '', 'Library', 'Application Support', 'autocliper');
    } else {
      return path.join(process.env.HOME || '', '.config', 'autocliper');
    }
  }

  extractTranscriptForTimeRange(transcriptData, clipStartSeconds, clipEndSeconds) {
    if (!transcriptData || !transcriptData.trim()) {
      return '';
    }

    const lines = transcriptData.split('\n');
    const relevantLines = [];

    for (const line of lines) {
      const match = line.match(/^(\d+(?:\.\d+)?):\s*(.+)$/);
      if (match) {
        const timestamp = parseFloat(match[1]);
        if (timestamp >= clipStartSeconds - 2 && timestamp <= clipEndSeconds + 2) {
          relevantLines.push(match[2].trim());
        }
      }
    }

    if (relevantLines.length > 0) {
      return relevantLines.slice(0, 3).join(' ').substring(0, 150);
    }

    const words = transcriptData.split(/\s+/).slice(0, 20);
    return words.join(' ').substring(0, 150);
  }

  sanitizeFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      return 'clip.mp4';
    }

    console.log(`[VideoCutter] sanitizeFileName INPUT: "${fileName}"`);

    let sanitized = fileName;

    // MUCH MORE PERMISSIVE: Only remove filesystem-critical characters
    // Keep user symbols, emojis, etc. as much as possible
    sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_'); // Only these filesystem-dangerous chars
    sanitized = sanitized.replace(/_{2,}/g, '_');  // Clean multiple underscores

    sanitized = sanitized.trim();

    // Limit reasonable length but keep generous for user input
    sanitized = sanitized.substring(0, 150);

    console.log(`[VideoCutter] sanitizeFileName OUTPUT: "${sanitized}"`);

    // Better fallback logic - if REALLY problematic, add timestamp
    if (!sanitized || sanitized.length === 0) {
      sanitized = `clip_${Date.now()}`;
      console.log(`[VideoCutter] Using fallback: "${sanitized}"`);
    }

    // Auto-add .mp4 if not present
    if (!sanitized.toLowerCase().endsWith('.mp4')) {
      sanitized += '.mp4';
    }

    console.log(`[VideoCutter] FINAL filename: "${sanitized}"`);
    return sanitized;
  }

  // Create caption filename that matches exactly with video filename
  // Changed to use video filename instead of caption content
  createCaptionFileName(videoFileName) {
    if (!videoFileName || typeof videoFileName !== 'string') {
      return `caption_${Date.now()}.txt`;
    }

    // Remove .mp4 extension and add .txt extension
    // This ensures caption filename matches video filename exactly
    let captionFileName = videoFileName.replace(/\.mp4$/i, '') + '.txt';

    console.log(`[VideoCutter] createCaptionFileName: "${videoFileName}" -> "${captionFileName}"`);

    return captionFileName;
  }

  async getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error('Error probing video:', err);
          resolve(null);
        } else {
          const duration = metadata.format ? metadata.format.duration : null;
          resolve(duration);
        }
      });
    });
  }
}

module.exports = new VideoCutter();
