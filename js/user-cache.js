// ========================================================
// Zone Vault — User Session Cache & Instant UI Hydration (js/user-cache.js)
// Solves loading delay, isolates accounts, and secures sessions
// ========================================================

const CACHE_KEY = "zone_vault_user_cache";

/**
 * Safely retrieves the cached user object from localStorage.
 */
export function getCachedUser() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Updates or sets the user cache in localStorage.
 * Handles new accounts cleanly: does NOT merge stale data from a previous
 * account if the UID is different.
 */
export function setCachedUser(data) {
  try {
    if (!data) {
      localStorage.removeItem(CACHE_KEY);
      return;
    }

    const current = getCachedUser();
    // Only inherit current cache if it belongs to the EXACT same user UID.
    // If it's a new or switched account, start with a clean slate to prevent
    // stale roles, admin rights, or banned statuses from leaking into new accounts.
    const isSameUser = current && current.uid && data.uid && current.uid === data.uid;
    const base = isSameUser ? current : {};

    const isAdm = Boolean(
      data.isAdmin === true ||
      (data.role && data.role.toLowerCase() === 'admin') ||
      (isSameUser && current.isAdmin === true && data.isAdmin !== false)
    );

    const updated = {
      ...base,
      ...data,
      isAdmin: isAdm,
      cachedAt: Date.now()
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(updated));

    // Synchronize permission flags
    if (isAdm) {
      localStorage.setItem("isAdmin", "true");
      sessionStorage.setItem("isAdmin", "true");
    } else {
      localStorage.removeItem("isAdmin");
      sessionStorage.removeItem("isAdmin");
    }

    const hasAccess = updated.status === "approved" || isAdm;
    if (hasAccess) {
      localStorage.setItem("internalAccess", "true");
      sessionStorage.setItem("internalAccess", "true");
    }

    if (updated.accessID) {
      localStorage.setItem("accessID", updated.accessID);
      sessionStorage.setItem("accessID", updated.accessID);
    }
  } catch (e) {
    console.warn("Failed to set cached user:", e);
  }
}

/**
 * Completely purges all cached user session data and security tokens.
 */
export function clearCachedUser() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem("internalAccess");
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("accessID");
    localStorage.removeItem("fromIndex");
    sessionStorage.removeItem("internalAccess");
    sessionStorage.removeItem("isAdmin");
    sessionStorage.removeItem("accessID");
    sessionStorage.removeItem("fromIndex");
  } catch (e) {}
}

/**
 * Live Security Watchdog: Automatically terminates session if status is revoked in DB.
 * Supports new accounts seamlessly: if cache is not yet warmed up or UID is pending,
 * it attaches as soon as Auth provides the user.
 */
let activeWatchdogUid = null;

export function initStatusSecurityWatchdog(auth, db, targetUid) {
  if (!auth || !db) return;

  try {
    const attachWatchdogListener = (uid) => {
      if (!uid) return;
      if (activeWatchdogUid === uid) return; // avoid duplicate listeners
      activeWatchdogUid = uid;

      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js")
        .then(({ ref, onValue }) => {
          import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js")
            .then(({ signOut }) => {
              const userStatusRef = ref(db, `users/${uid}/status`);
              onValue(userStatusRef, (snap) => {
                if (snap.exists()) {
                  const status = snap.val();
                  if (status === "denied" || status === "revoked" || status === "suspended") {
                    console.warn("⚠️ Account access has been revoked by administration. Terminating session...");
                    clearCachedUser();
                    signOut(auth).then(() => {
                      sessionStorage.setItem("revocationNotice", "true");
                      window.location.replace("login");
                    }).catch(() => {
                      window.location.replace("login");
                    });
                  } else if (status === "approved") {
                    // Automatically update cache if it wasn't marked approved yet
                    const cached = getCachedUser();
                    if (cached && cached.uid === uid && cached.status !== "approved") {
                      setCachedUser({ ...cached, status: "approved" });
                    }
                  }
                }
              });
            })
            .catch(() => {});
        })
        .catch(() => {});
    };

    // 1. If explicit UID provided
    if (targetUid) {
      attachWatchdogListener(targetUid);
      return;
    }

    // 2. If Auth user is already resolved
    if (auth.currentUser && auth.currentUser.uid) {
      attachWatchdogListener(auth.currentUser.uid);
      return;
    }

    // 3. If cached user UID is available
    const cached = getCachedUser();
    if (cached && cached.uid) {
      attachWatchdogListener(cached.uid);
      return;
    }

    // 4. Fallback for new accounts: wait for Auth state to resolve then attach
    if (typeof auth.onAuthStateChanged === "function") {
      const unsub = auth.onAuthStateChanged((user) => {
        if (user && user.uid) {
          attachWatchdogListener(user.uid);
          if (typeof unsub === "function") unsub();
        }
      });
    }
  } catch (e) {
    console.warn("Security watchdog init error:", e);
  }
}

/**
 * Immediately restores UI elements across all pages (Home, Videos, Profile, Collection).
 * Handles new accounts without profiles or custom pictures gracefully with proper defaults.
 */
export function applyCachedUserToUI() {
  const user = getCachedUser();
  if (!user) return;

  const fallbackPic = "https://via.placeholder.com/150";
  const displayName = user.name || (user.email ? user.email.split('@')[0] : "Vault Member");
  const displayPic = user.profilePicture || fallbackPic;

  const nameEl = document.getElementById("sidebar-name");
  const emailEl = document.getElementById("sidebar-email");
  const picEl = document.getElementById("sidebar-pic");

  const mobileNameEl = document.getElementById("mobile-sidebar-name");
  const mobileEmailEl = document.getElementById("mobile-sidebar-email");
  const mobilePicEl = document.getElementById("mobile-sidebar-pic");

  const statusPc = document.getElementById("status-text-pc");
  const statusMobile = document.getElementById("status-text-mobile");

  if (nameEl) nameEl.innerText = displayName;
  if (emailEl && user.email) emailEl.innerText = user.email;
  if (picEl) {
    picEl.src = displayPic;
    picEl.onerror = () => { picEl.src = fallbackPic; };
  }

  // Hydrate classic top header
  const topPic = document.getElementById("top-header-pic");
  const topName = document.getElementById("top-header-name");
  if (topPic) {
    topPic.src = displayPic;
    topPic.onerror = () => { topPic.src = fallbackPic; };
  }
  if (topName) topName.innerText = displayName;

  if (mobileNameEl) mobileNameEl.innerText = displayName;
  if (mobileEmailEl && user.email) mobileEmailEl.innerText = user.email;
  if (mobilePicEl) {
    mobilePicEl.src = displayPic;
    mobilePicEl.onerror = () => { mobilePicEl.src = fallbackPic; };
  }

  const isAdm = user.role === 'admin' || user.isAdmin === true;
  let statusTxt = isAdm ? "ADMIN ACCESS" : "MEMBER ACCESS";
  if (user.status === "pending") statusTxt = "PENDING APPROVAL";
  else if (user.status === "denied" || user.status === "revoked") statusTxt = "ACCESS RESTRICTED";

  if (statusPc) statusPc.innerText = statusTxt;
  if (statusMobile) statusMobile.innerText = statusTxt;
}

/**
 * Prefetch destination pages on hover/touch for instant page transitions.
 */
export function initPagePrefetch() {
  if (typeof document === 'undefined') return;
  const prefetched = new Set();
  const prefetchUrl = (url) => {
    if (!url || prefetched.has(url)) return;
    prefetched.add(url);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
  };

  const navLinks = document.querySelectorAll('a[href="home"], a[href="videos"], a[href="collection"], a[href="profile"]');
  navLinks.forEach(link => {
    link.addEventListener('mouseenter', () => prefetchUrl(link.getAttribute('href')), { passive: true });
    link.addEventListener('touchstart', () => prefetchUrl(link.getAttribute('href')), { passive: true });
  });
}

// ========================================================
// Automatic Early Initialization
// ========================================================

// 1. Immediately rehydrate sessionStorage from valid cached user so protected routes
// never falsely bounce new tabs or newly reloaded pages.
if (typeof window !== 'undefined') {
  try {
    const cached = getCachedUser();
    if (cached && (cached.status === "approved" || cached.isAdmin)) {
      sessionStorage.setItem("internalAccess", "true");
      if (cached.isAdmin) {
        sessionStorage.setItem("isAdmin", "true");
      }
      if (cached.accessID) {
        sessionStorage.setItem("accessID", cached.accessID);
      }
    }
  } catch (e) {}
}

// 2. Automatically apply to UI as soon as DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyCachedUserToUI();
      initPagePrefetch();
    });
  } else {
    applyCachedUserToUI();
    initPagePrefetch();
  }
}
