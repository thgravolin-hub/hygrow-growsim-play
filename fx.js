/* HyGrow Fx: reward and feedback moments. Global: window.Fx. No deps; Sfx optional. */
(function () {
  'use strict';
  var COLORS = ['#6ec846', '#ec8024', '#ffe27a', '#ffffff'];
  function rm() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function sfx(n, o) { try { if (window.Sfx) Sfx.play(n, o); } catch (e) {} }
  function later(el, cls, ms) { setTimeout(function () { try { el.classList.remove(cls); } catch (e) {} }, ms); }

  function pop(el) {
    if (!el) return;
    el.classList.remove('fx-pop'); void el.offsetWidth; el.classList.add('fx-pop');
    later(el, 'fx-pop', rm() ? 300 : 460);
  }
  function flash(el, kind) {
    if (!el) return;
    var c = 'fx-flash-' + (kind === 'bad' ? 'bad' : kind === 'warn' ? 'warn' : 'good');
    el.classList.remove('fx-flash-good', 'fx-flash-warn', 'fx-flash-bad'); void el.offsetWidth;
    el.classList.add(c); later(el, c, rm() ? 300 : 700);
  }
  function confetti(el, opt) {
    opt = opt || {};
    var r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
    var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    if (rm()) { var g = document.createElement('div'); g.className = 'fx-glow'; document.body.appendChild(g); setTimeout(function () { g.remove(); }, 300); return; }
    var n = Math.min(80, opt.n || 60), cols = opt.colors || COLORS, W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    var cv = document.createElement('canvas'); cv.className = 'fx-confetti';
    cv.width = W * dpr; cv.height = H * dpr; document.body.appendChild(cv);
    var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    var ps = [], i;
    for (i = 0; i < n; i++) { var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 260 + Math.random() * 420; ps.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: cols[i % cols.length] }); }
    var t0 = performance.now(), last = t0, DUR = 1200;
    (function f(t) {
      var dt = Math.min(0.05, (t - last) / 1000); last = t;
      var k = (t - t0) / DUR;
      if (k >= 1) { cv.remove(); return; }
      ctx.clearRect(0, 0, W, H); ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ps.forEach(function (p) {
        p.vy += 900 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      requestAnimationFrame(f);
    })(t0);
  }

  var banner = null, bannerT = [];
  function stageCard(name, blurb) {
    if (!banner) { banner = document.createElement('div'); banner.className = 'fx-stage'; banner.setAttribute('role', 'status'); document.body.appendChild(banner); }
    bannerT.forEach(clearTimeout); bannerT = [];
    var h = document.querySelector('header'), top = h ? Math.round(h.getBoundingClientRect().bottom) + 6 : 56;
    banner.style.top = Math.max(8, top) + 'px';
    banner.innerHTML = '';
    var ic = document.createElement('span'); ic.className = 'fx-si'; ic.textContent = '🌿';
    var tx = document.createElement('span'); tx.className = 'fx-st';
    var b = document.createElement('b'); b.textContent = name || 'New stage'; tx.appendChild(b);
    if (blurb) { var s = document.createElement('small'); s.textContent = blurb; tx.appendChild(s); }
    banner.appendChild(ic); banner.appendChild(tx);
    banner.classList.remove('in', 'out'); void banner.offsetWidth; banner.classList.add('in');
    bannerT.push(setTimeout(function () { banner.classList.add('out'); }, 2200));
    bannerT.push(setTimeout(function () { banner.classList.remove('in', 'out'); }, 2700));
  }

  var prev = {};
  function readings(root, speed) {
    if (!root) return;
    var fast = speed >= 8;
    root.querySelectorAll('[data-reading]').forEach(function (el) {
      var k = el.getAttribute('data-reading'), s = el.classList.contains('bad') ? 'bad' : el.classList.contains('warn') ? 'warn' : el.classList.contains('good') ? 'good' : 'unknown';
      var p = prev[k]; prev[k] = s;
      if (!fast && p && p !== s && s !== 'unknown') flash(el, s);
    });
  }

  /* ---- number tweens ---- */
  // parseNum('$12.50') -> { n: 12.5, prefix: '$', suffix: '', dec: 2 }; no number -> null
  function parseNum(text) {
    var m = /^([^0-9.\-]*?)(-?\d+(?:\.\d+)?)([\s\S]*)$/.exec(String(text == null ? '' : text));
    if (!m) return null;
    return { n: parseFloat(m[2]), prefix: m[1], suffix: m[3], dec: (m[2].split('.')[1] || '').length };
  }
  var tweens = [], twRaf = 0, lastPop = 0;
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function twFrame(t) {
    twRaf = 0;
    tweens = tweens.filter(function (w) {
      var k = Math.min(1, (t - w.t0) / 400);
      w.cur = w.from + (w.to - w.from) * easeOut(k);
      w.el.textContent = w.p.prefix + (k >= 1 ? w.to : w.cur).toFixed(w.p.dec) + w.p.suffix;
      if (k >= 1) { w.el.__fxTw = null; return false; }
      return true;
    });
    if (tweens.length) twRaf = requestAnimationFrame(twFrame);
  }
  // countTo(el, '$12.50'): eases the displayed number to the new one over 400 ms, keeping prefix/suffix/decimals; pops when the integer part changes
  function countTo(el, text) {
    if (!el) return;
    text = String(text);
    var running = el.__fxTw;
    if (running ? running.text === text : el.textContent === text) return;
    var p = parseNum(text), now = parseNum(el.textContent);
    if (running) { tweens = tweens.filter(function (w) { return w !== running; }); el.__fxTw = null; }
    var hid = false; try { hid = document.hidden; } catch (e) {}
    if (!p || !now || rm() || hid || typeof requestAnimationFrame !== 'function' || p.n === now.n) { el.textContent = text; return; }
    if (Math.trunc(p.n) !== Math.trunc(now.n)) { var t = Date.now(); if (t - lastPop > 600) { lastPop = t; pop(el); } }
    var w = { el: el, p: p, from: running ? running.cur : now.n, to: p.n, cur: now.n, t0: performance.now(), text: text };
    el.__fxTw = w; tweens.push(w);
    if (!twRaf) twRaf = requestAnimationFrame(twFrame);
  }

  /* ---- health bar colour: green (>=80) -> amber (55) -> red (<=25) ---- */
  var HC_G = [0x6e, 0xc8, 0x46], HC_A = [0xf2, 0xb9, 0x50], HC_R = [0xe2, 0x36, 0x2b];
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function mix(a, b, f) { return '#' + [0, 1, 2].map(function (i) { return hex2(a[i] + (b[i] - a[i]) * f); }).join(''); }
  function healthColor(pct) {
    pct = +pct; if (!isFinite(pct)) pct = 100;
    if (pct >= 80) return '#6ec846';
    if (pct >= 55) return mix(HC_A, HC_G, (pct - 55) / 25);
    if (pct >= 25) return mix(HC_R, HC_A, (pct - 25) / 30);
    return '#e2362b';
  }

  /* ---- arc gauge geometry (viewBox 0 0 80 44, centre 40,40, radius 30, 180 degrees from the left end to the right end) ---- */
  // span = target range doubled in width (a half range added each side), clamped to [min, max] when given
  function gaugeSpan(lo, hi, min, max) {
    var r = hi - lo; if (!(r > 0)) r = Math.max(Math.abs(lo) * 0.1, 0.1);
    var a = lo - r / 2, b = hi + r / 2;
    if (typeof min === 'number' && a < min) a = min;
    if (typeof max === 'number' && b > max) b = max;
    if (!(b > a)) b = a + r;
    return [a, b];
  }
  // angle in degrees, -90 = left end, 0 = top, +90 = right end
  function gaugeAngle(v, lo, hi, min, max) {
    if (typeof v !== 'number' || !isFinite(v)) return 0;
    var s = gaugeSpan(lo, hi, min, max), a = -90 + 180 * (v - s[0]) / (s[1] - s[0]);
    return Math.max(-90, Math.min(90, a));
  }
  function arcPt(a) { var r = a * Math.PI / 180; return [(40 + 30 * Math.sin(r)).toFixed(2), (40 - 30 * Math.cos(r)).toFixed(2)]; }
  // SVG path for the arc between two gauge angles
  function arcPath(a0, a1) {
    var p0 = arcPt(a0), p1 = arcPt(a1);
    return 'M' + p0[0] + ' ' + p0[1] + ' A30 30 0 ' + (Math.abs(a1 - a0) > 180 ? 1 : 0) + ' ' + (a1 >= a0 ? 1 : 0) + ' ' + p1[0] + ' ' + p1[1];
  }

  /* ---- harvest modal entrance ---- */
  var SEEN = 'hygrow_badges_seen_v1';
  function seenSet() { try { return JSON.parse(localStorage.getItem(SEEN)) || []; } catch (e) { return []; } }
  var hv = { quinn: null };

  /* ---- first harvest moment (any mode, once per browser: localStorage hygrow_first_harvest_v1 = {crop, kg}) ----
     firstHarvest({kg, crop, cropId, quinn, say, sound, modal}) fires the card, confetti, Axel's hop and (say !== false) his line, then marks the flag.
     firstHarvestBanner({kg, share}) returns the one-line HTML for the harvest modal, once, right after the moment (or null-equivalent '') */
  var FH_KEY = 'hygrow_first_harvest_v1', FH_LINE = 'Your first harvest! Everything after this is just doing it again, only better.';
  var fhMem = false, fhNow = null;
  function fhDone() { if (fhMem) return true; try { return !!localStorage.getItem(FH_KEY); } catch (e) { return false; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fhSay() { try { document.dispatchEvent(new CustomEvent('hygrow:say', { detail: { text: FH_LINE, opts: { auto: true, bg: true } } })); } catch (e) {} }
  function firstHarvest(o) {
    o = o || {};
    var kg = +o.kg;
    if (fhDone() || !(kg > 0)) return null;
    var name = String(o.crop || 'crop');
    fhMem = true;
    try { localStorage.setItem(FH_KEY, JSON.stringify({ crop: name.toLowerCase(), kg: Math.round(kg * 100) / 100 })); } catch (e) {}
    fhNow = { crop: name.toLowerCase(), kg: kg, at: Date.now(), used: false, usedAt: 0, modal: !!o.modal };
    try { stageCard('First harvest!', name.charAt(0).toUpperCase() + name.slice(1) + ' picked. You grew that.'); } catch (e) {}
    if (!rm()) { /* reduced motion: the card and the banner only */
      try { confetti(document.getElementById('tent'), { n: 80 }); } catch (e) {}
      if (o.quinn) { try { o.quinn.wave(3000); o.quinn.hop(); } catch (e) {} }
    }
    if (o.sound) sfx('firstHarvest', { crop: o.cropId });
    if (o.say !== false) fhSay();
    return fhNow;
  }
  function firstHarvestBanner(o) {
    o = o || {};
    if (!fhNow || fhNow.used || !(fhNow.modal || Date.now() - fhNow.at < 8000)) return '';
    fhNow.used = true; fhNow.usedAt = Date.now();
    var kg = +o.kg > 0 ? +o.kg : fhNow.kg;
    return '<div class="fh-banner" role="status"><span>Your first harvest: <b>' + kg.toFixed(2) + ' kg</b> of ' + esc(fhNow.crop) + '</span>' + (o.share ? '<button type="button" class="fh-share">Share it</button>' : '') + '</div>';
  }
  function harvest(o) { hv = o || hv; }
  function enter() {
    var body = document.getElementById('harvestBody'); if (!body) return;
    var T = !rm(), delay = 250;
    var st = body.querySelector('.stars');
    var onSpan = st && st.querySelector('span.on'); /* v51: the earned stars sit in span.on (v49b); the pop-in reads them from there */
    if (st && ((st.firstChild && st.firstChild.nodeType === 3) || onSpan)) {
      var txt = onSpan ? onSpan.textContent : st.firstChild.nodeValue, spans = [], tail = onSpan ? onSpan.nextSibling : st.querySelector('span');
      if (onSpan) onSpan.textContent = ''; else st.removeChild(st.firstChild);
      for (var i = 0; i < txt.length; i++) { var sp = document.createElement('i'); sp.className = 'fx-star'; sp.textContent = txt.charAt(i); if (T) sp.style.opacity = '0'; if (onSpan) onSpan.appendChild(sp); else st.insertBefore(sp, tail); spans.push(sp); } /* v52 (critic round 6 #1): the earned stars stay inside span.on, so the a11y label still counts them */
      spans.forEach(function (sp, j) { if (!T) return; setTimeout(function () { sp.style.opacity = '1'; pop(sp); sfx('pop', { pitch: 1 + j * 0.12 }); }, delay + j * 260); });
      delay += spans.length * 260;
    }
    var yb = body.querySelector('.scores b');
    if (yb && T) {
      var m = /^(-?[\d.]+)(.*)$/.exec(yb.textContent);
      if (m) {
        var to = parseFloat(m[1]), dec = (m[1].split('.')[1] || '').length, t0 = performance.now();
        yb.textContent = (0).toFixed(dec) + m[2];
        (function f(t) { var k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); yb.textContent = (to * e).toFixed(dec) + m[2]; if (k < 1) requestAnimationFrame(f); else pop(yb); })(t0);
      }
    }
    var seen = seenSet(), fresh = [];
    body.querySelectorAll('.badge.on').forEach(function (b) { var n = (b.querySelector('b') || {}).textContent; if (n && seen.indexOf(n) < 0) { fresh.push(b); seen.push(n); } });
    if (fresh.length) {
      try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch (e) {}
      setTimeout(function () { fresh.forEach(function (b, j) { setTimeout(function () { pop(b); sfx('coin'); }, T ? j * 180 : 0); }); confetti(fresh[0]); }, T ? delay : 0);
    }
    var ce = body.querySelector('.camp-end:not(.fail)');
    var justFirst = fhNow && fhNow.used && Date.now() - fhNow.usedAt < 4000; /* the first-harvest moment just did the cheering: do not do it twice */
    if (ce && !justFirst) {
      sfx('harvest'); setTimeout(function () { confetti(ce, { n: 70 }); }, T ? 150 : 0);
      if (hv.quinn) { try { hv.quinn.wave(3000); hv.quinn.hop(); } catch (e) {} }
    }
  }
  function init() {
    var h = document.getElementById('harvest');
    if (h && window.MutationObserver) {
      var was = h.classList.contains('show');
      new MutationObserver(function () { var on = h.classList.contains('show'); if (on && !was) enter(); was = on; }).observe(h, { attributes: true, attributeFilter: ['class'] });
    }
    var tries = 0, lastC = null;
    (function hud() {
      var pill = document.getElementById('dlyPill');
      if (!pill) { if (tries++ < 40) setTimeout(hud, 500); return; }
      if (window.MutationObserver) new MutationObserver(function () {
      var m = /(\d+) Axel coins/.exec((document.getElementById('dlyWrap') || pill).textContent || ''); /* v68: the task list moved beside the pill */ if (!m) return;
      if (lastC != null && m[1] !== lastC) pop(pill);
      lastC = m[1];
      }).observe(document.getElementById('dlyWrap') || pill, { childList: true, subtree: true, characterData: true });
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.Fx = { confetti: confetti, pop: pop, flash: flash, stageCard: stageCard, readings: readings, harvest: harvest, countTo: countTo, parseNum: parseNum, healthColor: healthColor, gaugeSpan: gaugeSpan, gaugeAngle: gaugeAngle, arcPath: arcPath,
    firstHarvest: firstHarvest, firstHarvestBanner: firstHarvestBanner, firstHarvestDone: fhDone, FIRST_HARVEST_LINE: FH_LINE, FIRST_HARVEST_KEY: FH_KEY };
})();
