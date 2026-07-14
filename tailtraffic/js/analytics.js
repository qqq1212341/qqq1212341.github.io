"use strict";
/* Dumb Game Lab — 트래킹/애널리틱스 (web-capacitor 게임 공용 / 드롭인)
 *
 * 플레이어 *행동* 데이터(세션·진행도·이탈·수익·리텐션)를 수집한다.
 * 그로스(9단계) '진단 렌즈' — 손님(플레이어)이 어디서 이탈하나? — 의 데이터 소스.
 * splash.js 와 동일한 "복사 한 번이면 끝" 드롭인. 의존성 0, <head>에서 splash.js 다음 로드.
 *
 * 왜 GA4(gtag)인가 (부업 = 무료·무네이티브설정 우선):
 *   • 무료(이벤트 무제한) · <script> 한 줄 → 웹 라이브 + 앱 WebView 를 한 파일로 커버.
 *   • 벤더 중립 래퍼: 게임 코드는 DGL.track(name, params) 만 부른다. 어댑터(_send)만
 *     갈아끼우면 Firebase/기타로 이전 1함수. (부업 커지면 Firebase=유저당 광고매출·Crashlytics)
 *
 * 설치(게임마다):
 *   1) 이 파일을 게임 prototype/js/ 에 복사.
 *   2) index.html <head> 의 splash.js 바로 다음에 <script src="js/analytics.js"></script>.
 *   3) 아래 MEASUREMENT_ID 를 그 게임의 GA4 측정 ID(G-XXXXXXXXXX)로 교체.
 *      analytics.google.com → 관리 → 데이터 스트림 → 웹 스트림 만들기 → 측정 ID 복사.
 *   4) 게임 이벤트 지점에 DGL.track('event_name', {...}) 삽입 (가드: typeof DGL!=='undefined').
 *
 * MEASUREMENT_ID 가 비어(placeholder)면: gtag 미주입 + DGL.track 은 콘솔 로그만(무해) →
 * ID 채우기 전에도 빌드/배포 안전, 이벤트 발화는 콘솔(?dglDebug=1)·네트워크 탭으로 검증 가능.
 * 한 페이지 1회 초기화 가드.
 */
(function () {
  if (window.DGL && window.DGL.__ready) return;

  // ▼▼▼ 게임별로 채운다 ▼▼▼ ────────────────────────────────────
  var MEASUREMENT_ID = 'G-07WLGFMQDD';   // DGL 공용 GA4 (전 게임 공유, game=슬러그로 구분)
  var GAME = 'tailtraffic';               // 게임 슬러그 — 모든 이벤트에 game= 로 부착(여러 게임 한 GA4 구분)
  // ▲▲▲ ────────────────────────────────────────────────────────

  // placeholder('G-XXXX…') 이면 미설정으로 간주 → 네트워크 태그 미주입, 콘솔 로그만.
  var configured = !!MEASUREMENT_ID && MEASUREMENT_ID.indexOf('G-XXXX') !== 0;
  // 로컬/명시(?dglDebug=1) = 콘솔 디버그 + GA4 DebugView.
  // ★ Capacitor 네이티브 앱은 hostname 이 'localhost'로 서빙됨 → hostname 만 보면 스토어 빌드의 모든 이벤트가
  //   debug_mode:true 로 찍혀 일반 리포트에서 빠진다. 네이티브(detectPlatform!=='web')는 명시 플래그일 때만 DEBUG.
  var DEBUG = /[?&]dglDebug=1/.test(location.search) ||
              (detectPlatform() === 'web' &&
               ['localhost', '127.0.0.1', '[::1]', ''].indexOf(location.hostname) >= 0);

  // 플랫폼 감지 (ads.js 와 동일 패턴) — 이벤트에 platform= 부착(web / ios / android)
  function detectPlatform() {
    try {
      var C = window.Capacitor;
      if (C && C.isNativePlatform && C.isNativePlatform()) return (C.getPlatform && C.getPlatform()) || 'app';
    } catch (e) {}
    return 'web';
  }
  var PLATFORM = detectPlatform();
  // 세션 ID — 이번 실행 1개. 세션 단위 묶음/디버깅용.
  var SESSION = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

  // ── gtag 부트스트랩 (configured 일 때만 네트워크 태그 주입) ──
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  if (configured) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    (document.head || document.documentElement).appendChild(s);
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, { debug_mode: DEBUG, send_page_view: true });
  }

  // ── 벤더 중립 어댑터 ── 트래커 이전 = 이 함수 1개만 교체.
  // 네이티브(앱) = Firebase Analytics 플러그인(first_open·리텐션·AdMob수익은 SDK가 자동) / 웹 = gtag.
  // GA/Firebase 단일 소스: 웹 스트림 + iOS/Android 앱 스트림이 같은 GA4 속성(542222163)으로 모임.
  function _send(name, params) {
    // 네이티브: Firebase Analytics.logEvent (예약어 session_start/first_open은 SDK가 자동수집 → 중복 방지 위해 스킵)
    try {
      var C = window.Capacitor;
      if (C && C.isNativePlatform && C.isNativePlatform()) {
        if (name === 'session_start' || name === 'first_open') return;   // Firebase 자동수집
        var FA = C.Plugins && C.Plugins.FirebaseAnalytics;
        if (FA && FA.logEvent) { FA.logEvent({ name: name, params: params || {} }); }
        return;
      }
    } catch (e) {}
    // 웹: gtag
    if (configured) { try { gtag('event', name, params); } catch (e) {} }
  }

  // 모든 이벤트에 game/platform/session 자동 부착.
  function track(name, params) {
    var p = params || {};
    p.game = GAME; p.platform = PLATFORM; p.session_id = SESSION;
    if (DEBUG) { try { console.debug('[DGL.track]', name, p); } catch (e) {} }
    _send(name, p);
  }

  window.DGL = window.DGL || {};
  window.DGL.track = track;
  window.DGL.configured = configured;
  window.DGL.__ready = true;

  // ── 자동 이벤트: 앱 열림/닫힘 (GA4 예약어 session_start 와 충돌 피해 app_* 사용) ──
  track('app_open', {});
  var _closed = false;
  window.addEventListener('pagehide', function () {
    if (_closed) return; _closed = true;
    track('app_close', {});
  });

  if (!configured) {
    try { console.info('[DGL] analytics 준비됨 — 측정 ID 미설정(콘솔 로그만). MEASUREMENT_ID 채우면 GA4 전송 시작.'); } catch (e) {}
  }
})();
