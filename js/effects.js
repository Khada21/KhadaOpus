(function(){
  const rect=document.getElementById('box-sel-rect');
  let active=false,startX=0,startY=0;

  function init(){
    const scroll=document.getElementById('tl-scroll');
    if(!scroll)return;

    scroll.addEventListener('mousedown',function(e){
      // Only trigger on left click directly on tl-scroll or tl-canvas / track rows
      // — not on subtitle blocks, resize handles, ruler, or scrollbar
      const tag=e.target.tagName.toLowerCase();
      const cl=e.target.classList;
      if(e.button!==0)return;
      if(cl.contains('sub-block')||cl.contains('rh')||cl.contains('blk-k'))return;
      if(e.target.closest('.sub-block'))return;
      if(cl.contains('tl-ruler')||e.target.closest('.tl-ruler'))return;
      if(e.shiftKey)return; // let shift+click work normally

      e.preventDefault();
      active=true;
      startX=e.clientX;
      startY=e.clientY;

      rect.style.display='block';
      rect.style.left=startX+'px';
      rect.style.top=startY+'px';
      rect.style.width='0px';
      rect.style.height='0px';

      scroll.classList.add('box-selecting');

      // Clear selection on fresh drag (not shift)
      multi.clear();
      selId=null;
      renderBlocks();renderSL();updInsp();

      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  }

  function onMove(e){
    if(!active)return;
    const x1=Math.min(e.clientX,startX),y1=Math.min(e.clientY,startY);
    const x2=Math.max(e.clientX,startX),y2=Math.max(e.clientY,startY);
    rect.style.left=x1+'px';
    rect.style.top=y1+'px';
    rect.style.width=(x2-x1)+'px';
    rect.style.height=(y2-y1)+'px';
  }

  function onUp(e){
    if(!active)return;
    active=false;
    rect.style.display='none';
    document.getElementById('tl-scroll').classList.remove('box-selecting');
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);

    // Get the final box in viewport coords
    const bx1=Math.min(e.clientX,startX),by1=Math.min(e.clientY,startY);
    const bx2=Math.max(e.clientX,startX),by2=Math.max(e.clientY,startY);

    // Ignore tiny drags (accidental clicks)
    if(bx2-bx1<4&&by2-by1<4)return;

    // Hit-test every rendered block element
    let hit=false;
    document.querySelectorAll('.sub-block').forEach(el=>{
      const r=el.getBoundingClientRect();
      // Check overlap
      if(r.right>=bx1&&r.left<=bx2&&r.bottom>=by1&&r.top<=by2){
        const id=el.dataset.id;
        if(id){multi.add(id);if(!selId)selId=id;hit=true;}
      }
    });

    if(hit){renderBlocks();renderSL();updInsp();}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  } else {
    init();
  }
})();

// ═══════════════ MIRROR EFFECT ════════════════
let mirrorEditId=null;

function hasMirror(sub){return !!(sub&&sub.mirror);}

function applyMirrorToSub(sub){
  if(hasMirror(sub))return;
  sub.mirror={axis:'x',opacity:40,offsetX:0,offsetY:0};
  renderBlocks();renderSL();chkYtt();
}

function removeMirrorFromSub(sub){
  if(!sub)return;
  snapshot();
  delete sub.mirror;
  renderBlocks();renderSL();chkYtt();
  closeMirrorEditor();
}

function openMirrorEditor(id){
  let panelH=300;
  const insp=document.getElementById('inspector');
  const karaEd=document.getElementById('kara-editor');
  const moveEd=document.getElementById('move-editor');
  const mirEd=document.getElementById('mirror-editor');
  if(karaEditId){if(karaEd&&karaEd.offsetHeight>0)panelH=karaEd.offsetHeight;closeKaraEditor();}
  else if(moveEditId){if(moveEd&&moveEd.offsetHeight>0)panelH=moveEd.offsetHeight;closeMoveEditor();}
  else if(mirrorEditId&&mirrorEditId!==id){if(mirEd&&mirEd.offsetHeight>0)panelH=mirEd.offsetHeight;closeMirrorEditor();}
  else{if(insp&&insp.offsetHeight>0)panelH=insp.offsetHeight;}

  mirrorEditId=id;
  insp.style.display='none';
  karaEd&&(karaEd.style.display='none');
  moveEd&&(moveEd.style.display='none');
  mirEd.style.display='flex';
  mirEd.style.flex='none';
  mirEd.style.height=Math.max(220,panelH)+'px';

  // Sync UI to current mirror settings
  const sub=subs.find(s=>s.id===id);
  if(sub&&sub.mirror){
    const m=sub.mirror;
    document.getElementById('mir-opacity').value=m.opacity??40;
    document.getElementById('mir-opacity-v').textContent=(m.opacity??40)+'%';
    document.getElementById('mir-ox').value=m.offsetX??0;
    document.getElementById('mir-ox-v').textContent=(m.offsetX??0)+'%';
    document.getElementById('mir-oy').value=m.offsetY??0;
    document.getElementById('mir-oy-v').textContent=(m.offsetY??0)+'%';
    document.querySelectorAll('.mir-axis-btn').forEach(b=>{
      b.classList.toggle('active',b.dataset.axis===m.axis);
    });
  }
  renderBlocks();renderSL();
}

function closeMirrorEditor(){
  const mirEd=document.getElementById('mirror-editor');
  const insp=document.getElementById('inspector');
  const h=mirEd?mirEd.offsetHeight:0;
  mirrorEditId=null;
  if(mirEd)mirEd.style.display='none';
  insp.style.display='flex';
  insp.style.flex='none';
  if(h>0)insp.style.height=h+'px';
  renderBlocks();renderSL();
}

function mirSetAxis(btn,axis){
  const sub=subs.find(s=>s.id===mirrorEditId);if(!sub||!sub.mirror)return;
  sub.mirror.axis=axis;
  document.querySelectorAll('.mir-axis-btn').forEach(b=>b.classList.toggle('active',b.dataset.axis===axis));
}

function mirSetOpacity(v){
  const sub=subs.find(s=>s.id===mirrorEditId);if(!sub||!sub.mirror)return;
  sub.mirror.opacity=v;
}

function mirSetOffset(axis,v){
  const sub=subs.find(s=>s.id===mirrorEditId);if(!sub||!sub.mirror)return;
  if(axis==='x')sub.mirror.offsetX=v;else sub.mirror.offsetY=v;
}

// ── Mirror DnD ──
(function initMirrorDnd(){
  function setup(){
    const card=document.getElementById('fx-mirror-card');
    if(!card)return;
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','mirror-effect');e.dataTransfer.effectAllowed='copy';});
    document.addEventListener('drop',e=>{
      if(e.dataTransfer.getData('text/plain')!=='mirror-effect')return;
      const block=e.target.closest('.sub-block');if(!block)return;
      e.preventDefault();
      const sub=subs.find(s=>s.id===block.dataset.id);if(!sub)return;
      snapshot();
      selId=sub.id;multi.clear();
      if(!hasMirror(sub))applyMirrorToSub(sub);
      openMirrorEditor(sub.id);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

// ── Mirror preview: render ghost overlay ──
// Called from _updOvFast after main overlay is rendered
function _renderMirrorOverlay(s,vwrap){
  if(!hasMirror(s))return;
  const m=s.mirror;
  const st=s.style;
  const axis=m.axis||'x';
  const ox=m.offsetX||0, oy=m.offsetY||0;

  // ── Compute mirrored position ──
  // Get original position as percentages (left%, top% from top-left corner)
  let origX, origY; // percent from top-left, representing center of subtitle
  if(st.customX!=null&&st.customY!=null){
    origX=st.customX; origY=st.customY;
  } else if(s.move&&s.move.keyframes&&s.move.keyframes.length>=2){
    // If subtitle has move effect, use start keyframe position for the ghost
    const kf=s.move.keyframes[0];
    origX=kf.x; origY=kf.y;
  } else {
    // Map preset position (1-9) to percentages
    const posMap={1:[5,92],2:[50,92],3:[95,92],4:[5,50],5:[50,50],6:[95,50],7:[5,8],8:[50,8],9:[95,8]};
    const [px,py]=posMap[st.position||2]||[50,92];
    origX=px; origY=py;
  }

  // Mirror the position across the axis
  let ghostX=origX, ghostY=origY;
  if(axis==='x'||axis==='xy') ghostX=100-origX+ox;
  else ghostX=origX+ox;
  if(axis==='y'||axis==='xy') ghostY=100-origY+oy;
  else ghostY=origY+oy;
  ghostX=Math.max(0,Math.min(100,ghostX));
  ghostY=Math.max(0,Math.min(100,ghostY));

  const opacityFrac=(m.opacity||40)/100;
  const ghostTextAlpha=Math.round((st.textAlpha||100)*opacityFrac);
  const ghostBgAlpha=Math.round((st.bgAlpha||60)*opacityFrac);

  const ghost=document.createElement('div');
  ghost.className='sub-overlay sub-mirror-ghost';
  ghost.dataset.mirrorFor=s.id;
  ghost.style.cssText=
    `position:absolute;pointer-events:none;border-radius:2px;padding:5px 14px;`+
    `max-width:82%;text-align:center;white-space:pre-wrap;z-index:19;`+
    `font-weight:${st.bold?700:400};font-style:${st.italic?'italic':'normal'};`+
    `text-decoration:${st.underline?'underline':'none'};`+
    `background:${ha(st.bgColor,ghostBgAlpha)};`+
    `font-family:'${st.font}',sans-serif;font-size:${16*(st.fontSize/100)}px;`+
    `left:${ghostX}%;top:${ghostY}%;transform:translate(-50%,-50%)`;

  // ── Render content with full effects (karaoke coloring etc.) ──
  if(hasKaraoke(s)){
    const kd=s.karaoke,syls=kd.syllables;
    const elapsed=curMs-s.startMs;
    const mainColor=ha(st.textColor,ghostTextAlpha);
    const preColor=ha(kd.preColor||'#5046EC',Math.round((kd.preAlpha??100)*opacityFrac));
    let cumMs=0,asi=-1;
    for(let i=0;i<syls.length;i++){if(elapsed>=cumMs&&elapsed<cumMs+syls[i].durMs){asi=i;break;}cumMs+=syls[i].durMs;}
    if(asi===-1&&elapsed>=cumMs)asi=syls.length;
    let html='';
    syls.forEach((syl,i)=>{html+=`<span style="color:${i<=asi?preColor:mainColor}">${escH(syl.text)}</span>`;});
    ghost.innerHTML=html;
  } else {
    ghost.style.color=ha(st.textColor,ghostTextAlpha);
    ghost.textContent=s.text;
  }

  // ── If original has move effect, also animate the ghost along mirrored path ──
  if(s.move&&s.move.keyframes&&s.move.keyframes.length>=2){
    const subDur=s.endMs-s.startMs;
    const elapsed=Math.max(0,Math.min(subDur,curMs-s.startMs));
    const tG=subDur>0?elapsed/subDur:0;
    const kfs=(s.reverse&&s.reverse.motion)?[...s.move.keyframes].reverse():s.move.keyframes;
    const segCount=kfs.length-1;
    const segT=tG*segCount;
    const segIdx=Math.min(Math.floor(segT),segCount-1);
    const a=kfs[segIdx],b=kfs[segIdx+1];
    const et=mvEaseT(segT-segIdx,a.accel||0,a.decel||0,a.ease);
    const mx=mvBezierPoint(a.x,a.cp1x,b.cp2x,b.x,et);
    const my=mvBezierPoint(a.y,a.cp1y,b.cp2y,b.y,et);
    // Mirror the animated position
    let gmx=mx,gmy=my;
    if(axis==='x'||axis==='xy') gmx=100-mx+ox; else gmx=mx+ox;
    if(axis==='y'||axis==='xy') gmy=100-my+oy; else gmy=my+oy;
    ghost.style.left=Math.max(0,Math.min(100,gmx)).toFixed(2)+'%';
    ghost.style.top=Math.max(0,Math.min(100,gmy)).toFixed(2)+'%';
  }

  vwrap.appendChild(ghost);
}

// ═══════════════ FADE EFFECT ════════════════
let fadeEditId=null;

function hasFade(sub){return !!(sub&&sub.fade&&(sub.fade.inMs>0||sub.fade.outMs>0));}

function applyFadeToSub(sub){
  if(sub.fade)return;
  sub.fade={inMs:167,outMs:133};
  renderBlocks();renderSL();chkYtt();
}

function removeFadeFromSub(sub){
  if(!sub)return;
  snapshot();
  delete sub.fade;
  renderBlocks();renderSL();chkYtt();
  closeFadeEditor();
}

function openFadeEditor(id){
  let panelH=300;
  const insp=document.getElementById('inspector');
  const karaEd=document.getElementById('kara-editor');
  const moveEd=document.getElementById('move-editor');
  const mirEd=document.getElementById('mirror-editor');
  const fadEd=document.getElementById('fade-editor');
  if(karaEditId){if(karaEd&&karaEd.offsetHeight>0)panelH=karaEd.offsetHeight;closeKaraEditor();}
  else if(moveEditId){if(moveEd&&moveEd.offsetHeight>0)panelH=moveEd.offsetHeight;closeMoveEditor();}
  else if(mirrorEditId){if(mirEd&&mirEd.offsetHeight>0)panelH=mirEd.offsetHeight;closeMirrorEditor();}
  else if(fadeEditId&&fadeEditId!==id){if(fadEd&&fadEd.offsetHeight>0)panelH=fadEd.offsetHeight;closeFadeEditor();}
  else{if(insp&&insp.offsetHeight>0)panelH=insp.offsetHeight;}

  fadeEditId=id;
  insp.style.display='none';
  karaEd&&(karaEd.style.display='none');
  moveEd&&(moveEd.style.display='none');
  mirEd&&(mirEd.style.display='none');
  fadEd.style.display='flex';fadEd.style.flex='none';fadEd.style.height=Math.max(200,panelH)+'px';

  const sub=subs.find(s=>s.id===id);
  if(sub&&sub.fade){
    const f=sub.fade;
    document.getElementById('fade-in-sl').value=Math.min(2000,f.inMs||0);
    document.getElementById('fade-in-v').value=f.inMs||0;
    document.getElementById('fade-out-sl').value=Math.min(2000,f.outMs||0);
    document.getElementById('fade-out-v').value=f.outMs||0;
  }
  renderBlocks();renderSL();
}

function closeFadeEditor(){
  const fadEd=document.getElementById('fade-editor');
  const insp=document.getElementById('inspector');
  const h=fadEd?fadEd.offsetHeight:0;
  fadeEditId=null;
  if(fadEd)fadEd.style.display='none';
  insp.style.display='flex';insp.style.flex='none';
  if(h>0)insp.style.height=h+'px';
  renderBlocks();renderSL();
}

function fadeSetIn(v){
  const sub=subs.find(s=>s.id===fadeEditId);if(!sub||!sub.fade)return;
  sub.fade.inMs=Math.max(0,v);chkYtt();
}

function fadeSetOut(v){
  const sub=subs.find(s=>s.id===fadeEditId);if(!sub||!sub.fade)return;
  sub.fade.outMs=Math.max(0,v);chkYtt();
}

// ── Fade DnD ──
(function initFadeDnd(){
  function setup(){
    const card=document.getElementById('fx-fade-card');
    if(!card)return;
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','fade-effect');e.dataTransfer.effectAllowed='copy';});
    document.addEventListener('drop',e=>{
      if(e.dataTransfer.getData('text/plain')!=='fade-effect')return;
      const block=e.target.closest('.sub-block');if(!block)return;
      e.preventDefault();
      const sub=subs.find(s=>s.id===block.dataset.id);if(!sub)return;
      snapshot();selId=sub.id;multi.clear();
      if(!hasFade(sub))applyFadeToSub(sub);
      openFadeEditor(sub.id);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

// ── Fade badge CSS class (reuse ke-close style, green) ──
// Badges rendered in renderBlocks and renderSL

// ═══════════════ UNSAVED CHANGES WARNING ════════════════