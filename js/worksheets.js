// Worksheets: one sheet = many repetitions of ONE Hanzi in a single large writing box.
// The first boxes trace the model; the rest are written from memory. A memory box with
// 3+ mistakes makes the next box a tracing box again.
//
// Depends on globals from js/app-v13-19.js (loaded first): WORDS, PRACTICE_BLOCKS,
// practiceChars, baseHanzi, buildCharInfo, speak, escapeHtml, switchPage, writeIndex, charIndex.
(function () {
  const STORAGE_KEY = 'hsk1WorksheetV1';
  const TRACE_BOXES = 3;
  const SIZES = [10, 20, 30, 50];
  const DEFAULT_SIZE = 20;
  const REMODEL_AFTER_MISTAKES = 3;
  const SKIPPED = -1;

  const el = id => document.getElementById(id);
  const page = el('worksheets');
  if (!page) return;

  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  })();

  const state = {
    blockId: saved.blockId || 1,
    char: saved.char || null,
    size: SIZES.includes(saved.size) ? saved.size : DEFAULT_SIZE,
    results: Array.isArray(saved.results) ? saved.results : [],
    extraTrace: Array.isArray(saved.extraTrace) ? saved.extraTrace : [],
    progress: saved.progress || {},
    // 'strict' = official stroke order (Hanzi Writer quiz); 'free' = any order, any direction.
    order: saved.order === 'free' ? 'free' : 'strict',
  };

  let writer = null;
  let freeQuiz = null;
  const charData = new Map();
  let writerChar = null;
  let writerSize = 0;
  let curStroke = 0;
  let boxMistakes = 0;
  let session = 0;

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- Data ----------

  function blockById(id) {
    return PRACTICE_BLOCKS.find(b => b.id === id) || PRACTICE_BLOCKS[0];
  }

  /** Unique characters of a block, in word order. */
  function blockChars(blockId) {
    const out = [];
    for (const n of blockById(blockId).words) {
      const w = WORDS[n - 1];
      if (!w) continue;
      for (const ch of practiceChars(w)) if (!out.includes(ch)) out.push(ch);
    }
    return out;
  }

  function blockOfChar(ch) {
    return PRACTICE_BLOCKS.find(b => b.words.some(n => WORDS[n - 1] && practiceChars(WORDS[n - 1]).includes(ch)));
  }

  function wordOfChar(ch) {
    const block = blockById(state.blockId);
    const inBlock = block.words.map(n => WORDS[n - 1]).find(w => w && practiceChars(w).includes(ch));
    return inBlock || WORDS.find(w => practiceChars(w).includes(ch));
  }

  const isTrace = i => i < TRACE_BOXES || state.extraTrace.includes(i);
  const currentBox = () => state.results.findIndex(r => r === undefined || r === null);

  // ---------- Sheet lifecycle ----------

  function startSheet(ch = state.char) {
    state.char = ch;
    state.results = Array(state.size).fill(null);
    state.extraTrace = [];
    persist();
    render();
  }

  function ensureSheet() {
    const chars = blockChars(state.blockId);
    if (!state.char || !chars.includes(state.char)) {
      state.char = chars[0];
      state.results = [];
    }
    if (state.results.length !== state.size) {
      state.results = Array(state.size).fill(null);
      state.extraTrace = [];
    }
    persist();
  }

  function completeBox(mistakes) {
    const box = currentBox();
    if (box === -1) return;
    state.results[box] = mistakes;
    if (mistakes >= REMODEL_AFTER_MISTAKES && !isTrace(box) && box + 1 < state.size && !state.extraTrace.includes(box + 1)) {
      state.extraTrace.push(box + 1);
      setStatus('Next box shows the model again');
    }
    if (currentBox() === -1) finishSheet();
    persist();
    render();
  }

  function finishSheet() {
    const written = state.results.filter(r => r >= 0);
    const memory = state.results.map((r, i) => [r, i]).filter(([r, i]) => r >= 0 && !isTrace(i));
    const p = state.progress[state.char] || { sheets: 0, boxes: 0, perfectMemory: 0, memoryBoxes: 0 };
    p.sheets += 1;
    p.boxes += written.length;
    p.memoryBoxes += memory.length;
    p.perfectMemory += memory.filter(([r]) => r === 0).length;
    p.lastAt = Date.now();
    state.progress[state.char] = p;
  }

  // ---------- Writer (one Hanzi Writer instance per sheet, reused for every box) ----------

  function writerOptions(size) {
    return {
      width: size,
      height: size,
      padding: Math.max(16, Math.round(size * 0.07)),
      showCharacter: false,
      showOutline: true,
      strokeColor: '#4e1217',
      outlineColor: '#eadbd8',
      drawingColor: '#b72d36',
      highlightColor: '#df7c83',
      highlightCompleteColor: '#2f7d59',
      drawingWidth: Math.max(8, Math.round(size * 0.035)),
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 260,
    };
  }

  function ensureWriter() {
    const host = el('wsWriter');
    if (typeof HanziWriter === 'undefined') {
      setStatus('Hanzi Writer could not load. Check your Internet connection and reload the page.');
      return false;
    }
    const size = Math.round(el('wsBig').getBoundingClientRect().width);
    if (!size) return false;
    if (writer && writerChar === state.char && Math.abs(writerSize - size) < 2) return true;
    stopFreeQuiz();
    host.replaceChildren();
    writer = HanziWriter.create(host, state.char, writerOptions(size));
    writerChar = state.char;
    writerSize = size;
    return true;
  }

  function loadCharData(ch) {
    if (!charData.has(ch)) charData.set(ch, HanziWriter.loadCharacterData(ch));
    return charData.get(ch);
  }

  function stopFreeQuiz() {
    freeQuiz?.destroy();
    freeQuiz = null;
  }

  /** Free order: any stroke order and direction, recognized by js/free-order-quiz.js. */
  async function startFreeBox(s, trace) {
    writer.cancelQuiz();
    writer.hideCharacter();
    writer.hideOutline();
    setStatus(trace ? 'Trace the model — any stroke order' : 'Write it from memory — any stroke order');
    let data;
    try {
      data = await loadCharData(state.char);
    } catch {
      setStatus('Could not load the stroke data. Check your connection.');
      return;
    }
    if (s !== session) return;
    stopFreeQuiz();
    freeQuiz = new FreeOrderQuiz(el('wsWriter'), data, {
      size: writerSize,
      padding: writerOptions(writerSize).padding,
      showOutline: trace,
      leniency: trace ? 1.15 : 1,
      onMistake: d => {
        if (s !== session) return;
        boxMistakes = d.totalMistakes;
        setStatus('That stroke doesn’t match any missing stroke — try again');
      },
      onCorrectStroke: d => {
        if (s !== session) return;
        setStatus(d.strokesRemaining ? `Good · ${d.strokesRemaining} stroke${d.strokesRemaining > 1 ? 's' : ''} left` : 'Last stroke ✓');
      },
      onComplete: d => {
        if (s !== session) return;
        setTimeout(() => s === session && completeBox(d.totalMistakes), 450);
      },
    });
  }

  function startBox() {
    const box = currentBox();
    if (box === -1 || !ensureWriter()) return;
    const s = ++session;
    const trace = isTrace(box);
    curStroke = 0;
    boxMistakes = 0;
    stopFreeQuiz();
    if (state.order === 'free') {
      startFreeBox(s, trace);
      return;
    }
    writer.cancelQuiz();
    writer.hideCharacter();
    if (trace) writer.showOutline();
    else writer.hideOutline();
    setStatus(trace ? 'Trace the model' : 'Write it from memory');
    writer.quiz({
      showHintAfterMisses: trace ? 1 : 3,
      acceptBackwardsStrokes: false,
      leniency: 0.85,
      highlightOnComplete: true,
      onMistake: d => {
        if (s !== session) return;
        boxMistakes = d.totalMistakes;
        setStatus(trace ? 'Follow the highlighted stroke' : `Stroke ${d.strokeNum + 1} doesn’t match — try again`);
      },
      onCorrectStroke: d => {
        if (s !== session) return;
        curStroke = d.strokeNum + 1;
        setStatus(d.strokesRemaining ? 'Good, keep going' : 'Last stroke ✓');
      },
      onComplete: d => {
        if (s !== session) return;
        setTimeout(() => s === session && completeBox(d.totalMistakes), 450);
      },
    });
  }

  // The status line has a fixed height in CSS: nothing above the box may change size while writing.
  function setStatus(text) {
    el('wsStatus').textContent = text;
  }

  // ---------- Rendering ----------

  function render() {
    if (!page.classList.contains('active')) return;
    ensureSheet();
    const chars = blockChars(state.blockId);

    el('wsBlock').innerHTML = PRACTICE_BLOCKS.map(b => `<option value="${b.id}" ${b.id === state.blockId ? 'selected' : ''}>Block ${b.id} · ${escapeHtml(b.title)}</option>`).join('');
    el('wsChips').innerHTML = chars.map(ch => `<button type="button" role="tab" class="wsChip ${ch === state.char ? 'active' : ''} ${state.progress[ch]?.sheets ? 'done' : ''}" aria-selected="${ch === state.char}" data-char="${escapeHtml(ch)}">${escapeHtml(ch)}</button>`).join('');
    el('wsChips').querySelector('.wsChip.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    const info = buildCharInfo(state.char);
    const word = wordOfChar(state.char);
    el('wsHanzi').textContent = state.char;
    el('wsPinyin').textContent = info.pinyin || word?.pinyin || '';
    const fromWord = word && practiceChars(word).length > 1 ? ` · from ${baseHanzi(word)} (${word.pinyin}, ${word.en})` : '';
    el('wsMeaning').textContent = `${info.meaning}${fromWord}`;
    el('wsSheetChar').textContent = state.char;

    const box = currentBox();
    const finished = box === -1;
    el('wsWork').hidden = finished;
    el('wsSummary').hidden = !finished;
    renderMinis();
    renderSizes();
    if (finished) {
      renderSummary(chars);
      return;
    }
    const trace = isTrace(box);
    el('wsPhase').textContent = trace ? 'Trace' : 'From memory';
    el('wsPhase').className = `wsPill ${trace ? '' : 'memory'}`;
    el('wsBoxInfo').textContent = `Box ${box + 1} of ${state.size}`;
    requestAnimationFrame(startBox);
  }

  function renderMinis() {
    const box = currentBox();
    const done = state.results.filter(r => r !== null && r !== undefined && r !== SKIPPED).length;
    el('wsCount').textContent = `${done}/${state.size} boxes`;
    el('wsMinis').innerHTML = state.results.map((r, i) => {
      const cls = ['wsMini', isTrace(i) ? 'trace' : '', i === box ? 'current' : '', r > 0 ? 'mistakes' : '', r === SKIPPED ? 'skipped' : ''].join(' ');
      const label = r === SKIPPED ? 'skipped' : r === null || r === undefined ? 'empty' : r === 0 ? 'perfect' : `${r} mistakes`;
      return `<button type="button" class="${cls}" data-box="${i}" aria-label="Box ${i + 1}: ${label}">${r === SKIPPED ? '–' : r !== null && r !== undefined ? escapeHtml(state.char) : ''}</button>`;
    }).join('');
  }

  function renderSizes() {
    el('wsSizes').querySelectorAll('button').forEach(b => {
      const on = +b.dataset.size === state.size;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });
    el('wsOrderMode').querySelectorAll('button').forEach(b => {
      const on = b.dataset.order === state.order;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  function renderSummary(chars) {
    const written = state.results.filter(r => r >= 0);
    const perfect = written.filter(r => r === 0).length;
    const memory = state.results.map((r, i) => [r, i]).filter(([r, i]) => r >= 0 && !isTrace(i));
    const memoryPct = memory.length ? Math.round((memory.filter(([r]) => r === 0).length / memory.length) * 100) : 0;
    const nextChar = chars.slice(chars.indexOf(state.char) + 1).find(ch => !state.progress[ch]?.sheets) || chars[chars.indexOf(state.char) + 1];
    el('wsSummary').innerHTML = `
      <span class="wsSummaryHanzi">${escapeHtml(state.char)}</span>
      <h2>Sheet complete</h2>
      <div class="wsStats">
        <div class="wsStat"><b>${written.length}</b>boxes written</div>
        <div class="wsStat"><b>${perfect}</b>without mistakes</div>
        <div class="wsStat"><b>${memoryPct}%</b>perfect from memory</div>
      </div>
      <div class="wsControls">
        <button type="button" class="wsBtn" id="wsAgain">Another sheet of ${escapeHtml(state.char)}</button>
        ${nextChar ? `<button type="button" class="wsBtn primary" id="wsNext">Next: ${escapeHtml(nextChar)} →</button>` : ''}
      </div>`;
    el('wsAgain').onclick = () => startSheet(state.char);
    if (nextChar) el('wsNext').onclick = () => startSheet(nextChar);
  }

  // ---------- Events ----------

  el('wsBlock').addEventListener('change', e => {
    state.blockId = +e.target.value;
    state.char = blockChars(state.blockId)[0];
    startSheet(state.char);
  });
  el('wsChips').addEventListener('click', e => {
    const chip = e.target.closest('.wsChip');
    if (chip && chip.dataset.char !== state.char) startSheet(chip.dataset.char);
  });
  el('wsSizes').addEventListener('click', e => {
    const b = e.target.closest('button[data-size]');
    if (!b || +b.dataset.size === state.size) return;
    state.size = +b.dataset.size;
    startSheet(state.char);
  });
  el('wsOrderMode').addEventListener('click', e => {
    const b = e.target.closest('button[data-order]');
    if (!b || b.dataset.order === state.order) return;
    state.order = b.dataset.order;
    persist();
    renderSizes();
    startBox(); // restart the current box in the new mode; finished boxes are kept
  });
  el('wsMinis').addEventListener('click', e => {
    const b = e.target.closest('.wsMini');
    if (!b) return;
    // Rewrite a box: clear it; writing resumes at the first empty box.
    state.results[+b.dataset.box] = null;
    persist();
    render();
  });
  el('wsSpeak').addEventListener('click', () => speak(state.char, true));
  el('wsHint').addEventListener('click', () => (freeQuiz ? freeQuiz.hint() : writer && writer.highlightStroke(curStroke)));
  el('wsSkip').addEventListener('click', () => {
    session++;
    writer?.cancelQuiz();
    completeBox(SKIPPED);
  });
  el('wsOrder').addEventListener('click', () => {
    if (!ensureWriter()) return;
    const s = ++session;
    stopFreeQuiz();
    writer.cancelQuiz();
    writer.showOutline();
    setStatus('Watch the stroke order');
    writer.animateCharacter({ onComplete: () => setTimeout(() => s === session && startBox(), 500) });
  });

  // Recreate the writer at the new size when the box changes size (rotation, window resize).
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!page.classList.contains('active') || currentBox() === -1) return;
      const size = Math.round(el('wsBig').getBoundingClientRect().width);
      if (Math.abs(size - writerSize) >= 2) startBox();
    }, 200);
  });

  // The app's own tab handler shows the page; render it afterwards.
  document.querySelectorAll('.tab[data-page="worksheets"]').forEach(t => t.addEventListener('click', render));

  /** Opens a worksheet for a character (from Write Hanzi or a card). */
  window.openWorksheet = function (ch) {
    if (!ch) return;
    const block = blockOfChar(ch);
    if (block) state.blockId = block.id;
    switchPage('worksheets');
    if (state.char !== ch || currentBox() === -1) startSheet(ch);
    else render();
  };

  el('homeOpenWorksheets')?.addEventListener('click', () => {
    switchPage('worksheets');
    render();
  });

  // Character Explorer (tap the Hanzi on a card): add a «Worksheet» button to each character.
  // Injected when app-v13-19.js re-renders the explorer, so that file stays untouched.
  const explorer = el('characterExplorerContent');
  if (explorer) {
    new MutationObserver(() => {
      explorer.querySelectorAll('.characterDetailCard').forEach(card => {
        const meta = card.querySelector('.characterDetailMeta');
        const ch = card.querySelector('.characterDetailGlyph')?.textContent.trim();
        if (!meta || !ch || meta.querySelector('.wsExplorerBtn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wsBtn wsExplorerBtn';
        btn.textContent = `▦ Worksheet of ${ch}`;
        btn.addEventListener('click', () => {
          if (typeof closeCharacterExplorer === 'function') closeCharacterExplorer();
          window.openWorksheet(ch);
        });
        meta.appendChild(btn);
      });
    }).observe(explorer, { childList: true });
  }

  el('wsFromWrite')?.addEventListener('click', () => {
    const chars = practiceChars(WORDS[writeIndex]);
    window.openWorksheet(chars[charIndex] || chars[0]);
  });
})();
