/* HyGrow Grow Sim - events.js : WA seasonal events (Perth Royal Show order, summer heatwave scenario, Christmas tinsel).
 * Date-driven. Test any day with ?date=YYYY-MM-DD on the page URL (e.g. ?date=2026-09-28, 2027-01-15, 2026-12-10).
 * Never blocks play: everything is an optional card on the title screen plus a few Axel/Deb/Kez lines.
 * Hooks (ui.js): Events.mountTitle(#title) in showTitle, Events.onStart(S,pick,mode) in startGame, Events.onHarvest(S,endRes) in showHarvest.
 * Engine: S.setup.heatwaveC (outdoor temperature offset, deg C) is read by engine.js outdoorNow(). */
(function () {
  'use strict';
  var KEY = 'hygrow_events_v1';
  var HEAT_C = 5;
  var st = null;

  function load() {
    if (st) return st;
    var o = null;
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    o = o && typeof o === 'object' ? o : {};
    st = { show: o.show || {}, heatwave: o.heatwave || { on: false, rewardedYear: 0 }, hamper: o.hamper || { addedYear: 0 }, tinselYear: o.tinselYear || 0 };
    return st;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  /* ---- date handling: ?date=YYYY-MM-DD overrides "today" ---- */
  function nowDate() {
    try {
      var m = /[?&]date=(\d{4})-(\d{2})-(\d{2})/.exec(location.search);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
    } catch (e) {}
    return new Date();
  }
  function day(y, m, d, end) { return new Date(y, m - 1, d, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0); }

  /* Perth Royal Show actual dates (extend as announced); other years use the default order window */
  var SHOW_DATES = { 2027: '25 Sep - 2 Oct' };

  var EVENTS = {
    show: {
      id: 'show', title: 'Perth Royal Show order',
      window: function (y) { return [day(y, 9, 20), day(y, 10, 5, true)]; }
    },
    heatwave: {
      id: 'heatwave', title: 'Summer heatwave scenario',
      window: function (y) { return [day(y, 12, 1), day(y + 1, 2, 28, true)]; } /* y = year the summer starts */
    },
    hamper: {
      id: 'hamper', title: 'Christmas at the shop', /* v37 */
      window: function (y) { return [day(y, 11, 20), day(y, 12, 24, true)]; }
    }
  };

  /* which window year (if any) contains this date */
  function windowYear(ev, date) {
    var y = date.getFullYear();
    for (var k = y - 1; k <= y; k++) {
      var w = ev.window(k);
      if (date >= w[0] && date <= w[1]) return k;
    }
    return 0;
  }
  function active(date) {
    date = date || nowDate();
    var out = [];
    Object.keys(EVENTS).forEach(function (k) {
      var y = windowYear(EVENTS[k], date);
      if (y) out.push({ id: k, title: EVENTS[k].title, year: y });
    });
    return out;
  }
  function act(id) { var a = active(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }

  function say(text, opts) {
    try { document.dispatchEvent(new CustomEvent('hygrow:say', { detail: { text: text, opts: opts || { hop: true } } })); } catch (e) {}
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function prod(k) { return window.PRODUCTS && PRODUCTS[k] ? PRODUCTS[k] : null; }
  function coins(n) { try { if (window.Daily && Daily.addCoins) Daily.addCoins(n, 'event'); } catch (e) {} }

  /* v37 [B2] the Christmas hamper pitch and cart bundle are gone: nothing is offered or added to the cart. The 'hamper' event id stays as the seasonal window key. */

  /* ---- title card ---- */
  var css = '.evt{flex:1 1 100%;width:100%;margin:0 0 12px;display:grid;gap:8px}' +
    '.evt .evc{background:var(--panel2);border:2px solid var(--line);border-radius:14px;padding:10px 12px;text-align:left;overflow-wrap:anywhere}' +
    '.evt .evc b{display:block;font-family:var(--display);font-size:16px}.evt .evc p{margin:4px 0 0;font-size:13px;color:var(--muted)}' +
    '.evt .evc .evbg{position:relative;height:120px;margin:-10px -12px 8px;border-radius:12px 12px 0 0;overflow:hidden;background:#080808;pointer-events:none}' +
    '.evt .evc.show{border-color:var(--orange)}.evt .evc.heat{border-color:#e0583a}.evt .evc.ham{border-color:#4fae6a}' +
    '.evt .evc button{margin-top:8px;min-height:44px;padding:8px 14px;border-radius:12px;border:2px solid var(--line);background:var(--panel);color:var(--text);font:inherit;font-weight:700;cursor:pointer}' +
    '.evt .evc button.on{background:var(--orange);border-color:var(--orange);color:#111}';
  var styled = false;
  function addCss() { if (styled) return; styled = true; var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }

  /* 120 px scene box on top of each event card (Scene.mount from scene.js; Scene itself stills the parallax/fx under prefers-reduced-motion) */
  function bgBox(name) { return window.Scene ? '<div class="evbg" data-sc="' + name + '" aria-hidden="true"></div>' : ''; }
  function unmountBgs(el) {
    if (!window.Scene) return;
    (el || document).querySelectorAll('.evbg').forEach(function (b) { try { Scene.unmount(b); } catch (e) {} });
  }
  function mountBgs(el) {
    if (!window.Scene) return;
    (el || document).querySelectorAll('.evbg').forEach(function (b) { if (!b.firstChild) { try { Scene.mount(b, b.getAttribute('data-sc'), { aspect: false }); } catch (e) {} } });
  }
  var bgWatch = false;
  function watchTitle(root) { /* no animation loop while the title screen is hidden */
    if (bgWatch || !window.MutationObserver) return; bgWatch = true;
    new MutationObserver(function () { if (root.classList.contains('show')) mountBgs(root); else unmountBgs(root); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  function mountTitle(root) {
    if (!root) return; addCss(); load();
    var host = root.querySelector('.tbody') || root.querySelector('.titlecard') || root;
    unmountBgs(root);
    var old = host.querySelector('#evTitle'); if (old) old.remove();
    var html = '', y, pills = [];
    var showA = act('show');
    if (showA) {
      var done = st.show[showA.year];
      pills.push({ text: done ? 'Show ✓ ' + showA.year : 'Royal Show on', cls: done ? 'done' : '' });
      var when = SHOW_DATES[showA.year] ? ' The Show runs ' + SHOW_DATES[showA.year] + '.' : '';
      html += '<div class="evc show">' + bgBox('royal_show') + '<b>Perth Royal Show order ' + (done ? '✓' : '') + '</b><p>' + (done
        ? 'Show entry ✓ ' + showA.year + '. Deb is chuffed.'
        : 'Deb: "Grow a cherry tomato, 0.5 kg or more, health 70 or more, for the Show table. I will keep an eye on it."' + when) + '</p></div>';
    } else {
      var yrs = Object.keys(st.show).filter(function (k) { return st.show[k]; });
      if (yrs.length) pills.push({ text: 'Show ✓ ' + yrs[yrs.length - 1], cls: 'done' });
      if (yrs.length) html += '<div class="evc show">' + bgBox('royal_show') + '<b>Show entry ✓ ' + yrs[yrs.length - 1] + '</b><p>Your tomato made the Perth Royal Show table.</p></div>';
    }
    var hwA = act('heatwave');
    var heatPill = null;
    if (hwA) {
      pills.push(heatPill = { text: st.heatwave.on ? 'Heatwave on' : 'Heatwave off' });
      html += '<div class="evc heat">' + bgBox('heatwave_backyard') + '<b>Heatwave mode</b><p>Perth summer: outdoor temperatures +' + HEAT_C + ' °C for any new grow. Can you keep the tent in range?</p>' +
        '<button type="button" id="evHeat" class="' + (st.heatwave.on ? 'on' : '') + '" aria-pressed="' + !!st.heatwave.on + '">' + (st.heatwave.on ? 'Heatwave mode: ON' : 'Heatwave mode: off') + '</button></div>';
    }
    var hamA = act('hamper');
    if (hamA) {
      pills.push({ text: 'Christmas' }); /* v37 */
      html += '<div class="evc ham">' + bgBox('shop_christmas') + '<b>Christmas at the shop</b><p>Deb has put tinsel on the tank. Merry Christmas from Axel.</p></div>';
    }
    if (!html) { if (window.TitleToday) TitleToday.clear('events'); return; }
    var el = document.createElement('div'); el.className = 'evt'; el.id = 'evTitle'; el.innerHTML = html;
    /* Today strip (index.html TitleToday) holds #evTitle behind its pills; fall back to the old spot above the modes */
    if (!(window.TitleToday && TitleToday.set('events', 2, el, pills))) {
      var modes = host.querySelector('.modes');
      if (modes) modes.parentNode.insertBefore(el, modes); else host.appendChild(el);
    }
    mountBgs(el); watchTitle(root);
    var hb = el.querySelector('#evHeat');
    if (hb) hb.onclick = function () {
      load().heatwave.on = !st.heatwave.on; save();
      hb.className = st.heatwave.on ? 'on' : ''; hb.setAttribute('aria-pressed', !!st.heatwave.on);
      hb.textContent = st.heatwave.on ? 'Heatwave mode: ON' : 'Heatwave mode: off';
      if (heatPill && window.TitleToday) { heatPill.text = st.heatwave.on ? 'Heatwave on' : 'Heatwave off'; TitleToday.set('events', 2, el, pills); }
    };
  }

  /* ---- game start ---- */
  function onStart(S, pick, mode) {
    if (!S) return; load();
    var tomato = S.cropId === 'tomato';
    var showA = act('show'), hwA = act('heatwave'), hamA = act('hamper');
    S.__evDone = false;
    if (showA && tomato && !st.show[showA.year]) {
      S.event = 'show'; S.eventYear = showA.year;
      var cm = prod('calMag');
      say("Show season! Deb's order: a cherry tomato, 0.5 kg or more, health 70 or more. Blossom end rot is the enemy: give steady Calmag Agent and water evenly.", /* v37 */
        cm ? { hop: true, link: cm.url, linkText: 'Calmag Agent at HyGrow', cartItem: { sku: cm.sku, name: cm.name, price: cm.price, why: 'Show tomato: steady calcium' } } : { hop: true });
    }
    if (hwA && st.heatwave.on && !S.replay && mode !== 'live' && mode !== 'mysetup') {
      S.event = S.event || 'heatwave'; S.eventYear = hwA.year;
      S.setup.heatwaveC = HEAT_C;
      try { /* heatwave is a summer scenario: use the summer climate start and nudge the starting tent air */
        S.setup.season = 'summer'; S.doy0 = CROP_DATA.climate.startDoy.summer; S.airT += HEAT_C / 2; S.wT += HEAT_C / 2;
      } catch (e) {}
      say("Heatwave mode! Outdoor air is " + HEAT_C + " °C hotter. Turn the fan up and run the lights at night.", { hop: true }); /* v37 */
      say("Keep the roots cool: warm water holds less oxygen, and roots sulk above about 21 °C.", { hop: true }); /* v37 */
    }
    if (hamA && st.tinselYear !== hamA.year) {
      st.tinselYear = hamA.year; save();
      say('Deb has put tinsel on the tank.', { hop: true });
    }
  }

  /* ---- harvest ---- */
  function note(msg) {
    var b = document.getElementById('harvestBody'); if (!b) return;
    var d = document.createElement('div'); d.className = 'tip'; d.textContent = msg; b.appendChild(d);
  }
  function onHarvest(S, endRes) {
    if (!S || S.__evDone || !S.event) return; load();
    var kg = Math.max(S.harvestedKg || 0, S.fruitKg || 0), health = S.health || 0, y = S.eventYear || nowDate().getFullYear();
    S.__evDone = true;
    if (S.event === 'show') {
      if (kg >= 0.5 && health >= 70) {
        st.show[y] = true; save(); coins(40);
        say('Show entry in! ' + kg.toFixed(2) + ' kg at health ' + Math.round(health) + '. That is a table-worthy tomato.', { hop: true });
        say('Deb: I am so proud of you. Steady calcium and even watering is the whole secret to avoiding blossom end rot.', { hop: true }); /* v37 */
        say('+40 Axel coins.', { hop: true }); /* v37 */
        note('Show entry ✓ ' + y + ' (+40 Axel coins)');
      } else {
        say('Not quite Show standard (' + kg.toFixed(2) + ' kg, health ' + Math.round(health) + '). Look at your Calmag Agent and watering rhythm and try again before 5 October.', { hop: true });
      }
    } else if (S.event === 'heatwave') {
      if (health >= 60 && st.heatwave.rewardedYear !== y) {
        st.heatwave.rewardedYear = y; save(); coins(20);
        say('You beat the heatwave! Health ' + Math.round(health) + ' in a +' + HEAT_C + ' °C summer. +20 Axel coins. Cool roots and a sensible VPD did the work.', { hop: true });
        note('Heatwave survived (+20 Axel coins)');
      }
    }
  }

  window.Events = { active: active, mountTitle: mountTitle, onStart: onStart, onHarvest: onHarvest, EVENTS: EVENTS, now: nowDate };
})();
