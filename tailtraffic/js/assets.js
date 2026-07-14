"use strict";
/* 꼬리추월 — 에셋 로더. codex-image로 뽑은 스프라이트를 assets/<name>.webp|png 로 넣는다.
 * 스프라이트가 아직 없으면 spr()이 null을 반환하고, 렌더러가 임시 플레이스홀더(제작 단계1 한정)로 그린다. */
const ASSET_NAMES = [
  // 차량 (탑다운, 위 = 진행방향)
  "car-player",      // 선두차(히어로)
  "car-blue", "car-green", "car-yellow", "car-purple", "car-taxi",
  "truck-red",       // 대형 트럭
  "bus-city",        // 버스(대형)
  // 환경
  "road-tile",       // 세로 타일링 아스팔트
  // UI/이펙트
  "logo",            // 타이틀 로고(전용 그래픽 — T10)
  "badge-newrecord", // 신기록 배지(P9 전용 아트)
  "coin",
  "hint-drag",       // 온보딩 드래그 손가락
  "fx-crash",        // 충돌 스타
  "icon-ad",         // 광고 버튼 아이콘
];
const _imgs = {};
let ASSETS_READY = false;
function loadAssets(done){
  let left = ASSET_NAMES.length;
  if(!left){ ASSETS_READY = true; return done && done(); }
  for(const name of ASSET_NAMES){
    const tryLoad = (exts) => {
      if(!exts.length){ _imgs[name] = null; if(--left === 0){ ASSETS_READY = true; done && done(); } return; }
      const im = new Image();
      im.onload = () => { _imgs[name] = im; if(--left === 0){ ASSETS_READY = true; done && done(); } };
      im.onerror = () => tryLoad(exts.slice(1));
      im.src = `assets/${name}.${exts[0]}`;
    };
    tryLoad(["webp", "png"]);
  }
}
function spr(name){ return _imgs[name] || null; }
