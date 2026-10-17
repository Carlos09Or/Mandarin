const WORDS = window.WORDS || [];
const META = window.LEARNING_META || {};
const CHAR_GLOSSES = window.CHAR_GLOSSES || {};
const CHAR_DETAILS = window.CHAR_DETAILS || {};
const RADICAL_HINTS = window.RADICAL_HINTS || {};
const PRACTICE_BLOCKS = window.PRACTICE_BLOCKS || [];

WORDS.forEach(w => {
  const m = META[w.n] || {};
  w.en = m.en || w.es || '';
  w.explanation = m.explanation || `A common HSK 1 word meaning “${w.en}”.`;
  w.example = m.example || { hanzi: w.hanzi, pinyin: w.pinyin, en: w.en };
});

let written = JSON.parse(localStorage.getItem('hsk1Written150') || '{}');
let writeIndex = +(localStorage.getItem('hsk1WriteIndex') || 0);
if (writeIndex < 0 || writeIndex >= WORDS.length) writeIndex = 0;
let cardIndex = +(localStorage.getItem('hsk1CardIndex') || 0);
if (cardIndex < 0 || cardIndex >= WORDS.length) cardIndex = 0;
let savedCardScope = null;
try { savedCardScope = JSON.parse(localStorage.getItem('hsk1CardScopeV6') || 'null'); } catch (_) { savedCardScope = null; }
const legacyCardScopeBlockId = +(localStorage.getItem('hsk1CardScopeBlock') || 0) || null;
let cardScope = savedCardScope || (legacyCardScopeBlockId ? { type: 'block', id: legacyCardScopeBlockId } : { type: 'all' });
let explorerMode = { type: 'all' };
let explorerQuery = '';
let charIndex = 0;
let openTool = null;
let cardFace = localStorage.getItem('hsk1CardFaceV9') === 'back' ? 'back' : 'front';

let practiceStats = JSON.parse(localStorage.getItem('hsk1PracticeStatsV5') || localStorage.getItem('hsk1PracticeStatsV4') || '{}');
let practiceMistakes = JSON.parse(localStorage.getItem('hsk1PracticeMistakesV5') || localStorage.getItem('hsk1PracticeMistakesV4') || '{}');
let selectedBlockId = +(localStorage.getItem('hsk1PracticeBlock') || 1);
if (!PRACTICE_BLOCKS.some(b => b.id === selectedBlockId)) selectedBlockId = PRACTICE_BLOCKS[0]?.id || 1;
let exerciseSession = null;
let exerciseQuestion = null;

const VALID_PRACTICE_MODES = ['mixed', 'meaning', 'listening', 'hanziPinyin', 'typeHanzi', 'buildSentence', 'mistakes'];
let selectedPracticeMode = localStorage.getItem('hsk1SelectedPracticeModeV10') || 'mixed';
if (!VALID_PRACTICE_MODES.includes(selectedPracticeMode)) selectedPracticeMode = 'mixed';


const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function save() {
  localStorage.setItem('hsk1Written150', JSON.stringify(written));
  localStorage.setItem('hsk1WriteIndex', String(writeIndex));
  localStorage.setItem('hsk1CardIndex', String(cardIndex));
  localStorage.setItem('hsk1CardScopeV6', JSON.stringify(cardScope));
  localStorage.removeItem('hsk1CardScopeBlock');
  localStorage.setItem('hsk1PracticeStatsV5', JSON.stringify(practiceStats));
  localStorage.setItem('hsk1PracticeMistakesV5', JSON.stringify(practiceMistakes));
  localStorage.setItem('hsk1PracticeBlock', String(selectedBlockId));
  localStorage.setItem('hsk1SelectedPracticeModeV10', selectedPracticeMode);
  localStorage.setItem('hsk1CardFaceV9', cardFace);
  updateStats();
}

function speak(text, slow = false) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[（）]/g, ' '));
  u.lang = 'zh-CN';
  u.rate = slow ? 0.62 : 0.78;
  const zh = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('zh'));
  if (zh) u.voice = zh;
  speechSynthesis.speak(u);
}

function practiceChars(word) {
  const base = word.hanzi.split('（')[0];
  return [...base].filter(ch => /\p{Script=Han}/u.test(ch));
}

function baseHanzi(word) {
  return word.hanzi.split('（')[0];
}

function wordByN(n) {
  return WORDS.find(w => w.n === +n);
}

function blockById(id) {
  return PRACTICE_BLOCKS.find(b => b.id === +id);
}

function blockForWord(n) {
  return PRACTICE_BLOCKS.find(b => b.words.includes(+n));
}

function componentMeaning(part) {
  return RADICAL_HINTS[part] || CHAR_GLOSSES[part] || 'component';
}

const CHAR_PINYIN = {};
WORDS.forEach(w => {
  const chars = practiceChars(w);
  if (chars.length === 1 && w.pinyin && !CHAR_PINYIN[chars[0]]) CHAR_PINYIN[chars[0]] = w.pinyin;
});

function buildCharInfo(ch) {
  const detail = CHAR_DETAILS[ch] || {};
  return {
    char: ch,
    pinyin: detail.pinyin || CHAR_PINYIN[ch] || '',
    meaning: detail.meaning || CHAR_GLOSSES[ch] || 'meaning clue',
    radical: detail.radical || '',
    components: Array.isArray(detail.components) ? detail.components : [],
    clue: detail.clue || `${ch} contributes the idea “${CHAR_GLOSSES[ch] || 'this meaning clue'}” in this word.`
  };
}

function syncCardFlipHeight() {
  const stage = $('#cardFlipStage');
  const front = $('#cardFrontFace');
  const back = $('#cardBackFace');
  if (!stage || !front || !back) return;

  requestAnimationFrame(() => {
    const height = Math.max(front.scrollHeight, back.scrollHeight);
    stage.style.height = `${height}px`;
  });
}

function setCardFace(face, animate = true) {
  cardFace = face === 'back' ? 'back' : 'front';
  save();

  const stage = $('#cardFlipStage');
  if (!stage) return;

  if (!animate) stage.classList.add('noFlipTransition');
  stage.classList.toggle('isFlipped', cardFace === 'back');
  syncCardFlipHeight();

  if (!animate) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => stage.classList.remove('noFlipTransition'));
    });
  }
}

function componentInfo(part) {
  const detail = CHAR_DETAILS[part] || {};
  return {
    part,
    pinyin: detail.pinyin || CHAR_PINYIN[part] || '',
    meaning: detail.meaning || CHAR_GLOSSES[part] || RADICAL_HINTS[part] || 'meaning clue'
  };
}

function compositionType(info) {
  const count = (info.radical ? 1 : 0) + info.components.filter(Boolean).length;
  if (info.radical && info.components.length) return 'Semantic-phonetic compound';
  if (count > 1) return 'Compound character';
  return 'Simple character';
}

function normalizePartList(info) {
  const items = [];
  if (info.radical) {
    const meta = componentInfo(info.radical);
    items.push({
      ...meta,
      roleKey: 'semantic',
      roleLabel: 'Semantic component',
      roleText: 'Gives a meaning/category clue.'
    });
  }
  const comps = info.components.filter(part => part && part !== info.radical);
  comps.forEach((part, idx) => {
    const meta = componentInfo(part);
    const isPhonetic = idx === 0 && !!info.radical;
    items.push({
      ...meta,
      roleKey: isPhonetic ? 'phonetic' : 'structural',
      roleLabel: isPhonetic ? 'Phonetic component' : 'Other component',
      roleText: isPhonetic ? 'Often helps with the sound/pronunciation.' : 'Helps build the full written shape.'
    });
  });
  return items;
}

function howItCombines(info, parts) {
  if (!parts.length) return `${info.char} is best learned as a single complete character meaning “${info.meaning}”.`;
  const semantic = parts.find(p => p.roleKey === 'semantic');
  const phonetic = parts.find(p => p.roleKey === 'phonetic');
  const others = parts.filter(p => !['semantic','phonetic'].includes(p.roleKey));
  const bits = [];
  if (semantic) bits.push(`${semantic.part} suggests the meaning area: ${semantic.meaning}`);
  if (phonetic) bits.push(`${phonetic.part}${phonetic.pinyin ? ` (${phonetic.pinyin})` : ''} gives a sound clue`);
  if (others.length) bits.push(`${others.map(o => o.part).join(' + ')} helps complete the character shape`);
  bits.push(`Together they form ${info.char} (${info.pinyin || ''}), meaning “${info.meaning}”.`);
  return bits.join('. ');
}

function renderCharacterExplorer(word) {
  const chars = practiceChars(word);
  $('#characterExplorerTitle').textContent = `${word.hanzi} · Character Details`;
  $('#characterExplorerSubtitle').textContent = `Explore the structure, components and meaning of this ${chars.length > 1 ? 'word' : 'character'}.`;
  $('#characterExplorerWord').innerHTML = `
    <div class="characterExplorerWordMain">${escapeHtml(word.hanzi)}</div>
    <div class="characterExplorerWordMeta">
      <span>${escapeHtml(word.pinyin)}</span>
      <span>•</span>
      <span>${escapeHtml(word.en)}</span>
    </div>
  `;
  $('#characterExplorerContent').innerHTML = chars.map((ch, idx) => {
    const info = buildCharInfo(ch);
    const parts = normalizePartList(info);
    const visual = parts.length ? `<div class="charVisualParts">${parts.map((part,i)=> `<span class="charPart role-${part.roleKey}">${escapeHtml(part.part)}</span>${i < parts.length - 1 ? '<span class="charPartPlus">+</span>' : ''}`).join('')}</div>` : '';
    const breakdown = parts.length ? `
      <section class="charSection">
        <h4>Component breakdown</h4>
        <div class="charBreakdownGrid">
          ${visual ? `<div class="charPreviewPanel">${visual}</div>` : ''}
          <div class="charComponentList">${parts.map(part => `
            <article class="componentDetail role-${part.roleKey}">
              <div class="componentDetailGlyph">${escapeHtml(part.part)}</div>
              <div class="componentDetailBody">
                <div class="componentDetailHead">
                  <div class="componentDetailTitle">${escapeHtml(part.roleLabel)}</div>
                  ${part.pinyin ? `<div class="componentDetailPinyin">${escapeHtml(part.pinyin)}</div>` : ''}
                </div>
                <div class="componentDetailMeaning">Meaning: ${escapeHtml(part.meaning)}</div>
                <div class="componentDetailRole">Role: ${escapeHtml(part.roleText)}</div>
              </div>
            </article>`).join('')}</div>
        </div>
      </section>` : '';
    return `
      <article class="characterDetailCard">
        <div class="characterDetailHero">
          <div class="characterDetailGlyph">${escapeHtml(ch)}</div>
          <div class="characterDetailMeta">
            <div class="characterDetailTopline">Character ${idx + 1} of ${chars.length}</div>
            <div class="characterDetailPinyinRow">
              ${info.pinyin ? `<span class="characterDetailPinyin">${escapeHtml(info.pinyin)}</span>` : ''}
              <button class="miniSound characterDetailAudio" type="button" data-speak="${escapeHtml(ch)}" aria-label="Listen to ${escapeHtml(ch)}">🔊</button>
            </div>
            <div class="characterDetailMeaning">${escapeHtml(info.meaning)}</div>
            <div class="characterTypeBadge">${escapeHtml(compositionType(info))}</div>
          </div>
        </div>
        ${breakdown}
        <section class="charSection">
          <h4>How it combines</h4>
          <div class="howItCombinesBox">${escapeHtml(howItCombines(info, parts))}</div>
        </section>
      </article>`;
  }).join('');
  $$('#characterExplorerContent .characterDetailAudio').forEach(btn => {
    btn.addEventListener('click', () => speak(btn.dataset.speak || '', true));
  });
}

function openCharacterExplorer(word = WORDS[cardIndex]) {
  if (!word) return;
  renderCharacterExplorer(word);
  $('#characterExplorerModal').hidden = false;
}

function closeCharacterExplorer() {
  $('#characterExplorerModal').hidden = true;
}

function isWordWritten(w) {
  const chars = practiceChars(w);
  return chars.length > 0 && chars.every((c, i) => written[w.n]?.includes(i));
}

function updateStats() {
  const doneCount = WORDS.filter(w => isWordWritten(w)).length;
  if ($('#writeStat')) $('#writeStat').textContent = `${doneCount} written`;
  if ($('#writeProgressText')) $('#writeProgressText').textContent = `${doneCount}/150`;
  if ($('#writeProgress')) $('#writeProgress').style.width = `${(doneCount / 150) * 100}%`;
  updatePracticeSummary();
  renderHomeDashboard();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function shuffle(a) {
  const copy = [...a];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[1-5]/g, '')
    .replace(/v/g, 'u')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'·.,!?;:()（）\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validWordNumbers(numbers) {
  const valid = new Set(WORDS.map(w => w.n));
  const seen = new Set();
  return (Array.isArray(numbers) ? numbers : [])
    .map(Number)
    .filter(n => valid.has(n) && !seen.has(n) && seen.add(n));
}

function sanitizeCardScope(scope) {
  if (!scope || typeof scope !== 'object') return { type: 'all' };
  if (scope.type === 'block' && blockById(scope.id)) return { type: 'block', id: +scope.id };
  if (scope.type === 'search') {
    const wordNs = validWordNumbers(scope.wordNs);
    return wordNs.length ? { type: 'search', query: String(scope.query || ''), wordNs } : { type: 'all' };
  }
  return { type: 'all' };
}

cardScope = sanitizeCardScope(cardScope);

function scopeWordNumbers(scope = cardScope) {
  const clean = sanitizeCardScope(scope);
  if (clean.type === 'block') return [...(blockById(clean.id)?.words || [])];
  if (clean.type === 'search') return [...clean.wordNs];
  return WORDS.map(w => w.n);
}

function getCardSequence() {
  return scopeWordNumbers(cardScope)
    .map(n => WORDS.findIndex(w => w.n === n))
    .filter(i => i >= 0);
}

function cardScopeLabel(scope = cardScope) {
  const clean = sanitizeCardScope(scope);
  if (clean.type === 'block') return blockById(clean.id)?.title || `Block ${clean.id}`;
  if (clean.type === 'search') return clean.query ? `Search: “${clean.query}”` : 'Search results';
  return 'All words';
}

function goToCard(index, preserveScope = true) {
  if (!preserveScope) cardScope = { type: 'all' };
  cardIndex = (index + WORDS.length) % WORDS.length;
  cardFace = 'front';
  openTool = null;
  save();
  renderLearningCard();
  setCardFace('front', false);
  document.querySelector('.learningCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function navigateCard(delta) {
  const seq = getCardSequence();
  if (!seq.length) return;
  let pos = seq.indexOf(cardIndex);
  if (pos < 0) pos = 0;
  pos = (pos + delta + seq.length) % seq.length;
  goToCard(seq[pos], true);
}


function renderLearningCard() {
  let seq = getCardSequence();
  if (!seq.length) {
    cardScope = { type: 'all' };
    seq = getCardSequence();
  }
  if (!seq.includes(cardIndex)) cardIndex = seq[0] ?? 0;

  const w = WORDS[cardIndex];
  if (!w) return;
  const pos = Math.max(0, seq.indexOf(cardIndex));
  const scopeLabel = cardScopeLabel();

  $('#cardScopeName').textContent = scopeLabel;
  $('#cardProgressLabel').textContent = cardScope.type === 'all'
    ? `Word ${cardIndex + 1} of ${WORDS.length}`
    : `${scopeLabel} · ${pos + 1} of ${seq.length}`;
  $('#cardProgressBar').style.width = `${((pos + 1) / Math.max(1, seq.length)) * 100}%`;
  $('#cardNumber').textContent = `#${w.n}`;

  $('#cardHanziFront').textContent = w.hanzi;
  $('#cardHanziBack').textContent = w.hanzi;
  $('#cardPinyinFront').textContent = w.pinyin;
  $('#cardPinyinBack').textContent = w.pinyin;
  $('#cardMeaning').textContent = w.en;
  $('#exampleHanzi').textContent = w.example.hanzi;
  $('#examplePinyin').textContent = w.example.pinyin;
  $('#exampleEnglish').textContent = w.example.en;

  const flipStage = $('#cardFlipStage');
  if (flipStage) flipStage.classList.toggle('isFlipped', cardFace === 'back');
  syncCardFlipHeight();
  $('#characterExplorerModal').hidden = true;
}

function explorerWords() {
  if (explorerQuery) {
    const q = normalizeSearchText(explorerQuery);
    if (!q) return [];
    return WORDS.filter(w => {
      const haystack = normalizeSearchText(`${w.hanzi} ${w.pinyin} ${w.en}`);
      return haystack.includes(q);
    });
  }
  if (explorerMode.type === 'block') {
    const block = blockById(explorerMode.id);
    return (block?.words || []).map(wordByN).filter(Boolean);
  }
  return [...WORDS];
}

function explorerMeta(words) {
  if (explorerQuery) {
    return {
      eyebrow: 'SEARCH RESULTS',
      title: `Results for “${explorerQuery}”`,
      description: 'Search matches Hanzi, pinyin without tone marks, and English meaning.'
    };
  }
  if (explorerMode.type === 'block') {
    const block = blockById(explorerMode.id);
    return {
      eyebrow: `BLOCK ${block?.id || ''} · ${words.length} WORDS`,
      title: block?.title || 'Thematic block',
      description: block?.description || 'Browse this related vocabulary set.'
    };
  }
  return {
    eyebrow: 'ALL WORDS',
    title: 'All HSK 1 cards',
    description: 'Browse the full collection in its original vocabulary order.'
  };
}

function renderExplorerFilters() {
  const host = $('#explorerFilters');
  if (!host) return;
  const activeType = explorerQuery ? 'search' : explorerMode.type;
  host.innerHTML = `
    <button class="explorerFilter ${activeType === 'all' ? 'active' : ''}" type="button" data-filter="all">All words <span>${WORDS.length}</span></button>
    ${PRACTICE_BLOCKS.map(block => `<button class="explorerFilter ${activeType === 'block' && explorerMode.id === block.id ? 'active' : ''}" type="button" data-filter="block" data-block-id="${block.id}">${block.id} · ${escapeHtml(block.title)} <span>15</span></button>`).join('')}`;

  $$('.explorerFilter').forEach(btn => btn.addEventListener('click', () => {
    explorerQuery = '';
    $('#cardSearch').value = '';
    $('#clearCardSearch').hidden = true;
    explorerMode = btn.dataset.filter === 'block'
      ? { type: 'block', id: +btn.dataset.blockId }
      : { type: btn.dataset.filter };
    renderCardExplorer();
  }));
}

function renderCardExplorer() {
  const words = explorerWords();
  renderExplorerFilters();
  $('#clearCardSearch').hidden = !explorerQuery;

  const grid = $('#explorerWordGrid');
  const empty = $('#explorerEmpty');
  if (!words.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = '<b>No matching words.</b><span>Try another Hanzi, pinyin spelling, or English meaning.</span>';
    return;
  }

  empty.hidden = true;
  grid.innerHTML = words.map(w => `
    <article class="explorerWordCard">
      <button class="explorerWordAudio" type="button" data-speak-word="${escapeHtml(w.hanzi)}" aria-label="Listen to ${escapeHtml(w.hanzi)}">🔊</button>
      <button class="explorerWordMain" type="button" data-open-word="${w.n}" aria-label="Open ${escapeHtml(w.hanzi)}, ${escapeHtml(w.en)}">
        <span class="explorerMiniHanzi">${escapeHtml(w.hanzi)}</span>
        <span class="explorerMiniPinyin">${escapeHtml(w.pinyin)}</span>
        <span class="explorerMiniMeaning">${escapeHtml(w.en)}</span>
      </button>
    </article>`).join('');

  $$('[data-open-word]').forEach(btn => btn.addEventListener('click', () => openWordFromExplorer(+btn.dataset.openWord)));
  $$('[data-speak-word]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    speak(btn.dataset.speakWord || '', true);
  }));
}

function openCardExplorer() {
  if (cardScope.type === 'block') explorerMode = { type: 'block', id: cardScope.id };
  else explorerMode = { type: 'all' };
  explorerQuery = cardScope.type === 'search' ? String(cardScope.query || '') : '';
  $('#cardSearch').value = explorerQuery;
  $('#cardView').hidden = true;
  $('#cardExplorer').hidden = false;
  renderCardExplorer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeCardExplorer() {
  $('#cardExplorer').hidden = true;
  $('#cardView').hidden = false;
  renderLearningCard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openWordFromExplorer(n) {
  const idx = WORDS.findIndex(w => w.n === +n);
  if (idx < 0) return;
  const words = explorerWords();

  if (explorerQuery) cardScope = { type: 'search', query: explorerQuery, wordNs: words.map(w => w.n) };
  else if (explorerMode.type === 'block') cardScope = { type: 'block', id: explorerMode.id };
  else cardScope = { type: 'all' };

  cardIndex = idx;
  cardFace = 'front';
  openTool = null;
  save();
  closeCardExplorer();
  setCardFace('front', false);
}

function renderBreakdown(w) {
  const chars = practiceChars(w);
  if (chars.length <= 1) {
    return `
      <h3>Word breakdown</h3>
      <p><b>${escapeHtml(w.hanzi)}</b> is a single-character word. Treat its shape, sound, and meaning as one learning chunk.</p>
      <div class="breakdownRow">
        <div class="breakPiece"><div class="char">${escapeHtml(chars[0] || w.hanzi)}</div><div class="gloss">${escapeHtml(CHAR_GLOSSES[chars[0]] || w.en)}</div></div>
      </div>`;
  }

  return `
    <h3>Word breakdown</h3>
    <p>Chunk the word into characters first. The small glosses are memory anchors, not always a literal word-for-word translation.</p>
    <div class="breakdownRow">
      ${chars.map(ch => `<div class="breakPiece"><div class="char">${escapeHtml(ch)}</div><div class="gloss">${escapeHtml(CHAR_GLOSSES[ch] || 'part of this word')}</div></div>`).join('')}
    </div>`;
}

function renderCharacters(w) {
  const chars = practiceChars(w);
  return `
    <h3>Characters in ${escapeHtml(w.hanzi)}</h3>
    <p>Open any character in the stroke trainer. Producing the shape from memory is more useful than only looking at it.</p>
    <div class="charPracticeList">
      ${chars.map((ch, i) => `<button class="charPracticeButton" type="button" data-char-i="${i}"><b>${escapeHtml(ch)}</b>${escapeHtml(CHAR_GLOSSES[ch] || 'practice strokes')}</button>`).join('')}
    </div>`;
}

function renderMemoryTip(w) {
  const chars = practiceChars(w);
  const chunk = chars.join(' + ');
  const tip = chars.length > 1
    ? `Say “${w.pinyin}” once, notice the chunks ${chunk}, then cover the English meaning and retrieve “${w.en}” from the Hanzi alone.`
    : `Look at ${w.hanzi} for three seconds, say “${w.pinyin}”, then hide the meaning and retrieve “${w.en}” from the character alone.`;
  return `
    <div class="memoryCallout">
      <div class="memoryIcon">💡</div>
      <div>
        <h3>Memory tip</h3>
        <p>${escapeHtml(tip)}</p>
        <p><b>Why:</b> this turns passive viewing into retrieval practice while keeping the task small enough to repeat later.</p>
      </div>
    </div>`;
}

function renderPracticeChoices(w) {
  const block = blockForWord(w.n);
  return `
    <h3>Practice ${escapeHtml(w.hanzi)}</h3>
    <p>This word belongs to <b>Block ${block?.id || ''}: ${escapeHtml(block?.title || 'HSK 1')}</b>. Practice the whole related set so the same words return through different kinds of recall.</p>
    <div class="practiceChoices">
      <button class="practiceChoice" type="button" data-practice="block">🎯 Open its practice block</button>
      <button class="practiceChoice" type="button" data-practice="listen">🔊 Listen again</button>
      <button class="practiceChoice" type="button" data-practice="write">✍️ Write Hanzi</button>
    </div>`;
}

function openExplore(tool) {
  const panel = $('#explorePanel');
  const w = WORDS[cardIndex];
  if (openTool === tool && !panel.hidden) {
    panel.hidden = true;
    openTool = null;
    $$('.toolPill').forEach(b => b.classList.remove('active'));
    return;
  }

  openTool = tool;
  $$('.toolPill').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  if (tool === 'breakdown') panel.innerHTML = renderBreakdown(w);
  if (tool === 'characters') panel.innerHTML = renderCharacters(w);
  if (tool === 'memory') panel.innerHTML = renderMemoryTip(w);
  if (tool === 'practice') panel.innerHTML = renderPracticeChoices(w);
  panel.hidden = false;

  $$('.charPracticeButton').forEach(b => b.addEventListener('click', () => {
    writeIndex = cardIndex;
    charIndex = +b.dataset.charI || 0;
    save();
    switchPage('write');
    renderWriter();
  }));

  $$('.practiceChoice').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.practice;
    if (mode === 'listen') speak(w.hanzi, true);
    if (mode === 'write') {
      writeIndex = cardIndex;
      charIndex = 0;
      save();
      switchPage('write');
      renderWriter();
    }
    if (mode === 'block') {
      const block = blockForWord(w.n);
      if (block) openPracticeBlock(block.id);
    }
  }));
}

['#cardSpeakFront', '#cardSpeakBack'].forEach(sel => { const el = $(sel); if (el) el.addEventListener('click', () => speak(WORDS[cardIndex].hanzi, true)); });
$('#exampleSpeak').addEventListener('click', () => speak(WORDS[cardIndex].example.hanzi, true));
$('#cardPrevTop').addEventListener('click', () => navigateCard(-1));
$('#cardNextTop').addEventListener('click', () => navigateCard(1));

$('.learningCard').addEventListener('click', (event) => {
  if (event.target.closest('button, a, input, select, textarea, [role="button"]')) return;

  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const edgeZone = Math.min(92, rect.width * 0.16);

  if (x <= edgeZone) {
    navigateCard(-1);
  } else if (x >= rect.width - edgeZone) {
    navigateCard(1);
  }
});

window.addEventListener('resize', syncCardFlipHeight);
$('#randomCard').addEventListener('click', () => {
  const seq = getCardSequence();
  if (!seq.length) return;
  let next = seq[Math.floor(Math.random() * seq.length)];
  if (seq.length > 1 && next === cardIndex) next = seq[(seq.indexOf(next) + 1) % seq.length];
  goToCard(next, true);
});
$('#flipToBack').addEventListener('click', () => setCardFace('back'));
$('#flipToFront').addEventListener('click', () => setCardFace('front'));
['#cardHanziFront', '#cardHanziBack'].forEach(sel => { const el = $(sel); if (el) el.addEventListener('click', () => openCharacterExplorer()); });
$('#closeCharacterExplorer').addEventListener('click', closeCharacterExplorer);
$('#closeCharacterExplorerBack').addEventListener('click', closeCharacterExplorer);
$('#characterExplorerModal').addEventListener('click', e => { if (e.target.id === 'characterExplorerModal') closeCharacterExplorer(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#characterExplorerModal').hidden) closeCharacterExplorer();
});
$('#openCardExplorer').addEventListener('click', openCardExplorer);
$('#cardSearch').addEventListener('input', e => {
  explorerQuery = e.target.value.trim();
  renderCardExplorer();
});
$('#cardSearch').addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault();
    explorerQuery = '';
    e.currentTarget.value = '';
    renderCardExplorer();
  }
});
$('#clearCardSearch').addEventListener('click', () => {
  explorerQuery = '';
  $('#cardSearch').value = '';
  renderCardExplorer();
  $('#cardSearch').focus();
});

function switchPage(id) {
  document.body.dataset.page = id;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === id));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === id));
  if (id === 'home') renderHomeDashboard();
  if (id === 'vocab') renderLearningCard();
  if (id === 'write') renderWriter();
  if (id === 'practice') renderPracticeHome();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.tab').forEach(t => t.addEventListener('click', () => {
  const page = t.dataset.page;
  if (page === 'vocab') {
    openCardsExplorerHome();
    return;
  }
  switchPage(page);
}));
let hwWriter = null;
let hwWriters = [];
let hwMistakes = 0;
let hwCurrentStroke = 0;
let guideVisible = true;
let writerSession = 0;

function resetWriterMessage(text = '') {
  const box = $('#traceResult');
  if (box) {
    box.className = 'result';
    box.textContent = text;
  }
  hwMistakes = 0;
  hwCurrentStroke = 0;
  const strokeCounter = $('#strokeCounter');
  const mistakeCounter = $('#mistakeCounter');
  if (strokeCounter) {
    strokeCounter.textContent = 'Stroke 1';
    strokeCounter.className = 'strokePill';
  }
  if (mistakeCounter) {
    mistakeCounter.textContent = '0 mistakes';
    mistakeCounter.className = 'strokePill';
  }
}

function writerCellSize(cell) {
  const rect = cell?.getBoundingClientRect?.();
  const raw = Math.round(rect?.width || 300);
  // Use the real cell size so a single Hanzi fills and centers inside its square.
  // Two+ character words naturally get smaller cells from the stage grid.
  return Math.max(120, Math.min(620, raw));
}


function centerSingleHanziOptically(chars) {
  // No extra SVG translation is needed. The writer is now created at the
  // exact size of the single-character cell, which keeps the glyph centered.
}

function writerOptions(size, completed = false) {
  return {
    width: size,
    height: size,
    padding: Math.max(16, Math.round(size * 0.07)),
    showCharacter: completed,
    showOutline: guideVisible,
    characterColor: completed ? '#caa9a5' : '#4e1217',
    strokeColor: '#4e1217',
    outlineColor: '#eadbd8',
    drawingColor: '#b72d36',
    highlightColor: '#df7c83',
    highlightCompleteColor: '#2f7d59',
    drawingWidth: Math.max(8, Math.round(size * 0.035)),
    strokeAnimationSpeed: 1,
    delayBetweenStrokes: 260,
    showHintAfterMisses: 2,
    acceptBackwardsStrokes: false,
    leniency: 0.85
  };
}

function buildWordStage(chars) {
  const stage = $('#hanziWordStage');
  if (!stage) return [];
  stage.className = `hanziWordStage count-${Math.min(chars.length, 4)}`;
  stage.style.setProperty('--char-count', String(chars.length || 1));
  stage.innerHTML = chars.map((ch, i) => `
    <div class="hanziCharCell ${i === charIndex ? 'active' : ''}" data-char-index="${i}" aria-label="Character ${i + 1}: ${escapeHtml(ch)}">
      <div id="hanziWriterTarget-${i}" class="hanziCharTarget"></div>
    </div>`).join('');
  const cells = $$('#hanziWordStage .hanziCharCell');
  cells.forEach(cell => cell.addEventListener('click', () => {
    const idx = +cell.dataset.charIndex;
    if (!Number.isInteger(idx) || idx === charIndex) return;
    charIndex = idx;
    renderWriterTabsOnly();
    createHanziWriter('quiz');
  }));
  return cells;
}

function createStaticWordWriters(chars, cells) {
  hwWriters = chars.map((ch, i) => {
    const completed = i !== charIndex && written[WORDS[writeIndex].n]?.includes(i);
    const size = writerCellSize(cells[i]);
    return HanziWriter.create(`hanziWriterTarget-${i}`, ch, writerOptions(size, completed));
  });
  hwWriter = hwWriters[charIndex] || null;
  centerSingleHanziOptically(chars);
}

function animateWholeWord(chars, cells, session) {
  hwWriters = chars.map((ch, i) => {
    const size = writerCellSize(cells[i]);
    return HanziWriter.create(`hanziWriterTarget-${i}`, ch, writerOptions(size, false));
  });
  hwWriter = hwWriters[charIndex] || null;
  centerSingleHanziOptically(chars);

  let i = 0;
  const next = () => {
    if (session !== writerSession) return;
    if (i >= hwWriters.length) {
      setTimeout(() => {
        if (session === writerSession) createHanziWriter('quiz');
      }, 400);
      return;
    }
    hwWriters[i].animateCharacter({
      onComplete: () => {
        i++;
        setTimeout(next, 180);
      }
    });
  };
  next();
}

function createHanziWriter(mode = 'quiz') {
  const stage = $('#hanziWordStage');
  const chars = practiceChars(WORDS[writeIndex]);
  const ch = chars[charIndex];
  if (!stage || !ch) return;
  const session = ++writerSession;
  resetWriterMessage();

  if (typeof HanziWriter === 'undefined') {
    const traceBox = $('#traceResult');
    if (traceBox) {
      traceBox.className = 'result no';
      traceBox.textContent = 'Hanzi Writer could not load. Check your Internet connection and reload the page.';
    }
    return;
  }

  const cells = buildWordStage(chars);
  requestAnimationFrame(() => {
    if (session !== writerSession) return;
    if (mode === 'animation') {
      animateWholeWord(chars, cells, session);
      return;
    }

    createStaticWordWriters(chars, cells);
    hwWriter = hwWriters[charIndex];
    if (!hwWriter) return;

    hwWriter.quiz({
      showHintAfterMisses: 2,
      acceptBackwardsStrokes: false,
      leniency: 0.85,
      onMistake: data => {
        if (session !== writerSession) return;
        hwMistakes = data.totalMistakes;
        hwCurrentStroke = data.strokeNum;
        const box = $('#traceResult');
        if (box) {
          box.className = 'result no';
          box.innerHTML = `❌ Stroke ${data.strokeNum + 1} does not match.`;
        }
        const strokeCounter = $('#strokeCounter');
        const mistakeCounter = $('#mistakeCounter');
        if (strokeCounter) {
          strokeCounter.textContent = `Stroke ${data.strokeNum + 1}`;
          strokeCounter.className = 'strokePill bad';
        }
        if (mistakeCounter) {
          mistakeCounter.textContent = `${data.totalMistakes} ${data.totalMistakes === 1 ? 'mistake' : 'mistakes'}`;
          mistakeCounter.className = 'strokePill bad';
        }
      },
      onCorrectStroke: data => {
        if (session !== writerSession) return;
        hwMistakes = data.totalMistakes;
        hwCurrentStroke = data.strokeNum + 1;
        const strokeCounter = $('#strokeCounter');
        const mistakeCounter = $('#mistakeCounter');
        if (strokeCounter) {
          strokeCounter.textContent = data.strokesRemaining ? `Next: ${data.strokeNum + 2}` : 'Last stroke ✓';
          strokeCounter.className = 'strokePill good';
        }
        if (mistakeCounter) {
          mistakeCounter.textContent = `${data.totalMistakes} ${data.totalMistakes === 1 ? 'mistake' : 'mistakes'}`;
          mistakeCounter.className = data.totalMistakes ? 'strokePill bad' : 'strokePill good';
        }
      },
      onComplete: data => {
        if (session !== writerSession) return;
        const w = WORDS[writeIndex];
        const charsNow = practiceChars(w);
        if (!written[w.n]) written[w.n] = [];
        if (!written[w.n].includes(charIndex)) written[w.n].push(charIndex);
        save();
        renderWriterTabsOnly();
        renderMini();

        if (charIndex < charsNow.length - 1) {
          setTimeout(() => {
            if (session !== writerSession) return;
            charIndex++;
            renderWriterTabsOnly();
            createHanziWriter('quiz');
          }, 450);
        } else {
          setTimeout(() => {
            if (session !== writerSession) return;
            writeIndex = (writeIndex + 1) % WORDS.length;
            charIndex = 0;
            save();
            renderWriter();
          }, 850);
        }
      }
    });
  });
}

function renderWriter() {
  const w = WORDS[writeIndex];
  const chars = practiceChars(w);
  if (charIndex >= chars.length) charIndex = 0;
  $('#writeWord').textContent = baseHanzi(w);
  $('#writePinyin').textContent = w.pinyin;
  $('#writeMeaning').textContent = w.en;
  updateGuideButton();
  $('#characterTabs').innerHTML = chars.map((c, i) => `<button class="charBtn ${i === charIndex ? 'active' : ''} ${written[w.n]?.includes(i) ? 'done' : ''}" data-i="${i}" type="button">${escapeHtml(c)}${written[w.n]?.includes(i) ? ' ✓' : ''}</button>`).join('');
  $$('.charBtn').forEach(b => b.addEventListener('click', () => {
    charIndex = +b.dataset.i;
    renderWriterTabsOnly();
    createHanziWriter('quiz');
  }));
  renderMini();
  updateStats();
  requestAnimationFrame(() => createHanziWriter('quiz'));
}

function renderWriterTabsOnly() {
  const w = WORDS[writeIndex];
  $$('.charBtn').forEach((b, i) => {
    b.classList.toggle('active', i === charIndex);
    b.classList.toggle('done', written[w.n]?.includes(i));
  });
  $$('#hanziWordStage .hanziCharCell').forEach((cell, i) => {
    cell.classList.toggle('active', i === charIndex);
    cell.classList.toggle('done', written[w.n]?.includes(i));
  });
}

function renderMini() {
  const miniList = $('#miniList');
  if (!miniList) return;
  miniList.innerHTML = WORDS.map(w => `<div class="mini" data-n="${w.n}"><span><span class="num">#${w.n}</span> <span class="c">${escapeHtml(w.hanzi)}</span></span><span class="tick">${isWordWritten(w) ? '✓' : ''}</span></div>`).join('');
  $$('.mini').forEach(m => m.addEventListener('click', () => {
    writeIndex = +m.dataset.n - 1;
    charIndex = 0;
    save();
    renderWriter();
  }));
}

function updateGuideButton() {
  const btn = $('#toggleGuide');
  if (!btn) return;
  btn.innerHTML = `${guideVisible ? '◌' : '◎'} <span>${guideVisible ? 'Hide guide' : 'Show guide'}</span>`;
}

function goToPrevWriteWord() {
  writeIndex = (writeIndex - 1 + WORDS.length) % WORDS.length;
  charIndex = 0;
  save();
  renderWriter();
}

function goToNextWriteWord() {
  writeIndex = (writeIndex + 1) % WORDS.length;
  charIndex = 0;
  save();
  renderWriter();
}

function initWriteSwipe() {
  const swipeArea = $('#writeSwipeArea');
  if (!swipeArea) return;
  let startX = 0;
  let startY = 0;
  let touching = false;
  swipeArea.addEventListener('touchstart', (e) => {
    const target = e.target;
    if (target && target.closest && target.closest('#hanziWordStage')) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    touching = true;
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });
  swipeArea.addEventListener('touchend', (e) => {
    if (!touching) return;
    touching = false;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    if (dx < 0) goToNextWriteWord();
    else goToPrevWriteWord();
  }, { passive: true });
}

$('#resetQuiz').addEventListener('click', () => createHanziWriter('quiz'));
$('#animateChar').addEventListener('click', () => createHanziWriter('animation'));
$('#toggleGuide').addEventListener('click', () => {
  guideVisible = !guideVisible;
  updateGuideButton();
  createHanziWriter('quiz');
});
$('#prevWord').addEventListener('click', goToPrevWriteWord);
$('#nextWord').addEventListener('click', goToNextWriteWord);
$('#speakWrite').addEventListener('click', () => speak(baseHanzi(WORDS[writeIndex]), true));
updateGuideButton();
initWriteSwipe();
const PRACTICE_SKILLS = [
  {
    id: 'meaning',
    name: 'Meaning',
    icon: 'A↔文',
    description: 'Connect Hanzi and English in both directions.'
  },
  {
    id: 'hanziPinyin',
    name: 'Hanzi & Pinyin',
    icon: '拼',
    description: 'Build a direct link between written form and pronunciation.'
  },
  {
    id: 'typeHanzi',
    name: 'Type Hanzi',
    icon: '键',
    description: 'Use your device’s Chinese Pinyin keyboard to produce the target Hanzi.'
  },
  {
    id: 'listening',
    name: 'Listening',
    icon: '耳',
    description: 'Hear the word first, then identify what you heard.'
  },
  {
    id: 'association',
    name: 'Association',
    icon: '句',
    description: 'Retrieve the word inside a real HSK 1 sentence.'
  },
  {
    id: 'buildSentence',
    name: 'Sentence Builder',
    icon: '排',
    description: 'Rebuild a Chinese sentence from pinyin or English by arranging Hanzi blocks.'
  },
  {
    id: 'mixed',
    name: 'Mixed practice',
    icon: '混',
    description: 'Rotate through all six practice skills.'
  }
];

function statFor(n, skill) {
  return practiceStats[n]?.[skill] || { attempts: 0, correct: 0, lastResult: null };
}

function aggregateSkill(block, skill) {
  if (!block) return { attempts: 0, correct: 0, accuracy: null };
  const skills = skill === 'mixed' ? ['meaning', 'hanziPinyin', 'typeHanzi', 'listening', 'association', 'buildSentence'] : [skill];
  let attempts = 0;
  let correct = 0;
  block.words.forEach(n => skills.forEach(s => {
    const st = statFor(n, s);
    attempts += st.attempts || 0;
    correct += st.correct || 0;
  }));
  return { attempts, correct, accuracy: attempts ? Math.round((correct / attempts) * 100) : null };
}

function aggregateAllPractice() {
  let attempts = 0;
  let correct = 0;
  WORDS.forEach(w => ['meaning', 'hanziPinyin', 'typeHanzi', 'listening', 'association'].forEach(skill => {
    const st = statFor(w.n, skill);
    attempts += st.attempts || 0;
    correct += st.correct || 0;
  }));
  return { attempts, correct, accuracy: attempts ? Math.round((correct / attempts) * 100) : null };
}

function updatePracticeSummary() {
  const overall = aggregateAllPractice();
  if ($('#practiceOverall')) $('#practiceOverall').textContent = overall.accuracy === null ? '—' : `${overall.accuracy}%`;
}
function uniqueActivityDays() {
  const stamps = [];
  Object.values(practiceStats).forEach(skills => {
    Object.values(skills || {}).forEach(st => {
      if (st?.lastAt) stamps.push(st.lastAt);
    });
  });
  const days = new Set(stamps.map(ts => new Date(ts).toISOString().slice(0, 10)));
  return days.size;
}

function todaysAttempts() {
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  Object.values(practiceStats).forEach(skills => {
    Object.values(skills || {}).forEach(st => {
      if (st?.lastAt && new Date(st.lastAt).toISOString().slice(0, 10) === today) {
        count += st.attempts || 0;
      }
    });
  });
  return count;
}

function reviewedWordsToday() {
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  WORDS.forEach(w => {
    const skills = practiceStats[w.n] || {};
    const activeToday = Object.values(skills).some(st => st?.lastAt && new Date(st.lastAt).toISOString().slice(0, 10) === today);
    if (activeToday) count += 1;
  });
  return count;
}

function totalXp() {
  const overall = aggregateAllPractice();
  const doneCount = WORDS.filter(w => isWordWritten(w)).length;
  return (overall.correct || 0) * 10 + doneCount * 5;
}

function openCardsExplorerHome() {
  cardScope = { type: 'all' };
  explorerMode = { type: 'all' };
  explorerQuery = '';
  if ($('#cardSearch')) $('#cardSearch').value = '';
  $('#cardView').hidden = true;
  $('#cardExplorer').hidden = false;
  renderCardExplorer();
  switchPage('vocab');
}

function openPracticeBlockHome(id = 1) {
  selectedBlockId = id;
  save();
  switchPage('practice');
  renderPracticeHome();
}

function renderHomeDashboard() {
  const streak = uniqueActivityDays();
  const xp = totalXp();
  const reviewedToday = reviewedWordsToday();
  const goalNow = Math.min(5, reviewedToday);
  if ($('#homeStreakValue')) $('#homeStreakValue').textContent = `${streak} day${streak === 1 ? '' : 's'}`;
  if ($('#homeXpValue')) $('#homeXpValue').textContent = `${xp} XP`;
  if ($('#homeReviewedValue')) $('#homeReviewedValue').textContent = `${reviewedToday} cards`;
  if ($('#homeGoalValue')) $('#homeGoalValue').textContent = `${goalNow} / 5`;
  if ($('#homeGoalBar')) $('#homeGoalBar').style.width = `${(goalNow / 5) * 100}%`;

  const block = blockById(selectedBlockId) || PRACTICE_BLOCKS[0];
  if (block) {
    const title = `Continue Block ${block.id} – ${block.title}`;
    if ($('#homeContinueTitle')) $('#homeContinueTitle').textContent = title;
    if ($('#homeContinueText')) $('#homeContinueText').textContent = block.description || 'Keep building your vocabulary with the next focused set of words.';
  }
}


function recordPracticeAnswer(n, skill, correct) {
  if (!practiceStats[n]) practiceStats[n] = {};
  if (!practiceStats[n][skill]) practiceStats[n][skill] = { attempts: 0, correct: 0, lastResult: null };
  const st = practiceStats[n][skill];
  st.attempts += 1;
  if (correct) st.correct += 1;
  st.lastResult = !!correct;
  st.lastAt = Date.now();

  if (!practiceMistakes[n]) practiceMistakes[n] = {};
  const current = practiceMistakes[n][skill] || 0;
  practiceMistakes[n][skill] = correct ? Math.max(0, current - 1) : Math.min(9, current + 1);
  save();
}

function mistakeSkillsForWord(n) {
  const m = practiceMistakes[n] || {};
  return ['meaning', 'hanziPinyin', 'typeHanzi', 'listening', 'association'].filter(skill => (m[skill] || 0) > 0);
}

function mistakeWordsForBlock(block) {
  return block.words.filter(n => mistakeSkillsForWord(n).length > 0);
}

function practicedWordsForBlock(block) {
  if (!block) return [];
  return block.words.filter(n =>
    ['meaning', 'hanziPinyin', 'typeHanzi', 'listening', 'association']
      .some(skill => (statFor(n, skill).attempts || 0) > 0)
  );
}

function setPracticeMode(mode) {
  if (!VALID_PRACTICE_MODES.includes(mode)) return;
  selectedPracticeMode = mode;
  save();
  if ($('#practiceHome') && !$('#practiceHome').hidden) {
    renderPracticeHome();
    return;
  }
  $$('.practiceModeButton').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.skill === selectedPracticeMode);
    btn.setAttribute('aria-pressed', btn.dataset.skill === selectedPracticeMode ? 'true' : 'false');
  });
}

let lastResultSound = { correct: -1, wrong: -1 };

function pickNonRepeatingIndex(length, previous) {
  if (length <= 1) return 0;
  let i = Math.floor(Math.random() * length);
  if (i === previous) i = (i + 1 + Math.floor(Math.random() * (length - 1))) % length;
  return i;
}
function playPracticeResultSound(correct) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext; if (!AudioCtx) return;
    const ctx = new AudioCtx(), now = ctx.currentTime;
    const correctPatterns = [
      {type:'sine',gain:.055,tones:[[523.25,0,.09],[659.25,.07,.10],[783.99,.15,.15]]},
      {type:'triangle',gain:.050,tones:[[659.25,0,.08],[880,.09,.16]]},
      {type:'sine',gain:.048,tones:[[587.33,0,.07],[739.99,.06,.07],[987.77,.13,.14]]},
      {type:'triangle',gain:.046,tones:[[493.88,0,.08],[659.25,.07,.08],[830.61,.15,.13]]},
      {type:'sine',gain:.043,tones:[[698.46,0,.08],[1046.50,.10,.17]]}
    ];
    const wrongPatterns = [
      {type:'sine',gain:.040,tones:[[392,0,.10],[329.63,.09,.14]]},
      {type:'triangle',gain:.035,tones:[[349.23,0,.09],[293.66,.09,.14]]},
      {type:'sine',gain:.034,tones:[[329.63,0,.08],[277.18,.08,.12]]},
      {type:'triangle',gain:.032,tones:[[440,0,.06],[369.99,.07,.08],[329.63,.14,.11]]}
    ];
    const patterns = correct ? correctPatterns : wrongPatterns, key = correct ? 'correct' : 'wrong';
    const index = pickNonRepeatingIndex(patterns.length, lastResultSound[key]); lastResultSound[key] = index;
    const p = patterns[index];
    p.tones.forEach(([freq, offset, duration]) => {
      const osc=ctx.createOscillator(), gain=ctx.createGain(); osc.type=p.type; osc.frequency.setValueAtTime(freq,now+offset);
      osc.detune.setValueAtTime((Math.random()-.5)*(correct?9:5),now+offset);
      gain.gain.setValueAtTime(.0001,now+offset); gain.gain.exponentialRampToValueAtTime(p.gain,now+offset+.012); gain.gain.exponentialRampToValueAtTime(.0001,now+offset+duration);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(now+offset); osc.stop(now+offset+duration+.02);
    });
    setTimeout(()=>ctx.close().catch(()=>{}),900);
  } catch (_) {}
}
function clearPracticeReactions() {
  // Mascot reactions were intentionally removed.
}

function showLearningFeedback(correct) {
  // Nonverbal feedback only: keep the short randomized sound.
  playPracticeResultSound(correct);
}

function showTransientTypingReaction(correct) {
  // Typing mistakes/corrections use the same short randomized sound only.
  playPracticeResultSound(correct);
}

function renderPracticeHome() {
  if (!$('#practiceHome')) return;
  $('#practiceHome').hidden = false;
  $('#blockView').hidden = true;
  $('#exerciseView').hidden = true;
  exerciseSession = null;
  exerciseQuestion = null;

  const overall = aggregateAllPractice();
  const streak = uniqueActivityDays();
  const reviewedToday = reviewedWordsToday();
  const goalNow = Math.min(5, reviewedToday);
  const block = blockById(selectedBlockId) || PRACTICE_BLOCKS[0];
  if (!block) return;
  const total = PRACTICE_BLOCKS.length;
  const currentIdx = PRACTICE_BLOCKS.findIndex(b => b.id === block.id);
  const prevBlock = PRACTICE_BLOCKS[(currentIdx - 1 + total) % total];
  const nextBlock = PRACTICE_BLOCKS[(currentIdx + 1) % total];
  const modeMap = {
    mixed: { name: 'Mixed', desc: 'A mix of meaning, listening, and typing.', icon: '🔀', cls: 'mode-mixed', recommended: true, label: 'Mixed practice', art: 'assets/ui/mode-card-mixed.webp' },
    meaning: { name: 'Meaning', desc: 'Choose the correct meaning.', icon: '📖', cls: 'mode-meaning', label: 'Meaning practice', art: 'assets/ui/mode-card-meaning.webp' },
    listening: { name: 'Listening', desc: 'Listen and choose the correct answer.', icon: '🎧', cls: 'mode-listening', label: 'Listening practice', art: 'assets/ui/mode-card-listening.webp' },
    hanziPinyin: { name: 'Hanzi ↔ Pinyin', desc: 'Match characters and pinyin.', icon: '🔤', cls: 'mode-hanziPinyin', label: 'Hanzi ↔ Pinyin', art: 'assets/ui/mode-card-hanzi-pinyin.webp' },
    typeHanzi: { name: 'Type Hanzi', desc: 'Type the correct character.', icon: '⌨️', cls: 'mode-typeHanzi', label: 'Type Hanzi', art: 'assets/ui/mode-card-type-hanzi.webp' },
    buildSentence: { name: 'Sentence Builder', desc: 'Drag Hanzi blocks into the correct sentence order.', icon: '🧩', cls: 'mode-buildSentence', label: 'Sentence Builder', art: 'assets/ui/mode-card-sentence-builder.webp' },
    mistakes: { name: 'Review mistakes', desc: 'Focus on words you got wrong.', icon: '🎯', cls: 'mode-mistakes', label: 'Review mistakes', art: 'assets/ui/mode-card-mistakes.webp' }
  };
  const modeOrder = ['mixed','meaning','listening','hanziPinyin','typeHanzi','buildSentence'];
  // Review mistakes still exists internally, but it is no longer shown as a Practice Mode card.
  // If it was selected in an older saved session, return the visible selector to Mixed.
  if (!modeOrder.includes(selectedPracticeMode)) {
    selectedPracticeMode = 'mixed';
    save();
  }
  const currentMode = modeMap[selectedPracticeMode] || modeMap.mixed;
  const mistakeCount = mistakeWordsForBlock(block).length;
  const startDisabled = selectedPracticeMode === 'mistakes' && mistakeCount === 0;

  const previewWords = (item, maxN = 4) => item.words.slice(0, maxN).map(n => wordByN(n)).filter(Boolean);
  const renderPeek = (item, dir) => {
    const preview = previewWords(item, 3).map(w => `<span>${escapeHtml(baseHanzi(w))}</span>`).join('');
    return `<div class="practicePeekLabel">Block ${item.id}</div>
      <div>
        <div class="practicePeekTitle">${escapeHtml(item.title)}</div>
        <div class="practicePeekPreview">${preview}</div>
      </div>
      <img class="practicePeekArt" src="assets/ui/practice-block-${item.id}.png" alt="${escapeHtml(item.title)} illustration">`;
  };

  if ($('#practiceSummaryStreak')) $('#practiceSummaryStreak').textContent = String(streak || 0);
  if ($('#practiceCardBlockLabel')) $('#practiceCardBlockLabel').textContent = `Block ${block.id}`;
  if ($('#practiceCardModePill')) $('#practiceCardModePill').textContent = selectedPracticeMode === 'mistakes' ? `${mistakeCount || 0} to review` : (currentMode.recommended ? 'Recommended' : currentMode.name);
  if ($('#practiceFeatureTitle')) $('#practiceFeatureTitle').textContent = block.title;
  if ($('#practiceFeatureDesc')) $('#practiceFeatureDesc').textContent = block.description;
  if ($('#practiceFeatureMode')) $('#practiceFeatureMode').textContent = currentMode.label;
  if ($('#practiceRingValue')) $('#practiceRingValue').textContent = overall.accuracy === null ? '—' : `${overall.accuracy}%`;
  if ($('#practiceInsightReviewed')) $('#practiceInsightReviewed').textContent = String(overall.attempts || 0);
  if ($('#practiceGoalText')) $('#practiceGoalText').textContent = `${goalNow} / 5`;
  if ($('#practiceGoalBar2')) $('#practiceGoalBar2').style.width = `${(goalNow / 5) * 100}%`;

  const featurePreview = previewWords(block, 4);
  $('#practiceFeaturePreview').innerHTML = featurePreview.map(w => `<span><b>${escapeHtml(baseHanzi(w))}</b><small>${escapeHtml(w.pinyin)}</small></span>`).join('');
  const art = $('#practiceFeatureArt');
  if (art) art.src = `assets/ui/practice-block-${block.id}.png`;
  const startBtn = $('#startSelectedPractice');
  if (startBtn) {
    startBtn.disabled = startDisabled;
    startBtn.textContent = startDisabled ? 'No mistakes yet' : 'Start practice →';
  }

  $('#practicePeekLeft').innerHTML = renderPeek(prevBlock, 'left');
  $('#practicePeekRight').innerHTML = renderPeek(nextBlock, 'right');
  $('#practicePeekLeft').onclick = () => { selectedBlockId = prevBlock.id; save(); renderPracticeHome(); };
  $('#practicePeekRight').onclick = () => { selectedBlockId = nextBlock.id; save(); renderPracticeHome(); };
  $('#practicePrevBlock').onclick = () => { selectedBlockId = prevBlock.id; save(); renderPracticeHome(); };
  $('#practiceNextBlock').onclick = () => { selectedBlockId = nextBlock.id; save(); renderPracticeHome(); };

  const dots = PRACTICE_BLOCKS.map((item, idx) => `<button type="button" class="${item.id === block.id ? 'active' : ''}" aria-label="Go to block ${item.id}" data-block-id="${item.id}"></button>`).join('');
  $('#practiceCarouselDots').innerHTML = dots;
  $$('#practiceCarouselDots button').forEach(btn => btn.addEventListener('click', () => {
    selectedBlockId = +btn.dataset.blockId;
    save();
    renderPracticeHome();
  }));

  $('#practiceModeGridMain').innerHTML = modeOrder.map(id => {
    const m = modeMap[id];
    const active = selectedPracticeMode === id;
    return `<button class="practiceModeCard practiceModeImageCard ${m.cls} ${active ? 'active' : ''}" type="button" data-mode="${id}" aria-pressed="${active ? 'true' : 'false'}">
      <div class="practiceModeVisual">
        <img class="practiceModeVisualImage" src="${m.art}" alt="" loading="lazy" decoding="async">
        ${m.recommended ? '<span class="practiceModeBadge">Recommended</span>' : ''}
        ${active ? '<span class="practiceModeSelectedMark" aria-hidden="true">✓</span>' : ''}
      </div>
      <div class="practiceModeImageBody">
        <b>${escapeHtml(m.name)}</b>
        <p>${escapeHtml(m.desc)}</p>
        <span class="practiceModeArrow" aria-hidden="true">›</span>
      </div>
    </button>`;
  }).join('');
  $$('#practiceModeGridMain .practiceModeCard').forEach(btn => btn.addEventListener('click', () => setPracticeMode(btn.dataset.mode)));

  const shell = $('#practiceCarouselShell');
  if (shell) {
    let startX = 0;
    shell.ontouchstart = (e) => {
      startX = e.changedTouches[0]?.clientX || 0;
    };
    shell.ontouchend = (e) => {
      const endX = e.changedTouches[0]?.clientX || 0;
      const delta = endX - startX;
      if (Math.abs(delta) < 40) return;
      selectedBlockId = delta < 0 ? nextBlock.id : prevBlock.id;
      save();
      renderPracticeHome();
    };
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openPracticeBlock(id) {
  const block = blockById(id);
  if (!block) return;
  selectedBlockId = block.id;
  save();
  switchPage('practice');
  renderPracticeHome();
}

function renderBlockView() {
  const block = blockById(selectedBlockId);
  if (!block) return;
  $('#practiceHome').hidden = true;
  $('#exerciseView').hidden = true;
  $('#blockView').hidden = false;

  const practiced = practicedWordsForBlock(block);
  const progressPct = Math.round((practiced.length / block.words.length) * 100);

  $('#blockEyebrow').textContent = `BLOCK ${block.id} · 15 WORDS`;
  $('#blockTitle').textContent = block.title;
  $('#blockDescription').textContent = block.description;
  $('#blockAccuracy').textContent = `${progressPct}%`;
  $('#blockProgressBar').style.width = `${progressPct}%`;
  $('#blockPracticedCount').textContent = `${practiced.length} of ${block.words.length} words practiced.`;

  const previewCount = 8;
  const previewWords = block.words.slice(0, previewCount);
  $('#blockWords').innerHTML = previewWords.map(n => {
    const w = wordByN(n);
    return `
      <button class="wordChip previewWordChip" type="button" data-word-n="${n}">
        <b>${escapeHtml(w.hanzi)}</b>
        <span>${escapeHtml(w.en)}</span>
      </button>`;
  }).join('') + `
    <button class="wordChip previewWordChip moreWordsChip" type="button" data-view-all-words="true">
      <b>+${Math.max(0, block.words.length - previewCount)}</b>
      <span>more words</span>
    </button>`;

  $$('.previewWordChip[data-word-n]').forEach(btn =>
    btn.addEventListener('click', () => openCardFromBlock(+btn.dataset.wordN))
  );
  $('[data-view-all-words]')?.addEventListener('click', () => {
    const first = block.words[0];
    if (first) openCardFromBlock(first);
  });

  const mistakeCount = mistakeWordsForBlock(block).length;
  $('#practiceMistakes').disabled = mistakeCount === 0;
  $('#mistakeActionText').textContent = mistakeCount
    ? `${mistakeCount} ${mistakeCount === 1 ? 'word needs' : 'words need'} another look.`
    : 'No saved mistakes in this block yet.';

  const orderedModes = ['mixed', 'meaning', 'listening', 'hanziPinyin', 'typeHanzi', 'buildSentence', 'association'];
  $('#skillGrid').innerHTML = orderedModes.map(modeId => {
    const skill = PRACTICE_SKILLS.find(s => s.id === modeId);
    if (!skill) return '';
    const active = selectedPracticeMode === skill.id;
    const iconMap = {
      mixed: '↝',
      meaning: '▤',
      listening: '耳',
      hanziPinyin: '拼',
      typeHanzi: '键',
      association: '句',
      buildSentence: '排'
    };
    return `
      <button class="practiceModeButton ${active ? 'active' : ''} mode-${skill.id}" type="button"
              data-skill="${skill.id}" aria-pressed="${active ? 'true' : 'false'}">
        <span class="practiceModeButtonIcon">${escapeHtml(iconMap[skill.id] || skill.icon)}</span>
        <span class="practiceModeButtonName">${escapeHtml(skill.name === 'Mixed practice' ? 'Mixed' : skill.name)}</span>
        ${skill.id === 'mixed' ? '<small>Recommended</small>' : ''}
      </button>`;
  }).join('');

  $$('.practiceModeButton').forEach(btn =>
    btn.addEventListener('click', () => setPracticeMode(btn.dataset.skill))
  );
}

function openCardFromBlock(n) {
  const block = blockById(selectedBlockId);
  const idx = WORDS.findIndex(w => w.n === n);
  if (!block || idx < 0) return;
  cardScope = { type: 'block', id: block.id };
  cardIndex = idx;
  save();
  $('#cardExplorer').hidden = true;
  $('#cardView').hidden = false;
  switchPage('vocab');
  renderLearningCard();
}

function uniquePinyinInBlock(word, block) {
  const key = word.pinyin.trim().toLowerCase();
  return block.words.filter(n => wordByN(n)?.pinyin.trim().toLowerCase() === key).length === 1;
}

function uniqueEnglishInBlock(word, block) {
  const key = word.en.trim().toLowerCase();
  return block.words.filter(n => wordByN(n)?.en.trim().toLowerCase() === key).length === 1;
}

function optionWords(block, target, labelFn, max = 4) {
  const targetLabel = labelFn(target).trim().toLowerCase();
  const seen = new Set([targetLabel]);
  const candidates = shuffle(block.words.map(wordByN).filter(Boolean).filter(w => w.n !== target.n));
  const picks = [target];
  for (const w of candidates) {
    const label = labelFn(w).trim().toLowerCase();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    picks.push(w);
    if (picks.length >= max) break;
  }
  return shuffle(picks);
}

function makeMeaningQuestion(target, block) {
  const canReverse = uniqueEnglishInBlock(target, block);
  const reverse = canReverse && Math.random() < 0.5;
  if (reverse) {
    return {
      skill: 'meaning',
      type: 'MEANING · ENGLISH → HANZI',
      prompt: `<span class="promptEnglish">${escapeHtml(target.en)}</span>`,
      sub: 'Which Mandarin word matches this meaning?',
      options: optionWords(block, target, w => w.hanzi).map(w => ({ n: w.n, label: w.hanzi })),
      answerLabel: target.hanzi
    };
  }
  return {
    skill: 'meaning',
    type: 'MEANING · HANZI → ENGLISH',
    prompt: `<span class="promptHanzi">${escapeHtml(target.hanzi)}</span>`,
    sub: 'What does this word mean?',
    options: optionWords(block, target, w => w.en).map(w => ({ n: w.n, label: w.en })),
    answerLabel: target.en
  };
}

function makeHanziPinyinQuestion(target, block) {
  const reverse = uniquePinyinInBlock(target, block) && Math.random() < 0.5;
  if (reverse) {
    return {
      skill: 'hanziPinyin',
      type: 'HANZI & PINYIN · SOUND → FORM',
      prompt: `<span class="promptPinyin">${escapeHtml(target.pinyin)}</span>`,
      sub: 'Which Hanzi matches this pronunciation?',
      options: optionWords(block, target, w => w.hanzi).map(w => ({ n: w.n, label: w.hanzi })),
      answerLabel: target.hanzi
    };
  }
  return {
    skill: 'hanziPinyin',
    type: 'HANZI & PINYIN · FORM → SOUND',
    prompt: `<span class="promptHanzi">${escapeHtml(target.hanzi)}</span>`,
    sub: 'Which pinyin matches this word?',
    options: optionWords(block, target, w => w.pinyin).map(w => ({ n: w.n, label: w.pinyin })),
    answerLabel: target.pinyin
  };
}

function acceptedHanziForms(word) {
  const raw = String(word?.hanzi || '').trim();
  if (!raw) return [];
  const match = raw.match(/^([^（(]+)[（(]([^）)]+)[）)]$/);
  if (!match) return [raw];
  return [...new Set([match[1].trim(), match[2].trim()].filter(Boolean))];
}

function normalizeTypedHanzi(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\s，。！？、；：,.!?;:'“”‘’"`]/g, '')
    .trim();
}

function makeTypeHanziQuestion(target, block) {
  const r = Math.random();
  const typedTarget = acceptedHanziForms(target)[0] || baseHanzi(target);
  if (r < 0.58) {
    return {
      skill: 'typeHanzi',
      type: 'TYPE HANZI · HANZI → KEYBOARD',
      prompt: `<span class="promptHanzi">${escapeHtml(typedTarget)}</span>`,
      sub: `Use your device’s Chinese Pinyin keyboard to type the same Hanzi. <span class="typeMeaning">${escapeHtml(target.en)}</span>`,
      textInput: true,
      answerLabel: typedTarget,
      acceptedForms: acceptedHanziForms(target),
      hintPinyin: target.pinyin,
      inputPlaceholder: 'Type Chinese characters…'
    };
  }
  if (r < 0.8) {
    return {
      skill: 'typeHanzi',
      type: 'TYPE HANZI · MEANING → FORM',
      prompt: `<span class="promptEnglish">${escapeHtml(target.en)}</span>`,
      sub: 'Recall the Mandarin word, then produce it with your Chinese Pinyin keyboard.',
      textInput: true,
      answerLabel: typedTarget,
      acceptedForms: acceptedHanziForms(target),
      hintPinyin: target.pinyin,
      inputPlaceholder: 'Type the Hanzi…'
    };
  }
  return {
    skill: 'typeHanzi',
    type: 'TYPE HANZI · LISTEN → FORM',
    prompt: '<span class="listenMark">耳</span>',
    sub: 'Listen, then type what you hear using your Chinese Pinyin keyboard.',
    audio: true,
    textInput: true,
    answerLabel: typedTarget,
    acceptedForms: acceptedHanziForms(target),
    hintPinyin: target.pinyin,
    inputPlaceholder: 'Type what you hear…'
  };
}

function makeListeningQuestion(target, block) {
  if (!uniquePinyinInBlock(target, block)) {
    return {
      skill: 'listening',
      type: 'LISTENING · SOUND → PINYIN',
      prompt: '<span class="listenMark">耳</span>',
      sub: 'Listen first. Which pronunciation did you hear?',
      audio: true,
      options: optionWords(block, target, w => w.pinyin).map(w => ({ n: w.n, label: w.pinyin })),
      answerLabel: target.pinyin
    };
  }
  const toMeaning = Math.random() < 0.5;
  if (toMeaning) {
    return {
      skill: 'listening',
      type: 'LISTENING · SOUND → MEANING',
      prompt: '<span class="listenMark">耳</span>',
      sub: 'Listen first. What does the word mean?',
      audio: true,
      options: optionWords(block, target, w => w.en).map(w => ({ n: w.n, label: w.en })),
      answerLabel: target.en
    };
  }
  return {
    skill: 'listening',
    type: 'LISTENING · SOUND → HANZI',
    prompt: '<span class="listenMark">耳</span>',
    sub: 'Listen first. Which word did you hear?',
    audio: true,
    options: optionWords(block, target, w => w.hanzi).map(w => ({ n: w.n, label: w.hanzi })),
    answerLabel: target.hanzi
  };
}

function blankTargetInSentence(sentence, target) {
  const base = baseHanzi(target);
  const i = sentence.indexOf(base);
  if (i < 0) return sentence;
  return `${sentence.slice(0, i)}＿＿${sentence.slice(i + base.length)}`;
}

function makeAssociationQuestion(target, block) {
  return {
    skill: 'association',
    type: 'ASSOCIATION · USE IN CONTEXT',
    prompt: `<span class="promptSentence">${escapeHtml(blankTargetInSentence(target.example.hanzi, target))}</span>`,
    sub: `${escapeHtml(target.example.en)} · Which word completes the sentence?`,
    options: optionWords(block, target, w => w.hanzi).map(w => ({ n: w.n, label: w.hanzi })),
    answerLabel: target.hanzi
  };
}

function tokenizeChineseSentence(sentence) {
  const src = String(sentence || '').trim();
  if (!src) return [];
  const vocab = WORDS.map(w => baseHanzi(w)).filter(Boolean).sort((a, b) => b.length - a.length);
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[，。！？!?、；：,.]/.test(ch)) { tokens.push(ch); i += 1; continue; }
    let match = '';
    for (const form of vocab) {
      if (form && src.startsWith(form, i)) { match = form; break; }
    }
    if (match) {
      tokens.push(match);
      i += match.length;
      continue;
    }
    tokens.push(ch);
    i += 1;
  }
  return tokens;
}

function makeBuildSentenceQuestion(target, block) {
  const answerTokens = tokenizeChineseSentence(target.example?.hanzi || target.hanzi).filter(Boolean);
  if (answerTokens.length < 2) return makeAssociationQuestion(target, block);
  const useEnglish = Math.random() < 0.5;
  const cueHtml = useEnglish
    ? `<span class="promptEnglish sentenceBuilderCue">${escapeHtml(target.example.en)}</span>`
    : `<span class="promptPinyin sentenceBuilderCue">${escapeHtml(target.example.pinyin)}</span>`;
  return {
    skill: 'buildSentence',
    type: useEnglish ? 'SENTENCE BUILDER · ENGLISH → HANZI' : 'SENTENCE BUILDER · PINYIN → HANZI',
    prompt: cueHtml,
    sub: useEnglish
      ? 'Read the English sentence, then drag the Hanzi blocks into the correct order.'
      : 'Read the pinyin cue, then drag the Hanzi blocks into the correct Chinese sentence.',
    builder: true,
    answerLabel: target.example.hanzi,
    answerTokens,
    bankTokens: shuffle(answerTokens.map((text, index) => ({ id: `${target.n}-${index}-${text}`, text })))
  };
}

function makeQuestion(target, requestedSkill, block) {
  let skill = requestedSkill;
  const availableSkills = ['meaning', 'hanziPinyin', 'typeHanzi', 'listening', 'association', 'buildSentence'];
  if (requestedSkill === 'mixed') skill = shuffle(availableSkills)[0];
  if (requestedSkill === 'mistakes') {
    const weak = mistakeSkillsForWord(target.n);
    skill = weak.length ? shuffle(weak)[0] : shuffle(availableSkills)[0];
  }
  let q;
  if (skill === 'meaning') q = makeMeaningQuestion(target, block);
  if (skill === 'hanziPinyin') q = makeHanziPinyinQuestion(target, block);
  if (skill === 'typeHanzi') q = makeTypeHanziQuestion(target, block);
  if (skill === 'listening') q = makeListeningQuestion(target, block);
  if (skill === 'association') q = makeAssociationQuestion(target, block);
  if (skill === 'buildSentence') q = makeBuildSentenceQuestion(target, block);
  return { ...q, target, requestedSkill, recorded: false, usedHint: false, wrongInputs: [] };
}

function startExercise(skill) {
  restoreExerciseCardShell();
  const block = blockById(selectedBlockId);
  if (!block) return;
  const queue = skill === 'mistakes' ? mistakeWordsForBlock(block) : block.words;
  if (!queue.length) return;
  exerciseSession = {
    blockId: block.id,
    skill,
    queue: shuffle(queue),
    index: 0,
    correct: 0,
    attempts: 0
  };
  $('#practiceHome').hidden = true;
  $('#blockView').hidden = true;
  $('#exerciseView').hidden = false;
  renderExerciseQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exercisePresentation(q) {
  const type=String(q.type||'');
  if(q.skill==='listening') return {mode:'Listening Practice',title:'What did you hear?'};
  if(q.skill==='typeHanzi') return {mode:'Type Hanzi Practice',title:'Type the Hanzi.'};
  if(q.skill==='association') return {mode:'Association Practice',title:'Complete the sentence.'};
  if(q.skill==='buildSentence') return {mode:'Sentence Builder',title:'Build the sentence.'};
  if(q.skill==='hanziPinyin') return {mode:'Hanzi ↔ Pinyin Practice',title:type.includes('SOUND → FORM')?'Which Hanzi matches this pronunciation?':'Match the Hanzi with the pinyin.'};
  return {mode:'Meaning Practice',title:type.includes('ENGLISH → HANZI')?'Which Hanzi matches this meaning?':'What does this mean?'};
}

function renderExerciseQuestion() {
  clearPracticeReactions();
  const session=exerciseSession, block=session?blockById(session.blockId):null; if(!session||!block)return;
  if(session.index>=session.queue.length){renderSessionComplete();return;}
  const target=wordByN(session.queue[session.index]); exerciseQuestion=makeQuestion(target,session.skill,block); const q=exerciseQuestion;
  const skillName=session.skill==='mistakes'?'Mistake review':(PRACTICE_SKILLS.find(s=>s.id===session.skill)?.name||'Practice');
  const p=exercisePresentation(q), card=$('#exerciseLessonCard');
  if(card){card.dataset.skill=q.skill;card.style.setProperty('--lesson-block-art',`url("assets/ui/practice-block-${block.id}.png")`);}
  $('#exerciseLabel').textContent=`${block.title} · ${skillName}`; $('#exerciseCount').textContent=`${session.index+1} / ${session.queue.length}`;
  $('#exerciseProgress').style.width=`${((session.index+1)/session.queue.length)*100}%`; $('#exerciseModeName').textContent=p.mode; $('#exerciseQuestionTitle').textContent=p.title; $('#questionType').textContent=q.type;
  const prompt=$('#questionPrompt'); prompt.className='questionPrompt';
  if(q.skill==='listening'){prompt.innerHTML='';prompt.classList.add('isListeningPrompt');}
  else if(q.skill==='meaning'&&q.type.includes('HANZI → ENGLISH')) prompt.innerHTML=`<div class="lessonWordCard"><span class="promptHanzi">${escapeHtml(target.hanzi)}</span><span class="promptHelperPinyin">${escapeHtml(target.pinyin)}</span></div>`;
  else prompt.innerHTML=q.prompt;
  $('#questionSub').innerHTML=q.sub||'';
  const audio=$('#questionAudio'); audio.hidden=!q.audio; audio.className=`exerciseAudio lessonAudioButton${q.skill==='listening'?' isHeroAudio':''}`;
  if(q.skill==='listening'){
    audio.innerHTML='<span class="lessonAudioIcon" aria-hidden="true">🔊</span>';
    audio.setAttribute('aria-label','Play audio');
    audio.setAttribute('title','Play audio');
  } else {
    audio.innerHTML='<span class="lessonAudioIcon">🔊</span><span class="lessonAudioText">Listen</span>';
    audio.setAttribute('aria-label','Listen');
    audio.removeAttribute('title');
  }
  const feedback=$('#feedbackPanel'); feedback.hidden=true; feedback.className='feedbackPanel lessonFeedback'; $('#feedbackAnswerLine').innerHTML='';
  $('#exerciseOptions').className=`exerciseOptions lessonOptions skill-${q.skill}`;
  if(q.builder) renderBuildSentenceInput(q);
  else if(q.textInput) renderTypeHanziInput(q);
  else {
    $('#exerciseOptions').innerHTML=q.options.map(o=>{
      const label=String(o.label||'');
      const optionClass=/[\u3400-\u9fff]/.test(label)?' optionHanzi':/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]|[a-z]+[1-5](?:\s|$)/i.test(label)?' optionPinyin':' optionEnglish';
      return `<button class="exerciseOption lessonOption${optionClass}" type="button" data-n="${o.n}"><span class="optionRadio" aria-hidden="true"></span><span class="optionText">${escapeHtml(label)}</span><span class="optionResultIcon" aria-hidden="true"></span></button>`;
    }).join('');
    $$('.exerciseOption').forEach(btn=>btn.addEventListener('click',()=>answerExercise(btn)));
  }
}

function renderTypeHanziInput(q) {
  const host=$('#exerciseOptions'); host.classList.add('typingExerciseHost','lessonTypingHost');
  host.innerHTML=`<form id="typeHanziForm" class="typeHanziForm lessonTypeForm" novalidate>
    <div class="lessonTypeCue">Use your Chinese Pinyin keyboard</div>
    <div class="typeInputRow lessonTypeInputRow"><input id="typeHanziInput" class="typeHanziInput lessonTypeInput" type="text" lang="zh-CN" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="${escapeHtml(q.inputPlaceholder||'Type Hanzi…')}" aria-describedby="typeKeyboardTip typingStatus"><button id="checkTypedHanzi" class="primaryButton typeCheckButton lessonCheckButton" type="submit">Check</button></div>
    <p id="typeKeyboardTip" class="typeKeyboardTip lessonKeyboardTip">Type pinyin, then choose the correct Hanzi candidate.</p>
    <div class="typeAssistRow lessonTypeAssistRow"><button id="typeHintButton" class="typeHintButton" type="button">Show pinyin hint</button><button id="typeListenButton" class="typeHintButton" type="button">🔊 Listen</button></div>
    <div id="typingHint" class="typingHint" hidden></div><div id="typingStatus" class="typingStatus" aria-live="polite"></div></form>`;
  let composing=false; const input=$('#typeHanziInput'), form=$('#typeHanziForm');
  input.addEventListener('compositionstart',()=>{composing=true;}); input.addEventListener('compositionend',()=>{composing=false;});
  input.addEventListener('input',()=>{input.classList.remove('isWrong');$('#typingStatus').className='typingStatus';$('#typingStatus').textContent='';});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.isComposing||composing))return;});
  form.addEventListener('submit',e=>{e.preventDefault();if(composing)return;checkTypedHanzi();});
  $('#typeHintButton').addEventListener('click',()=>{q.usedHint=true;const hint=$('#typingHint');hint.hidden=false;hint.innerHTML=`<b>Pinyin:</b> ${escapeHtml(q.hintPinyin||q.target.pinyin)}`;$('#typeHintButton').disabled=true;});
  $('#typeListenButton').addEventListener('click',()=>speak(q.target.hanzi,true)); setTimeout(()=>input?.focus({preventScroll:true}),80);
}


function renderBuildSentenceInput(q) {
  const host = $('#exerciseOptions');
  host.classList.add('sentenceBuilderHost', 'lessonSentenceBuilderHost');
  if (!q.builderState) q.builderState = { bank: (q.bankTokens || []).slice(), answer: [] };
  host.innerHTML = `
    <div class="builderShell">
      <div class="builderZone">
        <div class="builderZoneHead">Your sentence</div>
        <div id="builderAnswerZone" class="builderDropZone builderAnswerZone ${q.builderState.answer.length ? '' : 'isEmpty'}"></div>
        <div class="builderHintLine">Tap a block to move it, or drag to reorder.</div>
      </div>
      <div class="builderActions">
        <button id="builderResetButton" class="typeHintButton" type="button">Reset blocks</button>
        <button id="builderCheckButton" class="primaryButton lessonCheckButton" type="button">Check</button>
      </div>
      <div class="builderZone">
        <div class="builderZoneHead">Available blocks</div>
        <div id="builderBankZone" class="builderDropZone builderBankZone ${q.builderState.bank.length ? '' : 'isEmpty'}"></div>
      </div>
      <div id="builderStatus" class="builderStatus" aria-live="polite"></div>
    </div>`;
  bindBuildSentenceControls(q);
  renderBuildSentenceState(q);
}

function bindBuildSentenceControls(q) {
  $('#builderResetButton')?.addEventListener('click', () => {
    q.builderState = { bank: (q.bankTokens || []).slice(), answer: [] };
    const status = $('#builderStatus');
    if (status) { status.textContent = ''; status.className = 'builderStatus'; }
    renderBuildSentenceState(q);
  });
  $('#builderCheckButton')?.addEventListener('click', () => checkBuiltSentence());
}

function moveBuilderToken(q, fromKey, fromIndex, toKey, toIndex = null) {
  const from = q.builderState?.[fromKey];
  const to = q.builderState?.[toKey];
  if (!from || !to || fromIndex < 0 || fromIndex >= from.length) return;
  const [token] = from.splice(fromIndex, 1);
  if (!token) return;
  if (toIndex === null || toIndex < 0 || toIndex > to.length) to.push(token);
  else to.splice(toIndex, 0, token);
  renderBuildSentenceState(q);
}

function renderBuildSentenceState(q) {
  const answerZone = $('#builderAnswerZone');
  const bankZone = $('#builderBankZone');
  if (!answerZone || !bankZone) return;

  const renderToken = (token, sourceKey, index) => {
    const punctuation = /^[，。！？!?、；：,.]$/.test(token.text);
    return `<button class="builderToken ${punctuation ? 'isPunctuation' : ''}" type="button" draggable="true" data-source="${sourceKey}" data-index="${index}">${escapeHtml(token.text)}</button>`;
  };

  answerZone.innerHTML = q.builderState.answer.length
    ? q.builderState.answer.map((token, index) => renderToken(token, 'answer', index)).join('')
    : '<div class="builderPlaceholder">Drag or tap the blocks here</div>';
  bankZone.innerHTML = q.builderState.bank.length
    ? q.builderState.bank.map((token, index) => renderToken(token, 'bank', index)).join('')
    : '<div class="builderPlaceholder">All blocks are in your sentence</div>';

  answerZone.classList.toggle('isEmpty', !q.builderState.answer.length);
  bankZone.classList.toggle('isEmpty', !q.builderState.bank.length);

  const zones = [
    { el: answerZone, key: 'answer' },
    { el: bankZone, key: 'bank' }
  ];

  zones.forEach(({ el, key }) => {
    el.addEventListener('dragover', ev => { ev.preventDefault(); el.classList.add('isDragOver'); });
    el.addEventListener('dragleave', () => el.classList.remove('isDragOver'));
    el.addEventListener('drop', ev => {
      ev.preventDefault();
      el.classList.remove('isDragOver');
      try {
        const payload = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}');
        if (!payload.source) return;
        const targetButton = ev.target.closest('.builderToken');
        const insertAt = targetButton ? +targetButton.dataset.index : q.builderState[key].length;
        moveBuilderToken(q, payload.source, +payload.index, key, insertAt);
      } catch (_) {}
    });
  });

  $$('.builderToken').forEach(btn => {
    btn.addEventListener('click', () => {
      const source = btn.dataset.source;
      const index = +btn.dataset.index;
      moveBuilderToken(q, source, index, source === 'bank' ? 'answer' : 'bank', null);
    });
    btn.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', JSON.stringify({ source: btn.dataset.source, index: btn.dataset.index }));
      btn.classList.add('isDragging');
    });
    btn.addEventListener('dragend', () => btn.classList.remove('isDragging'));
  });
}

function builtSentenceText(q) {
  return (q?.builderState?.answer || []).map(token => token.text).join('');
}

function showBuildSentenceFeedback(q) {
  const target = q.target, feedback = $('#feedbackPanel');
  feedback.hidden = false;
  feedback.className = 'feedbackPanel lessonFeedback isCorrect';
  $('#feedbackStatus').textContent = resultHeadlineFor(q, true);
  $('#feedbackAnswerLine').innerHTML = feedbackAnswerHtml(target, true, q);
  $('#feedbackCompare').hidden = true;
  $('#feedbackCompare').innerHTML = '';
  populateFeedbackDetails(target);
  $('#nextExercise').textContent = exerciseSession.index === exerciseSession.queue.length - 1 ? 'Finish session →' : 'Continue →';
  showLearningFeedback(true);
  $('#nextExercise').focus({ preventScroll: true });
  feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function checkBuiltSentence() {
  const q = exerciseQuestion;
  const session = exerciseSession;
  if (!q?.builder || !session || !$('#feedbackPanel').hidden) return;
  const built = builtSentenceText(q);
  const expected = (q.answerTokens || []).join('');
  const correctNow = built === expected;
  const status = $('#builderStatus');

  if (!built) {
    if (status) {
      status.className = 'builderStatus isWrong';
      status.textContent = 'Move the Hanzi blocks into the answer area first.';
    }
    return;
  }

  if (!q.recorded) {
    q.recorded = true;
    const firstTryCorrect = correctNow;
    session.attempts += 1;
    if (firstTryCorrect) session.correct += 1;
    recordPracticeAnswer(q.target.n, q.skill, firstTryCorrect);
  }

  if (!correctNow) {
    if (status) {
      status.className = 'builderStatus isWrong';
      status.textContent = 'Not quite. Rearrange the blocks and try again.';
    }
    showTransientTypingReaction(false);
    return;
  }

  if (status) {
    status.className = 'builderStatus isCorrect';
    status.textContent = '✓ Correct sentence.';
  }
  $$('.builderToken').forEach(btn => btn.disabled = true);
  $('#builderResetButton')?.setAttribute('disabled', 'true');
  $('#builderCheckButton')?.setAttribute('disabled', 'true');
  showBuildSentenceFeedback(q);
}

function findWordByTypedHanzi(value) {
  const normalized = normalizeTypedHanzi(value);
  if (!normalized) return null;
  return WORDS.find(w => acceptedHanziForms(w).some(form => normalizeTypedHanzi(form) === normalized)) || null;
}

function checkTypedHanzi() {
  const q = exerciseQuestion;
  const session = exerciseSession;
  const input = $('#typeHanziInput');
  if (!q?.textInput || !session || !input || !$('#feedbackPanel').hidden) return;

  const typedRaw = input.value;
  const typed = normalizeTypedHanzi(typedRaw);
  const accepted = (q.acceptedForms?.length ? q.acceptedForms : [q.answerLabel]).map(normalizeTypedHanzi);
  const correctNow = !!typed && accepted.includes(typed);

  if (!typed) {
    $('#typingStatus').className = 'typingStatus isWrong';
    $('#typingStatus').textContent = 'Choose a Hanzi candidate from your Chinese keyboard first.';
    input.focus();
    return;
  }

  if (!q.recorded) {
    q.recorded = true;
    const firstTryCorrect = correctNow && !q.usedHint;
    session.attempts += 1;
    if (firstTryCorrect) session.correct += 1;
    recordPracticeAnswer(q.target.n, q.skill, firstTryCorrect);
  }

  if (!correctNow) {
    q.wrongInputs.push(typedRaw.trim());
    const known = findWordByTypedHanzi(typedRaw);
    input.classList.add('isWrong');
    $('#typingStatus').className = 'typingStatus isWrong';
    $('#typingStatus').innerHTML = known
      ? `Not quite. You typed <b>${escapeHtml(known.hanzi)}</b> · ${escapeHtml(known.pinyin)} · ${escapeHtml(known.en)}. Keep the target in mind and try again.`
      : `Not quite. <b>${escapeHtml(typedRaw.trim())}</b> does not match the target yet. Try another candidate.`;
    showTransientTypingReaction(false);
    input.select();
    input.focus();
    return;
  }

  input.disabled = true;
  $('#checkTypedHanzi').disabled = true;
  $('#typeHintButton').disabled = true;
  $('#typeListenButton').disabled = true;
  input.classList.remove('isWrong');
  input.classList.add('isCorrect');
  $('#typingStatus').className = 'typingStatus isCorrect';
  $('#typingStatus').textContent = q.wrongInputs.length || q.usedHint
    ? '✓ Correct now. You repaired the answer before moving on.'
    : '✓ Correct on your first try.';
  showTypeHanziFeedback(q, typedRaw.trim());
}

function resultHeadlineFor(q,correct){if(!correct)return q?.skill==='buildSentence'?'Almost there.':'Not quite.';if(q?.skill==='buildSentence')return 'Sentence complete!';if(q?.skill==='hanziPinyin')return 'Great match!';if(q?.skill==='association')return 'Nice context!';return 'Correct!';}
function feedbackAnswerHtml(target,correct,q){const h=escapeHtml(baseHanzi(target)),p=escapeHtml(target.pinyin),e=escapeHtml(target.en);if(q?.skill==='buildSentence'){const sentenceH=escapeHtml(target.example.hanzi),sentenceP=escapeHtml(target.example.pinyin),sentenceE=escapeHtml(target.example.en);if(correct)return `You built <b class="answerHanziInline">${sentenceH}</b> (${sentenceP}) · ${sentenceE}.`;return `Correct sentence: <b class="answerHanziInline">${sentenceH}</b> (${sentenceP}) · ${sentenceE}.`;}if(correct){if(q?.skill==='typeHanzi')return `You typed <b class="answerHanziInline">${h}</b> (${p}) · ${e}.`;return `<b class="answerHanziInline">${h}</b> (${p}) means “${e}.”`;}return `Correct answer: <b class="answerHanziInline">${h}</b> (${p}) · ${e}.`;}
function populateFeedbackDetails(target){$('#feedbackHanzi').textContent=target.hanzi;$('#feedbackPinyin').textContent=target.pinyin;$('#feedbackEnglish').textContent=target.en;$('#feedbackExplanation').textContent=target.explanation;$('#feedbackExampleHanzi').textContent=target.example.hanzi;$('#feedbackExamplePinyin').textContent=target.example.pinyin;$('#feedbackExampleEnglish').textContent=target.example.en;}
function showTypeHanziFeedback(q,typedValue){const target=q.target,feedback=$('#feedbackPanel');feedback.hidden=false;feedback.className='feedbackPanel lessonFeedback isCorrect';$('#feedbackStatus').textContent=resultHeadlineFor(q,true);$('#feedbackAnswerLine').innerHTML=feedbackAnswerHtml(target,true,q);$('#feedbackCompare').hidden=true;$('#feedbackCompare').innerHTML='';populateFeedbackDetails(target);$('#nextExercise').textContent=exerciseSession.index===exerciseSession.queue.length-1?'Finish session →':'Continue →';showLearningFeedback(true);$('#nextExercise').focus({preventScroll:true});feedback.scrollIntoView({behavior:'smooth',block:'nearest'});}

function answerExercise(button){
  if(!exerciseSession||!exerciseQuestion||!$('#feedbackPanel').hidden)return; const q=exerciseQuestion, chosenN=+button.dataset.n, target=q.target, correct=chosenN===target.n;
  exerciseSession.attempts+=1;if(correct)exerciseSession.correct+=1;recordPracticeAnswer(target.n,q.skill,correct);
  $$('.exerciseOption').forEach(btn=>{btn.disabled=true;if(+btn.dataset.n===target.n)btn.classList.add('correct');});if(!correct)button.classList.add('wrong');
  const feedback=$('#feedbackPanel');feedback.hidden=false;feedback.className=`feedbackPanel lessonFeedback ${correct?'isCorrect':'isWrong'}`;$('#feedbackStatus').textContent=resultHeadlineFor(q,correct);$('#feedbackAnswerLine').innerHTML=feedbackAnswerHtml(target,correct,q);$('#feedbackCompare').hidden=true;$('#feedbackCompare').innerHTML='';populateFeedbackDetails(target);$('#nextExercise').textContent=exerciseSession.index===exerciseSession.queue.length-1?'Finish session →':'Continue →';showLearningFeedback(correct);$('#nextExercise').focus({preventScroll:true});feedback.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function renderSessionComplete() {
  const session = exerciseSession;
  const block = session ? blockById(session.blockId) : null;
  if (!session || !block) return;
  const pct = session.attempts ? Math.round((session.correct / session.attempts) * 100) : 0;
  $('#exerciseCount').textContent = `${session.queue.length} / ${session.queue.length}`;
  $('#exerciseProgress').style.width = '100%';
  $('.exerciseCard').innerHTML = `
    <div class="sessionComplete">
      <div class="completeMark">✓</div>
      <p class="eyebrow">SESSION COMPLETE</p>
      <h2>${escapeHtml(block.title)}</h2>
      <div class="sessionScore">${pct}%</div>
      <p>${session.correct} correct out of ${session.attempts}. Review your result, then choose when you want to practice again.</p>
      <div class="sessionActions">
        <button id="repeatSession" class="primaryButton" type="button">Practice again</button>
        <button id="completeBack" class="secondaryButton" type="button">Back to practice</button>
      </div>
    </div>`;
  $('#repeatSession').addEventListener('click', () => { restoreExerciseCardShell(); startExercise(session.skill); });
  $('#completeBack').addEventListener('click', () => {
    restoreExerciseCardShell();
    renderPracticeHome();
  });
}

function restoreExerciseCardShell(){
  const card=$('.exerciseCard');if(!card||$('#questionPrompt'))return;card.id='exerciseLessonCard';card.className='exerciseCard exerciseLessonCard';
  card.innerHTML=`<div class="exerciseLessonDecor" aria-hidden="true"></div><div class="exerciseModeLine"><span class="exerciseBookIcon">▣</span><span id="exerciseModeName">Practice</span></div><h2 id="exerciseQuestionTitle" class="exerciseQuestionTitle">Practice</h2><div id="questionType" class="questionType" hidden></div><div id="questionPrompt" class="questionPrompt"></div><div id="questionSub" class="questionSub"></div><button id="questionAudio" class="exerciseAudio lessonAudioButton" type="button" hidden><span class="lessonAudioIcon">🔊</span><span class="lessonAudioText">Listen</span></button><div id="exerciseOptions" class="exerciseOptions"></div><div id="feedbackPanel" class="feedbackPanel lessonFeedback" hidden><div class="lessonFeedbackScene"><div class="lessonFeedbackCopy"><div class="feedbackStatus" id="feedbackStatus"></div><div id="feedbackAnswerLine" class="feedbackAnswerLine"></div></div></div><div class="feedbackSummary feedbackSummaryCompact"><div class="feedbackTarget"><div><div id="feedbackHanzi" class="feedbackHanzi"></div><div id="feedbackPinyin" class="feedbackPinyin"></div><div id="feedbackEnglish" class="feedbackEnglish"></div></div><button id="feedbackAudio" class="miniSound" type="button">🔊</button></div><div class="feedbackExampleCard"><div class="feedbackExampleHead"><div class="feedbackExampleLabel">Example</div><button id="feedbackExampleAudio" class="miniSound" type="button">🔊</button></div><div id="feedbackExampleHanzi" class="feedbackExampleHanzi"></div><div id="feedbackExamplePinyin" class="feedbackExamplePinyin"></div><div id="feedbackExampleEnglish" class="feedbackExampleEnglish"></div></div></div><div id="feedbackCompare" class="feedbackCompare" hidden></div><p id="feedbackExplanation" class="feedbackExplanation"></p><button id="nextExercise" class="primaryButton feedbackNext lessonContinueButton" type="button">Continue →</button></div>`;bindExerciseStaticActions();
}

function bindExerciseStaticActions() {
  $('#questionAudio')?.addEventListener('click', () => speak(exerciseQuestion?.target?.hanzi || '', true));
  $('#feedbackAudio')?.addEventListener('click', () => speak(exerciseQuestion?.target?.hanzi || '', true));
  $('#feedbackExampleAudio')?.addEventListener('click', () => {
    const target = exerciseQuestion?.target;
    if (target?.example?.hanzi) speak(target.example.hanzi, true);
  });
  $('#nextExercise')?.addEventListener('click', () => {
    if (!exerciseSession) return;
    exerciseSession.index += 1;
    renderExerciseQuestion();
    $('.exerciseCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

$('#backToBlocks').addEventListener('click', renderPracticeHome);
$('#openBlockCards').addEventListener('click', () => {
  const block = blockById(selectedBlockId);
  if (!block) return;
  openCardFromBlock(block.words[0]);
});
$('#practiceMistakes').addEventListener('click', () => startExercise('mistakes'));
$('#practiceReviewMistakes')?.addEventListener('click', () => startExercise('mistakes'));
$('#startSelectedPractice').addEventListener('click', () => startExercise(selectedPracticeMode));
$('#exitExercise').addEventListener('click', () => {
  restoreExerciseCardShell();
  renderPracticeHome();
});

bindExerciseStaticActions();

$('#homeOpenCards')?.addEventListener('click', openCardsExplorerHome);
$('#homeOpenPractice')?.addEventListener('click', () => {
  switchPage('practice');
  renderPracticeHome();
});

$('#homeOpenWrite')?.addEventListener('click', () => switchPage('write'));
$('#homeOpenSituations')?.addEventListener('click', () => switchPage('situations'));
$('#homeContinueButton')?.addEventListener('click', () => openPracticeBlockHome(selectedBlockId || 1));


renderLearningCard();
renderWriter();
renderPracticeHome();

// Keep Cards ready in explorer mode when the user opens that section.
cardScope = { type: 'all' };
explorerMode = { type: 'all' };
explorerQuery = '';
$('#cardSearch').value = '';
$('#cardView').hidden = true;
$('#cardExplorer').hidden = false;
renderCardExplorer();
updateStats();
switchPage('home');
