/* HyGrow Grow Sim - away.js : "While you were away" catch-up. Axel keeps the tent ticking over while the player is gone. */
(function () {
  'use strict';
  var MIN_AWAY_H = 2, RATE = 1, CAP_H = 72, MAX_GAP_H = 7 * 24, /* [m6] the saved clock is trusted for at most 7 game days, whatever CAP_H is set to */ MIN_DAY = 2, MIN_HEALTH = 50, TANK_FLOOR = 0.3;
  var hiddenAt = 0;
  var esc = function (s) { return window.escHtml ? window.escHtml(s) : String(s == null ? '' : s).replace(/[&<>"]/g, ''); }; /* [m6] ui.js owns the one escape; the fallback only drops markup characters if it is ever missing */
  var G = function () { return window.__game; };
  var titleUp = function () { var t = document.getElementById('title'); return !t || t.classList.contains('show'); };

  function css() {
    if (document.getElementById('awayCss')) return;
    var st = document.createElement('style'); st.id = 'awayCss';
    st.textContent = '#away .card{max-width:480px}#away .arow{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line,#ccc);font-size:15px}#away .arow b{font-family:var(--display)}#away .aprob{margin:12px 0 0;padding:10px 12px;border:2px solid var(--line,#ccc);border-radius:12px;font-size:14px}#away .anote{margin:10px 0 0;font-size:14px}';
    document.head.appendChild(st);
  }
  function fmt(v, d) { return typeof v === 'number' ? (+v.toFixed(d)).toString() : '-'; }
  function row(label, a, b, d, unit) {
    if (typeof a !== 'number' && typeof b !== 'number') return '';
    unit = unit || '';
    return '<div class="arow"><span>' + label + '</span><b>' + fmt(a, d) + unit + ' → ' + fmt(b, d) + unit + '</b></div>';
  }
  function lesson(res) {
    var worst = null;
    res.events.forEach(function (e) { if (e && e.type === 'problem' && (!worst || (e.severity || 0) >= (worst.severity || 0))) worst = e; });
    if (!worst) return null;
    var line = '';
    try {
      var d = (Sim.diagnose(G().S) || []).filter(function (x) { return x.id === worst.id; })[0];
      if (d) line = d.why || d.fix || '';
    } catch (e) { /* fall through */ }
    if (!line) line = worst.text || '';
    return { title: worst.title || 'A problem came up', line: line };
  }
  function show(hours, res, topped) {
    css();
    var old = document.getElementById('away'); if (old) old.remove();
    var b = res.before, a = res.after, days = Math.floor(hours / 24), hrs = hours % 24;
    var span = (days ? days + ' day' + (days > 1 ? 's' : '') : '') + (days && hrs ? ' ' : '') + (hrs ? hrs + ' hour' + (hrs > 1 ? 's' : '') : '');
    var ready = a && !a.cropDone && ((a.plant && a.plant.ripeKg > 0.2) || a.mature);
    var p = lesson(res), h = '';
    var mc = null; try { mc = window.methodCopy ? window.methodCopy() : null; } catch (e) {} /* [M7] */
    var place = !mc ? 'tent' : mc.out ? (mc.where === 'veranda' ? 'veranda' : 'garden') : mc.tank ? 'tent' : 'pots';
    h += '<h2>While you were away</h2><p class="anote">Axel minded the ' + place + ' for ' + esc(span) + ' of grow time.</p>';
    if (mc && !mc.tank) h += (typeof b.moisture === 'number' ? row('Moisture', b.moisture * 100, a.moisture * 100, 0, '%') : '') + (mc.how === 'coco' ? row('EC', b.ec, a.ec, 2) + row('pH', b.ph, a.ph, 2) : '') + row('Humidity', b.rh, a.rh, 0, '%') + row('Health', b.health, a.health, 0);
    else h += row('Tank (L)', b.reservoirL, a.reservoirL, 1) + row('pH', b.ph, a.ph, 2) + row('EC', b.ec, a.ec, 2) + row('Humidity', b.rh, a.rh, 0, '%') + row('Health', b.health, a.health, 0);
    h += '<div class="arow"><span>Growth stage</span><b>' + esc(b.stage === a.stage ? a.stage : b.stage + ' → ' + a.stage) + '</b></div>';
    if (ready) h += '<p class="anote"><b>Something is ready to pick!</b></p>';
    if (topped && !(mc && !mc.tank)) h += '<p class="anote">Axel topped up the tank so it never ran dry.</p>';
    else if (topped) h += '<p class="anote">Axel watered the ' + (mc.vessel === 'bed' ? 'bed' : 'pots') + ' so they never ran dry.</p>';
    if (p) h += '<div class="aprob"><b>' + esc(p.title) + '</b><br>' + esc(p.line) + (p.line ? '<br>' : '') + '<i>Axel: keep an eye on that one next time.</i></div>';
    var m = document.createElement('div'); m.className = 'modal show'; m.id = 'away';
    m.innerHTML = '<div class="card" role="dialog" aria-modal="true" aria-label="While you were away">' + h + '<div class="foot"><button class="big" id="awayOk">Thanks, Axel</button></div></div>';
    document.body.appendChild(m);
    var close = function () { m.remove(); };
    document.getElementById('awayOk').onclick = close;
  }

  /* [m6] the real gap goes in the Journal (S.__awayLog, shown by ui.js showJournal): a wrong or jumped clock is then visible instead of silently buying free growth */
  function note(S, real, covered) {
    try { var log = S.__awayLog || (S.__awayLog = []); log.push({ d: Math.floor(Sim.readings(S).day), realH: Math.round(real * 10) / 10, gameH: covered }); if (log.length > 20) log.shift(); } catch (e) { if (window.console) console.warn('[HyGrow] away note:', e && e.message || e); }
  }
  function run(hoursAway) {
    var g = G(); if (!g || !g.S || !g.catchUp || titleUp()) return false;
    var rd0; try { rd0 = Sim.readings(g.S); } catch (e) { return false; }
    if (rd0.cropDone || rd0.day < MIN_DAY || rd0.health < MIN_HEALTH) return false;
    var hours = Math.min(CAP_H, MAX_GAP_H, Math.floor(hoursAway * RATE));
    if (hours < 1) return false;
    var topped = false;
    var pre = function (S) {
      if (topped || S.resL / S.cap >= TANK_FLOOR) return;
      /* Axel mixes it like the Prof's chart (nutrient water keeps pH near 6.3); plain water only if EC is already above target */
      try { var r = Sim.readings(S), hi = r.targets && r.targets.ec && r.targets.ec[1], wn = !(typeof r.ec === 'number' && hi && r.ec > hi);
        Sim.act(S, 'topUp', { litres: S.cap - S.resL, withNutrients: wn }); topped = true; if (S.ph > 6.3) S.ph = 6.2; /* Axel also dips the pH back down */ } catch (e) { /* ignore */ }
    };
    var res = g.catchUp(hours, pre);
    if (!res || !res.before || !res.after) return false;
    note(g.S, hoursAway, hours);
    show(hours, res, topped);
    return true;
  }

  function check(savedAt) {
    if (!savedAt || typeof savedAt !== 'number') return false;
    var h = (Date.now() - savedAt) / 3600000;
    if (!(h >= MIN_AWAY_H)) return false;
    return run(h);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    var t = hiddenAt; hiddenAt = 0;
    if (t && (Date.now() - t) / 3600000 >= MIN_AWAY_H) run((Date.now() - t) / 3600000);
  });

  window.Away = { check: check, run: run };
})();
