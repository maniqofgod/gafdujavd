const fs = require('fs');
const path = require('path');

// SQLite setup for TikTok accounts and history
function createDB() {
  // Use global app reference for packaged apps, fallback to require for development
  let appRef;
  try {
    appRef = global.app || require('electron').app;
  } catch {
    console.error('Cannot get electron app reference!');
    return null;
  }

  const userDataPath = path.join(appRef.getPath('userData'), 'autocliper_tiktok.db');
  console.log('TikTokService using database path:', userDataPath);

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(userDataPath);

  // Create tables if they don't exist
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      open_id TEXT UNIQUE NOT NULL,
      username TEXT,
      display_name TEXT,
      avatar_url TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER,
      createdAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS uploadHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      publish_id TEXT,
      video_url TEXT,
      title TEXT,
      uploadedAt TEXT,
      accountName TEXT,
      status TEXT,
      privacy_level TEXT,
      error TEXT,
      FOREIGN KEY (userId) REFERENCES accounts(open_id)
    )`);
  });

  return {
    db,
    async getAccounts() {
      return new Promise((resolve, reject) => {
        db.all('SELECT * FROM accounts', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },
    async getAccountById(openId) {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM accounts WHERE open_id = ?', [openId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },
    async getUploadHistory(userId = null) {
      return new Promise((resolve, reject) => {
        const query = userId ? 'SELECT * FROM uploadHistory WHERE userId = ? ORDER BY id DESC' : 'SELECT * FROM uploadHistory ORDER BY id DESC';
        db.all(query, userId ? [userId] : [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },
    async findAccountByOpenId(openId) {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM accounts WHERE open_id = ?', [openId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },
    async insertAccount(account) {
      return new Promise((resolve, reject) => {
        const query = `INSERT INTO accounts
          (open_id, username, display_name, avatar_url, access_token, refresh_token, expires_at, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
          account.open_id, account.username, account.display_name, account.avatar_url,
          account.access_token, account.refresh_token, account.expires_at, account.createdAt
        ];
        db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    },
    async updateAccount(openId, data) {
      return new Promise((resolve, reject) => {
        const sets = [];
        const params = [];
        if (data.username) { sets.push('username = ?'); params.push(data.username); }
        if (data.display_name) { sets.push('display_name = ?'); params.push(data.display_name); }
        if (data.avatar_url) { sets.push('avatar_url = ?'); params.push(data.avatar_url); }
        if (data.tokens) {
          sets.push('access_token = ?'); params.push(data.tokens.access_token);
          sets.push('refresh_token = ?'); params.push(data.tokens.refresh_token);
          sets.push('expires_at = ?'); params.push(data.tokens.expires_at);
        }
        params.push(openId);
        const query = `UPDATE accounts SET ${sets.join(', ')} WHERE open_id = ?`;
        db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
    },
    async insertUploadHistory(history) {
      return new Promise((resolve, reject) => {
        const query = `INSERT INTO uploadHistory
          (userId, publish_id, video_url, title, uploadedAt, accountName, status, privacy_level, error)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
          history.userId, history.publish_id, history.video_url, history.title,
          history.uploadedAt, history.accountName, history.status, history.privacy_level, history.error
        ];
        db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    },
    async updateUploadHistory(id, data) {
      return new Promise((resolve, reject) => {
        const sets = [];
        const params = [];
        Object.keys(data).forEach(key => {
          sets.push(`${key} = ?`);
          params.push(data[key]);
        });
        params.push(id);
        const query = `UPDATE uploadHistory SET ${sets.join(', ')} WHERE id = ?`;
        db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
    },
    async deleteUploadHistory(id) {
      return new Promise((resolve, reject) => {
        db.run('DELETE FROM uploadHistory WHERE id = ?', [id], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
    },
    async deleteAccount(openId) {
      return new Promise((resolve, reject) => {
        db.run('DELETE FROM accounts WHERE open_id = ?', [openId], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
    },
    async clearUploadHistory(userId = null) {
      return new Promise((resolve, reject) => {
        const query = userId ? 'DELETE FROM uploadHistory WHERE userId = ?' : 'DELETE FROM uploadHistory';
        db.run(query, userId ? [userId] : [], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
    },
    close() {
      db.close();
    }
  };
}

// File upload setup - initialize later when app is available
let uploadDir = null;

function initializeUploadDir() {
  if (!uploadDir && global.app) {
    uploadDir = path.join(global.app.getPath('userData'), 'tiktok_uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    console.log('TikTok upload directory initialized:', uploadDir);
  }
}

// TikTok Service Functions
class TikTokService {
  static async initializeOAuth() {
    // TikTok OAuth is handled through web flow, no client initialization needed here
    return true;
  }

  static async getAuthUrl() {
    // Get credentials from store
    const geminiStore = require('./geminiStore');
    const clientKey = await geminiStore.getTikTokClientKey();
    const clientSecret = await geminiStore.getTikTokClientSecret();

    if (!clientKey || !clientSecret) {
      throw new Error('TikTok OAuth credentials not configured');
    }

    const csrfState = Math.random().toString(36).substring(7);
    sessionStorage.setItem('tiktok_csrf_state', csrfState);

    const params = new URLSearchParams({
      client_key: clientKey,
      redirect_uri: 'http://localhost:7033/auth/tiktok/callback',
      response_type: 'code',
      scope: 'user.info.basic,video.upload,video.publish',
      state: csrfState
    });

    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }

  static async handleAuthCallback(code) {
    try {
      console.log('=== TikTok Auth Callback Started ===');

      // Get credentials from store
      const geminiStore = require('./geminiStore');
      const clientKey = await geminiStore.getTikTokClientKey();
      const clientSecret = await geminiStore.getTikTokClientSecret();

      if (!clientKey || !clientSecret) {
        throw new Error('TikTok OAuth credentials not configured');
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: 'http://localhost:7033/auth/tiktok/callback',
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json();
        throw new Error(error.error_description || error.error || 'Failed to exchange code');
      }

      const tokenData = await tokenResponse.json();

      // Fetch user info
      const userResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name,avatar_url', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to fetch user info');
      }

      const userData = await userResponse.json();
      const user = userData.data?.user || {};

      const account = {
        open_id: tokenData.open_id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in * 1000),
        createdAt: new Date().toISOString()
      };

      const db = await createDB();

      // Check if account exists
      const existingAccount = await db.findAccountByOpenId(account.open_id);
      if (existingAccount) {
        await db.updateAccount(account.open_id, {
          tokens: {
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at
          },
          username: account.username,
          display_name: account.display_name,
          avatar_url: account.avatar_url
        });
      } else {
        await db.insertAccount(account);
      }

      return { account };
    } catch (error) {
      throw new Error(`TikTok auth callback failed: ${error.message}`);
    }
  }

  static async getAccounts() {
    const db = await createDB();
    const accounts = await db.getAccounts();
    return accounts;
  }

  static async getAccountById(openId) {
    const db = await createDB();
    const account = await db.getAccountById(openId);
    if (!account) {
      throw new Error('Account not found');
    }
    return account;
  }

  static async getUploadHistory(userId) {
    const db = await createDB();
    const history = await db.getUploadHistory(userId);
    return history;
  }

  static async removeAccount(openId) {
    const db = await createDB();
    const account = await this.getAccountById(openId);
    const changes = await db.deleteAccount(openId);
    if (changes > 0) {
      console.log(`Removed TikTok account: ${account.display_name} (${account.username})`);
      return true;
    }
    return false;
  }

  static async deleteUploadHistoryItem(historyId) {
    const db = await createDB();
    const changes = await db.deleteUploadHistory(historyId);
    if (changes > 0) {
      console.log(`Removed upload history item: ${historyId}`);
      return true;
    }
    return false;
  }

  static async clearUploadHistory(userId = null) {
    const db = await createDB();
    const changes = await db.clearUploadHistory(userId);
    if (changes > 0) {
      console.log(`Cleared upload history${userId ? ` for user ${userId}` : ' (all)'}`);
      return true;
    }
    return false;
  }

  static async validateAccountToken(openId) {
    try {
      const account = await this.getAccountById(openId);

      // Check if token is expired (with 5 min buffer)
      if (account.expires_at && Date.now() > account.expires_at - 300000) {
        console.log('TikTok token expired, attempting refresh...');

        // Get credentials from store
        const geminiStore = require('./geminiStore');
        const clientKey = await geminiStore.getTikTokClientKey();
        const clientSecret = await geminiStore.getTikTokClientSecret();

        if (!clientKey || !clientSecret) {
          throw new Error('TikTok OAuth credentials not configured');
        }

        // Refresh token
        const refreshResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            refresh_token: account.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        if (!refreshResponse.ok) {
          const error = await refreshResponse.json();
          if (error.error === 'invalid_grant') {
            return {
              valid: false,
              error: `Token TikTok sudah expired. Silakan login ulang.`,
              tokenExpired: true
            };
          }
          throw new Error('Failed to refresh token');
        }

        const refreshData = await refreshResponse.json();

        // Update account with new tokens
        const db = await createDB();
        await db.updateAccount(openId, {
          tokens: {
            access_token: refreshData.access_token,
            refresh_token: refreshData.refresh_token || account.refresh_token,
            expires_at: Date.now() + (refreshData.expires_in * 1000)
          }
        });

        return { valid: true, refreshed: true };
      }

      // Test token validity with a simple API call
      const testResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id', {
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
        },
      });

      if (!testResponse.ok) {
        return {
          valid: false,
          error: 'Token validation failed',
          tokenExpired: true
        };
      }

      return { valid: true };
    } catch (error) {
      console.log('Token validation failed:', error.message);
      return {
        valid: false,
        error: error.message,
        tokenExpired: true
      };
    }
  }

  static async uploadVideo(accountId, videoData) {
    console.log('Starting TikTok upload for account ID:', accountId);

    // 1. Validate token
    const tokenValidation = await this.validateAccountToken(accountId);

    if (!tokenValidation.valid) {
      const errorMessage = tokenValidation.tokenExpired
        ? `Token TikTok expired. Silakan login ulang.`
        : `Token validation failed: ${tokenValidation.error}`;

      // Save failure history
      try {
        const db = await createDB();
        const account = await db.getAccountById(accountId).catch(() => null);
        await db.insertUploadHistory({
          userId: accountId,
          publish_id: null,
          video_url: null,
          title: videoData.title,
          uploadedAt: new Date().toISOString(),
          accountName: account ? account.display_name : 'Unknown Account',
          status: 'Gagal',
          error: errorMessage
        });
      } catch (e) { /* ignore history error */ }

      throw new Error(errorMessage);
    }

    // 2. Get updated account
    const account = await this.getAccountById(accountId);

    try {
      const videoFilePath = videoData.videoFile && videoData.videoFile.path ? videoData.videoFile.path : videoData.videoFile;

      if (!videoFilePath || !fs.existsSync(videoFilePath)) {
        throw new Error(`Video file not found: ${videoFilePath}`);
      }

      // Validate title - TikTok requirement
      if (!videoData.title || typeof videoData.title !== 'string' || videoData.title.trim().length === 0) {
        throw new Error('Judul video tidak boleh kosong. Silakan isi judul video terlebih dahulu.');
      }

      let title = videoData.title.trim();
      if (title.length < 1) {
        throw new Error('Judul video tidak boleh kosong setelah trim.');
      }

      // Trim title if too long (TikTok max 100 characters)
      if (title.length > 100) {
        console.log(`Title too long (${title.length} chars), truncating to 100 chars`);
        title = title.substring(0, 97) + '...';
      }

      console.log('Uploading video to TikTok from path:', videoFilePath);
      console.log('Final video title:', title);

      // Step 1: Initialize video upload
      const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: fs.statSync(videoFilePath).size,
            chunk_size: fs.statSync(videoFilePath).size,
            total_chunk_count: 1,
          },
        }),
      });

      if (!initResponse.ok) {
        const error = await initResponse.json();
        throw new Error(error.error?.message || 'Failed to initialize upload');
      }

      const initData = await initResponse.json();
      const { upload_url, publish_id } = initData.data;

      // Step 2: Upload video file
      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes 0-${fs.statSync(videoFilePath).size - 1}/${fs.statSync(videoFilePath).size}`,
        },
        body: fs.createReadStream(videoFilePath),
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload video file to TikTok');
      }

      // Step 3: Publish the video
      const publishResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publish_id: publish_id,
          post_info: {
            title: title,
            privacy_level: videoData.privacy_level || 'SELF_ONLY',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
        }),
      });

      if (!publishResponse.ok) {
        const error = await publishResponse.json();
        throw new Error(error.error?.message || 'Failed to publish video');
      }

      const publishData = await publishResponse.json();

      // Save success history
      const db = await createDB();
      await db.insertUploadHistory({
        userId: account.open_id,
        publish_id: publish_id,
        video_url: `https://www.tiktok.com/@${account.username}`,
        title: videoData.title,
        uploadedAt: new Date().toISOString(),
        accountName: account.display_name,
        status: 'Berhasil',
        privacy_level: videoData.privacy_level || 'SELF_ONLY'
      });

      return {
        publish_id,
        video_url: `https://www.tiktok.com/@${account.username}`,
        message: 'Video berhasil diupload ke TikTok! Video akan muncul di inbox TikTok Anda.',
        success: true
      };

    } catch (error) {
      let errorMessage = error.message;

      // Save failure history
      const db = await createDB();
      await db.insertUploadHistory({
        userId: account.open_id,
        publish_id: null,
        video_url: null,
        title: videoData.title,
        uploadedAt: new Date().toISOString(),
        accountName: account.display_name,
        status: 'Gagal',
        error: errorMessage
      });

      throw new Error(errorMessage);
    }
  }
}

module.exports = { TikTokService };
