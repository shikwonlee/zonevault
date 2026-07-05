import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Collection.js successfully loaded!");

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
// 6. CATEGORY MENU (each card links to its own page)
// ==========================================
const categoryMenu = [
    { title: "2026 SVT 10TH FAN MEETING ", href: "/special_gift/caratland_2026", thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/8f5acef9e251a0dcbc61d351b16a947d12e03aa275cfddc18fa9e0b568b14526_jzaen9.jpg" },
    { title: "SVT [NEW_] ENCORE ", href: "/special_gift/new_encore", thumb: "https://res.cloudinary.com/rabnzafj/image/upload/v1783260162/Screenshot_2026-07-05_220228_zduqgo.png" },
    { title: "CXM [DOUBLE UP] LIVE PARTY", href: "/special_gift/cxm", thumb: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1771169310/photo_2026-02-15_23-28-20_rvbfv2.jpg" },
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

    categoryMenu.forEach(cat => {
        const card = document.createElement('a');
        card.className = 'cat-card';
        card.href = cat.href;

        const img = document.createElement('img');
        img.src = cat.thumb;
        img.loading = "lazy";
        img.alt = cat.title;

        const overlay = document.createElement('div');
        overlay.className = 'cat-title-overlay';
        overlay.innerHTML = `<h3>${cat.title}</h3>`;

        card.appendChild(img);
        card.appendChild(overlay);
        menuContainer.appendChild(card);
    });
}

renderMenu();
