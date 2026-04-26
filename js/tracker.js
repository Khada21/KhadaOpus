// ═══════════════ TRACKER EFFECT ═══════════════
// Auto-tracks an object in the video and generates Move keyframes.

let trackerEditId = null;
let _trackerSelectMode = false;
let _trackerSelectStart = null;
let _trackerSel = null; // {x,y,w,h} fractional vwrap coords

function hasTracker(sub){ return !!(sub && sub.tracker); }

function applyTrackerToSub(sub){
  if(hasTracker(sub)) return;
  sub.tracker = { frameCount:10, trackSize:false, keyframes:[], sel:null };
  renderBlocks(); renderSL(); chkYtt();
}

function removeTrackerFromSub(sub){
  if(!sub) return;
  snapshot();
  if(sub.tracker && sub.tracker._generatedMove) delete sub.move;
  delete sub.tracker;
  renderBlocks(); renderSL(); chkYtt();
  closeTrackerEditor();
}

function openTrackerEditor(id){
  let panelH = 300;
  const insp  = document.getElementById('inspector');
  const karaEd= document.getElementById('kara-editor');
  const moveEd= document.getElementById('move-editor');
  const mirEd = document.getElementById('mirror-editor');
  const fadEd = document.getElementById('fade-editor');
  const revEd = document.getElementById('reverse-editor');
  const chrEd = document.getElementById('chroma-editor');
  const fwEd  = document.getElementById('fadeworks-editor');
  const skEd  = document.getElementById('shake-editor');
  const trkEd = document.getElementById('tracker-editor');

  // Close whichever is open and steal its height
  if(karaEditId){ if(karaEd&&karaEd.offsetHeight>0)panelH=karaEd.offsetHeight; closeKaraEditor(); }
  else if(moveEditId){ if(moveEd&&moveEd.offsetHeight>0)panelH=moveEd.offsetHeight; closeMoveEditor(); }
  else if(mirrorEditId){ if(mirEd&&mirEd.offsetHeight>0)panelH=mirEd.offsetHeight; closeMirrorEditor(); }
  else if(fadeEditId){ if(fadEd&&fadEd.offsetHeight>0)panelH=fadEd.offsetHeight; closeFadeEditor(); }
  else if(reverseEditId){ if(revEd&&revEd.offsetHeight>0)panelH=revEd.offsetHeight; closeReverseEditor(); }
  else if(typeof chromaEditId!=='undefined'&&chromaEditId){ if(chrEd&&chrEd.offsetHeight>0)panelH=chrEd.offsetHeight; closeChromaEditor(); }
  else if(typeof fadeWorksEditId!=='undefined'&&fadeWorksEditId){ if(fwEd&&fwEd.offsetHeight>0)panelH=fwEd.offsetHeight; closeFadeWorksEditor(); }
  else if(typeof shakeEditId!=='undefined'&&shakeEditId){ if(skEd&&skEd.offsetHeight>0)panelH=skEd.offsetHeight; closeShakeEditor(); }
  else if(trackerEditId&&trackerEditId!==id){ if(trkEd&&trkEd.offsetHeight>0)panelH=trkEd.offsetHeight; closeTrackerEditor(); }
  else{ if(insp&&insp.offsetHeight>0)panelH=insp.offsetHeight; }

  trackerEditId = id;
  insp.style.display = 'none';
  [karaEd,moveEd,mirEd,fadEd,revEd].forEach(el=>{if(el)el.style.display='none';});
  trkEd.style.display = 'flex';
  if(panelH>0){ trkEd.style.flex='none'; trkEd.style.height=panelH+'px'; }

  const sub = subs.find(s=>s.id===id);
  if(sub && sub.tracker){
    const tr = sub.tracker;
    const frIn = document.getElementById('tracker-frames');
    const frV  = document.getElementById('tracker-frames-v');
    const szCk = document.getElementById('tracker-size-chk');
    if(frIn) frIn.value = tr.frameCount||10;
    if(frV)  frV.textContent = tr.frameCount||10;
    if(szCk) szCk.checked = !!tr.trackSize;
    _trackerSel = tr.sel || null;
    _updTrackerSelStatus();
    _updTrackerRunBtn();
    const progEl = document.getElementById('tracker-progress');
    if(progEl){ progEl.style.display='none'; progEl.textContent=''; }
  }
  renderBlocks(); renderSL();
}

function closeTrackerEditor(){
  const trkEd = document.getElementById('tracker-editor');
  const insp  = document.getElementById('inspector');
  const h = trkEd ? trkEd.offsetHeight : 0;
  trackerEditId = null;
  _trackerExitSelect();
  if(trkEd) trkEd.style.display = 'none';
  insp.style.display = 'flex';
  insp.style.flex = 'none';
  if(h>0) insp.style.height = h+'px';
  renderBlocks(); renderSL();
}

function trackerSetFrames(v){
  const sub = subs.find(s=>s.id===trackerEditId); if(!sub||!sub.tracker)return;
  sub.tracker.frameCount = Math.max(2, Math.min(60, Math.round(v)));
  const el = document.getElementById('tracker-frames-v');
  if(el) el.textContent = sub.tracker.frameCount;
}

function trackerSetSize(v){
  const sub = subs.find(s=>s.id===trackerEditId); if(!sub||!sub.tracker)return;
  sub.tracker.trackSize = !!v;
}

function _updTrackerSelStatus(){
  const el = document.getElementById('tracker-sel-status'); if(!el)return;
  if(_trackerSel){
    el.textContent = `Region: ${Math.round(_trackerSel.x*100)}%,${Math.round(_trackerSel.y*100)}% · ${Math.round(_trackerSel.w*100)}%×${Math.round(_trackerSel.h*100)}%`;
    el.style.color = '#9c27b0';
  } else {
    el.textContent = 'No region selected — draw on video to pick object';
    el.style.color = '';
  }
}

function _updTrackerRunBtn(){
  const btn = document.getElementById('tracker-run-btn'); if(!btn)return;
  const ok = !!_trackerSel;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '.5';
  btn.style.cursor  = ok ? 'pointer' : 'default';
}

// ── Selection mode ──
function trackerEnterSelect(){
  if(!trackerEditId) return;
  _trackerSelectMode = true;
  const overlay = document.getElementById('tracker-sel-overlay');
  const canvas  = document.getElementById('tracker-sel-canvas');
  const rect    = overlay ? overlay.getBoundingClientRect() : {width:300,height:200};
  if(overlay){ overlay.style.display='block'; overlay.style.background='rgba(0,0,0,.15)'; }
  if(canvas){ canvas.style.display='block'; canvas.width=rect.width||300; canvas.height=rect.height||200; }
  const btn = document.getElementById('tracker-sel-btn');
  if(btn){
    btn.textContent='↩ Cancel';
    btn.style.cssText='width:100%;padding:6px;background:rgba(255,59,48,.08);border:1px solid rgba(255,59,48,.35);font-family:var(--mono);font-size:10px;color:var(--red);cursor:pointer;border-radius:2px';
    btn.onclick = ()=>_trackerExitSelect();
  }
}

function _trackerExitSelect(){
  _trackerSelectMode = false;
  _trackerSelectStart = null;
  const overlay = document.getElementById('tracker-sel-overlay');
  const canvas  = document.getElementById('tracker-sel-canvas');
  if(overlay){ overlay.style.display='none'; }
  if(canvas){
    canvas.style.display='none';
    const ctx = canvas.getContext('2d');
    if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  const btn = document.getElementById('tracker-sel-btn');
  if(btn){
    btn.textContent='◎ Draw Region on Video';
    btn.style.cssText='width:100%;padding:6px;background:rgba(156,39,176,.08);border:1px solid rgba(156,39,176,.35);font-family:var(--mono);font-size:10px;color:#9c27b0;cursor:pointer;border-radius:2px';
    btn.onclick = ()=>trackerEnterSelect();
  }
}

// ── Overlay mouse interactions ──
(function initTrackerOverlay(){
  function setup(){
    const overlay = document.getElementById('tracker-sel-overlay'); if(!overlay)return;

    overlay.addEventListener('mousedown', e=>{
      if(!_trackerSelectMode) return;
      e.preventDefault();
      const rect = overlay.getBoundingClientRect();
      _trackerSelectStart = { x:e.clientX-rect.left, y:e.clientY-rect.top, rw:rect.width, rh:rect.height };
    });

    overlay.addEventListener('mousemove', e=>{
      if(!_trackerSelectMode||!_trackerSelectStart) return;
      const canvas = document.getElementById('tracker-sel-canvas'); if(!canvas)return;
      const rect = overlay.getBoundingClientRect();
      const cx = e.clientX-rect.left, cy = e.clientY-rect.top;
      canvas.width = rect.width; canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      // dim background
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      // clear selection rectangle
      const bx=Math.min(_trackerSelectStart.x,cx), by=Math.min(_trackerSelectStart.y,cy);
      const bw=Math.abs(cx-_trackerSelectStart.x), bh=Math.abs(cy-_trackerSelectStart.y);
      if(bw>2&&bh>2){
        ctx.clearRect(bx,by,bw,bh);
        ctx.strokeStyle='#9c27b0'; ctx.lineWidth=2; ctx.setLineDash([]);
        ctx.strokeRect(bx+1,by+1,bw-2,bh-2);
        const cs=8;
        ctx.fillStyle='#9c27b0';
        [[bx,by],[bx+bw-cs,by],[bx,by+bh-cs],[bx+bw-cs,by+bh-cs]].forEach(([rx,ry])=>ctx.fillRect(rx,ry,cs,cs));
      }
    });

    overlay.addEventListener('mouseup', e=>{
      if(!_trackerSelectMode||!_trackerSelectStart) return;
      const rect = overlay.getBoundingClientRect();
      const cx=e.clientX-rect.left, cy=e.clientY-rect.top;
      const bx=Math.min(_trackerSelectStart.x,cx), by=Math.min(_trackerSelectStart.y,cy);
      const bw=Math.abs(cx-_trackerSelectStart.x), bh=Math.abs(cy-_trackerSelectStart.y);
      _trackerSelectStart = null;
      if(bw<8||bh<8){ _trackerExitSelect(); return; }
      _trackerSel = { x:bx/rect.width, y:by/rect.height, w:bw/rect.width, h:bh/rect.height };
      const sub = subs.find(s=>s.id===trackerEditId);
      if(sub&&sub.tracker) sub.tracker.sel = {..._trackerSel};
      _trackerExitSelect();
      _updTrackerSelStatus();
      _updTrackerRunBtn();
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup); else setup();
})();

// ── Tracking algorithm ──
async function trackerRun(){
  const sub = subs.find(s=>s.id===trackerEditId); if(!sub||!sub.tracker) return;
  const tr = sub.tracker;
  const sel = _trackerSel || tr.sel;
  if(!sel){ alert('Draw a region on the video first'); return; }

  const video = document.getElementById('yt-player');
  if(!video||video.readyState<2||!video.videoWidth){
    alert('No video loaded — load a video first'); return;
  }

  const progEl = document.getElementById('tracker-progress');
  const runBtn = document.getElementById('tracker-run-btn');
  if(runBtn){ runBtn.disabled=true; runBtn.textContent='Tracking…'; runBtn.style.opacity='.7'; }
  if(progEl){ progEl.style.display='block'; progEl.style.color=''; progEl.textContent='Preparing…'; }

  const wasPlaying = typeof playing!=='undefined'&&playing;
  if(wasPlaying && typeof togglePlay==='function') togglePlay();

  try {
    const frameCount = tr.frameCount||10;
    const totalDur   = Math.max(1, sub.endMs-sub.startMs);
    const SCALE = 0.25;
    const VW = Math.max(8, Math.round(video.videoWidth*SCALE));
    const VH = Math.max(8, Math.round(video.videoHeight*SCALE));
    const canvas = document.createElement('canvas');
    canvas.width=VW; canvas.height=VH;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});

    const tx = Math.round(sel.x*VW);
    const ty = Math.round(sel.y*VH);
    const tw = Math.max(4, Math.round(sel.w*VW));
    const th = Math.max(4, Math.round(sel.h*VH));

    function seekP(ms){
      return new Promise(resolve=>{
        let done=false;
        function finish(){ if(done)return; done=true; video.removeEventListener('seeked',finish); resolve(); }
        video.addEventListener('seeked',finish);
        video.currentTime = ms/1000;
        setTimeout(finish, 2000); // 2s timeout
      });
    }

    // Capture template from first frame
    await seekP(sub.startMs);
    ctx.drawImage(video,0,0,VW,VH);
    const templateData = ctx.getImageData(tx,ty,tw,th).data;

    const keyframes=[];
    let lastX=tx, lastY=ty;
    const MARGIN = Math.round(Math.max(VW,VH)*0.2);

    for(let fi=0; fi<frameCount; fi++){
      const t = frameCount>1 ? fi/(frameCount-1) : 0;
      const frameMs = sub.startMs + t*totalDur;
      if(progEl) progEl.textContent = `Tracking frame ${fi+1}/${frameCount}…`;

      await seekP(frameMs);
      ctx.drawImage(video,0,0,VW,VH);
      const fd = ctx.getImageData(0,0,VW,VH).data;

      const sx=Math.max(0,lastX-MARGIN), sy=Math.max(0,lastY-MARGIN);
      const ex=Math.min(VW-tw,lastX+MARGIN), ey=Math.min(VH-th,lastY+MARGIN);

      let bestX=lastX, bestY=lastY, bestSAD=Infinity;

      // Coarse pass (step 3)
      for(let y=sy;y<=ey;y+=3){
        for(let x=sx;x<=ex;x+=3){
          let sad=0;
          for(let dy=0;dy<th;dy+=2){
            for(let dx=0;dx<tw;dx+=2){
              const ti=(dy*tw+dx)*4;
              const fi2=((y+dy)*VW+(x+dx))*4;
              sad+=Math.abs(templateData[ti]-fd[fi2])+Math.abs(templateData[ti+1]-fd[fi2+1])+Math.abs(templateData[ti+2]-fd[fi2+2]);
            }
          }
          if(sad<bestSAD){bestSAD=sad;bestX=x;bestY=y;}
        }
      }
      // Refine pass (step 1 around best)
      for(let y=Math.max(sy,bestY-4);y<=Math.min(ey,bestY+4);y++){
        for(let x=Math.max(sx,bestX-4);x<=Math.min(ex,bestX+4);x++){
          let sad=0;
          for(let dy=0;dy<th;dy+=2){
            for(let dx=0;dx<tw;dx+=2){
              const ti=(dy*tw+dx)*4;
              const fi2=((y+dy)*VW+(x+dx))*4;
              sad+=Math.abs(templateData[ti]-fd[fi2])+Math.abs(templateData[ti+1]-fd[fi2+1])+Math.abs(templateData[ti+2]-fd[fi2+2]);
            }
          }
          if(sad<bestSAD){bestSAD=sad;bestX=x;bestY=y;}
        }
      }

      const cx = (bestX+tw/2)/VW*100;
      const cy = (bestY+th/2)/VH*100;
      keyframes.push({ x:Math.round(cx*10)/10, y:Math.round(cy*10)/10, cp1x:cx, cp1y:cy, cp2x:cx, cp2y:cy, accel:0, decel:0, ease:'linear' });
      lastX=bestX; lastY=bestY;
    }

    // Set catmull-rom bezier control points for smooth interpolation
    const n=keyframes.length;
    for(let i=0;i<n-1;i++){
      const p0=keyframes[i-1]||keyframes[i];
      const p1=keyframes[i];
      const p2=keyframes[i+1];
      const p3=keyframes[i+2]||keyframes[i+1];
      p1.cp1x=p1.x+(p2.x-p0.x)/6; p1.cp1y=p1.y+(p2.y-p0.y)/6;
      p2.cp2x=p2.x-(p3.x-p1.x)/6; p2.cp2y=p2.y-(p3.y-p1.y)/6;
    }
    // Endpoints: no tangent from outside
    if(n>0){
      keyframes[0].cp2x=keyframes[0].x; keyframes[0].cp2y=keyframes[0].y;
      keyframes[n-1].cp1x=keyframes[n-1].x; keyframes[n-1].cp1y=keyframes[n-1].y;
    }

    snapshot();
    tr.keyframes = keyframes;
    tr._generatedMove = !hasMove(sub);
    sub.move = { keyframes:[...keyframes.map(k=>({...k}))], exportFps:15 };
    chkYtt(); renderBlocks(); renderSL();

    if(progEl){
      progEl.textContent=`Done! ${n} keyframes generated. Open Move editor to preview/refine.`;
      progEl.style.color='#9c27b0';
    }
  } catch(err){
    console.error('Tracker error:',err);
    if(progEl){ progEl.textContent='Error: '+err.message; progEl.style.color='var(--red)'; }
  } finally {
    if(runBtn){ runBtn.disabled=false; runBtn.textContent='▶ Track Object'; runBtn.style.opacity='1'; }
  }
}

// ── DnD from effects panel ──
(function initTrackerDnd(){
  function setup(){
    const card=document.getElementById('fx-tracker-card'); if(!card)return;
    card.addEventListener('dragstart',e=>{
      e.dataTransfer.setData('text/plain','tracker-effect');
      e.dataTransfer.effectAllowed='copy';
    });
    document.addEventListener('drop',e=>{
      if(e.dataTransfer.getData('text/plain')!=='tracker-effect')return;
      const block=e.target.closest('.sub-block'); if(!block)return;
      e.preventDefault();
      const sub=subs.find(s=>s.id===block.dataset.id); if(!sub)return;
      snapshot();
      selId=sub.id; multi.clear();
      if(!hasTracker(sub))applyTrackerToSub(sub);
      openTrackerEditor(sub.id);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

// ── Patch renderBlocks: TR badge ──
const _origRenderBlocksTracker=renderBlocks;
renderBlocks=function(){
  _origRenderBlocksTracker.apply(this,arguments);
  subs.filter(s=>hasTracker(s)).forEach(s=>{
    const el=document.querySelector(`.sub-block[data-id="${s.id}"]`); if(!el)return;
    let badgeRow=el.querySelector('.blk-badge-row');
    if(!badgeRow){badgeRow=document.createElement('div');badgeRow.className='blk-badge-row';el.appendChild(badgeRow);}
    const tb=document.createElement('span');
    tb.className='blk-tr'+(trackerEditId===s.id?' active':'');
    tb.title='Tracker — click to edit'; tb.textContent='TR';
    tb.addEventListener('mousedown',e=>{e.stopPropagation();});
    tb.addEventListener('click',e=>{
      e.stopPropagation(); selId=s.id; multi.clear();
      if(trackerEditId===s.id){closeTrackerEditor();}else{openTrackerEditor(s.id);}
    });
    badgeRow.appendChild(tb);
  });
};

// ── Patch renderSL: TR sidebar badge ──
const _origRenderSLTracker=renderSL;
renderSL=function(){
  _origRenderSLTracker.apply(this,arguments);
  subs.filter(s=>hasTracker(s)).forEach(s=>{
    const el=document.querySelector(`.sl-item[data-id="${s.id}"]`);
    if(!el||el.querySelector('.sl-tr-btn'))return;
    const tb=document.createElement('button');
    tb.className='sl-tr-btn'+(trackerEditId===s.id?' active':'');
    tb.title='Edit Tracker'; tb.textContent='TR';
    tb.onclick=ev=>{
      ev.stopPropagation(); selId=s.id; multi.clear();
      if(trackerEditId===s.id){closeTrackerEditor();}else{openTrackerEditor(s.id);}
    };
    el.appendChild(tb);
  });
};

// ── Close tracker when other editors open ──
(function patchEditorOpensForTracker(){
  ['openKaraEditor','openMoveEditor','openMirrorEditor','openFadeEditor',
   'openReverseEditor','openChromaEditor','openFadeWorksEditor','openShakeEditor'].forEach(fn=>{
    if(typeof window[fn]==='function'){
      const orig=window[fn];
      window[fn]=function(...args){
        if(trackerEditId)closeTrackerEditor();
        return orig.apply(this,args);
      };
    }
  });
})();
