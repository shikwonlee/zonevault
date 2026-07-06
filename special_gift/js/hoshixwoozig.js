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
// (Each video now points to its AnonMP4 EMBED page, not a raw .m3u8.
//  We render that embed inside an <iframe> in the lightbox, so AnonMP4
//  handles playback/expiration on their end — nothing to update here
//  when a manifest link rotates.)
// ==========================================
const videos = [
    {
        title: "Hoshi",
        thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783259446/4b31a01d9c7706e49171fe247c099d8a31fb0ea0ebfc6c3a4e7452b6680aa9761_goqrhd.png",
        embed: "https://anonmp4.help/embed/OVHelSkqLHCoVE1"
    },
    {
        title: "Woozi",
        thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783259446/4b31a01d9c7706e49171fe247c099d8a31fb0ea0ebfc6c3a4e7452b6680aa9761_goqrhd.png",
        embed: "https://anonmp4.help/embed/NyBMQlSOeG9l4cg"
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

// --- VIDEO LIGHTBOX (IFRAME EMBED) LOGIC ---
const lightbox = document.getElementById("lightbox");
let currentVideoIndex = 0;

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
    const container = document.getElementById('video-player-container');
    if (container) container.innerHTML = "";
}

function loadPlayer(index) {
    destroyPlayer();
    const item = videos[index];
    const container = document.getElementById('video-player-container');
    if (!container) return;

    try {
        const iframe = document.createElement('iframe');
        iframe.src = item.embed;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        container.appendChild(iframe);
    } catch (err) {
        console.error('Embed failed to load:', err);
        container.innerHTML = `<div style="color:#fff; padding:20px; text-align:center;">Video failed to load. Please try again.</div>`;
    }
}

// downloadVideo removed: there is no direct file/manifest URL to download
// anymore since playback now goes through AnonMP4's own embed player.
// If you want a "watch on AnonMP4" button instead, wire it to item.embed.
window.downloadVideo = function() {
    const item = videos[currentVideoIndex];
    window.open(item.embed, '_blank');
}

function handleKeyDown(e) {
    if (e.key === 'Escape') window.closeLightbox();
}

// Initial render
renderGallery();
