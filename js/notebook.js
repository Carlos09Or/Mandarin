// Notebook (练习本) — a paper practice notebook. Each row of a sheet holds one word of your choice:
// its pinyin is filled in, the first squares show a grey model, and you write the plana by hand
// (free ink, no stroke checking). Finished sheets keep their date, writing time and plana count.
//
// Sheets (with their ink) are stored in IndexedDB: ink is far too large for localStorage.
(function () {
  const CELLS = 8;                     // each row: [pinyin] + 8 squares
  const MIN_ROWS = 7, MAX_ROWS = 14;   // a new sheet gets as many rows as fit the screen
  const IDLE = 60000;                  // pauses longer than this don't count as writing time
  const PAGE_KEY = 'hsk1NotebookPage';
  const SINGLE = matchMedia('(max-width: 900px), (orientation: portrait)');
  const DAYS = ['日', '一', '二', '三', '四', '五', '六'];

  const $ = (s, root = document) => root.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const fmt = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtLong = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const dur = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : fmtLong(ms));
  const VOCAB = WORDS.map((w) => ({ hz: baseHanzi(w), py: w.pinyin, en: w.en }));

  // ---------- storage ----------
  const db = (() => {
    let opening = null;
    const open = () => opening || (opening = new Promise((res, rej) => {
      const r = indexedDB.open('hsk1Notebook', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('pages', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction('pages', mode);
        const req = fn(t.objectStore('pages'));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      });
    };
    return { all: () => run('readonly', (s) => s.getAll()), put: (p) => run('readwrite', (s) => s.put(p)) };
  })();

  let pages = null;           // loaded on first visit
  let pageIndex = -1;         // -1 = cover
  let last = 0;               // time of the last pen activity on the open sheet
  const saveTimers = {};
  const cur = () => (pages ? pages[pageIndex] : null);
  function persist(p, now = false) {
    clearTimeout(saveTimers[p.id]);
    const write = () => db.put(p).catch(() => {});
    if (now) write(); else saveTimers[p.id] = setTimeout(write, 600);
  }
  const rememberPage = () => { try { localStorage.setItem(PAGE_KEY, String(pageIndex)); } catch (_) {} };

  // Rows that fit below the notebook's top edge, measured on the real page (the app's sidebar
  // takes part of the width on tablets).
  function rowsThatFit() {
    const bookW = book?.clientWidth || Math.min(innerWidth - 32, 1000);
    const pageW = SINGLE.matches ? bookW : bookW * 0.55;
    const cell = (pageW - 40) / 10;
    const top = book ? book.getBoundingClientRect().top : 130;
    return Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor((innerHeight - top - 70) / cell)));
  }
  const blankPage = () => ({ id: 'p' + Date.now(), created: Date.now(), finishedAt: null, activeMs: 0, planas: 0, rows: Array(rowsThatFit()).fill(null), strokes: [], active: 0 });

  // ---------- sheets ----------
  const dateHtml = (ts) => { const d = new Date(ts); return `<span class="nbDate"><b>${d.getFullYear()}</b>年<b>${d.getMonth() + 1}</b>月<b>${d.getDate()}</b>日 · 星期${DAYS[d.getDay()]}</span>`; };
  const activeWord = (p) => p.rows[p.active] || p.rows.find(Boolean) || null;

  function cardSheet(pi) {
    const p = pages[pi], s = el('div', 'nbSheet');
    s.innerHTML = `<div class="nbPageHead">${dateHtml(p.created)}<span>Sheet ${pi + 1}</span></div>`;
    const card = el('div', 'nbCard');
    const w = activeWord(p);
    if (w) {
      const n = [...w.hz].length;
      card.innerHTML = `<div class="nbBigCell"><span style="font-size:${n > 2 ? 26 : n > 1 ? 40 : 72}cqi">${escapeHtml(w.hz)}</span></div>
        <div class="nbBigPy">${escapeHtml(w.py)}</div><div class="nbBigEn">${escapeHtml(w.en)}</div>`;
    } else card.innerHTML = '<p class="nbEmpty">Pick a Hanzi for a row on the right page and its card shows up here.</p>';
    const idx = el('div', 'nbIndex', '<h3>On this sheet</h3>');
    p.rows.forEach((rw, r) => {
      if (!rw) return;
      const b = el('button', r === p.active ? 'on' : '', `<span class="n">${r + 1}</span><b>${escapeHtml(rw.hz)}</b><i>${escapeHtml(rw.py)}</i><small>${escapeHtml(rw.en)}</small>`);
      b.type = 'button';
      b.addEventListener('click', () => { p.active = r; persist(p); refreshActive(); });
      idx.append(b);
    });
    if (idx.children.length > 1) card.append(idx);
    s.append(card);
    return s;
  }

  function practiceSheet(pi) {
    const p = pages[pi], s = el('div', 'nbSheet' + (p.finishedAt ? ' nbDone' : ''));
    s.innerHTML = `<div class="nbPageHead">${dateHtml(p.created)}<span>${p.finishedAt ? '⏱ ' + dur(p.activeMs) : 'Sheet ' + (pi + 1)}</span></div>`;
    const wrap = el('div', 'nbGridWrap'), rows = el('div', 'nbRows');
    p.rows.forEach((w, r) => {
      const py = el('button', 'nbPyCell');
      py.type = 'button';
      py.dataset.row = r;
      py.innerHTML = w ? `<span class="nbPy">${escapeHtml(w.py)}</span>` : '<span class="nbAdd">+ Hanzi</span>';
      py.setAttribute('aria-label', w ? `Row ${r + 1}: ${w.hz}. Change` : `Row ${r + 1}: choose a Hanzi`);
      if (p.finishedAt) py.disabled = true;
      py.addEventListener('click', () => { p.active = r; openPicker(r); });
      rows.append(py);
      const chars = w ? [...w.hz] : [];
      for (let c = 0; c < CELLS; c++) {
        const cell = el('div', 'nbCell');
        if (c < chars.length) cell.append(el('span', '', escapeHtml(chars[c])));   // grey model
        rows.append(cell);
      }
    });
    wrap.append(rows);
    s.append(wrap);
    attachInk(wrap, p);
    if (p.finishedAt) s.append(el('div', 'nbStamp', `<b>好 ✓</b>${dur(p.activeMs)} · ${p.planas} ${p.planas === 1 ? 'plana' : 'planas'}`));
    markActiveRow(s, p);
    return s;
  }

  // Rows are visual only (one flat grid): highlight the pinyin cell and squares of the active row.
  function markActiveRow(s, p) {
    [...s.querySelectorAll('.nbRows > *')].forEach((k, i) => {
      const r = Math.floor(i / (CELLS + 1));
      k.classList.toggle(k.classList.contains('nbPyCell') ? 'on' : 'nbActiveCell', r === p.active && !!p.rows[r]);
    });
  }

  function coverSheet() {
    const s = el('div', 'nbSheet nbCover');
    const done = pages.filter((p) => p.finishedAt).length;
    const since = pages.length ? new Date(pages[0].created).toLocaleDateString() : '—';
    s.innerHTML = `<div><div class="nbCoverZh">练习本</div><div class="nbCoverEn">HSK 1 · Practice book</div></div>
      <div class="nbLabel"><div><span>Sheets done</span><b>${done}</b></div><div><span>Since</span><b>${since}</b></div></div>`;
    const b = el('button', 'nbOpen', 'Open notebook →');
    b.type = 'button';
    b.addEventListener('click', () => { if (!pages.length || pages[pages.length - 1].finishedAt) addPage(); go(pages.length - 1); });
    s.append(b);
    return s;
  }

  // ---------- ink ----------
  function attachInk(wrap, p) {
    const cv = el('canvas', 'nbInk');
    wrap.append(cv);
    const ctx = cv.getContext('2d');
    const dims = () => [cv.width / (devicePixelRatio || 1), cv.height / (devicePixelRatio || 1)];
    const size = () => {
      const r = wrap.getBoundingClientRect(), d = devicePixelRatio || 1;
      cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      redraw();
    };
    function line(pts) {
      const [w, h] = dims();
      ctx.strokeStyle = '#1f2430'; ctx.lineWidth = Math.max(2.5, w * 0.0055); ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      ctx.stroke();
    }
    function redraw() { const [w, h] = dims(); ctx.clearRect(0, 0, w, h); p.strokes.forEach(line); }
    let pts = null;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    cv.addEventListener('pointerdown', (e) => {
      if (p.finishedAt) return;
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      pts = [pt(e)];
      tick();
      const r = Math.min(p.rows.length - 1, Math.floor(pts[0][1] * p.rows.length));
      if (r !== p.active && p.rows[r]) { p.active = r; refreshActive(); }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts) return;
      (e.getCoalescedEvents?.() || [e]).forEach((ev) => pts.push(pt(ev)));
      redraw(); line(pts); tick();
    });
    const end = () => {
      if (pts && pts.length > 1) { p.strokes.push(compact(pts)); persist(p); renderBar(); }
      pts = null;
      redraw();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    wrap._size = size;
    requestAnimationFrame(size);
  }

  // Drops points closer than ~0.15% of the grid to the previous one and rounds the rest.
  function compact(pts) {
    const out = [pts[0]];
    for (const q of pts.slice(1)) { const o = out[out.length - 1]; if (Math.hypot(q[0] - o[0], q[1] - o[1]) > 0.0015) out.push(q); }
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    return out.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
  }

  function tick() {
    const p = cur();
    if (!p || p.finishedAt) return;
    const now = Date.now();
    if (last && now - last < IDLE) p.activeMs += now - last;
    last = now;
  }

  function planasOf(p) {
    const n = p.rows.length;
    const inked = new Set(p.strokes.map((s) => Math.min(n - 1, Math.floor(s[0][1] * n))));
    return p.rows.filter((w, r) => w && inked.has(r)).length;
  }

  // ---------- book and page turning ----------
  let book = null;
  const partsFor = (i) => (i < 0 ? { L: null, R: coverSheet() } : { L: cardSheet(i), R: practiceSheet(i) });
  function put(slot, sheet) { slot.querySelectorAll(':scope > .nbSheet').forEach((n) => n.remove()); if (sheet) slot.prepend(sheet); }

  function renderBook() {
    book.innerHTML = '';
    const L = el('div', 'nbSlot nbSlotL'), R = el('div', 'nbSlot nbSlotR');
    book.append(L, R);
    const parts = partsFor(pageIndex);
    put(L, parts.L);
    put(R, parts.R);
    book.classList.toggle('nbClosed', pageIndex < 0);
    renderBar();
  }

  function refreshActive() {
    if (pageIndex < 0) return;
    const L = $('.nbSlotL', book);
    if (L) put(L, cardSheet(pageIndex));
    const s = $('.nbSlotR .nbSheet', book);
    if (s) markActiveRow(s, cur());
  }

  let busy = false;
  function go(to) {
    if (busy || to === pageIndex || to < -1 || to >= pages.length) return;
    const dir = to > pageIndex ? 1 : -1;
    busy = true;
    last = 0;
    const L = $('.nbSlotL', book), R = $('.nbSlotR', book);
    const leaf = el('div', 'nbLeaf'), front = el('div', 'nbFace'), back = el('div', 'nbFace nbBack');
    leaf.append(front, back);
    const next = partsFor(to);
    if (dir > 0) {
      // The right page lifts and turns left, uncovering the next sheet.
      front.append(R.querySelector(':scope > .nbSheet'));
      back.append(next.L || el('div', 'nbSheet nbEndpaper'));
      put(R, next.R);
      R.append(leaf);
      requestAnimationFrame(() => requestAnimationFrame(() => { leaf.classList.add('nbTurning'); leaf.style.transform = 'rotateY(-180deg)'; }));
    } else {
      // The previous sheet comes back from the left and lands on the right.
      front.append(next.R);
      back.append(L.querySelector(':scope > .nbSheet') || el('div', 'nbSheet nbEndpaper'));
      put(L, next.L);
      leaf.classList.add('nbInstant');
      leaf.style.transform = 'rotateY(-180deg)';
      R.append(leaf);
      requestAnimationFrame(() => requestAnimationFrame(() => { leaf.classList.remove('nbInstant'); leaf.classList.add('nbTurning'); leaf.style.transform = 'rotateY(0deg)'; }));
    }
    const done = () => { if (!busy) return; busy = false; pageIndex = to; rememberPage(); renderBook(); };
    leaf.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 1300);
  }

  function addPage() { const p = blankPage(); pages.push(p); persist(p, true); }

  function renderBar() {
    const p = cur();
    $('#nbPageNum').textContent = pageIndex < 0 ? 'Cover' : `Sheet ${pageIndex + 1} of ${pages.length}`;
    $('#nbPrev').disabled = pageIndex < 0;
    $('#nbNext').disabled = pageIndex >= pages.length - 1;
    $('#nbFinish').disabled = !p || !!p.finishedAt || !p.strokes.length;
    $('#nbNew').disabled = !!p && !p.finishedAt && pageIndex === pages.length - 1;
    $('#nbCount').textContent = `(${pages.filter((x) => x.finishedAt).length})`;
  }

  setInterval(() => {
    const t = $('#nbTimer');
    if (!t || !pages) return;
    const p = cur();
    if (!p) { t.textContent = '⏱ —'; t.classList.add('idle'); return; }
    const live = !p.finishedAt && last && Date.now() - last < IDLE ? Date.now() - last : 0;
    t.textContent = '⏱ ' + fmt(p.activeMs + live);
    t.classList.toggle('idle', !live);
  }, 500);

  // ---------- word picker ----------
  let pickRow = 0;
  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü/g, 'u').replace(/[\s'’/]/g, '').toLowerCase();
  function openPicker(r) {
    pickRow = r;
    $('#nbPickTitle').textContent = `Row ${r + 1}: choose a Hanzi`;
    $('#nbPickQ').value = '';
    $('#nbPicker').hidden = false;
    search();
    $('#nbPickQ').focus();
  }
  const closePicker = () => { $('#nbPicker').hidden = true; };
  function choose(w) {
    const p = cur();
    p.rows[pickRow] = w;
    p.active = pickRow;
    persist(p);
    closePicker();
    renderBook();
  }
  function search() {
    const q = $('#nbPickQ').value.trim(), qp = plain(q), ql = q.toLowerCase();
    const now = cur().rows[pickRow];
    // Best matches first: same Hanzi, same pinyin, pinyin that starts with the query, then the rest.
    const rank = ({ hz, py, en }) => {
      const p = plain(py);
      if (hz === q) return 0;
      if (hz.includes(q)) return 1;
      if (p === qp) return 2;
      if (p.startsWith(qp)) return 3;
      if (en.toLowerCase().split(/[^a-z]+/).includes(ql)) return 4;
      if (p.includes(qp)) return 5;
      if (en.toLowerCase().includes(ql)) return 6;
      return 99;
    };
    const list = !q ? VOCAB : VOCAB.map((w) => [rank(w), w]).filter(([r]) => r < 99).sort((a, b) => a[0] - b[0]).map(([, w]) => w);
    const box = $('#nbResults');
    box.innerHTML = '';
    list.slice(0, 80).forEach((w) => {
      const b = el('button', now && now.hz === w.hz ? 'cur' : '', `<b>${escapeHtml(w.hz)}</b><i>${escapeHtml(w.py)}</i><small>${escapeHtml(w.en)}</small>`);
      b.type = 'button';
      b.addEventListener('click', () => choose(w));
      box.append(b);
    });
    if (!list.length) box.append(el('p', 'nbNote', 'No HSK 1 word matches.'));
    const custom = $('#nbCustom');
    custom.innerHTML = '';
    if (/^\p{Script=Han}+$/u.test(q) && !VOCAB.some((w) => w.hz === q)) {
      // Any other Hanzi: you type its pinyin yourself.
      custom.innerHTML = `<span>“${escapeHtml(q)}” is not in HSK 1. Pinyin:</span><input id="nbCustomPy" placeholder="pǎobù" autocomplete="off"><button class="nbBtn" id="nbUseCustom" type="button">Use</button>`;
      $('#nbUseCustom').addEventListener('click', () => choose({ hz: q, py: $('#nbCustomPy').value.trim() || '—', en: '' }));
    } else if (now) {
      custom.innerHTML = `<span>Now: <b>${escapeHtml(now.hz)}</b> ${escapeHtml(now.py)}</span><button class="nbBtn" id="nbClearRow" type="button">Remove from row</button>`;
      $('#nbClearRow').addEventListener('click', () => choose(null));
    } else custom.innerHTML = '<span>You can also type any Hanzi outside HSK 1.</span>';
  }

  // ---------- my sheets ----------
  function thumb(p) {
    const n = p.rows.length, w = 320, h = 32 * n, cw = w / 10, ch = h / n;
    const c = el('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fbf6e6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#cfdacb'; g.lineWidth = 1;
    for (let r = 0; r <= n; r++) { g.beginPath(); g.moveTo(0, r * ch); g.lineTo(w, r * ch); g.stroke(); }
    for (let k = 2; k <= 10; k++) { g.beginPath(); g.moveTo(k * cw, 0); g.lineTo(k * cw, h); g.stroke(); }
    g.textBaseline = 'middle'; g.fillStyle = '#3b3f46'; g.font = '13px Andika, sans-serif';
    p.rows.forEach((rw, r) => { if (rw) g.fillText(rw.py, 6, r * ch + ch / 2, cw * 2 - 10); });
    g.strokeStyle = '#1f2430'; g.lineWidth = 1.6; g.lineCap = g.lineJoin = 'round';
    p.strokes.forEach((s) => { g.beginPath(); s.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h))); g.stroke(); });
    return c;
  }

  function renderList() {
    const done = pages.filter((p) => p.finishedAt);
    const total = done.reduce((a, p) => a + p.activeMs, 0);
    const planas = done.reduce((a, p) => a + (p.planas || 0), 0);
    const words = new Set(done.flatMap((p) => p.rows.filter(Boolean).map((w) => w.hz)));
    $('#nbStats').innerHTML = [[done.length, 'sheets finished'], [planas, 'planas'], [dur(total), 'writing'], [words.size, 'different Hanzi']]
      .map(([v, l]) => `<div class="nbStat"><b>${v}</b><span>${l}</span></div>`).join('');
    const box = $('#nbSheets');
    box.innerHTML = '';
    if (!pages.length) { box.append(el('p', 'nbNote', 'Your sheets show up here, each with its date, writing time and planas. Open the notebook to start the first one.')); return; }
    pages.map((p, i) => [p, i]).reverse().forEach(([p, i]) => {
      const b = el('button', 'nbMini');
      b.type = 'button';
      b.append(thumb(p));
      const d = new Date(p.created);
      b.append(el('div', '', `<span class="nbTag ${p.finishedAt ? '' : 'open'}">${p.finishedAt ? 'Finished' : 'In progress'}</span>
        <b>Sheet ${i + 1} · ${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
        <span>${p.finishedAt ? `⏱ ${dur(p.activeMs)} · ${p.planas} ${p.planas === 1 ? 'plana' : 'planas'}` : 'Not finished'}</span>
        <span class="nbWords">${p.rows.filter(Boolean).map((w) => escapeHtml(w.hz)).join(' · ') || '—'}</span>`));
      b.addEventListener('click', () => { showView('book'); pageIndex = i; rememberPage(); renderBook(); });
      box.append(b);
    });
  }

  function showView(v) {
    $('#nbBookView').hidden = v !== 'book';
    $('#nbListView').hidden = v !== 'list';
    $('#nbViewBook').setAttribute('aria-pressed', String(v === 'book'));
    $('#nbViewList').setAttribute('aria-pressed', String(v === 'list'));
    if (v === 'list') renderList();
  }

  // ---------- start ----------
  async function load() {
    if (pages) { renderBook(); return; }
    try { pages = (await db.all()).sort((a, b) => a.created - b.created); } catch (_) { pages = []; }
    const saved = +(localStorage.getItem(PAGE_KEY) ?? -1);
    pageIndex = saved >= -1 && saved < pages.length ? saved : -1;
    book = $('#nbBook');
    renderBook();
  }

  $('#nbPrev').addEventListener('click', () => go(pageIndex - 1));
  $('#nbNext').addEventListener('click', () => go(pageIndex + 1));
  $('#nbFinish').addEventListener('click', () => {
    const p = cur();
    if (!p || p.finishedAt) return;
    tick();
    p.finishedAt = Date.now();
    p.planas = planasOf(p);
    persist(p, true);
    renderBook();
  });
  $('#nbNew').addEventListener('click', () => {
    if (!pages.length || pages[pages.length - 1].finishedAt) addPage();
    go(pages.length - 1);
  });
  $('#nbViewBook').addEventListener('click', () => showView('book'));
  $('#nbViewList').addEventListener('click', () => showView('list'));
  $('#nbPickQ').addEventListener('input', search);
  $('#nbPickQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#nbResults button')?.click(); });
  $('#nbPickClose').addEventListener('click', closePicker);
  $('#nbPicker').addEventListener('click', (e) => { if (e.target.id === 'nbPicker') closePicker(); });
  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.page !== 'notebook' || !pages) return;
    if (!$('#nbPicker').hidden) { if (e.key === 'Escape') closePicker(); return; }
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') go(pageIndex + 1);
    if (e.key === 'ArrowLeft') go(pageIndex - 1);
  });
  // Save the writing time when the learner leaves the page or the app.
  const flush = () => { const p = cur(); if (p && !p.finishedAt) persist(p, true); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => book?.querySelectorAll('.nbGridWrap').forEach((w) => w._size?.()), 120); });

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.page === 'notebook') load(); else { flush(); last = 0; }
  }));
  $('#homeOpenNotebook')?.addEventListener('click', () => { switchPage('notebook'); load(); });
})();
