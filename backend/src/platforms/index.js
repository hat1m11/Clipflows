// backend/src/platforms/index.js
/**
 * Platform Registry
 * 
 * To add a new platform:
 * 1. Create platforms/instagram.js implementing { post, exchangeCodeForTokens, getUserProfile }
 * 2. Add it here
 */

const tiktok = require('./tiktok');
// const instagram = require('./instagram');  // Future
// const twitter = require('./twitter');       // Future
// const linkedin = require('./linkedin');     // Future

const platforms = {
  tiktok,
  // instagram,
  // twitter,
  // linkedin,
};

/**
 * Get platform adapter by name
 * @param {string} platformName
 * @returns platform adapter with { post, exchangeCodeForTokens, getUserProfile }
 */
function getPlatform(platformName) {
  const platform = platforms[platformName];
  if (!platform) {
    throw new Error(`Platform "${platformName}" is not supported`);
  }
  return platform;
}

function getSupportedPlatforms() {
  return Object.keys(platforms);
}

module.exports = { getPlatform, getSupportedPlatforms, platforms };
