# Player-Only Instant Black-Flash Anti-Capture Shield

This plan introduces a browser-level **Player-Only Anti-Capture Shield** for Zone Vault that isolates protection strictly to the video player container while keeping the rest of the website untouched. When a screenshot or screen-capture trigger is detected, **only the video player area instantly turns solid black** while **video and audio playback continue uninterrupted in the background**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Choices from Clarification**
> - **Protection Mode**: **Instant Black-Flash on Capture while Video Keeps Playing** — only the video player container turns solid black during capture attempts; the rest of the website UI remains completely visible and normal.
> - **Playback Continuity**: **Continuous Audio & Video Playback (Zero Pausing)** — neither the video nor the audio pauses or mutes during the blackout flash, matching the uninterrupted viewing feel requested.
> - **Coverage Scope**: Automatically active across all **VOD Concerts (2021–2026)**, **Special Gifts**, and **Live Streams**.

> [!NOTE]
> **Technical Boundary of Browser-Based `.m3u8` Streams vs. Paid Studio Hardware DRM**
> - Native OS-level invisible hardware blackouts (like Netflix or Weverse on iOS/Android hardware buttons) require commercial **Widevine L1 / Apple FairPlay DRM encryption** and paid license servers.
> - For standard `.m3u8` streams, this browser-level shield intercepts all browser-detectable screenshot shortcuts (`PrintScreen`, `Win+Shift+S`, `Cmd+Shift+3/4/5/6`, Snipping Tool focus-loss transitions, browser `getDisplayMedia` screen recording, and canvas/frame extraction APIs) to render an instant `#000000` blackout mask strictly inside the video player frame while playback continues seamlessly.

---

## 1. Overview & Core Concept

- **What It Does**: Attaches an ultra-low-latency (`0ms` CSS transition) blackout shield inside every Artplayer and HTML5 video container on Zone Vault. Whenever a user triggers a screenshot key combination, invokes an OS snipping overlay, or attempts browser screen/frame capture, only the video player rectangle turns pure black (`#000000`) so the resulting capture shows a black player box while the rest of the page looks normal.
- **Target Audience / Persona**: Authenticated Zone Vault community members watching exclusive concerts, VOD archives, and live broadcasts.
- **Key Value**: Protects video frames inside the player container without disrupting the viewer's audio/video stream or breaking the surrounding page layout, chat, or episode playlist.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Normal Viewing**: Viewer watches a concert or live broadcast normally. Picture-in-Picture frame extraction, right-click "Save video frame as...", and `HTMLVideoElement.captureStream()` are silently locked on the `<video>` element.
  2. **Screenshot Shortcut Triggered (`PrintScreen`, `Cmd+Shift+3/4/5`, `Win+Shift+S`)**:
     - Within the same frame (`0ms` delay), only the `.art-video-player` / `<video>` surface turns solid `#000000` black (hiding both the video frame and active subtitles inside the player).
     - The surrounding webpage (header, concert title, episode selector, live chat) remains 100% visible so any screenshot looks like only the video player is blacked out.
     - Audio and video continue playing smoothly in the background with zero pause or stutter.
     - Clipboard image write attempts on `PrintScreen` are cleared so copied screenshots cannot retain pre-keyframe buffers.
  3. **Automatic Recovery**:
     - After the capture window passes (~650ms after a shortcut press, or immediately when the snipping tool overlay closes and focus returns), the black shield fades out smoothly and the playing video is visible again.
- **Visual Identity & Theme**:
  - **Aesthetic Direction**: Pure hardware-style black mask (`#000000`) confined strictly to the video player bounding box (`inset: 0` inside the player container).
  - **Color Palette & Mood**:
    - Shield Background: `#000000` (100% opaque pitch black inside the player frame).
    - Surrounding Page: Unchanged (`--bg-color: #050505` / `#000000` theme with full visibility of cards, text, and controls outside the player).
  - **Typography & Hierarchy**: By default, the blackout mask renders a clean, pure black rectangle inside the player (matching the exact look of a DRM-blacked-out video frame in a screenshot).
- **Interactive Feedback & Motion**:
  - **Activation (`0ms`)**: Instantaneous `opacity: 1` and `visibility: visible` with `transition: none !important` so the browser compositor paints the black rectangle before the screenshot buffer completes.
  - **Deactivation (`180ms ease-out`)**: Smooth reveal back to the live playing video once the capture trigger ends.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Zero-Latency CSS Compositor Blackout Layer + `<video>` Filter Fallback**
  - *Chosen Approach*: Combine an internal `.zv-player-blackout-shield` overlay (`background: #000000`, `z-index` above video and subtitles) with an instant `filter: brightness(0)` on the `<video>` element itself during the capture window.
  - *Why*: Applying `brightness(0)` directly to the `<video>` node in addition to the overlay ensures that even in native fullscreen or hardware-accelerated compositing layers, the video frame itself renders pure black pixels without pausing decoding or audio output.
  - *Alternatives Considered*: Pausing or unloading the `<video>` source (rejected because the user explicitly requested the video and audio to keep playing continuously).
- **Decision 2: Centralized Injection via Shared Player & Live Security Modules**
  - *Chosen Approach*: Embed the Player-Only Anti-Capture Shield directly into the centralized VOD/Special Gift player module and the centralized Live Stream Security module.
  - *Why*: Automatically protects every concert page (2021–2026), Special Gift page, and Live Stream page from a single unified engine without duplicating inline scripts across 50+ HTML pages.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        ZONE VAULT WEB PAGE (NORMAL UI)                     │
│  Header, Concert Info, Playlist & Live Chat remain 100% visible & untouched│
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                 VIDEO PLAYER CONTAINER ONLY                        │   │
│   │                                                                    │   │
│   │  ┌──────────────────────────────┐  ┌────────────────────────────┐  │   │
│   │  │  Capture Detection Listeners │  │  API & Frame Hardening     │  │   │
│   │  │  • PrintScreen / SysRq       │  │  • disablePictureInPicture │  │   │
│   │  │  • Cmd/Meta + Shift + 3/4/5  │  │  • Block contextmenu save  │  │   │
│   │  │  • Win + Shift + S / Blur    │  │  • Lock captureStream()    │  │   │
│   │  │  • getDisplayMedia hook      │  │  • Lock canvas drawImage   │  │   │
│   │  └──────────────┬───────────────┘  └─────────────┬──────────────┘  │   │
│   │                 │                                │                 │   │
│   │                 ▼                                ▼                 │   │
│   │  ┌──────────────────────────────────────────────────────────────┐  │   │
│   │  │         INSTANT BLACK-FLASH ENGINE (0ms Activation)          │  │   │
│   │  │  1. Sets <video> filter: brightness(0) (Pixels turn black)   │  │   │
│   │  │  2. Shows #000000 .zv-player-blackout-shield inside player   │  │   │
│   │  │  3. Audio & Video playback continue 100% uninterrupted       │  │   │
│   │  │  4. Auto-restores visibility after capture window (~650ms)   │  │   │
│   │  └──────────────────────────────────────────────────────────────┘  │   │
│   └────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **`ZoneVaultCaptureShield` Runtime State**:
  - `isShieldActive` (`boolean`): Tracks whether the player container is currently in black-flash state.
  - `restoreTimer` (`number | null`): Debounced timer handle that restores video visibility (`650ms` after shortcut release or `150ms` after window focus returns).
  - `metaShiftHeld` (`boolean`): Tracks pre-capture modifier chords (`Meta+Shift` on macOS or `Win+Shift` on Windows) so the video frame turns black *before* the final screenshot key (`3`, `4`, `5`, `S`) is pressed.

### Interactive Component & State Mapping

1. **Pre-Capture Chord Detection (`keydown` in Capture Phase)**:
   - Detects `PrintScreen` (`key === 'PrintScreen'` or `keyCode === 44`) and immediately triggers `triggerPlayerBlackFlash(800)` + clears clipboard image data if permitted.
   - Detects `Meta + Shift` or `Control + Shift` pre-chords used by macOS (`Cmd+Shift+3/4/5`) and Windows (`Win+Shift+S`) and immediately engages the player black-flash *before* the OS captures the screen.
2. **Snipping Tool / Auxiliary Overlay Blur Handling (`window.blur`)**:
   - When the OS snipping tool steals window focus (`window.onblur` while the tab itself is still visible on screen), only the video player container turns black while audio and video continue playing seamlessly. As soon as focus returns (`window.onfocus` or pointer interaction), the video restores immediately.
3. **Browser Screen Recording & Canvas Frame Extraction Lock**:
   - Overrides `HTMLVideoElement.prototype.captureStream` and `mozCaptureStream` to prevent browser extensions from recording the raw video stream.
   - Wraps `CanvasRenderingContext2D.prototype.drawImage` so any script or extension attempting to draw the `<video>` element onto a `<canvas>` for screenshot extraction receives a solid black frame.
   - Wraps `navigator.mediaDevices.getDisplayMedia` so if browser tab-sharing is started, the video player remains blacked out during the active capture stream while audio/video state remains intact.
