// ========================================================
// Zone Vault — User Session Cache & Instant Access
// ========================================================
(function() {
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
})();

window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-1B2RJ659GL');

// ----------------------------------------

(function() {
        function applyTheme(theme) {
            if (theme === 'light' || theme === '#ffffff' || theme === 'white') {
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
        if (savedTheme) { applyTheme(savedTheme); } 
        else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) { applyTheme('light'); }

        window.addEventListener('storage', (e) => {
            if (e.key === 'zoneTheme' || e.key === 'zoneVaultTheme') { applyTheme(e.newValue); }
        });
    })();

// ----------------------------------------

// --- GLOBAL FUNCTIONS FOR UI ---
window.playNextEpisodeGlobal = function() {
    if(!window.currentEpData) return;
    const currentIndex = playlistData.findIndex(item => item.id === window.currentEpData.id);
    if (currentIndex >= 0 && currentIndex < playlistData.length - 1) {
        const nextEp = playlistData[currentIndex + 1];
        loadAndPlayEpisode(nextEp.id, true);
    }
};

window.skipIntroGlobal = function() {
    if(!art || !window.introEndTime) return;
    art.seek = window.introEndTime;
    art.notice.show = 'Intro Skipped';
    window.hasSkippedIntro = true;
    if(art.layers.skipIntroLayer) art.layers.skipIntroLayer.style.display = 'none';
};

// --- 1. PLAYLIST DATA (Added introEnd: 0) ---
const playlistData = [
  { id: "1", title: "DAY 1 - SEVENTEEN [NEW_] WORLD TOUR IN OSAKA", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/CXM.png", introEnd: 0 },
  { id: "2", title: "DAY 2 - SEVENTEEN [NEW_] WORLD TOUR IN OSAKA", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/CXM.png", introEnd: 0 },
  { id: "3", title: "DAY 3 - SEVENTEEN [NEW_] WORLD TOUR IN OSAKA", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/CXM.png", introEnd: 0 }
];

const playlistContainer = document.getElementById('playlist-items');
const posterContainer = document.getElementById('poster-container');
const playerContainer = document.getElementById('player-container');
const mainTitle = document.getElementById('main-title');
window.currentEpData = null;
let art = null; 

// --- 2. FIREBASE & ACCESS CONTROL ---
// Firebase configuration loaded dynamically (hidden from frontend)
(function() {
  let cfg = null;
  try {
    const cached = sessionStorage.getItem("__zv_cfg");
    if (cached) cfg = JSON.parse(cached);
  } catch(e) {}

  if (!cfg) {
    fetch("/api/firebase-config").then(r => r.json()).then(remoteCfg => {
      sessionStorage.setItem("__zv_cfg", JSON.stringify(remoteCfg));
      if (typeof firebase !== "undefined" && !firebase.apps.length) {
        firebase.initializeApp(remoteCfg);
      }
    }).catch(() => {});
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
  if (typeof firebase !== "undefined" && !firebase.apps.length) {
    firebase.initializeApp(cfg);
  }
})();
const auth = firebase.auth();
const db = firebase.database();

const PAGE_ID = "cxmdoubleup"; 

// --- UPDATED AUTH LOGIC WITH ADMIN TOAST ---
auth.onAuthStateChanged(user => {
    const cachedUserObj = (function(){ try { return JSON.parse(localStorage.getItem("zone_vault_user_cache")); } catch(e){ return null; } })();
        if (cachedUserObj && (cachedUserObj.status === "approved" || cachedUserObj.isAdmin)) {
          // Instant access granted via user cache
        } else if (!user) { showAccessDeniedModal("You must be logged in to view this content."); return; }
    initTheme();

    db.ref('users/' + user.uid).once('value').then(snapshot => {
        const userData = snapshot.val() || {};
        const role = (userData.role || 'member').toLowerCase();

        if (role === 'admin') {
            removeAccessDeniedModal();
            console.log("Admin access granted");
            
            const toast = document.getElementById('adminToast');
            if(toast) {
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 4000);
            }
        } else {
            db.ref(`page_access/${PAGE_ID}/${user.uid}`).on('value', (accessSnapshot) => {
                const isAllowed = accessSnapshot.val();
                if (isAllowed === true) { 
                    removeAccessDeniedModal(); 
                } else { 
                    showAccessDeniedModal("This content is restricted. Your account does not have permission."); 
                }
            });
        }
    });
});

function initTheme() {
    const savedTheme = localStorage.getItem('zoneTheme') || 'dark';
    const isDark = savedTheme === 'dark';
    if (!isDark) { document.body.classList.add('light-mode'); }
    else { document.body.classList.remove('light-mode'); }
}

// --- SAFE REDIRECT HELPER ---
function goBackSafe() {
    window.location.href = 'https://zonevault.site/videos'; 
}

let redirectTimer = null;

function showAccessDeniedModal(msg) {
    if(document.querySelector('.access-denied-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'access-denied-modal';
    
    modal.innerHTML = `
        <strong style="color:#FF4444; font-size:30px; margin-bottom:15px;">Access Denied</strong>
        <div style="font-size:16px; margin-bottom:20px;">${msg}</div>
        <div style="font-size:14px; color:#aaa; margin-bottom:20px;">
            Redirecting back in <span id="cnt" style="color:white; font-weight:bold;">3</span> seconds...
        </div>
        <button onclick="goBackSafe()">GO BACK NOW</button>
    `;
    document.body.appendChild(modal);

    let timeLeft = 3;
    const countSpan = document.getElementById('cnt');

    if (redirectTimer) clearInterval(redirectTimer);

    redirectTimer = setInterval(() => {
        timeLeft--;
        if (countSpan) countSpan.textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(redirectTimer);
            goBackSafe();
        }
    }, 1000);
}

function removeAccessDeniedModal() {
    if (redirectTimer) {
        clearInterval(redirectTimer);
        redirectTimer = null;
    }
    const modal = document.querySelector('.access-denied-modal');
    if(modal) modal.remove();
}

// --- 3. ARTPLAYER & CUSTOM GESTURES (UPDATED WITH UI SYNCS) ---
function loadAndPlayEpisode(epId, updateUrl = true) {
    if (art) {
        if(art.hls) art.hls.destroy(); 
        art.destroy(false);
        art = null;
    }

    const ep = playlistData.find(item => item.id === epId);
    if (!ep) return;

    if (updateUrl) {
        const titleSlug = encodeURIComponent(ep.title.trim().replace(/\s+/g, '-'));
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('title', titleSlug);
        urlParams.set('session', Date.now());
        const newUrl = window.location.pathname + '?' + urlParams.toString();
        history.pushState({id: ep.id}, '', newUrl);
    }

    window.currentEpData = ep;
    window.hasSkippedIntro = false;
    window.introEndTime = ep.introEnd || 0;

    posterContainer.style.display = "none";
    playerContainer.style.display = "block";

    // Update active state in UI
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('active', 'is-paused');
        if(item.dataset.id === epId) item.classList.add('active');
    });

    let pageIdentifier = window.location.pathname.split("/").pop().replace(".html", "");
    if (!pageIdentifier || pageIdentifier === "") pageIdentifier = "index";
      
    const uniqueHistoryKey = `${ep.id}_${pageIdentifier}`;

    db.ref(`cxmincheon/${ep.id}`).once('value').then(async snapshot => {
      const data = snapshot.val();
      if(!data || !data.url) { alert("Video unavailable"); return; }

      const artConfig = {
          container: '#artplayer',
          url: data.url,
          title: data.title || ep.title,
          poster: ep.image,
          volume: 0.5,
          isLive: false,
          muted: false,
          autoplay: true,
          fullscreen: true,
          fullscreenWeb: true,
          miniProgressBar: true,
          mutex: true,
          airplay: true,
          theme: '#a1a1aa', // GRAY THEME RESTORED
          autoOrientation: true,
          isMobile: false, // Disable default gestures so our custom overlay works
          setting: true, 
          moreVideoAttr: {
              playsInline: true,
              'webkit-playsinline': true
          },
          customType: {
              m3u8: function (video, url, art) {
                  if (Hls.isSupported()) {
                      const hls = new Hls();
                      hls.loadSource(url);
                      hls.attachMedia(video);
                      art.hls = hls; 
                      
                      hls.on(Hls.Events.MANIFEST_PARSED, function () {
                          const levels = hls.levels.map((level, index) => {
                              return { html: (level.height ? level.height + 'P' : 'Unknown'), level: level.height, index: index };
                          });
                          levels.unshift({ html: 'Auto', index: -1, default: true });
                          art.setting.update({
                              name: 'quality', width: 150, html: 'Quality', tooltip: 'Auto',
                              selector: levels.map(item => ({ html: item.html, default: item.default, url: '#', $index: item.index })),
                              onSelect: function (item) { hls.currentLevel = item.$index; return item.html; },
                          });
                      });
                  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                      video.src = url;
                  }
              },
          },
      };

      // --- ULTIMATE SUBTITLE FIX: Manual Fetch + Blob ---
      if(data.subtitles) {
          console.log("Attempting to load subtitles:", data.subtitles);
          try {
              const subResponse = await fetch(data.subtitles);
              if (subResponse.ok) {
                  const subBlob = await subResponse.blob();
                  const localSubUrl = URL.createObjectURL(subBlob);
                  console.log("Subtitle loaded as Blob:", localSubUrl);

                  artConfig.subtitle = {
                      url: localSubUrl,
                      type: 'vtt',
                      encoding: 'utf-8',
                      // Styling handled by CSS
                  };
              } else {
                  console.error("Subtitle fetch failed:", subResponse.status);
              }
          } catch (err) {
              console.error("Subtitle Error (CORS or Network):", err);
              artConfig.subtitle = {
                  url: data.subtitles,
                  type: 'vtt',
              };
          }
      }

      art = new Artplayer(artConfig);

      // --- FORCE SHOW SUBTITLES ---
      art.on('ready', () => {
         if(art.subtitle) { 
             art.subtitle.show = true; 
             console.log("Subtitles forced ON");
         }
      });

      // Add UI Button Layers
      art.layers.add({
          name: 'nextEpLayer',
          html: '<button class="next-ep-btn" onclick="event.stopPropagation(); window.playNextEpisodeGlobal();">Next ⏭</button>',
          style: { display: 'none' } 
      });

      art.layers.add({
          name: 'skipIntroLayer',
          html: '<button class="skip-intro-btn" onclick="event.stopPropagation(); window.skipIntroGlobal();">Skip Intro</button>',
          style: { display: 'none' } 
      });

      // Sync Soundbar animations
      art.on('play', () => { document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.remove('is-paused')); });
      art.on('pause', () => { document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.add('is-paused')); });

      // --- CUSTOM DOUBLE TAP GESTURE LOGIC (DEBOUNCED) ---
      const catcher = document.getElementById('click-catcher');
      let clickTimer = null;
      let lastTapTime = 0;

      catcher.addEventListener('click', (e) => {
          const now = new Date().getTime();
          const timeSinceLastTap = now - lastTapTime;
            
          const rect = catcher.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const width = rect.width;

          if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
              clearTimeout(clickTimer);
              
              if (x < width * 0.35) {
                  art.seek = art.currentTime - 10;
                  showGestureFeedback('icon-rewind');
              } else if (x > width * 0.65) {
                  art.seek = art.currentTime + 10;
                  showGestureFeedback('icon-forward');
              } else {
                  art.toggle(); 
              }
          } else {
              clickTimer = setTimeout(() => {
                  art.toggle();
                  if(art.playing) showGestureFeedback('icon-play');
                  else showGestureFeedback('icon-pause');
              }, 300);
          }
          lastTapTime = now;
      });

      function showGestureFeedback(id) {
          const el = document.getElementById(id);
          el.classList.add('active');
          setTimeout(() => el.classList.remove('active'), 500);
      }

      // Resume Logic (USING UNIQUE KEY)
      const user = auth.currentUser;
      if (user) {
          db.ref('watchHistory/' + user.uid + '/' + uniqueHistoryKey).once('value').then(snap => {
              const saved = snap.val();
              if (saved && saved.currentTime > 0) {
                  art.on('ready', () => {
                      art.seek = saved.currentTime;
                      if(saved.currentTime > window.introEndTime) { window.hasSkippedIntro = true; }
                      art.play();
                      art.notice.show = 'Resumed from ' + formatTime(saved.currentTime);
                  });
              }
          });
      }

      // Save Logic & UI Buttons
      let lastSave = 0;
      art.on('video:timeupdate', () => {
          const now = Date.now();

          // Button Visibilities
          if (art.duration > 0 && art.layers.nextEpLayer) {
              const timeLeft = art.duration - art.currentTime;
              const currentIndex = playlistData.findIndex(item => item.id === window.currentEpData.id);
              const hasNext = currentIndex >= 0 && currentIndex < playlistData.length - 1;

              if (timeLeft <= 60 && hasNext) { art.layers.nextEpLayer.style.display = 'block'; } 
              else { art.layers.nextEpLayer.style.display = 'none'; }
          }

          if (window.introEndTime > 0 && art.layers.skipIntroLayer) {
              if (!window.hasSkippedIntro && art.currentTime > 0 && art.currentTime < window.introEndTime) {
                  art.layers.skipIntroLayer.style.display = 'block';
              } else {
                  art.layers.skipIntroLayer.style.display = 'none';
              }
          }

          // Save history
          if (auth.currentUser && window.currentEpData && !art.video.paused && now - lastSave > 5000) {
              const historyData = {
                  id: window.currentEpData.id,
                  title: window.currentEpData.title,
                  image: window.currentEpData.image,
                  currentTime: art.currentTime,
                  duration: art.duration || 0,
                  timestamp: now,
                  page: pageIdentifier 
              };
              db.ref('watchHistory/' + auth.currentUser.uid + '/' + uniqueHistoryKey).update(historyData);
              lastSave = now;
          }
      });

      mainTitle.textContent = data.title || ep.title;
    });
}

function formatTime(seconds) {
    const date = new Date(seconds * 1000);
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds();
    return `${mm}:${String(ss).padStart(2, '0')}`;
}

// Browser Back
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.id) loadAndPlayEpisode(event.state.id, false);
    else { 
        posterContainer.style.display = "flex"; 
        playerContainer.style.display = "none"; 
        document.querySelectorAll('.playlist-item').forEach(item => item.classList.remove('active', 'is-paused'));
        if(art) art.pause(); 
    }
});

// Render Playlist with Soundbar Indicator
playlistData.forEach(ep => {
  const epDiv = document.createElement('div');
  epDiv.className = 'playlist-item';
  epDiv.dataset.id = ep.id;

  const imgWrapper = document.createElement('div');
  imgWrapper.className = "playlist-img-wrapper";

  const img = document.createElement('img'); 
  img.src = ep.image; 
  img.loading="lazy";
  
  imgWrapper.appendChild(img);

  const textDiv = document.createElement('div'); 
  textDiv.className = "playlist-text";
  
  const title = document.createElement('span'); 
  title.className = "playlist-title"; 
  title.textContent = ep.title;
  textDiv.appendChild(title);

  // The Dancing Soundbars
  const indicator = document.createElement('div');
  indicator.className = 'playing-indicator';
  indicator.innerHTML = '<div class="bar"></div><div class="bar"></div><div class="bar"></div>';

  epDiv.appendChild(imgWrapper); 
  epDiv.appendChild(textDiv);
  epDiv.appendChild(indicator);

  epDiv.addEventListener('click', () => loadAndPlayEpisode(ep.id, true));
  playlistContainer.appendChild(epDiv);
});

// Init Load
window.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if(user) {
            const params = new URLSearchParams(window.location.search);
            const titleSlug = params.get('title');
            if(titleSlug) {
                const ep = playlistData.find(e => encodeURIComponent(e.title.trim().replace(/\s+/g, '-')) === titleSlug);
                if(ep) setTimeout(() => loadAndPlayEpisode(ep.id, false), 500);
            }
        }
    });
});

// /* sync-theme-domready */
function syncThemeAndPoster() {
    const isLight = document.documentElement.classList.contains('light-mode') || 
                    localStorage.getItem('zoneTheme') === 'light' || 
                    localStorage.getItem('zoneVaultTheme') === 'light';
    if (isLight) {
        document.documentElement.classList.add('light-mode');
        if (document.body) document.body.classList.add('light-mode');
    }
    const poster = document.getElementById('poster-container');
    if (poster && !poster.style.backgroundImage) {
        const thumb = (typeof THUMBNAIL !== 'undefined' && THUMBNAIL) 
            ? THUMBNAIL 
            : (typeof playlistData !== 'undefined' && playlistData.length > 0 && playlistData[0].image ? playlistData[0].image : '');
        if (thumb) poster.style.backgroundImage = 'url("' + thumb + '")';
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncThemeAndPoster);
} else {
    syncThemeAndPoster();
}
