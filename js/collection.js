import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Collection Directory logic successfully loaded!");

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

// 1. MAINTENANCE MODE
const maintenanceRef = ref(db, 'settings/maintenanceMode');
onValue(maintenanceRef, (snapshot) => {
    const isUnderMaintenance = snapshot.val();
    const currentPage = window.location.pathname;
    if (isUnderMaintenance === true && !currentPage.includes('maintenance')) {
        sessionStorage.setItem('returnPage', window.location.href);
        window.location.href = 'maintenance';
    } else if (isUnderMaintenance === false && currentPage.includes('maintenance')) {
        const returnUrl = sessionStorage.getItem('returnPage') || 'home';
        window.location.href = returnUrl; 
    }
});

// 2. DYNAMIC URL PARAMETERS
function updateDynamicURL(uid, role, status) {
  let token = sessionStorage.getItem('urlToken');
  if (!token) {
      token = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
      sessionStorage.setItem('urlToken', token);
  }
  const newUrl = `${window.location.pathname}?uid=${uid}&token=${token}&role=${role}&status=${status}`;
  window.history.pushState({ path: newUrl }, '', newUrl);
}

// 3. UI, THEMES & TOAST
window.addEventListener('load', () => {
    setTimeout(() => {
        const toast = document.getElementById('toast');
        if(toast) {
            toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); }, 4000);
        }
    }, 1000);
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
window.logout = function() {
    if(confirm("Are you sure you want to log out?")) {
        signOut(auth).then(() => window.location.replace("index"));
    }
}

// 4. NOTIFICATIONS
const notifList = document.getElementById('notif-list');
let latestNotifTimestamp = 0;
onValue(query(ref(db, 'notifications'), limitToLast(10)), snapshot => {
    if(!notifList) return;
    notifList.innerHTML = ''; 
    if (snapshot.exists()) {
        Object.values(snapshot.val()).reverse().forEach(n => {
            const item = document.createElement('div');
            item.className = 'notif-item';
            item.innerHTML = `<div class="notif-icon"><i class="fas ${n.icon || 'fa-bell'}"></i></div><div class="notif-content"><h5>${n.title}</h5><p>${n.message}</p></div>`;
            notifList.appendChild(item);
            if(n.timestamp > latestNotifTimestamp) latestNotifTimestamp = n.timestamp;
        });
        const lastRead = localStorage.getItem('lastReadNotif') || 0;
        document.querySelectorAll('.badge').forEach(b => latestNotifTimestamp > lastRead ? b.classList.add('active') : b.classList.remove('active'));
    } else {
        notifList.innerHTML = '<div class="notif-empty">No new notifications</div>';
    }
});
window.toggleNotifModal = function() {
    const modal = document.getElementById('notifModal');
    if(!modal) return;
    modal.classList.toggle('active');
    if (modal.classList.contains('active')) {
        document.querySelectorAll('.badge').forEach(b => b.classList.remove('active'));
        localStorage.setItem('lastReadNotif', latestNotifTimestamp);
    }
}

// 5. AUTH & SECURITY
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

            get(ref(db, 'joinRequests/' + user.uid + '/status')).then(reqSnap => updateDynamicURL(user.uid, role, reqSnap.val() || 'none'));
        });
    } else {
        window.location.replace("index");
    }
});

// 6. COLLECTION DIRECTORY ROUTING
const collectionsDir = [
    
    { category: "CXM [DOUBLE UP] LIVE PARTY", url: "/special_gift/cxm", coverImage: "https://res.cloudinary.com/dp6x9xmku/image/upload/v1771169310/photo_2026-02-15_23-28-20_rvbfv2.jpg" },
    { category: "FUKUOKA SHOW SPECIAL GIFTS", url: "/special_gift/fukuoka", coverImage: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_fukuokanewtour/%5BFUKUOKA%20SHOW%5D%20Group.jpg" },
    { category: "OSAKA SHOW SPECIAL GIFTS", url: "/special_gift/osaka", coverImage: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_osakanewtour/%5BOSAKA%20TOUR%5D%20Group.jpg" },
    { category: "INCHEON SPECIAL GIFTS", url: "/special_gift/incheon", coverImage: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_newtour/%5BNEW%20TOUR%5D%20Spacial%20Gifts%20%20SeungcheoL.png" },
    { category: "WARNING SEOUL SPECIAL GIFTS", url: "/special_gift/warning", coverImage: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_warninginseoul/%5BWARNING%5D%20Spacial%20Gifts%20Hoshi.png" },
    { category: "HOLIDAY FANMEETING GIFTS", url: "/special_gift/oliday", coverImage: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_holiday/%5BHOLIDAY%5D%20Spacial%20Gifts%20%20Groups.jpg" },
    { category: "RIGHT HERE WORLD TOUR GIFTS", url: "/special_gift/right-here", coverImage: "https://raw.githubusercontent.com/svtzoneph/gallery/refs/heads/main/images/special_gift_righthere/%5BRIGHT%20HERE%5D%20Spacial%20Gifts%20Seungcheol.jpg" }
];

function renderMenu() {
    const menuContainer = document.getElementById('category-menu');
    if(!menuContainer) return;
    menuContainer.innerHTML = '';

    collectionsDir.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'cat-card';
        card.onclick = () => window.location.href = cat.url;

        const img = document.createElement('img');
        img.src = cat.coverImage;
        img.loading = "lazy";

        const overlay = document.createElement('div');
        overlay.className = 'cat-title-overlay';
        overlay.innerHTML = `<h3>${cat.category}</h3>`;

        card.appendChild(img);
        card.appendChild(overlay);
        menuContainer.appendChild(card);
    });
}

renderMenu();
