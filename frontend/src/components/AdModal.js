// frontend/src/components/AdModal.js
import React, { useState, useEffect } from 'react';

const ADS = [
  {
    emoji: '🚀',
    headline: 'ClipFlow Pro',
    body: 'Schedule posts, analytics, and AI captions',
    cta: 'Coming Soon',
  },
  {
    emoji: '🎯',
    headline: 'Post to Instagram',
    body: 'Multi-platform support launching soon. Join the waitlist.',
    cta: 'Get Early Access',
  },
  {
    emoji: '✨',
    headline: 'AI Caption Generator',
    body: 'Let AI write viral captions for your videos automatically.',
    cta: 'Join Waitlist',
  },
];

export default function AdModal({ onClose }) {
  const [seconds, setSeconds] = useState(4);
  const ad = ADS[Math.floor(Math.random() * ADS.length)];

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  return (
    <div className="modal-overlay" onClick={seconds <= 0 ? onClose : undefined}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎉</div>
        <h2 className="modal-title">Your video is queued!</h2>
        <p className="modal-sub">Sit tight — it'll be live on TikTok in moments.</p>

        <div className="ad-box">
          <span className="ad-emoji">{ad.emoji}</span>
          <div>
            <span className="ad-label">Sponsored</span>
            <p className="ad-copy">
              {ad.headline}
              <small>{ad.body}</small>
            </p>
          </div>
        </div>

        {seconds > 0 ? (
          <p className="modal-timer">You can close this in {seconds}s…</p>
        ) : null}

        <button
          className="btn btn-primary btn-full"
          onClick={onClose}
          disabled={seconds > 0}
        >
          {seconds > 0 ? `${ad.cta} (${seconds})` : 'Go to Dashboard →'}
        </button>
      </div>
    </div>
  );
}
