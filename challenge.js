/* HyGrow Grow Sim - challenge.js : the Weekly Challenge (one seed per ISO week, same for everyone).
   Seeded + deterministic: no Math.random anywhere here. Storage: hygrow_challenge_v1. No leaderboard - a tamper-checked share code. */
(function () {
  'use strict';
  var KEY = 'hygrow_challenge_v1', SALT = 'hygrow-weekly-v1', COINS = 25;
  var CROPS = ['tomato', 'chilli', 'capsicum', 'strawberry', 'lettuce', 'basil', 'cucumber'];
  var ABBR = { tomato: 'TOM', chilli: 'CHI', capsicum: 'CAP', strawberry: 'STR', lettuce: 'LET', basil: 'BAS', cucumber: 'CUC' };
  var NAME = { tomato: 'Tomato', chilli: 'Chilli', capsicum: 'Capsicum', strawberry: 'Strawberry', lettuce: 'Lettuce', basil: 'Basil', cucumber: 'Cucumber' };
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  /* Seasons where a decent grower can win with that crop (tests/balance-challenge.js: every drawable crop x modifier combo averages health >= 65 and >= 70 % of the goal kg over --weeks=8).
     The weekly pick is moved to the nearest listed season, so a week is never drawn that the base game alone already makes unwinnable.
     Fruit crops were spring-only while the tent ran too damp for their VPD band; with energy-limited transpiration and the appliances' latent heat (engine.js) winter is open to
     tomato, capsicum and strawberry. Chilli (cold stall in winter) and every fruit crop in summer / autumn stay out: the balance bot's low-fan + dehumidifier climate rule overheats the
     tent there (tests/humidity-probe.js shows a VPD-steering grower holds those bands, but the challenge is calibrated on the plain bot). */
  var FIT = { tomato: ['spring', 'winter'], chilli: ['spring'], capsicum: ['spring', 'winter'], strawberry: ['spring', 'winter'], lettuce: ['spring', 'winter'], basil: SEASONS.slice(), cucumber: SEASONS.slice() };
  function seasonOk(crop, season) { return (FIT[crop] || SEASONS).indexOf(season) >= 0; }
  function fitSeason(crop, season) { var ok = FIT[crop] || SEASONS; return ok.indexOf(season) >= 0 ? season : ok[SEASONS.indexOf(season) % ok.length]; }
  /* v44 [M34] the weekly pick now draws a grow method too (where x how). tent/hydro is the original weekly (kit from the gear presets) and is always allowed where FIT allows it;
     the others are drawn only for the crop x season cells where tests/design2.test.js (and the sweep behind MFIT) shows a decent grower averaging health >= 65 and >= 70 % of the goal.
     MFIT[method][crop] = the seasons that cell is allowed in. A method with no listed cell for the drawn crop and season hands the week back to tent/hydro. */
  var WMETHODS = [ /* weight w: tent/hydro stays the most common draw */
    { key: 'tent/hydro', where: 'tent', how: 'hydro', legacy: true, w: 3 },
    { key: 'tent/soil', where: 'tent', how: 'soil', w: 1 }, { key: 'tent/coco', where: 'tent', how: 'coco', w: 1 }, { key: 'tent/tower', where: 'tent', how: 'tower', w: 1 },
    { key: 'veranda/soil', where: 'veranda', how: 'soil', w: 1 }, { key: 'veranda/coco', where: 'veranda', how: 'coco', w: 1 }, { key: 'veranda/tower', where: 'veranda', how: 'tower', w: 1 },
    { key: 'outdoors/soil', where: 'outdoors', how: 'soil', w: 1 }, { key: 'outdoors/coco', where: 'outdoors', how: 'coco', w: 1 }, { key: 'outdoors/tower', where: 'outdoors', how: 'tower', w: 1 }
  ];
  var MFIT = {
    'tent/soil': { lettuce: ['spring', 'winter'], basil: ['spring', 'summer', 'autumn', 'winter'], cucumber: ['spring'] },
    'tent/coco': { tomato: ['winter'], chilli: ['winter'], capsicum: ['winter'], strawberry: ['spring', 'autumn', 'winter'], lettuce: ['spring', 'winter'], basil: ['spring', 'summer', 'autumn', 'winter'], cucumber: ['spring', 'summer', 'autumn', 'winter'] },
    'tent/tower': { strawberry: ['winter'], basil: ['autumn', 'winter'], cucumber: ['autumn', 'winter'] },
    'veranda/soil': { lettuce: ['spring', 'winter'], basil: ['spring', 'autumn', 'winter'] },
    'veranda/coco': { tomato: ['winter'], chilli: ['spring', 'winter'], capsicum: ['spring', 'winter'], strawberry: ['winter'], lettuce: ['spring', 'winter'], basil: ['spring', 'autumn', 'winter'], cucumber: ['spring'] },
    'veranda/tower': { tomato: ['winter'], capsicum: ['autumn', 'winter'], strawberry: ['winter'], basil: ['spring', 'autumn', 'winter'] },
    'outdoors/soil': { chilli: ['spring'], capsicum: ['spring'], lettuce: ['spring', 'winter'], basil: ['spring', 'autumn'] },
    'outdoors/coco': { tomato: ['spring'], chilli: ['spring', 'summer'], capsicum: ['spring'], strawberry: ['spring'], lettuce: ['spring', 'winter'], basil: ['spring', 'autumn'] },
    'outdoors/tower': { basil: ['spring'] }
  }; /* v44 */
  var GOAL_SCALE = { 'tent/soil': 1, 'tent/coco': 1, 'tent/tower': 1, 'veranda/soil': 1, 'veranda/coco': 0.96, 'veranda/tower': 0.96, 'outdoors/soil': 0.89, 'outdoors/coco': 0.92, 'outdoors/tower': 1 }; /* v44 goal kg multiplier by method: the same decent grower gets less out of a pot than a tub, so the goal follows (1 = tent/hydro) */
  function methodOf(key) { return WMETHODS.filter(function (x) { return x.key === key; })[0] || WMETHODS[0]; }
  function methodOk(m, crop, season) { return m.legacy ? seasonOk(crop, season) : !!(MFIT[m.key] && MFIT[m.key][crop] && MFIT[m.key][crop].indexOf(season) >= 0); }
  var WHERE_NAME = { tent: 'an indoor tent', veranda: 'veranda pots', outdoors: 'the garden bed' }, HOW_NAME = { soil: 'soil', coco: 'coco', hydro: 'a hydro tub', tower: 'a hydro tower' };
  function methodName(m) { return m.where === 'tent' ? HOW_NAME[m.how].replace(/^a /, '') + ' in the tent' : HOW_NAME[m.how].replace(/^a /, '') + ' on ' + (m.where === 'veranda' ? 'the veranda' : 'the garden bed'); } /* v44 e.g. "soil on the veranda" */
  /* one plain line of method advice for the week (the modifier line says what is different; this says what to do about the basics) */
  var HOW_TIP = {
    hydro: 'Keep the tank full, with EC and pH in the green.',
    soil: 'Water when the Soil tile drops under 45 percent, and feed about once a week.',
    coco: 'Coco dries fast. Feed or water when it drops under half, and keep the pH in the green.',
    tower: 'One tank feeds every slot, so keep it full and the pH in the green. Harvest slot by slot.'
  }, WHERE_TIP = { veranda: ' Shade cloth on hot afternoons, and Bring in on cold nights.', outdoors: ' Shade cloth on hot afternoons, and Cover on cold nights.' }; /* v44 */
  /* modifier strength by crop (1 = full): the fussy fruit crops have the least headroom, so they feel less of each modifier.
     Mildew is the hardest modifier (balance test: 10-20 points): the base value is large because a grower who steers VPD can now hold the humidity (it was ea 0.42 before),
     and each crop's factor is the largest that keeps every drawable cell winnable - humidity failures are a cliff (condensation + mildew), not a slope. */
  /* v59: the tent climate is calmer (engine.js CLIMATE), so the same damp week bit less (8.2 points); the mildew offset went 1.9 to 2.2 ea and
     lettuce, basil, capsicum and cucumber were re-fitted (tests/balance-challenge.js: 13.9 points, every cell winnable) */
  var SENS = { tomato: { '*': 0.6, mildew: 0.26, cheap: 0.47 }, chilli: 0.3, capsicum: { '*': 0.45, mildew: 0.32 }, strawberry: { '*': 0.5, hard: 0.35, mildew: 0.22, cheap: 0.47 }, lettuce: { mildew: 0.25 }, basil: { mildew: 0.4 }, cucumber: { '*': 0.55, hard: 0.8, mildew: 0.4, cheap: 0.4 } }; /* a crop can also list its own factor per modifier id ('*' = the rest) */
  /* v44 [M34] modifiers by method: a tank, a tent light or an EC meter only exist on some grows. 'where' / 'how' list where the modifier can happen (absent = anywhere). */
  var MOD_WHERE = { cheap: ['tent'], noec: ['tent'], small: ['tent'] }, MOD_HOW = { noec: ['hydro', 'tower'], small: ['hydro', 'tower'] }; /* v44 */
  /* v44 [M34] modifier x method pairs the reference grower cannot clear (tests/design2.test.js plays a sample; the full sweep is in docs/METHODS.md section 12): '*' = never on that method, else the crop/season cells it is left out of */
  var MODBAN = {
    'tent/soil': { heat: '*', hard: '*', mildew: '*', cheap: ['cucumber/spring'] }, 'tent/coco': { heat: '*', mildew: '*', cheap: ['strawberry/autumn'] }, 'tent/tower': { mildew: '*', hard: ['basil/autumn'] },
    'veranda/soil': { heat: '*', hard: '*' }, 'veranda/coco': { heat: '*', hard: ['chilli/winter', 'cucumber/spring'], mildew: ['chilli/winter'] }, 'veranda/tower': { heat: '*', mildew: ['basil/autumn'] },
    'outdoors/soil': { heat: '*', hard: '*', mildew: ['chilli/spring', 'capsicum/spring'] }, 'outdoors/coco': { heat: '*', hard: ['tomato/spring'], mildew: ['strawberry/spring'] }, 'outdoors/tower': { heat: '*' }
  }; /* v44 */
  function modOk(id, season, method, crop) { /* v44: the optional method is { where, how }, the optional crop narrows a MODBAN cell */
    var m = MODS.filter(function (x) { return x.id === id; })[0];
    if (m && m.seasons && m.seasons.indexOf(season) < 0) return false;
    if (m && method) { var ban = MODBAN[method.where + '/' + method.how]; ban = ban && ban[id]; if (ban === '*' || (ban && crop && ban.indexOf(crop + '/' + season) >= 0)) return false; if (MOD_WHERE[id] && MOD_WHERE[id].indexOf(method.where) < 0) return false; if (MOD_HOW[id] && MOD_HOW[id].indexOf(method.how) < 0) return false; }
    return true;
  }
  var MODS = [
    { id: 'heat', seasons: ['spring', 'summer'], name: 'Heatwave week', say: 'Heatwave week! It is {dT} degrees hotter outside. Keep the fan up, shorten the light hours and watch the tent.', sayOut: 'Heatwave week! It is {dT} degrees hotter than usual. Shade cloth on early, water before the heat, and check the plants twice a day.' /* v44 */, mods: { dT: 6 } },
    { id: 'hard', name: 'Hard tap water', sayPot: 'Hard tap water this week. Plain water arrives at pH {ph} and EC {ec}, so every watering lifts the pH and leaves salts behind. Check the pH, and water through now and then to rinse.' /* v44 */, say: 'Hard tap water this week. Plain top-ups arrive at pH {ph} and EC {ec}. The salts already in tap water add to the EC meter, so it reads higher than the feed you mixed. Feed to the band the tile shows, and expect pH to climb with every top-up: test it before you top up.', mods: { tapPh: 7.8, tapEC: 0.7 } },
    { id: 'cheap', name: 'Budget light', say: 'Budget light week: only about {pct} percent of the light of a good LED. Cooler, but dim, so keep the light hours up.', light: 'led200', setup: { light: { watts: 200, umolPerJ: 1.2 } /* v41 */ } },
    { id: 'noec', name: 'No EC meter', say: 'No EC meter this week. You will have to feed by eye and by the plant. Go gently with the dose.', noMeter: 'ec' },
    { id: 'small', name: 'Small tank', say: 'Small tank week: only {L} L in the reservoir. Salts and pH swing fast and it can run dry in hours, so top up little and often.', setup: { reservoirL: 6 } },
    { id: 'mildew', seasons: ['spring', 'summer', 'autumn'], name: 'Mildew-prone', sayPot: 'Mildew-prone week. The air is about {rh} percentage points more humid. Prune for airflow, keep leaves dry when you water, and watch for white powder and fuzz.' /* v44 */, say: 'Mildew-prone week. The air is about {rh} percentage points more humid, so use the fan and the dehumidifier, prune for airflow, and watch for mould.', mods: { ea: 2.2 } }
  ];

  /* ---- hashing / prng ---- */
  function fnv(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  function mulberry(a) { return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function sum(payload) { var h = 5381, s = payload + '|' + SALT; for (var i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return ('0' + (h & 255).toString(16)).slice(-2).toUpperCase(); }
  var pad2 = function (n) { return ('0' + n).slice(-2); };

  /* ---- ISO week (UTC, so it is the same moment for everyone) ---- */
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), dn = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dn);
    var y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
    return { y: y, w: w, id: y + '-W' + pad2(w) };
  }

  /* ---- the week's definition ---- */
  function forWeek(wk) {
    wk = wk || isoWeek(new Date());
    var seed = fnv('HG|' + wk.id), r = mulberry(seed);
    var crop = CROPS[Math.floor(r() * CROPS.length)], season = SEASONS[Math.floor(r() * SEASONS.length)];
    season = fitSeason(crop, season);
    var preset = (window.PRESETS || [])[Math.floor(r() * 3)] || null, mod = MODS[Math.floor(r() * MODS.length)];
    var mr = r(); /* v44 [M34] drawn after the original four, so a week's crop, season, kit and modifier are the same as before; only the method is new */
    var pool = WMETHODS.filter(function (x) { return methodOk(x, crop, season); }), tot = pool.reduce(function (a, x) { return a + x.w; }, 0), acc = 0, meth = pool[0];
    for (var j = 0; j < pool.length; j++) { acc += pool[j].w; if (mr * tot < acc) { meth = pool[j]; break; } }
    for (var i = 0; i < MODS.length && !modOk(mod.id, season, meth, crop); i++) mod = MODS[(MODS.indexOf(mod) + 1) % MODS.length]; /* a modifier that cannot happen in this season, or on this method, hands over to the next one */
    if (!modOk(mod.id, season, meth, crop)) mod = null; /* v44: none left for this cell = a plain week */
    return build(wk, seed, crop, season, preset, mod, meth.legacy ? null : meth);
  }
  /* the builder behind forWeek (and Challenge._build for the balance test): mod may be null = no modifier */
  function build(wk, seed, crop, season, preset, mod, meth) { /* v44: meth = a non-legacy WMETHODS entry, or null for the original tent hydro tub */
    var kit = preset ? { tent: preset.tent, light: preset.light, medium: preset.medium, air: preset.air, meters: preset.meters.slice() } : { tent: 'tent120', light: 'led300', medium: 'coco', air: 'aqua2500', meters: ['ec', 'ph', 'thermo'] };
    var setup = { seed: seed, season: season, reservoirL: 40 };
    if (meth) { setup.where = meth.where; setup.how = meth.how; setup.drip = false; setup.slots = 8; setup.shade = meth.where !== 'tent'; } /* v44 [M34] */
    mod = mod || { id: 'none', name: 'No modifier', say: '' };
    if (mod.light) kit.light = mod.light;
    if (mod.noMeter) kit.meters = kit.meters.filter(function (k) { return k !== mod.noMeter; });
    if (mod.setup) Object.keys(mod.setup).forEach(function (k) { setup[k] = mod.setup[k]; });
    setup.mods = Object.assign({ chal: wk.id, mod: mod.id }, mod.mods || {});
    var k = SENS[crop] === undefined ? 1 : typeof SENS[crop] === 'number' ? SENS[crop] : SENS[crop][mod.id] !== undefined ? SENS[crop][mod.id] : SENS[crop]['*'] === undefined ? 1 : SENS[crop]['*'];
    if (k !== 1) { /* crops that sit close to the line even with no modifier feel only part of it: scale each magnitude from its neutral value */
      [['dT', 0, 1], ['ea', 0, 2], ['tapPh', 7.4, 1], ['tapEC', 0.25, 2]].forEach(function (a) { var v = setup.mods[a[0]]; if (typeof v === 'number') setup.mods[a[0]] = +(a[1] + (v - a[1]) * k).toFixed(a[2]); });
      setup.reservoirL = Math.round(40 + (setup.reservoirL - 40) * k);
      if (setup.light) setup.light = { watts: setup.light.watts, umolPerJ: +(2.5 + (setup.light.umolPerJ - 2.5) * k).toFixed(2) };
    }
    var meters = { ec: false, ph: false, thermo: false, par: false }; kit.meters.forEach(function (k) { meters[k] = true; });
    var pick = { crop: crop, tent: kit.tent, light: kit.light, medium: kit.medium, air: kit.air, meters: meters };
    if (meth) { pick.where = meth.where; pick.how = meth.how; pick.medium = meth.how; } /* v44 [M34] the grow method rides on the pick, as the setup screen does */
    if (meth && (meth.how === 'soil' || meth.how === 'coco')) pick.air = 'none'; /* v66 (play-test #18 m4): a soil or coco week put an air pump for a tank in the cart */
    return { week: wk, seed: seed, crop: crop, season: season, preset: preset && preset.name, mod: mod, method: meth ? { where: meth.where, how: meth.how, key: meth.key } : { where: 'tent', how: 'hydro', key: 'tent/hydro' }, pick: pick, setup: setup };
  }

  /* ---- codes: HG-W45-TOM-0274-7F ---- */
  function makeCode(wk, crop, kg) {
    var k = Math.max(0, Math.min(9999, Math.round((+kg || 0) * 100))), body = 'W' + pad2(wk.w) + '-' + ABBR[crop] + '-' + ('000' + k).slice(-4);
    return 'HG-' + body + '-' + sum(wk.y + '|' + body);
  }
  function verify(code) {
    var m = /^HG-W(\d{2})-([A-Z]{3})-(\d{4})-([0-9A-F]{2})$/.exec(String(code || '').trim().toUpperCase());
    if (!m) return { ok: false };
    var w = +m[1], body = 'W' + m[1] + '-' + m[2] + '-' + m[3], y = isoWeek(new Date()).y;
    for (var yy = y; yy >= y - 1; yy--) {
      if (sum(yy + '|' + body) !== m[4]) continue;
      var crop = Object.keys(ABBR).filter(function (c) { return ABBR[c] === m[2]; })[0];
      if (!crop || forWeek({ y: yy, w: w, id: yy + '-W' + pad2(w) }).crop !== crop) return { ok: false };
      return { ok: true, week: yy + '-W' + pad2(w), crop: crop, kg: +m[3] / 100 };
    }
    return { ok: false };
  }

  /* ---- storage ---- */
  function load() {
    var d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    d = d && typeof d === 'object' ? d : {};
    var cur = isoWeek(new Date()).id;
    if (d.week !== cur) d = { week: cur, best: null, attempts: 0, lastCoinsWeek: d.lastCoinsWeek || null };
    return d;
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  /* ---- start ---- */
  function say(text, opts) { try { document.dispatchEvent(new CustomEvent('hygrow:say', { detail: { text: text, opts: opts || {} } })); } catch (e) {} }
  /* Axel's modifier line, with the numbers this crop actually gets ({dT} degC, {ph}/{ec} tap water, {rh} percentage points of humidity, {L} litres, {pct} light efficiency vs a good LED) */
  function sayFor(c) {
    var m = c.setup.mods || {}, li = c.setup.light, n = function (v, d) { return String(+(+v).toFixed(d)); };
    var val = { dT: n(m.dT, 1), ph: n(m.tapPh, 1), ec: n(m.tapEC, 2), rh: Math.round(100 * (m.ea || 0) / 2.34), L: c.setup.reservoirL, pct: li ? Math.round(100 * li.umolPerJ / 2.5) : 100 };
    var mm = c.method || {}, out = mm.where && mm.where !== 'tent', pot = mm.how === 'soil' || mm.how === 'coco', txt = (out && c.mod.sayOut) || ((pot || out) && c.mod.sayPot) || c.mod.say; /* v44 [M34] */
    return String(txt).replace(/\{(\w+)\}/g, function (all, k) { return val[k] === undefined ? all : val[k]; });
  }
  function start() {
    if (!window.__game || !__game.startWith) return;
    var c = forWeek(), d = load(); d.attempts = (d.attempts || 0) + 1; save(d);
    __game.startWith(c.pick, c.setup, 'free');
    say('Weekly challenge ' + c.week.id + ': ' + NAME[c.crop] + ' in ' + methodName(c.method) + '. ' + sayFor(c) + ' ' + tipFor(c.method) + ' Same weather and plant for every grower, so every score is fair.', { hop: true }); /* v44 [M34] */
    pill();
  }

  /* ---- pill (own element) + title blurb ---- */
  /* v44 [M34] one plain line of advice for how the week is grown; the ui can also read it as Challenge.tipFor(method) */
  function tipFor(m) { m = m || { where: 'tent', how: 'hydro' }; return (HOW_TIP[m.how] || HOW_TIP.hydro) + (WHERE_TIP[m.where] || ''); }
  var pillEl = null, GOAL_FRAC = 0.8; /* the goal is 80 % of the crop's full yield target, so a decent run reads as a win */
  function goalKg(S) { /* v44 [M34] a pot or bed grow gets its method's scale; a tower counts every slot it was planted with, and a leafy slot is a two-seedling cup (engine TOWER_LEAFY_X) */
    var m = S.method || {}, key = m.where && m.how && !(m.where === 'tent' && m.how === 'hydro') ? m.where + '/' + m.how : 'tent/hydro', tw = S.slots && CROP_DATA[S.cropId].leafy ? 2 : 1;
    return GOAL_FRAC * (GOAL_SCALE[key] || 1) * CROP_DATA[S.cropId].yieldTarget * (S.slots ? (S.plantedEver || S.nplants) : S.nplants) * tw;
  }
  function pill() {
    var S = window.__game && __game.S, m = S && S.setup && S.setup.mods, on = !!(m && m.chal);
    var hide = !on || document.getElementById('title').classList.contains('show') || document.getElementById('harvest').classList.contains('show');
    if (!pillEl) {
      pillEl = document.createElement('div'); pillEl.id = 'chalPill'; pillEl.hidden = true;
      pillEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 118px);z-index:30;max-width:calc(100vw - 32px);padding:3px 10px;border-radius:999px;background:var(--panel2,#2a1d14);color:var(--text,#fff);border:2px solid var(--green,#6ec846);font-size:11px;line-height:1.3;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      document.body.appendChild(pillEl);
    }
    if (hide) { pillEl.hidden = true; return; }
    var def = MODS.filter(function (x) { return x.id === m.mod; })[0], tgt = '';
    try { tgt = ' · goal ' + goalKg(S).toFixed(1) + ' kg'; } catch (e) {}
    pillEl.textContent = 'Weekly ' + String(m.chal).slice(5) + (def ? ' · ' + def.name : '') + tgt; /* v53 (critic round 7): a plain week (mod none) has no name, so no empty slot */
    pillEl.hidden = false;
  }
  function blurb() {
    var b = document.getElementById('chalBlurb'); if (!b) return;
    var c = forWeek(), d = load();
    /* mode card: one compact line; the full wording lives in the title screen's "Weekly" Today pill panel */
    var line = c.week.id + ': ' + NAME[c.crop] + ', ' + methodName(c.method) + ' · ' + c.mod.name.toLowerCase() + (d.best ? ' · best ' + d.best.kg.toFixed(2) + ' kg' : '');
    if (b.textContent !== line) b.textContent = line;
    todayPill(c, d);
  }
  var tcEl = null, tcKey = '';
  function todayPill(c, d) {
    var TT = window.TitleToday; if (!TT) return;
    var label = 'Weekly ' + String(c.week.id).slice(5) + ': ' + NAME[c.crop] + ' (' + (c.method.where === 'tent' ? c.method.how : c.method.where === 'veranda' ? 'veranda' : 'garden') + ')';
    var body = NAME[c.crop] + ' in ' + methodName(c.method) + ', with ' + c.mod.name.toLowerCase() + '. ' + (d.best ? 'Your best: ' + d.best.kg.toFixed(2) + ' kg. ' : '') + 'Same weather and plant for everyone, new each week.';
    var key = label + '|' + body; if (key === tcKey && tcEl && tcEl.isConnected) return; tcKey = key;
    if (!tcEl) {
      tcEl = document.createElement('div'); tcEl.className = 'tcard'; tcEl.id = 'chalToday';
      tcEl.innerHTML = '<b></b><p></p><button type="button" class="ghost">Play the weekly challenge</button>';
      tcEl.querySelector('button').onclick = function () { var m = document.querySelector('#title .mode[data-mode="challenge"]'); if (m) m.click(); };
    }
    tcEl.querySelector('b').textContent = 'Weekly challenge ' + c.week.id; tcEl.querySelector('p').textContent = body;
    TT.set('weekly', 3, tcEl, [{ text: label }]);
  }

  /* ---- harvest ---- */
  function esc(t) { t = String(t); return window.escHtml ? window.escHtml(t) : t.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); } /* m6-fallback: ui.js escH is the one escape; this body runs only if ui.js is not loaded yet */
  function copy(txt, btn) {
    var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); };
    try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (e) { fallback(); }
    function fallback() { try { var t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); } catch (e) {} }
  }
  function onHarvest() {
    if (document.querySelector('#harvestBody .lost-end')) { var stale = document.getElementById('chalResult'); if (stale) stale.remove(); return; } /* v52 (play-test #10 #3): a lost plant is not a result, a best or a share code */
    var S = window.__game && __game.S, m = S && S.setup && S.setup.mods;
    if (!m || !m.chal || S.__chalDone) return;
    S.__chalDone = true;
    var sc = Sim.score(S), parts = /^(\d{4})-W(\d{2})$/.exec(m.chal), wk = { y: +parts[1], w: +parts[2], id: m.chal };
    var code = makeCode(wk, S.cropId, sc.yieldKg), d = load(), first = false, newBest = false;
    if (d.week === m.chal) {
      if (!d.best || sc.overall > d.best.overall || (sc.overall === d.best.overall && sc.yieldKg > d.best.kg)) { d.best = { kg: sc.yieldKg, overall: sc.overall, code: code }; newBest = true; }
      if (d.lastCoinsWeek !== m.chal) { d.lastCoinsWeek = m.chal; first = true; }
      save(d);
    }
    var coins = false;
    if (first && window.Daily && Daily.addCoins) { try { Daily.addCoins(COINS, 'weekly challenge'); coins = true; } catch (e) {} }
    var def = MODS.filter(function (x) { return x.id === m.mod; })[0] || { name: '' };
    var best = d.best || { kg: sc.yieldKg, overall: sc.overall, code: code };
    var shareTxt = 'HyGrow Weekly Challenge ' + m.chal + ' (' + def.name + ')\n' + (window.ShareCard ? ShareCard.text({ S: S }) : '') + '\nMy code: ' + code;
    var host = document.getElementById('harvestBody'); if (!host) return;
    var box = document.createElement('div'); box.id = 'chalResult';
    box.style.cssText = 'border:2px solid var(--green,#6ec846);border-radius:14px;padding:12px;margin:0 0 12px;text-align:center';
    box.innerHTML = '<h3 style="margin:0 0 4px">Weekly challenge ' + esc(m.chal) + '</h3><div style="color:var(--muted,#999);font-size:13px">' + (def.name ? esc(def.name) + ' · ' : '') + esc(NAME[S.cropId]) + '</div>' +
      '<div style="font-size:20px;margin:6px 0"><b>' + sc.yieldKg.toFixed(2) + ' kg</b> · score ' + Math.round(sc.overall) + '</div>' +
      '<div style="font-size:13px">' + (newBest ? 'New best this week!' : 'Your best this week: ' + best.kg.toFixed(2) + ' kg (score ' + Math.round(best.overall) + ')') + (coins ? ' · +' + COINS + ' Axel coins' : '') + '</div>' +
      '<div style="margin:8px 0 2px;font-size:13px">Share this challenge</div><code id="chalCode" style="display:inline-block;padding:6px 10px;border-radius:8px;background:var(--panel2,#222);font-size:16px;letter-spacing:.5px;user-select:all">' + esc(code) + '</code>' +
      '<div style="margin-top:8px"><button class="big" id="chalCopy" style="min-height:48px">Copy</button></div>';
    host.insertBefore(box, host.firstChild);
    box.querySelector('#chalCopy').onclick = function () { copy(shareTxt, this); };
  }

  function init() {
    blurb(); setInterval(function () { pill(); blurb(); }, 1000);
    var h = document.getElementById('harvest');
    if (h && window.MutationObserver) new MutationObserver(function () { if (h.classList.contains('show')) onHarvest(); }).observe(h, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* test hook: Challenge._build(week, crop, modId|null, season[, presetIndex]) -> same object forWeek returns, with the crop / modifier / season / kit forced */
  function _build(wk, crop, modId, season, presetIdx, methodKey) { /* v44: methodKey 'where/how' picks a non-legacy method */
    wk = wk || isoWeek(new Date());
    var mod = modId ? MODS.filter(function (x) { return x.id === modId; })[0] : null;
    if (modId && !mod) throw new Error('Unknown modifier ' + modId);
    var preset = (window.PRESETS || [])[presetIdx === undefined ? 1 : presetIdx] || null;
    var meth = methodKey ? methodOf(methodKey) : null;
    return build(wk, fnv('HG|' + wk.id), crop, season, preset, mod, meth && !meth.legacy ? meth : null);
  }
  window.Challenge = Object.assign(window.Challenge || {}, { start: start, verify: verify, current: forWeek, makeCode: makeCode, isoWeek: isoWeek, load: load, MODS: MODS, goalKg: goalKg, seasonOk: seasonOk, modOk: modOk, SENS: SENS, sayFor: sayFor, tipFor: tipFor, methods: WMETHODS, methodName: methodName, methodOk: methodOk, _build: _build });
})();
