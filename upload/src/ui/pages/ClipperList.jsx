import React, { useState, useEffect } from 'react';

function ClipperList({ onSelectClipper }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const savedSessions = await window.electronAPI.getClipperSessions();
      setSessions(savedSessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
      setSessions([]);
    }
  };

  const deleteSession = async (sessionId) => {
    if (!confirm('Are you sure you want to delete this clipper session?')) return;

    try {
      const result = await window.electronAPI.deleteClipperSession(sessionId);
      if (result.success) {
        const updatedSessions = sessions.filter(s => s.id !== sessionId);
        setSessions(updatedSessions);
        alert('Session deleted successfully');
      } else {
        alert('Failed to delete session - session not found');
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Failed to delete session');
    }
  };

  const resumeSession = (session) => {
    onSelectClipper(session);
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-400 mb-8">Saved Clipper Sessions</h1>

        {sessions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No saved clipper sessions yet.</p>
            <p className="text-gray-500 mt-2">Sessions will appear here after you save them from the Clipper tool.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sessions.map((session) => (
              <div key={session.id} className="liquid-card p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-base font-medium text-cyan-400 mb-1">
                      {session.title}
                    </h3>
                    {session.videoInfo?.title && (
                      <p className="text-sm text-gray-300 mb-2">
                        🎬 {session.videoInfo.title}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mb-3">
                      {new Date(session.savedAt).toLocaleString()}
                    </p>
                    <div className="text-sm text-gray-300">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Clips:</span>
                        <span className="text-gray-200 font-medium">{session.clips.length} clips</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => resumeSession(session)}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors text-sm"
                  >
                    Resume Editing
                  </button>
                  <button
                    onClick={() => deleteSession(session.id)}
                    className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-lg font-medium transition-colors text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ClipperList;
