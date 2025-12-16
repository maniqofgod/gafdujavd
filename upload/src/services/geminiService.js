const { GoogleGenerativeAI } = require('@google/generative-ai');
const geminiStore = require('./geminiStore');

class GeminiRateLimiter {
    constructor() {
        this.requests = new Map(); // Map untuk menyimpan timestamp requests per user
        this.maxRequests = 10; // Max 10 requests per menit per user
        this.timeWindow = 60 * 1000; // 1 menit dalam milliseconds
    }

    canMakeRequest(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];

        // Hapus requests yang sudah di luar time window
        const validRequests = userRequests.filter(time => now - time < this.timeWindow);

        if (validRequests.length >= this.maxRequests) {
            return false;
        }

        // Tambahkan request baru
        validRequests.push(now);
        this.requests.set(userId, validRequests);

        return true;
    }

    getRemainingTime(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];

        if (userRequests.length < this.maxRequests) {
            return 0;
        }

        const oldestRequest = Math.min(...userRequests);
        return Math.ceil((this.timeWindow - (now - oldestRequest)) / 1000);
    }
}

// API Key Rate Limiter - tracks rate limits per API key
class GeminiApiRateLimiter {
    constructor() {
        this.rateLimitedKeys = new Map(); // Map<apiId, {until: timestamp, reason: string}>
        this.cooldownPeriod = 30 * 60 * 1000; // 30 minutes in milliseconds
    }

    // Check if API key is currently rate limited
    isRateLimited(apiId) {
        const limitInfo = this.rateLimitedKeys.get(apiId);
        if (!limitInfo) return false;

        const now = Date.now();
        if (now >= limitInfo.until) {
            // Cooldown period has expired, remove from rate limited list
            this.rateLimitedKeys.delete(apiId);
            return false;
        }

        return true;
    }

    // Mark API key as rate limited
    markRateLimited(apiId, reason = 'Rate limit exceeded') {
        const until = Date.now() + this.cooldownPeriod;
        this.rateLimitedKeys.set(apiId, {
            until: until,
            reason: reason,
            markedAt: new Date().toISOString()
        });
        console.log(`🚫 API Key ${apiId} marked as rate limited until ${new Date(until).toISOString()} (${reason})`);
    }

    // Get remaining cooldown time for an API key
    getRemainingCooldown(apiId) {
        const limitInfo = this.rateLimitedKeys.get(apiId);
        if (!limitInfo) return 0;

        const now = Date.now();
        const remaining = Math.ceil((limitInfo.until - now) / 1000);
        return Math.max(0, remaining);
    }

    // Get all currently rate limited API keys
    getRateLimitedKeys() {
        const now = Date.now();
        const limited = [];

        for (const [apiId, info] of this.rateLimitedKeys.entries()) {
            if (now < info.until) {
                limited.push({
                    apiId,
                    reason: info.reason,
                    remainingSeconds: Math.ceil((info.until - now) / 1000),
                    until: info.until
                });
            } else {
                // Clean up expired entries
                this.rateLimitedKeys.delete(apiId);
            }
        }

        return limited;
    }

    // Clear expired rate limits
    cleanup() {
        const now = Date.now();
        for (const [apiId, info] of this.rateLimitedKeys.entries()) {
            if (now >= info.until) {
                this.rateLimitedKeys.delete(apiId);
            }
        }
    }
}

const rateLimiter = new GeminiRateLimiter();
const apiRateLimiter = new GeminiApiRateLimiter();

// Helper function to convert various time formats to MM:SS
function convertToMMSS(timeValue) {
    if (!timeValue || timeValue === '00:00') return '00:00';

    // If already in MM:SS format, return as is
    if (typeof timeValue === 'string' && timeValue.includes(':')) {
        return timeValue;
    }

    // Convert decimal seconds or numeric seconds to MM:SS
    const seconds = parseFloat(timeValue);
    if (isNaN(seconds)) return '00:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

class GeminiService {
    async generateContent(fileName, userId = null, options = {}) {
        const startTime = Date.now();
        let success = false;
        let errorMessage = null;
        let usedApiKeys = new Set(); // Track used API keys to avoid infinite loops

        try {
            // Rate limiting check
            if (userId && !rateLimiter.canMakeRequest(userId)) {
                const remainingTime = rateLimiter.getRemainingTime(userId);
                throw new Error(`Rate limit exceeded. Coba lagi dalam ${remainingTime} detik.`);
            }

            // Get all available API keys
            const allApis = await geminiStore.getAllApis();
            if (allApis.length === 0) {
                throw new Error('Tidak ada API Gemini yang tersedia. Silakan tambahkan API key di panel admin.');
            }

            // Use the provided custom prompt (required)
            const prompt = options.customPrompt;
            const modelName = await geminiStore.getSelectedModel() || 'gemini-2.0-flash';

            // Try each API key until one works
            let lastError;
            for (const currentApi of allApis) {
                if (usedApiKeys.has(currentApi.id)) continue; // Skip already tried keys

                // Skip API keys that are currently rate limited
                if (apiRateLimiter.isRateLimited(currentApi.id)) {
                    console.log(`⏭️ Skipping API key ${currentApi.id} - currently rate limited`);
                    usedApiKeys.add(currentApi.id);
                    continue;
                }

                try {
                    console.log(`🔄 Trying API key ID: ${currentApi.id}`);
                    const apiData = currentApi;
                    const genAI = new GoogleGenerativeAI(apiData.apiKey);
                    const model = genAI.getGenerativeModel({ model: modelName });

                    // Retry logic dengan exponential backoff
                    let apiError;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            const result = await model.generateContent(prompt);
                            const response = await result.response;
                            const text = response.text();

                            console.log('Raw Gemini response:', text);

                            // Try to parse JSON directly (new format)
                            let clips = [];
                            try {
                                // Clean markdown code blocks first
                                let cleanedText = text.trim();

                                // Remove markdown code block markers
                                if (cleanedText.includes('```json')) {
                                    cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
                                } else if (cleanedText.includes('```')) {
                                    cleanedText = cleanedText.replace(/```\w*\s*/g, '').replace(/```\s*$/g, '').trim();
                                }

                                console.log('Cleaned text for JSON parsing:', cleanedText.substring(0, 200) + '...');

                                // First try to parse as JSON
                                const parsedResponse = JSON.parse(cleanedText);
                                if (Array.isArray(parsedResponse)) {
                                    console.log(`Parsed ${parsedResponse.length} clips from JSON response`);
                                    clips = parsedResponse;
                                } else {
                                    console.log('Response is not a JSON array, trying alternative parsing');
                                    throw new Error('Not a JSON array');
                                }
                            } catch (jsonError) {
                                console.log('JSON parsing failed, this might be an old format or error response:', jsonError.message);

                                // Check for common error responses
                                if (text.trim().toUpperCase().includes('NO_CLIPS_FOUND') || text.trim() === '') {
                                    console.log('AI indicated no suitable clips found');
                                    throw new Error('No suitable clips found in the transcript');
                                }

                                // Fallback: try to parse various text formats
                                console.log('Attempting fallback parsing for multiple formats...');
                                clips = [];

                                // Try to parse structured data from any text format
                                const lines = text.split('\n').filter(line => line.trim());

                                let currentClip = {};
                                let inCaptionMode = false;
                                let captionLines = [];
                                let clipIndex = 0;

                                for (const line of lines) {
                                    const trimmedLine = line.trim();

                                    // Look for structured data patterns
                                    const startMatch = trimmedLine.match(/start[:\s]+(\d+[:\d]*|\d+\.\d+)/i);
                                    if (startMatch) {
                                        // Save previous clip if complete
                                        if (currentClip.start && currentClip.end) {
                                            // Fill in missing fields
                                            if (!currentClip.virality_score) currentClip.virality_score = 8;
                                            if (!currentClip.reason) currentClip.reason = 'AI generated clip';
                                            if (!currentClip.suggested_caption) currentClip.suggested_caption = `Clip ${++clipIndex}`;
                                            if (!currentClip.content_type) currentClip.content_type = 'General content';
                                            if (!currentClip.peak_engagement_moment) currentClip.peak_engagement_moment = currentClip.start;

                                            clips.push({...currentClip});
                                        }

                                        // Start new clip
                                        currentClip = {};
                                        captionLines = [];
                                        inCaptionMode = false;
                                        currentClip.start = convertToMMSS(startMatch[1]);
                                        continue;
                                    }

                                    const endMatch = trimmedLine.match(/end[:\s]+(\d+[:\d]*|\d+\.\d+)/i);
                                    if (endMatch && currentClip.start) {
                                        currentClip.end = convertToMMSS(endMatch[1]);
                                        continue;
                                    }

                                    const scoreMatch = trimmedLine.match(/score[:\s]+(\d+)/i);
                                    if (scoreMatch) {
                                        currentClip.virality_score = parseInt(scoreMatch[1]) || 8;
                                        continue;
                                    }

                                    // Caption detection (more flexible)
                                    if (trimmedLine.toLowerCase().includes('caption') ||
                                        (trimmedLine.includes(':') && !trimmedLine.includes('start') && !trimmedLine.includes('end') && !trimmedLine.includes('score'))) {
                                        if (trimmedLine.includes(':')) {
                                            const colonIndex = trimmedLine.indexOf(':');
                                            captionLines.push(trimmedLine.substring(colonIndex + 1).trim());
                                        } else {
                                            captionLines.push(trimmedLine);
                                        }
                                        inCaptionMode = true;
                                        continue;
                                    }

                                    // Continue collecting caption text
                                    if (inCaptionMode && (captionLines.length > 0 || trimmedLine) && !trimmedLine.includes('type')) {
                                        captionLines.push(trimmedLine);
                                        continue;
                                    }

                                    const typeMatch = trimmedLine.match(/type[:\s]+(.+)/i);
                                    if (typeMatch) {
                                        currentClip.content_type = typeMatch[1].trim();
                                        continue;
                                    }
                                }

                                // Don't forget the last clip
                                if (currentClip.start && currentClip.end) {
                                    if (!currentClip.virality_score) currentClip.virality_score = 8;
                                    if (!currentClip.reason) currentClip.reason = 'AI generated clip';
                                    if (!currentClip.suggested_caption) {
                                        currentClip.suggested_caption = captionLines.length > 0
                                            ? captionLines.join('\n')
                                            : `Clip ${++clipIndex}`;
                                    }
                                    if (!currentClip.content_type) currentClip.content_type = 'General content';
                                    if (!currentClip.peak_engagement_moment) currentClip.peak_engagement_moment = currentClip.start;

                                    clips.push({...currentClip});
                                }

                                console.log(`Fallback parsing found ${clips.length} clips`);

                                if (clips.length === 0) {
                                    throw new Error('Could not parse any valid clips from AI response');
                                }
                            }

                            // Allow empty arrays for no transcript case (handled below)

                            // Special handling for no transcript case - allow empty arrays
                            if (Array.isArray(clips) && clips.length === 0) {
                                console.log('AI returned empty clips array (likely no transcript available)');
                                clips = []; // Explicitly allow empty array
                            } else {
                                // Normalize and validate each clip
                                clips = clips.map((clip, index) => {
                                    if (!clip.start || !clip.end) {
                                        console.log(`Clip ${index + 1} missing start or end time, skipping`);
                                        return null;
                                    }

                                    return {
                                        start: convertToMMSS(clip.start),
                                        end: convertToMMSS(clip.end),
                                        virality_score: clip.virality_score || clip.score || 8,
                                        reason: clip.reason || 'Automatically generated clip',
                                        suggested_caption: clip.suggested_caption || clip.caption || `Clip ${index + 1}`,
                                        content_type: clip.content_type || clip.type || 'General content',
                                        peak_engagement_moment: convertToMMSS(clip.peak_engagement_moment || clip.peak || clip.start)
                                    };
                                }).filter(clip => clip !== null); // Remove invalid clips

                                if (clips.length === 0) {
                                    console.log('No valid clips remain after normalization');
                                    throw new Error('All clips were invalid after processing');
                                }
                            }

                            console.log(`Processing ${clips.length} clips from AI response`);

                            const content = clips;
                            console.log(`Successfully parsed ${clips.length} clips from text format`);

                            // Special handling for empty arrays (no transcript case)
                            if (Array.isArray(content) && content.length === 0) {
                                console.log('Accepting valid empty array response (no transcript available)');
                                // Allow empty arrays for no transcript case
                            }
                            // Standard validation for other cases
                            else {
                                // Validasi hasil - check based on content type
                                const isArrayResponse = Array.isArray(content);
                                const isObjectResponse = typeof content === 'object' && content !== null && !isArrayResponse;

                                let isValidResponse = false;

                                if (isArrayResponse && content.length > 0) {
                                    // Array response (clip analysis) - check if it has required clip properties
                                    const firstItem = content[0];
                                    isValidResponse = firstItem && (
                                        (firstItem.start && firstItem.end && firstItem.virality_score !== undefined) ||
                                        (firstItem.hashtags || firstItem.tags || firstItem.tagsArray)
                                    );
                                } else if (isObjectResponse) {
                                    // Object response (content generation) - check for title, description, hashtags
                                    isValidResponse = content.title || content.description || content.hashtags;
                                }

                                if (!isValidResponse) {
                                    console.log('Response validation failed for content:', content);
                                    throw new Error('Respons kosong dari Gemini API');
                                }
                            }

                            success = true;
                            const responseTime = Date.now() - startTime;

                            // Log successful usage
                            if (userId) {
                                await geminiStore.logApiUsage(apiData.id, userId, fileName, success, null, responseTime);
                            }

                            const isArrayResponse = Array.isArray(content);
                            // Handle different response types
                            if (isArrayResponse) {
                                // Clip analysis response - return raw content directly
                                return {
                                    clips: content,
                                    generated: true,
                                    model: modelName,
                                    responseType: 'clips'
                                };
                            } else {
                                // No fallback content generation - throw error instead
                                throw new Error('AI failed to generate valid content - no fallback available');
                            }

                        } catch (error) {
                            apiError = error;
                            console.warn(`Gemini API attempt ${attempt} failed:`, error.message);

                            // --- PERBAIKAN LOGIKA DETEKSI ERROR ---

                            // 1. Cek apakah ini error 404 (Model Not Found)
                            if (error.message.includes('404') || error.status === 404) {
                                console.error(`❌ CRITICAL ERROR: Model '${modelName}' tidak ditemukan. Cek ejaan model.`);
                                // Jangan retry, jangan mark rate limit, langsung stop loop ini atau throw error
                                throw new Error(`Model ${modelName} tidak ditemukan (404). Cek konfigurasi.`);
                            }

                            // 2. Cek API key yang dilaporkan bocor (403 Forbidden)
                            if (error.status === 403 || error.message?.toLowerCase().includes('api key was reported as leaked') ||
                                error.message?.toLowerCase().includes('api key not valid') ||
                                error.message?.toLowerCase().includes('leaked')) {
                                console.warn(`🗑️ API key reported as leaked/invalid. Deleting from database...`);
                                try {
                                    await geminiStore.deleteApi(currentApi.id);
                                    console.log(`✅ Deleted leaked API key ${currentApi.id}`);
                                } catch (deleteError) {
                                    console.error(`❌ Failed to delete leaked API key ${currentApi.id}:`, deleteError.message);
                                }
                                break; // Ganti ke API Key berikutnya
                            }

                            // 3. Cek Rate Limit / Quota
                            const isQuotaError = error.status === 429 ||
                                               error.message?.toLowerCase().includes('quota') ||
                                               error.message?.toLowerCase().includes('too many requests') ||
                                               error.message?.toLowerCase().includes('rate') ||
                                               error.message?.toLowerCase().includes('resource exhausted');

                            if (isQuotaError) {
                                console.warn(`🚫 Quota/Rate limit detected for API key. Marking as limited...`);
                                if (apiRateLimiter) {
                                    apiRateLimiter.markRateLimited(currentApi.id, 'Quota exceeded');
                                }
                                break; // Ganti ke API Key berikutnya
                            }

                            // For other errors, retry with backoff
                            if (attempt < 3) {
                                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                                await new Promise(resolve => setTimeout(resolve, delay));
                            }
                        }
                    }

                    // If we get here, all attempts for this API key failed
                    throw apiError || new Error(`API key ${currentApi.id} failed after 3 attempts`);

                } catch (error) {
                    // API key failed - mark as used and try next API
                    usedApiKeys.add(currentApi.id);
                    lastError = error;
                    console.log(`❌ API key ${currentApi.id} failed: ${error.message}`);
                }
            }

            // If all API keys failed, throw the last error
            throw lastError || new Error('Semua API key Gemini gagal digunakan');

        } catch (error) {
            console.error('Error generating content with Gemini:', error);

            // DIRECTLY THROW ERROR - No fallback content, as requested
            throw new Error(`AI service unavailable: ${error.message}`);
        }
    }

    async translateSubtitle(assContent, targetLanguage, userId = null) {
        // Supported languages mapping
        const languageMap = {
            'indonesia': 'Indonesian',
            'sunda': 'Sundanese',
            'inggris': 'English',
            'jepang': 'Japanese',
            'korea': 'Korean',
            'china': 'Chinese'
        };

        const fullLanguageName = languageMap[targetLanguage] || targetLanguage;
        console.log(`🔄 Starting subtitle translation to ${fullLanguageName}`);

        try {
            // Rate limiting check
            if (userId && !rateLimiter.canMakeRequest(userId)) {
                const remainingTime = rateLimiter.getRemainingTime(userId);
                throw new Error(`Rate limit exceeded. Coba lagi dalam ${remainingTime} detik.`);
            }

            // Get API keys and model
            const allApis = await geminiStore.getAllApis();
            if (allApis.length === 0) {
                throw new Error('Tidak ada API Gemini yang tersedia. Silakan tambahkan API key di panel admin.');
            }

            const modelName = await geminiStore.getSelectedModel() || 'gemini-2.0-flash';

            // Parse ASS content to extract dialog lines
            const dialogLines = this._parseAssDialogs(assContent);
            console.log(`📝 Found ${dialogLines.length} dialog lines to translate`);

            if (dialogLines.length === 0) {
                return assContent; // Return original if no dialogs found
            }

            // Group dialogs for batch processing to optimize API calls
            const batchSize = 10; // Process 10 dialogs per API call
            const batches = [];
            for (let i = 0; i < dialogLines.length; i += batchSize) {
                batches.push(dialogLines.slice(i, i + batchSize));
            }

            let translatedAssContent = assContent;
            let totalProcessed = 0;

            // Process each batch
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} dialogs)`);

                // Extract texts for this batch
                const batchTexts = batch.map(dialog => dialog.text);

                // Create translation prompt for batch
                const batchTextJoined = batchTexts.join('\n---\n');
                const prompt = `Translate the following subtitle texts to ${fullLanguageName}. Detect the source language automatically and translate accurately.

For each text block (separated by ---), provide only the translated text without any additional formatting, explanations, or markers.

Texts to translate:
${batchTextJoined}

Instructions:
- Translate to ${fullLanguageName} only
- Maintain the exact meaning and context
- Return only the translated texts, one per line, separated by newlines if there are multiple lines in original text
- Do not add quotes, explanations, or change the format
- Each translated text should correspond exactly to its original position`;

                // Send to Gemini with fallback API key handling
                let translatedBatch = [];
                let apiUsed = null;

                // Try each API key until one works
                for (const currentApi of allApis) {
                    if (apiRateLimiter.isRateLimited(currentApi.id)) {
                        console.log(`⏭️ Skipping API key ${currentApi.id} - currently rate limited`);
                        continue;
                    }

                    try {
                        console.log(`🔄 Trying translation with API key ${currentApi.id}`);
                        const genAI = new GoogleGenerativeAI(currentApi.apiKey);
                        const model = genAI.getGenerativeModel({ model: modelName });

                        // Allow multiple attempts per API key
                        let apiError;
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            try {
                                const result = await model.generateContent(prompt);
                                const response = await result.response;
                                const responseText = response.text().trim();

                                // Parse the response - should contain translated texts
                                const translatedTexts = responseText.split('\n').filter(line => line.trim());

                                if (translatedTexts.length > 0 && translatedTexts.length <= batch.length) {
                                    translatedBatch = translatedTexts;
                                    apiUsed = currentApi.id;

                                    console.log(`✅ Translation successful for batch ${batchIndex + 1}`);
                                    break;
                                } else {
                                    console.log(`❌ Translation response invalid - expected ${batch.length} texts, got ${translatedTexts.length}`);
                                    throw new Error('Invalid translation response format');
                                }

                            } catch (error) {
                                apiError = error;
                                console.warn(`Translation attempt ${attempt} failed:`, error.message);

                                // Handle rate limits
                                if (error.message?.toLowerCase().includes('quota') ||
                                    error.message?.toLowerCase().includes('rate') ||
                                    error.status === 429) {
                                    console.warn(`🚫 Rate limit for API key. Marking as limited...`);
                                    apiRateLimiter.markRateLimited(currentApi.id, 'Quota exceeded');
                                    break;
                                }

                                if (attempt < 3) {
                                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
                                }
                            }
                        }

                        if (translatedBatch.length > 0) break; // Success, exit API key loop

                    } catch (error) {
                        console.log(`❌ API key ${currentApi.id} failed for translation: ${error.message}`);
                    }
                }

                if (translatedBatch.length === 0) {
                    throw new Error(`Failed to translate batch ${batchIndex + 1} - all API keys failed`);
                }

                // Apply translations to ASS content for this batch
                translatedAssContent = this._applyTranslations(translatedAssContent, batch, translatedBatch);
                totalProcessed += batch.length;

                // Log successful usage if API was used
                if (apiUsed && userId) {
                    const responseTime = 0; // We don't track individual response times for batch
                    await geminiStore.logApiUsage(apiUsed, userId, 'subtitle_translation', true, null, responseTime);
                }
            }

            console.log(`✅ Subtitle translation completed. Processed ${totalProcessed} dialog lines to ${fullLanguageName}`);
            return translatedAssContent;

        } catch (error) {
            console.error('Error translating subtitle:', error);
            throw new Error(`Subtitle translation failed: ${error.message}`);
        }
    }

    // Helper method to parse ASS dialog lines
    _parseAssDialogs(assContent) {
        const lines = assContent.split('\n');
        const dialogs = [];
        let inEventsSection = false;

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex].trim();

            if (line === '[Events]') {
                inEventsSection = true;
                continue;
            }

            if (inEventsSection && line.startsWith('Dialogue:')) {
                // Parse ASS dialog format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
                const parts = line.split(',');
                if (parts.length >= 10) {
                    // Text is everything from position 9 onwards (0-indexed)
                    const text = parts.slice(9).join(',').trim();
                    dialogs.push({
                        lineIndex: lineIndex,
                        fullLine: line,
                        text: text
                    });
                }
            }
        }

        return dialogs;
    }

    // Helper method to apply translations back to ASS content
    _applyTranslations(assContent, dialogBatch, translatedBatch) {
        const lines = assContent.split('\n');

        // Replace each dialog line in reverse order to maintain line indices
        for (let i = dialogBatch.length - 1; i >= 0; i--) {
            const dialog = dialogBatch[i];
            const translatedText = translatedBatch[i]?.trim();

            if (translatedText && translatedText !== dialog.text) {
                // Replace the text portion of the dialog line
                const parts = dialog.fullLine.split(',');
                if (parts.length >= 10) {
                    // Replace the text part (everything from position 9 onwards)
                    parts.splice(9, parts.length - 9, translatedText);
                    const newLine = parts.join(',');
                    lines[dialog.lineIndex] = newLine;
                }
            }
        }

        return lines.join('\n');
    }

    async validateApiKey(apiKey) {
        // Get the selected model from settings
        const validationModelName = await geminiStore.getSelectedModel() || 'gemini-2.0-flash';
        const testPrompt = 'hallo gemini';

        try {
            // Basic check for API key presence and type
            if (!apiKey || typeof apiKey !== 'string' || apiKey.length === 0) {
                console.log('API key is empty or not a string.');
                return false;
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: validationModelName });

            // Attempt to generate content with a simple prompt
            console.log(`🔄 Attempting functional validation for API key... (Model: ${validationModelName})`);
            const result = await model.generateContent(testPrompt);
            const response = await result.response;
            const text = response.text();

            // If a response is received, the key is considered valid
            if (text && text.length > 0) {
                console.log(`✅ API key functional validation successful. Response received.`);
                return true;
            } else {
                console.log(`❌ API key functional validation failed: Empty response.`);
                return false;
            }
        } catch (error) {
            console.error(`❌ API key functional validation failed: ${error.message}`);
            // Catch specific error types if needed to differentiate issues
            if (error.message.includes('404 Not Found') || error.message.includes('model is not found')) {
                console.error(`Model '${validationModelName}' not found for this API key or is unavailable.`);
            } else if (error.message.includes('API key not valid')) {
                console.error(`API key is invalid.`);
            }
            return false;
        }
    }

}

module.exports = new GeminiService();
