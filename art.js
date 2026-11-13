/* HyGrow Grow Sim — art.js
   Cut-out style SVG art: Quinn the Quokka (rigged), procedural plants, tent scene, particles.
   Global: window.Art */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const OUT = '#2a1d14';           // cut-out outline
  const SW = 3.2;                  // outline width
  // seeded rng for deterministic plant layout
  const rng = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const mix = (a, b, t) => {
    const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
    return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };

  /* ---------------- QUINN THE QUOKKA ---------------- */
  function quinn(parent) {
    const g = el('g', { class: 'quinn' }, parent);
    const C = { fur: '#a9805c', furDark: '#8a6446', belly: '#e2c29c', pink: '#e9a3a0', apron: '#2f8f3a', apronDark: '#246f2d' };
    const root = el('g', {}, g);
    // tail
    el('path', { d: 'M62 205 Q30 210 26 236 Q40 232 70 222 Z', fill: C.furDark, stroke: OUT, 'stroke-width': SW, 'stroke-linejoin': 'round' }, root);
    // feet
    el('ellipse', { cx: 78, cy: 246, rx: 22, ry: 9, fill: C.furDark, stroke: OUT, 'stroke-width': SW }, root);
    el('ellipse', { cx: 124, cy: 246, rx: 22, ry: 9, fill: C.furDark, stroke: OUT, 'stroke-width': SW }, root);
    // body (breathes)
    const body = el('g', { class: 'q-body' }, root);
    el('path', { d: 'M100 120 C142 120 156 170 150 210 C146 238 124 248 100 248 C76 248 54 238 50 210 C44 170 58 120 100 120 Z', fill: C.fur, stroke: OUT, 'stroke-width': SW }, body);
    el('path', { d: 'M100 150 C124 150 132 180 128 210 C125 232 112 238 100 238 C88 238 75 232 72 210 C68 180 76 150 100 150 Z', fill: C.belly }, body);
    // apron
    el('path', { d: 'M70 160 L130 160 L136 232 Q100 244 64 232 Z', fill: C.apron, stroke: OUT, 'stroke-width': SW, 'stroke-linejoin': 'round' }, body);
    el('path', { d: 'M74 160 Q100 132 126 160', fill: 'none', stroke: C.apronDark, 'stroke-width': 4 }, body);
    el('rect', { x: 86, y: 196, width: 28, height: 20, rx: 4, fill: C.apronDark, stroke: OUT, 'stroke-width': 2 }, body);
    // apron leaf logo (HyGrow-ish leaves)
    const logo = el('g', { transform: 'translate(100 178)' }, body);
    [-40, 0, 40].forEach(a => el('path', { d: 'M0 0 Q-5 -9 0 -16 Q5 -9 0 0 Z', fill: '#f0f4f0', transform: `rotate(${a})` }, logo));
    // arms
    const armL = el('g', { class: 'q-armL' }, root);
    el('path', { d: 'M62 160 Q40 180 44 204 Q52 210 58 202 Q58 186 72 172 Z', fill: C.fur, stroke: OUT, 'stroke-width': SW, 'stroke-linejoin': 'round' }, armL);
    const armR = el('g', { class: 'q-armR' }, root);
    el('path', { d: 'M138 160 Q160 180 156 204 Q148 210 142 202 Q142 186 128 172 Z', fill: C.fur, stroke: OUT, 'stroke-width': SW, 'stroke-linejoin': 'round' }, armR);
    // head
    const head = el('g', { class: 'q-head' }, root);
    // ears
    el('ellipse', { cx: 62, cy: 52, rx: 16, ry: 18, fill: C.fur, stroke: OUT, 'stroke-width': SW }, head);
    el('ellipse', { cx: 62, cy: 54, rx: 8, ry: 10, fill: C.pink }, head);
    el('ellipse', { cx: 138, cy: 52, rx: 16, ry: 18, fill: C.fur, stroke: OUT, 'stroke-width': SW }, head);
    el('ellipse', { cx: 138, cy: 54, rx: 8, ry: 10, fill: C.pink }, head);
    el('path', { d: 'M100 44 C146 44 156 82 152 104 C148 132 126 142 100 142 C74 142 52 132 48 104 C44 82 54 44 100 44 Z', fill: C.fur, stroke: OUT, 'stroke-width': SW }, head);
    // muzzle + cheeks
    el('ellipse', { cx: 100, cy: 112, rx: 30, ry: 22, fill: C.belly }, head);
    el('ellipse', { cx: 70, cy: 112, rx: 9, ry: 6, fill: C.pink, opacity: 0.6 }, head);
    el('ellipse', { cx: 130, cy: 112, rx: 9, ry: 6, fill: C.pink, opacity: 0.6 }, head);
    // eyes
    const eyes = el('g', { class: 'q-eyes' }, head);
    [80, 120].forEach(x => {
      const e = el('g', {}, eyes);
      el('ellipse', { cx: x, cy: 88, rx: 7.5, ry: 9.5, fill: OUT }, e);
      el('circle', { cx: x + 2.5, cy: 84.5, r: 2.6, fill: '#fff' }, e);
    });
    // nose
    el('path', { d: 'M91 100 Q100 95 109 100 Q106 108 100 109 Q94 108 91 100 Z', fill: OUT }, head);
    // mouths
    const mClosed = el('path', { class: 'q-mouth-c', d: 'M88 116 Q94 124 100 116 Q106 124 112 116', fill: 'none', stroke: OUT, 'stroke-width': 2.6, 'stroke-linecap': 'round' }, head);
    const mOpen = el('g', { class: 'q-mouth-o', style: 'display:none' }, head);
    el('path', { d: 'M88 114 Q100 136 112 114 Q100 119 88 114 Z', fill: '#5a1f1f', stroke: OUT, 'stroke-width': 2.2 }, mOpen);
    el('path', { d: 'M93 124 Q100 131 107 124 Q100 121 93 124 Z', fill: '#e07a7a' }, mOpen);

    // pivots
    const piv = (node, x, y) => { node.style.transformBox = 'view-box'; node.style.transformOrigin = `${x}px ${y}px`; };
    piv(body, 100, 248); piv(head, 100, 140); piv(armL, 66, 166); piv(armR, 134, 166); piv(eyes, 100, 88);

    const st = { talkUntil: 0, waveUntil: 0, nextBlink: 1500, mood: 'happy', hop: 0 };
    return {
      node: g,
      talk(ms) { st.talkUntil = performance.now() + ms; },
      wave(ms = 1600) { st.waveUntil = performance.now() + ms; },
      hop() { st.hop = performance.now(); },
      mood(m) { st.mood = m; },
      update(t) {
        const breath = Math.sin(t / 650);
        body.style.transform = `scaleY(${1 + breath * 0.012})`;
        let hop = 0;
        if (st.hop) { const k = (t - st.hop) / 450; if (k < 1) hop = -Math.sin(k * Math.PI) * 18; else st.hop = 0; }
        root.setAttribute('transform', `translate(0 ${hop})`);
        const worried = st.mood === 'worried';
        head.style.transform = `rotate(${Math.sin(t / 1300) * 3 + (worried ? -6 : 0)}deg) translateY(${breath * 1.2}px)`;
        // blink
        if (t > st.nextBlink) { st.blinkAt = t; st.nextBlink = t + 2500 + (t % 2300); }
        const bk = st.blinkAt ? (t - st.blinkAt) / 140 : 9;
        eyes.style.transform = `scaleY(${bk < 1 ? 0.1 : 1})`;
        // talk
        const talking = t < st.talkUntil;
        const open = talking && Math.floor(t / 110) % 2 === 0;
        mClosed.style.display = open ? 'none' : '';
        mOpen.style.display = open ? '' : 'none';
        // arms
        if (t < st.waveUntil) armR.style.transform = `rotate(${-110 + Math.sin(t / 90) * 22}deg)`;
        else armR.style.transform = `rotate(${talking ? Math.sin(t / 180) * 10 - 10 : Math.sin(t / 900) * 3}deg)`;
        armL.style.transform = `rotate(${worried ? 25 : Math.sin(t / 1000) * 3}deg)`;
      }
    };
  }

  /* ---------------- PLANTS ---------------- */
  // Art.plant(parent, p). p = {crop, stage (0 propagation, 1 vegetative, 2 flower, 3 fruit), size 0..1, fruits:[{size 0..1, ripe 0..1}],
  //   health 0..100, wilt 0..1, chlorosis 0..1, pests bool, spots 0..1, seed, stake bool,
  //   bolt 0..1 (lettuce flower stalk / basil flower spikes), cut 0..1 (basil just cut back), mildew 0..1 (white powder), yellow 0..1 (extra chlorosis),
  //   per-crop problem looks, all 0..1, all default 0 (omitted = 0 = the exact same SVG as before), each at most 6 extra nodes per plant:
  //     tipburn  lettuce  brown crisp edges on the heart / inner leaves (3 nodes: g.tipburn + 2 paths)
  //     (bolt > 0.6 on lettuce also opens small yellow flower buds on the stalk: 2 nodes, .budding)
  //     cold     basil    leaf tips go dark purple / black and curl (2 nodes: path.coldtip + path.coldcurl)
  //     leggy    basil    low light: longer internodes, smaller paler leaves, pale stretched stems (1 extra node: path.leggy)
  //     bitter   cucumber fruit go pale, curved and pinched at the waist (geometry change, fruit gets class "fruit bitter", +1 node: path.bitter)
  //     mgdef    cucumber yellow wedges between the veins at the leaf edge, oldest leaves first (one path.mgdef per leaf, at most 6, inside the leaf wrapper)
  //     drop     chilli / capsicum  blossom drop: fewer flowers on the plant, small fallen flowers at the base (2 nodes: path.drop + path.dropc)
  //     scald    chilli / capsicum  pale sunken sunscald patch on the upward side of the fruit (2 nodes: path.scald + path.scaldin, at most 6 fruit)
  //   pass 8 problem looks (same rules: 0..1, default 0, drawn only above 0.02, at most 8 extra nodes per field, healthy plants byte-identical):
  //     ber        tomato / capsicum  blossom end rot: dark sunken patch at the bottom of every fruit (2 nodes: path.ber + path.berrim, at most 8 fruit)
  //     crack      tomato   fruit cracking: a split line on ripe fruit (2 nodes: path.crack + path.crackin, at most 6 fruit)
  //     curl       tomato   heat leaf curl: leaflets roll up (narrower, paler) with a rolled dark edge (2 nodes: path.curl + path.curlhi)
  //     captip     capsicum calcium tipburn: brown crisp tips on the young upper leaves (2 nodes: path.captip + path.captipe, at most 16 leaves)
  //     smallfruit capsicum fruit drawn at 70% size at 1 (geometry only, no new nodes, fruit gets class "fruit small")
  //     aphid      chilli   tiny green aphids clustered on the growing tips (2 nodes: path.aphid + path.aphidhi, at most 4 tips)
  //     thinfruit  chilli   narrower, paler pods (geometry only, no new nodes, fruit gets class "fruit thin")
  //     greymould  strawberry  grey fuzz on ripe berries (2 nodes: path.botrytis + path.botfuzz, at most 6 berries)
  //     runners    strawberry  long thin runner stems with a plantlet at the end (2 nodes: path.runner + path.runnerp, 1 to 3 runners)
  //     smallberry strawberry  berries 70% size and paler at 1 (geometry only, no new nodes, fruit gets class "fruit small")
  //     slugbite   lettuce  ragged chewed holes and a slime trail on the outer leaves (2 nodes: path.bite + path.slime)
  //     rootrot    lettuce  warm-tank root trouble: outer leaves yellow, limp, with a wet brown rib (leaves get class "rotleaf" for free, +1 node: path.rotribs)
  //     downy      basil    downy mildew: yellow blotches between the veins, grey fuzz on the leaf underside edge (2 nodes: path.downy + path.downyfuzz)
  //     fusarium   basil    one-sided wilt: the stems on one side droop and yellow, a brown streak up the stem (+1 node: path.halfwilt)
  //     spidermite cucumber fine pale stippling on the leaves, oldest first, and a little web (one path.mite per leaf, at most 5, inside the leaf wrapper, +1 path.miteweb)
  //     mushyfruit cucumber fruit soft and yellowing at the tip (2 nodes: path.mushy + path.mushyin, at most 6 fruit)}
  //   pass 8b (docs/PLAYTEST-DEV-v34.md friction 2, "the plant barely shows trouble"):
  //     health   drives the look harder: below 60 % the leaves yellow progressively, below 40 % they dull and the plant wilts at 0.4 or more, below 25 % leaf edges brown (class "browned", 1 node)
  //     scorch   EC burn on any crop: scorched brown leaf tips (2 nodes: path.scorch + path.scorche, at most 8 leaves)
  //     limp     root rot / warm tank on any crop: the canopy droops and the low leaves yellow (no new nodes)
  //     aphid    now 4 nodes: path.honey (sticky honeydew shine), path.aphid (pale bodies), path.aphiddot (dark dots), path.aphidhi
  // Every crop is drawn with the pot rim at (0,0) growing upward (negative y) and stays inside x -150..150, y -330..0 so it fits the tent.
  // Layout is deterministic from p.seed through h01(); nothing here may call Math.random. Full-size plants stay under ~120 SVG nodes.
  const h01 = (seed, i, k = 0) => { const x = Math.sin((seed + 1) * 12.9898 + i * 78.233 + k * 37.719) * 43758.5453; return x - Math.floor(x); };
  const lighten = (c, t) => mix(c, 'f4ffd0', t);
  const clamp01 = v => Math.max(0, Math.min(1, v || 0));
  const n1 = v => (Math.round(v * 10) / 10).toString();
  const tf = (x, y, a = 0, s = 1) => `translate(${n1(x)} ${n1(y)})` + (a ? ` rotate(${n1(a)})` : '') + (s !== 1 ? ` scale(${n1(s)})` : '');
  // keep a leaf of length L hanging from (., y) at angle a (deg from up) above the pot rim
  const capAng = (a, y, L) => { const lim = Math.acos(Math.max(-1, Math.min(0, (y + 8) / L))) * 180 / Math.PI; return Math.sign(a) * Math.min(Math.abs(a), lim); };
  const dots = (g, p, pts, spread) => { if (p.pests) for (let i = 0; i < 9; i++) { const q = pts[Math.floor(h01(p.seed || 7, i, 9) * pts.length)] || pts[0]; el('circle', { cx: q[0] + (h01(p.seed || 7, i, 3) - 0.5) * spread, cy: q[1] + (h01(p.seed || 7, i, 4) - 0.5) * 12, r: 2.4, fill: '#fff6a8', stroke: '#6a3a12', 'stroke-width': 1, class: 'pest' }, g); } }; /* pass 8b: r 1.7 -> 2.4 and a dark outline, so mites read at tent size */

  // ---- problem animation hooks (driven by the tent scene's update loop) ----
  // wiltAngle(severity 0..1, baseAngle deg) -> droop angle in degrees: base + up to WILT_MAX, clamped to +-85. Monotonic in severity.
  // pestCount(severity 0..1) -> crawling pest dots: 0 at 0, 3 for any severity above 0, up to 6 at 1.
  const WILT_MAX = 34;
  const wiltAngle = (sev, base) => Math.max(-85, Math.min(85, (isFinite(base) ? +base : 0) + WILT_MAX * clamp01(sev)));
  const pestCount = sev => { const s = clamp01(sev); return s > 0 ? Math.min(6, 3 + Math.round(s * 3)) : 0; };
  // rotate a leaf-local point (x, y) by a degrees then move it to (ox, oy): the same maths as transform="translate(ox oy) rotate(a)"
  const rotP = (ox, oy, a, x, y) => { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [ox + x * c - y * s, oy + x * s + y * c]; };
  const ptS = q => n1(q[0]) + ' ' + n1(q[1]);
  // crisp edge along the top of a leaf (top at local -L, the edge bows toward the base by dm at the middle, half width x0), covering `ext` of the width; dy moves it inward
  const topEdgeD = (ox, oy, a, L, x0, dm, ext, dy = 0) => { const xe = x0 * ext, de = dm * (1 - ext * ext), ce = 2 * dm - de; return `M${ptS(rotP(ox, oy, a, -xe, -L + de + dy))} Q${ptS(rotP(ox, oy, a, 0, -L + ce + dy))} ${ptS(rotP(ox, oy, a, xe, -L + de + dy))} `; };
  // n small rounded petals centred at (cx, cy), turned by rot radians (same shape as petalsD but placed in absolute coordinates)
  const petalsAtD = (cx, cy, n, R, w, rot) => { let d = ''; for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2 + rot, a1 = ((i + 1) / n) * Math.PI * 2 + rot, am = (a0 + a1) / 2; d += (i ? '' : `M${n1(cx + Math.cos(a0) * w)} ${n1(cy + Math.sin(a0) * w)}`) + ` Q${n1(cx + Math.cos(am) * R * 1.7)} ${n1(cy + Math.sin(am) * R * 1.7)} ${n1(cx + Math.cos(a1) * w)} ${n1(cy + Math.sin(a1) * w)}`; } return d + 'Z '; };
  // collector for the plant being drawn: leaf wrapper groups (rotated by the scene for wilt / heat tremble), leaf anchor points, mildew group
  let CUR = null;
  function lfGroup(g, px, py, s) {
    const n = el('g', { class: 'lf' }, g);
    if (CUR) CUR.lf.push({ n, px: n1(px), py: n1(py), s: s < 0 ? -1 : 1, k: 0.75 + 0.5 * h01(CUR.seed, CUR.lf.length, 41), a: 0 });
    return n;
  }

  // shared palette + health state for one plant
  function palette(p) {
    const hl = p.health ?? 100, healthT = clamp01((100 - hl) / 100);
    /* pass 8b: below 60 % health the chlorosis climbs with it (1 at 20 %); below 40 % the leaves dull and the plant wilts at 0.4 or more; below 25 % the edges brown (leafDamage). Healthy plants are untouched. */
    const hy = hl < 60 ? clamp01((60 - hl) / 40) : 0, dull = hl < 40 ? clamp01((40 - hl) / 25) : 0, hw = hl < 40 ? 0.4 + 0.3 * clamp01((40 - hl) / 40) : 0, brown = hl < 25 ? clamp01((25 - hl) / 20) : 0, limp = clamp01(p.limp);
    const lost = p.lost ? 1 : 0; /* v37 [M29]: a lost plant is the full wilt and cold looks plus a brown tint, no new art */
    const chl = clamp01(Math.max(p.chlorosis || 0, p.yellow || 0, healthT * 0.5, hy, limp * 0.45, lost)), wilt = clamp01(Math.max(p.wilt || 0, hw, limp * 0.55, lost));
    const dl = c => lost ? mix(mix(c, '8a8456', 0.6), '6b4a2a', 0.7) : dull > 0 ? mix(c, '8a8456', 0.6 * dull) : c; /* v37 */
    return {
      seed: p.seed || 7, size: clamp01(Math.max(0.04, p.size || 0)), stage: p.stage || 0, chl, wilt, sp: clamp01(p.spots), mil: clamp01(p.mildew), brown: lost ? 1 : brown, /* v37 */ scorch: clamp01(p.scorch),
      // leaf fill at height t (0 base .. 1 top) and shade (0 light .. 1 dark). Chlorosis / yellowing pales the low leaves first.
      leaf: (t, shade = 0) => dl(mix(mix('5cba46', '2f7a2a', shade), 'e4d44f', clamp01(chl * (2 - 1.6 * t)))),
      stem: (t = 0) => lost ? mix('a39b3a', '5a3d22', 0.75) : mix('5a9e3a', 'a39b3a', clamp01(chl * (1.6 - t))), /* v37 */
      tip: () => dl(mix('8ad85a', 'e4d44f', chl * 0.6))
    };
  }
  // thick stem with cut-out outline: two strokes on the same path
  function stem(g, d, w, col) {
    el('path', { d, fill: 'none', stroke: OUT, 'stroke-width': w + 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    el('path', { d, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
  }
  const polyD = pts => 'M' + pts.map(q => n1(q[0]) + ' ' + n1(q[1])).join(' L');
  // leaf outlines, base at (0,0) pointing up. tip 0 = round, 1 = pointed
  const ovalD = (L, W, tip = 0.3) => `M0 0 C${n1(-W)} ${n1(-L * 0.12)} ${n1(-W * (1.08 - tip * 0.3))} ${n1(-L * (0.58 + tip * 0.15))} 0 ${n1(-L)} C${n1(W * (1.08 - tip * 0.3))} ${n1(-L * (0.58 + tip * 0.15))} ${n1(W)} ${n1(-L * 0.12)} 0 0 Z`;
  // serrated oval (strawberry leaflet)
  const serratedD = (L, W) => { let d = 'M0 0'; const n = 5; for (let s = -1; s <= 1; s += 2) { const pts = []; for (let i = 1; i <= n; i++) { const t = i / (n + 1), w = W * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (i % 2 ? 1.05 : 0.82); pts.push([s * w, -L * t]); } if (s < 0) d += ' L' + pts.map(q => n1(q[0]) + ' ' + n1(q[1])).join(' L') + ` L0 ${n1(-L)}`; else d += ' L' + pts.reverse().map(q => n1(q[0]) + ' ' + n1(q[1])).join(' L'); } return d + ' Z'; };
  // broad lobed cucumber leaf, centred on the petiole end, pointing right along +x
  const lobedD = R => { const V = [[0, 1], [27, 0.6], [55, 0.86], [85, 0.56], [115, 0.62], [148, 0.34], [180, 0.2]]; const q = V.concat(V.slice(1, -1).reverse().map(([a, r]) => [-a, r])); return 'M' + q.map(([a, r]) => { const t = a * Math.PI / 180; return n1(Math.cos(t) * r * R + R * 0.22) + ' ' + n1(Math.sin(t) * r * R * 0.92); }).join(' L') + ' Z'; };
  const lobedVeinsD = R => [0, 55, -55, 115, -115].map(a => { const t = a * Math.PI / 180, r = a === 0 ? 0.9 : Math.abs(a) === 55 ? 0.78 : 0.5; return `M${n1(R * 0.06)} 0 L${n1(Math.cos(t) * r * R + R * 0.22)} ${n1(Math.sin(t) * r * R * 0.92)}`; }).join(' ');
  // frilly lettuce leaf pointing up from (0,0)
  const frillD = (L, W, amp, ph) => { const q = []; for (let j = 0; j < 28; j++) { const u = j / 28 * Math.PI * 2, su = Math.sin(u), m = 1 + (su < 0.15 ? amp * Math.sin(7 * u + ph) : 0); q.push([W * Math.cos(u) * m * (1 - 0.55 * Math.pow(Math.max(0, su), 2)) * (1 - 0.45 * Math.max(0, su)), -L * 0.5 + L * 0.5 * su * (su < 0 ? m : 1)]); } return polyD(q) + ' Z'; };
  // n-pointed star (tomato flower, calyxes) and n rounded petals (white/yellow flowers)
  const starD = (n, R, r, rot = -90) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = (rot + i * 180 / n) * Math.PI / 180, rr = i % 2 ? r : R; d += (i ? 'L' : 'M') + n1(Math.cos(a) * rr) + ' ' + n1(Math.sin(a) * rr); } return d + 'Z'; };
  const petalsD = (n, R, w = R * 0.3) => { let d = ''; for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2, am = (a0 + a1) / 2; d += (i ? '' : `M${n1(Math.cos(a0) * w)} ${n1(Math.sin(a0) * w)}`) + ` Q${n1(Math.cos(am) * R * 1.7)} ${n1(Math.sin(am) * R * 1.7)} ${n1(Math.cos(a1) * w)} ${n1(Math.sin(a1) * w)}`; } return d + 'Z'; };
  const STAR5 = starD(5, 7, 3.2), PETAL5 = petalsD(5, 6.5), CALYX = starD(5, 6, 2.2) + ' M0 -3 L0 -9', TRUMPET = petalsD(5, 7, 4.2);
  // 2-node flower: petals + centre. kind: 'star' (tomato), 'round' (white/strawberry), 'trumpet' (cucumber)
  function flower(g, x, y, s, petal = '#ffd23f', centre = '#e08a1e', kind = 'star') {
    const t = tf(x, y, 0, s), d = kind === 'star' ? STAR5 : kind === 'trumpet' ? TRUMPET : PETAL5;
    el('path', { d, transform: t, fill: petal, stroke: OUT, 'stroke-width': 1.2 / s, 'stroke-linejoin': 'round' }, g);
    el('circle', { r: kind === 'trumpet' ? 3 : 2.3, transform: t, fill: centre, stroke: OUT, 'stroke-width': 0.9 / s }, g);
  }
  // blossom drop: how many of n flowers stay on the plant (always at least 1; n at drop 0), and a few small wilted flowers lying at the base (2 nodes)
  const keepFlowers = (n, drop) => drop > 0 ? Math.max(1, Math.round(n * (1 - 0.75 * drop))) : n;
  function fallenFlowers(g, pal, drop) {
    if (!(drop > 0.02) || pal.stage < 2) return;
    let d = '', c = ''; const n = 1 + Math.round(drop * 4), sp = 14 + pal.size * 34;
    for (let i = 0; i < n; i++) { const x = (h01(pal.seed, i, 51) - 0.5) * 2 * sp, y = -2.5 + h01(pal.seed, i, 52) * 4.5; d += petalsAtD(x, y, 5, 3.1, 1.1, h01(pal.seed, i, 53) * 6.28); c += `M${n1(x - 1)} ${n1(y)} a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 `; }
    el('path', { d, fill: mix('ffffff', 'c4b07a', 0.35 + 0.3 * drop), stroke: OUT, 'stroke-width': 0.8, 'stroke-linejoin': 'round', class: 'drop' }, g);
    el('path', { d: c, fill: '#b08a3a', class: 'dropc' }, g);
  }
  // sunscald: pale sunken patch on the upward side of up to 6 fruit. marks = [[fx, fy, rot, localX, localY, rx, ry]] in the fruit's own frame (same transform as the fruit); 2 nodes
  function scaldMarks(g, marks, sev) {
    if (!(sev > 0.02) || !marks.length) return;
    const k = 0.55 + 0.45 * sev, ell = (m, f) => { const [fx, fy, rot, lx, ly, rx, ry] = m, a = rotP(fx, fy, rot, lx - rx * f * k, ly), b = rotP(fx, fy, rot, lx + rx * f * k, ly), r = `${n1(rx * f * k)} ${n1(ry * f * k)} ${n1(rot)}`; return `M${ptS(a)} A${r} 1 0 ${ptS(b)} A${r} 1 0 ${ptS(a)}Z `; };
    el('path', { d: marks.slice(0, 6).map(m => ell(m, 1)).join(''), fill: '#efe5b4', stroke: '#b59a55', 'stroke-width': 0.9, opacity: 0.93, class: 'scald' }, g);
    el('path', { d: marks.slice(0, 6).map(m => ell(m, 0.55)).join(''), fill: '#cdb676', opacity: 0.8, class: 'scaldin' }, g);
  }
  // ---- pass 8 problem looks: shared helpers. Everything here is skipped at severity <= 0.02, so a healthy plant draws exactly as before ----
  // ellipse at (lx, ly) with radii rx, ry in a rotated frame (same maths as scaldMarks): m = [fx, fy, rot, lx, ly, rx, ry], f scales the radii
  const ellD = (m, f = 1) => { const [fx, fy, rot, lx, ly, rx, ry] = m, a = rotP(fx, fy, rot, lx - rx * f, ly), b = rotP(fx, fy, rot, lx + rx * f, ly), r = n1(rx * f) + ' ' + n1(ry * f) + ' ' + n1(rot); return 'M' + ptS(a) + ' A' + r + ' 1 0 ' + ptS(b) + ' A' + r + ' 1 0 ' + ptS(a) + 'Z '; };
  // blossom end rot: dark sunken leathery patch at the bottom of up to 8 fruit (2 nodes)
  function berMarks(g, marks, sev) {
    if (!(sev > 0.02) || !marks.length) return;
    const k = 0.55 + 0.45 * sev, ms = marks.slice(0, 8);
    el('path', { d: ms.map(m => ellD(m, k)).join(''), fill: mix('6b5030', '1d130a', sev), stroke: '#1d130a', 'stroke-width': 0.8, opacity: 0.95, class: 'ber' }, g);
    el('path', { d: ms.map(m => ellD(m, k * 1.35)).join(''), fill: 'none', stroke: '#8a6a3a', 'stroke-width': 0.9, opacity: 0.6, class: 'berrim' }, g);
  }
  // tomato fruit marks. fm = [[fx, fy, r, ripe, i]] per fruit: blossom end rot at the bottom, and a zigzag split from the calyx down on up to 6 ripe fruit (2 + 2 nodes)
  function tomatoMarks(g, fm, ber, crack) {
    berMarks(g, fm.map(q => [q[0], q[1], 0, 0, q[2] * 1.42, q[2] * 0.5, q[2] * 0.26]), ber);
    if (!(crack > 0.02)) return;
    const ripe = fm.filter(q => q[3] >= 0.4).slice(0, Math.min(6, 1 + Math.round(crack * 5)));
    if (!ripe.length) return;
    let d = '';
    ripe.forEach(q => { const x = q[0], y = q[1], r = q[2], sd = q[4] % 2 ? 1 : -1, L = r * (0.9 + 0.8 * crack); d += 'M' + n1(x + sd * r * 0.15) + ' ' + n1(y + r * 0.05) + ' l' + n1(sd * r * 0.16) + ' ' + n1(L * 0.3) + ' l' + n1(-sd * r * 0.2) + ' ' + n1(L * 0.3) + ' l' + n1(sd * r * 0.18) + ' ' + n1(L * 0.32) + ' '; });
    el('path', { d, fill: 'none', stroke: '#4a1a10', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'crack' }, g);
    el('path', { d, transform: 'translate(0.9 0)', fill: 'none', stroke: '#f6dca8', 'stroke-width': 0.6, 'stroke-linecap': 'round', opacity: 0.8, class: 'crackin' }, g);
  }
  // capsicum calcium tipburn: acc = [[leafX, leafY, angle, L, W]] for young leaves; a brown crisp wedge at each tip that grows with severity (2 nodes)
  function capTipMarks(g, acc, sev) {
    if (!(sev > 0.02) || !acc || !acc.length) return;
    const dd = 0.1 + 0.22 * sev; let a = '', e = '';
    acc.slice(0, 16).forEach(q => { const P = (u, v) => ptS(rotP(q[0], q[1], q[2], u, v)), L = q[3], W = q[4], y0 = -L * (1 - dd); a += 'M' + P(0, -L) + ' L' + P(-W * 0.38, y0) + ' Q' + P(0, y0 + L * 0.05) + ' ' + P(W * 0.38, y0) + ' Z '; e += 'M' + P(-W * 0.38, y0 - 1.5) + ' Q' + P(0, y0 - 1.5 + L * 0.05) + ' ' + P(W * 0.38, y0 - 1.5) + ' '; });
    el('path', { d: a, fill: mix('b0793a', '5a3414', sev), stroke: '#3a2510', 'stroke-width': 0.8, 'stroke-linejoin': 'round', class: 'captip' }, g);
    el('path', { d: e, fill: 'none', stroke: '#d9b27a', 'stroke-width': 0.9, 'stroke-dasharray': '2.5 1.6', 'stroke-linecap': 'round', opacity: 0.85, class: 'captipe' }, g);
  }
  // chilli aphids (pass 8b, bigger): clusters of 3 to 5 pale green-white bodies (5 x 3.6 px at the 400-wide viewBox, each with a dark dot) on up to 4 growing tips, a tiny highlight on each and a sticky honeydew shine under the cluster (4 nodes)
  function aphidMarks(g, tips, sev, seed) {
    if (!(sev > 0.02) || !tips || !tips.length) return;
    const nT = Math.min(4, tips.length), per = 3 + Math.round(sev * 2); let d = '', dd = '', h = '', hn = '';
    for (let t = 0; t < nT; t++) {
      const q = tips[Math.floor(t * tips.length / nT)]; let sx = 0, sy = 0;
      for (let k = 0; k < per; k++) {
        const cx = q[0] + (h01(seed, t * 13 + k, 71) - 0.5) * 15, cy = q[1] - 2 - h01(seed, t * 13 + k, 72) * 11; sx += cx; sy += cy;
        d += 'M' + n1(cx - 2.5) + ' ' + n1(cy) + ' a2.5 1.8 0 1 0 5 0 a2.5 1.8 0 1 0 -5 0 ';
        dd += 'M' + n1(cx - 0.4) + ' ' + n1(cy + 0.2) + ' a0.8 0.8 0 1 0 1.6 0 a0.8 0.8 0 1 0 -1.6 0 ';
        h += 'M' + n1(cx - 1.4) + ' ' + n1(cy - 0.9) + ' h1.2 ';
      }
      hn += 'M' + n1(sx / per - 7) + ' ' + n1(sy / per + 5) + ' q4 3 8 0 t6 -1 '; /* a glossy smear on the leaf under the cluster */
    }
    el('path', { d: hn, fill: 'none', stroke: '#e6f6ff', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.55, class: 'honey' }, g);
    el('path', { d, fill: '#e4f2b8', stroke: '#2f5a1c', 'stroke-width': 0.9, class: 'aphid' }, g);
    el('path', { d: dd, fill: '#1f2a14', class: 'aphiddot' }, g);
    el('path', { d: h, fill: 'none', stroke: '#ffffff', 'stroke-width': 0.8, 'stroke-linecap': 'round', opacity: 0.9, class: 'aphidhi' }, g);
  }
  // strawberry grey mould: fuzzy grey blobs and a few pale hairs on the lower half of up to 6 ripe berries (2 nodes). pos[i] = berry anchor, fr[i] = berry, sb = smallberry look
  function berryMould(g, pos, fr, sb, sev, seed) {
    if (!(sev > 0.02)) return;
    let d = '', h = '', n = 0;
    fr.forEach((fi, i) => {
      if (fi.ripe < 0.5 || n >= 6) return; n++;
      const r = (4 + fi.size * 8) * (1 - 0.3 * sb), nb = 2 + Math.round(sev * 2);
      for (let k = 0; k < nb; k++) { const bx = pos[i][0] + (h01(seed, i * 5 + k, 81) - 0.5) * r * 1.2, by = pos[i][1] + r * (0.7 + 0.9 * h01(seed, i * 5 + k, 82)), rr = r * (0.2 + 0.12 * sev); d += 'M' + n1(bx - rr) + ' ' + n1(by) + ' a' + n1(rr) + ' ' + n1(rr) + ' 0 1 0 ' + n1(rr * 2) + ' 0 a' + n1(rr) + ' ' + n1(rr) + ' 0 1 0 ' + n1(-rr * 2) + ' 0 '; h += 'M' + n1(bx - rr * 0.6) + ' ' + n1(by - rr * 0.8) + ' l-1.4 -1.6 M' + n1(bx + rr * 0.6) + ' ' + n1(by - rr * 0.8) + ' l1.4 -1.6 '; }
    });
    if (!d) return;
    el('path', { d, fill: '#c8c5ba', stroke: '#8c887c', 'stroke-width': 0.6, opacity: 0.93, class: 'botrytis' }, g);
    el('path', { d: h, fill: 'none', stroke: '#eceae0', 'stroke-width': 0.7, 'stroke-linecap': 'round', opacity: 0.85, class: 'botfuzz' }, g);
  }
  // strawberry runners: 1 to 3 long thin stems arching out of the crown and over the pot rim, each ending in a tiny plantlet (2 nodes). L = leaf reach of the plant
  function runnerStems(g, pal, rn, L) {
    if (!(rn > 0.02) || pal.stage < 1) return;
    const nR = 1 + Math.round(rn * 2); let d = '', pd = '';
    for (let k = 0; k < nR; k++) {
      const sd = k % 2 ? 1 : -1, reach = Math.min(128, (62 + rn * 48) * (1 - 0.2 * Math.floor(k / 2)) + h01(pal.seed, k, 85) * 10), ex = sd * reach, ey = -9 - 7 * k, cx = sd * reach * 0.5, cy = -L * 0.95 - 16 - 6 * k;
      d += 'M0 -4 Q' + n1(cx) + ' ' + n1(cy) + ' ' + n1(ex) + ' ' + n1(ey) + ' ';
      [[0, -4], [-4.5, -1.5], [4.5, -1.5]].forEach(o => { pd += 'M' + n1(ex + o[0] - 3.4) + ' ' + n1(ey + o[1]) + ' a3.4 2.3 0 1 0 6.8 0 a3.4 2.3 0 1 0 -6.8 0 '; });
    }
    el('path', { d, fill: 'none', stroke: mix(pal.stem(0.7), '2f6f2a', 0.35), 'stroke-width': 1.5, 'stroke-linecap': 'round', class: 'runner' }, g);
    el('path', { d: pd, fill: pal.leaf(0.8, 0.2), stroke: OUT, 'stroke-width': 0.9, class: 'runnerp' }, g);
  }
  // lettuce slug damage: ragged dark holes on the outer leaves plus a silver slime trail on the first two (2 nodes). outer = [[leafX, leafY, angle, L, W]]
  function slugMarks(g, outer, sev, seed) {
    if (!(sev > 0.02) || !outer.length) return;
    const n = Math.min(8, 2 + Math.round(sev * 6)); let d = '', tr = '';
    for (let k = 0; k < n; k++) {
      const o = outer[k % outer.length], u = (k % 2 ? 1 : -1) * o[4] * (0.25 + 0.3 * h01(seed, k, 91)), v = -o[3] * (0.3 + 0.4 * h01(seed, k, 92)), rr = 2.6 + sev * 2.8 + h01(seed, k, 93) * 1.5;
      const P = (a, b) => ptS(rotP(o[0], o[1], o[2], u + a, v + b));
      for (let j = 0; j < 7; j++) { const t = j / 7 * 6.283 + k, r = rr * (0.65 + 0.7 * h01(seed, k * 7 + j, 94)); d += (j ? 'L' : 'M') + P(Math.cos(t) * r, Math.sin(t) * r) + ' '; }
      d += 'Z ';
      if (k < 2) tr += 'M' + P(-rr * 3, rr * 2) + ' Q' + P(-rr, rr * 3.5) + ' ' + P(rr * 2.5, rr * 2) + ' ';
    }
    el('path', { d, fill: '#33271a', stroke: '#8a6a30', 'stroke-width': 0.9, 'stroke-linejoin': 'round', class: 'bite' }, g);
    el('path', { d: tr, fill: 'none', stroke: '#e6eee8', 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: 0.7, class: 'slime' }, g);
  }
  // lettuce warm-tank rot: a wet brown rib down the middle of every outer leaf (1 node; the outer leaves themselves also yellow, droop and get class "rotleaf")
  function rotRibs(g, outer, sev) {
    if (!(sev > 0.02) || !outer.length) return;
    let d = '';
    outer.forEach(o => { const P = (u, v) => ptS(rotP(o[0], o[1], o[2], u, v)); d += 'M' + P(0, -o[3] * 0.08) + ' Q' + P(o[4] * 0.1, -o[3] * 0.4) + ' ' + P(0, -o[3] * (0.45 + 0.35 * sev)) + ' '; });
    el('path', { d, fill: 'none', stroke: '#8a6a2a', 'stroke-width': 1.6 + sev, 'stroke-linecap': 'round', opacity: 0.55 + 0.3 * sev, class: 'rotribs' }, g);
  }
  // cucumber spider-mite stipple in a leaf's own frame: pale dots scattered over the blade
  const miteDotsD = (R, mite, seed, i) => { let d = ''; const n = 8 + Math.round(mite * 16); for (let k = 0; k < n; k++) { const a = (h01(seed, i * 31 + k, 61) - 0.5) * 2.6, r = 0.2 + 0.6 * h01(seed, i * 31 + k, 62), cx = Math.cos(a) * r * R + R * 0.22, cy = Math.sin(a) * r * R * 0.92; d += 'M' + n1(cx - 1.4) + ' ' + n1(cy) + ' a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0 '; } return d; }; /* pass 8b: 0.9 -> 1.4 px dots, more of them */
  // cucumber soft yellow fruit tips: marks = [[fx, fy, rot, localX, localY, rx, ry]] at the blossom end of up to 6 fruit (2 nodes)
  function mushMarks(g, marks, sev) {
    if (!(sev > 0.02) || !marks.length) return;
    const k = 0.55 + 0.4 * sev, ms = marks.slice(0, 6);
    el('path', { d: ms.map(m => ellD(m, k)).join(''), fill: mix('d6cf5a', 'b8a036', sev), stroke: '#8a7a28', 'stroke-width': 0.8, opacity: 0.82, class: 'mushy' }, g);
    el('path', { d: ms.map(m => ellD(m, k * 0.5)).join(''), fill: '#7a5a26', opacity: 0.5 + 0.3 * sev, class: 'mushyin' }, g);
  }
  // brown spots and white powder on leaf points [x, y, t]; low leaves (small t) are hit first, capped so the budget holds
  function blemish(g, pal, pts) {
    let ns = 0, nm = 0, mg = null;
    if (CUR) CUR.anchors = pts;
    pts.forEach((q, i) => {
      const t = q[2] || 0;
      if (pal.sp > 0.04 && ns < 10 && h01(pal.seed, i, 21) < pal.sp * (1.4 - 0.7 * t)) { ns++; el('circle', { cx: q[0] + (h01(pal.seed, i, 22) - 0.5) * 6, cy: q[1] + (h01(pal.seed, i, 23) - 0.5) * 6, r: 2.2 + pal.sp * 1.3, fill: '#6b4a1e', stroke: '#3a2510', 'stroke-width': 0.8, opacity: 0.92 }, g); }
      if (pal.mil > 0.04 && nm < 10 && h01(pal.seed, i, 24) < pal.mil * 1.3) { nm++; if (!mg) { mg = el('g', { class: 'mil' }, g); if (CUR) CUR.mil = mg; } el('ellipse', { cx: q[0] + (h01(pal.seed, i, 25) - 0.5) * 8, cy: q[1] + (h01(pal.seed, i, 26) - 0.5) * 6, rx: 4 + pal.mil * 4, ry: 2.6 + pal.mil * 2.2, fill: '#f7f4de', opacity: 0.88 }, mg); }
    });
    leafDamage(g, pal, pts);
  }
  // pass 8b: EC burn scorch (brown leaf tips, 2 nodes) and the brown leaf edges of a plant under 25 % health (1 node). A point is [x, y, t] or [x, y, t, tipX, tipY] when the crop knows where its leaf ends;
  // otherwise the tip is guessed a little further out from the stem. Low leaves (small t) go first. Nothing is drawn at severity <= 0.02, so healthy plants are byte-identical.
  function leafDamage(g, pal, pts) {
    if (!(pal.scorch > 0.02 || pal.brown > 0.02) || !pts.length) return;
    const tipOf = q => q.length > 4 ? [q[3], q[4]] : [q[0] + (q[0] >= 0 ? 1 : -1) * (5 + pal.size * 10), q[1] - 2 - pal.size * 4];
    const order = pts.slice().sort((a, b) => (a[2] || 0) - (b[2] || 0));
    if (pal.scorch > 0.02) {
      const ls = order.slice(0, Math.min(8, 3 + Math.round(pal.scorch * 5))); let a = '', e = '';
      ls.forEach(q => { const [x, y] = tipOf(q), w = 3 + pal.scorch * 2.5; a += 'M' + n1(x - w) + ' ' + n1(y + w * 0.9) + ' Q' + n1(x) + ' ' + n1(y - w * 1.1) + ' ' + n1(x + w) + ' ' + n1(y + w * 0.9) + ' Z '; e += 'M' + n1(x - w) + ' ' + n1(y + w * 0.9 + 1.3) + ' Q' + n1(x) + ' ' + n1(y - w * 1.1 + 1.3) + ' ' + n1(x + w) + ' ' + n1(y + w * 0.9 + 1.3) + ' '; });
      el('path', { d: a, fill: mix('b0793a', '5a3414', pal.scorch), stroke: '#3a2510', 'stroke-width': 0.8, 'stroke-linejoin': 'round', class: 'scorch' }, g);
      el('path', { d: e, fill: 'none', stroke: '#d9b27a', 'stroke-width': 0.9, 'stroke-dasharray': '2.2 1.5', 'stroke-linecap': 'round', opacity: 0.85, class: 'scorche' }, g);
    }
    if (pal.brown > 0.02) {
      const ls = order.slice(0, Math.min(8, 4 + Math.round(pal.brown * 4))); let d = '';
      ls.forEach(q => { const sd = q[0] >= 0 ? 1 : -1, x = q[0] + sd * 3, y = q[1], r = 4 + pal.size * 4; d += 'M' + n1(x) + ' ' + n1(y - r) + ' Q' + n1(x + sd * r * 0.9) + ' ' + n1(y) + ' ' + n1(x) + ' ' + n1(y + r) + ' '; });
      el('path', { d, fill: 'none', stroke: mix('9a6a2a', '4a2a10', pal.brown), 'stroke-width': 2.3 + pal.brown, 'stroke-linecap': 'round', opacity: 0.8 + 0.15 * pal.brown, class: 'browned' }, g);
    }
  }

  /* ---- stage 0: seedling. Two cotyledons plus the first true leaf, shaped per crop ---- */
  function seedling(g, pal, crop) {
    const s = 1.5 + pal.size * 3, w = pal.wilt, H = 24 * s, tx = w * 12 * s, top = -H + w * 6 * s;
    stem(g, `M0 2 Q${n1(w * 4)} ${n1(-H * 0.55)} ${n1(tx)} ${n1(top)}`, 2.2 + s, pal.stem(0.5));
    const cot = { tomato: [12, 0.42, 0.6], chilli: [12, 0.4, 0.7], capsicum: [12, 0.48, 0.5], cucumber: [13, 0.72, 0.1], strawberry: [9, 0.7, 0.1], lettuce: [10, 0.8, 0], basil: [11, 0.74, 0.15] }[crop] || [12, 0.45, 0.4];
    const cL = cot[0] * s, cW = cL * cot[1], cCol = pal.leaf(0.1, 0.2);
    [-1, 1].forEach(sd => el('path', { d: ovalD(cL, cW, cot[2]), transform: tf(tx, top + 2, sd * (72 + w * 45)), fill: cCol, stroke: OUT, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, g));
    const L = 13 * s, col = pal.leaf(0.9, 0), lean = w * 30, y = top - 2;
    if (crop === 'tomato') { // first compound leaf: rachis + three leaflets
      el('path', { d: `M0 0 L0 ${n1(-L * 0.9)}`, transform: tf(tx, y, lean), stroke: pal.stem(1), 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
      [[-1, 0.45, -70], [1, 0.45, 70], [0, 0.9, 0]].forEach(([sd, k, a]) => el('path', { d: ovalD(L * 0.6, L * 0.3, 0.6), transform: tf(tx, y - L * 0.9 * k, lean + a), fill: col, stroke: OUT, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, g));
    } else if (crop === 'strawberry') {
      el('path', { d: `M0 0 L0 ${n1(-L * 0.7)}`, transform: tf(tx, y, lean), stroke: pal.stem(1), 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
      [-42, 0, 42].forEach(a => el('path', { d: serratedD(L * 0.62, L * 0.3), transform: tf(tx, y - L * 0.7, lean + a), fill: col, stroke: OUT, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, g));
    } else if (crop === 'basil') {
      [-1, 1].forEach(sd => el('path', { d: ovalD(L * 0.8, L * 0.34, 0.2), transform: tf(tx, y, lean + sd * 28), fill: col, stroke: OUT, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, g));
    } else if (crop === 'cucumber') {
      el('path', { d: lobedD(L * 0.62), transform: tf(tx, y, lean - 90), fill: col, stroke: OUT, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
    } else if (crop === 'lettuce') {
      el('path', { d: frillD(L * 1.2, L * 0.52, 0.1, pal.seed), transform: tf(tx, y + 1, lean), fill: lighten(col, 0.2), stroke: OUT, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
    } else { // chilli / capsicum: one simple pointed leaf
      el('path', { d: ovalD(L * 1.05, L * (crop === 'capsicum' ? 0.46 : 0.34), crop === 'capsicum' ? 0.5 : 0.85), transform: tf(tx, y, lean), fill: col, stroke: OUT, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
    }
  }

  /* ---- fruit helpers (also used by fruitIcon) ---- */
  function tomatoFruit(g, x, y, size, ripe) {
    const r = 5 + size * 11, t = tf(x, y);
    const col = ripe < 0.5 ? mix('5fae3e', 'f2a53a', ripe * 2) : mix('f2a53a', 'e2362b', (ripe - 0.5) * 2);
    el('ellipse', { cx: 0, cy: r * 0.7, rx: r, ry: r * 0.9, transform: t, fill: col, stroke: OUT, 'stroke-width': 2, class: 'fruit' }, g);
    if (size > 0.55) el('ellipse', { cx: -r * 0.38, cy: r * 0.42, rx: r * 0.26, ry: r * 0.16, transform: t, fill: '#fff', opacity: 0.45 }, g);
    el('path', { d: CALYX, transform: tf(x, y, 0, 0.55 + size * 0.5), fill: '#3f8a34', stroke: OUT, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, g);
  }
  function chilliFruit(g, x, y, size, ripe, rot = 10, thin = 0) { // thin 0..1: narrower, slightly shorter, paler pod (low light)
    const L = (14 + size * 30) * (1 - 0.1 * thin), c = (2 + size * 3) * (1 - 0.4 * thin), t = tf(x, y, rot);
    const col0 = ripe < 0.5 ? mix('4f9e34', 'f08a24', ripe * 2) : mix('f08a24', 'd8231c', (ripe - 0.5) * 2), col = thin > 0 ? mix(col0, 'dfe39a', thin * 0.45) : col0;
    el('path', { d: `M-3.6 0 Q${n1(-5.2 - c * 0.3)} ${n1(L * 0.55)} ${n1(c * 0.6)} ${n1(L)} Q${n1(c * 0.6 + 1.2)} ${n1(L - 1)} ${n1(4.6 + c * 0.3)} ${n1(L * 0.5)} Q4.8 ${n1(L * 0.2)} 3.6 0 Z`, transform: t, fill: col, stroke: OUT, 'stroke-width': 1.8, 'stroke-linejoin': 'round', class: thin > 0 ? 'fruit thin' : 'fruit' }, g);
    el('path', { d: 'M-4.2 1 Q0 -4.5 4.2 1 Z M0 -1 L0 -7', transform: t, fill: '#3f8a34', stroke: OUT, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, g);
  }
  function strawberryFruit(g, x, y, size, ripe, small = 0) { // small 0..1: 70% size and paler at 1 (low light)
    const r = (4 + size * 8) * (1 - 0.3 * small), t = tf(x, y);
    const col0 = ripe < 0.5 ? mix('eef0d8', 'f4a89a', ripe * 2) : mix('f4a89a', 'e3263a', (ripe - 0.5) * 2), col = small > 0 ? mix(col0, 'f1e7bd', small * 0.3) : col0;
    el('path', { d: `M0 ${n1(r * 2.1)} Q${n1(-r * 1.3)} ${n1(r * 0.8)} ${n1(-r * 0.8)} 0 Q0 ${n1(-r * 0.4)} ${n1(r * 0.8)} 0 Q${n1(r * 1.3)} ${n1(r * 0.8)} 0 ${n1(r * 2.1)} Z`, transform: t, fill: col, stroke: OUT, 'stroke-width': 1.8, 'stroke-linejoin': 'round', class: small > 0 ? 'fruit small' : 'fruit' }, g);
    // seeds: one path of tiny circles, yellow once ripe
    let sd = ''; for (let i = 0; i < 7; i++) { const cx = (i % 3 - 1) * r * 0.42 * (1 - Math.floor(i / 3) * 0.25), cy = r * (0.45 + Math.floor(i / 3) * 0.5); sd += `M${n1(cx - 0.9)} ${n1(cy)} a0.9 0.9 0 1 0 1.8 0 a0.9 0.9 0 1 0 -1.8 0 `; }
    el('path', { d: sd, transform: t, fill: mix('f7f2d4', 'f2d040', ripe), stroke: mix('b0a880', '8a6a10', ripe), 'stroke-width': 0.5 }, g);
    el('path', { d: CALYX, transform: tf(x, y + 1, 0, 0.6 + size * 0.45), fill: '#3f9b3a', stroke: OUT, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
  }
  function capsicumFruit(g, x, y, size, ripe, rot = 0, sc = 1) { // sc: size factor (0.7 for small fruit from cool nights)
    const w = (9 + size * 12) * sc, h = (13 + size * 20) * sc, t = tf(x, y, rot);
    const col = ripe < 0.5 ? mix('3d9a2f', 'e8a02a', ripe * 2) : mix('e8a02a', 'd4201c', (ripe - 0.5) * 2), dark = mix(col, '2a1d14', 0.3);
    el('path', { d: `M${n1(-w * 0.55)} 0 C${n1(-w * 1.1)} ${n1(h * 0.15)} ${n1(-w * 1.18)} ${n1(h * 0.7)} ${n1(-w * 0.78)} ${n1(h * 0.93)} Q${n1(-w * 0.45)} ${n1(h * 1.07)} ${n1(-w * 0.2)} ${n1(h * 0.97)} Q0 ${n1(h * 1.03)} ${n1(w * 0.2)} ${n1(h * 0.97)} Q${n1(w * 0.45)} ${n1(h * 1.07)} ${n1(w * 0.78)} ${n1(h * 0.93)} C${n1(w * 1.18)} ${n1(h * 0.7)} ${n1(w * 1.1)} ${n1(h * 0.15)} ${n1(w * 0.55)} 0 Q0 ${n1(-h * 0.1)} ${n1(-w * 0.55)} 0 Z`, transform: t, fill: col, stroke: OUT, 'stroke-width': 2, 'stroke-linejoin': 'round', class: sc < 1 ? 'fruit small' : 'fruit' }, g);
    el('path', { d: [-0.33, 0.33].map(k => `M${n1(w * k * 0.9)} ${n1(h * 0.05)} Q${n1(w * k * 1.25)} ${n1(h * 0.5)} ${n1(w * k * 0.85)} ${n1(h * 0.96)}`).join(' ') + ` M${n1(-w * 0.62)} ${n1(h * 0.22)} Q${n1(-w * 0.72)} ${n1(h * 0.4)} ${n1(-w * 0.6)} ${n1(h * 0.55)}`, transform: t, fill: 'none', stroke: dark, 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.55 }, g);
    el('path', { d: CALYX, transform: tf(x, y + 1, rot, 0.7 + size * 0.5), fill: '#3f8a34', stroke: OUT, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
  }
  // bitter (0..1): pale, curved, pinched at the waist; acc (array) collects the pale band geometry so the plant draws all bands as one path
  function cucumberFruit(g, x, y, size, ripe, rot = 0, bitter = 0, acc = null, mush = 0, macc = null) {
    const bt = clamp01(bitter), L = 14 + size * 60, w = 4.2 + size * 3.6, c = 2 + size * 3, t = tf(x, y, rot);
    const cc = c + bt * (5 + size * 7), ms = bt * cc * 0.9, wm = 1.15 - 0.65 * bt, w9 = w * (1 - 0.1 * bt);
    const bitterD = `M${n1(-w9)} 0 Q${n1(-w * wm + ms)} ${n1(L * 0.5)} ${n1(-w * 0.7 + cc)} ${n1(L)} Q${n1(cc)} ${n1(L + w * 0.6)} ${n1(w * 0.7 + cc)} ${n1(L)} Q${n1(w * wm + ms)} ${n1(L * 0.5)} ${n1(w9)} 0 Q0 ${n1(-w * 0.5)} ${n1(-w9)} 0 Z`;
    const col = bt > 0 ? mix(mix('bfe384', '3f9a34', clamp01(ripe)), 'e2e59a', bt * 0.65) : mix('bfe384', '3f9a34', clamp01(ripe)), dark = mix(col, '1f5a1c', 0.45);
    if (bt > 0 && acc) acc.push([x, y, rot, L, cc, ms, w]);
    if (mush > 0.02 && macc) macc.push([x, y, rot, bt > 0 ? cc : c, L - 3, w * 0.95, L * 0.12 + 1.5]); // soft yellow blossom end
    el('path', { d: `M0 -7 L0 1`, transform: t, stroke: '#3f8a34', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
    el('path', { d: bt > 0 ? bitterD : `M${n1(-w)} 0 Q${n1(-w * 1.15)} ${n1(L * 0.5)} ${n1(-w * 0.7 + c)} ${n1(L)} Q${n1(c)} ${n1(L + w * 0.6)} ${n1(w * 0.7 + c)} ${n1(L)} Q${n1(w * 1.15)} ${n1(L * 0.5)} ${n1(w)} 0 Q0 ${n1(-w * 0.5)} ${n1(-w)} 0 Z`, transform: t, fill: col, stroke: OUT, 'stroke-width': 2, 'stroke-linejoin': 'round', class: bt > 0 ? 'fruit bitter' : 'fruit' }, g);
    el('path', { d: [-0.45, 0.5].map(k => `M${n1(w * k)} ${n1(L * 0.06)} Q${n1(w * k * 1.15 + cc * 0.5)} ${n1(L * 0.5)} ${n1(w * k * 0.8 + cc)} ${n1(L * 0.93)}`).join(' ') + (size < 0.55 ? ` M${n1(c - 2)} ${n1(L + 1)} l-2 5 M${n1(c)} ${n1(L + 1)} l0 6 M${n1(c + 2)} ${n1(L + 1)} l2 5` : ''), transform: t, fill: 'none', stroke: size < 0.55 ? '#c9a22a' : dark, 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: 0.8 }, g);
    if (size > 0.5) el('ellipse', { cx: -w * 0.3, cy: L * 0.3, rx: w * 0.16, ry: L * 0.16, transform: t, fill: '#fff', opacity: 0.4 }, g);
  }

  /* ---- tomato: indeterminate vine on a stake, compound leaves, yellow star flowers on trusses, round fruit green -> red ---- */
  function compoundLeaf(g, x, y, ang, len, col, colDark, wilt, pairs, seed, i, curl = 0, cacc = null) { // curl 0..1: leaflets narrower, paler, rolled edge collected into cacc
    const droop = wilt * 28, a = ang + (ang > 0 ? droop : -droop), t = tf(x, y, a), G = lfGroup(g, x, y, ang < -90 ? -1 : 1);
    el('path', { d: `M0 0 Q${n1(len * 0.5)} ${n1(-len * 0.1)} ${n1(len)} ${n1(wilt * len * 0.3)}`, transform: t, fill: 'none', stroke: colDark, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, G);
    const cfill = curl > 0 ? mix(col, 'c9d56a', curl * 0.3) : col;
    const lf = (lx, ly, la, L) => {
      if (cacc) { // rolled edge: one dark and one light curve per leaflet, in world coordinates (leaf frame -> leaflet frame)
        const r = la * Math.PI / 180, co = Math.cos(r), si = Math.sin(r), W = L * (0.5 - 0.2 * curl), sd = la < 90 ? 1 : -1;
        const P = (u, v) => ptS(rotP(x, y, a, lx + u * co - v * si, ly + u * si + v * co));
        cacc.push(['M' + P(sd * W * 0.45, -L * 0.18) + ' Q' + P(sd * W * 1.0, -L * 0.55) + ' ' + P(sd * W * 0.25, -L * 0.93) + ' ', 'M' + P(sd * W * 0.3, -L * 0.22) + ' Q' + P(sd * W * 0.75, -L * 0.55) + ' ' + P(sd * W * 0.15, -L * 0.88) + ' ']);
      }
      return el('path', { d: ovalD(L, L * (0.5 - 0.2 * curl), 0.4), transform: `${t} translate(${n1(lx)} ${n1(ly)}) rotate(${n1(la)})`, fill: cfill, stroke: OUT, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, G);
    };
    for (let k = 0; k < pairs; k++) {
      const u = (k + 1) / (pairs + 0.6), lx = len * u, ly = -len * 0.06 * u + wilt * len * 0.3 * u * u, L = len * (0.36 + 0.06 * h01(seed, i * 3 + k, 2));
      lf(lx, ly, 90 - 50 + 15 * u + wilt * 30, L); lf(lx, ly, 90 + 50 - 15 * u - wilt * 30, L);
    }
    lf(len, -len * 0.02 + wilt * len * 0.3, 90 + wilt * 40, len * 0.42);
  }
  function tomatoPlant(g, pal, p) {
    if (pal.stage === 0) return seedling(g, pal, 'tomato');
    const { size, wilt, seed } = pal, H = 38 + size * 240, nodes = Math.max(3, Math.round(3 + size * 5)), pts = [], leafPts = [];
    for (let i = 0; i <= nodes; i++) { const t = i / nodes; pts.push([Math.sin(i * 1.7 + seed) * 4 * t + wilt * t * t * 22, -H * t]); }
    if (p.stake) el('line', { x1: 16, y1: 2, x2: 16, y2: -H - 8, stroke: '#9b7a4a', 'stroke-width': 4.5, 'stroke-linecap': 'round' }, g);
    stem(g, polyD(pts), 3.5 + size * 4, pal.stem(0));
    const leafLen = 26 + size * 48, pairs = size > 0.55 ? 2 : 1;
    const cv = clamp01(p.curl) > 0.02 ? clamp01(p.curl) : 0, cAcc = cv > 0 ? [] : null;
    for (let i = 1; i <= nodes; i++) {
      const [x, y] = pts[i], side = i % 2 ? 1 : -1, t = i / nodes, len = leafLen * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
      compoundLeaf(g, x, y, side > 0 ? -22 - h01(seed, i, 1) * 14 : -158 + h01(seed, i, 1) * 14, len, pal.leaf(t, 0.45 - 0.35 * t), mix(pal.stem(t), '2f6f2a', 0.4), wilt, pairs, seed, i, cv, cAcc);
      leafPts.push([x + side * len * 0.6, y - 4 + wilt * 8, t, x + side * len * 1.02, y - len * 0.12 + wilt * len * 0.3]);
    }
    if (cAcc && cAcc.length) { // rolled leaflet edges, all in two paths
      el('path', { d: cAcc.map(q => q[0]).join(''), fill: 'none', stroke: mix('2f6f2a', '1c3d18', cv), 'stroke-width': 1.5 + cv, 'stroke-linecap': 'round', opacity: 0.55 + 0.35 * cv, class: 'curl' }, g);
      el('path', { d: cAcc.map(q => q[1]).join(''), fill: 'none', stroke: '#c9e08a', 'stroke-width': 0.7, 'stroke-linecap': 'round', opacity: 0.7, class: 'curlhi' }, g);
    }
    const tip = pts[nodes];
    el('path', { d: 'M0 0 Q-6 -8 -2 -14 Q4 -8 0 0 Z', transform: tf(tip[0], tip[1]), fill: pal.tip(), stroke: OUT, 'stroke-width': 1.4 }, g);
    // trusses hang off the even nodes; flowers on the top ones, fruit lower down
    const trusses = []; for (let i = 2; i < nodes; i += 2) trusses.push(pts[i].concat(i % 4 ? 1 : -1));
    if (pal.stage >= 2 && trusses.length) trusses.slice(pal.stage === 2 ? -3 : -1).forEach(([x, y, sd]) => {
      el('path', { d: [0, 1, 2].map(j => `M${n1(x)} ${n1(y)} Q${n1(x + sd * 10)} ${n1(y + 2 + j * 3)} ${n1(x + sd * (10 + j * 8))} ${n1(y + 7 + j * 4)}`).join(' '), fill: 'none', stroke: pal.stem(1), 'stroke-width': 1.8, 'stroke-linecap': 'round' }, g);
      for (let j = 0; j < 3; j++) flower(g, x + sd * (12 + j * 9), y + 10 + j * 4, 1.05 + size * 0.35, '#ffd23f', '#e08a1e', 'star');
    });
    const fr = p.fruits || [], T = Math.max(1, trusses.length);
    if (fr.length) {
      let sd = '';
      fr.forEach((f, i) => { const tr = trusses[i % T] || pts[1].concat(1), side = tr[2] || 1, j = Math.floor(i / T); const x = tr[0] + side * (12 + j * 11), y = tr[1] + 9 + (j % 2) * 7; sd += `M${n1(tr[0])} ${n1(tr[1])} Q${n1(x)} ${n1(tr[1] + 2)} ${n1(x)} ${n1(y)} `; });
      el('path', { d: sd, fill: 'none', stroke: pal.stem(0.5), 'stroke-width': 1.8, 'stroke-linecap': 'round' }, g);
      const fm = [];
      fr.forEach((f, i) => { const tr = trusses[i % T] || pts[1].concat(1), side = tr[2] || 1, j = Math.floor(i / T), fx = tr[0] + side * (12 + j * 11), fy = tr[1] + 9 + (j % 2) * 7; tomatoFruit(g, fx, fy, f.size, f.ripe); fm.push([fx, fy, 5 + f.size * 11, f.ripe, i]); });
      tomatoMarks(g, fm, clamp01(p.ber), clamp01(p.crack));
    }
    blemish(g, pal, leafPts);
    dots(g, p, leafPts, leafLen * 0.8);
  }

  /* ---- chilli and capsicum: forking bush. chilli = narrow pointed leaves + hanging pods; capsicum = broad leaves + blocky bells ---- */
  function forkBush(g, pal, p, cfg) {
    const { size, wilt, seed } = pal, H = cfg.H, leafPts = [], nodes = [], w0 = 3.5 + size * 5;
    const limb = (x, y, ang, len, depth, w, lvl, tb) => {
      const q = [], seg = 3;
      for (let i = 0; i <= seg; i++) { const t = i / seg, a = (ang + wilt * (ang >= 0 ? 1 : -1) * 14 * t) * Math.PI / 180; q.push([x + Math.sin(a) * len * t + Math.sin(i * 1.5 + seed + lvl) * 1.5, y - Math.cos(a) * len * t * (1 - wilt * 0.1 * t)]); }
      stem(g, polyD(q), w, pal.stem(tb));
      const steps = depth ? [0.35, 0.7, 1] : [0.3, 0.55, 0.8, 1];
      steps.forEach((tt, k) => {
        const idx = Math.round(tt * seg), [lx, ly] = q[idx], th = tb + (1 - tb) * tt, L = cfg.L * (1 - 0.12 * lvl) * (0.88 + h01(seed, lvl * 7 + k + Math.round(x), 2) * 0.24);
        const sides = depth || tt < 1 ? [-1, 1] : [ang >= 0 ? 1 : -1];
        sides.forEach(s => {
          const a = capAng(ang + s * (58 - 14 * tt) + s * wilt * 40, ly, L);
          el('path', { d: ovalD(L, L * cfg.W, cfg.tip), transform: tf(lx, ly, a), fill: pal.leaf(th, 0.45 - 0.35 * th + (s > 0 ? 0 : 0.1)), stroke: OUT, 'stroke-width': 1.7, 'stroke-linejoin': 'round' }, lfGroup(g, lx, ly, a));
          const ra = a * Math.PI / 180; leafPts.push([lx + Math.sin(ra) * L * 0.5, ly - Math.cos(ra) * L * 0.5, th, lx + Math.sin(ra) * L * 0.97, ly - Math.cos(ra) * L * 0.97]);
          if (cfg.tipAcc && th > 0.6) cfg.tipAcc.push([lx, ly, a, L, L * cfg.W]); // young leaf, for the capsicum tipburn overlay
        });
        nodes.push({ x: lx, y: ly, side: ang >= 0 ? 1 : -1, t: th });
      });
      const e = q[seg];
      if (depth > 0) { limb(e[0], e[1], ang - cfg.fork * 0.8, len * 0.72, depth - 1, w * 0.72, lvl + 1, tb + (1 - tb) * 0.5); limb(e[0], e[1], ang + cfg.fork * 0.8, len * 0.72, depth - 1, w * 0.72, lvl + 1, tb + (1 - tb) * 0.5); }
      else { el('path', { d: 'M0 0 Q-5 -7 -1 -12 Q4 -7 0 0 Z', transform: tf(e[0], e[1], ang), fill: pal.tip(), stroke: OUT, 'stroke-width': 1.3 }, g); if (cfg.tipsOut) cfg.tipsOut.push([e[0], e[1], ang]); } // growing tip, for the chilli aphids
    };
    const depth = size < 0.3 ? 0 : size < 0.62 ? 1 : 2;
    if (depth === 0) limb(0, 0, 0, H, 0, w0, 0, 0);
    else { const k = depth === 1 ? 0.42 : 0.34; limb(0, 0, 0, H * k, 0, w0, 0, 0); const t = [Math.sin(seed) * 1.8, -H * k]; limb(t[0], t[1], -cfg.fork, H * (1 - k) * (depth === 1 ? 1 : 0.56), depth - 1, w0 * 0.78, 1, k); limb(t[0], t[1], cfg.fork, H * (1 - k) * (depth === 1 ? 1 : 0.56), depth - 1, w0 * 0.78, 1, k); }
    return { nodes: nodes.sort((a, b) => b.y - a.y), leafPts };
  }
  function chilliPlant(g, pal, p) {
    if (pal.stage === 0) return seedling(g, pal, 'chilli');
    const { size } = pal, H = 34 + size * 200, aphid = clamp01(p.aphid), thin = clamp01(p.thinfruit) > 0.02 ? clamp01(p.thinfruit) : 0, tipsOut = aphid > 0.02 ? [] : null, { nodes, leafPts } = forkBush(g, pal, p, { H, L: 15 + size * 22, W: 0.36, tip: 0.85, fork: 15, tipsOut });
    const upper = nodes.filter(n => n.y < -H * 0.42);
    const drop = clamp01(p.drop), scald = clamp01(p.scald), marks = [];
    if (pal.stage >= 2) upper.slice(-keepFlowers(pal.stage === 2 ? 7 : 3, drop)).forEach((n, k) => flower(g, n.x + n.side * 9, n.y + 7, 0.95 + size * 0.3, '#ffffff', '#f2c230', 'round'));
    fallenFlowers(g, pal, drop);
    (p.fruits || []).forEach((f, i) => { const n = upper[(i * 7 + 2) % Math.max(1, upper.length)] || { x: 0, y: -H * 0.5, side: 1 }, fx = n.x + n.side * (5 + (i % 3) * 5), fy = n.y + 4, fr = n.side * (6 + (i % 3) * 7); chilliFruit(g, fx, fy, f.size, f.ripe, fr, thin); if (scald > 0.02) marks.push([fx, fy, fr, 0.4, (14 + f.size * 30) * 0.3, 1.7 + f.size * 1.5, 2.6 + f.size * 4.5]); });
    scaldMarks(g, marks, scald);
    aphidMarks(g, tipsOut, aphid, pal.seed);
    blemish(g, pal, leafPts);
    dots(g, p, leafPts, 36);
  }
  function capsicumPlant(g, pal, p) {
    if (pal.stage === 0) return seedling(g, pal, 'capsicum');
    const { size } = pal, H = 34 + size * 190, captip = clamp01(p.captip), tipAcc = captip > 0.02 ? [] : null, smallf = clamp01(p.smallfruit), sc = smallf > 0.02 ? 1 - 0.3 * smallf : 1, ber = clamp01(p.ber), bm = [], { nodes, leafPts } = forkBush(g, pal, p, { H, L: 15 + size * 22, W: 0.5, tip: 0.45, fork: 15, tipAcc });
    const upper = nodes.filter(n => n.y < -H * 0.42);
    const drop = clamp01(p.drop), scald = clamp01(p.scald), marks = [];
    if (pal.stage >= 2) upper.slice(-keepFlowers(pal.stage === 2 ? 6 : 2, drop)).forEach(n => flower(g, n.x + n.side * 9, n.y + 7, 1 + size * 0.3, '#ffffff', '#f2c230', 'round'));
    fallenFlowers(g, pal, drop);
    (p.fruits || []).forEach((f, i) => { const n = upper[(i * 5 + 2) % Math.max(1, upper.length)] || { x: 0, y: -H * 0.4, side: 1 }, fx = n.x + n.side * (7 + (i % 2) * 6), fy = n.y + 6, fr = -n.side * 5, w = (9 + f.size * 12) * sc, h = (13 + f.size * 20) * sc; capsicumFruit(g, fx, fy, f.size, f.ripe, fr, sc); if (scald > 0.02) marks.push([fx, fy, fr, w * 0.42, h * 0.26, w * 0.26, h * 0.17]); if (ber > 0.02) bm.push([fx, fy, fr, 0, h * 0.88, w * (0.3 + 0.25 * ber), h * 0.08 + 1]); });
    scaldMarks(g, marks, scald);
    berMarks(g, bm, ber);
    capTipMarks(g, tipAcc, captip);
    blemish(g, pal, leafPts);
    dots(g, p, leafPts, 40);
  }

  // yellow wedges between the veins at the edge of a lobed cucumber leaf (sinuses at 27 and 85 degrees each side), growing inward with severity mg
  const mgWedgesD = (R, mg) => { const pol = (a, r) => { const t = a * Math.PI / 180; return n1(Math.cos(t) * r * R + R * 0.22) + ' ' + n1(Math.sin(t) * r * R * 0.92); }; let d = ''; [[27, 0.6], [-27, 0.6], [85, 0.56], [-85, 0.56]].forEach(([a, e]) => { const ri = e * (0.85 - 0.4 * mg), hw = 13; d += `M${pol(a - hw, ri)} L${pol(a - hw * 0.6, e * 0.98)} L${pol(a + hw * 0.6, e * 0.98)} L${pol(a + hw, ri)} Z `; }); return d; };
  /* ---- cucumber: vine twining up a trellis string, big lobed leaves, tendrils, yellow trumpet flowers, fruit pale -> dark green ---- */
  function cucumberPlant(g, pal, p) {
    if (pal.stage === 0) return seedling(g, pal, 'cucumber');
    const { size, wilt, seed } = pal, H = 34 + size * 258, nodes = Math.max(2, Math.round(2 + size * 7)), pts = [], leafPts = [], info = [], mgdef = clamp01(p.mgdef), bitter = clamp01(p.bitter), bAcc = [], mite = clamp01(p.spidermite), mush = clamp01(p.mushyfruit), mAcc = [], miteL = [];
    let mgN = 0, mtN = 0;
    if (size > 0.2 || p.stake) { // trellis string with its clip
      el('line', { x1: 0, y1: 4, x2: 0, y2: -H - 14, stroke: OUT, 'stroke-width': 4.4, 'stroke-linecap': 'round' }, g);
      el('line', { x1: 0, y1: 4, x2: 0, y2: -H - 14, stroke: '#efe5c4', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, g);
      el('rect', { x: -5, y: -2, width: 10, height: 8, rx: 2, fill: '#c9b27a', stroke: OUT, 'stroke-width': 1.6 }, g);
    }
    for (let i = 0; i <= nodes; i++) { const t = i / nodes; pts.push([Math.sin(i * 1.9 + seed) * 6 * Math.min(1, t * 2) + wilt * t * t * 16, -H * t]); }
    stem(g, polyD(pts), 2.6 + size * 3, pal.stem(0));
    for (let i = 1; i <= nodes; i++) {
      const [nx, ny] = pts[i], side = i % 2 ? 1 : -1, t = i / nodes;
      const R = (15 + size * 34) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95))) * (i === nodes ? 0.55 : 1);
      const a = side * (62 + wilt * 18) * Math.PI / 180, Lp = R * 0.9 + 6, ex = nx + Math.sin(a) * Lp, ey = ny - Math.cos(a) * Lp * 0.75 + wilt * Lp * 0.4;
      el('path', { d: `M${n1(nx)} ${n1(ny)} Q${n1((nx + ex) / 2)} ${n1(ny - Lp * 0.5)} ${n1(ex)} ${n1(ey)}`, fill: 'none', stroke: mix(pal.stem(t), '2f6f2a', 0.3), 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g);
      const dir0 = Math.atan2(ey - ny + wilt * 0.3 * Lp, ex - nx) * 180 / Math.PI + side * wilt * 20, dir = Math.sign(dir0) * Math.min(Math.abs(dir0), Math.asin(Math.max(0, Math.min(1, (-ey - 14) / (R * 1.6)))) * 180 / Math.PI), lt = tf(ex, ey, dir), col = pal.leaf(t, 0.4 - 0.3 * t);
      const LG = lfGroup(g, ex, ey, side);
      el('path', { d: lobedD(R), transform: lt, fill: col, stroke: OUT, 'stroke-width': 1.9, 'stroke-linejoin': 'round' }, LG);
      el('path', { d: lobedVeinsD(R), transform: lt, fill: 'none', stroke: mix(col, 'ffffff', 0.32), 'stroke-width': 1.1, 'stroke-linecap': 'round', opacity: 0.85 }, LG);
      if (mgdef > 0.02 && mgN < 6 && t <= 0.25 + 0.75 * mgdef) { mgN++; el('path', { d: mgWedgesD(R, mgdef), transform: lt, fill: '#d8cf3a', opacity: 0.55 + 0.4 * mgdef, class: 'mgdef' }, LG); } // interveinal yellowing at the edge, old leaves first, moves with the leaf
      if (mite > 0.02 && mtN < 5 && t <= 0.25 + 0.75 * mite) { mtN++; el('path', { d: miteDotsD(R, mite, seed, i), transform: lt, fill: '#f7f2b4', stroke: '#8a7a28', 'stroke-width': 0.4, opacity: 0.8 + 0.2 * mite, class: 'mite' }, LG); miteL.push([nx, ny, ex, ey]); } // spider-mite stipple, old leaves first, moves with the leaf
      leafPts.push([ex + Math.cos(dir * Math.PI / 180) * R * 0.3, ey + Math.sin(dir * Math.PI / 180) * R * 0.3, t, ex + Math.cos(dir * Math.PI / 180) * R * 1.12, ey + Math.sin(dir * Math.PI / 180) * R * 1.12]); info.push({ nx, ny, side, t });
      if (i % 2 === 0 && size > 0.3 && i < nodes) { // tendril curling off the node
        let dd = `M${n1(nx)} ${n1(ny)}`, ang = 0, rad = 1.5;
        for (let k = 0; k < 22; k++) { ang += 0.6; rad += 0.3; dd += ` L${n1(nx - side * (6 + Math.cos(ang) * rad * 0.9))} ${n1(ny - 8 - k * 0.3 + Math.sin(ang) * rad)}`; }
        el('path', { d: dd, fill: 'none', stroke: mix(pal.stem(t), '2f6f2a', 0.3), 'stroke-width': 1.4, 'stroke-linecap': 'round' }, g);
      }
    }
    if (pal.stage >= 2) info.filter(n => n.t > 0.45).slice(pal.stage === 2 ? -4 : -2).forEach((n, k) => flower(g, n.nx - n.side * 11, n.ny + 5 + k, 1.05 + size * 0.3, '#ffd62a', '#e0861a', 'trumpet'));
    const slots = info.filter(n => n.t > 0.28 && n.t < 0.95);
    (p.fruits || []).forEach((f, i) => { const n = slots[(i * 2 + (i >= slots.length ? 1 : 0)) % Math.max(1, slots.length)] || { nx: 0, ny: -H * 0.5, side: 1 }; cucumberFruit(g, n.nx + n.side * (8 + (i % 3) * 9), n.ny + 5, f.size, f.ripe, n.side * 6 + (i % 3 - 1) * 5, bitter, bAcc, mush, mAcc); });
    if (bAcc.length) el('path', { d: bAcc.map(([fx, fy, fr, L, cc, ms, w]) => `M${ptS(rotP(fx, fy, fr, 0, 3))} Q${ptS(rotP(fx, fy, fr, ms * 1.05, L * 0.5))} ${ptS(rotP(fx, fy, fr, cc, L - 3))}`).join(' '), fill: 'none', stroke: '#eeeaa6', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.35 + 0.35 * bitter, class: 'bitter' }, g);
    mushMarks(g, mAcc, mush);
    if (miteL.length) el('path', { d: miteL.map(q => 'M' + n1(q[0]) + ' ' + n1(q[1]) + ' L' + n1(q[2]) + ' ' + n1(q[3])).join(' '), fill: 'none', stroke: '#f4f7f9', 'stroke-width': 1.1, 'stroke-dasharray': '1.6 1.4', opacity: 0.85, class: 'miteweb' }, g);
    blemish(g, pal, leafPts);
    dots(g, p, leafPts, 30);
  }

  /* ---- strawberry: low crown of trifoliate serrated leaves, white flowers with yellow centres, fruit hanging over the pot rim ---- */
  function strawberryPlant(g, pal, p) {
    if (pal.stage === 0) return seedling(g, pal, 'strawberry');
    const { size, wilt, seed } = pal, n = 3 + Math.round(size * 6), leafPts = [], L = 34 + size * 62, LL = 12 + size * 20;
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0.5, a = -90 + (u - 0.5) * (124 + wilt * 30) + (h01(seed, i, 1) - 0.5) * 10, rad = a * Math.PI / 180, lift = 1 - wilt * 0.5;
      const Lk = L * (0.75 + 0.25 * Math.sin(Math.PI * u)) * (0.9 + h01(seed, i, 2) * 0.2), x = Math.cos(rad) * Lk, y = Math.sin(rad) * Lk * lift - 4, t = clamp01(-y / L);
      el('path', { d: `M0 -2 Q${n1(x * 0.35)} ${n1(y * 0.9 - 8 * lift)} ${n1(x)} ${n1(y)}`, fill: 'none', stroke: mix(pal.stem(t), '2f6f2a', 0.3), 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
      const col = pal.leaf(t, 0.4 - 0.3 * t), base = a + 90 + wilt * 40 * Math.sign(x || 1);
      const SG = lfGroup(g, x, y, x);
      [-44, 0, 44].forEach(b => el('path', { d: serratedD(LL, LL * 0.46), transform: tf(x, y, capAng(base + b, y, LL * 1.1)), fill: col, stroke: OUT, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, SG));
      leafPts.push([x, y - LL * 0.5, t]);
    }
    if (pal.stage >= 2) { // flower stalks rise from the crown and lean out
      const nf = pal.stage === 2 ? 3 + Math.round(size * 2) : 2, fl = [];
      for (let j = 0; j < nf; j++) { const u = nf > 1 ? j / (nf - 1) : 0.5, x = (u - 0.5) * (70 + size * 50), y = -L * 0.95 - 12 + Math.abs(u - 0.5) * 24 + wilt * 24; fl.push([x, y]); }
      el('path', { d: fl.map(([x, y]) => `M0 -2 Q${n1(x * 0.3)} ${n1(y * 0.7)} ${n1(x)} ${n1(y)}`).join(' '), fill: 'none', stroke: pal.stem(0.8), 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
      fl.forEach(([x, y]) => flower(g, x, y, 1.15 + size * 0.3, '#ffffff', '#f2c230', 'round'));
    }
    const gm = clamp01(p.greymould), sb = clamp01(p.smallberry) > 0.02 ? clamp01(p.smallberry) : 0;
    runnerStems(g, pal, clamp01(p.runners), L);
    const fr = p.fruits || [];
    if (fr.length) {
      const pos = fr.map((f, i) => [-58 + ((i * 29) % 116) + (h01(seed, i, 3) - 0.5) * 8, -40 + (i % 3) * 6]);
      el('path', { d: pos.map(([x, y]) => `M0 -2 Q${n1(x * 0.5)} ${n1(y - 22)} ${n1(x)} ${n1(y)}`).join(' '), fill: 'none', stroke: pal.stem(0.6), 'stroke-width': 1.8, 'stroke-linecap': 'round' }, g);
      fr.forEach((f, i) => strawberryFruit(g, pos[i][0], pos[i][1], f.size, f.ripe, sb));
      berryMould(g, pos, fr, sb, gm, seed);
    }
    blemish(g, pal, leafPts);
    dots(g, p, leafPts, 30);
  }

  /* ---- lettuce: butterhead rosette; stage 2 the heart starts to cup, stage 3 a full pale heart; bolt = tall flower stalk ---- */
  function lettucePlant(g, pal, p) {
    if (pal.stage === 0) return seedling(g, pal, 'lettuce');
    const { size, wilt, seed } = pal, bolt = clamp01(p.bolt), tipburn = clamp01(p.tipburn), slug = clamp01(p.slugbite), rr = clamp01(p.rootrot), outer = [], tbLeaves = [], R = 22 + size * 68, leafPts = [], heartN = pal.stage < 2 ? 0 : pal.stage === 2 ? 2 : 4;
    stem(g, 'M0 0 L0 -30', 5 + size * 5, '#d9d0a2');
    const tight = pal.stage >= 3 ? 0.82 : 1; // a full head holds its leaves more upright
    const rings = [[3 + Math.round(size * 2), 44, 34, 0.92, 0.52, 0], [size < 0.3 ? 0 : 2 + Math.round(size * 2), 52, 30, 1, 0.64, 0.4], [size < 0.3 ? 2 : 3, 24, 8, 0.84, 0.56, 0.75]];
    let idx = 0;
    rings.forEach(([cnt, a0, a1, lk, wk, tone]) => {
      for (let i = 0; i < cnt; i++) {
        const side = idx % 2 ? -1 : 1, f = cnt > 1 ? i / (cnt - 1) : 0.5, hj = h01(seed, idx, 1) - 0.5;
        const ang = side * ((a0 + (a1 - a0) * f) * tight + hj * 8) + side * wilt * 28 * (1 - tone) + (rr > 0.02 && tone === 0 ? side * rr * 16 : 0), L = R * lk * (1 - wilt * 0.15) * (0.95 + hj * 0.1), W = L * wk;
        const col0 = mix(pal.leaf(tone, 0.5 - 0.4 * tone), lighten(pal.leaf(tone, 0), 0.5), tone * 0.6), col = rr > 0.02 && tone === 0 ? mix(col0, 'd6c256', rr * 0.7) : col0, lt = tf(side * 2, -30 - tone * 4, ang);
        const LG = lfGroup(g, side * 2, -30 - tone * 4, side);
        el('path', Object.assign({ d: frillD(L, W, 0.07 + 0.03 * (1 - tone), seed + idx), transform: lt, fill: col, stroke: OUT, 'stroke-width': 2, 'stroke-linejoin': 'round' }, rr > 0.02 && tone === 0 ? { class: 'rotleaf' } : null), LG);
        el('path', { d: `M0 ${n1(-L * 0.05)} L0 ${n1(-L * 0.78)} M0 ${n1(-L * 0.3)} Q${n1(-W * 0.35)} ${n1(-L * 0.37)} ${n1(-W * 0.6)} ${n1(-L * 0.5)} M0 ${n1(-L * 0.5)} Q${n1(W * 0.35)} ${n1(-L * 0.57)} ${n1(W * 0.6)} ${n1(-L * 0.7)}`, transform: lt, fill: 'none', stroke: mix(col, 'ffffff', 0.42), 'stroke-width': 1.5, 'stroke-linecap': 'round', opacity: 0.85 }, LG);
        const ra = ang * Math.PI / 180; leafPts.push([Math.sin(ra) * L * 0.8, -30 - Math.cos(ra) * L * 0.8, tone]);
        if (tone >= 0.75) tbLeaves.push([side * 2, -30 - tone * 4, ang, L, W * 0.5, L * 0.1]); // inner ring leaf: edge geometry for the tipburn overlay
        if (tone === 0 && (slug > 0.02 || rr > 0.02)) outer.push([side * 2, -30 - tone * 4, ang, L, W]); // outer ring leaf: slug holes and rot ribs
        idx++;
      }
    });
    for (let k = 0; k < heartN; k++) { // cupped pale heart leaves, overlapping at the centre
      const side = k % 2 ? -1 : 1, Lh = R * (0.62 - k * 0.07) * (pal.stage === 2 ? 0.8 : 1), Wh = Lh * 0.62, col = lighten(pal.leaf(1, 0), 0.55 + k * 0.08);
      el('path', { d: `M0 0 C${n1(-Wh)} ${n1(-Lh * 0.1)} ${n1(-Wh * 1.05)} ${n1(-Lh * 0.75)} ${n1(-Wh * 0.4)} ${n1(-Lh)} Q0 ${n1(-Lh * 0.86)} ${n1(Wh * 0.4)} ${n1(-Lh)} C${n1(Wh * 1.05)} ${n1(-Lh * 0.75)} ${n1(Wh)} ${n1(-Lh * 0.1)} 0 0 Z`, transform: tf(side * 3, -30, side * (10 - k * 2) * tight), fill: col, stroke: OUT, 'stroke-width': 1.9, 'stroke-linejoin': 'round' }, g);
      tbLeaves.push([side * 3, -30, side * (10 - k * 2) * tight, Lh, Wh * 0.4, Lh * 0.07]);
    }
    if (bolt > 0.1) { // bolting: a tall central stalk with buds
      const Hs = 22 + bolt * 150 * (0.5 + size * 0.5), wob = Math.sin(seed) * 4;
      stem(g, `M0 -28 Q${n1(wob)} ${n1(-Hs * 0.5)} ${n1(wob * 0.5)} ${n1(-Hs)}`, 3 + bolt * 3, lighten(pal.leaf(1, 0), 0.25));
      let ld = '', bd = '';
      for (let k = 1; k <= 3 + Math.round(bolt * 3); k++) { const y = -Hs * (0.25 + 0.13 * k), sg = k % 2 ? 1 : -1, bl = 9 + 16 * bolt; ld += `M${n1(wob * 0.5)} ${n1(y)} q${n1(sg * bl * 0.6)} ${n1(-bl * 0.3)} ${n1(sg * bl)} ${n1(-bl * 0.9)} `; bd += `M${n1(wob * 0.5 + sg * bl - 3.4)} ${n1(y - bl * 0.9)} a3.4 3.4 0 1 0 6.8 0 a3.4 3.4 0 1 0 -6.8 0 `; }
      el('path', { d: ld, fill: 'none', stroke: OUT, 'stroke-width': 3.6, 'stroke-linecap': 'round' }, g);
      el('path', { d: ld, fill: 'none', stroke: lighten(pal.leaf(1, 0), 0.25), 'stroke-width': 1.8, 'stroke-linecap': 'round' }, g);
      el('path', { d: bd + `M${n1(wob * 0.5 - 4.4)} ${n1(-Hs)} a4.4 4.4 0 1 0 8.8 0 a4.4 4.4 0 1 0 -8.8 0`, fill: '#f2d84a', stroke: OUT, 'stroke-width': 1.3 }, g);
      if (bolt > 0.6) { // flowering: a small open yellow flower on every bud (all stars in one path, all centres in another)
        let sd = '', cd = ''; const spots = [[wob * 0.5, -Hs]];
        for (let k = 1; k <= 3 + Math.round(bolt * 3); k++) { const y = -Hs * (0.25 + 0.13 * k), sg = k % 2 ? 1 : -1, bl = 9 + 16 * bolt; spots.push([wob * 0.5 + sg * bl, y - bl * 0.9]); }
        spots.forEach(([bx, by], k) => { const r = (k ? 3.6 : 4.6) + (bolt - 0.6) * 4, rot = k * 0.7; for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; sd += (i ? 'L' : 'M') + n1(bx + Math.cos(a) * rr) + ' ' + n1(by + Math.sin(a) * rr); } sd += 'Z '; cd += `M${n1(bx - 1.1)} ${n1(by)} a1.1 1.1 0 1 0 2.2 0 a1.1 1.1 0 1 0 -2.2 0 `; });
        el('path', { d: sd, fill: '#ffe23a', stroke: OUT, 'stroke-width': 0.9, 'stroke-linejoin': 'round', class: 'budding' }, g);
        el('path', { d: cd, fill: '#e08a1e', class: 'budding' }, g);
      }
    }
    if (tipburn > 0.02 && tbLeaves.length) { // tipburn: brown crisp rim on the innermost leaves (calcium not reaching the growing heart); longer and darker with severity
      const tg = el('g', { class: 'tipburn' }, g), ext = 0.45 + 0.55 * tipburn;
      el('path', { d: tbLeaves.map(([ox, oy, a, L, x0, dm]) => topEdgeD(ox, oy, a, L, x0, dm, ext)).join(''), fill: 'none', stroke: mix('b0793a', '5a3414', tipburn), 'stroke-width': 2.2 + tipburn * 1.6, 'stroke-linecap': 'round', class: 'tb-edge' }, tg);
      el('path', { d: tbLeaves.map(([ox, oy, a, L, x0, dm]) => topEdgeD(ox, oy, a, L, x0, dm, ext * 0.8, 2.6)).join(''), fill: 'none', stroke: '#d9b27a', 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-dasharray': '3 2', opacity: 0.85, class: 'tb-crisp' }, tg);
    }
    slugMarks(g, outer, slug, pal.seed);
    rotRibs(g, outer, rr);
    blemish(g, pal, leafPts);
    dots(g, p, leafPts, R);
  }

  /* ---- basil: bushy herb, glossy oval leaves in opposite pairs; bolt = pale flower spikes; cut = just trimmed back ---- */
  function basilPlant(g, pal, p) {
    if (pal.stage === 0) return seedling(g, pal, 'basil');
    const { wilt, seed } = pal, cut = clamp01(p.cut), bolt = clamp01(p.bolt), cold = clamp01(p.cold), leggy = clamp01(p.leggy), size = pal.size * (1 - 0.35 * cut), leafPts = [], tips = [], coldL = [], legD = [], downy = clamp01(p.downy), fus = clamp01(p.fusarium), dwL = [], hwD = [];
    const nStems = size < 0.2 ? 1 : size < 0.42 ? 2 : size < 0.7 ? 3 : 4, Lmax = (14 + size * 24) * (pal.stage >= 2 ? 1.15 : 1) * (1 - 0.18 * leggy);
    [[0, 0, 1], [-1, -26, 0.8], [1, 26, 0.88], [0.25, -44, 0.55]].slice(0, nStems).forEach(([sx, lean, f], si) => {
      const H = (18 + size * 150) * f * (1 + 0.3 * leggy), nodes = Math.max(2, Math.round(2 + size * 3)), base = [sx * (6 + size * 8), 0], sp = [];
      const hw = fus > 0.02 && (lean < 0 || nStems === 1), wl = hw ? Math.max(wilt, fus * 0.9) : wilt; // one-sided wilt (fusarium): the stems on the left droop
      for (let i = 0; i <= nodes; i++) { const t = i / nodes; sp.push([base[0] + Math.sin(lean * Math.PI / 180) * H * t * 0.9 + Math.sin(i * 1.4 + seed + si) * 2.5 + wl * t * t * 14 * (lean >= 0 ? 1 : -1), -H * Math.cos(lean * Math.PI / 180) * t]); }
      stem(g, polyD(sp), 2.8 + size * 2 - leggy * 0.8, pal.stem(0));
      if (hw) hwD.push(polyD(sp));
      if (leggy > 0) legD.push(polyD(sp)); // pale stretched-stem highlight, one path for all stems
      for (let i = 1; i <= nodes; i++) {
        const [x, y] = sp[i], t = i / nodes, L = Lmax * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.85))) * (1 + (h01(seed, i + si * 9, 2) - 0.5) * 0.2) * (i === nodes ? 0.65 : 1);
        [-1, 1].forEach(s => {
          const a = capAng(lean * 0.6 + s * (64 - 12 * t) + s * wl * 42, y, L), col0 = i === nodes ? lighten(pal.leaf(1, 0), 0.3) : pal.leaf(t, 0.4 - 0.3 * t), col1 = leggy > 0 ? mix(col0, 'c9d77a', leggy * 0.5) : col0, col = hw ? mix(col1, 'c8c06a', fus * 0.5) : col1, lt = tf(x, y, a);
          const BG = lfGroup(g, x, y, s);
          el('path', { d: ovalD(L, L * 0.46, 0.15), transform: lt, fill: col, stroke: OUT, 'stroke-width': 1.7, 'stroke-linejoin': 'round' }, BG);
          if (L > 18) el('path', { d: `M0 ${n1(-L * 0.08)} L0 ${n1(-L * 0.8)} M${n1(-L * 0.2)} ${n1(-L * 0.3)} Q${n1(-L * 0.27)} ${n1(-L * 0.55)} ${n1(-L * 0.13)} ${n1(-L * 0.78)}`, transform: lt, fill: 'none', stroke: mix(col, 'ffffff', 0.4), 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: 0.8 }, BG);
          const ra = a * Math.PI / 180; leafPts.push([x + Math.sin(ra) * L * 0.5, y - Math.cos(ra) * L * 0.5, t]);
          if (cold > 0) coldL.push([x, y, a, L, L * 0.46, s]);
          if (downy > 0.02) dwL.push([x, y, a, L, L * 0.46, s, t]);
        });
      }
      const tp = sp[nodes];
      if (cut > 0.15) el('ellipse', { cx: tp[0], cy: tp[1] - 1, rx: 3.5, ry: 1.6, fill: '#e9e3b8', stroke: OUT, 'stroke-width': 1.2 }, g); // fresh cut end
      else [-1, 1].forEach(s => el('path', { d: ovalD(6 + size * 7, (6 + size * 7) * 0.5, 0.15), transform: tf(tp[0], tp[1] - 1, s * 22 + wl * s * 40), fill: lighten(pal.tip(), 0.35), stroke: OUT, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, g));
      tips.push(tp);
    });
    if (bolt > 0.1 && cut < 0.15) tips.forEach(tp => { // flower spikes: whorls of tiny pale blooms
      const Hs = (18 + size * 14) * (0.5 + bolt * 0.5), x = tp[0], y0 = tp[1] - 2;
      stem(g, `M${n1(x)} ${n1(y0)} L${n1(x)} ${n1(y0 - Hs)}`, 2, '#8fbf5a');
      let d = '';
      for (let w = 0; w < 4; w++) { const y = y0 - 5 - w * (Hs - 6) / 3.2, s = 4.6 - w * 0.5; d += `M${n1(x - s * 1.7)} ${n1(y)} a${n1(s)} ${n1(s * 0.65)} 0 1 0 ${n1(s * 2)} 0 a${n1(s)} ${n1(s * 0.65)} 0 1 0 ${n1(-s * 2)} 0 M${n1(x - s * 0.3)} ${n1(y)} a${n1(s)} ${n1(s * 0.65)} 0 1 0 ${n1(s * 2)} 0 a${n1(s)} ${n1(s * 0.65)} 0 1 0 ${n1(-s * 2)} 0 `; }
      el('path', { d, fill: '#ece2fb', stroke: OUT, 'stroke-width': 1.1 }, g);
      el('ellipse', { cx: x, cy: y0 - Hs - 3, rx: 3, ry: 4.4, fill: '#d9c8f5', stroke: OUT, 'stroke-width': 1.2 }, g);
    });
    if (legD.length) el('path', { d: legD.join(' '), fill: 'none', stroke: '#d6e49a', 'stroke-width': 1, 'stroke-linecap': 'round', opacity: 0.65, class: 'leggy' }, g);
    if (cold > 0.02 && coldL.length) { // cold damage: the last part of each leaf goes dark purple-black with a curled tip (all leaves in two paths)
      let cd = '', cu = ''; const fr = 0.14 + 0.24 * cold;
      coldL.forEach(([x, y, a, L, W, s]) => {
        const L0 = L * (1 - fr), W0 = W * 0.62 * (1 - fr * 0.5), P = (u, v) => ptS(rotP(x, y, a, u, v));
        cd += `M${P(-W0, -L0)} Q${P(-W0 * 0.5, -L * 0.97)} ${P(s * L * 0.1, -L * 0.98)} Q${P(W0 * 0.7, -L * 0.96)} ${P(W0, -L0)} Q${P(0, -L0 + L * 0.06)} ${P(-W0, -L0)}Z `;
        cu += `M${P(s * L * 0.1, -L * 0.98)} q${n1(s * 2.2)} ${n1(-0.06 * L - 1)} ${n1(s * 2.4)} 1.8 `;
      });
      el('path', { d: cd, fill: mix('5a3a78', '1c1224', cold), stroke: OUT, 'stroke-width': 0.9, 'stroke-linejoin': 'round', opacity: 0.55 + 0.4 * cold, class: 'coldtip' }, g);
      el('path', { d: cu, fill: 'none', stroke: '#1c1224', 'stroke-width': 1.6, 'stroke-linecap': 'round', class: 'coldcurl' }, g);
    }
    if (hwD.length) el('path', { d: hwD.join(' '), fill: 'none', stroke: mix('b8a060', '6b4a22', fus), 'stroke-width': 1.5, 'stroke-linecap': 'round', opacity: 0.5 + 0.4 * fus, class: 'halfwilt' }, g); // vascular browning up the wilted stems
    if (downy > 0.02 && dwL.length) { // downy mildew: yellow angular blotches between the veins (oldest leaves first) and a grey fuzz line on the underside edge
      const nL = Math.min(24, Math.max(1, Math.round(downy * dwL.length))), use = dwL.slice().sort((u, v) => u[6] - v[6]).slice(0, nL);
      let yd = '', gd = '';
      use.forEach(q => {
        const P = (u, v) => ptS(rotP(q[0], q[1], q[2], u, v)), L = q[3], W = q[4];
        [-1, 1].forEach(sd => { yd += 'M' + P(sd * W * 0.2, -L * 0.28) + ' L' + P(sd * W * 0.7, -L * 0.34) + ' L' + P(sd * W * 0.62, -L * 0.62) + ' L' + P(sd * W * 0.18, -L * 0.56) + ' Z '; });
        gd += 'M' + P(q[5] * W * 0.85, -L * 0.3) + ' Q' + P(q[5] * W * 1.0, -L * 0.55) + ' ' + P(q[5] * W * 0.6, -L * 0.8) + ' ';
      });
      el('path', { d: yd, fill: mix('e3da3c', 'b8a020', downy), opacity: 0.55 + 0.3 * downy, class: 'downy' }, g);
      el('path', { d: gd, fill: 'none', stroke: '#9a9a96', 'stroke-width': 1.6, 'stroke-dasharray': '1.5 1.2', 'stroke-linecap': 'round', opacity: 0.7, class: 'downyfuzz' }, g);
    }
    blemish(g, pal, leafPts);
    dots(g, p, leafPts, 30);
  }

  /* ---- v54 (Trev 2026-11-09: realistic, well drawn plants): painted crop sprites from art/plants/plants.json (gen_plants.py + cut_plants.py).
     Art.setPlantSprites(manifest) switches a crop to its sprites; a crop with no sprites keeps the drawn SVG plant. The sprite stands on its
     stem base (manifest base = x of the base as a fraction of the width), its height follows the same size curve as the drawn plant, health
     shows as yellowing and dulling (CSS filter) and a droop about the base, and the critters get a loose grid of anchors over the foliage. */
  let SPRITES = null;
  function setPlantSprites(m) { SPRITES = m && typeof m === 'object' ? m : null; }
  function spriteFor(p) {
    const set = SPRITES && SPRITES[p.crop]; if (!set) return null;
    const stage = Math.max(0, Math.min(3, p.stage || 0)); let key = p.crop + '_s' + stage;
    if (stage === 3 && set[key + '_r']) { const fr = p.fruits && p.fruits.length ? p.fruits.reduce((a, f) => a + clamp01(f.ripe), 0) / p.fruits.length : 0; key += fr < 0.3 ? '_g' : fr < 0.72 ? '_h' : '_r'; }
    const sp = set[key] || set[p.crop + '_s' + stage]; return sp && sp.src && sp.w > 0 && sp.h > 0 ? sp : null;
  }
  /* the sprite box follows the drawn plant: height = a + b * size per crop and stage, fitted to Art.plant's own bounding box (hg-cap/rc1m/calib.js,
     7 sizes per stage, residual under 8 units except cucumber stage 3 at 17), so a painted plant stands as tall as the drawn one did */
  const SPRITE_H = { tomato: { 0: [67.5, 127.0], 1: [49.7, 265.6], 2: [49.7, 265.6], 3: [52.3, 262.0] }, chilli: { 0: [60.5, 112.9], 1: [47.8, 202.6], 2: [47.8, 202.6], 3: [52.3, 196.4] }, capsicum: { 0: [60.5, 112.9], 1: [49.4, 192.5], 2: [49.4, 192.5], 3: [51.3, 189.8] }, cucumber: { 0: [54.6, 102.0], 1: [43.6, 278.8], 2: [43.6, 278.8], 3: [81.4, 229.8] }, strawberry: { 0: [66.6, 125.2], 1: [47.3, 80.9], 2: [47.3, 80.8], 3: [47.3, 80.9] }, lettuce: { 0: [63.3, 120.6], 1: [49.6, 97.5], 2: [49.6, 97.5], 3: [51.0, 92.7] }, basil: { 0: [56.1, 104.3], 1: [25.4, 157.5], 2: [25.3, 158.1], 3: [25.3, 158.1] } };
  function spritePlant(g, pal, sp, crop) {
    const fit = (SPRITE_H[crop] || SPRITE_H.tomato)[pal.stage] || SPRITE_H.tomato[1];
    const Hd = fit[0] + fit[1] * pal.size, w = Hd * sp.w / sp.h, bx = clamp01(sp.base == null ? 0.5 : sp.base);
    const box = el('g', { class: 'spritebox' }, g);
    let im;
    if (sp.atlas && sp.aw > 0) { /* the crop's atlas (one webp per crop): a nested svg whose viewBox is this sprite's cell crops it */
      const cell = el('svg', { x: n1(-bx * w), y: n1(-Hd), width: n1(w), height: n1(Hd), viewBox: `${sp.ax} ${sp.ay} ${sp.w} ${sp.h}`, preserveAspectRatio: 'none', class: 'crop-cell' }, box);
      im = el('image', { href: sp.atlas, x: 0, y: 0, width: sp.aw, height: sp.ah, class: 'crop-sprite', 'data-src': sp.src }, cell);
    } else im = el('image', { href: sp.src, x: n1(-bx * w), y: n1(-Hd), width: n1(w), height: n1(Hd), preserveAspectRatio: 'none', class: 'crop-sprite' }, box);
    /* problem marks over the painted plant (the drawn plant paints them per leaf; a sprite gets a seeded scatter over its foliage band, the
       upper 70 % of the box): leaf spots as dark brown dots, powdery mildew as soft white patches, EC scorch as rust tips along the outer edge.
       At most 6 nodes each, nothing drawn while the look is under 0.02 (the exact same DOM as before for a healthy plant). */
    const rnd = (i, k) => ((Math.sin((pal.seed + 1) * 9301 + i * 49297 + k * 233) * 0.5 + 0.5) % 1), top = -Hd, band = Hd * 0.7, L = -bx * w, s = Math.max(0.7, Hd / 160);
    /* v54 (critic round 7 #3): marks sit on the painted leaves. plants.json carries pts per sprite ([u, v] on opaque greenish pixels, outermost
       first); pt(i, k, edge) picks one by the seed (edge: from the outer third, for scorch tips) and maps it into the box. No pts: the old spread. */
    const pts = sp.pts && sp.pts.length ? sp.pts : null;
    /* v55: a lesion is an irregular blob, not a disc: six points at a radius that wobbles 0.75 to 1.25 by the seed */
    const blob = (cx, cy, r, i) => { let d = ''; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, rr = r * (0.75 + 0.5 * rnd(i, 20 + k)); d += (k ? 'L' : 'M') + n1(cx + rr * Math.cos(a)) + ' ' + n1(cy + rr * Math.sin(a)); } return d + 'Z'; };
    const pt = (i, k, edge) => { if (!pts) return null; const m = edge ? Math.max(1, Math.floor(pts.length / 3)) : pts.length, p = pts[Math.floor(rnd(i, k) * m) % m]; return [L + w * p[0], top + Hd * p[1], p[0] < 0.5 ? -1 : 1]; };
    if (pal.sp > 0.02) { const m = el('g', { class: 'spots' }, box), n = Math.round(2 + 4 * pal.sp); for (let i = 0; i < n; i++) { const q = pt(i, 1); const bx_ = q ? q[0] : L + w * (0.12 + 0.76 * rnd(i, 1)), by_ = q ? q[1] : top + band * (0.1 + 0.85 * rnd(i, 2)); el('path', { d: blob(bx_, by_, (2.2 + 2.2 * rnd(i, 3)) * s, i), style: 'mix-blend-mode:multiply', fill: '#7a4520', opacity: n1(0.5 + 0.3 * pal.sp) }, m); } }
    if (pal.mil > 0.02) { const m = el('g', { class: 'mildew' }, box), n = Math.round(2 + 3 * pal.mil); for (let i = 0; i < n; i++) { const q = pt(i, 4); el('ellipse', { cx: n1(q ? q[0] : L + w * (0.15 + 0.7 * rnd(i, 4))), cy: n1(q ? q[1] : top + band * (0.15 + 0.75 * rnd(i, 5))), rx: n1((4 + 3 * rnd(i, 6)) * s), ry: n1((2.5 + 2 * rnd(i, 7)) * s), fill: '#f4f4ec', opacity: n1(0.22 + 0.3 * pal.mil), style: 'mix-blend-mode:screen;filter:blur(0.8px)' }, m); } }
    if (pal.scorch > 0.02) { const m = el('g', { class: 'scorch' }, box), n = Math.round(2 + 3 * pal.scorch); for (let i = 0; i < n; i++) { const q = pt(i, 8, true), side = q ? -q[2] : (i % 2 ? 1 : -1), /* v55 (round 8 #1): from a leaf-point the tip points inward, so the mark lies on the leaf */ cx = q ? q[0] : L + w * (0.5 + side * (0.14 + 0.2 * rnd(i, 8))), cy = q ? q[1] : top + band * (0.05 + 0.8 * rnd(i, 9)); el('path', { d: `M${n1(cx)} ${n1(cy)} l${n1(side * 5 * s)} ${n1(-2.5 * s)} l${n1(side * 2 * s)} ${n1(5 * s)} z`, fill: '#d9924a', opacity: n1(0.7 + 0.3 * pal.scorch), style: 'mix-blend-mode:multiply' }, m); } }
    const f = [];
    /* chlorosis goes yellow, a dead plant goes brown (hg-cap/rc1m/filtertest.png: sepia alone greyed the painted leaves on the dark tent) */
    if (pal.chl > 0.02) f.push(`sepia(${n1(0.5 * pal.chl)}) hue-rotate(${n1(-12 * pal.chl)}deg) saturate(${n1(1 + 0.5 * pal.chl)})`);
    if (pal.brown > 0.02) f.push(`sepia(${n1(pal.brown)}) hue-rotate(${n1(-20 * pal.brown)}deg) saturate(${n1(1 - 0.1 * pal.brown)}) brightness(${n1(1 - 0.4 * pal.brown)})`);
    if (f.length) box.setAttribute('style', 'filter:' + f.join(' '));
    if (pal.wilt > 0.02) box.setAttribute('transform', `scale(1 ${n1(1 - 0.24 * pal.wilt)}) skewX(${n1(-7 * pal.wilt)})`);
    /* critter anchors are numbers (fx.js adds to them and calls toFixed; v49 probe: a string anchor threw a frame error on every frame once pests showed in the pots and the day redraw never ran again) */
    if (CUR) for (let i = 0; i < 8; i++) { const u = (i % 4 + 0.5) / 4, v = i < 4 ? 0.2 : 0.55; CUR.anchors.push([Math.round((u - bx) * w * 10) / 10, Math.round(-Hd * (1 - v) * 10) / 10, 0]); }
  }
  function plant(parent, p) {
    const g = el('g', { class: 'plant' }, parent), sway = el('g', { class: 'sway' }, g), pal = palette(p);
    const draw = { tomato: tomatoPlant, chilli: chilliPlant, capsicum: capsicumPlant, cucumber: cucumberPlant, strawberry: strawberryPlant, lettuce: lettucePlant, basil: basilPlant }[p.crop] || tomatoPlant;
    const sp = spriteFor(p);
    const prev = CUR; CUR = { seed: pal.seed, lf: [], anchors: [], mil: null };
    try { if (sp) spritePlant(sway, pal, sp, p.crop); else draw(sway, pal, p); } finally { g._lf = CUR.lf; g._anchors = CUR.anchors; g._mil = CUR.mil; CUR = prev; }
    return g;
  }

  /* ---------------- TENT SCENE ---------------- */
  // scene(parent) -> controller {setLight(on, intensity), setReservoir(frac, bubbles), setFan(speed), setPlant(p), setMedium(m), night(t)}
  // opts.painted: a painted interior sits behind the SVG, so the mylar walls and streaks are skipped and the floor goes translucent
  function scene(parent, W = 400, H = 520, opts) {
    const painted = !!(opts && opts.painted);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'scene', role: 'img', 'aria-label': 'Your grow tent' }, parent);
    const defs = el('defs', {}, svg);
    const mylar = el('linearGradient', { id: 'mylar', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    [['0', '#d9dde2'], ['0.35', '#f6f8fa'], ['0.55', '#b8bec6'], ['0.8', '#eef1f4'], ['1', '#c4c9cf']].forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, mylar));
    const cone = el('radialGradient', { id: 'cone', cx: 0.5, cy: 0, r: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#fff6d8', 'stop-opacity': 0.85 }, cone);
    el('stop', { offset: 0.6, 'stop-color': '#ffe9b0', 'stop-opacity': 0.18 }, cone);
    el('stop', { offset: 1, 'stop-color': '#ffe9b0', 'stop-opacity': 0 }, cone);
    const fogGr = el('linearGradient', { id: 'fog', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#f2f8ff', 'stop-opacity': 0.55 }, fogGr); el('stop', { offset: 1, 'stop-color': '#f2f8ff', 'stop-opacity': 0 }, fogGr);
    const frostGr = el('linearGradient', { id: 'frost', x1: 0, y1: 1, x2: 0, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': '#dff2ff', 'stop-opacity': 0.55 }, frostGr); el('stop', { offset: 1, 'stop-color': '#dff2ff', 'stop-opacity': 0 }, frostGr);
    const water = el('linearGradient', { id: 'water', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#6fc3e8' }, water); el('stop', { offset: 1, 'stop-color': '#2b7fb0' }, water);
    const shGr = el('radialGradient', { id: 'propshadow', cx: 0.5, cy: 0.5, r: 0.5 }, defs); /* v37: one soft contact shadow for every prop, light from the upper left */
    el('stop', { offset: 0, 'stop-color': '#050a0c', 'stop-opacity': 0.55 }, shGr); el('stop', { offset: 0.7, 'stop-color': '#050a0c', 'stop-opacity': 0.2 }, shGr); el('stop', { offset: 1, 'stop-color': '#050a0c', 'stop-opacity': 0 }, shGr);
    // tent frame + mylar walls
    if (!painted) el('rect', { x: 8, y: 8, width: W - 16, height: H - 16, rx: 14, fill: '#161a16', stroke: OUT, 'stroke-width': 4 }, svg); /* v37 [M16]: no black frame over a painted plate */
    if (!painted) {
      el('rect', { x: 22, y: 22, width: W - 44, height: H - 44, rx: 8, fill: 'url(#mylar)', stroke: OUT, 'stroke-width': 2.5 }, svg);
      const wr = rng(3);
      for (let i = 0; i < 14; i++) { const x = 30 + wr() * (W - 60); el('path', { d: `M${x} 26 Q${x + 18 - wr() * 36} ${H / 2} ${x + 10 - wr() * 20} ${H - 26}`, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, opacity: 0.55 }, svg); }
      for (let i = 0; i < 10; i++) { const x = 30 + wr() * (W - 60); el('path', { d: `M${x} 26 Q${x + 12 - wr() * 24} ${H / 2} ${x + 6 - wr() * 12} ${H - 26}`, fill: 'none', stroke: '#8f969e', 'stroke-width': 1.2, opacity: 0.45 }, svg); }
    }
    // floor
    if (!painted) el('rect', { x: 22, y: H - 70, width: W - 44, height: 48, fill: '#3a3f44', stroke: OUT, 'stroke-width': 2 }, svg); /* v37: the translucent grey slab only when there is no plate */
    // climate layers: condensation on the mylar, fog band, floor frost (all start hidden)
    const cr = rng(11), condG = el('g', { class: 'cond', 'pointer-events': 'none' }, svg), drops = [];
    const fogG = el('rect', { x: 24, y: 24, width: W - 48, height: 90, fill: 'url(#fog)', 'pointer-events': 'none' }, svg);
    for (let i = 0; i < 16; i++) {
      const side = i % 4, x = side === 0 ? 26 + cr() * 14 : side === 1 ? W - 40 + cr() * 14 : 30 + cr() * (W - 60), y = side < 2 ? 40 + cr() * (H - 140) : side === 2 ? 26 + cr() * 10 : 40 + cr() * 60;
      const d = el('ellipse', { cx: x, cy: y, rx: 2.4 + cr() * 2, ry: 3.4 + cr() * 3, fill: '#d6ecfa', stroke: '#5f8fb0', 'stroke-width': 0.9 }, condG);
      d.style.opacity = 0; d.style.transition = 'opacity 1.2s ease-in'; drops.push(d);
    }
    fogG.style.opacity = 0; fogG.style.transition = 'opacity 2s ease-in-out';
    const frost = el('rect', { x: 22, y: H - 78, width: W - 44, height: 14, fill: 'url(#frost)', 'pointer-events': 'none' }, svg);
    frost.style.opacity = 0; frost.style.transition = 'opacity 2s ease-in-out';
    // light cone (behind plant)
    const coneG =el('g', { class: 'cone' }, svg);
    el('path', { d: `M${W / 2 - 80} 64 L${W / 2 + 80} 64 L${W - 30} ${H - 70} L30 ${H - 70} Z`, fill: 'url(#cone)' }, coneG);
    // hanging ropes + LED bar
    el('line', { class: 'tentgear', x1: W / 2 - 70, y1: 22, x2: W / 2 - 70, y2: 50, stroke: OUT, 'stroke-width': 2 }, svg);
    el('line', { class: 'tentgear', x1: W / 2 + 70, y1: 22, x2: W / 2 + 70, y2: 50, stroke: OUT, 'stroke-width': 2 }, svg);
    el('rect', { class: 'tentgear', x: W / 2 - 92, y: 48, width: 184, height: 18, rx: 5, fill: '#2b2f33', stroke: OUT, 'stroke-width': 3 }, svg);
    const leds = el('g', { class: 'tentgear' }, svg); /* v36: tentgear = hung lights, fan and feed line; hidden on a veranda and in a garden bed (index.html) */
    for (let i = 0; i < 12; i++) el('rect', { x: W / 2 - 84 + i * 14.5, y: 60, width: 10, height: 4, rx: 2, fill: '#fff4cf', class: 'led' }, leds);
    // heat shimmer: wavy lines above/below the LED bar (shown at airT >= 30)
    const shim = el('g', { 'pointer-events': 'none' }, svg), shimY = [32, 41, 76, 88], shimP = shimY.map(y => el('path', { d: '', fill: 'none', stroke: '#ff8a3c', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.6 }, shim));
    const shimD = (y, ph) => { let d = `M${W / 2 - 80} ${y}`; for (let i = 1; i <= 8; i++) d += ` Q${W / 2 - 80 + i * 20 - 10} ${y + (i % 2 ? -3.5 : 3.5) * Math.cos(ph + i)} ${W / 2 - 80 + i * 20} ${y}`; return d; };
    shim.style.opacity = 0; shim.style.transition = 'opacity 1.5s ease-in-out';
    // fan (top right)
    const fanG = el('g', { class: 'tentgear', transform: `translate(${W - 66} 104)` }, svg);
    el('circle', { r: 30, fill: '#2b2f33', stroke: OUT, 'stroke-width': 3 }, fanG);
    const blades = el('g', { class: 'blades' }, fanG);
    for (let i = 0; i < 4; i++) el('path', { d: 'M0 0 Q14 -6 22 -2 Q14 6 0 0 Z', fill: '#8d949b', stroke: OUT, 'stroke-width': 1.4, transform: `rotate(${i * 90})` }, blades);
    el('circle', { r: 5, fill: '#5b6168', stroke: OUT, 'stroke-width': 1.5 }, fanG);
    // air streams blowing left from the fan; length follows speed
    const airG = el('g', { class: 'tentgear', 'pointer-events': 'none' }, svg), airP = [-11, 0, 11].map(o => el('path', { d: '', fill: 'none', stroke: '#7f93a8', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': '9 7', opacity: 0.4 }, airG));
    // reservoir (bottom left)
    const res = el('g', { class: 'resholder', 'data-home': `translate(42 ${H - 150})`, transform: `translate(42 ${H - 150})` }, svg);
    el('ellipse', { cx: 52, cy: 94, rx: 62, ry: 9, fill: 'url(#propshadow)', 'pointer-events': 'none' }, res); /* v37 */
    el('rect', { x: 0, y: 0, width: 92, height: 92, rx: 8, fill: '#1d2b33', stroke: OUT, 'stroke-width': 3 }, res);
    const waterRect = el('rect', { x: 4, y: 20, width: 84, height: 68, rx: 5, fill: 'url(#water)' }, res);
    const bubbleG = el('g', {}, res);
    el('rect', { x: -2, y: -6, width: 96, height: 12, rx: 4, fill: '#2a3b45', stroke: OUT, 'stroke-width': 2.5 }, res);
    el('rect', { x: 6, y: 22, width: 5, height: 60, rx: 2.5, fill: '#ffffff', opacity: 0.16, 'pointer-events': 'none' }, res); /* v37: window glint from the upper left */
    el('text', { x: 46, y: 56, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 800, fill: '#e8f6ff', opacity: 0.85, 'font-family': 'system-ui, sans-serif', 'letter-spacing': 0.5 }, res).textContent = 'FEED'; /* v37 [m3]: was NUTES, clipped at small sizes */
    // feed line to pot
    const feedLine = el('path', { class: 'tentgear', d: `M134 ${H - 140} Q170 ${H - 170} ${W / 2 - 6} ${H - 118}`, fill: 'none', stroke: '#1b1f22', 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
    // humidifier / dehumidifier unit on the floor, left of the pot
    const unit = el('g', { transform: `translate(148 ${H - 60})`, 'pointer-events': 'none' }, svg), unitBody = el('rect', { x: 0, y: 0, width: 30, height: 26, rx: 5, fill: '#4d93b8', stroke: OUT, 'stroke-width': 2.5 }, unit);
    el('rect', { x: 5, y: 5, width: 20, height: 4, rx: 2, fill: '#1d2b33' }, unit);
    const unitLed = el('circle', { cx: 24, cy: 18, r: 2.4, fill: '#6ec846', stroke: OUT, 'stroke-width': 1 }, unit);
    const staticMist = el('g', {}, unit); [[8, -6, 5], [16, -13, 4], [11, -19, 3]].forEach(([x, y, r]) => el('circle', { cx: x, cy: y, r, fill: '#eaf6ff', opacity: 0.55 }, staticMist));
    unit.style.opacity = 0;
    // plant holder
    const plantG = el('g', { class: 'plantholder', transform: `translate(${W / 2 + 30} ${H - 112})` }, svg); /* v36: class marks the holder so props can hide it */
    // pot
    const potG = el('g', { class: 'potholder', transform: `translate(${W / 2 + 30} ${H - 112})` }, svg);
    const potShadow = el('ellipse', { cx: 8, cy: 49, rx: 60, ry: 9, fill: 'url(#propshadow)', 'pointer-events': 'none' }, potG); /* v37: contact shadow, offset away from the upper-left light */
    const potShape = el('path', { d: 'M-46 0 L46 0 L38 46 L-38 46 Z', fill: '#26292c', stroke: OUT, 'stroke-width': 3.2, 'stroke-linejoin': 'round' }, potG);
    const potGlint = el('path', { d: 'M-40 6 L-35 6 L-31 40 L-34 40 Z', fill: '#ffffff', opacity: 0.14, 'pointer-events': 'none' }, potG); /* v37 */
    const media = el('ellipse', { cx: 0, cy: 1, rx: 44, ry: 7, fill: '#7a4f2e', stroke: OUT, 'stroke-width': 2 }, potG);
    /* v37 [B7]: the hydro tub. A dark rectangular reservoir with a lid, three net pots in the lid (the plant grows from the middle one), a translucent level window and an air line.
       Shown instead of the pot while the medium is hydro; the water window is the tank the Top up / Mix feed / Fresh tank actions change (level + EC tint). */
    const tubG = el('g', { class: 'hydrotub', 'pointer-events': 'none' }, potG); tubG.style.display = 'none';
    el('ellipse', { cx: 8, cy: 54, rx: 78, ry: 9, fill: 'url(#propshadow)' }, tubG);
    el('rect', { x: -60, y: 6, width: 120, height: 46, rx: 6, fill: '#1d2b33', stroke: OUT, 'stroke-width': 3.2 }, tubG);
    el('rect', { x: -50, y: 17, width: 100, height: 28, rx: 4, fill: '#0f181d', stroke: '#4a6a78', 'stroke-width': 1.6 }, tubG); /* the window */
    const tubWater = el('rect', { x: -49, y: 44, width: 98, height: 0, rx: 3, fill: '#6fc3e8', opacity: 0.82 }, tubG);
    const tubBub = el('g', {}, tubG);
    for (let i = 1; i < 4; i++) el('line', { x1: 44, y1: 17 + i * 7, x2: 49, y2: 17 + i * 7, stroke: '#cfe6ef', 'stroke-width': 1.2, opacity: 0.7 }, tubG); /* level ticks */
    el('rect', { x: -46, y: 19, width: 6, height: 24, rx: 3, fill: '#ffffff', opacity: 0.2 }, tubG); /* window glint */
    el('rect', { x: -64, y: -2, width: 128, height: 10, rx: 4, fill: '#2f4350', stroke: OUT, 'stroke-width': 3 }, tubG); /* lid */
    el('rect', { x: -60, y: 0, width: 50, height: 2.5, rx: 1.2, fill: '#ffffff', opacity: 0.18 }, tubG);
    [-36, 0, 36].forEach((x, k) => {
      el('ellipse', { cx: x, cy: 3, rx: 13, ry: 3.4, fill: '#10181c', stroke: OUT, 'stroke-width': 1.6 }, tubG);
      el('path', { d: `M${x - 11} 2 L${x + 11} 2 L${x + 8} -8 L${x - 8} -8 Z`, fill: '#2a2f33', stroke: OUT, 'stroke-width': 2, 'stroke-linejoin': 'round' }, tubG);
      el('path', { d: `M${x - 9} -4 L${x + 9} -4 M${x - 3} -8 L${x - 5} 2 M${x + 3} -8 L${x + 5} 2`, stroke: '#6b747a', 'stroke-width': 1, opacity: 0.8 }, tubG);
      el('ellipse', { cx: x, cy: -8, rx: 8, ry: 2.4, fill: '#a8663c', stroke: OUT, 'stroke-width': 1.4 }, tubG); /* clay pebbles */
      el('circle', { cx: x - 3, cy: -8.5, r: 1.3, fill: '#c98a5a' }, tubG); el('circle', { cx: x + 3, cy: -8, r: 1.3, fill: '#8f5430' }, tubG);
    });
    const airLine = el('path', { d: 'M-62 -4 Q-84 -4 -88 24 Q-90 40 -104 50', fill: 'none', stroke: '#1b1f22', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, tubG);
    const airPump = el('g', { transform: 'translate(-124 36)' }, tubG);
    el('rect', { x: 0, y: 0, width: 28, height: 18, rx: 4, fill: '#4d93b8', stroke: OUT, 'stroke-width': 2.4 }, airPump);
    el('rect', { x: 4, y: 4, width: 14, height: 3, rx: 1.5, fill: '#1d2b33' }, airPump);
    el('circle', { cx: 22, cy: 12, r: 2, fill: '#6ec846', stroke: OUT, 'stroke-width': 0.8 }, airPump);
    const fuzzO = el('g', { 'pointer-events': 'none' }, potG); // outer group carries the botrytis "breathing"; fuzz keeps its own fade
    const fuzz = el('g', { 'pointer-events': 'none' }, fuzzO);
    [[-26, 0, 5], [-12, 2, 6], [4, -1, 5], [18, 2, 6], [30, 0, 4], [-2, 3, 4]].forEach(([x, y, r]) => el('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.5, fill: '#a3a39a', stroke: '#7c7c74', 'stroke-width': 0.8 }, fuzz));
    fuzz.style.opacity = 0; fuzz.style.transition = 'opacity 1.5s ease-in-out';
    const potLabel = el('text', { x: 0, y: 30, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 900, fill: '#6ec846', 'font-family': 'system-ui, sans-serif', 'letter-spacing': 1 }, potG); potLabel.textContent = 'HYGROW';
    // night overlay
    const night = painted ? el('rect', { x: -400, y: -400, width: W + 800, height: H + 800, fill: '#0b1530', 'pointer-events': 'none' }, svg) /* v37: no rounded box edge over a plate; wide enough for the phone crop */
      : el('rect', { x: 22, y: 22, width: W - 44, height: H - 44, rx: 8, fill: '#0b1530', 'pointer-events': 'none' }, svg);
    night.style.opacity = 0;
    // smooth day/night: fade over 1.5 s (reduced-motion CSS in index.html turns transitions off)
    [night, coneG, leds].forEach(n => { n.style.transition = 'opacity 1.5s ease-in-out'; });
    // fx layer
    const fx = el('g', { class: 'fx' }, svg);
    /* v37 [m12]: rain streaks, drawn only outdoors and only while the weather reading is above 0 (setClimate({ rain })) */
    const rainG = el('g', { class: 'rainfx', 'pointer-events': 'none' }, svg), rr = rng(23), rainP = [];
    for (let i = 0; i < 16; i++) { const x = 14 + rr() * (W - 28), y = 30 + rr() * (H - 150); rainP.push(el('path', { d: `M${n1(x)} ${n1(y)} l-4 14`, stroke: '#cfe6f4', 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.55, 'stroke-dasharray': '7 11' }, rainG)); }
    rainG.style.display = 'none';
    /* v37 [m11]: on a phone the plate box is wide and short; crop the viewBox so the plant and the prop are centred with a little wall above (tower keeps its whole column) */
    const phoneMq = typeof matchMedia === 'function' ? matchMedia('(max-width: 599px)') : null;
    let vbNow = '';
    function fitView() {
      try {
        let vb = `0 0 ${W} ${H}`;
        const r = phoneMq && phoneMq.matches && typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : null;
        if (r && r.width > 20 && r.height > 20) {
          const host = svg.parentNode, tower = !!(host && host.dataset && host.dataset.how === 'tower'), minH = tower ? 410 : 330, bottom = H - 10;
          let vw = 360, vh = vw * r.height / r.width;
          if (vh < minH) { vh = minH; vw = vh * r.width / r.height; }
          if (vh > H) { vh = H; vw = vh * r.width / r.height; }
          vb = `${n1(215 - vw / 2)} ${n1(Math.max(0, bottom - vh))} ${n1(vw)} ${n1(vh)}`;
        }
        if (vb !== vbNow) { vbNow = vb; svg.setAttribute('viewBox', vb); }
      } catch (e) {}
    }
    try {
      if (typeof ResizeObserver === 'function') new ResizeObserver(fitView).observe(svg);
      if (phoneMq && phoneMq.addEventListener) phoneMq.addEventListener('change', fitView);
      if (typeof MutationObserver === 'function' && parent && parent.nodeType === 1) new MutationObserver(fitView).observe(parent, { attributes: true, attributeFilter: ['data-how', 'data-where'] });
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fitView);
    } catch (e) {}

    const st = { fan: 1, light: true, bubbles: true, ang: 0, parts: [], hasClimate: false, outdoors: false, rain: 0, hydro: false, hour: 12, k: 1, ck: '', cond: false, fog: false, shim: false, hum: 'off', airOn: false,
      wiltCur: 0, wiltTgt: 0, wiltLive: false, heatK: 0, pest: 0, mil: 0, bot: 0, lf: [], anchors: [], milNode: null, worst: null, seed: 7, t: 0, puffC: -1, breathOn: false, lfOn: false };
    // problem critters: up to 6 crawling dots plus one mildew puff, all inside one group that mirrors the plant's sway (<= 8 nodes, created once)
    const critG = el('g', { 'pointer-events': 'none' }, plantG), crawl = [];
    for (let i = 0; i < 6; i++) { const n = el('circle', { r: 1.2, cx: 0, cy: 0, fill: '#1d140e', stroke: '#f2f2c0', 'stroke-width': 0.4 }, critG); n.style.display = 'none'; crawl.push({ n, on: false, x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, t0: 0, dur: 4000, hops: 0, re: false }); }
    const puff = el('circle', { r: 6, cx: 0, cy: 0, fill: '#f4f6ec' }, critG); puff.style.display = 'none';
    const rmq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null, reduced = () => !!(rmq && rmq.matches);
    // time-of-day tint keyframes: [hour, colour, opacity]; lit lamps cut the night tint
    const TINT = [[0, [11, 21, 48], 0.5], [5, [11, 21, 48], 0.5], [6.5, [255, 154, 74], 0.22], [8, [255, 154, 74], 0], [17, [255, 128, 64], 0], [18.5, [255, 128, 64], 0.22], [20, [26, 32, 80], 0.38], [22, [11, 21, 48], 0.5], [24, [11, 21, 48], 0.5]];
    function applyTint() {
      let h = ((st.hour % 24) + 24) % 24, a = TINT[0], b = TINT[1];
      for (let i = 0; i < TINT.length - 1; i++) if (h >= TINT[i][0] && h <= TINT[i + 1][0]) { a = TINT[i]; b = TINT[i + 1]; break; }
      const f = b[0] === a[0] ? 0 : (h - a[0]) / (b[0] - a[0]), c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * f));
      night.setAttribute('fill', `rgb(${c[0]},${c[1]},${c[2]})`);
      night.style.opacity = ((a[2] + (b[2] - a[2]) * f) * (st.light ? 0.7 : 1)).toFixed(3);
    }
    function applyFan() {
      const s = st.fan, on = s > 0.01; st.airOn = on;
      airG.style.display = on ? '' : 'none';
      const len = 22 + Math.min(1.5, s) * 48;
      airP.forEach((p, i) => { const o = (i - 1) * 11, x0 = W - 98; p.setAttribute('d', `M${x0} ${104 + o} q${-len * 0.4} ${(i - 1) * 4 - 3} ${-len * 0.5} 0 t${-len * 0.5} ${(i - 1) * 3}`); p.setAttribute('opacity', (0.22 + s * 0.14).toFixed(2)); });
    }
    applyFan();
    // crop growth: cross-fade the old plant group out while the new one scales in about the pot base (reduced motion: hard cut)
    const FADE_MS = 600; let fade = null;
    const canAnim = n => !!(n && typeof n.animate === 'function');
    function finishFade() {
      if (!fade) return;
      const f = fade; fade = null;
      try { f.anims.forEach(a => { a.onfinish = null; a.cancel(); }); } catch (e) {}
      f.nu.style.opacity = '';
      if (f.old.parentNode) f.old.remove();
    }
    function stageGlow() { // one-shot ring that expands and fades under the pot
      if (reduced()) return;
      try {
        const ring = el('ellipse', { cx: W / 2 + 30, cy: H - 66, rx: 52, ry: 11, fill: 'rgba(143,230,98,0.28)', stroke: '#b6f58a', 'stroke-width': 3, 'pointer-events': 'none' }, svg);
        svg.insertBefore(ring, plantG); // under the plant and the pot
        if (!canAnim(ring)) { setTimeout(() => ring.remove(), 900); return; }
        ring.style.transformBox = 'fill-box'; ring.style.transformOrigin = 'center';
        const a = ring.animate([{ transform: 'scale(0.45)', opacity: 0.95 }, { transform: 'scale(1.75)', opacity: 0 }], { duration: 900, easing: 'ease-out', fill: 'both' });
        a.onfinish = () => ring.remove();
        setTimeout(() => { if (ring.parentNode) ring.remove(); }, 1200);
      } catch (e) {}
    }
    /* ---- crop problem animations (all driven from update; nothing runs under reduced motion) ---- */
    // leaf wrappers: wilt droop (eased in update) plus a 2 to 3 Hz heat tremble of +-0.6 deg
    function applyLeaves(t, off) {
      const L = st.lf; if (!L.length) return;
      const base = off ? 0 : (st.wiltCur > 0.004 ? Art.wiltAngle(st.wiltCur, 0) : 0), hk = off ? 0 : st.heatK;
      for (let i = 0; i < L.length; i++) {
        const o = L[i]; let a = o.s * base * o.k;
        if (hk > 0.01) a += hk * 0.6 * Math.sin(t / 1000 * 2 * Math.PI * (2 + (i % 3) * 0.5) + i * 1.7);
        a = Math.round(a * 100) / 100;
        if (a !== o.a) { o.a = a; if (a) o.n.setAttribute('transform', `rotate(${a} ${o.px} ${o.py})`); else o.n.removeAttribute('transform'); }
      }
    }
    // pest dots wander between the plant's leaf anchors, 3 to 6 s per hop
    function retarget(c, i, t) {
      const A = st.anchors; if (!A.length) return;
      const j = Math.floor(h01(st.seed, i * 31 + (++c.hops), 6) * A.length) % A.length, q = A[j];
      c.fx = c.x; c.fy = c.y; c.tx = q[0] + (h01(st.seed, i + c.hops, 7) - 0.5) * 6; c.ty = q[1] + (h01(st.seed, i + c.hops, 8) - 0.5) * 6;
      c.dur = 3000 + 3000 * h01(st.seed, i * 17 + c.hops, 9); c.t0 = t; c.re = false;
    }
    function crawlStep(t, off) {
      const want = off ? 0 : Art.pestCount(st.pest), A = st.anchors;
      for (let i = 0; i < crawl.length; i++) {
        const c = crawl[i];
        if (i >= want || !A.length) { if (c.on) { c.on = false; c.n.style.display = 'none'; } continue; }
        if (!c.on) { const q = A[(i * 5 + 1) % A.length]; c.on = true; c.x = c.fx = q[0]; c.y = c.fy = q[1]; retarget(c, i, t); c.n.style.display = ''; }
        if (c.re) retarget(c, i, t);
        let k = (t - c.t0) / c.dur;
        if (k >= 1) { c.x = c.tx; c.y = c.ty; retarget(c, i, t); k = 0; }
        const e = k * k * (3 - 2 * k);
        c.x = c.fx + (c.tx - c.fx) * e; c.y = c.fy + (c.ty - c.fy) * e;
        c.n.setAttribute('transform', `translate(${(c.x + Math.sin(t / 170 + i) * 0.5).toFixed(2)} ${(c.y + Math.cos(t / 210 + i * 2) * 0.4).toFixed(2)})`);
      }
    }
    // mildew / botrytis: spots and pot fuzz breathe (4 s), one faint puff drifts up from the worst leaf every 5 s
    function mildewStep(t, off) {
      const on = !off && (st.mil > 0 || st.bot > 0), br = (0.875 + 0.125 * Math.sin(t / 4000 * 2 * Math.PI)).toFixed(3);
      if (on) {
        if (st.mil > 0 && st.milNode) st.milNode.setAttribute('opacity', br);
        if (st.bot > 0) fuzzO.setAttribute('opacity', br);
        st.breathOn = true;
        const c = Math.floor(t / 5000), p = (t - c * 5000) / 2600;
        if (p < 1) {
          const w = st.worst || [0, -10], a = p < 0.8 ? 0.3 - 0.15 * (p / 0.8) : 0.15 * (1 - (p - 0.8) / 0.2);
          puff.style.display = ''; puff.setAttribute('transform', `translate(${(w[0] + Math.sin(p * 3 + c) * 5).toFixed(1)} ${(w[1] - 6 - p * 30).toFixed(1)}) scale(${(0.7 + p * 0.9).toFixed(2)})`); puff.setAttribute('opacity', a.toFixed(3));
        } else puff.style.display = 'none';
      } else if (st.breathOn) {
        st.breathOn = false; puff.style.display = 'none'; fuzzO.removeAttribute('opacity'); if (st.milNode) st.milNode.removeAttribute('opacity');
      }
    }
    return {
      svg, fx,
      setLight(on, k = 1) {
        st.light = on; st.k = k;
        coneG.style.opacity = on ? 0.25 + 0.75 * k : 0; leds.style.opacity = on ? 0.5 + 0.5 * k : 0.15;
        if (st.hasClimate) applyTint(); else night.style.opacity = on ? 0 : 0.5;
      },
      setClimate(c) {
        if (!c) return;
        const num = v => (typeof v === 'number' ? v : NaN), airT = num(c.airT), rh = num(c.rh), hour = num(c.hour), fan = c.fan == null ? null : +c.fan, pr = c.problems || {}, hm = c.humMode || 'off';
        const host = svg.parentNode, ow = !!(host && host.dataset && (host.dataset.where === 'veranda' || host.dataset.where === 'outdoors')), rain = isFinite(+c.rain) ? Math.max(0, +c.rain) : 0;
        const ck = [ow ? 1 : 0, rain > 0 ? 1 : 0, isFinite(airT) ? Math.round(airT) : '', isFinite(rh) ? Math.round(rh) : '', Math.floor((isFinite(hour) ? hour : 12) * 2), c.lightsOn ? 1 : 0, Math.round((c.dim == null ? 1 : c.dim) * 10), hm, fan, Math.round((pr.botrytis || 0) * 4), pr.pests || 0, pr.pm || 0, pr.dm || 0, c.wilt == null ? '' : Math.round(c.wilt * 20)].join('|');
        if (ck === st.ck) return; st.ck = ck;
        st.hasClimate = true;
        if (isFinite(hour)) st.hour = hour;
        st.light = !!c.lightsOn; if (c.dim != null) st.k = +c.dim;
        coneG.style.opacity = st.light ? 0.25 + 0.75 * st.k : 0; leds.style.opacity = st.light ? 0.5 + 0.5 * st.k : 0.15;
        applyTint();
        if (isFinite(rh)) { // condensation with hysteresis (on >= 75, off < 70), fog >= 88
          if (rh >= 75) st.cond = true; else if (rh < 70) st.cond = false;
          const n = st.cond && !ow ? Math.min(16, 8 + Math.round(Math.max(0, rh - 75) / 13 * 8)) : 0; /* v37: condensation, fog and frost belong to the tent walls, not a veranda or a garden */
          drops.forEach((d, i) => { d.style.opacity = i < n ? 0.85 : 0; });
          if (rh >= 88) st.fog = true; else if (rh < 84) st.fog = false;
          fogG.style.opacity = st.fog && !ow ? Math.min(1, 0.5 + (rh - 88) / 10) : 0;
        }
        if (isFinite(airT)) {
          st.shim = airT >= 30; shim.style.opacity = st.shim ? Math.min(1, 0.5 + (airT - 30) / 8) : 0;
          if (st.shim) shimP.forEach((p, i) => p.setAttribute('d', shimD(shimY[i], i)));
          frost.style.opacity = airT <= 14 && !ow ? Math.min(1, 0.5 + (14 - airT) / 6) : 0;
        }
        st.outdoors = ow; st.rain = ow ? rain : 0; rainG.style.display = st.rain > 0 ? '' : 'none'; rainG.style.opacity = Math.min(1, 0.45 + st.rain / 6).toFixed(2);
        st.hum = hm; unit.style.opacity = hm === 'off' ? 0 : 1;
        unitBody.setAttribute('fill', hm === 'humidify' ? '#4d93b8' : '#8a929a');
        unitLed.style.display = hm === 'dehumidify' ? '' : 'none';
        staticMist.style.display = hm === 'humidify' && reduced() ? '' : 'none';
        if (fan != null) { st.fan = fan / 2; applyFan(); }
        st.pest = clamp01((pr.pests || 0) / 3); st.mil = clamp01(Math.max(pr.pm || 0, pr.dm || 0) / 3); st.bot = clamp01((pr.botrytis || 0) / 3);
        if (c.wilt != null && isFinite(+c.wilt)) { st.wiltTgt = clamp01(+c.wilt); st.wiltLive = true; }
        const b = pr.botrytis || 0; fuzz.style.opacity = b > 0 ? Math.min(0.9, 0.3 + b / 4 * 0.6) : 0;
      },
      /* setReservoir(frac, bubbles, ec): level 0..1 in the side tank and the hydro tub window; the optional ec (mS/cm) tints the water from clear blue to amber-green */
      setReservoir(frac, bubbles, ec) {
        const f = Math.max(0, Math.min(1, frac)); const h = 84 * f; waterRect.setAttribute('y', 88 - h); waterRect.setAttribute('height', Math.max(0, h)); st.bubbles = bubbles; st.resTop = 88 - h;
        const th = 27 * f; tubWater.setAttribute('y', n1(44 - th)); tubWater.setAttribute('height', n1(th)); st.tubTop = 44 - th;
        if (isFinite(+ec) && ec !== null) { const k = Math.max(0, Math.min(1, +ec / 2.2)), A = [111, 195, 232], B = [196, 168, 64], c = A.map((v, i) => Math.round(v + (B[i] - v) * k)); tubWater.setAttribute('fill', `rgb(${c[0]},${c[1]},${c[2]})`); }
        airPump.style.display = airLine.style.display = bubbles ? '' : 'none';
      },
      setFan(s) { st.fan = s; applyFan(); },
      setMedium(m) {
        const hy = m === 'hydro'; st.hydro = hy; media.setAttribute('fill', hy ? '#c9734a' : '#7a4f2e');
        /* v37 [B7]: hydro draws the tub (and drops the side bucket, the tub is the tank); every other medium keeps the pot */
        tubG.style.display = hy ? '' : 'none';
        [potShape, potGlint, media, potLabel, potShadow].forEach(n => { n.style.display = hy ? 'none' : ''; });
        res.style.display = feedLine.style.display = hy ? 'none' : '';
      },
      // setPlant(p, { stage: true }) also plays the one-shot glow ring under the pot (ui.js adds the leaf burst)
      setPlant(p, o) {
        finishFade();
        const old = plantG.querySelector('.plant'), nu = Art.plant(plantG, p);
        st.sway = nu.querySelector('.sway');
        st.lf = nu._lf || []; st.anchors = nu._anchors || []; st.milNode = nu._mil || null; st.seed = p.seed || 7;
        st.worst = st.anchors.reduce((b, q) => (!b || (q[2] || 0) < (b[2] || 0) ? q : b), null);
        if (!st.wiltLive) st.wiltTgt = clamp01(p.wilt);
        crawl.forEach(c => { c.re = c.on; });
        plantG.appendChild(critG); // keep the critters above the (new) plant
        if (!reduced()) applyLeaves(st.t);
        if (o && o.stage) stageGlow();
        if (!old) return;
        if (reduced() || !canAnim(nu)) { old.remove(); return; }
        try {
          nu.style.opacity = 0;
          const ease = { duration: FADE_MS, easing: 'ease-out', fill: 'both' };
          const aNew = nu.animate([{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'scale(1)' }], ease);
          const aOld = old.animate([{ opacity: 1 }, { opacity: 0 }], ease);
          fade = { old, nu, anims: [aNew, aOld] };
          aNew.onfinish = () => { if (fade && fade.nu === nu) { nu.style.opacity = ''; finishFade(); } };
        } catch (e) { old.remove(); nu.style.opacity = ''; fade = null; }
      },
      burst(kind, x, y) { // particle fx: 'sparkle' | 'drop' | 'leaf' | 'alert' (one red ring at the pot, 900 ms; nothing under reduced motion)
        if (kind === 'alert') {
          if (reduced() || st.parts.filter(q => q.ring).length >= 2) return;
          const n = el('ellipse', { cx: 0, cy: 0, rx: 40, ry: 11, fill: 'none', stroke: '#e2362b', 'stroke-width': 3.5, 'pointer-events': 'none', opacity: 0.9, transform: `translate(${x} ${y}) scale(0.35)` }, fx);
          st.parts.push({ n, ring: true, x, y, life: 1 });
          return;
        }
        for (let i = 0; i < (kind === 'sparkle' ? 10 : 6); i++) {
          const n = kind === 'drop' ? el('path', { d: 'M0 -5 Q4 1 0 4 Q-4 1 0 -5 Z', fill: '#6fc3e8', stroke: OUT, 'stroke-width': 1 }, fx)
            : el('path', { d: 'M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z', fill: kind === 'leaf' ? '#6ec846' : '#ffe27a' }, fx);
          st.parts.push({ n, x, y, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2.5, life: 1 });
        }
      },
      update(t, dt) {
        st.ang += dt * 0.6 * st.fan; blades.setAttribute('transform', `rotate(${st.ang})`);
        st.t = t;
        const rm = reduced();
        if (!rm) {
          const d = st.wiltTgt - st.wiltCur; st.wiltCur = Math.abs(d) > 0.002 ? st.wiltCur + d * (1 - Math.exp(-dt / 500)) : st.wiltTgt; // ease into the droop (~1.5 s)
          st.heatK += ((st.shim ? 1 : 0) - st.heatK) * (1 - Math.exp(-dt / 400));
        }
        const swK = 1 - (2 / 3) * Math.min(1, st.wiltCur / 0.5), swA = `rotate(${Math.sin(t / 900) * (0.6 + st.fan * 0.9) * swK}deg)`;
        const sw = st.sway; if (sw) { sw.style.transformBox = 'view-box'; sw.style.transform = swA; }
        critG.style.transformBox = 'view-box'; critG.style.transform = swA;
        if (!rm || st.lfOn) { applyLeaves(t, rm); st.lfOn = !rm; }
        crawlStep(t, rm); mildewStep(t, rm);
        if (st.bubbles && Math.random() < 0.25 && st.resTop !== undefined && st.resTop < 80) {
          const b = el('circle', { cx: 10 + Math.random() * 72, cy: 86, r: 1.5 + Math.random() * 2.5, fill: '#e8f8ff', opacity: 0.8 }, bubbleG);
          st.parts.push({ n: b, bubble: true, y: 86, top: st.resTop + 3, life: 1 });
        }
        if (st.hydro && st.bubbles && Math.random() < 0.3 && st.tubTop !== undefined && st.tubTop < 40) {
          const b = el('circle', { cx: -44 + Math.random() * 88, cy: 42, r: 1 + Math.random() * 1.8, fill: '#e8f8ff', opacity: 0.8 }, tubBub);
          st.parts.push({ n: b, bubble: true, y: 42, top: st.tubTop + 2, life: 1 });
        }
        if (st.rain > 0 && !reduced()) rainP.forEach((p, i) => p.setAttribute('stroke-dashoffset', (-(t / 18) * (1 + (i % 3) * 0.3)).toFixed(1)));
        if (!reduced()) {
          if (st.airOn) airP.forEach((p, i) => p.setAttribute('stroke-dashoffset', (-(t / 60) * (0.5 + st.fan) - i * 5).toFixed(1)));
          if (st.shim) shimP.forEach((p, i) => p.setAttribute('d', shimD(shimY[i], t / 400 + i)));
          if (st.hum === 'humidify' && st.parts.length < 40 && Math.random() < 0.22) {
            const m = el('circle', { cx: 0, cy: 0, r: 3, fill: '#eaf6ff' }, fx);
            st.parts.push({ n: m, mist: true, x: 163 + (Math.random() - 0.5) * 8, y: H - 64, vx: 0.15 + Math.random() * 0.2, life: 1 });
          }
        }
        if (st.hum === 'dehumidify') unitLed.setAttribute('opacity', (Math.sin(t / 700) > 0 || reduced()) ? 1 : 0.2);
        st.parts = st.parts.filter(q => {
          if (q.mist) { q.life -= dt * 0.0006; q.y -= dt * 0.03; q.x += q.vx * dt * 0.02; q.n.setAttribute('transform', `translate(${q.x} ${q.y})`); q.n.setAttribute('r', 3 + (1 - q.life) * 9); q.n.setAttribute('opacity', Math.max(0, q.life * 0.5)); if (q.life <= 0 || st.hum !== 'humidify') { q.n.remove(); return false; } return true; }
          if (q.ring) { q.life -= dt / 900; if (q.life <= 0) { q.n.remove(); return false; } q.n.setAttribute('transform', `translate(${q.x} ${q.y}) scale(${(0.35 + 1.35 * (1 - q.life * q.life)).toFixed(3)})`); q.n.setAttribute('opacity', (0.9 * q.life).toFixed(3)); return true; }
          if (q.bubble) { q.y -= dt * 0.04; q.n.setAttribute('cy', q.y); if (q.y < q.top) { q.n.remove(); return false; } return true; }
          q.life -= dt * 0.0012; q.x += q.vx; q.y += q.vy; q.vy += 0.08;
          q.n.setAttribute('transform', `translate(${q.x} ${q.y})`); q.n.setAttribute('opacity', Math.max(0, q.life));
          if (q.life <= 0) { q.n.remove(); return false; } return true;
        });
      }
    };
  }

  /* ---------------- ICONS for gear / actions ---------------- */
  /* v44 [M-m3] one icon set: 24px, light 1.8 line on the dark action bar, one green accent stroke per icon */ /* v44 */
  const ICONS = {
    mix: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M9 3h6M10 3v5L5 18a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-10V3"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M7 15h10"/></g>',
    ph: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M9 3h6M10 3v9a3 3 0 1 0 4 0V3"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 11v3"/></g>',
    topup: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 3C8 9 6 12 6 15a6 6 0 0 0 12 0c0-3-2-6-6-12z"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 11v6M9 14h6"/></g>',
    lights: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M3 5h18v4H3z"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M6 12l-2 7M12 12v8M18 12l2 7"/></g>',
    prune: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M8.5 14.5L18 4M15.5 14.5L6 4"/></g>',
    spray: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M7 10h9v11H7zM9 10V6h6"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M18 5l3-1M18 8l3 1M18 2l2-1"/></g>',
    change: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M5 12a7 7 0 0 1 12-5M19 12a7 7 0 0 1-12 5"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M17 3v4h-4M7 21v-4h4"/></g>',
    harvest: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M4 10h16l-2 10H6z"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><circle cx="9" cy="7" r="2.5"/><circle cx="15" cy="7" r="2.5"/></g>',
    fan: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><circle cx="12" cy="12" r="9"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 12Q16 6 19 9 16 12 12 12ZM12 12Q8 18 5 15 8 12 12 12Z"/></g>',
    humid: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M8 4q5 7 5 10a5 5 0 0 1-10 0q0-3 5-10z"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M17 10q3 3 3 5a3 3 0 0 1-6 0"/></g>',
    ask: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M4 5h16v11H10l-5 4v-4H4z"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M10 8.5a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.6M12 13.8v.1"/></g>',
    water: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M4 9h11l-1.5 11h-8z"/><path d="M15 11h3l3-4"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M20 12v2M22 11v2"/></g>',
    feed: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M9 3h6M10 3v5L5 18a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-10V3"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 12v6M9 15h6"/></g>',
    drip: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M3 5h18"/><path d="M3 20h18"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M7 8q3 4 0 6-3-2 0-6zM17 8q3 4 0 6-3-2 0-6z"/></g>',
    shade: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M3 11Q12 2 21 11z"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 11v9M7 20h10"/></g>',
    plant: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M6 20h12"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 20v-9M12 12Q5 12 5 5q7 0 7 7zM12 14q7 0 7-6-7 0-7 6z"/></g>',
    shop: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M5 8h14l-1.5 12h-11z"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M9 8a3 3 0 0 1 6 0"/></g>',
    cover: '<g stroke="#e9efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M3 21l1.5-9Q12 2 19.5 12L21 21zM8 21q1-5 4-5t4 5"/></g><g stroke="#6ec846" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 21v-6"/></g>'
  };
  const icon = (name, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* leaf-bundle icon for the leafy crops (lettuce: broad pale leaves, basil: pointed glossy ovals) */
  function leafBundle(g, crop, ripe = 1) {
    const base = crop === 'basil' ? mix('3f9a34', '2f7a2a', 0.2) : '7cc24a', ang = crop === 'basil' ? [-52, -18, 18, 52] : [-58, -28, 0, 28, 58];
    ang.forEach((a, i) => {
      const L = (crop === 'basil' ? 26 : 25) - Math.abs(a) * 0.12, W = L * (crop === 'basil' ? 0.4 : 0.62), col = crop === 'basil' ? mix(base, '8fd05a', i % 2 ? 0.1 : 0.4) : mix(base, 'e6f5a6', Math.abs(a) < 30 ? 0.55 : i % 2 ? 0.15 : 0.3);
      const lg = el('g', { transform: `translate(0 30) rotate(${a})` }, g);
      el('path', { d: crop === 'basil' ? `M0 0 C${-W} ${-L * 0.15} ${-W * 1.1} ${-L * 0.6} 0 ${-L} C${W * 1.1} ${-L * 0.6} ${W} ${-L * 0.15} 0 0 Z` : `M0 0 C${-W * 0.5} ${-L * 0.1} ${-W * 1.05} ${-L * 0.45} ${-W * 0.85} ${-L * 0.76} Q${-W * 0.5} ${-L * 1.02} 0 ${-L * 0.98} Q${W * 0.5} ${-L * 1.02} ${W * 0.85} ${-L * 0.76} C${W * 1.05} ${-L * 0.45} ${W * 0.5} ${-L * 0.1} 0 0 Z`, fill: col, stroke: OUT, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, lg);
      el('path', { d: `M0 ${-L * 0.05} L0 ${-L * 0.75}`, stroke: mix(col, 'ffffff', 0.4), 'stroke-width': 1.2, 'stroke-linecap': 'round' }, lg);
    });
    el('path', { d: 'M-3 32 L0 24 L3 32 Z', fill: '#d9d0a2', stroke: OUT, 'stroke-width': 1.2 }, g);
  }
  /* small standalone fruit icon (same drawing as on the plant) for fly-to-counter effects */
  function fruitIcon(crop, size = 28, ripe = 1) {
    const svg = el('svg', { viewBox: '-20 -10 40 46', width: size, height: size * 1.15, 'aria-hidden': 'true' });
    const g = el('g', {}, svg);
    if (crop === 'chilli') chilliFruit(g, 0, -4, 0.7, ripe); else if (crop === 'strawberry') strawberryFruit(g, 0, 0, 0.8, ripe);
    else if (crop === 'capsicum') capsicumFruit(g, 0, -2, 0.55, ripe);
    else if (crop === 'cucumber') cucumberFruit(g, -11, -6, 0.3, Math.max(0.6, ripe), -38);
    else if (crop === 'lettuce' || crop === 'basil') leafBundle(g, crop, ripe);
    else tomatoFruit(g, 0, 0, 0.7, ripe);
    return svg;
  }
  /* v48 [M-m3] one line crop icon per crop: same 24 grid, 1.8 light line and one green accent as the v44 action icons. size 24 or 40 (any size works, it is vector). decor=true hides it from screen readers when the crop name sits right beside it */ /* v48 */
  const CROP_NAMES = { tomato: 'Tomato', chilli: 'Chilli', strawberry: 'Strawberry', capsicum: 'Capsicum', cucumber: 'Cucumber', lettuce: 'Lettuce', basil: 'Basil' }; /* v48 */
  const CROP_ICONS = { /* v48 */
    tomato: ['<path d="M12 8.5c-4.5 0-7 2.6-7 6.1S8 21 12 21s7-2.9 7-6.4-2.5-6.1-7-6.1zM8.2 14.5c.2-1.4.9-2.4 2-3"/>', '<path d="M12 8.5V5M8.2 7.6l3.8 1.4 3.8-1.4M9 10.2l3-1.2 3 1.2"/>'],
    chilli: ['<path d="M7 8.5c5-1 11 1.5 11 7.5 0 2.5-1 4-2.5 4.5C14 18 11 17 9 15 7 13 6 10.5 7 8.5z"/>', '<path d="M7 8.5C6 7 6.5 5.5 8 4.5M7 8.5l2.5-1"/>'],
    strawberry: ['<path d="M12 21.5C7.5 18 5.5 14.5 6 11.5c.4-2.4 3-3.5 6-3.5s5.6 1.1 6 3.5c.5 3-1.5 6.5-6 10z"/>', '<path d="M8 8.4L12 6.5l4 1.9M12 6.5V3.5M12 12v.01M9.5 14v.01M14.5 14v.01"/>'],
    capsicum: ['<path d="M7.5 9.5C5 12 5.5 18.5 9.5 20.4c1.5.7 3.5.7 5 0 4-1.9 4.5-8.4 2-10.9-1.3-1.3-3-1-4.5-1s-3.2-.3-4.5 1z"/>', '<path d="M12 8.5V4.5M9.5 5.5l2.5-1 2.5 1"/>'],
    cucumber: ['<rect x="2.5" y="9" width="19" height="6" rx="3" transform="rotate(-35 12 12)"/>', '<path d="M10.5 12.5v.01M13 11v.01M8.5 14.4v.01M15.2 9.2v.01M18.5 5.5l1.2-1.6"/>'],
    lettuce: ['<path d="M12 20.5c-4.8 0-8-2.8-8-7.3 3-1.2 6 0 8 2.6 2-2.6 5-3.8 8-2.6 0 4.5-3.2 7.3-8 7.300z"/>', '<path d="M12 20.5V9.5M12 9.5C9 9 8 6.5 8.5 4.5c3 0 4.5 1.8 3.5 5zM12 9.5C15 9 16 6.5 15.5 4.5c-3 0-4.5 1.8-3.5 5z"/>'],
    basil: ['<path d="M12 14C6.5 14 4.5 10.5 4.5 6.5 9.5 6.5 12 9.5 12 14zM12 14c5.5 0 7.5-3.5 7.5-7.5-5 0-7.5 3-7.5 7.5z"/>', '<path d="M12 21v-7M12 17.5c-2-.2-3.5-1-4.5-2.500M12 17.5c2-.2 3.5-1 4.5-2.500"/>']
  };
  function cropIcon(crop, size = 24, decor = false, ink) { /* v48 ink: [line, accent] colours for light backgrounds */
    const k = CROP_ICONS[crop] ? crop : 'tomato', a = { viewBox: '0 0 24 24', width: size, height: size };
    if (decor) a['aria-hidden'] = 'true'; else { a.role = 'img'; a['aria-label'] = CROP_NAMES[k]; }
    const svg = el('svg', a), st = { fill: 'none', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const g1 = el('g', Object.assign({ stroke: ink ? ink[0] : '#e9efe6' }, st), svg), g2 = el('g', Object.assign({ stroke: ink ? ink[1] : '#6ec846' }, st), svg);
    g1.innerHTML = CROP_ICONS[k][0]; g2.innerHTML = CROP_ICONS[k][1];
    return svg;
  }
  /* round badge sticker, cut-out style. kind picks the glyph, earned toggles colour vs locked grey */
  function badge(kind, earned, size = 64) {
    const G = {
      water: '<path d="M0 -15 Q11 0 11 6 A11 11 0 0 1 -11 6 Q-11 0 0 -15Z" fill="#6fc3e8"/><path d="M-4 4 Q-4 9 1 10" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
      refill: '<path d="M-7 -14h14v6l4 4v16a3 3 0 0 1-3 3h-16a3 3 0 0 1-3-3v-16l4-4z" fill="#f6f3ea"/><path d="M-5 4a6 6 0 0 1 10 -2M5 10a6 6 0 0 1-10 2" fill="none" stroke="#6ec846" stroke-width="2.5" stroke-linecap="round"/>',
      thumb: '<path d="M0 12 V-2" stroke="#2a1d14" stroke-width="3" stroke-linecap="round"/><path d="M0 0 Q-14 -2 -14 -14 Q0 -14 0 0Z M0 4 Q14 2 14 -10 Q0 -10 0 4Z" fill="#6ec846"/>',
      crop: '<ellipse cx="0" cy="3" rx="12" ry="10.5" fill="#e2362b"/><path d="M-6 -7 L0 -3 L6 -7 L2 -11 L-2 -11Z" fill="#3f9b3a"/>',
      meter: '<rect x="-6" y="-15" width="12" height="30" rx="4" fill="#f6f3ea"/><rect x="-3" y="-11" width="6" height="9" rx="1" fill="#6ec846"/><circle cx="0" cy="8" r="2.5" fill="#ec8024"/>',
      root: '<path d="M0 -12 V0 M0 -2 Q-6 4 -10 12 M0 -2 Q0 6 0 13 M0 -2 Q6 4 10 12" fill="none" stroke="#f6f3ea" stroke-width="3.2" stroke-linecap="round"/><path d="M-11 -12 H11" stroke="#2a1d14" stroke-width="3" stroke-linecap="round"/>',
      firstgrow: '<path d="M-10 -14 V15" stroke="#2a1d14" stroke-width="3" stroke-linecap="round"/><path d="M-10 -13 H12 L7 -6 L12 1 H-10Z" fill="#f6f3ea"/>'
    };
    const col = earned ? ({ water: '#3a9bd0', refill: '#6ec846', thumb: '#f2b950', crop: '#ec8024', meter: '#6ec846', root: '#ec8024', firstgrow: '#f2b950' }[kind] || '#6ec846') : '#4a4f4a';
    return `<svg viewBox="-32 -32 64 64" width="${size}" height="${size}" aria-hidden="true" ${earned ? '' : 'style="opacity:.55"'}>
      <circle r="29" fill="${col}" stroke="${OUT}" stroke-width="3.5"/>
      <circle r="23" fill="none" stroke="${earned ? '#ffffff88' : '#ffffff22'}" stroke-width="2" stroke-dasharray="3 4"/>
      <g stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round">${G[kind] || ''}</g>
      ${earned ? '' : '<g transform="translate(15 17)"><rect x="-6" y="-2" width="12" height="9" rx="2" fill="#2a1d14"/><path d="M-3.5 -2 V-5 a3.5 3.5 0 0 1 7 0 V-2" fill="none" stroke="#2a1d14" stroke-width="2"/></g>'}
    </svg>`;
  }

  /* ---------------- v36 design pass: grow-method props (Art.tower / Art.pots / Art.bed / Art.clearProp) ----------------
     Each draws one <g class="prop"> into the tent scene svg (400x520), hides the tent's own pot (and, for the tower, the single plant) and returns the group.
     Art.clearProp(svg) puts the tent back. The real plant (setPlant) keeps standing in the middle pot / the middle of the bed. */
  const holders = svg => ({ plant: svg.querySelector('.plantholder'), pot: svg.querySelector('.potholder') });
  function propReset(svg) {
    svg.querySelectorAll('.prop').forEach(n => n.remove());
    const h = holders(svg); if (h.plant) h.plant.style.display = ''; if (h.pot) h.pot.style.display = '';
    const rs = svg.querySelector('.resholder'); if (rs && rs.getAttribute('data-home')) rs.setAttribute('transform', rs.getAttribute('data-home')); /* v37 */
  }
  function propGroup(svg, plantToo) {
    propReset(svg);
    const h = holders(svg); if (h.pot) h.pot.style.display = 'none'; if (plantToo && h.plant) h.plant.style.display = 'none';
    const g = el('g', { class: 'prop' }, svg);
    if (h.plant) svg.insertBefore(g, h.plant); /* behind the real plant */
    return g;
  }
  /* a vertical hydro tower: N slot cups stepping down a column. drawPlant(slotG, info, i) is called for every planted slot; slotG sits at the cup mouth (0,0 = base of that small plant) */
  function tower(svg, slots, drawPlant) {
    const list = Array.isArray(slots) ? slots : [], n = Math.max(1, list.length || 8), g = propGroup(svg, true);
    const W = 400, cx = W / 2 + 30, top = 120, bot = 392, step = (bot - top) / n;
    el('ellipse', { cx: cx + 10, cy: bot + 46, rx: 78, ry: 10, fill: 'url(#propshadow)', 'pointer-events': 'none' }, g); /* v37: soft shadow, light from the upper left */
    el('rect', { x: cx - 30, y: top - 18, width: 60, height: bot - top + 40, rx: 14, fill: '#e8ecee', stroke: OUT, 'stroke-width': SW }, g);
    el('rect', { x: cx - 22, y: top - 8, width: 14, height: bot - top + 20, rx: 6, fill: '#ffffff', opacity: 0.45 }, g);
    el('rect', { x: cx - 52, y: bot + 20, width: 104, height: 24, rx: 8, fill: '#26292c', stroke: OUT, 'stroke-width': SW }, g);
    el('text', { x: cx, y: bot + 37, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 900, fill: '#6ec846', 'font-family': 'system-ui, sans-serif', 'letter-spacing': 1 }, g).textContent = 'HYGROW';
    for (let i = 0; i < n; i++) {
      const info = list[i] || { planted: false }, side = i % 2 ? 1 : -1, y = top + step * (i + 0.7), x = cx + side * 30;
      const slot = el('g', { class: 'slot' + (info.planted ? ' planted' : ''), 'data-slot': i, transform: `translate(${n1(x)} ${n1(y)})` }, g);
      el('path', { d: `M${side * -2} 0 L${side * 20} -6 L${side * 20} 8 L${side * -2} 12 Z`, fill: '#26292c', stroke: OUT, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, slot);
      el('ellipse', { cx: side * 10, cy: -2, rx: 9, ry: 3.2, fill: '#6b5638', stroke: OUT, 'stroke-width': 1.4 }, slot);
      el('rect', { x: side > 0 ? -2 : -22, y: -14, width: 24, height: 30, fill: '#fff', opacity: 0.001, 'pointer-events': 'all' }, slot); /* a fat tap target */
      if (info.planted && typeof drawPlant === 'function') {
        const pg = el('g', { class: 'slotplant', transform: `translate(${n1(side * 10)} -2) scale(0.2)` }, slot);
        try { drawPlant(pg, info, i); } catch (e) { /* a bad plant must not lose the tower */ }
      }
    }
    return g;
  }
  /* n pots in a row on veranda boards; the middle one stands where the real plant is */
  function pots(svg, n) {
    n = Math.max(1, Math.min(5, n || 3)); const g = propGroup(svg, false), W = 400, mid = W / 2 + 30, H = 520;
    const rs = svg.querySelector('.resholder'); if (rs) rs.setAttribute('transform', `translate(8 ${H - 150})`); /* v37: the feed tank steps left so the first pot does not sit on it */
    /* v37: the plank slab and its lines are gone (they read as a grey box on the plate); each pot gets its own soft shadow */
    const xs = []; for (let i = 0; i < n; i++) xs.push(mid + (i - (n - 1) / 2) * 98);
    xs.forEach(x => {
      const real = Math.abs(x - mid) < 1, w = real ? 46 : 32, ph = real ? 46 : 34;
      const p = el('g', { class: 'pot' + (real ? ' main' : ''), transform: `translate(${n1(x)} ${H - 112 + (real ? 0 : 10)})` }, g);
      el('ellipse', { cx: 6, cy: ph + 3, rx: w + 14, ry: 8, fill: 'url(#propshadow)', 'pointer-events': 'none' }, p); /* v37 */
      el('path', { d: `M${-w} 0 L${w} 0 L${w - 8} ${ph} L${-w + 8} ${ph} Z`, fill: '#c0643c', stroke: OUT, 'stroke-width': SW, 'stroke-linejoin': 'round' }, p);
      el('path', { d: `M${-w + 5} 5 L${-w + 10} 5 L${-w + 14} ${ph - 5} L${-w + 11} ${ph - 5} Z`, fill: '#ffffff', opacity: 0.2, 'pointer-events': 'none' }, p);
      el('ellipse', { cx: 0, cy: 1, rx: w - 2, ry: 6, fill: '#5a3a20', stroke: OUT, 'stroke-width': 2 }, p);
      if (!real) el('path', { d: 'M0 0 Q-8 -12 -14 -10 M0 0 Q2 -16 0 -22 M0 0 Q9 -12 15 -9', fill: 'none', stroke: '#4fa23a', 'stroke-width': 3, 'stroke-linecap': 'round' }, p);
    });
    return g;
  }
  /* a raised timber bed with n rows of soil; the real plant stands in the middle */
  function bed(svg, n) {
    n = Math.max(1, Math.min(4, n || 3)); const g = propGroup(svg, false), W = 400, H = 520, y0 = H - 118;
    el('ellipse', { cx: W / 2 + 12, cy: H - 46, rx: 196, ry: 11, fill: 'url(#propshadow)', 'pointer-events': 'none' }, g); /* v37 */
    el('path', { d: `M30 ${y0} L${W - 30} ${y0} L${W - 44} ${H - 48} L44 ${H - 48} Z`, fill: '#8a5a34', stroke: OUT, 'stroke-width': SW, 'stroke-linejoin': 'round' }, g);
    el('path', { d: `M34 ${y0 - 2} L${W - 34} ${y0 - 2} L${W - 36} ${y0 + 8} L36 ${y0 + 8} Z`, fill: '#4b3220', stroke: OUT, 'stroke-width': 2 }, g);
    for (let i = 1; i < 4; i++) el('line', { x1: 40 + i * 6, y1: y0 + 10 + i * 12, x2: W - 40 - i * 6, y2: y0 + 10 + i * 12, stroke: OUT, 'stroke-width': 1.6, opacity: 0.55 }, g);
    for (let r = 0; r < n; r++) {
      const y = y0 + 2 + r * 4, x1 = 60 + r * 4, x2 = W - 60 - r * 4;
      el('path', { d: `M${x1} ${y} L${x2} ${y}`, stroke: '#2f1f12', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.8 }, g);
      for (let k = 0; k < 6; k++) { const x = x1 + (x2 - x1) * (k + 0.5) / 6; if (Math.abs(x - (W / 2 + 30)) > 26) el('path', { d: `M${n1(x)} ${y} q-4 -9 -9 -8 M${n1(x)} ${y} q1 -12 0 -16 M${n1(x)} ${y} q5 -9 9 -7`, fill: 'none', stroke: '#4fa23a', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g); }
    }
    return g;
  }

  window.Art = { tower, pots, bed, clearProp: propReset, el, quinn, plant, scene, icon, mix, fruitIcon, cropIcon, badge, wiltAngle, pestCount, setPlantSprites };
})();
