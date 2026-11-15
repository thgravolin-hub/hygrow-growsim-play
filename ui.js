/* HyGrow Grow Sim — ui.js : glue between Sim (engine.js), Art (art.js) and Sfx (audio.js) */
(function () {
  const $ = s => document.querySelector(s);
  /* =========================================================================================================================================
     SAVE, LOAD, QUARANTINE AND MIGRATION  [M21] [M23]
     Everything that reads or writes the saved grow is in this one section (the dock, the title and the lesson only call it).
       SAVE            the live key. The envelope is { v, savedAt, mode, pick, sim, extra, replay, cart, camp, lend, story }; sim is Sim.serialize(S), which carries its own simVersion.
       SAVE_VERSION    the envelope version this build writes. A save with no v is version 0 (written before versioning). Bump it, add SAVE_STEPS[old], keep the old step.
       SAVE_STEPS      { N: j => j at version N+1 }. Run in order by migrateSave. Step 0 is the identity (an unversioned save already has the version 1 shape).
       future saves    a save whose v (or whose sim's simVersion) is newer than this build knows is never opened and never deleted: quarantineSave copies it to SAVE_BAD, clears
                       SAVE, and the title says so once (saveNote). The next build that knows the version can be pointed at SAVE_BAD by hand.
       broken saves    a blob that fails to parse, migrate or deserialize goes the same way (continueGame calls quarantineSave). Nothing here ever deletes a save it could not read.
     tests/save-fixtures.test.js runs the SAVEIO block on its own against one real save per released version (tests/fixtures/save-v*.json).
     ========================================================================================================================================= */
  const warned = {}; /* [M23] one console.warn per site per session: a swallowed error is visible in the console, never a flood */
  function warnOnce(where, e) { if (warned[where]) return; warned[where] = 1; try { console.warn('[HyGrow] ' + where + ':', (e && e.message) || e); } catch (e2) { /* no console */ } }
  /* SAVEIO:start (pure, no DOM, no warnOnce: tests/save-fixtures.test.js runs this block on its own) */
  const SAVE = 'hygrow_growsim_save_v1';
  const SAVE_BAD = 'hygrow_growsim_save_bad';
  const SAVE_VERSION = 1;
  const SAVE_STEPS = { 0: j => j }; /* version N -> N+1; 0 -> 1 is the identity */
  const SIM_VERSION_FLOOR = 2; /* the simVersion Sim.serialize wrote when this guard was added; a newer engine raises it by exporting Sim.SIM_VERSION */
  const knownSimVersion = () => Math.max(SIM_VERSION_FLOOR, (typeof Sim !== 'undefined' && Sim && Sim.SIM_VERSION | 0) || 0);
  const saveVersionOf = j => { const v = j && j.v; return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : 0; };
  const simVersionOf = sim => { const m = typeof sim === 'string' ? /^\s*\{\s*"simVersion"\s*:\s*(\d+)/.exec(sim) : null; return m ? +m[1] : 1; }; /* a bare state or an unreadable blob is version 1: deserialize decides if it loads */
  /* j = a parsed envelope. Returns { ok: true, j } at SAVE_VERSION, or { ok: false, why } with why 'empty' (nothing to continue), 'future' (newer than this build) or 'broken' (a step threw). steps / cur / simKnown are for tests. */
  function migrateSave(j, steps, cur, simKnown) {
    steps = steps || SAVE_STEPS; cur = cur == null ? SAVE_VERSION : cur;
    if (!j || typeof j !== 'object' || !j.sim) return { ok: false, why: 'empty' };
    let v = saveVersionOf(j);
    if (v > cur || simVersionOf(j.sim) > (simKnown == null ? knownSimVersion() : simKnown)) return { ok: false, why: 'future' };
    try {
      while (v < cur) { const step = steps[v]; if (typeof step !== 'function') return { ok: false, why: 'broken' }; j = step(j); if (!j || typeof j !== 'object') return { ok: false, why: 'broken' }; v++; j.v = v; }
    } catch (e) { return { ok: false, why: 'broken' }; }
    return { ok: true, j };
  }
  /* SAVEIO:end */
  let saveNote = ''; /* '' | 'future' | 'broken': set when loadSave quarantined a save, said once by showTitle */
  let saveErr = false; /* true after a save threw (storage full / private mode): the Menu and a one-time toast say so instead of claiming the grow is saved */
  function save() { if (!S || !Sim.serialize || S.lost) return; if (mode === 'beginner') { if (window.Beginner && Beginner.saveProgress) Beginner.saveProgress(); return; } /* v52 (play-test #10 #8): a lost grow (S.lost) is never saved again, so the title does not offer Continue on a dead plant */ /* beginner grows are throwaway: never overwrite the player's real save (the lesson keeps its own progress key, see beginner.js) */ const rp = S.replay; try { if (mode === 'live') S.replay = null; /* never persist live rows or link secrets */ localStorage.setItem(SAVE, JSON.stringify({ v: SAVE_VERSION, savedAt: Date.now(), mode, pick, sim: Sim.serialize(S), extra: { cost: S.__cost, fan: S.__fan, hum: S.__hum, refills: S.__refills, rot: S.__rot, tw: S.__tipWeek, ti: S.__tipIdx, p: speed === 0 && V36B.isUserPaused() ? 1 : 0 }, replay: replay ? replay.rows.length : 0, cart: window.Cart ? Cart.toJSON() : [], camp: camp && window.Campaign ? Campaign.toJSON() : null, lend: camp ? campLend : null, story: window.Story && Story.toJSON ? Story.toJSON() : null })); saveErr = false; } catch (e) { if (!saveErr) { saveErr = true; warnOnce('save', e); if (/quota|storage|security/i.test(String(e && e.name) + ' ' + String(e && e.message))) try { toast('Couldn’t save your grow: browser storage is full or blocked.', 4000); } catch (e2) { warnOnce('save toast', e2); } } } finally { S.replay = rp; } }
  /* save when the tab goes away (phones kill background tabs without warning) and after every player action, not only at day boundaries */
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', () => save());
  /* the saved grow, migrated to this build's envelope, or null. A save from a newer build or one that will not migrate is quarantined (see the header), garbage JSON just gives no Continue. */
  function loadSave() {
    let j = null;
    try { j = JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch (e) { warnOnce('loadSave', e); saveNote = 'broken'; quarantineSave(); return null; } /* v49 (critic #6): a blob that is not JSON goes the same way as one that will not migrate */
    const r = migrateSave(j);
    if (r.ok) return r.j;
    if (r.why !== 'empty') { saveNote = r.why; quarantineSave(); }
    return null;
  }
  function clearSave() { try { localStorage.removeItem(SAVE); } catch (e) {} }
  /* a save that will not load is kept under its own key, not deleted: the raw string is copied first, then the live key is cleared */
  function quarantineSave() { try { const raw = localStorage.getItem(SAVE); if (raw) localStorage.setItem(SAVE_BAD, raw); } catch (e) {} clearSave(); }
  window.quarantineSave = quarantineSave;
  /* ===================================================== end of the save section ===================================================== */
  const STORE = 'https://www.hygrowhydroponics.com.au/online-store/';
  const CAT = {
    nutrients: STORE + 'Nutrients-c208001820', testing: STORE + 'Testing-c208001817', pumps: STORE + 'pumps-c208001818',
    lighting: STORE + 'Lighting-c207988616', fans: STORE + 'Fans-c207988614', pest: STORE + 'Pest-c208386005',
    medium: STORE + 'Grow-Medium-c207988615', tents: STORE + 'Tents-c207988105', additives: STORE + 'Additives-c207988104',
    propagation: STORE + 'Propagation-c207988613'
  };
  /* v51 rc1: one utm shape on every outbound HyGrow link (shop.js, growers.js, cart.js, almanac.js use the same): utm_source=game&utm_medium=app&utm_campaign=<crop id, else the context> */
  const tag = (u, camp) => u + (u.includes('?') ? '&' : '?') + 'utm_source=game&utm_medium=app&utm_campaign=' + encodeURIComponent(camp || (S && S.cropId) || 'tips');
  const hintToCat = h => {
    h = (h || '').toLowerCase();
    if (/ph (up|down)|ph up|ph down|additive/.test(h)) return CAT.additives;
    if (/\bph (meter|pen)|ec meter|\bmeter|\bpen\b|thermo|hygro|\bpar\b|calibrat|monitor/.test(h)) return CAT.testing;
    if (/air ?pump|air ?stone|pump|chiller/.test(h)) return CAT.pumps;
    if (/fan|filter|extract/.test(h)) return CAT.fans;
    if (/light|led|timer/.test(h)) return CAT.lighting;
    if (/pest|spray|guard|mite|trap/.test(h)) return CAT.pest;
    if (/dehumid|humidif|climate/.test(h)) return CAT.fans;
    if (/heat/.test(h)) return CAT.propagation;
    if (/reservoir|top-?up/.test(h)) return CAT.pumps;
    if (/coco|perlite|clay|medium/.test(h)) return CAT.medium;
    if (/calcium|cal-?mag|nutri|feed|a\+b/.test(h)) return CAT.nutrients;
    return CAT.nutrients;
  };

  const PROF_AB1_PRICE = 35;
  const MIX_STEP = 0.6; /* Mix feed jumps of more than this many EC are made halfway first, then again */
  /* --------- real store products (products.js, pulled from Wix) --------- */
  const GST = 1.1; // Wix catalogue prices come through ex-GST; the shop sells inc-GST
  const PRODUCTS = window.PRODUCTS || {};
  const product = key => PRODUCTS[key] || null;
  const productUrl = key => { const p = product(key); return p && p.url ? p.url : null; };
  /* v41 one rounding: integer cents, shown as whole dollars */
  const priceIncGst = exGst => (window.priceIncGst && window.priceIncGst !== priceIncGst ? window.priceIncGst(exGst) : Math.round(Math.round(exGst * 110) / 100)); /* v41: shop.js's helper when it is loaded, else the same integer-cents rule */
  if (!window.priceIncGst) window.priceIncGst = priceIncGst;
  const productPrice = key => { const p = product(key); return p && p.price > 0 ? priceIncGst(p.price) : null; };
  /* which products.js key does a hint ("Humidifier", "Cal-Mag supplement", "pH Down") name? */
  const hintToKey = h => {
    h = (h || '').toLowerCase();
    if (/ph up/.test(h)) return 'phUp';
    if (/ph down/.test(h)) return 'phDown';
    if (/ph (meter|pen)/.test(h)) return 'phPen';
    if (/ec meter/.test(h)) return 'ecMeter';
    if (/cal-?mag|calcium/.test(h)) return 'calMag';
    /* v37: no product key for a pest spray: Plant Guard is a silica strengthener, the spray is generic neem or eco-oil (ask in store) */
    if (/thermo|hygro/.test(h)) return 'thermo';
    if (/\bpar\b|quantum/.test(h)) return 'parMeter';
    if (/air ?stone/.test(h)) return 'airStone';
    if (/air ?pump/.test(h)) return 'airPump';
    if (/dehumid/.test(h)) return 'dehumidifier';
    if (/humidif/.test(h)) return 'humidifier';
    if (/fan speed|controller/.test(h)) return 'fanController';
    if (/\bfan\b/.test(h)) return 'exhaustFan';
    if (/heat ?mat/.test(h)) return 'heatMat';
    if (/heater/.test(h)) return 'heater';
    if (/chiller/.test(h)) return 'chiller';
    if (/reservoir|top-?up|fresh water/.test(h)) return 'reservoir';
    if (/timer/.test(h)) return 'timer';
    if (/calibrat/.test(h)) return 'calibration';
    if (/nutri|a\+b|feed/.test(h)) return 'profAB1';
    return null;
  };
  /* best link for a hint: the real product page when we have it, else the category */
  const hintToLink = h => { const k = hintToKey(h); return (k && productUrl(k)) || hintToCat(h); };
  const hintToLinkText = h => { const k = hintToKey(h), p = k && product(k); return p ? p.name : (/humidif/i.test(h) ? 'Fans and climate gear' : h) + ' at HyGrow'; };
  const fromProduct = (key, fallback) => {
    const p = product(key);
    if (!p) return fallback || null;
    return { sku: p.sku || p.id, name: p.name, price: productPrice(key) || (fallback && fallback.price) || 0 };
  };
  const hintToItem = h => {
    h = (h || '').toLowerCase();
    const g = (grp, id) => { const x = GEAR[grp].find(y => y.id === id); return fromProduct(x.key, { sku: x.sku, name: x.name, price: x.price }); };
    const k = hintToKey(h);
    if (/ph up/.test(h)) return fromProduct(k, { sku: 'HG-phup', name: 'pH Up', price: 0 });
    if (/ph down/.test(h)) return fromProduct(k, { sku: 'HG-phdown', name: 'pH Down', price: 0 });
    if (/cal-?mag|calcium/.test(h)) return fromProduct(k, { sku: 'HG-calmag', name: 'Calmag', price: 0 });
    if (/ec meter/.test(h)) return g('meters', 'ec');
    if (/ph (meter|pen)/.test(h)) return g('meters', 'ph');
    if (/thermo|hygro/.test(h)) return g('meters', 'thermo');
    if (/\bpar\b/.test(h)) return g('meters', 'par');
    if (/air ?pump|air ?stone/.test(h)) return g('air', 'aqua2500');
    if (/nutri|a\+b|feed/.test(h)) return fromProduct('profAB1', { sku: 'HG-profAB1', name: "Professor's Nutrients A+B 1L", price: PROF_AB1_PRICE });
    // appliances the game has no gear entry for: only offer a cart button when the store really has the product
    if (k) return fromProduct(k, null);
    return null;
  };

  /* --------- gear catalogue (real HyGrow products, prices from Lightspeed 29 Oct 2026) --------- */
  const GEAR = {
    tents: [
      { id: 'tent80', name: 'Seahawk Smart Tent 0.8 x 0.8 x 1.8', price: 0, askInStore: true, noCart: true, area_m2: 0.64, volume_m3: 1.15, cat: CAT.tents },
      { id: 'tent120', name: 'Seahawk Smart Tent 1.2 x 1.2 x 2', price: 250, area_m2: 1.44, volume_m3: 2.9, cat: CAT.tents, best: true }
    ],
    light: [
      { id: 'led200', name: 'Cultivate Solar Sun LED 200W', price: 270, watts: 200, umolPerJ: 2.4, cat: CAT.lighting },
      { id: 'led300', name: 'Cultivate Solar Sun LED 300W', price: 450, watts: 300, umolPerJ: 2.5, cat: CAT.lighting, best: true },
      { id: 'cmh315', name: 'Hortivision 315W CMH', price: 400, watts: 315, umolPerJ: 1.7, cat: CAT.lighting }
    ],
    medium: [
      { id: 'coco', name: 'Coirlite coco coir 50L', price: 30, medium: 'coco', cat: CAT.medium, best: true },
      { id: 'hydro', name: 'Hygen Clay Balls 50L (hydro)', price: 65, medium: 'hydro', cat: CAT.medium },
      /* v36c: soil and the tower. No invented prices: the price, name and page come from products.js (pottingMix, tower) when the store has the product, else the card says "Ask in store", counts $0 and stays noCart. In the cart only when the store has it in stock. */
      { id: 'soil', name: 'Potting mix', price: 0, askInStore: true, medium: 'soil', cat: CAT.medium, noCart: true },
      { id: 'tower', name: 'Hydro tower', price: 0, askInStore: true, medium: 'tower', cat: CAT.pumps, noCart: true }
    ],
    air: [
      { id: 'none', name: 'No air pump', price: 0, airPump: false },
      { id: 'aqua2500', name: 'Aqua One Precision Air Pump 9500 + stone', price: 30, airPump: true, cat: CAT.pumps, best: true }
    ],
    meters: [
      { id: 'ec', name: 'HM EC meter', price: 80, key: 'ec', cat: CAT.testing },
      { id: 'ph', name: 'HM pH meter', price: 40, key: 'ph', cat: CAT.testing },
      { id: 'thermo', name: 'Cultivate thermo-hygrometer', price: 30, key: 'thermo', cat: CAT.testing },
      { id: 'par', name: 'Spot On quantum PAR meter', price: 0, askInStore: true, noCart: true, key: 'par', cat: CAT.testing }
    ]
  };
  // gear id -> products.js key; where the store has the product, use its real page, SKU and inc-GST price
  const GEAR_KEY = { tent80: 'tent80', tent120: 'tent120', led200: 'led200', led300: 'led300', cmh315: 'cmh315', coco: 'coco50', hydro: 'clay50', aqua2500: 'airPump', ec: 'ecMeter', ph: 'phPen', thermo: 'thermo', par: 'parMeter', soil: 'pottingMix', tower: 'tower' };
  Object.keys(GEAR).forEach(g => GEAR[g].forEach(x => {
    x.key = GEAR_KEY[x.id]; const p = x.key && product(x.key);
    x.sku = p ? (p.sku || p.id) : 'HG-' + x.id;
    if (p && p.url) x.cat = p.url;
    if (p && p.price > 0) x.price = priceIncGst(p.price);
    if (x.askInStore && p && p.price > 0) { x.askInStore = false; x.name = p.name; x.noCart = p.inStock !== true; }
  }));
  const PRESETS = [
    { id: 'starter', name: 'Starter', blurb: 'Small tent, basic light, no extras.', tent: 'tent80', light: 'led200', medium: 'coco', air: 'none', meters: [] },
    { id: 'hobby', name: 'Hobby', blurb: 'The balanced setup Axel recommends.', tent: 'tent120', light: 'led300', medium: 'coco', air: 'aqua2500', meters: ['ec', 'ph', 'thermo'] },
    { id: 'serious', name: 'Serious', blurb: 'Hydro, full metering, PAR meter.', tent: 'tent120', light: 'led300', medium: 'hydro', air: 'aqua2500', meters: ['ec', 'ph', 'thermo', 'par'] }
  ];
  window.GEAR = GEAR; window.PRESETS = PRESETS;
  const CROPS = Sim.CROPS;
  const cropOf = id => CROPS.find(c => c.id === id) || CROPS[0];
  /* "Best this season": a full headless run takes ~50 ms per crop (over the 30 ms budget), so this is a static table
     from a managed-bot run of every crop in every season (2 seeds each, average overall score; top two kept). */
  const BEST = { summer: ['basil', 'cucumber'], autumn: ['basil', 'cucumber'], winter: ['lettuce', 'basil'], spring: ['lettuce', 'basil'] };
  const DEF_BUDGET = 1000;

  /* --------- state --------- */
  let noMeterTold = false, camp = null, mode = 'learn', replay = null, live = null, endShown = false, S = null, scene, quinn, speed = 1, acc = 0, last = 0, pick = null, paused = false, seenTips = {}, firstMix = false, pickedLock = false, lastLit = null, lastLitSnd = 0;
  let againSeed = null, lastOv = null; /* v37 [M29]: Start again on the lost-plant card: same setup, new seed */
  /* v36: the way of growing this sim runs, and the tower's selected slot */
  const methodOf = () => (S && S.method) || (pick && { where: pick.where || 'tent', how: pick.how || 'coco' }) || { where: 'tent', how: 'coco' };
  const isTower = () => { try { return !!S && methodOf().how === 'tower' && typeof Sim.slotInfo === 'function'; } catch (e) { return false; } };
  const slotInfos = () => { try { const a = Sim.slotInfo(S); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const selSlot = () => { const n = slotInfos().length || 1; const i = (S && S.__slot) || 0; return Math.max(0, Math.min(n - 1, i)); };
  /* "G'day, I'm Axel" is said once per browser (the flag is shared with the lesson, beginner.js); after that he says it shorter */
  const INTRO_KEY = 'hygrow_axel_intro_v1';
  const introSeen = (k) => { try { return !!localStorage.getItem(k || INTRO_KEY); } catch (e) { return false; } };
  const GROW_INTRO_KEY = 'hygrow_axel_grow_intro_v1'; /* v52 (play-test #10 #7): the title's G'day set the one key, so the first grow said Back again */
  const introOnce = (first, again, k) => { k = k || INTRO_KEY; if (introSeen(k)) return again; try { localStorage.setItem(k, '1'); } catch (e) {} return first; };
  const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const stageHours = () => { try { return Sim.stageInfo(S).targets.photoperiod; } catch (e) { return 18; } };
  const lightHrs = () => (S && S.lightHours != null) ? S.lightHours : stageHours();
  const lightCycle = () => { const t = stageHours(); const l = [18, 14, 12]; if (l.indexOf(t) < 0) l.push(t); return l.sort((a, b) => b - a); };
  const fmt = (v, d = 1) => v == null || isNaN(v) ? '?' : (+v).toFixed(d);
  /* CLIMATEHINT:start (pure, no DOM: tests/pass7.test.js runs this block on its own)
     Which way a control has to go for a reading that is off its band, and never a control that is already where the reading wants it.
     k = tile key, high = the reading is above its band, o = { fan 0..3, hum 'off'|'humidify'|'dehumidify', hours (lights now), cycle (lights hours, high to low), stage (this stage's hours), room (litres the tank can still take) }.
     Returns { ctl, verb, why, rest, target, text }: ctl is the dock button to tap, or null when nothing is left to push (text then says to wait). null for a reading with no lever. */
  const FAN_WORD = ['Off', 'Low', 'Med', 'High'];
  const endDot = s => /[.!?]$/.test(String(s)) ? String(s) : String(s) + '.'; /* v37: a hint that already ends in a full stop was getting a second one ("Give it a little time..") */
  function climateHint(k, high, o) {
    const fan = o.fan == null ? 2 : o.fan, hum = o.hum || 'off', cyc = o.cycle || [], hours = o.hours;
    /* v58 (play-test #13 #5): "Mist on: the air is dry" read as a state while the dock said Mist: Off. The line now gives the reason, then the instruction */
    const say2 = (verb, why) => why.charAt(0).toUpperCase() + why.slice(1) + '. ' + (/^(Fan|Mist|Lights) /.test(verb) ? 'Turn the ' + verb : 'Tap ' + verb) + '.';
    const mk = (ctl, verb, why, rest, target) => ({ ctl, verb, why, rest: rest || '', target: target || '', text: say2(verb, why) });
    const fanTo = (t, why) => { const d = t > fan ? 'up' : 'down'; return mk('fan', 'Fan ' + d + ' to ' + FAN_WORD[t], why, d + ' to ' + FAN_WORD[t], FAN_WORD[t]); };
    const lightsTo = (up, why) => { const t = up ? cyc.slice().reverse().find(h => h > hours) : cyc.find(h => h < hours); return t == null ? null : mk('lights', 'Lights ' + (up ? 'up' : 'down') + ' to ' + t + 'h', why, (up ? 'up' : 'down') + ' to ' + t + 'h', t + 'h'); };
    const wait = (why, what) => ({ ctl: null, verb: '', why, rest: '', target: '', text: why.charAt(0).toUpperCase() + why.slice(1) + ' and ' + what + '. Give it a little time.' });
    if (k === 'airTemp') {
      if (high) return fan < 3 ? fanTo(3, 'the air is hot') : (lightsTo(false, 'the air is hot') || wait('the air is hot', 'the Fan is already on High'));
      return fan > 1 ? fanTo(1, 'the air is cold') : ((o.stage != null && hours < o.stage && lightsTo(true, 'the air is cold')) || wait('the air is cold', 'the Fan is already ' + (fan === 0 ? 'off' : 'low')));
    }
    if (k === 'rh' || k === 'vpd') {
      const damp = k === 'rh' ? high : !high; /* a high VPD is thirsty (dry) air */
      if (damp && o.cool) return k === 'vpd' && hum === 'humidify' ? mk('humidity', 'Mist off', 'the air is damp and the Mist is adding to it', 'off', 'Off') : o.seedling ? wait('the air is damp', 'the tent is cool') : mk('prune', 'Prune', 'the air is damp and the tent is cool'); /* v65: a seedling cannot be pruned */ /* v64 (critic round 13 #2): a cool lit tent keeps its fan down, as the cold-air hint says */
      if (damp) return fan < 3 ? fanTo(3, 'the air is damp') : hum === 'humidify' ? mk('humidity', 'Mist off', 'the air is damp and the Mist is adding to it', 'off', 'Off') : wait('the air is damp', 'the Fan is already on High');
      return hum !== 'humidify' ? mk('humidity', 'Mist on', 'the air is dry', 'on', 'On') : fan > 1 && o.fanDry !== false ? fanTo(1, 'the air is dry') : wait('the air is dry', 'the Mist is already on'); /* v60 (play-test #14 #3): fan down only when it would make the air less thirsty (Sim.fanHelpsDry) */
    }
    if (k === 'ec') return high ? (o.room != null && o.room < 2 ? mk('changeRes', 'Fresh tank', 'the feed is strong') : mk('topUp', 'Top up', 'the feed is strong')) : mk('mix', 'Mix feed', 'the feed is weak');
    if (k === 'ph') return high ? mk('phDown', 'pH down', 'the pH is high') : mk('phUp', 'pH up', 'the pH is low');
    if (k === 'reservoirL') return mk('topUp', 'Top up', 'the tank is low');
    return null;
  }
  /* CLIMATEHINT:end */

  /* --------- Axel talking: one idea per bubble, player-paced, spotlight on what he points at --------- */
  const MAXCH = 110;
  let userActAt = 0, sayQueue = [], saying = false, cur = null, msgSeq = 0, typeTimer = 0, autoTimer = 0, spotEl = null, lastWords = 0;
  function splitLong(p) {
    const out = [];
    while (p.length > MAXCH) {
      let k = Math.max(p.lastIndexOf(', ', MAXCH), p.lastIndexOf('; ', MAXCH), p.lastIndexOf(' — ', MAXCH));
      if (k < 40) k = p.lastIndexOf(' ', MAXCH);
      if (k < 20) k = MAXCH;
      out.push(p.slice(0, k + 1).trim()); p = p.slice(k + 1).trim();
    }
    if (p) out.push(p);
    return out;
  }
  function chunkText(text) {
    const sents = String(text).trim().split(/(?<=[.!?])\s+/).filter(Boolean), out = [];
    let c = '', n = 0;
    sents.forEach(s => {
      if (c && (n >= 2 || (c + ' ' + s).length > MAXCH)) { out.push(c); c = ''; n = 0; }
      c = c ? c + ' ' + s : s; n++;
    });
    if (c) out.push(c);
    return out.flatMap(p => p.length > MAXCH ? splitLong(p) : [p]);
  }
  const isKeep = o => !!(o.keep || o.requireClick || o.hold || o.worried);
  /* SAYGATE:start (pure, no DOM: tests/pass6.test.js runs this block on its own)
     A queued line is dropped at flush time when its own `stale` predicate says the condition is already false, or when it repeats the line
     spoken in the last 60 s (unless `repeat: true`). `lateStale` is the same kind of predicate but only asked when the line waited more than `lateMs` (1500) in the queue
     ("Fixed! See the tile go green?" is fine at once, stale when it arrives behind other bubbles and the tile is green already). Returns true to drop. */
  function sayDrop(m, last, now) {
    const o = (m && m.opts) || {};
    try { if (typeof o.stale === 'function' && o.stale()) return true; } catch (e) {}
    try { if (typeof o.lateStale === 'function' && m.at != null && now - m.at > (o.lateMs || 1500) && o.lateStale()) return true; } catch (e) {}
    return !o.repeat && !!last && last.text === m.text && now - last.at < 60000;
  }
  /* SAYGATE:end */
  /* v45 (play-test 7 #12): a card never closes by itself until its button has been on screen for 4 s, so a slow reader still finds it. Reset whenever the button leaves the screen. */
  function btnSeen4(btn, m) {
    try {
      const r = btn.getBoundingClientRect(), on = r.width > 0 && r.bottom > 0 && r.top < innerHeight, now = performance.now();
      if (!on) { m.seenSince = null; return false; }
      if (m.seenSince == null) m.seenSince = now;
      return now - m.seenSince >= 4000;
    } catch (e) { return true; }
  }
  /* v45 (play-test 7 #1): the card's button is where focus goes when the card opens (unless the player is typing or a dialog is open); if it could not take focus, the first Tab pulls it there */
  function focusBubbleBtn(btn, m, auto) {
    try {
      const a = document.activeElement, typing = !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable), modal = !!document.querySelector('.modal.show');
      if (modal) return;
      m.tabPull = true; /* the first Tab from outside the card lands on its button */
      if (!auto && !typing) btn.focus({ preventScroll: true });
    } catch (e) {}
  }
  /* v45 (play-test 7 N4): "Grow Sim" plus the version string from version.js; the committed 'dev' placeholder is never shown */
  function growSimVer(v) { const g = v && v.game && v.game !== 'dev' ? ' ' + v.game : '', b = v && v.build && v.build !== 'dev' && v.build !== v.game ? ' · ' + v.build : ''; return 'Grow Sim' + g + b; }
  let lastSaid = null;
  function say(text, opts = {}) {
    if (!text) return;
    if (mode === 'beginner' && window.Beginner && Beginner.isActive && Beginner.isActive() && !opts.bg) return; /* lesson in progress: only Axel's scripted lines */
    if (mode === 'beginner' || mode === 'learn') { opts = Object.assign({}, opts); delete opts.cartItem; if (mode === 'beginner') { delete opts.link; delete opts.linkText; } } /* no "Add to cart" on a coach card in a lesson, no shop pill at all in Grow with Axel: products live in the More sheet and the cart */
    const id = ++msgSeq, parts = chunkText(text);
    const items = parts.map((t, i) => {
      const last = i === parts.length - 1, o = Object.assign({}, opts);
      if (!last) { delete o.link; o.requireClick = false; delete o.then; delete o.action; }
      return { text: t, opts: o, id, last, at: performance.now() };
    });
    if (opts.front) sayQueue.unshift(...items); else sayQueue.push(...items);
    capQueue();
    if (!saying) nextSay();
  }
  /* BUBBLECART:start (pure, no DOM: tests/pass8.test.js runs this block on its own)
     A tap on "Add to cart" in a coach bubble (PLAYTEST-DEV-v34 "shop pull": the bubble closed and the cart pill stayed at 7). The item goes into the cart, the cart's count is checked afterwards, and the toast says what happened.
     An item with no SKU gets no button at all. cart = { add(o), count() }. Returns { ok, toast }. */
  function bubbleCartClick(item, cart) {
    if (!item || !item.sku) return { ok: false, toast: 'That one is not in the online shop yet. Ask the team in store.' };
    let before = 0, after = 0;
    try { before = cart.count(); cart.add({ sku: item.sku, name: item.name, price: item.price, qty: 1, why: item.why || 'Axel suggested' }); } catch (e) {}
    try { after = cart.count(); } catch (e) {}
    return after > before ? { ok: true, toast: 'Added to cart: ' + item.name + ' · ' + after + (after === 1 ? ' item' : ' items') } : { ok: false, toast: "Couldn't add " + item.name + ' to the cart. Use the shop link instead.' };
  }
  /* BUBBLECART:end */
  function bubbleCartButton(item) {
    if (!item || !item.sku) return null;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cart-add'; b.textContent = 'Add to cart';
    b.addEventListener('click', e => {
      e.stopPropagation();
      const r = bubbleCartClick(item, Cart);
      try { Cart.renderChip($('#cartChip')); Cart.renderChip($('#cartChipM')); } catch (er) {} /* repaint the pills even if something inside Cart.add stopped before it did */
      toast(r.toast, 3000);
      if (r.ok) { b.textContent = 'Added ✓'; b.disabled = true; try { Sfx.play('coin'); } catch (er) {} }
    });
    return b;
  }
  /* --------- toast: a small non-blocking line above the action bar (never holds the clock, never needs a tap) --------- */
  let toastT = 0, almN = 0, almAt = 0;
  function toast(text, ms) {
    const el = $('#toast'); if (!el || !text) return;
    el.textContent = text; el.classList.add('show'); try { V36B.placeToast(el); } catch (e) {} try { Sfx.cue('toastTick', {}, { key: 'toast', ms: 300 }); } catch (e) {} clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms || 2600);
  }
  window.GrowToast = toast;
  document.addEventListener('hygrow:toast', e => toast(e.detail && e.detail.text, e.detail && e.detail.ms));
  /* the player did what a toast was waiting for ("Paused: the clock waits for you"): take it down. detail.match = the text it must start with */
  document.addEventListener('hygrow:toastclear', e => { const el = $('#toast'), m = e.detail && e.detail.match; if (el && el.classList.contains('show') && (!m || el.textContent.indexOf(m) === 0)) { clearTimeout(toastT); el.classList.remove('show'); } });
  /* "Almanac: new entry, X!" used to be a bubble that held the clock; a burst of them is now one toast (the Almanac keeps the entries) */
  document.addEventListener('hygrow:say', e => {
    const d = e.detail || {}, t = String(d.text || '');
    if (/^Almanac: new entry/.test(t)) { const now = performance.now(); almN = now - almAt < 3500 ? almN + 1 : 1; almAt = now; toast(almN > 1 ? 'Almanac: ' + almN + ' new entries' : t, 3200); return; }
    say(d.text, d.opts || {});
  });
  function capQueue() {
    const ids = () => [...new Set(sayQueue.map(m => m.id))];
    while (ids().length > 4) {
      const drop = ids().find(id => !isKeep(sayQueue.find(m => m.id === id).opts));
      if (drop == null) break;
      sayQueue = sayQueue.filter(m => m.id !== drop);
    }
  }
  /* does Axel's talk hold the clock right now? */
  function spotAllowed(o) { return !!(S && o && o.target && mode !== 'free'); }
  function spotReachable(sel) { try { const el = document.querySelector(sel); return !el || el.getClientRects().length > 0; } catch (e) { return true; } }
  const reqTap = m => !!(m && m.pointing && m.opts.requireClick); /* this bubble asks for a tap on a control that is on screen */
  function holdsFor(o) { return !!S && !o.nohold && (mode !== 'free' || !!o.hold); } /* nohold: a card that must not pause the clock (e.g. a problem whose fix button is not on screen) */
  let holdOff = false; /* v36d: set by V36B.holdWatch while a holding bubble's button has been off screen for 5 s: the clock runs, the bubble stays */
  function holding() {
    if (!S || holdOff) return false;
    if (cur && holdsFor(cur.opts)) return true;
    return sayQueue.some(m => holdsFor(m.opts)) && !!cur;
  }
  function flushSay() {
    clearTimeout(typeTimer); clearTimeout(autoTimer); sayQueue = []; cur = null; saying = false; lastSaid = null; try { Sfx.stopVoice(); } catch (e) {}
    const b = $('#bubble'); if (b) { b.classList.remove('show'); b.innerHTML = ''; } hideSpot();
  }
  document.addEventListener('hygrow:skip', () => { try { flushSay(); } catch (e) { warnOnce('hygrow:skip', e); } }); /* v49: beginner.js fires it when the lesson is skipped, finished or its end card opens, so no bubble sits under the card (play-test #8) */
  /* Ghost-tap shield: for 300 ms after any card closes (Got it / Next / Skip / auto), taps on the dock, reading tiles, shop pills, the tent and the speed
     buttons are swallowed, so a second tap on the spot where the card's button was cannot press whatever slides into its place. */
  let lastCardAt = 0;
  const shieldOn = () => performance.now() - lastCardAt < 300;
  const GHOST_SEL = '#dock,#moreBtn,#speed,.rd,a.store,#stripDots,#tent,#quinn';
  /* a reading tile Axel is pointing at (spotlight, or the lesson's data-bgp glow) */
  function glowingTile(t) {
    try {
      const rd = t.closest && t.closest('#readings .rd'); if (!rd) return false;
      const host = $('#readings'), g = ((host && host.getAttribute('data-bgp')) || '').split(' ');
      return g.indexOf(rd.dataset.reading) >= 0 || !!(spotSel && t.closest(spotSel));
    } catch (e) { return false; }
  }
  function ghostGuard(e) {
    if (!shieldOn()) return;
    const t = e.target; if (!t || !t.closest || t.closest('#bubble') || !t.closest(GHOST_SEL)) return;
    if (glowingTile(t)) return; /* Marg tapped the glowing tile three times: the spotlit target is never behind the 300 ms shield */
    e.stopPropagation(); e.preventDefault();
    if (e.type === 'click' && t.closest('#speed,#dock')) toast('One moment, tap again', 1500); /* a swallowed tap is never silent */
  }
  document.addEventListener('click', ghostGuard, true); document.addEventListener('pointerup', ghostGuard, true);
  document.addEventListener('click', e => { const t = e.target; if (t && t.closest && t.closest('.lc-ok,#bubble button.next')) lastCardAt = performance.now(); }, true); /* cards.js "Got it" closes through its own handler */
  function advance(noShield) {
    if (!cur) return;
    if (!noShield) lastCardAt = performance.now();
    clearTimeout(typeTimer); clearTimeout(autoTimer);
    const done = cur; cur = null; hideSpot(); try { Sfx.stopVoice(); } catch (e) {}
    if (done.opts.then) { try { done.opts.then(); } catch (e) { console.warn(e); } }
    nextSay();
    setTimeout(() => { try { if (document.activeElement === document.body || !document.activeElement) { const t = (done.opts.target && document.querySelector(done.opts.target)) || $('#dock button.bg-pulse, #dock button.ready') || $('#dock button'); if (t && t.focus) t.focus({ preventScroll: true }); } } catch (e) {} }, 250); /* v72 (sweep of round 19): 250 ms later, so a dialog closed by the same Escape gives focus back to its opener first */ /* v37: focus used to drop to body after Got it */
  }
  function nextSay() {
    let m = sayQueue.shift();
    while (m && sayDrop(m, lastSaid, performance.now())) { const th = m.opts && m.opts.then; if (typeof th === 'function') { try { th(); } catch (e) { console.warn(e); } } m = sayQueue.shift(); } /* stale or repeated: skip it, but still run its `then` so a chain never stalls */
    if (m) lastSaid = { text: m.text, at: performance.now() };
    if (!m) { saying = false; cur = null; const bb = $('#bubble'); bb.classList.remove('show'); bb.innerHTML = ''; hideSpot(); Mob.onIdle(); if (scrollHome != null) { const y = scrollHome; scrollHome = null; try { if (Math.abs(window.scrollY - y) > 40 && !window.UserScroll.recent() && !document.querySelector('.modal.show')) scrollTo({ top: y, behavior: 'auto' }); } catch (e) {} } /* v45: the page goes back to the plant once the card is gone */ return; }
    saying = true; cur = m;
    const o = m.opts, b = $('#bubble'); Mob.onSay(o);
    const auto = !o.stay && (mode === 'free' || !S || o.auto);
    const pointing = m.pointing = spotAllowed(o) && spotReachable(o.target); /* a target that is not on screen (phone: tucked in the More sheet) is not pointed at, and the sheet no longer opens by itself */
    b.classList.add('show'); b.classList.toggle('pointing', pointing);
    delete b.dataset.typed; b.innerHTML = '<div class="bbody"><span class="txt"></span></div><div class="bfoot"></div>'; /* v59: .bbody scrolls inside a phone card, .bfoot stays put (index.html) */
    const txt = b.querySelector('.txt'), foot = b.querySelector('.bfoot');
    const words = m.text.split(' '); let i = 0; lastWords = words.length;
    quinn.talk(words.length * 35 + 250); if (o.wave) quinn.wave(); if (o.hop) quinn.hop();
    quinn.mood(o.worried ? 'worried' : (pointing || o.link ? 'point' : 'happy'));
    if (!(window.Voice && Voice.say('axel', m.text))) Sfx.play('voiceAxel', { syllables: Math.min(9, 2 + Math.round(words.length / 4)), seed: m.text.length, pitch: o.worried ? 0.92 : 1 });
    if (pointing) showSpot(o.target, !!o.requireClick);
    try { V36B.reachBubble(0); } catch (e) {} /* v36b: the bubble and its button-to-be are on screen the moment the clock waits for them */
    const finish = () => {
      if (cur !== m) return;
      /* every card gets a button: Got it / Next, or Skip when it asks for a tap on a control (so a covered or missing control can never trap the player) */
      const needTap = pointing && o.requireClick;
      const nb = document.createElement('button'); nb.className = 'next' + (needTap ? ' skip' : ''); nb.type = 'button';
      nb.textContent = needTap ? 'Got it' : (m.last && !o.more ? 'Got it' : 'Next ▸'); /* v45: was 'Skip', which read as "ignore this"; pressing the spotlit control closes the card too */ nb.onclick = e => { e.stopPropagation(); Sfx.play('click'); advance(); };
      foot.appendChild(nb);
      /* an optional second button on the card (the lesson's "Skip the warm-up" for an experienced player): opts.action = { text, run } */
      if (o.action && typeof o.action.run === 'function') {
        const ab = document.createElement('button'); ab.className = 'next skip'; ab.type = 'button'; ab.dataset.bact = '1'; /* v71 (keyboard round 18 M1): Enter and Space reach its own click (the bubble's keydown took them as Got it) */ ab.textContent = o.action.text || 'Skip';
        ab.onclick = e => { e.stopPropagation(); Sfx.play('click'); advance(); try { o.action.run(); } catch (er) { console.warn(er); } };
        foot.appendChild(ab);
      }
      /* shop pill and cart button go BELOW the button (CSS stacks .bfoot), need a direct tap, and are ignored right after a card closes */
      if (o.link) {
        const a = document.createElement('a'); a.href = tag(o.link); a.target = '_blank'; a.rel = 'noopener'; a.className = 'store'; a.textContent = (o.linkText || 'See it in store') + ' →';
        a.addEventListener('pointerdown', () => { a._pd = performance.now(); });
        a.onclick = e => { e.stopPropagation(); if (shieldOn() || (e.detail > 0 && !(a._pd && performance.now() - a._pd < 2000))) { e.preventDefault(); return; } Sfx.play('coin'); };
        (matchMedia('(max-width:599px)').matches ? b.querySelector('.bbody') || foot : foot).appendChild(a); /* v59: on a phone the shop pill and the cart scroll with the text; the footer keeps only the buttons */
        if (o.cartItem && window.Cart) { const cb = bubbleCartButton(o.cartItem); if (cb) a.insertAdjacentElement('afterend', cb); }
      }
      moreCue(b, foot); /* v60 (critic round 10 #2) */
      if (!needTap && auto) { const hold = () => { try { return b.matches(':hover') || b.contains(document.activeElement) || !!(window.Voice && Voice.playing && Voice.playing()); } catch (e) { return false; } }; const arm = ms => { autoTimer = setTimeout(() => { if (cur !== m) return; if (hold() || !btnSeen4(nb, m)) arm(400); else advance(); }, ms); }; arm((o.dwell || 2500) + 60 * words.length); } /* v37 [M24][M28] a bubble waits while it is hovered or focused, and until a voiced line has finished */
      m.typed = true; b.dataset.typed = '1'; focusBubbleBtn(nb, m, !needTap && auto);
      if (pointing && spotSel) reachSpot(document.querySelector(spotSel)); else keepInView(b);
      try { V36B.armReach(m); } catch (e) {}
    };
    const tick = () => {
      if (cur !== m) return;
      if (i < words.length) { txt.textContent += (i ? ' ' : '') + words[i++]; typeTimer = setTimeout(tick, 35); } else finish();
    };
    m.finishNow = () => { clearTimeout(typeTimer); txt.textContent = m.text; i = words.length; finish(); };
    tick();
  }
  /* v60 (critic round 10 #2): on a phone a capped card whose body runs past its window (a shop pill or a cart button below the text) says so: a
     "More" button in the footer scrolls the body one window down, and goes once the body has been scrolled to its end */
  function moreCue(b, foot) {
    const body = b.querySelector('.bbody'); if (!body || !foot || !matchMedia('(max-width:599px)').matches) return;
    if (body.scrollHeight - body.clientHeight < 8) return;
    const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'more-cue'; mb.textContent = 'More ▾';
    mb.setAttribute('aria-label', body.querySelector('a.store') ? 'More below, with the shop link' : 'More below');
    mb.onclick = e => { e.stopPropagation(); body.scrollBy({ top: Math.max(24, body.clientHeight - 16), behavior: 'smooth' }); };
    const end = () => { if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) { mb.remove(); b.classList.remove('more'); body.removeEventListener('scroll', end); } };
    body.addEventListener('scroll', end, { passive: true });
    b.classList.add('more'); foot.insertBefore(mb, foot.firstChild);
  }
  document.addEventListener('click', e => {
    if (!cur) return;
    const b = $('#bubble');
    if (b && b.contains(e.target)) {
      if (e.target.closest('a,button')) return;
      if (!cur.typed) cur.finishNow(); else if (!reqTap(cur)) advance();
      return;
    }
    if (reqTap(cur) && e.target.closest && e.target.closest(cur.opts.target)) setTimeout(() => advance(true), 0); /* tapping the spotlit control closes its bubble at once, with no shield for the next tap */
  });
  document.addEventListener('keydown', e => {
    if (!cur || document.querySelector('.modal.show,#actionbar.open,.ll-back,.stv')) return; /* v65 (play-test #17 keyboard M3): nor while the live-link dialog or a story is up; the first Tab pulled focus out of the dialog to Got it behind it */ /* v51 (critic round 5 #4): nor while the More sheet is open; its Tab stays inside. v52 (round 6 #2): by the open class, since the hidden modals carry aria-modal all the time */
    if (e.key === 'Tab' && !e.shiftKey && cur.tabPull) { /* v45: the first Tab after a card opens lands on its button (2 presses at most from anywhere) */
      const nb = document.querySelector('#bubble button.next'), a = document.activeElement;
      cur.tabPull = false;
      if (nb && !(a && a.closest && a.closest('#bubble'))) { e.preventDefault(); try { nb.focus({ preventScroll: true }); } catch (er) {} try { const q = nb.getBoundingClientRect(); if (q.right < 0 || q.left > (window.innerWidth || 0) || q.bottom < 0 || q.top > (window.innerHeight || 0)) { const sd = nb.closest('.side'); let pn = nb; while (pn && sd && pn.parentElement !== sd) pn = pn.parentElement; if (sd && pn && sd.scrollWidth > sd.clientWidth + 4) sd.scrollTo({ left: pn.offsetLeft - sd.offsetLeft, behavior: 'auto' }); else nb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } } catch (er) {} return; } /* v71 (keyboard round 18 m2): on a phone the bubble can sit on another pager panel; bring the button into view */
    }
    if (e.key === 'Escape') { e.preventDefault(); advance(); return; }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (reqTap(cur)) return;
    const a = document.activeElement;
    if (a && a !== document.body && !(a.classList && a.classList.contains('next'))) return;
    if (a && a.dataset && a.dataset.bact) return; /* v71 (keyboard round 18 M1): the card's second button (Finish the chapter, Skip the warm-up) runs itself */
    e.preventDefault(); if (!cur.typed) cur.finishNow(); else advance();
  });

  /* v45 (play-test 7 #6): 20 s of real time at 1x with nothing asked and no input: Axel says once a game day "Tap 3x while you wait." */
  let idleIn = performance.now(), idleDay = -1;
  ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => { idleIn = performance.now(); }, true));
  setInterval(() => {
    try {
      const busy = !S || endShown || mode === 'beginner' || speed !== 1 || cur || sayQueue.length || paused || document.hidden || document.querySelector('.modal.show, #learnCard.in, #readings .rd.bad, #readings .rd.warn') || !document.querySelector('#speed button[data-s="3"]');
      if (busy) { idleIn = performance.now(); return; }
      if (performance.now() - idleIn < 20000 || idleDay === S.day) return;
      idleDay = S.day; idleIn = performance.now();
      say('Tap 3x while you wait.', { bg: true, auto: true, hop: true, dwell: 3000 });
    } catch (e) {}
  }, 2000);
  /* SCROLLPLAN:start (pure, no DOM: tests/pass8.test.js runs this block on its own)
     Pass 8b (docs/PLAYTEST-DEV-v34.md friction 5): on a desktop the page auto-scrolled back to the glowing button while the player was scrolling, and a centred scroll pushed Axel's bubble half off the top.
     How far (px, + = down) to scroll so the target t is on screen, given its rect, the bubble's rect b (null when the bubble does not move with the page), the viewport height and whether the player scrolled by hand in the last 3 s.
     Nothing when they did, nothing when the target is already in view, and never so far that the bubble leaves the screen. */
  function scrollPlan(t, b, vh, recent) {
    if (recent || !t || !(t.width || t.height || t.bottom - t.top)) return 0;
    if (t.top >= 0 && t.bottom <= vh) return 0;
    const M = 12;
    let d = t.top < 0 || t.bottom - t.top > vh - 2 * M ? t.top - M : t.bottom - (vh - M);
    if (b && b.bottom > b.top) {
      if (d > 0) d = Math.min(d, Math.max(0, b.top - 8)); /* the bubble moves up by d: its top stays on screen */
      else if (d < 0) d = Math.max(d, -Math.max(0, vh - 8 - b.bottom)); /* the bubble moves down by -d: its bottom stays on screen */
    }
    return Math.round(d);
  }
  /* SCROLLPLAN:end */
  /* the player's own scrolling (wheel, touch drag, PageUp/PageDown/Home/End) is remembered for 3 s: nothing auto-scrolls over it (beginner.js asks through window.UserScroll too) */
  let userScrollAt = -1e9, scrollHome = null; /* v45: where the page was before a spotlight scrolled it (play-test 7 #10) */
  const noteScroll = () => { userScrollAt = performance.now(); scrollHome = null; };
  addEventListener('wheel', noteScroll, { passive: true }); addEventListener('touchmove', noteScroll, { passive: true });
  addEventListener('keydown', e => { if (/^(PageUp|PageDown|Home|End)$/.test(e.key) && !(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) noteScroll(); });
  window.UserScroll = { recent: ms => performance.now() - userScrollAt < (ms || 3000), plan: scrollPlan };
  /* bring the spotlit control into view: only when it is not, only by as much as keeps Axel's bubble on screen, never over the player's own scrolling */
  function spotScroll(el) {
    if (window.NoScroll && window.NoScroll()) return; /* v36b: a bar tap never moves the page */
    try {
      const bb = $('#bubble'), moves = !!bb && bb.classList.contains('show') && getComputedStyle(bb).position !== 'fixed';
      const d = scrollPlan(el.getBoundingClientRect(), moves ? bb.getBoundingClientRect() : null, innerHeight, window.UserScroll.recent());
      if (d) scrollBy({ top: d, behavior: (mqSmall.matches || reduceMotion()) ? 'auto' : 'smooth' });
    } catch (e) {}
  }

  /* --------- spotlight: four dim panels leave a clickable hole around the target --------- */
  let spotSel = null, spotReq = false, spotRoot = null;
  function ensureSpot() {
    if (spotRoot) return spotRoot;
    const r = document.createElement('div'); r.id = 'spot'; r.hidden = true;
    r.innerHTML = '<div class="sh t"></div><div class="sh b"></div><div class="sh l"></div><div class="sh r"></div><div class="sh plug"></div><div class="ring"></div><div class="arrow"><svg viewBox="0 0 40 40" width="40" height="40"><path d="M4 8 L36 20 L4 32 L12 20 Z" fill="#ec8024" stroke="#2a1d14" stroke-width="3" stroke-linejoin="round"/></svg></div>';
    document.body.appendChild(r); spotRoot = r; return r;
  }
  function showSpot(sel, req) {
    ensureSpot(); if (scrollHome == null) scrollHome = window.scrollY;
    const retarget = sel !== spotSel; /* new target: one-shot sweep highlight around the ring */
    spotSel = sel; spotReq = req; spotRoot.hidden = false; document.body.classList.add('spotting');
    spotRoot.classList.toggle('look-tent', sel === '#tent');
    if (retarget && !reduceMotion()) {
      const rg = spotRoot.querySelector('.ring');
      rg.classList.remove('sweep'); void rg.offsetWidth; rg.classList.add('sweep');
      clearTimeout(showSpot.swT); showSpot.swT = setTimeout(() => rg.classList.remove('sweep'), 950);
    }
    const el = document.querySelector(sel); Mob.onSpot(el);
    if (el) { spotScroll(el); reachSpot(el); } /* the ring follows the scroll (placeSpot runs on scroll) */
    placeSpot();
    /* v36: the animation agent listens. detail = { selector, rect } while Axel points, null when the bubble closes */
    if (el) { try { const q = el.getBoundingClientRect(); document.dispatchEvent(new CustomEvent('hygrow:point', { detail: { selector: sel, rect: { left: q.left, top: q.top, right: q.right, bottom: q.bottom, width: q.width, height: q.height } } })); } catch (e) {} }
  }
  /* phones: keep the spotlit control clear of the card (fixed under the header) and of the fixed action bar; the bar's own buttons never move */
  function reachSpot(el) {
    if (!el || !mqSmall.matches || el.closest('#actionbar') || window.UserScroll.recent() || (window.NoScroll && window.NoScroll())) return;
    const q = el.getBoundingClientRect(); if (!q.width && !q.height) return;
    const bb = $('#bubble'), bar = $('#actionbar');
    const top = (bb && bb.classList.contains('show') && getComputedStyle(bb).position === 'fixed') ? bb.getBoundingClientRect().bottom + 10 : 8;
    const bot = (bar && !bar.classList.contains('open') ? bar.getBoundingClientRect().top : innerHeight) - 10;
    if (q.bottom - q.top > bot - top) return;
    if (q.top < top) scrollBy(0, q.top - top); else if (q.bottom > bot) scrollBy(0, q.bottom - bot);
  }
  /* a card that is not pointing at anything sits in Axel's panel: make sure its button is not behind the action bar */
  function keepInView(b) {
    if (!b || !mqSmall.matches || window.UserScroll.recent() || (window.NoScroll && window.NoScroll())) return;
    const bar = $('#actionbar'), q = b.getBoundingClientRect(); if (!bar || !q.height || bar.classList.contains('open')) return;
    const bot = bar.getBoundingClientRect().top - 8;
    if (q.bottom > bot) scrollBy(0, q.bottom - bot);
  }
  function hideSpot() { const was = spotSel; spotSel = null; if (spotRoot) spotRoot.hidden = true; document.body.classList.remove('spotting'); if (was) { try { document.dispatchEvent(new CustomEvent('hygrow:point', { detail: null })); } catch (e) {} } }
  function placeSpot() {
    if (!spotSel || !spotRoot) return;
    let el = document.querySelector(spotSel);
    if (el && el.closest('#dockOverflow') && !(el.offsetWidth || el.offsetHeight)) { const mb = $('#moreBtn'); if (mb) el = mb; } /* v49: a fix that lives in the closed More sheet (Cover on a coco bed phone dock) is pointed at through More (play-test #8 item 4) */
    if (!el) { spotRoot.hidden = true; return; }
    spotRoot.hidden = false;
    const W = innerWidth, H = innerHeight, P = 6, q = el.getBoundingClientRect();
    const x0 = Math.max(0, q.left - P), y0 = Math.max(0, q.top - P), x1 = Math.min(W, q.right + P), y1 = Math.min(H, q.bottom + P);
    const set = (c, l, t, w, h) => { const s = spotRoot.querySelector(c).style; s.left = l + 'px'; s.top = t + 'px'; s.width = Math.max(0, w) + 'px'; s.height = Math.max(0, h) + 'px'; };
    set('.t', 0, 0, W, y0); set('.b', 0, y1, W, H - y1); set('.l', 0, y0, x0, y1 - y0); set('.r', x1, y0, W - x1, y1 - y0);
    set('.plug', x0, y0, x1 - x0, y1 - y0); spotRoot.querySelector('.plug').hidden = spotReq;
    set('.ring', x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
    // arrow comes from the side nearest Axel
    const ax = document.querySelector('#quinn').getBoundingClientRect(), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const dx = ax.left + ax.width / 2 - cx, dy = ax.top + ax.height / 2 - cy;
    let side; if (Math.abs(dx) * (y1 - y0 + 60) > Math.abs(dy) * (x1 - x0 + 60)) side = dx < 0 ? 'l' : 'r'; else side = dy < 0 ? 't' : 'b';
    const G = 30; let px = cx, py = cy, ang = 0;
    if (side === 'l') { px = x0 - G; ang = 0; } else if (side === 'r') { px = x1 + G; ang = 180; } else if (side === 't') { py = y0 - G; ang = 90; } else { py = y1 + G; ang = 270; }
    px = Math.max(22, Math.min(W - 22, px)); py = Math.max(22, Math.min(H - 22, py));
    const a = spotRoot.querySelector('.arrow'); a.style.left = px + 'px'; a.style.top = py + 'px'; a.style.transform = 'translate(-50%,-50%) rotate(' + ang + 'deg)';
  }
  addEventListener('resize', placeSpot); addEventListener('scroll', placeSpot, true);

  /* --------- setup screen (v36 design pass): WHERE / HOW / WHAT on one screen, no paging ---------
     Trev played v35: "choose how you want to grow (hand watering, outdoors, veranda, hydroponic tower for multiple plants, coco or soil)".
     Sim.METHODS (engine.js) lists the places and ways and which pairs make sense; without it only tent + hydro is offered. Gear is a preset per combo (budget logic kept), "Adjust gear" opens the old cards. */
  const FALLBACK_METHODS = {
    where: { tent: { label: 'Tent', blurb: 'Indoors with lights and a fan. You run the weather.' } },
    how: { hydro: { label: 'Hydro tank', blurb: 'Mix feed in a tank, keep the pH right, top up.' } },
    combos: [['tent', 'hydro']]
  };
  const METHODS = () => { try { const m = window.Sim && Sim.METHODS; if (m && m.where && m.how && Array.isArray(m.combos) && m.combos.length) return m; } catch (e) {} return FALLBACK_METHODS; };
  const HOW_DO = { soil: 'Water by hand when the soil dries.', coco: 'Feed and flush. A drip line helps.', hydro: 'Mix feed in the tank, watch the pH.', tower: 'Eight plants on one tank. Pick them a slot at a time, then replant the gaps.' };
  const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const howDo = h => { if (h !== 'tower' || !Sim.towerSlots) return HOW_DO[h]; const n = Sim.towerSlots(pick.crop); return (NUMW[n] || n) + (n === 1 ? ' plant' : ' plants') + ' on one tank. Pick them a slot at a time, then replant the gaps.'; }; /* v65 (critic round 14 minor 4): a vine crop gets 4 slots and chilli 6, not 8 */
  const WHERE_DO = { tent: 'Indoors with lights and a fan. You run the weather.', veranda: 'Pots under cover. Sun, rain and wind come to you.', outdoors: 'A garden bed in the open. The weather is the boss.' };
  const DEF_HOW = 'coco';
  const WHERE_ICON = {
    tent: '<svg viewBox="0 0 64 44" aria-hidden="true"><rect x="14" y="4" width="36" height="36" rx="4" fill="#cfd5da" stroke="#2a1d14" stroke-width="2.5"/><rect x="22" y="10" width="20" height="4" rx="2" fill="#2b2f33"/><path d="M32 40V24M32 28q-8 0-8-8 8 0 8 8zM32 30q8 0 8-8-8 0-8 8z" fill="#6ec846" stroke="#2a1d14" stroke-width="2"/></svg>',
    veranda: '<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M6 14L32 4l26 10z" fill="#8a929a" stroke="#2a1d14" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 14v26M54 14v26" stroke="#2a1d14" stroke-width="3"/><path d="M8 40h48" stroke="#8a6a45" stroke-width="5"/><path d="M18 40l2-10h10l2 10zM38 40l2-8h8l2 8z" fill="#c0643c" stroke="#2a1d14" stroke-width="2"/><path d="M25 30q-5-6 0-10 5 4 0 10zM44 32q-5-6 0-9 5 3 0 9z" fill="#6ec846" stroke="#2a1d14" stroke-width="1.6"/></svg>',
    outdoors: '<svg viewBox="0 0 64 44" aria-hidden="true"><circle cx="50" cy="10" r="6" fill="#f2b950" stroke="#2a1d14" stroke-width="2"/><path d="M6 38l4-12h44l4 12z" fill="#8a5a34" stroke="#2a1d14" stroke-width="2.5" stroke-linejoin="round"/><path d="M12 26h40" stroke="#2f1f12" stroke-width="4"/><path d="M20 26q-3-8 2-10M32 26q0-10 0-14M44 26q3-8-2-10" fill="none" stroke="#4fa23a" stroke-width="3" stroke-linecap="round"/></svg>'
  };
  const HOW_ICON = {
    soil: '<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M20 40l-3-14h30l-3 14z" fill="#c0643c" stroke="#2a1d14" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="32" cy="26" rx="15" ry="4" fill="#5a3a20" stroke="#2a1d14" stroke-width="2"/><path d="M32 26q-10-2-10-12 10 0 10 12zM32 24q10-2 10-10-10 0-10 10z" fill="#6ec846" stroke="#2a1d14" stroke-width="2"/><path d="M52 8q4 6 0 8-4-2 0-8z" fill="#6fc3e8" stroke="#2a1d14" stroke-width="1.6"/></svg>',
    coco: '<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M20 40l-3-14h30l-3 14z" fill="#26292c" stroke="#2a1d14" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="32" cy="26" rx="15" ry="4" fill="#9a6a3a" stroke="#2a1d14" stroke-width="2"/><path d="M32 26q-10-2-10-12 10 0 10 12zM32 24q10-2 10-10-10 0-10 10z" fill="#6ec846" stroke="#2a1d14" stroke-width="2"/><path d="M8 6h22" stroke="#2a1d14" stroke-width="2.4"/><path d="M26 8q3 5 0 7-3-2 0-7z" fill="#6fc3e8" stroke="#2a1d14" stroke-width="1.5"/></svg>',
    hydro: '<svg viewBox="0 0 64 44" aria-hidden="true"><rect x="12" y="24" width="40" height="16" rx="4" fill="#1d2b33" stroke="#2a1d14" stroke-width="2.5"/><rect x="15" y="29" width="34" height="9" rx="2" fill="#6fc3e8"/><path d="M32 24v-6M32 20q-9-1-9-10 9 0 9 10zM32 18q9-1 9-9-9 0-9 9z" fill="#6ec846" stroke="#2a1d14" stroke-width="2"/></svg>',
    tower: '<svg viewBox="0 0 64 44" aria-hidden="true"><rect x="24" y="3" width="16" height="36" rx="5" fill="#e8ecee" stroke="#2a1d14" stroke-width="2.5"/><path d="M40 10l8-2M24 18l-8-2M40 26l8-2M24 34l-8-2" stroke="#2a1d14" stroke-width="2.5" stroke-linecap="round"/><path d="M48 8q4-6 8-2-4 5-8 2zM16 16q-4-6-8-2 4 5 8 2zM48 24q4-6 8-2-4 5-8 2zM16 32q-4-6-8-2 4 5 8 2z" fill="#6ec846" stroke="#2a1d14" stroke-width="1.6"/><rect x="18" y="39" width="28" height="4" rx="2" fill="#26292c"/></svg>'
  };
  const allowedHows = w => METHODS().combos.filter(c => c[0] === w).map(c => c[1]);
  function normMethod() {
    if (!pick) return;
    const M = METHODS(), ws = Object.keys(M.where);
    if (!pick.where || !M.where[pick.where]) pick.where = ws[0];
    const hs = allowedHows(pick.where);
    if (!pick.how || hs.indexOf(pick.how) < 0) { pick.how = hs.indexOf(DEF_HOW) >= 0 ? DEF_HOW : hs[0]; applyMethodKit(); }
  }
  /* the preset kit for a combo (the old "Hobby" tent and light, the medium the way needs, an air pump only where roots sit in water, meters that suit it) */
  function applyMethodKit() {
    const hobby = PRESETS[1];
    pick.tent = hobby.tent; pick.light = hobby.light; pick.medium = pick.how;
    pick.air = (pick.how === 'hydro' || pick.how === 'tower') ? 'aqua2500' : 'none';
    pick.meters = metersOf(pick.how === 'soil' ? ['thermo'] : ['ec', 'ph', 'thermo']);
  }
  const gp = (g, id) => GEAR[g].find(x => x.id === id) || GEAR[g][0];
  const metersOf = ids => { const m = { ec: false, ph: false, thermo: false, par: false }; ids.forEach(k => m[k] = true); return m; };
  /* a preset card (Starter / Hobby / Serious) changes the kit, never the medium: that belongs to the "How" row */
  function applyPreset(p) { pick.tent = p.tent; pick.light = p.light; pick.air = p.air; pick.meters = metersOf(p.meters); }
  function normPick() {
    if (!pick) return;
    if (!(pick.budget >= 300 && pick.budget <= 2500)) pick.budget = DEF_BUDGET;
    if (!pick.tent || !GEAR.tents.some(t => t.id === pick.tent)) pick.tent = 'tent120';
    if (!pick.medium || !GEAR.medium.some(m => m.id === pick.medium)) pick.medium = pick.how && GEAR.medium.some(m => m.id === pick.how) ? pick.how : 'coco';
    if (!pick.meters) pick.meters = metersOf(['ec', 'ph', 'thermo']);
  }
  function activePreset() {
    return PRESETS.find(p => p.tent === pick.tent && p.light === pick.light && p.air === pick.air &&
      ['ec', 'ph', 'thermo', 'par'].every(k => !!pick.meters[k] === p.meters.includes(k))) || null;
  }
  const inTent = p => !p.where || p.where === 'tent'; /* a veranda or a garden bed needs no tent and no light */
  function showSetup() {
    pick = { crop: easiestCrop().id, budget: DEF_BUDGET, where: 'tent', how: DEF_HOW };
    normMethod(); applyMethodKit();
    try { Sfx.play('doorChime'); Sfx.music(true, 'shop'); Sfx.ambience('shop'); } catch (e) {}
    const m = $('#setup'); m.classList.add('show');
    renderSetup();
  }
  function costOf(p) {
    let c = gp('medium', p.medium).price + gp('air', p.air).price;
    if (inTent(p)) c += gp('tents', p.tent).price + gp('light', p.light).price;
    GEAR.meters.forEach(x => { if (p.meters[x.key]) c += x.price; });
    return c;
  }
  function cost() { return costOf(pick); }
  const askNote = () => { try { return !!gp('medium', pick.medium).askInStore; } catch (e) { return false; } };
  /* single swap that fits the budget; of those, the one that changes the kit least (highest remaining total) */
  function cheapestSwap() {
    if (cost() <= pick.budget) return null;
    const opts = [];
    const tryP = (label, mut) => { const p = { ...pick, meters: { ...pick.meters } }; mut(p); const c = costOf(p); if (c <= pick.budget) opts.push({ label, total: c }); };
    if (inTent(pick)) { GEAR.tents.forEach(x => { if (x.id !== pick.tent) tryP('the ' + x.name, p => p.tent = x.id); }); GEAR.light.forEach(x => { if (x.id !== pick.light) tryP('the ' + x.name, p => p.light = x.id); }); }
    GEAR.air.forEach(x => { if (x.id !== pick.air) tryP(x.id === 'none' ? 'no air pump' : 'the ' + x.name, p => p.air = x.id); });
    GEAR.meters.forEach(x => { if (pick.meters[x.key]) tryP('dropping the ' + x.name, p => p.meters[x.key] = false); });
    opts.sort((a, b) => b.total - a.total);
    return opts[0] || null;
  }
  function easiestCrop() {
    const pool = (BEST[seasonNow()] || []).map(cropOf), all = pool.length ? pool : CROPS;
    return all.reduce((a, c) => (c.difficulty < a.difficulty ? c : a), all[0]);
  }
  /* art/setup/<where>.webp is shown when the file exists; the inline icon is always there underneath, so a missing file costs nothing */
  const thumbOk = {};
  function thumbFor(kind, id) {
    const key = kind + '/' + id;
    if (kind !== 'where') return ''; /* spec: art/setup/<where>.webp only; the how tiles keep their inline icons */
    if (thumbOk[key] === undefined) { thumbOk[key] = null; try { const im = new Image(); im.onload = () => { thumbOk[key] = true; if (pick && $('#setup').classList.contains('show')) renderSetup(); }; im.onerror = () => { thumbOk[key] = false; }; im.src = 'art/setup/' + id + '.webp'; } catch (e) { thumbOk[key] = false; } }
    return thumbOk[key] === true ? `<img src="art/setup/${id}.webp" alt="">` : '';
  }
  const escH = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.escHtml = escH; /* [m6] away.js and any later module use this instead of a private copy */
  let adjustOpen = false;
  function renderSetup() {
    normPick(); normMethod();
    const M = METHODS(), tent = inTent(pick);
    const card = (grp, x, sel) => `<button class="gear ${sel ? 'sel' : ''}" data-grp="${grp}" data-id="${x.id}" aria-pressed="${!!sel}"><b>${x.name}</b><span>${x.askInStore ? 'Ask in store' : x.price ? '$' + x.price : 'Free'}</span>${x.best ? '<i>Axel’s pick</i>' : ''}${x.cat ? `<a href="${tag(x.cat)}" target="_blank" rel="noopener" class="mini" aria-label="${escH(x.name)} in the HyGrow store">in store</a>` : ''}</button>`;
    const total = cost(), left = pick.budget - total, ap = activePreset(), sw = left < 0 ? cheapestSwap() : null;
    const wk = Object.keys(M.where), hk = allowedHows(pick.where);
    const wTile = w => `<button type="button" class="tile ${pick.where === w ? 'sel' : ''}" data-where="${w}" aria-pressed="${pick.where === w}"><span class="ti">${thumbFor('where', w)}${WHERE_ICON[w] || ''}</span><b>${escH(M.where[w].label || w)}</b><span class="bl">${escH(M.where[w].blurb || WHERE_DO[w] || '')}</span></button>`;
    const hTile = h => `<button type="button" class="tile ${pick.how === h ? 'sel' : ''}" data-how="${h}" aria-pressed="${pick.how === h}"><span class="ti">${thumbFor('how', h)}${HOW_ICON[h] || ''}</span><b>${escH(M.how[h].label || h)}</b><span class="bl">${escH(howDo(h) || M.how[h].blurb || '')}</span></button>`;
    const season = seasonNow();
    let h = `<h3>Where are we growing?</h3><div class="tiles ${wk.length === 3 ? 'three' : ''}" id="whereRow">${wk.map(wTile).join('')}</div>
      <h3>How?</h3><div class="tiles" id="howRow">${hk.map(hTile).join('')}</div>
      <h3>What?</h3><div class="cropgrid">${CROPS.map(c => `<button type="button" class="gear crop ${pick.crop === c.id ? 'sel' : ''}" data-grp="crop" data-id="${c.id}" aria-pressed="${pick.crop === c.id}"><span class="cic">${Art.cropIcon(c.icon, 40, true).outerHTML /* v48 */}</span><b>${c.name}</b><span class="meta"><span class="diff" title="Difficulty ${c.difficulty} of 3" aria-label="Difficulty ${c.difficulty} of 3">${'★'.repeat(c.difficulty)}<s>${'★'.repeat(3 - c.difficulty)}</s></span> ${c.days}${inTent(pick) ? '' : '+'} days</span><span>${c.blurb}</span>${(BEST[season] || []).indexOf(c.id) >= 0 ? '<i>Best this season</i>' : ''}</button>`).join('')}</div>
      <details id="adjust"${adjustOpen ? ' open' : ''}><summary>Adjust gear</summary>
      <div class="row presets">${PRESETS.map(p => `<button type="button" class="gear preset ${ap && ap.id === p.id ? 'sel' : ''}" data-grp="preset" data-id="${p.id}" aria-pressed="${!!(ap && ap.id === p.id)}"><b>${p.name}</b><span>${p.blurb}</span></button>`).join('')}</div>
      ${tent ? `<h3>Tent</h3><div class="row">${GEAR.tents.map(x => card('tent', x, pick.tent === x.id)).join('')}</div><h3>Light</h3><div class="row">${GEAR.light.map(x => card('light', x, pick.light === x.id)).join('')}</div>` : ''}
      <h3>Grow medium</h3><p class="tentline">${escH(gp('medium', pick.medium).name)} — set by the “How” row above.</p>
      <h3>Air for the roots</h3><div class="row">${GEAR.air.map(x => card('air', x, pick.air === x.id)).join('')}</div>
      <h3>Meters <small>(no meter = you can't see that reading)</small></h3><div class="row">${GEAR.meters.map(x => card('meter', { ...x, id: x.key }, pick.meters[x.key])).join('')}</div>
      <h3>Budget</h3><div class="budgetbox"><div class="bigmoney">$${pick.budget}</div><input type="range" id="budgetRange" min="300" max="2500" step="50" value="${pick.budget}" aria-label="Budget in dollars"><div class="rangeends"><span>$300</span><span>$2500</span></div></div>
      <p class="tentline">Includes Professor's Nutrients A+B and pH Up/Down.</p></details>
      ${left < 0 ? `<p class="axelline" id="budgetWhy" role="status"><b>Axel:</b> Over budget by $${-left}. ${sw ? `Try ${sw.label} and you're back under budget at $${sw.total}.` : 'No single swap fixes this one. Raise the budget or change a few parts.'}</p>` : ''}`;
    $('#setupBody').innerHTML = h;
    $('#budget').innerHTML = `Kit <b class="${left < 0 ? 'neg' : ''}">$${total}</b> of $${pick.budget}` + (askNote() ? '<small class="askfoot"> plus items priced in store</small>' : '');
    $('#go').textContent = 'Start';
    $('#go').disabled = left < 0; if (left < 0) $('#go').setAttribute('aria-describedby', 'budgetWhy'); else $('#go').removeAttribute('aria-describedby');
    const ad = $('#adjust'); if (ad) ad.addEventListener('toggle', () => { adjustOpen = ad.open; });
    const br = $('#budgetRange');
    if (br) br.oninput = () => { pick.budget = +br.value; adjustOpen = true; renderSetup(); const r = $('#budgetRange'); if (r) r.focus(); };
    $('#setupBody').querySelectorAll('button.tile[data-where]').forEach(b => b.onclick = () => { Sfx.play('click'); pick.where = b.dataset.where; const was = pick.how; normMethod(); if (pick.how !== was) applyMethodKit(); renderSetup(); const t = document.querySelector('#whereRow .tile.sel'); if (t) t.focus({ preventScroll: true }); }); /* v36b: a re-render must not scroll the picker under the next tap */
    $('#setupBody').querySelectorAll('button.tile[data-how]').forEach(b => b.onclick = () => { Sfx.play('click'); pick.how = b.dataset.how; applyMethodKit(); renderSetup(); const t = document.querySelector('#howRow .tile.sel'); if (t) t.focus({ preventScroll: true }); if (innerWidth <= 520) { const c = document.querySelector('.gear.crop'); if (c) setTimeout(() => c.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); } }); /* v36b: a re-render must not scroll the picker under the next tap. v36d: on a phone the What row sat below the fold, so after How it is brought into view */
    $('#setupBody').querySelectorAll('button.gear').forEach(b => b.onclick = e => {
      if (e.target.classList.contains('mini')) return;
      Sfx.play('click');
      const g = b.dataset.grp, id = b.dataset.id;
      if (g === 'meter') pick.meters[id] = !pick.meters[id];
      else if (g === 'preset') applyPreset(PRESETS.find(p => p.id === id));
      else pick[g] = id;
      if (g !== 'crop') adjustOpen = true;
      renderSetup();
      const back = document.querySelector(`#setupBody button.gear[data-grp="${g}"][data-id="${id}"]`); if (back) try { back.focus({ preventScroll: true }); } catch (e2) {} /* v65 (play-test #17 keyboard M2): renderSetup rebuilds the buttons, so focus fell to the page body after a crop or gear pick; it stays on the button, now with aria-pressed */
    });
  }
  function setupNext() { Sfx.play('click'); if (!$('#go').disabled) startGame(); }
  function setupBack() { Sfx.play('click'); $('#setup').classList.remove('show'); stopLive(); showTitle(); }
  window.setupSummary = () => { normPick(); return { crop: pick.crop, tent: inTent(pick) ? gp('tents', pick.tent) : null, light: inTent(pick) ? gp('light', pick.light) : null, medium: gp('medium', pick.medium), air: gp('air', pick.air), meters: GEAR.meters.filter(x => pick.meters[x.key]) }; };
  let extraSetup = null; /* one-shot setup overrides (Weekly Challenge) */
  function startWith(p, ov, m) {
    Sfx.init(); camp = null; if (window.Campaign) Campaign.clear(); mode = m || 'free'; replay = null; seenTips = {}; flushSay(); S = null; stopLive();
    $('#title').classList.remove('show'); $('#harvest').classList.remove('show');
    pick = Object.assign({ budget: DEF_BUDGET, tent: 'tent120' }, p); extraSetup = ov || null; lastOv = ov ? Object.assign({}, ov) : null; /* [M29] */
    try { startGame(); } finally { extraSetup = null; }
  }
  function startGame() {
    Sfx.init(); Sfx.play('coin');
    /* v36: every start (setup, campaign, challenge, lesson replay) carries a method; older picks only name a medium */
    if (!pick.where) pick.where = 'tent';
    if (!pick.how) pick.how = (pick.medium === 'hydro' || pick.medium === 'soil' || pick.medium === 'tower') ? pick.medium : 'coco';
    normPick(); const T = gp('tents', pick.tent), L = GEAR.light.find(x => x.id === pick.light), M = GEAR.medium.find(x => x.id === pick.medium), A = GEAR.air.find(x => x.id === pick.air);
    const setup = Object.assign({}, Sim.defaultSetup ? Sim.defaultSetup() : {}, {
      tent: { area_m2: T.area_m2, volume_m3: T.volume_m3 }, light: { watts: L.watts, umolPerJ: L.umolPerJ }, fanM3h: 300,
      medium: M.medium, reservoirL: 40, airPump: A.airPump, meters: { ...pick.meters }, season: seasonNow(), nutrientLine: 'professors',
      where: pick.where, how: pick.how, drip: pick.how === 'coco', slots: 8, shade: pick.where !== 'tent' && seasonNow() === 'summer' /* v36 engine contract (engine.js Sim.METHODS). v67 (critic round 16 m1): only a summer grow starts with the shade cloth on; in winter it cost up to 87 % of the crop */
    });
    /* a gentler pH tap (half a step) for the guided lesson and a plain Free grow; the Weekly challenge (extraSetup) and the campaign keep the full-strength dose */
    if (!camp && (mode === 'beginner' || (mode === 'free' && !extraSetup))) setup.phDoseScale = 0.5;
    if (camp) Object.assign(setup, camp.setupOverrides);
    if (extraSetup) Object.assign(setup, extraSetup);
    if (againSeed != null) { setup.seed = againSeed; againSeed = null; } /* [M29] */
    S = Sim.create(pick.crop, setup); if (!S.method) S.method = { where: pick.where, how: pick.how }; S.__slot = 0; if (camp) { Campaign.attach(S); if (campLend) Campaign.applyLend(S, campLend); } S.__cartRef = S.refills || 0; S.__cost = camp ? 0 : cost(); try { S.__kit = takeHomeRows(camp ? kitFromSetup(S.setup, GEAR) : window.setupSummary()).rows; } catch (e) { S.__kit = null; } /* the kit as it was bought, so Take this home lists exactly what Spent is made of */ S.__refills = 0; S.__journal = []; histReset(); endShown = false; pickedLock = false; noMeterTold = false; fanHoldUntil = 0; sheetSt.prev = 0;
    if (window.Almanac) Almanac.seen('crop:' + S.cropId);
    if (window.Almanac) Almanac.seenGear(pick);
    if (window.Events) Events.onStart(S, pick, mode);
    try { if (window.Campaign && Campaign.setMethod && pick && pick.where && pick.how) Campaign.setMethod(pick.where, pick.how); } catch (e) { warnOnce('startGame#setMethod', e); } /* [M34]: the campaign follows the player's where x how from the last setup */
    $('#setup').classList.remove('show');
    window.__quietScrollUntil = performance.now() + 4000; try { scrollTo(0, 0); requestAnimationFrame(() => scrollTo(0, 0)); } catch (e) { warnOnce('startGame#1', e); } /* v41 [M10] the game never starts scrolled by the setup page */
    if (!camp && mode !== 'beginner') addSetupToCart();
    scene.setMedium(M.medium);
    Sfx.music(true, 'grow'); Sfx.ambience('tent'); try { Sfx.music(true, 'grow', { stage: Sim.stageInfo(S).index }); Sfx.ambienceParam('fan', (S.__fan ?? 2) / 3); Sfx.ambienceParam('mist', (S.setup && S.setup.humMode) === 'humidify' ? 1 : 0); Sfx.ambienceParam('season', S.setup && S.setup.season); } catch (e) { warnOnce('startGame#2', e); }
    flushSay(); seenTips = {}; S.__tipAfter = gameHrs() + 30;
    if (!camp && mode !== 'beginner') say(introOnce(`G'day! I'm Axel, the axolotl from the tank at HyGrow. Let's get your ${cropOf(pick.crop).name.toLowerCase()} growing!`, `Back again. Let's get your ${cropOf(pick.crop).name.toLowerCase()} growing!`, GROW_INTRO_KEY), { wave: true, hop: true });
    if (mode === 'live') { enterLive(); say('Live link is on. I\u2019m watching your real tent, so the air and light come from your room. The tank is still virtual, so keep the feed up.', { hop: true }); }
    if (camp) { camp.intro.map(t => S.setup && S.setup.meters && S.setup.meters.ph ? t.replace('No meters this time, just your eyes.', 'No meters this time, just your eyes and the pH pen you borrowed.') : t).forEach(t => say(t, { more: true })); /* v69 (play-test #20 m3): the line knows about a borrowed pen */ say('Goal: ' + camp.goalText, { hop: true }); }
    else if (mode === 'learn') {
      if (mixHelps()) say('First, the tank needs food. Tap Mix feed.', { target: '[data-act="mix"]', requireClick: true, link: CAT.nutrients, linkText: 'Nutrients at HyGrow', then: learnTour });
      else say('The tank starts with seedling feed already in it, so there is nothing to mix yet.', { link: CAT.nutrients, linkText: 'Nutrients at HyGrow', then: learnTour }); /* v58 (play-test #13 #2): a lettuce tank is already in the green on Day 1 */
    }
    if (replay && Sim.attachClimate) { try { Sim.attachClimate(S, replay.rows); say('Replaying your real readings on a virtual plant. Watch for the warnings, they\u2019re what your setup would do.'); } catch (e) { console.warn(e); } }
    buildDock(); stageForMethod(); dockLabels(); save(); paused = false; prevSev = null; gaugeReset(); render(true);
    setSpeed(1); guardSt = speedGuardNew(); /* every new grow starts running at 1x (a Free grow used to inherit the Menu's pause and sit frozen at Day 1) */
    if (mode === 'learn' || mode === 'live') { S.lightHours = mode === 'learn' ? stageHours() : S.lightHours; firstMix = true; setSpeed(1); const mixB = document.querySelector('[data-act="mix"]'); if (mixB && mixHelps()) mixB.classList.add('ready'); /* v58 (play-test #13 #2): only when a mix would add feed */ /* [M34]: a pot, bed or tower campaign grow has no Mix button */ dockLabels(); }
    if (mode === 'live') setSpeed(1);
    if (mode !== 'beginner') setTimeout(() => Mob.swipeHint(), 900);
    SoundChip.show();
    /* v36: the sim is already running; the method script (beginner.js) starts with ONE line and a glowing button, nothing else is said first */
    if (mode === 'beginner' && window.Beginner && Beginner.attach) { try { Beginner.attach(); } catch (e) { console.warn(e); } }
  }
  function addSetupToCart() {
    if (!window.Cart || !window.setupSummary) return;
    const s = window.setupSummary();
    Cart.items().filter(i => i.why === 'Your setup').forEach(i => Cart.remove(i.sku)); /* a replay replaces, not doubles, the previous kit */
    const add = g => { if (g && g.price > 0 && !g.noCart) Cart.add({ sku: g.sku || ('HG-' + g.id), name: g.name, price: g.price, qty: 1, why: 'Your setup' }); };
    add(s.tent); add(s.light); add(s.medium); add(s.air); (s.meters || []).forEach(add);
  }
  function trackRefill() {
    if (!S || !window.Cart) return;
    const r = S.refills || 0, prev = S.__cartRef == null ? r : S.__cartRef;
    // one bottle covers many top-ups: suggest a bottle on the first refill and a second after six, never a shelf of them
    const have = (Cart.items().find(i => /profAB1|9360135000308/.test(i.sku)) || {}).qty || 0;
    if (r > prev && have < (r >= 6 ? 2 : 1)) Cart.add(Object.assign(fromProduct('profAB1', { sku: 'HG-profAB1', name: "Professor's Nutrients A+B 1L", price: PROF_AB1_PRICE }), { qty: 1, why: 'Refill used' }));
    S.__cartRef = r;
  }
  /* --------- campaign --------- */
  const ART_PORTRAITS = (function () {
    const m = { axel: {}, deb: {}, rob: {}, regular: {} };
    ['idle', 'point', 'talk', 'thumbs', 'wave', 'worried'].forEach(p => m.axel[p] = 'axel/' + p + '_v2.webp');
    // laugh/shrug/sleepy/celebrate: v5 = Axel LoRA (axel_xl_v1) poses, see art/lora/RECIPE.md.
    ['laugh', 'shrug', 'sleepy', 'celebrate'].forEach(p => m.axel[p] = 'art/axel/axel_' + p + '_v5.webp');
    Object.assign(m.axel, { neutral: m.axel.idle, happy: m.axel.thumbs, surprised: m.axel.worried });
    ['neutral', 'happy', 'worried', 'laugh', 'surprised'].forEach(p => { m.deb[p] = 'art/portraits/deb_' + p + '.webp'; m.rob[p] = 'art/portraits/rob_' + p + '.webp'; m.regular[p] = 'art/portraits/kez_' + p + '.webp'; });
    return m;
  })();
  let campLend = null, sceneShown = false;
  function playScene(sc, cb) {
    if (!sc || !window.Story || !window.Campaign) { cb && cb({ choices: [], effects: { mates: 0, flags: [], lend: null } }, null); return; }
    const ctx = Campaign.storyCtx();
    Story.play(sc, { portraits: ART_PORTRAITS, flags: ctx.flags, mates: ctx.mates, id: 'ch' + (Campaign.active() == null ? '' : Campaign.active()) + ':' + sc.bg, names: { regular: 'Kez' }, onDone: res => {
      const lend = Campaign.applyEffects(res, 'scene'); cb && cb(res, lend);
    } });
  }
  function startChapter(id, sure) {
    Sfx.init(); Sfx.play('click');
    if (!sure) { const li = liveSaveInfo(); if (li) { askReplace(li, 'This chapter', () => startChapter(id, true)); return; } } /* v49 */
    Sfx.play('chapterStart');
    camp = Campaign.start(id); if (!camp) return;
    mode = 'learn'; replay = null; seenTips = {}; flushSay(); S = null; stopLive(); campLend = null;
    $('#campaign').classList.remove('show'); campBgOff(); $('#harvest').classList.remove('show');
    if (camp.storyOnly) {
      return playScene(camp.scenes.open, () => playScene(camp.scenes.close, () => { Campaign.completeStory(0); Campaign.clear(); camp = null; openCampaignMenu(); }));
    }
    playScene(camp.scenes && camp.scenes.open, (res, lend) => {
      campLend = lend;
      // the open scene may have set flags the chapter's crop depends on (ch7 "my best crop"): resolve again before the grow starts
      const re = Campaign.start(id); if (re && !re.storyOnly) camp = re;
      pick = Object.assign({ budget: DEF_BUDGET, tent: 'tent120' }, camp.gearPick);
      if (lend && lend !== 'aqua2500' && pick.meters) pick.meters = { ...pick.meters, [lend]: true };
      startGame();
    });
  }
  function campBgOff() { const b = $('#campBg'); if (window.Scene && b) Scene.unmount(b); if (b) b.hidden = true; const sv = $('#campScene'); if (sv) sv.style.display = ''; }
  function titleBgOff() { if (window.Scene) Scene.unmount($('#title-bg')); }
  function openCampaignMenu() {
    $('#title').classList.remove('show'); titleBgOff(); $('#harvest').classList.remove('show'); $('#campaign').classList.add('show');
    campLend = null;
    const cb = $('#campBg'), sv = $('#campScene');
    if (window.Scene) { cb.hidden = false; sv.style.display = 'none'; Scene.mount(cb, 'market', { aspect: false, alt: true }); } else Art.sceneShopfront(sv); /* the campaign menu shows the market B plate; chapter 6's story keeps the original, so the two differ */
    Campaign.renderMenu($('#campMenu'), startChapter);
    const m = Campaign.mates(), nx = Campaign.MATES_UNLOCKS.find(u => u.at > m);
    $('#campMates').innerHTML = `<div class="mates" title="Friendship with the HyGrow crew"><b>Mates ${m}/100</b><div style="height:10px;background:var(--panel2);border:2px solid var(--line);border-radius:8px"><i style="display:block;height:100%;width:${Math.min(100, m)}%;background:var(--green)"></i></div><small>${nx ? 'Next at ' + nx.at + ': ' + nx.what : 'Maxed out. Legend.'}</small> <small class="plain">Mates are friendship points with the HyGrow crew. Finish lessons and chapters to earn them.</small></div>`;
    const box = $('#campSide'), qs = Campaign.sideQuests(), p2 = Campaign.progress ? Campaign.progress() : null;
    const show = qs.some(q => q.unlocked) || qs.some(q => q.done);
    box.innerHTML = show ? '<h3>Side quests</h3>' + qs.map(q =>
      `<button class="cmp-ch ${q.done ? 'done' : q.unlocked ? 'cur' : 'locked'}" data-side="${q.id}" ${q.unlocked ? '' : 'disabled'}><span class="cmp-n">${q.done ? '✓' : q.unlocked ? '+' : '×'}</span><span><b>${q.title}</b><small>${q.blurb}${q.hint && !q.done ? ' ' + q.hint : ''}</small></span></button>`).join('') : '';
    box.querySelectorAll('[data-side]').forEach(b => b.onclick = () => startChapter(b.dataset.side));
    if (window.Gifts) Gifts.mountMenu($('#campExtras'));
  }
  if (window.Campaign && Campaign.onMatesUnlock) Campaign.onMatesUnlock(list => { try { Sfx.play('matesUp'); } catch (e) {} list.forEach(u => say('Mates ' + u.at + ': ' + u.what, { hop: true, keep: true })); });
  function campHooks() {
    return {
      say: (lines, o) => lines.forEach((t, i) => say(t, { more: i < lines.length - 1, hold: !!(o && o.pause), hop: i === 0 })),
      pause: () => {}, /* Axel's bubble already holds the clock while he talks; setSpeed(0) here left the game frozen (no bubble, speed II) once he finished */
      link: (cat, text) => say(text, { link: CAT[cat], linkText: text }),
      finish: res => showCampaignEnd(res),
      offer: (text, label, run) => say(text, { hop: true, keep: true, stay: true, action: { text: label, run: run } }) /* v70: Finish the chapter once its goal is met */
    };
  }
  function showCampaignEnd(res) { if (endShown) return; endShown = true; setSpeed(0); showHarvest(res); }

  /* short tour after the first Mix feed: one thing at a time, Next to continue */
  function learnTour() {
    const t = { target: null };
    say('EC is how strong the feed is. Green is happy, orange needs a look, red needs fixing now.', { target: '[data-reading="ec"]', keep: true, more: true });
    say('pH decides which nutrients the roots can grab. ' + (S && S.pot ? 'Feed' : 'Mix feed') + ' pulls it into range.', { target: '[data-reading="ph"]', keep: true, more: true, link: CAT.additives, linkText: 'pH Up and Down at HyGrow' });
    if (S && S.pot) say('This is how wet the pots are. Water before it drops into the orange.', { target: '[data-reading="moisture"]', keep: true, more: true }); /* v52 (play-test #10 soak): the learn tour on pots has no tank */
    else say('This is your tank. Plants drink it down, so top up before it runs dry.', { target: '[data-reading="reservoirL"]', keep: true, more: true });
    say('Speed buttons run time faster. I pause the clock whenever I\u2019m talking.', { target: '#speedbtns', keep: true, more: !(!pick.meters.ph || !pick.meters.ec) });
    if (!pick.meters.ph || !pick.meters.ec) say('Heads up: without a meter, some readings are a mystery. Problems will show on the leaves first.', { link: CAT.testing, linkText: 'Meters at HyGrow', keep: true });
  }
  function seasonNow() { const m = new Date().getMonth(); return [11, 0, 1].includes(m) ? 'summer' : [2, 3, 4].includes(m) ? 'autumn' : [5, 6, 7].includes(m) ? 'winter' : 'spring'; }

  /* --------- actions --------- */
  const ACTS = [
    { g: 'Feed', id: 'mix', label: 'Mix feed', icon: 'mix' }, { g: 'Feed', id: 'phDown', label: 'pH down', icon: 'ph' }, { g: 'Feed', id: 'phUp', label: 'pH up', icon: 'ph' },
    { g: 'Feed', id: 'topUp', label: 'Top up', icon: 'topup' }, { g: 'Feed', id: 'changeRes', label: 'Fresh tank', icon: 'change' }, { g: 'Feed', id: 'calibrate', label: 'pH cal', icon: 'ph' }, /* v36b: "Calibrate" wrapped at 44 px */
    /* v36 (Sim.actionsFor): hand watering, coco feeding, the drip line */
    { g: 'Feed', id: 'water', label: 'Water', icon: 'water' }, { g: 'Feed', id: 'feed', label: 'Feed', icon: 'feed' }, { g: 'Feed', id: 'drip', label: 'Drip', icon: 'drip' },
    { g: 'Climate', id: 'lights', label: 'Lights', icon: 'lights' }, { g: 'Climate', id: 'fan', label: 'Fan', icon: 'fan' }, { g: 'Climate', id: 'humidity', label: 'Mist', icon: 'humid' }, { g: 'Climate', id: 'shade', label: 'Shade', icon: 'shade' }, { g: 'Climate', id: 'cover', label: 'Cover', icon: 'cover' }, /* v36b: cold nights outside (Sim.actionsFor lists it) */
    { g: 'Plant', id: 'plant', label: 'Plant', icon: 'plant' }, { g: 'Plant', id: 'prune', label: 'Prune', icon: 'prune' }, { g: 'Plant', id: 'spray', label: 'Spray', icon: 'spray' }, { g: 'Plant', id: 'harvest', label: 'Pick', icon: 'harvest' },
    { g: 'Plant', id: 'ask', label: 'Ask Axel', icon: 'ask' }
  ];
  /* The 13 actions the game had before v36 (a sim with no Sim.actionsFor, or a save from before it, keeps exactly these) */
  const OLD_ACTS = ['mix', 'phDown', 'phUp', 'topUp', 'changeRes', 'calibrate', 'lights', 'fan', 'humidity', 'prune', 'spray', 'harvest', 'ask'];
  /* BARLAYOUT:start (pure, no DOM: tests/bar.test.js runs this block on its own)
     The phone action bar (v36): how many rows of 44 px buttons the bar uses. At 480 px and under it is two rows when there are more than 5 actions, one row otherwise; above 480 px it is always one row.
     cols counts the More button as one cell. */
  const BarLayout = {
    rows: (n, w, h) => (w <= 480 && n > 5 && !BarLayout.tight(w, h) ? 2 : 1), /* [B4] */
    /* v37 [B4] a narrow, short portrait phone (360x640): one row of 6 cells, More included; callers that pass no height keep the two-row rule */
    tight: (w, h) => !!h && w <= 400 && h <= 700 && w < h,
    cols(n, w, h) { return Math.max(1, Math.ceil((n + 1) / BarLayout.rows(n, w, h))); },
    /* how many cells (More included) keep every button at 44 px or wider: (width - 16 px padding + 4 px gap) / 48 px per column, times the rows. Above 480 px the bar is one row and nothing overflows. */
    /* v41 [M11] a short landscape phone (height 520 or less, width up to 899) is one row of at most 8 cells, More included */
    short: (w, h) => !!h && h <= 520 && w <= 899 && w > h,
    max(n, w, h) { return BarLayout.short(w, h) ? 8 : BarLayout.tight(w, h) ? 6 : w <= 480 ? Math.max(2, Math.floor((w - 12) / 48)) * BarLayout.rows(n, w) : Infinity; },
    RARE: ['calibrate', 'changeRes'],
    /* the action ids that stay on the bar and the rare ones that move into the More sheet so the bar never squeezes under 44 px (tent tower has 15) */
    split(ids, w, h) { const bar = ids.slice(), more = []; for (const r of BarLayout.RARE) { if (bar.length + 1 <= BarLayout.max(ids.length, w, h)) break; const i = bar.indexOf(r); if (i >= 0) { bar.splice(i, 1); more.push(r); } } while ((BarLayout.short(w, h) || BarLayout.tight(w, h)) && bar.length + 1 > BarLayout.max(ids.length, w, h)) { let j = bar.length - 1; while (j > 0 && (bar[j] === 'ask' || bar[j] === 'harvest')) j--; more.push(bar.splice(j, 1)[0]); } /* v37 [m1] Ask Axel stays one tap; v53 (play-test #11 #2): so does Pick / Harvest */ /* v41: landscape keeps the first jobs, the rest wait in More */ return { bar, more }; }
  };
  window.BarLayout = BarLayout;
  /* BARLAYOUT:end */
  /* v36b: icons art.js does not have. A cloth over a plant for Cover. */
  const ICON_OWN = { cover: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 21v-6M12 17q-4 0-4-4 4 0 4 4zM12 15q4 0 4-4-4 0-4 4z" fill="#6ec846" stroke="#2a1d14" stroke-width="1.3" stroke-linejoin="round"/><path d="M3 21l1.5-9Q12 2 19.5 12L21 21z" fill="#cfd5da" fill-opacity=".82" stroke="#2a1d14" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 21q1-5 4-5t4 5" fill="none" stroke="#2a1d14" stroke-width="1.3" stroke-linecap="round"/></svg>' };
  let dockSig = '';
  const actionIds = () => {
    try { if (S && Sim.actionsFor) { const a = Sim.actionsFor(S); if (Array.isArray(a) && a.length) { const known = a.filter(id => ACTS.some(x => x.id === id)); if (known.length) return known; } } } catch (e) {}
    return OLD_ACTS.slice();
  };
  /* The bar is built from Sim.actionsFor(S): every action this way of growing needs every minute is one tap (ordered as the engine lists them; groups only matter on a desktop, where the dock has headings). */
  function buildDock() {
    const ids = actionIds(), sig = ids.join(',');
    layoutBar(Math.min(ids.length, BarLayout.split(ids, window.innerWidth || 375, window.innerHeight).bar.length));
    if (sig === dockSig && $('#dock').children.length) return;
    dockSig = sig;
    const glowing = [...document.querySelectorAll('#dock button.bg-pulse, #dockOverflow button.bg-pulse')].map(b => b.dataset.act); /* v56 (play-test #12 major 1): a rebuild (resize: a phone's URL bar hiding fires one) must not drop the lesson's glow */
    const sp = BarLayout.split(ids, window.innerWidth || 375, window.innerHeight), btn = a => `<button data-act="${a.id}" title="${a.label}">${ICON_OWN[a.icon] || Art.icon(a.icon, 22)}<span>${a.label}</span></button>`;
    const list = sp.bar.map(id => ACTS.find(a => a.id === id)), groups = [...new Set(list.map(a => a.g))];
    $('#dock').innerHTML = groups.map(g => `<div class="grp"><h4 aria-level="2">${g}</h4><div class="btns">${list.filter(a => a.g === g).map(btn).join('')}</div></div>`).join('');
    /* rare actions that did not fit live in the More sheet (#dockOverflow inside #sheetExtras): two taps, never squeezed */
    let ov = $('#dockOverflow'); if (!ov && $('#sheetExtras')) { ov = document.createElement('div'); ov.id = 'dockOverflow'; ov.className = 'btns'; $('#sheetExtras').prepend(ov); }
    if (ov) ov.innerHTML = sp.more.map(id => ACTS.find(a => a.id === id)).filter(Boolean).map(btn).join('');
    document.querySelectorAll('#dock button, #dockOverflow button').forEach(b => { b.onclick = () => { Sfx.play('click'); doAct(b.dataset.act); }; b.onmouseenter = () => Sfx.play('hover'); if (glowing.indexOf(b.dataset.act) >= 0) b.classList.add('bg-pulse'); });
    dockLabels();
    try { Mob.syncBar(); } catch (e) { warnOnce('buildDock#1', e); }
  }
  function layoutBar(n) {
    const w = window.innerWidth || 375, ab = $('#actionbar');
    document.documentElement.style.setProperty('--cols', String(BarLayout.cols(n, w, window.innerHeight))); /* [B4] */
    if (ab) ab.dataset.rows = String(BarLayout.rows(n, w, window.innerHeight));
  }
  addEventListener('resize', () => { if (dockSig) { dockSig = ''; try { buildDock(); } catch (e) { warnOnce('layoutBar#1', e); } } });
  const FAN = ['Off', 'Low', 'Med', 'High'], HUM = ['off', 'humidify', 'dehumidify'], HUML = { off: 'Off', humidify: 'On', dehumidify: 'Dry' };
  function dockLabels() {
    if (!S) return;
    const f = document.querySelector('[data-act="fan"] span'); if (f) f.textContent = 'Fan: ' + FAN[S.__fan ?? 2];
    const h = document.querySelector('[data-act="humidity"] span'); if (h) h.textContent = 'Mist: ' + HUML[S.__hum || 'off'];
    const l = document.querySelector('[data-act="lights"] span'); if (l) l.textContent = 'Lights: ' + lightHrs() + 'h';
    /* v36b: Shade, Drip and Cover show their state in the label like Fan does */
    const tog = (act, label, on) => { const b = document.querySelector('[data-act="' + act + '"]'); if (!b) return; const sp = b.querySelector('span'); if (sp && sp.textContent !== label) sp.textContent = label; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('is-on', !!on); };
    tog('shade', 'Shade: ' + (S.shade ? 'On' : 'Off'), !!S.shade);
    tog('drip', 'Drip: ' + (S.drip ? 'On' : 'Off'), !!S.drip);
    if (S.method && S.method.where === 'veranda') tog('cover', S.cover ? 'Put out' : 'Bring in', !!S.cover); else tog('cover', 'Cover: ' + (S.cover ? 'On' : 'Off'), !!S.cover);
    if (S.out) { const sb = document.querySelector('#dock [data-act="spray"] span, #dockOverflow [data-act="spray"] span'); const pc = (window.innerWidth || 375) < 400 ? 'Pests' : 'Pest control'; if (sb && sb.textContent !== pc) sb.textContent = pc; } /* v67 (critic round 16 m7): Pest control clipped at 360 to 390 px on the coco dock */ /* v37: outside the button lays bait, picks caterpillars or sprays neem by the active problem (engine.js [M-OUT]) */
    const hb = document.querySelector('[data-act="harvest"]');
    if (hb) {
      const c = cropOf(S.cropId || pick.crop), hs = hb.querySelector('span');
      if (hs) hs.textContent = isTower() ? 'Pick slot ' + (selSlot() + 1) : c.id === 'lettuce' ? ((window.innerWidth || 375) < 400 ? 'Harvest' : 'Harvest head') /* v66 (critic round 15 m5): it clipped at 375 too */ : c.id === 'basil' ? 'Cut basil' : 'Pick'; /* v56 (play-test #12 #3): 'Harvest head' clipped on a 360 px bar */
      let ripe = 0; try { ripe = isTower() ? ((slotInfos()[selSlot()] || {}).ripeKg || 0) : (Sim.readings(S).plant || {}).ripeKg || 0; } catch (e) { warnOnce('dockLabels#1', e); }
      if (isTower() && hs) hs.textContent = 'Pick slot ' + (selSlot() + 1);
      const pl0 = Sim.readings(S).plant || {}, can = (ripe >= 0.02 || (!isTower() && Sim.readings(S).mature)) /* v67 (critic round 16 M2): at Crop complete Pick finishes the crop even with nothing left to pick */ && !(Sim.readings(S).cropDone) && !(!isTower() && pl0.harvestMode === 'cut' && !Sim.readings(S).mature && pl0.sinceCutDays != null && pl0.sinceCutDays < (Sim.CUT_REGROW_DAYS || 5)); /* v66 (play-test #18 m3): no second cut until it has regrown a little */
      hb.disabled = !can; hb.title = can ? hs.textContent : (c.leafy ? 'Nothing big enough to pick yet' : 'Nothing ripe yet');
      if (can && !S.__ripeTold && !isTower() && mode !== 'beginner' && !(camp && window.Campaign && Campaign.goalKg && ripe < Campaign.goalKg(S))) { /* v66 (play-test #18 m2): in a chapter with a pick goal, Ripe waits until a pick can pass it */ S.__ripeTold = true; try { say((ripe >= 0.02 ? 'Ripe! Tap ' : 'Crop complete. Tap ') + (hs ? hs.textContent : 'Pick') + (ripe >= 0.02 ? '.' : ' to finish it.'), { auto: true, hop: true, target: '[data-act="harvest"]' }); } catch (e) { warnOnce('dockLabels#ripe', e); } } /* v56 (play-test #12 #3): the button went live with no word from Axel */
    }
  }
  /* is the humidity unit already in the mode this fix wants? (the button cycles modes, so pointing at it would switch it off) */
  function humRunning(fixText) {
    const m = (S && S.setup && S.setup.humMode) || S && S.__hum || 'off';
    if (m === 'off') return false;
    if (/reads off|turn .* off/i.test(fixText || '')) return false; // the fix is to switch it off: the button IS the lever
    const wantsDry = /dehumid|dry/i.test(fixText || ''), wantsWet = /humidifier|humidify/i.test(fixText || '') && !wantsDry;
    return (m === 'dehumidify' && wantsDry) || (m === 'humidify' && wantsWet) || (!wantsDry && !wantsWet);
  }
  /* Ask Axel always answers: the line on screen (maybe one that says "tap Ask Axel") steps aside, the answer plays next, and a teaching line he was in the middle of comes back after it.
     A second tap while the answer is still on its way adds nothing (that is what looped the VPD cards). */
  function askAxel() {
    if (window.Daily) Daily.act('ask');
    if ((cur && cur.opts.ask) || sayQueue.some(m => m.opts.ask)) return;
    try { const ok = document.querySelector('#learnCard.in .lc-ok'); if (ok) ok.click(); } catch (e) {} /* an open "You just learned" card closes first */
    const seq0 = msgSeq, held = cur;
    if (cur) { clearTimeout(typeTimer); clearTimeout(autoTimer); try { Sfx.stopVoice(); } catch (e) {} hideSpot(); cur = null; }
    saying = true; /* hold the queue while the answer is lined up in front of it */
    try { askBody(); } finally {
      const mine = sayQueue.filter(m => m.id > seq0), rest = sayQueue.filter(m => m.id <= seq0);
      const o = held && held.opts, spent = !!o && !!(o.ask || (o.requireClick && o.target === '[data-act="ask"]') || sayDrop(held, null, 0));
      if (held && spent && typeof o.then === 'function') { try { o.then(); } catch (e) { console.warn(e); } }
      sayQueue = mine.concat(held && !spent ? [Object.assign(held, { typed: false })] : [], rest);
      saying = false; nextSay();
    }
  }
  function askBody() {
    /* the answer stays until Got it (stay: no auto-hide in Free grow); inside Grow with Axel it must pass the lesson filter (bg) and never point at a control that is not unlocked */
    const lesson = mode === 'beginner' && !!window.Beginner && !!Beginner.isActive && Beginner.isActive();
    const A = (text, o) => { o = Object.assign({ stay: true, keep: true, bg: lesson, ask: true, repeat: true }, o); if (lesson) { delete o.target; delete o.link; delete o.linkText; delete o.cartItem; delete o.hold; } say(text, o); };
    /* ONE bubble per tap (it used to be four or five: "Air temperature. Air temperature 21.9C is above..." and the rest). The why, and any other problem, wait for the next tap. */
    const nowT = performance.now();
    const gameH = S ? S.day * 24 + S.hour : 0; /* v60 (play-test #14 #2): a follow-up only reuses the first answer within the same game hour, so at 8x it never reads out numbers the tiles left behind */
    if (askMore.length && nowT - askMoreAt < 25000 && gameH === askMoreH) { askMoreAt = nowT; A(askMore.shift(), { hop: true }); return; }
    askMore = [];
    let list = [];
    const ln = liveNotes();
    try { list = Sim.diagnose ? Sim.diagnose(S) : []; } catch (e) { list = []; }
    /* v60 (play-test #14 #8): a problem on a tile the player can see comes before one on a reading this kit has no meter for (same order otherwise) */
    if (!lesson) { const hid = d => { const k = DIAG_TILE[d.id]; return !!k && !metered(k); }; list = list.filter(d => !hid(d)).concat(list.filter(hid)); }
    if (!lesson) { let st0 = {}; try { st0 = Sim.readings(S).status || {}; } catch (e) {} const red = d => { const k = DIAG_TILE[d.id]; return !!k && metered(k) && st0[k] === 'bad'; }; list = list.filter(red).concat(list.filter(d => !red(d))); } /* v63 (play-test #16 #4): a red tile on screen comes before a disorder card (blossom end rot was the answer 22 times while pH was red) */
    /* v65 (play-test #17 M1): Ask Axel starts with the worst tile on screen. Outside, a weather-only humidity line whose tile is green came first 13 times in 31 asks while Soil or Air was orange; it waits now, and an orange or red tile with no card of its own is answered as the tile itself would answer */
    let tFirst = null;
    if (!lesson) {
      let st1 = {}; try { st1 = Sim.readings(S).status || {}; } catch (e) {}
      const rank = d => { const k = DIAG_TILE[d.id]; const s = k && metered(k) ? st1[k] : null; return s === 'bad' ? 2 : s === 'warn' ? 1 : 0; };
      if (S && S.out) list = list.filter(d => !((d.id === 'rh' || d.id === 'vpd') && rank(d) === 0)); /* critic round 14 #2: outside, weather humidity is only raised while its tile is orange or red, as the tile says (no worries outside) */
      const tt = tileTrouble(), tr = tt ? (tt.sev === 'bad' ? 2 : 1) : 0;
      if (tt && (!list.length || (rank(list[0]) < tr && !(list[0].say && tr < 2)))) tFirst = tt;
      if (tt && !tFirst && list.length && list[0].severity === 0) tFirst = tt; /* v69 (play-test #20 m5): an entry with nothing to do (covered on a cold night, Air green) never answers over an orange tile */
    }
    const brief = d => { if (d.say) return oneBubble(d.say); /* v36b: outdoor entries carry the sentence in say; fix is an action id */ const f = String(d.fix || '').replace(/^fix:\s*/i, ''); return oneBubble(f ? `${d.title}. ${f.charAt(0).toUpperCase() + f.slice(1)}` : d.title + '.'); };
    if (ln.length) { A(oneBubble(ln[0].text), { link: ln[0].cat, linkText: ln[0].linkText, worried: true }); askMore = ln.slice(1).map(n => oneBubble(n.text)).concat(list.slice(0, 2).map(brief)); askMoreAt = nowT; askMoreH = gameH; return; }
    if (tFirst) { A(tFirst.text, { hop: true, worried: tFirst.sev === 'bad', target: tFirst.ctl ? `[data-act="${tFirst.ctl}"]` : null }); askMore = list.slice(0, 2).map(brief); askMoreAt = nowT; askMoreH = gameH; return; }
    if (!list.length) { const tt0 = tileTrouble(); if (tt0) { A(tt0.text, { hop: true, worried: tt0.sev === 'bad', target: tt0.ctl ? `[data-act="${tt0.ctl}"]` : null }); return; } /* v36b: a red or orange tile is never "all good" */ A('Everything looks good right now. Keep doing what you’re doing!', { hop: true }); return; }
    /* inside the lesson only talk about a tile that is on screen and a fix whose button is unlocked (no "Fix: lower the fan" before the Fan, no VPD before it has a tile) */
    if (lesson) {
      const seen = list.length;
      list = list.filter(d => { const n = LESSON_ASK[d.id]; if (d.say && d.fix && btnShown(String(d.fix))) return true; /* v66 (play-test #18 M1): outdoor entries (pots left inside, cold night, hot day) carry their button in fix */ if (d.id === 'pests') return btnShown('spray'); if (d.id === 'moisture') return btnShown('water') || btnShown('drip'); if (S && S.pot && (d.id === 'ec' || d.id === 'lowec')) return /feed/i.test(String(d.fix || '')) ? btnShown('feed') : /water/i.test(String(d.fix || '')) ? btnShown('water') : false; /* v67 (critic round 16 M1, play-test #19 m1): a pot's EC fix is Feed or Water, not Mix */ return !!n && tileShown(n[0]) && (!n[1].length || n[1].some(btnShown)); });
      { const tl = tileTrouble(), k0 = list.length ? (DIAG_TILE[list[0].id] || (list[0].id === 'lowec' ? 'ec' : null)) : null; if (tl && k0 && !metered(k0)) list = []; } /* v71 (critic round 18 m2): in the lesson an orange tile on screen comes before advice about a reading this kit has no meter for */
      if (!list.length) { const tt1 = tileTrouble(); if (tt1 && tt1.ctl && !btnShown(tt1.ctl)) { tt1.text = oneBubble((RLAB[tt1.k] || [tt1.k])[0] + ' is ' + (tt1.sev === 'bad' ? 'red' : 'orange') + '. Its button comes later in the lesson, so give it time.'); tt1.ctl = null; } /* v69 (play-test #20 m4): an orange or red tile always gets its own answer in the lesson (it said Nothing here you can fix yet over a cold Air tile); a button the lesson has not unlocked is not named */ if (tt1) { /* v67 (play-test #19 m2): a wet tile's answer is to skip a water, which has no button */ /* v66 (play-test #18 M1): an orange tile whose button is unlocked gets its answer in the lesson too */ A(tt1.text, { hop: true, worried: tt1.sev === 'bad', target: tt1.ctl ? `[data-act="${tt1.ctl}"]` : null }); return; } A(seen ? 'Nothing here you can fix yet. Carry on with the lesson and I will shout when it needs you.' : 'Everything looks good right now.', { hop: true }); return; }
    }
    const ASKT = { rh: 'humidity', vpd: 'humidity', temp: 'fan', wtemp: 'fan', ec: 'mix', ph: 'phDown' }, ASKK = { rh: 'rh', vpd: 'vpd', temp: 'airTemp', ec: 'ec', ph: 'ph', water: 'reservoirL' };
    const d = list[0];
    let a = ASKT[d.id], f = d.say ? '' : (d.fix || '');
    const fixId = d.say ? String(d.fix || '') : ''; /* v36b: the button to spotlight comes from fix when the entry has a say */
    if (a === 'humidity' && humRunning(f)) a = 'fan';
    if (d.id === 'ec' && /plain water|change/i.test(f)) a = 'topUp';
    if (d.id === 'ph' && /pH Up/i.test(f)) a = 'phUp';
    const mcx = window.methodCopy ? window.methodCopy(S) : { out: false };
    const hh = ASKK[d.id] && !(mcx.out && d.id === 'temp') ? hintFor(ASKK[d.id]) : null; if (hh) a = hh.ctl; /* never point at a control that is already where the reading wants it */
    if (d.say) a = fixId && btnShown(fixId) ? fixId : null;
    else if (mcx.out) { /* v36b: no fan or mist outside: the levers are Cover at night and Shade in the sun, and Water for a dry bed */
      if (d.id === 'temp') { const rdx = Sim.readings(S), tgx = (rdx.targets || {}).airTemp; a = Array.isArray(tgx) && rdx.airTemp < tgx[0] ? 'cover' : 'shade'; }
      else if (a === 'fan' || a === 'humidity') a = null;
      if (d.id === 'moisture') a = btnShown('water') ? 'water' : null;
    }
    if (d.id === 'moisture' && !mcx.out) a = /soaked/i.test(d.title) ? null : (btnShown('water') ? 'water' : null);
    if (S && S.pot && (d.id === 'ec' || d.id === 'lowec')) a = /feed/i.test(String(d.fix || '')) ? (btnShown('feed') ? 'feed' : null) : /water/i.test(String(d.fix || '')) ? (btnShown('water') ? 'water' : null) : a; /* v67: point at Feed or Water, not Mix */
    askMore = [String(d.why || '').trim()].concat(list.slice(1, 3).map(brief)).filter(Boolean); askMoreAt = nowT; askMoreH = gameH;
    const inMore = a && mode === 'free' && !document.querySelector(`#dock [data-act="${a}"]`) && document.querySelector(`#dockOverflow [data-act="${a}"]`); /* v63 (play-test #16 #1): Free grow has no glow, so on a phone the answer says where a tucked-away button is (a clause inside the 110-character bubble, so it stays one bubble) */
    const said = brief(d), sp = a && document.querySelector(`[data-act="${a}"] span`), nm = FIXNAME[a] || (sp ? sp.textContent.replace(/:.*$/, '').trim() : a), withMore = said.replace(/\.?$/, '') + '; ' + nm + ' is under More.'; A(!inMore ? said : withMore.length <= MAXCH ? withMore : `${d.title}. Tap More, then ${nm}.`, { worried: d.severity >= 2, hold: d.severity >= 2, target: a ? `[data-act="${a}"]` : null, link: d.productHint ? hintToLink(d.productHint) : null, linkText: d.productHint ? hintToLinkText(d.productHint) : null, cartItem: d.productHint ? hintToItem(d.productHint) : null });
  }
  /* v36b: Ask Axel never says "nothing to fix" while a tile is red. The worst tile on screen (red first), the button that fixes it and a line in this method's words. */
  function tileTrouble(k0) {
    try {
      const el = k0 ? null : (document.querySelector('#readings .rd.bad') || document.querySelector('#readings .rd.warn')); if (!el && !k0) return null;
      const rd = Sim.readings(S), k = k0 || el.dataset.reading, sev = k0 ? ((rd.status || {})[k0] === 'bad' ? 'bad' : 'warn') : (el.classList.contains('bad') ? 'bad' : 'warn'), /* v36c: a key may be passed (the tile that was tapped) */ mc = window.methodCopy ? window.methodCopy(S) : { out: false, root: 'Soil' };
      const nm = (RLAB[k] || [k])[0], col = sev === 'bad' ? 'red' : 'orange', has = a => !!document.querySelector('#dock [data-act="' + a + '"], #dockOverflow [data-act="' + a + '"]');
      const val = rd[k], tg = (rd.targets || {})[k], low = Array.isArray(tg) && typeof val === 'number' ? val < tg[0] : false, high = Array.isArray(tg) && typeof val === 'number' ? val > tg[1] : false;
      let text = null, ctl = null;
      if (k === 'moisture') { if (high) text = nm + ' is too wet. Skip the next water, the roots need air.'; else { ctl = has('water') ? 'water' : has('drip') ? 'drip' : null; text = nm + ' is dry.' + (ctl ? ' Tap ' + FIXNAME[ctl] + '.' : ''); } }
      else if (k === 'airTemp' && mc.out) {
        if (low) { if (rd.lightsOn && !(sev === 'bad' && has('cover') && !S.cover)) text = 'Air is cold, but the sun will warm it up.'; /* v65 (critic round 14 #2): a red morning outside gets Cover, as the tile's Why says */ else if (has('cover')) { ctl = 'cover'; text = S.cover ? 'Air is cold, but you are covered. Hold tight until the sun is up.' : 'Cold night. Tap ' + mc.cover + '.'; } else text = 'Air is cold. Give it time.'; }
        else { if (has('shade') && !S.shade) { ctl = 'shade'; text = 'Air is hot. Tap Shade.'; } else text = 'Air is hot. ' + (S.shade ? 'Shade is on, so keep the water up.' : 'Give it time.'); }
      }
      else if (k === 'rain' || k === 'wind') text = nm + ' is ' + col + '. That is the weather, so give it time.';
      else if (k === 'airTemp' || k === 'rh' || k === 'vpd') { const h = hintFor(k, rd); if (h && h.ctl && has(h.ctl)) { ctl = h.ctl; text = endDot(h.text); } else text = h && h.text ? h.text : nm + ' is ' + col + '. Give it a little time.'; }
      else if (k === 'ec' && S.pot) { ctl = high ? (has('water') ? 'water' : null) : low ? (has('feed') ? 'feed' : null) : null; text = nm + ' is ' + col + '.' + (ctl ? ' Tap ' + FIXNAME[ctl] + (high ? ' to wash the salt out.' : '.') : ' Give it a little time.'); } /* v71 (critic round 18 m1): a pot has no tank buttons, so high EC is Water and low EC is Feed (it said Give it a little time) */
      else { ctl = fixFor(k, rd); if (!has(ctl)) ctl = null; text = nm + ' is ' + col + '.' + (ctl ? ' Tap ' + (FIXNAME[ctl] || ctl) + '.' : k === 'ph' ? ' There is no pH button for this grow, so keep Water and Feed steady and the other tiles green.' : ' Give it a little time.'); } /* v72 (play-test #22 m3): a pH tile with no button was told to wait for 60 days */
      return { k, sev, text: oneBubble(text), ctl };
    } catch (e) { return null; }
  }
  /* v36c: "Why is this red?" One answer per red or orange tile: Sim.whyRed(S, key) -> { title, line, fix } when the engine has it, else the v36b tile line (tileTrouble). Cheap and DOM-free, so render() can call it. */
  function whyFor(k) {
    try {
      if (!S) return null;
      if (Sim.whyRed) { const w = Sim.whyRed(S, k); if (w && (w.line || w.title)) return { title: w.title || '', line: String(w.line || w.title), fix: w.fix || null, engine: true }; }
      const tt = tileTrouble(k); return tt ? { title: '', line: tt.text, fix: tt.ctl || null, engine: false } : null;
    } catch (e) { return null; }
  }
  function sayWhy(k) {
    const w = whyFor(k); if (!w) return;
    const fx = w.fix && btnShown(w.fix) ? w.fix : null, back = () => { try { const x = S && Sim.readings(S).status; return !x || (x[k] !== 'warn' && x[k] !== 'bad'); } catch (e) { return false; } };
    say(oneBubble(w.line), { bg: true, front: true, keep: true, why: k, shownAt: performance.now(), target: fx ? `[data-act="${fx}"]` : `[data-reading="${k}"]`, stale: back });
  }
  let askMore = [], askMoreAt = -1e9, askMoreH = -1;
  /* a single bubble holds MAXCH characters: cut a longer line at its last comma or "or" that fits */
  function oneBubble(t) {
    t = String(t || '');
    if (t.length <= MAXCH) return t;
    let k = Math.max(t.lastIndexOf(', ', MAXCH - 2), t.lastIndexOf(' or ', MAXCH - 4));
    if (k < 40) k = t.lastIndexOf(' ', MAXCH - 2);
    return t.slice(0, k).replace(/[,;:]$/, '') + '.';
  }
  /* --------- the plant and Axel answer a tap --------- */
  const STAGE_WORD = { propagation: 'seedling', vegetative: 'growing', flowering: 'flowering', fruiting: 'fruiting', heading: 'heading up', harvest: 'nearly ready', cutting: 'cutting' };
  const TAP_AXEL = ['Hi there! Tap the plant any time and I will tell you how it is going.', 'Water is my whole world. Check the root zone for me?'];
  const STATUS_KEYS = ['ec', 'ph', 'airTemp', 'rh', 'vpd', 'reservoirL', 'waterTemp'];
  /* Ask Axel inside the lesson: diagnosis id -> [its tile, the buttons that fix it] */
  const DIAG_TILE = { ec: 'ec', ph: 'ph', rh: 'rh', vpd: 'vpd', temp: 'airTemp', warmNight: 'airTemp', wtemp: 'waterTemp', light: 'dli', water: 'reservoirL' }; /* v60: diagnosis id -> the tile that shows it */
  const LESSON_ASK = { rh: ['rh', ['fan', 'humidity']], vpd: ['vpd', ['fan', 'humidity']], temp: ['airTemp', ['fan']], ec: ['ec', ['mix', 'topUp', 'changeRes']], ph: ['ph', ['phDown', 'phUp']], water: ['reservoirL', ['topUp']] };
  let plantTapAt = -1e9, axelTapAt = -1e9, axelTapN = 0; /* -1e9: performance.now() starts near 0, so 0 would read as "just tapped" in the first seconds */
  const tileShown = k => { const n = document.querySelector('#readings .rd[data-reading="' + k + '"]'); return !!(n && n.getClientRects().length); };
  const metered = k => { try { return tileShown(k) && Sim.readings(S)[k] != null; } catch (e) { return tileShown(k); } }; /* v61 (critic round 11 #1): a reading with no meter still has a "???" tile, so the tile alone does not say the player can read it */
  const btnShown = a => { const b = document.querySelector('#dock [data-act="' + a + '"], #dockOverflow [data-act="' + a + '"]'); return !!b && !b.classList.contains('bg-hidden') && !b.disabled; };
  function hintFor(k, rd) {
    if (!S) return null;
    try {
      rd = rd || Sim.readings(S);
      const r = rd[k], v = r && typeof r === 'object' ? r.value : r, t = (rd.targets || {})[k] || (r && r.target);
      const high = Array.isArray(t) && v != null ? v > t[1] : true;
      return climateHint(k, high, { fan: S.__fan ?? 2, hum: (S.setup && S.setup.humMode) || S.__hum || 'off', hours: lightHrs(), cycle: lightCycle(), stage: stageHours(), room: (S.cap || 0) - (S.resL || 0), fanDry: Sim.fanHelpsDry ? Sim.fanHelpsDry(S) : true, cool: Sim.coolLit ? Sim.coolLit(S) : false, seedling: (S.stage || 0) < 1 });
    } catch (e) { return null; }
  }
  /* one status line from existing data: stage, health and the next useful action (the worst visible reading, and the button that fixes it) */
  function plantStatus() {
    const rd = Sim.readings(S), info = Sim.stageInfo(S), cd = cropOf(S.cropId || pick.crop), st = rd.status || {};
    const health = Math.round(rd.health && typeof rd.health === 'object' ? rd.health.value : (rd.health ?? 100));
    const vis = STATUS_KEYS.filter(tileShown), k = vis.find(x => st[x] === 'bad') || vis.find(x => st[x] === 'warn');
    const hb = document.querySelector('[data-act="harvest"]');
    let next = 'All green, so just keep watching.';
    if (hb && hb.classList.contains('ready') && btnShown('harvest')) next = `Ripe! Tap ${hb.querySelector('span').textContent}.`;
    else if (rd.status && (rd.status.moisture === 'warn' || rd.status.moisture === 'bad') && Array.isArray((rd.targets || {}).moisture) && rd.moisture > rd.targets.moisture[1]) next = (rd.method && rd.method.how === 'coco' ? 'Coco' : 'Soil') + ' is too wet: skip the next water, the roots need air.' + (health < 100 ? ' That is pulling health down.' : ''); /* v37 v45: the Health drop has a reason, in the same words as the Why orange line */
    else if (k) { /* the direction and the target, never a control that is already where the reading wants it ("Fan down to Low (the air is cold)") */
      const nm = RLAB[k][0].toLowerCase(), h = k === 'waterTemp' ? null : hintFor(k, rd);
      next = k === 'waterTemp' ? 'The water temperature needs a look.' : h && h.ctl === null ? h.text : h && h.ctl && btnShown(h.ctl) ? `Next job: ${h.verb} (${h.why}).` : `The ${nm} needs a look.`;
    }
    return `Your ${cd.name.toLowerCase()} is in the ${STAGE_WORD[info.name] || 'growing'} stage, health ${health}%. ${next}`;
  }
  function tapPlant(e) {
    if (!S || endShown || document.querySelector('.modal.show')) return;
    if (e && e.target && e.target.closest && e.target.closest('#slotStrip')) return; /* v58: the phone slot strip lives in the scene; its own handler picks the slot */
    const sl = e && e.target && e.target.closest && e.target.closest('.slot'); if (sl && isTower()) { pickSlot(+sl.getAttribute('data-slot')); return; } /* a tower slot: select it, Pick acts on it */
    const now = performance.now(); if (now - plantTapAt < 3000 || sayQueue.length > 2) return; plantTapAt = now;
    try { quinn.hop(); } catch (e) {}
    say(plantStatus(), { bg: true, auto: true, hop: true, dwell: 3500, repeat: true, lateStale: () => true, lateMs: 10000 }); /* queued behind other bubbles for 10 s: it describes a plant that has moved on, drop it */
  }
  function tapAxel(e) {
    if (!S || !quinn || e.target.closest('#bubble,#pausedtag,#pins,#slotStrip')) return;
    try { if (axelTapN % 2) quinn.hop(); else quinn.wave(1600); } catch (er) {}
    const now = performance.now(); if (now - axelTapAt < 20000) return; axelTapAt = now;
    if (now - plantTapAt < 20000) return; /* the plant just answered: "Hi there! Tap the plant" would be a stale second line */
    let ti = axelTapN++ % TAP_AXEL.length; if (ti === 0 && plantTapAt > 0) ti = 1; /* once the plant has been tapped, Axel never tells them to */
    say(TAP_AXEL[ti], { bg: true, auto: true, dwell: 3000, stale: () => plantTapAt > now || !!probCard || gameHrs() < probQuietUntil, lateStale: () => true, lateMs: 8000 }); /* never the cheery tap line after a problem card, or after it waited in the queue */
  }
  /* A tap on a reading tile answers within a frame (Marg tapped a glowing tile three times, 1.5 s apart, before Axel explained it): the tile flashes at once, and the explanation that is
     mid-type snaps to full; in the lesson, if Axel is silent and the tile is the one he points at, he says what it is. */
  const TILE_SAY = { airTemp: 'These two tiles tell you about the air: temperature and humidity.', rh: 'These two tiles tell you about the air: temperature and humidity.', ec: 'Feed strength (EC) is how much food is in the water. The meter reads it.', ph: 'pH decides which food the roots can grab. Green means go.', reservoirL: 'This tank holds the water your basil drinks.' };
  function ackTile(tile) {
    const k = tile.dataset && tile.dataset.reading;
    try { if (window.Fx && Fx.flash) Fx.flash(tile, 'good'); } catch (e) {}
    if (cur && !cur.typed && cur.finishNow) { cur.finishNow(); return; }
    if (mode !== 'beginner' || cur || sayQueue.length || !glowingTile(tile) || !TILE_SAY[k]) return;
    say(TILE_SAY[k], { bg: true, auto: true, dwell: 3500, front: true });
  }
  /* Axel reacts to fixes: remember which actions fix which problem (from the problem event), watch the problems that were
     active when a matching action was taken, and give a thumbs-up when render() sees one of them gone (20 s real-time window) */
  const probFix = {}; let fixWatch = null;
  function watchFix(id) {
    const ids = Object.keys((S && S.pr) || {}).filter(k => (probFix[k] || []).indexOf(id) >= 0);
    fixWatch = ids.length ? { ids, until: performance.now() + 20000 } : null;
  }
  function checkFix(pr) {
    if (!fixWatch) return;
    if (performance.now() > fixWatch.until) { fixWatch = null; return; }
    if (fixWatch.ids.some(k => !pr[k])) { fixWatch = null; try { quinn.react('thumbs', 2000); } catch (e) {} }
  }
  function dismissForAct(id) {
    const hit = m => { const a = m && m.opts && m.opts.dismissAct; return !!a && [].concat(a).indexOf(id) >= 0; };
    if (hit(cur)) advance(true);
    sayQueue = sayQueue.filter(m => !(hit(m) && m.opts.auto)); /* queued "Tap X" nudges for the control just tapped */
  }
  /* v36: what an action did, for the animation agent (hygrow:act). true = a reading it targets was off its band and this is the fix (or it fixed an open problem),
     false = the wrong way round (pH up on a high pH), null = nothing to say. Sim.act changes nothing until the next tick, so this reads the tiles as they were when the player tapped. */
  const ACT_TILES = { mix: ['ec'], feed: ['ec'], phDown: ['ph'], phUp: ['ph'], topUp: ['reservoirL', 'ec'], changeRes: ['ec', 'ph'], fan: ['airTemp', 'rh', 'vpd'], humidity: ['rh', 'vpd'], lights: ['airTemp'], water: ['moisture'], drip: ['moisture'], shade: ['airTemp', 'shade'], cover: ['airTemp'] };
  const WRONG_WAY = { phDown: ['phUp'], phUp: ['phDown'], mix: ['topUp', 'changeRes'], feed: ['topUp', 'changeRes'], topUp: ['mix', 'feed'] };
  function actVerdict(id, rd) {
    try {
      if (fixWatch && fixWatch.ids && fixWatch.ids.length) return true;
      const st = (rd && rd.status) || {}; let v = null;
      (ACT_TILES[id] || []).forEach(k => {
        if (v === true || (st[k] !== 'warn' && st[k] !== 'bad')) return;
        const h = (k === 'airTemp' || k === 'rh' || k === 'vpd') ? hintFor(k, rd) : null, want = h ? h.ctl : fixFor(k, rd);
        if (want === id) v = true; else if (want && (WRONG_WAY[id] || []).indexOf(want) >= 0) v = false;
      });
      return v;
    } catch (e) { return null; }
  }
  /* the "You just learned" card appears the first time each control is used (cards.js), not up front */
  const CARD_OF = { mix: 'feed', feed: 'feed', phDown: 'ph', phUp: 'ph', lights: 'light', topUp: 'water', water: 'water', fan: 'air', prune: 'prune', harvest: 'harvest', drip: 'drip', shade: 'shade', plant: 'slots' };
  function learnedFirstUse(id) {
    const c = CARD_OF[id]; if (!c || (mode !== 'beginner' && mode !== 'learn') || endShown) return;
    try { if (window.Cards && Cards.has && Cards.has(c)) return; document.dispatchEvent(new CustomEvent('hygrow:learned', { detail: { id: c } })); } catch (e) {}
  }
  function doAct(id) {
    if (!S) return;
    dismissForAct(id);
    if (window.Daily && !(mode === 'beginner' && window.Beginner && Beginner.isReplay && Beginner.isReplay())) Daily.act(id); /* a replayed lesson does not tick the daily round again */
    watchFix(id);
    if (id === 'phDown' || id === 'phUp') S.__phFixed = true;
    Sfx.init(); userActAt = performance.now();
    const info = Sim.stageInfo(S), rd = Sim.readings(S);
    let params = {};
    const tgt = info.targets || {};
    const mid = a => Array.isArray(a) ? (a[0] + a[1]) / 2 : a;
    if (id === 'mix') { const mb = document.querySelector('[data-act="mix"]'), first = firstMix; if (mb.classList.contains('ready')) { mb.classList.remove('ready'); firstMix = false; quinn.hop(); } params = { mlPerL: mid(tgt.mlPerL) || 3, stepOver: mode === 'beginner' || first ? 0 : MIX_STEP }; /* a jump of more than 0.6 EC is made in two taps (engine.js 'mix'); the lesson's single tap and the very first fill of a guided grow stay one tap */ Sfx.play('pour'); scene.burst('drop', 90, 360); }
    if (id === 'phDown') { params = { ml: 4 }; Sfx.play('drip'); }
    if (id === 'phUp') { params = { ml: 4 }; Sfx.play('drip'); } /* engine.js halves the dose when the setup carries phDoseScale (startGame) */
    if (id === 'topUp') { params = { litres: 10, withNutrients: !(rd.targets && Array.isArray(rd.targets.ec) && typeof rd.ec === 'number' && rd.ec > rd.targets.ec[1]) /* EC above target: plain water, so Top up really dilutes it */ }; Sfx.play('pour'); scene.burst('drop', 90, 360); if (S.resL < S.cap - 0.5) S.__refills++; /* a top-up on a full tank is not a refill */ }
    if (id === 'changeRes') { Sfx.play('pour'); Sfx.play('bubble'); scene.burst('drop', 90, 360); }
    if (id === 'lights') { const cyc = lightCycle(), cur = lightHrs(); const next = cyc[(cyc.indexOf(cur) + 1) % cyc.length] ?? 18; params = { hours: next }; Sfx.play(next <= cur ? 'lightsOff' : 'lightsOn'); const tg = stageHours(); say(`Lights set to ${next} hours on. ${next === tg ? 'That suits this stage.' : next <= 12 ? 'Short days tell many plants it’s time to flower.' : next > cur ? 'Longer days give more light and a little more warmth.' : 'Shorter days give less light and a little less heat.'}` /* v61 (play-test #15 #4): the line follows the way the hours moved (16 to 14 used to praise long days) */, { link: CAT.lighting, linkText: 'Lights and timers at HyGrow', stale: ((t0) => () => performance.now() - t0 > 600 && lightHrs() !== next)(performance.now()) }); } /* v63 (critic round 12 #2): the check ran before Sim.act set the hours, so with nothing queued the line was always dropped; it now only goes stale once the hours have had time to land and moved on */
    if (id === 'feed') { params = S.out ? {} : { mlPerL: mid(tgt.mlPerL) || 3, stepOver: mode === 'beginner' ? 0 : MIX_STEP }; /* v36c: outside the Feed button sends no strength, so the engine's weekly dose tops the pot up to the band and stops (engine.js [M16]) instead of piling up */ Sfx.play('pour'); scene.burst('drop', 230, 330); }
    if (id === 'water') { Sfx.play('pour'); scene.burst('drop', 230, 330); }
    if (id === 'drip' || id === 'shade' || id === 'cover') Sfx.play('click');
    if (id === 'plant') { Sfx.play('pop'); scene.burst('leaf', 230, 330); }
    if (id === 'prune') { Sfx.play('snip'); scene.burst('leaf', 260, 260); }
    if (id === 'spray') { params = { product: 'plantGuard' }; Sfx.play('spray'); }
    if (id === 'calibrate') { Sfx.play('click'); say('Meters calibrated with pH 4/7 buffer and EC 2.76 solution. Do it every couple of weeks.', { link: CAT.testing, linkText: 'Calibration solutions' }); }
    let flown = 0;
    let fhCand = false;
    if (id === 'harvest') { try { fhCand = !!(window.Fx && Fx.firstHarvestDone && !Fx.firstHarvestDone() && (((rd.plant && rd.plant.ripeKg) || 0) >= 0.02 || rd.mature)); } catch (e) { warnOnce('doAct#1', e); } Sfx.play(fhCand ? 'firstHarvest' : 'harvest', { crop: pick.crop }); try { const rp = Sim.readings(S).plant || {}; if ((rp.ripeKg || 0) >= 0.02) flown = Math.max(2, Math.min(8, Math.round((rp.ripeKg * 1000) / ((window.CROP_DATA && CROP_DATA[pick.crop] && CROP_DATA[pick.crop].fruitG) || 25)))); } catch (e) { warnOnce('doAct#2', e); } }
    if (id === 'ask') { Sfx.play('axel', { syllables: 2 }); askAxel(); return; }
    if (id === 'fan') { S.__fan = camp ? ((S.__fan ?? 2) % 3) + 1 : ((S.__fan ?? 2) + 1) % 4; /* campaign: High wraps to Low, never Off (Axel points at Fan in a heatwave; High->Off cooked the tent) */ params = { level: S.__fan }; Sfx.play(S.__fan ? 'fanOn' : 'fanOff'); try { Sfx.ambienceParam('fan', S.__fan / 3); } catch (e) { warnOnce('doAct#3', e); } scene.setFan(S.__fan / 2); }
    if (id === 'humidity') { const i = (HUM.indexOf(S.__hum || 'off') + 1) % 3; S.__hum = HUM[i]; params = { mode: S.__hum }; Sfx.play(S.__hum !== 'off' ? 'humidifierOn' : 'uiClose'); }
    if (id === 'harvest' && isTower()) params = { slot: selSlot() }; /* a tower is picked one slot at a time */
    const verdict = actVerdict(id, rd);
    let res;
    try { res = Sim.act(S, id, params) || {}; } catch (e) { console.warn(e); res = {}; }
    if (res.state) S = res.state;
    if (id === 'harvest' && isTower()) { try { const inf = slotInfos(), cur = selSlot(); if (!((inf[cur] || {}).ripeKg >= 0.02)) { const nx = inf.findIndex((x, i) => i !== cur && (x.ripeKg || 0) >= 0.02); if (nx >= 0) { S.__slot = nx; markSlot(); } } } catch (e) { warnOnce('doAct#slot', e); } } /* v69 (story round 17 minor 3): after a slot is picked the button moves to the next ripe slot (it stayed greyed on the empty one) */
    try { document.dispatchEvent(new CustomEvent('hygrow:act', { detail: { id, good: verdict } })); } catch (e) { warnOnce('doAct#4', e); } /* v36: the animation agent listens */
    if (!(res.events || []).some(e => e && e.type === 'info' && e.id === 'act_' + id && /^(Already wet|Too young|Tower full|Pruned recently)/.test(String(e.title || '')))) learnedFirstUse(id); /* v36d: a refused tap teaches nothing */
    if (res.cost) S.__cost += res.cost;
    if (id === 'fan') { if ((S.__fan ?? 2) === 0) { fanHoldUntil = gameHrs() + 2; if (speed > 1) { setSpeed(1); holdDropped = true; } } else fanHoldUntil = 0; }
    if (id === 'humidity') { try { Sfx.ambienceParam('mist', ((S.setup && S.setup.humMode) || S.__hum) === 'humidify' ? 1 : 0); } catch (e) { warnOnce('doAct#5', e); } } /* after Sim.act so it reads the applied humMode */
    handleEvents(res.events);
    if (id === 'harvest') { try { quinn.react('wave', 3000); } catch (e) { warnOnce('doAct#6', e); } }
    /* the first harvest ever (any mode): card, confetti, Axel's hop and line. If the harvest modal follows, the banner and the line wait for it */
    if (id === 'harvest') harvestTaps++;
    if (id === 'harvest' && window.Fx && Fx.firstHarvest) { try { const rp1 = Sim.readings(S), modalNext = !!(rp1.cropDone || rp1.mature); const fh1 = Fx.firstHarvest({ kg: ((rp1.plant && rp1.plant.harvestedKg) || 0) - ((rd.plant && rd.plant.harvestedKg) || 0), crop: cropOf(pick.crop).name, cropId: pick.crop, quinn, say: false, modal: modalNext });
      /* v58 (play-test #13 #4): the line went to the back of the queue behind "Harvested ...", so a tower grower who picked a second slot within a few
         seconds heard "Your first harvest!" after the second pick. It is now next in line, and dropped if another pick happens before it shows */
      if (fh1 && !modalNext) { const n0 = harvestTaps; say(Fx.FIRST_HARVEST_LINE, { auto: true, bg: true, front: true, stale: () => harvestTaps !== n0 }); } } catch (e) { warnOnce('doAct#7', e); } }
    trackRefill();
    if (id === 'harvest' && flown) { pickedLock = true; flyFruit(flown); }
    if (id === 'harvest') { const r2_ = Sim.readings(S); if ((r2_.cropDone && !r2_.lost) || r2_.mature) { setSpeed(0); endShown = true; setTimeout(showHarvest, flown && !reduceMotion() ? 1500 : 200); return; } }
    if (id === 'harvest') { scene.burst('sparkle', 260, 300); if (!flown) Sfx.play('pop'); }
    actInfoToast(id, res.events);
    actToast(id);
    dockLabels(); render(true); save(); /* an action is worth keeping even if the tab dies before the next game day */
  }
  /* every Fan / Lights / Mist tap says what it did and which way the next tap goes */
  /* what a Mix feed / pH / Top up tap did, as a number when the meter is fitted ("Feed mixed: EC 1.2") and a plain word when it is not */
  const readNum = k => { try { const r = Sim.readings(S)[k]; return typeof r === 'number' && isFinite(r) ? r : null; } catch (e) { return null; } };
  /* v36b: every bar action says what it did, with the number or the state. The engine's info event (act_<id>) carries it ("Watered: soil 100 %", "Fed: EC 1.2 at pH 6.0", "Drip on: feeds every 4 h in the light",
     "Covered for the night"); when a member is missing the text is built here from the sim's state. Fan, Lights, Mist, Mix and pH keep actToast below. */
  const TOAST_ACTS = ['water', 'feed', 'shade', 'drip', 'spray', 'prune', 'plant', 'cover'];
  const GOOD_INFO = /^(Watered|Already wet|Fed\b|Drip (on|off)|Shade (on|off)|Shade cloth (on|off)|Covered|Uncovered|Pots |Planted|Pruned$|Plant Guard sprayed|Herbal spray used|Neem oil sprayed|Soap spray|Slug bait laid|Milk spray|Snail bait laid|Caterpillars picked off)/;
  function actInfoText(id, evs) {
    const ev = (evs || []).find(e => e && e.type === 'info' && e.id === 'act_' + id), t = ev ? String(ev.title || '') : '', tx = ev ? String(ev.text || '') : '';
    if (ev && !GOOD_INFO.test(t)) return t ? joinT(t, tx.length > 90 ? tx.split(/(?<=[.!?])\s/)[0] : tx) : null; /* a refusal ("Too young", "Pruned recently", "Tower full") keeps its short reason */
    if (id === 'spray') return /^Soap/.test(t) ? 'Sprayed: soap, repeat in 3 days' : /^Milk/.test(t) ? 'Sprayed: milk, repeat in a week' : /^Neem/.test(t) ? 'Sprayed: neem oil, repeat in 5 days' : /^(Slug|Snail)/.test(t) ? 'Bait laid, it works over a couple of days' : /^Caterpillars/.test(t) ? 'Caterpillars picked off' : /Herbal/.test(t) ? 'Sprayed: herbal, covered for about 5 days' : 'Sprayed: pest spray, repeat in 5 days';
    if (id === 'prune') return 'Pruned: better airflow for about 5 days';
    if (ev && t) return t.replace(/^Shade cloth (on|off)$/, 'Shade $1');
    let rd = null; try { rd = Sim.readings(S); } catch (e) {}
    const how = S.method && S.method.how, num = k => (rd && typeof rd[k] === 'number' && isFinite(rd[k])) ? rd[k] : null;
    if (id === 'water') { const m = num('moisture'); return m != null ? 'Watered: ' + (how === 'coco' ? 'coco' : 'soil') + ' ' + Math.round(m * (m <= 1.5 ? 100 : 1)) + ' %' : 'Watered'; }
    if (id === 'feed') { const e = num('ec'), p = num('ph'); return how === 'soil' ? 'Fed: a weekly dose' : e != null ? 'Fed: EC ' + fmt(e, 1) + (p != null ? ' at pH ' + fmt(p, 1) : '') : 'Fed'; }
    if (id === 'shade') return 'Shade ' + (S.shade ? 'on' : 'off');
    if (id === 'drip') return S.drip ? 'Drip on: feeds every 4 h in the light' : 'Drip off';
    if (id === 'cover') { const v = S.method && S.method.where === 'veranda'; return v ? (S.cover ? 'Pots brought in' : 'Pots back out') : (S.cover ? 'Covered for the night' : 'Uncovered'); }
    if (id === 'plant') return 'Planted slot ' + (selSlot() + 1);
    return null;
  }
  function actInfoToast(id, evs) {
    if (TOAST_ACTS.indexOf(id) < 0) return;
    let t = null; try { t = actInfoText(id, evs); } catch (e) {}
    if (t) toast(t, 3000);
  }
  function actToast(id) {
    if (!S) return;
    if (mode !== 'beginner') {
      if (id === 'mix') { const v = readNum('ec'); if (S.mixHalf) toast('Mix feed: halfway to target, tap again' + (v != null ? ' (EC ' + fmt(v, 1) + ')' : ''), 3200); else toast(v != null ? 'Feed mixed: EC ' + fmt(v, 1) : 'Feed mixed'); return; } /* [M5] */
      if (id === 'phDown' || id === 'phUp') { const v = readNum('ph'); toast(v != null ? (id === 'phDown' ? 'pH down: now ' : 'pH up: now ') + fmt(v, 1) : (id === 'phDown' ? 'pH down added' : 'pH up added')); return; }
      if (id === 'topUp') { const l = readNum('reservoirL'), v = readNum('ec'); toast('Topped up' + (l != null ? ': tank ' + fmt(l, 0) + ' L' : '') + (v != null ? ', EC ' + fmt(v, 1) : '')); return; } /* [M5] */
    }
    if (id === 'fan') {
      const n = S.__fan ?? 2, nx = camp ? (n % 3) + 1 : (n + 1) % 4;
      if (n === 0 && holdDropped) { holdDropped = false; toast('Fan off: the tent will warm up. Holding 1x while the air settles', 3600); return; } /* told once, when the clock was actually slowed */
      toast(n === 0 ? `Fan off: the tent will warm up · tap again for ${FAN[nx]}` : `Fan: ${FAN[n]} · tap again for ${FAN[nx]}${nx === 0 ? ' (the tent will warm up)' : ''}`);
    } else if (id === 'lights') {
      const cyc = lightCycle(), n = lightHrs(), nx = cyc[(cyc.indexOf(n) + 1) % cyc.length] ?? 18;
      toast(`Lights: ${n}h on · tap again for ${nx}h`);
    } else if (id === 'humidity') {
      const m = S.__hum || 'off', nx = HUM[(HUM.indexOf(m) + 1) % 3];
      toast(`Mist: ${HUML[m]}${m === 'humidify' ? ' · adds moisture' : m === 'dehumidify' ? ' · pulls moisture out' : ''} · tap again for ${HUML[nx]}`);
    }
  }

  const joinT = (t, x) => !t ? (x || '') : !x ? t : (/[.!?]$/.test(t) ? t + ' ' : t + '. ') + x;
  /* --------- events from engine --------- */
  const gameHrs = () => { try { const r = Sim.readings(S); return (r.day ?? S.day ?? 0) * 24 + (r.hour ?? S.hour ?? 0); } catch (e) { return 0; } };
  const seenRecently = key => { const g = gameHrs(); if (seenTips[key] != null && g - seenTips[key] < 48 && g >= seenTips[key]) return true; seenTips[key] = g; return false; };
  const fixBtn = ids => (ids || []).find(a => document.querySelector(`#dock [data-act="${a}"], #dockOverflow [data-act="${a}"]`));
  function handleEvent(ev) {
    if (!ev) return;
    if (mode === 'beginner' && window.Beginner && Beginner.onEvent(ev)) return; /* Grow with Axel speaks for itself */
    const key = ev.id || ev.title;
    const line = joinT(ev.title, ev.text);
    if (ev.type === 'stage') { Sfx.play('stage'); scene.burst('sparkle', 260, 200); try { drawPlant(true); } catch (e) { warnOnce('handleEvent#1', e); } try { if (window.Fx) Fx.stageCard(String(Sim.stageInfo(S).name || ev.title || 'New stage').replace(/^\w/, c => c.toUpperCase()), ''); } catch (e) { warnOnce('handleEvent#2', e); } stageChange(line);
      try { quinn.react('wave', 2200); } catch (e) { warnOnce('handleEvent#3', e); }
      /* music stage layer mid-day: only while music is on, in the tent (grow/night) tracks */
      try { if (Sfx.musicOn && Sfx.musicOn() && (Sfx.musicOn('grow') || Sfx.musicOn('night'))) Sfx.music(true, Sim.readings(S).lightsOn ? 'grow' : 'night', { stage: Sim.stageInfo(S).index }); } catch (e) { warnOnce('handleEvent#4', e); }
      return; }
    if (key === 'prop_off') { say(ev.text, { bg: true, auto: true, hop: true, dwell: 3500 }); return; } /* v60: the propagator lid comes off once, in every mode */
    if (ev.type === 'problem') { handleProblems([ev]); return; }
    if (ev.type === 'harvest') { Sfx.play('pop'); try { quinn.react('wave', 3000); } catch (e) { warnOnce('handleEvent#5', e); } say(line || 'Fruit is ripe!', { hop: true }); return; }
    if (ev.type === 'info' && ev.title && mode !== 'free') { if (/^act_/.test(key) && cur && cur.opts.requireClick) return; if (TOAST_ACTS.indexOf(String(key).slice(4)) >= 0 && /^act_/.test(key)) return; /* v36b: toasted by doAct */ if (key === 'act_lights') return; /* doAct already said what the lights tap did */ if (!seenRecently('info-' + key)) say(/^act_/.test(key) ? oneBubble(line) : line); }
  }

  /* --------- problem cards: one card per burst, never a flood ---------
     Problems that arrive in the same tick become ONE card ("Cold stall, and 2 more. See Journal."); the first one keeps its glowing fix button.
     While that card is up, or for 6 game hours after it closes, further problems are only logged (Journal) and mentioned in a toast. */
  let probCard = null, probQuietUntil = 0;
  const probUp = () => !!probCard && ((cur && cur.id > probCard.from && cur.id <= probCard.to) || sayQueue.some(m => m.id > probCard.from && m.id <= probCard.to));
  function logProblem(ev) { const j = S.__plog || (S.__plog = []); j.push({ d: Math.floor(gameHrs() / 24), title: ev.title || ev.id || 'Problem', sev: ev.severity || 1 }); if (j.length > 200) j.shift(); }
  const moreLine = (title, n) => `${title}, and ${n} more. See Journal.`;
  function handleEvents(evs) {
    evs = evs || [];
    const probs = evs.filter(e => e && e.type === 'problem');
    evs.forEach(e => { if (!(e && e.type === 'problem')) handleEvent(e); });
    if (probs.length) handleProblems(probs);
  }
  function handleProblems(list) {
    if (mode === 'beginner' && window.Beginner && Beginner.isActive && Beginner.isActive()) return; /* Grow with Axel speaks for itself */
    const fresh = [];
    list.forEach(ev => {
      const key = ev.id || ev.title;
      if (window.Almanac) Almanac.seen('problem:' + key);
      if (ev.id) probFix[ev.id] = ev.fixActions || [];
      if (ev.severity >= 2) { try { quinn.react('worried', 4000); } catch (e) { warnOnce('handleProblems#1', e); } } /* before the 48 h speech de-dupe: an escalation still worries Axel */
      if (seenRecently(key)) return;
      const nk = 'told-' + key; /* v45 (play-test 7 #3): the same amber problem gets a card twice a grow; after that it is a toast and the Journal (red ones always get the card) */
      if ((seenTips[nk] || 0) >= 2 && !(ev.severity >= 2)) { logProblem(ev); toast(ev.title + ' again. See Journal.', 2600); return; }
      seenTips[nk] = (seenTips[nk] || 0) + 1;
      logProblem(ev); fresh.push(ev);
    });
    if (!fresh.length) return;
    phDriftNote(fresh);
    Sfx.play(fresh.some(e => e.severity >= 2) ? 'bad' : 'alert');
    const g = gameHrs();
    if (probCard && !probUp()) { probQuietUntil = g + 6; probCard = null; }
    if (probCard) { probCard.extra += fresh.length; return; } /* a problem card is on screen: fold into it (toast when it closes) */
    if (g < probQuietUntil) { toast(fresh.length > 1 ? moreLine(fresh[0].title, fresh.length - 1) : fresh[0].title + '. See Journal.', 3200); return; }
    showProblemCard(fresh);
  }
  function showProblemCard(fresh) {
    const ev = fresh[0], key = ev.id || ev.title, extra = fresh.length - 1, line = (extra ? moreLine(ev.title, extra) : joinT(ev.title, ev.text)).replace('Tap Pest control', (window.innerWidth || 375) < 400 ? 'Tap Pests' : 'Tap Pest control') + (key === 'iron' && !extra && barHasPh() && S.ph > ((Sim.stageInfo(S).targets || {}).ph || [0, 99])[1] ? ' Tap pH down.' : ''); /* v71 (play-test #21 m2): an iron lockout with the pH still high names the button */ /* v69: the outdoor pest button reads Pests on a phone */
    const fx = mode === 'learn' ? fixBtn((ev.fixActions || []).filter(a => a !== 'fan' || (ev.id === 'dryair' ? (S.__fan ?? 2) === 3 : (S.__fan ?? 2) !== 3))) : null;
    const pt = mode !== 'free' && !extra ? probTip(key) : null;
    const from = msgSeq, card = probCard = { from, to: from, extra: 0 };
    const gone = extra || !(S.pr && S.pr[key]) ? null : () => !S || !(S.pr && S.pr[key]); /* the problem cleared while the card waited in the queue: drop it */
    say(line, { stale: gone, worried: true, hold: ev.severity >= 2 && $('#autopause').checked, nohold: mode === 'learn' && !fx, keep: ev.severity >= 2, target: fx ? `[data-act="${fx}"]` : null, requireClick: !!fx, more: !!pt, link: !pt && !extra && ev.productHint ? hintToLink(ev.productHint) : null, linkText: ev.productHint ? hintToLinkText(ev.productHint) : null, cartItem: !pt && !extra && ev.productHint ? hintToItem(ev.productHint) : null });
    const done = () => { probQuietUntil = gameHrs() + 6; if (probCard === card) { if (card.extra) toast(card.extra === 1 ? 'One more problem came up. See Journal.' : card.extra + ' more problems came up. See Journal.', 3200); probCard = null; } };
    if (pt) say(pt[0], { link: pt[1], linkText: pt[2], nohold: mode === 'learn' && !fx, then: done, stale: gone }); else { const last = sayQueue.length ? sayQueue[sayQueue.length - 1] : cur; if (last && last.id === msgSeq) last.opts.then = done; }
    card.to = msgSeq;
  }

  /* the first time pH drifts up after the player corrected it, Axel says once that this is normal (the lesson has its own copy in beginner.js) */
  const PH_DRIFT = 'pH creeps up as the plant drinks. A small nudge every few days is normal.';
  const barHasPh = () => { try { return !!(S && Sim.actionsFor && Sim.actionsFor(S).indexOf('phDown') >= 0); } catch (e) { return false; } };
  function phDriftNote(list) {
    if (!S || !S.__phFixed || S.__phDriftTold || mode === 'beginner') return;
    if (!list.some(e => e.id === 'iron')) return; /* 'iron' = pH above the crop's limit */
    S.__phDriftTold = true; say(PH_DRIFT + (barHasPh() ? ' Tap pH down.' : ''), { auto: true, hop: true, repeat: true }); /* v71 (play-test #21 m2): the line names the button, as the first pH line does */
  }
  const PROB_TIP = {
    tip: ['Fix: fan on, EC back in range, and a little Calmag Agent in the tank. Tipburn is calcium not reaching the fast-growing heart.', CAT.nutrients, 'Calmag Agent at HyGrow'],
    bolt: ['Fix: fan up and shorter light hours. Lettuce bolts once the tent gets warm, and a HyGrow clip fan keeps it cool.', CAT.fans, 'Clip fans at HyGrow'],
    dm: ['Fix: drop humidity under 80%, get the air moving and thin the old leaves. Downy mildew loves damp, still air.', CAT.fans, 'Fans and climate gear'], /* v37: Plant Guard is not a fungicide */
    pm: ['Fix: lift the airflow, thin the old leaves and try a milk spray (one part milk to nine of water). Powdery mildew loves damp, mild, still air.', CAT.fans, 'Fans and climate gear'],
    cold: ['Fix: slow the fan, keep the lights on and warm the roots with a Cultivate heat mat. Cold stalls growth.', CAT.propagation, 'Heat mats at HyGrow'],
    bit: ['Fix: ease EC back into range, top up the tank and cool the tent. An HM EC meter shows you when the feed is creeping up.', CAT.testing, 'EC meters at HyGrow']
  };
  const probTip = id => { const p = PROB_TIP[id]; /* v52 (play-test #10 #1): read the table; v49b called itself and no problem card ever showed */ if (p && id === 'cold' && S && S.out) return ['Fix: cover the bed on a cold night, or bring the pots in. Cold stalls growth.', p[1], '']; return p; }; /* v49b (play-test #9): no fan or lights outside */
  const STAGE_INTRO = { propagation: 'Seedling time', vegetative: 'Growing time', flowering: 'Flowering now', fruiting: 'Fruiting now', heading: 'Heading up', harvest: 'Nearly harvest time', cutting: 'Cutting time' };
  /* crop-specific stage notes in Axel's voice: [title override, extra tip] */
  const STAGE_NOTE = {
    'lettuce:propagation': [null, 'Lettuce seedlings like it cool and gentle. Light feed, plenty of air.'],
    'lettuce:vegetative': [null, 'Leaves are racing now. Keep the air moving so the heart gets its calcium.'],
    'lettuce:heading': [null, 'The head is folding in. Keep it cool or it bolts, and keep a fan going or the centre tipburns.'],
    'lettuce:harvest': [null, 'Heads are firm. Tap Harvest head when you\u2019re happy, it\u2019s one cut and done.'],
    'basil:propagation': [null, 'Basil seedlings hate the cold. Keep the tent warm and the air a bit damp.'],
    'basil:vegetative': [null, 'Let it get a few leaf pairs before the first cut.'],
    'basil:cutting': [null, 'Pinch out the tops above a leaf pair. It bushes up and you get more.'],
    'basil:flowering': [null, 'Flowers make basil bitter. Cut them off.'],
    'cucumber:vegetative': [null, 'The vine climbs fast. Keep the air moving to keep powdery mildew away.'],
    'cucumber:fruiting': [null, 'Pick often. Strong feed or a dry tank turns the fruit bitter.']
  };
  function stageChange(fallback) {
    let info; try { info = Sim.stageInfo(S); } catch (e) { return say(fallback, { hop: true }); }
    const t = info.targets || {}, C = window.CROP_DATA && CROP_DATA[S.cropId], prev = C && C.stages[(info.index || 1) - 1];
    if (!t.ec || !C) return say(fallback, { hop: true });
    const ec = `EC ${fmt(t.ec[0])}–${fmt(t.ec[1])}`, h = t.photoperiod;
    const dir = prev ? (t.ec[1] > prev.ec[1] ? 'goes up to' : t.ec[1] < prev.ec[1] ? 'drops to' : 'stays around') : 'is now';
    const lightsChange = prev && prev.photoperiod !== h;
    const note = STAGE_NOTE[S.cropId + ':' + info.name], intro = (note && note[0]) || STAGE_INTRO[info.name] || (info.name || 'New stage');
    const hasLights = !S.out, soil = S.method && S.method.how === 'soil'; /* v49b: a bed has no lights, soil has no EC tile */
    const feedPart = soil ? `Feed ${dir === 'drops to' ? 'a little lighter' : dir === 'stays around' ? 'the same' : 'a little stronger'} from now on` : `Feed ${dir} ${ec}`;
    const helps = mixHelps(), feedBtn = document.querySelector('[data-act="mix"]') ? 'Mix feed' : document.querySelector('[data-act="feed"]') ? 'Feed' : null;
    const txt = `${intro}! ${feedPart}${hasLights ? (lightsChange ? ` and lights to ${h} hours` : `, lights stay at ${h} hours`) : ''}` + (helps && dir === 'goes up to' && feedBtn ? `, so tap ${feedBtn}.` : '.'); /* v63 (play-test #16 #2): the feed target doubles at Vegetative and the line said so without saying what to do. A clause, not a third sentence: say() starts a second bubble after two */ /* v58 (play-test #13 #2): the glow and the "Tap Mix feed" line only when a mix would add feed; the lettuce heading stage used to ask for it and then refuse */
    if (mode !== 'free') { const mb = document.querySelector('[data-act="mix"]'); if (mb) mb.classList.toggle('ready', helps); }
    dockLabels();
    if (mode === 'learn' && document.querySelector('[data-act="mix"]') && !helps) { say(`${intro}! The feed in the tank is still right for this stage.`, { hop: true }); return; }
    if (mode === 'learn') { /* ONE bubble, no numbers: the tip, the Mix feed prompt and the lights prompt used to arrive as four in a row (the Lights button glows by itself) */
      const mixB = document.querySelector('[data-act="mix"]'); /* v49b: pots and beds have Feed, not Mix feed */
      say(`${intro}! The plant wants stronger feed now. Tap ${mixB ? 'Mix feed' : 'Feed'}.`, mixB ? { hop: true, front: true, keep: true, target: '[data-act="mix"]', requireClick: true, stale: () => !mixB.classList.contains('ready') } : { hop: true, front: true, keep: true, target: '[data-act="feed"]', requireClick: true });
      return;
    }
    const more = [];
    if (note && note[1] && mode !== 'free') more.push([note[1], {}]);
    more.reverse().forEach(m => say(m[0], Object.assign({ front: true }, m[1])));
    say(txt, { hop: true, front: true, keep: true, more: more.length > 0, link: CAT.nutrients, linkText: 'Nutrients at HyGrow' });
  }

  /* --------- fruit flying to the Picked counter --------- */
  function bumpPicked() {
    const el = $('#picked'); if (reduceMotion() || !el.animate) return;
    el.style.display = 'inline-block'; el.style.transformOrigin = 'left center';
    el.animate([{ transform: 'scale(1)', color: '#f0f4f0' }, { transform: 'scale(1.5)', color: '#6ec846' }, { transform: 'scale(1)', color: '#f0f4f0' }], { duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  }
  function flyFruit(n) {
    let done = false;
    const finish = () => { if (done) return; done = true; pickedLock = false; const rd = Sim.readings(S); $('#picked').textContent = ((rd.plant && rd.plant.harvestedKg) || 0).toFixed(2) + ' kg'; Sfx.play('coin'); bumpPicked(); };
    if (reduceMotion() || !document.body.animate) { Sfx.play('pop'); finish(); return; }
    const sr = scene.svg.getBoundingClientRect(), tr = $('#picked').getBoundingClientRect();
    const sx = sr.left + sr.width * 0.5, sy = sr.top + sr.height * 0.42, ex = tr.left + 12, ey = tr.top + tr.height / 2;
    for (let i = 0; i < n; i++) {
      const w = document.createElement('div');
      w.className = 'flyfruit';
      w.style.cssText = 'position:fixed;left:0;top:0;width:26px;pointer-events:none;z-index:30;will-change:transform;opacity:0';
      w.appendChild(Art.fruitIcon(cropOf(pick.crop).icon, 26));
      document.body.appendChild(w);
      const x0 = sx + (Math.random() - 0.5) * 90, y0 = sy + (Math.random() - 0.5) * 60;
      const xm = (x0 + ex) / 2 + (Math.random() - 0.5) * 60, ym = Math.min(y0, ey) - 70 - Math.random() * 40;
      const p = (x, y, sc) => `translate(${x - 13}px,${y - 13}px) scale(${sc})`;
      const delay = i * 110;
      const a = w.animate([{ transform: p(x0, y0, 0.4), opacity: 0 }, { transform: p(x0, y0 - 18, 1.1), opacity: 1, offset: 0.15 }, { transform: p(xm, ym, 1), opacity: 1, offset: 0.55 }, { transform: p(ex, ey, 0.45), opacity: 0.9 }], { duration: 750, delay, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'both' });
      setTimeout(() => Sfx.play('pop', { pitch: 1 + i * 0.07 }), delay);
      a.onfinish = () => { w.remove(); if (i === n - 1) finish(); };
    }
    setTimeout(() => { document.querySelectorAll('.flyfruit').forEach(x => x.remove()); finish(); }, n * 110 + 1500);
  }

  /* --------- Axel weekly tips (Learn mode) --------- */
  const WEEKLY = [
    ['Tip: bring your empty bottles to HyGrow in Byford. Ask in store about refills. Less plastic for you.', CAT.nutrients, 'Nutrients at HyGrow'],
    ['Tip: top up with plain water between tank changes. Never tip spent feed down the drain, because the nutrients feed algae in Perth’s Swan–Canning rivers. Spent tank water, diluted, goes on ornamental pots or the lawn, never on Perth’s sandy beds near drains and never on seedlings.' /* v47 [m8] */, CAT.nutrients, 'Nutrients at HyGrow', null, { how: ['hydro', 'tower'] }],
    ['Tip: a recirculating hydro setup uses far less water than a soil garden, because the tank gets reused instead of running off.', CAT.pumps, 'Pumps at HyGrow', null, { how: ['hydro', 'tower'] }], /* v47 */
    ['Tip: pick a grow light by its µmol/J rating, not watts. Higher means more plant light for every bit of power you pay for.', CAT.lighting, 'LED lights at HyGrow', null, { where: ['tent'] }],
    ['Tip: coco coir can be rinsed, recharged and reused for another crop. Good for your wallet, and the bin.', CAT.medium, 'Grow medium at HyGrow', null, { how: ['coco'] }],
    ['Tip: calibrate your pH and EC meters every couple of weeks. Meters drift, and a wrong reading means a wrong fix.', CAT.testing, 'Meters and calibration solution', null, { how: ['hydro', 'tower'], meter: true }], /* rc1 minor: needs a pH or EC meter in the kit; v69 (play-test #20 m3): not coco, which has no pH cal button and reads true */
    ['Tip: keep tank water between 18 and 21 °C. Cool water holds more oxygen, and that keeps roots healthy.', CAT.pumps, 'Air pumps and chillers', null, { how: ['hydro', 'tower'] }],
    ['Tip: an air stone keeps oxygen up in the tank. Warm water with no bubbles is how root rot gets started.', CAT.pumps, 'Air pumps at HyGrow', null, { how: ['hydro', 'tower'] }],
    ['Tip: put your lights on a timer. Plants like a steady day and night, and you save power by not leaving them on.', CAT.lighting, 'Timers and lights at HyGrow', null, { where: ['tent'] }],
    ['Tip: tipburn is calcium not reaching the heart of the head. Keep a fan moving air across the leaves and add a little Calmag Agent.', CAT.nutrients, 'Calmag Agent at HyGrow', ['lettuce'], { where: ['tent'] }], /* v47 */
    ['Tip: lettuce bolts when it gets warm. Keep the tent cool and the days short, and it stays mild instead of bitter.', CAT.fans, 'Fans and climate gear', ['lettuce'], { where: ['tent'] }],
    ['Tip: pinch basil above a leaf pair and it bushes up. Cut the flower buds off or the leaves go bitter.', CAT.pest, 'Pruning gear and sprays', ['basil']],
    ['Tip: basil hates cold roots. Keep the tank above 18 °C and it will thank you.', CAT.propagation, 'Heat mats at HyGrow', ['basil'], { how: ['hydro', 'tower'] }],
    ['Tip: mildew loves damp, still air. Fan on, humidity down and thin the old leaves. Milk spray (1 part milk to 9 of water) works on powdery mildew, the white powder on cucumber. Downy mildew, on basil, wants dry leaves and air moving.', CAT.fans, 'Fans and climate gear', ['cucumber', 'basil'], { where: ['tent'] }], /* v47 */
    ['Tip: mildew starts in damp, still corners. Water the soil, not the leaves, and thin the old leaves so air can move through. Milk spray (1 part milk to 9 of water) works on powdery mildew, the white powder on cucumber. Downy mildew, on basil, wants dry leaves and air moving.', CAT.pest, 'Pruning gear and sprays', ['cucumber', 'basil'], { where: ['veranda', 'outdoors'] }], /* v47 */
    ['Tip: bitter cucumbers mean stress. Keep the feed in range, the tank full and the tent cool.', CAT.testing, 'EC meters at HyGrow', ['cucumber'], { where: ['tent'] }],
    ['Tip: chilli and capsicum stall when it\u2019s cold. Keep the tent warm at night and the tank above 18 °C.', CAT.propagation, 'Heat mats at HyGrow', ['chilli', 'capsicum'], { where: ['tent'] }],
    /* v38 [M34]: tips for the eight setups outside the tent; the tank and tent lines above no longer reach a soil bed or a veranda */
    ['Tip: water outside in the cool of the morning, so the leaves dry before night and less is lost to the sun.', CAT.pumps, 'Watering gear at HyGrow', null, { where: ['veranda', 'outdoors'] }],
    ['Tip: a few centimetres of mulch keeps soil moisture even between waterings, and that is what stops split fruit and tipburn.', CAT.medium, 'Grow medium at HyGrow', null, { how: ['soil'] }],
    ['Tip: put the shade cloth on before a hot day, not during it. Leaves scorch on the first hot afternoon.', CAT.fans, 'Shade cloth and climate gear', null, { where: ['veranda', 'outdoors'] }],
    ['Tip: coco drains quickly and holds little food of its own. Feed a little and often, and let about a fifth run out the bottom so salts never build up.', CAT.medium, 'Coco coir at HyGrow', null, { how: ['coco'] }],
    ['Tip: a cold night outside is the one thing you can see coming. Cover before dusk and the plant never knows.', CAT.propagation, 'Frost cover at HyGrow', null, { where: ['outdoors'] }]
  ];
  function weeklyTip(day) {
    if (!guided() || !S) return;
    const wk = Math.floor(day / 7);
    if (wk < 1 || wk <= (S.__tipWeek || 0) || sayQueue.length > 1 || saying) return;
    S.__tipWeek = wk;
    const i = S.__tipIdx || 0; S.__tipIdx = i + 1;
    const m = S.method || {}, mt = (S.setup && S.setup.meters) || {}, hasMeter = !!(mt.ec || mt.ph), fits = w => (!w[3] || w[3].indexOf(S.cropId) >= 0) && (!w[4] || ((!w[4].how || w[4].how.indexOf(m.how) >= 0) && (!w[4].where || w[4].where.indexOf(m.where) >= 0) && (!w[4].meter || hasMeter))); /* rc1 minor: a no-meter chapter gets no calibrate tip */ /* v38 [M34]: a tip fits the crop AND the way it is grown */
    const pool = WEEKLY.filter(fits), t = pool[i % pool.length];
    if (!t) return;
    say(t[0], { link: t[1], linkText: t[2] });
  }

  /* --------- render --------- */
  /* a plant under 40 % health is visibly wilted: 0.4 at 40 %, 0.7 at 0 % (art.js applies the same floor to the drawing) */
  const healthWilt = h => h < 40 ? 0.4 + 0.3 * Math.min(1, (40 - h) / 40) : 0;
  function plantView() {
    const rd = Sim.readings(S), info = Sim.stageInfo(S), pl = rd.plant || {}, pr = rd.problems || {};
    const cd = cropOf(S.cropId || pick.crop), nF = cd.leafy ? 0 : Math.min(12, Math.round(pl.fruitCount || 0));
    const ripeFrac = pl.fruitKg > 0 ? Math.min(1, (pl.ripeKg || 0) / pl.fruitKg) : 0;
    const fruits = [];
    for (let i = 0; i < nF; i++) fruits.push({ size: 0.45 + ((i * 37) % 10) / 20, ripe: Math.max(0, Math.min(1, ripeFrac * 1.6 - (i % 4) * 0.25 + 0.2)) });
    const size = Math.max(0.05, Math.min(1, Math.sqrt((pl.leafArea || 0) / (cd.leafMax || 1.2))));
    const view = {
      crop: pick.crop, stage: info.index ?? 1, size, fruits, health: rd.health ?? 100, seed: S.seed || 5, stake: (pick.crop === 'tomato' || pick.crop === 'cucumber') && size > 0.4,
      wilt: Math.max((pr.wilt || 0) / 3, (pr.lowwater || 0) / 4, Math.max(0, (50 - (rd.health ?? 100)) / 120), healthWilt(rd.health ?? 100)),
      chlorosis: Math.max((pr.iron || 0) / 3, (pr.lowec || 0) / 5),
      pests: (pr.pests || 0) > 0,
      spots: Math.max(pr.botrytis || 0, pr.ber || 0) / 4, /* pass 8b: EC burn now has its own scorched tips (scorch) */
      scorch: Math.min(1, (pr.ecburn || 0) / 3), limp: Math.min(1, Math.max(pr.rot || 0, pr.rootrot || 0) / 3), /* art.js: EC burn = scorched leaf tips, root rot / warm tank = limp canopy */
      mildew: Math.max(pr.pm || 0, pr.dm || 0) / 4
    };
    crop3Looks(view, rd, pr);
    if (Sim.problemLooks) Object.assign(view, Sim.problemLooks(S)); /* v23: all 23 problem visuals (the seven above included) from the engine's severities */
    return Object.assign(view, pl.look || {});
  }
  /* per-crop problem looks for Art.plant (art.js header documents each field). Every field is a clamped 0..1 severity and stays 0 for crops it does not apply to,
     so healthy plants draw exactly as before. Raw sim state (S.airT, S.dliLast) is used instead of the metered readings so a missing meter never hides a visible symptom. */
  function crop3Looks(view, rd, pr) {
    const crop = view.crop, st = view.stage, T = S.airT, dli = S.dliLast, dliT = (rd.targets && rd.targets.dli) || [0, 0];
    const ramp = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo))), sev = k => (pr[k] || 0) / 3; /* engine problem severity is 0..3 */
    view.tipburn = view.cold = view.leggy = view.bitter = view.mgdef = view.drop = view.scald = 0;
    if (crop === 'lettuce') view.tipburn = ramp(sev('tip'), 0, 1); /* engine tipburn: strong feed, thirsty or stagnant air, too much light or heat, wilting */
    if (crop === 'basil' && st >= 1) {
      view.cold = Math.max(ramp(15 - T, 0, 5), sev('cold')); /* 15 C air = first dark tips, 10 C or the engine cold stall = full black curl */
      view.leggy = dliT[0] > 0 && typeof dli === 'number' ? ramp(dliT[0] * 0.8 - dli, 0, dliT[0] * 0.5) : 0; /* yesterday's light under 80% of the stage minimum stretches the stems; 30% of it = fully leggy */
    }
    if (crop === 'cucumber' && st >= 1) {
      view.bitter = Math.max(sev('bit'), sev('wilt') * 0.8); /* engine bitter fruit (high EC, heat, thirst) or an empty tank (wilt) */
      view.mgdef = Math.max(sev('lowec'), sev('phlow')); /* starved feed (low EC) or acidic solution locking out calcium and magnesium */
    }
    if ((crop === 'chilli' || crop === 'capsicum') && st >= 2) {
      view.drop = Math.max(ramp(T - 32, 0, 4), ramp(15 - T, 0, 4), sev('heat')); /* flowers fall above ~32 C or below ~15 C air, or when the engine's heat drop is flagged */
      view.scald = dliT[1] > 0 && typeof dli === 'number' ? Math.min(ramp(T - 31, 0, 4), ramp(dli / dliT[1], 1.1, 1.5)) : 0; /* needs both heat over 31 C and light 10% over the stage maximum, full at 35 C and 150% */
    }
  }
  /* redraw the crop (cross-fade). A stage change adds the glow ring under the pot and a leaf burst; S.__stageDrawn keeps new games and loads from glowing */
  function drawPlant(stageEvent) {
    const pv = plantView(), up = !!stageEvent || (S.__stageDrawn != null && pv.stage !== S.__stageDrawn);
    S.__stageDrawn = pv.stage;
    scene.setPlant(pv, up ? { stage: true } : undefined);
    drawProps();
    if (up) scene.burst('leaf', 230, 350);
  }
  /* v36 design pass (art.js props): tent as before; veranda = pots, outdoors = a raised bed, tower = a vertical tower with one small plant per filled slot (Sim.slotInfo) */
  let propKey = '';
  function drawProps() {
    const m = methodOf(), svg = scene.svg;
    try {
      if (isTower()) {
        const C = window.CROP_DATA && CROP_DATA[S.cropId];
        Art.tower(svg, slotInfos(), (g, info, i) => {
          const si = C ? Math.max(0, C.stages.findIndex(x => x.name === info.stageName)) : 1, hp = info.health == null ? 100 : info.health;
          Art.plant(g, { crop: S.cropId, stage: si, size: Math.max(0.12, Math.min(1, info.progress == null ? 0.3 : info.progress)), fruits: [], health: hp, seed: (S.seed || 5) + i * 7, wilt: healthWilt(hp) });
        });
        propKey = 'tower'; markSlot();
      } else if (m.where === 'veranda' || m.where === 'outdoors') {
        if (propKey !== m.where || !svg.querySelector('.prop')) { if (m.where === 'veranda') Art.pots(svg, 3); else Art.bed(svg, 3); propKey = m.where; }
      } else if (propKey) { Art.clearProp(svg); propKey = ''; }
    } catch (e) { console.warn('props', e); }
    const tent = $('#tent'); if (tent) { tent.dataset.where = m.where || 'tent'; tent.dataset.how = m.how || ''; }
  }
  /* the painted backdrop follows the place when art/scenes.json has it (veranda, backyard_bed), else the tent interior */
  let sceneNames = null, tentBgName = 'tent_interior';
  function loadSceneNames() {
    try { fetch('art/scenes.json').then(r => r.ok ? r.json() : {}).then(j => { sceneNames = j || {}; if (S) stageForMethod(); }).catch(() => { sceneNames = {}; }); } catch (e) { sceneNames = {}; }
  }
  function stageSceneName() {
    const w = methodOf().where, has = n => !!(sceneNames && sceneNames[n]);
    return w === 'veranda' && has('veranda') ? 'veranda' : w === 'outdoors' && has('backyard_bed') ? 'backyard_bed' : 'tent_interior';
  }
  function stageForMethod() {
    propKey = '~'; /* the next drawPlant draws the props afresh */
    const name = stageSceneName();
    if (tentBg && name !== tentBgName && window.Scene) {
      try { Scene.unmount(tentBg); tentBg.remove(); } catch (e) { warnOnce('stageForMethod#1', e); }
      tentBg = mountTentBg(name); tentBgName = name; bgHour = null;
    }
  }
  const LIVE_MARGIN = { ec: 0.5, ph: 0.3, airTemp: 3, rh: 10, vpd: 0.35, waterTemp: 2.5 };
  const LIVEKEY = { ec: 'ec_mscm', ph: 'ph', waterTemp: 'water_temp_c' }; /* air, RH, VPD and light already come from the room through attachClimate */
  function liveVal(k) { if (mode !== 'live' || !live || live.offline || !live.row || !LIVEKEY[k]) return null; const v = live.row[LIVEKEY[k]]; return typeof v === 'number' && isFinite(v) ? v : null; }
  /* v36: the tiles a way of growing shows, in the engine's order (Sim.tilesFor); the old eight when the engine has no such call */
  const OLD_TILES = ['ec', 'ph', 'airTemp', 'rh', 'vpd', 'dli', 'waterTemp', 'reservoirL'];
  /* v41: the products.js key of the meter behind a tile, or null when the store does not list one */
  const meterProductKey = k => { const m = /^(ec)$/.test(k) ? 'ecMeter' : /^ph$/.test(k) ? 'phPen' : /^(airTemp|rh|vpd|waterTemp|rootTemp)$/.test(k) ? 'thermo' : /^(par|ppfd|dli)$/.test(k) ? 'parMeter' : null; return m && product(m) ? m : null; };
  window.meterProductKey = meterProductKey;
  const tileKeys = () => { try { if (S && Sim.tilesFor) { const a = Sim.tilesFor(S); if (Array.isArray(a) && a.length) return a; } } catch (e) {} return OLD_TILES; };
  const rlab = k => k === 'moisture' ? [(S && methodOf().how === 'coco') ? 'Coco' : 'Soil', '%', 0] : (RLAB[k] || [k, '', 1]);
  const pct = g => { if (!g || typeof g.v !== 'number') return g; const t = Array.isArray(g.t) ? g.t : null, frac = t ? t[1] <= 1.5 : g.v <= 1; return frac ? { v: g.v * 100, s: g.s, t: t ? [t[0] * 100, t[1] * 100] : g.t } : g; };
  function renderPins(keys) { /* the method's top two tiles, pinned on page 1 of the phone pager */
    const host = $('#pins'); if (!host) return;
    host.innerHTML = '';
    keys.slice(0, 2).forEach(k => {
      const n = document.querySelector('#readings .rd[data-reading="' + k + '"]'); if (!n) return;
      const c = n.cloneNode(true);
      ['data-reading', 'tabindex', 'role', 'aria-expanded'].forEach(a => c.removeAttribute(a));
      c.classList.remove('open', 'bg-glow', 'bg-flash'); c.setAttribute('data-pin', k);
      const x = c.querySelector('.rdx'); if (x) x.remove(); const xb = c.querySelector('.rdb'); if (xb) xb.remove(); c.querySelectorAll('[aria-hidden]').forEach(q => q.removeAttribute('aria-hidden'));
      host.appendChild(c);
    });
    host.classList.toggle('on', host.children.length > 0);
  }
  /* v58: would a Mix feed at this stage's strength add anything to the tank? */
  function mixHelps() { try { const t = Sim.stageInfo(S).targets, m = t && t.mlPerL; return !Sim.mixAdds || Sim.mixAdds(S, Array.isArray(m) ? (m[0] + m[1]) / 2 : (m || 3)); } catch (e) { return true; } }
  let harvestTaps = 0; /* v58: counts Pick taps, so a queued first-harvest line can tell it is out of date */
  let slotHtml = '';
  const PHONE_MQ = matchMedia('(max-width:599px)');
  function renderSlots() { /* the tower's slot strip: tap a slot to select it, Pick acts on the selected one */
    const host = $('#slotStrip'); if (!host) return;
    { const home = PHONE_MQ.matches ? $('#tent') : $('#quinn'); if (home && host.parentElement !== home) home.appendChild(host); } /* v58 (play-test #13 #1): on a phone the strip floats over the scene's bottom edge (index.html), on a wider screen it sits in Axel's panel */
    if (!isTower()) { if (slotHtml) { host.innerHTML = ''; slotHtml = ''; } host.classList.remove('on'); return; }
    const infos = slotInfos(), sel = selSlot();
    const h = infos.map((s, i) => {
      const prog = Math.round(100 * Math.max(0, Math.min(1, s.progress || 0))), ripe = !!s.planted && (s.ripeKg || 0) >= 0.02, bad = !!s.planted && s.health != null && s.health < 40;
      return `<button type="button" data-slot="${i}" class="${i === sel ? 'sel ' : ''}${ripe ? 'ripe ' : ''}${!s.planted ? 'empty ' : ''}${bad ? 'bad' : ''}" aria-pressed="${i === sel}" aria-label="Slot ${i + 1}: ${!s.planted ? 'empty' : ripe ? 'ready to pick' : (s.stageName || 'growing')}"><span>${ripe ? '\u2713' : i + 1}</span><i><u style="width:${s.planted ? prog : 0}%"></u></i></button>`;
    }).join('');
    if (h !== slotHtml) { slotHtml = h; host.innerHTML = h; }
    host.classList.add('on');
  }
  function markSlot() { try { const sel = selSlot(); scene.svg.querySelectorAll('.slot').forEach(n => n.classList.toggle('sel', +n.getAttribute('data-slot') === sel)); } catch (e) {} }
  function pickSlot(i) {
    if (!isTower() || !(i >= 0)) return;
    S.__slot = i; try { Sfx.play('click'); } catch (e) {}
    slotHtml = ''; renderSlots(); markSlot(); dockLabels();
    toast('Slot ' + (i + 1) + ' selected' + (((slotInfos()[i] || {}).ripeKg || 0) >= 0.02 ? ', ready to pick' : ''), 1800);
  }
  const LESSON_LAB = { ec: 'Feed strength (EC)', ph: 'pH (acid/alkaline)' }, LESSON_HIDE = ['vpd', 'dli'];
  const CAMP_LAB = Object.assign({ vpd: 'Dryness (VPD)', dli: 'Day light (DLI)' }, LESSON_LAB); /* v45: the campaign reads the same plain words, plus VPD and DLI */
  const PCT_KEYS = { moisture: 1, shade: 1 }; /* shade is printed On / Off (v36b) but kept here so its history and target scale as before */ /* readings that may arrive as 0..1 and are shown as a percentage */
  const RLAB = { moisture: ['Soil', '%', 0], rain: ['Rain', 'mm', 1], wind: ['Wind', 'km/h', 0], shade: ['Shade', '%', 0], ec: ['EC', 'mS/cm', 2], ph: ['pH', '', 1], airTemp: ['Air', '°C', 0], rh: ['Humidity', '%', 0], vpd: ['VPD', 'kPa', 2], dli: ['Light (DLI)', '', 0], ppfd: ['Light now (PPFD)', 'µmol', 0] /* v45: was the bare word ppfd */, waterTemp: ['Water', '°C', 0], reservoirL: ['Tank', 'L', 0] };
  /* mobile: tap a reading tile to expand it (target + last 24 game-hours). hist is an in-memory ring buffer, one entry per game hour, never saved */
  const rdOpen = new Set(); let hist = {}, histKey = null;
  function histReset() { hist = {}; histKey = null; }
  function toggleRd(k) { if (!k) return; window.__quietScrollUntil = performance.now() + 1500; /* v41 [M10] a tile tap never moves the page */ const opening = !rdOpen.has(k); if (opening) rdOpen.add(k); else rdOpen.delete(k); render(false); if (opening && S) { try { const st = (Sim.readings(S).status || {})[k]; if (st === 'bad' || st === 'warn') sayWhy(k); } catch (e) {} } /* v36c: opening a red or orange tile also answers it in Axel's bubble */ }

  /* --------- motion helpers: number tweens, EC/pH arc gauges, sky strip, weather chip --------- */
  const setNum = (el, t) => { if (!el) return; if (window.Fx && Fx.countTo) Fx.countTo(el, t); else el.textContent = t; };
  /* EC and pH tiles get a small arc gauge: grey track, green target band, needle. Span = target range doubled in width, clamped (EC >= 0, pH 0..14) */
  function gaugeHTML(k, v, lo, hi) {
    if (!(window.Fx && Fx.gaugeAngle && Fx.arcPath) || typeof v !== 'number' || !isFinite(v) || typeof lo !== 'number' || typeof hi !== 'number') return '';
    const max = k === 'ph' ? 14 : null, a = Fx.gaugeAngle(v, lo, hi, 0, max), a0 = Fx.gaugeAngle(lo, lo, hi, 0, max), a1 = Fx.gaugeAngle(hi, lo, hi, 0, max);
    return `<svg class="rdg" viewBox="0 0 80 44" aria-hidden="true" focusable="false" data-k="${k}" data-a="${a.toFixed(1)}" data-in="${v >= lo && v <= hi ? 1 : 0}"><path class="gt" d="${Fx.arcPath(-90, 90)}"/><path class="gb" d="${Fx.arcPath(a0, a1)}"/><g class="gn" style="transform-origin:40px 40px;transform:rotate(${a.toFixed(1)}deg)"><line x1="40" y1="40" x2="40" y2="15"/></g><circle class="gh" cx="40" cy="40" r="3.2"/></svg>`;
  }
  const gMap = {}; /* last needle move per reading key: { from, to, t0 } (angles in degrees) */
  const gIn = {}; /* was the reading inside its green band at the last render? A false -> true change plays one tiny chime (at most one per 10 s per gauge, none above 4x) */
  const gaugeReset = () => { Object.keys(gIn).forEach(k => delete gIn[k]); };
  function animateGauges(root) {
    if (!root) return;
    const now = performance.now(), ease = f => 1 - Math.pow(1 - f, 3), rm = reduceMotion();
    root.querySelectorAll('.rdg').forEach(sv => {
      const k = sv.getAttribute('data-k'), to = parseFloat(sv.getAttribute('data-a')), n = sv.querySelector('.gn'), p = gMap[k];
      const inb = sv.getAttribute('data-in') === '1';
      if (gIn[k] === false && inb && speed <= 4) { try { Sfx.cue('gaugeChime', {}, { key: 'gauge:' + k, ms: 10000 }); } catch (e) { warnOnce('animateGauges#1', e); } }
      gIn[k] = inb;
      if (!n || !isFinite(to)) return;
      const cur = p ? p.from + (p.to - p.from) * ease(Math.min(1, (now - p.t0) / 400)) : to; /* where the needle visually is right now */
      if (rm) { gMap[k] = { from: to, to, t0: now - 1000 }; return; }
      if (!p || Math.abs(p.to - to) > 0.05) gMap[k] = { from: cur, to, t0: now };
      const m = gMap[k], f = Math.min(1, (now - m.t0) / 400);
      if (f >= 1 || Math.abs(cur - to) < 0.3 || !n.animate) return;
      try { n.animate([{ transform: `rotate(${cur.toFixed(2)}deg)` }, { transform: `rotate(${to}deg)` }], { duration: 400 * (1 - f), easing: f === 0 ? 'ease-out' : 'linear' }); } catch (e) { warnOnce('animateGauges#2', e); }
    });
  }
  /* sky strip behind the day stat: --hour drives the sun/moon dot, one of four classes tints the strip */
  let skyHour = null;
  function setSky(hour) {
    const el = document.querySelector('.s-day'); if (!el || !isFinite(hour)) return;
    const h = ((hour % 24) + 24) % 24, c = h < 5 || h >= 21 ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : 'dusk';
    if (skyHour != null && h < skyHour - 6) { el.classList.add('sky-snap'); setTimeout(() => el.classList.remove('sky-snap'), 80); } /* 23 -> 0: jump back, don't sweep */
    skyHour = h;
    el.style.setProperty('--hour', h.toFixed(2));
    ['night', 'dawn', 'day', 'dusk'].forEach(n => el.classList.toggle('sky-' + n, n === c));
  }
  /* weather chip: heatwave from the engine's S.wx; cold night from Sim.outdoorTemp(S) between 22:00 and 06:00 */
  const WX_ICON = {
    heat: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><g fill="none" stroke="#ff8a3c" stroke-width="2" stroke-linecap="round"><path class="wxw" d="M3 7q2.2-3 4.5 0t4.5 0 4.5 0 4.5 0"/><path class="wxw" d="M3 12q2.2-3 4.5 0t4.5 0 4.5 0 4.5 0"/><path class="wxw" d="M3 17q2.2-3 4.5 0t4.5 0 4.5 0 4.5 0"/></g></svg>',
    cold: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><g fill="none" stroke="#9fd8ff" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.8L12 6l2.5-2.2M9.5 20.2L12 18l2.5 2.2"/></g></svg>'
  };
  let wxKind = null, wxT = 0;
  function setWx(kind) {
    const el = $('#wx'); if (!el) return;
    { const home = PHONE_MQ.matches ? $('header .s-day') : $('header'); if (home && el.parentElement !== home) { if (PHONE_MQ.matches) home.appendChild(el); else { const lc = $('#livechip'); if (lc) lc.after(el); else home.prepend(el); } } } /* v58 (critic round 9 #3): on a phone the chip is a badge on the day box, so the header keeps one row */
    if (kind === wxKind) return;
    wxKind = kind; clearTimeout(wxT);
    if (kind) {
      el.className = kind; el.innerHTML = WX_ICON[kind] + '<span>' + (kind === 'heat' ? 'Heatwave' : 'Cold night') + '</span>';
      el.hidden = false; void el.offsetWidth; el.classList.add('on');
    } else {
      el.classList.remove('on');
      wxT = setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, reduceMotion() ? 0 : 320);
    }
  }
  function wxNow(hour) {
    if (!S || (mode === 'live' && live && !live.offline && live.row)) return null; /* real sensor readings: the chip would be fiction */
    if (S.wx && S.wx.hwLeft > 0) return 'heat';
    if ((hour >= 22 || hour < 6) && typeof Sim.outdoorTemp === 'function') { try { if (Sim.outdoorTemp(S) < 12) return 'cold'; } catch (e) {} }
    return null;
  }
  /* painted tent backdrop (Scene.mount into div.tentbg behind the SVG); hour follows the game clock */
  let tentBg = null, bgHour = null;
  function mountTentBg(name) {
    const host = $('#tent'); if (!host || !window.Scene || typeof Scene.mount !== 'function') return null;
    try {
      const d = document.createElement('div'); d.className = 'tentbg'; host.insertBefore(d, host.firstChild);
      Scene.mount(d, name || 'tent_interior', { aspect: false, hour: S && typeof S.hour === 'number' ? S.hour : 12 });
      return d;
    } catch (e) { const x = host.querySelector('.tentbg'); if (x) x.remove(); return null; }
  }
  /* a problem that goes from 0 to above 0 plays one red ring at the pot and flashes its reading tile (pests: no tile). prevSev = null on load / new game, so those only snapshot */
  const ALERT_TILE = { pests: null, botrytis: 'rh', pm: 'rh', dm: 'rh', heat: 'airTemp', wilt: 'reservoirL' };
  let prevSev = null, lastAlert = 0;
  function checkAlerts(pr) {
    const cur = {}; Object.keys(ALERT_TILE).forEach(k => { cur[k] = +(pr && pr[k]) || 0; });
    const was = prevSev; prevSev = cur;
    if (!was) return;
    const fresh = Object.keys(cur).filter(k => was[k] === 0 && cur[k] > 0);
    if (!fresh.length) return;
    const now = performance.now(); if (now - lastAlert < 1200) return; lastAlert = now;
    try { scene.burst('alert', 230, 440); } catch (e) { warnOnce('checkAlerts#1', e); }
    try { Sfx.cue('alertThud'); } catch (e) { warnOnce('checkAlerts#2', e); }
    fresh.forEach(k => { const tile = ALERT_TILE[k]; if (!tile || !(window.Fx && Fx.flash)) return; const n = document.querySelector('#readings [data-reading="' + tile + '"]'); if (n) Fx.flash(n, 'bad'); });
  }
  let redSeen = new Set(), redSeenFor = null; /* [M27] */
  function paintTiles(host, items) { /* [M39] */
    const kids = [...host.children];
    if (!(kids.length === items.length && kids.every((c, i) => c.dataset.reading === items[i].k))) { host.innerHTML = items.map(i => i.html).join(''); [...host.children].forEach((c, i) => { c.__h = items[i].html; }); return; }
    items.forEach((it, i) => { const c = kids[i]; if (c.__h === it.html) return; const t = document.createElement('template'); t.innerHTML = it.html; const n = t.content.firstElementChild; n.__h = it.html; c.replaceWith(n); });
  }
  function render(full) {
    if (!S) return;
    const rd = Sim.readings(S), info = Sim.stageInfo(S), pr = rd.problems || {};
    const hk = Math.floor(rd.day ?? S.day ?? 0) * 24 + Math.floor(rd.hour ?? S.hour ?? 0), newHour = hk !== histKey;
    if (histKey != null && hk < histKey) hist = {};
    histKey = hk;
    const get = k => { const r = rd[k]; if (r && typeof r === 'object') return { v: r.value, s: r.status, t: r.target }; return { v: r, s: (rd.status && rd.status[k]) || (r == null ? 'unknown' : 'good'), t: (rd.targets || {})[k] }; };
    /* Grow with Axel only: plain words on the tiles, and no VPD or Light (DLI) tile at all (no step of the lesson teaches them) */
    const lessonUI = mode === 'beginner', rng = (a, d) => fmt(a[0], d) + ' to ' + fmt(a[1], d); /* v47: one style, "45 to 80" */
    const keys = tileKeys().filter(k => !(lessonUI && LESSON_HIDE.indexOf(k) >= 0)), rdHost = $('#readings');
    const glowSet = new Set(((rdHost.getAttribute('data-bgp')) || '').split(' ').filter(Boolean)), flashSet = new Set(((rdHost.getAttribute('data-bgf')) || '').split(' ').filter(Boolean));
    const rdAe = document.activeElement, rdFocusKey = rdAe && rdAe.classList && rdAe.classList.contains('rdb') && rdAe.closest('.rd') ? rdAe.closest('.rd').dataset.reading : null; /* v37 [M39] keep keyboard focus across the rewrite */
    const rdItems = keys.map(k => {
      let g = get(k), isLive = false;
      if (k === 'ph' && g.v == null && S.method && S.method.how === 'soil') return null; /* v47: soil holds pH steady, so no "???" tile and no target to chase when there is no meter */
      if (PCT_KEYS[k]) g = pct(g);
      const [lab0, unit0, d] = rlab(k), lv = liveVal(k), lab = k === 'airTemp' && S && !S.out && S.domeK >= 1 ? 'Propagator air' /* v61 (round 11 nit #4): off with Axel's lid-off line, not a day later */ /* v60: the seedlings' air under the propagator lid (engine.js propagator) */ : lessonUI && LESSON_LAB[k] || (camp && CAMP_LAB[k]) || lab0, unit = lessonUI && k === 'ec' ? '' : unit0;
      let sub = '';
      if (lv != null) {
        isLive = true;
        const tg = Array.isArray(g.t) ? g.t : null, m = LIVE_MARGIN[k] || 0;
        const st = tg ? (lv >= tg[0] && lv <= tg[1] ? 'good' : lv >= tg[0] - m && lv <= tg[1] + m ? 'warn' : 'bad') : 'good';
        if (g.v != null && (k === 'ec' || k === 'ph' || k === 'waterTemp')) sub = `<small>model ${fmt(g.v, d)}</small>`;
        g = { v: lv, s: st, t: g.t };
      }
      const s = g.v == null ? 'unknown' : (g.s || 'good');
      const outGrace = !!(S.out && k === 'rh' && s === 'good' && Array.isArray(g.t) && typeof g.v === 'number' && (g.v < g.t[0] || g.v > g.t[1])); /* v37 [m7] outdoors the air is not ours to fix: say so, not a target we are missing */
      const inGrace = !!(rd.grace && rd.grace.indexOf(k) >= 0 && rd.graceNote); /* v38 [M-N1]: the tent's first day paints a drifting tile green; its band is replaced by the engine's note so no green tile sits beside a target it misses */
      const tg0 = inGrace ? rd.graceNote.toLowerCase() : outGrace ? (g.v > g.t[1] ? 'damp weather, mould can start' : 'no worries outside') /* v65 (play-test #17 m2): a damp spell outside is not ours to fix, but it does bring grey mould, so the tile says so */ : Array.isArray(g.t) ? (lessonUI ? `(target ${rng(g.t, k === 'rain' ? 0 : d)})` : `target ${rng(g.t, k === 'rain' ? 0 : d)}${k === 'rain' ? ' mm' : ''}`) /* v47 */ : '';
      const t = sub || (g.v == null ? `<small class="nometer">no meter${tg0 ? ' · ' + tg0 : ''}</small>` : tg0 ? `<small>${tg0}</small>` : ''); /* "???" now says why */
      const hs = hist[k] || (hist[k] = []);
      if (newHour) { hs.push(typeof g.v === 'number' && isFinite(g.v) ? g.v : null); if (hs.length > 24) hs.shift(); }
      const open = rdOpen.has(k);
      let x = '';
      if (open) {
        const why = s === 'bad' || s === 'warn' ? whyFor(k) : null;
        const tl = Array.isArray(g.t) ? `Target ${rng(g.t, k === 'rain' ? 0 : d)} ${unit}`.trim() : 'No target for this stage';
        const nn = hs.filter(v => v != null);
        x = `<div class="rdt">${k === 'dli' ? 'Light (DLI) is the day’s light total. ' : ''}${tl}</div>${why ? `<div class="rdw" role="note"><strong>Why ${s === 'bad' ? 'red' : 'orange'}?</strong> ${escH(why.line)}</div>` : ''}${nn.length > 1 ? `<div class="rdl">Last ${nn.length} game hours</div>${spark(hs.map((v, i) => [i, v]), '#6ec846', lab + ' over the last ' + nn.length + ' game hours, from ' + fmt(Math.min(...nn), d) + ' to ' + fmt(Math.max(...nn), d) + ' ' + unit + ', now ' + fmt(nn[nn.length - 1], d))}<div class="rdr">${fmt(Math.min(...nn), d)} to ${fmt(Math.max(...nn), d)} ${unit}</div>` : '<div class="rdl">History builds up as the hours pass.</div>'}`;
      }
      const gz = (k === 'ec' || k === 'ph') && Array.isArray(g.t) ? gaugeHTML(k, g.v, g.t[0], g.t[1]) : '';
      const nmA = k === 'dli' ? 'Light (DLI, the day’s light total)' : lab, valA = g.v == null ? 'no meter' : k === 'shade' ? (g.v >= 0.5 ? 'on' : 'off') : fmt(g.v, d) + (unit ? ' ' + unit : ''), stA = s === 'bad' ? 'way off' : s === 'warn' ? 'a bit off' : '';
      const nameA = nmA + ', ' + valA + (tg0 ? ', ' + tg0.replace(/[()]/g, '') : '') + (stA ? ', ' + stA : ''); /* v37 [M24] the header button carries the whole name; the detail is its own region beside it */
      return { k, html: `<div class="rd ${s}${open ? ' open' : ''}${gz ? ' hasg' : ''}${glowSet.has(k) ? ' bg-glow' : ''}${flashSet.has(k) ? ' bg-flash' : ''}" data-reading="${k}"><button type="button" class="rdb" aria-expanded="${open}" aria-controls="rdx-${k}" aria-label="${escH(nameA)}"></button><span aria-hidden="true">${lab}${isLive ? ' <u class="livetag">LIVE</u>' : ''}</span><b aria-hidden="true">${g.v == null ? '???' : k === 'shade' ? (g.v >= 0.5 ? 'On' : 'Off') : fmt(g.v, d) + (unit ? ' ' : '') + '<em>' + unit + '</em>'}</b>${t.replace('<small', '<small aria-hidden="true"')}${gz}<div class="rdx" id="rdx-${k}" role="region" aria-label="${escH(nmA)} detail"${open ? '' : ' hidden'}>${x}</div></div>` };
    }).filter(Boolean); /* v47 */
    paintTiles(rdHost, rdItems); /* v37 [M39] only the tiles whose markup changed are replaced */
    { const nowRed = new Set(keys.filter(k => get(k).s === 'bad')); if (redSeenFor === S && speed <= 3) { for (const k of nowRed) if (!redSeen.has(k)) { try { Sfx.cue('warnTick', null, { key: 'warnTick', ms: 5000 }); } catch (e) { warnOnce('render#1', e); } break; } } redSeen = nowRed; redSeenFor = S; } /* v37 [M27] a tile turning red ticks once; mute is checked inside cue */
    if (rdFocusKey) { const nb = rdHost.querySelector('.rd[data-reading="' + rdFocusKey + '"] .rdb'); if (nb && document.activeElement !== nb) { try { nb.focus({ preventScroll: true }); } catch (e) { warnOnce('render#2', e); } } }
    animateGauges($('#readings')); renderPins(keys); renderSlots(); V36B.paintTrouble();
    if (!noMeterTold && !lessonUI && tileKeys().some(k => get(k).v == null)) { noMeterTold = true; const hk = tileKeys().find(k => get(k).v == null), mk = meterProductKey(hk); /* v41: only claim the shop has one when products.js does */ say(mk ? 'No meter in this setup, so that reading stays hidden. The shop has one.' : 'No meter in this setup, so that reading stays hidden. Ask in store about one.', { auto: true, nohold: true, dwell: 4500, link: CAT.testing, linkText: 'Meters at HyGrow' }); } /* the first time the tiles show "???" */
    if (window.Fx) Fx.readings($('#readings'), speed);
    const day = rd.day ?? S.day ?? 0, hour = rd.hour ?? S.hour ?? 0;
    const health = rd.health && typeof rd.health === 'object' ? rd.health.value : (rd.health ?? 100);
    checkFix(pr); speedGuard(rd); fanHoldTick(rd);
    $('#day').textContent = `Day ${Math.floor(day)} · ${String(Math.floor(hour)).padStart(2, '0')}:00`;
    $('#stage').textContent = (info.name || '').replace(/^\w/, c => c.toUpperCase()).replace(/^Propagation$/, 'Seedling'); /* v45: plain word for the stage chip */
    $('#stagebar').style.width = Math.round((info.progress0to1 || 0) * 100) + '%';
    $('#health').style.width = Math.max(0, Math.min(100, health)) + '%';
    $('#health').className = health > 70 ? 'good' : health > 40 ? 'warn' : 'bad';
    if (window.Fx && Fx.healthColor) $('#health').style.backgroundColor = Fx.healthColor(Math.max(0, Math.min(100, health)));
    { /* v37 [M29]: the 48 hours at health 0 are visible: the bar goes solid red and Axel says so once */
      const zh = rd.zeroH || 0, hb = $('#health'); if (zh) { hb.style.width = '8%'; hb.style.backgroundColor = 'var(--red)'; } if (hb.parentNode) hb.parentNode.style.boxShadow = zh ? '0 0 0 2px var(--red)' : '';
      if (zh && !S.__zeroSaid && mode !== 'beginner') { S.__zeroSaid = true; let zl = 'It’s in real trouble. Fix the red tile today or it won’t come back.'; try { if (!document.querySelector('#readings .rd.bad')) { const d0 = (Sim.diagnose(S) || [])[0]; const fx = d0 ? String(d0.fix || '').replace(/^Fix:\s*/i, '') : ''; zl = 'It’s in real trouble. ' + (d0 ? d0.title + '. ' + (fx ? fx.charAt(0).toUpperCase() + fx.slice(1) : '') : 'Ask me what is wrong.') + ' Do it today or it won’t come back.'; } } catch (e) {} say(zl.replace(/\s+/g, ' '), { hop: true, auto: true }); } /* v67 (story review M2): with no red tile on screen (no meter) it names the problem instead */
    }
    setSky(hour); setWx(wxNow(hour));
    const sc = Sim.score(S);
    setNum($('#eco'), S.eco && S.eco.n >= 24 ? String(Math.round(sc.eco ?? 0)) : '–'); /* v37 [M33]: a dash until the first full day */
    setNum($('#spent'), '$' + Math.round(S.__cost || 0));
    const lightOn = rd.lightsOn;
    scene.setLight(!!lightOn, S.dim ?? 1);
    if (scene.setClimate) scene.setClimate({ airT: S.airT ?? rd.airTemp, rh: S.rh ?? rd.rh, hour, lightsOn: !!lightOn, dim: S.dim ?? 1, humMode: (S.setup && S.setup.humMode) || 'off', rain: rd.rain, fan: S.__fan ?? 2, problems: pr, wilt: Math.max((pr.wilt || 0) / 3, (pr.lowwater || 0) / 4, Math.max(0, (50 - (typeof health === 'number' ? health : 100)) / 120), healthWilt(typeof health === 'number' ? health : 100)) });
    checkAlerts(pr);
    if (tentBg && typeof Scene !== 'undefined' && typeof Scene.setHour === 'function' && hour !== bgHour) { bgHour = hour; try { Scene.setHour(tentBg, hour); } catch (e) { warnOnce('render#3', e); } }
    if (lastLit !== null && lastLit !== !!lightOn && speed <= 4 && performance.now() - lastLitSnd > 2500) { lastLitSnd = performance.now(); try { if (!Sfx.isMuted()) Sfx.play(lightOn ? 'lightsOn' : 'lightsOff'); } catch (e) { warnOnce('render#4', e); } }
    // day/night music: only at slow speeds and at most once a minute, or 8x turns it into a crossfade every few seconds
    if (lastLit !== null && lastLit !== !!lightOn && !endShown && speed <= 1 && performance.now() - (window.__musicSw || 0) > 60000) { window.__musicSw = performance.now(); try { Sfx.music(true, lightOn ? 'grow' : 'night', { stage: info.index }); Sfx.ambience(lightOn ? 'tent' : 'night'); } catch (e) { warnOnce('render#5', e); } }
    else if (lastLit !== null && lastLit !== !!lightOn && lightOn && speed > 1) { try { Sfx.music(true, 'grow'); Sfx.ambience('tent'); } catch (e) { warnOnce('render#6', e); } }
    lastLit = !!lightOn;
    if ((pr.rot || 0) > 0) S.__rot = true;
    const resL = get('reservoirL').v ?? S.reservoirL ?? 20;
    scene.setReservoir(resL / ((S.setup && S.setup.reservoirL) || 40), pick.air !== 'none', typeof rd.ec === 'number' ? rd.ec : undefined);
    if (full || (S.__lastDayDrawn !== Math.floor(day))) { if (S.__lastDayDrawn !== Math.floor(day)) { recordDay(rd, Math.floor(day)); save(); } S.__lastDayDrawn = Math.floor(day); drawPlant(); }
    else if (Sim.problemLooks && S.__pvHour !== Math.floor(S.t)) { /* v23: once a game hour, redraw when a problem visual changed by a tenth, so symptoms show within the hour instead of at the next day */
      S.__pvHour = Math.floor(S.t); const L = Sim.problemLooks(S); let sig = ''; for (const k in L) sig += (Math.round(L[k] * 10) || 0);
      if (sig !== S.__pvSig) { S.__pvSig = sig; if (!full) drawPlant(); }
    }
    learnTips(rd);
    const pk = rd.plant ? rd.plant.harvestedKg || 0 : 0; if (!pickedLock) setNum($('#picked'), pk.toFixed(2) + ' kg');
    const lb = document.querySelector('[data-act="lights"]'); if (lb) { const tg = info.targets && info.targets.photoperiod; lb.classList.toggle('ready', mode === 'learn' && S.lightHours != null && tg != null && S.lightHours !== tg); }
    dockLabels(); weeklyTip(day);
    const slotsNow = S.slots && Sim.slotInfo && window.Beginner && Beginner.slotReady ? Sim.slotInfo(S) : null; /* v76 (final walk minor): a tower sums its slots, so eight 0.026 kg strawberries glowed Pick before any slot was ready */
    const harvestReady = !rd.cropDone && (slotsNow ? slotsNow.some(x => Beginner.slotReady(S, x)) : ((rd.plant && rd.plant.ripeKg > 0.2) || rd.mature));
    document.querySelector('[data-act="harvest"]').classList.toggle('ready', harvestReady);
    if (rd.cropDone && !endShown) { endShown = true; setSpeed(0); setTimeout(rd.lost ? showLost : showHarvest, 600); } /* [M29] */
  }

  const TIPS = {
    moisture: ['The soil is drying out. Water before the plant wilts, until a little runs out the bottom.', CAT.medium, 'Grow medium'],
    ec: ['EC is how strong your feed is. Too low and the plant goes hungry, too high and the roots burn. Mix feed to raise it, top up with plain water or start a fresh tank to drop it.', CAT.testing, 'EC meters'],
    ph: ['pH decides which nutrients the roots can actually grab. Most plants want it between 5.8 and 6.2. A little pH Down or pH Up nudges it back.', CAT.additives, 'pH Up and Down'],
    airTemp: ['Air temperature drives how fast your plant grows. Too hot and flowers drop, too cold and it stalls. The fan is your best tool here.', CAT.fans, 'Fans and controllers'],
    rh: ['Humidity changes how much the leaves breathe. Too dry and they slow right down, too wet and mould moves in. Try the fan or the mist button.', CAT.fans, 'Climate gear'],
    vpd: ['VPD mixes temperature and humidity into one number for how thirsty the air is. Growers chase it because it tells you how hard the plant is drinking.', CAT.testing, 'Thermo-hygrometers'],
    reservoirL: ['Your tank is running low. Plants drink more as they get bigger and on hot days, so top up before it runs dry.', CAT.nutrients, 'Nutrients'],
    waterTemp: ['Warm tank water holds less oxygen, which is how root rot starts. An air pump and stone help a lot.', CAT.pumps, 'Air pumps']
  };
  /* which button fixes a reading that is off target? */
  function fixFor(k, rd) {
    const r = rd[k], v = r && typeof r === 'object' ? r.value : r, t = (rd.targets || {})[k] || (r && r.target);
    const high = Array.isArray(t) && v != null ? v > t[1] : true;
    switch (k) {
      case 'ec': return high ? 'changeRes' : 'mix';
      case 'ph': return high ? 'phDown' : 'phUp';
      case 'rh': return humRunning(high ? 'dehumidify' : 'humidify') || (high && ((S.setup && S.setup.humMode) || S.__hum || 'off') === 'off') ? 'fan' : 'humidity'; /* off -> humidify would make damp air wetter */
      case 'vpd': return high && !humRunning('humidify') ? 'humidity' : 'fan';
      case 'reservoirL': return 'topUp';
      case 'moisture': return document.querySelector('#dock [data-act="water"]') ? 'water' : 'drip';
      default: return 'fan';
    }
  }
  const FIXNAME = { cover: 'Cover', water: 'Water', feed: 'Feed', drip: 'Drip', shade: 'Shade', changeRes: 'Fresh tank', mix: 'Mix feed', phDown: 'pH down', phUp: 'pH up', humidity: 'Mist', fan: 'Fan', topUp: 'Top up', lights: 'Lights', prune: 'Prune', spray: 'Spray', calibrate: 'pH cal' }; /* v64 (critic round 13 #3): every button Ask Axel can name under More has its dock word, not its id */
  function learnTips(rd) {
    if (!guided() || !rd.status || saying || sayQueue.length) return;
    if (gameHrs() < (S.__tipAfter || 0) || gameHrs() < (S.__tipNext || 0)) return; /* one lesson tip at a time: a day apart, never a run of them */
    for (const k in TIPS) {
      const st = rd.status[k];
      if ((st === 'warn' || st === 'bad') && !seenTips['tip-' + k]) {
        seenTips['tip-' + k] = 1; S.__tipNext = gameHrs() + 24; const [t, l, lt] = TIPS[k], fx = fixFor(k, rd);
        if (window.methodCopy && !window.methodCopy(S).tank && (k === 'ec' || k === 'reservoirL')) { /* v36b: a pot has no tank */
          const back3 = () => { try { const x = S && Sim.readings(S).status; return !x || (x[k] !== 'warn' && x[k] !== 'bad'); } catch (e) { return false; } };
          say(k === 'ec' ? 'EC is how strong the feed is. Too low and the plant goes hungry, too high and the roots burn. Feed to raise it, water it through to drop it.' : 'The root zone is running low. Water it before the plant wilts.', { keep: true, stale: back3 });
          break;
        }
        if (window.methodCopy && window.methodCopy(S).out && (k === 'airTemp' || k === 'rh' || k === 'vpd' || k === 'ph')) { /* v36b: no fan, mist or tank outside: the line names the weather lever (Cover, Shade) or says it is the weather */
          const tt = tileTrouble(), same = tt && tt.k === k, back2 = () => { try { const x = S && Sim.readings(S).status; return !x || (x[k] !== 'warn' && x[k] !== 'bad'); } catch (e) { return false; } };
          const txt = same ? tt.text : (k === 'ph' ? (window.methodCopy(S).how === 'coco' ? 'The pH is off. Tap pH down (or up) a little at a time, wait an hour, then read it again.' : 'Soil holds pH steady, so there is nothing to do. Give it time and a good water.') /* v47 */ : rlab(k)[0] + ' is off. That is the weather, so give it a little time.');
          say(txt, same && tt.ctl && document.querySelector(`#dock [data-act="${tt.ctl}"]`) ? { target: `[data-act="${tt.ctl}"]`, requireClick: true, keep: true, stale: back2 } : { keep: true, stale: back2 });
          break;
        }
        const back = () => { try { const x = S && Sim.readings(S).status; return !x || (x[k] !== 'warn' && x[k] !== 'bad'); } catch (e) { return false; } }; /* the reading is already back in its band: do not tell the player to fix it */
        const hh = hintFor(k, rd), ctl = hh ? hh.ctl : fx; /* the second line names the direction ("Fan up to High: the air is hot"), and is not said at all when the control is already there */
        /* v36: ONE line the first time a tile goes orange or red: it names the button and the direction (hintFor); with no button to push, the tile and a one-sentence why */
        const nm = rlab(k)[0], col = st === 'bad' ? 'red' : 'orange';
        if (ctl && document.querySelector(`#dock [data-act="${ctl}"]`)) say(hh ? endDot(hh.text) : `${nm} is ${col}. Tap ${FIXNAME[fx] || 'the glowing button'}.`, { target: `[data-act="${ctl}"]`, requireClick: true, keep: true, link: l, linkText: lt + ' at HyGrow', stale: back });
        else say(hh && hh.text ? endDot(hh.text) : t.split(/(?<=[.!?])\s/)[0], { target: `[data-reading="${k}"]`, keep: true, link: l, linkText: lt + ' at HyGrow', stale: back });
        break;
      }
    }
  }
  const guided = () => mode === 'learn' || mode === 'live';

  /* --------- grow journal: one record per game day, tiny SVG sparklines --------- */
  function recordDay(rd, d) {
    if (!S) return;
    const j = S.__journal || (S.__journal = []);
    if (j.length && j[j.length - 1].d === d) return;
    const num = v => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 100) / 100 : null;
    const pick_ = k => { const lv = liveVal(k); if (lv != null) return lv; const r = rd[k]; return r && typeof r === 'object' ? r.value : r; };
    let y = 0; try { y = Sim.score(S).yieldKg; } catch (e) { warnOnce('recordDay#1', e); }
    j.push({ d, t: num(pick_('airTemp')), rh: num(pick_('rh')), ec: num(pick_('ec')), ph: num(pick_('ph')), y: num(y) });
    if (j.length > 400) j.shift();
  }
  const JSER = [['t', 'Air temp', '°C', 1, '#ec8024'], ['rh', 'Humidity', '%', 0, '#6fc3e8'], ['ec', 'EC', 'mS/cm', 2, '#f2b950'], ['ph', 'pH', '', 1, '#c58bff'], ['y', 'Yield so far', 'kg', 2, '#6ec846']];
  function spark(pts, color, label) {
    const W = 300, H = 46, P = 4, v = pts.filter(p => p[1] != null);
    if (v.length < 2) return `<svg viewBox="0 0 ${W} ${H}" class="spark" role="img" aria-label="Not enough days yet"><text x="${W / 2}" y="${H / 2 + 4}" text-anchor="middle" fill="#a9b3a9" font-size="11">Not enough days yet</text></svg>`;
    const x0 = v[0][0], x1 = v[v.length - 1][0], lo = Math.min(...v.map(p => p[1])), hi = Math.max(...v.map(p => p[1])), sp = hi - lo || 1;
    const X = d => P + (x1 === x0 ? 0 : (d - x0) / (x1 - x0)) * (W - 2 * P), Y = a => H - P - ((a - lo) / sp) * (H - 2 * P);
    const path = v.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
    const l = v[v.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark" role="img" aria-label="${escH(label || 'Chart over ' + v.length + ' days')}"><path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path d="M${X(l[0]).toFixed(1)} ${Y(l[1]).toFixed(1)}h.01" stroke="${color}" stroke-width="8" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function showJournal() {
    if (!S) return;
    const j = S.__journal || [], wasSpeed = speed, pl = S.__plog || [];
    const probs = pl.length ? '<h3>Problems spotted</h3><ul class="plog">' + pl.slice(-12).reverse().map(p => `<li><b>Day ${p.d}</b> ${escH(p.title) /* v49 [m6]: the one escape */}</li>`).join('') + '</ul>' : '';
    const aw = S.__awayLog || [], away = aw.length ? '<h3>Time away</h3><ul class="plog">' + aw.slice(-6).reverse().map(a => `<li><b>Day ${+a.d || 0}</b> away ${+a.realH || 0} h by the clock; Axel minded ${+a.gameH || 0} h${(+a.realH || 0) > (+a.gameH || 0) ? ' (the most he covers)' : ''}</li>`).join('') + '</ul>' : '';
    $('#journalBody').innerHTML = ecoHtml(Sim.score(S)) + probs + away + (j.length < 2 /* [M33] */ ? '<p class="tip">Axel jots something down every game day. Check back after a couple of days.</p>' :
      JSER.map(([k, lab, unit, d, col]) => {
        const pts = j.map(r => [r.d, r[k]]), vv = pts.filter(p => p[1] != null).map(p => p[1]);
        const range = vv.length ? `${fmt(Math.min(...vv), d)}–${fmt(Math.max(...vv), d)}` : 'no meter';
        return `<div class="jrow"><div class="jhead"><b>${lab}</b><span>${vv.length ? fmt(vv[vv.length - 1], d) + ' ' + unit : '???'}<small> range ${range}</small></span></div>${spark(pts, col)}</div>`;
      }).join('') + `<p class="tentline">${j.length} days recorded, day ${j[0].d} to day ${j[j.length - 1].d}.</p>`);
    $('#journal').dataset.speed = wasSpeed; setSpeed(0); $('#journal').classList.add('show');
  }
  function closeJournal() { const sp = +($('#journal').dataset.speed || 1); $('#journal').classList.remove('show'); if (S && !endShown) setSpeed(sp); }

  /* --------- live link --------- */
  function liveNotes() {
    if (mode !== 'live' || !live || live.offline || !live.row || !S) return [];
    const r = live.row, t = Sim.stageInfo(S).targets || {}, out = [];
    const rg = a => `${fmt(a[0], 1)}–${fmt(a[1], 1)}`;
    if (typeof r.ph === 'number' && t.ph) {
      if (r.ph > t.ph[1] + 0.1) out.push({ key: 'ph', text: `Your real tank pH is ${fmt(r.ph, 1)}. This stage wants ${rg(t.ph)}, so bring it down with a little pH Down.`, cat: CAT.additives, linkText: 'pH Down at HyGrow' });
      else if (r.ph < t.ph[0] - 0.1) out.push({ key: 'ph', text: `Your real tank pH is ${fmt(r.ph, 1)}. This stage wants ${rg(t.ph)}, so nudge it up with a little pH Up.`, cat: CAT.additives, linkText: 'pH Up at HyGrow' });
    }
    if (typeof r.ec_mscm === 'number' && t.ec) {
      if (r.ec_mscm > t.ec[1] + 0.2) out.push({ key: 'ec', text: `Your real tank EC is ${fmt(r.ec_mscm, 1)}. This stage wants ${rg(t.ec)}, so top up with plain water to ease it down.`, cat: CAT.testing, linkText: 'EC meters at HyGrow' });
      else if (r.ec_mscm < t.ec[0] - 0.2) out.push({ key: 'ec', text: `Your real tank EC is ${fmt(r.ec_mscm, 1)}. This stage wants ${rg(t.ec)}, so the plants are going hungry. Add some feed.`, cat: CAT.nutrients, linkText: 'Nutrients at HyGrow' });
    }
    if (typeof r.water_temp_c === 'number' && t.rootTemp) {
      if (r.water_temp_c > t.rootTemp[1] + 1) out.push({ key: 'wt', text: `Your real tank water is ${fmt(r.water_temp_c, 0)} °C. Roots want ${rg(t.rootTemp)}. Warm water holds less oxygen, so add an air stone or a chiller.`, cat: CAT.pumps, linkText: 'Air pumps and chillers' });
      else if (r.water_temp_c < t.rootTemp[0] - 1) out.push({ key: 'wt', text: `Your real tank water is ${fmt(r.water_temp_c, 0)} °C. Roots want ${rg(t.rootTemp)}. A heat mat under the tank helps.`, cat: CAT.propagation, linkText: 'Heat mats at HyGrow' });
    }
    return out;
  }
  function liveAdvice() { liveNotes().forEach(n => { if (!seenRecently('live-' + n.key)) say(n.text, { link: n.cat, linkText: n.linkText }); }); }
  function showOffline(on, text) {
    const b = $('#offline'); if (!b) return;
    b.hidden = !on; if (text) $('#offtext').textContent = text;
    $('#relink').hidden = !(on && mode === 'live' && !live);
  }
  function onLiveReading(row) {
    if (!live) return;
    live.row = row; const was = live.offline; live.offline = false;
    if (S && mode === 'live' && Sim.attachClimate) { try { Sim.attachClimate(S, [row]); } catch (e) { console.warn(e); } }
    if (was) { showOffline(false); if (S) say('Sensor\u2019s back. Reading your real tent again.', { auto: true }); }
    if (S) { liveAdvice(); render(false); }
  }
  function onLiveStatus(st) {
    if (!live) return;
    if (st === 'stale' || st === 'error') {
      if (!live.offline) { live.offline = true; if (S && Sim.detachClimate) { try { Sim.detachClimate(S); } catch (e) {} } showOffline(true, 'Sensor offline \u2014 using the model until it\u2019s back'); if (S) render(false); }
    }
  }
  function hookLive(link) {
    stopLive();
    live = { link, row: null, offline: false, chip: null };
    const c = LiveLink.chip(link); live.chip = c; const box = $('#livechip'); box.innerHTML = ''; box.appendChild(c); box.hidden = false;
    link.onStatus = onLiveStatus;
    link.start(onLiveReading);
  }
  function enterLive() {
    if (!live) { showOffline(true, 'Live link isn\u2019t connected \u2014 using the model.'); return; }
    if (live.offline) { showOffline(true, 'Sensor offline \u2014 using the model until it\u2019s back'); return; } /* a link that was already stale when the tent opened keeps its bar */
    showOffline(false);
    if (live.row && Sim.attachClimate) { try { Sim.attachClimate(S, [live.row]); } catch (e) { console.warn(e); } }
  }
  function stopLive() {
    if (live) { try { live.link.onStatus = null; live.link.stop(); } catch (e) {} try { live.chip && live.chip.destroy(); } catch (e) {} }
    live = null; const box = $('#livechip'); if (box) { box.innerHTML = ''; box.hidden = true; } showOffline(false);
  }
  /* v36: Live link is one of the few things left in More. Connect a real sensor to the grow that is running. */
  function goLive() {
    Mob.closeSheet(); Sfx.play('click');
    if (!window.LiveLink) { toast('The live link tool is still loading. Try again in a moment.', 3000); return; }
    if (!S || camp || mode === 'beginner') { toast(mode === 'beginner' ? 'Live link opens once the first jobs are done.' : 'Start a grow first, then connect your sensor.', 3200); return; }
    LiveLink.open(link => { mode = 'live'; hookLive(link); enterLive(); toast('Live link is on. The air and light now come from your room.', 3200); });
  }
  function reconnect() {
    if (!window.LiveLink) return;
    LiveLink.open(link => { hookLive(link); showOffline(false); if (S && mode === 'live') say('Live link is back on. I\u2019m watching your real tent again.', { auto: true }); });
  }

  function continueGame(j) {
    /* load into locals first: a save that fails half way must not leave a broken sim ticking behind the title */
    let S2 = null, pick2 = null;
    try {
      if (!j || !j.pick || !j.pick.crop) throw new Error('no pick'); pick2 = j.pick; const ex = j.extra || {};
      S2 = Sim.deserialize(j.sim); Object.assign(S2, { __cost: ex.cost, __fan: ex.fan, __hum: ex.hum, __refills: ex.refills || 0, __rot: ex.rot, __tipWeek: ex.tw, __tipIdx: ex.ti });
      if (!window.CROP_DATA || !CROP_DATA[S2.cropId]) throw new Error('unknown crop');
    } catch (e) { quarantineSave(); showTitle(); try { toast('Your last save could not be read; it is kept and the game starts fresh.', 4500); } catch (e2) { warnOnce('continueGame#1', e2); } return; }
    pick = pick2; normPick(); mode = j.mode; S = S2;
    camp = null; if (window.Campaign) { Campaign.clear(); if (j.camp && Campaign.load(j.camp)) { camp = {}; Campaign.attach(S); campLend = j.lend || null; if (campLend) Campaign.applyLend(S, campLend); } }
    if (window.Story && j.story && Story.load) Story.load(j.story);
    if (window.Cart && Array.isArray(j.cart) && j.cart.length && !(Cart.toJSON() || []).length) Cart.load(j.cart); /* the cart's own key is written on every add, so it is never older than the save: only fill an empty cart from the save */
    S.__cartRef = S.refills || 0;
    flushSay(); seenTips = {}; fanHoldUntil = 0; noMeterTold = true; const wasPaused = !!(j.extra && j.extra.p); setSpeed(wasPaused ? 0 : 1); if (wasPaused) V36B.userPaused(true); guardSt = speedGuardNew(); /* v49 (play-test #8 trace): a grow saved while paused comes back paused */ endShown = false; stopLive(); S.__journal = S.__journal || []; histReset();
    if (!pick || !cropOf(pick.crop) || !window.CROP_DATA || !CROP_DATA[S.cropId]) { quarantineSave(); showTitle(); try { toast('Your last save could not be read; it is kept and the game starts fresh.', 4500); } catch (e2) { warnOnce('continueGame#2', e2); } return; }
    if (mode === 'live') { S.replay = null; }
    $('#title').classList.remove('show'); titleBgOff(); Sfx.init(); Sfx.music(true, 'grow'); Sfx.ambience('tent'); try { Sfx.music(true, 'grow', { stage: Sim.stageInfo(S).index }); Sfx.ambienceParam('fan', (S.__fan ?? 2) / 3); Sfx.ambienceParam('mist', ((S.setup && S.setup.humMode) || S.__hum) === 'humidify' ? 1 : 0); Sfx.ambienceParam('season', S.setup && S.setup.season); } catch (e) { warnOnce('continueGame#3', e); }
    scene.setMedium(S.setup && S.setup.medium || 'coco'); buildDock(); stageForMethod(); dockLabels();
    say(`Welcome back! Day ${Math.floor(Sim.readings(S).day)} and your ${cropOf(pick.crop).name.toLowerCase()} is waiting.${wasPaused ? ' Paused where you left it: tap 1x to carry on.' : ''}`, { wave: true, auto: true });
    if (mode === 'live') { showOffline(true, 'Live link isn\u2019t connected \u2014 using the model. Reconnect to use your real tent again.'); }
    prevSev = null; gaugeReset(); render(true); SoundChip.show(); if (window.Away) Away.check(j.savedAt); setTimeout(() => Mob.swipeHint(), 900);
  }
  /* Grow with Axel "Continue": beginner.js has just run startWith() (mode 'beginner'); swap the sim it built for the saved one. Same restore as continueGame, but nothing else (no Campaign, no Cart, no Away, no welcome bubble: Axel's lesson does the talking). Returns false when the blob will not load. */
  function restoreLesson(j) {
    if (mode !== 'beginner' || !j || !j.sim) return false;
    let S2 = null;
    try {
      S2 = Sim.deserialize(j.sim); const ex = j.extra || {};
      Object.assign(S2, { __cost: ex.cost, __fan: ex.fan, __hum: ex.hum, __refills: ex.refills || 0, __rot: ex.rot, __tipWeek: ex.tw, __tipIdx: ex.ti });
      if (!window.CROP_DATA || !CROP_DATA[S2.cropId]) return false;
    } catch (e) { return false; }
    S = S2; fanHoldUntil = 0; S.__cartRef = S.refills || 0; S.__journal = S.__journal || []; S.__tipAfter = gameHrs() + 30;
    histReset(); endShown = false; scene.setMedium(S.setup && S.setup.medium || 'coco'); buildDock(); stageForMethod(); dockLabels(); prevSev = null; gaugeReset(); render(true);
    return true;
  }
  /* --------- title --------- */
  /* v36: Axel's one line on the title. Typed a word at a time; a tap anywhere finishes it. */
  let tsTimer = 0, tsWords = [], tsAt = 0;
  function titleSay(text) {
    const el = $('#titleBubble'); if (!el || !text) return;
    clearTimeout(tsTimer); tsWords = String(text).split(' '); tsAt = 0; el.textContent = '';
    const tick = () => { if (tsAt < tsWords.length) { el.textContent += (tsAt ? ' ' : '') + tsWords[tsAt++]; tsTimer = reduceMotion() ? 0 : setTimeout(tick, 35); if (reduceMotion()) tick(); } else tsTimer = 0; };
    tick();
    try { if (!(window.Voice && Voice.say('axel', text))) Sfx.play('voiceAxel', { syllables: Math.min(9, 2 + Math.round(tsWords.length / 4)), seed: text.length, pitch: 1 }); } catch (e) {}
    try { tq && tq.wave(1600); } catch (e) {}
  }
  document.addEventListener('click', () => { const el = $('#titleBubble'); if (el && tsTimer && tsAt < tsWords.length) { clearTimeout(tsTimer); tsTimer = 0; el.textContent = tsWords.join(' '); tsAt = tsWords.length; } }, true);
  let tq = null;
  function showTitle() {
    stopLive(); const j = loadSave();
    { const sg = $('#slotStrip'); if (sg) sg.classList.remove('on'); } /* v55 (round 8 #2): the tower strip stays .on after Grow again, and its rule pinned the install chip over the title heading */
    if (saveNote) { const n = saveNote; saveNote = ''; try { toast(n === 'future' ? 'That save is from a newer version of the game, so it is kept safe and not opened here.' : 'That save would not open, so it is kept safe and the game starts fresh.', 5000); } catch (e) { warnOnce('showTitle save note', e); } }
    if (window.Daily) Daily.mountTitle($('#title'));
    if (window.Events) Events.mountTitle($('#title'));
    if (window.Beginner) Beginner.mountTitle($('#title'));
    /* v36: Continue shows for a saved grow, or for lesson progress when there is no save (then it resumes the lesson) */
    const lessonStep = (window.Beginner && Beginner.progressStep) ? Beginner.progressStep() : 0, cb = $('#continue');
    cb.hidden = !j && !(lessonStep > 0);
    if (j) { cb.textContent = 'Continue my grow'; cb.onclick = () => { Sfx.init(); Sfx.play('click'); continueGame(loadSave() || j); }; } /* re-read on tap: another tab may have saved since the title was drawn */
    else if (lessonStep > 0) { cb.textContent = Beginner.titleCopy(false, lessonStep, Beginner.progressTotal ? Beginner.progressTotal() : undefined).title; cb.onclick = () => { Sfx.init(); Sfx.play('click'); Beginner.start(); }; }
    try { const v = window.HYGROW_VERSION, ve = $('#verLine'); if (ve && v) ve.textContent = growSimVer(v); } catch (e) { warnOnce('showTitle#1', e); }
    { const hv = $('#harvest'); if (hv) hv.classList.remove('show'); } /* v66 (play-test #18 m1): Back to the title after the lesson showed the harvest report over the title */
    $('#title').classList.add('show');
  }
  /* v49 (play-test #8): a tap on the weekly challenge chip replaced a day-30 lettuce with no warning. Any start that overwrites a live save asks first. */
  function liveSaveInfo() {
    try {
      const j = loadSave(); if (!j || !j.sim || !j.pick || !j.pick.crop || j.mode === 'beginner') return null;
      const S2 = Sim.deserialize(j.sim), rd = Sim.readings(S2);
      if (!(rd.day >= 1) || rd.cropDone || S2.lost) return null;
      const c = cropOf(j.pick.crop);
      return { day: Math.floor(rd.day), crop: c ? c.name.toLowerCase() : 'plant', camp: !!j.camp };
    } catch (e) { warnOnce('liveSaveInfo', e); return null; }
  }
  function askReplace(info, what, go) {
    const old = $('#askReplace'); if (old) old.remove();
    const d = document.createElement('div'); d.className = 'modal show small'; d.id = 'askReplace'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Replace your grow?');
    d.innerHTML = `<div class="card"><h2>Replace your grow?</h2><p>Your ${escH(info.crop)} is on day ${info.day}${info.camp ? ' of a campaign chapter' : ''}. ${escH(what)} starts a new grow in its place, and the old one is gone.</p><div class="foot"><button class="big" type="button" id="arKeep" data-c="close">Keep my grow</button><button class="ghost" type="button" id="arGo">Start the new one</button></div></div>`;
    document.body.appendChild(d);
    const close = () => { d.remove(); document.removeEventListener('keydown', onK, true); };
    const onK = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); Sfx.play('click'); close(); } };
    document.addEventListener('keydown', onK, true);
    d.querySelector('#arKeep').onclick = () => { Sfx.play('click'); close(); };
    d.querySelector('#arGo').onclick = () => { close(); go(); };
    setTimeout(() => { try { d.querySelector('#arKeep').focus({ preventScroll: true }); } catch (e) {} }, 30);
  }
  const REPLACE_WHAT = { challenge: 'The weekly challenge', free: 'A free grow', learn: 'A new grow', live: 'A live-link grow' };
  function chooseMode(m, sure) {
    Sfx.init(); Sfx.play('click'); if (m === 'campaign') { openCampaignMenu(); return; }
    if (!sure && REPLACE_WHAT[m]) { const li = liveSaveInfo(); if (li) { askReplace(li, REPLACE_WHAT[m], () => chooseMode(m, true)); return; } }
    if (m === 'challenge' && window.Challenge) { Challenge.start(); return; }
    if (m === 'beginner' && window.Beginner && Beginner.hasProgress && Beginner.hasProgress()) { Beginner.start(); return; }
    if (m === 'grow') m = 'beginner'; /* v36: "Start growing" = pick the place and the way, then the method script runs (beginner.js) */
    camp = null; if (window.Campaign) Campaign.clear(); mode = m; replay = null; seenTips = {}; flushSay(); S = null; stopLive();
    if (m === 'live') {
      if (!window.LiveLink) { say('The live link tool is still loading. Try again in a moment.'); return; }
      LiveLink.open(link => { $('#title').classList.remove('show'); hookLive(link); say('Connected! Now pick the plant and gear that match your tent.', { hop: true, auto: true }); showSetup(); });
      return;
    }
    if (m === 'mysetup') {
      if (!window.CsvImport) { say('The import tool is still loading. Try again in a moment.'); return; }
      CsvImport.open(data => { $('#title').classList.remove('show'); replay = data; say(`Got it: ${data.stats && data.stats.count || data.rows.length} readings from your setup. Now pick the gear that matches your tent.`, { hop: true }); showSetup(); });
      return;
    }
    $('#title').classList.remove('show');
    showSetup();
  }
  /* --------- loop --------- */
  /* SPEEDTAP:start (pure, no DOM: tests/pass7.test.js runs this block on its own)
     What a tap on the speed row does. c = { fanHold, talking, pauseTold }. Returns { speed (null = leave it), toast }: a refused 3x/8x says why, and Pause says how to carry on (once per session). */
  function speedTapPlan(s, c) {
    if (s === 0) return { speed: 0, toast: c.pauseTold ? null : 'Paused. Tap 1x to carry on.' };
    if (s > 1 && c.fanHold) return { speed: 1, toast: 'Holding 1x while the air settles' };
    if (s > 1 && c.talking) return { speed: s, toast: "Finish Axel's line first. The clock waits while he talks, then runs at " + s + 'x.' };
    return { speed: s, toast: null };
  }
  /* SPEEDTAP:end */
  /* SHEETGUARD:start (pure, no DOM: tests/pass7.test.js runs this block on its own)
     A sheet or modal is open (More sheet, Journal, Almanac, cart drawer, learned card, harvest, menu): a 3x/8x clock drops to 1x, and the speed the player had comes back when it closes,
     unless they chose another speed meanwhile. st = { was: a sheet was open last frame, prev: the speed to give back (0 = none) }. Returns { speed, toast } or null. */
  function sheetGuardStep(st, up, speed) {
    if (up && !st.was) { st.was = true; st.prev = speed > 1 ? speed : 0; return speed > 1 ? { speed: 1, toast: null } : null; }
    if (!up && st.was) { st.was = false; const p = st.prev; st.prev = 0; if (p && speed === 1) return { speed: p, toast: 'Back to ' + p + 'x' }; }
    return null;
  }
  /* SHEETGUARD:end */
  const sheetSt = { was: false, prev: 0 };
  const sheetUp = () => !!document.querySelector('.modal.show, #actionbar.open, #learnCard.in');
  let fanHoldUntil = 0, holdDropped = false, pauseTold = false; /* fanHoldUntil: game hour until which 3x/8x are held at 1x after a Fan Off tap */
  const fanHeld = () => { if (!(fanHoldUntil > 0) || !S) return false; try { return gameHrs() < fanHoldUntil; } catch (e) { return false; } };
  function setSpeed(s) { if (s > 1 && fanHeld()) s = 1; speed = s; document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.s === s)); }
  /* SPEEDGUARD:start (pure, no DOM: tests/pass6.test.js and tests/pass8.test.js run this block on their own)
     3x and 8x fall back to 1x, with a toast, when the tiles on screen show real trouble. Pass 8b (docs/PLAYTEST-DEV-v34.md friction 1): the guard used the engine's status, so a 1 C miss (Air 25 against 26 to 30, or 21 against "18 to 21")
     killed 3x and 8x. Now it uses the tile colours with a small slack: a band is inclusive with +-0.5 C, +-0.05 EC, +-0.05 pH, +-2 % RH on the edges, and it only trips when
     a reading is RED, or ORANGE for 2 game hours running, or Health falls 5 points in a game hour. The toast names every offending tile. After a trip it re-arms only when every tile is green for 1 game hour.
     Grow with Axel (beginner.js) uses the same helper through window.SpeedGuard. */
  const GUARD_NAME = { ec: 'EC', ph: 'pH', airTemp: 'Air', rh: 'Humidity', vpd: 'VPD', waterTemp: 'Water temp', reservoirL: 'Tank', moisture: 'Soil' }; /* v71 (play-test #21 M1): a red Soil or Coco tile holds the clock too */ /* v52 (play-test #10 #4): Water alone read like a job on a tub */
  const gName = k => (k === 'reservoirL' && S && S.pot) ? 'Water' : (k === 'moisture' && typeof S !== 'undefined' && S && S.method && S.method.how === 'coco') ? 'Coco' : GUARD_NAME[k]; /* v51 (critic round 5): pots have no tank */
  const GUARD_SLACK = { ec: 0.05, ph: 0.05, airTemp: 0.5, waterTemp: 0.5, rh: 2, vpd: 0.05 };
  const GUARD_ORANGE_HOURS = 2, GUARD_REARM_HOURS = 1, GUARD_HEALTH_DROP = 5, GUARD_RED_AGAIN = 6;
  /* the colour a tile shows for reading v against band tg when the engine says st: inside the band plus its slack is green, otherwise the engine's colour */
  function guardColour(k, v, tg, st) {
    if (st !== 'warn' && st !== 'bad') return st;
    const sl = GUARD_SLACK[k];
    if (sl != null && typeof v === 'number' && isFinite(v) && Array.isArray(tg) && v >= tg[0] - sl - 1e-9 && v <= tg[1] + sl + 1e-9) return 'good';
    return st;
  }
  /* the readings object (Sim.readings) -> a colour function k -> 'good' | 'warn' | 'bad' | ... for the guard and the lesson */
  function guardFix(rd) {
    return (k, st) => { const r = rd && rd[k], v = r && typeof r === 'object' ? r.value : r, tg = ((rd && rd.targets) || {})[k] || (r && typeof r === 'object' ? r.target : null); return guardColour(k, v, tg, st); };
  }
  /* every on-screen tile that is orange or red (after the slack), in tile order; the result also carries the first one as k / key / txt. fix = optional colour function (guardFix) */
  function speedGuardPick(status, shown, fix) {
    const st = status || {}, all = [];
    for (const k of Object.keys(GUARD_NAME)) {
      if (!shown(k)) continue;
      let s = st[k];
      if (s !== 'warn' && s !== 'bad') continue;
      if (k === 'moisture' && s !== 'bad') continue; /* v71: a pot is orange for days between waterings and after each one, so only red counts */
      if (fix) s = fix(k, s);
      if (s === 'warn' || s === 'bad') all.push({ k, s, key: k + ':' + s, txt: gName(k) + ' is ' + (s === 'bad' ? 'red' : 'orange') });
    }
    return all.length ? Object.assign({ all }, all[0]) : null;
  }
  const speedGuardNew = () => ({ since: {}, tripped: false, green: null, hist: [] });
  const guardList = n => n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  /* "Air and Humidity are orange" / "Air is red, Humidity is orange" / "Health is falling fast" */
  function guardToast(off, health) {
    const col = t => (t.s === 'bad' ? 'red' : 'orange');
    let txt = '';
    if (off.length) {
      const cs = off.map(col).filter((c, i, a) => a.indexOf(c) === i);
      txt = cs.length === 1 ? guardList(off.map(t => gName(t.k))) + (off.length > 1 ? ' are ' : ' is ') + cs[0] : off.map(t => gName(t.k) + ' is ' + col(t)).join(', ');
    }
    if (health) txt += (txt ? ', and ' : '') + 'Health is falling fast';
    return txt;
  }
  /* one look at the tiles. g = the guard's state, pick = speedGuardPick(...) or null, gh = game hours, health = 0..100 or null, fast = the clock is at 3x or 8x.
     Returns null, or { txt, tiles, health } when the clock should drop to 1x (the caller says "Slowed down: " + txt). Call it on every render, also at 1x: the clocks it keeps run all the time. */
  function speedGuardStep(g, pick, gh, health, fast) {
    const all = pick ? pick.all : [];
    all.forEach(t => { if (g.since[t.k] == null) g.since[t.k] = gh; });
    Object.keys(g.since).forEach(k => { if (!all.some(t => t.k === k)) delete g.since[k]; });
    let drop = false;
    if (typeof health === 'number' && isFinite(health)) {
      const last = g.hist[g.hist.length - 1];
      if (!last || gh < last.gh) g.hist = [{ gh, h: health }];
      else if (gh > last.gh) { g.hist.push({ gh, h: health }); while (g.hist.length > 4) g.hist.shift(); }
      for (let i = 0; i < g.hist.length - 1; i++) { const p = g.hist[i], dt = gh - p.gh; if (dt > 0 && dt <= 3 && (p.h - health) / Math.max(1, dt) >= GUARD_HEALTH_DROP) drop = true; }
    }
    if (!all.length) { if (g.green == null) g.green = gh; } else g.green = null;
    if (g.tripped) { if (g.green != null && gh - g.green >= GUARD_REARM_HOURS) { g.tripped = false; g.n = 1; g.hAt = null; return null; } const reds = all.filter(t => t.s === 'bad'); const sank = typeof health === 'number' && typeof g.hAt === 'number' && g.hAt - health >= 10; /* v74 (play review on v73 m1): a crop still losing health is slowed again at once */ if (fast && reds.length && g.at != null && (sank || gh - g.at >= GUARD_RED_AGAIN * (g.n || 1))) { g.at = gh; g.hAt = health; g.n = sank ? 1 : Math.min(8, (g.n || 1) * 2); /* v73 (play review m1): back off 6, 12, 24, 48 h */ return { txt: guardToast(reds, false), tiles: reds, health: false }; } return null; } /* v72 (play-test #22 m2): a tile still red 6 game hours after a slowdown slows a re-tapped 3x or 8x again */
    if (!fast) return null;
    const off = all.filter(t => t.s === 'bad' || gh - g.since[t.k] >= GUARD_ORANGE_HOURS);
    if (!off.length && !drop) return null;
    g.tripped = true; g.green = null; g.at = gh; g.hAt = (typeof health === 'number' && isFinite(health)) ? health : null; /* v75 (play review on v74 n1): each episode starts from its own health */
    return { txt: guardToast(off, drop), tiles: off, health: drop };
  }
  /* SPEEDGUARD:end */
  let guardSt = speedGuardNew(), hint8 = false;
  window.SpeedGuard = { names: GUARD_NAME, slack: GUARD_SLACK, colour: guardColour, fix: guardFix, pick: speedGuardPick, create: speedGuardNew, step: speedGuardStep, toast: guardToast };
  function speedGuard(rd) {
    if (!S || mode === 'beginner' || !rd) return;
    const b = speedGuardPick(rd.status, k => { const r = rd[k], v = r && typeof r === 'object' ? r.value : r; return v != null && tileKeys().indexOf(k) >= 0; }, guardFix(rd)); /* v56 (play-test #12 #9): only readings this grow tiles */
    const gh = (rd.day ?? S.day ?? 0) * 24 + (rd.hour ?? S.hour ?? 0), hv = rd.health && typeof rd.health === 'object' ? rd.health.value : rd.health;
    const r = speedGuardStep(guardSt, b, gh, hv, speed >= 3);
    if (!r) return;
    setSpeed(1); toast('Slowed down: ' + r.txt, 3200); sheetSt.prev = 0; /* a sheet that closes later must not hand 8x back over an orange tile */
  }
  /* after a Fan Off tap the tent swings from cold to hot in a couple of game hours: 3x and 8x stay at 1x until the air has settled (2 game hours) */
  function fanHoldTick(rd) {
    if (!(fanHoldUntil > 0) || !S || !rd) return;
    const gh = (rd.day ?? S.day ?? 0) * 24 + (rd.hour ?? S.hour ?? 0);
    if (gh >= fanHoldUntil) fanHoldUntil = 0; else if (speed > 1) setSpeed(1);
  }
  /* the first 8x tap ever says what the guard will do */
  function tell8() {
    if (hint8 || mode === 'beginner') return; hint8 = true;
    try { if (localStorage.getItem('hygrow_8x_hint_v1')) return; localStorage.setItem('hygrow_8x_hint_v1', '1'); } catch (e) {}
    toast('8x: the clock drops back to 1x if anything goes orange.', 3600);
  }
  /* mobile / low-core devices: render at ~30 fps (sim stays time-based, so game speed is unchanged); nothing runs while the tab is hidden */
  const mqSmall = window.matchMedia ? window.matchMedia('(max-width: 899px)') : { matches: false };
  const capFps = () => mqSmall.matches || (navigator.hardwareConcurrency || 8) <= 4;
  let lastRun = 0, frames = 0, cardUp = false;
  /* a "You just learned" card (cards.js, #learnCard.in) and Axel's bubble never stack: the bubble (and its spotlight) steps out of the way until the card closes.
     body.card-up and #bubble.bub-min are there for the stylesheet; the inline hide below works on its own. */
  function syncCardUp() {
    const lc = document.getElementById('learnCard'), up = !!(lc && lc.classList.contains('in'));
    if (up === cardUp) return; cardUp = up;
    const bb = $('#bubble'); if (bb) { bb.classList.toggle('bub-min', up); bb.style.display = up ? 'none' : ''; }
    if (spotRoot) spotRoot.style.visibility = up ? 'hidden' : '';
    document.body.classList.toggle('card-up', up);
  }
  /* v41 [perf] one bad frame never ends the loop: it logs once, the next frame runs; the same error 5 frames running pauses the clock, saves and says so */
  let loopErrN = 0, loopErrMsg = '', loopWarned = false;
  let barWatchAt = 0;
  function loop(t) {
    if (t - barWatchAt > 500) { barWatchAt = t; try { Mob.syncBar(); } catch (e) {} } /* v49 (critic #1): the ResizeObserver missed the dock growing after the lesson, so the pager dots sat on the first dock row; a half-second watch keeps --barh honest */
    try { loopBody(t); loopErrN = 0; loopErrMsg = ''; } catch (e) {
      const m = String((e && e.message) || e); loopErrN = m === loopErrMsg ? loopErrN + 1 : 1; loopErrMsg = m;
      if (!loopWarned || loopErrN === 1) { loopWarned = true; try { console.warn('frame error (the next frame still runs):', e); } catch (e2) {} }
      if (loopErrN >= 5) { loopErrN = 0; try { setSpeed(0); save(); toast('Something went wrong; the game is paused and your grow is saved', 6000); } catch (e3) {} }
      requestAnimationFrame(loop);
    }
  }
  function loopBody(t) {
    if (document.hidden) { last = 0; requestAnimationFrame(loop); return; }
    if (capFps() && t - lastRun < 30) { requestAnimationFrame(loop); return; }
    lastRun = t; frames++;
    const dt = Math.min(100, t - (last || t)); last = t;
    quinn.update(t); scene.update(t, dt);
    placeSpot();
    if (S && mode !== 'beginner') { const sg = sheetGuardStep(sheetSt, sheetUp(), speed); if (sg) { setSpeed(sg.speed); if (sg.toast) toast(sg.toast, 2200); } } /* the clock never runs at 3x/8x behind a sheet (Journal and Almanac used to sit over 6 game days of falling Health) */
    syncCardUp();
    const held = holding(), sheetH = V36B.sheetHold(); /* v36b: the clock also waits behind Almanac, Journal, Grower's card and the More sheet, and carries on when they close */
    V36B.holdWatch();
    try { if (window.Goals) Goals.tick(S); } catch (e) { warnOnce('loopBody#1', e); }
    const pt = $('#pausedtag'), ph0 = !(S && held && speed > 0); if (pt && pt.hidden !== ph0) pt.hidden = ph0; /* v67: no write every frame */
    if (S && speed > 0 && !held && !sheetH) {
      acc += dt * speed;
      const msPerHour = 1050; /* 1x = one in-game day per 25 s */
      let n = 0;
      while (acc >= msPerHour && n < 48 && !holding() && !V36B.sheetHold()) {
        acc -= msPerHour; n++;
        let r; try { r = Sim.tick(S, 1); } catch (e) { console.warn(e); r = null; }
        if (r) { if (r.state) S = r.state; handleEvents(r.events); trackRefill(); if (camp && S && window.Campaign) Campaign.onTick(S, campHooks(), (r.events || []).map(e => e.id)); }
        if (endShown) break;
      }
      if (n) render(false);
    }
    requestAnimationFrame(loop);
  }

  /* --------- harvest --------- */
  /* v37 [M33]: the Eco score and the four parts the player steers, 25 each; the numbers add up to the header number */
  function ecoHtml(sc) {
    if (!document.getElementById('ecoCss')) { const st = document.createElement('style'); st.id = 'ecoCss'; st.textContent = '.ecobox{margin:10px 0}.ecorow{display:grid;grid-template-columns:78px 1fr 58px;gap:2px 8px;align-items:center;margin:6px 0}.ecorow i{display:block;height:10px;background:#333;border-radius:6px;overflow:hidden}.ecorow u{display:block;height:100%;background:var(--green,#6ec846);border-radius:6px}.ecorow span{font-size:13px;text-align:right}.ecorow small{grid-column:2/4;color:var(--muted,#a9b3a9);font-size:12px}.lost-end .lost-why{font-size:17px}'; document.head.appendChild(st); } /* [M33] */
    const ep = sc.ecoParts || {}, rows = [['Water', ep.water, 'Plants drank it instead of it running to waste.'], ['Feed', ep.feed, 'Hours the feed strength sat in its band.'], ['No spray', ep.spray, 'Days without a pest spray. Bait and hand-picking are fine.'], ['Climate', ep.climate, 'Shade before heat, cover before frost, fan not flat out.']];
    return `<div class="ecobox"><h3>Eco score ${Math.round(sc.eco ?? 0)} out of 100</h3><p class="tip">Four parts, 25 each. It follows what you do, not the season.</p>` +
      rows.map(r => `<div class="ecorow"><b>${r[0]}</b><i><u style="width:${Math.round((r[1] || 0) * 4)}%"></u></i><span>${r[1] ?? 0} / 25</span><small>${r[2]}</small></div>`).join('') + '</div>';
  }
  /* v60 (play-test #14 #7): a kit with no meter for the cause has no tile to watch, so the advice names what the player can see */
  const LOST_NOMETER = { ec: 'Next time, feed little and often, and give plain water when the leaf tips brown or Axel says the feed is strong.', ph: 'Next time, check the pH each time you feed (a pH pen helps), nudge it one step and look again an hour later.' };
  const LOST_ADVICE = { /* v49 (critic #8): the advice on the Lost card follows the cause (S.lost.key from engine.js loseCrop) */
    moisture: 'Next time, act when the water tile turns orange: a small drink early beats a flood late.', reservoirL: 'Next time, top the tank up when its tile turns orange, before the pump sucks air.',
    ec: 'Next time, feed little and often, and give plain water when the EC tile climbs.', ph: 'Next time, nudge pH one step when its tile leaves the green, wait an hour, and look again.',
    airTemp: 'Next time, shade or cover on the first hot or cold day, and keep the fan on.', rh: 'Next time, mist when the air is dry and run the fan when it is damp.', vpd: 'Next time, mist when the air is dry and run the fan when it is damp.',
    waterTemp: 'Next time, keep the tank out of the sun and off the cold floor.', do2: 'Next time, keep the pump running and the tank topped up so the roots can breathe.', ppfd: 'Next time, keep the lights on their hours and the plant close enough to them.', dli: 'Next time, keep the lights on their hours and the plant close enough to them.',
    stunted: 'Next time, catch it early: water, feed or shade on the first orange tile, before it goes red.', unpicked: 'Next time, pick when Axel says it is ready: a ripe crop does not keep on the plant.', any: 'Check three things first next time: water, pH and the cold. The red tile tells you which.' };
  function showLost() { /* v37 [M29]: the plant is lost: one end card, no stars, Start again first */
    setSpeed(0); flushSay(); try { Sfx.cue('bad'); } catch (e) {} /* [M27] */ if (mode !== 'beginner') clearSave(); endShown = true; stopLive(); /* v49b: no live bubble beside the end card */
    const L = S.lost || { day: S.day, cause: 'Not enough care', why: '' };
    try { const j = S.__plog || (S.__plog = []); j.push({ d: L.day, title: 'Plant lost: ' + L.cause, sev: 3 }); } catch (e) {}
    try { Sfx.music(true, 'night'); } catch (e) {}
    const esc = escH; /* one definition (escH, top of the render section); window.escHtml shares it with away.js */
    const hasCamp = !!camp;
    $('#harvest-title').textContent = 'The plant didn’t make it'; { const hm = $('#harvest'); if (hm) { hm.removeAttribute('aria-label'); hm.setAttribute('aria-labelledby', 'harvest-title'); } } /* v72: the lost card reads its own heading */
    $('#harvestBody').innerHTML = `<div class="stars" role="img" aria-label="no stars"><span aria-hidden="true">★★★★★</span></div>
      <div class="lost-axel"><img src="axel/worried_v2.webp" alt="" width="112" height="112" loading="lazy"></div>
      <div class="camp-end fail lost-end"><h3>Lost on day ${L.day}: ${esc(L.cause)}</h3><p class="lost-why">${esc(L.why)}</p>
      <p>${esc((LOST_NOMETER[L.key] && !metered(L.key) ? LOST_NOMETER[L.key] : LOST_ADVICE[L.key]) || LOST_ADVICE.any)} It happens to a lot of growers.</p>
      <button class="big" id="lostAgain">${hasCamp ? 'Try the chapter again' : 'Start again'}</button></div>`;
    $('#again').textContent = hasCamp ? 'Back to chapters' : 'Back to the title'; $('#again').classList.add('lost-back'); $('#again').classList.remove('big'); /* v51: not .ghost, so Escape does nothing on the Lost card */ /* v49: the way back is the quiet button; Start again is the loud one */
    const again = $('#lostAgain');
    if (again) again.onclick = () => {
      Sfx.play('click'); $('#harvest').classList.remove('show'); flushSay();
      if (hasCamp && window.Campaign && Campaign.active) return startChapter(Campaign.active());
      if (mode === 'beginner' && window.Beginner && Beginner.replay) return Beginner.replay();
      againSeed = (Math.floor(Math.random() * 2147483000) + 1);
      const m = mode === 'live' ? 'free' : mode; startWith(Object.assign({}, pick), lastOv, m);
    };
    $('#harvest').classList.add('show'); try { if (window.Cards && Cards.park) Cards.park(); } catch (e) {} harvestTop();
    flushSay();
    say(L.why + ' Start again when you’re ready.', { hop: true, auto: true });
  }

  /* v45 (play-test 7 #4): the Harvest / Lost card opens at its top (heading in view), never part-way down from the last time it was open */
  function harvestTop() {
    const go = () => { try { const c = document.querySelector('#harvest .card'); if (c) c.scrollTop = 0; const m = $('#harvest'); if (m) m.scrollTop = 0; const h = $('#harvest-title'); const top = window.A11y && A11y.top ? A11y.top() : null; if (h && (!top || top.id === 'harvest')) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } /* v66 (round 15 keyboard M3): the late refocus pulled focus off the lesson's end card onto the harvest card under it */ } catch (e) { warnOnce('harvestTop#1', e); } };
    go(); requestAnimationFrame(go); setTimeout(go, 120);
  }
  function showHarvest(endRes) {
    setSpeed(0); if (mode !== 'beginner') clearSave(); /* a Grow with Axel replay must never clear the player's real save */ endShown = true; stopLive();
    { const ht = $('#harvest-title'); if (ht) ht.textContent = 'Harvest time!'; } /* [M29] */
    const cr = camp && window.Campaign ? (endRes || Campaign.onHarvest(S)) : null;
    { const hm = $('#harvest'); if (hm) { if (cr) { hm.removeAttribute('aria-labelledby'); hm.setAttribute('aria-label', (cr.passed ? 'Chapter complete' : 'Not quite') + ', Harvest time'); } else { hm.removeAttribute('aria-label'); hm.setAttribute('aria-labelledby', 'harvest-title'); } } } /* v72 (keyboard round 18 and 19 n1): a chapter end card is named for what it is, not only Harvest time */
    if (cr && !sceneShown && window.Story) {
      const ch0 = Campaign.chapter(Campaign.active()), sc0 = ch0 && ch0.scenes && (cr.passed ? ch0.scenes.close : S && S.health >= 60 ? null : ch0.scenes.closeFail); /* v72 (critic round 19 m1): the fail scene commiserates a rough run and blames the tank; a healthy plant that missed the goal (an early pick) goes straight to the card, which names the cause */
      if (sc0) { sceneShown = true; return playScene(sc0, () => showHarvest(cr)); }
    }
    sceneShown = false;
    // only a passed chapter (or a non-campaign grow) gets the party track; a failed one keeps the calm one
    try { if (!cr || cr.passed) { Sfx.music(true, 'celebrate'); if (cr && cr.passed) Sfx.play('chapterDone'); } else Sfx.music(true, 'night'); } catch (e) { warnOnce('showHarvest#1', e); }
    const sc = Sim.score(S);
    const cj = cr ? Campaign.toJSON() : null, cid = cj ? cj.id : 0, nextId = cr && cr.passed && Campaign.chapter(cid + 1) ? cid + 1 : 0;
    const esc = escH; /* one definition (escH, top of the render section); window.escHtml shares it with away.js */
    const cartOn = !!(window.Cart && Cart.count() > 0);
    const stars = Math.max(1, Math.min(5, Math.round((sc.overall ?? 50) / 20)));
    const C = window.CROP_DATA && CROP_DATA[S.cropId], tgt = C ? C.yieldTarget * (S.nplants || 1) : 1, mt = (S.setup && S.setup.meters) || {};
    /* first harvest ever: if doAct did not already mark it (a grow that ends on its own), do it here; the banner is one line above the scores */
    let fhHtml = '';
    const noKg = !((sc.yieldKg || 0) >= 0.005); /* v72 (play-test #22 m5): a chapter that ends at its goal before any pick (chapter 3 ends at flowering) showed a 0.00 kg harvest card */
    { const ht = $('#harvest-title'); if (ht && cr && noKg) { ht.textContent = cr.passed ? 'Chapter goal reached' : 'Chapter over'; const hm2 = $('#harvest'); if (hm2) hm2.setAttribute('aria-label', ht.textContent + ', Harvest time'); } } /* v73 (keyboard review n1): the name matches the heading */
    try { if (!noKg && window.Fx && Fx.firstHarvest) { Fx.firstHarvest({ kg: sc.yieldKg, crop: cropOf(S.cropId || pick.crop).name, cropId: S.cropId || pick.crop, quinn, say: false, sound: true }); fhHtml = Fx.firstHarvestBanner({ kg: sc.yieldKg, share: !!(window.ShareCard && ShareCard.share) }); } } catch (e) { warnOnce('showHarvest#2', e); }
    const bl = [
      { k: 'water', name: 'Water Wise', ok: (sc.ecoParts && sc.ecoParts.water) >= 20, hint: 'Eco water part 20 of 25 or more' }, /* [M33] */
      { k: 'refill', name: 'Refill Champ', ok: (S.__refills || 0) >= 3, hint: 'Topped up the tank 3 times or more' },
      { k: 'thumb', name: 'Green Thumb', ok: (sc.health ?? 0) >= 80, hint: 'Plant health 80 or more' },
      { k: 'crop', name: 'Bumper Crop', ok: (sc.yieldKg ?? 0) >= tgt, hint: `Yield of ${fmt(tgt, 1)} kg or more` },
      { k: 'meter', name: 'Meter Master', ok: !!(mt.ec && mt.ph), hint: 'Used both an EC and a pH meter' },
      { k: 'root', name: 'Root Guardian', ok: !S.__rot, hint: 'No root rot all crop' },
      { k: 'firstgrow', name: 'First Grow', ok: !!(() => { try { return JSON.parse(localStorage.getItem('hygrow_beginner_v1') || '{}').done; } catch (e) { return 0; } })(), hint: 'Finished Grow with Axel' }
    ];
    $('#harvestBody').innerHTML = `
      ${cr ? `<div class="camp-end ${cr.passed ? '' : 'fail'}"><h3>${cr.passed ? 'Chapter complete' : 'Not quite'}</h3><p>${esc(cr.text)}</p>${cr.rewardText ? `<p class="reward"><b>${esc(cr.rewardText)}</b></p>` : ''}${nextId ? '<button class="big" id="nextChap">Next chapter</button>' : ''}${cr.passed ? '' : '<button class="big" id="retryChap">Try the chapter again</button>'}</div>` : ''}
      <div class="stars" role="img" aria-label="${stars} of 5 stars"><span class="on" aria-hidden="true">${'★'.repeat(stars)}</span><span aria-hidden="true">${'★'.repeat(5 - stars)}</span></div>
      ${fhHtml}
      <div class="scores">
        <div><b>${noKg ? 'None yet' : fmt(sc.yieldKg, 2) + ' kg'}</b><span>${noKg ? 'Picked' : 'Yield'}</span></div>
        <div><b>${Math.round(sc.health ?? 0)}</b><span>Plant health</span></div>
        <div><b>${Math.round(sc.eco ?? 0)}</b><span>Eco score</span><small class="plain">Out of 100. You steer it: water, feed, no spray, climate.</small></div>
        <div><b>${Math.round(sc.waterUsedL ?? 0)} L</b><span>Water used</span></div>
        <div><b>${Math.round(sc.feedMl ?? 0)} mL</b><span>Feed used</span></div>
        <div><b>${fmt(sc.energyKWh, 0)} kWh</b><span>Power used</span></div>
      </div>
      ${ecoHtml(sc)}
      <h3>Your badges</h3><div class="badges">${bl.map(b => `<div class="badge ${b.ok ? 'on' : 'off'}" title="${b.hint}">${Art.badge(b.k, b.ok, 64)}<b>${b.name}</b><span>${b.ok ? b.hint : 'Locked: ' + b.hint}</span></div>`).join('')}</div>
      <p class="tip">Real-life tip: bring your empty bottles into HyGrow in Byford. Ask in store about refills.</p>
      <div class="ctas">${cartOn ? '<a class="cta cart-cta" id="checkoutCta" target="_blank" rel="noopener" href="' + esc(Cart.checkoutUrl()) + '">Checkout at HyGrow</a>' : ''}<a class="cta" target="_blank" rel="noopener" href="${tag(CAT.nutrients)}">Shop nutrients at HyGrow</a></div>`;
    try { const hb0 = $('#harvestBody'), st0 = hb0.querySelector('.stars'), cn0 = cropOf(S.cropId || pick.crop); if (st0 && !hb0.querySelector('.hv-crop')) { const d0 = document.createElement('div'); d0.className = 'hv-crop'; d0.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;margin:2px 0'; d0.appendChild(Art.cropIcon(cn0.icon, 24, true)); d0.appendChild(document.createTextNode(cn0.name)); st0.parentNode.insertBefore(d0, st0); } } catch (e) {} /* v48 crop line with line icon */
    if (window.ShareCard) ShareCard.mount($('#harvestBody'), { endRes, S, pick, mode, camp });
    const fhShare = $('#harvestBody .fh-share');
    if (fhShare && window.ShareCard && ShareCard.share) fhShare.onclick = () => { Sfx.play('click'); Promise.resolve(ShareCard.share({ endRes, S, pick, mode, camp })).then(r => { if (r === 'downloaded') toast('Card saved to your downloads.'); }).catch(() => {}); };
    if (window.Events) Events.onHarvest(S, endRes);
    $('#again').textContent = cr ? 'Back to chapters' : 'Grow again'; $('#again').classList.add('big'); $('#again').classList.remove('lost-back'); /* v49: back from the Lost card styling */
    const nc = $('#nextChap'); if (nc) nc.onclick = () => startChapter(nextId);
    const rc = $('#retryChap'); if (rc) rc.onclick = () => { Sfx.play('click'); $('#harvest').classList.remove('show'); flushSay(); startChapter(cid); }; /* v66 (play-test #18 m2): Not quite had only Back to chapters */
    if (window.Fx) Fx.harvest({ quinn });
    $('#harvest').classList.add('show'); try { if (window.Cards && Cards.park) Cards.park(); } catch (e) { warnOnce('showHarvest#3', e); } harvestTop();
    flushSay();
    if (fhHtml) say(Fx.FIRST_HARVEST_LINE, { hop: true, wave: true, auto: true, bg: true, more: !!cr });
    if (!fhHtml || cr) say(cr ? (cr.passed ? 'Nice work, chapter done!' : 'Have another crack at it.') : stars >= 4 ? 'Great harvest! You’re a natural.' : 'Not bad for a first go. Want to try again?', { hop: true, wave: true, auto: true });
  }

  /* --------- phone layout glue: strip dots, More sheet, relocated header bits, install pill, service worker --------- */
  const Mob = (function () {
    const mqCompact = window.matchMedia ? window.matchMedia('(max-width: 899px)') : { matches: false, addEventListener() {} };
    const mqStrip = window.matchMedia ? window.matchMedia('(max-width: 599px)') : { matches: false, addEventListener() {} };
    let moved = false, home = [], side, dots = [], bar, pill = null, deferred = null, harvested = false;
    const A2HS = 'hygrow_a2hs_v1';
    const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

    /* Journal / Menu / mute and the Eco-Spent-Picked stats live in the header on desktop and in the More sheet on phones */
    function relocate() {
      const ex = $('#sheetExtras'); if (!ex) return;
      const els = [document.querySelector('header .hstats'), $('#hextras')].filter(Boolean);
      if (mqCompact.matches && !moved) { els.forEach(e => { home.push([e, e.parentNode, e.nextSibling]); ex.appendChild(e); }); moved = true; }
      else if (!mqCompact.matches && moved) { home.reverse().forEach(([e, par, nx]) => par.insertBefore(e, nx && nx.parentNode === par ? nx : null)); home = []; moved = false; closeSheet(); }
    }
    function openSheet() { bar.classList.add('open'); document.body.classList.add('sheet-open'); bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-modal', 'true'); bar.setAttribute('aria-label', 'More actions'); /* v51 (critic round 5): the open sheet is a dialog to a screen reader */ const m = $('#moreBtn'); m.setAttribute('aria-expanded', 'true'); m.querySelector('span').textContent = 'Close'; setTimeout(() => { try { const f = bar.querySelector('#sheetExtras button, #dockOverflow button, #sheetExtras a'); if (f) f.focus({ preventScroll: true }); } catch (e) {} }, 30); }
    function closeSheet() { if (!bar) return; const had = bar.contains(document.activeElement); bar.classList.remove('open'); document.body.classList.remove('sheet-open'); bar.removeAttribute('role'); bar.removeAttribute('aria-modal'); bar.removeAttribute('aria-label'); const m = $('#moreBtn'); if (m) { m.setAttribute('aria-expanded', 'false'); m.querySelector('span').textContent = 'More'; if (had) { try { m.focus({ preventScroll: true }); } catch (e) {} } } /* v37: focus returns to More */ }
    const sheetOpen = () => !!bar && bar.classList.contains('open');

    /* swipe strip helpers (only active under 600px, where .side scrolls sideways) */
    const inStrip = () => mqStrip.matches && side && side.scrollWidth > side.clientWidth + 4;
    function goPanel(i, smooth) { const p = side && side.children[i]; if (p) side.scrollTo({ left: p.offsetLeft - side.offsetLeft, behavior: smooth ? 'smooth' : 'auto' }); }
    function curPanel() { return side && side.clientWidth ? Math.round(side.scrollLeft / (side.clientWidth + 10)) : 0; }
    function paintDots() { let c = curPanel(); if (!inStrip() && side) { const t = V36B.chromeBottom() + 24; c = 0; [...side.children].forEach((p, i) => { if (p.getBoundingClientRect().top <= t && p.getClientRects().length) c = i; }); }
       dots.forEach((d, i) => { d.classList.toggle('on', i === c); if (i === c) { d.setAttribute('aria-current', 'true'); if (i === 0) d.classList.remove('alert'); } else d.removeAttribute('aria-current'); }); }

    /* Axel speaks while another panel is showing: jump back if the clock is held or the player just tapped something, else flag the dot.
       rest = the panel to return to once he has finished (the Readings, so the coaching never leaves them hidden behind a swipe) */
    let rest = null;
    function onSay(o) {
      if (!inStrip() || curPanel() === 0) return;
      const mine = performance.now() - userActAt < 2500;
      if (mine || (S && holdsFor(o))) { rest = curPanel(); goPanel(0, true); } else if (dots[0]) dots[0].classList.add('alert');
    }
    function onIdle() { if (rest != null && inStrip() && curPanel() === 0) goPanel(rest, true); rest = null; }
    /* spotlight target lives in another panel / in the collapsed bar: bring it on screen */
    function onSpot(el) {
      if (!el) return;
      try { V36B.chrome(); } catch (e) {} /* v36b: --hdrb = header + lesson strip + trouble chips, kept current (it was set here only, from the header alone) */
      if (inStrip()) { const pan = el.closest('.side > *'); if (pan && pan !== side.children[0]) { const i = [...side.children].indexOf(pan); rest = i; goPanel(i, false); } }
      /* the More sheet used to open here when the target was tucked inside it (it opened over its own Close button at 8x); nextSay now simply does not point at a control that is not on screen */
    }

    /* real action-bar height -> --barh, so the pager dots (sticky), the toast and the page padding all clear the bar, whatever buttons it holds */
    function syncBar() {
      try { const dk = $('#dock'); if (dk && !mqCompact.matches && getComputedStyle(dk).position === 'fixed') { const v2 = dk.offsetHeight + 'px'; if (document.documentElement.style.getPropertyValue('--dockfix') !== v2) document.documentElement.style.setProperty('--dockfix', v2); } /* v51 (critic round 5 #6): a short desktop window pins the dock to the bottom; the page keeps room for it */
        if (!bar || !mqCompact.matches || bar.classList.contains('open')) return; const h = bar.offsetHeight; if (h) { const v = Math.max(72, h) + 'px'; if (document.documentElement.style.getPropertyValue('--barh') !== v) document.documentElement.style.setProperty('--barh', v); } /* v49b: compared against the live inline value, not a memo: beginner.js removes the property when the lesson ends */ } catch (e) {}
    }
    /* one-time "Swipe for readings" hint the first time the side strip can be swiped */
    const HINT = 'hygrow_swipe_hint_v1'; let hintEl = null, hintT = 0;
    function hideHint() { clearTimeout(hintT); if (hintEl) { hintEl.remove(); hintEl = null; } }
    function swipeHint() {
      if (hintEl || lsGet(HINT) || !inStrip()) return;
      const host = $('#stripDots'); if (!host) return;
      lsSet(HINT, '1');
      hintEl = document.createElement('div'); hintEl.id = 'swipeHint'; hintEl.setAttribute('role', 'status'); hintEl.innerHTML = 'Swipe<span class="sr-only"> for readings</span> ▸'; /* v58 (critic round 9 #4): two words fit beside the pill on any phone; a screen reader still hears what it is for */
      host.appendChild(hintEl); hintT = setTimeout(hideHint, 9000);
    }

    /* "Add to home screen" pill, once, after the first harvest */
    function showPill() {
      if (!deferred || !harvested || lsGet(A2HS)) return;
      lsSet(A2HS, '1');
      pill = document.createElement('button'); pill.id = 'a2hs'; pill.type = 'button'; pill.textContent = 'Add to home screen';
      const x = document.createElement('span'); x.setAttribute('aria-label', 'Dismiss'); x.textContent = '✕'; pill.appendChild(x);
      const done = () => { if (pill) pill.remove(); pill = null; };
      pill.onclick = e => { if (e.target === x) { done(); return; } const d = deferred; deferred = null; done(); try { d.prompt(); } catch (err) {} };
      document.body.appendChild(pill); setTimeout(done, 20000);
      try { say('Want me on your home screen? Tap Add to home screen and I am one tap away.', { auto: true }); } catch (e) {}
    }
    function afterHarvest() { harvested = true; showPill(); }

    function init() {
      bar = $('#actionbar'); side = document.querySelector('.side');
      if (!bar || !side) return;
      $('#moreBtn').onclick = () => { Sfx.play(sheetOpen() ? 'uiClose' : 'uiOpen'); sheetOpen() ? closeSheet() : openSheet(); };
      $('#sheetBack').onclick = closeSheet;
      bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.id !== 'moreBtn' && b.id !== 'mute' && b.id !== 'dlyPill' && sheetOpen()) closeSheet(); /* v68: the daily pill opens its list inside the sheet */ });
      addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen() && !document.querySelector('.modal.show')) closeSheet(); });
      dots = [...document.querySelectorAll('#stripDots button')];
      dots.forEach((d, i) => d.onclick = () => { Sfx.play('click'); rest = null; hideHint(); if (inStrip()) goPanel(i, true); else { const p = side.children[i]; if (p) { const q = p.getBoundingClientRect(); scrollBy({ top: q.top - V36B.chromeBottom() - 8, left: 0, behavior: 'auto' }); } } }); /* v36b: stacked pages (the lesson): a dot scrolls to its page */
      side.addEventListener('pointerdown', () => { rest = null; }, { passive: true }); /* the player is steering: stop returning them */
      syncBar(); if (window.ResizeObserver) { try { new ResizeObserver(syncBar).observe(bar); } catch (e) {} } addEventListener('resize', syncBar);
      addEventListener('scroll', () => { if (!inStrip()) paintDots(); }, { passive: true });
      let raf = 0; side.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paintDots(); const cp = curPanel(); if (cp !== 0) hideHint(); if (cp !== window.__lastPanel) { if (window.__lastPanel != null) Sfx.play('swipe'); window.__lastPanel = cp; } }); }, { passive: true });
      paintDots();
      const oc = $('#openCart'); if (oc) oc.onclick = () => { Sfx.play('click'); if (window.Cart) Cart.openDrawer(); };
      if (window.Cart) Cart.renderChip($('#cartChipM'));
      const rd = $('#readings');
      rd.addEventListener('pointerup', e => { if (e.button || e.target.closest('a') || e.target.closest('.rdx')) return; const t = e.target.closest('.rd'); if (t) { ackTile(t); toggleRd(t.dataset.reading); } });
      rd.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const t = e.target.closest('.rd'); if (t) { e.preventDefault(); toggleRd(t.dataset.reading); const k = t.dataset.reading; const n = document.querySelector('#readings [data-reading="' + k + '"] .rdb'); if (n) n.focus({ preventScroll: true }); } });
      const chg = () => { relocate(); if (!mqStrip.matches) goPanel(0, false); };
      if (mqCompact.addEventListener) { mqCompact.addEventListener('change', chg); mqStrip.addEventListener('change', chg); } else if (mqCompact.addListener) { mqCompact.addListener(chg); mqStrip.addListener(chg); }
      relocate();
      addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; showPill(); });
      addEventListener('appinstalled', () => { deferred = null; if (pill) pill.remove(); });
      /* service worker: app shell offline + faster repeat loads. Skipped on localhost unless ?sw=1 so dev edits are never served stale. */
      try {
        const dev = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
        if ('serviceWorker' in navigator && !dev && /^https?:$/.test(location.protocol)) {
          /* [m6] client half of the update hand-over. sw.js (cache-first JS) posts { type: 'hg-sw-updated', cache } to every open window when a NEW cache name activates over an old one;
             this page is then running the old index.html and old JS, so save and reload once. sessionStorage remembers the cache name so a page can never reload twice for the same update. */
          navigator.serviceWorker.addEventListener('message', ev => {
            const d = ev && ev.data; if (!d || d.type !== 'hg-sw-updated' || !d.cache) return;
            let done = ''; try { done = sessionStorage.getItem('hg_sw_reloaded') || ''; } catch (e) { warnOnce('sw update flag', e); }
            if (done === String(d.cache)) return;
            try { sessionStorage.setItem('hg_sw_reloaded', String(d.cache)); } catch (e) { warnOnce('sw update flag', e); return; } /* cannot remember it: do not risk a reload loop */
            try { save(); setSpeed(0); toast('A new version is ready. Reloading, your grow is saved.', 2500); } catch (e) { warnOnce('sw update save', e); }
            setTimeout(() => location.reload(), 1600);
          });
          navigator.serviceWorker.register('sw.js').catch(e => warnOnce('sw register', e));
        }
      } catch (e) {}
    }
    return { init, onSay, onSpot, onIdle, afterHarvest, openSheet, closeSheet, goPanel, swipeHint, syncBar, inStrip, curPanel };
  })();

  /* --------- v37: Volume row, Credits card and plain notes for a failed voice clip or art layer --------- */
  function volumeRow() { /* [M28] a Volume slider bound to Sfx.volume (audio.js remembers it in hygrow_volume_v1) */
    const w = document.createElement('label'); w.className = 'volrow'; w.id = 'volRow'; w.innerHTML = '<span>Volume</span><input type="range" min="0" max="100" step="5" aria-label="Volume">';
    const r = w.querySelector('input'); let v = 100; try { v = Math.round(Sfx.volume() * 100); } catch (e) {}
    r.value = v; r.setAttribute('aria-valuetext', v + ' percent');
    r.oninput = () => { try { Sfx.init(); Sfx.volume(r.value / 100); } catch (e) {} r.setAttribute('aria-valuetext', r.value + ' percent'); };
    return w;
  }
  const CREDITS_HTML = '<h3>Made for</h3><p>HyGrow Hydroponics, Byford WA. The game is a teaching toy made for the shop’s customers. The cast (Axel the axolotl, Deb, Rob, Kez) is fictional; any likeness to a real person is accidental.</p>' +
    '<h3>What ships in the game</h3><ul>' +
    '<li><b>Voices</b> (130+ clips): Chatterbox 0.5B text-to-speech (Resemble AI), run locally. Licence: MIT.</li>' +
    '<li><b>Scene backdrops, props, portraits and Axel poses</b>: made with ComfyUI and the animagine-xl-4.0 checkpoint (cagliostrolab, built on Stable Diffusion XL). Licence: CreativeML Open RAIL++-M. Commercial use is allowed; the licence terms and use restrictions travel with the images. ComfyUI itself is GPL-3.0, and that does not attach to the images it makes.</li>' +
    '<li><b>Layered character rig</b>: parts cut from those renders and animated in the game. Same licence as the renders.</li>' +
    '<li><b>Fonts</b>: Fredoka and Nunito, loaded from Google Fonts. SIL Open Font License 1.1.</li>' +
    '<li><b>HyGrow logo</b>: HyGrow Hydroponics’ own mark, shown in its own game.</li>' +
    '<li><b>Store catalogue</b>: names, product pages and ex-GST prices from the HyGrow Hydroponics online store. The game shows price plus GST as an estimate, and “Ask in store” where the store has no product.</li>' +
    '<li><b>Game code</b>: written for this project. All rights reserved.</li></ul>' +
    '<h3>Where the numbers come from</h3><ul>' +
    '<li><b>Perth climate</b>: approximations of Bureau of Meteorology climate normals for the Perth region, marked as estimates. Not a BoM product and not a measurement.</li>' +
    '<li><b>Crop targets</b> (feed strength, pH, temperature, light): published sources cited in the game’s engine notes, such as Cornell CEA, University of Kentucky, Mississippi State, UF/IFAS and DAF Queensland.</li>' +
    '<li><b>Grower’s card</b> (Perth planting times): WA Waste Authority WasteSorted Schools planting guide and other sources listed in the project notes.</li>' +
    '<li><b>Growing methods</b> (soil, coco, hydro, outdoors): published standard methods and game choices.</li></ul>' +
    '<h3>Not used</h3><p>No third-party logos, no stock art, no sampled music.</p>';
  const Credits = (function () {
    let el = null;
    const isOpen = () => !!el && el.classList.contains('show');
    function build() {
      el = document.createElement('div'); el.className = 'modal'; el.id = 'creditsModal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Credits');
      el.addEventListener('click', e => { if (e.target === el) close(); });
      document.body.appendChild(el);
    }
    function open() {
      if (!el) build();
      let ver = ''; try { const v = window.HYGROW_VERSION; if (v) ver = growSimVer(v); } catch (e) {}
      el.innerHTML = '<div class="card creditscard"><h2>Credits</h2>' + (ver ? '<p class="verline">' + escH(ver) + '</p>' : '') + '<div class="creditsbody">' + CREDITS_HTML + '</div><div class="foot"><button class="big" id="credClose" type="button">Close</button></div></div>';
      el.querySelector('#credClose').onclick = close; el.classList.add('show');
      try { el.querySelector('#credClose').focus({ preventScroll: true }); } catch (e) {}
    }
    function close() { if (!isOpen()) return; el.classList.remove('show'); try { Sfx.play('uiClose'); } catch (e) {} }
    addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { e.stopImmediatePropagation(); close(); } });
    return { open, close, isOpen };
  })();
  function installFailNotes() { /* clear error states: a plain line, a console.warn, nothing visibly broken */
    const told = {}; const note = (key, msg, detail) => { try { console.warn('[HyGrow] ' + key + ': ' + detail); } catch (e) {} if (told[key]) return; told[key] = 1; try { toast(msg, 3600); } catch (e) {} };
    addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && /(^|\/)art\//.test(t.currentSrc || t.src || '')) note('art', 'A picture did not load, so a scene may look plain. The game still works.', t.src); }, true);
    let vAt = 0, vDur = 0;
    addEventListener('hygrow:voice', e => { const d = e.detail || {}; if (d.type === 'line' && d.voiced) { vAt = performance.now(); vDur = +d.dur || 0; } else if (d.type === 'end' && vAt) { if (vDur > 1 && performance.now() - vAt < 350) note('voice', 'That voice clip would not play. The words are on screen.', 'clip ended after ' + Math.round(performance.now() - vAt) + ' ms'); vAt = 0; } });
  }

  /* --------- in-game Menu: Back to the title, or the guided lesson again (the current grow is saved first) --------- */
  const MenuModal = (function () {
    let el = null, prevSpeed = 1, ask = false;
    const isOpen = () => !!el && el.classList.contains('show');
    const wanted = () => !!S && mode !== 'beginner' && !!window.Beginner && !$('#title').classList.contains('show') && !isOpen();
    function toTitle() { close(false, true); Sfx.play('whoosh'); flushSay(); setSpeed(0); save(); stopLive(); showTitle(); }
    function build() {
      el = document.createElement('div'); el.className = 'modal'; el.id = 'menuModal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Menu');
      el.addEventListener('click', e => { if (e.target === el) close(true); });
      document.body.appendChild(el);
    }
    function paint(focusSel) {
      const done = !!(Beginner.isDone && Beginner.isDone()), lesson = done ? 'Replay the lesson' : 'Do the guided lesson';
      let canFin = false; try { canFin = !!(camp && S && window.Campaign && Campaign.canFinish && Campaign.canFinish(S)); } catch (e) {}
      const canEnd = !camp && !!S && !S.cropDone && !S.lost && (S.harvestedKg || 0) > 0; /* v72 (play-test #22 m3): a picked crop that stalls (a cold garden chilli at 35 health) had no way to reach its harvest card or weekly score */ /* v72: the chapter 2 offer can be taken from the Menu once dismissed */
      const kgNow = S ? fmt((Sim.score ? Sim.score(S).yieldKg : S.harvestedKg) || 0, 2) : '0'; /* v73 (play review m3): the confirm counts what the card counts */
      const ASKS = { end: ['End this grow?', 'The crop ends here and the harvest card counts what you have picked and what is ripe (' + kgNow + ' kg). You cannot grow this crop on afterwards.', 'End the grow', '#mmEnd'], finish: ['Finish the chapter?', 'The chapter goal is done. Finishing now ends the chapter and counts it; this crop stops growing.', 'Finish', '#mmFinish'] }; /* v72: the two new Menu entries end something for good, so each asks first (Command Centre after round 19) */
      el.innerHTML = ask && ASKS[ask]
        ? '<div class="card menucard"><h2 id="mmAskH">' + ASKS[ask][0] + '</h2><p id="mmAskP">' + ASKS[ask][1] + '</p><div class="foot"><button class="ghost" id="mmNo" type="button">Not now</button><button class="big" id="mmGo" type="button">' + ASKS[ask][2] + '</button></div></div>'
        : ask
        ? '<div class="card menucard"><h2 id="mmAskH">' + lesson + '</h2><p id="mmAskP">' + (done ? Beginner.REPLAY_CONFIRM : Beginner.REPLAY_CONFIRM.replace(' again', '')) + '</p><div class="foot"><button class="ghost" id="mmNo" type="button">Not now</button><button class="big" id="mmGo" type="button">' + (done ? 'Start again' : 'Start') + '</button></div></div>'
        : '<div class="card menucard"><h2>Menu</h2><div class="menulist">' + (canFin ? '<button class="mode" id="mmFinish" type="button"><b>Finish the chapter</b><span>The chapter goal is done. End it now and see how you did.</span></button>' : '') + (canEnd ? '<button class="mode" id="mmEnd" type="button"><b>End this grow</b><span>Count what you have picked and see the harvest card.</span></button>' : '') + '<button class="mode" id="mmTitle" type="button"><b>Back to the title</b><span>' + (saveErr ? 'Couldn’t save: browser storage is full or blocked.' : 'Your grow is saved.') + '</span></button><button class="mode" id="mmReplay" type="button"><b>' + lesson + '</b><span>About 10 minutes with Axel at 3x, any time.</span></button><button class="mode" id="mmCredits" type="button"><b>Credits</b><span>Who made what, and the licences.</span></button><div id="mmVol"></div></div><div class="foot"><button class="ghost" id="mmClose" type="button">Keep growing</button></div></div>';
      const b = id => el.querySelector(id);
      /* v68 (round 16 keyboard m7): the confirm names the dialog after its own heading and reads its text; Not now (and Escape, which presses it) goes back to the button that asked */
      if (ask) { el.removeAttribute('aria-label'); el.setAttribute('aria-labelledby', 'mmAskH'); el.setAttribute('aria-describedby', 'mmAskP'); } else { el.removeAttribute('aria-labelledby'); el.removeAttribute('aria-describedby'); el.setAttribute('aria-label', 'Menu'); }
      if (ask) { const back = ASKS[ask] ? ASKS[ask][3] : '#mmReplay', kind = ask; b('#mmNo').onclick = () => { Sfx.play('click'); ask = false; paint(back); }; b('#mmGo').onclick = kind === 'end' ? endGrow : kind === 'finish' ? finishChapter : replay; }
      else { const me = b('#mmEnd'); if (me) me.onclick = () => { Sfx.play('click'); ask = 'end'; paint(); }; const mf = b('#mmFinish'); if (mf) mf.onclick = () => { Sfx.play('click'); ask = 'finish'; paint(); }; b('#mmTitle').onclick = toTitle; b('#mmReplay').onclick = () => { Sfx.play('click'); ask = true; paint(); }; b('#mmClose').onclick = () => { Sfx.play('click'); close(true, true); }; b('#mmCredits').onclick = () => { Sfx.play('click'); Credits.open(); }; const mv = b('#mmVol'); if (mv) mv.appendChild(volumeRow()); }
      const f = b(focusSel || (ask ? (ASKS[ask] ? '#mmNo' : '#mmGo') : '#mmTitle')); /* v73 (keyboard review m1): a held Enter must not confirm End or Finish */ if (f && f.focus) f.focus();
    }
    function open() { if (isOpen()) return; if (!el) build(); ask = false; prevSpeed = speed; setSpeed(0); Sfx.play('uiOpen'); el.classList.add('show'); paint(); }
    function close(resume, quiet) { if (!isOpen()) return; el.classList.remove('show'); if (!quiet) Sfx.play('uiClose'); if (resume && prevSpeed > 0 && S) setSpeed(prevSpeed); }
    function endGrow() { close(false, true); flushSay(); try { if (S && !S.cropDone) { S.cropDone = true; S.mature = true; save(); showHarvest(); } } catch (e) { warnOnce('menu#end', e); } }
    function finishChapter() { close(false, true); flushSay(); try { if (Campaign.canFinish(S)) campHooks().finish(Campaign.onHarvest(S)); } catch (e) { warnOnce('menu#finish', e); } }
    function replay() { close(false, true); flushSay(); save(); if (!(Beginner.replay && Beginner.replay()) && prevSpeed > 0 && S) setSpeed(prevSpeed); }
    addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(true); });
    return { wanted, open, close, isOpen };
  })();

  /* TAKEHOME:start (pure, no DOM: tests/pass7.test.js and tests/pass8.test.js run this block on their own)
     The gear list on the "Take this home" card: one row per piece the player used (tent, light, medium, air pump, meters, then the feed and pH bottles), each with its inc-GST price
     (the catalogue already carries it), and a total. A piece with no price still gets a row. */
  function takeHomeRows(sum, extras) {
    const rows = [], add = g => { if (g && g.name && g.id !== 'none') rows.push({ name: g.name, price: g.price > 0 ? g.price : 0, ask: !!g.askInStore }); }; /* v36c: ask = no price, printed "Ask in store", $0 in the total */
    sum = sum || {};
    add(sum.tent); add(sum.light); add(sum.medium); add(sum.air); (sum.meters || []).forEach(add); (extras || []).forEach(add);
    return { rows, total: rows.reduce((t, r) => t + r.price, 0) };
  }
  /* Pass 8b (docs/PLAYTEST-DEV-v34.md wrong 8): the kit the sim is really running, rebuilt from S.setup (tent area, light watts, medium, air pump, meters) against the GEAR catalogue,
     in the same {tent, light, medium, air, meters} shape as setupSummary(). It is what the card lists when the grow carries no kit snapshot of its own (an older save). */
  function kitFromSetup(setup, gear) {
    if (!setup || !gear) return null;
    const near = (list, f) => list.reduce((b, x) => (b == null || f(x) < f(b) ? x : b), null), t = setup.tent || {}, l = setup.light || {}, m = setup.meters || {};
    return {
      tent: t.area_m2 != null ? near(gear.tents, x => Math.abs(x.area_m2 - t.area_m2)) : null,
      light: l.watts != null ? near(gear.light, x => Math.abs(x.watts - l.watts) + 100 * Math.abs((x.umolPerJ || 0) - (l.umolPerJ || 0))) : null,
      medium: gear.medium.find(x => x.medium === setup.medium) || null,
      air: gear.air.find(x => !!x.airPump === !!setup.airPump) || null,
      meters: gear.meters.filter(x => m[x.id])
    };
  }
  /* The three totals people saw for one kit: the cart pill, "Spent" and the card. The card lists the kit that "Spent" is made of; these lines say how the others differ.
     o = { kit (kit total), spent (S.__cost or null), cart (Cart.total()), cartCount }. Returns { spent, cart } sentences, '' when there is nothing to say. */
  function takeHomeNotes(o) {
    o = o || {};
    const kit = Math.round(o.kit || 0), spent = o.spent == null ? null : Math.round(o.spent), cart = o.cartCount > 0 ? Math.round(o.cart || 0) : null, out = { spent: '', cart: '' };
    if (spent != null && kit > 0 && spent >= kit) out.spent = spent > kit ? 'Spent so far: $' + spent + ', the kit ($' + kit + ') plus $' + (spent - kit) + ' of feed and pH you have used.' : 'Spent so far: $' + spent + ', just the kit.';
    if (cart != null) out.cart = cart === kit ? 'Your cart ($' + cart + ') is this kit.' : 'Your cart ($' + cart + ') is the kit plus anything you added from tips, less anything you took out. Feed and pH you have used up are in Spent, not the cart.';
    return out;
  }
  /* the shop, copied from shop.js's VISIT facts (verified from the shop's own website 2026-11-05) */
  const THOME_VISIT = { name: 'HyGrow Hydroponics', street: '1/18 Nettleton Road', suburb: 'Byford WA 6122', phone: '08 9503 2540', phoneTel: '+61895032540', hours: [['Tuesday to Friday', '9:30am to 5:00pm'], ['Saturday', '9:30am to 3:30pm'], ['Sunday and Monday', 'Closed']] };
  const thomeDirections = () => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(THOME_VISIT.name + ', ' + THOME_VISIT.street + ', ' + THOME_VISIT.suburb);
  /* TAKEHOME:end */
  /* --------- "Take this home": the gear used, "ask the team in store", the shop's address, and the link to keep growing at home. Shown once per browser, and only to a first-timer, after the lesson's first real step (beginner.js); always in the More sheet. No QR. --------- */
  const TakeHome = (function () {
    const KEY = 'hygrow_takehome_v1';
    let el = null, prev = 0, after = null, shownThisLoad = false;
    const esc = escH; /* one definition (escH, top of the render section); window.escHtml shares it with away.js */
    const seen = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return shownThisLoad; } };
    const mark = () => { shownThisLoad = true; try { localStorage.setItem(KEY, '1'); } catch (e) {} };
    /* a player with a finished grow, a campaign save or Almanac progress is not new here: the card never opens by itself for them (beginner.js decides) */
    const returning = () => { try { return !!(window.Beginner && Beginner.returning && Beginner.returning()); } catch (e) { return false; } };
    const inFrame = () => { try { return window.self !== window.top; } catch (e) { return true; } };
    function shareUrl() {
      try { if (window.ShareCard && typeof ShareCard.url === 'function') { const u = ShareCard.url(); if (u) return u; } } catch (e) {}
      try { const m = document.querySelector('meta[name="hygrow:share-url"]'); if (m && /^https:\/\//.test(m.content || '')) return m.content.trim(); } catch (e) {}
      /* inside an iframe (the artifact viewer, Wix) location.href is the frame host, not a page anyone can open: say nothing rather than hand out that address */
      try { if (!inFrame()) return location.href.split('#')[0].split('?')[0]; } catch (e) {}
      return '';
    }
    function copy(txt, done) {
      const fb = () => { try { const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta); ta.select(); const ok = !!document.execCommand('copy'); ta.remove(); done(ok); } catch (e) { done(false); } };
      try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(() => done(true), fb); return; } } catch (e) {}
      fb();
    }
    function css() {
      if (document.getElementById('takeHomeCss')) return;
      const st = document.createElement('style'); st.id = 'takeHomeCss';
      st.textContent = '#takeHome .thlist{list-style:none;margin:8px 0;padding:0}#takeHome .thlist li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line)}#takeHome .thlist b{white-space:nowrap}#takeHome .thsum{display:flex;justify-content:space-between;font-weight:800;padding:8px 0}#takeHome .thurl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}#takeHome .thurl code{flex:1 1 200px;min-width:0;overflow-wrap:anywhere;background:var(--panel2);border:2px solid var(--line);border-radius:10px;padding:10px;font-size:15px}#takeHome h3{margin:14px 0 4px;font-family:var(--display)}#takeHome .thvisit p{margin:4px 0}#takeHome .thhours{border-collapse:collapse;margin:4px 0}#takeHome .thhours td{padding:2px 14px 2px 0}#takeHome .thnote{color:var(--muted);font-size:13px;margin:4px 0}';
      document.head.appendChild(st);
    }
    /* the kit that "Spent" is made of: the snapshot taken when the grow started (S.__kit), else rebuilt from the sim's own setup, else the current pick */
    function kitRows() {
      /* v36b: the kit for this way of growing comes from Shop.gearFor(S.method) when the shop has it (a veranda soil basil is pots, soil, feed and shade, not a tent and a light) */
      try { const sh = window.HyGrowShop || window.Shop, m = S && S.method; if (sh && sh.gearFor && m && !(m.where === 'tent' && m.how === 'hydro')) { const g = sh.gearFor(m); if (Array.isArray(g) && g.length) return g.map(x => ({ name: x.name || x.label, price: x.price > 0 ? x.price : 0, ask: !(x.price > 0) })); } } catch (e) {}
      try { if (S && Array.isArray(S.__kit) && S.__kit.length) return S.__kit; } catch (e) {}
      try { if (S && S.setup) { const k = kitFromSetup(S.setup, GEAR); if (k) return takeHomeRows(k).rows; } } catch (e) {}
      try { return takeHomeRows(window.setupSummary ? window.setupSummary() : null).rows; } catch (e) { return []; }
    }
    const listHtml = rows => '<ul class="thlist">' + rows.map(r => '<li><span>' + esc(r.name) + '</span>' + (r.price ? '<b>$' + Math.round(r.price) + '</b>' : r.ask ? '<b>Ask in store</b>' : '') + '</li>').join('') + '</ul>';
    function gearHtml() {
      const rows = kitRows(); if (!rows.length) return '';
      const kit = rows.reduce((t, r) => t + (r.price || 0), 0);
      const notes = takeHomeNotes({ kit, spent: S && !camp && S.__cost != null ? S.__cost : null, cart: window.Cart ? Cart.total() : 0, cartCount: window.Cart ? Cart.count() : 0 });
      const noPh = !!(S && S.method && S.method.how === 'soil'), /* v36b: a soil grow has no pH bottles (and a basil in soil with no meter has no reason to) */
        extras = takeHomeRows(null, [fromProduct('profAB1', { name: "Professor's Nutrients A+B 1L", price: PROF_AB1_PRICE })].concat(noPh ? [] : [fromProduct('phDown', { name: 'pH Down', price: 0 }), fromProduct('phUp', { name: 'pH Up', price: 0 })]));
      return listHtml(rows) + (kit ? '<div class="thsum"><span>Kit total</span><span>$' + Math.round(kit) + '</span></div>' : '') + '<p class="tentline">Prices include GST.' + (rows.some(x => x.ask) ? ' Kit total is plus items priced in store.' : '') + '</p>' +
        (notes.spent ? '<p class="thnote">' + esc(notes.spent) + '</p>' : '') + (notes.cart ? '<p class="thnote">' + esc(notes.cart) + '</p>' : '') +
        '<h3>Top-ups for the same kit</h3>' + listHtml(extras.rows) + (extras.total ? '<p class="thnote">About $' + Math.round(extras.total) + ' for the ' + (noPh ? 'feed bottle' : 'three bottles') + '. They are not part of the kit total or of Spent.</p>' : '');
    }
    function visitHtml() {
      const v = THOME_VISIT;
      return '<h3>Visit the shop</h3><div class="thvisit"><p><b>' + esc(v.name) + '</b><br>' + esc(v.street) + '<br>' + esc(v.suburb) + '</p>' +
        '<p>Phone <a href="tel:' + v.phoneTel + '">' + esc(v.phone) + '</a></p>' +
        '<table class="thhours" aria-label="Opening hours"><tbody>' + v.hours.map(h => '<tr><td>' + esc(h[0]) + '</td><td>' + esc(h[1]) + '</td></tr>').join('') + '</tbody></table>' +
        '<p><a class="big" id="thDir" href="' + esc(thomeDirections()) + '" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">Directions</a></p></div>';
    }
    function paint() {
      const url = shareUrl();
      el.innerHTML = '<div class="card thcard"><h2>Take this home</h2><p>This is the gear you grew with.</p>' + gearHtml() + '<p><b>Ask the team about it in store.</b></p>' + visitHtml() +
        '<h3>Keep growing at home</h3>' + (url ? '<p>Open this link on any phone or computer and carry on.</p><div class="thurl"><code id="thUrl">' + esc(url) + '</code><button class="ghost" id="thCopy" type="button">Copy</button></div>' : '<p>Search for HyGrow Grow Sim on your phone or computer and carry on.</p>') +
        '<div class="foot"><button class="big" id="thDone" type="button">Back to the game</button></div></div>';
      const b = id => el.querySelector(id), cb = b('#thCopy');
      b('#thDone').onclick = () => { Sfx.play('click'); close(); };
      if (cb) cb.onclick = () => { Sfx.play('click'); copy(url, ok => { cb.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(() => { cb.textContent = 'Copy'; }, 2200); }); };
      const f = b('#thDone'); if (f && f.focus) f.focus();
    }
    function show(cb) {
      css();
      if (!el) { el = document.createElement('div'); el.className = 'modal'; el.id = 'takeHome'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Take this home'); el.addEventListener('click', e => { if (e.target === el) close(); }); document.body.appendChild(el); }
      after = typeof cb === 'function' ? cb : null; prev = speed; if (S) setSpeed(0);
      paint(); el.classList.add('show'); try { Sfx.play('uiOpen'); } catch (e) {}
      try { el.scrollTop = 0; const c = el.querySelector('.card'); if (c) c.scrollTop = 0; } catch (e) {}
    }
    function close() {
      if (!el || !el.classList.contains('show')) return;
      el.classList.remove('show'); try { Sfx.play('uiClose'); } catch (e) {}
      if (S && mode !== 'beginner' && prev > 0 && !endShown) setSpeed(prev);
      const cb = after; after = null; if (cb) { try { cb(); } catch (e) { console.warn(e); } }
    }
    addEventListener('keydown', e => { if (e.key === 'Escape' && el && el.classList.contains('show')) close(); });
    /* beginner.js: once per browser, and never for a returning player; then go on with the lesson (cb runs when the card closes, or at once if it was not shown) */
    function maybe(cb) { if (seen() || returning()) { if (cb) cb(); return false; } mark(); show(cb); return true; }
    return { show, maybe, close, isOpen: () => !!el && el.classList.contains('show') };
  })();
  window.TakeHome = TakeHome;

  /* the speaker icon and the first-visit chip share this: on = true turns sound on (the chip), otherwise it flips the current state */
  function setSound(on) {
    Sfx.init(); Sfx.mute(on === true ? false : !Sfx.isMuted());
    const ic = Sfx.isMuted() ? '\u{1F507}' : '\u{1F50A}', m = $('#mute'); if (m) m.textContent = ic;
    const b = $('#bgStrip .bgs-mute'); if (b) b.textContent = ic;
    const tm = $('#titleMute'); if (tm) { tm.textContent = ic; tm.setAttribute('aria-pressed', Sfx.isMuted() ? 'false' : 'true'); } /* [M28] */
    SoundChip.hide();
  }
  /* --------- first-visit chip: sound starts off, one small chip says how to turn it on (audio.js decides; tapping the chip or the mute button settles it for good) --------- */
  const SoundChip = (function () {
    let el = null;
    function place() { if (!el) return; const h = document.querySelector('header'), st = $('#bgStrip'); const b = Math.max(h ? h.getBoundingClientRect().bottom : 0, st ? st.getBoundingClientRect().bottom : 0); el.style.top = Math.max(8, Math.round(b) + 6) + 'px'; }
    function hide() { if (!el) return; el.remove(); el = null; removeEventListener('resize', place); }
    function show() {
      if (el || !(Sfx.needsChip && Sfx.needsChip())) return;
      el = document.createElement('button'); el.type = 'button'; el.id = 'soundChip'; el.textContent = 'Sound is off \u00b7 tap here to turn on'; /* v37 [M28] the chip is the switch */
      el.onclick = () => setSound(true); /* the chip text does what the speaker icon does: sound on, chip gone */
      document.body.appendChild(el); place(); setTimeout(place, 60); addEventListener('resize', place);
    }
    return { show, hide };
  })();

  /* ====================================================================================================================
     v36b (docs/PLAYTEST-SAM-v36.md, cold play-test at 375 px): never pause on something the thumb cannot reach, never move the page on a bar tap,
     trouble chips under the sticky header, toasts and cards that stay off the bubble, a clock that waits behind sheets.
     ==================================================================================================================== */
  const V36B = (function () {
    const root = document.documentElement;
    let lastBarTap = -1e9, reachT = 0, userPause = false, troubleSig = '';
    const phone = () => mqSmall.matches;
    const vis = el => { if (!el || !el.getClientRects().length) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
    /* the page's own "stuck" chrome: header, the lesson strip, the trouble chips. CSS vars feed their sticky tops and the fixed bubble's top (--hdrb). */
    function chrome() {
      try {
        const hd = document.querySelector('header'), st = $('#bgStrip'), tr = $('#trouble');
        const hh = hd ? hd.offsetHeight : 0, sh = st && vis(st) ? st.offsetHeight : 0, th = tr && !tr.hidden && vis(tr) ? tr.offsetHeight : 0;
        root.style.setProperty('--hdrh', hh + 'px'); root.style.setProperty('--striph', sh + 'px'); root.style.setProperty('--troubleh', th + 'px');
        root.style.setProperty('--hdrb', (hh + sh + th + 4) + 'px');
      } catch (e) {}
    }
    /* the lowest y of everything stuck to the top right now (rects, so it is right at any scroll position and at any width) */
    function chromeBottom() {
      let b = 0;
      ['header', '#bgStrip', '#trouble'].forEach(sel => { const el = document.querySelector(sel); if (el && !el.hidden && vis(el)) { const q = el.getBoundingClientRect(); if (q.height) b = Math.max(b, q.bottom); } });
      return Math.max(0, b);
    }
    /* the highest y of what is fixed at the bottom: the action bar, and the pager pill when it floats over the page */
    function floorY() {
      let y = innerHeight;
      const bar = $('#actionbar'); if (bar && !bar.classList.contains('open')) y = Math.min(y, bar.getBoundingClientRect().top);
      const pill = $('#stripDots');
      if (pill && !pill.hidden && vis(pill)) { const ps = getComputedStyle(pill).position; if (ps === 'fixed' || ps === 'sticky') { const q = pill.getBoundingClientRect(); if (q.height && q.top < y) y = q.top; } }
      return y;
    }
    /* any bar tap: nothing may scroll the page for the next 2.5 s (beginner.js bringIn, cards.js reveal, spotScroll, reachSpot and keepInView all ask) */
    window.NoScroll = () => performance.now() - lastBarTap < 2500 || performance.now() < (window.__quietScrollUntil || 0); /* v41 [M10] also quiet for the first seconds of a new grow */
    const barTap = e => { if (e.target && e.target.closest && e.target.closest('#actionbar')) lastBarTap = performance.now(); };
    document.addEventListener('pointerdown', barTap, true); document.addEventListener('click', barTap, true);

    /* ---- 1. Axel's bubble: its button is always reachable while the clock waits for it ---- */
    function bubbleBtnVisible() {
      const b = $('#bubble'); if (!b || !b.classList.contains('show')) return true;
      const btn = b.querySelector('button.next'); if (!btn) return true;
      const q = btn.getBoundingClientRect(), top = chromeBottom(), bot = floorY();
      return q.width > 0 && q.top >= top - 1 && q.bottom <= bot + 1 && q.left >= -1 && q.right <= innerWidth + 1;
    }
    function reachBubble(reserve) {
      if (!phone()) return;
      const b = $('#bubble'); if (!b || !b.classList.contains('show') || b.style.display === 'none') return;
      try { if (Mob.inStrip() && Mob.curPanel() !== 0) Mob.goPanel(0, false); } catch (e) {} /* the pager must be on Axel's page */
      if (getComputedStyle(b).position === 'fixed') return; /* the spotlit bubble floats under the chrome, nothing to do */
      const q = b.getBoundingClientRect(), top = chromeBottom() + 8, bot = floorY() - 8;
      let dy = 0;
      if (q.bottom + (reserve || 0) > bot) dy = q.bottom + (reserve || 0) - bot;
      if (q.top - dy < top) dy = q.top - top; /* never push the bubble's top under the header */
      if (Math.abs(dy) > 1) scrollBy({ top: dy, left: 0, behavior: 'auto' });
    }
    function armReach(m) {
      clearTimeout(reachT);
      if (cur !== m || !S) return;
      reachBubble(0);
      if (!holdsFor(m.opts)) return;
      setTimeout(() => { if (cur === m) reachBubble(0); }, 700);
      reachT = setTimeout(() => {
        if (cur !== m || !holdsFor(m.opts) || bubbleBtnVisible()) return;
        /* the button is still not on screen after 5 s: stop holding the clock, keep the bubble */
        m.opts = Object.assign({}, m.opts, { nohold: true });
        if (speed === 0 && !userPause) setSpeed(1); else if (speed > 1) setSpeed(1);
        toast('Carrying on at 1x. Axel will wait for you.', 2600);
      }, 5000);
    }
    /* ---- 2. trouble chips: one per orange or red tile, under the header; a tap goes to that tile ---- */
    /* v41 [M14] one row only: the worst two tiles on a phone (three elsewhere) and a "+N" chip that opens the first hidden one */
    const chipCap = (items, cap) => items.length <= cap ? { shown: items.slice(), more: [] } : { shown: items.slice(0, cap), more: items.slice(cap) };
    window.chipCap = chipCap;
    function paintTrouble() {
      const host = $('#trouble'); if (!host) return;
      const tiles = [...document.querySelectorAll('#readings .rd.bad, #readings .rd.warn')];
      const ord = t => (t.classList.contains('bad') ? 0 : 1);
      tiles.sort((a, b) => ord(a) - ord(b));
      const capd = chipCap(tiles, phone() ? 2 : 3);
      const html = capd.shown.map(t => {
        const k = t.dataset.reading, bb = t.querySelector('b'), em = bb && bb.querySelector('em'), unit = em ? em.textContent : '';
        const num = bb ? (bb.firstChild && bb.firstChild.nodeType === 3 ? bb.firstChild.textContent : bb.textContent.replace(unit, '')) : '';
        const lab = ((t.querySelector('span') || {}).textContent || k).replace(/\s*LIVE\s*$/, '').trim(), cls = t.classList.contains('bad') ? 'bad' : 'warn';
        return `<button type="button" class="tc ${cls}" data-k="${k}" aria-label="${escH(lab)} is ${cls === 'bad' ? 'red' : 'orange'}, ${escH(num + ' ' + unit)}. Show the tile."><span class="tl">${escH(lab)}</span><span class="tn">${escH(num)}${unit ? ' ' + escH(unit) : ''}</span><i aria-hidden="true">&#9662;</i></button>`; /* v41: the label shortens with an ellipsis, the number never does */
      }).join('') + (capd.more.length ? `<button type="button" class="tc more ${capd.more.some(t => t.classList.contains('bad')) ? 'bad' : 'warn'}" data-k="${capd.more[0].dataset.reading}" aria-label="${capd.more.length} more tiles need a look. Show the first.">+${capd.more.length}</button>` : '');
      if (html === troubleSig) return;
      troubleSig = html; host.innerHTML = html; host.hidden = !html; chrome();
    }
    function gotoTile(k) {
      const tile = document.querySelector('#readings .rd[data-reading="' + k + '"]'); if (!tile) return;
      try { if (Mob.inStrip() && Mob.curPanel() !== 1) Mob.goPanel(1, false); } catch (e) {}
      const q0 = tile.getBoundingClientRect(), top = chromeBottom() + 8, bot = floorY() - 8;
      const headSeen = q0.top >= top && q0.top + Math.min(q0.height, 64) <= bot; /* v37 [M10] a tile whose top row is on screen needs no scroll, however tall it is open */
      if (headSeen) { /* stay */ } else if (q0.top < top) scrollBy({ top: q0.top - top - 4, left: 0, behavior: 'auto' }); else if (q0.bottom > bot) scrollBy({ top: Math.max(0, Math.min(q0.bottom - bot, q0.top - top - 4)), left: 0, behavior: 'auto' }); /* v41 [M10] the least scroll that shows the opened tile, never past its top under the chrome */
      try { if (window.Fx && Fx.flash) Fx.flash(tile, tile.classList.contains('bad') ? 'bad' : 'warn'); } catch (e) {}
    }
    /* ---- 7. a toast never sits on Axel's bubble: bottom (above the bar) by default, under the chrome when the bubble is down there ---- */
    function placeToast(el) {
      if (!el || !phone()) return;
      el.dataset.pos = '';
      const b = $('#bubble'), bq0 = b && b.classList.contains('show') && b.style.display !== 'none' && b.getClientRects().length ? b.getBoundingClientRect() : null;
      /* v41 [m2] a Take-home list (or any list inside an open modal) counts like the bubble: the toast moves off it */
      const tl = document.querySelector('.modal.show .thlist'), lq = tl && tl.getClientRects().length ? tl.getBoundingClientRect() : null;
      const bq = bq0 && lq ? { top: Math.min(bq0.top, lq.top), bottom: Math.max(bq0.bottom, lq.bottom) } : bq0 || lq; if (!bq) return;
      const h = el.offsetHeight || 44, bar = floorY(), hit = (a, c) => bq.bottom > a && bq.top < c;
      if (hit(bar - 14 - h, bar - 14)) { const t0 = chromeBottom() + 8; if (!hit(t0, t0 + h)) el.dataset.pos = 'top'; }
    }
    /* ---- 9. the clock waits behind Almanac, Journal, Grower's card, the More sheet and every other sheet ---- */
    const sheetHold = () => !!S && !!document.querySelector('.modal.show, #actionbar.open');
    /* ---- 6. the pager: hidden while it has one page; in the lesson (pages stacked in a column) a dot scrolls to its page ---- */
    function syncPager() {
      const host = $('#stripDots'), side = document.querySelector('.side'); if (!host || !side) return;
      const pages = [...side.children].filter(c => c.getClientRects().length > 0 && getComputedStyle(c).display !== 'none');
      host.hidden = pages.length <= 1;
      const pill = host.getBoundingClientRect().height || 48; root.style.setProperty('--pillh', Math.round(pill) + 'px');
      document.body.classList.toggle('pager-hidden', host.hidden);
    }
    function init() {
      const tr = $('#trouble');
      if (tr) tr.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (!b) return; try { Sfx.play('click'); } catch (er) {} const kk = b.dataset.k; if (!rdOpen.has(kk)) rdOpen.add(kk); render(false); if (!holding()) gotoTile(kk); /* v36d: never scroll Axel's Got it under the header while the clock waits on it */ sayWhy(kk); });
      chrome(); syncPager();
      if (window.ResizeObserver) { try { const ro = new ResizeObserver(() => { chrome(); syncPager(); }); ['header', '#bgStrip', '#trouble'].forEach(s => { const el = document.querySelector(s); if (el) ro.observe(el); }); const sd = document.querySelector('.side'); if (sd) ro.observe(sd); } catch (e) {} }
      new MutationObserver(() => { chrome(); syncPager(); }).observe(document.body, { childList: true, attributes: true, attributeFilter: ['class'] });
      addEventListener('resize', () => { chrome(); syncPager(); });
    }
    /* v36d: play-test #6. (1) the clock was held for minutes with Got it scrolled under the header (a chip tap, a scroll): after 5 s off screen the hold is dropped, the bubble stays. (2) a "why red" line whose tile is back in the green goes away on its own. */
    let hidAt = 0, lastCur = null;
    function holdWatch() {
      try {
        if (cur !== lastCur) { lastCur = cur; hidAt = 0; holdOff = false; }
        if (cur && cur.opts && cur.opts.why && typeof cur.opts.stale === 'function' && cur.opts.stale() && performance.now() - (cur.opts.shownAt || 0) > 1500) { advance(true); return; }
        const holds = !!cur && (holdsFor(cur.opts) || sayQueue.some(m => holdsFor(m.opts)));
        if (!phone() || !holds || bubbleBtnVisible()) { hidAt = 0; holdOff = false; return; }
        const now = performance.now(); if (!hidAt) { hidAt = now; return; }
        if (now - hidAt < 5000 || holdOff) return;
        holdOff = true;
        if (speed === 0 && !userPause) setSpeed(1); else if (speed > 1) setSpeed(1);
        toast('Carrying on at 1x. Axel will wait for you.', 2600);
      } catch (e) {}
    }
    return { init, chrome, chromeBottom, floorY, reachBubble, armReach, bubbleBtnVisible, paintTrouble, placeToast, sheetHold, syncPager, holdWatch, userPaused: v => { userPause = !!v; }, isUserPaused: () => userPause };
  })();
  window.Bubble = { busy: () => !!cur, reach: () => V36B.reachBubble(0), visible: () => V36B.bubbleBtnVisible() };

  /* --------- boot --------- */
  function boot() {
    tentBg = mountTentBg(); loadSceneNames();
    scene = Art.scene($('#tent'), 400, 520, { painted: !!tentBg });
    const qsvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); qsvg.setAttribute('viewBox', '0 0 200 260'); qsvg.setAttribute('class', 'quinn-svg'); $('#quinn').prepend(qsvg);
    quinn = Art.quinn(qsvg);
    scene.setPlant({ crop: 'tomato', stage: 0, size: 0.05, health: 100, seed: 3 }); scene.setReservoir(0.8, true);
    /* v54: painted crop sprites (art/plants/plants.json, cut by art/tools/cut_plants.py); a crop with no sprites keeps the drawn plant. Loaded after first paint, never on the critical path. */
    try { fetch('art/plants/plants.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(m => { if (!m || !Art.setPlantSprites) return; Art.setPlantSprites(m); try { if (S) drawPlant(); else scene.setPlant({ crop: 'tomato', stage: 0, size: 0.05, health: 100, seed: 3 }); } catch (e) {} }).catch(() => {}); } catch (e) {}
    buildDock();
    $('#tent').addEventListener('click', tapPlant); $('#quinn').addEventListener('click', tapAxel);
    { const sg = $('#slotStrip'); if (sg) sg.addEventListener('click', e => { const b = e.target.closest('button[data-slot]'); if (b) pickSlot(+b.dataset.slot); }); }
    try { PHONE_MQ.addEventListener('change', () => { renderSlots(); setWx(wxKind); }); } catch (e) {} /* v58: the slot strip and the weather chip change home when the screen crosses 600 px */
    document.querySelectorAll('#speedbtns button').forEach(b => b.onclick = () => {
      Sfx.init(); Sfx.play('click');
      const s = +b.dataset.s, plan = speedTapPlan(s, { fanHold: fanHeld(), talking: !!S && holding(), pauseTold });
      if (s === 0) pauseTold = true;
      V36B.userPaused(s === 0);
      if (plan.speed != null) setSpeed(plan.speed);
      if (plan.toast) toast(plan.toast, 3200); /* every refused or surprising speed tap says why */
      if (s === 8 && !plan.toast) tell8();
    });
    $('#go').onclick = setupNext;
    if (window.Daily) Daily.mountHud(document.querySelector('#hextras'));
    $('#jbtn').onclick = () => { Sfx.play('click'); showJournal(); }; $('#jclose').onclick = () => { Sfx.play('click'); closeJournal(); };
    $('#relink').onclick = () => { Sfx.init(); Sfx.play('click'); reconnect(); };
    $('#again').onclick = () => { const wasCamp = !!camp; Mob.afterHarvest(); $('#harvest').classList.remove('show'); Sfx.play('whoosh'); flushSay(); S = null; stopLive(); if (wasCamp) { Campaign.clear(); camp = null; openCampaignMenu(); } else showTitle(); };
    $('#campBack').onclick = () => { Sfx.play('click'); $('#campaign').classList.remove('show'); campBgOff(); showTitle(); };
    if (window.Cart) Cart.renderChip($('#cartChip'));
    Mob.init(); V36B.init();
    /* v36b: the Grower's card from More opens on the crop the player is growing (it opened on Tomato in a lesson, which has no save to peek at) */
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#growersBtn'); if (!b || !S || !S.cropId || !window.Growers || !Growers.open) return; e.stopImmediatePropagation(); e.preventDefault(); try { Sfx.play('click'); } catch (er) {} try { Mob.closeSheet(); } catch (er) {} Growers.open(S.cropId); }, true);
    /* v36: the old tablet dock hack (dockTabletCss) is gone: one rule set in index.html (#actionbar grid, --cols from BarLayout) */
    { const hx = $('#hextras'); if (hx && !$('#thBtn')) { const tb = document.createElement('button'); tb.id = 'thBtn'; tb.type = 'button'; tb.className = 'menu'; tb.title = 'Take this home'; tb.textContent = 'Take home'; tb.onclick = () => { Sfx.play('click'); Mob.closeSheet(); TakeHome.show(); }; const mb = $('#menu'); hx.insertBefore(tb, mb && mb.parentNode === hx ? mb : null); } }
    { const hx2 = $('#hextras'); if (hx2 && !$('#liveBtn') && window.LiveLink) { const lb = document.createElement('button'); lb.id = 'liveBtn'; lb.type = 'button'; lb.className = 'menu'; lb.title = 'Live link'; lb.textContent = 'Live link'; lb.onclick = () => goLive(); const mb2 = $('#menu'); hx2.insertBefore(lb, mb2 && mb2.parentNode === hx2 ? mb2 : null); } }
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => chooseMode(b.dataset.mode));
    addEventListener('keydown', e => { if (e.key !== 'Escape' || e.defaultPrevented) return; const t = $('#title'), cb = $('#continue'); if (S && t && t.classList.contains('show') && cb && !cb.hidden && cb.offsetWidth && !document.querySelector('.modal.show:not(#title)')) { e.preventDefault(); cb.click(); } }); /* v41 [m1] Esc closes the Menu (the title card reached from the game) the same way Continue does */
    $('#menu').onclick = () => { Sfx.init(); if (MenuModal.wanted()) { MenuModal.open(); return; } Sfx.play('whoosh'); flushSay(); setSpeed(0); save(); stopLive(); showTitle(); };
    $('#back').onclick = setupBack;
    $('#mute').onclick = () => setSound();
    { const tm = $('#titleMute'); if (tm) { tm.onclick = () => setSound(); try { tm.textContent = Sfx.isMuted() ? '\u{1F507}' : '\u{1F50A}'; tm.setAttribute('aria-pressed', Sfx.isMuted() ? 'false' : 'true'); } catch (e) {} } const cb = $('#creditsBtn'); if (cb) cb.onclick = () => { Sfx.play('click'); Credits.open(); }; const sx = $('#sheetExtras'); if (sx && !$('#volRow')) sx.appendChild(volumeRow()); } /* v37 [M28] title speaker, Credits, Volume in the More sheet */
    installFailNotes();
    try { $('#mute').textContent = Sfx.isMuted() ? '\u{1F507}' : '\u{1F50A}'; } catch (e) {}
    setSpeed(1);
    /* title loop: Axel waves every 12 to 16 s and hops every 25 to 35 s; the shopfront steps day (12) -> dusk (18) -> night (22) -> day every 18 s, starting from the real clock.
       Runs only while the title is shown, the tab is visible and motion is allowed; every timer is cleared on hide. */
    let tlTimers = null, tlHour = new Date().getHours();
    const titleShown = () => $('#title').classList.contains('show');
    const titleLoopStop = () => { if (!tlTimers) return; clearTimeout(tlTimers.wave); clearTimeout(tlTimers.hop); clearInterval(tlTimers.bg); tlTimers = null; };
    function titleLoopStart() {
      if (tlTimers || reduceMotion() || document.hidden || !titleShown()) return;
      const T = tlTimers = {}, rnd = (a, b) => a + Math.random() * (b - a), ok = () => tlTimers === T && tq && titleShown() && !document.hidden;
      const wave = () => { T.wave = setTimeout(() => { if (ok()) { try { tq.wave(2000); } catch (e) {} } if (tlTimers === T) wave(); }, rnd(12000, 16000)); };
      const hop = () => { T.hop = setTimeout(() => { if (ok()) { try { tq.hop(); } catch (e) {} } if (tlTimers === T) hop(); }, rnd(25000, 35000)); };
      wave(); hop();
      if (window.Scene && Scene.setHour) T.bg = setInterval(() => {
        if (!ok()) return;
        tlHour = tlHour >= 6 && tlHour < 17 ? 18 : tlHour >= 17 && tlHour < 20 ? 22 : 12;
        try { Scene.setHour($('#title-bg'), tlHour); } catch (e) {}
      }, 18000);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) titleLoopStop(); else titleLoopStart(); });
    (function () { const t = $('#title'), bg = $('#title-bg'); const sync = () => { if (!window.Scene) return; if (t.classList.contains('show')) { if (!bg.firstChild) Scene.mount(bg, 'shopfront_title', reduceMotion() ? { aspect: false } : { aspect: false, hour: tlHour }); titleLoopStart(); } else { Scene.unmount(bg); titleLoopStop(); } }; new MutationObserver(sync).observe(t, { attributes: true, attributeFilter: ['class'] }); sync(); })();
    showTitle();
    tq = Art.quinn(document.querySelector('#titleAxel')); (function tl(t) { if (!document.hidden && $('#title').classList.contains('show') && !(capFps() && t - (tl.l || 0) < 30)) { tl.l = t; tq.update(t); } requestAnimationFrame(tl); })(0); setTimeout(() => tq.wave(2000), 600);
    titleSay(introOnce("G'day, I'm Axel. Where are we growing?", 'Back again. Where are we growing?')); /* v36: one short line, typed on the title; nothing else is said before the plant is in */
    requestAnimationFrame(loop);
    try { document.documentElement.classList.remove('booting'); const sp = document.getElementById('splash'); if (sp) sp.remove(); } catch (e) {} /* v41 splash done: the title is up */
  }
  window.addEventListener('DOMContentLoaded', boot);
  window.__game = { startWith, restoreLesson, hintFor, save, setMode(m) { mode = m; if (S) S.__tipAfter = gameHrs() + 30; }, get mode() { return mode; }, afterHarvest: () => { try { Mob.afterHarvest(); } catch (e) {} }, /* v56 (play-test #12 #11): the lesson's end card asks for the install chip too */ buildDock, methodOf, selSlot, speedHeld: fanHeld, get frames() { return frames; }, get S() { return S; }, get live() { return live; }, doAct, setSpeed, catchUp(h, pre) { const events = [], before = S ? Sim.readings(S) : null; for (let i = 0; i < h && S && !endShown; i++) { if (pre) pre(S); let r; try { r = Sim.tick(S, 1); } catch (e) { r = null; } if (r) { if (r.state) S = r.state; (r.events || []).forEach(e => events.push(e)); if (camp && S && window.Campaign) Campaign.onTick(S, campHooks(), (r.events || []).map(e => e.id)); } if (S && Sim.readings(S).cropDone) break; } if (S) { prevSev = null; render(true); save(); } return { events, before, after: S ? Sim.readings(S) : null }; }, step(h) { for (let i = 0; i < h && S; i++) { const r = Sim.tick(S, 1); if (r) { if (r.state) S = r.state; handleEvents(r.events); trackRefill(); if (camp && S) Campaign.onTick(S, campHooks(), (r.events || []).map(e => e.id)); } } render(false); } };
})();
