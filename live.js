/* HyGrow Grow Sim - "Live link": hook a real grow room up so the virtual plant reacts to live readings.
 * Global: window.LiveLink = {open(onConnected), chip(link), sources, mkRow, version}.
 * No dependencies (CsvImport is used for the Sheet/CSV source if present; mqtt.js is loaded lazily, only for MQTT).
 *
 * link = {id, name, start(onReading), stop(), probe(), status: 'connecting'|'live'|'error'|'stale',
 *         lastReading, lastError, lastAt, interval}
 * onReading(row) gets {t (epoch ms), air_temp_c, rh_pct, vpd_kpa, co2_ppm, ppfd_umol_m2_s, light_on, ec_mscm, ph,
 *                      water_temp_c, reservoir_l} - the Sim.attachClimate row schema (missing values are null).
 *
 * ENVIRONMENT NOTE: when the game is hosted inside a sandboxed preview, the browser may block outbound connections
 * (fetch / WebSocket). The Demo source always works (no network). Real sources work once the game is hosted on
 * HyGrow's own site / static hosting. Browsers also need the device or service to allow cross-origin (CORS) requests,
 * and an https page cannot call plain http:// addresses (mixed content) - except localhost. Chrome/Edge (Local Network
 * Access) additionally ask the user's permission before an https site may reach 127.0.0.1 or devices on the LAN; a
 * refused prompt looks like a network failure, so the "Could not reach" text says where to find it.
 *
 * STALE: a link is "stale" after link.staleMs without a newer reading (3 polls; 20 min for a Sheet/CSV, 5 min for MQTT).
 * Stale readings are kept for the chip and Test but are NOT passed to onReading, so the game stays on its own model
 * until a fresh reading arrives. MQTT sends nothing while the broker connection is down.
 * ADDRESSES: "host/path" gets the default scheme, "//host/path" too, and "/path", "./x", "../x" are resolved against the
 * page (a data file next to the game). Test hooks for node: LiveLink._t.
 *
 * SECRETS: tokens / passwords / keys are held in memory only, unless the grower ticks "Remember on this device"
 * (localStorage, wrapped in try/catch). "Forget" wipes everything stored for that source. Secrets are never put in
 * URLs: HA token and JSON auth go in the Authorization header, Pulse key in x-api-key, MQTT credentials in the MQTT
 * CONNECT packet (sent inside the wss connection, not in the URL). The only exception is a Sheet/CSV link itself,
 * which for "publish to web" is a public-by-link secret URL - the modal says so.
 */
(function (global) {
'use strict';

var NUM = ['air_temp_c', 'rh_pct', 'vpd_kpa', 'co2_ppm', 'ppfd_umol_m2_s', 'ec_mscm', 'ph', 'water_temp_c', 'reservoir_l'];
var FIELDS = ['air_temp_c', 'rh_pct', 'vpd_kpa', 'co2_ppm', 'ppfd_umol_m2_s', 'light_on', 'ec_mscm', 'ph', 'water_temp_c', 'reservoir_l'];
var LABEL = {air_temp_c: 'Air temp', rh_pct: 'Humidity', vpd_kpa: 'VPD', co2_ppm: 'CO₂', ppfd_umol_m2_s: 'Light (PPFD)', light_on: 'Lights on/off', ec_mscm: 'EC', ph: 'pH', water_temp_c: 'Water temp', reservoir_l: 'Reservoir (L)'};
var SHOWU = {air_temp_c: '°C', rh_pct: '%', vpd_kpa: ' kPa', co2_ppm: ' ppm', ppfd_umol_m2_s: ' µmol', ec_mscm: ' mS', ph: '', water_temp_c: '°C', reservoir_l: ' L'};
var RANGE = {air_temp_c: [-20, 60], rh_pct: [0, 105], vpd_kpa: [0, 8], co2_ppm: [100, 20000], ppfd_umol_m2_s: [0, 3500], ec_mscm: [0, 10], ph: [0, 14], water_temp_c: [0, 50], reservoir_l: [0, 100000]};
var TIMEOUT = 10000;
var MQTT_URLS = ['https://cdnjs.cloudflare.com/ajax/libs/mqtt/4.3.7/mqtt.min.js', 'https://cdn.jsdelivr.net/npm/mqtt@4.3.7/dist/mqtt.min.js'];
var MQTT_SRI = 'sha384-ZFaJg22VvVm4+3ZqY9eRIHGmqdEQb+c7XO+0IKspqdtPGFu6xRiPnK8xeNA//kQJ'; // both URLs serve identical bytes

/* ---------- helpers ---------- */
function el(tag, attrs, kids) {
  var e = document.createElement(tag), k;
  for (k in (attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
  (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
  return e;
}
function LLError(msg, kind) { var e = new Error(msg); e.name = 'LLError'; e.kind = kind || 'error'; return e; }
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function r(v, d) { var m = Math.pow(10, d); return Math.round(v * m) / m; }
function rnd(a) { return (Math.random() - 0.5) * 2 * a; }
function host(u) { try { return new URL(u).host; } catch (e) { return String(u).slice(0, 40); } }
function isLocal(u) { try { var h = new URL(u).hostname; return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'; } catch (e) { return false; } }
function mixed(u) { return location.protocol === 'https:' && /^(http|ws):\/\//i.test(u) && !isLocal(u); }
function pageBase() { try { return global.location && /^https?:$/.test(location.protocol) ? location.href : null; } catch (e) { return null; } }
/* Address typed by a grower -> absolute URL. "192.168.1.5/x" gets the default scheme; "//host/x" gets it too;
 * "/data/x.csv", "./x.csv" and "../x.csv" are resolved against the page (a data file hosted next to the game, or HA serving the game from /local/). */
function fixUrl(u, def, base) {
  u = String(u || '').trim(); if (!u) return u;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u;
  if (/^\/\//.test(u)) return (def || 'http') + ':' + u;
  if (/^(\.{1,2})?\/(?!\/)/.test(u)) {
    var b = base === undefined ? pageBase() : base;
    if (b) { try { var x = new URL(u, b); if (def === 'wss') x.protocol = x.protocol === 'https:' ? 'wss:' : 'ws:'; return x.href; } catch (e) {} }
    return u;
  }
  return (def || 'http') + '://' + u;
}
/* a secret hiding in the address itself (user:pass@host, ?token=..., ?api_key=...): kept out of storage unless the grower ticks "Remember" */
function urlHasSecret(u) {
  try {
    var x = new URL(u), bad = false;
    if (x.username || x.password) return true;
    x.searchParams.forEach(function (v, k) { if (/^(token|access[_-]?token|api[_-]?key|apikey|key|secret|password|pass|pwd|auth|authorization|bearer|sig|signature|x-api-key)$/i.test(k)) bad = true; });
    return bad;
  } catch (e) { return false; }
}
function cleanToken(t) { return String(t == null ? '' : t).replace(/^\s*bearer\s+/i, '').replace(/\s+/g, ''); } /* HA tokens are one unbroken string: drop pasted line breaks, spaces and a stray "Bearer " */
function cleanAuth(a) { return String(a == null ? '' : a).trim().replace(/^authorization\s*:\s*/i, ''); }
function badHeader(h) {
  for (var k in (h || {})) if (/[^\t\x20-\x7e]/.test(String(h[k]))) return 'The ' + (k.toLowerCase() === 'authorization' ? 'token / Authorization value' : 'API key') + ' contains a character that cannot go in a web header (usually a curly quote or a line break from copy and paste). Copy it again as plain text.';
  return null;
}
function localNetHost(h) {
  h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /\.(local|lan|home|internal|localdomain)$/.test(h) || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || /^(fc|fd|fe80)/.test(h) || (h.indexOf('.') < 0 && h.indexOf(':') < 0);
}
/* "Could not reach" text. o: {https: page is https, hasAuth: request carries an Authorization header} */
function netMsg(url, kind, o) {
  o = o || {}; var hostname = ''; try { hostname = new URL(url).hostname; } catch (e) {}
  var c = ['the address is wrong or the device is off',
    'the server does not allow browser access (CORS)' + (kind === 'ha' ? ' - add this page to cors_allowed_origins (see the hint above)' : '')];
  if (o.hasAuth && kind !== 'ha') c.push('an Authorization header makes the browser send an OPTIONS "preflight" request first, and the device must answer it with 204 and Access-Control-Allow-Headers: authorization (many small devices cannot, so try it without the header, or put a proxy in front)');
  c.push('this page is https but the address is http (browsers block that)');
  if (o.https && localNetHost(hostname)) c.push('Chrome and Edge ask permission before a website can reach this computer or devices on your own network: look for a "Local network access" or "Access other apps and services on this device" prompt near the address bar and choose Allow (if you refused it before, click the padlock > Site settings and allow it)');
  c.push('the game is open in a sandboxed preview that blocks outside connections - use the Demo source there, or host the game on HyGrow\'s site');
  return 'Could not reach ' + host(url) + '. Usual causes: ' + c.map(function (t, i) { return '(' + (i + 1) + ') ' + t; }).join('; ') + '.';
}

/* ---------- value parsing / unit conversion ---------- */
function parseOnOff(x) {
  if (x === true || x === 1) return 1; if (x === false || x === 0) return 0;
  if (typeof x !== 'string') return null;
  x = x.trim().toLowerCase();
  if (/^(on|true|yes|1|open|home)$/.test(x)) return 1;
  if (/^(off|false|no|0|closed|not_home)$/.test(x)) return 0;
  return null;
}
function detectUnit(s) {
  s = String(s || '').replace(/[µμ]/g, 'u').replace(/°/g, '').trim().toLowerCase();
  if (!s) return null;
  if (/^f$|fahrenheit/.test(s)) return 'f';
  if (/^c$|celsius/.test(s)) return 'c';
  if (/^us\/?cm|^usiemens/.test(s)) return 'us';
  if (/^ms\/?cm/.test(s)) return 'ms';
  if (/^ppm/.test(s)) return 'ppm';
  if (/^kpa/.test(s)) return 'kpa';
  if (/^hpa|^mbar/.test(s)) return 'hpa';
  if (/^pa$/.test(s)) return 'pa';
  if (/^(gal|gallon)/.test(s)) return 'gal';
  if (/^ml$/.test(s)) return 'ml';
  return null;
}
function parseVal(x) {
  if (x == null || x === '') return {v: null};
  if (typeof x === 'number') return {v: isFinite(x) ? x : null};
  if (typeof x === 'boolean') return {v: x ? 1 : 0};
  var m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(.*)$/i.exec(String(x));
  return m ? {v: parseFloat(m[1]), u: detectUnit(m[2])} : {v: null};
}
function conv(f, v, u, U) {
  u = u || null;
  if (f === 'air_temp_c' || f === 'water_temp_c') {
    if (!u && U.temp !== 'f' && v > 50 && v <= 140) u = 'f'; // nobody grows at 50C+, so an unlabelled 78 must be Fahrenheit
    return (u || U.temp) === 'f' ? (v - 32) * 5 / 9 : v;
  }
  if (f === 'ec_mscm') {
    u = u || U.ec || 'ms';
    if (u === 'ppm') u = /^ppm/.test(U.ec || '') ? U.ec : 'ppm500';
    return u === 'us' ? v / 1000 : u === 'ppm500' ? v / 500 : u === 'ppm700' ? v / 700 : v;
  }
  if (f === 'vpd_kpa') return u === 'pa' ? v / 1000 : u === 'hpa' ? v / 10 : v;
  if (f === 'reservoir_l') return u === 'gal' ? v * 3.78541 : u === 'ml' ? v / 1000 : v;
  if (f === 'rh_pct' && u === 'frac') return v * 100;
  return v;
}
function svp(t) { return 0.6108 * Math.exp(17.27 * t / (t + 237.3)); }
function finish(o) {
  if (o.vpd_kpa == null && o.air_temp_c != null && o.rh_pct != null) o.vpd_kpa = r(svp(o.air_temp_c) * (1 - Math.min(o.rh_pct, 100) / 100), 3);
  if (o.light_on == null && o.ppfd_umol_m2_s != null) o.light_on = o.ppfd_umol_m2_s >= 50 ? 1 : 0;
  return o;
}
/* vals: {field: number|string|bool|{v,u}}; U: {temp:'c'|'f', ec:'ms'|'us'|'ppm500'|'ppm700'}; t: epoch ms */
function mkRow(vals, U, t, warn) {
  U = U || {}; var o = {t: isFinite(t) && t ? t : Date.now()};
  NUM.forEach(function (f) {
    o[f] = null; var x = vals[f], u = null; if (x == null) return;
    if (typeof x === 'object') { u = x.u; x = x.v; }
    var p = parseVal(x); if (p.v == null) return;
    var v = conv(f, p.v, u || p.u, U), rg = RANGE[f];
    if (!isFinite(v) || v < rg[0] || v > rg[1]) { if (warn) warn.push(LABEL[f] + ' value ' + p.v + ' looked wrong (out of range) and was ignored'); return; }
    if (f === 'rh_pct' && v > 100) v = 100;
    o[f] = f === 'co2_ppm' ? Math.round(v) : r(v, 3);
  });
  var lo = vals.light_on; if (lo && typeof lo === 'object') lo = lo.v;
  var oo = parseOnOff(lo); if (oo == null && lo != null && lo !== '') { var pl = parseVal(lo); oo = pl.v == null ? null : (pl.v > 0 ? 1 : 0); }
  o.light_on = oo;
  return finish(o);
}
function hasData(row) { return NUM.some(function (f) { return row[f] != null; }); }
var NODATA = 'Connected, but none of the mapped fields gave a number. Check the field mapping (and that the sensors are not "unavailable").';

/* ---------- network ---------- */
function fetchT(url, opts, sig, kind) {
  var c = new AbortController(), timed = false, t = setTimeout(function () { timed = true; c.abort(); }, TIMEOUT);
  if (sig) { if (sig.aborted) c.abort(); else sig.addEventListener('abort', function () { c.abort(); }); }
  opts = opts || {}; opts.signal = c.signal;
  var hb = badHeader(opts.headers); if (hb) { clearTimeout(t); return Promise.reject(LLError(hb, 'auth')); }
  return fetch(url, opts).then(function (res) { clearTimeout(t); return httpOk(res, kind, url); }, function (e) {
    clearTimeout(t);
    if (timed) throw LLError(host(url) + ' did not answer within ' + TIMEOUT / 1000 + ' s. Check that it is powered on and reachable from this device.', 'timeout');
    if (e && e.name === 'AbortError') throw LLError('Stopped.', 'abort');
    throw LLError(netMsg(url, kind, {https: !!global.location && location.protocol === 'https:', hasAuth: !!(opts.headers && (opts.headers.Authorization || opts.headers['x-api-key']))}), 'network');
  });
}
function httpOk(res, kind, url) {
  if (res.ok) return res;
  var s = res.status, h = host(url);
  if (s === 401 || s === 403) throw LLError(kind === 'ha' ? 'Home Assistant rejected the token (' + s + '). Make a new Long-Lived Access Token (HA profile page, bottom) and paste it again.' :
    kind === 'pulse' ? 'Pulse rejected the API key (' + s + '). Check the key is copied in full and still active in your Pulse account.' :
    h + ' wants a login (' + s + '). Put the full header value (for example "Bearer abc...") in the Authorization box.', 'auth');
  if (s === 404) throw LLError(kind === 'ha' ? 'Home Assistant answered but /api/states was not found (404). Use the base address, like http://homeassistant.local:8123 (no /lovelace or /dashboard on the end).' : 'Nothing at that address (404). Check the URL and path.', 'notfound');
  if (s === 429) throw LLError('Too many requests (429). Raise the poll interval.', 'rate');
  throw LLError(h + ' returned an error (' + s + ').', 'http');
}
function fetchJSON(url, opts, sig, kind) {
  return fetchT(url, opts, sig, kind).then(function (res) {
    return res.text().then(function (txt) {
      try { return JSON.parse(txt); } catch (e) { throw LLError('That address did not return JSON (it looks like ' + (/^\s*</.test(txt) ? 'a web page' : 'something else') + '). Point it at the data endpoint, not a web page.', 'format'); }
    });
  });
}
function getPath(o, p) {
  if (!p) return undefined;
  p = String(p).trim().replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1');
  var parts = p.split('.'), i;
  for (i = 0; i < parts.length && o != null; i++) o = o[parts[i]];
  return o;
}
function flatten(o, pre, out, d) {
  out = out || []; d = d || 0; pre = pre || '';
  if (d > 6 || out.length > 200) return out;
  if (o && typeof o === 'object') {
    Object.keys(o).slice(0, 40).forEach(function (k) {
      if (Array.isArray(o) && +k > 7) return;
      flatten(o[k], pre ? pre + '.' + k : k, out, d + 1);
    });
  } else if (pre && o != null && (typeof o === 'number' || typeof o === 'boolean' || (typeof o === 'string' && (parseVal(o).v != null || parseOnOff(o) != null)))) out.push({path: pre, val: o});
  return out;
}

/* ---------- field-name guessing (HA entities, JSON paths, CSV headers) ---------- */
var KW = {
  air_temp_c: {re: /temp/, no: /water|solution|soln|reservoir|root|tank|nutrient|dew|setpoint|target|cpu|probe/, cls: 'temperature'},
  rh_pct: {re: /humid|(^|[^a-z])rh($|[^a-z])/, no: /soil|moisture|setpoint|target/, cls: 'humidity'},
  vpd_kpa: {re: /vpd|vap(o|ou)r/, unit: /kpa/},
  co2_ppm: {re: /co2|carbon/, cls: 'carbon_dioxide'},
  ppfd_umol_m2_s: {re: /ppfd|(^|[^a-z])par($|[^a-z])|umol|µmol|light.?intens|irradian/, unit: /mol/},
  light_on: {re: /light|lamp|led|grow|photoperiod/, no: /intens|level|ppfd|lux|brightness|temp/},
  ec_mscm: {re: /(^|[^a-z])(ec|tds|cf)($|[^a-z])|conductiv|nutrient|salin/, no: /temp/, cls: 'conductivity', unit: /s\/cm/},
  ph: {re: /(^|[^a-z])ph($|[^a-z])/, cls: 'ph', unit: /^ph$/},
  water_temp_c: {re: /(water|solution|soln|reservoir|root|tank|nutrient).*temp|temp.*(water|solution|soln|reservoir|root|tank|nutrient)/, cls: 'temperature'},
  reservoir_l: {re: /(reservoir|tank|water).*(level|volume|litre|liter)|volume/, unit: /^(l|liters|litres|gal)$/}
};
function score(f, text, cls, unit) {
  var k = KW[f], s = 0; text = String(text || '').toLowerCase().replace(/[_\-]/g, ' ').replace(/\./g, ' ');
  if (k.re.test(text)) s += 3;
  if (k.cls && cls === k.cls) s += (s ? 3 : 1.5);
  if (k.unit && unit && k.unit.test(String(unit).toLowerCase())) s += 2;
  if (k.no && k.no.test(text)) s -= 5;
  if (f === 'air_temp_c' && cls === 'temperature' && s <= 0 && !(k.no && k.no.test(text))) s = 3;
  return s;
}
/* cands: [{key, text, cls, unit}] -> {field: key}; greedy best-first, no key used twice */
function suggest(cands, fields) {
  var pairs = [], used = {}, out = {};
  fields.forEach(function (f) { cands.forEach(function (c) { var s = score(f, c.text, c.cls, c.unit); if (s >= 3) pairs.push({f: f, c: c, s: s}); }); });
  pairs.sort(function (a, b) { return b.s - a.s; });
  pairs.forEach(function (p) { if (!out[p.f] && !used[p.c.key]) { out[p.f] = p.c.key; used[p.c.key] = 1; } });
  return out;
}

/* ---------- link engine ---------- */
/* def: {id, name, interval, poll(ctx)->Promise<{vals, t}> | run(emit, fail)->stop, probe?, dataTime?, units, beta} */
function makeLink(def) {
  var L = {id: def.id, name: def.name, beta: !!def.beta, interval: def.interval, staleMs: def.staleMs || 3 * def.interval, status: 'connecting', lastReading: null, lastError: null, lastWarning: null, lastAt: 0};
  var cb = null, running = false, timer = null, sTimer = null, ctl = null, stopRun = null, fails = 0;
  function setStatus(s) { if (L.status !== s) { L.status = s; if (L.onStatus) { try { L.onStatus(s); } catch (e) {} } } }
  function accept(res, at) {
    var warn = [], row = mkRow(res.vals, def.units, res.t, warn);
    if (!hasData(row)) throw LLError(NODATA, 'nodata');
    L.lastWarning = warn.length ? warn.join('; ') : null; fails = 0; L.lastError = null; L.lastReading = row;
    L.lastAt = Math.min(def.dataTime && res.t ? res.t : (at || Date.now()), Date.now());
    var stale = Date.now() - L.lastAt > L.staleMs;
    setStatus(stale ? 'stale' : 'live');
    /* an out-of-date reading is remembered (chip, Test) but never handed to the game: the game switches to its own model while the link is stale, and a stale row must not switch it back on */
    if (cb && !stale) { try { cb(row); } catch (e) { if (global.console) console.error(e); } }
    return row;
  }
  function fail(e) {
    if (!running || (e && e.kind === 'abort')) return;
    fails++; L.lastError = (e && e.message) || String(e); setStatus('error');
  }
  function tick() {
    if (!running) return;
    ctl = new AbortController();
    Promise.resolve().then(function () { return def.poll({signal: ctl.signal}); }).then(function (res) {
      if (!running) return; accept(res); next(L.interval);
    }).catch(function (e) {
      if (!running) return; fail(e); next(Math.min(L.interval, 2000 * Math.pow(2, Math.min(fails, 10) - 1)));
    });
  }
  function next(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
  L.start = function (onReading) {
    cb = onReading || null; if (running) return L;
    running = true; fails = 0; L.lastError = null; setStatus('connecting');
    sTimer = setInterval(function () { if (L.status === 'live' && Date.now() - L.lastAt > L.staleMs) setStatus('stale'); }, 1000);
    if (def.run) stopRun = def.run(function (res, at) { if (running) { try { accept(res, at); } catch (e) { fail(e); } } }, fail);
    else tick();
    return L;
  };
  L.stop = function () {
    running = false; clearTimeout(timer); clearInterval(sTimer); if (ctl) { try { ctl.abort(); } catch (e) {} }
    if (stopRun) { try { stopRun(); } catch (e) {} stopRun = null; }
    return L;
  };
  /* one-off read for "Test"; does not touch status or callbacks */
  L.probe = function () {
    var p = def.probe ? def.probe() : Promise.resolve().then(function () { return def.poll({}); });
    return p.then(function (res) {
      var warn = [], row = mkRow(res.vals, def.units, res.t, warn);
      if (!hasData(row)) throw LLError(NODATA, 'nodata');
      if (def.dataTime && res.t && Date.now() - res.t > L.staleMs) warn.push('the newest row is ' + Math.round((Date.now() - res.t) / 60000) + ' min old, so the game will show this link as stale and use its own model until the sheet gets a newer row');
      row._warn = warn; return row;
    });
  };
  return L;
}

/* ---------- source 1: Demo sensor ---------- */
function demoDef() {
  var simMin = 10 * 60, airT = 24.5, ph = 5.85, res = 40, ec = 1.8, wt = 21.5, heat = 0, co2 = 800, ev = '';
  return {id: 'demo', name: 'Demo sensor', interval: 5000, units: {}, poll: function () {
    simMin = (simMin + 10) % 1440; // one 5 s poll = 10 simulated minutes, so a whole day passes in 12 minutes
    var on = simMin >= 360 && simMin < 1440, tgt = on ? 25.2 : 20.5;
    if (!heat && Math.random() < 0.025) heat = 7; // heat spike event
    var add = heat ? 7 * Math.sin(Math.PI * (7 - heat + 1) / 8) : 0; if (heat) heat--;
    airT += (tgt + add - airT) * 0.35 + rnd(0.15);
    ph += 0.004 + Math.random() * 0.004; if (Math.random() < 0.02) ph += 0.35; if (ph > 6.9) ph = 5.85; // pH drift event, then "dosed down"
    res -= 0.02; ec += 0.002; if (res < 30) { res = 40; ec = 1.8; }
    wt += (airT - 2 - wt) * 0.05;
    co2 += ((on ? 850 : 520) - co2) * 0.3 + rnd(12);
    var rh = Math.max(35, Math.min(85, (on ? 60 : 67) - 0.9 * (airT - tgt) + rnd(1.2)));
    return {t: Date.now(), vals: {air_temp_c: r(airT, 2), rh_pct: r(rh, 1), co2_ppm: co2, ppfd_umol_m2_s: on ? r(650 + rnd(12), 0) : 0, light_on: on ? 1 : 0, ec_mscm: r(ec + rnd(0.01), 2), ph: r(ph + rnd(0.01), 2), water_temp_c: r(wt, 1), reservoir_l: r(res, 1)}};
  }};
}

/* ---------- source 2: Home Assistant ---------- */
function haDef(c) {
  var base = fixUrl(c.url).replace(/\/+$/, '').replace(/\/(api|lovelace|dashboard)(\/.*)?$/, '');
  return {id: 'ha', name: 'Home Assistant', interval: c.interval * 1000, units: {temp: c.tempUnit, ec: c.ecUnit}, poll: function (ctx) {
    return fetchJSON(base + '/api/states', {headers: {Authorization: 'Bearer ' + c.token}, cache: 'no-store'}, ctx.signal, 'ha').then(function (list) {
      if (!Array.isArray(list)) throw LLError('That did not look like Home Assistant (/api/states should return a list).', 'format');
      var by = {}, vals = {}; list.forEach(function (s) { by[s.entity_id] = s; });
      FIELDS.forEach(function (f) {
        var s = by[c.map[f]]; if (!s || /^(unavailable|unknown|none)$/i.test(s.state)) return;
        vals[f] = f === 'light_on' ? s.state : {v: s.state, u: detectUnit(s.attributes && s.attributes.unit_of_measurement)};
      });
      return {vals: vals, t: Date.now()};
    });
  }};
}
function haLoad(c, sig) {
  var base = fixUrl(c.url).replace(/\/+$/, '').replace(/\/(api|lovelace|dashboard)(\/.*)?$/, '');
  return fetchJSON(base + '/api/states', {headers: {Authorization: 'Bearer ' + c.token}, cache: 'no-store'}, sig, 'ha').then(function (list) {
    if (!Array.isArray(list)) throw LLError('That did not look like Home Assistant (/api/states should return a list).', 'format');
    return list.filter(function (s) { return /^(sensor|binary_sensor|light|switch|input_number|number)\./.test(s.entity_id); }).map(function (s) {
      var a = s.attributes || {};
      return {key: s.entity_id, name: a.friendly_name || s.entity_id, state: s.state, unit: a.unit_of_measurement || '', cls: a.device_class || '', text: s.entity_id + ' ' + (a.friendly_name || ''), dom: s.entity_id.split('.')[0]};
    });
  });
}

/* ---------- source 3: generic JSON URL ---------- */
function jsonDef(c) {
  var url = fixUrl(c.url), d = {id: 'json', name: 'JSON URL', interval: c.interval * 1000, units: {temp: c.tempUnit, ec: c.ecUnit}};
  d.poll = function (ctx) {
    var h = {}; if (c.auth) h.Authorization = c.auth;
    return fetchJSON(url, {headers: h, cache: 'no-store'}, ctx.signal, 'json').then(function (js) {
      d.raw = js; var vals = {};
      FIELDS.forEach(function (f) { var p = c.map[f]; if (p) { var x = getPath(js, p); if (x != null && typeof x !== 'object') vals[f] = x; } });
      return {vals: vals, t: Date.now()};
    });
  };
  return d;
}

/* ---------- source 4: published Google Sheet / CSV ---------- */
function csvUrl(u) {
  u = fixUrl(u, 'https');
  var m = /^(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)\/pubhtml/.exec(u);
  if (m) return m[1] + '/pub?output=csv';
  m = /^(https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+)\/(edit|view)/.exec(u);
  if (m) return m[1] + '/export?format=csv' + (/gid=(\d+)/.exec(u) ? '&gid=' + /gid=(\d+)/.exec(u)[1] : '');
  return u;
}
function splitCsv(text) {
  var delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  return text.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (l) {
    var out = [], cur = '', q = false, i, ch;
    for (i = 0; i < l.length; i++) { ch = l.charAt(i); if (q) { if (ch === '"') { if (l.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === delim) { out.push(cur.trim()); cur = ''; } else cur += ch; }
    out.push(cur.trim()); return out;
  });
}
/* newest row that carries a reading; rows stamped in the future (a pre-filled sheet, a wrong time zone) lose to any row up to 5 min ahead of now */
function newestWithData(rows, now) {
  var withData = rows.filter(hasData); if (!withData.length) return null;
  var ok = withData.filter(function (x) { return x.t <= now + 5 * 60e3; }), pool = ok.length ? ok : withData;
  return pool.reduce(function (a, b) { return b.t > a.t ? b : a; });
}
function csvLatest(text, units) {
  var C = global.CsvImport, p, g, n, rows, best, vals = {};
  if (C && C.parse && C.guessMapping && C.normalise) {
    p = C.parse(text); if (!p.headers.length || p.rows.length < 1) throw LLError('That link did not return a CSV with readings. For Google Sheets use File > Share > Publish to web > pick the sheet > CSV.', 'format');
    g = C.guessMapping(p.headers, p.rows, p.meta);
    if (g.mapping.timestamp == null) throw LLError('Could not find a timestamp column in the sheet (add a header like "timestamp" or "date/time").', 'format');
    var tz = {tzOffsetMinutes: -new Date().getTimezoneOffset()}, now = Date.now();
    n = C.normalise(p, g.mapping, g.units, tz);
    rows = n.rows; if (!rows.length) throw LLError('The sheet has no rows with a readable date/time.', 'format');
    best = newestWithData(rows, now);
    /* 5/11/2026 could be 5 Nov or 11 May. When the dates carry no day above 12 and the newest row lands more than 36 h from now, try the other reading and keep it if it lands near now */
    if (n.stats && n.stats.ambiguousDates && (!best || Math.abs(now - best.t) > 36 * 3600e3)) {
      var n2 = C.normalise(p, g.mapping, g.units, {tzOffsetMinutes: tz.tzOffsetMinutes, dayFirst: !n.stats.dayFirst}), b2 = n2.rows.length ? newestWithData(n2.rows, now) : null;
      if (b2 && (!best || Math.abs(now - b2.t) < Math.abs(now - best.t))) best = b2;
    }
    if (!best) throw LLError(NODATA, 'nodata');
    NUM.forEach(function (f) { if (best[f] != null) vals[f] = {v: best[f], u: f === 'rh_pct' ? 'pct' : f === 'ec_mscm' ? 'ms' : f === 'vpd_kpa' ? 'kpa' : (f === 'air_temp_c' || f === 'water_temp_c') ? 'c' : null}; });
    if (best.light_on != null) vals.light_on = best.light_on;
    return {vals: vals, t: best.t};
  }
  var tab = splitCsv(text); if (tab.length < 2) throw LLError('That link did not return a CSV with readings.', 'format');
  var hd = tab[0], last = tab[tab.length - 1], cands = hd.map(function (h, i) { return {key: i, text: h}; });
  var sg = suggest(cands, FIELDS.filter(function (f) { return f !== 'light_on'; })), t = NaN, ti = -1;
  hd.forEach(function (h, i) { if (ti < 0 && /time|date/i.test(h)) ti = i; });
  if (ti >= 0) t = Date.parse(last[ti]);
  Object.keys(sg).forEach(function (f) { vals[f] = last[sg[f]]; });
  return {vals: vals, t: t};
}
function csvDef(c) {
  var url = csvUrl(c.url);
  /* a published sheet refreshes about every 5 min and loggers write a row every few minutes, so "stale" means 20 min without a newer row, not 3 polls */
  return {id: 'csv', name: 'Sheet / CSV', interval: c.interval * 1000, staleMs: Math.max(3 * c.interval * 1000, 20 * 60e3), dataTime: true, units: {temp: c.tempUnit, ec: c.ecUnit}, poll: function (ctx) {
    return fetchT(url, {cache: 'no-store'}, ctx.signal, 'csv').then(function (res) { return res.text(); }).then(function (txt) {
      if (/^\s*<(!doctype|html)/i.test(txt)) throw LLError('The link returned a web page, not CSV. In Google Sheets: File > Share > Publish to web > choose the sheet and "Comma-separated values (.csv)" and use that link.', 'format');
      return csvLatest(txt, {});
    });
  }};
}

/* ---------- source 5: MQTT over WebSockets ---------- */
var mqttP = null;
function loadMqtt() {
  if (global.mqtt) return Promise.resolve(global.mqtt);
  if (mqttP) return mqttP;
  function tryUrl(i) {
    return new Promise(function (ok, bad) {
      if (i >= MQTT_URLS.length) return bad(LLError('Could not load the MQTT helper library (mqtt.js) from cdnjs or jsDelivr. Check your internet connection, and that this page (or its Content-Security-Policy) allows scripts from cdnjs.cloudflare.com and cdn.jsdelivr.net.', 'network'));
      var s = document.createElement('script'); s.src = MQTT_URLS[i]; s.integrity = MQTT_SRI; s.crossOrigin = 'anonymous'; s.async = true;
      s.onload = function () { global.mqtt ? ok(global.mqtt) : tryUrl(i + 1).then(ok, bad); };
      s.onerror = function () { s.remove(); tryUrl(i + 1).then(ok, bad); };
      document.head.appendChild(s);
    });
  }
  mqttP = tryUrl(0); mqttP.catch(function () { mqttP = null; });
  return mqttP;
}
/* every mapped field has had a value: the Test/Connect probe need not wait for the rest of its 4 s window */
function allMapped(map, cache) { var n = 0, ok = true; FIELDS.forEach(function (f) { if (map[f]) { n++; if (cache[f] == null) ok = false; } }); return n > 0 && ok; }
function topicMatch(filter, topic) {
  if (filter === topic) return true;
  var f = filter.split('/'), t = topic.split('/'), i;
  for (i = 0; i < f.length; i++) { if (f[i] === '#') return true; if (i >= t.length || (f[i] !== '+' && f[i] !== t[i])) return false; }
  return f.length === t.length;
}
function mqttFriendly(e) {
  var m = (e && e.message) || String(e);
  if (/not authori|bad user|code (4|5)\b|refused/i.test(m)) return 'The broker refused the login (' + m + '). Check username and password, and that this user may subscribe to those topics.';
  return 'MQTT problem: ' + m + '. Check the broker address (wss://host:port/mqtt - the path matters), that WebSockets are enabled on the broker, and that its TLS certificate is valid.';
}
function mqttSession(c, onVals, onErr) {
  var u = fixUrl(c.url, 'wss'), cache = {}, client = null, ended = false;
  function endIt() { ended = true; try { client.end(true); } catch (e) {} }
  if (!/^wss?:\/\//i.test(u)) return Promise.reject(LLError('The broker address must start with wss:// (or ws://). Plain mqtt:// and tcp:// do not work in a browser.', 'format'));
  if (mixed(u)) return Promise.reject(LLError('This page is https, so the browser only allows wss:// (not ws://) brokers.', 'network'));
  return loadMqtt().then(function (mqtt) {
    var topics = {}; FIELDS.forEach(function (f) { if (c.map[f]) topics[c.map[f]] = 1; });
    if (!Object.keys(topics).length) throw LLError('Enter at least one topic.', 'format');
    client = mqtt.connect(u, {username: c.user || undefined, password: c.pass || undefined, clean: true, connectTimeout: TIMEOUT, reconnectPeriod: 5000, clientId: 'hygrow_' + Math.random().toString(16).slice(2, 10)});
    client.on('connect', function () { client.subscribe(Object.keys(topics), function (err) { if (err) onErr(LLError('Could not subscribe: ' + err.message, 'auth')); }); });
    client.on('error', function (e) { onErr(LLError(mqttFriendly(e), 'network')); });
    client.on('close', function () { if (!ended && !client.connected) onErr(LLError(mqttFriendly({message: 'could not open the WebSocket'}), 'network')); });
    client.on('message', function (topic, payload) {
      var txt = String(payload), js, x;
      try { js = JSON.parse(txt); } catch (e) { js = txt; }
      FIELDS.forEach(function (f) {
        if (!c.map[f] || !topicMatch(c.map[f], topic)) return;
        x = c.path[f] ? getPath(js, c.path[f]) : js;
        if (x != null && typeof x !== 'object') { cache[f] = x; cache._t = Date.now(); }
      });
      onVals(cache);
    });
    return {cache: cache, end: endIt, connected: function () { return !!client && client.connected; }};
  });
}
function mqttDef(c) {
  /* a Zigbee/ESP sensor may stay quiet for minutes: the link only goes stale after 5 min without a message (or 3 sends, if that is longer) */
  var d = {id: 'mqtt', name: 'MQTT', interval: c.interval * 1000, staleMs: Math.max(3 * c.interval * 1000, 300000), units: {temp: c.tempUnit, ec: c.ecUnit}};
  d.run = function (emit, fail) {
    var s = null, tm = null, stopped = false;
    mqttSession(c, function () {}, fail).then(function (ss) {
      if (stopped) return ss.end(); s = ss;
      tm = setInterval(function () { /* nothing is sent while the broker connection is down: the cached values would pose as live readings */ if (ss.cache._t && ss.connected()) { var v = {}; FIELDS.forEach(function (f) { if (ss.cache[f] != null) v[f] = ss.cache[f]; }); emit({vals: v, t: Date.now()}, ss.cache._t); } }, d.interval);
    }, fail);
    return function () { stopped = true; clearInterval(tm); if (s) s.end(); };
  };
  d.probe = function () {
    return new Promise(function (ok, bad) {
      var ss = null, first = 0, done = false, to = setTimeout(function () { fin(); }, 12000), errs = null;
      function fin() {
        if (done) return; done = true; clearTimeout(to); if (ss) ss.end();
        if (ss && ss.cache._t) { var v = {}; FIELDS.forEach(function (f) { if (ss.cache[f] != null) v[f] = ss.cache[f]; }); ok({vals: v, t: Date.now()}); }
        else bad(errs || LLError('Connected to the broker but no messages arrived within 12 s. Check the topics (and that the device publishes, or retained messages exist).', 'timeout'));
      }
      mqttSession(c, function (cache) { if (!first) first = setTimeout(fin, 4000); if (allMapped(c.map, cache)) { clearTimeout(first); first = setTimeout(fin, 250); } }, function (e) { errs = e; if (!ss || !ss.cache._t) { if (!done) { done = true; clearTimeout(to); if (ss) ss.end(); bad(e); } } }).then(function (s) { ss = s; if (done) s.end(); }, function (e) { if (!done) { done = true; clearTimeout(to); bad(e); } });
    });
  };
  return d;
}

/* ---------- source 6: Pulse Grow cloud API (BETA) ---------- */
/* Endpoints from Pulse's published OpenAPI spec: GET /devices/details, GET /devices/{id}/recent-data (PublicApiDataPoint:
 * createdAt, temperatureC/F, humidityRh, vpd, co2, lightLux, lightCalculationReading.ppfd). The auth header name (x-api-key)
 * and CORS behaviour for browsers could not be confirmed from the public docs, hence "beta". */
var PULSE = 'https://api.pulsegrow.com';
function pulseVals(dp) {
  var lc = dp.lightCalculationReading, v = {};
  if (dp.temperatureC != null) v.air_temp_c = dp.temperatureC; else if (dp.temperatureF != null) v.air_temp_c = {v: dp.temperatureF, u: 'f'};
  if (dp.humidityRh != null) v.rh_pct = dp.humidityRh;
  if (dp.vpd != null) v.vpd_kpa = dp.vpd;
  if (dp.co2 != null && dp.co2 > 0) v.co2_ppm = dp.co2;
  if (lc && lc.ppfd != null) v.ppfd_umol_m2_s = lc.ppfd; else if (dp.lightLux != null) v.ppfd_umol_m2_s = dp.lightLux * 0.0185; // rough lux->PPFD for white LED, only if no PPFD
  var t = Date.parse(/(z|[+-]\d\d:?\d\d)$/i.test(dp.createdAt || '') ? dp.createdAt : (dp.createdAt || '') + 'Z');
  return {vals: v, t: isFinite(t) ? t : Date.now()};
}
function pulseDevices(key, sig) {
  return fetchJSON(PULSE + '/devices/details', {headers: {'x-api-key': key}, cache: 'no-store'}, sig, 'pulse').then(function (a) {
    if (!Array.isArray(a)) throw LLError('Pulse answered, but not with a device list. This API is in beta - please tell us what you see.', 'format');
    return a;
  });
}
function pulseDef(c) {
  return {id: 'pulse', name: 'Pulse Grow', beta: true, interval: c.interval * 1000, units: {}, poll: function (ctx) {
    var hd = {headers: {'x-api-key': c.key}, cache: 'no-store'};
    function fromDevice(dev) { var dp = dev.recentDataPoint || dev.lastDataPoint || dev.latestData; return dp ? pulseVals(dp) : fetchJSON(PULSE + '/devices/' + dev.id + '/recent-data', hd, ctx.signal, 'pulse').then(pulseVals); }
    if (c.device) return fetchJSON(PULSE + '/devices/' + encodeURIComponent(c.device) + '/recent-data', hd, ctx.signal, 'pulse').then(pulseVals);
    return pulseDevices(c.key, ctx.signal).then(function (a) { if (!a.length) throw LLError('No Pulse devices on this account.', 'nodata'); return fromDevice(a[0]); });
  }};
}

/* ---------- source table ---------- */
var UNITS = [{k: 'tempUnit', label: 'Temperature unit (if not stated)', type: 'select', opts: [['c', '°C'], ['f', '°F (converted to °C)']], def: 'c'},
  {k: 'ecUnit', label: 'EC / TDS unit (if not stated)', type: 'select', opts: [['ms', 'mS/cm'], ['us', 'µS/cm'], ['ppm500', 'ppm (TDS, 500 scale)'], ['ppm700', 'ppm (TDS, 700 scale)']], def: 'ms',
    help: '500 scale (NaCl) is the common one; 700 scale (KCl) is used by some Bluelab/Truncheon meters.'}];
var sources = [
  {id: 'demo', label: 'Demo sensor', blurb: 'Fake tent readings every 5 s with a day/night cycle, drift and the odd heat spike. Always works.', fields: [], make: demoDef,
    note: 'No setup. A whole 24 h day plays out in about 12 minutes, with the occasional heat spike and pH drift so you can see the plant react.'},
  {id: 'ha', label: 'Home Assistant', blurb: 'ESPHome, AC Infinity, TrolMaster and more through your Home Assistant.', secrets: ['token'], map: 'entity', make: haDef, load: haLoad,
    fields: [{k: 'url', label: 'Home Assistant address', ph: 'http://homeassistant.local:8123', help: 'The base address you open in the browser, no /lovelace on the end.'},
      {k: 'token', label: 'Long-lived access token', type: 'password', secret: true, help: 'HA profile page > Security > Long-lived access tokens. Sent only as an Authorization header, never in the URL.'},
      {k: 'interval', label: 'Poll every (seconds)', type: 'number', def: 30, min: 10}].concat(UNITS),
    mapHelp: 'Pick the HA entity for each field. "Load entities" fills the lists and guesses from names and units; check the guesses.',
    hint: true},
  {id: 'json', label: 'JSON URL', blurb: 'ESPHome web server, Tasmota, custom ESP32 or any endpoint that returns JSON.', secrets: ['auth'], map: 'path', make: jsonDef,
    fields: [{k: 'url', label: 'JSON address', ph: 'http://192.168.1.50/status.json', help: 'Tasmota: http://IP/cm?cmnd=Status%2010. ESPHome web server: http://IP/sensor/NAME (one sensor each - use a small proxy or MQTT for several).'},
      {k: 'auth', label: 'Authorization header (optional)', type: 'password', secret: true, ph: 'Bearer abc123', help: 'Sent as a header, never in the URL. Putting keys in a ?query would leak them into logs.'},
      {k: 'interval', label: 'Poll every (seconds)', type: 'number', def: 15, min: 5}].concat(UNITS),
    mapHelp: 'Dot path to each value in the JSON, like StatusSNS.BME280.Temperature or data.temps[0]. "Test" finds numbers and guesses the paths for you.', needCors: true},
  {id: 'csv', label: 'Google Sheet / CSV', blurb: 'A published Sheet (Publish to web > CSV) or any CSV link. Uses the newest row.', fields: [
      {k: 'url', label: 'CSV address', ph: 'https://docs.google.com/spreadsheets/d/e/.../pub?output=csv', help: 'Privacy: a "publish to web" link is readable by anyone who has it, so treat the link like a password and do not share it.'},
      {k: 'interval', label: 'Check every (seconds)', type: 'number', def: 60, min: 15, help: 'Google refreshes published sheets about every 5 minutes.'}].concat(UNITS), make: csvDef,
    note: 'Needs a timestamp column plus headers like temperature, humidity, CO2, pH, EC. Column names are matched automatically.'},
  {id: 'mqtt', label: 'MQTT (WebSockets)', blurb: 'Mosquitto, EMQX, HiveMQ, Zigbee2MQTT. Loads a small helper library only when chosen.', secrets: ['pass'], map: 'topic', make: mqttDef,
    fields: [{k: 'url', label: 'Broker WebSocket address', ph: 'wss://broker.example.com:8884/mqtt', help: 'Must be ws:// or wss:// (not mqtt://). Mosquitto: add "listener 9001" + "protocol websockets". EMQX default wss port 8084, HiveMQ Cloud 8884, path /mqtt.'},
      {k: 'user', label: 'Username (optional)'}, {k: 'pass', label: 'Password (optional)', type: 'password', secret: true, help: 'Sent in the MQTT login inside the connection, not in the address. Use wss:// so it is encrypted.'},
      {k: 'interval', label: 'Send to the game every (seconds)', type: 'number', def: 10, min: 2}].concat(UNITS),
    mapHelp: 'Topic for each field (wildcards + and # allowed). If the message is JSON, add the field name in the second box, e.g. temperature for Zigbee2MQTT. Plain-number messages need no path.'},
  {id: 'pulse', label: 'Pulse Grow cloud', beta: true, blurb: 'Pulse One / Pro through the Pulse API (beta).', secrets: ['key'], make: pulseDef,
    fields: [{k: 'key', label: 'Pulse API key', type: 'password', secret: true, help: 'From your Pulse account (API access). Sent as the x-api-key header, never in the URL.'},
      {k: 'device', label: 'Device', type: 'select', opts: [['', 'First device on my account']], def: '', dyn: true},
      {k: 'interval', label: 'Poll every (seconds)', type: 'number', def: 60, min: 30}],
    note: 'Beta: endpoints follow Pulse\'s published API (GET /devices/details, /devices/{id}/recent-data) but could not be tested against a live account. If the browser says it cannot reach api.pulsegrow.com, Pulse may not allow browser calls (CORS) - export a CSV or use Home Assistant instead.'}
];
function findSource(id) { for (var i = 0; i < sources.length; i++) if (sources[i].id === id) return sources[i]; return null; }

/* ---------- styles ---------- */
var CSS = [
'.ll-back{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:12px}',
'.ll-dlg{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:12px;width:min(760px,100%);max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;font:14px/1.45 var(--body);box-shadow:0 20px 60px rgba(0,0,0,.5)}',
'.ll-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line)}',
'.ll-hd h2{margin:0;font:700 20px/1.2 var(--display)}',
'.ll-bd{overflow:auto;padding:14px 16px;flex:1;min-height:0}',
'.ll-ft{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line)}',
'.ll-ft .ll-sp{flex:1}',
'.ll-btn{font:600 14px var(--body);color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:9px 14px;min-height:40px;cursor:pointer}',
'.ll-btn:hover{border-color:var(--muted)}.ll-btn.ll-pri{background:var(--green);border-color:var(--green);color:var(--ink)}.ll-btn:disabled{opacity:.45;cursor:not-allowed}',
'.ll-dlg button:focus-visible,.ll-dlg select:focus-visible,.ll-dlg input:focus-visible{outline:2px solid var(--green);outline-offset:2px}',
'.ll-note{margin:0 0 12px;padding:8px 10px;border-radius:8px;border:1px solid var(--orange);background:var(--panel2);color:var(--muted);font-size:13px}',
'.ll-note b{color:var(--orange)}',
'.ll-src{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-bottom:14px}',
'.ll-tile{text-align:left;font:inherit;color:var(--text);background:var(--panel2);border:2px solid var(--line);border-radius:10px;padding:9px 11px;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0}',
'.ll-tile b{font:700 15px var(--display)}.ll-tile span{font-size:12px;color:var(--muted)}',
'.ll-tile[aria-checked=true]{border-color:var(--green)}.ll-tile:hover{border-color:var(--muted)}',
'.ll-beta{font:700 10px var(--body);color:var(--ink);background:var(--orange);border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:middle}',
'.ll-f{display:flex;flex-direction:column;gap:3px;margin:0 0 10px}',
'.ll-f>label,.ll-ml{font-weight:600}',
'.ll-f small,.ll-hl{color:var(--muted);font-size:12px}',
'.ll-dlg input[type=text],.ll-dlg input[type=password],.ll-dlg input[type=number],.ll-dlg input:not([type]),.ll-dlg select{width:100%;min-width:0;box-sizing:border-box;font:14px var(--body);color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:7px 8px;min-height:38px}',
'.ll-ck{display:flex;align-items:center;gap:8px;margin:2px 0 10px;font-size:13px;color:var(--muted)}',
'.ll-map{display:grid;grid-template-columns:130px minmax(0,1fr);gap:6px 8px;align-items:center;margin:4px 0 12px}',
'.ll-map.ll-two{grid-template-columns:130px minmax(0,1.4fr) minmax(0,1fr)}',
'.ll-map .ll-ml{font-size:13px}',
'.ll-hint{margin:8px 0 12px;padding:10px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);font-size:13px;color:var(--muted)}',
'.ll-hint pre{margin:6px 0;padding:8px;background:var(--ink);border-radius:6px;color:var(--text);font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;overflow:auto;white-space:pre}',
'.ll-msg{margin:10px 0 0;padding:9px 11px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);font-size:13px}',
'.ll-msg.ll-bad{border-color:var(--red);color:var(--text)}.ll-msg.ll-bad b{color:var(--red)}.ll-msg.ll-good b{color:var(--green)}.ll-msg.ll-warn{border-color:var(--orange)}',
'.ll-pv{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:4px 10px;margin-top:6px}',
'.ll-pv div{display:flex;justify-content:space-between;gap:6px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--line);padding:2px 0}.ll-pv b{color:var(--text)}',
'.ll-chip{display:inline-flex;align-items:center;gap:6px;font:600 12px var(--body);color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:3px 10px;white-space:nowrap}',
'.ll-chip i{width:9px;height:9px;border-radius:50%;background:var(--muted);flex:none}.ll-chip em{font-style:normal;color:var(--muted);font-weight:500}',
'.ll-chip.ll-live i{background:var(--green)}.ll-chip.ll-connecting i,.ll-chip.ll-stale i{background:var(--orange)}.ll-chip.ll-error i{background:var(--red)}',
'@media(max-width:560px){.ll-map,.ll-map.ll-two{grid-template-columns:minmax(0,1fr)}.ll-map .ll-ml{margin-top:4px}.ll-src{grid-template-columns:repeat(2,minmax(0,1fr))}.ll-tile span{display:none}.ll-tile{padding:8px 10px}.ll-dlg{font-size:13px}.ll-ft .ll-btn{flex:1}}'
].join('\n');
function ensureStyle() { if (!document.getElementById('ll-style')) { var s = el('style', {id: 'll-style'}); s.textContent = CSS; document.head.appendChild(s); } }

/* ---------- status chip ---------- */
function chip(link) {
  ensureStyle();
  var dot = el('i'), nm = el('span', {text: link.name}), age = el('em'), c = el('span', {class: 'll-chip ll-connecting', role: 'status'}, [dot, nm, age]), seen = false, miss = 0, iv;
  function upd() {
    if (c.isConnected) { seen = true; miss = 0; } else if (++miss > (seen ? 2 : 30)) { clearInterval(iv); return; }
    var s = link.status, secs = link.lastAt ? Math.max(0, Math.round((Date.now() - link.lastAt) / 1000)) : null;
    c.className = 'll-chip ll-' + s;
    age.textContent = s === 'error' ? 'error' : s === 'connecting' && secs == null ? 'connecting' : secs == null ? '' : (secs >= 120 ? Math.round(secs / 60) + ' min' : secs + ' s') + ' ago';
    c.title = link.name + ' - ' + s + (link.lastError ? ': ' + link.lastError : '');
    c.setAttribute('aria-label', c.title);
  }
  iv = setInterval(upd, 1000); upd(); c.destroy = function () { clearInterval(iv); };
  return c;
}

/* ---------- modal ---------- */
var ENV_NOTE = 'If this game is open inside a sandboxed preview, the browser may block connections to your devices. The Demo sensor always works; real sources work once the game is hosted on HyGrow\'s own site or static hosting.';
function open(onConnected) {
  ensureStyle();
  var prevFocus = document.activeElement, cur = null, inputs = {}, maps = {}, paths = {}, rem = null, ents = [], busy = false, S = {};
  var title = el('h2', {id: 'll-title', text: 'Live link'});
  var xBtn = el('button', {class: 'll-btn', type: 'button', 'aria-label': 'Close', text: '×'});
  var note = el('p', {class: 'll-note'}, [el('b', {text: 'Heads-up. '}), document.createTextNode(ENV_NOTE)]);
  var tiles = el('div', {class: 'll-src', role: 'radiogroup', 'aria-label': 'Data source'});
  var form = el('div', {class: 'll-form'}), msg = el('div', {'aria-live': 'polite'});
  var forget = el('button', {class: 'll-btn', type: 'button', text: 'Forget saved'}), cancel = el('button', {class: 'll-btn', type: 'button', text: 'Cancel'});
  var test = el('button', {class: 'll-btn', type: 'button', text: 'Test'}), go = el('button', {class: 'll-btn ll-pri', type: 'button', text: 'Connect'});
  var dlg = el('div', {class: 'll-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'll-title'}, [
    el('div', {class: 'll-hd'}, [title, xBtn]), el('div', {class: 'll-bd'}, [note, tiles, form, msg]),
    el('div', {class: 'll-ft'}, [forget, el('span', {class: 'll-sp'}), cancel, test, go])]);
  var back = el('div', {class: 'll-back'}, [dlg]);
  document.body.appendChild(back);

  function close() { document.removeEventListener('keydown', onKey, true); if (back.parentNode) back.parentNode.removeChild(back); try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {} }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(dlg.querySelectorAll('button,select,input,textarea'), function (n) { return !n.disabled && n.offsetParent !== null; });
    if (!f.length) return;
    var a = f[0], z = f[f.length - 1];
    if (!dlg.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
    else if (f.indexOf(document.activeElement) < 0) { e.preventDefault(); (e.shiftKey ? z : a).focus(); } /* v66 (round 15 keyboard M2): from the heading, Shift+Tab goes to the last control, not out of the dialog */
    else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  cancel.onclick = xBtn.onclick = close;
  back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });

  function show(kind, head, text, extra) {
    msg.textContent = ''; if (!head && !text) return;
    var m = el('div', {class: 'll-msg ll-' + kind, role: kind === 'bad' ? 'alert' : 'status'}, [el('b', {text: head + ' '}), document.createTextNode(text || '')]);
    if (extra) m.appendChild(extra); msg.appendChild(m);
  }
  function preview(row) {
    var g = el('div', {class: 'll-pv'});
    FIELDS.forEach(function (f) {
      var v = row[f]; g.appendChild(el('div', {}, [el('span', {text: LABEL[f]}), el('b', {text: v == null ? '—' : f === 'light_on' ? (v ? 'on' : 'off') : v + SHOWU[f]})]));
    });
    return g;
  }
  function setBusy(b, label) { busy = b; test.disabled = go.disabled = b; if (label) go.textContent = label; else go.textContent = 'Connect'; }
  function storeKey(id) { return 'hygrow.live.v1.' + id; }

  /* build form for a source */
  function pick(src) {
    cur = src; inputs = {}; maps = {}; paths = {}; ents = []; rem = null; form.textContent = ''; msg.textContent = '';
    Array.prototype.forEach.call(tiles.children, function (t) { t.setAttribute('aria-checked', t.dataset.id === src.id ? 'true' : 'false'); t.tabIndex = t.dataset.id === src.id ? 0 : -1; });
    var saved = lsGet(storeKey(src.id)) || {}, sc = saved.cfg || {}, ss = saved.sec || {};
    if (src.note) form.appendChild(el('p', {class: 'll-hl', text: src.note}));
    if (src.hint) form.appendChild(haHint());
    src.fields.forEach(function (f) {
      var val = sc[f.k] != null ? sc[f.k] : ss[f.k] != null ? ss[f.k] : f.def != null ? f.def : '', id = 'll-i-' + f.k, inp;
      if (f.type === 'select') {
        inp = el('select', {id: id}); f.opts.forEach(function (o) { inp.appendChild(el('option', {value: o[0], text: o[1]})); });
        if (f.dyn && val && !Array.prototype.some.call(inp.options, function (o) { return o.value === String(val); })) inp.appendChild(el('option', {value: val, text: 'Device ' + val}));
      } else { inp = el('input', {id: id, type: f.type || 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off'}); if (f.ph) inp.placeholder = f.ph; if (f.min) inp.min = f.min; }
      inp.value = val; inputs[f.k] = inp;
      form.appendChild(el('div', {class: 'll-f'}, [el('label', {for: id, text: f.label}), inp, f.help ? el('small', {text: f.help}) : null]));
    });
    if (src.map) mapBlock(src, sc);
    if (src.secrets) {
      rem = el('input', {type: 'checkbox', id: 'll-rem'}); rem.checked = !!saved.remember;
      form.appendChild(el('label', {class: 'll-ck', for: 'll-rem'}, [rem, document.createTextNode('Remember secrets on this device (stored in this browser only). Off = kept in memory until you close the page.')]));
    }
    forget.hidden = !src.secrets; test.hidden = src.id === 'demo';
    if (src.id === 'pulse') pulseExtra();
    if (src.id === 'mqtt') form.appendChild(el('p', {class: 'll-hl', text: 'Test connects to the broker and waits up to 12 s for messages.'}));
  }
  function haHint() {
    var origin = /^https?:/.test(location.origin) ? location.origin : 'https://YOUR-GAME-SITE', yaml = 'http:\n  cors_allowed_origins:\n    - ' + origin;
    return el('div', {class: 'll-hint'}, [el('b', {text: 'Home Assistant must allow this page (CORS). '}), document.createTextNode('Add this to configuration.yaml, then restart Home Assistant:'),
      el('pre', {text: yaml}), document.createTextNode('If this game is on https, use an https address for Home Assistant too (Nabu Casa or a reverse proxy); browsers block http from an https page.')]);
  }
  function mapBlock(src, sc) {
    var two = src.map === 'topic', g = el('div', {class: 'll-map' + (two ? ' ll-two' : '')}), sm = sc.map || {}, sp = sc.path || {};
    form.appendChild(el('div', {class: 'll-ml', text: src.map === 'entity' ? 'Entities' : src.map === 'path' ? 'JSON paths' : 'Topics'}));
    form.appendChild(el('p', {class: 'll-hl', text: src.mapHelp}));
    if (src.map === 'path') { var dl = el('datalist', {id: 'll-paths'}); form.appendChild(dl); }
    FIELDS.forEach(function (f) {
      var id = 'll-m-' + f, inp;
      if (src.map === 'entity') { inp = el('select', {id: id}); fillSel(inp, [], sm[f]); }
      else { inp = el('input', {id: id, type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': LABEL[f]}); inp.value = sm[f] || ''; if (src.map === 'path') { inp.setAttribute('list', 'll-paths'); inp.placeholder = 'e.g. data.' + f.split('_')[0]; } else inp.placeholder = 'e.g. tent/' + f.split('_')[0]; }
      maps[f] = inp; g.appendChild(el('label', {class: 'll-ml', for: id, text: LABEL[f]})); g.appendChild(inp);
      if (two) { var pi = el('input', {id: id + 'p', type: 'text', autocomplete: 'off', placeholder: 'JSON field (optional)', 'aria-label': LABEL[f] + ' JSON field'}); pi.value = sp[f] || ''; paths[f] = pi; g.appendChild(pi); }
    });
    form.appendChild(g);
    if (src.load) {
      var lb = el('button', {class: 'll-btn', type: 'button', text: 'Load entities'}); lb.onclick = function () { loadEnts(lb); };
      form.insertBefore(lb, g);
    }
  }
  function fillSel(sel, list, keep) {
    var want = keep != null ? keep : sel.value; sel.textContent = '';
    sel.appendChild(el('option', {value: '', text: '— not used —'}));
    var seen = {};
    list.forEach(function (e) { seen[e.key] = 1; sel.appendChild(el('option', {value: e.key, text: e.name + ' (' + e.key + ') ' + e.state + (e.unit ? ' ' + e.unit : '')})); });
    if (want && !seen[want]) sel.appendChild(el('option', {value: want, text: want}));
    sel.value = want || '';
  }
  function loadEnts(btn) {
    var c = collect(); if (!c.url || !c.token) { show('bad', 'Need more.', 'Enter the Home Assistant address and token first.'); return Promise.resolve(); }
    if (btn) btn.disabled = true; show('', 'Loading', ''); msg.textContent = '';
    return haLoad(c).then(function (list) {
      ents = list;
      var okE = function (e) { return /^-?[\d.]+$/.test(e.state) || /^(on|off)$/.test(e.state); };
      var sg = suggest(list.filter(okE), FIELDS), n = 0;
      FIELDS.forEach(function (f) {
        var doms = f === 'light_on' ? /^(light|switch|binary_sensor|sensor)$/ : /^(sensor|input_number|number)$/, keep = maps[f].value;
        if (!keep && sg[f]) { keep = sg[f]; n++; }
        fillSel(maps[f], list.filter(function (e) { return doms.test(e.dom) && (f === 'light_on' ? okE(e) : /^-?[\d.]+$/.test(e.state)); }), keep);
      });
      show('good', 'Found ' + list.length + ' entities.', n ? 'Guessed ' + n + ' fields from their names and units. Check them, then Test.' : 'Pick the entities for your fields.');
    }).then(function () { if (btn) btn.disabled = false; }, function (e) { if (btn) btn.disabled = false; show('bad', 'Could not load.', e.message); });
  }
  function pulseExtra() {
    var b = el('button', {class: 'll-btn', type: 'button', text: 'Load my devices'});
    b.onclick = function () {
      var c = collect(); if (!c.key) { show('bad', 'Need more.', 'Enter your API key first.'); return; }
      b.disabled = true;
      pulseDevices(c.key).then(function (a) {
        var sel = inputs.device, keep = sel.value; sel.textContent = ''; sel.appendChild(el('option', {value: '', text: 'First device on my account'}));
        a.forEach(function (d) { sel.appendChild(el('option', {value: d.id, text: (d.name || 'Device') + ' (#' + d.id + ')'})); }); sel.value = keep || (a[0] ? a[0].id : '');
        show('good', 'Found ' + a.length + ' device' + (a.length === 1 ? '' : 's') + '.', 'Pick one, then Test.'); b.disabled = false;
      }, function (e) { b.disabled = false; show('bad', 'Pulse says no.', e.message); });
    };
    form.insertBefore(b, inputs.device.parentNode.nextSibling);
  }
  function collect() {
    var c = {map: {}, path: {}};
    cur.fields.forEach(function (f) { var v = inputs[f.k].value; c[f.k] = f.type === 'number' ? Math.max(f.min || 1, +v || f.def || 30) : f.k === 'token' ? cleanToken(v) : f.k === 'auth' ? cleanAuth(v) : String(v).trim(); });
    FIELDS.forEach(function (f) { if (maps[f] && maps[f].value.trim()) c.map[f] = maps[f].value.trim(); if (paths[f] && paths[f].value.trim()) c.path[f] = paths[f].value.trim(); });
    return c;
  }
  function validate(c) {
    var s = cur.id;
    if (cur.fields.some(function (f) { return f.k === 'url'; }) && !c.url) return 'Enter the address first.';
    if (s === 'ha' && !c.token) return 'Enter the long-lived access token.';
    if (s === 'pulse' && !c.key) return 'Enter your Pulse API key.';
    var u = c.url && fixUrl(c.url, s === 'csv' ? 'https' : s === 'mqtt' ? 'wss' : 'http');
    if (u && s !== 'mqtt' && mixed(u)) return 'This page is https, so the browser blocks http:// addresses (mixed content). Use an https address for the device, or host the game over http on your own network.';
    return null;
  }
  /* optional pre-step: auto-load and guess the mapping when it is empty */
  function prep(c) {
    var none = !Object.keys(c.map).length;
    if (cur.id === 'ha' && none) return loadEnts().then(function () { return collect(); });
    if (cur.id === 'json') {
      return fetchJSON(fixUrl(c.url), {headers: c.auth ? {Authorization: c.auth} : {}, cache: 'no-store'}, null, 'json').then(function (js) {
        var leaves = flatten(js), dl = document.getElementById('ll-paths');
        if (dl) { dl.textContent = ''; leaves.forEach(function (l) { dl.appendChild(el('option', {value: l.path, label: String(l.val)})); }); }
        if (none) { var sg = suggest(leaves.map(function (l) { return {key: l.path, text: l.path}; }), FIELDS); Object.keys(sg).forEach(function (f) { maps[f].value = sg[f]; }); }
        S.leaves = leaves.length; return collect();
      });
    }
    return Promise.resolve(c);
  }
  function persist(c) {
    var cfg = {}, sec = {}, any = false;
    Object.keys(c).forEach(function (k) { if (cur.secrets && cur.secrets.indexOf(k) >= 0) { sec[k] = c[k]; } else cfg[k] = c[k]; });
    if (cfg.url && urlHasSecret(cfg.url)) { if (cur.secrets) sec.url = cfg.url; delete cfg.url; } /* user:pass@host or ?token=... in the address is a secret too */
    var doRem = rem && rem.checked;
    lsSet(storeKey(cur.id), {cfg: cfg, sec: doRem ? sec : undefined, remember: !!doRem});
    lsSet('hygrow.live.v1.last', cur.id);
  }
  function run(connect) {
    if (busy || !cur) return;
    var c = collect(), bad = validate(c); if (bad) { show('bad', 'Fix this:', bad); return; }
    setBusy(true, connect ? 'Connecting…' : null); show('', '', '');
    prep(c).then(function (c2) {
      var link = makeLink(cur.make(c2));
      return link.probe().then(function (row) { return {link: link, row: row, c: c2}; });
    }).then(function (res) {
      setBusy(false);
      var warn = res.row._warn && res.row._warn.length ? res.row._warn.join('; ') : null, n = FIELDS.filter(function (f) { return res.row[f] != null; }).length;
      if (!connect) { show(warn ? 'warn' : 'good', 'It works.', 'Got ' + n + ' of ' + FIELDS.length + ' fields' + (warn ? ' (' + warn + ')' : '') + '. Press Connect to use it.', preview(res.row)); return; }
      persist(res.c); close();
      if (typeof onConnected === 'function') onConnected(res.link);
    }).catch(function (e) {
      setBusy(false); show('bad', e && e.kind === 'nodata' ? 'No data.' : 'Could not connect.', (e && e.message) || String(e));
    });
  }
  test.onclick = function () { run(false); };
  go.onclick = function () { run(true); };
  forget.onclick = function () {
    if (!cur) return; lsDel(storeKey(cur.id));
    (cur.secrets || []).forEach(function (k) { if (inputs[k]) inputs[k].value = ''; }); if (rem) rem.checked = false;
    show('good', 'Forgotten.', 'Saved settings and secrets for ' + cur.label + ' were removed from this device.');
  };

  sources.forEach(function (s) {
    var t = el('button', {class: 'll-tile', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-id': s.id}, [el('b', {text: s.label}), el('span', {text: s.blurb})]);
    if (s.beta) t.firstChild.appendChild(el('span', {class: 'll-beta', text: 'BETA'}));
    t.onclick = function () { pick(s); };
    t.addEventListener('keydown', function (e) {
      var i = sources.indexOf(s), d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (d) { e.preventDefault(); var n = sources[(i + d + sources.length) % sources.length]; pick(n); tiles.children[sources.indexOf(n)].focus(); }
    });
    tiles.appendChild(t);
  });
  var last = lsGet('hygrow.live.v1.last');
  pick(findSource(last) || sources[0]);
  setTimeout(function () { try { tiles.querySelector('[aria-checked=true]').focus(); } catch (e) {} }, 0);
  return {close: close};
}

global.LiveLink = {open: open, chip: chip, sources: sources, mkRow: mkRow, makeLink: makeLink, version: '1.1',
  _t: {fixUrl: fixUrl, urlHasSecret: urlHasSecret, cleanToken: cleanToken, cleanAuth: cleanAuth, badHeader: badHeader, localNetHost: localNetHost, netMsg: netMsg, csvLatest: csvLatest, newestWithData: newestWithData, allMapped: allMapped, topicMatch: topicMatch}}; // _t = hooks for the node tests
})(window);
