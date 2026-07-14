"use strict";
/* 꼬리추월 — 꼬리 행렬. BUILD-SPEC §3 MUST 특성:
 *  ① 각 꼬리차는 선두의 "과거 경로" 위에 있다 (path-history 링버퍼)
 *  ② 차간 간격은 경로 거리 기준 일정
 *  ③ 선두 급이동 시 뒤로 갈수록 지연 → 파도/S자
 *  ④ 결정적(랜덤 흔들림 없음 — 예측 가능해야 억울하지 않다)
 *  ⑤ 100대에도 60fps (버퍼 샘플 O(log n), 세그먼트 O(n))
 */
const TAIL = (function(){
  let buf = [];        // {d, x} — d: 선두 누적 이동거리(단조증가), x: 월드 lateral
  let segs = [];       // {x, sprite, popT, wobble} — 확정된 꼬리 차량 (앞→뒤 순)
  let joins = [];      // {t, idx, dx0, dy0, sprite} — 붙는 중(연출) 차량
  let lastPushD = -1e9;

  function reset(headX){
    buf = [{ d: 0, x: headX }]; segs = []; joins = []; lastPushD = 0;
  }

  function push(d, x){
    if(d - lastPushD < CONFIG.PATH_STEP) return;
    buf.push({ d, x }); lastPushD = d;
    // 필요 길이(현 행렬 + 여유) 넘게 쌓이면 앞쪽 프루닝 (amortized)
    const need = (count() + 4) * CONFIG.SPACING + 200;
    if(buf.length > 64 && buf[buf.length - 1].d - buf[0].d > need * 1.6){
      let cut = 0;
      const minD = buf[buf.length - 1].d - need;
      while(cut < buf.length - 2 && buf[cut + 1].d < minD) cut++;
      if(cut > 32) buf = buf.slice(cut);
    }
  }

  function sampleX(dist){
    if(!buf.length) return 0;
    if(dist <= buf[0].d) return buf[0].x;
    const last = buf[buf.length - 1];
    if(dist >= last.d) return last.x;
    let lo = 0, hi = buf.length - 1;
    while(hi - lo > 1){
      const mid = (lo + hi) >> 1;
      if(buf[mid].d <= dist) lo = mid; else hi = mid;
    }
    const a = buf[lo], b = buf[hi];
    const k = (dist - a.d) / Math.max(1e-6, b.d - a.d);
    return a.x + (b.x - a.x) * k;
  }

  function count(){ return segs.length + joins.length; }

  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

  /* 추월차를 행렬에 예약 — 연출(움직이는 앵커로 수렴하는 트윈) 후 확정 */
  function addJoin(car, headD, headWY){
    const idx = count();                       // 예약 슬롯 (뒤에 붙는다)
    const anchorX = sampleX(headD - (idx + 1) * CONFIG.SPACING);
    const anchorWY = headWY - (idx + 1) * CONFIG.SPACING;
    joins.push({
      t: 0, idx,
      dx0: car.x - anchorX,
      dy0: car.wy - anchorWY,
      sprite: car.sprite,
    });
  }

  function update(dt, headD, headWY){
    // 확정 세그먼트: 경로 샘플 + 짧은 스무딩(기계감 제거 — 지연 과다 금지)
    for(let i = 0; i < segs.length; i++){
      const s = segs[i];
      const target = sampleX(headD - (i + 1) * CONFIG.SPACING);
      const nx = s.x + (target - s.x) * Math.min(1, dt * CONFIG.FOLLOW_LERP);
      s.vx = dt > 1e-4 ? (nx - s.x) / dt : 0;   // 옆속도(월드px/s) — 채찍 판정용
      s.x = nx;
      if(s.popT > 0) s.popT = Math.max(0, s.popT - dt);
      if(s.wobble) { s.wobble *= Math.pow(0.02, dt); if(Math.abs(s.wobble) < 0.4) s.wobble = 0; }
    }
    // 붙는 중 차량: 움직이는 앵커로 수렴
    for(let i = joins.length - 1; i >= 0; i--){
      const j = joins[i];
      j.t += dt / CONFIG.JOIN_DUR;
      if(j.t >= 1){
        // 확정 — idx 순서 보장(동시 join도 idx가 앞선 것부터 t 도달)
        const anchorX = sampleX(headD - (j.idx + 1) * CONFIG.SPACING);
        segs[j.idx] = { x: anchorX, sprite: j.sprite, popT: 0.28, wobble: 0 };
        joins.splice(i, 1);
      }
    }
  }

  function joinPose(j, headD, headWY){
    const k = easeOutCubic(Math.min(1, j.t));
    const anchorX = sampleX(headD - (j.idx + 1) * CONFIG.SPACING);
    const anchorWY = headWY - (j.idx + 1) * CONFIG.SPACING;
    return { x: anchorX + j.dx0 * (1 - k), wy: anchorWY + j.dy0 * (1 - k), k };
  }

  function segWorldY(i, headWY){ return headWY - (i + 1) * CONFIG.SPACING; }

  /* 잘림 — 트럭이 관통한 구간(start부터 n대)만 제거. 나머지 꼬리는 경로추종으로 자동으로 간격을 메운다.
   * (앞쪽 접점서 뒤 전부 잃던 문제 해결 — 트럭은 '보이는 꼬리'만 야금야금 갉음). 반환=잃은 수. */
  function removeSegs(start, n){
    if(start < 0 || start >= segs.length || n <= 0) return 0;
    const removed = segs.splice(start, n);
    joins.length = 0;                 // 진행 중이던 연결 예약은 취소(슬롯 어긋남 방지)
    return removed.length;
  }

  /* 충돌 붕괴 웨이브 — 세그먼트가 물결치듯 흔들림 */
  function wobbleAll(fromIdx){
    for(let i = 0; i < segs.length; i++){
      const dist = Math.abs(i - fromIdx);
      segs[i].wobble = (i % 2 ? 1 : -1) * Math.max(0, 16 - dist * 1.2);
    }
  }

  return { reset, push, sampleX, count, addJoin, update, joinPose, segWorldY, wobbleAll, removeSegs,
           get segs(){ return segs; }, get joins(){ return joins; } };
})();
