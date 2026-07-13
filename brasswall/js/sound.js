"use strict";
/* 탄피성벽 — 사운드. 파일(assets/audio/*.mp3)이 있으면 재생, 없으면 WebAudio 미니신스 폴백.
 * (제작 단계에서 elevenlabs SFX/BGM 파일로 채운다 — 폴백 덕에 파일 전에도 손맛 유지)
 * BGM 은 Web Audio 루프(디코딩 PCM loop) — 파일은 make_seamless_loop.sh 로 crossfade-fold 처리 필수. */
const SND = (function () {
  let ctx = null, muted = false, bgmEl = null;
  let bgmBuf = null, bgmSrc = null, bgmGain = null, bgmWant = false, bgmLoading = false;
  const files = {};
  const FILE_NAMES = ["shoot", "clink", "brk", "boom", "hit", "hurt", "gem", "levelup", "pick", "dead", "revive", "trap", "turret", "ui", "win"];

  function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return ctx; }
  function preload() {
    for (const n of FILE_NAMES) {
      const a = new Audio();
      a.src = `assets/audio/${n}.mp3`;
      a.preload = "auto";
      a.onerror = () => { delete files[n]; };
      files[n] = a;
    }
  }
  // 미니신스 폴백 — (파형, 시작Hz, 끝Hz, 길이s, 게인)
  const SYNTH = {
    shoot:  ["square", 680, 340, 0.06, 0.10], clink: ["triangle", 900, 520, 0.09, 0.22],
    brk:    ["sawtooth", 300, 90, 0.16, 0.28], boom: ["sawtooth", 160, 40, 0.4, 0.4],
    hit:    ["square", 260, 120, 0.06, 0.18], hurt: ["sawtooth", 220, 70, 0.3, 0.4],
    gem:    ["sine", 660, 990, 0.09, 0.2], levelup: ["triangle", 440, 1180, 0.5, 0.4],
    pick:   ["triangle", 560, 840, 0.12, 0.3], dead: ["sine", 280, 60, 0.9, 0.4],
    revive: ["triangle", 300, 900, 0.5, 0.4], trap: ["square", 140, 100, 0.25, 0.22],
    turret: ["square", 520, 300, 0.05, 0.08], ui: ["sine", 500, 640, 0.06, 0.12],
    win:    ["triangle", 520, 1040, 0.5, 0.4],
  };
  function synth(name, pitch) {
    const c = ac(); if (c && c.state === "suspended") { try { c.resume(); } catch (e) {} }
    if (!c) return;
    const s = SYNTH[name] || SYNTH.hit;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = s[0];
    const p = pitch || 1;
    o.frequency.setValueAtTime(s[1] * p, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, s[2] * p), t + s[3]);
    g.gain.setValueAtTime(s[4], t);
    g.gain.exponentialRampToValueAtTime(0.001, t + s[3]);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + s[3] + 0.02);
  }
  // pitch: 1=기본. 연속 히트·젬 콤보는 피치를 올려서(±랜덤) — 손맛 원칙
  function play(name, pitch) {
    if (muted) return;
    const f = files[name];
    if (f && f.readyState >= 2) {
      try { const a = f.cloneNode(); a.volume = 0.85; a.playbackRate = pitch || 1; a.play().catch(() => {}); return; } catch (e) {}
    }
    synth(name, pitch);
  }
  // ── BGM (Web Audio 이음새 없는 루프, <audio> 폴백) ──
  function startBgmSource() {
    const c = ac(); if (!c || !bgmBuf || bgmSrc) return;
    if (!bgmGain) { bgmGain = c.createGain(); bgmGain.gain.value = 0.4; bgmGain.connect(c.destination); }
    bgmSrc = c.createBufferSource();
    bgmSrc.buffer = bgmBuf; bgmSrc.loop = true;
    bgmSrc.connect(bgmGain); bgmSrc.start(0);
  }
  function stopBgmSource() {
    if (bgmSrc) { try { bgmSrc.stop(); } catch (e) {} try { bgmSrc.disconnect(); } catch (e) {} bgmSrc = null; }
  }
  function loadBgm() {
    if (bgmBuf || bgmLoading) return;
    const c = ac(); if (!c) { bgmFallback(); return; }
    bgmLoading = true;
    fetch("assets/audio/bgm.mp3").then(r => r.arrayBuffer()).then(ab =>
      new Promise((res, rej) => c.decodeAudioData(ab, res, rej))
    ).then(buf => { bgmBuf = buf; bgmLoading = false; if (bgmWant && !muted) startBgmSource(); })
     .catch(() => { bgmLoading = false; bgmFallback(); });
  }
  function bgmFallback() {
    if (!bgmEl) { bgmEl = new Audio("assets/audio/bgm.mp3"); bgmEl.loop = true; bgmEl.volume = 0.4; bgmEl.onerror = () => { bgmEl = null; }; }
    if (bgmEl && bgmWant && !muted) bgmEl.play().catch(() => {});
  }
  function bgm(on) {
    bgmWant = !!on;
    const c = ac(); if (c && c.state === "suspended") { try { c.resume(); } catch (e) {} }
    if (on && !muted) {
      if (bgmBuf) startBgmSource();
      else { loadBgm(); if (bgmEl) bgmFallback(); }
    } else {
      stopBgmSource();
      if (bgmEl) bgmEl.pause();
    }
  }
  function setMuted(m) { muted = m; bgm(bgmWant); Meta.data.mute = m; Meta.save(); }
  function isMuted() { return muted; }
  muted = !!Meta.data.mute;
  preload();
  return { play, bgm, setMuted, isMuted };
})();
