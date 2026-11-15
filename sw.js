/* HyGrow Grow Sim service worker: offline app shell.
   index.html / navigations: network-first (fall back to cache offline).
   Everything else same-origin (js, axel/*, art/*, icons): cache-first, refreshed in the background for next load.
   Bump CACHE when the shell list changes. */
const CACHE = 'hygrow-growsim-v66'; /* v37 M26, v46, voice sprites, v48 strict install, v49 painted tomato, v50 all crops, v51 rig v7, v52 almanac links, v53 round 7 + play-test 11 fixes, v54 overlays on leaves + rig v8, v55 overlays in the painting, v56 play-test 12 fixes, v57 rig v9 + phone story + steady board + timer copy, v58 round 9 + play-test 13 fixes and voice, v59 capped phone card + calmer tent, v60 round 10 + play-test 14 fixes, v61 round 11 meter check, v62 propagator lift to the band floor, v63 dome damp + round 12 fixes, v64 round 13 fixes, v65 play-test 17 keyboard and outdoor fixes, v66 round 15 + keyboard pass 18 fixes, v67 round 16 fixes, v68 round 16 minors and chapter balance, v69 round 17 minors, v70 speed buttons + default light + chapter finish, v71 round 18 fixes, v72 round 19 fixes, v73 v72 review fixes, v74 v73 review fixes, v75 v74 review fixes, v76 tower Pick glow */
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'audio.js', 'engine.js', 'campaign.js', 'story.js', 'art.js', 'scene.js', 'campaign-scenes.js', 'axel.js', 'csv.js', 'live.js', 'products.js', 'cart.js', 'daily.js', 'almanac.js', 'growers.js', 'shop.js', 'rig.js', 'goals.js', 'version.js', 'away.js', 'fx.js', 'beginner.js', 'cards.js', 'sharecard.js', 'challenge.js', 'events.js', 'gifts.js', 'a11y.js', 'voice.js', 'voice/manifest.json', 'voice/mouth.json', 'voice/sprites.json' /* v37 */, 'ui.js',
  'axel/idle_v2.webp', 'axel/point_v2.webp', 'axel/talk_v2.webp', 'axel/thumbs_v2.webp', 'axel/wave_v2.webp', 'axel/worried_v2.webp',
  'art/scenes.json', 'art/shopfront_title/back.webp', 'art/shopfront_title/mid.webp', 'art/shopfront_title/front.webp', 'art/shopfront_title_dusk/back.webp', 'art/shopfront_title_dusk/mid.webp', 'art/shopfront_title_dusk/front.webp', 'art/shopfront_title_night/back.webp', 'art/shopfront_title_night/mid.webp', 'art/shopfront_title_night/front.webp', 'art/shopfront_day/back.webp', 'art/shopfront_day/mid.webp', 'art/shopfront_day/front.webp', 'art/shopfront_dusk/back.webp', 'art/shopfront_dusk/mid.webp', 'art/shopfront_dusk/front.webp', 'art/counter/back.webp', 'art/counter/mid.webp', 'art/counter/front.webp', 'art/aisle/back.webp', 'art/aisle/mid.webp', 'art/aisle/front.webp', 'art/bench/back.webp', 'art/bench/mid.webp', 'art/bench/front.webp', 'art/lights/back.webp', 'art/lights/mid.webp', 'art/lights/front.webp', 'art/growroom/back.webp', 'art/growroom/mid.webp', 'art/growroom/front.webp', 'art/tent_interior/back.webp', 'art/tent_interior/mid.webp', 'art/tent_interior/front.webp', 'art/market/back.webp', 'art/market/mid.webp', 'art/market/front.webp', 'art/openday/back.webp', 'art/openday/mid.webp', 'art/openday/front.webp', 'art/axel_frame/back.webp', 'art/axel_frame/mid.webp', 'art/axel_frame/front.webp', 'art/shop_christmas/back.webp', 'art/shop_christmas/mid.webp', 'art/shop_christmas/front.webp', 'art/royal_show/back.webp', 'art/royal_show/mid.webp', 'art/royal_show/front.webp', 'art/heatwave_backyard/back.webp', 'art/heatwave_backyard/mid.webp', 'art/heatwave_backyard/front.webp', 'art/tank_corner/back.webp', 'art/tank_corner/mid.webp', 'art/tank_corner/front.webp',
  'art/shopfront_night/back.webp', 'art/shopfront_night/mid.webp', 'art/shopfront_night/front.webp', 'art/growroom_night/back.webp', 'art/growroom_night/mid.webp', 'art/growroom_night/front.webp', 'art/tent_interior_night/back.webp', 'art/tent_interior_night/mid.webp', 'art/tent_interior_night/front.webp', 'art/counter_night/back.webp', 'art/counter_night/mid.webp', 'art/counter_night/front.webp',
  'art/growroom_dusk/back.webp', 'art/growroom_dusk/mid.webp', 'art/growroom_dusk/front.webp', 'art/tent_interior_dusk/back.webp', 'art/tent_interior_dusk/mid.webp', 'art/tent_interior_dusk/front.webp', 'art/counter_dusk/back.webp', 'art/counter_dusk/mid.webp', 'art/counter_dusk/front.webp',
  'art/counter_b/back.webp', 'art/counter_b/mid.webp', 'art/counter_b/front.webp', 'art/aisle_b/back.webp', 'art/aisle_b/mid.webp', 'art/aisle_b/front.webp', 'art/openday_b/back.webp', 'art/openday_b/mid.webp', 'art/openday_b/front.webp', 'art/market_b/back.webp', 'art/market_b/mid.webp', 'art/market_b/front.webp',
  'art/portraits/deb_neutral.webp', 'art/portraits/deb_happy.webp', 'art/portraits/deb_worried.webp', 'art/portraits/deb_laugh.webp', 'art/portraits/deb_surprised.webp', 'art/portraits/rob_neutral.webp', 'art/portraits/rob_happy.webp', 'art/portraits/rob_worried.webp', 'art/portraits/rob_laugh.webp', 'art/portraits/rob_surprised.webp', 'art/portraits/kez_neutral.webp', 'art/portraits/kez_happy.webp', 'art/portraits/kez_worried.webp', 'art/portraits/kez_laugh.webp', 'art/portraits/kez_surprised.webp', 'art/axel/axel_laugh_v5.webp', 'art/axel/axel_shrug_v5.webp', 'art/axel/axel_sleepy_v5.webp', 'art/axel/axel_celebrate_v5.webp',
  'art/axel/anim/loops.json', 'art/axel/anim/idle_1_v1.webp', 'art/axel/anim/idle_2_v1.webp', 'art/axel/anim/idle_3_v1.webp', 'art/axel/anim/idle_4_v1.webp', 'art/axel/anim/talk_1_v1.webp', 'art/axel/anim/talk_2_v1.webp', 'art/axel/anim/celebrate_1_v2.webp', 'art/axel/anim/celebrate_2_v2.webp', 'art/axel/anim/celebrate_3_v2.webp', 'art/axel/anim/worried_1_v1.webp', 'art/axel/anim/worried_2_v1.webp', 'art/axel/anim/blink_1_v1.webp', 'art/portraits/deb_talk_v1.webp', 'art/portraits/deb_blink_v1.webp', 'art/portraits/rob_talk_v1.webp', 'art/portraits/rob_blink_v1.webp', 'art/portraits/kez_talk_v1.webp', 'art/portraits/kez_blink_v1.webp', 'art/portraits/deb_half_v2.webp', 'art/portraits/rob_half_v2.webp', 'art/portraits/kez_half_v2.webp',
  // v36: layered character rig, method backdrops and setup thumbnails
  'art/axel/rig/axel_arm_r_v9.webp', 'art/axel/rig/axel_body_v9.webp', 'art/axel/rig/axel_eye_l_v9.webp', 'art/axel/rig/axel_eye_r_v9.webp', 'art/axel/rig/axel_gill_l_v9.webp', 'art/axel/rig/axel_gill_r_v9.webp', 'art/axel/rig/axel_hand_point_v9.webp', 'art/axel/rig/axel_hand_rest_v9.webp', 'art/axel/rig/axel_hand_thumb_v9.webp', 'art/axel/rig/axel_head_v9.webp', 'art/axel/rig/axel_lid_v9.webp', 'art/axel/rig/axel_mouth_closed_v9.webp', 'art/axel/rig/axel_mouth_half_v9.webp', 'art/axel/rig/axel_mouth_open_v9.webp', 'art/axel/rig/axel_mouth_wide_v9.webp', 'art/axel/rig/axel_pupil_l_v9.webp', 'art/axel/rig/axel_pupil_r_v9.webp', 'art/axel/rig/rig.json', 'art/portraits/rig/deb.json', 'art/portraits/rig/deb_base_v5.webp', 'art/portraits/rig/deb_brow_l_v5.webp', 'art/portraits/rig/deb_brow_r_v5.webp', 'art/portraits/rig/deb_mouth_closed_v5.webp', 'art/portraits/rig/deb_mouth_half_v5.webp', 'art/portraits/rig/deb_mouth_open_v5.webp', 'art/portraits/rig/deb_mouth_wide_v5.webp', 'art/portraits/rig/kez.json', 'art/portraits/rig/kez_base_v5.webp', 'art/portraits/rig/kez_brow_l_v5.webp', 'art/portraits/rig/kez_lid_v5.webp', 'art/portraits/rig/kez_mouth_closed_v5.webp', 'art/portraits/rig/kez_mouth_half_v5.webp', 'art/portraits/rig/kez_mouth_open_v5.webp', 'art/portraits/rig/kez_mouth_wide_v5.webp', 'art/portraits/rig/kez_pupil_l_v5.webp', 'art/portraits/rig/kez_pupil_r_v5.webp', 'art/portraits/rig/rob.json', 'art/portraits/rig/rob_base_v5.webp', 'art/portraits/rig/rob_lid_v5.webp', 'art/portraits/rig/rob_mouth_closed_v5.webp', 'art/portraits/rig/rob_mouth_half_v5.webp', 'art/portraits/rig/rob_mouth_open_v5.webp', 'art/portraits/rig/rob_mouth_wide_v5.webp', 'art/portraits/rig/rob_pupil_l_v5.webp', 'art/veranda/back.webp', 'art/veranda/mid.webp', 'art/veranda/front.webp', 'art/veranda_dusk/back.webp', 'art/veranda_dusk/mid.webp', 'art/veranda_dusk/front.webp', 'art/veranda_night/back.webp', 'art/veranda_night/mid.webp', 'art/veranda_night/front.webp', 'art/backyard_bed/back.webp', 'art/backyard_bed/mid.webp', 'art/backyard_bed/front.webp', 'art/backyard_bed_dusk/back.webp', 'art/backyard_bed_dusk/mid.webp', 'art/backyard_bed_dusk/front.webp', 'art/backyard_bed_night/back.webp', 'art/backyard_bed_night/mid.webp', 'art/backyard_bed_night/front.webp', 'art/setup/coco.webp', 'art/setup/hydro.webp', 'art/setup/outdoors.webp', 'art/setup/soil.webp', 'art/setup/tent.webp', 'art/setup/tower.webp', 'art/setup/veranda.webp',
  'art/logo/hygrow-logo-white.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  /* v48 [#11]: strict. Any SHELL file that fails to cache fails the install, so a half-filled cache never reports ready
     (the old worker, if any, keeps serving and the next visit retries). */
  e.waitUntil(caches.open(CACHE).then(c => {
    let first = null;
    return Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(err => { if (!first) { first = u; console.warn('[sw] install failed on ' + u + ': ' + (err && err.message || err)); } throw err; })))
      .then(() => self.skipWaiting());
  }));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => { /* v38 [m6]: open windows learn that the cache changed, so ui.js can save and reload once instead of running new HTML on old JS */
    const ks = await caches.keys();
    const old = ks.filter(k => k.startsWith('hygrow-growsim-') && k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    if (old.length) for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'hg-sw-updated', cache: CACHE });
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; /* fonts, store links: leave to the network */
  if (req.headers.has('range')) return; /* voice clips: <audio> range requests go straight to the network (a cached 200 breaks Safari media) */
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isPage) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); }
      return res;
    }).catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; });
    if (hit) { net.catch(() => {}); return hit; }
    return net;
  }));
});
