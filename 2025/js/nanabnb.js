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
    if (!window.currentEpData) return;
    const currentIndex = playlistData.findIndex(item => item.id === window.currentEpData.id);
    if (currentIndex >= 0 && currentIndex < playlistData.length - 1) {
        const nextEp = playlistData[currentIndex + 1];
        loadAndPlayEpisode(nextEp.id, true);
    }
};

window.skipIntroGlobal = function() {
    if (!art || !window.introEndTime) return;
    art.currentTime = window.introEndTime;
    art.notice.show = 'Intro Skipped';
    window.hasSkippedIntro = true;
    if (art.layers.skipIntroLayer) art.layers.skipIntroLayer.style.display = 'none';
};

// --- 1. CONFIG & PLAYLIST DATA (NANA TOUR) ---
const playlistData = [
  { id: "1", title: "Highlight Preview", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_1.png", introEnd: 0 },
  { id: "2", title: "NANA bnb EP1-1", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_2.png", introEnd: 0 },
  { id: "3", title: "NANA bnb EP1-2", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_3.png", introEnd: 0 },
  { id: "4", title: "NANA bnb EP1-3", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_4.png", introEnd: 0 },
  { id: "5", title: "Commentary", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_5.png", introEnd: 0 },
  { id: "6", title: "NANA bnb EP2-1", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_6.png", introEnd: 0 },
  { id: "7", title: "NANA bnb EP2-2", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_7.png", introEnd: 0 },
  { id: "8", title: "NANA bnb EP2-3", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_8.png", introEnd: 0 },
  { id: "9", title: "NANA bnb EP3-1", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_9.png", introEnd: 0 },
  { id: "10", title: "NANA bnb EP3-2", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_10.png", introEnd: 0 },
  { id: "11", title: "NANA bnb EP3-3", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_11.png", introEnd: 0 },
  { id: "12", title: "NANA bnb EP3-4", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_12.png", introEnd: 0 },
  { id: "13", title: "NANA bnb EP4-1", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_13.png", introEnd: 0 },
  { id: "14", title: "NANA bnb EP4-2", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_14.png", introEnd: 0 },
  { id: "15", title: "NANA bnb EP4-3", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_15.png", introEnd: 0 },
  { id: "16", title: "NANA bnb EP4-4", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_16.png", introEnd: 0 },
  { id: "17", title: "NANA bnb EP5-1", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_17.png", introEnd: 0 },
  { id: "18", title: "NANA bnb EP5-2", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_18.png", introEnd: 0 },
  { id: "19", title: "NANA bnb EP5-3", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_19.png", introEnd: 0 },
  { id: "20", title: "NANA bnb EP6-1", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_20.png", introEnd: 0 },
  { id: "21", title: "NANA bnb EP6-2", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_21.png", introEnd: 0 },
  { id: "22", title: "Special Edition", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nanabnb/image_22.png", introEnd: 0 }
];

const playlistContainer = document.getElementById('playlist-items');
const posterContainer = document.getElementById('poster-container');
const playerContainer = document.getElementById('player-container');
const mainTitle = document.getElementById('main-title');
window.currentEpData = null;
let art = null;

// Poster click starts the first episode
posterContainer.addEventListener('click', () => {
    if (playlistData.length > 0) {
        loadAndPlayEpisode(playlistData[0].id, true);
    }
});

function cleanupPlayer() {
    if (art) {
        try {
            if (art.hls) {
                art.hls.destroy();
                art.hls = null;
            }
            art.destroy(false);
        } catch (e) {
            console.warn(e);
        }
        art = null;
    }
    const playerEl = document.getElementById('artplayer');
    if (playerEl) playerEl.innerHTML = '';
}

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
        if (item.dataset.id === epId) item.classList.add('active');
    });

    let pageIdentifier = window.location.pathname.split("/").pop().replace(".html", "") || "nanabnb";
    const uniqueHistoryKey = `${ep.id}_${pageIdentifier}`;

    // FIREBASE PATH FOR NANA TOUR
    db.ref(`urlnanabnb/${ep.id}`).once('value').then(snapshot => {
      const data = snapshot.val();
      if (!data || !data.url) { alert("Video unavailable"); return; }

      let artSubtitles = [];
      if (data.subtitles) {
          Object.entries(data.subtitles).forEach(([lang, url]) => {
              artSubtitles.push({ html: lang.toUpperCase(), url: url, default: lang === 'en' });
          });
      }

      if (data.title) mainTitle.textContent = data.title;
      else mainTitle.textContent = ep.title;

      cleanupPlayer();

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
          theme: '#a1a1aa',
          
          subtitle: {
              url: (artSubtitles.find(s => s.default) || artSubtitles[0])?.url || '',
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
              m3u8: function (video, url, artInstance) {
                  if (Hls.isSupported()) {
                      if (artInstance && artInstance.hls) artInstance.hls.destroy();
                      const hls = new Hls();
                      hls.loadSource(url);
                      hls.attachMedia(video);
                      if (artInstance) artInstance.hls = hls;

                      hls.on(Hls.Events.MANIFEST_PARSED, function () {
                          if (hls.levels && hls.levels.length > 1) {
                              const levels = hls.levels.map((level, index) => ({
                                  html: (level.height ? level.height + 'P' : 'Level ' + (index + 1)),
                                  index: index
                              }));
                              levels.unshift({ html: 'Auto', index: -1, default: true });
                              try {
                                  artInstance.setting.add({
                                      name: 'quality',
                                      html: 'Quality',
                                      width: 150,
                                      tooltip: 'Auto',
                                      selector: levels,
                                      onSelect: function (item) {
                                          hls.currentLevel = item.index;
                                          return item.html;
                                      }
                                  });
                              } catch (e) {}
                          }
                      });
                  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                      video.src = url;
                  }
              },
          },
      });

      art.layers.add({
          name: 'nextEpLayer',
          html: '<button type="button" class="next-ep-btn" onclick="event.stopPropagation(); window.playNextEpisodeGlobal();">Next Episode ⏭</button>',
          style: { display: 'none' } 
      });

      art.layers.add({
          name: 'skipIntroLayer',
          html: '<button type="button" class="skip-intro-btn" onclick="event.stopPropagation(); window.skipIntroGlobal();">Skip Intro</button>',
          style: { display: 'none' } 
      });

      if (artSubtitles.length > 0) {
          art.setting.add({
              html: 'Subtitles',
              width: 200,
              selector: artSubtitles.map(s => ({ html: s.html, url: s.url, default: s.default })),
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
                  art.once('ready', () => {
                      art.currentTime = saved.currentTime;
                      if (saved.currentTime > window.introEndTime) { window.hasSkippedIntro = true; }
                      art.notice.show = 'Resumed from ' + formatTime(saved.currentTime);
                  });
              }
          }).catch(err => console.error('Watch history error:', err));
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
      
    }).catch(err => console.error(err));
}

// --- 4. GESTURE LOGIC (Global) ---
const catcher = document.getElementById('click-catcher');
let clickTimer = null;
let lastTapTime = 0;

function showGestureFeedback(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 500);
}

if (catcher) {
    catcher.addEventListener('click', (e) => {
        if (!art) return;
        const now = Date.now();
        const timeSinceLastTap = now - lastTapTime;
        const rect = catcher.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;

        if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
            clearTimeout(clickTimer);
            if (x < width * 0.35) {
                art.currentTime = Math.max(0, art.currentTime - 10);
                showGestureFeedback('icon-rewind');
            } else if (x > width * 0.65) {
                art.currentTime = Math.min(art.duration || Infinity, art.currentTime + 10);
                showGestureFeedback('icon-forward');
            } else {
                art.toggle();
            }
        } else {
            clickTimer = setTimeout(() => {
                art.toggle();
                if (art.playing) showGestureFeedback('icon-play');
                else showGestureFeedback('icon-pause');
            }, 300);
        }
        lastTapTime = now;
    });
}

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.id) loadAndPlayEpisode(event.state.id, false);
    else { 
        posterContainer.style.display = "flex"; 
        playerContainer.style.display = "none"; 
        mainTitle.textContent = '';
        document.querySelectorAll('.playlist-item').forEach(item => item.classList.remove('active', 'is-paused'));
        cleanupPlayer();
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
  img.loading = "lazy";
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
      if (ep.status === "NOT AVAILABLE") { epDiv.style.opacity = "0.6"; }
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