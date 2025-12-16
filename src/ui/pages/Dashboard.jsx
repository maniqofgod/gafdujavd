import React, { useState } from 'react';

const SUB_TABS = [
  { id: 'ai', label: '🤖 Analisis AI', description: 'Buat klip otomatis' },
  { id: 'manual', label: '📝 Input Manual', description: 'Klip JSON' },
  { id: 'processing', label: '📄 Transkrip Otomatis', description: 'Hanya transkrip' }
];

function Dashboard({ onNavigate, videoInfo: propVideoInfo, setVideoInfo: propSetVideoInfo }) {
  const [currentSubTab, setCurrentSubTab] = useState('ai');
  const [url, setUrl] = useState('');
  const [progress, setProgress] = useState(null);
  const [processLogs, setProcessLogs] = useState([]);
  const [videoInfo, setVideoInfo] = useState(propVideoInfo || null);
  const [suggestedClips, setSuggestedClips] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [jsonClips, setJsonClips] = useState('');
  const [aiPromptYoutubeUrl, setAiPromptYoutubeUrl] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Paste from clipboard helper
  const pasteFromClipboard = async (callback) => {
    try {
      const text = await navigator.clipboard.readText();
      callback(text);
    } catch (error) {
      console.warn('Failed to paste from clipboard:', error);
      alert('Gagal mengakses clipboard. Pastikan browser memiliki izin untuk mengakses clipboard.');
    }
  };

const aiPromptContent = `ROLE
You are an expert Social Media Strategist and Video Editor for TikTok/Reels. You possess a "viral sense" to identify moments that maintain high retention.
GOAL
Analyze the attached video and extract the TOP 5-10 most engaging clips.
The clips must be punchy, standalone, and attention-grabbing (Vertical Video Format).

STRICT EDITING RULES (MUST FOLLOW):

DURATION CONTROL (CRITICAL):
MINIMUM: 30 Seconds (Absolutely NO clips under 30s).
MAXIMUM: 90 Seconds.
LOGIC: If a potential viral segment is only 15-20 seconds, you MUST include the sentences immediately BEFORE (setup) or AFTER (context) it to extend the duration until it hits at least 30 seconds.

THE "HOOK" PRINCIPLE:
The "start" timestamp MUST align with a strong opening line (Start of a sentence).
Good Hooks: A question, a controversial statement, high energy, or "Did you know?".
Bad Hooks: "Um..", "So...", silence, or starting in the middle of a sentence.

STANDALONE CONTEXT:
The clip must tell a complete mini-story or deliver a complete tip.
It must NOT end abruptly in the middle of a sentence.

LANGUAGE & TONE:
Detect the language of the video automatically.
"Reason" and "Caption" MUST be in the SAME language as the video spoken language.
Caption style: Casual, viral, social-media native (use slang/informal tone if appropriate for the language).

🚫 NO EMOJIS POLICY (STRICT):
You must NOT use any emojis (e.g., 🔥, 🚀, 😂) in the "reason" or "suggested_caption".
The output must be PLAIN TEXT ONLY.
Exception: The symbol "#" is ALLOWED for hashtags.

HASHTAG INTEGRATION:
You MUST append 3-5 relevant, high-traffic viral hashtags at the VERY END of the "suggested_caption".
Leave a blank line before the hashtags.

ACCURATE CATEGORIZATION:
You MUST classify each clip into one of the following specific categories based on its content:
"Education", "Trending Today", "Sex/Relationships", "Movie Spoiler", "Politics", "Tutorial", "Podcast Highlight", "FYP/Viral", "Comedy", "Drama", "Motivation".

OUTPUT FORMAT
Return ONLY a raw JSON array.
Do NOT use Markdown formatting (no \`\`\`json).
Do NOT add any introductory text.

JSON STRUCTURE
[
  {
    "start": "MM:SS",
    "end": "MM:SS",
    "duration_seconds": 45,
    "virality_score": 9.5,
    "reason": "[Why is this viral? Write in Video Language. NO EMOJIS]",
    "suggested_caption": "Hook Headline [Video Language]\\n\\nEngaging summary/question for the audience... [NO EMOJIS]\\n\\n#ViralTag #TopicTag #Trending",
    "content_type": "Select from: Education, Trending Today, Sex/Relationships, Movie Spoiler, Politics, Tutorial, Podcast Highlight, FYP/Viral, Comedy, Drama, or Motivation",
    "transcript_excerpt": "The first few words of the clip..."
  }
]

ACTION:
Find 5-10 viral clips from the video. STRICTLY follow the 30s minimum rule. NO EMOJIS allowed. Include hashtags inside the caption. Output JSON only.`;

  // Update local state when props change
  React.useEffect(() => {
    if (propVideoInfo) {
      setVideoInfo(propVideoInfo);
    }
  }, [propVideoInfo]);

  // Listen for progress updates and animate progress bar
  const [progressPercent, setProgressPercent] = useState(0);
  const progressSteps = [
    'Fetching video transcript...',
    'Transcript retrieved successfully',
    'Creating AI prompt for analysis...',
    'AI analysis completed successfully',
    'Starting video download...',
    'Video downloaded successfully',
    'Extracting video title...',
    'Title extracted:'
  ];

  // Use useCallback to ensure stable function reference for proper listener cleanup
  const handleProgress = React.useCallback((data) => {
    console.log('Raw progress data received:', data, typeof data); // Debug logging

    // Only process valid string messages
    if (data && typeof data === 'string' && data.trim()) {
      setProgress(data);

      // Add to logs array for display with timestamp
      const timestamp = new Date().toLocaleTimeString();
      setProcessLogs(prevLogs => [...prevLogs, `[${timestamp}] ${data}`]);

      console.log('Processed progress message:', data); // Debug logging
      console.log('Current processLogs count:', prevLogs.length + 1); // Debug logging

      // Calculate progress based on message content
      if (data.includes('Downloading...')) {
        const percentMatch = data.match(/(\d+\.\d+)%/);
        if (percentMatch) {
          // Map download progress to 10-80% of total progress (download takes most time)
          const downloadPercent = parseFloat(percentMatch[1]);
          const totalPercent = 10 + (downloadPercent * 0.7); // From 10% to 80%
          setProgressPercent(totalPercent);
          console.log(`Download progress: ${downloadPercent}% -> ${totalPercent}% total`); // Debug
          return;
        }
      }

      // Check for other step messages
      if (data.includes('Video downloaded successfully') || data.includes('Download completed successfully')) {
        setProgressPercent(80);
        console.log('Setting progress to 80% - download complete'); // Debug
        return;
      }

      // Fall back to step-based progress
      const stepIndex = progressSteps.findIndex(step =>
        data.toLowerCase().includes(step.toLowerCase())
      );
      if (stepIndex >= 0) {
        let newProgress;
        if (stepIndex === 0) { // Starting video download
          newProgress = 5;
        } else if (stepIndex === 1) { // Video downloaded successfully
          newProgress = 80;
        } else {
          newProgress = ((stepIndex + 1) / progressSteps.length) * 100;
        }
        setProgressPercent(newProgress);
        console.log(`Step-based progress: "${data}" -> ${newProgress}% (${stepIndex}/${progressSteps.length})`); // Debug
      } else if (data.includes('Successfully generated') || data.includes('completed')) {
        setProgressPercent(100);
        console.log('Setting progress to 100% - all complete'); // Debug
      }
    } else {
      console.log('Filtered out invalid progress message:', data); // Debug logging
    }
  }, []);

  React.useEffect(() => {
    console.log('Setting up progress listener'); // Debug logging

    // Use contextBridge API with proper handler management
    const progressHandler = window.electronAPI.onProgress(handleProgress);
    console.log('Progress listener set up via contextBridge'); // Debug logging

    return () => {
      // Remove specific progress listener
      console.log('Cleaning up progress listeners'); // Debug logging
      if (progressHandler) {
        window.electronAPI.removeProgressListener(progressHandler);
      }
    };
  }, [handleProgress]);

  const isManualMode = currentSubTab === 'manual';
  const isProcessingMode = currentSubTab === 'processing';

  // Helper function to convert time string (HH:MM:SS or MM:SS) to seconds
  const timeToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      // MM:SS format
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // HH:MM:SS format
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validate inputs based on mode
    if (isManualMode) {
      if (!jsonClips.trim() && !aiPromptYoutubeUrl.trim()) { // If neither JSON nor AI Prompt URL is provided for manual processing
        alert('Harap berikan Data Klip JSON, atau URL YouTube untuk diproses dengan AI Prompt.');
        return;
      }
      if (jsonClips.trim()) {
        try {
          JSON.parse(jsonClips);
        } catch (error) {
          alert('Format JSON tidak valid untuk Data Klip. Silakan periksa data JSON Anda.');
          return;
        }
      }
    } else if (isProcessingMode) {
      if (!url) {
        alert('Please provide a YouTube Video URL for Processing Mode.');
        return;
      }
    } else { // AI Analysis mode
      if (!url) {
        alert('Harap berikan URL Video YouTube untuk Analisis AI.');
        return;
      }
    }

    setIsProcessing(true);
    setProgress(isProcessingMode ? 'Starting Processing Mode...' : 'Starting video download...');
    setProcessLogs([]); // Clear previous logs
    setVideoInfo(null);
    setSuggestedClips([]);

    const videoUrlToProcess = isManualMode && aiPromptYoutubeUrl.trim() ? aiPromptYoutubeUrl : url;
    if (!videoUrlToProcess) {
      alert('No video URL provided for processing.');
      setIsProcessing(false);
      return;
    }

    try {
      let mode = 'ai';
      if (isManualMode) mode = 'manual';
      else if (isProcessingMode) mode = 'processing_mode';

      const processOptions = {
        url: videoUrlToProcess, // Use the correct URL for processing
        mode: mode,
        jsonClips: jsonClips.trim() ? jsonClips : null // Only send jsonClips if it's provided
        // aiPromptText is no longer sent, as it's for external copying
      };

      const result = await window.electronAPI.startProcess(processOptions);

      if (result && result.videoInfo) {
        setVideoInfo(result.videoInfo);
        setSuggestedClips(result.videoInfo.suggestedClips || []);
        setProgress(result.message || (isProcessingMode ? 'Processing Mode transcript fetched successfully!' : 'Video downloaded successfully!'));
        setUrl(''); // Clear the URL field
        if (isManualMode) setJsonClips(''); // Clear JSON field

        // Fix: Convert time formats for manual mode clips to ensure consistent format
        if (isManualMode && result.videoInfo.suggestedClips) {
          result.videoInfo.suggestedClips = result.videoInfo.suggestedClips.map(clip => ({
            ...clip,
            start: clip.start,
            end: clip.end
          }));
        }

        // Auto-save session after successful processing (AI analysis or manual input)
        if (!isProcessingMode && result.videoInfo.suggestedClips && result.videoInfo.suggestedClips.length > 0) {
          try {
            const clipsForSaving = result.videoInfo.suggestedClips.map((clip, index) => ({
              id: index + 1,
              start: timeToSeconds(clip.start),
              end: timeToSeconds(clip.end),
              name: `Clip ${index + 1}`,
              caption: clip.suggested_caption || '',
              reason: clip.reason || '',
              score: clip.virality_score || 5,
              outputPath: null,
              channel: result.videoInfo.channel || 'Unknown Channel'
            }));

            const sessionTitle = result.videoInfo.title && result.videoInfo.title !== 'undefined' ? result.videoInfo.title : 'YouTube Video';
            const session = {
              id: Date.now().toString(),
              title: `Auto-saved - ${sessionTitle}`,
              savedAt: new Date().toISOString(),
              videoInfo: result.videoInfo,
              clips: clipsForSaving
            };

            await window.electronAPI.saveClipperSession(session);
            console.log('Session auto-saved after AI analysis');
          } catch (error) {
            console.error('Error auto-saving session:', error);
          }
        }
      } else {
        setProgress(isProcessingMode ? 'Processing Mode completed.' : 'Video download completed.');
      }
    } catch (error) {
      console.error('Video processing error:', error);
      setProgress(`Error: ${error.message}`);
      alert(`Processing failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-8">
      {/* Sub Tabs - Now Checkboxes */}
      <div className="flex justify-center mb-8">
        <div className="bg-gradient-to-r from-gray-800 to-gray-750 rounded-2xl p-6 border border-cyan-500/20">
          <div className="flex justify-center space-x-8">
            {SUB_TABS.map((subTab) => (
              <label key={subTab.id} className="flex items-center space-x-3 cursor-pointer group">
                <input
                  type="radio"
                  name="processingMode"
                  checked={currentSubTab === subTab.id}
                  onChange={() => setCurrentSubTab(subTab.id)}
                  className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 focus:ring-cyan-500 focus:ring-2"
                />
                <div className="flex flex-col">
                  <span className={`font-medium transition-colors group-hover:text-cyan-300 ${
                    currentSubTab === subTab.id ? 'text-cyan-300' : 'text-gray-300'
                  }`}>
                    {subTab.label}
                  </span>
                  <span className="text-xs text-gray-500 text-center">{subTab.description}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Main Input Card */}
      <div className="liquid-card p-8 mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Controls */}
          <div className="lg:col-span-1">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-cyan-400 mb-4">
                {isManualMode ? 'Pemrosesan Klip JSON' : isProcessingMode ? 'Transkrip Otomatis' : 'Pembuatan Klip Bertenaga AI'}
              </h3>
              <p className="text-gray-300 text-sm mb-4">
                {isManualMode
                  ? 'Proses klip dari data JSON atau gunakan AI untuk membuatnya dari URL YouTube.'
                  : isProcessingMode
                    ? 'Ekstrak transkrip dalam format timestamp untuk pemrosesan lanjutan.'
                    : 'Secara otomatis menganalisis video dan membuat klip siap-viral dengan caption.'
                }
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isProcessing}
              className="w-full form-button hover:bg-cyan-400 hover:shadow-cyan-500/50"
            >
              {isProcessing ? 'Memproses...' : (isManualMode ? 'Proses Input Manual' : (isProcessingMode ? 'Ambil Transkrip Otomatis' : 'Analisis & Buat Klip'))}
            </button>
          </div>

          {/* Right Column - URL & JSON Input */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit}>
              {!isManualMode && (
                <div className="form-group">
                  <label className="form-label">URL Video YouTube</label>
                  <div className="relative">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="form-input pr-12"
                      placeholder="https://www.youtube.com/watch?v=..."
                      required={!isManualMode}
                    />
                    <button
                      type="button"
                      onClick={() => pasteFromClipboard(setUrl)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                      title="Paste from clipboard"
                    >
                      📋
                    </button>
                  </div>
                </div>
              )}

              {isManualMode && (
                <>
                  <div className="form-group">
                    <label className="form-label">YouTube Video URL for AI Prompt (Optional)</label>
                    <div className="relative">
                      <input
                        type="url"
                        value={aiPromptYoutubeUrl}
                        onChange={(e) => setAiPromptYoutubeUrl(e.target.value)}
                        className="form-input pr-12"
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                      <button
                        type="button"
                        onClick={() => pasteFromClipboard(setAiPromptYoutubeUrl)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors"
                        title="Paste from clipboard"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <button
                      type="button"
                      onClick={() => setShowPromptModal(true)}
                      className="form-button w-full mb-4"
                    >
                      AI Prompt
                    </button>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Clip Data JSON (Optional)</label>
                    <textarea
                      value={jsonClips}
                      onChange={(e) => setJsonClips(e.target.value)}
                      className="form-input"
                      rows="12"
                      placeholder='Paste your JSON array here, e.g.:
[
  {
    "start": "03:52",
    "end": "04:32",
    "virality_score": 9,
    "reason": "Description here...",
    "suggested_caption": "Caption here...",
    "content_type": "Educational",
    "peak_engagement_moment": "04:22"
  }
]'
                    />
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* AI Prompt Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-2xl w-full relative">
            <h3 className="text-xl font-bold text-cyan-400 mb-4">AI Prompt for External Use</h3>
            <textarea
              readOnly
              value={aiPromptContent}
              className="form-input mb-4 h-64 resize-none"
            ></textarea>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(aiPromptContent);
                  alert('Prompt copied to clipboard!');
                }}
                className="form-button bg-cyan-600 hover:bg-cyan-700"
              >
                Copy Prompt
              </button>
              <button
                onClick={() => setShowPromptModal(false)}
                className="form-button bg-gray-600 hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col">
          {/* Header with status */}
          <div className="flex-shrink-0 p-6 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-b border-cyan-500/20">
            <div className="flex items-center justify-center space-x-4">
              <div className="text-2xl">🔄</div>
              <h2 className="text-2xl font-bold text-white">
                {isProcessingMode ? 'Fetching Auto Transcript...' : (isManualMode ? 'Processing Manual Input...' : 'Analyzing Video for Clips...')}
              </h2>
            </div>
          </div>

          {/* Centered loading spinner with logo */}
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
              <h3 className="text-xl font-semibold text-cyan-300">{progress || 'Initializing...'}</h3>
              <div className="w-full max-w-md bg-gray-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-cyan-600 to-blue-500 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <p className="text-gray-400 text-sm">{Math.round(progressPercent)}% Complete</p>
            </div>
          </div>

          {/* Process Logs at Bottom */}
          <div className="flex-shrink-0 p-6 bg-gray-800/90 backdrop-blur border-t border-gray-700/50">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold text-cyan-300">📋 Process Logs</h4>
                <span className="text-xs bg-cyan-600/30 px-2 py-1 rounded text-cyan-300">
                  {processLogs.length} messages
                </span>
              </div>
              <div className="bg-black/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                {processLogs.map((log, index) => (
                  <div key={index} className="text-sm text-green-300 font-mono mb-2 leading-5 break-words">
                    {log}
                  </div>
                ))}
                {processLogs.length === 0 && (
                  <div className="text-sm text-gray-400 text-center py-4">
                    🔄 Initializing process...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Results */}
      {videoInfo && !isProcessingMode && (
        <>
          {/* Transcript Display for Normal Modes */}
          {videoInfo.transcript && (
            <div className="liquid-card p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-cyan-400">📝 Transcript Video YouTube</h3>
                <span className="text-xs bg-green-600 px-2 py-1 rounded">✅ Transcript Tersedia</span>
              </div>
              <div className="bg-gray-900 p-4 rounded-lg max-h-64 overflow-y-auto">
                <pre className="text-sm text-green-300 whitespace-pre-wrap font-mono">
                  {videoInfo.transcript}
                </pre>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Transcript digunakan untuk analisis AI agar captions akurat sesuai konten yang dibahas
              </div>
            </div>
          )}
        <div className="liquid-card p-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-bold mb-2">Video Downloaded Successfully</h3>
              <div className="text-sm text-gray-400">
                <p><strong>Title:</strong> {videoInfo.title}</p>
                <p><strong>Transcript:</strong> {videoInfo.transcript ? 'Found' : 'Not available'}</p>
              </div>
            </div>
            <button
              className="neon-button px-4 py-2 rounded-lg text-sm"
              onClick={() => onNavigate('clipper', videoInfo)}
            >
              Go to Clipper
            </button>
          </div>

          {suggestedClips.length > 0 && (
            <>
              <h4 className="font-semibold mb-3">Suggested Clip Timestamps</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suggestedClips.map((clip, idx) => (
                  <div key={idx} className="glass-input p-4 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-cyan-400 font-semibold">Suggested Clip {idx + 1}</span>
                      <span className="bg-cyan-600 px-2 py-1 rounded text-xs">Score: {clip.virality_score}</span>
                    </div>
                    <p className="text-sm mb-2">
                      <strong>Time:</strong> {clip.start} - {clip.end}
                    </p>
                    <p className="text-xs text-gray-400 mb-2">{clip.reason}</p>
                    <p className="text-sm">
                      <strong>Caption:</strong> {clip.suggested_caption}
                    </p>
                  </div>
                ))}
              </div>
              <div className="text-center mt-4">
                <p className="text-sm text-gray-400">
                  Use the "Go to Clipper" button to edit and actually cut these clips
                </p>
              </div>
            </>
          )}
        </div>
        </>
      )}

      {/* Processing Mode Results */}
      {videoInfo && isProcessingMode && (
        <>
          {/* Auto Transcript Display */}
          <div className="liquid-card p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-cyan-400">📄 Auto Transcript</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(videoInfo.transcript);
                    alert('Transcript copied to clipboard!');
                  }}
                  className="form-button bg-cyan-600 hover:bg-cyan-700 px-3 py-1 text-sm"
                >
                  📋 Copy
                </button>
                <span className="text-xs bg-green-600 px-2 py-1 rounded">✅ Auto Transcript</span>
                {videoInfo.transcriptSaved && (
                  <span className="text-xs bg-blue-600 px-2 py-1 rounded">💾 Saved</span>
                )}
              </div>
            </div>
            <div className="bg-gray-900 p-4 rounded-lg max-h-64 overflow-y-auto">
              <pre className="text-sm text-green-300 whitespace-pre-wrap font-mono">
                {videoInfo.transcript}
              </pre>
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Format processing dengan timestamp dalam detik (0.38.48, etc.) untuk kebutuhan khusus. Click "Copy" to copy the transcript to clipboard.
            </div>
          </div>

          <div className="liquid-card p-8">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold mb-2">Auto Transcript Completed</h3>
                <div className="text-sm text-gray-400 mb-2">
                  <p><strong>Title:</strong> {videoInfo.title}</p>
                  <p><strong>Transcript:</strong> Retrieved in Auto Transcript format</p>
                  <p><strong>Mode:</strong> Transcript-only processing</p>
                  {videoInfo.transcriptSaved && videoInfo.filePath && (
                    <p><strong>File Path:</strong> {videoInfo.filePath}</p>
                  )}
                </div>
              </div>
              {videoInfo.transcriptSaved && videoInfo.filePath && (
                <button
                  className="neon-button px-4 py-2 rounded-lg text-sm"
                  onClick={() => window.electronAPI.openFile(videoInfo.filePath)}
                >
                  Open Transcript File
                </button>
              )}
            </div>
            <div className="text-center mt-4">
              <p className="text-sm text-gray-400">
                {videoInfo.transcriptSaved
                  ? `Auto Transcript completed successfully. Transcript saved and ready for autocaption use.`
                  : `Auto Transcript completed. ${videoInfo.transcript.includes('No transcript') ? 'No transcript available' : 'Transcript is ready for use.'}`}
              </p>
            </div>
          </div>
        </>
      )}


    </div>
  );
}

export default Dashboard;
