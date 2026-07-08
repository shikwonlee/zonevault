import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Videos.js successfully loaded!");

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

    // Kapag naka-ON ang maintenance at wala sa maintenance page
    if (isUnderMaintenance === true && !currentPage.includes('maintenance')) {
        // BAGO: I-save kung nasaan sila bago mag-maintenance
        sessionStorage.setItem('returnPage', window.location.href);
        window.location.href = 'maintenance';
    } 
    // Kapag naka-OFF ang maintenance pero na-stuck sa maintenance page
    else if (isUnderMaintenance === false && currentPage.includes('maintenance')) {
        const returnUrl = sessionStorage.getItem('returnPage') || 'videos';
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
// 3. GLOBALS & DATA
// ==========================================
let favorites = [];
let userId = null;
let currentPaginationPage = 1;
let cardsPerPage = window.innerWidth <= 900 ? 6 : 8;
let activeCategory = "ALL";

const data = [
  {id:"v14", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1782052754/cl2026_omm6dn.png", category:"FAN MEET", title:"2026 SVT 10TH FAN MEETING SEVENTEEN in CARAT LAND", hashtags:"c: uvvul", link:"2026/svt_in_carat_land_2026.html"},
  {id:"v13", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1779505888/yakusoku_fiv99n.png", category:"CONCERT", title:"SEVENTEEN 2026 JAPAN FANMEETING'YAKUSOKU' Osaka", hashtags:"c: uvvul", link:"2026/svt_2026_fanmeeting_yakusoku"},
  {id:"v12", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1775580154/DXS_iltda7.png", category:"CONCERT", title:"DxS [Serenade] ON STAGE - INCHEON", hashtags:"c: uvvul", link:"2026/dxs_on_stage"},
  {id:"v11", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1774264277/10_vdbvfi.png", category:"CONCERT", title:"SEVENTEEN WORLD TOUR [NEW_] ENCORE", hashtags:"c: uvvul", link:"2026/new_encore"},
  {id:"v10", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1771257326/cxm_qjoyfa.jpg", category:"CONCERT", title:"CxM [DOUBLE UP] LIVE PARTY in JAPAN", hashtags:"c: sylveon.click", link:"2026/cxminjapan"},
  {id:"v0.9", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1774046072/Magic_Hour_The_Seventeen_nsiakx.jpg", category:"DOCU", title:"Magic Hour, The Seventeen", hashtags:"c: uvvul", link:"2024/magichour"},
  {id:"v0.8", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1773207084/Screenshot_2026-03-11_132939_z4bwn6.png", category:"CONCERT", title:"SEVENTEEN IN CARAT LAND 2025 SVT 9TH FAN MEETING", hashtags:"c: uvvul", link:"2025/9th_caratland"},
  {id:"v0.7", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1772085168/This_live_event_has_ended._svopgf.png", category:"FAN MEET", title:"SEVENTEEN IN CARAT LAND 2024 SVT 8TH FAN MEETING", hashtags:"c: uvvul", link:"2024/8th_caratland"},
  {id:"v0.6", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/CXM.png", category:"CONCERT", title:"CxM [DOUBLE UP] LIVE PARTY in INCHEON", hashtags:"c: uvvul", link:"2026/cxm_in_incheon"},
  {id:"v0.5", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/new-tour.png", category:"CONCERT", title:"SEVENTEEN WORLD TOUR [NEW_] IN JAPAN Fukuoka Show", hashtags:"c: uvvul", link:"2025/fukuokanewtour"},
  {id:"v0.4", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/new-tour.png", category:"CONCERT", title:"SEVENTEEN WORLD TOUR [NEW_] IN JAPAN Osaka Show", hashtags:"c: uvvul", link:"2025/japannewtour"},
  {id:"v0.3", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/the-shadow's-edge.jpg", category:"MOVIE", title:"The Shadow's Edge", hashtags:"c: uvvul", link:"2025/the-shadows-edge"},
  {id:"v0.1", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/svt_ourchapter.jpg", category:"DOCU", title:"SEVENTEEN: OUR CHAPTER", hashtags:"c:uvvul", link:"2025/ourchapterS17N-111025-6B4"},
  {id:"v0.2", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/inthesoop2.png", category:"VARIETY", title:"IN THE SOOP SEVENTEEN ver. Season2", hashtags:"", link:"2021/inthesoop2-N12X5R25-74K2"},
  {id:"v1.1", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/svtreaming.png", category:"SPECIAL", title:"[Let's SVTreaming Day]", hashtags:"", link:"2025/svtreaming1"},
  {id:"v1", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/new-tour.png", category:"CONCERT", title:"SEVENTEEN WORLD TOUR [NEW_] IN INCHEON", hashtags:"c: uvvul", link:"2025/newtour"},
  {id:"v2", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/warning_gwangju.png", category:"CONCERT", title:"HOSHIXWOOZI FAN CONCERT 'WARNING' IN GWANGJU", hashtags:"c: uvvul", link:"2025/hxwingwangju"},
  {id:"v3", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/warning_seoul.png", category:"CONCERT", title:"HOSHIXWOOZI FAN CONCERT 'WARNING' IN SEOUL", hashtags:"c: uvvul", link:"2025/hxwfanconcert"},
  {id:"v4", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/nana_bnb.png", category:"VARIETY", title:"NANA bnb with SEVENTEEN", hashtags:"c: uvvul", link:"2025/nanabnb"},
  {id:"v5", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/holiday.png", category:"CONCERT", title:"SEVENTEEN 2025 JAPAN FAN MEETING 'HOLIDAY", hashtags:"", link:"2025/svtholiday"},
  {id:"v6", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/right-here.png", category:"CONCERT", title:"SEVENTEEN 'RIGHT HERE' WORLD TOUR IN GOYANG", hashtags:"", link:"2024/rightheregoyang"},
  {id:"v7", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/arena-tour.png", category:"CONCERT", title:"SEVENTEEN 2018 JAPAN ARENA TOUR 'SVT'", hashtags:"", link:"random/arenatour"},
  {id:"v8", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/japan-concert.png", category:"CONCERT", title:"17 JAPAN CONCERT Say the name #SEVENTEEN", hashtags:"", link:"random/svtjapanconcert"},
  {id:"v9", thumb:"https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/disney.png", category:"DOCU", title:"SEVENTEEN TOUR AGAIN DISNEY+", hashtags:"", link:"random/touragain"}
];

// ==========================================
// 4. UI INITIALIZATION & THEMES
// ==========================================
window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('toast').classList.add('show');
        setTimeout(() => { document.getElementById('toast').classList.remove('show'); }, 4000);
    }, 1000);
    
    if (!sessionStorage.getItem('infoModalShown')) {
        document.getElementById('infoModal').classList.add('active');
        document.body.classList.add('no-scroll');
    }
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

window.closeInfoModal = function() { 
    document.getElementById('infoModal').classList.remove('active'); 
    sessionStorage.setItem('infoModalShown', 'true'); 
    document.body.classList.remove('no-scroll');
}

// ==========================================
// 5. CATEGORY FILTER
// ==========================================
function getFilteredData() {
    if (activeCategory === "ALL") return data;
    return data.filter(item => item.category === activeCategory);
}

function renderCategoryChips() {
    const container = document.getElementById('categoryChips');
    if (!container) return;
    const categories = ["ALL", ...new Set(data.map(d => d.category).filter(Boolean))];
    container.innerHTML = "";
    categories.forEach(cat => {
        const chip = document.createElement('button');
        chip.className = 'chip' + (cat === activeCategory ? ' active' : '');
        chip.textContent = cat;
        chip.onclick = () => {
            activeCategory = cat;
            currentPaginationPage = 1;
            renderCategoryChips();
            renderGrid(1);
        };
        container.appendChild(chip);
    });
}

// ==========================================
// 6. GRID & PAGINATION RENDERING
// ==========================================
const grid = document.getElementById("grid");

window.addEventListener('resize', () => {
    const newLimit = window.innerWidth <= 900 ? 6 : 8;
    if(newLimit !== cardsPerPage) {
        cardsPerPage = newLimit;
        currentPaginationPage = 1; 
        renderGrid(1);
    }
});

function renderGrid(page) {
    if(!grid) return;
    grid.innerHTML = "";
    const filtered = getFilteredData();
    const start = (page-1) * cardsPerPage;
    const end = start + cardsPerPage;
    const pageData = filtered.slice(start,end);

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="no-results"><i class="fas fa-video-slash"></i>No videos in this category yet.</div>`;
        renderPagination(filtered.length);
        return;
    }

    pageData.forEach(item => {
        const el = document.createElement("div");
        el.className = "video-card";
        const isFav = favorites.includes(item.id) ? 'active' : '';
        const starIcon = favorites.includes(item.id) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
        
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
                <button class="btn-watch" onclick="window.location.href='${item.link}'">WATCH</button>
                <button class="btn-fav ${isFav}" onclick="toggleFavorite('${item.id}')">${starIcon}</button>
            </div>
          </div>
        `;
        grid.appendChild(el);
    });
    renderPagination(filtered.length);
    startCountdown();
}

function renderPagination(totalCount) {
    const pagination = document.getElementById("pagination");
    if(!pagination) return;
    pagination.innerHTML = "";
    const count = typeof totalCount === 'number' ? totalCount : data.length;
    const pageCount = Math.ceil(count / cardsPerPage);
    if(pageCount <= 1) return;
    
    for(let i=1; i<=pageCount; i++){
        const btn = document.createElement("button");
        btn.textContent = i;
        if(i===currentPaginationPage) btn.classList.add("active");
        btn.onclick = () => { currentPaginationPage=i; renderGrid(currentPaginationPage); window.scrollTo(0,0); };
        pagination.appendChild(btn);
    }
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

// ==========================================
// 7. FAVORITES LOGIC
// ==========================================
function loadFavoritesFromFirebase() {
    if (!userId) return;
    onValue(ref(db, 'users/' + userId + '/favorites'), snapshot => {
        favorites = snapshot.val() || [];
        renderGrid(currentPaginationPage); 
    });
}

function saveFavoritesToFirebase() {
    if (!userId) return;
    set(ref(db, 'users/' + userId + '/favorites'), favorites);
}

window.toggleFavorite = function(id) {
    if (favorites.includes(id)) {
        favorites = favorites.filter(f => f !== id);
    } else {
        favorites.unshift(id);
    }
    saveFavoritesToFirebase();
}

window.openFavoriteModal = function() {
    const list = document.getElementById('favoriteList');
    if(!list) return;
    list.innerHTML = ''; 
    
    if (favorites.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="far fa-folder-open" style="font-size:30px; margin-bottom:10px;"></i><br>Collection is Empty</div>`;
    } else {
        favorites.forEach(favId => {
            const item = data.find(d => d.id === favId);
            if (item) {
                const el = document.createElement('div');
                el.className = 'fav-list-item';
                el.innerHTML = `
                    <img src="${item.thumb}" class="fav-thumb" loading="lazy">
                    <div class="fav-list-info">
                        <div class="fav-list-title">${item.title}</div>
                        <div class="fav-list-cat">${item.category}</div>
                    </div>
                    <div class="fav-actions">
                        <button class="btn-watch" onclick="window.location.href='${item.link}'" style="padding: 5px 12px; font-size:10px;"><i class="fas fa-play"></i></button>
                        <button class="fav-btn-remove" onclick="toggleFavorite('${item.id}'); openFavoriteModal();"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
                list.appendChild(el);
            }
        });
    }
    document.getElementById('favoriteModal').classList.add('active');
    document.body.classList.add('no-scroll');
}

window.closeFavoriteModal = function() { 
    document.getElementById('favoriteModal').classList.remove('active'); 
    document.body.classList.remove('no-scroll');
}

// Initialize Grid + Chips visually first
renderCategoryChips();
renderGrid(1);

// ==========================================
// 8. NOTIFICATIONS LOGIC
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
// 9. AUTH, SESSIONS & SECURITY LOGIC
// ==========================================
window.logout = function() {
    if(confirm("Are you sure you want to log out?")) {
        signOut(auth).then(() => window.location.replace("index"));
    }
}

window.isKickedOut = false; // FLAG PARA HINDI MAG-MULTIPLE MODAL

onAuthStateChanged(auth, user => {
    if(user) {
        userId = user.uid;
        loadFavoritesFromFirebase();
        
        onValue(ref(db, 'users/' + user.uid), snap => {
            const data = snap.val() || {};
            const name = data.name || "Member";
            const pic = data.profilePicture || "https://via.placeholder.com/150";
            const role = (data.role || "member").toLowerCase();
            const isAdm = role === 'admin';
            
            if(!window.isKickedOut) {
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
        if(!window.isKickedOut) {
            window.location.replace("index");
        }
    }
});

// --- SECURITY LOGIC ---
const allowedPaths = ['/index', '/home', '/nanabnb', '/newtour', 'hxwfanconcert', '/svtholiday', '/arenatour', '/svtjapanconcert', '/touragain', '/gallery', '/profile', '/soon', '/videos', '/admin', '/collection'];
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
