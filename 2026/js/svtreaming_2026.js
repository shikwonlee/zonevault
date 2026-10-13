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

const THUMBNAIL = "https://res.cloudinary.com/rabnzafj/image/upload/v1791539307/photo_2026-10-09_17-43-33_nexpcj.jpg";

const STREAM = {
    label: "STREAM",
    video: "https://stream.mux.com/iy800nIZUUgRbbdQN8TBK7rJSMQA00aBQ7o7qc02iq2i6g.m3u8",
    streams: [
        { label: "SEVENTEEN WORLD TOUR [Be The Sun] SEOUL", time: 38 },
        { label: "SEVENTEEN TOUR 'FOLLOW' TO SEOUL", time: 3902 },
        { label: "SEVENTEEN [RIGHT HERE] IN GOYANG ", time: 11073 }
    ]
};

// Each card = one start time inside the same video
const playlistData = STREAM.streams.map((s, i) => ({
    id: String(i + 1),
    title: s.label,
    time: s.time,
    image: THUMBNAIL
}));

const playlistContainer = document.getElementById('playlist-items');
const posterContainer = document.getElementById('poster-container');
const playerContainer = document.getElementById('player-container');
const mainTitle = document.getElementById('main-title');
window.currentEpData = null;
let art = null;
let episodeLoadToken = 0;
let currentHistoryKey = null;
let lastSavedHistory = null;
let pageIdentifier = window.location.pathname.split("/").pop().replace(".html", "") || "videos";

// Poster click starts the first stream
posterContainer.addEventListener('click', () => {
    if (playlistData.length > 0) {
        loadAndPlayEpisode(playlistData[0].id, true);
    }
});

function cleanupPlayer() {
    if (art && art.hls) {
        art.hls.destroy();
        art.hls = null;
    }
    if (art) {
        art.destroy(false);
        art = null;
    }
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

// --- 3. HELPERS ---
// Which card does this playback time belong to?
function getEpisodeByTime(t) {
    let found = playlistData[0];
    playlistData.forEach(ep => { if (t >= ep.time) found = ep; });
    return found;
}

// Highlight the card + update title
function setActiveEpisode(ep) {
    window.currentEpData = ep;
    currentHistoryKey = `${ep.id}_${pageIdentifier}`;
    lastSavedHistory = null;
    mainTitle.textContent = ep.title;
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === ep.id);
    });
}

// --- 4. ARTPLAYER & LOGIC ---
function loadAndPlayEpisode(epId, updateUrl = true) {
    const ep = playlistData.find(item => item.id === epId);
    if (!ep) return;

    if (updateUrl) {
        history.pushState({ id: ep.id }, '', `${window.location.pathname}?v=${encodeURIComponent(ep.id)}`);
    }

    posterContainer.style.display = "none";
    playerContainer.style.display = "block";
    setActiveEpisode(ep);

    // Player already running -> just jump to the card's time
    if (art && art.video) {
        art.currentTime = ep.time;
        art.play().catch(() => {});
        return;
    }

    const loadToken = ++episodeLoadToken;
    cleanupPlayer();

    art = new Artplayer({
        container: '#artplayer',
        url: STREAM.video,
        type: 'm3u8',
        title: STREAM.label,
        poster: THUMBNAIL,
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
        backdrop: false,
        playsInline: true,
        airplay: true,
        theme: '#a1a1aa',
        moreVideoAttr: {
            playsInline: true,
            'webkit-playsinline': true,
            'x5-video-player-type': 'h5',
            'x5-video-player-fullscreen': 'true',
            'x5-video-orientation': 'landscape'
        },
        customType: {
            m3u8(video, url, artInstance) {
                if (artInstance && artInstance.hls) artInstance.hls.destroy();
                if (Hls.isSupported()) {
                    // startPosition makes HLS begin right at the card's time
                    const hls = new Hls({ startPosition: ep.time });
                    hls.loadSource(url);
                    hls.attachMedia(video);
                    if (artInstance) artInstance.hls = hls;

                    hls.on(Hls.Events.MANIFEST_PARSED, function () {
                        const levels = hls.levels.map((level, index) => {
                            return { html: (level.height ? level.height + 'P' : 'Unknown'), level: level.height, index: index };
                        });
                        levels.unshift({ html: 'Auto', index: -1, default: true });
                        artInstance.setting.update({
                            name: 'quality', width: 150, html: 'Quality', tooltip: 'Auto',
                            selector: levels.map(item => ({ html: item.html, default: item.default, url: '#', $index: item.index })),
                            onSelect: function (item) { hls.currentLevel = item.$index; return item.html; },
                        });
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                }
            }
        }
    });

    // Safety net (also covers native HLS on Safari/iOS): seek to the start time once metadata is ready
    art.once('video:loadedmetadata', () => {
        if (loadToken !== episodeLoadToken || !art) return;
        if (Math.abs(art.currentTime - ep.time) > 2) art.currentTime = ep.time;
        art.play().catch(() => {});
    });

    art.on('play', () => document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.remove('is-paused')));
    art.on('pause', () => document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.add('is-paused')));

    art.on('video:timeupdate', () => {
        if (!art || !window.currentEpData) return;
        const now = Date.now();

        // Keep the active card in sync with the playback position
        const current = getEpisodeByTime(art.currentTime);
        if (current.id !== window.currentEpData.id) setActiveEpisode(current);

        if (auth.currentUser && !art.video.paused && (!lastSavedHistory || now - lastSavedHistory > 5000)) {
            const historyData = {
                id: window.currentEpData.id,
                title: window.currentEpData.title,
                image: window.currentEpData.image,
                currentTime: Number(art.currentTime) || 0,
                duration: Number(art.duration) || 0,
                timestamp: now,
                page: pageIdentifier
            };
            db.ref(`watchHistory/${auth.currentUser.uid}/${currentHistoryKey}`).update(historyData)
                .catch(error => console.error('Watch history save failed:', error));
            lastSavedHistory = now;
        }
    });
}

// --- 5. GESTURE LOGIC (Global) ---
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
        episodeLoadToken++;
        cleanupPlayer();
    }
});

// --- 6. BUILD THE CARDS ---
playlistData.forEach(ep => {
  const epDiv = document.createElement('div');
  epDiv.className = 'playlist-item';
  epDiv.dataset.id = ep.id;

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

  const timeSpan = document.createElement('span');
  timeSpan.className = "playlist-time";
  timeSpan.textContent = `Starts at ${formatTime(ep.time)}`;
  textDiv.appendChild(timeSpan);

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
  let cameFromAllowedPage = false;
  if (referrer) {
    try {
      const refUrl = new URL(referrer);
      if (refUrl.origin === window.location.origin && allowedPaths.includes(refUrl.pathname)) {
        cameFromAllowedPage = true;
      }
    } catch (_) {}
  }

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