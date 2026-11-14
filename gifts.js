/* HyGrow Grow Sim - gifts.js : Mates gifts (Stardew-style) + Rob's lab notes. Exposes window.Gifts.
   Gifts cost Axel coins (Daily). Mates go through Campaign.addMates. Storage: hygrow_gifts_v1, hygrow_labnotes_v1. */
(function (w) {
'use strict';
var GK = 'hygrow_gifts_v1', NK = 'hygrow_labnotes_v1', WEEK_LIMIT = 2;
var $ = function (s, r) { return (r || document).querySelector(s); };
function load(k, d) { try { var j = JSON.parse(localStorage.getItem(k)); return j && typeof j === 'object' ? j : d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function say(text) { try { document.dispatchEvent(new CustomEvent('hygrow:say', { detail: { text: text, opts: { hop: true } } })); } catch (e) {} }
function esc(s) { s = String(s); return window.escHtml ? window.escHtml(s) : s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); } /* m6-fallback: ui.js escH is the one escape; this body runs only if ui.js is not loaded yet */
function mates() { try { return w.Campaign ? Campaign.mates() : 0; } catch (e) { return 0; } }
function coins() { try { return w.Daily ? Daily.coins() : 0; } catch (e) { return 0; } }
function seenCrop(c) { try { var a = JSON.parse(localStorage.getItem('hygrow_almanac_v1')); return !!(a && a.seen && a.seen['crop:' + c]); } catch (e) { return false; } }

/* ISO week key like 2026-W45 (local date) */
function isoWeek(d) {
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + ('0' + Math.ceil(((t - y0) / 864e5 + 1) / 7)).slice(-2);
}

/* ---------------- gifts ---------------- */
var WHO = {
  deb: { name: 'Deb', tag: 'warm, practical', gifts: [
    { id: 'pesto', label: 'A jar of basil pesto', price: 25, v: 'like', need: 'basil', needText: 'Pick some basil first.', love: 'Pesto! From your own basil? I will have that on toast all week.' , neutral: '' },
    { id: 'strawb', label: 'Fresh strawberries', price: 20, v: 'like', love: 'Strawberries. You are a good egg. Do not tell Rob, he will want to weigh them.' },
    { id: 'sheet', label: 'A spreadsheet', price: 15, v: 'dislike', hate: 'A spreadsheet. For me. Lovely. I will file it where I file everything I did not ask for.' }] },
  rob: { name: 'Rob', tag: 'the numbers guy', gifts: [
    { id: 'calib', label: 'Calibration solution', price: 30, v: 'like', love: 'pH 7.00, sealed, in date. This is the nicest thing anyone has given me.' },
    { id: 'notebk', label: 'A notebook', price: 20, v: 'like', love: 'Squared paper. Hardback. You understand me better than the clipboard does.' },
    { id: 'flowers', label: 'Flowers', price: 15, v: 'dislike', hate: 'Flowers. They shed. Into the reservoir. Thank you, I will put them out the front.' }] },
  kez: { name: 'Kez', tag: 'the regular, warming up', gifts: [
    { id: 'chilli', label: 'A chilli challenge', price: 35, v: 'like', need: 'chilli', needText: 'Grow some chillies first.', love: 'Your chillies? Hot ones? Right. You are on. Do not cry first.' },
    { id: 'sign', label: 'A market stall sign', price: 40, v: 'like', love: 'A proper sign. Hm. It is good. Do not read into this.' },
    { id: 'help', label: 'Help she did not ask for', price: 15, v: 'dislike', hate: 'I did not ask for help. I never asked for help. I will remember this.' }] }
};
var ORDER = ['deb', 'rob', 'kez'];

function gState() {
  var g = load(GK, {}); if (!Array.isArray(g.given)) g.given = []; if (typeof g.count !== 'number') g.count = 0; return g;
}
function weekLeft() { var g = gState(), wk = isoWeek(new Date()); return g.week === wk ? Math.max(0, WEEK_LIMIT - g.count) : WEEK_LIMIT; }

function renderMeter() {
  var el = $('#campMates'); if (!el || !w.Campaign) return;
  var m = Campaign.mates(), nx = (Campaign.MATES_UNLOCKS || []).find(function (u) { return u.at > m; });
  el.innerHTML = '<div class="mates" title="Friendship with the HyGrow crew"><b>Mates ' + m + '/100</b><div style="height:10px;background:var(--panel2);border:2px solid var(--line);border-radius:8px"><i style="display:block;height:100%;width:' + Math.min(100, m) + '%;background:var(--green)"></i></div><small>' + (nx ? 'Next at ' + nx.at + ': ' + nx.what : 'Maxed out. Legend.') + '</small></div>';
}

function give(who, gid) {
  var c = WHO[who], g = c.gifts.filter(function (x) { return x.id === gid; })[0]; if (!g) return;
  if (g.need && !seenCrop(g.need)) return;
  var st = gState(), wk = isoWeek(new Date());
  if (st.week !== wk) { st.week = wk; st.count = 0; }
  if (st.count >= WEEK_LIMIT) { say("Deb: Steady on, it's not Christmas."); render(); return; }
  if (coins() < g.price) { say('Deb: Axel coins first, love. ' + g.label + ' is ' + g.price + '.'); return; }
  Daily.addCoins(-g.price, 'gift:' + gid);
  st.count++; st.given.push({ who: who, gift: gid, date: new Date().toISOString().slice(0, 10) });
  if (st.given.length > 60) st.given = st.given.slice(-60);
  save(GK, st);
  var d = g.v === 'like' ? 4 : g.v === 'dislike' ? -2 : 1;
  Campaign.addMates(d, 'gift:' + who);
  say(c.name + ': ' + (g.v === 'like' ? g.love : g.v === 'dislike' ? g.hate : (g.neutral || 'Oh. Thanks.')));
  renderMeter(); checkNotes(); render();
}

var gm;
function ensureModal(id) {
  var m = document.getElementById(id);
  if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = id; document.body.appendChild(m); }
  return m;
}
function css() {
  if (document.getElementById('giftsCss')) return;
  var s = document.createElement('style'); s.id = 'giftsCss';
  s.textContent = '.gf-who{margin:12px 0 4px}.gf-who small,.gf-meta{color:var(--muted)}.gf-meta{margin:6px 0 10px}#giftsModal .cmp-ch[disabled],#notesModal .cmp-ch[disabled]{opacity:.55}.gf-note{white-space:pre-line;line-height:1.5;margin:10px 0}#campExtras{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}#campExtras button{flex:1 1 140px}';
  document.head.appendChild(s);
}

function render() {
  gm = ensureModal('giftsModal'); css();
  var left = weekLeft(), given = gState().given;
  var h = '<div class="card"><h2>Gifts</h2><div class="gf-meta">Mates ' + mates() + '/100 · ' + coins() + ' Axel coins · ' + left + ' of ' + WEEK_LIMIT + ' gifts left this week</div>';
  ORDER.forEach(function (k) {
    var c = WHO[k], n = given.filter(function (x) { return x.who === k; }).length;
    h += '<h3 class="gf-who">' + c.name + ' <small>' + c.tag + ' · ' + n + ' given</small></h3>';
    c.gifts.forEach(function (g) {
      var locked = g.need && !seenCrop(g.need), poor = coins() < g.price, off = locked || left <= 0 && false;
      h += '<button class="cmp-ch ' + (locked ? 'locked' : 'cur') + '" data-who="' + k + '" data-gift="' + g.id + '"' + (locked ? ' disabled' : '') + '><span class="cmp-n">' + g.price + '</span><span><b>' + esc(g.label) + '</b><small>' + (locked ? esc(g.needText) : poor ? 'Not enough coins yet.' : g.price + ' Axel coins') + '</small></span></button>';
    });
  });
  h += '<div class="foot"><span></span><button class="ghost" id="giftsBack">Back</button></div></div>';
  gm.innerHTML = h;
  gm.querySelectorAll('[data-gift]').forEach(function (b) { b.onclick = function () { give(b.dataset.who, b.dataset.gift); }; });
  $('#giftsBack', gm).onclick = function () { gm.classList.remove('show'); };
}
function openGifts() { render(); gm.classList.add('show'); }

/* ---------------- Rob's lab notes ---------------- */
var TIERS = [10, 25, 40, 55, 70, 85];
var NOTES = [
 { id: 'ec', title: '1. EC and what 1 ml/L does', text:
  "EC is how salty the water is, in mS/cm. Salt here means plant food, and it carries current, so the meter can read it.\n\nThe number worth writing down: with Professor's A+B, every 1 ml/L adds about 0.47 mS. The line I use is EC = 0.8 + 0.47 x ml, from 2 ml/L upward. So 2 ml/L reads 1.74, 3 ml/L reads 2.21, 4 ml/L reads 2.68.\n\nUnder 2 ml/L the line bends down towards tap water, which sits near 0.25 by itself. So 1 ml/L is about 1.0, not 1.27. Do not trust the sum over the meter, either. Tap minerals build up as the plants drink, so the meter tells you what is really in there.\n\nA young plant is happiest near 1.0 to 1.4. Past 2.5 you are shouting at the plant and the leaf tips go crisp. EC too high: add plain water. Too low: add feed. Small moves, wait an hour, measure again." },
 { id: 'ph', title: '2. pH drift and plain-water top-ups', text:
  "pH is how acid the feed is. Plants only grab their food properly in a window, roughly 5.5 to 6.5, and each crop has its own window. Outside it, the food is in the tank but locked out.\n\nLeft alone, the reservoir creeps up. In the sim it is about 0.15 a day in hydro and about 0.05 in coco, a little faster when the plants are drinking hard. Start at 6.0 in hydro, ignore it for a week, and you are near 7.0. That is lockout.\n\nPlain-water top-ups make it creep more. Tap water carries alkalinity, which pushes pH up, and you are also thinning the feed so there is less holding the number steady. Topping up with plain water is fine. Just measure after.\n\nA fresh mix drags pH about halfway back to 6.2, which is why a full change resets things.\n\nFix it with pH Down, a tiny dose, stir, wait, and measure again. Use the pen, not your eyes. Check every couple of days." },
 { id: 'vpd', title: '3. VPD on one page', text:
  "VPD is how thirsty the air is, in kPa. Low VPD, the air is soggy and plants barely drink. High VPD, they close their pores and stall. You want the middle.\n\nThe maths: VPD = es(T) x (1 - RH). The saturation pressure es comes from Tetens: es = 0.6108 x exp(17.27 T / (T + 237.3)).\n\nAt 24C, es is about 2.98 kPa. At 60% RH that gives 2.98 x 0.4 = 1.19 kPa. At 22C, es is 2.64, so 60% RH gives 1.06 and 70% RH gives 0.79.\n\nTargets in the sim: seedlings about 0.4 to 0.8, young vegetative plants about 0.7 to 1.1 (it varies a bit by crop). Past 1.5 the air is too dry and leaf edges crisp. Down at the bottom of the range, you invite mould.\n\nWarm air holds more water, so the same RH at a higher temperature means a higher VPD. Heat the tent and your 60% quietly gets drier. Always read temperature and humidity together." },
 { id: 'root', title: '4. Root temperature and dissolved oxygen', text:
  "Roots live in the reservoir, and the reservoir lags the air. In the sim the solution chases the air temperature at about 4% an hour and settles roughly 1C under it. An air pump nudges that up by 0.6C.\n\nRoots want 18 to 21C while young. Warm water holds less oxygen. Dissolved oxygen is saturation minus a load from the roots: sat = 14.6 - 0.39 T + 0.0057 T squared, in mg/L. That is 9.1 at 20C and 8.3 at 26C.\n\nThen multiply by how well the water is aerated: 0.72 for hydro with no pump, 0.78 for coco, and 0.95 with an air pump. Big root systems take a bite out of it too.\n\nSo hydro with no pump at 26C works out near 6.0 mg/L. Below about 5.5, growth is held back. Water above 22C with DO under 6, and root rot starts. An air pump is five watts and cheap insurance." },
 { id: 'dli', title: '5. DLI and light hours', text:
  "Plants do not count brightness, they count light collected over the day. That total is DLI, in mol per square metre.\n\nPPFD = watts x dim x umol/J / area. The default tent has a 240 W light at 2.5 umol/J over 1.44 square metres, which is 417 umol/m2/s at full power.\n\nDLI = PPFD x hours x 3.6 / 1000. So 417 for 16 hours is 24 mol. That is a lot for a vegetative plant, whose target is about 12 to 17.\n\nTwo knobs: dim the light or cut the hours. Dim to 70% and you are at 292 umol/m2/s, which over 16 hours is 16.8 mol. Spot on.\n\nIn the sim, growth drops if you fall under 90% of the low target, and eases off only gently above 130% of the top. More light is not free: 85% of the wattage turns into heat in the tent, which is why I tell you to cut the light hours before a heatwave." },
 { id: 'fan', title: '6. Humidity vs airflow: fan maths', text:
  "The tent's humidity is a vapour balance. Plants add water, the fan takes it out. The fan has three settings: 150, 300 and 450 m3/h.\n\nThe air-exchange term in the sim is Q = 0.6 x fan + 10. That is 100, 190 and 280. The more Q, the less the same plant and the same humidifier can lift RH.\n\nThe humidifier puts out 230 g/h, about plus 12% RH at 150 m3/h. Double the fan to 300 and Q goes 100 to 190, so the same humidifier gives roughly 6%. The fan is stronger than the humidifier. Remember that when the air is dry.\n\nThat 12% is the vapour alone. Evaporating 230 g/h takes about 156 W of heat out of the air, so a humidifier also cools the tent. A dehumidifier does the reverse: it hands the same 156 W (plus its own 40 W) back as heat. Run the humidifier on a hot dry day and you lower the VPD twice, with more vapour and a cooler leaf.\n\nPlants cannot add unlimited water, either. Transpiration is paid for with light: the sim caps it at what the absorbed light can evaporate, about 265 g/h for the 300 W kit, which is roughly 1.7 L per tomato plant per day.\n\nThe fan also cools. Venting carries 0.2 x fan watts per degree: 30, 60, 90. Compare that to the tent walls leaking about 18 W per degree. So the fan is doing most of the cooling.\n\nPruning lower leaves adds 25% effective airflow for a few days. Mould wants wet, still air. High fan, low mould risk. Low fan, watch for grey fuzz." }
];

function nState() { var n = load(NK, {}); if (!Array.isArray(n.read)) n.read = []; if (!Array.isArray(n.seen)) n.seen = []; return n; }
function unlocked(i) { return mates() >= TIERS[i]; }
function checkNotes() {
  var n = nState(), changed = false;
  NOTES.forEach(function (x, i) {
    if (unlocked(i) && n.seen.indexOf(x.id) < 0) { n.seen.push(x.id); changed = true; say("Rob: new lab note, \"" + x.title.replace(/^\d+\.\s*/, '') + '". Check the notebook.'); }
  });
  if (changed) save(NK, n);
}
function notesList() {
  var m = ensureModal('notesModal'); css(); var n = nState(), cnt = NOTES.filter(function (x, i) { return unlocked(i); }).length;
  var h = '<div class="card"><h2>Rob\'s lab notes</h2><div class="gf-meta">' + cnt + ' of ' + NOTES.length + ' notes · Mates ' + mates() + '/100</div>';
  NOTES.forEach(function (x, i) {
    var u = unlocked(i), r = n.read.indexOf(x.id) >= 0;
    h += '<button class="cmp-ch ' + (u ? (r ? 'done' : 'cur') : 'locked') + '" data-note="' + i + '"' + (u ? '' : ' disabled') + '><span class="cmp-n">' + (u ? (r ? '✓' : '+') : '×') + '</span><span><b>' + esc(x.title) + '</b><small>' + (u ? (r ? 'Read' : 'New') : 'Mates ' + TIERS[i] + ' to unlock') + '</small></span></button>';
  });
  h += '<div class="foot"><span></span><button class="ghost" id="notesBack">Back</button></div></div>';
  m.innerHTML = h;
  m.querySelectorAll('[data-note]').forEach(function (b) { b.onclick = function () { notesRead(+b.dataset.note); }; });
  $('#notesBack', m).onclick = function () { m.classList.remove('show'); };
  m.classList.add('show');
}
function notesRead(i) {
  var m = ensureModal('notesModal'), x = NOTES[i], n = nState();
  if (!unlocked(i)) return;
  if (n.read.indexOf(x.id) < 0) { n.read.push(x.id); save(NK, n); }
  m.innerHTML = '<div class="card"><h2>' + esc(x.title) + '</h2><div class="gf-note">' + esc(x.text) + '</div><div class="foot"><span></span><button class="ghost" id="noteBack">Notebook</button></div></div>';
  $('#noteBack', m).onclick = notesList;
  var c = $('.card', m); if (c) c.scrollTop = 0;
}

/* ---------------- menu mount ---------------- */
function mountMenu(box) {
  if (!box) return; css(); checkNotes();
  box.innerHTML = '<button class="ghost" id="btnGifts">Gifts</button><button class="ghost" id="btnLabNotes">Lab notes</button>';
  $('#btnGifts', box).onclick = openGifts;
  $('#btnLabNotes', box).onclick = notesList;
}

w.Gifts = w.Gifts || {};
w.Gifts.mountMenu = mountMenu; w.Gifts.open = openGifts; w.Gifts.openNotes = notesList; w.Gifts.check = checkNotes;
w.Gifts.NOTES = NOTES; w.Gifts.TIERS = TIERS; w.Gifts.isoWeek = isoWeek;
})(window);
