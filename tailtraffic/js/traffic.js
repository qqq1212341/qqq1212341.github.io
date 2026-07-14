"use strict";
/* 꼬리추월 — 교통 스포너. BUILD-SPEC §4:
 *  - 개별 랜덤이 아닌 "패턴 단위" 스폰 (통과 가능 경로 ≥1 보장은 패턴 설계로)
 *  - 난이도 = 속도 단일축 금지 → 밀도·대형차·틈·차선변경을 꼬리 수 tier로
 *  - 차선변경차는 깜빡이 선예고 후 이동
 */
const TRAFFIC = (function(){
  let cars = [];         // {id,type,sprite,lane,x,wy,spd,w,len,passed,attachable,state,blinkT,changeT,fromX,toLane,minGap,clutchSeg}
  let nextId = 1;
  let spawnCursor = 0;
  let script = null, scriptIdx = 0;   // 온보딩 스크립트 모드

  const CAR_SPRITES = ["car-blue", "car-green", "car-yellow", "car-purple", "car-taxi"];

  function laneX(lane){ return (lane - (CONFIG.LANES - 1) / 2) * CONFIG.LANE_W; }
  function rnd(a, b){ return a + Math.random() * (b - a); }
  function ri(n){ return Math.floor(Math.random() * n); }

  function reset(headWY){
    cars = []; nextId = 1; script = null; scriptIdx = 0;
    spawnCursor = headWY + 520;   // 첫 그룹은 한 호흡 뒤에
  }

  function setScript(list){ script = list; scriptIdx = 0; }

  function tierOf(tail){
    let t = CONFIG.TIERS[0];
    for(const x of CONFIG.TIERS) if(tail >= x.tail) t = x;
    return t;
  }

  function mkCar(lane, wy, playerSpd, opts = {}){
    const type = opts.type || "car";
    const dims = type === "car" ? CONFIG.CAR : CONFIG.TRUCK;
    const baseRatio = opts.spdRatio != null ? opts.spdRatio : CONFIG.TRAFFIC_SPD;
    const spd = playerSpd * (baseRatio + rnd(-CONFIG.TRAFFIC_SPD_VAR, CONFIG.TRAFFIC_SPD_VAR));
    const c = {
      id: nextId++, type,
      sprite: opts.sprite || (type === "car" ? CAR_SPRITES[ri(CAR_SPRITES.length)] : (Math.random() < 0.6 ? "truck-red" : "bus-city")),
      lane, x: laneX(lane), wy, spd,
      w: dims.w, len: type === "car" ? dims.len : (opts.sprite === "bus-city" ? dims.len * 0.85 : dims.len),
      passed: false, attachable: type === "car",
      state: "road", blinkT: 0, changeT: 0, fromX: 0, toLane: lane,
      willChange: !!opts.willChange, minGap: Infinity, clutchSeg: -1,
    };
    cars.push(c); return c;
  }

  /* ── 패턴: 반환값 = 패턴 세로 높이. 모든 패턴은 통과 경로 ≥1 을 남긴다 ── */
  const PATTERNS = {
    single(y, spd){ mkCar(ri(CONFIG.LANES), y, spd); return CONFIG.CAR.len; },
    pair(y, spd){
      const open = ri(CONFIG.LANES);
      for(let l = 0; l < CONFIG.LANES; l++) if(l !== open && Math.random() < 0.92) mkCar(l, y + rnd(-20, 20), spd);
      return CONFIG.CAR.len + 40;
    },
    convoy(y, spd){ // 같은 차선 줄줄이 — 연속 추월 유도(성장 쾌감)
      const lane = ri(CONFIG.LANES);
      const n = 3 + ri(2);
      for(let i = 0; i < n; i++) mkCar(lane, y + i * 190, spd, { spdRatio: CONFIG.TRAFFIC_SPD - 0.04 });
      return 190 * n;
    },
    gate(y, spd){ // 트럭+차가 한 차선만 남김 — 좁은 틈
      const open = ri(CONFIG.LANES);
      const lanes = [...Array(CONFIG.LANES).keys()].filter(l => l !== open);
      mkCar(lanes[0], y, spd, { type: "truck" });
      mkCar(lanes[1], y + rnd(-40, 60), spd);
      return CONFIG.TRUCK.len + 60;
    },
    canyon(y, spd){ // 트럭 협곡 — 가운데만 열림 (머니샷)
      const open = 1 + (CONFIG.LANES > 3 ? ri(CONFIG.LANES - 2) : 0);
      for(let l = 0; l < CONFIG.LANES; l++) if(l !== open) mkCar(l, y, spd, { type: "truck", spdRatio: CONFIG.TRAFFIC_SPD - 0.02 });
      return CONFIG.TRUCK.len + 40;
    },
    jam(y, spd){ // 정체 — 지그재그 통로
      const path = [ri(CONFIG.LANES)];
      while(path.length < 3){
        const p = path[path.length - 1];
        const next = Math.max(0, Math.min(CONFIG.LANES - 1, p + (Math.random() < 0.5 ? -1 : 1)));
        path.push(next);
      }
      let h = 0;
      for(let row = 0; row < 3; row++){
        const openLane = path[row];
        for(let l = 0; l < CONFIG.LANES; l++)
          if(l !== openLane && Math.random() < 0.85) mkCar(l, y + h, spd, { spdRatio: CONFIG.TRAFFIC_SPD - 0.06 });
        h += 250;
      }
      return h + CONFIG.CAR.len;
    },
    changer(y, spd){ // 차선변경 예정 차량 (+동행 1대)
      mkCar(ri(CONFIG.LANES), y, spd, { willChange: true });
      if(Math.random() < 0.5) mkCar(ri(CONFIG.LANES), y + rnd(220, 320), spd);
      return 320;
    },
  };

  function pickPattern(weights){
    let sum = 0; for(const k in weights) sum += weights[k];
    let r = Math.random() * sum;
    for(const k in weights){ r -= weights[k]; if(r <= 0) return k; }
    return "single";
  }

  function laneFreeAt(lane, wy, span){
    for(const c of cars){
      const l = (c.state === "changing") ? c.toLane : c.lane;
      if(l !== lane) continue;
      if(Math.abs(c.wy - wy) < (c.len + span) / 2 + 60) return false;
    }
    return true;
  }

  function update(dt, headWY, playerSpd, tailCount, tailEndWY){
    // ── 스폰 ──
    if(script){
      while(scriptIdx < script.length && headWY + CONFIG.SPAWN_AHEAD > script[scriptIdx].at){
        const it = script[scriptIdx++];
        if(it.fn) it.fn(it.at, playerSpd);
        else PATTERNS[it.p](it.at, playerSpd);
      }
      if(scriptIdx >= script.length){ script = null; spawnCursor = headWY + CONFIG.SPAWN_AHEAD + 200; }
    } else {
      const tier = tierOf(tailCount);
      while(spawnCursor < headWY + CONFIG.SPAWN_AHEAD){
        const p = pickPattern(tier.weights);
        const h = PATTERNS[p](spawnCursor, playerSpd);
        spawnCursor += h + rnd(tier.gap[0], tier.gap[1]);
      }
    }

    // ── 이동 + 차선변경 ──
    for(const c of cars){
      if(c.state === "knocked"){   // 채찍에 맞아 도로 밖으로 튕기는 중
        c.knockT = (c.knockT || 0) + dt;
        c.x += c.vx * dt;
        c.vx *= Math.pow(0.35, dt);        // 감속
        c.wy += c.spd * 0.35 * dt;         // 살짝 전진 유지(자연스럽게 뒤로 흐름)
        c.angle = (c.angle || 0) + (c.vr || 0) * dt;
        continue;
      }
      c.wy += c.spd * dt;
      if(c.willChange && c.state === "road"){
        const ahead = c.wy - headWY;
        if(ahead > 260 && ahead < 560){
          // 목표: 안전한 인접 차선 (없으면 취소)
          const opts = [c.lane - 1, c.lane + 1].filter(l => l >= 0 && l < CONFIG.LANES && laneFreeAt(l, c.wy, c.len));
          if(opts.length){ c.state = "blink"; c.blinkT = 0; c.toLane = opts[ri(opts.length)]; }
          else c.willChange = false;
        }
      }
      if(c.state === "blink"){
        c.blinkT += dt;
        if(c.blinkT >= 0.75){ c.state = "changing"; c.changeT = 0; c.fromX = c.x; }
      } else if(c.state === "changing"){
        c.changeT += dt / 0.6;
        const k = c.changeT >= 1 ? 1 : 1 - Math.pow(1 - c.changeT, 2);
        c.x = c.fromX + (laneX(c.toLane) - c.fromX) * k;
        if(c.changeT >= 1){ c.state = "road"; c.lane = c.toLane; c.willChange = false; }
      }
    }

    // ── 정리 (꼬리 끝보다 한참 뒤 · 도로 밖으로 튕겨난 차) ──
    const cutoff = Math.min(tailEndWY, headWY) - 600;
    const offRoad = CONFIG.LANES * CONFIG.LANE_W * 0.95;
    for(let i = cars.length - 1; i >= 0; i--){
      const c = cars[i];
      if(c.wy < cutoff || (c.state === "knocked" && (c.knockT > 1.4 || Math.abs(c.x) > offRoad))) cars.splice(i, 1);
    }
  }

  function remove(car){ const i = cars.indexOf(car); if(i >= 0) cars.splice(i, 1); }

  return { reset, update, remove, setScript, laneX, tierOf, mkCar,
           get cars(){ return cars; } };
})();
