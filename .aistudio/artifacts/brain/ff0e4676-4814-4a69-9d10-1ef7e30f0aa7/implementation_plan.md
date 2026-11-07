# SEVENTEEN <BE THE SUN> Streaming Page & Protected Media Config

This update creates the **SEVENTEEN `<BE THE SUN>`** streaming page in the 2025 collection modeled after the SVTreaming 2026 player layout, complete with 9 video cards and a separate, access-protected media configuration script in the 2026 directory where stream URLs and subtitle tracks are stored and easy for you to update.

## User Review & Critical Decisions

> [!IMPORTANT]
> Please review the confirmed configuration below and click **Proceed** when ready to build.

- **Confirmed Decision 1 (Separate Config in 2026 Folder)**: Stream `.m3u8` URLs and `.vtt` subtitle links for all 9 cards will be stored in a dedicated configuration script inside the `2026` folder connected to the `bethesun` page. Both the Node server and Cloudflare Worker will block direct browser navigation or external scraping of this config file while allowing the player page to load it seamlessly.
- **Confirmed Decision 2 (Cards 4 to 9 Left Blank for Easy Editing)**: Cards 1–3 will be pre-populated with your exact titles, Mux `.m3u8` streams, and Cloudinary `.vtt` subtitles. Cards 4–9 will be pre-created with the same thumbnail and blank `title`, `url`, and `subtitle` fields so you can fill them in directly.

---

## 1. Overview & Core Concept

- **What It Does**: Delivers a dedicated 9-episode concert & behind-the-scenes VOD player page for **TOUR-ING : SEVENTEEN `<BE THE SUN>`** with full HLS streaming, WebVTT subtitle rendering, watch-history resume, and Zone Vault stream protection.
- **Target Audience / Persona**: Authenticated Zone Vault community members and administrators watching SEVENTEEN concert VODs across desktop and mobile devices.
- **Key Value**: Separates sensitive stream and subtitle URLs from the HTML markup into a protected configuration module that blocks direct browser inspection while remaining effortless for the site owner to edit.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Landing on the Player Page**: The user sees the main 16:9 poster banner featuring the custom `<BE THE SUN>` artwork (`03e68a354749c45a891071b13f659608_yj7ysf.png`) and a right-hand playlist panel containing 9 video cards with the same thumbnail.
  2. **Selecting a Video Card**: Clicking the poster or any of the 9 playlist cards initializes the Zone Vault Artplayer instance, fetches an ephemeral stream token, proxies and decrypts the `.m3u8` manifest and `.vtt` subtitle track in browser RAM, and starts playback.
  3. **Editing Cards 4–9**: When you open the separate config script in the `2026` folder, you will see a clean 9-slot array where Cards 1–3 are filled and Cards 4–9 have ready-to-fill `title`, `url`, and `subtitle` properties.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Matches the sleek dark/light adaptive studio aesthetic of the SVTreaming 2026 player page.
  - *Color Palette & Mood*: Deep obsidian dark mode (`#0a0a0c` canvas, `#17171b` cards, `#fcfcfc` primary text, `#a1a1aa` accents) with automatic light-mode synchronization (`#f8f9fa` canvas, `#ffffff` cards).
  - *Typography & Hierarchy*: Clean sans-serif (`Inter`) for episode titles and player chrome, paired with `JetBrains Mono` for account verification metadata.
  - *Component Styling & Layout*: Responsive 2-column theatre grid (`3fr 1.2fr` on desktop, single-column stacked on mobile, fullscreen player in mobile landscape).
- **Interactive Feedback & Motion**:
  - Smooth hover scale transitions on the poster banner and playlist cards.
  - Animated 3-bar equalizer indicator on the currently playing card that pauses when the video is paused.
  - Clear notice feedback if a user clicks an episode slot (4–9) before its stream URL has been added.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Separate Protected Config Module with Auto-Decryption & Plain-Text Support**
  - *Chosen Approach*: Store the 9 video items in a dedicated config script in the `2026` folder that supports both obfuscated/encrypted values and standard `https://` URLs, while enforcing anti-navigation headers in the backend gateway.
  - *Why*: Protects the configuration file from visitors trying to open its URL directly in a browser tab, while allowing you to paste plain `.m3u8` and `.vtt` links for Cards 4–9 without needing to run a manual encryption script each time.
  - *Alternatives Considered*: Hardcoding URLs inside the HTML page (exposes links in View Source) or requiring manual CLI encryption before every edit (inconvenient for quick updates).

- **Decision 2: Individual Stream + Subtitle Per Card**
  - *Chosen Approach*: Unlike the single-stream timestamp jumping in `svtreaming_2026`, each of the 9 cards in `bethesun` loads its own distinct `.m3u8` stream URL and `.vtt` subtitle file through `initZoneVideoPlayer`, while keeping the exact visual design of `svtreaming_2026`.
  - *Why*: Each `<BE THE SUN>` card has its own separate Mux `.m3u8` master playlist and Cloudinary `.vtt` subtitle track.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Zone Vault Edge & Server Gateway                     │
│  • Blocks direct browser navigation (Sec-Fetch-Dest: document) to       │
│    protected media config scripts (403 Access Denied)                   │
│  • Issues 6-hour signed JWT tokens (/api/stream-token)                  │
│  • Proxies & ZV1-encrypts HLS manifests (/api/zv-media-sync)            │
│  • Proxies & ZV1-encrypts WebVTT subtitles (/api/zv-sub-sync)           │
└───────────────────┬─────────────────────────────────────┬───────────────┘
                    │ Loads Config Script                 │ Encrypted HLS & VTT
                    ▼                                     ▼
┌───────────────────────────────────────┐   ┌─────────────────────────────┐
│   Protected Config (in 2026 Folder)   │   │   BE THE SUN Player Page    │
│  • Thumbnail constant                 │   │      (in 2025 Folder)       │
│  • 9 Video Card entries:              │──▶│  • 16:9 Poster & Artplayer  │
│    - Card 1: [FULL STAGE] + Mux + VTT │   │  • "Now Playing" Title Box  │
│    - Card 2: [TO CARAT] HIPHOP + VTT  │   │  • 9-Card Playlist Sidebar  │
│    - Card 3: [TO CARAT] VOCAL + VTT   │   │  • Internal Access Guard    │
│    - Cards 4–9: Blank title/url/sub   │   └─────────────────────────────┘
└───────────────────────────────────────┘
```

### Data Model & State

- **Thumbnail Constant**:
  - `https://res.cloudinary.com/sanuqblh/image/upload/v1793851172/03e68a354749c45a891071b13f659608_yj7ysf.png` applied to both `#poster-container` and all 9 playlist cards.
- **9-Card Configuration Structure**:
  - **Card 1**: Title `[FULL STAGE] TOUR-ING : SEVENTEEN <BE THE SUN>`, Stream `https://stream.mux.com/N5jIesqE00ERZqNKQYdnHMtS01PvGBfPDf7kZOGnLewsE.m3u8`, Subtitle `https://res.cloudinary.com/sanuqblh/raw/upload/v1794063181/bethesun_gycm3q.vtt`
  - **Card 2**: Title `[TO CARAT] HIPHOP TEAM`, Stream `https://stream.mux.com/501B1TjHHU6VyJwy5ifCYcjjRFNO02Y02nTae5iBPhsgHw.m3u8`, Subtitle `https://res.cloudinary.com/sanuqblh/raw/upload/v1794063184/TO_CARAT_HIPHOP_TEAM_bbuup9.vtt`
  - **Card 3**: Title `[TO CARAT] VOCAL TEAM`, Stream `https://stream.mux.com/9KDf9QH01c4x8xrdCX017l02HQD2r99m7TGZ7r9ADq6udQ.m3u8`, Subtitle `https://res.cloudinary.com/sanuqblh/raw/upload/v1794063192/TO_CARAT_VOCAL_TEAM_hed4mn.vtt`
  - **Cards 4–9**: `id: "4"` through `id: "9"`, `title: ""`, `url: ""`, `subtitle: ""`, `image: THUMBNAIL`.

### Interactive Component & State Mapping

- **Card Selection (`loadAndPlayEpisode`)**:
  - Validates whether the selected card has a configured stream `url`. If a user clicks one of the blank cards (4–9) before a URL is added, it displays a clean notice without crashing the player.
  - Updates URL query parameter (`?v=<id>`) via `history.pushState` and highlights the active card in the sidebar.
  - Cleans up any previous player instance (`cleanupPlayer()`) before initializing `initZoneVideoPlayer` with the selected card's `url` and `subtitles` array (`[{ html: 'ENGLISH', url: ep.subtitle, default: true }]`).
  - Supports automatic next-episode progression (`window.playNextEpisodeGlobal`) and browser back/forward navigation (`popstate`).
