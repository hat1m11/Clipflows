// frontend/src/pages/AccountsPage.js
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { getAccounts, getTikTokOAuthUrl, connectTikTokMock, disconnectAccount } from '../services/api';

const PLATFORM_META = {
  tiktok: {
    name: 'TikTok',
    icon: '🎵',
    color: '#fe2c55',
    bg: 'rgba(254,44,85,0.1)',
    description: 'Share short-form videos with your TikTok audience.',
    available: true,
  },
  instagram: {
    name: 'Instagram',
    icon: '📸',
    color: '#e1306c',
    bg: 'rgba(225,48,108,0.1)',
    description: 'Post Reels and videos to your Instagram followers.',
    available: false,
  },
  twitter: {
    name: 'X / Twitter',
    icon: '🐦',
    color: '#1d9bf0',
    bg: 'rgba(29,155,240,0.1)',
    description: 'Share video clips with your X audience.',
    available: false,
  },
  linkedin: {
    name: 'LinkedIn',
    icon: '💼',
    color: '#0077b5',
    bg: 'rgba(0,119,181,0.1)',
    description: 'Distribute professional video content to your network.',
    available: false,
  },
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);
  const [message, setMessage] = useState('');

  const connectedMap = Object.fromEntries(accounts.map((a) => [a.platform, a]));

  const fetchAccounts = async () => {
    try {
      const { accounts } = await getAccounts();
      setAccounts(accounts || []);
    } catch (err) {
      console.error('Failed to load accounts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleConnect = async (platform) => {
    if (platform !== 'tiktok') return;
    setConnecting(platform);
    setMessage('');

    try {
      const { url, mock } = await getTikTokOAuthUrl();
      if (mock) {
        const result = await connectTikTokMock();
        setMessage(`✅ Connected as ${result.username}`);
        await fetchAccounts();
      } else {
        window.location.href = url;
      }
    } catch (err) {
      setMessage('❌ ' + (err.response?.data?.error || 'Connection failed'));
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform) => {
    if (!window.confirm(`Disconnect your ${PLATFORM_META[platform]?.name} account?`)) return;
    setDisconnecting(platform);
    try {
      await disconnectAccount(platform);
      setMessage(`Disconnected from ${PLATFORM_META[platform]?.name}.`);
      await fetchAccounts();
    } catch (err) {
      setMessage('❌ ' + (err.response?.data?.error || 'Disconnect failed'));
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <h1 className="page-title">Connected Accounts</h1>
        <p className="page-subtitle">Manage your platform connections. More platforms coming soon.</p>
      </div>

      {message && (
        <div className={`alert ${message.startsWith('❌') ? 'alert-warning' : 'alert-success'}`} style={{ marginBottom: 24 }}>
          {message}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : (
          Object.entries(PLATFORM_META).map(([id, meta]) => {
            const connected = connectedMap[id];
            return (
              <div key={id} className="account-row">
                <div
                  className="account-icon"
                  style={{ background: meta.bg }}
                >
                  {meta.icon}
                </div>

                <div style={{ flex: 1 }}>
                  <div className="account-name">{meta.name}</div>
                  <div className={`account-status ${connected ? 'account-connected' : ''}`}>
                    {connected
                      ? `Connected${connected.platform_username ? ` as ${connected.platform_username}` : ''}`
                      : meta.description}
                  </div>
                </div>

                <div className="account-actions">
                  {!meta.available ? (
                    <span className="coming-soon-tag">Coming Soon</span>
                  ) : connected ? (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDisconnect(id)}
                      disabled={disconnecting === id}
                    >
                      {disconnecting === id ? '…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleConnect(id)}
                      disabled={!!connecting}
                    >
                      {connecting === id ? 'Connecting…' : `Connect ${meta.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}
