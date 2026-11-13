/* HyGrow Grow Sim - cards.js : "You just learned..." bottom-sheet cards + the Almanac Basics shelf. Global: window.Cards.
   Listens for document 'hygrow:learned' ({id,title,text}) emitted by ui.js (first use of each control, v36) and beginner.js. Seen ids persist in hygrow_cards_v1 {seen:[ids], when:{}}. No hard deps (Fx, Sfx, Daily optional). */
(function () {
  'use strict';
  var KEY = 'hygrow_cards_v1', AUTO_MS = 9000, TOAST_MS = 2000, COIN = 5;
  /* id -> [short name, one plain sentence, 25-word tip, glyph svg inner] */
  var STROKE = 'fill="none" stroke="#f0f4f0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
  var DATA = {
    feed: ['Feed', 'Nutrients are the plant\'s food, and how strong your mix is gets measured as EC (feed strength).', /* v37 */
      'Mix feed a little at a time and recheck EC against the stage target. Young plants want it weak; fruiting plants want it much stronger.',
      '<path d="M20 6h8v12l9 18a5 5 0 0 1-4.5 7h-17A5 5 0 0 1 11 36l9-18z" fill="#6ec846" stroke="#f0f4f0" stroke-width="3" stroke-linejoin="round"/><path d="M17 6h14" ' + STROKE + '/><path d="M15 30h18" stroke="#080808" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>'],
    ph: ['pH', 'pH tells you how acid or alkaline your water is. Each crop has its own window, about 5.5 to 6.5.' /* v37 */,
      'Check pH after every feed. Too high locks out iron, too low harms roots. Nudge it with pH up or pH down in very small steps.',
      '<rect x="6" y="18" width="36" height="12" rx="6" fill="none" stroke="#f0f4f0" stroke-width="3"/><path d="M12 24h6" stroke="#e2453a" stroke-width="5" stroke-linecap="round"/><path d="M21 24h6" stroke="#6ec846" stroke-width="5" stroke-linecap="round"/><path d="M30 24h6" stroke="#6aa8e8" stroke-width="5" stroke-linecap="round"/><path d="M24 14l-4-7h8z" fill="#ec8024"/>'],
    light: ['Light', 'Light is the plant\'s energy, so the right amount for the right hours helps it grow fast.',
      'Seedlings want gentle light and long days. Flowering crops want more punch. Watch tent heat, since stronger lights also run hotter and dry the air.',
      '<circle cx="24" cy="24" r="9" fill="#f2b950" stroke="#f0f4f0" stroke-width="3"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4 4M33.5 33.5l4 4M10.5 37.5l4-4M33.5 14.5l4-4" ' + STROKE + '/>'],
    water: ['Water', 'The tank is your plant\'s drink, and it needs topping up before it runs low.',
      'Plants drink more as they grow and as the air gets hotter. Top up before the tank falls under 20% or the plants wilt.',
      '<path d="M24 5Q36 22 36 30a12 12 0 0 1-24 0Q12 22 24 5z" fill="#6fc3e8" stroke="#f0f4f0" stroke-width="3" stroke-linejoin="round"/><path d="M18 30q0 6 6 7" ' + STROKE + '/>'],
    air: ['Air', 'Fresh moving air keeps the tent cool and stops mould and mildew from settling in.',
      'Run the fan to clear heat and stale air. A slower fan holds humidity in; faster pulls it out. Aim for steady air, no gale.',
      '<circle cx="24" cy="24" r="4" fill="#f0f4f0"/><path d="M24 20c-2-8 2-13 8-12 4 1 3 7-2 9-2 1-4 2-6 3zM28 24c8-2 13 2 12 8-1 4-7 3-9-2-1-2-2-4-3-6zM24 28c2 8-2 13-8 12-4-1-3-7 2-9 2-1 4-2 6-3zM20 24c-8 2-13-2-12-8 1-4 7-3 9 2 1 2 2 4 3 6z" fill="#6aa8e8" stroke="#f0f4f0" stroke-width="2" stroke-linejoin="round"/>'],
    prune: ['Pruning', 'Pruning means snipping off extra leaves so air and light reach the parts that matter.',
      'Trim crowded or yellow leaves, never more than a third at once. Better airflow means fewer mould problems and more energy going into the fruit.',
      '<circle cx="14" cy="36" r="6" ' + STROKE + '/><circle cx="34" cy="36" r="6" ' + STROKE + '/><path d="M18 31L34 7M30 31L14 7" ' + STROKE + '/>'],
    harvest: ['Pick', 'Picking is taking your crop at the right moment, when it is ripe and full of flavour.' /* v37 */,
      'Pick when the crop looks ripe, not just big. Basil regrows after a cut, and tomato, chilli, capsicum, strawberry and cucumber keep fruiting, so pick the ripe ones each time. A lettuce head is one cut and ends the crop.' /* v47 */,
      '<path d="M7 22h34l-4 18a3 3 0 0 1-3 2H14a3 3 0 0 1-3-2z" fill="#ec8024" stroke="#f0f4f0" stroke-width="3" stroke-linejoin="round"/><path d="M14 22l6-12M34 22l-6-12" ' + STROKE + '/><path d="M18 28v8M24 28v8M30 28v8" stroke="#080808" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>'],
    /* v36: first use of the new controls (ui.js doAct dispatches hygrow:learned the first time each one is tapped) */
    drip: ['Drip line', 'A drip line gives small drinks all day, so the roots never swing between wet and dry.',
      'Switch it on and watch the moisture tile. If the medium stays soggy, skip the next drink and let it drain. If the runoff is salty, water through once with plain water.' /* v47 */,
      '<path d="M6 8h36" ' + STROKE + '/><path d="M16 14q6 9 0 12-6-3 0-12zM32 14q6 9 0 12-6-3 0-12z" fill="#6fc3e8" stroke="#f0f4f0" stroke-width="3" stroke-linejoin="round"/><path d="M6 40h36" stroke="#9a6a3a" stroke-width="6" stroke-linecap="round"/>'],
    shade: ['Shade', 'Shade cloth takes the sting out of a hot afternoon, so leaves do not scorch.',
      'Use it on hot, bright days and take it off when it is cool or cloudy. Too much shade slows growth.',
      '<path d="M6 24Q24 4 42 24z" fill="#8a929a" stroke="#f0f4f0" stroke-width="3" stroke-linejoin="round"/><path d="M24 24v18M14 42h20" ' + STROKE + '/>'],
    slots: ['Tower slots', 'A tower grows several plants on one tank. Each slot keeps its own age, so replanting a slot at a time staggers the harvest.' /* v58 (play-test #13 #7): the first eight are planted together and ripen together */,
      'Tap a slot to pick it. Pick the ripe ones and plant again, the rest keep growing on the same feed.',
      '<rect x="17" y="4" width="14" height="38" rx="5" fill="#e8ecee" stroke="#f0f4f0" stroke-width="3"/><path d="M31 12l9-2M17 22l-9-2M31 32l9-2" ' + STROKE + '/><circle cx="42" cy="10" r="3" fill="#6ec846"/><circle cx="6" cy="20" r="3" fill="#6ec846"/><circle cx="42" cy="30" r="3" fill="#6ec846"/>'],
    problem: ['Problems', 'A warning sign means something is off, and a quick fix early saves the crop.',
      'Read the warning, check the matching reading, then change one thing at a time. The Almanac keeps a note of every single problem you meet.',
      '<path d="M24 6L44 40H4z" fill="#f2b950" stroke="#f0f4f0" stroke-width="3" stroke-linejoin="round"/><path d="M24 18v11" stroke="#080808" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="34" r="2.4" fill="#080808"/>'],
    ready: ['Ready to pick', /* v37 */ 'A ready flag means your crop has finished growing and is waiting for you.',
      'When the ready flag appears, check the plant and pick soon. Waiting too long can cost quality, and the tent still needs its usual care.',
      '<path d="M12 6v38" ' + STROKE + '/><path d="M12 8h26l-6 9 6 9H12z" fill="#6ec846" stroke="#f0f4f0" stroke-width="3" stroke-linejoin="round"/>']
  };
  /* card id -> the reading tile(s) it explains (first one on screen wins); sets data-for on the sheet and tells place()/reveal() what to keep clear */
  var FOR = { feed: ['ec'], ph: ['ph'], light: ['dli'], water: ['reservoirL', 'moisture'], air: ['rh', 'airTemp', 'vpd'], drip: ['moisture'], shade: ['shade'] };
  var ORDER = ['feed', 'ph', 'light', 'water', 'air', 'prune', 'harvest', 'drip', 'shade', 'slots', 'problem', 'ready'];
  var TOTAL = ORDER.length;

  /* v36b: a card is written for the way the player grows. window.methodCopy() (beginner.js) says tank / pot / bed; pots, soil and the garden never read "the tank is your plant's drink" or "EC".
     Each entry returns [name, sentence, tip] for that method, or null to keep the tent + tank text above. */
  var VARS = {
    water: function (m) {
      if (m.tank) return null;
      if (m.out && m.where === 'veranda') return ['Water', 'Your pots get their drink from you, with a little from the rain, so water before they dry right out.', 'Water in the cool of the morning. Pots dry faster than a bed, so check the Soil tile every day.']; /* v36d: play-test #6 read "your bed" in pots */
      if (m.out) return ['Water', 'Your bed gets its drink from you and the rain, so water it before it dries right out.', 'Water in the cool of the morning. If rain has soaked the bed, skip it and let it drain.'];
      return ['Water', m.how === 'coco' ? 'Coco drinks fast. A little water often keeps the roots happy.' : 'The soil is your plant\'s drink, and it needs water before it dries right out.', 'Water until a little runs out the bottom, then let the top dry before the next drink. A pot that stays soaked rots the roots.' /* v47 */];
    },
    feed: function (m) {
      if (m.tank) return null;
      return ['Feed', m.how === 'coco' ? 'Coco holds no food of its own, so every feed counts.' : 'Nutrients are the plant\'s food, and soil holds on to them for a while.', m.how === 'coco' ? 'Feed a little, often, and water it through with plain water now and then to wash the salts out.' : 'A weekly dose is plenty. If the tips scorch, you have overdone it: water it through.'];
    },
    light: function (m) { return m.out ? ['Light', 'Sun is the plant\'s energy. You cannot switch it on, but you can shade it.', 'Hot afternoon sun scorches leaves. Shade cloth takes the sting out of it.'] : null; },
    air: function (m) { return m.out ? ['Air', 'Wind and open air keep mould away outside.', 'You cannot switch the air on. Prune the lower leaves so it can move through.'] : null; }
  };
  function vr(id) { var d = DATA[id]; try { var mc = window.methodCopy && window.methodCopy(); if (mc && VARS[id]) { var v = VARS[id](mc); if (v) return [v[0], v[1], v[2], d[3]]; } } catch (e) {} return d; }
  var st = { seen: [], when: {} };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && Array.isArray(raw.seen)) { st.seen = raw.seen.filter(function (i) { return DATA[i]; }); st.when = raw.when || {}; } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function has(id) { return st.seen.indexOf(id) >= 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function glyph(id, size) {
    var d = DATA[id];
    return '<svg viewBox="0 0 48 48" width="' + size + '" height="' + size + '" aria-hidden="true">' + (d ? d[3] : '') + '</svg>';
  }
  function sfx(n) { try { if (window.Sfx) Sfx.play(n); } catch (e) {} }
  function cue(n) { try { if (window.Sfx && Sfx.cue) Sfx.cue(n); } catch (e) {} } /* quiet pass-4 cues: Sfx.cue checks mute first */

  /* ---------- queue + sheet ---------- */
  var queue = [], current = null, sheet = null, timer = 0, toastEl = null, toastTimer = 0;
  function titleFor(id, t) {
    var name = DATA[id] ? DATA[id][0] : (t || 'something new');
    if (t && /^you just learned/i.test(t)) return t;
    return 'You just learned: ' + name;
  }
  function toast(id) {
    if (!toastEl) {
      toastEl = document.createElement('div'); toastEl.id = 'cardToast'; toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = 'Already learned: ' + (DATA[id] ? DATA[id][0] : id);
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, TOAST_MS);
  }
  function build() {
    if (sheet) return;
    sheet = document.createElement('div'); sheet.id = 'learnCard'; sheet.setAttribute('role', 'status'); sheet.setAttribute('aria-live', 'polite');
    sheet.innerHTML = '<div class="lc-g"></div><div class="lc-t"><b class="lc-h"></b><p class="lc-p"></p></div><button class="lc-ok" type="button">Got it</button>';
    document.body.appendChild(sheet);
    sheet.querySelector('.lc-ok').addEventListener('click', function () { sfx('click'); dismiss(); });
  }
  /* phones: the sheet sits just above the fixed action bar (CSS reads --dock-h; the bar grows when Beginner unlocks more buttons) */
  var dockRO = null, mqPhone = null;
  function dockH() {
    try {
      mqPhone = mqPhone || matchMedia('(max-width: 899px)');
      var bar = document.getElementById('actionbar'), h = (mqPhone.matches && bar && bar.offsetHeight) ? bar.offsetHeight : 0;
      if (h) document.documentElement.style.setProperty('--dock-h', h + 'px'); else document.documentElement.style.removeProperty('--dock-h');
      if (!dockRO && bar && window.ResizeObserver) { dockRO = new ResizeObserver(dockH); dockRO.observe(bar); }
    } catch (e) {}
  }
  addEventListener('resize', function () { if (sheet) { dockH(); if (current) { place(); reveal(current); } } });
  /* placement: phones dock full width above the action bar (CSS, index.html #cardPlaceCss); wider screens keep the centred sheet unless it would sit over the
     reading tiles, then it anchors to the tiles' side-panel edge (--lc-r / --lc-w). --lc-h tells the toast how tall the sheet is. */
  var mqNarrow = null;
  function phone() { try { mqNarrow = mqNarrow || matchMedia('(max-width: 599px)'); return mqNarrow.matches; } catch (e) { return false; } }
  function place() {
    if (!sheet) return;
    try {
      var root = document.documentElement, rd = document.getElementById('readings'), anch = false;
      if (!phone() && rd) {
        var rr = rd.getBoundingClientRect(), w = Math.min(440, innerWidth - 24), l = (innerWidth - w) / 2;
        if (rr.width && l < rr.right && l + w > rr.left) { /* the centred sheet would overlap the tiles' column: sit just left of it */
          anch = true;
          root.style.setProperty('--lc-w', Math.max(260, Math.min(440, rr.left - 24)) + 'px');
          root.style.setProperty('--lc-r', Math.max(12, innerWidth - rr.left + 12) + 'px');
        }
      }
      sheet.classList.toggle('anch', anch);
      if (!anch) { root.style.removeProperty('--lc-w'); root.style.removeProperty('--lc-r'); }
      root.style.setProperty('--lc-h', sheet.offsetHeight + 'px');
    } catch (e) {}
  }
  function tileFor(c) {
    var ks = (c && c.tiles) || [];
    for (var i = 0; i < ks.length; i++) { var n = document.querySelector('#readings .rd[data-reading="' + ks[i] + '"]'); if (n && n.getClientRects().length) return n; }
    return null;
  }
  /* bring the explained tile into view clear of the sheet. Phones: the readings block goes to the top of the page under the sticky header (so no tile sits behind the
     docked sheet), then the explained tile is nudged up if it is still low. Cards that explain nothing only scroll if the sheet would sit over the readings. */
  function reveal(c) {
    try {
      if (phone() || (window.NoScroll && window.NoScroll())) return; /* v36b: a card never moves the page on a phone (the card sits above the bar; the trouble chips show what is wrong) */
      var n = tileFor(c), rd = document.getElementById('readings');
      if (phone()) {
        var hd = document.querySelector('header'), hb = hd ? hd.getBoundingClientRect().bottom : 0, cardTop = sheet.offsetTop, cardBot = cardTop + sheet.offsetHeight; /* offsetTop ignores the slide-in transform: where the sheet will rest */
        var rr = rd && rd.getBoundingClientRect();
        if (!n && !(rr && rr.width && rr.left < innerWidth && rr.right > 0 && rr.top < cardBot && rr.bottom > cardTop)) return;
        var el = rd || n; if (!el.scrollIntoView) return;
        el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
        var dy = el.getBoundingClientRect().top - (hb + 8);
        if (Math.abs(dy) > 1) scrollBy(0, dy);
        if (n) {
          var r = n.getBoundingClientRect(), over = r.bottom - (cardTop - 6), room = r.top - (hb + 8);
          if (over > 0 && room > 0) scrollBy(0, Math.min(over, room));
        }
      } else if (n) {
        var q = n.getBoundingClientRect();
        var hdr = document.querySelector('header'), hbm = hdr ? hdr.getBoundingClientRect().bottom : 0, shortLand = innerHeight <= 520 && innerWidth <= 899; /* v37 [M10] */
        if (shortLand && q.top >= hbm && q.top < innerHeight - 70) return; /* v37 [M10] tower landscape: the tile's top row is on screen, leave the page alone */
        if (q.top < 0 || q.bottom > innerHeight) { var dy2 = q.top < hbm ? q.top - hbm - 8 : Math.min(q.bottom - innerHeight + 8, q.top - hbm - 8); scrollBy(0, dy2); } /* v37 [M10] the least scroll that shows it */
      }
    } catch (e) {}
  }
  /* the lesson can reveal more tiles just after a card opens, so the first couple of seconds re-check that no tile sits under the sheet */
  function clash(c) {
    try {
      if (!phone()) return;
      var top = sheet.offsetTop, bot = top + sheet.offsetHeight, l = sheet.offsetLeft, r = l + sheet.offsetWidth, t = tileFor(c);
      var tiles = document.querySelectorAll('#readings .rd'), i, q;
      for (i = 0; i < tiles.length; i++) { if (!tiles[i].getClientRects().length) continue; q = tiles[i].getBoundingClientRect(); if (q.bottom > top && q.top < bot && q.right > l && q.left < r) return reveal(c); }
      if (t) { q = t.getBoundingClientRect(); if (q.left < 0 || q.right > innerWidth) reveal(c); }
    } catch (e) {}
  }
  var idleCbs = [];
  function idle() { return !current && !queue.length; }
  function flushIdle() { if (!idle()) return; var l = idleCbs.splice(0); l.forEach(function (f) { try { f(); } catch (e) {} }); }
  function whenIdle(fn) { if (typeof fn !== 'function') return; if (idle()) fn(); else idleCbs.push(fn); } /* beginner.js: the finish card waits for the last "You just learned" sheet */
  function award(id) { try { if (window.Daily && typeof Daily.addCoins === 'function') Daily.addCoins(COIN, 'learned:' + id); } catch (e) {} }
  var waitedMs = 0;
  function next() {
    if (current || !queue.length) return;
    /* v36b: one bubble at a time. Axel's bubble (or the one waiting for its Got it) goes first; the card comes up once it is closed (never later than 25 s) */
    try { if (window.Bubble && Bubble.busy() && waitedMs < 25000) { waitedMs += 600; setTimeout(next, 600); return; } } catch (e) {}
    /* v45 (play-test 7 #4): never over an open dialog (Harvest, Lost, Almanac, Journal): the card waits in the queue and comes up when the dialog closes */
    try { if (document.querySelector('.modal.show')) { setTimeout(next, 600); return; } } catch (e) {}
    waitedMs = 0;
    var c = queue.shift(); current = c;
    build(); dockH();
    sheet.querySelector('.lc-g').innerHTML = glyph(c.id, 44);
    sheet.querySelector('.lc-h').textContent = c.title;
    sheet.querySelector('.lc-p').textContent = c.text;
    if (c.tiles.length) sheet.setAttribute('data-for', c.tiles.join(' ')); else sheet.removeAttribute('data-for');
    sheet.classList.remove('out'); void sheet.offsetWidth; sheet.classList.add('in');
    place(); reveal(c);
    try { var ae = document.activeElement; if (ae && !sheet.contains(ae) && ae !== document.body) backTo = ae; if (!(ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) && !document.querySelector('.modal.show')) sheet.querySelector('.lc-ok').focus({ preventScroll: true }); } catch (e) {} /* v45: Got it is one Tab (was 11 to 12) */
    [350, 900, 1700].forEach(function (ms) { setTimeout(function () { if (current === c) { place(); clash(c); } }, ms); });
    try { if (window.Fx && Fx.pop) Fx.pop(sheet.querySelector('.lc-g')); } catch (e) {}
    cue('cardOpen'); setTimeout(function () { if (current === c) sfx('coin'); }, 170); /* two soft notes up, then the coin for the +5 */
    if (!c.paid) { c.paid = true; award(c.id); } /* v45: a parked card is not paid twice */ /* award() only runs here for an id show() has just marked seen, so a replayed lesson never pays twice */
    clearTimeout(timer); timer = setTimeout(autoOff, AUTO_MS);
  }
  /* v67 (round 16 keyboard m5): a keyboard player who is on the card keeps it (it timed out under them after 9 s); Escape closes it */
  var kbUsed = false;
  try { document.addEventListener('keydown', function (e) { kbUsed = true; if (e.key === 'Escape' && current && sheet && sheet.contains(document.activeElement)) { e.preventDefault(); dismiss(); } else if (e.key === 'Tab' && !e.shiftKey && current && sheet && sheet.contains(document.activeElement)) { var fw = backTo && backTo.isConnected && !backTo.disabled && (backTo.offsetWidth || backTo.offsetHeight) ? backTo : [].slice.call(document.querySelectorAll('#dock button')).filter(function (b) { return !b.disabled && (b.offsetWidth || b.offsetHeight); })[0]; if (fw) { e.preventDefault(); try { fw.focus({ preventScroll: true }); } catch (er) {} } } /* v71 (sweep, play-test #18 keyboard m5): Tab from the card's Got it fell off the page to BODY; it goes back into the game */ }, true); document.addEventListener('pointerdown', function () { kbUsed = false; }, true); } catch (e) {}
  function autoOff() { if (current && kbUsed && sheet && sheet.contains(document.activeElement)) { timer = setTimeout(autoOff, AUTO_MS); return; } dismiss(); }
  function dismiss() {
    if (!current) return;
    clearTimeout(timer); current = null; cue('cardClose');
    if (sheet) { giveBack(); sheet.classList.remove('in'); sheet.classList.add('out'); }
    setTimeout(function () { if (!current) { try { document.documentElement.style.removeProperty('--lc-h'); } catch (e) {} if (sheet) sheet.classList.remove('out'); } next(); flushIdle(); }, 320); /* v65 (play-test #17 keyboard M1): the closed card goes back to display:none, so its Got it leaves the page and the accessibility tree */
  }
  /* v65 (play-test #17 keyboard M1): a keyboard player's focus was left on the fading card's Got it (invisible, Enter did nothing). It goes back to the control they were on (Feed, usually) */
  var backTo = null;
  function giveBack() {
    var t = backTo; backTo = null;
    try { if (!sheet.contains(document.activeElement)) return; if (t && t.isConnected && !t.disabled && (t.offsetWidth || t.offsetHeight)) t.focus({ preventScroll: true }); else { var d0 = [].slice.call(document.querySelectorAll('#dock button')).filter(function (b) { return !b.disabled && (b.offsetWidth || b.offsetHeight); })[0]; if (d0) d0.focus({ preventScroll: true }); else document.activeElement.blur(); } } catch (e) {} /* v71 (sweep, play-test #18 keyboard m5): with nothing to go back to, Tab went on from BODY; the first dock button keeps the keyboard player in the game */
  }
  /* v45: a dialog (Harvest, Lost) is about to open over a card that is already up: put the card back at the front of the queue, it returns when the dialog closes */
  function park() {
    if (!current) return;
    clearTimeout(timer); queue.unshift(current); current = null;
    if (sheet) { giveBack(); sheet.classList.remove('in'); sheet.classList.remove('out'); }
    try { document.documentElement.style.removeProperty('--lc-h'); } catch (e) {}
    setTimeout(next, 600);
  }
  function show(d) {
    d = d || {};
    var id = String(d.id || '');
    if (!DATA[id]) return false;
    if (has(id)) { if (!d.silent) toast(id); return false; }
    if ((current && current.id === id) || queue.some(function (q) { return q.id === id; })) return false;
    /* mark seen now, so a repeat event while queued is a toast not a second card */
    st.seen.push(id); st.when[id] = Date.now(); save();
    if (d.silent) { award(id); return true; } /* counts for the Almanac shelf, no sheet (the finish card says it) */
    queue.push({ id: id, title: titleFor(id, d.title), text: d.text || vr(id)[1], /* v36b */ tiles: d.tile ? [String(d.tile)] : (FOR[id] || []) }); /* d.tile: optional data-reading key to keep in view */
    next();
    return true;
  }

  /* ---------- Almanac Basics shelf ---------- */
  function basicsHtml(_seen, tab) {
    if (tab && tab !== 'crops') return '';
    var n = count().seen;
    var h = '<div class="bhd" id="basicsShelf"><b>Basics</b><span>' + n + ' / ' + TOTAL + ' learned</span></div>';
    ORDER.forEach(function (id) {
      var d = vr(id); /* v36b */
      if (has(id)) h += '<div class="ae bas" data-key="basic:' + id + '"><div class="ahead"><span class="bg">' + glyph(id, 34) + '</span><b>' + esc(d[0]) + '</b></div><p>' + esc(d[1]) + '</p><p class="tip">Tip: ' + esc(d[2]) + '</p></div>';
      else h += '<div class="ae lock bas"><span class="q">?</span><b>???</b><small>Learn this by playing</small></div>';
    });
    return h;
  }
  function count() { return { seen: st.seen.length, total: TOTAL }; }

  document.addEventListener('hygrow:learned', function (e) { try { show(e && e.detail); } catch (err) {} });

  window.Cards = { park: park, show: show, count: count, has: has, idle: idle, whenIdle: whenIdle, basicsHtml: basicsHtml, ids: ORDER.slice(), _data: DATA };
})();
