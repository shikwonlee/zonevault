import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, onValue, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { auth, db } from "./firebase-init.js";
import { getCachedUser, setCachedUser, clearCachedUser, applyCachedUserToUI } from "./user-cache.js";

console.log("✅ Live.js successfully loaded!");

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
// 3. UI, THEMES & LOGOUT
// ==========================================
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

window.logout = function() {
    if(confirm("Are you sure you want to log out?")) {
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
            
            if (isAdm) { 
                sessionStorage.setItem('isAdmin', 'true'); 
                sessionStorage.setItem('internalAccess', 'true'); 
            }

            get(ref(db, 'joinRequests/' + user.uid + '/status')).then(reqSnap => {
                const reqStatus = reqSnap.val() || 'none';
                updateDynamicURL(user.uid, role, reqStatus);
            });
        });
    } else {
        window.location.replace("/index");
    }
});
