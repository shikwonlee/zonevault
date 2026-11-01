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

                const resp = await fetch('/api/stream-token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
                    },
                    body: JSON.stringify({
                        epId: epId || 'live-broadcast',
                        uid: uid,
                        displayName: displayName,
                        role: userRole || 'member',
                        targetUrl: streamUrl,
                        idToken: idToken
                    })
                });

                if (resp.ok) {
                    const ticket = await resp.json();
                    if (ticket && ticket.proxyUrl) {
                        this.activeToken = ticket.token;

                        // Rolling token refresh every 40 seconds (TTL is 60s)
                        this.timer = setInterval(async () => {
                            try {
                                let freshId = null;
                                if (typeof auth !== 'undefined' && auth.currentUser) {
                                    try { freshId = await auth.currentUser.getIdToken(); } catch (_) {}
                                }
                                const r = await fetch('/api/stream-token', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        ...(freshId ? { 'Authorization': `Bearer ${freshId}` } : {})
                                    },
                                    body: JSON.stringify({
                                        epId: epId || 'live-broadcast',
                                        uid: uid,
                                        displayName: displayName,
                                        role: userRole || 'member',
                                        targetUrl: streamUrl,
                                        idToken: freshId
                                    })
                                });
                                if (r.ok) {
                                    const refreshed = await r.json();
                                    if (refreshed && refreshed.token) {
                                        this.activeToken = refreshed.token;
                                    }
                                }
                            } catch (_) {}
                        }, 40000);

                        return ticket.proxyUrl;
                    }
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
