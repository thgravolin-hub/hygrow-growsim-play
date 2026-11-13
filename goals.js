/* v37 Goals: a live goal line after the lesson, per method, that teaches by doing.
   Loaded after beginner.js (uses window.methodCopy). A sequence per grow method is built from S.method; each goal has a title (<= 40 chars), a one-line how (<= 90 chars,
   through methodCopy().gate so pots never read "tank"), a pure progress check on S, a static done line Axel says once and a small reward (a line in S.__goals.log, kept with the grow).
   Counters are kept in S.__goals.c by observe(S), once per game hour, from what the sim itself shows (S.acts, S.nutrientMl, S.resL, S.harvestedKg, S.cover, S.drip, readings status),
   so every check(S) is pure and false on a fresh S. State is S.__goals, which is serialised with the grow.
   Events: document 'hygrow:goal' {id, done:true}; Axel's line goes out as 'hygrow:say' (nohold: never pauses the clock). UI: one strip (#bgStrip.gs) under the header, one tap opens a small list sheet. */
(function (root) {
  'use strict';
  var doc = root.document || null;
  var MAXLOG = 40;

  /* ------------------------------------------------------------------ helpers (pure) */
  function G(S) { return (S && S.__goals) || null; }
  function C(S) { var g = G(S); return (g && g.c) || {}; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function mc(S) { try { return (root.methodCopy && root.methodCopy(S)) || null; } catch (e) { return null; } }
  function gate(S, t) { var m = mc(S); return m && m.gate ? m.gate(t) : t; }
  function cut(t, n) { t = String(t); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '.'; }
  function isOut(S) { return !!(S && S.method && S.method.where && S.method.where !== 'tent'); }
  function how(S) { return (S && S.method && S.method.how) || 'hydro'; }
  function rootWord(S) { var m = mc(S); return m ? m.root : 'Soil'; }
  function pct(a, b) { return clamp01(num(a) / b); }
  function hrsToDays(h) { return Math.floor(num(h) / 24); }
  function ofN(n, tot, word) { return Math.min(n, tot) + ' of ' + tot + (word ? ' ' + word : ''); }

  /* a streak goal: `key` hours in the green in a row, `days` days needed */
  function streak(key, days, name, tip) {
    return {
      id: 'keep-' + key + '-' + days,
      title: function (S) { return cut('Keep ' + name(S) + ' in the green for ' + days + (days === 1 ? ' day' : ' days'), 40); },
      how: tip,
      check: function (S) { return num(C(S)[key]) >= 24 * days; },
      prog: function (S) { var h = num(C(S)[key]); return { f: pct(h, 24 * days), t: h >= 24 * days ? 'done' : 'day ' + Math.min(days, hrsToDays(h) + 1) + ' of ' + days }; },
      line: 'Steady. That is what a good grower does: watch the tile and nudge it, not swing it.'
    };
  }
  var firstPick = {
    id: 'first-pick', title: function () { return 'First harvest'; }, /* v37 */
    how: function (S) { var b = doc && doc.querySelector && doc.querySelector('[data-act="harvest"]'), w = b && (b.textContent || '').trim(); var cr = S && S.cropId, when = cr === 'lettuce' ? 'the head is full' : cr === 'basil' ? 'the leaves are big enough' : 'the fruit is ripe'; return 'Tap ' + (w && w.length < 14 ? w : 'Harvest') + ' when ' + when + '. Keep the tiles green until then.'; }, /* v47 */
    check: function (S) { return num(C(S).picks) >= 1 || num(S && S.harvestedKg) > 0; },
    prog: function (S) { var r = !!(S && S.mature); return { f: r ? 0.9 : 0.3, t: r ? 'ripe: tap Harvest' : 'growing' }; },
    line: 'There it is, your first harvest. Fresh off your own plant.' /* v37 */
  };
  var pick3 = {
    id: 'pick-3', title: function () { return 'Harvest 3 times'; }, /* v37 */
    how: function (S) { return S && S.cropId === 'basil' ? 'Cut basil again as the leaves regrow. Leave it a few days between cuts.' : 'Tap Harvest again as each lot ripens. Leave it a few days between harvests.'; }, /* v47 */
    check: function (S) { return num(C(S).picks) >= 3; },
    prog: function (S) { var n = num(C(S).picks); return { f: pct(n, 3), t: ofN(n, 3, 'harvests') }; }, /* v37 */
    line: 'Three harvests. You have the rhythm now.' /* v37 */
  };
  var alive30 = {
    id: 'alive-30', title: function () { return '30 days alive'; },
    how: function () { return 'Keep it fed, watered and in the green. Slow and steady wins.'; },
    check: function (S) { return !!S && num(S.day) >= 30 && num(S.health) > 0; },
    prog: function (S) { var d = num(S && S.day); return { f: pct(d, 30), t: 'day ' + Math.min(30, d) + ' of 30' }; },
    line: 'Thirty days and still thriving. That is a proper grow.'
  };
  var coldNight = {
    id: 'cold-night', title: function () { return 'Get through a cold night'; },
    how: function (S) { return S && S.method && S.method.where === 'veranda' ? 'Bring in before 7 pm, then put them back out in the morning.' : 'Cover before 7 pm, then take the cloth off in the morning.'; },
    check: function (S) { return num(C(S).night) >= 6; },
    prog: function (S) { var n = num(C(S).night); return { f: pct(n, 6), t: ofN(n, 6, 'night hours') }; },
    line: 'Warm and safe through the dark. Cold nights are what catch people out.'
  };
  var airDay = streak('air', 1, function () { return 'Air'; }, function () { return 'Use the fan and lights to hold the Air tile green all day.'; });
  var feedWk2 = {
    id: 'feed-wk2', title: function () { return 'First feed of week 2'; },
    how: function (S) { return 'From day 8, tap Feed once. Soil only needs a feed about weekly.'; },
    check: function (S) { return num(C(S).feedLate) >= 1; },
    prog: function (S) { var d = num(S && S.day); return { f: pct(d, 8), t: d < 8 ? 'day ' + d + ' of 8' : 'tap Feed now' }; },
    line: 'Fed on time. Plants like a steady meal better than a big one.'
  };
  var cocoFeed = {
    id: 'feed-flush', title: function () { return 'Feed, then water it through once'; },
    how: function () { return 'Tap Feed, then Water later to rinse the salts out of the coco.'; },
    check: function (S) { var c = C(S); return num(c.feeds) >= 1 && num(c.flush) >= 1; },
    prog: function (S) { var c = C(S), a = num(c.feeds) >= 1 ? 1 : 0, b = num(c.flush) >= 1 ? 1 : 0; return { f: (a + b) / 2, t: a ? 'now Water it through' : 'tap Feed first' }; },
    line: 'Feed in, salts out. That is how you run coco.'
  };
  var cocoDrip = {
    id: 'drip-day', title: function () { return 'Drip on through a full day'; },
    how: function () { return 'Switch Drip on and let it feed the pots for a whole day.'; },
    check: function (S) { return num(C(S).dripH) >= 24; },
    prog: function (S) { var h = num(C(S).dripH); return { f: pct(h, 24), t: ofN(h, 24, 'hours') }; },
    line: 'The drip did the watering all day. Hands free.'
  };
  var topUp = {
    id: 'top-up', title: function () { return 'Top up before the tank reads low'; },
    how: function (S) { return 'Tap Top up while Tank is still green, before it turns orange.'; },
    check: function (S) { return num(C(S).topUps) >= 1; },
    prog: function (S) { var lv = S && S.cap ? num(S.resL) / S.cap : 1; return { f: clamp01(1.2 - lv), t: 'Tank at ' + Math.round(lv * 100) + ' %' }; },
    line: 'Topped up in good time. A tank that never runs low never surprises you.'
  };
  var towerPick = {
    id: 'tower-pick', title: function () { return 'Harvest a slot, keep the others happy'; }, /* v37 */
    how: function () { return 'Harvest one ripe slot, then keep the tank steady so the rest do not wilt.'; }, /* v37 */
    check: function (S) { return num(C(S).tp) >= 1; },
    prog: function (S) { var c = C(S); return { f: c.pickT != null ? 0.6 : 0, t: c.pickT != null ? 'watching the rest for a day' : 'harvest a ripe slot' }; }, /* v37 */
    line: 'One slot out and the rest still standing. That is how a tower is harvested.' /* v37 */
  };

  var ecBand = streak('ec', 3, function () { return 'EC'; }, function (S) { return gate(S, 'Mix feed a little at a time, and use Top up with plain water if EC runs high.'); });
  var phBand = streak('ph', 2, function () { return 'pH'; }, function () { return 'pH down lowers it, pH up raises it. Small doses, then wait.'; }); /* v37 */
  function rootBand(S) { return streak('mo', 2, rootWord, function (S2) { return how(S2) === 'coco' ? 'Water or Feed when the Coco tile drops. Do not drown it.' : 'Water when the Soil tile drops toward orange. Do not overfill.'; }); }

  /* the sequence for a grow. Built fresh from S.method each call (cheap). */
  function build(S) {
    var h = how(S), out = isOut(S), L = [];
    var rb = rootBand(S);
    var night = out ? coldNight : airDay;
    if (h === 'soil') L = [rb, night, feedWk2, firstPick, pick3, alive30];
    else if (h === 'coco') L = [cocoFeed, cocoDrip, rb, night, firstPick, pick3, alive30];
    else if (h === 'tower') L = [ecBand, topUp].concat(out ? [coldNight] : [], [towerPick, pick3, alive30]);
    else L = [ecBand, topUp, phBand, firstPick, pick3, alive30];
    if (S && S.cropId === 'lettuce' && h !== 'tower') L = L.filter(function (g) { return g !== pick3; }); /* v47: a lettuce head is one cut, so there is no third harvest */
    return L;
  }
  function txt(S, d, k) { var v = d[k]; v = typeof v === 'function' ? v(S) : v; return String(gate(S, v)); }
  function view(S, d) { var p = d.prog(S) || {}; return { id: d.id, title: cut(txt(S, d, 'title'), 40), how: cut(txt(S, d, 'how'), 90), line: String(d.line), p: { f: clamp01(num(p.f)), t: cut(p.t || '', 60) } }; }

  /* ------------------------------------------------------------------ state */
  function init(S) {
    if (!S) return null;
    if (!S.__goals || typeof S.__goals !== 'object') S.__goals = { v: 1, done: {}, said: {}, log: [], c: {}, lt: null };
    var g = S.__goals; if (!g.done) g.done = {}; if (!g.said) g.said = {}; if (!g.log) g.log = []; if (!g.c) g.c = {};
    return g;
  }
  function current(S) { var g = G(S), L = build(S); for (var i = 0; i < L.length; i++) if (!(g && g.done && g.done[L[i].id])) return L[i]; return null; }

  /* once per new game hour: update the counters from what the sim shows. Never reads a clock or the DOM. */
  function observe(S) {
    var g = init(S); if (!g) return;
    var c = g.c, t = num(S.t), done = [];
    if (g.lt === null || g.lt === undefined || t < g.lt) { g.lt = t; snap(S, g); return; }
    var dt = t - g.lt; if (dt < 1) return;
    g.lt = t;
    var r = null; try { r = root.Sim && root.Sim.readings ? root.Sim.readings(S) : null; } catch (e) { r = null; }
    var st = (r && r.status) || {}, step = Math.min(dt, 3);
    var good = function (k, key) { c[key] = st[k] === 'good' ? num(c[key]) + step : 0; };
    good('moisture', 'mo'); good('ec', 'ec'); good('ph', 'ph'); good('airTemp', 'air');
    var acted = num(S.acts) > num(g.pa), cap = num(S.cap) || 1, pots = !!S.pot, dMl = num(S.nutrientMl) - num(g.pn), dRes = num(S.resL) - num(g.pr);
    if (acted && pots && dMl > 0.5) { c.feeds = num(c.feeds) + 1; if (num(S.day) >= 8 && how(S) === 'soil') c.feedLate = num(c.feedLate) + 1; }
    else if (acted && pots && dRes > 0.02 * cap && num(c.feeds) > 0) c.flush = num(c.flush) + 1;
    if (acted && !pots && dRes > 0.05 * cap) { var before = num(g.pr) / cap; if (before > 0.4 && before < 0.9) c.topUps = num(c.topUps) + 1; }
    if (S.drip && S.lit) c.dripH = num(c.dripH) + step;
    if (S.cover && (num(S.hour) >= 19 || num(S.hour) < 5)) c.night = num(c.night) + step;
    if (num(S.harvestedKg) > num(g.ph) + 1e-6) { c.picks = num(c.picks) + 1; c.pickT = t; }
    if (S.slots && c.pickT != null && !c.tp && t >= c.pickT + 24) {
      var ok = S.slots.every(function (x) { return !x || x.planted === null || x.planted === undefined || x.cropDone || num(x.health) >= 60; });
      if (ok) c.tp = 1; c.pickT = null;
    }
    snap(S, g);
    var L = build(S), fresh = [];
    for (var i = 0; i < L.length; i++) {
      if (g.done[L[i].id]) continue;
      if (!L[i].check(S)) break;
      g.done[L[i].id] = { d: S.day, t: S.t }; fresh.push(L[i]);
    }
    fresh.forEach(function (d, k) { complete(S, g, d, k === fresh.length - 1); });
  }
  function snap(S, g) { g.pa = num(S.acts); g.pn = num(S.nutrientMl); g.pr = num(S.resL); g.ph = num(S.harvestedKg); }
  function complete(S, g, d, speak) {
    var v = view(S, d);
    g.log.push({ d: S.day, id: d.id, title: v.title, reward: 'Goal done: ' + v.title }); if (g.log.length > MAXLOG) g.log.shift();
    if (doc && doc.dispatchEvent) {
      try { doc.dispatchEvent(new root.CustomEvent('hygrow:goal', { detail: { id: d.id, done: true } })); } catch (e) {}
      if (speak && !g.said[d.id]) { g.said[d.id] = 1; try { doc.dispatchEvent(new root.CustomEvent('hygrow:say', { detail: { text: v.line, opts: { hop: true, nohold: true } } })); } catch (e) {} }
    }
    log('done', d.id, S);
  }
  var logFn = null;
  function log(kind, id, S) { if (logFn) { try { logFn(kind, id, S); } catch (e) {} } }

  /* ------------------------------------------------------------------ UI */
  var el = null, sheet = null, sig = '', open = false, openT = 0, S0 = null;
  function mode() { try { return root.__game && root.__game.mode; } catch (e) { return null; } }
  function eligible(S) {
    if (!doc || !S || S.replay || S.__campaign) return false;
    var m = mode(); if (m !== 'free' && m !== 'learn') return false;
    var b = doc.body; if (!b || b.classList.contains('bg-on')) return false;
    if (doc.querySelector('.modal.show, .stv')) return false;
    return true;
  }
  function hide() { if (open) setOpen(false); if (el && el.parentNode) el.parentNode.removeChild(el); el = null; sheet = null; sig = ''; }
  function mount() {
    var old = doc.getElementById('bgStrip'); if (old && !old.classList.contains('gs')) return false; /* the lesson strip owns the id */
    if (el && el.parentNode) return true;
    el = old || doc.createElement('div');
    el.id = 'bgStrip'; el.className = 'gs'; el.setAttribute('role', 'status');
    el.innerHTML = '<button type="button" class="gs-main" aria-expanded="false" aria-controls="gsSheet"><span class="gs-t"></span><span class="gs-p"></span></button><div id="gsSheet" class="gs-sheet" role="group" aria-label="Goals" hidden></div><div class="bgs-bar" aria-hidden="true"><i></i></div>';
    var h = doc.querySelector('header'); if (!old) { if (h) h.insertAdjacentElement('afterend', el); else doc.body.insertBefore(el, doc.body.firstChild); }
    sheet = el.querySelector('.gs-sheet');
    el.querySelector('.gs-main').addEventListener('click', function () { setOpen(!open); });
    sheet.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.gs-close')) setOpen(false); });
    return true;
  }
  function setOpen(v) {
    open = !!v; clearTimeout(openT);
    if (!el || !sheet) return;
    sheet.hidden = !open; var b = el.querySelector('.gs-main'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { sig = ''; paintSheet(S0); openT = setTimeout(function () { setOpen(false); }, 20000); }
  }
  function paintSheet(S) {
    if (!sheet || !S) return;
    var g = G(S) || {}, L = build(S), cur = current(S), rows = '';
    L.forEach(function (d) {
      var v = view(S, d), dn = !!(g.done && g.done[d.id]), isCur = cur && cur.id === d.id;
      rows += '<li class="' + (dn ? 'dn' : isCur ? 'cur' : 'nx') + '"><span class="gs-k" aria-hidden="true">' + (dn ? '&#10003;' : isCur ? '&#9679;' : '&#9675;') + '</span><span><b>' + esc(v.title) + '</b>' + (isCur ? '<small>' + esc(v.how) + '</small>' : '') + '<i class="sr">' + (dn ? ' done' : isCur ? ' now' : ' coming') + '</i></span></li>';
    });
    sheet.innerHTML = '<ol>' + rows + '</ol><button type="button" class="gs-close">Close</button>';
  }
  function esc(t) { t = String(t); return window.escHtml ? window.escHtml(t) : t.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); } /* m6-fallback: ui.js escH is the one escape; this body runs only if ui.js is not loaded yet */
  function paint(S) {
    if (!mount()) return;
    var cur = current(S), t = el.querySelector('.gs-t'), p = el.querySelector('.gs-p'), bar = el.querySelector('.bgs-bar i'), s;
    var put = function (t1, p1, w1, tag1, ttl1) { if (t.__h !== t1) { t.__h = t1; t.innerHTML = t1; } if (p.textContent !== p1) p.textContent = p1; if (bar.style.width !== w1) bar.style.width = w1; if (el.getAttribute('data-tag') !== tag1) el.setAttribute('data-tag', tag1); if (el.title !== ttl1) el.title = ttl1; }; /* v67 (round 16 keyboard M3): role=status was rewritten every frame with the same words; write only on change, as beginner.js does */
    if (cur) { var v = view(S, cur); s = '<b>Goal:</b> ' + esc(v.title); put(s, String(v.p.t), Math.round(v.p.f * 100) + '%', '', v.how || ''); }
    else put('<b>All goals done.</b> Keep growing', '', '100%', 'done', '');
    var n = (cur ? cur.id : 'end') + '|' + (cur ? Math.round(view(S, cur).p.f * 100) + view(S, cur).p.t : '') + '|' + (G(S) ? Object.keys(G(S).done).length : 0);
    if (n !== sig) { sig = n; if (open) paintSheet(S); }
  }

  /* per frame: cheap. Counters step on a new game hour; the strip only repaints when its text changes. */
  function tick(S) {
    try {
      S0 = S;
      if (!eligible(S)) { if (el) hide(); return; }
      if (!S.__goals || (S.__goals.lt === null)) init(S);
      var g = S.__goals; if (!g) return;
      if (num(S.t) !== num(g.lt)) observe(S);
      var b = doc.getElementById('bubble');
      if (open && b && b.classList.contains('show') && b.style.display !== 'none') setOpen(false); /* never over Axel's bubble */
      paint(S);
    } catch (e) { if (root.console) console.warn('goals', e); }
  }
  function start(S) { try { S0 = S || S0; if (S) { init(S); S.__goals.lt = null; } } catch (e) {} }

  var api = {
    start: start, tick: tick, hide: hide, observe: observe, init: init, list: build, current: current, view: view,
    done: function (S) { var g = G(S); return g ? Object.keys(g.done) : []; },
    onLog: function (f) { logFn = f; }
  };
  root.Goals = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
