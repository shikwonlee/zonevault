# Implementation Plan: NANA TOUR (`/2026/nanatour.html` & `/2026/nanatour_config.js`)

## Overview
Create `/2026/nanatour.html` and `/2026/nanatour_config.js` modeled on `/2026/bethesun.html`, featuring **30 video cards** and built-in **Combined Video + Multi-Part Subtitle Synchronization**:
- You can use the **same combined 2-hour `.m3u8` URL** across multiple cards (e.g., 5 parts of an episode) while keeping **5 separate `.vtt` subtitle files**.
- Each card in `/2026/nanatour_config.js` supports `startTime: "HH:MM:SS"` and `endTime: "HH:MM:SS"`.
- **Automatic Subtitle Timestamp Shifting**: Because each separate `.vtt` file starts at `00:00:00`, the player automatically adds the card's `startTime` offset to every subtitle cue in memory (`Blob` VTT) so the 2nd, 3rd, 4th, and 5th `.vtt` files appear at the exact right moment in the 2-hour combined video.
- **Seamless Card & Subtitle Auto-Switch**:
  - When a viewer clicks any of the 30 cards, the player jumps directly to that card's `startTime` and loads its synced `.vtt` subtitle file.
  - When a viewer is watching continuously and the video reaches the `endTime` of the current card (entering the `startTime` of the next card sharing the same `.m3u8`), the page **automatically switches the active video card highlight, updates the "Now Playing" title, and swaps in the next card's `.vtt` subtitle file** without interrupting or reloading the video stream.

---

## Planned Changes

### 1. Protected 30-Card Config (`/2026/nanatour_config.js`)
- Create `/2026/nanatour_config.js` with `NANATOUR_THUMBNAIL` and `NANATOUR_VIDEOS` containing **30 card objects** (`id: "1"` through `id: "30"`).
- All 30 cards will have blank titles (`title: ""`) ready for you to fill in, along with `url`, `subtitle`, `startTime: "00:00:00"`, and `endTime: ""` fields:
  ```js
  {
    id: "2",
    title: "",
    url: "",
    subtitle: "",
    startTime: "00:00:00", // e.g. "00:24:10" for part 2 of a combined video
    endTime: "00:24:10",   // when reached, auto-switches to next card & next subtitle
    image: NANATOUR_THUMBNAIL
  }
  ```
- Supports both plain `https://...` links (which you can paste directly) and `ZV1.`-encrypted strings.

### 2. Encrypted Vault Delivery (`/server.js` & `/_worker.js`)
- Extend `/api/zv-vault-sync` to support `?k=nana26` so `/2026/nanatour_config.js` is delivered encrypted (`ZV1.<salt>.<ciphertext>`) exclusively into browser RAM.
- Block direct browser/DevTools requests to `/2026/nanatour_config.js` with `403 Access Denied` so it never appears in Inspect Element, Sources, or Network responses.

### 3. NANA TOUR Streaming Page & Multi-Part Subtitle Engine (`/2026/nanatour.html`)
- Clone the layout, theme support, Firebase watch-history integration, and security protections from `/2026/bethesun.html`.
- Add the **Combined Video Chapter & VTT Offset Controller**:
  - **Time Parser (`parseTimestampToSeconds`)**: Converts `"HH:MM:SS"` or `"MM:SS"` into seconds.
  - **In-Memory VTT Timestamp Shifter (`buildOffsetVttBlobUrl`)**: Fetches the card's `.vtt` file, shifts all WebVTT timestamps (`00:00:00.000 --> 00:00:04.500`) forward by `+startTime`, and creates an in-memory `blob:` URL so each separate `.vtt` file aligns with the combined 2-hour video.
  - **Smart Card Click**: If clicking another card that shares the same `.m3u8` URL as the currently playing video, seeks smoothly to the new card's `startTime` and swaps the shifted `.vtt` subtitle track without restarting the video player.
  - **Continuous Playback Auto-Transition**: Monitors `video:timeupdate`; when playback crosses the current card's `endTime` (or the next card's `startTime` on the same `.m3u8` URL), automatically highlights the next card in the 30-card playlist, updates `#main-title`, and loads the next card's shifted `.vtt` subtitle file.
  - If the next card has a different `.m3u8` URL (e.g., moving from Preview on Card 1 to Episode 1 on Card 2), automatically loads the next stream when the current video finishes.
