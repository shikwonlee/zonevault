# Free-Tier Saver Stream Protection (Manifest-Only Proxy Mode)

Optimize the Zone Vault HLS streaming gateway to reduce Cloudflare Worker request usage by **~99%** (from ~3,000 requests per concert down to 2–5 requests per concert) while keeping `.m3u8` master and sub-playlist links hidden, signed with rolling tokens, and locked to `zonevault.live` with zero changes to existing player functionality.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural choices were confirmed to protect your Cloudflare Free Tier (`100,000 requests/day`) and Firebase Free Tier (`0 extra database reads/writes`) without altering any player features:

- **Confirmed Decision 1 — Proxy All `.m3u8` Playlists, Direct-Stream Video Chunks**: All master playlists and quality sub-playlists (`.m3u8`) remain 100% routed through the token-verified proxy gateway (`/api/stream-proxy.m3u8`). Individual media chunks (`.ts`, `.m4s`, `.mp4`, `.aac`) inside the rewritten sub-playlists resolve to their absolute upstream CDN URLs so video data streams directly from storage/CDN without consuming Cloudflare Worker invocations.
- **Confirmed Decision 2 — Keep `/api/stream/chunk` Active as a Fallback**: The `/api/stream/chunk` endpoint remains live and functional on both Node.js and Cloudflare Workers so any cached manifests or legacy requests continue to work seamlessly.
- **Confirmed Decision 3 — Smart Cross-Origin Header Guard**: Custom Zone Vault headers (`X-Stream-Token`, `X-ZV-Player`, `X-Requested-With`) will only be attached to same-origin proxy requests (`/api/...` and `/stream-...`) and omitted on direct CDN segment fetches so external R2/CDN buckets never reject segment requests due to CORS preflight checks.

---

## 1. Overview & Core Concept

- **What It Does**: Protects all VOD and Live Stream `.m3u8` entry points and quality-level sub-playlists behind short-lived, rolling HMAC-SHA256 JWT tokens and strict origin/extension checks, while offloading high-frequency `.ts`/`.m4s` segment transfers directly to the upstream CDN.
- **Target Audience / Persona**: Authenticated Zone Vault members and admins watching full-length concerts and live broadcasts across desktop and mobile browsers.
- **Key Value**:
  - **99% Lower Cloudflare Worker Usage**: A 2-hour concert VOD drops from ~2,500 Worker requests to just **2–5 Worker requests** (initial token handshake + master `.m3u8` + selected resolution `.m3u8` + periodic 2-minute token refresh).
  - **Zero Firebase Quota Impact**: Token generation and verification remain 100% stateless in-memory HMAC-SHA256 operations with zero Firestore or Realtime Database reads/writes.
  - **Full Link & Player Security**: External downloaders (IDM, yt-dlp, curl, VLC), browser extensions (`chrome-extension://`, `moz-extension://`), and unauthorized domains remain blocked from accessing the `.m3u8` playlists.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Member/Admin Video Playback**: User opens any 2021–2026 concert page, Special Gift page, or Live Stream page. The player silently performs the `/api/stream-token` handshake and loads `/api/stream-proxy.m3u8?token=...`.
  2. **Quality Switching & Seeking**: When a viewer switches resolution (e.g., Auto → 1080p) or seeks forward/backward, the sub-playlist `.m3u8` is fetched through `/api/stream-proxy.m3u8` using the active rolling token, and media segments play immediately with zero buffering overhead.
  3. **Unauthorized / External Access**: Attempting to open the `.m3u8` proxy link directly in a browser tab, VLC, or download manager continues to return a `403 Access Denied` response, and unauthenticated users see the existing **Access Restricted** modal.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: No visual or UI layout changes—preserves the existing Zone Vault dark-mode cinema interface (`#050505` background, `#121212` cards, `Outfit` / `Fraunces` / `JetBrains Mono` typography).
  - *Interactive Controls*: All ArtPlayer and Plyr controls, quality selectors, subtitle switches, double-tap +/-10s gestures, and watch-history resume points remain 100% unchanged.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Manifest-Only Rewriting vs. Full Segment Proxying**
  - *Chosen Approach*: Rewrite all `.m3u8` references (sub-playlists and `#EXT-X-MEDIA` / `#EXT-X-STREAM-INF` playlist URIs) to route through `/api/stream-proxy.m3u8?token=...&u=...`, while resolving non-`.m3u8` segment lines (`.ts`, `.m4s`, `.mp4`, `.aac`, and `#EXT-X-MAP:URI="..."` init segments) to their absolute upstream URLs.
  - *Why*: Sharing or scraping the stream URL from the page still yields only an expiring, origin-locked `/api/stream-proxy.m3u8` link that refuses to load outside `zonevault.live`, while saving ~3,000 Worker calls per stream session.
  - *Alternatives Considered*: Full chunk proxying through `/api/stream/chunk`, which hides individual `.ts`/`.m4s` requests in DevTools but consumes ~3,000 Cloudflare Worker requests per 2-hour concert.
- **Decision 2: Scoped Custom Headers in HLS Loader (`xhrSetup`)**
  - *Chosen Approach*: Attach `X-Stream-Token`, `X-ZV-Player`, and `X-Requested-With` headers only when the request targets Zone Vault's own proxy endpoints (`/api/...` or `/stream-...`), leaving direct CDN segment requests as clean standard `GET` requests.
  - *Why*: Cloudflare R2 (`pub-*.r2.dev`) and external CDNs reject cross-origin `OPTIONS` preflights if custom headers are sent on segment requests. Scoping custom headers strictly to proxy routes ensures 100% playback reliability across all CDNs.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Zone Vault Web Player (ArtPlayer / HLS.js)           │
│  • Resolves Firebase Auth user session (client-side IndexedDB/cache)    │
│  • Requests 3-min JWT ticket (/api/stream-token) & refreshes every 2m   │
│  • Scoped xhrSetup: sends X-Stream-Token ONLY to /api/* proxy routes    │
└───────────────────┬─────────────────────────────────────┬───────────────┘
                    │ 1. Playlist Request (.m3u8)         │ 3. Direct Media Chunks
                    │    (2–5 requests per concert)       │    (.ts / .m4s / init.mp4)
                    ▼                                     │    (0 Worker requests!)
┌───────────────────────────────────────────────────┐     │
│   Stream Security Gateway (Node & CF Worker)      │     │
│  • Blocks IDM, yt-dlp, VLC, curl & extensions     │     │
│  • Enforces zonevault.live Origin / Referer       │     │
│  • Verifies stateless HMAC-SHA256 JWT (0 DB reads)│     │
│  • Rewrites nested .m3u8 -> /api/stream-proxy.m3u8│     │
│  • Resolves .ts/.m4s -> Absolute Upstream CDN URL │     │
│  • Keeps /api/stream/chunk active as fallback     │     │
└───────────────────┬───────────────────────────────┘     │
                    │ 2. Fetches upstream .m3u8           │
                    ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 Upstream Media Storage / Cloudflare R2 CDN              │
│               (Unlimited Free Egress Bandwidth for Chunks)              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State
- **Stateless JWT Stream Ticket**: Contains `uid`, `displayName`, `role`, `epId`, `targetUrl`, `iat`, and `exp` (180-second TTL), signed in-memory with `STREAM_SECRET` (zero database calls).
- **Manifest Rewriter (`rewriteHlsManifest`)**:
  - Any URI or line referencing a `.m3u8` playlist (including `#EXT-X-MEDIA` audio/subtitle playlists and variant streams) is base64url-encoded and wrapped in `/api/stream-proxy.m3u8?token=<jwt>&u=<encodedUrl>`.
  - Any URI or line referencing media segments (`.ts`, `.m4s`, `.mp4`, `.aac`, `#EXT-X-MAP` initialization segments) is resolved against the playlist's `baseUrl` to a valid absolute URL so the browser fetches segments directly from the CDN.

### Interactive Component & State Mapping
- **VOD Player Engine**:
  - Rolling token timer refreshes the JWT every 120 seconds in the background and updates `window.ZoneVaultStream.activeSession.token` so subsequent sub-playlist switches or live manifest reloads always carry a fresh token.
  - `xhrSetup` inspects the target request URL: if it targets the proxy (`/api/` or `/stream-` or same-origin), it injects `X-Stream-Token`, `X-ZV-Player`, and `X-Requested-With`; if it targets an external CDN host for `.ts`/`.m4s` chunks, it sends no custom headers so no CORS preflight is triggered.
- **Live Stream Security Manager**:
  - Applies the same origin-aware header guard in `createHlsConfig()` so live stream `.m3u8` reloads stay authenticated through the proxy while live `.ts`/`.m4s` segments stream directly without burning Cloudflare Worker requests.
