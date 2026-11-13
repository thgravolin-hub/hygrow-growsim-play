/* HyGrow Grow Sim - CSV import for "My setup" mode. Global: window.CsvImport. No dependencies. */
(function (global) {
'use strict';
var SAMPLE = "timestamp,air_temp_c,rh_pct,vpd_kpa,co2_ppm,ppfd_umol_m2_s,light_on,ec_mscm,ph,water_temp_c,reservoir_l,dissolved_o2_mgl\n2026-10-29T00:00:00+08:00,19.1,61.6,0.85,523,0,0,2.2,5.89,20.2,37.5,7.94\n2026-10-29T00:30:00+08:00,18.9,62.7,0.81,515,0,0,2.2,5.88,20.2,37.5,7.88\n2026-10-29T01:00:00+08:00,19.3,64.8,0.79,530,0,0,2.2,5.89,20.4,37.5,7.87\n2026-10-29T01:30:00+08:00,19.0,61.5,0.85,528,0,0,2.2,5.86,20.3,37.5,7.9\n2026-10-29T02:00:00+08:00,19.2,61.3,0.86,527,0,0,2.19,5.86,20.3,37.5,7.95\n2026-10-29T02:30:00+08:00,19.2,62.2,0.84,546,0,0,2.19,5.85,20.3,37.4,8.0\n2026-10-29T03:00:00+08:00,19.3,62.2,0.85,554,0,0,2.19,5.85,20.2,37.4,7.93\n2026-10-29T03:30:00+08:00,18.9,63.7,0.79,553,0,0,2.19,5.86,20.3,37.4,7.94\n2026-10-29T04:00:00+08:00,19.2,62.8,0.83,559,0,0,2.19,5.85,20.2,37.4,7.97\n2026-10-29T04:30:00+08:00,19.3,65.0,0.78,562,0,0,2.19,5.85,20.2,37.4,7.93\n2026-10-29T05:00:00+08:00,19.0,61.5,0.85,551,0,0,2.19,5.85,20.3,37.4,8.0\n2026-10-29T05:30:00+08:00,18.9,62.8,0.81,565,0,0,2.18,5.85,20.3,37.4,7.91\n2026-10-29T06:00:00+08:00,25.9,56.9,1.44,1084,644,1,2.18,5.85,20.8,37.3,7.88\n2026-10-29T06:30:00+08:00,26.0,52.3,1.6,1082,648,1,2.18,5.88,20.8,37.2,7.88\n2026-10-29T07:00:00+08:00,26.2,52.2,1.63,1085,654,1,2.17,5.91,20.8,37.2,7.78\n2026-10-29T07:30:00+08:00,26.3,52.0,1.64,1078,645,1,2.17,5.91,20.8,37.1,7.8\n2026-10-29T08:00:00+08:00,26.1,53.3,1.58,1071,656,1,2.16,5.91,20.9,37.0,7.83\n2026-10-29T08:30:00+08:00,26.1,55.5,1.51,1075,649,1,2.16,5.91,20.9,37.0,7.81\n2026-10-29T09:00:00+08:00,26.6,51.8,1.67,1068,657,1,2.15,5.9,20.8,36.9,7.87\n2026-10-29T09:30:00+08:00,26.7,55.1,1.57,1069,646,1,2.15,5.9,20.9,36.8,7.9\n2026-10-29T10:00:00+08:00,26.4,51.7,1.67,1071,658,1,2.14,5.93,21.0,36.7,7.78\n2026-10-29T10:30:00+08:00,26.6,52.2,1.66,1064,642,1,2.14,5.93,21.1,36.6,7.82\n2026-10-29T11:00:00+08:00,26.8,55.1,1.58,1068,648,1,2.13,5.93,20.9,36.6,7.87\n2026-10-29T11:30:00+08:00,26.9,54.2,1.62,1066,652,1,2.13,5.93,21.1,36.5,7.89\n2026-10-29T12:00:00+08:00,26.8,52.3,1.68,1061,655,1,2.13,5.95,21.0,36.4,7.82\n2026-10-29T12:30:00+08:00,26.9,53.4,1.66,1055,644,1,2.12,5.98,21.0,36.3,7.91\n2026-10-29T13:00:00+08:00,27.0,53.0,1.68,1052,651,1,2.12,5.97,21.1,36.2,7.84\n2026-10-29T13:30:00+08:00,27.0,51.8,1.72,1055,655,1,2.11,5.97,21.0,36.2,7.86\n2026-10-29T14:00:00+08:00,26.7,51.6,1.69,1049,657,1,2.11,5.98,21.1,36.1,7.81\n2026-10-29T14:30:00+08:00,27.0,52.0,1.71,1048,650,1,2.11,5.99,20.9,36.0,7.91\n2026-10-29T15:00:00+08:00,26.6,51.9,1.68,1049,651,1,2.1,6.01,21.1,35.9,7.75\n2026-10-29T15:30:00+08:00,26.8,50.8,1.74,1045,654,1,2.1,6.02,21.1,35.9,7.81\n2026-10-29T16:00:00+08:00,26.8,52.1,1.69,1044,653,1,2.09,6.03,21.1,35.8,7.86\n2026-10-29T16:30:00+08:00,27.0,54.3,1.63,1039,651,1,2.09,6.06,21.0,35.7,7.83\n2026-10-29T17:00:00+08:00,26.5,50.9,1.7,1033,653,1,2.08,6.09,21.1,35.7,7.86\n2026-10-29T17:30:00+08:00,26.5,54.2,1.59,1037,646,1,2.08,6.1,21.1,35.6,7.89\n2026-10-29T18:00:00+08:00,26.5,52.1,1.66,1036,647,1,2.07,6.1,20.9,35.5,7.86\n2026-10-29T18:30:00+08:00,26.6,50.1,1.74,1032,652,1,2.07,6.09,21.1,35.4,7.93\n2026-10-29T19:00:00+08:00,26.4,51.5,1.67,1025,654,1,2.06,6.09,21.1,35.3,7.89\n2026-10-29T19:30:00+08:00,26.4,51.1,1.69,1029,651,1,2.06,6.09,21.0,35.3,7.82\n2026-10-29T20:00:00+08:00,26.3,55.3,1.53,1029,655,1,2.05,6.11,21.0,35.2,7.83\n2026-10-29T20:30:00+08:00,26.4,53.5,1.6,1032,646,1,2.05,6.13,20.9,35.1,7.79\n2026-10-29T21:00:00+08:00,26.2,52.0,1.63,1029,647,1,2.05,6.13,20.9,35.1,7.83\n2026-10-29T21:30:00+08:00,26.1,52.5,1.61,1021,654,1,2.04,6.13,21.0,35.0,7.76\n2026-10-29T22:00:00+08:00,26.4,53.6,1.6,1020,655,1,2.04,6.14,21.0,34.9,7.81\n2026-10-29T22:30:00+08:00,26.4,55.3,1.54,1020,648,1,2.03,6.14,20.8,34.8,7.91\n2026-10-29T23:00:00+08:00,26.0,52.8,1.59,1013,655,1,2.03,6.16,20.8,34.8,7.82\n2026-10-29T23:30:00+08:00,26.0,53.0,1.58,1011,646,1,2.02,6.19,20.8,34.7,7.96\n";
var NUMF = ['air_temp_c','rh_pct','vpd_kpa','co2_ppm','ppfd_umol_m2_s','ec_mscm','ph','water_temp_c','reservoir_l','dissolved_o2_mgl'];
var FIELDS = ['timestamp'].concat(NUMF.slice(0,5), ['light_on'], NUMF.slice(5));
var LABEL = {timestamp:'Timestamp', time_of_day:'Time (if separate column)', air_temp_c:'Air temp', rh_pct:'Humidity', vpd_kpa:'VPD', co2_ppm:'CO₂', ppfd_umol_m2_s:'Light (PPFD)', light_on:'Lights on/off', ec_mscm:'EC', ph:'pH', water_temp_c:'Water temp', reservoir_l:'Reservoir (L)', dissolved_o2_mgl:'Dissolved O₂'};
var SHORT = {air_temp_c:'air temp', rh_pct:'humidity', vpd_kpa:'VPD', co2_ppm:'CO₂', ppfd_umol_m2_s:'PPFD', light_on:'lights', ec_mscm:'EC', ph:'pH', water_temp_c:'water temp', reservoir_l:'reservoir', dissolved_o2_mgl:'dissolved O₂'};
var NA = /^(n\/?a|nan|null|none|--+|-|\?|err.*|nil|undefined)$/i;
var BOOL = /^(on|off|true|false|yes|no)$/i;
var RANGE = {air_temp_c:[-20,60], rh_pct:[0,105], vpd_kpa:[0,8], co2_ppm:[100,20000], ppfd_umol_m2_s:[0,3500], ec_mscm:[0,10], ph:[0,14], water_temp_c:[0,50], reservoir_l:[0,100000], dissolved_o2_mgl:[0,30]};

/* ---------- number / time helpers ---------- */
function toNum(s, dec) {
  if (s == null) return null;
  s = String(s).trim();
  if (s === '' || NA.test(s)) return null;
  if (dec && /^[-+]?\d+,\d+/.test(s) && s.indexOf('.') < 0) s = s.replace(',', '.');
  else if (!dec && s.indexOf(',') > 0) { /* comma-delimited file, so a comma can only sit inside a quoted cell: 1,234 = thousands, 24,5 = decimal comma (Google Sheets in a European locale) */
    if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?(?![\d,])/.test(s)) s = s.replace(/,(?=\d{3})/g, '');
    else if (/^[-+]?\d+,\d{1,2}(?![\d,.])/.test(s) || /^[-+]?\d+,\d{4,}(?![\d,.])/.test(s)) s = s.replace(',', '.');
  }
  var m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(?:[°%a-zµμ\/\s℃℉\uFFFD]*)$/i.exec(s);
  return m ? parseFloat(m[1]) : null;
}
function looksDate(s) { return /\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}/.test(s) || /\d{1,2}:\d{2}/.test(s); }
function median(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function detectDayFirst(vals) {
  var a = 0, b = 0;
  vals.forEach(function (s) { var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(String(s).trim()); if (m) { if (+m[1] > 12) a++; if (+m[2] > 12) b++; } });
  return !(b > 0 && a === 0);
}
function dateAmbiguous(vals) { /* slash/dot dates exist and no day number above 12 in either position, so d/m vs m/d cannot be told from the data */
  var any = false, big = false;
  vals.forEach(function (s) { var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(String(s).trim()); if (m) { any = true; if (+m[1] > 12 || +m[2] > 12) big = true; } });
  return any && !big;
}
function offMin(z) { if (!z || /^z$/i.test(z)) return 0; var m = /^([+-])(\d{2}):?(\d{2})$/.exec(z); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0; }
function parseTime(s, dayFirst, tz) {
  s = String(s == null ? '' : s).trim();
  if (!s) return NaN;
  var m, n;
  if (/^\d+(\.\d+)?$/.test(s)) {
    n = +s;
    if (n > 1e11) return Math.round(n);
    if (n > 1e8) return Math.round(n * 1000);
    if (n > 20000 && n < 80000) return Math.round((n - 25569) * 864e5) - tz * 6e4; // Excel serial, local
    return NaN;
  }
  if ((m = /^(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*([AaPp][Mm])?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(s))) {
    return mk(+m[1], +m[2], +m[3], m[4], m[5], m[6], m[7], m[8] == null ? tz : offMin(m[8]));
  }
  if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(s))) {
    var y = +m[3]; if (y < 100) y += 2000;
    var d = dayFirst ? +m[1] : +m[2], mo = dayFirst ? +m[2] : +m[1];
    if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; }
    return mk(y, mo, d, m[4], m[5], m[6], m[7], m[8] == null ? tz : offMin(m[8]));
  }
  var p = /(z|gmt|utc|[+-]\d{2}:?\d{2})\s*$/i.test(s) ? Date.parse(s) : Date.parse(s + ' UTC') - tz * 6e4;
  return isFinite(p) ? p : NaN;
}
function mk(y, mo, d, h, mi, sec, ap, off) {
  h = h == null ? 0 : +h;
  if (ap) { h = h % 12 + (/p/i.test(ap) ? 12 : 0); }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || +(mi || 0) > 59) return NaN;
  return Date.UTC(y, mo - 1, d, h, +(mi || 0), +(sec || 0)) - off * 6e4;
}

/* ---------- parse ---------- */
function splitRows(text, d) {
  var rows = [], row = [], cur = '', q = false, i, c, n = text.length;
  for (i = 0; i < n; i++) {
    c = text.charAt(i);
    if (q) {
      if (c === '"') { if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (c === d) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text.charAt(i + 1) === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.map(function (r) { return r.map(function (x) { return x.trim(); }); })
    .filter(function (r) { return r.some(function (x) { return x !== ''; }); });
}
function pickDelimiter(text) {
  var best = ',', bs = -1, bl = 0, sample = text.slice(0, 6000);
  [',', ';', '\t'].forEach(function (d) {
    var cnt = {}, rs = splitRows(sample, d);
    rs.forEach(function (r) { if (r.length > 1) cnt[r.length] = (cnt[r.length] || 0) + 1; });
    var L = 0, sc = 0;
    Object.keys(cnt).forEach(function (k) { if (cnt[k] > sc || (cnt[k] === sc && +k > L)) { sc = cnt[k]; L = +k; } });
    if (sc > bs || (sc === bs && L > bl)) { bs = sc; bl = L; best = d; }
  });
  return best;
}
function parse(text) {
  text = String(text == null ? '' : text).replace(/^﻿/, '');
  var delimiter = pickDelimiter(text), rows = splitRows(text, delimiter), dec = delimiter !== ',';
  var vi = function (c) { return toNum(c, dec) != null || looksDate(c); };
  var hi = -1, i;
  for (i = 0; i < rows.length - 1; i++) {
    var r = rows[i], nx = rows[i + 1], nx2 = rows[i + 2];
    if (r.filter(function (c) { return c !== '' && toNum(c, dec) == null; }).length < 2) continue;
    var v1 = nx.filter(vi).length;
    if (nx.length < 2 || v1 < 2 || v1 / nx.length < 0.6 || !nx.some(function (c) { return toNum(c, dec) != null; })) continue;
    if (nx2 && nx2.filter(vi).length < 2) continue;
    hi = i; break;
  }
  if (hi < 0) hi = 0;
  var meta = rows.slice(0, hi).map(function (r) { return r.join(' '); }).join(' \n').toLowerCase();
  var headers = (rows[hi] || []).map(function (h, k) { return h || 'Column ' + (k + 1); });
  var body = rows.slice(hi + 1).map(function (r) {
    r = r.slice(0, headers.length); while (r.length < headers.length) r.push(''); return r;
  });
  return {headers: headers, rows: body, delimiter: delimiter, meta: meta};
}

/* ---------- mapping guess ---------- */
function colStats(rows, j, dec) {
  var nums = [], ne = 0, dt = 0, bl = 0, n = Math.min(rows.length, 1500), i, s, v;
  for (i = 0; i < n; i++) {
    s = rows[i][j]; if (s == null || s === '') continue;
    ne++; v = toNum(s, dec);
    if (v != null) nums.push(v); else if (BOOL.test(s)) bl++; else if (looksDate(s)) dt++;
  }
  nums.sort(function (a, b) { return a - b; });
  return {n: ne, numFrac: ne ? nums.length / ne : 0, dateFrac: ne ? dt / ne : 0, boolFrac: ne ? bl / ne : 0,
    min: nums[0], max: nums[nums.length - 1], med: median(nums)};
}
var SKIP = /dew|heat.?index|batt|rssi|signal|volt|press|hpa|baro|lux|illuminance|serial|device|alarm|\bsn\b|\bmac\b|model/;
var W = '(^|[^a-z])', E = '([^a-z]|$)';
var RULES = [
  ['timestamp', new RegExp(W + '(time ?stamp|timestamp|date ?[\\/&] ?time|datetime|date|time|observed|recorded|logged)' + E), 0.95],
  ['vpd_kpa', /vpd|vapou?r.?pressure.?def/, 0.95],
  ['co2_ppm', /co2|co₂|carbon/, 0.95],
  ['ppfd_umol_m2_s', new RegExp(W + '(ppfd|par|ppf)' + E + '|umol|µmol|light intensity|photosynthetic'), 0.9],
  ['dissolved_o2_mgl', new RegExp('dissolved|oxygen|' + W + 'do2?' + E), 0.85],
  ['ph', new RegExp(W + 'ph' + E), 0.95],
  ['rh_pct', new RegExp('humid|relative|' + W + '(rh|hum)' + E), 0.95],
  ['water_temp_c', /(water|solution|soln|reservoir|nutrient|tank|root|liquid|\bres\b).*temp|temp.*(water|solution|reservoir|nutrient|tank|root|liquid|\bres\b)|^w[_ ]?temp/, 0.95],
  ['reservoir_l', /(reservoir|tank|\bres\b)[^a-z]*(l\b|lit|vol|level|size|capacity)|volume|water ?level/, 0.8],
  ['ec_mscm', new RegExp(W + '(ec|cf|tds|ppm)' + E + '|conductiv|salinity|nutrient ?(strength|conc)'), 0.9],
  ['light_on', /(light|lamp|photoperiod|led).*(on|state|status|schedule)|^(light|lights|lamp)$/, 0.7],
  ['air_temp_c', new RegExp('temp|' + W + 't' + E), 0.9]
];
function norm(h) { return h.toLowerCase().replace(/[µμ\uFFFD]/g, 'u'); }
function tempUnit(h, st) {
  if (/°\s*f|fahrenheit|\(f\)|_f\b|deg ?f|℉|\bf\)/i.test(h)) return 'F';
  if (/°\s*c|celsius|\(c\)|_c\b|deg ?c|℃/i.test(h)) return 'C';
  return st.med != null && st.med > 45 ? 'F' : 'C';
}
function ecUnit(h, st) {
  var m = st.med == null ? 1 : st.med;
  if (/us\/?cm|micro ?siemens|\bus\b/.test(h)) return 'uS';
  if (/ms\/?cm|milli ?siemens/.test(h)) return m > 50 ? 'uS' : 'mS';
  if (/ppm|tds/.test(h)) return /700/.test(h) ? 'ppm700' : 'ppm500';
  return m > 50 ? 'uS' : 'mS';
}
function guessBrand(heads, meta, M, hasTod) {
  var t = heads.join('|') + '|' + (meta || ''), has = function (f) { return M[f] != null; };
  var names = [['AC Infinity', /ac ?infinity/], ['TrolMaster', /trol ?master/], ['Bluelab', /blue ?lab/], ['SensorPush', /sensor ?push/],
    ['Pulse Grow', /pulse/], ['Inkbird', /ink ?bird/], ['Govee', /govee/], ['Aranet4', /aranet/]];
  for (var i = 0; i < names.length; i++) if (names[i][1].test(t)) return names[i][0];
  if (has('co2_ppm') && /carbon dioxide/.test(t) && /pressure/.test(t)) return 'Aranet4';
  if (/barometric|dewpoint/.test(t) && has('rh_pct')) return 'SensorPush';
  if (/temperature_fahrenheit|relative_humidity|sample frequency/.test(t)) return 'Govee';
  if (hasTod && has('air_temp_c') && has('rh_pct') && (has('co2_ppm') || has('ppfd_umol_m2_s'))) return 'TrolMaster';
  if ((has('ec_mscm') || has('ph')) && !has('rh_pct') && !has('ppfd_umol_m2_s')) return 'Bluelab';
  if (has('ppfd_umol_m2_s') && (has('vpd_kpa') || has('co2_ppm') || has('ec_mscm'))) return 'Pulse Grow';
  if (has('vpd_kpa') && has('air_temp_c') && has('rh_pct')) return 'AC Infinity';
  if (has('air_temp_c') && has('rh_pct') && !has('co2_ppm')) return 'Inkbird';
  return null;
}
function guessMapping(headers, rows, meta) {
  rows = rows || [];
  var dec = true, cols = [], i, j;
  var allNum = rows.length && rows.slice(0, 50).some(function (r) { return r.some(function (c) { return /\d,\d/.test(c) && !/\./.test(c); }); });
  dec = !!allNum || dec;
  for (j = 0; j < headers.length; j++) {
    var h = norm(headers[j]), st = colStats(rows, j, dec), f = null, conf = 0;
    if (!SKIP.test(h) || RULES[0][1].test(h)) {
      for (i = 0; i < RULES.length; i++) if (RULES[i][1].test(h)) { f = RULES[i][0]; conf = RULES[i][2]; break; }
    }
    if (f && f !== 'timestamp') {
      if (f === 'light_on') {
        if (st.boolFrac < 0.6 && !(st.numFrac > 0.6 && st.max <= 1 && st.min >= 0)) {
          if (st.numFrac > 0.6 && st.max > 1) { f = 'ppfd_umol_m2_s'; conf = 0.4; } else f = null;
        }
      } else if (st.numFrac < 0.6) f = null;
    }
    if (f === 'rh_pct' && (st.max > 105 || st.min < 0)) conf *= 0.5;
    if (f === 'ph' && (st.max > 14.5 || st.min < 0)) conf *= 0.4;
    if (f === 'co2_ppm' && st.med < 200) conf *= 0.5;
    if (f === 'ec_mscm' && /^(ppm|tds)/.test(h.replace(/[^a-z0-9]/g, '')) ) conf = 0.6;
    cols.push({j: j, h: h, st: st, f: f, conf: conf});
  }
  var mapping = {}, confidence = {}, units = {};
  FIELDS.concat(['time_of_day']).forEach(function (f) { mapping[f] = null; });
  // timestamp: choose best candidate by parse success
  var tz = 480, cands = cols.filter(function (c) { return c.f === 'timestamp'; });
  cols.forEach(function (c) { if (!c.f && (c.st.dateFrac > 0.6 || (c.st.numFrac > 0.9 && c.st.min > 1e8 && c.st.max < 1e13)) && !cands.some(function (x) { return x.j === c.j; })) { c.f = 'timestamp'; c.conf = 0.5; cands.push(c); } });
  var df = detectDayFirst(rows.slice(0, 500).map(function (r) { return r[cands.length ? cands[0].j : 0] || ''; }));
  cands.forEach(function (c) {
    var ok = 0, tm = 0, k = 0, v;
    for (var r = 0; r < rows.length && k < 20; r++) { v = rows[r][c.j]; if (!v) continue; k++; if (isFinite(parseTime(v, df, tz))) ok++; if (/:/.test(v) || /^\d+(\.\d+)?$/.test(v)) tm++; }
    c.score = (k ? ok / k : 0) + (k && tm / k > 0.8 ? 1 : 0);
  });
  cands.sort(function (a, b) { return b.score - a.score; });
  if (cands.length && cands[0].score >= 0.5) {
    mapping.timestamp = cands[0].j; confidence.timestamp = Math.min(cands[0].conf, cands[0].score >= 1.5 ? 1 : 0.7);
    if (cands[0].score < 1.5) {
      var tod = cands.slice(1).filter(function (c) { return rows.length && /^\d{1,2}:\d{2}/.test(rows[0][c.j] || ''); })[0];
      if (tod) { mapping.time_of_day = tod.j; confidence.time_of_day = 0.8; }
    }
  }
  cols.forEach(function (c) {
    if (!c.f || c.f === 'timestamp') return;
    if (mapping[c.f] == null || c.conf > confidence[c.f]) { mapping[c.f] = c.j; confidence[c.f] = c.conf; }
  });
  // Bluelab-style: lone "Temp" next to EC/pH and no humidity is the solution temp
  if (mapping.air_temp_c != null && mapping.rh_pct == null && mapping.water_temp_c == null && (mapping.ec_mscm != null || mapping.ph != null)) {
    mapping.water_temp_c = mapping.air_temp_c; confidence.water_temp_c = confidence.air_temp_c * 0.8; mapping.air_temp_c = null; delete confidence.air_temp_c;
  }
  ['air_temp_c', 'water_temp_c'].forEach(function (f) { if (mapping[f] != null) units[f] = tempUnit(cols[mapping[f]].h, cols[mapping[f]].st); });
  if (mapping.ec_mscm != null) units.ec_mscm = ecUnit(cols[mapping.ec_mscm].h, cols[mapping.ec_mscm].st);
  if (mapping.rh_pct != null) { var s = cols[mapping.rh_pct].st; units.rh_pct = s.max <= 1 && s.max > 0 ? 'frac' : 'pct'; }
  if (mapping.air_temp_c != null && confidence.air_temp_c < 0.6 && units.air_temp_c === 'F') confidence.air_temp_c = 0.6;
  var brand = guessBrand(cols.map(function (c) { return c.h; }), meta, mapping, mapping.time_of_day != null);
  return {mapping: mapping, units: units, confidence: confidence, brand: brand};
}

/* ---------- normalise ---------- */
function normalise(parsed, mapping, units, opts) {
  opts = opts || {}; units = units || {}; mapping = mapping || {};
  var tz = opts.tzOffsetMinutes == null ? 480 : opts.tzOffsetMinutes, warnings = [], dec = parsed.delimiter !== ',';
  var ti = mapping.timestamp, td = mapping.time_of_day, out = [], drop = {}, badT = 0;
  if (ti == null) { return {rows: [], stats: {count: 0, start: null, end: null, intervalMin: null, fields: []}, warnings: ['No timestamp column chosen.']}; }
  var tvals = parsed.rows.map(function (r) { return r[ti] || ''; }), df = detectDayFirst(tvals), ambiguous = dateAmbiguous(tvals);
  if (opts.dayFirst === true || opts.dayFirst === false) df = opts.dayFirst; /* caller override, e.g. the Live link retrying the other reading when the newest row would land far from "now" */
  parsed.rows.forEach(function (r) {
    var ts = r[ti]; if (td != null && r[td]) ts = ts + ' ' + r[td];
    var t = parseTime(ts, df, tz);
    if (!isFinite(t)) { badT++; return; }
    var o = {t: t};
    NUMF.forEach(function (f) {
      o[f] = null;
      var ci = mapping[f]; if (ci == null) return;
      var v = toNum(r[ci], dec); if (v == null) return;
      var u = units[f];
      if ((f === 'air_temp_c' || f === 'water_temp_c') && u === 'F') v = (v - 32) * 5 / 9;
      else if (f === 'ec_mscm') v = u === 'uS' ? v / 1000 : u === 'ppm500' ? v / 500 : u === 'ppm700' ? v / 700 : v;
      else if (f === 'rh_pct' && u === 'frac') v *= 100;
      var rg = RANGE[f];
      if (v < rg[0] || v > rg[1]) { drop[f] = (drop[f] || 0) + 1; return; }
      if (f === 'rh_pct' && v > 100) v = 100;
      o[f] = f === 'co2_ppm' ? Math.round(v) : Math.round(v * 1e4) / 1e4;
    });
    o.light_on = null;
    if (mapping.light_on != null) {
      var lv = String(r[mapping.light_on] || '').trim();
      if (/^(on|true|yes)$/i.test(lv)) o.light_on = 1; else if (/^(off|false|no)$/i.test(lv)) o.light_on = 0;
      else { var ln = toNum(lv, dec); if (ln != null) o.light_on = ln > 0 ? 1 : 0; }
    }
    out.push(o);
  });
  if (badT) warnings.push(badT + ' row' + (badT > 1 ? 's' : '') + ' skipped: could not read the timestamp.');
  Object.keys(drop).forEach(function (f) { warnings.push('Dropped ' + drop[f] + ' impossible ' + (SHORT[f] || f) + ' value' + (drop[f] > 1 ? 's' : '') + '.'); });
  out.sort(function (a, b) { return a.t - b.t; });
  var dd = [], dup = 0;
  out.forEach(function (o) { if (dd.length && dd[dd.length - 1].t === o.t) { dd[dd.length - 1] = o; dup++; } else dd.push(o); });
  if (dup) warnings.push(dup + ' duplicate timestamp' + (dup > 1 ? 's' : '') + ' merged.');
  var vpdMade = 0, lightMade = 0;
  dd.forEach(function (o) {
    if (o.vpd_kpa == null && o.air_temp_c != null && o.rh_pct != null) {
      var T = o.air_temp_c; o.vpd_kpa = Math.max(0, Math.round(0.6108 * Math.exp(17.27 * T / (T + 237.3)) * (1 - o.rh_pct / 100) * 1e3) / 1e3); vpdMade++;
    }
    if (o.light_on == null && o.ppfd_umol_m2_s != null) { o.light_on = o.ppfd_umol_m2_s > 50 ? 1 : 0; lightMade++; }
  });
  if (vpdMade) warnings.push('VPD worked out from air temp and humidity for ' + vpdMade + ' readings.');
  if (lightMade) warnings.push('Lights on/off worked out from PPFD above 50 for ' + lightMade + ' readings.');
  var diffs = [], gaps = 0;
  for (var i = 1; i < dd.length; i++) { diffs.push((dd[i].t - dd[i - 1].t) / 6e4); if (dd[i].t - dd[i - 1].t > 3 * 36e5) gaps++; }
  var iv = median(diffs);
  if (gaps) warnings.push(gaps + ' gap' + (gaps > 1 ? 's' : '') + ' longer than 3 hours (left empty).');
  if (dd.length && dd[dd.length - 1].t - dd[0].t < 864e5) warnings.push('Less than a day of data.');
  var fields = FIELDS.slice(1).filter(function (f) { return dd.some(function (o) { return o[f] != null; }); });
  return {rows: dd, warnings: warnings, stats: {count: dd.length, start: dd.length ? dd[0].t : null, end: dd.length ? dd[dd.length - 1].t : null,
    startIso: dd.length ? new Date(dd[0].t).toISOString() : null, endIso: dd.length ? new Date(dd[dd.length - 1].t).toISOString() : null,
    intervalMin: iv == null ? null : (iv >= 1 ? Math.round(iv) : Math.round(iv * 10) / 10), fields: fields, dayFirst: df, ambiguousDates: ambiguous}};
}

/* ---------- hourly resample ---------- */
function resampleHourly(rows, tzOffsetMinutes) {
  if (!rows || !rows.length) return [];
  var off = (tzOffsetMinutes == null ? 480 : tzOffsetMinutes) * 6e4, H = 36e5;
  var first = Math.ceil((rows[0].t + off) / H) * H - off, last = rows[rows.length - 1].t, hours = [];
  for (var h = first; h <= last; h += H) hours.push({t: h});
  FIELDS.slice(1).forEach(function (f) {
    var pts = rows.filter(function (r) { return r[f] != null; }), p = 0;
    hours.forEach(function (o) {
      o[f] = null;
      if (!pts.length) return;
      while (p + 1 < pts.length && pts[p + 1].t <= o.t) p++;
      var a = pts[p], b = pts[p + 1];
      if (a.t === o.t) { o[f] = a[f]; return; }
      if (a.t > o.t || !b || b.t - a.t > 3 * H) return;
      var v = a[f] + (b[f] - a[f]) * (o.t - a.t) / (b.t - a.t);
      o[f] = f === 'light_on' ? (v >= 0.5 ? 1 : 0) : f === 'co2_ppm' ? Math.round(v) : Math.round(v * 1e4) / 1e4;
    });
  });
  return hours;
}

/* ---------- UI ---------- */
var CSS = [
'.csvi-back{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:12px}',
'.csvi-dlg{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:12px;width:min(720px,100%);max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;font:14px/1.45 var(--body);box-shadow:0 20px 60px rgba(0,0,0,.5)}',
'.csvi-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line)}',
'.csvi-hd h2{margin:0;font:700 20px/1.2 var(--display)}',
'.csvi-bd{overflow:auto;padding:14px 16px;flex:1;min-height:0}',
'.csvi-ft{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line)}',
'.csvi-drop{border:2px dashed var(--line);border-radius:10px;padding:16px;text-align:center;background:var(--panel2);display:flex;flex-direction:column;gap:10px;align-items:center}',
'.csvi-drop.csvi-on{border-color:var(--green)}',
'.csvi-drop p{margin:0;color:var(--muted)}',
'.csvi-btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}',
'.csvi-btn{font:600 14px var(--body);color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:9px 14px;min-height:40px;cursor:pointer}',
'.csvi-btn:hover{border-color:var(--muted)}',
'.csvi-btn.csvi-pri{background:var(--green);border-color:var(--green);color:var(--ink)}',
'.csvi-btn:disabled{opacity:.45;cursor:not-allowed}',
'.csvi-dlg button:focus-visible,.csvi-dlg select:focus-visible{outline:2px solid var(--green);outline-offset:2px}',
'.csvi-file{margin:12px 0 4px;color:var(--muted);font-size:13px}',
'.csvi-file b{color:var(--text)}',
'.csvi-map{margin-top:8px}',
'.csvi-row{display:grid;grid-template-columns:140px minmax(0,1fr) 150px;gap:4px 8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}',
'.csvi-lab{font-weight:600;display:flex;align-items:center;gap:6px}',
'.csvi-dot{width:8px;height:8px;border-radius:50%;background:var(--line);flex:none}',
'.csvi-hi{background:var(--green)}.csvi-mid{background:var(--orange)}.csvi-lo{background:var(--red)}',
'.csvi-dlg select{width:100%;min-width:0;font:13px var(--body);color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:7px 6px;min-height:36px}',
'.csvi-row>div:empty{display:none}',
'.csvi-prev{grid-column:1/-1;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.csvi-sum{margin:12px 0 6px;padding:10px 12px;border-radius:8px;background:var(--panel2);border:1px solid var(--line)}',
'.csvi-warn{margin:6px 0 0;padding:0 0 0 18px;color:var(--orange);font-size:13px}',
'.csvi-err{color:var(--red)}',
'.csvi-brand{margin:10px 0 0;font-size:13px;color:var(--muted)}',
'.csvi-tz{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--muted)}.csvi-tz select{width:auto}',
'@media(max-width:520px){.csvi-row{grid-template-columns:1fr}.csvi-hd h2{font-size:18px}.csvi-ft .csvi-btn{flex:1}}'
].join('\n');
var UNITOPTS = {
  air_temp_c: [['C', '°C'], ['F', '°F']], water_temp_c: [['C', '°C'], ['F', '°F']],
  ec_mscm: [['mS', 'mS/cm'], ['uS', 'µS/cm'], ['ppm500', 'ppm (500 scale)'], ['ppm700', 'ppm (700 scale)']],
  rh_pct: [['pct', '%'], ['frac', '0 to 1 fraction']]
};
var TZS = [-480, -420, -360, -300, 0, 60, 120, 330, 480, 540, 600, 720];
function el(tag, attrs, kids) {
  var e = document.createElement(tag), k;
  for (k in (attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
  (kids || []).forEach(function (c) { e.appendChild(c); });
  return e;
}
function tzLabel(m) { var a = Math.abs(m); return 'UTC' + (m < 0 ? '-' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + (a % 60) : '') + (m === 480 ? ' (Perth)' : ''); }
function lsKey(heads) { return 'csvi.map.v1.' + heads.map(function (h) { return h.trim().toLowerCase(); }).join('|'); }
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function fmtSpan(ms) {
  var d = ms / 864e5;
  if (d >= 1.95) return (Math.round(d * 10) / 10).toString().replace(/\.0$/, '') + ' days';
  var h = Math.max(1, Math.round(ms / 36e5)); return h + ' hour' + (h > 1 ? 's' : '');
}
function fmtIv(m) { if (m == null) return ''; return m >= 90 && m % 60 === 0 ? 'every ' + m / 60 + ' h' : 'every ' + m + ' min'; }

function open(onDone) {
  if (!document.getElementById('csvi-style')) { var st = el('style', {id: 'csvi-style'}); st.textContent = CSS; document.head.appendChild(st); }
  var prevFocus = document.activeElement, S = {parsed: null, g: null, mapping: {}, units: {}, tz: 480, norm: null, rows: {}};
  var title = el('h2', {id: 'csvi-title', text: 'Import your grow-room data'});
  var xBtn = el('button', {class: 'csvi-btn', type: 'button', 'aria-label': 'Close', text: '×'});
  var fileIn = el('input', {type: 'file', accept: '.csv,.tsv,.txt,text/csv', hidden: ''});
  var pick = el('button', {class: 'csvi-btn', type: 'button', text: 'Choose a CSV file'});
  var samp = el('button', {class: 'csvi-btn', type: 'button', text: 'Try the sample'});
  var drop = el('div', {class: 'csvi-drop'}, [el('p', {text: 'Drop a CSV exported from your controller here (AC Infinity, TrolMaster, Bluelab, SensorPush, Pulse, Inkbird, Govee, Aranet4...).'}), el('div', {class: 'csvi-btns'}, [pick, samp]), fileIn]);
  var fileLine = el('p', {class: 'csvi-file', hidden: ''});
  var brandLine = el('p', {class: 'csvi-brand', hidden: ''});
  var mapBox = el('div', {class: 'csvi-map', hidden: ''});
  var tzSel = el('select', {id: 'csvi-tz'}, TZS.map(function (m) { return el('option', {value: m, text: tzLabel(m)}); }));
  tzSel.value = '480';
  var tzBox = el('label', {class: 'csvi-tz', hidden: ''}, [el('span', {text: 'Times in file are in'}), tzSel]);
  var sum = el('div', {class: 'csvi-sum', hidden: '', 'aria-live': 'polite'});
  var warnList = el('ul', {class: 'csvi-warn', 'aria-live': 'polite'});
  var cancel = el('button', {class: 'csvi-btn', type: 'button', text: 'Cancel'});
  var go = el('button', {class: 'csvi-btn csvi-pri', type: 'button', text: 'Replay my setup'}); go.disabled = true;
  var dlg = el('div', {class: 'csvi-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'csvi-title'}, [
    el('div', {class: 'csvi-hd'}, [title, xBtn]),
    el('div', {class: 'csvi-bd'}, [drop, fileLine, brandLine, sum, warnList, tzBox, mapBox]),
    el('div', {class: 'csvi-ft'}, [cancel, go])]);
  var back = el('div', {class: 'csvi-back'}, [dlg]);
  document.body.appendChild(back);

  function close() { document.removeEventListener('keydown', onKey, true); if (back.parentNode) back.parentNode.removeChild(back); try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {} }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(dlg.querySelectorAll('button,select,input:not([hidden]),[tabindex]'), function (n) { return !n.disabled && !n.hidden && n.offsetParent !== null && n.tabIndex >= 0; }); /* v69 (keyboard round 17 m1): the tabindex=-1 heading is not a Tab stop, so Shift+Tab from Close left the dialog */
    if (!f.length) return;
    var a = f[0], z = f[f.length - 1];
    if (!dlg.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
    else if (f.indexOf(document.activeElement) < 0) { e.preventDefault(); (e.shiftKey ? z : a).focus(); } /* v71 (keyboard round 18 m1): from the heading (focus on open, not a Tab stop) Shift+Tab goes to the last control, not out of the dialog */
    else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  cancel.onclick = xBtn.onclick = close;
  back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
  pick.onclick = function () { fileIn.click(); };
  fileIn.onchange = function () { if (fileIn.files[0]) readFile(fileIn.files[0]); fileIn.value = ''; };
  samp.onclick = function () { load(SAMPLE, 'sample-import.csv'); };
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('csvi-on'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('csvi-on'); }); });
  drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) readFile(f); });
  function readFile(f) {
    var r = new FileReader();
    r.onload = function () { load(String(r.result), f.name); };
    r.onerror = function () { showErr('Could not read that file.'); };
    r.readAsText(f);
  }
  function showErr(msg) { warnList.textContent = ''; var li = el('li', {class: 'csvi-err', text: msg}); warnList.appendChild(li); }

  function load(text, name) {
    var p = parse(text);
    if (!p.headers.length || p.rows.length < 2) { showErr('That does not look like a CSV with readings in it.'); return; }
    var g = guessMapping(p.headers, p.rows, p.meta), key = lsKey(p.headers), saved = lsGet(key), remembered = false;
    if (saved && saved.mapping) {
      var okm = Object.keys(saved.mapping).every(function (k) { var v = saved.mapping[k]; return v == null || (v >= 0 && v < p.headers.length); });
      if (okm) { g.mapping = saved.mapping; g.units = saved.units || g.units; remembered = true; if (saved.tz != null) tzSel.value = String(saved.tz); }
    }
    S.parsed = p; S.g = g; S.mapping = g.mapping; S.units = g.units; S.key = key;
    fileLine.hidden = false; fileLine.textContent = '';
    fileLine.appendChild(el('b', {text: name})); fileLine.appendChild(document.createTextNode(' • ' + p.rows.length + ' rows, ' + p.headers.length + ' columns' + (p.delimiter === ';' ? ', semicolon separated' : p.delimiter === '\t' ? ', tab separated' : '')));
    brandLine.hidden = false;
    brandLine.textContent = (g.brand ? 'Looks like an export from ' + g.brand + ' (a guess). ' : 'Could not tell which controller this is. ') + (remembered ? 'Using the column choices you confirmed last time.' : 'Check the columns below.');
    buildMap(); tzBox.hidden = false; update();
    go.focus();
  }
  function buildMap() {
    mapBox.hidden = false; mapBox.textContent = ''; S.rows = {};
    var p = S.parsed;
    FIELDS.slice(0, 1).concat(['time_of_day'], FIELDS.slice(1)).forEach(function (f) {
      var sel = el('select', {'aria-label': LABEL[f] + ' column'}, [el('option', {value: '', text: '(not in my file)'})].concat(p.headers.map(function (h, i) { return el('option', {value: i, text: h}); })));
      sel.value = S.mapping[f] == null ? '' : String(S.mapping[f]);
      var dot = el('span', {class: 'csvi-dot'}), usel = null, prev = el('div', {class: 'csvi-prev'});
      var cell3 = el('div');
      if (UNITOPTS[f]) {
        usel = el('select', {'aria-label': LABEL[f] + ' unit'}, UNITOPTS[f].map(function (o) { return el('option', {value: o[0], text: o[1]}); }));
        usel.value = S.units[f] || UNITOPTS[f][0][0];
        usel.onchange = function () { S.units[f] = usel.value; update(); };
        cell3.appendChild(usel);
      }
      sel.onchange = function () {
        S.mapping[f] = sel.value === '' ? null : +sel.value;
        if (S.mapping[f] != null && UNITOPTS[f]) { // re-guess the unit for the newly chosen column
          var g2 = guessMapping([p.headers[S.mapping[f]]], p.rows.map(function (r) { return [r[S.mapping[f]]]; }), '');
          var u = g2.units[f] || (g2.units.air_temp_c && /temp/.test(f) ? g2.units.air_temp_c : null);
          if (u && usel) usel.value = S.units[f] = u;
        }
        update();
      };
      mapBox.appendChild(el('div', {class: 'csvi-row'}, [el('div', {class: 'csvi-lab'}, [dot, el('span', {text: LABEL[f]})]), sel, cell3, prev]));
      S.rows[f] = {dot: dot, prev: prev, sel: sel};
    });
  }
  function update() {
    var p = S.parsed; if (!p) return;
    FIELDS.concat(['time_of_day']).forEach(function (f) {
      var r = S.rows[f], i = S.mapping[f];
      if (!r) return;
      var c = i == null ? null : (S.g.confidence[f] == null ? 0.5 : S.g.confidence[f]);
      r.dot.className = 'csvi-dot' + (c == null ? '' : c >= 0.8 ? ' csvi-hi' : c >= 0.5 ? ' csvi-mid' : ' csvi-lo');
      r.prev.textContent = i == null ? '' : 'e.g. ' + p.rows.slice(0, 3).map(function (x) { return x[i]; }).join('  |  ');
    });
    S.tz = +tzSel.value;
    warnList.textContent = '';
    try { S.norm = normalise(p, S.mapping, S.units, {tzOffsetMinutes: S.tz}); } catch (e) { S.norm = null; showErr('Could not read this file: ' + e.message); go.disabled = true; return; }
    var n = S.norm, st = n.stats;
    if (!st.count) { sum.hidden = false; sum.textContent = 'No usable readings yet. Pick the timestamp column above.'; go.disabled = true; }
    else {
      sum.hidden = false;
      sum.textContent = fmtSpan(st.end - st.start) + ' of readings, ' + fmtIv(st.intervalMin) + ': ' + st.fields.map(function (f) { return SHORT[f]; }).join(', ');
      go.disabled = false;
    }
    n.warnings.slice(0, 6).forEach(function (w) { warnList.appendChild(el('li', {text: w})); });
  }
  tzSel.onchange = update;
  go.onclick = function () {
    if (!S.norm || !S.norm.stats.count) return;
    lsSet(S.key, {mapping: S.mapping, units: S.units, tz: S.tz});
    var rows = resampleHourly(S.norm.rows, S.tz), stats = S.norm.stats;
    stats.hourlyCount = rows.length;
    var res = {rows: rows, stats: stats, mapping: S.mapping, units: S.units, brandGuess: S.g.brand};
    close();
    if (typeof onDone === 'function') onDone(res);
  };
  samp.focus();
  return {close: close};
}

global.CsvImport = {parse: parse, guessMapping: guessMapping, normalise: normalise, resampleHourly: resampleHourly, open: open, sampleText: SAMPLE};
})(typeof window !== 'undefined' ? window : this);
