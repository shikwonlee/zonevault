# Implementation Plan: Centralize ArtPlayer CSS and JavaScript into a Single Folder (`/player/`)

Centralize all ArtPlayer styles and player functions from all files in folders `2021`, `2024`, `2025`, and `2026` into a single dedicated folder `/player/` containing both `video_player.css` and `video_player.js`, connected seamlessly to all video pages.

---

## 1. Unified Player Folder (`/player/`)

Both player assets will be placed together in the dedicated `/player/` directory:

1. **`/player/video_player.css`**:
   - Subtitle styles (`.art-subtitle`) with high-contrast drop-shadows and responsive mobile margins.
   - Sizing and responsive rules (`.art-video-player`, full viewport height in landscape orientation).
   - Double-tap feedback animation overlay (`.custom-gesture-anim`, `@keyframes popFade`).
   - Custom player button layers: Skip Intro (`.skip-intro-btn`, `.art-layer-skipIntroLayer`) and Next Episode (`.next-ep-btn`, `.art-layer-nextEpLayer`) with responsive positioning and `@keyframes fadeInBtn`.

2. **`/player/video_player.js`**:
   - **`cleanupPlayer()`**: Cleanly destroys HLS and Artplayer instances and revokes temporary subtitle blob URLs.
   - **`formatPlayerTime(seconds)`**: Converts seconds into standard timestamp strings (`H:MM:SS` or `MM:SS`) for notifications.
   - **`triggerCustomAnimation(type, side)`**: Renders overlay gesture feedback icons (-10s rewind, +10s forward, play, pause).
   - **`initZoneVideoPlayer(config)`**:
     - Creates the `Artplayer` instance with all standard Zone Vault settings: theme `#a1a1aa`, volume, muted, autoplay, settings menu, fullscreen, mini-progress bar, auto-orientation, lock, airplay, inline playback, and iOS/Android video attributes.
     - HLS multi-bitrate resolution switcher with options `Auto`, `1080P`, `720P`, `480P`, `270P`, `120P`.
     - Mobile touch and desktop click handlers on `ready`: suppresses accidental sliding/scrubbing gestures, enables double-tap left (-10s), right (+10s), center (play/pause toggle), and single-tap controls toggle, while preserving clicks inside settings and controls.
     - Layers: `nextEpLayer` (appears when ≤60 seconds remain if there is a next episode) and `skipIntroLayer` (appears until `introEndTime`).
     - Subtitle settings menu selector for single or multiple language tracks.
     - Playlist synchronization: toggles `.is-paused` on the active playlist card when audio/video plays or pauses.
     - Firebase `watchHistory` background synchronization every 5 seconds.
     - Resume position notification (`Resumed from ...`) on metadata load.
   - **Global Shortcuts**: Keyboard event listener for Arrow Left (-10s), Arrow Right (+10s), `F` (toggle fullscreen), and `M` (toggle mute).
   - **Global Exports**: Sets `window.art`, `window.cleanupPlayer`, `window.triggerCustomAnimation`, and `window.initZoneVideoPlayer` so all external functions and playlist controllers continue to work seamlessly.

---

## 2. Connecting `/player/` to All Files in `2021`–`2026`

Each file in the year directories will reference the unified player folder:
```html
<link rel="stylesheet" href="../player/video_player.css">
<script src="../player/video_player.js"></script>
```

And will replace the inline Artplayer CSS and duplicate initialization code with `initZoneVideoPlayer(...)`.

### Target Inventory (23 Files):
- **`2021/`**:
  - `inthesoop2-N12X5R25-74K2.html`
- **`2024/`**:
  - `8th_caratland.html`
  - `magichour.html`
  - `rightheregoyang.html`
- **`2025/`**:
  - `9th_caratland.html`
  - `fukuokanewtour.html`
  - `hxwfanconcert.html`
  - `hxwingwangju.html`
  - `japannewtour.html`
  - `nanabnb.html`
  - `newtour.html`
  - `ourchapterS17N-111025-6B4.html`
  - `svtholiday.html`
  - `svtreaming1.html`
  - `the-shadows-edge.html`
- **`2026/`**:
  - `cxm_in_incheon.html`
  - `cxminjapan.html`
  - `dinoxpicheolin.html`
  - `dxs_on_stage.html`
  - `new_encore.html`
  - `svt_2026_fanmeeting_yakusoku.html`
  - `svt_in_carat_land_2026.html`
  - `svtreaming_2026.html`
  - `vernon_the8_v8.html`

---

## 3. Verification & Quality Guardrails

1. **Path Resolution**: Verify `../player/video_player.css` and `../player/video_player.js` resolve correctly from all subfolders.
2. **Behavioral Parity**:
   - Double-tap seek gestures (-10s / +10s) and center play/pause overlay.
   - Next Episode and Skip Intro button layers and click triggers.
   - Quality selection menu (`Auto`, `1080P`, etc.) via HLS.js.
   - Watch history saving and resuming via Firebase Realtime Database.
   - Keyboard shortcuts (`ArrowLeft`, `ArrowRight`, `F`, `M`).
3. **Build Validation**: Verify project execution and compile status.
