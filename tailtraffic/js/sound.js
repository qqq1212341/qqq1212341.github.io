"use strict";
/* 꼬리추월 — 사운드. SFX=WebAudio 신스(피치 변주), BGM=버퍼 루프(Web Audio 재생 → MP3 패딩 공백 제거, 심리스).
 * BGM 파일은 studio/tools/make_seamless_loop.sh(crossfade-fold) 산출물을 assets/audio/bgm.mp3 로. */
const SND = (function(){
  let ac = null, sfxGain = null, bgmGain = null, bgmSrc = null, bgmBuf = null, bgmWanted = false;

  function ctx(){
    if(!ac){
      try{
        ac = new (window.AudioContext || window.webkitAudioContext)();
        sfxGain = ac.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(ac.destination);
        bgmGain = ac.createGain(); bgmGain.gain.value = 0.42; bgmGain.connect(ac.destination);
        loadBgm();
      }catch(e){ return null; }
    }
    if(ac.state === "suspended") ac.resume().catch(()=>{});
    return ac;
  }
  // 첫 제스처에서 언락 (iOS)
  const unlock = () => { ctx(); if(bgmWanted) playBgm(); };
  window.addEventListener("pointerdown", unlock, { once: false });

  function loadBgm(){
    fetch("assets/audio/bgm.mp3").then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => ac.decodeAudioData(b))
      .then(buf => { bgmBuf = buf; if(bgmWanted) playBgm(); })
      .catch(()=>{ /* BGM 없으면 조용히 — 게임은 사운드 없이도 동작 */ });
    loadSample("crash", "assets/audio/crash.mp3");
  }
  const samples = {};
  function loadSample(name, url){
    fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => ac.decodeAudioData(b)).then(buf => { samples[name] = buf; }).catch(()=>{});
  }
  function playSample(name, vol){
    if(!ac || !state.snd.sfx || !samples[name]) return false;
    const src = ac.createBufferSource(); src.buffer = samples[name];
    const g = ac.createGain(); g.gain.value = vol || 1;
    src.connect(g); g.connect(sfxGain); src.start(0);
    return true;
  }
  function playBgm(){
    bgmWanted = true;
    if(!state.snd.bgm || !ac || !bgmBuf || bgmSrc) return;
    bgmSrc = ac.createBufferSource();
    bgmSrc.buffer = bgmBuf; bgmSrc.loop = true;
    bgmSrc.connect(bgmGain); bgmSrc.start(0);
  }
  function stopBgm(){
    bgmWanted = false;
    if(bgmSrc){ try{ bgmSrc.stop(); }catch(e){} bgmSrc = null; }
  }
  function applySndSettings(){
    if(!state.snd.bgm) { if(bgmSrc){ try{ bgmSrc.stop(); }catch(e){} bgmSrc = null; } }
    else if(bgmWanted) playBgm();
  }

  // ── 신스 프리미티브 ──
  function tone(freq, dur, { type = "sine", vol = 0.5, slide = 0, delay = 0, attack = 0.004 } = {}){
    const c = ctx(); if(!c || !state.snd.sfx) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, { vol = 0.5, freq = 1200, q = 1, slide = 0, delay = 0, type = "bandpass" } = {}){
    const c = ctx(); if(!c || !state.snd.sfx) return;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if(slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + slide), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // ── 게임 SFX (피치 계단 = 콤보) ──
  const PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568]; // C5 펜타토닉 상행
  function overtake(combo){
    const f = PENTA[Math.min(PENTA.length - 1, Math.max(0, combo - 1))];
    tone(f, 0.11, { type: "square", vol: 0.22 });
    tone(f * 2, 0.09, { type: "sine", vol: 0.12, delay: 0.02 });
  }
  function attach(){
    tone(190, 0.10, { type: "sine", vol: 0.5, slide: -80 });          // 자석 툰
    tone(1200, 0.05, { type: "triangle", vol: 0.18, delay: 0.05 });   // 클릭 스냅
  }
  function nearmiss(){ noise(0.16, { vol: 0.35, freq: 2400, slide: -1800, q: 2 }); }
  function clutch(){ noise(0.30, { vol: 0.3, freq: 900, slide: 1600, q: 3 }); tone(1568, 0.18, { vol: 0.15, delay: 0.1 }); }
  function whip(){ // 채찍: 휘두르는 스우쉬 + 퍽 타격
    noise(0.13, { vol: 0.42, freq: 2000, slide: -1500, q: 1.5 });
    tone(160, 0.13, { type: "square", vol: 0.34, slide: -70, delay: 0.02 });
  }
  function cut(){ // 잘림: 둔탁한 크런치
    noise(0.24, { vol: 0.5, freq: 700, slide: -500, q: 0.8, type: "lowpass" });
    tone(105, 0.22, { type: "sawtooth", vol: 0.3, slide: -40 });
  }
  function milestone(n){
    [0, 1, 2].forEach(i => tone(PENTA[(i * 2) % PENTA.length] * 1.0, 0.12, { type: "triangle", vol: 0.3, delay: i * 0.07 }));
    tone(PENTA[8], 0.3, { type: "sine", vol: 0.2, delay: 0.24 });
  }
  function crash(){
    const played = playSample("crash", 0.9); // 리얼 샘플 우선
    noise(0.35, { vol: played ? 0.35 : 0.8, freq: 500, slide: -380, q: 0.8, type: "lowpass" });
    tone(70, 0.4, { type: "sine", vol: 0.7, slide: -30 });
    if(!played) noise(0.12, { vol: 0.4, freq: 3000, q: 1.5, delay: 0.01 });
  }
  function newRecord(){
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: "triangle", vol: 0.32, delay: i * 0.09 }));
  }
  function coin(){ tone(1319, 0.07, { type: "square", vol: 0.10 }); tone(1568, 0.09, { type: "square", vol: 0.10, delay: 0.05 }); }
  function button(){ tone(660, 0.06, { type: "square", vol: 0.15 }); }
  function blink(){ tone(880, 0.05, { type: "square", vol: 0.08 }); }

  // ── 햅틱 ──
  function haptic(ms){
    try{
      const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
      if(H && H.impact){ H.impact({ style: ms > 30 ? "MEDIUM" : "LIGHT" }); return; }
      if(navigator.vibrate) navigator.vibrate(ms);
    }catch(e){}
  }

  return { ctx, playBgm, stopBgm, applySndSettings, overtake, attach, nearmiss, clutch, whip, cut, milestone, crash, newRecord, coin, button, blink, haptic };
})();
