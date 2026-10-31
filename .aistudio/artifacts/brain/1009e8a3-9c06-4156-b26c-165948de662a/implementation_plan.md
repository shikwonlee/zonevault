# Implementation Plan: Domain Lock (`zonevault.live`) & Ephemeral Stream Token Protection

Secure Zone Vault streaming with strict Origin/Referer verification locked to `zonevault.live` (with dev/preview fallbacks), an ephemeral session handshake token system, and zero disruption to member or admin permissions.

---

## 1. Security Architecture & Threat Prevention

### Objectives
1. **Zero-Second External Blocking**: Requests from VLC, external media players, or unauthorized websites are instantly blocked with `403 Forbidden`.
2. **Domain Origin Lock**: The backend enforces that stream requests originate from `zonevault.live` (or trusted AI Studio preview domains during development).
3. **Short-Lived Handshake Tokens**: Ephemeral signed session tokens (HMAC SHA-256) validate stream initiation; once active, playback continues uninterrupted for the viewer.
4. **100% Role & Account Preservation**: Admins, members, and specific page permissions (`free_access`, `members_access`, `page_access`) remain completely intact.

---

## 2. Server Implementation (`server.js`)

1. **Token Generation Endpoint (`/api/stream-token`)**:
   - Validates client `Origin` / `Referer`:
     - Production: `zonevault.live` (and `*.zonevault.live`).
     - Development: `localhost`, `127.0.0.1`, `*.run.app`, `*.ai.studio`.
   - Requires Firebase ID token or authenticated session header.
   - Signs an ephemeral payload containing:
     - Episode ID & stream target.
     - User UID and IP address fingerprint.
     - Handshake timestamp and expiration (60-second initiation window).
   - Returns the signed session token to the player.

2. **Stream Gateway / Referral Validator (`/api/verify-stream`)**:
   - Verifies the incoming HMAC signature, timestamp, and domain referer.
   - Blocks any attempt to access the stream outside the allowed browser context.

---

## 3. Client Video Player Integration (`/player/video_player.js`)

1. **Transparent Handshake**:
   - Before mounting `Artplayer`, `initZoneVideoPlayer` requests a signed stream ticket from `/api/stream-token`.
   - Attaches the session credential so HLS.js establishes the media pipeline smoothly.
2. **Session Persistence**:
   - Viewer experiences continuous playback for the entire duration of the concert or episode without interruptions.
3. **Anti-Leak Watermarking**:
   - Displays a subtle, low-opacity drifting watermark containing the authenticated user's ID or email inside the video container, deterring screen-recording re-uploads.

---

## 4. Verification & Safety Guardrails

1. **Account Parity**:
   - Verify `admin` role bypass continues to work across all pages.
   - Verify `member` and `page_access` permissions function without changes.
2. **External Request Blocking Test**:
   - Simulate a direct curl or VLC request without a `zonevault.live` Referer; verify it receives an instant `403 Forbidden`.
3. **Playback Continuity**:
   - Verify uninterrupted HLS playback, quality resolution switching, seek gestures, and watch history synchronization.
4. **Build & Dev Server Check**:
   - Run `compile_applet` and restart dev server to confirm stability.
