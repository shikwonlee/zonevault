# Implementation Plan: Fullscreen & Landscape In-Player Video Cards

## Overview
Add an in-player **Episode / Video Card Selector** to the shared player (`/player/video_player.js` and `/player/video_player.css`) so viewers can browse and switch video cards directly inside the player **without exiting Fullscreen or Landscape mode**, while keeping the normal right-side page playlist (`#playlist`) completely unchanged.

---

## Planned Changes

### 1. Middle-Right Toggle Button & Floating Video Cards UI (`/player/video_player.css`)
- **Visibility Rule**: Active **only** when the player is in Fullscreen (`art-fullscreen`, `art-fullscreen-web`, `:fullscreen`) or Mobile/Tablet Landscape (`@media (max-width: 950px) and (orientation: landscape)`). Completely hidden in normal portrait/windowed view where the standard right-side playlist is already visible.
- **Middle-Right Edge Toggle Button (`.zv-fs-cards-toggle`)**:
  - Positioned at the middle-right edge inside the player (`right: 14px; top: 50%; transform: translateY(-50%)`).
  - Auto-hides/shows cleanly with the player controls (and hides when the player Lock is active).
- **Frameless Scrollable Video Cards List (`.zv-fs-cards-list`)**:
  - Displays **only the individual video cards** on the right side of the player—no outer container box, no background panel frame, and no header box.
  - Smooth vertical scrolling (`overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain`) for both mobile touch-drag and desktop mouse wheel.
  - Each floating card shows the episode thumbnail, title, and animated playing bars on the active card.

### 2. Shared Player Integration & Sync (`/player/video_player.js`)
- Build the fullscreen/landscape card list dynamically from `playlistData` (or the page's `#playlist-items` DOM cards so any dynamic updates are reflected).
- **Touch & Scroll Passthrough**: Whitelist `.zv-fs-cards-list` and `.zv-fs-cards-toggle` in the player's `touchmove`, `touchend`, and `click` handlers so scrolling up/down and tapping a card works smoothly on mobile and desktop without triggering seek/double-tap gestures.
- **Episode Switching Without Leaving Fullscreen**:
  - Clicking a card triggers the corresponding episode (`loadAndPlayEpisode(id, true)` or clicking the matching `.playlist-item[data-id]`) while keeping the player in Fullscreen/Landscape mode.
  - Automatically syncs the `.active` state and scrolls to the currently playing video card whenever the episode changes (including auto-switching parts in `nanatour.html`).
