"use strict";
/* 탄피성벽 (Brass Wall) — 메인.
 * 절대 규칙(PRD): 발사한 총알은 반드시 화면에 남아 충돌 지형(탄피 블록)이 된다.
 * 좌표계: 월드 = 그리드 셀 단위 float. 렌더 시 cell(px) 곱. 고정 타임스텝(1/60). */

/* ══════════════════ 0. 뷰/캔버스 ══════════════════ */
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const stageEl = document.getElementById("stage");
const dpr = Math.min(2, window.devicePixelRatio || 1);
let W = 0, H = 0;              // 스테이지 CSS px
let cell = 30;                 // 셀 px
let cols = CFG.view.cols, rows = 24;
let ox = 0, oy = 0;            // 그리드 오프셋 px (중앙 정렬)
let bgCv = null, brassCv = null, brassCtx = null;

function resize() {
  const r = stageEl.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = W / cols;
  const newRows = Math.max(16, Math.floor(H / cell));
  ox = 0; oy = (H - newRows * cell) / 2;
  if (newRows !== rows || !dur) { rows = newRows; gridInit(); }
  buildBg();
  buildBrassLayer();
}
window.addEventListener("resize", resize);

function buildBg() {
  bgCv = document.createElement("canvas");
  bgCv.width = Math.round(W * dpr); bgCv.height = Math.round(H * dpr);
  const b = bgCv.getContext("2d");
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = b.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0a0e1c"); g.addColorStop(0.55, "#0b1022"); g.addColorStop(1, "#080b16");
  b.fillStyle = g; b.fillRect(0, 0, W, H);
  // 전용 배경 아트(bg-arena.webp, codex-image) — 절차적 민무늬 제거. 로드 전·실패 시 그라디언트 폴백
  const bgIm = typeof spr === "function" ? spr("bg-arena") : null;
  if (bgIm && bgIm.complete && bgIm.naturalWidth) {
    const iw = bgIm.naturalWidth, ih = bgIm.naturalHeight;
    const s = Math.max(W / iw, H / ih), sw = W / s, sh = H / s;
    b.drawImage(bgIm, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, H);
  }
  // 미세 그리드 (탄피 위치 가독성 — PRD §7.1)
  b.strokeStyle = "rgba(90,110,180,0.10)"; b.lineWidth = 1;
  b.beginPath();
  for (let x = 0; x <= cols; x++) { b.moveTo(ox + x * cell, oy); b.lineTo(ox + x * cell, oy + rows * cell); }
  for (let y = 0; y <= rows; y++) { b.moveTo(ox, oy + y * cell); b.lineTo(ox + cols * cell, oy + y * cell); }
  b.stroke();
  // 교차점 도트
  b.fillStyle = "rgba(120,150,220,0.10)";
  for (let x = 1; x < cols; x++) for (let y = 1; y < rows; y++) b.fillRect(ox + x * cell - 1, oy + y * cell - 1, 2, 2);
  // 아레나 테두리
  b.strokeStyle = "rgba(120,150,220,0.22)"; b.lineWidth = 2;
  b.strokeRect(ox + 1, oy + 1, cols * cell - 2, rows * cell - 2);
  // 비네트 (배경 아트에 이미 코너 비네트가 있어 가볍게만)
  const v = b.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.26)");
  b.fillStyle = v; b.fillRect(0, 0, W, H);
}
function buildBrassLayer() {
  brassCv = document.createElement("canvas");
  brassCv.width = Math.round(W * dpr); brassCv.height = Math.round(H * dpr);
  brassCtx = brassCv.getContext("2d");
  brassCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (dur) for (let i = 0; i < dur.length; i++) if (dur[i] > 0) redrawCell(i, 1);
}

/* ══════════════════ 1. 탄피 그리드 (게임의 심장) ══════════════════ */
let dur = null, timer = null, turretMark = null, turretCd = null;
let wallCount = 0, turretList = [];

function gridInit() {
  const n = cols * rows;
  dur = new Uint8Array(n); timer = new Float32Array(n);
  turretMark = new Uint8Array(n); turretCd = new Float32Array(n);
  wallCount = 0; turretList = [];
}
const gi = (cx, cy) => cx + cy * cols;
const inB = (cx, cy) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
const solidCell = (cx, cy) => !inB(cx, cy) || dur[gi(cx, cy)] > 0;

function solidCircle(x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    if (!solidCell(cx, cy)) continue;
    const nx = Math.max(cx, Math.min(x, cx + 1)), ny = Math.max(cy, Math.min(y, cy + 1));
    if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return true;
  }
  return false;
}
// 축 분리 이동(그리드 슬라이드). 반환: 실제 이동 여부 {mx,my}
function moveCircle(o, dx, dy) {
  let mx = false, my = false;
  if (dx !== 0) { const nx = o.x + dx; if (!solidCircle(nx, o.y, o.r)) { o.x = nx; mx = true; } }
  if (dy !== 0) { const ny = o.y + dy; if (!solidCircle(o.x, ny, o.r)) { o.y = ny; my = true; } }
  return { mx, my };
}
function decayDuration() {
  const steel = upLv("steel"), rapid = upLv("rapid");
  return CFG.BRASS.decay * Math.pow(1.45, steel) * Math.pow(0.7, rapid);
}
function brassCap() { return CFG.BRASS.maxDur + upLv("steel"); }

function addBrass(cx, cy) {
  const i = gi(cx, cy);
  const first = dur[i] === 0;
  if (first) {
    dur[i] = Math.min(brassCap(), 1 + upLv("steel"));
    wallCount++;
    if (run) run.maxWall = Math.max(run.maxWall, wallCount);
    const tl = upLv("turret");
    if (tl > 0 && Math.random() < 0.08 + 0.05 * tl) { turretMark[i] = 1; turretCd[i] = 0.7; turretList.push(i); }
  } else {
    dur[i] = Math.min(brassCap(), dur[i] + 1);
  }
  timer[i] = decayDuration();
  redrawCell(i, 1);
  const px = cx + 0.5, py = cy + 0.5;
  FX.dust(px, py, "#e8c06a", 4);
  FX.ring(px, py, "rgba(233,196,106,.6)", 0.1, 0.45, 0.22, 0.07);
  SND.play("clink", 0.9 + dur[i] * 0.08 + Math.random() * 0.06);
}
function damageCell(cx, cy, cause) {
  const i = gi(cx, cy);
  if (dur[i] === 0) return;
  dur[i]--;
  FX.dust(cx + 0.5, cy + 0.5, "#caa04b", 6);
  if (dur[i] === 0) destroyCell(i, cause);
  else redrawCell(i, 1);
}
function destroyCell(i, cause) {
  const cx = i % cols, cy = (i / cols) | 0;
  dur[i] = 0;
  if (turretMark[i]) { turretMark[i] = 0; turretList = turretList.filter(t => t !== i); }
  redrawCell(i, 1);
  wallCount--;
  FX.dust(cx + 0.5, cy + 0.5, cause === "decay" ? "#7a6a45" : "#ffd97a", cause === "decay" ? 4 : 8);
  if (cause !== "decay") SND.play("brk", 0.9 + Math.random() * 0.15);
  const bl = upLv("boom");
  if (bl > 0 && run && run.boomBudget > 0) {
    run.boomBudget--;
    explode(cx + 0.5, cy + 0.5, 0.9 + 0.45 * bl, bl);
  }
}
function updateGrid(dt) {
  for (let i = 0; i < dur.length; i++) {
    if (dur[i] === 0) continue;
    timer[i] -= dt;
    if (timer[i] <= 0) {
      if (dur[i] > 1) { dur[i]--; timer[i] = decayDuration(); redrawCell(i, 1); }
      else destroyCell(i, "decay");
    }
    if (turretMark[i] && dur[i] > 0) {
      turretCd[i] -= dt;
      if (turretCd[i] <= 0) {
        const cx = i % cols + 0.5, cy = ((i / cols) | 0) + 0.5;
        const t = nearestEnemy(cx, cy, 3.6);
        if (t) {
          turretCd[i] = 1.4;
          spawnBullet(cx, cy, Math.atan2(t.y - cy, t.x - cx), true);
          SND.play("turret", 0.9 + Math.random() * 0.2);
        } else turretCd[i] = 0.25;
      }
    }
  }
}
// 총알 소멸점 → 탄피 고착 (플레이어 근접 셀은 진행 방향으로 밀어서)
function settleBrass(x, y, dx, dy) {
  let cx = Math.floor(x), cy = Math.floor(y);
  for (let tries = 0; tries < 3; tries++) {
    if (!inB(cx, cy)) return fizzle(x, y);
    const d2 = (player.x - cx - 0.5) ** 2 + (player.y - cy - 0.5) ** 2;
    if (d2 < CFG.BRASS.minDist * CFG.BRASS.minDist) {
      if (Math.abs(dx) > Math.abs(dy)) cx += Math.sign(dx) || 1; else cy += Math.sign(dy) || 1;
      continue;
    }
    addBrass(cx, cy);
    return;
  }
  fizzle(x, y);
}
function fizzle(x, y) { FX.dust(x, y, "#9a8a5f", 3); }

// 탄피 셀 렌더 (오프스크린) — 스프라이트 우선, 없으면 임시 폴백(make 단계에서 webp 교체)
function redrawCell(i, alpha) {
  const cx = i % cols, cy = (i / cols) | 0;
  const px = ox + cx * cell, py = oy + cy * cell;
  brassCtx.clearRect(px, py, cell, cell);
  if (dur[i] === 0) return;
  const tier = Math.min(3, dur[i]);
  brassCtx.globalAlpha = alpha;
  const im = spr("brass" + tier);
  if (im) {
    brassCtx.drawImage(im, px, py, cell, cell);
  } else {
    const pad = cell * 0.06;
    const shades = ["", "#8a6a2f", "#b8893b", "#d9a441"];
    brassCtx.fillStyle = shades[tier];
    brassCtx.fillRect(px + pad, py + pad, cell - pad * 2, cell - pad * 2);
    brassCtx.fillStyle = "rgba(255,235,170,.35)";
    brassCtx.fillRect(px + pad, py + pad, cell - pad * 2, cell * 0.18);
    brassCtx.strokeStyle = "rgba(60,42,10,.8)"; brassCtx.lineWidth = 2;
    brassCtx.strokeRect(px + pad, py + pad, cell - pad * 2, cell - pad * 2);
  }
  if (turretMark[i]) {
    const im2 = spr("turret-core");
    if (im2) brassCtx.drawImage(im2, px + cell * 0.22, py + cell * 0.22, cell * 0.56, cell * 0.56);
    else {
      brassCtx.fillStyle = "#3ff6ff";
      brassCtx.beginPath(); brassCtx.arc(px + cell / 2, py + cell / 2, cell * 0.16, 0, Math.PI * 2); brassCtx.fill();
    }
  }
  brassCtx.globalAlpha = 1;
}

/* ══════════════════ 2. 입력 (가상 조이스틱 + WASD) ══════════════════ */
const keys = {};
window.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  // 데스크톱(포털) 일시정지 토글 — pauseBtn/resumeBtn 과 동일 로직
  if (e.key === "Escape" || e.key.toLowerCase() === "p") {
    if (phase === "run") { SND.play("ui"); setPhase("pause"); }
    else if (phase === "pause") { SND.play("ui"); setPhase("run"); }
  }
});
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
const stick = { active: false, id: -1, bx: 0, by: 0, vx: 0, vy: 0 };
const stickEl = document.getElementById("stick");
const knobEl = document.getElementById("stickKnob");
const STICK_R = 52;

stageEl.addEventListener("pointerdown", e => {
  unlockAudio();
  if (phase !== "run") return;
  if (stick.active) return;
  stick.active = true; stick.id = e.pointerId;
  stick.bx = e.clientX; stick.by = e.clientY; stick.vx = 0; stick.vy = 0;
  const r = stageEl.getBoundingClientRect();
  stickEl.style.left = (e.clientX - r.left) + "px";
  stickEl.style.top = (e.clientY - r.top) + "px";
  stickEl.classList.add("on");
  knobEl.style.transform = "translate(-50%,-50%)";
});
window.addEventListener("pointermove", e => {
  if (!stick.active || e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.bx, dy = e.clientY - stick.by;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
  stick.vx = dx / STICK_R; stick.vy = dy / STICK_R;
  knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
});
function endStick(e) {
  if (!stick.active || (e.pointerId !== undefined && e.pointerId !== stick.id)) return;
  stick.active = false; stick.vx = 0; stick.vy = 0;
  stickEl.classList.remove("on");
}
window.addEventListener("pointerup", endStick);
window.addEventListener("pointercancel", endStick);

function inputVec() {
  let x = stick.vx, y = stick.vy;
  if (keys["w"] || keys["arrowup"]) y -= 1;
  if (keys["s"] || keys["arrowdown"]) y += 1;
  if (keys["a"] || keys["arrowleft"]) x -= 1;
  if (keys["d"] || keys["arrowright"]) x += 1;
  const d = Math.hypot(x, y);
  if (d > 1) { x /= d; y /= d; }
  return { x, y, mag: Math.min(1, d) };
}
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  SND.bgm(true); // 타이틀부터 BGM (파일 없으면 조용히 무시)
}

/* ══════════════════ 3. 업그레이드 (로그라이트 3택) ══════════════════ */
const UPGRADES = [
  { id: "rate",   tag: "n", name: "속사",        max: 5, desc: "발사 간격 -12%" },
  { id: "multi",  tag: "n", name: "멀티샷",      max: 3, desc: "투사체 +1" },
  { id: "pierce", tag: "n", name: "관통탄",      max: 3, desc: "관통 +1" },
  { id: "range",  tag: "n", name: "장거리 배럴", max: 2, desc: "사거리 +18%" },
  { id: "move",   tag: "n", name: "스러스터",    max: 4, desc: "이동 속도 +10%" },
  { id: "magnet", tag: "n", name: "자기장",      max: 4, desc: "젬 흡수 반경 +35%" },
  { id: "hp",     tag: "n", name: "장갑판",      max: 3, desc: "최대 체력 +1 · 즉시 1 회복" },
  { id: "boom",   tag: "b", name: "유폭 탄피",   max: 3, desc: "탄피가 부서질 때 폭발" },
  { id: "turret", tag: "b", name: "포탑화",      max: 3, desc: "새 탄피가 확률로 포탑이 된다" },
  { id: "lane",   tag: "b", name: "부스트 레인", max: 3, desc: "탄피 옆에서 이동 +15%" },
  { id: "rapid",  tag: "b", name: "속사 부식",   max: 2, desc: "부식 -30% 빨라짐 · 발사 -15%" },
  { id: "steel",  tag: "b", name: "강철 탄피",   max: 2, desc: "탄피 내구 +1 · 부식 +45% 느려짐" },
];
function upLv(id) { return run ? (run.up[id] || 0) : 0; }
// 파생 스탯
function gunInterval() { return CFG.gun.interval * Math.pow(0.88, upLv("rate")) * Math.pow(0.85, upLv("rapid")) * Math.pow(0.92, Meta.shopLv("rate")); }
function gunRange() { return CFG.gun.range * Math.pow(1.18, upLv("range")); }
function gunProjectiles() { return CFG.gun.projectiles + upLv("multi"); }
function gunPierce() { return CFG.gun.pierce + upLv("pierce"); }
function moveSpeed() {
  let s = CFG.player.speed * Math.pow(1.10, upLv("move")) * Math.pow(1.07, Meta.shopLv("move"));
  if (upLv("lane") > 0 && player) {
    const cx = Math.floor(player.x), cy = Math.floor(player.y);
    const near = (inB(cx + 1, cy) && dur[gi(cx + 1, cy)]) || (inB(cx - 1, cy) && dur[gi(cx - 1, cy)]) ||
                 (inB(cx, cy + 1) && dur[gi(cx, cy + 1)]) || (inB(cx, cy - 1) && dur[gi(cx, cy - 1)]);
    if (near) s *= 1 + 0.15 * upLv("lane");
  }
  return s;
}
function magnetR() { return CFG.gems.magnet * Math.pow(1.35, upLv("magnet")) * (1 + 0.25 * Meta.shopLv("magnet")); }

function rollChoices() {
  const pool = UPGRADES.filter(u => upLv(u.id) < u.max);
  const brass = pool.filter(u => u.tag === "b"), norm = pool.filter(u => u.tag === "n");
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  shuffle(brass); shuffle(norm);
  const picks = [];
  if (brass.length) picks.push(brass.pop());              // 정체성 빌드가 항상 1장은 보이게
  const rest = shuffle(brass.concat(norm));
  while (picks.length < 3 && rest.length) picks.push(rest.pop());
  while (picks.length < 3) picks.push({ id: "heal", tag: "n", name: "응급 수리", max: 99, desc: "체력 1 회복" });
  return shuffle(picks);
}
function applyUpgrade(u) {
  if (u.id === "heal") { run.hp = Math.min(run.maxHp, run.hp + 1); }
  else {
    run.up[u.id] = (run.up[u.id] || 0) + 1;
    if (u.id === "hp") { run.maxHp++; run.hp = Math.min(run.maxHp, run.hp + 1); }
  }
  track("stage_up", { lv: run.lv, pick: u.id, rank: upLv(u.id) });
}

/* ══════════════════ 4. 엔티티 ══════════════════ */
let player = null, run = null;
let bullets = [], enemies = [], gems = [], spawnsQ = [];

function newRun() {
  return {
    t: 0, lv: 1, xp: 0, need: CFG.level.base + CFG.level.per, combo: 0, comboT: 0,
    hp: CFG.player.hp + Meta.shopLv("hp"), maxHp: CFG.player.hp + Meta.shopLv("hp"),
    kills: 0, gemGot: 0, maxWall: 0,
    revives: CFG.player.revives + Meta.shopLv("revive"),
    up: {}, fireCd: 0.4, spawnCd: 1.2, aim: -Math.PI / 2,
    crisisDone: false, sawRusher: false, sawDrone: false,
    boomBudget: 6, trapWarnCd: 0, hintStep: 0, earned: 0, doubled: false,
    over: false, cause: "",
  };
}
function spawnPlayer() {
  player = { x: cols / 2, y: rows / 2, r: CFG.player.r, iframe: 0, squash: 0, moveA: 0 };
}
function nearestEnemy(x, y, maxR) {
  let best = null, bd = (maxR || 1e9) * (maxR || 1e9);
  for (const e of enemies) {
    if (e.dead || e.ghost) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function edgeSpawnPos() {
  const side = (Math.random() * 4) | 0;
  const fx = 0.7 + Math.random() * (cols - 1.4), fy = 0.7 + Math.random() * (rows - 1.4);
  if (side === 0) return { x: fx, y: 0.7 };
  if (side === 1) return { x: fx, y: rows - 0.7 };
  if (side === 2) return { x: 0.7, y: fy };
  return { x: cols - 0.7, y: fy };
}
function queueSpawn(type, x, y) { spawnsQ.push({ type, x, y, t: CFG.spawn.telegraph }); }
function materialize(s) {
  const c = CFG.enemies[s.type];
  const hpScale = 1 + Math.floor(run.t / 45) * 0.5;          // 시간 스케일링
  enemies.push({
    type: s.type, x: s.x, y: s.y, r: c.r,
    hp: Math.round(c.hp * hpScale), maxHp: Math.round(c.hp * hpScale),
    spd: c.speed * (0.9 + Math.random() * 0.2), dmg: c.dmg, gem: c.gem,
    stun: 0, squash: 0, hitT: 0, side: Math.random() < 0.5 ? 1 : -1,
    bob: Math.random() * Math.PI * 2, lastCell: -1, dead: false,
  });
  FX.ring(s.x, s.y, s.type === "rusher" ? "rgba(255,159,28,.7)" : s.type === "drone" ? "rgba(185,103,255,.7)" : "rgba(255,77,109,.7)", 0.5, 0.15, 0.22, 0.08);
}
function spawnDirector(dt) {
  for (let i = spawnsQ.length - 1; i >= 0; i--) {
    spawnsQ[i].t -= dt;
    if (spawnsQ[i].t <= 0) { materialize(spawnsQ[i]); spawnsQ.splice(i, 1); }
  }
  run.spawnCd -= dt;
  const prog = Math.min(1, run.t / CFG.spawn.rampT);
  const int = CFG.spawn.baseInt + (CFG.spawn.minInt - CFG.spawn.baseInt) * prog;
  if (run.spawnCd <= 0 && enemies.length + spawnsQ.length < CFG.spawn.maxAlive) {
    run.spawnCd = int * (0.75 + Math.random() * 0.5);
    let type = "walker";
    if (run.t >= CFG.spawn.droneT && Math.random() < 0.14) type = "drone";
    else if (run.t >= CFG.spawn.rusherT && Math.random() < 0.18) type = "rusher";
    if (type === "rusher" && !run.sawRusher) { run.sawRusher = true; stateTitle(T("러셔 출현"), T("탄피 벽을 부순다!")); }
    if (type === "drone" && !run.sawDrone) { run.sawDrone = true; stateTitle(T("드론 출현"), T("벽 위로 날아온다!")); }
    const p = edgeSpawnPos();
    queueSpawn(type, p.x, p.y);
  }
  if (!run.crisisDone && run.t >= CFG.spawn.firstCrisisT) {
    run.crisisDone = true;
    stateTitle(T("첫 위기"), T("포위 웨이브!"));
    SND.play("trap");
    for (let i = 0; i < CFG.spawn.burstN; i++) {
      const a = (i / CFG.spawn.burstN) * Math.PI * 2;
      const x = Math.max(0.7, Math.min(cols - 0.7, player.x + Math.cos(a) * 4.2));
      const y = Math.max(0.7, Math.min(rows - 0.7, player.y + Math.sin(a) * 4.2));
      queueSpawn("walker", x, y);
    }
  }
}
function spawnBullet(x, y, ang, fromTurret) {
  bullets.push({
    x, y, dx: Math.cos(ang), dy: Math.sin(ang),
    spd: CFG.gun.speed, traveled: 0, range: fromTurret ? 3.6 : gunRange(),
    pierce: fromTurret ? 0 : gunPierce() - 1, dmg: CFG.gun.dmg, turret: !!fromTurret,
  });
}
function fireGun(dt) {
  run.fireCd -= dt;
  const t = nearestEnemy(player.x, player.y, 1e9);
  if (t) run.aim = Math.atan2(t.y - player.y, t.x - player.x);
  if (!t || run.fireCd > 0) return;
  run.fireCd = gunInterval();
  const n = gunProjectiles();
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * CFG.gun.spread;
    spawnBullet(player.x + Math.cos(run.aim) * 0.4, player.y + Math.sin(run.aim) * 0.4, run.aim + off, false);
  }
  player.squash = 0.12;
  FX.dust(player.x + Math.cos(run.aim) * 0.5, player.y + Math.sin(run.aim) * 0.5, "#fff2b0", 2);
  SND.play("shoot", 0.92 + Math.random() * 0.16);
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const step = b.spd * dt;
    b.x += b.dx * step; b.y += b.dy * step; b.traveled += step;
    let settled = false;
    // 적 명중
    for (const e of enemies) {
      if (e.dead) continue;
      const rr = e.r + 0.16;
      if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
        damageEnemy(e, b.dmg);
        if (b.pierce > 0) { b.pierce--; continue; }
        // 관통 소진 → 그 자리 고착 (PRD 5.3-1)
        if (b.turret) fizzle(b.x, b.y); else settleBrass(b.x, b.y, b.dx, b.dy);
        settled = true;
        break;
      }
    }
    if (!settled) {
      const outX = b.x < 0.05 || b.x > cols - 0.05, outY = b.y < 0.05 || b.y > rows - 0.05;
      if (b.traveled >= b.range || outX || outY) {
        // 사거리 한계 → 고착 (PRD 5.3-2). 화면 밖이면 경계 안쪽으로 클램프
        b.x = Math.max(0.1, Math.min(cols - 0.1, b.x));
        b.y = Math.max(0.1, Math.min(rows - 0.1, b.y));
        if (b.turret) fizzle(b.x, b.y); else settleBrass(b.x, b.y, b.dx, b.dy);
        settled = true;
      }
    }
    if (settled) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
  }
}
function damageEnemy(e, dmg) {
  e.hp -= dmg; e.hitT = 0.09; e.squash = 0.16;
  SND.play("hit", 0.9 + Math.random() * 0.25);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  run.kills++;
  const col = e.type === "rusher" ? "#ff9f1c" : e.type === "drone" ? "#b967ff" : "#ff4d6d";
  FX.burst(e.x, e.y, col, 10, 2.4, 0.12, 0.45);
  FX.ring(e.x, e.y, col, 0.1, 0.7, 0.3, 0.06);
  FX.popup(e.x, e.y - 0.3, "+" + e.gem, "#3dffa2");
  for (let i = 0; i < e.gem; i++) {
    if (gems.length > 140) { gainXp(1); continue; }
    const a = Math.random() * Math.PI * 2;
    gems.push({ x: e.x, y: e.y, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, t: CFG.gems.life, pull: false });
  }
}
function explode(x, y, r, dmg) {
  FX.ring(x, y, "#ffd97a", 0.15, r, 0.32, 0.12);
  FX.burst(x, y, "#ffd97a", 12, 3, 0.13, 0.4);
  FX.shake(3.5);
  SND.play("boom", 0.9 + Math.random() * 0.2);
  for (const e of enemies) {
    if (e.dead) continue;
    if ((e.x - x) ** 2 + (e.y - y) ** 2 < r * r) damageEnemy(e, dmg);
  }
}
// 적이 탄피 안에 파묻히면 가장 가까운 빈 셀로 밀어냄
function unstickEnemy(e, dt) {
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  if (!solidCell(cx, cy)) return false;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const [dx, dy] of dirs) {
    if (!solidCell(cx + dx, cy + dy)) {
      e.x += dx * e.spd * dt * 2.4; e.y += dy * e.spd * dt * 2.4;
      return true;
    }
  }
  return true; // 완전 매몰 — 제자리
}
function updateEnemies(dt) {
  // 이웃 분리(공간 해시)
  const hash = new Map();
  for (const e of enemies) {
    if (e.dead) continue;
    const k = Math.floor(e.x) + Math.floor(e.y) * cols;
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push(e);
  }
  for (const e of enemies) {
    if (e.dead) continue;
    const cx = Math.floor(e.x), cy = Math.floor(e.y);
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
      const arr = hash.get(xx + yy * cols);
      if (!arr) continue;
      for (const o of arr) {
        if (o === e || o.dead) continue;
        const dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy, rr = e.r + o.r;
        if (d2 > 0.0001 && d2 < rr * rr) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5 / d;
          e.x += dx * push; e.y += dy * push;
        }
      }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies[i] = enemies[enemies.length - 1]; enemies.pop(); continue; }
    if (e.hitT > 0) e.hitT -= dt;
    if (e.squash > 0) e.squash -= dt;
    if (e.stun > 0) { e.stun -= dt; continue; }
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    if (e.type === "drone") {
      e.bob += dt * 5;
      e.x += ux * e.spd * dt; e.y += uy * e.spd * dt;      // 탄피 무시(비행)
    } else if (e.type === "rusher") {
      const nx = e.x + ux * e.spd * dt, ny = e.y + uy * e.spd * dt;
      const ccx = Math.floor(nx), ccy = Math.floor(ny), ci = inB(ccx, ccy) ? gi(ccx, ccy) : -1;
      if (ci >= 0 && dur[ci] > 0 && ci !== e.lastCell) {
        e.lastCell = ci;
        damageCell(ccx, ccy, "break");                     // 벽을 부수며 통과 (PRD 5.3)
        e.stun = CFG.enemies.rusher.breakStun;
        FX.shake(2);
      }
      e.x = Math.max(0.3, Math.min(cols - 0.3, nx));
      e.y = Math.max(0.3, Math.min(rows - 0.3, ny));
    } else {
      // 워커 — 탄피에 막힘 → 축 슬라이드, 둘 다 막히면 접선(병목 유도의 핵심)
      if (!unstickEnemy(e, dt)) {
        const mv = moveCircle(e, ux * e.spd * dt, uy * e.spd * dt);
        if (!mv.mx && !mv.my) {
          moveCircle(e, -uy * e.side * e.spd * dt, ux * e.side * e.spd * dt);
        }
      }
    }
    // 플레이어 접촉
    const pr = e.r + player.r;
    if ((e.x - player.x) ** 2 + (e.y - player.y) ** 2 < pr * pr) hitPlayer(e);
  }
}
function updateGems(dt) {
  const mr = magnetR();
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    g.t -= dt;
    if (g.t <= 0) { gems[i] = gems[gems.length - 1]; gems.pop(); continue; }
    const dx = player.x - g.x, dy = player.y - g.y, d = Math.hypot(dx, dy);
    if (d < mr) g.pull = true;
    if (g.pull && d > 0.01) {
      const sp = CFG.gems.speed * Math.min(1.6, 0.4 + (mr / Math.max(d, 0.2)) * 0.4);
      g.vx = dx / d * sp; g.vy = dy / d * sp;
    } else { g.vx *= Math.pow(0.02, dt); g.vy *= Math.pow(0.02, dt); }
    g.x += g.vx * dt; g.y += g.vy * dt;
    if (d < 0.42) {
      gems[i] = gems[gems.length - 1]; gems.pop();
      run.gemGot++;
      gainXp(1);
      run.comboT = 1.2;
      run.combo = (run.comboT > 0 ? (run.combo || 0) : 0) + 1;
      SND.play("gem", Math.min(1.7, 1 + (run.combo % 12) * 0.05));
    }
  }
  if (run.comboT > 0) run.comboT -= dt; else run.combo = 0;
}
function gainXp(n) {
  run.xp += n;
  if (run.xp >= run.need && phase === "run") {
    run.xp -= run.need;
    run.lv++;
    run.need = CFG.level.base + run.lv * CFG.level.per;
    openLevelup();
  }
}
function hitPlayer(e) {
  if (player.iframe > 0 || phase !== "run") return;
  const trapped = isTrapped();
  player.iframe = CFG.player.iframe;
  run.hp -= e.dmg;
  FX.hitstop(CFG.juice.hitstop);
  FX.shake(CFG.juice.shake);
  FX.flash("#ff3355", 0.35);
  SND.play("hurt");
  // 넉백(그리드 존중)
  const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
  moveCircle(player, dx / d * 0.45, dy / d * 0.45);
  if (trapped) { die("crush"); return; }                    // 압사 (PRD 4.2-b)
  if (run.hp <= 0) die("hp");
}
function isTrapped() {
  const cx = Math.floor(player.x), cy = Math.floor(player.y);
  return solidCell(cx + 1, cy) && solidCell(cx - 1, cy) && solidCell(cx, cy + 1) && solidCell(cx, cy - 1);
}
function trappedNeighbors() {
  const cx = Math.floor(player.x), cy = Math.floor(player.y);
  return (solidCell(cx + 1, cy) ? 1 : 0) + (solidCell(cx - 1, cy) ? 1 : 0) + (solidCell(cx, cy + 1) ? 1 : 0) + (solidCell(cx, cy - 1) ? 1 : 0);
}

/* ══════════════════ 5. 런 수명주기 ══════════════════ */
let phase = "title";           // title | run | levelup | dead | result | shop | pause
let startPending = false;      // 전면광고 대기 중 중복 출격 방지
function startRun() {
  if (startPending) return;
  // 판 전환 전면광고 — N판마다 1회 저빈도(PRD §11.2). 광고가 닫힌 뒤 런 시작(광고 중 게임 진행 금지 — 포털 QA 공통 요구)
  try {
    if (window.ADS && ADS.runTransition) {
      startPending = true;
      const go = () => { startPending = false; beginRun(); };
      Promise.resolve(ADS.runTransition(Meta.data.plays)).then(go, go);
      return;
    }
  } catch (e) { startPending = false; }
  beginRun();
}
function beginRun() {
  gridInit(); buildBrassLayer();
  bullets = []; enemies = []; gems = []; spawnsQ = [];
  FX.clear();
  run = newRun();
  spawnPlayer();
  setPhase("run");
  SND.bgm(true);
  track("business_start", { plays: Meta.data.plays });
  if (Meta.data.plays === 0) { run.hintStep = 1; }
}
function die(cause) {
  if (phase !== "run" || (run && run.over)) return;
  run.over = true; run.cause = cause;
  FX.hitstop(0.18);
  FX.shake(10);
  FX.flash(cause === "crush" ? "#ffd97a" : "#ff3355", 0.5);
  FX.burst(player.x, player.y, "#3ff6ff", 22, 3.4, 0.14, 0.7);
  FX.ring(player.x, player.y, "#3ff6ff", 0.2, 2.2, 0.5, 0.1);
  SND.play("dead");
  SND.bgm(false);
  track("game_over", { cause, time: Math.round(run.t), lv: run.lv, kills: run.kills });
  setTimeout(() => { if (run && run.over) setPhase("dead"); }, 650);
}
function reviveNow() {
  run.revives--;
  run.hp = run.maxHp;
  run.over = false;
  player.iframe = 2.0;
  // 주변 정리 — 부활이 게임적 이득 (PRD 5.6)
  const R = 3.5;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    if (dur[gi(cx, cy)] > 0 && (cx + 0.5 - player.x) ** 2 + (cy + 0.5 - player.y) ** 2 < R * R) {
      dur[gi(cx, cy)] = 1; destroyCell(gi(cx, cy), "decay");
    }
  }
  for (const e of enemies) {
    if (!e.dead && (e.x - player.x) ** 2 + (e.y - player.y) ** 2 < R * R) { e.gem = 0; killEnemy(e); run.kills--; }
  }
  FX.ring(player.x, player.y, "#3dffa2", 0.3, R, 0.55, 0.14);
  FX.flash("#3dffa2", 0.3);
  SND.play("revive");
  SND.bgm(true);
  setPhase("run");
}
function computeEarned() {
  return Math.max(1, Math.floor(run.gemGot * CFG.meta.convertRate + (run.t / 60) * CFG.meta.timeBonusPerMin));
}
function showResult() {
  run.earned = computeEarned();
  Meta.data.brass += run.earned;
  Meta.data.plays++;
  const b = Meta.data.best;
  b.time = Math.max(b.time, Math.round(run.t));
  b.kills = Math.max(b.kills, run.kills);
  b.wall = Math.max(b.wall, run.maxWall);
  Meta.save();
  track("day_complete", { time: Math.round(run.t), kills: run.kills, wall: run.maxWall, earned: run.earned });
  buildResult();
  setPhase("result");
}
// 보상형 광고 자리 — ADS 가능하면 실제 광고(완주 시에만 보상), 아니면 무료 폴백(흐름 무중단, PRD §11.2)
// ad_rewarded 트래킹은 ads.js 내부에서 1회만 발화.
function tryRewarded(kind, cb) {
  if (window.ADS && ADS.available && ADS.available()) {
    ADS.showRewarded().then(ok => { if (ok) cb(); });
  } else cb();
}

/* ══════════════════ 6. UI/오버레이 ══════════════════ */
const $ = id => document.getElementById(id);
const overlays = ["titleOverlay", "levelupOverlay", "deadOverlay", "resultOverlay", "shopOverlay", "pauseOverlay"];
let shopFrom = "title";
function setPhase(p) {
  phase = p;
  // 포털 SDK 훅(선택 구현): gameplayStart/Stop 등 페이즈 신호 — AdMob ads.js엔 없음(무동작)
  try { if (window.ADS && ADS.phase) ADS.phase(p); } catch (e) {}
  if (p !== "run") { $("stateTitle").classList.remove("go"); clearTimeout(stateTitleT); }
  for (const o of overlays) $(o).classList.remove("show");
  if (p === "title") { refreshTitle(); $("titleOverlay").classList.add("show"); }
  if (p === "levelup") $("levelupOverlay").classList.add("show");
  if (p === "dead") { buildDead(); $("deadOverlay").classList.add("show"); }
  if (p === "result") $("resultOverlay").classList.add("show");
  if (p === "shop") { buildShop(); $("shopOverlay").classList.add("show"); }
  if (p === "pause") $("pauseOverlay").classList.add("show");
  $("hud").classList.toggle("on", p === "run" || p === "levelup" || p === "pause");
}
function refreshTitle() {
  const b = Meta.data.best;
  $("titleStats").innerHTML =
    `<span class="stat"><b>${fmtTime(b.time)}</b> ${T("최고 생존")}</span><span class="stat"><b>${b.kills}</b> ${T("최다 처치")}</span><span class="stat"><b>${b.wall}</b> ${T("최대 벽")}</span>`;
  $("brassBalance").textContent = Meta.data.brass;
  $("muteBtn").textContent = SND.isMuted() ? T("사운드 꺼짐") : T("사운드 켜짐");
  $("langBtn").textContent = I18N.other() === "en" ? "EN" : "한국어";
}
function fmtTime(s) { return `${(s / 60) | 0}:${String((s | 0) % 60).padStart(2, "0")}`; }
function openLevelup() {
  SND.play("levelup");
  FX.flash("#ffd97a", 0.25);
  const picks = rollChoices();
  const wrap = $("cards");
  wrap.innerHTML = "";
  picks.forEach((u, i) => {
    const lv = u.id === "heal" ? 0 : upLv(u.id);
    const el = document.createElement("button");
    el.className = "card " + (u.tag === "b" ? "brass" : "norm");
    el.style.animationDelay = (i * 0.07) + "s";
    const icon = u.id === "heal" ? "icon-hp" : "icon-" + u.id;
    el.innerHTML =
      `<div class="card-slot" style="background-image:url('assets/${icon}.webp')"></div>
       <div class="card-body">
         <div class="card-name">${T(u.name)}</div>
         <div class="card-desc">${T(u.desc)}</div>
         <div class="card-pips">${pips(lv, u.id === "heal" ? 1 : u.max)}</div>
       </div>
       ${u.tag === "b" ? `<div class="card-tag">${T("탄피 연계")}</div>` : ""}`;
    el.onclick = () => {
      SND.play("pick");
      applyUpgrade(u);
      if (run.xp >= run.need) {                    // 연쇄 레벨업
        run.xp -= run.need; run.lv++;
        run.need = CFG.level.base + run.lv * CFG.level.per;
        openLevelup();
      } else setPhase("run");
    };
    wrap.appendChild(el);
  });
  setPhase("levelup");
}
function pips(lv, max) {
  let s = "";
  for (let i = 0; i < max; i++) s += `<i class="${i < lv ? "on" : ""}"></i>`;
  return s;
}
function buildDead() {
  $("deadCause").textContent = run.cause === "crush" ? T("탄피 벽에 깔렸다 — 압사") : T("격추당했다");
  $("deadStats").textContent = `${fmtTime(run.t)} ${T("생존")} · ${run.kills} ${T("처치")}`;
  const can = run.revives > 0;
  $("reviveBtn").style.display = can ? "" : "none";
  $("reviveBtn").textContent = (window.ADS && ADS.available && ADS.available())
    ? T("광고 보고 부활")
    : (I18N.lang === "ko" ? "부활 (남은 " + run.revives + "회)" : "Revive (" + run.revives + " left)");
}
function buildResult() {
  $("resTime").textContent = fmtTime(run.t);
  $("resKills").textContent = run.kills;
  $("resWall").textContent = run.maxWall;
  $("resGems").textContent = run.gemGot;
  $("resBrass").textContent = "+" + run.earned;
  $("doubleBtn").style.display = run.doubled ? "none" : "";
  const nb = [];
  if (Math.round(run.t) >= Meta.data.best.time && run.t > 0) nb.push(T("생존"));
  if (run.kills >= Meta.data.best.kills && run.kills > 0) nb.push(T("처치"));
  if (run.maxWall >= Meta.data.best.wall && run.maxWall > 0) nb.push(T("벽"));
  $("resNew").textContent = nb.length ? T("신기록: ") + nb.join(" · ") : "";
}
function buildShop() {
  $("shopBrass").textContent = Meta.data.brass;
  const list = $("shopList");
  list.innerHTML = "";
  for (const it of META_SHOP) {
    const lv = Meta.shopLv(it.id);
    const maxed = lv >= it.max;
    const cost = maxed ? 0 : it.cost(lv);
    const el = document.createElement("div");
    el.className = "shop-item";
    el.innerHTML =
      `<div class="shop-slot" style="background-image:url('assets/icon-${it.id}.webp')"></div>
       <div class="shop-info"><div class="shop-name">${T(it.name)}</div><div class="shop-desc">${T(it.desc)}</div>
       <div class="card-pips">${pips(lv, it.max)}</div></div>
       <button class="shop-buy ${maxed ? "maxed" : ""}" ${maxed || Meta.data.brass < cost ? "disabled" : ""}>${maxed ? T("완료") : cost}</button>`;
    if (!maxed) el.querySelector("button").onclick = () => {
      if (Meta.data.brass < cost) return;
      Meta.data.brass -= cost;
      Meta.data.shop[it.id] = lv + 1;
      Meta.save();
      SND.play("pick");
      buildShop();
    };
    list.appendChild(el);
  }
}
let stateTitleT = null;
// 상태 타이틀 — title-fx.css (장르 폰트+외곽선+깊이+등장 애니, T10). mode: slam(위협)|pop(보상)|rise(진행)
function stateTitle(txt, sub, mode) {
  const el = $("stateTitle");
  const anim = mode === "pop" ? "dgl-pop" : mode === "rise" ? "dgl-rise" : "dgl-slam";
  const skin = mode === "pop" ? "bw-brass" : mode === "rise" ? "bw-neon" : "bw-danger";
  el.innerHTML = `<div class="dgl-title ${skin} ${anim} bw-st" data-text="${txt}">${txt}</div>${sub ? `<div class="st-sub">${sub}</div>` : ""}`;
  el.classList.add("go");
  clearTimeout(stateTitleT);
  stateTitleT = setTimeout(() => el.classList.remove("go"), 1900);
}
let toastT = null;
function toast(txt) {
  const el = $("toast");
  el.textContent = txt;
  el.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("on"), 2600);
}
function track(name, params) { try { if (typeof DGL !== "undefined") DGL.track(name, params); } catch (e) {} }

/* 버튼 배선 */
$("startBtn").onclick = () => { unlockAudio(); SND.play("ui"); startRun(); };
$("shopBtn").onclick = () => { unlockAudio(); SND.play("ui"); shopFrom = "title"; setPhase("shop"); };
$("muteBtn").onclick = () => { SND.setMuted(!SND.isMuted()); refreshTitle(); };
// 언어 토글 (KO ⇄ EN) — 웹 포털 리뷰어/글로벌 유저용. 정적 DOM + 로고 + 타이틀 통계 라이브 재적용(리로드 불필요)
$("langBtn").onclick = () => { SND.play("ui"); I18N.setLang(I18N.other()); applyLang(); };
$("reviveBtn").onclick = () => tryRewarded("revive", reviveNow);
$("deadResultBtn").onclick = () => { SND.play("ui"); showResult(); };
$("doubleBtn").onclick = () => tryRewarded("double", () => {
  Meta.data.brass += run.earned; run.doubled = true; run.earned *= 2;
  Meta.save(); buildResult(); SND.play("win");
});
$("resShopBtn").onclick = () => { SND.play("ui"); shopFrom = "result"; setPhase("shop"); };
$("retryBtn").onclick = () => { SND.play("ui"); startRun(); };
$("homeBtn").onclick = () => { SND.play("ui"); setPhase("title"); };
$("shopBackBtn").onclick = () => { SND.play("ui"); setPhase(shopFrom === "result" ? "result" : "title"); };
$("pauseBtn").onclick = () => { if (phase === "run") { SND.play("ui"); setPhase("pause"); } };
$("resumeBtn").onclick = () => { SND.play("ui"); setPhase("run"); };
$("quitBtn").onclick = () => { SND.play("ui"); SND.bgm(true); setPhase("title"); };
document.addEventListener("visibilitychange", () => { if (document.hidden && phase === "run") setPhase("pause"); });

/* ══════════════════ 7. 시뮬 & 렌더 ══════════════════ */
function simStep(dt) {
  run.t += dt;
  if (player.iframe > 0) player.iframe -= dt;
  if (player.squash > 0) player.squash -= dt;
  // 이동
  const iv = inputVec();
  if (iv.mag > 0.02) {
    const sp = moveSpeed() * iv.mag;
    moveCircle(player, iv.x * sp * dt, iv.y * sp * dt);
    player.x = Math.max(player.r, Math.min(cols - player.r, player.x));
    player.y = Math.max(player.r, Math.min(rows - player.r, player.y));
    player.moveA += dt * 10;
    if (Math.random() < dt * 22) FX.dust(player.x - iv.x * 0.3, player.y - iv.y * 0.3, "rgba(63,246,255,.7)", 1);
  }
  fireGun(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateGems(dt);
  updateGrid(dt);
  spawnDirector(dt);
  run.boomBudget = 6;
  // 갇힘 경고
  const tn = trappedNeighbors();
  $("trapGlow").classList.toggle("on", tn >= 3);
  if (tn >= 3 && run.trapWarnCd <= 0) { run.trapWarnCd = 2.4; SND.play("trap"); }
  if (run.trapWarnCd > 0) run.trapWarnCd -= dt;
  // 첫 판 온보딩 힌트 (PRD §8.5 — 텍스트 최소, 몸으로 학습 보조)
  if (run.hintStep === 1 && run.t > 6) { run.hintStep = 2; toast(T("내가 쏜 총알이 탄피 벽이 된다")); }
  else if (run.hintStep === 2 && run.t > 18) { run.hintStep = 3; toast(T("벽으로 적을 좁은 길목에 몰아넣어라")); }
}

function drawShadow(x, y, r) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(ox + x * cell, oy + (y + r * 0.75) * cell, r * cell * 0.8, r * cell * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
}
function drawEnemy(e) {
  const s = cell, px = ox + e.x * s, py = oy + e.y * s;
  const sq = e.squash > 0 ? 1 + e.squash * 1.6 : 1;
  const bobY = e.type === "drone" ? Math.sin(e.bob) * 0.09 * s : 0;
  drawShadow(e.x, e.y + (e.type === "drone" ? 0.22 : 0), e.r);
  ctx.save();
  ctx.translate(px, py + bobY);
  const ang = Math.atan2(player.y - e.y, player.x - e.x);
  const im = spr(e.type);
  if (im) {
    const d = e.r * 2.5 * s;
    if (e.type === "rusher") ctx.rotate(ang);
    ctx.scale(sq, 2 - sq);
    ctx.drawImage(im, -d / 2, -d / 2, d, d);
  } else {
    ctx.scale(sq, 2 - sq);
    const r = e.r * s;
    if (e.type === "walker") {
      ctx.fillStyle = "#ff4d6d";
      ctx.strokeStyle = "#ff8aa0"; ctx.lineWidth = 2;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = "#2b0812";
      ctx.fillRect(-r * 0.45, -r * 0.25, r * 0.35, r * 0.5);
      ctx.fillRect(r * 0.1, -r * 0.25, r * 0.35, r * 0.5);
    } else if (e.type === "rusher") {
      ctx.rotate(ang);
      ctx.fillStyle = "#ff9f1c";
      ctx.strokeStyle = "#ffd08a"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r * 1.2, 0); ctx.lineTo(-r * 0.8, -r * 0.85); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.8, r * 0.85);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = "#b967ff";
      ctx.strokeStyle = "#dcb1ff"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.1); ctx.lineTo(r * 0.9, 0); ctx.lineTo(0, r * 1.1); ctx.lineTo(-r * 0.9, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#31104f";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (e.hitT > 0) {
    ctx.globalAlpha = Math.min(1, e.hitT / 0.09) * 0.8;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(0, 0, e.r * s * 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // 체력바(다친 적만)
  if (e.hp < e.maxHp) {
    const w = e.r * 2 * s;
    ctx.fillStyle = "rgba(8,10,20,.7)";
    ctx.fillRect(px - w / 2, py - e.r * s - 7, w, 4);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(px - w / 2, py - e.r * s - 7, w * Math.max(0, e.hp / e.maxHp), 4);
  }
}
function drawPlayer() {
  const s = cell, px = ox + player.x * s, py = oy + player.y * s;
  if (player.iframe > 0 && Math.floor(player.iframe * 14) % 2 === 0) return; // 무적 점멸
  drawShadow(player.x, player.y, player.r);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(run ? run.aim : -Math.PI / 2);
  const sq = player.squash > 0 ? 1 - player.squash * 1.4 : 1;
  ctx.scale(sq, 2 - sq);
  const im = spr("player");
  const r = player.r * s;
  if (im) {
    const d = r * 3.4;
    ctx.shadowColor = "rgba(63,246,255,.75)"; ctx.shadowBlur = 14;
    ctx.drawImage(im, -d / 2, -d / 2, d, d);
    ctx.shadowBlur = 0;
  } else {
    ctx.shadowColor = "#3ff6ff"; ctx.shadowBlur = 12;
    ctx.fillStyle = "#bffcff";
    ctx.strokeStyle = "#3ff6ff"; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0); ctx.lineTo(-r * 0.9, -r * 0.95); ctx.lineTo(-r * 0.45, 0); ctx.lineTo(-r * 0.9, r * 0.95);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}
function render(now) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(FX.shakeX, FX.shakeY);
  if (bgCv) ctx.drawImage(bgCv, 0, 0, W, H);
  // 젬
  for (const g of gems) {
    const px = ox + g.x * cell, py = oy + g.y * cell;
    const pul = 1 + Math.sin(now / 160 + g.x * 7) * 0.15;
    const im = spr("gem");
    if (im) { const d = cell * 0.42 * pul; ctx.drawImage(im, px - d / 2, py - d / 2, d, d); }
    else {
      ctx.fillStyle = "#3dffa2";
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4); ctx.scale(pul, pul);
      ctx.fillRect(-cell * 0.09, -cell * 0.09, cell * 0.18, cell * 0.18);
      ctx.restore();
    }
  }
  // 탄피 레이어(오프스크린) + 점멸 셀
  if (brassCv) ctx.drawImage(brassCv, 0, 0, W, H);
  if (dur) {
    for (let i = 0; i < dur.length; i++) {
      if (dur[i] === 0 || timer[i] >= CFG.BRASS.blinkT) continue;
      const cx = i % cols, cy = (i / cols) | 0;
      const a = 0.25 + 0.5 * Math.abs(Math.sin(now / 90));
      // 점멸 = 바닥이 비쳐 보이게 배경 레이어 조각을 덮어그림 (민무늬 사각형은 아트 배경 위에서 이질적)
      ctx.globalAlpha = a;
      const bx = ox + cx * cell, by = oy + cy * cell;
      if (bgCv) ctx.drawImage(bgCv, bx * dpr, by * dpr, cell * dpr, cell * dpr, bx, by, cell, cell);
      else { ctx.fillStyle = "#0a0e1c"; ctx.fillRect(bx, by, cell, cell); }
      ctx.globalAlpha = 1;
    }
  }
  // 스폰 예고
  for (const sq of spawnsQ) {
    const t = sq.t / CFG.spawn.telegraph;
    const px = ox + sq.x * cell, py = oy + sq.y * cell;
    ctx.strokeStyle = sq.type === "rusher" ? "rgba(255,159,28,.8)" : sq.type === "drone" ? "rgba(185,103,255,.8)" : "rgba(255,77,109,.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(px, py, cell * 0.42 * (0.4 + t), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (phase !== "title") {
    for (const e of enemies) if (!e.dead) drawEnemy(e);
    if (player) drawPlayer();
  }
  // 총알
  ctx.lineCap = "round";
  for (const b of bullets) {
    const px = ox + b.x * cell, py = oy + b.y * cell;
    ctx.strokeStyle = b.turret ? "rgba(63,246,255,.9)" : "rgba(255,247,214,.95)";
    ctx.lineWidth = cell * 0.11;
    ctx.beginPath();
    ctx.moveTo(px - b.dx * cell * 0.34, py - b.dy * cell * 0.34);
    ctx.lineTo(px, py);
    ctx.stroke();
  }
  FX.render(ctx, cell, ox, oy);
  ctx.restore();
  FX.renderFlash(ctx, W, H);
  // HUD
  if (run) {
    $("hpFill").style.width = Math.max(0, run.hp / run.maxHp * 100) + "%";
    $("hpTxt").textContent = `${Math.max(0, run.hp)}/${run.maxHp}`;
    $("xpFill").style.width = Math.min(100, run.xp / run.need * 100) + "%";
    $("lvTxt").textContent = "LV " + run.lv;
    $("timeTxt").textContent = fmtTime(run.t);
    $("killTxt").textContent = run.kills;
  }
}

let last = 0, acc = 0;
const STEP = 1 / 60;
function frame(now) {
  const dtReal = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  const simOk = FX.tick(dtReal);
  if (phase === "run" && simOk) {
    acc += dtReal;
    let guard = 0;
    while (acc >= STEP && guard++ < 6) { simStep(STEP); acc -= STEP; }
  } else acc = 0;
  FX.update(dtReal);
  render(now);
  requestAnimationFrame(frame);
}

/* ══════════════════ 8. QA/디버그 훅 (shoot.scenario 협조) ══════════════════ */
window.__bw = {
  start: () => beginRun(),   // 테스트 API 는 광고 게이트(startRun 의 runTransition await) 우회 — 동기 시작 보장(시나리오 ff 연쇄용)
  levelup: () => { if (phase === "run") openLevelup(); },
  dead: () => { if (phase === "run") { run.hp = 1; hitPlayer({ x: player.x + 0.1, y: player.y, dmg: 99, r: 1 }); } },
  result: () => { if (run) showResult(); },
  shop: () => { shopFrom = "title"; setPhase("shop"); },
  demoWall: (n) => {                                    // 스샷용 탄피 데모
    for (let i = 0; i < (n || 24); i++) {
      const cx = Math.floor(2 + Math.random() * (cols - 4)), cy = Math.floor(3 + Math.random() * (rows - 8));
      addBrass(cx, cy);
    }
  },
  spawn: (type, n) => { for (let i = 0; i < (n || 5); i++) { const p = edgeSpawnPos(); queueSpawn(type || "walker", p.x, p.y); } },
  gems: (n) => { for (let i = 0; i < (n || 8); i++) gems.push({ x: player.x + (Math.random() - 0.5) * 4, y: player.y + (Math.random() - 0.5) * 4, vx: 0, vy: 0, t: 30, pull: false }); },
  ff: (sec) => { const n = Math.round(sec / STEP); for (let i = 0; i < n && phase === "run" && !(run && run.over); i++) simStep(STEP); }, // 빨리감기(시나리오·오토런용)
  god: (on) => { if (run) run.hp = on ? 9999 : run.maxHp; },
  state: () => ({ phase, t: run ? run.t : 0, wall: wallCount, enemies: enemies.length, hp: run ? run.hp : 0, lv: run ? run.lv : 0, kills: run ? run.kills : 0 }),
};

/* 언어 적용 — 정적 DOM 번역 + 로고(EN 전용 그래픽) 스왑 + 타이틀 동적 재렌더. boot·토글 공용. */
function applyLang() {
  I18N.apply();
  const logo = $("logoImg");
  if (logo) {
    logo.style.display = "";
    logo.src = I18N.lang === "en" ? "assets/ui/logo-en.png" : "assets/ui/logo.png";  // 없으면 onerror→h1 폴백(data-i18n)
  }
  if (phase === "title") refreshTitle();
}

/* ══════════════════ 부팅 ══════════════════ */
resize();
setPhase("title");
applyLang();
try { if (window.ADS && ADS.init) ADS.init(); } catch (e) {}
loadAssets(() => { buildBg(); if (dur) for (let i = 0; i < dur.length; i++) if (dur[i] > 0) redrawCell(i, 1); });   // 배경 아트 로드 후 bgCv 재조립
requestAnimationFrame(frame);

// PWA: 웹에서만 서비스워커 등록(번들 앱은 localhost 가드, 포털 빌드는 __DGL_PORTAL 가드로 스킵 — 포털 CDN 캐시 충돌 방지)
if ("serviceWorker" in navigator && !window.__DGL_PORTAL && location.protocol.startsWith("http") && !/capacitor|localhost|127\.0\.0\.1/.test(location.host + location.protocol)) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
