const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Use fs.promises for async operations
const fssync = require('fs'); // For synchronous checks like existsSync
const { spawn } = require('child_process');
const isDev = process.env.NODE_ENV === 'development';

const ytDlpPath = require('../services/videoDownloader').getYtDlpPath?.() || 'yt-dlp';

// Import services
const geminiStore = require('../services/geminiStore');
const geminiService = require('../services/geminiService');
const videoDownloader = require('../services/videoDownloader');
const clipperAgent = require('../services/promptEngineer');
const videoCutter = require('../services/videoCutter');
const { YouTubeService } = require('../services/youtubeUpload');
const { TikTokService } = require('../services/tiktokUpload');
// processingStateManager removed due to module compatibility issues

// OAuth server for YouTube authentication
let oauthServerPort = null;
let oauthServer = null;
let oauthResolveCallback = null;

let mainWindow;
let previewWindow = null; // Global reference for video preview window
// Global variables for process management
let backendProcess = null;
let backendPid = null;
let cleanupAttempted = false;

// Start the Python backend executable
function startBackend() {
  try {
    // Check for onedir build first (folder containing executable)
    const backendDirPath = path.join(process.resourcesPath, 'autocaption');
    const fallbackDirPath = path.join(__dirname, '..', '..', 'backend', 'dist', 'autocaption');

    // Check for onefile build (single exe file)
    const backendExePath = path.join(process.resourcesPath, 'autocaption.exe');
    const fallbackExePath = path.join(__dirname, '..', '..', 'autocaption.exe');

    let exePath = null;
    let isOnedir = false;

    // Prioritize onedir build
    if (fssync.existsSync(backendDirPath) && fssync.statSync(backendDirPath).isDirectory()) {
      const exeInDir = path.join(backendDirPath, 'autocaption.exe');
      if (fssync.existsSync(exeInDir)) {
        exePath = exeInDir;
        isOnedir = true;
        console.log('Found onedir backend at:', backendDirPath);
      }
    } else if (fssync.existsSync(fallbackDirPath) && fssync.statSync(fallbackDirPath).isDirectory()) {
      const exeInDir = path.join(fallbackDirPath, 'autocaption.exe');
      if (fssync.existsSync(exeInDir)) {
        exePath = exeInDir;
        isOnedir = true;
        console.log('Found onedir backend at fallback:', fallbackDirPath);
      }
    }

    // Fallback to onefile if onedir not found
    if (!exePath) {
      exePath = (fssync.existsSync(backendExePath) ? backendExePath : fallbackExePath);
      console.log('Using onefile backend at:', exePath);
    }

    console.log('Looking for backend executable at:', exePath);

    if (!fssync.existsSync(exePath)) {
      console.error('Backend executable not found at:', exePath);
      console.log('Current directory:', process.cwd());
      console.log('Resources path:', process.resourcesPath);
      // Don't crash the app, just log the error
      return;
    }

    console.log('Starting backend executable:', exePath);

    // Spawn the backend process
    backendProcess = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      stdio: 'pipe',
      detached: false, // Keep the backend tied to the main app
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    // Handle backend output
    backendProcess.stdout.on('data', (data) => {
      console.log('Backend stdout:', data.toString());
    });

    backendProcess.stderr.on('data', (data) => {
      console.log('Backend stderr:', data.toString());
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
      if (code !== 0) {
        console.error(`Backend process exited with error code ${code}`);
      }
      backendProcess = null;
    });

    backendProcess.on('error', (error) => {
      console.error('Error starting backend process:', error);
      backendProcess = null;
    });

    console.log('Backend process started successfully');

  } catch (error) {
    console.error('Failed to start backend:', error);
    backendProcess = null;
  }
}

function startOAuthServer(basePort = 6033) {
  return new Promise(async (resolve, reject) => {
    const http = require('http');
    const url = require('url');
    const net = require('net');

    // Function to check if port is available
    const checkPortAvailable = (port) => {
      return new Promise((resolve) => {
        const server = net.createServer();

        server.listen(port, () => {
          server.once('close', () => {
            resolve(true);
          });
          server.close();
        });

        server.on('error', () => {
          resolve(false);
        });
      });
    };

    // Function to find available port
    const findAvailablePort = async (startPort, maxAttempts = 10) => {
      for (let i = 0; i < maxAttempts; i++) {
        const port = startPort + i;
        const available = await checkPortAvailable(port);
        if (available) {
          console.log(`Found available port: ${port}`);
          return port;
        }
      }
      throw new Error(`Unable to find available port after ${maxAttempts} attempts`);
    };

    // First, make sure we clean up any existing server
    stopOAuthServer();

    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      // Find available port
      const port = await findAvailablePort(basePort, 20);

      console.log(`Starting OAuth server on port ${port}...`);

      oauthServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const query = parsedUrl.query;

        // Handle OAuth callback
        if (pathname === '/api/auth/google/callback' || pathname === '/oauth2callback') {
          console.log('OAuth callback received for path:', pathname);
          console.log('Callback query params available:', Object.keys(query).length > 0);

          if (query.code) {
            console.log('Auth code received, length:', query.code.length);
          } else if (query.error) {
            console.log('Auth error received:', query.error);
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YouTube Authentication Complete</title>
  <!-- Mengimpor Font Modern -->
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-color: #10b981;
      --bg-gradient: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
    }

    body {
      font-family: 'Poppins', sans-serif;
      background: var(--bg-gradient);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      overflow: hidden;
    }

    /* Container dengan efek Glassmorphism */
    .container {
      text-align: center;
      background: rgba(255, 255, 255, 0.05);
      padding: 50px 40px;
      border-radius: 20px;
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      max-width: 400px;
      width: 90%;
      opacity: 0;
      transform: translateY(20px);
      animation: fadeInUp 0.8s ease-out forwards;
    }

    /* Animasi untuk Container */
    @keyframes fadeInUp {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Membuat Ikon Centang Animasi dengan CSS Murni */
    .checkmark-circle {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.2);
      margin: 0 auto 25px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .checkmark {
      width: 40px;
      height: 20px;
      border-left: 5px solid var(--primary-color);
      border-bottom: 5px solid var(--primary-color);
      transform: rotate(-45deg) translate(2px, -2px);
      opacity: 0;
      animation: checkPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.5s forwards;
    }

    @keyframes checkPop {
      0% { opacity: 0; transform: rotate(-45deg) scale(0); }
      100% { opacity: 1; transform: rotate(-45deg) scale(1); }
    }

    h1 {
      margin: 0 0 15px 0;
      color: white;
      font-size: 24px;
      font-weight: 600;
    }

    p {
      margin: 10px 0;
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.6;
    }

    .status-badge {
      display: inline-block;
      padding: 5px 15px;
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border-radius: 50px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 20px;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    /* Styling Countdown */
    .countdown-box {
      margin-top: 30px;
      font-size: 13px;
      color: #94a3b8;
    }

    #timer {
      font-weight: bold;
      color: white;
      font-size: 16px;
    }

    /* Tombol Manual Close (jika auto close gagal) */
    .btn-close {
      margin-top: 20px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      transition: background 0.3s;
    }

    .btn-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark-circle">
      <div class="checkmark"></div>
    </div>
    
    <div class="status-badge">Authenticated Successfully</div>
    
    <h1>YouTube Connected!</h1>
    <p>Akun YouTube Anda telah berhasil terhubung. Anda dapat kembali ke Auto Clipper AI sekarang.</p>
    
    <div class="countdown-box">
      Jendela ini akan tertutup otomatis dalam <span id="timer">5</span> detik...
    </div>

    <button class="btn-close" onclick="window.close()">Tutup Sekarang</button>
  </div>

  <script>
    let timeLeft = 5;
    const timerElement = document.getElementById('timer');
    const closeBtn = document.querySelector('.btn-close');

    // Fungsi Hitung Mundur
    const countdown = setInterval(() => {
      timeLeft--;
      timerElement.textContent = timeLeft;

      if (timeLeft <= 0) {
        clearInterval(countdown);
        closeWindow();
      }
    }, 1000);

    // Fungsi Tutup Jendela
    function closeWindow() {
      // Mencoba menutup jendela
      window.close();
      
      // Jika browser memblokir window.close(), ubah teks untuk memberitahu user
      setTimeout(() => {
        if (!window.closed) {
          document.querySelector('.countdown-box').innerHTML = "Browser mencegah penutupan otomatis.<br>Silakan tutup tab ini secara manual.";
          closeBtn.style.background = "#ef4444"; // Ubah tombol jadi merah
        }
      }, 500); 
    }
  </script>
</body>
</html>
          `);

          // Handle the authentication
          try {
            if (query.code) {
              console.log('Exchanging authorization code for tokens...');
              console.log('OAuth code details - length:', query.code.length, 'type:', typeof query.code);
              console.log('All query params:', JSON.stringify(query, null, 2));

              // Parse state parameter to get reauth account ID if present
              let currentReauthAccountId = null;
              if (query.state) {
                try {
                  const decodedState = JSON.parse(Buffer.from(query.state, 'base64').toString('ascii'));
                  currentReauthAccountId = decodedState.accountId; // From YouTubeUpload.jsx
                  console.log('Found reauth account ID in state:', currentReauthAccountId);
                } catch (stateError) {
                  console.log('No valid state found, treating as new account');
                }
              }

              const callbackUrl = `http://localhost:${oauthServerPort}/api/auth/google/callback`;
              console.log('About to call handleAuthCallback with code:', query.code.substring(0, 10) + '...', 'and callbackUrl:', callbackUrl);
              let result = null;
              try {
                result = await YouTubeService.handleAuthCallback(query.code, currentReauthAccountId, callbackUrl);
                console.log('handleAuthCallback completed successfully, result type:', typeof result);
              } catch (handleError) {
                console.error('handleAuthCallback failed:', handleError.message);
                console.error('handleAuthCallback full error:', handleError);
                throw handleError;
              }

              // Only proceed with result if it's defined to prevent ReferenceError
              if (result) {
                if (oauthResolveCallback) {
                  oauthResolveCallback(result);
                  oauthResolveCallback = null;
                }

                // Notify the main window about the successful authentication
                mainWindow.webContents.send('youtube-auth-success', result);
              } else {
                console.error('handleAuthCallback succeeded but returned null/undefined result');
                if (oauthResolveCallback) {
                  oauthResolveCallback(null);
                  oauthResolveCallback = null;
                }
                mainWindow.webContents.send('youtube-auth-error', 'Authentication completed but invalid response');
              }
            } else if (query.error) {
              console.error('OAuth error:', query.error);
              if (oauthResolveCallback) {
                oauthResolveCallback(null);
                oauthResolveCallback = null;
              }
              mainWindow.webContents.send('youtube-auth-error', query.error);
            }
          } catch (error) {
            console.error('Error handling OAuth callback:', error);
            if (oauthResolveCallback) {
              oauthResolveCallback(null);
              oauthResolveCallback = null;
            }
            mainWindow.webContents.send('youtube-auth-error', error.message);
          }

          // Stop the server after handling the callback
          setTimeout(stopOAuthServer, 1000);

        } else {
          // Handle other requests
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      oauthServer.listen(port, (err) => {
        if (err) {
          console.error('Failed to start OAuth server:', err);
          reject(err);
        } else {
          console.log(`OAuth server successfully started on port ${port}`);
          oauthServerPort = port;
          resolve(port);
        }
      });

      oauthServer.on('error', (err) => {
        console.error('OAuth server error:', err);
        reject(err);
      });

    } catch (error) {
      console.error('Error finding available port:', error);
      reject(error);
    }
  });
}

function stopOAuthServer() {
  if (oauthServer) {
    oauthServer.close(() => {
      console.log('OAuth server stopped');
      oauthServer = null;
      oauthServerPort = null;
    });
  }
}

// Register IPC handlers immediately on module load
// File operation handlers - must be registered before app.whenReady()
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    const { shell } = require('electron');
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
});

// Video preview handler - opens video in Electron window
ipcMain.handle('open-video-preview', async (event, filePath) => {
  try {
    // Close existing preview window if any
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close();
    }

    // Create a new window for video preview
    previewWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 400,
      minHeight: 300,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: false, // Allow local file access
        allowRunningInsecureContent: true
      },
      title: `Video Preview - ${path.basename(filePath)}`,
      icon: path.join(process.resourcesPath, 'icon.ico'),
      modal: false,
      show: false, // Don't show until ready
      autoHideMenuBar: true // Hide File, Edit, View, etc. menus
    });

    // Load HTML content for video player
    const videoHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Video Preview</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              background: #000;
              overflow: hidden;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .video-container {
              position: relative;
              width: 100vw;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-direction: column;
            }
            video {
              max-width: 100%;
              max-height: 100%;
              outline: none;
            }
            .controls {
              position: absolute;
              bottom: 20px;
              left: 50%;
              transform: translateX(-50%);
              display: flex;
              justify-content: center;
              gap: 15px;
              background: rgba(0, 0, 0, 0.7);
              padding: 12px 20px;
              border-radius: 8px;
              backdrop-filter: blur(10px);
            }
            .control-btn {
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              color: white;
              border-radius: 6px;
              padding: 8px 16px;
              cursor: pointer;
              font-size: 14px;
              transition: all 0.2s;
            }
            .control-btn:hover {
              background: rgba(255, 255, 255, 0.2);
            }
            .control-btn:focus {
              outline: 2px solid #00f2ff;
            }
            .fullscreen-btn {
              margin-left: 10px;
              background: #00f2ff !important;
              color: black !important;
            }
            .loading {
              color: white;
              font-size: 18px;
              text-align: center;
              margin-bottom: 20px;
            }
            @media (max-width: 640px) {
              .controls {
                flex-wrap: wrap;
              }
              .control-btn {
                flex: 1;
                min-width: 80px;
              }
            }
          </style>
        </head>
        <body>
          <div class="video-container">
            <div class="loading" id="loading">Memuat video...</div>
            <video id="videoPlayer" controls preload="metadata">
              <source src="file:///${filePath.replace(/\\/g, '/')}" type="video/mp4">
              Browser Anda tidak mendukung pemutaran video.
            </video>
            <div class="controls">
              <button class="control-btn" onclick="document.getElementById('videoPlayer').play()">▶ Putar</button>
              <button class="control-btn" onclick="document.getElementById('videoPlayer').pause()">⏸ Jeda</button>
              <button class="control-btn" onclick="toggleFullscreen()">⛶ Fullscreen</button>
            </div>
          </div>
          <script>
            const video = document.getElementById('videoPlayer');
            const loading = document.getElementById('loading');

            video.addEventListener('loadeddata', () => {
              // Resize window based on video dimensions after it's loaded
              const videoWidth = video.videoWidth;
              const videoHeight = video.videoHeight;

              console.log('Video dimensions:', videoWidth, 'x', videoHeight);

              if (videoWidth > 0 && videoHeight > 0) {
                electronAPI.resizePreviewWindow({ width: videoWidth, height: videoHeight });
              }
            });

            video.addEventListener('loadedmetadata', () => {
              loading.style.display = 'none';
              video.style.display = 'block';
            });

            video.addEventListener('error', () => {
              loading.innerHTML = 'Error loading video';
            });

            function toggleFullscreen() {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
              } else {
                document.exitFullscreen();
              }
            }

            // Handle ESC to close window or exit fullscreen
            document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape' || e.key === 'Esc') {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                } else {
                  electronAPI.closePreviewWindow();
                }
              }
            });

            // Handle click outside video area to close window
            document.addEventListener('click', (e) => {
              const videoContainer = document.querySelector('.video-container');
              const controls = document.querySelector('.controls');

              // If click is outside the video container and not on controls, close window
              if (!videoContainer.contains(e.target) && !controls.contains(e.target)) {
                electronAPI.closePreviewWindow();
              }
            });
          </script>
        </body>
      </html>
    `;

    previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(videoHtml)}`);

    // Handle window close
    previewWindow.on('closed', () => {
      previewWindow = null;
    });

    // Show window when ready
    previewWindow.once('ready-to-show', () => {
      previewWindow.show();
    });

    return { success: true };
  } catch (error) {
    console.error('Error opening video preview:', error);
    throw error;
  }
});

// Close preview window handler
ipcMain.handle('close-preview-window', async () => {
  try {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close();
      previewWindow = null;
      return { success: true };
    }
    return { success: false, message: 'No preview window to close' };
  } catch (error) {
    console.error('Error closing preview window:', error);
    return { success: false, message: error.message };
  }
});

// Resize preview window handler - adjusts window size based on video aspect ratio
ipcMain.handle('resize-preview-window', async (event, dimensions) => {
  try {
    if (!previewWindow || previewWindow.isDestroyed()) {
      return { success: false, message: 'No preview window available' };
    }

    const { width, height } = dimensions;

    // Calculate aspect ratio
    const aspectRatio = width / height;

    // Set minimum and maximum sizes
    const minSize = 400;
    const maxSize = 1200;

    let newWidth, newHeight;

    if (width > height) {
      // Horizontal video (16:9 typical)
      newWidth = Math.min(Math.max(width, minSize), maxSize);
      newHeight = Math.round(newWidth / aspectRatio);
    } else {
      // Vertical video (9:16 typical) or square
      newHeight = Math.min(Math.max(height, minSize), maxSize);
      newWidth = Math.round(newHeight * aspectRatio);
    }

    // Ensure minimum sizes
    newWidth = Math.max(newWidth, minSize);
    newHeight = Math.max(newHeight, minSize);

    // Add some padding for controls
    newHeight += 100; // Extra space for controls

    console.log(`Resizing preview window: ${newWidth}x${newHeight} (aspect ratio: ${aspectRatio.toFixed(2)})`);

    // Resize window
    previewWindow.setSize(newWidth, newHeight);

    // Center window on screen
    previewWindow.center();

    return { success: true, size: { width: newWidth, height: newHeight } };
  } catch (error) {
    console.error('Error resizing preview window:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    const { shell } = require('electron');
    await shell.showItemInFolder(folderPath);
    return { success: true };
  } catch (error) {
    console.error('Error opening folder:', error);
    throw error;
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
});

// Migration function to move data from AppData to portable location
async function migrateDataToPortable() {
  try {
    const appDataPath = app.getPath('userData');
    const exeDir = path.dirname(process.execPath);
    const portableDataDir = path.join(exeDir, 'data');

    console.log('🔄 Starting data migration check...');
    console.log('📁 AppData path:', appDataPath);
    console.log('📁 Portable data dir:', portableDataDir);

    // Check if portable data directory already exists and has data
    const portableDbPath = path.join(portableDataDir, 'autocliper.db');
    console.log('📁 Portable DB path:', portableDbPath);
    console.log('📁 Portable DB exists:', fssync.existsSync(portableDbPath));

    if (fssync.existsSync(portableDbPath)) {
      console.log('Portable database already exists, skipping migration');
      return;
    }

    // Check if old AppData directory exists
    const oldDataDir = path.join(appDataPath, 'autocliper');
    if (!fssync.existsSync(oldDataDir)) {
      console.log('No old AppData directory found, skipping migration');
      return;
    }

    console.log('🔄 Starting data migration from AppData to portable location...');

    // Create portable data directory
    if (!fssync.existsSync(portableDataDir)) {
      fssync.mkdirSync(portableDataDir, { recursive: true });
    }

    // Copy entire data directory from AppData to portable location
    const oldDataPath = path.join(oldDataDir, 'data');
    if (fssync.existsSync(oldDataPath)) {
      console.log('Copying data directory from AppData...');
      await copyDirectoryRecursive(oldDataPath, path.join(portableDataDir, 'data'));
    }

    // Copy database file if it exists in AppData (try multiple possible locations)
    const possibleOldDbPaths = [
      path.join(appDataPath, 'autocliper.db'), // Old root location
      path.join(appDataPath, 'autocliper', 'autocliper.db'), // Old autocliper folder location
      path.join(appDataPath, 'autocliper', 'data', 'autocliper.db') // Current AppData fallback location
    ];

    for (const oldDbPath of possibleOldDbPaths) {
      if (fssync.existsSync(oldDbPath)) {
        console.log('Found old database file at:', oldDbPath);
        console.log('Copying database file from AppData...');
        await fs.copyFile(oldDbPath, portableDbPath);

        // After copying, try to remove the old file
        try {
          await fs.unlink(oldDbPath);
          console.log('Removed old database file:', oldDbPath);
        } catch (removeError) {
          console.warn('Could not remove old database file:', oldDbPath, removeError.message);
        }
        break; // Only copy from the first location found
      }
    }

    // Update paths in database to reflect new portable location
    await updateDatabasePaths(oldDataPath, portableDataDir);

    console.log('✅ Data migration completed successfully!');
    console.log('📁 Old location:', oldDataDir);
    console.log('📁 New location:', portableDataDir);

  } catch (error) {
    console.error('❌ Data migration failed:', error);
  }
}

// Helper function to copy directory recursively
async function copyDirectoryRecursive(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// Update stored paths in database to reflect new portable location
async function updateDatabasePaths(oldBasePath, newBasePath) {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const portableDbPath = path.join(newBasePath, 'autocliper.db');

    if (!fssync.existsSync(portableDbPath)) {
      console.log('No portable database found to update');
      return;
    }

    const db = new sqlite3.Database(portableDbPath);
    console.log('Updating database paths...');

    // Update video_status table paths
    db.all("SELECT id, video_path FROM video_status", (err, rows) => {
      if (err) {
        console.error('Error reading video_status:', err);
        return;
      }

      rows.forEach(row => {
        const oldPath = row.video_path;
        if (oldPath && oldPath.includes(oldBasePath)) {
          const newPath = oldPath.replace(oldBasePath, path.join(newBasePath, 'data'));
          db.run("UPDATE video_status SET video_path = ? WHERE id = ?", [newPath, row.id], (updateErr) => {
            if (updateErr) {
              console.error('Error updating video_status path:', updateErr);
            } else {
              console.log(`Updated video_status path: ${oldPath} -> ${newPath}`);
            }
          });
        }
      });
    });

    // Update clipper_sessions table paths
    db.all("SELECT id, video_info FROM clipper_sessions", (err, rows) => {
      if (err) {
        console.error('Error reading clipper_sessions:', err);
        return;
      }

      rows.forEach(row => {
        try {
          const videoInfo = JSON.parse(row.video_info);
          let updated = false;

          // Update filePath in videoInfo
          if (videoInfo.filePath && videoInfo.filePath.includes(oldBasePath)) {
            videoInfo.filePath = videoInfo.filePath.replace(oldBasePath, path.join(newBasePath, 'data'));
            updated = true;
          }

          if (updated) {
            const newVideoInfo = JSON.stringify(videoInfo);
            db.run("UPDATE clipper_sessions SET video_info = ? WHERE id = ?", [newVideoInfo, row.id], (updateErr) => {
              if (updateErr) {
                console.error('Error updating clipper_sessions path:', updateErr);
              } else {
                console.log(`Updated clipper_sessions video_info for session ${row.id}`);
              }
            });
          }
        } catch (parseErr) {
          console.error('Error parsing video_info JSON:', parseErr);
        }
      });
    });

    // Close database after a short delay to allow async operations to complete
    setTimeout(() => {
      db.close((closeErr) => {
        if (closeErr) {
          console.error('Error closing database:', closeErr);
        } else {
          console.log('Database paths updated and closed');
        }
      });
    }, 1000);

  } catch (error) {
    console.error('Error updating database paths:', error);
  }
}

// Initialize database and load settings
(async () => {
  try {
    // For portable builds, migrate data from AppData first
    if (!isDev) {
      await migrateDataToPortable();

      // Additional check: if portable database exists but we still have old AppData database, force migration
      const exeDir = path.dirname(process.execPath);
      const portableDataDir = path.join(exeDir, 'data');
      const portableDbPath = path.join(portableDataDir, 'autocliper.db');

      const appDataPath = app.getPath('userData');
      const oldDbPaths = [
        path.join(appDataPath, 'autocliper.db'),
        path.join(appDataPath, 'autocliper', 'autocliper.db'),
        path.join(appDataPath, 'autocliper', 'data', 'autocliper.db')
      ];

      // Check if portable DB exists and any old DB still exists
      if (fssync.existsSync(portableDbPath)) {
        for (const oldDbPath of oldDbPaths) {
          if (fssync.existsSync(oldDbPath) && oldDbPath !== portableDbPath) {
            console.log('Found old database file that should be cleaned up:', oldDbPath);
            try {
              await fs.unlink(oldDbPath);
              console.log('Cleaned up old database file:', oldDbPath);
            } catch (cleanupError) {
              console.warn('Could not clean up old database file:', oldDbPath, cleanupError.message);
            }
          }
        }
      }
    }

    // Set DB path untuk Electron
    let dbPath;
    if (!isDev) {
      // Use portable database path with fallback to AppData if exe directory is not writable
      const exeDir = path.dirname(process.execPath);
      const portableDataDir = path.join(exeDir, 'data');
      const portableDbPath = path.join(portableDataDir, 'autocliper.db');

      // Check if we can write to the portable location
      let canWriteToPortable = false;
      try {
        // Try to create the data directory
        if (!fssync.existsSync(portableDataDir)) {
          fssync.mkdirSync(portableDataDir, { recursive: true });
        }

        // Try to write a test file to check write permissions
        const testFile = path.join(portableDataDir, 'write_test.tmp');
        fssync.writeFileSync(testFile, 'test');
        fssync.unlinkSync(testFile); // Clean up test file
        canWriteToPortable = true;
        console.log('Portable data directory is writable');
      } catch (error) {
        console.warn('Portable data directory is not writable, falling back to AppData:', error.message);
        canWriteToPortable = false;
      }

      if (canWriteToPortable) {
        dbPath = portableDbPath;
        console.log('Using portable database path:', dbPath);
      } else {
        // Try to force create portable directory even if permission check failed
        console.warn('Permission check failed, attempting to force create portable directory...');
        try {
          if (!fssync.existsSync(portableDataDir)) {
            fssync.mkdirSync(portableDataDir, { recursive: true });
          }

          // Try to create database file directly to test write access
          const testDbPath = path.join(portableDataDir, 'test_write.db');
          const sqlite3 = require('sqlite3').verbose();
          const testDb = new sqlite3.Database(testDbPath, (err) => {
            if (!err) {
              testDb.close((closeErr) => {
                // Clean up test file
                try {
                  fssync.unlinkSync(testDbPath);
                } catch (unlinkErr) {
                  console.warn('Could not clean up test database file:', unlinkErr.message);
                }
              });
              dbPath = portableDbPath;
              console.log('Successfully forced portable database path:', dbPath);
            } else {
              throw new Error('Database creation test failed: ' + err.message);
            }
          });
        } catch (forceError) {
          console.error('Failed to force create portable database, this should not happen:', forceError.message);
          // Only as absolute last resort, show error instead of falling back to AppData
          throw new Error('Cannot create portable database directory. Please check permissions on the application folder.');
        }
      }

      await geminiStore.setDbPath(dbPath);

      // Migrate development database to production on first run
      try {
        // Check if production DB already has data
        const existingApis = await geminiStore.getAllApis();
        if (existingApis.length === 0) {
          console.log('Checking for development database to migrate...');

          // Try to migrate from development SQLite database
          const devDbPath = path.join(__dirname, '..', '..', 'db.db');
          if (fssync.existsSync(devDbPath)) {
            console.log('Found development database, attempting migration...');

            // Create a temporary instance of sqlite3 to read the development database
            const sqlite3 = require('sqlite3').verbose();
            const devDb = new sqlite3.Database(devDbPath);

            devDb.all("SELECT id, api_key as apiKey, created_at as createdAt, status || ' (migrated)' as status FROM gemini_apis ORDER BY created_at DESC", async (err, rows) => {
              if (err) {
                console.error('Error reading development database:', err);
              } else if (rows && rows.length > 0) {
                console.log(`Found ${rows.length} API keys in development database, migrating...`);

                // Insert each API key into the production database
                for (const api of rows) {
                  if (api.apiKey && api.apiKey.trim()) {
                    try {
                      await new Promise((resolve, reject) => {
                        geminiStore.db.run(
                          "INSERT INTO gemini_apis (id, api_key, created_at, status) VALUES (?, ?, ?, 'active')",
                          [Date.now() + Math.random(), api.apiKey, new Date().toISOString()],
                          function(err) {
                            if (err) {
                              reject(err);
                            } else {
                              resolve();
                            }
                          }
                        );
                      });
                      console.log(`✅ Migrated API key: ${api.apiKey.substring(0, 10)}...`);
                    } catch (migrateError) {
                      console.warn(`⚠️ Failed to migrate API key: ${api.apiKey.substring(0, 10)}...`, migrateError.message);
                    }
                  }
                }
                console.log('✅ Database migration completed!');
              } else {
                console.log('No API keys found in development database');
              }
              devDb.close();
            });
          } else {
            console.log('No development database found at db.db');
          }
        } else {
          console.log('Production database already has API keys, skipping migration');
        }
      } catch (migrationError) {
        console.error('Database migration failed:', migrationError);
      }

    } else {
      // For development, use same appdata path
      dbPath = path.join(app.getPath('userData'), 'autocliper.db');
      await geminiStore.setDbPath(dbPath);
    }

    // Load cookies path from database
    try {
      const cookiesPath = await geminiStore.getCookiesPath();
      if (cookiesPath) {
        console.log('Loading cookies path:', cookiesPath);
        videoDownloader.setCookiesPath(cookiesPath);
      }
    } catch (cookiesError) {
      console.warn('Error loading cookies path:', cookiesError);
    }

  } catch (error) {
    console.error('Database initialization failed:', error);
  }
})();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    minWidth: 800,
    minHeight: 600,
    resizable: false,
    maximizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    // Remove hidden title bar to allow normal window behavior
     titleBarStyle: 'hidden',
     titleBarOverlay: {
       color: '#000000',
       symbolColor: '#00f2ff'
     },
    title: 'Auto Clipper AI',
    show: true // Don't show until ready
  });

  // Always load the built React app in development or production
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'build', 'index.html'));
  // Disable DevTools opening to prevent console noise
  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(async () => {
  // Set global app reference for services that need access to app.getPath()
  global.app = app;

  // Start backend before creating window
  console.log('Starting backend process...');
  startBackend();

  // Give backend a moment to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Then create main window
  console.log('Creating main window...');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// BRUTAL FORCE cleanup - kill ALL autocaption.exe processes globally
const brutalCleanup = () => {
  if (cleanupAttempted) return; // Prevent multiple cleanup attempts
  cleanupAttempted = true;
  console.log('🔥 EXECUTING BRUTAL FORCE CLEANUP FOR autocaption.exe');

  const { execSync, spawnSync } = require('child_process');

  // Method 1: Windows taskkill - KILL ALL autocaption.exe processes globally
  if (process.platform === 'win32') {
    try {
      console.log('🚨 Method 1: taskkill /IM autocaption.exe /F /T');
      const result = execSync('taskkill /IM autocaption.exe /F /T 2>nul', { encoding: 'utf8' });
      console.log('✅ taskkill result:', result || 'Command executed successfully');
    } catch (e) {
      console.log('⚠️ taskkill failed or no processes found:', e.message);
    }

    // Method 2: Force kill by Process Name via PowerShell
    try {
      console.log('🚨 Method 2: PowerShell Force Kill');
      const psCommand = `Get-Process autocaption -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`;
      const result = execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: 'utf8' });
      console.log('✅ PowerShell kill result:', result || 'Command executed');
    } catch (e) {
      console.log('⚠️ PowerShell kill failed:', e.message);
    }

    // Method 3: wmic process termination
    try {
      console.log('🚨 Method 3: WMIC Force Kill');
      const wmicCommand = 'wmic process where name="autocaption.exe" delete /quiet';
      const result = execSync(wmicCommand, { encoding: 'utf8' });
      console.log('✅ WMIC kill result:', 'Executed successfully');
    } catch (e) {
      console.log('⚠️ WMIC kill failed:', e.message);
    }

    // Method 4: Verify and kill any remaining via PID
    if (backendPid) {
      try {
        console.log('🚨 Method 4-5: PID-based Direct Kill for PID:', backendPid);
        // Kill by PID
        execSync(`taskkill /PID ${backendPid} /F 2>nul`);
        console.log(`✅ Killed process with PID ${backendPid}`);
      } catch (e) {
        console.log(`⚠️ Failed to kill PID ${backendPid}:`, e.message);
      }

      try {
        // Kill process tree by PID
        execSync(`taskkill /PID ${backendPid} /T /F 2>nul`);
        console.log(`✅ Killed process tree with PID ${backendPid}`);
      } catch (e) {
        console.log(`⚠️ Failed to kill process tree PID ${backendPid}:`, e.message);
      }
    }
  } else {
    // Unix systems
    try {
      execSync('pkill -9 -f autocaption.exe');
      console.log('✅ Unix pkill executed');
    } catch (e) {
      console.log('⚠️ Unix pkill failed:', e.message);
    }
  }

  // Final verification - LOG all remaining processes
  if (process.platform === 'win32') {
    try {
      const checkCmd = execSync('tasklist /FI "IMAGENAME eq autocaption.exe" /FO CSV', { encoding: 'utf8' });
      if (checkCmd.includes('autocaption.exe')) {
        console.log('🚨 CRITICAL: autocaption.exe STILL EXISTS AFTER BRUTAL CLEANUP!');
        console.log('Remaining processes:', checkCmd);

        // LAST RESORT: Re-run taskkill with explicit path
        try {
          execSync('taskkill /F /IM autocaption.exe /T >nul 2>&1');
          console.log('🏁 Emergency kill attempted');
        } catch (e) {
          console.log('💀 Emergency kill failed - process may require system restart');
        }
      } else {
        console.log('🎉 SUCCESS: No autocaption.exe processes found after cleanup');
      }
    } catch (e) {
      console.log('ℹ️ No autocaption.exe processes detected in verification');
    }
  }

  // Reset flags
  backendProcess = null;
  backendPid = null;
  console.log('🔥 BRUTAL FORCE CLEANUP COMPLETED');
};

// Traditional cleanup as backup
const cleanupProcesses = async () => {
  console.log('🔄 Starting regular cleanup process...');

  // Stop OAuth server
  try {
    stopOAuthServer();
    console.log('✓ OAuth server stopped');
  } catch (err) {
    console.warn('Error stopping OAuth server:', err);
  }

  // Kill backend process normally first
  if (backendProcess) {
    const backendPid = backendProcess.pid;
    console.log('💥 Killing backend process (autocaption.exe)... PID:', backendPid);

    // Try normal kill
    try {
      backendProcess.kill('SIGTERM');
      console.log('🟡 SIGTERM sent');
    } catch (e) {
      console.warn('SIGTERM failed:', e.message);
    }

    try {
      backendProcess.kill('SIGKILL');
      console.log('🚨 SIGKILL sent');
    } catch (e) {
      console.warn('SIGKILL failed:', e.message);
    }
  }

  // Always execute brutal cleanup regardless
  console.log('🏁 Executing global autocaption.exe cleanup...');
  brutalCleanup();

  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('🏁 Cleanup process completed');
};

app.on('before-quit', () => {
  console.log('EVENT: before-quit triggered - app closing...');
  cleanupProcesses();
});

app.on('will-quit', () => {
  console.log('EVENT: will-quit triggered - final cleanup...');
  cleanupProcesses();
});

app.on('quit', () => {
  console.log('EVENT: quit triggered - app fully closed');
  cleanupProcesses();
});

// Handle uncaught exceptions to ensure server cleanup
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  stopOAuthServer();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  stopOAuthServer();
  process.exit(1);
});

// IPC Handlers with complete functionality included
ipcMain.handle('start-process', async (event, options) => {
  try {
    // Support both old format (string url) and new format (options object)
    const processOptions = typeof options === 'string' ? { url: options, mode: 'ai' } : options;
    const { url, mode, jsonClips } = processOptions;

    // Handle Processing Mode - fetch transcript and save to file
    if (mode === 'processing_mode') {
      const progressCallback = (progress) => {
        console.log('Auto Transcript: progressCallback called with:', progress, typeof progress); // Debug logging
        // Ensure progress is a valid string before sending
        if (progress && typeof progress === 'string' && progress.trim()) {
          console.log('Auto Transcript: sending progress message to frontend:', progress); // Debug logging
          mainWindow.webContents.send('progress', progress);
        } else {
          console.log('Auto Transcript: filtered out invalid progress:', progress); // Debug logging
        }
      };

      console.log('Auto Transcript mode: calling progressCallback for initial message'); // Debug logging
      progressCallback('Starting Auto Transcript mode...');

      try {
        progressCallback('Fetching transcript using Apify...');
        console.log('Fetching transcript for Processing Mode using Apify...');
        const transcript = await videoDownloader.getProcessingModeTranscript(url);
        progressCallback('Processing Apify results...');
        console.log('Processing Apify results...');

        progressCallback(`Transcript successfully fetched! ${transcript ? transcript.split('\n').length : 0} lines retrieved`);

        let transcriptFilePath = null;
        let videoTitle = 'Processing Mode Transcript';

        // Save transcript to file if available
        if (transcript) {
          progressCallback('Saving transcript to file...');

          // Extract video ID from URL for filename
          const videoIdMatch = url.match(/[?&]v=([^#\&\?]*)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown_video';

        // Create transcripts directory
        const exeDir = path.dirname(process.execPath);
        const transcriptsDir = path.join(exeDir, 'data', 'transcripts');
          if (!fssync.existsSync(transcriptsDir)) {
            await fs.mkdir(transcriptsDir, { recursive: true });
          }

          // Generate unique filename with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
          const sanitizedVideoId = videoId.substring(0, 20); // Limit length
          const fileName = `transcript_${sanitizedVideoId}_${timestamp}.txt`;
          transcriptFilePath = path.join(transcriptsDir, fileName);

          // Write transcript to file
          await fs.writeFile(transcriptFilePath, transcript, 'utf8');

          // Try to get video title
          try {
            videoTitle = await videoDownloader.extractVideoTitle(url);
          } catch (titleError) {
            console.warn('Could not extract video title for Processing Mode:', titleError.message);
          }

          progressCallback('Transcript saved successfully');
        }

        const transcriptContent = transcript || 'No transcript available for this video. The video may not have subtitles/captions.';

        return {
          videoInfo: {
            url: url,
            title: videoTitle,
            transcript: transcriptContent,
            filePath: transcriptFilePath, // Include file path for saved transcript
            transcriptSaved: !!transcript, // Flag indicating if transcript was saved
            downloadedAt: new Date().toISOString()
          },
          message: transcript ?  `Processing Mode transcript fetched and saved to: ${transcriptFilePath}` :
            'Processing Mode completed - no transcript available'
        };
      } catch (error) {
        console.error('Processing Mode error:', error);
        throw error;
      }
    }

    const jobId = Date.now().toString();
    const progressCallback = (progress) => {
      console.log('AI Mode: progressCallback called with:', progress, typeof progress); // Debug logging
      // Ensure progress is a valid string before sending
      if (progress && typeof progress === 'string' && progress.trim()) {
        console.log('AI Mode: sending progress message to frontend:', progress); // Debug logging
        mainWindow.webContents.send('progress', progress);
      } else {
        console.log('AI Mode: filtered out invalid progress:', progress); // Debug logging
      }
    };
    console.log('AI Mode: starting process'); // Debug logging

    let videoTitle, videoDuration, downloadResult, suggestedClips, transcript = null;

    // Transcript fetching will be handled individually by each mode
    // AI mode will fetch its own transcript later

    if (mode === 'manual') {
      // Manual mode: Download video first, then parse JSON clips
      progressCallback('Starting video download for manual mode...');
      downloadResult = await videoDownloader.downloadVideo(url, jobId, progressCallback);
      progressCallback('Video downloaded successfully');

      // Extract title and duration
      videoTitle = downloadResult.title;
      videoDuration = downloadResult.duration;
      progressCallback(`Title extracted: ${videoTitle}${videoDuration ? ` (${Math.round(videoDuration / 60)}min)` : ''}`);

      // Parse provided JSON clips
      progressCallback('Processing manual clip data...');
      try {
        suggestedClips = JSON.parse(jsonClips);

        if (!Array.isArray(suggestedClips)) {
          throw new Error('Clip data must be a JSON array');
        }

        // Validate structure of clips
        for (let i = 0; i < suggestedClips.length; i++) {
          const clip = suggestedClips[i];
          if (!clip.start || !clip.end) {
            throw new Error(`Clip ${i + 1} missing start or end time`);
          }
          if (typeof clip.virality_score !== 'number') {
            clip.virality_score = 8; // Default score
          }
          if (!clip.reason) {
            clip.reason = 'Manual clip';
          }
          if (!clip.suggested_caption) {
            clip.suggested_caption = `Clip ${i + 1}`;
          }
        }

        progressCallback('Manual clip data processed successfully');
      } catch (parseError) {
        throw new Error(`Invalid clip data JSON: ${parseError.message}`);
      }
    } else {
      // AI mode: Get transcript first using Processing Mode method
      progressCallback('Fetching video transcript for AI analysis (using Processing Mode)...');
      try {
        transcript = await videoDownloader.getProcessingModeTranscript(url);
        progressCallback('Transcript retrieved successfully - preparing for AI analysis');
      } catch (transcriptError) {
        console.log('Transcript not available:', transcriptError.message);
        transcript = null; // Ensure it's null not undefined
        progressCallback('Transcript not available - cannot perform AI analysis');
      }

      // If no transcript, stop processing and notify user
      if (!transcript) {
        progressCallback('❌ AI analysis cancelled - video has no transcript');
        mainWindow.webContents.send('notification', {
          type: 'error',
          title: 'Transcript Required for AI Analysis',
          message: 'This video does not have a transcript. AI clip generation requires a transcript to analyze the video content. Please choose a video with subtitles/captions or use Manual mode instead.'
        });

        // Return early without downloading video or attempting AI analysis
        return {
          videoInfo: {
            url: url,
            title: 'Video without transcript',
            transcript: null,
            error: 'No transcript available for AI analysis',
            downloadedAt: new Date().toISOString()
          },
          message: 'Processing cancelled - video has no transcript available for AI analysis'
        };
      }

      // Extract title and duration first (before downloading)
      let videoTitle = 'YouTube Video';
      let videoDuration = null;
      try {
        progressCallback('Extracting video title for AI analysis...');
        const extractedTitle = await videoDownloader.extractVideoTitle(url);

        // Ensure we have a valid title
        if (extractedTitle && extractedTitle.trim() && extractedTitle !== 'YouTube Video') {
          videoTitle = extractedTitle.trim();
          progressCallback(`Title extracted: ${videoTitle} - proceeding with AI analysis`);
        } else {
          // Title extraction failed or returned generic title
          console.warn('Title extraction returned empty or generic result, using fallback');
          // Extract video ID for better fallback
          const videoIdMatch = url.match(/[?&]v=([^#\&\?]*)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';
          videoTitle = `YouTube Video (${videoId.substring(0, 8)}...)`;
          progressCallback(`Title extraction failed, using fallback: ${videoTitle} - proceeding with AI analysis`);
        }

        // Try to get duration (optional for AI analysis)
        try {
          const durationOutput = await execYtDlp(url, {
            skipDownload: true,
            print: '%(duration)s',
            noWarnings: true
          }, null); // cookiesPath will be handled by videoDownloader
          if (durationOutput && !isNaN(parseFloat(durationOutput))) {
            videoDuration = parseFloat(durationOutput);
            console.log('Video duration retrieved:', videoDuration, 'seconds');
          }
        } catch (durationError) {
          console.warn('Could not get video duration:', durationError.message);
        }
      } catch (titleError) {
        console.warn('Could not extract video title:', titleError.message);
        // Extract video ID for better fallback even in error case
        const videoIdMatch = url.match(/[?&]v=([^#\&\?]*)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';
        videoTitle = `YouTube Video (${videoId.substring(0, 8)}...)`;
        progressCallback(`Title extraction failed, using fallback: ${videoTitle} - proceeding with AI analysis`);
      }

      // Generate timestamps using Gemini AI with transcript data
      progressCallback('Creating AI prompt for analysis with transcript data...');

      console.log('Transcript available?', !!transcript);
      console.log('Transcript length:', transcript ? transcript.length : 0);
      console.log('Transcript preview:', transcript ? transcript.substring(0, 200) + '...' : 'NO_TRANSCRIPT_AVAILABLE');

      try {
        // Check if we have any API keys available first
        const availableApis = await geminiStore.getAllApis();
        if (!availableApis || availableApis.length === 0) {
          throw new Error("No Gemini API keys found. Please add API keys in Settings → Gemini API Keys before using AI analysis mode.");
        }

        console.log(`Found ${availableApis.length} Gemini API keys available`);

        // Use transcript as input to Gemini API
        const analysisInput = transcript || "NO_TRANSCRIPT_AVAILABLE";
        console.log('Analysis input preview:', analysisInput.substring(0, 200) + '...');
        const clipsJson = await clipperAgent.analyzeVideoForClips(analysisInput, videoTitle, videoDuration);
        suggestedClips = JSON.parse(clipsJson);

        console.log('AI generated clips:', suggestedClips);
        console.log('Number of clips generated:', suggestedClips ? suggestedClips.length : 0);

        if (!suggestedClips || suggestedClips.length === 0) {
          throw new Error("AI did not generate any clip suggestions. This could be because the video has no suitable content for viral clips.");
        }

        progressCallback('AI analysis completed successfully - proceeding to download video');
      } catch (analysisError) {
        console.error('AI analysis failed:', analysisError.message);

        // Check if it's an API key issue or actual AI analysis issue
        const isApiKeyError = analysisError.message.includes('Tidak ada API Gemini yang tersedia') ||
                             analysisError.message.includes('Semua API key Gemini gagal digunakan') ||
                             analysisError.message.includes('No Gemini API keys found');

        if (isApiKeyError) {
          throw new Error(`${analysisError.message} Go to Settings → Gemini API Keys to add your API keys.`);
        } else {
          throw new Error(`AI analysis failed: ${analysisError.message}`);
        }
      }

      // Download video after AI analysis is complete
      progressCallback('Starting video download (AI analysis complete)...');
      downloadResult = await videoDownloader.downloadVideo(url, jobId, progressCallback);
      progressCallback('Video downloaded successfully');

      // Use final title and duration from downloaded video
      videoTitle = downloadResult.title || videoTitle;
      videoDuration = downloadResult.duration || videoDuration;
    }

    // Step 5: Save video info and suggested clips (for clipper to use later)
    const videoInfo = {
      id: jobId,
      url: url,
      title: videoTitle,
      filePath: downloadResult.filePath,
      dir: downloadResult.dir,
      transcript: transcript, // Always include auto-saved transcript regardless of mode
      suggestedClips: suggestedClips,
      channel: downloadResult.channel, // Include channel from download result
      downloadedAt: new Date().toISOString()
    };

    // For now, save to a simple cache or database
    // TODO: Implement proper video metadata storage

    // Notify Results page about new download
    setTimeout(() => notifyDownloadComplete(videoInfo), 1000); // Delay to ensure file is fully written

    return {
      videoInfo: videoInfo,
      message: mode === 'manual' ?
        'Video downloaded with manual clip data' :
        (transcript ? 'Video downloaded with transcript analysis' : 'Video downloaded, no transcript found')
    };

  } catch (error) {
    console.error('Process error:', error.message);

    // Provide better error message for YouTube bot detection
    if (error.message.includes('Sign in to confirm you') ||
        error.message.includes('bot') ||
        error.message.includes('cookies')) {
      throw new Error(`${error.message}\n\n📋 SOLUTION: Go to Settings → YouTube Cookies and provide a path to your browser cookies file. Instructions are provided in the Settings page.`);
    }

    throw error;
  }
});

// Notify about completed downloads
const notifyDownloadComplete = (videoInfo) => {
  try {
    const fileSize = fssync.existsSync(videoInfo.filePath) ? fssync.statSync(videoInfo.filePath).size : null;
    const downloadData = {
      url: videoInfo.url,
      title: videoInfo.title,
      filePath: videoInfo.filePath,
      fileSize: fileSize,
      downloadedAt: videoInfo.downloadedAt,
      transcriptAvailable: !!videoInfo.transcript
    };
    mainWindow.webContents.send('new-download', downloadData);
  } catch (error) {
    console.warn('Error notifying download complete:', error);
  }
};

// Helper function to convert MM:SS to seconds
const timeToSeconds = (timeStr) => {
  if (!timeStr && timeStr !== 0) return 0;
  if (typeof timeStr === 'number') return timeStr;
  if (typeof timeStr === 'string') {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      // MM:SS format
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // HH:MM:SS format
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  return 0;
};

// Helper function to convert seconds to MM:SS string
const secondsToTimeStr = (seconds) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Clipper session handlers
ipcMain.handle('get-clipper-sessions', async () => {
  try {
    const sessions = await geminiStore.getClipperSessions();

    // Resolve relative paths in videoInfo and check file availability
    const resolvedSessions = sessions.map(session => {
      if (session.videoInfo && session.videoInfo.filePath && !path.isAbsolute(session.videoInfo.filePath)) {
        // This is a relative path - resolve it to absolute for the current machine
        const appDataPath = app.getPath('userData');
        const absoluteFilePath = path.join(appDataPath, session.videoInfo.filePath);
        console.log('🔄 Resolving saved session path:', session.videoInfo.filePath, '->', absoluteFilePath);

        // Check if the video file actually exists on this computer
        const fileExists = fssync.existsSync(absoluteFilePath);
        console.log('📁 Video file exists on this computer:', fileExists, 'for session:', session.id);

        return {
          ...session,
          videoInfo: {
            ...session.videoInfo,
            filePath: absoluteFilePath,
            fileExists: fileExists // Add flag to indicate file availability
          }
        };
      }
      return session;
    });

    return resolvedSessions;
  } catch (error) {
    console.error('Error getting clipper sessions:', error);
    return [];
  }
});

ipcMain.handle('delete-clipper-session', async (event, sessionId) => {
  try {
    const success = await geminiStore.deleteClipperSession(sessionId);
    return { success, message: success ? 'Session deleted successfully' : 'Session not found' };
  } catch (error) {
    console.error('Error deleting clipper session:', error);
    throw error;
  }
});

ipcMain.handle('save-clipper-session', async (event, sessionData) => {
  try {
    // Use existing session ID if provided, otherwise generate unique ID for session
    const sessionId = sessionData.id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session = {
      id: sessionId,
      title: sessionData.title || 'Untitled Clipper Session',
      videoInfo: sessionData.videoInfo || {},
      clips: sessionData.clips || [],
      savedAt: new Date().toISOString()
    };

    await geminiStore.saveClipperSession(session);

    console.log('Clipper session saved:', sessionId);
    return { success: true, sessionId, session };

  } catch (error) {
    console.error('Error saving clipper session:', error);
    throw error;
  }
});

ipcMain.handle('deleteAllAutocaptionFiles', async () => {
  try {
    // Use portable data directory relative to exe
    const exeDir = path.dirname(process.execPath);
    const dataDir = path.join(exeDir, 'data');
    const autocaptionDir = path.join(dataDir, 'results');

    if (fssync.existsSync(autocaptionDir)) {
      const files = await fs.readdir(autocaptionDir);
      let deletedCount = 0;

      for (const file of files) {
        if (file.startsWith('captioned_') && file.endsWith('.mp4')) {
          const filePath = path.join(autocaptionDir, file);
          const baseName = file.replace('.mp4', '');

          // Delete MP4 file
          try {
            await fs.unlink(filePath);
            deletedCount++;
            console.log('Deleted autocaption video file:', file);
          } catch (fileError) {
            console.warn('Could not delete MP4 file:', file, fileError.message);
          }

          // Delete associated .caption file
          const captionFile = baseName + '.caption';
          const captionPath = path.join(autocaptionDir, captionFile);
          if (fssync.existsSync(captionPath)) {
            try {
              await fs.unlink(captionPath);
              console.log('Deleted caption file:', captionFile);
            } catch (captionError) {
              console.warn('Could not delete caption file:', captionFile, captionError.message);
            }
          }

          // Delete associated _captions.txt file
          const txtFile = baseName + '_captions.txt';
          const txtPath = path.join(autocaptionDir, txtFile);
          if (fssync.existsSync(txtPath)) {
            try {
              await fs.unlink(txtPath);
              console.log('Deleted captions txt file:', txtFile);
            } catch (txtError) {
              console.warn('Could not delete txt file:', txtFile, txtError.message);
            }
          }
        }
      }

      console.log(`Deleted ${deletedCount} autocaption files`);
      return { success: true, deletedCount, message: `Deleted ${deletedCount} autocaption files successfully` };
    } else {
      return { success: true, deletedCount: 0, message: 'No autocaption directory found' };
    }

  } catch (error) {
    console.error('Error deleting autocaption files:', error);
    throw error;
  }
});

ipcMain.handle('deleteAutocaptionFile', async (event, filePath) => {
  try {
    if (!filePath || !filePath.endsWith('.mp4')) {
      throw new Error('Invalid file path or not an MP4 file');
    }

    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, '.mp4');

    let deletedFiles = [];
    let errors = [];

    // Delete MP4 file
    try {
      if (fssync.existsSync(filePath)) {
        await fs.unlink(filePath);
        deletedFiles.push(path.basename(filePath));
        console.log('Deleted autocaption video file:', path.basename(filePath));
      } else {
        errors.push(`${path.basename(filePath)} MP4 file not found`);
      }
    } catch (error) {
      console.error('Could not delete MP4 file:', error.message);
      errors.push(`Failed to delete MP4 file: ${error.message}`);
    }

    // Delete associated .caption file
    const captionFile = baseName + '.caption';
    const captionPath = path.join(dir, captionFile);
    try {
      if (fssync.existsSync(captionPath)) {
        await fs.unlink(captionPath);
        deletedFiles.push(captionFile);
        console.log('Deleted caption file:', captionFile);
      }
    } catch (error) {
      console.error('Could not delete caption file:', error.message);
      errors.push(`Failed to delete caption file: ${error.message}`);
    }

    // Delete associated _captions.txt file
    const txtFile = baseName + '_captions.txt';
    const txtPath = path.join(dir, txtFile);
    try {
      if (fssync.existsSync(txtPath)) {
        await fs.unlink(txtPath);
        deletedFiles.push(txtFile);
        console.log('Deleted captions txt file:', txtFile);
      }
    } catch (error) {
      console.error('Could not delete txt file:', error.message);
      errors.push(`Failed to delete txt file: ${error.message}`);
    }

    return {
      success: deletedFiles.length > 0,
      deletedFiles,
      errors,
      message: `Deleted ${deletedFiles.length} files successfully${errors.length > 0 ? ', with some errors' : ''}`
    };

  } catch (error) {
    console.error('Error deleting autocaption file:', error);
    throw error;
  }
});

ipcMain.handle('get-existing-files', async (event) => {
  try {
    // Use portable data directory relative to exe
    const exeDir = path.dirname(process.execPath);
    const dataDir = path.join(exeDir, 'data');
    const autocaptionDir = path.join(dataDir, 'results');

    // Ensure directories exist
    if (!fssync.existsSync(dataDir)) {
      fssync.mkdirSync(dataDir, { recursive: true });
    }
    if (!fssync.existsSync(autocaptionDir)) {
      fssync.mkdirSync(autocaptionDir, { recursive: true });
    }

    const result = {
      downloads: [],
      cuts: [],
      autocaption: []
    };

    // Get download files - be more robust
    try {
      const downloadsDir = path.join(dataDir, 'download');
      console.log('Looking for downloads in:', downloadsDir);

      if (fssync.existsSync(downloadsDir)) {
        const files = await fs.readdir(downloadsDir);
        console.log(`Found ${files.length} total files in downloads directory`);

        for (const file of files) {
          // More robust file extension check
          if (file.toLowerCase().endsWith('.mp4') && !file.startsWith('temp_')) {
            const filePath = path.join(downloadsDir, file);
            try {
              const stats = await fs.stat(filePath);

              // Create proper title from filename
              let displayName = path.basename(file, '.mp4');
              // Clean up the filename for display
              displayName = displayName.replace(/^@/, '').replace(/_/g, ' ').trim();

              // If displayName is too long or contains timestamps, try to make it readable
              if (displayName.length > 100 || displayName.match(/\d{4}-\d{2}-\d{2}t\d{2}-\d{2}-\d{2}/i)) {
                // Look for recognizable parts - try to find the main video title
                const parts = displayName.split('_');
                if (parts.length > 0) {
                  displayName = parts.slice(0, -2).join(' '); // Skip timestamp parts
                }
                if (displayName.length > 80) {
                  displayName = displayName.substring(0, 77) + '...';
                }
              }

              // Use a fallback title if empty
              if (!displayName.trim()) {
                displayName = 'Downloaded YouTube Video';
              }

              result.downloads.push({
                filePath: filePath, // Results.jsx expects 'filePath'
                title: displayName, // Results.jsx expects 'title'
                url: '', // No original URL available for files found on disk
                fileSize: stats.size,
                downloadedAt: stats.mtime.toISOString(), // Results.jsx expects 'downloadedAt'
                transcriptAvailable: false // Placeholder
              });

              console.log(`Added download file: ${displayName} (${stats.size} bytes)`);
            } catch (statError) {
              console.warn(`Could not stat file ${file}:`, statError.message);
            }
          }
        }

        console.log(`Total downloads found: ${result.downloads.length}`);
      } else {
        console.log('Downloads directory does not exist');
      }
    } catch (downloadsError) {
      console.warn('Error reading download files:', downloadsError);
    }

    // Get cut files
    try {
      const cutsDir = path.join(dataDir, 'cuts');
      console.log('Looking for cut files in:', cutsDir);

      if (fssync.existsSync(cutsDir)) {
        const files = await fs.readdir(cutsDir);
        console.log(`Found ${files.length} files in cuts directory`);

        for (const file of files) {
          if (file.endsWith('.mp4')) {
            const filePath = path.join(cutsDir, file);
            const stats = await fs.stat(filePath);

            let caption = null;
            // Try to read caption from associated .txt file
            try {
              const captionFilePath = path.join(cutsDir, path.basename(file, '.mp4') + '.txt');

              if (fssync.existsSync(captionFilePath)) {
                const captionContent = await fs.readFile(captionFilePath, 'utf-8');
                if (captionContent && captionContent.trim()) {
                  caption = captionContent.trim();
                }
              }
            } catch (captionError) {
              console.warn(`Could not read caption file for cut ${file}:`, captionError.message);
              // Fall back to no caption
            }

            result.cuts.push({
              outputPath: filePath,
              displayName: path.basename(file),
              caption: caption, // Add caption content from .txt file
              fileSize: stats.size,
              duration: 0, // Would need to probe video for this
              createdAt: stats.mtime.toISOString(),
              source: 'Cut Video',
              type: 'cut'
            });

            console.log(`Added cut file: ${path.basename(file)}`);
          }
        }
      } else {
        console.log('Cuts directory does not exist');
      }
    } catch (cutsError) {
      console.warn('Error reading cut files:', cutsError);
    }

    // Get autocaptioned files
    try {
      console.log('Looking for autocaption files in:', autocaptionDir);

      if (fssync.existsSync(autocaptionDir)) {
        const files = await fs.readdir(autocaptionDir);
        console.log(`Found ${files.length} files in autocaption directory`);

        for (const file of files) {
          if (file.endsWith('.mp4')) {
            const filePath = path.join(autocaptionDir, file);
            const stats = await fs.stat(filePath);

            // Create initial display name from filename, cleaning up underscores and .mp4
            let displayName = path.basename(file, '.mp4').replace(/_/g, ' ').trim();

            // Try to get display name from autocaption caption content file
            try {
              const captionFilePath = path.join(autocaptionDir, path.basename(file, '.mp4') + '.caption');

              if (fssync.existsSync(captionFilePath)) {
                const captionContent = await fs.readFile(captionFilePath, 'utf-8');
                if (captionContent && captionContent.trim()) {
                  // Use the full caption content as display name so it can be easily copied
                  displayName = captionContent.trim();
                }
              }
            } catch (captionError) {
              console.warn(`Could not read autocaption caption file for ${file}:`, captionError.message);
              // Fall back to filename-based display name
            }

            result.autocaption.push({
              outputPath: filePath,
              displayName: displayName,
              fileSize: stats.size,
              createdAt: stats.mtime.toISOString(),
              autocaptionSource: 'autocaption' // Mark as from autocaption
            });

            console.log(`Added autocaption file: ${path.basename(file)}`);
          }
        }
      } else {
        console.log('Autocaption directory does not exist');
      }
    } catch (autocaptionError) {
      console.warn('Error reading autocaption files:', autocaptionError);
    }

    console.log('Found files:', result.cuts.length, 'cuts,', result.autocaption.length, 'autocaption files');
    return result;

  } catch (error) {
    console.error('Error getting existing files:', error);
    return { cuts: [], downloads: [], autocaption: [] };
  }
});

// IPC Handlers for settings and accounts
ipcMain.handle('bulk-add-keys', async (event, apiKeysText) => {
  try {
    const result = await geminiStore.bulkAddApis(apiKeysText);
    return result;
  } catch (error) {
    console.error('Error bulk adding keys:', error);
    throw error;
  }
});

ipcMain.handle('get-api-keys', async () => {
  try {
    return await geminiStore.getAllApis();
  } catch (error) {
    return [];
  }
});

ipcMain.handle('delete-api-key', async (event, apiId) => {
  try {
    const result = await geminiStore.deleteApi(apiId);
    return { success: result, message: result ? 'API key deleted successfully' : 'API key not found' };
  } catch (error) {
    console.error('Error deleting API key:', error);
    throw error;
  }
});

ipcMain.handle('validate-single-api-key', async (event, apiKey) => {
  try {
    const isValid = await geminiService.validateApiKey(apiKey);
    return { isValid, message: isValid ? 'API key is valid' : 'API key is invalid' };
  } catch (error) {
    console.error('Error validating API key:', error);
    return { isValid: false, message: `Validation error: ${error.message}` };
  }
});

ipcMain.handle('get-cookies-path', async () => {
  try {
    return await geminiStore.getCookiesPath();
  } catch (error) {
    console.error('Error getting cookies path:', error);
    return null;
  }
});

ipcMain.handle('get-apify-api-key', async () => {
  try {
    return await geminiStore.getApifyApiKey();
  } catch (error) {
    console.error('Error getting Apify API key:', error);
    return null;
  }
});

ipcMain.handle('set-cookies-path', async (event, path) => {
  try {
    await geminiStore.setCookiesPath(path);
    // Update videoDownloader as well
    videoDownloader.setCookiesPath(path);
    return { success: true, message: 'Cookies path updated successfully' };
  } catch (error) {
    console.error('Error setting cookies path:', error);
    throw error;
  }
});

ipcMain.handle('set-apify-api-key', async (event, apiKey) => {
  try {
    await geminiStore.setApifyApiKey(apiKey);
    return { success: true, message: 'Apify API key updated successfully' };
  } catch (error) {
    console.error('Error setting Apify API key:', error);
    throw error;
  }
});

ipcMain.handle('get-youtube-client-id', async () => {
  try {
    return await geminiStore.getYouTubeClientId();
  } catch (error) {
    console.error('Error getting YouTube client ID:', error);
    return null;
  }
});

ipcMain.handle('get-youtube-client-secret', async () => {
  try {
    return await geminiStore.getYouTubeClientSecret();
  } catch (error) {
    console.error('Error getting YouTube client secret:', error);
    return null;
  }
});

ipcMain.handle('set-youtube-client-id', async (event, clientId) => {
  try {
    await geminiStore.setYouTubeClientId(clientId);
    return { success: true, message: 'YouTube client ID updated successfully' };
  } catch (error) {
    console.error('Error setting YouTube client ID:', error);
    throw error;
  }
});

ipcMain.handle('set-youtube-client-secret', async (event, clientSecret) => {
  try {
    await geminiStore.setYouTubeClientSecret(clientSecret);
    return { success: true, message: 'YouTube client secret updated successfully' };
  } catch (error) {
    console.error('Error setting YouTube client secret:', error);
    throw error;
  }
});

ipcMain.handle('save-netscape-cookies', async (event, cookiesText) => {
  try {
    if (!cookiesText.trim()) {
      throw new Error('No cookies text provided');
    }

    // Create cookies.txt file with the provided Netscape format - use portable path
    const exeDir = path.dirname(process.execPath);
    const cookiesDir = path.join(exeDir, 'data', 'downloads');
    if (!fssync.existsSync(cookiesDir)) {
      fssync.mkdirSync(cookiesDir, { recursive: true });
    }

    const cookiesFile = path.join(cookiesDir, 'youtube_cookies.txt');

    // Clean and validate the cookies text
    let netscapeCookies = cookiesText.trim();

    // Ensure it starts with the proper header
    if (!netscapeCookies.startsWith('# Netscape HTTP Cookie File')) {
      netscapeCookies = `# Netscape HTTP Cookie File
# https://curl.se/docs/http-cookies.html
# This file was generated by Auto Clipper AI. Do not edit.

${netscapeCookies}`;
    }

    // Write to file
    fssync.writeFileSync(cookiesFile, netscapeCookies, 'utf8');

    // Set the path in settings
    await geminiStore.setCookiesPath(cookiesFile);
    videoDownloader.setCookiesPath(cookiesFile);

    console.log('Netscape cookies saved to:', cookiesFile);
    return { success: true, path: cookiesFile, message: `Cookies saved to: ${cookiesFile}` };

  } catch (error) {
    console.error('Error saving Netscape cookies:', error);
    throw new Error(`Failed to save cookies: ${error.message}`);
  }
});

// YouTube handlers
ipcMain.handle('youtube-get-accounts', async () => {
  try {
    return await YouTubeService.getAccounts();
  } catch (error) {
    console.error('Error getting YouTube accounts:', error);
    return [];
  }
});

ipcMain.handle('youtube-get-auth-url', async () => {
  try {
    return await YouTubeService.getAuthUrl();
  } catch (error) {
    console.error('Error getting YouTube auth URL:', error);
    throw error;
  }
});

ipcMain.handle('youtube-handle-auth-callback', async (event, code) => {
  try {
    const result = await YouTubeService.handleAuthCallback(code);
    return result;
  } catch (error) {
    console.error('Error handling YouTube auth callback:', error);
    throw error;
  }
});

// YouTube OAuth with system browser
ipcMain.handle('youtube-start-oauth', async (event, reauthAccountId = null) => {
  try {
    console.log('youtube-start-oauth called with reauthAccountId:', reauthAccountId, 'type:', typeof reauthAccountId);

    // Check if OAuth credentials are configured
    const clientId = await geminiStore.getYouTubeClientId();
    const clientSecret = await geminiStore.getYouTubeClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error('YouTube OAuth credentials not configured. Please go to Settings and configure them first.');
    }

    // Store re-auth account ID for callback
    let storedReauthAccountId = reauthAccountId;

    // Start OAuth server if not running
    const port = await startOAuthServer();

    console.log(`OAuth server running on port ${port}, URL: http://localhost:${port}/api/auth/google/callback, reauthAccountId: ${storedReauthAccountId}`);

    const { shell } = require('electron');
    const authUrl = await YouTubeService.getAuthUrl(port, storedReauthAccountId);

    // Open auth URL in system default browser
    shell.openExternal(authUrl);

    console.log('Opened OAuth URL in system browser:', authUrl);

    return new Promise((resolve, reject) => {
      oauthResolveCallback = async (result) => {
        try {
          // If this is a re-authentication, pass the account ID to the callback handler
          if (storedReauthAccountId && result && result.code) {
            console.log('Processing re-authentication with account ID:', storedReauthAccountId);
            result = await YouTubeService.handleAuthCallback(result.code, storedReauthAccountId);
          } else if (result && result.code) {
            // Normal authentication
            result = await YouTubeService.handleAuthCallback(result.code);
          }

          resolve(result);
          oauthResolveCallback = null;
          stopOAuthServer();
        } catch (callbackError) {
          console.error('OAuth callback error:', callbackError);
          reject(callbackError);
          oauthResolveCallback = null;
          stopOAuthServer();
        }
      };

      // Timeout after 5 minutes
      setTimeout(() => {
        if (oauthResolveCallback) {
          oauthResolveCallback(null);
          oauthResolveCallback = null;
          stopOAuthServer();
          reject(new Error('OAuth timeout - authentication took too long'));
        }
      }, 5 * 60 * 1000);
    });

  } catch (error) {
    console.error('Error starting YouTube OAuth:', error);
    stopOAuthServer();
    throw error;
  }
});

// YouTube upload video handler
ipcMain.handle('youtube-upload-video', async (event, videoData) => {
  try {
    const { accountId, videoFile, thumbnailFile, title, description, tags, playlists, madeForKids, paidPromotion, privacyStatus, categoryId, publishAt } = videoData;

    const uploadData = {
      accountId,
      videoFile,
      thumbnailFile,
      title,
      description,
      tags,
      playlists,
      madeForKids,
      paidPromotion,
      privacyStatus,
      categoryId,
      publishAt
    };

    const result = await YouTubeService.uploadVideo(parseInt(accountId), uploadData);
    return result;
  } catch (error) {
    console.error('Error uploading video to YouTube:', error);
    throw error;
  }
});

ipcMain.handle('youtube-get-upload-history', async (event, userId) => {
  try {
    const history = await YouTubeService.getUploadHistory(userId);
    return history;
  } catch (error) {
    console.error('Error getting YouTube upload history:', error);
    return [];
  }
});

ipcMain.handle('youtube-remove-account', async (event, accountId) => {
  try {
    const success = await YouTubeService.removeAccount(accountId);
    return { success, message: success ? 'Account removed successfully' : 'Account not found' };
  } catch (error) {
    console.error('Error removing YouTube account:', error);
    throw error;
  }
});

ipcMain.handle('youtube-delete-history-item', async (event, historyId) => {
  try {
    const success = await YouTubeService.deleteUploadHistoryItem(historyId);
    return { success, message: success ? 'History item deleted successfully' : 'History item not found' };
  } catch (error) {
    console.error('Error deleting YouTube history item:', error);
    throw error;
  }
});

ipcMain.handle('youtube-clear-upload-history', async (event, userId) => {
  try {
    const success = await YouTubeService.clearUploadHistory(userId);
    return { success, message: success ? 'Upload history cleared successfully' : 'Failed to clear history' };
  } catch (error) {
    console.error('Error clearing YouTube upload history:', error);
    throw error;
  }
});

ipcMain.handle('youtube-generate-content', async (event, data) => {
  try {
    const result = await YouTubeService.generateContent(data.fileName, data.userId, data.options);
    return result;
  } catch (error) {
    console.error('Error generating YouTube content:', error);
    throw error;
  }
});

ipcMain.handle('youtube-generate-content-from-caption', async (event, data) => {
  try {
    const result = await YouTubeService.generateContentFromCaption(data.filePath, data.language);
    return result;
  } catch (error) {
    console.error('Error generating YouTube content from caption:', error);
    throw error;
  }
});

// Gemini model selection handlers
ipcMain.handle('get-selected-model', async () => {
  try {
    return await geminiStore.getSelectedModel();
  } catch (error) {
    console.error('Error getting selected model:', error);
    return 'gemini-2.0-flash'; // Fallback
  }
});

ipcMain.handle('set-selected-model', async (event, model) => {
  try {
    await geminiStore.setSelectedModel(model);
    return { success: true, message: 'Model updated successfully' };
  } catch (error) {
    console.error('Error setting selected model:', error);
    throw error;
  }
});

// Prompt management handlers
ipcMain.handle('get-prompt', async () => {
  try {
    return await geminiStore.getPrompt();
  } catch (error) {
    console.error('Error getting prompt:', error);
    return null;
  }
});

ipcMain.handle('set-prompt', async (event, prompt) => {
  try {
    await geminiStore.setPrompt(prompt);
    return { success: true, message: 'Prompt updated successfully' };
  } catch (error) {
    console.error('Error setting prompt:', error);
    throw error;
  }
});

ipcMain.handle('get-temp-dir', async () => {
  try {
    const os = require('os');
    const tempDir = os.tmpdir().replace(/\\/g, '/') + '/autocliper-previews';
    return tempDir;
  } catch (error) {
    console.error('Error getting temp directory:', error);
    return '/tmp/autocliper-previews'; // Fallback
  }
});

ipcMain.handle('delete-preview-clip', async (event, filePath) => {
  try {
    if (fssync.existsSync(filePath)) {
      fssync.unlinkSync(filePath);
      console.log('Preview clip deleted:', filePath);
      return { success: true };
    } else {
      console.log('Preview clip not found:', filePath);
      return { success: false, message: 'File not found' };
    }
  } catch (error) {
    console.error('Error deleting preview clip:', error);
    return { success: false, message: error.message };
  }
});

// Add the missing delete-file handler
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    if (fssync.existsSync(filePath)) {
      fssync.unlinkSync(filePath);
      console.log('File deleted:', filePath);
      return { success: true };
    } else {
      console.log('File not found for deletion:', filePath);
      return { success: false, message: 'File not found' };
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    return { success: false, message: error.message };
  }
});

// Add the missing delete-multiple-files handler
ipcMain.handle('delete-multiple-files', async (event, filePaths) => {
  try {
    if (!Array.isArray(filePaths)) {
      throw new Error('filePaths must be an array');
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const filePath of filePaths) {
      try {
        if (fssync.existsSync(filePath)) {
          fssync.unlinkSync(filePath);
          console.log('File deleted:', filePath);
          results.push({ filePath, success: true });
          successCount++;
        } else {
          console.log('File not found for deletion:', filePath);
          results.push({ filePath, success: false, message: 'File not found' });
          failCount++;
        }
      } catch (error) {
        console.error('Error deleting file:', filePath, error);
        results.push({ filePath, success: false, message: error.message });
        failCount++;
      }
    }

    return {
      success: true,
      totalFiles: filePaths.length,
      deleted: successCount,
      failed: failCount,
      results
    };
  } catch (error) {
    console.error('Error in delete-multiple-files:', error);
    throw error;
  }
});

// Video cutting handlers
ipcMain.handle('cut-video-clip', async (event, clipData) => {
  try {
    console.log('🎬 Cutting video clip - received clipData:', JSON.stringify(clipData, null, 2));
    console.log('🎬 clipData type:', typeof clipData);
    console.log('🎬 clipData keys:', clipData ? Object.keys(clipData) : 'clipData is null/undefined');

    const { sourcePath, startTime, endTime, outputDir, outputFileName, caption = null, transcriptData = null } = clipData;

    // Always resolve sourcePath to absolute path, handling both relative and absolute inputs
    let absoluteSourcePath = sourcePath;
    if (!path.isAbsolute(sourcePath)) {
      // Relative path - resolve relative to app data directory
      const appDataPath = app.getPath('userData');
      absoluteSourcePath = path.join(appDataPath, sourcePath);
      console.log('🎬 Resolved relative sourcePath to absolute:', sourcePath, '->', absoluteSourcePath);
    } else {
      // Absolute path - check if it's from a different computer/user
      // If it's an absolute path that doesn't exist, try to resolve it relative to current app data
      if (!fssync.existsSync(absoluteSourcePath)) {
        console.log('🎬 Absolute path does not exist, trying to resolve relative to current app data...');
        const appDataPath = app.getPath('userData');
        // Extract relative part from the absolute path
        const pathParts = absoluteSourcePath.split(/[/\\]/);
        const dataIndex = pathParts.findIndex(part => part === 'data');
        if (dataIndex !== -1) {
          const relativeParts = pathParts.slice(dataIndex);
          const resolvedPath = path.join(appDataPath, ...relativeParts);
          console.log('🎬 Attempting to resolve to:', resolvedPath);
          if (fssync.existsSync(resolvedPath)) {
            absoluteSourcePath = resolvedPath;
            console.log('🎬 Successfully resolved absolute path to current computer:', absoluteSourcePath);
          } else {
            console.log('🎬 Could not resolve path to current computer');
          }
        }
      }
    }

    console.log('🎬 Destructured values:');
    console.log('  sourcePath:', sourcePath, '(absolute:', absoluteSourcePath + ')');
    console.log('  startTime:', startTime);
    console.log('  endTime:', endTime);
    console.log('  outputDir:', outputDir);
    console.log('  outputFileName:', outputFileName);
    console.log('  caption:', caption);

    if (!sourcePath || startTime === undefined || startTime === null ||
        endTime === undefined || endTime === null ||
        !outputDir || !outputFileName) {
      console.log('❌ Missing parameters - throwing error');
      console.log('❌ Detailed check:', {
        sourcePath: !!sourcePath,
        startTime: !!startTime,
        endTime: !!endTime,
        outputDir: !!outputDir,
        outputFileName: !!outputFileName
      });
      throw new Error('Missing required parameters: sourcePath, startTime, endTime, outputDir, outputFileName');
    }

    // Note: Don't pre-create directory here - videoCutter.resolveOutputDir() will handle string identifier mapping and directory creation

    // Use the video cutter to cut the clip
    const result = await videoCutter.cutVideo(absoluteSourcePath, startTime, endTime, outputDir, outputFileName, caption, transcriptData);

    console.log('Video clip cutting completed:', result);

    // Notify Results component about the new cut clip
    if (result && result.success && result.outputPath) {
      const fileSize = fssync.existsSync(result.outputPath) ? fssync.statSync(result.outputPath).size : null;

      const cutData = {
        outputPath: result.outputPath,
        caption: caption || outputFileName, // Use caption if available, otherwise use filename
        createdAt: new Date().toISOString(),
        fileSize: fileSize,
        duration: result.duration !== undefined ? result.duration : Math.round(endTime - startTime), // Use accurate duration from videoCutter
        source: 'Manual Cut', // TODO: Get source video title somehow
      };

      console.log('✅ Video cut successful! Sending new-cut event to Results component:', cutData);
      console.log('✅ Event data will be:', JSON.stringify(cutData, null, 2));
      mainWindow.webContents.send('new-cut', cutData);
      console.log('✅ new-cut event sent successfully');
    } else {
      console.log('❌ Video cutting failed or invalid result, no event sent');
    }

    return result;

  } catch (error) {
    console.error('Error cutting video clip:', error);
    throw error;
  }
});

ipcMain.handle('create-video-preview', async (event, previewData) => {
  try {
    console.log('Creating video preview:', previewData);

    const { sourcePath, startTime, endTime, outputDir, previewId } = previewData;

    // Always resolve sourcePath to absolute path, handling both relative and absolute inputs
    let absoluteSourcePath = sourcePath;
    if (!path.isAbsolute(sourcePath)) {
      // Relative path - resolve relative to app data directory
      const appDataPath = app.getPath('userData');
      absoluteSourcePath = path.join(appDataPath, sourcePath);
      console.log('🔄 Resolved relative sourcePath to absolute:', sourcePath, '->', absoluteSourcePath);
    } else {
      // Absolute path - check if it's from a different computer/user
      // If it's an absolute path that doesn't exist, try to resolve it relative to current app data
      if (!fssync.existsSync(absoluteSourcePath)) {
        console.log('🔄 Absolute path does not exist, trying to resolve relative to current app data...');
        const appDataPath = app.getPath('userData');
        // Extract relative part from the absolute path
        const pathParts = absoluteSourcePath.split(/[/\\]/);
        const dataIndex = pathParts.findIndex(part => part === 'data');
        if (dataIndex !== -1) {
          const relativeParts = pathParts.slice(dataIndex);
          const resolvedPath = path.join(appDataPath, ...relativeParts);
          console.log('🔄 Attempting to resolve to:', resolvedPath);
          if (fssync.existsSync(resolvedPath)) {
            absoluteSourcePath = resolvedPath;
            console.log('🔄 Successfully resolved absolute path to current computer:', absoluteSourcePath);
          } else {
            console.log('🔄 Could not resolve path to current computer');
          }
        }
      }
    }

    if (!absoluteSourcePath || !startTime || !endTime || !outputDir || !previewId) {
      throw new Error('Missing required parameters for preview creation');
    }

    // Note: Don't pre-create directory here - videoCutter.resolveOutputDir() will handle string identifier mapping and directory creation

    const result = await videoCutter.createPreviewClip(absoluteSourcePath, startTime, endTime, outputDir, previewId);

    console.log('Video preview created:', result);
    return result;

  } catch (error) {
    console.error('Error creating video preview:', error);
    throw error;
  }
});

ipcMain.handle('cut-multiple-clips', async (event, multiClipData) => {
  try {
    console.log('Cutting multiple clips:', multiClipData);

    const { sourcePath, clipsArray, outputDir } = multiClipData;

    if (!sourcePath || !clipsArray || !outputDir) {
      throw new Error('Missing required parameters: sourcePath, clipsArray, outputDir');
    }

    // Ensure output directory exists
    if (!fssync.existsSync(outputDir)) {
      fssync.mkdirSync(outputDir, { recursive: true });
    }

    // Resolve relative sourcePath to absolute path
    let absoluteSourcePath = sourcePath;
    if (!path.isAbsolute(sourcePath)) {
      // Relative path - resolve relative to app data directory
      const appDataPath = app.getPath('userData');
      absoluteSourcePath = path.join(appDataPath, sourcePath);
      console.log('🔄 cutMultipleClips: Resolved relative sourcePath to absolute:', sourcePath, '->', absoluteSourcePath);
    }

    const results = await videoCutter.cutMultipleClips(absoluteSourcePath, clipsArray, outputDir);

    console.log('Multiple clips cutting completed:', results.length, 'clips');
    return results;

  } catch (error) {
    console.error('Error cutting multiple clips:', error);
    throw error;
  }
});

// Get app data path handler
ipcMain.handle('get-app-data-path', async () => {
  try {
    return app.getPath('userData');
  } catch (error) {
    console.error('Error getting app data path:', error);
    return null;
  }
});

// Get video duration handler
ipcMain.handle('get-video-duration', async (event, videoPath) => {
  try {
    const duration = await videoCutter.getVideoDuration(videoPath);
    return duration;
  } catch (error) {
    console.error('Error getting video duration:', error);
    return null;
  }
});

// Delete temp files handler
ipcMain.handle('delete-temp-files', async () => {
  try {
    // Use portable data directory relative to exe
    const exeDir = path.dirname(process.execPath);
    const dataDir = path.join(exeDir, 'data');
    const tempDir = path.join(dataDir, 'temp');

    console.log('🗑️ Checking temp directory:', tempDir);
    console.log('📁 Temp directory exists:', fssync.existsSync(tempDir));

    // Ensure temp directory exists (create if not)
    if (!fssync.existsSync(tempDir)) {
      fssync.mkdirSync(tempDir, { recursive: true });
      console.log('📁 Created temp directory:', tempDir);
      return { success: true, deletedCount: 0, message: 'Temp directory created, no files to delete' };
    }

    const files = await fs.readdir(tempDir);
    console.log(`📋 Found ${files.length} items in temp directory`);
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stats = await fs.stat(filePath);
        // Only delete files, not directories
        if (stats.isFile()) {
          await fs.unlink(filePath);
          deletedCount++;
          console.log('🗑️ Deleted temp file:', file);
        } else {
          console.log('📁 Skipping directory:', file);
        }
      } catch (fileError) {
        console.warn('Could not delete temp file:', file, fileError.message);
      }
    }

    console.log(`✅ Deleted ${deletedCount} temp files`);
    return { success: true, deletedCount, message: `Deleted ${deletedCount} temp files successfully` };

  } catch (error) {
    console.error('❌ Error deleting temp files:', error);
    throw error;
  }
});

// Get file stats handler
ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    // Always resolve filePath to absolute path, handling both relative and absolute inputs
    let absoluteFilePath = filePath;
    if (!path.isAbsolute(filePath)) {
      // Relative path - resolve relative to app data directory
      const appDataPath = app.getPath('userData');
      absoluteFilePath = path.join(appDataPath, filePath);
      console.log('📊 Resolving relative filePath to absolute:', filePath, '->', absoluteFilePath);
    } else {
      // Absolute path - check if it's from a different computer/user
      // If it's an absolute path that doesn't exist, try to resolve it relative to current app data
      if (!fssync.existsSync(absoluteFilePath)) {
        console.log('📊 Absolute path does not exist, trying to resolve relative to current app data...');
        const appDataPath = app.getPath('userData');
        // Extract relative part from the absolute path
        const pathParts = absoluteFilePath.split(/[/\\]/);
        const dataIndex = pathParts.findIndex(part => part === 'data');
        if (dataIndex !== -1) {
          const relativeParts = pathParts.slice(dataIndex);
          const resolvedPath = path.join(appDataPath, ...relativeParts);
          console.log('📊 Attempting to resolve to:', resolvedPath);
          if (fssync.existsSync(resolvedPath)) {
            absoluteFilePath = resolvedPath;
            console.log('📊 Successfully resolved absolute path to current computer:', absoluteFilePath);
          } else {
            console.log('📊 Could not resolve path to current computer');
          }
        }
      }
    }

    const stats = await fs.stat(absoluteFilePath);
    return {
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime || stats.ctime
    };
  } catch (error) {
    console.error('Error getting file stats:', error, 'for path:', filePath);
    return null;
  }
});

// Video file server for large files
let videoServer = null;
let videoServerPort = null;

function startVideoServer() {
  if (videoServer) return videoServerPort; // Already running

  const http = require('http');
  const fs = require('fs');

  videoServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${videoServerPort}`);
    const filePath = decodeURIComponent(url.pathname.slice(1)); // Remove leading /

    console.log('🎬 Video server request for:', filePath);

    // Resolve relative paths to absolute paths for video files
    let absoluteFilePath = filePath;
    if (!path.isAbsolute(filePath)) {
      // Relative path - resolve relative to app data directory
      const appDataPath = app.getPath('userData');
      absoluteFilePath = path.join(appDataPath, filePath);
      console.log('🔄 Video server resolving relative path:', filePath, '->', absoluteFilePath);
    }

    console.log('🎬 Checking if file exists:', absoluteFilePath);
    console.log('🎬 File exists:', fs.existsSync(absoluteFilePath));

    if (!absoluteFilePath || !fs.existsSync(absoluteFilePath)) {
      console.warn('Video server: File not found:', absoluteFilePath, '(original:', filePath + ')');
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Video file not found on this computer. This may happen when using the app on different computers where the video files are not available.');
      return;
    }

    // Additional check: make sure the file is readable and has content
    try {
      fs.accessSync(absoluteFilePath, fs.constants.R_OK);
      console.log('🎬 File is readable');

      // Check file size - must be > 0 for video files
      const stats = fs.statSync(absoluteFilePath);
      console.log('🎬 File size:', stats.size, 'bytes');

      if (stats.size === 0) {
        console.warn('Video server: File is empty (0 bytes):', absoluteFilePath);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Video file is empty or corrupted. This may happen when a download was interrupted.');
        return;
      }

      // Additional validation: check if file extension suggests it's a video file
      const ext = path.extname(absoluteFilePath).toLowerCase();
      const validVideoExts = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv'];
      if (!validVideoExts.includes(ext)) {
        console.warn('Video server: File does not have a valid video extension:', ext, 'for file:', absoluteFilePath);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('File is not a recognized video format.');
        return;
      }

    } catch (accessError) {
      console.warn('Video server: File not accessible:', absoluteFilePath, accessError);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Video file is not accessible. Permission denied.');
      return;
    }

    // Get file stats for content type and size
    const stat = fs.statSync(absoluteFilePath);
    const fileSize = stat.size;

    // Determine content type based on file extension
    const ext = path.extname(absoluteFilePath).toLowerCase();
    let contentType = 'video/mp4'; // default
    if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.avi') contentType = 'video/x-msvideo';
    else if (ext === '.mov') contentType = 'video/quicktime';

    console.log('🎬 File size:', fileSize, 'bytes');
    console.log('🎬 Content type:', contentType);
    console.log('🎬 Range header:', req.headers.range);

    // Handle range requests for video seeking
    const range = req.headers.range;
    if (range) {
      console.log('🎬 Processing range request:', range);
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      console.log(`🎬 Range: start=${start}, end=${end}, chunkSize=${chunkSize}`);

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
      });

      const stream = fs.createReadStream(absoluteFilePath, { start, end });
      console.log('🎬 Created read stream for range request');

      stream.on('error', (streamError) => {
        console.error('🎬 Stream error (range):', streamError);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Stream error');
        }
      });

      stream.on('end', () => {
        console.log('🎬 Stream ended (range)');
      });

      stream.pipe(res);
    } else {
      console.log('🎬 Processing full file request');

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
      });

      const stream = fs.createReadStream(absoluteFilePath);
      console.log('🎬 Created read stream for full file');

      stream.on('error', (streamError) => {
        console.error('🎬 Stream error (full):', streamError);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Stream error');
        }
      });

      stream.on('end', () => {
        console.log('🎬 Stream ended (full)');
      });

      stream.pipe(res);
    }
  });

  return new Promise((resolve, reject) => {
    videoServer.listen(0, 'localhost', () => {
      videoServerPort = videoServer.address().port;
      console.log(`Video server started on port ${videoServerPort}`);
      resolve(videoServerPort);
    });

    videoServer.on('error', (err) => {
      console.error('Video server error:', err);
      reject(err);
    });
  });
}

function stopVideoServer() {
  if (videoServer) {
    videoServer.close(() => {
      console.log('Video server stopped');
      videoServer = null;
      videoServerPort = null;
    });
  }
}

// Create video URL handler (replaces blob URL approach)
ipcMain.handle('create-video-url', async (event, filePath) => {
  try {
    console.log('Creating video URL for file:', filePath);

    // Resolve relative paths to absolute paths
    let absoluteFilePath = filePath;
    if (!path.isAbsolute(filePath)) {
      // Relative path - resolve relative to app data directory
      const appDataPath = app.getPath('userData');
      absoluteFilePath = path.join(appDataPath, filePath);
      console.log('Resolved relative path to absolute:', filePath, '->', absoluteFilePath);
    }

    if (!absoluteFilePath || !fssync.existsSync(absoluteFilePath)) {
      const errorMsg = 'Video file not found: ' + absoluteFilePath + ' (original: ' + filePath + ')';
      console.warn('Video file not found - this may happen when using the app on different computers');
      return { success: false, error: errorMsg };
    }

    // Start video server if not running
    if (!videoServerPort) {
      await startVideoServer();
    }

    // Create URL pointing to our local video server
    const encodedPath = encodeURIComponent(filePath);
    const videoUrl = `http://localhost:${videoServerPort}/${encodedPath}`;

    console.log('Video URL created:', videoUrl);
    return {
      success: true,
      videoUrl,
      fileName: path.basename(filePath)
    };

  } catch (error) {
    console.error('Error creating video URL:', error);
    return { success: false, error: error.message };
  }
});

// Video status tracking handlers
ipcMain.handle('get-all-video-statuses', async () => {
  try {
    const statuses = await geminiStore.getAllVideoStatuses();
    return statuses;
  } catch (error) {
    console.error('Error getting all video statuses:', error);
    return [];
  }
});

ipcMain.handle('update-video-status', async (event, videoPath, updates) => {
  try {
    const result = await geminiStore.updateVideoStatus(videoPath, updates);
    return { success: result };
  } catch (error) {
    console.error('Error updating video status:', error);
    throw error;
  }
});

ipcMain.handle('get-video-status', async (event, videoPath) => {
  try {
    const status = await geminiStore.getVideoStatus(videoPath);
    return status;
  } catch (error) {
    console.error('Error getting video status:', error);
    return null;
  }
});

ipcMain.handle('delete-video-status', async (event, videoPath) => {
  try {
    const result = await geminiStore.deleteVideoStatus(videoPath);
    return { success: result };
  } catch (error) {
    console.error('Error deleting video status:', error);
    throw error;
  }
});

// Dialog handlers for backup/restore
ipcMain.handle('show-save-dialog', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result.filePath;
  } catch (error) {
    console.error('Error showing save dialog:', error);
    throw error;
  }
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result.filePaths[0] || null; // Return first selected file path
  } catch (error) {
    console.error('Error showing open dialog:', error);
    throw error;
  }
});

// Backup and restore handlers
ipcMain.handle('backup-settings', async () => {
  try {
    const backupData = await geminiStore.createBackup();
    return { success: true, data: backupData };
  } catch (error) {
    console.error('Error creating backup:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('restore-settings', async (event, backupData) => {
  try {
    const result = await geminiStore.restoreBackup(backupData);
    return result;
  } catch (error) {
    console.error('Error restoring backup:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-settings-backup', async (event, filePath) => {
  try {
    const result = await geminiStore.exportBackupToFile(filePath);
    return result;
  } catch (error) {
    console.error('Error exporting backup:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-settings-backup', async (event, filePath) => {
  try {
    const result = await geminiStore.importBackupFromFile(filePath);
    return result;
  } catch (error) {
    console.error('Error importing backup:', error);
    return { success: false, error: error.message };
  }
});

// TikTok handlers
ipcMain.handle('tiktok-get-auth-url', async () => {
  try {
    return await TikTokService.getAuthUrl();
  } catch (error) {
    console.error('Error getting TikTok auth URL:', error);
    throw error;
  }
});

ipcMain.handle('tiktok-handle-auth-callback', async (event, code) => {
  try {
    const result = await TikTokService.handleAuthCallback(code);
    return result;
  } catch (error) {
    console.error('Error handling TikTok auth callback:', error);
    throw error;
  }
});

// TikTok OAuth with system browser
ipcMain.handle('tiktok-start-oauth', async (event, reauthAccountId = null) => {
  try {
    console.log('tiktok-start-oauth called with reauthAccountId:', reauthAccountId, 'type:', typeof reauthAccountId);

    // Check if OAuth credentials are configured
    const clientKey = await geminiStore.getTikTokClientKey();
    const clientSecret = await geminiStore.getTikTokClientSecret();

    if (!clientKey || !clientSecret) {
      throw new Error('TikTok OAuth credentials not configured. Please go to Settings and configure them first.');
    }

    // Store re-auth account ID for callback
    let storedReauthAccountId = reauthAccountId;

    // Start OAuth server if not running
    const port = await startOAuthServer();

    console.log(`OAuth server running on port ${port}, URL: http://localhost:${port}/api/auth/tiktok/callback, reauthAccountId: ${storedReauthAccountId}`);

    const { shell } = require('electron');
    const authUrl = await TikTokService.getAuthUrl(port, storedReauthAccountId);

    // Open auth URL in system default browser
    shell.openExternal(authUrl);

    console.log('Opened OAuth URL in system browser:', authUrl);

    return new Promise((resolve, reject) => {
      oauthResolveCallback = async (result) => {
        try {
          // If this is a re-authentication, pass the account ID to the callback handler
          if (storedReauthAccountId && result && result.code) {
            console.log('Processing re-authentication with account ID:', storedReauthAccountId);
            result = await TikTokService.handleAuthCallback(result.code, storedReauthAccountId);
          } else if (result && result.code) {
            // Normal authentication
            result = await TikTokService.handleAuthCallback(result.code);
          }

          resolve(result);
          oauthResolveCallback = null;
          stopOAuthServer();
        } catch (callbackError) {
          console.error('OAuth callback error:', callbackError);
          reject(callbackError);
          oauthResolveCallback = null;
          stopOAuthServer();
        }
      };

      // Timeout after 5 minutes
      setTimeout(() => {
        if (oauthResolveCallback) {
          oauthResolveCallback(null);
          oauthResolveCallback = null;
          stopOAuthServer();
          reject(new Error('OAuth timeout - authentication took too long'));
        }
      }, 5 * 60 * 1000);
    });

  } catch (error) {
    console.error('Error starting TikTok OAuth:', error);
    stopOAuthServer();
    throw error;
  }
});

ipcMain.handle('tiktok-get-accounts', async () => {
  try {
    return await TikTokService.getAccounts();
  } catch (error) {
    console.error('Error getting TikTok accounts:', error);
    return [];
  }
});

ipcMain.handle('tiktok-upload-video', async (event, videoData) => {
  try {
    const { accountId, videoFile, title, privacy_level } = videoData;

    const uploadData = {
      accountId,
      videoFile,
      title,
      privacy_level: privacy_level || 'SELF_ONLY'
    };

    const result = await TikTokService.uploadVideo(accountId, uploadData);
    return result;
  } catch (error) {
    console.error('Error uploading video to TikTok:', error);
    throw error;
  }
});

ipcMain.handle('tiktok-get-upload-history', async (event, userId) => {
  try {
    const history = await TikTokService.getUploadHistory(userId);
    return history;
  } catch (error) {
    console.error('Error getting TikTok upload history:', error);
    return [];
  }
});

ipcMain.handle('tiktok-remove-account', async (event, accountId) => {
  try {
    const success = await TikTokService.removeAccount(accountId);
    return { success, message: success ? 'Account removed successfully' : 'Account not found' };
  } catch (error) {
    console.error('Error removing TikTok account:', error);
    throw error;
  }
});

ipcMain.handle('tiktok-delete-history-item', async (event, historyId) => {
  try {
    const success = await TikTokService.deleteUploadHistoryItem(historyId);
    return { success, message: success ? 'History item deleted successfully' : 'History item not found' };
  } catch (error) {
    console.error('Error deleting TikTok history item:', error);
    throw error;
  }
});

ipcMain.handle('tiktok-clear-upload-history', async (event, userId) => {
  try {
    const success = await TikTokService.clearUploadHistory(userId);
    return { success, message: success ? 'Upload history cleared successfully' : 'Failed to clear history' };
  } catch (error) {
    console.error('Error clearing TikTok upload history:', error);
    throw error;
  }
});

ipcMain.handle('tiktok-generate-content', async (event, data) => {
  try {
    const result = await TikTokService.generateContent(data.fileName, data.userId, data.options);
    return result;
  } catch (error) {
    console.error('Error generating TikTok content:', error);
    throw error;
  }
});

ipcMain.handle('tiktok-generate-content-from-caption', async (event, data) => {
  try {
    const result = await TikTokService.generateContentFromCaption(data.filePath, data.language);
    return result;
  } catch (error) {
    console.error('Error generating TikTok content from caption:', error);
    throw error;
  }
});

// TikTok OAuth settings
ipcMain.handle('get-tiktok-client-key', async () => {
  try {
    return await geminiStore.getTikTokClientKey();
  } catch (error) {
    console.error('Error getting TikTok client key:', error);
    return null;
  }
});

ipcMain.handle('get-tiktok-client-secret', async () => {
  try {
    return await geminiStore.getTikTokClientSecret();
  } catch (error) {
    console.error('Error getting TikTok client secret:', error);
    return null;
  }
});

ipcMain.handle('set-tiktok-client-key', async (event, clientKey) => {
  try {
    await geminiStore.setTikTokClientKey(clientKey);
    return { success: true, message: 'TikTok client key updated successfully' };
  } catch (error) {
    console.error('Error setting TikTok client key:', error);
    throw error;
  }
});

ipcMain.handle('set-tiktok-client-secret', async (event, clientSecret) => {
  try {
    await geminiStore.setTikTokClientSecret(clientSecret);
    return { success: true, message: 'TikTok client secret updated successfully' };
  } catch (error) {
    console.error('Error setting TikTok client secret:', error);
    throw error;
  }
});

// Cleanup video server on app quit
app.on('before-quit', () => {
  stopVideoServer();
});
