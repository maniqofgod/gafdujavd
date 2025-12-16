import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Clipper from './pages/Clipper';
import Results from './pages/Results';
import ClipperList from './pages/ClipperList'; // New component
import AutoCaption from './pages/AutoCaption'; // New component
import YouTubeUpload from './pages/YouTubeUpload'; // New component
import TikTokUpload from './pages/TikTokUpload'; // New component
import './styles/index.css';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'clipper', label: 'Clipper' },
  { id: 'autocaption', label: '📝 Auto Caption' },
  { id: 'ytupload', label: '📤 YT Upload' },
  { id: 'tiktokupload', label: '🎵 TikTok Upload' },
  { id: 'results', label: '📁 Hasil Proses' }
];

function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [currentVideoInfo, setCurrentVideoInfo] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Global processing status
  const [globalProcessingStatus, setGlobalProcessingStatus] = useState(null);

  const handleNavigate = (tab) => {
    setCurrentTab(tab);
  };

  // Global processing status - disabled since processing state manager was removed
  // TODO: Re-implement with in-memory state tracking if needed

  const renderTab = () => {
    switch (currentTab) {
      case 'settings':
        return null;
      case 'clipper':
        // If we have currentVideoInfo, show the Clipper component, otherwise show ClipperList
        if (currentVideoInfo) {
          return <Clipper
            onBack={() => {
              setCurrentVideoInfo(null);
              // Stay on 'clipper' tab, which will show ClipperList now
            }}
            videoInfo={currentVideoInfo}
            setVideoInfo={setCurrentVideoInfo}
            onNavigateToResults={() => setCurrentTab('autocaption')}
          />;
        } else {
          return <ClipperList
            onSelectClipper={(session) => {
              // Merge savedClips into videoInfo for resuming
              const videoInfoWithSavedClips = {
                ...session.videoInfo,
                savedClips: session.clips
              };
              setCurrentVideoInfo(videoInfoWithSavedClips);
              // Stay on 'clipper' tab but now it will show Clipper component
            }}
          />;
        }
      case 'autocaption':
        return <AutoCaption />;
      case 'ytupload':
        return <YouTubeUpload />;
      case 'tiktokupload':
        return <TikTokUpload />;
      case 'results':
        return <Results onBack={() => setCurrentTab('dashboard')} />;
      case 'dashboard':
      default:
        return <Dashboard
          onNavigate={(page, videoInfo) => {
            if (page === 'clipper') {
              setCurrentVideoInfo(videoInfo);
              setCurrentTab('clipper');
            } else if (page === 'settings') {
              setShowSettings(true);
            } else {
              setCurrentTab(page);
            }
          }}
          videoInfo={currentVideoInfo}
          setVideoInfo={setCurrentVideoInfo}
        />;
    }
  };

  return (
    <div className="content-area-main min-h-screen bg-black text-white">
      {/* Header with Tabs - Always Sticky */}
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-lg border-b border-gray-800 app-header">
        <div className="flex justify-between items-center px-6 py-4">
          {/* Logo and Title */}
          <div className="flex items-center space-x-4">
            <img src="./assets/photo_2025-12-02_10-51-10.jpg" alt="Auto Clipper AI Logo" className="h-12" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Auto Clipper AI
            </h1>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="text-gray-400 hover:text-cyan-400"
          >
            ⚙️ Manage API Keys
          </button>
        </div>

        {/* Main Tabs */}
        <div className="flex px-6 pb-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`px-4 py-2 mx-1 rounded-lg font-medium transition-colors ${
                currentTab === tab.id
                  ? 'bg-cyan-600 text-white'
                  : 'text-gray-400 hover:text-cyan-400 hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Global Processing Indicator - Part of Sticky Header */}
        {globalProcessingStatus && (
          <div className="mx-6 mb-4 bg-gradient-to-br from-gray-800 to-gray-750 rounded-2xl overflow-hidden shadow-2xl border border-cyan-500/10">
          <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 p-4 border-b border-cyan-500/20">
            <div className="flex items-center justify-center space-x-3">
              <div className="animate-spin w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full"></div>
              <h3 className="text-lg font-bold text-white">
                {globalProcessingStatus.isCuttingAll ? '⏺️ Processing All Video Clips' : '⏺️ Processing Video Clip'}
              </h3>
              <div className="text-sm text-cyan-300 ml-4">
                📹 {globalProcessingStatus.videoTitle}
              </div>
              <button
                onClick={() => {
                  // Navigate to clipper with the processing video
                  if (globalProcessingStatus.session) {
                    const videoInfoWithSavedClips = {
                      ...globalProcessingStatus.session.videoInfo,
                      savedClips: globalProcessingStatus.session.clips
                    };
                    setCurrentVideoInfo(videoInfoWithSavedClips);
                  }
                  setCurrentTab('clipper');
                }}
                className="ml-4 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors"
              >
                View Details
              </button>
            </div>
          </div>

          <div className="p-4">
            {/* Current Progress */}
            <div className="flex justify-between items-center text-sm mb-3">
              <span className="text-gray-400 font-medium">
                {globalProcessingStatus.cuttingProgress || 'Processing...'}
              </span>
              <span className="text-cyan-300 font-bold">
                {Math.round(globalProcessingStatus.cuttingPercent || 0)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden shadow-inner mb-3">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 rounded-full transition-all duration-500 ease-out shadow-lg"
                style={{ width: `${globalProcessingStatus.cuttingPercent || 0}%` }}
              ></div>
            </div>

            {/* Additional Info */}
            <div className="text-xs text-gray-500 text-center">
              Processing continues in background • Switch to Clipper tab for detailed logs
            </div>
          </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="relative">
        {showSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-gray-900 rounded-lg p-4 max-w-4xl w-full max-h-[90vh] overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-red-400 text-xl"
                >
                  ✕
                </button>
              </div>
              <Settings />
            </div>
          </div>
        )}

        {renderTab()}
      </div>
    </div>
  );
}

export default App;
