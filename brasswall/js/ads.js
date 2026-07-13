"use strict";
/* 탄피성벽 — AdMob 수익엔진 (monetize 단계). 네이티브(Capacitor)에서만 동작, 웹/로컬은 전부 무동작.
 *   • 보상형(메인 BM, PRD §11.2): 사망 부활 · 결과 황동 2배 (자발적 선택, 흐름 무중단 폴백)
 *   • 전면광고: N판마다 1회 저빈도 (초반 세션 최소화 — 리텐션 보호)
 * 실제 단위 ID는 AdMob 콘솔 발급 후 REAL 채우고 USE_TEST=false 유지(실ID 비면 광고 미표시 = 안전).
 * 웹 포털(CrazyGames/Poki) 배포 시엔 이 ADS 객체만 포털 SDK 어댑터로 교체(인터페이스 동일).
 */
const ADS = (function () {
  // Google 공식 테스트 광고 단위 (실수익 X). 콘솔 발급 ID로 교체 전까지.
  const TEST = {
    interstitial: { android: "ca-app-pub-3940256099942544/1033173712", ios: "ca-app-pub-3940256099942544/4411468910" },
    rewarded:     { android: "ca-app-pub-3940256099942544/5224354917", ios: "ca-app-pub-3940256099942544/1712485313" },
  };
  // ▼ AdMob 콘솔(pub-6403397417096706) 발급 후 채운다 — 앱 등록 시 app/admob.config.json 도 함께.
  const REAL = {
    interstitial: { android: null, ios: null },
    rewarded:     { android: null, ios: null },
  };
  const USE_TEST = false;              // 실ID 발급 전: unit()=null → 광고 미표시(테스트광고 프로덕션 노출 방지)
  const INTERSTITIAL_EVERY_N_RUNS = 3; // N판마다 전면 1회 (PRD §11.2 저빈도, 0=끔)
  const INTERSTITIAL_MIN_PLAYS = 4;    // 첫 세션 보호 — 이 판수 전엔 전면 없음

  let plugin = null, platform = "web", ready = false, interstitialReady = false;

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
    if (!detect()) return;             // 웹/로컬 → 조용히 무동작
    try {
      if (platform === "ios" && typeof plugin.requestTrackingAuthorization === "function") {
        try { await plugin.requestTrackingAuthorization(); } catch (e) {}
      }
      await plugin.initialize();
      ready = true; preloadInterstitial();
    } catch (e) { console.warn("[ads] init 실패", e); }
  }
  async function preloadInterstitial() {
    if (!ready) return;
    const o = opts("interstitial"); if (!o) return;
    try { await plugin.prepareInterstitial(o); interstitialReady = true; }
    catch (e) { interstitialReady = false; }
  }
  // 전면 — 흐름을 막지 않게 항상 resolve.
  async function showInterstitial() {
    if (!ready) return false;
    const o = opts("interstitial"); if (!o) return false;
    try {
      if (!interstitialReady) await plugin.prepareInterstitial(o);
      await plugin.showInterstitial();
      if (typeof DGL !== "undefined") DGL.track("ad_interstitial", {});
      interstitialReady = false; preloadInterstitial();
      return true;
    } catch (e) { console.warn("[ads] interstitial", e); preloadInterstitial(); return false; }
  }
  // 판 전환 시 N판마다 한 번 (plays = 누적 판수)
  async function runTransition(plays) {
    if (!ready || INTERSTITIAL_EVERY_N_RUNS <= 0) return;
    if (plays >= INTERSTITIAL_MIN_PLAYS && plays % INTERSTITIAL_EVERY_N_RUNS === 0) await showInterstitial();
  }
  // 보상형 — 완주 시에만 true(보상 지급). 웹·취소·실패 = false.
  async function showRewarded() {
    if (!ready) return false;
    const o = opts("rewarded"); if (!o) return false;
    try {
      await plugin.prepareRewardVideoAd(o);
      const item = await plugin.showRewardVideoAd();
      if (typeof DGL !== "undefined") DGL.track("ad_rewarded", { result: item ? "watched" : "skipped" });
      return !!item;
    } catch (e) { console.warn("[ads] rewarded", e); return false; }
  }
  return {
    init,
    available: () => ready && !!unit("rewarded"),
    showInterstitial, runTransition, showRewarded,
  };
})();

// game.js 가드(window.ADS && …)가 보는 전역 — const 는 window 에 안 붙는다(실스모크에서 확인된 함정)
window.ADS = ADS;
