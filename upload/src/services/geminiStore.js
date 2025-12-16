const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class GeminiStore {
    constructor() {
        this.db = null;
        this.DB_PATH = path.join(__dirname, 'autocliper.db');
    }

    setDbPath(dbPath) {
        this.DB_PATH = dbPath.replace(/\.json$/, '.db');
        return this.initDatabase();
    }

    initDatabase() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.DB_PATH, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                    return;
                }

                // Create tables
                const createTables = [
                    `CREATE TABLE IF NOT EXISTS gemini_apis (
                        id REAL PRIMARY KEY,
                        api_key TEXT UNIQUE NOT NULL,
                        created_at TEXT NOT NULL,
                        status TEXT DEFAULT 'pending',
                        last_checked TEXT
                    )`,
                    `CREATE TABLE IF NOT EXISTS gemini_usage (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        api_id REAL,
                        user_id TEXT,
                        file_name TEXT,
                        success BOOLEAN,
                        error_message TEXT,
                        response_time INTEGER,
                        timestamp TEXT,
                        FOREIGN KEY (api_id) REFERENCES gemini_apis(id)
                    )`,
                    `CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )`,
                    `CREATE TABLE IF NOT EXISTS clipper_sessions (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        video_info TEXT NOT NULL,
                        clips TEXT NOT NULL,
                        saved_at TEXT NOT NULL,
                        channel_video TEXT
                    )`,
                    `CREATE TABLE IF NOT EXISTS video_status (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        video_path TEXT UNIQUE NOT NULL,
                        original_filename TEXT,
                        is_clipped BOOLEAN DEFAULT 0,
                        is_autocaptioned BOOLEAN DEFAULT 0,
                        youtube_uploaded BOOLEAN DEFAULT 0,
                        youtube_account TEXT,
                        youtube_video_id TEXT,
                        youtube_channel TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )`
                ];

                let completed = 0;
                createTables.forEach(sql => {
                    this.db.run(sql, (err) => {
                        if (err) {
                            console.error('Error creating table:', err);
                            reject(err);
                        } else {
                            completed++;
                            if (completed === createTables.length) {
                                console.log('✅ Database initialized successfully');
                                resolve();
                            }
                        }
                    });
                });
            });
        });
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }

    async getAllApis() {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT id, api_key as apiKey, created_at as createdAt, status, last_checked as lastChecked FROM gemini_apis ORDER BY created_at DESC", (err, rows) => {
                if (err) {
                    console.error('Error getting APIs:', err);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getCookiesPath() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT value FROM settings WHERE key = 'cookiesPath'", (err, row) => {
                if (err) {
                    console.error('Error getting cookies path:', err);
                    reject(err);
                } else {
                    resolve(row ? row.value : null);
                }
            });
        });
    }

    async getApifyApiKey() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT value FROM settings WHERE key = 'apifyApiKey'", (err, row) => {
                if (err) {
                    console.error('Error getting Apify API key:', err);
                    reject(err);
                } else {
                    resolve(row ? row.value : null);
                }
            });
        });
    }

    async setCookiesPath(path) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('cookiesPath', ?)", [path], function(err) {
                if (err) {
                    console.error('Error setting cookies path:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async setApifyApiKey(apiKey) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('apifyApiKey', ?)", [apiKey], function(err) {
                if (err) {
                    console.error('Error setting Apify API key:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async getYouTubeClientId() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT value FROM settings WHERE key = 'youtubeClientId'", (err, row) => {
                if (err) {
                    console.error('Error getting YouTube client ID:', err);
                    reject(err);
                } else {
                    resolve(row ? row.value : null);
                }
            });
        });
    }

    async getYouTubeClientSecret() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT value FROM settings WHERE key = 'youtubeClientSecret'", (err, row) => {
                if (err) {
                    console.error('Error getting YouTube client secret:', err);
                    reject(err);
                } else {
                    resolve(row ? row.value : null);
                }
            });
        });
    }

    async setYouTubeClientId(clientId) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('youtubeClientId', ?)", [clientId], function(err) {
                if (err) {
                    console.error('Error setting YouTube client ID:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async setYouTubeClientSecret(clientSecret) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('youtubeClientSecret', ?)", [clientSecret], function(err) {
                if (err) {
                    console.error('Error setting YouTube client secret:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async getTikTokClientKey() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT value FROM settings WHERE key = 'tiktokClientKey'", (err, row) => {
                if (err) {
                    console.error('Error getting TikTok client key:', err);
                    reject(err);
                } else {
                    resolve(row ? row.value : null);
                }
            });
        });
    }

    async getTikTokClientSecret() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT value FROM settings WHERE key = 'tiktokClientSecret'", (err, row) => {
                if (err) {
                    console.error('Error getting TikTok client secret:', err);
                    reject(err);
                } else {
                    resolve(row ? row.value : null);
                }
            });
        });
    }

    async setTikTokClientKey(clientKey) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('tiktokClientKey', ?)", [clientKey], function(err) {
                if (err) {
                    console.error('Error setting TikTok client key:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async setTikTokClientSecret(clientSecret) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('tiktokClientSecret', ?)", [clientSecret], function(err) {
                if (err) {
                    console.error('Error setting TikTok client secret:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async bulkAddApis(apiKeysText) {
        try {
            // Parse bulk input: Pisah berdasarkan newline, comma, atau space
            const apiKeys = apiKeysText
                .split(/[\n,\s]+/)
                .map(key => key.trim())
                .filter(key => key.length > 0 && key.length > 10); // Basic filter

            if (apiKeys.length === 0) {
                throw new Error('Tidak ada API key yang valid untuk ditambahkan');
            }

            // Cek total API keys yang sudah ada
            const existingApis = await this.getAllApis();
            const totalCurrentApis = existingApis.length;

            if (totalCurrentApis >= 50) {
                throw new Error('Sudah mencapai batas maksimal 50 API key. Hapus sebagian API key lama sebelum menambahkan yang baru.');
            }

            const validationService = require('./geminiService');
            const results = [];
            const validApis = [];

            // Validasi satu per satu dulu
            for (const apiKey of apiKeys) {
                try {
                    // Cek apakah key sudah ada
                    if (existingApis.some(api => api.apiKey === apiKey)) {
                        results.push({
                            apiKey: apiKey.substring(0, 10) + '...',
                            status: 'duplicate',
                            message: 'API key sudah ada di database'
                        });
                        continue;
                    }

                    // Validasi API key dengan Gemini
                    console.log(`Validating API key: ${apiKey.substring(0, 10)}...`);
                    const isValid = await validationService.validateApiKey(apiKey);

                    if (isValid) {
                        validApis.push(apiKey);
                        results.push({
                            apiKey: apiKey.substring(0, 10) + '...',
                            status: 'valid',
                            message: 'API key valid dan siap ditambahkan'
                        });
                    } else {
                        results.push({
                            apiKey: apiKey.substring(0, 10) + '...',
                            status: 'invalid',
                            message: 'API key tidak valid, tidak ditambahkan'
                        });
                    }

                    // Delay untuk menghindari rate limiting (ditambah lebih lama)
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } catch (error) {
                    results.push({
                        apiKey: apiKey.substring(0, 10) + '...',
                        status: 'error',
                        message: `Error validasi: ${error.message}`
                    });
                }
            }

            // Hitung berapa yang bisa ditambahkan (hanya yang valid)
            const availableSlots = 50 - totalCurrentApis;
            const apisToAdd = validApis.slice(0, availableSlots);

            if (validApis.length > availableSlots) {
                results.push({
                    apiKey: 'SYSTEM',
                    status: 'warning',
                    message: `Hanya ${availableSlots} API key valid yang bisa ditambahkan (batas maksimal 50 tercapai)`
                });
            }

            // Tambahkan yang valid ke database
            const addedApis = [];
            for (const apiKey of apisToAdd) {
                try {
                    const newApi = await this._addValidatedApi(apiKey);
                    addedApis.push({ id: newApi.id, apiKey: apiKey.substring(0, 10) + '...' });
                } catch (error) {
                    console.error(`Error adding validated API key:`, error);
                    results.push({
                        apiKey: apiKey.substring(0, 10) + '...',
                        status: 'error',
                        message: `Gagal menambah ke database: ${error.message}`
                    });
                }
            }

            const finalCount = await this.getAllApis();
            const summary = {
                totalInput: apiKeys.length,
                validKeys: validApis.length,
                invalidKeys: results.filter(r => r.status === 'invalid').length,
                duplicatedKeys: results.filter(r => r.status === 'duplicate').length,
                addedToDB: addedApis.length,
                totalInDB: finalCount.length,
                maxLimit: 50,
                availableSlots: 50 - finalCount.length,
                mode: 'with_validation',
                results: results
            };

            return summary;
        } catch (error) {
            console.error('Error bulk adding Gemini APIs:', error);
            throw error;
        }
    }

    async _addValidatedApi(apiKey) {
        return new Promise((resolve, reject) => {
            const id = Date.now() + Math.random();
            const createdAt = new Date().toISOString();
            const lastChecked = new Date().toISOString();

            this.db.run(
                "INSERT INTO gemini_apis (id, api_key, created_at, status, last_checked) VALUES (?, ?, ?, 'active', ?)",
                [id, apiKey, createdAt, lastChecked],
                function(err) {
                    if (err) {
                        console.error('Error adding validated Gemini API:', err);
                        reject(err);
                    } else {
                        resolve({ id, apiKey, createdAt, status: 'active', lastChecked });
                    }
                }
            );
        });
    }

    async _addApiWithoutValidation(apiKey) {
        return new Promise((resolve, reject) => {
            const id = Date.now() + Math.random();
            const createdAt = new Date().toISOString();

            this.db.run(
                "INSERT INTO gemini_apis (id, api_key, created_at, status) VALUES (?, ?, ?, 'pending')",
                [id, apiKey, createdAt],
                function(err) {
                    if (err) {
                        console.error('Error adding Gemini API without validation:', err);
                        reject(err);
                    } else {
                        resolve({ id, apiKey, createdAt, status: 'pending' });
                    }
                }
            );
        });
    }

    async validateBulkApis(apisToValidate) {
        const validationService = require('./geminiService');

        for (const api of apisToValidate) {
            try {
                const isValid = await validationService.validateApiKey(api.apiKey);
                await this.updateApiStatus(api.id, isValid ? 'active' : 'invalid');
                console.log(`Bulk validation: API key ${api.id} - ${isValid ? 'VALID' : 'INVALID'}`);
            } catch (error) {
                console.error(`Bulk validation failed for API key ${api.id}:`, error);
                await this.updateApiStatus(api.id, 'error');
            }

            // Delay antara validasi untuk menghindari rate limit
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    async logApiUsage(apiId, userId, fileName, success, errorMessage = null, responseTime = null) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT INTO gemini_usage (api_id, user_id, file_name, success, error_message, response_time, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [apiId, userId, fileName, success, errorMessage, responseTime, new Date().toISOString()],
                (err) => {
                    if (err) {
                        console.error('Error logging Gemini API usage:', err);
                        reject(err);
                    } else {
                        // Clean up old logs (keep last 1000)
                        this.db.run("DELETE FROM gemini_usage WHERE id NOT IN (SELECT id FROM gemini_usage ORDER BY id DESC LIMIT 1000)");
                        resolve();
                    }
                }
            );
        }).catch(err => {
            console.error('Error in logApiUsage:', err);
        });
    }

    async deleteApi(apiId) {
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM gemini_apis WHERE id = ?", [apiId], function(err) {
                if (err) {
                    console.error('Error deleting Gemini API:', err);
                    reject(err);
                } else {
                    console.log(`Successfully deleted API with ID: ${apiId}`);
                    resolve(this.changes > 0);
                }
            });
        });
    }

    async updateApiStatus(apiId, status) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "UPDATE gemini_apis SET status = ?, last_checked = ? WHERE id = ?",
                [status, new Date().toISOString(), apiId],
                function(err) {
                    if (err) {
                        console.error('Error updating API status:', err);
                        reject(err);
                    } else {
                        resolve(this.changes > 0);
                    }
                }
            );
        });
    }

    // New methods for clipper sessions
    async saveClipperSession(session) {
        return new Promise((resolve, reject) => {
            // Extract channel from videoInfo for separate column
            const channelVideo = session.videoInfo && session.videoInfo.channel ? session.videoInfo.channel : null;

            this.db.run(
                "INSERT OR REPLACE INTO clipper_sessions (id, title, video_info, clips, saved_at, channel_video) VALUES (?, ?, ?, ?, ?, ?)",
                [session.id, session.title, JSON.stringify(session.videoInfo), JSON.stringify(session.clips), session.savedAt, channelVideo],
                function(err) {
                    if (err) {
                        console.error('Error saving clipper session:', err);
                        reject(err);
                    } else {
                        resolve(session);
                    }
                }
            );
        });
    }

    async getClipperSessions() {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT id, title, video_info, clips, saved_at, channel_video FROM clipper_sessions ORDER BY saved_at DESC", (err, rows) => {
                if (err) {
                    console.error('Error getting clipper sessions:', err);
                    reject(err);
                } else {
                    // Parse JSON fields
                    const sessions = rows.map(row => ({
                        id: row.id,
                        title: row.title,
                        videoInfo: JSON.parse(row.video_info),
                        clips: JSON.parse(row.clips),
                        savedAt: row.saved_at,
                        channelVideo: row.channel_video
                    }));
                    resolve(sessions);
                }
            });
        });
    }

    async deleteClipperSession(sessionId) {
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM clipper_sessions WHERE id = ?", [sessionId], function(err) {
                if (err) {
                    console.error('Error deleting clipper session:', err);
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }

    async getSelectedModel() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT value FROM settings WHERE key = 'selectedGeminiModel'", (err, row) => {
                if (err) {
                    console.error('Error getting selected model:', err);
                    reject(err);
                } else {
                    resolve(row ? row.value : 'gemini-2.0-flash'); // Default to 2.0-flash
                }
            });
        });
    }

    async setSelectedModel(model) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('selectedGeminiModel', ?)", [model], function(err) {
                if (err) {
                    console.error('Error setting selected model:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async getPrompt() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT value FROM settings WHERE key = 'customPrompt'", (err, row) => {
                if (err) {
                    console.error('Error getting prompt:', err);
                    reject(err);
                } else {
                    resolve(row ? row.value : null);
                }
            });
        });
    }

    async setPrompt(prompt) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('customPrompt', ?)", [prompt], function(err) {
                if (err) {
                    console.error('Error setting prompt:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    // Video status tracking methods
    async updateVideoStatus(videoPath, updates) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            const fields = [];
            const values = [];

            // Build dynamic UPDATE query
            if (updates.original_filename !== undefined) {
                fields.push('original_filename = ?');
                values.push(updates.original_filename);
            }
            if (updates.is_clipped !== undefined) {
                fields.push('is_clipped = ?');
                values.push(updates.is_clipped ? 1 : 0);
            }
            if (updates.is_autocaptioned !== undefined) {
                fields.push('is_autocaptioned = ?');
                values.push(updates.is_autocaptioned ? 1 : 0);
            }
            if (updates.youtube_uploaded !== undefined) {
                fields.push('youtube_uploaded = ?');
                values.push(updates.youtube_uploaded ? 1 : 0);
            }
            if (updates.youtube_account !== undefined) {
                fields.push('youtube_account = ?');
                values.push(updates.youtube_account);
            }
            if (updates.youtube_video_id !== undefined) {
                fields.push('youtube_video_id = ?');
                values.push(updates.youtube_video_id);
            }
            if (updates.youtube_channel !== undefined) {
                fields.push('youtube_channel = ?');
                values.push(updates.youtube_channel);
            }

            if (fields.length === 0) {
                resolve(false);
                return;
            }

            fields.push('updated_at = ?');
            values.push(now);
            values.push(videoPath);

            const sql = `UPDATE video_status SET ${fields.join(', ')} WHERE video_path = ?`;

            this.db.run(sql, values, function(err) {
                if (err) {
                    console.error('Error updating video status:', err);
                    reject(err);
                } else {
                    if (this.changes === 0) {
                        // No existing record, insert new one
                        const insertFields = ['video_path', 'created_at', 'updated_at'];
                        const insertValues = [videoPath, now, now];
                        const insertPlaceholders = ['?', '?', '?'];

                        // Add all the update fields
                        Object.keys(updates).forEach(key => {
                            if (updates[key] !== undefined) {
                                insertFields.push(key);
                                insertValues.push(key === 'is_clipped' || key === 'is_autocaptioned' || key === 'youtube_uploaded' ? (updates[key] ? 1 : 0) : updates[key]);
                                insertPlaceholders.push('?');
                            }
                        });

                        const insertSql = `INSERT INTO video_status (${insertFields.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`;

                        this.db.run(insertSql, insertValues, function(insertErr) {
                            if (insertErr) {
                                console.error('Error inserting video status:', insertErr);
                                reject(insertErr);
                            } else {
                                resolve(true);
                            }
                        });
                    } else {
                        resolve(true);
                    }
                }
            }.bind(this));
        });
    }

    async getVideoStatus(videoPath) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM video_status WHERE video_path = ?", [videoPath], (err, row) => {
                if (err) {
                    console.error('Error getting video status:', err);
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }

    async getAllVideoStatuses() {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM video_status ORDER BY updated_at DESC", (err, rows) => {
                if (err) {
                    console.error('Error getting all video statuses:', err);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async deleteVideoStatus(videoPath) {
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM video_status WHERE video_path = ?", [videoPath], function(err) {
                if (err) {
                    console.error('Error deleting video status:', err);
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }

    // Backup and restore functionality
    async createBackup() {
        try {
            console.log('Creating settings backup...');

            // Collect all settings data
            const backupData = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                settings: {}
            };

            // Get all API keys
            const apis = await this.getAllApis();
            backupData.settings.geminiApis = apis.map(api => ({
                apiKey: api.apiKey,
                createdAt: api.createdAt,
                status: api.status
            }));

            // Get all settings
            const settingsQueries = [
                'cookiesPath',
                'apifyApiKey',
                'youtubeClientId',
                'youtubeClientSecret',
                'selectedGeminiModel',
                'customPrompt'
            ];

            for (const settingKey of settingsQueries) {
                try {
                    const value = await new Promise((resolve, reject) => {
                        this.db.get("SELECT value FROM settings WHERE key = ?", [settingKey], (err, row) => {
                            if (err) reject(err);
                            else resolve(row ? row.value : null);
                        });
                    });
                    if (value !== null) {
                        backupData.settings[settingKey] = value;
                    }
                } catch (error) {
                    console.warn(`Could not backup setting ${settingKey}:`, error.message);
                }
            }

            console.log('Settings backup created successfully');
            return backupData;

        } catch (error) {
            console.error('Error creating backup:', error);
            throw error;
        }
    }

    async restoreBackup(backupData) {
        try {
            console.log('Restoring settings from backup...');

            if (!backupData || !backupData.settings) {
                throw new Error('Invalid backup data format');
            }

            // Clear existing data first
            console.log('Clearing existing settings...');

            // Delete all API keys
            await new Promise((resolve, reject) => {
                this.db.run("DELETE FROM gemini_apis", (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Delete all settings
            await new Promise((resolve, reject) => {
                this.db.run("DELETE FROM settings", (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Restore API keys
            if (backupData.settings.geminiApis && Array.isArray(backupData.settings.geminiApis)) {
                console.log(`Restoring ${backupData.settings.geminiApis.length} API keys...`);
                for (const api of backupData.settings.geminiApis) {
                    if (api.apiKey && api.createdAt) {
                        await new Promise((resolve, reject) => {
                            this.db.run(
                                "INSERT INTO gemini_apis (id, api_key, created_at, status) VALUES (?, ?, ?, ?)",
                                [Date.now() + Math.random(), api.apiKey, api.createdAt, api.status || 'active'],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    }
                }
            }

            // Restore settings
            const settingsToRestore = [
                'cookiesPath',
                'apifyApiKey',
                'youtubeClientId',
                'youtubeClientSecret',
                'selectedGeminiModel',
                'customPrompt'
            ];

            for (const settingKey of settingsToRestore) {
                if (backupData.settings[settingKey] !== undefined) {
                    await new Promise((resolve, reject) => {
                        this.db.run(
                            "INSERT INTO settings (key, value) VALUES (?, ?)",
                            [settingKey, backupData.settings[settingKey]],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                    console.log(`Restored setting: ${settingKey}`);
                }
            }

            console.log('Settings restoration completed successfully');
            return { success: true, message: 'Settings restored successfully' };

        } catch (error) {
            console.error('Error restoring backup:', error);
            throw error;
        }
    }

    async exportBackupToFile(filePath) {
        try {
            const backupData = await this.createBackup();
            const fs = require('fs').promises;
            await fs.writeFile(filePath, JSON.stringify(backupData, null, 2), 'utf8');
            console.log('Backup exported to file:', filePath);
            return { success: true, filePath };
        } catch (error) {
            console.error('Error exporting backup:', error);
            throw error;
        }
    }

    async importBackupFromFile(filePath) {
        try {
            const fs = require('fs').promises;
            const backupContent = await fs.readFile(filePath, 'utf8');
            const backupData = JSON.parse(backupContent);

            const result = await this.restoreBackup(backupData);
            console.log('Backup imported from file:', filePath);
            return result;
        } catch (error) {
            console.error('Error importing backup:', error);
            throw error;
        }
    }
}

module.exports = new GeminiStore();
