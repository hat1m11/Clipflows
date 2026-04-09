// backend/src/platforms/tiktok.js
/**
 * TikTok Platform Adapter
 * Implements the standard platform interface:
 *   post(video, caption, credentials) -> { success, externalPostId, error }
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { query } = require('../db');

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

/**
 * Refresh TikTok access token using refresh token
 */
async function refreshAccessToken(socialAccountId, refreshToken) {
  try {
    const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Update tokens in DB
    await query(
      `UPDATE social_accounts 
       SET access_token = $1, refresh_token = $2, expires_at = $3 
       WHERE id = $4`,
      [access_token, refresh_token, expiresAt, socialAccountId]
    );

    return access_token;
  } catch (err) {
    console.error('Failed to refresh TikTok token:', err.message);
    throw new Error('Token refresh failed');
  }
}

/**
 * Get a valid access token, refreshing if needed
 */
async function getValidToken(socialAccount) {
  const now = new Date();
  const expiresAt = new Date(socialAccount.expires_at);
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt - now < fiveMinutes) {
    console.log('TikTok token expiring soon, refreshing...');
    return await refreshAccessToken(socialAccount.id, socialAccount.refresh_token);
  }

  return socialAccount.access_token;
}

/**
 * Initiate TikTok video upload - gets upload URL
 */
async function initiateUpload(accessToken, videoPath) {
  const stats = fs.statSync(videoPath);
  const fileSize = stats.size;

  const response = await axios.post(
    `${TIKTOK_API_BASE}/post/publish/video/init/`,
    {
      post_info: {
        title: ' ', // Will be updated
        privacy_level: 'SELF_ONLY', // Safe default, user can change on TikTok
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileSize,
        chunk_size: fileSize,
        total_chunk_count: 1,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    }
  );

  return response.data.data;
}

/**
 * Upload video chunk to TikTok
 */
async function uploadVideoChunk(uploadUrl, videoPath) {
  const fileBuffer = fs.readFileSync(videoPath);
  const fileSize = fileBuffer.length;

  await axios.put(uploadUrl, fileBuffer, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
      'Content-Length': fileSize,
    },
  });
}

/**
 * Main post function - implements platform interface
 * @param {string} videoPath - Local path to video file
 * @param {string} caption - Post caption
 * @param {object} credentials - { access_token, refresh_token, expires_at, id }
 * @returns {object} { success, externalPostId, error }
 */
async function post(videoPath, caption, credentials) {
  try {
    // In MOCK mode (no TikTok credentials configured), simulate a successful post
    if (!process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY === 'mock') {
      console.log('[TikTok MOCK] Simulating post:', { videoPath, caption: caption?.substring(0, 50) });
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate API delay
      return {
        success: true,
        externalPostId: `mock_tiktok_${Date.now()}`,
        error: null,
      };
    }

    const accessToken = await getValidToken(credentials);

    // Step 1: Initiate upload
    const uploadData = await initiateUpload(accessToken, videoPath);
    const { publish_id, upload_url } = uploadData;

    // Step 2: Upload video
    await uploadVideoChunk(upload_url, videoPath);

    // Step 3: The video is now published (TikTok processes async)
    // We can optionally poll for status using publish_id

    return {
      success: true,
      externalPostId: publish_id,
      error: null,
    };
  } catch (err) {
    console.error('[TikTok] Post failed:', err.message);
    return {
      success: false,
      externalPostId: null,
      error: err.message,
    };
  }
}

/**
 * Exchange OAuth code for tokens
 */
async function exchangeCodeForTokens(code, redirectUri, codeVerifier) {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  console.log('[TikTok] token exchange response:', JSON.stringify(response.data));
  const data = response.data;
  if (data.error && data.error !== 'ok') {
    throw new Error(`TikTok token exchange failed: ${data.error} - ${data.error_description || ''}`);
  }
  // Unwrap nested data if present
  return data.data || data;
}

/**
 * Get TikTok user profile
 */
async function getUserProfile(accessToken) {
  try {
    const response = await axios.get(`${TIKTOK_API_BASE}/user/info/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { fields: 'open_id,union_id,avatar_url,display_name' },
    });
    return response.data.data.user;
  } catch (err) {
    console.warn('Could not fetch TikTok profile, using fallback:', err.message);
    return { open_id: 'unknown', display_name: '@tiktok_user' };
  }
}

module.exports = { post, exchangeCodeForTokens, getUserProfile, getValidToken };
