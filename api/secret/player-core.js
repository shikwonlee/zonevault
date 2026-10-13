// ========================================================
// Zone Vault — Unified Secure Player Engine (api/secret/player-core.js)
// Standardizes video playback, m3u8 streams, subtitles,
// permissions, and gesture controls across all concert folders.
// ========================================================

(function(window) {
  'use strict';

  // 1. Session Cache Pre-check for 0ms startup
  try {
    const raw = localStorage.getItem("zone_vault_user_cache");
    if (raw) {
      const u = JSON.parse(raw);
      if (u && (u.status === "approved" || u.isAdmin || u.role === "admin")) {
        sessionStorage.setItem("internalAccess", "true");
        localStorage.setItem("internalAccess", "true");
        if (u.isAdmin || u.role === "admin") {
          sessionStorage.setItem("isAdmin", "true");
          localStorage.setItem("isAdmin", "true");
        }
      }
    }
  } catch(e) {}

  // 2. Global Google Analytics / GTag
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-1B2RJ659GL');

  // 3. Theme Engine Sync
  function applyTheme(theme) {
    const isLight = (theme === 'light' || theme === '#ffffff' || theme === 'white');
    if (isLight) {
      document.documentElement.classList.add('light-mode');
      if (document.body) document.body.classList.add('light-mode');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#f8f9fa');
    } else {
      document.documentElement.classList.remove('light-mode');
      if (document.body) document.body.classList.remove('light-mode');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#0a0a0c');
    }
  }

  const savedTheme = localStorage.getItem('zoneTheme') || localStorage.getItem('zoneVaultTheme');
  if (savedTheme) { 
    applyTheme(savedTheme); 
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) { 
    applyTheme('light'); 
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'zoneTheme' || e.key === 'zoneVaultTheme') { applyTheme(e.newValue); }
  });

  // 4. Central Firebase Compat Initializer
  let authInstance = null;
  let dbInstance = null;

  function ensureFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase Compat SDK not loaded yet.');
      return { auth: null, db: null };
    }
    if (!firebase.apps.length) {
      let cfg = null;
      try {
        const cached = sessionStorage.getItem('__zv_cfg');
        if (cached) cfg = JSON.parse(cached);
      } catch(e) {}

      if (!cfg) {
        cfg = {
          apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
          authDomain: "tvnstream-b4497.firebaseapp.com",
          databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
          projectId: "tvnstream-b4497",
          storageBucket: "tvnstream-b4497.appspot.com",
          messagingSenderId: "308384754214",
          appId: "1:308384754214:web:2938e76cd29b288f75d4e7"
        };
      }
      firebase.initializeApp(cfg);
    }

    if (!authInstance) authInstance = firebase.auth();
    if (!dbInstance) dbInstance = firebase.database();
    return { auth: authInstance, db: dbInstance };
  }

  // 5. ZonePlayer Engine Object
  const ZonePlayer = {
    config: null,
    art: null,
    currentEpData: null,
    currentSubBlobUrls: [],
    redirectTimer: null,

    init: function(userConfig) {
      this.config = Object.assign({
        pageId: '',
        dbNode: '',
        playlist: [],
        theme: '#a1a1aa',
        allowDirectFallback: true
      }, userConfig);

      const { auth, db } = ensureFirebase();

      // Setup DOM references
      const playlistContainer = document.getElementById('playlist-items');
      const posterContainer = document.getElementById('poster-container');

      // Bind initial poster thumbnail if present in config or first playlist item
      if (posterContainer) {
        const fallbackPoster = 'https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png';
        const candidatePoster = this.config.poster || (this.config.playlist && this.config.playlist[0] && this.config.playlist[0].image);
        const initialPoster = candidatePoster || fallbackPoster;
        posterContainer.style.backgroundImage = `url("${initialPoster.replace(/"/g, '\\"')}")`;

        if (candidatePoster && candidatePoster !== fallbackPoster) {
          const testImg = new Image();
          testImg.onerror = () => {
            posterContainer.style.backgroundImage = `url("${fallbackPoster}")`;
          };
          testImg.src = candidatePoster;
        }

        posterContainer.addEventListener('click', () => {
          if (this.config.playlist && this.config.playlist.length > 0) {
            this.loadAndPlayEpisode(this.config.playlist[0].id, true);
          }
        });
      }

      this.renderPlaylist();

      // Check URL parameters for specific episode
      const urlParams = new URLSearchParams(window.location.search);
      const requestedId = urlParams.get('v') || urlParams.get('ep') || urlParams.get('id');
      if (requestedId && this.config.playlist.some(p => p.id === requestedId)) {
        this.loadAndPlayEpisode(requestedId, false);
      }

      // Authentication & Permission Verification
      if (auth && db) {
        auth.onAuthStateChanged(user => {
          const cachedUserObj = (function(){ 
            try { return JSON.parse(localStorage.getItem("zone_vault_user_cache")); } catch(e){ return null; } 
          })();

          const hasPageRestriction = Boolean(this.config.pageId && typeof this.config.pageId === 'string' && this.config.pageId.trim() !== "");

          // 1. FREE ACCESS: Pages without pageId have free access
          if (!hasPageRestriction) {
            this.removeAccessDeniedModal();
            return;
          }

          // 2. RESTRICTED ACCESS: Required page_access/<pageId>/<uid> permission
          if (!user && !(cachedUserObj && (cachedUserObj.status === "approved" || cachedUserObj.isAdmin))) {
            this.showAccessDeniedModal("Your account does not have the required permissions to access this video. If you believe this is a mistake, please contact the administrator for assistance.");
            return;
          }

          if (user) {
            db.ref('users/' + user.uid).once('value').then(snapshot => {
              const userData = snapshot.val() || {};
              const role = (userData.role || 'member').toLowerCase();

              if (role === 'admin' || userData.isAdmin === true || (cachedUserObj && cachedUserObj.isAdmin)) {
                this.removeAccessDeniedModal();
                const toast = document.getElementById('adminToast');
                if (toast) {
                  toast.classList.add('show');
                  setTimeout(() => toast.classList.remove('show'), 4000);
                }
              } else {
                const accessKey = this.config.pageId.trim();
                db.ref(`page_access/${accessKey}/${user.uid}`).on('value', (accessSnapshot) => {
                  const isAllowed = accessSnapshot.val();
                  if (isAllowed === true) {
                    this.removeAccessDeniedModal();
                  } else {
                    this.showAccessDeniedModal("Your account does not have the required permissions to access this video. If you believe this is a mistake, please contact the administrator for assistance.");
                  }
                });
              }
            });
          }
        });
      }
    },

    renderPlaylist: function() {
      const container = document.getElementById('playlist-items');
      if (!container || !this.config.playlist) return;

      container.innerHTML = '';
      const fallbackImg = 'https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png';
      this.config.playlist.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'playlist-item';
        div.dataset.id = item.id;
        const imgUrl = item.image || this.config.poster || fallbackImg;
        div.innerHTML = `
          <div class="playlist-img-wrapper">
            <img src="${imgUrl}" alt="${item.title}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackImg}';">
            <span class="playlist-index">${index + 1}</span>
          </div>
          <div class="playlist-info">
            <div class="playlist-title">${item.title}</div>
          </div>
        `;
        div.addEventListener('click', () => {
          this.loadAndPlayEpisode(item.id, true);
        });
        container.appendChild(div);
      });
    },

    loadAndPlayEpisode: async function(epId, updateUrl) {
      if (!this.config) return;

      const ep = this.config.playlist.find(item => item.id === String(epId));
      if (!ep) return;

      if (updateUrl) {
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('v', ep.id);
        urlParams.set('session', Date.now());
        history.pushState({ id: ep.id }, '', window.location.pathname + '?' + urlParams.toString());
      }

      this.currentEpData = ep;
      window.currentEpData = ep;
      window.introEndTime = ep.introEnd || 0;
      window.hasSkippedIntro = false;

      const posterContainer = document.getElementById('poster-container');
      const playerContainer = document.getElementById('player-container');
      const mainTitle = document.getElementById('main-title');

      if (posterContainer) posterContainer.style.display = "none";
      if (playerContainer) playerContainer.style.display = "block";
      if (mainTitle) mainTitle.innerText = ep.title;

      // Update active state in playlist UI
      document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('active', 'is-paused');
        if (item.dataset.id === String(epId)) item.classList.add('active');
      });

      // 1. Resolve Stream Data (via Protected Server Endpoint or Direct config)
      let streamData = null;

      if (ep.url || this.config.videoUrl) {
        streamData = {
          url: ep.url || this.config.videoUrl,
          title: ep.title,
          subtitles: ep.subtitles || null,
          introEnd: ep.introEnd || 0
        };
      } else {
        try {
          const { auth } = ensureFirebase();
          const headers = {};
          if (auth && auth.currentUser) {
            try {
              const token = await auth.currentUser.getIdToken(false);
              if (token) headers['Authorization'] = `Bearer ${token}`;
            } catch (_) {}
          }

          const res = await fetch(`/api/secret/video-stream?node=${encodeURIComponent(this.config.dbNode)}&ep=${encodeURIComponent(ep.id)}`, { headers });
          if (res.ok) {
            const json = await res.json();
            if (json && json.ok && json.url) {
              streamData = json;
            }
          }
        } catch (e) {
          console.warn('API secret stream fetch failed, trying direct database fallback...');
        }

        // 2. Graceful direct Firebase Realtime Database fallback if server proxy unavailable
        if (!streamData && this.config.allowDirectFallback) {
          const { db } = ensureFirebase();
          if (db) {
            try {
              const snap = await db.ref(`${this.config.dbNode}/${ep.id}`).once('value');
              if (snap.exists()) {
                const val = snap.val();
                if (typeof val === 'string') {
                  streamData = { ok: true, url: val };
                } else if (val && typeof val === 'object') {
                  streamData = val;
                }
              }
            } catch (e) {
              console.error('Database query fallback failed:', e);
            }
          }
        }
      }

      if (!streamData || !streamData.url) {
        this.destroyPlayer();
        const hasPageRestriction = Boolean(this.config.pageId && typeof this.config.pageId === 'string' && this.config.pageId.trim() !== "");
        if (hasPageRestriction) {
          this.showAccessDeniedModal("Your account does not have the required permissions to access this video. If you believe this is a mistake, please contact the administrator for assistance.");
        } else {
          alert("Video is currently unavailable. Please try again later.");
        }
        return;
      }

      // If player is already running with the same stream URL (e.g. multi-part concert with timestamp markers)
      if (this.art && this.art.video && this.art.option && this.art.option.url === streamData.url) {
        if (ep.time !== undefined) {
          this.art.currentTime = ep.time;
          this.art.play().catch(() => {});
        }
        return;
      }

      this.destroyPlayer();

      // 3. Initialize Artplayer
      const self = this;
      const artConfig = {
        container: '#artplayer',
        url: streamData.url,
        title: streamData.title || ep.title,
        poster: ep.image || this.config.poster || 'https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png',
        volume: 0.7,
        isLive: false,
        muted: false,
        autoplay: true,
        fullscreen: true,
        fullscreenWeb: true,
        miniProgressBar: true,
        mutex: true,
        airplay: true,
        theme: this.config.theme || '#a1a1aa',
        autoOrientation: true,
        isMobile: false, // Allows custom gesture overlay
        setting: true,
        hotkey: true,
        moreVideoAttr: {
          playsInline: true,
          'webkit-playsinline': true
        },
        customType: {
          m3u8: function (video, url, art) {
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
              const hls = new Hls();
              hls.loadSource(url);
              hls.attachMedia(video);
              art.hls = hls;

              hls.on(Hls.Events.MANIFEST_PARSED, function () {
                const levels = hls.levels.map((level, index) => ({
                  html: (level.height ? level.height + 'P' : 'Unknown'),
                  level: level.height,
                  index: index
                }));
                levels.unshift({ html: 'Auto', index: -1, default: true });
                art.setting.update({
                  name: 'quality',
                  width: 150,
                  html: 'Quality',
                  tooltip: 'Auto',
                  selector: levels.map(item => ({ html: item.html, default: item.default, url: '#', $index: item.index })),
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

      // 4. Subtitle Processing (Safe fetch to Blob to prevent CORS failure)
      if (streamData.subtitles) {
        try {
          const subUrl = typeof streamData.subtitles === 'string' ? streamData.subtitles : (streamData.subtitles.en || Object.values(streamData.subtitles)[0]);
          if (subUrl) {
            const subRes = await fetch(subUrl);
            if (subRes.ok) {
              const subBlob = await subRes.blob();
              const blobUrl = URL.createObjectURL(subBlob);
              self.currentSubBlobUrls.push(blobUrl);
              artConfig.subtitle = {
                url: blobUrl,
                type: 'vtt',
                encoding: 'utf-8'
              };
            }
          }
        } catch(subErr) {
          console.warn('Subtitle blob conversion note:', subErr);
        }
      }

      if (typeof Artplayer === 'undefined') {
        console.error('Artplayer is not loaded.');
        return;
      }

      this.art = new Artplayer(artConfig);
      window.art = this.art;

      // 5. Gestures, Layers & Watch History
      this.setupGesturesAndEvents(ep);
    },

    setupGesturesAndEvents: function(ep) {
      const art = this.art;
      const self = this;
      if (!art) return;

      const clickCatcher = document.getElementById('click-catcher');
      const iconRewind = document.getElementById('icon-rewind');
      const iconForward = document.getElementById('icon-forward');
      const iconPlay = document.getElementById('icon-play');
      const iconPause = document.getElementById('icon-pause');

      // Add Skip Intro & Next Episode layers
      if (art.layers) {
        art.layers.add({
          name: 'skipIntroLayer',
          html: '<button type="button" class="skip-intro-btn"><i class="fas fa-forward"></i> Skip Intro</button>',
          style: { display: 'none' }
        });
        const skipBtn = art.layers.skipIntroLayer && art.layers.skipIntroLayer.querySelector('.skip-intro-btn');
        if (skipBtn) {
          skipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.skipIntroGlobal();
          });
        }

        art.layers.add({
          name: 'nextEpLayer',
          html: '<button type="button" class="next-ep-prompt-btn">Next Episode <i class="fas fa-chevron-right"></i></button>',
          style: { display: 'none' }
        });
        const nextBtn = art.layers.nextEpLayer && art.layers.nextEpLayer.querySelector('.next-ep-prompt-btn');
        if (nextBtn) {
          nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            self.playNextEpisode();
          });
        }
      }

      let lastTap = 0;
      let tapTimeout = null;

      function triggerGestureAnim(el) {
        if (!el) return;
        el.classList.remove('animate');
        void el.offsetWidth;
        el.classList.add('animate');
      }

      if (clickCatcher) {
        clickCatcher.addEventListener('click', (e) => {
          const currentTime = Date.now();
          const tapLength = currentTime - lastTap;
          clearTimeout(tapTimeout);

          if (tapLength < 300 && tapLength > 0) {
            // DOUBLE TAP DETECTED
            const rect = clickCatcher.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;

            if (clickX < width * 0.35) {
              art.seek = Math.max(0, art.currentTime - 10);
              triggerGestureAnim(iconRewind);
            } else if (clickX > width * 0.65) {
              art.seek = Math.min(art.duration || Infinity, art.currentTime + 10);
              triggerGestureAnim(iconForward);
            } else {
              art.toggle();
              if (art.playing) triggerGestureAnim(iconPlay);
              else triggerGestureAnim(iconPause);
            }
          } else {
            // SINGLE TAP
            tapTimeout = setTimeout(() => {
              art.toggle();
              if (art.playing) triggerGestureAnim(iconPlay);
              else triggerGestureAnim(iconPause);
            }, 300);
          }
          lastTap = currentTime;
        });
      }

      // Auto play next episode on video end
      art.on('video:ended', () => {
        this.playNextEpisode();
      });

      // Restore playback progress (both LocalStorage and Firebase RTDB)
      const pageIdentifier = window.location.pathname.split('/').pop().replace('.html', '') || 'videos';
      const historyKey = `${ep.id}_${pageIdentifier}`;
      const storageKey = `zv_progress_${ep.id}_${window.location.pathname}`;
      const localSavedTime = parseFloat(localStorage.getItem(storageKey) || '0');

      const { auth, db } = ensureFirebase();
      let lastRemoteSave = 0;

      // Check remote database progress first
      if (auth && auth.currentUser && db) {
        db.ref(`watchHistory/${auth.currentUser.uid}/${historyKey}`).once('value').then(snap => {
          const val = snap.val();
          if (val && Number(val.currentTime) > 10) {
            art.once('video:canplay', () => {
              art.seek = Number(val.currentTime);
              art.notice.show = `Resumed from ${Math.floor(val.currentTime / 60)}:${String(Math.floor(val.currentTime % 60)).padStart(2, '0')}`;
            });
          } else if (localSavedTime > 10) {
            art.once('video:canplay', () => {
              art.seek = localSavedTime;
              art.notice.show = `Resumed from ${Math.floor(localSavedTime / 60)}:${String(Math.floor(localSavedTime % 60)).padStart(2, '0')}`;
            });
          }
        }).catch(() => {
          if (localSavedTime > 10) {
            art.once('video:canplay', () => {
              art.seek = localSavedTime;
              art.notice.show = `Resumed from ${Math.floor(localSavedTime / 60)}:${String(Math.floor(localSavedTime % 60)).padStart(2, '0')}`;
            });
          }
        });
      } else if (localSavedTime > 10) {
        art.once('video:canplay', () => {
          art.seek = localSavedTime;
          art.notice.show = `Resumed from ${Math.floor(localSavedTime / 60)}:${String(Math.floor(localSavedTime % 60)).padStart(2, '0')}`;
        });
      } else if (ep.time !== undefined) {
        art.once('video:canplay', () => {
          art.seek = ep.time;
        });
      }

      // Update watch progress, skip intro button, and next episode layer
      art.on('video:timeupdate', () => {
        const now = Date.now();
        // Skip intro layer visibility
        if (window.introEndTime > 0 && art.layers && art.layers.skipIntroLayer) {
          if (!window.hasSkippedIntro && art.currentTime > 0 && art.currentTime < window.introEndTime) {
            art.layers.skipIntroLayer.style.display = 'block';
          } else {
            art.layers.skipIntroLayer.style.display = 'none';
          }
        }

        // Next episode layer visibility (within 60 seconds of end)
        if (art.layers && art.layers.nextEpLayer && art.duration) {
          const currentIndex = self.config.playlist.findIndex(item => item.id === self.currentEpData.id);
          const hasNext = currentIndex >= 0 && currentIndex < self.config.playlist.length - 1;
          art.layers.nextEpLayer.style.display = (art.duration - art.currentTime <= 60 && hasNext) ? 'block' : 'none';
        }

        // Save progress every 5 seconds
        if (art.currentTime > 5 && !art.ended) {
          localStorage.setItem(storageKey, String(art.currentTime));

          if (auth && auth.currentUser && db && (now - lastRemoteSave > 5000)) {
            lastRemoteSave = now;
            db.ref(`watchHistory/${auth.currentUser.uid}/${historyKey}`).update({
              id: ep.id,
              title: ep.title,
              image: ep.image,
              currentTime: Number(art.currentTime) || 0,
              duration: Number(art.duration) || 0,
              timestamp: now,
              page: pageIdentifier
            }).catch(() => {});
          }
        }
      });
    },

    playNextEpisode: function() {
      if (!this.config || !this.currentEpData) return;
      const currentIndex = this.config.playlist.findIndex(item => item.id === this.currentEpData.id);
      if (currentIndex >= 0 && currentIndex < this.config.playlist.length - 1) {
        const nextEp = this.config.playlist[currentIndex + 1];
        this.loadAndPlayEpisode(nextEp.id, true);
      }
    },

    destroyPlayer: function() {
      if (this.art) {
        if (this.art.hls) this.art.hls.destroy();
        this.art.destroy(false);
        this.art = null;
        window.art = null;
      }
      this.currentSubBlobUrls.forEach(url => URL.revokeObjectURL(url));
      this.currentSubBlobUrls = [];
    },

    showAccessDeniedModal: function(msg) {
      if (document.querySelector('.access-denied-modal')) return;

      const displayMsg = msg || "Your account does not have the required permissions to access this video. If you believe this is a mistake, please contact the administrator for assistance.";

      // Resolve current user information
      let userUid = '';
      let userEmail = '';
      try {
        const { auth } = ensureFirebase();
        if (auth && auth.currentUser) {
          userUid = auth.currentUser.uid || '';
          userEmail = auth.currentUser.email || '';
        }
      } catch (_) {}

      if (!userUid) {
        try {
          const cached = JSON.parse(localStorage.getItem("zone_vault_user_cache"));
          if (cached) {
            userUid = cached.uid || '';
            userEmail = cached.email || '';
          }
        } catch (_) {}
      }

      const modal = document.createElement('div');
      modal.className = 'access-denied-modal';
      modal.setAttribute('role', 'alertdialog');
      modal.setAttribute('aria-modal', 'true');

      // Built-in resilient styling for immediate render
      modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(5, 5, 8, 0.88);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 20px;
        box-sizing: border-box;
      `;

      const videoTitle = (this.currentEpData && this.currentEpData.title) 
        || (this.config && this.config.title) 
        || document.title.replace('— Zone Vault', '').trim() 
        || 'Video';

      const accountHtml = userUid ? `
        <div class="access-denied-account" style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px 14px; margin-bottom:22px; font-size:12px; color:#a1a1aa; text-align:left;">
          <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Account ID: <strong style="color:#fff; font-family:monospace; font-size:11.5px;">${userUid}</strong></span>
          </div>
          <button type="button" id="zv-copy-uid-btn" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#fca5a5; cursor:pointer; font-size:11px; font-weight:700; padding:4px 10px; border-radius:6px; transition:all 0.2s; flex-shrink:0;">Copy ID</button>
        </div>
      ` : '';

      modal.innerHTML = `
        <div class="access-denied-card" style="position:relative; max-width:480px; width:100%; background:linear-gradient(180deg, rgba(24,24,30,0.96) 0%, rgba(12,12,16,0.98) 100%); border:1px solid rgba(239,68,68,0.32); border-radius:24px; padding:38px 28px 28px; text-align:center; box-shadow:0 30px 70px -15px rgba(0,0,0,0.85), 0 0 50px rgba(239,68,68,0.18), inset 0 1px 0 rgba(255,255,255,0.12); overflow:hidden; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing:border-box;">
          <div class="access-denied-glow" style="position:absolute; top:-70px; left:50%; transform:translateX(-50%); width:240px; height:140px; background:radial-gradient(ellipse, rgba(239,68,68,0.35) 0%, rgba(239,68,68,0) 70%); pointer-events:none;"></div>
          
          <div class="access-denied-icon-wrap" style="width:68px; height:68px; margin:0 auto 18px; border-radius:20px; background:linear-gradient(135deg, rgba(239,68,68,0.22), rgba(185,28,28,0.08)); border:1px solid rgba(239,68,68,0.45); display:flex; align-items:center; justify-content:center; box-shadow:0 0 30px rgba(239,68,68,0.28); color:#ef4444;">
            <svg class="access-denied-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>

          <div class="access-denied-pill" style="display:inline-flex; align-items:center; gap:7px; padding:5px 14px; border-radius:9999px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.28); color:#fca5a5; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; margin-bottom:14px;">
            <span class="access-denied-pill-dot" style="width:6px; height:6px; border-radius:50%; background:#ef4444; box-shadow:0 0 8px #ef4444;"></span>
            <span>Permission Required</span>
          </div>

          <h2 class="access-denied-title" style="font-size:26px; font-weight:800; color:#ffffff; margin:0 0 12px; letter-spacing:-0.5px; line-height:1.2;">Access Denied</h2>
          
          <p class="access-denied-message" style="font-size:14.5px; line-height:1.6; color:#d4d4d8; margin:0 0 22px;">
            ${displayMsg}
          </p>

          ${accountHtml}

          <div class="access-denied-actions" style="display:flex; gap:12px; width:100%; margin-bottom:8px;">
            <button type="button" id="zv-back-btn" class="access-denied-primary-btn" style="flex:1; padding:13px 20px; border-radius:12px; background:#ffffff; color:#09090b; font-weight:700; font-size:13.5px; border:none; cursor:pointer; transition:all 0.2s; box-shadow:0 4px 16px rgba(255,255,255,0.15); margin:0;">
              Return to Videos
            </button>
            <button type="button" id="zv-contact-btn" class="access-denied-secondary-btn" style="flex:1; padding:13px 20px; border-radius:12px; background:rgba(255,255,255,0.06); color:#ffffff; font-weight:600; font-size:13.5px; border:1px solid rgba(255,255,255,0.16); cursor:pointer; transition:all 0.2s; margin:0;">
              Contact Admin
            </button>
          </div>

          <div class="access-denied-footer" style="font-size:12px; color:#71717a; margin-top:16px; display:flex; align-items:center; justify-content:center; gap:8px;">
            <span id="access-countdown-text">Redirecting automatically in <strong id="access-countdown" style="color:#f87171; font-weight:700;">6</strong>s</span>
            <span style="color:#3f3f46;">·</span>
            <button type="button" id="zv-pause-btn" style="background:none; border:none; color:#a1a1aa; text-decoration:underline; cursor:pointer; font-size:11.5px; padding:0; margin:0;">Stay on page</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Event listeners
      const backBtn = modal.querySelector('#zv-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          if (this.redirectTimer) clearInterval(this.redirectTimer);
          if (window.history.length > 1 && document.referrer) {
            window.history.back();
          } else {
            window.location.href = '/videos';
          }
        });
      }

      const copyBtn = modal.querySelector('#zv-copy-uid-btn');
      if (copyBtn && userUid) {
        copyBtn.addEventListener('click', () => {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(userUid).then(() => {
              copyBtn.textContent = 'Copied!';
              setTimeout(() => { copyBtn.textContent = 'Copy ID'; }, 2000);
            }).catch(() => {});
          }
        });
      }

      const contactBtn = modal.querySelector('#zv-contact-btn');
      if (contactBtn) {
        contactBtn.addEventListener('click', () => {
          const adminEmail = 'seventeenzoneph@gmail.com';
          const subject = encodeURIComponent(`Access Request: ${videoTitle}`);
          const body = encodeURIComponent(`Hello Admin,\n\nI would like to request access to: ${videoTitle}\n\nAccount Details:\nUID: ${userUid || 'Not logged in'}\nEmail: ${userEmail || 'N/A'}\n\nThank you!`);
          
          if (navigator.clipboard) {
            navigator.clipboard.writeText(adminEmail).catch(() => {});
          }
          
          window.location.href = `mailto:${adminEmail}?subject=${subject}&body=${body}`;
          contactBtn.textContent = 'Email Opened';
          setTimeout(() => { contactBtn.textContent = 'Contact Admin'; }, 2500);
        });
      }

      const pauseBtn = modal.querySelector('#zv-pause-btn');
      if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
          if (this.redirectTimer) {
            clearInterval(this.redirectTimer);
            this.redirectTimer = null;
          }
          const cdText = modal.querySelector('#access-countdown-text');
          if (cdText) cdText.textContent = 'Auto-redirect paused';
          pauseBtn.style.display = 'none';
        });
      }

      let timeLeft = 6;
      const countSpan = modal.querySelector('#access-countdown');
      if (this.redirectTimer) clearInterval(this.redirectTimer);

      this.redirectTimer = setInterval(() => {
        timeLeft--;
        if (countSpan) countSpan.textContent = timeLeft;
        if (timeLeft <= 0) {
          clearInterval(this.redirectTimer);
          this.redirectTimer = null;
          window.location.href = '/videos';
        }
      }, 1000);
    },

    removeAccessDeniedModal: function() {
      if (this.redirectTimer) {
        clearInterval(this.redirectTimer);
        this.redirectTimer = null;
      }
      const modal = document.querySelector('.access-denied-modal');
      if (modal) modal.remove();
    }
  };

  // Standardized VideoPlayer Utility Class for 2021-2026 Collection Pages
  class VideoPlayer {
    constructor(config) {
      if (config) {
        ZonePlayer.init(config);
      }
    }

    static init(config) {
      return ZonePlayer.init(config);
    }

    static loadAndPlayEpisode(epId, updateUrl) {
      return ZonePlayer.loadAndPlayEpisode(epId, updateUrl);
    }

    static playNextEpisode() {
      return ZonePlayer.playNextEpisode();
    }

    static destroy() {
      return ZonePlayer.destroyPlayer();
    }

    static get instance() {
      return ZonePlayer;
    }
  }

  // Global window exports
  window.VideoPlayer = VideoPlayer;
  window.ZonePlayer = ZonePlayer;
  window.initZonePlayer = function(cfg) { VideoPlayer.init(cfg); };
  window.playNextEpisodeGlobal = function() { VideoPlayer.playNextEpisode(); };
  window.skipIntroGlobal = function() {
    if (!window.art || !window.introEndTime) return;
    window.art.seek = window.introEndTime;
    window.art.notice.show = 'Intro Skipped';
    window.hasSkippedIntro = true;
    if (window.art.layers && window.art.layers.skipIntroLayer) {
      window.art.layers.skipIntroLayer.style.display = 'none';
    }
  };

})(window);
