// ========================================================
// Zone Vault — User Session Cache & Instant UI Hydration
// Solves 2-5s loading delay when switching between pages
// ========================================================

const CACHE_KEY = "zone_vault_user_cache";

export function getCachedUser() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setCachedUser(data) {
  try {
    if (!data) {
      localStorage.removeItem(CACHE_KEY);
      return;
    }
    const current = getCachedUser() || {};
    const updated = {
      ...current,
      ...data,
      cachedAt: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
    localStorage.setItem("internalAccess", "true");
    if (updated.isAdmin) {
      localStorage.setItem("isAdmin", "true");
      sessionStorage.setItem("isAdmin", "true");
    }
    sessionStorage.setItem("internalAccess", "true");
  } catch (e) {}
}

export function clearCachedUser() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem("internalAccess");
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("accessID");
    localStorage.removeItem("fromIndex");
    sessionStorage.removeItem("internalAccess");
    sessionStorage.removeItem("isAdmin");
  } catch (e) {}
}

// Immediately restores UI elements across all pages (Home, Videos, Profile, Collection)
export function applyCachedUserToUI() {
  const user = getCachedUser();
  if (!user) return;

  const nameEl = document.getElementById("sidebar-name");
  const emailEl = document.getElementById("sidebar-email");
  const picEl = document.getElementById("sidebar-pic");

  const mobileNameEl = document.getElementById("mobile-sidebar-name");
  const mobileEmailEl = document.getElementById("mobile-sidebar-email");
  const mobilePicEl = document.getElementById("mobile-sidebar-pic");

  const statusPc = document.getElementById("status-text-pc");
  const statusMobile = document.getElementById("status-text-mobile");

  if (nameEl && user.name) {
    nameEl.innerText = user.name;
  }
  if (emailEl && user.email) {
    emailEl.innerText = user.email;
  }
  if (picEl && user.profilePicture && !picEl.src.includes(user.profilePicture)) {
    picEl.src = user.profilePicture;
    picEl.onerror = () => { picEl.src = "https://via.placeholder.com/150"; };
  }

  // Hydrate classic top header
  const topPic = document.getElementById("top-header-pic");
  const topName = document.getElementById("top-header-name");
  if (topPic && user.profilePicture) {
    topPic.src = user.profilePicture;
    topPic.onerror = () => { topPic.src = "https://via.placeholder.com/150"; };
  }
  if (topName && user.name) {
    topName.innerText = user.name;
  }

  if (mobileNameEl && user.name) mobileNameEl.innerText = user.name;
  if (mobileEmailEl && user.email) mobileEmailEl.innerText = user.email;
  if (mobilePicEl && user.profilePicture) mobilePicEl.src = user.profilePicture;

  const isAdm = user.role === 'admin' || user.isAdmin === true;
  const statusTxt = isAdm ? "ADMIN ACCESS" : "MEMBER ACCESS";
  if (statusPc) statusPc.innerText = statusTxt;
  if (statusMobile) statusMobile.innerText = statusTxt;
}

// Prefetch destination pages on hover/touch for instant page transitions
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

// Automatically apply as soon as DOM is ready or immediately if already loaded
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
