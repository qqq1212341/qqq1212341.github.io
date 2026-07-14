"use strict";
/* 꼬리추월 — 메인. 상태머신: TITLE(어트랙트) → PLAY → CRASHING → RESULTS (+PAUSE 오버레이)
 * 코어 규칙(BUILD-SPEC §2 MUST): 자동 전진 · 원핸드 좌우(위치 유지) · 완전 추월=연결 ·
 * 경로 지연 추종 · 행렬 전체 충돌 · 원탭 재시작 · 기록=최대 연결 수 */

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
let W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
function resize(){
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const DEBUG = !IS_NATIVE && /[?&]ttDebug=1/.test(location.search);

/* ── 판 상태 ─────────────────────────────────────────── */
let mode = "TITLE";
let run = null;
let zoom = CONFIG.ZOOM0;
let ts = 1, slowmoT = 0, hitstopT = 0;
let crashT = 0;
let attractT = 0;
let weaveAuto = false; // QA/어트랙트 자동 조향

function newRun(){
  return {
    d: 0, wy: 0, x: 0,
    speed: CONFIG.SPEED0, time: 0,
    coins: 0, coinFrac: 0,
    combo: 0, comboT: 0,
    maxTail: 0, nearMisses: 0, knocks: 0,
    milestones: {},
    crash: null, continueUsed: false, invincibleT: 0, clutchCd: 0, cutCd: 0,
    started: false,
  };
}

/* ── 카메라/투영 ─────────────────────────────────────── */
function anchorY(){ return H * CONFIG.ANCHOR_Y; }
function persp(sy){ const k = Math.max(0, Math.min(1, sy / H)); return CONFIG.PERSP_TOP + (CONFIG.PERSP_BOT - CONFIG.PERSP_TOP) * k; }
function screenY(wy){ return anchorY() - (wy - run.wy) * zoom; }
function screenX(x, sy){ return W / 2 + x * zoom * persp(sy); }
function roadHalf(){ return CONFIG.LANES / 2 * CONFIG.LANE_W; }
function xClamp(){ return roadHalf() - CONFIG.CAR.w / 2 + CONFIG.LANE_W * CONFIG.ROAD_MARGIN; }

/* ── 입력 (원핸드 드래그: 1:1 즉답, 손 떼면 유지) ────── */
let dragId = null, lastPX = 0, leanV = 0;
let autoDodge = false; // 그리디 회피 오토파일럿 (QA·어트랙트·클립 캡처용)
function autoDrive(dt){
  let bestLane = 0, bestScore = -1;
  for(let l = 0; l < CONFIG.LANES; l++){
    const lx = TRAFFIC.laneX(l);
    let clear = 1e9;
    for(const c of TRAFFIC.cars){
      if(Math.abs(c.x - lx) < (c.w + CONFIG.CAR.w) / 2 + 10){
        const dy = c.wy - run.wy;
        if(dy > -150 && dy < 900) clear = Math.min(clear, dy < 0 ? -1 : dy); // 옆에 붙은 차 = 위험
      }
    }
    const score = clear + (Math.abs(run.x - lx) < 12 ? 130 : 0); // 현 레인 유지 보너스(진동 방지)
    if(score > bestScore){ bestScore = score; bestLane = l; }
  }
  const tx = TRAFFIC.laneX(bestLane);
  const step = Math.sign(tx - run.x) * Math.min(Math.abs(tx - run.x), 430 * dt);
  const c = xClamp();
  run.x = Math.max(-c, Math.min(c, run.x + step));
}
const stage = document.getElementById("stage");
stage.addEventListener("pointerdown", e => {
  dragId = e.pointerId; lastPX = e.clientX;
  if(mode === "PLAY" && !run.started){ run.started = true; hideHint(); }
});
stage.addEventListener("pointermove", e => {
  if(e.pointerId !== dragId || dragId === null) return;
  const dx = e.clientX - lastPX; lastPX = e.clientX;
  if(mode === "PLAY" && !weaveAuto){
    const worldDx = dx / (zoom * persp(anchorY()));
    const c = xClamp();
    run.x = Math.max(-c, Math.min(c, run.x + worldDx));
    leanV = leanV * 0.6 + worldDx * 0.4;
    if(!run.started){ run.started = true; hideHint(); }
  }
});
window.addEventListener("pointerup", e => { if(e.pointerId === dragId) dragId = null; });
window.addEventListener("pointercancel", e => { if(e.pointerId === dragId) dragId = null; });

/* ── DOM 헬퍼 ────────────────────────────────────────── */
const $ = id => document.getElementById(id);
function show(id){ $(id).classList.add("show"); }
function hide(id){ $(id).classList.remove("show"); }
function hideHint(){ $("hintDrag").classList.remove("show"); }
function track(ev, p){ if(typeof DGL !== "undefined") DGL.track(ev, p || {}); }

/* ── 게임 시작/종료 ──────────────────────────────────── */
function startGame(){
  run = newRun();
  TAIL.reset(0); TRAFFIC.reset(0);
  FX.reset(); zoom = CONFIG.ZOOM0; ts = 1; slowmoT = 0; hitstopT = 0; crashT = 0;
  weaveAuto = false;
  mode = "PLAY";
  hide("titleOverlay"); hide("resultOverlay"); hide("pauseOverlay");
  $("hud").classList.add("show");
  hudTail(-1); hudDist(-1); hudCoin(-1); refreshBestChip();
  if(state.plays === 0){ TRAFFIC.setScript(onboardScript()); $("hintDrag").classList.add("show"); }
  SND.playBgm();
  track("business_start", { plays: state.plays });
}

function onboardScript(){
  // 무설명 4비트(BUILD-SPEC §6): 느린 첫 차 → 넓은 통과 → 좁은 틈 → 트럭 협곡
  const mk = (l, y, s, o) => TRAFFIC.mkCar(l, y, s, o);
  return [
    { at: 430,  fn: (y, s) => mk(1, y, s, { spdRatio: 0.42 }) },
    { at: 1050, fn: (y, s) => { mk(0, y, s); mk(2, y + 40, s); } },
    { at: 1750, fn: (y, s) => { mk(0, y, s, { type: "truck" }); mk(1, y + 30, s); } },
    { at: 2550, fn: (y, s) => { mk(0, y, s, { type: "truck" }); mk(2, y, s, { type: "truck" }); } },
  ];
}

function goTitle(){
  mode = "TITLE";
  hide("resultOverlay"); hide("pauseOverlay"); $("hud").classList.remove("show");
  show("titleOverlay");
  refreshTitleStats();
  setupAttract();
}

/* ── 어트랙트(타이틀 배경: 6대 행렬이 뱀처럼 유영 — 컨셉을 첫 화면이 판다) ── */
function setupAttract(){
  run = newRun(); TAIL.reset(0); TRAFFIC.reset(0); FX.reset();
  zoom = CONFIG.ZOOM0 * 0.94; ts = 1; attractT = 0;
  const sprites = ["car-blue", "car-green", "car-yellow", "car-purple", "car-taxi", "car-blue"];
  for(let i = 0; i < 6; i++) TAIL.segs.push({ x: 0, sprite: sprites[i], popT: 0, wobble: 0 });
}

/* ── 추월/니어미스/충돌 판정 ─────────────────────────── */
function tailEndWY(){ return run.wy - (TAIL.count() + 1) * CONFIG.SPACING; }

function checkOvertakes(){
  for(const c of TRAFFIC.cars.slice()){
    if(c.passed || c.state === "knocked") continue;
    if(run.wy - CONFIG.CAR.len / 2 > c.wy + c.len / 2 + CONFIG.OVERTAKE_MARGIN){
      c.passed = true;
      if(c.attachable){
        TRAFFIC.remove(c);
        TAIL.addJoin(c, run.d, run.wy);
        run.combo = (run.comboT > 0) ? run.combo + 1 : 1;
        run.comboT = CONFIG.COMBO_WINDOW;
        SND.overtake(run.combo);
        const sy = screenY(c.wy);
        FX.floater(screenX(c.x, sy), sy, "+1대", { size: 24, color: "#ffd24a" });
        if(run.combo >= 3) FX.floater(W / 2, H * 0.22, `콤보 x${run.combo}`, { size: 30, color: "#36e0ff", life: 0.7 });
        hudTail(TAIL.count(), true);
        run.maxTail = Math.max(run.maxTail, TAIL.count());
      }
    }
  }
}

function trackNearMiss(){
  const cnt = TAIL.segs.length;
  for(const c of TRAFFIC.cars){
    if(c.nearDone || c.state === "knocked") continue;
    // y가 스네이크 범위 근처인 차만
    if(c.wy > run.wy + 300 || c.wy < tailEndWY() - 300){
      if(c.wy < tailEndWY() - 60 && c.passed){ finalizeNearMiss(c); }
      continue;
    }
    // 선두와
    if(Math.abs(c.wy - run.wy) < (c.len + CONFIG.CAR.len) / 2){
      const gap = Math.abs(c.x - run.x) - (c.w + CONFIG.CAR.w) / 2;
      if(gap < c.minGap){ c.minGap = gap; c.clutchSeg = -1; }
    }
    // 꼬리와 — 겹치는 인덱스 근처만
    const iC = Math.round((run.wy - c.wy) / CONFIG.SPACING) - 1;
    for(let i = Math.max(0, iC - 2); i <= Math.min(cnt - 1, iC + 2); i++){
      const swy = TAIL.segWorldY(i, run.wy);
      if(Math.abs(c.wy - swy) < (c.len + CONFIG.CAR.len) / 2){
        const gap = Math.abs(c.x - TAIL.segs[i].x) - (c.w + CONFIG.CAR.w) / 2;
        if(gap < c.minGap){ c.minGap = gap; c.clutchSeg = i; }
      }
    }
    if(c.passed && c.wy + c.len / 2 < tailEndWY() - 40) finalizeNearMiss(c);
  }
}
function finalizeNearMiss(c){
  c.nearDone = true;
  if(c.minGap > 0 && c.minGap < CONFIG.NEARMISS_GAP){
    run.nearMisses++;
    run.coins += CONFIG.COIN_NEARMISS;
    SND.nearmiss(); SND.haptic(10);
    const sy = screenY(c.wy);
    FX.spark(screenX(c.x, sy), sy, 6, "#36e0ff", 120);
    FX.floater(screenX(c.x, sy), sy - 20, `+${CONFIG.COIN_NEARMISS}`, { size: 18, color: "#36e0ff" });
    hudCoin(run.coins);
    track("near_miss", { gap: Math.round(c.minGap) });
    // 마지막 꼬리가 트럭을 간발 통과 = 클러치 슬로모 (남발 금지)
    if(c.type !== "car" && c.clutchSeg === TAIL.segs.length - 1 && c.minGap < 18 && run.clutchCd <= 0 && mode === "PLAY"){
      slowmo(CONFIG.CLUTCH_SLOWMO, CONFIG.CLUTCH_SLOWMO_MS);
      SND.clutch();
      FX.floater(W / 2, H * 0.34, "아슬아슬!", { size: 34, color: "#7CFC8E" });
      run.clutchCd = CONFIG.CLUTCH_COOLDOWN;
    }
  }
}

function rectOverlap(x1, y1, w1, l1, x2, y2, w2, l2){
  return Math.abs(x1 - x2) < (w1 + w2) / 2 && Math.abs(y1 - y2) < (l1 + l2) / 2;
}

/* 판정 대상 꼬리 = '화면에 보이는' 마지막 인덱스. 그 뒤(화면 밖) 꼬리는 안전한 트로피.
 * screenY(i) = anchorY + (i+1)*SPACING*zoom ≤ H  →  i ≤ (H-anchorY)/(SPACING*zoom) - 1 */
function liveTailMax(){
  const n = Math.floor((H - anchorY()) / (CONFIG.SPACING * zoom)) - 1 + CONFIG.VIS_TAIL_PAD;
  return Math.max(0, n);
}

/* 채찍 — 스윙 중인 꼬리차가 승용차를 도로 밖으로 쳐냄 (즉사 아님·통쾌·점수) */
function whipCar(c, seg){
  c.state = "knocked";
  c.passed = true; c.nearDone = true;
  const dir = seg.vx !== 0 ? Math.sign(seg.vx) : (c.x < seg.x ? -1 : 1);
  c.vx = dir * CONFIG.WHIP_KNOCK_VX;
  c.vr = dir * 6; c.knockT = 0; c.angle = 0;
  hitstopT = Math.max(hitstopT, CONFIG.WHIP_HITSTOP_MS / 1000);
  SND.whip(); SND.haptic(20);
  const sy = screenY(c.wy);
  FX.spark(screenX(c.x, sy), sy, 10, "#ffd24a", 260);
  FX.floater(screenX(c.x, sy), sy - 18, "퍽!", { size: 26, color: "#ffd24a" });
  run.coins += CONFIG.WHIP_COIN; run.knocks++; hudCoin(run.coins);
  run.combo = (run.comboT > 0) ? run.combo + 1 : 1; run.comboT = CONFIG.COMBO_WINDOW;
  if(run.combo >= 3) FX.floater(W / 2, H * 0.22, `콤보 x${run.combo}`, { size: 30, color: "#36e0ff", life: 0.7 });
  track("whip", { combo: run.combo });
}

/* 잘림 — 스윙 안 된 꼬리를 트럭이 관통 → 관통 구간만 떨어져나감(나머지는 붙음, 주행 계속) */
function cutTail(i0, i1){
  const swy = TAIL.segWorldY(i0, run.wy);
  const bx = TAIL.segs[i0] ? TAIL.segs[i0].x : run.x;
  const lost = TAIL.removeSegs(i0, i1 - i0 + 1);
  if(!lost) return;
  run.cutCd = CONFIG.CUT_IFRAME;
  SND.cut(); SND.haptic(40); FX.shake(9);
  const sy = screenY(swy);
  FX.debris(screenX(bx, sy), sy);
  FX.floater(W / 2, H * 0.30, `꼬리 -${lost}`, { size: 34, color: "#ff7043", life: 0.85 });
  if(!run.taughtWhip){ run.taughtWhip = true;   // 딱 필요한 순간에 채찍 코칭 (1회)
    FX.floater(W / 2, H * 0.42, "세게 휘둘러 쳐내기!", { size: 22, color: "#36e0ff", life: 1.7 }); }
  hudTail(TAIL.count(), true);
  track("tail_cut", { lost, at: i0 });
}

function checkCollision(){
  if(run.invincibleT > 0) return;
  const liveMax = liveTailMax();
  for(const c of TRAFFIC.cars){
    if(c.state === "knocked") continue;
    if(c.wy > run.wy + 400 || c.wy < tailEndWY() - 400) continue;
    // 선두 = 즉사 (직접 조종하는 유일한 목숨)
    if(rectOverlap(run.x, run.wy, CONFIG.CAR.w * CONFIG.HIT_W, CONFIG.CAR.len * CONFIG.HIT_L,
                   c.x, c.wy, c.w, c.len)){
      return crash(c, -1);
    }
    if(c.cutDone) continue;   // 이미 한 번 꼬리를 가른 트럭 = 관통 통과(재판정 없음)
    // 꼬리 — 보이는 구간만 상호작용. 겹치는 꼬리 중 하나라도 빠르게 스윙 중이면 채찍, 아니면 잘림.
    //  (트럭은 길어서 여러 꼬리에 걸침 → 앞쪽 정지 꼬리가 먼저 걸려도, 뒤 꼬리가 휘두르면 채찍 성립)
    const iC = Math.round((run.wy - c.wy) / CONFIG.SPACING) - 1;
    const hi = Math.min(liveMax, TAIL.segs.length - 1, iC + 2);
    let firstHit = -1, lastHit = -1, swingSeg = null, swingVx = 0;
    for(let i = Math.max(0, iC - 2); i <= hi; i++){
      const seg = TAIL.segs[i], swy = TAIL.segWorldY(i, run.wy);
      if(!rectOverlap(seg.x, swy, CONFIG.CAR.w * CONFIG.TAIL_HIT_W, CONFIG.CAR.len * CONFIG.TAIL_HIT_L,
                      c.x, c.wy, c.w, c.len)) continue;
      if(firstHit < 0) firstHit = i;
      lastHit = i;
      const v = Math.abs(seg.vx || 0);
      if(v > swingVx){ swingVx = v; swingSeg = seg; }
    }
    if(firstHit < 0) continue;   // 겹친 꼬리 없음
    const whipVx = c.type === "car" ? CONFIG.WHIP_VX : CONFIG.WHIP_VX * CONFIG.WHIP_TRUCK_MULT;
    if(swingVx > whipVx) whipCar(c, swingSeg);                       // 스윙 중 → 쳐냄
    else if(run.cutCd <= 0){ cutTail(firstHit, lastHit); c.cutDone = true; }  // 직선 → 관통 구간만 1회 잘림
  }
}

function slowmo(scale, ms){ ts = scale; slowmoT = ms / 1000; }

function crash(car, segIdx){
  mode = "CRASHING"; crashT = 0;
  const wy = segIdx < 0 ? run.wy : TAIL.segWorldY(segIdx, run.wy);
  const x = segIdx < 0 ? run.x : TAIL.segs[segIdx].x;
  run.crash = { segIdx, carType: car.type, x, wy, carId: car.id };
  hitstopT = CONFIG.HITSTOP_MS / 1000;
  slowmo(CONFIG.CRASH_SLOWMO, CONFIG.CRASH_SLOWMO_MS + CONFIG.HITSTOP_MS);
  SND.crash(); SND.haptic(60);
  FX.shake(15);
  const sy = screenY(wy);
  FX.debris(screenX(x, sy), sy);
  FX.crashStar(screenX((x + car.x) / 2, sy), sy, 1.2);
  TAIL.wobbleAll(Math.max(0, segIdx));
  SND.stopBgm();
}

/* ── 결과 ────────────────────────────────────────────── */
function culpritText(){
  const c = run.crash;
  const what = c.carType === "car" ? "차" : "트럭";
  return c.segIdx < 0 ? `선두가 ${what}에 정면으로 쾅!` : `${c.segIdx + 1}번째 꼬리가 ${what}에 쾅!`;
}
function showResults(){
  mode = "RESULTS";
  const tail = run.maxTail, dist = Math.round(run.d / 10);
  const isRecord = tail > state.best;
  if(isRecord) state.best = tail;
  state.bestDist = Math.max(state.bestDist, dist);
  state.coins += run.coins;
  state.plays++; state.runsSinceInter++;
  saveState();
  track("game_over", { tail, dist, coins: run.coins, near: run.nearMisses,
                       cause: run.crash ? (run.crash.segIdx < 0 ? "head" : "tail" + run.crash.segIdx) + ":" + run.crash.carType : "quit" });

  $("rTail").textContent = tail;
  $("rDist").textContent = dist + "m";
  $("rCoin").textContent = "+" + run.coins;
  $("rCause").textContent = run.crash ? culpritText() : "";
  $("rBadge").classList.toggle("show", isRecord);
  $("rBest").textContent = "최고 " + state.best + "대";
  $("continueBtn").classList.toggle("show", !run.continueUsed && ADS.canRewarded());
  $("doubleBtn").classList.toggle("show", run.coins > 0 && ADS.canRewarded());
  show("resultOverlay");
  drawTailStrip(); // 오버레이 표시 후에 그려야 clientWidth 가 잡힌다
  if(isRecord){ SND.newRecord(); FX.confetti(W / 2, H * 0.3, 36); track("stage_up", { kind: "record", tail }); }
}
function drawTailStrip(){
  const c = $("tailStrip"), n = TAIL.segs.length;
  const g = c.getContext("2d");
  const w = c.width = 648, h = c.height = 56; // 고정 비트맵 — CSS가 스케일 (백그라운드 탭 clientWidth=0 대비)
  g.clearRect(0, 0, w, h);
  if(!n) return;
  const shown = Math.min(n, 20);
  const cw = Math.min(46, (w - 50) / (shown + 1)); // 간격 = 차 길이보다 크게(겹침 방지)
  const x0 = (w - (shown + 1) * cw) / 2; // 중앙 정렬
  const y = h / 2;
  for(let i = shown - 1; i >= 0; i--){
    const x = x0 + (i + 1) * cw;
    drawCarShape(g, x, y, cw * 0.42, cw * 0.86, TAIL.segs[i].sprite, Math.sin(i * 0.9) * 0.22);
  }
  drawCarShape(g, x0, y, cw * 0.5, cw * 0.95, "car-player", 0);
}
function drawCarShape(g, x, y, w, l, name, rot){
  g.save(); g.translate(x, y); g.rotate(rot); g.rotate(-Math.PI / 2); // 옆으로 눕힘
  const im = typeof spr === "function" ? spr(name) : null;
  if(im) g.drawImage(im, -w / 2, -l / 2, w, l);
  else { g.fillStyle = PLACEHOLDER[name] || "#8b90b5"; roundRect(g, -w / 2, -l / 2, w, l, 3); g.fill(); }
  g.restore();
}

function retry(){
  SND.button();
  ADS.maybeInterstitial(() => startGame(), { skip: run && run.continueUsed });
}
function continueRun(){
  SND.button();
  ADS.showRewarded("continue", ok => {
    if(!ok) return;
    run.continueUsed = true;
    // 주변 클리어 + 무적 재개 (꼬리 유지 — 핵심 보상)
    for(const c of TRAFFIC.cars.slice()){
      if(c.wy > tailEndWY() - 250 && c.wy < run.wy + CONFIG.CONTINUE_CLEAR) TRAFFIC.remove(c);
    }
    run.invincibleT = CONFIG.CONTINUE_INVINCIBLE;
    run.crash = null; crashT = 0; ts = 1; slowmoT = 0;
    hide("resultOverlay");
    mode = "PLAY"; SND.playBgm();
    track("continue_used", { tail: TAIL.count() });
  });
}
function doubleCoins(){
  SND.button();
  ADS.showRewarded("double", ok => {
    if(!ok) return;
    state.coins += run.coins; // 한 번 더 (=2배)
    $("rCoin").textContent = "+" + run.coins * 2 + " ✔";
    $("doubleBtn").classList.remove("show");
    saveState(); hudCoin(-1);
  });
}

/* ── 마일스톤 ────────────────────────────────────────── */
function checkMilestone(){
  const n = TAIL.segs.length;
  for(const m of CONFIG.MILESTONES){
    if(n >= m && !run.milestones[m]){
      run.milestones[m] = true;
      SND.milestone(m);
      FX.floater(W / 2, H * 0.28, m + "대!", { size: 46, color: "#ffd24a", life: 1.0 });
      FX.confetti(W / 2, H * 0.3, 20);
      run.coins += m * 2; hudCoin(run.coins);
      track("stage_up", { kind: "tail", n: m });
    }
  }
}

/* ── HUD ─────────────────────────────────────────────── */
let _hTail = -9, _hDist = -9, _hCoin = -9;
function hudTail(n, punch){
  if(n === _hTail && !punch) return; _hTail = n;
  const el = $("tailN"); el.textContent = Math.max(0, n);
  if(punch){ const p = $("plate"); p.classList.remove("punch"); void p.offsetWidth; p.classList.add("punch"); }
}
function hudDist(m){ const v = Math.floor(m / 10) * 10; if(v === _hDist) return; _hDist = v; $("distTx").textContent = v + "m"; }
function hudCoin(n){ const v = n < 0 ? (run ? run.coins : 0) : n; if(v === _hCoin) return; _hCoin = v; $("coinTx").textContent = v; }
function refreshBestChip(){ $("bestChip").textContent = "BEST " + state.best; }
function refreshTitleStats(){
  $("titleBestN").textContent = state.best;
  $("titlePlays").textContent = state.plays ? state.plays + "판 주행" : "첫 주행";
}

/* ── 업데이트 ────────────────────────────────────────── */
function update(dtReal){
  FX.update(dtReal);
  if(hitstopT > 0){ hitstopT -= dtReal; return; }
  if(slowmoT > 0){ slowmoT -= dtReal; if(slowmoT <= 0) ts = 1; }
  const dt = dtReal * ts;

  if(mode === "TITLE"){
    attractT += dt;
    run.speed = 230;
    run.wy += run.speed * dt; run.d += run.speed * dt;
    run.x = Math.sin(attractT * 0.85) * CONFIG.LANE_W * 0.95;
    TAIL.push(run.d, run.x);
    TAIL.update(dt, run.d, run.wy);
    return;
  }
  if(mode !== "PLAY" && mode !== "CRASHING") return;

  if(mode === "PLAY"){
    run.time += dt;
    run.speed = Math.min(CONFIG.SPEED_MAX, CONFIG.SPEED0 + CONFIG.SPEED_RAMP * run.time);
    if(run.invincibleT > 0) run.invincibleT -= dt;
    if(run.clutchCd > 0) run.clutchCd -= dt;
    if(run.cutCd > 0) run.cutCd -= dt;
    if(run.comboT > 0){ run.comboT -= dt; if(run.comboT <= 0) run.combo = 0; }
    if(autoDodge) autoDrive(dt);
    else if(weaveAuto) run.x = Math.sin(run.time * 2.2) * CONFIG.LANE_W;
  } else {
    crashT += dtReal;
    if(crashT > 1.05){ showResults(); return; }
  }

  const spd = mode === "CRASHING" ? run.speed * 0.25 : run.speed;
  run.wy += spd * dt; run.d += spd * dt;
  TAIL.push(run.d, run.x);
  const prevSegs = TAIL.segs.length;
  TAIL.update(dt, run.d, run.wy);
  if(TAIL.segs.length > prevSegs){
    // 연결 확정 순간 — 자석 스냅
    SND.attach(); SND.haptic(15);
    checkMilestone();
    run.maxTail = Math.max(run.maxTail, TAIL.count());
    hudTail(TAIL.count(), true);
  }
  TRAFFIC.update(dt, run.wy, run.speed, TAIL.count(), tailEndWY());

  if(mode === "PLAY"){
    checkOvertakes();
    trackNearMiss();
    checkCollision();
    // 유지 보너스: 긴 꼬리를 끌고 버티는 것 자체가 재화
    run.coinFrac += TAIL.count() * CONFIG.COIN_HOLD_RATE * dt;
    if(run.coinFrac >= 1){ const add = Math.floor(run.coinFrac); run.coinFrac -= add; run.coins += add; hudCoin(run.coins); }
    hudDist(run.d / 10);
    // 줌: 행렬이 길수록 화면이 넓어진다 (점진)
    const k = Math.min(1, TAIL.count() / CONFIG.ZOOM_TAIL_FULL);
    const target = CONFIG.ZOOM0 + (CONFIG.ZOOM_MIN - CONFIG.ZOOM0) * k;
    zoom += (target - zoom) * Math.min(1, dt * 1.2);
  }
  leanV *= Math.pow(0.001, dtReal);
}

/* ── 렌더 ────────────────────────────────────────────── */
const PLACEHOLDER = {
  "car-player": "#ff5d5d", "car-blue": "#4f8df7", "car-green": "#5fe08a",
  "car-yellow": "#ffd24a", "car-purple": "#b07cf7", "car-taxi": "#ffb52e",
  "truck-red": "#d95f43", "bus-city": "#4fc3d9",
};
function roundRect(g, x, y, w, h, r){
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawRoad(){
  // 배경(노변)
  ctx.fillStyle = "#10131c"; ctx.fillRect(0, 0, W, H);
  // 도로면 — 원근 사다리꼴
  const half = roadHalf();
  ctx.beginPath();
  const STEP = 40;
  for(let sy = -20; sy <= H + 20; sy += STEP){ const x = W / 2 - half * zoom * persp(sy); sy === -20 ? ctx.moveTo(x, sy) : ctx.lineTo(x, sy); }
  for(let sy = H + 20; sy >= -20; sy -= STEP){ ctx.lineTo(W / 2 + half * zoom * persp(sy), sy); }
  ctx.closePath();
  const tile = spr("road-tile");
  if(tile){
    ctx.save(); ctx.clip();
    const bandH = 130;
    const off = (run.wy * zoom) % bandH;
    for(let sy = -bandH + off - bandH; sy < H + bandH; sy += bandH){
      const p = persp(sy + bandH / 2);
      const wRoad = half * 2 * zoom * p * 1.02;
      ctx.drawImage(tile, W / 2 - wRoad / 2, sy, wRoad, bandH + 1);
    }
    ctx.restore();
  } else {
    ctx.fillStyle = "#232733"; ctx.fill();
  }
  // 가장자리 라인
  ctx.lineWidth = 4;
  for(const side of [-1, 1]){
    ctx.beginPath();
    for(let sy = -20; sy <= H + 20; sy += STEP){
      const x = W / 2 + side * half * zoom * persp(sy);
      sy === -20 ? ctx.moveTo(x, sy) : ctx.lineTo(x, sy);
    }
    ctx.strokeStyle = "#e8eaf6"; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
  }
  // 차선 점선 (월드 고정 — 스크롤)
  const DASH = 90, DUTY = 0.55;
  ctx.strokeStyle = "#aab0d0"; ctx.globalAlpha = 0.5;
  for(let b = 1; b < CONFIG.LANES; b++){
    const bx = (b - CONFIG.LANES / 2) * CONFIG.LANE_W;
    const wyTop = run.wy + anchorY() / zoom + 100, wyBot = run.wy - (H - anchorY()) / zoom - 100;
    let wy = Math.floor(wyBot / DASH) * DASH;
    for(; wy < wyTop; wy += DASH){
      const sy1 = screenY(wy), sy2 = screenY(wy + DASH * DUTY);
      if(sy1 < -30 || sy2 > H + 30) continue;
      ctx.lineWidth = 5 * persp((sy1 + sy2) / 2) * zoom;
      ctx.beginPath();
      ctx.moveTo(screenX(bx, sy1), sy1);
      ctx.lineTo(screenX(bx, sy2), sy2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawVehicle(x, wy, w, len, name, o = {}){
  const sy = screenY(wy);
  if(sy < -200 || sy > H + 240) return;
  const p = zoom * persp(sy);
  let sw = w * p, sl = len * p;
  if(o.pop){ const k = 1 + 0.28 * o.pop; sw *= k; sl *= (2 - k) * 0.9 + 0.1; } // 스쿼시
  const sx = screenX(x + (o.wobble || 0), sy);
  ctx.save();
  ctx.translate(sx, sy);
  if(o.angle) ctx.rotate(o.angle);
  if(o.alpha != null) ctx.globalAlpha = o.alpha;
  // 그림자
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, -sw / 2 + 3, -sl / 2 + 5, sw, sl, 8 * p); ctx.fill();
  const im = spr(name);
  if(im){ ctx.drawImage(im, -sw / 2, -sl / 2, sw, sl); }
  else {
    // 플레이스홀더(제작 단계1 한정 — 아트 후 교체)
    ctx.fillStyle = PLACEHOLDER[name] || "#8b90b5";
    roundRect(ctx, -sw / 2, -sl / 2, sw, sl, 7 * p); ctx.fill();
    ctx.fillStyle = "rgba(15,18,30,0.55)";
    roundRect(ctx, -sw * 0.36, -sl * 0.18, sw * 0.72, sl * 0.34, 5 * p); ctx.fill();
  }
  if(o.blink){ // 차선변경 깜빡이
    if(Math.floor(performance.now() / 160) % 2 === 0){
      ctx.fillStyle = "#ffb52e";
      const bx = (o.blinkDir || 1) * sw / 2;
      ctx.beginPath(); ctx.arc(bx, -sl * 0.28, 5 * p, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx, sl * 0.28, 5 * p, 0, Math.PI * 2); ctx.fill();
    }
  }
  if(o.hl){ // 충돌 하이라이트
    ctx.strokeStyle = "#ff5d5d"; ctx.lineWidth = 4;
    roundRect(ctx, -sw / 2 - 5, -sl / 2 - 5, sw + 10, sl + 10, 9); ctx.stroke();
  }
  ctx.restore();
}

function render(){
  const shk = FX.shakeOffset();
  ctx.save();
  ctx.translate(shk.x, shk.y);
  drawRoad();

  // 그리기 목록 (위=멀리 먼저)
  const list = [];
  const inv = run.invincibleT > 0 && Math.floor(performance.now() / 120) % 2 === 0;
  for(const c of TRAFFIC.cars){
    const hl = mode === "CRASHING" && run.crash && run.crash.carId === c.id;
    list.push({ sy: screenY(c.wy), fn: () => drawVehicle(c.x, c.wy, c.w, c.len, c.sprite,
      { blink: c.state === "blink", blinkDir: c.toLane > c.lane ? 1 : -1, hl, angle: c.angle || 0 }) });
  }
  for(const j of TAIL.joins){
    const pose = TAIL.joinPose(j, run.d, run.wy);
    list.push({ sy: screenY(pose.wy), fn: () => drawVehicle(pose.x, pose.wy, CONFIG.CAR.w, CONFIG.CAR.len, j.sprite,
      { pop: 1 - pose.k, alpha: inv ? 0.35 : 1 }) });
  }
  for(let i = 0; i < TAIL.segs.length; i++){
    const s = TAIL.segs[i], wy = TAIL.segWorldY(i, run.wy);
    const next = i === 0 ? { x: run.x } : TAIL.segs[i - 1];
    const angle = Math.atan2(next.x - s.x, CONFIG.SPACING) * 0.8; // 경로 방향 회전 = 서펜타인
    const crashed = mode === "CRASHING" && run.crash && run.crash.segIdx === i;
    list.push({ sy: screenY(wy), fn: () => drawVehicle(s.x, wy, CONFIG.CAR.w, CONFIG.CAR.len, s.sprite,
      { angle, pop: s.popT > 0 ? s.popT / 0.28 : 0, wobble: s.wobble || 0, alpha: inv ? 0.35 : 1, hl: crashed }) });
  }
  // 선두
  const headCrashed = mode === "CRASHING" && run.crash && run.crash.segIdx === -1;
  list.push({ sy: anchorY(), fn: () => drawVehicle(run.x, run.wy, CONFIG.CAR.w, CONFIG.CAR.len, "car-player",
    { angle: Math.max(-0.3, Math.min(0.3, leanV * 0.02)), alpha: inv ? 0.35 : 1, hl: headCrashed }) });

  list.sort((a, b) => a.sy - b.sy);
  for(const it of list) it.fn();

  // 속도선 (고속/슬로모)
  if(mode === "PLAY" && (run.speed > 420 || ts < 1)){
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#e8eaf6"; ctx.lineWidth = 2;
    for(let i = 0; i < 8; i++){
      const x = (i * 137 + (run.wy * 2) % 61) % W;
      const y1 = (i * 211 + run.wy * (3 + i % 3)) % H;
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y1 + 40 + i * 6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  FX.draw(ctx);

  if(DEBUG) drawDebug();
  ctx.restore();
}

function drawDebug(){
  ctx.strokeStyle = "rgba(95,224,138,0.8)"; ctx.lineWidth = 1;
  const box = (x, wy, w, l) => {
    const sy = screenY(wy), p = zoom * persp(sy);
    ctx.strokeRect(screenX(x, sy) - w * p / 2, sy - l * p / 2, w * p, l * p);
  };
  box(run.x, run.wy, CONFIG.CAR.w * CONFIG.HIT_W, CONFIG.CAR.len * CONFIG.HIT_L);
  for(let i = 0; i < TAIL.segs.length; i++) box(TAIL.segs[i].x, TAIL.segWorldY(i, run.wy), CONFIG.CAR.w * CONFIG.TAIL_HIT_W, CONFIG.CAR.len * CONFIG.TAIL_HIT_L);
  ctx.strokeStyle = "rgba(255,93,93,0.8)";
  for(const c of TRAFFIC.cars) box(c.x, c.wy, c.w, c.len);
  ctx.fillStyle = "#7CFC8E"; ctx.font = "12px monospace"; ctx.textAlign = "left";
  ctx.fillText(`fps ${fps.toFixed(0)} tail ${TAIL.count()} cars ${TRAFFIC.cars.length} spd ${run.speed | 0} ts ${ts}`, 10, H - 12);
}

/* ── 메인 루프 ───────────────────────────────────────── */
let lastT = 0, fps = 60;
function frame(t){
  const dtReal = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  fps = fps * 0.95 + (1 / Math.max(1e-3, dtReal)) * 0.05;
  update(dtReal);
  render();
  requestAnimationFrame(frame);
}

/* ── 버튼 배선 ───────────────────────────────────────── */
$("startBtn").onclick = () => { SND.button(); startGame(); };
$("retryBtn").onclick = retry;
$("continueBtn").onclick = continueRun;
$("doubleBtn").onclick = doubleCoins;
$("homeBtn").onclick = () => { SND.button(); goTitle(); };
$("pauseBtn").onclick = () => { if(mode !== "PLAY") return; SND.button(); mode = "PAUSE"; show("pauseOverlay"); };
$("resumeBtn").onclick = () => { SND.button(); hide("pauseOverlay"); mode = "PLAY"; };
$("pRetryBtn").onclick = () => { SND.button(); hide("pauseOverlay"); startGame(); };
$("pHomeBtn").onclick = () => { SND.button(); goTitle(); };
function syncSndBtns(){
  $("bgmBtn").classList.toggle("off", !state.snd.bgm);
  $("sfxBtn").classList.toggle("off", !state.snd.sfx);
}
$("bgmBtn").onclick = () => { state.snd.bgm = !state.snd.bgm; saveState(); SND.applySndSettings(); if(state.snd.bgm && mode !== "TITLE") SND.playBgm(); syncSndBtns(); };
$("sfxBtn").onclick = () => { state.snd.sfx = !state.snd.sfx; saveState(); SND.button(); syncSndBtns(); };

/* ── QA/디버그 API (비네이티브 한정 — shoot.js 눈검증·개발용) ── */
if(!IS_NATIVE){
  window.__TT = {
    start: startGame,
    cheat(n){
      const sprites = ["car-blue", "car-green", "car-yellow", "car-purple", "car-taxi"];
      for(let i = 0; i < n; i++) TAIL.segs.push({ x: run.x, sprite: sprites[i % 5], popT: 0, wobble: 0 });
      run.maxTail = Math.max(run.maxTail, TAIL.count()); hudTail(TAIL.count());
    },
    weave(on){ weaveAuto = on !== false; if(run) run.started = true; hideHint(); },
    setX(x){ weaveAuto = false; autoDodge = false; if(run){ run.x = x; run.started = true; } hideHint(); },
    auto(on){ autoDodge = on !== false; weaveAuto = false; if(run) run.started = true; hideHint(); },
    canyon(){ TRAFFIC.mkCar(0, run.wy + 750, run.speed, { type: "truck" }); TRAFFIC.mkCar(2, run.wy + 750, run.speed, { type: "truck" }); },
    forceCrash(){ const c = TRAFFIC.mkCar(1, run.wy + 60, run.speed, {}); c.x = run.x; c.wy = run.wy + 30; },
    results(){ hide("titleOverlay"); run.crash = { segIdx: 2, carType: "truck", x: 0, wy: run.wy, carId: -1 }; showResults(); },
    state(){ return { mode, tail: TAIL.count(), cars: TRAFFIC.cars.length, d: run.d, fps, coins: run.coins, near: run.nearMisses, maxTail: run.maxTail }; },
    tick(ms){ // rAF 없이 고정 스텝 시뮬 (백그라운드 탭/헤드리스 QA용 — 결정적)
      const steps = Math.max(1, Math.round(ms / 16.6));
      for(let i = 0; i < steps; i++) update(0.0166);
      render();
    },
  };
}

/* ── 부트 ────────────────────────────────────────────── */
resize();
ADS.init();
loadAssets(() => { /* 스프라이트 유무와 무관하게 진행 (플레이스홀더 폴백) */ });
goTitle();
syncSndBtns();
requestAnimationFrame(frame); // app_open 은 analytics.js 가 자동 발사

// PWA: 웹에서만 서비스워커 등록(번들 앱은 localhost 가드로 스킵)
if("serviceWorker" in navigator && location.protocol.startsWith("http") && !/capacitor|localhost|127\.0\.0\.1/.test(location.host + location.protocol)){
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
}
