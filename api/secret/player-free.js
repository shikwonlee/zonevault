// ========================================================
// Zone Vault — Free Access Video Player Engine (/api/secret/player-free.js)
// Dedicated for public and free access videos (Zero pageId restrictions, zero permission modals)
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
    const activeEngine = window.ZonePlayerFree || window.ZonePlayer;
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

  // 5. ZonePlayerFree Engine Object (Pure Free Access)
  const ZonePlayerFree = {
    config: null,
    art: null,
    currentEpData: null,

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

    init: function(userConfig) {
      this.config = Object.assign({
        pageId: '',
        dbNode: '',
        playlist: [],
        theme: '#a1a1aa',
        poster: ''
      }, userConfig);

      const { auth, db } = ensureFirebase();

      // Check if Admin session is active -> display admin toast
      try {
        const cached = JSON.parse(localStorage.getItem("zone_vault_user_cache"));
        const isAdmin = localStorage.getItem("isAdmin") === "true" || sessionStorage.getItem("isAdmin") === "true" ||
                        Boolean(cached && (cached.isAdmin === true || (cached.role && cached.role.toLowerCase() === 'admin')));
        if (isAdmin) {
          this.showAdminToast();
        } else if (auth) {
          auth.onAuthStateChanged(user => {
            if (user && db) {
              db.ref('users/' + user.uid).once('value').then(snap => {
                const u = snap.val();
                if (u && (u.isAdmin === true || (u.role && u.role.toLowerCase() === 'admin'))) {
                  this.showAdminToast();
                }
              }).catch(() => {});
            }
          });
        }
      } catch (_) {}

      // Poster Container setup
      const posterContainer = document.getElementById('poster-container');
      if (posterContainer) {
        const fallbackPoster = 'https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png';
        const candidatePoster = this.config.poster || (this.config.playlist && this.config.playlist[0] && this.config.playlist[0].image);
        const initialPoster = candidatePoster || fallbackPoster;
        posterContainer.style.backgroundImage = `url("${initialPoster.replace(/"/g, '\\"')}")`;

        posterContainer.addEventListener('click', () => {
          if (this.config.playlist && this.config.playlist.length > 0) {
            this.loadAndPlayEpisode(this.config.playlist[0].id, true);
          }
        });
      }

      this.renderPlaylist();

      const urlParams = new URLSearchParams(window.location.search);
      const requestedId = urlParams.get('v') || urlParams.get('ep') || urlParams.get('id');
      const titleSlug = urlParams.get('title');

      if (requestedId && this.config.playlist && this.config.playlist.some(p => String(p.id) === String(requestedId))) {
        setTimeout(() => this.loadAndPlayEpisode(requestedId, false), 300);
      } else if (titleSlug && this.config.playlist) {
        const matched = this.config.playlist.find(p => encodeURIComponent(p.title.trim().replace(/\s+/g, '-')) === titleSlug);
        if (matched) setTimeout(() => this.loadAndPlayEpisode(matched.id, false), 300);
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
          if (!isLocked) this.loadAndPlayEpisode(ep.id, true);
        });

        container.appendChild(epDiv);
      });
    },

    loadAndPlayEpisode: function(epId, updateUrl = true) {
      if (!this.config) return;
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

      // 2. Direct Firebase Database query for Free Access Videos
      if (this.config.dbNode && db) {
        const rawNode = this.config.dbNode.trim();
        const candidateNodes = [rawNode];

        // Intelligently generate node aliases based on database conventions
        if (rawNode.includes('caratland') || rawNode.includes('cl')) {
          if (!candidateNodes.includes('caratland2025')) candidateNodes.push('caratland2025');
          if (!candidateNodes.includes('caratland_2025')) candidateNodes.push('caratland_2025');
          if (!candidateNodes.includes('caratland2024')) candidateNodes.push('caratland2024');
          if (!candidateNodes.includes('9th_caratland')) candidateNodes.push('9th_caratland');
          if (!candidateNodes.includes('caratland')) candidateNodes.push('caratland');
        } else if (rawNode.includes('shadow')) {
          if (!candidateNodes.includes('theshadowsedge')) candidateNodes.push('theshadowsedge');
          if (!candidateNodes.includes("theshadow'sedge")) candidateNodes.push("theshadow'sedge");
          if (!candidateNodes.includes('the-shadows-edge')) candidateNodes.push('the-shadows-edge');
          if (!candidateNodes.includes('shadowsedge')) candidateNodes.push('shadowsedge');
          if (!candidateNodes.includes('caratland2024')) candidateNodes.push('caratland2024');
        } else {
          if (!rawNode.startsWith('url')) candidateNodes.push(`url${rawNode}`);
          if (rawNode.startsWith('url')) candidateNodes.push(rawNode.slice(3));
          if (rawNode.includes('_')) candidateNodes.push(rawNode.replace(/_/g, ''));
        }

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
    const activeEngine = window.ZonePlayerFree || window.ZonePlayer;
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

  window.ZonePlayerFree = ZonePlayerFree;
  window.ZonePlayer = ZonePlayerFree; // Drop-in alias for free access pages

})(window);
