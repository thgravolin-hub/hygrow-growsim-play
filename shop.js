/* HyGrow Grow Sim - shop.js : feature-flagged "What you'd need" panel and "Visit us" card.
 *
 * FLAG. Everything here exists only when <meta name="hygrow:flags" content="shop"> is in the page (content is a list split on
 * spaces, commas or semicolons; the word `shop` must be one of them). The artifact build (game/index.html as published) has no
 * such meta, so this file adds nothing to the DOM there: no button, no modal, no style tag, no window global.
 * tools/build-static.mjs inserts the meta into dist/index.html (skip it with `--no-shop`).
 *
 * LINKS. Every link goes to https://www.hygrowhydroponics.com.au with ?utm_source=game&utm_medium=app&utm_campaign=<cropId>
 * (utm_campaign=visit on the Visit card). Category pages are /category/<slug>; those slugs are the ones listed in the shop's own
 * https://www.hygrowhydroponics.com.au/store-categories-sitemap.xml and each answers 200 and keeps the UTM query after its
 * redirect to /online-store/<Name>-c<id>. A category with no page falls back to the store home with the same UTM.
 *
 * VISIT FACTS (verified from the shop's own website):
 *   https://www.hygrowhydroponics.com.au/contact-us  and  https://www.hygrowhydroponics.com.au/   retrieved 2026-11-05
 *   Address 1/18 Nettleton Road, Byford, WA 6122 . Phone 08 9503 2540 . Tue-Fri 9:30am-5:00pm, Sat 9:30am-3:30pm, Sun and Mon closed.
 *   (The site gives no public-holiday hours; the card says to check the website. Not cross-checked against a Google Business listing.)
 *
 * PRICES. products.js carries Wix catalogue prices ex-GST; like ui.js the shop sells inc-GST, so price = catalogue x 1.1, shown as
 * "from $N inc GST" (lowest priced product in the category, whole dollars as on the "Take this home" card). ui.js does not expose a price helper
 * on window, so this file formats from window.PRODUCTS itself. No stock claims are made (the catalogue snapshot's stock flags go stale).
 *
 * Not pushy: one panel, no popups, no timers, no discount wording, no sound.
 */
(function () {
  'use strict';
  /* no early return without a document: gearFor() below is pure data and is exported for node; everything that touches the DOM only runs behind flagOn() */

  var HOME = 'https://www.hygrowhydroponics.com.au';
  var GST = 1.1;
  /* v37 [M22] the one price helper: ex-GST dollars (as products.js stores them) -> whole inc-GST dollars, worked in integer cents so 10.91 never meets float noise. cart.js calls window.priceIncGst. */
  function priceIncGst(exGst) { var c = Math.round(Number(exGst) * 100); if (!(c > 0)) return 0; return Math.round(c * 11 / 1000); }
  if (typeof window !== 'undefined') window.priceIncGst = priceIncGst; /* v37: set even with the shop flag off (cart.js needs it) */
  var UTM_BASE = 'utm_source=game&utm_medium=app&utm_campaign=';

  /* ---- flag ---- */
  function flagOn() {
    try {
      var m = document.querySelector('meta[name="hygrow:flags"]');
      var c = m ? (m.content != null ? m.content : (m.getAttribute && m.getAttribute('content'))) : '';
      return String(c || '').toLowerCase().split(/[\s,;]+/).indexOf('shop') >= 0;
    } catch (e) { return false; }
  }

  /* ---- data ---- */
  /* id -> label, one plain line of what the game used it for, store category slug (null = no page, link the store home), products.js keys for the price */
  var CATS = {
    tent:      { label: 'Grow tent',          note: 'The enclosed space your plants grew in.',            slug: 'grow-tents',     keys: ['tent120'] },
    light:     { label: 'Grow light',         note: 'The light on its timer, hour by hour.',               slug: 'led-grow-lights', keys: ['led200', 'led300', 'cmh315'] },
    nutrients: { label: 'Nutrients',          note: 'The feed you mixed into the tank.',                   slug: 'nutrients',      keys: ['profAB1', 'profAB5'] },
    medium:    { label: 'Grow medium',        note: 'Coco coir or clay balls for the roots.',              slug: 'soil',           keys: ['coco50', 'clay50'] },
    air:       { label: 'Air pump and stone', note: 'Oxygen for the roots in the tank.',                   slug: 'irrigation',     keys: ['airPump', 'airStone'] },
    testing:   { label: 'Meters and testing', note: 'EC, pH and temperature readings.',                    slug: 'test-equipment', keys: ['ecMeter', 'phPen', 'thermo', 'calibration'] },
    additives: { label: 'pH and additives',   note: 'pH Down, pH Up and Cal-Mag to keep the tank in range.', slug: 'additives',    keys: ['phUp', 'phDown', 'calMag'] },
    /* grow methods (pots, soil, drip, tower, shade, pump). Only slugs from the store sitemap are used; a category with no page links the store home. Prices only where products.js has the item. */
    pots:      { label: 'Pots and saucers',      note: 'Pots with saucers so the roots can drain.',          slug: null,             keys: ['pots', 'saucer', 'fabricPot15'] }, /* v36c */
    soil:      { label: 'Potting mix',           note: 'Potting mix that holds water and feed for the roots.', slug: 'soil',         keys: ['pottingMix'] },
    drip:      { label: 'Drip kit and timer',    note: 'A drip kit and timer to feed the pots while you are out.', slug: 'irrigation', keys: ['timer', 'dripPump'] },
    tower:     { label: 'Hydro tower or system', note: 'A hydro tower with a slot for each plant.',          slug: null,             keys: ['tower', 'towerLarge'] }, /* v36c: the pump has its own row; naming the tower row after the cheaper pump misled */
    shade:     { label: 'Shade cloth',           note: 'Shade cloth to cut the sun and heat on hot days.',   slug: null,             keys: [] }, /* shadeCloth: in PRODUCT_GAPS, no product in the store */
    pump:      { label: 'Water pump',            note: 'A water pump to run the tower.',                     slug: null,             keys: ['waterPump'] }
  };
  var CATEGORIES = CATS;
  var FRUIT = ['tent', 'light', 'nutrients', 'medium', 'testing', 'additives'];
  var LEAFY = ['tent', 'light', 'nutrients', 'air', 'testing', 'additives'];
  var CROP_CATS = { tomato: FRUIT, chilli: FRUIT, capsicum: FRUIT, strawberry: FRUIT, cucumber: FRUIT, lettuce: LEAFY, basil: LEAFY };

  var VISIT = {
    name: 'HyGrow Hydroponics',
    street: '1/18 Nettleton Road',
    suburb: 'Byford WA 6122',
    phone: '08 9503 2540',
    phoneTel: '+61895032540',
    hours: [['Monday', 'Closed'], ['Tuesday to Friday', '9:30am to 5:00pm'], ['Saturday', '9:30am to 3:30pm'], ['Sunday', 'Closed']],
    hoursNote: 'Hours as listed on the website on 2026-11-05. Public holidays and changes: check the website for today\'s hours.',
    src: HOME + '/contact-us'
  };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function utm(url, campaign) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + UTM_BASE + encodeURIComponent(campaign); }
  function categoryUrl(slug, cropId) { return utm(slug ? HOME + '/category/' + slug : HOME + '/', cropId); }
  function directionsUrl() { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(VISIT.name + ', ' + VISIT.street + ', ' + VISIT.suburb); }
  function homeUrl(campaign) { return utm(HOME + '/', campaign); }

  /* lowest inc-GST price among the category's products that the catalogue has a price for; null when none */
  /* v36c: a row is named after the category's headline product (keys are listed headline first) that is IN STOCK, and "from $" is the cheapest in-stock product in the category, so the number is honest and the name is not a saucer standing in for the pots. When nothing is in stock the first / cheapest of all stand in. No price is ever invented. */
  function stocked(keys) {
    var P = (typeof window !== 'undefined' && window.PRODUCTS) || {}, all = [], st = [];
    keys.forEach(function (k) { var p = P[k]; if (!(p && p.price > 0)) return; all.push(p); if (p.inStock === true) st.push(p); });
    return st.length ? st : all;
  }
  function fromPrice(keys) { var l = stocked(keys); if (!l.length) return null; var best = null; l.forEach(function (p) { var v = priceIncGst(p.price); /* v37 [M22] */ if (best == null || v < best) best = v; }); return best; }
  function fromName(keys) { var l = stocked(keys); return l.length ? l[0].name : null; }

  function priceText(price) { return price != null ? 'from $' + price + ' inc GST' : 'Ask in store'; }

  function cropList() {
    var list = [];
    try { if (window.Sim && Array.isArray(window.Sim.CROPS)) list = window.Sim.CROPS.map(function (c) { return { id: c.id, name: c.name }; }); } catch (e) {}
    if (!list.length) list = Object.keys(CROP_CATS).map(function (id) { return { id: id, name: id.charAt(0).toUpperCase() + id.slice(1) }; });
    return list;
  }
  function currentCrop() {
    try { var g = window.__game; if (g && g.S && g.S.cropId) return String(g.S.cropId); } catch (e) {}
    return null;
  }

  /* rows for one crop: [{ id, label, note, href, price }] */
  function rowsFor(cropId) {
    var ids = CROP_CATS[cropId] || FRUIT;
    return ids.map(function (id) {
      var c = CATS[id];
      return { id: id, label: c.label, note: c.note, href: categoryUrl(c.slug, cropId), price: fromPrice(c.keys), name: fromName(c.keys), priceText: priceText(fromPrice(c.keys)) };
    });
  }

  /* rows for a grow method { where, how, cropId? }: the Sim's gear list (Sim.gearFor) mapped through the same row builder as rowsFor. The tent + hydro tub keeps the
   * original per-crop list (rowsFor) when a crop is known, so that mapping is unchanged. Notes come from the Sim (one plain line each), labels and prices from CATEGORIES. */
  function gearFor(method) {
    var m = method || {}, where = m.where || 'tent', how = m.how || 'hydro', crop = m.cropId || currentCrop();
    if (where === 'tent' && how === 'hydro' && crop) return rowsFor(crop);
    var list = [];
    try { if (window.Sim && window.Sim.gearFor) list = window.Sim.gearFor(where, how); } catch (e) {}
    return list.filter(function (g) { return CATS[g.id]; }).map(function (g) {
      var c = CATS[g.id];
      return { id: g.id, label: c.label, note: g.note || c.note, href: categoryUrl(c.slug, crop || 'grow'), price: fromPrice(c.keys), name: fromName(c.keys), priceText: priceText(fromPrice(c.keys)) };
    });
  }

  /* ---- markup ---- */
  var CSS = '#shopModal .card{max-width:560px}#shopModal h2{font-family:var(--display);color:var(--green)}'
    + '#shopModal .shopTabs{display:flex;gap:8px;margin:10px 0}#shopModal .shopTabs button{flex:1;min-height:44px}#shopModal .shopTabs button[aria-selected="true"]{border-color:var(--green);background:#16261a}'
    + '#shopModal .shopLine{margin:6px 0 10px;color:var(--muted)}'
    + '#shopModal .shopCrops{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}#shopModal .shopCrops button{min-height:40px;padding:4px 10px}#shopModal .shopCrops button[aria-pressed="true"]{border-color:var(--green);background:#16261a}'
    + '#shopModal .shopList{list-style:none;margin:0;padding:0}'
    + '#shopModal .shopRow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;margin-bottom:8px;background:var(--panel2);border:2px solid var(--line);border-radius:14px;color:inherit;text-decoration:none;min-height:48px}'
    + '#shopModal .shopRow:hover,#shopModal .shopRow:focus-visible{border-color:var(--green)}'
    + '#shopModal .shopRow b{display:block;font-size:15px}#shopModal .shopRow span{font-size:12.5px;color:var(--muted)}#shopModal .shopRow i{font-style:normal;font-weight:800;white-space:nowrap;font-size:13px}'
    + '#shopModal .shopFine{font-size:12px;color:var(--muted);margin:8px 0 0}'
    + '#shopModal .shopVisit p{margin:4px 0}#shopModal .shopVisit table{border-collapse:collapse;margin:8px 0;width:100%}#shopModal .shopVisit td{padding:5px 0;border-bottom:1px solid var(--line)}#shopModal .shopVisit td:last-child{text-align:right;font-weight:800}'
    + '#shopModal .shopLinks{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}#shopModal .shopLinks a{text-decoration:none;min-height:44px;display:inline-flex;align-items:center}';

  function panelHtml(cropId) {
    var crops = cropList();
    var chips = '<div class="shopCrops" role="group" aria-label="Crop">' + crops.map(function (c) {
      return '<button type="button" class="menu" data-shop-crop="' + esc(c.id) + '" aria-pressed="' + (c.id === cropId ? 'true' : 'false') + '">' + esc(c.name) + '</button>';
    }).join('') + '</div>';
    var out = '<p class="shopLine">Everything here is what the game used. Ask the team in store or online.</p>' + chips;
    if (!cropId) return out + '<p class="shopFine">Pick a crop to see what a grow of it uses.</p>';
    var rows = rowsFor(cropId);
    out += '<ul class="shopList" data-shop-count="' + rows.length + '">' + rows.map(function (r) {
      return '<li><a class="shopRow" href="' + esc(r.href) + '" target="_blank" rel="noopener"><span><b>' + esc(r.label) + '</b><span>' + esc(r.note) + '</span></span>'
        + '<i>' + esc(r.priceText) + '</i></a></li>';
    }).join('') + '</ul>';
    return out + '<p class="shopFine">Prices are inc GST, from the shop catalogue when the game was built. The shop\'s own pages are the source of truth.</p>';
  }

  function visitHtml() {
    return '<div class="shopVisit"><p><b>' + esc(VISIT.name) + '</b><br>' + esc(VISIT.street) + '<br>' + esc(VISIT.suburb) + '</p>'
      + '<p>Phone <a href="tel:' + VISIT.phoneTel + '">' + esc(VISIT.phone) + '</a></p>'
      + '<table aria-label="Opening hours"><tbody>' + VISIT.hours.map(function (h) { return '<tr><td>' + esc(h[0]) + '</td><td>' + esc(h[1]) + '</td></tr>'; }).join('') + '</tbody></table>'
      + '<p class="shopFine">' + esc(VISIT.hoursNote) + '</p>'
      + '<div class="shopLinks"><a class="cta" href="' + esc(directionsUrl()) + '" target="_blank" rel="noopener">Directions</a>'
      + '<a class="ghost" href="' + esc(homeUrl('visit')) + '" target="_blank" rel="noopener">HyGrow Hydroponics website</a></div></div>';
  }

  /* ---- mounting ---- */
  var modal = null, body = null, tabsEl = null, cardEl = null, tab = 'need', crop = null, lastFocus = null;

  function paint() {
    if (!body) return;
    if (tabsEl) tabsEl.innerHTML = '<button type="button" class="menu" role="tab" data-shop-tab="need" aria-selected="' + (tab === 'need') + '">What you\'d need</button>'
      + '<button type="button" class="menu" role="tab" data-shop-tab="visit" aria-selected="' + (tab === 'visit') + '">Visit us</button>';
    body.innerHTML = tab === 'visit' ? visitHtml() : panelHtml(crop);
  }
  function setCrop(id) { crop = id || null; tab = 'need'; paint(); }
  function setTab(t) { tab = t === 'visit' ? 'visit' : 'need'; paint(); }

  function open() {
    if (!modal) return;
    crop = currentCrop() || crop; tab = 'need'; paint();
    try { lastFocus = document.activeElement; } catch (e) {}
    modal.classList.add('show');
    try { if (cardEl && cardEl.focus) cardEl.focus(); } catch (e) {}
  }
  function close() {
    if (!modal) return;
    modal.classList.remove('show');
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) {}
  }

  function mount() {
    if (!flagOn() || document.getElementById('shopModal')) return;
    var st = document.createElement('style'); st.id = 'shopCss'; st.textContent = CSS; document.head.appendChild(st);

    modal = document.createElement('div'); modal.id = 'shopModal'; modal.className = 'modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'What you\'d need, and visiting HyGrow');
    var card = document.createElement('div'); card.className = 'card'; card.setAttribute('tabindex', '-1');
    var h = document.createElement('h2'); h.textContent = 'HyGrow Hydroponics';
    tabsEl = document.createElement('div'); tabsEl.id = 'shopTabs'; tabsEl.className = 'shopTabs'; tabsEl.setAttribute('role', 'tablist');
    body = document.createElement('div'); body.id = 'shopBody';
    var foot = document.createElement('div'); foot.className = 'foot';
    foot.innerHTML = '<button type="button" class="big" data-shop-close="1">Close</button>';
    card.appendChild(h); card.appendChild(tabsEl); card.appendChild(body); card.appendChild(foot);
    modal.appendChild(card); cardEl = card;
    document.body.appendChild(modal);

    modal.addEventListener('click', function (ev) {
      var t = ev && ev.target; if (!t) return;
      if (t === modal) { close(); return; }
      var hit = function (sel) { return t.closest ? t.closest(sel) : null; };
      var b;
      if ((b = hit('[data-shop-close]'))) { close(); return; }
      if ((b = hit('[data-shop-crop]'))) { setCrop(b.getAttribute('data-shop-crop')); return; }
      if ((b = hit('[data-shop-tab]'))) { setTab(b.getAttribute('data-shop-tab')); return; }
    });
    modal.addEventListener('keydown', function (ev) { if (ev && ev.key === 'Escape') close(); });

    var hx = document.querySelector('#hextras');
    if (hx && !document.getElementById('shopBtn')) {
      var btn = document.createElement('button'); btn.id = 'shopBtn'; btn.type = 'button'; btn.className = 'menu';
      btn.title = 'What you\'d need to grow this at home'; btn.textContent = 'What you\'d need';
      btn.onclick = open;
      var mb = document.querySelector('#menu');
      hx.insertBefore(btn, mb && mb.parentNode === hx ? mb : null);
    }

    window.HyGrowShop = { open: open, close: close, setCrop: setCrop, setTab: setTab, rowsFor: rowsFor, gearFor: gearFor, CATEGORIES: CATEGORIES, directionsUrl: directionsUrl, homeUrl: homeUrl, visit: VISIT, priceIncGst: priceIncGst /* v37 */ };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { priceIncGst: priceIncGst, priceText: priceText, gearFor: gearFor, rowsFor: rowsFor, CATEGORIES: CATEGORIES }; /* node only; a browser page has no `module` */
  if (!flagOn()) return; /* flag off: nothing is added anywhere */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
