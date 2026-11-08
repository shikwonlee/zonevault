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
    {
      id: "2",
      title: "PROCESSING",
      url: "",
      subtitle: "",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "3",
      title: "[TO CARAT] HIPHOP TEAM",
      url: "https://stream.mux.com/501B1TjHHU6VyJwy5ifCYcjjRFNO02Y02nTae5iBPhsgHw.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794063184/TO_CARAT_HIPHOP_TEAM_bbuup9.vtt",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "4",
      title: "[TO CARAT] VOCAL TEAM",
      url: "https://stream.mux.com/9KDf9QH01c4x8xrdCX017l02HQD2r99m7TGZ7r9ADq6udQ.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794063192/TO_CARAT_VOCAL_TEAM_hed4mn.vtt",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "5",
      title: "[TO CARAT] PERFORMANCE TEAM",
      url: "https://stream.mux.com/rnmHkBLA00iagsBqoTkVIwwkrC7P1r8Ms9gCdQEj3UqA.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794118150/TO_CARAT_PERFORMANCE_TEAM_atluos.vtt",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "6",
      title: "[BE THE CARAT] SPECIAL STAGE MIX - 아주 NICE",
      url: "https://stream.mux.com/GWK02G5rJOAC9a7HeYsh4Ns9ctZViJcNNbAddR2YkvBE.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794118449/BE_THE_CARAT_SPECIAL_STAGE_MIX_-_%EC%95%84%EC%A3%BC_NICE_ibqira.vtt",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "7",
      title: "[BE THE CARAT] SPECIAL STAGE MIX - WORLD ",
      url: "https://stream.mux.com/eqFRJTgYWUeEyWIu005EeN6fPKp37HpbvXotHOhQQZEw.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794120695/BE_THE_CARAT_SPECIAL_STAGE_MIX_-_WORLD_wj1n3l.vtt",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "8",
      title: "[WITH CARAT] Snap Shoot Freestyle with CARAT",
      url: "https://stream.mux.com/dDq02Ogwjadk35PLGCEDOX1gfwIugL53742z6fZ86xWs.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794121222/WITH_CARAT_Snap_Shoot_Freestyle_with_CARAT_spmvgl.vtt",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "9",
      title: "[WITH CARAT] SEVENTEEN with CARAT",
      url: "https://stream.mux.com/5orKynERvmc3suzagRVVWxdhOdRr9S00o4UHnW6lFvPc.m3u8",
      subtitle: "https://res.cloudinary.com/sanuqblh/raw/upload/v1794122130/WITH_CARAT_SEVENTEEN_with_CARAT_yii8jt.vtt",
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
