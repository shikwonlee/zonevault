# Ephemeral Stream Token Protection & Domain Lock (2021–2026 Video Pages)

Implement secure backend stream tokenization and strict domain-locked proxying for all Zone Vault concert and episode video pages from 2021 through 2026, with user identity embedding in stream tokens and an improved manual-dismiss access modal.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following revisions have been incorporated based on your direct feedback:
> - **Token Identity Enrichment**: In `/api/stream-token`, signed tokens now explicitly include the user's `role` (`admin` or `member`), `uid`, and `name` (display name/username).
> - **Unapproved Member Modal with User Info**: The access denied modal displayed to unapproved members now prominently shows their **Username** and **UID**, allowing them to verify their account identity or share their UID with admins for approval.
> - **Removal of Auto-Redirect Countdown**: The 3-second automatic redirect timer is removed. The modal remains on screen until the user manually clicks the **"Back to Videos"** button, preventing unwanted auto-navigation and allowing users to copy their UID or review instructions.
> - **Token Protection Mode**: Full stream proxy (`/api/stream-proxy.m3u8`) with signed ephemeral tokens (`/api/stream-token`) and strict domain validation (`zonevault.live`).
> - **Visual Playback**: No visual watermark on the video canvas; stream security is enforced cryptographically at the server gateway.
> - **Target Scope**: Universal coverage across all concert, documentary, and tour episode pages in `2021`, `2024`, `2025`, and `2026`.

---

### 1. Overview & Core Concept

Zone Vault hosts exclusive, private concerts and episodic VOD content for authorized community members. This upgrade secures playback against unauthorized ripping, direct stream URL sharing in external players (such as VLC), and domain spoofing:

1. **Domain Lock (`zonevault.live`)**: The backend streaming proxy enforces trusted browser `Origin` and `Referer` headers, immediately returning `403 Forbidden` to external media players, scraper tools, and third-party embeds.
2. **Identity-Enriched Stream Handshake**: Before playback begins, the player contacts `/api/stream-token` providing the user's authentication credentials. The server creates an HMAC-SHA256 signed ticket containing the episode ID, user UID, user display name, role (`admin` vs `member`), client IP fingerprint, and a 60-second initiation expiry window.
3. **Manual Access Modal**: When an unauthenticated visitor or unapproved member visits a restricted page, they see their **Username**, **UID**, and permission status in a dark glass modal with a manual **"Back to Videos"** button instead of an automatic redirect.

---

### 2. User Experience & Interaction Flow

- **Authorized Member Playback**:
  - The viewer selects an episode or concert.
  - The client obtains a signed token with the user's UID, name, and role, mounting the stream via `/api/stream-proxy.m3u8?token=...`.
  - Playback starts immediately with adaptive bitrate switching (1080P, 720P, 480P), chapter markers, and watch history tracking.
- **Unapproved or Restricted Member Flow**:
  - When an account does not have permission for a specific page, a clean, styled modal appears:
    ```
    🚫 Access Restricted
    This content requires approved access.

    Account Details:
    • Username: [User Display Name]
    • UID: [User UID]
    • Status: Pending Approval / Member

    [ Back to Videos ]
    ```
  - **No Auto-Redirect**: The page does **not** count down or navigate away automatically; the user can freely read the message, copy their UID, or click "Back to Videos" when ready.
- **External / Unauthorized Attempt**:
  - Direct links opened in VLC, curl, or external websites receive an immediate `403 Forbidden` from the server.

---

### 3. Key Technical Decisions & Trade-Offs

- **Token Payload Structure**:
  - *Chosen Approach*: Include `epId`, `uid`, `name`, `role`, `expiresAt`, `clientIp`, and `targetUrl` in the signed base64 payload.
  - *Why*: Allows the backend to verify the exact user identity and role directly from the token signature without database bottlenecks during media streaming.
- **Client Access Control Architecture**:
  - *Chosen Approach*: Unify modal rendering in video pages and `/player/video_player.js` with structured user info and manual navigation handler `goBackSafe()`.
  - *Why*: Replaces legacy 3-second auto-redirect timers with a persistent, informative modal while maintaining standard styling across all 2021–2026 pages.

---

### 4. Technical Architecture & Component Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ZONE VAULT VIDEO PAGE                           │
│               (/2021/..., /2024/..., /2025/..., /2026/...)             │
│                                                                        │
│   [Permission Check]                                                   │
│   ├── If Unauthorized ──► Show Persistent Modal                        │
│   │                       - Displays: Username & UID                   │
│   │                       - Action: Manual "Back to Videos" click      │
│   └── If Authorized   ──► Proceed to Token Handshake                   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
              1. Request Handshake │ Headers: Origin: zonevault.live
                 Bearer ID Token   │ Payload: { epId, uid, name, role }
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    EXPRESS BACKEND (/server.js)                        │
│                                                                        │
│   [POST /api/stream-token]                                             │
│   ├── Check Origin/Referer (zonevault.live or dev runtime)             │
│   ├── Validate user UID, name, role                                    │
│   └── Sign HMAC-SHA256 token { epId, uid, name, role, expiresAt }      │
│                                                                        │
│   [GET /api/stream-proxy.m3u8?token=...]                               │
│   ├── Verify signature, timestamp, and domain origin                   │
│   ├── Fetch upstream master manifest (Mux / Cloudflare)                │
│   └── Rewrite relative child playlists & return HLS manifest           │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
              2. Mount Player with │ Proxied M3U8 URL
                 Clean Handshake   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      ARTPLAYER + HLS.JS ENGINE                         │
│   - Uninterrupted adaptive bitrate streaming (Auto / 1080P / 720P)     │
│   - Watch history persisted to Firebase Realtime Database              │
│   - Full gesture controls, auto-resume, and skip intro capabilities    │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 5. Implementation & Scope Checklist

1. **Backend Server (`/server.js`)**:
   - Update `/api/stream-token` to accept and embed `name` and `role` (`admin` or `member`) alongside `uid` and `epId` in the signed payload.
   - Update `/api/verify-stream-token` to return verified `uid`, `name`, and `role`.
   - Maintain strict `Origin` and `Referer` checks locked to `zonevault.live` (with dev/preview environment support).
   - Ensure `/api/stream-proxy.m3u8` rewrites playlists smoothly with CORS headers.

2. **Video Player Module (`/player/video_player.js`)**:
   - Update `initZoneVideoPlayer` to pass the user's `displayName` / username and `role` to `/api/stream-token`.
   - Ensure clean error handling if tokens expire or verification fails.

3. **2021–2026 Video Pages (`showAccessDeniedModal`)**:
   - Update the access denied modal across video pages:
     - Display the authenticated user's username/email and UID.
     - Remove the `redirectTimer` interval and automatic 3-second redirect.
     - Add a prominent **"Back to Videos"** button with a direct link to `https://zonevault.live/videos` (or local fallback `/videos`).
   - Covered folders and files:
     - **2021**: `inthesoop2-N12X5R25-74K2.html`
     - **2024**: `8th_caratland.html`, `magichour.html`, `rightheregoyang.html`
     - **2025**: `9th_caratland.html`, `fukuokanewtour.html`, `hxwfanconcert.html`, `hxwingwangju.html`, `japannewtour.html`, `nanabnb.html`, `newtour.html`, `ourchapterS17N-111025-6B4.html`, `svtholiday.html`, `svtreaming1.html`, `the-shadows-edge.html`
     - **2026**: `cxm_in_incheon.html`, `cxminjapan.html`, `dinoxpicheolin.html`, `dxs_on_stage.html`, `jxj_into_dreaming.html`, `new_encore.html`, `svt_2026_fanmeeting_yakusoku.html`, `svt_in_carat_land_2026.html`, `svtreaming_2026.html`, `vernon_the8_v8.html`

4. **Verification & Testing**:
   - Verify server compilation (`compile_applet`).
   - Verify external curl / VLC requests without `zonevault.live` origin are blocked with `403`.
   - Verify that unapproved accounts display the non-auto-redirecting modal with accurate UID and username.
   - Verify that approved members and admins stream smoothly.
