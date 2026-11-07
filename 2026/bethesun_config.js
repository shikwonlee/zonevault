/**
 * ============================================================================
 * ZONE VAULT — Protected Media Configuration for SEVENTEEN <BE THE SUN>
 * Location: /2026/bethesun_config.js
 * Connected to: /2025/bethesun.html
 *
 * SECURITY NOTE:
 * Direct browser access (typing this URL in the address bar, Save-As, curl, or
 * external sites) is strictly blocked by server.js and _worker.js (403 Denied).
 * Only /2025/bethesun.html can load this file.
 *
 * HOW TO EDIT CARDS 4 TO 9:
 * Simply paste the title, m3u8 stream url, and vtt subtitle link inside the
 * quotes "" for cards 4 through 9 below.
 * ============================================================================
 */

(function () {
  'use strict';

  const BETHESUN_THUMBNAIL = "https://res.cloudinary.com/sanuqblh/image/upload/v1793851172/03e68a354749c45a891071b13f659608_yj7ysf.png";

  const BETHESUN_VIDEOS = [
    // --- VIDEO CARD 1 ---
    {
      id: "1",
      title: "[FULL STAGE] TOUR-ING : SEVENTEEN <BE THE SUN>",
      url: "https://stream.mux.com/N5jIesqE00ERZqNKQYdnHMtS01PvGBfPDf7kZOGnLewsE.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794063181/bethesun_gycm3q.vtt",
      image: BETHESUN_THUMBNAIL
    },

    // --- VIDEO CARD 2 ---
    {
      id: "2",
      title: "[TO CARAT] HIPHOP TEAM",
      url: "https://stream.mux.com/501B1TjHHU6VyJwy5ifCYcjjRFNO02Y02nTae5iBPhsgHw.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794063184/TO_CARAT_HIPHOP_TEAM_bbuup9.vtt",
      image: BETHESUN_THUMBNAIL
    },

    // --- VIDEO CARD 3 ---
    {
      id: "3",
      title: "[TO CARAT] VOCAL TEAM",
      url: "https://stream.mux.com/9KDf9QH01c4x8xrdCX017l02HQD2r99m7TGZ7r9ADq6udQ.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794063192/TO_CARAT_VOCAL_TEAM_hed4mn.vtt",
      image: BETHESUN_THUMBNAIL
    },

    // --- VIDEO CARD 4 (Ilagay mo dito yung title, url, at subtitle) ---
    {
      id: "4",
      title: "[TO CARAT] PERFORMANCE TEAM",
      url: "https://stream.mux.com/2i3UUD01LyEJphXYFgkuMWV2MahInaPE0201GZ0000a400zuE.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794064632/TO_CARAT_PERFORMANCE_TEAM_awxlpd.vtt",
      image: BETHESUN_THUMBNAIL
    },

    // --- VIDEO CARD 5 (Ilagay mo dito yung title, url, at subtitle) ---
    {
      id: "5",
      title: "",
      url: "",
      subtitle: "",
      image: BETHESUN_THUMBNAIL
    },

    // --- VIDEO CARD 6 (Ilagay mo dito yung title, url, at subtitle) ---
    {
      id: "6",
      title: "",
      url: "",
      subtitle: "",
      image: BETHESUN_THUMBNAIL
    },

    // --- VIDEO CARD 7 (Ilagay mo dito yung title, url, at subtitle) ---
    {
      id: "7",
      title: "",
      url: "",
      subtitle: "",
      image: BETHESUN_THUMBNAIL
    },

    // --- VIDEO CARD 8 (Ilagay mo dito yung title, url, at subtitle) ---
    {
      id: "8",
      title: "",
      url: "",
      subtitle: "",
      image: BETHESUN_THUMBNAIL
    },

    // --- VIDEO CARD 9 (Ilagay mo dito yung title, url, at subtitle) ---
    {
      id: "9",
      title: "",
      url: "",
      subtitle: "",
      image: BETHESUN_THUMBNAIL
    }
  ];

  // Store inside a non-enumerable vault accessor so external scripts cannot easily dump it
  Object.defineProperty(window, '__ZV_BETHESUN_VAULT__', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: {
      thumbnail: BETHESUN_THUMBNAIL,
      getPlaylistMeta: function () {
        return BETHESUN_VIDEOS.map(function (item, idx) {
          return {
            id: String(item.id || (idx + 1)),
            title: item.title || "",
            image: item.image || BETHESUN_THUMBNAIL,
            introEnd: item.introEnd || 0
          };
        });
      },
      getMediaById: function (epId) {
        const found = BETHESUN_VIDEOS.find(function (item) {
          return String(item.id) === String(epId);
        });
        if (!found) return null;
        const decrypt = (window.ZoneVaultStream && typeof window.ZoneVaultStream.decryptPayload === 'function')
          ? function (v) { return window.ZoneVaultStream.decryptPayload(v); }
          : function (v) { return v; };
        return {
          id: String(found.id),
          title: found.title || "",
          url: decrypt(found.url || ""),
          subtitle: decrypt(found.subtitle || ""),
          image: found.image || BETHESUN_THUMBNAIL,
          introEnd: found.introEnd || 0
        };
      }
    }
  });

  // Self-remove script tag from DOM after loading
  try {
    if (document.currentScript && document.currentScript.parentNode) {
      document.currentScript.parentNode.removeChild(document.currentScript);
    }
  } catch (_) {}
})();
