// backend/src/routes/accounts.js
const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const authMiddleware = require('../middleware/auth');
const { getPlatform } = require('../platforms');

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

const router = express.Router();
router.use(authMiddleware);

// GET /accounts - list connected accounts
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, platform, platform_username, platform_user_id, created_at, expires_at
     FROM social_accounts WHERE user_id = $1`,
    [req.user.id]
  );
  res.json({ accounts: rows });
});

// GET /accounts/tiktok/oauth-url - get TikTok OAuth URL
router.get('/tiktok/oauth-url', async (req, res) => {
  // In mock mode, return a mock URL
  if (!process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY === 'mock') {
    return res.json({
      url: null,
      mock: true,
      message: 'TikTok credentials not configured. Using mock mode.',
    });
  }

  const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/oauth/tiktok/callback`;
  const scopes = ['user.info.basic', 'video.publish', 'video.upload'].join(',');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = Buffer.from(JSON.stringify({ userId: req.user.id, codeVerifier })).toString('base64');

  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  res.json({ url });
});

// POST /accounts/tiktok/callback - handle OAuth callback
router.post('/tiktok/callback', async (req, res) => {
  const { code } = req.body;

  // Mock mode - create a fake connected account
  if (!process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY === 'mock') {
    await query(
      `INSERT INTO social_accounts (user_id, platform, platform_user_id, platform_username, access_token, refresh_token, expires_at)
       VALUES ($1, 'tiktok', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, platform) DO UPDATE SET
         platform_user_id = EXCLUDED.platform_user_id,
         platform_username = EXCLUDED.platform_username,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at`,
      [
        req.user.id,
        'mock_user_123',
        '@mock_tiktok_user',
        'mock_access_token',
        'mock_refresh_token',
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ]
    );

    return res.json({ success: true, platform: 'tiktok', username: '@mock_tiktok_user' });
  }

  // Real OAuth flow
  const { state } = req.body;
  let codeVerifier;
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64').toString());
    codeVerifier = parsed.codeVerifier;
  } catch {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  const tiktok = getPlatform('tiktok');
  const redirectUri = `${process.env.FRONTEND_URL}/oauth/tiktok/callback`;
  const tokenData = await tiktok.exchangeCodeForTokens(code, redirectUri, codeVerifier);

  const profile = await tiktok.getUserProfile(tokenData.access_token);

  await query(
    `INSERT INTO social_accounts (user_id, platform, platform_user_id, platform_username, access_token, refresh_token, expires_at)
     VALUES ($1, 'tiktok', $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, platform) DO UPDATE SET
       platform_user_id = EXCLUDED.platform_user_id,
       platform_username = EXCLUDED.platform_username,
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at`,
    [
      req.user.id,
      profile.open_id,
      profile.display_name,
      tokenData.access_token,
      tokenData.refresh_token,
      new Date(Date.now() + (tokenData.expires_in || 86400) * 1000),
    ]
  );

  res.json({ success: true, platform: 'tiktok', username: profile.display_name });
});

// GET /accounts/instagram/oauth-url
router.get('/instagram/oauth-url', async (req, res) => {
  if (!process.env.INSTAGRAM_APP_ID) {
    return res.json({ url: null, mock: true, message: 'Instagram not configured.' });
  }
  const redirectUri = `${process.env.FRONTEND_URL}/oauth/instagram/callback`;
  const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64');
  const scopes = ['instagram_business_basic', 'instagram_business_content_publish'].join(',');
  const url = `https://www.instagram.com/oauth/authorize?client_id=${process.env.INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${state}`;
  res.json({ url });
});

// POST /accounts/instagram/callback
router.post('/instagram/callback', async (req, res) => {
  const { code, state } = req.body;
  try {
    JSON.parse(Buffer.from(state, 'base64').toString());
  } catch {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  const instagram = getPlatform('instagram');
  const redirectUri = `${process.env.FRONTEND_URL}/oauth/instagram/callback`;
  const tokenData = await instagram.exchangeCodeForTokens(code, redirectUri);
  const profile = await instagram.getUserProfile(tokenData.access_token);

  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 60 * 24 * 60 * 60) * 1000);

  await query(
    `INSERT INTO social_accounts (user_id, platform, platform_user_id, platform_username, access_token, expires_at)
     VALUES ($1, 'instagram', $2, $3, $4, $5)
     ON CONFLICT (user_id, platform) DO UPDATE SET
       platform_user_id = EXCLUDED.platform_user_id,
       platform_username = EXCLUDED.platform_username,
       access_token = EXCLUDED.access_token,
       expires_at = EXCLUDED.expires_at`,
    [req.user.id, profile.ig_user_id, profile.username, tokenData.access_token, expiresAt]
  );

  res.json({ success: true, platform: 'instagram', username: profile.username });
});

// DELETE /accounts/:platform - disconnect account
router.delete('/:platform', async (req, res) => {
  const { platform } = req.params;
  await query('DELETE FROM social_accounts WHERE user_id = $1 AND platform = $2', [
    req.user.id,
    platform,
  ]);
  res.json({ success: true });
});

module.exports = router;
