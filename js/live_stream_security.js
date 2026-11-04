/**
 * ZONE VAULT — Live Stream Security & Rolling Token Manager
 * Location: /js/live_stream_security.js
 */
(function () {
    'use strict';

    window.ZoneVaultLive = {
        activeToken: null,
        timer: null,
        acquireProxyUrl: async function (streamUrl, epId, userRole) {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            if (!streamUrl) return streamUrl;
            try {
                let idToken = null;
                let uid = null;
                let displayName = 'Live Stream Viewer';
                if (typeof auth !== 'undefined' && auth.currentUser) {
                    uid = auth.currentUser.uid;
                    displayName = auth.currentUser.displayName || auth.currentUser.email || 'Zone Vault Member';
                    try { idToken = await auth.currentUser.getIdToken(); } catch (_) {}
                }

                async function fetchLiveTicket(p) {
                    const q = new URLSearchParams({
                        epId: p.epId,
                        uid: p.uid || '',
                        displayName: p.displayName || '',
                        role: p.role || 'member',
                        targetUrl: p.targetUrl || ''
                    });
                    const endpoints = [
                        { url: '/api/stream-token', method: 'POST' },
                        { url: `/api/stream-token?${q.toString()}`, method: 'GET' },
                        { url: '/stream-token', method: 'POST' },
                        { url: `/stream-token?${q.toString()}`, method: 'GET' },
                        { url: '/api/stream/token', method: 'POST' },
                        { url: `/api/stream/token?${q.toString()}`, method: 'GET' }
                    ];
                    for (const item of endpoints) {
                        try {
                            const opts = {
                                method: item.method,
                                headers: {
                                    ...(item.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
                                    ...(p.idToken ? { 'Authorization': `Bearer ${p.idToken}` } : {})
                                }
                            };
                            if (item.method === 'POST') {
                                opts.body = JSON.stringify(p);
                            }
                            const res = await fetch(item.url, opts);
                            if (res.ok) {
                                const d = await res.json();
                                if (d && (d.token || d.proxyUrl)) return d;
                            }
                        } catch (_) {}
                    }
                    return null;
                }

                const ticket = await fetchLiveTicket({
                    epId: epId || 'live-broadcast',
                    uid: uid,
                    displayName: displayName,
                    role: userRole || 'member',
                    targetUrl: streamUrl,
                    idToken: idToken
                });

                if (ticket && (ticket.token || ticket.proxyUrl)) {
                    this.activeToken = ticket.token;

                    // Rolling token refresh every 2 minutes / 120 seconds (TTL is 3 minutes / 180s)
                    this.timer = setInterval(async () => {
                        try {
                            let freshId = null;
                            if (typeof auth !== 'undefined' && auth.currentUser) {
                                try { freshId = await auth.currentUser.getIdToken(); } catch (_) {}
                            }
                            const refreshed = await fetchLiveTicket({
                                epId: epId || 'live-broadcast',
                                uid: uid,
                                displayName: displayName,
                                role: userRole || 'member',
                                targetUrl: streamUrl,
                                idToken: freshId
                            });
                            if (refreshed && refreshed.token) {
                                this.activeToken = refreshed.token;
                            }
                        } catch (_) {}
                    }, 120000);

                    return ticket.proxyUrl || streamUrl;
                }
            } catch (e) {
                console.warn('Live stream token handshake note:', e);
            }
            return streamUrl;
        },
        createHlsConfig: function () {
            const self = this;
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
            const config = {
                xhrSetup: function (xhr, url) {
                    if (!isProxyEndpoint(url)) return;
                    if (self.activeToken) {
                        try { xhr.setRequestHeader('X-Stream-Token', self.activeToken); } catch (_) {}
                    }
                    try {
                        xhr.setRequestHeader('X-ZV-Player', 'web-artplayer');
                        xhr.setRequestHeader('X-Requested-With', 'ZoneVaultPlayer');
                    } catch (_) {}
                }
            };
            if (window.Hls && Hls.DefaultConfig && Hls.DefaultConfig.loader) {
                class LiveTokenLoader extends Hls.DefaultConfig.loader {
                    load(context, conf, callbacks) {
                        if (context && context.url && self.activeToken && (context.url.includes('/api/stream/') || context.url.includes('/api/stream-proxy'))) {
                            context.url = context.url.replace(/([?&](?:token|t)=)[^&]*/, `$1${encodeURIComponent(self.activeToken)}`);
                        }
                        super.load(context, conf, callbacks);
                    }
                }
                config.fLoader = LiveTokenLoader;
                config.pLoader = LiveTokenLoader;
            }
            return config;
        },
        destroy: function () {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            this.activeToken = null;
        }
    };

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
                    if (!containerEl.__zvContextBound) {
                        containerEl.__zvContextBound = true;
                        containerEl.addEventListener('contextmenu', (e) => {
                            e.preventDefault();
                        });
                    }
                }
                if (videoEl && !videoEl.__zvProtected) {
                    videoEl.__zvProtected = true;
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
                    this.protectPlayerContainer(v.parentElement, v);
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

                const isScreenshotKey = (e) => {
                    const key = (e.key || '').toLowerCase();
                    const code = (e.code || '').toLowerCase();
                    if (key === 'printscreen' || code === 'printscreen' || e.keyCode === 44) return true;
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

                ['pointerdown', 'mousedown', 'touchstart'].forEach(evt => {
                    window.addEventListener(evt, () => {
                        if (!self.chordHeld && !self.isDisplayMediaActive) {
                            self.releaseBlackout();
                        }
                    }, { passive: true });
                });

                const attachExistingPlayers = () => {
                    const { containers, videos } = self.getPlayerTargets();
                    containers.forEach(c => self.protectPlayerContainer(c, null));
                    videos.forEach(v => self.protectPlayerContainer(v.parentElement, v));
                };

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', attachExistingPlayers);
                } else {
                    attachExistingPlayers();
                }
            }
        };

        shieldModule.initGlobalHooks();
        window.ZoneVaultCaptureShield = shieldModule;
    }
})();

