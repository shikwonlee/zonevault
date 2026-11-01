# Full-Pipeline Stream Protection: Expiring 60s Rolling Tokens & Full Proxy Gateway

Deliver end-to-end stream protection for all 2021–2026 concert pages and live broadcast streams, fully shielding upstream CDN URLs by proxying playlists and media segments through a secure server gateway locked to `zonevault.live`.

---

### User Review & Confirmed Decisions

> [!IMPORTANT]
> The following parameters and scope requirements have been confirmed for this implementation:

- **Confirmed Decision 1 (Token TTL & Invalidation)**: 60-second Time-To-Live (TTL) for stream tokens with cryptographic HMAC-SHA256 signatures. Stolen or extracted links die within 60 seconds outside the website.
- **Confirmed Decision 2 (Full Proxy Architecture)**: Both `.m3u8` playlists and all video/audio segments (`.m4s`, `.ts`, `init.mp4`, `.aac`) are proxied through the Express server (`/api/stream/...`). No upstream CDN URLs are ever exposed in DevTools Network tab or client traffic.
- **Confirmed Decision 3 (Seamless Rolling Token Refresh)**: The client video player (`/player/video_player.js` and live stream modules) runs an in-browser rolling token manager (every 40s) and intercepts Hls.js segment/playlist loading to keep active website viewers on continuous, uninterrupted playback.
- **Confirmed Decision 4 (Domain Lock & Multi-layer Blocking)**: Requests lacking the authorized Origin/Referer (`zonevault.live` or local/preview dev environments), or requests from external players (VLC, MPV, curl), are instantly rejected with HTTP `403 Forbidden`.
- **Confirmed Decision 5 (Comprehensive Scope)**: Covers all 2021–2026 concert and episode video pages and all live stream broadcast pages (`live_stream/*.html`).

---

### 1. Overview & Core Concept

Currently, when a viewer plays a concert or live stream, the playlist rewriting formerly allowed the browser to resolve media chunks directly to the external CDN (e.g. `chunk.../87.m4s?skid=default&signature=...`), exposing the raw stream source in the browser Network tab and allowing third parties to extract direct links.

With this full-pipeline architecture:
1. **Server Stream Gateway**:
   - `/api/stream/manifest.m3u8` (and `/api/stream-proxy.m3u8`): Proxies upstream m3u8 manifests and rewrites all segment URIs and `#EXT-X-MAP` initialization segments to point to our internal chunk proxy endpoint.
   - `/api/stream/chunk`: Proxies all media chunks (`.m4s`, `.ts`, `.mp4`), validates the 60s signed token and domain origin on every chunk request, and streams binary media buffers with correct MIME headers.
2. **In-Browser Rolling Token Handshake**:
   - Client fetches a signed token containing `uid`, `displayName`, `role`, `epId`, client IP, and a 60-second timestamp.
   - A background rolling refresher acquires a fresh token every 40 seconds (20s safety margin).
   - Hls.js loader attaches the active token to each manifest and segment fetch so that active web viewers never experience buffering drops, audio cuts, or video pauses.
3. **Zero Direct CDN Exposure**:
   - All network traffic in browser DevTools displays domain `zonevault.live` and path `/api/stream/...`.
   - External downloaders and players without valid session tokens or valid origins receive HTTP 403 Forbidden.

---

### 2. User Experience & Visual Design

- **Legitimate Website Viewers**:
  - Open any concert page (2021–2026) or live broadcast page.
  - Video starts promptly; quality switcher (1080p, 720p, 480p, Auto), audio controls, full-screen orientation lock, and gestures work flawlessly.
  - Rolling token renewals happen silently in the background without frame drops or buffering circles.
- **External Sniffers / Re-streamers**:
  - Copying the stream link into VLC, MPV, or external sites fails immediately with `403 Forbidden` due to missing Origin/Referer headers and/or 60-second token expiration.
- **Visual Design & Layout**:
  - Preserves the existing dark mode aesthetic, typography, and controls.
  - Retains access control modals displaying Username & UID with the manual "Back to Videos" button.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Full Chunk Streaming Proxy vs. Direct Redirect**
  - *Chosen Approach*: Stream the binary media chunks directly through Express back to the client (`res.write(chunk)`).
  - *Why*: Direct redirects (`302`) would expose the upstream CDN URL in the client's network tab, defeating the purpose. Streaming the chunks preserves complete link privacy and enforces 100% domain isolation.
  - *Alternatives Considered*: URL rewriting with direct CDN redirect (rejected because network inspectors easily catch the 302 location header).
- **Decision 2: Hls.js Dynamic Request Interceptor (`xhrSetup`)**
  - *Chosen Approach*: Configure Hls.js `xhrSetup` to automatically append the latest rolling token query parameter to all manifest re-fetches and segment downloads.
  - *Why*: Allows Hls.js to continuously stream for hours without ever re-mounting Artplayer or causing audio/video glitches.
  - *Alternatives Considered*: Destroying and re-creating the player every minute (causes jarring black screens and halts playback; rejected).

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Zone Vault Client                             │
│                  (2021–2026 Pages & Live Stream)                       │
│                                                                        │
│   ┌────────────────────┐            ┌──────────────────────────────┐   │
│   │  Artplayer + HLS   │◀───────────│ Token Manager (Rolling 40s)  │   │
│   │  (video_player.js) │            │   - auto-fetches fresh token │   │
│   └─────────┬──────────┘            └──────────────┬───────────────┘   │
└─────────────┼──────────────────────────────────────┼───────────────────┘
              │ Request Manifest & Chunks            │ Refresh Token
              │ (Origin / Referer: zonevault.live)   │
              ▼                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Express Server (server.js)                     │
│                                                                        │
│   ┌───────────────────────────┐      ┌─────────────────────────────┐   │
│   │ /api/stream-token         │      │ /api/stream/chunk           │   │
│   │ - Generates HMAC-256 JWT  │      │ - Validates 60s JWT token   │   │
│   │ - 60s TTL, uid, name, ip  │      │ - Validates zonevault origin│   │
│   └───────────────────────────┘      │ - Streams upstream bytes    │   │
│   ┌───────────────────────────┐      └─────────────────────────────┘   │
│   │ /api/stream-proxy.m3u8    │                                        │
│   │ - Fetches upstream m3u8   │                                        │
│   │ - Rewrites all chunks to  │                                        │
│   │   /api/stream/chunk?t=... │                                        │
│   └───────────────────────────┘                                        │
└──────────────────────────────────────────────────────┬─────────────────┘
                                                       │ Proxies Chunks
                                                       ▼
                                         ┌──────────────────────────┐
                                         │ Upstream HLS Content     │
                                         │ (VOD CDN / Live Streams) │
                                         └──────────────────────────┘
```

#### Step-by-Step Implementation Plan
1. **Server Stream Proxy & Chunk Gateway (`server.js`)**:
   - Add `/api/stream/chunk`: Accepts encrypted/encoded upstream target URL and validates the 60s signed token and allowed Origin/Referer. Proxies binary response with streaming pipe and appropriate media headers (`video/iso.segment`, `video/mp2t`, etc.).
   - Update `/api/stream-proxy.m3u8` and `/api/stream/manifest.m3u8`:
     - Rewrites relative and absolute segment URLs (`.m4s`, `.ts`, `.mp4`, `.aac`) to `/api/stream/chunk?token=${token}&u=${encodedChunkUrl}`.
     - Rewrites `#EXT-X-MAP:URI="..."` to route initialization segments through `/api/stream/chunk`.
   - Ensure `/api/stream-token` and `/api/verify-stream` continue to sign and parse `uid` and `displayName`.

2. **Client Token Refresh & Hls.js Interceptor (`/player/video_player.js`)**:
   - Implement `ZoneVaultTokenManager`:
     - Holds active token and schedules background renewal every 40 seconds.
     - Provides `getActiveToken()` for media requests.
   - In `customType.m3u8`:
     - Configure Hls.js with `xhrSetup` to intercept manifest and segment HTTP requests and attach the latest fresh token to `/api/stream/chunk` and manifest requests.
     - Handle live and VOD stream continuity seamlessly.

3. **Live Stream Broadcast Integration (`live_stream/*.html`)**:
   - Update live stream players in `live_stream/` to route through the secure proxy gateway and token refresher instead of direct URLs.

4. **Testing & Verification**:
   - Verify DevTools Network tab: No direct CDN URLs appear; all requests route to `/api/stream/...`.
   - Verify playback continuity (>3 minutes continuous playback without interruptions).
   - Test external curl / VLC request without `zonevault.live` Referer or after 60s TTL: verify immediate `403 Forbidden`.
   - Verify all 2021-2026 concert pages and live broadcast pages function without error.
