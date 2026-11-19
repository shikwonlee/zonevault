import { auth, db, getCachedUser, setCachedUser, clearCachedUser, cleanStaleCaches } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, onValue, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

cleanStaleCaches();

function redirectToMainSite() {
    const h = window.location.hostname;
    window.location.replace((h === 'zonevault.live' || h === 'www.zonevault.live') ? 'https://zonevault.live/' : '/');
}

function initTheme() {
    const savedTheme = localStorage.getItem('zoneTheme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-mode');
}
initTheme();

window.toggleTheme = function() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('zoneTheme', isLight ? 'light' : 'dark');
};

let latestNotifTimestamp = 0;
const notifList = document.getElementById('notif-list');
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
};

window.logout = function() {
    if (confirm("Are you sure you want to log out?")) {
        clearCachedUser();
        signOut(auth).then(() => redirectToMainSite());
    }
};

const initialCached = getCachedUser();
if (initialCached) {
    if (document.getElementById("sidebar-name")) document.getElementById("sidebar-name").innerText = initialCached.name || "Member";
    if (document.getElementById("sidebar-email")) document.getElementById("sidebar-email").innerText = initialCached.email || "";
    if (document.getElementById("sidebar-pic") && initialCached.profilePicture) {
        document.getElementById("sidebar-pic").src = initialCached.profilePicture;
    }
    if (document.getElementById("status-text-pc")) {
        document.getElementById("status-text-pc").innerText = initialCached.role === 'admin' ? "ADMIN ACCESS" : "MEMBER ACCESS";
    }
}

onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) {
        sessionStorage.setItem('internalAccess', 'true');
        localStorage.setItem('internalAccess', 'true');
        onValue(ref(db, 'users/' + user.uid), snap => {
            const data = snap.val() || {};
            const name = data.name || "Member";
            const pic = data.profilePicture || "https://via.placeholder.com/150";
            const role = (data.role || "member").toLowerCase();
            const isAdm = role === 'admin';

            if (document.getElementById("sidebar-name")) document.getElementById("sidebar-name").innerText = name;
            if (document.getElementById("sidebar-email")) document.getElementById("sidebar-email").innerText = user.email || "";
            if (document.getElementById("sidebar-pic")) document.getElementById("sidebar-pic").src = pic;
            if (document.getElementById("status-text-pc")) {
                document.getElementById("status-text-pc").innerText = isAdm ? "ADMIN ACCESS" : "MEMBER ACCESS";
            }
            if (isAdm) {
                sessionStorage.setItem('isAdmin', 'true');
            }
        });
    } else {
        clearCachedUser();
        redirectToMainSite();
    }
});
