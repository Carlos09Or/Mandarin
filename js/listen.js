// Listen — hands-free review of one block: the Chinese word is spoken (Hanzi + pinyin on screen),
// a pause to guess the meaning, then the English meaning is spoken and the next word starts.
//
// Two engines:
//  - live:   the device's speech voices (Web Speech API). Needs the screen on: phones stop the
//            browser voice when they lock.
//  - pocket: a recorded track per block (assets/audio/listen, built by tools/build-listen-audio.py).
//            A plain <audio> element keeps playing with the screen locked.
(function () {
  const KEY = 'hsk1ListenV1';
  const TRACKS = 'assets/audio/listen/';
  const st = { blockId: 1, index: 0, pause: 2, repeat: 1, slow: false, shuffle: false, loop: true, mode: 'live' };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} };

  let order = [];
  let playing = false;
  let run = 0;
  let phase = 'idle';
  let wakeLock = null;
  let manifest = null;
  let timerFrame = 0;
  const audio = new Audio();
  audio.preload = 'auto';

  const $ = (s) => document.querySelector(s);
  const block = () => PRACTICE_BLOCKS.find((b) => b.id === +st.blockId) || PRACTICE_BLOCKS[0];
  const word = () => WORDS.find((w) => w.n === order[st.index]);
  const track = () => manifest?.blocks?.[block().id];
  const pocket = () => st.mode === 'pocket' && !!track();

  function shuffled(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function buildOrder() {
    if (pocket()) order = track().cues.map((c) => c.n);
    else order = st.shuffle ? shuffled(block().words) : [...block().words];
    if (st.index >= order.length || st.index < 0) st.index = 0;
  }

  /** "to see, to meet" stays; "I / me" → "I, me"; "you (plural)" → "you, plural". */
  function spokenEnglish(en) {
    return String(en || '')
      .replace(/\s*[\/;]\s*/g, ', ')
      .replace(/\s*\(\s*/g, ', ').replace(/\)/g, '')
      .replace(/…/g, '')
      .replace(/(,\s*)+/g, ', ')
      .replace(/^[,\s]+|[,\s]+$/g, '');
  }

  // ---- live engine ---------------------------------------------------------------------------
  // macOS lists its novelty voices first (Albert, Bahh, Bubbles…), so "first en-US voice" sounds
  // like a robot. Prefer natural voices by name, skip the novelty ones, then fall back by language.
  const PREFERRED = {
    en: ['Ava', 'Zoe', 'Samantha', 'Allison', 'Susan', 'Alex', 'Tom', 'Nicky', 'Karen', 'Daniel', 'Moira', 'Tessa', 'Serena', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny'],
    zh: ['Lili', 'Tingting', 'Yu-shu', 'Google 普通话', 'Microsoft Xiaoxiao', 'Microsoft Yunxi']
  };
  const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|buenas noticias|cellos|deranged|fred|good news|hysterical|jester|junior|kathy|organ|pipe organ|princess|ralph|superstar|trinoids|whisper|wobble|zarvox|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
  const normLang = (v) => (v.lang || '').replace('_', '-').toLowerCase();

  /** Natural voices for a language, best first (enhanced/premium voices rank higher). */
  function voicesFor(lang) {
    const want = lang.toLowerCase();
    const family = want.slice(0, 2);
    const score = (v) => {
      const i = PREFERRED[family]?.findIndex((name) => v.name.startsWith(name)) ?? -1;
      return (normLang(v) === want ? 100 : 0) + (i >= 0 ? 50 - i : 0) + (/enhanced|premium|natural|mejorada/i.test(v.name) ? 60 : 0);
    };
    return speechSynthesis.getVoices()
      .filter((v) => normLang(v).startsWith(family) && !NOVELTY.test(v.name))
      .sort((a, b) => score(b) - score(a));
  }

  /** The voice the learner picked in Listen (by name), or the best natural one. */
  function voiceFor(lang) {
    const chosen = st[lang.startsWith('zh') ? 'zhVoice' : 'enVoice'];
    const list = voicesFor(lang);
    return (chosen && list.find((v) => v.name === chosen)) || list[0];
  }

  function say(text, lang, rate) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !text) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate;
      const v = voiceFor(lang);
      if (v) u.voice = v;
      let done = false;
      // Safety net: some mobile browsers occasionally never fire `end`.
      const guard = setTimeout(() => finish(), 2500 + [...text].length * (lang.startsWith('zh') ? 700 : 160));
      function finish() { if (done) return; done = true; clearTimeout(guard); resolve(); }
      u.onend = finish;
      u.onerror = finish;
      speechSynthesis.speak(u);
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function runTimer(ms) {
    cancelAnimationFrame(timerFrame);
    const bar = $('#lsTimerBar');
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      bar.style.width = `${(1 - p) * 100}%`;
      $('#lsTimerText').textContent = p < 1 ? `${Math.ceil((ms - (now - start)) / 1000)}` : '';
      if (p < 1 && phase === 'think') timerFrame = requestAnimationFrame(tick);
    };
    timerFrame = requestAnimationFrame(tick);
  }

  async function playLive(from) {
    const my = ++run;
    speechSynthesis.cancel();
    playing = true;
    await keepAwake(true);
    st.index = from;
    while (my === run) {
      if (st.index >= order.length) {
        if (!st.loop) break;
        if (st.shuffle) order = shuffled(block().words);
        st.index = 0;
      }
      save();
      const w = word();
      for (let r = 0; r < st.repeat; r++) {
        setPhase('listen');
        await say(baseHanzi(w), 'zh-CN', st.slow ? 0.55 : 0.8);
        if (my !== run) return;
        if (r < st.repeat - 1) await sleep(500);
      }
      setPhase('think');
      runTimer(st.pause * 1000);
      await sleep(st.pause * 1000);
      if (my !== run) return;
      setPhase('meaning');
      await say(spokenEnglish(w.en), 'en-US', st.slow ? 0.85 : 0.95);
      if (my !== run) return;
      await sleep(800);
      if (my !== run) return;
      st.index++;
    }
    if (my === run) stop();
  }

  // ---- pocket engine (recorded track) --------------------------------------------------------
  function cueAt(t) {
    const cues = track().cues;
    let i = 0;
    while (i + 1 < cues.length && cues[i + 1].start <= t + 0.05) i++;
    return i;
  }

  // Tracks are loaded whole into a Blob URL: seeking then works with any static server (Safari
  // refuses to seek media from servers without byte-range support, like `python3 -m http.server`).
  const blobUrls = {};
  const pending = {};
  function prefetch() {
    const t = track();
    if (!t || blobUrls[t.file]) return Promise.resolve();
    pending[t.file] ||= fetch(`${TRACKS}${t.file}?v=${manifest.version || 1}`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then((b) => { blobUrls[t.file] = URL.createObjectURL(b); })
      .finally(() => { delete pending[t.file]; });
    return pending[t.file];
  }

  function playTrack(from) {
    const my = ++run;
    speechSynthesis.cancel();
    const t = track();
    const url = blobUrls[t.file];
    playing = true;
    keepAwake(false);
    if (!url) {
      prefetch().then(() => { if (my === run && playing) playTrack(from); }).catch(() => stop());
      return;
    }
    const at = t.cues[from]?.start || 0;
    audio.loop = st.loop;
    if (audio.src !== url) {
      audio.src = url;
      audio.addEventListener('loadedmetadata', () => { audio.currentTime = at; }, { once: true });
    } else audio.currentTime = at;
    // play() right away (not after an await) so phones still count the tap as the user gesture.
    audio.play().catch(() => stop());
    syncTrack();
  }

  function syncTrack() {
    cancelAnimationFrame(timerFrame);
    if (!pocket()) return;
    const cues = track().cues;
    const t = audio.currentTime;
    const i = cueAt(t);
    const c = cues[i];
    if (i !== st.index) { st.index = i; save(); }
    const p = t < c.thinkAt ? 'listen' : t < c.meaningAt ? 'think' : 'meaning';
    if (p !== phase || $('#lsHanzi').dataset.n !== String(c.n)) setPhase(p);
    if (p === 'think') {
      const total = c.meaningAt - c.thinkAt;
      $('#lsTimerBar').style.width = `${Math.max(0, 1 - (t - c.thinkAt) / total) * 100}%`;
      $('#lsTimerText').textContent = `${Math.ceil(c.meaningAt - t)}`;
    }
    if (playing && !audio.paused) timerFrame = requestAnimationFrame(syncTrack);
  }

  audio.addEventListener('play', () => { playing = true; renderControls(); syncTrack(); });
  audio.addEventListener('pause', () => { if (!audio.ended) { playing = false; renderControls(); } });
  audio.addEventListener('ended', () => stop());

  // ---- shared ---------------------------------------------------------------------------------
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (_) { wakeLock = null; }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && playing && !pocket()) keepAwake(true);
  });

  function play(from = st.index) {
    renderOptions();
    if (pocket()) playTrack(from); else playLive(from);
    renderControls();
    mediaSession();
  }

  function stop() {
    ++run;
    playing = false;
    speechSynthesis.cancel();
    audio.pause();
    cancelAnimationFrame(timerFrame);
    keepAwake(false);
    setPhase('idle');
    renderControls();
  }

  function jump(delta) {
    const next = (st.index + delta + order.length) % order.length;
    if (playing) play(next);
    else { st.index = next; save(); setPhase('idle'); }
  }

  function mediaSession() {
    if (!('mediaSession' in navigator)) return;
    const b = block();
    navigator.mediaSession.metadata = new MediaMetadata({ title: `Block ${b.id} · ${b.title}`, artist: 'HSK 1 Listen', album: 'Mandarin Cards' });
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch (_) {} };
    set('play', () => play());
    set('pause', () => stop());
    set('previoustrack', () => jump(-1));
    set('nexttrack', () => jump(1));
  }

  // ---- rendering ------------------------------------------------------------------------------
  function setPhase(p) {
    phase = p;
    const w = word();
    if (!w) return;
    const hz = $('#lsHanzi');
    hz.textContent = baseHanzi(w);
    hz.dataset.n = String(w.n);
    $('#lsPinyin').textContent = w.pinyin;
    const shown = p === 'meaning' || p === 'idle';
    const meaning = $('#lsMeaning');
    meaning.textContent = shown ? w.en : '?';
    meaning.classList.toggle('hidden', !shown);
    $('#lsCount').textContent = `${st.index + 1} / ${order.length}`;
    $('#lsProgress').style.width = `${((st.index + 1) / order.length) * 100}%`;
    document.querySelectorAll('#lsPhases [data-phase]').forEach((el) => el.classList.toggle('active', el.dataset.phase === p));
    if (p !== 'think') { $('#lsTimerBar').style.width = '0%'; $('#lsTimerText').textContent = ''; }
    document.querySelectorAll('#lsList li').forEach((li) => li.classList.toggle('current', +li.dataset.i === st.index));
    // Keep the current word visible by scrolling the list itself, never the page (the learner
    // is looking at the Hanzi above).
    const list = $('#lsList'), li = $('#lsList li.current');
    if (li) {
      const lr = list.getBoundingClientRect(), ir = li.getBoundingClientRect();
      if (ir.top < lr.top) list.scrollTop -= lr.top - ir.top;
      else if (ir.bottom > lr.bottom) list.scrollTop += ir.bottom - lr.bottom;
    }
  }

  function renderControls() {
    const btn = $('#lsPlay');
    btn.textContent = playing ? '❚❚' : '▶';
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('#listen').classList.toggle('lsPlaying', playing);
  }

  function renderOptions() {
    const hasTrack = !!track();
    const live = !pocket();
    document.querySelectorAll('#lsPause button').forEach((b) => b.classList.toggle('active', +b.dataset.pause === st.pause));
    document.querySelectorAll('#lsRepeat button').forEach((b) => b.classList.toggle('active', +b.dataset.repeat === st.repeat));
    $('#lsSlow').classList.toggle('active', st.slow);
    $('#lsShuffle').classList.toggle('active', st.shuffle);
    $('#lsLoop').classList.toggle('active', st.loop);
    document.querySelectorAll('#lsMode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === (pocket() ? 'pocket' : 'live')));
    $('#lsMode [data-mode="pocket"]').disabled = !hasTrack;
    document.querySelectorAll('.lsLiveOnly button, .lsLiveOnly select').forEach((b) => { b.disabled = !live; });
    $('#lsNote').textContent = pocket()
      ? `Recorded track: keeps playing with the screen locked. Pause ${manifest.pause || 2} s, fixed order. Voices: ${manifest.zhVoice || '?'} / ${manifest.enVoice || '?'}.`
      : hasTrack
        ? 'Device voice: keep the screen on (the app asks the phone not to sleep).'
        : 'Device voice: keep the screen on — phones stop the browser voice when they lock. Pocket mode needs the recorded tracks.';
  }

  function renderVoices() {
    if (!('speechSynthesis' in window)) return;
    [['#lsEnVoice', 'en-US', 'enVoice'], ['#lsZhVoice', 'zh-CN', 'zhVoice']].forEach(([sel, lang, key]) => {
      const list = voicesFor(lang);
      const best = list[0];
      $(sel).innerHTML = `<option value="">Auto${best ? ` (${escapeHtml(best.name)})` : ''}</option>` +
        list.map((v) => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)} · ${escapeHtml(v.lang)}</option>`).join('');
      $(sel).value = list.some((v) => v.name === st[key]) ? st[key] : '';
    });
  }

  function render() {
    const sel = $('#lsBlock');
    if (!sel.options.length) sel.innerHTML = PRACTICE_BLOCKS.map((b) => `<option value="${b.id}">${b.id} · ${escapeHtml(b.title)}</option>`).join('');
    sel.value = String(block().id);
    buildOrder();
    $('#lsList').innerHTML = order.map((n, i) => {
      const w = WORDS.find((x) => x.n === n);
      return `<li data-i="${i}"><b>${escapeHtml(baseHanzi(w))}</b><span>${escapeHtml(w.pinyin)}</span><em>${escapeHtml(w.en)}</em></li>`;
    }).join('');
    renderOptions();
    renderControls();
    setPhase(playing ? phase : 'idle');
    if (pocket()) prefetch().catch(() => {});
  }

  function changeSetting(fn) {
    const wasPlaying = playing;
    if (wasPlaying) stop();
    fn();
    save();
    render();
    if (wasPlaying) play();
  }

  // ---- events ---------------------------------------------------------------------------------
  $('#lsPlay').addEventListener('click', () => (playing ? stop() : play()));
  $('#lsPrev').addEventListener('click', () => jump(-1));
  $('#lsNext').addEventListener('click', () => jump(1));
  $('#lsBlock').addEventListener('change', (e) => changeSetting(() => { st.blockId = +e.target.value; st.index = 0; }));
  $('#lsPause').addEventListener('click', (e) => { const b = e.target.closest('[data-pause]'); if (b) changeSetting(() => { st.pause = +b.dataset.pause; }); });
  $('#lsRepeat').addEventListener('click', (e) => { const b = e.target.closest('[data-repeat]'); if (b) changeSetting(() => { st.repeat = +b.dataset.repeat; }); });
  $('#lsSlow').addEventListener('click', () => changeSetting(() => { st.slow = !st.slow; }));
  $('#lsShuffle').addEventListener('click', () => changeSetting(() => { st.shuffle = !st.shuffle; st.index = 0; }));
  $('#lsLoop').addEventListener('click', () => changeSetting(() => { st.loop = !st.loop; }));
  $('#lsMode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b && !b.disabled) changeSetting(() => { st.mode = b.dataset.mode; st.index = 0; });
  });
  $('#lsEnVoice').addEventListener('change', (e) => { st.enVoice = e.target.value; save(); });
  $('#lsZhVoice').addEventListener('change', (e) => { st.zhVoice = e.target.value; save(); });
  $('#lsEnTest').addEventListener('click', () => { if (playing) stop(); speechSynthesis.cancel(); say('Hello! This is the voice for the English meanings.', 'en-US', st.slow ? 0.85 : 0.95); });
  $('#lsZhTest').addEventListener('click', () => { if (playing) stop(); speechSynthesis.cancel(); say('你好！我是你的中文老师。', 'zh-CN', st.slow ? 0.55 : 0.8); });
  $('#lsList').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    if (playing) play(+li.dataset.i);
    else { st.index = +li.dataset.i; save(); setPhase('idle'); }
  });
  document.querySelectorAll('.tab[data-page="listen"]').forEach((t) => t.addEventListener('click', render));
  $('#homeOpenListen')?.addEventListener('click', () => { switchPage('listen'); render(); });

  fetch(`${TRACKS}manifest.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => { manifest = m; if (!playing) render(); })
    .catch(() => {});

  if ('speechSynthesis' in window) {
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener?.('voiceschanged', renderVoices);
  }
  renderVoices();
  render();
})();
