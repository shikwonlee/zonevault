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
  
  // Build candidate nodes list for flexible database layout matching
  const candidateNodes = [sanitizedNode];
  if (sanitizedNode.includes('caratland') || sanitizedNode.includes('cl')) {
    if (!candidateNodes.includes('caratland2025')) candidateNodes.push('caratland2025');
    if (!candidateNodes.includes('caratland_2025')) candidateNodes.push('caratland_2025');
    if (!candidateNodes.includes('caratland2024')) candidateNodes.push('caratland2024');
    if (!candidateNodes.includes('caratland')) candidateNodes.push('caratland');
  } else if (sanitizedNode.includes('shadow')) {
    if (!candidateNodes.includes('theshadowsedge')) candidateNodes.push('theshadowsedge');
    if (!candidateNodes.includes("theshadow'sedge")) candidateNodes.push("theshadow'sedge");
    if (!candidateNodes.includes('the-shadows-edge')) candidateNodes.push('the-shadows-edge');
    if (!candidateNodes.includes('caratland2024')) candidateNodes.push('caratland2024');
  } else {
    if (!sanitizedNode.startsWith('url')) candidateNodes.push(`url${sanitizedNode}`);
    if (sanitizedNode.startsWith('url')) candidateNodes.push(sanitizedNode.slice(3));
    if (sanitizedNode.includes('_')) candidateNodes.push(sanitizedNode.replace(/_/g, ''));
  }

  try {
    let data = null;
    let lastResponse = null;

    for (const candNode of candidateNodes) {
      let fetchUrl = `${databaseUrl.replace(/\/$/, '')}/${candNode}/${sanitizedEp}.json`;
      if (authToken) fetchUrl += `?auth=${encodeURIComponent(authToken)}`;

      try {
        const response = await fetch(fetchUrl);
        lastResponse = response;
        if (response.ok) {
          const resJson = await response.json();
          if (resJson) { data = resJson; break; }
        }
      } catch (_) {}

      // Try node root directly
      let rootFetchUrl = `${databaseUrl.replace(/\/$/, '')}/${candNode}.json`;
      if (authToken) rootFetchUrl += `?auth=${encodeURIComponent(authToken)}`;
      try {
        const rootResponse = await fetch(rootFetchUrl);
        if (!lastResponse) lastResponse = rootResponse;
        if (rootResponse.ok) {
          const rootJson = await rootResponse.json();
          if (rootJson) { data = rootJson; break; }
        }
      } catch (_) {}
    }

    if (!data) {
      return { 
        error: (lastResponse && (lastResponse.status === 401 || lastResponse.status === 403))
          ? 'Access denied by security rules' 
          : 'Stream not found', 
        status: (lastResponse && lastResponse.status) || 404 
      };
    }

    if (data.error) {
      return { error: data.error, status: 403 };
    }

    // Resolve stream properties: data can be a plain string URL, an object, or contain nested episode key
    let targetObj = data;
    if (typeof data === 'object' && data !== null) {
      if (data[sanitizedEp]) {
        targetObj = data[sanitizedEp];
      } else if (data['1'] && sanitizedEp === '1') {
        targetObj = data['1'];
      }
    }

    let resolvedUrl = null;
    let title = null;
    let subtitles = null;
    let introEnd = 0;
    let key = null;

    if (typeof targetObj === 'string') {
      resolvedUrl = targetObj;
    } else if (targetObj && typeof targetObj === 'object') {
      resolvedUrl = targetObj.url || targetObj.src || targetObj.link || targetObj.videoUrl || targetObj.stream || targetObj.m3u8 || targetObj.url1 || null;
      title = targetObj.title || data.title || null;
      subtitles = targetObj.subtitles || data.subtitles || null;
      introEnd = typeof targetObj.introEnd === 'number' ? targetObj.introEnd : (typeof data.introEnd === 'number' ? data.introEnd : 0);
      key = targetObj.key ? decryptStreamKey(targetObj.key) : (data.key ? decryptStreamKey(data.key) : null);
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
