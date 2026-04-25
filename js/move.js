let moveEditId = null;
let mvSelKf = null;      // index of selected keyframe
let mvDragTarget = null; // {type:'kf'|'cp1'|'cp2', seg, kfIdx}
let mvOverlayRaf = null;

function hasMove(sub){return !!(sub&&sub.move);}

// Move data structure:
// sub.move = {
//   keyframes: [{x,y, cp1x,cp1y, cp2x,cp2y, ease},...],  // x,y in 0-100%
//   steps: 8  // <p> segments per bezier segment
// }
// cp1 = outgoing control point from this KF, cp2 = incoming control point to next KF
// ease per segment: 'linear'|'ease-in'|'ease-out'|'ease-in-out'

function mvDefaultKFs(){
  return [
    {x:50,y:88, cp1x:50,cp1y:68, cp2x:50,cp2y:35, ease:'linear',accel:0,decel:0},
    {x:50,y:15, cp1x:50,cp1y:15, cp2x:50,cp2y:15, ease:'linear',accel:0,decel:0}
  ];
}

function applyMoveToSub(sub){
  if(hasMove(sub))return;
  sub.move={keyframes:mvDefaultKFs(),steps:60,exportFps:100};
  renderBlocks();renderSL();chkYtt();
}

function removeMoveFromSub(sub){
  if(!sub)return;
  snapshot();
  delete sub.move;
  renderBlocks();renderSL();chkYtt();
  closeMoveEditor();
}

// ── Open / Close ──
function openMoveEditor(id){
  // Close whichever editor is currently open, capturing its height first
  let panelH=300;
  const insp=document.getElementById('inspector');
  const karaEd=document.getElementById('kara-editor');
  const moveEd=document.getElementById('move-editor');
  if(karaEditId){
    if(karaEd&&karaEd.offsetHeight>0)panelH=karaEd.offsetHeight;
    closeKaraEditor();
  } else if(mirrorEditId){
    const mirEd=document.getElementById('mirror-editor');
    if(mirEd&&mirEd.offsetHeight>0)panelH=mirEd.offsetHeight;
    closeMirrorEditor();
  } else if(fadeEditId){
    const fadEd=document.getElementById('fade-editor');
    if(fadEd&&fadEd.offsetHeight>0)panelH=fadEd.offsetHeight;
    closeFadeEditor();
  } else if(moveEditId&&moveEditId!==id){
    if(moveEd&&moveEd.offsetHeight>0)panelH=moveEd.offsetHeight;
    closeMoveEditor();
  } else {
    if(insp&&insp.offsetHeight>0)panelH=insp.offsetHeight;
  }

  moveEditId=id; mvSelKf=0;
  insp.style.display='none';
  karaEd&&(karaEd.style.display='none');
  moveEd.style.display='flex';
  moveEd.style.flex='none';
  moveEd.style.height=Math.max(220,panelH)+'px';

  // Activate SVG overlay on video
  const vwrap=document.getElementById('vwrap');
  const overlay=document.getElementById('move-overlay');
  vwrap.classList.add('mv-editing');
  overlay.style.display='block';
  overlay.innerHTML=''; // clear stale SVG from previous session
  renderBlocks();renderSL();
  mvBuildKfList();
  mvDrawOverlay();
  mvInitOverlay();
}

function closeMoveEditor(){
  const moveEd=document.getElementById('move-editor');
  const insp=document.getElementById('inspector');
  const vwrap=document.getElementById('vwrap');
  const overlay=document.getElementById('move-overlay');
  const h=moveEd?moveEd.offsetHeight:0;
  moveEditId=null; mvSelKf=null; mvDragTarget=null;
  if(moveEd)moveEd.style.display='none';
  insp.style.display='flex';
  insp.style.flex='none';
  if(h>0)insp.style.height=h+'px';
  vwrap.classList.remove('mv-editing');
  // SVG overlay — just hide and clear
  if(overlay){overlay.style.display='none';overlay.innerHTML='';}
  renderBlocks();renderSL();
}

// ── Keyframe list UI ──
function mvBuildKfList(){
  const sub=subs.find(s=>s.id===moveEditId);
  const list=document.getElementById('mv-kf-list');
  if(!sub||!sub.move||!list)return;
  const kfs=sub.move.keyframes;
  const colors=['#ff9f0a','#0a84ff','#30d158','#bf5af2','#ff453a','#64d2ff'];
  list.innerHTML='';
  kfs.forEach((kf,i)=>{
    const item=document.createElement('div');
    item.className='mv-kf-item'+(mvSelKf===i?' selected':'');
    item.onclick=()=>{mvSelKf=i;mvBuildKfList();mvDrawOverlay();};
    const col=colors[i%colors.length];
    const label=i===0?'Start':i===kfs.length-1?'End':`KF ${i+1}`;
    item.innerHTML=`
      <div class="mv-kf-item-hdr">
        <div class="mv-kf-dot" style="background:${col}"></div>
        <span class="mv-kf-label">${label}</span>
        ${i>0&&i<kfs.length-1?`<button class="mv-kf-del" onclick="mvDelKf(${i});event.stopPropagation()">✕</button>`:''}
      </div>
      <div class="mv-kf-coords">
        <div class="mv-kf-coord"><label>X</label><input type="number" min="0" max="100" value="${kf.x.toFixed(1)}" oninput="mvKfCoordChange(${i},'x',this.value)" /></div>
        <div class="mv-kf-coord"><label>Y</label><input type="number" min="0" max="100" value="${kf.y.toFixed(1)}" oninput="mvKfCoordChange(${i},'y',this.value)" /></div>
      </div>
      ${i<kfs.length-1?`
      <div class="mv-kf-accel">
        <div class="mv-kf-accel-row">
          <label title="How fast the motion starts — 0=instant, 100=very gradual">Accel</label>
          <input type="range" min="0" max="100" value="${Math.round((kf.accel||0))}" oninput="mvKfAccelChange(${i},'accel',+this.value);this.nextElementSibling.textContent=this.value" style="flex:1;accent-color:#ff9f0a"/>
          <span>${Math.round(kf.accel||0)}</span>
        </div>
        <div class="mv-kf-accel-row">
          <label title="How fast the motion ends — 0=instant, 100=very gradual">Decel</label>
          <input type="range" min="0" max="100" value="${Math.round((kf.decel||0))}" oninput="mvKfAccelChange(${i},'decel',+this.value);this.nextElementSibling.textContent=this.value" style="flex:1;accent-color:#30d158"/>
          <span>${Math.round(kf.decel||0)}</span>
        </div>
        <div class="mv-kf-accel-row" style="margin-top:2px">
          <label style="min-width:32px">Ease</label>
          <select onchange="mvKfAccelChange(${i},'ease',this.value);mvApplyEasePreset(${i},this.value)" onclick="event.stopPropagation()" style="flex:1;background:var(--panel2);border:1px solid var(--border2);color:var(--text);font-family:var(--mono);font-size:10px;padding:2px 4px;border-radius:2px;outline:none">
            <option value="linear"${(kf.ease||'linear')==='linear'?' selected':''}>Linear</option>
            <option value="ease-in"${kf.ease==='ease-in'?' selected':''}>Ease In</option>
            <option value="ease-out"${kf.ease==='ease-out'?' selected':''}>Ease Out</option>
            <option value="ease-in-out"${kf.ease==='ease-in-out'?' selected':''}>Ease In-Out</option>
          </select>
        </div>
      </div>`:''}
    `;
    list.appendChild(item);
  });
  // Steps / FPS
  const stepsEl=document.getElementById('mv-steps');
  const stepsV=document.getElementById('mv-steps-v');
  if(stepsEl){stepsEl.value=sub.move.steps||60;if(stepsV)stepsV.textContent=sub.move.steps||60;}
  const fpsEl=document.getElementById('mv-fps');
  if(fpsEl)fpsEl.value=sub.move.exportFps||100;
}

function mvKfCoordChange(idx,axis,val){
  const sub=subs.find(s=>s.id===moveEditId);if(!sub||!sub.move)return;
  snapshot();
  const kf=sub.move.keyframes[idx];
  const v=Math.max(0,Math.min(100,parseFloat(val)||0));
  const dx=v-kf[axis];
  // Move control points with the keyframe
  kf['cp1'+axis]+=dx; kf['cp2'+axis]+=dx;
  kf[axis]=v;
  mvDrawOverlay();
}

function mvKfEaseChange(idx,val){
  const sub=subs.find(s=>s.id===moveEditId);if(!sub||!sub.move)return;
  snapshot();
  sub.move.keyframes[idx].ease=val;
  mvDrawOverlay();
}

function mvAddKeyframe(){
  const sub=subs.find(s=>s.id===moveEditId);if(!sub||!sub.move)return;
  snapshot();
  const kfs=sub.move.keyframes;
  const last=kfs[kfs.length-1];
  const prev=kfs[kfs.length-2]||{x:50,y:50};
  // Interpolate midpoint between last two
  const nx=Math.round((last.x+prev.x)/2);
  const ny=Math.round((last.y+prev.y)/2);
  const newKf={x:nx,y:ny,cp1x:nx,cp1y:ny-10,cp2x:last.x,cp2y:last.y+10,ease:'linear'};
  kfs.splice(kfs.length-1,0,newKf);
  mvSelKf=kfs.length-2;
  mvBuildKfList();mvDrawOverlay();
}

function mvDelKf(idx){
  const sub=subs.find(s=>s.id===moveEditId);if(!sub||!sub.move)return;
  snapshot();
  sub.move.keyframes.splice(idx,1);
  if(mvSelKf>=sub.move.keyframes.length)mvSelKf=sub.move.keyframes.length-1;
  mvBuildKfList();mvDrawOverlay();
}

function mvKfAccelChange(idx,prop,val){
  const sub=subs.find(s=>s.id===moveEditId);if(!sub||!sub.move)return;
  sub.move.keyframes[idx][prop]=val;
  mvDrawOverlay();
}

// When user picks an ease preset, also set the accel/decel sliders to match
function mvApplyEasePreset(idx,ease){
  const sub=subs.find(s=>s.id===moveEditId);if(!sub||!sub.move)return;
  const kf=sub.move.keyframes[idx];
  if(ease==='ease-in')    {kf.accel=70;kf.decel=0;}
  else if(ease==='ease-out')   {kf.accel=0;kf.decel=70;}
  else if(ease==='ease-in-out'){kf.accel=70;kf.decel=70;}
  else                         {kf.accel=0;kf.decel=0;}
  mvBuildKfList();mvDrawOverlay();
}

function mvFpsChange(fps){
  const sub=subs.find(s=>s.id===moveEditId);if(!sub||!sub.move)return;
  fps=Math.max(1,Math.min(200,fps||80));
  sub.move.exportFps=fps;
}

function mvStepsChange(v){
  const sub=subs.find(s=>s.id===moveEditId);if(!sub||!sub.move)return;
  sub.move.steps=+v;
  const el=document.getElementById('mv-steps-v');
  if(el)el.textContent=v;
}

function mvResetHandles(){
  const sub=subs.find(s=>s.id===moveEditId);if(!sub||!sub.move)return;
  snapshot();
  sub.move.keyframes.forEach((kf,i)=>{kf.cp1x=kf.x;kf.cp1y=kf.y;kf.cp2x=kf.x;kf.cp2y=kf.y;});
  mvDrawOverlay();
}

// ── Bezier helpers ──
function mvBezierPoint(p0,p1,p2,p3,t){
  const u=1-t;
  return u*u*u*p0+3*u*u*t*p1+3*u*t*t*p2+t*t*t*p3;
}

// accel=0-100 (slow start), decel=0-100 (slow end). ease string takes priority if set.
function mvEaseT(t,accel,decel,ease){
  // Named ease preset takes priority
  if(ease&&ease!=='linear'){
    if(ease==='ease-in')    return t*t;
    if(ease==='ease-out')   return t*(2-t);
    if(ease==='ease-in-out')return t<0.5?2*t*t:(-1+(4-2*t)*t);
  }
  // Legacy string passed as accel param
  if(typeof accel==='string'){
    const e=accel;
    if(e==='ease-in')return t*t;
    if(e==='ease-out')return t*(2-t);
    if(e==='ease-in-out')return t<0.5?2*t*t:(-1+(4-2*t)*t);
    return t;
  }
  const a=(accel||0)/100, d=(decel||0)/100;
  if(a===0&&d===0)return t;
  let r=a>0?t*(1-a)+Math.pow(t,1+a*3)*a:t;
  if(d>0){const eo=1-Math.pow(1-r,1+d*3);r=r*(1-d)+eo*d;}
  return Math.max(0,Math.min(1,r));
}

function getMoveFrames(m){
  const kfs=m.keyframes;
  if(!kfs||kfs.length<2)return[{ah:50,av:50}];
  const stepsPerSeg=Math.max(8,m.steps||60);
  const frames=[];
  for(let i=0;i<kfs.length-1;i++){
    const a=kfs[i],b=kfs[i+1];
    const count=i===kfs.length-2?stepsPerSeg:stepsPerSeg-1;
    for(let s=0;s<count;s++){
      const tRaw=s/(stepsPerSeg-1);
      const t=mvEaseT(tRaw,a.accel||0,a.decel||0,a.ease);
      const x=mvBezierPoint(a.x,a.cp1x,b.cp2x,b.x,t);
      const y=mvBezierPoint(a.y,a.cp1y,b.cp2y,b.y,t);
      frames.push({ah:Math.max(0,Math.min(100,Math.round(x*10)/10)),av:Math.max(0,Math.min(100,Math.round(y*10)/10))});
    }
  }
  return frames;
}

// ── SVG overlay helpers ──
function mvOverlayCoords(){
  const svg=document.getElementById('move-overlay');
  if(!svg)return{W:1,H:1};
  const r=svg.getBoundingClientRect();
  return{W:r.width||svg.parentElement.offsetWidth,H:r.height||svg.parentElement.offsetHeight};
}

function pctToOv(x,y){
  const{W,H}=mvOverlayCoords();
  return{px:x/100*W,py:y/100*H};
}

function ovToPct(px,py){
  const{W,H}=mvOverlayCoords();
  return{x:Math.max(0,Math.min(100,px/W*100)),y:Math.max(0,Math.min(100,py/H*100))};
}

function svgEl(tag,attrs){
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));
  return el;
}

function mvDrawOverlay(){
  const svg=document.getElementById('move-overlay');
  if(!svg||!moveEditId)return;
  const sub=subs.find(s=>s.id===moveEditId);
  svg.innerHTML='';
  if(!sub||!sub.move)return;

  // Always draw and edit the REAL keyframe array regardless of reverse.motion.
  // reverse.motion only affects export/playback order, not the editor.
  const kfs=sub.move.keyframes;
  if(kfs.length<2)return;
  const colors=['#ff9f0a','#0a84ff','#30d158','#bf5af2','#ff453a','#64d2ff'];

  // Transparent hit area for background clicks (add new KF)
  const bg=svgEl('rect',{x:'0',y:'0',width:'100%',height:'100%',fill:'transparent',class:'mv-bg-hit','pointer-events':'all'});
  bg.addEventListener('mousedown',e=>{
    if(e.target!==bg)return;
    e.preventDefault();e.stopPropagation();
    const sub2=subs.find(s=>s.id===moveEditId);if(!sub2||!sub2.move)return;
    snapshot();
    const r=svg.getBoundingClientRect();
    const{x,y}=ovToPct(e.clientX-r.left,e.clientY-r.top);
    const kfs2=sub2.move.keyframes;
    const insertIdx=kfs2.length-1;
    const prev=kfs2[insertIdx-1];
    const next=kfs2[insertIdx];
    kfs2.splice(insertIdx,0,{
      x,y,
      cp1x:x+(next.x-prev.x)*0.15,cp1y:y+(next.y-prev.y)*0.15,
      cp2x:x-(next.x-prev.x)*0.15,cp2y:y-(next.y-prev.y)*0.15,
      ease:'linear'
    });
    mvSelKf=insertIdx;
    mvBuildKfList();mvDrawOverlay();
  });
  svg.appendChild(bg);

  // Draw bezier curves + step dots
  for(let i=0;i<kfs.length-1;i++){
    const a=kfs[i],b=kfs[i+1];
    const pa=pctToOv(a.x,a.y),pb=pctToOv(b.x,b.y);
    const cp1=pctToOv(a.cp1x,a.cp1y),cp2=pctToOv(b.cp2x,b.cp2y);
    // Main bezier curve
    const path=svgEl('path',{
      d:`M${pa.px},${pa.py} C${cp1.px},${cp1.py} ${cp2.px},${cp2.py} ${pb.px},${pb.py}`,
      stroke:'rgba(255,255,255,0.55)',fill:'none','stroke-width':'2','pointer-events':'none'
    });
    svg.appendChild(path);
    // Step dots along curve
    for(let s=0;s<=20;s++){
      const t=s/20;
      const et=mvEaseT(t,a.ease||'linear');
      const x=mvBezierPoint(a.x,a.cp1x,b.cp2x,b.x,et);
      const y=mvBezierPoint(a.y,a.cp1y,b.cp2y,b.y,et);
      const{px,py}=pctToOv(x,y);
      const dot=svgEl('circle',{cx:px,cy:py,r:'2',fill:`rgba(255,255,255,${(0.15+t*0.3).toFixed(2)})`,'pointer-events':'none'});
      svg.appendChild(dot);
    }
  }

  // Draw control handles + keyframe dots
  kfs.forEach((kf,i)=>{
    const col=colors[i%colors.length];
    const p=pctToOv(kf.x,kf.y);

    // Outgoing cp1 handle
    if(i<kfs.length-1){
      const cp1=pctToOv(kf.cp1x,kf.cp1y);
      const line=svgEl('line',{x1:p.px,y1:p.py,x2:cp1.px,y2:cp1.py,stroke:'rgba(191,90,242,0.5)','stroke-width':'1','stroke-dasharray':'3,3','pointer-events':'none'});
      svg.appendChild(line);
      // Diamond handle
      const g=document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('transform',`translate(${cp1.px},${cp1.py}) rotate(45)`);
      g.setAttribute('class','mv-handle');
      g.style.cursor='grab';
      const rect=svgEl('rect',{x:'-5',y:'-5',width:'10',height:'10',fill:mvSelKf===i?'#bf5af2':'rgba(191,90,242,0.4)',stroke:'#fff','stroke-width':'1'});
      const hitRect=svgEl('rect',{x:'-10',y:'-10',width:'20',height:'20',fill:'transparent'});
      g.appendChild(rect);g.appendChild(hitRect);
      makeDraggable(g,'cp1',i,kf,'cp1x','cp1y');
      svg.appendChild(g);
    }

    // Incoming cp2 handle
    if(i>0){
      const cp2=pctToOv(kf.cp2x,kf.cp2y);
      const line=svgEl('line',{x1:p.px,y1:p.py,x2:cp2.px,y2:cp2.py,stroke:'rgba(191,90,242,0.5)','stroke-width':'1','stroke-dasharray':'3,3','pointer-events':'none'});
      svg.appendChild(line);
      const g=document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('transform',`translate(${cp2.px},${cp2.py}) rotate(45)`);
      g.setAttribute('class','mv-handle');
      g.style.cursor='grab';
      const rect=svgEl('rect',{x:'-5',y:'-5',width:'10',height:'10',fill:mvSelKf===i?'#bf5af2':'rgba(191,90,242,0.4)',stroke:'#fff','stroke-width':'1'});
      const hitRect=svgEl('rect',{x:'-10',y:'-10',width:'20',height:'20',fill:'transparent'});
      g.appendChild(rect);g.appendChild(hitRect);
      makeDraggable(g,'cp2',i,kf,'cp2x','cp2y');
      svg.appendChild(g);
    }

    // Main keyframe dot
    const isSelected=(mvSelKf===i);
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('transform',`translate(${p.px},${p.py})`);
    g.setAttribute('class','mv-kf-dot');
    g.style.cursor='grab';
    const circ=svgEl('circle',{r:isSelected?'9':'7',fill:col,stroke:'#fff','stroke-width':isSelected?'2.5':'1.5'});
    const hitCirc=svgEl('circle',{r:'14',fill:'transparent'});
    const lbl=svgEl('text',{x:'0',y:'0','text-anchor':'middle','dominant-baseline':'middle',
      fill:'#fff','font-size':isSelected?'10':'9','font-weight':'bold','font-family':'monospace','pointer-events':'none'});
    lbl.textContent=i===0?'S':i===kfs.length-1?'E':String(i+1);
    g.appendChild(circ);g.appendChild(hitCirc);g.appendChild(lbl);
    // Click to select
    g.addEventListener('mousedown',e=>{
      e.stopPropagation();
      mvSelKf=i;mvBuildKfList();mvDrawOverlay();
    });
    makeDraggable(g,'kf',i,kf,'x','y');
    svg.appendChild(g);
  });
}

// Universal drag maker for SVG elements
function makeDraggable(el,type,kfIdx,kf,xProp,yProp){
  el.addEventListener('mousedown',function(e){
    if(e.button!==0)return;
    e.preventDefault();e.stopPropagation();
    const svg=document.getElementById('move-overlay');
    const sub=subs.find(s=>s.id===moveEditId);
    if(!sub||!sub.move)return;
    document.body.style.cursor='grabbing';
    document.body.style.userSelect='none';

    function onMove(ev){
      const r=svg.getBoundingClientRect();
      const{x,y}=ovToPct(ev.clientX-r.left,ev.clientY-r.top);
      const kfObj=sub.move.keyframes[kfIdx];
      if(type==='kf'){
        const dx=x-kfObj.x,dy=y-kfObj.y;
        kfObj.cp1x+=dx;kfObj.cp1y+=dy;
        kfObj.cp2x+=dx;kfObj.cp2y+=dy;
        kfObj.x=x;kfObj.y=y;
        // Sync input fields
        const items=document.querySelectorAll('.mv-kf-item');
        const item=items[kfIdx];
        if(item){const ins=item.querySelectorAll('input[type=number]');if(ins[0])ins[0].value=Math.round(x);if(ins[1])ins[1].value=Math.round(y);}
      } else {
        kfObj[xProp]=x;kfObj[yProp]=y;
      }
      mvDrawOverlay();
    }
    function onUp(){
      document.body.style.cursor='';
      document.body.style.userSelect='';
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      snapshot();
    }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
}

function mvDrawDiamond(){} // kept for compat, now unused

// ── Overlay interaction (click/drag on video) ──
function mvInitOverlay(){
  // No-op now — all interaction is handled by SVG element listeners in mvDrawOverlay
}

window.addEventListener('resize',()=>{if(moveEditId)mvDrawOverlay();});

// ── Drag-and-drop Move card onto blocks ──
(function initMoveDnd(){
  function setup(){
    const card=document.getElementById('fx-move-card');
    if(!card)return;
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','move-effect');e.dataTransfer.effectAllowed='copy';});
    document.addEventListener('drop',e=>{
      if(e.dataTransfer.getData('text/plain')!=='move-effect')return;
      const block=e.target.closest('.sub-block');if(!block)return;
      e.preventDefault();
      const sub=subs.find(s=>s.id===block.dataset.id);if(!sub)return;
      snapshot();
      selId=sub.id;multi.clear();
      if(!hasMove(sub))applyMoveToSub(sub);
      openMoveEditor(sub.id);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

// ── Patch buildYTT to handle Move keyframe bezier ──
const _origBuildYTT=buildYTT;
buildYTT=function(sorted){
  const posToAp={7:0,8:1,9:2,4:3,5:4,6:5,1:6,2:7,3:8};
  const posToAhAv={7:[0,0],8:[50,0],9:[100,0],4:[0,50],5:[50,50],6:[100,50],1:[0,100],2:[50,100],3:[100,100]};
  const fontEnum={'Roboto':4,'Courier New':1,'Times New Roman':2,'Lucida Console':3,'Comic Sans MS':5,'Monotype Corsiva':6,'Carrois Gothic SC':7,'Noto Sans':4,'Deja Vu Sans Mono':3};
  function alphaToFo(a){return Math.round((a/100)*255);}
  function fmtColor(hex){return '#'+hex.replace('#','').toUpperCase().padStart(6,'0').slice(0,6);}
  function escX2(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  // ── Stepped fade helpers ──
  // Each step is ~33ms so fades are smooth at ~30fps regardless of total duration.
  // fo scale: 0=fully transparent, 254=fully opaque (YouTube uses 254 not 255 for "full").

  // Build an array of {fo, ms} steps for a fade covering fadeMs total.
  // direction: 'in' = 0→254, 'out' = 254→0
  // STEP_MS: target duration per step (33ms ≈ one frame at 30fps)
  const FADE_STEP_MS = 33;

  function buildFadeSteps(fadeMs, direction) {
    if (!fadeMs || fadeMs <= 0) return [];
    const nSteps = Math.max(2, Math.round(fadeMs / FADE_STEP_MS));
    const stepDur = Math.round(fadeMs / nSteps);
    const steps = [];
    for (let i = 0; i < nSteps; i++) {
      // t goes from 0→1 across the fade; each step represents its end opacity
      const t = (i + 1) / nSteps;
      const fo = direction === 'in'
        ? Math.min(254, Math.round(t * 254))
        : Math.max(0, Math.round((1 - t) * 254));
      steps.push({ fo, ms: stepDur });
    }
    // Last step: remove from steps array — caller emits the full-opacity main body
    // (for fade-in) or discards the last zero frame (for fade-out handled inline).
    if (direction === 'in') steps.pop(); // final fo=254 is the main body frame
    return steps;
  }

  // Get (or create) a pen identical to baseKey but with a different fo value (0-254 raw).
  function getFadePenId(baseKey, fo) {
    const st = JSON.parse(baseKey);
    // _fo is stored as 0-100 percentage; convert raw fo (0-254) → percentage
    const foPercent = Math.round(fo / 254 * 100);
    const fadedKey = JSON.stringify({ ...st, _fc: st._fc || st.textColor || '#ffffff', _fo: foPercent });
    getPenId(fadedKey);
    return penIndex.get(fadedKey);
  }

  // Emit stepped fade-in frames. Returns the ms timestamp after all fade frames
  // (i.e. the start time of the main full-opacity body).
  function emitFadeIn(s, basePenId, baseKey, wpId, wsVal, text, inMs, lines) {
    if (!inMs || inMs <= 0) return s.startMs;
    const steps = buildFadeSteps(inMs, 'in');
    let t = s.startMs;
    for (const step of steps) {
      const fpid = getFadePenId(baseKey, step.fo);
      lines.push(`<p t="${t}" d="${step.ms}" wp="${wpId}" ws="${wsVal}"><s p="${fpid}">${escX2(text)}</s></p>`);
      t += step.ms;
    }
    return t;
  }

  // Emit the main subtitle body (from mainStart) then stepped fade-out frames at the tail.
  function emitWithFadeOut(s, basePenId, baseKey, wpId, wsVal, text, outMs, mainStart, lines) {
    const subEnd = s.endMs;
    if (!outMs || outMs <= 0) {
      const d = Math.max(1, subEnd - mainStart);
      lines.push(`<p t="${mainStart}" d="${d}" wp="${wpId}" ws="${wsVal}"><s p="${basePenId}">${escX2(text)}</s></p>`);
      return;
    }
    const steps = buildFadeSteps(outMs, 'out');
    const fadeOutStart = Math.max(mainStart, subEnd - outMs);
    const mainD = Math.max(1, fadeOutStart - mainStart);
    lines.push(`<p t="${mainStart}" d="${mainD}" wp="${wpId}" ws="${wsVal}"><s p="${basePenId}">${escX2(text)}</s></p>`);
    let t = fadeOutStart;
    for (const step of steps) {
      const d = step.ms;
      if (t + d > subEnd) break;
      const fpid = getFadePenId(baseKey, step.fo);
      lines.push(`<p t="${t}" d="${d}" wp="${wpId}" ws="${wsVal}"><s p="${fpid}">${escX2(text)}</s></p>`);
      t += d;
    }
  }

  const penKeys=[];const penIndex=new Map();
  function getPenId(k){if(penIndex.has(k))return penIndex.get(k);const id=penKeys.length;penKeys.push(k);penIndex.set(k,id);return id;}
  function penXmlFromKey(k,id){
    const st=JSON.parse(k);
    const b=st.bold?' b="1"':'';const it=st.italic?' i="1"':'';const u=st.underline?' u="1"':'';
    const fc=` fc="${fmtColor(st._fc||st.textColor||'#ffffff')}"`;
    const fo=` fo="${alphaToFo(st._fo!==undefined?st._fo:(st.textAlpha!==undefined?st.textAlpha:100))}"`;
    const bc=` bc="${fmtColor(st.bgColor||'#000000')}"`;
    const bo=` bo="${alphaToFo(st.bgAlpha!==undefined?st.bgAlpha:60)}"`;
    const fsVal=fontEnum[st.font]!==undefined?fontEnum[st.font]:4;
    const et_v=st.outlineType>0?st.outlineType:((st.outlineAlpha>0)?3:(st.shadowGlow?3:st.shadowSoft?4:st.shadowHard?1:st.shadowBevel?2:0));
    const et_s=` et="${et_v}"`;
    const ec_s=` ec="${fmtColor(st.outlineColor||'#000000')}"`;
    return `<pen id="${id}" b="${st.bold?1:0}" i="${st.italic?1:0}" u="${st.underline?1:0}"${fc}${fo}${bc}${bo} fs="${fsVal}" sz="${st.fontSize||100}"${et_s}${ec_s}/>`;
  }
  sorted.forEach(s=>{
    getPenId(JSON.stringify({...s.style,_fc:s.style.textColor,_fo:s.style.textAlpha}));
    if(hasKaraoke(s)){const kd=s.karaoke;getPenId(JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:kd.preAlpha!==undefined?kd.preAlpha:100}));}
    if(hasMirror(s)){
      const m=s.mirror;
      const opacityFrac=(m.opacity||40)/100;
      const ghostTextAlpha=Math.round((s.style.textAlpha||100)*opacityFrac);
      const ghostBgAlpha=Math.round((s.style.bgAlpha||60)*opacityFrac);
      const ghostKey=JSON.stringify({...s.style,_fo:ghostTextAlpha,bgAlpha:ghostBgAlpha});
      getPenId(ghostKey);
      if(hasKaraoke(s)){
        const kd=s.karaoke;
        const ghostPreAlpha=Math.round((kd.preAlpha??100)*opacityFrac);
        getPenId(JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:ghostPreAlpha,bgAlpha:ghostBgAlpha}));
      }
    }
    // Pre-register fade pens — generate the exact same steps that emitFadeIn/Out will use
    if(hasFade(s)){
      const inMs=s.fade.inMs||0;
      const outMs=s.fade.outMs||0;
      const inSteps=buildFadeSteps(inMs,'in');
      const outSteps=buildFadeSteps(outMs,'out');
      [...inSteps,...outSteps].forEach(step=>{
        const foPercent=Math.round(step.fo/254*100);
        const fadedKey=JSON.stringify({...s.style,_fc:s.style.textColor,_fo:foPercent});
        getPenId(fadedKey);
      });
    }
  });

  // Collect all unique wp positions
  const wpMap=new Map(); // "ah,av" -> {id, ap}
  function getWpId(ah,av,ap){
    ah=Math.max(0,Math.min(100,Math.round(ah)));
    av=Math.max(0,Math.min(100,Math.round(av)));
    const k=`${ah},${av}`;
    if(wpMap.has(k))return wpMap.get(k).id;
    const id=wpMap.size;wpMap.set(k,{id,ap:ap??4});return id;
  }
  // Normal position-based wps — use correct posToAp anchor for grid positions
  sorted.forEach(s=>{
    if(!hasMove(s)){
      const pos=s.style.position||2;
      const[ah,av]=posToAhAv[pos]||[50,100];
      const ap=posToAp[pos]??7;
      getWpId(ah,av,ap);
      if(hasMirror(s)){
        const m=s.mirror,axis=m.axis||'x',ox=m.offsetX||0,oy=m.offsetY||0;
        let mah=ah,mav=av;
        // Must match mirrorPos() logic exactly — only flip the axis dimension, offset applies independently
        if(axis==='x'||axis==='xy') mah=Math.max(0,Math.min(100,100-ah+ox)); else mah=Math.max(0,Math.min(100,ah+ox));
        if(axis==='y'||axis==='xy') mav=Math.max(0,Math.min(100,100-av+oy)); else mav=Math.max(0,Math.min(100,av+oy));
        getWpId(mah,mav,4); // mirror ghost uses ap=4 (custom position)
      }
    }
  });
  // Move wps — register all unique rounded positions the export will use
  sorted.forEach(s=>{
    if(!hasMove(s))return;
    const totalDur=Math.max(1,s.endMs-s.startMs);
    const exportFps=s.move.exportFps||100;
    const numSamples=Math.max(2,Math.ceil(totalDur/(1000/exportFps)));
    const kfs=(s.reverse&&s.reverse.motion)?[...s.move.keyframes].reverse():s.move.keyframes;
    const axis=hasMirror(s)?s.mirror.axis||'x':null;
    const ox=hasMirror(s)?s.mirror.offsetX||0:0;
    const oy=hasMirror(s)?s.mirror.offsetY||0:0;
    // Register position at t=0 (start)
    function regAtT(t){
      t=Math.max(0,Math.min(1,t));
      const segCount=kfs.length-1;
      const segT=t*segCount;
      const segIdx=Math.min(Math.floor(segT),segCount-1);
      const a=kfs[segIdx],b=kfs[segIdx+1];
      const et=mvEaseT(segT-segIdx,a.accel||0,a.decel||0,a.ease);
      const px=Math.max(0,Math.min(100,Math.round(mvBezierPoint(a.x,a.cp1x,b.cp2x,b.x,et))));
      const py=Math.max(0,Math.min(100,Math.round(mvBezierPoint(a.y,a.cp1y,b.cp2y,b.y,et))));
      getWpId(px,py,4);
      if(axis){
        let mah=px,mav=py;
        if(axis==='x'||axis==='xy') mah=Math.max(0,Math.min(100,100-px+ox)); else mah=Math.max(0,Math.min(100,px+ox));
        if(axis==='y'||axis==='xy') mav=Math.max(0,Math.min(100,100-py+oy)); else mav=Math.max(0,Math.min(100,py+oy));
        getWpId(mah,mav,4);
      }
    }
    for(let i=0;i<=numSamples;i++) regAtT(i/numSamples);
  });

  // wpsXml will be built AFTER all line emission so any getWpId calls
  // during line emission are captured (late-registered positions also get a <wp> entry).
  const wsXml='<ws id="0" ju="2" pd="0" sd="0" /><ws id="1" ju="2" pd="0" sd="0" />';

  const lines=[];
  sorted.forEach(s=>{
    const mainKey=JSON.stringify({...s.style,_fc:s.style.textColor,_fo:s.style.textAlpha});
    const mainPenId=penIndex.get(mainKey)??0;
    const fadeIn=hasFade(s)?(s.fade.inMs||0):0;
    const fadeOut=hasFade(s)?(s.fade.outMs||0):0;
    // Reverse effect flags
    const revMotion=s.reverse&&s.reverse.motion;
    const revTiming=s.reverse&&s.reverse.timing;
    const displayText=_getDisplayText(s); // handles reverse.text

    if(hasMove(s)){
      const totalDur=Math.max(1,s.endMs-s.startMs);
      const exportFps=s.move.exportFps||100;
      const SAMPLE_MS=Math.round(1000/exportFps); // high-res sampling interval
      const numSamples=Math.max(2,Math.ceil(totalDur/SAMPLE_MS));
      const kfs=revMotion?[...s.move.keyframes].reverse():s.move.keyframes;

      // Sample bezier at normalized t → {ah,av} rounded integers
      function posAtT(t){
        t=Math.max(0,Math.min(1,t));
        const segCount=kfs.length-1;
        const segT=t*segCount;
        const segIdx=Math.min(Math.floor(segT),segCount-1);
        const a=kfs[segIdx],b=kfs[segIdx+1];
        const et=mvEaseT(segT-segIdx,a.accel||0,a.decel||0,a.ease);
        return{
          ah:Math.max(0,Math.min(100,Math.round(mvBezierPoint(a.x,a.cp1x,b.cp2x,b.x,et)))),
          av:Math.max(0,Math.min(100,Math.round(mvBezierPoint(a.y,a.cp1y,b.cp2y,b.y,et))))
        };
      }

      if(hasKaraoke(s)){
        const kd=s.karaoke;
        const syls=revTiming?[...kd.syllables].reverse():kd.syllables;
        const preKey=JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:kd.preAlpha!==undefined?kd.preAlpha:100});
        const prePenId=penIndex.get(preKey)??0;
        // Fade-in: emit stepped frames at start position using full-line text
        const inStepsMvK=buildFadeSteps(fadeIn,'in');
        const outStepsMvK=buildFadeSteps(fadeOut,'out');
        let sylBaseStart=s.startMs;
        if(fadeIn>0){
          const startPos=posAtT(0);
          const startWpId=getWpId(startPos.ah,startPos.av,4);
          const fullText=syls.map(sv=>sv.text).join('');
          let t=s.startMs;
          for(const step of inStepsMvK){
            const fpid=getFadePenId(mainKey,step.fo);
            lines.push(`<p t="${t}" d="${step.ms}" wp="${startWpId}" ws="1"><s p="${fpid}">${escX2(fullText)}</s></p>`);
            t+=step.ms;
          }
          sylBaseStart=t;
        }
        // Fade-out window: last N ms before end
        const sylFadeOutStart=(fadeOut>0)?Math.max(sylBaseStart,s.endMs-fadeOut):s.endMs;
        let cumMs=0;
        syls.forEach((syl,i)=>{
          // Remap syllable times to start after fade-in
          const rawSylStart=s.startMs+cumMs;
          const rawSylEnd=i<syls.length-1?s.startMs+cumMs+syl.durMs:s.endMs;
          // Clip syllable to the [sylBaseStart, sylFadeOutStart] window
          const sylStart=Math.max(sylBaseStart,rawSylStart);
          const sylEnd=Math.min(sylFadeOutStart,rawSylEnd);
          const sylDur=Math.max(1,sylEnd-sylStart);
          const sungText=syls.slice(0,i+1).map(sv=>sv.text).join('');
          const unsungText=syls.slice(i+1).map(sv=>sv.text).join('');
          if(sylStart<sylFadeOutStart){
            const FRAME_MS=33;
            const nFrames=Math.max(1,Math.ceil(sylDur/FRAME_MS));
            let pendingStart=sylStart;
            let pendingPos=posAtT(Math.max(0,(sylStart-s.startMs)/totalDur));
            let pendingWp=getWpId(pendingPos.ah,pendingPos.av,4);
            for(let f=1;f<=nFrames;f++){
              const fMs=f===nFrames?sylEnd:sylStart+Math.round(f*sylDur/nFrames);
              const t=(sylStart-s.startMs+Math.round(f*sylDur/nFrames))/totalDur;
              const pos=f<nFrames?posAtT(Math.min(1,t)):posAtT(Math.min(1,(rawSylEnd-s.startMs)/totalDur));
              const wp=getWpId(pos.ah,pos.av,4);
              if(wp!==pendingWp||f===nFrames){
                const d=Math.max(1,fMs-pendingStart);
                if(sungText&&unsungText)lines.push(`<p t="${pendingStart}" d="${d}" wp="${pendingWp}" ws="1"><s p="${prePenId}">${escX2(sungText)}</s><s p="${mainPenId}">${escX2(unsungText)}</s></p>`);
                else if(sungText)lines.push(`<p t="${pendingStart}" d="${d}" wp="${pendingWp}" ws="1"><s p="${prePenId}">${escX2(sungText)}</s></p>`);
                pendingStart=fMs;pendingWp=wp;
              }
            }
          }
          cumMs+=syl.durMs;
        });
        // Fade-out: emit stepped frames at end position using full-line text
        if(fadeOut>0){
          const endPos=posAtT(1);
          const endWpId=getWpId(endPos.ah,endPos.av,4);
          const fullText=syls.map(sv=>sv.text).join('');
          let t=sylFadeOutStart;
          for(const step of outStepsMvK){
            if(t+step.ms>s.endMs)break;
            const fpid=getFadePenId(mainKey,step.fo);
            lines.push(`<p t="${t}" d="${step.ms}" wp="${endWpId}" ws="1"><s p="${fpid}">${escX2(fullText)}</s></p>`);
            t+=step.ms;
          }
        }
      } else {
        // Sample at high resolution, emit only when position changes
        // Clamp all samples so we never exceed the endpoint (avoids bezier overshoot stutter)
        const startPos=posAtT(0);
        const endPos=posAtT(1);

        // Fade-in: emit stepped frames at the start position before move begins
        const inStepsMv = buildFadeSteps(fadeIn, 'in');
        let moveStart = s.startMs;
        if (fadeIn > 0) {
          const startWpId = getWpId(startPos.ah, startPos.av, 4);
          let t = s.startMs;
          for (const step of inStepsMv) {
            const fpid = getFadePenId(mainKey, step.fo);
            lines.push(`<p t="${t}" d="${step.ms}" wp="${startWpId}" ws="1"><s p="${fpid}">${escX2(displayText)}</s></p>`);
            t += step.ms;
          }
          moveStart = t;
        }

        // Fade-out: compute where fade-out begins so we stop move frames there
        const outStepsMv = buildFadeSteps(fadeOut, 'out');
        const moveEnd = (fadeOut > 0) ? Math.max(moveStart, s.endMs - fadeOut) : s.endMs;

        let pendingStart = moveStart;
        let pendingWp = getWpId(posAtT(Math.max(0,(moveStart-s.startMs)/totalDur)).ah, posAtT(Math.max(0,(moveStart-s.startMs)/totalDur)).av, 4);

        for (let i = 1; i <= numSamples; i++) {
          const t = i / numSamples;
          const msOff = Math.round(i * totalDur / numSamples);
          const tMs = s.startMs + Math.min(msOff, totalDur);
          if (tMs <= moveStart) continue;
          const isLast = tMs >= moveEnd;
          const pos = isLast ? posAtT(moveEnd <= s.startMs ? 0 : Math.min(1, (moveEnd - s.startMs) / totalDur)) : posAtT(t);
          const wp = getWpId(pos.ah, pos.av, 4);

          if (wp !== pendingWp || isLast) {
            const d = Math.max(1, (isLast ? moveEnd : tMs) - pendingStart);
            if (d > 0) lines.push(`<p t="${pendingStart}" d="${d}" wp="${pendingWp}" ws="1"><s p="${mainPenId}">${escX2(displayText)}</s></p>`);
            pendingStart = isLast ? moveEnd : tMs;
            pendingWp = wp;
            if (isLast) break;
          }
        }

        // Fade-out frames at the end position
        if (fadeOut > 0) {
          const endWpId = getWpId(endPos.ah, endPos.av, 4);
          let t = moveEnd;
          for (const step of outStepsMv) {
            if (t + step.ms > s.endMs) break;
            const fpid = getFadePenId(mainKey, step.fo);
            lines.push(`<p t="${t}" d="${step.ms}" wp="${endWpId}" ws="1"><s p="${fpid}">${escX2(displayText)}</s></p>`);
            t += step.ms;
          }
        }
      }
      return;
    }

    const pos=s.style.position||2;
    const[nah,nav]=posToAhAv[pos]||[50,100];
    const apVal=posToAp[pos]??7;
    const wpId=getWpId(nah,nav,apVal);
    const subDur=Math.max(1,s.endMs-s.startMs);

    if(!hasKaraoke(s)){
      // Simple static subtitle — emit with stepped fade, using displayText for reverse.text
      if(fadeIn>0||fadeOut>0){
        const mainStart=emitFadeIn(s,mainPenId,mainKey,wpId,'0',displayText,fadeIn,lines);
        emitWithFadeOut(s,mainPenId,mainKey,wpId,'0',displayText,fadeOut,mainStart,lines);
      } else {
        lines.push(`<p t="${s.startMs}" d="${subDur}" wp="${wpId}" ws="0"><s p="${mainPenId}">${escX2(displayText)}</s></p>`);
      }
      return;
    }
    // Karaoke — emit syllable frames; reverse syllable order if reverse.timing is set
    const kd=s.karaoke;
    const rawSyls=kd.syllables;
    const syls=revTiming?[...rawSyls].reverse():rawSyls;
    const preKey=JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:kd.preAlpha!==undefined?kd.preAlpha:100});
    const prePenId=penIndex.get(preKey)??0;
    // Fade-in pre-frames before first syllable
    if(fadeIn>0) emitFadeIn(s,mainPenId,mainKey,wpId,'0',displayText,fadeIn,lines);
    let cumMs=0;
    syls.forEach((syl,i)=>{
      const tStart=s.startMs+cumMs;
      const tEnd=i<syls.length-1?s.startMs+cumMs+syl.durMs:s.endMs;
      const segDur=Math.max(1,tEnd-tStart);
      const sungText=syls.slice(0,i+1).map(sv=>sv.text).join('');
      const unsungText=syls.slice(i+1).map(sv=>sv.text).join('');
      if(i===syls.length-1&&fadeOut>0){
        // Last syllable — emit main portion then fade out
        const mainText=sungText;
        const fadeOutStart=Math.max(tStart,s.endMs-fadeOut);
        const mainD=Math.max(1,fadeOutStart-tStart);
        lines.push(`<p t="${tStart}" d="${mainD}" wp="${wpId}" ws="0"><s p="${prePenId}">${escX2(mainText)}</s></p>`);
        let t=fadeOutStart;
        const kFadeOutSteps=buildFadeSteps(fadeOut,'out');
        for(const step of kFadeOutSteps){
          if(t+step.ms>s.endMs)break;
          const fpid=getFadePenId(mainKey,step.fo);
          lines.push(`<p t="${t}" d="${step.ms}" wp="${wpId}" ws="0"><s p="${fpid}">${escX2(mainText)}</s></p>`);
          t+=step.ms;
        }
      } else {
        if(sungText&&unsungText)lines.push(`<p t="${tStart}" d="${segDur}" wp="${wpId}" ws="0"><s p="${prePenId}">${escX2(sungText)}</s><s p="${mainPenId}">${escX2(unsungText)}</s></p>`);
        else if(sungText)lines.push(`<p t="${tStart}" d="${segDur}" wp="${wpId}" ws="0"><s p="${prePenId}">${escX2(sungText)}</s></p>`);
      }
      cumMs+=syl.durMs;
    });
  });

  // ── Mirror ghost export — brute force frames with full effect support ──
  sorted.forEach(s=>{
    if(!hasMirror(s))return;
    const m=s.mirror;
    const axis=m.axis||'x';
    const ox=m.offsetX||0, oy=m.offsetY||0;
    const subDur=Math.max(1,s.endMs-s.startMs);
    const opacityFrac=(m.opacity||40)/100;
    const fadeIn=hasFade(s)?(s.fade.inMs||0):0;
    const fadeOut=hasFade(s)?(s.fade.outMs||0):0;
    const mainKey=JSON.stringify({...s.style,_fc:s.style.textColor,_fo:s.style.textAlpha});
    const mirDisplayText=_getDisplayText(s); // handles reverse.text for ghost frames
    const mirRevMotion=s.reverse&&s.reverse.motion;

    // Ghost pens
    const ghostTextAlpha=Math.round((s.style.textAlpha||100)*opacityFrac);
    const ghostBgAlpha=Math.round((s.style.bgAlpha||60)*opacityFrac);
    const ghostKey=JSON.stringify({...s.style,_fo:ghostTextAlpha,bgAlpha:ghostBgAlpha});
    getPenId(ghostKey);
    const ghostPenId=penIndex.get(ghostKey)??0;

    // Helper: mirror ah/av based on axis
    function mirrorPos(ah,av){
      let mah=ah,mav=av;
      if(axis==='x'||axis==='xy') mah=Math.max(0,Math.min(100,100-ah+ox));
      else mah=Math.max(0,Math.min(100,ah+ox));
      if(axis==='y'||axis==='xy') mav=Math.max(0,Math.min(100,100-av+oy));
      else mav=Math.max(0,Math.min(100,av+oy));
      return[mah,mav];
    }

    if(hasMove(s)){
      // Mirror has move: high-res sample, emit only on position change
      const exportFps=s.move.exportFps||100;
      const numSamples=Math.max(2,Math.ceil(subDur/(1000/exportFps)));
      const kfs=mirRevMotion?[...s.move.keyframes].reverse():s.move.keyframes;

      function mirPosAtT(t){
        t=Math.max(0,Math.min(1,t));
        const segCount=kfs.length-1;
        const segT=t*segCount;
        const segIdx=Math.min(Math.floor(segT),segCount-1);
        const a=kfs[segIdx],b=kfs[segIdx+1];
        const et=mvEaseT(segT-segIdx,a.accel||0,a.decel||0,a.ease);
        const[mah,mav]=mirrorPos(
          Math.max(0,Math.min(100,Math.round(mvBezierPoint(a.x,a.cp1x,b.cp2x,b.x,et)))),
          Math.max(0,Math.min(100,Math.round(mvBezierPoint(a.y,a.cp1y,b.cp2y,b.y,et))))
        );
        return getWpId(mah,mav,4);
      }

      if(hasKaraoke(s)){
        const kd=s.karaoke;const syls=kd.syllables;
        const ghostPreAlpha=Math.round((kd.preAlpha??100)*opacityFrac);
        const preKey=JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:ghostPreAlpha,bgAlpha:ghostBgAlpha});
        getPenId(preKey);const ghostPrePenId=penIndex.get(preKey)??0;
        const inStepsMirMvK=buildFadeSteps(fadeIn,'in');
        const outStepsMirMvK=buildFadeSteps(fadeOut,'out');
        // Ghost fade helper
        function getGhostFadePenMvK(rawFo){
          const fadeFo=Math.round(rawFo*opacityFrac);
          const foPercent=Math.round(fadeFo/254*100);
          const k=JSON.stringify({...s.style,_fc:s.style.textColor,_fo:foPercent,bgAlpha:ghostBgAlpha});
          getPenId(k);return penIndex.get(k)??ghostPenId;
        }
        // Fade-in ghost frames at start position
        let mirKylBaseStart=s.startMs;
        if(fadeIn>0){
          const startWpId=mirPosAtT(0);
          const fullText=syls.map(sv=>sv.text).join('');
          let t=s.startMs;
          for(const step of inStepsMirMvK){
            const gfpid=getGhostFadePenMvK(step.fo);
            lines.push(`<p t="${t}" d="${step.ms}" wp="${startWpId}" ws="1"><s p="${gfpid}">${escX2(fullText)}</s></p>`);
            t+=step.ms;
          }
          mirKylBaseStart=t;
        }
        const mirKylFadeOutStart=(fadeOut>0)?Math.max(mirKylBaseStart,s.endMs-fadeOut):s.endMs;
        let cumMs=0;
        syls.forEach((syl,i)=>{
          const rawSylStart=s.startMs+cumMs;
          const rawSylEnd=i<syls.length-1?s.startMs+cumMs+syl.durMs:s.endMs;
          const sylStart=Math.max(mirKylBaseStart,rawSylStart);
          const sylEnd=Math.min(mirKylFadeOutStart,rawSylEnd);
          const sylDur=Math.max(1,sylEnd-sylStart);
          const sungText=syls.slice(0,i+1).map(sv=>sv.text).join('');
          const unsungText=syls.slice(i+1).map(sv=>sv.text).join('');
          if(sylStart<mirKylFadeOutStart){
            const FRAME_MS=33;
            const nFrames=Math.max(1,Math.ceil(sylDur/FRAME_MS));
            let pendingStart=sylStart;
            let pendingWp=mirPosAtT(Math.max(0,(sylStart-s.startMs)/subDur));
            for(let f=1;f<=nFrames;f++){
              const fMs=f===nFrames?sylEnd:sylStart+Math.round(f*sylDur/nFrames);
              const t=Math.min(1,(sylStart-s.startMs+Math.round(f*sylDur/nFrames))/subDur);
              const wp=f<nFrames?mirPosAtT(t):mirPosAtT(Math.min(1,(rawSylEnd-s.startMs)/subDur));
              if(wp!==pendingWp||f===nFrames){
                const d=Math.max(1,fMs-pendingStart);
                if(sungText&&unsungText)lines.push(`<p t="${pendingStart}" d="${d}" wp="${pendingWp}" ws="1"><s p="${ghostPrePenId}">${escX2(sungText)}</s><s p="${ghostPenId}">${escX2(unsungText)}</s></p>`);
                else if(sungText)lines.push(`<p t="${pendingStart}" d="${d}" wp="${pendingWp}" ws="1"><s p="${ghostPrePenId}">${escX2(sungText)}</s></p>`);
                pendingStart=fMs;pendingWp=wp;
              }
            }
          }
          cumMs+=syl.durMs;
        });
        // Fade-out ghost frames at end position
        if(fadeOut>0){
          const endWpId=mirPosAtT(1);
          const fullText=syls.map(sv=>sv.text).join('');
          let t=mirKylFadeOutStart;
          for(const step of outStepsMirMvK){
            if(t+step.ms>s.endMs)break;
            const gfpid=getGhostFadePenMvK(step.fo);
            lines.push(`<p t="${t}" d="${step.ms}" wp="${endWpId}" ws="1"><s p="${gfpid}">${escX2(fullText)}</s></p>`);
            t+=step.ms;
          }
        }
      } else {
        // Mirror+Move simple — emit with fade-in/out around position frames
        const inStepsMirMv=buildFadeSteps(fadeIn,'in');
        const outStepsMirMv=buildFadeSteps(fadeOut,'out');
        // Fade-in ghost frames at start position
        let mirMoveStart=s.startMs;
        if(fadeIn>0){
          const startWpId=mirPosAtT(0);
          let t=s.startMs;
          for(const step of inStepsMirMv){
            const fadeFo=Math.round(step.fo*opacityFrac);
            const foPercent=Math.round(fadeFo/254*100);
            const k=JSON.stringify({...s.style,_fc:s.style.textColor,_fo:foPercent,bgAlpha:ghostBgAlpha});
            getPenId(k);const gfpid=penIndex.get(k)??ghostPenId;
            lines.push(`<p t="${t}" d="${step.ms}" wp="${startWpId}" ws="1"><s p="${gfpid}">${escX2(mirDisplayText)}</s></p>`);
            t+=step.ms;
          }
          mirMoveStart=t;
        }
        const mirMoveEnd=(fadeOut>0)?Math.max(mirMoveStart,s.endMs-fadeOut):s.endMs;
        let pendingStart=mirMoveStart;
        let pendingWp=mirPosAtT(Math.max(0,(mirMoveStart-s.startMs)/subDur));
        for(let i=1;i<=numSamples;i++){
          const t=i/numSamples;
          const tMs=s.startMs+Math.min(Math.round(i*subDur/numSamples),subDur);
          if(tMs<=mirMoveStart)continue;
          const isLast=tMs>=mirMoveEnd;
          const wp=isLast?mirPosAtT(Math.min(1,(mirMoveEnd-s.startMs)/subDur)):(i<numSamples?mirPosAtT(t):mirPosAtT(1));
          if(wp!==pendingWp||isLast){
            const d=Math.max(1,(isLast?mirMoveEnd:tMs)-pendingStart);
            if(d>0)lines.push(`<p t="${pendingStart}" d="${d}" wp="${pendingWp}" ws="1"><s p="${ghostPenId}">${escX2(mirDisplayText)}</s></p>`);
            pendingStart=isLast?mirMoveEnd:tMs;
            pendingWp=wp;
            if(isLast)break;
          }
        }
        // Fade-out ghost frames at end position
        if(fadeOut>0){
          const endWpId=mirPosAtT(1);
          let t=mirMoveEnd;
          for(const step of outStepsMirMv){
            if(t+step.ms>s.endMs)break;
            const fadeFo=Math.round(step.fo*opacityFrac);
            const foPercent=Math.round(fadeFo/254*100);
            const k=JSON.stringify({...s.style,_fc:s.style.textColor,_fo:foPercent,bgAlpha:ghostBgAlpha});
            getPenId(k);const gfpid=penIndex.get(k)??ghostPenId;
            lines.push(`<p t="${t}" d="${step.ms}" wp="${endWpId}" ws="1"><s p="${gfpid}">${escX2(mirDisplayText)}</s></p>`);
            t+=step.ms;
          }
        }
      }
    } else {
      // Static mirror (no move)
      const pos=s.style.position||2;
      const[oah,oav]=posToAhAv[pos]||[50,100];
      const[mah,mav]=mirrorPos(oah,oav);
      const ghostWpId=getWpId(mah,mav,4);

      if(hasKaraoke(s)){
        const kd=s.karaoke;const syls=kd.syllables;
        const ghostPreAlpha=Math.round((kd.preAlpha??100)*opacityFrac);
        const preKey=JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:ghostPreAlpha,bgAlpha:ghostBgAlpha});
        getPenId(preKey);const ghostPrePenId=penIndex.get(preKey)??0;
        const inStepsMirK=buildFadeSteps(fadeIn,'in');
        const outStepsMirK=buildFadeSteps(fadeOut,'out');
        function getGhostFadePenK(rawFo){
          const fadeFo=Math.round(rawFo*opacityFrac);
          const foPercent=Math.round(fadeFo/254*100);
          const k=JSON.stringify({...s.style,_fc:s.style.textColor,_fo:foPercent,bgAlpha:ghostBgAlpha});
          getPenId(k);return penIndex.get(k)??ghostPenId;
        }
        // Ghost fade-in frames
        let mirKBaseStart=s.startMs;
        if(fadeIn>0){
          const fullText=syls.map(sv=>sv.text).join('');
          let t=s.startMs;
          for(const step of inStepsMirK){
            const gfpid=getGhostFadePenK(step.fo);
            lines.push(`<p t="${t}" d="${step.ms}" wp="${ghostWpId}" ws="0"><s p="${gfpid}">${escX2(fullText)}</s></p>`);
            t+=step.ms;
          }
          mirKBaseStart=t;
        }
        const mirKFadeOutStart=(fadeOut>0)?Math.max(mirKBaseStart,s.endMs-fadeOut):s.endMs;
        let cumMs=0;
        syls.forEach((syl,i)=>{
          const rawStart=s.startMs+cumMs;
          const rawEnd=i<syls.length-1?s.startMs+cumMs+syl.durMs:s.endMs;
          const tStart=Math.max(mirKBaseStart,rawStart);
          const tEnd=Math.min(mirKFadeOutStart,rawEnd);
          const segDur=Math.max(1,tEnd-tStart);
          const sungText=syls.slice(0,i+1).map(sv=>sv.text).join('');
          const unsungText=syls.slice(i+1).map(sv=>sv.text).join('');
          if(tStart<mirKFadeOutStart){
            if(sungText&&unsungText)lines.push(`<p t="${tStart}" d="${segDur}" wp="${ghostWpId}" ws="0"><s p="${ghostPrePenId}">${escX2(sungText)}</s><s p="${ghostPenId}">${escX2(unsungText)}</s></p>`);
            else if(sungText)lines.push(`<p t="${tStart}" d="${segDur}" wp="${ghostWpId}" ws="0"><s p="${ghostPrePenId}">${escX2(sungText)}</s></p>`);
          }
          cumMs+=syl.durMs;
        });
        // Ghost fade-out frames
        if(fadeOut>0){
          const fullText=syls.map(sv=>sv.text).join('');
          let t=mirKFadeOutStart;
          for(const step of outStepsMirK){
            if(t+step.ms>s.endMs)break;
            const gfpid=getGhostFadePenK(step.fo);
            lines.push(`<p t="${t}" d="${step.ms}" wp="${ghostWpId}" ws="0"><s p="${gfpid}">${escX2(fullText)}</s></p>`);
            t+=step.ms;
          }
        }
      } else {
        // Static mirror simple — apply fade to ghost if fade is present
        if (fadeIn > 0 || fadeOut > 0) {
          const inStepsMir = buildFadeSteps(fadeIn, 'in');
          const outStepsMir = buildFadeSteps(fadeOut, 'out');
          // Helper: get a ghost pen at a given raw fo (0-254), scaled by opacityFrac
          function getGhostFadePen(rawFo) {
            const fadeFo = Math.round(rawFo * opacityFrac);
            const foPercent = Math.round(fadeFo / 254 * 100);
            const k = JSON.stringify({ ...s.style, _fc: s.style.textColor, _fo: foPercent, bgAlpha: ghostBgAlpha });
            getPenId(k);
            return penIndex.get(k) ?? ghostPenId;
          }
          let gMainStart = s.startMs;
          if (fadeIn > 0) {
            let t = s.startMs;
            for (const step of inStepsMir) {
              const gfpid = getGhostFadePen(step.fo);
              lines.push(`<p t="${t}" d="${step.ms}" wp="${ghostWpId}" ws="0"><s p="${gfpid}">${escX2(mirDisplayText)}</s></p>`);
              t += step.ms;
            }
            gMainStart = t;
          }
          const gFadeOutStart = (fadeOut > 0) ? Math.max(gMainStart, s.endMs - fadeOut) : s.endMs;
          const gMainD = Math.max(1, gFadeOutStart - gMainStart);
          lines.push(`<p t="${gMainStart}" d="${gMainD}" wp="${ghostWpId}" ws="0"><s p="${ghostPenId}">${escX2(mirDisplayText)}</s></p>`);
          if (fadeOut > 0) {
            let t = gFadeOutStart;
            for (const step of outStepsMir) {
              if (t + step.ms > s.endMs) break;
              const gfpid = getGhostFadePen(step.fo);
              lines.push(`<p t="${t}" d="${step.ms}" wp="${ghostWpId}" ws="0"><s p="${gfpid}">${escX2(mirDisplayText)}</s></p>`);
              t += step.ms;
            }
          }
        } else {
          lines.push(`<p t="${s.startMs}" d="${subDur}" wp="${ghostWpId}" ws="0"><s p="${ghostPenId}">${escX2(mirDisplayText)}</s></p>`);
        }
      }
    }
  });

  // Build pensXml and wpsXml AFTER all line emission so every pen/wp
  // registered during export (e.g. on-the-fly ghost fade pens, late mirror positions)
  // is included in the header.
  const pensXml=penKeys.map((k,id)=>penXmlFromKey(k,id)).join('\n  ');
  let wpsXml='';
  wpMap.forEach(({id,ap},key)=>{
    const[ah,av]=key.split(',').map(Number);
    wpsXml+=`<wp id="${id}" ap="${ap}" ah="${ah}" av="${av}" />`;
  });
  const bodyXml=lines.join('\n');
  const _rawYtt=`<?xml version="1.0" encoding="utf-8"?><timedtext format="3"><head>${pensXml}${wsXml}${wpsXml}</head><body>${bodyXml}</body></timedtext>`;
  return _wrapYTTWithSig(_rawYtt);
};



// ═══════════════ BOX SELECT ════════════════