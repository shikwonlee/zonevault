// ========================================================
// 1. Session & Access Verification (Runs Immediately)
// ========================================================
(function checkAccess() {
  const allowedPaths = [
    '/index.html', '/home.html', '/nanabnb.html', '/newtour.html',
    '/hxwfanconcert.html', '/svtholiday.html', '/arenatour.html',
    '/svtjapanconcert.html', '/touragain.html', '/gallery.html',
    '/profile.html', '/soon.html'
  ];

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
  } catch (e) {}

  let hasInternalAccess = sessionStorage.getItem('internalAccess') === 'true';
  const referrer = document.referrer;
  if (referrer) {
    try {
      const refUrl = new URL(referrer);
      if (refUrl.origin === window.location.origin && allowedPaths.includes(refUrl.pathname)) {
        sessionStorage.setItem('internalAccess', 'true');
        hasInternalAccess = true;
      }
    } catch (_) {}
  }

  const currentPage = window.location.pathname;
  const isIndexPage = currentPage.endsWith('index.html') || currentPage === '/';

  if (!hasInternalAccess && !isIndexPage) {
    document.addEventListener("DOMContentLoaded", () => {
      const modal = document.createElement('div');
      modal.className = 'access-denied-modal';
      modal.innerHTML = `
        <strong>🚫 Access Denied</strong>
        <div>You cannot access this page directly.<br>Please go through the homepage or allowed sections.</div>
        <div id="redirectTimer" style="margin-top:10px; opacity:0.7;">Redirecting in 3 seconds...</div>
        <button type="button" id="goBackBtn">Go Back</button>
      `;
      document.body.appendChild(modal);

      document.getElementById('goBackBtn')?.addEventListener('click', () => window.history.back());

      let countdown = 3;
      const interval = setInterval(() => {
        countdown--;
        const timer = document.getElementById('redirectTimer');
        if (timer) timer.textContent = `Redirecting in ${countdown} seconds...`;
        if (countdown <= 0) {
          clearInterval(interval);
          window.location.href = "index.html";
        }
      }, 1000);
    });
  }
})();

// ========================================================
// 2. Analytics & Theme Management
// ========================================================
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-1B2RJ659GL');

(function initTheme() {
  function applyTheme(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (theme === 'light' || theme === '#ffffff' || theme === 'white') {
      document.documentElement.classList.add('light-mode');
      if (meta) meta.setAttribute('content', '#f8f9fa');
    } else {
      document.documentElement.classList.remove('light-mode');
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
    if (e.key === 'zoneTheme' || e.key === 'zoneVaultTheme') applyTheme(e.newValue);
  });
})();

// ========================================================
// 3. Firebase Initialization
// ========================================================
(function initFirebase() {
  let cfg = null;
  try {
    const cached = sessionStorage.getItem("__zv_cfg");
    if (cached) cfg = JSON.parse(cached);
  } catch (e) {}

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

  if (typeof firebase !== "undefined" && !firebase.apps.length) {
    firebase.initializeApp(cfg);
  }
})();

const auth = firebase.auth();
const db = firebase.database();

// ========================================================
// 4. Playlist & Player Logic
// ========================================================
const playlistData = [
  { id: "1", title: "EP1. READY TO TIME OFF", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/inthesoop2.png", introEnd: 0 },
  { id: "2", title: "EP2. Thank you for your support", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/inthesoop2.png", introEnd: 0 },
  { id: "3", title: "EP3. Your smile is the most brilliant thing in the world", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/inthesoop2.png", introEnd: 0 },
  { id: "4", title: "EP4. It's been another exciting day.", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/inthesoop2.png", introEnd: 0 },
  { id: "5", title: "EP5. 우리 추억 더 밝게 빛나고", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/inthesoop2.png", introEnd: 0 },
  { id: "6", title: "EP6. Remember, We're Always Together", image: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/inthesoop2.png", introEnd: 0 }
];

let art = null;
let currentSubtitleUrls = [];
let episodeLoadToken = 0;
let currentHistoryKey = null;
let lastSavedHistory = null;
window.currentEpData = null;

const playlistContainer = document.getElementById('playlist-items');
const posterContainer = document.getElementById('poster-container');
const playerContainer = document.getElementById('player-container');
const mainTitle = document.getElementById('main-title');

function isAllowedMediaUrl(val) {
  try {
    const u = new URL(val, window.location.href);
    return u.protocol === 'https:';
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
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

window.playNextEpisodeGlobal = function() {
  if (!window.currentEpData) return;
  const idx = playlistData.findIndex(item => item.id === window.currentEpData.id);
  if (idx >= 0 && idx < playlistData.length - 1) {
    loadAndPlayEpisode(playlistData[idx + 1].id, true);
  }
};

window.skipIntroGlobal = function() {
  if (!art || !window.introEndTime) return;
  art.currentTime = window.introEndTime;
  art.notice.show = 'Intro Skipped';
  window.hasSkippedIntro = true;
  if (art.layers.skipIntroLayer) art.layers.skipIntroLayer.style.display = 'none';
};

async function loadAndPlayEpisode(epId, updateUrl = true) {
  const ep = playlistData.find(item => item.id === epId);
  if (!ep) return;

  const today = new Date();
  if (ep.date && new Date(ep.date) > today) {
    alert(`This episode is not yet available.\nRelease Date: ${ep.date}`);
    return;
  }

  const loadToken = ++episodeLoadToken;
  const pageIdentifier = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
  const historyKey = `${ep.id}_${pageIdentifier}`;

  if (updateUrl) {
    history.pushState({ id: ep.id }, '', `${window.location.pathname}?v=${encodeURIComponent(ep.id)}`);
  }

  window.currentEpData = ep;
  window.hasSkippedIntro = false;
  window.introEndTime = ep.introEnd || 0;
  currentHistoryKey = historyKey;
  lastSavedHistory = null;

  posterContainer.style.display = 'none';
  playerContainer.style.display = 'block';
  document.querySelectorAll('.playlist-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === epId);
    item.classList.remove('is-paused');
  });

  let snapshot;
  try {
    snapshot = await db.ref(`inthesoop2/${ep.id}`).once('value');
  } catch (error) {
    console.error('Video metadata request failed:', error);
    if (loadToken === episodeLoadToken) alert('Video unavailable');
    return;
  }
  if (loadToken !== episodeLoadToken) return;

  const data = snapshot.val();
  if (!data || !isAllowedMediaUrl(data.url)) {
    alert('Video unavailable or invalid media URL');
    return;
  }

  const subtitles = [];
  if (data.subtitles) {
    if (typeof data.subtitles === 'string' && isAllowedMediaUrl(data.subtitles)) {
      subtitles.push({ html: 'SUBTITLES', url: data.subtitles, default: true });
    } else if (typeof data.subtitles === 'object') {
      Object.entries(data.subtitles).forEach(([lang, url]) => {
        if (isAllowedMediaUrl(url)) {
          subtitles.push({ html: String(lang).toUpperCase(), url, default: String(lang).toLowerCase() === 'en' });
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
            const levels = hls.levels.map((level, index) => ({
              html: (level.height ? level.height + 'P' : 'Unknown'),
              level: level.height,
              index: index
            }));
            levels.unshift({ html: 'Auto', index: -1, default: true });
            artInstance.setting.update({
              name: 'quality', width: 150, html: 'Quality', tooltip: 'Auto',
              selector: levels.map(item => ({ html: item.html, default: item.default, url: '#', $index: item.index })),
              onSelect: function (item) { hls.currentLevel = item.$index; return item.html; }
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
  const nextButton = art.layers.nextEpLayer?.querySelector('.next-ep-btn');
  if (nextButton) {
    nextButton.addEventListener('click', e => {
      e.stopPropagation();
      window.playNextEpisodeGlobal();
    });
  }

  art.layers.add({
    name: 'skipIntroLayer',
    html: '<button type="button" class="skip-intro-btn">Skip Intro</button>',
    style: { display: 'none' }
  });
  const skipIntroBtn = art.layers.skipIntroLayer?.querySelector('.skip-intro-btn');
  if (skipIntroBtn) {
    skipIntroBtn.addEventListener('click', e => {
      e.stopPropagation();
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
      const idx = playlistData.findIndex(item => item.id === window.currentEpData.id);
      const hasNext = idx >= 0 && idx < playlistData.length - 1;
      art.layers.nextEpLayer.style.display = (art.duration - art.currentTime <= 60 && hasNext) ? 'block' : 'none';
    }

    if (window.introEndTime > 0 && art.layers.skipIntroLayer) {
      art.layers.skipIntroLayer.style.display = (!window.hasSkippedIntro && art.currentTime > 0 && art.currentTime < window.introEndTime) ? 'block' : 'none';
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
      db.ref(`watchHistory/${auth.currentUser.uid}/${currentHistoryKey}`).update(historyData).catch(console.error);
      lastSavedHistory = now;
    }
  });

  let saved = null;
  if (auth.currentUser) {
    try {
      saved = (await db.ref(`watchHistory/${auth.currentUser.uid}/${historyKey}`).once('value')).val();
    } catch (e) {
      console.error('Watch history read failed:', e);
    }
  }

  if (loadToken !== episodeLoadToken || !art) return;

  const resume = () => {
    if (loadToken !== episodeLoadToken || !art) return;
    if (saved && Number(saved.currentTime) > 0 && Number(saved.currentTime) < (art.duration || Infinity)) {
      art.currentTime = Number(saved.currentTime);
      if (saved.currentTime > window.introEndTime) window.hasSkippedIntro = true;
      art.notice.show = `Resumed from ${formatTime(saved.currentTime)}`;
    }
    art.play().catch(() => {});
  };

  if (art.video && art.video.readyState >= 1) resume();
  else art.once('video:loadedmetadata', resume);
}

// ========================================================
// 5. Controls & Setup
// ========================================================
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

posterContainer?.addEventListener('click', () => {
  if (playlistData.length > 0) loadAndPlayEpisode(playlistData[0].id, true);
});

window.addEventListener('popstate', (event) => {
  if (event.state && event.state.id) {
    loadAndPlayEpisode(event.state.id, false);
  } else {
    posterContainer.style.display = "flex";
    playerContainer.style.display = "none";
    mainTitle.textContent = '';
    document.querySelectorAll('.playlist-item').forEach(item => item.classList.remove('active', 'is-paused'));
    episodeLoadToken++;
    cleanupPlayer();
  }
});

// Render Playlists
playlistData.forEach(ep => {
  const epDiv = document.createElement('div');
  epDiv.className = 'playlist-item';
  epDiv.dataset.id = ep.id;

  const isLocked = ep.date && new Date(ep.date) > new Date();
  if (isLocked) epDiv.classList.add('locked');

  epDiv.innerHTML = `
    <div class="playlist-img-wrapper">
      <img src="${ep.image}" loading="lazy" alt="${ep.title}">
    </div>
    <div class="playlist-text">
      <span class="playlist-title">${ep.title}</span>
      ${ep.date ? `<span class="playlist-date" style="${isLocked ? 'color:#ff4444;' : ''}">${isLocked ? `Available: ${ep.date}` : ep.date}</span>` : ''}
    </div>
    <div class="playing-indicator">
      <div class="bar"></div><div class="bar"></div><div class="bar"></div>
    </div>
  `;

  epDiv.addEventListener('click', () => loadAndPlayEpisode(ep.id, true));
  playlistContainer?.appendChild(epDiv);
});

// Check query parameter on load
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  if (videoId) {
    setTimeout(() => loadAndPlayEpisode(videoId, false), 500);
  }
});
