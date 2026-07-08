// ==========================================
// 1. FIREBASE AUTHENTICATION & DATABASE SYNC
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, onValue, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

// --- NOTIFICATIONS (bell dropdown) ---
const notifList = document.getElementById('notif-list');
let latestNotifTimestamp = 0;
const notifQuery = query(ref(db, 'notifications'), limitToLast(10));

onValue(notifQuery, snapshot => {
    if (!notifList) return;
    notifList.innerHTML = '';
    if (snapshot.exists()) {
        const data = snapshot.val();
        const notifs = Object.values(data).reverse();
        notifs.forEach(n => {
            const item = document.createElement('div');
            item.className = 'notif-item';
            item.innerHTML = `<div class="notif-icon"><i class="fas ${n.icon || 'fa-bell'}"></i></div><div class="notif-content"><h5>${n.title}</h5><p>${n.message}</p></div>`;
            notifList.appendChild(item);
            if (n.timestamp > latestNotifTimestamp) latestNotifTimestamp = n.timestamp;
        });
        const lastRead = localStorage.getItem('lastReadNotif') || 0;
        const badgeDesktop = document.getElementById('notif-badge');
        const badgeMobile = document.getElementById('notif-badge-mobile');
        if (latestNotifTimestamp > lastRead) {
            if (badgeDesktop) badgeDesktop.classList.add('active');
            if (badgeMobile) badgeMobile.classList.add('active');
        } else {
            if (badgeDesktop) badgeDesktop.classList.remove('active');
            if (badgeMobile) badgeMobile.classList.remove('active');
        }
    } else {
        notifList.innerHTML = '<div class="notif-empty">No new notifications</div>';
    }
});

// Check user state on load
onAuthStateChanged(auth, async (user) => {
    if (user) {
        
       // --- A. VERIFY USER FROM DATABASE ---
const userRef = ref(db, 'users/' + user.uid);
const snapshot = await get(userRef);

if (!snapshot.exists()) {
    alert("Account not found.");
    await signOut(auth);
    window.location.replace("login.html");
    return;
}

const data = snapshot.val();

console.log("USER DATA:", data);
console.log("STATUS:", data.status);

// Check approval status directly from Firebase
if (data.status !== "approved") {
    alert("Access Denied: You are not approved to enter Zone Vault.");
    await signOut(auth);
    window.location.replace("login.html");
    return;
}

// Restore local access flag for compatibility
localStorage.setItem("internalAccess", "true");

const userEmail = user.email || "";

        // --- B. FETCH PROFILE DATA FROM DATABASE ---
        try {

    let userName = "Vault Member";
    let userPic = "https://via.placeholder.com/150";

    userName = data.name || data.telegramUsername || "Vault Member";
    userPic = data.profilePicture || "https://via.placeholder.com/150";


            // --- C. UPDATE UI ---
            // Desktop Sidebar only — the mobile slide-out sidebar was removed
            // in favor of the Bottom Nav Bar, which reads name/email/pic from the Profile page.
            if (document.getElementById("sidebar-name")) document.getElementById("sidebar-name").innerText = userName;
            if (document.getElementById("sidebar-email")) document.getElementById("sidebar-email").innerText = userEmail;
            if (document.getElementById("sidebar-pic")) {
                const picEl = document.getElementById("sidebar-pic");
                picEl.src = userPic;
                picEl.onerror = () => { picEl.src = "https://via.placeholder.com/150"; }; // Iwas broken image
            }
        } catch (error) {
            console.error("Error fetching database profile:", error);
        }

    } else {
        window.location.replace("login.html");
    }
});


// ==========================================
// 2. GLOBALS, MODALS, & LOGOUT
// ==========================================
window.isKickedOut = false;
let expirationTimer = null; 

function initTheme() {
    const savedTheme = localStorage.getItem('zoneTheme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-mode');
}
initTheme();

window.toggleTheme = function() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('zoneTheme', isLight ? 'light' : 'dark');
}

window.toggleNotifModal = function() {
    const modal = document.getElementById('notifModal');
    if (!modal) return;
    modal.classList.toggle('active');
    if (modal.classList.contains('active')) {
        const badgeDesktop = document.getElementById('notif-badge');
        const badgeMobile = document.getElementById('notif-badge-mobile');
        if (badgeDesktop) badgeDesktop.classList.remove('active');
        if (badgeMobile) badgeMobile.classList.remove('active');
        localStorage.setItem('lastReadNotif', latestNotifTimestamp);
    }
}

window.openInfoModal = function(cardElement) {
    const title = cardElement.querySelector('.card-head h4').innerText;
    const content = cardElement.querySelector('.info-content-hidden').innerHTML;
    document.getElementById('infoPopupTitle').innerText = title;
    document.getElementById('infoPopupBody').innerHTML = content;
    document.getElementById('infoPopupModal').classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeInfoModal = function(event) {
    if (!event || event.target.id === 'infoPopupModal' || event.currentTarget.classList.contains('info-modal-close')) {
        document.getElementById('infoPopupModal').classList.remove('active');
        document.body.style.overflow = '';
    }
};

window.logout = function() {
    if(confirm("Are you sure you want to log out?")) {
        localStorage.removeItem("internalAccess");
        localStorage.removeItem("accessID");
        localStorage.removeItem("fromIndex");
        localStorage.removeItem("isAdmin");
        
        signOut(auth).then(() => {
            window.location.replace("login.html"); 
        }).catch((error) => {
            alert("Logout failed: " + error.message);
        });
    }
}


// ==========================================
// 3. UI AND CAROUSEL LOGIC 
// ==========================================
function initializeUI() {
    setTimeout(() => {
        const toast = document.getElementById('toast');
        if(toast) {
            toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); }, 4000);
        }
    }, 1000);

    const slideData = [
        { src: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1775580154/DXS_iltda7.png", title: "DXS [SERENADE ON STAGE] ICHEON" },
        { src: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1774264277/10_vdbvfi.png", title: "SEVENTEEN WORLD TOUR [NEW] ENCORE" },
        { src: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1774046072/Magic_Hour_The_Seventeen_nsiakx.jpg", title: "MAGIC HOUR THE SEVENTEEN" },
        { src: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1773207084/Screenshot_2026-03-11_132939_z4bwn6.png", title: "SEVENTEEN IN CARATLAND 2025 SVT 9TH FAN MEETING" },
        { src: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1772085168/This_live_event_has_ended._svopgf.png", title: "SEVENTEEN IN CARATLAND 2024 SVT 8TH FAN MEETING" },
        { src: "https://raw.githubusercontent.com/svtzoneph/gallery/main/images/website/CXM.png", title: "CXM DOUBLE UP PARTY" }
    ];

    const thumbnailBoxes = document.querySelectorAll('.thumb-btn');
    const mainImage = document.getElementById('mainDisplay');
    const heroTitle = document.getElementById('heroTitle'); 

    if (thumbnailBoxes.length > 0 && mainImage) {
        let current = 0;

        function switchImageByIndex(index) {
            mainImage.style.opacity = '0';
            if (heroTitle) heroTitle.style.opacity = '0';
            
            setTimeout(() => { 
                mainImage.src = slideData[index].src; 
                if (heroTitle) heroTitle.innerText = slideData[index].title;
                
                mainImage.style.opacity = '1'; 
                if (heroTitle) heroTitle.style.opacity = '1';
            }, 300);

            thumbnailBoxes.forEach(b => b.classList.remove('active'));
            if (index < thumbnailBoxes.length) thumbnailBoxes[index].classList.add('active');
            
            current = index;
        }
        
        setInterval(() => { 
            switchImageByIndex((current + 1) % slideData.length); 
        }, 4000); 
        
        window.switchImage = function(index) {
            switchImageByIndex(index);
        }
    }

    const scroller = document.getElementById('recentlyAddedScroller');
    if (scroller) {
        const originalCards = Array.from(scroller.children);
        const gap = window.innerWidth <= 900 ? 18 : 24;
        let originalWidth = 0;
        
        originalCards.forEach(card => { originalWidth += card.offsetWidth + gap; });
        originalCards.forEach(card => scroller.appendChild(card.cloneNode(true)));

        let isDown = false;
        let isHovered = false;
        let startX, scrollLeftPos;
        let currentScroll = 0;
        const speed = 1; 

        function continuousScroll() {
            if (!isDown && !isHovered) {
                currentScroll += speed;
                if (currentScroll >= originalWidth) currentScroll -= originalWidth;
                scroller.scrollLeft = currentScroll;
            } else {
                currentScroll = scroller.scrollLeft;
            }
            requestAnimationFrame(continuousScroll);
        }
        
        requestAnimationFrame(continuousScroll);

        scroller.addEventListener('mouseenter', () => isHovered = true);
        scroller.addEventListener('mouseleave', () => isHovered = false);
        scroller.addEventListener('touchstart', () => isHovered = true, {passive: true});
        scroller.addEventListener('touchend', () => isHovered = false);

        scroller.addEventListener('mousedown', (e) => {
            isDown = true;
            scroller.classList.add('active');
            startX = e.pageX - scroller.offsetLeft;
            scrollLeftPos = scroller.scrollLeft;
        });
        scroller.addEventListener('mouseleave', () => { isDown = false; scroller.classList.remove('active'); });
        scroller.addEventListener('mouseup', () => { isDown = false; scroller.classList.remove('active'); });
        scroller.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - scroller.offsetLeft;
            const walk = (x - startX) * 1.5; 
            scroller.scrollLeft = scrollLeftPos - walk;
            currentScroll = scroller.scrollLeft; 
        });
    }
}

// Start UI Logic
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeUI);
} else {
    initializeUI();
}
