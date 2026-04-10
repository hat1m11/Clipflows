import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function InstagramCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = (params.get('code') || '').replace(/#.*$/, '');
    const errorParam = params.get('error');

    if (errorParam) {
      setError('Instagram authorization was denied.');
      setTimeout(() => navigate('/accounts'), 3000);
      return;
    }

    if (!code) {
      setError('No authorization code received.');
      setTimeout(() => navigate('/accounts'), 3000);
      return;
    }

    const state = params.get('state');
    api.post('/accounts/instagram/callback', { code, state })
      .then(() => navigate('/accounts'))
      .catch((err) => {
        setError(err.response?.data?.error || 'Failed to connect Instagram account.');
        setTimeout(() => navigate('/accounts'), 3000);
      });
  }, [navigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
      {error ? (
        <>
          <p style={{ color: '#e1306c' }}>{error}</p>
          <p style={{ color: '#888' }}>Redirecting back...</p>
        </>
      ) : (
        <>
          <div className="spinner" />
          <p>Connecting your Instagram account...</p>
        </>
      )}
    </div>
  );
}
