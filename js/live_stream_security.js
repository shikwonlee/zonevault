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
            const config = {
                xhrSetup: function (xhr, url) {
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
})();
