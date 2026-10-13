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
                document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f8f9fa');
            } else {
                document.documentElement.classList.remove('light-mode');
                document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0a0a0c');
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

// --- GLOBAL FUNCTIONS ---
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

// --- 1. CONFIG & PLAYLIST DATA (THE SHADOW'S EDGE) ---
const playlistData = [
  { 
    id: "1", 
    title: "CxM [DOUBLE UP] LIVE PARTY in JAPAN c: sylveon.click", 
    image: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1771257326/cxm_qjoyfa.jpg",
    introEnd: 0
  }
];

const playlistContainer = document.getElementById('playlist-items');
const posterContainer = document.getElementById('poster-container');
const playerContainer = document.getElementById('player-container');
const mainTitle = document.getElementById('main-title');
window.currentEpData = null;
let art = null; 

// --- 2. FIREBASE SETUP ---
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

// --- 3. ARTPLAYER & LOGIC ---
function loadAndPlayEpisode(epId, updateUrl = true) {
    const ep = playlistData.find(item => item.id === epId);
    if (!ep) return;

    const today = new Date();
    if (ep.date) {
        const releaseDate = new Date(ep.date);
        if (releaseDate > today) {
            alert(`This episode is not yet available.\nRelease Date: ${ep.date}`);
            return; 
        }
    }

    if (updateUrl) {
        const newUrl = window.location.pathname + '?v=' + ep.id;
        history.pushState({id: ep.id}, '', newUrl);
    }

    window.currentEpData = ep;
    window.hasSkippedIntro = false;
    window.introEndTime = ep.introEnd || 0;

    posterContainer.style.display = "none";
    playerContainer.style.display = "block";

    document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('active', 'is-paused');
        if(item.dataset.id === epId) item.classList.add('active');
    });

    let pageIdentifier = window.location.pathname.split("/").pop().replace(".html", "");
    if (!pageIdentifier || pageIdentifier === "") pageIdentifier = "videos"; 
    
    const uniqueHistoryKey = `${ep.id}_${pageIdentifier}`;

    // FIREBASE PATH FOR THE SHADOW'S EDGE
    db.ref(`cxminjapan/${ep.id}`).once('value').then(snapshot => {
      const data = snapshot.val();
      if(!data || !data.url) { alert("Video unavailable"); return; }

      let artSubtitles = [];
      if (data.subtitles) {
          Object.entries(data.subtitles).forEach(([lang, url]) => {
              artSubtitles.push({ html: lang.toUpperCase(), url: url, default: lang === 'en' });
          });
      }

      if(data.title) mainTitle.textContent = data.title;
      else mainTitle.textContent = ep.title;

      // ==============================================================
      // 1. IF PLAYER ALREADY EXISTS: SWITCH URL
      // ==============================================================
      if (art) {
          art.switchUrl(data.url, data.title || ep.title);
          art.poster = ep.image;

          if (artSubtitles.length > 0) {
              const defaultSub = artSubtitles.find(s => s.default) || artSubtitles[0];
              art.subtitle.switch(defaultSub.url, { name: defaultSub.html });
          } else {
              art.subtitle.switch('', { name: 'None' });
          }

          const user = auth.currentUser;
          if (user) {
              db.ref('watchHistory/' + user.uid + '/' + uniqueHistoryKey).once('value').then(snap => {
                  const saved = snap.val();
                  art.once('video:loadedmetadata', () => {
                      if (saved && saved.currentTime > 0) {
                          art.currentTime = saved.currentTime;
                          if(saved.currentTime > window.introEndTime) { window.hasSkippedIntro = true; }
                          art.notice.show = 'Resumed video';
                      }
                      art.play();
                  });
              });
          } else {
              art.play();
          }
          return; 
      }

      // ==============================================================
      // 2. IF FIRST TIME: INITIALIZE PLAYER
      // ==============================================================
      art = new Artplayer({
          container: '#artplayer',
          url: data.url,
          title: data.title || ep.title,
          poster: ep.image,
          volume: 0.5,
          isLive: false,
          muted: false,
          autoplay: true,
          setting: true,
          fullscreen: true,
          miniProgressBar: true,
          autoOrientation: true,
          lock: true,
          fastForward: true,
          mutex: true,
          backdrop: true,
          playsInline: true,
          autoPlayback: true,
          airplay: true,
          theme: '#a1a1aa',
          
          subtitle: {
              url: artSubtitles.find(s => s.default)?.url || '',
              type: 'vtt',
              encoding: 'utf-8',
              style: {
                  color: '#ffffff',
                  textAlign: 'center',
                  background: 'none'
              }
          },

          moreVideoAttr: {
              playsInline: true,
              'webkit-playsinline': true,
              'x5-video-player-type': 'h5',
              'x5-video-player-fullscreen': 'true',
              'x5-video-orientation': 'landscape'
          },
          
          customType: {
              m3u8: function (video, url) {
                  if (art && art.hls) { art.hls.destroy(); }
                  if (Hls.isSupported()) {
                      const hls = new Hls();
                      hls.loadSource(url);
                      hls.attachMedia(video);
                      if (art) art.hls = hls; 

                      // --- DYNAMIC QUALITY LOGIC ---
                      hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                          let qualityOptions = [{ html: 'Auto', level: -1, default: true }];
                          
                          data.levels.forEach((level, index) => {
                              qualityOptions.push({
                                  html: level.height + 'p',
                                  level: index,
                                  default: false
                              });
                          });

                          // Sort so Auto is first, then highest to lowest resolution
                          qualityOptions.sort((a, b) => {
                              if (a.level === -1) return -1;
                              if (b.level === -1) return 1;
                              return b.level - a.level;
                          });

                          // Add the Quality menu dynamically to Artplayer
                          art.setting.add({
                              name: 'video-quality',
                              html: 'Quality',
                              tooltip: 'Auto',
                              width: 200,
                              selector: qualityOptions,
                              onSelect: function (item) {
                                  if (art.hls) {
                                      art.hls.currentLevel = item.level;
                                  }
                                  return item.html;
                              }
                          });
                      });
                      // -----------------------------

                  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                      // Fallback for native HLS (e.g., Safari on iOS)
                      // Quality selection is handled natively by the browser in this case
                      video.src = url;
                  }
              },
          },
      });

      art.layers.add({
          name: 'nextEpLayer',
          html: '<button class="next-ep-btn" onclick="event.stopPropagation(); window.playNextEpisodeGlobal();">Next Episode ⏭</button>',
          style: { display: 'none' } 
      });

      art.layers.add({
          name: 'skipIntroLayer',
          html: '<button class="skip-intro-btn" onclick="event.stopPropagation(); window.skipIntroGlobal();">Skip Intro</button>',
          style: { display: 'none' } 
      });

      // --- PERMANENT WATERMARK LAYER (PURE CSS CONTROLLED) ---
      art.layers.add({
          name: 'watermarkLayer',
          html: '<img src="https://uploads.onecompiler.io/43ddry4jt/43s3sjvch/Zone%20Vault%20logo.png" class="artplayer-watermark">'
      });

      // Automatically add/remove '.is-fullscreen' class when entering/exiting Fullscreen
      art.on('fullscreen', (state) => {
          const watermarkObj = document.querySelector('.artplayer-watermark');
          if (watermarkObj) {
              if (state) {
                  watermarkObj.classList.add('is-fullscreen');
              } else {
                  watermarkObj.classList.remove('is-fullscreen');
              }
          }
      });

      if(artSubtitles.length > 0) {
          art.setting.add({
              html: 'Subtitles',
              width: 200,
              selector: artSubtitles.map(s => {
                  return { html: s.html, url: s.url, default: s.default };
              }),
              onSelect: function (item) {
                  art.subtitle.switch(item.url, { name: item.html });
                  return item.html;
              },
          });
      }

      art.on('play', () => { document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.remove('is-paused')); });
      art.on('pause', () => { document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.add('is-paused')); });

      const user = auth.currentUser;
      if (user) {
          db.ref('watchHistory/' + user.uid + '/' + uniqueHistoryKey).once('value').then(snap => {
              const saved = snap.val();
              if (saved && saved.currentTime > 0) {
                  art.on('ready', () => {
                      art.seek = saved.currentTime;
                      if(saved.currentTime > window.introEndTime) { window.hasSkippedIntro = true; }
                      art.play();
                      art.notice.show = 'Resumed video';
                  });
              }
          });
      }

      let lastSave = 0;
      art.on('video:timeupdate', () => {
          const now = Date.now();
          
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

          if (auth.currentUser && art && !art.video.paused && now - lastSave > 5000) {
              const dynamicHistoryKey = `${window.currentEpData.id}_${pageIdentifier}`;
              const historyData = {
                  id: window.currentEpData.id,
                  title: window.currentEpData.title,
                  image: window.currentEpData.image,
                  currentTime: art.currentTime,
                  duration: art.duration || 0,
                  timestamp: now,
                  page: pageIdentifier
              };
              db.ref('watchHistory/' + auth.currentUser.uid + '/' + dynamicHistoryKey).update(historyData);
              lastSave = now;
          }
      });
      
    }).catch(err => console.error(err));
}

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.id) loadAndPlayEpisode(event.state.id, false);
    else { 
        posterContainer.style.display = "flex"; 
        playerContainer.style.display = "none"; 
        mainTitle.textContent = '';
        document.querySelectorAll('.playlist-item').forEach(item => item.classList.remove('active', 'is-paused'));
        if(art) art.pause(); 
    }
});

playlistData.forEach(ep => {
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
  imgWrapper.className = "playlist-img-wrapper";
  
  const img = document.createElement('img'); 
  img.src = ep.image; 
  img.loading="lazy";
  img.alt = ep.title;
  
  imgWrapper.appendChild(img);
  
  const textDiv = document.createElement('div'); 
  textDiv.className = "playlist-text";
  
  const title = document.createElement('span'); 
  title.className = "playlist-title"; 
  title.textContent = ep.title;
  textDiv.appendChild(title);

  if (ep.status) {
      const statusSpan = document.createElement('span');
      statusSpan.className = "playlist-status";
      statusSpan.textContent = ep.status;
      textDiv.appendChild(statusSpan);
      if(ep.status === "NOT AVAILABLE") { epDiv.style.opacity = "0.6"; }
  }

  const indicator = document.createElement('div');
  indicator.className = 'playing-indicator';
  indicator.innerHTML = '<div class="bar"></div><div class="bar"></div><div class="bar"></div>';
  
  epDiv.appendChild(imgWrapper); 
  epDiv.appendChild(textDiv);
  epDiv.appendChild(indicator);
  
  epDiv.addEventListener('click', () => loadAndPlayEpisode(ep.id, true));
  playlistContainer.appendChild(epDiv);
});

window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    if (videoId) {
        setTimeout(() => loadAndPlayEpisode(videoId, false), 500);
    }
});

// ----------------------------------------

const allowedPaths = [
    '/index.html',
    '/home.html',
    '/nanabnb.html',
    '/newtour.html',
    '/hxwfanconcert.html',
    '/svtholiday.html',
    '/arenatour.html',
    '/svtjapanconcert.html',
    '/touragain.html',
    '/gallery.html',
    '/profile.html',
    '/soon.html'
  ];

  const currentPage = window.location.pathname;
  let hasInternalAccess = sessionStorage.getItem('internalAccess') === 'true';

  const referrer = document.referrer;
  const refPath = referrer ? new URL(referrer).pathname : null;
  const cameFromAllowedPage = refPath && allowedPaths.includes(refPath);

  if (cameFromAllowedPage) {
    sessionStorage.setItem('internalAccess', 'true');
    hasInternalAccess = true;
  }

  const isIndexPage = currentPage.endsWith('index.html') || currentPage === '/';
  if (!hasInternalAccess && !isIndexPage) {
    showAccessDeniedModal();
  }

  function showAccessDeniedModal() {
    const modal = document.createElement('div');
    modal.className = 'access-denied-modal';
    modal.innerHTML = `
      <strong>🚫 Access Denied</strong>
      <div>You cannot access this page directly.<br>
      Please go through the homepage or allowed sections.</div>
      <div id="redirectTimer" style="margin-top:10px; opacity: 0.7;">Redirecting in 3 seconds...</div>
      <button onclick="goBack()">Go Back</button>
    `;
    document.body.appendChild(modal);

    let countdown = 3;
    const timer = document.getElementById('redirectTimer');
    const interval = setInterval(() => {
      countdown--;
      timer.textContent = `Redirecting in ${countdown} seconds...`;
      if (countdown <= 0) {
        clearInterval(interval);
        window.location.href = "index.html";
      }
    }, 1000);
  }

  function goBack() {
    window.history.back();
  }