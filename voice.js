/* HyGrow Grow Sim - voice.js : recorded voice-over for Axel, Deb, Rob and Kez. Global: window.Voice.
   Voice.say(who, text) -> true if a clip is playing (caller then skips the procedural blip), false otherwise.
   who: 'axel' | 'deb' | 'rob' | 'regular' (or 'kez'). A clip is found by id = who + '_' + hash8(text); hash8 = FNV-1a 32-bit over the UTF-16
   code units, 8 lowercase hex chars (same function as voice/_build/hash.js). The text is the exact speech-bubble chunk (ui.js say() / story.js line).
   voice/manifest.json ({id:{who,dur,file}}) is fetched lazily on the first call; clips (voice/<id>.webm, opus) are fetched only when played.
   The first bubble of a session may fall back to the blip while the manifest is still loading (a pending line is played if the load finishes within 2.5 s).
   voice/mouth.json ({frame_ms, clips:{id:"0110.."}}, built by voice/_build/mouth.py) is fetched right after the manifest (failure tolerated) and drives lip-sync:
   Voice.playing() -> {who,id,t,dur} while a clip plays (else null); Voice.mouthLevel() -> 0 closed / 1 half / 2 open at the clip's currentTime (0 when nothing plays);
   Voice.mouthOpen() -> true when the level is >= 1 (unchanged contract, axel.js keeps working); Voice.mouthAt(bits, tSeconds, frameMs) -> boolean and
   Voice.levelAt(bits, tSeconds, frameMs) -> 0/1/2 are the pure lookups behind them. Envelope chars: '0' closed, '1' half, '2' open. A legacy two-state
   envelope (only '0'/'1', no '2' anywhere in the string) is read with '1' = open (level 2), so an old mouth.json still drives both frames sensibly.
   Captions hook (a11y.js): every say() call announces itself on window as a 'hygrow:voice' CustomEvent, detail {type:'line', who, text, voiced, dur} (voiced = a clip is playing,
   dur = clip length in seconds, 0 when unknown or not voiced) and, when the clip ends or is cut (stop(), mute, Voice off, a new line), detail {type:'end'}. Nothing listens in headless tests.
   Sprites (v37): voice/sprites.json ({sprites:{name:{file,dur}}, clips:{id:{sprite,start,dur}}}, built by voice/_build/sprites.js) is fetched with the manifest. When it names a clip, the clip is played
   as a segment of voice/sprite_<name>.webm on one shared <audio> element per sprite (currentTime = start, paused at start + dur + 30 ms), else from its own file (also when the sprite fails to load or decode).
   The core sprite is preloaded after the title shows (page load + 1.5 s), a chapter sprite when Campaign.start opens that chapter (Voice.preload(name) does it by hand). Voice.source() -> last chosen source
   {kind:'sprite'|'clip', id, src, start, dur}; Voice.testBypass(true) skips the real play() (headless checks). Mouth timing: playing().t is the audio element's currentTime minus the clip start.
   Web Audio first (v37): a sprite is fetched once, decoded with decodeAudioData (own AudioContext at 24 kHz, falling back to the device rate) and each clip plays as an AudioBufferSourceNode.start(0, start, dur),
   so no byte-range seeking is needed (hosts without Range support work). At most core + one other sprite stay decoded. The <audio> segment path above is the fallback when decoding fails, the per-clip file the last one.
   Respects Sfx.isMuted(). Own toggle (a "Voice" button injected beside #mute) persists in localStorage 'hygrow_voice_v1' ('1' on, default; '0' off). */
(function (w) {
  'use strict';
  var KEY = 'hygrow_voice_v1', BASE = 'voice/';
  var man = null, mouth = null, cur = null, loading = false, failed = false, el = null, pend = null, btn = null, okType = null;
  var spr = null, sprLoading = false, sprEls = {}, sprTimer = 0, bypass = false, lastSrc = null, wantPre = {}, preDone = false; /* v37 sprites */
  var vctx = null, vgain = null, dec = {}, decP = {}, decFail = {}; /* v37 Web Audio path: decoded sprites (core + one other at most) */
  var recent = [], unlocked = false; /* v50: last two chapter sprites kept decoded; unlocked = the context was resumed from a gesture */
  var GUARD = 0.03; /* v37: pause this long after start + dur (the 150 ms gap in the sprite keeps the next clip clear) */

  function hash8(s) { var h = 0x811c9dc5; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + (h >>> 0).toString(16)).slice(-8); }
  function isOn() { try { return w.localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } }
  function setOn(b) { try { w.localStorage.setItem(KEY, b ? '1' : '0'); } catch (e) {} if (!b) { stop(); freeDec(); suspendCtx(); } else { unlock(); warm(); } sync(); }
  function muted() { try { return !!(w.Sfx && w.Sfx.isMuted && w.Sfx.isMuted()); } catch (e) { return false; } }
  function canPlay() {
    if (okType === null) {
      try { var a = document.createElement('audio'); okType = !!(a.canPlayType && a.canPlayType('audio/webm; codecs="opus"')); } catch (e) { okType = false; }
      try { if (w.navigator && w.navigator.connection && w.navigator.connection.saveData) okType = false; } catch (e) {}
    }
    return okType;
  }
  /* v50 (round3 #4): nothing is fetched or decoded unless the voice is on and sound is not muted */
  function gate() { return isOn() && !muted() && canPlay() && !failed; }
  /* captions hook: a11y.js mirrors the spoken line into #captions for the clip's duration */
  var lineOpen = false;
  function emit(detail) {
    try { if (typeof w.dispatchEvent === 'function' && typeof w.CustomEvent === 'function') w.dispatchEvent(new w.CustomEvent('hygrow:voice', { detail: detail })); } catch (e) {}
  }
  function endLine() { if (lineOpen) { lineOpen = false; emit({ type: 'end' }); } }
  function stop() {
    pend = null;
    if (sprTimer) { try { w.clearInterval(sprTimer); } catch (e) {} sprTimer = 0; } /* v37 */
    var was = cur; cur = null;
    endLine();
    if (was && was.wa) { try { if (was.src) { was.src.onended = null; was.src.stop(); } } catch (e) {} return; } /* v37 */
    if (was && was.sprite && sprEls[was.sprite]) { try { sprEls[was.sprite].el.pause(); } catch (e) {} return; } /* v37 sprite element stays loaded */
    if (!el) return;
    try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {}
  }
  /* v37 sprites: one shared <audio> per sprite file */
  function spriteEl(name) {
    var s = sprEls[name];
    if (s) return s.bad ? null : s;
    if (!spr || !spr.sprites || !spr.sprites[name]) return null;
    try {
      var a = new Audio(); a.preload = 'auto';
      s = { el: a, bad: false, name: name }; sprEls[name] = s;
      a.addEventListener('error', function () {
        s.bad = true;
        var c = cur; if (c && c.sprite === name) { cur = null; if (sprTimer) { try { w.clearInterval(sprTimer); } catch (e) {} sprTimer = 0; } if (!playClip(c.entry, c.id)) endLine(); }
      });
      a.addEventListener('ended', function () { if (cur && cur.el === a) { cur = null; endLine(); } });
      a.src = BASE + spr.sprites[name].file;
      return s;
    } catch (e) { return null; }
  }
  function preload(name) {
    if (!name) return false;
    if (!canPlay() || failed) return false;
    if (!gate()) { wantPre[name] = 1; return false; } /* v50: remembered, started on unmute */
    if (!spr) { wantPre[name] = 1; loadSprites(); return false; }
    if (!decFail[name] && spr.sprites && spr.sprites[name] && vc()) { decode(name); return true; }
    return !!spriteEl(name);
  }
  /* v37 Web Audio */
  function vc() {
    if (vctx) return vctx;
    var AC = w.AudioContext || w.webkitAudioContext; if (!AC) return null;
    try { vctx = new AC({ sampleRate: 24000 }); } catch (e) { try { vctx = new AC(); } catch (e2) { vctx = null; } }
    if (vctx) { try { vgain = vctx.createGain(); vgain.connect(vctx.destination); } catch (e) { vctx = null; vgain = null; } }
    return vctx;
  }
  function keepDec(name) { /* v50 (#14): core plus the last two chapter/other sprites */
    if (name !== 'core') { var i = recent.indexOf(name); if (i >= 0) recent.splice(i, 1); recent.push(name); while (recent.length > 2) recent.shift(); }
    for (var n in dec) if (n !== 'core' && recent.indexOf(n) < 0 && !(cur && cur.sprite === n)) delete dec[n];
  }
  function suspendCtx() { /* v51 (round4 #7): muted or Voice off: stop() has already cut the clip; park the voice context so it stops running (the game's own context in audio.js is not touched) */
    try { if (vctx && vctx.state === 'running' && vctx.suspend) { var sp = vctx.suspend(); if (sp && sp.catch) sp.catch(function () {}); } } catch (e) {}
  }
  function freeDec() { dec = {}; decP = {}; recent = []; } /* v50 (#4): player muted: drop decoded buffers (sprites.json stays) */
  function unlock() { /* v50 (#5): create + resume the voice context from a gesture and play one silent sample (iOS) */
    try {
      if (!gate()) return false;
      var c = vc(); if (!c) return false;
      if (c.state !== 'running') { try { var rp = c.resume(); if (rp && rp.catch) rp.catch(function () {}); } catch (e) {} }
      if (!unlocked) { var b = c.createBuffer(1, 1, c.sampleRate), sn = c.createBufferSource(); sn.buffer = b; sn.connect(c.destination); sn.start(0); }
      unlocked = true; return true;
    } catch (e) { return false; }
  }
  function warm() { /* v50: start the core preload (and any remembered chapter) once voice is audible */
    if (!gate()) return; preDone = true; wantPre.core = 1; load();
    if (!spr) loadSprites(); else runPre();
  }
  function decode(name) { /* Promise<AudioBuffer|null>; fetched once, decoded lazily, cached */
    if (dec[name]) return Promise.resolve(dec[name]);
    if (decP[name]) return decP[name];
    if (!gate()) return Promise.resolve(null);
    var c = vc(); if (decFail[name] || !c || !w.fetch || !spr || !spr.sprites[name]) { decFail[name] = 1; return Promise.resolve(null); }
    decP[name] = w.fetch(BASE + spr.sprites[name].file).then(function (r) { if (!r.ok) throw new Error('sprite ' + r.status); return r.arrayBuffer(); }).then(function (ab) {
      return new Promise(function (res, rej) { var p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
    }).then(function (buf) { delete decP[name]; if (!gate()) return null; if (!buf || !(buf.duration > 0)) { decFail[name] = 1; return null; } dec[name] = buf; keepDec(name); return buf; }).catch(function () { delete decP[name]; decFail[name] = 1; return null; });
    return decP[name];
  }
  function playSprite(entry, id, c) {
    if (decFail[c.sprite] || !vc()) return playSpriteEl(entry, id, c);
    if (vctx.state !== 'running') { try { var rr = vctx.resume(); if (rr && rr.catch) rr.catch(function () {}); } catch (e) {} if (playSpriteEl(entry, id, c)) return true; } /* v50 (#5): context not running (iOS before a gesture): the <audio> element path */
    var me = cur = { who: entry.who, id: id, el: null, wa: true, src: null, t0: 0, sprite: c.sprite, start: 0, end: c.dur, entry: entry };
    lastSrc = { kind: 'sprite', via: 'webaudio', id: id, src: BASE + spr.sprites[c.sprite].file, start: c.start, dur: c.dur };
    if (bypass) return true;
    var fall = function () { if (cur !== me) return; cur = null; if (!playSpriteEl(entry, id, c) && !playClip(entry, id)) endLine(); };
    var go = function (buf) {
      if (cur !== me) return;
      var cx = vctx, fire = function () {
        if (cur !== me) return;
        if (cx.state !== 'running') { fall(); return; }
        try {
          var sn = cx.createBufferSource(); sn.buffer = buf;
          var vol = 1; try { if (w.Sfx && w.Sfx.volume) vol = +w.Sfx.volume(); if (!(vol >= 0)) vol = 1; } catch (e) {}
          vgain.gain.value = vol; sn.connect(vgain); me.src = sn; me.t0 = cx.currentTime;
          sn.onended = function () { if (cur === me) { cur = null; endLine(); } };
          sn.start(me.t0, c.start, c.dur);
        } catch (e) { fall(); }
      };
      if (cx.state === 'running') fire(); else {
        var tm = w.setTimeout(function () { if (cur === me && !me.src && cx.state !== 'running') fall(); }, 300); /* v50 (#5): still suspended 300 ms on: <audio> path */
        try { cx.resume().then(function () { w.clearTimeout(tm); fire(); }, function () { w.clearTimeout(tm); fall(); }); } catch (e) { w.clearTimeout(tm); fall(); }
      }
    };
    if (dec[c.sprite]) go(dec[c.sprite]); else decode(c.sprite).then(function (buf) { if (buf) go(buf); else fall(); });
    return true;
  }
  function chapterSprite(id) { if (typeof id === 'string') return id.indexOf('sq_') === 0 ? 'ch2' : null; id = +id; return id >= 0 ? 'ch' + id : null; }
  function runPre() { if (!spr || !gate()) return; if (!preDone) { preDone = true; wantPre.core = 1; } var q = wantPre; wantPre = {}; for (var k in q) preload(k); }
  function playSpriteEl(entry, id, c) { /* <audio> segment path (fallback) */
    var s = spriteEl(c.sprite); if (!s) return false;
    var me = cur = { who: entry.who, id: id, el: s.el, sprite: c.sprite, start: c.start, end: c.start + c.dur, entry: entry };
    lastSrc = { kind: 'sprite', via: 'audio', id: id, src: BASE + spr.sprites[c.sprite].file, start: c.start, dur: c.dur };
    if (bypass) return true;
    try {
      /* the browser can only seek once the range is seekable (a host without Range requests needs the whole sprite first): wait for it, then seek and play; give up after 6 s and use the clip file */
      var begun = false, t0 = Date.now();
      var covers = function () { try { var sk = s.el.seekable; for (var i = 0; i < sk.length; i++) if (sk.start(i) <= c.start + 0.01 && sk.end(i) >= c.start + c.dur) return true; } catch (e) {} return false; };
      var begin = function () { begun = true; s.el.currentTime = c.start; var p = s.el.play(); if (p && p.catch) p.catch(function () { if (cur === me) cur = null; }); };
      var tickFn = function () {
        if (cur !== me) { w.clearInterval(sprTimer); sprTimer = 0; return; }
        if (!begun) {
          if (covers()) begin();
          else if (Date.now() - t0 > 6000 || (s.el.readyState >= 3 && s.el.buffered.length && s.el.buffered.end(s.el.buffered.length - 1) >= (s.el.duration || 1e9) - 0.2)) { /* timed out, or fully loaded and still unseekable (host without Range support) */ w.clearInterval(sprTimer); sprTimer = 0; cur = null; if (!playClip(entry, id)) endLine(); }
          return;
        }
        var t = s.el.currentTime || 0;
        if (t >= me.end + GUARD && t < me.end + 30) { try { s.el.pause(); } catch (e) {} w.clearInterval(sprTimer); sprTimer = 0; cur = null; endLine(); }
      };
      if (covers()) begin();
      sprTimer = w.setInterval(tickFn, 10);
      return true;
    } catch (e) { cur = null; return false; }
  }
  function loadSprites() { /* v37: failure tolerated (per-clip files then) */
    if (spr || sprLoading) return; sprLoading = true;
    try { w.fetch(BASE + 'sprites.json').then(function (r) { if (!r.ok) throw new Error('sprites ' + r.status); return r.json(); }).then(function (j) { if (j && j.sprites && j.clips) spr = j; sprLoading = false; runPre(); settle(); }).catch(function () { sprLoading = false; settle(); }); } catch (e) { sprLoading = false; }
  }
  function settle() { /* a pending first line plays once the manifest and sprites.json have both answered */
    if (!man || sprLoading) return;
    var p = pend; pend = null;
    if (p && Date.now() - p.t < 2500) say(p.who, p.text);
  }
  function load() {
    if (man || loading || failed) return;
    loading = true; loadSprites(); /* v37 */
    try {
      w.fetch(BASE + 'manifest.json').then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); }).then(function (j) {
        man = j || {}; loading = false;
        try { w.fetch(BASE + 'mouth.json').then(function (r) { if (!r.ok) throw new Error('mouth ' + r.status); return r.json(); }).then(function (m) { if (m && m.clips && typeof m.clips === 'object') mouth = m; }).catch(function () {}); } catch (e) {}
        settle(); /* v37 */
      }).catch(function () { loading = false; failed = true; });
    } catch (e) { loading = false; failed = true; }
  }
  function playClip(entry, id) {
    lastSrc = { kind: 'clip', id: id, src: BASE + entry.file, start: 0, dur: entry.dur || 0 }; /* v37 */
    if (bypass) { cur = { who: entry.who, id: id, el: null, entry: entry }; return true; } /* v37 */
    try {
      if (!el) {
        el = new Audio(); el.preload = 'auto';
        try { el.addEventListener('ended', function () { cur = null; endLine(); }); el.addEventListener('error', function () { cur = null; endLine(); }); } catch (e) {}
      }
      el.src = BASE + entry.file;
      cur = { who: entry.who, id: id, el: el, entry: entry }; /* v37 */
      var p = el.play(); if (p && p.catch) p.catch(function () { if (cur && cur.id === id) cur = null; });
      return true;
    } catch (e) { cur = null; return false; }
  }
  function play(entry, id) { /* v37: sprite segment first, own file otherwise */
    var c = spr && spr.clips && spr.clips[id];
    if (c && spr.sprites && spr.sprites[c.sprite] && c.dur > 0 && playSprite(entry, id, c)) return true;
    return playClip(entry, id);
  }
  /* lip-sync helpers */
  function playing() {
    if (!cur) return null;
    if (cur.wa) { /* v37 Web Audio: seconds since the clip began */
      if (!cur.src || !vctx) return null;
      var tw = vctx.currentTime - cur.t0, ew = man && man[cur.id];
      if (tw >= cur.end) return null; if (tw < 0) tw = 0;
      return { who: cur.who, id: cur.id, t: tw, dur: ew && ew.dur ? ew.dur : cur.end };
    }
    if (!cur.el) return null; /* v37 */
    try {
      var a = cur.el;
      if (a.paused || a.ended) return null;
      var e = man && man[cur.id], t = (a.currentTime || 0) - (cur.start || 0); /* v37: relative to the clip start */
      if (cur.sprite) { if (t >= cur.end - cur.start) return null; if (t < 0) t = 0; }
      return { who: cur.who, id: cur.id, t: t, dur: e && e.dur ? e.dur : (isFinite(a.duration) && !cur.sprite ? a.duration : 0) };
    } catch (err) { return null; }
  }
  function mouthAt(bits, t, frameMs) {
    if (!bits || !(t >= 0)) return false;
    var f = frameMs > 0 ? frameMs : 50, i = Math.floor(t * 1000 / f + 1e-9);
    if (i >= bits.length) return false;
    var c = bits.charAt(i);
    return c === '1' || c === '2';
  }
  /* 0 closed / 1 half / 2 open. Legacy two-state envelope ('0'/'1' only): '1' counts as 2 (open). */
  function levelAt(bits, t, frameMs) {
    if (!bits || !(t >= 0)) return 0;
    var f = frameMs > 0 ? frameMs : 50, i = Math.floor(t * 1000 / f + 1e-9);
    if (i >= bits.length) return 0;
    var c = bits.charAt(i);
    if (c === '2') return 2;
    if (c === '1') return bits.indexOf('2') < 0 ? 2 : 1;
    return 0;
  }
  function hasMouth() { var p = playing(); return !!(p && mouth && mouth.clips[p.id]); }   // true when the playing clip has an envelope (callers fall back to a clock otherwise)
  function mouthLevel() {
    var p = playing(); if (!p || !mouth) return 0;
    return levelAt(mouth.clips[p.id], p.t, mouth.frame_ms);
  }
  function mouthOpen() { return mouthLevel() >= 1; }
  function say(who, text) {
    stop();
    var voiced = false, dur = 0, id = null;
    try {
      if (who === 'kez') who = 'regular';
      if (text && isOn() && !muted() && canPlay() && !failed) {
        if (!man || sprLoading) { pend = { who: who, text: text, t: Date.now() }; load(); }
        else { id = who + '_' + hash8(text); var e = man[id]; if (e && e.file) { voiced = play(e, id); dur = voiced && e.dur > 0 ? +e.dur : 0; } }
      }
    } catch (err) { voiced = false; }
    if (text) { lineOpen = true; emit({ type: 'line', who: who, text: String(text), voiced: voiced, dur: dur }); }
    return voiced;
  }

  /* "Voice" button beside the mute button */
  function sync() {
    if (!btn) return;
    var on = isOn();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Voice-over on (tap to switch to blips)' : 'Voice-over off (tap to switch on)';
  }
  function mount() {
    if (btn || !document.getElementById) return;
    var m = document.getElementById('mute'); if (!m || !m.parentNode) return;
    btn = document.createElement('button'); btn.type = 'button'; btn.id = 'voiceBtn'; btn.className = 'menu'; btn.textContent = 'Voice'; btn.setAttribute('aria-label', 'Voice-over on or off');
    btn.onclick = function () { setOn(!isOn()); };
    m.insertAdjacentElement('afterend', btn); sync();
  }
  /* a dismissed bubble / mute / leaving the tab cuts the clip: ride on Sfx.stopVoice and Sfx.mute (ui.js and story.js already call them) */
  try {
    var S = w.Sfx;
    if (S && S.stopVoice && !S.__voiceWrapped) { var o1 = S.stopVoice; S.stopVoice = function () { stop(); return o1.apply(this, arguments); }; }
    if (S && S.mute && !S.__voiceWrapped) { var o2 = S.mute; S.mute = function (b) { if (b) { stop(); freeDec(); suspendCtx(); } var r = o2.apply(this, arguments); if (!b) { unlock(); warm(); } return r; }; } /* v50: unmute tap = unlock + preload; mute frees the buffers */
    if (S && S.volume && !S.__voiceWrapped) { var o4 = S.volume; S.volume = function (v) { var r = o4.apply(this, arguments); try { if (arguments.length && vgain) vgain.gain.value = +o4.call(this); } catch (e) {} return r; }; } /* v50 (#16): a running clip follows the slider */
    if (S) S.__voiceWrapped = true;
  } catch (e) {}
  try { document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); }); } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  /* v50 (#5): resume the voice context from the first tap (the game's own context does the same in audio.js) */
  try {
    ['pointerdown', 'touchend'].forEach(function (ev) {
      document.addEventListener(ev, function h() { if (!gate()) return; unlock(); if (vctx && vctx.state === 'running') document.removeEventListener(ev, h, true); }, true);
    });
  } catch (e) {}
  /* v37: preload the core sprite once the title has shown; preload a chapter's sprite when that chapter opens */
  function afterTitle() { try { if (gate()) warm(); } catch (e) {} } /* v50 (#4): muted = no fetch, no context */
  try { if (typeof w.setTimeout === 'function') { if (document.readyState === 'complete') w.setTimeout(afterTitle, 1500); else w.addEventListener('load', function () { w.setTimeout(afterTitle, 1500); }); } } catch (e) {}
  try {
    var Cm = w.Campaign;
    if (Cm && Cm.start && !Cm.__voiceWrapped) { var o3 = Cm.start; Cm.start = function (id) { try { preload(chapterSprite(id)); } catch (e) {} return o3.apply(this, arguments); }; Cm.__voiceWrapped = true; }
  } catch (e) {}

  w.Voice = { unlock: unlock, preload: preload, source: function () { return lastSrc; }, testBypass: function (b) { bypass = !!b; }, say: say, stop: stop, isOn: isOn, setOn: setOn, hash8: hash8, playing: playing, mouthOpen: mouthOpen, mouthLevel: mouthLevel, hasMouth: hasMouth, mouthAt: mouthAt, levelAt: levelAt, ready: function () { return !!man; } };
})(window);
