# Encrypted Stream Manifests, Protected Subtitle Proxy & Cloudflare Free-Tier Optimization

This plan upgrades Zone Vault's streaming and subtitle transport layer so that `.m3u8` manifests and `.vtt`/`.srt` subtitle files use disguised endpoint URLs (without `.m3u8` or `.vtt` extensions) and return **encrypted response payloads** over the network—completely hiding `#EXTM3U` tags and raw subtitle links in the DevTools Network tab—while **protecting your Cloudflare Worker Free Tier** so an entire 3-hour concert with subtitles uses **only 3–4 Worker requests total** (0 chunk requests and 0 background polling requests).

## User Review & Critical Decisions

> [!IMPORTANT]
> **Why Your Cloudflare Worker Free Tier Will NOT Run Out**:
> Previously, the Free Tier ran out when thousands of video chunks (`.ts` / `.m4s`) and 2-minute token refresh timers hit the Worker continuously (~3,000+ requests per viewer).
> Under this updated plan:
> 1. **Video & Audio Chunks (`.ts`, `.m4s`) = 0 Worker Requests** (streamed directly from the CDN).
> 2. **Background Token Polling = 0 Worker Requests** (we remove the 2-minute `setInterval` token refresher and use a 6-hour concert session TTL plus instant client-side token signing).
> 3. **Subtitles = 1 Worker Request Total** (fetched once, decrypted in browser RAM into a `blob:` URL, and cached in memory—switching subtitles or seeking makes **0 extra requests**).
> 4. **HLS Manifests = 2–3 Worker Requests Total** (fetched once at video start and cached in browser RAM so switching quality between 1080p/720p makes **0 repeat requests**).
>
> **Result**: 1 viewer watching a full 3-hour concert uses **only ~3–4 requests total** (down from 70–3,000+ requests). Your 100,000/day Cloudflare Free Tier will support **25,000+ full concert plays per day**.

- **Confirmed Decision 1 — Manifest Payload Encryption**: Encrypts all HLS master and sub-playlist responses into an opaque `ZV1.<salt>.<ciphertext>` payload so the DevTools Network "Response" tab never shows `#EXTM3U` or segment URLs, while HLS.js decrypts it in browser memory.
- **Confirmed Decision 2 — Disguised Proxy Endpoint Paths**: Uses extensionless paths (`/api/zv-media-sync` and `/api/zv-sub-sync`) so filtering the Network tab by `.m3u8`, `.m3`, `.vtt`, or `.srt` reveals nothing.
- **Confirmed Decision 3 — Encrypted Subtitle Proxy & In-Memory Blob Cache**: Fetches subtitles once via `/api/zv-sub-sync`, decrypts them in memory into a `blob:` URL, and caches the Blob in browser RAM so raw subtitle links cannot be seen or shared externally and never re-request the Worker.
- **Confirmed Decision 4 — Cloudflare Free-Tier Quota Saver**: Removes the 2-minute `/api/stream-token` background polling loop for VODs and caches decrypted VOD playlists & subtitles in browser memory (`Map`), cutting Worker invocations by ~95% compared to current usage.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Hides `#EXTM3U` & Stream Links in DevTools**: Encrypts the HTTP response body of all proxied HLS playlists so inspecting the response in the Network tab only shows scrambled ciphertext (`ZV1.<salt>.<ciphertext>`) instead of `#EXTM3U`, `#EXT-X-STREAM-INF`, or segment URLs.
  2. **Disguises Stream & Subtitle Request URLs**: Replaces `.m3u8` and `.vtt` URLs with extensionless gateway endpoints (`/api/zv-media-sync` and `/api/zv-sub-sync`) so network filters for `.m3u8` or `.vtt` come up empty.
  3. **Protects Subtitles with One-Time Tokenized Proxy & Blob Decoding**: Routes episode subtitles through `/api/zv-sub-sync` once, decrypts them in memory, and converts them into cached `blob:` URLs inside the player.
  4. **Protects Cloudflare Worker Free Tier Quota**: Eliminates the 2-minute background token polling timer, keeps video segments 100% direct-to-CDN, and caches decrypted VOD sub-playlists in browser RAM.
- **Target Audience / Persona**: Authenticated Zone Vault members and administrators watching VOD concerts, Special Gift videos, and Live Streams across desktop and mobile browsers.
- **Key Value**: Maximum stream and subtitle link protection in DevTools with near-zero Cloudflare Worker request consumption.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Starting an Episode**: The viewer clicks an episode card. The player generates/acquires a 6-hour session ticket and requests `/api/zv-media-sync`. The encrypted response is decoded in memory by the custom HLS loader, cached in RAM, and video playback starts immediately.
  2. **Automatic Subtitle Loading & Switching**: When an episode has subtitles, the player fetches the encrypted subtitle payload once via `/api/zv-sub-sync`, decrypts the WebVTT text in memory, and binds a cached `blob:` URL to Artplayer. Switching subtitle tracks or seeking uses the in-memory `blob:` URL with zero network requests.
  3. **Blocked External Access**: Opening `/api/zv-media-sync` or `/api/zv-sub-sync` directly in a browser tab or external downloader immediately returns `403 Access Denied`.
- **Visual Identity & Theme**:
  - Preserves Zone Vault's dark cinema aesthetic (`#050505` / `#0a0a0c` backgrounds, glassmorphic cards, and custom Artplayer controls) with zero visual clutter or latency.
- **Interactive Feedback & Motion**:
  - Instant quality switching (`Auto`, `1080P`, `720P`, `480P`, etc.) and subtitle track toggling served straight from browser RAM cache after initial load.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Symmetric Stream Cipher (`ZV1`) with Per-Response Random Salt**
  - *Chosen Approach*: Each manifest and subtitle response is encrypted on the server/Worker using a fast symmetric XOR-stream cipher keyed by a shared player secret mixed with a per-response 8-byte random salt, encoded as `ZV1.<saltHex>.<base64UrlCiphertext>` and served with `Content-Type: application/octet-stream`.
  - *Why*: Takes less than 0.5ms of CPU time, completely hides `#EXTM3U` and `WEBVTT` in DevTools, and ensures every response looks different on the wire.
- **Decision 2: Removing 2-Minute Token Polling + Adding Browser RAM Caching for VODs**
  - *Chosen Approach*: Extend the signed stream token validity to 6 hours (21,600 seconds—covering the longest concert VODs) and remove the 2-minute `setInterval` polling loop. Additionally, cache decrypted VOD sub-playlists and `blob:` subtitle URLs in a JavaScript `Map` inside `video_player.js`.
  - *Why*: Previously, polling `/api/stream-token` every 2 minutes caused 60–90 extra Worker requests per concert, and ABR quality switches caused repeat sub-playlist fetches. Caching in RAM + removing polling drops Worker usage to just 3–4 requests per concert.
- **Decision 3: Native iOS Safari Fallback Compatibility**
  - *Chosen Approach*: `Hls.js` requests decrypt the `ZV1.` payload inside the custom `pLoader`. If an older iOS device without MSE support falls back to native `<video src="...">` playback (`native=1`), the gateway serves the rewritten manifest inline so playback never breaks.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Request Budget Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ZONE VAULT CLIENT (Browser RAM)                      │
│                                                                             │
│  ┌──────────────────────────────┐   ┌────────────────────────────────────┐  │
│  │   Artplayer + HLS.js         │   │   Subtitle Decrypt & Blob Cache    │  │
│  │  • In-Memory Playlist Cache  │   │  • Fetches /api/zv-sub-sync ONCE   │  │
│  │  • Decrypts ZV1 -> #EXTM3U   │   │  • Decrypts ZV1 -> WEBVTT in RAM   │  │
│  │  • 0 Polling / 0 Chunk Proxy │   │  • Caches blob:... URL in memory   │  │
│  └──────┬─────────────────┬─────┘   └─────────────────┬──────────────────┘  │
└─────────┼─────────────────┼───────────────────────────┼─────────────────────┘
          │                 │                           │
          │ 0 Worker Reqs   │ 2-3 Reqs ONCE per Play    │ 1 Req ONCE per Sub
          ▼ (Direct CDN)    ▼ (/api/zv-media-sync)      ▼ (/api/zv-sub-sync)
┌───────────────────┐  ┌──────────────────────────────────────────────────────┐
│  Upstream Media   │  │     ZONE VAULT GATEWAY (Express & Cloudflare Worker) │
│   CDN (.ts/.m4s)  │  │                                                      │
│                   │  │  • Origin / Referer Lock (zonevault.live)            │
│  Streams video    │  │  • Blocks IDM, yt-dlp, curl, extensions, Save-As     │
│  chunks directly  │  │  • Verifies 6-hour Signed JWT (zero polling needed)  │
│  to player        │  │  • Encrypts #EXTM3U & WEBVTT -> ZV1.<salt>.<cipher>  │
└───────────────────┘  └──────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping

1. **Zero-Polling Session Ticket (`/api/stream-token` & Client Fast-Sign)**:
   - Issues a 6-hour (`21600s`) token and returns `proxyUrl: "/api/zv-media-sync?token=<jwt>"`.
   - Removes the 2-minute `setInterval` token refresh loop in `video_player.js` so watching a concert generates **0 background Worker requests**.
2. **Encrypted Manifest Gateway (`/api/zv-media-sync` & legacy aliases)**:
   - Validates origin, anti-download headers, and JWT signature.
   - Rewrites internal master/variant `.m3u8` references to `/api/zv-media-sync?token=<jwt>&u=<base64Url>` while keeping `.ts`/`.m4s` media segments pointing directly to the CDN.
   - Encrypts the rewritten manifest string into `ZV1.<salt>.<ciphertext>` with `Content-Type: application/octet-stream`.
3. **Custom HLS Loader with In-Memory Playlist Cache (`ZoneVaultTokenLoader` & `LiveTokenLoader`)**:
   - Checks an in-memory `manifestCache` `Map` for VOD sub-playlists first (returning cached `#EXTM3U` immediately with 0 Worker requests if already loaded).
   - On network load, intercepts `callbacks.onSuccess`, decrypts `ZV1.` payloads in memory back to `#EXTM3U...`, caches VOD playlists in RAM, and passes the plaintext to HLS.js.
4. **Encrypted Subtitle Gateway (`/api/zv-sub-sync`) & Cached Blob Loader**:
   - Validates origin, anti-download headers, and JWT signature, fetches the upstream subtitle file once, and encrypts the response body with the `ZV1` cipher.
   - `initZoneVideoPlayer` in `/player/video_player.js` fetches `/api/zv-sub-sync`, decrypts the WebVTT text in memory, creates a cached `blob:` URL, and passes only the `blob:` URL to Artplayer.
