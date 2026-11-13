/* HyGrow Grow Sim - growers.js : the "Grower's card". One short card per crop for Perth-region growers.
 * Global: window.Growers = { CROPS, open(cropId), close(), isOpen(), data(cropId), lines(cropId) }.
 * Self-mounting: on DOMContentLoaded it adds a "Grower's card" button to #hextras and injects <style id="growersCss">.
 * No edits to ui.js / index.html needed beyond one <script src="growers.js"></script> tag.
 *
 * The EC / pH / temperature / light targets are NOT stored here: data() reads them from window.CROP_DATA (engine.js) every time,
 * so the card can never disagree with the sim. Everything else (sowing months, harvest timing, problems, fixes) is written text.
 * Sources for each line: docs/GROWERS-SOURCES.md. Every text line is 110 characters or fewer (tests/growers.test.js).
 * Products are named by CATEGORY only (pH meter, Calmag, clip fan ...), never a brand and never a price. */
(function () {
  'use strict';
  var CROPS = ['tomato', 'capsicum', 'chilli', 'strawberry', 'lettuce', 'basil', 'cucumber'];
  var SHORT = { tomato: 'Tomato', capsicum: 'Capsicum', chilli: 'Chilli', strawberry: 'Strawberry', lettuce: 'Lettuce', basil: 'Basil', cucumber: 'Cucumber' };
  var LAST_KEY = 'hygrow_growers_last_v1';
  var SAVE_KEY = 'hygrow_growsim_save_v1'; // ui.js save slot: read-only peek to open the card on the crop being grown

  /* ---------- written content ---------- */
  /* The game's Fan is the exhaust (inline) fan: it pulls hot, wet air OUT, so "fan" for cooling or drying always says "exhaust fan" here;
   * a clip fan only moves air over the leaves (tipburn, mildew, pollen). Every card carries FAN_NOTE under "What helps". */
  var FAN_NOTE = "The game's Fan is the exhaust fan; a clip fan moves air over the leaves.";
  /* One "Water" line per card (Water Corporation 2024-25 tables: pH about 6.9-8.5, hardness 29-228 mg/L, TDS about 130-600 mg/L; see docs/GROWERS-SOURCES.md). */
  var WATER = {
    title: 'Perth scheme water is alkaline and its hardness varies by suburb; bore water varies more, so test it.',
    fix: 'pH tends to climb and EC starts about 0.2 to 0.9. Use pH Down, Calmag if soft, and check the starting EC.'
  };
  /* v36c: per-method blocks, replacing the old "In the tent / In the backyard" pair. WHERE (tent, veranda, outdoors = garden bed) and HOW (soil, coco, hydro, tower).
   * Facts follow docs/METHODS.md (veranda: about half the sun and a fifth of the rain, 3 plants; bed: 1.2 x 1 m, 0.3 m deep, 6 plants; soil is buffered and forgiving;
   * coco drains free and drifts up in pH; a tower shares one reservoir). The outdoor places and the soil / coco / tower blocks never say tank, fan or lights.
   * `crop` names which per-crop sowing line goes with the place ('tent' or 'outdoor'). Every line is 110 characters or fewer. */
  var METHOD_BLOCKS = {
    where: {
      tent: { title: 'In the tent', crop: 'tent', lines: [
        'You run the climate: the lamp on its timer, the exhaust fan, and a humidifier when the air is dry.',
        'Tent size sets how many plants fit. Power is the running cost, so the bill is part of the game.'
      ] },
      veranda: { title: 'On the veranda', crop: 'outdoor', lines: [
        'Pots under cover get about half the sun and a fifth of the rain, so you water by hand.',
        'It runs a little warmer than the yard. Shade cloth takes the edge off a hot afternoon.',
        'On a cold night bring the pots inside. Room for about three plants, with only a gentle breeze.'
      ] },
      outdoors: { title: 'In the garden bed', crop: 'outdoor', lines: [
        'A bed about 1.2 by 1 m and 30 cm deep takes around six plants, in full sun and full rain.',
        'Cold nights and wind are the risks. Frost cloth over the bed at night, shade cloth on a scorcher.',
        'Rain does some of the watering. Watch the Rain and Wind tiles before you reach for the can.'
      ] }
    },
    how: {
      soil: { title: 'Growing in soil', lines: [
        'Soil is forgiving: it holds water and feed, so a slip shows up slowly. No pH bottles to juggle.',
        'Water when the Soil tile runs low. A pot kept soaked for a day or two starts to rot the roots.',
        'Feed about once a week. A heavy dose burns the roots; watering through washes some of it out.'
      ] },
      coco: { title: 'Growing in coco', lines: [
        'Coco drains freely and drinks fast, so it dries quicker than soil and wants feeding more often.',
        'Watering flushes salt out. Feed gently: it takes two or three feeds to land on the target strength.',
        'The pH drifts up with tap water, so check it and nudge it back toward 6. A drip timer does the routine feeds.',
        'Coir holds on to calcium and magnesium: buffer it, and add Calmag if leaves show spots or pale edges.' /* v37 */
      ] },
      hydro: { title: 'Growing in a hydro tub', lines: [
        'The roots sit in a tub of circulating feed with an air stone. You keep the tank full and EC and pH in band.',
        'It is the tent method: there is no soil to forgive a slip, so check the meters every day.'
      ] },
      tower: { title: 'Growing in a tower', lines: [
        'One reservoir feeds every slot, so all the plants share the same feed strength and pH.',
        'Plant a slot at a time so the crop is staggered. Each plant has its own age, so pick one slot at a time.',
        'Keep the reservoir topped up and check the pump is running.'
      ] }
    }
  };
  function methodNow() {
    try { var g = window.__game; if (g && g.S && g.S.method && g.S.method.where) return g.S.method; } catch (e) {}
    return null;
  }
  /* blocks for one grow: [{ kind: 'where' | 'how', key, title, lines, crop? }]; with no method, every block (the card is then just reference) */
  /* v36c: the per-crop harvest.real lines were written for the tent; outside, say so and allow for cooler nights slowing things down. */
  function realLine(d, method) {
    var r = d.harvest.real, w = method && method.where;
    if (w === 'veranda') return r.replace(/^In a real tent:/, 'In pots on a Perth veranda:') + (/backyard soil/.test(r) ? '' : ' Cool nights can add a week or two.');
    if (w === 'outdoors') return r.replace(/^In a real tent:/, 'In a Perth garden bed:') + (/backyard soil/.test(r) ? '' : ' Spring plantings run a week or two slower than a warm tent.');
    return r;
  }
  function methodBlocks(method) {
    var out = [];
    function add(kind, key) { var b = METHOD_BLOCKS[kind][key]; if (b) out.push({ kind: kind, key: key, title: b.title, lines: b.lines.slice(), crop: b.crop || null }); }
    if (method && METHOD_BLOCKS.where[method.where]) {
      add('where', method.where);
      add('how', METHOD_BLOCKS.how[method.how] ? method.how : (method.where === 'tent' ? 'hydro' : 'soil'));
    } else {
      Object.keys(METHOD_BLOCKS.where).forEach(function (k) { add('where', k); });
      Object.keys(METHOD_BLOCKS.how).forEach(function (k) { add('how', k); });
    }
    return out;
  }
  var CONTENT = {
    tomato: {
      sow: {
        tent: 'Any month. Lights warm the tent in winter; from Dec to Feb the exhaust fan fights the heat and the power bill.',
        outdoor: 'Backyard: plant out Aug to Oct, or Feb to Mar for an autumn crop. Deep summer heat drops the flowers.',
        climate: 'Perth summer days sit around 31-32C with hotter spells, and flowers drop; winter nights near 8C slow it down.'
      },
      harvest: {
        real: 'In a real tent: about 8 to 10 weeks after you transplant a seedling (roughly 55 to 70 days).',
        keeps: 'Keeps giving for months: roughly 6 to 9 months of picking in a good setup.'
      },
      problems: [
        { title: 'Flowers drop in January heat', fix: 'Run the exhaust fan, dim the light and stay in the day range above. Shade cloth outdoors.' },
        { title: 'Blossom end rot (black, sunken fruit bottoms)', fix: 'Keep the tank topped up, hold pH in range, do not overfeed. Add Calmag if the feed is calcium-light.' },
        { title: 'Whitefly and aphids', fix: 'Check under the leaves every week. Sticky traps early, then a pest spray at the first sign.' },
        { title: 'Medfly in ripe and over-ripe fruit (backyard)', fix: 'Pick ripe fruit, bin fallen fruit, bag trusses in fine mesh. A tent with a mesh intake is safe.' },
        { title: 'Two-spotted mite in hot, dry spells', fix: 'Fine webbing and pale stipple under leaves. Check weekly, keep humidity up, spray early.' }
      ],
      water: WATER,
      helps: ['A pH meter and pH down', 'An EC meter', 'An inline exhaust fan', 'A clip fan', 'Calmag', 'A pest spray', 'Shade cloth, or lowering the light'],
      fun: 'A shake or a clip fan breeze helps pollen fall, so it helps fruit set as well as moving air.'
    },
    capsicum: {
      sow: {
        tent: 'Any month. It wants steady warmth: lights carry the winter, the exhaust fan carries Dec to Feb.',
        outdoor: 'Backyard: plant out Sep to Dec (Jul to Sep in a warm, sheltered spot). Later plantings fruit into the cold.',
        climate: 'Flowers drop in a Perth heatwave and fruit goes misshapen in a cold snap, so aim for steady.'
      },
      harvest: {
        real: 'In a real tent: roughly 9 to 15 weeks after you transplant a seedling, green fruit first.',
        keeps: 'Picked in 3 to 4 rounds over roughly 6 to 8 weeks.'
      },
      problems: [
        { title: 'Flowers drop in a heatwave', fix: 'Exhaust fan up, light down. Outdoors, 25 to 40 percent shade cloth cuts sunburn and heat.' },
        { title: 'Blossom end rot', fix: 'Steady water and pH, no overfeeding, and Calmag if the feed is calcium-light.' },
        { title: 'Aphids and whitefly', fix: 'Look under leaves every week. Sticky traps first, then a pest spray early.' },
        { title: 'Cold stall in winter', fix: 'Keep the tent above the cold limit in the game targets. Lights on, a heat mat under the roots.' },
        { title: 'Medfly in backyard fruit', fix: 'Bag fruit in fine mesh once it sets, bin fallen fruit weekly. A tent with a mesh intake is safe.' }
      ],
      water: WATER,
      helps: ['An inline exhaust fan', 'A pH meter and pH down', 'An EC meter', 'Calmag', 'A heat mat', 'A pest spray', 'Shade cloth, or lowering the light'],
      fun: 'A green capsicum is just an unripe one. Leave it on and it turns red, yellow or orange, and sweeter.'
    },
    chilli: {
      sow: {
        tent: 'Any month. Chillies like it warm, so winter needs a warm tent and a heat mat for the roots.',
        outdoor: 'Backyard: sow indoors Aug to Sep, plant out Sep to Nov. A January start fruits into the cold.',
        climate: 'Tougher than capsicum in summer heat, but they sulk and stall on cold Perth winter nights.'
      },
      harvest: {
        real: 'In a real tent: roughly 12 to 17 weeks after you transplant (chillies are slow, so allow the long end).',
        keeps: 'Often six pickings over about 7 weeks. Ripe fruit keeps coming while it stays warm.'
      },
      problems: [
        { title: 'Cold stall', fix: 'Growth stops when air or solution drops under the game limits. Heat mat, lights on, no cold draughts.' },
        { title: 'Flowers drop in a heatwave', fix: 'Exhaust fan up and light down once the air passes the heat limit in the targets.' },
        { title: 'Aphids and thrips', fix: 'Check under the leaves weekly. Sticky traps, then a pest spray early. Thrips also spread virus.' },
        { title: 'Medfly in ripe fruit (backyard)', fix: 'Bag ripe fruit in fine mesh, bin fallen fruit weekly. A tent with a mesh intake is safe.' }
      ],
      water: WATER,
      helps: ['A heat mat', 'An inline exhaust fan', 'A pH meter and pH down', 'An EC meter', 'A pest spray', 'Shade cloth, or lowering the light'],
      fun: 'The burn lives in the white pith inside, not the seeds. Wear gloves when you cut the hot ones.'
    },
    strawberry: {
      sow: {
        tent: 'Any month. Strawberries like it cool, so summer is the hard one and the power bill shows it.',
        outdoor: 'Backyard: plant runners Mar to Aug (the cool months) so they fruit in spring. Some go in during Oct.',
        climate: 'January and February heat cooks small plants and soft berries; Perth winter cold suits them fine.'
      },
      harvest: {
        real: 'In a real tent: roughly 8 to 12 weeks after planting; each berry takes about 4 to 6 weeks from flower.',
        keeps: 'Day-neutral types fruit in flushes for 5 months or more (an Illinois trial picked May to October).'
      },
      problems: [
        { title: 'Powdery mildew and grey mould', fix: 'Clip fan on the leaves. Dry leaves help against grey mould. Pick off mouldy fruit and old leaves.' /* v37 */ },
        { title: 'Heat in January and February', fix: 'Shade cloth outdoors. In the tent: light down, exhaust fan up, solution kept cool.' },
        { title: 'Aphids and two-spotted mite', fix: 'Hot, dry spells bring mites. Check under the leaves weekly and spray early.' },
        { title: 'Feed too strong (scorched leaf edges)', fix: 'Strawberries want a gentler EC than tomatoes. Check it against the targets above.' },
        { title: 'Medfly in ripe berries (backyard)', fix: 'Pick ripe berries daily, bin soft ones, net the bed with fine mesh. A tent with a mesh intake is safe.' }
      ],
      water: WATER,
      helps: ['An EC meter', 'A pH meter and pH down', 'A clip fan', 'An inline exhaust fan', 'A thermo-hygrometer', 'A pest spray', 'Shade cloth, or lowering the light'],
      fun: 'The little seeds on the outside are each a separate fruit, so a strawberry is not a true berry.'
    },
    lettuce: {
      sow: {
        tent: 'Any month, but summer is the hard one: lettuce wants a cool tent, and cooling costs power.',
        outdoor: 'Backyard: autumn (Mar to May) is easiest and winter is fine. Summer needs 30 to 40 percent shade.',
        climate: 'Summer heat makes it bitter and sends it to seed. A Perth winter suits it fine.'
      },
      harvest: {
        real: 'In a real tent: roughly 5 to 7 weeks from seed. In backyard soil it is nearer 6 to 10 weeks.',
        keeps: 'One pick per plant: cut the head and that plant is done. Sow a few more every couple of weeks.'
      },
      problems: [
        { title: 'Tipburn on hot afternoons (brown, crisp inner leaves)', fix: 'Keep a clip fan on the leaves, ease the light, no strong feed. Calmag if the feed is calcium-light.' },
        { title: 'Bolting (tall, bitter flower stalk)', fix: 'Keep the air under about 25 °C: hotter days make lettuce bolt and turn bitter.' },
        { title: 'Warm tank and root rot', fix: 'Roots brown and slimy. Keep the solution cool and bubbling with an air pump and stone.' },
        { title: 'Aphids', fix: 'Check the heart of the head. Wipe off or use a pest spray early, before the head closes.' }
      ],
      water: WATER,
      helps: ['An inline exhaust fan', 'A clip fan', 'An air pump and stone', 'An EC meter', 'A pH meter and pH down', 'Calmag', 'A thermo-hygrometer', 'Shade cloth, or lowering the light'],
      fun: 'Lettuce is in the daisy family, so it is a cousin of the sunflower.'
    },
    basil: {
      sow: {
        tent: 'Any month. Basil hates a chill, so winter needs a warm tent; summer needs the exhaust fan.',
        outdoor: 'Backyard: Sep to May in a sunny spot. Skip the cold months, it sulks below about 12C.',
        climate: 'Summer is its season if it gets water and airflow. Perth winter nights are too cold for it.'
      },
      harvest: {
        real: 'In a real tent: first cut about 4 to 5 weeks from seed, once the plant is 10 to 20 cm tall.',
        keeps: 'Cut-and-come-again for roughly 2 to 3 months, until it flowers. Pinch the buds to stretch it.'
      },
      problems: [
        { title: 'Bolting to flower in spring heat', fix: 'Pinch the flower buds as they show and cut often. A cooler tent and shade slow it.' },
        { title: 'Downy mildew in humid weeks', fix: 'Yellow top patches, grey fuzz under. Run the exhaust fan, add a clip fan, space the plants.' },
        { title: 'Cold nights', fix: 'Cold damages leaves and stalls growth. Keep the tent and the solution above the cold limits.' },
        { title: 'Two-spotted mite in hot, dry spells', fix: 'Fine webbing and pale stipple under leaves. Check weekly, keep humidity up, spray early.' }
      ],
      water: WATER,
      helps: ['An inline exhaust fan', 'A clip fan', 'A thermo-hygrometer', 'A pH meter and pH down', 'An EC meter', 'A heat mat', 'Shade cloth, or lowering the light'],
      fun: 'Basil is in the mint family. Keep picking the top leaves and it grows bushier.'
    },
    cucumber: {
      sow: {
        tent: 'Any month. It wants steady warmth: lights carry the winter, the exhaust fan carries Dec to Feb.',
        outdoor: 'Backyard: seed or seedlings Aug to Jan. Give the vine a trellis so air gets through.',
        climate: 'Hot spells make bitter, curled fruit and cold snaps stall it. Mild damp autumn weeks bring mildew.'
      },
      harvest: {
        real: 'In a real tent: about 30 to 45 days (4 to 6 weeks) after you transplant a seedling.',
        keeps: 'Roughly 2 to 3 months of picking: a Lebanese plant can give 55 to 75 fruit over 22 to 27 picks.'
      },
      problems: [
        { title: 'Powdery mildew in humid autumn weeks', fix: 'It likes still, humid air, not wet leaves. A clip fan on them, pick off bad leaves, milk spray (1 to 10).' /* v37 */ },
        { title: 'Heat stress and bitter fruit', fix: 'Exhaust fan up, light down, and keep the tank topped up. Strong feed and drought make it worse.' },
        { title: 'Whitefly and aphids', fix: 'Both love warm, humid air. Check under leaves every week, sticky traps, pest spray early.' },
        { title: 'Cold stall', fix: 'Growth slows hard in the cold. Keep the tent above the cold limit in the targets.' },
        { title: 'Two-spotted mite in hot, dry spells', fix: 'Fine webbing and pale stipple under leaves. Check weekly, keep humidity up, spray early.' }
      ],
      water: WATER,
      helps: ['An inline exhaust fan', 'A clip fan', 'A thermo-hygrometer', 'An EC meter', 'A pH meter and pH down', 'A pest spray', 'Shade cloth, or lowering the light'],
      fun: 'A cucumber is about 95 percent water, so it is thirsty and the tank drops fast.'
    }
  };

  /* "What helps" chips: label -> shop category slug (the slugs in shop.js CATS, plus extractors / pest-control / propagation from the shop's own
   * store-categories-sitemap.xml; null = no category page, link the store home) and the Almanac gear id that explains it, if any. No brands, no prices. */
  var HOME = 'https://www.hygrowhydroponics.com.au';
  var UTM_BASE = 'utm_source=game&utm_medium=app&utm_campaign=';
  var CHIPS = {
    'A pH meter and pH down': { slug: 'test-equipment', gear: 'ph' },
    'An EC meter': { slug: 'test-equipment', gear: 'ec' },
    'A thermo-hygrometer': { slug: 'test-equipment', gear: 'thermo' },
    'An inline exhaust fan': { slug: 'extractors', gear: 'fanController' },
    'A clip fan': { slug: 'extractors', gear: null },
    'Calmag': { slug: 'additives', gear: 'calMag' },
    'A pest spray': { slug: 'pest-control', gear: 'pestSpray' },
    'A heat mat': { slug: 'propagation', gear: 'heatMat' },
    'An air pump and stone': { slug: 'irrigation', gear: 'aqua2500' },
    'Shade cloth, or lowering the light': { slug: null, gear: null }
  };
  function chipUrl(label, cropId) {
    var c = CHIPS[label], slug = c ? c.slug : null;
    return (slug ? HOME + '/category/' + slug : HOME + '/') + '?' + UTM_BASE + encodeURIComponent(cropId);
  }

  /* ---------- in-game timing: derived from engine.js CROP_DATA stage lengths (never typed in) ----------
   * How the sim advances: a stage ends after days x 10.5 thermal-time units, 10.5 per day at the reference temperature, so a steady in-range
   * tent runs about one stage-day per game day. Harvest mass starts at stage fruitStage (default 3, fruiting); fruit takes ripeDays (default 7)
   * to ripen, leaf crops 0. Measured with the good-grower policy in tests/growers.test.js: first ripe fruit lands on game day
   * (days before fruitStage) + ripeDays + 1; a 'once' crop (lettuce) is full size when the last stage ends; a 'cut' crop (basil) shows the
   * "Ready to pick" alert about 5 days into its first cutting stage. The test asserts the card's day within 3 days of a real sim run. */
  function gameFirstPick(id) {
    var cd = window.CROP_DATA && window.CROP_DATA[id];
    if (!cd || !cd.stages || !cd.stages.length) return null;
    var days = cd.stages.map(function (s) { return s.days; });
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    var mode = cd.harvest || 'multi', fs = cd.fruitStage === undefined ? 3 : cd.fruitStage, pre = sum(days.slice(0, fs));
    var noun = cd.noun || 'fruit', day, text;
    if (mode === 'once') {
      day = sum(days) + 1;
      text = 'In the game: full-size ' + noun + ' around day ' + day + '; one cut ends the crop. The sim runs the calendar fast.';
    } else if (mode === 'cut') {
      day = pre + 5 + 1;
      text = 'In the game: first cut around day ' + day + ', then it regrows. The sim runs the calendar fast.';
    } else {
      day = pre + (cd.ripeDays === undefined ? 7 : cd.ripeDays) + 1;
      text = 'In the game: first pick around day ' + day + ' in a steady tent. The sim runs the calendar fast.';
    }
    return { day: day, text: text };
  }

  /* ---------- targets: read live from engine.js CROP_DATA ---------- */
  function rg(a) { return a[0] === a[1] ? String(a[0]) : a[0] + '-' + a[1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function targetsFor(id) {
    var cd = window.CROP_DATA && window.CROP_DATA[id];
    if (!cd || !cd.stages) return null;
    var stages = cd.stages.map(function (s) {
      return {
        stage: s.name, ec: s.ec.slice(), ph: s.ph.slice(), tempDay: s.tempDay.slice(), tempNight: s.tempNight.slice(),
        dli: s.dli.slice(), hours: s.photoperiod,
        line: cap(s.name) + ': EC ' + rg(s.ec) + ', pH ' + rg(s.ph) + ', day ' + rg(s.tempDay) + 'C, night ' + rg(s.tempNight) +
          'C, light ' + rg(s.dli) + ' DLI over ' + s.photoperiod + ' h'
      };
    });
    var limits = [];
    if (cd.heatT) limits.push('Heat stress (flowers drop) above ' + cd.heatT + 'C air.');
    if (cd.boltT) limits.push('Bolting above ' + cd.boltT + 'C air.');
    if (cd.coldT) limits.push('Cold stall below ' + cd.coldT + 'C air' + (cd.coldW ? ' or ' + cd.coldW + 'C solution' : '') + '.');
    if (cd.fe) limits.push('Iron lockout above pH ' + cd.fe + '.');
    return {
      note: "The game's targets. DLI is light per day (mol/m2). Temperatures are air, in C.",
      stages: stages, limits: limits,
      lines: stages.map(function (s) { return s.line; }).concat(limits)
    };
  }

  function data(id) {
    if (!CONTENT[id]) return null;
    var c = JSON.parse(JSON.stringify(CONTENT[id]));
    var cd = window.CROP_DATA && window.CROP_DATA[id];
    c.id = id;
    c.name = (cd && cd.name) || SHORT[id];
    var gp = gameFirstPick(id);
    c.harvest.first = gp ? gp.text : 'In the game: see the stage targets below. The sim runs the calendar fast.';
    c.gameDay = gp ? gp.day : null;
    c.helpsNote = FAN_NOTE;
    c.chips = c.helps.map(function (h) { return { label: h, href: chipUrl(h, id), gear: CHIPS[h] ? CHIPS[h].gear : null }; });
    c.targets = targetsFor(id);
    return c;
  }
  /* every line of text the card shows for one crop (used by the tests and by anything that wants to read the card aloud) */
  function lines(id) {
    var d = data(id); if (!d) return [];
    var out = [d.sow.tent, d.sow.outdoor, d.sow.climate, d.harvest.first, d.harvest.real, d.harvest.keeps, d.water.title, d.water.fix, d.helpsNote, d.fun];
    methodBlocks(null).forEach(function (b) { out = out.concat(b.lines); });
    d.problems.forEach(function (p) { out.push(p.title, p.fix); });
    d.helps.forEach(function (h) { out.push(h); });
    if (d.targets) out = out.concat(d.targets.lines);
    return out;
  }

  /* ---------- UI ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var modal = null, current = null, opener = null;

  function css() {
    if (window.__growersCss || document.getElementById('growersCss')) return;
    window.__growersCss = true;
    var s = document.createElement('style'); s.id = 'growersCss';
    s.textContent =
      '#growersCard .card{max-width:760px}' + /* the rest of the look (panel, border, radius, phone full-screen) comes from index.html */
      '#growersCard h2{margin:0;font-family:var(--display);font-size:24px}' +
      '#growersCard .gtop{display:flex;align-items:center;gap:10px}#growersCard .gtop .gicon{flex:none;display:inline-flex;min-width:34px}' +
      '#growersCard .gx{margin-left:auto;min-width:44px;min-height:44px;font-size:18px;line-height:1}' +
      '#growersCard .gsub{margin:2px 0 0;font-size:13px;color:var(--muted)}' +
      '#growersCard .gtabs{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}' +
      '#growersCard .gtabs button{flex:1 1 auto;min-height:44px;background:var(--panel2);border:2px solid var(--line);border-radius:10px;padding:6px 10px;font-weight:800;color:var(--text)}' +
      '#growersCard .gtabs button.on{background:var(--orange);color:var(--ink);border-color:var(--brown)}' +
      '#growersCard h3{margin:16px 0 6px}' +
      '#growersCard ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}' +
      '#growersCard li{background:var(--panel2);border:2px solid var(--line);border-radius:12px;padding:8px 12px;font-size:14px;line-height:1.4;overflow-wrap:anywhere}' +
      '#growersCard li b{color:var(--green)}#growersCard li.prob b{color:var(--orange);display:block}' +
      '#growersCard .gt li{font-size:13px;padding:6px 10px}' +
      '#growersCard .gnote{margin:4px 0 0;font-size:12.5px;color:var(--muted)}' +
      '#growersCard .gchips{display:flex;flex-wrap:wrap;gap:6px}' +
      '#growersCard .gchips a{display:inline-flex;align-items:center;min-height:40px;box-sizing:border-box;background:var(--panel2);border:2px solid var(--green);border-radius:999px;padding:5px 12px;font-size:13px;font-weight:700;color:var(--text);text-decoration:none}' +
      '#growersCard .gchips a:hover,#growersCard .gchips a:focus-visible{background:var(--green);color:var(--ink)}' +
      '#growersCard h2:focus{outline:none}' +
      '#growersCard .gfun{border-color:var(--orange)}' +
      '@media (max-width:600px){#growersCard .gtabs button{flex:1 1 30%}}';
    document.head.appendChild(s);
  }

  function peekGrowing() {
    try {
      var j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      var id = j && ((j.pick && j.pick.crop) || (j.sim && j.sim.cropId));
      if (id && CONTENT[id]) return id;
    } catch (e) {}
    return null;
  }
  function peekLast() {
    try { var id = localStorage.getItem(LAST_KEY); if (id && CONTENT[id]) return id; } catch (e) {}
    return null;
  }
  function remember(id) { try { localStorage.setItem(LAST_KEY, id); } catch (e) {} }

  /* v36c: the "When to start" lines for this grow's place (every place when no grow is open), then the how-block headings */
  function sowHtml(d) {
    var mb = curBlocks;
    if (!mb.known) return '<li><b>In the tent:</b> ' + esc(d.sow.tent) + '</li><li><b>Outside (veranda or garden bed):</b> ' + esc(d.sow.outdoor) + '</li>';
    var w = mb.blocks[0];
    return '<li><b>' + esc(w.title) + ':</b> ' + esc(w.crop === 'tent' ? d.sow.tent : d.sow.outdoor) + '</li>';
  }
  function methodHtml(d, mb) {
    var bs = curBlocks.blocks;
    return '<h3>' + (curBlocks.known ? 'Your way of growing' : 'Ways of growing') + '</h3>' + bs.map(function (b) {
      return '<div class="gmeth" data-method="' + esc(b.kind + ':' + b.key) + '"><h4>' + esc(b.title) + '</h4><ul>' + b.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
  }
  /* v37 [M7] method-blind copy: the card text is written for a tent and a tank. At render time a pot or bed grower gets the same advice in their words
     (no tank, fan, lights or heat mat where there are none), through window.methodCopy (beginner.js). data() and lines() stay untouched. */
  var POT_RULES = [ /* v37 */
    ['Keep the tank topped up, hold pH in range, do not overfeed.', 'Water evenly and do not overfeed.'],
    ['Warm tank and root rot', 'Warm, wet roots and root rot'],
    ['Roots brown and slimy. Keep the solution cool and bubbling with an air pump and stone.', 'Roots brown and slimy. Let the pot drain and water less.'],
    ['when air or solution drops', 'when air or the root zone drops'],
    ['and keep the tank topped up.', 'and keep the watering steady.'],
    ['and the tank drops fast', 'and it dries out fast']
  ];
  var OUT_RULES = [ /* v37 */
    ['Run the exhaust fan, dim the light and stay in the day range above. Shade cloth outdoors.', 'Use shade cloth on hot afternoons and stay in the day range above.'],
    ['Exhaust fan up, light down. Outdoors, 25 to 40 percent shade cloth cuts sunburn and heat.', '25 to 40 percent shade cloth cuts sunburn and heat.'],
    ['Exhaust fan up and light down once the air passes the heat limit in the targets.', 'Use shade cloth once the air passes the heat limit in the targets.'],
    ['Shade cloth outdoors. In the tent: light down, exhaust fan up, solution kept cool.', 'Shade cloth on hot days, and water in the cool of the morning.'],
    ['Keep a clip fan on the leaves, ease the light, no strong feed.', 'Shade the hot afternoon sun and go easy on the feed.'],
    ['Run the exhaust fan, add a clip fan, space the plants.', 'Space the plants so air moves through.'],
    ['Clip fan on the leaves. Dry leaves help against grey mould.', 'Space the plants and keep the leaves dry.'], /* v37 */
    ['It likes still, humid air, not wet leaves. A clip fan on them, pick off bad leaves, milk spray (1 to 10).', 'Space the plants so air moves through, pick off bad leaves, milk spray (1 to 10).'], /* v37 */
    ['Exhaust fan up, light down, and keep the tank topped up.', 'Use shade cloth on hot days, and keep the watering steady.'],
    ['Lights on, a heat mat under the roots.', 'Cover at night.'],
    ['Heat mat, lights on, no cold draughts.', 'Cover or bring the pots in at night, and keep them out of cold draughts.'],
    ['Keep the tent above the cold limit in the game targets.', 'Keep the plants above the cold limit in the game targets.'],
    ['Keep the tent above the cold limit in the targets.', 'Keep the plants above the cold limit in the targets.'],
    ['Keep the tent and the solution above the cold limits.', 'Keep the plants above the cold limits, and cover or bring them in at night.'],
    ['A cooler tent and shade slow it.', 'Shade slows it.'],
    [' A tent with a mesh intake is safe.', ''],
    ['A shake or a clip fan breeze helps pollen fall', 'A gentle shake helps pollen fall'],
  ];
  var DROP_OUT = /exhaust fan|clip fan|heat mat|air pump|lowering the light/i;
  function mcNow() { try { return window.methodCopy ? window.methodCopy({ method: curMethod || undefined }) : null; } catch (e) { return null; } }
  function gateText(t) { /* v37 */
    t = String(t == null ? '' : t); var mc = mcNow(); if (!mc || (mc.tank && !mc.out)) return t;
    if (!mc.tank) POT_RULES.forEach(function (r) { t = t.split(r[0]).join(r[1]); });
    if (mc.out) OUT_RULES.forEach(function (r) { t = t.split(r[0]).join(r[1]); });
    return mc.gate(t);
  }
  function gateChips(chips) { /* v37 */
    var mc = mcNow(); if (!mc || (mc.tank && !mc.out)) return chips;
    return chips.filter(function (x) {
      if (mc.out && DROP_OUT.test(x.label)) return false;
      if (!mc.tank && /air pump/i.test(x.label)) return false;
      if (how(mc) === 'soil' && /EC meter/i.test(x.label)) return false;
      return true;
    }).map(function (x) {
      if (!mc.tank && how(mc) === 'soil') return { label: x.label.replace('A pH meter and pH down', 'A pH meter'), href: x.href, gear: x.gear };
      return x;
    });
  }
  function how(mc) { return mc.how; }
  var curBlocks = { known: false, blocks: [] }, curMethod = null;
  function render() {
    var d = data(current); if (!d) return;
    var mb = curBlocks = { known: !!curMethod, blocks: methodBlocks(curMethod) };
    var h = '<div class="card gcard"><div class="gtop"><span class="gicon" data-crop="' + esc(d.id) + '"></span><div><h2 id="growersTitle" tabindex="-1">' + esc(d.name) + '</h2>' +
      '<p class="gsub">Grower\'s card for Perth and the Byford hills</p></div>' +
      '<button type="button" class="ghost gx" id="growersX" data-g="close" aria-label="Close">&times;</button></div>' +
      '<div class="gtabs" role="group" aria-label="Choose a crop">' +
      CROPS.map(function (c) { return '<button type="button" data-g="crop" data-crop="' + c + '" aria-pressed="' + (c === current) + '"' + (c === current ? ' class="on"' : '') + '>' + esc(SHORT[c]) + '</button>'; }).join('') + '</div>' +
      '<h3>When to start</h3><ul>' +
      sowHtml(d) + '<li><b>Perth weather:</b> ' + esc(d.sow.climate) + '</li></ul>' + methodHtml(d, mb) +
      '<h3>How long to harvest</h3><ul>' +
      '<li><b>First pick (game):</b> ' + esc(gateText(d.harvest.first)) + '</li><li><b>First pick (real):</b> ' + esc(realLine(d, curMethod)) + '</li>' +
      '<li><b>Keeps giving (real):</b> ' + esc(d.harvest.keeps) + '</li></ul>';
    if (d.targets) {
      h += '<h3>The game\'s targets</h3><ul class="gt">' + d.targets.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul><p class="gnote">' + esc(d.targets.note) + '</p>';
    }
    h += '<h3>Common Perth problems</h3><ul>' +
      d.problems.map(function (p) { return '<li class="prob"><b>' + esc(gateText(p.title)) + '</b>' + esc(gateText(p.fix)) + '</li>'; }).join('') /* v37 */ + '</ul>' +
      '<h3>Water</h3><ul><li class="prob"><b>' + esc(gateText(d.water.title)) + '</b>' + esc(gateText(d.water.fix)) + '</li></ul>' /* v37 */ +
      '<h3>What helps</h3><div class="gchips">' + gateChips(d.chips).map(function (x) { /* v37 */
        return '<a href="' + esc(x.href) + '" target="_blank" rel="noopener" data-g="chip"' + (x.gear ? ' data-gear="' + esc(x.gear) + '"' : '') + '>' + esc(x.label) + '</a>';
      }).join('') + '</div><p class="gnote">' + esc(mcNow() && !(mcNow().tank && !mcNow().out) && mcNow().out ? 'Open air does the work a fan would. Shade cloth does the work of lowering the light.' : d.helpsNote) + '</p>' + /* v37 */
      '<h3>Fun fact</h3><ul><li class="gfun">' + esc(gateText(d.fun)) + '</li></ul>' +
      '<div class="foot"><button type="button" class="ghost" id="growersClose" data-g="close">Close</button></div></div>';
    modal.innerHTML = h;
    try {
      var ic = modal.querySelector('.gicon');
      if (ic && window.Art && Art.fruitIcon) ic.appendChild(Art.fruitIcon(d.id, 34));
    } catch (e) {}
  }

  function up(el, attr) {
    for (var n = el, i = 0; n && i < 4; n = n.parentNode, i++) { if (n.getAttribute && n.getAttribute(attr) !== null && n.getAttribute(attr) !== undefined) return n; }
    return null;
  }
  function build() {
    if (modal) return;
    css();
    modal = document.createElement('div'); modal.classList.add('modal'); modal.id = 'growersCard';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'growersTitle');
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) return close();
      var g = up(e.target, 'data-g');
      if (!g) return;
      var kind = g.getAttribute('data-g');
      if (kind === 'close') return close();
      if (kind === 'crop') { var id = g.getAttribute('data-crop'); if (CONTENT[id]) { current = id; remember(id); render(); top(); try { if (window.A11y && A11y.announce) A11y.announce((CONTENT[id].name || id) + ' card.'); } catch (e) {} } return; } /* v66 (round 15 keyboard m7) */
      if (kind === 'chip') { // a real link (store category, new tab); if the Almanac already knows this gear, show its gear tab instead
        var gear = g.getAttribute('data-gear');
        if (gear && window.Almanac && Almanac.open && Almanac.has && Almanac.has('gear:' + gear)) {
          if (e.preventDefault) e.preventDefault();
          close();
          Almanac.open();
          try { var gt = document.getElementById('almanac'); gt = gt && gt.querySelector('[data-t="gear"]'); if (gt && gt.click) gt.click(); } catch (e3) {}
        }
      }
    });
    document.addEventListener('keydown', function (e) { if (e && e.key === 'Escape' && isOpen()) close(); });
  }

  /* start every view at the top and put focus on the heading (focusing the Close button at the bottom is what scrolled the card down) */
  function top() {
    try {
      var c = modal.querySelector('.gcard'); if (c) c.scrollTop = 0;
      modal.scrollTop = 0;
      var h = modal.querySelector('#growersTitle');
      if (h && h.focus) { try { h.focus({ preventScroll: true }); } catch (e1) { h.focus(); } }
      if (c) c.scrollTop = 0;
    } catch (e) {}
  }
  function isOpen() { return !!(modal && modal.classList.contains('show')); }
  function open(cropId, method) {
    build();
    curMethod = method || methodNow(); /* v36c: the grow's place and way, when a grow is open */
    current = CONTENT[cropId] ? cropId : (current || peekGrowing() || peekLast() || CROPS[0]);
    remember(current);
    try { opener = document.activeElement || null; } catch (e) { opener = null; }
    render();
    try { var last = document.body.lastElementChild; if (last && last !== modal) document.body.appendChild(modal); } catch (e) {} // stay on top of the Almanac / Menu when opened from them
    modal.classList.add('show');
    top();
    return modal;
  }
  function close() {
    if (!modal) return;
    modal.classList.remove('show');
    try { if (opener && opener.isConnected && opener.focus) opener.focus(); } catch (e) {}
    opener = null;
  }

  /* ---------- mount the header / More-sheet button ---------- */
  function mount() {
    try {
      css();
      var hx = document.querySelector('#hextras');
      if (!hx || document.getElementById('growersBtn')) return;
      var b = document.createElement('button');
      b.id = 'growersBtn'; b.type = 'button'; b.className = 'menu'; b.title = "Grower's card: sowing months, targets and fixes for Perth";
      b.textContent = "Grower's card";
      b.onclick = function () {
        try { if (window.Sfx) Sfx.play('click'); } catch (e) {}
        try { if (window.Mob && Mob.closeSheet) Mob.closeSheet(); } catch (e) {}
        open(peekGrowing() || current || peekLast());
      };
      var mb = document.querySelector('#menu');
      hx.insertBefore(b, mb && mb.parentNode === hx ? mb : null);
    } catch (e) {}
  }

  window.Growers = { CROPS: CROPS.slice(), open: open, close: close, isOpen: isOpen, data: data, lines: lines, methodBlocks: methodBlocks, METHOD_BLOCKS: METHOD_BLOCKS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
