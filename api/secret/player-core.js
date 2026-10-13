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
    hasPermission: null,

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
      setTimeout(() => toast.classList.remove('show'), 4000);
    },

    resolveAuthToken: async function(timeoutMs = 3500) {
      const { auth } = ensureFirebase();
      if (!auth) return null;
      if (auth.currentUser) {
        try {
          return await auth.currentUser.getIdToken(false);
        } catch (_) {}
      }
      return new Promise((resolve) => {
        let settled = false;
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
          if (!settled) {
            settled = true;
            unsubscribe();
            if (user) {
              try {
                const token = await user.getIdToken(false);
                resolve(token);
                return;
              } catch (_) {}
            }
            resolve(null);
          }
        });
        setTimeout(() => {
          if (!settled) {
            settled = true;
            unsubscribe();
            resolve(null);
          }
        }, timeoutMs);
      });
    },

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

      const urlParams = new URLSearchParams(window.location.search);
      const requestedId = urlParams.get('v') || urlParams.get('ep') || urlParams.get('id');

      // Evaluate permissions immediately
      this.evaluatePermissions((isAllowed) => {
        if (isAllowed && requestedId && this.config.playlist && this.config.playlist.some(p => p.id === requestedId)) {
          this.loadAndPlayEpisode(requestedId, false);
        }
      });
    },

    evaluatePermissions: function(callback) {
      const rawPageId = (this.config.pageId && typeof this.config.pageId === 'string') ? this.config.pageId.trim() : '';
      const hasPageRestriction = Boolean(rawPageId !== '');
      const { auth, db } = ensureFirebase();

      const getSession = () => {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem("zone_vault_user_cache")); } catch(_) {}
        const isInternal = sessionStorage.getItem("internalAccess") === "true" || localStorage.getItem("internalAccess") === "true";
        const hasAccessId = Boolean(sessionStorage.getItem("accessID") || localStorage.getItem("accessID"));
        const isAdminStorage = sessionStorage.getItem("isAdmin") === "true" || localStorage.getItem("isAdmin") === "true";
        const isCachedAdmin = Boolean(cached && (cached.isAdmin === true || cached.role === 'admin' || (cached.role && String(cached.role).toLowerCase() === 'admin')));
        const isAdmin = isAdminStorage || isCachedAdmin;
        const uid = (auth && auth.currentUser && auth.currentUser.uid) || (cached && cached.uid) || '';
        const email = (auth && auth.currentUser && auth.currentUser.email) || (cached && cached.email) || '';
        const isBanned = Boolean(cached && (cached.status === 'banned' || cached.status === 'denied'));
        const isApprovedMember = Boolean(
          (cached && (cached.status === 'approved' || cached.role || cached.uid || cached.accessID)) ||
          isInternal ||
          hasAccessId ||
          isAdmin ||
          (auth && auth.currentUser)
        );

        return { cached, isInternal, hasAccessId, isAdmin, uid, email, isBanned, isApprovedMember };
      };

      const deny = (msg) => {
        this.hasPermission = false;
        this.destroyPlayer();
        const finalMsg = msg || "Your account does not have the required permissions to access this video. If you believe this is a mistake, please contact the administrator for assistance.";
        this.showAccessDeniedModal(finalMsg);
        if (typeof callback === 'function') callback(false);
      };

      const grant = (isAdminUser) => {
        this.hasPermission = true;
        this.removeAccessDeniedModal();
        if (isAdminUser) this.showAdminToast();
        if (typeof callback === 'function') callback(true);
      };

      let checkSettled = false;

      // === CASE 1: FREE ACCESS PAGE (pageId is empty or not provided) ===
      // All pages where pageId has no content are FREE FOR ALL APPROVED MEMBERS! Walang page id, walang permission needed!
      if (!hasPageRestriction) {
        this.hasPermission = true;
        this.removeAccessDeniedModal();
        const initialSession = getSession();
        if (initialSession.isAdmin) this.showAdminToast();
        if (typeof callback === 'function') callback(true);
        return;
      }

      // === CASE 2: RESTRICTED PAGE (pageId is non-empty) ===
      // Only for specific authorized users!
      const runRestrictedCheck = (user) => {
        if (checkSettled) return;
        const session = getSession();

        // 1. Explicitly banned or denied accounts
        if (session.isBanned) {
          checkSettled = true;
          deny("Your account has been restricted or denied.");
          return;
        }

        // 2. Admin user has full access to ALL videos
        if (session.isAdmin || (user && user.uid && session.cached && session.cached.role === 'admin')) {
          checkSettled = true;
          grant(true);
          return;
        }

        const currentUid = user ? user.uid : session.uid;
        if (!currentUid) {
          return; // Allow onAuthStateChanged to resolve before denying
        }

        // 3. Check session and cached allowed pages
        if (sessionStorage.getItem(`zv_allowed_${rawPageId}`) === 'true' ||
            (session.cached && session.cached.allowedPages && session.cached.allowedPages[rawPageId] === true) ||
            (session.cached && session.cached.page_access && session.cached.page_access[rawPageId] === true)) {
          checkSettled = true;
          grant(false);
          return;
        }

        // Safety timeout for database query
        const safetyTimer = setTimeout(() => {
          if (!checkSettled) {
            checkSettled = true;
            deny();
          }
        }, 2500);

        // 4. Query Realtime Database: page_access/${pageId}/${uid}
        if (db) {
          db.ref(`page_access/${rawPageId}/${currentUid}`).once('value', (snap) => {
            if (checkSettled) return;
            const val = snap.val();
            if (val === true) {
              checkSettled = true;
              clearTimeout(safetyTimer);
              sessionStorage.setItem(`zv_allowed_${rawPageId}`, 'true');
              grant(false);
            } else {
              // Secondary node: users/${uid}/page_access/${pageId}
              db.ref(`users/${currentUid}/page_access/${rawPageId}`).once('value', (uSnap) => {
                if (checkSettled) return;
                checkSettled = true;
                clearTimeout(safetyTimer);
                if (uSnap.val() === true) {
                  sessionStorage.setItem(`zv_allowed_${rawPageId}`, 'true');
                  grant(false);
                } else {
                  deny();
                }
              }, () => {
                if (!checkSettled) { checkSettled = true; clearTimeout(safetyTimer); deny(); }
              });
            }
          }, () => {
            if (!checkSettled) { checkSettled = true; clearTimeout(safetyTimer); deny(); }
          });
        } else {
          clearTimeout(safetyTimer);
          checkSettled = true;
          deny();
        }
      };

      runRestrictedCheck(auth ? auth.currentUser : null);

      if (auth) {
        auth.onAuthStateChanged((user) => {
          if (!checkSettled) {
            if (user) {
              runRestrictedCheck(user);
            } else {
              setTimeout(() => {
                if (!checkSettled) {
                  const s = getSession();
                  if (!s.uid && !s.isAdmin) {
                    checkSettled = true;
                    deny();
                  }
                }
              }, 1600);
            }
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

      const rawPageId = (this.config.pageId && typeof this.config.pageId === 'string') ? this.config.pageId.trim() : '';
      const hasPageRestriction = Boolean(rawPageId !== '');

      // Only restrict pages with a non-empty pageId! Free access pages require zero permissions!
      if (hasPageRestriction && this.hasPermission === false) {
        this.showAccessDeniedModal("Your account does not have the required permissions to access this video. If you believe this is a mistake, please contact the administrator for assistance.");
        return;
      }

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

      const { auth, db } = ensureFirebase();
      const self = this;

      // Ensure Firebase Auth state has restored from storage
      await this.resolveAuthToken(2000);

      const proceedWithStreamData = (data) => {
        if (!data || (!data.url && typeof data !== 'string')) {
          alert("Video unavailable");
          return;
        }

        let videoUrl = typeof data === 'string' ? data : (data.url || data.src || '');
        if (videoUrl.startsWith('enc:')) {
          try { videoUrl = atob(videoUrl.slice(4)); } catch (_) {}
        }

        let artSubtitles = [];
        if (data.subtitles) {
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

        const introEnd = (data.introEnd !== undefined) ? data.introEnd : (ep.introEnd || 0);
        window.introEndTime = introEnd;

        // If player is already running with the same stream URL
        if (self.art && self.art.video && self.art.option && self.art.option.url === videoUrl) {
          if (ep.time !== undefined) {
            self.art.currentTime = ep.time;
            self.art.play().catch(() => {});
          }
          return;
        }

        self.destroyPlayer();

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const defaultSub = artSubtitles.find(s => s.default) || artSubtitles[0];

        const artConfig = {
          container: '#artplayer',
          url: videoUrl,
          title: data.title || ep.title,
          poster: ep.image || self.config.poster || 'https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png',
          volume: 0.7,
          isLive: false,
          muted: false,
          autoplay: true,
          fullscreen: true,
          fullscreenWeb: true,
          miniProgressBar: true,
          mutex: true,
          airplay: true,
          theme: self.config.theme || '#ffffff',
          autoOrientation: true,
          isMobile: false,
          setting: true,
          hotkey: true,
          moreVideoAttr: {
            playsInline: true,
            'webkit-playsinline': true
          },
          subtitle: {
            url: defaultSub ? defaultSub.url : '',
            type: 'vtt',
            encoding: 'utf-8',
            style: {
              color: '#fff',
              fontSize: isMobile ? '16px' : '18px',
              textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000',
              background: 'none',
              marginBottom: isMobile ? '20px' : '10px'
            }
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

        if (typeof Artplayer === 'undefined') {
          console.error('Artplayer is not loaded.');
          return;
        }

        self.art = new Artplayer(artConfig);
        window.art = self.art;

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

        self.setupGesturesAndEvents(ep);
      };

      if (ep.url || this.config.videoUrl) {
        proceedWithStreamData({
          url: ep.url || this.config.videoUrl,
          title: ep.title,
          subtitles: ep.subtitles || null,
          introEnd: ep.introEnd || 0
        });
      } else if (this.config.dbNode && db) {
        // Direct Firebase query structure as requested for free access
        const targetNode = (this.config.dbNode === 'caratland2025') ? 'caratland2024' : this.config.dbNode;

        db.ref(`${targetNode}/${ep.id}`).once('value').then(snapshot => {
          const data = snapshot ? snapshot.val() : null;
          if (data && (data.url || typeof data === 'string')) {
            proceedWithStreamData(data);
            return;
          }

          // Fallback check between caratland2024 / caratland2025
          const altNode = (targetNode === 'caratland2024') ? 'caratland2025' : 'caratland2024';
          if (this.config.dbNode.includes('caratland')) {
            db.ref(`${altNode}/${ep.id}`).once('value').then(altSnap => {
              const altData = altSnap ? altSnap.val() : null;
              if (altData && (altData.url || typeof altData === 'string')) {
                proceedWithStreamData(altData);
              } else {
                alert("Video unavailable");
              }
            }).catch(() => {
              alert("Video unavailable");
            });
          } else {
            alert("Video unavailable");
          }
        }).catch(err => {
          // If primary node encountered permission rule or path mismatch, fallback to caratland2024
          if (targetNode !== 'caratland2024' && this.config.dbNode.includes('caratland')) {
            db.ref(`caratland2024/${ep.id}`).once('value').then(fbSnap => {
              const fbData = fbSnap ? fbSnap.val() : null;
              if (fbData && (fbData.url || typeof fbData === 'string')) {
                proceedWithStreamData(fbData);
              } else {
                alert("Video unavailable");
              }
            }).catch(() => {
              alert("Video unavailable");
            });
          } else {
            alert("Video unavailable");
          }
        });
      } else {
        alert("Video unavailable");
      }
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

      // Stop and disable player & poster
      this.destroyPlayer();
      const posterContainer = document.getElementById('poster-container');
      const playerContainer = document.getElementById('player-container');
      if (posterContainer) {
        posterContainer.style.pointerEvents = 'none';
      }
      if (playerContainer) {
        playerContainer.style.display = 'none';
        playerContainer.style.pointerEvents = 'none';
      }

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

      // Built-in resilient styling for immediate render (Pure black, no glassmorphism, no red)
      modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.90);
        color: #ffffff;
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
        <div class="access-denied-account" style="display:flex; align-items:center; justify-content:space-between; background:#0d0d0d; border:1px solid #222222; border-radius:10px; padding:9px 12px; margin-bottom:20px; font-size:12px; color:#a1a1aa; text-align:left;">
          <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Account ID: <strong style="color:#ffffff; font-family:monospace; font-size:11.5px;">${userUid}</strong></span>
          </div>
          <button type="button" id="zv-copy-uid-btn" style="background:#1c1c1f; border:1px solid #2e2e32; color:#ffffff; cursor:pointer; font-size:11px; font-weight:600; padding:4px 10px; border-radius:6px; transition:all 0.2s; flex-shrink:0;">Copy ID</button>
        </div>
      ` : '';

      modal.innerHTML = `
        <div class="access-denied-card" style="position:relative; max-width:420px; width:100%; background:#000000; border:1px solid #27272a; border-radius:14px; padding:28px 22px 20px; text-align:center; box-shadow:0 15px 35px rgba(0,0,0,0.9); font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing:border-box;">
          
          <div class="access-denied-icon-wrap" style="width:48px; height:48px; margin:0 auto 14px; border-radius:10px; background:#111111; border:1px solid #27272a; display:flex; align-items:center; justify-content:center; color:#ffffff;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>

          <h2 class="access-denied-title" style="font-size:20px; font-weight:700; color:#ffffff; margin:0 0 8px; letter-spacing:-0.2px;">Access Denied</h2>
          
          <p class="access-denied-message" style="font-size:13.5px; line-height:1.5; color:#a1a1aa; margin:0 0 18px;">
            ${displayMsg}
          </p>

          ${accountHtml}

          <div class="access-denied-actions" style="display:flex; gap:10px; width:100%; margin-bottom:8px;">
            <button type="button" id="zv-back-btn" class="access-denied-primary-btn" style="flex:1; padding:11px 16px; border-radius:8px; background:#ffffff; color:#000000; font-weight:600; font-size:13px; border:none; cursor:pointer; transition:opacity 0.2s; margin:0;">
              Return to Videos
            </button>
            <button type="button" id="zv-contact-btn" class="access-denied-secondary-btn" style="flex:1; padding:11px 16px; border-radius:8px; background:#111111; color:#ffffff; font-weight:500; font-size:13px; border:1px solid #27272a; cursor:pointer; transition:opacity 0.2s; margin:0;">
              Contact Admin
            </button>
          </div>

          <div class="access-denied-footer" style="font-size:12px; color:#71717a; margin-top:12px; display:flex; align-items:center; justify-content:center; gap:8px;">
            <span id="access-countdown-text">Redirecting in <strong id="access-countdown" style="color:#ffffff; font-weight:600;">6</strong>s</span>
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
          window.location.href = '/videos';
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
      const posterContainer = document.getElementById('poster-container');
      if (posterContainer) {
        posterContainer.style.pointerEvents = 'auto';
      }
      const playerContainer = document.getElementById('player-container');
      if (playerContainer) {
        playerContainer.style.pointerEvents = 'auto';
      }
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
