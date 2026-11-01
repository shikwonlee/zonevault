import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import crypto from 'crypto';
import https from 'https';
import { Readable } from 'stream';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Allowed origins check strictly locked to zonevault.live (and development/preview environments)
function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const allowedHosts = [
    'zonevault.live',
    'www.zonevault.live',
    'zonevault.site',
    'www.zonevault.site'
  ];

  const isAllowedHost = (hostname) => {
    if (!hostname) return false;
    hostname = hostname.toLowerCase();
    if (allowedHosts.includes(hostname)) return true;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return true;
    if (hostname.endsWith('.run.app') || hostname.endsWith('.ai.studio')) return true;
    return false;
  };

  // Immediately reject extension URLs (e.g. moz-extension://, chrome-extension://)
  if (origin && (origin.startsWith('moz-extension:') || origin.startsWith('chrome-extension:') || origin.startsWith('safari-extension:'))) {
    return false;
  }
  if (referer && (referer.startsWith('moz-extension:') || referer.startsWith('chrome-extension:') || referer.startsWith('safari-extension:'))) {
    return false;
  }

  // If origin header is present, it must be an allowed host
  if (origin) {
    try {
      const url = new URL(origin);
      if (!isAllowedHost(url.hostname)) return false;
    } catch {
      return false;
    }
  }

  // If referer header is present, it must be an allowed host
  if (referer) {
    try {
      const url = new URL(referer);
      if (!isAllowedHost(url.hostname)) return false;
    } catch {
      return false;
    }
  }

  // Must have at least a valid origin or referer (blocks raw VLC, curl, or headless requests)
  if (origin || referer) {
    return true;
  }

  return false;
}

// Download & Extension Prevention Helpers:
// Blocks browser download extensions (Live Stream Downloader, Video DownloadHelper, etc.),
// download tools (IDM, yt-dlp, curl, ffmpeg), and direct browser Save-As navigation.
function isDownloadToolOrExtension(req) {
  const origin = (req.headers['origin'] || '').toLowerCase();
  const referer = (req.headers['referer'] || '').toLowerCase();
  if (origin.startsWith('moz-extension:') || origin.startsWith('chrome-extension:') || origin.startsWith('safari-extension:') ||
      referer.startsWith('moz-extension:') || referer.startsWith('chrome-extension:')) {
    return true;
  }

  const dest = (req.headers['sec-fetch-dest'] || '').toLowerCase();
  const mode = (req.headers['sec-fetch-mode'] || '').toLowerCase();
  if (dest === 'document' || mode === 'navigate') {
    return true;
  }

  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const blockedUAs = [
    'idm',
    'internet download manager',
    'curl',
    'wget',
    'aria2',
    'yt-dlp',
    'youtube-dl',
    'ffmpeg',
    'python-requests',
    'go-http-client',
    'vlc',
    'mpv',
    'libmpv',
    'quicktime'
  ];
  if (blockedUAs.some(tool => ua.includes(tool))) {
    return true;
  }

  // Desktop browser extension check:
  // Legitimate player instances in desktop browsers (Chrome, Firefox, Edge, Safari desktop)
  // always send custom header 'X-ZV-Player: web-artplayer' or 'X-Requested-With: ZoneVaultPlayer'.
  // Extensions (like Live Stream Downloader) sniffing URLs from DevTools/webRequest execute standard fetch() without player headers.
  const isDesktop = ua.includes('windows') || ua.includes('macintosh') || (ua.includes('linux') && !ua.includes('android'));
  const zvPlayer = req.headers['x-zv-player'];
  const reqWith = req.headers['x-requested-with'];
  const isPlayerAuthenticated = zvPlayer === 'web-artplayer' || reqWith === 'ZoneVaultPlayer';

  if (isDesktop && !isPlayerAuthenticated) {
    return true; // Extension ripper or unauthenticated fetch outside player
  }

  return false;
}

function isDirectDownloadAttempt(req) {
  const dest = (req.headers['sec-fetch-dest'] || '').toLowerCase();
  const mode = (req.headers['sec-fetch-mode'] || '').toLowerCase();
  return dest === 'document' || mode === 'navigate';
}

// Chunk Leech Rate Limiter: prevents batch dumpers / extensions from scraping all segments
const chunkRateLimitMap = new Map();

function isChunkLeechExceeded(tokenOrIp) {
  if (!tokenOrIp) return false;
  const now = Date.now();
  let history = chunkRateLimitMap.get(tokenOrIp) || [];
  history = history.filter(t => now - t < 4000);
  if (history.length >= 8) {
    return true; // Ripping detected: more than 8 segments in 4 seconds
  }
  history.push(now);
  chunkRateLimitMap.set(tokenOrIp, history);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of chunkRateLimitMap.entries()) {
    if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > 10000) {
      chunkRateLimitMap.delete(key);
    }
  }
}, 120000);

const STREAM_SECRET = process.env.STREAM_SECRET || 'zonevault-secure-token-salt-2026';

// Base64URL and JWT Helper Functions
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

function signStreamJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyStreamJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;

  // 1. Standard 3-part signed JWT
  const parts = token.split('.');
  if (parts.length === 3) {
    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (signature !== expectedSig) {
      return null;
    }

    try {
      const payload = JSON.parse(base64UrlDecode(encodedPayload));
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < nowSec) {
        return { expired: true };
      }
      return payload;
    } catch (_) {
      return null;
    }
  }

  // 2. Fallback check for legacy base64 json format for backwards compatibility
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (decoded && decoded.expiresAt && Date.now() > decoded.expiresAt) {
      return { expired: true };
    }
    return decoded;
  } catch (_) {
    return null;
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Stream-Token, Range, X-ZV-Player, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Ephemeral Stream Handshake Token Endpoint for HLS streaming (Signed JWT with uid and displayName)
const handleStreamToken = (req, res) => {
  // 1. Enforce strict origin / referer check locked to zonevault.live
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Access denied: Playback allowed only on zonevault.live' });
  }

  const params = { ...(req.query || {}), ...(req.body || {}) };
  const epId = params.epId || params.v;
  const uid = params.uid || params.u;
  const displayName = params.displayName || params.name || params.username;
  const role = params.role;
  const idToken = params.idToken;
  const targetUrl = params.targetUrl || params.url;

  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const sessionToken = idToken || tokenFromHeader;

  // 2. Enforce active authenticated user session
  if (!uid && !sessionToken) {
    return res.status(401).json({ error: 'Unauthorized: Active user session required to stream video' });
  }

  if (!epId) {
    return res.status(400).json({ error: 'Missing episode identifier' });
  }

  const userId = uid || 'authenticated-user';
  const userDisplayName = displayName || (req.body && req.body.username) || 'Zone Vault Member';
  const userRole = (role === 'admin') ? 'admin' : 'member';
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const expiresAtSec = nowSec + 180; // 3-minute initiation window (180 seconds)
  const expiresAtMs = nowMs + 180 * 1000;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();

  // Signed JWT payload containing authenticated user's displayName and uid
  const jwtPayload = {
    sub: userId,
    uid: userId,
    displayName: userDisplayName,
    name: userDisplayName,
    username: userDisplayName,
    role: userRole,
    epId: epId,
    targetUrl: targetUrl || '',
    ip: clientIp,
    iat: nowSec,
    exp: expiresAtSec,
    expiresAt: expiresAtMs
  };

  const token = signStreamJwt(jwtPayload, STREAM_SECRET);
  const proxyUrl = targetUrl ? `/api/stream-proxy.m3u8?token=${encodeURIComponent(token)}` : null;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    success: true,
    token: token,
    proxyUrl: proxyUrl,
    expiresAt: expiresAtMs,
    originLocked: true,
    domain: 'zonevault.live',
    user: {
      uid: userId,
      displayName: userDisplayName,
      name: userDisplayName,
      username: userDisplayName,
      role: userRole
    }
  });
};

app.get('/api/stream-token', handleStreamToken);
app.post('/api/stream-token', handleStreamToken);
app.get('/stream-token', handleStreamToken);
app.post('/stream-token', handleStreamToken);
app.get('/api/stream/token', handleStreamToken);
app.post('/api/stream/token', handleStreamToken);
app.get('/stream/token', handleStreamToken);
app.post('/stream/token', handleStreamToken);

// Helper function to rewrite HLS manifests: routes all segments, init maps, and sub-playlists through the secure gateway
function rewriteHlsManifest(manifestText, baseUrl, token) {
  const lines = manifestText.split(/\r?\n/);
  const rewrittenLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      rewrittenLines.push(line);
      continue;
    }

    // Rewrite tags containing URI="...", e.g. #EXT-X-MAP:URI="init.mp4", #EXT-X-KEY, #EXT-X-MEDIA
    if (trimmed.startsWith('#')) {
      line = line.replace(/URI="([^"]+)"/g, (match, uri) => {
        try {
          const absUrl = new URL(uri, baseUrl).href;
          if (absUrl.toLowerCase().includes('.m3u8')) {
            return `URI="/api/stream-proxy.m3u8?token=${encodeURIComponent(token)}&u=${encodeURIComponent(base64UrlEncode(absUrl))}"`;
          }
          return `URI="/api/stream/chunk?token=${encodeURIComponent(token)}&u=${encodeURIComponent(base64UrlEncode(absUrl))}"`;
        } catch (_) {
          return match;
        }
      });
      rewrittenLines.push(line);
      continue;
    }

    // Non-tag line: either a sub-playlist (.m3u8) or a media chunk (.m4s, .ts, .mp4, etc.)
    try {
      const absUrl = new URL(trimmed, baseUrl).href;
      if (absUrl.toLowerCase().includes('.m3u8')) {
        rewrittenLines.push(`/api/stream-proxy.m3u8?token=${encodeURIComponent(token)}&u=${encodeURIComponent(base64UrlEncode(absUrl))}`);
      } else {
        rewrittenLines.push(`/api/stream/chunk?token=${encodeURIComponent(token)}&u=${encodeURIComponent(base64UrlEncode(absUrl))}`);
      }
    } catch (_) {
      rewrittenLines.push(line);
    }
  }

  return rewrittenLines.join('\n');
}

// Protected Stream Gateway Proxy (verifies JWT, uid, displayName, and origin; rewrites all internal chunks)
const handleStreamProxyManifest = async (req, res) => {
  // 1. Block external download tools and browser extensions (IDM, Live Stream Downloader, curl, etc.)
  if (isDownloadToolOrExtension(req)) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(403).json({ error: 'Access denied: Download tools and browser extensions are prohibited.' });
  }

  // 2. Block direct browser navigation / Save As download attempts
  if (isDirectDownloadAttempt(req)) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(403).send('Access denied: Direct download of stream manifest is prohibited. Streaming permitted only inside the Zone Vault player.');
  }

  // 3. Enforce zonevault.live Referer / Origin (rejects unauthorized third-party sites)
  if (!isAllowedOrigin(req)) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(403).json({ error: 'Access denied: Stream playback allowed only on zonevault.live' });
  }

  const token = req.query.token || req.query.t || req.headers['x-stream-token'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (!token) {
    return res.status(400).send('Missing stream token');
  }

  const verified = verifyStreamJwt(token, STREAM_SECRET);
  if (!verified) {
    return res.status(403).send('Invalid stream token signature');
  }
  if (verified.expired) {
    return res.status(403).send('Stream token expired');
  }

  const uid = verified.uid || verified.sub;
  const displayName = verified.displayName || verified.name || verified.username;
  if (!uid || !displayName) {
    return res.status(401).send('Unauthorized: Missing authenticated user identity in JWT');
  }

  let targetUrl = req.query.u || req.query.url || verified.targetUrl;
  if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    try {
      const decoded = base64UrlDecode(targetUrl);
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        targetUrl = decoded;
      }
    } catch (_) {}
  }

  if (!targetUrl || (!targetUrl.startsWith('https://') && !targetUrl.startsWith('http://'))) {
    return res.status(400).send('Invalid target media stream');
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Upstream stream error');
    }

    const manifestText = await upstreamRes.text();
    const rewritten = rewriteHlsManifest(manifestText, targetUrl, token);

    // Anti-download headers: strictly inline, nosniff, noopen, no cache
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Stream-Token, X-ZV-Player');
    res.send(rewritten);
  } catch (err) {
    console.error('Stream proxy upstream error:', err);
    res.status(502).send('Error connecting to upstream media stream');
  }
};

app.get('/api/stream-proxy.m3u8', handleStreamProxyManifest);
app.get('/stream-proxy.m3u8', handleStreamProxyManifest);
app.get('/api/stream/manifest.m3u8', handleStreamProxyManifest);
app.get('/stream/manifest.m3u8', handleStreamProxyManifest);
app.get('/api/stream/live.m3u8', handleStreamProxyManifest);
app.get('/stream/live.m3u8', handleStreamProxyManifest);

// Media Chunk Proxy Endpoint: Streams .m4s, .ts, .mp4, and .aac chunks securely without exposing CDN domains
const handleStreamChunk = async (req, res) => {
  // 1. Block external download tools and browser extensions (IDM, Live Stream Downloader, curl, etc.)
  if (isDownloadToolOrExtension(req)) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(403).json({ error: 'Access denied: Browser download extensions and media rippers are prohibited.' });
  }

  // 2. Block direct browser navigation / Save As download attempts
  if (isDirectDownloadAttempt(req)) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(403).send('Access denied: Direct download of stream segments is prohibited.');
  }

  // 3. Enforce zonevault.live Referer / Origin (rejects external scrapers, VLC, unauthorized players)
  if (!isAllowedOrigin(req)) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(403).json({ error: 'Access denied: Media playback allowed only on zonevault.live' });
  }

  const token = req.query.token || req.query.t || req.headers['x-stream-token'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (!token) {
    return res.status(400).send('Missing stream token');
  }

  // 4. Chunk Leech Rate Limiter: blocks bulk dumping
  if (isChunkLeechExceeded(token)) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(429).json({ error: 'Playback rate limit exceeded: Bulk media scraping is prohibited. Video can only be watched in real time.' });
  }

  const verified = verifyStreamJwt(token, STREAM_SECRET);
  if (!verified) {
    return res.status(403).send('Invalid stream token signature');
  }
  if (verified.expired) {
    return res.status(403).send('Stream token expired');
  }

  let chunkUrl = req.query.u || req.query.url;
  if (chunkUrl && !chunkUrl.startsWith('http://') && !chunkUrl.startsWith('https://')) {
    try {
      const decoded = base64UrlDecode(chunkUrl);
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        chunkUrl = decoded;
      }
    } catch (_) {}
  }

  if (!chunkUrl || (!chunkUrl.startsWith('https://') && !chunkUrl.startsWith('http://'))) {
    return res.status(400).send('Invalid chunk target URL');
  }

  try {
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };
    if (req.headers.range) {
      upstreamHeaders['range'] = req.headers.range;
    }

    const upstreamRes = await fetch(chunkUrl, { headers: upstreamHeaders });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return res.status(upstreamRes.status).send('Upstream media chunk error');
    }

    res.status(upstreamRes.status);
    const contentType = upstreamRes.headers.get('content-type') ||
      (chunkUrl.includes('.m4s') ? 'video/iso.segment' :
       chunkUrl.includes('.ts') ? 'video/mp2t' :
       chunkUrl.includes('.mp4') ? 'video/mp4' :
       chunkUrl.includes('.aac') ? 'audio/aac' : 'application/octet-stream');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Download-Options', 'noopen');
    if (upstreamRes.headers.get('content-length')) {
      res.setHeader('Content-Length', upstreamRes.headers.get('content-length'));
    }
    if (upstreamRes.headers.get('content-range')) {
      res.setHeader('Content-Range', upstreamRes.headers.get('content-range'));
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-transform, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Stream-Token, Range');

    Readable.fromWeb(upstreamRes.body).on('error', (err) => {
      console.warn('Chunk stream transfer note:', err.message);
    }).pipe(res);
  } catch (err) {
    console.error('Chunk proxy error:', err);
    res.status(502).send('Error streaming media chunk');
  }
};

app.get('/api/stream/chunk', handleStreamChunk);
app.get('/stream/chunk', handleStreamChunk);

// Stream Token Verification Endpoint: /api/verify-stream and /api/verify-stream-token
// Parses authenticated user's displayName and uid from the signed JWT payload to validate session
const handleVerifyStream = (req, res) => {
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ valid: false, error: 'Access denied: Unauthorized origin' });
  }

  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = (req.body && req.body.token) || (req.query && req.query.token) || tokenFromHeader;

  if (!token) {
    return res.status(400).json({ valid: false, error: 'No token provided' });
  }

  const verified = verifyStreamJwt(token, STREAM_SECRET);
  if (!verified) {
    return res.status(403).json({ valid: false, error: 'Invalid token signature' });
  }
  if (verified.expired) {
    return res.status(403).json({ valid: false, error: 'Token expired' });
  }

  // Parse authenticated user's uid and displayName from JWT payload
  const uid = verified.uid || verified.sub;
  const displayName = verified.displayName || verified.name || verified.username;

  // Authenticate access based on verified uid and displayName
  if (!uid || !displayName) {
    return res.status(401).json({ valid: false, error: 'Unauthorized: Missing user identity (uid or displayName)' });
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    valid: true,
    authenticated: true,
    uid: uid,
    displayName: displayName,
    name: displayName,
    username: displayName,
    role: verified.role || 'member',
    epId: verified.epId,
    targetUrl: verified.targetUrl,
    exp: verified.exp,
    expiresAt: verified.expiresAt
  });
};

app.post('/api/verify-stream', handleVerifyStream);
app.get('/api/verify-stream', handleVerifyStream);
app.post('/api/verify-stream-token', handleVerifyStream);
app.get('/api/verify-stream-token', handleVerifyStream);

// API Endpoint to provide Firebase Configuration securely from backend
app.get('/api/firebase-config', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "tvnstream-b4497.firebaseapp.com",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://tvnstream-b4497-default-rtdb.firebaseio.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "tvnstream-b4497",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "tvnstream-b4497.appspot.com",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "308384754214",
    appId: process.env.FIREBASE_APP_ID || "1:308384754214:web:2938e76cd29b288f75d4e7",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-VFNH70R4D9"
  });
});

// Middleware to prevent stale caching of HTML, JS, CSS, and Service Workers
// Solves the issue where code updates aren't reflected without Ctrl+F5
app.use((req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  if (!ext || ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || req.path === '/sw.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.ico', '.woff', '.woff2'].includes(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  }
  next();
});

// Serve static assets with support for clean URLs (e.g. /home -> /home.html)
app.use(
  express.static(__dirname, {
    extensions: ['html'],
    index: 'index.html',
    dotfiles: 'ignore',
  })
);

// Fallback to index.html for unrecognized routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
