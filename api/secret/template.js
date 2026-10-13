// ========================================================
// Zone Vault — Page Config Template (api/secret/template.js)
// I-copy ito papunta sa iyong folder (halimbawa: 2026/js/my_concert.js)
// ========================================================

ZonePlayer.init({
  // 1. pageId: Optional permission identifier sa Firebase RTDB (page_access/<pageId>/<uid>)
  // Kung pampubliko/walang restricted ticket, iwanang blangko ""
  pageId: "",

  // 2. dbNode: Ang pangalan ng node sa Firebase Realtime Database kung nasaan ang m3u8 url
  // Halimbawa: "caratland2026", "urlnewtour", "inthesoop2"
  dbNode: "my_database_node",

  // 3. playlist: Listahan ng episodes / concert parts
  playlist: [
    {
      id: "1",
      title: "DAY 1 - Concert / Episode Name",
      image: "https://your-poster-image-url.png",
      introEnd: 0 // (Optional) Ilang segundo ang intro para sa Skip Intro button
    },
    {
      id: "2",
      title: "DAY 2 - Concert / Episode Name",
      image: "https://your-poster-image-url.png",
      introEnd: 0
    }
  ]
});
