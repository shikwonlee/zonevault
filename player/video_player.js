/**
 * =========================================
 * ZONE VAULT — Centralized Video Player Module
 * Location: /player/video_player.js
 * =========================================
 */

(function () {
    'use strict';

    // Global artplayer reference
    window.art = window.art || null;
    window.currentSubtitleUrls = window.currentSubtitleUrls || [];

    /**
     * Clean up existing player and HLS streams
     */
    function cleanupPlayer() {
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

    // Global Zone Vault Stream Manager with Rolling Token Refresh
    window.ZoneVaultStream = window.ZoneVaultStream || {
        activeSession: null,
        getActiveToken: function () {
            return this.activeSession ? this.activeSession.token : null;
        },
        updateTokenInUrl: function (url) {
            const token = this.getActiveToken();
            if (!token || !url) return url;
            if (url.includes('/api/stream/') || url.includes('/api/stream-proxy')) {
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

        // Resilient token fetcher supporting POST, GET, Cloudflare Workers, and client-fallback signing
        async function fetchStreamTicket(params) {
            const epId = params.epId || 'video';
            const uid = params.uid || '';
            const displayName = params.displayName || 'Zone Vault Member';
            const role = params.role || 'member';
            const targetUrl = params.targetUrl || '';
            const idToken = params.idToken;

            const queryParams = new URLSearchParams({
                epId: epId,
                uid: uid,
                displayName: displayName,
                role: role,
                targetUrl: targetUrl
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
                            idToken: idToken
                        });
                    }

                    const resp = await fetch(item.url, fetchOpts);
                    if (resp.status === 401 || resp.status === 403) {
                        return { ok: false, status: resp.status };
                    }
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && (data.token || data.proxyUrl)) {
                            return { ok: true, data: data };
                        }
                    }
                } catch (_) {}
            }

            // Client-side fallback token generation (ensures proxyUrl is still used)
            try {
                const nowSec = Math.floor(Date.now() / 1000);
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
                    exp: nowSec + 180,
                    expiresAt: Date.now() + 180000
                };
                const tokenStr = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
                    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
                const b64Target = btoa(unescape(encodeURIComponent(targetUrl)))
                    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

                return {
                    ok: true,
                    data: {
                        token: tokenStr,
                        proxyUrl: targetUrl ? `/api/stream-proxy.m3u8?token=${encodeURIComponent(tokenStr)}&u=${encodeURIComponent(b64Target)}` : null,
                        expiresAt: Date.now() + 180000,
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
                // If auth is still pending or restoring, hook onAuthStateChanged so it auto-recovers
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

                // Silent background rolling token refresher (every 2 minutes / 120 seconds, TTL is 3 minutes)
                if (window.zoneVaultRollingTimer) clearInterval(window.zoneVaultRollingTimer);
                window.zoneVaultRollingTimer = setInterval(async () => {
                    try {
                        const session = window.ZoneVaultStream.activeSession;
                        if (!session || !window.art) return;
                        let freshIdToken = null;
                        if (auth && auth.currentUser) {
                            try { freshIdToken = await auth.currentUser.getIdToken(); } catch (_) {}
                        }
                        const refreshed = await fetchStreamTicket({
                            epId: session.epId,
                            uid: session.uid,
                            displayName: session.displayName,
                            role: session.role,
                            targetUrl: session.targetUrl,
                            idToken: freshIdToken
                        });
                        if (refreshed && refreshed.ok && refreshed.data && refreshed.data.token) {
                            session.token = refreshed.data.token;
                        }
                    } catch (err) {
                        console.warn('Rolling token refresh note:', err);
                    }
                }, 120000);
            }
        } catch (e) {
            console.warn('Stream token validation note:', e);
        }

        const defaultSubtitle = subtitles.find(s => s.default) || subtitles[0];
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
            miniProgressBar: true,
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
                encoding: 'utf-8'
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
                            if (targetUrl.startsWith('/api/') || targetUrl.startsWith('/stream-') || targetUrl.startsWith('/stream/')) return true;
                            try {
                                const parsed = new URL(targetUrl, window.location.origin);
                                return parsed.origin === window.location.origin && (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/stream-') || parsed.pathname.startsWith('/stream/'));
                            } catch (_) {
                                return false;
                            }
                        };

                        const hlsConfig = {
                            ...(typeof startPosition === 'number' && startPosition > 0 ? { startPosition: startPosition } : {}),
                            xhrSetup: function (xhr, reqUrl) {
                                if (!isProxyEndpoint(reqUrl)) return;
                                const currentTok = window.ZoneVaultStream.getActiveToken();
                                if (currentTok) {
                                    try {
                                        xhr.setRequestHeader('X-Stream-Token', currentTok);
                                    } catch (_) {}
                                }
                                try {
                                    xhr.setRequestHeader('X-ZV-Player', 'web-artplayer');
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
                        video.src = url;
                    }
                }
            }
        };

        const artInstance = new Artplayer(artOptions);
        window.art = artInstance;

        // Custom touch gestures, anti-capture shield & click handling
        artInstance.on('ready', () => {
            if (artInstance.video) {
                artInstance.video.setAttribute('preload', 'metadata');
                artInstance.video.setAttribute('disablePictureInPicture', 'true');
                artInstance.video.setAttribute('controlsList', 'nodownload noplaybackrate');
                try { artInstance.video.disablePictureInPicture = true; } catch (_) {}
            }
            const playerEl = artInstance.template.$player;
            if (!playerEl) return;

            if (window.ZoneVaultCaptureShield) {
                window.ZoneVaultCaptureShield.protectPlayerContainer(playerEl, artInstance.video);
            }

            // Prevent screen touch-sliding gestures completely
            playerEl.addEventListener('touchmove', (e) => {
                if (!e.target.closest('.art-control-progress')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, { passive: false });

            let lastTapTime = 0;
            let singleTapTimer = null;

            const processTapLogic = (clientX) => {
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
                if (e.target.closest('.art-controls') || e.target.closest('.art-setting') || e.target.closest('.art-setting-panel')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                if (e.changedTouches && e.changedTouches.length > 0) {
                    processTapLogic(e.changedTouches[0].clientX);
                }
            });

            playerEl.addEventListener('click', (e) => {
                if (e.target.closest('.art-controls') || e.target.closest('.art-setting') || e.target.closest('.art-setting-panel')) {
                    return;
                }
                if ('ontouchstart' in window) return;
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

        // Subtitles Selector
        if (subtitles.length) {
            artInstance.setting.add({
                html: 'Subtitles',
                width: 200,
                selector: subtitles.map(s => ({ html: s.html, url: s.url, default: s.default })),
                onSelect(item) {
                    artInstance.subtitle.switch(item.url, { name: item.html });
                    return item.html;
                }
            });
        }

        // Active Playlist Sync
        artInstance.on('play', () => {
            document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.remove('is-paused'));
        });
        artInstance.on('pause', () => {
            document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.add('is-paused'));
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
                    playerInstance.fullscreen = !playerInstance.fullscreen;
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

