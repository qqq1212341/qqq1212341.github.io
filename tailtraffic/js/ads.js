"use strict";
/* 꼬리추월 — AdMob 수익엔진. 네이티브(Capacitor)에서만 동작, 웹/로컬은 전부 무동작(버튼 자동 숨김).
 *   • 보상형 ①: 게임오버 → "광고 보고 이어 달리기" (판당 1회, 꼬리 유지 — 최강 시청 동기)
 *   • 보상형 ②: 결과 화면 "코인 2배"
 *   • 전면: 스플래시 직후 1회는 스토어 빌드에서 네이티브 레이어가, 판 사이는 여기 정책이 —
 *           3판마다 + 첫 3판 금지 + 최소 120s 간격 + 이어달리기 직후 금지 (별점 테러 방지)
 * REAL 단위 ID는 AdMob 콘솔 발급 후 채우고 USE_TEST=false (store-deploy 단계).
 */
const ADS = (function () {
  // Google 공식 테스트 광고 단위 (실수익 X). 콘솔 발급 전까지 네이티브 QA용.
  const TEST = {
    interstitial: { android: "ca-app-pub-3940256099942544/1033173712", ios: "ca-app-pub-3940256099942544/4411468910" },
    rewarded:     { android: "ca-app-pub-3940256099942544/5224354917", ios: "ca-app-pub-3940256099942544/1712485313" },
  };
  // ▼ AdMob 콘솔 발급 실제 광고 단위 ID (발급 후 채움 — store-deploy 스킬이 처리)
  const REAL = {
    interstitial: { android: null, ios: null },
    rewarded:     { android: null, ios: null },
  };
  const USE_TEST = true;   // 콘솔 발급 후 false 로 (실ID 없으면 광고 미표시 안전장치)

  let plugin = null, platform = "web", ready = false, interstitialReady = false, rewardedReady = false;

  function detect() {
    try {
      const C = window.Capacitor;
      if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.AdMob) {
        plugin = C.Plugins.AdMob;
        platform = (C.getPlatform && C.getPlatform()) || "android";
        return true;
      }
    } catch (e) {}
    return false;
  }
  function unit(kind) {
    const key = platform === "ios" ? "ios" : "android";
    if (USE_TEST) return TEST[kind][key];
    return (REAL[kind] && REAL[kind][key]) || null;
  }
  function opts(kind) { const adId = unit(kind); return adId ? { adId, isTesting: USE_TEST } : null; }

  async function init() {
    if (!detect()) return;
    try {
      if (platform === "ios" && typeof plugin.requestTrackingAuthorization === "function") {
        try { await plugin.requestTrackingAuthorization(); } catch (e) {}
      }
      await plugin.initialize();
      ready = true; preloadInterstitial(); preloadRewarded();
    } catch (e) { console.warn("[ads] init 실패", e); }
  }
  async function preloadInterstitial() {
    if (!ready) return;
    const o = opts("interstitial"); if (!o) return;
    try { await plugin.prepareInterstitial(o); interstitialReady = true; } catch (e) { interstitialReady = false; }
  }
  async function preloadRewarded() {
    if (!ready) return;
    const o = opts("rewarded"); if (!o) return;
    try { await plugin.prepareRewardVideoAd(o); rewardedReady = true; } catch (e) { rewardedReady = false; }
  }

  function canRewarded() { return ready && rewardedReady; }

  /* 보상형 — done(성공여부). 시청 완료해야 true. */
  async function showRewarded(kind, done) {
    if (!canRewarded()) { done && done(false); return; }
    let rewarded = false;
    try {
      const off = plugin.addListener && plugin.addListener("onRewardedVideoAdReward", () => { rewarded = true; });
      await plugin.showRewardVideoAd();
      // 닫힘 이벤트 대기 없이 짧게 폴링 — 플러그인별 이벤트 편차 흡수
      await new Promise(r => setTimeout(r, 400));
      if (off && off.remove) try { off.remove(); } catch (e) {}
    } catch (e) { console.warn("[ads] rewarded 실패", e); }
    rewardedReady = false; preloadRewarded();
    if (typeof DGL !== "undefined" && rewarded) DGL.track("ad_rewarded", { type: kind });
    done && done(rewarded);
  }

  /* 전면 — 판 사이 정책 게이트를 통과할 때만. cb는 광고 유무와 무관하게 반드시 호출. */
  async function maybeInterstitial(cb, opts2) {
    const o = opts2 || {};
    const now = Date.now();
    const ok = ready && interstitialReady &&
      state.plays >= CONFIG.INTER_MIN_PLAYS &&
      state.runsSinceInter >= CONFIG.INTER_EVERY_RUNS &&
      (now - (state.lastInterAt || 0)) / 1000 >= CONFIG.INTER_MIN_GAP_S &&
      !o.skip;
    if (!ok) { cb && cb(); return; }
    try {
      state.runsSinceInter = 0; state.lastInterAt = now; saveState();
      await plugin.showInterstitial();
      if (typeof DGL !== "undefined") DGL.track("ad_interstitial", {});
    } catch (e) { console.warn("[ads] interstitial 실패", e); }
    interstitialReady = false; preloadInterstitial();
    cb && cb();
  }

  return { init, canRewarded, showRewarded, maybeInterstitial };
})();
