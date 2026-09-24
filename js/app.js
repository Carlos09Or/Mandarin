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

const VALID_PRACTICE_MODES = ['mixed', 'meaning', 'listening', 'hanziPinyin', 'typeHanzi', 'association'];
let selectedPracticeMode = localStorage.getItem('hsk1SelectedPracticeModeV10') || 'mixed';
if (!VALID_PRACTICE_MODES.includes(selectedPracticeMode)) selectedPracticeMode = 'mixed';

const FEEDBACK_PHRASES = {
  correct: [
    { hanzi: '太棒了！', pinyin: 'Tài bàng le!', en: 'Great!' },
    { hanzi: '很好！', pinyin: 'Hěn hǎo!', en: 'Very good!' },
    { hanzi: '答对了！', pinyin: 'Dá duì le!', en: 'Correct!' },
    { hanzi: '做得好！', pinyin: 'Zuò de hǎo!', en: 'Well done!' },
    { hanzi: '真不错！', pinyin: 'Zhēn búcuò!', en: 'Really good!' },
    { hanzi: '厉害！', pinyin: 'Lìhai!', en: 'Awesome!' }
  ],
  wrong: [
    { hanzi: '再试一次。', pinyin: 'Zài shì yí cì.', en: 'Try again.' },
    { hanzi: '差一点。', pinyin: 'Chà yìdiǎn.', en: 'Almost.' },
    { hanzi: '没关系。', pinyin: 'Méi guānxi.', en: "It's okay." },
    { hanzi: '再想想。', pinyin: 'Zài xiǎngxiang.', en: 'Think again.' },
    { hanzi: '慢慢来。', pinyin: 'Mànmàn lái.', en: 'Take your time.' },
    { hanzi: '继续加油！', pinyin: 'Jìxù jiāyóu!', en: 'Keep going!' }
  ]
};
let lastFeedbackPhrase = { correct: -1, wrong: -1 };

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
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === id));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === id));
  if (id === 'vocab') renderLearningCard();
  if (id === 'write') renderWriter();
  if (id === 'practice') renderPracticeHome();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.tab').forEach(t => t.addEventListener('click', () => {
  const page = t.dataset.page;
  if (page === 'vocab') {
    switchPage('vocab');
    cardScope = { type: 'all' };
    explorerMode = { type: 'all' };
    explorerQuery = '';
    $('#cardSearch').value = '';
    $('#cardView').hidden = true;
    $('#cardExplorer').hidden = false;
    renderCardExplorer();
    return;
  }
  switchPage(page);
}));
let hwWriter = null;
let hwMistakes = 0;
let hwCurrentStroke = 0;
let guideVisible = true;
let writerSession = 0;

function writerSize() {
  const el = $('#hanziWriterTarget');
  const w = Math.max(260, Math.min(430, Math.round(el.getBoundingClientRect().width || 360)));
  return w;
}

function resetWriterMessage(text = 'Start with the first stroke. If the stroke is wrong, you will get immediate feedback.') {
  const box = $('#traceResult');
  box.className = 'result';
  box.textContent = text;
  hwMistakes = 0;
  hwCurrentStroke = 0;
  $('#strokeCounter').textContent = 'Stroke 1';
  $('#strokeCounter').className = 'strokePill';
  $('#mistakeCounter').textContent = '0 mistakes';
  $('#mistakeCounter').className = 'strokePill';
}

function createHanziWriter(mode = 'quiz') {
  const target = $('#hanziWriterTarget');
  const chars = practiceChars(WORDS[writeIndex]);
  const ch = chars[charIndex];
  if (!ch) return;
  const session = ++writerSession;
  target.innerHTML = '';
  resetWriterMessage(mode === 'animation' ? 'Watch the stroke order. When the animation ends, practice mode will return.' : undefined);

  if (typeof HanziWriter === 'undefined') {
    $('#traceResult').className = 'result no';
    $('#traceResult').textContent = 'Hanzi Writer could not load. Check your Internet connection and reload the page.';
    return;
  }

  const size = writerSize();
  hwWriter = HanziWriter.create('hanziWriterTarget', ch, {
    width: size,
    height: size,
    padding: 24,
    showCharacter: false,
    showOutline: guideVisible,
    strokeColor: '#4e1217',
    outlineColor: '#eadbd8',
    drawingColor: '#b72d36',
    highlightColor: '#df7c83',
    highlightCompleteColor: '#2f7d59',
    drawingWidth: 12,
    strokeAnimationSpeed: 1,
    delayBetweenStrokes: 260,
    showHintAfterMisses: 2,
    acceptBackwardsStrokes: false,
    leniency: 0.85
  });

  if (mode === 'animation') {
    hwWriter.animateCharacter({ onComplete: () => {
      if (session !== writerSession) return;
      setTimeout(() => createHanziWriter('quiz'), 500);
    }});
    return;
  }

  hwWriter.quiz({
    showHintAfterMisses: 2,
    acceptBackwardsStrokes: false,
    leniency: 0.85,
    onMistake: data => {
      if (session !== writerSession) return;
      hwMistakes = data.totalMistakes;
      hwCurrentStroke = data.strokeNum;
      const box = $('#traceResult');
      box.className = 'result no';
      box.innerHTML = `❌ That stroke does not match. Draw <b>stroke ${data.strokeNum + 1}</b> in the correct direction.${data.mistakesOnStroke >= 2 ? ' Follow the highlighted hint.' : ''}`;
      $('#strokeCounter').textContent = `Stroke ${data.strokeNum + 1}`;
      $('#strokeCounter').className = 'strokePill bad';
      $('#mistakeCounter').textContent = `${data.totalMistakes} ${data.totalMistakes === 1 ? 'mistake' : 'mistakes'}`;
      $('#mistakeCounter').className = 'strokePill bad';
    },
    onCorrectStroke: data => {
      if (session !== writerSession) return;
      hwMistakes = data.totalMistakes;
      hwCurrentStroke = data.strokeNum + 1;
      const box = $('#traceResult');
      box.className = 'result ok';
      box.innerHTML = `✓ Stroke ${data.strokeNum + 1} correct${data.strokesRemaining ? ` · <b>${data.strokesRemaining}</b> left` : ''}`;
      $('#strokeCounter').textContent = data.strokesRemaining ? `Next: ${data.strokeNum + 2}` : 'Last stroke ✓';
      $('#strokeCounter').className = 'strokePill good';
      $('#mistakeCounter').textContent = `${data.totalMistakes} ${data.totalMistakes === 1 ? 'mistake' : 'mistakes'}`;
      $('#mistakeCounter').className = data.totalMistakes ? 'strokePill bad' : 'strokePill good';
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
      const box = $('#traceResult');
      box.className = 'result ok';
      box.innerHTML = `✅ <b>${ch}</b> completed in the correct order · ${data.totalMistakes} ${data.totalMistakes === 1 ? 'mistake' : 'mistakes'}`;
      $('#strokeCounter').textContent = 'Complete ✓';
      $('#strokeCounter').className = 'strokePill good';
      if (charIndex < charsNow.length - 1) {
        setTimeout(() => {
          if (session !== writerSession) return;
          charIndex++;
          renderWriterTabsOnly();
          createHanziWriter('quiz');
        }, 850);
      } else {
        setTimeout(() => {
          if (session !== writerSession) return;
          writeIndex = (writeIndex + 1) % WORDS.length;
          charIndex = 0;
          save();
          renderWriter();
        }, 1100);
      }
    }
  });
}

function renderWriter() {
  const w = WORDS[writeIndex];
  const chars = practiceChars(w);
  if (charIndex >= chars.length) charIndex = 0;
  $('#writeWord').textContent = w.hanzi;
  $('#writePinyin').textContent = w.pinyin;
  $('#writeMeaning').textContent = w.en;
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
}

function renderMini() {
  $('#miniList').innerHTML = WORDS.map(w => `<div class="mini" data-n="${w.n}"><span><span class="num">#${w.n}</span> <span class="c">${escapeHtml(w.hanzi)}</span></span><span class="tick">${isWordWritten(w) ? '✓' : ''}</span></div>`).join('');
  $$('.mini').forEach(m => m.addEventListener('click', () => {
    writeIndex = +m.dataset.n - 1;
    charIndex = 0;
    save();
    renderWriter();
  }));
}

$('#resetQuiz').addEventListener('click', () => createHanziWriter('quiz'));
$('#animateChar').addEventListener('click', () => createHanziWriter('animation'));
$('#toggleGuide').addEventListener('click', () => {
  guideVisible = !guideVisible;
  $('#toggleGuide').textContent = guideVisible ? 'Hide guide' : 'Show guide';
  createHanziWriter('quiz');
});
$('#prevWord').addEventListener('click', () => {
  writeIndex = (writeIndex - 1 + WORDS.length) % WORDS.length;
  charIndex = 0;
  save();
  renderWriter();
});
$('#nextWord').addEventListener('click', () => {
  writeIndex = (writeIndex + 1) % WORDS.length;
  charIndex = 0;
  save();
  renderWriter();
});
$('#speakWrite').addEventListener('click', () => speak(WORDS[writeIndex].hanzi, true));
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
    id: 'mixed',
    name: 'Mixed practice',
    icon: '混',
    description: 'Rotate through all five practice skills.'
  }
];

function statFor(n, skill) {
  return practiceStats[n]?.[skill] || { attempts: 0, correct: 0, lastResult: null };
}

function aggregateSkill(block, skill) {
  if (!block) return { attempts: 0, correct: 0, accuracy: null };
  const skills = skill === 'mixed' ? ['meaning', 'hanziPinyin', 'typeHanzi', 'listening', 'association'] : [skill];
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
  $$('.practiceModeButton').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.skill === selectedPracticeMode);
    btn.setAttribute('aria-pressed', btn.dataset.skill === selectedPracticeMode ? 'true' : 'false');
  });
}

function chooseFeedbackPhrase(kind) {
  const list = FEEDBACK_PHRASES[kind] || [];
  if (!list.length) return null;
  let index = Math.floor(Math.random() * list.length);
  if (list.length > 1 && index === lastFeedbackPhrase[kind]) index = (index + 1) % list.length;
  lastFeedbackPhrase[kind] = index;
  return list[index];
}

function playResultChime(correct) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const tones = correct
      ? [{ f: 523.25, t: 0 }, { f: 659.25, t: 0.09 }, { f: 783.99, t: 0.18 }]
      : [{ f: 392.00, t: 0 }, { f: 329.63, t: 0.10 }];
    tones.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(correct ? 0.08 : 0.055, now + t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.14);
    });
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch (_) {}
}

function showLearningFeedback(correct) {
  const kind = correct ? 'correct' : 'wrong';
  const phrase = chooseFeedbackPhrase(kind);
  if (!phrase) return;

  let toast = document.getElementById('learningFeedbackToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'learningFeedbackToast';
    toast.className = 'learningFeedbackToast';
    document.body.appendChild(toast);
  }

  toast.className = `learningFeedbackToast ${correct ? 'good' : 'retry'}`;
  toast.innerHTML = `
    <div class="learningFeedbackHanzi">${escapeHtml(phrase.hanzi)}</div>
    <div class="learningFeedbackMeta">
      <b>${escapeHtml(phrase.pinyin)}</b>
      <span>${escapeHtml(phrase.en)}</span>
    </div>`;
  toast.classList.add('show');

  playResultChime(correct);
  setTimeout(() => speak(phrase.hanzi, false), 250);

  clearTimeout(showLearningFeedback._timer);
  showLearningFeedback._timer = setTimeout(() => toast.classList.remove('show'), 1600);
}

function renderPracticeHome() {
  if (!$('#practiceHome')) return;
  $('#practiceHome').hidden = false;
  $('#blockView').hidden = true;
  $('#exerciseView').hidden = true;
  exerciseSession = null;
  exerciseQuestion = null;
  updatePracticeSummary();

  $('#blockGrid').innerHTML = PRACTICE_BLOCKS.map(block => {
    const agg = aggregateSkill(block, 'mixed');
    const preview = block.words.slice(0, 6).map(n => `<span>${escapeHtml(wordByN(n)?.hanzi || '')}</span>`).join('');
    const status = agg.accuracy === null ? 'Not started' : `${agg.accuracy}% accuracy`;
    return `
      <button class="blockCard" type="button" data-block-id="${block.id}">
        <div class="blockCardTop"><span>BLOCK ${block.id}</span><b>${status}</b></div>
        <h3>${escapeHtml(block.title)}</h3>
        <p>${escapeHtml(block.description)}</p>
        <div class="blockPreview">${preview}<span class="moreChip">+9</span></div>
        <div class="blockCardFoot"><span>15 related words</span><span>Open →</span></div>
      </button>`;
  }).join('');

  $$('.blockCard').forEach(card => card.addEventListener('click', () => openPracticeBlock(+card.dataset.blockId)));
}

function openPracticeBlock(id) {
  const block = blockById(id);
  if (!block) return;
  selectedBlockId = block.id;
  save();
  switchPage('practice');
  renderBlockView();
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

  const orderedModes = ['mixed', 'meaning', 'listening', 'hanziPinyin', 'typeHanzi', 'association'];
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
      association: '句'
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

function makeQuestion(target, requestedSkill, block) {
  let skill = requestedSkill;
  const availableSkills = ['meaning', 'hanziPinyin', 'typeHanzi', 'listening', 'association'];
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

function renderExerciseQuestion() {
  const session = exerciseSession;
  const block = session ? blockById(session.blockId) : null;
  if (!session || !block) return;
  if (session.index >= session.queue.length) {
    renderSessionComplete();
    return;
  }

  const target = wordByN(session.queue[session.index]);
  exerciseQuestion = makeQuestion(target, session.skill, block);
  const q = exerciseQuestion;
  const skillName = session.skill === 'mistakes' ? 'Mistake review' : (PRACTICE_SKILLS.find(s => s.id === session.skill)?.name || 'Practice');
  $('#exerciseLabel').textContent = `${block.title} · ${skillName}`;
  $('#exerciseCount').textContent = `${session.index + 1} / ${session.queue.length}`;
  $('#exerciseProgress').style.width = `${((session.index + 1) / session.queue.length) * 100}%`;
  $('#questionType').textContent = q.type;
  $('#questionPrompt').innerHTML = q.prompt;
  $('#questionSub').innerHTML = q.sub;
  $('#questionAudio').hidden = !q.audio;
  $('#feedbackPanel').hidden = true;
  $('#feedbackPanel').className = 'feedbackPanel';
  $('#exerciseOptions').className = 'exerciseOptions';

  if (q.textInput) {
    renderTypeHanziInput(q);
  } else {
    $('#exerciseOptions').innerHTML = q.options.map(o => {
      const label = String(o.label || '');
      const optionClass = /[\u3400-\u9fff]/.test(label)
        ? ' optionHanzi'
        : /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]|[a-z]+[1-5](?:\s|$)/i.test(label)
          ? ' optionPinyin'
          : ' optionEnglish';
      return `<button class="exerciseOption${optionClass}" type="button" data-n="${o.n}">${escapeHtml(label)}</button>`;
    }).join('');
    $$('.exerciseOption').forEach(btn => btn.addEventListener('click', () => answerExercise(btn)));
  }
}

function renderTypeHanziInput(q) {
  const host = $('#exerciseOptions');
  host.classList.add('typingExerciseHost');
  host.innerHTML = `
    <form id="typeHanziForm" class="typeHanziForm" novalidate>
      <label for="typeHanziInput">Type in Chinese</label>
      <div class="typeInputRow">
        <input id="typeHanziInput" class="typeHanziInput" type="text" lang="zh-CN" inputmode="text"
          autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"
          placeholder="${escapeHtml(q.inputPlaceholder || 'Type Hanzi…')}" aria-describedby="typeKeyboardTip typingStatus">
        <button id="checkTypedHanzi" class="primaryButton typeCheckButton" type="submit">Check</button>
      </div>
      <p id="typeKeyboardTip" class="typeKeyboardTip">Use your phone, tablet, or computer’s <b>Chinese · Simplified Pinyin</b> keyboard. Type pinyin, choose the Hanzi candidate, then check it here.</p>
      <div class="typeAssistRow">
        <button id="typeHintButton" class="typeHintButton" type="button">Show pinyin hint</button>
        <button id="typeListenButton" class="typeHintButton" type="button">🔊 Listen</button>
      </div>
      <div id="typingHint" class="typingHint" hidden></div>
      <div id="typingStatus" class="typingStatus" aria-live="polite"></div>
    </form>`;

  let composing = false;
  const input = $('#typeHanziInput');
  const form = $('#typeHanziForm');
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('input', () => {
    input.classList.remove('isWrong');
    $('#typingStatus').className = 'typingStatus';
    $('#typingStatus').textContent = '';
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.isComposing || composing)) return;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (composing) return;
    checkTypedHanzi();
  });
  $('#typeHintButton').addEventListener('click', () => {
    q.usedHint = true;
    const hint = $('#typingHint');
    hint.hidden = false;
    hint.innerHTML = `<b>Pinyin:</b> ${escapeHtml(q.hintPinyin || q.target.pinyin)}`;
    $('#typeHintButton').disabled = true;
  });
  $('#typeListenButton').addEventListener('click', () => speak(q.target.hanzi, true));
  setTimeout(() => input?.focus({ preventScroll: true }), 80);
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
    showLearningFeedback(false);
    input.select();
    input.focus();
    return;
  }

  showLearningFeedback(true);
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

function showTypeHanziFeedback(q, typedValue) {
  const target = q.target;
  const feedback = $('#feedbackPanel');
  feedback.hidden = false;
  feedback.className = 'feedbackPanel isCorrect';
  $('#feedbackStatus').textContent = '✓ Correct — produced in Chinese';
  const firstWrong = q.wrongInputs[0];
  $('#feedbackCompare').hidden = true;
  $('#feedbackCompare').innerHTML = '';
  $('#feedbackHanzi').textContent = target.hanzi;
  $('#feedbackPinyin').textContent = target.pinyin;
  $('#feedbackEnglish').textContent = target.en;
  $('#feedbackExplanation').textContent = target.explanation;
  $('#feedbackExampleHanzi').textContent = target.example.hanzi;
  $('#feedbackExamplePinyin').textContent = target.example.pinyin;
  $('#feedbackExampleEnglish').textContent = target.example.en;
  $('#nextExercise').textContent = exerciseSession.index === exerciseSession.queue.length - 1 ? 'Finish session →' : 'Next →';
  $('#nextExercise').focus({ preventScroll: true });
  feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function answerExercise(button) {
  if (!exerciseSession || !exerciseQuestion || !$('#feedbackPanel').hidden) return;
  const q = exerciseQuestion;
  const chosenN = +button.dataset.n;
  const chosen = wordByN(chosenN);
  const target = q.target;
  const correct = chosenN === target.n;

  exerciseSession.attempts += 1;
  if (correct) exerciseSession.correct += 1;
  recordPracticeAnswer(target.n, q.skill, correct);

  $$('.exerciseOption').forEach(btn => {
    btn.disabled = true;
    if (+btn.dataset.n === target.n) btn.classList.add('correct');
  });
  if (!correct) button.classList.add('wrong');

  showLearningFeedback(correct);

  const feedback = $('#feedbackPanel');
  feedback.hidden = false;
  feedback.className = `feedbackPanel ${correct ? 'isCorrect' : 'isWrong'}`;
  $('#feedbackStatus').textContent = correct ? '✓ Correct' : 'Not quite — keep the contrast clear';

  $('#feedbackCompare').hidden = true;
  $('#feedbackCompare').innerHTML = '';

  $('#feedbackHanzi').textContent = target.hanzi;
  $('#feedbackPinyin').textContent = target.pinyin;
  $('#feedbackEnglish').textContent = target.en;
  $('#feedbackExplanation').textContent = target.explanation;
  $('#feedbackExampleHanzi').textContent = target.example.hanzi;
  $('#feedbackExamplePinyin').textContent = target.example.pinyin;
  $('#feedbackExampleEnglish').textContent = target.example.en;
  $('#nextExercise').textContent = exerciseSession.index === exerciseSession.queue.length - 1 ? 'Finish session →' : 'Next →';
  $('#nextExercise').focus({ preventScroll: true });
  feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      <p>${session.correct} correct out of ${session.attempts}. Nothing advances automatically: use the feedback, then choose when you are ready for another session.</p>
      <div class="sessionActions">
        <button id="repeatSession" class="primaryButton" type="button">Practice again</button>
        <button id="completeBack" class="secondaryButton" type="button">Back to block</button>
      </div>
    </div>`;
  $('#repeatSession').addEventListener('click', () => { restoreExerciseCardShell(); startExercise(session.skill); });
  $('#completeBack').addEventListener('click', () => {
    restoreExerciseCardShell();
    renderBlockView();
  });
}

function restoreExerciseCardShell() {
  const card = $('.exerciseCard');
  if (!card || $('#questionPrompt')) return;
  card.innerHTML = `
    <div id="questionType" class="questionType">MEANING</div>
    <div id="questionPrompt" class="questionPrompt"></div>
    <div id="questionSub" class="questionSub"></div>
    <button id="questionAudio" class="exerciseAudio" type="button" hidden>🔊 Listen</button>
    <div id="exerciseOptions" class="exerciseOptions"></div>
    <div id="feedbackPanel" class="feedbackPanel" hidden>
      <div class="feedbackStatus" id="feedbackStatus"></div>
      <div class="feedbackCompare" id="feedbackCompare"></div>
      <div class="feedbackTarget">
        <div><div id="feedbackHanzi" class="feedbackHanzi"></div><div id="feedbackPinyin" class="feedbackPinyin"></div><div id="feedbackEnglish" class="feedbackEnglish"></div></div>
        <button id="feedbackAudio" class="miniSound" type="button" aria-label="Listen to the correct word">🔊</button>
      </div>
      <p id="feedbackExplanation" class="feedbackExplanation"></p>
      <div class="feedbackExampleCard">
        <div class="feedbackExampleHead">
          <div class="feedbackExampleLabel">Example sentence</div>
          <button id="feedbackExampleAudio" class="miniSound" type="button" aria-label="Listen to example sentence">🔊</button>
        </div>
        <div id="feedbackExampleHanzi" class="feedbackExampleHanzi"></div>
        <div id="feedbackExamplePinyin" class="feedbackExamplePinyin"></div>
        <div id="feedbackExampleEnglish" class="feedbackExampleEnglish"></div>
      </div>
      <button id="nextExercise" class="primaryButton feedbackNext" type="button">Next →</button>
    </div>`;
  bindExerciseStaticActions();
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
$('#startSelectedPractice').addEventListener('click', () => startExercise(selectedPracticeMode));
$('#exitExercise').addEventListener('click', () => {
  restoreExerciseCardShell();
  renderBlockView();
});
bindExerciseStaticActions();

renderLearningCard();
renderWriter();
renderPracticeHome();
updateStats();

// Default landing view: Cards → All words.
cardScope = { type: 'all' };
explorerMode = { type: 'all' };
explorerQuery = '';
$('#cardSearch').value = '';
$('#cardView').hidden = true;
$('#cardExplorer').hidden = false;
renderCardExplorer();
