# Video Player UI & Touch Interaction Improvements

This update resolves three usability issues in the Zone Vault video player across all concert and VOD pages: removing the bottom slider when controls are hidden so accidental taps never jump the video, enabling smooth vertical scrolling inside the Settings / Quality menu, and relocating the player Lock button to the top-right corner.

## User Review & Critical Decisions

> [!IMPORTANT]
> Please review the plan below and click **Proceed** to apply these changes to the video player.

- **Hide & Disable Slider When Controls Hide**: Disables Artplayer's mini progress bar (`miniProgressBar: false`) and disables pointer events on the bottom control bar whenever the controls auto-hide, preventing accidental video seeking when touching the bottom edge of the screen.
- **Scrollable Quality & Settings Menu**: Updates the player touch-gesture listener to allow native touch scrolling (`touchmove`) inside the settings panel and applies scrollable container styling so all quality options (`Auto`, `1080P`, `720P`, `480P`, `270P`, `120P`) can be scrolled up and down effortlessly.
- **Top-Right Lock Button**: Moves the player lock toggle layer to the top-right corner of the player viewport.

---

## 1. Overview & Core Concept

- **What It Does**: Refines the centralized Artplayer configuration and stylesheet used across all Zone Vault VOD pages so mobile and desktop playback is free of accidental seeks and blocked menu scrolling.
- **Target Audience / Persona**: Zone Vault members watching concerts and VODs on mobile phones, tablets, and desktops.
- **Key Value**: Eliminates accidental timeline jumps when holding or tapping the bottom of the phone screen, makes all video resolutions reachable on smaller screens, and places the screen lock button in an ergonomic top-right position.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Watching with Controls Hidden**: When the player controls fade out, the bottom progress bar and mini slider completely disappear (`opacity: 0`, `visibility: hidden`, `pointer-events: none`). Touching or tapping the bottom edge of the player will no longer jump the video timeline.
  2. **Scrolling Quality Settings**: Tapping the Settings gear icon and opening the **Quality** list allows smooth vertical finger-scrolling (touch drag) and mouse-wheel scrolling through all resolution options, even in compact mobile landscape mode.
  3. **Tapping the Lock Button**: When controls are visible (or when locked), the Lock/Unlock button appears neatly in the **top-right corner** of the video player instead of the middle side edge.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Disable `miniProgressBar` and Lock Out Hidden Control Pointer Events**
  - *Chosen Approach*: Set `miniProgressBar: false` in the player configuration and enforce `pointer-events: none` and `visibility: hidden` on `.art-bottom` and `.art-mini-progress-bar` whenever `.art-control-show` is not active on the player.
  - *Why*: Artplayer's `miniProgressBar` leaves a thin bar at the very bottom when controls hide, and on mobile browsers the hidden `.art-control-progress` bar can still catch stray touches unless `pointer-events: none` is enforced when controls are hidden.

- **Decision 2: Exempt `.art-settings` from the Global `touchmove` Blocker**
  - *Chosen Approach*: Update the `touchmove` handler on the player element so touches inside `.art-settings` or `.art-setting-panel` are not blocked by `e.preventDefault()`, paired with `overflow-y: auto` and `touch-action: pan-y` on the settings panel.
  - *Why*: Previously, `playerEl.addEventListener('touchmove')` called `e.preventDefault()` on everything except `.art-control-progress`, which prevented mobile browsers from scrolling inside the Quality/Settings popup menu.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Zone Vault Centralized Player                       │
├───────────────────────┬─────────────────────────┬───────────────────────┤
│   1. Bottom Slider    │   2. Settings/Quality   │    3. Lock Button     │
│  • miniProgressBar:   │  • Allow touchmove in   │  • Position .art-     │
│    false              │    .art-settings        │    layer-lock at      │
│  • Hide & disable     │  • Enable overflow-y:   │    top: 16px,         │
│    .art-bottom when   │    auto & pan-y touch   │    right: 16px        │
│    controls hide      │    scrolling            │                       │
└───────────────────────┴─────────────────────────┴───────────────────────┘
```

### Interactive Component & State Mapping

- **Hidden Controls State (`.art-video-player:not(.art-control-show)`)**:
  - `.art-mini-progress-bar` is permanently hidden (`display: none !important`).
  - `.art-bottom` and `.art-control-progress` have `opacity: 0 !important`, `visibility: hidden !important`, and `pointer-events: none !important` whenever controls are hidden or the player is locked, ensuring zero accidental timeline seeks.
- **Settings & Quality Panel (`.art-settings`)**:
  - `touchmove` events originating inside `.art-settings`, `.art-setting`, or `.art-setting-panel` bypass the player's gesture blocker so native vertical scrolling works on iOS and Android.
  - CSS enforces `max-height: calc(100% - 70px)`, `overflow-y: auto`, and `-webkit-overflow-scrolling: touch`.
- **Top-Right Lock Layer (`.art-layer-lock`)**:
  - Positioned at `top: 16px`, `right: 16px` (with safe-area inset support in mobile landscape) and styled with a subtle dark glass circle for clear visibility.
