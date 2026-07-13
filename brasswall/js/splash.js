"use strict";
/* Dumb Game Lab — 스튜디오 스플래시 (web-capacitor 게임 공용 / 드롭인)
 *
 * 게임 부팅 시 "Dumb Game Lab" 로고 + splash.mp3 1회 재생 → 페이드 후 자체 제거.
 * Unity의 SplashBootstrap.cs(슬라임 시뮬레이터)와 동일 역할의 웹 버전.
 *
 * 에셋 (둘 다 없어도 안전 — 가능한 것만 보여줌):
 *   assets/dgl-splash.png        로고 (정사각, studio/brand/splash/DumbGameLab.png)
 *   assets/audio/dgl-splash.mp3  스튜디오 사인 사운드 (studio/brand/splash/splash.mp3)
 *
 * 다른 DGL 웹게임에 그대로 복사 가능 — 의존성 0, <head>에서 가장 먼저 로드.
 * 매 실행마다 1회 노출(세이브 안 함). 한 페이지 로드 내 중복 주입만 가드.
 */
(function () {
  if (window.__dglSplashShown) return;
  window.__dglSplashShown = true;

  var LOGO  = 'assets/dgl-splash.png';
  var SOUND = 'assets/audio/dgl-splash.mp3';
  var BG = '#021029';            // 로고 코너 픽셀색(슬라임 스플래시와 동일) → 가장자리 1:1 매칭
  // 타이밍(ms). FADE_IN+HOLD(2.15s) 동안 사운드(≈2.0s) 재생 → 끝나면 2단계 페이드.
  var FADE_IN = 350, HOLD = 1800, LOGO_FADE = 400, BG_FADE = 1200;

  function run() {
    // ── 전체화면 오버레이 (최상단, 단색 네이비) ──────────────
    var ov = document.createElement('div');
    ov.id = 'dgl-splash';
    ov.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;background:' + BG + ';' +
      'display:flex;align-items:center;justify-content:center;' +
      'transition:opacity ' + BG_FADE + 'ms ease;opacity:1;' +
      // pointer-events:none → 스플래시 중 탭이 게임으로 통과(슬라임 교훈: 첫 클릭 손실 방지)
      'pointer-events:none;';

    var img = document.createElement('img');
    img.src = LOGO; img.alt = 'Dumb Game Lab';
    img.decoding = 'async';
    img.style.cssText =
      'width:min(62vw,62vh);height:auto;opacity:0;' +
      'transition:opacity ' + FADE_IN + 'ms ease;' +
      'filter:drop-shadow(0 8px 30px rgba(0,0,0,.45));';
    ov.appendChild(img);
    (document.body || document.documentElement).appendChild(ov);

    // ── 사운드 (Capacitor 네이티브 WebView는 제스처 없이 자동재생 허용) ──
    var audio = null;
    try {
      audio = new Audio(SOUND);
      audio.volume = 1;
      var p = audio.play();
      if (p && p.catch) p.catch(function () {
        // 웹 브라우저: 자동재생 막힘 → 첫 사용자 제스처에 1회 재생
        var once = function () {
          try { audio.currentTime = 0; audio.play().catch(function () {}); } catch (e) {}
          window.removeEventListener('pointerdown', once);
          window.removeEventListener('touchend', once);
        };
        window.addEventListener('pointerdown', once);
        window.addEventListener('touchend', once);
      });
    } catch (e) {}

    // ── 페이드 인 (두 번의 rAF로 초기 opacity:0 커밋 후 전환) ──
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { img.style.opacity = '1'; });
    });

    // ── 1단계: 로고 + 사운드 페이드아웃 → 2단계: 배경 페이드아웃 → 제거 ──
    setTimeout(function () {
      img.style.transition = 'opacity ' + LOGO_FADE + 'ms ease';
      img.style.opacity = '0';
      if (audio) fadeOutAudio(audio, LOGO_FADE);
      setTimeout(function () {
        ov.style.opacity = '0';
        setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, BG_FADE + 60);
      }, LOGO_FADE);
    }, FADE_IN + HOLD);
  }

  function fadeOutAudio(a, ms) {
    var steps = 12, i = 0, v = a.volume;
    var t = setInterval(function () {
      i++;
      try { a.volume = Math.max(0, v * (1 - i / steps)); } catch (e) {}
      if (i >= steps) { clearInterval(t); try { a.pause(); } catch (e) {} }
    }, ms / steps);
  }

  // <head>에서 로드되면 body가 아직 없을 수 있음 → documentElement에 즉시 띄워 깜빡임(타이틀 플래시) 방지.
  if (document.body || document.documentElement) run();
  else document.addEventListener('DOMContentLoaded', run);
})();
