/* HyGrow Grow Sim - Campaign mode data + logic. Exposes window.Campaign.
   "Your first season at HyGrow": six chapters guided by Axel the Axolotl (the tank at the shop in Byford, WA).
   Pure data + helpers; ui.js owns the rendering of speech bubbles, pausing and the harvest card. */
(function (w) {
'use strict';
var KEY = 'hygrow_campaign_v1';

/* v37 [B1] no reward code ships until HyGrow approves a real one: chapters 6 and 7 carry no reward and still celebrate at the end. */
var REWARD = null; /* v37 */
/* v37 [B2] one place for shop facts. products.js carries no refill offer, so the game only says to ask. */
var SHOP_FACTS = { refill: 'Ask in store about refills' }; /* v37 */

/* Mirror of ui.js GEAR (ids -> engine values) so forcedSetup can use GEAR ids. */
var CROPN = { cucumber: 'Cucumber', tomato: 'Cherry tomato', lettuce: 'Lettuce', basil: 'Basil', chilli: 'Chilli', strawberry: 'Strawberry', capsicum: 'Capsicum' };
var LIGHTS = { led200: { watts: 200, umolPerJ: 2.4 }, led300: { watts: 300, umolPerJ: 2.5 }, cmh315: { watts: 315, umolPerJ: 1.7 } };
var MEDIA = { coco: 'coco', hydro: 'hydro' };
var AIR = { none: false, aqua2500: true };
var NOMETERS = { ec: false, ph: false, thermo: false, par: false };
var ALLBUTPAR = { ec: true, ph: true, thermo: true, par: false };
var PHPEN = { ec: false, ph: true, thermo: false, par: false }; /* v66 (play-test #18 M2): chapter 3 is about the EC meter; without a pH pen a tank drifts 0.16 pH a day and the tomato died of iron lockout by day 8 to 10 whatever the player did */

var hv = function (S) { return Math.round((S.harvestedKg || 0) * 100) / 100; }; /* v68: the kg goals compare the weight the game shows (2 decimals); a 0.0996 kg pick read 0.10 kg ripe and still failed the 0.1 kg goal */
var st = function (S) { return (S && S.__campaign) || {}; };
function ratio(s) { return s.ecLit > 0 ? s.ecOk / s.ecLit : 0; }

/* v48 [M34] ---- grow method. The campaign stays one story (eight chapters, the same cast); the GROW inside each chapter follows the where x how the player chose on the setup screen.
   Lines and texts carry optional variants keyed by a method TAG; a method's tag list (most specific first) decides which variant it reads. No tag matches = the original tent/hydro text,
   byte for byte. null as a variant drops the line for that method. The story of the tag lists is in docs/CAMPAIGN.md. ---- */
var MTAGS = { /* v48 */
  'tent/hydro': [],
  'tent/tower': ['tent/tower', 'tankish', 'tent', 'alt'],
  'tent/coco': ['tent/coco', 'coco', 'dry', 'tent', 'alt'],
  'tent/soil': ['tent/soil', 'soil', 'dry', 'tent', 'alt'],
  'veranda/tower': ['veranda/tower', 'tankish', 'out', 'alt'],
  'veranda/coco': ['veranda/coco', 'coco', 'vpots', 'dry', 'out', 'alt'],
  'veranda/soil': ['veranda/soil', 'soil', 'vpots', 'dry', 'out', 'alt'],
  'outdoors/tower': ['outdoors/tower', 'tankish', 'out', 'alt'],
  'outdoors/coco': ['outdoors/coco', 'coco', 'bed', 'dry', 'out', 'alt'],
  'outdoors/soil': ['outdoors/soil', 'soil', 'bed', 'dry', 'out', 'alt']
};
var MLABEL = { 'tent/hydro': 'Indoor tent, hydro tub', 'tent/tower': 'Indoor tent, hydro tower', 'tent/coco': 'Indoor tent, coco', 'tent/soil': 'Indoor tent, soil', 'veranda/tower': 'Veranda, hydro tower', 'veranda/coco': 'Veranda pots, coco', 'veranda/soil': 'Veranda pots, soil', 'outdoors/tower': 'Garden, hydro tower', 'outdoors/coco': 'Garden bed, coco', 'outdoors/soil': 'Garden bed, soil' }; /* v48 */
var SAVE_KEY = 'hygrow_growsim_save_v1'; /* v48 the grow save ui.js keeps: its pick names the last where x how the player chose */
/* where / how in, canonical { where, how, key } out. A hydro tub outside a tent does not exist (the engine hands it a tower), so the same rule here. */
function normM(where, how) {
  where = { tent: 1, veranda: 1, outdoors: 1 }[where] ? where : 'tent';
  how = { soil: 1, coco: 1, hydro: 1, tower: 1 }[how] ? how : 'hydro';
  if (how === 'hydro' && where !== 'tent') how = 'tower';
  return { where: where, how: how, key: where + '/' + how };
}
function tagsOf(key) { return MTAGS[key] || []; }
/* the method the player's last setup named, or null: ui.js calls Campaign.setMethod; a saved grow's pick is the fallback */
function savedMethod() {
  try {
    var p = readProg(); if (p.method) return normM(p.method.where, p.method.how);
    var j = JSON.parse(w.localStorage.getItem(SAVE_KEY)); var pk = j && j.pick;
    if (pk && pk.where) return normM(pk.where, pk.how);
    var bp = JSON.parse(w.localStorage.getItem('hygrow_beginner_progress_v1')); if (bp && bp.method && bp.method.how) return normM(bp.method.where, bp.method.how); /* a lesson in progress */
    var bl = JSON.parse(w.localStorage.getItem('hygrow_beginner_v1')); if (bl && bl.method && bl.method.how) return normM(bl.method.where, bl.method.how); /* the last lesson finished */
  } catch (e) {}
  return null;
}
function methodNow() { return (cur && cur.method) ? normM(cur.method.where, cur.method.how) : (savedMethod() || normM('tent', 'hydro')); }
function methodOfS(S) { var m = S && S.method; return m && m.where ? normM(m.where, m.how) : methodNow(); }
/* first variant whose tag the method carries (undefined = none: use the original) */
function vpick(v, tags) { if (!v) return undefined; for (var i = 0; i < tags.length; i++) if (Object.prototype.hasOwnProperty.call(v, tags[i])) return v[tags[i]]; return undefined; }
function tagged(base, v, key, crop) { var x = vpick(v, tagsOf(key || methodNow().key)); return x === undefined ? base : vval(x, key || methodNow().key, crop); }

/* ---- Story scenes (visual-novel layer). Rows: [who, text, pose?, if?]  who: a=Axel d=Deb r=Rob k=Kez(the regular)
   ['@', bg, castLetters] = a cut (change background / cast). Line `if`: 'flag' | '!flag' | 'mates>=N' (callbacks). ---- */
var WHO = { a: 'axel', d: 'deb', r: 'rob', k: 'regular' };
function castOf(s) { return s.split('').map(function (c) { return WHO[c]; }); }
function rows(rs) {
  return rs.map(function (r) {
    if (r[0] === '@') return { bg: r[1], cast: castOf(r[2]) };
    var o = { who: WHO[r[0]], text: r[1] }; if (r[2]) o.pose = r[2]; if (r[3]) o['if'] = r[3]; if (r[4]) Object.defineProperty(o, 'v', { value: r[4], enumerable: false }); /* v48 5th item = method variants */ return o;
  });
}
/* v48 resolve one scene for a tag list: a variant is a string (same speaker), ['d', 'text', pose?] (another speaker) or null (the line is dropped). Hidden `v` never reaches the player or a hash. */
function resolveRows(lines, key, crop) {
  var out = [], tags = tagsOf(key);
  lines.forEach(function (l) {
    var x = l.v ? vpick(l.v, tags) : undefined;
    if (x === undefined) { out.push(l); return; }
    if (x === null) return;
    x = vval(x, key, crop);
    var o = { who: l.who, text: l.text };
    if (typeof x === 'string') o.text = x; else { o.who = WHO[x[0]]; o.text = x[1]; if (x[2]) { o.pose = x[2]; } else if (l.pose) o.pose = l.pose; }
    if (typeof x === 'string' && l.pose) o.pose = l.pose;
    if (l['if']) o['if'] = l['if'];
    out.push(o);
  });
  return out;
}
function resolveScene(sc, key, crop) {
  if (!sc) return sc;
  var o = { bg: sc.bg, cast: sc.cast, lines: resolveRows(sc.lines, key, crop) };
  if (sc.choice) o.choice = { prompt: sc.choice.prompt, options: sc.choice.options.map(function (op) { var x = { text: op.text, effect: op.effect }; if (op.reply) x.reply = resolveRows(op.reply, key, crop); return x; }) };
  return o;
}
function resolveScenes(sc, key, crop) { if (!sc) return sc; var o = {}; Object.keys(sc).forEach(function (k) { o[k] = resolveScene(sc[k], key, crop); }); return o; }
function SC(bg, cast, rs, choice) {
  var s = { bg: bg, cast: castOf(cast), lines: rows(rs) };
  if (choice) s.choice = { prompt: choice[0], options: choice.slice(1).map(function (o) { var x = { text: o[0], effect: o[1] || {} }; if (o[2]) x.reply = rows(o[2]); return x; }) };
  return s;
}

var SCENES = {
0: {
 open: SC('shopfront', 'd', [
  ['d', 'Morning! You found us. Byford, the shop with the green door.', 'happy'],
  ['d', 'I am Deb. I run the counter, so if you need it, I know where it is.'],
  ['d', 'First time in a hydro shop? Everyone gets that look.', 'laugh'],
  ['d', 'Nothing here bites. Well. One thing might, but he is behind glass.'],
  ['d', 'You will see grow tents, bags of coco, and a lot of cables.'],
  ['d', 'It looks like a lot. It is mostly watering and watching.'],
  ['d', 'The rest is knowing what to look for. That is where we come in.'],
  ['d', 'Come in. Mind the step, it has caught better people than you.'],
  ['@', 'counter', 'ad'],
  ['d', 'This is the counter. Receipts, bottles, and the best view of the tank.'],
  ['a', "G'day! That is me in the tank. I am Axel.", 'wave'],
  ['d', 'He has opinions about everything. Especially water.'],
  ['a', 'Water is the whole game, Deb. Plants are just water with ambition.', 'talk'],
  ['d', 'See what I put up with?', 'laugh'],
  ['a', 'I know every drop in this shop. I live in the stuff.', 'point'],
  ['a', 'I have watched a lot of people walk in here knowing nothing.'],
  ['a', 'Most of them walk out with a harvest. You can be next.', 'thumbs'],
  ['d', 'Do not scare them off in the first minute, Axel.'],
  ['a', 'I am being encouraging. This is my encouraging face.', 'idle'],
  ['d', 'It looks like his normal face.', 'laugh'],
  ['a', 'It is a very good face. Anyway. Here is the deal.'],
  ['a', 'You get one season. Seven chapters, six crops, one big finish.'],
  ['a', 'We start easy and get trickier as we go.', 'point'],
  ['d', 'You will learn the meters, the feed, the heat, and the bugs.'],
  ['a', 'And you will learn to read a plant before it starts yelling.'],
  ['d', 'We do not just sell it. We want you to actually grow it.'],
  ['a', 'Deb says that to everybody. She means it though.', 'talk'],
  ['d', 'I do. Bring your empty bottle back. ' + SHOP_FACTS.refill + '.'] /* v37 */,
  ['a', 'Refill evangelist. Do not get her started.', 'worried'],
  ['d', 'Less plastic, less rubbish, more money in your pocket. Easy.', 'happy'],
  ['a', 'Told you.'],
  ['d', 'And yes, we are open on Saturdays. Come in and say hello.', 'happy'],
  ['a', 'She will say it again when you leave. It is a reflex.'],
  ['d', 'It is hospitality.', 'laugh'],
  ['@', 'aisle', 'ard'],
  ['r', 'Is that the new grower? Mind the cables. They are labelled.', 'surprised'],
  ['a', 'This is Rob. He lives out the back with the meters.'],
  ['r', 'Someone has to look after them. They are sensitive.', 'neutral'],
  ['r', 'Numbers do not lie. People guess. Plants do not care either way.'],
  ['a', 'He means that kindly.', 'talk'],
  ['r', 'I mean it accurately. Kindly is a bonus.', 'laugh'],
  ['r', 'Reading the water beats guessing. Come find me when you want to measure.'],
  ['a', 'He will lend you gear, if you ask nicely and bring it back.'],
  ['r', 'Clean. Bring it back clean.', 'worried'],
  ['a', 'He has a clipboard. Always the clipboard.', 'point'],
  ['r', 'The clipboard keeps the shop honest.', 'neutral'],
  ['d', 'And keeps Rob away from the till.', 'laugh'],
  ['r', 'I would never touch the till.', 'surprised'],
  ['a', 'Right. One more person to meet. She is a regular, and she is competitive.'],
  ['@', 'aisle', 'arkd'],
  ['k', 'So you are the new one. Kez. I am in here every week.', 'neutral'],
  ['k', 'My basil is better than anything on this shelf.', 'happy'],
  ['d', 'She means that as a hello.'],
  ['k', 'I mean it as a fact. Try to keep up this season.', 'laugh'],
  ['a', 'Kez thinks she is the best grower in Byford.', 'point'],
  ['k', 'I am the best grower in Byford.'],
  ['r', 'Her feed strength is a bit wobbly, though.', 'worried'] /* v37 */,
  ['k', 'Rob!', 'surprised'],
  ['a', 'We love her. Mostly. She is good value for the tank gossip.'],
  ['k', 'See you at market, rookie.', 'laugh'],
  ['d', 'She comes in for coco on Thursdays and stays an hour.'],
  ['a', 'She asks about everything and buys one thing.'],
  ['d', 'She is a good customer. She is just loud about it.', 'laugh'],
  ['@', 'counter', 'ad'],
  ['d', 'Right. Time to pick your first plant. Nothing fancy, just what you like.'],
  ['a', 'Lettuce is quick and forgiving. Perfect for learning.', 'thumbs'],
  ['d', 'Basil is my favourite. It grows back, like my patience.'],
  ['a', 'Everything you pick now is just a warm-up. You will grow them all.'],
  ['d', 'Take your time. Tank is not going anywhere.']
 ], ['Which plant do you pick first?',
   ['Lettuce, nice and easy.', { flag: 'fav_lettuce', mates: 2 }, [['a', 'Good call. Quick, green and forgiving.', 'thumbs']]],
   ['Basil, the cut-and-come-again one.', { flag: 'fav_basil', mates: 2 }, [['d', 'A person of taste. I like you already.', 'happy']]],
   ['Surprise me.', { flag: 'fav_surprise', mates: 1 }, [['a', 'Brave. We will see what the tank has for you.', 'point']]]]),
 close: SC('counter', 'ad', [
  ['d', 'Good choice. Here is your apron, and a pen for the log book.'],
  ['a', 'The log book is where you write down what went wrong.'],
  ['d', 'And what went right. Do not forget that part.'],
  ['a', 'Rule one. Look at the water first. Everything else follows.', 'point'],
  ['d', 'Rule one and a half. Wash your hands before you touch the plants.'],
  ['a', 'Dirty hands bring bugs. Bugs bring chapter five.', 'worried'],
  ['d', 'Rule two. If in doubt, ask. We would rather answer than watch a crop die.'],
  ['a', 'Rule three. Do not take Kez\'s bait.', 'worried'],
  ['d', 'She will try. Every Thursday.'],
  ['a', 'Right then. First chapter is lettuce. Off you go, grower.', 'wave']
  ,['d', 'I will be at the counter. Wave if you need a hand.', 'happy']
  ,['a', 'And I will be in the tank. Waving is my specialty.', 'wave']
  ,['a', 'One more thing. Do not name your plants.', 'point']
  ,['d', 'He says that. He named his snail.', 'laugh']
  ,['a', 'Gary is a colleague.', 'worried']
  ,['d', 'Go on, off you go.']
 ])
},

1: {
 open: SC('shopfront', 'a', [
  ['a', 'Chapter one. The tank. Where it all starts.', 'wave', null, { dry: 'Chapter one. The roots. Where it all starts.' }], /* v48 */
  ['a', 'I get to watch you from in here. No pressure.'],
  ['a', 'Lettuce is quick. You can pick a head from about Day 20.'], /* v57: the day is Sim.cropTiming('lettuce').pick (tests/v57.test.js pins it); v58 moved it to the day a head reaches pick weight, voiced in voice/_build/cb_v58 */
  ['a', 'The rule this time is no meters. Just your eyes.'],
  ['a', 'Plants talk. They just do it slowly, with leaves.', 'talk'],
  ['a', 'Pale means hungry. Droopy means thirsty. Crisp brown edges mean the feed is too strong.'],
  ['a', 'Water level matters more than people think.'],
  ['a', 'A reservoir that runs low turns the feed into a guess.', 'point', null, { dry: 'Roots that dry out turn the feed into a guess.' }], /* v48 */
  ['a', 'Top it up before it gets silly.', null, null, { dry: 'Water it before it gets silly.' }], /* v48 */
  ['a', 'Check the leaves every morning. Colour, shape, lift.'],
  ['a', 'Healthy lettuce stands up straight and looks glossy.', 'point'],
  ['a', 'Tired lettuce leans and looks dull.', 'worried'],
  ['a', 'One day you will see it before I tell you. That day is close.'],
  ['a', 'You have the light, the coco and the pump set up for you.', null, null, { tent: 'You have the tent, the light and the fan set up for you.', out: 'You have the sun and the shade cloth set up for you.' }], /* v48 */
  ['a', 'That is on purpose. We learn one thing at a time.', 'talk'],
  ['a', 'Your goal is one healthy head of lettuce. Keep it fed, watered and happy.'],
  ['a', 'The sim speeds up, but you can pause any time.'],
  ['@', 'counter', 'ad'],
  ['d', 'Before you start. Rob says he has a spare pH pen on the shelf.'],
  ['a', 'It is not cheating if the shop lends it. It is just generous.'],
  ['d', 'Or you can go it alone with your eyes. Both are fine.'],
  ['a', 'Eyes only is the proud route. The pen is the easy one.', 'idle'],
  ['d', 'Axel, stop making it a test.'],
  ['a', 'Everything is a test. That is how people learn.', 'talk'],
  ['d', 'Make up your own mind. Nobody is marking you.']
  ,['a', 'Right. Gloves off. Well. I have no gloves.', 'idle']
  ,['a', 'You have the whole shop behind you, so go on.', 'wave']
 ], ['Take the pen, or go eyes only?',
   ['Borrow Rob\'s pH pen.', { lend: 'ph', mates: 1 }, [['d', 'Good. He will want it back with the cap on.', 'laugh']]],
   ['Eyes only. I want to learn properly.', { mates: 3 }, [['a', 'Proud. I like it. Plants will be generous.', 'thumbs']]]]),
 close: SC('counter', 'adr', [
  ['a', 'Look at that. A real head of lettuce.', 'thumbs'],
  ['d', 'Crisp, bright, and no bugs. Proper work.', 'happy'],
  ['r', 'Weight is decent too. I put it on the scales while you were not looking.'],
  ['a', 'He weighs everything. It is a problem.'],
  ['r', 'It is a hobby. A useful one.', 'laugh'],
  ['d', 'First harvest is always the best feeling. Enjoy it.'],
  ['d', 'I still remember mine. It was a rocket salad and it was awful.', 'laugh'],
  ['a', 'It was a good rocket salad. You just salted it.'],
  ['d', 'Axel, you were not even here then.', 'surprised'],
  ['a', 'I was in spirit.', 'idle'],
  ['r', 'Your lettuce kept its colour the whole grow. That is rare.'],
  ['r', 'Most first crops look a bit off by week three.'],
  ['a', 'So you did the boring bits right. Water. Level. Eyes.', 'talk'],
  ['a', 'You did not panic when the water dropped. That matters.'],
  ['a', 'Most beginners panic. Then they overfeed. Then they panic again.'],
  ['d', 'And then they come in here. We love them. It is our business model.'],
  ['a', 'Deb, be nice.'],
  ['d', 'I am being nice. I am being honest and nice at once.'],
  ['a', 'Next up, I want to show you how to cut waste with refills.', 'point'],
  ['d', 'Oh good. My favourite subject.', 'happy'],
  ['a', 'We know, Deb. Everybody knows.'],
  ['@', 'aisle', 'akdr'],
  ['k', 'I heard you grew lettuce. Is it any good?', 'neutral'],
  ['a', 'Come and see. It is very good.', 'point'],
  ['k', 'Hm. Mine was bigger. Not by much.', 'surprised'],
  ['k', 'Do not let it go to your head.'],
  ['a', 'She says that to everyone she likes.', 'laugh'],
  ['k', 'I do not like you. Yet.', 'laugh'],
  ['a', 'Yet. That is a good sign.', 'wave']
  ,['d', 'Right. Who wants a cuppa and a lettuce wrap?', 'happy']
  ,['a', 'Pour mine in the tank. On second thought, do not.', 'idle']
  ,['r', 'I have logged your first harvest. You are on the board.', 'neutral']
  ,['d', 'The board is in his handwriting. Nobody else can read it.', 'laugh']
  ,['r', 'It is perfectly legible.']
 ]),
 closeFail: SC('counter', 'ad', [
  ['a', 'Ouch. That lettuce had a rough run.', 'worried'],
  ['d', 'It happens. Everyone loses a lettuce.'],
  ['a', 'Check the water level a bit more often and keep the tank full.', null, null, { dry: ['d', 'Check the Soil tile a bit more often and water before it dries out.'] }], /* v48 */
  ['d', 'It is only lettuce. Have another go.', 'happy'],
  ['a', 'I believe in you. Mostly.', 'idle']
 ])
},

2: {
 open: SC('counter', 'adr', [
  ['d', 'Right, chapter two. This one is about bottles.', 'happy'],
  ['a', 'Here we go.', 'worried'],
  ['d', 'You buy nutrients in a 1 litre or 5 litre bottle, yes?'],
  ['d', 'When it is empty, do not bin it. Bring it back and we refill it.'],
  ['d', 'From our bulk stock. ' + SHOP_FACTS.refill + '.'] /* v37 */,
  ['a', 'Less plastic, less rubbish, and it is the same stuff inside.', 'talk'],
  ['d', 'Canna is the exception. They do not do refills. Sorry.'],
  ['a', 'She will give you the whole speech if you ask. Do not ask.'],
  ['d', 'It is a good speech.', 'laugh'],
  ['a', 'It is a good speech. It is also long.'],
  ['d', 'This chapter is basil. It is cut-and-come-again.'],
  ['a', 'You cut it. It grows back. You cut it again.'],
  ['d', 'Your goal: two cuts of basil, and top the tank up at least once.', null, null, { dry: 'Your goal: two cuts of basil, and feed from your own bottle at least once.' }], /* v48 */
  ['a', 'Plants drink more than you think. Basil especially.', 'point'],
  ['d', 'Basil in a hot week will take a litre a day, easily.'],
  ['a', 'So keep an eye on the level. I will keep an eye on you.', 'talk'],
  ['d', 'So does Rob. Different tank, though.'],
  ['a', 'He means the coffee pot.', 'laugh'],
  ['r', 'Four cups a day. Measured. Do not judge.'],
  ['d', 'Basil wants a bit of everything. Warm, bright, a steady feed.'],
  ['a', 'Pinch the top out, and it bushes up.', 'point'],
  ['d', 'If you let it flower, the leaves go bitter.'],
  ['a', 'So we cut early, cut often, and keep it leafy.', 'talk'],
  ['d', 'Smell it when you cut. That is the good part.', 'happy'],
  ['@', 'aisle', 'adr'],
  ['r', 'Basil likes warm roots. Not hot, not cold.', 'neutral'],
  ['r', 'If you have a pH pen, check it once a week.'],
  ['a', 'He means look at the water. In numbers.', 'talk'],
  ['r', 'Yes. In numbers.', 'happy']
  ,['a', 'Do not over-think it. Basil forgives you.', 'thumbs']
  ,['d', 'It does, mostly. I killed one once. It was me.', 'laugh']
  ,['a', 'We do not talk about that basil.', 'worried']
 ], ['Deb asks if you will bring your own bottle next time.',
   ['Yes, I will bring one back.', { flag: 'bottle_promised', mates: 3 }, [['d', 'Excellent. I will put a tick on the board.', 'happy']]],
   ['I will see how I go.', { mates: 0 }, [['d', 'Fair. The offer stands.', 'neutral']]]]),
 close: SC('counter', 'adk', [
  ['a', 'Two cuts and a refill. That is a proper job.', 'thumbs'],
  ['d', 'And you actually used the refill station. I am proud.', 'happy'],
  ['a', 'She means it. Her eyes are shiny.'],
  ['d', 'It is the lights.'],
  ['a', 'Of course it is.', 'laugh'],
  ['d', 'Right. Who needs a refill? Bring me a bottle.'],
  ['a', 'Nobody is in the shop, Deb.'],
  ['d', 'I like to be ready.', 'happy'],
  ['@', 'counter', 'akd'],
  ['k', 'I saw your basil in the window. It looks nice.', 'neutral'],
  ['k', 'Not as nice as mine. But nice.'],
  ['a', 'Careful, Kez. That nearly sounded kind.', 'laugh'],
  ['k', 'I had a bad week. My basil bolted.', 'worried'],
  ['k', 'Went to flower the day it got warm. I cut it too late.'],
  ['a', 'It happens. Heat and long days tell basil it is time.'],
  ['a', 'Cut early and often. Keep the tops pinched.', 'point'],
  ['k', 'I know that. I do know that. I forgot.', 'surprised'],
  ['a', 'Everyone forgets. That is why the log book exists.'],
  ['k', 'I do write things down. I just lose the book.', 'laugh'],
  ['a', 'It is under the counter. It has your name on it.'],
  ['k', 'Is it?', 'surprised'],
  ['d', 'Third drawer. Under the receipts.'],
  ['k', 'I do not even want to look.', 'worried'],
  ['a', 'Kez, you are not the first. You will not be the last.'],
  ['k', 'I will look at the basil. I will leave the book.', 'laugh'],
  ['@', 'counter', 'adk'],
  ['d', 'Kez, our new grower has the pinching trick down. Want a hand?']
 ], ['Offer to help Kez with her basil?',
   ['Sure, I will show her how I cut mine.', { flag: 'helped_kez', mates: 5 }, [['k', 'Hm. Fine. Show me. Once.', 'neutral'], ['a', 'That is a yes in Kez language.', 'laugh']]],
   ['She can work it out herself.', { mates: 0 }, [['k', 'Good. I did not ask.', 'laugh'], ['a', 'Pride. Always pride.', 'worried']]]]),
 closeFail: SC('counter', 'ad', [
  ['a', 'The basil struggled. Not your fault entirely.', 'worried'],
  ['d', 'Keep the tank topped up and try again.', null, null, { dry: 'Keep the water and the feed up, then try again.' }], /* v48 */
  ['a', 'And do the refill. It is a quick win, and Deb will be thrilled.', 'point']
 ])
},

3: {
 open: SC('counter', 'adr', [
  ['a', 'Chapter three. The tomatoes are hungry.', 'talk'],
  ['r', 'Hungry plants want strong feed. Weak feed makes them pale.'],
  ['d', 'And pale tomatoes are sad tomatoes.', 'worried'],
  ['a', 'You have no meter, so you are guessing the strength.'],
  ['r', 'Guessing is how it starts. Everyone does it.'],
  ['r', 'Then they get one meter and it changes everything.', 'happy'],
  ['a', 'He is going to sell you a meter.'],
  ['r', 'I am going to explain what a meter does. Different thing.'],
  ['d', 'Same thing, but politer.', 'laugh'],
  ['r', 'EC is the strength of the feed. Higher number, stronger feed.', null, null, { dry: 'The feed hides in the root zone, so you cannot read its strength with a pen.' }], /* v48 */
  ['r', 'Tomatoes want it in the green band, and not outside it.', null, null, { dry: function (c) { return 'What you can read is the ' + c.tile + ' tile. Tomatoes want it in the green band, not too dry and not soaked.'; } }], /* v48 */
  ['a', 'Too weak, pale leaves. Too strong, burnt tips.', 'point'],
  ['a', 'Find the middle and your tomatoes thank you.'],
  ['r', 'Think of it as a dial. Too low is hungry, too high is shouting.'],
  ['d', 'Plants cannot say sorry. They just burn.', 'worried'],
  ['r', 'Tomatoes especially. They are dramatic.'],
  ['a', 'Like Rob.', 'laugh'],
  ['r', 'I am not dramatic. I am precise.', 'surprised'],
  ['d', 'He is both.'],
  ['a', 'Good. We agree.'],
  ['r', 'I will drop a meter on your tank around day ten.', null, null, { dry: 'I will drop a probe in with the roots around day ten.' }], /* v48 */
  ['r', 'Like you bought one at the shop.'],
  ['d', 'Not that I am pushing. It is just a good idea.', 'happy'],
  ['a', 'You are pushing.', 'laugh'],
  ['d', 'Gently.'],
  ['r', 'EC stands for electrical conductivity. Salt in the water carries current.', null, null, { dry: null }], /* v48 */
  ['a', 'More salts, more current, stronger feed. Simple.', 'talk', null, { dry: null }], /* v48 */
  ['r', 'Simple is correct. Plants do the rest.', null, null, { dry: null }], /* v48 */
  ['a', 'Until then, use your eyes. They are pretty good.'],
  ['d', 'The fruit set at flowering is what counts.', 'neutral'],
  ['r', 'The goal is flowering, with EC in range for eighty percent of the hours the light is on.', null, null, { dry: function (c) { return 'The goal is flowering, with the ' + c.tile + ' tile in the green for ' + c.pctWord(3) + ' percent of the hours it is light.'; }, out: 'The goal is flowering, with EC in range for eighty percent of the hours it is light.' }] /* v48 */
  ,['a', 'Lit hours are when the plant is actually drinking.', 'talk']
  ,['r', 'Night time EC matters less. Do not worry about it.', null, null, { dry: 'Night time matters less. Do not worry about it.' }] /* v48 */
  ,['d', 'Take a photo of the flowers. We love a flower photo.', 'happy']
  ,['a', 'It is a long chapter. Pace yourself.', 'idle']
  ,['r', 'And write down your numbers. I check.', 'neutral']
 ], ['Rob offers to lend a thermometer for the whole chapter.',
   ['Yes please, I will take the thermometer.', { lend: 'thermo', mates: 1 }, [['r', 'Good. Reading the temperature costs nothing.', 'happy']]],
   ['No thanks, I will focus on the feed.', { mates: 2 }, [['r', 'Fine. One thing at a time. Sensible.', 'neutral']]]]),
 close: SC('counter', 'adrk', [
  ['a', 'Flowers, and a steady feed. That is what a meter buys you.', 'thumbs', null, { dry: 'Flowers, and a steady feed. That is what watching the tile buys you.' }], /* v48 */
  ['r', 'Your numbers look good. Very good.', 'happy'],
  ['r', 'Eighty percent in range is not easy.'],
  ['d', 'He does not say that to everyone.'],
  ['r', 'I do not. Do not tell them I said it.', 'worried'],
  ['a', 'Reading the number beats guessing, every time.', 'point'],
  ['r', 'A reading gives you a record. A record gives you a pattern.'],
  ['r', 'Patterns tell you what to do next.'],
  ['a', 'That is the longest sentence he has said all week.', 'surprised'],
  ['r', 'I have been saving up.', 'laugh'],
  ['d', 'And a meter pays for itself in the first crop.'],
  ['a', 'Deb, no sales pitch. Not yet.'],
  ['d', 'Fine. Next time.', 'laugh'],
  ['r', 'Calibration is the secret. A meter you cannot trust is worse than none.'],
  ['a', 'Wow. That is a good line. Did you rehearse that?', 'surprised'],
  ['r', 'Every morning, in the mirror.', 'happy'],
  ['d', 'He did. I heard him.', 'laugh'],
  ['@', 'aisle', 'arkd'],
  ['k', 'I overheard you got a meter.', 'surprised'],
  ['k', 'I have had mine for a year. My EC drifts anyway.'],
  ['r', 'Calibration. It needs doing every month.'],
  ['k', 'I know. I forget.', 'worried'],
  ['r', 'Come here. I will show you how. It takes five minutes.'],
  ['a', 'He is being nice to the rival.', 'point'],
  ['r', 'I am being nice to a customer.', 'neutral']
  ,['d', 'He did not say that last week. Interesting.', 'laugh']
  ,['k', 'I can hear you.', 'surprised']
  ,['d', 'That was the plan.', 'happy']
 ], ['Rob offers to teach you calibration too.',
   ['Yes, show me both of us.', { flag: 'rob_taught', mates: 4 }, [['r', 'Good. Two minutes each. Clean cup, fresh solution.', 'happy'], ['k', 'Okay. That was actually useful.', 'surprised']]],
   ['I will leave you two to it.', { mates: 1 }, [['a', 'Fair. They will manage.', 'idle']]]]),
 closeFail: SC('counter', 'adr', [
  ['r', 'EC was out of range too often. I can see it in the log.', 'worried', null, { dry: function (c) { return 'The ' + c.tile + ' tile was out of range too often. I can see it in the log.'; } }], /* v48 */
  ['a', 'The feed was off. Happens to everyone.'],
  ['r', 'Mix to the chart, check the number, and try again.', null, null, { dry: 'Water when it dips, feed on time, check the number, and try again.' }], /* v48 */
  ['d', 'Have a cup of tea first.', 'happy']
 ])
},

4: {
 open: SC('counter', 'adr', [
  ['a', 'Chapter four. The heatwave.', 'worried'],
  ['d', 'Thirty-eight degrees. Perth summer does not mess around.'],
  ['a', 'Chillies love heat. A heatwave is a lot, even for them.'],
  ['r', 'Air temperature climbs. Water temperature follows.'],
  ['r', 'Warm water holds less oxygen. Roots do not like that.', null, null, { dry: 'Hot, dry roots suffer. Water early, so they stay cool.' }], /* v48 */
  ['a', 'Your thermometer is switched on this time.', 'point'],
  ['d', 'Check it first thing, and again after lunch.'],
  ['a', 'Heat sneaks up on you. The number does not lie.', 'talk'],
  ['r', 'Above thirty, start thinking. Above thirty-three, start acting.'],
  ['d', 'What does acting look like?'],
  ['r', 'Fan up. Lights off a bit earlier. Water topped up cool.', null, null, { 'tent/soil': 'Fan up. Lights off a bit earlier. Water cool.', 'tent/coco': 'Fan up. Lights off a bit earlier. Water cool.', out: 'Shade cloth on. Water early, before the heat. Water cool.' }], /* v48 */
  ['a', 'Easy. Boring. Effective.', 'thumbs'],
  ['a', 'Watch the number. It tells you what is coming.'],
  ['d', 'Fan, lights, water. Three jobs. Easy to remember.', null, null, { out: 'Shade, water, cover. Three jobs. Easy to remember.' }], /* v48 */
  ['d', 'Lights make heat, remember.', null, null, { out: 'The sun makes heat, remember.' }], /* v48 */
  ['a', 'Plants forgive a rough week if you looked after them.', 'talk'],
  ['r', 'Keep the tank topped up. It evaporates quicker in the heat.', null, null, { dry: 'Keep the watering up. Everything dries out quicker in the heat.' }], /* v48 */
  ['a', 'Your goal: get the chillies to day twenty-one with health at forty or better.', 'idle'],
  ['d', 'I will bring you a cold drink if you survive.', 'laugh'],
  ['r', 'Check the water temperature as well as the air.', null, null, { dry: 'Check the Soil tile as well as the air.' }], /* v48 */
  ['r', 'Roots in hot water get sick fast.', null, null, { dry: 'Hot, dry roots get sick fast.' }], /* v48 */
  ['a', 'I live in water. Trust me, nobody enjoys it warm.', 'talk'],
  ['d', 'Top up with cool water, not warm. It helps.', null, null, { dry: 'Water with cool water, not warm. It helps.' }], /* v48 */
  ['a', 'And do not panic. Panic burns more than the sun does.', 'idle'],
  ['d', 'Leaves curling up is a warning. Leaves going crispy is a problem.'],
  ['r', 'I will be in the back if you need me.'],
  ['a', 'He is always in the back.', 'laugh'],
  ['a', 'Deb will be out here, telling you to drink water.', 'talk'],
  ['d', 'I will. It is good advice.']
 ], ['Rob has a spare PAR meter, which measures the light.',
   ['Take it, it tells me about the light.', { lend: 'par', mates: 1 }, [['r', 'Good. Light is energy. Energy is heat.', 'happy']]],
   ['No, I have enough to watch.', { mates: 2 }, [['a', 'Keep it simple. I like it.', 'thumbs']]]]),
 close: SC('counter', 'adrk', [
  ['a', 'You got them through. Tough plants, tougher grower.', 'thumbs'],
  ['d', 'We had forty-one degrees at the shop on Tuesday.', 'surprised'],
  ['r', 'My office was thirty-six. I measured. I did not enjoy it.'],
  ['a', 'You looked after the plants and the plants looked after you.'],
  ['d', 'I had to stop the delivery van running at two. Too hot.', 'worried'],
  ['a', 'Even the van needed a rest.', 'laugh'],
  ['r', 'Chillies are tough. You helped them be tougher.'],
  ['d', 'And you pulled it off without a single panic.', 'happy'],
  ['d', 'Take a break. Drink some water.'],
  ['a', 'I mean it. You have earned a glass of the good stuff.', 'thumbs'],
  ['d', 'Not the tank water, Axel.', 'laugh'],
  ['a', 'It is excellent tank water.'],
  ['r', 'I logged your temperatures. The curve is very clean.'],
  ['r', 'You pulled the light hours back at exactly the right time.', null, null, { out: 'You got the shade cloth on at exactly the right time.' }], /* v48 */
  ['d', 'So that is what all the fuss about light hours was for.', 'surprised', null, { out: 'So that is what all the fuss about shade cloth was for.' }], /* v48 */
  ['a', 'It was always about the water. And the air.', 'point'],
  ['@', 'aisle', 'akd'],
  ['k', 'Mine cooked. Every one of my chillies.', 'worried'],
  ['k', 'I went away for the weekend. The fan died.', null, null, { out: 'I went away for the weekend. The shade cloth blew off.' }], /* v48 */
  ['a', 'Oh, Kez. That is a rough one.', 'worried'],
  ['k', 'I am fine. It is fine. I just wanted to say.'],
  ['k', 'Yours looks better than mine. I will say it once.', 'surprised'],
  ['a', 'That is the nicest thing she has ever said.'],
  ['k', 'Do not make it weird.', 'laugh']
  ,['a', 'I will not. Much.', 'idle']
  ,['d', 'Right. Cold drinks in the back fridge. I promised.', 'happy']
 ], ['Kez lost her chillies.',
   ['Offer her a seedling from your batch.', { flag: 'kez_seedling', mates: 5 }, [['k', 'I will pay you back. With basil.', 'happy'], ['a', 'That is a handshake in plant terms.', 'thumbs']]],
   ['Tell her you are sorry and leave it.', { mates: 2 }, [['k', 'Thanks. I will bounce back.', 'neutral']]]]),
 closeFail: SC('counter', 'adr', [
  ['a', 'The heat won this round.', 'worried'],
  ['r', 'Fan on high, and cut the light hours early.', null, null, { out: 'Shade cloth on early, and water before the heat.' }], /* v48 */
  ['d', 'It is brutal out there. Everyone loses a few.'],
  ['a', 'Reset, try again, and watch the thermometer.']
  ,['d', 'Shade cloth from any hardware shop helps if the sun is the problem.'] /* v37 */
  ,['r', 'Check the numbers every few hours when it is hot.']
 ])
},

5: {
 open: SC('counter', 'adr', [
  ['a', 'Chapter five. The pest.', 'worried'],
  ['d', 'Every grower gets them. Mites, thrips, you name it.'],
  ['a', 'Every grower. Every shop. Every Perth summer.', 'talk'],
  ['d', 'I had thrips on a pot plant at home. I took it personally.', 'worried'],
  ['r', 'Spider mites like it dry and warm.'],
  ['a', 'Strawberries are lovely. So are the bugs that like them.'],
  ['d', 'Fine webbing and speckled leaves are the clue.'],
  ['r', 'Look under the leaves. Not just on top.'],
  ['d', 'Tap a leaf over white paper. Little moving dots mean mites.'],
  ['r', 'If it smears red, that is a mite.'],
  ['a', 'Tiny, hungry, and terrible at manners.', 'worried'],
  ['a', 'Spot them early, spray, and the crop is fine.', 'point'],
  ['a', 'Rule of thumb. If you see one mite, there are fifty.', 'worried'],
  ['a', 'Spot them late, and you will be spraying all week.', 'worried'],
  ['d', 'Plant Guard is a silica strengthener. It toughens leaves.'], /* v37 */
  ['d', 'For mites, use a pest spray: neem or eco-oil. Ask in store.'], /* v37 */
  ['r', 'Prevention beats cure. Clean tools, clean hands.'],
  ['d', 'Do not bring a bug in on your shirt.', 'laugh'],
  ['a', 'Or on your hat. Bugs love a hat.', 'laugh'],
  ['r', 'Clean the tent between crops. I mean properly.', null, null, { out: 'Clean the gear between crops. I mean properly.' }], /* v48 */
  ['d', 'Wipe the benches. Rinse the tank. It takes ten minutes.', null, null, { dry: 'Wipe the benches. Rinse the tools. It takes ten minutes.', out: 'Wipe the benches. Rinse the gear. It takes ten minutes.' }], /* v48 */
  ['a', 'Your goal is to clear the mites and then pick strawberries. Check the leaves every few days.'],
  ['a', 'I cannot do it for you. No hands.', 'idle']
  ,['d', 'Check the new growth first. That is where they start.']
  ,['r', 'Isolate the plant if you can. Mites walk.', 'neutral']
  ,['a', 'Only use what the label says. Always the label.', 'point']
  ,['d', 'Treat in the evening, not in full sun.']
  ,['r', 'And do not spray when the plants are stressed.']
  ,['a', 'Right. Eyes, then spray, then eyes again.', 'talk']
  ,['d', 'That is it. That is the whole lesson.', 'happy']
 ], ['Rob offers a spare PAR meter to track the light.',
   ['Sure, one more thing to watch.', { lend: 'par', mates: 1 }, [['r', 'Healthy plants resist pests better. Good lighting helps.', 'neutral']]],
   ['No, I want to watch the leaves.', { mates: 2 }, [['a', 'Eyes on the leaves. That is the lesson.', 'thumbs']]]]),
 close: SC('counter', 'adkr', [
  ['a', 'Pest sorted and berries picked. Good result.', 'thumbs'],
  ['d', 'Strawberries! Can I have one?', 'happy'],
  ['a', 'You can have two. You earned them.', 'laugh'],
  ['r', 'Fine. One for the log book.', 'neutral'],
  ['d', 'The log book does not eat strawberries, Rob.', 'laugh'],
  ['r', 'It has not been properly tested.'],
  ['a', 'Berries are sweet because the plant was not stressed.', 'talk'],
  ['a', 'You can taste a good run. It is true.', 'thumbs'],
  ['d', 'That is the best advertising we have.', 'happy'],
  ['a', 'I have no tastebuds. I trust you all.', 'idle'],
  ['d', 'You have a snail, Axel.', 'laugh'],
  ['a', 'Gary does not review fruit.', 'worried'],
  ['@', 'counter', 'akdr'],
  ['k', 'I got mites, too. In my basil.', 'worried'],
  ['k', 'I did not see them until half of it was gone.'],
  ['a', 'They hide underneath. Everyone misses them the first time.'],
  ['k', 'I know. Now I know.'],
  ['k', 'Thanks for showing me how you cut your basil.', 'surprised', 'helped_kez'],
  ['d', 'Kez, how are your berries going?', 'neutral'],
  ['k', 'Slowly. I picked one. It was sour.', 'worried'],
  ['a', 'You picked it early. Wait until it is red all the way.', 'point'],
  ['k', 'I get impatient.', 'surprised'],
  ['d', 'Everyone does. It is worth the wait.', 'happy'],
  ['a', 'Pinching, spraying, checking leaves. It adds up.', 'talk', 'helped_kez'],
  ['k', 'I should have asked sooner.', 'neutral', '!helped_kez'],
  ['a', 'Better late than never.', 'idle', '!helped_kez'],
  ['k', 'Market is coming up. I will see you there.', 'laugh'],
  ['a', 'We will be ready.', 'wave']
  ,['d', 'Right. I need a table, a banner, and a lot of bags.']
  ,['r', 'I will bring the scales.', 'neutral']
  ,['a', 'Everyone has a job. Mine is to look charming.', 'idle']
  ,['d', 'You are in a tank, Axel.', 'laugh']
  ,['a', 'A charming tank.', 'wave']
 ], ['Kez asks which pest you hated most.',
   ['Spider mites, no contest.', { flag: 'ipm_lesson', mates: 2 }, [['k', 'Same. They are tiny and they are everywhere.', 'laugh']]],
   ['Anything that eats strawberries.', { mates: 2 }, [['k', 'Fair. Those are my berries too.', 'laugh']]]]),
 closeFail: SC('counter', 'adr', [
  ['a', 'The pests took over. They always win if you wait.', 'worried'],
  ['r', 'Spray as soon as you see webbing.'],
  ['d', 'Try again. Check under the leaves.']
 ])
},

6: {
 open: SC('market', 'adkr', [
  ['a', 'Last chapter before the big one. The market.', 'wave'],
  ['d', 'Byford Saturday market. Our stall is by the fountain.'],
  ['a', 'Cucumbers are fast and heavy. They drink a lot.', 'talk'],
  ['d', 'Your goal is five kilos of cucumbers, picked and weighed.', null, null, { alt: function (c) { return 'Your goal is ' + c.kg(6, 'cucumber') + ' of cucumbers, picked and weighed.'; } }], /* v48 */
  ['a', 'Use everything you have learned.', 'point'],
  ['a', 'EC, heat, tank level. It all matters now.', null, null, { dry: 'Feed, heat, water. It all matters now.' }], /* v48 */
  ['k', 'I have a stall next to yours. Same row.', 'neutral'],
  ['k', 'Try not to embarrass yourself.', 'laugh'],
  ['a', 'Kez, we are all on the same side.'],
  ['k', 'Are we?', 'surprised'],
  ['a', 'You tell me.', 'idle'],
  ['k', 'Hm. I will think about it.'],
  ['d', 'The vines will need a trellis. Keep them tidy.'],
  ['a', 'Check the tank often. A vine in summer empties it fast.', 'point', null, { dry: 'Check the water often. A vine in summer drinks the roots dry.' }], /* v48 */
  ['r', 'Fast growth means fast feed use. Watch the EC.', null, null, { soil: 'Fast growth means fast water use. Watch the Soil tile.' }], /* v48 */
  ['d', 'Pick them young. Big cucumbers go bitter.'],
  ['a', 'Pick often, and the plant makes more.', 'thumbs'],
  ['k', 'Everyone knows that.', 'neutral'],
  ['a', 'Not everyone, Kez.', 'laugh'],
  ['d', 'Customers love fresh local produce. Remember that.'],
  ['d', 'And they love a story. Tell them about the tank.'],
  ['a', 'Aww. She remembered me.', 'wave']
  ,['r', 'I will weigh each crate. Then we can compare numbers.']
  ,['d', 'People like numbers on a sign. Prices, weights, dates.']
  ,['a', 'And a bit of a story. A good story sells.', 'talk']
  ,['k', 'Mine is a good story. Rival basil queen.', 'laugh']
  ,['a', 'Your story this season is the chillies.', 'worried']
  ,['k', 'That is a bad story. Next story.', 'surprised']
 ], ['Kez suggests sharing a stall table.',
   ['Sure, we will share a table.', { flag: 'shared_stall', mates: 5 }, [['k', 'Fine. But I get the left side.', 'neutral'], ['d', 'I will bring the banner.', 'happy']]],
   ['I will keep my own table.', { mates: 1 }, [['k', 'Suit yourself. See you at the fountain.', 'laugh']]]]),
 close: SC('market', 'adrk', [
  ['a', 'Five kilos. Market day, here we come.', 'thumbs', null, { alt: 'A full basket. Market day, here we come.' }], /* v48 */
  ['d', 'Look at that basket. It could be on a magazine cover.', 'happy'],
  ['r', 'That is a proper haul. I weighed it. Twice.'],
  ['k', 'Not bad. Not bad at all.', 'neutral'],
  ['k', 'Okay. I will say it.', 'surprised'],
  ['d', 'I am going to cry. Where are the tissues?', 'happy'],
  ['a', 'Deb, you cry at every harvest.', 'laugh'],
  ['d', 'Rude.', 'laugh'],
  ['k', 'You are a good grower. I was wrong.', 'happy'],
  ['a', 'Did she just say sorry?', 'surprised'],
  ['k', 'I said I was wrong. Different thing.', 'laugh'],
  ['d', 'Close enough. Group photo.'],
  ['a', 'Everyone squeeze in. Rob, step forward.', 'wave'],
  ['r', 'I am in the frame.'],
  ['d', 'You are half in the frame.'],
  ['r', 'Half is the correct amount.', 'laugh'],
  ['k', 'Mates, then?', 'happy', 'shared_stall'],
  ['a', 'Mates. Officially.', 'thumbs', 'shared_stall'],
  ['k', 'Right. Rivals who are mates.', 'laugh', '!shared_stall'],
  ['a', 'That is a start.', 'idle', '!shared_stall'],
  ['a', 'Fresh, local, and grown by you. That is the sign.', 'talk'],
  ['a', 'One more chapter. Then the season is done.', 'wave'],
  ['d', 'It is not over yet. Open day is next month.', 'surprised'],
  ['r', 'I am doing a talk about meters.', 'neutral'],
  ['a', 'Nobody asked for a talk about meters, Rob.'],
  ['r', 'People will come. I have snacks.', 'happy'],
  ['a', 'Oh well. That changes things.', 'idle']
  ,['d', 'We have a table, a banner and a sign. It says HyGrow.']
  ,['k', 'It says HyGrow in a font I do not trust.', 'laugh']
  ,['d', 'It is a lovely font.']
  ,['a', 'See you all at open day.', 'wave']
 ]),
 closeFail: SC('market', 'ad', [
  ['a', 'The vines gave up before market.', 'worried'],
  ['d', 'Keep the feed in range and the tank topped up.', null, null, { dry: 'Keep the feed on time and the water up.' }], /* v48 */
  ['a', 'We will be here when you are ready.', 'idle']
  ,['d', 'Chin up. Market is every Saturday.']
 ])
},

7: {
 open: SC('openday', 'adrk', [
  ['d', 'Welcome to the HyGrow open day!', 'happy'],
  ['a', 'Every plant in the shop is looking its best.', 'wave'],
  ['r', 'I have laid out the meters in alphabetical order.', 'neutral'],
  ['a', 'Of course you have.', 'laugh'],
  ['d', 'Everyone you have helped this season is coming.'],
  ['a', 'That is a lot of people, for a shop.', 'talk'],
  ['k', 'I told everyone. I might have oversold you.', 'laugh'],
  ['k', 'I said you were good. Do not make me a liar.'],
  ['a', 'The crop for the day is cucumber. Or your best one, if you would rather.', 'point'],
  ['k', 'Nobody forces you. But cucumbers are proven.'],
  ['r', 'Cucumbers are fast. Fast is useful when a crowd is coming.'],
  ['d', 'Anything you grow, we will put on the table.', 'happy'],
  ['d', 'Three kilos picked will feed the crowd.', 'happy', null, { alt: function (c) { return c.small(7) ? 'A good pick will feed the crowd.' : c.upper(c.kg(7)) + ' picked will feed the crowd.'; } }], /* v48 */
  ['r', 'Three kilos is a modest target. Very doable.', null, null, { alt: function (c) { return c.small(7) ? 'That is a modest target. Very doable.' : c.upper(c.kg(7)) + ' is a modest target. Very doable.'; } }], /* v48 */
  ['a', 'This is the lot. Feed, heat, water, bugs. You know all of it now.'],
  ['k', 'Rob is giving a talk. I am sitting at the back.', 'laugh'],
  ['r', 'It is timed. Twelve minutes.', 'happy'],
  ['a', 'He timed it.', 'worried'],
  ['d', 'Bring your bottle for the refill table.', 'happy', 'bottle_promised'],
  ['d', 'We set up a refill table in the corner.'],
  ['a', 'Let us see who else turned up.', 'point'],
  ['d', 'First guests are at the door.'],
  ['a', 'People in a hydro shop, voluntarily.', 'surprised'],
  ['d', 'They are here for the snacks.', 'laugh'] /* v37 */,
  ['r', 'And the meters.', 'neutral'],
  ['k', 'Mostly the snacks.', 'laugh'],
  ['@', 'openday', 'adrk'],
  ['k', 'My basil is on the table. Trimmed and everything.', 'happy', 'helped_kez'],
  ['k', 'I pinched it every day. You were right.', 'neutral', 'helped_kez'],
  ['k', 'I replanted, with the seedling you gave me.', 'happy', 'kez_seedling'],
  ['r', 'I calibrated three meters this morning.', 'neutral', 'rob_taught'],
  ['r', 'Kez kept up. She is quick for a beginner.', 'laugh', 'rob_taught'],
  ['d', 'We have a stall with the bottle returns.', 'happy', 'bottle_back'],
  ['a', 'The whole shop smells like basil.', 'thumbs'],
  ['a', 'Your name is on the chalkboard, by the way.', 'point', 'mates>=80'],
  ['d', 'Right. Everyone is watching. No pressure.'],
  ['r', 'I have a speech. It is short.', 'neutral'],
  ['d', 'It is eleven slides.', 'laugh'],
  ['r', 'It is short for eleven slides.'],
  ['a', 'Everyone is hungry, Rob. Cut it to ten.', 'idle'],
  ['k', 'I will hold the clipboard.', 'happy'],
  ['r', 'Nobody holds the clipboard.', 'surprised'],
  ['a', 'You have got this.', 'thumbs']
  ,['d', 'The doors open at ten. The vines have until then.']
  ,['a', 'I will keep an eye on the water. Obviously.', 'point']
  ,['k', 'I will keep an eye on you.', 'laugh']
  ,['r', 'I will keep an eye on the numbers.', 'neutral']
  ,['d', 'Right. That is everyone sorted. Go.', 'happy']
 ], ['Which crop will you grow for the open day?',
   ['Cucumber, the heavy one.', { mates: 1 }, [['a', 'Classic. It drinks a lot, so watch the tank.', 'talk', null, { dry: ['d', 'Classic. It drinks a lot, so keep the water up.'] }]]],
   ['Whatever is my best crop.', { mates: 2, flag: 'best_crop' }, [['a', 'Play to your strengths. I like it.', 'thumbs']]]]),
 close: SC('openday', 'adrk', [
  ['d', 'Look at that haul! The crowd is going to eat well.', 'happy'],
  ['a', 'Look at the queue. They are lining up.', 'thumbs'],
  ['r', 'I counted forty-three people. A new record.'],
  ['k', 'Forty-four. I brought my nan.', 'laugh'],
  ['a', 'Your nan is welcome. She can have a cucumber.'],
  ['k', 'She loves them. She has opinions on pickling.', 'happy'],
  ['d', 'Everyone who walked in knew nothing about hydro.'],
  ['d', 'Everyone who walks out knows something. That is the point.'],
  ['a', 'You did that. You grew the crop, and you told the story.', 'point'],
  ['k', 'I told them you taught me.', 'neutral', 'helped_kez'],
  ['k', 'Okay, you did not teach me. You showed me. Different.', 'laugh', 'helped_kez'],
  ['r', 'My talk went well. People asked about calibration.', 'happy'],
  ['a', 'Someone actually asked about calibration?', 'surprised'],
  ['d', 'I think we found a new front desk.', 'laugh'],
  ['k', 'I volunteered for the front desk. I was great.', 'happy'],
  ['a', 'You told one person their basil was wrong.', 'worried'],
  ['k', 'It was wrong.', 'neutral'],
  ['d', 'But kindly. Mostly.', 'laugh'],
  ['r', 'Three people. One took notes.', 'happy'],
  ['d', 'Refill table was packed. People brought bottles.', 'happy', 'bottle_promised'],
  ['d', 'You brought your bottle back, too. I noticed.', 'happy', 'bottle_back'],
  ['a', 'Every drop in this shop has a story.', 'talk'],
  ['d', 'We should do this every year.', 'happy'],
  ['k', 'Every year, and I am doing the bake sale.', 'happy'],
  ['r', 'Bakes do not belong near the meters.', 'surprised'],
  ['k', 'Watch me.', 'laugh'],
  ['a', 'You are part of that story now.', 'wave'],
  ['d', 'Come in any time. The door is green. You know the one.'],
  ['r', 'Come measure something.', 'happy'],
  ['k', 'See you at the next market. Bring a bigger basket.', 'laugh'],
  ['a', 'Thanks for growing with me this season.', 'wave'],
  ['a', 'Now go have a cucumber. You earned it.', 'thumbs']
  ,['d', 'Same time next year? We will make it bigger.', 'happy']
  ,['r', 'I will bring more snacks.', 'neutral']
  ,['a', 'Rob, no.', 'laugh']
 ]),
 closeFail: SC('openday', 'adrk', [
  ['d', 'Not enough this time. The crowd will cope.', 'worried'],
  ['a', 'Every grower has a bad crop. It is not the end.'],
  ['k', 'I had four. You are fine.', 'laugh'],
  ['r', 'Reset and try again. The numbers will help.'],
  ['a', 'Open day is every year. Next time.', 'idle']
 ])
}
};

/* v48 [M34] per-method goal numbers. Key = where/how; '*' = every method. Tent/hydro keeps the original numbers. tests/campaign-methods.test.js plays a method-aware reference grower
   (the pattern of tests/balance-challenge.js) and every goal below sits well under what it reaches inside the chapter's day budget (days). */
var GP = {
  1: { kg: { '*': 0.1 }, floor: { '*': 50 } },
  2: { cuts: { '*': 2 }, feeds: { '*': 1 } },
  3: { ratio: { '*': 0.8, 'outdoors/soil': 0.6 } },
  4: { day: { '*': 21 }, health: { '*': 40 } },
  5: { kg: { '*': 0 } },
  6: { kg: { '*': 5, 'tent/soil': 4, 'veranda/soil': 3, 'veranda/coco': 4, 'veranda/tower': 4, 'outdoors/tower': 4 } },
  7: { kg: { cucumber: { '*': 3, 'veranda/soil': 2, 'veranda/coco': 2.5 }, tomato: { '*': 2 },
    lettuce: { '*': 1.5, 'tent/tower': 0.5, 'veranda/soil': 0.2, 'veranda/coco': 0.2, 'veranda/tower': 0.5, 'outdoors/soil': 0.35, 'outdoors/coco': 0.35, 'outdoors/tower': 0.5 },
    basil: { '*': 1.5, 'veranda/soil': 0.3, 'veranda/coco': 0.3, 'outdoors/soil': 0.6, 'outdoors/coco': 0.6 } } }
};
function gnum(id, name, key, crop) {
  var t = GP[id] && GP[id][name]; if (!t) return 0;
  if (crop) t = t[crop] || {};
  return t[key] !== undefined ? t[key] : t['*'];
}
var WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
function kgText(k) { /* 5 -> "five kilos", 2.5 -> "two and a half kilos", 0.2 -> "200 grams" */
  if (k < 1 && k !== 0.5) return Math.round(k * 1000) + ' grams';
  var whole = Math.floor(k), half = k - whole >= 0.5;
  if (k === 1) return 'one kilo';
  if (half && whole === 0) return 'half a kilo';
  return (WORD[whole] || String(whole)) + (half ? ' and a half' : '') + ' kilos';
}
function upper(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
/* the variant function context: kg(chapter, crop) = the kilo goal as words for this method */
var PCT = { 50: 'fifty', 60: 'sixty', 70: 'seventy', 75: 'seventy-five', 80: 'eighty' };
function vctx(key, crop) {
  return { key: key, kg: function (ch, cr) { return kgText(gnum(ch, 'kg', key, ch === 7 ? (cr || crop || 'cucumber') : null)); }, upper: upper,
    small: function (ch) { return gnum(ch, 'kg', key, ch === 7 ? (crop || 'cucumber') : null) < 1; },
    tile: /\/coco$/.test(key) ? 'Coco' : 'Soil', /* the pot tile is called Soil or Coco */
    pct: function (ch) { return Math.round(100 * gnum(ch, 'ratio', key)); }, pctWord: function (ch) { var n = Math.round(100 * gnum(ch, 'ratio', key)); return PCT[n] || String(n); } };
}
function vval(x, key, crop) { return typeof x === 'function' ? x(vctx(key, crop)) : x; }

var CHAPTERS = [
{ id: 0, title: "First visit", blurb: "Walk into HyGrow in Byford, meet the crew and pick your first plant.", crop: null, scene: "shopfront", storyOnly: true, days: 0,
  forcedSetup: null, intro: [], beats: [],
  goal: { text: "Meet the crew and pick your first plant.", check: function () { return true; } },
  fail: { text: "", check: function () { return false; } },
  outro: ["Welcome to HyGrow. Your first season starts now."] },

{ id: 1, title: 'The tank', blurb: 'Meet Axel and grow your first lettuce. No meters, just your eyes.', crop: 'lettuce', scene: 'shopfront', days: 50, /* v48 */
  v: { title: { dry: 'The roots' }, failText: { dry: 'Your lettuce got too crook. Have another go, and water earlier.' } }, /* v48 */
  forcedSetup: { light: 'led300', medium: 'coco', air: 'aqua2500', meters: NOMETERS, season: 'spring', mods: { phDrift: 0.4 } }, /* v67 (story review M2): eyes only (no pH pen) was a trap on tank and coco grows: the pH drifted 0.16 a day and a player acting on the warnings lost the lettuce. The first season drifts slower */
  intro: ["G'day, I'm Axel. I live in the tank at HyGrow in Byford.",
    'Welcome to your first season. We start simple, with a lettuce.',
    (function () { var t = typeof window !== 'undefined' && window.Sim && Sim.cropTiming && Sim.cropTiming('lettuce'); return t ? 'Lettuce is quick: you can pick a head from about Day ' + t.pick + ', and it is full size by Day ' + t.full + '.' : 'Lettuce is quick, so we will not wait long.'; })(), /* v57: from the stage timer */
    'No meters this time, just your eyes. Your goal is a healthy head of lettuce, with health never below 50.'],
  beats: [
    { when: 'day', day: 3, lines: ['Plants drink the tank down every day. Keep an eye on the level.'], v: { dry: function (c) { return ['Plants drink the water down every day. Keep an eye on the ' + c.tile + ' tile.']; } } }, /* v48 */
    { when: 'day', day: 14, lines: ['Two weeks in. Pale or droopy leaves mean something is off, so have a look.'] },
    { when: 'stage', stage: 'heading', lines: ['The head is filling out now. Not long to go.'] },
    { when: 'harvest', lines: ['Nice work. First crop done.'] }],
  goal: { text: 'Pick at least 0.1 kg of lettuce and never let health drop below 50.',
    check: function (S) { return hv(S) >= gnum(1, 'kg', methodOfS(S).key) && st(S).minHealth >= gnum(1, 'floor', methodOfS(S).key); } }, /* v48 */
  fail: { text: 'Your lettuce got too crook. Have another go, and top up the tank earlier.',
    cause: function (S) { var k = gnum(1, 'kg', methodOfS(S).key); return hv(S) > 0 && hv(S) < k && st(S).minHealth >= gnum(1, 'floor', methodOfS(S).key) ? 'You picked before the head reached ' + k + ' kg. Wait a few more days before you pick, and I will tell you when it is big enough.' : S && !(((S.pr || {}).iron || 0) >= 2 && S.ph > (typeof Sim !== 'undefined' && Sim.stageInfo ? ((Sim.stageInfo(S).targets || {}).ph || [0, 99])[1] : 99)) && (Math.max((S.pr || {}).bolt || 0, st(S).boltMax || 0) >= 2 || Math.max((S.pr || {}).tip || 0, st(S).tipMax || 0) >= 2) ? (Math.max((S.pr || {}).bolt || 0, st(S).boltMax || 0) >= 2 ? 'The lettuce bolted and burned its leaf tips because it stayed in too long.' : 'The lettuce burned its leaf tips because it stayed in too long.') + ' Pick it as soon as I say it is big enough.' : null; }, /* v71 (sweep of round 18): an iron lockout with the pH still high is the cause to name (the general card says pH), and a tipburn-only head is not called bolted */ /* v69 (story round 17 minor 1): a bolted, tip-burnt head was told to water earlier */ /* v66 (play-test #18 m2): a healthy early pick was told the lettuce got too crook */
    check: function (S) { return st(S).minHealth < gnum(1, 'floor', methodOfS(S).key); } }, /* v48 */
  outro: ['Beautiful head of lettuce. That is your first harvest in the books.', 'Next up, I want to show you how to cut waste with refills.'] },

{ id: 2, title: 'The refill', blurb: 'Basil that grows back, and a nicer way to buy nutrients.', crop: 'basil', scene: 'counter', days: 55, /* v48 */
  v: { /* v48 pots and beds have no tank to top up: the refill is a feed from the bottle */
    intro: { dry: ['Basil is a cut-and-come-again plant. Cut it and it grows right back.', 'Plan on two cuts this season.', 'Your goal: two cuts of basil, and feed from your own bottle at least once.'] },
    goalText: { dry: 'Take two cuts of basil and feed from your own bottle at least once.' },
    failText: { dry: 'The basil struggled. Try again, and keep the water and the feed up.' },
    outro: { dry: ['Two cuts and a bottle well used, lovely.', 'Remember, bring your empty bottle to HyGrow in Byford. ' + SHOP_FACTS.refill + '.'] } },
  forcedSetup: { light: 'led300', medium: 'coco', air: 'aqua2500', meters: { ec: false, ph: true, thermo: false, par: false }, season: 'autumn' },
  intro: ['Basil is a cut-and-come-again plant. Cut it and it grows right back.',
    'Plan on two cuts this season.',
    'Your goal: two cuts of basil, and top the tank up at least once.'],
  beats: [
    { when: 'day', day: 5, lines: ['Real tip from the shop: bring your empty 1L or 5L bottle to HyGrow.',
      'Less plastic, same stuff inside. ' + SHOP_FACTS.refill + '.'] /* v37 */, shop: { cat: 'nutrients', text: 'Nutrients at HyGrow' } },
    { when: 'refill', not: 'dry', lines: ['That is a refill done. Your tank thanks you, and so does the bin.'] }, /* v48 */
    { when: 'harvest', lines: ['Cut done. It will bush back up in about a week.'] },
    { when: 'feed', only: 'dry', lines: ['That is a feed from your bottle. Your plants thank you, and so does the bin.'] }], /* v48 appended: the tank chapter keeps b0..b2 */
  goal: { text: 'Take two cuts of basil and use at least one refill.',
    check: function (S) { var k = methodOfS(S).key; return (st(S).cuts || 0) >= gnum(2, 'cuts', k) && (tagsOf(k).indexOf('dry') >= 0 ? (st(S).feeds || 0) >= gnum(2, 'feeds', k) : ((S.refills || 0) >= 1 || (S.__refills || 0) >= 1)); } }, /* v48 */
  fail: { text: 'The basil struggled. Try again, and keep the tank topped up.', cause: function (S) { if (!S || S.health < 25) return null; var k = methodOfS(S).key, s = st(S), dry = tagsOf(k).indexOf('dry') >= 0; if ((s.cuts || 0) < gnum(2, 'cuts', k)) return 'The basil grew well, but it needs ' + gnum(2, 'cuts', k) + ' cuts. Cut it when I say it is ready, and again once it grows back.'; return dry ? 'The basil grew well, but the goal also needs a feed from your own bottle. Tap Feed at least once.' : 'The basil grew well, but the goal also needs a refill. Top the tank up at least once.'; }, check: function (S) { return S.health < 25; } }, /* v71 (story round 18 nit 1): a healthy basil that missed the cut or feed goal was told it struggled */
  outro: ['Two cuts and a refill, lovely.', 'Remember, bring your empty bottle to HyGrow in Byford. ' + SHOP_FACTS.refill + '.' /* v37 */] },

{ id: 3, title: 'The meter', blurb: 'Pale tomatoes, and the day you buy an EC meter.', crop: 'tomato', scene: 'counter', endOnGoal: true, days: 60, /* v48 */
  v: { /* v48 pots (soil, coco) have no steady EC to read: the tile to hold in the green is the Soil (or Coco) tile. The tank grows keep the EC story. */
    title: { dry: 'The probe' },
    blurb: { dry: 'Hungry tomatoes, and learning to read the tile.' },
    intro: { dry: function (c) { return ['Tomatoes are hungry. Strong feed makes them happy, weak feed makes them pale.', 'You have no probe yet, so you are guessing how wet the roots are.', 'Your goal: reach flowering with the ' + c.tile + ' tile in the green for at least ' + c.pct(3) + '% of the hours it is light, once you have a probe.']; },
      out: ['Tomatoes are hungry. Strong feed makes them happy, weak feed makes them pale.', 'You have your pH pen, but no EC meter, so you are guessing the feed strength.', 'Your goal: reach flowering with EC in range for at least 80% of the hours it is light, once you have a meter.'] },
    goalText: { dry: function (c) { return 'Reach flowering with the ' + c.tile + ' tile in the green for ' + c.pct(3) + '% of the hours it is light (counted from when you get the probe).'; },
      out: 'Reach flowering with EC in range for 80% of the hours it is light (counted from when you get the meter).' },
    failText: { dry: function (c) { return 'The ' + c.tile + ' tile was out of range too often. Water when it dips and try again.'; } },
    outro: { dry: ['Flowers and a steady feed. That is what watching the tile buys you.', 'Reading the number beats guessing every time.'] } },
  forcedSetup: { light: 'led300', medium: 'coco', air: 'aqua2500', meters: PHPEN, season: 'spring' },
  intro: ['Tomatoes are hungry. Strong feed makes them happy, weak feed makes them pale.',
    'You have your pH pen, but no EC meter, so you are guessing the feed strength.',
    'Your goal: reach flowering with EC in range for at least 80% of the hours the light is on, once you have a meter.'],
  beats: [
    { when: 'day', day: 8, lines: ['See how pale the new leaves look? That is often feed that is too weak.'], pause: true },
    { when: 'event', id: 'lowec', lines: ['The feed is too weak for these plants. A meter would tell you exactly how weak.'], pause: true, shop: { cat: 'testing', text: 'See meters' } },
    { when: 'day', day: 10, lines: ['I have put an EC meter on your tank, like you bought one at the shop.', 'EC is the strength of the feed. Keep the number inside the green band.'], pause: true, shop: { cat: 'testing', text: 'See meters' }, act: 'giveEC',
      v: { dry: ['I have put a probe in with the roots, like you bought one at the shop.', 'It reads how wet the roots are. Keep the tile inside the green band.'] } }, /* v48 */
    { when: 'stage', stage: 'flower', lines: ['Flowers at last. Your feed strength decides how well they set.'] }],
  goal: { text: 'Reach flowering with EC in range for 80% of the hours the light is on (counted from when you get the meter).',
    check: function (S) { var s = st(S); return !!s.flowered && ratio(s) >= gnum(3, 'ratio', methodOfS(S).key); } }, /* v48 */
  fail: { text: 'EC was out of range too often. Mix to the chart and try again.', cause: function (S) { return S && ((S.pr && S.pr.iron) || st(S).iron) && S.health < 40 ? 'The pH crept up and locked out iron, so the new leaves went yellow. Keep the pH tile green as well and try again.' : null; }, check: function (S) { var s = st(S); return (!!s.flowered && ratio(s) < gnum(3, 'ratio', methodOfS(S).key)) || S.health < 15; } }, /* v48 */
  outro: ['Flowers and a steady feed. That is what a meter buys you.', 'Reading the number beats guessing every time.'] },

{ id: 4, title: 'The heatwave', blurb: 'A 38 degree week. Keep the chillies cool.', crop: 'chilli', scene: 'counter', endOnGoal: true, lightsFree: true, days: 21, /* v48 */
  v: { intro: { out: ['Chillies love heat, but a Perth summer can be too much, even for them.', 'A heatwave is coming. Your goal is to reach day 21 with health of 40 or more.', 'Shade cloth and water are your tools. Your thermometer is switched on.'] },
    failText: { out: 'The heat won this round. Try the shade cloth earlier next time.' } }, /* the beats tell the player to cut light hours, so the generic "set lights to Xh" coaching stays quiet */
  forcedSetup: { light: 'led300', medium: 'coco', air: 'aqua2500', meters: ALLBUTPAR, season: 'summer' },
  intro: ['Chillies love heat, but a Perth summer can be too much, even for them.',
    'A heatwave is coming. Your goal is to reach day 21 with health of 40 or more.',
    'Fan speed and light hours are your tools. Your thermometer is switched on.'],
  beats: [
    { when: 'day', day: 7, lines: ['It is heading for 38 degrees outside this week. Check your air temperature.'], pause: true, act: 'heatwave' },
    { when: 'event', id: 'heatwave', lines: ['Heatwave. Turn the fan up, and think about cutting light hours.'], shop: { cat: 'testing', text: 'See meters' }, v: { out: ['Heatwave. Put the shade cloth on, and water early.'] } }, /* v48 */
    { when: 'day', day: 15, lines: ['The worst should be over. Plants forgive a rough week if you looked after them.'] }],
  goal: { text: 'Survive to day 21 with plant health of 40 or more.', check: function (S) { return S.day >= gnum(4, 'day', methodOfS(S).key) && S.health >= gnum(4, 'health', methodOfS(S).key); } }, /* v48 */
  fail: { text: 'The heat won this round. Try the fan on high next time.', theme: function (S) { var P = S.pr || {}; return (P.heat || 0) >= 1 || (P.dryHot || 0) >= 1; }, check: function (S) { return S.health < gnum(4, 'health', methodOfS(S).key); } }, /* v48 */
  outro: ['You got them through. Tough plants and a tougher grower.'] },

{ id: 5, title: 'The pest', blurb: 'Spider mites turn up. Spot them and spray.', crop: 'strawberry', scene: 'counter', endOnGoal: true, days: 100, /* v48 */
  forcedSetup: { light: 'led300', medium: 'coco', air: 'aqua2500', meters: ALLBUTPAR, season: 'spring' },
  intro: ['Strawberries are lovely, and so are the bugs that like them.',
    'Sooner or later you will see mites or thrips.',
    'Your goal: spot them early, clear them with a spray, then pick strawberries.'], /* v37 */
  beats: [
    { when: 'day', day: 10, lines: ['Look closely at the leaves. Fine webbing and speckles mean mites.'], pause: true, act: 'pest' },
    { when: 'event', id: 'pests', lines: ['There they are. Tap Spray to clear them.'], pause: true, shop: { cat: 'pest', text: 'Pest spray: ask in store' } /* v37 */ },
    { when: 'event', id: 'pestfixed', lines: ['Clear. Well spotted.'] },
    { when: 'harvest', lines: ['Sweet. Pick them while they are red.'] }],
  goal: { text: 'Clear the pest problem, then pick strawberries.', check: function (S) { return !!st(S).pestFixed && hv(S) > gnum(5, 'kg', methodOfS(S).key); } }, /* v48 */
  fail: { text: 'The pests took over. Next time spray as soon as you see webbing.', theme: function (S) { return (S.pestLevel || 0) >= 0.5 || ((S.pr || {}).pests || 0) >= 1; }, check: function (S) { return S.health < 25; } },
  outro: ['Pest sorted and berries picked. Good result.'] },

{ id: 6, title: 'The market', blurb: 'A big cucumber crop, then market day.', crop: 'cucumber', scene: 'market', days: 75, /* v48 */
  v: { intro: { dry: function (c) { return ['Last chapter before the open day. Cucumbers are fast and heavy.', 'Your goal: pick ' + c.kg(6) + ' of cucumbers for market day.', 'Use everything you have learned. Watch the feed, the heat and the water.']; },
      alt: function (c) { return ['Last chapter before the open day. Cucumbers are fast and heavy.', 'Your goal: pick ' + c.kg(6) + ' of cucumbers for market day.', 'Use everything you have learned. Watch EC, heat and the tank.']; } },
    goalText: { alt: function (c) { return 'Pick at least ' + gnum(6, 'kg', c.key) + ' kg of cucumber.'; } },
    outro: { alt: function (c) { return [upper(c.kg(6)) + '. Market day, here we come.', 'Customers love fresh local produce, and so do we. One more chapter to go: the open day.']; } } },
  forcedSetup: { light: 'led300', medium: 'coco', air: 'aqua2500', meters: ALLBUTPAR, season: 'summer' },
  intro: ['Last chapter before the open day. Cucumbers are fast and heavy.',
    'Your goal: pick five kilos of cucumbers for market day.',
    'Use everything you have learned. Watch EC, heat and the tank.'],
  beats: [
    { when: 'day', day: 14, lines: ['Vines are climbing fast. Check the tank often, cucumbers drink a lot.'], v: { dry: function (c) { return ['Vines are climbing fast. Check the ' + c.tile + ' tile often, cucumbers drink a lot.']; } } }, /* v48 */
    { when: 'harvest', lines: ['Basket is filling up.'] }],
  goal: { text: 'Pick at least 5 kg of cucumber.', check: function (S) { return hv(S) >= gnum(6, 'kg', methodOfS(S).key); } }, /* v48 */
  fail: { text: 'The vines gave up. Reset and keep the feed in range.', check: function (S) { return S.health < 20; } },
  outro: ['Five kilos. Market day, here we come.', 'Customers love fresh local produce, and so do we. One more chapter to go: the open day.'] }, /* v37 [B1] */

{ id: 7, title: "The open day", blurb: "Finale. Grow your best crop for the HyGrow open day and see who turns up.", crop: "cucumber", scene: "openday", finale: true, days: 85, /* v48 */
  forcedSetup: { light: "led300", medium: "coco", air: "aqua2500", meters: ALLBUTPAR, season: "summer" },
  /* "Whatever is my best crop" (ch7 open scene) picks the crop you chose on your first visit; otherwise cucumber */
  cropFor: function (f) { return f.best_crop ? (f.fav_basil ? 'basil' : f.fav_lettuce ? 'lettuce' : 'tomato') : 'cucumber'; },
  kgFor: { cucumber: 3, tomato: 2, lettuce: 1.5, basil: 1.5 },
  introFor: function (crop, key) { /* v48 key = the method; absent = whatever the player's setup is */
    key = key || methodNow().key;
    var why = { cucumber: 'because it is fast and feeds a crowd', tomato: 'your pick, and nothing sells like a sweet cherry tomato', lettuce: 'your pick, and nobody turns down a crisp head', basil: 'your pick, and the smell alone will pull people in' }[crop];
    return ["Open day at HyGrow. Everyone you helped this season is coming.", CROPN[crop] + ' is the crop, ' + why + '.', 'Your goal: pick at least ' + gnum(7, 'kg', key, crop) + ' kg before the doors open.'];
  },
  intro: ["Open day at HyGrow. Everyone you helped this season is coming.",
    "Cucumber is the crop, because it is fast and feeds a crowd.",
    "Your goal: pick at least three kilos before the doors open."],
  beats: [
    { when: "day", day: 10, lines: ["Word is out. Deb has already told half of Byford."] },
    { when: "day", day: 20, lines: ["Vines are climbing. Keep the tank full and the EC in the green."], v: { dry: ["Vines are climbing. Keep the water up and the feed on time."] } }, /* v48 */
    { when: "harvest", lines: ["The basket is filling up. Nearly there."] }],
  goal: { get text() { var k = (cur && cur.crop) || 'cucumber'; return 'Pick at least ' + this.kg(k) + ' kg of ' + CROPN[k].toLowerCase() + '.'; },
    kg: function (k, key) { return gnum(7, 'kg', key || methodNow().key, k) || 3; }, /* v48 */
    check: function (S) { return hv(S) >= this.kg(S.cropId || (cur && cur.crop) || 'cucumber', methodOfS(S).key); } },
  fail: { text: "The vines struggled. Keep the feed in range and try again.", check: function (S) { return S.health < 20; } },
  outro: ["Target hit. The crowd is going to eat well.", "Thanks for growing with me this season."] } /* v37 [B1] */
];

CHAPTERS.forEach(function (c) { /* v48 [M34] scenes, goal text, fail text read the method the player is on; tent/hydro reads the original text byte for byte */
  c.raw = SCENES[c.id];
  Object.defineProperty(c, 'scenes', { enumerable: true, configurable: true, get: function () { return resolveScenes(c.raw, methodNow().key, (cur && cur.crop) || c.crop); } });
  if (c.finale) return;
  ['goal', 'fail'].forEach(function (k) {
    var o = c[k], base = o.text, vv = c.v && c.v[k + 'Text'];
    Object.defineProperty(o, 'text0', { value: base, enumerable: false });
    Object.defineProperty(o, 'text', { enumerable: true, configurable: true, get: function () { return tagged(base, vv); } });
  });
});
/* v48 one chapter as plain data for a method (what the player reads): the tests hash this, ui.js reads the same fields through start() */
function resolveBeat(b, key, crop) {
  var o = {}, tags = tagsOf(key);
  Object.keys(b).forEach(function (k) { if (k === 'v' || k === 'only' || k === 'not') return; o[k] = b[k]; });
  var x = vpick(b.v, tags); if (x !== undefined) o.lines = vval(x, key, crop);
  return o;
}
function beatOn(b, key) { var t = tagsOf(key); return (!b.only || t.indexOf(b.only) >= 0) && (!b.not || t.indexOf(b.not) < 0); }
function viewOf(c, key, crop) {
  key = key || methodNow().key; crop = crop || (c.cropFor ? c.cropFor({}) : c.crop);
  var f = function (base, name) { return tagged(base, c.v && c.v[name], key, crop); };
  var gt = c.finale ? 'Pick at least ' + gnum(7, 'kg', key, crop) + ' kg of ' + CROPN[crop].toLowerCase() + '.' : f(c.goal.text0 !== undefined ? c.goal.text0 : c.goal.text, 'goalText');
  return { id: c.id, title: f(c.title, 'title'), blurb: f(c.blurb, 'blurb'), crop: crop, intro: c.introFor ? c.introFor(crop, key) : f(c.intro, 'intro'),
    beats: c.beats.filter(function (b) { return beatOn(b, key); }).map(function (b) { return resolveBeat(b, key, crop); }),
    goalText: gt, failText: c.finale ? c.fail.text : f(c.fail.text0 !== undefined ? c.fail.text0 : c.fail.text, 'failText'), outro: f(c.outro, 'outro'), scenes: resolveScenes(c.raw, key, crop) };
}

function byId(id) { if (typeof id === 'string') return SIDE[id] || null; for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === +id) return CHAPTERS[i]; return null; }

/* ---- progress ---- */
function readProg() {
  var p = { unlocked: 0, done: [], mates: 0, flags: {}, sideDone: [], log: [] };
  try {
    var j = JSON.parse(w.localStorage.getItem(KEY));
    if (j && typeof j.unlocked === 'number') p = { unlocked: j.unlocked, done: Array.isArray(j.done) ? j.done : [], mates: clampM(j.mates), flags: j.flags && typeof j.flags === 'object' ? j.flags : {}, sideDone: Array.isArray(j.sideDone) ? j.sideDone : [], log: Array.isArray(j.log) ? j.log : [] };
    if (j && j.method && j.method.where) p.method = { where: j.method.where, how: j.method.how }; /* v48 */
  } catch (e) {}
  return p;
}
function writeProg(p) { try { w.localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
function clampM(n) { n = +n; return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0; }

/* ---- relationship ("mates") 0-100, flags, unlock thresholds ---- */
var MATES_UNLOCKS = [
  { at: 10, what: 'Kez nods at you in the shop (she is warming up).' },
  { at: 25, what: 'Side quests list shows hints on how to win each one.' },
  { at: 40, what: 'Rob will lend one spare meter at the start of any chapter you choose.' },
  { at: 60, what: 'Kez shares a stall with you at market.' },
  { at: 80, what: 'Your name goes up on the open day chalkboard.' },
  { at: 100, what: 'Axel gets a new plant in his tank (cosmetic).' }];
function mates() { return readProg().mates; }
function addMates(n, why) {
  var p = readProg(), before = p.mates; p.mates = clampM(before + (+n || 0));
  if (why) { p.log.push({ n: p.mates - before, why: String(why) }); if (p.log.length > 30) p.log = p.log.slice(-30); }
  writeProg(p);
  if (p.mates > before) { try { Sfx.play('matesUp'); } catch (e) {} }
  var reached = MATES_UNLOCKS.filter(function (u) { return before < u.at && p.mates >= u.at; });
  if (reached.length && typeof Campaign_onUnlock === 'function') Campaign_onUnlock(reached);
  return p.mates;
}
var Campaign_onUnlock = null;
function setFlag(f) { if (!f) return; var p = readProg(); p.flags[f] = 1; writeProg(p); }
function flags() { return readProg().flags; }
/* Apply a Story onDone result. Returns the lend id (or null) which the caller applies for this chapter only. */
function applyEffects(res, why) {
  var e = (res && res.effects) || {};
  if (e.mates) addMates(e.mates, why || 'story');
  (e.flags || []).forEach(setFlag);
  return e.lend || null;
}
function storyCtx() { var p = readProg(); return { mates: p.mates, flags: p.flags }; }
/* Lend gear for the current run only: call right after Sim.create. Pure sim-side switch, no goal changes. */
function applyLend(S, lend) {
  if (!S || !lend) return false;
  if (lend === 'aqua2500') { if (S.setup) S.setup.airPump = true; return true; }
  if (S.setup && S.setup.meters && lend in S.setup.meters) { S.setup.meters[lend] = true; return true; }
  return false;
}

/* ---- current run (also what toJSON/load persist) ---- */
var cur = null;
function newState() { return { fired: {}, minHealth: 100, ecLit: 0, ecOk: 0, lowRun: 0, cuts: 0, feeds: 0, lastNm: 0, lastKg: 0, lastRef: 0, pestSeen: false, pestFixed: false, hwSeen: false, flowered: false, ecOn: false, done: false }; }

/* v48 the grow that carries a method: where / how / drip / slots / shade as ui.js startGame sets them (the harness builds the same fields from setupOverrides).
   tent/hydro adds nothing to setupOverrides, so that grow is the original one. Hand-fed coco (the drip timer is a free-play toy), a tower of 8 slots, shade cloth on outside. */
function methodSetup(m) {
  var o = { where: m.where, how: m.how, drip: false, slots: 8, shade: m.where !== 'tent' };
  if (m.key === 'tent/hydro') return {};
  o.medium = { soil: 'soil', coco: 'coco', hydro: 'hydro', tower: 'hydro' }[m.how];
  o.airPump = m.how === 'tower';
  return o;
}
/* v48 the season the chapter runs in for a method: a few crops cannot be grown to a goal in a Perth summer in a pot or a bed, so the finale picks their season for them */
var SEASON_FIX = { 7: { tomato: 'spring', lettuce: 'spring' } };
function seasonFor(c, crop, m) { var fx = SEASON_FIX[c.id]; return (fx && fx[crop] && m.where !== 'tent') ? fx[crop] : c.forcedSetup.season; }
function start(id, method) {
  var c = byId(id); if (!c) return null;
  var m = c.side ? normM('tent', 'hydro') : (method ? normM(method.where, method.how) : (savedMethod() || normM('tent', 'hydro')));
  if (c.storyOnly) { cur = null; return { storyOnly: true, chapterId: c.id, scene: c.scene, scenes: resolveScenes(c.raw || c.scenes, m.key), intro: [], goalText: c.goal.text, method: m.key }; }
  var f = c.forcedSetup;
  // a chapter may let the story pick the crop (ch7: "whatever is my best crop")
  var crop = c.cropFor ? c.cropFor(readProg().flags) : c.crop;
  cur = { id: c.id, crop: crop, method: { where: m.where, how: m.how }, st: newState() };
  var v = c.side ? null : viewOf(c, m.key, crop), ms = methodSetup(m), dry = tagsOf(m.key).indexOf('dry') >= 0;
  var med = m.key === 'tent/hydro' ? f.medium : { soil: 'soil', coco: 'coco', hydro: 'hydro', tower: 'tower' }[m.how];
  return { cropId: crop, chapterId: c.id, scene: c.scene, scenes: v ? v.scenes : c.scenes, intro: v ? v.intro.slice() : c.intro.slice(), goalText: v ? v.goalText : c.goal.text, method: m.key,
    gearPick: { crop: crop, light: f.light, medium: med, air: dry ? 'none' : f.air, meters: Object.assign({}, f.meters), where: m.where, how: m.how },
    setupOverrides: Object.assign({ light: Object.assign({}, LIGHTS[f.light]), medium: MEDIA[f.medium], airPump: AIR[f.air], meters: Object.assign({}, f.meters), season: c.side ? f.season : seasonFor(c, crop, m), reservoirL: 40 }, f.mods ? { mods: Object.assign({}, f.mods) } : {}, ms) };
}

function attach(S) { if (cur && S) S.__campaign = cur.st; return S; }

function run(S, hooks, b) {
  if (b.act === 'giveEC') { S.setup.meters.ec = true; cur.st.ecOn = true; }
  if (b.act === 'heatwave' && S.wx) S.wx.hwLeft = 6;
  if (b.act === 'pest') { cur.st.pestForced = true; if (S.pestLevel < 0.5) { S.pestLevel = 0.7; S.immune = 0; } } /* pestForced: a player who sprays before the next tick must still count as having seen + fixed the pest */
  var key = cur && cur.method ? normM(cur.method.where, cur.method.how).key : methodNow().key; /* v48 */
  var lines = vpick(b.v, tagsOf(key)); lines = lines === undefined ? b.lines : vval(lines, key, cur && cur.crop);
  hooks.say(lines.slice(), { pause: !!b.pause });
  if (b.pause && hooks.pause) hooks.pause();
  if (b.shop && hooks.link) hooks.link(b.shop.cat, b.shop.text);
}

function matches(b, S, ev, s) {
  switch (b.when) {
    case 'day': return S.day >= b.day;
    case 'stage': return !!s.stageName && s.stageName.indexOf(b.stage) >= 0;
    case 'event': return !!ev[b.id];
    case 'refill': return !!ev.refill;
    case 'harvest': return !!ev.harvest;
    case 'feed': return !!ev.feed; /* v48 a feed or a mix from the bottle: the refill in a pot */
  }
  return false;
}

/* Call once per game hour after Sim.tick. extraEvents = optional array of engine event ids from that tick. */
function onTick(S, hooks, extraEvents) {
  if (!cur || !S) return;
  var c = byId(cur.id), s = S.__campaign || (S.__campaign = cur.st), ev = {};
  hooks = hooks || {}; hooks.say = hooks.say || function () {};
  (extraEvents || []).forEach(function (id) { ev[id] = true; });
  if (S.health < s.minHealth) s.minHealth = S.health;
  { var P1 = S.pr || {}; s.boltMax = Math.max(s.boltMax || 0, P1.bolt || 0); s.tipMax = Math.max(s.tipMax || 0, P1.tip || 0); if (S.pot && S.cap && S.resL / S.cap < 0.15) s.dryH = (s.dryH || 0) + 1; } /* v71 (story round 18 minors 1, 2): a pot pick clears S.pr before the card reads it, so the worst bolt and tip are kept here, and the hours the pot sat dry */
  if (S.pr && S.pr.iron) s.iron = true;
  if (S.pr && S.pr.iron && !S.pot && S.setup && S.setup.meters && !S.setup.meters.ph && hooks && hooks.say && S.day - (s.phWarnDay == null ? -99 : s.phWarnDay) >= 2) { s.phWarnDay = S.day; hooks.say(['The new leaves are yellow between the veins, so the pH has crept up again. Tap pH down once.']); } /* v67 (story review M2): with no pH pen the warning came twice, then the tank drifted on; it now repeats every two days while the lockout lasts */ /* v66 (play-test #18 M2): remembered, so the fail card can name iron lockout after the lockout has cleared */
  var info = null, r = null;
  try { info = w.Sim.stageInfo(S); } catch (e) {}
  if (info) { s.stageName = String(info.name || '').toLowerCase(); if (s.stageName.indexOf('flower') >= 0) s.flowered = true; }
  try { r = w.Sim.readings(S); } catch (e) {}
  if (r) {
    var bk = (methodOfS(S).how === 'soil' || methodOfS(S).how === 'coco') ? 'moisture' : 'ec'; /* v48 the tile chapter 3 holds in the green: EC in a tank, the Soil / Coco tile in a pot */
    if (s.ecOn || (S.setup.meters && S.setup.meters.ec && bk === 'ec')) { s.ecOn = true; if (r.lightsOn) { s.ecLit++; if (r.status && (r.status[bk] === 'good' || (bk === 'moisture' && S.out && Array.isArray((r.targets || {}).moisture) && r.moisture > r.targets.moisture[1] && (S.rainLog || []).some(function (x) { return x > 0.5; })))) s.ecOk++; } /* v68 (story review minor 2): outside, rain that soaks the bed is the weather, not the player, so a wet tile does not count against the chapter 3 goal */ }
    var t = r.targets && r.targets.ec;
    if (t && typeof r.ec === 'number' && r.ec < t[0] * 0.8) s.lowRun++; else s.lowRun = 0;
    if (s.lowRun === 6) ev.lowec = true;
  }
  if (S.wx && S.wx.hw > 0 && !s.hwSeen) { s.hwSeen = true; ev.heatwave = true; }
  if ((S.pestLevel >= 0.5 || s.pestForced) && !s.pestSeen) { s.pestSeen = true; ev.pests = true; }
  if (s.pestSeen && !s.pestFixed && S.pestLevel < 0.5) { s.pestFixed = true; ev.pestfixed = true; }
  var nm = S.nutrientMl || 0; /* v48 */
  if (nm > (s.lastNm || 0) + 1e-6) { s.feeds = (s.feeds || 0) + 1; ev.feed = true; }
  s.lastNm = nm;
  var kg = S.harvestedKg || 0;
  if (kg > s.lastKg + 1e-6) { s.cuts++; ev.harvest = true; }
  s.lastKg = kg;
  var ref = Math.max(S.refills || 0, S.__refills || 0);
  if (ref > s.lastRef) ev.refill = true;
  s.lastRef = ref;
  var mk = cur && cur.method ? normM(cur.method.where, cur.method.how).key : methodNow().key; /* v48 */
  c.beats.forEach(function (b, i) {
    var key = 'b' + i;
    if (!beatOn(b, mk)) return; /* v48 a beat for another kind of grow never fires (the tank chapter keeps b0..b2 as they were) */
    if (!s.fired[key] && matches(b, S, ev, s)) { s.fired[key] = true; run(S, hooks, b); }
  });
  if (c.endOnGoal && !s.done && (c.goal.check(S) || c.fail.check(S)) && hooks.finish) hooks.finish(onHarvest(S));
  if (!c.endOnGoal && !c.storyOnly && !s.done && !s.goalSaid && c.goal.check(S) && hooks.say) { s.goalSaid = true; if (hooks.offer && hooks.finish) hooks.offer('That is the chapter goal done. Finish the chapter now, or keep it growing; it also ends with the last pick.', 'Finish the chapter', function () { if (!st(S).done) hooks.finish(onHarvest(S)); }); else hooks.say(['That is the chapter goal done. Keep it growing as long as you like; the chapter ends with the last pick.']); } /* v70 (Command Centre, sweep of play-test #19 m6): the goal line offers to finish the chapter there and then */ /* v67 (play-test #19 m6): chapter 2 met its goal on day 21 and ran to day 42 with no word */
}

/* v67 (story review M1): the cause a fail card names when the chapter's own text does not fit (the fail checks are health floors, so any killer trips them) */
function genericCause(S) {
  var P = (S && S.pr) || {}, s = st(S), hasPh = !!(S.setup && S.setup.meters && S.setup.meters.ph);
  if (S.pot && (s.dryH || 0) >= 24 && !((P.iron || s.iron) && S.health < 40)) return 'The roots dried out. Water when the ' + (S.method && S.method.how === 'coco' ? 'Coco' : 'Soil') + ' tile goes orange, and early in the day when it is hot.'; /* v71 (story round 18 minor 2): a bed that died dry was told the heat won */
  if ((P.iron || s.iron) && S.health < 40) return 'The pH crept up and locked out iron, so the new leaves went yellow. ' + (hasPh ? 'Keep the pH tile green as well and try again.' : 'Without a pen, ask me about the pH every few days, or borrow a pH pen next time.');
  return null;
}

function onHarvest(S) {
  if (!cur) return { passed: false, text: '' };
  var c = byId(cur.id), s = cur.st, ok = !!c.goal.check(S), p = readProg();
  var vw = null; try { vw = viewOf(c, methodOfS(S).key, S && S.cropId); } catch (e) { vw = null; } /* v49: the fail and goal words follow the method (a coco or soil grow has no tank to top up) */
  var failT = vw && vw.failText !== undefined ? vw.failText : c.fail.text, goalT = vw && vw.goalText ? vw.goalText : c.goal.text;
  s.done = true;
  if (c.side) {
    if (!ok) return { passed: false, side: true, text: failT + ' ' + goalT };
    if (p.sideDone.indexOf(c.id) < 0) { p.sideDone.push(c.id); writeProg(p); addMates(c.reward, 'side:' + c.id); if (c.setFlag) setFlag(c.setFlag); }
    return { passed: true, side: true, text: c.outro.join(' '), lines: c.outro.slice() };
  }
  if (!ok) { var cz = null; try { cz = c.fail.cause ? c.fail.cause(S) : null; if (!cz && !(c.fail.theme && c.fail.theme(S))) cz = genericCause(S); } catch (e) {} if (cz) failT = cz; } /* v66 (play-test #18 M2): the card names what killed the plant. v67 (story review M1): every chapter, not only chapter 3; a chapter's own theme (heat, pests) keeps its text while that problem is present */
  if (!ok) return { passed: false, text: failT + ' ' + goalT };
  if (p.done.indexOf(c.id) < 0) p.done.push(c.id);
  p.unlocked = Math.max(p.unlocked, Math.min(CHAPTERS.length - 1, c.id + 1));
  writeProg(p);
  var outro = viewOf(c, cur.method ? normM(cur.method.where, cur.method.how).key : methodNow().key, cur.crop).outro; /* v48 */
  var res = { passed: true, text: outro.join(' '), lines: outro.slice() };
  if (c.reward) res.rewardText = c.reward.text; /* v37 [B1] no code wording */
  return res;
}

function renderMenu(container, onPick) {
  if (!container) return;
  if (!document.getElementById('campaign-style')) {
    var css = document.createElement('style'); css.id = 'campaign-style';
    css.textContent = '.cmp-list{display:grid;gap:10px;margin:0;padding:0;list-style:none}' +
      '.cmp-ch{display:flex;gap:12px;align-items:center;text-align:left;width:100%;background:var(--panel,#121512);color:var(--text,#f0f4f0);border:2px solid var(--line,#2a312a);border-radius:14px;padding:10px 14px;font:inherit;cursor:pointer}' +
      '.cmp-ch b{display:block;font-size:16px}.cmp-ch small{color:var(--muted,#a9b3a9)}' +
      '.cmp-n{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:var(--ink,#080808);border:2px solid var(--line,#2a312a)}' +
      '.cmp-ch.cur{border-color:var(--orange,#ec8024)}.cmp-ch.cur .cmp-n{background:var(--orange,#ec8024);color:var(--ink,#080808)}' +
      '.cmp-ch.done{border-color:var(--green,#6ec846)}.cmp-ch.done .cmp-n{background:var(--green,#6ec846);color:var(--ink,#080808)}' +
      '.cmp-ch.locked{opacity:.45;cursor:not-allowed}';
    document.head.appendChild(css);
  }
  var p = readProg(), mk = methodNow().key; /* v48 */
  container.innerHTML = '';
  var note = document.createElement('p'); note.className = 'cmp-method'; note.setAttribute('data-method', mk); note.style.cssText = 'margin:0 0 8px;color:var(--muted,#a9b3a9);font-size:13px'; /* v48 the grow follows the setup */
  note.textContent = 'Your grow: ' + (MLABEL[mk] || mk) + '. The story is the same; the work follows your setup.';
  container.appendChild(note);
  var ul = document.createElement('ul'); ul.className = 'cmp-list';
  CHAPTERS.forEach(function (c) {
    var done = p.done.indexOf(c.id) >= 0, locked = c.id > p.unlocked;
    var li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.className = 'cmp-ch ' + (done ? 'done' : locked ? 'locked' : 'cur'); b.disabled = locked;
    b.setAttribute('data-chapter', c.id);
    b.innerHTML = '<span class="cmp-n"></span><span><b></b><small></small></span>';
    b.querySelector('.cmp-n').textContent = done ? '✓' : locked ? '×' : String(c.id);
    if (c.storyOnly) b.querySelector('small').setAttribute('data-story', '1');
    b.querySelector('b').textContent = 'Chapter ' + c.id + ': ' + tagged(c.title, c.v && c.v.title, mk); /* v48 */
    b.querySelector('small').textContent = locked ? 'Finish chapter ' + (c.id - 1) + ' to unlock' : tagged(c.blurb, c.v && c.v.blurb, mk);
    if (!locked) b.addEventListener('click', function () { if (onPick) onPick(c.id); });
    li.appendChild(b); ul.appendChild(li);
  });
  container.appendChild(ul);
}

/* ---- side quests: unlocked once chapter 2 is done. Same run engine as chapters (id is a string). ---- */
var BASE = { light: 'led300', medium: 'coco', air: 'aqua2500' };
function fs_(m, season) { return Object.assign({ meters: m, season: season }, BASE); }
function sq(o) { o.side = true; o.beats = o.beats || []; o.scene = o.scene || 'counter'; o.fail = o.fail || { text: 'Not this time. You can have another go whenever you like.', check: function (S) { return S.health < 20; } }; return o; }
var SIDE = {
 sq_bottle: sq({ id: 'sq_bottle', title: 'Bring back the bottle', blurb: 'Deb wants her empty bottle back. Grow lettuce and use a refill.', crop: 'lettuce', setFlag: 'bottle_back', reward: 4,
  forcedSetup: fs_({ ec: false, ph: true, thermo: false, par: false }, 'spring'),
  intro: ['Deb says an empty bottle on the shelf is a sad bottle.', 'Grow a lettuce and use at least one refill.'],
  goal: { text: 'Pick 0.1 kg of lettuce and use at least one refill.', check: function (S) { return hv(S) >= 0.1 && Math.max(S.refills || 0, S.__refills || 0) >= 1; } },
  outro: ['Bottle back, lettuce in. Deb has put a tick on the board.'],
  scenes: { open: SC('counter', 'ad', [['d', 'Axel, where is the 5 litre bottle I lent you?', 'worried'], ['a', 'It is in the tank. Long story.', 'worried'], ['d', 'Grow a lettuce. Refill it. Bring it back.'], ['a', 'She loves a plan.', 'laugh']]),
    close: SC('counter', 'ad', [['d', 'My bottle! Full, and a good lettuce too.', 'happy'], ['a', 'Told you. I only borrowed it.', 'thumbs'], ['d', 'Thanks for bringing it back.'] /* v37 */]) } }),
 sq_basil: sq({ id: 'sq_basil', title: "Deb's lunch basil", blurb: 'Deb forgot lunch again. Grow enough basil for her sandwich.', crop: 'basil', reward: 3,
  forcedSetup: fs_({ ec: false, ph: true, thermo: false, par: false }, 'autumn'),
  intro: ['Deb needs basil for lunch. Your goal is 0.15 kg, about a good handful.'],
  goal: { text: 'Pick at least 0.15 kg of basil.', check: function (S) { return hv(S) >= 0.15; } },
  outro: ['That is a lunch worth eating. Deb sends her thanks, with crumbs.'],
  scenes: { open: SC('counter', 'ad', [['d', 'I forgot lunch. Again. Do you have any basil?', 'worried'], ['a', 'Not yet. But our grower does.', 'point'], ['d', 'A handful will do. I am not fussy.', 'laugh']]),
    close: SC('counter', 'ad', [['d', 'Perfect. Basil, tomato, a little oil.', 'happy'], ['a', 'I will take a slice. For the tank.', 'laugh'], ['d', 'You will not.', 'laugh']]) } }),
 sq_meter: sq({ id: 'sq_meter', title: "Rob's dead meter", blurb: 'Rob has a flat meter. Get tomatoes to day 21 by eye alone.', crop: 'tomato', reward: 4,
  forcedSetup: fs_(NOMETERS, 'spring'),
  intro: ['Rob has a dead meter. He needs a result without it.', 'Your goal: reach day 21 with health never below 60, by eye alone.'],
  goal: { text: 'Reach day 21 with health never below 60.', check: function (S) { return S.day >= 21 && st(S).minHealth >= 60; } },
  endOnGoal: true,
  fail: { text: 'The tomatoes were crook. Look at the leaves more often.', check: function (S) { return st(S).minHealth < 60; } },
  outro: ['Three weeks and no meter. Rob is quietly impressed.'],
  scenes: { open: SC('aisle', 'ar', [['r', 'It is dead. Totally flat. I did not drop it.', 'worried'], ['a', 'He dropped it.', 'laugh'], ['r', 'I did not. Mostly.'], ['r', 'Grow tomatoes without it. I will log the result.']]),
    close: SC('aisle', 'ar', [['r', 'No meter, and the plants are fine. Interesting.', 'surprised'], ['a', 'Your eyes work, it turns out.', 'thumbs'], ['r', 'I will still replace the meter.', 'happy']]) } }),
 sq_summer: sq({ id: 'sq_summer', title: 'Perth summer survival', blurb: 'Four weeks of summer with a heatwave. Keep the chillies alive.', crop: 'chilli', reward: 5,
  forcedSetup: fs_(ALLBUTPAR, 'summer'),
  intro: ['A long hot summer. Your goal: reach day 28 with health of 50 or more.'],
  beats: [{ when: 'day', day: 10, lines: ['Heatwave incoming. Fan up and watch the water.'], act: 'heatwave' }],
  goal: { text: 'Survive to day 28 with health of 50 or more.', check: function (S) { return S.day >= 28 && S.health >= 50; } },
  endOnGoal: true,
  fail: { text: 'The summer won. Try the fan on high and shorter light hours.', check: function (S) { return S.health < 40; } },
  outro: ['Four hot weeks and your chillies are still standing.'],
  scenes: { open: SC('growroom', 'ar', [['r', 'Forecast says forty. For a week.', 'worried'], ['a', 'That is a lot of chilli sauce.', 'laugh'], ['r', 'Keep them alive first.']]),
    close: SC('growroom', 'ar', [['r', 'They survived. So did my notes.', 'happy'], ['a', 'Perth summer, one nil.', 'thumbs']]) } }),
 sq_xmas: sq({ id: 'sq_xmas', title: 'Christmas tomatoes', blurb: 'Grow a kilo of tomatoes for the shop Christmas table.' /* v37 */, crop: 'tomato', reward: 5,
  forcedSetup: fs_(ALLBUTPAR, 'summer'),
  intro: ['Christmas is coming. Tomatoes are the star.', 'Your goal: pick one kilo.'] /* v37 */,
  goal: { text: 'Pick at least 1 kg of tomatoes.', check: function (S) { return hv(S) >= 1; } },
  outro: ['A kilo of tomatoes, ready for the Christmas table.'] /* v37 */,
  scenes: { open: SC('counter', 'ad', [['d', 'Every year we do a Christmas table. Tomatoes are the star.', 'happy'], ['a', 'This year, the tomatoes are yours.', 'point'], ['d', 'A kilo, please. Tied with a bow.']]),
    close: SC('counter', 'ad', [['d', 'Lovely. I will tie the bow myself.', 'happy'], ['a', 'Whoever eats them is lucky.', 'thumbs'] /* v37 */]) } })
};
var SIDE_ORDER = ['sq_bottle', 'sq_basil', 'sq_meter', 'sq_summer', 'sq_xmas'];
function sideQuests() {
  var p = readProg(), open = p.done.indexOf(2) >= 0;
  return SIDE_ORDER.map(function (id) {
    var q = SIDE[id];
    return { id: id, title: q.title, blurb: q.blurb, crop: q.crop, goal: q.goal, reward: q.reward, scenes: q.scenes,
      unlocked: open, done: p.sideDone.indexOf(id) >= 0, hint: p.mates >= 25 ? q.goal.text : '' };
  });
}
function startSide(id) { var q = SIDE[id]; if (!q || readProg().done.indexOf(2) < 0) return null; return start(id); }

w.Campaign = {
  chapters: function () { return CHAPTERS; },
  chapter: byId,
  progress: readProg,
  reset: function () { var m = readProg().method; var p = { unlocked: 0, done: [], mates: 0, flags: {}, sideDone: [], log: [] }; if (m) p.method = m; writeProg(p); }, /* v48 the method is a setup choice, not progress: it survives a reset */
  /* story-only chapter (id 0): call after its scenes finish */
  completeStory: function (id) { var c = byId(id), p = readProg(); if (!c) return; if (p.done.indexOf(c.id) < 0) p.done.push(c.id); p.unlocked = Math.max(p.unlocked, Math.min(CHAPTERS.length - 1, c.id + 1)); writeProg(p); },
  mates: mates, addMates: addMates, MATES_UNLOCKS: MATES_UNLOCKS, setFlag: setFlag, flags: flags, applyEffects: applyEffects, storyCtx: storyCtx, applyLend: applyLend,
  matesLog: function () { return readProg().log; },
  onMatesUnlock: function (fn) { Campaign_onUnlock = fn; },
  sideQuests: sideQuests, startSide: startSide,
  start: start, attach: attach, onTick: onTick, onHarvest: onHarvest, renderMenu: renderMenu,
  /* v66 (play-test #18 m2): the active chapter's pick goal in kg (0 when it has none), so the Ripe line waits until a pick can pass it */
  goalKg: function (S) { try { return cur && S ? gnum(cur.id, 'kg', methodOfS(S).key, S.cropId) || gnum(cur.id, 'kg', methodOfS(S).key) || 0 : 0; } catch (e) { return 0; } },
  /* v48 [M34] the grow method the story follows */
  setMethod: function (where, how) { var m = normM(where, how), p = readProg(); p.method = { where: m.where, how: m.how }; writeProg(p); return m.key; },
  method: function () { return methodNow(); }, methods: function () { return Object.keys(MTAGS); }, methodLabel: function (key) { return MLABEL[key] || key; },
  view: function (id, key, crop) { var c = byId(id); return c ? viewOf(c, key, crop) : null; }, goalNum: gnum, normMethod: normM, tags: tagsOf,
  active: function () { return cur ? cur.id : null; },
  toJSON: function () { return cur ? JSON.parse(JSON.stringify(cur)) : null; },
  load: function (j) { cur = j && byId(j.id) ? { id: j.id, crop: j.crop || byId(j.id).crop, method: j.method && j.method.where ? { where: j.method.where, how: j.method.how } : { where: 'tent', how: 'hydro' }, st: Object.assign(newState(), j.st) } : null; return cur ? cur.id : null; }, /* v48 a chapter saved before methods was the tent/hydro one */
  clear: function () { cur = null; },
  REWARD: REWARD, SHOP_FACTS: SHOP_FACTS /* v37 */
};
})(window);
