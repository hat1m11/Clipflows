// backend/src/platforms/instagram.js
const axios = require('axios');
const path = require('path');
const { query } = require('../db');

const AUTH_BASE = 'https://api.instagram.com';
const GRAPH_BASE = 'https://graph.instagram.com';

/**
 * Exchange OAuth code for a long-lived access token
 */
async function exchangeCodeForTokens(code, redirectUri) {
  // Step 1: short-lived token
  console.log('[Instagram] exchangeCodeForTokens - redirect_uri:', redirectUri, 'code length:', code?.length);
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  // New Instagram Login API uses graph.instagram.com for token exchange
  const shortRes = await axios.post(
    `${GRAPH_BASE}/oauth/access_token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  console.log('[Instagram] short-lived token:', JSON.stringify(shortRes.data));

  // Step 2: exchange for long-lived token (60 days)
  try {
    const longRes = await axios.get(`${GRAPH_BASE}/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        access_token: shortRes.data.access_token,
      },
    });
    console.log('[Instagram] long-lived token:', JSON.stringify(longRes.data));
    return longRes.data;
  } catch (err) {
    console.warn('[Instagram] Long-lived token exchange failed, using short-lived:', err.response?.data || err.message);
    return { access_token: shortRes.data.access_token, expires_in: 3600 };
  }
}

/**
 * Get Instagram user profile
 */
async function getUserProfile(accessToken) {
  try {
    const res = await axios.get(`${GRAPH_BASE}/me`, {
      params: {
        fields: 'user_id,username',
        access_token: accessToken,
      },
    });
    return {
      ig_user_id: res.data.user_id || res.data.id,
      username: `@${res.data.username}`,
    };
  } catch (err) {
    console.warn('[Instagram] Could not fetch profile:', err.message, err.response?.data);
    return { ig_user_id: null, username: '@instagram_user' };
  }
}

/**
 * Refresh long-lived token before expiry
 */
async function refreshAccessToken(socialAccountId, accessToken) {
  const res = await axios.get(`${GRAPH_BASE}/refresh_access_token`, {
    params: {
      grant_type: 'ig_refresh_token',
      access_token: accessToken,
    },
  });
  const { access_token, expires_in } = res.data;
  const expiresAt = new Date(Date.now() + (expires_in || 60 * 24 * 60 * 60) * 1000);
  await query(
    `UPDATE social_accounts SET access_token = $1, expires_at = $2 WHERE id = $3`,
    [access_token, expiresAt, socialAccountId]
  );
  return access_token;
}

/**
 * Post a video as an Instagram Reel
 */
async function post(videoPath, caption, credentials) {
  try {
    const igUserId = credentials.platform_user_id;
    if (!igUserId) {
      throw new Error('No Instagram user ID. Reconnect your Instagram account.');
    }

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      throw new Error('BACKEND_URL env var not set — needed to serve video to Instagram.');
    }

    // Refresh token if expiring within 7 days
    let token = credentials.access_token;
    const expiresAt = new Date(credentials.expires_at);
    if (expiresAt - Date.now() < 7 * 24 * 60 * 60 * 1000) {
      console.log('[Instagram] Token expiring soon, refreshing...');
      token = await refreshAccessToken(credentials.id, token);
    }

    const filename = path.basename(videoPath);
    const videoUrl = `${backendUrl}/uploads/${filename}`;
    console.log('[Instagram] Posting Reel from URL:', videoUrl);

    // Step 1: Create Reels container
    const containerRes = await axios.post(
      `${GRAPH_BASE}/${igUserId}/media`,
      null,
      {
        params: {
          media_type: 'REELS',
          video_url: videoUrl,
          caption,
          share_to_feed: true,
          access_token: token,
        },
      }
    );
    const creationId = containerRes.data.id;
    console.log('[Instagram] Container created:', creationId);

    // Step 2: Poll until processing done (up to 5 mins)
    let statusCode = 'IN_PROGRESS';
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await axios.get(`${GRAPH_BASE}/${creationId}`, {
        params: { fields: 'status_code', access_token: token },
      });
      statusCode = statusRes.data.status_code;
      console.log(`[Instagram] Container status (attempt ${i + 1}):`, statusCode);
      if (statusCode !== 'IN_PROGRESS') break;
    }

    if (statusCode !== 'FINISHED') {
      throw new Error(`Instagram video processing failed with status: ${statusCode}`);
    }

    // Step 3: Publish
    const publishRes = await axios.post(
      `${GRAPH_BASE}/${igUserId}/media_publish`,
      null,
      { params: { creation_id: creationId, access_token: token } }
    );

    return { success: true, externalPostId: publishRes.data.id, error: null };
  } catch (err) {
    const body = err.response?.data;
    console.error('[Instagram] Post failed:', err.message, body ? JSON.stringify(body) : '');
    return { success: false, externalPostId: null, error: err.message };
  }
}

module.exports = { post, exchangeCodeForTokens, getUserProfile };
