# Zone Vault — Developer Guide: Paano Mag-Add ng Bagong Video/Concert Page

Ang player code at m3u8 stream resolution ay naka-centralize na sa `/api/secret/` folder upang hindi na kailangang ulitin ang 500+ lines ng Firebase at player code sa bawat page.

---

### Step-by-Step Template: Paano Mag-Add ng Bagong Page

May ready-made files ka na sa `/api/secret/`:
- `api/secret/template.html` (Pwede mong i-duplicate directly)
- `api/secret/template.js` (Config blueprint)

Kapag nag-dagdag ka ng bagong concert page (halimbawa: `2026/my_concert.html`):

#### 1. Gumawa ng HTML file (`2026/my_concert.html`):
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Concert Title | Zone Vault</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

  <!-- Firebase Compat Scripts -->
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script> 
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>

  <!-- Player Libraries -->
  <script src="https://cdn.jsdelivr.net/npm/artplayer/dist/artplayer.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>

  <!-- CSS: Nasa top-left na ang Back button -->
  <!-- Player CSS -->
  <link rel="stylesheet" href="css/player.css">
</head>
<body>

  <div id="adminToast" class="admin-toast">
    <i class="fas fa-shield-alt"></i> You are using ADMIN ACCOUNT
  </div>

  <div class="main-layout">
    <div class="video-wrapper-left">
      <!-- Back to Video Button (Directly above the player, not floating) -->
      <a href="/videos" class="back-to-video-btn">
        <i class="fas fa-arrow-left"></i> Back to Video
      </a>

      <div id="poster-container">
        <div id="poster-overlay">Play Episode</div>
      </div>
      <div id="player-container">
        <div id="artplayer" class="art-video-player"></div>
        <div id="click-catcher" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:10; cursor:pointer;"></div>
        <div class="gesture-overlay">
          <div id="icon-rewind" class="gesture-icon" style="left: 20%;"><span>-10s</span></div>
          <div id="icon-forward" class="gesture-icon" style="left: 80%;"><span>+10s</span></div>
          <div id="icon-play" class="gesture-icon" style="left: 50%;"></div>
          <div id="icon-pause" class="gesture-icon" style="left: 50%;"></div>
        </div>
      </div>

      <div class="title-box">
        <div class="current-episode-label">Now Playing</div>
        <h2 id="main-title"></h2>
      </div>
    </div>

    <div id="playlist">
      <div class="playlist-card">
        <div class="playlist-header">Episodes</div>
        <div id="playlist-items"></div>
      </div>
    </div>
  </div>

  <!-- LOAD THE CENTRALIZED PLAYER ENGINE -->
  <script src="/api/secret/player-core.js"></script>
  <script src="js/my_concert.js"></script>
</body>
</html>
```

#### 2. Gumawa ng JS file (`2026/js/my_concert.js`):
Napakadali na lang nito! 15 lines na lang ang kailangan:
```javascript
ZonePlayer.init({
  pageId: "my_permission_id", // permission key sa page_access (Firebase)
  dbNode: "my_database_node", // Realtime database node kung nasaan ang m3u8 url
  playlist: [
    {
      id: "1",
      title: "DAY 1 - Concert Name",
      image: "https://your-poster-url.jpg",
      introEnd: 0
    },
    {
      id: "2",
      title: "DAY 2 - Concert Name",
      image: "https://your-poster-url.jpg",
      introEnd: 0
    }
  ]
});
```

---

### Paano Gumagana ang Security ng M3U8:
1. Kapag nag-click ng episode ang user, tinatawag ng `ZonePlayer` ang endpoint na `/api/secret/video-stream?node=...&ep=...`.
2. Ang server (Express) ang kumukuha ng m3u8 link at subtitles mula sa Firebase Realtime Database.
3. Protektado ito ng rate-limiting at anti-caching headers (`private, no-cache, no-store`).
4. Kung offline o may network error, may automatic graceful fallback ito sa direct database query para siguradong hindi magfe-fail ang playback.
