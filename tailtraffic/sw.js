"use strict";
/* 꼬리추월 서비스워커. JS/CSS/HTML 변경 시 CACHE 버전 +1. 에셋 추가 시 tools/gen_sw_assets.js 로 목록 재생성. */
const CACHE = "tailtraffic-v1";
// === ASSETS:BEGIN (tools/gen_sw_assets.js 자동 생성 — 손으로 편집 금지) ===
const ASSETS = [
  './assets/audio/bgm.mp3',
  './assets/audio/crash.mp3',
  './assets/audio/dgl-splash.mp3',
  './assets/badge-newrecord.webp',
  './assets/bus-city.webp',
  './assets/car-blue.webp',
  './assets/car-green.webp',
  './assets/car-player.webp',
  './assets/car-purple.webp',
  './assets/car-taxi.webp',
  './assets/car-yellow.webp',
  './assets/coin.webp',
  './assets/dgl-splash.png',
  './assets/fx-crash.webp',
  './assets/hint-drag.webp',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-ad.webp',
  './assets/logo.png',
  './assets/road-tile.webp',
  './assets/truck-red.webp',
];
// === ASSETS:END ===
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // 코드(html/js/css)는 네트워크 우선, 에셋은 캐시 우선
  const isCode = /\.(html|js|css)$/.test(url.pathname) || url.pathname.endsWith("/");
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    if(isCode){
      try{ const net = await fetch(e.request); c.put(e.request, net.clone()); return net; }
      catch(_){ return (await c.match(e.request)) || (await c.match("./index.html")); }
    }
    const hit = await c.match(e.request);
    if(hit) return hit;
    try{ const net = await fetch(e.request); c.put(e.request, net.clone()); return net; }catch(_){ return hit; }
  })());
});
