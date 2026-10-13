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
    if (!art || !window.introEndTime) return;
    art.currentTime = window.introEndTime;
    art.notice.show = 'Intro Skipped';
    window.hasSkippedIntro = true;
    if (art.layers.skipIntroLayer) art.layers.skipIntroLayer.style.display = 'none';
};

// --- 1. PLAYLIST DATA (Osaka Specific) ---
const playlistData = [
  { id: "1", title: "DAY 1 - SEVENTEEN [NEW_] WORLD TOUR IN OSAKA", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/new-tour.png", introEnd: 0 },
  { id: "3", title: "DAY 2 - SEVENTEEN [NEW_] WORLD TOUR IN OSAKA", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/new-tour.png", introEnd: 0 },
  { id: "5", title: "DAY 3 - SEVENTEEN [NEW_] WORLD TOUR IN OSAKA", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/new-tour.png", introEnd: 0 }
];

const playlistContainer = document.getElementById('playlist-items');
const posterContainer = document.getElementById('poster-container');
const playerContainer = document.getElementById('player-container');
const mainTitle = document.getElementById('main-title');
window.currentEpData = null;
let art = null;
let currentSubtitleUrls = [];
let episodeLoadToken = 0;
let currentHistoryKey = null;
let lastSavedHistory = null;

// Poster click starts the first episode
posterContainer.addEventListener('click', () => {
    if (playlistData.length > 0) {
        loadAndPlayEpisode(playlistData[0].id, true);
    }
});

function isAllowedMediaUrl(value) {
    try {
        const url = new URL(value, window.location.href);
        return url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function cleanupPlayer() {
    if (art && art.hls) {
        art.hls.destroy();
        art.hls = null;
    }
    if (art) {
        art.destroy(false);
        art = null;
    }
    currentSubtitleUrls.forEach(url => URL.revokeObjectURL(url));
    currentSubtitleUrls = [];
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

const PAGE_ID = "jpnnewtour"; 

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

function goBackSafe() {
    window.location.href = '/videos'; 
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

// --- 3. ARTPLAYER & LOGIC ---
async function loadAndPlayEpisode(epId, updateUrl = true) {
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

    const loadToken = ++episodeLoadToken;
    let pageIdentifier = window.location.pathname.split("/").pop().replace(".html", "") || "videos";
    const historyKey = `${ep.id}_${pageIdentifier}`;

    if (updateUrl) {
        history.pushState({ id: ep.id }, '', `${window.location.pathname}?v=${encodeURIComponent(ep.id)}`);
    }

    window.currentEpData = ep;
    window.hasSkippedIntro = false;
    window.introEndTime = ep.introEnd || 0;
    currentHistoryKey = historyKey;
    lastSavedHistory = null;

    posterContainer.style.display = "none";
    playerContainer.style.display = "block";

    document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === epId);
        item.classList.remove('is-paused');
    });

    let snapshot;
    try {
        snapshot = await db.ref(`newtourjpn/${ep.id}`).once('value');
    } catch (error) {
        console.error('Video metadata request failed:', error);
        if (loadToken === episodeLoadToken) alert('Video unavailable');
        return;
    }
    if (loadToken !== episodeLoadToken) return;

    const data = snapshot.val();
    if (!data || !isAllowedMediaUrl(data.url)) {
        alert("Video unavailable or invalid media URL");
        return;
    }

    const subtitles = [];
    if (data.subtitles) {
        if (typeof data.subtitles === 'string' && isAllowedMediaUrl(data.subtitles)) {
            subtitles.push({ html: 'SUBTITLES', url: data.subtitles, default: true });
        } else if (typeof data.subtitles === 'object') {
            Object.entries(data.subtitles).forEach(([lang, url]) => {
                if (isAllowedMediaUrl(url)) {
                    subtitles.push({ html: String(lang).toUpperCase(), url: url, default: String(lang).toLowerCase() === 'en' });
                }
            });
        }
    }

    mainTitle.textContent = data.title || ep.title;

    cleanupPlayer();

    const defaultSubtitle = subtitles.find(s => s.default) || subtitles[0];

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
                    const hls = new Hls();
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

    art.layers.add({
        name: 'nextEpLayer',
        html: '<button type="button" class="next-ep-btn">Next Episode ⏭</button>',
        style: { display: 'none' }
    });
    const nextButton = art.layers.nextEpLayer && art.layers.nextEpLayer.querySelector('.next-ep-btn');
    if (nextButton) {
        nextButton.addEventListener('click', event => {
            event.stopPropagation();
            window.playNextEpisodeGlobal();
        });
    }

    art.layers.add({
        name: 'skipIntroLayer',
        html: '<button type="button" class="skip-intro-btn">Skip Intro</button>',
        style: { display: 'none' }
    });
    const skipIntroButton = art.layers.skipIntroLayer && art.layers.skipIntroLayer.querySelector('.skip-intro-btn');
    if (skipIntroButton) {
        skipIntroButton.addEventListener('click', event => {
            event.stopPropagation();
            window.skipIntroGlobal();
        });
    }

    if (subtitles.length) {
        art.setting.add({
            html: 'Subtitles', width: 200,
            selector: subtitles.map(s => ({ html: s.html, url: s.url, default: s.default })),
            onSelect(item) {
                art.subtitle.switch(item.url, { name: item.html });
                return item.html;
            }
        });
    }

    art.on('play', () => document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.remove('is-paused')));
    art.on('pause', () => document.querySelectorAll('.playlist-item.active').forEach(item => item.classList.add('is-paused')));

    art.on('video:timeupdate', () => {
        if (!art || !window.currentEpData || !currentHistoryKey) return;
        const now = Date.now();

        if (art.duration > 0 && art.layers.nextEpLayer) {
            const currentIndex = playlistData.findIndex(item => item.id === window.currentEpData.id);
            const hasNext = currentIndex >= 0 && currentIndex < playlistData.length - 1;
            art.layers.nextEpLayer.style.display = (art.duration - art.currentTime <= 60 && hasNext) ? 'block' : 'none';
        }

        if (window.introEndTime > 0 && art.layers.skipIntroLayer) {
            if (!window.hasSkippedIntro && art.currentTime > 0 && art.currentTime < window.introEndTime) {
                art.layers.skipIntroLayer.style.display = 'block';
            } else {
                art.layers.skipIntroLayer.style.display = 'none';
            }
        }

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

    let saved = null;
    if (auth.currentUser) {
        try {
            saved = (await db.ref(`watchHistory/${auth.currentUser.uid}/${historyKey}`).once('value')).val();
        } catch (error) {
            console.error('Watch history read failed:', error);
        }
    }
    if (loadToken !== episodeLoadToken || !art) return;

    const resume = () => {
        if (loadToken !== episodeLoadToken || !art) return;
        if (saved && Number(saved.currentTime) > 0 && Number(saved.currentTime) < (art.duration || Infinity)) {
            art.currentTime = Number(saved.currentTime);
            if (saved.currentTime > window.introEndTime) { window.hasSkippedIntro = true; }
            art.notice.show = `Resumed from ${formatTime(saved.currentTime)}`;
        }
        art.play().catch(() => {});
    };
    if (art.video && art.video.readyState >= 1) resume();
    else art.once('video:loadedmetadata', resume);
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
        episodeLoadToken++;
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