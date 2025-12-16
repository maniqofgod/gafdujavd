const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { mergeAudioAndVideo } = require('./videoProcessor');

// SQLite setup for YouTube accounts and history
function createDB() {
  // Use global app reference for packaged apps, fallback to require for development
  let appRef;
  try {
    appRef = global.app || require('electron').app;
  } catch {
    console.error('Cannot get electron app reference!');
    return null;
  }

  const userDataPath = path.join(appRef.getPath('userData'), 'autocliper.db');
  console.log('YouTubeService using database path:', userDataPath);

  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(userDataPath);

  // Create tables if they don't exist
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER,
      createdAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS uploadHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      videoId TEXT,
      videoUrl TEXT,
      title TEXT,
      uploadedAt TEXT,
      accountName TEXT,
      status TEXT,
      publishAt TEXT,
      privacyStatus TEXT,
      playlistAdded INTEGER DEFAULT 0,
      playlistName TEXT,
      error TEXT,
      FOREIGN KEY (userId) REFERENCES accounts(id)
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
    async getAccountById(id) {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM accounts WHERE id = ?', [id], (err, row) => {
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
    async findAccountByEmail(email) {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM accounts WHERE email = ?', [email], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },
    async insertAccount(account) {
      return new Promise((resolve, reject) => {
        const query = `INSERT INTO accounts
          (email, name, picture, access_token, refresh_token, expiry_date, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const params = [
          account.email, account.name, account.picture,
          account.tokens.access_token, account.tokens.refresh_token,
          account.tokens.expiry_date, account.createdAt
        ];
        db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    },
    async updateAccount(id, data) {
      return new Promise((resolve, reject) => {
        const sets = [];
        const params = [];
        if (data.name) { sets.push('name = ?'); params.push(data.name); }
        if (data.picture) { sets.push('picture = ?'); params.push(data.picture); }
        if (data.tokens) {
          sets.push('access_token = ?'); params.push(data.tokens.access_token);
          sets.push('refresh_token = ?'); params.push(data.tokens.refresh_token);
          sets.push('expiry_date = ?'); params.push(data.tokens.expiry_date);
        }
        params.push(id);
        const query = `UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`;
        db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
    },
    async insertUploadHistory(history) {
      return new Promise((resolve, reject) => {
        const query = `INSERT INTO uploadHistory
          (userId, videoId, videoUrl, title, uploadedAt, accountName, status, publishAt, privacyStatus, playlistAdded, playlistName, error)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
          history.userId, history.videoId, history.videoUrl, history.title,
          history.uploadedAt, history.accountName, history.status, history.publishAt,
          history.privacyStatus, history.playlistAdded ? 1 : 0, history.playlistName, history.error
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
    async deleteAccount(id) {
      return new Promise((resolve, reject) => {
        db.run('DELETE FROM accounts WHERE id = ?', [id], function(err) {
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

// OAuth2 client setup - Will be initialized dynamically with credentials from DB
let oauth2Client = null;

// File upload setup - initialize later when app is available
let uploadDir = null;

function initializeUploadDir() {
  if (!uploadDir && global.app) {
    uploadDir = path.join(global.app.getPath('userData'), 'youtube_uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    console.log('YouTube upload directory initialized:', uploadDir);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// YouTube Service Functions
class YouTubeService {
  static async initializeOAuth() {
    if (!oauth2Client) {
      // Get credentials from store
      const geminiStore = require('./geminiStore');
      const clientId = await geminiStore.getYouTubeClientId();
      const clientSecret = await geminiStore.getYouTubeClientSecret();

      if (!clientId || !clientSecret) {
        throw new Error('YouTube OAuth credentials not configured');
      }

      oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        `${process.env.NODE_ENV === 'development' ? 'http://localhost:6033' : 'http://localhost:7033'}/api/auth/google/callback`
      );
    }
    return oauth2Client;
  }

  static async getAuthUrl(port = null, reauthAccountId = null) {
    await this.initializeOAuth();

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    const callbackUrl = port
      ? `http://localhost:${port}/api/auth/google/callback`
      : `${process.env.NODE_ENV === 'development' ? 'http://localhost:6033' : 'http://localhost:7033'}/api/auth/google/callback`;

    // Update the OAuth client with the correct callback URL
    const updatedClient = new google.auth.OAuth2(
      oauth2Client._clientId,
      oauth2Client._clientSecret,
      callbackUrl
    );

    // Copy credentials if they exist
    if (oauth2Client.credentials) {
      updatedClient.setCredentials(oauth2Client.credentials);
    }

    // Add state parameter if re-authenticating an account
    const authUrlOptions = {
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
      prompt: 'consent'
    };

    if (reauthAccountId) {
      const stateData = {
        accountId: reauthAccountId.toString() // Ensure it matches the DB id format
      };
      const stateString = Buffer.from(JSON.stringify(stateData)).toString('base64');
      authUrlOptions.state = stateString;
      console.log('Adding state parameter to OAuth URL for account reauth:', reauthAccountId);
    }

    return updatedClient.generateAuthUrl(authUrlOptions);
  }

  static async handleAuthCallback(code, reauthAccountId = null, callbackUrl = null) {
    try {
      console.log('=== YouTube Auth Callback Started ===');
      console.log('Code received:', code ? 'YES' : 'NO', 'Length:', code ? code.length : 'N/A');
      console.log('Reauth Account ID:', reauthAccountId);
      console.log('Callback URL provided:', callbackUrl);

      // Validate code before proceeding
      if (!code) {
        throw new Error('No authorization code received');
      }

      // Get credentials from store to create a fresh client
      const geminiStore = require('./geminiStore');
      console.log('Loading YouTube credentials from store...');
      const clientId = await geminiStore.getYouTubeClientId();
      const clientSecret = await geminiStore.getYouTubeClientSecret();

      console.log('Credentials loaded:', clientId ? 'ClientID OK' : 'NO CLIENT ID', clientSecret ? 'Secret OK' : 'NO SECRET');

      if (!clientId || !clientSecret) {
        throw new Error('YouTube OAuth credentials not configured properly');
      }

      // Create a fresh OAuth2 client with the actual callback URL
      console.log('Creating OAuth2 client...');
      const finalCallbackUrl = callbackUrl || 'http://localhost:7033/api/auth/google/callback';
      const currentClient = new google.auth.OAuth2(
        clientId,
        clientSecret,
        finalCallbackUrl
      );
      console.log('OAuth2 client created with callback URL:', finalCallbackUrl);

      // Exchange code for tokens immediately
      console.log('Exchanging authorization code for tokens...');
      const { tokens } = await currentClient.getToken(code);
      console.log('Token exchange successful, tokens received:', tokens ? 'YES' : 'NO');
      if (!tokens || !tokens.access_token) {
        throw new Error('No access token received from token exchange');
      }

      currentClient.setCredentials(tokens);
      console.log('Credentials set on client');

      // Get user profile
      console.log('Fetching user profile...');
      let profile = null;
      try {
        const oauth2 = google.oauth2({ version: 'v2', auth: currentClient });
        const { data: profileData } = await oauth2.userinfo.get();
        profile = profileData;
        console.log('Profile received:', profile.email, profile.name);

        // Ensure response is what we expect
        if (!profile || !profile.email) {
          throw new Error('Invalid profile response from Google API');
        }
      } catch (profileError) {
        console.error('Profile fetch failed:', profileError.message);
        console.error('Full profile error response:', profileError);
        throw new Error(`Profile fetch failed: ${profileError.message}`);
      }

      const db = await createDB();
      console.log('Database connection established');

      console.log('OAuth callback - profile email:', profile.email, 'reauthAccountId:', reauthAccountId);

      // Account processing with better error handling
      try {
        let account;

        // If this is a re-authentication for a specific account, try to find and update it first
        if (reauthAccountId) {
          const existingAccount = await db.getAccountById(reauthAccountId);

          if (existingAccount) {
            console.log('Updating existing account by ID:', reauthAccountId);

            const updateData = {
              tokens: {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: tokens.expiry_date
              }
            };

            // Update name and picture in case they changed
            if (profile.name) updateData.name = profile.name;
            if (profile.picture) updateData.picture = profile.picture;

            await db.updateAccount(reauthAccountId, updateData);
            console.log('Account update written successfully');

            account = await db.getAccountById(reauthAccountId);
          }
        }

        if (!account) {
          // Check if account exists by email
          const existingAccount = await db.findAccountByEmail(profile.email);

          if (!existingAccount) {
            // Create new account
            account = {
              email: profile.email,
              name: profile.name,
              picture: profile.picture,
              tokens: {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: tokens.expiry_date
              },
              createdAt: new Date().toISOString()
            };

            const accountId = await db.insertAccount(account);
            account.id = accountId;
            console.log('New account written successfully');
          } else {
            // Update existing account
            console.log('Updating existing account by email:', profile.email);

            const updateData = {
              tokens: {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: tokens.expiry_date
              }
            };

            // Update name and picture in case they changed
            if (profile.name) updateData.name = profile.name;
            if (profile.picture) updateData.picture = profile.picture;

            await db.updateAccount(existingAccount.id, updateData);
            console.log('Account update written successfully');

            account = await db.getAccountById(existingAccount.id);
          }
        }

        // Reconstruct tokens object for JWT
        account.tokens = {
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expiry_date: account.expiry_date
        };

        // Generate JWT token for account
        const jwtToken = jwt.sign(
          { userId: account.id, email: account.email },
          'your-jwt-secret',
          { expiresIn: '24h' }
        );

        return { account, token: jwtToken };
      } catch (dbError) {
        console.error('Database operation failed:', dbError.message);
        console.error('Database error type:', typeof dbError);
        console.error('Full database error:', dbError);
        throw new Error(`Database operation failed: ${dbError.message}`);
      }
    } catch (error) {
      throw new Error(`OAuth callback failed: ${error.message}`);
    }
  }

  static async getAccounts() {
    const db = await createDB();
    const accounts = await db.getAccounts();
    // Reconstruct tokens object from database fields
    return accounts.map(account => ({
      ...account,
      tokens: {
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expiry_date: account.expiry_date
      }
    }));
  }

  static async getAccountById(accountId) {
    const db = await createDB();
    const account = await db.getAccountById(accountId);
    if (!account) {
      throw new Error('Account not found');
    }
    // Reconstruct tokens object
    account.tokens = {
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      expiry_date: account.expiry_date
    };
    return account;
  }

  static async getUploadHistory(userId) {
    const db = await createDB();
    const history = await db.getUploadHistory(userId);
    // Already sorted DESC in SQL query
    return history;
  }

  static async removeAccount(accountId) {
    const db = await createDB();
    const account = await this.getAccountById(accountId); // Get account before deletion for logging
    const changes = await db.deleteAccount(accountId);
    if (changes > 0) {
      console.log(`Removed expired YouTube account: ${account.name} (${account.email})`);
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

  static async generateContent(fileName, userId, options = {}) {
    try {
      // Check if Gemini API is available first
      const geminiStore = require('./geminiStore');

      // Check if we have any available Gemini API keys
      const availableApis = await geminiStore.getAllApis();
      if (!availableApis || availableApis.length === 0) {
        // Fallback: Generate basic content without AI
        console.log('No Gemini API available, generating basic content...');
        return this.generateBasicContent(fileName, options.language);
      }

      try {
        // Clean filename for better processing
        let cleanFileName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
        cleanFileName = cleanFileName.replace(/_/g, ' ').replace(/-/g, ' '); // Replace underscores and dashes
        cleanFileName = cleanFileName.split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');

        // Get language option, default to Indonesian
        const language = options.language || 'id';

        // Language-specific instructions
        const languageInstructions = {
          id: {
            titleInstruction: "Judul yang menarik dan SEO-friendly dalam Bahasa Indonesia, maksimal 100 karakter",
            descriptionInstruction: "Deskripsi yang menarik dalam Bahasa Indonesia, maksimal 1000 karakter dengan hashtag yang relevan",
            tagsInstruction: "Tag dalam Bahasa Indonesia yang spesifik dan dapat dicari",
            additionalNote: "Semua konten harus dalam Bahasa Indonesia"
          },
          en: {
            titleInstruction: "A catchy, SEO-optimized title in English, under 100 characters",
            descriptionInstruction: "Engaging description in English, under 1000 characters with relevant hashtags",
            tagsInstruction: "Tags in English that are specific and searchable",
            additionalNote: "All content should be in English"
          },
          ja: {
            titleInstruction: "魅力的なSEO最適化された日本語のタイトル、100文字以内",
            descriptionInstruction: "関連ハッシュタグ付きの魅力的な日本語の説明、1000文字以内",
            tagsInstruction: "具体的で検索可能な日本語のタグ",
            additionalNote: "すべてのコンテンツは日本語でなければなりません"
          },
          ko: {
            titleInstruction: "매력적이고 SEO에 최적화된 한국어 제목, 100자 이내",
            descriptionInstruction: "관련 해시태그가 포함된 매력적인 한국어 설명, 1000자 이내",
            tagsInstruction: "구체적이고 검색 가능한 한국어 태그",
            additionalNote: "모든 콘텐츠는 한국어여야 합니다"
          },
          es: {
            titleInstruction: "Un título atractivo y optimizado para SEO en español, de menos de 100 caracteres",
            descriptionInstruction: "Descripción atractiva en español, de menos de 1000 caracteres con hashtags relevantes",
            tagsInstruction: "Etiquetas en español que sean específicas y buscables",
            additionalNote: "Todo el contenido debe estar en español"
          },
          fr: {
            titleInstruction: "Un titre accrocheur et optimisé pour le SEO en français, de moins de 100 caractères",
            descriptionInstruction: "Description attrayante en français, de moins de 1000 caractères avec des hashtags pertinents",
            tagsInstruction: "Étiquettes en français spécifiques et faciles à rechercher",
            additionalNote: "Tout le contenu doit être en français"
          },
          de: {
            titleInstruction: "Ein ansprechender, suchmaschinenoptimierter Titel auf Deutsch, unter 100 Zeichen",
            descriptionInstruction: "Ansprechende Beschreibung auf Deutsch, unter 1000 Zeichen mit relevanten Hashtags",
            tagsInstruction: "Spezifische und durchsuchbare deutsche Tags",
            additionalNote: "Der gesamte Inhalt muss auf Deutsch sein"
          },
          zh: {
            titleInstruction: "中文吸引人的搜索引擎优化标题，100字符以内",
            descriptionInstruction: "中文吸引人的描述，1000字符以内，包含相关hashtags",
            tagsInstruction: "具体且可搜索的中文标签",
            additionalNote: "所有内容必须是中文"
          }
        };

        const langConfig = languageInstructions[language] || languageInstructions.id;

        // Import GoogleGenerativeAI directly for content generation
        const { GoogleGenerativeAI } = require('@google/generative-ai');

        // Get selected model from settings
        const selectedModel = await geminiStore.getSelectedModel() || 'gemini-2.0-flash';

        // Try each API key until one works
        for (const apiConfig of availableApis) {
          try {
            console.log(`Trying YouTube content generation with API key: ${apiConfig.id} for language: ${language} using model: ${selectedModel}`);
            const genAI = new GoogleGenerativeAI(apiConfig.apiKey);
            const model = genAI.getGenerativeModel({ model: selectedModel });

            // Create YouTube content generation prompt with language specification
            const prompt = `Please analyze this video filename and generate optimal YouTube content in JSON format:

Filename: "${cleanFileName}"

Generate content with these exact keys:
{
  "title": "${langConfig.titleInstruction}",
  "description": "${langConfig.descriptionInstruction}",
  "tags": ["array", "of", "${langConfig.tagsInstruction}", "max", "10"]
}

Guidelines:
- ${langConfig.additionalNote}
- Title should be engaging and searchable for the target language
- Description includes calls-to-action and relevant hashtags in the target language
- Tags should be specific but not too niche in the target language
- Keep everything family-friendly

Return ONLY valid JSON, no extra text or explanations:`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Try to parse the JSON response
            try {
              let cleanedText = text.trim();

              // Remove markdown code blocks if present
              if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
              } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
              }

              const content = JSON.parse(cleanedText);

              // Validate the response structure
              if (content.title && content.description && Array.isArray(content.tags)) {
                // Log successful generation
                await geminiStore.logApiUsage(apiConfig.id, userId, fileName, true, null, Date.now());

                return {
                  title: content.title,
                  description: content.description,
                  tags: content.tags,
                  generated: true,
                  method: 'ai_generated',
                  language: language
                };
              } else {
                throw new Error('Invalid response structure');
              }
            } catch (parseError) {
              console.log('Failed to parse AI response:', parseError.message);
              throw parseError;
            }

          } catch (apiError) {
            console.log(`API key ${apiConfig.id} failed:`, apiError.message);
            // Continue to next API key
          }
        }

        // If all API keys failed, throw error
        throw new Error('All Gemini API keys failed for content generation');

      } catch (geminiError) {
        console.log('AI content generation failed, falling back to basic:', geminiError.message);
        return this.generateBasicContent(fileName, options.language);
      }
    } catch (error) {
      console.log('All content generation methods failed, using basic fallback:', error.message);
      return this.generateBasicContent(fileName, options.language);
    }
  }

  static async generateContentFromCaption(filePath, language = 'id') {
    try {
      // First, try to extract caption from the file
      const fs = require('fs');
      const path = require('path');
      const { getFileCaption } = require('./videoProcessor');

      // Check if file exists and try to get caption
      let caption = '';
      try {
        // Try to read from metadata or sidecar files first
        const captionData = await getFileCaption(filePath);
        if (captionData && captionData.caption) {
          caption = captionData.caption;
        } else {
          // Try to read from JSON metadata file
          const jsonFile = filePath.replace(/\.[^/.]+$/, '.json');
          if (fs.existsSync(jsonFile)) {
            const jsonData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
            caption = jsonData.caption || jsonData.title || '';
          }
        }

        // If still no caption, extract from filename
        if (!caption.trim()) {
          caption = path.basename(filePath).replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/-/g, ' ');
          caption = caption.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ');
        }
      } catch (error) {
        console.log('Could not extract caption from file, using filename as fallback:', error.message);
        caption = path.basename(filePath).replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/-/g, ' ');
        caption = caption.split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
      }

      // If we have a caption, use Gemini to generate content based on it
      const geminiStore = require('./geminiStore');
      const availableApis = await geminiStore.getAllApis();

      if (availableApis && availableApis.length > 0) {
        try {
          const { GoogleGenerativeAI } = require('@google/generative-ai');

          // Language-specific instructions
          const languageInstructions = {
            id: {
              titleInstruction: "Judul yang menarik berdasarkan caption video ini",
              descriptionInstruction: "Deskripsi lengkap yang menarik berdasarkan caption",
              tagsInstruction: "Tag dalam Bahasa Indonesia",
              additionalNote: "Gunakan Bahasa Indonesia untuk semua konten"
            },
            en: {
              titleInstruction: "Catchy title based on this video caption",
              descriptionInstruction: "Complete engaging description based on caption",
              tagsInstruction: "English tags",
              additionalNote: "Use English for all content"
            }
          };

          const langConfig = languageInstructions[language] || languageInstructions.id;

          // Get selected model from settings (consistent)
          const selectedModelCaption = await geminiStore.getSelectedModel() || 'gemini-2.0-flash';

          for (const apiConfig of availableApis) {
            try {
              console.log(`Trying caption-based content generation with API key: ${apiConfig.id} using model: ${selectedModelCaption}`);

              const genAI = new GoogleGenerativeAI(apiConfig.apiKey);
              const model = genAI.getGenerativeModel({ model: selectedModelCaption });

              const prompt = `Please generate YouTube content based on this video caption:

Caption: "${caption}"

Generate content in JSON format:
{
  "title": "${langConfig.titleInstruction}, maksimal 100 karakter",
  "description": "${langConfig.descriptionInstruction}, maksimal 1000 karakter dengan hashtag yang relevan",  
  "tags": ["array", "of", "${langConfig.tagsInstruction}", "max", "10"]
}

Guidelines for content based on caption:
- ${langConfig.additionalNote}
- Make title engaging and SEO-friendly
- Description should summarize and engage viewers
- Include relevant hashtags
- Tags should be searchable

Return ONLY valid JSON:`;

              const result = await model.generateContent(prompt);
              const response = await result.response;
              const text = response.text();

              // Parse response
              let cleanedText = text.trim();
              if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
              } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
              }

              const content = JSON.parse(cleanedText);

              if (content.title && content.description && Array.isArray(content.tags)) {
                await geminiStore.logApiUsage(apiConfig.id, 0, filePath, true, null, Date.now());

                return {
                  title: content.title,
                  description: content.description,
                  tags: content.tags,
                  generated: true,
                  method: 'caption_based',
                  language: language,
                  caption: caption
                };
              }
            } catch (apiError) {
              console.log(`API key ${apiConfig.id} failed for caption generation:`, apiError.message);
            }
          }
        } catch (geminiError) {
          console.log('Caption-based AI generation failed:', geminiError.message);
        }
      }

      // Fallback: Generate basic content from caption
      console.log('Falling back to basic caption-based content generation');
      return this.generateBasicContentFromCaption(caption, language);

    } catch (error) {
      console.log('Caption-based content generation failed completely:', error.message);
      return this.generateBasicContent(path.basename(filePath), language);
    }
  }

  static generateBasicContent(fileName, language = 'id') {
    // Simple content generation based on file name
    let baseTitle = fileName.replace(/\.[^/.]+$/, ''); // Remove file extension
    baseTitle = baseTitle.replace(/_/g, ' ').replace(/-/g, ' '); // Replace underscores and dashes with spaces
    baseTitle = baseTitle.split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    // Language-specific basic content
    const languageContent = {
      id: {
        title: baseTitle || 'Video YouTube',
        description: `Video: ${baseTitle}`,
        tags: ['video', 'autocliper', 'youtube']
      },
      en: {
        title: baseTitle || 'YouTube Video',
        description: `Video: ${baseTitle}\n\nUploaded via Auto Clipper AI #video #autocliper`,
        tags: ['video', 'autocliper', 'youtube']
      }
    };

    const content = languageContent[language] || languageContent.id;

    // Ensure title is not too long
    if (content.title.length > 80) {
      content.title = content.title.substring(0, 77) + '...';
    }

    return {
      title: content.title,
      description: content.description,
      tags: content.tags,
      generated: true,
      method: 'basic_fallback',
      language: language
    };
  }

  static generateBasicContentFromCaption(caption, language = 'id') {
    // Generate basic content based on caption
    const baseTitle = caption.length > 50 ? caption.substring(0, 47) + '...' : caption;

    const languageContent = {
      id: {
        title: baseTitle,
        description: `${caption}\n\nAuto Clipper AI - #video #autocliper`,
        tags: ['video', 'autocliper', 'youtube']
      },
      en: {
        title: baseTitle,
        description: `${caption}\n\nAuto Clipper AI - #video #autocliper`,
        tags: ['video', 'autocliper', 'youtube']
      }
    };

    const content = languageContent[language] || languageContent.id;

    return {
      title: content.title,
      description: content.description,
      tags: content.tags,
      generated: true,
      method: 'caption_basic_fallback',
      language: language,
      caption: caption
    };
  }

  static async validateAccountToken(accountId) {
    try {
      const account = await this.getAccountById(accountId);
      // console.log('Validating token for account:', account.name, 'expiry_date:', new Date(account.tokens.expiry_date));

      const geminiStore = require('./geminiStore');
      const clientId = await geminiStore.getYouTubeClientId();
      const clientSecret = await geminiStore.getYouTubeClientSecret();

      if (!clientId || !clientSecret) {
        throw new Error('YouTube OAuth credentials not configured');
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials(account.tokens);

      const now = Date.now();
      const expiryDate = account.tokens.expiry_date;

      // LOGIKA BARU: Jika token expired secara waktu, JANGAN error, tapi lakukan REFRESH
      let needsRefresh = false;
      if (now >= expiryDate - 60000) { // Buffer 1 menit sebelum expired
        console.log('Token expired or about to expire based on local date. Attempting refresh...');
        needsRefresh = true;
      }

      // Helper function untuk menyimpan token baru
      const saveRefreshedToken = async (credentials) => {
        const db = await createDB();
        const changes = await db.updateAccount(accountId, {
          tokens: {
            access_token: credentials.access_token,
            refresh_token: credentials.refresh_token || account.tokens.refresh_token,
            expiry_date: credentials.expiry_date
          }
        });
        if (changes > 0) {
          console.log('Token successfully refreshed and saved to DB.');
          return true;
        }
        return false;
      };

      if (needsRefresh) {
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          await saveRefreshedToken(credentials);
          // Update client dengan token baru untuk tes API
          oauth2Client.setCredentials(credentials);
          return { valid: true, refreshed: true };
        } catch (refreshError) {
          console.log('Token refresh failed during expiry check:', refreshError.message);
          // Jika refresh gagal karena invalid grant, baru kita lempar error
          if (refreshError.message.includes('invalid_grant') || refreshError.message.includes('invalid_request')) {
            return {
              valid: false,
              error: `Sesi login akun ${account.name} sudah berakhir. Silakan login ulang dengan tombol "🔄 Login Ulang".`,
              tokenExpired: true
            };
          }
          // Jika error lain (misal koneksi), coba lanjut ke API check siapa tau token masih hidup
        }
      }

      // Tes Validasi dengan API Call
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      try {
        await youtube.channels.list({ part: 'id', mine: true, maxResults: 1 });
        // console.log('Token validation API call successful');
        return { valid: true };
      } catch (apiError) {
        console.log('Token validation API call failed:', apiError.message);

        // Jika API call gagal (401 Unauthorized), coba refresh sekali lagi (jika belum dicoba di atas)
        if (!needsRefresh) {
          try {
            console.log('Attempting token refresh after API failure...');
            const { credentials } = await oauth2Client.refreshAccessToken();
            await saveRefreshedToken(credentials);
            return { valid: true, refreshed: true };
          } catch (refreshError) {
            console.log('Token refresh failed:', refreshError.message);
             if (refreshError.message.includes('invalid_grant')) {
                return {
                  valid: false,
                  error: `Token refresh ditolak oleh Google. Silakan login ulang akun ${account.name}.`,
                  tokenExpired: true
                };
             }
             throw apiError;
          }
        }

        throw apiError;
      }

    } catch (error) {
      console.log('Token validation failed:', error.message);

      const isTokenError = error.message.includes('invalid_grant') ||
                           error.code === 401 ||
                           error.message.includes('Token has been expired');

      return {
        valid: false,
        error: isTokenError
          ? `Token akun sudah kadaluarsa. Silakan login ulang.`
          : error.message,
        tokenExpired: isTokenError
      };
    }
  }

  static async uploadVideo(accountId, videoData) {
    console.log('Starting upload for account ID:', accountId);

    // 1. Validasi token (Logika refresh sudah ditangani di dalam validateAccountToken)
    const tokenValidation = await this.validateAccountToken(accountId);

    if (!tokenValidation.valid) {
      const errorMessage = tokenValidation.tokenExpired
        ? `Token YouTube untuk akun telah expired. Silakan login ulang dengan tombol "🔄 Login Ulang".`
        : `Token validation failed: ${tokenValidation.error}`;

      // Simpan history gagal
      try {
        const db = await createDB();
        const account = await db.getAccountById(accountId).catch(() => null);
        await db.insertUploadHistory({
          userId: accountId,
          videoId: null,
          videoUrl: null,
          title: videoData.title,
          uploadedAt: new Date().toISOString(),
          accountName: account ? account.name : 'Unknown Account',
          status: 'Gagal',
          error: errorMessage
        });
      } catch (e) { /* ignore history error */ }

      throw new Error(errorMessage);
    }

    // 2. Ambil akun TERBARU dari DB (penting: karena validateAccountToken mungkin baru saja mengupdate token)
    const account = await this.getAccountById(accountId);

    const geminiStore = require('./geminiStore');
    const clientId = await geminiStore.getYouTubeClientId();
    const clientSecret = await geminiStore.getYouTubeClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error('YouTube OAuth credentials not configured.');
    }

    // Gunakan token terbaru
    const oauth2ClientUpload = new google.auth.OAuth2(clientId, clientSecret);
    oauth2ClientUpload.setCredentials(account.tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2ClientUpload });

    try {
      const videoFilePath = videoData.videoFile && videoData.videoFile.path ? videoData.videoFile.path : videoData.videoFile;
      const thumbnailPath = videoData.thumbnailFile && videoData.thumbnailFile.path ? videoData.thumbnailFile.path : videoData.thumbnailFile;

      if (!videoFilePath || !fs.existsSync(videoFilePath)) {
        throw new Error(`Video file not found: ${videoFilePath}`);
      }

      // Validate title - YouTube requirement
      if (!videoData.title || typeof videoData.title !== 'string' || videoData.title.trim().length === 0) {
        throw new Error('Judul video tidak boleh kosong. Silakan isi judul video terlebih dahulu.');
      }

      let title = videoData.title.trim();
      if (title.length < 1) {
        throw new Error('Judul video tidak boleh kosong setelah trim.');
      }

      // Trim title if too long (YouTube max 100 characters)
      if (title.length > 100) {
        console.log(`Title too long (${title.length} chars), truncating to 100 chars`);
        title = title.substring(0, 97) + '...'; // Leave room for "..."
        console.log(`New title length: ${title.length} - "${title}"`);
      }

      console.log('Uploading video from path:', videoFilePath);
      console.log('Final video title:', title);

      const requestBody = {
        snippet: {
          title: title, // Use the validated/truncated title
          description: videoData.description || '',
          tags: Array.isArray(videoData.tags) ? videoData.tags : (videoData.tags ? videoData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : []),
          categoryId: videoData.categoryId || '22'
        },
        status: {
          privacyStatus: videoData.privacyStatus || 'public',
          selfDeclaredMadeForKids: !!videoData.madeForKids
        }
      };

      if (videoData.paidPromotion) {
        requestBody.snippet.description += '\n\nPaid Promotion: This video contains paid or sponsored content.';
      }
      if (videoData.publishAt) {
        requestBody.status.publishAt = videoData.publishAt;
        requestBody.status.privacyStatus = 'private'; // Scheduled videos must be private
      }

      const response = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: requestBody,
        media: { body: fs.createReadStream(videoFilePath) },
      });

      const youtubeVideoId = response.data.id;
      const youtubeVideoUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

      // Upload Thumbnail jika ada
      if (thumbnailPath && fs.existsSync(thumbnailPath)) {
        try {
          await youtube.thumbnails.set({
            videoId: youtubeVideoId,
            media: { body: fs.createReadStream(thumbnailPath) },
          });
        } catch (thumbnailError) {
          console.warn('Failed to upload thumbnail:', thumbnailError.message);
        }
      }

      // Playlist management: Auto-detect and create/add to playlist
      let playlistInfo = null;
      try {
        console.log('Attempting to manage playlist for uploaded video...');
        playlistInfo = await this.managePlaylistForVideo(
          accountId,
          { youtubeVideoId },
          videoData.title,
          Array.isArray(videoData.tags) ? videoData.tags : []
        );
        console.log('Playlist management result:', playlistInfo);
      } catch (playlistError) {
        console.warn('Playlist management failed, but upload succeeded:', playlistError.message);
        // Continue - don't fail the upload because of playlist issues
      }

      // Save success history
      const db = await createDB();
      await db.insertUploadHistory({
        userId: account.id,
        videoId: youtubeVideoId,
        videoUrl: youtubeVideoUrl,
        title: videoData.title,
        uploadedAt: new Date().toISOString(),
        accountName: account.name,
        status: videoData.publishAt ? 'Dijadwalkan' : 'Berhasil',
        publishAt: videoData.publishAt || null,
        privacyStatus: videoData.privacyStatus || 'public',
        playlistAdded: playlistInfo?.playlistAdded || false,
        playlistName: playlistInfo?.playlistName || null
      });

      // Track video status - mark as uploaded to YouTube
      try {
        const geminiStore = require('./geminiStore');
        const videoPath = videoData.videoFile && videoData.videoFile.path ? videoData.videoFile.path : videoData.videoFile;
        await geminiStore.updateVideoStatus(videoPath, {
          youtube_uploaded: true,
          youtube_account: account.name,
          youtube_video_id: youtubeVideoId
        });
        console.log('[YouTubeUpload] Marked video as uploaded:', videoPath, 'by account:', account.name);
      } catch (statusError) {
        console.warn('[YouTubeUpload] Failed to update video status:', statusError);
      }

      return {
        youtubeVideoId,
        youtubeVideoUrl,
        message: videoData.publishAt ? "Video berhasil dijadwalkan" : "Video berhasil diunggah",
        scheduled: !!videoData.publishAt,
        playlistAdded: playlistInfo?.playlistAdded || false,
        playlistName: playlistInfo?.playlistName || null
      };

    } catch (error) {
      let errorMessage = error.message;

      // Deteksi error token expired saat proses upload berlangsung
      if (error.message.includes('invalid_grant') || error.code === 401) {
         errorMessage = `Sesi upload terputus (Token Expired). Silakan login ulang akun ${account.name}.`;
      }

      // Save failure history
      const db = await createDB();
      await db.insertUploadHistory({
        userId: account.id,
        videoId: null,
        videoUrl: null,
        title: videoData.title,
        uploadedAt: new Date().toISOString(),
        accountName: account.name,
        status: 'Gagal',
        error: errorMessage
      });

      throw new Error(errorMessage);
    }
  }

  static async getChannelPlaylists(accountId) {
    console.log('Getting playlists for account ID:', accountId);

    const account = await this.getAccountById(accountId);
    const geminiStore = require('./geminiStore');
    const clientId = await geminiStore.getYouTubeClientId();
    const clientSecret = await geminiStore.getYouTubeClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error('YouTube OAuth credentials not configured.');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials(account.tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
      const response = await youtube.playlists.list({
        part: 'snippet,status,contentDetails',
        mine: true,
        maxResults: 50
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Error getting playlists:', error.message);
      throw new Error(`Failed to get playlists: ${error.message}`);
    }
  }

  static async createPlaylist(accountId, playlistData) {
    console.log('Creating playlist for account ID:', accountId, 'with data:', playlistData);

    const account = await this.getAccountById(accountId);
    const geminiStore = require('./geminiStore');
    const clientId = await geminiStore.getYouTubeClientId();
    const clientSecret = await geminiStore.getYouTubeClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error('YouTube OAuth credentials not configured.');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials(account.tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
      const response = await youtube.playlists.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: playlistData.title,
            description: playlistData.description || '',
            tags: playlistData.tags || []
          },
          status: {
            privacyStatus: playlistData.privacyStatus || 'public'
          }
        }
      });

      console.log('Playlist created successfully:', response.data.id);
      return response.data;
    } catch (error) {
      console.error('Error creating playlist:', error.message);
      throw new Error(`Failed to create playlist: ${error.message}`);
    }
  }

  static async addVideoToPlaylist(accountId, videoId, playlistId) {
    console.log('Adding video', videoId, 'to playlist', playlistId, 'for account', accountId);

    const account = await this.getAccountById(accountId);
    const geminiStore = require('./geminiStore');
    const clientId = await geminiStore.getYouTubeClientId();
    const clientSecret = await geminiStore.getYouTubeClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error('YouTube OAuth credentials not configured.');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials(account.tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
      await youtube.playlistItems.insert({
        part: 'snippet',
        requestBody: {
          snippet: {
            playlistId: playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId: videoId
            }
          }
        }
      });

      console.log('Video added to playlist successfully');
      return true;
    } catch (error) {
      console.error('Error adding video to playlist:', error.message);
      throw new Error(`Failed to add video to playlist: ${error.message}`);
    }
  }

  static async managePlaylistForVideo(accountId, videoData, videoTitle, videoTags = []) {
    try {
      console.log('Managing playlist for video:', videoTitle);

      // Get existing playlists
      const playlists = await this.getChannelPlaylists(accountId);

      // Determine playlist name based on content/kategori
      let playlistName = 'General Videos';

      // Try to categorize based on tags or content
      if (videoTags && videoTags.length > 0) {
        const lowerTags = videoTags.map(tag => tag.toLowerCase());

        // Category-based playlists
        if (lowerTags.some(tag => tag.includes('music') || tag.includes('music'))) {
          playlistName = 'Music Videos';
        } else if (lowerTags.some(tag => tag.includes('tutorial') || tag.includes('howto'))) {
          playlistName = 'Tutorials & Guides';
        } else if (lowerTags.some(tag => tag.includes('vlog') || tag.includes('travel'))) {
          playlistName = 'Vlogs & Travel';
        } else if (lowerTags.some(tag => tag.includes('review') || tag.includes('unboxing'))) {
          playlistName = 'Reviews & Unboxings';
        } else if (lowerTags.some(tag => tag.includes('short') || tag.includes('clip'))) {
          playlistName = 'Short Clips';
        }
      }

      // Check if playlist exists
      let targetPlaylist = playlists.find(pl => pl.snippet.title.toLowerCase() === playlistName.toLowerCase());

      // If playlist doesn't exist, create it
      if (!targetPlaylist) {
        console.log('Playlist does not exist, creating new playlist:', playlistName);
        targetPlaylist = await this.createPlaylist(accountId, {
          title: playlistName,
          description: `Collection of ${playlistName.toLowerCase()} uploaded via Auto Clipper AI`,
          tags: ['auto_clipper', 'ai_generated'],
          privacyStatus: 'public'
        });
      }

      // Add video to playlist
      await this.addVideoToPlaylist(accountId, videoData.youtubeVideoId, targetPlaylist.id);

      return {
        playlistAdded: true,
        playlistName: playlistName,
        playlistId: targetPlaylist.id
      };

    } catch (error) {
      console.warn('Failed to manage playlist, continuing without playlist addition:', error.message);
      return {
        playlistAdded: false,
        error: error.message
      };
    }
  }
}

module.exports = { YouTubeService, upload };
