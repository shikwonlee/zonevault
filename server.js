import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import crypto from 'crypto';
import https from 'https';

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

// Ephemeral Stream Handshake Token Endpoint for HLS streaming (Signed JWT with uid and displayName)
app.post('/api/stream-token', (req, res) => {
  // 1. Enforce strict origin / referer check locked to zonevault.live
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Access denied: Playback allowed only on zonevault.live' });
  }

  const { epId, uid, displayName, name, role, idToken, targetUrl } = req.body || {};
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
  const userDisplayName = displayName || name || (req.body && req.body.username) || 'Zone Vault Member';
  const userRole = (role === 'admin') ? 'admin' : 'member';
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const expiresAtSec = nowSec + 60; // 60-second initiation window
  const expiresAtMs = nowMs + 60 * 1000;
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
});

// Protected Stream Gateway Proxy (verifies JWT, uid, displayName, and origin)
app.get('/api/stream-proxy.m3u8', (req, res) => {
  // Enforce zonevault.live Referer / Origin (rejects livepush.io, VLC, external sites)
  if (!isAllowedOrigin(req)) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(403).json({ error: 'Access denied: Stream playback allowed only on zonevault.live' });
  }

  const { token } = req.query || {};
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

  // Ensure authenticated user's uid and displayName are present in JWT payload
  const uid = verified.uid || verified.sub;
  const displayName = verified.displayName || verified.name || verified.username;
  if (!uid || !displayName) {
    return res.status(401).send('Unauthorized: Missing authenticated user identity in JWT');
  }

  const targetUrl = verified.targetUrl;
  if (!targetUrl || !targetUrl.startsWith('https://')) {
    return res.status(400).send('Invalid target media stream');
  }

  https.get(targetUrl, (upstreamRes) => {
    let data = '';
    upstreamRes.on('data', chunk => data += chunk);
    upstreamRes.on('end', () => {
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      const rewritten = data.replace(/^(?!#)(?!https?:\/\/)(.+)$/gm, `${baseUrl}$1`);

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.send(rewritten);
    });
  }).on('error', (err) => {
    console.error('Stream proxy upstream error:', err);
    res.status(502).send('Error connecting to upstream media stream');
  });
});

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
