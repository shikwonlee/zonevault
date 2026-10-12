// ========================================================
// Zone Vault — Central Firebase Initializer
// Hides configuration & initialization away from page scripts
// ========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const DEFAULT_CONFIG = {
  apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
  authDomain: "tvnstream-b4497.firebaseapp.com",
  databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
  projectId: "tvnstream-b4497",
  storageBucket: "tvnstream-b4497.appspot.com",
  messagingSenderId: "308384754214",
  appId: "1:308384754214:web:2938e76cd29b288f75d4e7",
  measurementId: "G-VFNH70R4D9"
};

let resolvedConfig = DEFAULT_CONFIG;

// Attempt to read from session storage first for 0ms startup
try {
  const cached = sessionStorage.getItem('__zv_cfg');
  if (cached) {
    resolvedConfig = JSON.parse(cached);
  } else if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    // Non-blocking background fetch from server configuration endpoint
    fetch('/api/firebase-config')
      .then(res => res.ok ? res.json() : null)
      .then(cfg => {
        if (cfg && cfg.apiKey) {
          sessionStorage.setItem('__zv_cfg', JSON.stringify(cfg));
        }
      })
      .catch(() => {});
  }
} catch (e) {
  // Silent fallback
}

export const app = initializeApp(resolvedConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const firebaseConfig = resolvedConfig;
