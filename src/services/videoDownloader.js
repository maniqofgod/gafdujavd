// Set the binary path for yt-dlp - handle both development and production
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { app } = require('electron'); // For temp path

const ytDlpPath = getYtDlpPath();

function getYtDlpPath() {

  // Check if we're in production (built app)
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked'))) {
    const prodPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe');
    if (fs.existsSync(prodPath)) {
      console.log('Using production yt-dlp path:', prodPath);
      return prodPath;
    }
  }

  // Check development path
  const devPaths = [
    path.join(__dirname, '..', '..', 'node_modules', '.bin', 'yt-dlp.exe'),
    path.join(__dirname, '..', '..', 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe'),
    path.join(process.cwd(), 'node_modules', '.bin', 'yt-dlp.exe'),
    path.join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe')
  ];

  for (const testPath of devPaths) {
    if (fs.existsSync(testPath)) {
      console.log('Using development yt-dlp path:', testPath);
      return testPath;
    }
  }

  console.error('yt-dlp binary not found in any expected location');
  throw new Error('yt-dlp binary not found. Please reinstall dependencies.');
}

async function execYtDlp(url, options, cookiesPath, progressCallback) {
  return new Promise((resolve, reject) => {
    const args = [url];

    for (const [key, value] of Object.entries(options)) {
      if (key === 'skipDownload' && value) {
        args.push('--skip-download');
      } else if (key === 'print') {
        args.push('--print', value);
      } else if (key === 'noWarnings' && value) {
        args.push('--no-warnings');
      } else if (key === 'format') {
        args.push('--format', value);
      } else if (key === 'output') {
        args.push('--output', value);
      } else if (key === 'noPlaylist' && value) {
        args.push('--no-playlist');
      } else if (key === 'geoBypass' && value) {
        args.push('--geo-bypass');
      } else if (key === 'mergeOutputFormat' && value) {
        args.push('--merge-output-format', value);
      }
    }

    // Add cookies if provided and file exists
    if (cookiesPath && fs.existsSync(cookiesPath)) {
      console.log('Using cookies file:', cookiesPath);
      args.push('--cookies', cookiesPath);
    } else if (cookiesPath) {
      console.warn('Cookies file specified but not found:', cookiesPath);
    }

    // Add progress options for real-time updates
    args.push('--progress');
    args.push('--newline');

    // Add options to help with YouTube bot detection
    args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    args.push('--referer', 'https://www.youtube.com');

    let stdout = '';
    let stderr = '';

    const child = spawn(ytDlpPath, args, { cwd: process.cwd() });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();

      // Parse progress from stderr - yt-dlp has various progress formats
      if (progressCallback) {
        // Look for percentage in the current stderr content
        const percentMatch = stderr.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (percentMatch) {
          const percentage = parseFloat(percentMatch[1]);
          progressCallback(`Downloading... ${percentage.toFixed(1)}%`);
        } else {
          // Sometimes progress appears in different formats like "100.0%" without [download]
          const altPercentMatch = stderr.match(/(\d+(?:\.\d+)?)%/);
          if (altPercentMatch && stderr.includes('of') && (stderr.includes('MB') || stderr.includes('KB'))) {
            const percentage = parseFloat(altPercentMatch[1]);
            progressCallback(`Downloading... ${percentage.toFixed(1)}%`);
          }
        }
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        // Send final 100% progress
        if (progressCallback) {
          progressCallback('Download completed successfully');
        }
        resolve(stdout.trim());
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

class VideoDownloader {
  setCookiesPath(path) {
    this.cookiesPath = path;
  }

  validateYouTubeUrl(url) {
    const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)/;
    return youtubeRegex.test(url);
  }

  async downloadVideo(url, jobId, progressCallback) {
    // Validate URL first
    if (!this.validateYouTubeUrl(url)) {
      throw new Error('Invalid YouTube URL provided');
    }

    // Use portable path relative to exe location for portability across computers
    const exeDir = path.dirname(process.execPath);
    const outputDir = path.join(exeDir, 'data', 'download');

    // Extract video ID from URL for fallback
    const videoIdMatch = url.match(/[?&]v=([^#\&\?]*)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';

    // Get basic info first for filename and duration - try multiple times with fallback
    let title = 'YouTube Video'; // Default title to prevent undefined
    let duration = null;
    let channel = 'Unknown Channel'; // Default channel name

    // Extract video ID for better fallback title (already extracted above)

    // Try to get title and channel with different approaches
    try {
      console.log('Attempting to extract video title...');
      const titleOutput = await execYtDlp(url, {
        skipDownload: true,
        print: '%(title)s',
        noWarnings: true
      }, this.cookiesPath); // Force use cookies for title extraction

      if (titleOutput && titleOutput.trim()) {
        title = titleOutput.trim();
        console.log('Video title extracted:', title);
      } else {
        console.warn('Empty title returned, trying alternative method...');

        // Try with JSON output format for more reliable extraction
        const jsonOutput = await execYtDlp(url, {
          skipDownload: true,
          print: '%(.title)s',
          noWarnings: true
        }, this.cookiesPath);

        if (jsonOutput && jsonOutput.trim()) {
          title = jsonOutput.trim();
        }
      }

      // Ensure title is never undefined/empty after all attempts
      if (!title || title.trim() === '') {
        title = `YouTube Video ${videoId.substring(0, 8)}`;
      }

      // Get duration in seconds
      const durationOutput = await execYtDlp(url, {
        skipDownload: true,
        print: '%(duration)s',
        noWarnings: true
      }, this.cookiesPath);
      if (durationOutput && !isNaN(parseFloat(durationOutput))) {
        duration = parseFloat(durationOutput);
        console.log('Video duration retrieved:', duration, 'seconds');
      }

      // Get channel/uploader name
      const channelOutput = await execYtDlp(url, {
        skipDownload: true,
        print: '%(uploader)s',
        noWarnings: true
      }, this.cookiesPath);
      if (channelOutput && channelOutput.trim()) {
        channel = channelOutput.trim();
        console.log('Video channel extracted:', channel);
      } else {
        // Try alternative format specifier
        const altChannelOutput = await execYtDlp(url, {
          skipDownload: true,
          print: '%(channel)s',
          noWarnings: true
        }, this.cookiesPath);
        if (altChannelOutput && altChannelOutput.trim()) {
          channel = altChannelOutput.trim();
          console.log('Video channel extracted (alt):', channel);
        }
      }
    } catch (e) {
      console.warn('Could not get video info with cookies:', e.message);

      // Ensure title is never undefined even in catch handler
      if (!title || title.trim() === '' || title === 'YouTube Video') {
        title = `YouTube Video ${videoId.substring(0, 8)}`;
      }

      // Final fallback: try without cookies (though may fail due to bot detection)
      try {
        const titleOutput = await execYtDlp(url, {
          skipDownload: true,
          print: '%(title)s',
          noWarnings: true
        });
        if (titleOutput && titleOutput.trim()) {
          title = titleOutput.trim();
        }
      } catch (fallbackError) {
        console.warn('Fallback title extraction also failed:', fallbackError.message);
        // Final fallback to prevent undefined
        if (!title || title.trim() === '') {
          title = `YouTube Video ${videoId.substring(0, 8)}`;
        }
      }
    }

    // Final safety check - ensure title is never undefined or empty
    if (!title || title.trim() === '') {
      title = 'YouTube Video';
    }

    // Enhanced sanitization for filename - preserve more readable title
    let sanitizedTitle = title
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control chars
      .replace(/[<>:"/\\|?*]/g, '_') // Remove invalid filename chars
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .substring(0, 100); // Limit length

    // If title is still generic, try to include video ID for uniqueness
    if (sanitizedTitle === 'YouTube_Video' || sanitizedTitle === '' || sanitizedTitle.toLowerCase().includes('youtube')) {
      sanitizedTitle = `YouTube_${videoId.substring(0, 12)}`;
    }

    const outputFile = path.join(outputDir, `${sanitizedTitle}.mp4`);
    console.log('Using filename:', sanitizedTitle);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Define download strategies with fallback options - FORCE SINGLE MP4 FILES
    const downloadStrategies = [
      // Strategy 1: With cookies, force single merged MP4 file
      {
        name: 'cookies + single MP4',
        cookiesPath: this.cookiesPath,
        options: {
          output: outputFile,
          format: 'best[ext=mp4]/best[height<=720][ext=mp4]',
          noPlaylist: true,
          noWarnings: true,
          mergeOutputFormat: 'mp4'
        }
      },
      // Strategy 2: With cookies, H.264 MP4 with best quality
      {
        name: 'cookies + H.264 MP4',
        cookiesPath: this.cookiesPath,
        options: {
          output: outputFile,
          format: 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]',
          noPlaylist: true,
          noWarnings: true,
          mergeOutputFormat: 'mp4'
        }
      },
      // Strategy 3: Without cookies, force single merged MP4
      {
        name: 'no cookies + single MP4',
        cookiesPath: null,
        options: {
          output: outputFile,
          format: 'best[ext=mp4]/best[height<=720][ext=mp4]',
          noPlaylist: true,
          noWarnings: true,
          mergeOutputFormat: 'mp4'
        }
      },
      // Strategy 4: Without cookies, with geo-bypass
      {
        name: 'no cookies + geo-bypass',
        cookiesPath: null,
        options: {
          output: outputFile,
          format: 'best[ext=mp4]/best[height<=720][ext=mp4]',
          noPlaylist: true,
          noWarnings: true,
          geoBypass: true,
          mergeOutputFormat: 'mp4'
        }
      },
      // Strategy 5: Fallback - any available format
      {
        name: 'fallback - any format',
        cookiesPath: null,
        options: {
          output: outputFile,
          format: 'best',
          noPlaylist: true,
          noWarnings: true,
          mergeOutputFormat: 'mp4'
        }
      }
    ];

    let lastError;
    for (let i = 0; i < downloadStrategies.length; i++) {
      const strategy = downloadStrategies[i];
      try {
        console.log(`Attempting download strategy ${i + 1}: ${strategy.name}`);
        if (progressCallback) {
          progressCallback(`Trying download method ${i + 1}...`);
        }

        await execYtDlp(url, strategy.options, strategy.cookiesPath, progressCallback);
        console.log(`Download successful with strategy: ${strategy.name}`);

        // Check if download created separate files that need merging
        const mergedResult = await this.checkAndMergeSeparateFiles(outputDir, sanitizedTitle, outputFile);
        if (mergedResult) {
          console.log('Download created separate files, merged them successfully');
        }

        // Return absolute path since we're now using portable location relative to exe
        console.log(`Video downloaded to portable location: ${outputFile}`);
        return { filePath: outputFile, dir: outputDir, title: title, duration: duration, channel: channel };
      } catch (error) {
        console.warn(`Strategy ${strategy.name} failed: ${error.message}`);
        lastError = error;

        // Continue to next strategy if not the last one
        if (i < downloadStrategies.length - 1) {
          continue;
        }
      }
    }

    // If all strategies failed
    console.error(`All download strategies failed. Last error: ${lastError}`);
    throw new Error(`Download failed: ${lastError.message}`);
  }

  // Important Feature: Get Transcript for AI context
  async getTranscript(url) {
    // Use youtube-transcript library to get transcript
    // This is vital for Gemini to understand video content without watching (saves token)
    try {
      console.log("Fetching transcript...");
      const { YoutubeTranscript } = require('youtube-transcript');
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      console.log("Transcript successfully fetched!");
      return transcript.map(t => `${t.offset}: ${t.text}`).join('\n');
    } catch (e) {
      console.log("⚠️ Transcript not available - using fallback timestamps for AI analysis");
      return null;
    }
  }

  // Get formatted transcript in Processing Mode format using Apify
  async getProcessingModeTranscript(url) {
    try {
      console.log("Fetching transcript for Processing Mode using Apify...");

      // Get Apify API key from store
      const geminiStore = require('./geminiStore');
      const apiKey = await geminiStore.getApifyApiKey();

      if (!apiKey) {
        console.log("❌ No Apify API key configured");
        return null;
      }

      // Extract video ID from URL
      const videoIdMatch = url.match(/[?&]v=([^#\&\?]*)/);
      if (!videoIdMatch) {
        console.log("❌ Invalid YouTube URL - cannot extract video ID");
        return null;
      }

      const { ApifyClient } = require('apify-client');
      const client = new ApifyClient({
        token: apiKey,
      });

      // Prepare Actor input
      const input = {
        "youtube_url": url,
        "max_videos": 1
      };

      console.log("Running Apify actor for transcript extraction...");
      const run = await client.actor("Uwpce1RSXlrzF6WBA").call(input);

      console.log("Processing Apify results...");
      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      if (!items || items.length === 0) {
        console.log("⚠️ No transcript data found from Apify");
        return null;
      }

      const videoData = items[0];
      if (!videoData.transcript || videoData.transcript.length === 0) {
        console.log("⚠️ No transcript available for this video");
        return null;
      }

      console.log("Transcript successfully fetched from Apify!", videoData.transcript.length, "items");
      let formattedTranscript = '';

      videoData.transcript.forEach(item => {
        // Format timestamp as hours:minutes:seconds (e.g., 0:00:56, 0:01:23, 2:15:30)
        const totalSeconds = item.start;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);

        // Format: hours:minutes:seconds (all 2 digits)
        const timestampStr = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Inline format: timestamp text (seperti subtitle)
        formattedTranscript += `${timestampStr} ${item.text}\n`;
      });

      console.log("Formatted transcript length:", formattedTranscript.length);
      return formattedTranscript;
    } catch (e) {
      console.log("⚠️ Transcript not available for Processing Mode - video may not have transcripts or Apify error:", e.message);
      return null;
    }
  }



  // Extract video title from URL or metadata
  async extractVideoTitle(url) {
    try {
      // First try to extract video ID from URL
      const videoIdMatch = url.match(/[?&]v=([^#\&\?]*)/);
      if (!videoIdMatch) {
        return 'YouTube Video';
      }

      const videoId = videoIdMatch[1];

      // Use execYtDlp to get metadata without downloading - try multiple approaches
      try {
        console.log('Attempting to extract title using yt-dlp...');
        const output = await execYtDlp(url, {
          skipDownload: true,
          print: '%(title)s',
          noWarnings: true
        }, this.cookiesPath);

        if (output && output.trim()) {
          console.log('Title extracted successfully:', output.trim());
          return output.trim();
        } else {
          console.warn('yt-dlp returned empty title, trying alternative format...');
          // Try with different format specifier
          const altOutput = await execYtDlp(url, {
            skipDownload: true,
            print: '%(.title)s',
            noWarnings: true
          }, this.cookiesPath);

          if (altOutput && altOutput.trim()) {
            console.log('Title extracted with alternative format:', altOutput.trim());
            return altOutput.trim();
          }
        }
      } catch (error) {
        console.warn('yt-dlp title extraction failed:', error.message);
      }

      // Final fallback - construct title from video ID
      const fallbackTitle = `YouTube Video (${videoId.substring(0, 8)}...)`;
      console.log('Using fallback title:', fallbackTitle);
      return fallbackTitle;

    } catch (error) {
      console.warn('Error extracting video title:', error);
      return 'YouTube Video';
    }
  }

  // Check for and merge separate video/audio files that yt-dlp might have created
  async checkAndMergeSeparateFiles(outputDir, baseName, targetFile) {
    try {
      console.log('Checking for separate video/audio files to merge...');

      // Check if target file already exists and is valid
      if (fs.existsSync(targetFile)) {
        const stats = fs.statSync(targetFile);
        if (stats.size > 1000000) { // At least 1MB
          console.log('Target MP4 file already exists and is valid');
          return false; // No need to merge
        }
      }

      // Look for separate video and audio files with more flexible matching
      const files = fs.readdirSync(outputDir);

      // More flexible file matching - look for files that contain the baseName or are recent
      const videoFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return (f.includes(baseName.replace(/_/g, ' ')) || f.includes(baseName) || f.startsWith(baseName)) &&
               (ext === '.mp4' || ext === '.webm' || ext === '.m4v' || ext === '.avi');
      });

      const audioFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return (f.includes(baseName.replace(/_/g, ' ')) || f.includes(baseName) || f.startsWith(baseName)) &&
               (ext === '.m4a' || ext === '.aac' || ext === '.mp3' || ext === '.opus');
      });

      console.log(`Found ${videoFiles.length} video files and ${audioFiles.length} audio files`);
      console.log('Video files:', videoFiles);
      console.log('Audio files:', audioFiles);

      if (videoFiles.length > 0 && audioFiles.length > 0) {
        // Try to merge the first video and audio file found
        const videoFile = path.join(outputDir, videoFiles[0]);
        const audioFile = path.join(outputDir, audioFiles[0]);

        console.log(`Attempting to merge: ${videoFiles[0]} + ${audioFiles[0]}`);

        // Use ffmpeg to merge them
        const ffmpeg = require('fluent-ffmpeg');
        const ffmpegPath = getFfmpegPath();
        ffmpeg.setFfmpegPath(ffmpegPath);

        return new Promise((resolve) => {
          ffmpeg()
            .input(videoFile)
            .input(audioFile)
            .outputOptions(['-c:v', 'copy', '-c:a', 'aac', '-y'])
            .output(targetFile)
            .on('end', () => {
              console.log('Successfully merged separate video and audio files');

              // Clean up the separate files
              try {
                fs.unlinkSync(videoFile);
                fs.unlinkSync(audioFile);
                console.log('Cleaned up separate video and audio files');
              } catch (cleanupError) {
                console.warn('Failed to clean up separate files:', cleanupError);
              }

              resolve(true);
            })
            .on('error', (err) => {
              console.warn('Failed to merge separate files:', err);
              resolve(false);
            })
            .run();
        });
      } else if (videoFiles.length > 0 && audioFiles.length === 0) {
        // Only video file found - check if it's already playable
        const videoFile = path.join(outputDir, videoFiles[0]);
        try {
          const stats = fs.statSync(videoFile);
          if (stats.size > 1000000) {
            console.log('Found single video file that appears to be complete, renaming to target');
            fs.renameSync(videoFile, targetFile);
            return true;
          }
        } catch (error) {
          console.warn('Error checking single video file:', error);
        }
      }

      return false;
    } catch (error) {
      console.warn('Error checking for separate files:', error);
      return false;
    }
  }
}

module.exports = new VideoDownloader();
