/* HyGrow Grow Sim - daily.js : Daily round (3 tiny tasks) + gentle streak. localStorage only, never punishes. */
(function () {
  'use strict';
  var KEY = 'hygrow_daily_v1';
  /* v37 tasks per grow method: every task can be finished by an action that exists in Sim.actionsFor(S) for that method (tests/copy-lint.test.js checks it). */
  var ACT = { phUp: 'ph', phDown: 'ph', topUp: 'tank', prune: 'pest', spray: 'pest', ask: 'pest' }; /* v37 */
  var MKEY = 'hygrow_daily_method_v1';
  function methodNow() { try { var g = window.__game && window.__game.S; if (g && g.method) { try { localStorage.setItem(MKEY, JSON.stringify(g.method)); } catch (e) {} return g.method; } } catch (e) {} try { var m = JSON.parse(localStorage.getItem(MKEY) || ''); if (m && m.how) return m; } catch (e) {} return { where: 'tent', how: 'hydro' }; } /* v52 (play-test #10 #16): the title card after a coco grow listed the hydro round (Check the tank); the last method is remembered */
  function tasksFor(m) { /* v37 */
    m = m || methodNow(); var how = m.how || 'hydro';
    var pest = { id: 'pest', label: 'Pest scout', hint: 'Prune, use a pest spray, or ask Axel.', acts: ['prune', 'spray', 'ask'] };
    if (how === 'soil') return [
      { id: 'ph', label: 'Check the Soil tile', hint: 'Tap the Soil tile to see how wet it is.', acts: ['water', 'feed'], tile: 'moisture' },
      { id: 'tank', label: 'Water when under 45 %', hint: 'Water the soil when the tile drops under 45 %, or give it a feed once this week.', acts: ['water', 'feed'] }, pest];
    if (how === 'coco') return [
      { id: 'ph', label: 'Check Coco', hint: 'Tap the Coco tile, or set pH up or down.', acts: ['phUp', 'phDown'], tile: 'moisture' },
      { id: 'tank', label: 'Feed or water through', hint: 'Feed, or water through once so the salts wash out.', acts: ['feed', 'water'] }, pest];
    return [
      { id: 'ph', label: 'Check the pH', hint: 'Press pH up or pH down, or tap the pH reading.', acts: ['phUp', 'phDown'], tile: 'ph' },
      { id: 'tank', label: 'Check the tank', hint: 'Top up, or tap the Tank reading when it is 60 % or more full.', acts: ['topUp'], tile: 'reservoirL' }, pest];
  }
  var SIGN = [
    'That is the daily round done. Nice one. Same again tomorrow, no rush.',
    'All three ticked. The plants noticed. See you tomorrow!',
    'Round complete. Everything looked at. Proper grower.'
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function dayNum(s) { var p = String(s).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function blank() { return { date: today(), done: { ph: false, tank: false, pest: false }, streak: 0, lastDone: null, coins: 0, history: [] }; }

  var st = null;
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s || typeof s !== 'object') s = blank();
    s.done = s.done || {}; s.done = { ph: !!s.done.ph, tank: !!s.done.tank, pest: !!s.done.pest };
    s.streak = +s.streak || 0; s.coins = +s.coins || 0; s.history = Array.isArray(s.history) ? s.history : [];
    s.lastDone = s.lastDone || null;
    if (s.date !== today()) { s.date = today(); s.done = { ph: false, tank: false, pest: false }; }
    st = s;
    /* gentle reset: two or more missed days in a row (gap of 3+ days since last done) */
    if (st.lastDone && st.streak && gap() >= 3) { st.streak = 0; }
    return st;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function S() { return st || load(); }
  /* days since last completed round (0 = today) */
  function gap() { return st.lastDone ? dayNum(today()) - dayNum(st.lastDone) : 0; }
  function count() { var d = S().done, n = 0; for (var k in d) if (d[k]) n++; return n; }
  function complete() { return count() === 3; }
  /* paused = streak held, yesterday's round was missed (exactly one missed day) */
  function paused() { S(); return st.streak > 0 && !complete() && gap() === 2; }
  function resetNote() { S(); return !st.lastDone ? false : (st.streak === 0 && gap() >= 3 && st.history.length > 0); }

  function addCoins(n, why) {
    S(); st.coins = Math.max(0, st.coins + (+n || 0)); save(); refresh();
    return st.coins;
  }
  function say(text, opts) {
    try { document.dispatchEvent(new CustomEvent('hygrow:say', { detail: { text: text, opts: opts || {} } })); } catch (e) {}
  }
  function finish() {
    var t = today(), g = st.lastDone ? dayNum(t) - dayNum(st.lastDone) : 0;
    if (!st.lastDone) st.streak = 1;
    else if (g === 1 || g === 2) st.streak += 1; /* g===2: one missed day, paused not broken */
    else st.streak = 1;
    st.lastDone = t;
    if (st.history.indexOf(t) < 0) st.history.push(t);
    if (st.history.length > 120) st.history = st.history.slice(-120);
    var bonus = st.streak >= 3 ? 5 : 0;
    st.coins += 10 + bonus;
    save();
    try { if (window.Sfx) Sfx.play('chapterDone'); } catch (e) {}
    if (window.__game && window.__game.S) {
      say(SIGN[st.streak % SIGN.length] + ' +' + (10 + bonus) + ' Axel coins' + (st.streak > 1 ? ' · streak ' + st.streak : '') + '.', { hop: true });
    }
  }
  function mark(id) {
    S();
    if (!(id in st.done) || st.done[id]) return false;
    st.done[id] = true;
    var all = complete();
    if (all) finish(); else save();
    refresh();
    return true;
  }
  function soilLow() { try { var g = window.__game && window.__game.S; return !g || !g.cap || g.resL / g.cap < 0.45; } catch (e) { return true; } } /* v47 */
  function phOut() { try { var g = window.__game && window.__game.S, b = g && window.Sim && Sim.stageInfo(g).ph; return !b || typeof g.ph !== 'number' || g.ph < b[0] || g.ph > b[1]; } catch (e) { return true; } } /* v47 */
  function act(id) { /* v37 */
    var m = methodNow(), t = ACT[id];
    if (m.how === 'soil' || m.how === 'coco') { if (id === 'water' || id === 'feed') { if (m.how === 'coco') mark('tank'); else if (soilLow()) { mark('tank'); mark('ph'); } } } /* v47: on soil a drink only counts when it was low before the tap */
    if (t && (id === 'phUp' || id === 'phDown') && !phOut()) t = null; /* v47: a pH dose only counts as a check when the pH was out of band */
    if (t) mark(t);
    if (id === 'topUp') mark('tank');
  }

  /* viewing readings counts (pH always; tank only when >= 60% full) */
  function tankFull() {
    try { var g = window.__game && window.__game.S; if (g && g.cap) return g.resL / g.cap >= 0.6; } catch (e) {}
    return false;
  }
  function onView(e) {
    var r = e.target && e.target.closest && e.target.closest('#readings .rd');
    if (!r) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    var k = r.getAttribute('data-reading');
    var m = methodNow(); /* v37 */
    if (m.how === 'soil' || m.how === 'coco') { if (k === 'moisture') mark('ph'); else if (k === 'ph' && m.how === 'coco') mark('ph'); return; }
    if (k === 'ph') mark('ph'); else if (k === 'reservoirL' && tankFull()) mark('tank');
  }
  document.addEventListener('pointerup', onView, true);
  document.addEventListener('keydown', onView, true);

  /* ---------- UI ---------- */
  var css = '.dly{background:var(--panel2);border:2px solid var(--line);border-radius:14px;padding:10px 12px;margin:0 0 8px;font-size:14px}' +
    '.dly b{font-family:var(--display)}.dly-row{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:4px}' +
    '.dly-t{display:inline-flex;align-items:center;gap:5px;color:var(--muted)}.dly-t i{font-style:normal;display:inline-grid;place-items:center;width:18px;height:18px;border:2px solid var(--line);border-radius:6px;font-size:12px;color:var(--ink)}' +
    '.dly-t.on{color:var(--text)}.dly-t.on i{background:var(--orange);border-color:var(--orange)}' +
    '.dly-m{margin-top:6px;color:var(--muted);font-size:13px;overflow-wrap:anywhere}' +
    '#dlyWrap{position:relative;display:inline-flex;min-width:0}#dlyPill{position:relative;min-width:0;padding-left:6px;padding-right:6px;white-space:nowrap}#dlyPill.full{border-color:var(--orange)}' +
    '#dlyPop{box-sizing:border-box;overflow-wrap:anywhere;white-space:normal;position:absolute;z-index:60;right:0;top:calc(100% + 6px);width:min(260px,86vw);background:var(--panel);border:2px solid var(--orange);border-radius:12px;padding:10px 12px;box-shadow:0 6px 24px #000a;text-align:left;font-size:13px;display:none}' +
    '#sheetExtras #dlyWrap{flex-wrap:wrap}#sheetExtras #dlyPop{position:static;order:-1;flex:1 1 100%;width:auto;margin-bottom:6px;box-shadow:none}#sheetExtras #dlyWrap>#dlyPill{flex:1 1 auto}' + /* v68: on a phone the pill sits at the foot of the More sheet; v69 (play-test #20 m8, critic round 17 n1): its list takes its own room above the pill instead of covering the stats row */
    '#dlyPop.show{display:block}#dlyPop .dly-t{display:flex;margin:4px 0}#dlyPop small{display:block;font-weight:400;color:var(--muted);margin-left:23px}';
  var styled = false;
  function addCss() { if (styled) return; styled = true; var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }

  function streakText() {
    S();
    if (paused()) return 'Streak ' + st.streak + ' (paused)';
    if (resetNote()) return 'Streak reset — no stress, start again';
    return 'Streak ' + st.streak;
  }
  function ticks() {
    return tasksFor().map(function (t) { var on = st.done[t.id]; return '<span class="dly-t' + (on ? ' on' : '') + '"><i>' + (on ? '✓' : '') + '</i>' + t.label + '</span>'; }).join('');
  }
  var titleEl = null, pill = null, pop = null;
  function mountTitle(root) {
    if (!root) return; addCss(); S();
    var host = root.querySelector('.tbody') || root.querySelector('.titlecard') || root;
    if (!titleEl || !titleEl.isConnected) { titleEl = document.createElement('div'); titleEl.className = 'dly'; titleEl.id = 'dlyTitle'; }
    paintTitle();
    /* normally paintTitle parks #dlyTitle in the Today strip (TitleToday, index.html); fall back to the old spot above the modes */
    if (!titleEl.isConnected) { var modes = host.querySelector('.modes'); if (modes) modes.parentNode.insertBefore(titleEl, modes); else host.appendChild(titleEl); }
  }
  function paintTitle() {
    if (!titleEl) return; S();
    titleEl.innerHTML = '<b>Daily round ' + count() + '/3</b><div class="dly-row">' + ticks() + '</div>' +
      '<div class="dly-m">' + streakText() + ' · ' + st.coins + ' Axel coins</div>';
    if (window.TitleToday) TitleToday.set('daily', 1, titleEl, [{ text: 'Daily ' + (complete() ? '✓' : count() + '/3') + ' · ' + st.coins + ' coins', cls: complete() ? 'done' : '' }]);
  }
  function mountHud(host) {
    if (!host) return; addCss(); S();
    if (pill && pill.isConnected) return;
    pill = document.createElement('button'); pill.id = 'dlyPill'; pill.className = 'menu'; pill.type = 'button'; pill.title = 'Daily round';
    /* v68 (round 16 keyboard m3): a disclosure, not a dialog inside the button: the task list sits beside the pill (a button's children are hidden from screen readers), the pill says whether it is open, Escape or leaving it closes it */
    pill.setAttribute('aria-expanded', 'false'); pill.setAttribute('aria-controls', 'dlyPop');
    var wrap = document.createElement('span'); wrap.id = 'dlyWrap'; wrap.appendChild(pill); host.appendChild(wrap);
    pop = document.createElement('div'); pop.id = 'dlyPop'; pop.setAttribute('role', 'region'); pop.setAttribute('aria-label', 'Daily round'); wrap.appendChild(pop);
    var setOpen = function (on) { pop.classList.toggle('show', on); pill.setAttribute('aria-expanded', String(on)); };
    pill.onclick = function () { setOpen(!pop.classList.contains('show')); try { if (window.Sfx) Sfx.play('click'); } catch (x) {} paintHud(); };
    document.addEventListener('pointerdown', function (e) { if (pop && pop.classList.contains('show') && !e.target.closest('#dlyWrap')) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop && pop.classList.contains('show')) { e.stopPropagation(); setOpen(false); /* only the list closes; the More sheet stays */ try { pill.focus(); } catch (x) {} } });
    wrap.addEventListener('focusout', function (e) { if (pop.classList.contains('show') && !(e.relatedTarget && wrap.contains(e.relatedTarget))) setOpen(false); });
    paintHud();
  }
  function paintHud() {
    if (!pill) return; S();
    var n = count();
    var lbl = pill.firstChild && pill.firstChild.nodeType === 3 ? pill.firstChild : null;
    var txt = n === 3 ? 'Round ✓' : 'Round ' + n + '/3';
    if (lbl) lbl.nodeValue = txt; else pill.insertBefore(document.createTextNode(txt), pill.firstChild);
    pill.classList.toggle('full', n === 3);
    pop.innerHTML = '<b>Daily round</b>' + tasksFor().map(function (t) {
      var on = st.done[t.id]; return '<div class="dly-t' + (on ? ' on' : '') + '"><i>' + (on ? '✓' : '') + '</i>' + t.label + '</div><small>' + t.hint + '</small>';
    }).join('') + '<div class="dly-m">' + streakText() + ' · ' + st.coins + ' Axel coins</div>';
  }
  function refresh() { paintTitle(); paintHud(); }

  window.Daily = Object.assign(window.Daily || {}, {
    act: act, tasksFor: tasksFor, mountTitle: mountTitle, mountHud: mountHud,
    coins: function () { return S().coins; }, addCoins: addCoins,
    state: function () { return JSON.parse(JSON.stringify(S())); }, refresh: function () { load(); refresh(); }
  });
})();
