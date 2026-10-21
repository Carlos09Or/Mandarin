// Notebook (练习本) — a paper practice notebook. Each row of a sheet holds one word of your choice:
// its pinyin is filled in, the first squares show a grey model (or the whole row, with "shadow"),
// and you write the plana by hand (free ink, no stroke checking). Finished sheets keep their date,
// writing time and plana count.
//
// The book shows the previous sheet on the left and the sheet you write on the right (portrait:
// only the right one). Zoom, a Move tool, two-finger pinch/pan and pen-only mode let you work at a
// comfortable size without gestures turning into ink. Sheets live in IndexedDB.
(function () {
  const CELLS = 8;                     // each row: [pinyin] + 8 squares
  const MIN_ROWS = 6, MAX_ROWS = 14;   // a new sheet gets as many rows as fit the screen
  const IDLE = 60000;                  // pauses longer than this don't count as writing time
  const ZOOMS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const SETTINGS_KEY = 'hsk1NotebookSettings';
  const SINGLE = matchMedia('(max-width: 900px), (orientation: portrait)');
  const DAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const COVER_COLORS = { red: '#b72d36', ink: '#24324a', jade: '#2f6b55', ochre: '#b07a2a', plum: '#6d3b5e', black: '#26221f' };

  const $ = (s, root = document) => root.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const fmt = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtLong = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const dur = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : fmtLong(ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const VOCAB = WORDS.map((w) => ({ hz: baseHanzi(w), py: w.pinyin, en: w.en }));

  // ---------- settings ----------
  const settings = { tool: 'pen', zoom: 1, penOnly: null, focus: true, view: -1,
    cover: { name: '', title: '练习本', subtitle: 'HSK 1 · Practice book', color: 'red', seal: '学' } };
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); Object.assign(settings, s, { cover: { ...settings.cover, ...(s.cover || {}) } }); } catch (_) {}
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {} };

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
  let view = -1;              // index of the sheet on the right page; -1 = closed cover
  let last = 0;               // time of the last pen activity on the open sheet
  const history = {};         // sheet id → undo stack (this session)
  const redraws = new WeakMap(); // sheet → redraw its ink (kept off the sheet: IndexedDB can't store functions)
  const saveTimers = {};
  const openSheet = () => (pages && pages.length && !pages[pages.length - 1].finishedAt ? pages[pages.length - 1] : null);
  const writable = (p) => p && p === openSheet();
  function persist(p, now = false) {
    clearTimeout(saveTimers[p.id]);
    const write = () => db.put(p).catch(() => {});
    if (now) write(); else saveTimers[p.id] = setTimeout(write, 600);
  }

  // ---------- layout: viewport, zoom, focus ----------
  let viewport = null, book = null;
  function fitViewport() {
    if (!viewport || document.body.dataset.page !== 'notebook') return;
    const top = viewport.getBoundingClientRect().top;
    // leave room for the app's bottom dock when it is showing (phones, portrait tablets)
    const dock = document.querySelector('.bottomDockNav');
    const dockH = dock && getComputedStyle(dock).display !== 'none' ? dock.getBoundingClientRect().height + 10 : 0;
    viewport.style.height = `${Math.max(320, innerHeight - top - dockH - 12)}px`;
  }
  function applyZoom(z, ax, ay) {
    z = clamp(z, ZOOMS[0], ZOOMS[ZOOMS.length - 1]);
    const r = viewport.getBoundingClientRect();
    ax = ax ?? r.left + r.width / 2; ay = ay ?? r.top + r.height / 2;
    // keep the point under (ax, ay) in place
    const fx = (viewport.scrollLeft + ax - r.left) / Math.max(1, book.offsetWidth);
    const fy = (viewport.scrollTop + ay - r.top) / Math.max(1, book.offsetHeight);
    settings.zoom = z;
    book.style.width = `${Math.round((viewport.clientWidth - 2) * z)}px`;
    viewport.scrollLeft = fx * book.offsetWidth - (ax - r.left);
    viewport.scrollTop = fy * book.offsetHeight - (ay - r.top);
    $('#nbZoomLabel').textContent = `${Math.round(z * 100)}%`;
  }
  function stepZoom(dir) {
    const i = ZOOMS.findIndex((v) => v >= settings.zoom - 0.01);
    applyZoom(ZOOMS[clamp(i + dir, 0, ZOOMS.length - 1)]);
    saveSettings();
  }
  function applyFocus() {
    document.body.classList.toggle('nbFocus', !!settings.focus);
    $('#nbFocus').setAttribute('aria-pressed', String(!!settings.focus));
    $('#nbFocus').textContent = settings.focus ? '☰ Show menu' : '⛶ Focus';
    requestAnimationFrame(() => { fitViewport(); if (book) applyZoom(settings.zoom); });
  }

  function rowsThatFit() {
    const vw = viewport?.clientWidth || innerWidth - 32;
    const pageW = SINGLE.matches ? vw : vw / 2;
    const cell = (pageW - 40) / 10;
    const vh = viewport?.clientHeight || innerHeight - 200;
    return clamp(Math.floor((vh - 70) / cell), MIN_ROWS, MAX_ROWS);
  }
  const blankPage = () => ({ id: 'p' + Date.now(), created: Date.now(), finishedAt: null, activeMs: 0, planas: 0, rows: Array(rowsThatFit()).fill(null), strokes: [], active: 0 });

  // ---------- sheets ----------
  const dateHtml = (ts) => { const d = new Date(ts); return `<span class="nbDate"><b>${d.getFullYear()}</b>年<b>${d.getMonth() + 1}</b>月<b>${d.getDate()}</b>日 · 星期${DAYS[d.getDay()]}</span>`; };
  // Long pinyin gets a slightly smaller size so it stays on one line.
  const pySize = (py) => `${Math.min(4.6, 29 / Math.max(6, [...py].length)).toFixed(2)}cqi`;

  function practiceSheet(pi) {
    const p = pages[pi], live = writable(p);
    const s = el('div', 'nbSheet' + (p.finishedAt ? ' nbDone' : '') + (live ? ' nbLive' : ''));
    s.innerHTML = `<div class="nbPageHead">${dateHtml(p.created)}<span>${p.finishedAt ? '⏱ ' + dur(p.activeMs) + ' · ' : ''}Sheet ${pi + 1}</span></div>`;
    const wrap = el('div', 'nbGridWrap'), rows = el('div', 'nbRows');
    p.rows.forEach((w, r) => {
      const py = el('button', 'nbPyCell');
      py.type = 'button';
      py.dataset.row = r;
      py.innerHTML = w ? `<span class="nbPy" style="font-size:${pySize(w.py)}">${escapeHtml(w.py)}</span>` : (live ? '<span class="nbAdd">+ Hanzi</span>' : '');
      py.setAttribute('aria-label', w ? `Row ${r + 1}: ${w.hz}. Change` : `Row ${r + 1}: choose a Hanzi`);
      if (!live) py.disabled = true;
      py.addEventListener('click', () => { p.active = r; openPicker(p, r); });
      rows.append(py);
      const chars = w ? [...w.hz] : [];
      for (let c = 0; c < CELLS; c++) {
        const cell = el('div', 'nbCell');
        // grey model in the first squares; with shadow on, the whole row is there to trace
        if (chars.length && (c < chars.length || w.shadow)) cell.append(el('span', '', escapeHtml(chars[c % chars.length])));
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
    if (!writable(p)) return;
    [...s.querySelectorAll('.nbRows > *')].forEach((k, i) => {
      const r = Math.floor(i / (CELLS + 1));
      k.classList.toggle(k.classList.contains('nbPyCell') ? 'on' : 'nbActiveCell', r === p.active && !!p.rows[r]);
    });
  }

  function coverSheet() {
    const c = settings.cover, s = el('div', 'nbSheet nbCover');
    s.style.setProperty('--nb-cover', COVER_COLORS[c.color] || COVER_COLORS.red);
    const done = pages.filter((p) => p.finishedAt).length;
    s.innerHTML = `<div class="nbBand" aria-hidden="true"></div>
      <div class="nbCoverTop"><div class="nbCoverZh">${escapeHtml(c.title || '练习本')}</div><div class="nbCoverEn">${escapeHtml(c.subtitle || '')}</div></div>
      <div class="nbSeal" aria-hidden="true">${escapeHtml([...(c.seal || '学')][0])}</div>
      <div class="nbLabel">
        <div><span>姓名 Name</span><b>${escapeHtml(c.name || '—')}</b></div>
        <div><span>Sheets</span><b>${done}</b></div>
        <div><span>Since</span><b>${pages.length ? new Date(pages[0].created).toLocaleDateString() : new Date().toLocaleDateString()}</b></div>
      </div>
      <div class="nbCoverActions"></div>`;
    const open = el('button', 'nbOpen', 'Open notebook →');
    open.type = 'button';
    open.addEventListener('click', () => { if (!pages.length) addPage(); go(pages.length - 1); });
    const edit = el('button', 'nbOpen nbGhost', '✎ Customize cover');
    edit.type = 'button';
    edit.addEventListener('click', openCoverEditor);
    $('.nbCoverActions', s).append(open, edit);
    return s;
  }
  const endpaper = () => el('div', 'nbSheet nbEndpaper');

  // ---------- ink: pen, eraser, undo ----------
  let activeInk = null;   // the canvas being drawn on, to cancel a stroke when a pinch starts
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
    const ro = new ResizeObserver(() => (cv.isConnected ? size() : ro.disconnect()));
    ro.observe(wrap);
    function line(pts) {
      const [w, h] = dims();
      ctx.strokeStyle = '#1f2430'; ctx.lineWidth = Math.max(2.5, w * 0.0055); ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      ctx.stroke();
    }
    function redraw(cursor) {
      const [w, h] = dims();
      ctx.clearRect(0, 0, w, h);
      p.strokes.forEach(line);
      if (cursor) { ctx.strokeStyle = 'rgba(183,45,54,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cursor[0] * w, cursor[1] * h, eraserRadius(), 0, Math.PI * 2); ctx.stroke(); }
    }
    const eraserRadius = () => Math.max(10, dims()[0] * 0.018);
    function eraseAt([x, y]) {
      const [w, h] = dims(), rad = eraserRadius();
      const removed = [];
      p.strokes = p.strokes.filter((s, i) => {
        const hit = s.some(([sx, sy]) => Math.hypot((sx - x) * w, (sy - y) * h) < rad);
        if (hit) removed.push([i, s]);
        return !hit;
      });
      return removed;
    }
    let pts = null, erased = null;
    // Coalesced events give smoother lines; some browsers return an empty list, so fall back to the event.
    const samples = (e) => { const list = e.getCoalescedEvents?.(); return list && list.length ? list : [e]; };
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    const cancel = () => { pts = null; erased = null; redraw(); };
    cv.addEventListener('pointerdown', (e) => {
      if (!writable(p) || !inks(e)) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      activeInk = { cancel };
      tick();
      const start = pt(e);
      const r = clamp(Math.floor(start[1] * p.rows.length), 0, p.rows.length - 1);
      if (r !== p.active && p.rows[r]) { p.active = r; refreshActive(); }
      if (settings.tool === 'eraser') { erased = eraseAt(start); redraw(start); }
      else pts = [start];
    });
    cv.addEventListener('pointermove', (e) => {
      if (erased) {
        samples(e).forEach((ev) => erased.push(...eraseAt(pt(ev))));
        redraw(pt(e)); tick();
      } else if (pts) {
        samples(e).forEach((ev) => pts.push(pt(ev)));
        redraw(); line(pts); tick();
      }
    });
    const end = () => {
      if (pts && pts.length > 1) {
        const s = compact(pts);
        p.strokes.push(s);
        (history[p.id] ||= []).push({ add: s });
      } else if (erased && erased.length) (history[p.id] ||= []).push({ erased });
      if ((pts && pts.length > 1) || (erased && erased.length)) { persist(p); renderBar(); }
      pts = null; erased = null; activeInk = null;
      redraw();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    redraws.set(p, () => redraw());
  }

  function undo() {
    const p = openSheet(), h = p && history[p.id];
    if (!h || !h.length) return;
    const a = h.pop();
    if (a.add) p.strokes = p.strokes.filter((s) => s !== a.add);
    else a.erased.sort((x, y) => x[0] - y[0]).forEach(([i, s]) => p.strokes.splice(i, 0, s));
    persist(p);
    redraws.get(p)?.();
    renderBar();
  }

  // Drops points closer than ~0.15% of the grid to the previous one and rounds the rest.
  function compact(pts) {
    const out = [pts[0]];
    for (const q of pts.slice(1)) { const o = out[out.length - 1]; if (Math.hypot(q[0] - o[0], q[1] - o[1]) > 0.0015) out.push(q); }
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    return out.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
  }

  function tick() {
    const p = openSheet();
    if (!p) return;
    const now = Date.now();
    if (last && now - last < IDLE) p.activeMs += now - last;
    last = now;
  }

  function planasOf(p) {
    const n = p.rows.length;
    const inked = new Set(p.strokes.map((s) => clamp(Math.floor(s[0][1] * n), 0, n - 1)));
    return p.rows.filter((w, r) => w && inked.has(r)).length;
  }

  // ---------- gestures: what writes and what moves ----------
  // Ink only with the Pen/Eraser tools, never with two fingers, and (in pen-only mode) never with a finger.
  const touches = new Map();
  let gesture = null;
  function inks(e) {
    if (settings.tool === 'move' || touches.size > 1) return false;
    if (settings.penOnly && e.pointerType === 'touch') return false;
    return true;
  }
  function bindGestures() {
    viewport.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen' && settings.penOnly === null) { settings.penOnly = true; saveSettings(); renderBar(); flash('Pen detected: your finger now moves the page. Change it with “Pen only”.'); }
      if (e.pointerType === 'touch') touches.set(e.pointerId, [e.clientX, e.clientY]);
      const pan = settings.tool === 'move' || (settings.penOnly && e.pointerType === 'touch') || (e.pointerType === 'mouse' && e.button === 1);
      if (touches.size === 2) {
        activeInk?.cancel();
        const [a, b] = [...touches.values()];
        gesture = { type: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: settings.zoom, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, sl: viewport.scrollLeft, st: viewport.scrollTop };
      } else if (pan && touches.size <= 1) {
        gesture = { type: 'pan', x: e.clientX, y: e.clientY, sl: viewport.scrollLeft, st: viewport.scrollTop, id: e.pointerId };
      }
    }, true);
    let lastPinch = 0;
    viewport.addEventListener('pointermove', (e) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (!gesture) return;
      if (gesture.type === 'pan' && e.pointerId === gesture.id) {
        if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 6) gesture.moved = true;
        viewport.scrollLeft = gesture.sl - (e.clientX - gesture.x);
        viewport.scrollTop = gesture.st - (e.clientY - gesture.y);
      } else if (gesture.type === 'pinch' && touches.size === 2) {
        const now = performance.now();
        if (now - lastPinch < 16) return;   // at most one re-layout per frame
        lastPinch = now;
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        applyZoom(gesture.z * d / gesture.d, mx, my);
        viewport.scrollLeft -= mx - gesture.mx; viewport.scrollTop -= my - gesture.my;
        gesture.mx = mx; gesture.my = my; gesture.z = settings.zoom; gesture.d = d;
      }
    }, true);
    const up = (e) => {
      touches.delete(e.pointerId);
      if (gesture && (gesture.type === 'pinch' ? touches.size < 2 : e.pointerId === gesture.id)) {
        if (gesture.type === 'pinch' || gesture.moved) suppressClickUntil = Date.now() + 350;
        gesture = null;
        saveSettings();
      }
    };
    // A drag or pinch that ends over a pinyin cell must not open the word picker.
    let suppressClickUntil = 0;
    viewport.addEventListener('click', (e) => { if (Date.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
    viewport.addEventListener('pointerup', up, true);
    viewport.addEventListener('pointercancel', up, true);
    // Ctrl/⌘ + wheel or trackpad pinch zooms the notebook instead of the browser page.
    viewport.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyZoom(settings.zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      clearTimeout(viewport._wz); viewport._wz = setTimeout(saveSettings, 300);
    }, { passive: false });
  }

  let flashTimer = 0;
  function flash(msg) {
    const n = $('#nbFlash');
    n.textContent = msg; n.hidden = false;
    clearTimeout(flashTimer); flashTimer = setTimeout(() => { n.hidden = true; }, 4500);
  }

  // ---------- book and page turning ----------
  // Right page = sheet `i`; left page = the sheet before it (or the inside of the cover).
  const partsFor = (i) => (i < 0 ? { L: null, R: coverSheet() } : { L: i > 0 ? practiceSheet(i - 1) : endpaper(), R: practiceSheet(i) });
  function put(slot, sheet) { slot.querySelectorAll(':scope > .nbSheet').forEach((n) => n.remove()); if (sheet) slot.prepend(sheet); }

  function renderBook() {
    book.innerHTML = '';
    const L = el('div', 'nbSlot nbSlotL'), R = el('div', 'nbSlot nbSlotR');
    book.append(L, R);
    const parts = partsFor(view);
    put(L, parts.L);
    put(R, parts.R);
    book.classList.toggle('nbClosed', view < 0);
    applyZoom(settings.zoom);
    renderBar();
  }

  function refreshActive() {
    const s = $('.nbSlotR .nbSheet', book);
    if (s && view >= 0) markActiveRow(s, pages[view]);
    renderBar();
  }

  let busy = false;
  function go(to) {
    if (busy || to === view || to < -1 || to >= pages.length) return;
    const dir = to > view ? 1 : -1;
    busy = true;
    last = 0;
    const L = $('.nbSlotL', book), R = $('.nbSlotR', book);
    const leaf = el('div', 'nbLeaf'), front = el('div', 'nbFace'), back = el('div', 'nbFace nbBack');
    leaf.append(front, back);
    const next = partsFor(to);
    if (dir > 0) {
      // The right page lifts and turns left.
      front.append(R.querySelector(':scope > .nbSheet'));
      back.append(next.L || endpaper());
      put(R, next.R);
      R.append(leaf);
      requestAnimationFrame(() => requestAnimationFrame(() => { leaf.classList.add('nbTurning'); leaf.style.transform = 'rotateY(-180deg)'; }));
    } else {
      // The left page comes back and lands on the right.
      front.append(next.R);
      back.append(L.querySelector(':scope > .nbSheet') || endpaper());
      put(L, next.L);
      leaf.classList.add('nbInstant');
      leaf.style.transform = 'rotateY(-180deg)';
      R.append(leaf);
      requestAnimationFrame(() => requestAnimationFrame(() => { leaf.classList.remove('nbInstant'); leaf.classList.add('nbTurning'); leaf.style.transform = 'rotateY(0deg)'; }));
    }
    const done = () => { if (!busy) return; busy = false; view = to; settings.view = to; saveSettings(); renderBook(); };
    leaf.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 1300);
  }

  function addPage() { const p = blankPage(); pages.push(p); persist(p, true); }

  function renderBar() {
    if (!pages) return;
    const p = view >= 0 ? pages[view] : null, open = openSheet();
    const live = writable(p);
    $('#nbPageNum').textContent = view < 0 ? 'Cover' : `Sheet ${view + 1} of ${pages.length}`;
    $('#nbPrev').disabled = view < 0;
    $('#nbNext').disabled = view >= pages.length - 1;
    $('#nbFinish').disabled = !live || !p.strokes.length;
    const nw = $('#nbNew');
    if (open && view !== pages.length - 1) { nw.textContent = 'Current sheet →'; nw.disabled = false; }
    else { nw.textContent = 'New sheet +'; nw.disabled = !!open; }
    document.querySelectorAll('#nbTools [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === settings.tool)));
    $('#nbUndo').disabled = !live || !(history[p.id] || []).length;
    const row = live ? p.rows[p.active] : null;
    const sh = $('#nbShadow');
    sh.disabled = !row;
    sh.setAttribute('aria-pressed', String(!!row?.shadow));
    $('#nbPenOnly').setAttribute('aria-pressed', String(!!settings.penOnly));
    $('#nbZoomLabel').textContent = `${Math.round(settings.zoom * 100)}%`;
    $('#nbCount').textContent = `(${pages.filter((x) => x.finishedAt).length})`;
    $('#nbBookView').classList.toggle('nbToolMove', settings.tool === 'move');
  }

  setInterval(() => {
    const t = $('#nbTimer');
    if (!t || !pages) return;
    const p = openSheet();
    if (!p) { t.textContent = '⏱ —'; t.classList.add('idle'); return; }
    const live = last && Date.now() - last < IDLE ? Date.now() - last : 0;
    t.textContent = '⏱ ' + fmt(p.activeMs + live);
    t.classList.toggle('idle', !live);
  }, 500);

  // ---------- word picker ----------
  let pick = null;   // { p, r }
  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü/g, 'u').replace(/[\s'’/]/g, '').toLowerCase();
  function openPicker(p, r) {
    pick = { p, r };
    $('#nbPickTitle').textContent = `Row ${r + 1}: choose a Hanzi`;
    $('#nbPickQ').value = '';
    $('#nbPicker').hidden = false;
    search();
    $('#nbPickQ').focus();
  }
  const closePicker = () => { $('#nbPicker').hidden = true; };
  function choose(w) {
    const { p, r } = pick;
    p.rows[r] = w ? { ...w, shadow: p.rows[r]?.shadow || false } : null;
    p.active = r;
    persist(p);
    closePicker();
    renderBook();
  }
  function search() {
    const q = $('#nbPickQ').value.trim(), qp = plain(q), ql = q.toLowerCase();
    const now = pick.p.rows[pick.r];
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
      custom.innerHTML = `<span>Now: <b>${escapeHtml(now.hz)}</b> ${escapeHtml(now.py)}</span>
        <label class="nbSwitch"><input type="checkbox" id="nbRowShadow" ${now.shadow ? 'checked' : ''}> Shadow in the whole row</label>
        <button class="nbBtn" id="nbClearRow" type="button">Remove</button>`;
      $('#nbRowShadow').addEventListener('change', (e) => { now.shadow = e.target.checked; persist(pick.p); renderBook(); });
      $('#nbClearRow').addEventListener('click', () => choose(null));
    } else custom.innerHTML = '<span>You can also type any Hanzi outside HSK 1.</span>';
  }

  // ---------- cover editor ----------
  function openCoverEditor() {
    const c = settings.cover;
    $('#nbCoverName').value = c.name;
    $('#nbCoverTitle').value = c.title;
    $('#nbCoverSub').value = c.subtitle;
    $('#nbCoverSeal').value = c.seal;
    renderSwatches();
    $('#nbCoverEditor').hidden = false;
    $('#nbCoverName').focus();
  }
  function renderSwatches() {
    $('#nbSwatches').innerHTML = Object.entries(COVER_COLORS).map(([k, v]) =>
      `<button type="button" class="nbSwatch" data-color="${k}" style="--sw:${v}" aria-label="${k}" aria-pressed="${settings.cover.color === k}"></button>`).join('');
  }
  function coverChanged() {
    const c = settings.cover;
    c.name = $('#nbCoverName').value.trim();
    c.title = $('#nbCoverTitle').value.trim() || '练习本';
    c.subtitle = $('#nbCoverSub').value.trim();
    c.seal = [...$('#nbCoverSeal').value.trim()][0] || '学';
    saveSettings();
    if (view < 0) put($('.nbSlotR', book), coverSheet());
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
      b.addEventListener('click', () => { showView('book'); view = i; settings.view = i; saveSettings(); renderBook(); });
      box.append(b);
    });
  }

  function showView(v) {
    $('#nbBookView').hidden = v !== 'book';
    $('#nbListView').hidden = v !== 'list';
    $('#nbViewBook').setAttribute('aria-pressed', String(v === 'book'));
    $('#nbViewList').setAttribute('aria-pressed', String(v === 'list'));
    if (v === 'list') renderList(); else requestAnimationFrame(() => { fitViewport(); applyZoom(settings.zoom); });
  }

  // ---------- start ----------
  async function load() {
    applyFocus();
    if (pages) { fitViewport(); renderBook(); return; }
    try { pages = (await db.all()).sort((a, b) => a.created - b.created); } catch (_) { pages = []; }
    view = settings.view >= -1 && settings.view < pages.length ? settings.view : -1;
    viewport = $('#nbViewport');
    book = $('#nbBook');
    bindGestures();
    fitViewport();
    renderBook();
  }

  $('#nbPrev').addEventListener('click', () => go(view - 1));
  $('#nbNext').addEventListener('click', () => go(view + 1));
  $('#nbFinish').addEventListener('click', () => {
    const p = openSheet();
    if (!p || view !== pages.length - 1) return;
    tick();
    p.finishedAt = Date.now();
    p.planas = planasOf(p);
    persist(p, true);
    renderBook();
  });
  $('#nbNew').addEventListener('click', () => {
    if (!openSheet()) addPage();
    go(pages.length - 1);
  });
  $('#nbTools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    settings.tool = b.dataset.tool; saveSettings(); renderBar();
  });
  $('#nbUndo').addEventListener('click', undo);
  $('#nbShadow').addEventListener('click', () => {
    const p = openSheet(), row = p && p.rows[p.active];
    if (!row) return;
    row.shadow = !row.shadow; persist(p); renderBook();
  });
  $('#nbPenOnly').addEventListener('click', () => {
    settings.penOnly = !settings.penOnly; saveSettings(); renderBar();
    flash(settings.penOnly ? 'Pen only: your finger moves the page and only the pen writes.' : 'Finger and pen both write. Use Move or two fingers to move the page.');
  });
  $('#nbZoomIn').addEventListener('click', () => stepZoom(1));
  $('#nbZoomOut').addEventListener('click', () => stepZoom(-1));
  $('#nbZoomFit').addEventListener('click', () => { applyZoom(1); viewport.scrollTo(0, 0); saveSettings(); });
  $('#nbFocus').addEventListener('click', () => { settings.focus = !settings.focus; saveSettings(); applyFocus(); });
  $('#nbViewBook').addEventListener('click', () => showView('book'));
  $('#nbViewList').addEventListener('click', () => showView('list'));
  $('#nbPickQ').addEventListener('input', search);
  $('#nbPickQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#nbResults button')?.click(); });
  $('#nbPickClose').addEventListener('click', closePicker);
  $('#nbPicker').addEventListener('click', (e) => { if (e.target.id === 'nbPicker') closePicker(); });
  ['#nbCoverName', '#nbCoverTitle', '#nbCoverSub', '#nbCoverSeal'].forEach((s) => $(s).addEventListener('input', coverChanged));
  $('#nbSwatches').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (!b) return; settings.cover.color = b.dataset.color; renderSwatches(); coverChanged(); });
  $('#nbCoverDone').addEventListener('click', () => { $('#nbCoverEditor').hidden = true; });
  $('#nbCoverEditor').addEventListener('click', (e) => { if (e.target.id === 'nbCoverEditor') $('#nbCoverEditor').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.page !== 'notebook' || !pages) return;
    if (!$('#nbPicker').hidden || !$('#nbCoverEditor').hidden) { if (e.key === 'Escape') { closePicker(); $('#nbCoverEditor').hidden = true; } return; }
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') go(view + 1);
    if (e.key === 'ArrowLeft') go(view - 1);
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  });
  // Save the writing time when the learner leaves the page or the app.
  const flush = () => { const p = openSheet(); if (p) persist(p, true); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (book && document.body.dataset.page === 'notebook') { fitViewport(); applyZoom(settings.zoom); } }, 120); });

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.page === 'notebook') load();
    else { flush(); last = 0; document.body.classList.remove('nbFocus'); }
  }));
  $('#homeOpenNotebook')?.addEventListener('click', () => { switchPage('notebook'); load(); });
})();
