// ========================================================
// Zone Vault — Index Logic (js/index.js)
// Modular: Auth check, UI interaction, particles, and modals
// ========================================================
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { auth, db } from "./firebase-init.js";
import { getCachedUser, setCachedUser } from "./user-cache.js";

console.log("✅ Index.js loaded: Clean, Modular, and Secure");

// Initialize Google Tag Manager
(function() {
  if (typeof window !== 'undefined' && !window.dataLayer) {
    const s = document.createElement('script');
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=G-1B2RJ659GL";
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-1B2RJ659GL');
  }
})();

// ==========================================
// 1. SERVICE WORKER PURGE (Kills stale cache)
// ==========================================
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const reg of registrations) {
      reg.unregister();
    }
  }).catch(() => {});
  if ('caches' in window) {
    caches.keys().then(names => {
      for (const name of names) caches.delete(name);
    }).catch(() => {});
  }
}

// ==========================================
// 2. UI HELPERS: PARTICLES & ANIMATIONS
// ==========================================
function initParticles() {
  const container = document.getElementById("particle-container");
  if (!container) return;
  const particleCount = 45;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    particle.classList.add("particle");
    const size = Math.random() * 3 + 1;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 100}%`;
    particle.style.animationDuration = `${40 + Math.random() * 40}s`;
    particle.style.animationDelay = `${Math.random() * 20}s`;
    container.appendChild(particle);
  }
}

function initHeaderScroll() {
  window.addEventListener('scroll', () => {
    const header = document.getElementById('navbar');
    if (!header) return;
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });
}

// ==========================================
// 3. MODALS & POPUPS
// ==========================================
export function closeModal() {
  const modal = document.getElementById("welcomeModal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "auto";
  localStorage.setItem('welcomeModalShown', 'true');
}

export function openModal() {
  const modal = document.getElementById("welcomeModal");
  if (modal) modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

export function closeAbout() {
  const modal = document.getElementById("aboutModal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "auto";
}

export function openAbout() {
  const modal = document.getElementById("aboutModal");
  if (modal) modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

export function closeAppNotification() {
  const notification = document.getElementById("appNotification");
  if (notification) notification.classList.remove("show");
}

// Attach to window so existing inline onclick handlers in HTML continue working seamlessly
window.closeModal = closeModal;
window.openModal = openModal;
window.closeAbout = closeAbout;
window.openAbout = openAbout;
window.closeAppNotification = closeAppNotification;

window.addEventListener('click', (event) => {
  if (event.target && event.target.classList && event.target.classList.contains('modal-overlay')) {
    event.target.style.display = "none";
    document.body.style.overflow = "auto";
  }
});

// App Download Toast Delay
setTimeout(() => {
  const appNotif = document.getElementById('appNotification');
  if (appNotif) appNotif.classList.add('show');
}, 2500);

// Initialize UI
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initHeaderScroll();
  });
} else {
  initParticles();
  initHeaderScroll();
}

// ==========================================
// 4. FIREBASE AUTO-LOGIN CHECK WITH USER CACHE
// ==========================================
const currentPath = window.location.pathname.toLowerCase();

// Instant cache check for faster response
const cachedUser = getCachedUser();
if (cachedUser && cachedUser.status === "approved" && cachedUser.uid) {
  const accessID = cachedUser.accessID || cachedUser.uid;
  if (!currentPath.includes("home")) {
    window.location.replace(`home?access=${accessID}`);
  }
}

function revealContent() {
  const authLoader = document.getElementById("auth-loader");
  const mainContent = document.getElementById("main-app-content");

  if (authLoader) {
    authLoader.style.opacity = "0";
    setTimeout(() => {
      authLoader.style.display = "none";
    }, 400);
  }

  if (mainContent) {
    mainContent.style.visibility = "visible";
    mainContent.style.opacity = "1";
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userRef = ref(db, "users/" + user.uid);
      const userSnap = await get(userRef);

      if (userSnap.exists()) {
        const data = userSnap.val();
        const userStatus = data.status || "approved";
        const userAccessID = data.accessID || user.uid;

        // Update local session cache
        setCachedUser({
          uid: user.uid,
          email: user.email || data.email || "",
          name: data.name || data.telegramUsername || "Vault Member",
          profilePicture: data.profilePicture || "https://via.placeholder.com/150",
          status: userStatus,
          role: data.role || "member",
          accessID: userAccessID,
          isAdmin: (data.role || "").toLowerCase() === 'admin'
        });

        if (userStatus === "approved") {
          if (!currentPath.includes("home")) {
            window.location.replace(`home?access=${userAccessID}`);
          }
        } else {
          if (!currentPath.includes("login")) window.location.replace("login");
        }
      } else {
        // Auto-fix for old accounts
        await set(userRef, {
          status: "approved",
          accessID: user.uid,
          email: user.email || "No Email"
        });

        setCachedUser({
          uid: user.uid,
          email: user.email || "",
          name: "Vault Member",
          status: "approved",
          accessID: user.uid
        });

        if (!currentPath.includes("home")) {
          window.location.replace(`home?access=${user.uid}`);
        }
      }
    } catch (error) {
      console.error("Database check failed:", error);
      revealContent();
    }
  } else {
    console.log("🛑 No active user session. Showing landing page.");
    revealContent();
  }
});
