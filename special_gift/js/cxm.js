import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ CXM Single Collection logic successfully loaded!");

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

// 1. MAINTENANCE MODE & GLOBALS
onValue(ref(db, 'settings/maintenanceMode'), (snapshot) => {
    if (snapshot.val() === true && !window.location.pathname.includes('maintenance')) {
        sessionStorage.setItem('returnPage', window.location.href);
        window.location.href = 'maintenance';
    } 
});

function initTheme() {
    const savedTheme = localStorage.getItem('zoneTheme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-mode');
}
window.toggleTheme = function() {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('zoneTheme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
}
initTheme();
window.toggleMobileSidebar = function() { document.getElementById('mobileSidebar').classList.toggle('open'); }
window.logout = function() { if(confirm("Log out?")) signOut(auth).then(() => window.location.replace("index")); }

// 2. AUTHENTICATION & SIDEBAR SYNC
onAuthStateChanged(auth, user => {
    if(user) {
        onValue(ref(db, 'users/' + user.uid), snap => {
            const data = snap.val() || {};
            const name = data.name || "Member";
            const pic = data.profilePicture || "https://via.placeholder.com/150";
            const role = (data.role || "member").toLowerCase();
            const isAdm = role === 'admin';

            ['sidebar-name', 'mobile-sidebar-name'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerText = name; });
            ['sidebar-email', 'mobile-sidebar-email'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerText = user.email; });
            ['sidebar-pic', 'mobile-sidebar-pic'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).src = pic; });
            
            const statusTxt = isAdm ? "ADMIN ACCESS" : "MEMBER ACCESS";
            ['status-text-pc', 'status-text-mobile'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerText = statusTxt; });
            if (isAdm) { sessionStorage.setItem('isAdmin', 'true'); sessionStorage.setItem('internalAccess', 'true'); }
        });
    } else {
        window.location.replace("index");
    }
});

// ==========================================
// 3. CXM COLLECTION LOGIC & LIGHTBOX
// ==========================================
const images = [
    { src: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1771169310/photo_2026-02-15_23-28-20_rvbfv2.jpg" },
    { src: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1771169288/Screenshot_2026-02-15_232110_fwjqhu.png" }
];

let currentImageIndex = 0;
let scale = 1;
const MIN_SCALE = 1, MAX_SCALE = 4;

function renderGallery() {
    const container = document.getElementById('gallery-grid');
    const thumbContainer = document.getElementById('lightbox-thumbs');
    if (!container || !thumbContainer) return;

    container.innerHTML = "";
    thumbContainer.innerHTML = "";

    images.forEach((item, index) => {
        // Build Main Grid
        const div = document.createElement("div");
        div.className = "gallery-item";
        div.innerHTML = `<img src="${item.src}" loading="lazy">`;
        div.onclick = () => window.openLightbox(index);
        container.appendChild(div);

        // Build Thumbnails for Lightbox
        const thumb = document.createElement('img');
        thumb.src = item.src;
        thumb.className = 'lb-thumb';
        thumb.id = `thumb-${index}`;
        thumb.onclick = () => window.openLightbox(index);
        thumbContainer.appendChild(thumb);
    });
}

// Lightbox Open/Close
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");

window.openLightbox = function(index) {
    currentImageIndex = index;
    scale = 1; applyTransform();
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
}

function updateLightboxImage() {
    if (currentImageIndex < 0) currentImageIndex = images.length - 1;
    else if (currentImageIndex >= images.length) currentImageIndex = 0;
    
    scale = 1; applyTransform();
    lightboxImg.src = images[currentImageIndex].src;

    document.querySelectorAll('.lb-thumb').forEach(t => t.classList.remove('active'));
    const activeThumb = document.getElementById(`thumb-${currentImageIndex}`);
    if(activeThumb) {
        activeThumb.classList.add('active');
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function applyTransform() {
    if(!lightboxImg) return;
    lightboxImg.style.transform = `scale(${scale})`;
    if (scale > 1) lightboxImg.classList.add('zoomed');
    else lightboxImg.classList.remove('zoomed');
}

function prevImage() { currentImageIndex--; updateLightboxImage(); }
function nextImage() { currentImageIndex++; updateLightboxImage(); }
function handleKeyDown(e) {
    if (e.key === 'ArrowLeft') prevImage();
    else if (e.key === 'ArrowRight') nextImage();
    else if (e.key === 'Escape') window.closeLightbox();
}

// Pinch to zoom logic for Lightbox
if(lightbox) {
    lightbox.addEventListener('wheel', function(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        scale = Math.min(Math.max(MIN_SCALE, scale + delta), MAX_SCALE);
        applyTransform();
    }, { passive: false });

    let initialDist = 0; let touchStartX = 0; let touchEndX = 0; const minSwipeDistance = 50; 
    lightbox.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) initialDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        else touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    lightbox.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) {
            e.preventDefault(); 
            const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            scale = Math.min(Math.max(MIN_SCALE, scale * (dist / initialDist)), MAX_SCALE);
            applyTransform(); initialDist = dist;
        }
    }, { passive: false });
    lightbox.addEventListener('touchend', function(e) {
        if (e.touches.length < 2 && scale === 1) {
            touchEndX = e.changedTouches[0].screenX;
            if (Math.abs(touchEndX - touchStartX) > minSwipeDistance) (touchEndX - touchStartX > 0) ? prevImage() : nextImage();
        }
    }, { passive: true });
    lightbox.addEventListener("click", function(e) {
        if (e.target === lightbox || e.target.classList.contains('lightbox-content-wrapper')) window.closeLightbox();
    });
}

// ==========================================
// 4. NEW: DIRECT DOWNLOAD FROM CLOUD/GITHUB
// ==========================================
window.downloadImage = async function() {
    const item = images[currentImageIndex];
    try {
        const response = await fetch(item.src);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        
        // Grab original filename from URL
        let filename = item.src.split('/').pop().split('?')[0]; 
        link.download = filename || "ZoneVault_Image.jpg";
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error("Download blocked by CORS or Network error, opening in new tab instead.", error);
        window.open(item.src, '_blank');
    }
}

renderGallery();
