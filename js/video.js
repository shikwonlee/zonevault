import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, onValue, get, set, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { auth, db } from "./firebase-init.js";
import { getCachedUser, setCachedUser, clearCachedUser, applyCachedUserToUI, initStatusSecurityWatchdog } from "./user-cache.js";
import { showToast, showConfirm, escapeHTML } from "./toast.js";

console.log("✅ Videos.js successfully loaded!");

// Instantly hydrate sidebar from cache (0ms delay)
applyCachedUserToUI();

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

// ---- Restore last-viewed page/category so a refresh keeps the user where they were ----
const savedVideosCategory = sessionStorage.getItem('videosCategory');
const savedVideosPage = parseInt(sessionStorage.getItem('videosPage'), 10);
if (savedVideosCategory) activeCategory = savedVideosCategory;
if (!isNaN(savedVideosPage) && savedVideosPage > 0) currentPaginationPage = savedVideosPage;

const data = [
  {id:"v17", thumb:"https://res.cloudinary.com/rabnzafj/image/upload/v1791539307/photo_2026-10-09_17-43-33_nexpcj.jpg", category:"SPECIAL", title:" SEVENTEEN CONCERT LIVE STREAMING [Let's SVTreaming Day] ", hashtags:"", link:"2026/svtreaming_2026"},
  {id:"v16", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1787284496/jve8riqvoof8haxadmf2.jpg", category:"CONCERT", title:"2026 DINO X PICHEOLIN 吉BOARD SHOW ", hashtags:"c: uvvul", link:"2026/dinoxpicheolin"},   
  {id:"v15", thumb:"https://res.cloudinary.com/rabnzafj/image/upload/v1783661220/v8_live_goyang_zbmriz.webp", category:"CONCERT", title:"2026 VERNON THE 8 [V8] LIVE - GOYANG", hashtags:"c: uvvul", link:"2026/vernon_the8_v8"},
  {id:"v14", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1782052754/cl2026_omm6dn.png", category:"FAN MEET", title:"2026 SVT 10TH FAN MEETING SEVENTEEN in CARAT LAND", hashtags:"c: uvvul", link:"2026/svt_in_carat_land_2026"},
  {id:"v13", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1779505888/yakusoku_fiv99n.png", category:"FAN MEET", title:"SEVENTEEN 2026 JAPAN FANMEETING'YAKUSOKU' Osaka", hashtags:"c: uvvul", link:"2026/svt_2026_fanmeeting_yakusoku"},
  {id:"v12", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1775580154/DXS_iltda7.png", category:"CONCERT", title:"DxS [Serenade] ON STAGE - INCHEON", hashtags:"c: uvvul", link:"2026/dxs_on_stage"},
  {id:"v11", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1774264277/10_vdbvfi.png", category:"CONCERT", title:"SEVENTEEN WORLD TOUR [NEW_] ENCORE", hashtags:"c: uvvul", link:"2026/new_encore"},
  {id:"v10", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1771257326/cxm_qjoyfa.jpg", category:"CONCERT", title:"CxM [DOUBLE UP] LIVE PARTY in JAPAN", hashtags:"c: sylveon.click", link:"2026/cxminjapan"},
  {id:"v0.9", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1774046072/Magic_Hour_The_Seventeen_nsiakx.jpg", category:"DOCU", title:"Magic Hour, The Seventeen", hashtags:"c: uvvul", link:"2024/magichour"},
  {id:"v0.8", thumb:"https://res.cloudinary.com/dp6x9xmku/image/upload/v1773207084/Screenshot_2026-03-11_132939_z4bwn6.png", category:"FAN MEET", title:"SEVENTEEN IN CARAT LAND 2025 SVT 9TH FAN MEETING", hashtags:"c: uvvul", link:"2025/9th_caratland"},
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
    // Welcome toast removed
    
    if (!sessionStorage.getItem('infoModalShown')) {
        document.getElementById('infoModal').classList.add('active');
        document.body.classList.add('no-scroll');
    }
});

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

    // Clamp requested page kung lampas na sa available pages (hal. pagbago ng category)
    const maxPage = Math.max(1, Math.ceil(filtered.length / cardsPerPage));
    if (page > maxPage) page = maxPage;
    if (page < 1) page = 1;
    currentPaginationPage = page;

    // Sagipin ang kasalukuyang page/category para maibalik pagka-refresh
    sessionStorage.setItem('videosPage', currentPaginationPage);
    sessionStorage.setItem('videosCategory', activeCategory);

    const start = (page-1) * cardsPerPage;
    const end = start + cardsPerPage;
    const pageData = filtered.slice(start,end);

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-muted, #a1a1aa);">
                <i class="fas fa-video-slash" style="font-size: 36px; margin-bottom: 14px; opacity: 0.5; display: block;"></i>
                <h3 style="font-size: 16px; color: #fff; margin-bottom: 6px;">No Videos Found</h3>
                <p style="font-size: 13px; margin-bottom: 16px;">There are no videos available in this category.</p>
                <button onclick="handleCategoryChange('ALL')" class="btn-watch" style="padding: 8px 18px; font-size: 12px; margin: 0 auto; display: inline-block;">Show All Videos</button>
            </div>
        `;
        renderPagination(filtered.length);
        return;
    }

    pageData.forEach(item => {
        const el = document.createElement("div");
        el.className = "video-card";
        const isFav = favorites.includes(item.id) ? 'active' : '';
        const starIcon = favorites.includes(item.id) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
        
        const safeLink = '/' + item.link.replace(/^\//, '');
        const cleanTitle = (item.title || '').replace(/"/g, '&quot;');
        el.innerHTML = `
          <div class="thumb-wrapper" onclick="sessionStorage.setItem('internalAccess', 'true'); window.location.href='${safeLink}'" style="cursor: pointer;" title="Watch ${cleanTitle}">
            <img src="${item.thumb}" loading="lazy" alt="${cleanTitle}" onerror="this.onerror=null; this.src='https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png';">
            <div class="countdown-badge" data-date="${item.releaseDate || ''}"></div>
          </div>
          <div class="card-body">
            <div class="video-meta">${item.category}</div>
            <div class="video-title" onclick="sessionStorage.setItem('internalAccess', 'true'); window.location.href='${safeLink}'" style="cursor: pointer;" title="Watch ${cleanTitle}">${item.title}</div>
            <div class="video-hashtags">${item.hashtags}</div>
            <div class="card-actions">
                <button class="btn-watch" onclick="sessionStorage.setItem('internalAccess', 'true'); window.location.href='${safeLink}'">WATCH</button>
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
        btn.onclick = () => { renderGrid(i); window.scrollTo(0,0); };
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
// Restore favorites from local cache for instant star indicators
try {
    const cachedFavs = localStorage.getItem('zone_cached_favorites');
    if (cachedFavs) favorites = JSON.parse(cachedFavs);
} catch (e) {}

function loadFavoritesFromFirebase() {
    if (!userId) return;
    onValue(ref(db, 'users/' + userId + '/favorites'), snapshot => {
        favorites = snapshot.val() || [];
        try { localStorage.setItem('zone_cached_favorites', JSON.stringify(favorites)); } catch (e) {}
        renderGrid(currentPaginationPage); 
    });
}

function saveFavoritesToFirebase() {
    if (!userId) return;
    try { localStorage.setItem('zone_cached_favorites', JSON.stringify(favorites)); } catch (e) {}
    set(ref(db, 'users/' + userId + '/favorites'), favorites);
}

window.toggleFavorite = function(id) {
    const isAdding = !favorites.includes(id);
    if (favorites.includes(id)) {
        favorites = favorites.filter(f => f !== id);
    } else {
        favorites.unshift(id);
    }
    saveFavoritesToFirebase();
    showToast(isAdding ? "Added to your collection" : "Removed from collection", isAdding ? "success" : "info");
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
                const safeLink = '/' + item.link.replace(/^\//, '');
                el.innerHTML = `
                    <img src="${item.thumb}" class="fav-thumb" loading="lazy" onerror="this.onerror=null; this.src='https://res.cloudinary.com/rabnzafj/image/upload/v1784702135/DARK_THEME_t1uzij.png';">
                    <div class="fav-list-info">
                        <div class="fav-list-title">${item.title}</div>
                        <div class="fav-list-cat">${item.category}</div>
                    </div>
                    <div class="fav-actions">
                        <button class="btn-watch" onclick="sessionStorage.setItem('internalAccess', 'true'); window.location.href='${safeLink}'" style="padding: 5px 12px; font-size:10px;"><i class="fas fa-play"></i></button>
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

// Initialize Grid + Chips visually first (restores saved page/category if any)
renderCategoryChips();
renderGrid(currentPaginationPage);

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
// 9. AUTH, SESSIONS & SECURITY LOGIC
// ==========================================
window.logout = async function() {
    const confirmed = await showConfirm({
        title: "Log Out",
        text: "Are you sure you want to sign out of Zone Vault?",
        confirmText: "Sign Out",
        danger: true
    });
    if (confirmed) {
        clearCachedUser();
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
            
            // Persist to user cache for all pages
            setCachedUser({
                uid: user.uid,
                email: user.email,
                name: name,
                profilePicture: pic,
                role: role,
                isAdmin: isAdm,
                status: data.status || "approved"
            });

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

            initStatusSecurityWatchdog(auth, db);

            // Update Dynamic URL
            get(ref(db, 'joinRequests/' + user.uid + '/status')).then(reqSnap => {
                const reqStatus = reqSnap.val() || 'none';
                updateDynamicURL(user.uid, role, reqStatus);
            });
        });
    } else {
        if(!window.isKickedOut) {
            clearCachedUser();
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
