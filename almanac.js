/* HyGrow Grow Sim - almanac.js : collection book (crops / problems / gear). Unlocks on first encounter, persists in localStorage. */
(function () {
  'use strict';
  var KEY = 'hygrow_almanac_v1';
  var STORE = 'https://www.hygrowhydroponics.com.au/online-store/';
  var CAT = {
    nutrients: STORE + 'Nutrients-c208001820', testing: STORE + 'Testing-c208001817', pumps: STORE + 'pumps-c208001818',
    lighting: STORE + 'Lighting-c207988616', fans: STORE + 'Fans-c207988614', pest: STORE + 'Pest-c208386005',
    medium: STORE + 'Grow-Medium-c207988615', tents: STORE + 'Tents-c207988105', additives: STORE + 'Additives-c207988104',
    propagation: STORE + 'Propagation-c207988613'
  };
  var state = { seen: {}, claimed: {} };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && raw.seen) { state.seen = raw.seen; state.claimed = raw.claimed || {}; } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- content ---------- */
  var CROPS = ['tomato', 'chilli', 'capsicum', 'cucumber', 'lettuce', 'basil', 'strawberry'];
  var CROP_TIP = {
    tomato: 'Keep feed steady (fruiting EC 2.7-4.0), pH 5.8-6.2 and humidity even, so calcium reaches the fruit and blossom end rot stays away.',
    chilli: 'Chillies like it hot, but flowers start dropping once the air passes about 33 °C, and growth stalls below about 17 °C air or 18 °C solution.',
    capsicum: 'Flowers begin to drop above about 30 °C air and growth stalls below about 15 °C, so use the fan and lights to hold 22-28 °C.',
    cucumber: 'Hold EC 2.0-2.4 when fruiting and keep air under 34 °C: strong feed, drought or heat makes bitter, curled fruit.',
    lettuce: 'Keep day air at or below 24 °C (bolting starts above 25 °C) and keep air moving to avoid tipburn.',
    basil: 'Cut-and-come-again: cut above a leaf pair, up to a third at a time. Keep air above 13 °C, solution above 17 °C and humidity down.' /* v37 */,
    strawberry: 'Likes it cooler than the fruiting crops: aim for 22-24 °C by day and let EC climb gently from 0.8 at propagation to 2.0-2.2 when fruiting.'
  };
  var CROP_DESC = {
    tomato: 'The classic: hungry, thirsty and fussy about calcium reaching the fruit.',
    chilli: 'Loves heat and light. Slow to start, but tough and heavy with small fruit.',
    capsicum: 'Big blocky bells that go green to red. Hates heat spikes and thirsty swings.',
    cucumber: 'Fast climbing Lebanese vine with a heavy crop. Mind the mildew and the feed strength.',
    lettuce: (function () { var t = window.Sim && Sim.cropTiming && Sim.cropTiming('lettuce'); return 'Butterhead heads' + (t ? ' you can pick from about Day ' + t.pick + ', full size by Day ' + t.full : '') + '. One pick ends the crop.'; })(), /* v57: from the stage timer, so an early Pick never contradicts it */
    basil: 'Sweet Genovese basil that regrows after every cut. Hates cold nights and damp air.',
    strawberry: 'Small plants with a sweet reward. Likes it cool and not too humid.'
  };
  var PROBLEMS = {
    iron: ['Iron lockout', 'pH is too high for the roots to take up iron. New leaves go yellow with green veins.', 'Iron locks out once pH passes the crop\'s limit (about 6.2-6.5 depending on crop). Use pH down or change the reservoir.' /* v37 */, 'additives'],
    phlow: ['pH too low', 'Acidic solution damages roots and locks out calcium and magnesium.', 'Crops want pH 5.5 to 6.5, depending on the crop. Below about 5.2 the sim warns you; use pH up or change the reservoir.' /* v37 */, 'additives'],
    ecburn: ['EC burn', 'The solution is too strong, so leaf tips scorch and roots struggle to drink.', 'Top up with plain water or change the reservoir, then check EC against the stage target.', 'testing'],
    lowec: ['Hungry plants', 'Nutrient strength is too low for this stage. Growth stalls and leaves go pale.', 'Each extra ml per litre of Professor\'s A+B lifts EC by roughly 0.47, so Mix feed goes halfway first when the jump is big. Tap again, then recheck EC against the stage target.', 'nutrients'],
    rot: ['Root rot risk', 'Warm solution with low oxygen breeds Pythium. Roots turn brown and slimy.', 'Keep the solution cool (root-zone targets are about 18 to 21 °C) and oxygenated with an air pump or chiller; change the reservoir if it starts.', 'pumps'],
    botrytis: ['Grey mould (botrytis)', 'Air stays too humid for too long. Grey fuzzy mould starts on leaves and stems.', 'Stay inside the crop\'s humidity band (roughly 55-70% for flowering and fruiting) with the fan, a dehumidifier, and pruning for airflow.', 'fans'],
    heat: ['Heat: flowers dropping', 'Hot air kills pollen so flowers fall off before they set fruit.', 'The limit depends on the crop (capsicum 30 °C, cucumber 34 °C, chilli 33 °C air). Use the fan and shorten the lights.', 'fans'],
    crack: ['Fruit cracking', 'Uneven watering splits the skins: a dry spell then a flood, or heavy rain on ripe fruit.', 'Water little and often, keep the tank topped up, and cover ripe fruit before a downpour.', 'pumps'], /* v37: was blamed on warm air (horticulture critic) */
    cold: ['Cold stall', 'It is too cold for good growth, and fruit set or leaf quality stalls.', 'Stall limits are about 15 °C air (capsicum), 16 °C (cucumber), 17 °C (chilli), 13 °C (basil). Run the lights and add a heater or heat mat.', 'propagation'],
    dryair: ['Air too dry', 'The air is very dry (high VPD, how thirsty the air is). Plants close their pores and stop growing, and leaf edges crisp.', 'Aim for a VPD of about 0.8-1.3 kPa in veg and flower. Mist or slow the fan.', 'fans'],
    ber: ['Blossom end rot', 'Fruit bottoms go sunken and black because calcium is not reaching the fruit.', 'Avoid very high EC, humidity swings, pH drift and drought stress; Calmag Agent helps when the feed is calcium-light.', 'additives'],
    wilt: ['Wilting: out of water', 'The tank, or the pots, have run dry, so the plants have nothing to drink.', 'Top up straight away. A wilted plant stops moving calcium, which also feeds into blossom end rot.', 'pumps'],
    lowwater: ['Water running low', 'Less than 20% of the water is left (and a low tank makes the feed stronger).', 'Top up before it drops under 20%, or plants will wilt.', 'pumps'],
    tip: ['Tipburn', 'Leaf edges in the centre of the head go brown and crisp because calcium cannot reach the fast-growing heart.', 'Avoid a strong feed, thirsty air, too much light and stale air; keep the fan moving and the pH in range.', 'additives'],
    bolt: ['Bolting', 'Warm days and long light hours push lettuce to throw up a tall, bitter flower stalk.', 'Keep lettuce day air under 25 °C (the stage target is 20-24 °C) and use the fan and shorter light hours.', 'fans'],
    dm: ['Downy mildew', 'Humidity above 85% spreads spores. Yellow patches on top of leaves, grey fuzz underneath.', 'Keep basil under about 85% humidity with a fan and dehumidifier; spray as a last resort.', 'fans'],
    pm: ['Powdery mildew', 'White powder spreads across cucumber leaves. It loves damp, mild air with little airflow.', 'Keep air moving and humidity down; spray if it starts.', 'fans'],
    bit: ['Bitter, misshapen fruit', 'Strong feed, drought or heat stresses the vine so fruit go bitter and curled.', 'Hold cucumber EC at 2.0-2.4 when fruiting, keep the tank topped up and keep air under 34 °C.', 'nutrients'],
    pests: ['Pests', 'Spider mites and thrips boom in hot, dry air. Leaves get stippled with fine webbing.', 'Keep the air from running hot and dry, and spray early with a pest spray (neem or eco-oil, ask in store).', 'pest'] /* v37 */,
    lost: ['When a plant is lost', 'If a plant sits at zero health for two days it is lost. It does not come back, and the grow ends with a card that says what went wrong.', 'Check three things first: water (is the tank or soil dry or soaked?), pH (is it far off its band?) and the cold (is the air chilled at night?). Fix the red tile the first day it goes red and the plant almost always recovers.', ''] /* v37 [M29] */
  };
  /* v36b: the same problems for a pot, a veranda and a garden bed. window.methodCopy() (beginner.js) says which way the player grows; nothing here mentions a tank, a fan or lights where there are none.
     OUT = veranda and garden bed, POT = soil or coco anywhere. Each is [title or null, tip] and replaces entry [0] / [2]. */
  var OUT = {
    cold: [null, 'Cold nights stall growth, about 13 °C for basil and 15 to 17 °C for the rest. Cover the bed with frost cloth at night, or bring the pots in.'],
    heat: [null, 'Hot air kills pollen so flowers drop. Put shade cloth over the plants on hot afternoons and water in the cool of the morning.'],
    crack: [null, 'A dry spell then a soaking splits skins, and so does heavy rain on ripe fruit. Water steadily and cover before a downpour.'], /* v37 */
    dryair: [null, 'Hot, dry wind crisps the leaf edges. Shade cloth and a good water in the morning, and give it time.'],
    botrytis: [null, 'Damp, still air breeds grey mould. Prune the lower leaves for airflow and pick off mouldy bits straight away.'],
    bolt: [null, 'Warm days push lettuce to bolt. Shade cloth in the afternoon and a regular water keep it leafy.'],
    dm: [null, 'Damp air spreads downy mildew. Prune for airflow, water the soil not the leaves, and spray as a last resort.'],
    pm: [null, 'Powdery mildew loves damp, mild, still air. Prune for airflow and spray if it starts.'],
    tip: [null, 'Avoid a strong feed, hot afternoons and thirsty soil. Shade cloth and steady watering help.'],
    pests: [null, 'Pests boom in hot, dry weather. Spray early with a pest spray (neem or eco-oil, ask in store).'] /* v37 */
  };
  var POT = {
    wilt: ['Wilting: root zone dry', 'The soil has dried right out. Water it straight away. A wilted plant stops moving calcium, which also feeds into blossom end rot.'],
    lowwater: ['Getting dry', 'The soil is under 40 % moisture. Water before the plants wilt.'],
    rot: [null, 'Warm, wet roots with little air breed root rot. Let the pot drain, water less and keep it out of standing water.'],
    ecburn: [null, 'The soil is carrying too much feed, so leaf tips scorch. Water it through with plain water, then feed lighter.'],
    lowec: [null, 'The soil is short of feed for this stage and growth stalls. Give it a feed, then watch the leaves.'],
    iron: [null, function (m) { return m.how === 'coco' ? 'New leaves going yellow with green veins means the pH is too high for iron. Tap pH down a little at a time, wait an hour, then read it again.' : 'New leaves going yellow with green veins can mean iron is locked out. Soil holds pH steady, so there is nothing to adjust: water it well and ask in store about chelated iron.'; }], /* v47 */
    phlow: [null, function (m) { return m.how === 'coco' ? 'A low pH locks out calcium and magnesium. Tap pH up a little at a time, wait an hour, then read it again.' : 'Soil holds pH steady, so there is nothing to adjust. If leaves look pale, ask in store.'; }] /* v47 */
  };
  function variant(id, d) { /* -> [title, tip] for this grower's way of growing */
    var t = d[0], tip = d[2];
    try {
      var m = window.methodCopy && window.methodCopy(); if (!m) return [t, tip];
      if (m.pot && POT[id]) { if (POT[id][0]) t = POT[id][0]; tip = typeof POT[id][1] === 'function' ? POT[id][1](m) : POT[id][1]; }
      if (m.out && OUT[id]) { if (OUT[id][0]) t = OUT[id][0]; tip = OUT[id][1]; }
    } catch (e) {}
    return [t, tip];
  }
  var PROBLEM_ORDER = ['iron', 'phlow', 'ecburn', 'lowec', 'rot', 'botrytis', 'heat', 'crack', 'cold', 'dryair', 'ber', 'wilt', 'lowwater', 'tip', 'bolt', 'dm', 'pm', 'bit', 'pests', 'lost'];
  /* the crop-specific problems added in v23 live in engine.js (Sim.CROP_PROBLEMS: {id: {crop, title, why, fix, acts, hint}}); fold them in here so the Almanac can unlock and show them.
     Shop category: pest for sprays, fans for air problems, pumps for tank problems, else testing. */
  (function () {
    var P = window.Sim && window.Sim.CROP_PROBLEMS; if (!P) return;
    var catOf = function (d) { var a = (d.acts || []).join(' '); if (/spray/.test(a)) return 'pest'; if (/tank/.test(a)) return 'pumps'; if (/fan|hum/.test(a)) return 'fans'; if (/lights/.test(a)) return 'lighting'; return 'testing'; };
    Object.keys(P).forEach(function (id) { var d = P[id]; if (PROBLEMS[id]) return; PROBLEMS[id] = [d.title, d.why, String(d.fix || '').replace(/^Fix: /, ''), catOf(d)]; PROBLEM_ORDER.push(id); });
  })();
  /* v37 [M-OUT]: the seven problems that only exist outside (Sim.OUT_PROBLEMS, METHODS.md section 10): what you see + the cause, then the fix + a Perth note. Spray ones link to the pest range, the rest to tents. */
  (function () {
    var P = window.Sim && window.Sim.OUT_PROBLEMS; if (!P) return;
    Object.keys(P).forEach(function (id) { var d = P[id]; if (PROBLEMS[id]) return; PROBLEMS[id] = [d.title, d.see + ' ' + d.cause, String(d.fix || '').replace(/^Fix: /, '') + ' ' + d.perth, (d.acts || []).indexOf('spray') >= 0 ? 'pest' : 'tents']; PROBLEM_ORDER.push(id); });
  })();
  /* gear: id -> [name, description, tip, products.js key (or ''), category, sku-ish aliases] */
  var GEAR = {
    tent80: ['Seahawk Smart Tent 0.8 x 0.8 x 1.8', 'The compact tent: 0.64 m2 of floor and 1.15 m3 of air. Ask in store.' /* v37 */, 'A small tent heats and humidifies fast, so it needs a good fan.', 'tent80', 'tents'],
    tent120: ['Seahawk Smart Tent 1.2 x 1.2 x 2', 'The roomier tent: 1.44 m2 of floor and 2.9 m3 of air.', 'More air volume means slower swings in temperature and humidity.', 'tent120', 'tents'],
    led200: ['Cultivate Solar Sun LED 200W', 'A 200 W LED panel, 2.4 umol/J.', 'More watts add light but also heat; watch the tent temperature.', 'led200', 'lighting'],
    led300: ['Cultivate Solar Sun LED 300W', 'A 300 W LED panel, 2.5 umol/J, the efficient pick.', 'Higher umol/J means more usable light per watt of heat added.', 'led300', 'lighting'],
    cmh315: ['Hortivision 315W CMH', 'A 315 W ceramic metal halide, 1.7 umol/J.', 'Less efficient than the LEDs here, so it makes more heat for the light it gives.', 'cmh315', 'lighting'],
    coco: ['Coirlite coco coir 50L', 'Coconut fibre medium that holds water and air.', 'Coco holds moisture well, so check reservoir and EC often.', 'coco50', 'medium'],
    hydro: ['Hygen Clay Balls 50L', 'Clay pebbles for a clean hydro setup.', 'Hydro media drain fast, so plants rely on the reservoir staying topped up.', 'clay50', 'medium'],
    aqua2500: ['Aqua One Precision Air Pump + stone', 'An air pump and stone to oxygenate the reservoir.', 'Oxygen in the solution is your best defence against root rot (Pythium).', 'airPump', 'pumps'],
    ec: ['HM EC meter', 'Reads the nutrient strength of your solution.', 'Compare the reading with the stage EC target before you change anything.', 'ecMeter', 'testing'],
    ph: ['HM pH meter', 'Reads how acidic your solution is.', 'Calibrate with buffer solution so you can trust the number.', 'phPen', 'testing'],
    thermo: ['Cultivate thermo-hygrometer', 'Shows tent temperature and humidity.', 'Humidity and temperature together set VPD, so watch both.', 'thermo', 'testing'],
    par: ['Spot On quantum PAR meter', 'Measures how much usable light (PAR) reaches the canopy. Ask in store.' /* v37 */, 'Compare PPFD at canopy height with the stage target before moving the light.', '', 'testing'],
    humidifier: ['Humidifier', 'Adds moisture to dry tent air.', 'Use it when VPD is very high (dry air), and never together with a dehumidifier.', '', 'fans'],
    dehumidifier: ['Dehumidifier', 'Pulls moisture out of the tent air.', 'The fix for botrytis and mildew risk when the fan alone is not enough.', '', 'fans'],
    fanController: ['Phresh Easy fan controller', 'Lets you slow or speed up the exhaust fan.', 'A slower fan holds humidity in; a faster one clears heat and stale air.', 'fanController', 'fans'],
    heatMat: ['Cultivate heat mat', 'Warms the root zone from below.', 'Helps with cold stall and propagation when the room runs cool.', 'heatMat', 'propagation'],
    chiller: ['Water chiller', 'Keeps the reservoir cool.', 'A cool solution holds more oxygen and slows Pythium.', '', 'pumps'],
    phUp: ['pH up 250ml', 'Raises the pH of your solution.', 'Add a little at a time and recheck; the fix for pH too low.', 'phUp', 'additives'],
    phDown: ['pH down 1L', 'Lowers the pH of your solution.', 'Add a little at a time and recheck; the fix for iron lockout.', 'phDown', 'additives'],
    calMag: ['Calmag Agent 1L', 'A calcium and magnesium supplement.', 'Add a little when the feed is calcium-light; it helps against blossom end rot and tipburn.', 'calMag', 'additives'],
    pestSpray: ['Green Planet Plant Guard 1L', 'A silica strengthener that toughens leaves.', 'It helps prevent trouble but does not cure pests. For mites and thrips use a pest spray (neem or eco-oil, ask in store).', 'pestSpray', 'pest']
  };
  var GEAR_ORDER = Object.keys(GEAR);
  // products.js key -> gear id (cart SKUs are the product SKUs; HG-<id> are the fallbacks)
  var KEY2GEAR = { tent120: 'tent120', led200: 'led200', led300: 'led300', cmh315: 'cmh315', coco50: 'coco', clay50: 'hydro', airPump: 'aqua2500', airStone: 'aqua2500', ecMeter: 'ec', phPen: 'ph', thermo: 'thermo', fanController: 'fanController', heatMat: 'heatMat', phUp: 'phUp', phDown: 'phDown', calMag: 'calMag', pestSpray: 'pestSpray' };

  function allKeys() {
    var k = [];
    CROPS.forEach(function (c) { k.push('crop:' + c); });
    PROBLEM_ORDER.forEach(function (p) { k.push('problem:' + p); });
    GEAR_ORDER.forEach(function (g) { k.push('gear:' + g); });
    return k;
  }
  var TOTAL = allKeys().length;
  function count() { var n = 0; allKeys().forEach(function (k) { if (state.seen[k]) n++; }); return n; }
  function nameOf(key) {
    var p = key.split(':'), t = p[0], id = p[1];
    if (t === 'crop') { var cd = window.CROP_DATA && CROP_DATA[id]; return cd ? cd.name : id; }
    if (t === 'problem') return PROBLEMS[id][0];
    return GEAR[id][0];
  }

  function say(text, hop) {
    try { document.dispatchEvent(new CustomEvent('hygrow:say', { detail: { text: text, opts: hop ? { hop: true } : {} } })); } catch (e) {}
  }
  var MILESTONES = [[25, 20, 'A quarter of the Almanac filled in. You are building a real grower\'s eye.'], [50, 30, 'Half the Almanac done. That is real know-how.'], [100, 50, 'The whole Almanac complete. You have seen it all.']];
  function checkMilestones() {
    var pct = count() / TOTAL * 100;
    MILESTONES.forEach(function (m) {
      var id = 'm' + m[0];
      if (pct >= m[0] && !state.claimed[id]) {
        state.claimed[id] = 1; save();
        var coins = '';
        try { if (window.Daily && typeof Daily.addCoins === 'function') { Daily.addCoins(m[1]); coins = ' +' + m[1] + ' coins!'; } } catch (e) {}
        say('Axel: ' + m[2] + coins, true);
      }
    });
  }
  function seen(key) {
    if (!key || state.seen[key]) return false;
    var p = String(key).split(':');
    if (p.length !== 2 || !((p[0] === 'crop' && CROPS.indexOf(p[1]) >= 0) || (p[0] === 'problem' && PROBLEMS[p[1]]) || (p[0] === 'gear' && GEAR[p[1]]))) return false;
    state.seen[key] = Date.now(); save();
    say('Almanac: new entry, ' + nameOf(key) + '!', true);
    checkMilestones();
    if (modal && modal.classList.contains('show')) render();
    return true;
  }
  function seenGear(pick) {
    if (!pick) return;
    ['tent', 'light', 'medium', 'air'].forEach(function (k) { var id = pick[k]; if (id && GEAR[id]) seen('gear:' + id); });
    var m = pick.meters;
    if (m) Object.keys(m).forEach(function (k) { if (m[k] && GEAR[k]) seen('gear:' + k); });
  }
  function seenSku(sku) {
    if (!sku) return;
    sku = String(sku);
    var id = null, P = window.PRODUCTS || {};
    Object.keys(P).forEach(function (k) { if (KEY2GEAR[k] && (P[k].sku === sku || P[k].id === sku || 'HG-' + k === sku)) id = KEY2GEAR[k]; });
    if (!id && sku.indexOf('HG-') === 0 && GEAR[sku.slice(3)]) id = sku.slice(3);
    if (id) seen('gear:' + id);
  }

  /* ---------- card data ---------- */
  /* v51 rc1: the same utm shape as every other outbound HyGrow link (utm_source=game&utm_medium=app&utm_campaign=almanac) */
  function tag(u) { return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'utm_source=game&utm_medium=app&utm_campaign=almanac'; }
  function shopLink(g) {
    var P = window.PRODUCTS || {}, d = GEAR[g];
    if (d[3] && P[d[3]] && P[d[3]].url) return { url: tag(P[d[3]].url), label: 'View in shop' };
    return { url: tag(CAT[d[4]]), label: 'Browse ' + d[4] };
  }
  function ranges(id) {
    var cd = window.CROP_DATA && CROP_DATA[id]; if (!cd) return null;
    var out = { ec: [99, 0], ph: [99, 0], t: [99, 0], rh: [99, 0] };
    cd.stages.forEach(function (s) {
      out.ec = [Math.min(out.ec[0], s.ec[0]), Math.max(out.ec[1], s.ec[1])];
      out.ph = [Math.min(out.ph[0], s.ph[0]), Math.max(out.ph[1], s.ph[1])];
      out.t = [Math.min(out.t[0], s.tempDay[0], s.tempNight[0]), Math.max(out.t[1], s.tempDay[1])];
      out.rh = [Math.min(out.rh[0], s.rh[0]), Math.max(out.rh[1], s.rh[1])];
    });
    return out;
  }

  /* ---------- UI ---------- */
  var modal = null, tab = 'crops';
  function css() {
    if (document.getElementById('almanacCss')) return;
    var s = document.createElement('style'); s.id = 'almanacCss';
    s.textContent =
      '#almanac .acard{max-width:760px}#almanac h2{margin:0 0 6px;font-family:var(--display)}' +
      '#almanac .atabs{display:flex;gap:6px;margin:8px 0}#almanac .atabs button{flex:1;min-height:44px;background:var(--panel2);border:2px solid var(--line);border-radius:10px;font-weight:800;color:var(--text)}' +
      '#almanac .atabs button.on{background:var(--orange);color:var(--ink);border-color:var(--brown)}' +
      '#almanac .abar{height:12px;background:var(--panel2);border:2px solid var(--line);border-radius:999px;overflow:hidden}#almanac .abar i{display:block;height:100%;background:var(--orange)}' +
      '#almanac .apct{font-size:13px;color:var(--muted);margin:4px 0 8px}' +
      '#almanac .agrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:10px}' +
      '#almanac .ae{background:var(--panel2);border:2px solid var(--line);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:6px;min-width:0;font-size:13px}' +
      '#almanac .ae b{font-family:var(--display);font-size:15px;color:var(--text);overflow-wrap:anywhere}' +
      '#almanac .ae.lock{opacity:.55;filter:grayscale(1);align-items:center;text-align:center;justify-content:center;min-height:110px}' +
      '#almanac .ae.lock .q{font-size:34px;font-weight:900;color:var(--muted)}#almanac .ae.lock small{color:var(--muted)}' +
      '#almanac .ae p{margin:0;color:var(--text)}#almanac .ae .tip{color:var(--yellow)}#almanac .ae .rg{color:var(--muted);font-size:12px;line-height:1.4}' +
      '#almanac .ae a{display:inline-block;background:var(--orange);color:var(--ink);font-weight:900;padding:7px 10px;border-radius:999px;text-decoration:none;border:2px solid var(--brown);text-align:center;margin-top:auto;min-height:20px}' +
      '#almanac .ahead{display:flex;gap:8px;align-items:center}#almanac .ahead .menu{margin-left:auto}';
    document.head.appendChild(s);
  }
  function entryHtml(key) {
    var p = key.split(':'), t = p[0], id = p[1], h = '';
    if (t === 'crop') {
      var r = ranges(id);
      h = '<div class="ahead"><span class="ico" data-crop="' + id + '"></span><b>' + esc(nameOf(key)) + '</b></div><p>' + esc(CROP_DESC[id]) + '</p>' +
        (r ? '<div class="rg">EC ' + r.ec[0] + '-' + r.ec[1] + ' | pH ' + r.ph[0] + '-' + r.ph[1] + '<br>Temp ' + r.t[0] + '-' + r.t[1] + ' C | RH ' + r.rh[0] + '-' + r.rh[1] + '%</div>' : '') +
        '<p class="tip">Tip: ' + esc(CROP_TIP[id]) + '</p><a href="' + tag(CAT.nutrients) + '" target="_blank" rel="noopener">Nutrients</a>' +
        (window.Growers ? '<button type="button" class="menu" data-grower="' + id + '">Grower\'s card</button>' : '');
    } else if (t === 'problem') {
      var d = PROBLEMS[id];
      var vv = variant(id, d); /* v36b */
      h = '<b>' + esc(vv[0]) + '</b><p>' + esc(d[1]) + '</p><p class="tip">Tip: ' + esc(vv[1]) + '</p>' + (d[3] ? '<a href="' + tag(CAT[d[3]]) + '" target="_blank" rel="noopener">Shop ' + esc(d[3]) + '</a>' : '');
    } else {
      var g = GEAR[id], l = shopLink(id);
      h = '<b>' + esc(g[0]) + '</b><p>' + esc(g[1]) + '</p><p class="tip">Tip: ' + esc(g[2]) + '</p><a href="' + esc(l.url) + '" target="_blank" rel="noopener" aria-label="' + esc(l.label + ': ' + g[0] + ' (opens in a new tab)') + '">' + esc(l.label) + '</a>'; /* v69 (keyboard round 17 m3): six links read View in shop with no product or new-tab note */
    }
    return '<div class="ae" data-key="' + key + '">' + h + '</div>';
  }
  function lockedHtml(label) { return '<div class="ae lock"><span class="q">?</span><b>???</b><small>' + label + '</small></div>'; }
  function render() {
    if (!modal) return;
    var body = modal.querySelector('.agrid'), lists = { crops: CROPS.map(function (c) { return 'crop:' + c; }), problems: PROBLEM_ORDER.map(function (c) { return 'problem:' + c; }), gear: GEAR_ORDER.map(function (c) { return 'gear:' + c; }) };
    var labels = { crops: 'Crop', problems: 'Problem', gear: 'Gear' }, n = count(), pct = Math.round(n / TOTAL * 100);
    modal.querySelector('.abar i').style.width = pct + '%';
    modal.querySelector('.apct').textContent = n + ' / ' + TOTAL + ' found (' + pct + '%). Rewards at 25%, 50% and 100%.';
    Array.prototype.forEach.call(modal.querySelectorAll('.atabs button'), function (b) { var on = b.getAttribute('data-t') === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on) body.setAttribute('aria-labelledby', b.id); /* v68 (round 16 keyboard m6): roving tabindex and the panel named by its tab */ if (on) try { if (window.A11y && A11y.announce && modal.classList.contains('show')) A11y.announce(b.textContent + ' tab open.'); } catch (e) {} }); /* v66 (round 15 keyboard m6): real tabs, and the panel change is said */ /* v65 (play-test #17 keyboard m2): the open tab is said, not only coloured */
    body.innerHTML = (window.Cards ? Cards.basicsHtml(state.seen, tab) : '') + lists[tab].map(function (k) { return state.seen[k] ? entryHtml(k) : lockedHtml(labels[tab]); }).join('');
    Array.prototype.forEach.call(body.querySelectorAll('.ico'), function (el) {
      try { if (window.Art && Art.fruitIcon) el.appendChild(Art.fruitIcon(el.getAttribute('data-crop'), 34)); } catch (e) {}
    });
  }
  function build() {
    if (modal) return;
    css();
    modal = document.createElement('div'); modal.className = 'modal'; modal.id = 'almanac';
    modal.innerHTML = '<div class="card acard"><h2>Almanac</h2><div class="abar"><i></i></div><div class="apct"></div>' +
      '<div class="atabs" role="tablist" aria-label="Almanac sections"><button role="tab" id="atab-crops" aria-controls="apanel" data-t="crops">Crops</button><button role="tab" id="atab-problems" aria-controls="apanel" data-t="problems">Problems</button><button role="tab" id="atab-gear" aria-controls="apanel" data-t="gear">Gear</button></div>' +
      '<div class="agrid" id="apanel" role="tabpanel" tabindex="0"></div><div class="foot" style="margin-top:12px"><button class="ghost" id="aclose">Close</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.id === 'aclose') return Almanac.close();
      var gc = e.target.getAttribute && e.target.getAttribute('data-grower');
      if (gc && window.Growers) return Growers.open(gc);
      var t = e.target.getAttribute && e.target.getAttribute('data-t');
      if (t) { tab = t; render(); }
    });
    /* v68 (round 16 keyboard m6): the WAI-ARIA tabs pattern: Left and Right move between the tabs (and wrap), Home and End jump, the tab is opened as focus moves */
    modal.querySelector('.atabs').addEventListener('keydown', function (e) {
      var ts = Array.prototype.slice.call(modal.querySelectorAll('.atabs [role=tab]')), i = ts.indexOf(document.activeElement); if (i < 0) return;
      var n = e.key === 'ArrowRight' ? (i + 1) % ts.length : e.key === 'ArrowLeft' ? (i - 1 + ts.length) % ts.length : e.key === 'Home' ? 0 : e.key === 'End' ? ts.length - 1 : -1;
      if (n < 0) return; e.preventDefault(); tab = ts[n].getAttribute('data-t'); render(); try { ts[n].focus(); } catch (e2) {}
    });
  }
  var Almanac = {
    seen: seen, seenGear: seenGear, seenSku: seenSku, count: count, total: TOTAL,
    has: function (k) { return !!state.seen[k]; },
    open: function () { build(); render(); modal.classList.add('show'); },
    close: function () { if (modal) modal.classList.remove('show'); }
  };
  window.Almanac = Almanac;
  function wire() { var b = document.getElementById('abtn'); if (b) b.onclick = function () { try { if (window.Sfx) Sfx.play('click'); } catch (e) {} Almanac.open(); }; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
