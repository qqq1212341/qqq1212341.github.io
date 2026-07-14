"use strict";
/* 꼬리추월 — 세이브/영구상태. 스키마 바뀌면 version 올리고 마이그레이션 추가. */
const SAVE_KEY = "tailtraffic_v1";

function newState(){
  return {
    version: 1,
    best: 0,          // 역대 최고 연결 수 (1등 시민)
    bestDist: 0,      // 역대 최장 거리(m)
    coins: 0,
    plays: 0,
    runsSinceInter: 0,
    lastInterAt: 0,
    snd: { bgm: true, sfx: true },
  };
}
function loadState(){
  try{
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if(s && s.version === 1){ return { ...newState(), ...s, snd: { ...newState().snd, ...(s.snd||{}) } }; }
  }catch(e){}
  return newState();
}
let state = loadState();

function saveState(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }catch(e){}
  // 앱(Capacitor) 네이티브 미러 — OS 캐시청소에도 세이브 생존
  try{
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
    if(P) P.set({ key: SAVE_KEY, value: JSON.stringify(state) });
  }catch(e){}
}
