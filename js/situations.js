(() => {
  const home = document.querySelector('#situationsHome');
  const game = document.querySelector('#situationGame');
  if (!home || !game) return;

  const q = (s) => document.querySelector(s);
  const sceneEl = q('#situationScene');
  const dialogueEl = q('#situationDialogue');
  const interactionEl = q('#situationInteraction');
  const feedbackEl = q('#situationFeedback');
  const phrasebookEl = q('#situationPhrasebook');
  const routeEl = q('#situationRoute');
  const drawerEl = q('#situationDrawer');
  const hintBox = q('#situationHintBox');

  const DRINKS = {
    water: { hanzi: '水', pinyin: 'shuǐ', en: 'water', emoji: '💧' },
    tea: { hanzi: '茶', pinyin: 'chá', en: 'tea', emoji: '🍵' }
  };

  const MEALS = {
    kungpao: { hanzi: '宫保鸡丁', pinyin: 'gōngbǎo jīdīng', en: 'kung pao chicken', emoji: '🍗' },
    rice: { hanzi: '炒饭', pinyin: 'chǎofàn', en: 'fried rice', emoji: '🍚' },
    dumplings: { hanzi: '饺子', pinyin: 'jiǎozi', en: 'dumplings', emoji: '🥟' },
    tofu: { hanzi: '麻婆豆腐', pinyin: 'mápó dòufu', en: 'mapo tofu', emoji: '🍲' }
  };

  const SEATS = {
    window: { hanzi: '窗边', pinyin: 'chuāngbiān', en: 'by the window' },
    inside: { hanzi: '里面', pinyin: 'lǐmiàn', en: 'inside' }
  };

  const PAYMENTS = {
    card: { hanzi: '刷卡', pinyin: 'shuākǎ', en: 'pay by card' },
    cash: { hanzi: '现金', pinyin: 'xiànjīn', en: 'cash' },
    wechat: { hanzi: '微信', pinyin: 'Wēixìn', en: 'WeChat Pay' }
  };

  const OPINIONS = {
    tasty: { hanzi: '很好吃！', pinyin: 'Hěn hǎochī!', en: 'It is very tasty!' },
    spicy: { hanzi: '有点辣。', pinyin: 'Yǒudiǎn là.', en: 'It is a little spicy.' },
    like: { hanzi: '我很喜欢。', pinyin: 'Wǒ hěn xǐhuan.', en: 'I like it a lot.' }
  };

  const PHRASES = {
    hello: { hanzi: '你好', pinyin: 'nǐ hǎo', en: 'hello' },
    two: { hanzi: '两位', pinyin: 'liǎng wèi', en: 'two people' },
    thisWay: { hanzi: '这边请', pinyin: 'zhèbiān qǐng', en: 'this way, please' },
    wantDrink: { hanzi: '你们想喝什么？', pinyin: 'nǐmen xiǎng hē shénme?', en: 'what would you like to drink?' },
    want: { hanzi: '我要…', pinyin: 'wǒ yào…', en: 'I would like…' },
    tasty: { hanzi: '很好吃', pinyin: 'hěn hǎochī', en: 'very tasty' },
    spicy: { hanzi: '有点辣', pinyin: 'yǒudiǎn là', en: 'a little spicy' },
    more: { hanzi: '还要别的吗？', pinyin: 'hái yào bié de ma?', en: 'would you like anything else?' },
    anotherWater: { hanzi: '请再来一杯水', pinyin: 'qǐng zài lái yì bēi shuǐ', en: 'another glass of water, please' },
    anotherTea: { hanzi: '请再来一杯茶', pinyin: 'qǐng zài lái yì bēi chá', en: 'another cup of tea, please' },
    pack: { hanzi: '请帮我打包', pinyin: 'qǐng bāng wǒ dǎbāo', en: 'please pack this to go' },
    bill: { hanzi: '买单，谢谢', pinyin: 'mǎidān, xièxie', en: 'the bill, please' },
    goodbye: { hanzi: '谢谢，再见！', pinyin: 'xièxie, zàijiàn!', en: 'thank you, goodbye!' }
  };

  const CHAPTERS = {
    arrival: ['arrival'],
    table: ['seat', 'seated'],
    drinks: ['drink', 'drinkConfirm'],
    food: ['menu', 'order', 'foodArrives'],
    conversation: ['friend', 'friendAgain', 'tableHub'],
    extras: ['extraWater', 'extraTea', 'packAsk', 'packPhrase'],
    bill: ['billType', 'payment'],
    farewell: ['goodbye', 'complete']
  };
  const CHAPTER_ORDER = ['arrival', 'table', 'drinks', 'food', 'conversation', 'extras', 'bill', 'farewell'];
  const CHAPTER_LABELS = {
    arrival: 'Arrival', table: 'Get a table', drinks: 'Drinks', food: 'Order food',
    conversation: 'At the table', extras: 'Free choice', bill: 'Pay', farewell: 'Leave'
  };

  const HINTS = {
    arrival: 'The host is asking for the number of people. Look for the answer that means “two people.”',
    seat: 'Both choices work. Choose where you actually want to sit.',
    drink: 'Use 我要… (wǒ yào…) to say “I would like…”',
    order: 'Match your selected dish with 我要… (wǒ yào…).',
    friend: 'This is a real conversation choice. More than one answer can be natural.',
    extraWater: '水 (shuǐ) means water. 再来 means “another / one more.”',
    extraTea: '茶 (chá) means tea. 再来 means “another / one more.”',
    packPhrase: '打包 (dǎbāo) is the key phrase for packing food to go.',
    billType: 'Type maidan with a Chinese Pinyin keyboard, then choose 买单.',
    payment: 'All payment choices are valid. Choose the one you want.',
    goodbye: 'A natural ending is 谢谢，再见！ — “Thank you, goodbye!”'
  };

  let state = null;
  let composing = false;
  let currentDialogue = { hanzi: '', pinyin: '', en: '' };

  function freshState() {
    return {
      node: 'arrival', hints: 0, seat: null, drink: null, meal: null, opinion: null,
      packed: false, payment: null, friendTalks: 0, extraWater: 0, extraTea: 0,
      maxChapter: 0, unlocked: new Set(), log: []
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function playZh(text) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[（）]/g, ' '));
    u.lang = 'zh-CN';
    u.rate = 0.76;
    const zh = speechSynthesis.getVoices().find(v => (v.lang || '').toLowerCase().startsWith('zh'));
    if (zh) u.voice = zh;
    speechSynthesis.speak(u);
  }

  function unlock(...ids) {
    ids.forEach(id => PHRASES[id] && state.unlocked.add(id));
    renderPhrasebook();
  }

  function addLog(label, value) {
    const existing = state.log.find(item => item.label === label);
    if (existing) existing.value = value;
    else state.log.push({ label, value });
    renderRoute();
  }

  function currentChapter() {
    return CHAPTER_ORDER.find(ch => CHAPTERS[ch].includes(state.node)) || 'arrival';
  }

  function updateProgress() {
    const chapter = currentChapter();
    const idx = Math.max(0, CHAPTER_ORDER.indexOf(chapter));
    state.maxChapter = Math.max(state.maxChapter || 0, idx);
    q('#situationChapter').textContent = CHAPTER_LABELS[chapter];
    q('#situationProgressText').textContent = `${state.maxChapter + 1} / ${CHAPTER_ORDER.length}`;
    q('#situationProgressBar').style.width = `${((state.maxChapter + 1) / CHAPTER_ORDER.length) * 100}%`;
  }

  function renderPhrasebook() {
    if (!state) return;
    const items = [...state.unlocked].map(id => PHRASES[id]).filter(Boolean);
    phrasebookEl.innerHTML = items.length ? items.map(p => `
      <div class="phrasebookItem gamePhraseItem">
        <b>${escapeHtml(p.hanzi)}</b>
        <span>${escapeHtml(p.pinyin)}</span>
        <small>${escapeHtml(p.en)}</small>
      </div>`).join('') : '<div class="situationHint">Useful phrases unlock as the story unfolds.</div>';
  }

  function renderRoute() {
    if (!state) return;
    const items = [
      ['Party', 'Two people'],
      ['Seat', state.seat ? SEATS[state.seat].en : null],
      ['Drink', state.drink ? DRINKS[state.drink].en : null],
      ['Food', state.meal ? MEALS[state.meal].en : null],
      ['At the table', state.opinion ? OPINIONS[state.opinion].en.replace(/[.!]/g, '') : null],
      ['Takeout', state.packed ? 'Packed to go' : null],
      ['Payment', state.payment ? PAYMENTS[state.payment].en : null]
    ];
    routeEl.innerHTML = items.map(([label, value]) => `
      <div class="routeItem ${value ? 'done' : ''}"><span class="routeDot"></span><div><strong>${escapeHtml(label)}</strong>${value ? `<br>${escapeHtml(value)}` : ''}</div></div>`).join('');
  }

  function svgPerson(x, y, color, role, facing = 'up') {
    const faceY = facing === 'up' ? y - 18 : y - 12;
    return `<g class="gameSprite" transform="translate(${x} ${y})">
      <ellipse cx="0" cy="18" rx="21" ry="10" fill="rgba(62,35,24,.18)"/>
      <rect x="-18" y="-2" width="36" height="45" rx="14" fill="${color}"/>
      <circle cx="0" cy="${faceY-y}" r="16" fill="#f1c7a7"/>
      <path d="M-15 -22 Q0 -39 15 -22 Q7 -31 0 -32 Q-8 -31 -15 -22" fill="#3f2a25"/>
      ${role === 'player' ? '<rect x="-13" y="4" width="26" height="25" rx="7" fill="#45382f"/><rect x="-10" y="7" width="20" height="17" rx="4" fill="#84634c"/>' : ''}
    </g>`;
  }

  function tableGroup(x, y, occupied = false) {
    return `<g transform="translate(${x} ${y})">
      <ellipse cx="0" cy="0" rx="78" ry="46" fill="#8a5538" stroke="#68402d" stroke-width="6"/>
      <ellipse cx="0" cy="-4" rx="62" ry="34" fill="#b87951"/>
      <rect x="-70" y="50" width="36" height="16" rx="6" fill="#6d4533"/><rect x="34" y="50" width="36" height="16" rx="6" fill="#6d4533"/>
      <rect x="-70" y="-68" width="36" height="16" rx="6" fill="#6d4533"/><rect x="34" y="-68" width="36" height="16" rx="6" fill="#6d4533"/>
      ${occupied ? '<circle cx="-20" cy="-2" r="9" fill="#fff3d6"/><circle cx="22" cy="-2" r="9" fill="#fff3d6"/>' : ''}
    </g>`;
  }

  function sceneVisual(type) {
    const meal = state.meal ? MEALS[state.meal] : null;
    const drink = state.drink ? DRINKS[state.drink] : null;
    const player = type === 'cashier' ? svgPerson(455, 390, '#6d3c31', 'player') : svgPerson(455, 435, '#6d3c31', 'player');
    const floorLines = Array.from({length:9},(_,i)=>`<line x1="0" y1="${115+i*48}" x2="900" y2="${115+i*48}"/>`).join('') + Array.from({length:13},(_,i)=>`<line x1="${i*75}" y1="115" x2="${i*75}" y2="520"/>`).join('');

    let actors = '';
    let objects = '';
    let caption = 'Restaurant';

    if (type === 'entrance') {
      caption = 'Restaurant entrance';
      actors = `${svgPerson(455, 235, '#a63c36', 'host')}${player}`;
      objects = `<g class="frontDoor"><rect x="350" y="28" width="200" height="118" rx="8" fill="#5e392b"/><rect x="365" y="38" width="78" height="98" fill="#d8a56c"/><rect x="457" y="38" width="78" height="98" fill="#d8a56c"/><circle cx="438" cy="89" r="5" fill="#6b3b2d"/><circle cx="462" cy="89" r="5" fill="#6b3b2d"/></g>`;
    } else if (type === 'cashier') {
      caption = 'Front counter';
      actors = `${svgPerson(455, 225, '#8f342f', 'cashier')}${player}`;
      objects = `<rect x="245" y="145" width="420" height="105" rx="18" fill="#794832"/><rect x="265" y="165" width="380" height="64" rx="11" fill="#a86a47"/><text x="455" y="207" text-anchor="middle" font-size="34" fill="#f8dfb2" font-family="serif">收银台</text>`;
    } else if (type === 'menu') {
      caption = 'Menu';
      actors = `${svgPerson(240, 405, '#6d3c31', 'player')}${svgPerson(660, 405, '#7b5d76', 'friend')}`;
      objects = `${tableGroup(450,350,true)}<g transform="translate(450 205)"><rect x="-190" y="-92" width="380" height="184" rx="14" fill="#fff7e8" stroke="#754631" stroke-width="10"/><text x="0" y="-52" text-anchor="middle" font-size="31" fill="#8a2e2d" font-family="serif">今日推荐</text><text x="0" y="-20" text-anchor="middle" font-size="17" fill="#7c5d4d">Today's recommendations</text><text x="-145" y="25" font-size="24">宫保鸡丁</text><text x="72" y="25" font-size="16" fill="#8b6a58">kung pao chicken</text><text x="-145" y="58" font-size="24">炒饭 · 饺子 · 麻婆豆腐</text></g>`;
    } else if (type === 'meal') {
      caption = 'At your table';
      actors = `${svgPerson(300,360,'#6d3c31','player')}${svgPerson(600,360,'#7b5d76','friend')}`;
      objects = `${tableGroup(450,330,true)}${meal ? `<g transform="translate(450 323)"><circle cx="0" cy="0" r="42" fill="#f5eee2" stroke="#d2b79f" stroke-width="5"/><text x="0" y="12" text-anchor="middle" font-size="42">${meal.emoji}</text></g>` : ''}${drink ? `<text x="520" y="317" font-size="34">${drink.emoji}</text>` : ''}`;
    } else {
      caption = state.seat === 'window' ? 'Your table by the window' : 'Your table';
      actors = `${svgPerson(280,365,'#6d3c31','player')}${svgPerson(620,365,'#7b5d76','friend')}${svgPerson(455,210,'#b05a3d','waiter')}`;
      objects = tableGroup(450,330,true);
    }

    const sideTables = type === 'cashier' ? '' : `${tableGroup(150,255,true)}${tableGroup(750,255,true)}`;
    return `<div class="rpgSceneWrap">
      <svg class="rpgSceneSvg" viewBox="0 0 900 520" role="img" aria-label="${escapeHtml(caption)}">
        <defs>
          <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d3429"/><stop offset="1" stop-color="#7b4c35"/></linearGradient>
          <linearGradient id="floorGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6a47c"/><stop offset="1" stop-color="#ba7a55"/></linearGradient>
          <filter id="softShadow"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity=".18"/></filter>
        </defs>
        <rect width="900" height="520" fill="url(#floorGrad)"/>
        <g stroke="#a76d4e" stroke-width="2" opacity=".3">${floorLines}</g>
        <rect x="0" y="0" width="900" height="112" fill="url(#wallGrad)"/>
        <rect x="20" y="20" width="150" height="70" rx="12" fill="#6b4335" stroke="#a97051" stroke-width="4"/><text x="95" y="63" text-anchor="middle" font-size="32" fill="#f4d89d" font-family="serif">餐厅</text>
        <g filter="url(#softShadow)"><circle cx="230" cy="55" r="25" fill="#c03c34"/><rect x="225" y="78" width="10" height="20" fill="#7f2b29"/><circle cx="670" cy="55" r="25" fill="#c03c34"/><rect x="665" y="78" width="10" height="20" fill="#7f2b29"/></g>
        <g fill="#3f6b46"><circle cx="56" cy="145" r="33"/><circle cx="82" cy="151" r="25"/><circle cx="824" cy="145" r="33"/><circle cx="850" cy="151" r="25"/></g>
        ${sideTables}${objects}${actors}
      </svg>
      <div class="sceneCaption gameSceneCaption">${escapeHtml(caption)}</div>
      <button class="sceneTalkBubble" type="button">💬 Talk</button>
    </div>`;
  }

  function attachSceneTalk() {
    const talk = sceneEl.querySelector('.sceneTalkBubble');
    if (!talk) return;
    talk.addEventListener('click', () => {
      dialogueEl.classList.add('dialoguePulse');
      playZh(currentDialogue.hanzi);
      setTimeout(() => dialogueEl.classList.remove('dialoguePulse'), 450);
    });
  }

  function dialogue(speaker, hanzi, pinyin, en, visual = 'table', unlockIds = []) {
    currentDialogue = { speaker, hanzi, pinyin, en };
    sceneEl.innerHTML = sceneVisual(visual);
    dialogueEl.innerHTML = `
      <div class="gameDialogueAvatar">${speaker === 'Friend' ? '🙂' : speaker === 'Cashier' ? '🧑🏻‍💼' : speaker === 'Narrator' ? '📖' : '🧑🏻‍🍳'}</div>
      <div class="gameDialogueText">
        <div class="dialogueTop"><div class="dialogueSpeaker">${escapeHtml(speaker)}</div><button class="dialogueAudio" type="button" aria-label="Listen">🔊</button></div>
        <div class="dialogueHanzi">${escapeHtml(hanzi)}</div>
        <div class="dialoguePinyin">${escapeHtml(pinyin)}</div>
        <div class="dialogueEnglish">${escapeHtml(en)}</div>
      </div>`;
    dialogueEl.querySelector('.dialogueAudio').addEventListener('click', () => playZh(hanzi));
    attachSceneTalk();
    unlock(...unlockIds);
  }

  function clearFeedback() {
    feedbackEl.hidden = true;
    feedbackEl.className = 'situationFeedback situationFeedbackV2';
    feedbackEl.innerHTML = '';
  }

  function showFeedback({ good = true, title, text, phrase = null, continueTo = null, continueLabel = 'Continue →', onContinue = null }) {
    feedbackEl.hidden = false;
    feedbackEl.className = `situationFeedback situationFeedbackV2 ${good ? 'good' : 'bad'}`;
    feedbackEl.innerHTML = `<h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p>${phrase ? `<div class="feedbackPhrase"><b>${escapeHtml(phrase.hanzi)}</b><span>${escapeHtml(phrase.pinyin)}</span><p>${escapeHtml(phrase.en)}</p></div>` : ''}${(continueTo || onContinue) ? `<button class="primaryButton situationContinue" type="button">${escapeHtml(continueLabel)}</button>` : ''}`;
    const btn = feedbackEl.querySelector('.situationContinue');
    if (btn) btn.addEventListener('click', () => onContinue ? onContinue() : go(continueTo));
    feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setInteractionHeader(kicker, prompt, extra = '') {
    interactionEl.innerHTML = `<div class="interactionEyebrow">${escapeHtml(kicker)}</div><div class="interactionPrompt">${escapeHtml(prompt)}</div>${extra}`;
  }

  function renderChoices({ kicker = 'YOUR TURN', prompt, options, correctKey = null, branch = false, onCorrect = null }) {
    setInteractionHeader(kicker, prompt, '<div class="situationChoices gameChoiceGrid"></div>');
    const wrap = interactionEl.querySelector('.situationChoices');
    options.forEach(opt => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'situationChoice gameChoice';
      b.innerHTML = `${opt.emoji ? `<span class="choiceIcon">${opt.emoji}</span>` : ''}<span class="choiceCopy"><b>${escapeHtml(opt.hanzi)}</b><span class="choicePinyin">${escapeHtml(opt.pinyin)}</span><span class="choiceEnglish">${escapeHtml(opt.en)}</span></span><span class="choiceCheck">○</span>`;
      b.addEventListener('click', () => {
        clearFeedback();
        if (branch || opt.key === correctKey) {
          [...wrap.children].forEach(x => { x.disabled = true; });
          b.classList.add('good');
          b.querySelector('.choiceCheck').textContent = '✓';
          if (opt.onChoose) opt.onChoose();
          if (onCorrect) onCorrect(opt);
          showFeedback({ good: true, title: branch ? 'Choice made' : 'Correct', text: opt.feedback || (branch ? 'The story remembers this choice.' : 'You recalled the phrase correctly.'), phrase: { hanzi: opt.hanzi, pinyin: opt.pinyin, en: opt.en }, continueTo: opt.next });
        } else {
          b.classList.add('bad');
          b.querySelector('.choiceCheck').textContent = '×';
          setTimeout(() => { b.classList.remove('bad'); b.querySelector('.choiceCheck').textContent = '○'; }, 800);
          showFeedback({ good: false, title: 'Try again', text: opt.feedback || 'That response does not fit this moment. Compare the question, pinyin, and English meaning.' });
        }
      });
      wrap.appendChild(b);
    });
  }

  function renderMenuChoices() {
    setInteractionHeader('CHOOSE YOUR MEAL', 'What would you like to order?', '<div class="situationMenuChoices gameFoodGrid"></div>');
    const wrap = interactionEl.querySelector('.situationMenuChoices');
    Object.entries(MEALS).forEach(([key, meal]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'situationFoodChoice gameFoodChoice';
      b.innerHTML = `<div class="foodEmoji">${meal.emoji}</div><div class="foodCopy"><b>${meal.hanzi}</b><span>${meal.pinyin}</span><small>${meal.en}</small></div><span class="foodRadio">○</span>`;
      b.addEventListener('click', () => {
        state.meal = key;
        addLog('Food', meal.en);
        [...wrap.children].forEach(x => x.disabled = true);
        b.classList.add('selected');
        b.querySelector('.foodRadio').textContent = '✓';
        showFeedback({ good: true, title: 'Meal selected', text: 'Now say the order in Mandarin.', phrase: meal, continueTo: 'order' });
      });
      wrap.appendChild(b);
    });
  }

  function renderTypeBill() {
    setInteractionHeader('TYPE WITH YOUR CHINESE KEYBOARD', 'Ask for the bill in Chinese.', `
      <div class="situationInputWrap">
        <input id="billInput" class="situationTextInput" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type Hanzi here…" aria-label="Type the Chinese phrase for the bill">
        <div class="situationInputActions"><button id="checkBill" class="primaryButton" type="button">Check answer</button><button id="billHint" class="secondaryButton" type="button">Show pinyin hint</button></div>
        <div id="billHintText" class="situationHint">Use your device's Chinese Pinyin keyboard. Type the sound, then choose the Hanzi candidate.</div>
      </div>`);
    const input = q('#billInput');
    const check = () => {
      if (composing) return;
      const raw = input.value.trim().replace(/[，。,.!?！？\s]/g, '');
      const ok = ['买单', '请买单', '买单谢谢', '请买单谢谢'].includes(raw);
      if (ok) {
        unlock('bill');
        input.disabled = true;
        q('#checkBill').disabled = true;
        showFeedback({ good: true, title: 'Correct — the waiter understands you.', text: 'You connected the sound you remember with the Hanzi produced by your Pinyin keyboard.', phrase: PHRASES.bill, continueTo: 'payment' });
      } else {
        showFeedback({ good: false, title: 'Not quite yet', text: 'Try producing 买单 with your Chinese Pinyin keyboard. Use the hint if you need it.' });
      }
    };
    input.addEventListener('compositionstart', () => composing = true);
    input.addEventListener('compositionend', () => composing = false);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !composing) check(); });
    q('#checkBill').addEventListener('click', check);
    q('#billHint').addEventListener('click', () => {
      state.hints += 1;
      q('#billHintText').innerHTML = 'Pinyin hint: <b>mǎidān</b>. Type <b>maidan</b> and choose <b>买单</b>.';
    });
    setTimeout(() => input.focus(), 50);
  }

  function addHubHotspots() {
    const wrap = sceneEl.querySelector('.rpgSceneWrap');
    if (!wrap) return;
    const hotspots = [
      ['Friend', 'friendAgain', '54%', '58%'],
      ['Water', 'extraWater', '31%', '39%'],
      ['Tea', 'extraTea', '68%', '38%'],
      ['Takeout', state.packed ? null : 'packAsk', '79%', '74%'],
      ['Bill', 'billType', '17%', '73%']
    ];
    hotspots.forEach(([label,next,x,y]) => {
      const b = document.createElement('button');
      b.type='button'; b.className='worldHotspot'; b.textContent=label; b.style.left=x; b.style.top=y;
      if (!next) b.disabled=true; else b.addEventListener('click',()=>go(next));
      wrap.appendChild(b);
    });
  }

  function renderHub() {
    dialogue('Narrator', '你们还在餐厅。', 'Nǐmen hái zài cāntīng.', 'You are still at the restaurant. You decide when the meal is over.', 'meal', ['more']);
    addHubHotspots();
    const notes = [];
    if (state.extraWater) notes.push(`${state.extraWater} extra water${state.extraWater > 1 ? 's' : ''}`);
    if (state.extraTea) notes.push(`${state.extraTea} extra tea${state.extraTea > 1 ? 's' : ''}`);
    if (state.packed) notes.push('leftovers packed');
    setInteractionHeader('FREE CHOICE', 'What do you want to do next?', `${notes.length ? `<div class="situationHubNote"><b>Your route:</b> ${escapeHtml(notes.join(' · '))}</div>` : '<div class="situationHubNote"><b>No forced ending.</b> Tap something in the restaurant or choose an action below.</div>'}<div class="situationChoices gameChoiceGrid"></div>`);
    const wrap = interactionEl.querySelector('.situationChoices');
    const hubOptions = [
      { hanzi:'请再来一杯水。', pinyin:'Qǐng zài lái yì bēi shuǐ.', en:'Ask for more water', next:'extraWater', emoji:'💧' },
      { hanzi:'请再来一杯茶。', pinyin:'Qǐng zài lái yì bēi chá.', en:'Ask for more tea', next:'extraTea', emoji:'🍵' },
      { hanzi:'跟朋友聊天', pinyin:'gēn péngyou liáotiān', en:'Talk to your friend', next:'friendAgain', emoji:'💬' },
      { hanzi:state.packed?'已经打包了':'我要打包', pinyin:state.packed?'yǐjīng dǎbāo le':'wǒ yào dǎbāo', en:state.packed?'Already packed':'Ask for takeout', next:state.packed?null:'packAsk', emoji:'🥡', disabled:state.packed },
      { hanzi:'买单，谢谢。', pinyin:'Mǎidān, xièxie.', en:'Ask for the bill', next:'billType', emoji:'🧾' }
    ];
    hubOptions.forEach(opt => {
      const b = document.createElement('button');
      b.type='button'; b.className='situationChoice gameChoice hubChoice'; b.disabled=!!opt.disabled;
      b.innerHTML=`<span class="choiceIcon">${opt.emoji}</span><span class="choiceCopy"><b>${escapeHtml(opt.hanzi)}</b><span class="choicePinyin">${escapeHtml(opt.pinyin)}</span><span class="choiceEnglish">${escapeHtml(opt.en)}</span></span><span class="choiceArrow">›</span>`;
      if (opt.next) b.addEventListener('click',()=>go(opt.next));
      wrap.appendChild(b);
    });
  }

  function renderComplete() {
    sceneEl.innerHTML = '';
    dialogueEl.innerHTML = '';
    interactionEl.innerHTML = `
      <div class="situationSummary gameSummary">
        <div class="situationTrophy">🏮🏆</div>
        <p class="eyebrow">SITUATION COMPLETE</p>
        <h2>You handled a full restaurant visit in Mandarin.</h2>
        <p>Your route was shaped by your own choices, and you could stay at the table until you decided to leave.</p>
        <div class="summaryRouteGrid">
          <div class="summaryRouteItem"><small>Seat</small><b>${escapeHtml(SEATS[state.seat]?.en || '—')}</b></div>
          <div class="summaryRouteItem"><small>Drink</small><b>${escapeHtml(DRINKS[state.drink]?.en || '—')}</b></div>
          <div class="summaryRouteItem"><small>Meal</small><b>${escapeHtml(MEALS[state.meal]?.en || '—')}</b></div>
          <div class="summaryRouteItem"><small>Your reaction</small><b>${escapeHtml(OPINIONS[state.opinion]?.en || '—')}</b></div>
          <div class="summaryRouteItem"><small>Takeout</small><b>${state.packed ? 'Yes' : 'No'}</b></div>
          <div class="summaryRouteItem"><small>Payment</small><b>${escapeHtml(PAYMENTS[state.payment]?.en || '—')}</b></div>
          <div class="summaryRouteItem"><small>Extra drinks</small><b>${state.extraWater + state.extraTea}</b></div>
          <div class="summaryRouteItem"><small>Hints used</small><b>${state.hints}</b></div>
        </div>
        <div class="summaryActions"><button id="replayRestaurant" class="primaryButton" type="button">Replay a different path</button><button id="finishSituation" class="secondaryButton" type="button">Back to Situations</button></div>
      </div>`;
    feedbackEl.hidden = true;
    q('#replayRestaurant').addEventListener('click', startRestaurant);
    q('#finishSituation').addEventListener('click', exitToHome);
    try {
      localStorage.setItem('hsk1RestaurantLastRoute', JSON.stringify({ seat:state.seat, drink:state.drink, meal:state.meal, opinion:state.opinion, packed:state.packed, payment:state.payment, extraWater:state.extraWater, extraTea:state.extraTea, hints:state.hints, completedAt:new Date().toISOString() }));
    } catch (_) {}
  }

  function renderNode() {
    clearFeedback();
    hintBox.hidden = true;
    updateProgress();
    renderRoute();
    renderPhrasebook();

    const drink = state.drink ? DRINKS[state.drink] : DRINKS.water;
    const meal = state.meal ? MEALS[state.meal] : MEALS.rice;

    switch (state.node) {
      case 'arrival':
        dialogue('Host', '你好！几位？', 'Nǐ hǎo! Jǐ wèi?', 'Hello! How many people?', 'entrance', ['hello']);
        renderChoices({ prompt:'You are with one friend. What should you say?', correctKey:'two', options:[
          {key:'fine',hanzi:'我很好。',pinyin:'Wǒ hěn hǎo.',en:'I am fine.'},
          {key:'two',hanzi:'两位。',pinyin:'Liǎng wèi.',en:'Two people.',next:'seat',onChoose:()=>{unlock('two');addLog('Party','Two people');}},
          {key:'teacher',hanzi:'谢谢老师。',pinyin:'Xièxie lǎoshī.',en:'Thank you, teacher.'}
        ]});
        break;

      case 'seat':
        dialogue('Host', '你们想坐窗边还是里面？', 'Nǐmen xiǎng zuò chuāngbiān háishi lǐmiàn?', 'Would you like to sit by the window or inside?', 'table', ['thisWay']);
        renderChoices({ kicker:'YOUR CHOICE', prompt:'Choose the table you want. Both answers are natural.', branch:true, options:[
          {hanzi:'窗边。',pinyin:'Chuāngbiān.',en:'By the window.',next:'seated',onChoose:()=>{state.seat='window';addLog('Seat',SEATS.window.en);}},
          {hanzi:'里面。',pinyin:'Lǐmiàn.',en:'Inside.',next:'seated',onChoose:()=>{state.seat='inside';addLog('Seat',SEATS.inside.en);}}
        ]});
        break;

      case 'seated':
        dialogue('Host', '好的，这边请。', 'Hǎode, zhèbiān qǐng.', 'Sure. This way, please.', 'table', ['thisWay']);
        setInteractionHeader('STORY', `You sit ${SEATS[state.seat]?.en || 'at the table'}. The waiter comes over.`, '<button id="storyContinue" class="primaryButton" type="button">Continue →</button>');
        q('#storyContinue').addEventListener('click', () => go('drink'));
        break;

      case 'drink':
        dialogue('Waiter', '你们想喝什么？', 'Nǐmen xiǎng hē shénme?', 'What would you like to drink?', 'table', ['wantDrink','want']);
        renderChoices({ kicker:'YOUR CHOICE', prompt:'Choose your drink. The story will remember it.', branch:true, options:[
          {hanzi:'我要水。',pinyin:'Wǒ yào shuǐ.',en:'I would like water.',emoji:'💧',next:'drinkConfirm',onChoose:()=>{state.drink='water';addLog('Drink',DRINKS.water.en);}},
          {hanzi:'我要茶。',pinyin:'Wǒ yào chá.',en:'I would like tea.',emoji:'🍵',next:'drinkConfirm',onChoose:()=>{state.drink='tea';addLog('Drink',DRINKS.tea.en);}}
        ]});
        break;

      case 'drinkConfirm':
        dialogue('Waiter', `好的，一杯${state.drink === 'tea' ? '茶' : '水'}。`, `Hǎode, yì bēi ${state.drink === 'tea' ? 'chá' : 'shuǐ'}.`, `Okay, one ${drink.en}.`, 'table', ['want']);
        setInteractionHeader('STORY', `Your ${drink.en} is on the way. The waiter gives you the menu.`, '<button id="storyContinue" class="primaryButton" type="button">Open the menu →</button>');
        q('#storyContinue').addEventListener('click', () => go('menu'));
        break;

      case 'menu':
        dialogue('Narrator', '看看菜单。', 'Kànkan càidān.', 'Take a look at the menu.', 'menu');
        renderMenuChoices();
        break;

      case 'order': {
        const otherMeals = Object.entries(MEALS).filter(([k]) => k !== state.meal).map(([,m]) => m);
        dialogue('Waiter', '你想吃什么？', 'Nǐ xiǎng chī shénme?', 'What would you like to eat?', 'table', ['want']);
        renderChoices({ prompt:`You chose ${meal.en}. Say the order.`, correctKey:'target', options:[
          {key:'target',hanzi:`我要${meal.hanzi}。`,pinyin:`Wǒ yào ${meal.pinyin}.`,en:`I would like ${meal.en}.`,emoji:meal.emoji,next:'foodArrives'},
          {key:'drink',hanzi:`我要${drink.hanzi}。`,pinyin:`Wǒ yào ${drink.pinyin}.`,en:`I would like ${drink.en}.`,emoji:drink.emoji},
          {key:'other',hanzi:`我要${otherMeals[0].hanzi}。`,pinyin:`Wǒ yào ${otherMeals[0].pinyin}.`,en:`I would like ${otherMeals[0].en}.`,emoji:otherMeals[0].emoji}
        ]});
        break;
      }

      case 'foodArrives':
        dialogue('Waiter', `${meal.hanzi}来了，请慢用。`, `${meal.pinyin} lái le, qǐng màn yòng.`, `Your ${meal.en} is here. Enjoy your meal.`, 'meal');
        setInteractionHeader('STORY', `You start eating ${meal.en}. Your friend tries some too.`, '<button id="storyContinue" class="primaryButton" type="button">Talk with your friend →</button>');
        q('#storyContinue').addEventListener('click', () => go('friend'));
        break;

      case 'friend':
        dialogue('Friend', '这个怎么样？', 'Zhège zěnmeyàng?', 'How is this?', 'meal', ['tasty','spicy']);
        renderChoices({ kicker:'YOUR CHOICE', prompt:'React naturally. There is more than one good answer.', branch:true, options:Object.entries(OPINIONS).map(([key,o]) => ({...o,key,next:'tableHub',onChoose:()=>{state.opinion=key;addLog('At the table',o.en.replace(/[.!]/g,''));}})) });
        break;

      case 'friendAgain': {
        const n = state.friendTalks++ % 3;
        const dialogues = [
          ['Friend','你喜欢中国菜吗？','Nǐ xǐhuan Zhōngguó cài ma?','Do you like Chinese food?'],
          ['Friend','你觉得这个饭怎么样？','Nǐ juéde zhège fàn zěnmeyàng?','What do you think of this meal?'],
          ['Friend','下次还来吗？','Xià cì hái lái ma?','Would you come here again next time?']
        ];
        const d = dialogues[n];
        dialogue(d[0],d[1],d[2],d[3],'meal');
        const opts = n === 0 ? [
          {hanzi:'喜欢。',pinyin:'Xǐhuan.',en:'I like it.'},{hanzi:'很喜欢！',pinyin:'Hěn xǐhuan!',en:'I like it a lot.'},{hanzi:'还可以。',pinyin:'Hái kěyǐ.',en:'It is okay.'}
        ] : n === 1 ? [
          {hanzi:'很好吃。',pinyin:'Hěn hǎochī.',en:'It is very tasty.'},{hanzi:'有点辣。',pinyin:'Yǒudiǎn là.',en:'It is a little spicy.'},{hanzi:'不错。',pinyin:'Búcuò.',en:'Not bad.'}
        ] : [
          {hanzi:'当然！',pinyin:'Dāngrán!',en:'Of course!'},{hanzi:'可以。',pinyin:'Kěyǐ.',en:'Sure.'},{hanzi:'下次看看。',pinyin:'Xià cì kànkan.',en:'We will see next time.'}
        ];
        renderChoices({ kicker:'CONVERSATION', prompt:'Choose how you want to answer.', branch:true, options:opts.map(o=>({...o,next:'tableHub'})) });
        break;
      }

      case 'tableHub': renderHub(); break;

      case 'extraWater':
        dialogue('Waiter', '还要别的吗？', 'Hái yào bié de ma?', 'Would you like anything else?', 'table', ['more','anotherWater']);
        renderChoices({ prompt:'Ask for another glass of water.', correctKey:'water', options:[
          {key:'water',hanzi:'请再来一杯水。',pinyin:'Qǐng zài lái yì bēi shuǐ.',en:'Another glass of water, please.',emoji:'💧',next:'tableHub',onChoose:()=>{state.extraWater+=1;addLog('Extra drinks',`${state.extraWater + state.extraTea}`);}},
          {key:'bill',hanzi:'买单，谢谢。',pinyin:'Mǎidān, xièxie.',en:'The bill, please.',emoji:'🧾'},
          {key:'tea',hanzi:'请再来一杯茶。',pinyin:'Qǐng zài lái yì bēi chá.',en:'Another cup of tea, please.',emoji:'🍵'}
        ]});
        break;

      case 'extraTea':
        dialogue('Waiter', '还要别的吗？', 'Hái yào bié de ma?', 'Would you like anything else?', 'table', ['more','anotherTea']);
        renderChoices({ prompt:'Ask for another cup of tea.', correctKey:'tea', options:[
          {key:'tea',hanzi:'请再来一杯茶。',pinyin:'Qǐng zài lái yì bēi chá.',en:'Another cup of tea, please.',emoji:'🍵',next:'tableHub',onChoose:()=>{state.extraTea+=1;addLog('Extra drinks',`${state.extraWater + state.extraTea}`);}},
          {key:'water',hanzi:'请再来一杯水。',pinyin:'Qǐng zài lái yì bēi shuǐ.',en:'Another glass of water, please.',emoji:'💧'},
          {key:'done',hanzi:'不要了，谢谢。',pinyin:'Bú yào le, xièxie.',en:'Nothing else, thank you.'}
        ]});
        break;

      case 'packAsk':
        dialogue('Waiter', '要打包吗？', 'Yào dǎbāo ma?', 'Would you like it packed to go?', 'meal');
        renderChoices({ kicker:'YOUR CHOICE', prompt:'Do you want to take the leftovers with you?', branch:true, options:[
          {hanzi:'要，谢谢。',pinyin:'Yào, xièxie.',en:'Yes, thank you.',emoji:'🥡',next:'packPhrase'},
          {hanzi:'不用，谢谢。',pinyin:'Bú yòng, xièxie.',en:'No, thank you.',next:'tableHub'}
        ]});
        break;

      case 'packPhrase':
        dialogue('Waiter', '好的。', 'Hǎode.', 'Sure.', 'meal', ['pack']);
        renderChoices({ prompt:'Ask the waiter to pack the food.', correctKey:'pack', options:[
          {key:'pack',hanzi:'请帮我打包。',pinyin:'Qǐng bāng wǒ dǎbāo.',en:'Please pack this to go.',emoji:'🥡',next:'tableHub',onChoose:()=>{state.packed=true;addLog('Takeout','Packed to go');}},
          {key:'seat',hanzi:'我要窗边。',pinyin:'Wǒ yào chuāngbiān.',en:'I want a window seat.'},
          {key:'hello',hanzi:'你好，两位。',pinyin:'Nǐ hǎo, liǎng wèi.',en:'Hello, two people.'}
        ]});
        break;

      case 'billType':
        dialogue('Waiter', '需要什么吗？', 'Xūyào shénme ma?', 'Do you need anything?', 'table', ['bill']);
        renderTypeBill();
        break;

      case 'payment':
        dialogue('Cashier', '怎么付款？', 'Zěnme fùkuǎn?', 'How would you like to pay?', 'cashier');
        renderChoices({ kicker:'YOUR CHOICE', prompt:'Choose a payment method. All three are valid.', branch:true, options:Object.entries(PAYMENTS).map(([key,p]) => ({...p,key,next:'goodbye',onChoose:()=>{state.payment=key;addLog('Payment',p.en);}})) });
        break;

      case 'goodbye':
        dialogue('Host', '谢谢！欢迎再来！', 'Xièxie! Huānyíng zài lái!', 'Thank you! Come again!', 'entrance', ['goodbye']);
        renderChoices({ prompt:'End the interaction naturally.', correctKey:'bye', options:[
          {key:'bye',hanzi:'谢谢，再见！',pinyin:'Xièxie, zàijiàn!',en:'Thank you, goodbye!',next:'complete'},
          {key:'drink',hanzi:'我要水。',pinyin:'Wǒ yào shuǐ.',en:'I would like water.'},
          {key:'party',hanzi:'两位。',pinyin:'Liǎng wèi.',en:'Two people.'}
        ]});
        break;

      case 'complete': renderComplete(); break;
    }
  }

  function go(node) {
    state.node = node;
    renderNode();
    window.scrollTo({ top: q('#situations').offsetTop - 12, behavior: 'smooth' });
  }

  function startRestaurant() {
    state = freshState();
    home.hidden = true;
    game.hidden = false;
    drawerEl.hidden = true;
    go('arrival');
  }

  function exitToHome() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    game.hidden = true;
    home.hidden = false;
    drawerEl.hidden = true;
    window.scrollTo({ top: q('#situations').offsetTop - 12, behavior: 'smooth' });
  }

  function openDrawer(kind) {
    drawerEl.hidden = false;
    if (kind === 'route') {
      q('#situationDrawerEyebrow').textContent = 'YOUR ROUTE';
      q('#situationDrawerTitle').textContent = 'What your choices changed';
      phrasebookEl.hidden = true;
      routeEl.hidden = false;
    } else {
      q('#situationDrawerEyebrow').textContent = 'PHRASE BOOK';
      q('#situationDrawerTitle').textContent = 'Phrases you unlocked';
      phrasebookEl.hidden = false;
      routeEl.hidden = true;
    }
  }

  q('#startRestaurantSituation').addEventListener('click', startRestaurant);
  q('#exitSituation').addEventListener('click', exitToHome);
  q('#restartSituation').addEventListener('click', startRestaurant);
  q('#situationListenCurrent').addEventListener('click', () => playZh(currentDialogue.hanzi));
  q('#situationHintButton').addEventListener('click', () => {
    state.hints += 1;
    hintBox.hidden = false;
    hintBox.innerHTML = `<b>Hint</b><span>${escapeHtml(HINTS[state.node] || 'Read the Hanzi, say the pinyin aloud, then connect it to the English meaning before choosing.')}</span>`;
  });
  q('#situationPhrasebookButton').addEventListener('click', () => openDrawer('phrasebook'));
  q('#situationRouteButton').addEventListener('click', () => openDrawer('route'));
  q('#closeSituationDrawer').addEventListener('click', () => drawerEl.hidden = true);
})();
