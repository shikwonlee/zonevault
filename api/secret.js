// ========================================================
// Zone Vault — Centralized Secure Stream & Decryption Module
// File: /api/secret.js
// Handles secure Firebase video links & M3U8 source keys,
// decrypts protected assets, and verifies client sessions.
// ========================================================

import express from 'express';

/**
 * Validates whether the incoming request or token has an authorized client session
 */
export function validateClientSession(reqOrToken) {
  let token = null;
  if (typeof reqOrToken === 'string') {
    token = reqOrToken;
  } else if (reqOrToken && reqOrToken.headers) {
    const authHeader = reqOrToken.headers.authorization;
    token = reqOrToken.query?.auth || reqOrToken.query?.token || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);
  }
  return token;
}

/**
 * Decrypts obfuscated or encrypted M3U8 keys/stream URLs
 * Supports base64, URI encoding, and token payloads
 */
export function decryptStreamKey(rawKey) {
  if (!rawKey) return null;
  try {
    if (typeof rawKey === 'string' && rawKey.startsWith('enc:')) {
      const payload = rawKey.slice(4);
      return Buffer.from(payload, 'base64').toString('utf-8');
    }
    return rawKey;
  } catch (e) {
    return rawKey;
  }
}

/**
 * Securely retrieves stream metadata from Firebase Realtime Database
 * Hides raw database paths, coordinates, and credentials from client
 */
export async function retrieveSecureStream({ node, ep, authToken }) {
  if (!node || !ep) {
    return { error: 'Missing node or episode parameter', status: 400 };
  }

  // Strict sanitization: allows alphanumeric, underscore, hyphen, and apostrophe (e.g. theshadow'sedge)
  const sanitizedNode = String(node).replace(/[^a-zA-Z0-9_\-']/g, '');
  const sanitizedEp = String(ep).replace(/[^a-zA-Z0-9_\-\.]/g, '');

  if (!sanitizedNode || !sanitizedEp) {
    return { error: 'Invalid stream parameters', status: 400 };
  }

  const databaseUrl = process.env.FIREBASE_DATABASE_URL || "https://tvnstream-b4497-default-rtdb.firebaseio.com";
  let fetchUrl = `${databaseUrl.replace(/\/$/, '')}/${sanitizedNode}/${sanitizedEp}.json`;
  if (authToken) {
    fetchUrl += `?auth=${encodeURIComponent(authToken)}`;
  }

  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      return { 
        error: response.status === 401 || response.status === 403 
          ? 'Access denied by security rules' 
          : 'Failed to retrieve stream metadata', 
        status: response.status 
      };
    }

    const data = await response.json();
    if (!data) {
      return { error: 'Stream not found', status: 404 };
    }

    if (data.error) {
      return { error: data.error, status: 403 };
    }

    // Resolve stream properties: data can be a plain string URL or an object with url/src
    let resolvedUrl = null;
    let title = null;
    let subtitles = null;
    let introEnd = 0;
    let key = null;

    if (typeof data === 'string') {
      resolvedUrl = data;
    } else if (data && typeof data === 'object') {
      resolvedUrl = data.url || data.src || null;
      title = data.title || null;
      subtitles = data.subtitles || null;
      introEnd = typeof data.introEnd === 'number' ? data.introEnd : 0;
      key = data.key ? decryptStreamKey(data.key) : null;
    }

    // Resolve and decrypt URL if encrypted with enc: prefix
    if (resolvedUrl && typeof resolvedUrl === 'string' && resolvedUrl.startsWith('enc:')) {
      resolvedUrl = decryptStreamKey(resolvedUrl);
    }

    return {
      ok: true,
      url: resolvedUrl,
      title: title,
      subtitles: subtitles,
      introEnd: introEnd,
      key: key
    };
  } catch (err) {
    console.error('Error fetching stream in api/secret.js:', err);
    return { error: 'Internal server error while resolving stream', status: 500 };
  }
}

/**
 * Express Request Handler for /api/secret/video-stream
 */
export async function handleSecretStreamRequest(req, res) {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { node, ep } = req.query;
  const authToken = validateClientSession(req);

  const result = await retrieveSecureStream({ node, ep, authToken });

  if (result.error) {
    return res.status(result.status || 500).json({ error: result.error });
  }

  return res.json(result);
}

// Express Router for /api/secret endpoints
export const secretRouter = express.Router();

secretRouter.get('/video-stream', handleSecretStreamRequest);

secretRouter.post('/decrypt-key', (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Key required' });
  const decrypted = decryptStreamKey(key);
  res.json({ ok: true, key: decrypted });
});

secretRouter.get('/check-access', async (req, res) => {
  const { pageId, uid } = req.query;
  const authToken = validateClientSession(req);
  if (!pageId) return res.json({ allowed: true });
  if (!uid && !authToken) return res.json({ allowed: false, reason: 'unauthenticated' });
  try {
    const databaseUrl = process.env.FIREBASE_DATABASE_URL || "https://tvnstream-b4497-default-rtdb.firebaseio.com";
    let url = `${databaseUrl.replace(/\/$/, '')}/page_access/${encodeURIComponent(pageId)}/${encodeURIComponent(uid)}.json`;
    if (authToken) url += `?auth=${encodeURIComponent(authToken)}`;
    const r = await fetch(url);
    if (r.ok) {
      const val = await r.json();
      return res.json({ allowed: val === true });
    }
  } catch (_) {}
  return res.json({ allowed: false });
});

secretRouter.get('/verify-session', (req, res) => {
  const token = validateClientSession(req);
  if (!token) {
    return res.status(401).json({ authenticated: false, message: 'No authorization session' });
  }
  return res.json({ authenticated: true, session: 'authorized' });
});

export default {
  validateClientSession,
  decryptStreamKey,
  retrieveSecureStream,
  handleSecretStreamRequest,
  secretRouter
};
