// Content — one video per unit (js/content-data.js), with loop, playback speed, and the unit's
// words below the player: the current word is highlighted and tapping a word jumps to it.
(function () {
  const KEY = 'hsk1ContentV1';
  const UNITS = window.CONTENT_UNITS || [];
  const SPEEDS = [1, 1.5, 1.75, 2];
  const st = { unit: 1, speed: 1, loop: false, positions: {}, watched: {} };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} };

  const $ = (s) => document.querySelector(s);
  const video = $('#ctVideo');
  const unit = () => UNITS.find((u) => u.id === st.unit) || UNITS[0];
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  let current = -1;
  let lastSaved = 0;

  function wordAt(t) {
    const words = unit().words;
    let i = -1;
    while (i + 1 < words.length && words[i + 1].t <= t + 0.05) i++;
    return i;
  }

  function applySpeed() {
    video.defaultPlaybackRate = st.speed;
    video.playbackRate = st.speed;
  }

  // The video is loaded whole into a Blob URL so jumping to a word works with any static server
  // (without byte-range support, like `python3 -m http.server`, browsers cannot seek, and iPhone
  // Safari may not play the file at all). Each unit is 1–3 MB.
  let loadedUnit = null;
  let blobUrl = null;
  let loading = 0;

  async function load(autoplay = false) {
    const u = unit();
    video.loop = st.loop;
    render();
    if (loadedUnit === u.id) return;
    const my = ++loading;
    $('#ctPlayer').classList.add('isLoading');
    try {
      const blob = await (await fetch(u.file)).blob();
      if (my !== loading) return;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob);
      loadedUnit = u.id;
      video.addEventListener('loadedmetadata', () => {
        applySpeed();
        const resume = st.positions[u.id] || 0;
        if (resume > 1 && resume < video.duration - 2) video.currentTime = resume;
        if (autoplay) video.play().catch(() => {});
        highlight();
      }, { once: true });
      video.src = blobUrl;
    } catch (_) {
      if (my === loading) video.src = u.file;
    } finally {
      if (my === loading) $('#ctPlayer').classList.remove('isLoading');
    }
  }

  function renderUnits() {
    $('#ctUnits').innerHTML = UNITS.map((u) => `
      <button class="ctUnit ${u.id === st.unit ? 'active' : ''} ${st.watched[u.id] ? 'done' : ''}" type="button" data-unit="${u.id}">
        <span class="ctUnitNum">${u.id}</span>
        <span class="ctUnitText"><b>${escapeHtml(u.title)}</b><small>${escapeHtml(u.titleZh)} · ${u.words.length} words · ${clock(u.duration)}</small></span>
      </button>`).join('');
    $('#ctUnitSelect').innerHTML = UNITS.map((u) => `<option value="${u.id}">${u.id} · ${escapeHtml(u.title)} (${escapeHtml(u.titleZh)})</option>`).join('');
    $('#ctUnitSelect').value = String(st.unit);
  }

  function renderWords() {
    current = -1;
    $('#ctWords').innerHTML = unit().words.map((w, i) => `
      <li data-i="${i}"><b>${escapeHtml(w.hanzi)}</b><span>${escapeHtml(w.pinyin)}</span><em>${escapeHtml(w.en)}</em></li>`).join('');
  }

  function renderControls() {
    document.querySelectorAll('#ctSpeeds button').forEach((b) => b.classList.toggle('active', +b.dataset.speed === st.speed));
    $('#ctLoop').classList.toggle('active', st.loop);
    $('#ctLoop').setAttribute('aria-pressed', String(st.loop));
  }

  function render() {
    const u = unit();
    $('#ctTitle').textContent = `Unit ${u.id} · ${u.title}`;
    $('#ctTitleZh').textContent = `${u.titleZh} · ${u.words.length} words`;
    $('#ctPrev').disabled = u.id === UNITS[0].id;
    $('#ctNext').disabled = u.id === UNITS[UNITS.length - 1].id;
    renderUnits();
    renderWords();
    renderControls();
    highlight();
  }

  function highlight() {
    const i = wordAt(video.currentTime || 0);
    if (i === current) return;
    current = i;
    document.querySelectorAll('#ctWords li').forEach((li) => li.classList.toggle('current', +li.dataset.i === i));
    // Scroll the word list itself, never the page: the learner is watching the video.
    const list = $('#ctWords'), li = list.querySelector('li.current');
    if (li) {
      const lr = list.getBoundingClientRect(), ir = li.getBoundingClientRect();
      if (ir.top < lr.top) list.scrollTop -= lr.top - ir.top;
      else if (ir.bottom > lr.bottom) list.scrollTop += ir.bottom - lr.bottom;
    }
  }

  function selectUnit(id, autoplay) {
    if (id === st.unit) return;
    st.positions[st.unit] = video.currentTime || 0;
    st.unit = id;
    save();
    load(autoplay);
  }

  video.addEventListener('timeupdate', () => {
    if (loadedUnit !== st.unit) return;
    highlight();
    if (Math.abs(video.currentTime - lastSaved) > 2) {
      lastSaved = video.currentTime;
      st.positions[st.unit] = video.currentTime;
      save();
    }
  });
  video.addEventListener('ended', () => {
    st.watched[st.unit] = true;
    st.positions[st.unit] = 0;
    save();
    renderUnits();
  });
  // Looping never fires `ended`; count the unit as watched when it wraps around.
  video.addEventListener('seeked', () => {
    if (st.loop && video.currentTime < 0.5 && lastSaved > video.duration - 3 && !st.watched[st.unit]) {
      st.watched[st.unit] = true;
      save();
      renderUnits();
    }
  });
  video.addEventListener('ratechange', () => {
    if (video.playbackRate !== st.speed && SPEEDS.includes(video.playbackRate)) { st.speed = video.playbackRate; save(); renderControls(); }
  });

  $('#ctUnits').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]');
    if (b) selectUnit(+b.dataset.unit, !video.paused);
  });
  $('#ctUnitSelect').addEventListener('change', (e) => selectUnit(+e.target.value, !video.paused));
  $('#ctPrev').addEventListener('click', () => selectUnit(st.unit - 1, !video.paused));
  $('#ctNext').addEventListener('click', () => selectUnit(st.unit + 1, !video.paused));
  $('#ctSpeeds').addEventListener('click', (e) => {
    const b = e.target.closest('[data-speed]');
    if (!b) return;
    st.speed = +b.dataset.speed;
    applySpeed();
    save();
    renderControls();
  });
  $('#ctLoop').addEventListener('click', () => {
    st.loop = !st.loop;
    video.loop = st.loop;
    save();
    renderControls();
  });
  $('#ctWords').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li || loadedUnit !== st.unit) return;
    video.currentTime = unit().words[+li.dataset.i].t;
    video.play().catch(() => {});
  });

  document.querySelectorAll('.tab[data-page="content"]').forEach((t) => t.addEventListener('click', () => load()));
  $('#homeOpenContent')?.addEventListener('click', () => { switchPage('content'); load(); });
  // Leaving the page pauses the video.
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { if (t.dataset.page !== 'content') video.pause(); }));

  // The video itself is only fetched when the Content page is opened.
  if (UNITS.length) render();
})();
