import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ hoshixwoozi.js successfully loaded!");

// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
    apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
    authDomain: "tvnstream-b4497.firebaseapp.com",
    databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
    projectId: "tvnstream-b4497",
    storageBucket: "tvnstream-b4497.appspot.com",
    messagingSenderId: "308384754214",
    appId: "1:308384754214:web:2938e76cd29b288f75d4e7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ==========================================
// 1. THE MAINTENANCE KILL SWITCH (REALTIME)
// ==========================================
const maintenanceRef = ref(db, 'settings/maintenanceMode');
onValue(maintenanceRef, (snapshot) => {
    const isUnderMaintenance = snapshot.val();
    const currentPage = window.location.pathname;

    if (isUnderMaintenance === true && !currentPage.includes('maintenance')) {
        sessionStorage.setItem('returnPage', window.location.href);
        window.location.href = 'maintenance';
    } 
    else if (isUnderMaintenance === false && currentPage.includes('maintenance')) {
        const returnUrl = sessionStorage.getItem('returnPage') || 'home';
        window.location.href = returnUrl; 
    }
});

// ==========================================
// 2. DYNAMIC URL PARAMETERS LOGIC
// ==========================================
function updateDynamicURL(uid, role, status) {
  let token = sessionStorage.getItem('urlToken');
  if (!token) {
      token = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
      sessionStorage.setItem('urlToken', token);
  }
  const newUrl = `${window.location.pathname}?uid=${uid}&token=${token}&role=${role}&status=${status}`;
  window.history.pushState({ path: newUrl }, '', newUrl);
}

// ==========================================
// 3. UI, THEMES & TOAST
// ==========================================
window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('toast').classList.add('show');
        setTimeout(() => { document.getElementById('toast').classList.remove('show'); }, 4000);
    }, 1000);
});

function initTheme() {
    const savedTheme = localStorage.getItem('zoneTheme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-mode');
}
window.toggleTheme = function() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('zoneTheme', isLight ? 'light' : 'dark');
}
initTheme();

window.toggleMobileSidebar = function() {
    document.getElementById('mobileSidebar').classList.toggle('open');
}

window.logout = function() {
    if(confirm("Are you sure you want to log out?")) {
        signOut(auth).then(() => window.location.replace("/index"));
    }
}

// ==========================================
// 4. AUTH & SECURITY LOGIC
// ==========================================
onAuthStateChanged(auth, user => {
    if(user) {
        onValue(ref(db, 'users/' + user.uid), snap => {
            const data = snap.val() || {};
            const name = data.name || "Member";
            const pic = data.profilePicture || "https://via.placeholder.com/150";
            const role = (data.role || "member").toLowerCase();
            const isAdm = role === 'admin';

            if(document.getElementById("sidebar-name")) document.getElementById("sidebar-name").innerText = name;
            if(document.getElementById("sidebar-email")) document.getElementById("sidebar-email").innerText = user.email;
            if(document.getElementById("sidebar-pic")) document.getElementById("sidebar-pic").src = pic;
            
            if(document.getElementById("mobile-sidebar-name")) document.getElementById("mobile-sidebar-name").innerText = name;
            if(document.getElementById("mobile-sidebar-email")) document.getElementById("mobile-sidebar-email").innerText = user.email;
            if(document.getElementById("mobile-sidebar-pic")) document.getElementById("mobile-sidebar-pic").src = pic;

            const statusTxt = isAdm ? "ADMIN ACCESS" : "MEMBER ACCESS";
            if(document.getElementById("status-text-pc")) document.getElementById("status-text-pc").innerText = statusTxt;
            if(document.getElementById("status-text-mobile")) document.getElementById("status-text-mobile").innerText = statusTxt;
            
            if (isAdm) { sessionStorage.setItem('isAdmin', 'true'); sessionStorage.setItem('internalAccess', 'true'); }

            get(ref(db, 'joinRequests/' + user.uid + '/status')).then(reqSnap => {
                const reqStatus = reqSnap.val() || 'none';
                updateDynamicURL(user.uid, role, reqStatus);
            });
        });
    } else {
        window.location.replace("/index");
    }
});

const allowedPaths = ['/index', '/home', '/nanabnb', '/newtour', '/hxwfanconcert', '/svtholiday', '/arenatour', '/svtjapanconcert', '/touragain', '/gallery', '/profile', '/soon', '/videos', '/admin', '/collection'];
const isAdminFlag = sessionStorage.getItem('isAdmin') === 'true';
const currentPagePath = window.location.pathname;
let hasInternalAccessFlag = sessionStorage.getItem('internalAccess') === 'true';
const referer = document.referrer;
const refererPath = referer ? new URL(referer, location.origin).pathname : null;

const cameFromAllowedPageFlag = refererPath && allowedPaths.includes(refererPath);
if (cameFromAllowedPageFlag || isAdminFlag) { 
    sessionStorage.setItem('internalAccess', 'true'); 
    hasInternalAccessFlag = true; 
}

const isIndexPagePath = currentPagePath.endsWith('index') || currentPagePath === '/';

if (!hasInternalAccessFlag && !isIndexPagePath && !isAdminFlag) { 
    showAccessDeniedModal(); 
}

function showAccessDeniedModal() {
    const modal = document.createElement('div');
    modal.className = 'access-denied-modal';
    const card = document.createElement('div');
    card.className = 'access-card';
    card.innerHTML = `<div class="access-icon-box"><i class="fas fa-lock"></i></div><div class="access-title">Access Restricted</div><div class="access-desc">You are not authorized to view this page directly. Please log in or return home.</div><button class="access-btn" onclick="window.location.replace('/index')">Return to Safety</button><div style="margin-top:15px; font-size:12px; color:#555;">Redirecting automatically...</div>`;
    modal.appendChild(card);
    document.body.appendChild(modal);
    setTimeout(() => { window.location.replace("/index"); }, 3000);
}

// ==========================================
// 6. THIS CATEGORY'S VIDEOS
// (Each video's own HLS (.m3u8) link is reused directly for
//  previewing AND downloading, same pattern as the image gallery)
// ==========================================
const videos = [
    {
        title: "Hoshi",
        thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783259446/4b31a01d9c7706e49171fe247c099d8a31fb0ea0ebfc6c3a4e7452b6680aa9761_goqrhd.png",
        src: "https://n0x.cipherx.life/hls/MTx7b5Lq0x7c6Lq0t3c6Lq0Ia4MHd7c6Na4t3a4Mq0x7a4Mq0M0u4Gs20w6HBa4Or18e8w6n7Q2NTEf9y82g0q0ZG4f9x7m6Ue8w6n7o8p9ZW8f9y8TN1OD9q0y8WQ9w6n7o8p9ZW9Qy8GF5ZXJDZG4n7ZXs2d7z9XJo8x7a40c6Na4t3a4Ma4Qc6Nq0M0Ma4Q3Jm6Nb5Y0o8d7PTE4NS4b5Mq0Qf9MTI5Lq0E2OCZd7x7q00c6MCZa4x7n7NBZa41DSFJPTUUn7Y2t39LTE5Ma4p9c6OTt3d7Nr1Zg0x7a40c6Na4t3f9Mq0M3Lq0Ia4Lq0In7w6Ho8d7ZT0b5Jm6Nk4Za41k4TGl5c6ZFk4n7Yo8Bm6USZq0w6D04Jm6Vb5y8HM9MTt31Lq0Ib5Nr141NS45Mb5Zq0y8Go8o8y8m6RUv5XBo8PTAn7v5m6M9NDMn7z9WQ9MTx73Ma4Mc6Mq0M5MDE5NTp9.m3u8",
        link: "#" // TODO: replace with real download link
    },
    {
        title: "Woozi",
        thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783259446/4b31a01d9c7706e49171fe247c099d8a31fb0ea0ebfc6c3a4e7452b6680aa9761_goqrhd.png",
        src: "https://silentcore.cipherx.life/hls/MTx7b5Lq0x7d7Lq0Id7OC40OHd7c6Na4t3a4Mq0x7a4NTA4u4Gs20w6HBa4Or18e8w6n7Q0NDAf9y82g0q0ZG4f9x7m6Ue8w6n7o8p9ZW8f9y8TN1OD9q0y8WQ9w6n7o8p9ZW9Qy8GF5ZXJDZG4n7ZXs2d7z9XJo8x7a40c6Na4t3a4Ma4Qc6OTA4Nq0p9c6Jm6Nb5Y0o8d7PTE4NS4b5Mq0Qf9MTI5Lq0E2OCZd7x7q00c6MCZa4x7n7NBZa41DSFJPTUUn7Y2t39LTUa4Nq0E2Nq0p93NCZg0x7a40c6Na4t3f9Mq0M3Lq0Ia4Lq0Qb5Jm6R5x7GU9Mr1Za4z9Wx79Ma4NRz9VJn7y8ENf9x71En7Y3Q9OCZ1x7n7c6a4PTE4NS4c6ODAf9Mq0Aa4Lq0Ib5Jn7Nh1z9WVf9w6FR5x7GU9MCZ6x7a400Mb5Zk4ZD0c6Na4x7a4Ma4Ic6NTY1Mq0M1OQ.m3u8",
        link: "#" // TODO: replace with real download link
    }
];

function renderGallery() {
    const container = document.getElementById('grid-videos');
    if(!container) return;
    container.innerHTML = "";
    videos.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "video-card";
        div.innerHTML = `
            <img src="${item.thumb}" alt="${item.title}" loading="lazy" style="width:100%; height:100%; object-fit:cover; opacity:0.55;">
            <div class="video-thumb-overlay">
                <div class="play-icon"><i class="fas fa-play"></i></div>
            </div>
            <div class="video-title-overlay">${item.title}</div>
        `;
        div.onclick = () => window.openLightbox(index);
        container.appendChild(div);
    });
}

// --- VIDEO LIGHTBOX / ARTPLAYER LOGIC ---
const lightbox = document.getElementById("lightbox");
let currentVideoIndex = 0;
let art = null;

window.openLightbox = function(index) {
    currentVideoIndex = index;
    if(lightbox) {
        lightbox.classList.add("active");
        document.body.style.overflow = "hidden";
        document.addEventListener('keydown', handleKeyDown);
    }
    loadPlayer(index);
}

window.closeLightbox = function() {
    if(lightbox) lightbox.classList.remove("active");
    document.body.style.overflow = "auto";
    document.removeEventListener('keydown', handleKeyDown);
    destroyPlayer();
}

function destroyPlayer() {
    if (art) {
        art.destroy(false);
        art = null;
    }
}

function loadPlayer(index) {
    destroyPlayer();
    const item = videos[index];
    const container = document.getElementById('video-player-container');
    if (!container) return;

    try {
        art = new Artplayer({
            container: '#video-player-container',
            url: item.src,
            type: 'm3u8',
            theme: '#ffffff',
            autoplay: true,
            autoSize: false,
            autoMini: false,
            loop: false,
            flip: false,
            playbackRate: false,
            aspectRatio: false,
            setting: true,
            hotkey: true,
            pip: false,
            mutex: true,
            fullscreen: false,      // disable browser fullscreen button
            fullscreenWeb: false,   // disable web fullscreen button
            subtitleOffset: false,
            miniProgressBar: false,
            playsInline: true,
            lang: 'en',
            volume: 0.7,
            customType: {
                m3u8: function (video, url, art) {
                    if (Hls.isSupported()) {
                        const hls = new Hls();
                        hls.loadSource(url);
                        hls.attachMedia(video);
                        video.hls = hls;

                        // Build the quality options straight from the HLS manifest's
                        // own bitrate levels, and expose them as a "Quality" entry
                        // inside ArtPlayer's settings (gear) panel.
                        hls.on(Hls.Events.MANIFEST_PARSED, () => {
                            const levelOptions = hls.levels.map((level, i) => ({
                                html: level.height ? `${level.height}p` : `Level ${i + 1}`,
                                value: i,
                            }));
                            levelOptions.unshift({ html: 'Auto', value: -1, default: true });

                            art.setting.add({
                                html: 'Quality',
                                width: 200,
                                tooltip: 'Auto',
                                icon: '<i class="fas fa-sliders-h" style="color:#fff;"></i>',
                                selector: levelOptions,
                                onSelect: function (selectedItem) {
                                    hls.currentLevel = selectedItem.value;
                                    return selectedItem.html;
                                },
                            });
                        });
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = url;
                    }
                },
            },
        });
    } catch (err) {
        console.error('ArtPlayer failed to initialize:', err);
        container.innerHTML = `<div style="color:#fff; padding:20px; text-align:center;">Video failed to load. Please try again.</div>`;
    }
}

window.downloadVideo = function() {
    // Uses each video's own HLS link directly for download, mirroring how
    // the image collection reuses each image's own link for downloading.
    // TODO: swap these with dedicated download URLs once available.
    const item = videos[currentVideoIndex];
    if (item.link) {
        window.open(item.link, '_blank');
    } else {
        window.open(item.src, '_blank');
    }
}

function handleKeyDown(e) {
    if (e.key === 'Escape') window.closeLightbox();
}

// Initial render
renderGallery();
