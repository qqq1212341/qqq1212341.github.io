"use strict";
/* 탄피성벽 — 모든 튜닝 노브. 밸런스는 이 파일에서만 만진다.
 * ★ 1순위 노브 = BRASS.decay (PRD §10 — "쌓임→답답함→해소" 호흡이 게임 전체를 좌우) */
const CFG = {
  view: { cols: 13 },                    // 그리드 가로 셀 수 (PRD 12~16). rows는 화면비로 자동
  player: {
    r: 0.34,          // 반지름(셀)
    speed: 3.1,       // cell/s — "약간 여유 있게"에서 출발 (PRD §5.1)
    hp: 3,
    iframe: 1.0,      // 피격 무적 s
    revives: 1,       // 부활 기본 횟수 (보상형 광고 자리)
  },
  gun: {
    interval: 0.5,    // 발사 간격 s (PRD 0.4~0.6)
    range: 5.6,       // 사거리(셀) — 끝에서 탄피 고착
    speed: 9,         // 투사체 속도 cell/s
    dmg: 1,
    pierce: 1,        // 관통 소진 시 그 자리 고착
    projectiles: 1,
    spread: 0.24,     // 다중 투사체 부채꼴(rad)
  },
  BRASS: {
    decay: 6.0,       // ★ 부식 s (PRD 4~8) — 1순위 튜닝 노브
    maxDur: 3,        // 셀 최대 내구도(같은 셀 중첩)
    minDist: 1.6,     // 플레이어 주변 이 거리(셀) 안엔 고착 금지(즉가둠 방지)
    blinkT: 1.3,      // 소멸 전 점멸 s
  },
  enemies: {
    walker: { hp: 2, speed: 1.15, dmg: 1, r: 0.36, gem: 1 },
    rusher: { hp: 3, speed: 2.55, dmg: 1, r: 0.34, gem: 2, breakStun: 0.22 },
    drone:  { hp: 2, speed: 1.5,  dmg: 1, r: 0.30, gem: 2 },
  },
  spawn: {
    firstCrisisT: 30, // 첫 위기 버스트 (PRD ~30s)
    rusherT: 50,      // 러셔 등장 (PRD 45~60)
    droneT: 95,       // 드론 등장 (PRD 90+)
    baseInt: 1.35,    // 초기 스폰 간격 s
    minInt: 0.34,     // 최소 스폰 간격 s
    rampT: 160,       // 간격이 min까지 줄어드는 시간 s
    maxAlive: 42,     // 동시 적 상한 (모바일 성능, PRD §9.3)
    burstN: 8,
    telegraph: 0.55,  // 스폰 예고 s
  },
  gems: { magnet: 1.25, speed: 8.5, life: 30 },
  level: { base: 4, per: 3 },            // 레벨업 필요 젬 = base + lv*per (오토런 실측: 첫 레벨업 ~40s → 앞당김)
  meta: { convertRate: 0.25, timeBonusPerMin: 6 }, // 런 젬→황동 환산
  juice: { hitstop: 0.06, shake: 7 },
};
