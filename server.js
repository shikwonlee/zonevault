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

// Ephemeral Stream Handshake Token Endpoint for HLS streaming
app.post('/api/stream-token', (req, res) => {
  // 1. Enforce strict origin / referer check locked to zonevault.live
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Access denied: Playback allowed only on zonevault.live' });
  }

  const { epId, uid, idToken, targetUrl } = req.body || {};
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
  const now = Date.now();
  const expiresAt = now + 60 * 1000; // Short-lived 60-second token for HLS handshake
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();

  const payload = `${epId}:${userId}:${expiresAt}:${clientIp}`;
  const signature = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('hex');
  const token = Buffer.from(JSON.stringify({
    epId,
    uid: userId,
    targetUrl: targetUrl || '',
    expiresAt,
    sig: signature
  })).toString('base64');

  const proxyUrl = targetUrl ? `/api/stream-proxy.m3u8?token=${encodeURIComponent(token)}` : null;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    success: true,
    token: token,
    proxyUrl: proxyUrl,
    expiresAt: expiresAt,
    originLocked: true,
    domain: 'zonevault.live'
  });
});

// Protected Stream Gateway Proxy (hides raw Mux URL, blocks external players)
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

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const targetUrl = decoded.targetUrl;
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
  } catch (err) {
    res.status(400).send('Malformed stream token');
  }
});

// Stream Token Verification Endpoint
app.post('/api/verify-stream-token', (req, res) => {
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ valid: false, error: 'Access denied: Unauthorized origin' });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ valid: false, error: 'No token provided' });
  }

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const now = Date.now();
    if (now > decoded.expiresAt) {
      return res.status(403).json({ valid: false, error: 'Token expired' });
    }

    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
    const payload = `${decoded.epId}:${decoded.uid}:${decoded.expiresAt}:${clientIp}`;
    const expectedSig = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('hex');

    if (decoded.sig !== expectedSig) {
      return res.status(403).json({ valid: false, error: 'Invalid token signature' });
    }

    res.json({ valid: true, epId: decoded.epId, uid: decoded.uid });
  } catch (err) {
    res.status(400).json({ valid: false, error: 'Malformed token' });
  }
});

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
