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

        const defaultSubtitle = subtitles.find(s => s.default) || subtitles[0];
        let lastSavedHistory = null;

        const artOptions = {
            container: container,
            url: data.url || '',
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
                'x5-video-player-type': 'h5',
                'x5-video-player-fullscreen': 'true',
                'x5-video-orientation': 'landscape'
            },
            customType: {
                m3u8(video, url, instance) {
                    if (video) video.preload = 'metadata';
                    if (instance && instance.hls) instance.hls.destroy();
                    if (window.Hls && Hls.isSupported()) {
                        const hlsConfig = (typeof startPosition === 'number' && startPosition > 0)
                            ? { startPosition: startPosition }
                            : {};
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

        // Custom touch gestures & click handling
        artInstance.on('ready', () => {
            if (artInstance.video) {
                artInstance.video.setAttribute('preload', 'metadata');
            }
            const playerEl = artInstance.template.$player;
            if (!playerEl) return;

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
