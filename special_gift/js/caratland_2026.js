import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ caratland.js successfully loaded!");

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
// 6. THIS CATEGORY'S IMAGES
// (Google Drive links removed - each image's own Cloudinary/GitHub link
//  is reused directly for previewing AND downloading)
// ==========================================
const images = [
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/1_DAY_PASS_Gift_6-20_tdcqka.jpg", link: "https://drive.usercontent.google.com/download?id=1UdnK-xiNxbjrB1qYF0UlBYLvK1PpKqnW&export=download&authuser=2&confirm=t&uuid=ba4551e1-76c9-42f7-886c-14df392f4a0b&at=ABswASaxrcj52XJjWqkJMhDWempz:1783233329092" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/1_DAY_PASS_Gift_6-21_vqdasx.jpg", link: "https://drive.usercontent.google.com/download?id=1CmavyDqjw7C8roCfqUGgxY3Y7eqJTAF3&export=download&authuser=2&confirm=t&uuid=ce447a68-e248-48f6-b410-ed664c461b05&at=ABswASZcjIr8U_h9uOHhMqQNEQQc:1783233331463" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/8f5acef9e251a0dcbc61d351b16a947d12e03aa275cfddc18fa9e0b568b14526_jzaen9.jpg", link: "https://drive.usercontent.google.com/download?id=1BfKeVGCbmGythePC61nSS9tVM21fB17Q&export=download&authuser=2&confirm=t&uuid=a8dd02dd-d514-4e09-9fc8-d882a9daf243&at=ABswASZlAPLJv0Pmv6PQAPoS_SKL:1783233366212" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219917/6da809f2e4360ee0fd05fc0d1ce910f1632d4a99738726cdb61aa898c70081d3_tid6mk.jpg", link: "https://drive.usercontent.google.com/download?id=1Zfl8NwFODm06JBuiy1MEoXST3OMjpcQ3&export=download&authuser=2&confirm=t&uuid=1a7809fb-7952-4360-b0f7-d0f813d04d70&at=ABswASbddyleHcT3Y0K30bpDGutI:1783233343035" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/bf9393e62058b0f6738055209ff218ad96df99d6335bdde7aaf49e5507866d1c_ktpi0f.jpg", link: "https://drive.usercontent.google.com/download?id=1lI4fJ7iHPvYvQo_wIhJ6OGP5M74WGwQf&export=download&authuser=2&confirm=t&uuid=e01218a0-0c75-4232-806f-2ec2d20cb89b&at=ABswASY65jPbaO5isAlfMJGqjTqg:1783233351465" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/42b0700967865909c9a32e8cd12af206daf49039d4b4c8c9342683c910be207b_cxchzp.jpg", link: "https://drive.usercontent.google.com/download?id=1NJEp0W3HeINqRxjw2mZVv1KExntdPrxf&export=download&authuser=2&confirm=t&uuid=9eebaf4c-01df-40d4-a411-f7db88cf19c2&at=ABswASbSyEFAVpgqG25LprNlyh7s:1783233338506" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/f646b77ec1127e7d4badf7af12db486fac3646c3490046beaa6e92b9104440e7_ia11b8.jpg", link: "https://drive.usercontent.google.com/download?id=1xnB__WPjfC2cDhID4itKiOm20Z5HnC8-&export=download&authuser=2&confirm=t&uuid=9e6e0666-1f83-4ccc-8da8-dc3b3bd8234a&at=ABswASaMQO6MaQ_ZdXDKo2KRxfc6:1783233353211" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/5d2a9595d772d74b488c913ef0edb6cb4ba04a50000ef5c85b7a04df185ced72_g6qka7.jpg", link: "https://drive.usercontent.google.com/download?id=1Wy24qLqxiPj2YyDX0gO5AOUMmwDMoqC3&export=download&authuser=2&confirm=t&uuid=33ee155a-9810-4043-9a3a-a3b81d6a7918&at=ABswASaGCuVy-7sSDiMdgeVfl7bQ:1783233369034" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219918/24cb5c7a7b3be1f451d12e72b0377eb0a88561d781e733637aa4f9451a8b163e_gdei6u.jpg", link: "https://drive.usercontent.google.com/download?id=1eBORgWGGwyndcTCYDm3ezcjIHzMt6-Va&export=download&authuser=2&confirm=t&uuid=d2fa304e-fd23-485c-ac95-829e15ae35f8&at=ABswASa9EmmqMlnHMrhNtB6ZtxG6:1783233367627" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219917/69d20185f1cb8c8bb5c74e5ea4e9790cd55ea46896f4c61d65011c5d40672c62_pmvun5.jpg", link: "https://drive.usercontent.google.com/download?id=1MMyQe0qt8t5K4yPMq1h2py5LtEzDINEH&export=download&authuser=2&confirm=t&uuid=3ec897df-439a-4a5c-8531-f0f170725b67&at=ABswASYdGACaqtyEFHNvgStpjc64:1783233374781" },
    { src: "https://res.cloudinary.com/rabnzafj/image/upload/v1783219917/5d77fd887fd15309c4f0b40576699a6487ad32adda537995a8fba2e2e2faf71b_bmtld0.jpg", link: "https://drive.usercontent.google.com/download?id=1XozpmyovhVR0vYA_eAbVIoAOQO8bDqwb&export=download&authuser=2&confirm=t&uuid=2c9cd8b7-5080-42a2-83bc-32bd76ef21aa&at=ABswASZ6bdq5raUT6qmfTpeGUjp4:1783233336640" }
];

function renderGallery() {
    const container = document.getElementById('grid-category');
    if(!container) return;
    container.innerHTML = "";
    images.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "gallery-item";
        const filename = decodeURIComponent(item.src).split('/').pop().replace(/\.(jpg|png|jpeg)/i, '');
        div.innerHTML = `<img src="${item.src}" alt="${filename}" loading="lazy">`;
        div.onclick = () => window.openLightbox(index);
        container.appendChild(div);
    });
    renderThumbnails();
}

function renderThumbnails() {
    const thumbContainer = document.getElementById('lightbox-thumbs');
    if(!thumbContainer) return;
    thumbContainer.innerHTML = '';
    images.forEach((item, index) => {
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
    // Uses the Google Drive direct-download link for this image instead of
    // fetching the file ourselves. This avoids the CORS / opaque-response /
    // service-worker interference entirely - Drive handles the download on
    // its own page, which the browser then saves normally on any device
    // (phone or desktop), matching how collection.js already does it.
    const item = images[currentImageIndex];
    if (item.link) {
        window.open(item.link, '_blank');
    } else {
        // No Drive link available for this image - fall back to opening
        // the image file itself.
        window.open(item.src, '_blank');
    }
}

function updateLightboxImage() {
    if (currentImageIndex < 0) currentImageIndex = images.length - 1;
    else if (currentImageIndex >= images.length) currentImageIndex = 0;
    resetZoom(); 
    const item = images[currentImageIndex];
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

// Initial render
renderGallery();
