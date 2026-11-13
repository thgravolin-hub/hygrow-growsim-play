/* HyGrow Grow Sim - Story: visual-novel dialogue runner. window.Story
   Story.play(scene, { portraits, onDone(result), flags, mates, id, names })
   result = { choices:[{prompt, index, text}], effects:{ mates, flags:[], lend }, skipped, scene }
   Self-contained: injects its own CSS (uses the game's CSS vars with fallbacks) and DOM. No dependencies;
   uses window.Scene.mount(el, bgName) for the backdrop when scene.js is loaded.
   Character life: while a Voice clip plays for the speaker the portrait mouth follows Voice.mouthLevel() (50 ms; 0 neutral / 1 half-open / 2 talk), else the 140 ms typing clock (neutral, half, talk, half);
   portraits breathe / shift weight / bounce on a line start; a pose change cross-fades instead of repainting. All of it is skipped under
   prefers-reduced-motion and cancelled when the dialogue closes. */
(function (w) {
'use strict';
var KEY = 'hygrow_story_v1';
var AXEL_DIR = 'axel/';
var NAMES = { axel: 'Axel', deb: 'Deb', rob: 'Rob', regular: 'Kez' };
var BADGE = { deb: '#ec8024', rob: '#6ec846', regular: '#c58be0', axel: '#4fb8d8' };
var AXEL_POSES = { idle: 1, talk: 1, worried: 1, point: 1, thumbs: 1, wave: 1 };
var AXEL_MAP = { neutral: 'idle', happy: 'thumbs', laugh: 'talk', surprised: 'worried' };

/* ---- persisted state: story flags + scenes already seen ---- */
var state = { flags: {}, seen: {} };
function save() { try { w.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function load(j) {
  try { if (!j) j = JSON.parse(w.localStorage.getItem(KEY)); } catch (e) { j = null; }
  state = { flags: {}, seen: {} };
  if (j && typeof j === 'object') {
    if (j.flags && typeof j.flags === 'object') state.flags = Object.assign({}, j.flags);
    if (j.seen && typeof j.seen === 'object') state.seen = Object.assign({}, j.seen);
  }
  return state;
}
load();

/* ---- helpers ---- */
function reduced() { try { return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function sceneId(scene, opts) {
  if (opts && opts.id) return String(opts.id);
  if (scene && scene.id) return String(scene.id);
  var f = scene && scene.lines && scene.lines.filter(function (l) { return l.text; })[0];
  return (scene && scene.bg || '') + ':' + (f ? f.text.slice(0, 24) : '');
}
function flagSet(opts) {
  var f = Object.assign({}, state.flags), o = opts && opts.flags;
  if (Array.isArray(o)) o.forEach(function (k) { f[k] = 1; }); else if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { if (o[k]) f[k] = 1; });
  return f;
}
/* conditions: 'flag' | '!flag' | 'mates>=N' | 'mates<N' ; several joined by '&' */
function cond(expr, flags, mates) {
  if (!expr) return true;
  return String(expr).split('&').every(function (t) {
    t = t.trim(); var m = /^mates\s*(>=|<=|>|<|==)\s*(\d+)$/.exec(t);
    if (m) { var n = +m[2]; return m[1] === '>=' ? mates >= n : m[1] === '<=' ? mates <= n : m[1] === '>' ? mates > n : m[1] === '<' ? mates < n : mates === n; }
    return t.charAt(0) === '!' ? !flags[t.slice(1)] : !!flags[t];
  });
}

/* ---- CSS ---- */
function css() {
  if (document.getElementById('story-style')) return;
  var s = document.createElement('style'); s.id = 'story-style';
  s.textContent =
'.stv{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;justify-content:flex-end;background:var(--ink,#080808);color:var(--text,#f0f4f0);font-family:var(--body,system-ui,sans-serif);overflow:hidden;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:manipulation}' +
'.stv *{box-sizing:border-box}.stv [hidden]{display:none!important}' +
'.stv-bg{position:absolute;inset:0;background:linear-gradient(180deg,var(--panel2,#1a1f1a),var(--brown,#2a1d14));overflow:hidden}' +
'.stv-bg .stv-bglabel{position:absolute;left:12px;top:calc(12px + env(safe-area-inset-top,0px));font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#a9b3a9);opacity:.45}' +
'.stv-shade{position:absolute;inset:0;z-index:8;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%);pointer-events:none}' +
'.stv-stage{position:relative;z-index:9;flex:1 1 auto;min-height:0;display:flex;align-items:flex-end;justify-content:space-between;padding:0 calc(6px + env(safe-area-inset-right,0px)) 0 calc(6px + env(safe-area-inset-left,0px));pointer-events:none}' +
'.stv-side{display:flex;align-items:flex-end;gap:0;height:100%;min-width:0}' +
'.stv-side.r{flex-direction:row-reverse}' +
'.stv-p{position:relative;flex:none;width:clamp(96px,26vw,230px);height:clamp(130px,60%,340px);display:flex;align-items:flex-end;justify-content:center;transition:transform .2s,opacity .2s,filter .2s;opacity:1;filter:brightness(.5) saturate(.75);transform:scale(.92);transform-origin:bottom center;margin:0 -10px}' +
'.stv-p.on{opacity:1;filter:none;transform:scale(1);z-index:2}' +
'.stv-p img{max-width:100%;max-height:100%;object-fit:contain;display:block;filter:drop-shadow(0 6px 10px rgba(0,0,0,.55))}' +
'.stv-badge{width:72%;aspect-ratio:1;max-height:70%;border-radius:50%;display:grid;place-items:center;font:900 clamp(34px,10vw,64px)/1 var(--display,system-ui,sans-serif);color:var(--ink,#080808);border:4px solid var(--line,#2a312a);margin-bottom:8px}' +
'.stv-box{position:relative;z-index:10;margin:0 calc(8px + env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) calc(8px + env(safe-area-inset-left,0px));background:var(--panel,#121512);border:2px solid var(--line,#2a312a);border-radius:16px;padding:22px 14px 12px;min-height:128px;cursor:pointer;display:flex;flex-direction:column;gap:6px}' +
'.stv-name{position:absolute;left:12px;top:-15px;background:var(--orange,#ec8024);color:var(--ink,#080808);font:700 15px/1 var(--display,system-ui,sans-serif);padding:7px 14px;border-radius:999px;border:2px solid var(--ink,#080808);min-height:30px;display:flex;align-items:center}' +
'.stv-name:empty{display:none}' +
'.stv-text{font-size:clamp(16px,4.6vw,19px);line-height:1.4;min-height:3.8em;white-space:pre-wrap;word-break:break-word}' +
'.stv-next{align-self:flex-end;color:var(--green,#6ec846);font-size:14px;line-height:1;animation:stvBob 1s ease-in-out infinite;margin-top:auto}' +
'.stv-top{position:absolute;right:calc(8px + env(safe-area-inset-right,0px));top:calc(8px + env(safe-area-inset-top,0px));z-index:11;display:flex;gap:8px}' +
'.stv-skip{min-height:48px;min-width:72px;padding:0 16px;border-radius:999px;border:2px solid var(--line,#2a312a);background:rgba(18,21,18,.82);color:var(--text,#f0f4f0);font:700 14px var(--display,system-ui,sans-serif);cursor:pointer}' +
'.stv-skip:hover,.stv-skip:focus-visible{border-color:var(--orange,#ec8024);outline:none}' +
'.stv-choices{display:flex;flex-direction:column;gap:8px;margin-top:4px}' +
'.stv-prompt{font:600 clamp(15px,4.2vw,18px)/1.3 var(--display,system-ui,sans-serif);color:var(--yellow,#f2b950)}' +
'.stv-opt{width:100%;min-height:48px;text-align:left;padding:10px 14px;border-radius:12px;border:2px solid var(--line,#2a312a);background:var(--panel2,#1a1f1a);color:var(--text,#f0f4f0);font:700 clamp(15px,4.2vw,17px)/1.3 var(--body,system-ui,sans-serif);cursor:pointer}' +
'.stv-opt:hover,.stv-opt:focus-visible{border-color:var(--green,#6ec846);outline:none;background:var(--panel,#121512)}' +
'.stv-opt b{color:var(--orange,#ec8024);margin-right:8px}' +
'.stv.out{animation:stvOut .2s ease-in forwards}' +
'@keyframes stvOut{to{opacity:0}}@keyframes stvBob{50%{transform:translateY(3px)}}' +
'@media (min-width:700px){.stv-box{max-width:820px;margin-left:auto;margin-right:auto;width:calc(100% - 32px);margin-bottom:20px;min-height:150px;padding:26px 22px 14px}.stv-text{font-size:20px}}' +
'.stv-bgs{display:none}' +
'@media (max-aspect-ratio:4/5){.stv-bg{filter:blur(14px) brightness(.42) saturate(.9);transform:scale(1.1)}.stv-bgs{display:block;position:absolute;left:0;right:0;top:0;height:min(calc(100vw * 0.66),46%);overflow:hidden;z-index:1;pointer-events:none}.stv-bgs:after{content:"";position:absolute;left:0;right:0;bottom:0;height:30%;z-index:50;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.55))}}' + /* v57 (critic round 8 nit #6): a tall phone covered the 16:9 plate edge to edge and showed a quarter of it (no shop sign). Portrait: the plate sits sharp at the top at about 3:2 (most of its width), and a blurred, darkened copy of the same scene fills the screen behind the cast */
'@media (max-height:520px){.stv-p{height:clamp(90px,55%,200px)}.stv-box{min-height:96px}.stv-text{min-height:2.8em}}' +
'@media (prefers-reduced-motion:reduce){.stv,.stv.out,.stv-next,.stv-p{animation:none!important;transition:none!important}}';
  document.head.appendChild(s);
}

/* ---- the runner ---- */
var active = null;

function play(scene, opts) {
  opts = opts || {};
  if (active) active.finish(true);
  if (!scene || !scene.lines) { if (opts.onDone) setTimeout(function () { opts.onDone({ choices: [], effects: { mates: 0, flags: [], lend: null }, skipped: false, scene: null }); }, 0); return null; }
  css();
  var flags = flagSet(opts), mates = +opts.mates || 0, names = Object.assign({}, NAMES, opts.names), portraits = opts.portraits || {};
  var items = scene.lines.filter(function (l) { return cond(l['if'], flags, mates); });
  var cast = (scene.cast || []).slice(), castChanges = 0;
  var result = { choices: [], effects: { mates: 0, flags: [], lend: null }, skipped: false, scene: sceneId(scene, opts) };
  var prev = w.document.activeElement;

  var root = el('div', 'stv'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Story');
  var bg = el('div', 'stv-bg'), label = el('span', 'stv-bglabel'); bg.appendChild(label);
  var bgs = el('div', 'stv-bgs'), tall = false; try { tall = !!(w.matchMedia && w.matchMedia('(max-aspect-ratio:4/5)').matches); } catch (e) {} /* v57: the sharp plate on a tall phone */
  var shade = el('div', 'stv-shade');
  var stage = el('div', 'stv-stage'), left = el('div', 'stv-side l'), right = el('div', 'stv-side r');
  stage.appendChild(left); stage.appendChild(right);
  var box = el('div', 'stv-box'), nameEl = el('div', 'stv-name'), textEl = el('div', 'stv-text'), nextEl = el('div', 'stv-next', String.fromCharCode(0x25BC));
  textEl.setAttribute('tabindex', '-1'); /* v37: the box takes focus on open so Enter reads on instead of landing on Skip; the single caption node in a11y.js announces each finished line (the typewriter itself was being read character by character) */
  var choicesEl = el('div', 'stv-choices'); choicesEl.hidden = true;
  box.appendChild(nameEl); box.appendChild(textEl); box.appendChild(choicesEl); box.appendChild(nextEl);
  var top = el('div', 'stv-top'), skipBtn = el('button', 'stv-skip', 'Skip'); skipBtn.type = 'button'; skipBtn.setAttribute('aria-label', 'Skip scene'); top.appendChild(skipBtn);
  root.appendChild(bg); root.appendChild(bgs); root.appendChild(shade); root.appendChild(stage); root.appendChild(top); root.appendChild(box);
  document.body.appendChild(root);

  /* backdrop */
  var curBg = null;
  /* second day plate on odd chapters: opts.alt wins, else the chapter number in opts.id ('ch<N>:<bg>' from ui.js) */
  var chNum = /^ch(\d+):/.exec(String(opts.id || ''));
  var altBg = opts.alt != null ? !!opts.alt : !!(chNum && (+chNum[1]) % 2 === 1);
  function setBg(name) {
    if (!name || name === curBg) return; curBg = name;
    var mounted = false;
    try { if (w.Scene && typeof w.Scene.mount === 'function') { w.Scene.mount(bg, name, { aspect: false, alt: altBg }); mounted = true; if (tall) w.Scene.mount(bgs, name, { aspect: false, alt: altBg }); } } catch (e) { mounted = false; }
    label.textContent = mounted ? '' : name.replace(/_/g, ' ');
  }
  setBg(scene.bg);

  /* portraits */
  var slots = {}; // who -> {box,img/badge,pose}
  function portraitFor(who, pose) {
    var wrap = el('div', 'stv-p'); wrap.setAttribute('aria-hidden', 'true');
    return { wrap: wrap, who: who, pose: null, img: null, anims: [], shiftT: null, swapT: null, swapS: null, fade: null, swap: 0, swapping: false };
  }
  /* ---- portrait life: transform / opacity only, WAAPI with try/catch; the individual transform properties (translate, rotate, scale) keep
     the breathing, weight shift, bounce and pop from overriding one another or the wrap's CSS scale ---- */
  function wa(node, kf, o) { try { if (node && typeof node.animate === 'function') return node.animate(kf, o); } catch (e) {} return null; }
  function track(s, a) { if (a) { s.anims = s.anims.filter(function (x) { return x.playState !== 'finished'; }); s.anims.push(a); } return a; }
  function slotKill(s) {
    if (!s) return;
    s.swap++; s.swapping = false; s.fade = null;
    clearTimeout(s.shiftT); clearTimeout(s.swapT); clearTimeout(s.swapS);
    s.anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); s.anims = [];
  }
  function killAllFx() { Object.keys(slots).forEach(function (k) { slotKill(slots[k]); }); }
  function shiftLater(s) {
    clearTimeout(s.shiftT);
    s.shiftT = setTimeout(function () {
      if (finished || reduced() || !s.img) return;
      var d = Math.random() < 0.5 ? -1 : 1, m = 1 + Math.random(), x = (d * m).toFixed(2) + 'px', r = (d * m * 0.2).toFixed(2) + 'deg';
      track(s, wa(s.img, [{ translate: '0px 0px', rotate: '0deg' }, { translate: x + ' 0px', rotate: r, offset: 0.35 }, { translate: x + ' 0px', rotate: r, offset: 0.65 }, { translate: '0px 0px', rotate: '0deg' }], { duration: 2400, easing: 'ease-in-out' }));
      shiftLater(s);
    }, 9000 + Math.random() * 6000);
  }
  function idleStart(s) {
    if (reduced() || !s.img) return;
    s.img.style.transformOrigin = '50% 100%';
    track(s, wa(s.img, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.012)' }], { duration: 3400, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out', delay: -Math.floor(Math.random() * 3400) }));
    shiftLater(s);
  }
  function bounce(s) {
    if (!s || reduced()) return;
    track(s, wa(s.wrap, [{ translate: '0px 0px' }, { translate: '0px -4px', offset: 0.4 }, { translate: '0px 0px' }], { duration: 260, easing: 'ease-out' }));
  }
  function toBadge(s) { slotKill(s); s.wrap.innerHTML = ''; s.img = null; s.wrap.appendChild(badge(s.who)); }
  function urlFor(who, pose) {
    var p = portraits[who], u = p && (p[pose] || p.neutral || p.idle || p.default);
    if (u) return u;
    if (who === 'axel') { var k = AXEL_POSES[pose] ? pose : (AXEL_MAP[pose] || 'idle'); return AXEL_DIR + k + '.webp'; }
    return null;
  }
  /* pose change on a live <img>: fade to 0.35 (90 ms), swap src once the new one is loaded, fade back (180 ms) with a 1.0 -> 1.03 -> 1.0 pop */
  function swapPose(slot, img, u) {
    var tok = ++slot.swap, outDone = false, loaded = false, failed = false, pre = new Image();
    slot.swapping = true; clearTimeout(slot.swapT); clearTimeout(slot.swapS); syncRig(slot);
    if (slot.fade) { try { slot.fade.cancel(); } catch (e) {} }
    slot.fade = wa(img, [{ opacity: 1 }, { opacity: 0.35 }], { duration: 90, easing: 'ease-out', fill: 'forwards' });
    function go() {
      if (tok !== slot.swap || finished || !outDone || (!loaded && !failed)) return;
      clearTimeout(slot.swapS);
      if (failed) { toBadge(slot); return; }
      if (slot.fade) { try { slot.fade.cancel(); } catch (e) {} }
      slot.swapping = false;
      img.src = u;
      slot.fade = track(slot, wa(img, [{ opacity: 0.35, scale: '1' }, { opacity: 1, scale: '1.03', offset: 0.4 }, { opacity: 1, scale: '1' }], { duration: 180, easing: 'ease-out' }));
      applyVariant();
    }
    pre.onload = function () { loaded = true; go(); };
    pre.onerror = function () { failed = true; go(); };
    slot.swapT = setTimeout(function () { outDone = true; go(); }, 90);
    slot.swapS = setTimeout(function () { loaded = true; go(); }, 1500); // never wait longer than this for the new pose
    pre.src = u;
  }
  function paint(slot, pose) {
    var u = urlFor(slot.who, pose || 'neutral'), old = slot.img; slot.pose = pose;
    if (u && old && old.parentNode === slot.wrap && !reduced() && typeof old.animate === 'function') { swapPose(slot, old, u); return; }
    slotKill(slot);
    slot.wrap.innerHTML = ''; slot.img = null;
    if (u) {
      var img = new Image(); img.alt = ''; img.draggable = false; img.src = u;
      img.onerror = function () { if (img.parentNode) toBadge(slot); };
      slot.wrap.appendChild(img); slot.img = img; idleStart(slot);
      if (rigs[slot.who] && rigs[slot.who].svg) { slot.wrap.appendChild(rigs[slot.who].svg); rigs[slot.who].on = false; }
      syncRig(slot);
    } else slot.wrap.appendChild(badge(slot.who));
  }
  /* ---- layered rig (optional, rig.js): Deb / Rob / Kez neutral portraits become a parts rig (art/portraits/rig/<who>.json) with a drawn talk cycle
     closed -> half -> open -> wide -> open -> half, blink, breathing, nods on emphasis peaks and sentence ends, and eye glances toward the other speaker.
     No json / no rig.js / a broken part = the <img> frame swap below, unchanged. Pose frames (happy / worried / laugh / surprised) still cross-fade as <img>;
     the rig only replaces the neutral base. ---- */
  var rigs = {}, rigData = null, rigRaf = 0, rigEmph = { id: '', lastT: -1, cool: 0, hot: false }, mouthJ = null;
  function rigOn(who) { var r = rigs[who]; return !!(r && r.on); }
  function loadCastRigs() {
    if (/[?&]rig=0(&|$)/.test(String(w.location && w.location.search))) return;
    try {
      if (typeof w.fetch !== 'function' || !w.document.createElement) return;
      if (!w.__rigScript) w.__rigScript = new Promise(function (res) {
        if (w.Rig) return res(w.Rig);
        var sc = w.document.createElement('script'); sc.src = 'rig.js'; sc.async = true; sc.onload = function () { res(w.Rig || null); }; sc.onerror = function () { res(null); }; w.document.head.appendChild(sc);
      });
      w.__rigScript.then(function (R) {
        if (!R || !R.mount) return;
        cast.forEach(function (who) {
          if (who === 'axel' || rigs[who]) return;
          var u = urlFor(who, 'neutral'); if (!u || !/_neutral\.webp$/.test(u) || !/art\/portraits\//.test(u)) return;   // only the stock painted portraits are cut
          R.loadJson('art/portraits/rig/' + (who === 'regular' ? 'kez' : who) + '.json').then(function (J) {
            if (!J) return null;
            return R.preload(J).then(function (ok) { return ok ? J : null; });
          }).then(function (J) {
            if (!J || finished || rigs[who]) return;
            rigs[who] = { J: J, svg: null, ctl: null, on: false }; mountRig(who);
          }).catch(function () {});
        });
        R.mouthJson().then(function (m) { mouthJ = m; }).catch(function () {});
      });
    } catch (e) {}
  }
  function mountRig(who) {
    var r = rigs[who], s = slots[who]; if (!r || !s || r.ctl || !w.Rig) return;
    try {
      var NSV = 'http://www.w3.org/2000/svg', svg = w.document.createElementNS(NSV, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + r.J.size[0] + ' ' + r.J.size[1]); svg.setAttribute('preserveAspectRatio', 'xMidYMax meet'); svg.setAttribute('class', 'stv-rig'); svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:none;pointer-events:none;overflow:visible;filter:drop-shadow(0 6px 10px rgba(0,0,0,.55))';
      s.wrap.appendChild(svg);
      r.svg = svg; r.ctl = w.Rig.mount(svg, nz(who), r.J, { fill: true, reduced: reduced, noSwim: true, seed: 7 + who.length * 13 });
      syncRig(s);
      if (!rigRaf) rigRaf = w.requestAnimationFrame(rigTick);
    } catch (e) { r.ctl = null; }
  }
  /* show the rig (and hide the <img>) only while this slot is on its neutral pose and no pose swap is running */
  function syncRig(s) {
    var r = s && rigs[s.who]; if (!r || !r.ctl) return;
    var want = !!(s.img && !s.swapping && (!s.pose || s.pose === 'neutral') && r.svg.parentNode === s.wrap);
    if (want !== r.on) { r.on = want; r.svg.style.display = want ? '' : 'none'; if (s.img) s.img.style.visibility = want ? 'hidden' : ''; }
  }
  function syncRigs() { Object.keys(slots).forEach(function (k) { syncRig(slots[k]); }); }
  function rigTick(t) {
    rigRaf = 0; if (finished) return;
    // recorded clip with an envelope: drive the speaker's mouth every frame (audio clock and level read at the same instant), not on the 50 ms timer
    if (cur && cur.who && rigOn(cur.who) && mouthT && voiceNow() && voiceEnv()) rigMouth(cur.who, true, 0, w.performance.now());
    Object.keys(rigs).forEach(function (k) { var r = rigs[k]; if (r.on && r.ctl) { try { r.ctl.update(t); } catch (e) {} } });
    rigRaf = w.requestAnimationFrame(rigTick);
  }
  /* one reaction per line from the speaker's own rig: a question line lifts the brows (emphasis gesture: brow_l / brow_r travel; Rob's rig has no brow part, so he is skipped),
     an agreeing line gets a nod as it starts. Deb: brows, Kez: brow_l, Rob: nod only. */
  var AGREE = /^\W*(yes|yeah|yep|right|exactly|agreed|sure|okay|ok|true|good call|fair|that's it|you got it)\b/i;
  function rigLineReact(who, text) {
    if (!rigOn(who) || reduced() || !text) return;
    try {
      var r = rigs[who], P = r.J && r.J.parts || {}, q = /\?\s*["')\]]*\s*$/.test(text);
      if (q && (P.brow_l || P.brow_r)) r.ctl.gesture('emphasis');
      else if (!q && AGREE.test(text)) r.ctl.gesture('nod');
    } catch (e) {}
  }
  function rigNod(who) { if (rigOn(who) && !reduced()) { try { rigs[who].ctl.gesture('nod'); } catch (e) {} } }
  /* mouth for the speaker's rig: envelope level (+ wide above the clip's 80th percentile, brow lift + nod on emphasis peaks) or the 140 ms 6-step clock */
  function rigMouth(who, env, level, now) {
    var r = rigs[who]; if (!r || !r.on) return;
    try {
      if (env) {
        var v = w.Voice.playing();
        if (!v) { w.Rig.voiceStep(rigEmph, null, '', null, 0, now); r.ctl.mouth(0); return; }   // watchdog: clip gone = closed
        var res = w.Rig.voiceStep(rigEmph, w.Rig.envelopeFor(mouthJ, v.id), v.id, (v.t || 0) * 1000, w.Voice.mouthLevel(), now);
        if (res.emphasis) r.ctl.gesture('emphasis');
        r.ctl.mouth(res.shape);
      } else r.ctl.mouth(w.Rig.clockLevel(now, true));
    } catch (e) {}
  }
  function rigGlance() {
    var order = cast.filter(function (k) { return rigs[k]; }), half = Math.ceil(cast.length / 2);
    var side = function (k) { return cast.indexOf(k) < half ? -1 : 1; };
    order.forEach(function (k) {
      var r = rigs[k]; if (!r.ctl) return;
      if (cur.who === k) { var other = cast.filter(function (o) { return o !== k && side(o) !== side(k); })[0]; r.ctl.lookAt(other ? -side(k) * 230 : 0, 0); }
      else if (cur.who && side(cur.who) !== side(k)) r.ctl.lookAt(side(k) < 0 ? 230 : -230, 0);   // listening: eyes go to the speaker's side
      else r.ctl.lookAt(null);
    });
  }
  w.addEventListener('hygrow:voice', function (e) {
    var d = e && e.detail; if (finished || !d || d.type !== 'end') return; rigNod(cur.who);
  });

  /* talk / half / blink variants: swap the <img> src in place (no DOM rebuild, so no flash). Cast: portraits[who].talk|half|blink or the
     *_neutral.webp -> *_talk_v1.webp / *_half_v2.webp / *_blink_v1.webp convention; Axel: idle <-> talk pose (no half frame: level 1 shows talk).
     A variant that 404s is dropped for the session (no half frame for a character: level 1 shows the talk frame). */
  var VOK = {}, VVER = { half: 'v2' };
  function variantUrl(who, kind) {
    var p = portraits[who], u = p && p[kind];
    if (!u && who === 'axel') u = kind === 'talk' ? urlFor('axel', 'talk') : null;
    if (!u && who !== 'axel') { var n = urlFor(who, 'neutral'); if (n && /_neutral\.webp$/.test(n)) u = n.replace(/_neutral\.webp$/, '_' + kind + '_' + (VVER[kind] || 'v1') + '.webp'); }
    if (!u) return null;
    if (VOK[u] === undefined) { VOK[u] = 0; var im = new Image(); im.onload = function () { VOK[u] = 1; }; im.onerror = function () { VOK[u] = -1; }; im.src = u; }
    return VOK[u] === 1 ? u : null;
  }
  var cur = { who: null, pose: null }, mouthLvl = 0, clockStep = 0, blinking = false, mouthT = null, blinkT = null;   // mouthLvl: 0 closed / 1 half / 2 open
  function baseIsNeutral() { return cur.who === 'axel' ? (!cur.pose || cur.pose === 'neutral' || cur.pose === 'idle' || cur.pose === 'talk') : (!cur.pose || cur.pose === 'neutral'); }
  function applyVariant() {
    var s = slots[cur.who]; if (!s || s.swapping) return;
    syncRigs();
    var img = s.wrap.querySelector('img'); if (!img) return;
    if (rigOn(cur.who)) return;   // the rig draws the mouth and blink; the img is hidden
    var base = urlFor(cur.who, cur.who === 'axel' && (!cur.pose || cur.pose === 'talk') ? 'idle' : (cur.pose || 'neutral')), u = base;
    if (baseIsNeutral()) {
      if (blinking && !mouthLvl) u = variantUrl(cur.who, 'blink') || base;
      else if (mouthLvl === 1) u = variantUrl(cur.who, 'half') || variantUrl(cur.who, 'talk') || base;
      else if (mouthLvl >= 2) u = variantUrl(cur.who, 'talk') || base;
    }
    if (u && img.getAttribute('src') !== u) img.src = u;
  }
  function nz(who) { return who === 'kez' ? 'regular' : who; }
  /* a recorded clip is playing for the current speaker (voice.js; kez = regular) */
  function voiceNow() {
    try { var v = w.Voice && w.Voice.playing && w.Voice.playing(); return !!(v && cur.who === 'axel' && v.who === 'axel'); } catch (e) { return false; }
  }
  function voiceEnv() { try { return !!(w.Voice && w.Voice.hasMouth && w.Voice.hasMouth()); } catch (e) { return false; } }
  function stopMouth() { if (mouthT) { clearTimeout(mouthT); mouthT = null; } if (rigOn(cur.who)) { try { rigs[cur.who].ctl.mouth(0); } catch (e) {} } if (mouthLvl) { mouthLvl = 0; applyVariant(); } }
  /* clip playing (with an envelope): sample Voice.mouthLevel() every 50 ms and keep going until the clip ends, even after the typewriter is done;
     otherwise the 140 ms clock (closed, half, open, half) while typing. Stops by itself when neither is going. */
  function startMouth() {
    stopMouth(); if (reduced() || !baseIsNeutral()) return;
    var flipAt = Date.now(), boot = true; clockStep = 0;
    setTimeout(function () { boot = false; }, 0);   // showText() starts the typewriter just after this call: the first tick must not read it as idle
    (function tick() {
      mouthT = null;
      if (finished || (!boot && !isTyping() && !voiceNow())) { stopMouth(); return; }
      var want, now = Date.now(), env = voiceNow() && voiceEnv();
      if (env) { try { want = w.Voice.mouthLevel ? (+w.Voice.mouthLevel() || 0) : (w.Voice.mouthOpen() ? 2 : 0); } catch (e) { want = 0; } want = want >= 2 ? 2 : want >= 1 ? 1 : 0; clockStep = want; }
      else if (now - flipAt >= 140) { flipAt = now; clockStep = (clockStep + 1) % 4; want = clockStep === 2 ? 2 : clockStep & 1; } else want = mouthLvl;
      if (rigOn(cur.who)) { rigMouth(cur.who, env, want, w.performance.now()); mouthLvl = want; }
      else if (want !== mouthLvl) { mouthLvl = want; applyVariant(); }
      mouthT = setTimeout(tick, env ? 50 : 140);
    })();
  }
  function scheduleBlink() {
    clearTimeout(blinkT);
    blinkT = setTimeout(function () {
      if (finished) return;
      if (!reduced() && baseIsNeutral() && !mouthLvl && variantUrl(cur.who, 'blink')) {
        blinking = true; applyVariant();
        setTimeout(function () { blinking = false; if (!finished) applyVariant(); }, 130);
      }
      scheduleBlink();
    }, 3000 + Math.random() * 3000);
  }
  function badge(who) { var b = el('div', 'stv-badge', (names[who] || who || '?').charAt(0).toUpperCase()); b.style.background = BADGE[who] || 'var(--orange,#ec8024)'; return b; }
  function layout() {
    killAllFx(); left.innerHTML = ''; right.innerHTML = ''; slots = {};
    var half = Math.ceil(cast.length / 2);
    cast.forEach(function (who, i) {
      var s = portraitFor(who); slots[who] = s; paint(s, who === 'axel' ? 'idle' : 'neutral');
      (i < half ? left : right).appendChild(s.wrap);
    });
  }
  layout();
  loadCastRigs();
  function speaker(who, pose) {
    Object.keys(slots).forEach(function (k) { slots[k].wrap.classList.toggle('on', k === who); });
    var s = slots[who];
    stopMouth(); blinking = false;
    if (s) { var want = pose || (who === 'axel' ? 'talk' : 'neutral'); if (s.pose !== want) paint(s, want); }
    cur = { who: who, pose: pose || null };
    bounce(s); rigGlance();
    if (who === 'axel') variantUrl('axel', 'talk'); else { variantUrl(who, 'talk'); variantUrl(who, 'half'); variantUrl(who, 'blink'); }
  }

  /* typewriter */
  var typing = null, full = '', pos = 0, speedMs = 24;
  function stopType() { if (typing) { clearInterval(typing); typing = null; } if (!voiceNow()) stopMouth(); }
  function showText(t, done) {
    stopType(); full = t; pos = 0; nextEl.style.visibility = 'hidden';
    if (reduced() || !t) { textEl.textContent = t; pos = t.length; nextEl.style.visibility = 'visible'; if (done) done(); return; }
    textEl.textContent = '';
    startMouth(); rigLineReact(cur.who, t);
    typing = setInterval(function () {
      pos += 1; textEl.textContent = full.slice(0, pos);
      if (pos >= full.length) { stopType(); rigNod(cur.who); nextEl.style.visibility = 'visible'; if (done) done(); }
    }, speedMs);
  }
  function completeText() { stopType(); textEl.textContent = full; pos = full.length; nextEl.style.visibility = 'visible'; }
  function isTyping() { return !!typing; }

  /* flow */
  var idx = -1, mode = 'line', finished = false, replyQueue = null, chosenOpt = null;
  function advance() {
    if (finished) return;
    if (mode === 'choice') return;
    if (isTyping()) { completeText(); return; }
    if (replyQueue) { var r = replyQueue.shift(); if (r) { try { Sfx.play('pageTurn'); } catch (e) {} sayLine(r); return; } replyQueue = null; return finish(false); }
    try { Sfx.play('pageTurn'); } catch (e) {}
    next();
  }
  /* v37 M26: Deb, Rob and Kez have no recordings (Axel is the only voiced character). Blip plus the caption/screen-reader event voice.js would have sent, with no manifest lookup. */
  function castLine(who, tx) {
    try {
      if (Sfx.stopVoice) Sfx.stopVoice();
      var vn = { deb: 'voiceDeb', rob: 'voiceRob', regular: 'voiceKez', kez: 'voiceKez' }[who];
      if (vn && !Sfx.isMuted()) Sfx.play(vn, { syllables: Math.min(8, 2 + Math.round(tx.split(/\s+/).filter(Boolean).length / 4)), seed: tx.length });
      if (tx && typeof w.dispatchEvent === 'function' && typeof w.CustomEvent === 'function') w.dispatchEvent(new w.CustomEvent('hygrow:voice', { detail: { type: 'line', who: nz(who), text: String(tx), voiced: false, dur: 0 } }));
    } catch (e) {}
  }
  function sayLine(l) {
    nameEl.textContent = names[l.who] || l.who || '';
    nameEl.style.background = BADGE[l.who] || '';
    speaker(l.who, l.pose);
    if (l.who !== 'axel') { castLine(l.who, l.text || ''); showText(l.text || ''); return; } /* v37 M26: the cast is never voiced, so no clip lookup for them; the text-timed rig mouth carries the line */
    try { var vn = { deb: 'voiceDeb', rob: 'voiceRob', regular: 'voiceKez', kez: 'voiceKez', axel: 'voiceAxel' }[l.who], tx = l.text || ''; if (vn && !Sfx.isMuted()) { if (!(w.Voice && w.Voice.say(l.who, tx))) Sfx.play(vn, { syllables: Math.min(8, 2 + Math.round(tx.split(/\s+/).filter(Boolean).length / 4)), seed: tx.length }); } else { if (Sfx.stopVoice) Sfx.stopVoice(); if (w.Voice && w.Voice.say) w.Voice.say(l.who, tx); /* muted: no clip, but the line still reaches the captions / screen-reader live node (a11y.js) */ } } catch (e) {}
    showText(l.text || '');
  }
  function next() {
    idx++;
    while (idx < items.length && !items[idx].text && (items[idx].bg || items[idx].cast)) {
      var c = items[idx];
      if (c.bg) setBg(c.bg);
      if (c.cast) { cast = c.cast.slice(); layout(); }
      idx++;
    }
    if (idx < items.length) return sayLine(items[idx]);
    if (scene.choice && scene.choice.options && scene.choice.options.length) return showChoice();
    finish(false);
  }
  function showChoice() {
    mode = 'choice'; stopType(); stopMouth();
    var ch = scene.choice;
    nameEl.textContent = ''; Object.keys(slots).forEach(function (k) { slots[k].wrap.classList.remove('on'); });
    textEl.textContent = ''; textEl.hidden = true; nextEl.style.display = 'none'; choicesEl.hidden = false; choicesEl.innerHTML = '';
    if (ch.prompt) { var pr = el('div', 'stv-prompt', ch.prompt); pr.id = 'stv-prompt'; choicesEl.appendChild(pr); choicesEl.setAttribute('aria-labelledby', 'stv-prompt'); } else choicesEl.removeAttribute('aria-labelledby');
    choicesEl.setAttribute('role', 'group'); try { if (ch.prompt && w.A11y && w.A11y.announce) w.A11y.announce(ch.prompt); } catch (e) {} /* v66 (round 15 keyboard m2): the question is the group's name and is read out */
    skipBtn.textContent = 'Skip';
    ch.options.forEach(function (o, i) {
      var b = el('button', 'stv-opt'); b.type = 'button'; b.setAttribute('aria-label', (i + 1) + '. ' + o.text); /* v66: read as 1. Lettuce, not 1Lettuce */
      var n = el('b', null, String(i + 1)); b.appendChild(n); b.appendChild(document.createTextNode(o.text));
      b.addEventListener('click', function (ev) { ev.stopPropagation(); choose(i); });
      choicesEl.appendChild(b);
    });
    var first = choicesEl.querySelector('.stv-opt'); if (first) try { first.focus({ preventScroll: true }); } catch (e) {}
  }
  function choose(i) {
    if (mode !== 'choice') return;
    var o = scene.choice.options[i]; if (!o) return;
    mode = 'line'; chosenOpt = o;
    result.choices.push({ prompt: scene.choice.prompt || '', index: i, text: o.text });
    var e = o.effect || {};
    if (e.mates) result.effects.mates += +e.mates || 0;
    if (e.flag) result.effects.flags.push(e.flag);
    if (e.lend) result.effects.lend = e.lend;
    choicesEl.hidden = true; textEl.hidden = false; nextEl.style.display = '';
    try { textEl.focus({ preventScroll: true }); } catch (e2) {} /* v65 (play-test #17 keyboard m1): the chosen button is gone, so focus went to the page body while the story was still open */
    var rep = (o.reply || []).filter(function (l) { return cond(l['if'], flags, mates); });
    if (rep.length) { replyQueue = rep.slice(); var r = replyQueue.shift(); sayLine(r); } else finish(false);
  }

  function finish(silent, skipped) {
    if (finished) return; finished = true; stopType(); stopMouth(); killAllFx(); clearTimeout(blinkT);
    document.removeEventListener('keydown', onKey, true);
    if (active === api) active = null;
    try { if (w.Sfx && w.Sfx.stopVoice) w.Sfx.stopVoice(); } catch (e) {} /* a skipped scene cuts the clip and its caption */
    result.skipped = !!skipped;
    state.seen[result.scene] = (state.seen[result.scene] || 0) + 1;
    result.effects.flags.forEach(function (f) { state.flags[f] = 1; });
    save();
    root.classList.add('out');
    var kill = function () {
      try { if (w.Scene && w.Scene.unmount) { w.Scene.unmount(bg); if (tall) w.Scene.unmount(bgs); } } catch (e) {}
      if (root.parentNode) root.parentNode.removeChild(root);
      try { /* v61 (play-test #15 #2): focus goes back only to something still on screen; a card that opened behind the story (the chapter's Harvest card) takes it instead */
        var md = document.querySelector('#harvest.show') || document.querySelector('.modal.show'), back = prev && prev.isConnected && prev.getClientRects().length && !(md && !md.contains(prev)) ? prev : null;
        if (!back && md) { back = md.querySelector('#harvest-title, h2, [tabindex="-1"]') || md.querySelector('button:not([disabled]), a[href]'); if (back && back.tagName !== 'BUTTON' && back.tagName !== 'A' && !back.hasAttribute('tabindex')) back.setAttribute('tabindex', '-1'); }
        if (back && back.focus) back.focus({ preventScroll: true });
      } catch (e) {}
    };
    if (reduced()) kill(); else setTimeout(kill, 210);
    if (!silent && opts.onDone) { try { opts.onDone(result); } catch (e) { if (w.console) console.error(e); } }
  }
  function skip() {
    if (finished) return;
    stopType(); stopMouth();
    /* skipping never makes a choice for the player: jump to the choice if there is one */
    if (mode !== 'choice' && !replyQueue && scene.choice && scene.choice.options && scene.choice.options.length) { idx = items.length; return showChoice(); }
    if (mode === 'choice') return;
    finish(false, true);
  }

  /* input */
  var holdT = null;
  box.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('.stv-opt')) return; advance(); });
  root.addEventListener('click', function (ev) { if (!(ev.target.closest && ev.target.closest('.stv-box,.stv-top,.stv-opt'))) advance(); });
  /* v37: the 900 ms press-and-hold skip is gone (a tremor skipped the scene); Skip is the button */
  skipBtn.addEventListener('click', function (ev) { ev.stopPropagation(); skip(); });
  function onKey(ev) {
    if (finished) return;
    var k = ev.key;
    if (mode === 'choice' && /^[1-9]$/.test(k)) { ev.preventDefault(); ev.stopPropagation(); choose(+k - 1); return; }
    if (k === ' ' || k === 'Enter' || k === 'ArrowRight') {
      var t = ev.target;
      if (mode === 'choice' || (t && t.tagName === 'BUTTON' && t !== skipBtn)) { if (t && t.classList && t.classList.contains('stv-opt')) return; }
      if (t === skipBtn) return;
      ev.preventDefault(); ev.stopPropagation(); advance();
    } else if (k === 'Escape') { ev.preventDefault(); ev.stopPropagation(); if (mode === 'choice') return; advance(); } /* v37: Escape reads on; only the Skip button skips */
    else if (k === 'Tab') { /* v61 (play-test #15 #5): Tab stays inside the story (text box, Skip, the choices); it used to reach the skip-bar links behind the overlay */
      var fs = [textEl, skipBtn].concat([].slice.call(root.querySelectorAll('.stv-opt'))).filter(function (e) { return e && e.getClientRects().length && !e.disabled; });
      if (!fs.length) return;
      var i = fs.indexOf(document.activeElement); ev.preventDefault(); ev.stopPropagation();
      var n = i < 0 ? 0 : (i + (ev.shiftKey ? fs.length - 1 : 1)) % fs.length;
      try { fs[n].focus({ preventScroll: true }); } catch (e2) {}
    }
  }
  document.addEventListener('keydown', onKey, true);
  setTimeout(function () { try { if (!root.contains(document.activeElement) || document.activeElement === skipBtn) textEl.focus({ preventScroll: true }); } catch (e) {} }, 60); /* v37 */

  var api = { finish: finish, el: root, skip: skip };
  active = api;
  scheduleBlink();
  next();
  return api;
}

w.Story = {
  play: play,
  isActive: function () { return !!active; },
  stop: function () { if (active) active.finish(true); },
  state: function () { return JSON.parse(JSON.stringify(state)); },
  seen: function (id) { return (state.seen[id] || 0) > 0; },
  hasFlag: function (f) { return !!state.flags[f]; },
  setFlag: function (f) { if (f) { state.flags[f] = 1; save(); } },
  load: load,
  toJSON: function () { return JSON.parse(JSON.stringify(state)); },
  reset: function () { state = { flags: {}, seen: {} }; save(); },
  cond: cond
};
})(window);
