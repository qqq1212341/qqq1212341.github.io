"use strict";
/* 꼬리추월 — 화면 이펙트: 파티클·플로터(점수팝)·카메라 셰이크·속도선.
 * 파티클은 소형 스파크/연기 수준(볼 표면 아님). 큰 충돌 스타·배지는 스프라이트(P9). */
const FX = (function(){
  const parts = [];   // {x,y,vx,vy,life,t,size,color,grav,img,rot,vr}
  const floats = [];  // {x,y,text,t,life,size,color,pop}
  let shakeAmp = 0, shakeT = 0;

  function reset(){ parts.length = 0; floats.length = 0; shakeAmp = 0; }

  function shake(amp){ shakeAmp = Math.max(shakeAmp, amp); shakeT = 0; }
  function shakeOffset(){
    if(shakeAmp < 0.3) return { x: 0, y: 0 };
    return { x: (Math.random() * 2 - 1) * shakeAmp, y: (Math.random() * 2 - 1) * shakeAmp };
  }

  function spark(x, y, n, color, spd){
    for(let i = 0; i < n; i++){
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random() * 0.6) * (spd || 160);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.25, t: 0,
                   size: 2 + Math.random() * 3, color: color || "#ffd24a", grav: 60 });
    }
  }
  function smoke(x, y, n){
    for(let i = 0; i < n; i++){
      parts.push({ x: x + (Math.random() * 20 - 10), y: y + (Math.random() * 20 - 10),
                   vx: (Math.random() * 2 - 1) * 40, vy: -30 - Math.random() * 50, life: 0.6 + Math.random() * 0.5, t: 0,
                   size: 8 + Math.random() * 10, color: "rgba(200,200,210,0.5)", grav: -20, fade: true });
    }
  }
  function debris(x, y){
    spark(x, y, 14, "#ffd24a", 220);
    spark(x, y, 8, "#ff7043", 260);
    smoke(x, y, 6);
  }
  function crashStar(x, y, scale){
    parts.push({ x, y, vx: 0, vy: 0, life: 0.5, t: 0, size: 60 * (scale || 1), img: "fx-crash", rot: Math.random() * 0.6 - 0.3, pop: true });
  }
  function confetti(x, y, n){
    const cols = ["#ffd24a", "#36e0ff", "#ff7043", "#7CFC8E", "#d98cff"];
    for(let i = 0; i < n; i++){
      const a = -Math.PI / 2 + (Math.random() * 1.6 - 0.8), v = 180 + Math.random() * 260;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9 + Math.random() * 0.5, t: 0,
                   size: 3 + Math.random() * 4, color: cols[i % cols.length], grav: 420, rot: Math.random() * 6, vr: Math.random() * 10 - 5, rect: true });
    }
  }

  function floater(x, y, text, { size = 22, color = "#fff", life = 0.8, pop = true } = {}){
    floats.push({ x, y, text, t: 0, life, size, color, pop });
  }

  function update(dt){
    if(shakeAmp >= 0.3){ shakeT += dt; shakeAmp *= Math.pow(0.001, dt * 1.6); } // 빠른 감쇠
    for(let i = parts.length - 1; i >= 0; i--){
      const p = parts[i]; p.t += dt;
      if(p.t >= p.life){ parts.splice(i, 1); continue; }
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
      if(p.grav) p.vy += p.grav * dt;
      if(p.vr) p.rot = (p.rot || 0) + p.vr * dt;
    }
    for(let i = floats.length - 1; i >= 0; i--){
      const f = floats[i]; f.t += dt;
      if(f.t >= f.life){ floats.splice(i, 1); continue; }
      f.y -= 46 * dt;
    }
  }

  function easeOutBack(t){ const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  function draw(ctx){
    for(const p of parts){
      const k = 1 - p.t / p.life;
      ctx.save();
      ctx.globalAlpha = p.fade ? k * 0.7 : Math.min(1, k * 2);
      if(p.img && typeof spr === "function" && spr(p.img)){
        const im = spr(p.img);
        const s = p.pop ? p.size * (0.6 + 0.4 * easeOutBack(Math.min(1, p.t / 0.18))) : p.size;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.drawImage(im, -s / 2, -s / 2, s, s);
      } else if(p.rect){
        ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.fade ? (1 + p.t * 1.5) : k), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    for(const f of floats){
      const k = f.t / f.life;
      const s = f.pop ? easeOutBack(Math.min(1, f.t / 0.22)) : 1;
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.translate(f.x, f.y); ctx.scale(s, s);
      ctx.font = `900 ${f.size}px 'Bungee', -apple-system, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(3, f.size * 0.18); ctx.strokeStyle = "rgba(10,12,24,0.9)";
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  return { reset, update, draw, shake, shakeOffset, spark, smoke, debris, crashStar, confetti, floater };
})();
