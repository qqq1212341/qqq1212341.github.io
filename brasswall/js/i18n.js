"use strict";
/* 탄피성벽 — 경량 i18n (KO/EN). 웹 포털(CrazyGames/Poki)은 영어 필수 → 런타임 언어 전환.
 * Korean-as-key: 게임 코드는 T("출격")로 호출 → EN 모드면 사전값, KO 모드면 한글 그대로(폴백 안전).
 * 언어 결정 우선순위: ?lang= > localStorage(brasswall_lang) > window.__DGL_LANG(포털 빌드 기본) > navigator(ko*→ko, 그 외 en).
 * 로드 위치: index.html <head>에서 game.js 보다 먼저(splash·analytics 다음). 의존성 0. */
const I18N = (function () {
  // ── EN 사전 (키=한글). 없는 키는 한글 폴백 → 누락돼도 안 깨짐. ──
  const EN = {
    // 타이틀·공용
    "탄피성벽": "BRASS WALL",
    "쏜 총알이 벽이 된다 — 갇히기 전에 길을 설계하라": "Your bullets become walls — plan your escape before you're trapped",
    "출격": "START",
    "병기고": "ARMORY",
    "사운드": "SOUND",
    "사운드 켜짐": "SOUND: ON",
    "사운드 꺼짐": "SOUND: OFF",
    // 레벨업
    "강화 선택": "CHOOSE UPGRADE",
    "탄피 연계": "BRASS SYNERGY",
    // 레벨업 강화 (name)
    "속사": "Rapid Fire",
    "멀티샷": "Multishot",
    "관통탄": "Piercing",
    "장거리 배럴": "Long Barrel",
    "스러스터": "Thruster",
    "자기장": "Magnet Field",
    "장갑판": "Armor Plate",
    "유폭 탄피": "Volatile Brass",
    "포탑화": "Turret Casing",
    "부스트 레인": "Boost Lane",
    "속사 부식": "Corrosive Volley",
    "강철 탄피": "Steel Brass",
    "응급 수리": "Field Repair",
    // 레벨업 강화 (desc)
    "발사 간격 -12%": "Fire rate -12%",
    "투사체 +1": "+1 projectile",
    "관통 +1": "+1 pierce",
    "사거리 +18%": "Range +18%",
    "이동 속도 +10%": "Move speed +10%",
    "젬 흡수 반경 +35%": "Gem pickup +35%",
    "최대 체력 +1 · 즉시 1 회복": "Max HP +1 · heal 1 now",
    "탄피가 부서질 때 폭발": "Brass explodes when it breaks",
    "새 탄피가 확률로 포탑이 된다": "New brass may become a turret",
    "탄피 옆에서 이동 +15%": "Move +15% beside brass",
    "부식 -30% 빨라짐 · 발사 -15%": "Corrode 30% faster · fire -15%",
    "탄피 내구 +1 · 부식 +45% 느려짐": "Brass durability +1 · corrode 45% slower",
    "체력 1 회복": "Heal 1 HP",
    // 적 예고
    "러셔 출현": "RUSHER INCOMING",
    "탄피 벽을 부순다!": "Smashes through walls!",
    "드론 출현": "DRONE INCOMING",
    "벽 위로 날아온다!": "Flies over your walls!",
    "첫 위기": "FIRST CRISIS",
    "포위 웨이브!": "Surrounded!",
    // 타이틀 통계
    "최고 생존": "Best time",
    "최다 처치": "Most kills",
    "최대 벽": "Max wall",
    // 사망
    "격침": "SHOT DOWN",
    "탄피 벽에 깔렸다 — 압사": "Crushed by your own brass wall",
    "격추당했다": "Shot down by the swarm",
    "광고 보고 부활": "Revive with Ad",
    "부활": "Revive",
    "결과 보기": "See Results",
    "생존": "Survived",
    "처치": "Kills",
    // 결과
    "전투 결과": "BATTLE RESULT",
    "젬": "Gems",
    "벽": "Wall",
    "신기록: ": "New record: ",
    "황동": "Brass",
    "황동 2배 받기": "Double Brass (Ad)",
    "다시 출격": "PLAY AGAIN",
    "타이틀": "Title",
    // 상점(병기고)
    "보유 황동": "Brass",
    "완료": "MAX",
    "닫기": "Close",
    // 상점 아이템 (META_SHOP)
    "강화 프레임": "Reinforced Frame",
    "시작 체력 +1": "Start HP +1",
    "쾌속 노리쇠": "Quick Bolt",
    "발사 간격 -8%": "Fire rate -8%",
    "가속 스러스터": "Boost Thruster",
    "이동 속도 +7%": "Move speed +7%",
    "자기 코일": "Magnet Coil",
    "젬 흡수 반경 +25%": "Gem pickup +25%",
    "예비 코어": "Spare Core",
    "부활 +1회": "+1 revive",
    // 일시정지
    "일시정지": "PAUSED",
    "계속": "Resume",
    "타이틀로": "Quit to Title",
    // 토스트·힌트
    "내가 쏜 총알이 탄피 벽이 된다": "Your bullets harden into brass walls",
    "벽으로 적을 좁은 길목에 몰아넣어라": "Funnel enemies into narrow gaps with walls",
  };

  function resolve() {
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q === "ko" || q === "en") { try { localStorage.setItem("brasswall_lang", q); } catch (e) {} return q; }
      const saved = localStorage.getItem("brasswall_lang");
      if (saved === "ko" || saved === "en") return saved;
    } catch (e) {}
    if (window.__DGL_LANG === "ko" || window.__DGL_LANG === "en") return window.__DGL_LANG;
    const nav = (navigator.language || "en").toLowerCase();
    return nav.startsWith("ko") ? "ko" : "en";
  }

  let lang = resolve();

  function T(ko) { return lang === "ko" ? ko : (EN[ko] != null ? EN[ko] : ko); }

  // 정적 DOM 번역(라이브 토글 안전 — 원본 한글 키를 보존해 양방향 재적용 가능):
  //   [data-i18n]=키(textContent) · .dgl-title[data-text](textContent+속성, title-fx가 ::after로 씀)
  function apply(root) {
    const r = root || document;
    r.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = T(el.getAttribute("data-i18n")); });
    r.querySelectorAll(".dgl-title[data-text]").forEach((el) => {
      let key = el.getAttribute("data-i18n-title");
      if (!key) { key = el.getAttribute("data-text"); el.setAttribute("data-i18n-title", key); }  // 최초 1회 원본 저장
      const s = T(key);
      el.setAttribute("data-text", s); el.textContent = s;
    });
    try { document.documentElement.lang = lang; document.title = lang === "ko" ? "탄피성벽 — Brass Wall" : "Brass Wall — bullets become walls"; } catch (e) {}
  }

  function setLang(l) {
    if (l !== "ko" && l !== "en") return;
    lang = l;
    try { localStorage.setItem("brasswall_lang", l); } catch (e) {}
  }

  return { T, apply, setLang, get lang() { return lang; }, other: () => (lang === "ko" ? "en" : "ko") };
})();
window.I18N = I18N;
window.T = I18N.T;
