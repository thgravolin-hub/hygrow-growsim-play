/* HyGrow Grow Sim - cart.js : shopping cart -> hygrowhydroponics.com.au/grow-sim-cart */
(function () {
  'use strict';
  var KEY = 'hygrow_cart_v1', BASE = 'https://www.hygrowhydroponics.com.au/grow-sim-cart';
  var list = [], chips = [], drawer = null;
  /* v37 [M22] catalogue date the prices come from (products.js header says 2026-11-06). A stored line stamped older than this is re-priced from products.js. */
  var CAT_DATE = (typeof window !== 'undefined' && window.PRODUCTS_AT) || '2026-11-06';
  function incGst(ex) { return typeof window.priceIncGst === 'function' ? window.priceIncGst(ex) : Math.round(Math.round(Number(ex) * 100) * 1.1 / 100); }
  /* products.js entry for a cart sku: its store sku, or 'HG-<key>' */
  function productFor(sku) {
    var P = window.PRODUCTS || {}, k;
    for (k in P) if (P[k] && (P[k].sku === sku || 'HG-' + k === sku)) return P[k];
    return null;
  }
  function reprice(arr) {
    arr.forEach(function (i) {
      if (i.pricedAt && i.pricedAt >= CAT_DATE) return;
      var p = productFor(i.sku);
      if (p && p.price > 0) i.price = incGst(p.price);
      i.pricedAt = CAT_DATE;
    });
    return arr;
  }

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  function clean(a) {
    var out = [];
    (Array.isArray(a) ? a : []).forEach(function (x) {
      if (!x || !x.sku) return;
      var q = Math.max(1, Math.min(99, Math.floor(+x.qty) || 1));
      var ex = out.filter(function (o) { return o.sku === x.sku; })[0];
      if (ex) ex.qty = Math.min(99, ex.qty + q);
      else out.push({ sku: String(x.sku), name: String(x.name || x.sku), price: +x.price || 0, qty: q, why: x.why ? String(x.why) : '', pricedAt: x.pricedAt ? String(x.pricedAt) : '' }); /* v37 */
    });
    return out;
  }
  try { list = clean(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { list = []; }
  /* v37 [M22] re-price lazily (first paint/total) because shop.js, which owns priceIncGst, loads after this file */
  var repriced = false;
  function ensurePriced() { if (!repriced) { repriced = true; reprice(list); } }

  function changed() { persist(); chips.forEach(paintChip); if (drawer && drawer.classList.contains('show')) paintDrawer(); }
  function money(n) { n = Math.round(n * 100) / 100; return '$' + (n % 1 ? n.toFixed(2) : String(n)); } /* v37 [M22] whole dollars: "$X" not "$X.00" */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var Cart = {
    add: function (o) {
      if (!o) return;
      var sku = o.sku || (o.id ? 'HG-' + o.id : null);
      if (!sku) return;
      var q = Math.max(1, Math.floor(+o.qty) || 1);
      var ex = list.filter(function (i) { return i.sku === sku; })[0];
      if (ex) ex.qty = Math.min(99, ex.qty + q);
      else list.push({ sku: sku, name: o.name || sku, price: +o.price || 0, qty: Math.min(99, q), why: o.why || '', pricedAt: CAT_DATE /* v37 */ });
      if (window.Almanac) Almanac.seenSku(o.sku || sku);
      try { if (window.Sfx && Sfx.play) Sfx.play('cashRegister'); } catch (e) {}
      changed();
    },
    remove: function (sku) { list = list.filter(function (i) { return i.sku !== sku; }); changed(); },
    setQty: function (sku, qty) {
      qty = Math.floor(+qty) || 0;
      if (qty <= 0) return Cart.remove(sku);
      list.forEach(function (i) { if (i.sku === sku) i.qty = Math.min(99, qty); });
      changed();
    },
    items: function () { ensurePriced(); return list.map(function (i) { return Object.assign({}, i); }); },
    reprice: function () { repriced = true; reprice(list); changed(); },
    total: function () { ensurePriced(); return list.reduce(function (s, i) { return s + i.price * i.qty; }, 0); },
    count: function () { return list.reduce(function (s, i) { return s + i.qty; }, 0); },
    clear: function () { list = []; changed(); },
    /* replace the cart with save data (save wins over stale localStorage) */
    load: function (arr) { list = clean(arr); repriced = false; changed(); },
    toJSON: function () { return Cart.items(); },
    checkoutUrl: function () {
      var it = list.map(function (i) { return encodeURIComponent(i.sku) + ':' + i.qty; }).join(',');
      return BASE + '?items=' + it + '&utm_source=game&utm_medium=app&utm_campaign=cart';
    },
    button: function (sku, name, price, why) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cart-add'; b.textContent = 'Add to cart';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        Cart.add({ sku: sku, name: name, price: price, qty: 1, why: why });
        b.textContent = 'Added ✓';
        setTimeout(function () { b.textContent = 'Add to cart'; }, 1200);
      });
      ensureStyle();
      return b;
    },
    renderChip: function (el) {
      if (!el) return;
      ensureStyle();
      if (chips.indexOf(el) < 0) {
        chips.push(el);
        el.addEventListener('click', function () { Cart.openDrawer(); });
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Cart.openDrawer(); } });
      }
      el.classList.add('cart-chip');
      el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
      paintChip(el);
    },
    openDrawer: function () { build(); paintDrawer(); drawer.classList.add('show'); },
    closeDrawer: function () { if (drawer) drawer.classList.remove('show'); }
  };

  function paintChip(el) {
    var n = Cart.count();
    el.textContent = '🛒 ' + n + (n ? ' · ' + money(Cart.total()) : '');
    el.setAttribute('aria-label', 'Shopping cart, ' + n + ' items');
  }

  var styled = false;
  function ensureStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent =
      '.cart-chip{cursor:pointer;background:var(--panel);border:2px solid var(--line);border-radius:999px;padding:5px 12px;font-weight:800;color:var(--text);white-space:nowrap}' +
      '.cart-chip:hover{border-color:var(--orange)}' +
      '.cart-add{display:inline-block;margin-top:8px;margin-left:6px;background:var(--orange);color:var(--ink);font-weight:900;padding:5px 10px;border-radius:999px;border:2px solid var(--brown);cursor:pointer;font-family:inherit;font-size:inherit}' +
      '#cartDrawer .card{max-width:520px}#cartDrawer h2{margin:0 0 10px;font-family:var(--display)}' +
      '#cartDrawer .crow{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)}' +
      '#cartDrawer .cinfo{flex:1;min-width:0}#cartDrawer .cinfo b{display:block}#cartDrawer .cinfo small{color:var(--muted)}' +
      '#cartDrawer .cqty{display:flex;align-items:center;gap:6px}#cartDrawer .cqty button,#cartDrawer .crm{padding:2px 9px}' +
      '#cartDrawer .ctot{display:flex;justify-content:space-between;font-weight:900;font-size:18px;padding:12px 0}' +
      '#cartDrawer .cact{display:flex;gap:10px;flex-wrap:wrap;align-items:center}' +
      '#cartDrawer .big{text-decoration:none;display:inline-block}#cartDrawer .empty{color:var(--muted);padding:14px 0}' +
      '#cartDrawer .big.off{opacity:.4;pointer-events:none}';
    document.head.appendChild(st);
  }

  function build() {
    if (drawer) return;
    ensureStyle();
    drawer = document.createElement('div');
    drawer.id = 'cartDrawer'; drawer.className = 'modal';
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.setAttribute('aria-label', 'Shopping cart');
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer) return Cart.closeDrawer();
      if (e.target.closest('.cact a.big:not(.off)')) { try { Sfx.play('cashRegister'); } catch (x) {} return; }
      var t = e.target.closest('[data-c]'); if (!t) return;
      var sku = t.getAttribute('data-sku'), a = t.getAttribute('data-c');
      var it = list.filter(function (i) { return i.sku === sku; })[0];
      if (a === 'rm') Cart.remove(sku);
      else if (it && a === 'inc') Cart.setQty(sku, it.qty + 1);
      else if (it && a === 'dec') Cart.setQty(sku, it.qty - 1);
      else if (a === 'close') Cart.closeDrawer();
      /* v66 (round 15 keyboard M4): the drawer is repainted, so focus fell to the page body and the new quantity was silent. Focus goes back to the same button (or the next row, or Keep growing) and the change is announced */
      if (a !== 'close' && drawer.classList.contains('show') !== false) {
        var now = list.filter(function (i) { return i.sku === sku; })[0];
        var back = drawer.querySelector('[data-c="' + a + '"][data-sku="' + sku + '"]') || drawer.querySelector('[data-c="inc"]') || drawer.querySelector('[data-c="close"]');
        try { if (back) back.focus({ preventScroll: true }); } catch (e2) {}
        try { if (window.A11y && A11y.announce) A11y.announce(now ? now.name + ': ' + now.qty + ' in the cart.' : (it ? it.name + ' removed from the cart.' : 'Removed.')); } catch (e3) {}
      }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') Cart.closeDrawer(); });
    document.body.appendChild(drawer);
  }

  function paintDrawer() {
    ensurePriced(); /* v37 */
    var rows = list.map(function (i) {
      return '<div class="crow"><div class="cinfo"><b>' + esc(i.name) + '</b><small>' + money(i.price) + ' each' + (i.why ? ' · ' + esc(i.why) : '') + '</small></div>' +
        '<div class="cqty"><button class="ghost" data-c="dec" data-sku="' + esc(i.sku) + '" aria-label="Fewer: ' + esc(i.name) + '">-</button><b>' + i.qty + '</b>' +
        '<button class="ghost" data-c="inc" data-sku="' + esc(i.sku) + '" aria-label="More: ' + esc(i.name) + '">+</button></div>' +
        '<button class="ghost crm" data-c="rm" data-sku="' + esc(i.sku) + '" aria-label="Remove ' + esc(i.name) + '">✕</button></div>';
    }).join('');
    var has = list.length > 0;
    drawer.innerHTML = '<div class="card"><h2>Your cart</h2>' + (has ? rows : '<div class="empty">Nothing here yet. Add gear from the shop hints while you grow.</div>') +
      '<div class="ctot"><span>Total (AUD)</span><span>' + money(Cart.total()) + '</span></div><small class="cnote" style="color:var(--muted)">Estimate, inc GST, prices from the store catalogue ' + CAT_DATE + '</small>' + /* v37 [M22] */
      '<div class="cact"><a class="big' + (has ? '' : ' off') + '" href="' + esc(Cart.checkoutUrl()) + '" target="_blank" rel="noopener">Checkout at HyGrow</a>' +
      '<button class="ghost" data-c="close">Keep growing</button></div></div>';
  }

  window.Cart = Cart;
})();
