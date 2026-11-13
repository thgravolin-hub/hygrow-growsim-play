/* HyGrow Grow Sim - sharecard.js : the shareable 1080x1350 "Grow Card" + Wordle-style text */
(function () {
  const W = 1080, H = 1350, SITE = 'www.hygrowhydroponics.com.au/grow-sim';
  const FACTS = {
    tomato: 'Tomatoes set the most fruit when the root zone stays warm and the nutrient feed is steady.',
    chilli: 'Chillies like it warm, and a little controlled stress can make the fruit hotter.',
    strawberry: 'Strawberries grow beautifully in hydroponics and prefer a slightly acidic root zone.',
    capsicum: 'Capsicums are slow starters, but steady warmth and even feeding make them thrive.',
    cucumber: 'Cucumbers are about 95% water, so they drink a lot and grow very fast.',
    lettuce: 'Lettuce is one of the quickest crops, often ready to pick in about 5 weeks.',
    basil: 'Basil grows back after picking, so pick from the top and it keeps giving.'
  };
  const CROPS = { tomato: 'Tomato', chilli: 'Chilli', strawberry: 'Strawberry', capsicum: 'Capsicum', cucumber: 'Cucumber', lettuce: 'Lettuce', basil: 'Basil' };
  const pal = { cream: '#f6f3ea', green: '#6ec846', orange: '#ec8024', brown: '#2a1d14', muted: '#5b6a55', yellow: '#f2b950' };

  function info(o) {
    const S = o.S || {}, sc = (window.Sim && Sim.score(S)) || {};
    let day = 0; try { const r = Sim.readings(S); day = Math.round(r.day ?? S.day ?? 0); } catch (e) { day = Math.round(S.day || 0); }
    const id = S.cropId || (o.pick && o.pick.crop) || 'tomato';
    const stars = Math.max(1, Math.min(5, Math.round((sc.overall ?? 50) / 20)));
    let chapter = '';
    try { if (o.camp && window.Campaign) { const c = Campaign.chapter(Campaign.active()); if (c && c.title) chapter = 'Chapter ' + c.id + ': ' + c.title; } } catch (e) {}
    return { id, name: CROPS[id] || id, day, kg: (sc.yieldKg ?? 0).toFixed(2), stars, health: Math.round(sc.health ?? 0), eco: Math.round(sc.eco ?? 0), overall: Math.round(sc.overall ?? 0), chapter, fact: FACTS[id] || FACTS.tomato };
  }
  function url() {
    /* hosted inside an iframe (Wix), location.href is the static host, not the public page: <meta name="hygrow:share-url"> wins when set */
    try { const m = document.querySelector('meta[name="hygrow:share-url"]'); if (m && /^https:\/\//.test(m.content || '')) return m.content.trim(); } catch (e) {}
    return (location.protocol === 'https:' && !/localhost|127\.0\.0\.1/.test(location.hostname)) ? location.href.split('#')[0] : '';
  }
  function text(o) {
    const i = info(o);
    return 'HyGrow Grow Sim — ' + i.name + ', day ' + i.day + ', ' + i.kg + ' kg ' + '★'.repeat(i.stars) + '☆'.repeat(5 - i.stars) + ' 🌱 ' + SITE.split('/')[0] + '\n' + (url() || 'https://' + SITE);
  }
  function loadImg(src) { return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
  async function iconImg(id) {
    try {
      const svg = Art.cropIcon(id, 400, true, ['#2a1d14', '#3f9b3a']); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', 400); svg.setAttribute('height', 400); /* v48 line icon */
      const u = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
      const im = await loadImg(u); URL.revokeObjectURL(u); return im;
    } catch (e) { return null; }
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrap(c, t, x, y, maxW, lh) { const ws = t.split(' '); let l = ''; for (const w of ws) { const n = l ? l + ' ' + w : w; if (c.measureText(n).width > maxW && l) { c.fillText(l, x, y); y += lh; l = w; } else l = n; } if (l) c.fillText(l, x, y); return y; }

  async function render(o) {
    const i = info(o);
    let disp = 'system-ui, sans-serif', body = 'system-ui, sans-serif';
    try {
      await Promise.race([Promise.all([document.fonts.load('700 80px Fredoka'), document.fonts.load('800 30px Nunito')]), new Promise(r => setTimeout(r, 1500))]);
      if (document.fonts.check('700 80px Fredoka')) disp = 'Fredoka, system-ui, sans-serif';
      if (document.fonts.check('800 30px Nunito')) body = 'Nunito, system-ui, sans-serif';
    } catch (e) {}
    const [logo, axel, icon] = await Promise.all([loadImg('art/logo/hygrow-logo-white.png'), loadImg('axel/thumbs_v2.webp'), iconImg(i.id)]);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16301a'); g.addColorStop(1, '#080808'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (logo) { const mh = 90, mw = 420, k = Math.min(mh / logo.height, mw / logo.width); c.drawImage(logo, 60, 50, logo.width * k, logo.height * k); }
    c.fillStyle = pal.green; c.font = '700 30px ' + disp; c.textAlign = 'right'; c.fillText('GROW SIM', W - 60, 112);
    c.fillStyle = pal.cream; rr(c, 60, 180, W - 120, 900, 48); c.fill(); c.lineWidth = 8; c.strokeStyle = pal.brown; c.stroke();
    c.fillStyle = '#e4efd8'; c.beginPath(); c.arc(W / 2, 360, 150, 0, 7); c.fill();
    if (icon) c.drawImage(icon, W / 2 - 130, 360 - 130, 260, 260); /* v48 */
    c.textAlign = 'center';
    c.fillStyle = pal.brown; c.font = '700 56px ' + disp; c.fillText(i.name + '  ·  Day ' + i.day, W / 2, 590);
    c.fillStyle = pal.green; c.strokeStyle = pal.brown; c.lineWidth = 10; c.lineJoin = 'round'; c.font = '700 200px ' + disp;
    const kg = i.kg + ' kg'; c.strokeText(kg, W / 2, 770); c.fillText(kg, W / 2, 770);
    c.font = '800 38px ' + body; c.fillStyle = pal.muted; c.fillText('PICKED', W / 2, 820);
    c.font = '700 84px ' + disp; c.fillStyle = pal.orange; c.fillText('★'.repeat(i.stars), W / 2, 920);
    [['Health', i.health], ['Eco', i.eco], ['Overall', i.overall]].forEach((s, k) => {
      const x = 120 + k * 290; c.fillStyle = pal.brown; rr(c, x, 950, 260, 100, 28); c.fill();
      c.fillStyle = pal.cream; c.font = '700 52px ' + disp; c.fillText(String(s[1]), x + 130, 1008);
      c.fillStyle = pal.green; c.font = '800 24px ' + body; c.fillText(s[0].toUpperCase(), x + 130, 1040);
    });
    let y = 1135; c.textAlign = 'left';
    if (i.chapter) { c.fillStyle = pal.yellow; c.font = '700 36px ' + disp; c.fillText(i.chapter, 70, y); y += 20; }
    c.fillStyle = '#d7e6cc'; c.font = '700 30px ' + body; wrap(c, i.fact, 70, y + 10, 640, 38);
    if (axel) { const ah = 250, aw = axel.width * ah / axel.height; c.drawImage(axel, W - 40 - aw, H - ah - 20, aw, ah); }
    c.fillStyle = pal.green; c.font = '700 34px ' + disp; c.fillText(SITE, 70, H - 50);
    const gu = url(); if (gu) { c.fillStyle = '#d7e6cc'; c.font = '700 24px ' + body; c.fillText(gu.replace(/^https:\/\//, '').slice(0, 48), 70, H - 18); }
    return cv;
  }

  const toBlob = cv => new Promise(r => cv.toBlob(r, 'image/png'));
  async function share(o) {
    const t = text(o), cv = await render(o), blob = await toBlob(cv), name = 'hygrow-grow-card.png';
    try {
      const f = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text: t, title: 'HyGrow Grow Sim' }); return 'shared'; }
      if (navigator.share) { await navigator.share({ text: t, title: 'HyGrow Grow Sim' }); return 'shared'; }
    } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'downloaded';
  }
  async function copy(o) {
    const t = text(o);
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok;
  }
  function mount(host, o) {
    if (!host) return;
    const old = host.querySelector('.sharecard-row'); if (old) old.remove();
    const row = document.createElement('div'); row.className = 'sharecard-row';
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:14px 0';
    const bs = 'min-height:48px;padding:8px 20px;border-radius:999px;border:3px solid #2a1d14;font:900 16px var(--display);cursor:pointer;';
    row.innerHTML = '<canvas class="sc-thumb" style="width:200px;max-width:100%;border-radius:12px;border:2px solid #2a312a;background:#121512"></canvas>' +
      '<div style="display:flex;flex-direction:column;gap:8px;flex:1;min-width:140px"><button type="button" class="sc-share" style="' + bs + 'background:#6ec846;color:#080808">Share</button>' +
      '<button type="button" class="sc-copy" style="' + bs + 'background:#f6f3ea;color:#080808">Copy text</button><small class="sc-msg" aria-live="polite" style="color:#a9b3a9"></small></div>';
    host.appendChild(row);
    const msg = row.querySelector('.sc-msg'), th = row.querySelector('.sc-thumb');
    th.width = 200; th.height = 250;
    render(o).then(cv => th.getContext('2d').drawImage(cv, 0, 0, 200, 250)).catch(() => { th.remove(); });
    row.querySelector('.sc-share').onclick = async () => { msg.textContent = ''; const r = await share(o); msg.textContent = r === 'downloaded' ? 'Card saved to your downloads.' : r === 'shared' ? 'Shared!' : ''; };
    row.querySelector('.sc-copy').onclick = async () => { msg.textContent = (await copy(o)) ? 'Copied!' : 'Could not copy.'; };
  }
  window.ShareCard = { render, text, mount, share, copy, FACTS };
  window.Sharecard = window.ShareCard;
})();
