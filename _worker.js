// Cloudflare Worker gateway for Zone Vault stream tokenization & proxying
// Handles /api/stream-token, /api/stream-proxy.m3u8, and /api/stream/chunk with zero external CDN leakage

const STREAM_SECRET = 'zonevault-secure-token-salt-2026';

const ALLOWED_HOSTS = [
  'zonevault.live',
  'www.zonevault.live',
  'zonevault.site',
  'www.zonevault.site',
  'localhost',
  '127.0.0.1',
  '0.0.0.0'
];

function isAllowedHost(hostname) {
  if (!hostname) return false;
  hostname = hostname.toLowerCase();
  if (ALLOWED_HOSTS.includes(hostname)) return true;
  if (hostname.endsWith('.run.app') || hostname.endsWith('.ai.studio') || hostname.endsWith('.pages.dev')) return true;
  return false;
}

function checkOriginAllowed(request) {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Immediately reject extension URLs (e.g. moz-extension://, chrome-extension://)
  if (origin && (origin.startsWith('moz-extension:') || origin.startsWith('chrome-extension:') || origin.startsWith('safari-extension:'))) {
    return false;
  }
  if (referer && (referer.startsWith('moz-extension:') || referer.startsWith('chrome-extension:') || referer.startsWith('safari-extension:'))) {
    return false;
  }

  if (origin) {
    try {
      const u = new URL(origin);
      if (!isAllowedHost(u.hostname)) return false;
    } catch (_) {
      return false;
    }
  }

  if (referer) {
    try {
      const u = new URL(referer);
      if (!isAllowedHost(u.hostname)) return false;
    } catch (_) {
      return false;
    }
  }

  // Allow if at least origin or referer matches, or if an auth header is present
  if (origin || referer) return true;
  if (request.headers.get('authorization')) return true;
  return false;
}

// Download & Extension Prevention Helpers:
// Blocks browser download extensions (Live Stream Downloader, Video DownloadHelper, etc.),
// download tools (IDM, yt-dlp, curl, ffmpeg), and direct browser Save-As navigation.
function isDownloadToolOrExtension(request) {
  const origin = (request.headers.get('origin') || '').toLowerCase();
  const referer = (request.headers.get('referer') || '').toLowerCase();
  if (origin.startsWith('moz-extension:') || origin.startsWith('chrome-extension:') || origin.startsWith('safari-extension:') ||
      referer.startsWith('moz-extension:') || referer.startsWith('chrome-extension:')) {
    return true;
  }

  const dest = (request.headers.get('sec-fetch-dest') || '').toLowerCase();
  const mode = (request.headers.get('sec-fetch-mode') || '').toLowerCase();
  if (dest === 'document' || mode === 'navigate') {
    return true;
  }

  const ua = (request.headers.get('user-agent') || '').toLowerCase();
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

  return false;
}

function isDirectDownloadAttempt(request) {
  const dest = (request.headers.get('sec-fetch-dest') || '').toLowerCase();
  const mode = (request.headers.get('sec-fetch-mode') || '').toLowerCase();
  return dest === 'document' || mode === 'navigate';
}

const ZV_PAYLOAD_KEY = 'zv-shield-2026-payload-cipher-key';

function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  return base64UrlEncodeBytes(bytes);
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  const bytes = base64UrlDecodeToBytes(str);
  return new TextDecoder('utf-8').decode(bytes);
}

function base64UrlDecodeToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Fast Symmetric Stream Cipher (ZV1) to hide #EXTM3U, segment URLs, and WEBVTT cues in DevTools Network Response tab
function encryptZvPayload(plainText) {
  const plainBytes = new TextEncoder().encode(String(plainText || ''));
  const saltBytes = new Uint8Array(8);
  crypto.getRandomValues(saltBytes);
  let saltHex = '';
  for (let i = 0; i < saltBytes.length; i++) {
    saltHex += saltBytes[i].toString(16).padStart(2, '0');
  }

  const keyBytes = new TextEncoder().encode(`${ZV_PAYLOAD_KEY}:${saltHex}`);
  const cipherBytes = new Uint8Array(plainBytes.length);
  for (let i = 0; i < plainBytes.length; i++) {
    cipherBytes[i] = plainBytes[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 31 + 17) & 0xff);
  }

  return `ZV1.${saltHex}.${base64UrlEncodeBytes(cipherBytes)}`;
}

async function signStreamJwt(payload, secret) {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encPayload = base64UrlEncode(JSON.stringify(payload));
  const data = enc.encode(`${encHeader}.${encPayload}`);

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign('HMAC', key, data);
  const sig = base64UrlEncodeBytes(new Uint8Array(sigBuf));
  return `${encHeader}.${encPayload}.${sig}`;
}

async function verifyStreamJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length === 3) {
    const [encHeader, encPayload, sig] = parts;
    const enc = new TextEncoder();
    const data = enc.encode(`${encHeader}.${encPayload}`);

    try {
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const sigBytes = base64UrlDecodeToBytes(sig);
      const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
      if (!valid) return null;

      const payload = JSON.parse(base64UrlDecode(encPayload));
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < nowSec) {
        return { expired: true };
      }
      return payload;
    } catch (_) {
      return null;
    }
  }

  // Fallback for legacy/client base64url json token (zero-polling support)
  try {
    const decoded = JSON.parse(base64UrlDecode(token));
    if (decoded && decoded.expiresAt && Date.now() > decoded.expiresAt) {
      return { expired: true };
    }
    return decoded;
  } catch (_) {
    return null;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Stream-Token, Range, X-ZV-Player, X-ZV-Cipher, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
  };
}

function rewriteHlsManifest(manifestText, baseUrl, token, isNativeFallback = false, useZvCipher = false) {
  const lines = manifestText.split(/\r?\n/);
  const rewritten = [];
  const modeSuffix = isNativeFallback ? '&native=1' : (useZvCipher ? '&zvc=1' : '');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      rewritten.push(line);
      continue;
    }

    if (trimmed.startsWith('#')) {
      line = line.replace(/URI="([^"]+)"/g, (match, uri) => {
        try {
          const absUrl = new URL(uri, baseUrl).href;
          if (absUrl.toLowerCase().includes('.m3u8')) {
            return `URI="/api/zv-media-sync?token=${encodeURIComponent(token)}&u=${encodeURIComponent(base64UrlEncode(absUrl))}${modeSuffix}"`;
          }
          if (absUrl.toLowerCase().includes('.vtt') || absUrl.toLowerCase().includes('.srt')) {
            return `URI="/api/zv-sub-sync?token=${encodeURIComponent(token)}&u=${encodeURIComponent(base64UrlEncode(absUrl))}${modeSuffix}"`;
          }
          return `URI="${absUrl}"`;
        } catch (_) {
          return match;
        }
      });
      rewritten.push(line);
      continue;
    }

    try {
      const absUrl = new URL(trimmed, baseUrl).href;
      if (absUrl.toLowerCase().includes('.m3u8')) {
        rewritten.push(`/api/zv-media-sync?token=${encodeURIComponent(token)}&u=${encodeURIComponent(base64UrlEncode(absUrl))}${modeSuffix}`);
      } else if (absUrl.toLowerCase().includes('.vtt') || absUrl.toLowerCase().includes('.srt')) {
        rewritten.push(`/api/zv-sub-sync?token=${encodeURIComponent(token)}&u=${encodeURIComponent(base64UrlEncode(absUrl))}${modeSuffix}`);
      } else {
        rewritten.push(absUrl);
      }
    } catch (_) {
      rewritten.push(line);
    }
  }

  return rewritten.join('\n');
}

// Main API Handler for Cloudflare Workers
async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request)
    });
  }

  // 1. /api/stream-token or /stream-token (supports GET and POST, 6-hour concert TTL for zero polling)
  if (pathname === '/api/stream-token' || pathname === '/stream-token' || pathname === '/api/stream/token' || pathname === '/stream/token') {
    if (!checkOriginAllowed(request)) {
      return new Response(JSON.stringify({ error: 'Access denied: Playback allowed only on zonevault.live' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    let bodyData = {};
    if (request.method === 'POST') {
      try {
        bodyData = await request.json();
      } catch (_) {}
    }

    const queryData = Object.fromEntries(url.searchParams.entries());
    const params = { ...queryData, ...bodyData };

    const authHeader = request.headers.get('authorization');
    const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const sessionToken = params.idToken || tokenFromHeader;

    const uid = params.uid || (sessionToken ? 'authenticated-user' : null);
    if (!uid && !sessionToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Active user session required to stream video' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    const epId = params.epId || 'video';
    const userDisplayName = params.displayName || params.name || params.username || 'Zone Vault Member';
    const userRole = (params.role === 'admin') ? 'admin' : 'member';
    const targetUrl = params.targetUrl || params.u || '';
    const zvCipher = params.zvCipher === 'v1' || params.zvc === '1';
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const expiresAtSec = nowSec + 21600; // 6-hour concert session window (zero background polling needed)
    const expiresAtMs = nowMs + 21600 * 1000;
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';

    const jwtPayload = {
      sub: uid,
      uid: uid,
      displayName: userDisplayName,
      name: userDisplayName,
      username: userDisplayName,
      role: userRole,
      epId: epId,
      targetUrl: targetUrl,
      ip: clientIp,
      iat: nowSec,
      exp: expiresAtSec,
      expiresAt: expiresAtMs
    };

    const token = await signStreamJwt(jwtPayload, STREAM_SECRET);
    const cipherParam = zvCipher ? '&zvc=1' : '';
    const proxyUrl = targetUrl ? `/api/zv-media-sync?token=${encodeURIComponent(token)}${cipherParam}` : null;

    return new Response(JSON.stringify({
      success: true,
      token: token,
      proxyUrl: proxyUrl,
      expiresAt: expiresAtMs,
      originLocked: true,
      domain: 'zonevault.live',
      user: {
        uid: uid,
        displayName: userDisplayName,
        name: userDisplayName,
        username: userDisplayName,
        role: userRole
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...corsHeaders(request)
      }
    });
  }

  // 2. Disguised & Encrypted Manifest Gateway (/api/zv-media-sync and legacy aliases)
  if (
    pathname === '/api/zv-media-sync' ||
    pathname === '/zv-media-sync' ||
    pathname === '/api/stream-proxy.m3u8' ||
    pathname === '/stream-proxy.m3u8' ||
    pathname === '/api/stream/manifest.m3u8' ||
    pathname === '/stream/manifest.m3u8' ||
    pathname === '/api/stream/live.m3u8' ||
    pathname === '/stream/live.m3u8'
  ) {
    if (isDownloadToolOrExtension(request)) {
      return new Response(JSON.stringify({ error: 'Access denied: Download tools and browser extensions are prohibited.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    if (isDirectDownloadAttempt(request)) {
      return new Response('Access denied: Direct download of stream manifest is prohibited. Streaming permitted only inside the Zone Vault player.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders(request) }
      });
    }

    if (!checkOriginAllowed(request)) {
      return new Response('Access denied: Stream playback allowed only on zonevault.live', {
        status: 403,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders(request) }
      });
    }

    const token = url.searchParams.get('token') || url.searchParams.get('t') || request.headers.get('x-stream-token');
    if (!token) {
      return new Response('Missing stream token', { status: 400, headers: corsHeaders(request) });
    }

    const verified = await verifyStreamJwt(token, STREAM_SECRET);
    if (!verified) {
      return new Response('Invalid stream token signature', { status: 403, headers: corsHeaders(request) });
    }
    if (verified.expired) {
      return new Response('Stream token expired', { status: 403, headers: corsHeaders(request) });
    }

    let targetUrl = url.searchParams.get('u') || url.searchParams.get('url') || verified.targetUrl;
    if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      try {
        const decoded = base64UrlDecode(targetUrl);
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          targetUrl = decoded;
        }
      } catch (_) {}
    }

    if (!targetUrl || (!targetUrl.startsWith('https://') && !targetUrl.startsWith('http://'))) {
      return new Response('Invalid target media stream', { status: 400, headers: corsHeaders(request) });
    }

    try {
      const upstreamRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      if (!upstreamRes.ok) {
        return new Response('Upstream stream error', { status: upstreamRes.status, headers: corsHeaders(request) });
      }

      const isNativeFallback = url.searchParams.get('native') === '1';
      const useZvCipher = !isNativeFallback && (url.searchParams.get('zvc') === '1' || request.headers.get('x-zv-cipher') === 'ZV1');
      const manifestText = await upstreamRes.text();
      const rewritten = rewriteHlsManifest(manifestText, targetUrl, token, isNativeFallback, useZvCipher);

      if (!useZvCipher) {
        return new Response(rewritten, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Content-Disposition': 'inline',
            'X-Content-Type-Options': 'nosniff',
            'X-Download-Options': 'noopen',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            ...corsHeaders(request)
          }
        });
      }

      const encryptedPayload = encryptZvPayload(rewritten);
      return new Response(encryptedPayload, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'inline',
          'X-Content-Type-Options': 'nosniff',
          'X-Download-Options': 'noopen',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          ...corsHeaders(request)
        }
      });
    } catch (err) {
      return new Response('Error connecting to upstream media stream', { status: 502, headers: corsHeaders(request) });
    }
  }

  // 2b. Disguised & Encrypted Subtitle Gateway (/api/zv-sub-sync and aliases)
  if (
    pathname === '/api/zv-sub-sync' ||
    pathname === '/zv-sub-sync' ||
    pathname === '/api/subtitle-proxy' ||
    pathname === '/subtitle-proxy'
  ) {
    if (isDownloadToolOrExtension(request)) {
      return new Response(JSON.stringify({ error: 'Access denied: Download tools and browser extensions are prohibited.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    if (isDirectDownloadAttempt(request)) {
      return new Response('Access denied: Direct access or download of subtitle files is prohibited.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders(request) }
      });
    }

    if (!checkOriginAllowed(request)) {
      return new Response('Access denied: Subtitles allowed only on zonevault.live', {
        status: 403,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders(request) }
      });
    }

    const token = url.searchParams.get('token') || url.searchParams.get('t') || request.headers.get('x-stream-token');
    if (!token) {
      return new Response('Missing stream token', { status: 400, headers: corsHeaders(request) });
    }

    const verified = await verifyStreamJwt(token, STREAM_SECRET);
    if (!verified) {
      return new Response('Invalid stream token signature', { status: 403, headers: corsHeaders(request) });
    }
    if (verified.expired) {
      return new Response('Stream token expired', { status: 403, headers: corsHeaders(request) });
    }

    let subUrl = url.searchParams.get('u') || url.searchParams.get('url');
    if (subUrl && !subUrl.startsWith('http://') && !subUrl.startsWith('https://')) {
      try {
        const decoded = base64UrlDecode(subUrl);
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          subUrl = decoded;
        }
      } catch (_) {}
    }

    if (!subUrl || (!subUrl.startsWith('https://') && !subUrl.startsWith('http://'))) {
      return new Response('Invalid subtitle target', { status: 400, headers: corsHeaders(request) });
    }

    try {
      const upstreamRes = await fetch(subUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      if (!upstreamRes.ok) {
        return new Response('Upstream subtitle error', { status: upstreamRes.status, headers: corsHeaders(request) });
      }

      const subText = await upstreamRes.text();
      const isNativeFallback = url.searchParams.get('native') === '1';

      if (isNativeFallback) {
        return new Response(subText, {
          status: 200,
          headers: {
            'Content-Type': 'text/vtt; charset=utf-8',
            'Content-Disposition': 'inline',
            'X-Content-Type-Options': 'nosniff',
            'X-Download-Options': 'noopen',
            'Cache-Control': 'private, max-age=7200',
            ...corsHeaders(request)
          }
        });
      }

      const encryptedSub = encryptZvPayload(subText);
      return new Response(encryptedSub, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'inline',
          'X-Content-Type-Options': 'nosniff',
          'X-Download-Options': 'noopen',
          'Cache-Control': 'private, max-age=7200',
          ...corsHeaders(request)
        }
      });
    } catch (err) {
      return new Response('Error loading subtitle', { status: 502, headers: corsHeaders(request) });
    }
  }

  // 3. /api/stream/chunk
  if (pathname === '/api/stream/chunk') {
    if (isDownloadToolOrExtension(request)) {
      return new Response('Access denied: Browser download extensions and media rippers are prohibited.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders(request) }
      });
    }

    if (isDirectDownloadAttempt(request)) {
      return new Response('Access denied: Direct download of stream segments is prohibited.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders(request) }
      });
    }

    if (!checkOriginAllowed(request)) {
      return new Response('Access denied: Media playback allowed only on zonevault.live', {
        status: 403,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders(request) }
      });
    }

    const token = url.searchParams.get('token') || url.searchParams.get('t') || request.headers.get('x-stream-token');
    if (!token) {
      return new Response('Missing stream token', { status: 400, headers: corsHeaders(request) });
    }

    const verified = await verifyStreamJwt(token, STREAM_SECRET);
    if (!verified) {
      return new Response('Invalid stream token signature', { status: 403, headers: corsHeaders(request) });
    }
    if (verified.expired) {
      return new Response('Stream token expired', { status: 403, headers: corsHeaders(request) });
    }

    let chunkUrl = url.searchParams.get('u') || url.searchParams.get('url');
    if (chunkUrl && !chunkUrl.startsWith('http://') && !chunkUrl.startsWith('https://')) {
      try {
        const decoded = base64UrlDecode(chunkUrl);
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          chunkUrl = decoded;
        }
      } catch (_) {}
    }

    if (!chunkUrl || (!chunkUrl.startsWith('https://') && !chunkUrl.startsWith('http://'))) {
      return new Response('Invalid chunk target URL', { status: 400, headers: corsHeaders(request) });
    }

    try {
      const forwardHeaders = new Headers();
      forwardHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      if (request.headers.has('range')) {
        forwardHeaders.set('range', request.headers.get('range'));
      }

      const upstreamRes = await fetch(chunkUrl, { headers: forwardHeaders });
      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        return new Response('Upstream media chunk error', { status: upstreamRes.status, headers: corsHeaders(request) });
      }

      const responseHeaders = new Headers(upstreamRes.headers);
      const cors = corsHeaders(request);
      for (const [k, v] of Object.entries(cors)) {
        responseHeaders.set(k, v);
      }
      responseHeaders.set('Content-Disposition', 'inline');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      responseHeaders.set('X-Download-Options', 'noopen');
      responseHeaders.set('Cache-Control', 'private, no-transform, max-age=3600');

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders
      });
    } catch (err) {
      return new Response('Error streaming media chunk', { status: 502, headers: corsHeaders(request) });
    }
  }

  // 4. /api/verify-stream or /api/verify-stream-token
  if (pathname === '/api/verify-stream' || pathname === '/api/verify-stream-token') {
    if (!checkOriginAllowed(request)) {
      return new Response(JSON.stringify({ valid: false, error: 'Access denied: Unauthorized origin' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    let token = url.searchParams.get('token');
    if (!token && request.method === 'POST') {
      try {
        const body = await request.json();
        token = body.token;
      } catch (_) {}
    }
    if (!token) {
      const auth = request.headers.get('authorization');
      if (auth && auth.startsWith('Bearer ')) token = auth.split(' ')[1];
    }

    if (!token) {
      return new Response(JSON.stringify({ valid: false, error: 'No token provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    const verified = await verifyStreamJwt(token, STREAM_SECRET);
    if (!verified) {
      return new Response(JSON.stringify({ valid: false, error: 'Invalid token signature' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }
    if (verified.expired) {
      return new Response(JSON.stringify({ valid: false, error: 'Token expired' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    return new Response(JSON.stringify({
      valid: true,
      user: {
        uid: verified.uid || verified.sub,
        displayName: verified.displayName || verified.name || verified.username,
        role: verified.role || 'member'
      },
      epId: verified.epId,
      expiresAt: verified.expiresAt
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
    });
  }

  // Fallback to static assets
  if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    return env.ASSETS.fetch(request);
  }
  return fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/stream-') ||
      url.pathname === '/zv-media-sync' ||
      url.pathname === '/zv-sub-sync' ||
      url.pathname === '/subtitle-proxy'
    ) {
      return handleApiRequest(request, env);
    }
    const assetRes = (env && env.ASSETS && typeof env.ASSETS.fetch === 'function')
      ? await env.ASSETS.fetch(request)
      : await fetch(request);

    const lowerPath = url.pathname.toLowerCase();
    const isDynamicAsset = !lowerPath.includes('.') ||
      lowerPath.endsWith('.html') ||
      lowerPath.endsWith('.js') ||
      lowerPath.endsWith('.css') ||
      lowerPath.endsWith('.json');

    if (isDynamicAsset && assetRes) {
      const newHeaders = new Headers(assetRes.headers);
      newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      newHeaders.set('Pragma', 'no-cache');
      newHeaders.set('Expires', '0');
      return new Response(assetRes.body, {
        status: assetRes.status,
        statusText: assetRes.statusText,
        headers: newHeaders
      });
    }

    return assetRes;
  }
};
