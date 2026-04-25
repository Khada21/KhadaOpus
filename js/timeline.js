function renderTL(){
  const sc=document.getElementById('tl-scroll');
  const tot=Math.max(dur,60000);
  const minW=sc?sc.clientWidth:800;
  const px=Math.max((tot/1000)*pxS,minW);
  document.getElementById('tl-canvas').style.width=px+'px';
  renderRuler(tot);renderBlocks();
}
function renderRuler(tot){
  const r=document.getElementById('tl-ruler');r.innerHTML='';
  // Pick a step that keeps labels at least ~60px apart
  const minGap=60;
  const candidates=[1,2,5,10,15,30,60,120,300,600];
  const step=candidates.find(s=>s*pxS>=minGap)||600;
  const tsec=Math.ceil(tot/1000);
  for(let s=0;s<=tsec;s+=step){
    const e=mk('div','tl-rm');e.style.left=(s*pxS)+'px';
    e.innerHTML=`<div class="tick-maj"></div><div class="ts-lbl">${secHMS(s)}</div>`;
    r.appendChild(e);
  }
  if(step>1){
    const sub=step/4;
    for(let s=sub;s<=tsec;s+=sub){
      if(Math.round(s*1000)%Math.round(step*1000)<1)continue;
      const e=mk('div','tl-rm');e.style.left=(s*pxS)+'px';
      e.innerHTML='<div class="tick-min"></div>';
      r.appendChild(e);
    }
  }
}
function renderBlocks(){
  document.querySelectorAll('.tl-track-row.sub-track').forEach(r=>r.querySelectorAll('.sub-block').forEach(b=>b.remove()));
  subs.forEach(sub=>{
    const row=document.getElementById(`tr-${sub.track}`);if(!row)return;
    const x=ms2x(sub.startMs),w=Math.max(((sub.endMs-sub.startMs)/1000)*pxS,16);
    const el=mk('div','sub-block'+(sub.id===selId?' selected':multi.has(sub.id)?' multi-sel':''));
    el.dataset.id=sub.id;el.style.cssText=`left:${x}px;width:${w}px;border-left-color:${sub.style.textColor||'var(--blue)'}`;
    el.title=sub.text;
    const _dt=_getDisplayText(sub);
    el.innerHTML=`<div class="sub-block-icon" style="color:${sub.style.textColor||'#ccc'}">T</div><div class="sub-block-text" style="font-weight:${sub.style.bold?700:400};font-style:${sub.style.italic?'italic':'normal'}">${escH(_dt)}</div>`;
    const lh=mk('div','rh l');lh.addEventListener('mousedown',e=>startRes(e,sub.id,'l'));
    const rh=mk('div','rh r');rh.addEventListener('mousedown',e=>startRes(e,sub.id,'r'));
    el.prepend(lh);el.appendChild(rh);
    // Use mousedown for both drag start AND selection — distinguish by movement in endDrag
    el.addEventListener('mousedown',e=>{
      if(e.target.classList.contains('rh'))return;
      e.preventDefault();
      blockMouseDown(e,sub.id);
    });
    row.appendChild(el);
  });
  // Rebuild block map for hlActive fast path
  if(window._rebuildBlockMap)window._rebuildBlockMap();
}

// ═══════════════ DRAG ════════════════
let dragGhost=null;
function blockMouseDown(e,id){
  const s=subs.find(x=>x.id===id);if(!s)return;
  // Immediately select on mousedown so inspector shows instantly
  if(!e.shiftKey){multi.clear();selId=id;}
  else{multi.has(id)?multi.delete(id):multi.add(id);selId=id;}
  renderBlocks();renderSL();updInsp();
  // Snapshot BEFORE drag starts so we can restore pre-drag state
  snapshot();
  drag={type:'move',id,sx:e.clientX,oS:s.startMs,oE:s.endMs,oT:s.track,moved:false,curTrack:s.track};
  document.body.style.cursor='grabbing';
  document.addEventListener('mousemove',onDrag);
  document.addEventListener('mouseup',endDrag);
}
function startRes(e,id,side){
  e.preventDefault();e.stopPropagation();
  const s=subs.find(x=>x.id===id);if(!s)return;
  // Snapshot BEFORE resize starts
  snapshot();
  drag={type:'res',id,side,sx:e.clientX,oS:s.startMs,oE:s.endMs};
  document.body.style.cursor='ew-resize';
  document.addEventListener('mousemove',onDrag);
  document.addEventListener('mouseup',endDrag);
}
function onDrag(e){
  if(!drag)return;
  const dx=e.clientX-drag.sx,dms=(dx/pxS)*1000;
  const s=subs.find(x=>x.id===drag.id);if(!s)return;
  if(drag.type==='move'){
    drag.moved=true;
    let newStart=Math.max(0,drag.oS+dms);
    let dur2=drag.oE-drag.oS;
    // Snap/magnet applies to whichever edge is closest to a snap point
    const snappedStart=applySnapMagnet(newStart,s.id,'start');
    const snappedEnd=applySnapMagnet(newStart+dur2,s.id,'end');
    // Use whichever correction is larger
    if(Math.abs(snappedStart-newStart)<=Math.abs(snappedEnd-(newStart+dur2))){
      newStart=snappedStart;
    } else {
      newStart=snappedEnd-dur2;
    }
    newStart=Math.max(0,newStart);
    const deltaMs=newStart-s.startMs;
    s.startMs=newStart;
    s.endMs=newStart+dur2;
    // If compound block, shift all child timings by the same delta
    if(s._compound&&s._compound.length){
      s._compound.forEach(child=>{
        child.startMs+=deltaMs;
        child.endMs+=deltaMs;
      });
    }
    // Auto-assign track
    const best=autoAssignTrack(s);
    if(best!==s.track){
      s.track=best;
      ensureTrack(best);
      syncTracks();rebuildSidebar();renderTL();
    }
  }else{
    const prevStart=s.startMs, prevEnd=s.endMs;
    if(drag.side==='l'){
      let ns=Math.max(0,drag.oS+dms);
      ns=applySnapMagnet(ns,s.id,'start');
      s.startMs=Math.min(ns,s.endMs-200);
    } else {
      let ne=Math.max(s.startMs+200,drag.oE+dms);
      ne=applySnapMagnet(ne,s.id,'end');
      s.endMs=ne;
    }
    // If compound block, rescale all child timings proportionally
    if(s._compound&&s._compound.length){
      const origDur=drag.oE-drag.oS; // original total duration
      const newDur=s.endMs-s.startMs;
      const origStart=drag.oS;
      s._compound.forEach(child=>{
        const relStart=child.startMs-origStart;
        const relEnd=child.endMs-origStart;
        child.startMs=Math.round(s.startMs+(relStart/origDur)*newDur);
        child.endMs=Math.round(s.startMs+(relEnd/origDur)*newDur);
      });
    }
    const best=autoAssignTrack(s);
    if(best!==s.track){
      s.track=best;
      ensureTrack(best);
      syncTracks();rebuildSidebar();renderTL();
    }
  }
  renderBlocks();if(s.id===selId)updInsp();chkYtt();
}
function endDrag(){
  document.body.style.cursor='';
  // If nothing actually moved, pop the pre-drag snapshot we took (no-op drag)
  if(drag&&!drag.moved&&undoStack.length){undoStack.pop();updUndoRedoBtns();}
  if(drag){collapseEmpty();}
  setTimeout(()=>drag=null,10);
  document.removeEventListener('mousemove',onDrag);
  document.removeEventListener('mouseup',endDrag);
  renderSL();
}

// ═══════════════ SELECTION ════════════════
function selSub(id,shift){
  if(shift){multi.has(id)?multi.delete(id):multi.add(id);selId=id;}
  else{multi.clear();selId=id;}
  renderBlocks();renderSL();updInsp();
}

// ═══════════════ INSPECTOR ════════════════
function updInsp(){
  const sub=subs.find(s=>s.id===selId);
  const isM=multi.size>1;
  document.getElementById('insp-empty').style.display=sub?'none':'flex';
  document.getElementById('insp-fields').style.display=sub?'block':'none';
  document.getElementById('multi-badge').style.display=isM?'block':'none';
  document.getElementById('apply-multi-btn').style.display=isM?'block':'none';
  document.getElementById('timing-sec').style.display=isM?'none':'block';
  document.getElementById('tf').style.display=isM?'none':'block';
  if(isM)document.getElementById('multi-cnt').textContent=multi.size;
  if(!sub)return;
  const st=sub.style;
  document.getElementById('sub-text').value=sub.text;
  document.getElementById('sub-start').value=msToDisp(sub.startMs);
  document.getElementById('sub-end').value=msToDisp(sub.endMs);
  document.getElementById('btn-b').classList.toggle('on',st.bold);
  document.getElementById('btn-i').classList.toggle('on',st.italic);
  document.getElementById('btn-u').classList.toggle('on',st.underline);
  document.getElementById('font-sel').value=st.font;
  document.getElementById('fsize-sl').value=st.fontSize;
  document.getElementById('fsize-v').textContent=st.fontSize+'%';
  document.getElementById('c-text').value=st.textColor;
  document.getElementById('c-text-a').value=st.textAlpha;
  document.getElementById('c-bg').value=st.bgColor;
  document.getElementById('c-bg-a').value=st.bgAlpha;
  document.querySelectorAll('.pos-btn').forEach(b=>b.classList.toggle('on',+b.dataset.p===st.position));
  document.getElementById('c-outline').value=st.outlineColor||'#000000';
  document.getElementById('c-outline-a').value=st.outlineAlpha!==undefined?st.outlineAlpha:0;
  const _osz=st.outlineSize!==undefined?st.outlineSize:3;
  document.getElementById('outline-size-sl').value=_osz;
  document.getElementById('outline-size-v').textContent=_osz;
  if(typeof _updKfDotBtns==='function')_updKfDotBtns(sub);
  if(!isM){
    const d=sub.endMs-sub.startMs,w=sub.text.trim().split(/\s+/).filter(Boolean).length,wps=w/(d/1000);
    document.getElementById('s-dur').textContent=(d/1000).toFixed(2)+'s';
    document.getElementById('s-words').textContent=w;
    const we=document.getElementById('s-wps');we.textContent=wps.toFixed(1)+' w/s '+(wps>3?'⚠ fast':'✓ ok');we.className='stat-val '+(wps>3?'warn':'ok');
    document.getElementById('s-track').textContent=`Track ${sub.track+1}`;
  }
}

// ═══════════════ STYLE UPDATES ════════════════
function togSty(p){const s=subs.find(x=>x.id===selId);if(!s)return;snapshot();s.style[p]=!s.style[p];renderBlocks();updInsp();chkYtt();}
function updSty(p,v){
  const s=subs.find(x=>x.id===selId);if(!s)return;
  snapshot();
  if(['bold','italic','underline','shadowGlow','shadowBevel','shadowSoft','shadowHard'].includes(p))s.style[p]=!!v;
  else if(['textAlpha','bgAlpha','fontSize','outlineAlpha','outlineSize'].includes(p))s.style[p]=Number(v);
  else s.style[p]=v;
  // Auto-enable glow outline type when alpha is turned on
  if(p==='outlineAlpha'&&Number(v)>0&&!s.style.outlineType)s.style.outlineType=3;
  renderBlocks();updInsp();chkYtt();
}
function setPos(p){const s=subs.find(x=>x.id===selId);if(!s)return;snapshot();s.style.position=p;s.style.customX=null;s.style.customY=null;renderBlocks();updInsp();chkYtt();}
function updateText(){const s=subs.find(x=>x.id===selId);if(!s)return;s.text=document.getElementById('sub-text').value;renderBlocks();renderSL();}
function applyToMulti(){
  const src=subs.find(s=>s.id===selId);if(!src)return;
  snapshot();
  multi.forEach(id=>{const s=subs.find(x=>x.id===id);if(s)s.style={...src.style};});
  renderBlocks();renderSL();chkYtt();
}

// ═══════════════ TIMING ════════════════
function updTiming(){
  const s=subs.find(x=>x.id===selId);if(!s)return;
  snapshot();
  s.startMs=dispToMs(document.getElementById('sub-start').value);
  s.endMs=dispToMs(document.getElementById('sub-end').value);
  renderBlocks();renderSL();updInsp();
}
function setIn(){
  const s=subs.find(x=>x.id===selId);if(!s)return;
  snapshot();
  s.startMs=Math.round(curMs);renderBlocks();renderSL();updInsp();
}
function setOut(){
  const s=subs.find(x=>x.id===selId);if(!s)return;
  snapshot();
  s.endMs=Math.round(curMs);renderBlocks();renderSL();updInsp();
}
function deleteSel(){
  snapshot();
  subs=subs.filter(s=>s.id!==selId&&!multi.has(s.id));
  selId=null;multi.clear();collapseEmpty();renderBlocks();renderSL();updInsp();chkYtt();
}

// ═══════════════ RULER SCRUB ════════════════
let scrubbing=false;
function getRulerMs(e){
  const sc=document.getElementById('tl-scroll');
  const scRect=sc.getBoundingClientRect();
  const x=Math.max(0,e.clientX-scRect.left+sc.scrollLeft);
  return Math.max(0,Math.min(dur,x2ms(x)));
}
function seekTo(ms){
  curMs=Math.max(0,Math.min(dur,ms));
  _justSeeked=true;
  if(player&&player.seekTo) player.seekTo(curMs/1000);
}
function rulerDown(e){
  e.preventDefault();
  scrubbing=true;
  document.body.style.cursor='col-resize';
  seekTo(getRulerMs(e));
  document.addEventListener('mousemove',rulerMove);
  document.addEventListener('mouseup',rulerUp);
}
function rulerMove(e){
  if(!scrubbing)return;
  seekTo(getRulerMs(e));
}
function rulerUp(){
  scrubbing=false;
  document.body.style.cursor='';
  document.removeEventListener('mousemove',rulerMove);
  document.removeEventListener('mouseup',rulerUp);
}

// ═══════════════ SUB LIST ════════════════
function renderSL(){
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
    el.addEventListener('click',e=>{
      selSub(s.id,e.shiftKey);
      if(!e.shiftKey)seekTo(s.startMs);
    });
    body.appendChild(el);
  });
}

// ═══════════════ ADD ════════════════
function addSubtitle(){
  snapshot();
  const newSub=mkSub(Math.round(curMs),Math.round(curMs)+3000,'New subtitle',0,{});
  newSub.track=autoAssignTrack(newSub);
  subs.push(newSub);
  syncTracks();rebuildSidebar();renderTL();renderSL();selSub(newSub.id);
}

// ═══════════════ YTT CHECK ════════════════
function chkYtt(){
  const has=subs.some(s=>{const st=s.style;return st.bold||st.italic||st.underline||st.textColor!=='#ffffff'||st.bgColor!=='#000000'||st.bgAlpha!==60||st.textAlpha!==100||st.font!=='Roboto'||st.fontSize!==100||(st.position&&st.position!==2)||st.shadowGlow||st.shadowBevel||st.shadowSoft||st.shadowHard||st.outlineType>0||st.outlineAlpha>0||s.track>0||(s.styleKfs&&s.styleKfs.frames&&s.styleKfs.frames.length>0);});
  document.getElementById('ytt-banner').classList.toggle('visible',has);
}

// ═══════════════ ZOOM / VOL ════════════════
function fitPxS(){
  const sc=document.getElementById('tl-scroll');
  if(!sc)return 8;
  const w=sc.clientWidth||800;
  return w/(Math.max(dur,60000)/1000);
}
function zoomIn(){pxS=Math.min(pxS*1.5,400);syncZ();renderTL();_refreshWave();}
function zoomOut(){pxS=Math.max(pxS/1.5,fitPxS());syncZ();renderTL();_refreshWave();}
function handleZoom(v){
  const minPx=fitPxS();
  pxS=minPx*Math.pow(400/minPx,v/100);
  document.getElementById('zoom-sl').style.setProperty('--pct',v+'%');
  renderTL();
  _refreshWave();
}
function syncZ(){
  const minPx=fitPxS();
  const t=Math.log(pxS/minPx)/Math.log(400/minPx);
  const v=Math.round(Math.max(0,Math.min(100,t*100)));
  const sl=document.getElementById('zoom-sl');if(sl){sl.value=v;sl.style.setProperty('--pct',v+'%');}
}
function handleVol(v){if(player&&player.setVolume)player.setVolume(+v);document.getElementById('vol-sl').style.setProperty('--pct',v+'%');}
function adjVol(d){const sl=document.getElementById('vol-sl');if(!sl)return;const v=Math.max(0,Math.min(100,+sl.value+d));sl.value=v;handleVol(v);}

// ═══════════════ KEYBIND SYSTEM ════════════════