"use strict";
/* 탄피성벽 — 영구 메타 저장(localStorage). 런 상태는 game.js 소관. 서버 없음(PRD §0). */
const SAVE_KEY = "brasswall_v1";
function _newSave() {
  return { version: 1, brass: 0, best: { time: 0, kills: 0, wall: 0 }, shop: {}, plays: 0, mute: false };
}
const Meta = {
  data: _newSave(),
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.version === 1)
        this.data = { ..._newSave(), ...s, best: { ..._newSave().best, ...(s.best || {}) }, shop: { ...(s.shop || {}) } };
    } catch (e) {}
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {}
    // 앱(Capacitor) 네이티브 미러 — OS 캐시청소에도 세이브 생존
    try {
      const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
      if (P) P.set({ key: SAVE_KEY, value: JSON.stringify(this.data) });
    } catch (e) {}
  },
  shopLv(id) { return this.data.shop[id] || 0; },
  reset() { this.data = _newSave(); this.save(); },
};
Meta.load();

/* 메타 상점(영구 시작 능력치) — cost(l)=현재랭크 l에서 다음 랭크 가격(황동) */
const META_SHOP = [
  { id: "hp",     name: "강화 프레임",   desc: "시작 체력 +1",      max: 3, cost: l => 40 + l * 70 },
  { id: "rate",   name: "쾌속 노리쇠",   desc: "발사 간격 -8%",     max: 3, cost: l => 55 + l * 80 },
  { id: "move",   name: "가속 스러스터", desc: "이동 속도 +7%",     max: 3, cost: l => 55 + l * 80 },
  { id: "magnet", name: "자기 코일",     desc: "젬 흡수 반경 +25%", max: 3, cost: l => 35 + l * 55 },
  { id: "revive", name: "예비 코어",     desc: "부활 +1회",         max: 1, cost: () => 240 },
];
