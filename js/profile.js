import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, get, update, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

console.log("✅ Profile.js successfully loaded!");

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

// --- GLOBAL CLOUDINARY CONFIG ---
const CLOUDINARY_UPLOAD_PRESET = "zone_vault_avatars"; 
const CLOUDINARY_CLOUD_NAME = "dp6x9xmku"; 
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

// ==========================================
// 1. THE MAINTENANCE KILL SWITCH
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

// --- THEME LOGIC ---
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

window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('toast').classList.add('show');
        setTimeout(() => { document.getElementById('toast').classList.remove('show'); }, 4000);
    }, 1000);
});

window.toggleMobileSidebar = function() { document.getElementById('mobileSidebar').classList.toggle('open'); }
window.toggleEditMode = function() {
    const display = document.getElementById('display-mode');
    const edit = document.getElementById('edit-mode');
    if(display.style.display === 'none') {
        display.style.display = 'block'; edit.style.display = 'none';
    } else {
        const currentName = document.getElementById('display-name').innerText;
        const currentBio = document.getElementById('display-bio').innerText;
        document.getElementById('nameInput').value = currentName;
        document.getElementById('bioInput').value = (currentBio === "No bio set.") ? "" : currentBio;
        display.style.display = 'none'; edit.style.display = 'block';
    }
}

// --- NOTIFICATIONS ---
const notifList = document.getElementById('notif-list');
let latestNotifTimestamp = 0;
const notifQuery = query(ref(db, 'notifications'), limitToLast(10));

onValue(notifQuery, snapshot => {
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
    modal.classList.toggle('active');
    if (modal.classList.contains('active')) {
        const badgeDesktop = document.getElementById('notif-badge');
        const badgeMobile = document.getElementById('notif-badge-mobile');
        if(badgeDesktop) badgeDesktop.classList.remove('active');
        if(badgeMobile) badgeMobile.classList.remove('active');
        localStorage.setItem('lastReadNotif', latestNotifTimestamp);
    }
}

// --- AUTH & DATA LOGIC ---
onAuthStateChanged(auth, user => {
    if(user) {
        console.log("✅ User detected:", user.uid);
        const uid = user.uid;
        const uidEl = document.getElementById('user-uid');
        if(uidEl) uidEl.innerText = uid;
        
        // Fetch Profile + Real-time UI Sync
        onValue(ref(db, 'users/' + uid), snap => {
            const data = snap.val() || {};
            
            const name = data.name || data.telegramUsername || "Member";
            const bio = data.bio || "No bio set.";
            const pic = data.profilePicture || "https://via.placeholder.com/150";
            
            // Banner Logic
            const bannerColor = data.bannerColor || "#27272a"; 
            const bannerImage = data.bannerImage || null;
            const bannerEl = document.getElementById('profile-banner');
            
            if (bannerImage) {
                bannerEl.style.backgroundImage = `url('${bannerImage}')`;
                bannerEl.style.backgroundSize = '';
                bannerEl.style.backgroundPosition = '';
                bannerEl.classList.add('has-image');
            } else {
                bannerEl.style.backgroundImage = 'none';
                bannerEl.style.background = `linear-gradient(135deg, ${bannerColor}, var(--bg-color))`;
                bannerEl.classList.remove('has-image');
            }

            const inputEl = document.getElementById('bannerColorInput');
            if(inputEl) inputEl.value = bannerColor;

            document.getElementById('display-name').innerText = name;
            document.getElementById('display-email').innerText = user.email;
            document.getElementById('display-bio').innerText = bio;
            document.getElementById('profile-pic').src = pic;

            // Sidebar updates
            document.getElementById('sidebar-name').innerText = name;
            document.getElementById('sidebar-email').innerText = user.email;
            document.getElementById('sidebar-pic').src = pic;
            document.getElementById('mobile-sidebar-name').innerText = name;
            document.getElementById('mobile-sidebar-email').innerText = user.email;
            document.getElementById('mobile-sidebar-pic').src = pic;

            const rawRole = (data.role || "member").toLowerCase();
            let displayRoleText = rawRole.toUpperCase();
            if (displayRoleText === "USER") displayRoleText = "MEMBER";
            
            const roleEl = document.getElementById('user-role');
            const displayRoleEl = document.getElementById('display-role');
            roleEl.innerText = displayRoleText;
            displayRoleEl.innerText = displayRoleText;
            
            const isAdm = rawRole === 'admin';
            const statusTxt = isAdm ? "ADMIN ACCESS" : "MEMBER ACCESS";
            
            if(document.getElementById("status-text-pc")) document.getElementById("status-text-pc").innerText = statusTxt;
            if(document.getElementById("status-text-mobile")) document.getElementById("status-text-mobile").innerText = statusTxt;

            if(isAdm) {
                roleEl.style.color = 'var(--admin-color)';
                displayRoleEl.style.color = 'var(--admin-color)';
                sessionStorage.setItem('isAdmin', 'true');
                sessionStorage.setItem('internalAccess', 'true');
            } else {
                roleEl.style.color = 'var(--text-main)';
                displayRoleEl.style.color = 'var(--text-muted)';
                sessionStorage.removeItem('isAdmin');
            }

            // === FIXED REQUEST STATUS LOGIC ===
            const reqStatusEl = document.getElementById('req-status');
            
            if (data.status === "approved") {
                // Kung nasa 'users' at approved, ilagay ang Approved
                if(reqStatusEl) {
                    reqStatusEl.innerText = "Approved";
                    reqStatusEl.style.color = 'var(--status-online)';
                }
                updateDynamicURL(uid, rawRole, "approved");
            } else {
                // Fallback check sa joinRequests kung wala pa sa users
                get(ref(db, 'joinRequests/' + uid + '/status')).then(reqSnap => {
                    const reqStatus = reqSnap.val();
                    if(reqStatusEl) {
                        if(reqStatus) {
                            const fmt = reqStatus.charAt(0).toUpperCase() + reqStatus.slice(1);
                            reqStatusEl.innerText = fmt;
                            if(reqStatus === 'pending') reqStatusEl.style.color = 'var(--status-online)';
                            else if(reqStatus === 'rejected') reqStatusEl.style.color = 'var(--admin-color)';
                        } else {
                            reqStatusEl.innerText = "None"; 
                            reqStatusEl.style.color = "var(--text-muted)";
                        }
                    }
                    updateDynamicURL(uid, rawRole, reqStatus || 'none');
                });
            }
        });

        // Fetch Updates
        onValue(query(ref(db, 'notifications'), limitToLast(5)), snap => {
            const container = document.getElementById('notice-container');
            if (!snap.exists()) {
                container.innerHTML = `<div style="color:var(--text-muted); font-style:italic;">No recent updates.</div>`;
                return;
            }
            const data = snap.val();
            const list = Object.values(data).reverse(); 
            let html = '';
            list.forEach(n => {
                html += `
                <div style="padding:12px 0; border-bottom:1px solid var(--glass-border); display:flex; gap:12px; align-items:flex-start;">
                    <div style="width:24px; height:24px; border-radius:50%; background:var(--input-bg); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--text-main); font-size:10px;">
                        <i class="fas ${n.icon || 'fa-bell'}"></i>
                    </div>
                    <div>
                        <div style="font-weight:600; font-size:13px; color:var(--text-main); margin-bottom:2px;">${n.title}</div>
                        <div style="font-size:12px; color:var(--text-muted); line-height:1.4;">${n.message}</div>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        });

        // WATCH HISTORY
        onValue(ref(db, 'watchHistory/' + uid), (snapshot) => {
            const historyContainer = document.getElementById("watched-list");
            const data = snapshot.val();
            if (data) {
                let historyItems = Object.values(data);
                historyItems.sort((a, b) => b.timestamp - a.timestamp);
                const NOW = Date.now();
                const validItems = historyItems.filter(item => (NOW - (item.timestamp || 0)) < (3 * 24 * 60 * 60 * 1000));
                const limitedItems = validItems.slice(0, 6);
                
                if(limitedItems.length === 0) {
                     historyContainer.innerHTML = "<div style='color:var(--text-muted)'>No recent history (last 3 days).</div>";
                     return;
                }
                let historyHTML = "";
                limitedItems.forEach(item => { 
                    if (item.title && item.currentTime > 0) {
                        const minutes = Math.floor(item.currentTime / 60);
                        const seconds = Math.floor(item.currentTime % 60);
                        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                        let percent = (item.duration > 0) ? (item.currentTime / item.duration) * 100 : 0;
                        
                        historyHTML += `
                        <div class="history-item" onclick="window.location.href='${item.link ? item.link.replace('.html', '') : '#'}'">
                            <div class="history-thumb-wrapper">
                                <img src="${item.image || 'https://via.placeholder.com/160x90'}" class="history-thumb-img">
                                <div class="progress-bar-bg">
                                    <div class="progress-bar-fill" style="width: ${percent}%"></div>
                                </div>
                                <div class="time-badge">${timeString}</div>
                            </div>
                            <div class="history-info">
                                <div class="history-title">${item.title}</div>
                                <div class="history-meta"><i class="fas fa-play" style="font-size:10px;"></i> Resume</div>
                            </div>
                        </div>`;
                    }
                });
                historyContainer.innerHTML = historyHTML;
            } else {
                historyContainer.innerHTML = "<div style='color:var(--text-muted)'>No watch history found.</div>";
            }
        });
    } else {
        // KUNG WALANG SESSION, IBABALIK SA LOGIN PAGE
        console.log("❌ No user detected, redirecting to login...");
        window.location.href = "login";
    }
});

window.saveProfile = function() {
    const user = auth.currentUser;
    if(!user) return;
    const btn = document.querySelector('#edit-mode .btn-primary');
    const originalText = btn.innerText;
    btn.innerText = "Saving...";
    
    const updates = {
        name: document.getElementById('nameInput').value,
        bio: document.getElementById('bioInput').value,
        bannerColor: document.getElementById('bannerColorInput').value
    };
    
    update(ref(db, 'users/' + user.uid), updates).then(() => {
         btn.innerText = "Saved!";
         setTimeout(() => { btn.innerText = originalText; toggleEditMode(); }, 800);
    });
}

window.logout = function() {
    if(confirm("Are you sure you want to log out?")) {
        signOut(auth).then(() => window.location.replace("index"));
    }
}

// ==========================================
// --- AVATAR UPLOAD LOGIC ---
// ==========================================
// ... (Walang binago dito, same as your code) ...
const avatarModal = document.getElementById('imageChangeModal');
const avatarFileInput = document.getElementById('fileInput');
const chooseAvatarBtn = document.getElementById('chooseFromGalleryBtn');
const avatarStatusEl = document.getElementById('uploadStatus');
const currentPreview = document.getElementById('current-photo-preview');

window.openAvatarModal = function() {
    if (!auth.currentUser) return; 
    avatarModal.style.display = 'flex';
    currentPreview.src = document.getElementById('profile-pic').src;
    avatarStatusEl.innerText = "Ready for upload...";
    avatarStatusEl.style.color = "var(--text-muted)";
    avatarStatusEl.style.display = "none";
    chooseAvatarBtn.disabled = false;
    chooseAvatarBtn.style.opacity = "1";
}

window.closeImageChangeModal = function() {
    avatarModal.style.display = 'none';
    avatarFileInput.value = ''; 
}

chooseAvatarBtn.addEventListener('click', () => { avatarFileInput.click(); });
avatarFileInput.addEventListener('change', handleAvatarSelect, false);

function handleAvatarSelect(evt) {
    const file = evt.target.files[0];
    if (!file) return;

    avatarStatusEl.style.display = "block";
    chooseAvatarBtn.disabled = true;
    chooseAvatarBtn.style.opacity = "0.5";

    if (!ALLOWED_MIME_TYPES.includes(file.type) || file.size / (1024 * 1024) > MAX_FILE_SIZE_MB) {
        avatarStatusEl.innerText = `Invalid file. JPEG/PNG only, max ${MAX_FILE_SIZE_MB}MB.`;
        avatarStatusEl.style.color = "#ff6b6b"; 
        avatarFileInput.value = ''; 
        chooseAvatarBtn.disabled = false;
        chooseAvatarBtn.style.opacity = "1";
        return;
    }

    avatarStatusEl.innerText = "Validating... Uploading to secure server...";
    avatarStatusEl.style.color = "var(--text-main)";
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData })
    .then(response => {
        if (!response.ok) return response.json().then(err => { throw new Error(err.error?.message || "Upload failed"); });
        return response.json();
    })
    .then(data => {
        if (data.secure_url) {
            avatarStatusEl.innerText = "Upload successful! Syncing to database...";
            avatarStatusEl.style.color = "var(--status-online)";
            currentPreview.src = data.secure_url;
            return update(ref(db, 'users/' + auth.currentUser.uid), {profilePicture: data.secure_url});
        } else throw new Error("Upload failed (no URL returned)");
    })
    .then(() => {
        avatarStatusEl.innerText = "Saved successfully! Profile updated.";
        setTimeout(closeImageChangeModal, 1500); 
    })
    .catch(error => {
        avatarStatusEl.innerText = "Error: " + error.message;
        avatarStatusEl.style.color = "#ff6b6b";
        chooseAvatarBtn.disabled = false;
        chooseAvatarBtn.style.opacity = "1";
    });
}

// ==========================================
// --- BANNER UPLOAD & CROPPING LOGIC ---
// ==========================================
// ... (Walang binago dito, same as your code) ...
let cropper = null;
const bannerModal = document.getElementById('bannerChangeModal');
const bannerFileInput = document.getElementById('bannerFileInput');
const bannerStatusEl = document.getElementById('bannerUploadStatus');
const cropperWrapper = document.getElementById('cropperWrapper');
const bannerActionBtns = document.getElementById('bannerCropActionBtns');
const chooseBannerBtn = document.getElementById('chooseBannerBtn');

window.openBannerModal = function() {
    if (!auth.currentUser) return;
    bannerModal.style.display = 'flex';
    resetBannerModal();
}

window.closeBannerModal = function() {
    bannerModal.style.display = 'none';
    resetBannerModal();
}

window.resetBannerModal = function() {
    if (cropper) { cropper.destroy(); cropper = null; }
    bannerFileInput.value = '';
    cropperWrapper.style.display = 'none';
    bannerActionBtns.style.display = 'none';
    bannerStatusEl.style.display = 'none';
    chooseBannerBtn.style.display = 'inline-flex';
}

bannerFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type) || file.size / (1024 * 1024) > MAX_FILE_SIZE_MB) {
        alert(`Invalid file. Must be JPEG/PNG and under ${MAX_FILE_SIZE_MB}MB.`);
        return;
    }

    chooseBannerBtn.style.display = 'none';
    cropperWrapper.style.display = 'block';
    bannerActionBtns.style.display = 'flex';
    bannerStatusEl.style.display = 'none';

    const reader = new FileReader();
    reader.onload = function(event) {
        const image = document.getElementById('bannerCropperImg');
        image.src = event.target.result;
        
        if (cropper) cropper.destroy();
        
        cropper = new Cropper(image, {
            aspectRatio: 1000 / 180, 
            viewMode: 1,      
            dragMode: 'move', 
            autoCropArea: 1,  
            guides: true,
            background: false
        });
    };
    reader.readAsDataURL(file);
});

window.uploadCroppedBanner = function() {
    if (!cropper) return;
    
    bannerStatusEl.style.display = 'block';
    bannerStatusEl.innerText = "Processing image...";
    bannerStatusEl.style.color = "var(--text-main)";
    bannerActionBtns.style.display = 'none'; 

    cropper.getCroppedCanvas({ width: 1000, height: 180 }).toBlob(function(blob) {
        bannerStatusEl.innerText = "Scanning & Uploading to server...";
        
        const formData = new FormData();
        formData.append('file', blob, 'banner.jpg');
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error?.message || "Upload failed"); });
            return response.json();
        })
        .then(data => {
            if (data.secure_url) {
                bannerStatusEl.innerText = "Upload successful! Syncing profile...";
                bannerStatusEl.style.color = "var(--status-online)";
                return update(ref(db, 'users/' + auth.currentUser.uid), {bannerImage: data.secure_url});
            } else throw new Error("Upload failed (no URL)");
        })
        .then(() => {
            bannerStatusEl.innerText = "Cover updated successfully!";
            setTimeout(closeBannerModal, 1500);
        })
        .catch(error => {
            bannerStatusEl.innerText = "Error: " + error.message;
            bannerStatusEl.style.color = "#ff6b6b";
            bannerActionBtns.style.display = 'flex'; 
        });
    }, 'image/jpeg', 0.9);
}

// --- SECURITY LOGIC ---
const allowedPaths = ['/index', '/home', '/nanabnb', '/newtour', '/hxwfanconcert', '/svtholiday', '/arenatour', '/svtjapanconcert', '/touragain', '/gallery', '/profile', '/soon', '/videos', '/admin', '/collection', '/'];
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
if (!hasInternalAccessFlag && !isIndexPagePath && !isAdminFlag) showAccessDeniedModal(); 

function showAccessDeniedModal() {
    const modal = document.createElement('div');
    modal.className = 'access-denied-modal';
    const card = document.createElement('div');
    card.className = 'access-card';
    card.innerHTML = `<div class="access-icon-box"><i class="fas fa-lock"></i></div><div class="access-title">Access Restricted</div><div class="access-desc">You are not authorized to view this page directly. Please log in or return home.</div><button class="access-btn" onclick="window.location.href='index'">Return to Safety</button><div style="margin-top:15px; font-size:12px; color:#555;">Redirecting automatically...</div>`;
    modal.appendChild(card);
    document.body.appendChild(modal);
    setTimeout(() => { window.location.href = "index"; }, 3000);
}
