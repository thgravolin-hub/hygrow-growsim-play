/* HyGrow Grow Sim - rig.js : layered 2D puppet rig driven in code (Axel first, then the Deb / Rob / Kez portraits). Global: window.Rig.
   The painted sprite is cut into parts (art/tools/rig_cut.py -> art/axel/rig/rig.json, art/portraits/rig/<who>.json); this file stacks them as SVG <image>s in a
   <g> hierarchy and animates them with transform attributes only (no layout reads inside update()).

   Rig.mount(svg, name, rigJson, opts) -> controller
     opts: { host (element to append into, default svg), unit (panel units per sprite px, default rigJson.unit), ax, ay (panel position of the sprite's bottom-centre, default 100, 250), minX, maxX (walk bounds, panel x of the
             centre), fill (true = the svg viewBox IS the sprite: no placement, no walking; used for the cast portraits), reduced() -> bool, noSwim, seed }
   controller:
     update(t)             per frame (t in ms, performance.now clock). Idle breathing, gill sway, blink every 4-7 s (120 ms), micro head drift, gestures, look, walk/swim.
     mouth(level)          0 closed / 1 half / 2 open / 3 wide (3 also drops the jaw a little). mouthLevel() reads it back.
     lookAt(x, y)          panel coordinates (the svg user space). Pupils move (clamped) and the head turns up to 8 deg toward the point. lookAt(null) releases.
     gesture(kind, opts)   nod | emphasis | point | wave | thumbs | worried | happy | sad | shiver | fan | surprise | cheer. opts {ms} or {hold:true} (then release(kind)); point takes {dx, dy} or a number (-1 / 1).
     point(dir) / release(kind)   point(null) releases. walkTo(x, ms)   swim()   home(ms)   clientToPanel(cx, cy)   reduced()   state()   destroy()
   Pure helpers (also run under node, see tests/rig.test.js): mouthShape, clockLevel, energy, percentile, emphasisPeaks, lookVec, gestureAt, envelopeFor, GESTURES.
   Reduced motion (prefers-reduced-motion, or opts.reduced()) = no motion at all: the rig is drawn once in its rest pose, closed mouth, and update() does nothing. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', PI = Math.PI;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeInOut(k) { return k <= 0 ? 0 : k >= 1 ? 1 : 0.5 - 0.5 * Math.cos(PI * k); }
  function bump(k) { return k <= 0 || k >= 1 ? 0 : Math.sin(PI * k); }
  function env(k, a, b) { if (k <= 0 || k >= 1) return 0; if (k < a) return easeInOut(k / a); if (k > b) return easeInOut((1 - k) / (1 - b)); return 1; }

  /* ------------------------------------------------------------------ pure helpers */
  // 0 closed / 1 half / 2 open ; legacy two-state envelopes ('0'/'1' only) read '1' as open, like Voice.levelAt
  function levelNum(bits, i) {
    var c = bits.charCodeAt(i) - 48;
    if (c === 2) return 2;
    if (c === 1) return bits.indexOf('2') < 0 ? 2 : 1;
    return 0;
  }
  // level 0..2 + "hot" (envelope above its 80th percentile) -> mouth shape 0..3 (3 = wide)
  function mouthShape(level, hot) { level = level >= 2 ? 2 : level >= 1 ? 1 : 0; return level === 2 && hot ? 3 : level; }
  // talk clock when no envelope exists: Axel closed/half/open/half at 140 ms steps; cast closed/half/open/wide/open/half
  var CLOCK_AXEL = [0, 1, 2, 1], CLOCK_CAST = [0, 1, 2, 3, 2, 1];
  function clockLevel(tMs, cast, stepMs) { var s = Math.floor(Math.max(0, tMs) / (stepMs || 140)), a = cast ? CLOCK_CAST : CLOCK_AXEL; return a[s % a.length]; }
  // mean mouth level over a centred window of `win` frames
  function energy(bits, win) {
    var n = bits ? bits.length : 0, e = new Array(n), h = Math.floor((win || 6) / 2), i, j, s, c;
    for (i = 0; i < n; i++) { s = 0; c = 0; for (j = Math.max(0, i - h); j <= Math.min(n - 1, i + h); j++) { s += levelNum(bits, j); c++; } e[i] = s / c; }
    return e;
  }
  function percentile(arr, p) {
    if (!arr || !arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; }), k = clamp(p, 0, 1) * (a.length - 1), f = Math.floor(k), c = Math.min(a.length - 1, f + 1);
    return a[f] + (a[c] - a[f]) * (k - f);
  }
  // emphasis moments of a clip: local maxima of the smoothed envelope above its 80th percentile, at least minGapMs apart -> {times:[ms], p80, energy}
  function emphasisPeaks(bits, frameMs, o) {
    o = o || {}; frameMs = frameMs > 0 ? frameMs : 50;
    var e = energy(bits, o.win || 6), p80 = percentile(e, 0.8), gap = o.minGapMs || 1200, out = [], last = -1e9, i, t;
    for (i = 0; i < e.length; i++) {
      if (!(e[i] > 0) || e[i] < p80) continue;
      if ((i > 0 && e[i] < e[i - 1]) || (i < e.length - 1 && e[i] <= e[i + 1])) continue;
      t = i * frameMs;
      if (t - last >= gap) { out.push(t); last = t; }
    }
    return { times: out, p80: p80, energy: e };
  }
  // pupils + head turn toward a vector (sprite px from the eyes). All outputs are clamped by `max`.
  function lookVec(vx, vy, max) {
    max = max || { px: 6, py: 4.5, hr: 8 };
    var nx = Math.tanh(vx / 160), ny = Math.tanh(vy / 160);
    return { px: nx * max.px, py: ny * max.py, hr: nx * max.hr };
  }

  /* gesture timelines: pose deltas as a pure function of elapsed ms. Additive keys: bodyTy bodySy bodyRot headRot headTy dip gillL gillR browUp.
     Max keys: armW (0 rest .. 1 raised), minMouth, wide. armRot (deg, absolute while armW>0) and hand ('point' | 'thumb') are set by the strongest gesture. dip = degrees of a forward nod. */
  var POSE_KEYS = ['bodyTy', 'bodySy', 'bodyRot', 'headRot', 'headTy', 'dip', 'gillL', 'gillR', 'browUp', 'armW', 'armRot', 'minMouth', 'wide', 'bodyTx', 'lidHalf', 'eyeWide', 'armL'];
  var GESTURES = {
    nod:      { dur: 300,  a: 0.3, b: 0.7, inMs: 120, outMs: 200 },
    emphasis: { dur: 700,  a: 0.22, b: 0.6, inMs: 160, outMs: 280 },
    point:    { dur: 4000, a: 0.08, b: 0.9, inMs: 260, outMs: 320 },
    wave:     { dur: 1800, a: 0.16, b: 0.8, inMs: 200, outMs: 300 },
    thumbs:   { dur: 1700, a: 0.16, b: 0.78, inMs: 200, outMs: 300 },
    worried:  { dur: 2200, a: 0.15, b: 0.75, inMs: 300, outMs: 450 },
    happy:    { dur: 800,  a: 0.05, b: 0.85, inMs: 100, outMs: 250 },
    sad:      { dur: 2400, a: 0.2, b: 0.72, inMs: 400, outMs: 500 },
    // world reactions (axel.js): cold night, hot afternoon, rain / a problem, first harvest / a goal
    shiver:   { dur: 1500, a: 0.12, b: 0.82, inMs: 160, outMs: 260 },
    fan:      { dur: 2600, a: 0.14, b: 0.84, inMs: 260, outMs: 380 },
    surprise: { dur: 800,  a: 0.14, b: 0.62, inMs: 110, outMs: 220 },
    cheer:    { dur: 1500, a: 0.08, b: 0.86, inMs: 140, outMs: 300 }
  };
  function gEnv(g, el, o) {
    if (o && o.hold) { var inn = easeInOut(el / g.inMs); if (o.rel == null) return inn; return Math.min(inn, 1 - easeInOut((el - o.rel) / g.outMs)); }
    return env(el / ((o && o.dur) || g.dur), g.a, g.b);
  }
  // accumulate gesture `kind` at `el` ms into `out` (an object with POSE_KEYS); returns the envelope 0..1
  function applyGesture(kind, el, o, out) {
    var g = GESTURES[kind]; if (!g || el < 0) return 0;
    var dur = (o && o.dur) || g.dur, e = gEnv(g, el, o), k = el / dur, s = el / 1000;
    if (!(e > 0)) return 0;
    switch (kind) {
      case 'nod': out.dip += 6 * bump(k); break;
      case 'emphasis':
        out.armW = Math.max(out.armW, e * 0.9); out.armRot = out.armW > 0 && out.armRot === 0 ? -42 : out.armRot;
        out.dip += 5 * bump(clamp((k - 0.05) / 0.6, 0, 1)); out.browUp += 1 * e; out.gillL += 4 * e; out.gillR += 4 * e; break;
      case 'point':
        out.armW = Math.max(out.armW, e); out.armRot = o && o.armRot != null ? o.armRot : -90; out.hand = 'point'; out.headRot += 0; out.bodyTy -= 1 * e; break;
      case 'wave':
        out.armW = Math.max(out.armW, e); out.armRot = -148 + 16 * Math.sin(2 * PI * 3.4 * s) * e; out.headRot += 3 * e; out.gillL += 5 * e; out.gillR += 5 * e; out.browUp += e; break;
      case 'thumbs':
        out.armW = Math.max(out.armW, e); out.armRot = -128; out.hand = 'thumb'; out.dip += 6 * bump(clamp((k - 0.4) / 0.25, 0, 1)); out.bodyTy -= 6 * bump(k); if (e > 0.3) out.wide = 1; break;
      case 'worried':
        out.headRot += -10 * e; out.headTy += 4 * e; out.gillL += -14 * e; out.gillR += -14 * e; out.bodySy += -0.04 * e; out.minMouth = Math.max(out.minMouth, e > 0.4 ? 1 : 0);
        out.bodyRot += 0.6 * Math.sin(s * 14) * e; out.browUp += 1 * e; break;
      case 'happy':
        out.bodyTy += -38 * Math.abs(Math.sin(2 * PI * k * 1.0)) * (1 - 0.35 * k) * (k < 1 ? 1 : 0);
        out.bodySy += (k % 0.5 < 0.06 ? -0.04 : 0) * e; if (e > 0.3) out.wide = 1; out.gillL += 7 * e; out.gillR += 7 * e; out.browUp += e; break;
      case 'sad':
        out.headRot += 6 * e; out.headTy += 7 * e; out.gillL += -20 * e; out.gillR += -20 * e; out.bodySy += -0.03 * e; break;
      case 'shiver':   // tight shoulders, gills pressed down, squinting, a quick small tremor
        out.bodySy += -0.05 * e; out.gillL += -18 * e; out.gillR += -18 * e; out.headTy += 3 * e; out.dip += 2 * e; out.lidHalf = Math.max(out.lidHalf, 0.22 * e);
        out.bodyTx += 2.4 * e * Math.sin(2 * PI * 13 * s); out.headRot += 1.4 * e * Math.sin(2 * PI * 17 * s + 1); out.bodyRot += 0.5 * e * Math.sin(2 * PI * 15 * s + 2); break;
      case 'fan':      // hand fanning the face, lid half down, drooping gills, panting
        out.armW = Math.max(out.armW, e); out.armRot = 152 + 16 * Math.sin(2 * PI * 4.5 * s) * e; out.hand = '';
        out.lidHalf = Math.max(out.lidHalf, 0.55 * e); out.gillL += -7 * e; out.gillR += -7 * e; out.headRot += -2 * e; out.headTy += 2 * e; out.bodySy += -0.015 * e;
        if (e > 0.4) out.minMouth = Math.max(out.minMouth, 1); break;
      case 'surprise': // eyes wide, both hands up, a small jump back
        out.eyeWide = Math.max(out.eyeWide, e); out.armW = Math.max(out.armW, 0.9 * e); out.armL = Math.max(out.armL, 0.9 * e); out.armRot = out.armRot === 0 ? -142 : out.armRot;
        out.bodyTy += -9 * e; out.dip += -3 * e; out.gillL += 11 * e; out.gillR += 11 * e; out.browUp += e; out.minMouth = Math.max(out.minMouth, e > 0.3 ? 2 : 0); break;
      case 'cheer':    // both hands up, three big bounces, wide mouth: bigger and longer than happy
        out.armW = Math.max(out.armW, e); out.armL = Math.max(out.armL, e); out.armRot = -152 + 9 * Math.sin(2 * PI * 4 * s) * e;
        out.bodyTy += -46 * Math.abs(Math.sin(2 * PI * k * 1.5)) * (1 - 0.3 * k) * (k < 1 ? 1 : 0); out.bodySy += (k * 3 % 1 < 0.05 ? -0.05 : 0) * e;
        out.headRot += 4 * Math.sin(2 * PI * k * 1.5) * e; out.gillL += 14 * e; out.gillR += 14 * e; out.browUp += e; if (e > 0.2) out.wide = 1; break;
    }
    return e;
  }
  function gestureAt(kind, el, o) {
    var out = {}; POSE_KEYS.forEach(function (k) { out[k] = 0; }); out.hand = '';
    out.env = applyGesture(kind, el, o || null, out); return out;
  }
  // per-clip emphasis / hot data from voice/mouth.json ({frame_ms, clips:{id:bits}})
  /* wide-mouth gate per clip: the energy value above which at most 20 % of ALL the clip's frames are open-level frames (ties at the p80 would let a flat, loud clip show wide far more often) */
  function hotThreshold(bits, e) {
    var n = bits ? bits.length : 0, a = [], i;
    for (i = 0; i < n; i++) if (levelNum(bits, i) === 2) a.push(e[i]);
    var k = Math.floor(n * 0.2);
    if (k <= 0) return Infinity;
    if (k >= a.length) return -1;
    a.sort(function (x, y) { return y - x; });
    return a[k];
  }
  var envCache = {};
  /* one voice-sync step, shared by axel.js, story.js and tests/rig-voice.test.js. d = persistent {id,lastT,cool,hot}; audioMs = the clip's currentTime in ms, or null when nothing
     plays (watchdog: shape 0 at once, state reset); level = Voice.mouthLevel() at that instant; ev = envelopeFor(). Returns {shape 0..3, emphasis:bool}.
     Wide (3) only when the level is 2 AND the smoothed envelope at this frame is at/above the clip's own p80; emphasis at most once per 1200 ms of nowMs. */
  function voiceStep(d, ev, id, audioMs, level, nowMs) {
    if (audioMs == null || !(audioMs >= 0)) { d.id = ''; d.lastT = -1; d.hot = false; return { shape: 0, emphasis: false }; }
    var hot = false, emph = false;
    if (ev) {
      var i = Math.floor(audioMs / ev.frameMs);
      hot = ev.hotThr != null ? ev.energy[i] > ev.hotThr : ev.p80 > 0 && ev.energy[i] >= ev.p80;
      if (d.id !== id) { d.id = id; d.lastT = -1; }
      var pk = null, j;
      for (j = 0; j < ev.peaks.length; j++) if (ev.peaks[j] > d.lastT && ev.peaks[j] <= audioMs) { pk = ev.peaks[j]; break; }
      if (pk != null) { d.lastT = audioMs; if (!(nowMs < d.cool)) { d.cool = nowMs + 1200; emph = true; } } else if (audioMs < d.lastT) d.lastT = audioMs;
    }
    d.hot = hot;
    return { shape: mouthShape(level, hot), emphasis: emph };
  }
  var lastCtl = null;
  function envelopeFor(mouthJson, id) {
    if (!mouthJson || !mouthJson.clips || !mouthJson.clips[id] || /^(deb|rob|regular|kez)_/.test(String(id))) return null; /* v37 M26: only Axel is voiced, so a cast id never has an envelope */
    var key = id + ':' + mouthJson.clips[id].length;
    if (!envCache[key]) { var b = mouthJson.clips[id], fm = mouthJson.frame_ms || 50, pk = emphasisPeaks(b, fm); envCache[key] = { bits: b, frameMs: fm, peaks: pk.times, p80: pk.p80, energy: pk.energy, hotThr: hotThreshold(b, pk.energy) }; }
    return envCache[key];
  }

  /* ------------------------------------------------------------------ DOM mount */
  function el(tag, attrs) { var n = document.createElementNS(NS, tag); if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function r2(v) { return Math.round(v * 100) / 100; }

  function mount(svg, name, J, opts) {
    opts = opts || {};
    var W = J.size[0], H = J.size[1], unit = opts.unit || J.unit || 1, fill = !!opts.fill;
    var ax = opts.ax != null ? opts.ax : 100, ay = opts.ay != null ? opts.ay : 250;
    var minX = opts.minX != null ? opts.minX : ax - 42, maxX = opts.maxX != null ? opts.maxX : ax + 42;
    var cast = J.kind === 'cast';
    var rootG = el('g', { 'data-rig': name });
    (opts.host || svg).appendChild(rootG);
    var P = J.parts, nodes = {}, groups = {}, order = Object.keys(P);
    var rootName = order.filter(function (k) { return !P[k].parent; })[0];
    // build the <g> hierarchy; inside a parent: children with z < 0, the part's own image, then the other children by z
    var cloneMode = false;
    function build(nm) {
      var p = P[nm], g = el('g', cloneMode ? { 'data-clone': nm } : { 'data-part': nm }), kids = order.filter(function (k) { return P[k].parent === nm; }).sort(function (a, b) { return (P[a].z || 0) - (P[b].z || 0); });
      var im = el('image', { x: p.x, y: p.y, width: p.w, height: p.h, preserveAspectRatio: 'none' });
      im.setAttribute('href', p.src); im.setAttribute('draggable', 'false');
      groups[nm] = g; nodes[nm] = im;
      kids.filter(function (k) { return (P[k].z || 0) < 0; }).forEach(function (k) { g.appendChild(build(k)); });
      g.appendChild(im);
      kids.filter(function (k) { return (P[k].z || 0) >= 0; }).forEach(function (k) { g.appendChild(build(k)); });
      return g;
    }
    rootG.appendChild(build(rootName));
    function G(n) { return groups[n] || null; }
    var gBody = G(rootName), gHead = G('head') || gBody, headIsBody = gHead === gBody;
    var gGL = G('gill_l'), gGR = G('gill_r'), gEL = G('eye_l'), gER = G('eye_r'), gPL = G('pupil_l'), gPR = G('pupil_r'), gLid = G('lid');
    var gArm = G('arm_r'), gHR = G('hand_rest'), gHP = G('hand_point'), gHT = G('hand_thumb'), gBL = G('brow_l'), gBR = G('brow_r');
    // second arm: arm_r's subtree built again under a mirrored wrapper (shoulder mirrored about the body pivot), shown only while a gesture raises it (surprise, cheer)
    var gArmL = null, gHRL = null;
    if (gArm && gBody && !fill) {
      var sv = { a: groups.arm_r, h: groups.hand_rest, ps: groups.hand_point, ht: groups.hand_thumb, na: nodes.arm_r };
      var wrapL = el('g', { 'data-extra': 'arm_l', display: 'none', transform: 'translate(' + (2 * P[rootName].pivot[0]) + ' 0) scale(-1 1)' });
      cloneMode = true; wrapL.appendChild(build('arm_r')); cloneMode = false; gArmL = groups.arm_r; gHRL = groups.hand_rest;
      if (groups.hand_point) groups.hand_point.setAttribute('display', 'none'); if (groups.hand_thumb) groups.hand_thumb.setAttribute('display', 'none');
      groups.arm_r = sv.a; groups.hand_rest = sv.h; groups.hand_point = sv.ps; groups.hand_thumb = sv.ht; nodes.arm_r = sv.na;
      gBody.appendChild(wrapL); gArmL.__wrap = wrapL;
    }
    var mouths = [G('mouth_closed'), G('mouth_half'), G('mouth_open'), G('mouth_wide')];
    var pv = function (n, i) { return P[n] ? P[n].pivot[i] : 0; };
    var bodyPv = P[rootName].pivot, headPv = P[(G('head') && 'head') || rootName].pivot;

    var eyeMidX = J.face ? (J.face.eye_l[0] + J.face.eye_r[0]) / 2 : W / 2, eyeMidY = J.face ? (J.face.eye_l[1] + J.face.eye_r[1]) / 2 : H * 0.2;
    var st = {
      t: 0, x: ax, away: false, pointing: false, hop: 0, fx: 1, fxT: 1, mouth: 0, mouthShown: -1, blinkAt: 0, blinkUntil: 0, lid: false, lookX: null, lookY: null, lk: { px: 0, py: 0, hr: 0 },
      gest: [], walk: null, home: ax, lastAct: 0, swimUntil: 0, saccAt: 0, sacc: [0, 0], hand: '', handShown: '', rm: false, rmDrawn: false, faceHold: 0, seed: opts.seed || 1
    };
    var rnd = function () { st.seed = (st.seed * 16807) % 2147483647; return st.seed / 2147483647; };
    var pose = {}; POSE_KEYS.forEach(function (k) { pose[k] = 0; }); pose.hand = '';
    var mqRM = null; try { mqRM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { mqRM = null; }
    function reduced() { try { if (opts.reduced) return !!opts.reduced(); } catch (e) {} return !!(mqRM && mqRM.matches); }

    // transform setters with change cache (a write only when the string changes)
    function setT(g, s) { if (g && g.__t !== s) { g.__t = s; g.setAttribute('transform', s); } }
    function about(px, py, tx, ty, rot, sx, sy) {
      return 'translate(' + r2(px + tx) + ' ' + r2(py + ty) + ')' + (rot ? ' rotate(' + r2(rot) + ')' : '') + (sx !== 1 || sy !== 1 ? ' scale(' + r2(sx * 1000) / 1000 + ' ' + r2(sy * 1000) / 1000 + ')' : '') + ' translate(' + (-px) + ' ' + (-py) + ')';
    }
    function showOnly(list, idx) { for (var i = 0; i < list.length; i++) if (list[i]) { var v = i === idx ? 'inline' : 'none'; if (list[i].__d !== v) { list[i].__d = v; list[i].setAttribute('display', v); } } }
    function show(g, on) { if (g) { var v = on ? 'inline' : 'none'; if (g.__d !== v) { g.__d = v; g.setAttribute('display', v); } } }

    function placement() {
      if (fill) return '';
      var sx = st.fx * unit;
      return 'translate(' + r2(st.x) + ' ' + r2(ay - st.hop) + ') scale(' + r2(sx * 10000) / 10000 + ' ' + unit + ') translate(' + (-W / 2) + ' ' + (-H) + ')';
    }
    function act(t) { st.lastAct = t; }
    function wake(t) { if (st.walk && st.walk.swim) { st.walk = null; st.hop = 0; } if (!fill && !st.walk && Math.abs(st.x - st.home) > 2 && !st.pointing) ctl.walkTo(st.home, 650); st.away = false; }

    function startGesture(kind, o, t) {
      if (!GESTURES[kind]) return null;
      o = o || {};
      var cur = st.gest.filter(function (g) { return g.kind === kind && g.rel == null && (g.o.hold || t - g.t0 < g.dur); })[0];
      if (cur && kind !== 'wave' && kind !== 'happy') { if (o.hold) cur.o = o; else if (o.ms) cur.dur = o.ms; return cur; }
      var gs = { kind: kind, t0: t, dur: o.ms || GESTURES[kind].dur, rel: null, o: { hold: !!o.hold, dur: o.ms || 0, armRot: o.armRot, rel: null } };
      st.gest.push(gs); if (st.gest.length > 8) st.gest.shift();
      act(t); if (kind !== 'point') wake(t); return gs;
    }

    function pointVec(dir) {
      var dx = 1, dy = -0.15;
      if (typeof dir === 'number') dx = dir < 0 ? -1 : 1;
      else if (dir && typeof dir === 'object') { dx = +dir.dx || 0; dy = +dir.dy || 0; }
      var face = Math.abs(dx) < 4 ? st.fxT : (dx < 0 ? -1 : 1);
      var e = Math.atan2(-dy, Math.max(1, Math.abs(dx))) * 180 / PI;
      return { face: face, armRot: -(90 + clamp(e, -35, 70)) };
    }

    var ctl = {
      node: rootG,
      mouth: function (lv) { st.mouth = clamp(lv | 0, 0, 3); if (st.mouth) { if (!st.lastAct || st.t - st.lastAct > 400) wake(st.t); act(st.t); } },
      mouthLevel: function () { return st.mouth; },
      debug: function () { return { mouth: st.mouth, shown: st.mouthShown, lastGesture: st.lastGesture || '', t: st.t }; },
      lookAt: function (x, y) { if (x == null) { st.lookX = st.lookY = null; return; } st.lookX = +x; st.lookY = +y; act(st.t); },
      gesture: function (kind, o) {
        var t = (o && o.at != null) ? o.at : (st.t || (root.performance ? root.performance.now() : 0));
        st.lastGesture = kind;
        if (kind === 'point') return ctl.point(o && (o.dir != null ? o.dir : o), o);
        return startGesture(kind, o, t) && true;
      },
      point: function (dir, o) {
        var t = st.t || (root.performance ? root.performance.now() : 0);
        if (dir == null) { ctl.release('point'); return; }
        var v = pointVec(dir); st.fxT = v.face; st.faceHold = t + 12000;
        var gs = startGesture('point', { hold: true, armRot: v.armRot }, t); if (gs) { gs.o.armRot = v.armRot; gs.o.hold = true; gs.auto = t + ((o && o.ms) || 9000); }
        return true;
      },
      release: function (kind) {
        var t = st.t || 0;
        st.gest.forEach(function (g) { if ((!kind || g.kind === kind) && g.rel == null && g.o.hold) { g.rel = t - g.t0; g.o.rel = g.rel; } });
        if (kind === 'point') st.faceHold = t + 600;
      },
      walkTo: function (x, ms) {
        var t = st.t || 0, to = clamp(+x, minX, maxX); ms = ms > 0 ? ms : 700;
        if (Math.abs(to - st.x) < 1.5) { st.walk = null; return; }
        st.walk = { x0: st.x, x1: to, t0: t, ms: ms, swim: false }; st.fxT = to < st.x ? -1 : 1; act(t);
      },
      home: function (ms) { ctl.walkTo(st.home, ms || 600); },
      swim: function () {
        var t = st.t || 0, to = clamp(st.x + (rnd() < 0.5 ? -1 : 1) * (28 + rnd() * 30), minX, maxX);
        if (Math.abs(to - st.x) < 12) to = clamp(st.x < (minX + maxX) / 2 ? maxX : minX, minX, maxX);
        st.walk = { x0: st.x, x1: to, t0: t, ms: 5200 + rnd() * 2200, swim: true }; st.fxT = to < st.x ? -1 : 1; st.swimUntil = st.walk.t0 + st.walk.ms;
      },
      clientToPanel: function (cx, cy) {
        var r = svg.getBoundingClientRect(), vb = svg.viewBox && svg.viewBox.baseVal, vw = vb && vb.width || 200, vh = vb && vb.height || 260;
        return { x: (cx - r.left) * vw / Math.max(1, r.width), y: (cy - r.top) * vh / Math.max(1, r.height) };
      },
      headPanel: function () { return { x: st.x + st.fx * unit * (eyeMidX - W / 2), y: ay + unit * (eyeMidY - H) }; },
      reduced: reduced,
      x: function () { return st.x; },
      lift: function () { return st.hop; },
      state: function () { return { x: st.x, fx: st.fx, fxT: st.fxT, mouth: st.mouth, shown: st.mouthShown, gestures: st.gest.map(function (g) { return g.kind; }), lid: st.lid, hand: st.handShown, swimming: !!(st.walk && st.walk.swim), pose: pose, look: st.lk }; },
      busy: function () { return st.gest.length > 0 || !!st.walk || st.mouth > 0; },
      setHome: function (x) { st.home = clamp(+x, minX, maxX); },
      bounds: function () { return { minX: minX, maxX: maxX }; },
      destroy: function () { try { if (rootG.parentNode) rootG.parentNode.removeChild(rootG); } catch (e) {} },
      update: function (t) {
        if (reduced()) {
          if (!st.rmDrawn) {   // static rest pose, closed mouth, nothing else
            st.rmDrawn = true; setT(rootG, placement()); showOnly(mouths, 0); show(gLid, false); show(gHP, false); show(gHT, false); show(gHR, true);
            setT(gBody, ''); setT(gHead, ''); setT(gGL, ''); setT(gGR, ''); setT(gArm, ''); setT(gEL, ''); setT(gER, ''); setT(gPL, ''); setT(gPR, ''); setT(gLid, ''); if (gArmL) show(gArmL.__wrap, false);
          }
          return;
        }
        st.rmDrawn = false;
        var dt = st.t ? clamp(t - st.t, 0, 100) : 16; st.t = t;
        var ts = t / 1000, i, k, g;
        if (!st.lastAct) st.lastAct = t;
        for (i = 0; i < POSE_KEYS.length; i++) pose[POSE_KEYS[i]] = 0; pose.hand = '';
        // ---- idle life
        var swimK = st.walk && st.walk.swim ? 1 : 0;
        pose.bodySy += 0.01 * Math.sin(2 * PI * 0.25 * ts);
        var sw = 6 * (1 + 1.2 * swimK);
        pose.gillL += sw * Math.sin(2 * PI * (0.3 + 0.25 * swimK) * ts);
        pose.gillR += sw * Math.sin(2 * PI * (0.3 + 0.25 * swimK) * ts + 1.9);
        var drH = 0.9 * Math.sin(ts * 0.9) + 0.5 * Math.sin(ts * 1.9 + 1);
        pose.headRot += drH; pose.headTy += 0.8 * Math.sin(ts * 1.3);
        // ---- blink: every 4-7 s, 120 ms
        if (!st.blinkAt) st.blinkAt = t + 4000 + rnd() * 3000;
        else if (t >= st.blinkAt) { st.blinkUntil = t + 120; st.blinkAt = t + 120 + 4000 + rnd() * 3000; }
        var lid = t < st.blinkUntil;
        // ---- gestures
        var armBest = -1;
        for (i = st.gest.length - 1; i >= 0; i--) {
          g = st.gest[i]; var el = t - g.t0;
          if (g.auto && g.rel == null && t >= g.auto) { g.rel = el; g.o.rel = el; }
          var done = g.o.hold ? (g.rel != null && el > g.rel + GESTURES[g.kind].outMs) : el > g.dur;
          if (done) { st.gest.splice(i, 1); continue; }
          var pa = pose.armW, pr = pose.armRot, ph = pose.hand;
          // a gesture that sets the arm wins only if it is stronger than the one already applied
          var tmp = pose.armW; pose.armW = 0; var oldRot = pose.armRot; pose.armRot = 0; var oldHand = pose.hand; pose.hand = '';
          var e = applyGesture(g.kind, el, g.o, pose);
          var gw = pose.armW, gr = pose.armRot, gh = pose.hand;
          if (gw > 0 && gw >= tmp) { pose.armW = gw; pose.armRot = gr; pose.hand = gh; } else { pose.armW = tmp; pose.armRot = oldRot; pose.hand = oldHand; }
        }
        // ---- look: pupils + head turn, eased
        var lx = 0, ly = 0, hasLook = st.lookX != null;
        if (hasLook && !fill) {
          var hx = st.x + st.fx * unit * (eyeMidX - W / 2), hy = ay - unit * (H - eyeMidY);
          lx = st.fx * (st.lookX - hx) / unit; ly = (st.lookY - hy) / unit;
        } else if (hasLook) { lx = st.lookX; ly = st.lookY; }
        if (t >= st.saccAt) { st.saccAt = t + 1800 + rnd() * 2600; st.sacc[0] = (rnd() - 0.5) * 2.2; st.sacc[1] = (rnd() - 0.5) * 1.4; }
        var lv = lookVec(lx, ly, opts.lookMax || (cast ? { px: 4, py: 3, hr: 0 } : null));
        var tgtX = hasLook ? lv.px : st.sacc[0], tgtY = hasLook ? lv.py : st.sacc[1], tgtH = hasLook ? lv.hr : 0, a = 1 - Math.exp(-dt / 110);
        st.lk.px += (tgtX - st.lk.px) * a; st.lk.py += (tgtY - st.lk.py) * a; st.lk.hr += (tgtH - st.lk.hr) * a;
        // ---- walk / swim / facing
        if (st.walk) {
          var w = st.walk, k2 = clamp((t - w.t0) / w.ms, 0, 1), ek = easeInOut(k2);
          st.x = lerp(w.x0, w.x1, ek);
          if (w.swim) st.hop = 3 * Math.sin(k2 * PI * 5) + 3; else st.hop = Math.abs(Math.sin(k2 * PI * Math.max(1, Math.round(w.ms / 320)))) * 5 * (k2 < 1 ? 1 : 0);
          if (k2 >= 1) { st.walk = null; st.hop = 0; if (w.swim) st.lastAct = t; }
        } else st.hop = 0;
        if (t > st.faceHold && !st.walk && st.fxT !== 1 && !hasLook) st.fxT = 1;
        if (st.fx !== st.fxT) { var step = dt / 220; st.fx = st.fx < st.fxT ? Math.min(st.fxT, st.fx + step * 2) : Math.max(st.fxT, st.fx - step * 2); }
        // ---- swim when nothing has happened for 20 s; any activity brings him home
        var busy = st.gest.length > 0 || st.mouth > 0 || hasLook;
        st.pointing = st.gest.some(function (q) { return q.kind === 'point'; });
        if (busy) st.lastAct = t;
        else if (!fill && !opts.noSwim && !st.walk && t - st.lastAct > 20000) { st.away = true; ctl.swim(); }
        // back home once a point / look has finished (a swim wander stays where it ended until something happens)
        if (!fill && !st.walk && !st.pointing && !hasLook && !st.away && Math.abs(st.x - st.home) > 2 && t - st.lastAct > 1200) ctl.walkTo(st.home, 750);
        // ---- mouth shape
        var lvl = st.mouth;
        if (pose.minMouth > lvl) lvl = pose.minMouth;
        if (pose.wide && st.mouth === 0 && lvl < 3) lvl = pose.wide ? 3 : lvl;
        if (st.mouthShown !== lvl) { st.mouthShown = lvl; showOnly(mouths, lvl); }
        var jaw = lvl === 3 ? 0.025 : 0;
        var lh = clamp(pose.lidHalf, 0, 1); st.lidHalf = lh;
        show(gLid, lid || lh > 0.03); st.lid = lid;
        if (gLid) setT(gLid, lid || lh <= 0.03 ? '' : about(pv('lid', 0), P.lid.y, 0, 0, 0, 1, lh));
        // ---- hand
        var hk = pose.hand || ''; if (pose.armW < 0.02) hk = '';
        if (hk !== st.handShown) { st.handShown = hk; show(gHR, hk === ''); show(gHP, hk === 'point'); show(gHT, hk === 'thumb'); }
        // ---- transforms
        setT(rootG, placement());
        var bsy = 1 + pose.bodySy;
        var bTy = pose.bodyTy - (swimK ? 0 : 0);
        if (headIsBody) {   // cast: no separate head, the nod and breathing share the base
          setT(gBody, about(bodyPv[0], bodyPv[1], 0, bTy + pose.headTy * 0.5 + pose.dip * 0.5, pose.bodyRot + pose.headRot * 0.3, 1, bsy * (1 - pose.dip * 0.0035)));
        } else {
          setT(gBody, about(bodyPv[0], bodyPv[1], pose.bodyTx, bTy, pose.bodyRot, 1, bsy));
          setT(gHead, about(headPv[0], headPv[1], 0, pose.headTy + pose.dip * 1.6 + jaw * 188, pose.headRot + st.lk.hr, 1, 1 - pose.dip * 0.006 + jaw));
        }
        if (gGL) setT(gGL, about(pv('gill_l', 0), pv('gill_l', 1), 0, 0, -pose.gillL, 1, 1));
        if (gGR) setT(gGR, about(pv('gill_r', 0), pv('gill_r', 1), 0, 0, pose.gillR, 1, 1));
        var ew = 1 + 0.3 * clamp(pose.eyeWide, 0, 1);
        function eyeT(g, nm, f) { if (g) setT(g, ew > 1.001 ? about(pv(nm, 0), pv(nm, 1), st.lk.px * f, st.lk.py * f, 0, ew, ew) : 'translate(' + r2(st.lk.px * f) + ' ' + r2(st.lk.py * f) + ')'); }
        eyeT(gEL, 'eye_l', 0.5); eyeT(gER, 'eye_r', 0.5); eyeT(gPL, 'pupil_l', 1); eyeT(gPR, 'pupil_r', 1);
        var bk = (cast ? 9 : 3) * Math.min(1, pose.browUp);   // cast brows are small on a 768 px sprite: a larger travel so the raise reads
        if (gBL) setT(gBL, 'translate(0 ' + r2(-bk) + ')');
        if (gBR) setT(gBR, 'translate(0 ' + r2(-bk) + ')');
        if (gArm) {
          var rot = pose.armW > 0.001 ? lerp(1.2 * Math.sin(ts * 0.8), pose.armRot, pose.armW) : 1.2 * Math.sin(ts * 0.8);
          setT(gArm, about(pv('arm_r', 0), pv('arm_r', 1), 0, 0, rot, 1, 1));
          if (gHT && st.handShown === 'thumb') setT(gHT, about(pv('hand_thumb', 0), pv('hand_thumb', 1), 0, 0, -rot + 12, 1, 1));
        }
        if (gArmL) {   // the mirrored second arm follows armL (surprise, cheer)
          var onL = pose.armL > 0.02; show(gArmL.__wrap, onL);
          if (onL) setT(gArmL, about(pv('arm_r', 0), pv('arm_r', 1), 0, 0, lerp(1.2 * Math.sin(ts * 0.8), pose.armRot || -135, clamp(pose.armL, 0, 1)), 1, 1));
        }
      }
    };
    // initial paint: rest pose, closed mouth, no flash
    setT(rootG, placement()); showOnly(mouths, 0); st.mouthShown = 0; show(gLid, false); show(gHP, false); show(gHT, false);
    rootG.__rig = ctl;   // debug / test handle
    lastCtl = ctl;
    return ctl;
  }

  // preload every part image; resolves true when all decoded (or false on error / 6 s timeout)
  function preload(J) {
    return new Promise(function (res) {
      var names = Object.keys(J.parts), left = names.length, bad = false, done = false;
      function fin(ok) { if (!done) { done = true; res(ok && !bad); } }
      setTimeout(function () { fin(false); }, 6000);
      names.forEach(function (n) { var im = new Image(); im.onload = function () { if (--left === 0) fin(true); }; im.onerror = function () { bad = true; fin(false); }; im.src = J.parts[n].src; });
    });
  }
  function loadJson(url) {
    return root.fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }).then(function (j) { return j && j.parts && j.size ? j : null; });
  }
  var mouthP = null;
  function mouthJson() {
    if (!mouthP) mouthP = root.fetch('voice/mouth.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return mouthP;
  }

  var Rig = { VERSION: 1, mount: mount, preload: preload, loadJson: loadJson, mouthJson: mouthJson, envelopeFor: envelopeFor,
    voiceStep: voiceStep, debug: function () { return lastCtl ? lastCtl.debug() : null; }, mouthShape: mouthShape, clockLevel: clockLevel, levelNum: levelNum, energy: energy, percentile: percentile, emphasisPeaks: emphasisPeaks,
    lookVec: lookVec, gestureAt: gestureAt, applyGesture: applyGesture, GESTURES: GESTURES, POSE_KEYS: POSE_KEYS, easeInOut: easeInOut, env: env };
  root.Rig = Rig;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rig;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
