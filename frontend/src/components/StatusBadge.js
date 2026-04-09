// frontend/src/components/StatusBadge.js
import React from 'react';

const LABELS = {
  pending: '🟡 Pending',
  processing: '⚡ Posting…',
  success: '🟢 Live',
  failed: '🔴 Failed',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge ${status}`}>
      <span className="status-dot" />
      {LABELS[status] || status}
    </span>
  );
}
