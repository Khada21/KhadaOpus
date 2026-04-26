let karaEditId=null,karaSelSyl=null,karaCursorX=null;
let karaSylTimer=null; // for space-key syllable preview
let karaSelSyls=new Set(); // multi-select syllable indices

function hasKaraoke(sub){return !!(sub&&sub.karaoke&&sub.karaoke.syllables&&sub.karaoke.syllables.length>0);}

const KARA_COLORS=['#1a3a6e','#1a4a2e','#3a1a5e','#4a2a1a','#1a3a4a','#3a3a1a','#2a1a3a','#1a4a3a'];

// ── Drag and drop from effects panel ──
(function initKaraDnd(){
  function setup(){
    const card=document.getElementById('fx-karaoke-card');
    if(!card)return;
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','karaoke-effect');e.dataTransfer.effectAllowed='copy';});
    document.addEventListener('dragover',e=>{if(e.target.closest('.sub-block')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
    document.addEventListener('dragenter',e=>{
      document.querySelectorAll('.sub-block.drop-target').forEach(el=>el.classList.remove('drop-target'));
      const b=e.target.closest('.sub-block');if(b)b.classList.add('drop-target');
    });
    document.addEventListener('dragleave',e=>{const b=e.target.closest('.sub-block');if(b&&!b.contains(e.relatedTarget))b.classList.remove('drop-target');});
    document.addEventListener('drop',e=>{
      document.querySelectorAll('.sub-block.drop-target').forEach(el=>el.classList.remove('drop-target'));
      if(e.dataTransfer.getData('text/plain')!=='karaoke-effect')return;
      const block=e.target.closest('.sub-block');if(!block)return;
      e.preventDefault();
      const sub=subs.find(s=>s.id===block.dataset.id);if(!sub)return;
      selId=sub.id;multi.clear();
      if(!hasKaraoke(sub))applyKaraokeToSub(sub);
      openKaraEditor(sub.id);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

function _splitIntoWordSyllables(text,totalMs){
  // Split into words, attaching trailing spaces to each word — no space-only syllables
  const raw=text.match(/\S+\s*/g)||[text];
  const words=raw.filter(w=>w.trim().length>0);
  if(!words.length)return [{text:text,durMs:totalMs}];
  const totalChars=words.reduce((a,w)=>a+w.trim().length,0)||1;
  const syllables=words.map(w=>({text:w,durMs:Math.max(50,Math.round((w.trim().length/totalChars)*totalMs))}));
  normalizeSylDurs(syllables,totalMs);
  return syllables;
}

function applyKaraokeToSub(sub){
  if(hasKaraoke(sub))return;
  const totalMs=sub.endMs-sub.startMs;
  const syllables=_splitIntoWordSyllables(sub.text,totalMs);
  sub.karaoke={syllables,preColor:'#5046EC',preAlpha:100,animation:'none',animSpeed:4};
  renderBlocks();renderSL();
}

function normalizeSylDurs(syls,totalMs){
  const sum=syls.reduce((a,s)=>a+s.durMs,0);if(sum<=0)return;
  const scale=totalMs/sum;
  syls.forEach(s=>s.durMs=Math.max(50,Math.round(s.durMs*scale)));
  const sum2=syls.reduce((a,s)=>a+s.durMs,0);
  syls[syls.length-1].durMs=Math.max(50,syls[syls.length-1].durMs+(totalMs-sum2));
}

function removeKaraokeFromSub(sub){
  if(!sub)return;
  delete sub.karaoke;
  renderBlocks();renderSL();closeKaraEditor();
}

// ── Numpad 0 / Play Syllable button ──
function karaPlaySyllable(){
  const sub=subs.find(s=>s.id===karaEditId);
  if(!sub||!sub.karaoke||karaSelSyl===null)return;
  const syls=sub.karaoke.syllables;
  let offsetMs=sub.startMs;
  for(let i=0;i<karaSelSyl;i++)offsetMs+=syls[i].durMs;
  const durMs=syls[karaSelSyl].durMs;
  if(karaSylTimer){clearTimeout(karaSylTimer);karaSylTimer=null;}
  if(player&&player._video){
    player._video.currentTime=offsetMs/1000;
    player.playVideo();
    karaSylTimer=setTimeout(()=>{player.pauseVideo();karaSylTimer=null;},durMs);
  } else {
    curMs=offsetMs;playing=true;
    document.getElementById('play-icon').textContent='⏸';
    karaSylTimer=setTimeout(()=>{playing=false;document.getElementById('play-icon').textContent='▶';karaSylTimer=null;},durMs);
  }
}

// ══ Multi-select helpers ══
function _karaSelAdjacent(){
  if(karaSelSyls.size<=1)return true;
  const s=[...karaSelSyls].sort((a,b)=>a-b);
  for(let i=1;i<s.length;i++)if(s[i]!==s[i-1]+1)return false;
  return true;
}

// Split syllable at sylIdx proportionally at frac (0..1)
function _karaSplitAtPos(sylIdx,frac){
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  const syl=syls[sylIdx];if(!syl)return;
  // Can't split a single char or too-short duration — just select it
  if(syl.text.length<=1||syl.durMs<100){
    karaSelSyl=sylIdx;karaSelSyls=new Set([sylIdx]);
    buildSylStrip();reDrawKaraWave();updKaraSelEdit();return;
  }
  frac=Math.max(0.05,Math.min(0.95,frac));
  const durA=Math.max(50,Math.round(syl.durMs*frac));
  const durB=Math.max(50,syl.durMs-durA);
  const charAt=Math.max(1,Math.min(syl.text.length-1,Math.round(syl.text.length*frac)));
  syls.splice(sylIdx,1,{text:syl.text.slice(0,charAt),durMs:durA},{text:syl.text.slice(charAt),durMs:durB});
  karaSelSyl=sylIdx;karaSelSyls=new Set([sylIdx]);
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}

// Split each selected syllable by words
function _karaSplitSelByWords(){
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  const sorted=[...karaSelSyls].sort((a,b)=>b-a); // reverse so indices stay valid
  sorted.forEach(idx=>{
    const syl=syls[idx];
    const words=syl.text.match(/\S+\s*/g)||[];
    if(words.length<=1)return;
    const totalChars=words.reduce((a,w)=>a+w.trim().length,0)||1;
    const newSyls=words.map(w=>({text:w,durMs:Math.max(50,Math.round((w.trim().length/totalChars)*syl.durMs))}));
    normalizeSylDurs(newSyls,syl.durMs);
    syls.splice(idx,1,...newSyls);
  });
  const first=[...karaSelSyls].sort((a,b)=>a-b)[0]??0;
  karaSelSyl=first;karaSelSyls=new Set([first]);
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}

// Split each selected syllable by letters
function _karaSplitSelByLetters(){
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  const sorted=[...karaSelSyls].sort((a,b)=>b-a);
  sorted.forEach(idx=>{
    const syl=syls[idx];
    if(syl.text.trim().length<=1)return;
    const raw=[...syl.text];
    const merged=[];
    raw.forEach(c=>{if(c===' '&&merged.length>0)merged[merged.length-1]+=c;else merged.push(c);});
    const chars=merged.filter(s=>s.trim().length>0);
    if(chars.length<=1)return;
    const newSyls=chars.map(c=>({text:c,durMs:Math.max(30,Math.round(syl.durMs/chars.length))}));
    normalizeSylDurs(newSyls,syl.durMs);
    syls.splice(idx,1,...newSyls);
  });
  const first=[...karaSelSyls].sort((a,b)=>a-b)[0]??0;
  karaSelSyl=first;karaSelSyls=new Set([first]);
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}

// Delete all selected syllables (distributes duration to last remaining)
function _karaDelMultiSel(){
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  if(syls.length<=karaSelSyls.size)return;
  const sorted=[...karaSelSyls].sort((a,b)=>b-a);
  let delDur=0;
  sorted.forEach(idx=>{delDur+=syls[idx].durMs;syls.splice(idx,1);});
  if(syls.length>0)syls[syls.length-1].durMs+=delDur;
  const first=[...karaSelSyls].sort((a,b)=>a-b)[0]??0;
  const ni=Math.min(first,syls.length-1);
  karaSelSyl=ni;karaSelSyls=new Set([ni]);
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}

// Right-click context menu on syllables
function _showKaraSylCtxMenu(e,sylIdx){
  e.preventDefault();e.stopPropagation();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  // If right-clicked syl is not in current selection, reset selection to it
  if(!karaSelSyls.has(sylIdx)){
    karaSelSyl=sylIdx;karaSelSyls=new Set([sylIdx]);
    buildSylStrip();reDrawKaraWave();updKaraSelEdit();
  }
  const isMulti=karaSelSyls.size>1;
  const syl=syls[karaSelSyl??sylIdx];
  const canJoin=karaSelSyls.size>1&&_karaSelAdjacent();
  const canSplitLetters=isMulti
    ?[...karaSelSyls].some(i=>syls[i]&&syls[i].text.trim().length>1)
    :!!(syl&&syl.text.trim().length>1);
  const canSplitWords=isMulti
    ?[...karaSelSyls].some(i=>syls[i]&&syls[i].text.trim().split(/\s+/).filter(Boolean).length>1)
    :!!(syl&&syl.text.trim().split(/\s+/).filter(Boolean).length>1);
  document.getElementById('kara-ctx-menu')?.remove();
  const menu=document.createElement('div');
  menu.id='kara-ctx-menu';
  menu.style.cssText='position:fixed;z-index:900;background:var(--panel);border:1px solid var(--border2);border-radius:4px;padding:4px 0;min-width:195px;box-shadow:0 8px 24px rgba(0,0,0,.6)';
  menu.style.left=Math.min(e.clientX,window.innerWidth-210)+'px';
  menu.style.top=Math.min(e.clientY,window.innerHeight-220)+'px';
  function mitem(label,action,disabled,col){
    const d=document.createElement('div');
    d.style.cssText=`padding:6px 14px;font-family:var(--mono);font-size:11px;cursor:${disabled?'default':'pointer'};color:${disabled?'var(--text3)':col||'var(--text)'};user-select:none`;
    d.textContent=label;
    if(!disabled){d.onmouseover=()=>d.style.background='var(--panel2)';d.onmouseout=()=>d.style.background='';d.onclick=()=>{menu.remove();action();};}
    menu.appendChild(d);
  }
  function msep(){const s=document.createElement('div');s.style.cssText='height:1px;background:var(--border);margin:3px 0';menu.appendChild(s);}
  if(!isMulti){
    mitem('✂ Split by words',()=>_karaSplitSelByWords(),!canSplitWords);
    mitem('Aa Split by letters',()=>_karaSplitSelByLetters(),!canSplitLetters);
    msep();
    mitem('⊞ Join with next',()=>karaJoinSel(),karaSelSyl===null||karaSelSyl>=syls.length-1);
    msep();
    mitem('✕ Delete',()=>karaDelSel(),syls.length<=1,'var(--red)');
  } else {
    const n=karaSelSyls.size;
    mitem(`⊞ Join ${n} syllables`,()=>karaJoinSel(),!canJoin);
    msep();
    mitem('✂ Split selected by words',()=>_karaSplitSelByWords(),!canSplitWords);
    mitem('Aa Split selected by letters',()=>_karaSplitSelByLetters(),!canSplitLetters);
    msep();
    mitem(`✕ Delete ${n} selected`,()=>_karaDelMultiSel(),syls.length<=n,'var(--red)');
  }
  document.body.appendChild(menu);
  function onOut(ev){if(!menu.contains(ev.target)){menu.remove();document.removeEventListener('mousedown',onOut);}}
  setTimeout(()=>document.addEventListener('mousedown',onOut),0);
}

// ── Open / Close ──
function openKaraEditor(id){
  let panelH=300;
  const insp=document.getElementById('inspector');
  const karaEd=document.getElementById('kara-editor');
  const moveEd=document.getElementById('move-editor');
  if(moveEditId){
    if(moveEd&&moveEd.offsetHeight>0)panelH=moveEd.offsetHeight;
    closeMoveEditor();
  } else if(mirrorEditId){
    const mirEd=document.getElementById('mirror-editor');
    if(mirEd&&mirEd.offsetHeight>0)panelH=mirEd.offsetHeight;
    closeMirrorEditor();
  } else if(fadeEditId){
    const fadEd=document.getElementById('fade-editor');
    if(fadEd&&fadEd.offsetHeight>0)panelH=fadEd.offsetHeight;
    closeFadeEditor();
  } else if(karaEditId&&karaEditId!==id){
    if(karaEd&&karaEd.offsetHeight>0)panelH=karaEd.offsetHeight;
    closeKaraEditor();
  } else {
    if(insp&&insp.offsetHeight>0)panelH=insp.offsetHeight;
  }

  karaEditId=id;karaSelSyl=null;karaSelSyls=new Set();karaCursorX=null;
  insp.style.display='none';
  moveEd&&(moveEd.style.display='none');
  karaEd.style.display='flex';
  if(panelH>0){karaEd.style.flex='none';karaEd.style.height=panelH+'px';}
  const sub=subs.find(s=>s.id===id);
  if(sub&&sub.karaoke){
    const kpre=document.getElementById('kc-pre');
    const kprea=document.getElementById('kc-pre-a');
    if(kpre)kpre.value=sub.karaoke.preColor||'#5046EC';
    if(kprea)kprea.value=sub.karaoke.preAlpha??100;
    // Sync animation buttons
    const anim=sub.karaoke.animation||'none';
    ['none','ytk-fade','reveal'].forEach(key=>{
      const btn=document.getElementById('kara-anim-'+key);
      if(btn)btn.classList.toggle('active',key===anim);
    });
    // Sync speed slider
    const speedRow=document.getElementById('kara-anim-speed-row');
    const speedIn=document.getElementById('kara-anim-speed');
    const speedValEl=document.getElementById('kara-anim-speed-val');
    const spd=sub.karaoke.animSpeed??4;
    if(speedRow)speedRow.style.display=(anim==='ytk-fade'||anim==='reveal')?'flex':'none';
    if(speedIn)speedIn.value=spd;
    if(speedValEl)speedValEl.textContent=spd;
    _updKaraAnimDesc(anim);
  }
  const waveEmpty=document.getElementById('ke-wave-empty');
  if(waveEmpty)waveEmpty.style.display='none';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    reDrawKaraWave();
    buildSylStrip();
  }));
  renderBlocks();
}

function closeKaraEditor(){
  const karaEd=document.getElementById('kara-editor');
  const insp=document.getElementById('inspector');
  const karaH=karaEd?karaEd.offsetHeight:0;
  karaEditId=null;karaSelSyl=null;karaSelSyls=new Set();karaCursorX=null;
  if(karaSylTimer){clearTimeout(karaSylTimer);karaSylTimer=null;playing=false;document.getElementById('play-icon').textContent='▶';}
  // Clean up syl-strip event listeners
  const row=document.getElementById('ke-syl-row');
  if(row&&row._karaAC){row._karaAC.abort();row._karaAC=null;}
  hideDragTooltip();
  if(karaEd)karaEd.style.display='none';
  insp.style.display='flex';
  if(karaH>0){insp.style.flex='none';insp.style.height=karaH+'px';}
  renderBlocks();
}

// ── Draw waveform + syllable color bands (Aegisub-style) ──
function reDrawKaraWave(){
  const canvas=document.getElementById('ke-wave-canvas');
  const wrap=document.getElementById('ke-wave-wrap');
  if(!canvas||!wrap)return;
  const W=wrap.offsetWidth||wrap.parentElement?.offsetWidth||300;
  const H=wrap.offsetHeight||120;
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);

  const sub=subs.find(s=>s.id===karaEditId);
  if(!sub||!sub.karaoke){ctx.fillStyle='#111114';ctx.fillRect(0,0,W,H);return;}
  const syls=sub.karaoke.syllables;
  const totalDurMs=syls.reduce((a,s)=>a+s.durMs,0)||1;
  const preColor=sub.karaoke.preColor||'#5046EC';
  function hexToRgb(h){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return[r,g,b];}
  const[pr,pg,pb]=hexToRgb(preColor);

  // 1. Dark background
  ctx.fillStyle='#0a0a0e';
  ctx.fillRect(0,0,W,H);

  // 2. Dim syllable tint bands
  let bx=0;
  syls.forEach((syl,i)=>{
    const bw=(syl.durMs/totalDurMs)*W;
    const isSelPrimary=i===karaSelSyl;
    const isSelMulti=karaSelSyls.has(i)&&!isSelPrimary;
    ctx.fillStyle=isSelPrimary
      ?`rgba(${pr},${pg},${pb},0.30)`
      :isSelMulti
        ?`rgba(${pr},${pg},${pb},0.18)`
        :`rgba(${pr},${pg},${pb},0.10)`;
    ctx.fillRect(Math.floor(bx),0,Math.ceil(bw),H);
    bx+=bw;
  });

  // 3. Real audio waveform scoped to the subtitle's time window
  const mid=H/2;
  if(_waveformSamples&&_waveformSamples.length>0&&dur>0){
    const subStartMs=sub.startMs;
    const subEndMs=sub.startMs+totalDurMs;
    const totalSamples=_waveformSamples.length;
    const startFrac=subStartMs/dur;
    const endFrac=Math.min(subEndMs/dur,1);
    const wavePeaks=new Float32Array(W);
    for(let px=0;px<W;px++){
      const f0=startFrac+(endFrac-startFrac)*(px/W);
      const f1=startFrac+(endFrac-startFrac)*((px+1)/W);
      const s=Math.floor(f0*totalSamples);
      const e=Math.ceil(f1*totalSamples);
      let rms=0,n=0;
      for(let i=s;i<e&&i<totalSamples;i++){rms+=_waveformSamples[i]*_waveformSamples[i];n++;}
      wavePeaks[px]=n>0?Math.sqrt(rms/n):0;
    }
    let maxP=0;for(let i=0;i<W;i++)if(wavePeaks[i]>maxP)maxP=wavePeaks[i];
    if(maxP>0)for(let i=0;i<W;i++)wavePeaks[i]/=maxP;
    for(let px=0;px<W;px++){
      const amp=wavePeaks[px]*mid*0.90;
      ctx.fillStyle=`rgba(${pr},${pg},${pb},0.65)`;
      ctx.fillRect(px,mid-amp,1,amp*2||1);
    }
    ctx.strokeStyle=`rgba(${pr},${pg},${pb},0.95)`;
    ctx.lineWidth=1.5;
    ctx.beginPath();
    for(let px=0;px<W;px++){const y=mid-wavePeaks[px]*mid*0.90;px===0?ctx.moveTo(px,y):ctx.lineTo(px,y);}
    ctx.stroke();
    ctx.beginPath();
    for(let px=0;px<W;px++){const y=mid+wavePeaks[px]*mid*0.90;px===0?ctx.moveTo(px,y):ctx.lineTo(px,y);}
    ctx.stroke();
  } else {
    ctx.strokeStyle=`rgba(${pr},${pg},${pb},0.3)`;
    ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(W,mid);ctx.stroke();
    ctx.setLineDash([]);
  }

  // 4. Selection highlights on top of waveform
  bx=0;
  syls.forEach((syl,i)=>{
    const bw=(syl.durMs/totalDurMs)*W;
    if(i===karaSelSyl){
      // Primary selection: solid fill + white border
      ctx.fillStyle=`rgba(${pr},${pg},${pb},0.35)`;
      ctx.fillRect(Math.floor(bx),0,Math.ceil(bw),H);
      ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=2;ctx.setLineDash([]);
      ctx.strokeRect(Math.floor(bx)+1,1,Math.ceil(bw)-2,H-2);
    } else if(karaSelSyls.has(i)){
      // Multi-select secondary: lighter fill + dashed border
      ctx.fillStyle=`rgba(${pr},${pg},${pb},0.18)`;
      ctx.fillRect(Math.floor(bx),0,Math.ceil(bw),H);
      ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1.5;ctx.setLineDash([3,2]);
      ctx.strokeRect(Math.floor(bx)+1,1,Math.ceil(bw)-2,H-2);
      ctx.setLineDash([]);
    }
    bx+=bw;
  });

  // 5. Syllable labels bottom-anchored
  bx=0;
  syls.forEach((syl,i)=>{
    const bw=(syl.durMs/totalDurMs)*W;
    const isSel=i===karaSelSyl;
    const label=syl.text.trimEnd()||'·';
    ctx.font=(isSel?'bold ':'')+(H>60?'12':'10')+'px monospace';
    ctx.textAlign='center';ctx.textBaseline='bottom';
    ctx.shadowColor='rgba(0,0,0,0.95)';ctx.shadowBlur=5;
    ctx.fillStyle=isSel?'#ffffff':karaSelSyls.has(i)?'rgba(255,255,255,0.85)':'rgba(255,255,255,0.7)';
    ctx.fillText(label.length>10?label.slice(0,9)+'…':label,Math.floor(bx)+Math.ceil(bw)/2,H-4);
    ctx.shadowBlur=0;
    bx+=bw;
  });

  // 6. Boundary dividers & drag arrows
  bx=0;
  syls.forEach((syl,i)=>{
    bx+=(syl.durMs/totalDurMs)*W;
    if(i<syls.length-1){
      ctx.strokeStyle='rgba(255,255,255,0.55)';ctx.lineWidth=2;ctx.setLineDash([]);
      ctx.beginPath();ctx.moveTo(Math.round(bx),0);ctx.lineTo(Math.round(bx),H);ctx.stroke();
      const m=H/2;
      ctx.fillStyle='rgba(255,255,255,0.8)';
      ctx.beginPath();ctx.moveTo(Math.round(bx)-6,m);ctx.lineTo(Math.round(bx)-2,m-4);ctx.lineTo(Math.round(bx)-2,m+4);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(Math.round(bx)+6,m);ctx.lineTo(Math.round(bx)+2,m-4);ctx.lineTo(Math.round(bx)+2,m+4);ctx.closePath();ctx.fill();
    }
  });
}

// ── Build syllable word strip (draggable boundaries) ──
function buildSylStrip(){
  const row=document.getElementById('ke-syl-row');if(!row)return;

  // Abort previous container-level listeners cleanly
  if(row._karaAC){row._karaAC.abort();}
  row._karaAC=new AbortController();
  const sig=row._karaAC.signal;

  row.innerHTML='';
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  if(!syls.length)return;
  const totalMs=syls.reduce((a,s)=>a+s.durMs,0)||1;
  const pc=(sub.karaoke&&sub.karaoke.preColor)||'#5046EC';

  // 1. Draw syllable segments — pointer-events:none (CSS), interaction handled by container
  let leftPct=0;
  syls.forEach((syl,i)=>{
    const widthPct=(syl.durMs/totalMs)*100;
    const isPrimary=i===karaSelSyl;
    const isMultiSel=karaSelSyls.has(i)&&!isPrimary;
    const seg=document.createElement('div');
    seg.className='ke-syl-seg'+(isPrimary?' sel':isMultiSel?' multi-sel':'');
    seg.style.left=leftPct+'%';
    seg.style.width=widthPct+'%';
    seg.style.background=isPrimary?pc:isMultiSel?'rgba(80,70,236,0.45)':'rgba(80,70,236,0.32)';
    seg.style.outline=isPrimary?`2px solid ${pc}`:isMultiSel?`2px dashed ${pc}`:'none';
    seg.style.outlineOffset='-2px';
    seg.style.color='#fff';
    seg.dataset.idx=i;
    seg.textContent=syl.text.trimEnd()||'·';
    seg.title=syl.text.trimEnd()+' · '+syl.durMs+'ms';
    row.appendChild(seg);
    leftPct+=widthPct;
  });

  // 2. Draw edge handles at each internal boundary (pointer-events:auto via CSS z-index:20)
  let edgePct=0;
  syls.forEach((syl,i)=>{
    edgePct+=(syl.durMs/totalMs)*100;
    if(i<syls.length-1){
      const edge=document.createElement('div');
      edge.className='ke-syl-edge';
      edge.style.left=edgePct+'%';
      edge.dataset.boundary=i;
      edge.addEventListener('mousedown',ev=>startSylBoundaryDrag(ev,i,edge));
      row.appendChild(edge);
    }
  });

  // 3. Split indicator line + snap tooltip (always last child, pointer-events:none)
  const ind=document.createElement('div');
  ind.className='ke-split-ind';
  const tip=document.createElement('div');
  tip.className='ke-split-tip';
  ind.appendChild(tip);
  row.appendChild(ind);

  // 4. Container-level cut interaction
  // Helper: get syllable at pixel x, given row width W
  function _sylAtX(x,W){
    let px=0;
    for(let i=0;i<syls.length;i++){
      const w=(syls[i].durMs/totalMs)*W;
      if(x>=px&&x<px+w)return{idx:i,startPx:px,width:w};
      px+=w;
    }
    return null;
  }

  let _hoverIdx=null,_hoverFrac=null;

  row.addEventListener('mousemove',e=>{
    // Don't show indicator when hovering over a boundary edge handle
    if(e.target.classList.contains('ke-syl-edge')){
      ind.style.display='none';_hoverIdx=null;_hoverFrac=null;return;
    }
    const rect=row.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const W=rect.width||300;
    const hit=_sylAtX(x,W);
    const syl=hit?syls[hit.idx]:null;
    if(hit&&syl.text.length>1&&syl.durMs>=100){
      // Snap to nearest character boundary position
      const N=syl.text.length;
      let snapChar=1,minDist=Infinity;
      for(let c=1;c<N;c++){
        const bx=hit.startPx+(c/N)*hit.width;
        const d=Math.abs(x-bx);
        if(d<minDist){minDist=d;snapChar=c;}
      }
      const snapX=hit.startPx+(snapChar/N)*hit.width;
      _hoverIdx=hit.idx;
      _hoverFrac=snapChar/N;
      ind.style.left=snapX+'px';
      ind.style.display='block';
      // Show split preview in tooltip
      tip.textContent=syl.text.slice(0,snapChar)+' | '+syl.text.slice(snapChar);
    } else {
      ind.style.display='none';_hoverIdx=null;_hoverFrac=null;
    }
  },{signal:sig});

  row.addEventListener('mouseleave',()=>{
    ind.style.display='none';_hoverIdx=null;_hoverFrac=null;
  },{signal:sig});

  // Right-click: context menu (identify syllable from position)
  row.addEventListener('contextmenu',e=>{
    if(e.target.classList.contains('ke-syl-edge'))return;
    const rect=row.getBoundingClientRect();
    const hit=_sylAtX(e.clientX-rect.left,rect.width||300);
    if(hit)_showKaraSylCtxMenu(e,hit.idx);
  },{signal:sig});

  // Click: split at indicator position; shift+click = range select
  row.addEventListener('click',e=>{
    if(e.target.classList.contains('ke-syl-edge'))return;
    if(e.shiftKey){
      // Shift+click = range select (find syllable at click x)
      const rect=row.getBoundingClientRect();
      const hit=_sylAtX(e.clientX-rect.left,rect.width||300);
      if(hit!==null&&karaSelSyl!==null){
        const lo=Math.min(karaSelSyl,hit.idx),hi=Math.max(karaSelSyl,hit.idx);
        const ns=new Set();for(let j=lo;j<=hi;j++)ns.add(j);
        karaSelSyls=ns;karaSelSyl=hit.idx;
        buildSylStrip();reDrawKaraWave();updKaraSelEdit();
      } else if(hit!==null){
        karaSelSyl=hit.idx;karaSelSyls=new Set([hit.idx]);
        buildSylStrip();reDrawKaraWave();updKaraSelEdit();
      }
      return;
    }
    // Normal click = split at indicator
    if(_hoverIdx!==null&&_hoverFrac!==null){
      _karaSplitAtPos(_hoverIdx,_hoverFrac);
    }
  },{signal:sig});

  updKaraSelEdit();
}

// ── Drag time tooltip ──
function showDragTooltip(clientX,clientY,ms,sub){
  const tt=document.getElementById('ke-drag-tooltip');if(!tt)return;
  const absMs=(sub?sub.startMs:0)+ms;
  tt.textContent=msToDisp(absMs);
  tt.style.display='block';
  tt.style.left=clientX+'px';
  tt.style.top=clientY+'px';
}
function hideDragTooltip(){
  const tt=document.getElementById('ke-drag-tooltip');if(tt)tt.style.display='none';
}

function startSylBoundaryDrag(e,i,edgeEl){
  e.preventDefault();e.stopPropagation();
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  const origA=syls[i].durMs,origB=syls[i+1].durMs,combined=origA+origB;
  const totalMs=syls.reduce((a,s)=>a+s.durMs,0)||1;
  const row=document.getElementById('ke-syl-row');
  const startX=e.clientX;
  edgeEl.classList.add('dragging');
  document.body.style.cursor='ew-resize';
  document.body.style.userSelect='none';

  const segEls=row.querySelectorAll('.ke-syl-seg');
  const segA=segEls[i], segB=segEls[i+1];

  function onMove(ev){
    const stripW=row.getBoundingClientRect().width||300;
    const dx=ev.clientX-startX;
    const dms=Math.round((dx/stripW)*totalMs);
    const newA=Math.max(50,Math.min(combined-50,origA+dms));
    const newB=Math.max(50,combined-newA);
    syls[i].durMs=newA;
    syls[i+1].durMs=newB;
    const newAPct=(newA/totalMs)*100;
    const newBPct=(newB/totalMs)*100;
    if(segA)segA.style.width=newAPct+'%';
    if(segB){
      const aLeftPct=parseFloat(segA?segA.style.left:0)||0;
      segB.style.left=(aLeftPct+newAPct)+'%';
      segB.style.width=newBPct+'%';
    }
    const aLeftPct2=parseFloat(segA?segA.style.left:0)||0;
    edgeEl.style.left=(aLeftPct2+newAPct)+'%';
    const newCumMs=syls.slice(0,i+1).reduce((a,s)=>a+s.durMs,0);
    showDragTooltip(ev.clientX,ev.clientY,newCumMs,sub);
    reDrawKaraWave();
    if(karaSelSyl===i||karaSelSyl===i+1)updKaraSelEdit();
  }

  function onUp(){
    edgeEl.classList.remove('dragging');
    hideDragTooltip();
    document.body.style.cursor='';
    document.body.style.userSelect='';
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    buildSylStrip();reDrawKaraWave();
  }
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}

// Canvas interaction: drag boundary handles only (splitting moved to syl strip below)
(function initWaveInteraction(){
  const SNAP_PX=10;

  function getBoundaryData(sub,W){
    const syls=sub.karaoke.syllables;
    const totalMs=syls.reduce((a,s)=>a+s.durMs,0)||1;
    const result=[];
    let px=0;
    for(let i=0;i<syls.length-1;i++){
      px+=(syls[i].durMs/totalMs)*W;
      result.push({x:px,i});
    }
    return result;
  }

  function setup(){
    const wrap=document.getElementById('ke-wave-wrap');if(!wrap)return;

    wrap.addEventListener('mousedown',e=>{
      if(!karaEditId)return;
      const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
      const rect=wrap.getBoundingClientRect();
      const W=rect.width||300;
      const x=e.clientX-rect.left;
      const syls=sub.karaoke.syllables;
      const totalMs=syls.reduce((a,s)=>a+s.durMs,0)||1;

      const boundaries=getBoundaryData(sub,W);
      let nearBoundary=null;
      for(const b of boundaries){
        if(Math.abs(x-b.x)<=SNAP_PX){nearBoundary=b;break;}
      }

      if(nearBoundary!==null){
        // ── Drag boundary ──
        e.preventDefault();
        snapshot();
        const i=nearBoundary.i;
        const origA=syls[i].durMs,origB=syls[i+1].durMs,combined=origA+origB;
        const startX=e.clientX;
        const row=document.getElementById('ke-syl-row');
        wrap.style.cursor='ew-resize';
        document.body.style.userSelect='none';

        function onMove(ev){
          const curW=wrap.getBoundingClientRect().width||300;
          const dx=ev.clientX-startX;
          const dms=Math.round((dx/curW)*totalMs);
          syls[i].durMs=Math.max(50,Math.min(combined-50,origA+dms));
          syls[i+1].durMs=Math.max(50,combined-syls[i].durMs);
          const segEls=row?row.querySelectorAll('.ke-syl-seg'):[];
          const edgeEls=row?row.querySelectorAll('.ke-syl-edge'):[];
          if(segEls[i]&&segEls[i+1]){
            const newAPct=(syls[i].durMs/totalMs)*100;
            const newBPct=(syls[i+1].durMs/totalMs)*100;
            const aLeft=parseFloat(segEls[i].style.left)||0;
            segEls[i].style.width=newAPct+'%';
            segEls[i+1].style.left=(aLeft+newAPct)+'%';
            segEls[i+1].style.width=newBPct+'%';
            if(edgeEls[i])edgeEls[i].style.left=(aLeft+newAPct)+'%';
          }
          const newCumMs=syls.slice(0,i+1).reduce((a,s)=>a+s.durMs,0);
          showDragTooltip(ev.clientX,ev.clientY,newCumMs,sub);
          reDrawKaraWave();
          if(karaSelSyl===i||karaSelSyl===i+1)updKaraSelEdit();
        }
        function onUp(){
          wrap.style.cursor='';
          hideDragTooltip();
          document.body.style.userSelect='';
          document.removeEventListener('mousemove',onMove);
          document.removeEventListener('mouseup',onUp);
          buildSylStrip();reDrawKaraWave();
        }
        document.addEventListener('mousemove',onMove);
        document.addEventListener('mouseup',onUp);
      }
    });

    // Cursor: ew-resize near boundary, default otherwise (splitting is now syl-strip only)
    wrap.addEventListener('mousemove',e=>{
      if(!karaEditId)return;
      const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
      const rect=wrap.getBoundingClientRect();
      const W=rect.width||300;
      const x=e.clientX-rect.left;
      const boundaries=getBoundaryData(sub,W);
      wrap.style.cursor=boundaries.some(b=>Math.abs(x-b.x)<=SNAP_PX)?'ew-resize':'default';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

function updKaraSelEdit(){
  const noSel=document.getElementById('ke-no-sel');
  const selEdit=document.getElementById('ke-sel-edit');
  if(!noSel||!selEdit)return;
  const sub=karaEditId?subs.find(s=>s.id===karaEditId):null;
  if(!sub||!sub.karaoke||karaSelSyl===null||!sub.karaoke.syllables[karaSelSyl]){
    noSel.style.display='';selEdit.style.display='none';
  } else {
    const syl=sub.karaoke.syllables[karaSelSyl];
    noSel.style.display='none';selEdit.style.display='flex';
    const kt=document.getElementById('ke-text');
    const kd=document.getElementById('ke-dur');
    if(kt)kt.value=syl.text;
    if(kd)kd.value=syl.durMs;
  }

  // Update toolbar button states
  const syls2=sub?.karaoke?.syllables||[];
  const syl2=karaSelSyl!==null?syls2[karaSelSyl]:null;
  const canSplitSingle=!!(syl2&&syl2.text.length>1&&syl2.durMs>=100);

  const btnSplit=document.getElementById('ke-btn-split');
  const btnJoin=document.getElementById('ke-btn-join');
  const btnDel=document.getElementById('ke-btn-del');
  const btnAutoChars=document.getElementById('ke-btn-autochars');

  if(btnSplit)btnSplit.disabled=!canSplitSingle;
  if(btnJoin){
    if(karaSelSyls.size>1){
      const adj=_karaSelAdjacent();
      btnJoin.disabled=!adj;
      btnJoin.textContent=`⊞ Join (${karaSelSyls.size})`;
      btnJoin.title=adj?`Join ${karaSelSyls.size} adjacent syllables`:'Syllables must be adjacent to join';
    } else {
      btnJoin.disabled=karaSelSyl===null||karaSelSyl>=syls2.length-1;
      btnJoin.textContent='⊞ Join';
      btnJoin.title='Join selected syllable with the next one';
    }
  }
  if(btnDel)btnDel.disabled=!syl2||syls2.length<=1;
  if(btnAutoChars)btnAutoChars.disabled=!sub||[...(sub.text||'')].filter(c=>c.trim()).length<=1;
}

// ── Toolbar actions ──
function karaSplitAtCursor(){
  // Split selected syllable in half
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke||karaSelSyl===null)return;
  const syls=sub.karaoke.syllables,syl=syls[karaSelSyl];
  if(!syl||syl.durMs<100||syl.text.length<=1)return;
  const half=Math.floor(syl.durMs/2),halfTxt=Math.ceil(syl.text.length/2);
  syls.splice(karaSelSyl,1,{text:syl.text.slice(0,halfTxt),durMs:half},{text:syl.text.slice(halfTxt),durMs:syl.durMs-half});
  karaSelSyls=new Set([karaSelSyl]);
  buildSylStrip();reDrawKaraWave();
}
function karaJoinSel(){
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  // Multi-select join (all adjacent)
  if(karaSelSyls.size>1&&_karaSelAdjacent()){
    const sorted=[...karaSelSyls].sort((a,b)=>a-b);
    const text=sorted.map(i=>syls[i].text).join('');
    const durMs=sorted.reduce((a,i)=>a+syls[i].durMs,0);
    syls.splice(sorted[0],sorted.length,{text,durMs});
    karaSelSyl=sorted[0];karaSelSyls=new Set([sorted[0]]);
    buildSylStrip();reDrawKaraWave();updKaraSelEdit();
    return;
  }
  // Single: join with next
  if(karaSelSyl===null||karaSelSyl>=syls.length-1)return;
  const a=syls[karaSelSyl],b=syls[karaSelSyl+1];
  syls.splice(karaSelSyl,2,{text:a.text+b.text,durMs:a.durMs+b.durMs});
  karaSelSyls=new Set([karaSelSyl]);
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}
function karaDelSel(){
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke||karaSelSyl===null)return;
  const syls=sub.karaoke.syllables;if(syls.length<=1)return;
  const dur=syls[karaSelSyl].durMs;syls.splice(karaSelSyl,1);
  const ni=Math.min(karaSelSyl,syls.length-1);syls[ni].durMs+=dur;
  karaSelSyl=ni;karaSelSyls=new Set([ni]);
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}
function karaAutoSplit(){
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub)return;
  const totalMs=sub.endMs-sub.startMs;
  sub.karaoke.syllables=_splitIntoWordSyllables(sub.text,totalMs);
  karaSelSyl=null;karaSelSyls=new Set();
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();renderBlocks();renderSL();
}
function karaAutoSplitChars(){
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub)return;
  const totalMs=sub.endMs-sub.startMs;
  const raw=[...sub.text];
  const merged=[];
  raw.forEach(c=>{
    if(c===' '&&merged.length>0)merged[merged.length-1]+=c;
    else merged.push(c);
  });
  const chars=merged.filter(s=>s.trim().length>0);
  const syllables=(chars.length?chars:merged).map(c=>({text:c,durMs:Math.max(30,Math.round(totalMs/(chars.length||1)))}));
  normalizeSylDurs(syllables,totalMs);
  sub.karaoke.syllables=syllables;karaSelSyl=null;karaSelSyls=new Set();
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();renderBlocks();renderSL();
}
function karaAddSyl(){
  snapshot();
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  sub.karaoke.syllables.push({text:'?',durMs:200});
  karaSelSyl=sub.karaoke.syllables.length-1;
  karaSelSyls=new Set([karaSelSyl]);
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}
function karaUpdColor(key,val){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  sub.karaoke[key]=val;
}
function karaSetAnimation(v){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  snapshot();
  sub.karaoke.animation=v;
  ['none','ytk-fade','reveal'].forEach(key=>{
    const btn=document.getElementById('kara-anim-'+key);
    if(btn)btn.classList.toggle('active',key===v);
  });
  const speedRow=document.getElementById('kara-anim-speed-row');
  if(speedRow)speedRow.style.display=(v==='ytk-fade'||v==='reveal')?'flex':'none';
  _updKaraAnimDesc(v);
  chkYtt();
}
function _updKaraAnimDesc(v){
  const desc=document.getElementById('kara-anim-desc');if(!desc)return;
  if(v==='ytk-fade')desc.textContent='YTK Fade: color blends from pre-color → main color as karaoke reaches each syllable.';
  else if(v==='reveal')desc.textContent='Reveal: letters are invisible until karaoke reaches them, then fade in to main color.';
  else desc.textContent='None: instant color switch on each syllable.';
}
function karaSetAnimSpeed(v){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  sub.karaoke.animSpeed=Math.max(1,Math.min(8,Math.round(+v)));
  const el=document.getElementById('kara-anim-speed-val');
  if(el)el.textContent=sub.karaoke.animSpeed;
}
function karaSylUpd(key,val){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke||karaSelSyl===null)return;
  sub.karaoke.syllables[karaSelSyl][key]=key==='durMs'?Math.max(10,+val):val;
  buildSylStrip();reDrawKaraWave();
}

window.addEventListener('resize',()=>{if(karaEditId){reDrawKaraWave();buildSylStrip();}});

// ── Refresh karaoke editor after undo/redo ──
const _origApplyState=applyState;
applyState=function(stateStr){
  _origApplyState.call(this,stateStr);
  if(karaEditId){
    const sub=subs.find(s=>s.id===karaEditId);
    if(sub&&hasKaraoke(sub)){
      karaSelSyl=null;karaSelSyls=new Set();
      requestAnimationFrame(()=>{buildSylStrip();reDrawKaraWave();updKaraSelEdit();});
    } else {
      closeKaraEditor();
    }
  }
};

// ── Patch renderSL to show K badge ──
const _origRenderSL=renderSL;
renderSL=function(){
  const body=document.getElementById('sl-body');
  document.getElementById('sub-cnt').textContent=subs.length;
  const sorted=[...subs].sort((a,b)=>a.startMs-b.startMs||a.track-b.track);
  body.innerHTML='';
  sorted.forEach((s,i)=>{
    const el=mk('div','sl-item'+(s.id===selId?' selected':multi.has(s.id)?' multi-sel':''));
    el.dataset.id=s.id;
    const dot=mk('div','sl-dot');dot.style.background=s.style.textColor||'#ccc';
    const idx=mk('div','sl-idx');idx.textContent=i+1;
    const content=mk('div','sl-content');
    const ts=mk('div','sl-ts');ts.innerHTML=`${msToDisp(s.startMs)} → ${msToDisp(s.endMs)} <span style="color:var(--purple);font-size:9px">T${s.track+1}</span>`;
    const txt=mk('div','sl-txt');txt.textContent=s.text;
    content.appendChild(ts);content.appendChild(txt);
    el.appendChild(dot);el.appendChild(idx);el.appendChild(content);
    if(hasKaraoke(s)){
      const kb=document.createElement('button');
      kb.className='sl-k-btn'+(karaEditId===s.id?' active':'');
      kb.title='Edit Karaoke';kb.textContent='K';
      kb.onclick=e=>{
        e.stopPropagation();
        selId=s.id;multi.clear();
        if(karaEditId===s.id){closeKaraEditor();}else{openKaraEditor(s.id);}
      };
      el.appendChild(kb);
    }
    el.addEventListener('click',e=>{
      selSub(s.id,e.shiftKey);
      if(!e.shiftKey)seekTo(s.startMs);
    });
    if(hasMove(s)){
      const mb=document.createElement('button');
      mb.className='sl-k-btn'+(moveEditId===s.id?' active':'');
      mb.title='Edit Move';
      mb.style.cssText='color:var(--orange);border-color:var(--orange);margin-left:2px';
      mb.innerHTML='<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="5 9 2 12 5 15"/><polyline points="19 15 22 12 19 9"/></svg>';
      mb.onclick=e=>{
        e.stopPropagation();selId=s.id;multi.clear();
        if(moveEditId===s.id){closeMoveEditor();}else{openMoveEditor(s.id);}
      };
      el.appendChild(mb);
    }
    if(hasFade(s)){
      const fb=document.createElement('button');
      fb.className='sl-k-btn'+(fadeEditId===s.id?' active':'');
      fb.title='Edit Fade';
      fb.style.cssText='color:#30d158;border-color:#30d158;margin-left:2px;padding:0 3px';
      fb.innerHTML='<svg width="10" height="9" viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="28" height="5" fill="currentColor" opacity="1"/><rect x="0" y="7" width="20" height="4" fill="currentColor" opacity="0.75"/><rect x="0" y="13" width="28" height="4" fill="currentColor" opacity="0.5"/><rect x="0" y="19" width="14" height="4" fill="currentColor" opacity="0.25"/></svg>';
      fb.onclick=e=>{e.stopPropagation();selId=s.id;multi.clear();if(fadeEditId===s.id){closeFadeEditor();}else{openFadeEditor(s.id);}};
      el.appendChild(fb);
    }
    if(hasMirror(s)){
      const xb=document.createElement('button');
      xb.className='sl-k-btn'+(mirrorEditId===s.id?' active':'');
      xb.title='Edit Mirror';
      xb.style.cssText='color:var(--purple);border-color:var(--purple);margin-left:2px;padding:0 3px';
      xb.innerHTML='<svg width="14" height="10" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="0" x2="10" y2="16" stroke="currentColor" stroke-width="2" stroke-dasharray="2 1.5"/><rect x="1" y="3" width="7" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none"/><rect x="12" y="3" width="7" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"/></svg>';
      xb.onclick=e=>{
        e.stopPropagation();selId=s.id;multi.clear();
        if(mirrorEditId===s.id){closeMirrorEditor();}else{openMirrorEditor(s.id);}
      };
      el.appendChild(xb);
    }
    body.appendChild(el);
  });
};

// ── Patch renderBlocks: K badge bottom-right, hollow unless actively editing ──
const _origRenderBlocks=renderBlocks;
renderBlocks=function(){
  document.querySelectorAll('.tl-track-row.sub-track').forEach(r=>r.querySelectorAll('.sub-block').forEach(b=>b.remove()));
  subs.forEach(sub=>{
    const row=document.getElementById(`tr-${sub.track}`);if(!row)return;
    const x=ms2x(sub.startMs),w=Math.max(((sub.endMs-sub.startMs)/1000)*pxS,16);
    const el=mk('div','sub-block'+(sub.id===selId?' selected':multi.has(sub.id)?' multi-sel':''));
    el.dataset.id=sub.id;el.style.cssText=`left:${x}px;width:${w}px;border-left-color:${sub.style.textColor||'var(--blue)'}`;
    el.title=sub.text;
    const _dispTxt=_getDisplayText(sub);
    el.innerHTML=`<div class="sub-block-icon" style="color:${sub.style.textColor||'#ccc'}">T</div><div class="sub-block-text" style="font-weight:${sub.style.bold?700:400};font-style:${sub.style.italic?'italic':'normal'}">${escH(_dispTxt)}</div>`;
    const badgeRow=document.createElement('div');
    badgeRow.className='blk-badge-row';
    if(hasKaraoke(sub)){
      const kb=document.createElement('span');
      kb.className='blk-k'+(karaEditId===sub.id?' active':'');
      kb.textContent='K';kb.title='Karaoke — click to edit';
      kb.addEventListener('mousedown',e=>{e.stopPropagation();});
      kb.addEventListener('click',e=>{
        e.stopPropagation();
        selId=sub.id;multi.clear();
        if(karaEditId===sub.id){closeKaraEditor();}else{openKaraEditor(sub.id);}
      });
      badgeRow.appendChild(kb);
    }
    if(hasMove(sub)){
      const mb=document.createElement('span');
      mb.className='blk-m'+(moveEditId===sub.id?' active':'');
      mb.title='Move — click to edit';
      mb.innerHTML='<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="5 9 2 12 5 15"/><polyline points="19 15 22 12 19 9"/></svg>';
      mb.addEventListener('mousedown',e=>{e.stopPropagation();});
      mb.addEventListener('click',e=>{
        e.stopPropagation();selId=sub.id;multi.clear();
        if(moveEditId===sub.id){closeMoveEditor();}else{openMoveEditor(sub.id);}
      });
      badgeRow.appendChild(mb);
    }
    if(hasMirror(sub)){
      const xb=document.createElement('span');
      xb.className='blk-mir'+(mirrorEditId===sub.id?' active':'');
      xb.title='Mirror — click to edit';
      xb.innerHTML='<svg width="14" height="10" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="0" x2="10" y2="16" stroke="currentColor" stroke-width="2" stroke-dasharray="2 1.5"/><rect x="1" y="3" width="7" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none"/><rect x="12" y="3" width="7" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"/></svg>';
      xb.addEventListener('mousedown',e=>{e.stopPropagation();});
      xb.addEventListener('click',e=>{
        e.stopPropagation();selId=sub.id;multi.clear();
        if(mirrorEditId===sub.id){closeMirrorEditor();}else{openMirrorEditor(sub.id);}
      });
      badgeRow.appendChild(xb);
    }
    if(hasFade(sub)){
      const fb=document.createElement('span');
      fb.className='blk-fad'+(fadeEditId===sub.id?' active':'');
      fb.title='Fade — click to edit';
      fb.innerHTML='<svg width="10" height="9" viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="28" height="5" fill="currentColor" opacity="1"/><rect x="0" y="7" width="20" height="4" fill="currentColor" opacity="0.75"/><rect x="0" y="13" width="28" height="4" fill="currentColor" opacity="0.5"/><rect x="0" y="19" width="14" height="4" fill="currentColor" opacity="0.25"/></svg>';
      fb.addEventListener('mousedown',e=>{e.stopPropagation();});
      fb.addEventListener('click',e=>{
        e.stopPropagation();selId=sub.id;multi.clear();
        if(fadeEditId===sub.id){closeFadeEditor();}else{openFadeEditor(sub.id);}
      });
      badgeRow.appendChild(fb);
    }
    if(hasReverse(sub)){
      const rv=document.createElement('span');
      rv.className='blk-rev'+(reverseEditId===sub.id?' active':'');
      rv.title='Reverse — click to edit';
      rv.innerHTML='↩';
      rv.addEventListener('mousedown',e=>{e.stopPropagation();});
      rv.addEventListener('click',e=>{
        e.stopPropagation();selId=sub.id;multi.clear();
        if(reverseEditId===sub.id){closeReverseEditor();}else{openReverseEditor(sub.id);}
      });
      badgeRow.appendChild(rv);
    }
    if(badgeRow.children.length)el.appendChild(badgeRow);
    if(sub._compound&&sub._compound.length){
      const cb=document.createElement('span');
      cb.className='blk-compound'+(sub.id===selId?' active':'');
      cb.title=`Compound (${sub._compound.length} blocks) — right-click to de-merge`;
      cb.innerHTML='⊞';
      cb.addEventListener('mousedown',e=>{e.stopPropagation();});
      cb.addEventListener('click',e=>{e.stopPropagation();showBlockCtxMenu(e,sub.id);});
      el.appendChild(cb);
      el.classList.add('compound');
    }
    const lh=mk('div','rh l');lh.addEventListener('mousedown',e=>startRes(e,sub.id,'l'));
    const rh=mk('div','rh r');rh.addEventListener('mousedown',e=>startRes(e,sub.id,'r'));
    el.prepend(lh);el.appendChild(rh);
    el.addEventListener('mousedown',e=>{
      if(e.target.classList.contains('rh')||e.target.classList.contains('blk-k')||e.target.classList.contains('blk-m')||e.target.classList.contains('blk-mir'))return;
      e.preventDefault();blockMouseDown(e,sub.id);
    });
    row.appendChild(el);
  });
};




function uid(){return Math.random().toString(36).slice(2,10);}
