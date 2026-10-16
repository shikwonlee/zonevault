// ==========================================
// ZONE VAULT — Landing Page Controller (js/index.js)
// ==========================================
import { auth, db, getCachedUser, setCachedUser, cleanStaleCaches } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

cleanStaleCaches();

const currentPath = window.location.pathname.toLowerCase();
const loadingScreen = document.getElementById("auth-loading-screen");
const mainContent = document.getElementById("main-app-content");

/**
 * Safely hides the loader and displays the landing page to guest visitors
 */
function revealLandingPage() {
  if (loadingScreen) {
    loadingScreen.style.opacity = "0";
    loadingScreen.style.visibility = "hidden";
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 400);
  }
  if (mainContent) {
    mainContent.style.visibility = "visible";
    mainContent.style.opacity = "1";
  }
}

// --- 1. INSTANT CACHE CHECK (0ms Instant Redirect) ---
const cached = getCachedUser();
if (cached && cached.status === "approved" && cached.uid) {
  const accessID = cached.accessID || cached.uid;
  if (!currentPath.includes("home")) {
    window.location.replace(`home?access=${accessID}`);
  }
}

// --- 2. FIREBASE AUTH CHECK ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userRef = ref(db, "users/" + user.uid);
      const userSnap = await get(userRef);

      if (userSnap.exists()) {
        const data = userSnap.val();
        const userStatus = data.status || "approved";
        const userAccessID = data.accessID || user.uid;

        setCachedUser({
          uid: user.uid,
          email: user.email,
          name: data.name || data.telegramUsername || "Vault Member",
          profilePicture: data.profilePicture || "https://via.placeholder.com/150",
          role: (data.role || "member").toLowerCase(),
          status: userStatus,
          accessID: userAccessID,
          favorites: data.favorites || []
        });

        if (userStatus === "approved") {
          if (!currentPath.includes("home")) {
            window.location.replace(`home?access=${userAccessID}`);
          }
        } else {
          if (!currentPath.includes("login")) {
            window.location.replace("login");
          } else {
            revealLandingPage();
          }
        }
      } else {
        await set(userRef, {
          status: "approved",
          accessID: user.uid,
          email: user.email || "No Email"
        });

        setCachedUser({
          uid: user.uid,
          email: user.email,
          status: "approved",
          accessID: user.uid
        });

        if (!currentPath.includes("home")) {
          window.location.replace(`home?access=${user.uid}`);
        }
      }
    } catch (error) {
      console.error("Database check failed:", error);
      if (!currentPath.includes("login")) {
        window.location.replace("login");
      } else {
        revealLandingPage();
      }
    }
  } else {
    // Visitor has no active session — smooth transition to landing page UI
    revealLandingPage();
  }
});

// --- 3. PARTICLES GENERATOR ---
function initParticles() {
  const container = document.getElementById("particle-container");
  if (!container) return;
  const particleCount = 40;
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

// --- 4. HEADER SCROLL EFFECT ---
function initHeaderScroll() {
  const header = document.getElementById('navbar');
  if (!header) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });
}

// --- 5. MODAL HANDLERS ---
window.closeModal = function () {
  const modal = document.getElementById("welcomeModal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "auto";
  localStorage.setItem('welcomeModalShown', 'true');
};

window.openModal = function () {
  const modal = document.getElementById("welcomeModal");
  if (modal) modal.style.display = "flex";
  document.body.style.overflow = "hidden";
};

window.closeAbout = function () {
  const about = document.getElementById("aboutModal");
  if (about) about.style.display = "none";
  document.body.style.overflow = "auto";
};

window.openAbout = function () {
  const about = document.getElementById("aboutModal");
  if (about) about.style.display = "flex";
  document.body.style.overflow = "hidden";
};

window.closeAppNotification = function () {
  const notification = document.getElementById("appNotification");
  if (notification) {
    notification.classList.remove("show");
  }
};

window.addEventListener('click', (event) => {
  if (event.target && event.target.classList && event.target.classList.contains('modal-overlay')) {
    event.target.style.display = "none";
    document.body.style.overflow = "auto";
  }
});

// App download notification trigger
setTimeout(() => {
  const appNotif = document.getElementById('appNotification');
  if (appNotif) {
    appNotif.classList.add('show');
  }
}, 2500);

// Initialize visual effects
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initHeaderScroll();
  });
} else {
  initParticles();
  initHeaderScroll();
}
