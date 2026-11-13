/* HyGrow Grow Sim — axel.js
   Axel the Axolotl, painted storybook sprites (6 poses) with procedural motion.
   Art.axel(parentSvg) -> { node, talk(ms), wave(ms), hop(), react(kind, ms), mood('happy'|'worried'|'point'), update(t) }
   react(kind,ms): kind worried|thumbs|wave|point, priority in that order, 600 ms min hold, same-kind cooldown.
   Sprites live in ./axel/<pose>.webp. Load after art.js.
   Loops: art/axel/anim/loops.json ({loop:{frames,fps,size,unit,once?}}) adds LoRA-style frame loops on top of the single poses:
   idle (breathe) = default, talk = while the bubble types (talk(ms) window), worried = react('worried') / worried mood,
   celebrate = react('wave') / harvest. A missing/broken loop falls back to the single webp; reduced motion shows frame 1.
   Lip-sync: while Voice.playing() reports who === 'axel' (voice.js), talking() is true and the talk loop follows Voice.mouthOpen()
   (talk_2 = mouth open, talk_1 = closed) instead of the 7 fps clock; with no clip playing (or no envelope for it) the clock is used as before.
   Layered rig (rig.js + art/axel/rig/rig.json): when the rig loads, Axel is drawn as layered parts animated in code and the frame loops below stay as the fallback
   (no rig.json / rig.js / a broken part = everything behaves exactly as before; ?rig=0 forces the fallback). See docs/RIG.md.
   Blink: an optional loops.json 'blink' entry (single frame) shows for 120 ms every 4-7 s while the idle loop is on screen. */
/* ---- world reactions: pure decision helpers (no DOM; tests/rig.test.js requires this file under node) ----
   AxelReact.decide(mem, kind, now, ctx) -> true when a world reaction of `kind` may start now, and records it in mem.
   Rules: nothing while the title screen is up (ctx.title), never during a line with emphasis (ctx.emphasis), never while worried is held (ctx.worried),
   not while he is pointing (ctx.busy), at most one per MIN_GAP_MS of real time across all kinds, and the state-driven kinds (shiver, fan) at most once per KIND_GAP_MS. */
(function (root) {
  'use strict';
  var MIN_GAP_MS = 20000, KIND_GAP_MS = { shiver: 60000, fan: 60000, surprise: 0, cheer: 0 }, PRI = { cheer: 4, surprise: 3, shiver: 2, fan: 1 }, KINDS = ['shiver', 'fan', 'surprise', 'cheer'];
  function newMem() { return { last: -Infinity, byKind: {} }; }
  function decide(mem, kind, now, ctx) {
    ctx = ctx || {};
    if (!PRI[kind] || !mem) return false;
    if (ctx.title || ctx.emphasis || ctx.worried || ctx.busy) return false;
    if (now - mem.last < API.MIN_GAP_MS) return false;   // read live so a capture / test can shorten it; the shipped value is 20 s
    var kg = API.KIND_GAP_MS[kind] || 0, lk = mem.byKind[kind];
    if (kg && lk != null && now - lk < kg) return false;
    mem.last = now; mem.byKind[kind] = now; return true;
  }
  function pick(kinds) { var best = '', i; for (i = 0; i < (kinds || []).length; i++) if (PRI[kinds[i]] && (!best || PRI[kinds[i]] > PRI[best])) best = kinds[i]; return best; }
  // rd = a Sim.readings() object. Cold night outside: the air reading is under its band while the sun is off. Hot afternoon outside: over its band by day, no shade cloth.
  function coldNight(rd) { var t = rd && rd.airTemp, b = rd && rd.targets && rd.targets.airTemp; return !!(rd && rd.method && rd.method.where !== 'tent' && t != null && b && !rd.lightsOn && t < b[0]); }
  function hotDay(rd) { var t = rd && rd.airTemp, b = rd && rd.targets && rd.targets.airTemp; return !!(rd && rd.method && rd.method.where !== 'tent' && t != null && b && rd.lightsOn && !rd.shade && t > b[1]); }
  // rain starts: the latest hourly rain reading crosses 0.3 mm
  function rainStarted(prevLast, last) { return (prevLast || 0) < 0.3 && (last || 0) >= 0.3; }
  // a problem is new when its severity was 0 / absent at the last poll and is >= 1 now
  function newProblems(prev, now) { var out = [], k; prev = prev || {}; now = now || {}; for (k in now) if (now[k] >= 1 && !(prev[k] >= 1)) out.push(k); return out; }
  var API = { MIN_GAP_MS: MIN_GAP_MS, KIND_GAP_MS: KIND_GAP_MS, PRI: PRI, KINDS: KINDS, newMem: newMem, decide: decide, pick: pick, coldNight: coldNight, hotDay: hotDay, rainStarted: rainStarted, newProblems: newProblems };
  root.AxelReact = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

(function () {
  if (typeof window === 'undefined' || !window.Art || typeof document === 'undefined') return;   // under node only AxelReact above is wanted
  const NS = 'http://www.w3.org/2000/svg';
  const POSES = { idle: [240, 361], talk: [295, 368], worried: [285, 372], point: [277, 363], thumbs: [270, 363], wave: [304, 361] };
  const BASE = 'axel/';
  // preload so pose swaps never flash. In rig mode (default) only the idle still is fetched (first paint + fallback); the other five load if the rig is off or fails /* v37 */
  const RIG_OFF = /[?&]rig=0(&|$)/.test(String(typeof location !== 'undefined' ? location.search : ''));   /* v37 */
  const preloadPoses = list => list.forEach(p => { const i = new Image(); i.src = BASE + p + '_v2.webp'; });   /* v37 */
  let fallbackStarted = false;   /* v37 */
  /* v49 [M35]: the 89 KB idle still used to start downloading while the deferred scripts were still arriving and competed with ui.js on a slow link; it now waits for DOMContentLoaded, the moment the title boots */
  if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => preloadPoses(['idle']), { once: true }); else preloadPoses(['idle']);

  /* ---- frame loops (optional; absent file = everything below stays on the single poses) ---- */
  const LOOPS_URL = 'art/axel/anim/loops.json';
  let LOOPS = {};
  let loopsStarted = false;   /* v37 */
  // fetched only when the rig is off (?rig=0) or did not mount: in rig mode the frame loops are never requested /* v37 */
  function startFallback() {   /* v37 */
    if (fallbackStarted) return; fallbackStarted = true;   /* v37 */
    preloadPoses(Object.keys(POSES).filter(p => p !== 'idle'));   /* v37 */
    loadLoops();   /* v37 */
  }   /* v37 */
  function loadLoops() {   /* v37 */
    if (loopsStarted) return; loopsStarted = true;   /* v37 */
    try {
      if (typeof fetch !== 'function') return;
      fetch(LOOPS_URL).then(r => (r.ok ? r.json() : null)).then(j => {
        if (!j || typeof j !== 'object') return;
        const ok = {};
        Object.keys(j).forEach(k => {
          const l = j[k];
          if (!l || !Array.isArray(l.frames) || !l.frames.length || !Array.isArray(l.size) || !(l.fps > 0)) return;
          l.unit = l.unit > 0 ? l.unit : 236 / l.size[1];
          l.imgs = l.frames.map(u => { const i = new Image(); i.onerror = () => { l.bad = true; }; i.src = u; return i; });
          ok[k] = l;
        });
        LOOPS = ok; if (window.Art) window.Art.axelLoops = ok;
      }).catch(() => {});
    } catch (e) {}
  }   /* v37 */
  if (RIG_OFF) startFallback();   /* v37 */
  const LOOP_OF = { idle: 'idle', talk: 'talk', worried: 'worried', wave: 'celebrate' };

  /* ---- layered rig (optional): rig.js is injected once, rig.json + every part image must load, otherwise null and the loops above are used ---- */
  const RIG_URL = 'art/axel/rig/rig.json';
  let rigReady = null;
  function loadRig() {
    if (rigReady) return rigReady;
    rigReady = new Promise(res => {
      try {
        if (typeof fetch !== 'function' || !document.createElement || /[?&]rig=0(&|$)/.test(String(location.search))) return res(null);
        const jP = fetch(RIG_URL).then(r => (r.ok ? r.json() : null)).catch(() => null);
        const sP = window.__rigScript || (window.__rigScript = new Promise(r2 => {   // shared with story.js: rig.js is injected once
          if (window.Rig) return r2(window.Rig);
          const sc = document.createElement('script'); sc.src = 'rig.js'; sc.async = true;
          sc.onload = () => r2(window.Rig || null); sc.onerror = () => r2(null); document.head.appendChild(sc);
        }));
        Promise.all([jP, sP]).then(([j, R]) => {
          if (!j || !j.parts || !j.size || !R || !R.mount) return res(null);
          return R.preload(j).then(ok => res(ok ? j : null));
        }).catch(() => res(null));
      } catch (e) { res(null); }
    });
    return rigReady;
  }

  // shared world listeners: registered once, fan out to every Axel instance /* v37 */
  const INST = []; let wired = false;   /* v37 */
  const fan = k => e => { for (let i = 0; i < INST.length; i++) { try { INST[i][k](e); } catch (er) {} } };   /* v37 */
  function wireOnce() {   /* v37 */
    if (wired) return; wired = true;   /* v37 */
    try { document.addEventListener('hygrow:goal', fan('onGoal')); setInterval(fan('worldPoll'), 1000); } catch (e) {}   /* v37 */
    try { document.addEventListener('hygrow:point', fan('onPoint')); document.addEventListener('hygrow:act', fan('onAct')); window.addEventListener('hygrow:voice', fan('onVoice')); } catch (e) {}   /* v37 */
  }   /* v37 */

  function axel(parent) {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'axel'); parent.appendChild(g);
    parent.style.overflow = 'visible'; // loop frames with arms up / a jump rise above the 260-unit viewBox
    // soft water glow + floor shadow
    const glow = document.createElementNS(NS, 'ellipse');
    Object.entries({ cx: 100, cy: 248, rx: 62, ry: 8, fill: '#000', opacity: 0.28 }).forEach(([k, v]) => glow.setAttribute(k, v)); g.appendChild(glow);
    const rig = document.createElementNS(NS, 'g'); g.appendChild(rig);
    rig.style.transformBox = 'view-box'; rig.style.transformOrigin = '100px 250px';
    // two stacked images for cross-fading between poses
    const layers = [0, 1].map(() => {
      const im = document.createElementNS(NS, 'image');
      im.setAttribute('preserveAspectRatio', 'xMidYMax meet');
      im.style.transition = 'opacity 140ms ease-out';
      rig.appendChild(im); return im;
    });
    let front = 0, cur = '', curLoop = '';
    // key identifies what is on screen; instant = a frame step inside the same loop (no cross-fade, so frames don't blur into each other)
    function show(key, src, x, y, W, H, loop) {
      if (key === cur) return;
      const instant = !!loop && loop === curLoop; cur = key; curLoop = loop || '';
      const place = im => { im.setAttribute('href', src); im.setAttribute('x', x); im.setAttribute('y', y); im.setAttribute('width', W); im.setAttribute('height', H); };
      if (instant) { place(layers[front]); return; }
      const back = layers[1 - front];
      place(back); back.style.opacity = 1; layers[front].style.opacity = 0; front = 1 - front;
    }
    function showPose(p) {
      const [w, h] = POSES[p], H = 236, W = H * w / h;
      show(p, BASE + p + '_v2.webp', 100 - W / 2, 250 - H, W, H, '');
    }
    const rmOn = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let loopName = '', loopT0 = 0;
    // a recorded Axel clip is playing (voice.js); null otherwise. Every Voice reference is guarded.
    function voiceAxel() {
      try { const v = window.Voice && window.Voice.playing && window.Voice.playing(); return v && v.who === 'axel' ? v : null; } catch (e) { return null; }
    }
    function voiceHasMouth() { try { return !!(window.Voice && window.Voice.hasMouth && window.Voice.hasMouth()); } catch (e) { return false; } }
    function voiceMouth() { try { return !!(window.Voice && window.Voice.mouthOpen && window.Voice.mouthOpen()); } catch (e) { return false; } }
    // blink: optional single frame from loops.json 'blink', 120 ms every 4-7 s, idle loop only
    const blinkGap = () => 4000 + Math.random() * 3000;
    function blinkNow(t) {
      const b = LOOPS.blink; if (!b || b.bad || rmOn()) return false;
      if (!st.nextBlink) { st.nextBlink = t + blinkGap(); return false; }
      if (t >= st.nextBlink) { st.blinkUntil = t + 120; st.nextBlink = t + 120 + blinkGap(); }
      return t < st.blinkUntil;
    }
    // returns true when a loop frame was shown, false = caller shows the single pose
    function showLoop(p, t) {
      const name = LOOP_OF[p], l = name && LOOPS[name];
      if (!l || l.bad) { loopName = ''; return false; }
      if (name !== loopName) { loopName = name; loopT0 = t; }
      const n = l.frames.length; let f = rmOn() ? 0 : Math.floor((t - loopT0) * l.fps / 1000);
      f = l.once ? Math.min(f, n - 1) : f % n;
      if (name === 'talk' && n > 1 && !rmOn() && voiceAxel() && voiceHasMouth()) f = voiceMouth() ? 1 : 0;   // clip playing: frame 2 = mouth open
      if (name === 'idle' && blinkNow(t)) {
        const b = LOOPS.blink, bw = b.size[0] * b.unit, bh = b.size[1] * b.unit;
        show('loop:blink:0', b.frames[0], 100 - bw / 2, 250 - bh, bw, bh, 'idle');
        return true;
      }
      const W = l.size[0] * l.unit, H = l.size[1] * l.unit;
      show('loop:' + name + ':' + f, l.frames[f], 100 - W / 2, 250 - H, W, H, name);
      return true;
    }
    showPose('idle');

    /* ---- rig mode state (rc = Rig controller once mounted) ---- */
    let rc = null;
    const rs = { mj: null, id: '', lastT: 0, sample: 0, cool: 0, axelLine: false, worriedG: false, pointMood: false, target: null, tmr: 0, hot: false };
    const rigHost = document.createElementNS(NS, 'g'); g.appendChild(rigHost);   // a plain wrapper: index.html's reduced-motion rule resets transforms on .axel>g only

    const st = { nextBlink: 0, blinkUntil: 0, talkUntil: 0, thumbsUntil: 0, mood: 'happy', hop: 0, nod: 0, rx: null, rxPend: null, nextIdle: 0 };

    /* ---- reactions: one timed pose override with a priority order, a 600 ms minimum hold and a cooldown ----
       worried > thumbs > wave > point. Same kind while active = ignored (no flicker, no stacking);
       lower priority while active = ignored; higher priority inside the 600 ms hold = queued until the hold ends. */
    const PRI = { worried: 4, thumbs: 3, wave: 2, point: 1 }, HOLD = 600;
    function react(kind, ms) {
      const pri = PRI[kind]; if (!pri) return;
      const now = performance.now(), c = st.rx, active = !!c && now < c.until;
      if (active) {
        if (kind === c.kind || pri < c.pri) return;
        if (now - c.start < HOLD) { if (!st.rxPend || pri > st.rxPend.pri) st.rxPend = { kind, ms: ms || 1800, pri }; return; }
      }
      st.rx = { kind, start: now, until: now + (ms || 1800), pri }; st.rxPend = null; rigReact(kind, ms || 1800);
    }
    function applyPend(t) {
      const p = st.rxPend; if (!p) return;
      const c = st.rx, active = !!c && t < c.until;
      if (!active || (p.pri > c.pri && t - c.start >= HOLD)) { st.rx = { kind: p.kind, start: t, until: t + p.ms, pri: p.pri }; st.rxPend = null; rigReact(p.kind, p.ms); }
      else if (p.pri <= c.pri) st.rxPend = null;
    }

    /* ---- idle life: every 20-40 s a small blink (squash) or bob on the outer group; skipped for reduced motion,
       speed > 1, an open bubble, or while talking/reacting ---- */
    const mqRM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    g.style.transformBox = 'view-box'; g.style.transformOrigin = '100px 250px';
    const idleGap = () => 20000 + Math.random() * 20000;
    function idleOk(t) {
      if (rc || (mqRM && mqRM.matches) || typeof g.animate !== 'function') return false;
      if (t < st.talkUntil || voiceAxel() || (st.rx && t < st.rx.until)) return false;
      try {
        if (document.querySelector('#bubble.show')) return false;
        const b = document.querySelector('#speed button.on'); if (b && +b.dataset.s > 1) return false;
      } catch (e) {}
      return true;
    }
    function idleLife() {
      const bob = Math.random() < 0.5;
      const kf = bob
        ? [{ transform: 'translateY(0px)' }, { transform: 'translateY(-4px)', offset: 0.35 }, { transform: 'translateY(0px) scale(1.01,0.98)', offset: 0.7 }, { transform: 'translateY(0px)' }]
        : [{ transform: 'scale(1,1)' }, { transform: 'scale(1.015,0.955)', offset: 0.3 }, { transform: 'scale(1,1)' }];
      try { g.animate(kf, { duration: bob ? 900 : 260, easing: 'ease-in-out' }); } catch (e) {}
    }

    /* ---- rig driver: maps the Axel API (talk / react / hop / mood / Voice / hygrow:* events) onto the Rig controller ---- */
    function rigReact(kind, ms) {
      if (!rc) return;
      try {
        if (kind === 'worried') rc.gesture('worried', { ms });
        else if (kind === 'thumbs') rc.gesture('thumbs', { ms: Math.max(1200, ms) });
        else if (kind === 'wave') rc.gesture('wave', { ms: Math.max(1200, ms) });
        else if (kind === 'point') rc.point(rs.target || 1, { ms });
      } catch (e) {}
    }
    function rigDrive(t) {
      const talking = t < st.talkUntil || !!voiceAxel();
      // mouth: Voice envelope (50 ms samples) while an Axel clip plays, else the 140 ms clock through closed / half / open / half
      const v = voiceAxel();
      if (v && voiceHasMouth()) {
        // every frame (rAF), not every 50 ms: the audio clock is read at the same instant as the level, so the mouth lags by one frame at most
        let lv = 0; try { lv = window.Voice.mouthLevel(); } catch (e) {}
        const ev = window.Rig.envelopeFor(rs.mj, v.id);
        const r = window.Rig.voiceStep(rs, ev, v.id, (v.t || 0) * 1000, lv, t);
        if (r.emphasis) rc.gesture('emphasis');
        rc.mouth(r.shape);
      } else if (talking) rc.mouth(window.Rig.clockLevel(t, false));
      else { if (rs.id) window.Rig.voiceStep(rs, null, '', null, 0, t); rc.mouth(0); }   // watchdog: nothing plays and no clock = closed, voice state reset
      // moods that hold a gesture
      const wantW = st.mood === 'worried' && (talking || t < st.talkUntil + 2500);
      if (wantW && !rs.worriedG) { rs.worriedG = true; rc.gesture('worried', { hold: true }); } else if (!wantW && rs.worriedG) { rs.worriedG = false; rc.release('worried'); }
      const wantP = st.mood === 'point' && talking && !rs.target;
      if (wantP && !rs.pointMood) { rs.pointMood = true; rc.point(1); } else if (!wantP && rs.pointMood) { rs.pointMood = false; rc.release('point'); }
      if (window.__rigProfile) { const a = performance.now(); rc.update(t); const d = performance.now() - a; const P = window.__rigProfile; P.n = (P.n || 0) + 1; P.sum = (P.sum || 0) + d; P.max = Math.max(P.max || 0, d); }
      else rc.update(t);
      glow.setAttribute('cx', rc.x()); glow.setAttribute('rx', 62 - rc.lift() * 0.8);
    }
    function visible() { try { return parent.isConnected && parent.getBoundingClientRect().width > 0; } catch (e) { return false; } }
    function onPoint(e) {
      if (!rc || !visible()) return;
      const d = e && e.detail;
      clearTimeout(rs.tmr);
      if (!d) { rs.target = null; rc.release('point'); rc.lookAt(null); rc.home(700); return; }
      let r = d.rect; if (!r && d.selector) { try { const n = document.querySelector(d.selector); r = n && n.getBoundingClientRect(); } catch (er) {} }
      if (!r || !(r.width >= 0)) return;
      const c = rc.clientToPanel(r.left + r.width / 2, r.top + r.height / 2), hp = rc.headPanel();
      const b = rc.bounds(), dx = c.x - hp.x, dy = c.y - hp.y;
      rs.target = { dx, dy };
      rc.walkTo(dx < 0 ? b.minX : b.maxX, 650); rc.lookAt(c.x, c.y); rc.point({ dx, dy }, { ms: 6500 });
      rs.tmr = setTimeout(() => { rs.target = null; try { rc.lookAt(null); rc.home(800); } catch (er) {} }, 6500);
    }
    function onAct(e) {
      if (!rc || !visible()) return;
      const d = (e && e.detail) || {};
      if (d.id === 'harvest') { let w0 = null; try { w0 = window.Fx && Fx.firstHarvestDone ? Fx.firstHarvestDone() : null; } catch (er) {} setTimeout(() => harvestAct(d, w0), 160); return; }   // ui.js dispatches before Fx.firstHarvest runs: look again a moment later
      plainAct(d);
    }
    function plainAct(d) {
      if (!rc) return;
      if (d.good === true) { react('thumbs', 1800); rc.gesture('nod'); }
      else if (d.good === false) react('worried', 2400);
      else rc.gesture('nod');
    }
    function onVoice(e) {
      if (!rc || !visible()) return;
      const d = e && e.detail; if (!d) return;
      if (d.type === 'line') rs.axelLine = d.who === 'axel';
      else if (d.type === 'end' && rs.axelLine) { rs.axelLine = false; rc.gesture('nod'); }
    }
    /* ---- world reactions (rig mode only): shiver / fan / surprise / cheer, decided by AxelReact.decide ---- */
    const wm = AxelReact.newMem(), ww = { S: null, pr: null, rainLast: null, pend: [], fhSeen: false };
    function worldCtx(t) {
      let title = false, emphasis = false, busy = false;
      try { title = !!document.querySelector('#title.show'); } catch (e) {}
      try { const g = rc.state().gestures; emphasis = g.indexOf('emphasis') >= 0; busy = g.indexOf('point') >= 0 || !!rs.target; } catch (e) {}
      if (!emphasis && voiceAxel()) { try { const ev = window.Rig.envelopeFor(rs.mj, voiceAxel().id); emphasis = !!(ev && ev.peaks && ev.peaks.length); } catch (e) {} }   // an Axel clip that has emphasis moments is "a line with emphasis"
      const worried = rs.worriedG || (st.rx && st.rx.kind === 'worried' && t < st.rx.until);
      return { title, emphasis, worried: !!worried, busy };
    }
    // ask for a world reaction; cheer and surprise wait up to 8 s for a gap, shiver / fan are re-asked by the next poll anyway
    function worldAsk(kind, wait) {
      if (!rc || !visible()) return false;
      const t = performance.now();
      if (AxelReact.decide(wm, kind, t, worldCtx(t))) { try { rc.gesture(kind); } catch (e) {} return true; }
      if (wait && !ww.pend.some(p => p.kind === kind)) ww.pend.push({ kind, until: t + 8000 });
      return false;
    }
    function worldPoll() {
      if (!rc || document.hidden) return;
      const t = performance.now();
      ww.pend = ww.pend.filter(p => p.until > t);
      if (ww.pend.length) { const k = AxelReact.pick(ww.pend.map(p => p.kind)); if (worldAsk(k, false)) ww.pend = ww.pend.filter(p => p.kind !== k); }
      const G = window.__game, S = G && G.S; if (!S || !window.Sim || !Sim.readings) return;
      let rd; try { rd = Sim.readings(S); } catch (e) { return; }
      const pr = Object.assign({}, S.pr || {}), rl = S.out && S.rainLog ? S.rainLog[S.rainLog.length - 1] : 0;
      if (ww.S !== S) { ww.S = S; ww.pr = pr; ww.rainLast = rl; return; }   // a new run: take a baseline, react to nothing
      const fresh = AxelReact.newProblems(ww.pr, pr), rainOn = S.out && AxelReact.rainStarted(ww.rainLast, rl);
      ww.pr = pr; ww.rainLast = rl;
      const fh = !!document.querySelector('.fh-banner'); if (fh && !ww.fhSeen) { ww.fhSeen = true; worldAsk('cheer', true); } else if (!fh) ww.fhSeen = false;
      if (rainOn || fresh.length) { worldAsk('surprise', true); return; }
      if (AxelReact.coldNight(rd)) worldAsk('shiver', false);
      else if (AxelReact.hotDay(rd)) worldAsk('fan', false);
    }
    function onGoal(e) { const d = e && e.detail; if (!d || d.done !== false) worldAsk('cheer', true); }
    // a harvest act: if it is the first harvest (Fx.firstHarvestDone flips, the .fh-banner appears) he cheers instead of the plain thumbs-up
    function harvestAct(d, wasDone) {
      let first = false;
      try { first = !!document.querySelector('.fh-banner') || (wasDone === false && window.Fx && Fx.firstHarvestDone && Fx.firstHarvestDone() === true); } catch (e) {}
      if (first) { ww.fhSeen = !!document.querySelector('.fh-banner'); if (worldAsk('cheer', true)) return; }
      plainAct(d);
    }
    // one registration for the whole page however many Axels exist (title + game): shared handlers fan out to every instance, each still gates on visible() /* v37 */
    INST.push({ onGoal, onPoint, onAct, onVoice, worldPoll });   /* v37 */
    wireOnce();   /* v37 */
    loadRig().then(J => {
      if (!J || rc || !window.Rig) { if (!rc) startFallback(); return; }   /* v37 */
      try {
        const c = window.Rig.mount(parent, 'axel', J, { host: rigHost, unit: J.unit, ax: 100, ay: 250, minX: 80, maxX: 118 });
        window.Rig.mouthJson().then(m => { rs.mj = m; }).catch(() => {});
        rc = c; rig.style.display = 'none';
      } catch (e) { rc = null; try { rigHost.textContent = ''; } catch (er) {} startFallback(); }   /* v37 */
    });

    return {
      node: g,
      react,
      talk(ms) { st.talkUntil = performance.now() + ms; },
      wave(ms = 1800) { react('wave', ms); },
      hop() { st.hop = performance.now(); st.thumbsUntil = performance.now() + 1800; if (rc) { try { rc.gesture('happy'); } catch (e) {} } },
      mood(m) { st.mood = m; },
      loop() { return rc ? 'rig' : loopName; },
      rig() { return rc; },                       // name of the frame loop on screen ('' = single pose)
      talking() { return performance.now() < st.talkUntil || !!voiceAxel(); },
      update(t) {
        const talking = t < st.talkUntil || !!voiceAxel();
        applyPend(t);
        if (rc) { rigDrive(t); return; }
        if (!st.nextIdle) st.nextIdle = t + idleGap();
        else if (t >= st.nextIdle) { if (idleOk(t)) { idleLife(); st.nextIdle = t + idleGap(); } else st.nextIdle = t + 3000; }
        // pick the pose: reaction (worried > thumbs > wave > point) > hop thumbs > worried mood > point > talk > idle
        let p = 'idle';
        const rk = st.rx && t < st.rx.until ? st.rx.kind : '';
        if (rk) p = rk;
        else if (t < st.thumbsUntil) p = 'thumbs';
        else if (st.mood === 'worried' && (talking || t < st.talkUntil + 2500)) p = 'worried';
        else if (st.mood === 'point' && talking) p = 'point';
        else if (talking) p = 'talk';
        if (!showLoop(p, t)) showPose(p);
        // motion: slow breathing, a weighty hop, and a nod on every syllable while talking
        const breath = Math.sin(t / 900);
        let y = breath * 1.2, sy = 1 + breath * 0.008, rot = Math.sin(t / 2300) * 0.8;
        if (st.hop) { const k = (t - st.hop) / 600; if (k < 1) { y -= Math.sin(k * Math.PI) * 14; sy += k < 0.15 ? -0.05 : 0; } else st.hop = 0; }
        if (talking) { const s = Math.abs(Math.sin(t / 150)); sy -= s * 0.012; rot += Math.sin(t / 300) * 1.2; }
        if (st.mood === 'worried') rot -= 1.5;
        rig.style.transform = `translateY(${y}px) rotate(${rot}deg) scaleY(${sy})`;
        glow.setAttribute('rx', 62 - y * 0.8);
      }
    };
  }
  window.Art.axel = axel;
  window.Art.quinn = axel; // the UI calls Art.quinn
})();
