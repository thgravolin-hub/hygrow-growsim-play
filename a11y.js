/* HyGrow a11y: keyboard + screen-reader glue. Global: window.A11y. No deps, no edits to ui.js:
   everything hooks the DOM with MutationObservers.
   - dialogs (.modal.show and any [role=dialog][aria-modal]): role/label, focus moves in on open, Tab is trapped,
     Escape presses the dialog's Back/Close button, focus returns to the opener on close
   - Axel's bubble: the typewriter is silenced (aria-live off) and the finished line is announced once from a hidden
     polite region; the stage banner from fx.js gets an explicit aria-live
   - tent SVG: one aria-label rebuilt from the readings / day / stage / health, at most a few times a second
   - readings: a keyboard-focused tile keeps focus when render() rebuilds #readings
   - speed buttons mirror .on into aria-pressed; health and stage bars get aria-valuenow
   - captions: every spoken line (voice.js fires 'hygrow:voice' for each Voice.say; Axel's bubble and the story dialogue both go through it) is mirrored into one
     aria-live region, #captions, for the clip's duration (or an estimated reading time when no clip plays). It is a strip under the header in the bubble's font that
     steps aside (still announced, drawn clipped) when it would cover the action bar, the learned card, a toast, the pager or a modal card. Inside the story dialogue
     the same text goes to a hidden live node in that dialog instead. "Captions" toggle in the More sheet, localStorage 'hygrow_captions_v1' ('1' on, default).
   - pure helpers for tests: A11y.contrast(a, b), A11y.luminance(c), A11y.parseColor(s), A11y.captionMs(text, dur)
   - v50 keyboard trips (play-test #9): a skip bar (nav.a11y-skipbar, first child of body, drawn only while a link in it has focus) links to Menu, Ask Axel, the readings, the grow actions and More;
     Alt+M Menu, Alt+A Ask Axel, Alt+R first reading tile, Alt+G first grow-action button, Alt+O More, Alt+K the skip bar itself (letters via e.code; no digits, Alt+1..8 switches browser tabs on Linux);
     Left/Right/Home/End walk the dock and the readings. A dialog opening puts focus on its heading once; on the end card (#harvest) Tab from the heading goes Next chapter / Start again, then Back, then the rest.
   - the mute button mirrors the sound state into aria-pressed, pager dots mark the current panel with aria-current (Escape on the More sheet is ui.js) */
(function () {
  'use strict';
  var FOCUS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[role=button],summary'; /* v37: summary (More ways to play, Adjust gear) was missing, so Tab looped between Start growing and the summary */
  function $(s, r) { return (r || document).querySelector(s); }
  function visible(el) {
    if (!el || !el.isConnected || el.hidden || el.closest('[hidden]')) return false;
    var det = el.closest('details'); if (det && !det.open && !(el.tagName === 'SUMMARY' && el.parentNode === det)) return false; /* v53: inside a closed details only the summary takes focus */
    var r = el.getBoundingClientRect(); if (!(r.width || r.height)) return false;
    try { if (getComputedStyle(el).visibility === 'hidden') return false; } catch (e) {} /* v67 (round 16 keyboard M1): the title's collapsed pill panel is visibility:hidden, so Tab picked a button focus() could not take and stuck */
    return true;
  }
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUS), function (el) { return visible(el) && !el.closest('[aria-hidden="true"]') && !(el.getAttribute('tabindex') === '-1'); });
  }
  function focus(el) { if (!el) return false; try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} } return document.activeElement === el; }

  /* ---------- dialogs ---------- */
  function dialogs() {
    return Array.prototype.filter.call(document.querySelectorAll('.modal.show,[role=dialog][aria-modal="true"]'), function (d) {
      return visible(d) && !d.classList.contains('out') && !d.closest('.modal:not(.show)');
    });
  }
  function top() { var ds = dialogs(); return ds.length ? ds[ds.length - 1] : null; }
  var shown = new Set(), opener = new Map(), lastDown = null, lastKeyAt = 0, settleT = 0;

  function label(d) {
    if (!d.getAttribute('role')) d.setAttribute('role', 'dialog');
    if (!d.hasAttribute('aria-modal')) d.setAttribute('aria-modal', 'true');
    if (!d.hasAttribute('aria-label') && !d.hasAttribute('aria-labelledby')) {
      var h = d.querySelector('h1,h2');
      if (h) { if (!h.id) h.id = (d.id || 'dlg') + '-title'; d.setAttribute('aria-labelledby', h.id); }
    }
  }
  function starsLabel(d) {
    var st = d.querySelector('.stars'); if (!st) return;
    var total = st.textContent.replace(/\s/g, '').length, on = st.querySelector('span.on'), dim = on ? null : st.querySelector('span'), n = on ? on.textContent.replace(/\s/g, '').length : total - (dim ? dim.textContent.replace(/\s/g, '').length : 0); /* v51 (critic round 5 #1): the earned stars sit in span.on since v49b; the old shape (text then a dim span) still reads */
    st.setAttribute('role', 'img'); st.setAttribute('aria-label', n <= 0 ? 'no stars' : n + ' of ' + total + ' stars'); /* v45: the lost card's grey row */
  }
  function onShow(d) {
    label(d);
    if (d.id === 'harvest') starsLabel(d);
    var a = document.activeElement;
    /* lastDown is the last pointer target or the last element focused outside a dialog (a keyboard opener has no pointerdown, and ui.js may already have moved focus into the dialog) */
    if (!a || a === document.body || d.contains(a)) a = lastDown;
    if (a && !d.contains(a)) opener.set(d, a);
  }
  function onHide(d) { /* focus is restored in settle(), once the DOM is quiet */ }
  var headed = new WeakSet(); /* v50: dialogs whose heading already took focus for this opening */
  function focusInto(d) {
    var ae = document.activeElement, h = d.querySelector('.card > h1, .card > h2, h1, h2');
    if (!headed.has(d) && h && visible(h) && !(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && d.contains(ae))) { /* every card opens at its heading; a typing field keeps focus */
      headed.add(d); if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); if (focus(h)) { try { h.scrollIntoView({ block: 'nearest' }); } catch (e9) {} return; } /* v67 (round 16 keyboard m4): a dialog that kept its scroll opened with its heading off screen */
    }
    if (ae && ae !== document.body && d.contains(ae) && visible(ae)) return;
    if (h && visible(h)) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); if (focus(h)) { try { h.scrollIntoView({ block: 'nearest' }); } catch (e9) {} return; } /* v67 (round 16 keyboard m4): a dialog that kept its scroll opened with its heading off screen */ }
    var f = focusables(d); if (f.length && focus(f[0])) return;
    if (!d.hasAttribute('tabindex')) d.setAttribute('tabindex', '-1'); focus(d);
  }
  var lastClosed = null;
  function settle() {
    settleT = 0;
    var t = top();
    if (t) { focusInto(t); return; }
    var ae = document.activeElement;
    if (ae && ae !== document.body && visible(ae)) return;
    var back = lastClosed && opener.get(lastClosed); if (lastClosed) opener.delete(lastClosed);
    lastClosed = null;
    if (back && visible(back) && focus(back)) return;
    var dock = $('#dock button:not([disabled])'); if (dock && visible(dock)) focus(dock);
  }
  var tileT = 0;
  function sync() {
    if (!tileT) tileT = setTimeout(function () { tileT = 0; try { tileStates(); } catch (e) {} }, 120);
    var now = new Set(dialogs()), changed = false;
    now.forEach(function (d) { if (!shown.has(d)) { shown.add(d); onShow(d); changed = true; } });
    shown.forEach(function (d) { if (!now.has(d)) { shown.delete(d); headed.delete(d); lastClosed = d; onHide(d); changed = true; } });
    if (changed && !settleT) settleT = setTimeout(settle, 0);
  }
  function onKey(e) {
    lastKeyAt = performance.now();
    var d = top();
    if (!d) { shortcut(e); return; }
    if (e.key === 'Tab' && d.id === 'harvest' && endTab(e, d)) return;
    if (e.key === 'Tab' && (d.classList.contains('stv') || d.classList.contains('ll-dlg') || d.classList.contains('csvi-dlg'))) return; /* v68 (round 16 keyboard m2): the CSV import dialog has its own trap (csv.js) too; both stepping moved two fields per Tab */ /* v65 (play-test #17 keyboard M3): the live-link dialog has its own trap (live.js) too; both stepping skipped Connect and let Tab out to the bubble behind */ /* v64 (critic round 12 nit #6): story.js keeps its own Tab order (text, Skip, the choices); stepping here too moved focus two places a press, so Tab went First, Third, First and never reached Second or Skip */
    if (e.key === 'Tab') {
      var f = focusables(d); if (!f.length) { e.preventDefault(); return; }
      if (d.id === 'actionbar') f.sort(function (a, b) { var p = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return Math.abs(p.top - q.top) > 8 ? p.top - q.top : p.left - q.left; }); /* v66 (round 15 keyboard m4): the phone's More sheet is built out of DOM order (Close and Volume sit on top but came last), so its Tab follows what is on screen */
      var i = f.indexOf(document.activeElement);
      if (i === -1 && !d.contains(document.activeElement)) return; /* v37: focus is on something the list does not know: let the browser move on instead of jumping to the first control */
      /* v66 (round 15 keyboard M2): from the dialog's own heading (tabindex -1, so not in the list) Tab goes to the first control and Shift+Tab to the last; Shift+Tab used to leave the dialog for Ask Axel behind it */
      var nx = i === -1 ? f[e.shiftKey ? f.length - 1 : 0] : f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length];
      e.preventDefault(); focus(nx); try { nx.scrollIntoView({ block: 'nearest' }); } catch (e3) {} /* v66 (round 15 keyboard M1): the trap moves focus with preventScroll, so a long card's Start or Grow again was focused off screen; it is scrolled into view now */ /* v51 (critic round 5 #4): always the dialog's own next or previous control, wrapping at the ends; the More sheet's controls are not contiguous in the DOM, so the browser's own Tab left it for Axel's Got it */
    } else if (e.key === 'Escape' && (d.classList.contains('modal') || (d.closest && d.closest('.modal.show')))) { if (!d.classList.contains('modal')) d = d.closest('.modal.show'); /* v67 (round 16 keyboard m2): the away card is a role=dialog card inside its .modal, so top() returned the card and Escape did nothing */
      /* the dialog's own Back / Close / Keep growing button; title and harvest have none, so Escape does nothing there */
      var b = d.querySelector('#jclose,#awayOk,#bgdKeep') || d.querySelector('.foot .ghost,[data-c="close"]'); /* v66 (round 15 keyboard M3): on the lesson's end card Escape keeps growing; it clicked Back to the title and left the harvest card open over it */
      if (b && visible(b)) { e.preventDefault(); e.stopPropagation(); b.click(); }
    }
  }

  /* ---------- v50: keyboard shortcuts, skip bar, end-card Tab order ---------- */
  function firstVis(sel) { var l = document.querySelectorAll(sel); for (var i = 0; i < l.length; i++) if (visible(l[i])) return l[i]; return null; }
  function goAsk() {
    var b = firstVis('#dock [data-act="ask"],#dockOverflow [data-act="ask"]');
    if (b) return focus(b);
    var m = $('#moreBtn'); if (m && visible(m)) { m.click(); setTimeout(function () { var o = firstVis('#dockOverflow [data-act="ask"],[data-act="ask"]'); if (o) focus(o); }, 120); return true; }
    return false;
  }
  function goTile() { /* v69 (keyboard round 17 m2): on a phone the tiles sit on a sideways pager; pick a tile on screen, and bring the one we focus into view */
    var all = Array.prototype.filter.call(document.querySelectorAll('#readings .rd'), visible), W = window.innerWidth || 0;
    var r = all.filter(function (e) { var q = e.getBoundingClientRect(); return q.left >= 0 && q.right <= W + 1; })[0] || all[0]; if (!r) return false;
    var f = focusables(r), t = f.length ? f[0] : r, ok = focus(t); try { var sd = r.closest('.side'); if (sd && sd.scrollWidth > sd.clientWidth + 4) { var pn = r; while (pn && pn.parentElement !== sd) pn = pn.parentElement; if (pn) sd.scrollTo({ left: pn.offsetLeft - sd.offsetLeft, behavior: 'auto' }); } else t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} return ok; }
  var KEYS = {
    KeyM: function () { var m = $('#menu'); if (m && !visible(m)) { var mb = $('#moreBtn'); if (mb && visible(mb) && !$('#actionbar.open')) { mb.click(); setTimeout(function () { focus(m); }, 150); return true; } } return !!(m && visible(m) && focus(m)); }, /* v52 (critic round 6 #4): on a phone the Menu sits in the More sheet, so Alt+M opens it first */
    KeyA: goAsk,
    KeyR: goTile,
    KeyG: function () { var b = firstVis('#dock button:not([disabled])') || firstVis('#dockOverflow button:not([disabled])'); return b ? focus(b) : false; },
    KeyO: function () { var m = $('#moreBtn'); if (m && visible(m)) return !!focus(m); announce('Every button is already on the bar.'); return true; }, /* v65 (play-test #17 keyboard m3): on a wide screen there is no More, and the key used to do nothing at all */
    KeyK: function () { var a = firstVis('.a11y-skipbar a'); return a ? focus(a) : false; }
  };
  function shortcut(e) {
    /* plain Alt+letter only: nothing with Ctrl, Meta or Shift, and never while a dialog is up (the trap owns the keys) */
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && KEYS[e.code]) {
      if (KEYS[e.code]() !== false) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    /* arrows walk a row of buttons (dock) or tiles (readings); Tab still visits every one */
    if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/.test(e.key)) {
      var a = document.activeElement, box = a && a.closest && (a.closest('#dock') ? $('#dock') : a.closest('#readings') ? $('#readings') : null);
      if (!box) return;
      var sel = box.id === 'dock' ? 'button:not([disabled])' : '.rd button,.rd[tabindex],.rd[role=button]';
      var list = Array.prototype.filter.call(box.querySelectorAll(sel), visible), i = list.indexOf(a);
      if (i < 0 || list.length < 2) return;
      var n = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? Math.max(0, i - 1) : Math.min(list.length - 1, i + 1);
      e.preventDefault(); focus(list[n]);
    }
  }
  /* the end card: heading -> Next chapter / Start again -> Back / Grow again -> the rest (badges, share, store links) */
  function endTab(e, d) {
    var f = focusables(d), prim = [];
    ['nextChap', 'lostAgain', 'again'].forEach(function (id) { var b = document.getElementById(id); if (b && d.contains(b) && f.indexOf(b) >= 0) prim.push(b); });
    if (!prim.length) return false;
    var ord = prim.concat(f.filter(function (x) { return prim.indexOf(x) < 0; })), a = document.activeElement, i = ord.indexOf(a), n;
    if (i < 0 && !(a && d.contains(a) && (a === d || a.matches('h1,h2')))) return false;
    if (i < 0) n = e.shiftKey ? ord.length - 1 : 0; else n = e.shiftKey ? (i - 1 + ord.length) % ord.length : (i + 1) % ord.length;
    e.preventDefault(); focus(ord[n]); try { ord[n].scrollIntoView({ block: 'nearest' }); } catch (e2) {} return true; /* v67 (round 16 keyboard M2): the end card's Tab order scrolls too (Grow again sat at y 1538) */
  }
  function mountSkipBar() {
    if ($('.a11y-skipbar')) return;
    var nav = document.createElement('nav'); nav.className = 'a11y-skipbar'; nav.setAttribute('aria-label', 'Keyboard shortcuts');
    var items = [['KeyM', 'Menu', 'M'], ['KeyA', 'Ask Axel', 'A'], ['KeyR', 'Readings', 'R'], ['KeyG', 'Grow actions', 'G'], ['KeyO', 'More', 'O']];
    nav.innerHTML = items.map(function (it) { return '<a href="#" data-key="' + it[0] + '" aria-keyshortcuts="Alt+' + it[2] + '">' + it[1] + ' <kbd>Alt+' + it[2] + '</kbd></a>'; }).join('') + '<span class="sk-note">Alt+K brings this bar back. Arrow keys walk the grow actions and the readings.</span>';
    nav.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[data-key]'); if (!a) return; e.preventDefault(); KEYS[a.dataset.key](); });
    nav.addEventListener('focusin', function () { var m = nav.querySelector('[data-key="KeyO"]'); if (m) m.hidden = !visible($('#moreBtn')); });
    document.body.insertBefore(nav, document.body.firstChild);
    var st = document.createElement('style'); st.id = 'a11ySkip';
    st.textContent = '.a11y-skipbar{position:fixed;left:8px;top:8px;transform:translateY(calc(-100% - 16px));z-index:300;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100vw - 16px);box-sizing:border-box;padding:8px;border-radius:12px;background:#10261a;border:2px solid #7bd88f;font:700 14px/1.2 system-ui,sans-serif}.a11y-skipbar:focus-within{transform:none}.a11y-skipbar a[hidden]{display:none}' +
      '.a11y-skipbar a{display:inline-flex;gap:6px;align-items:center;min-height:44px;box-sizing:border-box;padding:0 12px;border-radius:10px;background:#7bd88f;color:#10261a;text-decoration:none}.a11y-skipbar a:focus-visible{outline:3px solid #fff;outline-offset:2px}.a11y-skipbar kbd{font:700 12px ui-monospace,monospace;opacity:.8}.a11y-skipbar .sk-note{flex:1 1 100%;color:#e8f5ea;font-weight:500;font-size:12px}';
    document.head.appendChild(st);
  }

  /* ---------- Axel's bubble + stage banner ---------- */
  var live = null, liveT = 0;
  function announce(t) {
    if (!live || !t) return;
    clearTimeout(liveT); live.textContent = '';
    liveT = setTimeout(function () { live.textContent = t; }, 60);
  }
  function watchBubble() {
    var b = $('#bubble'); if (!b) return;
    b.setAttribute('aria-live', 'off');
    new MutationObserver(function () {
      if (b.dataset.typed !== '1') return;
      /* with captions on, #captions already announced this line when it started: do not say it twice */
      if (capEl && capOn()) return;
      var tx = b.querySelector('.txt'); if (tx) announce(tx.textContent);
    }).observe(b, { attributes: true, attributeFilter: ['data-typed'] });
  }
  function watchBanner() {
    new MutationObserver(function () {
      var s = document.querySelector('.fx-stage:not([aria-live])'); if (s) s.setAttribute('aria-live', 'polite');
    }).observe(document.body, { childList: true });
  }

  /* ---------- tent state, bars, speed ---------- */
  var tentT = 0;
  function tentLabel() {
    tentT = 0;
    var svg = $('#tent svg.scene') || $('#tent svg[role="img"]') || $('#tent svg'); if (!svg) return; /* v37: the first svg in #tent is a 31 px icon; the scene is svg.scene */
    Array.prototype.forEach.call(document.querySelectorAll('#tent svg'), function (o) { if (o !== svg && !o.hasAttribute('aria-hidden')) o.setAttribute('aria-hidden', 'true'); });
    var day = ($('#day') || {}).textContent || '', stage = ($('#stage') || {}).textContent || '';
    var hb = $('#health'), health = hb ? parseInt(hb.style.width, 10) : NaN, sb = $('#stagebar'), prog = sb ? parseInt(sb.style.width, 10) : NaN;
    var parts = [];
    document.querySelectorAll('#readings .rd').forEach(function (r) {
      var lab = r.querySelector('span'), val = r.querySelector('b'), em = val && val.querySelector('em'), sm = r.querySelector('small');
      var name = lab ? Array.prototype.filter.call(lab.childNodes, function (n) { return !(n.nodeType === 1 && n.classList && n.classList.contains('rdstate')); }).map(function (n) { return n.textContent; }).join('').replace(/LIVE\s*$/, '').trim() : ''; /* v37: the state word is added once, below */
      var v = val ? (val.firstChild && val.firstChild.nodeType === 3 ? val.firstChild.nodeValue.trim() : val.textContent.trim()) : '';
      if (v === '???') v = 'no meter'; else if (em) v += ' ' + em.textContent.trim();
      var st = r.classList.contains('bad') ? 'needs attention' : r.classList.contains('warn') ? 'a bit off' : r.classList.contains('unknown') ? '' : 'on target';
      parts.push(name + ' ' + v + (sm ? ', ' + sm.textContent.trim() : '') + (st ? ', ' + st : ''));
    });
    var tw = ($('#tent') || {}).dataset || {}, place = tw.where === 'veranda' ? 'Veranda pots' : tw.where === 'outdoors' ? 'Garden bed' : 'Grow tent'; /* v37 */
    var s = place + '. ' + (day ? day + '. ' : '') + (stage ? stage + ' stage. ' : '') + (isFinite(health) ? 'Health ' + health + ' percent. ' : '') + parts.join('; ');
    if (s !== svg.getAttribute('aria-label')) svg.setAttribute('aria-label', s);
    var hbar = hb && hb.parentNode, sbar = sb && sb.parentNode;
    if (hbar && isFinite(health)) hbar.setAttribute('aria-valuenow', health);
    if (sbar && isFinite(prog)) { sbar.setAttribute('aria-valuenow', prog); if (stage) sbar.setAttribute('aria-valuetext', stage + ' ' + prog + '%'); }
  }
  function scheduleTent() { if (!tentT) tentT = setTimeout(tentLabel, 250); }
  var rdKey = null, restoring = false;
  function watchReadings() {
    var rd = $('#readings'); if (!rd) return;
    rd.addEventListener('focusin', function (e) { if (restoring) return; var t = e.target.closest && e.target.closest('.rd'); rdKey = t && performance.now() - lastKeyAt < 600 ? t.dataset.reading : null; });
    rd.addEventListener('focusout', function (e) { if (e.relatedTarget) rdKey = null; });
    new MutationObserver(function () {
      scheduleTent();
      /* the focused tile was just replaced: activeElement still points at the detached node until the next frame */
      var ae = document.activeElement;
      if (rdKey && (!ae || ae === document.body || !ae.isConnected)) { var n = rd.querySelector('[data-reading="' + rdKey + '"]'); if (n) { restoring = true; focus(n); restoring = false; } }
    }).observe(rd, { childList: true });
    ['#day', '#stage'].forEach(function (s) { var el = $(s); if (el) new MutationObserver(scheduleTent).observe(el, { childList: true, characterData: true, subtree: true }); });
    ['#health', '#stagebar'].forEach(function (s) { var el = $(s); if (el) new MutationObserver(scheduleTent).observe(el, { attributes: true, attributeFilter: ['style'] }); });
    scheduleTent();
  }
  function watchSpeed() {
    var box = $('#speedbtns'); if (!box) return;
    var paint = function () { box.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false'); }); };
    new MutationObserver(paint).observe(box, { attributes: true, attributeFilter: ['class'], subtree: true }); paint();
  }


  /* ---------- pure helpers (unit-tested in tests/a11y.test.js) ---------- */
  function parseColor(c) {
    if (c && typeof c === 'object') return { r: c.r, g: c.g, b: c.b, a: c.a == null ? 1 : c.a };
    c = String(c || '').trim();
    var m = /^#([0-9a-f]{3,8})$/i.exec(c);
    if (m) {
      var h = m[1]; if (h.length === 3 || h.length === 4) h = h.replace(/./g, '$&$&');
      if (h.length !== 6 && h.length !== 8) return null;
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(c);
    if (m) { var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); if (p.length < 3 || p.some(isNaN)) return null; return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    return null;
  }
  function luminance(c) {
    c = parseColor(c); if (!c) return 0;
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  /* WCAG 2.x contrast ratio between two colours (hex or rgb()); a translucent foreground is composited over the background first */
  function contrast(fg, bg) {
    var f = parseColor(fg), b = parseColor(bg); if (!f || !b) return 0;
    if (f.a < 1) f = { r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 };
    var l1 = luminance(f), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  /* how long a caption stays: the clip's length when one plays, else a reading-time estimate (about 3 words a second, 2.4 s to 9 s), plus a short linger */
  function captionMs(text, dur) {
    if (dur > 0) return Math.round(dur * 1000) + 500;
    var n = String(text || '').split(/\s+/).filter(Boolean).length;
    return Math.max(2400, Math.min(9000, Math.round(n * 330))) + 500;
  }

  /* ---------- captions ---------- */
  var CAPKEY = 'hygrow_captions_v1', capEl = null, capBtn = null, capT = 0, capWatch = 0, capLine = null, capStv = null;
  function capOn() { try { return localStorage.getItem(CAPKEY) !== '0'; } catch (e) { return true; } }
  function capSet(b) {
    try { localStorage.setItem(CAPKEY, b ? '1' : '0'); } catch (e) {}
    if (!b) capClear();
    capSync();
  }
  function capSync() { if (!capBtn) return; capBtn.setAttribute('aria-pressed', capOn() ? 'true' : 'false'); capBtn.title = capOn() ? 'Captions on: spoken lines also appear in a strip under the header' : 'Captions off'; }
  /* anything the strip must never sit on top of: the learned card, toasts, the action bar and pager, a modal card, the story dialog, a floating bubble (the lesson strip is not one: the strip sits below it) */
  var CAP_OBSTACLES = '#learnCard.in,#learnCard.out,#toast.show,#cardToast.show,#soundChip,.fx-stage,#actionbar,#stripDots,#swipeHint,#a2hs,body.spotting #bubble,.modal.show .card,.stv';
  function intersects(a, b) { return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5; }
  /* v36b: is Axel's panel (and so his bubble) on screen? An IntersectionObserver keeps the answer; before it reports, a rect check. */
  var axelVis = null, axelIO = null;
  function axelOnScreen() {
    try {
      var q = $('#quinn'); if (!q) return false;
      if (window.IntersectionObserver && !axelIO) { axelIO = new IntersectionObserver(function (en) { axelVis = !!(en[en.length - 1] && en[en.length - 1].isIntersecting); }, { threshold: 0.35 }); axelIO.observe(q); }
      if (axelVis !== null) return axelVis;
      var r = q.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight;
    } catch (e) { return false; }
  }
  function capPlace() {
    if (!capEl || !capEl.textContent) return;
    var hdr = $('header'), hb = hdr ? hdr.getBoundingClientRect().bottom : 0, st = $('#bgStrip');
    if (st && st.getClientRects().length) hb = Math.max(hb, st.getBoundingClientRect().bottom);
    capEl.style.top = Math.max(8, hb + 8) + 'px';
    /* centred over the stage (the tent column on a wide screen, so Axel's own bubble beside it is never covered), else over the viewport */
    var tn = $('#tent'), tr = tn && tn.getClientRects().length ? tn.getBoundingClientRect() : null, vw = document.documentElement.clientWidth || window.innerWidth;
    capEl.style.left = (tr && tr.width > 200 ? tr.left + tr.width / 2 : vw / 2) + 'px';
    capEl.style.maxWidth = Math.max(180, Math.min(520, (tr && tr.width > 200 ? tr.width : vw) - 16)) + 'px';
    capEl.classList.add('cap-show');
    var r = capEl.getBoundingClientRect(), clash = axelOnScreen() && capLine && (WHO[capLine.who] || capLine.who) === 'Axel'; /* v36b: Axel's own panel is on screen with his bubble: the pill would say it twice */
    Array.prototype.forEach.call(document.querySelectorAll(CAP_OBSTACLES), function (o) {
      if (clash || o === capEl || !o.getClientRects().length) return;
      var cs = getComputedStyle(o); if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return;
      if (intersects(r, o.getBoundingClientRect())) clash = true;
    });
    /* clipped but still in the live region: screen readers get the line, nothing is covered */
    capEl.classList.toggle('cap-show', !clash);
  }
  function capClear() {
    clearTimeout(capT); clearInterval(capWatch); capT = capWatch = 0; capLine = null;
    if (capEl) { capEl.textContent = ''; capEl.classList.remove('cap-show'); }
    if (capStv) capStv.textContent = '';
  }
  function stvNode() {
    var s = $('.stv'); if (!s) return null;
    var n = s.querySelector('.stv-cap');
    if (!n) { n = document.createElement('div'); n.className = 'stv-cap sr-only'; n.setAttribute('aria-live', 'polite'); n.setAttribute('aria-atomic', 'true'); s.appendChild(n); }
    return n;
  }
  var WHO = { axel: 'Axel', deb: 'Deb', rob: 'Rob', regular: 'Kez', kez: 'Kez' };
  function capLineIn(d) {
    var text = d.text, who = WHO[d.who] || d.who || '';
    clearTimeout(capT); clearInterval(capWatch);
    capLine = d;
    var inStory = stvNode();
    /* the story dialogue already prints its lines on screen: only the live node inside the dialog is needed there (it was silent before) */
    if (inStory) {
      capStv = inStory; inStory.textContent = '';
      setTimeout(function () { if (capLine === d) inStory.textContent = (who ? who + ': ' : '') + text; }, 40);
      if (capEl) { capEl.textContent = ''; capEl.classList.remove('cap-show'); }
      return;
    }
    if (!capOn() || !capEl) return;
    capEl.classList.remove('cap-show');
    capEl.textContent = '';
    setTimeout(function () {
      if (capLine !== d) return;
      capEl.textContent = '';
      var b = document.createElement('b'); b.textContent = who ? who + ': ' : '';
      capEl.appendChild(b); capEl.appendChild(document.createTextNode(text));
      capPlace();
    }, 40);
    capWatch = setInterval(capPlace, 300);
    capT = setTimeout(function () { if (capLine === d) capClear(); }, captionMs(text, d.dur));
  }
  function capEnd() {
    /* the clip ended or was cut (dismissed bubble, mute, Voice off, a new line): drop the strip */
    var d = capLine; if (!d) return;
    clearTimeout(capT);
    capT = setTimeout(function () { if (capLine === d) capClear(); }, d.voiced ? 350 : 0);
  }
  function onVoice(e) {
    var d = e && e.detail; if (!d) return;
    if (d.type === 'line' && d.text) capLineIn(d); else if (d.type === 'end') capEnd();
  }
  function mountCaptions() {
    capEl = document.createElement('div'); capEl.id = 'captions'; capEl.setAttribute('role', 'status'); capEl.setAttribute('aria-live', 'polite'); capEl.setAttribute('aria-atomic', 'true');
    document.body.appendChild(capEl);
    var host = $('#hextras');
    if (host) {
      capBtn = document.createElement('button'); capBtn.type = 'button'; capBtn.id = 'capBtn'; capBtn.className = 'menu'; capBtn.textContent = 'Captions';
      capBtn.setAttribute('aria-label', 'Captions on or off');
      capBtn.onclick = function () { capSet(!capOn()); };
      var anchor = $('#voiceBtn') || $('#mute');
      if (anchor && anchor.parentNode === host) anchor.insertAdjacentElement('afterend', capBtn); else host.appendChild(capBtn);
      capSync();
    }
    window.addEventListener('hygrow:voice', onVoice);
    document.addEventListener('visibilitychange', function () { if (document.hidden) capClear(); });
    window.addEventListener('resize', capPlace);
  }

  /* ---------- small state mirrors: sound toggle, pager dots, More sheet ---------- */
  function watchMute() {
    var m = $('#mute'); if (!m) return;
    var OFF = [String.fromCharCode(0xD83D, 0xDD07), String.fromCharCode(0xD83D, 0xDD08)]; /* the muted speaker icons ui.js puts in the button */
    var paint = function () { var t = m.textContent; m.setAttribute('aria-pressed', t.indexOf(OFF[0]) >= 0 || t.indexOf(OFF[1]) >= 0 ? 'false' : 'true'); };
    new MutationObserver(paint).observe(m, { childList: true, characterData: true, subtree: true }); paint();
  }
  function watchDots() {
    var box = $('#stripDots'); if (!box) return;
    var paint = function () { box.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-current', b.classList.contains('on') ? 'true' : 'false'); }); };
    new MutationObserver(paint).observe(box, { attributes: true, attributeFilter: ['class'], subtree: true }); paint();
  }

  /* v37: every link or chip a thumb can reach is at least 44 px tall on a phone (an a11y probe found the setup "in store" links at 15 px, the Grower's card crop chips at 40 px and an Almanac link at 36 px). Styles live here so the layout files stay untouched. */
  /* v37: a reading tile's state was colour only (a 6 px border): every orange or red tile now carries a short state word in its accessible name and a visible mark that does not rely on hue. */
  function tileStates() {
    Array.prototype.forEach.call(document.querySelectorAll('#readings .rd'), function (t) {
      var st = t.classList.contains('bad') ? 'way off' : t.classList.contains('warn') ? 'a bit off' : '';
      var el = t.querySelector('.rdstate');
      if (!st) { if (el) el.remove(); t.removeAttribute('data-state'); return; }
      if (!el) { el = document.createElement('i'); el.className = 'rdstate'; el.setAttribute('aria-hidden', 'false'); var first = t.querySelector('span'); if (first) first.appendChild(el); else t.insertBefore(el, t.firstChild); }
      var want = (t.classList.contains('bad') ? ' ! ' : ' ~ ') + st; if (el.textContent !== want) el.textContent = want;
      t.setAttribute('data-state', st);
    });
  }
  function tapTargets() {
    var st = document.createElement('style'); st.id = 'a11yTap';
    st.textContent = '#readings .rd .rdstate{font-style:normal;font-size:11px;font-weight:800;letter-spacing:.3px;margin-left:4px;opacity:.9}#readings .rd.bad .rdstate{color:#ffb8b0}#readings .rd.warn .rdstate{color:#ffd9a8}' + '@media (max-width:520px){.gear .mini{display:inline-flex;align-items:center;min-height:44px;padding:0 6px;margin:-8px -6px -8px -6px}' +
      'html body #growersCard .gchips a{min-height:44px}html body #almanac .ae a{display:inline-flex;align-items:center;min-height:44px;box-sizing:border-box}}';
    document.head.appendChild(st);
  }
  function init() {
    live = document.createElement('div'); live.id = 'a11y-say'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    document.body.appendChild(live);
    document.addEventListener('pointerdown', function (e) { lastDown = e.target.closest ? e.target.closest(FOCUS) : null; rdKey = null; }, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', function (e) { var t = e.target; if (t && t.closest && !t.closest('.modal,[role=dialog]') && t !== document.body) lastDown = t; }, true);
    var syncT = 0; /* v37: the observer fired 35 to 66 times a second (every render rewrites #readings) and each sync measured dialogs with getBoundingClientRect: 4 to 5 % of the main thread, 19 s per minute on a slow phone. Mutations are coalesced into one sync per 80 ms. */
    new MutationObserver(function () { if (syncT) return; syncT = setTimeout(function () { syncT = 0; sync(); }, 80); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    var skipDock = document.getElementById('skipDock'); if (skipDock) skipDock.addEventListener('click', function (e) { e.preventDefault(); var b = document.querySelector('#dock button:not([disabled])') || document.getElementById('moreBtn'); if (b) { try { b.focus(); } catch (er) {} } }); /* v37 [m7] skip link: first action button */
    mountSkipBar(); watchBubble(); watchBanner(); watchReadings(); watchSpeed(); watchMute(); watchDots(); mountCaptions(); tapTargets();
    setTimeout(function () { var q = $('.quinn-svg'); if (q) q.setAttribute('aria-hidden', 'true'); sync(); }, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.A11y = { announce: announce, refresh: function () { sync(); tentLabel(); }, top: top, contrast: contrast, luminance: luminance, parseColor: parseColor, captionMs: captionMs, captionsOn: capOn, setCaptions: capSet };
})();
