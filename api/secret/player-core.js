// ========================================================
// Zone Vault — Universal Player Core Gateway (/api/secret/player-core.js)
// Automatically delegates to Free Access Engine or Restricted Engine
// based on pageId presence, guaranteeing complete isolation and admin sync.
// ========================================================

(function(window) {
  'use strict';

  // 1. Google Analytics / GTag
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-1B2RJ659GL');

  // 2. Theme Engine Sync
  function applyTheme(theme) {
    const isLight = (theme === 'light' || theme === '#ffffff' || theme === 'white');
    if (isLight) {
      document.documentElement.classList.add('light-mode');
      if (document.body) document.body.classList.add('light-mode');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#f8f9fa');
    } else {
      document.documentElement.classList.remove('light-mode');
      if (document.body) document.body.classList.remove('light-mode');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#0a0a0c');
    }
  }

  const savedTheme = localStorage.getItem('zoneTheme') || localStorage.getItem('zoneVaultTheme');
  if (savedTheme) { 
    applyTheme(savedTheme); 
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) { 
    applyTheme('light'); 
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'zoneTheme' || e.key === 'zoneVaultTheme') { applyTheme(e.newValue); }
  });

  // 3. Central Firebase Compat Initializer
  let authInstance = null;
  let dbInstance = null;

  function ensureFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase Compat SDK not loaded yet.');
      return { auth: null, db: null };
    }
    if (!firebase.apps.length) {
      const cfg = {
        apiKey: "AIzaSyAs2S6iRhnYhmqNuF0QCCYu5NuzxHxIRv0",
        authDomain: "tvnstream-b4497.firebaseapp.com",
        databaseURL: "https://tvnstream-b4497-default-rtdb.firebaseio.com",
        projectId: "tvnstream-b4497",
        storageBucket: "tvnstream-b4497.appspot.com",
        messagingSenderId: "308384754214",
        appId: "1:308384754214:web:2938e76cd29b288f75d4e7"
      };
      firebase.initializeApp(cfg);
    }
    if (!authInstance) authInstance = firebase.auth();
    if (!dbInstance) dbInstance = firebase.database();
    return { auth: authInstance, db: dbInstance };
  }

  // 4. Global Delegation Gateway
  window.ZonePlayer = {
    activeEngine: null,
    init: function(userConfig) {
      const rawPageId = (userConfig && userConfig.pageId && typeof userConfig.pageId === 'string') ? userConfig.pageId.trim() : '';
      const isRestricted = Boolean(rawPageId !== '');

      if (!isRestricted) {
        // FREE ACCESS: Use ZonePlayerFree engine
        if (window.ZonePlayerFree && typeof window.ZonePlayerFree.init === 'function') {
          this.activeEngine = window.ZonePlayerFree;
          window.ZonePlayerFree.init(userConfig);
        } else {
          console.warn("ZonePlayerFree not loaded, loading dynamically...");
          const script = document.createElement('script');
          script.src = '/api/secret/player-free.js';
          script.onload = () => {
            this.activeEngine = window.ZonePlayerFree;
            if (window.ZonePlayerFree) window.ZonePlayerFree.init(userConfig);
          };
          document.head.appendChild(script);
        }
      } else {
        // RESTRICTED ACCESS: Use ZonePlayerRestricted engine connected to Admin
        if (window.ZonePlayerRestricted && typeof window.ZonePlayerRestricted.init === 'function') {
          this.activeEngine = window.ZonePlayerRestricted;
          window.ZonePlayerRestricted.init(userConfig);
        } else {
          console.warn("ZonePlayerRestricted not loaded, loading dynamically...");
          const script = document.createElement('script');
          script.src = '/api/secret/player-restricted.js';
          script.onload = () => {
            this.activeEngine = window.ZonePlayerRestricted;
            if (window.ZonePlayerRestricted) window.ZonePlayerRestricted.init(userConfig);
          };
          document.head.appendChild(script);
        }
      }
    },

    loadAndPlayEpisode: function(epId, updateUrl) {
      if (this.activeEngine && typeof this.activeEngine.loadAndPlayEpisode === 'function') {
        this.activeEngine.loadAndPlayEpisode(epId, updateUrl);
      } else if (window.ZonePlayerFree && typeof window.ZonePlayerFree.loadAndPlayEpisode === 'function') {
        window.ZonePlayerFree.loadAndPlayEpisode(epId, updateUrl);
      } else if (window.ZonePlayerRestricted && typeof window.ZonePlayerRestricted.loadAndPlayEpisode === 'function') {
        window.ZonePlayerRestricted.loadAndPlayEpisode(epId, updateUrl);
      }
    }
  };

})(window);
