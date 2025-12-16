
Berikut adalah Project Plan Master untuk membangun "Auto Clipper AI: YouTube to Shorts Generator" menggunakan Electron JS.
Rencana ini dirancang untuk alur kerja profesional, efisien, dan menggunakan referensi kode Gemini Store/Service yang Anda berikan sebagai basis manajemen API.
📁 Project Overview
Nama Project: AutoClipper AI
Tech Stack:
Core: Electron JS (Main & Renderer Process)
Frontend: React JS + Tailwind CSS (untuk UI Liquid Glass)
Backend Logic: Node.js
Video Engine: yt-dlp (Download), ffmpeg (Cutting/Processing)
AI Engine: Google Gemini (via google-generative-ai)
Database: JSON (Local Store - sesuai referensi script Anda)
📅 Phase 1: Environment & Architecture Setup
1.1 Inisialisasi Project
Buat struktur folder yang rapi untuk memisahkan logika UI, Service AI, dan Video Processing.
code
Bash
npm init -y
# Install Dependencies Utama
npm install electron react react-dom @google/generative-ai fluent-ffmpeg ytdl-core (atau yt-dlp-exec) youtube-transcript uuid
npm install --save-dev electron-builder concurrently wait-on cross-env tailwindcss postcss autoprefixer
1.2 Struktur Folder Project
code
Text
├── src/
│   ├── main/
│   │   ├── main.js              # Entry point Electron
│   │   ├── preload.js           # Bridge Frontend <-> Backend
│   │   └── handlers/            # IPC Handlers (Komunikasi)
│   ├── services/
│   │   ├── geminiStore.js       # (File Anda: DB & Management)
│   │   ├── geminiService.js     # (File Anda: AI Interaction)
│   │   ├── videoDownloader.js   # Logic yt-dlp
│   │   ├── videoCutter.js       # Logic ffmpeg
│   │   └── promptEngineer.js    # Logic Prompt Khusus Clipping
│   ├── ui/                      # React Frontend
│   │   ├── components/          # Reusable Components
│   │   ├── pages/               # Dashboard, Settings
│   │   ├── App.jsx
│   │   └── styles/              # Tailwind & Custom CSS
│   └── data/
│       └── db.json              # Database API Key
├── assets/                      # Icons, Fonts
└── package.json
🧠 Phase 2: Backend Logic Integration (The Brain)
Pada fase ini, kita mengintegrasikan script Anda dan menambahkan logika video.
2.1 Integrasi Gemini Store & Service
Simpan file geminiStore.js dan geminiService.js yang Anda berikan ke dalam folder src/services/.
Modifikasi Diperlukan: Pastikan geminiStore.js export path-nya benar relative terhadap environment Electron (gunakan app.getPath('userData') untuk lokasi db.json agar aman saat di-build).
2.2 Logic Video Downloader (videoDownloader.js)
Kita menggunakan wrapper untuk yt-dlp agar stabil.
code
JavaScript
// src/services/videoDownloader.js
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { app } = require('electron'); // Untuk path temp

// Pastikan binary yt-dlp ada di folder resources
const YTDLP_PATH = 'path/to/yt-dlp'; 

class VideoDownloader {
    async downloadVideo(url, jobId) {
        const outputDir = path.join(app.getPath('temp'), 'AutoClipper', jobId);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const outputFile = path.join(outputDir, 'source.mp4');
        
        // Command: Download Video Best Quality + Audio
        const command = `"${YTDLP_PATH}" -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4] / bv*+ba/b" "${url}" -o "${outputFile}"`;

        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Download error: ${error}`);
                    return reject(error);
                }
                resolve({ filePath: outputFile, dir: outputDir });
            });
        });
    }

    // Fitur Penting: Ambil Transcript untuk konteks AI
    async getTranscript(url) {
        // Gunakan library 'youtube-transcript' atau yt-dlp --write-subs
        // Ini vital agar Gemini tahu isi video tanpa nonton (hemat token)
        const { YoutubeTranscript } = require('youtube-transcript');
        try {
            const transcript = await YoutubeTranscript.fetchTranscript(url);
            return transcript.map(t => `${t.offset}: ${t.text}`).join('\n');
        } catch (e) {
            console.log("Transcript not available, fallback to metadata only");
            return null;
        }
    }
}
module.exports = new VideoDownloader();
2.3 Logic AI Clipper (promptEngineer.js)
Kita buat layer di atas geminiService.js milik Anda khusus untuk tugas clipping.
code
JavaScript
// src/services/promptEngineer.js
const geminiService = require('./geminiService');

class ClipperAgent {
    async analyzeVideoForClips(transcriptText, videoTitle) {
        // Prompt Engineering yang presisi
        const prompt = `
        Analisis transkrip video YouTube berikut dengan judul: "${videoTitle}".
        
        Tugasmu: Temukan 3-5 segmen paling VIRAL, lucu, atau insightful untuk dijadikan YouTube Shorts/Reels/TikTok.
        
        Format output WAJIB JSON Array murni:
        [
            {
                "start": "00:00:10",
                "end": "00:00:45",
                "virality_score": 9,
                "reason": "Momen lucu saat kucing melompat",
                "suggested_caption": "Kucing ini bikin ngakak! 🤣 #funny #cat"
            }
        ]
        
        Transkrip:
        ${transcriptText.substring(0, 30000)} 
        // Limit karakter agar tidak overload token
        `;

        // Menggunakan method generateContent dari script Anda
        // Kita bypass validasi nama file, kirim prompt langsung
        // *Note: Anda mungkin perlu sedikit modifikasi di geminiService.js 
        // untuk menerima raw prompt atau custom prompt template*
        
        try {
            // Memanggil service Anda
            const result = await geminiService.generateContent("Analysis_Request", "SYSTEM_USER", {
                customPrompt: prompt // Perlu modifikasi di geminiService agar support customPrompt
            });
            return result;
        } catch (error) {
            throw error;
        }
    }
}
module.exports = new ClipperAgent();
2.4 Logic Video Cutter (videoCutter.js)
Menggunakan fluent-ffmpeg.
code
JavaScript
// src/services/videoCutter.js
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

class VideoCutter {
    cutVideo(sourcePath, startTime, endTime, outputDir, index) {
        const outputPath = path.join(outputDir, `clip_${index}.mp4`);
        
        return new Promise((resolve, reject) => {
            ffmpeg(sourcePath)
                .setStartTime(startTime)
                .setDuration(this.calculateDuration(startTime, endTime))
                .output(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(err))
                .run();
        });
    }

    calculateDuration(start, end) {
        // Logic konversi HH:MM:SS ke detik dan hitung durasi
        // ...
    }
}
🎨 Phase 3: Frontend "Liquid Glass Black" (React + Tailwind)
3.1 Setup Tailwind Config
Tema Liquid Glass membutuhkan transparansi dan blur.
code
JavaScript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'glass-black': 'rgba(18, 18, 18, 0.6)',
        'glass-border': 'rgba(255, 255, 255, 0.08)',
        'neon-accent': '#00f2ff',
        'neon-glow': 'rgba(0, 242, 255, 0.4)',
      },
      backdropBlur: {
        'xs': '2px',
        'lg': '16px',
      }
    }
  }
}
3.2 CSS Utama (index.css)
code
CSS
body {
  background: #000000;
  background-image: 
    radial-gradient(circle at 50% 0%, #1a1a2e 0%, transparent 60%),
    radial-gradient(circle at 80% 80%, #16213e 0%, transparent 50%);
  color: #ffffff;
  font-family: 'Inter', sans-serif;
}

.liquid-card {
  background: rgba(20, 20, 20, 0.4);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  border-radius: 16px;
}

.neon-button {
  background: linear-gradient(45deg, transparent 5%, #00f2ff 5%);
  color: #000;
  box-shadow: 6px 0px 0px #00e1ee;
  transition: all 0.3s ease;
}
🚀 Phase 4: Implementation Step-by-Step
Step 1: Modifikasi geminiService.js (Penting)
Agar script Anda support logika clipper (bukan hanya file naming), tambahkan support untuk customPrompt di method generateContent.
code
JavaScript
// Di dalam class GeminiService, method generateContent:
// Ubah baris prompt selection:
const prompt = options.customPrompt || promptTemplates[language] || promptTemplates.indonesia;
Step 2: Halaman Settings (API Management)
Buat halaman di React untuk input Bulk API.
UI: Textarea besar untuk paste banyak API Key.
Action: Saat tombol "Add Keys" ditekan, panggil ipcRenderer.invoke('bulk-add-keys', text).
Backend: Main process memanggil GeminiStore.bulkAddApis(text) (sesuai script Anda).
Visual: Tampilkan list API Key dalam tabel glass morphism, dengan status (Active/Invalid) berwarna neon.
Step 3: Halaman Dashboard (Core Process)
Input: Kolom URL YouTube (Style: Liquid Input).
Process Button: Tombol "Analyze & Generate Clips".
Flow Backend (IPC Handler):
ipcMain.handle('start-process', async (event, url) => { ... })
Step A: Panggil VideoDownloader.getTranscript(url).
Step B: Kirim transcript ke ClipperAgent.analyzeVideoForClips(transcript).
Step C: Dapat JSON timestamps dari Gemini.
Step D: Panggil VideoDownloader.downloadVideo(url) (Video disimpan di temp).
Step E: Loop timestamps JSON -> Panggil VideoCutter.cutVideo().
Step F: Return path file hasil potongan ke Frontend.
Feedback Loop: Gunakan webContents.send('progress', ...) untuk update progress bar di UI (Download 20%... Analyzing AI... Cutting...).
Step 4: Menampilkan Hasil
Tampilkan grid video player untuk clip yang sudah jadi.
Tombol "Save to Disk" atau "Share".
🛠 Phase 5: Fitur Tambahan & Finishing
5.1 Fitur Smart Caption (Opsional tapi powerful)
Karena kita sudah punya transcript dan timestamp, kita bisa generate file .srt untuk setiap klip secara otomatis, sehingga saat diedit di CapCut/Premiere sudah ada subtitle-nya.
5.2 Error Handling (Menggunakan Logic Retry Anda)
Pastikan geminiService.js loop retry-nya berjalan. Jika Transcript terlalu panjang untuk 1 prompt token limit, logic harus memecah transcript menjadi "Chunks" (misal per 10 menit) lalu diproses loop.
5.3 Packaging
Gunakan electron-builder.
code
JSON
"build": {
  "appId": "com.autoclipper.ai",
  "win": {
    "target": "nsis",
    "icon": "assets/icon.ico"
  }
}
📝 Ringkasan Workflow Kode (Final Logic)
User paste URL & API Keys (Bulk).
System cek API Key aktif via geminiStore.
System fetch Transcript video via youtube-transcript.
AI (Gemini) baca transcript -> Output JSON: { start: "00:10", end: "00:40", viral_reason: "..." }.
System download Video HD via yt-dlp.
System potong video via ffmpeg berdasarkan timestamp JSON.
UI menampilkan notifikasi sukses dan list video clips.
Desain Liquid Glass Black akan membuat aplikasi terasa premium dan mahal, sesuai permintaan Anda. Semua logika API Gemini yang Anda berikan (validasi, rotation, rate limit) akan bekerja sempurna di layer services melindungi aplikasi dari limitasi kuota.