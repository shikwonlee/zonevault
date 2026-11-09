/**
 * ============================================================================
 * ZONE VAULT — Protected Media Configuration for NANA TOUR
 * Location: /2026/nanatour_config.js
 *
 * HOW COMBINED 2-HOUR VIDEO + SEPARATE SUBTITLE FILES WORK:
 * 1. If 5 episode parts (e.g. EP 1-1 to EP 1-5) are combined into a single 2-hour
 *    .m3u8 video, paste that SAME .m3u8 link in `url` for all 5 cards.
 * 2. Paste each part's separate .vtt file in `subtitle` for each card.
 * 3. Set `startTime` and `endTime` in "HH:MM:SS" format on each part:
 *    - Part 1 (e.g. Card 2): startTime: "00:00:00", endTime: "00:24:15"
 *    - Part 2 (e.g. Card 3): startTime: "00:24:15", endTime: "00:48:30"
 *    - Part 3 (e.g. Card 4): startTime: "00:48:30", endTime: "01:12:45"
 *    - ...and so on!
 * 4. The player will automatically:
 *    - Shift each separate .vtt subtitle file by +startTime so a subtitle starting
 *      at 00:00:00 syncs perfectly at 00:24:15, 00:48:30, etc.
 *    - Seek to `startTime` and load that part's .vtt file when a card is clicked.
 *    - Auto-switch to the next video card and load the next .vtt subtitle file
 *      as soon as `endTime` is reached during playback!
 * ============================================================================
 */

(function () {
  'use strict';

  const NANATOUR_THUMBNAIL = "https://res.cloudinary.com/sanuqblh/image/upload/v1794122542/cf49fd9d-308c-4334-a64d-105ee07f9f69_a00ec4.png";

  const NANATOUR_VIDEOS = [
    {
      id: "1",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "2",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "3",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "4",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "5",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "6",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "7",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "8",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "9",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "10",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "11",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "12",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "13",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "14",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "15",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "16",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "17",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "18",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "19",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "20",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "21",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "22",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "23",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "24",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "25",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "26",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "27",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "28",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "29",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    },
    {
      id: "30",
      title: "",
      url: "",
      subtitle: "",
      startTime: "00:00:00",
      endTime: "",
      image: NANATOUR_THUMBNAIL
    }
  ];

  function decryptField(val) {
    if (!val) return "";
    if (window.ZoneVaultStream && typeof window.ZoneVaultStream.decryptPayload === 'function') {
      return window.ZoneVaultStream.decryptPayload(val);
    }
    return val;
  }

  // Store inside a non-enumerable vault accessor so external scripts cannot easily dump it
  Object.defineProperty(window, '__ZV_NANATOUR_VAULT__', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: {
      thumbnail: NANATOUR_THUMBNAIL,
      getPlaylistMeta: function () {
        return NANATOUR_VIDEOS.map(function (item, idx) {
          return {
            id: String(item.id || (idx + 1)),
            title: item.title || "",
            image: item.image || NANATOUR_THUMBNAIL,
            startTime: item.startTime || "00:00:00",
            endTime: item.endTime || "",
            introEnd: item.introEnd || 0
          };
        });
      },
      getMediaById: function (epId) {
        const found = NANATOUR_VIDEOS.find(function (item) {
          return String(item.id) === String(epId);
        });
        if (!found) return null;
        return {
          id: String(found.id),
          title: found.title || "",
          url: decryptField(found.url || ""),
          subtitle: decryptField(found.subtitle || ""),
          startTime: found.startTime || "00:00:00",
          endTime: found.endTime || "",
          image: found.image || NANATOUR_THUMBNAIL,
          introEnd: found.introEnd || 0
        };
      },
      getAllMedia: function () {
        return NANATOUR_VIDEOS.map(function (item, idx) {
          return {
            id: String(item.id || (idx + 1)),
            title: item.title || "",
            url: decryptField(item.url || ""),
            subtitle: decryptField(item.subtitle || ""),
            startTime: item.startTime || "00:00:00",
            endTime: item.endTime || "",
            image: item.image || NANATOUR_THUMBNAIL,
            introEnd: item.introEnd || 0
          };
        });
      }
    }
  });
})();
