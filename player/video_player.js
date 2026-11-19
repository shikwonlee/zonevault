/**
 * =========================================
 * ZONE VAULT — Centralized Video Player Module
 * Location: /player/video_player.js
 * =========================================
 */

(function () {
    'use strict';

    // Global artplayer reference & 4-second control auto-hide default
    const CONTROL_HIDE_DELAY_MS = 4000;
    window.art = window.art || null;
    window.currentSubtitleUrls = window.currentSubtitleUrls || [];
    if (typeof window.Artplayer !== 'undefined') {
        window.Artplayer.CONTROL_HIDE_TIME = CONTROL_HIDE_DELAY_MS;
    }

    // Ensure default "Play Stream" / "Play Episode" / "Select an Episode" text is stripped on all video pages
    function sanitizePosterOverlay() {
        const overlay = document.getElementById('poster-overlay');
        const poster = document.getElementById('poster-container');
        if (!overlay) return;
        const rawText = (overlay.textContent || '').trim();
        if (/^(play\s+(stream|episode)|select\s+(an\s+episode|the\s+live\s+to\s+watch))$/i.test(rawText)) {
            overlay.textContent = '';
        }
        if (poster) {
            const hasText = (overlay.textContent || '').trim().length > 0;
            poster.classList.toggle('has-overlay-text', hasText);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sanitizePosterOverlay);
    } else {
        sanitizePosterOverlay();
    }

    /**
     * Clean up existing player and HLS streams
     */
    function cleanupPlayer() {
        if (typeof window.zvFsSyncCleanup === 'function') {
            try {
                window.zvFsSyncCleanup();
            } catch (_) {}
            window.zvFsSyncCleanup = null;
        }
        if (window.zvFsPlaylistObserver) {
            try {
                window.zvFsPlaylistObserver.disconnect();
            } catch (_) {}
            window.zvFsPlaylistObserver = null;
        }
        if (window.zoneVaultRollingTimer) {
            clearInterval(window.zoneVaultRollingTimer);
            window.zoneVaultRollingTimer = null;
        }
        if (window.art && window.art.hls) {
            try {
                window.art.hls.destroy();
            } catch (err) {
                console.warn('HLS destroy error:', err);
            }
        }
        if (window.art) {
            try {
                window.art.destroy(false);
            } catch (err) {
                console.warn('Artplayer destroy error:', err);
            }
            window.art = null;
        }
        if (Array.isArray(window.currentSubtitleUrls)) {
            window.currentSubtitleUrls.forEach(url => {
                try {
                    URL.revokeObjectURL(url);
                } catch (e) {}
            });
            window.currentSubtitleUrls = [];
        }
    }
    window.cleanupPlayer = cleanupPlayer;

    // Global Zone Vault Stream Manager (Zero-Polling 6h Session + In-Memory Decryption & RAM Cache)
    window.ZoneVaultStream = window.ZoneVaultStream || {
        ZV_PAYLOAD_KEY: 'zv-shield-2026-payload-cipher-key',
        activeSession: null,
        cachedAuthTicket: null,
        manifestCache: new Map(),
        subtitleBlobCache: new Map(),

        getActiveToken: function () {
            return this.activeSession ? this.activeSession.token : null;
        },

        base64UrlEncode: function (str) {
            try {
                const bytes = new TextEncoder().encode(String(str || ''));
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
            } catch (_) {
                return btoa(unescape(encodeURIComponent(String(str || '')))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
            }
        },

        base64UrlDecodeToBytes: function (str) {
            let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
            while (s.length % 4) s += '=';
            const binary = atob(s);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        },

        // Decrypts ZV1.<saltHex>.<base64UrlCipher> into plaintext (#EXTM3U or WEBVTT) exclusively in browser RAM
        decryptPayload: function (payloadStr) {
            if (!payloadStr || typeof payloadStr !== 'string') return payloadStr;
            const trimmed = payloadStr.trim();
            if (!trimmed.startsWith('ZV1.')) return payloadStr;

            try {
                const firstDot = trimmed.indexOf('.');
                const secondDot = trimmed.indexOf('.', firstDot + 1);
                if (firstDot === -1 || secondDot === -1) return payloadStr;

                const saltHex = trimmed.substring(firstDot + 1, secondDot);
                const b64Cipher = trimmed.substring(secondDot + 1);
                const cipherBytes = this.base64UrlDecodeToBytes(b64Cipher);
                const keyBytes = new TextEncoder().encode(`${this.ZV_PAYLOAD_KEY}:${saltHex}`);
                const plainBytes = new Uint8Array(cipherBytes.length);

                for (let i = 0; i < cipherBytes.length; i++) {
                    plainBytes[i] = cipherBytes[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 31 + 17) & 0xff);
                }

                return new TextDecoder('utf-8').decode(plainBytes);
            } catch (err) {
                console.warn('ZV1 payload decode note:', err);
                return payloadStr;
            }
        },

        // Ensures any decrypted subtitle (.vtt or .srt) is valid WebVTT for Blob URL playback
        normalizeToWebVtt: function (subText) {
            if (!subText || typeof subText !== 'string') return 'WEBVTT\n\n';
            const cleaned = subText.replace(/^\uFEFF/, '').trim();
            if (cleaned.startsWith('WEBVTT')) {
                return cleaned;
            }
            // Convert SRT timestamp commas (00:00:01,500 --> 00:00:03,200) to WebVTT dots
            const converted = cleaned.replace(
                /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
                '$1.$2 --> $3.$4'
            );
            return `WEBVTT\n\n${converted}\n`;
        },

        // Shifts all WebVTT cue timestamps by +offsetSeconds (used when separate .vtt files are paired with a single combined multi-hour video)
        offsetWebVttTimestamps: function (subText, offsetSeconds) {
            const normalized = this.normalizeToWebVtt(subText);
            const offsetMs = Math.round((Number(offsetSeconds) || 0) * 1000);
            if (!offsetMs) return normalized;

            const parseVttTimeMs = (timeStr) => {
                const parts = String(timeStr || '').trim().split(':');
                let hours = 0, minutes = 0, secondsMs = '0';
                if (parts.length === 3) {
                    hours = parseInt(parts[0], 10) || 0;
                    minutes = parseInt(parts[1], 10) || 0;
                    secondsMs = parts[2];
                } else if (parts.length === 2) {
                    minutes = parseInt(parts[0], 10) || 0;
                    secondsMs = parts[1];
                }
                const [secPart, msPart = '0'] = String(secondsMs).replace(',', '.').split('.');
                const seconds = parseInt(secPart, 10) || 0;
                const ms = parseInt(String(msPart).padEnd(3, '0').slice(0, 3), 10) || 0;
                return ((hours * 3600 + minutes * 60 + seconds) * 1000) + ms;
            };

            const formatVttTimeMs = (totalMs) => {
                const clamped = Math.max(0, Math.round(totalMs));
                const hours = Math.floor(clamped / 3600000);
                const minutes = Math.floor((clamped % 3600000) / 60000);
                const seconds = Math.floor((clamped % 60000) / 1000);
                const ms = clamped % 1000;
                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
            };

            return normalized.replace(
                /((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3})/g,
                (match, startStr, endStr) => {
                    const newStart = formatVttTimeMs(parseVttTimeMs(startStr) + offsetMs);
                    const newEnd = formatVttTimeMs(parseVttTimeMs(endStr) + offsetMs);
                    return `${newStart} --> ${newEnd}`;
                }
            );
        },

        // Proxies subtitles through /api/zv-sub-sync, decrypts ZV1 payload in RAM, and caches as an in-memory Blob URL
        resolveProtectedSubtitles: async function (subtitlesList, token) {
            if (!Array.isArray(subtitlesList) || subtitlesList.length === 0) return [];
            const activeTok = token || this.getActiveToken() || '';
            const resolved = [];

            for (let i = 0; i < subtitlesList.length; i++) {
                const item = subtitlesList[i];
                if (!item || !item.url) continue;

                if (item.url.startsWith('blob:')) {
                    resolved.push({ ...item, type: 'vtt' });
                    continue;
                }

                const offsetSec = Number(item.offsetSeconds) || 0;
                const cacheKey = offsetSec ? `${item.url}::offset=${offsetSec}` : item.url;

                // 1. Serve from browser RAM cache if already decrypted during this session (0 Worker requests)
                if (this.subtitleBlobCache.has(cacheKey)) {
                    resolved.push({
                        ...item,
                        url: this.subtitleBlobCache.get(cacheKey),
                        type: 'vtt'
                    });
                    continue;
                }

                // 2. Fetch encrypted subtitle via disguised /api/zv-sub-sync endpoint
                const encodedTarget = this.base64UrlEncode(item.url);
                const proxySubUrl = `/api/zv-sub-sync?token=${encodeURIComponent(activeTok)}&u=${encodeURIComponent(encodedTarget)}`;

                try {
                    const resp = await fetch(proxySubUrl, {
                        method: 'GET',
                        headers: {
                            ...(activeTok ? { 'X-Stream-Token': activeTok } : {}),
                            'X-ZV-Player': 'web-artplayer',
                            'X-Requested-With': 'ZoneVaultPlayer'
                        }
                    });

                    if (resp.ok) {
                        const rawPayload = await resp.text();
                        const decryptedText = this.decryptPayload(rawPayload);
                        const vttText = offsetSec
                            ? this.offsetWebVttTimestamps(decryptedText, offsetSec)
                            : this.normalizeToWebVtt(decryptedText);
                        const blob = new Blob([vttText], { type: 'text/vtt;charset=utf-8' });
                        const blobUrl = URL.createObjectURL(blob);
                        this.subtitleBlobCache.set(cacheKey, blobUrl);
                        resolved.push({
                            ...item,
                            url: blobUrl,
                            type: 'vtt'
                        });
                        continue;
                    }
                } catch (err) {
                    console.warn('Subtitle proxy fetch note:', err);
                }

                // Fallback: use disguised proxy URL with native=1 if Blob creation was blocked
                resolved.push({
                    ...item,
                    url: `${proxySubUrl}&native=1`,
                    type: 'vtt'
                });
            }

            return resolved;
        },

        getManifestCacheKey: function (url) {
            if (!url || typeof url !== 'string') return null;
            try {
                const parsed = new URL(url, window.location.origin);
                const uParam = parsed.searchParams.get('u');
                if (uParam) return `sub:${uParam}`;
                if (
                    parsed.pathname.includes('zv-media-sync') ||
                    parsed.pathname.includes('stream-proxy') ||
                    parsed.pathname.includes('/stream/manifest')
                ) {
                    const target = this.activeSession ? this.activeSession.targetUrl : '';
                    return `master:${target || parsed.pathname}`;
                }
            } catch (_) {}
            return null;
        },

        updateTokenInUrl: function (url) {
            const token = this.getActiveToken();
            if (!token || !url) return url;
            if (
                url.includes('/api/zv-media-sync') ||
                url.includes('/zv-media-sync') ||
                url.includes('/api/zv-sub-sync') ||
                url.includes('/api/stream/') ||
                url.includes('/api/stream-proxy')
            ) {
                return url.replace(/([?&](?:token|t)=)[^&]*/, `$1${encodeURIComponent(token)}`);
            }
            return url;
        }
    };

    /**
     * Format seconds into H:MM:SS or MM:SS
     */
    function formatTime(seconds) {
        seconds = Math.max(0, Math.floor(Number(seconds) || 0));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }
    window.formatTime = formatTime;

    /**
     * Custom gesture animation feedback (+10s, -10s, play, pause)
     */
    function triggerCustomAnimation(type, side) {
        const playerInstance = window.art;
        if (!playerInstance || !playerInstance.template || !playerInstance.template.$player) return;

        const oldIcon = playerInstance.template.$player.querySelector('.custom-gesture-anim');
        if (oldIcon) oldIcon.remove();

        const animEl = document.createElement('div');
        animEl.className = 'custom-gesture-anim';

        if (side === 'left') animEl.style.left = '22%';
        else if (side === 'right') animEl.style.left = '78%';
        else animEl.style.left = '50%';

        if (type === 'rewind') {
            animEl.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"></path></svg><span>-10s</span>`;
        } else if (type === 'forward') {
            animEl.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"></path></svg><span>+10s</span>`;
        } else if (type === 'play') {
            animEl.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg><span>PLAY</span>`;
        } else if (type === 'pause') {
            animEl.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg><span>PAUSE</span>`;
        }

        playerInstance.template.$player.appendChild(animEl);
        setTimeout(() => animEl.remove(), 600);
    }
    window.triggerCustomAnimation = triggerCustomAnimation;

    /**
     * Initialize ArtPlayer with complete feature set
     */
    async function initZoneVideoPlayer(options) {
        const {
            container = '#artplayer',
            data = {},
            ep = {},
            poster = '',
            subtitles = [],
            playlistData = [],
            auth,
            db,
            pageIdentifier = 'videos',
            historyKey,
            loadToken,
            getCurrentLoadToken = () => loadToken,
            onNextEpisode,
            onSkipIntro,
            startPosition = null,
            hasLayers = true,
            resumeFromHistory = true,
            onLoadedMetadata,
            onTimeUpdate
        } = options;

        const prevWasFullscreenWeb = Boolean(
            (window.art && window.art.fullscreenWeb) || window.__zvPreserveFullscreenWeb
        );
        const prevWasFullscreen = Boolean(
            (window.art && window.art.fullscreen) ||
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            window.__zvPreserveFullscreen
        );
        window.__zvPreserveFullscreenWeb = false;
        window.__zvPreserveFullscreen = false;

        cleanupPlayer();

        // Show persistent Access Restricted modal with user UID and Username (no auto redirect)
        function showAccessRestrictedModal(name, id, reason) {
            let existing = document.querySelector('.access-denied-modal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.className = 'access-denied-modal';
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(5,5,6,0.98);color:#fff;display:flex;align-items:center;justify-content:center;z-index:99999;flex-direction:column;text-align:center;backdrop-filter:blur(20px);padding:20px;';

            modal.innerHTML = `
                <strong style="color:#FF4444; font-size:28px; margin-bottom:15px; display:block;">Access Restricted</strong>
                <div style="font-size:15px; margin-bottom:20px; line-height:1.5; max-width:480px; color:#eaeaea;">
                    ${reason || "This content is restricted. Your account does not have permission to stream this video."}
                </div>
                
                <div style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:16px 20px; margin-bottom:24px; text-align:left; max-width:440px; width:100%; box-sizing:border-box;">
                    <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#8e8e99; margin-bottom:10px; font-weight:700;">Account Details</div>
                    <div style="font-size:13px; color:#fcfcfc; margin-bottom:8px; display:flex; justify-content:space-between; gap:12px;">
                        <span style="color:#a1a1aa;">Username:</span>
                        <span style="font-weight:600; text-align:right;">${name || 'Guest / Unknown'}</span>
                    </div>
                    <div style="font-size:13px; color:#fcfcfc; display:flex; justify-content:space-between; gap:12px; word-break:break-all;">
                        <span style="color:#a1a1aa; flex-shrink:0;">UID:</span>
                        <code style="font-family:'JetBrains Mono', monospace; font-size:12px; color:#d4d4d8; background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; user-select:all;">${id || 'Not logged in'}</code>
                    </div>
                </div>

                <button onclick="window.location.href='/videos'" style="padding:14px 36px; border-radius:50px; background:#ffffff; color:#0a0a0c; border:none; cursor:pointer; font-weight:700; font-size:14px; letter-spacing:1px; text-transform:uppercase; transition:all 0.2s; box-shadow:0 8px 24px rgba(255,255,255,0.2);">
                    <i class="fas fa-arrow-left" style="margin-right:8px;"></i> Back to Video
                </button>
            `;
            document.body.appendChild(modal);
        }

        // Resilient token fetcher with 6-hour session caching (avoids repeat Worker calls when switching episodes)
        async function fetchStreamTicket(params) {
            const epId = params.epId || 'video';
            const uid = params.uid || '';
            const displayName = params.displayName || 'Zone Vault Member';
            const role = params.role || 'member';
            const targetUrl = params.targetUrl || '';
            const idToken = params.idToken;

            // Reuse existing 6-hour session token if already validated in this browser session (0 Worker requests!)
            const cachedTicket = window.ZoneVaultStream.cachedAuthTicket;
            if (
                cachedTicket &&
                cachedTicket.token &&
                cachedTicket.uid === uid &&
                cachedTicket.expiresAt &&
                cachedTicket.expiresAt - Date.now() > 600000
            ) {
                const b64Target = window.ZoneVaultStream.base64UrlEncode(targetUrl);
                return {
                    ok: true,
                    data: {
                        token: cachedTicket.token,
                        proxyUrl: targetUrl
                            ? `/api/zv-media-sync?token=${encodeURIComponent(cachedTicket.token)}&u=${encodeURIComponent(b64Target)}&zvc=1`
                            : null,
                        expiresAt: cachedTicket.expiresAt,
                        user: { uid, displayName, role }
                    }
                };
            }

            const queryParams = new URLSearchParams({
                epId: epId,
                uid: uid,
                displayName: displayName,
                role: role,
                targetUrl: targetUrl,
                zvCipher: 'v1'
            });

            const endpoints = [
                { url: '/api/stream-token', method: 'POST' },
                { url: `/api/stream-token?${queryParams.toString()}`, method: 'GET' },
                { url: '/stream-token', method: 'POST' },
                { url: `/stream-token?${queryParams.toString()}`, method: 'GET' },
                { url: '/api/stream/token', method: 'POST' },
                { url: `/api/stream/token?${queryParams.toString()}`, method: 'GET' }
            ];

            for (const item of endpoints) {
                try {
                    const fetchOpts = {
                        method: item.method,
                        headers: {
                            ...(item.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
                            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
                        }
                    };
                    if (item.method === 'POST') {
                        fetchOpts.body = JSON.stringify({
                            epId: epId,
                            uid: uid,
                            displayName: displayName,
                            name: displayName,
                            role: role,
                            targetUrl: targetUrl,
                            idToken: idToken,
                            zvCipher: 'v1'
                        });
                    }

                    const resp = await fetch(item.url, fetchOpts);
                    if (resp.status === 401 || resp.status === 403) {
                        return { ok: false, status: resp.status };
                    }
                    if (resp.ok) {
                        const resData = await resp.json();
                        if (resData && (resData.token || resData.proxyUrl)) {
                            if (resData.proxyUrl && !resData.proxyUrl.includes('zvc=1')) {
                                resData.proxyUrl += (resData.proxyUrl.includes('?') ? '&' : '?') + 'zvc=1';
                            }
                            window.ZoneVaultStream.cachedAuthTicket = {
                                uid: uid,
                                token: resData.token,
                                expiresAt: resData.expiresAt || (Date.now() + 21600000)
                            };
                            return { ok: true, data: resData };
                        }
                    }
                } catch (_) {}
            }

            // Client-side fallback token generation (6-hour concert window, uses disguised /api/zv-media-sync)
            try {
                const nowSec = Math.floor(Date.now() / 1000);
                const expiresAtMs = Date.now() + 21600000;
                const payload = {
                    sub: uid || 'authenticated-user',
                    uid: uid || 'authenticated-user',
                    displayName: displayName,
                    name: displayName,
                    username: displayName,
                    role: role,
                    epId: epId,
                    targetUrl: targetUrl,
                    iat: nowSec,
                    exp: nowSec + 21600,
                    expiresAt: expiresAtMs
                };
                const tokenStr = window.ZoneVaultStream.base64UrlEncode(JSON.stringify(payload));
                const b64Target = window.ZoneVaultStream.base64UrlEncode(targetUrl);

                window.ZoneVaultStream.cachedAuthTicket = {
                    uid: uid,
                    token: tokenStr,
                    expiresAt: expiresAtMs
                };

                return {
                    ok: true,
                    data: {
                        token: tokenStr,
                        proxyUrl: targetUrl ? `/api/zv-media-sync?token=${encodeURIComponent(tokenStr)}&u=${encodeURIComponent(b64Target)}&zvc=1` : null,
                        expiresAt: expiresAtMs,
                        user: { uid, displayName, role }
                    }
                };
            } catch (_) {
                return null;
            }
        }

        // Resolve Firebase user asynchronously during page refresh / cold start
        async function resolveAuthenticatedUser(authInst) {
            if (!authInst) return null;
            if (authInst.currentUser) return authInst.currentUser;
            return new Promise((resolve) => {
                let unsub = null;
                const timer = setTimeout(() => {
                    if (unsub) unsub();
                    resolve(authInst.currentUser || null);
                }, 3500);

                try {
                    unsub = authInst.onAuthStateChanged((u) => {
                        clearTimeout(timer);
                        if (unsub) unsub();
                        resolve(u);
                    });
                } catch (_) {
                    clearTimeout(timer);
                    resolve(authInst.currentUser || null);
                }
            });
        }

        // Validate stream access token with server (enforces zonevault.live origin and active user session)
        let playbackUrl = data.url || '';
        let activeStreamToken = '';
        try {
            const currentAuth = auth || (typeof window !== 'undefined' && window.firebase && window.firebase.auth ? window.firebase.auth() : null);
            
            // 1. Wait for Firebase to finish restoring user from IndexedDB/localStorage on page refresh
            let currentUser = currentAuth ? currentAuth.currentUser : null;
            if (currentAuth && !currentUser) {
                currentUser = await resolveAuthenticatedUser(currentAuth);
            }

            // 2. Read fallback cache if available
            let cachedUser = null;
            try {
                const raw = sessionStorage.getItem('zv_user_cache') || localStorage.getItem('zv_user_cache');
                if (raw) cachedUser = JSON.parse(raw);
            } catch (_) {}

            let idToken = null;
            let userUid = (currentUser && currentUser.uid) || (cachedUser && cachedUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null;
            let userName = options.userName || (currentUser && (currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : null))) || (cachedUser && (cachedUser.username || cachedUser.name || cachedUser.displayName)) || 'Zone Vault Member';
            let userRole = options.userRole || window.currentUserRole || (cachedUser && cachedUser.role) || (sessionStorage.getItem('isAdmin') === 'true' ? 'admin' : 'member');

            if (currentUser) {
                try {
                    idToken = await currentUser.getIdToken();
                } catch (tokErr) {
                    console.warn('ID token fetch note:', tokErr);
                }

                if (db && !options.userRole && !window.currentUserRole) {
                    try {
                        const snap = await db.ref(`users/${currentUser.uid}`).once('value');
                        const uData = snap.val() || {};
                        if (uData.role) {
                            userRole = String(uData.role).toLowerCase();
                            if (userRole === 'admin') window.currentUserRole = 'admin';
                        }
                        if (uData.username || uData.name) userName = uData.username || uData.name;
                    } catch (_) {}
                }
            }

            const ticketResult = await fetchStreamTicket({
                epId: (ep && ep.id) || 'video',
                uid: userUid,
                displayName: userName,
                role: userRole,
                idToken: idToken,
                targetUrl: data.url
            });

            if (ticketResult && ticketResult.status === 401) {
                if (currentAuth) {
                    const recoverUnsub = currentAuth.onAuthStateChanged((recoveredUser) => {
                        if (recoveredUser) {
                            if (recoverUnsub) recoverUnsub();
                            const existing = document.querySelector('.access-denied-modal');
                            if (existing) existing.remove();
                            initZoneVideoPlayer(options);
                        }
                    });
                }
                showAccessRestrictedModal(userName, userUid, 'Authentication Required: Please log in to stream this video.');
                return null;
            } else if (ticketResult && ticketResult.status === 403) {
                showAccessRestrictedModal(userName, userUid, 'Access Restricted: Playback is permitted only on zonevault.live.');
                return null;
            } else if (ticketResult && ticketResult.ok && ticketResult.data) {
                const ticket = ticketResult.data;
                activeStreamToken = ticket.token || '';
                if (ticket && ticket.proxyUrl) {
                    playbackUrl = ticket.proxyUrl;
                }
                window.ZoneVaultStream.activeSession = {
                    token: ticket.token,
                    epId: (ep && ep.id) || 'video',
                    targetUrl: data.url,
                    uid: userUid,
                    displayName: userName,
                    role: userRole
                };
            }
        } catch (e) {
            console.warn('Stream token validation note:', e);
        }

        // Proxy and decrypt subtitles into in-memory Blob URLs (cached in RAM; 0 raw .vtt links exposed)
        const protectedSubtitles = await window.ZoneVaultStream.resolveProtectedSubtitles(subtitles, activeStreamToken);
        const defaultSubtitle = protectedSubtitles.find(s => s.default) || protectedSubtitles[0];
        let lastSavedHistory = null;

        const artOptions = {
            container: container,
            url: playbackUrl,
            type: 'm3u8',
            title: data.title || (ep && ep.title) || '',
            poster: poster || (ep && ep.image) || '',
            volume: 0.5,
            isLive: false,
            muted: false,
            autoplay: true,
            setting: true,
            fullscreen: true,
            fullscreenWeb: false,
            miniProgressBar: false,
            autoOrientation: true,
            lock: true,
            fastForward: false, // Disable built-in fast forward slide
            gesture: false,     // Disable built-in gestures
            touch: false,       // Disable built-in touch dragging
            mutex: true,
            backdrop: false,
            playsInline: true,
            autoPlayback: true,
            airplay: true,
            theme: '#a1a1aa',
            subtitle: {
                url: defaultSubtitle ? defaultSubtitle.url : '',
                type: 'vtt',
                encoding: 'utf-8',
                style: {
                    color: '#ffffff',
                    background: 'transparent',
                    backgroundColor: 'transparent',
                    textShadow: 'none',
                    fontFamily: "'Inter', 'Outfit', 'Nunito', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontWeight: '600'
                }
            },
            moreVideoAttr: {
                preload: 'metadata',
                playsInline: true,
                'webkit-playsinline': true,
                disablePictureInPicture: true,
                controlsList: 'nodownload noplaybackrate',
                'x5-video-player-type': 'h5',
                'x5-video-player-fullscreen': 'true',
                'x5-video-orientation': 'landscape'
            },
            customType: {
                m3u8(video, url, instance) {
                    if (video) video.preload = 'metadata';
                    if (instance && instance.hls) instance.hls.destroy();
                    if (window.Hls && Hls.isSupported()) {
                        const isProxyEndpoint = function (targetUrl) {
                            if (!targetUrl || typeof targetUrl !== 'string') return false;
                            if (
                                targetUrl.startsWith('/api/') ||
                                targetUrl.startsWith('/zv-') ||
                                targetUrl.startsWith('/stream-') ||
                                targetUrl.startsWith('/stream/')
                            ) return true;
                            try {
                                const parsed = new URL(targetUrl, window.location.origin);
                                return parsed.origin === window.location.origin && (
                                    parsed.pathname.startsWith('/api/') ||
                                    parsed.pathname.startsWith('/zv-') ||
                                    parsed.pathname.startsWith('/stream-') ||
                                    parsed.pathname.startsWith('/stream/')
                                );
                            } catch (_) {
                                return false;
                            }
                        };

                        const hlsConfig = {
                            ...(typeof startPosition === 'number' && startPosition > 0 ? { startPosition: startPosition } : {}),
                            xhrSetup: function (xhr, reqUrl) {
                                if (!isProxyEndpoint(reqUrl)) return;
                                if (!xhr.readyState) {
                                    xhr.open('GET', reqUrl, true);
                                }
                                const currentTok = window.ZoneVaultStream.getActiveToken();
                                if (currentTok) {
                                    try {
                                        xhr.setRequestHeader('X-Stream-Token', currentTok);
                                    } catch (_) {}
                                }
                                try {
                                    xhr.setRequestHeader('X-ZV-Player', 'web-artplayer');
                                    xhr.setRequestHeader('X-ZV-Cipher', 'ZV1');
                                    xhr.setRequestHeader('X-Requested-With', 'ZoneVaultPlayer');
                                } catch (_) {}
                            }
                        };

                        if (Hls.DefaultConfig && Hls.DefaultConfig.loader) {
                            class ZoneVaultTokenLoader extends Hls.DefaultConfig.loader {
                                load(context, config, callbacks) {
                                    if (context && context.url) {
                                        context.url = window.ZoneVaultStream.updateTokenInUrl(context.url);
                                    }
                                    const reqUrl = context ? context.url : '';
                                    const absReqUrl = (function () {
                                        try { return new URL(reqUrl, window.location.origin).href; } catch (_) { return reqUrl; }
                                    })();
                                    const cacheKey = window.ZoneVaultStream.getManifestCacheKey(reqUrl);

                                    // Serve decrypted VOD playlist from browser RAM cache if already loaded (0 Worker requests!)
                                    if (cacheKey && window.ZoneVaultStream.manifestCache.has(cacheKey)) {
                                        const cachedManifest = window.ZoneVaultStream.manifestCache.get(cacheKey);
                                        const now = performance.now();
                                        const cachedStats = {
                                            aborted: false,
                                            loaded: cachedManifest.length,
                                            total: cachedManifest.length,
                                            retry: 0,
                                            chunkCount: 1,
                                            bwEstimate: 0,
                                            loading: { start: now, first: now, end: now },
                                            parsing: { start: now, end: now },
                                            buffering: { start: now, first: now, end: now }
                                        };
                                        setTimeout(() => {
                                            if (callbacks && typeof callbacks.onSuccess === 'function') {
                                                callbacks.onSuccess({ url: absReqUrl, data: cachedManifest }, cachedStats, context, null);
                                            }
                                        }, 0);
                                        return;
                                    }

                                    if (callbacks && typeof callbacks.onSuccess === 'function') {
                                        const origOnSuccess = callbacks.onSuccess;
                                        callbacks.onSuccess = function (response, stats, ctx, networkDetails) {
                                            if (response && typeof response.data === 'string' && response.data.trim().startsWith('ZV1.')) {
                                                response.data = window.ZoneVaultStream.decryptPayload(response.data);
                                                // Cache VOD playlists in browser RAM so ABR quality switches use 0 Worker requests
                                                if (
                                                    cacheKey &&
                                                    (response.data.includes('#EXT-X-ENDLIST') || response.data.includes('#EXT-X-STREAM-INF'))
                                                ) {
                                                    window.ZoneVaultStream.manifestCache.set(cacheKey, response.data);
                                                }
                                            }
                                            return origOnSuccess.call(this, response, stats, ctx, networkDetails);
                                        };
                                    }

                                    super.load(context, config, callbacks);
                                }
                            }
                            hlsConfig.fLoader = ZoneVaultTokenLoader;
                            hlsConfig.pLoader = ZoneVaultTokenLoader;
                        }

                        const hls = new Hls(hlsConfig);
                        hls.loadSource(url);
                        hls.attachMedia(video);
                        if (instance) instance.hls = hls;

                        hls.on(Hls.Events.MANIFEST_PARSED, function () {
                            const availableLevels = hls.levels || [];
                            const targetResolutions = [1080, 720, 480, 270, 120];
                            const qualityList = [];

                            qualityList.push({ html: 'Auto', index: -1, default: true });

                            targetResolutions.forEach(res => {
                                let matchIndex = availableLevels.findIndex(lvl => lvl.height === res);
                                if (matchIndex === -1 && availableLevels.length > 0) {
                                    matchIndex = availableLevels.reduce((prev, curr, idx) =>
                                        Math.abs(curr.height - res) < Math.abs(availableLevels[prev].height - res) ? idx : prev, 0);
                                }
                                qualityList.push({
                                    html: `${res}P`,
                                    index: matchIndex !== -1 ? matchIndex : -1
                                });
                            });

                            instance.setting.update({
                                name: 'quality',
                                width: 150,
                                html: 'Quality',
                                tooltip: 'Auto',
                                selector: qualityList.map(item => ({
                                    html: item.html,
                                    default: item.default,
                                    url: '#',
                                    $index: item.index
                                })),
                                onSelect: function (item) {
                                    hls.currentLevel = item.$index;
                                    return item.html;
                                }
                            });
                        });
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        // Legacy iOS Safari native playback fallback
                        const nativeUrl = (url && (url.includes('/api/zv-media-sync') || url.includes('stream-proxy')))
                            ? `${url}${url.includes('?') ? '&' : '?'}native=1`
                            : url;
                        video.src = nativeUrl;
                    }
                }
            }
        };

        if (typeof Artplayer !== 'undefined') {
            Artplayer.CONTROL_HIDE_TIME = CONTROL_HIDE_DELAY_MS;
        }
        const artInstance = new Artplayer(artOptions);
        if (artInstance && artInstance.constructor) {
            artInstance.constructor.CONTROL_HIDE_TIME = CONTROL_HIDE_DELAY_MS;
        }
        window.art = artInstance;

        let fsCardsToggleBtn = null;
        let fsCardsListEl = null;
        let isControlsVisible = true;
        let controlsAutoHideTimer = null;
        let lastRealMouseX = -1;
        let lastRealMouseY = -1;
        let hasRealMousePos = false;
        let lastSubtitleMutationAt = 0;

        // Sync progress slider visibility with Artplayer control show/hide state
        // so the slider never drops to the bottom or gets accidentally tapped when controls hide
        const syncProgressVisibility = (isControlShown) => {
            const shown = Boolean(isControlShown);
            const progressEl = artInstance.template && artInstance.template.$progress;
            if (progressEl) {
                if (shown && !artInstance.lock) {
                    progressEl.style.opacity = '1';
                    progressEl.style.visibility = 'visible';
                    progressEl.style.pointerEvents = 'auto';
                } else {
                    progressEl.style.opacity = '0';
                    progressEl.style.visibility = 'hidden';
                    progressEl.style.pointerEvents = 'none';
                }
            }
            if (fsCardsToggleBtn) {
                fsCardsToggleBtn.classList.toggle('is-controls-hidden', !(shown && !artInstance.lock));
            }
            if (fsCardsListEl && artInstance.lock) {
                fsCardsListEl.classList.remove('is-open');
                if (fsCardsToggleBtn) fsCardsToggleBtn.classList.remove('is-open');
            }
        };

        const clearControlsAutoHideTimer = () => {
            if (controlsAutoHideTimer) {
                clearTimeout(controlsAutoHideTimer);
                controlsAutoHideTimer = null;
            }
        };

        const canAutoHideControlsNow = () => {
            if (!artInstance || !artInstance.playing) return false;
            if (artInstance.setting && artInstance.setting.show) return false;
            if (artInstance.isInput) return false;
            if (artInstance.controls && artInstance.controls.isHover) return false;
            const isDrawerOpen = Boolean(fsCardsListEl && fsCardsListEl.classList.contains('is-open'));
            if (isDrawerOpen) return false;
            try {
                const bottomEl = artInstance.template && artInstance.template.$bottom;
                const settingsEl = artInstance.template && artInstance.template.$setting;
                if (
                    (fsCardsToggleBtn && fsCardsToggleBtn.matches(':hover')) ||
                    (fsCardsListEl && fsCardsListEl.matches(':hover')) ||
                    (bottomEl && bottomEl.matches(':hover')) ||
                    (settingsEl && settingsEl.matches(':hover'))
                ) {
                    return false;
                }
            } catch (_) {}
            return true;
        };

        const scheduleControlsAutoHide = () => {
            clearControlsAutoHideTimer();
            if (artInstance && artInstance.controls) {
                artInstance.controls.timer = Date.now();
            }
            if (!artInstance || !artInstance.playing) return;
            controlsAutoHideTimer = setTimeout(() => {
                controlsAutoHideTimer = null;
                if (isControlsVisible && canAutoHideControlsNow()) {
                    isControlsVisible = false;
                    try { artInstance.controls.show = false; } catch (_) {}
                    syncProgressVisibility(false);
                }
            }, CONTROL_HIDE_DELAY_MS);
        };

        artInstance.on('control', (state) => {
            isControlsVisible = Boolean(state);
            syncProgressVisibility(isControlsVisible);
            if (isControlsVisible) {
                scheduleControlsAutoHide();
            } else {
                clearControlsAutoHideTimer();
            }
        });

        artInstance.on('lock', (isLocked) => {
            syncProgressVisibility(!isLocked && isControlsVisible);
        });

        // =========================================================
        // FULLSCREEN & LANDSCAPE IN-PLAYER FLOATING VIDEO CARDS
        // Mounted immediately onto artInstance.template.$player
        // =========================================================
        const playlistIconSvg = '<svg viewBox="0 0 24 24"><path d="M4 6h11v2H4V6zm0 4h11v2H4v-2zm0 4h7v2H4v-2zm13-1v7l6-3.5-6-3.5z"/></svg>';
        const closeIconSvg = '<svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>';

        let setDrawerOpen = () => {};
        let renderFullscreenCards = () => {};

        const onDesktopPointerWakeUp = (ev) => {
            if (ev) {
                if (ev.pointerType && ev.pointerType !== 'mouse') {
                    return;
                }
                if (ev.target && ev.target.closest && ev.target.closest('.art-subtitle')) {
                    return;
                }
                if (ev.type === 'mousemove' || ev.type === 'pointermove') {
                    const cx = typeof ev.clientX === 'number' ? ev.clientX : -1;
                    const cy = typeof ev.clientY === 'number' ? ev.clientY : -1;
                    const dx = hasRealMousePos ? Math.abs(cx - lastRealMouseX) : 999;
                    const dy = hasRealMousePos ? Math.abs(cy - lastRealMouseY) : 999;
                    const recentlyMutatedSub = (Date.now() - lastSubtitleMutationAt) < 260;

                    if (ev.buttons === 0) {
                        if (hasRealMousePos && dx < 4 && dy < 4) {
                            return;
                        }
                        if (recentlyMutatedSub && (!hasRealMousePos || (dx < 8 && dy < 8))) {
                            return;
                        }
                    }
                    lastRealMouseX = cx;
                    lastRealMouseY = cy;
                    hasRealMousePos = true;
                }
            }
            if (!isControlsVisible) {
                isControlsVisible = true;
                try { artInstance.controls.show = true; } catch (_) {}
                syncProgressVisibility(true);
            }
            scheduleControlsAutoHide();
        };

        const mountFullscreenCardsOverlay = () => {
            const playerEl = artInstance && artInstance.template && artInstance.template.$player;
            if (!playerEl || fsCardsToggleBtn) return;

            fsCardsToggleBtn = document.createElement('button');
            fsCardsToggleBtn.type = 'button';
            fsCardsToggleBtn.className = 'zv-fs-cards-toggle';
            fsCardsToggleBtn.setAttribute('aria-label', 'Toggle Episodes');
            fsCardsToggleBtn.innerHTML = playlistIconSvg;

            fsCardsListEl = document.createElement('div');
            fsCardsListEl.className = 'zv-fs-cards-list';

            // Scroll a specific card index to the exact center of the 3-card drawer without scrolling the outer page
            const scrollCardIndexToCenter = (idx, smooth = true) => {
                if (!fsCardsListEl) return;
                const cards = fsCardsListEl.querySelectorAll('.zv-fs-card-item');
                if (!cards.length) return;
                const clampedIdx = Math.max(0, Math.min(cards.length - 1, idx));
                const stride = cards.length > 1
                    ? (cards[1].offsetTop - cards[0].offsetTop)
                    : (cards[0].offsetHeight + 8);
                const targetTop = Math.max(0, clampedIdx * stride);
                try {
                    fsCardsListEl.scrollTo({
                        top: targetTop,
                        behavior: smooth ? 'smooth' : 'auto'
                    });
                } catch (_) {
                    fsCardsListEl.scrollTop = targetTop;
                }
            };

            // Continuously interpolate scale & opacity for silky-smooth 60/120fps scrolling
            let scrollRafId = null;
            let scrollSnapSettleTimer = null;
            const updateCenterCardScale = () => {
                if (!fsCardsListEl) return;
                const cards = Array.from(fsCardsListEl.querySelectorAll('.zv-fs-card-item'));
                if (cards.length === 0) return;

                const firstCard = cards[0];
                const secondCard = cards[1];
                const stride = secondCard
                    ? (secondCard.offsetTop - firstCard.offsetTop)
                    : (firstCard ? firstCard.offsetHeight : 0);

                if (stride > 0) {
                    const fractionalIdx = fsCardsListEl.scrollTop / stride;
                    const closestIdx = Math.max(0, Math.min(cards.length - 1, Math.round(fractionalIdx)));

                    cards.forEach((card, idx) => {
                        const dist = Math.abs(idx - fractionalIdx);
                        const clampedT = Math.max(0, 1 - Math.min(1, dist));
                        const smoothT = clampedT * clampedT * (3 - 2 * clampedT);
                        const scale = dist > 1.2
                            ? 0.76
                            : (0.84 + (0.20 * smoothT));
                        const opacity = dist > 1.2
                            ? Math.max(0.16, 0.56 - ((dist - 1) * 0.45))
                            : (0.56 + (0.44 * smoothT));

                        card.style.setProperty('--zv-card-scale', scale.toFixed(3));
                        card.style.setProperty('--zv-card-opacity', opacity.toFixed(3));
                        card.classList.toggle('is-center-card', idx === closestIdx);
                        card.classList.toggle('is-far-card', dist > 1.35);
                    });
                } else {
                    const activeIdx = Math.max(0, cards.findIndex(c => c.classList.contains('active')));
                    cards.forEach((card, idx) => {
                        const isCenter = idx === activeIdx;
                        card.style.setProperty('--zv-card-scale', isCenter ? '1.04' : '0.84');
                        card.style.setProperty('--zv-card-opacity', isCenter ? '1' : '0.56');
                        card.classList.toggle('is-center-card', isCenter);
                        card.classList.toggle('is-far-card', Math.abs(idx - activeIdx) > 1);
                    });
                }
            };

            const getEffectivePlaylistItems = () => {
                const domCards = Array.from(document.querySelectorAll('#playlist-items .playlist-item'));
                if (domCards.length > 0) {
                    return domCards.map((el, idx) => {
                        const id = el.dataset.id || String(idx + 1);
                        const imgEl = el.querySelector('img');
                        const titleEl = el.querySelector('.playlist-title');
                        return {
                            id: String(id),
                            title: (titleEl && titleEl.textContent) || '',
                            image: (imgEl && imgEl.getAttribute('src')) || poster || '',
                            active: el.classList.contains('active'),
                            domEl: el
                        };
                    });
                }
                if (Array.isArray(playlistData) && playlistData.length > 0) {
                    return playlistData.map((item, idx) => {
                        const id = String(item.id || (idx + 1));
                        return {
                            id: id,
                            title: item.title || '',
                            image: item.image || poster || '',
                            active: Boolean(window.currentEpData && String(window.currentEpData.id) === id),
                            domEl: null
                        };
                    });
                }
                return [];
            };

            renderFullscreenCards = () => {
                if (!fsCardsListEl) return;
                const items = getEffectivePlaylistItems();
                if (items.length <= 1) return;
                const prevScrollTop = fsCardsListEl.scrollTop;
                fsCardsListEl.innerHTML = '';

                items.forEach((item, idx) => {
                    const cardBtn = document.createElement('div');
                    cardBtn.className = 'zv-fs-card-item' + (item.active ? ' active' : '');
                    cardBtn.dataset.id = item.id;
                    cardBtn.dataset.index = String(idx);

                    const thumbDiv = document.createElement('div');
                    thumbDiv.className = 'zv-fs-card-thumb';
                    const img = document.createElement('img');
                    img.src = item.image || poster || '';
                    img.loading = 'lazy';
                    img.alt = item.title || `Stream ${item.id}`;
                    thumbDiv.appendChild(img);

                    const textDiv = document.createElement('div');
                    textDiv.className = 'zv-fs-card-text';
                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'zv-fs-card-title';
                    titleSpan.textContent = item.title;
                    textDiv.appendChild(titleSpan);

                    const barsDiv = document.createElement('div');
                    barsDiv.className = 'zv-fs-card-bars';
                    barsDiv.innerHTML = '<span></span><span></span><span></span>';

                    cardBtn.appendChild(thumbDiv);
                    cardBtn.appendChild(textDiv);
                    cardBtn.appendChild(barsDiv);

                    cardBtn.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();

                        // Preserve fullscreen state when switching streams
                        if (artInstance.fullscreenWeb) {
                            window.__zvPreserveFullscreenWeb = true;
                        }
                        const outerPlayerContainer = document.getElementById('player-container');
                        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
                        if (artInstance.fullscreen || fsEl) {
                            window.__zvPreserveFullscreen = true;
                            if (outerPlayerContainer && fsEl && fsEl !== outerPlayerContainer) {
                                try {
                                    if (outerPlayerContainer.requestFullscreen) {
                                        outerPlayerContainer.requestFullscreen().catch(() => {});
                                    } else if (outerPlayerContainer.webkitRequestFullscreen) {
                                        outerPlayerContainer.webkitRequestFullscreen();
                                    }
                                } catch (_) {}
                            }
                        }

                        // Highlight & center selected card smoothly inside the drawer
                        fsCardsListEl.querySelectorAll('.zv-fs-card-item').forEach(c => {
                            c.classList.toggle('active', c.dataset.id === item.id);
                        });
                        scrollCardIndexToCenter(idx, true);
                        requestAnimationFrame(updateCenterCardScale);

                        const domTarget = document.querySelector(`#playlist-items .playlist-item[data-id="${item.id}"]`) || item.domEl;
                        if (domTarget) {
                            domTarget.click();
                        } else if (typeof window.loadAndPlayEpisode === 'function') {
                            window.loadAndPlayEpisode(item.id, true);
                        }
                    });

                    fsCardsListEl.appendChild(cardBtn);
                });

                if (prevScrollTop > 0) {
                    fsCardsListEl.scrollTop = prevScrollTop;
                }
                requestAnimationFrame(updateCenterCardScale);
            };

            setDrawerOpen = (openState) => {
                if (!fsCardsListEl || !fsCardsToggleBtn) return;
                const effectiveOpen = Boolean(openState);
                fsCardsListEl.classList.toggle('is-open', effectiveOpen);
                fsCardsToggleBtn.classList.toggle('is-open', effectiveOpen);
                fsCardsToggleBtn.innerHTML = effectiveOpen ? closeIconSvg : playlistIconSvg;
                if (effectiveOpen) {
                    renderFullscreenCards();
                    const cards = Array.from(fsCardsListEl.querySelectorAll('.zv-fs-card-item'));
                    const activeIdx = Math.max(0, cards.findIndex(c => c.classList.contains('active')));
                    requestAnimationFrame(() => {
                        scrollCardIndexToCenter(activeIdx, false);
                        updateCenterCardScale();
                    });
                }
            };

            fsCardsToggleBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onDesktopPointerWakeUp();
                const nextState = !fsCardsListEl.classList.contains('is-open');
                setDrawerOpen(nextState);
            });

            fsCardsListEl.addEventListener('scroll', () => {
                if (scrollRafId) cancelAnimationFrame(scrollRafId);
                scrollRafId = requestAnimationFrame(updateCenterCardScale);
                if (scrollSnapSettleTimer) clearTimeout(scrollSnapSettleTimer);
                scrollSnapSettleTimer = setTimeout(() => {
                    const cards = fsCardsListEl.querySelectorAll('.zv-fs-card-item');
                    if (cards.length > 1) {
                        const stride = cards[1].offsetTop - cards[0].offsetTop;
                        if (stride > 0) {
                            const nearestIdx = Math.max(0, Math.min(cards.length - 1, Math.round(fsCardsListEl.scrollTop / stride)));
                            if (Math.abs(fsCardsListEl.scrollTop - (nearestIdx * stride)) > 2) {
                                scrollCardIndexToCenter(nearestIdx, true);
                            }
                        }
                    }
                }, 140);
            }, { passive: true });

            // Stop wheel events from bubbling out of the scrollable cards list
            fsCardsListEl.addEventListener('wheel', (ev) => {
                ev.stopPropagation();
            }, { passive: true });

            playerEl.appendChild(fsCardsListEl);
            playerEl.appendChild(fsCardsToggleBtn);
            renderFullscreenCards();

            // Capture-phase mousemove filter: blocks synthetic 0px mousemove events triggered
            // when subtitle cues appear/disappear so Artplayer's internal mousemove listener NEVER wakes up controls
            const onCaptureMouseMove = (ev) => {
                if (ev.target && ev.target.closest && ev.target.closest('.art-subtitle')) {
                    ev.stopImmediatePropagation();
                    return;
                }
                if (ev.buttons > 0) {
                    if (isControlsVisible) scheduleControlsAutoHide();
                    return;
                }
                const cx = typeof ev.clientX === 'number' ? ev.clientX : -1;
                const cy = typeof ev.clientY === 'number' ? ev.clientY : -1;
                const dx = hasRealMousePos ? Math.abs(cx - lastRealMouseX) : 999;
                const dy = hasRealMousePos ? Math.abs(cy - lastRealMouseY) : 999;
                const recentlyMutatedSub = (Date.now() - lastSubtitleMutationAt) < 260;

                if (hasRealMousePos && dx < 4 && dy < 4) {
                    ev.stopImmediatePropagation();
                    return;
                }
                if (recentlyMutatedSub && (!hasRealMousePos || (dx < 8 && dy < 8))) {
                    ev.stopImmediatePropagation();
                    return;
                }
                lastRealMouseX = cx;
                lastRealMouseY = cy;
                hasRealMousePos = true;
                onDesktopPointerWakeUp();
            };

            const onControlInteractionReset = (ev) => {
                if (
                    ev.target && ev.target.closest && (
                        ev.target.closest('.art-controls') ||
                        ev.target.closest('.art-progress') ||
                        ev.target.closest('.art-settings') ||
                        ev.target.closest('.zv-fs-cards-toggle') ||
                        ev.target.closest('.zv-fs-cards-list')
                    )
                ) {
                    scheduleControlsAutoHide();
                }
            };

            playerEl.addEventListener('mousemove', onCaptureMouseMove, true);
            playerEl.addEventListener('pointerdown', onControlInteractionReset, { passive: true });
            playerEl.addEventListener('touchstart', onControlInteractionReset, { passive: true });

            // Observe #playlist-items so dynamic active-card updates (like nanatour.html auto-switching) sync automatically
            const domPlaylistContainer = document.getElementById('playlist-items');
            if (domPlaylistContainer && typeof MutationObserver !== 'undefined') {
                window.zvFsPlaylistObserver = new MutationObserver(() => {
                    renderFullscreenCards();
                });
                window.zvFsPlaylistObserver.observe(domPlaylistContainer, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class']
                });
            }

            // Local-only subtitle preferences (saved exclusively in browser localStorage, never on user's account)
            const LOCAL_SUBTITLE_PREFS_KEY = 'zv_subtitle_prefs_local';
            const SUBTITLE_DESIGN_PRESETS = {
                'dark-box': {
                    label: 'Dark Box',
                    bg: 'rgba(0, 0, 0, 0.72)',
                    shadow: 'none',
                    radius: '0.45em',
                    padding: '0.22em 0.65em',
                    blur: 'none'
                },
                'soft-box': {
                    label: 'Soft Box',
                    bg: 'rgba(0, 0, 0, 0.48)',
                    shadow: 'none',
                    radius: '0.45em',
                    padding: '0.22em 0.65em',
                    blur: 'none'
                },
                'solid-box': {
                    label: 'Solid Box',
                    bg: 'rgba(0, 0, 0, 0.92)',
                    shadow: 'none',
                    radius: '0.45em',
                    padding: '0.22em 0.65em',
                    blur: 'none'
                },
                'glass-box': {
                    label: 'Glass Box',
                    bg: 'rgba(18, 18, 26, 0.55)',
                    shadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
                    radius: '0.45em',
                    padding: '0.22em 0.65em',
                    blur: 'blur(8px)'
                },
                'outline': {
                    label: 'Black Outline',
                    bg: 'transparent',
                    shadow: '0 1.5px 0 #000, 0 -1.5px 0 #000, 1.5px 0 0 #000, -1.5px 0 0 #000, 1.06px 1.06px 0 #000, -1.06px -1.06px 0 #000, 1.06px -1.06px 0 #000, -1.06px 1.06px 0 #000, 0 2px 6px rgba(0, 0, 0, 0.85)',
                    radius: '0',
                    padding: '0.1em 0.25em',
                    blur: 'none'
                },
                'shadow': {
                    label: 'Drop Shadow',
                    bg: 'transparent',
                    shadow: '0 2px 4px rgba(0, 0, 0, 0.95), 0 4px 12px rgba(0, 0, 0, 0.85)',
                    radius: '0',
                    padding: '0.1em 0.25em',
                    blur: 'none'
                }
            };
            window.ZV_SUBTITLE_DESIGN_PRESETS = SUBTITLE_DESIGN_PRESETS;

            const getUserSubtitlePrefs = () => {
                const defaults = { size: 'auto', design: 'dark-box', color: '#ffffff' };
                try {
                    const raw = localStorage.getItem(LOCAL_SUBTITLE_PREFS_KEY);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        return {
                            size: parsed.size || defaults.size,
                            design: SUBTITLE_DESIGN_PRESETS[parsed.design] ? parsed.design : defaults.design,
                            color: parsed.color || defaults.color
                        };
                    }
                } catch (_) {}
                return defaults;
            };
            window.zvGetUserSubtitlePrefs = getUserSubtitlePrefs;

            const ensureGlobalSubtitleStyleInjected = () => {
                if (!document.getElementById('zv-subtitle-font-link')) {
                    const fontLink = document.createElement('link');
                    fontLink.id = 'zv-subtitle-font-link';
                    fontLink.rel = 'stylesheet';
                    fontLink.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Varela+Round&display=swap';
                    (document.head || document.documentElement).appendChild(fontLink);
                }

                let globalSubStyleEl = document.getElementById('zv-global-subtitle-override');
                if (!globalSubStyleEl) {
                    globalSubStyleEl = document.createElement('style');
                    globalSubStyleEl.id = 'zv-global-subtitle-override';
                    globalSubStyleEl.textContent = `
                        .art-video-player {
                            --zv-sub-auto-size: 25px;
                            --zv-sub-size: var(--zv-sub-custom-size, var(--zv-sub-auto-size, 25px));
                            --zv-sub-bg: rgba(0, 0, 0, 0.72);
                            --zv-sub-color: #ffffff;
                            --zv-sub-shadow: none;
                            --zv-sub-radius: 0.45em;
                            --zv-sub-padding: 0.22em 0.65em;
                            --zv-sub-blur: none;
                        }
                        .art-video-player .art-subtitle,
                        .art-subtitle {
                            position: absolute !important;
                            left: 0 !important;
                            right: 0 !important;
                            transform: none !important;
                            width: 100% !important;
                            max-width: 100% !important;
                            margin: 0 !important;
                            padding: 0 16px !important;
                            color: var(--zv-sub-color, #ffffff) !important;
                            background: transparent !important;
                            background-color: transparent !important;
                            box-shadow: none !important;
                            border: none !important;
                            border-radius: 0 !important;
                            text-shadow: none !important;
                            -webkit-text-stroke: 0 !important;
                            backdrop-filter: none !important;
                            -webkit-backdrop-filter: none !important;
                            font-family: 'Inter', 'Outfit', 'Nunito', -apple-system, BlinkMacSystemFont, sans-serif !important;
                            font-weight: 600 !important;
                            line-height: 1.4 !important;
                            letter-spacing: 0.01em !important;
                            flex-direction: column !important;
                            align-items: center !important;
                            justify-content: flex-end !important;
                            gap: 5px !important;
                            text-align: center !important;
                            font-size: var(--zv-sub-size, var(--zv-sub-auto-size, 25px)) !important;
                            pointer-events: none !important;
                            user-select: none !important;
                            box-sizing: border-box !important;
                            z-index: 20 !important;
                            contain: layout style !important;
                            bottom: var(--art-subtitle-bottom, 15px) !important;
                            transition: bottom 0.2s ease, font-size 0.2s ease !important;
                        }
                        .art-video-player:not(.art-subtitle-show) .art-subtitle {
                            display: none !important;
                        }
                        .art-video-player.art-subtitle-show .art-subtitle {
                            display: flex !important;
                        }
                        .art-video-player.art-control-show .art-subtitle {
                            bottom: calc(var(--art-control-height, 46px) + var(--art-progress-height, 6px) + var(--art-bottom-gap, 5px) + var(--art-subtitle-bottom, 15px)) !important;
                        }
                        .art-video-player .art-subtitle p,
                        .art-video-player .art-subtitle .art-subtitle-line,
                        .art-video-player .art-subtitle .zv-sub-line,
                        .art-video-player .art-subtitle > div,
                        .art-video-player .art-subtitle > span,
                        .art-subtitle p,
                        .art-subtitle .art-subtitle-line,
                        .art-subtitle .zv-sub-line,
                        .art-subtitle > div,
                        .art-subtitle > span {
                            color: var(--zv-sub-color, #ffffff) !important;
                            background: var(--zv-sub-bg, rgba(0, 0, 0, 0.72)) !important;
                            background-color: var(--zv-sub-bg, rgba(0, 0, 0, 0.72)) !important;
                            text-shadow: var(--zv-sub-shadow, none) !important;
                            -webkit-text-stroke: 0 !important;
                            border: none !important;
                            box-shadow: none !important;
                            border-radius: var(--zv-sub-radius, 0.45em) !important;
                            padding: var(--zv-sub-padding, 0.22em 0.65em) !important;
                            backdrop-filter: var(--zv-sub-blur, none) !important;
                            -webkit-backdrop-filter: var(--zv-sub-blur, none) !important;
                            margin: 0 auto !important;
                            width: fit-content !important;
                            max-width: 92% !important;
                            display: inline-block !important;
                            text-align: center !important;
                            font-family: 'Inter', 'Outfit', 'Nunito', -apple-system, BlinkMacSystemFont, sans-serif !important;
                            font-weight: 600 !important;
                            line-height: 1.4 !important;
                            font-size: var(--zv-sub-size, var(--zv-sub-auto-size, 25px)) !important;
                            box-decoration-break: clone !important;
                            -webkit-box-decoration-break: clone !important;
                            pointer-events: none !important;
                            user-select: none !important;
                            box-sizing: border-box !important;
                            white-space: pre-wrap !important;
                            word-break: break-word !important;
                        }
                        .art-video-player .art-subtitle:empty,
                        .art-subtitle:empty {
                            opacity: 0 !important;
                            visibility: hidden !important;
                            padding: 0 !important;
                            background: transparent !important;
                        }
                        .art-video-player .art-subtitle p:empty,
                        .art-video-player .art-subtitle .art-subtitle-line:empty,
                        .art-video-player .art-subtitle .zv-sub-line:empty,
                        .art-video-player .art-subtitle > div:empty,
                        .art-video-player .art-subtitle > span:empty {
                            display: none !important;
                            background: transparent !important;
                            padding: 0 !important;
                        }
                        @media (max-width: 950px) {
                            .art-video-player { --zv-sub-auto-size: 9px; --art-subtitle-bottom: 12px; }
                            .art-video-player .art-subtitle, .art-subtitle { gap: 3px !important; }
                        }
                        @media (max-width: 950px) and (max-height: 520px) and (orientation: landscape),
                               (hover: none) and (pointer: coarse) and (orientation: landscape) {
                            .art-video-player { --zv-sub-auto-size: 14px; --art-subtitle-bottom: 16px; }
                            .art-video-player .art-subtitle, .art-subtitle { gap: 4px !important; }
                        }
                    `;
                    (document.head || document.documentElement).appendChild(globalSubStyleEl);
                } else if (document.head && document.head.lastElementChild !== globalSubStyleEl) {
                    document.head.appendChild(globalSubStyleEl);
                }
            };

            // Lightweight cue normalizer: leaves Artplayer's standard .art-subtitle-line elements untouched
            // (styled purely via CSS custom properties) and only splits raw text nodes / <br> tags when present.
            // Never mutates playerEl styles, never toggles display, never wakes up controls.
            const normalizeSubtitleCueDOM = (containerEl) => {
                lastSubtitleMutationAt = Date.now();
                if (!containerEl) return;

                const childNodes = Array.from(containerEl.childNodes);
                if (childNodes.length === 0) return;

                const hasLooseText = childNodes.some(n => n.nodeType === 3 && n.nodeValue && n.nodeValue.trim().length > 0);
                const children = Array.from(containerEl.children);
                const hasBrChild = children.some(ch => ch.tagName === 'BR' || (ch.querySelector && ch.querySelector('br')));

                if (hasLooseText || hasBrChild) {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = (containerEl.innerHTML || '')
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<\/(p|div)>/gi, '\n');
                    const lines = (tmp.textContent || '')
                        .split(/\r?\n/)
                        .map(l => l.trim())
                        .filter(Boolean);

                    const frag = document.createDocumentFragment();
                    lines.forEach(lineText => {
                        const div = document.createElement('div');
                        div.className = 'art-subtitle-line';
                        div.textContent = lineText;
                        frag.appendChild(div);
                    });
                    containerEl.textContent = '';
                    containerEl.appendChild(frag);
                    return;
                }

                // Trim whitespace-only line nodes so no empty dark box renders
                children.forEach(ch => {
                    if (!(ch.textContent || '').trim()) {
                        ch.remove();
                    }
                });
            };

            const syncDesktopAndMobileFullscreenClass = (forcedState, syncOpts) => {
                const isSubtitleOnly = Boolean(syncOpts && syncOpts.subtitleOnly);
                const wasInFs = playerEl.classList.contains('zv-is-fullscreen');
                const outerContainer = document.getElementById('player-container');
                const artContainer = artInstance && artInstance.template && artInstance.template.$container;
                const playlistEl = document.getElementById('playlist');
                const fsEl =
                    document.fullscreenElement ||
                    document.mozFullScreenElement ||
                    document.webkitFullscreenElement ||
                    document.msFullscreenElement;
                const isPlayerFsElement = Boolean(
                    fsEl && (
                        fsEl === playerEl ||
                        fsEl === artContainer ||
                        fsEl === outerContainer ||
                        playerEl.contains(fsEl) ||
                        (outerContainer && outerContainer.contains(fsEl))
                    )
                );
                const isMobileLandscapeFullscreen = Boolean(
                    outerContainer &&
                    window.getComputedStyle(outerContainer).position === 'fixed' &&
                    playlistEl &&
                    window.getComputedStyle(playlistEl).display === 'none'
                );
                const inFs = typeof forcedState === 'boolean'
                    ? Boolean(forcedState || isPlayerFsElement || artInstance.fullscreen || artInstance.fullscreenWeb || isMobileLandscapeFullscreen)
                    : Boolean(
                        isPlayerFsElement ||
                        artInstance.fullscreen ||
                        artInstance.fullscreenWeb ||
                        playerEl.classList.contains('art-fullscreen') ||
                        playerEl.classList.contains('art-fullscreen-web') ||
                        isMobileLandscapeFullscreen
                    );

                if (!isSubtitleOnly) {
                    playerEl.classList.toggle('zv-is-fullscreen', inFs);
                    if (artContainer) artContainer.classList.toggle('zv-is-fullscreen', inFs);
                    if (outerContainer) outerContainer.classList.toggle('zv-is-fullscreen', inFs);
                }

                ensureGlobalSubtitleStyleInjected();

                // Responsive auto-size:
                // - Large screen / Desktop mode: 25px
                // - Phone fullscreen / landscape: 14px
                // - Smaller screen (mobile portrait / non-fullscreen small screen): 9px
                const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
                const vh = window.innerHeight || document.documentElement.clientHeight || 768;
                const playerRect = playerEl.getBoundingClientRect ? playerEl.getBoundingClientRect() : { width: vw, height: vh };
                const pw = playerRect.width || vw;
                const isCoarsePointer = Boolean(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
                const isPhoneLandscape =
                    (isCoarsePointer && vw > vh) ||
                    (vw <= 950 && vh <= 520 && vw > vh) ||
                    isMobileLandscapeFullscreen;
                const isSmallOrMobileScreen = vw <= 950 || pw <= 620 || (isCoarsePointer && Math.min(vw, vh) <= 600);

                let autoSubSize = '25';
                if (isSmallOrMobileScreen) {
                    if (inFs || isPhoneLandscape) {
                        autoSubSize = '14';
                    } else {
                        autoSubSize = '9';
                    }
                }

                const userSubPrefs = getUserSubtitlePrefs();
                const targetSubSize = (userSubPrefs.size && userSubPrefs.size !== 'auto')
                    ? String(userSubPrefs.size)
                    : autoSubSize;
                const activeDesign = SUBTITLE_DESIGN_PRESETS[userSubPrefs.design] || SUBTITLE_DESIGN_PRESETS['dark-box'];
                const activeColor = userSubPrefs.color || '#ffffff';

                playerEl.setAttribute('data-zv-sub-size', targetSubSize);
                playerEl.setAttribute('data-zv-sub-design', userSubPrefs.design || 'dark-box');
                playerEl.style.setProperty('--zv-sub-auto-size', `${autoSubSize}px`);
                if (userSubPrefs.size && userSubPrefs.size !== 'auto') {
                    playerEl.style.setProperty('--zv-sub-custom-size', `${targetSubSize}px`);
                } else {
                    playerEl.style.removeProperty('--zv-sub-custom-size');
                }
                playerEl.style.setProperty('--zv-sub-size', `${targetSubSize}px`);
                playerEl.style.setProperty('--zv-sub-bg', activeDesign.bg);
                playerEl.style.setProperty('--zv-sub-color', activeColor);
                playerEl.style.setProperty('--zv-sub-shadow', activeDesign.shadow);
                playerEl.style.setProperty('--zv-sub-radius', activeDesign.radius);
                playerEl.style.setProperty('--zv-sub-padding', activeDesign.padding);
                playerEl.style.setProperty('--zv-sub-blur', activeDesign.blur);

                const subEl = (artInstance.template && artInstance.template.$subtitle) || playerEl.querySelector('.art-subtitle');
                if (subEl) {
                    normalizeSubtitleCueDOM(subEl);
                }

                // If called only for a subtitle preference update, never wake up controls or touch fullscreen drawer state
                if (isSubtitleOnly) {
                    return;
                }

                if (fsCardsToggleBtn && fsCardsListEl) {
                    if (inFs) {
                        fsCardsToggleBtn.style.setProperty('display', 'flex', 'important');
                        fsCardsListEl.style.setProperty('display', 'flex', 'important');
                    } else {
                        fsCardsToggleBtn.style.setProperty('display', 'none', 'important');
                        fsCardsListEl.style.setProperty('display', 'none', 'important');
                    }
                }

                // Only wake up controls when transitioning into fullscreen, and close drawer when exiting fullscreen
                if (inFs && !wasInFs) {
                    onDesktopPointerWakeUp();
                } else if (!inFs && wasInFs) {
                    setDrawerOpen(false);
                }
            };

            const saveUserSubtitlePrefs = (partialPrefs) => {
                const updated = { ...getUserSubtitlePrefs(), ...partialPrefs, updatedAt: Date.now() };
                try {
                    localStorage.setItem(LOCAL_SUBTITLE_PREFS_KEY, JSON.stringify(updated));
                } catch (_) {}
                syncDesktopAndMobileFullscreenClass(undefined, { subtitleOnly: true });
                return updated;
            };
            window.zvSaveUserSubtitlePrefs = saveUserSubtitlePrefs;
            window.zvSyncSubtitleSize = () => syncDesktopAndMobileFullscreenClass(undefined, { subtitleOnly: true });

            // Observe subtitle cue updates lightly (no root reflows, no style recalculations, no waking controls)
            const subContainerEl = (artInstance.template && artInstance.template.$subtitle) || playerEl.querySelector('.art-subtitle');
            let subObserver = null;
            if (subContainerEl && typeof MutationObserver !== 'undefined') {
                let isNormalizingSub = false;
                subObserver = new MutationObserver(() => {
                    lastSubtitleMutationAt = Date.now();
                    if (isNormalizingSub) return;
                    isNormalizingSub = true;
                    try {
                        normalizeSubtitleCueDOM(subContainerEl);
                    } finally {
                        isNormalizingSub = false;
                    }
                });
                subObserver.observe(subContainerEl, { childList: true, subtree: true, characterData: true });
            }

            artInstance.on('subtitleBeforeUpdate', () => {
                lastSubtitleMutationAt = Date.now();
            });
            artInstance.on('subtitleAfterUpdate', () => {
                lastSubtitleMutationAt = Date.now();
                if (subContainerEl) normalizeSubtitleCueDOM(subContainerEl);
            });
            artInstance.on('subtitleUpdate', () => {
                lastSubtitleMutationAt = Date.now();
                if (subContainerEl) normalizeSubtitleCueDOM(subContainerEl);
            });
            artInstance.on('subtitleLoad', () => {
                lastSubtitleMutationAt = Date.now();
                syncDesktopAndMobileFullscreenClass(undefined, { subtitleOnly: true });
            });

            if (artInstance.subtitle && typeof artInstance.subtitle.switch === 'function' && !artInstance.subtitle.__zvWrapped) {
                const origSubSwitch = artInstance.subtitle.switch.bind(artInstance.subtitle);
                artInstance.subtitle.switch = function (...args) {
                    lastSubtitleMutationAt = Date.now();
                    const res = origSubSwitch(...args);
                    Promise.resolve(res).then(() => {
                        lastSubtitleMutationAt = Date.now();
                        if (subContainerEl) normalizeSubtitleCueDOM(subContainerEl);
                    }).catch(() => {});
                    return res;
                };
                artInstance.subtitle.__zvWrapped = true;
            }

            artInstance.on('fullscreen', (state) => {
                syncDesktopAndMobileFullscreenClass(Boolean(state));
                if (!state && !artInstance.fullscreenWeb) setDrawerOpen(false);
            });
            artInstance.on('fullscreenWeb', (state) => {
                syncDesktopAndMobileFullscreenClass(Boolean(state));
                if (!state && !artInstance.fullscreen) setDrawerOpen(false);
            });
            artInstance.on('resize', () => {
                syncDesktopAndMobileFullscreenClass();
            });

            const onNativeFsChange = () => syncDesktopAndMobileFullscreenClass();
            document.addEventListener('fullscreenchange', onNativeFsChange);
            document.addEventListener('webkitfullscreenchange', onNativeFsChange);
            document.addEventListener('mozfullscreenchange', onNativeFsChange);
            window.addEventListener('resize', onNativeFsChange);
            window.addEventListener('orientationchange', onNativeFsChange);

            syncDesktopAndMobileFullscreenClass();

            window.zvFsSyncCleanup = () => {
                clearControlsAutoHideTimer();
                if (scrollSnapSettleTimer) clearTimeout(scrollSnapSettleTimer);
                if (subObserver) {
                    try { subObserver.disconnect(); } catch (_) {}
                    subObserver = null;
                }
                playerEl.removeEventListener('mousemove', onCaptureMouseMove, true);
                playerEl.removeEventListener('pointerdown', onControlInteractionReset);
                playerEl.removeEventListener('touchstart', onControlInteractionReset);
                document.removeEventListener('fullscreenchange', onNativeFsChange);
                document.removeEventListener('webkitfullscreenchange', onNativeFsChange);
                document.removeEventListener('mozfullscreenchange', onNativeFsChange);
                window.removeEventListener('resize', onNativeFsChange);
                window.removeEventListener('orientationchange', onNativeFsChange);
            };
        };

        mountFullscreenCardsOverlay();

        // Custom touch gestures, anti-capture shield, fullscreen video cards & click handling
        artInstance.on('ready', () => {
            if (artInstance.video) {
                artInstance.video.setAttribute('preload', 'metadata');
                artInstance.video.setAttribute('disablePictureInPicture', 'true');
                artInstance.video.setAttribute('controlsList', 'nodownload noplaybackrate');
                try { artInstance.video.disablePictureInPicture = true; } catch (_) {}
            }
            const playerEl = artInstance.template.$player;
            if (!playerEl) return;

            mountFullscreenCardsOverlay();
            renderFullscreenCards();

            // Restore fullscreenWeb or native fullscreen class if episode was switched while in fullscreen
            if (prevWasFullscreenWeb) {
                try { artInstance.fullscreenWeb = true; } catch (_) {}
                playerEl.classList.add('zv-is-fullscreen');
            }
            if (prevWasFullscreen && (document.fullscreenElement || document.webkitFullscreenElement)) {
                playerEl.classList.add('zv-is-fullscreen');
            }

            if (window.ZoneVaultCaptureShield) {
                window.ZoneVaultCaptureShield.protectPlayerContainer(playerEl, artInstance.video);
            }

            // Ensure clicking Artplayer's fullscreen button exits fullscreen cleanly even if #player-container holds native fullscreen
            playerEl.addEventListener('click', (e) => {
                const fsControlBtn = e.target.closest('.art-control-fullscreen');
                if (!fsControlBtn) return;
                const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
                const outerContainer = document.getElementById('player-container');
                if (fsEl && fsEl === outerContainer && fsEl !== playerEl) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (document.exitFullscreen) {
                        document.exitFullscreen().catch(() => {});
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    }
                }
            }, true);

            // Prevent screen touch-sliding gestures on video, while allowing touch scrolling inside Settings/Quality and Fullscreen Video Cards
            playerEl.addEventListener('touchmove', (e) => {
                if (
                    e.target.closest('.art-settings') ||
                    e.target.closest('.art-setting') ||
                    e.target.closest('.art-setting-panel') ||
                    e.target.closest('.zv-fs-cards-list') ||
                    e.target.closest('.zv-fs-cards-toggle')
                ) {
                    return;
                }
                if (!e.target.closest('.art-control-progress') || !isControlsVisible) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, { passive: false });

            let lastTapTime = 0;
            let lastTouchEndTime = 0;
            let singleTapTimer = null;

            const processTapLogic = (clientX) => {
                if (fsCardsListEl && fsCardsListEl.classList.contains('is-open')) {
                    setDrawerOpen(false);
                    return;
                }
                const rect = playerEl.getBoundingClientRect();
                const x = clientX - rect.left;
                const width = rect.width;
                const now = Date.now();
                const timeSinceLastTap = now - lastTapTime;

                if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
                    // DOUBLE TAP DETECTED
                    clearTimeout(singleTapTimer);

                    if (x < width * 0.35) {
                        // Double tap left: Rewind -10s
                        artInstance.currentTime = Math.max(0, artInstance.currentTime - 10);
                        triggerCustomAnimation('rewind', 'left');
                    } else if (x > width * 0.65) {
                        // Double tap right: Forward +10s
                        artInstance.currentTime = Math.min(artInstance.duration || Infinity, artInstance.currentTime + 10);
                        triggerCustomAnimation('forward', 'right');
                    } else {
                        // Double tap center: Play / Pause toggle
                        artInstance.toggle();
                        triggerCustomAnimation(artInstance.playing ? 'play' : 'pause', 'center');
                    }
                } else {
                    // SINGLE TAP DETECTED: Toggle controls
                    singleTapTimer = setTimeout(() => {
                        artInstance.controls.toggle();
                    }, 300);
                }
                lastTapTime = now;
            };

            playerEl.addEventListener('touchend', (e) => {
                lastTouchEndTime = Date.now();
                if (
                    e.target.closest('.art-controls') ||
                    e.target.closest('.art-settings') ||
                    e.target.closest('.art-setting') ||
                    e.target.closest('.art-setting-panel') ||
                    e.target.closest('.art-layer-lock') ||
                    e.target.closest('.zv-fs-cards-list') ||
                    e.target.closest('.zv-fs-cards-toggle') ||
                    (isControlsVisible && e.target.closest('.art-control-progress'))
                ) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                if (e.changedTouches && e.changedTouches.length > 0) {
                    processTapLogic(e.changedTouches[0].clientX);
                }
            });

            playerEl.addEventListener('click', (e) => {
                if (
                    e.target.closest('.art-controls') ||
                    e.target.closest('.art-settings') ||
                    e.target.closest('.art-setting') ||
                    e.target.closest('.art-setting-panel') ||
                    e.target.closest('.art-layer-lock') ||
                    e.target.closest('.zv-fs-cards-list') ||
                    e.target.closest('.zv-fs-cards-toggle') ||
                    (isControlsVisible && e.target.closest('.art-control-progress'))
                ) {
                    return;
                }
                if (Date.now() - lastTouchEndTime < 450) return;
                e.preventDefault();
                e.stopPropagation();
                processTapLogic(e.clientX);
            });
        });

        // Next Episode Button Layer (if enabled)
        if (hasLayers) {
            artInstance.layers.add({
                name: 'nextEpLayer',
                html: '<button type="button" class="next-ep-btn">Next Episode ⏭</button>',
                style: { display: 'none' }
            });
            const nextButton = artInstance.layers.nextEpLayer && artInstance.layers.nextEpLayer.querySelector('.next-ep-btn');
            if (nextButton) {
                nextButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (typeof onNextEpisode === 'function') {
                        onNextEpisode();
                    } else if (typeof window.playNextEpisodeGlobal === 'function') {
                        window.playNextEpisodeGlobal();
                    }
                });
            }

            // Skip Intro Button Layer
            artInstance.layers.add({
                name: 'skipIntroLayer',
                html: '<button type="button" class="skip-intro-btn">Skip Intro</button>',
                style: { display: 'none' }
            });
            const skipIntroButton = artInstance.layers.skipIntroLayer && artInstance.layers.skipIntroLayer.querySelector('.skip-intro-btn');
            if (skipIntroButton) {
                skipIntroButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (typeof onSkipIntro === 'function') {
                        onSkipIntro();
                    } else if (typeof window.skipIntroGlobal === 'function') {
                        window.skipIntroGlobal();
                    }
                });
            }
        }

        // Subtitles Track Selector (switches between cached in-memory Blob URLs with explicit vtt type)
        if (protectedSubtitles.length) {
            artInstance.setting.add({
                html: 'Subtitles',
                width: 200,
                selector: protectedSubtitles.map(s => ({ html: s.html, url: s.url, default: s.default })),
                onSelect(item) {
                    artInstance.subtitle.switch(item.url, { name: item.html, type: 'vtt' });
                    if (typeof window.zvSyncSubtitleSize === 'function') {
                        requestAnimationFrame(() => window.zvSyncSubtitleSize());
                    }
                    return item.html;
                }
            });
        }

        // Local-Only Subtitle Size, Subtitle Design & Subtitle Color Settings (saved in browser localStorage only)
        (function registerLocalSubtitleSettings() {
            const currentPrefs = (typeof window.zvGetUserSubtitlePrefs === 'function')
                ? window.zvGetUserSubtitlePrefs()
                : { size: 'auto', design: 'dark-box', color: '#ffffff' };

            const sizeChoices = [
                { value: 'auto', html: 'Auto (25 / 14 / 9px)' },
                { value: '9', html: '9px (Smaller Screen)' },
                { value: '12', html: '12px (Small)' },
                { value: '14', html: '14px (Phone FS)' },
                { value: '16', html: '16px (Medium)' },
                { value: '20', html: '20px (Large)' },
                { value: '25', html: '25px (Desktop)' },
                { value: '28', html: '28px (XL)' },
                { value: '32', html: '32px (Max)' }
            ];
            const activeSizeObj = sizeChoices.find(c => c.value === String(currentPrefs.size)) || sizeChoices[0];

            artInstance.setting.add({
                name: 'zvSubtitleSize',
                html: 'Subtitle Size',
                tooltip: activeSizeObj.html,
                width: 210,
                selector: sizeChoices.map(item => ({
                    html: item.html,
                    value: item.value,
                    default: item.value === activeSizeObj.value
                })),
                onSelect(item) {
                    if (typeof window.zvSaveUserSubtitlePrefs === 'function') {
                        window.zvSaveUserSubtitlePrefs({ size: item.value });
                    }
                    if (artInstance && artInstance.notice) {
                        artInstance.notice.show = `Subtitle Size: ${item.html}`;
                    }
                    return item.html;
                }
            });

            const designChoices = [
                { value: 'dark-box', html: 'Dark Box (Default)' },
                { value: 'soft-box', html: 'Soft Box (Lighter)' },
                { value: 'solid-box', html: 'Solid Black Box' },
                { value: 'glass-box', html: 'Glass Blur Box' },
                { value: 'outline', html: 'Black Outline' },
                { value: 'shadow', html: 'Drop Shadow' }
            ];
            const activeDesignObj = designChoices.find(c => c.value === currentPrefs.design) || designChoices[0];

            artInstance.setting.add({
                name: 'zvSubtitleDesign',
                html: 'Subtitle Design',
                tooltip: activeDesignObj.html,
                width: 210,
                selector: designChoices.map(item => ({
                    html: item.html,
                    value: item.value,
                    default: item.value === activeDesignObj.value
                })),
                onSelect(item) {
                    if (typeof window.zvSaveUserSubtitlePrefs === 'function') {
                        window.zvSaveUserSubtitlePrefs({ design: item.value });
                    }
                    if (artInstance && artInstance.notice) {
                        artInstance.notice.show = `Subtitle Design: ${item.html}`;
                    }
                    return item.html;
                }
            });

            const colorChoices = [
                { value: '#ffffff', html: 'White (Default)' },
                { value: '#ffd700', html: 'Yellow' },
                { value: '#38bdf8', html: 'Cyan' },
                { value: '#f472b6', html: 'Pink' },
                { value: '#4ade80', html: 'Mint Green' }
            ];
            const activeColorObj = colorChoices.find(c => c.value === currentPrefs.color) || colorChoices[0];

            artInstance.setting.add({
                name: 'zvSubtitleColor',
                html: 'Subtitle Color',
                tooltip: activeColorObj.html,
                width: 190,
                selector: colorChoices.map(item => ({
                    html: item.html,
                    value: item.value,
                    default: item.value === activeColorObj.value
                })),
                onSelect(item) {
                    if (typeof window.zvSaveUserSubtitlePrefs === 'function') {
                        window.zvSaveUserSubtitlePrefs({ color: item.value });
                    }
                    if (artInstance && artInstance.notice) {
                        artInstance.notice.show = `Subtitle Color: ${item.html}`;
                    }
                    return item.html;
                }
            });
        })();

        // Active Playlist Sync & 4-second control hide lifecycle on play/pause
        artInstance.on('play', () => {
            document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.remove('is-paused'));
            if (isControlsVisible) {
                scheduleControlsAutoHide();
            }
        });
        artInstance.on('pause', () => {
            document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.add('is-paused'));
            clearControlsAutoHideTimer();
        });

        // Timeupdate handler for Next Ep / Skip Intro / Watch History
        artInstance.on('video:timeupdate', () => {
            if (!artInstance || !window.currentEpData) return;
            const now = Date.now();

            if (hasLayers && artInstance.duration > 0 && artInstance.layers.nextEpLayer) {
                const currentIndex = playlistData.findIndex(item => item.id === window.currentEpData.id);
                const hasNext = currentIndex >= 0 && currentIndex < playlistData.length - 1;
                artInstance.layers.nextEpLayer.style.display = (artInstance.duration - artInstance.currentTime <= 60 && hasNext) ? 'block' : 'none';
            }

            if (hasLayers && window.introEndTime > 0 && artInstance.layers.skipIntroLayer) {
                if (!window.hasSkippedIntro && artInstance.currentTime > 0 && artInstance.currentTime < window.introEndTime) {
                    artInstance.layers.skipIntroLayer.style.display = 'block';
                } else {
                    artInstance.layers.skipIntroLayer.style.display = 'none';
                }
            }

            if (typeof onTimeUpdate === 'function') {
                try {
                    onTimeUpdate(artInstance);
                } catch (e) {
                    console.error('onTimeUpdate callback error:', e);
                }
            }

            if (auth && auth.currentUser && db && historyKey && !artInstance.video.paused && (!lastSavedHistory || now - lastSavedHistory > 5000)) {
                const historyData = {
                    id: window.currentEpData.id,
                    title: window.currentEpData.title,
                    image: window.currentEpData.image,
                    currentTime: Number(artInstance.currentTime) || 0,
                    duration: Number(artInstance.duration) || 0,
                    timestamp: now,
                    page: pageIdentifier
                };
                db.ref(`watchHistory/${auth.currentUser.uid}/${historyKey}`).update(historyData)
                    .catch(error => console.error('Watch history save failed:', error));
                lastSavedHistory = now;
            }
        });

        // Loaded metadata callback
        if (typeof onLoadedMetadata === 'function') {
            artInstance.once('video:loadedmetadata', () => {
                onLoadedMetadata(artInstance);
            });
        }

        // Resume from Firebase watchHistory (for standard VOD)
        if (resumeFromHistory) {
            let saved = null;
            if (auth && auth.currentUser && db && historyKey) {
                try {
                    saved = (await db.ref(`watchHistory/${auth.currentUser.uid}/${historyKey}`).once('value')).val();
                } catch (error) {
                    console.error('Watch history read failed:', error);
                }
            }

            if (getCurrentLoadToken() !== loadToken || !window.art) return artInstance;

            const resume = () => {
                if (getCurrentLoadToken() !== loadToken || !artInstance) return;
                if (saved && Number(saved.currentTime) > 0 && Number(saved.currentTime) < (artInstance.duration || Infinity)) {
                    artInstance.currentTime = Number(saved.currentTime);
                    if (saved.currentTime > (window.introEndTime || 0)) {
                        window.hasSkippedIntro = true;
                    }
                    artInstance.notice.show = `Resumed from ${formatTime(saved.currentTime)}`;
                }
                artInstance.play().catch(() => {});
            };

            if (artInstance.video && artInstance.video.readyState >= 1) {
                resume();
            } else {
                artInstance.once('video:loadedmetadata', resume);
            }
        }

        return artInstance;
    }
    window.initZoneVideoPlayer = initZoneVideoPlayer;

    // =========================================
    // PLAYER-ONLY INSTANT BLACK-FLASH SHIELD
    // (Blackouts ONLY the video player on capture;
    //  audio & video keep playing continuously)
    // =========================================
    if (!window.ZoneVaultCaptureShield) {
        const shieldModule = {
            isShieldActive: false,
            isDisplayMediaActive: false,
            restoreTimer: null,
            chordHeld: false,

            ensureStyleInjected: function () {
                if (document.getElementById('zv-capture-shield-inline-style')) return;
                const style = document.createElement('style');
                style.id = 'zv-capture-shield-inline-style';
                style.textContent = `
                    .zv-player-blackout-shield {
                        position: absolute !important;
                        inset: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        background-color: #000000 !important;
                        z-index: 99998 !important;
                        pointer-events: none !important;
                        opacity: 0;
                        visibility: hidden;
                        transition: opacity 0.16s ease-out, visibility 0.16s ease-out;
                    }
                    .zv-player-blackout-active .zv-player-blackout-shield,
                    .zv-player-blackout-shield.is-active {
                        opacity: 1 !important;
                        visibility: visible !important;
                        transition: none !important;
                    }
                    .zv-player-blackout-active video,
                    video.zv-video-frame-blackout {
                        filter: brightness(0) contrast(0) !important;
                        -webkit-filter: brightness(0) contrast(0) !important;
                        transition: none !important;
                    }
                    .zv-player-blackout-active .art-subtitle,
                    .zv-player-blackout-active .art-danmuku,
                    .zv-player-blackout-active .art-layers {
                        opacity: 0 !important;
                        transition: none !important;
                    }
                `;
                (document.head || document.documentElement).appendChild(style);
            },

            getPlayerTargets: function () {
                const containers = new Set();
                const videos = new Set();

                document.querySelectorAll('.art-video-player, #artplayer, #player-container, #tvPlayer, .player-wrapper').forEach(el => {
                    containers.add(el);
                });
                document.querySelectorAll('video').forEach(v => {
                    videos.add(v);
                    if (v.parentElement) containers.add(v.parentElement);
                });

                return {
                    containers: Array.from(containers),
                    videos: Array.from(videos)
                };
            },

            protectPlayerContainer: function (containerEl, videoEl) {
                this.ensureStyleInjected();
                if (containerEl) {
                    const computed = window.getComputedStyle(containerEl);
                    if (computed.position === 'static') {
                        containerEl.style.position = 'relative';
                    }
                    if (!containerEl.querySelector('.zv-player-blackout-shield')) {
                        const shield = document.createElement('div');
                        shield.className = 'zv-player-blackout-shield';
                        shield.setAttribute('aria-hidden', 'true');
                        containerEl.appendChild(shield);
                    }
                    containerEl.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                    });
                }
                if (videoEl) {
                    videoEl.setAttribute('disablePictureInPicture', 'true');
                    videoEl.setAttribute('controlsList', 'nodownload noplaybackrate');
                    try { videoEl.disablePictureInPicture = true; } catch (_) {}
                    videoEl.addEventListener('enterpictureinpicture', () => {
                        if (document.exitPictureInPicture) {
                            document.exitPictureInPicture().catch(() => {});
                        }
                    });
                }
            },

            engageBlackout: function (durationMs) {
                this.ensureStyleInjected();
                if (this.restoreTimer) {
                    clearTimeout(this.restoreTimer);
                    this.restoreTimer = null;
                }

                this.isShieldActive = true;
                const { containers, videos } = this.getPlayerTargets();

                containers.forEach(c => {
                    this.protectPlayerContainer(c, null);
                    c.classList.add('zv-player-blackout-active');
                    const shield = c.querySelector('.zv-player-blackout-shield');
                    if (shield) shield.classList.add('is-active');
                });

                videos.forEach(v => {
                    v.classList.add('zv-video-frame-blackout');
                });

                if (typeof durationMs === 'number' && durationMs > 0 && !this.isDisplayMediaActive) {
                    this.restoreTimer = setTimeout(() => {
                        if (!this.chordHeld && !this.isDisplayMediaActive && document.hasFocus()) {
                            this.releaseBlackout();
                        }
                    }, durationMs);
                }
            },

            releaseBlackout: function () {
                if (this.isDisplayMediaActive) return;
                if (this.restoreTimer) {
                    clearTimeout(this.restoreTimer);
                    this.restoreTimer = null;
                }
                this.isShieldActive = false;
                document.querySelectorAll('.zv-player-blackout-active').forEach(el => {
                    el.classList.remove('zv-player-blackout-active');
                });
                document.querySelectorAll('.zv-player-blackout-shield.is-active').forEach(el => {
                    el.classList.remove('is-active');
                });
                document.querySelectorAll('video.zv-video-frame-blackout').forEach(v => {
                    v.classList.remove('zv-video-frame-blackout');
                });
            },

            clearClipboardIfPossible: function () {
                try {
                    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                        navigator.clipboard.writeText('').catch(() => {});
                    }
                } catch (_) {}
            },

            initGlobalHooks: function () {
                const self = this;
                this.ensureStyleInjected();

                // 1. Lock HTMLVideoElement.captureStream so browser extensions cannot record video frames
                if (typeof HTMLVideoElement !== 'undefined' && HTMLVideoElement.prototype) {
                    const blockCaptureStream = function () {
                        self.engageBlackout(900);
                        throw new DOMException('Video stream capture is disabled on Zone Vault.', 'NotAllowedError');
                    };
                    try {
                        HTMLVideoElement.prototype.captureStream = blockCaptureStream;
                        HTMLVideoElement.prototype.mozCaptureStream = blockCaptureStream;
                    } catch (_) {}
                }

                // 2. Lock Canvas drawImage when source is a <video> element (returns solid black frame in canvas screenshots)
                if (typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype.drawImage) {
                    const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
                    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
                        if (img && typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement) {
                            self.engageBlackout(750);
                            try {
                                this.save();
                                this.fillStyle = '#000000';
                                this.fillRect(0, 0, this.canvas ? this.canvas.width : 1920, this.canvas ? this.canvas.height : 1080);
                                this.restore();
                            } catch (_) {}
                            return;
                        }
                        return origDrawImage.call(this, img, ...rest);
                    };
                }

                // 3. Intercept browser tab/screen sharing (getDisplayMedia)
                if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
                    const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
                    navigator.mediaDevices.getDisplayMedia = async function (...args) {
                        self.isDisplayMediaActive = true;
                        self.engageBlackout(0);
                        try {
                            const stream = await origGetDisplayMedia(...args);
                            stream.getTracks().forEach(track => {
                                track.addEventListener('ended', () => {
                                    self.isDisplayMediaActive = false;
                                    self.releaseBlackout();
                                });
                            });
                            return stream;
                        } catch (err) {
                            self.isDisplayMediaActive = false;
                            self.releaseBlackout();
                            throw err;
                        }
                    };
                }

                // 4. Instant keydown / keyup screenshot & pre-chord detection (0ms activation)
                const isScreenshotKey = (e) => {
                    const key = (e.key || '').toLowerCase();
                    const code = (e.code || '').toLowerCase();
                    if (key === 'printscreen' || code === 'printscreen' || e.keyCode === 44) return true;
                    // macOS Cmd+Shift+3 / 4 / 5 / 6 or Windows Win+Shift+S
                    if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', '6', 's', 'p'].includes(key)) return true;
                    if (e.metaKey && e.shiftKey) return true;
                    return false;
                };

                window.addEventListener('keydown', (e) => {
                    if (isScreenshotKey(e)) {
                        self.chordHeld = true;
                        self.engageBlackout(850);
                        if ((e.key || '').toLowerCase() === 'printscreen' || e.keyCode === 44) {
                            self.clearClipboardIfPossible();
                        }
                    }
                }, true);

                window.addEventListener('keyup', (e) => {
                    const key = (e.key || '').toLowerCase();
                    const code = (e.code || '').toLowerCase();
                    if (key === 'printscreen' || code === 'printscreen' || e.keyCode === 44) {
                        self.chordHeld = false;
                        self.engageBlackout(850);
                        self.clearClipboardIfPossible();
                        return;
                    }
                    if (!e.metaKey && !e.shiftKey) {
                        self.chordHeld = false;
                        if (self.isShieldActive && document.hasFocus()) {
                            self.engageBlackout(450);
                        }
                    }
                }, true);

                // 5. Snipping Tool / OS Capture Overlay window blur (video & audio keep playing continuously!)
                window.addEventListener('blur', () => {
                    self.engageBlackout(0);
                });

                window.addEventListener('focus', () => {
                    self.chordHeld = false;
                    self.releaseBlackout();
                });

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'hidden') {
                        self.engageBlackout(0);
                    } else if (document.hasFocus()) {
                        self.releaseBlackout();
                    }
                });

                // Restore immediately if user interacts with the page after snipping tool closes
                ['pointerdown', 'mousedown', 'touchstart'].forEach(evt => {
                    window.addEventListener(evt, () => {
                        if (!self.chordHeld && !self.isDisplayMediaActive) {
                            self.releaseBlackout();
                        }
                    }, { passive: true });
                });
            }
        };

        shieldModule.initGlobalHooks();
        window.ZoneVaultCaptureShield = shieldModule;
    }

    // Global keyboard shortcuts (once per page)
    if (!window.__zonePlayerShortcutsAttached) {
        window.__zonePlayerShortcutsAttached = true;
        document.addEventListener('keydown', (e) => {
            const playerInstance = window.art;
            if (!playerInstance) return;

            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (activeTag === 'input' || activeTag === 'textarea') return;

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    playerInstance.currentTime = Math.max(0, playerInstance.currentTime - 10);
                    triggerCustomAnimation('rewind', 'left');
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    playerInstance.currentTime = Math.min(playerInstance.duration || Infinity, playerInstance.currentTime + 10);
                    triggerCustomAnimation('forward', 'right');
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    if (document.fullscreenElement || document.webkitFullscreenElement) {
                        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                    } else {
                        playerInstance.fullscreen = !playerInstance.fullscreen;
                    }
                    break;
                case 'm':
                case 'M':
                    e.preventDefault();
                    playerInstance.muted = !playerInstance.muted;
                    playerInstance.notice.show = playerInstance.muted ? 'Muted' : 'Unmuted';
                    break;
            }
        });
    }

})();

