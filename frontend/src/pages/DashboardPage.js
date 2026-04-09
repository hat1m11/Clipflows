// frontend/src/pages/DashboardPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import { getPosts, deletePost, retryPost } from '../services/api';

function formatDate(str) {
  return new Date(str).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PLATFORM_ICONS = {
  tiktok: '🎵',
  instagram: '📸',
  twitter: '🐦',
  linkedin: '💼',
};

export default function DashboardPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchPosts = useCallback(async () => {
    try {
      const { posts } = await getPosts();
      setPosts(posts || []);
    } catch (err) {
      console.error('Failed to load posts', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Poll every 5s if any posts are pending/processing
  useEffect(() => {
    const hasActive = posts.some((p) =>
      p.targets?.some((t) => t.status === 'pending' || t.status === 'processing')
    );
    if (!hasActive) return;
    const interval = setInterval(fetchPosts, 5000);
    return () => clearInterval(interval);
  }, [posts, fetchPosts]);

  const handleDelete = async (postId) => {
    setDeletingId(postId);
    try {
      await deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const handleRetry = async (postId, targetId) => {
    try {
      await retryPost(postId, targetId);
      await fetchPosts();
    } catch (err) {
      alert(err.response?.data?.error || 'Retry failed');
    }
  };

  // Stats
  const allTargets = posts.flatMap((p) => p.targets || []);
  const stats = {
    total: posts.length,
    live: allTargets.filter((t) => t.status === 'success').length,
    pending: allTargets.filter((t) => t.status === 'pending' || t.status === 'processing').length,
    failed: allTargets.filter((t) => t.status === 'failed').length,
  };

  return (
    <Layout>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Track all your posts across platforms.</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Posts</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Live</div>
          <div className="stat-value green">{stats.live}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Queue</div>
          <div className="stat-value yellow">{stats.pending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Failed</div>
          <div className="stat-value red">{stats.failed}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 className="section-heading" style={{ marginBottom: 0 }}>Recent Posts</h2>
        <Link to="/upload" className="btn btn-primary btn-sm">
          + New Post
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" />
        </div>
      ) : posts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🎬</div>
            <h3 className="empty-title">No posts yet</h3>
            <p className="empty-sub">Upload your first video and start distributing it across platforms.</p>
            <Link to="/upload" className="btn btn-primary">Upload a Video</Link>
          </div>
        </div>
      ) : (
        <div className="posts-grid">
          {posts.map((post) => (
            <div key={post.id} className="post-card">
              <div className="post-thumb">🎬</div>

              <div className="post-info">
                <div className="post-filename">
                  {post.video_filename || 'Video'}
                </div>
                <div className="post-date">{formatDate(post.created_at)}</div>
                <div className="post-targets">
                  {(post.targets || []).map((target) => (
                    <div key={target.id} className="post-target-item">
                      <span>{PLATFORM_ICONS[target.platform] || '📤'}</span>
                      <StatusBadge status={target.status} />
                      {target.status === 'failed' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRetry(post.id, target.id)}
                          title={target.error_message}
                          style={{ padding: '3px 10px', fontSize: 12 }}
                        >
                          ↺ Retry
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="post-actions">
                {confirmDelete === post.id ? (
                  <>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(post.id)}
                      disabled={deletingId === post.id}
                    >
                      {deletingId === post.id ? '…' : 'Confirm'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmDelete(post.id)}
                    title="Delete post"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-3)',
            border: '1px solid var(--border-strong)',
            borderRadius: 12,
            padding: '12px 20px',
            fontSize: 13.5,
            color: 'var(--text-2)',
            zIndex: 50,
          }}
        >
          ⚠️ This removes the post from ClipFlow only. It stays on TikTok.
        </div>
      )}
    </Layout>
  );
}
