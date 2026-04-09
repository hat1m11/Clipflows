// frontend/src/pages/UploadPage.js
import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import AdModal from '../components/AdModal';
import { uploadVideo, createPost } from '../services/api';

const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok', icon: '🎵', available: true },
  { id: 'instagram', name: 'Instagram', icon: '📸', available: true },
  { id: 'twitter', name: 'X / Twitter', icon: '🐦', available: false },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', available: false },
];

const MAX_CAPTION = 2200;

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef();

  const [file, setFile] = useState(null);
  const [uploadedPath, setUploadedPath] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const [selectedPlatforms, setSelectedPlatforms] = useState(['tiktok']);
  const [useGlobalCaption, setUseGlobalCaption] = useState(true);
  const [globalCaption, setGlobalCaption] = useState('');
  const [captions, setCaptions] = useState({});

  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [showAd, setShowAd] = useState(false);

  // ── File selection ──
  const handleFile = useCallback(async (f) => {
    if (!f) return;

    const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (!allowed.includes(f.type)) {
      setUploadError('Please upload a video file (MP4, MOV, AVI, or WebM).');
      return;
    }
    if (f.size > 500 * 1024 * 1024) {
      setUploadError('File too large. Max size is 500MB.');
      return;
    }

    setFile(f);
    setUploadError('');
    setUploadedPath(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadVideo(f, setUploadProgress);
      setUploadedPath(result.videoPath);
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed. Please try again.');
      setFile(null);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const togglePlatform = (id) => {
    const platform = PLATFORMS.find((p) => p.id === id);
    if (!platform.available) return;
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedPlatforms(PLATFORMS.filter((p) => p.available).map((p) => p.id));
  };

  // ── Submit ──
  const handlePost = async () => {
    if (!uploadedPath) { setPostError('Please upload a video first.'); return; }
    if (!selectedPlatforms.length) { setPostError('Select at least one platform.'); return; }

    const activeCaption = useGlobalCaption ? globalCaption : null;
    if (useGlobalCaption && !activeCaption?.trim()) {
      setPostError('Please enter a caption.');
      return;
    }

    setPostError('');
    setPosting(true);

    try {
      await createPost({
        videoPath: uploadedPath,
        platforms: selectedPlatforms,
        useGlobalCaption,
        globalCaption: useGlobalCaption ? globalCaption : undefined,
        captions: !useGlobalCaption ? captions : undefined,
      });
      setShowAd(true);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to post. Please try again.';
      setPostError(msg);
    } finally {
      setPosting(false);
    }
  };

  const handleAdClose = () => {
    setShowAd(false);
    navigate('/');
  };

  const captionCount = useGlobalCaption
    ? globalCaption.length
    : Math.max(...selectedPlatforms.map((p) => (captions[p] || '').length), 0);

  return (
    <Layout>
      <div className="page-header">
        <h1 className="page-title">Upload & Post</h1>
        <p className="page-subtitle">Upload your video, add a caption, and distribute everywhere.</p>
      </div>

      {/* Step 1: Upload */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-heading">1. Select Video</h2>

        {!file ? (
          <div
            className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="upload-icon">📹</div>
            <div className="upload-title">Drop your video here</div>
            <div className="upload-sub">or click to browse · MP4, MOV, AVI, WebM · up to 500MB</div>
            <input
              ref={fileInputRef}
              type="file"
              className="upload-input"
              accept="video/*"
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '20px 24px', background: 'var(--bg-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 32 }}>🎬</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
                {uploading && (
                  <>
                    <div className="progress-bar-wrap" style={{ marginTop: 10 }}>
                      <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 5 }}>
                      Uploading… {uploadProgress}%
                    </div>
                  </>
                )}
                {uploadedPath && !uploading && (
                  <div style={{ fontSize: 13, color: 'var(--green)', marginTop: 6 }}>✓ Ready to post</div>
                )}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setFile(null); setUploadedPath(null); }}
                disabled={uploading}
              >
                ✕ Remove
              </button>
            </div>
          </div>
        )}

        {uploadError && <p className="form-error" style={{ marginTop: 10 }}>{uploadError}</p>}
      </div>

      {/* Step 2: Platforms */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="section-heading" style={{ marginBottom: 0 }}>2. Select Platforms</h2>
          <button className="btn btn-ghost btn-sm" onClick={selectAll}>
            Post to All
          </button>
        </div>

        <div className="platform-grid">
          {PLATFORMS.map((p) => {
            const selected = selectedPlatforms.includes(p.id);
            return (
              <div
                key={p.id}
                className={`platform-option ${selected ? 'selected' : ''} ${!p.available ? 'disabled' : ''}`}
                onClick={() => togglePlatform(p.id)}
              >
                <span className="platform-logo">{p.icon}</span>
                <span className="platform-name">{p.name}</span>
                {!p.available && <span className="platform-badge">Soon</span>}
                {selected && p.available && (
                  <span className="platform-check">✓</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 3: Captions */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-heading">3. Caption</h2>

        <div className="toggle-row" style={{ marginBottom: 20 }}>
          <div>
            <div className="toggle-label">Use same caption for all platforms</div>
            <div className="toggle-sub">Toggle off to customise per platform</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={useGlobalCaption}
              onChange={(e) => setUseGlobalCaption(e.target.checked)}
            />
            <span className="toggle-track" />
          </label>
        </div>

        {useGlobalCaption ? (
          <div className="form-group">
            <label className="form-label">Caption for all platforms</label>
            <textarea
              className="form-textarea"
              placeholder="Write your caption… #hashtags work great here"
              value={globalCaption}
              onChange={(e) => setGlobalCaption(e.target.value)}
              maxLength={MAX_CAPTION}
              rows={4}
            />
            <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right', marginTop: 4 }}>
              {globalCaption.length}/{MAX_CAPTION}
            </div>
          </div>
        ) : (
          selectedPlatforms.map((pid) => {
            const pl = PLATFORMS.find((p) => p.id === pid);
            return (
              <div key={pid} className="form-group">
                <label className="form-label">{pl?.icon} {pl?.name} Caption</label>
                <textarea
                  className="form-textarea"
                  placeholder={`Caption for ${pl?.name}…`}
                  value={captions[pid] || ''}
                  onChange={(e) => setCaptions((prev) => ({ ...prev, [pid]: e.target.value }))}
                  maxLength={MAX_CAPTION}
                  rows={3}
                />
                <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right', marginTop: 4 }}>
                  {(captions[pid] || '').length}/{MAX_CAPTION}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Post Button */}
      {postError && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          ⚠️ {postError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Cancel
        </button>
        <button
          className="btn btn-primary btn-lg"
          onClick={handlePost}
          disabled={posting || uploading || !uploadedPath}
        >
          {posting ? (
            <>
              <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              Queuing…
            </>
          ) : (
            <>🚀 Post to {selectedPlatforms.length === 1 ? PLATFORMS.find(p => p.id === selectedPlatforms[0])?.name : `${selectedPlatforms.length} Platforms`}</>
          )}
        </button>
      </div>

      {showAd && <AdModal onClose={handleAdClose} />}
    </Layout>
  );
}
