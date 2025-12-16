const geminiService = require('./geminiService');
const geminiStore = require('./geminiStore');

class ClipperAgent {
  async analyzeVideoForClips(transcriptText, videoTitle, videoDuration = null) {
    const transcriptStatus = transcriptText && transcriptText !== "NO_TRANSCRIPT_AVAILABLE" ? "AVAILABLE" : "NOT_AVAILABLE";

    // Try to get custom prompt from database, fallback to default
    let prompt = await geminiStore.getPrompt();
    if (!prompt) {
      prompt = `
ROLE
You are an expert Social Media Strategist and Video Editor for TikTok/Reels. You possess a "viral sense" to identify moments that maintain high retention.

GOAL
Extract the TOP 5-10 most engaging clips from the transcript provided below.
The clips must be punchy, standalone, and attention-grabbing (Vertical Video Format).

INPUT DATA
TRANSCRIPT_STATUS: ${transcriptStatus}
DATA:
${transcriptStatus === "AVAILABLE" ? transcriptText.substring(0, 800000) : "TRANSCRIPT: NOT_AVAILABLE"}

STRICT EDITING RULES (MUST FOLLOW):

1. DURATION CONTROL (CRITICAL):
   - MINIMUM: 40 Seconds (Absolutely NO clips under 40s).
   - MAXIMUM: 90 Seconds.
   - LOGIC: If a potential viral segment is only 15-20 seconds, you MUST include the sentences immediately BEFORE (setup) or AFTER (context) it to extend the duration until it hits at least 30 seconds.

2. THE "HOOK" PRINCIPLE:
   - The "start" timestamp MUST align with a strong opening line (Start of a sentence).
   - Good Hooks: A question, a controversial statement, high energy, or "Did you know?".
   - Bad Hooks: "Um..", "So...", silence, or starting in the middle of a sentence.

3. STANDALONE CONTEXT:
   - The clip must tell a complete mini-story or deliver a complete tip.
   - It must NOT end abruptly in the middle of a sentence.

4. LANGUAGE & TONE:
   - Detect the language of the transcript automatically.
   - "Reason" and "Caption" MUST be in the SAME language as the transcript.
   - Caption style: Casual, viral, social-media native.

5. NO EMOJIS POLICY (STRICT):
   - You must NOT use any emojis (e.g., 🔥, 🚀, 😂) in the "reason" or "suggested_caption".
   - The output must be PLAIN TEXT ONLY.
   - Exception: The symbol "#" is ALLOWED for hashtags.

6. HASHTAG INTEGRATION:
   - Do NOT create a separate JSON field for hashtags.
   - You MUST append 3-5 relevant, high-traffic viral hashtags at the VERY END of the "suggested_caption".
   - Leave a blank line before the hashtags.

7. ACCURATE CATEGORIZATION:
   - You MUST classify each clip into one of the following specific categories based on its content:
     "Education", "Trending Today", "Sex/Relationships", "Movie Spoiler", "Politics", "Tutorial", "Podcast Highlight", "FYP/Viral", "Comedy", "Drama", or "Motivation".

OUTPUT FORMAT
- Return ONLY a raw JSON array.
- Do NOT use Markdown formatting (no \`\`\`json).
- Do NOT add any introductory text.

JSON STRUCTURE
[
  {
    "start": "MM:SS",
    "end": "MM:SS",
    "duration_seconds": 45,
    "virality_score": 9.5,
    "reason": "[Why is this viral? Write in Transcript Language. NO EMOJIS]",
    "suggested_caption": "Hook Headline [Transcript Language]\\n\\nEngaging summary/question for the audience... [NO EMOJIS]\\n\\n#ViralTag #TopicTag #Trending",
    "content_type": "Select from: Education, Trending Today, Sex/Relationships, Movie Spoiler, Politics, Tutorial, Podcast Highlight, FYP/Viral, Comedy, Drama, or Motivation",
    "transcript_excerpt": "The first few words of the clip..."
  }
]

${transcriptStatus === "NOT_AVAILABLE" ? "Output: []" : "Action: Find 6-12 viral clips. STRICTLY follow the 30s minimum rule. NO EMOJIS allowed. Include hashtags inside the caption. Output JSON only."}`;
    }

    // Using customPrompt in generateContent from geminiService
    try {
      const result = await geminiService.generateContent("Analysis_Request", "SYSTEM_USER", {
        customPrompt: prompt
      });
                            // Handle different response formats
                            if (result.responseType === 'clips' && result.clips) {
                                // For clip analysis, return the clips array as JSON string (main.js expects JSON)
                                return JSON.stringify(result.clips);
                            } else {
                                // For content generation, return as expected
                                return JSON.stringify(result);
                            }
    } catch (error) {
      throw error;
    }
  }

  // Additional method for different types of clips
  async analyzeForSpecificTopics(transcriptText, videoTitle, topics = ['funny', 'emotional', 'educational']) {
    const prompt = `
Analyze transcript for ${topics.join(', ')} moments.
${this.buildPromptTemplate(transcriptText, videoTitle)}
    `;
    // Similar call
  }

  buildPromptTemplate(transcriptText, videoTitle) {
    return `
Title: "${videoTitle}"
Find viral clips for: ${topics.join(', ')}

Output JSON array with start/end times, scores, reasons, captions.
    `;
  }
}

module.exports = new ClipperAgent();
