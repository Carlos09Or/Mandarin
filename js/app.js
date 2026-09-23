const WORDS = window.WORDS;

let known = new Set(JSON.parse(localStorage.getItem("hsk1Known150")||"[]"));
let written = JSON.parse(localStorage.getItem("hsk1Written150")||"{}");
let writeIndex = +(localStorage.getItem("hsk1WriteIndex")||0);
if(writeIndex<0 || writeIndex>=WORDS.length) writeIndex=0;
let charIndex = 0;
let qAttempts=0, qCorrect=0, currentQ=null;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function save(){
  localStorage.setItem("hsk1Known150",JSON.stringify([...known]));
  localStorage.setItem("hsk1Written150",JSON.stringify(written));
  localStorage.setItem("hsk1WriteIndex",String(writeIndex));
  updateStats();
}
function speak(text, slow=false){
  if(!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[（）]/g," "));
  u.lang="zh-CN"; u.rate = slow ? 0.62 : 0.78;
  const zh=speechSynthesis.getVoices().find(v=>v.lang && v.lang.toLowerCase().startsWith("zh"));
  if(zh) u.voice=zh;
  speechSynthesis.speak(u);
}
function practiceChars(word){
  const base = word.hanzi.split("（")[0];
  return [...base].filter(ch=>/\p{Script=Han}/u.test(ch));
}
function updateStats(){
  $("#knownStat").textContent=`✓ ${known.size} dominadas`;
  const doneCount=WORDS.filter(w=>isWordWritten(w)).length;
  $("#writeStat").textContent=`✍️ ${doneCount} practicadas`;
  $("#writeProgressText").textContent=`${doneCount}/150`;
  $("#writeProgress").style.width=(doneCount/150*100)+"%";
}
function isWordWritten(w){
  const chars=practiceChars(w);
  return chars.length>0 && chars.every((c,i)=>written[w.n]?.includes(i));
}
function renderCards(){
  const q=$("#search").value.trim().toLowerCase();
  const f=$("#filter").value;
  const filtered=WORDS.filter(w=>{
    const hit=!q || `${w.hanzi} ${w.pinyin} ${w.es}`.toLowerCase().includes(q);
    const state=f==="all" || (f==="known"&&known.has(w.n)) || (f==="todo"&&!known.has(w.n)) || (f==="written"&&isWordWritten(w));
    return hit&&state;
  });
  $("#cards").innerHTML=filtered.map(w=>`
    <article class="card">
      <div class="num">#${w.n}</div>
      <div class="hanzi">${w.hanzi}</div>
      <div class="pinyin">${w.pinyin}</div>
      <div class="meaning">${w.es}</div>
      <div class="actions">
        <button class="btn speakCard" data-n="${w.n}">🔊 Pronunciar</button>
        <button class="btn writeCard" data-n="${w.n}">✍️ Trazar</button>
        <button class="btn ${known.has(w.n)?'good':''} knowCard" data-n="${w.n}">${known.has(w.n)?'✓':'○'}</button>
      </div>
    </article>`).join("");
  $$(".speakCard").forEach(b=>b.onclick=()=>speak(WORDS[b.dataset.n-1].hanzi));
  $$(".writeCard").forEach(b=>b.onclick=()=>{
    writeIndex=+b.dataset.n-1; charIndex=0; save(); switchPage("write"); renderWriter();
  });
  $$(".knowCard").forEach(b=>b.onclick=()=>{
    const n=+b.dataset.n; known.has(n)?known.delete(n):known.add(n); save(); renderCards();
  });
}
$("#search").oninput=renderCards; $("#filter").onchange=renderCards;

function switchPage(id){
  $$(".tab").forEach(t=>t.classList.toggle("active",t.dataset.page===id));
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===id));
  if(id==="write") renderWriter();
  if(id==="quiz") nextQuiz();
}
$$(".tab").forEach(t=>t.onclick=()=>switchPage(t.dataset.page));

let hwWriter=null;
let hwMistakes=0;
let hwCurrentStroke=0;
let guideVisible=true;
let writerSession=0;

function writerSize(){
  const el=$("#hanziWriterTarget");
  const w=Math.max(260,Math.min(430,Math.round(el.getBoundingClientRect().width||360)));
  return w;
}
function resetWriterMessage(text="Empieza por el primer trazo. Si te equivocas, la app te lo indicará al instante."){
  const box=$("#traceResult");
  box.className="result"; box.textContent=text;
  hwMistakes=0; hwCurrentStroke=0;
  $("#strokeCounter").textContent="Trazo 1";
  $("#strokeCounter").className="strokePill";
  $("#mistakeCounter").textContent="0 errores";
  $("#mistakeCounter").className="strokePill";
}
function createHanziWriter(mode="quiz"){
  const target=$("#hanziWriterTarget");
  const chars=practiceChars(WORDS[writeIndex]);
  const ch=chars[charIndex];
  if(!ch) return;
  const session=++writerSession;
  target.innerHTML="";
  resetWriterMessage(mode==="animation"?"Observa el orden de los trazos. Al terminar volverás a practicar.":undefined);
  if(typeof HanziWriter==="undefined"){
    $("#traceResult").className="result no";
    $("#traceResult").textContent="No se pudo cargar Hanzi Writer. Revisa tu conexión a Internet y recarga la página.";
    return;
  }
  const size=writerSize();
  hwWriter=HanziWriter.create('hanziWriterTarget', ch, {
    width:size,height:size,padding:24,
    showCharacter:false,
    showOutline:guideVisible,
    strokeColor:'#26274e',
    outlineColor:'#d7d7e4',
    drawingColor:'#5146cd',
    highlightColor:'#8b67ee',
    highlightCompleteColor:'#17885a',
    drawingWidth:12,
    strokeAnimationSpeed:1,
    delayBetweenStrokes:260,
    showHintAfterMisses:2,
    acceptBackwardsStrokes:false,
    leniency:0.85
  });
  if(mode==="animation"){
    hwWriter.animateCharacter({onComplete:()=>{
      if(session!==writerSession)return;
      setTimeout(()=>createHanziWriter("quiz"),500);
    }});
    return;
  }
  hwWriter.quiz({
    showHintAfterMisses:2,
    acceptBackwardsStrokes:false,
    leniency:0.85,
    onMistake:data=>{
      if(session!==writerSession)return;
      hwMistakes=data.totalMistakes;
      hwCurrentStroke=data.strokeNum;
      const box=$("#traceResult");
      box.className="result no";
      box.innerHTML=`❌ Ese trazo no corresponde. Debes hacer el <b>trazo ${data.strokeNum+1}</b> en la dirección correcta.${data.mistakesOnStroke>=2?' Mira la pista morada.':''}`;
      $("#strokeCounter").textContent=`Trazo ${data.strokeNum+1}`;
      $("#strokeCounter").className="strokePill bad";
      $("#mistakeCounter").textContent=`${data.totalMistakes} ${data.totalMistakes===1?'error':'errores'}`;
      $("#mistakeCounter").className="strokePill bad";
    },
    onCorrectStroke:data=>{
      if(session!==writerSession)return;
      hwMistakes=data.totalMistakes;
      hwCurrentStroke=data.strokeNum+1;
      const box=$("#traceResult");
      box.className="result ok";
      box.innerHTML=`✓ Trazo ${data.strokeNum+1} correcto${data.strokesRemaining?` · quedan <b>${data.strokesRemaining}</b>`:''}`;
      $("#strokeCounter").textContent=data.strokesRemaining?`Siguiente: ${data.strokeNum+2}`:"Último trazo ✓";
      $("#strokeCounter").className="strokePill good";
      $("#mistakeCounter").textContent=`${data.totalMistakes} ${data.totalMistakes===1?'error':'errores'}`;
      $("#mistakeCounter").className=data.totalMistakes?"strokePill bad":"strokePill good";
    },
    onComplete:data=>{
      if(session!==writerSession)return;
      const w=WORDS[writeIndex], chars=practiceChars(w);
      if(!written[w.n]) written[w.n]=[];
      if(!written[w.n].includes(charIndex)) written[w.n].push(charIndex);
      save(); renderWriterTabsOnly(); renderMini();
      const box=$("#traceResult");
      box.className="result ok";
      box.innerHTML=`✅ <b>${ch}</b> completado en el orden correcto · ${data.totalMistakes} ${data.totalMistakes===1?'error':'errores'}`;
      $("#strokeCounter").textContent="Completado ✓";
      $("#strokeCounter").className="strokePill good";
      if(charIndex<chars.length-1){
        setTimeout(()=>{if(session!==writerSession)return;charIndex++;renderWriterTabsOnly();createHanziWriter("quiz");},850);
      }else{
        setTimeout(()=>{
          if(session!==writerSession)return;
          writeIndex=(writeIndex+1)%WORDS.length; charIndex=0; save(); renderWriter();
        },1100);
      }
    }
  });
}

function renderWriter(){
  const w=WORDS[writeIndex], chars=practiceChars(w);
  if(charIndex>=chars.length) charIndex=0;
  $("#writeWord").textContent=w.hanzi;$("#writePinyin").textContent=w.pinyin;$("#writeMeaning").textContent=w.es;
  $("#characterTabs").innerHTML=chars.map((c,i)=>`<button class="charBtn ${i===charIndex?'active':''} ${written[w.n]?.includes(i)?'done':''}" data-i="${i}">${c}${written[w.n]?.includes(i)?' ✓':''}</button>`).join("");
  $$(".charBtn").forEach(b=>b.onclick=()=>{charIndex=+b.dataset.i;renderWriterTabsOnly();createHanziWriter("quiz");});
  renderMini(); updateStats();
  requestAnimationFrame(()=>createHanziWriter("quiz"));
}
function renderWriterTabsOnly(){
  const w=WORDS[writeIndex];
  $$(".charBtn").forEach((b,i)=>{b.classList.toggle("active",i===charIndex);b.classList.toggle("done",written[w.n]?.includes(i));});
}
function renderMini(){
  $("#miniList").innerHTML=WORDS.map(w=>`<div class="mini" data-n="${w.n}"><span><span class="num">#${w.n}</span> <span class="c">${w.hanzi}</span></span><span class="tick">${isWordWritten(w)?"✓":""}</span></div>`).join("");
  $$(".mini").forEach(m=>m.onclick=()=>{writeIndex=+m.dataset.n-1;charIndex=0;save();renderWriter();});
}
$("#resetQuiz").onclick=()=>createHanziWriter("quiz");
$("#animateChar").onclick=()=>createHanziWriter("animation");
$("#toggleGuide").onclick=()=>{
  guideVisible=!guideVisible;
  $("#toggleGuide").textContent=guideVisible?"Ocultar guía":"Mostrar guía";
  createHanziWriter("quiz");
};
$("#prevWord").onclick=()=>{writeIndex=(writeIndex-1+WORDS.length)%WORDS.length;charIndex=0;save();renderWriter();};
$("#nextWord").onclick=()=>{writeIndex=(writeIndex+1)%WORDS.length;charIndex=0;save();renderWriter();};
$("#speakWrite").onclick=()=>speak(WORDS[writeIndex].hanzi,true);

function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
function nextQuiz(){
  currentQ=WORDS[Math.floor(Math.random()*WORDS.length)];
  $("#qHanzi").textContent=currentQ.hanzi;$("#qPinyin").textContent=currentQ.pinyin;
  const opts=shuffle([currentQ,...shuffle(WORDS.filter(w=>w.n!==currentQ.n)).slice(0,3)]);
  $("#options").innerHTML=opts.map(o=>`<button class="opt" data-n="${o.n}">${o.es}</button>`).join("");
  $$(".opt").forEach(b=>b.onclick=()=>answerQuiz(b));
}
function answerQuiz(b){
  if($(".opt.correct"))return;
  qAttempts++;const ok=+b.dataset.n===currentQ.n;if(ok)qCorrect++;
  b.classList.add(ok?"correct":"wrong");
  $$(".opt").forEach(x=>{if(+x.dataset.n===currentQ.n)x.classList.add("correct")});
  $("#quizScore").textContent=`${qCorrect} correctas · ${qAttempts} intentos`;
  setTimeout(nextQuiz,850);
}
$("#speakQuiz").onclick=()=>speak(currentQ?.hanzi||"");

renderCards();renderWriter();updateStats();
