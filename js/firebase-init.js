// ==========================================
// ZONE VAULT — Central Firebase & User Cache Layer
// ==========================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Safe Base64 fallback config to guarantee 100% uninterrupted offline/static operation
const DEFAULT_CONFIG_ENCODED = "eyphcGlLZXkiOiJBSXphU3lBczJTNmlSaG5ZaG1xTnVGMFFDQ1l1NU51enhIeElSdjAiLCJhdXRoRG9tYWluIjoidHZuc3RyZWFtLWI0NDk3LmZpcmViYXNlYXBwLmNvbSIsImRhdGFiYXNlVVJMIjoiaHR0cHM6Ly90dm5zdHJlYW0tYjQ0OTctZGVmYXVsdC1ydGRiLmZpcmViYXNlaW8uY29tIiwicHJvamVjdElkIjoidHZuc3RyZWFtLWI0NDk3Iiwic3RvcmFnZUJ1Y2tldCI6InR2bnN0cmVhbS1iNDQ5Ny5hcHBzcG90LmNvbSIsIm1lc3NhZ2luZ1NlbmRlcklkIjoiMzA4Mzg0NzU0MjE0IiwiYXBwSWQiOiIxOjMwODM4NDc1NDIxNDp3ZWI6MjkzOGU3NmNkMjliMjg4Zjc1ZDRlNyIsIm1lYXN1cmVtZW50SWQiOiJHLVZGTEg3MFI0RDkifQ==";

function getFallbackConfig() {
  try {
    return JSON.parse(atob(DEFAULT_CONFIG_ENCODED));
  } catch (e) {
    return {
      apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
      authDomain: "tvnstream-b4497.firebaseapp.com",
      databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
      projectId: "tvnstream-b4497",
      storageBucket: "tvnstream-b4497.appspot.com",
      messagingSenderId: "308384754214",
      appId: "1:308384754214:web:2938e76cd29b288f75d4e7",
      measurementId: "G-VFNH70R4D9"
    };
  }
}

// Fetch configuration from backend server, or fall back seamlessly
let activeConfig = getFallbackConfig();
try {
  const response = await fetch('/api/firebase-config', { cache: 'no-store' });
  if (response.ok) {
    const remoteConfig = await response.json();
    if (remoteConfig && remoteConfig.apiKey) {
      activeConfig = remoteConfig;
    }
  }
} catch (err) {
  // Graceful fallback to embedded config
}

const app = getApps().length > 0 ? getApps()[0] : initializeApp(activeConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn("Auth persistence notice:", err);
});

// ==========================================
// FAST USER CACHE ENGINE
// Eliminates the 2-5 second delay between page switches (Home <-> Videos)
// ==========================================
const USER_CACHE_KEY = 'zv_user_cache';

export function getCachedUser() {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY) || localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    return null;
  }
}

export function getOrCreateUrlToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    let token = params.get('token') || sessionStorage.getItem('urlToken') || localStorage.getItem('urlToken');
    if (!token) {
      token = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
    }
    sessionStorage.setItem('urlToken', token);
    localStorage.setItem('urlToken', token);
    return token;
  } catch (e) {
    return Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
  }
}

export function normalizeUserRole(role) {
  const r = String(role || 'member').toLowerCase().trim();
  return r === 'admin' ? 'admin' : 'member';
}

export function buildAuthenticatedUrl(basePath, uid, role, status) {
  if (!uid) return basePath;
  const token = getOrCreateUrlToken();
  const cleanRole = normalizeUserRole(role);
  const rawStatus = String(status || 'approved').toLowerCase().trim();
  const cleanStatus = (!rawStatus || rawStatus === 'none') ? 'approved' : rawStatus;
  const cleanPath = String(basePath || '').split('?')[0];
  return `${cleanPath}?uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}&role=${encodeURIComponent(cleanRole)}&status=${encodeURIComponent(cleanStatus)}`;
}

export function buildVideoNavigationUrl(basePath, accessType, videoTitle, uid, role, status) {
  const cached = getCachedUser();
  const params = new URLSearchParams(window.location.search);
  const resolvedUid = uid || (cached && cached.uid) || params.get('uid') || '';
  const token = getOrCreateUrlToken();
  const cleanRole = normalizeUserRole(role || (cached && cached.role) || params.get('role') || 'member');
  const rawStatus = String(status || (cached && cached.status) || params.get('status') || 'approved').toLowerCase().trim();
  const cleanStatus = (!rawStatus || rawStatus === 'none') ? 'approved' : rawStatus;
  const cleanAccess = accessType === 'member_access' ? 'member_access' : 'free_access';
  const cleanTitle = String(videoTitle || '').trim().replace(/\s+/g, '-');
  const cleanPath = String(basePath || '').split('?')[0];

  const parts = [];
  if (resolvedUid) parts.push(`uid=${encodeURIComponent(resolvedUid)}`);
  if (token) parts.push(`token=${encodeURIComponent(token)}`);
  parts.push(`role=${encodeURIComponent(cleanRole)}`);
  parts.push(`status=${encodeURIComponent(cleanStatus)}`);
  parts.push(`access=${encodeURIComponent(cleanAccess)}`);
  if (cleanTitle) parts.push(`title=${encodeURIComponent(cleanTitle)}`);
  return `${cleanPath}?${parts.join('&')}`;
}

export function updateDynamicURL(uid, role, status) {
  if (!uid) return;
  const token = getOrCreateUrlToken();
  const cleanRole = normalizeUserRole(role);
  const rawStatus = String(status || 'approved').toLowerCase().trim();
  const cleanStatus = (!rawStatus || rawStatus === 'none') ? 'approved' : rawStatus;
  const queryStr = `?uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}&role=${encodeURIComponent(cleanRole)}&status=${encodeURIComponent(cleanStatus)}`;
  const newUrl = `${window.location.pathname}${queryStr}`;
  window.history.replaceState({ path: newUrl }, '', newUrl);

  const targetPages = ['home', 'videos', 'collection', 'profile', 'home.html', 'videos.html', 'collection.html', 'profile.html'];
  document.querySelectorAll('a[href]').forEach(a => {
    const rawHref = a.getAttribute('href');
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('#') || rawHref.startsWith('http')) return;
    const baseHref = rawHref.split('?')[0];
    const cleanName = baseHref.replace(/^\//, '').toLowerCase();
    if (targetPages.includes(cleanName)) {
      a.setAttribute('href', `${baseHref}${queryStr}`);
    }
  });

  document.querySelectorAll('.sidebar-user').forEach(el => {
    el.onclick = () => {
      window.location.href = `profile${queryStr}`;
    };
  });
}

export function setCachedUser(data) {
  try {
    if (!data) return;
    const current = getCachedUser() || {};
    const updated = { ...current, ...data, cachedAt: Date.now() };
    if (updated.role) {
      updated.role = normalizeUserRole(updated.role);
    }
    const serialized = JSON.stringify(updated);
    sessionStorage.setItem(USER_CACHE_KEY, serialized);
    localStorage.setItem(USER_CACHE_KEY, serialized);
    if (updated.status === 'approved') {
      localStorage.setItem("internalAccess", "true");
      sessionStorage.setItem("internalAccess", "true");
    }
  } catch (e) {
    console.error("Failed to save user cache:", e);
  }
}

export function clearCachedUser() {
  try {
    sessionStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(USER_CACHE_KEY);
    sessionStorage.removeItem('internalAccess');
    sessionStorage.removeItem('isAdmin');
    sessionStorage.removeItem('urlToken');
    localStorage.removeItem('internalAccess');
    localStorage.removeItem('urlToken');
  } catch (e) {
    // Ignore
  }
}

// Auto-cleanup stale service workers and obsolete caches
export function cleanStaleCaches() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {});
      }
    });
  }
}

export function hydrateDynamicUrlFromCacheOrQuery() {
  try {
    const cached = getCachedUser();
    const params = new URLSearchParams(window.location.search);
    const uid = (cached && cached.uid) || params.get('uid');
    if (!uid) return;
    const role = (cached && cached.role) || params.get('role') || 'member';
    const status = (cached && cached.status) || params.get('status') || 'approved';
    updateDynamicURL(uid, role, status);
  } catch (_) {}
}

// Run cleanup proactively
cleanStaleCaches();

export { app, auth, db, provider, activeConfig };
