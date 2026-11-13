/* Scene: layered-still painted scenes with parallax + light motion + procedural ambience + time-of-day variants. window.Scene
 *
 * Public API
 *   Scene.mount(el, name, opts)   opts.aspect (false = fill el), opts.hour (0..24, fractional ok: mounts the resolved variant),
 *                                 opts.alt (true = use the scene's second day plate "<base>_b" when scenes.json has one; dusk/night still use the base's variants;
 *                                 the choice sticks for the mounted stage across setHour)
 *   Scene.setHour(el, hour)       swap a mounted scene to the variant for this hour (1.5 s cross-fade, hard swap under reduced motion)
 *   Scene.resolve(name, hour, cfg, opts) pure: variant name for a clock hour; opts.alt picks "<base>_b" for the plain day plate (no hour counts as day)
 *   Scene.unmount(el), Scene.preload(names), Scene.variant(el)
 * Ambience fx types (art/scenes.json "motion" entries, x/y/w/h are fractions of the stage):
 *   bubbles, twinkle (existing), glow, fan, dust, drip, steam, rays, clouds
 * Budget: at most Scene._budget (60) animated nodes per mounted scene (3 layers + fx); extra fx are clamped away.
 * Per-frame writes are transform/opacity only; one shared rAF; no CSS filter. */
(function () {
  'use strict';
  var cs = document.currentScript;
  var BASE = (cs && cs.src ? cs.src.replace(/[^\/]*$/, '') : '') + 'art/';
  var LAYERS = ['back', 'mid', 'front'];
  var PAR = { back: 12, mid: 18, front: 24 };
  var BUDGET = 60;
  var FADE_MS = 1500;
  var ALIAS = { shopfront: 'shopfront_day' };
  var SUFFIX = /_(night|dusk|b)$/; // _b = second (alt) day plate
  var MOTION = { drift: 1, sway: 1, flicker: 1 };
  var mounted = new Map();
  var cfgP = null, cfg = {}, cfgOk = false;
  var bad = {};
  var px = 0, py = 0, tx = 0, ty = 0;
  var raf = 0, inTick = false, listening = false; /* v37: inTick stops kick() starting a second loop from inside a frame */
  var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');

  function reduced() { return !!(rm && rm.matches); }
  function loadCfg() {
    if (!cfgP) cfgP = fetch(BASE + 'scenes.json').then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { cfg = j || {}; cfgOk = true; return cfg; }).catch(function () { cfgOk = true; return {}; });
    return cfgP;
  }
  function onPointer(e) {
    tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2;
  }
  function onOrient(e) {
    if (e.gamma == null) return;
    tx = Math.max(-1, Math.min(1, e.gamma / 30)); ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  }
  function listen() {
    if (listening) return; listening = true;
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('deviceorientation', onOrient, { passive: true });
    document.addEventListener('visibilitychange', kick);
  }
  function unlisten() {
    if (!listening) return; listening = false;
    removeEventListener('pointermove', onPointer);
    removeEventListener('deviceorientation', onOrient);
    document.removeEventListener('visibilitychange', kick);
  }
  function kick() { if (!raf && !inTick && mounted.size && !document.hidden) raf = requestAnimationFrame(tick); } /* v37: idempotent, one loop handle */

  /* ------------------------------------------------------------ time of day (pure) */
  function kindOf(key, e) { return (e && e.time) || (SUFFIX.exec(key) || [])[1] || null; }
  function isVariantName(name) {
    var e = cfg && cfg[name];
    return !!((e && e.variant_of && e.variant_of !== name) || SUFFIX.test(name));
  }
  /* base scene of a (possibly variant) name: variant_of wins, else strip _night/_dusk (shopfront_dusk -> shopfront -> shopfront_day) */
  function baseOf(name, c) {
    var e = c && c[name];
    if (e && e.variant_of && e.variant_of !== name) return e.variant_of;
    var m = SUFFIX.exec(name);
    if (!m) return name;
    var b = name.slice(0, -m[0].length);
    if (ALIAS[b] && !(c && c[b])) b = ALIAS[b];
    else if (c && !c[b] && c[b + '_day']) b += '_day';
    return b;
  }
  function findVariant(base, kind, c) {
    var keys = Object.keys(c), i, k, e;
    for (i = 0; i < keys.length; i++) {
      k = keys[i]; e = c[k];
      if (k === base || !e || e.variant_of !== base) continue;
      if (kindOf(k, e) === kind) return k;
    }
    var stem = base.replace(/_day$/, '');
    var cands = [base + '_' + kind, stem + '_' + kind];
    for (i = 0; i < cands.length; i++) {
      k = cands[i]; e = c[k];
      if (k !== base && e && (!e.variant_of || e.variant_of === base)) return k;
    }
    return null;
  }
  function variantsOf(base, c) {
    return Object.keys(c).filter(function (k) { return k !== base && baseOf(k, c) === base; });
  }
  /* hour < 6 or >= 20 -> <base>_night if configured; 17 <= hour < 20 -> <base>_dusk if configured; otherwise the base scene.
     Missing cfg -> name unchanged; unknown name -> unchanged; legacy alias 'shopfront' -> 'shopfront_day' (when cfg is given). */
  function resolve(name, hour, c, opts) {
    if (!c || typeof c !== 'object') return name;
    name = ALIAS[name] || name;
    if (!c[name]) return name;
    var alt = !!(opts && opts.alt);
    var h = Number(hour), noHour = hour == null || !isFinite(h);
    if (noHour && !alt) return name;
    var base = baseOf(name, c);
    if (!c[base]) return name;
    var kind = 'day';
    if (!noHour) { h = ((h % 24) + 24) % 24; kind = (h < 6 || h >= 20) ? 'night' : (h >= 17 ? 'dusk' : 'day'); }
    if (kind === 'day') {
      if (c[name] && c[name].alt) return name;                       // an alt plate asked for by name stays itself on a day hour
      if (alt && c[base + '_b']) return base + '_b';                  // second day plate
      return noHour ? name : base;
    }
    return findVariant(base, kind, c) || base;
  }
  function pick(s, hour) {
    var t = resolve(s.req, hour, cfg, s.alt ? { alt: true } : null);
    if (bad[t]) t = baseOf(t, cfg);
    return t;
  }

  /* ------------------------------------------------------------ per-frame */
  function tick(t) {
    raf = 0;
    if (document.hidden || !mounted.size) return;
    inTick = true; /* v37 */
    px += (tx - px) * 0.08; py += (ty - py) * 0.08;
    var red = reduced();
    mounted.forEach(function (s) {
      stepSwap(s, t, red);
      if (s.cur) frameStack(s.cur, t, red, !s.swap);
      if (s.swap) frameStack(s.swap.to, t, red, true);
    });
    inTick = false; /* v37 */
    raf = requestAnimationFrame(tick);
  }

  /* v58: the smallest scale (never under the old 1.06) that keeps a w x h layer covering its box when it moves up to ax / ay px and turns up to rd degrees */
  function overscan(w, h, ax, ay, rd) {
    if (!w || !h) return 1.06;
    var th = Math.abs(rd) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
    var sx = c + (h / w) * sn + 2 * (ax + 2) / w, sy = c + (w / h) * sn + 2 * (ay + 2) / h;
    return Math.max(1.06, sx, sy);
  }
  function frameStack(st, t, red, withFx) {
    LAYERS.forEach(function (n) {
      var L = st.layers[n]; if (!L) return;
      var m = st.m[n];
      var x = 0, y = 0, rot = 0, op = 1;
      /* v58 (critic round 9 #2): the layers used a fixed 6 % overscan, about 11 px on a phone, while drift (20 px) plus parallax (up to 24 px)
         moved them further, so a dark edge and a layer seam showed while the plate panned. The motion now scales with the box width
         (full at 1200 px and up) and the overscan is sized to cover it. The box size is re-read every 2 s, not every frame. */
      if (!L._wt || t - L._wt > 2000) { L._wt = t; L._w = L.offsetWidth || 0; L._h = L.offsetHeight || 0; }
      var k = L._w ? Math.min(1, L._w / 1200) : 1, ampX = red ? 0 : PAR[n] * k, ampR = 0;
      if (!red || n === 'mid') {
        if (!red) { x = px * PAR[n] * k; y = py * PAR[n] * 0.5 * k; }
        m.forEach(function (e) {
          if (e.type === 'drift') { x += Math.sin(t / e.period * 6.2832 + e.ph) * e.px * k; ampX += e.px * k; }
          else if (e.type === 'sway') { rot += Math.sin(t / e.period * 6.2832 + e.ph) * e.deg; ampR += e.deg; }
          else if (e.type === 'flicker') {
            if (t > e.next) { e.val = 1 - Math.random() * e.rate; e.next = t + 60 + Math.random() * 180; }
            op *= e.val;
          }
        });
      }
      if (red && n !== 'mid') { L.style.transform = ''; L.style.opacity = ''; return; }
      L.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + overscan(L._w, L._h, ampX, ampX * 0.5, ampR).toFixed(4) + ') rotate(' + rot.toFixed(3) + 'deg)';
      L.style.opacity = op.toFixed(3);
    });
    if (red) {
      if (st.built && !st.hid) { st.hostB.style.display = 'none'; st.hostF.style.display = 'none'; st.hid = true; }
      return;
    }
    if (st.hid) { st.hostB.style.display = ''; st.hostF.style.display = ''; st.hid = false; }
    if (!st.built && st.entries) buildFx(st);
    if (withFx) st.fx.forEach(function (f) { f(t); });
  }

  /* ------------------------------------------------------------ cross-fade */
  function stepSwap(s, t, red) {
    var w = s.swap; if (!w) return;
    if (w.born == null) w.born = t;
    var to = w.to;
    if (!to.ready && t - w.born > 8000) to.ready = true; // never block the swap forever on a slow image
    if (!to.ready) return;
    if (w.start == null) w.start = t;
    var p = (red || !FADE_MS) ? 1 : Math.min(1, (t - w.start) / FADE_MS);
    var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    to.wrap.style.opacity = e.toFixed(3);
    if (p >= 1) finishSwap(s);
  }
  function finishSwap(s) {
    var w = s.swap; if (!w) return;
    s.swap = null;
    w.to.wrap.style.opacity = '';
    killStack(w.from);
    s.cur = w.to; s.name = w.to.name;
    s.stage.dataset.scene = s.name;
    if (s.pending != null) { var h = s.pending; s.pending = null; Scene.setHour(s.el, h); }
  }
  function killStack(st) {
    if (!st) return;
    st.dead = true;
    if (st.wrap.parentNode) st.wrap.parentNode.removeChild(st.wrap);
  }
  /* a variant whose art is missing: fall back to the base scene so the box is never blank */
  function variantFailed(s, st) {
    if (st.dead || st.handled) return;
    st.handled = true; bad[st.name] = true;
    if (mounted.get(s.el) !== s) return;
    if (s.swap && s.swap.to === st) {
      s.swap = null; killStack(st);
      if (s.pending != null) { var h = s.pending; s.pending = null; Scene.setHour(s.el, h); }
      return;
    }
    if (s.cur !== st) return;
    var base = baseOf(st.name, cfg);
    if (base === st.name) return;
    var nb = buildStack(s, base);
    s.stage.appendChild(nb.wrap);
    killStack(st);
    if (s.swap && s.swap.from === st) s.swap.from = nb;
    s.cur = nb; s.name = base;
    s.stage.dataset.scene = base;
    initMotion(s, nb);
  }

  /* ------------------------------------------------------------ stacks (layers + fx hosts) */
  function mkLayer(src, z, onload, onerror) {
    var im = new Image();
    im.alt = ''; im.draggable = false; im.decoding = 'async';
    im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;will-change:transform,opacity;z-index:' + z;
    im.addEventListener('error', function () { im.style.display = 'none'; if (onerror) onerror(); });
    if (onload) im.addEventListener('load', onload);
    im.src = src;
    return im;
  }
  function mkHost(z) {
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:' + z;
    return d;
  }
  function buildStack(s, name) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;z-index:0;isolation:isolate';
    var st = { name: name, wrap: wrap, layers: {}, m: { back: [], mid: [], front: [] }, fx: [], entries: null, built: false, hid: false,
      dead: false, ready: false, handled: false, variant: isVariantName(name), hostB: mkHost(1), hostF: mkHost(5) };
    LAYERS.forEach(function (n, i) {
      var isBack = n === 'back';
      var im = mkLayer(BASE + name + '/' + n + '.webp', i + 1,
        isBack ? function () { st.ready = true; } : null,
        isBack ? function () { if (st.variant) variantFailed(s, st); } : null);
      st.layers[n] = im;
      wrap.appendChild(im);
      if (isBack) wrap.appendChild(st.hostB); // sky-plane fx (clouds) sit above back, below mid
      if (isBack && im.complete && im.naturalWidth > 0) st.ready = true;
    });
    wrap.appendChild(st.hostF);
    return st;
  }
  function applyMotion(st) {
    var ms = ((cfg[st.name] || {}).motion) || [];
    st.entries = [];
    ms.forEach(function (e) {
      if (!e) return;
      if (MOTION[e.type]) {
        var d = Object.assign({ layer: 'mid', ph: Math.random() * 6.28, next: 0, val: 1, period: 8000, px: 20, deg: 0.8, rate: 0.3 }, e);
        (st.m[d.layer] || st.m.mid).push(d);
      } else st.entries.push(e);
    });
  }
  function initMotion(s, st) {
    if (cfgOk) { applyMotion(st); return; }
    loadCfg().then(function () { if (!st.dead && mounted.get(s.el) === s) applyMotion(st); });
  }
  function startStack(s, name) {
    var st = buildStack(s, name);
    s.stage.appendChild(st.wrap);
    s.cur = st; s.name = name;
    s.stage.dataset.scene = name;
    initMotion(s, st);
    return st;
  }
  function startSwap(s, name) {
    var st = buildStack(s, name);
    st.wrap.style.opacity = '0';
    s.stage.appendChild(st.wrap);
    s.swap = { to: st, from: s.cur, born: null, start: null };
    initMotion(s, st);
    kick();
  }

  /* ------------------------------------------------------------ ambience fx */
  function num(v, d) { return v == null || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rgb(c, d) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '')) || /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(d);
    var h = m[1]; if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function geo(e) {
    return { x: num(e.x, 0), y: num(e.y, 0), w: num(e.w, 1), h: num(e.h, 1) };
  }
  function place(g) {
    return 'left:' + (g.x * 100).toFixed(2) + '%;top:' + (g.y * 100).toFixed(2) + '%;width:' + (g.w * 100).toFixed(2) + '%;height:' + (g.h * 100).toFixed(2) + '%';
  }
  function node(tag, css, host) {
    var d = document.createElement(tag);
    d.style.cssText = 'position:absolute;pointer-events:none;' + css;
    host.appendChild(d);
    return d;
  }
  function hostFor(st, e, behindDefault) {
    var b = e.behind == null ? behindDefault : !!e.behind;
    return b ? st.hostB : st.hostF;
  }

  var FX = {
    bubbles: {
      cost: function () { return 6; },
      make: function (st, e, n) {
        var g = geo(e), host = hostFor(st, e, false);
        var box = node('div', 'overflow:hidden;' + place(g), host);
        var list = [];
        for (var i = 0; i < n; i++) {
          var sz = 4 + Math.random() * 6, x = Math.random();
          var b = node('i', 'border-radius:50%;border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.18);will-change:transform,opacity;top:0;left:' +
            (x * 90).toFixed(1) + '%;width:' + sz + 'px;height:' + sz + 'px', box);
          list.push({ el: b, off: Math.random(), sp: 0.00006 + Math.random() * 0.00006, x: x });
        }
        st.fx.push(function (t) {
          list.forEach(function (o) {
            var p = (o.off + t * o.sp) % 1;
            o.el.style.opacity = Math.sin(p * Math.PI).toFixed(2);
            o.el.style.transform = 'translate3d(' + (Math.sin(p * 9 + o.x * 6) * 3).toFixed(1) + 'px,' + ((1 - p) * g.h * 100).toFixed(2) + 'cqh,0)';
          });
        });
      }
    },
    twinkle: {
      cost: function (e) { return Math.max(0, Math.round(num(e.count, 12))); },
      make: function (st, e, n) {
        var host = hostFor(st, e, false);
        var x0 = num(e.x0, 0), x1 = num(e.x1, 1), y0 = num(e.y0, 0), y1 = num(e.y1, 1);
        var dots = [];
        for (var k = 0; k < n; k++) {
          var d = node('i', 'border-radius:50%;width:3px;height:3px;background:#ffe9b0;box-shadow:0 0 6px 2px rgba(236,128,36,.6);will-change:opacity;left:' +
            ((x0 + Math.random() * (x1 - x0)) * 100).toFixed(1) + '%;top:' + ((y0 + Math.random() * (y1 - y0)) * 100).toFixed(1) + '%', host);
          dots.push({ el: d, ph: Math.random() * 6.28, sp: 0.001 + Math.random() * 0.002 });
        }
        st.fx.push(function (t) {
          dots.forEach(function (o) { o.el.style.opacity = (0.5 + 0.5 * Math.sin(t * o.sp + o.ph)).toFixed(2); });
        });
      }
    },
    /* soft radial light pool that breathes (3-6 s, +-15%) and can flicker */
    glow: {
      cost: function () { return 1; },
      make: function (st, e) {
        var g = geo(e), host = hostFor(st, e, false), c = rgb(e.color, '#ffe9b0');
        var base = clamp(num(e.alpha, 0.7), 0, 1), fl = clamp(num(e.flicker, 0), 0, 1);
        var period = num(e.period, 3000 + Math.random() * 3000), ph = Math.random() * 6.28;
        var el = node('div', place(g) + ';border-radius:50%;opacity:0;will-change:opacity;' +
          (e.blend === 'normal' ? '' : 'mix-blend-mode:screen;') +
          'background:radial-gradient(closest-side,' + rgba(c, 0.9) + ' 0%,' + rgba(c, 0.45) + ' 42%,' + rgba(c, 0) + ' 100%)', host);
        var fv = 1, fnext = 0;
        st.fx.push(function (t) {
          if (fl && t > fnext) { fv = 1 - Math.random() * fl * 0.5; fnext = t + 60 + Math.random() * 200; }
          var o = base * (1 + 0.15 * Math.sin(t / period * 6.2832 + ph)) * (fl ? fv : 1);
          el.style.opacity = clamp(o, 0, 1).toFixed(3);
        });
      }
    },
    /* spinning 4-blade silhouette (rpm, default 40) + optional faint air wash streak */
    fan: {
      cost: function (e) { return e.wash ? 2 : 1; },
      make: function (st, e) {
        var g = geo(e), host = hostFor(st, e, false), rpm = num(e.rpm, 40);
        var blade = '<path d="M50 50C40 35 41 14 50 6C59 14 60 35 50 50Z" transform="rotate(@ 50 50)"/>';
        var svg = '<svg viewBox="0 0 100 100" width="100%" height="100%" style="display:block"><g fill="#2c3136" stroke="#161a1d" stroke-width="1">' +
          [0, 90, 180, 270].map(function (a) { return blade.replace('@', a); }).join('') +
          '</g><circle cx="50" cy="50" r="9" fill="#a3abb3" stroke="#161a1d" stroke-width="1"/></svg>';
        var el = node('div', place(g) + ';will-change:transform', host);
        el.innerHTML = svg;
        var wash = null, dir = e.washDir || 'down', wph = Math.random() * 6.28, wdx = 0, wdy = 0;
        if (e.wash) {
          var wg, origin;
          if (dir === 'left') { wg = { x: g.x - g.w * 1.8, y: g.y + g.h * 0.1, w: g.w * 1.8, h: g.h * 0.8 }; origin = '100% 50%'; wdx = -1; }
          else if (dir === 'right') { wg = { x: g.x + g.w, y: g.y + g.h * 0.1, w: g.w * 1.8, h: g.h * 0.8 }; origin = '0% 50%'; wdx = 1; }
          else if (dir === 'up') { wg = { x: g.x + g.w * 0.1, y: g.y - g.h * 1.8, w: g.w * 0.8, h: g.h * 1.8 }; origin = '50% 100%'; wdy = -1; }
          else { wg = { x: g.x + g.w * 0.1, y: g.y + g.h, w: g.w * 0.8, h: g.h * 1.8 }; origin = '50% 0%'; wdy = 1; }
          wash = node('div', place(wg) + ';opacity:0;will-change:transform,opacity;background:radial-gradient(ellipse at ' + origin + ',rgba(255,255,255,.28),rgba(255,255,255,0) 72%)', host);
        }
        var wa = clamp(num(e.wash, 1) === 1 ? 1 : num(e.wash, 1), 0.1, 1);
        st.fx.push(function (t) {
          el.style.transform = 'rotate(' + (((t / 60000) * rpm * 360) % 360).toFixed(1) + 'deg)';
          if (wash) {
            var k = 0.5 + 0.5 * Math.sin(t / 1700 * 6.2832 + wph);
            wash.style.opacity = (wa * (0.25 + 0.75 * k)).toFixed(3);
            wash.style.transform = 'translate3d(' + (wdx * k * 6).toFixed(1) + 'px,' + (wdy * k * 6).toFixed(1) + 'px,0)';
          }
        });
      }
    },
    /* 10-18 tiny warm motes drifting up and sideways with a sine wobble, respawning at the bottom */
    dust: {
      cost: function (e) { return clamp(Math.round(num(e.count, 14)), 10, 18); },
      make: function (st, e, n) {
        var g = geo(e), host = hostFor(st, e, false), c = rgb(e.color, '#fff4dc'), list = [];
        for (var i = 0; i < n; i++) {
          var sz = 2 + Math.random();
          var d = node('i', 'border-radius:50%;opacity:0;will-change:transform,opacity;left:' + (g.x * 100).toFixed(2) + '%;top:' + (g.y * 100).toFixed(2) + '%;width:' + sz.toFixed(1) +
            'px;height:' + sz.toFixed(1) + 'px;background:' + rgba(c, 1), host);
          list.push({ el: d, life: 16000 + Math.random() * 16000, off: Math.random(), cyc: null, x0: 0, drift: 0, pk: 0.5, amp: 0.006, ph: 0 });
        }
        st.fx.push(function (t) {
          list.forEach(function (o) {
            var c2 = t / o.life + o.off, cy = Math.floor(c2), u = c2 - cy;
            if (cy !== o.cyc) {
              o.cyc = cy; o.x0 = 0.05 + Math.random() * 0.9; o.drift = (Math.random() - 0.3) * 0.2;
              o.pk = 0.3 + Math.random() * 0.4; o.amp = 0.004 + Math.random() * 0.008; o.ph = Math.random() * 6.28;
            }
            var env = Math.min(1, u / 0.12, (1 - u) / 0.12);
            var X = ((o.x0 + o.drift * u) * g.w + Math.sin(u * 11 + o.ph) * o.amp) * 100, Y = (1 - u) * g.h * 100;
            o.el.style.opacity = (o.pk * env).toFixed(3);
            o.el.style.transform = 'translate3d(' + X.toFixed(2) + 'cqw,' + Y.toFixed(2) + 'cqh,0)';
          });
        });
      }
    },
    /* ripple ring expanding from 0 to the box width every 2.5-4 s at a random x; two rings max */
    drip: {
      cost: function () { return 2; },
      make: function (st, e, n) {
        var g = geo(e), host = hostFor(st, e, false), squash = num(e.squash, 0.32), life = 2800, rings = [];
        for (var i = 0; i < Math.min(2, n); i++) {
          var r = node('div', 'left:0;top:0;width:' + (g.w * 100).toFixed(2) + '%;aspect-ratio:1 / ' + squash + ';box-sizing:border-box;border:1px solid rgba(255,255,255,.75);border-radius:50%;opacity:0;will-change:transform,opacity', host);
          rings.push({ el: r, t0: null, cx: 0, cy: 0 });
        }
        var next = null;
        st.fx.push(function (t) {
          if (next == null) next = t + 400 + Math.random() * 1200;
          if (t >= next) {
            for (var j = 0; j < rings.length; j++) if (rings[j].t0 == null) {
              rings[j].t0 = t; rings[j].cx = (g.x + Math.random() * g.w) * 100; rings[j].cy = (g.y + g.h * (0.3 + 0.4 * Math.random())) * 100; break;
            }
            next = t + 2500 + Math.random() * 1500;
          }
          rings.forEach(function (r) {
            if (r.t0 == null) return;
            var p = (t - r.t0) / life;
            if (p >= 1) { r.t0 = null; r.el.style.opacity = '0'; return; }
            var s = Math.max(0.02, 1 - (1 - p) * (1 - p));
            r.el.style.opacity = ((1 - p) * 0.8).toFixed(3);
            r.el.style.transform = 'translate3d(' + r.cx.toFixed(2) + 'cqw,' + r.cy.toFixed(2) + 'cqh,0) translate(-50%,-50%) scale(' + s.toFixed(3) + ')';
          });
        });
      }
    },
    /* 4-6 soft white blobs rising, expanding and fading; slow */
    steam: {
      cost: function (e) { return clamp(Math.round(num(e.count, 5)), 4, 6); },
      make: function (st, e, n) {
        var g = geo(e), host = hostFor(st, e, false), alpha = clamp(num(e.alpha, 0.5), 0, 1), size = num(e.size, 1), list = [];
        for (var i = 0; i < n; i++) {
          var sz = (8 + Math.random() * 8) * size;
          var b = node('i', 'border-radius:50%;opacity:0;will-change:transform,opacity;left:' + (g.x * 100).toFixed(2) + '%;top:' + (g.y * 100).toFixed(2) + '%;width:' + sz.toFixed(1) +
            'px;height:' + sz.toFixed(1) + 'px;background:radial-gradient(circle,rgba(255,255,255,.75),rgba(255,255,255,0) 70%)', host);
          list.push({ el: b, life: 7000 + Math.random() * 5000, off: Math.random(), cyc: null, x0: 0, ph: 0 });
        }
        st.fx.push(function (t) {
          list.forEach(function (o) {
            var c = t / o.life + o.off, cy = Math.floor(c), u = c - cy;
            if (cy !== o.cyc) { o.cyc = cy; o.x0 = Math.random(); o.ph = Math.random() * 6.28; }
            var X = (o.x0 * g.w + Math.sin(u * 5 + o.ph) * 0.006) * 100, Y = (1 - u) * g.h * 100;
            o.el.style.opacity = (alpha * Math.sin(u * Math.PI)).toFixed(3);
            o.el.style.transform = 'translate3d(' + X.toFixed(2) + 'cqw,' + Y.toFixed(2) + 'cqh,0) scale(' + (1 + u * 1.6).toFixed(2) + ')';
          });
        });
      }
    },
    /* 2-3 long translucent diagonal bands that sweep +-6 px and breathe */
    rays: {
      cost: function (e) { return clamp(Math.round(num(e.count, 3)), 2, 3); },
      make: function (st, e, n) {
        var g = geo(e), host = hostFor(st, e, false), c = rgb(e.color, '#fff3c4'), alpha = clamp(num(e.alpha, 0.28), 0, 1);
        var angle = num(e.angle, 16), sway = num(e.sway, 6), bw = g.w / n * 0.55, list = [];
        for (var i = 0; i < n; i++) {
          var cx = g.x + g.w * (i + 0.5) / n, wv = bw * (0.8 + Math.random() * 0.4);
          var b = node('div', 'left:' + ((cx - wv / 2) * 100).toFixed(2) + '%;top:' + (g.y * 100).toFixed(2) + '%;width:' + (wv * 100).toFixed(2) + '%;height:' + (g.h * 100).toFixed(2) +
            '%;opacity:0;transform-origin:50% 0;will-change:transform,opacity;background:linear-gradient(90deg,' + rgba(c, 0) + ',' + rgba(c, 0.9) + ',' + rgba(c, 0) + ')', host);
          list.push({ el: b, ph: Math.random() * 6.28, period: num(e.period, 7000 + Math.random() * 5000) });
        }
        st.fx.push(function (t) {
          list.forEach(function (o) {
            var s = Math.sin(t / o.period * 6.2832 + o.ph);
            o.el.style.opacity = (alpha * (0.7 + 0.3 * Math.sin(t / (o.period * 0.7) * 6.2832 + o.ph * 1.7))).toFixed(3);
            o.el.style.transform = 'translate3d(' + (s * sway).toFixed(1) + 'px,0,0) rotate(' + angle + 'deg)';
          });
        });
      }
    },
    /* 3-4 soft clouds drifting across a band over 40-90 s, wrapping; sit behind the mid layer, slower parallax than back */
    clouds: {
      cost: function (e) { return clamp(Math.round(num(e.count, 3)), 3, 4); },
      make: function (st, e, n) {
        var g = geo(e), host = hostFor(st, e, true), alpha = num(e.alpha, 0.45), size = num(e.size, 1), list = [];
        function blob(cx, cy, rx, ry) {
          return 'radial-gradient(ellipse ' + rx + '% ' + ry + '% at ' + cx + '% ' + cy + '%,rgba(255,255,255,.95) 0%,rgba(255,255,255,.55) 45%,rgba(255,255,255,0) 100%)';
        }
        for (var i = 0; i < n; i++) {
          var cw = (0.14 + Math.random() * 0.12) * size, j = function (v) { return (v + (Math.random() - 0.5) * 8).toFixed(0); };
          var bg = [blob(j(26), j(64), 36, 52), blob(j(50), j(42), 34, 70), blob(j(74), j(62), 32, 50)];
          if (Math.random() < 0.5) bg.push(blob(j(50), 78, 44, 26));
          var el = node('div', 'left:0;top:' + ((g.y + Math.random() * g.h) * 100).toFixed(2) + '%;width:' + (cw * 100).toFixed(2) + '%;aspect-ratio:3 / 1;opacity:0;will-change:transform,opacity;background:' + bg.join(','), host);
          list.push({ el: el, cw: cw * 100, op: alpha * (0.78 + Math.random() * 0.44), off: i / n + Math.random() * 0.2,
            period: num(e.period, 40000 + Math.random() * 50000) });
        }
        st.fx.push(function (t) {
          var par = px * PAR.back * 0.7;
          list.forEach(function (o) {
            var c = t / o.period + o.off, u = c - Math.floor(c);
            var lo = g.x * 100 - o.cw, hi = (g.x + g.w) * 100;
            var X = lo + u * (hi - lo), env = Math.min(1, u / 0.1, (1 - u) / 0.1);
            o.el.style.opacity = (o.op * env).toFixed(3);
            o.el.style.transform = 'translate3d(calc(' + X.toFixed(2) + 'cqw + ' + par.toFixed(1) + 'px),0,0)';
          });
        });
      }
    }
  };

  function fxCost(e) { var f = e && FX[e.type]; return f ? f.cost(e) : 0; }
  /* clamp the configured fx to the node budget (layers count too); returns [{e, n}] */
  function plan(entries, budget) {
    var room = (budget == null ? BUDGET : budget) - LAYERS.length, out = [];
    (entries || []).forEach(function (e) {
      if (!e || !FX[e.type]) return;
      var n = Math.min(fxCost(e), room);
      if (n <= 0) return;
      if (n < fxCost(e) && (e.type !== 'twinkle' && e.type !== 'dust' && e.type !== 'steam' && e.type !== 'rays' && e.type !== 'clouds')) return; // fixed-size fx are all or nothing
      out.push({ e: e, n: n }); room -= n;
    });
    return out;
  }
  function countNodes(entries) {
    return LAYERS.length + plan(entries, 1e9).reduce(function (a, p) { return a + p.n; }, 0);
  }
  function buildFx(st) {
    st.built = true;
    plan(st.entries, BUDGET).forEach(function (p) { FX[p.e.type].make(st, p.e, p.n); });
  }

  /* ------------------------------------------------------------ public API */
  var Scene = {
    _overscan: overscan, /* v58: exposed for tests/v58.test.js */
    mount: function (el, name, opts) {
      opts = opts || {};
      if (!el) return null;
      name = ALIAS[name] || name;
      if (mounted.has(el)) Scene.unmount(el);
      var stage = document.createElement('div');
      stage.className = 'scene-stage';
      stage.dataset.scene = name;
      stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#080808;container-type:size';
      if (opts.aspect !== false) {
        stage.style.aspectRatio = '16 / 9';
        stage.style.inset = 'auto'; stage.style.position = 'relative'; stage.style.width = '100%';
        if (getComputedStyle(el).position === 'static' && el.clientHeight > 0) { stage.style.position = 'absolute'; stage.style.inset = '0'; stage.style.aspectRatio = ''; }
      }
      var hasHour = opts.hour != null && isFinite(opts.hour);
      var alt = !!opts.alt;
      var s = { el: el, name: name, req: name, hour: hasHour ? +opts.hour : null, alt: alt, stage: stage, cur: null, swap: null, pending: null };
      el.appendChild(stage);
      mounted.set(el, s);
      if ((hasHour || alt) && !cfgOk) {
        // the variant (or alt plate) needs scenes.json: build the stack once it has arrived (stage stays dark for that moment)
        loadCfg().then(function () { if (mounted.get(el) === s && !s.cur) startStack(s, pick(s, s.hour)); });
      } else startStack(s, (hasHour || alt) ? pick(s, s.hour) : name);
      listen(); kick();
      return s;
    },
    setHour: function (el, hour) {
      var s = mounted.get(el);
      if (!s || hour == null || !isFinite(hour)) return null;
      s.hour = +hour;
      if (!cfgOk) {
        loadCfg().then(function () { if (mounted.get(el) === s && s.cur) Scene.setHour(el, s.hour); });
        return null;
      }
      if (!s.cur) return null; // mount is still waiting for scenes.json and will use s.hour
      var target = pick(s, hour);
      if (s.swap) {
        s.pending = target === s.swap.to.name ? null : hour; // one swap in flight; the latest hour wins when it ends
        return s.swap.to.name;
      }
      if (target === s.cur.name) return target;
      startSwap(s, target);
      return target;
    },
    variant: function (el) { var s = mounted.get(el); return s && s.cur ? s.cur.name : null; },
    resolve: resolve,
    unmount: function (el) {
      var s = mounted.get(el); if (!s) return;
      mounted.delete(el);
      if (s.cur) s.cur.dead = true;
      if (s.swap) { s.swap.to.dead = true; s.swap.from.dead = true; }
      if (s.stage.parentNode) s.stage.parentNode.removeChild(s.stage);
      if (!mounted.size) { unlisten(); if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    },
    /* preloads the three layers of each name now and, once scenes.json is in, the night/dusk variants of the same scene */
    preload: function (names) {
      var seen = {};
      function load(n) {
        if (seen[n]) return; seen[n] = 1;
        LAYERS.forEach(function (l) { var i = new Image(); i.src = BASE + n + '/' + l + '.webp'; });
      }
      names = names || [];
      names.forEach(function (n) { load(ALIAS[n] || n); });
      return loadCfg().then(function (c) {
        names.forEach(function (n) {
          n = ALIAS[n] || n;
          var b = baseOf(n, c);
          if (!c[b]) return;
          load(b); variantsOf(b, c).forEach(load);
        });
        return c;
      });
    },
    _mounted: mounted,
    _budget: BUDGET,
    _fadeMs: FADE_MS,
    _plan: plan,
    _countNodes: countNodes,
    _baseOf: baseOf
  };
  window.Scene = Scene;
})();
