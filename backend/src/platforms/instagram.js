// backend/src/platforms/instagram.js
const axios = require('axios');
const path = require('path');
const { query } = require('../db');

const GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * Exchange OAuth code for a long-lived access token
 */
async function exchangeCodeForTokens(code, redirectUri) {
  // Step 1: short-lived token
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const shortRes = await axios.post(
    `${GRAPH_API}/oauth/access_token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  console.log('[Instagram] short-lived token response:', JSON.stringify(shortRes.data));

  // Step 2: exchange for long-lived token (60 days)
  const longRes = await axios.get(`${GRAPH_API}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.INSTAGRAM_APP_ID,
      client_secret: process.env.INSTAGRAM_APP_SECRET,
      fb_exchange_token: shortRes.data.access_token,
    },
  });
  console.log('[Instagram] long-lived token response:', JSON.stringify(longRes.data));
  return longRes.data; // { access_token, token_type, expires_in }
}

/**
 * Get Instagram Business Account ID and username from a Meta user token
 */
async function getUserProfile(accessToken) {
  try {
    // Get Facebook pages the user manages
    const pagesRes = await axios.get(`${GRAPH_API}/me/accounts`, {
      params: { access_token: accessToken },
    });
    const pages = pagesRes.data.data || [];

    for (const page of pages) {
      const pageRes = await axios.get(`${GRAPH_API}/${page.id}`, {
        params: {
          fields: 'instagram_business_account',
          access_token: page.access_token || accessToken,
        },
      });
      const igAccount = pageRes.data.instagram_business_account;
      if (igAccount) {
        const profileRes = await axios.get(`${GRAPH_API}/${igAccount.id}`, {
          params: { fields: 'username', access_token: accessToken },
        });
        return {
          ig_user_id: igAccount.id,
          username: `@${profileRes.data.username}`,
        };
      }
    }

    console.warn('[Instagram] No Instagram Business Account found on any page');
    return { ig_user_id: null, username: '@instagram_user' };
  } catch (err) {
    console.warn('[Instagram] Could not fetch profile:', err.message, err.response?.data);
    return { ig_user_id: null, username: '@instagram_user' };
  }
}

/**
 * Refresh a long-lived token before it expires
 */
async function refreshAccessToken(socialAccountId, accessToken) {
  const res = await axios.get(`${GRAPH_API}/oauth/access_token`, {
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
    const accessToken = credentials.access_token;
    const igUserId = credentials.platform_user_id;

    if (!igUserId) {
      throw new Error('No Instagram user ID. Reconnect your Instagram account.');
    }

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      throw new Error('BACKEND_URL env var not set — needed to serve video to Instagram.');
    }

    // Refresh token if expiring within 7 days
    const expiresAt = new Date(credentials.expires_at);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    let token = accessToken;
    if (expiresAt - Date.now() < sevenDays) {
      console.log('[Instagram] Token expiring soon, refreshing...');
      token = await refreshAccessToken(credentials.id, accessToken);
    }

    const filename = path.basename(videoPath);
    const videoUrl = `${backendUrl}/uploads/${filename}`;
    console.log('[Instagram] Posting Reel from URL:', videoUrl);

    // Step 1: Create Reels container
    const containerRes = await axios.post(`${GRAPH_API}/${igUserId}/media`, null, {
      params: {
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        share_to_feed: true,
        access_token: token,
      },
    });
    const creationId = containerRes.data.id;
    console.log('[Instagram] Container created:', creationId);

    // Step 2: Poll until processing is done (up to 5 mins)
    let statusCode = 'IN_PROGRESS';
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await axios.get(`${GRAPH_API}/${creationId}`, {
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
    const publishRes = await axios.post(`${GRAPH_API}/${igUserId}/media_publish`, null, {
      params: { creation_id: creationId, access_token: token },
    });

    return {
      success: true,
      externalPostId: publishRes.data.id,
      error: null,
    };
  } catch (err) {
    const body = err.response?.data;
    console.error('[Instagram] Post failed:', err.message, body ? JSON.stringify(body) : '');
    return {
      success: false,
      externalPostId: null,
      error: err.message,
    };
  }
}

module.exports = { post, exchangeCodeForTokens, getUserProfile };
