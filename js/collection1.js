import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, onValue, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { auth, db } from "./firebase-init.js";
import { getCachedUser, setCachedUser, clearCachedUser, applyCachedUserToUI } from "./user-cache.js";
import { showConfirm, escapeHTML } from "./toast.js";

console.log("✅ Collection.js successfully loaded!");

// Instantly apply user info from cache
applyCachedUserToUI();

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
// Welcome toast removed

function initTheme() {
    const savedTheme = localStorage.getItem('zoneTheme') || localStorage.getItem('zoneVaultTheme') || 'dark';
    if (savedTheme === 'light' || savedTheme === '#ffffff' || savedTheme === 'white') {
        document.body.classList.add('light-mode');
        document.documentElement.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
        document.documentElement.classList.remove('light-mode');
    }
}
window.toggleTheme = function() {
    document.body.classList.toggle('light-mode');
    document.documentElement.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode') || document.documentElement.classList.contains('light-mode');
    localStorage.setItem('zoneTheme', isLight ? 'light' : 'dark');
    localStorage.setItem('zoneVaultTheme', isLight ? 'light' : 'dark');
}
initTheme();

window.logout = async function() {
    const confirmed = await showConfirm({
        title: "Log Out",
        text: "Are you sure you want to sign out of Zone Vault?",
        confirmText: "Sign Out",
        danger: true
    });
    if (confirmed) {
        clearCachedUser();
        signOut(auth).then(() => window.location.replace("/index"));
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
            item.innerHTML = `<div class="notif-icon"><i class="fas ${escapeHTML(n.icon || 'fa-bell')}"></i></div><div class="notif-content"><h5>${escapeHTML(n.title)}</h5><p>${escapeHTML(n.message)}</p></div>`;
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
// 5. AUTH & SECURITY LOGIC
// ==========================================
onAuthStateChanged(auth, user => {
    if(user) {
        onValue(ref(db, 'users/' + user.uid), snap => {
            const data = snap.val() || {};
            const name = data.name || "Member";
            const pic = data.profilePicture || "https://via.placeholder.com/150";
            const role = (data.role || "member").toLowerCase();
            const isAdm = role === 'admin';

            setCachedUser({
                uid: user.uid,
                email: user.email,
                name: name,
                profilePicture: pic,
                role: role,
                isAdmin: isAdm,
                status: data.status || "approved"
            });

            if(document.getElementById("sidebar-name")) document.getElementById("sidebar-name").innerText = name;
            if(document.getElementById("sidebar-email")) document.getElementById("sidebar-email").innerText = user.email;
            if(document.getElementById("sidebar-pic")) document.getElementById("sidebar-pic").src = pic;

            const statusTxt = isAdm ? "ADMIN ACCESS" : "MEMBER ACCESS";
            if(document.getElementById("status-text-pc")) document.getElementById("status-text-pc").innerText = statusTxt;
            
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
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(5,5,8,0.88); backdrop-filter:blur(20px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
    modal.innerHTML = `
      <div class="access-denied-card" style="position:relative; max-width:480px; width:100%; background:linear-gradient(180deg, rgba(24,24,30,0.96) 0%, rgba(12,12,16,0.98) 100%); border:1px solid rgba(239,68,68,0.32); border-radius:24px; padding:38px 28px 28px; text-align:center; box-shadow:0 30px 70px -15px rgba(0,0,0,0.85), 0 0 50px rgba(239,68,68,0.18); overflow:hidden; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing:border-box;">
        <div style="width:68px; height:68px; margin:0 auto 18px; border-radius:20px; background:linear-gradient(135deg, rgba(239,68,68,0.22), rgba(185,28,28,0.08)); border:1px solid rgba(239,68,68,0.45); display:flex; align-items:center; justify-content:center; box-shadow:0 0 30px rgba(239,68,68,0.28); color:#ef4444;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <div style="display:inline-flex; align-items:center; gap:7px; padding:5px 14px; border-radius:9999px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.28); color:#fca5a5; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; margin-bottom:14px;">
          <span style="width:6px; height:6px; border-radius:50%; background:#ef4444; box-shadow:0 0 8px #ef4444;"></span>
          <span>Permission Required</span>
        </div>
        <h2 style="font-size:26px; font-weight:800; color:#ffffff; margin:0 0 12px; letter-spacing:-0.5px;">Access Denied</h2>
        <p style="font-size:14.5px; line-height:1.6; color:#d4d4d8; margin:0 0 24px;">
          Your account does not have the required permissions to access this video. If you believe this is a mistake, please contact the administrator for assistance.
        </p>
        <div style="display:flex; gap:12px; width:100%; margin-bottom:8px;">
          <button type="button" onclick="window.location.replace('/home')" style="flex:1; padding:13px 20px; border-radius:12px; background:#ffffff; color:#09090b; font-weight:700; font-size:13.5px; border:none; cursor:pointer; box-shadow:0 4px 16px rgba(255,255,255,0.15);">
            Return to Home
          </button>
          <button type="button" onclick="window.location.href='mailto:seventeenzoneph@gmail.com?subject=Access%20Request'" style="flex:1; padding:13px 20px; border-radius:12px; background:rgba(255,255,255,0.06); color:#ffffff; font-weight:600; font-size:13.5px; border:1px solid rgba(255,255,255,0.16); cursor:pointer;">
            Contact Admin
          </button>
        </div>
        <div style="font-size:12px; color:#71717a; margin-top:16px;">
          Redirecting automatically in 5s...
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => { window.location.replace("/home"); }, 5000);
}

// ==========================================
// 6. CATEGORY MENU (each card links to its own page)
// ==========================================
const categoryMenu = [
     { title: "VERNON THE 8 [V8] SPECIAL GIFTS ", href: "/special_gift/v8.html", thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1785555567/vernon_special_gift_e2se87.jpg" },
    { title: "SEVENTEEN in CARATLAND SPECIAL GIFTS ", href: "/special_gift/caratland_2026", thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/8f5acef9e251a0dcbc61d351b16a947d12e03aa275cfddc18fa9e0b568b14526_jzaen9.jpg" },
    { title: "SEVENTEEN 'YAKUSOKU' Osaka SPECIAL GIFTS ", href: "/special_gift/yakusoku", thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783266525/photo_2026-07-05_23-05-40_nuly3c.jpg" },
    { title: "DxS SERENADE SPECIAL GIFTS ", href: "/special_gift/dxs_serenade", thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783267073/DXS_SERENADE_DK_SPECIAL_GIFT_aosirx.png" },
    { title: "SVT [NEW_] ENCORE SPECIAL GIFTS", href: "/special_gift/new_encore", thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783260162/Screenshot_2026-07-05_220228_zduqgo.png" },
    { title: "CXM [DOUBLE UP] LIVE PARTY SPECIAL GIFTS", href: "/special_gift/cxm", thumb: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1771169310/photo_2026-02-15_23-28-20_rvbfv2.jpg" },
    { title: "FUKUOKA SHOW SPECIAL GIFTS", href: "/special_gift/fukuoka", thumb: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Group.jpg" },
    { title: "OSAKA SHOW SPECIAL GIFTS", href: "/special_gift/osaka", thumb: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Group.jpg" },
    { title: "INCHEON SPECIAL GIFTS", href: "/special_gift/incheon", thumb: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20SeungcheoL.png" },
    { title: "WARNING GWANGJU SPECIAL GIFTS", href: "/special_gift/hoshixwoozi", thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783259446/4b31a01d9c7706e49171fe247c099d8a31fb0ea0ebfc6c3a4e7452b6680aa9761_goqrhd.png" },
    { title: "WARNING SEOUL SPECIAL GIFTS", href: "/special_gift/warning", thumb: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_warninginseoul/%5BWARNING%5D%20Spacial%20Gifts%20Hoshi.png" },
    { title: "HOLIDAY FANMEETING GIFTS", href: "/special_gift/holiday", thumb: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20%20Groups.jpg" },
    { title: "RIGHT HERE WORLD TOUR GIFTS", href: "/special_gift/righthere", thumb: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Seungcheol.jpg" }
];

function renderMenu() {
    const menuContainer = document.getElementById('category-menu');
    if(!menuContainer) return;
    menuContainer.innerHTML = '';

    const countEl = document.getElementById('galleryCount');
    if (countEl) countEl.textContent = categoryMenu.length;

    categoryMenu.forEach((cat, index) => {
        const card = document.createElement('a');
        card.className = 'cat-card';
        card.href = cat.href;
        card.style.animationDelay = `${Math.min(index * 0.05, 0.6)}s`;

        const img = document.createElement('img');
        img.src = cat.thumb;
        img.loading = "lazy";
        img.alt = cat.title;

        const viewBadge = document.createElement('div');
        viewBadge.className = 'cat-view-badge';
        viewBadge.innerHTML = '<i class="fas fa-arrow-right"></i>';

        const overlay = document.createElement('div');
        overlay.className = 'cat-title-overlay';
        overlay.innerHTML = `<h3>${cat.title}</h3>`;

        card.appendChild(img);
        card.appendChild(viewBadge);
        card.appendChild(overlay);
        menuContainer.appendChild(card);
    });
}

renderMenu();
