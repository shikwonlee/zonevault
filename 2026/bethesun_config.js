/**
 * ============================================================================
 * ZONE VAULT — Encrypted Media Configuration for SEVENTEEN <BE THE SUN>
 * Location: /2026/bethesun_config.js
 *
 * SECURITY NOTE:
 * 1. All stream (.m3u8) and subtitle (.vtt) links below are ZV1-encrypted so no
 *    raw Mux or Cloudinary links exist in this file.
 * 2. You can also paste normal "https://..." links if you ever update a card;
 *    the server/worker automatically ZV1-encrypts the entire file payload over
 *    the network via /api/zv-vault-sync and blocks direct access to this file.
 * ============================================================================
 */

(function () {
  'use strict';

  const BETHESUN_THUMBNAIL = "https://res.cloudinary.com/sanuqblh/image/upload/v1793851172/03e68a354749c45a891071b13f659608_yj7ysf.png";

  const BETHESUN_VIDEOS = [
    {
      id: "1",
      title: "[FULL STAGE] TOUR-ING : SEVENTEEN <BE THE SUN>",
      url: "ZV1.3b3a673d4b673191.AzIWbZb_gakecQcz1v_A_xUhfVJzlbn3pQIWVnTInYe4b052L6PWrIMIfWwex8PD6WETDzJpo5faoxhBKAPPyJn3HRIPbtm73A",
      subtitle: "ZV1.a5501b53f3530203.AzIWbZb_gakfYAZ41P6B5wQwPVBugbja_wVwQGbXrcbqRiZUKt3th6lLLRox07yG4ARcfEA5wOKEpVx5AjDJ4Y_1AAhGeomj1_pAIFl1",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "2",
      title: "[3 CITY MIX] TOUR-ING : SEVENTEEN <BE THE SUN>",
      url: "ZV1.65e3245525ff8464.AzIWbZb_gakecQcz1v_A_xUhfVJzlbnwxC4cY3TcjvTla30hevapz6xZXTxyu_-yhkYGPT18lqvr_CdKUTTPyLDTBXlMMJ_2",
      subtitle: "ZV1.1234c7f341602323.AzIWbZb_gakfYAZ41P6B5wQwPVBugbja_wVwQGbXrcbqRnZTLNm_0vpLfxgy0L6H4gRcfEI9wuCMrFwqU3aS4p62WXoXYN3_ybpfM0ksyLnP5KsQbV9wn-vf9BE2VXOPstXrBGQOcMH1lbFZdzY03MyjodEfNWh2lLWK5RkgZHSS8d36DjgMLM4",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "3",
      title: "[TO CARAT] HIPHOP TEAM",
      url: "ZV1.76a5dffc02681a99.AzIWbZb_gakecQcz1v_A_xUhfVJzlbmMoFkdAlPTkP_dHE4BRs62meYNVC0w1vjxnncqeEJWw-HSwBJ-Ui3j1JTzCR9WLYf9kbM",
      subtitle: "ZV1.cd6d5113569dc095.AzIWbZb_gakfYAZ41P6B5wQwPVBugbja_wVwQGbXrcbqRiQFKYnp1K1Lfh89hO-E6QJcfEA5wOKEoFxPKBvixa7BOghpSrqGq9sxAmhAvNDI5_NRLgFjiPid",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "4",
      title: "[TO CARAT] VOCAL TEAM",
      url: "ZV1.5ba87e8e8abf693d.AzIWbZb_gakecQcz1v_A_xUhfVJzlbmA2yw5Clbx6IbrHmIUdMb47IldLhBr0qezgyBXOkk2nuTo0yksFX3gwI22GzNwLYf9kbM",
      subtitle: "ZV1.9f9587be47f3ba5c.AzIWbZb_gakfYAZ41P6B5wQwPVBugbja_wVwQGbXrcbqRn4HJtjk0v4dfx5i0-7V5VRcfEA5wOKFplxPKBvixa7BOgh3TKmPqNQ6E2xMrufP4bJJahQ02_U",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "5",
      title: "[TO CARAT] PERFORMANCE TEAM",
      url: "ZV1.1246df2d2ad7370a.AzIWbZb_gakecQcz1v_A_xUhfVJzlbnL_gUXWEX1mYe4Q38bKvi-w48HQ252xPuHklY1eQI3vqCF8zB_NgHLt6nxL3lMMJ_2",
      subtitle: "ZV1.c894412a9a05a806.AzIWbZb_gakfYAZ41P6B5wQwPVBugbja_wVwQGbXrcbqRiRZJtno1K4Zckg01e2M4AFcfEE-y-KJpFxPKBvixa7BOghxRriIq9kjF2NCtND-wMdpAQU2wviGtll6QTc",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "6",
      title: "[BE THE CARAT] SPECIAL STAGE MIX - 아주 NICE",
      url: "ZV1.f16ec9a3ad121bab.AzIWbZb_gakecQcz1v_A_xUhfVJzlbn-xyNvAUCMqv3HawpGOt6AltFILhYaxavD9DgzITpsvZ3e1Rd_NXb474rCK3lMMJ_2",
      subtitle: "ZV1.7a9694909747c1a8.AzIWbZb_gakfYAZ41P6B5wQwPVBugbja_wVwQGbXrcbqRnAAJtvl0aVIch4w1--FsQ9cfEE-y-eIrVxZIhv1zLnfLRZzQr6Rt9srFWRAvdD50cdjT2IP5diz43kpJgSA69SrDmMfA7rk4LFPAyoO_Nq1t9EVJ0Z8ir3U4wgw",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "7",
      title: "[BE THE CARAT] SPECIAL STAGE MIX - WORLD ",
      url: "ZV1.1a29506fbd189c6a.AzIWbZb_gakecQcz1v_A_xUhfVJzlbnc4S4NeVPegeDdT1tWCPzryu9bAEcaivzxnBFWfzh_kaXk-wdTKCzw1abFGXlMMJ_2",
      subtitle: "ZV1.7e3f0d32a6622dae.AzIWbZb_gakfYAZ41P6B5wQwPVBugbja_wVwQGbXrcbqRnAELIvsga9KKh8y0r7QsVJcfEE9w-WFoVxZIhv1zLnfLRZzQr6Rt9srFWRAvdD50cdjT2YFtdHj6XsDLRfsx-v5AWZUdZXv1_Ye",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "8",
      title: "[WITH CARAT] Snap Shoot Freestyle with CARAT",
      url: "ZV1.43ac8973b28a313f.AzIWbZb_gakecQcz1v_A_xUhfVJzlbnd1BlvAUjer93pTnBOOb_ftJ1-ATsF1PeVpS8QLzw6wOSIpgktAR6ZsoTXHXlMMJ_2",
      subtitle: "ZV1.49ec024800aea049.AzIWbZb_gakfYAZ41P6B5wQwPVBugbja_wVwQGbXrcbqRnNYeo7s16hAexllhe2E5A5cfEE9wuGOplxMLhDp27_BPBZ1XLmghfsxBUVunvv1w_RBbBZqgOWPnFlsEHqok6GJdgNlNYms1-UGbx8lxg",
      image: BETHESUN_THUMBNAIL
    },
    {
      id: "9",
      title: "[WITH CARAT] SEVENTEEN with CARAT",
      url: "ZV1.0a24f23130f315e5.AzIWbZb_gakecQcz1v_A_xUhfVJzlbmM_xoUSmn8isHlSSxcKsKsn4hvQiF70_q44GcXcSM_w7yIwTt1MHLNworQDXlMMJ_2",
      subtitle: "ZV1.5fe107c9a398888b.AzIWbZb_gakfYAZ41P6B5wQwPVBugbja_wVwQGbXrcbqRnIHetzs0v9BKho92LSM6FVcfEE9weKPpFxMLhDp27_BPBZ1XLmLss4gAmhEv9Dd7PJMV3lf-ci7y1Y9DnLA_cahGCM",
      image: BETHESUN_THUMBNAIL
    }
  ];

  // Store inside a non-enumerable vault accessor so external scripts cannot easily dump it
  Object.defineProperty(window, '__ZV_BETHESUN_VAULT__', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: {
      thumbnail: BETHESUN_THUMBNAIL,
      getPlaylistMeta: function () {
        return BETHESUN_VIDEOS.map(function (item, idx) {
          return {
            id: String(item.id || (idx + 1)),
            title: item.title || "",
            image: item.image || BETHESUN_THUMBNAIL,
            introEnd: item.introEnd || 0
          };
        });
      },
      getMediaById: function (epId) {
        const found = BETHESUN_VIDEOS.find(function (item) {
          return String(item.id) === String(epId);
        });
        if (!found) return null;
        const decrypt = (window.ZoneVaultStream && typeof window.ZoneVaultStream.decryptPayload === 'function')
          ? function (v) { return window.ZoneVaultStream.decryptPayload(v); }
          : function (v) { return v; };
        return {
          id: String(found.id),
          title: found.title || "",
          url: decrypt(found.url || ""),
          subtitle: decrypt(found.subtitle || ""),
          image: found.image || BETHESUN_THUMBNAIL,
          introEnd: found.introEnd || 0
        };
      }
    }
  });
})();
