/* HyGrow Grow Sim - beginner.js : the guided method scripts of "Start growing". Global: window.Beginner.
   v36 design pass (Trev played v35: "the game still feels very long on the dialog side to start up and not enough player interaction"): the warm-up (three pokes) and the 12-step lesson are gone.
   The sim starts at once with the player's own plant; Axel says ONE line (method-specific, 14 words or fewer) and the first button glows. FOUR short scripts of five steps, one per way of growing:
   soil: water, feed, lights or shade, prune, pick. coco: feed, pH, water, drip, pick. hydro: mix, pH, top up, lights, pick. tower: plant, mix, pH, top up, pick a slot.
   A step is one line and one glowing button, started by the sim's own state (a tile going orange, the tank dropping, fruit ripening). The whole bar and every tile stay visible. Skip is always on the strip.
   Contextual coaching: the first time a tile goes orange Axel says one line naming the button and the direction (ui.js __game.hintFor); the "You just learned" card (cards.js) comes on the first use of each control (ui.js doAct), not up front.
   Hooks (ui.js, one line each): chooseMode('grow') -> setup -> startGame -> Beginner.attach(); Beginner.start() (Menu replay, Continue) starts a fresh sim with the last method; showTitle -> Beginner.mountTitle(#title);
   handleEvent -> Beginner.onEvent(ev); save() skips mode 'beginner'. CSS lives in index.html <style id="beginnerCss">. Emits document 'hygrow:learned' {id,title,text} (cards.js shows them).
   Storage: localStorage hygrow_beginner_v1 = {done:true, when, replays?, lastReplay?, method?} (or {skipped:true}). A replay (Menu) runs the script again: nothing already earned is paid twice (Mates only when not done before,
   Cards.show only pays an unseen id, ui.js skips Daily ticks), `when` keeps the first finish date, and no save is touched (mode 'beginner' never saves). The sim loop in ui.js is not rewritten: the clock is steered with
   __game.setSpeed (3x while watching, 6x on the long wait for fruit, 1x and at most 6 game hours while the player owes an action) and a 200 ms poll.
   Resume: hygrow_beginner_progress_v1 = {v:1, savedAt, step: run.i, method, crop, sim: Sim.serialize(S), extra: {cost,fan,hum,refills,rot,tw,ti} (as the main save), flags: {ph, tankDone, problemDone, phCorrected, phDriftTold, replaying, cool, coached}}.
   saveProgress() runs from ui.js save() while mode is 'beginner' (hide / pagehide / every action / day boundary) and at every step advance; it never touches the main save.
   Skip: Beginner.skip() ends the script, keeps the same grow running and hands it to Learn mode (contextual tips). Leave: back to the title.
   Earlier passes kept: a step that waits for the game says what it waits for (strip + one bubble) and keeps its watch speed; hints name the control AND the direction; a tap on the asked button dismisses its own bubble;
   "Take this home" opens once after the first real step for a first-timer; an experienced player (a finished grow, or 5 or more Almanac entries) keeps 3x through a task unless a tile is red (window.SpeedGuard). */
(function () {
  'use strict';
  var LS = 'hygrow_beginner_v1', PROG = 'hygrow_beginner_progress_v1', SAVE = 'hygrow_growsim_save_v1', CAP = 6, WATCH_SPEED = 3, PH_DRIFT = 'pH creeps up as the plant drinks. A small nudge every few days is normal.', ISSUE_FROM = 2, AFTER_MS = 12000; /* ISSUE_FROM: nudges (pH / feed / tank lessons) start after step 2; AFTER_MS: real-time cap on an "after" watch (the sim may be throttled or the tab hidden) */
  var REPLAY_CONFIRM = 'Start the guided grow again? Your current grow is saved.', replaying = false;
  /* title card copy: pure, so it can be tested (done = the guided grow has been finished before) */
  function titleCopy(done, step, total) { if (step > 0) return { title: 'Continue the lesson (step ' + step + ' of ' + (total || 5) + ')', blurb: 'Pick up right where you left off.' }; return done ? { title: 'Play the lesson again', blurb: 'About 10 minutes with Axel at 3x, any time.' } : { title: 'Guided lesson', blurb: 'A five-step practice grow, one tap at a time.' }; }
  var $ = function (s) { return document.querySelector(s); };
  var G = function () { return window.__game; };
  var S = function () { var g = G(); return g && g.S; };
  var hrs = function () { var s = S(); return s ? (s.t || 0) : 0; };
  var reads = function () { try { return Sim.readings(S()); } catch (e) { return null; } };
  var reduce = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function lsGet() { try { return JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch (e) { return {}; } }
  function lsSet(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  /* mid-lesson progress (see the header): progGet() is null for a missing, corrupt or out-of-range blob */
  function progGet() {
    try {
      var j = JSON.parse(localStorage.getItem(PROG) || 'null');
      return j && j.v === 1 && typeof j.sim === 'string' && typeof j.step === 'number' && j.step >= 0 && j.step < 12 ? j : null;
    } catch (e) { return null; }
  }
  function progClear() { try { localStorage.removeItem(PROG); } catch (e) {} }
  /* the step to resume at: a save made while a step was only watching the clock after the player's tap ('after') carries on at the next step, so a mix is not asked for twice */
  function progIndex(p) { var i = Math.floor(p.step) || 0; if (p.flags && p.flags.ph === 'after') i++; return Math.max(0, Math.min(scriptLen(p.method) - 1, i)); }
  /* any Campaign progress (Campaign.progress() from campaign.js, or any hygrow_campaign_* key) means a returning player */
  function hasCampaign() {
    try {
      if (window.Campaign && Campaign.progress) {
        var p = Campaign.progress();
        if (p && (p.unlocked > 0 || p.mates > 0 || (p.done && p.done.length) || (p.sideDone && p.sideDone.length) || (p.log && p.log.length) || (p.flags && Object.keys(p.flags).length))) return true;
      }
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('hygrow_campaign_') === 0) return true; }
    } catch (e) {}
    return false;
  }
  function isFirst() { try { return !localStorage.getItem(SAVE) && !localStorage.getItem(LS) && !hasCampaign(); } catch (e) { return false; } }
  /* Almanac entries that are the player's own: the lesson itself records basil and its kit (startGame -> Almanac.seen), so those do not count as progress */
  var LESSON_KEYS = ['crop:basil', 'gear:tent120', 'gear:led300', 'gear:coco', 'gear:aqua2500', 'gear:ec', 'gear:ph', 'gear:thermo'];
  function almanacProgress() {
    try {
      var j = JSON.parse(localStorage.getItem('hygrow_almanac_v1') || 'null'), n = 0;
      if (j && j.seen) Object.keys(j.seen).forEach(function (k) { if (LESSON_KEYS.indexOf(k) < 0) n++; });
      return n;
    } catch (e) { return 0; }
  }
  /* a finished grow: the first-harvest flag (any mode) or the lesson done / skipped ("Not now, I know my way") */
  function grewBefore() { try { var l = lsGet(); return !!(l.done || l.skipped || localStorage.getItem('hygrow_first_harvest_v1')); } catch (e) { return false; } }
  /* experienced: a finished grow, or 5 or more Almanac entries of their own. returning: any sign this browser has played before (also a campaign or a real grow save), which is when "Take this home" never opens by itself */
  function experienced() { return grewBefore() || almanacProgress() >= 5; }
  function returning() { try { return grewBefore() || hasCampaign() || almanacProgress() > 0 || !!localStorage.getItem(SAVE); } catch (e) { return false; } }
  /* "G'day, I'm Axel" is said once per browser; after that the lesson opens with "Back again. Let's go." */
  var INTRO_KEY = 'hygrow_axel_intro_v1';
  function introSeen() { try { return !!localStorage.getItem(INTRO_KEY); } catch (e) { return false; } }
  var quiet = false; /* from start() until the player leaves: other modules' bubbles (Almanac "new entry", Daily, Events) stay out of the lesson */
  function say(text, o) { document.dispatchEvent(new CustomEvent('hygrow:say', { detail: { text: text, opts: Object.assign({ bg: true }, o || {}) } })); }
  document.addEventListener('hygrow:say', function (e) { if (quiet && !(e.detail && e.detail.opts && e.detail.opts.bg)) e.stopImmediatePropagation(); }); /* registered before ui.js's listener, so it runs first */
  function learned(l, silent) { if (l && replaying && !silent && window.Cards && Cards.has && Cards.has(l.id)) silent = true; /* a replay does not re-announce what the player already learned */ if (l) document.dispatchEvent(new CustomEvent('hygrow:learned', { detail: { id: l.id, title: l.title, text: l.text, silent: !!silent } })); }
  var curSpeed = function () { var b = $('#speed button.on'); return b ? +b.dataset.s : 1; };
  var setSp = function (n) { try { G().setSpeed(n); } catch (e) {} };
  /* the game never changes speed silently: a small toast (ui.js #toast) says why */
  function toast(t, ms) { try { document.dispatchEvent(new CustomEvent('hygrow:toast', { detail: { text: t, ms: ms } })); } catch (e) {} }
  function setSpWhy(n, why) { var was = curSpeed(); setSp(n); if (was !== n && why && curSpeed() === n) toast(why); } /* ui.js may clamp 3x (Fan just went Off): then there is nothing to announce */
  function toastClear() { try { document.dispatchEvent(new CustomEvent('hygrow:toastclear', { detail: { match: 'Paused' } })); } catch (e) {} } /* the player did the asked thing: a leftover "Paused: the clock waits" toast goes */
  var fanLevel = function () { var s = S(); return s && s.__fan != null ? s.__fan : 2; };
  function hint(k) { try { var g = G(); return g && g.hintFor ? g.hintFor(k) : null; } catch (e) { return null; } } /* direction-aware: {ctl, verb, why, rest, target, text} or null */
  function fanHeld() { try { var g = G(); return !!(g && g.speedHeld && g.speedHeld()); } catch (e) { return false; } }
  var userPaused = false; /* the player pressed II: never auto-resume over that */
  var userSlow = false, lastActAt = 0, remindKey = '', greenSince = null; /* userSlow: the player chose 1x for this step; lastActAt: real ms of the last dock tap */
  var RD_NAME = { moisture: 'Soil', ec: 'EC', ph: 'pH', airTemp: 'Air', rh: 'Humidity', vpd: 'VPD', waterTemp: 'Water', reservoirL: 'Tank', dli: 'Light' };
  var sel = function (a) { return '[data-act="' + a + '"]'; };
  var rdSel = function (k) { return '[data-reading="' + k + '"]'; };
  /* v36b: method-aware words. methodCopy(S) gives the nouns for the way of growing the player picked (tank vs pot vs bed, feed vs mix, no lights or fan outdoors) and
     gate(text) rewrites a line written for the tent + tank into this method's words. Every lesson line, learned card and Almanac fix goes through it (cards.js and almanac.js call window.methodCopy). */
  function methodCopy(s) {
    var st = s || (window.__game && window.__game.S) || null, m = (st && st.method) || {}, where = m.where || 'tent', how = m.how || 'hydro';
    var out = where !== 'tent', tank = how === 'hydro' || how === 'tower', vessel = tank ? 'tank' : where === 'outdoors' ? 'bed' : 'pot', root = how === 'soil' ? 'Soil' : how === 'coco' ? 'Coco' : 'Tank';
    var c = { where: where, how: how, out: out, tank: tank, pot: !tank, tent: !out, vessel: vessel, root: root, feed: tank ? 'Mix feed' : 'Feed', topUp: tank ? 'Top up' : 'Water', mix: tank ? 'mix' : 'feed',
      drink: tank ? 'tank' : vessel, hasLights: !out, hasFan: !out, cover: where === 'veranda' ? 'Bring in' : 'Cover',
      coldFix: !out ? 'Slow the fan, keep the lights on and warm the roots with a heat mat.' : where === 'veranda' ? 'Bring the pots in at night, or cover them with cloth.' : 'Cover the bed with frost cloth at night.' };
    c.gate = function (t) {
      t = String(t == null ? '' : t); if (c.tank && !c.out) return t;
      if (!c.tank) t = t.replace(/Keep the tank and tiles green/g, 'Keep the tiles green').replace(/\bMix feed\b/g, 'Feed').replace(/\bTop up\b/g, 'Water').replace(/\bthe tank\b/g, 'the ' + c.vessel).replace(/\btank\b/g, c.vessel).replace(/\bEC meter\b/g, 'meter');
      else t = t.replace(/\bthe tent\b/g, 'the ' + (c.where === 'veranda' ? 'veranda' : 'garden'));
      if (c.out) t = t.replace(/Slow the fan, keep the lights on[^.]*\./i, c.coldFix);
      return t;
    };
    return c;
  }
  window.methodCopy = methodCopy;

  /* ------------------------------------------------------------------ copy */
  var LEARN = {
    feed: { id: 'feed', title: 'Feed strength (EC)', text: 'Feed strength (EC) is how much food is in the water. The meter reads it.' },
    ph: { id: 'ph', title: 'pH', text: 'pH decides which food roots can grab. Most crops want about 5.5 to 6.5 (each has its own window). pH down lowers it, pH up raises it.' },
    light: { id: 'light', title: 'Light hours', text: 'Plants need a day and a night. Basil likes about 16 hours of light, then 8 of dark.' },
    water: { id: 'water', title: 'Topping up', text: 'Plants drink the tank down. Top up before it runs low so the roots never dry out.' },
    air: { id: 'air', title: 'Moving air', text: 'The fan moves air through the tent. More air means drier, cooler air. Still, damp air invites mould.' },
    prune: { id: 'prune', title: 'Pruning', text: 'Pinching the tops lets air in and makes basil bushy. Wait a few days between prunes.' },
    problem: { id: 'problem', title: 'Fixing problems', text: 'An orange or red tile means a job for you. Tap Ask Axel any time and I will point at the fix.' },
    harvest: { id: 'harvest', title: 'Harvest', text: 'Cut basil above a leaf pair. Cut about a third; two thirds stays and regrows, so you can cut again in a week.' },
    ready: { id: 'ready', title: 'You are ready for the Campaign', text: 'You grew your first basil. The Campaign is next: a whole season at HyGrow with the crew.' }
  };

  /* ------------------------------------------------------------- the picks */
  /* the method a lesson runs in: the player's own pick (ui.js attach), else the last one, else what the engine offers first. Without Sim.METHODS only tent + hydro exists. */
  function methodOk(m) {
    try {
      var M = window.Sim && Sim.METHODS;
      if (!M || !M.combos) return !!(m && m.where === 'tent' && m.how === 'hydro');
      return !!m && M.combos.some(function (c) { return c[0] === m.where && c[1] === m.how; });
    } catch (e) { return false; }
  }
  function defaultMethod() {
    var last = lsGet().method;
    if (methodOk(last)) return last;
    try { var M = window.Sim && Sim.METHODS; if (M && M.combos && M.combos.length) { var c = M.combos.filter(function (x) { return x[0] === 'tent' && x[1] === 'coco'; })[0] || M.combos[0]; return { where: c[0], how: c[1] }; } } catch (e) {}
    return { where: 'tent', how: 'hydro' };
  }
  function methodNow() { var s = S(); return (s && s.method && s.method.how) ? { where: s.method.where || 'tent', how: s.method.how } : { where: 'tent', how: 'hydro' }; }
  function mkPick(o) {
    var p = (window.PRESETS || []).filter(function (x) { return x.id === 'hobby'; })[0] || { tent: 'tent120', light: 'led300', air: 'aqua2500' };
    var m = (o && o.method && methodOk(o.method)) ? o.method : defaultMethod(), how = m.how;
    return { crop: (o && o.crop) || 'basil', budget: 1000, where: m.where, how: how, tent: p.tent, light: p.light, medium: how, air: (how === 'hydro' || how === 'tower') ? (p.air || 'aqua2500') : 'none', meters: how === 'soil' ? { ec: false, ph: false, thermo: true, par: false } : { ec: true, ph: true, thermo: true, par: false } };
  }

  /* --------------------------------------------------------------- scripts
     v36 design pass (Trev: "the game still feels very long on the dialog side to start up and not enough player interaction"): the 12-step lesson became FOUR short method scripts of 5 steps each, one per way of growing.
     Each step is one line and one glowing button, started by the sim's own state (a tile going orange, the tank dropping, fruit ripening). Nothing is hidden: the whole bar and every tile are on screen from the start; Skip is always on the strip.
     step = { title, talk:[lines] | (watch?, watchDays?, watchSay?, watchHl?, need[], hl, say, hint, waitFor(S,act,rd)), skipIf(rd), afterHrs, flash[], after(ctx), onDone, finale, hidden } */
  var cropWord = function () { var s = S(); try { var c = (Sim.CROPS || []).filter(function (x) { return x.id === (s && s.cropId); })[0]; return (c ? c.name : 'plant').toLowerCase(); } catch (e) { return 'plant'; } };
  var hasAct = function (a) { return !!$('[data-act="' + a + '"]'); };
  var tabAct = function (a) { var b = $('[data-act="' + a + '"]'); return b ? ((b.textContent || '').trim() || a) : a; };
  var lightTarget = function () { try { var t = Sim.stageInfo(S()).targets.photoperiod; return typeof t === 'number' ? t : 16; } catch (e) { return 16; } };
  /* v36b: the Soil / Coco step waits until the tile is actually LOW (below its target), so the lesson never says "Tap Water" over a tile that is already at or over target */
  var tileLow = function (k) { return function (s, r) { var v = r && r[k], t = r && r.targets && r.targets[k]; return typeof v === 'number' && Array.isArray(t) && v < t[0]; }; };
  var airHotDay = function (s, r) { var t = r && r.targets && r.targets.airTemp; return !!(r && r.lightsOn && typeof r.airTemp === 'number' && Array.isArray(t) && r.airTemp > t[1]); }; /* v36b: hot (above band) in daylight */
  var tileBad = function (k) { return function (s, r) { var c = tileState(k, r); return c === 'warn' || c === 'bad'; }; };
  var tankLow = function (s, r) { return !!(r && s.cap && r.reservoirL <= 0.5 * s.cap); };
  var pickRisk = function (s) { var P = (s && s.pr) || {}; return (P.bolt || 0) >= 1 || (P.tip || 0) >= 2; }; /* the same test as the engine's Pick it now advice */
  var ripeNow = function (s, r) {
    try { var g = G(), m = methodNow(); if (m.how === 'tower' && Sim.slotInfo) { return Sim.slotInfo(s).some(function (x) { return (x.ripeKg || 0) >= 0.02; }); } } catch (e) {}
    var rk = r && r.plant ? (r.plant.ripeKg || 0) : 0;
    /* v68 (play-test #19 m5): a pick-once crop is called ripe when it has filled out (the last stage, or half its best-case weight), or when waiting would cost it (starting to bolt, leaf edges burning); the first pickable head was a quarter of the yield */
    try { var C = window.CROP_DATA && CROP_DATA[s.cropId]; if (C && C.harvest === 'once' && !s.cropDone) { if (rk < 0.02) return false; var X = (C.yieldTarget || 0) * (s.plantedEver || s.nplants || 1); return !!(r.mature || (C.stages && s.stage >= C.stages.length - 1) || (X > 0 && rk >= 0.5 * X) || (rk >= Math.max(0.1, 0.25 * X) && pickRisk(s))); /* v69 (critic round 17 m3, play-test #20 m1): a bolting or tip-burnt head is called only once it is worth picking (0.1 kg and a quarter of the best case), not at 0.02 kg */ } } catch (e) {}
    return !!(r && r.plant && (rk > 0.1 || (r.mature && rk > 0.02))); /* v71 (play-test #21 M1): the reading is rounded to 0.01 kg, so 0.015 read 0.02 and a mature plant was picked for 0 kg and the crop ended */ /* v66 (play-test #18 M1): a mature plant with nothing to pick lit the Pick step while the button was disabled */
  };
  /* the line that starts each script (14 words or fewer): the plant is in, here is the first job */
  var OPEN = {
    soil: function () { return 'Your ' + cropWord() + "'s in. Water it when the Soil tile goes orange."; },
    coco: function () { return 'Your ' + cropWord() + "'s in. Feed when the Coco tile goes orange."; },
    hydro: function () { return 'Your ' + cropWord() + "'s in. Tap Mix feed to get food in the tank."; },
    tower: function () { return 'Your ' + cropWord() + "'s in. Tap Plant to fill the slots, then Mix feed."; }
  };
  var S_MIX = function (first) { return { title: 'Mix the feed', tap: 'Mix feed', reads: ['ec'], need: ['mix'], hl: sel('mix'), say: first ? OPEN.hydro : 'Tap Mix feed to add plant food to the tank.', hint: 'Tap the glowing Mix feed button when you are ready.',
    waitFor: function (s, a) { return a === 'mix'; }, afterHrs: 2, flash: ['ec'], after: function () { return 'EC is how strong the feed is. Green means go.'; } }; };
  var S_PH = { title: 'Check the pH', tap: function (r) { return r && r.ph != null && r.targets && r.targets.ph && r.ph < r.targets.ph[0] ? 'pH up' : 'pH down'; } /* v58 (critic round 9 nit #7): under the band floor is pH up, even where the tile still reads green */, reads: ['ph'], need: ['phDown'], skipIf: function (r) { return !r || r.ph == null || !r.targets || !r.targets.ph; },
    hl: function (r) { return r && r.ph != null && r.targets && r.ph < r.targets.ph[0] ? sel('phUp') : sel('phDown'); },
    say: function () { /* v53 (play-test #11 #1): the line follows the reading; the tile is green to 0.4 over the stage range, so 6.3 on a 5.8 to 6.2 stage was green and the old line called it high */
      var r = reads(), t = r && r.ph != null && r.targets && r.targets.ph ? r.targets.ph : null;
      if (t && r.ph < t[0] - 0.3) return 'Now pH. It decides what the roots can eat. Yours is a bit low, so tap pH up.';
      if (t && r.ph < t[0]) return 'Now pH. It decides what the roots can eat. Yours reads green, but a touch below the sweet spot, so tap pH up.';
      if (t && r.ph <= t[1] + 0.4 && r.ph > t[1]) return 'Now pH. It decides what the roots can eat. Yours reads green, but a touch above the sweet spot, so tap pH down.';
      if (t && r.ph >= t[0] - 0.3 && r.ph <= t[1]) return 'Now pH. It decides what the roots can eat. Yours is already in the green, so tap pH down a touch and watch it move.';
      return 'Now pH. It decides what the roots can eat. Yours is a bit high, so tap pH down.'; },
    hint: function (r) { var t = r && r.ph != null && r.targets && r.targets.ph ? r.targets.ph : null; /* v57 (critic round 8 nit #7): the hint follows the tile like the line does */
      if (t && r.ph < t[0] - 0.3) return 'Tap the glowing pH up button to bring the pH into the green.';
      if (t && r.ph < t[0]) return 'Tap the glowing pH up button to nudge it to the sweet spot.';
      if (t && r.ph <= t[1] + 0.4) return 'Tap the glowing pH down button to nudge it to the sweet spot.';
      return 'Tap the glowing pH down button to bring the pH into the green.'; },
    waitFor: function (s, a, r) { return r && r.ph != null && r.targets && r.targets.ph && r.ph >= r.targets.ph[0] - 0.3 && r.ph <= r.targets.ph[1] && (a === 'phDown' || a === 'phUp'); },
    afterHrs: 1, flash: ['ph'], after: function () { return 'pH decides which food the roots can grab. Green means go.'; } };
  var S_TOPUP = { title: 'Top up the tank', tap: 'Top up', waitTxt: 'Waiting for the tank to drop.', watch: tankLow, watchDays: 5, need: ['topUp'], hl: sel('topUp'), skipIf: function (r) { return !r || r.reservoirL == null; },
    say: 'Plants drink! The tank is getting low. Tap Top up before it runs dry.', hint: 'Tap the glowing Top up button to refill the tank.',
    waitFor: function (s, a) { return a === 'topUp'; }, onDone: function () { tankDone = true; }, after: function () { return 'Topped up. Fresh water keeps the roots wet and the feed from getting too strong.'; }, afterHrs: 1 };
  var S_LIGHTS = { title: 'Set the lights', tap: function () { return 'Lights until it says ' + lightTarget() + 'h'; }, need: ['lights'], hl: sel('lights'), skipIf: function () { return !hasAct('lights'); },
    say: function () { return 'Your ' + cropWord() + ' likes ' + lightTarget() + ' hours of light a day. Tap Lights until it says ' + lightTarget() + 'h.'; }, hint: function () { return 'Tap the glowing Lights button until it says ' + lightTarget() + 'h.'; },
    waitFor: function (s) { return s.lightHours === lightTarget(); } }; /* ui.js already answers the tap ("That suits this stage") */
  var S_HARVEST = { title: 'Pick your crop', speed: 6, tap: function () { return tabAct('harvest'); }, waitTxt: 'Waiting for something ripe.', watch: ripeNow, until: false, need: ['harvest'], hl: sel('harvest'),
    watchSay: function () { return methodCopy().gate('Now we wait. Keep the tank and tiles green and I will tell you when to pick.'); }, say: function () { var s = S(); try { var C = window.CROP_DATA && CROP_DATA[s.cropId]; if (C && C.harvest === 'once' && pickRisk(s) && !(C.stages && s.stage >= C.stages.length - 1)) return 'It is starting to bolt. Pick it now, before it turns bitter.'; } catch (e) {} return 'Ripe! Tap ' + tabAct('harvest') + '. Do not worry, some crops grow back.'; }, hint: function () { return 'Tap the glowing ' + tabAct('harvest') + ' button.'; },
    waitFor: function (s, a) { return a === 'harvest' || (s.harvestedKg || 0) > 0; } };
  var S_DONE = { title: 'You did it', finale: true, hidden: true };

  var SCRIPTS = {
    hydro: function () { return [S_MIX(true), S_PH, S_TOPUP, S_LIGHTS, S_HARVEST, S_DONE]; },
    coco: function () { return [
      { title: 'Feed the coco', tap: 'Feed', reads: ['moisture'], need: ['feed'], hl: sel('feed'), /* v36b: coco is fed from the start (a wait for the tile to dry down held up the first tap) */
        say: function () { return 'Your ' + cropWord() + "'s in. Tap Feed for its first meal."; }, hint: 'Tap the glowing Feed button when you are ready.', waitFor: function (s, a) { return a === 'feed'; }, afterHrs: 2, flash: ['moisture', 'ec'], after: function () { return 'Coco holds food and water. Feed a little, often.'; } },
      S_PH,
      { title: 'Water or flush', tap: 'Water', need: ['water'], hl: sel('water'), skipIf: function () { return !hasAct('water'); }, say: 'Salts build up in coco. Tap Water to flush it through.', hint: 'Tap the glowing Water button.', waitFor: function (s, a) { return a === 'water'; }, afterHrs: 1, after: function () { return 'Flushing keeps the roots clean.'; } },
      { title: 'Run the drip', tap: 'Drip', need: ['drip'], already: function () { return !!(S() && S().drip); }, alreadySay: 'The drip is already running. Nice one.', alreadyAct: 'drip', /* v36b: Drip starts on; tapping it would switch it off */ hl: sel('drip'), skipIf: function () { return !hasAct('drip'); }, say: 'The drip line does the watering for you. Tap Drip.', hint: 'Tap the glowing Drip button.', waitFor: function (s, a) { return a === 'drip'; }, afterHrs: 1, after: function () { return 'Drip on. Small drinks all day.'; } },
      S_HARVEST, S_DONE]; },
    soil: function () { return [
      { title: 'Feed it', tap: 'Feed', need: ['feed'], hl: sel('feed'), skipIf: function () { return !hasAct('feed'); }, say: function () { return 'Your ' + cropWord() + "'s in. Tap Feed for its first meal."; }, hint: 'Tap the glowing Feed button.', waitFor: function (s, a) { return a === 'feed'; }, afterHrs: 1, after: function () { return 'Fed. Not too much, soil holds on to food.'; } },
      { title: 'Water the soil', tap: 'Water', reads: ['moisture'], waitTxt: 'Waiting for the Soil tile to dry down.', watch: tileLow('moisture'), openLine: true, watchHl: rdSel('moisture'), need: ['water'], hl: sel('water'), giveUpDays: 2, giveUpSay: 'Soil holds water for days; water when the tile goes orange.',
        watchSay: 'Soil dries slowly. Tap 3x while you wait. Water it when the tile reads low.', say: function () { return tileLow('moisture')(S(), reads()) ? 'The Soil tile is dry. Tap Water.' : 'Soil holds water for days, so this is just a top-up. Tap Water.'; }, /* v66 (play-test #18 m6): after the two-day wait it said dry while the tile was green */ hint: 'Tap the glowing Water button when you are ready.', waitFor: function (s, a) { return a === 'water'; }, afterHrs: 2, flash: ['moisture'], after: function () { return 'Watering a little, often, beats a flood.'; } },
      { title: 'Light or shade', tap: function () { return hasAct('lights') ? 'Lights until it says ' + lightTarget() + 'h' : 'Shade'; }, need: ['lights', 'shade'], hl: function () { return hasAct('lights') ? sel('lights') : sel('shade'); }, skipIf: function () { return !hasAct('lights') && !hasAct('shade'); },
        /* v36b: outdoors the Shade step only starts when the Air tile is hot (above band) in daylight; if that has not happened after a day it is skipped. A cloth that is already on counts as done. */
        watch: function (s, r) { return hasAct('lights') || airHotDay(s, r); }, waitTxt: 'Waiting for a hot, sunny afternoon.', giveUpDays: 1.5, already: function () { return !hasAct('lights') && !!(S() && S().shade); }, alreadySay: 'Shade is already on. Nice one.', alreadyAct: 'shade',
        say: function () { return hasAct('lights') ? 'Your ' + cropWord() + ' likes ' + lightTarget() + ' hours of light a day. Tap Lights until it says ' + lightTarget() + 'h.' : 'The Air tile is hot. Tap Shade to cool it.'; },
        hint: function () { return hasAct('lights') ? 'Tap the glowing Lights button.' : 'Tap the glowing Shade button.'; }, waitFor: function (s, a) { return hasAct('lights') ? s.lightHours === lightTarget() : a === 'shade'; } },
      { title: 'Prune', tap: 'Prune', waitTxt: 'Waiting for the plant to bush out.', watch: function (s, r) { return !!(r && r.plant && r.plant.leafArea >= 1.5); }, watchDays: 5, need: ['prune'], hl: sel('prune'), skipIf: function () { return !hasAct('prune'); },
        say: 'It is bushing out. Tap Prune to let air in and keep it tidy.', hint: 'Tap the glowing Prune button.', waitFor: function (s, a) { return a === 'prune'; }, afterHrs: 1, after: function () { return 'Nice snip! Air keeps mould away.'; } },
      S_HARVEST, S_DONE]; },
    tower: function () { return [
      { title: 'Plant the slots', tap: 'Plant', need: ['plant'], hl: sel('plant'), say: OPEN.tower, hint: 'Tap the glowing Plant button to fill the slots.', waitFor: function (s, a) { return a === 'plant'; }, afterHrs: 1, after: function () { return 'Every slot grows at its own pace.'; } },
      S_MIX(false), S_PH, S_TOPUP,
      { title: 'Pick a slot', speed: 6, tap: 'Pick', waitTxt: 'Waiting for a slot to ripen.', watch: ripeNow, need: ['harvest'], hl: sel('harvest'), watchSay: 'Now we wait. Keep the tank and tiles green and I will tell you when a slot is ripe.',
        onEnterAct: function () { try { var s = S(), a = Sim.slotInfo(s); for (var i = 0; i < a.length; i++) if ((a[i].ripeKg || 0) >= 0.02) { s.__slot = i; break; } } catch (e) {} },
        say: function () { return 'A slot is ripe! Tap ' + tabAct('harvest') + '. Tap any slot to pick a different one.'; }, hint: 'Tap the glowing Pick button.', waitFor: function (s, a) { return a === 'harvest' || (s.harvestedKg || 0) > 0; } },
      S_DONE]; }
  };
  function scriptFor(m) { var f = SCRIPTS[m && m.how] || SCRIPTS.hydro; return f(); }
  function scriptLen(m) { return scriptFor(m).filter(function (x) { return !x.hidden; }).length; }

  /* the first problem gets a proper lesson, later ones a short nudge. Order: pH, feed strength (EC), tank. */
  var ISSUE_TXT = {
    phhigh: { title: 'pH is high', lesson: ["Uh-oh, the pH is drifting up. Roots can't grab iron up there, and new leaves go yellow.", 'Tap pH down.'], nudge: 'The pH is creeping up again. Tap pH down.' },
    phlow: { title: 'pH is low', lesson: ['Uh-oh, the pH is too low now, which can hurt the roots.', 'Tap pH up.'], nudge: 'The pH dropped too far. Tap pH up.' },
    eclow: { title: 'Feed is weak', lesson: ['Hungry plants! The feed is too weak for this stage.', 'Tap Mix feed.'], nudge: 'The feed is getting weak. Tap Mix feed.' },
    echigh: { title: 'Feed is strong', lesson: ['The feed is too strong, and strong feed can burn roots.', 'Tap Top up to water it down.'], nudge: 'The feed is too strong. Tap Top up to water it down.' },
    reservoirLlow: { title: 'Tank is low', lesson: ['The tank is running low.', 'Tap Top up.'], nudge: "The tank's low again. Tap Top up." }
  };

  /* ---------------------------------------------------------------- state */
  var run = null;            /* {name:'grow', steps, i, ph:'talk'|'watch'|'act'|'after', t0, act, ctx, tok} */
  var nudge = null;          /* {is, t0, lesson, act, hinted} */
  var phaseName = null;      /* 'grow' | 'done' | null */
  var shownActs = {}, shownReads = {}, capPaused = false, poll = 0, flashT = 0, busy = false, wrapped = false, tankDone = false, problemDone = false, phCorrected = false, phDriftTold = false, cool = {}, coached = {}, starting = false, tokSeq = 0, onResize = null;
  var active = function () { return !!run && phaseName === 'grow'; };
  var cur = function () { return run && run.steps[run.i]; };

  /* ------------------------------------------------------------------ DOM */
  function setAttrWords(el, name, words) { if (!el) return; var w = Object.keys(words).filter(function (k) { return words[k]; }).join(' '); el.setAttribute(name, w); }
  function applyDock() { barH(); } /* v36: the whole bar stays visible; the asked button just glows */
  function barH() {
    try {
      var bar = $('#actionbar');
      if (bar && active() && matchMedia('(max-width: 899px)').matches) document.documentElement.style.setProperty('--barh', Math.max(72, bar.offsetHeight) + 'px');
    } catch (e) {}
  }
  function applyReads() {}
  function reveal() {}
  function unlock() {}
  var shown = function (k) { return k !== 'vpd' && k !== 'dli'; }; /* the lesson's tiles: ui.js hides VPD and Light (DLI) in plain-words mode */
  function clearPulse() {
    heldPulse = undefined;
    document.querySelectorAll('.bg-pulse').forEach(function (e) { e.classList.remove('bg-pulse'); });
    var r = $('#readings'); if (r) r.removeAttribute('data-bgp');
  }
  /* Marg: "Tap Fan" with the Fan button 700 px down the page. A named control (or reading tile) that is off screen is scrolled to the middle (smooth unless reduced motion) before the glow is drawn.
     A phone's action bar is fixed, so its buttons never need it. */
  function userScrolled() { try { return !!(window.UserScroll && window.UserScroll.recent && window.UserScroll.recent(3000)); } catch (e) { return false; } }
  var bringKey = '';
  function bringIn(el) {
    if (!el || !el.scrollIntoView || !el.getBoundingClientRect) return;
    try {
      var bar = el.closest && el.closest('#actionbar'), pos = '';
      if (bar) { try { pos = getComputedStyle(bar).position; } catch (e) {} if (pos === 'fixed') return; }
      var dock = el.closest && el.closest('#dock'); /* tablets pin the dock with position:sticky; it is already in view, so never scroll for it */
      if (dock) { try { if (getComputedStyle(dock).position === 'sticky') return; } catch (e) {} }
      var q = el.getBoundingClientRect();
      if (window.NoScroll && window.NoScroll()) return; /* v36b: a bar tap never moves the page */
      var hb = 0; try { var hdr = $('header'); hb = hdr ? hdr.getBoundingClientRect().bottom : 0; } catch (e) {}
      if (q.bottom > hb && q.top < innerHeight - 70) return; /* v36b: any part on screen counts as on screen */
      var key = String(el.id || el.className) + ':' + ((el.dataset && (el.dataset.reading || el.dataset.act)) || ''); if (bringKey === key) return; bringKey = key; /* v36b: an off-screen spotlit control scrolls into view once */
      if (userScrolled()) return; /* the player scrolled in the last 3 s: never fight their hand */
      var bb = $('#bubble'), bp = '';
      if (bb && bb.classList && bb.classList.contains('show') && bb.getBoundingClientRect) {
        try { bp = getComputedStyle(bb).position; } catch (e) {}
        var UJ = window.UserScroll;
        if (bp !== 'fixed' && UJ && UJ.plan) { var d = UJ.plan(q, bb.getBoundingClientRect(), innerHeight, false); if (d) scrollBy({ top: d, behavior: reduce() ? 'auto' : 'smooth' }); return; } /* Axel's bubble moves with the page: scroll only as far as keeps it on screen */
      }
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
    } catch (e) {}
  }
  function scrollRd(k) { bringIn($('#readings .rd[data-reading="' + k + '"]')); }
  var heldPulse; /* v58: the next step's glow waits while the last step's closing line is up (stripFor's closing hold) */
  function setPulse(h) {
    clearPulse(); if (!h) return;
    if (closing && closingUp()) { heldPulse = h; return; }
    heldPulse = undefined;
    var list = [].concat(h), words = {};
    list.forEach(function (s) {
      var m = /^\[data-reading="(\w+)"\]$/.exec(s);
      if (m) { words[m[1]] = true; scrollRd(m[1]); } else { var e = $(s); if (e) { e.classList.add('bg-pulse'); bringIn(e); } }
    });
    if (Object.keys(words).length) setAttrWords($('#readings'), 'data-bgp', words);
  }
  function flash(keys) {
    var r = $('#readings'); if (!r || !keys || !keys.length) return;
    var w = {}; keys.forEach(function (k) { w[k] = true; });
    setAttrWords(r, 'data-bgf', w); /* v36b: a flash never scrolls the page */
    clearTimeout(flashT); flashT = setTimeout(function () { r.removeAttribute('data-bgf'); }, 3400);
  }
  function strip(text, frac, tag) {
    var st = $('#bgStrip'); if (!st) return;
    var t = st.querySelector('.bgs-txt'); if (t && t.innerHTML !== text) t.innerHTML = text; /* v37: role=status was rewritten 5 times a second with the same words, so readers repeated it */
    var i = st.querySelector('.bgs-bar i'); if (i) i.style.width = Math.round(Math.max(0, Math.min(1, frac || 0)) * 100) + '%';
    st.setAttribute('data-tag', tag || '');
  }
  function stripFor() {
    if (!run) return;
    var st = cur(), steps = run.steps.filter(function (x) { return !x.hidden; }), n = steps.length, i = Math.min(run.i, n - 1);
    if (!st) return;
    var lead = 'Step ', title = st.title;
    if (closing && !nudge && closing.i < i) { if (closingUp()) { strip('<b>' + lead + (closing.i + 1) + ' of ' + n + '</b> · ' + closing.title + ' · done', (closing.i + 1) / n, ''); return; } closing = null; }
    if (nudge) { strip('<b>Heads up</b> · ' + nudge.is.title, i / n, 'nudge'); return; }
    if (run.ph === 'watch' && st.waitTxt) { strip('<b>' + lead + (i + 1) + ' of ' + n + '</b> · ' + waitLine(st), i / n, 'wait'); return; } /* the goal is hidden until the game gets there: say what we wait for */
    if (run.ph === 'act' && st.tap && !capPaused) { var tp = typeof st.tap === 'function' ? st.tap(reads()) : st.tap; strip('<b>' + lead + (i + 1) + ' of ' + n + '</b> · Tap ' + tp, i / n, 'tap'); return; }
    if (run.ph === 'after' && st.afterHrs && !capPaused) { strip('<b>' + lead + (i + 1) + ' of ' + n + '</b> · ' + title + ' · <em>watching… ' + (run.wk || 0) + '/' + st.afterHrs + ' h</em>', i / n, ''); return; }
    strip('<b>' + lead + (i + 1) + ' of ' + n + '</b> · ' + title + (capPaused ? ' · <em>waiting for you</em>' : ''), i / n, capPaused ? 'paused' : '');
  }
  /* "Waiting for the tank to drop. The clock runs at 3x." (or the honest reason it is not running faster) */
  function waitLine(st) {
    var sp = curSpeed(), b = badTile(reads());
    return st.waitTxt + ' ' + (sp === 0 ? 'The clock is paused.' : sp === 1 && b ? 'Holding 1x: ' + b.txt + '.' : 'The clock runs at ' + sp + 'x.');
  }
  function mountChrome() {
    document.body.classList.add('bg-on');
    try { if (window.Goals) Goals.hide(); } catch (e) {} /* v37: the lesson strip owns #bgStrip */
    var st = $('#bgStrip');
    if (!st) {
      st = document.createElement('div'); st.id = 'bgStrip'; /* v66 (round 15 keyboard m3): role=status sits on the text only, so a re-read never includes Skip and Finish lesson */
      st.innerHTML = '<span class="bgs-txt" role="status"></span><button type="button" class="bgs-mute" aria-label="Sound on or off"></button><button type="button" class="bgs-skip">Skip</button><button type="button" class="bgs-leave">Finish lesson, keep growing</button><div class="bgs-conf" role="group" aria-label="Finish the lesson" hidden><span>Keep growing without the lesson?</span><button type="button" class="bgs-yes">Keep growing</button><button type="button" class="bgs-stay">Stay</button></div><div class="bgs-bar" aria-hidden="true"><i></i></div>'; /* v36b: Finish lesson, keep growing (was Leave beginner mode) */
      var h = $('header'); if (h) h.insertAdjacentElement('afterend', st); else document.body.insertBefore(st, document.body.firstChild);
      /* v36b: one tap to ask, one tap to confirm; the grow is never dropped and the title is never shown */
      var conf = st.querySelector('.bgs-conf'), confT = 0;
      var showConf = function (on) { clearTimeout(confT); conf.hidden = !on; st.classList.toggle('confirming', !!on); if (on) confT = setTimeout(function () { showConf(false); }, 9000); };
      st.querySelector('.bgs-leave').onclick = function () { showConf(true); };
      st.querySelector('.bgs-stay').onclick = function () { showConf(false); };
      st.querySelector('.bgs-yes').onclick = function () { showConf(false); finishKeep(); };
      st.querySelector('.bgs-skip').onclick = function () { skip(); };
      st.querySelector('.bgs-mute').onclick = function () { var m = $('#mute'); if (m) m.click(); syncMute(); };
    }
    syncMute();
    if (!onResize) { onResize = function () { barH(); }; addEventListener('resize', onResize); }
  }
  function syncMute() { var b = $('#bgStrip .bgs-mute'), m = $('#mute'); if (b && m) b.textContent = m.textContent; }
  function unmountChrome() {
    document.body.classList.remove('bg-on');
    var st = $('#bgStrip'); if (st) st.remove();
    document.querySelectorAll('#dock button').forEach(function (b) { b.classList.remove('bg-pulse'); });
    var r = $('#readings'); if (r) ['data-bg', 'data-bgp', 'data-bgf'].forEach(function (a) { r.removeAttribute(a); });
    document.documentElement.style.removeProperty('--barh');
    if (onResize) { removeEventListener('resize', onResize); onResize = null; }
    var d = $('#bgDone'); if (d) d.remove();
  }

  /* --------------------------------------------------------------- engine */
  function wrapGame() {
    var g = G(); if (!g || wrapped) return; wrapped = true;
    var oAct = g.doAct, oStep = g.step;
    g.doAct = function (id) { var res = oAct.apply(g, arguments); if (active()) onAct(id); return res; };
    g.step = function (h) {
      if (!active()) return oStep.apply(g, arguments);
      var n = Math.max(0, Math.round(+h || 0));
      if (!n) { oStep.call(g, 0); check(); return; }
      for (var i = 0; i < n; i++) { if (blocked()) { check(); if (blocked()) break; } oStep.call(g, 1); check(); if (!active()) break; } /* check() first: the player may have pressed 1x to resume */
    };
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('#speedbtns button'); if (b) { userPaused = +b.dataset.s === 0; userSlow = +b.dataset.s === 1; } }, true); /* userSlow: the player chose 1x, so the wait is not sped up again for this step */
    var dk = $('#dock');
    if (dk) dk.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b && active() && b.dataset.act) onAct(b.dataset.act); });
  }
  function waiting() { return !!run && (!!nudge || run.ph === 'act' || run.ph === 'talk'); }
  function t0() { return nudge ? nudge.t0 : (run ? run.t0 : 0); }
  function blocked() { return waiting() && (run.ph === 'talk' && !nudge || capPaused || hrs() - t0() >= CAP); }

  function onAct(id) {
    if (!active()) return;
    lastActAt = Date.now();
    if (id === 'phDown' || id === 'phUp') phCorrected = true;
    if (nudge) { nudge.act = id; if (id === 'ask') nudge.asked = true; } else if (run) { run.act = id; if (run.ph === 'watch') run.early = id; } /* the player got there before the sim did: that counts */
    check();
  }

  function check() {
    if (!run || busy) return; busy = true;
    try { tick(); } catch (e) { try { console.warn('beginner', e); } catch (x) {} } finally { busy = false; }
  }
  function tick() {
    var s = S(); if (!s) return; var r = reads(); if (!r) return;
    syncMute();
    if (nudge) { nudgeCheck(r); enforce(); return; }
    var st = cur(); if (!st) return;
    resumeClock(); coach(r); slowForReadings(r);
    if (run.ph === 'watch') {
      var early = run.early && st.need && st.need.indexOf(run.early) >= 0 && st.waitFor && st.waitFor(s, run.early, r);
      if (st.giveUpDays && !early && !st.watch(s, r) && hrs() - run.t0 >= st.giveUpDays * 24) { clearPulse(); if (st.giveUpSay) say(st.giveUpSay, { auto: true, dwell: 4000 }); run.i++; stepEnter(); return; } /* v36b: a step that waits for weather gives up and is skipped */
      var due = early || st.watch(s, r) || (st.watchDays && hrs() - run.t0 >= st.watchDays * 24);
      if (early) { var ea = run.early; clearPulse(); run.ph = 'act'; run.t0 = hrs(); run.act = ea; run.early = null; actDone(st, r); }
      else if (due) leaveWatch(st, r); else { issueCheck(r); if (!nudge) watchKeep(r); }
    } else if (run.ph === 'act') {
      if (typeof st.hl === 'function') { var h = st.hl(r), hk = String(h); if (hk !== run.hlKey) { run.hlKey = hk; setPulse(h); stripFor(); } } /* only repaint when the target changes (keeps the CSS pulse smooth) */
      if (st.waitFor(s, run.act, r)) actDone(st, r);
    } else if (run.ph === 'after') {
      var dh = hrs() - run.t0, need = st.afterHrs || 0;
      if (curSpeed() === 0) run.rt0 = Date.now(); /* the player paused: not the sim's fault */
      if (dh >= need) afterDone(st);
      else if (Date.now() - run.rt0 > AFTER_MS) { run.ctx.forced = true; afterDone(st); } /* hidden tab / throttled loop: finish with whatever changed so far */
      else { var wk = Math.max(0, Math.min(need, Math.floor(Math.max(dh, need * (Date.now() - run.rt0) / AFTER_MS)))); if (wk !== run.wk) { run.wk = wk; stripFor(); } } /* the strip counts game hours, or real time if the sim is stalled, so it never looks frozen */
    }
    enforce();
  }

  /* the clock must never sit paused while the step is only waiting on game time ('watch' / 'after'): the player did their part, so carry on.
     (A pause the player chose with II is left alone.) */
  function resumeClock() {
    if (!run || nudge || userPaused || curSpeed() !== 0) return;
    if (run.ph === 'after' || run.ph === 'watch') { capPaused = false; (run.ph === 'watch' ? goFast('Carrying on at 3x') : setSpWhy(1, 'Carrying on, the clock is running again')); stripFor(); }
  }
  /* fast-forward only while everything is calm: when a tile on screen turns orange or red, drop to 1x and say why (once per episode) */
  var lastSlow = null;
  /* a tile only counts (for the 3x guard and the slowdown) once the player has a button that can fix it: no "Slowed down: Air is orange" while the Fan is still locked */
  var REMEDY = { ec: ['mix', 'topUp'], ph: ['phDown', 'phUp'], airTemp: ['fan'], rh: ['fan', 'humidity'], reservoirL: ['topUp'] };
  function fixable(k) { /* v36: every button is on the bar from the start. v36d: a tile the engine says has no fix ("wait it out", a cold night already covered) must not hold 3x */
    if (!shown(k)) return false;
    try { var s0 = S(), r0 = s0 && Sim.readings(s0), t0 = r0 && (r0.targets || {}).airTemp; if (k === 'airTemp' && s0 && s0.out && r0.lightsOn && Array.isArray(t0) && r0.airTemp < t0[0]) return false; } catch (e) {} /* v69 (play-test #20 m4): a cold morning outside warms by itself (Ask says so), so it does not hold the lesson at 1x */
    try { var s = S(); if (s && window.Sim && Sim.whyRed) { var w = Sim.whyRed(s, k); if (w && w.fix == null) return false; } } catch (e) {}
    return true;
  }
  /* v36 contextual coaching: the first time a tile goes orange or red Axel says ONE line naming the button and the direction (ui.js hintFor), once per tile. The pH, feed and tank have their own lesson (nudges below). */
  var COACH_TILES = ['airTemp', 'rh', 'vpd', 'moisture'];
  var coachAt = -1e9;
  function coach(r) {
    /* not before the first step is done (the sim starts with a cold morning and a thirsty plant: the player's first job is the script's, not a pile of tips), and at most one line every 12 game hours */
    if (!run || nudge || run.ph === 'talk' || run.i < 1 || hrs() - coachAt < 12) return;
    var st = (r && r.status) || {};
    try { var sf = S(); if (sf && sf.pot && hasAct('feed') && !(sf.__feedTold > hrs() - 72) && !tileLow('moisture')(sf, reads()) && Sim.diagnose(sf).some(function (d) { return (d.id === 'ec' || d.id === 'lowec') && /feed/i.test(String(d.fix || '')); })) { sf.__feedTold = hrs(); coachAt = hrs(); say(sf.method.how === 'soil' ? 'The soil is getting hungry. Tap Feed. Soil wants a feed about once a week.' : 'The coco is getting hungry. Tap Feed. Coco likes a little, often.', { auto: true, hop: true, dwell: 4500 }); return; } } catch (e) {} /* v67 (critic round 16 M1): after step 1 the lesson never asked for another feed, and a literal soil tomato starved */
    try { var s0 = S(); if (s0 && s0.cover && s0.method && s0.method.where !== 'tent' && r && r.lightsOn && (s0.coverDay || 0) >= 3 && hasAct('cover') && !(r.status && (r.status.airTemp === 'bad' || r.status.airTemp === 'warn'))) { coachAt = hrs(); say(s0.method.where === 'veranda' ? 'The sun is up. Tap Put out so the pots get the light.' : 'The sun is up. Tap Cover to take it off, so the bed gets the light.', /* v67 (play-test #19 m3): the garden bed too */ { auto: true, hop: true, dwell: 4500, stale: function () { var s1 = S(); return !run || !s1 || !s1.cover; } }); return; } } catch (e) {} /* v66 (play-test #18 M1): pots left inside for 100 days with the coach silent */
    for (var i = 0; i < COACH_TILES.length; i++) {
      var k = COACH_TILES[i], c = tileState(k, r);
      var dryK = k === 'moisture' && typeof (r && r.moisture) === 'number' && Array.isArray(r && r.targets && r.targets.moisture) && r.moisture < r.targets.moisture[0];
      if (k === 'moisture' && !(dryK && (c === 'warn' || c === 'bad'))) coached.dry = false; /* v71 (play-test #21 M1): each dry spell gets its line, and a dry pot that goes red gets a second one; too wet stays once per lesson */
      if (dryK && (c === 'warn' || c === 'bad')) { if (coached.dry === c || coached.dry === 'bad') continue; }
      else if (coached[k] || (c !== 'warn' && c !== 'bad')) continue;
      var line = null, h = null, cs = cur(), asked = function (x) { return !!(cs && run.ph === 'act' && cs.need && cs.need.indexOf(x) >= 0); }; /* the step is already asking for that button */
      if (k === 'moisture' && (asked('water') || asked('feed') || asked('drip'))) continue;
      if (k === 'moisture') { /* v36b: direction first. Over target (just fed or watered, or rain) is "too wet", never "Tap Water" */
        var mv = r && r.moisture, mt = r && r.targets && r.targets.moisture, mc0 = methodCopy();
        if (typeof mv === 'number' && Array.isArray(mt) && mv > mt[1]) line = mc0.root + ' is too wet: skip the next water, the roots need air.';
        else if (typeof mv === 'number' && Array.isArray(mt) && mv >= mt[0]) { coached[k] = false; continue; }
        else { var b = hasAct('water') ? 'Water' : hasAct('drip') ? 'Drip' : null; if (b) line = mc0.root + (c === 'bad' ? ' is very dry and the plant is suffering. Tap ' + b + '.' : ' is dry. Tap ' + b + '.'); }
      }
      else if (k === 'airTemp' && methodCopy().out) { /* v36b: no fan or lights outdoors: the lever is Cover at night, Shade in the sun */
        var at = r && r.targets && r.targets.airTemp, av = r && r.airTemp, mc1 = methodCopy();
        if (typeof av === 'number' && Array.isArray(at) && av < at[0]) { if (r.lightsOn) continue; if (hasAct('cover')) line = 'Cold night. Tap ' + mc1.cover + '.' + (mc1.cover === 'Bring in' ? ' Put them out again in the morning.' : ''); } /* v66 (play-test #18 M1): Bring in was said, Put out never was */
        else if (typeof av === 'number' && Array.isArray(at) && av > at[1]) { if (!r.lightsOn) continue; if (hasAct('shade') && !(S() && S().shade)) line = 'Hot sun. Tap Shade.'; }
        else continue;
      }
      else { h = hint(k); if (h && h.ctl && asked(h.ctl)) continue; if (h && h.ctl && hasAct(h.ctl)) line = /[.!?]$/.test(h.text) ? h.text : h.text + '.'; else if (h && h.ctl === null && h.text) line = h.text; }
      if (dryK) coached.dry = c; else coached[k] = true; /* once per tile, even when there was nothing to say (a dry pot: once per colour per dry spell) */
      if (line) { coachAt = hrs(); say(line, { auto: true, hop: true, dwell: 4500, stale: (function (kk) { return function () { var rr = reads(); return !run || !rr || (tileState(kk, rr) !== 'warn' && tileState(kk, rr) !== 'bad'); }; })(k) }); return; }
    }
  }
  /* the colour a tile shows: the engine's status, with the same +-0.5 C / 0.05 EC / 0.05 pH / 2 % RH slack the main game's speed guard uses (ui.js window.SpeedGuard), so "Air 21 against 18 to 21" is green */
  function tileState(k, r) {
    var s = ((r && r.status) || {})[k];
    try { var SG = window.SpeedGuard; if (SG && SG.fix && (s === 'warn' || s === 'bad')) return SG.fix(r)(k, s); } catch (e) {}
    return s;
  }
  window.tileState = tileState; /* [m6] the one tile-colour rule (engine status plus the speed guard's slack); ui.js has no second copy, it uses SpeedGuard.fix directly */
  function badTile(r) {
    var bad = null, s = null;
    Object.keys((r && r.status) || {}).forEach(function (k) { var c = tileState(k, r); if (!bad && (c === 'warn' || c === 'bad') && fixable(k)) { bad = k; s = c; } });
    return bad ? { k: bad, s: s, key: bad + ':' + s, txt: (RD_NAME[bad] || bad) + ' is ' + (s === 'bad' ? 'red' : 'orange') } : null;
  }
  function redTile(r) { var b = null; Object.keys((r && r.status) || {}).forEach(function (k) { if (!b && tileState(k, r) === 'bad' && fixable(k)) b = k; }); return b; }
  /* an experienced player keeps 3x through a task, unless a tile is red */
  function keepFast() { return experienced() && !redTile(reads()); }
  /* slow to 1x with the same rule as the main game (ui.js SpeedGuard.step): a RED tile, an ORANGE one for 2 game hours running, or Health down 5 in an hour; re-armed after 1 game hour of all green */
  var gst = null;
  function slowForReadings(r) {
    var SG = window.SpeedGuard;
    if (SG && SG.step && SG.create) {
      if (!gst) gst = SG.create();
      var pk = SG.pick(r.status, function (k) { return fixable(k); }, SG.fix(r)), hv = r.health != null && typeof r.health === 'object' ? r.health.value : r.health;
      var res = SG.step(gst, pk, hrs(), typeof hv === 'number' ? hv : null, curSpeed() > 1);
      if (res) { setSp(1); toast('Slowed down: ' + res.txt, 3200); }
      return;
    }
    /* no ui.js helper (a headless test): the old rule, any orange or red tile */
    var b = badTile(r);
    if (!b) { if (lastSlow && (greenSince == null ? (greenSince = hrs()) : greenSince) <= hrs() - 2) { lastSlow = null; greenSince = null; } return; } /* a tile that flickers green for an hour must not re-arm the slowdown: 3x would snap back on every flicker */
    greenSince = null;
    if (curSpeed() <= 1 || b.key === lastSlow) return;
    lastSlow = b.key; setSp(1); toast('Slowed down: ' + b.txt, 3200);
  }
  /* watching steps run at 3x, unless a tile on screen is already orange or red: then stay at 1x and say so */
  var watchSpd = function () { var st = cur(); return (st && st.speed) || WATCH_SPEED; }; /* a step may ask for a faster wait ("Grow the leaves") */
  function goFast(why) {
    var b = badTile(reads());
    if (b) { lastSlow = b.key; if (gst) gst.tripped = true; setSpWhy(1, 'Staying at 1x: ' + b.txt); } else { var x = watchSpd(); setSpWhy(x, x === WATCH_SPEED ? why : why.replace(WATCH_SPEED + 'x', x + 'x')); }
  }

  /* a pure waiting step keeps its watch speed: if the clock fell back to 1x for a reason that has passed (a tile that is green again, the Fan hold over), carry on, unless the player chose 1x or Pause */
  function watchKeep(r) {
    var sp = curSpeed(), b = badTile(r);
    if (userPaused || userSlow || sp !== 1 || fanHeld() || b) { var k = sp + ':' + (b ? b.key : '') + ':' + fanHeld(); if (run && k !== run.sk) { run.sk = k; stripFor(); } return; }
    goFast('Carrying on at ' + watchSpd() + 'x');
    if (run) { run.sk = curSpeed() + '::false'; stripFor(); }
  }

  /* the clock: never run on past something the player owes */
  function enforce() {
    if (!waiting()) { capPaused = false; return; }
    if (run.ph === 'talk' && !nudge) return; /* Axel's bubble holds the clock while he talks */
    var sp = curSpeed();
    if (sp > 1 && !keepFast()) { setSpWhy(1, 'Slowed to 1x: your turn'); sp = 1; }
    if (capPaused) { if (sp > 0) { capPaused = false; if (nudge) nudge.t0 = hrs(); else run.t0 = hrs(); stripFor(); } return; }
    if (sp > 0 && hrs() - t0() >= CAP) { setSp(0); capPaused = true; stripFor(); toast('Paused: the clock waits for you', 3200); remind(); }
  }
  function remind() {
    var st = cur(), h = nudge ? 'Take your time. Tap the glowing button when you are ready, and the clock starts again.' : (st && (typeof st.hint === 'function' ? st.hint(reads()) : st.hint));
    var key = (run ? run.tok : 0) + ':' + t0(); if (remindKey === key) return; remindKey = key; /* one "I will wait" per pause, never a second queued behind the first */
    say((h || 'Take your time.') + ' I will wait.', { auto: true, hop: true, dwell: 4000, repeat: true, dismissAct: nudge ? [nudge.is.act] : (st && st.need), stale: function () { return !capPaused || Date.now() - lastActAt < 5000; } }); /* acted in the last 5 s: the nudge would arrive after the tap */
  }

  /* ---------------------------------------------------------------- steps */
  function stepEnter() { stepEnter0(); saveProgress(); } /* every step advance keeps the lesson resumable */
  function stepEnter0() {
    var st = cur(); if (!st) return;
    var rr0 = reads(); while (st && st.skipIf && !st.finale && st.skipIf(rr0)) { run.i++; st = cur(); } /* a step this way of growing has no use for (no pH tile, no drip button) is passed over */
    if (!st) return;
    run.ctx = {}; run.act = null; run.early = null; capPaused = false; run.t0 = hrs(); run.tok = ++tokSeq; run.ph = null; run.wk = 0; run.sk = ''; userSlow = false; /* no stale "watching 3/1 h" from the step before */
    if (st.reads) reveal(st.reads);
    stripFor();
    if (st.finale) { finishGrow(); return; }
    if (st.talk) {
      run.ph = 'talk'; setPulse(st.hl); applyDock();
      var tok = run.tok, lines = st.talk;
      lines.forEach(function (l, i) {
        var last = i === lines.length - 1;
        say(l, last ? { keep: true, hop: i === 0, then: function () { if (run && run.tok === tok && run.ph === 'talk') talkDone(); } } : { keep: true, more: true, hop: i === 0 });
      });
      return;
    }
    if (st.openLine && st.watchSay && st.watch && st.watch(S(), reads())) { var otok = run.tok; say(typeof st.watchSay === 'function' ? st.watchSay() : st.watchSay, { auto: true, hop: true, dwell: 3200, stale: function () { return !run || run.tok !== otok; } }); } /* the tile is already orange: the opening line is still the first thing said */
    if (st.watch && !st.watch(S(), reads())) {
      run.ph = 'watch'; setPulse(st.watchHl || (st.hl && !st.need ? st.hl : null)); goFast('Speeding up to 3x while we wait');
      var wtok = run.tok, wstale = function () { return !run || run.tok !== wtok || run.ph !== 'watch'; };
      if (st.watchSay) say(typeof st.watchSay === 'function' ? st.watchSay() : st.watchSay, st.openLine ? { auto: true, hop: true, dwell: 3200 } : { auto: true, hop: true, stale: wstale }); /* openLine: the script's first line is said even if the tile has gone orange by the time it is reached */
      else if (st.waitTxt) say(waitLine(st), { auto: true, hop: true, dwell: 3500, stale: wstale }); /* "Waiting for the tank to drop. The clock runs at 3x." */
      stripFor();
      return;
    }
    enterAct();
  }
  function talkDone() { clearPulse(); finishStep(); }
  function leaveWatch(st) {
    if (!st.waitFor) { /* pure watch step: done when the condition holds */ clearPulse(); run.ph = 'after'; run.t0 = hrs(); afterDone(st); return; }
    enterAct();
  }
  function enterAct() {
    var st = cur(); run.ph = 'act'; run.t0 = hrs(); run.act = null; capPaused = false;
    unlock(st.need); if (st.reads) reveal(st.reads);
    if (st.onEnterAct) { try { st.onEnterAct(); } catch (e) {} }
    if (st.already && st.already()) { /* the control is already where the step wants it (Fan already on High): count it as done, say so, never point at it */
      run.act = st.alreadyAct || (st.need && st.need[0]); stripFor(); /* v36b: alreadyAct */
      if (st.alreadySay) { var atok = run.tok; say(st.alreadySay, { auto: true, hop: true, dwell: 4000, stale: function () { return !run || run.tok !== atok; } }); }
      return;
    }
    var h0 = typeof st.hl === 'function' ? st.hl(reads()) : st.hl; run.hlKey = String(h0); setPulse(h0);
    if (curSpeed() !== 0 && !keepFast()) setSpWhy(1, 'Slowed to 1x: your turn');
    stripFor();
    if (st.say) {
      var tok = run.tok, sa = typeof st.sayAction === 'function' ? st.sayAction() : null, so = { auto: true, hop: true, dwell: 5000, dismissAct: st.need, stale: function () { return !run || run.tok !== tok || run.ph !== 'act'; } };
      if (sa) { so.action = sa; so.stay = true; so.auto = false; } /* the card with a button stays until it is used or the asked control is tapped */
      say(typeof st.say === 'function' ? st.say() : st.say, so);
    } /* queued behind another line and the player already did it: drop it; tapping the asked button closes it at once */
  }
  function actDone(st, r) {
    clearPulse(); toastClear(); if (st.onAct) st.onAct(run.ctx);
    if (st.learned) learned(st.learned);
    flash(st.flash); run.ph = 'after'; run.t0 = hrs(); run.rt0 = Date.now(); run.wk = 0;
    /* the cap pause ("waiting for you") ends the moment the player does the thing: clear it and carry on at 1x, or the clock would sit paused behind a stale "waiting" strip */
    var resumed = false;
    if (capPaused) { capPaused = false; if (curSpeed() === 0 && !userPaused) { setSp(1); resumed = true; toast('Nice! The clock is running again'); } }
    if (!resumed && st.afterHrs && curSpeed() > 0) goFast('Speeding up to 3x while we watch');
    stripFor();
    saveProgress(); /* the tap is done: a resume carries on after this step instead of asking for it again */
    if (!st.afterHrs) afterDone(st);
  }
  function afterDone(st) {
    var t = typeof st.after === 'function' ? st.after(run.ctx) : st.after;
    /* v58 (play-test #13 #6): the closing line waited for a tap while the strip already read the next step ("Step 3 of 5 · Tap Water" over step 2's
       "pH decides ..." for about 9 s). It now closes itself after a short read, so the next step's line follows it within a few seconds */
    if (t) { say(t, { auto: true, dwell: 3500, hop: true }); var stp = run.steps.filter(function (x) { return !x.hidden; }); closing = { text: t, i: Math.min(run.i, stp.length - 1), title: st.title }; watchClosing(); }
    if (st.until && st.learned) learned(st.learned);
    finishStep();
  }
  /* v58 (play-test #13 #6): while a step's closing line is still in Axel's bubble, the strip keeps that step ("Step 2 of 5 · pH · done") instead of
     already reading the next one; it moves on as soon as the bubble shows anything else */
  var closing = null, closingObs = null;
  function closingUp() {
    if (!closing) return false;
    var b = document.querySelector('#bubble.show .txt'); if (!b) return false;
    var typed = b.textContent.trim(); return closing.text.indexOf(typed.slice(0, 24)) === 0;
  }
  function watchClosing() {
    var bb = document.querySelector('#bubble'); if (!bb || closingObs || typeof MutationObserver === 'undefined') return;
    closingObs = new MutationObserver(function () { if (closing && !closingUp()) { closing = null; stripFor(); if (heldPulse !== undefined) { var h = heldPulse; heldPulse = undefined; if (run && (run.ph === 'act' || run.ph === 'talk' || run.ph === 'watch')) setPulse(h); } } });
    closingObs.observe(bb, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  }
  /* the one-time "Take this home" card (ui.js TakeHome, never for a returning player) opens after the first real step is done (v36: step 1 of the method script) */
  var TAKE_AT = -1; /* v36b: "Take this home" never opens by itself mid-grow (it was after step 1). It is in More / Menu and on the lesson's last card. */
  function finishStep() {
    var r0 = run, st = cur();
    if (st && st.onDone) { try { st.onDone(r0.ctx); } catch (e) { console.warn(e); } }
    if (run !== r0 || !active()) return; /* onDone swapped the script (play -> grow) or the player left */
    var go = function () {
      if (run !== r0 || !active()) return; /* the player left while the card was up */
      if (curSpeed() === 0 && !userPaused) setSp(1); /* the card pauses the clock; the next step carries on */
      r0.i++;
      if (r0.i >= r0.steps.length) return;
      stepEnter();
    };
    if (r0.name === 'grow' && r0.i === TAKE_AT) {
      try { if (window.TakeHome && window.TakeHome.maybe) { r0.ph = 'hold'; window.TakeHome.maybe(function () { if (run === r0 && r0.ph === 'hold') go(); }); return; } } catch (e) {}
    }
    go();
  }

  /* ------------------------------------------------- issues (lesson/nudges) */
  function rawIssue(r, only) { /* v71 (play-test #21 m1): only = the key of the nudge already running, so its direction is read even when another reading is off too */
    var t = r.targets || {}, s = S(), out = null;
    /* one pH tap used to move a small tank by 0.5 to 0.8 (about half that now: ui.js sets phDoseScale), so "fixed" means the safe window (band floor minus 0.3, where the plant's own pH factor is still full) not the tile going green */
    if ((!only || only === 'ph') && r.ph != null && t.ph) { if (r.ph > t.ph[1] + 0.05) out = { key: 'ph', dir: 'high', act: 'phDown' }; else if (r.ph < t.ph[0] - 0.3) out = { key: 'ph', dir: 'low', act: 'phUp' }; }
    if (!out && (!only || only === 'ec') && r.ec != null && t.ec) { if (r.ec < t.ec[0] - 0.05) out = { key: 'ec', dir: 'low', act: 'mix' }; else if (r.ec > t.ec[1] + 0.1) out = { key: 'ec', dir: 'high', act: 'topUp' }; }
    if (!out && (!only || only === 'reservoirL') && tankDone && s && r.reservoirL != null && s.cap && r.reservoirL <= 0.3 * s.cap) out = { key: 'reservoirL', dir: 'low', act: 'topUp' };
    if (out) {
      /* v36: the feed and the tank have other buttons in other methods (coco and soil: Feed and Water). No button for it on this bar: no lesson about it. */
      var a0 = out.act; if (!hasAct(a0)) { if (a0 === 'mix' && hasAct('feed')) out.act = 'feed'; else if (a0 === 'topUp' && hasAct('water')) out.act = 'water'; }
      if (!hasAct(out.act) && $('#dock button')) return null;
      var x = ISSUE_TXT[out.key + out.dir];
      if (out.act !== a0) { var fix = function (t) { return String(t).replace('Mix feed', 'Feed').replace('Top up', 'Water'); }; x = { title: x.title, lesson: x.lesson.map(fix), nudge: fix(x.nudge) }; }
      out.title = x.title; out.txt = x;
    }
    return out;
  }
  function inBand(is, r) {
    var t = r.targets || {}, s = S();
    if (is.key === 'ph') return r.ph == null || (r.ph >= t.ph[0] - 0.3 && r.ph <= t.ph[1]);
    if (is.key === 'ec') return r.ec == null || (r.ec >= t.ec[0] && r.ec <= t.ec[1]);
    return !(s && r.reservoirL <= 0.4 * s.cap);
  }
  function issueCheck(r) {
    if (run.name !== 'grow' || run.i < ISSUE_FROM || run.ph !== 'watch') return;
    var is = rawIssue(r); if (!is || hrs() < (cool[is.key] || 0)) return;
    startNudge(is);
  }
  function startNudge(is) {
    var lesson = !problemDone;
    /* the first time pH climbs back after the player corrected it, say once that this is normal */
    if (is.key === 'ph' && is.dir === 'high' && phCorrected && !phDriftTold) { phDriftTold = true; is.txt = Object.assign({}, is.txt, { lesson: [PH_DRIFT, 'Tap pH down.'], nudge: PH_DRIFT + ' Tap pH down.' }); }
    nudge = { is: is, t0: hrs(), lesson: lesson, act: null, hinted: false, asked: false };
    var n0 = nudge, gone = function () { var rr = reads(); return nudge !== n0 || !!(rr && inBand(n0.is, rr)); }; /* fixed already, or the player left the nudge: do not announce it late */
    unlock([is.act]); if (lesson) unlock(['ask']);
    setPulse([sel(is.act), rdSel(is.key)]); setSpWhy(1, 'Slowed down: ' + is.title); capPaused = false; stripFor();
    if (lesson) { say(is.txt.lesson[0], { worried: true, keep: true, more: true, hop: true, stale: gone }); say(is.txt.lesson[1] + ' Stuck? Tap Ask Axel.', { keep: true, dismissAct: [is.act], stale: function () { return gone() || n0.asked; } }); }
    else say(is.txt.nudge, { auto: true, hop: true, dwell: 4000, repeat: true, dismissAct: [is.act], stale: gone });
  }
  function nudgeCheck(r) {
    var is = nudge.is, now = rawIssue(r, is.key);
    if (inBand(is, r)) { endNudge(); return; }
    if (now && now.key === is.key && now.act !== is.act) { is.act = now.act; is.dir = now.dir; is.title = now.title; is.txt = now.txt; unlock([is.act]); setPulse([sel(is.act), rdSel(is.key)]); stripFor(); var nd = nudge; say(now.txt.nudge, { auto: true, hop: true, stale: function () { return nudge !== nd; } }); nudge.act = null; return; } /* v71 (play-test #21 m1): an overshoot turns the nudge round and says so (it said Tap it again on the old button) */
    if (nudge.act && nudge.act === is.act && !nudge.hinted) { nudge.hinted = true; var nn = nudge; say('Still a little off. Tap it again.', { auto: true, stale: function () { return nudge !== nn; } }); }
    nudge.act = null;
  }
  function endNudge() {
    var n = nudge; nudge = null; clearPulse(); cool[n.is.key] = hrs() + 12; capPaused = false;
    var k = n.is.key, green = function () { var rr = reads(); return !!(rr && rr.status && rr.status[k] === 'good'); }; /* said late (queued behind another line) and the tile is green already: "See the tile go green?" would be stale */
    if (n.lesson) {
      problemDone = true; learned(LEARN.problem);
      say('Fixed! See the tile go green? Green means happy.', { keep: true, hop: true, lateStale: green });
    } else say(['Nice fix!', 'Back in the green.', "That's the way."][(hrs() >> 1) % 3], { auto: true, hop: true, lateStale: green });
    if (run && run.ph === 'watch') goFast('Back in the green, speeding up to 3x');
    stripFor();
  }

  /* ----------------------------------------------------------- progress */
  /* only the real grow is saved (the warm-up is a throwaway sim); a failed write is silent: the lesson just isn't resumable */
  function saveProgress() {
    try {
      if (!run || run.name !== 'grow' || phaseName !== 'grow') return false;
      var s = S(); if (!s || typeof Sim === 'undefined' || !Sim.serialize) return false;
      var keys = function (o) { return Object.keys(o).filter(function (k) { return o[k]; }); };
      localStorage.setItem(PROG, JSON.stringify({
        v: 1, savedAt: Date.now(), step: run.i, method: methodNow(), crop: s.cropId, sim: Sim.serialize(s),
        extra: { cost: s.__cost, fan: s.__fan, hum: s.__hum, refills: s.__refills, rot: s.__rot, tw: s.__tipWeek, ti: s.__tipIdx },
        flags: { ph: run.ph, coached: coached, tankDone: tankDone, problemDone: problemDone, phCorrected: phCorrected, phDriftTold: phDriftTold, replaying: !!replaying, cool: cool }
      }));
      return true;
    } catch (e) { return false; }
  }
  /* Continue: start a sim with the saved method and crop, swap the saved sim in (ui.js restoreLesson), and enter the saved step (its prompt is said again) */
  function resume(p) {
    var g = G(); if (!g || !g.startWith || !g.restoreLesson) return false;
    var i = progIndex(p), f = p.flags || {}, m = (p.method && p.method.how) ? p.method : defaultMethod(), script = scriptFor(m);
    quiet = true; replaying = typeof f.replaying === 'boolean' ? f.replaying : !!lsGet().done; starting = true;
    try {
      g.startWith(mkPick({ method: m, crop: p.crop }), {}, 'beginner');
      starting = false;
      if (!g.restoreLesson({ sim: p.sim, extra: p.extra })) throw new Error('saved lesson sim would not load');
      if (f.ph === 'after') { var st0 = script[Math.floor(p.step)]; if (st0 && st0.onDone) { try { st0.onDone({}); } catch (e) {} } }
      g.setSpeed(1); wrapGame(); g.step(0);
      say('Welcome back! Let us pick up where we left off.', { auto: true, hop: true, dwell: 3000, stale: function () { return !run; } });
      begin('grow', script, { i: i, flags: f });
    } catch (e) { starting = false; try { console.warn('beginner resume', e); } catch (x) {} cleanup(); return false; }
    return true;
  }

  /* ----------------------------------------------------- phases and exits */
  /* rs = {i, flags}: resume a saved lesson. The dock and the readings come from the step index (every earlier step's buttons, every reading up to this step) plus whatever else the flags unlocked (Fan early, a nudge's fix button, Ask Axel) */
  function topUpStep() { for (var j = 0; j < run.steps.length; j++) if (run.steps[j].title === 'Top up the tank') return j; return run.steps.length; }
  function applyResume(rs) {
    var f = rs.flags || {};
    run.i = rs.i;
    tankDone = !!f.tankDone || rs.i > topUpStep(); problemDone = !!f.problemDone; phCorrected = !!f.phCorrected; phDriftTold = !!f.phDriftTold;
    cool = f.cool && typeof f.cool === 'object' ? f.cool : {}; coached = f.coached && typeof f.coached === 'object' ? f.coached : {};
  }
  function begin(name, steps, rs) {
    phaseName = name; run = { name: name, steps: steps, i: 0, ph: null, t0: 0, act: null, ctx: {}, tok: 0 };
    nudge = null; capPaused = false; cool = {}; userPaused = false; userSlow = false; lastSlow = null; greenSince = null; gst = null; remindKey = '';
    tankDone = false; problemDone = false; phCorrected = false; phDriftTold = false; coached = {};
    if (rs) applyResume(rs);
    mountChrome(); applyDock(); applyReads();
    if (!poll) poll = setInterval(check, 200);
    stepEnter();
  }
  /* the sim is already running with the player's own plant (ui.js startGame): put the day-zero tank in and start the method script. Nothing is said before the first line. */
  function beginMethod() {
    var g = G(); if (!g) return false;
    var s = g.S, m = methodNow();
    try {
      if (s) {
        /* a believable "day zero": half-full tank of plain water, a pH a little high, lights on a long day that is not the stage's */
        if (s.cap && !s.pot) s.resL = Math.min(s.cap, 26); /* v36d: a TANK starts half full; a pot or bed keeps the engine's watered-in start (this line used to fill the pot to the brim, so Soil read 100 % and red before the player did anything) */
        if (s.resL != null && !s.pot) { s.nutL = 0.02 * s.resL; s.inertL = 0.25 * s.resL; s.mlPerL = 0; }
        var rd0 = reads(), pt = rd0 && rd0.targets && rd0.targets.ph; if (pt && m.how !== 'soil') s.ph = pt[1] + (m.where === 'tent' ? 0.4 : 0.3); /* v36d: outside the day-zero pH reads amber, not red (play-test #6: a red tile before the first tap read harsh) */
        var lt = lightTarget(); s.lightHours = lt === 18 ? 14 : 18;
      }
    } catch (e) { console.warn(e); }
    g.setSpeed(1); wrapGame(); g.step(0);
    begin('grow', scriptFor(m));
    return true;
  }
  /* ui.js startGame calls this once the setup step has built the sim (the walk through the setup tiles is the "choose how you want to grow") */
  function attach() {
    if (starting || active()) return false;
    quiet = true; replaying = !!lsGet().done; progClear();
    try { return beginMethod(); } catch (e) { console.warn('beginner attach', e); cleanup(); return false; }
  }
  /* Skip (always on the strip): the script ends, the same grow carries on in Learn mode (contextual tips), nothing is lost */
  function skip() {
    if (!active()) return false;
    var prev = lsGet(); progClear(); clearPulse();
    if (!prev.done && !prev.skipped) lsSet(Object.assign({}, prev, { skipped: true, when: new Date().toISOString() }));
    var wasPaused = curSpeed() === 0 && !userPaused; /* v36b: Skip resumes a clock the lesson had paused */
    cleanup();
    if (wasPaused) setSp(1);
    try { var g = G(); if (g && g.setMode) g.setMode('learn'); } catch (e) {}
    try { if (window.Goals) Goals.start(S()); } catch (e) {} /* v37: the goal line takes over from the lesson strip */
    toast('Skipped. I will still shout when a tile needs you.', 3200);
    try { document.dispatchEvent(new CustomEvent('hygrow:skip', { detail: {} })); } catch (e) {}
    return true;
  }
  /* v36b "Finish lesson, keep growing": the script ends, the SAME grow carries on in free mode (no coaching) and is saved, so Continue on the title picks it up. Never the title, never a dropped grow. */
  function finishKeep() {
    if (!active() && phaseName !== 'done') return false; /* v37 [M31] the end card's primary button is this too */
    var prev = lsGet(); progClear(); clearPulse();
    if (!prev.done && !prev.skipped) lsSet(Object.assign({}, prev, { skipped: true, when: new Date().toISOString() }));
    var wasPaused = curSpeed() === 0 && !userPaused;
    cleanup();
    if (wasPaused) setSp(1);
    try { var g = G(); if (g && g.setMode) g.setMode('free'); if (g && g.save) g.save(); } catch (e) {}
    try { if (window.Goals) Goals.start(S()); } catch (e) {}
    toast('Lesson finished. You are on your own now. I will shout if the plant is in real trouble.', 3600);
    try { document.dispatchEvent(new CustomEvent('hygrow:skip', { detail: { finish: true } })); } catch (e) {}
    return true;
  }
  function finishGrow() {
    var prev = lsGet(), was = !!prev.done;
    progClear();
    phaseName = 'done'; clearInterval(poll); poll = 0; clearPulse(); nudge = null; capPaused = false; setSp(0);
    learned(LEARN.ready, true); /* counted for the Almanac shelf, but no sheet: the finish card below says it, so the finale is harvest card, then finish card */
    lsSet(was ? Object.assign({}, prev, { done: true, method: methodNow(), replays: (prev.replays || 0) + 1, lastReplay: new Date().toISOString() }) : { done: true, method: methodNow(), when: new Date().toISOString() });
    var mates = 0;
    try { if (!was && window.Campaign && Campaign.addMates) { Campaign.addMates(5, 'beginner'); mates = 5; } } catch (e) {}
    strip('<b>All done</b> · ' + (was ? 'you grew your ' + cropWord() + ' again' : 'you grew your first ' + cropWord()), 1, 'done');
    afterCards(function () {
      say(was ? "Done again. That's a lovely " + cropWord() + ', and the Campaign is waiting.' : 'You grew your first ' + cropWord() + ", and you're ready for the Campaign!", { wave: true, hop: true, keep: true });
      setTimeout(function () { doneCard(mates); }, reduce() ? 300 : 1400);
    });
  }
  /* run fn once the "You just learned" sheet (cards.js) for the harvest has been dismissed; never wait longer than 16 s */
  function afterCards(fn) {
    var fired = false, go = function () { if (fired) return; fired = true; if (phaseName === 'done') fn(); };
    try { if (window.Cards && Cards.whenIdle) Cards.whenIdle(go); else go(); } catch (e) { go(); }
    setTimeout(go, 16000);
  }
  /* v37 [M31] what the end card shows: kg picked, Eco, and the nudge to keep growing (day and kg from CROP_DATA: stage days and yieldTarget x plants) */
  function doneStats() {
    var out = { kg: '0', eco: '0', keep: '' };
    try {
      var s = S(), sc = Sim.score(s), C = window.CROP_DATA && CROP_DATA[s.cropId], fmt1 = function (n) { return n >= 1 ? (Math.round(n * 10) / 10) : (Math.round(n * 100) / 100); };
      out.kg = String(Math.round((s.harvestedKg != null ? s.harvestedKg : sc.yieldKg) * 100) / 100); /* v67 (critic round 16 m5): Picked is what was picked; for cut basil the score also counts the standing leaf */ out.eco = String(Math.round(sc.eco));
      if (C && C.stages) {
        var N = C.stages.reduce(function (a, x) { return a + x.days; }, 0), X = C.yieldTarget * (s.plantedEver || s.nplants || 1), ended = !!Sim.readings(s).cropDone;
        if (X > 0 && sc.yieldKg < 0.9 * X) out.keep = ended ? 'Next grow: wait until day ' + N + ' and this ' + cropWord() + ' can fill out to as much as ' + fmt1(X) + ' kg when everything goes right.' : 'Keep growing: by day ' + N + ' this ' + cropWord() + ' can fill out to as much as ' + fmt1(X) + ' kg when everything goes right.'; /* v67 (critic round 16 m4): the figure is the best case, not a promise (a spring tomato made about 5.6 of 24 kg) */
      }
    } catch (e) {}
    return out;
  }
  /* v37 [M31] primary button on the end card: the lesson ends, the same grow carries on in free mode (a finished crop stays on its harvest card) */
  function keepAfterDone() {
    var dn = $('#bgDone'); if (dn && dn.parentNode) dn.parentNode.removeChild(dn);
    var ended = false; try { ended = !!Sim.readings(S()).cropDone; } catch (e) {}
    if (!ended) { finishKeep(); return; } /* a live crop carries on in free mode, saved, with the goal line */
    cleanup(); /* a finished crop stays on its harvest card; nothing to save or coach */
    try { var g = G(); if (g && g.setMode) g.setMode('free'); } catch (e) {}
    toast('Lesson finished. Grow again whenever you like.', 3200);
    try { document.dispatchEvent(new CustomEvent('hygrow:skip', { detail: { finish: true } })); } catch (e) {}
  }
  function doneCard(mates) {
    if (phaseName !== 'done' || $('#bgDone')) return;
    try { document.dispatchEvent(new CustomEvent('hygrow:skip', { detail: { done: true } })); } catch (e) {} /* v49: no bubble under the end card (play-test #8: a tap on a hidden Got it landed on the title) */
    var d = document.createElement('div'); d.className = 'modal show'; d.id = 'bgDone'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'First grow done');
    var sc = doneStats(); /* [M31] */
    d.innerHTML = '<div class="card bgd"><h2>' + (+sc.kg > 0 ? 'You did it!' : 'Lesson over') + '</h2><p>' + (!(+sc.kg > 0) ? 'The ' + cropWord() + ' finished with nothing ripe to pick. Next time keep every tile green, and act as soon as one goes orange.' : replaying ? 'You grew and picked your ' + cropWord() + ' with Axel again.' : 'You grew and picked your first ' + cropWord() + ' with Axel.') + (mates ? ' <b>+' + mates + ' Mates</b> for the Campaign.' : '') + '</p>' +
      '<div class="bgd-stats"><div><b>' + sc.kg + ' kg</b><span>Picked</span></div><div><b>' + sc.eco + '</b><span>Eco score</span></div></div>' + (sc.keep ? '<p class="bgd-keep">' + sc.keep + '</p>' : '') + '<div class="foot"><button class="big" id="bgdKeep" type="button">Finish lesson, keep growing</button><button class="ghost" id="bgdMenu" type="button">Back to the title</button><button class="ghost" id="bgdKit" type="button">Take this home</button><button class="ghost" id="bgdCamp" type="button">Start the Campaign</button></div>' +
      '<div class="bgd-trail">' + trail() + '</div></div>'; /* v66 (round 15 keyboard m5): the buttons come before the path pills, so Finish lesson is the first stop after the heading */
    document.body.appendChild(d);
    d.querySelector('#bgdKit').onclick = function () { try { if (window.TakeHome) window.TakeHome.show(); } catch (e) {} };
    var chip = function () { try { if (window.__game && __game.afterHarvest) __game.afterHarvest(); } catch (e) {} }; /* v56 (play-test #12 #11): first harvest done, so the install chip may show once the card is gone */
    d.querySelector('#bgdMenu').onclick = function () { chip(); leave(); };
    d.querySelector('#bgdCamp').onclick = function () { chip(); leave('campaign'); };
    d.querySelector('#bgdKeep').onclick = function () { chip(); keepAfterDone(); }; /* [M31] */
    bindTrail(d, true);
    try { d.querySelector('#bgdKeep').focus({ preventScroll: true }); } catch (e) {}
    try { if (window.Fx) Fx.confetti($('#tent'), { n: 70 }); } catch (e) {}
  }
  function cleanup() {
    clearInterval(poll); poll = 0; clearTimeout(flashT);
    if (run) run.tok = ++tokSeq;
    run = null; nudge = null; capPaused = false; phaseName = null; quiet = false;
    unmountChrome();
  }
  function leave(go) {
    var was = active();
    progClear();
    cleanup();
    try { if (was && window.TakeHome && window.TakeHome.isOpen && window.TakeHome.isOpen()) window.TakeHome.close(); } catch (e) {} /* leaving during the warm-up's card: the card goes too (its callback no longer starts the lesson) */
    var m = $('#menu'); if (m) m.click();
    if (go) { var b = $('[data-mode="' + go + '"]'); if (b) setTimeout(function () { b.click(); }, 60); }
    return was;
  }

  /* ---------------------------------------------------------------- title */
  function trail() {
    var b = function (m, label, tip) { return '<button type="button" class="bgt-st" data-bgmode="' + m + '" title="' + tip + '">' + label + '</button>'; };
    return '<div class="bgtrail" role="list" aria-label="Your path"><span class="bgt-st done" role="listitem">Beginner ✓</span><i aria-hidden="true">›</i>' +
      b('campaign', 'Campaign', 'Story mode') + '<i aria-hidden="true">›</i>' + b('challenge', 'Weekly challenge', 'Same seed for everyone') + '<i aria-hidden="true">›</i>' + b('free', 'Pro', 'Free grow, no hints') + '</div>';
  }
  function bindTrail(root, closeFirst) {
    root.querySelectorAll('[data-bgmode]').forEach(function (b) { b.onclick = function () { var m = b.dataset.bgmode; if (closeFirst) leave(m); else { var t = $('[data-mode="' + m + '"]'); if (t) t.click(); } }; });
  }
  /* the small "Start over" link under the mode card while a lesson is in progress (a sibling, not inside the button: no nested controls) */
  function mountOver(btn, on, root) {
    var o = root.querySelector('#bgOver');
    if (!on) { if (o) o.remove(); return; }
    if (!o) {
      o = document.createElement('button'); o.type = 'button'; o.id = 'bgOver'; o.textContent = 'Start over';
      o.setAttribute('style', 'grid-column:1/-1;justify-self:start;background:none;border:0;color:var(--muted);text-decoration:underline;font-size:12.5px;min-height:40px;padding:4px 8px;cursor:pointer');
      if (btn.insertAdjacentElement) btn.insertAdjacentElement('afterend', o); else if (btn.parentNode) btn.parentNode.insertBefore(o, btn.nextSibling);
    }
    o.onclick = function () { startOver(); };
  }
  /* v36: the title has one primary "Start growing" tile (ui.js / index.html) and a closed "More ways to play". This only sets the copy of the Guided lesson tile inside it and the small "Start over" link under Continue. */
  function mountTitle(root) {
    if (active() || phaseName === 'done') cleanup(); /* back on the title: leave the lesson */
    try {
      root = root || $('#title'); if (!root) return;
      var st = lsGet(), prog = progGet(), pn = prog ? progIndex(prog) + 1 : 0, btn = root.querySelector('#modeBeginner');
      if (btn) { var cp = titleCopy(!!st.done, 0), bb = btn.querySelector('b'), sp = btn.querySelector('span'); if (bb) bb.textContent = cp.title; if (sp) sp.textContent = cp.blurb; }
      var cont = root.querySelector('#continue'), hasSave = false;
      try { hasSave = !!localStorage.getItem(SAVE); } catch (e) {}
      mountOver(cont || btn, !!prog && !hasSave, root);
      var old = root.querySelector('#bgTitle'); if (old) old.remove(); /* the v35 big "Grow with Axel" box is gone */
    } catch (e) { try { console.warn('beginner title', e); } catch (x) {} }
  }

  /* ------------------------------------------------------------- public API */
  function start(o) {
    var g = G(); if (!g || !g.startWith) return false;
    var fresh = !!(o && o.fresh), p = fresh ? null : progGet();
    if (fresh || !p) progClear(); /* also drops a corrupt or out-of-range blob */
    if (active() || phaseName === 'done') cleanup();
    if (p) { if (resume(p)) return true; progClear(); } /* a save that will not load is dropped and the lesson starts from the top */
    tankDone = false; problemDone = false; phCorrected = false; phDriftTold = false; coached = {}; quiet = true; replaying = !!lsGet().done;
    starting = true;
    try { g.startWith(mkPick(o), {}, 'beginner'); starting = false; beginMethod(); } catch (e) { starting = false; console.warn('beginner start', e); cleanup(); return false; }
    return true;
  }
  function startOver() { return start({ fresh: true }); }
  function onEvent(ev) {
    if (!active()) return false;
    if (ev && ev.type === 'stage') {
      try { Sfx.play('stage'); } catch (e) {}
      try { if (window.Fx && Fx.stageCard) Fx.stageCard('Growing time!', 'Your basil is a young plant now'); } catch (e) {}
    }
    return true; /* Beginner speaks for itself; engine tips and problem bubbles stay out of the way */
  }
  window.Beginner = {
    start: start, replay: function () { return start({ fresh: true }); }, startOver: startOver,
    saveProgress: saveProgress, hasProgress: function () { return !!progGet(); }, progressStep: function () { var p = progGet(); return p ? progIndex(p) + 1 : 0; }, progKey: PROG, /* the in-game Menu calls ui.js save() first, then this: same entry point as the title card, from step 1 */
    attach: attach, skip: skip, finishKeep: finishKeep, progressTotal: function () { var p = progGet(); return p ? scriptLen(p.method) : 0; }, scriptFor: scriptFor, scriptLen: scriptLen,
    mountTitle: mountTitle, trail: trail, titleCopy: titleCopy, REPLAY_CONFIRM: REPLAY_CONFIRM, isReplay: function () { return replaying && (active() || phaseName === 'done'); },
    _finish: finishGrow, /* test hook */ onEvent: onEvent, leave: leave,
    isDone: function () { return !!lsGet().done; },
    experienced: experienced, returning: returning,
    isActive: active,
    phase: function () { return phaseName; },
    stepIndex: function () { return run ? run.i : -1; },
    state: function () { var st = cur(); return run ? { phase: phaseName, index: run.i, total: run.steps.filter(function (x) { return !x.hidden; }).length, title: st && st.title, ph: run.ph, nudge: nudge ? nudge.is.key : null, capPaused: capPaused, problemDone: problemDone } : { phase: phaseName }; },
    advance: function () { if (run && run.ph === 'talk') talkDone(); }, /* test/automation helper: dismiss the current talk step */
    reset: function () { try { localStorage.removeItem(LS); } catch (e) {} progClear(); }
  };
})();
