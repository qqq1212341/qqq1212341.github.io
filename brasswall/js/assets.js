"use strict";
/* 탄피성벽 — 에셋 로더 스텁. codex-image 스킬로 뽑은 이름을 ASSET_NAMES 에 추가하면 spr(name)으로 쓴다. */
const ASSET_NAMES = [
  "player", "walker", "rusher", "drone",
  "brass1", "brass2", "brass3",
  "gem", "turret-core",
  "bg-arena",            // 인게임 바닥 아트 (buildBg 가 bgCv 에 굽는다)
];
const _imgs = {};
function loadAssets(done){
  let n = ASSET_NAMES.length, left = n;
  if(!n) return done && done();
  for(const name of ASSET_NAMES){
    const im = new Image();
    im.onload = im.onerror = () => { if(--left === 0) done && done(); };
    im.src = `assets/${name}.webp`;
    _imgs[name] = im;
  }
}
function spr(name){ return _imgs[name] || null; }
