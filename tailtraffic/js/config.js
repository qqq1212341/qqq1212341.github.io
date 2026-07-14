"use strict";
/* 꼬리추월 — 게임 상수. BUILD-SPEC [FREE] 영역의 튜닝값은 전부 여기. 단위: 월드px(세로=진행방향). */
const CONFIG = {
  // ── 도로 ──
  LANES: 3,
  LANE_W: 110,            // 차선 폭(월드)
  ROAD_MARGIN: 0.18,      // 차선 밖으로 삐져나갈 수 있는 여유(차선단위)

  // ── 속도 ──
  SPEED0: 340,            // 시작 전진 속도 (월드px/s)
  SPEED_MAX: 470,
  SPEED_RAMP: 4.5,        // 초당 가속(거리 램프)
  TRAFFIC_SPD: 0.56,      // 교통 기본 속도(플레이어 대비 비율)
  TRAFFIC_SPD_VAR: 0.05,  // 개체 편차(±)

  // ── 차량 크기 (월드) ──
  CAR: { w: 62, len: 104 },
  TRUCK: { w: 80, len: 236 },

  // ── 꼬리 ──
  SPACING: 120,           // 행렬 차간 거리(경로 거리 기준) — 급커브에서 안 겹치게
  FOLLOW_LERP: 15,        // 꼬리 x 스무딩 (높을수록 기민 — 지연 과다 금지)
  JOIN_DUR: 0.42,         // 추월차가 꼬리로 붙는 연출 시간(s)
  PATH_STEP: 3,           // 경로 버퍼 샘플 간격

  // ── 카메라 ──
  ANCHOR_Y: 0.58,         // 선두차 화면 y(비율)
  ZOOM0: 0.88,            // 기본 줌
  ZOOM_MIN: 0.62,         // 긴 꼬리에서 줌아웃 하한
  ZOOM_TAIL_FULL: 30,     // 이 연결 수에서 ZOOM_MIN 도달
  PERSP_TOP: 0.72,        // 화면 상단 원근 스케일
  PERSP_BOT: 1.10,        // 화면 하단 원근 스케일

  // ── 판정 (관대하게 — 억울함 방지) ──
  HIT_W: 0.68,            // 히트박스 가로 축소율(선두)
  HIT_L: 0.80,            // 히트박스 세로 축소율(선두)
  TAIL_HIT_W: 0.56,       // 꼬리는 더 관대
  TAIL_HIT_L: 0.68,
  OVERTAKE_MARGIN: 6,     // 완전 추월 성립 여유
  NEARMISS_GAP: 40,       // 니어미스 판정 측면 간격(월드) — 트럭 옆 레인 통과(gap 39)는 인정, 승용차 나란히(48)는 미인정

  // ── 스폰/난이도 (tier: 꼬리 수 기반) ──
  SPAWN_AHEAD: 1100,      // 선두 전방 스폰 거리
  TIERS: [
    // tail<5: 성장 구간 — 넓게, 트럭 없음
    { tail: 0,  gap: [430, 560], weights: { single: 5, pair: 2, convoy: 3 } },
    // 5~9: 트럭 등장
    { tail: 5,  gap: [340, 470], weights: { single: 4, pair: 3, convoy: 3, gate: 2, canyon: 1 } },
    // 10~19: 차선변경·좁은 틈
    { tail: 10, gap: [290, 400], weights: { single: 3, pair: 3, convoy: 2, gate: 3, canyon: 2, changer: 2, jam: 1 } },
    // 20+: 풀 압박
    { tail: 20, gap: [250, 340], weights: { single: 2, pair: 3, convoy: 2, gate: 3, canyon: 3, changer: 3, jam: 2 } },
  ],
  LANE_SPD: [0.52, 0.58, 0.66],  // tier2+에서 차선별 속도 차이(비율) — 왼쪽 느림

  // ── 점수/재화 ──
  COIN_NEARMISS: 3,
  COIN_HOLD_RATE: 0.15,   // 초당 코인 = tail * 이 값
  MILESTONES: [5, 10, 20, 30, 40, 50],
  COMBO_WINDOW: 2.2,      // 연속 추월 인정 간격(s)

  // ── 연출 ──
  HITSTOP_MS: 90,
  CRASH_SLOWMO: 0.3,
  CRASH_SLOWMO_MS: 550,
  CLUTCH_SLOWMO: 0.35,    // 꼬리 간발 통과 슬로모
  CLUTCH_SLOWMO_MS: 320,
  CLUTCH_COOLDOWN: 8,     // 최소 간격(s) — 남발 금지

  // ── 꼬리치기(near-tail whip) — 세로화면 정체성: 액션은 '보이는 구간(선두+앞 몇 대)'에서만 ──
  //  · 선두만 즉사. 꼬리는 '보이는' 구간만 상호작용(화면 밖 꼬리 = 안전한 트로피).
  //  · 옆으로 빠르게 스윙 중인 꼬리차가 승용차를 만나면 → 채찍(도로 밖으로 쳐냄).
  //  · 스윙 안 된(직선) 꼬리에 차가 들어오면 → 그 지점부터 뒤가 잘림(즉사 아님, 길이 손실).
  WHIP_VX: 230,           // 이 옆속도(월드px/s) 넘게 스윙 중인 꼬리차 = 채찍(승용차)
  WHIP_TRUCK_MULT: 1.7,   // 트럭은 무거워서 더 세게 휘둘러야 쳐냄
  WHIP_KNOCK_VX: 560,     // 쳐낸 차가 옆으로 날아가는 초기 속도
  WHIP_COIN: 5,           // 채찍 성공 코인
  WHIP_HITSTOP_MS: 55,    // 채찍 타격감(짧게)
  CUT_IFRAME: 0.55,       // 잘린 직후 재판정 방지(s)
  VIS_TAIL_PAD: 1,        // 판정 대상 = 화면에 보이는 꼬리 + 이만큼(가장자리 반쯤 보이는 칸 포함)

  // ── 수익화 ──
  INTER_EVERY_RUNS: 3,    // N판마다 전면 후보
  INTER_MIN_PLAYS: 3,     // 첫 N판 금지
  INTER_MIN_GAP_S: 120,   // 최소 시간 간격
  CONTINUE_CLEAR: 700,    // 이어달리기 시 전방 클리어 거리
  CONTINUE_INVINCIBLE: 3, // 무적(s)
};
