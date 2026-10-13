// ========================================================
// Zone Vault — Restricted Access Video Player Engine (/api/secret/player-restricted.js)
// Dedicated for restricted concert content with live Firebase role & page_access admin panel sync
// ========================================================

(function(window) {
  'use strict';

  // 1. Google Analytics / GTag
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-1B2RJ659GL');

  // 2. Theme Engine Sync
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

  // 3. Central Firebase Compat Initializer
  let authInstance = null;
  let dbInstance = null;

  function ensureFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase Compat SDK not loaded yet.');
      return { auth: null, db: null };
    }
    if (!firebase.apps.length) {
      const cfg = {
        apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
        authDomain: "tvnstream-b4497.firebaseapp.com",
        databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
        projectId: "tvnstream-b4497",
        storageBucket: "tvnstream-b4497.appspot.com",
        messagingSenderId: "308384754214",
        appId: "1:308384754214:web:2938e76cd29b288f75d4e7"
      };
      firebase.initializeApp(cfg);
    }
    if (!authInstance) authInstance = firebase.auth();
    if (!dbInstance) dbInstance = firebase.database();
    return { auth: authInstance, db: dbInstance };
  }

  // 4. Global Next Ep & Skip Intro Helpers
  window.playNextEpisodeGlobal = function() {
    const activeEngine = window.ZonePlayerRestricted || window.ZonePlayer;
    if (!activeEngine || !activeEngine.config) return;
    const playlist = activeEngine.config.playlist || [];
    if (!window.currentEpData) return;
    const currentIndex = playlist.findIndex(item => String(item.id) === String(window.currentEpData.id));
    if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
      const nextEp = playlist[currentIndex + 1];
      activeEngine.loadAndPlayEpisode(nextEp.id, true);
    }
  };

  window.skipIntroGlobal = function() {
    if (!window.art || !window.introEndTime) return;
    window.art.seek = window.introEndTime;
    window.art.notice.show = 'Intro Skipped';
    window.hasSkippedIntro = true;
    if (window.art.layers && window.art.layers.skipIntroLayer) {
      window.art.layers.skipIntroLayer.style.display = 'none';
    }
  };

  // 5. ZonePlayerRestricted Engine Object (With Live Admin Panel Sync)
  const ZonePlayerRestricted = {
    config: null,
    art: null,
    currentEpData: null,
    hasPermission: null,
    redirectTimer: null,
    activeAccessRef: null,

    showAdminToast: function() {
      let toast = document.getElementById('adminToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'adminToast';
        toast.className = 'admin-toast';
        toast.innerHTML = '<i class="fas fa-shield-alt"></i> You are using ADMIN ACCOUNT';
        document.body.appendChild(toast);
      }
      toast.classList.add('show');
      setTimeout(() => { if (toast) toast.classList.remove('show'); }, 4000);
    },

    showAccessDeniedModal: function(customMsg) {
      if (document.querySelector('.access-denied-modal')) return;

      const pageTitle = (this.config && this.config.playlist && this.config.playlist[0] && this.config.playlist[0].title) || 'This Video';
      const msg = customMsg || "Your account does not have the required permissions to access this video. If you believe this is a mistake, please contact the administrator for assistance.";

      let userUid = '';
      try {
        const cached = JSON.parse(localStorage.getItem("zone_vault_user_cache"));
        if (cached && cached.uid) userUid = cached.uid;
      } catch (_) {}

      const modal = document.createElement('div');
      modal.className = 'access-denied-modal';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';

      modal.innerHTML = `
        <div class="access-denied-card" style="position:relative; max-width:440px; width:100%; background:#000000; border:1px solid #27272a; border-radius:16px; padding:32px 24px 24px; text-align:center; box-shadow:0 20px 40px rgba(0,0,0,0.95); overflow:hidden; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing:border-box;">
          <div style="width:52px; height:52px; margin:0 auto 16px; border-radius:12px; background:#141414; border:1px solid #27272a; display:flex; align-items:center; justify-content:center; color:#ffffff;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div style="display:inline-flex; align-items:center; gap:7px; padding:4px 12px; border-radius:9999px; background:#141414; border:1px solid #27272a; color:#a1a1aa; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; margin-bottom:14px;">
            <span style="width:6px; height:6px; border-radius:50%; background:#71717a;"></span>
            <span>Permission Required</span>
          </div>
          <h2 style="font-size:22px; font-weight:700; color:#ffffff; margin:0 0 10px; letter-spacing:-0.3px;">Access Denied</h2>
          <p style="font-size:14px; line-height:1.55; color:#a1a1aa; margin:0 0 20px;">
            ${msg}
          </p>
          <div style="display:flex; gap:10px; width:100%; margin-bottom:8px;">
            <button type="button" id="btnReturnVideos" style="flex:1; padding:12px 18px; border-radius:10px; background:#ffffff; color:#000000; font-weight:600; font-size:13.5px; border:none; cursor:pointer;">
              Return to Videos
            </button>
            <button type="button" id="btnContactAdmin" style="flex:1; padding:12px 18px; border-radius:10px; background:#141414; color:#ffffff; font-weight:500; font-size:13.5px; border:1px solid #27272a; cursor:pointer;">
              Contact Admin
            </button>
          </div>
          <div style="font-size:12px; color:#71717a; margin-top:14px;">
            Redirecting automatically in <strong id="redirectTimer" style="color:#ffffff;">6</strong>s
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const btnReturn = modal.querySelector('#btnReturnVideos');
      if (btnReturn) btnReturn.onclick = () => { window.location.href = '/videos'; };

      const btnContact = modal.querySelector('#btnContactAdmin');
      if (btnContact) {
        btnContact.onclick = () => {
          const subject = encodeURIComponent(`Access Request: ${pageTitle}`);
          const body = encodeURIComponent(`Hello Admin,\n\nI would like to request access for ${pageTitle}.\nMy UID: ${userUid}\n\nThank you.`);
          window.location.href = `mailto:seventeenzoneph@gmail.com?subject=${subject}&body=${body}`;
        };
      }

      let countdown = 6;
      const timer = modal.querySelector('#redirectTimer');
      if (this.redirectTimer) clearInterval(this.redirectTimer);
      this.redirectTimer = setInterval(() => {
        countdown--;
        if (timer) timer.textContent = countdown;
        if (countdown <= 0) {
          clearInterval(this.redirectTimer);
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
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    },

    init: function(userConfig) {
      this.config = Object.assign({
        pageId: '',
        dbNode: '',
        playlist: [],
        theme: '#a1a1aa',
        poster: ''
      }, userConfig);

      const { auth, db } = ensureFirebase();

      const posterContainer = document.getElementById('poster-container');
      if (posterContainer) {
        const fallbackPoster = 'https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png';
        const candidatePoster = this.config.poster || (this.config.playlist && this.config.playlist[0] && this.config.playlist[0].image);
        const initialPoster = candidatePoster || fallbackPoster;
        posterContainer.style.backgroundImage = `url("${initialPoster.replace(/"/g, '\\"')}")`;

        posterContainer.addEventListener('click', () => {
          if (this.hasPermission === true && this.config.playlist && this.config.playlist.length > 0) {
            this.loadAndPlayEpisode(this.config.playlist[0].id, true);
          } else if (this.hasPermission === false) {
            this.showAccessDeniedModal();
          }
        });
      }

      this.renderPlaylist();

      const PAGE_ID = this.config.pageId ? this.config.pageId.trim() : '';
      const self = this;

      // Realtime Admin & page_access Permission Check
      const evaluateAccess = async (user) => {
        if (!user) {
          // Check cached user before displaying modal
          let cached = null;
          try { cached = JSON.parse(localStorage.getItem("zone_vault_user_cache")); } catch(_) {}
          if (cached && (cached.isAdmin === true || (cached.role && cached.role.toLowerCase() === 'admin'))) {
            self.hasPermission = true;
            self.removeAccessDeniedModal();
            self.showAdminToast();
            return;
          }
          self.hasPermission = false;
          self.showAccessDeniedModal("Please log in to your account to access this video.");
          return;
        }

        // 1. Live Check if user is ADMIN in Realtime Database
        if (db) {
          try {
            const userSnap = await db.ref(`users/${user.uid}`).once('value');
            const userData = userSnap.val();
            if (userData && (userData.role === 'admin' || userData.isAdmin === true || (userData.status === 'approved' && (userData.role || '').toLowerCase() === 'admin'))) {
              self.hasPermission = true;
              self.removeAccessDeniedModal();
              self.showAdminToast();
              return;
            }
          } catch (_) {}
        }

        // Check local storage admin flag
        const isStorageAdmin = localStorage.getItem("isAdmin") === "true" || sessionStorage.getItem("isAdmin") === "true";
        if (isStorageAdmin) {
          self.hasPermission = true;
          self.removeAccessDeniedModal();
          self.showAdminToast();
          return;
        }

        // 2. Realtime Listener on page_access node connected to Admin Panel
        if (db && PAGE_ID) {
          if (self.activeAccessRef) {
            self.activeAccessRef.off();
          }

          self.activeAccessRef = db.ref(`page_access/${PAGE_ID}/${user.uid}`);
          self.activeAccessRef.on('value', (accessSnap) => {
            const isAllowed = accessSnap.val();
            if (isAllowed === true) {
              self.hasPermission = true;
              self.removeAccessDeniedModal();
            } else {
              // Secondary fallback check on users/{uid}/page_access/{PAGE_ID}
              db.ref(`users/${user.uid}/page_access/${PAGE_ID}`).once('value').then(uSnap => {
                if (uSnap.val() === true) {
                  self.hasPermission = true;
                  self.removeAccessDeniedModal();
                } else {
                  self.hasPermission = false;
                  if (self.art) {
                    self.art.destroy(false);
                    self.art = null;
                  }
                  self.showAccessDeniedModal();
                }
              }).catch(() => {
                self.hasPermission = false;
                self.showAccessDeniedModal();
              });
            }
          });
        }
      };

      if (auth) {
        auth.onAuthStateChanged((user) => {
          evaluateAccess(user);
        });
      } else {
        self.showAccessDeniedModal("Please log in to your account to access this video.");
      }

      // URL parameters check
      const urlParams = new URLSearchParams(window.location.search);
      const requestedId = urlParams.get('v') || urlParams.get('ep') || urlParams.get('id');
      if (requestedId && this.config.playlist && this.config.playlist.some(p => String(p.id) === String(requestedId))) {
        setTimeout(() => {
          if (self.hasPermission === true) {
            self.loadAndPlayEpisode(requestedId, false);
          }
        }, 500);
      }
    },

    renderPlaylist: function() {
      const container = document.getElementById('playlist-items');
      if (!container || !this.config.playlist) return;

      container.innerHTML = '';
      const fallbackImg = 'https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png';

      this.config.playlist.forEach((ep) => {
        const epDiv = document.createElement('div');
        epDiv.className = 'playlist-item';
        epDiv.dataset.id = ep.id;

        const today = new Date();
        let isLocked = false;
        if (ep.date) {
          const releaseDate = new Date(ep.date);
          if (releaseDate > today) isLocked = true;
        }
        if (isLocked) epDiv.classList.add('locked');

        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'playlist-img-wrapper';

        const img = document.createElement('img');
        img.src = ep.image || fallbackImg;
        img.loading = 'lazy';
        img.alt = ep.title;
        img.onerror = () => { img.src = fallbackImg; };

        imgWrapper.appendChild(img);

        const textDiv = document.createElement('div');
        textDiv.className = 'playlist-text';

        const title = document.createElement('span');
        title.className = 'playlist-title';
        title.textContent = ep.title;
        textDiv.appendChild(title);

        if (ep.status) {
          const statusSpan = document.createElement('span');
          statusSpan.className = 'playlist-status';
          statusSpan.textContent = ep.status;
          textDiv.appendChild(statusSpan);
          if (ep.status === 'NOT AVAILABLE') epDiv.style.opacity = '0.6';
        }

        const indicator = document.createElement('div');
        indicator.className = 'playing-indicator';
        indicator.innerHTML = '<div class="bar"></div><div class="bar"></div><div class="bar"></div>';

        epDiv.appendChild(imgWrapper);
        epDiv.appendChild(textDiv);
        epDiv.appendChild(indicator);

        epDiv.addEventListener('click', () => {
          if (isLocked) return;
          if (this.hasPermission === false) {
            this.showAccessDeniedModal();
            return;
          }
          this.loadAndPlayEpisode(ep.id, true);
        });

        container.appendChild(epDiv);
      });
    },

    loadAndPlayEpisode: function(epId, updateUrl = true) {
      if (!this.config) return;
      if (this.hasPermission === false) {
        this.showAccessDeniedModal();
        return;
      }

      const ep = this.config.playlist.find(item => String(item.id) === String(epId));
      if (!ep) return;

      if (updateUrl) {
        const newUrl = window.location.pathname + '?v=' + ep.id;
        history.pushState({ id: ep.id }, '', newUrl);
      }

      this.currentEpData = ep;
      window.currentEpData = ep;
      window.hasSkippedIntro = false;
      window.introEndTime = ep.introEnd || 0;

      const posterContainer = document.getElementById('poster-container');
      const playerContainer = document.getElementById('player-container');
      const mainTitle = document.getElementById('main-title');

      if (posterContainer) posterContainer.style.display = 'none';
      if (playerContainer) playerContainer.style.display = 'block';

      document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('active', 'is-paused');
        if (item.dataset.id === String(epId)) item.classList.add('active');
      });

      let pageIdentifier = window.location.pathname.split('/').pop().replace('.html', '');
      if (!pageIdentifier || pageIdentifier === '') pageIdentifier = 'videos';
      const uniqueHistoryKey = `${ep.id}_${pageIdentifier}`;

      const { auth, db } = ensureFirebase();
      const self = this;

      const extractStreamData = (raw) => {
        if (!raw) return null;
        if (typeof raw === 'string' && (raw.startsWith('http') || raw.startsWith('enc:') || raw.includes('.m3u8') || raw.includes('.mp4'))) {
          return { url: raw };
        }
        if (typeof raw === 'object') {
          const u = raw.url || raw.src || raw.link || raw.videoUrl || raw.stream || raw.m3u8 || raw.url1 || '';
          if (u) {
            return {
              url: u,
              title: raw.title || null,
              subtitles: raw.subtitles || null,
              introEnd: raw.introEnd || 0
            };
          }
          const nested = raw[ep.id] || raw['1'] || (Array.isArray(raw) ? raw[0] : null);
          if (nested && nested !== raw) {
            return extractStreamData(nested);
          }
        }
        return null;
      };

      const startPlayback = (data) => {
        let videoUrl = '';
        if (typeof data === 'string') {
          videoUrl = data;
        } else if (typeof data === 'object' && data !== null) {
          videoUrl = data.url || data.src || data.link || data.videoUrl || data.stream || data.m3u8 || data.url1 || '';
        }

        if (videoUrl.startsWith('enc:')) {
          try { videoUrl = atob(videoUrl.slice(4)); } catch (_) {}
        }

        if (!videoUrl) {
          alert('Video unavailable');
          return;
        }

        let artSubtitles = [];
        if (data && data.subtitles) {
          if (Array.isArray(data.subtitles)) {
            artSubtitles = data.subtitles;
          } else if (typeof data.subtitles === 'object') {
            Object.entries(data.subtitles).forEach(([lang, url]) => {
              artSubtitles.push({
                html: lang.toUpperCase(),
                url: url,
                default: lang.toLowerCase() === 'en'
              });
            });
          }
        }

        if (mainTitle) {
          mainTitle.textContent = (data && data.title) || ep.title;
        }

        // 1. IF ARTPLAYER ALREADY EXISTS: SWITCH URL
        if (self.art) {
          self.art.switchUrl(videoUrl, (data && data.title) || ep.title);
          self.art.poster = ep.image || '';

          if (artSubtitles.length > 0) {
            const defaultSub = artSubtitles.find(s => s.default) || artSubtitles[0];
            self.art.subtitle.switch(defaultSub.url, { name: defaultSub.html });
          } else {
            self.art.subtitle.switch('', { name: 'None' });
          }

          const user = auth ? auth.currentUser : null;
          if (user && db) {
            db.ref('watchHistory/' + user.uid + '/' + uniqueHistoryKey).once('value').then(snap => {
              const saved = snap.val();
              self.art.once('video:loadedmetadata', () => {
                if (saved && saved.currentTime > 0) {
                  self.art.currentTime = saved.currentTime;
                  if (saved.currentTime > window.introEndTime) { window.hasSkippedIntro = true; }
                  self.art.notice.show = 'Resumed video';
                }
                self.art.play().catch(() => {});
              });
            }).catch(() => {
              self.art.play().catch(() => {});
            });
          } else {
            self.art.play().catch(() => {});
          }
          return;
        }

        // 2. FIRST TIME: INITIALIZE ARTPLAYER
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const defaultSub = artSubtitles.find(s => s.default) || artSubtitles[0];

        const artConfig = {
          container: '#artplayer',
          url: videoUrl,
          title: (data && data.title) || ep.title,
          poster: ep.image || self.config.poster || 'https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png',
          volume: 0.5,
          isLive: false,
          muted: false,
          autoplay: true,
          setting: true,
          fullscreen: true,
          fullscreenWeb: true,
          miniProgressBar: true,
          autoOrientation: true,
          lock: true,
          fastForward: true,
          mutex: true,
          backdrop: true,
          playsInline: true,
          autoPlayback: true,
          airplay: true,
          theme: self.config.theme || '#a1a1aa',
          moreVideoAttr: {
            playsInline: true,
            'webkit-playsinline': true,
            'x5-video-player-type': 'h5',
            'x5-video-player-fullscreen': 'true',
            'x5-video-orientation': 'landscape'
          },
          customType: {
            m3u8: function (video, url) {
              if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
              } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
              }
            }
          },
          subtitle: defaultSub ? {
            url: defaultSub.url,
            type: 'vtt',
            style: {
              color: '#ffffff',
              fontSize: isMobile ? '16px' : '22px',
              textShadow: '2px 0 #000, -2px 0 #000, 0 2px #000, 0 -2px #000, 1px 1px #000, -1px -1px #000, 1px -1px #000, -1px 1px #000',
              bottom: isMobile ? '40px' : '65px'
            },
            encoding: 'utf-8'
          } : {},
          layers: [
            {
              name: 'nextEpLayer',
              html: 'Next Episode',
              style: {
                position: 'absolute',
                top: isMobile ? '15px' : '25px',
                right: isMobile ? '15px' : '25px',
                padding: isMobile ? '6px 14px' : '8px 18px',
                background: 'rgba(0, 0, 0, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#ffffff',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: isMobile ? '12px' : '14px',
                display: 'none',
                zIndex: '50',
                backdropFilter: 'blur(4px)'
              },
              click: function() {
                window.playNextEpisodeGlobal();
              }
            },
            {
              name: 'skipIntroLayer',
              html: 'Skip Intro',
              style: {
                position: 'absolute',
                bottom: isMobile ? '55px' : '75px',
                right: isMobile ? '15px' : '25px',
                padding: isMobile ? '6px 14px' : '8px 18px',
                background: 'rgba(0, 0, 0, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#ffffff',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: isMobile ? '12px' : '14px',
                display: 'none',
                zIndex: '50',
                backdropFilter: 'blur(4px)'
              },
              click: function() {
                window.skipIntroGlobal();
              }
            }
          ]
        };

        self.art = new Artplayer(artConfig);

        if (artSubtitles.length > 0 && self.art && self.art.setting) {
          self.art.setting.add({
            html: 'Subtitles',
            width: 200,
            selector: artSubtitles.map(s => ({
              html: s.html,
              url: s.url,
              default: s.default
            })),
            onSelect: function (item) {
              self.art.subtitle.switch(item.url, { name: item.html });
              return item.html;
            }
          });
        }

        // Gestures Overlay Setup
        const clickCatcher = document.getElementById('click-catcher');
        const iconRewind = document.getElementById('icon-rewind');
        const iconForward = document.getElementById('icon-forward');
        const iconPlay = document.getElementById('icon-play');
        const iconPause = document.getElementById('icon-pause');

        let clickTimeout = null;

        const showGestureIcon = (el) => {
          if (!el) return;
          el.classList.remove('show');
          void el.offsetWidth;
          el.classList.add('show');
          setTimeout(() => el.classList.remove('show'), 500);
        };

        if (clickCatcher) {
          clickCatcher.addEventListener('click', (e) => {
            const rect = clickCatcher.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;

            if (clickTimeout) {
              clearTimeout(clickTimeout);
              clickTimeout = null;
              if (clickX < width * 0.35) {
                if (self.art) self.art.seek = Math.max(0, self.art.currentTime - 10);
                showGestureIcon(iconRewind);
              } else if (clickX > width * 0.65) {
                if (self.art) self.art.seek = Math.min(self.art.duration || 0, self.art.currentTime + 10);
                showGestureIcon(iconForward);
              } else {
                if (self.art) self.art.toggle();
              }
            } else {
              clickTimeout = setTimeout(() => {
                clickTimeout = null;
                if (self.art) {
                  self.art.toggle();
                  if (self.art.video.paused) showGestureIcon(iconPause);
                  else showGestureIcon(iconPlay);
                }
              }, 250);
            }
          });
        }

        // Resume history check
        const currentAuthUser = auth ? auth.currentUser : null;
        if (currentAuthUser && db) {
          db.ref('watchHistory/' + currentAuthUser.uid + '/' + uniqueHistoryKey).once('value').then(snap => {
            const saved = snap.val();
            if (saved && saved.currentTime > 0) {
              self.art.on('ready', () => {
                self.art.seek = saved.currentTime;
                if (saved.currentTime > window.introEndTime) { window.hasSkippedIntro = true; }
                self.art.play().catch(() => {});
                self.art.notice.show = 'Resumed video';
              });
            }
          }).catch(() => {});
        }

        let lastSave = 0;
        self.art.on('video:timeupdate', () => {
          const now = Date.now();
          if (self.art.duration > 0 && self.art.layers && self.art.layers.nextEpLayer) {
            const timeLeft = self.art.duration - self.art.currentTime;
            const currentIndex = self.config.playlist.findIndex(item => String(item.id) === String(window.currentEpData.id));
            const hasNext = currentIndex >= 0 && currentIndex < self.config.playlist.length - 1;
            if (timeLeft <= 60 && hasNext) {
              self.art.layers.nextEpLayer.style.display = 'block';
            } else {
              self.art.layers.nextEpLayer.style.display = 'none';
            }
          }

          if (window.introEndTime > 0 && self.art.layers && self.art.layers.skipIntroLayer) {
            if (!window.hasSkippedIntro && self.art.currentTime > 0 && self.art.currentTime < window.introEndTime) {
              self.art.layers.skipIntroLayer.style.display = 'block';
            } else {
              self.art.layers.skipIntroLayer.style.display = 'none';
            }
          }

          const currentAuthUser = auth ? auth.currentUser : null;
          if (currentAuthUser && db && self.art && !self.art.video.paused && now - lastSave > 5000) {
            const historyData = {
              id: window.currentEpData.id,
              title: window.currentEpData.title,
              image: window.currentEpData.image,
              currentTime: self.art.currentTime,
              duration: self.art.duration || 0,
              timestamp: now,
              page: pageIdentifier
            };
            db.ref('watchHistory/' + currentAuthUser.uid + '/' + uniqueHistoryKey).update(historyData).catch(() => {});
            lastSave = now;
          }
        });
      };

      // 1. Direct Playback if static URL is configured
      if (ep.url || this.config.videoUrl) {
        startPlayback({
          url: ep.url || this.config.videoUrl,
          title: ep.title,
          subtitles: ep.subtitles || null,
          introEnd: ep.introEnd || 0
        });
        return;
      }

      // 2. Direct Firebase Database query
      if (this.config.dbNode && db) {
        const rawNode = this.config.dbNode.trim();
        const candidateNodes = [rawNode];
        if (!rawNode.startsWith('url')) candidateNodes.push(`url${rawNode}`);
        if (rawNode.startsWith('url')) candidateNodes.push(rawNode.slice(3));
        if (rawNode.includes('_')) candidateNodes.push(rawNode.replace(/_/g, ''));

        const resolveData = async () => {
          // A. Client-side Realtime Database direct read
          for (const node of candidateNodes) {
            try {
              const epSnap = await db.ref(`${node}/${ep.id}`).once('value');
              const found = extractStreamData(epSnap ? epSnap.val() : null);
              if (found) return found;
            } catch (_) {}

            try {
              const rootSnap = await db.ref(node).once('value');
              const foundRoot = extractStreamData(rootSnap ? rootSnap.val() : null);
              if (foundRoot) return foundRoot;
            } catch (_) {}
          }

          // B. Server Proxy Fallback (/api/secret/video-stream)
          try {
            let authToken = null;
            if (auth && auth.currentUser) {
              try { authToken = await auth.currentUser.getIdToken(false); } catch (_) {}
            }
            for (const node of candidateNodes) {
              let fetchUrl = `/api/secret/video-stream?node=${encodeURIComponent(node)}&ep=${encodeURIComponent(ep.id)}`;
              if (authToken) fetchUrl += `&auth=${encodeURIComponent(authToken)}`;
              const sRes = await fetch(fetchUrl);
              if (sRes.ok) {
                const sJson = await sRes.json();
                const found = extractStreamData(sJson);
                if (found) return found;
              }
            }
          } catch (_) {}

          return null;
        };

        resolveData().then(foundStream => {
          if (foundStream) {
            startPlayback(foundStream);
          } else {
            alert('Video unavailable');
          }
        }).catch(() => {
          alert('Video unavailable');
        });
      } else {
        alert('Video unavailable');
      }
    }
  };

  window.addEventListener('popstate', (event) => {
    const activeEngine = window.ZonePlayerRestricted || window.ZonePlayer;
    if (event.state && event.state.id && activeEngine) {
      activeEngine.loadAndPlayEpisode(event.state.id, false);
    } else {
      const posterContainer = document.getElementById('poster-container');
      const playerContainer = document.getElementById('player-container');
      const mainTitle = document.getElementById('main-title');
      if (posterContainer) posterContainer.style.display = 'flex';
      if (playerContainer) playerContainer.style.display = 'none';
      if (mainTitle) mainTitle.textContent = '';
      document.querySelectorAll('.playlist-item').forEach(i => i.classList.remove('active', 'is-paused'));
      if (window.art) window.art.pause();
    }
  });

  window.ZonePlayerRestricted = ZonePlayerRestricted;
  window.ZonePlayer = ZonePlayerRestricted; // Drop-in alias

})(window);
