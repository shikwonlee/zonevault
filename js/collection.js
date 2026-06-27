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
        // BAGO: I-save kung nasaan sila bago mag-maintenance
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

            // Update Dynamic URL
            get(ref(db, 'joinRequests/' + user.uid + '/status')).then(reqSnap => {
                const reqStatus = reqSnap.val() || 'none';
                updateDynamicURL(user.uid, role, reqStatus);
            });
        });
    } else {
        window.location.replace("index");
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
    card.innerHTML = `<div class="access-icon-box"><i class="fas fa-lock"></i></div><div class="access-title">Access Restricted</div><div class="access-desc">You are not authorized to view this page directly. Please log in or return home.</div><button class="access-btn" onclick="window.location.replace('index')">Return to Safety</button><div style="margin-top:15px; font-size:12px; color:#555;">Redirecting automatically...</div>`;
    modal.appendChild(card);
    document.body.appendChild(modal);
    setTimeout(() => { window.location.replace("index"); }, 3000);
}

// ==========================================
// 6. COLLECTION DATA & RENDER LOGIC
// ==========================================
const collectionData = [
    {
        category: "CXM [DOUBLE UP] LIVE PARTY in INCHEON ALL DAY PASS SPECIAL GIFTS",
        targetId: "grid-category-7", sectionId: "section-7",
        images: [
            { src: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1771169310/photo_2026-02-15_23-28-20_rvbfv2.jpg", link: "https://drive.usercontent.google.com/download?id=1lPYWBjmosBZrMQXdfYVlOsBZwCm5WRdn&export=download" },
            { src: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1771169288/Screenshot_2026-02-15_232110_fwjqhu.png", link: "https://drive.usercontent.google.com/download?id=1JhRIFNVGpTUvvxV71HrcA-YeR7mNY5wy&export=download" }
        ]
    },
    {
        category: "SEVENTEEN WORLD TOUR [NEW_] IN JAPAN Fukuoka Show SPECIAL GIFTS",
        targetId: "grid-category-6", sectionId: "section-6",
        images: [
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Group.jpg", link: "https://drive.usercontent.google.com/download?id=1O1biKpTaAR06Knc6fZeHGQ3DFIbOaPma&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Seungcheol.jpg", link: "https://drive.usercontent.google.com/download?id=1ptazDuRbpG5RKZHCc4nWUySKJD817Mps&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Joshua.jpg", link: "https://drive.usercontent.google.com/download?id=1MUaCtFynQo22Hjup5WKihDXdN3YI1A_W&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Jun.jpg", link: "https://drive.usercontent.google.com/download?id=1ZpMdvcL_kW9yIZPxSyf0CyWqSbVW8RGr&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Dk.jpg", link: "https://drive.usercontent.google.com/download?id=1sg00aVlHbbyf2VEl-HTGgPgNCqeDtGvu&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Mingyu.jpg", link: "https://drive.usercontent.google.com/download?id=1-6MiuIjgQHmdl02FPumQ9LaAlrgczBtg&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20The%208.jpg", link: "https://drive.usercontent.google.com/download?id=11RKZg_V9yq6WwmPD6yd2lqjQPUD7AJ9r&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Seungkwan.jpg", link: "https://drive.usercontent.google.com/download?id=1wno7z07nF2tCqnrFvZFFgGD6_45OKm3s&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Vernon.jpg", link: "https://drive.usercontent.google.com/download?id=1qu3r9SbwpgSuyMY4DE8OfUe369o7SfDH&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Dino.jpg", link: "https://drive.usercontent.google.com/download?id=1ut4lsQS_kyycjlMrOednIPyRtxIysVV7&export=download" }
        ]
    },
    {
        category: "SEVENTEEN WORLD TOUR [NEW_] IN JAPAN Osaka Show SPECIAL GIFTS",
        targetId: "grid-category-4", sectionId: "section-4",
        images: [
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Group.jpg", link: "https://drive.usercontent.google.com/download?id=1UbcDnJLiL8e-cIwTxGAE_-SIZ5zFIfF-&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Seungcheol.jpg", link: "https://drive.usercontent.google.com/download?id=1kxZselcw1GSKO1iEpGlxo6eP_ttXkXEX&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Joshua.jpg", link: "https://drive.usercontent.google.com/download?id=1yWBVW6SfSS2GKZauK2BVofqvehPvbJiA&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Jun.jpg", link: "https://drive.usercontent.google.com/download?id=1uLXPH1WaU1D3yt1aOvYPjnU--hT7xsTC&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Dk.jpg", link: "https://drive.usercontent.google.com/download?id=1Be4t58tClizM4ZaWzKHpzTJHNzMlPlQM&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Mingyu.jpg", link: "https://drive.usercontent.google.com/download?id=1hI1y21a7Ddi0i7qEUEUfYp4zcL_SLLnv&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20The%208.jpg", link: "https://drive.usercontent.google.com/download?id=1wmWvboi1NTOT2-rnuU4BJ3xJm-s-bLkF&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Seungkwan.jpg", link: "https://drive.usercontent.google.com/download?id=1QmHVfdQqX-JkkEB3jXdTQObX_buhpdHX&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Vernon.jpg", link: "https://drive.usercontent.google.com/download?id=1aquFXS5KxwP722xfxJnIOCU47pDjpIne&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Dino.jpg", link: "https://drive.usercontent.google.com/download?id=1Pa6qk_NTvbT3ssSR--vqCcvKyuHkMmOD&export=download" }
        ]
    },
    {
        category: "SEVENTEEN WORLD TOUR [NEW_] IN INCHEON SPECIAL GIFTS",
        targetId: "grid-category-5", sectionId: "section-5",
        images: [
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20SeungcheoL.png", link: "https://drive.usercontent.google.com/download?id=1OG3WFMM3_wVHYgwAKs8g-vD6JOMjePv4&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20Joshua.png", link: "https://drive.usercontent.google.com/download?id=1uRA1BOzoyWB0HuUB0vY53YtNALAF2RuE&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20Jun.png", link: "https://drive.usercontent.google.com/download?id=12w_pB2MSM6b_hr9WkxLv0QkqUZyJgz0E&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20Dk.png", link: "https://drive.usercontent.google.com/download?id=1alWIYhSIWVyLjZacZToQ9gC2GlX9S1q3&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20Mingyu.png", link: "https://drive.usercontent.google.com/download?id=1Cwix_pCLX0WQZhYageQFiUPkCrt1UQFs&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20The8.png", link: "https://drive.usercontent.google.com/download?id=1vJpEknyO9qW6LgNJ2_JB3oX3QYtXD0jF&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20Seungkwan.png", link: "https://drive.usercontent.google.com/download?id=15ERl4v3WbiAZNM_GCOVzakIZOkTcxSRR&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20Vernon.png", link: "https://drive.usercontent.google.com/download?id=1o_UJBprWKYfPj8m0J3Sm6Sy0jFH4MsR6&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20Dino.png", link: "https://drive.usercontent.google.com/download?id=19y3lzbjIkZ0BaacQIyLmwl3cvleMAKvc&export=download" }
        ]
    },
    {
        category: "HOSHI X WOOZI FAN CONCERT [WARNING] SEOUL SPECIAL GIFTS",
        targetId: "grid-category-3", sectionId: "section-3",
        images: [
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_warninginseoul/%5BWARNING%5D%20Spacial%20Gifts%20Hoshi.png", link: "https://drive.usercontent.google.com/download?id=1dcb0l3cFl5d0tTQgP-oZn7hKE1jfPKON&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_warninginseoul/%5BWARNING%5D%20Spacial%20Gifts%20Woozi.png", link: "https://drive.usercontent.google.com/download?id=186cwfeQx_WonPPm6yEujEJ16ZYWtuBUl&export=download" }
        ]
    },
    {
        category: "SEVENTEEN 2025 JAPAN FANMEETING 'HOLIDAY' SPECIAL GIFTS",
        targetId: "grid-category-2", sectionId: "section-2",
        images: [
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20%20Groups.jpg", link: "https://drive.usercontent.google.com/download?id=1kWlj5laH-rDTlFs1UTAnV2Duu02EMjj3&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Seungcheol.jpg", link: "https://drive.usercontent.google.com/download?id=1g6CTFYc55mm3Q4LXEAn-1MNLTmVfjVZQ&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Joshua.jpg", link: "https://drive.usercontent.google.com/download?id=1Z8CTHozvvovBwQFeOFsm0eYbRsQumU2a&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Jun.jpg", link: "https://drive.usercontent.google.com/download?id=1fsv1u1RJi2Vi8Q_cBgf9wtfdWfl-l4Ue&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Hoshi.jpg", link: "https://drive.usercontent.google.com/download?id=15Hy6AI1_cy4gTCIBGdtlV8fIaEkHz0kj&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Woozi.jpg", link: "https://drive.usercontent.google.com/download?id=1HBPtCB5RHqXHBjuJj2Q-NlEjjx2i2bdQ&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Dk.jpg", link: "https://drive.usercontent.google.com/download?id=1MrA7jvdbqJngJoB0vKHE2J79skLU2ze8&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Mingyu.jpg", link: "https://drive.usercontent.google.com/download?id=1vt76WL85I-Ugebuwrap2V4Hp_E29Fa0d&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20The8.jpg", link: "https://drive.usercontent.google.com/download?id=1MGu26ixI2dA8qq7q6NmgU3FrhGQmtza4&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Seungkwan.jpg", link: "https://drive.usercontent.google.com/download?id=1qZvY6dvZIEaC6tB7Crnag20j0wgMhuZ2&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Vernon.jpg", link: "https://drive.usercontent.google.com/download?id=1qZvY6dvZIEaC6tB7Crnag20j0wgMhuZ2&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20Dino.jpg", link: "https://drive.usercontent.google.com/download?id=1zEsO9LymkEY7j8XEJs-ELQ73up8e_B9U&export=download" }
        ]
    },
    {
        category: "SEVENTEEN 'RIGHT HERE' WORLD TOUR SPECIAL GIFTS",
        targetId: "grid-category-1", sectionId: "section-1",
        images: [
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Seungcheol.jpg", link: "https://drive.usercontent.google.com/download?id=1cafIg2xS5BTxe-X-RpCMjmGN7rWDfle4&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Jeonghan.jpg", link: "https://drive.usercontent.google.com/download?id=12Q2HbMeoePOw8fBFKcFBbU3erUwcTSzS&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Joshua.jpg", link: "https://drive.usercontent.google.com/download?id=12Q2HbMeoePOw8fBFKcFBbU3erUwcTSzS&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Jun.jpg", link: "https://drive.usercontent.google.com/download?id=1Ktd_WWI9ZPS08LJrPns17N_wlAn9avuz&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Hoshi.jpg", link: "https://drive.usercontent.google.com/download?id=1OW_XZ3zLmATgPPdv__i-N736USusb0l9&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Wonwoo.jpg", link: "https://drive.usercontent.google.com/download?id=1oqsOOq1rJcqOcOMQNZD9VWo8zHMO3MWl&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Woozi.jpg", link: "https://drive.usercontent.google.com/download?id=1ACNHEjlJ-mnwL4_XrcttEdXOtXYNL4zU&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Dk.jpg", link: "https://drive.usercontent.com/download?id=1aViomKL-L9TBHAF790cR8WKwp2U84X84&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Mingyu.jpg", link: "https://drive.usercontent.google.com/download?id=1Z8HyNNZSCHkabLCUcuMk2XyenAeDnKov&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20The8.jpg", link: "https://drive.usercontent.google.com/download?id=1RPkt4Bo_vlBdmUFELMu8N96cPAzNe2N5&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Seungkwan.jpg", link: "https://drive.usercontent.google.com/download?id=1CqhPty57YtOusbJifQdpR9O02ZOjWhBn&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Vernon.jpg", link: "https://drive.usercontent.google.com/download?id=1qxgZrZFSpI1oF_36DPj2TIv6sGKcZuSp&export=download" },
            { src: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Dino.jpg", link: "https://drive.usercontent.google.com/download?id=1lamZpDuEuknjo4KIgYqrfMrWtMjX1Qk9&export=download" }
        ]
    }
];

let allItems = [];
collectionData.forEach(section => {
    allItems = allItems.concat(section.images);
});

function renderMenu() {
    const menuContainer = document.getElementById('category-menu');
    if(!menuContainer) return;
    menuContainer.innerHTML = '';

    collectionData.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'cat-card';
        card.onclick = () => window.showCategory(cat.targetId, cat.category);

        const img = document.createElement('img');
        img.src = cat.images[0].src;
        img.loading = "lazy";

        const overlay = document.createElement('div');
        overlay.className = 'cat-title-overlay';
        overlay.innerHTML = `<h3>${cat.category}</h3>`;

        card.appendChild(img);
        card.appendChild(overlay);
        menuContainer.appendChild(card);
    });
}

function renderCollection() {
    let globalIndex = 0;
    collectionData.forEach(section => {
        const container = document.getElementById(section.targetId);
        if(container) {
            container.innerHTML = "";
            section.images.forEach(item => {
                const div = document.createElement("div");
                div.className = "gallery-item";
                const filename = decodeURIComponent(item.src).split('/').pop().replace(/\.(jpg|png|jpeg)/i, '');
                
                div.innerHTML = `<img src="${item.src}" alt="${filename}" loading="lazy">`;
                const currentIndex = globalIndex;
                div.onclick = () => window.openLightbox(currentIndex);
                container.appendChild(div);
                globalIndex++;
            });
        }
    });
    renderThumbnails(); 
    renderMenu(); 
}

window.showCategory = function(targetId, title) {
    document.getElementById('category-menu').style.display = 'none';
    document.querySelectorAll('.collection-section').forEach(sec => sec.style.display = 'none');
    
    const section = document.querySelector(`.collection-section:has(#${targetId})`) || document.getElementById(targetId).parentElement;
    if(section) section.style.display = 'block';

    document.getElementById('page-heading').innerText = title;
    document.getElementById('backToCatBtn').style.display = 'inline-flex';
    window.scrollTo(0,0);
}

window.showMenu = function() {
    document.getElementById('category-menu').style.display = 'grid';
    document.querySelectorAll('.collection-section').forEach(sec => sec.style.display = 'none');
    document.getElementById('page-heading').innerText = 'My Collection';
    document.getElementById('backToCatBtn').style.display = 'none';
}

function renderThumbnails() {
    const thumbContainer = document.getElementById('lightbox-thumbs');
    if(!thumbContainer) return;
    thumbContainer.innerHTML = '';
    allItems.forEach((item, index) => {
        const img = document.createElement('img');
        img.src = item.src;
        img.className = 'lb-thumb';
        img.id = `thumb-${index}`;
        img.onclick = () => window.openLightbox(index);
        thumbContainer.appendChild(img);
    });
}

function highlightThumbnail(index) {
    document.querySelectorAll('.lb-thumb').forEach(t => t.classList.remove('active'));
    const activeThumb = document.getElementById(`thumb-${index}`);
    if(activeThumb) {
        activeThumb.classList.add('active');
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

// --- LIGHTBOX LOGIC ---
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
let currentImageIndex = 0;
let scale = 1;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

window.openLightbox = function(index) {
    currentImageIndex = index;
    resetZoom(); 
    updateLightboxImage();
    if(lightbox) {
        lightbox.classList.add("active");
        document.body.style.overflow = "hidden"; 
        document.addEventListener('keydown', handleKeyDown);
    }
}

window.closeLightbox = function() {
    if(lightbox) lightbox.classList.remove("active");
    document.body.style.overflow = "auto";
    document.removeEventListener('keydown', handleKeyDown);
    resetZoom();
}

function resetZoom() {
    scale = 1;
    applyTransform();
}

function applyTransform() {
    if(!lightboxImg) return;
    lightboxImg.style.transform = `scale(${scale})`;
    if (scale > 1) lightboxImg.classList.add('zoomed');
    else lightboxImg.classList.remove('zoomed');
}

if(lightbox) {
    lightbox.addEventListener('wheel', function(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        scale = Math.min(Math.max(MIN_SCALE, scale + delta), MAX_SCALE);
        applyTransform();
    }, { passive: false });

    // MOBILE PINCH
    let initialDist = 0;
    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50; 

    lightbox.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            initialDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        } else {
            touchStartX = e.changedTouches[0].screenX;
        }
    }, { passive: true });

    lightbox.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) {
            e.preventDefault(); 
            const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            const delta = dist / initialDist;
            scale = Math.min(Math.max(MIN_SCALE, scale * delta), MAX_SCALE);
            applyTransform();
            initialDist = dist;
        }
    }, { passive: false });

    lightbox.addEventListener('touchend', function(e) {
        if (e.touches.length < 2 && scale === 1) {
            touchEndX = e.changedTouches[0].screenX;
            const swipeDistance = touchEndX - touchStartX;
            if (Math.abs(swipeDistance) > minSwipeDistance) {
                if (swipeDistance > 0) prevImage();
                else nextImage();
            }
        }
    }, { passive: true });

    lightbox.addEventListener("click", function(e) {
        if (e.target === lightbox || e.target.classList.contains('lightbox-content-wrapper')) window.closeLightbox();
    });
}

window.downloadImage = function() {
    const item = allItems[currentImageIndex];
    if (item && item.link && item.link.startsWith("http")) {
        window.open(item.link, '_blank');
    } else {
        const link = document.createElement('a');
        link.href = item.src;
        link.download = "ZoneVault_Image.jpg";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function updateLightboxImage() {
    if (currentImageIndex < 0) currentImageIndex = allItems.length - 1;
    else if (currentImageIndex >= allItems.length) currentImageIndex = 0;
    resetZoom(); 
    const item = allItems[currentImageIndex];
    if(lightboxImg) lightboxImg.src = item.src;
    highlightThumbnail(currentImageIndex);
}

function prevImage() { currentImageIndex--; updateLightboxImage(); }
function nextImage() { currentImageIndex++; updateLightboxImage(); }
function handleKeyDown(e) {
    if (e.key === 'ArrowLeft') prevImage();
    else if (e.key === 'ArrowRight') nextImage();
    else if (e.key === 'Escape') window.closeLightbox();
}

// Initial Call to build the collection UI
renderCollection();
