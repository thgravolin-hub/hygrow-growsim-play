/* HyGrow Grow Sim - procedural Web Audio kit. No assets. window.Sfx */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  var KEY = 'hygrow_audio_v1';
  var ctx = null, master, comp, sfxBus, musBus, musGate, ambBus, noiseBuf;
  var st = { sfx: 0.8, music: 0.5, muted: false };
  var PREF = 'hygrow_sound_pref_v1', legacy = null, chosen = null; /* PREF: 'on' | 'off', written only when the player chooses (mute button or the first-visit chip) */
  var wantMusic = false, wantAmb = null, wantTrack = 'grow';
  var VOLKEY = 'hygrow_volume_v1', vol = 1, duck = 1, DUCK_DB = -8, svcT = null, svcN = 0; /* v37: master volume 0..1 (own key), ambience/music duck while a voice clip plays, service timer */
  try { var vs = localStorage.getItem(VOLKEY); if (vs !== null && vs !== '' && isFinite(+vs)) vol = Math.max(0, Math.min(1, +vs)); } catch (e) {} /* v37 */
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { st.sfx = +s.sfx; st.music = +s.music; legacy = s.muted ? 'off' : 'on'; if (!(st.sfx >= 0)) st.sfx = 0.8; if (!(st.music >= 0)) st.music = 0.5; } } catch (e) {}
  /* ?mute=1 in the URL (or hygrow_mute_tests=1 in localStorage) forces silence for automated runs; never saved to the player's settings */
  var FORCE_MUTE = false; try { FORCE_MUTE = /[?&]mute=1\b/.test(location.search) || localStorage.getItem('hygrow_mute_tests') === '1'; } catch (e) {}
  /* sound preference: a stored choice wins (hygrow_sound_pref_v1, or the older muted flag inside hygrow_audio_v1); with no choice the game starts muted; ?mute=1 forces mute. Pure, exported as Sfx.initialMuted. */
  function initialMuted(o) {
    o = o || {}; var q = o.query, forced = q === true || q === 1 || (typeof q === 'string' && /(^|[?&])mute=1\b/.test(q));
    if (forced) return true;
    if (o.stored === 'on') return false;
    return true; /* 'off', or no stored choice yet */
  }
  try { var ps = localStorage.getItem(PREF); chosen = ps === 'on' || ps === 'off' ? ps : legacy; } catch (e) { chosen = legacy; }
  st.muted = initialMuted({ stored: chosen, query: FORCE_MUTE });
  function savePref() { if (FORCE_MUTE) return; chosen = st.muted ? 'off' : 'on'; try { localStorage.setItem(PREF, chosen); } catch (e) {} }
  var clock = function () { return Date.now(); }, lastCue = {};
  function save() { if (FORCE_MUTE) return; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function clamp(v) { v = +v; return v < 0 ? 0 : v > 1 ? 1 : (v || 0); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function rr(a, b) { return a + Math.random() * (b - a); }

  /* ---------- core ---------- */
  function build(c) {
    ctx = c;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    var lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    master = ctx.createGain(); master.gain.value = st.muted ? 0 : vol; /* v37 */
    sfxBus = ctx.createGain(); musBus = ctx.createGain(); ambBus = ctx.createGain();
    musGate = ctx.createGain(); musGate.gain.value = 0;
    sfxBus.gain.value = st.sfx; musBus.gain.value = st.music; ambBus.gain.value = st.sfx;
    musGate.connect(musBus); musBus.connect(comp); sfxBus.connect(comp); ambBus.connect(comp);
    comp.connect(lim); lim.connect(master); master.connect(ctx.destination);
    var n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  function init() {
    if (!AC) return false;
    try {
      if (st.muted) return false; /* v37: muted = no context, no music, no ambience: nothing is generated until the player unmutes */
      if (!ctx) { ctx = new AC(); build(ctx); }
      if (ctx.state === 'suspended') ctx.resume();
      if (wantMusic) startMusic(wantTrack);
      if (wantAmb) startAmb(wantAmb);
      service(true); /* v37 */
      return true;
    } catch (e) { ctx = null; return false; }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function h() { if (init() && ctx.state === 'running') window.removeEventListener(ev, h, true); }, true);
  });

  /* v37: what the player just touched, so one 'click' cue can sound different for the dock bar, a tile and a plain button, and the pour cue can follow the action (ui.js call sites stay as they are) */
  var TOUCH = { kind: 'ui', act: null, at: 0 };
  function touchOf(e) {
    try {
      var el = e && e.target; if (e && e.type === 'keydown' && document.activeElement) el = document.activeElement;
      if (!el || !el.closest) return;
      var a = el.closest('[data-act]'), k = 'ui';
      if (a || el.closest('#dock, #dockOverflow')) k = 'bar'; else if (el.closest('.tile, .gear, [data-where], [data-how], [data-k]')) k = 'tile';
      TOUCH = { kind: k, act: a ? a.getAttribute('data-act') : null, at: Date.now() };
    } catch (er) {}
  }
  ['pointerdown', 'keydown', 'click'].forEach(function (ev) { try { window.addEventListener(ev, touchOf, true); } catch (e) {} });
  function touchFresh() { return Date.now() - TOUCH.at < 1500 ? TOUCH : { kind: 'ui', act: null }; }

  /* ---------- building blocks ---------- */
  // tone: {t,f,f2,dur,type,vol,a,bus,lp,det}
  function tone(o) {
    var t = o.t, osc = ctx.createOscillator(), g = ctx.createGain(), dur = o.dur || 0.2, a = o.a || 0.005, v = o.vol == null ? 0.3 : o.vol;
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    if (o.det) osc.detune.value = o.det;
    g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var out = osc;
    if (o.lp) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); out = f; }
    out.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
    return { osc: osc, gain: g };
  }
  // noise burst: {t,dur,ft,f,f2,q,vol,a,bus}
  function noise(o) {
    var t = o.t, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), dur = o.dur || 0.1, a = o.a || 0.005;
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.ft || 'bandpass'; f.Q.value = o.q || 1; f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol == null ? 0.2 : o.vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return { src: src, filter: f, gain: g };
  }
  function marimba(t, f, v, bus) { tone({ t: t, f: f, dur: 0.45, vol: v, a: 0.003, bus: bus }); tone({ t: t, f: f * 4, dur: 0.08, vol: v * 0.35, a: 0.002, bus: bus }); }
  function pluck(t, f, v, bus, dur) { tone({ t: t, f: f, type: 'triangle', dur: dur || 0.5, vol: v, a: 0.004, lp: 2400, bus: bus }); tone({ t: t, f: f * 2, dur: 0.2, vol: v * 0.3, a: 0.003, bus: bus }); }
  function bell(t, f, v, bus) { tone({ t: t, f: f, dur: 0.9, vol: v, a: 0.004, bus: bus }); tone({ t: t, f: f * 2.76, dur: 0.4, vol: v * 0.25, a: 0.004, bus: bus }); }
  // quokka-ish chirp run (also used for ambience birds): n syllables, bus + volume multiplier
  function chirp(t, n, p, r, step, bus, vm) {
    for (var i = 0; i < n; i++) {
      var f = (520 + r() * 380) * p, up = r() > 0.4, dur = 0.05 + r() * 0.04, st0 = t + i * step + r() * 0.012, v = (0.14 + r() * 0.08) * vm;
      var osc = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(f, st0); osc.frequency.exponentialRampToValueAtTime(f * (up ? 1.3 : 0.8), st0 + dur);
      bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.value = 700 + r() * 1400;
      g.gain.value = 0; g.gain.setValueAtTime(0.0001, st0); g.gain.linearRampToValueAtTime(v, st0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, st0 + dur);
      osc.connect(bp); bp.connect(g); g.connect(bus); osc.start(st0); osc.stop(st0 + dur + 0.03);
      tone({ t: st0, f: f * 2, f2: f * (up ? 2.6 : 1.6), dur: dur, vol: v * 0.35, type: 'sine', bus: bus });
    }
  }
  // ---- cast voices ----
  var VC = null; // current voice {g}
  function stopVoice() {
    var v = VC; VC = null; if (!v || !ctx) return;
    try { var t = ctx.currentTime; v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + 0.04); setTimeout(function () { try { v.g.disconnect(); } catch (e) {} }, 250); } catch (e) {}
  }
  function voiceBus() { stopVoice(); var g = ctx.createGain(); g.gain.value = 1; g.connect(sfxBus); VC = { g: g }; return g; }
  var VOWELS = [[730, 1090], [530, 1840], [570, 840], [440, 1020], [660, 1700]];
  // f: [base,spread] Hz at pitch 1; d: [min,spread] s; v: [min,spread]; w: [[type,gain]]; fm: formant mix; br: breath; fs: formant scale
  var VOICES = {
    deb: { p: 1.0, f: [200, 55], d: [0.09, 0.07], v: [0.3, 0.1], step: 0.13, jit: 0.02, w: [['sine', 1], ['triangle', 0.45]], lp: 2200, fm: 0.5, br: 0.05, fs: 1.1 },
    rob: { p: 0.72, f: [200, 45], d: [0.1, 0.0], v: [0.34, 0.0], step: 0.14, jit: 0, w: [['square', 0.55], ['sine', 0.5]], lp: 650, fm: 0.35, br: 0, fs: 0.85 },
    kez: { p: 1.25, f: [250, 70], d: [0.04, 0.04], v: [0.3, 0.1], step: 0.075, jit: 0.008, w: [['triangle', 1]], lp: 3600, fm: 0.6, br: 0.03, fs: 1.2 }
  };
  function voiceGen(t, o, c) {
    var n = Math.max(1, Math.min(10, o.syllables || 2)), p = o.pitch || c.p, r = rng(o.seed != null ? o.seed : Math.floor(Math.random() * 1e9)), bus = voiceBus();
    for (var i = 0; i < n; i++) {
      var f0 = (c.f[0] + r() * c.f[1]) * p, dur = c.d[0] + r() * c.d[1], st0 = t + i * c.step + r() * c.jit, v = c.v[0] + r() * c.v[1], vw = VOWELS[Math.floor(r() * VOWELS.length)], gl = r() > 0.5 ? 0.94 : 1.03;
      var g = ctx.createGain(), mix = ctx.createGain(), lp = ctx.createBiquadFilter();
      g.gain.value = 0; g.gain.setValueAtTime(0.0001, st0); g.gain.linearRampToValueAtTime(v, st0 + 0.02); g.gain.setValueAtTime(v * 0.8, st0 + dur * 0.65); g.gain.exponentialRampToValueAtTime(0.0001, st0 + dur + 0.03);
      c.w.forEach(function (w) {
        var osc = ctx.createOscillator(), og = ctx.createGain(); osc.type = w[0]; og.gain.value = w[1];
        osc.frequency.setValueAtTime(f0 * 1.05, st0); osc.frequency.exponentialRampToValueAtTime(f0 * gl, st0 + dur);
        osc.connect(og); og.connect(g); osc.start(st0); osc.stop(st0 + dur + 0.06);
      });
      lp.type = 'lowpass'; lp.frequency.value = c.lp; g.connect(lp); lp.connect(mix);
      vw.forEach(function (F, k) { var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F * c.fs; bp.Q.value = k ? 8 : 5; var fg = ctx.createGain(); fg.gain.value = c.fm * (k ? 0.6 : 1); g.connect(bp); bp.connect(fg); fg.connect(mix); });
      mix.connect(bus);
      if (c.br) noise({ t: st0, dur: dur, ft: 'bandpass', f: 2800, q: 0.8, vol: c.br * v / 0.3, a: 0.02, bus: bus });
    }
  }
  var PENT = [0, 2, 4, 7, 9]; // major pentatonic semitones
  function pent(base, i) { var o = Math.floor(i / 5); return base + PENT[((i % 5) + 5) % 5] + 12 * o; }

  /* ---------- sounds ---------- */
  var S = {
    click: function (t, o) { /* v37: kind 'bar' = dock button (lower, a touch of thump), 'tile' = picker tile (higher, shorter), 'ui' = the old click */
      var k = o.kind, p = (o.pitch || 1) * (k === 'bar' ? 0.78 : k === 'tile' ? 1.3 : 1), sh = k === 'tile' ? 0.7 : 1;
      tone({ t: t, f: 620 * p, f2: 380 * p, dur: 0.06 * sh, vol: 0.28, type: 'triangle', lp: 2000 }); tone({ t: t, f: 1240 * p, dur: 0.03 * sh, vol: 0.12 }); noise({ t: t, dur: 0.03 * sh, f: 1800 * (k === 'tile' ? 1.4 : 1), q: 2, vol: 0.12 });
      if (k === 'bar') tone({ t: t, f: 170, f2: 95, dur: 0.07, vol: 0.2, a: 0.003 });
    },
    hover: function (t, o) { tone({ t: t, f: 1900 * (o.pitch || 1), dur: 0.025, vol: 0.06 }); },
    pour: function (t, o) { /* v37: o.pitch moves the pour (Mix low, Water high) */
      var pp = (o && o.pitch) || 1, n = noise({ t: t, dur: 0.8, f: 700 * pp, q: 1.5, vol: 0.28, a: 0.08 });
      var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 9; lg.gain.value = 260; lfo.connect(lg); lg.connect(n.filter.frequency); lfo.start(t); lfo.stop(t + 0.85);
      var l2 = ctx.createOscillator(), g2 = ctx.createGain(); l2.frequency.value = 6; g2.gain.value = 0.1; l2.connect(g2); g2.connect(n.gain.gain); l2.start(t); l2.stop(t + 0.85);
      for (var i = 0; i < 5; i++) { var bt = t + 0.05 + i * 0.15 + rr(0, 0.06), f = rr(250, 500) * pp; tone({ t: bt, f: f, f2: f * 1.8, dur: 0.07, vol: 0.12 }); }
    },
    bubble: function (t, o) { var n = 4 + Math.floor(Math.random() * 4), p = o.pitch || 1; for (var i = 0; i < n; i++) { var bt = t + i * rr(0.04, 0.1), f = rr(400, 1100) * p; tone({ t: bt, f: f, f2: f * 1.9, dur: rr(0.05, 0.1), vol: rr(0.08, 0.16) }); } },
    drip: function (t, o) { var p = o.pitch || 1; tone({ t: t, f: 1500 * p, f2: 600 * p, dur: 0.12, vol: 0.25 }); tone({ t: t + 0.1, f: 900 * p, f2: 450 * p, dur: 0.15, vol: 0.08 }); },
    spray: function (t) { for (var i = 0; i < 2; i++) noise({ t: t + i * 0.26, dur: 0.18, f: 3200, f2: 5200, q: 0.7, vol: 0.22, a: 0.02 }); },
    snip: function (t) { for (var i = 0; i < 2; i++) { var s = t + i * 0.08; noise({ t: s, dur: 0.045, ft: 'highpass', f: 4500, vol: 0.18 }); tone({ t: s, f: 2600 - i * 300, f2: 1800, dur: 0.04, vol: 0.07, type: 'square', lp: 4000 }); } },
    grow: function (t, o) { var b = 72 + Math.round(12 * Math.log2(o.pitch || 1)); for (var i = 0; i < 4; i++) { var f = mtof(pent(b, i * 2)); marimba(t + i * 0.08, f, 0.2); bell(t + i * 0.08, f * 2, 0.05); } },
    stage: function (t) { [72, 76, 79, 81, 84].forEach(function (m, i) { pluck(t + i * 0.1, mtof(m), 0.22); if (i === 4) { bell(t + i * 0.1, mtof(m + 12), 0.12); bell(t + i * 0.1, mtof(m), 0.1); } }); },
    alert: function (t) { tone({ t: t, f: 660, dur: 0.18, vol: 0.2, type: 'triangle', lp: 1800 }); tone({ t: t + 0.17, f: 523, dur: 0.28, vol: 0.2, type: 'triangle', lp: 1800 }); },
    bad: function (t) {
      [[261.6, 0], [196, 0.2]].forEach(function (x) {
        var n = tone({ t: t + x[1], f: x[0], dur: 0.32, vol: 0.28, type: 'triangle', lp: 900 });
        var l = ctx.createOscillator(), g = ctx.createGain(); l.frequency.value = 9; g.gain.value = 14; l.connect(g); g.connect(n.osc.detune); l.start(t + x[1]); l.stop(t + x[1] + 0.4);
        n.osc.frequency.setValueAtTime(x[0], t + x[1]); n.osc.frequency.exponentialRampToValueAtTime(x[0] * 0.85, t + x[1] + 0.32);
      });
    },
    coin: function (t) { tone({ t: t, f: 988, dur: 0.09, vol: 0.2, type: 'square', lp: 3000 }); tone({ t: t + 0.08, f: 1319, dur: 0.5, vol: 0.2, type: 'square', lp: 3500 }); bell(t + 0.08, 2637, 0.1); noise({ t: t + 0.08, dur: 0.1, ft: 'highpass', f: 6000, vol: 0.06 }); },
    harvest: function (t, o) {
      var crop = o && o.crop, leafy = crop === 'basil' || crop === 'lettuce', fruit = ['tomato', 'chilli', 'cucumber', 'capsicum', 'strawberry'].indexOf(crop) >= 0;
      if (leafy || fruit) {
        // two lead-in notes + a 3-note tail: leafy = gentle minor pentatonic, fruiting = bright major pentatonic
        var tail = leafy ? [75, 79, 82] : [79, 84, 88], tv = leafy ? 0.2 : 0.25, ch = leafy ? [72, 75, 79, 82] : [72, 76, 79, 84];
        [[72, 0, 0.12], [72, 0.13, 0.12]].forEach(function (n) { pluck(t + n[1], mtof(n[0]), tv, null, n[2] + 0.3); });
        tail.forEach(function (m, i) { pluck(t + 0.26 + i * 0.15, mtof(m), tv, null, i === 2 ? 0.9 : 0.42); });
        ch.forEach(function (m) { tone({ t: t + 0.56, f: mtof(m - 12), dur: 0.9, vol: leafy ? 0.07 : 0.09, type: 'triangle', lp: leafy ? 1100 : 1500, a: 0.02 }); });
        if (fruit) { bell(t + 0.56, mtof(96), 0.1); bell(t + 0.7, mtof(100), 0.07); } else bell(t + 0.62, mtof(87), 0.06);
        return;
      }
      [[72, 0, 0.12], [72, 0.13, 0.12], [76, 0.26, 0.12], [79, 0.39, 0.14], [84, 0.56, 0.6]].forEach(function (n) { pluck(t + n[1], mtof(n[0]), 0.24, null, n[2] + 0.3); });
      [72, 76, 79, 84].forEach(function (m) { tone({ t: t + 0.56, f: mtof(m - 12), dur: 0.9, vol: 0.09, type: 'triangle', lp: 1500, a: 0.02 }); });
      bell(t + 0.56, mtof(96), 0.1); bell(t + 0.7, mtof(91), 0.07);
    },
    pop: function (t, o) { var p = o.pitch || 1; tone({ t: t, f: 280 * p, f2: 900 * p, dur: 0.1, vol: 0.28 }); tone({ t: t + 0.04, f: 1200 * p, dur: 0.08, vol: 0.1 }); noise({ t: t, dur: 0.04, f: 2500, vol: 0.08 }); },
    lightsOn: function (t) {
      noise({ t: t, dur: 0.03, f: 2200, q: 3, vol: 0.2 });
      var h = tone({ t: t + 0.05, f: 90, f2: 120, dur: 0.7, vol: 0.14, type: 'sawtooth', lp: 500, a: 0.2 });
      tone({ t: t + 0.05, f: 240, dur: 0.6, vol: 0.05, type: 'sine', a: 0.2 }); tone({ t: t + 0.25, f: 1760, dur: 0.15, vol: 0.05 });
    },
    lightsOff: function (t) { noise({ t: t, dur: 0.03, f: 1500, q: 3, vol: 0.2 }); tone({ t: t, f: 120, f2: 50, dur: 0.45, vol: 0.13, type: 'sawtooth', lp: 400, a: 0.01 }); tone({ t: t, f: 1100, f2: 400, dur: 0.12, vol: 0.05 }); },
    quokka: function (t, o) {
      chirp(t, Math.max(1, Math.min(12, o.syllables || 2)), o.pitch || 1, rng(o.seed != null ? o.seed : Math.floor(Math.random() * 1e9)), 0.085, sfxBus, 1);
    },
    // cast voices (share the 'axel' signature {syllables, seed, pitch}); each call cancels the previous voice
    voiceDeb: function (t, o) { voiceGen(t, o, VOICES.deb); },
    voiceRob: function (t, o) { voiceGen(t, o, VOICES.rob); },
    voiceKez: function (t, o) { voiceGen(t, o, VOICES.kez); },
    voiceAxel: function (t, o) { var bus = voiceBus(), real = sfxBus; sfxBus = bus; try { S.axel(t, o); } finally { sfxBus = real; } },
    // Axel's voice: deep, warm male "mumble" — low glottal saw through two vowel formants
    axel: function (t, o) {
      var n = Math.max(1, Math.min(10, o.syllables || 2)), p = o.pitch || 1, r = rng(o.seed != null ? o.seed : Math.floor(Math.random() * 1e9)), step = 0.15;
      var vowels = [[730, 1090], [530, 1840], [570, 840], [440, 1020], [660, 1700]];
      for (var i = 0; i < n; i++) {
        var f0 = (92 + r() * 34) * p, dur = 0.1 + r() * 0.07, st0 = t + i * step + r() * 0.02, v = 0.32 + r() * 0.12, vw = vowels[Math.floor(r() * vowels.length)];
        var osc = ctx.createOscillator(), g = ctx.createGain(), mix = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(f0 * 1.06, st0); osc.frequency.exponentialRampToValueAtTime(f0 * (r() > 0.5 ? 0.92 : 1.02), st0 + dur);
        g.gain.value = 0; g.gain.setValueAtTime(0.0001, st0); g.gain.linearRampToValueAtTime(v, st0 + 0.025); g.gain.setValueAtTime(v * 0.8, st0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, st0 + dur + 0.04);
        osc.connect(g);
        vw.forEach(function (F, k) { var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F; bp.Q.value = k ? 9 : 6; var fg = ctx.createGain(); fg.gain.value = k ? 0.6 : 1.1; g.connect(bp); bp.connect(fg); fg.connect(mix); });
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; var lg = ctx.createGain(); lg.gain.value = 0.35; g.connect(lp); lp.connect(lg); lg.connect(mix);
        mix.connect(sfxBus); osc.start(st0); osc.stop(st0 + dur + 0.08);
      }
    },
    whoosh: function (t) { noise({ t: t, dur: 0.32, f: 300, f2: 2200, q: 1.2, vol: 0.2, a: 0.1 }); noise({ t: t + 0.15, dur: 0.2, f: 2200, f2: 500, q: 1.2, vol: 0.1, a: 0.04 }); },
    doorChime: function (t) { bell(t, mtof(88), 0.14); bell(t + 0.22, mtof(84), 0.14); bell(t + 0.22, mtof(91), 0.05); },
    cashRegister: function (t) {
      noise({ t: t, dur: 0.05, ft: 'highpass', f: 3000, vol: 0.16 }); tone({ t: t, f: 180, f2: 90, dur: 0.08, vol: 0.2, type: 'triangle' });
      for (var i = 0; i < 3; i++) tone({ t: t + 0.1 + i * 0.03, f: 2400 + i * 300, dur: 0.05, vol: 0.06, type: 'square', lp: 5000 });
      bell(t + 0.2, 2093, 0.14); bell(t + 0.2, 3136, 0.06); noise({ t: t + 0.26, dur: 0.12, ft: 'highpass', f: 6500, vol: 0.05 });
    },
    pageTurn: function (t) { noise({ t: t, dur: 0.16, f: 2500, f2: 6000, q: 0.8, vol: 0.12, a: 0.05 }); noise({ t: t + 0.13, dur: 0.04, ft: 'highpass', f: 5000, vol: 0.07 }); },
    chapterStart: function (t) { [60, 67, 72, 76].forEach(function (m, i) { pluck(t + i * 0.09, mtof(m), 0.18); }); bell(t + 0.36, mtof(84), 0.1); tone({ t: t + 0.36, f: mtof(48), dur: 0.8, vol: 0.1, type: 'triangle', lp: 900, a: 0.02 }); },
    chapterDone: function (t) {
      [[72, 0], [72, 0.14], [76, 0.28], [79, 0.42], [84, 0.62], [88, 0.8]].forEach(function (n) { pluck(t + n[1], mtof(n[0]), 0.2, null, 0.4); });
      [60, 64, 67, 72].forEach(function (m) { tone({ t: t + 0.62, f: mtof(m), dur: 1.4, vol: 0.08, type: 'triangle', lp: 1500, a: 0.03 }); });
      bell(t + 0.8, mtof(96), 0.12); bell(t + 1.0, mtof(100), 0.07); noise({ t: t + 0.62, dur: 0.5, ft: 'highpass', f: 7000, vol: 0.04, a: 0.1 });
    },
    matesUp: function (t) { [67, 72, 76].forEach(function (m, i) { marimba(t + i * 0.07, mtof(m), 0.17); }); bell(t + 0.21, mtof(91), 0.09); tone({ t: t + 0.05, f: 700, f2: 1500, dur: 0.2, vol: 0.05 }); },
    waterDrop: function (t, o) { var p = o.pitch || 1; tone({ t: t, f: 1100 * p, f2: 380 * p, dur: 0.14, vol: 0.2 }); tone({ t: t + 0.09, f: 700 * p, f2: 350 * p, dur: 0.12, vol: 0.07 }); },
    sprinkle: function (t) { noise({ t: t, dur: 0.5, f: 4500, f2: 3500, q: 0.6, vol: 0.14, a: 0.08 }); for (var i = 0; i < 7; i++) { var f = rr(1500, 3200); tone({ t: t + rr(0, 0.45), f: f, f2: f * 0.6, dur: 0.05, vol: 0.05 }); } },
    fanOn: function (t, o) { var fp = (o && o.pitch) || 1; noise({ t: t, dur: 0.6, f: 250 * fp, f2: 1600 * fp, q: 0.9, vol: 0.2, a: 0.25 }); tone({ t: t, f: 60 * fp, f2: 130 * fp, dur: 0.6, vol: 0.08, type: 'sawtooth', lp: 400, a: 0.25 }); },
    fanOff: function (t) { noise({ t: t, dur: 0.6, f: 1500, f2: 180, q: 0.9, vol: 0.18, a: 0.03 }); tone({ t: t, f: 130, f2: 45, dur: 0.6, vol: 0.07, type: 'sawtooth', lp: 400, a: 0.02 }); },
    humidifierOn: function (t) { noise({ t: t, dur: 0.7, f: 6500, f2: 5000, q: 0.5, vol: 0.12, a: 0.25 }); tone({ t: t, f: 520, f2: 760, dur: 0.15, vol: 0.06, type: 'triangle' }); },
    plantPop: function (t) { tone({ t: t, f: 330, f2: 990, dur: 0.09, vol: 0.22 }); tone({ t: t + 0.07, f: 660, f2: 1320, dur: 0.1, vol: 0.12 }); marimba(t + 0.1, mtof(84), 0.1); },
    seedPlant: function (t) { tone({ t: t, f: 140, f2: 80, dur: 0.1, vol: 0.2, type: 'triangle' }); noise({ t: t, dur: 0.12, f: 900, q: 1, vol: 0.12 }); tone({ t: t + 0.12, f: 880, f2: 1170, dur: 0.12, vol: 0.08 }); },
    warnTick: function (t) { tone({ t: t, f: 1400, dur: 0.04, vol: 0.14, type: 'square', lp: 3000 }); tone({ t: t + 0.11, f: 1400, dur: 0.04, vol: 0.14, type: 'square', lp: 3000 }); },
    uiOpen: function (t) { tone({ t: t, f: 420, f2: 700, dur: 0.1, vol: 0.18, type: 'triangle', lp: 2500 }); noise({ t: t, dur: 0.08, f: 1500, f2: 3500, q: 1, vol: 0.06 }); },
    uiClose: function (t) { tone({ t: t, f: 700, f2: 400, dur: 0.09, vol: 0.16, type: 'triangle', lp: 2500 }); noise({ t: t, dur: 0.07, f: 3000, f2: 1200, q: 1, vol: 0.05 }); },
    swipe: function (t) { noise({ t: t, dur: 0.14, f: 900, f2: 3000, q: 1.2, vol: 0.1, a: 0.05 }); },
    /* ---- pass 4 cues: short and quiet, all well below the voice blips (voiceAxel peaks 0.32 to 0.44). Played through Sfx.cue(), which checks mute first ---- */
    toastTick: function (t) { tone({ t: t, f: 1500, f2: 1150, dur: 0.035, vol: 0.05, type: 'triangle', lp: 3200, a: 0.002 }); },
    cardOpen: function (t) { tone({ t: t, f: 660, dur: 0.11, vol: 0.07, type: 'triangle', lp: 2600, a: 0.004 }); tone({ t: t + 0.085, f: 880, dur: 0.16, vol: 0.07, type: 'triangle', lp: 2600, a: 0.004 }); },
    cardClose: function (t) { tone({ t: t, f: 880, dur: 0.1, vol: 0.055, type: 'triangle', lp: 2600, a: 0.004 }); tone({ t: t + 0.08, f: 587, dur: 0.14, vol: 0.055, type: 'triangle', lp: 2600, a: 0.004 }); },
    gaugeChime: function (t) { tone({ t: t, f: 1976, dur: 0.32, vol: 0.04, a: 0.003 }); tone({ t: t, f: 1976 * 2.76, dur: 0.12, vol: 0.01, a: 0.003 }); },
    alertThud: function (t) { /* low double thud with a little upper body so phone speakers carry it; a soft knock, not a buzzer */
      [[0, 165, 88, 0.15], [0.17, 150, 80, 0.12]].forEach(function (n) { tone({ t: t + n[0], f: n[1], f2: n[2], dur: 0.17, vol: n[3], a: 0.004 }); tone({ t: t + n[0], f: n[1] * 2, f2: n[2] * 2, dur: 0.07, vol: n[3] * 0.3, type: 'triangle', lp: 1200, a: 0.003 }); });
    },
    firstHarvest: function (t, o) { /* the usual harvest cue, then a short rising arpeggio over its tail */
      S.harvest(t, o || {});
      [84, 88, 91, 96].forEach(function (m, i) { pluck(t + 0.9 + i * 0.07, mtof(m), 0.09, null, 0.4); });
      bell(t + 1.18, mtof(103), 0.04);
    }
  };

  // per-sound level trims in dB (measured offline with Sfx._render; see art/AUDIO-REPORT.md)
  var TRIM = { click: 3, hover: 16, uiOpen: 8, uiClose: 8, swipe: 17, pageTurn: 10, alert: 9, bad: 5.5, chapterDone: 2.5, cashRegister: 7, pour: 6, bubble: 5, drip: 5, spray: 5, waterDrop: 7, sprinkle: 7, fanOn: 7, fanOff: 9, humidifierOn: 7, plantPop: 7, seedPlant: 8, warnTick: 5, lightsOff: 10, lightsOn: 3, quokka: 10, whoosh: 14, pop: 4, axel: 3, voiceAxel: 3, voiceDeb: -12, voiceRob: -9.5, voiceKez: -6, toastTick: 10.5, gaugeChime: 12, cardOpen: 2, cardClose: 4, alertThud: 5 }; /* v37: the last five lifted so the quietest feedback cue sits within 12 dB of the click (docs/AUDIO.md) */
  function playS(name, t, o) {
    var db = TRIM[name];
    if (!db) { S[name](t, o); return; }
    var real = sfxBus, tg = ctx.createGain();
    tg.gain.value = Math.pow(10, db / 20); tg.connect(real); sfxBus = tg;
    try { S[name](t, o); } finally { sfxBus = real; }
  }

  /* ---------- music ---------- */
  // bar chords (midi roots + triad), A minor / C major feel
  var PROG = [
    [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [55, 59, 62], [48, 52, 55]],
    [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [53, 57, 60], [48, 52, 55]]
  ];
  var M = { cur: 'grow', bus: null, timer: null, on: false, next: 0, step: 0, bar: 0, phrase: 0, motif: [], eighth: 60 / 90 / 2, stopTO: null, stage: 0 };
  function makeMotif(ph) {
    var r = rng(1000 + (ph % 4) * 37 + Math.floor(ph / 4) * 5), m = [], pos = 7 + Math.floor(r() * 3);
    for (var b = 0; b < 8; b++) { var bar = []; for (var s = 0; s < 8; s++) { if (s % 2 === 0 && r() < 0.62 || r() < 0.18) { pos += Math.floor(r() * 5) - 2; pos = Math.max(5, Math.min(14, pos)); bar.push(pos); } else bar.push(null); } if (b === 7) { bar[0] = 10; bar[2] = null; bar[4] = 7; for (var k = 5; k < 8; k++) bar[k] = null; } m.push(bar); }
    return m;
  }
  function growStep(t) {
    var musGate = M.bus;
    var s = M.step, b = M.bar, chord = PROG[Math.floor(M.phrase / 2) % 2][b], bt = M.eighth * 8;
    if (s === 0) {
      chord.forEach(function (m, i) {
        var o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m); o.detune.value = i * 3 - 3;
        f.type = 'lowpass'; f.frequency.value = 900;
        g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.5); g.gain.setValueAtTime(0.06, t + bt - 0.6); g.gain.linearRampToValueAtTime(0.0001, t + bt + 0.15);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(musGate); o.start(t); o2.start(t); o.stop(t + bt + 0.2); o2.stop(t + bt + 0.2);
      });
      marimba(t, mtof(chord[0] - 12), 0.14, musGate);
    }
    if (s === 4) marimba(t, mtof(chord[0] - 12) * (b % 2 ? 1.5 : 1), 0.07, musGate);
    var n = M.motif[b][s];
    if (n != null) {
      var sw = (M.phrase % 4 === 3 && s % 2) ? 0.02 : 0, deg = pent(60, n - 5);
      if (M.phrase % 4 === 2 && b % 4 === 3) deg += 12 * (s === 6 ? 1 : 0);
      marimba(t + sw, mtof(deg), 0.15 + (s === 0 ? 0.04 : 0), musGate);
      if (M.phrase % 4 === 1 && s % 4 === 0) tone({ t: t + 0.14, f: mtof(deg + 12), dur: 0.5, vol: 0.04, bus: musGate });
    }
    // growth-stage layer: stage>=2 quiet shaker/hat, stage>=3 bass pluck on beats 1 and 3
    if (M.stage >= 2) { noise({ t: t, dur: 0.05, ft: 'bandpass', f: 6500, q: 1.2, vol: s % 2 ? 0.026 : 0.014, bus: musGate }); if (s === 3 || s === 7) noise({ t: t + M.eighth * 0.5, dur: 0.035, ft: 'highpass', f: 8000, vol: 0.02, bus: musGate }); }
    if (M.stage >= 3 && (s === 0 || s === 4)) pluck(t, mtof(chord[s ? 2 : 0] - 12), 0.11, musGate, 0.45);
    // brushed percussion
    if (s === 2 || s === 6) noise({ t: t, dur: 0.16, ft: 'bandpass', f: 4500, q: 0.6, vol: 0.05, a: 0.03, bus: musGate });
    if (s % 2 === 1) noise({ t: t, dur: 0.04, ft: 'highpass', f: 7000, vol: 0.018, bus: musGate });
    if (s === 0 || s === 4) tone({ t: t, f: 110, f2: 55, dur: 0.18, vol: 0.12, a: 0.003, bus: musGate });
    M.step++;
    if (M.step >= 8) { M.step = 0; M.bar++; if (M.bar >= 8) { M.bar = 0; M.phrase++; M.motif = makeMotif(M.phrase); } }
  }
  // --- extra tracks: 8 eighth-steps per bar, 8-bar loop, fully deterministic (seamless) ---
  function mel(ph, b, s, salt) { var r = rng(salt + ph * 31 + b * 7 + s * 3); return [r(), r()]; }
  var SHOP = [[48, 52, 55], [45, 48, 52], [53, 57, 60], [43, 47, 50], [48, 52, 55], [52, 55, 59], [53, 57, 60], [43, 47, 50]];
  // seeded phrase motif (like makeMotif): deterministic per (track, phrase%4) so loops are seamless but bars/phrases differ
  var TM = {};
  function tmotif(key, ph, salt, lo, hi, de, dodd) {
    var ck = key + (ph % 4); if (TM[ck]) return TM[ck];
    var r = rng(salt + (ph % 4) * 37), pos = lo + Math.floor(r() * (hi - lo + 1)), m = [];
    for (var b = 0; b < 8; b++) { var bar = []; for (var s = 0; s < 8; s++) { if (r() < (s % 2 ? dodd : de)) { pos += Math.floor(r() * 5) - 2; pos = Math.max(lo, Math.min(hi, pos)); bar.push(pos); } else bar.push(null); } if (b === 7) for (var k = 4; k < 8; k++) bar[k] = null; m.push(bar); }
    return (TM[ck] = m);
  }
  function layerFade(ph, b) { return ph < 1 ? 0 : ph === 1 ? (b + 1) / 8 : 1; } // second layer: silent in phrase 1, ramps through phrase 2, full after
  function shopStep(t, s, b, ph) {
    var bus = M.bus, ch = SHOP[b], up = [0, 3, 4, 6];
    var si = up.indexOf(s);
    if (si >= 0) ch.forEach(function (m, i) { pluck(t + i * 0.012 * (s === 6 ? -1 : 1) + 0.03, mtof(m + 12 + (i === 2 && s === 4 ? 0 : 0)), 0.07, bus, 0.35); });
    if (s === 0 || s === 4) pluck(t, mtof(ch[0] - 12 + (s === 4 ? 7 : 0)), 0.1, bus, 0.45);
    var mv = tmotif('shop', ph, 500, 0, 7, 0.6, 0.12)[b][s];
    if (mv != null) { var n = pent(72, mv - 1); pluck(t, mtof(n), 0.13, bus, 0.5); if (s === 0 && b % 4 === 3) bell(t, mtof(n + 12), 0.04, bus); }
    // bell counter-melody on the off-beats, fades in across phrase 2 and stays
    var fade = layerFade(ph, b), cv = fade > 0 ? tmotif('shopC', ph, 8100, 0, 7, 0.0, 0.4)[b][s] : null;
    if (cv != null) bell(t + 0.02, mtof(pent(79, cv)), 0.04 * fade, bus);
    if (s % 2 === 1) noise({ t: t, dur: 0.05, ft: 'highpass', f: 8000, vol: 0.03, bus: bus });   // shaker
    if (s === 2 || s === 6) tone({ t: t, f: 900, f2: 700, dur: 0.03, vol: 0.05, type: 'square', lp: 2500, bus: bus }); // rim tick
  }
  var NIGHT = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 69], [57, 60, 64, 71], [50, 57, 60, 65], [52, 56, 59, 62], [57, 60, 64, 67]];
  function nightStep(t, s, b, ph) {
    var bus = M.bus, ch = NIGHT[b], bt = M.eighth * 8;
    if (s === 0) {
      ch.forEach(function (m, i) {
        [['sine', 0], ['triangle', 6]].forEach(function (w) {
          var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          o.type = w[0]; o.frequency.value = mtof(m - 12 * (i === 0 ? 1 : 0)); o.detune.value = w[1] * (i % 2 ? 1 : -1);
          f.type = 'lowpass'; f.frequency.value = 700;
          g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + bt * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + bt + 0.6);
          o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + bt + 0.7);
        });
      });
      tone({ t: t, f: 55, dur: 1.2, vol: 0.09, a: 0.2, bus: bus });
    }
    var nv = tmotif('night', ph, 900, 0, 5, 0.17, 0.08)[b][s];
    if (nv != null && s !== 7) { var n = pent(76, nv); bell(t, mtof(n), 0.05, bus); tone({ t: t + 0.25, f: mtof(n), dur: 1.2, vol: 0.015, bus: bus }); }
    // soft upper pad, slow attack, fades in from phrase 2
    var fade = layerFade(ph, b);
    if (s === 0 && fade > 0) ch.slice(1).forEach(function (m, i) {
      [['sine', -7], ['triangle', 7]].forEach(function (w) {
        var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = w[0]; o.frequency.value = mtof(m + 12); o.detune.value = w[1] + i * 2;
        f.type = 'lowpass'; f.frequency.value = 1100;
        g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.016 * fade, t + bt * 0.55); g.gain.linearRampToValueAtTime(0.0001, t + bt + 1.2);
        o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + bt + 1.3);
      });
    });
  }
  var CEL = [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [53, 57, 60], [55, 59, 62]];
  function celStep(t, s, b, ph) {
    var bus = M.bus, ch = CEL[b];
    var arp = ch[[0, 1, 2, 1, 2, 1, 2, 1][s] % 3];
    tone({ t: t, f: mtof(arp + 24), dur: 0.16, vol: 0.06, type: 'square', lp: 2600, a: 0.003, bus: bus });
    if (s === 0 || s === 3 || s === 6) tone({ t: t, f: mtof(ch[0] - 12), f2: mtof(ch[0] - 12) * 0.98, dur: 0.22, vol: 0.11, type: 'triangle', lp: 800, bus: bus });
    var m = mel(ph % 2, b, s, 1700);
    if (s % 2 === 0 && m[0] < 0.75) { var n = pent(72, Math.floor(m[1] * 8) - 1 + (b >= 4 ? 2 : 0)); marimba(t, mtof(n), 0.13, bus); if (s === 0) bell(t, mtof(n + 12), 0.05, bus); }
    if (s === 0 || s === 4) { tone({ t: t, f: 140, f2: 48, dur: 0.16, vol: 0.07, a: 0.002, bus: bus }); }
    if (s === 2 || s === 6) { noise({ t: t, dur: 0.12, ft: 'bandpass', f: 2200, q: 0.8, vol: 0.09, bus: bus }); tone({ t: t, f: 220, f2: 160, dur: 0.07, vol: 0.06, type: 'triangle', bus: bus }); }
    noise({ t: t, dur: 0.03, ft: 'highpass', f: 8500, vol: s % 2 ? 0.035 : 0.02, bus: bus });
    if (b === 7 && s === 7) { for (var k = 0; k < 2; k++) noise({ t: t + k * 0.1, dur: 0.05, ft: 'highpass', f: 6000, vol: 0.05, bus: bus }); }
  }
  var TRACKS = {
    grow: { bpm: 90, step: function (t) { growStep(t); } },
    shop: { bpm: 100, step: shopStep },
    night: { bpm: 56, step: nightStep },
    celebrate: { bpm: 124, step: celStep }
  };
  TRACKS.market = TRACKS.celebrate;
  var trkGain = {};
  function trackKey(n) { n = TRACKS[n] ? n : 'grow'; return n === 'market' ? 'celebrate' : n; }
  var MTRIM = { grow: 1.2, shop: 4.2, night: 2.5, celebrate: 3.3 };
  function trackGain(n) { if (!trkGain[n]) { var g = ctx.createGain(), tr = ctx.createGain(); g.gain.value = 0; tr.gain.value = MTRIM[n] || 1; g.connect(tr); tr.connect(musGate); trkGain[n] = g; } return trkGain[n]; }
  function setCur(n, t0) {
    var t = t0 == null ? ctx.currentTime : t0;
    Object.keys(trkGain).forEach(function (k) { if (k !== n) { var g = trkGain[k].gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 1.5); } });
    var ng = trackGain(n).gain; ng.cancelScheduledValues(t); ng.setValueAtTime(ng.value, t); ng.linearRampToValueAtTime(1, t + 1.5);
    M.cur = n; M.bus = trackGain(n); M.eighth = 60 / TRACKS[n].bpm / 2; M.step = 0; M.bar = 0; M.phrase = 0; M.motif = n === 'grow' ? makeMotif(M.phrase) : [];
    M.next = t + 0.1;
  }
  function tick() {
    if (!ctx || !M.on) return;
    if (M.next < ctx.currentTime) M.next = ctx.currentTime + 0.05;
    while (M.next < ctx.currentTime + 0.3) {
      var s = M.step, b = M.bar, ph = M.phrase;
      if (M.cur === 'grow') growStep(M.next); else { TRACKS[M.cur].step(M.next, s, b, ph); M.step++; if (M.step >= 8) { M.step = 0; M.bar++; if (M.bar >= 8) { M.bar = 0; M.phrase++; } } }
      M.next += M.eighth;
    }
  }
  function startMusic(name) {
    name = trackKey(name || wantTrack);
    if (!ctx) return;
    if (M.on) { musGate.gain.setTargetAtTime(1, ctx.currentTime, 0.5); if (name !== M.cur) setCur(name); return; }
    clearTimeout(M.stopTO); M.on = true;
    musGate.gain.cancelScheduledValues(ctx.currentTime); musGate.gain.setValueAtTime(musGate.gain.value, ctx.currentTime); musGate.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    Object.keys(trkGain).forEach(function (k) { trkGain[k].gain.cancelScheduledValues(ctx.currentTime); trkGain[k].gain.setValueAtTime(0, ctx.currentTime); });
    setCur(name);
    M.timer = setInterval(tick, 60); tick();
  }
  function stopMusic() {
    if (!ctx || !M.on) return;
    musGate.gain.cancelScheduledValues(ctx.currentTime); musGate.gain.setValueAtTime(musGate.gain.value, ctx.currentTime); musGate.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
    clearInterval(M.timer); M.timer = null; M.on = false;
  }

  /* ---------- ambience ---------- */
  var A = { name: null, nodes: [], gain: null, timer: null };
  function stopAmb(hard) {
    if (!A.name) return; var old = A, g = A.gain, nodes = A.nodes;
    clearTimeout(A.timer); clearTimeout(A.sTimer); A = { name: null, nodes: [], gain: null, timer: null };
    if (hard) { nodes.forEach(function (n) { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }); try { if (g) g.disconnect(); } catch (e) {} return; } /* v37: mute stops the nodes now */
    if (ctx && g) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
      setTimeout(function () { nodes.forEach(function (n) { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }); try { g.disconnect(); } catch (e) {} }, 1200); }
  }
  function startAmb(name) {
    if (!ctx) return; name = resolveAmb(name); if (A.name === name) return; stopAmb();
    if (name === 'out') return startOut();
    if (name !== 'tent' && name !== 'shop' && name !== 'night') return;
    var g = ctx.createGain(), t = ctx.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 1.5); g.connect(ambBus);
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; f.type = 'lowpass'; f.frequency.value = name === 'tent' ? 1100 : name === 'shop' ? 650 : 900; ng.gain.value = name === 'tent' ? 0.14 : name === 'shop' ? 0.19 : 0.17; src.connect(f); f.connect(ng); ng.connect(g); src.start();
    var h = ctx.createOscillator(), hg = ctx.createGain(); h.type = 'sine'; h.frequency.value = name === 'tent' ? 62 : name === 'shop' ? 50 : 48; hg.gain.value = name === 'tent' ? 0.025 : name === 'shop' ? 0.02 : 0.026; h.connect(hg); hg.connect(g); h.start();
    var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.35; lg.gain.value = name === 'tent' ? 250 : 150; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    A = { name: name, nodes: [src, h, lfo], gain: g, timer: null, sTimer: null, hum: hg, hum0: hg.gain.value, lp: f, lp0: f.frequency.value, mist: null };
    if (name === 'tent') {   // mist hiss layer (off until Sfx.ambienceParam('mist', 1))
      var ms = ctx.createBufferSource(), mf = ctx.createBiquadFilter(), mg = ctx.createGain();
      ms.buffer = noiseBuf; ms.loop = true; mf.type = 'bandpass'; mf.frequency.value = 6500; mf.Q.value = 0.5; mg.gain.value = 0; ms.connect(mf); mf.connect(mg); mg.connect(g); ms.start(0, Math.random());
      A.nodes.push(ms); A.mist = mg;
    }
    applyAmbParams(true);
    var ev = AMBEV[name], gap = AMBGAP[name];
    (function loop() { var me = A; me.timer = setTimeout(function () { if (A !== me || !ctx) return; ev(ctx.currentTime, g); loop(); }, rr(gap[0], gap[1])); })();
    if (name === 'tent') (function sloop() { var me = A; me.sTimer = setTimeout(function () { if (A !== me || !ctx) return; var se = SEASON[AP.season]; if (se) se(ctx.currentTime + 0.05, g); sloop(); }, seasonGap(AP.season)); })();
  }
  /* ---- v37: outdoor ambience (veranda / garden): birds by day, crickets by night, a light breeze, rain when the rain reading is above 0, gusts above 25 km/h. No fan hum, no pump. ---- */
  function gameS() { try { var g = window.__game; return g && g.S ? g.S : null; } catch (e) { return null; } }
  /* pure: what the ambience should be for a game state S (or the live one). Exposed as Sfx.ambienceFor */
  function ambienceFor(S) {
    S = S || gameS(); var m = S && S.method, where = (m && m.where) || 'tent', out = where === 'veranda' || where === 'outdoors';
    var r = null; try { if (S && window.Sim && window.Sim.readings) r = window.Sim.readings(S); } catch (e) {}
    var lit = r && r.lightsOn != null ? !!r.lightsOn : S && S.lit != null ? !!S.lit : true;
    if (!out) return { name: 'tent', where: where, out: false, fan: true, pump: true, day: lit, birds: false, crickets: false, breeze: false, rain: 0, wind: 0, gusts: false };
    var rain = r && typeof r.rain === 'number' ? r.rain : 0, wind = r && typeof r.wind === 'number' ? r.wind : (S && +S.windNow) || 0;
    var cur = S && S.rainLog && S.rainLog.length ? +S.rainLog[S.rainLog.length - 1] || 0 : 0;
    return { name: 'out', where: where, out: true, fan: false, pump: false, day: lit, birds: lit, crickets: !lit, breeze: true,
      rain: rain > 0 ? Math.max(0.3, Math.min(1, cur / 4 || 0.3)) : 0, wind: wind, gusts: wind > 25 };
  }
  var noResolve = false;
  function resolveAmb(name) { if (!noResolve && (name === 'tent' || name === 'night')) { var a = ambienceFor(); if (a.out) return 'out'; } return name; }
  function startOut() {
    var g = ctx.createGain(), t = ctx.currentTime, nodes = [];
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 1.5); g.connect(ambBus);
    function bed(type, f, q, gain, off) { var src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), gn = ctx.createGain(); src.buffer = noiseBuf; src.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; gn.gain.value = gain; src.connect(fl); fl.connect(gn); gn.connect(g); src.start(0, off); nodes.push(src); return { f: fl, g: gn }; }
    var br = bed('lowpass', 520, 0.7, 0.1, 0.3), rn = bed('bandpass', 5200, 0.45, 0, 0.9), rl = bed('lowpass', 1400, 0.6, 0, 1.3), wd = bed('bandpass', 380, 0.8, 0, 0.6);
    var l1 = ctx.createOscillator(), l1g = ctx.createGain(); l1.frequency.value = 0.12; l1g.gain.value = 180; l1.connect(l1g); l1g.connect(br.f.frequency); l1.start(); nodes.push(l1);
    var l2 = ctx.createOscillator(), l2g = ctx.createGain(); l2.frequency.value = 0.23; l2g.gain.value = 0; l2.connect(l2g); l2g.connect(wd.g.gain); l2.start(); nodes.push(l2);
    A = { name: 'out', nodes: nodes, gain: g, timer: null, sTimer: null, hum: null, hum0: 0, lp: br.f, lp0: 520, mist: null, rainG: rn.g, rainG2: rl.g, windG: wd.g, gustD: l2g, day: true, wx: { rain: 0, wind: 0 } };
    applyWeather(true);
    (function loop() { var me = A; me.timer = setTimeout(function () { if (A !== me || !ctx) return; AMBEV.out(ctx.currentTime, g); loop(); }, me.day ? rr(2500, 7000) : rr(350, 1400)); })();
  }
  function applyWeather(now) {
    if (!ctx || A.name !== 'out') return; var a = ambienceFor(), t = ctx.currentTime, k = now ? 0.001 : 0.8;
    A.day = !!a.day; A.wx = { rain: a.rain, wind: a.wind };
    A.rainG.gain.setTargetAtTime(a.rain > 0 ? 0.02 + 0.035 * a.rain : 0, t, k); A.rainG2.gain.setTargetAtTime(a.rain > 0 ? 0.03 + 0.035 * a.rain : 0, t, k);
    var wb = a.gusts ? Math.min(0.2, 0.05 + (a.wind - 25) * 0.004) : 0; A.windG.gain.setTargetAtTime(wb, t, k); A.gustD.gain.setTargetAtTime(wb * 0.8, t, k);
  }
  function setWeather(o) { /* offline measurement: force day/night, rain 0..1, wind km/h */
    if (A.name !== 'out') return; var t = ctx.currentTime; A.day = o.night ? false : true;
    A.rainG.gain.setValueAtTime(o.rain > 0 ? 0.02 + 0.035 * o.rain : 0, t); A.rainG2.gain.setValueAtTime(o.rain > 0 ? 0.03 + 0.035 * o.rain : 0, t);
    var wb = o.wind > 25 ? Math.min(0.2, 0.05 + (o.wind - 25) * 0.004) : 0; A.windG.gain.setValueAtTime(wb, t); A.gustD.gain.setValueAtTime(wb * 0.8, t);
  }
  /* service timer (only while unmuted): ducks ambience and music 8 dB while a voice clip plays; refreshes outdoor weather every 3 s */
  function service(start) {
    if (start) { if (svcT || !ctx || st.muted) return; svcN = 0; svcT = setInterval(function () { service(false); }, 250); return; }
    if (!ctx || st.muted) { clearInterval(svcT); svcT = null; return; }
    var want = 1; try { if (window.Voice && window.Voice.playing && window.Voice.playing()) want = Math.pow(10, DUCK_DB / 20); } catch (e) {}
    if (want !== duck) { duck = want; applyVol(); }
    if (++svcN % 12 === 0) applyWeather(false);
  }
  /* mute: stop everything that generates sound (music scheduler, ambience nodes, the context itself) so a muted game costs nothing */
  function silence() {
    clearInterval(svcT); svcT = null; clearInterval(M.timer); M.timer = null; M.on = false; clearTimeout(M.stopTO);
    stopAmb(true); stopVoice();
    var c = ctx; ctx = null; trkGain = {}; VC = null; duck = 1;
    try { if (c && c.close) c.close(); } catch (e) {}
  }
  // reactive ambience params (persist across ambience restarts): fan 0..1, mist 0|1, season
  var AP = { fan: 1, mist: 0, season: null };
  function applyAmbParams(now) {
    if (!ctx || A.name !== 'tent') return; var t = ctx.currentTime, k = now ? 0.001 : 0.25;
    A.hum.gain.setTargetAtTime(A.hum0 * AP.fan, t, k); A.lp.frequency.setTargetAtTime(A.lp0 * (0.55 + 0.45 * AP.fan), t, k);
    if (A.mist) A.mist.gain.setTargetAtTime(AP.mist ? 0.02 : 0, t, now ? 0.001 : 0.6);
  }
  function seasonMean(s) { return s === 'summer' ? 6 : s === 'winter' ? 30 : 10; }
  function seasonGap(s) { return s === 'summer' ? rr(3500, 9000) : s === 'winter' ? rr(20000, 40000) : s === 'spring' || s === 'autumn' ? rr(6000, 14000) : 5000; }
  var SEASON = {
    summer: function (t, g) {   // cicada-like: high carrier, fast tremolo, 0.5-1.1 s
      var d = rr(0.5, 1.1), f = rr(4300, 5400), o = ctx.createOscillator(), am = ctx.createOscillator(), ag = ctx.createGain(), dg = ctx.createGain(), bp = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; am.frequency.value = rr(38, 58); dg.gain.value = 0.5;
      ag.gain.value = 0; ag.gain.setValueAtTime(0.0001, t); ag.gain.linearRampToValueAtTime(0.5, t + 0.12); ag.gain.setValueAtTime(0.5, t + d - 0.2); ag.gain.linearRampToValueAtTime(0.0001, t + d);
      var tr = ctx.createGain(); tr.gain.value = 0.5; am.connect(dg); dg.connect(tr.gain); o.connect(bp); bp.connect(tr); tr.connect(ag); var vg = ctx.createGain(); vg.gain.value = 0.014; ag.connect(vg); vg.connect(g);
      o.start(t); am.start(t); o.stop(t + d + 0.05); am.stop(t + d + 0.05);
    },
    winter: function (t, g) { noise({ t: t, dur: 3, ft: 'bandpass', f: 260, f2: 620, q: 0.9, vol: 0.06, a: 1.1, bus: g }); noise({ t: t + 0.4, dur: 2.2, ft: 'bandpass', f: 900, f2: 450, q: 1.4, vol: 0.02, a: 0.9, bus: g }); },
    spring: function (t, g) { chirp(t, 2 + Math.floor(Math.random() * 3), 2.1, rng(Math.floor(Math.random() * 1e9)), 0.11, g, 0.3); },
    autumn: function (t, g) { chirp(t, 2 + Math.floor(Math.random() * 3), 1.7, rng(Math.floor(Math.random() * 1e9)), 0.13, g, 0.3); }
  };
  var AMBGAP = { shop: [7000, 16000], night: [350, 1400], tent: [1500, 4500], out: [2500, 7000] };
  var AMBEV = {
    shop: function (t0, g) { var f0 = mtof(pent(84, Math.floor(rr(0, 5)))); bell(t0, f0, 0.03, g); if (Math.random() < 0.5) bell(t0 + 0.2, f0 * 1.335, 0.025, g); },
    night: function (t0, g) { var n = 2 + Math.floor(Math.random() * 3), base = rr(4000, 4600); for (var i = 0; i < n; i++) tone({ t: t0 + i * 0.07, f: base, f2: base * 1.03, dur: 0.045, vol: 0.012, a: 0.01, bus: g }); },
    tent: function (t0, g) { var n = 2 + Math.floor(Math.random() * 3); for (var i = 0; i < n; i++) { var f0 = rr(350, 900), bt = t0 + i * rr(0.05, 0.12); tone({ t: bt, f: f0, f2: f0 * 1.8, dur: 0.07, vol: 0.05, bus: g }); } },
    out: function (t0, g) { if (A.day) chirp(t0, 2 + Math.floor(Math.random() * 3), 1.5 + Math.random() * 0.8, rng(Math.floor(Math.random() * 1e9)), 0.11, g, 0.45); else AMBEV.night(t0, g); }
  };

  /* ---------- public ---------- */
  function applyVol() { if (!ctx) return; var t = ctx.currentTime; sfxBus.gain.setTargetAtTime(st.sfx, t, 0.03); ambBus.gain.setTargetAtTime(st.sfx * duck, t, 0.12); musBus.gain.setTargetAtTime(st.music * duck, t, 0.12); master.gain.setTargetAtTime(st.muted ? 0 : vol, t, 0.03); } /* v37: master volume and the voice duck */
  window.Sfx = {
    init: init,
    play: function (name, opts) {
      try { if (!AC || !S[name]) return; if (!ctx && !init()) return; if (ctx.state === 'suspended') ctx.resume(); if (st.muted) return; opts = opts || {};
        var tc = touchFresh(); /* v37: context variants; the single-argument call keeps working */
        if (name === 'click' && !opts.kind) opts = Object.assign({}, opts, { kind: tc.kind });
        else if (name === 'pop' && tc.act === 'plant') name = 'seedPlant';
        else if (name === 'pour' && !opts.pitch && tc.act) { var pa = { mix: 0.85, feed: 1, water: 1.2, topUp: 0.95 }[tc.act]; if (pa) opts = Object.assign({}, opts, { pitch: pa }); if (tc.act === 'topUp') playS('waterDrop', ctx.currentTime + 0.35, { pitch: 0.9 }); if (tc.act === 'water') playS('sprinkle', ctx.currentTime + 0.05, {}); }
        else if ((name === 'fanOn') && !opts.pitch) { var gs = gameS(), lv = gs && gs.__fan; if (lv) opts = Object.assign({}, opts, { pitch: lv === 1 ? 0.8 : lv === 3 ? 1.25 : 1 }); }
        playS(name, ctx.currentTime + 0.01, opts); } catch (e) {}
    },
    setVolume: function (sfx, music) { if (sfx != null) st.sfx = clamp(sfx); if (music != null) st.music = clamp(music); save(); applyVol(); },
    mute: function (b) { st.muted = !!b; save(); savePref(); if (st.muted) silence(); else init(); applyVol(); }, /* v37: muting stops the music scheduler and every ambience node and closes the context; unmuting rebuilds and restarts what was wanted */
    volume: function (v) { /* v37: master 0..1, remembered in hygrow_volume_v1; no argument = read */
      if (arguments.length && v != null && isFinite(+v)) { vol = clamp(v); if (!FORCE_MUTE) { try { localStorage.setItem(VOLKEY, String(vol)); } catch (e) {} } applyVol(); }
      return vol;
    },
    ambienceFor: ambienceFor,
    reserved: ['plantPop', 'quokka', 'warnTick', 'grow'], /* v37: authored, no call site; kept (see docs/AUDIO.md) */
    _state: function () { return { ctx: !!ctx, ctxState: ctx && ctx.state, musicTimer: !!M.timer, musicOn: !!M.on, amb: A.name, ambNodes: A.nodes.length, service: !!svcT, duck: duck, vol: vol, muted: st.muted }; },
    _touch: function (t) { TOUCH = { kind: t.kind || 'ui', act: t.act || null, at: Date.now() }; },
    /* new cues go through here: mute is checked first (no context, no limiter tick), then an optional rate limit { key, ms } */
    cue: function (name, opts, limit) {
      try {
        if (st.muted || !S[name]) return false;
        if (limit && limit.key != null) { var now = clock(); if (lastCue[limit.key] != null && now - lastCue[limit.key] < (limit.ms || 0)) return false; lastCue[limit.key] = now; }
        window.Sfx.play(name, opts); return true;
      } catch (e) { return false; }
    },
    initialMuted: initialMuted,
    /* the stored choice ('on' | 'off' | null) and the first-visit chip: shown only while no choice exists, never under ?mute=1 */
    pref: function () { return chosen; },
    needsChip: function () { return !FORCE_MUTE && chosen === null && st.muted; },
    dismissChip: function () { if (chosen === null) savePref(); },
    _clock: function (fn) { clock = typeof fn === 'function' ? fn : function () { return Date.now(); }; lastCue = {}; },
    isMuted: function () { return st.muted; },
    musicOn: function (track) { return !!wantMusic && (!track || wantTrack === track); }, // is music wanted on (optionally on this track)?
    getVolume: function () { return { sfx: st.sfx, music: st.music, master: vol }; },
    music: function (on, name, opts) { try { if (opts && opts.stage != null) M.stage = Math.max(0, Math.min(3, +opts.stage || 0)); wantMusic = !!on; if (name) wantTrack = trackKey(name); if (!AC) return; if (!ctx) { init(); return; } if (on) startMusic(wantTrack); else stopMusic(); } catch (e) {} },
    tracks: ['grow', 'shop', 'night', 'celebrate', 'market'],
    ambience: function (name) { try { wantAmb = name || null; if (!AC) return; if (!ctx) { init(); return; } if (name) startAmb(name); else stopAmb(); } catch (e) {} },
    // reactive ambience: ambienceParam('fan', 0..1) | ('mist', 0|1) | ('season', 'summer'|'autumn'|'winter'|'spring'); stored even before audio starts
    ambienceParam: function (k, v) {
      try { if (k === 'fan') AP.fan = clamp(v); else if (k === 'mist') AP.mist = v ? 1 : 0; else if (k === 'season') AP.season = SEASON[v] ? v : null; else return; applyAmbParams(false); } catch (e) {}
    },
    stopVoice: stopVoice,
    _amb: function () { return A.name ? { name: A.name, hum: A.hum ? A.hum.gain.value : null, humBase: A.hum0, lp: A.lp && A.lp.frequency.value, mist: A.mist ? A.mist.gain.value : null, birds: A.name === 'out' ? !!A.day : null, crickets: A.name === 'out' ? !A.day : null, rain: A.wx ? A.wx.rain : null, wind: A.wx ? A.wx.wind : null, ap: Object.assign({}, AP) } : null; },
    names: Object.keys(S),
    // offline measurement hook: Sfx._render(kind, name, seconds[, name2]) -> Promise<Float32Array> (mono, post-limiter)
    _render: function (kind, name, secs, name2, opts) {
      opts = opts || {};
      var sr = 48000, oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.ceil(sr * secs), sr);
      var sv = { vol: vol, duck: duck, ctx: ctx, master: master, comp: comp, sfxBus: sfxBus, musBus: musBus, musGate: musGate, ambBus: ambBus, noiseBuf: noiseBuf, A: A, M: M, trk: trkGain, st: st, VC: VC, AP: AP };
      try {
        st = { sfx: 0.8, music: 0.5, muted: false }; trkGain = {}; A = { name: null, nodes: [], gain: null, timer: null };
        M = { cur: 'grow', bus: null, timer: null, on: true, next: 0, step: 0, bar: 0, phrase: 0, motif: [], eighth: 0.3, stopTO: null, stage: opts.stage || 0 };
        vol = 1; duck = 1; noResolve = true; VC = null; if (opts.ap) AP = Object.assign({ fan: 1, mist: 0, season: null }, opts.ap);
        build(oc);
        if (kind === 'sfx') playS(name, 0.05, opts.sfx || {});
        else if (kind === 'music') {
          musGate.gain.value = 1; var t, sw = name2 ? secs / 2 : 1e9;
          name = trackKey(name); setCur(name, 0); M.next = 0.1;
          for (t = 0; M.next < secs; ) {
            if (name2 && M.next >= sw) { name = trackKey(name2); setCur(name, sw); M.next = sw; name2 = null; }
            var s0 = M.step, b0 = M.bar, p0 = M.phrase;
            if (M.cur === 'grow') growStep(M.next); else { TRACKS[M.cur].step(M.next, s0, b0, p0); M.step++; if (M.step >= 8) { M.step = 0; M.bar++; if (M.bar >= 8) { M.bar = 0; M.phrase++; } } }
            M.next += M.eighth;
          }
        } else if (kind === 'amb') {
          if (name === 'out') { startOut(); if (opts.wx) setWeather(opts.wx); else A.day = true; }
          else startAmb(name);
          clearTimeout(A.timer); clearTimeout(A.sTimer);
          if (name === 'tent' && SEASON[AP.season]) for (var se = 2; se < secs; se += seasonMean(AP.season)) SEASON[AP.season](se, A.gain);
          for (var e = 1.5; e < secs; e += (AMBGAP[name][0] + AMBGAP[name][1]) / 2000) AMBEV[name](e, A.gain);
        }
        return oc.startRendering().then(function (b) { return b.getChannelData(0); });
      } finally {
        noResolve = false; vol = sv.vol; duck = sv.duck; ctx = sv.ctx; master = sv.master; comp = sv.comp; sfxBus = sv.sfxBus; musBus = sv.musBus; musGate = sv.musGate; ambBus = sv.ambBus; noiseBuf = sv.noiseBuf; A = sv.A; M = sv.M; trkGain = sv.trk; st = sv.st; VC = sv.VC; AP = sv.AP;
      }
    }
  };
})();
