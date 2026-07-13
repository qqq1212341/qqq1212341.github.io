"use strict";
/* 탄피성벽 — 주스(FX) 매니저: 파티클·숫자팝업·링·화면흔들림·히트스톱·플래시.
 * 손맛 원칙(CLAUDE.md): 모든 액션에 피드백, 모든 등장에 이징, 탭 반응 지연 0. */
const FX = (function () {
  const parts = [], popups = [], rings = [];
  let shakeAmp = 0, shakeX = 0, shakeY = 0;
  let freeze = 0;                 // 히트스톱(시뮬 정지 s)
  let flashA = 0, flashCol = "#ffffff";

  function burst(x, y, col, n, spd, size, life, grav) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random() * 0.8);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), col, grav: grav || 0 });
    }
  }
  function dust(x, y, col, n) { burst(x, y, col, n || 5, 1.6, 0.09, 0.35, 2.2); }
  function popup(x, y, txt, col, big) {
    popups.push({ x, y, txt, col: col || "#fff", life: 0.75, max: 0.75, big: !!big });
  }
  function ring(x, y, col, r0, r1, life, w) {
    rings.push({ x, y, col, r: r0, r1, life, max: life, w: w || 0.08 });
  }
  function shake(amp) { shakeAmp = Math.max(shakeAmp, amp); }
  function hitstop(t) { freeze = Math.max(freeze, t); }
  function flash(col, a) { flashCol = col; flashA = Math.max(flashA, a); }

  // dtReal 기준 틱 — freeze 를 깎고, 남았으면 시뮬 정지 신호
  function tick(dt) {
    if (freeze > 0) freeze -= dt;
    // 흔들림 감쇠(빠른 감쇠 — 과하지 않게)
    shakeAmp *= Math.pow(0.0008, dt);
    if (shakeAmp < 0.15) shakeAmp = 0;
    shakeX = (Math.random() * 2 - 1) * shakeAmp;
    shakeY = (Math.random() * 2 - 1) * shakeAmp;
    if (flashA > 0) flashA = Math.max(0, flashA - dt * 2.4);
    return freeze <= 0;
  }
  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt; if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= dt; if (p.life <= 0) { popups[i] = popups[popups.length - 1]; popups.pop(); continue; }
      p.y -= dt * 0.9;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt; if (r.life <= 0) { rings[i] = rings[rings.length - 1]; rings.pop(); continue; }
    }
  }
  // cell→px 스케일로 그림 (게임 좌표 = 셀 단위)
  function render(ctx, s, ox, oy) {
    for (const p of parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      const px = ox + p.x * s, py = oy + p.y * s, r = p.size * s * (0.5 + a * 0.5);
      ctx.fillRect(px - r / 2, py - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
    for (const r of rings) {
      const t = 1 - r.life / r.max;
      const rr = (r.r + (r.r1 - r.r) * (1 - Math.pow(1 - t, 2.2))) * s;   // easeOut
      ctx.globalAlpha = r.life / r.max;
      ctx.strokeStyle = r.col; ctx.lineWidth = Math.max(1, r.w * s * (1 - t * 0.6));
      ctx.beginPath(); ctx.arc(ox + r.x * s, oy + r.y * s, rr, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const p of popups) {
      const t = 1 - p.life / p.max;
      const pop = t < 0.18 ? (t / 0.18) : 1;                              // 등장 팝(스케일 인)
      const size = (p.big ? 0.62 : 0.42) * s * (0.7 + 0.3 * pop);
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.45));
      ctx.font = `800 ${size}px 'Pretendard','Apple SD Gothic Neo',sans-serif`;
      ctx.strokeStyle = "rgba(5,8,18,.85)"; ctx.lineWidth = Math.max(2, size * 0.16);
      ctx.strokeText(p.txt, ox + p.x * s, oy + p.y * s);
      ctx.fillStyle = p.col;
      ctx.fillText(p.txt, ox + p.x * s, oy + p.y * s);
    }
    ctx.globalAlpha = 1;
  }
  function renderFlash(ctx, W, H) {
    if (flashA > 0) {
      ctx.globalAlpha = Math.min(0.55, flashA);
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
  function clear() { parts.length = 0; popups.length = 0; rings.length = 0; shakeAmp = 0; freeze = 0; flashA = 0; }
  return {
    burst, dust, popup, ring, shake, hitstop, flash, tick, update, render, renderFlash, clear,
    get shakeX() { return shakeX; }, get shakeY() { return shakeY; },
    get frozen() { return freeze > 0; },
  };
})();
