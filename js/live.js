import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Live.js successfully loaded!");

// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
    apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
    authDomain: "tvnstream-b4497.firebaseapp.com",
    databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
    projectId: "tvnstream-b4497",
    storageBucket: "tvnstream-b4497.appspot.com",
    messagingSenderId: "308384754214",
    appId: "1:308384754214:web:2938e76cd29b288f75d4e7",
    measurementId: "G-VFNH70R4D9"
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
        // BAGO: I-save kung nasaan sila bago mag-maintenance
        sessionStorage.setItem('returnPage', window.location.href);
        window.location.href = 'maintenance';
    } 
    else if (isUnderMaintenance === false && currentPage.includes('maintenance')) {
        const returnUrl = sessionStorage.getItem('returnPage') || 'live';
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
// 3. UI THEMES & TOGGLES
// ==========================================
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
        signOut(auth).then(() => window.location.replace("index"));
    }
}

// ==========================================
// 4. NOTIFICATIONS
// ==========================================
const notifList = document.getElementById('notif-list');
let latestNotifTimestamp = 0;
const notifQuery = query(ref(db, 'notifications'), limitToLast(10));

onValue(notifQuery, snapshot => {
    if(!notifList) return;
    notifList.innerHTML = ''; 
    if (snapshot.exists()) {
        const data = snapshot.val();
        const notifs = Object.values(data).reverse(); 
        
        notifs.forEach(n => {
            const item = document.createElement('div');
            item.className = 'notif-item';
            item.innerHTML = `<div class="notif-icon"><i class="fas ${n.icon || 'fa-bell'}"></i></div><div class="notif-content"><h5>${n.title}</h5><p>${n.message}</p></div>`;
            notifList.appendChild(item);
            if(n.timestamp > latestNotifTimestamp) latestNotifTimestamp = n.timestamp;
        });

        const lastRead = localStorage.getItem('lastReadNotif') || 0;
        const badgeDesktop = document.getElementById('notif-badge');
        const badgeMobile = document.getElementById('notif-badge-mobile');
        
        if (latestNotifTimestamp > lastRead) {
            if(badgeDesktop) badgeDesktop.classList.add('active');
            if(badgeMobile) badgeMobile.classList.add('active');
        } else {
            if(badgeDesktop) badgeDesktop.classList.remove('active');
            if(badgeMobile) badgeMobile.classList.remove('active');
        }
    } else {
        notifList.innerHTML = '<div class="notif-empty">No new notifications</div>';
    }
});

window.toggleNotifModal = function() {
    const modal = document.getElementById('notifModal');
    const badgeDesktop = document.getElementById('notif-badge');
    const badgeMobile = document.getElementById('notif-badge-mobile');
    
    if(!modal) return;
    modal.classList.toggle('active');
    if (modal.classList.contains('active')) {
        if(badgeDesktop) badgeDesktop.classList.remove('active');
        if(badgeMobile) badgeMobile.classList.remove('active');
        localStorage.setItem('lastReadNotif', latestNotifTimestamp);
    }
}

// ==========================================
// 5. LIVE EVENT DATA & RENDER
// ==========================================
const liveData = [
  {
      id: "v10", 
      thumb: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1775580154/DXS_iltda7.png", 
      category: "LIVE", 
      title: "DAY 1 - DxS [Serenade] ON STAGE - INCHEON", 
      hashtags: "April 17, 18 & 19 2026", 
      link: "live_stream/dxs_serenade_on_stage_incheon"
  },
  {
      id: "v9", 
      thumb: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1774264277/9_s7stpb.png", 
      category: "LIVE", 
      title: "SEVENTEEN WORLD TOUR [NEW_] ENCORE", 
      hashtags: "April 04 & 05 2026", 
      link: "live_stream/seventeen_world_tour_new_tour_encore"
  }
];

const broadcastData = [
  {
      id: "b1", 
      thumb: "https://uploads.onecompiler.io/43ddry4jt/44d9cktck/tbs-channel-1-jp.png", 
      category: "JAPAN TV CHANNEL", 
      title: "TBS Channel 1", 
      hashtags: "", 
      link: "livebroadcast/live1"
  },
  {
      id: "b2", 
      thumb: "https://uploads.onecompiler.io/43ddry4jt/44d98kevu/Screenshot%202026-02-11%20115433.png", 
      category: "KOREAN TV CHANNEL", 
      title: "MBC", 
      hashtags: "", 
      link: "livebroadcast/live2"
  },
  {
      id: "b3", 
      thumb: "https://uploads.onecompiler.io/43ddry4jt/44d98kevu/download.webp", 
      category: "KOREAN TV CHANNEL", 
      title: "Channel A", 
      hashtags: "", 
      link: "livebroadcast/live3"
  }
];

const grid = document.getElementById("grid");
const gridBroadcast = document.getElementById("grid-broadcast");

function renderGrid(container, items, btnLabel = "ENTER EVENT") {
    if(!container) return;
    container.innerHTML = "";
    if(items.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">No events found.</div>';
        return;
    }
     
    items.forEach(item => {
        const el = document.createElement("div");
        el.className = "video-card";
        
        el.innerHTML = `
          <div class="thumb-wrapper">
            <img src="${item.thumb}" loading="lazy" alt="${item.title}">
            <div class="countdown-badge" data-date="${item.releaseDate || ''}"></div>
          </div>
          <div class="card-body">
            <div class="video-meta">${item.category}</div>
            <div class="video-title">${item.title}</div>
            <div class="video-hashtags">${item.hashtags}</div>
            <div class="card-actions">
                <button class="btn-watch" onclick="window.location.href='${item.link}'">${btnLabel}</button>
            </div>
          </div>
        `;
        container.appendChild(el);
    });
    startCountdown();
}

function startCountdown() {
    document.querySelectorAll(".countdown-badge").forEach(elem => {
        const dateStr = elem.dataset.date;
        if (!dateStr) { elem.style.display='none'; return; }
        const endDate = new Date(dateStr);
        
        const update = () => {
            const now = new Date();
            const diff = endDate - now;
            if (diff <= 0) { elem.textContent = "Available Now"; return; }
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            elem.textContent = `${days}d left`;
        };
        update();
    });
}

// Initial Render for BOTH grids
renderGrid(grid, liveData, "ENTER EVENT");
renderGrid(gridBroadcast, broadcastData, "WATCH NOW");

// ==========================================
// 6. AUTH & SECURITY LOGIC
// ==========================================
window.isKickedOut = false; // Initialize flag for security modal

onAuthStateChanged(auth, user => {
    if(user) {
        onValue(ref(db, 'users/' + user.uid), snap => {
            const data = snap.val() || {};
            const name = data.name || "Member";
            const pic = data.profilePicture || "https://via.placeholder.com/150";
            const role = (data.role || "member").toLowerCase();
            const isAdm = role === 'admin';

            if (!window.isKickedOut) {
                if(document.getElementById("sidebar-name")) document.getElementById("sidebar-name").innerText = name;
                if(document.getElementById("sidebar-email")) document.getElementById("sidebar-email").innerText = user.email;
                if(document.getElementById("sidebar-pic")) document.getElementById("sidebar-pic").src = pic;
                
                if(document.getElementById("mobile-sidebar-name")) document.getElementById("mobile-sidebar-name").innerText = name;
                if(document.getElementById("mobile-sidebar-email")) document.getElementById("mobile-sidebar-email").innerText = user.email;
                if(document.getElementById("mobile-sidebar-pic")) document.getElementById("mobile-sidebar-pic").src = pic;

                const statusTxt = isAdm ? "ADMIN ACCESS" : "MEMBER ACCESS";
                if(document.getElementById("status-text-pc")) document.getElementById("status-text-pc").innerText = statusTxt;
                if(document.getElementById("status-text-mobile")) document.getElementById("status-text-mobile").innerText = statusTxt;
            }
            
            if (isAdm) { 
                sessionStorage.setItem('isAdmin', 'true'); 
                sessionStorage.setItem('internalAccess', 'true'); 
            }

            // Update Dynamic URL
            get(ref(db, 'joinRequests/' + user.uid + '/status')).then(reqSnap => {
                const reqStatus = reqSnap.val() || 'none';
                updateDynamicURL(user.uid, role, reqStatus);
            });
        });
    } else {
        // Fallback to anonymous sign-in if guest
        signInAnonymously(auth).catch(error => {
            console.error("Anonymous Sign-in failed:", error);
            if (!window.isKickedOut) {
                window.location.replace("index");
            }
        });
    }
});

// SECURITY CHECK
const allowedPaths = ['/index', '/home', '/nanabnb', '/newtour', '/hxwfanconcert', '/svtholiday', '/arenatour', '/svtjapanconcert', '/touragain', '/gallery', '/profile', '/soon', '/videos', '/admin', '/collection', '/live'];
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

if (!hasInternalAccessFlag && !isIndexPagePath && !isAdminFlag && !window.isKickedOut) { 
    showAccessDeniedModal(); 
}

function showAccessDeniedModal() {
    window.isKickedOut = true;
    const modal = document.createElement('div');
    modal.className = 'access-denied-modal';
    const card = document.createElement('div');
    card.className = 'access-card';
    card.innerHTML = `<div class="access-icon-box"><i class="fas fa-lock"></i></div><div class="access-title">Access Restricted</div><div class="access-desc">You are not authorized to view this page directly. Please log in or return home.</div><button class="access-btn" onclick="window.location.replace('index')">Return to Safety</button><div style="margin-top:15px; font-size:12px; color:#555;">Redirecting automatically...</div>`;
    modal.appendChild(card);
    document.body.appendChild(modal);
    setTimeout(() => { window.location.replace("index"); }, 3000);
}
