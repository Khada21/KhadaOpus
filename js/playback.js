// ═══════════════ RAF + PERFORMANCE ════════════════
let _previewFps=30, _fpsInterval=1000/30, _lastOvRender=0;
function setPreviewFps(fps){
  _previewFps=fps;
  _fpsInterval=fps>0?1000/fps:0;
}

// Block map for fast hlActive — module scope so _hlActiveFast can access it
const _blockMap=new Map();
function _rebuildBlockMap(){
  _blockMap.clear();
  document.querySelectorAll('.sub-block').forEach(el=>{if(el.dataset.id)_blockMap.set(el.dataset.id,el);});
}
window._rebuildBlockMap=_rebuildBlockMap;

// Persistent overlay div pool — keyed by sub.id
const _ovPool={};

function _getOvEl(subId){
  if(_ovPool[subId])return _ovPool[subId];
  const el=document.createElement('div');
  el.className='sub-overlay';
  el.dataset.subId=subId;
  el.style.cssText='position:absolute;pointer-events:none;border-radius:2px;padding:5px 14px;max-width:82%;text-align:center;white-space:pre-wrap;will-change:transform,left,top;';
  _ovPool[subId]=el;
  return el;
}

// Cache for non-position style strings per sub — only rebuild when style changes
const _ovStyleCache={};

function _getBaseStyle(s,gi,kfOverrides,baseFontPx){
  if(baseFontPx==null)baseFontPx=16;
  const st=kfOverrides?{...s.style,...kfOverrides}:s.style;
  const oa=st.outlineAlpha??0;
  const ot=st.outlineType??0;
  const hasOutline=oa>0&&ot>0;
  const sz=st.outlineSize||3;
  const oc=st.outlineColor||'#000000';
  const shadowCss=hasOutline
    ?`;text-shadow:${sz}px 0 0 ${ha(oc,oa)},-${sz}px 0 0 ${ha(oc,oa)},0 ${sz}px 0 ${ha(oc,oa)},0 -${sz}px 0 ${ha(oc,oa)},${sz}px ${sz}px 0 ${ha(oc,oa)},-${sz}px ${sz}px 0 ${ha(oc,oa)},${sz}px -${sz}px 0 ${ha(oc,oa)},-${sz}px -${sz}px 0 ${ha(oc,oa)}`
    :'';
  const kfKey=kfOverrides?`;kf${JSON.stringify(kfOverrides)}`:'';
  const key=`${s.id}_${st.bold}_${st.italic}_${st.underline}_${st.font}_${st.fontSize}_${st.textColor}_${st.textAlpha}_${st.bgColor}_${st.bgAlpha}_${oa}_${ot}_${sz}_${oc}_${gi}_bfp${baseFontPx}${kfKey}`;
  if(_ovStyleCache[s.id]===key)return null;
  _ovStyleCache[s.id]=key;
  return `z-index:${20+gi};font-weight:${st.bold?700:400};font-style:${st.italic?'italic':'normal'};text-decoration:${st.underline?'underline':'none'};background:${ha(st.bgColor,st.bgAlpha)};font-family:'${st.font}',sans-serif;font-size:${baseFontPx*(st.fontSize/100)}px;color:${ha(st.textColor,st.textAlpha)}${shadowCss}`;
}

const posCSS_map={
  1:{bottom:'8px',left:'5%',right:'',top:'',transform:'none'},
  2:{bottom:'8px',left:'50%',right:'',top:'',transform:'translateX(-50%)'},
  3:{bottom:'8px',right:'5%',left:'auto',top:'',transform:'none'},
  4:{top:'50%',left:'5%',right:'',bottom:'',transform:'translateY(-50%)'},
  5:{top:'50%',left:'50%',right:'',bottom:'',transform:'translate(-50%,-50%)'},
  6:{top:'50%',right:'5%',left:'auto',bottom:'',transform:'translateY(-50%)'},
  7:{top:'8px',left:'5%',right:'',bottom:'',transform:'none'},
  8:{top:'8px',left:'50%',right:'',bottom:'',transform:'translateX(-50%)'},
  9:{top:'8px',right:'5%',left:'auto',bottom:'',transform:'none'}
};

function startRaf(){
  let last=performance.now();
  const phEl=document.getElementById('tl-ph');
  const curTEl=document.getElementById('cur-t');
  const tcEl=document.getElementById('tl-tc');
  const scEl=document.getElementById('tl-scroll');
  const vwrap=document.getElementById('vwrap');

  // Invalidate style cache when vwrap resizes so font scales update immediately
  if(typeof ResizeObserver!=='undefined'){
    new ResizeObserver(()=>{ Object.keys(_ovStyleCache).forEach(k=>delete _ovStyleCache[k]); }).observe(vwrap);
  }

  (function loop(now){
    const dt=now-last;last=now;

    if(player&&player._video){
      const ct=player._video.currentTime*1000;
      if(isFinite(ct)) curMs=ct;
    } else if(playing){
      curMs+=dt;
      if(curMs>=dur){curMs=dur;playing=false;document.getElementById('play-icon').textContent='▶';}
    }

    // ── Playhead ──
    const x=ms2x(curMs);
    phEl.style.transform=`translateX(${x}px)`;
    if(_justSeeked){scEl&&(scEl.scrollLeft=Math.max(0,x-scEl.clientWidth/2));_justSeeked=false;}
    else if(scEl&&x>scEl.scrollLeft+scEl.clientWidth*.8){scEl.scrollLeft=x-scEl.clientWidth*.2;}

    // ── Timecode (always) ──
    curTEl.textContent=msToDisp(curMs);
    tcEl.textContent=msToHMS(curMs);

    // ── Overlay + hlActive throttled by FPS ──
    const sinceLastOv=now-_lastOvRender;
    if(_fpsInterval===0||sinceLastOv>=_fpsInterval){
      _lastOvRender=now;
      _updOvFast(vwrap);
      _hlActiveFast();
    }

    raf=requestAnimationFrame(loop);
  })(performance.now());
}

// Get display text for a subtitle — respects reverse.text effect
function _getDisplayText(sub){
  if(sub && sub.reverse && sub.reverse.text){
    return [...sub.text].reverse().join('');
  }
  return sub ? sub.text : '';
}

function _updOvFast(vwrap){
  const baseFontPx=Math.max(8,Math.round((vwrap.offsetHeight||360)*0.0444));
  const active=subs.filter(s=>curMs>=s.startMs&&curMs<=s.endMs);
  const activeIds=new Set(active.map(s=>s.id));

  // Hide divs for subs no longer active
  Object.keys(_ovPool).forEach(id=>{
    if(!activeIds.has(id)&&_ovPool[id].parentNode){
      _ovPool[id].parentNode.removeChild(_ovPool[id]);
      delete _ovStyleCache[id];
    }
  });

  // Update kf-dot buttons for selected sub every tick (even when sub not currently active)
  if(selId&&typeof _updKfDotBtns==='function'&&typeof hasStyleKf==='function'){
    const _ss=subs.find(s=>s.id===selId);
    if(_ss&&hasStyleKf(_ss))_updKfDotBtns(_ss);
  }

  if(!active.length)return;
  active.sort((a,b)=>a.track-b.track);

  active.forEach((s,gi)=>{
    const el=_getOvEl(s.id);

    // Apply style keyframe interpolation for preview
    let kfOverrides=null;
    if(typeof hasStyleKf==='function'&&hasStyleKf(s)&&typeof hasMove==='function'&&!hasMove(s)&&typeof hasKaraoke==='function'&&!hasKaraoke(s)){
      const msRel=Math.max(0,Math.min(s.endMs-s.startMs,curMs-s.startMs));
      kfOverrides=getStyleKfAtMs(s,msRel);
      if(kfOverrides&&!Object.keys(kfOverrides).length)kfOverrides=null;
    }
    const st=kfOverrides?{...s.style,...kfOverrides}:s.style;

    // Append if not in DOM
    if(!el.parentNode)vwrap.appendChild(el);

    // Update style only if changed
    const newBase=_getBaseStyle(s,gi,kfOverrides,baseFontPx);
    if(newBase)el.style.cssText='position:absolute;pointer-events:none;border-radius:2px;padding:5px 14px;max-width:82%;text-align:center;white-space:pre-wrap;will-change:transform;'+newBase;

    // ── Position — always clear all props first to avoid stale values ──
    el.style.left=''; el.style.right=''; el.style.top=''; el.style.bottom=''; el.style.transform='';
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
      el.style.left=mx.toFixed(2)+'%';
      el.style.top=my.toFixed(2)+'%';
      el.style.transform='translate(-50%,-50%)';
    } else if(st.customX!=null&&st.customY!=null){
      el.style.left=st.customX+'%';
      el.style.top=st.customY+'%';
      el.style.transform='translate(-50%,-50%)';
    } else {
      const pc=posCSS_map[st.position||2]||posCSS_map[2];
      el.style.left=pc.left||'';
      el.style.right=pc.right||'';
      el.style.top=pc.top||'';
      el.style.bottom=pc.bottom||'';
      el.style.transform=pc.transform||'';
    }

    // ── Text / karaoke — only update when needed ──
    if(hasKaraoke(s)){
      const kd=s.karaoke,syls=kd.syllables;
      const elapsed=curMs-s.startMs;
      const mainColor=ha(st.textColor,st.textAlpha);
      const preColor=ha(kd.preColor||'#5046EC',kd.preAlpha??100);
      const revTiming=s.reverse&&s.reverse.timing;
      const displaySyls=revTiming?[...syls].reverse():syls;
      let cumMs=0,asi=-1;
      for(let i=0;i<displaySyls.length;i++){if(elapsed>=cumMs&&elapsed<cumMs+displaySyls[i].durMs){asi=i;break;}cumMs+=displaySyls[i].durMs;}
      if(asi===-1&&elapsed>=cumMs)asi=displaySyls.length;
      let html='';
      if(kd.animation==='ytk-fade'){
        // YTK Fade: preColor=unsunk, mainColor=sung, active syl interpolates preColor→mainColor
        const _ytkSteps=kd.animSpeed||4;
        let cumMs2=0;
        displaySyls.forEach((syl,i)=>{
          if(i<asi){
            html+=`<span style="color:${mainColor}">${escH(syl.text)}</span>`;
          } else if(i===asi){
            const sylElapsed=elapsed-cumMs2;
            const N=Math.min(_ytkSteps,Math.floor(Math.max(1,syl.durMs)/67));
            const step=Math.min(N,Math.floor(sylElapsed/67));
            const t=N>0?step/_ytkSteps:1;
            const pc=kd.preColor||'#5046EC';
            const mc=st.textColor||'#ffffff';
            const blended=typeof _lerpHex==='function'?_lerpHex(pc,mc,t):pc;
            html+=`<span style="color:${ha(blended,kd.preAlpha??100)}">${escH(syl.text)}</span>`;
          } else {
            html+=`<span style="color:${preColor}">${escH(syl.text)}</span>`;
          }
          cumMs2+=syl.durMs;
        });
      } else if(kd.animation==='reveal'){
        // Reveal: unsunk=invisible, active syl fades opacity 0→100%, sung=mainColor
        const _revSteps=kd.animSpeed||4;
        let cumMs2=0;
        displaySyls.forEach((syl,i)=>{
          if(i<asi){
            html+=`<span style="color:${mainColor}">${escH(syl.text)}</span>`;
          } else if(i===asi){
            const sylElapsed=elapsed-cumMs2;
            const N=Math.min(_revSteps,Math.floor(Math.max(1,syl.durMs)/67));
            const step=Math.min(N,Math.floor(sylElapsed/67));
            const opacity=N>0?(step/_revSteps):1;
            const mc=st.textColor||'#ffffff';
            html+=`<span style="color:${mc};opacity:${opacity.toFixed(3)}">${escH(syl.text)}</span>`;
          } else {
            html+=`<span style="opacity:0;color:${mainColor}">${escH(syl.text)}</span>`;
          }
          cumMs2+=syl.durMs;
        });
      } else {
        // Normal karaoke: preColor=unsunk (pre-karaoke), mainColor=sung (post-karaoke)
        displaySyls.forEach((syl,i)=>{html+=`<span style="color:${i<asi?mainColor:preColor}">${escH(syl.text)}</span>`;});
      }
      el.innerHTML=html;
    } else if(typeof hasFadeWorks==='function'&&hasFadeWorks(s)){
      // ── FadeWorks preview: per-character opacity spans ──
      const fw=s.fadeworks;
      const msRel=Math.max(0,curMs-s.startMs);
      const totalDur=Math.max(1,s.endMs-s.startMs);
      const fwMode=fw.mode||'both';
      const fwDir=fw.direction||'ltr';
      const effectiveIn=fwMode==='out-only'?0:Math.max(0,fw.inMs||0);
      const effectiveOut=fwMode==='in-only'?0:Math.max(0,fw.outMs||0);
      const fwHoldMs=Math.max(0,totalDur-effectiveIn-effectiveOut);
      const fwOutStart=effectiveIn+fwHoldMs;
      const FW_TRAIL=3;
      const FW_ALPHAS=[0,0.17,0.5,0.83,1.0];
      function _fwEasePrev(t2,ac,dc){
        const a=1+(ac||0)*2,d=1+(dc||0)*2;
        if((ac||0)>0.01&&(dc||0)>0.01)return t2<0.5?Math.pow(2*t2,a)/2:1-Math.pow(2*(1-t2),d)/2;
        if((ac||0)>0.01)return Math.pow(t2,a);
        if((dc||0)>0.01)return 1-Math.pow(1-t2,d);
        return t2;
      }
      const rawChars=[..._getDisplayText(s)];
      const sweepChars=fwDir==='rtl'?rawChars.slice().reverse():rawChars;
      const nc=sweepChars.length;
      let phase='hold',ci=0;
      if(msRel<effectiveIn&&effectiveIn>0){
        phase='reveal';
        ci=Math.max(0,Math.min(nc,Math.floor(_fwEasePrev(msRel/effectiveIn,fw.accel||0,fw.decel||0)*nc)));
      } else if(msRel>=fwOutStart&&effectiveOut>0){
        phase='hide';
        ci=Math.max(0,Math.min(nc,Math.floor(_fwEasePrev((msRel-fwOutStart)/effectiveOut,fw.accel||0,fw.decel||0)*nc)));
      }
      // Build alpha per sweep-order char, then map back to display order
      const sweepAlphas=sweepChars.map((_,i)=>{
        if(phase==='hold')return 1;
        if(phase==='reveal'){
          if(i<ci-FW_TRAIL)return 1;
          const ti=i-(ci-FW_TRAIL);
          return(ti>=0&&ti<FW_TRAIL)?FW_ALPHAS[FW_TRAIL-ti]:0;
        }
        if(i<ci)return 0;
        const ti=i-ci;
        return ti<FW_TRAIL?FW_ALPHAS[ti+1]:1;
      });
      const curColor=ha(st.textColor||'#ffffff',st.textAlpha!==undefined?st.textAlpha:100);
      el.innerHTML=rawChars.map((ch,i)=>{
        const j=fwDir==='rtl'?nc-1-i:i;
        const a=sweepAlphas[j]!==undefined?sweepAlphas[j]:1;
        if(a>=1)return`<span style="color:${curColor}">${escH(ch)}</span>`;
        if(a<=0)return`<span style="color:${curColor};opacity:0">${escH(ch)}</span>`;
        return`<span style="color:${curColor};opacity:${a.toFixed(3)}">${escH(ch)}</span>`;
      }).join('');
    } else {
      const displayText=_getDisplayText(s);
      if(el.textContent!==displayText){el.textContent=displayText;}
    }

    // ── Shake preview: translate jitter ──
    if(typeof hasShake==='function'&&hasShake(s)){
      const sk=s.shake;
      const radius=Math.max(1,Math.min(20,sk.radius||5));
      const intensity=Math.max(1,Math.min(10,sk.intensity||5));
      const phase=(s.startMs%6284)*0.001;
      const t=curMs*0.003*(0.5+intensity*0.1);
      const dx=Math.sin(t*13.7+phase)*radius*1.2;
      const dy=Math.cos(t*11.3+phase*1.3)*radius*0.5;
      el.style.transform=(el.style.transform&&el.style.transform!=='none'?el.style.transform+' ':'')+`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
    }

    // ── Chroma preview: RGB text-shadow aberration ──
    if(typeof hasChroma==='function'&&hasChroma(s)){
      const chr=s.chroma;
      const offset=Math.max(1,chr.offset||4);
      const flashMs=chr.flashMs!==undefined?chr.flashMs:100;
      const msRel=curMs-s.startMs;
      const totalDur=Math.max(1,s.endMs-s.startMs);
      const inFlash=flashMs===0||msRel<flashMs||msRel>totalDur-flashMs;
      // Recompute full textShadow (outline + optional chroma) to avoid stale state
      const oa=st.outlineAlpha??0,ot2=st.outlineType??0;
      const sz=st.outlineSize||3,oc=st.outlineColor||'#000000';
      const hasOut=oa>0&&ot2>0;
      const outParts=hasOut?[
        `${sz}px 0 0 ${ha(oc,oa)}`,`-${sz}px 0 0 ${ha(oc,oa)}`,
        `0 ${sz}px 0 ${ha(oc,oa)}`,`0 -${sz}px 0 ${ha(oc,oa)}`,
        `${sz}px ${sz}px 0 ${ha(oc,oa)}`,`-${sz}px ${sz}px 0 ${ha(oc,oa)}`,
        `${sz}px -${sz}px 0 ${ha(oc,oa)}`,`-${sz}px -${sz}px 0 ${ha(oc,oa)}`
      ]:[];
      const px=Math.max(1,Math.round(offset*0.5));
      const chrParts=inFlash?[`-${px}px 0 rgba(255,0,0,.55)`,`${px}px 0 rgba(0,0,255,.55)`]:[];
      el.style.textShadow=[...outParts,...chrParts].join(', ');
    }
  });

  // Render mirror ghosts for active subs that have mirror effect
  // First remove stale ghosts
  vwrap.querySelectorAll('.sub-mirror-ghost').forEach(g=>{
    if(!activeIds.has(g.dataset.mirrorFor))g.remove();
  });
  active.forEach(s=>{
    if(!hasMirror(s))return;
    // Remove old ghost and redraw (cheap, ghosts are simple)
    vwrap.querySelectorAll(`.sub-mirror-ghost[data-mirror-for="${s.id}"]`).forEach(g=>g.remove());
    _renderMirrorOverlay(s,vwrap);
  });
}

function _hlActiveFast(){
  subs.forEach(s=>{
    const el=_blockMap.get(s.id);if(!el)return;
    const on=curMs>=s.startMs&&curMs<=s.endMs&&s.id!==selId&&!multi.has(s.id);
    if(on!==el._wasActive){el.classList.toggle('active',on);el._wasActive=on;}
  });
}

let _justSeeked=false;
function updOv(){_updOvFast(document.getElementById('vwrap'));} // compat shim
function hlActive(){_hlActiveFast();} // compat shim
function updPH(){
  const x=ms2x(curMs);
  document.getElementById('tl-ph').style.transform=`translateX(${x}px)`;
}

// ═══════════════ TRACKS ════════════════
// Auto-assign: given a subtitle, find the lowest track where it doesn't overlap anything else
function autoAssignTrack(sub){
  const others=subs.filter(s=>s.id!==sub.id);
  for(let t=0;t<20;t++){
    const col=others.filter(s=>s.track===t&&s.startMs<sub.endMs&&s.endMs>sub.startMs);
    if(!col.length)return t;
  }
  return 0;
}
// Rebuild tracks list from actual subs
function syncTracks(){
  const used=new Set(subs.map(s=>s.track));
  // Always keep at least track 0; pack tracks densely (no gaps)
  const max=subs.length?Math.max(...used):0;
  tracks=[];for(let i=0;i<=max;i++)tracks.push(i);
}
function ensureTrack(ti){
  if(!tracks.includes(ti)){tracks.push(ti);tracks.sort((a,b)=>a-b);}
}
function rebuildSidebar(){
  document.querySelectorAll('.tl-track-row.sub-track').forEach(e=>e.remove());
  document.querySelectorAll('.tl-track-lbl').forEach(e=>e.remove());
  const canvas=document.getElementById('tl-canvas'),audio=document.getElementById('audio-track'),sb=document.getElementById('tl-sidebar');
  tracks.forEach(ti=>{
    const row=document.createElement('div');
    row.className='tl-track-row sub-track';row.id=`tr-${ti}`;row.dataset.track=ti;
    canvas.insertBefore(row,audio);
    const lbl=document.createElement('div');
    lbl.className='tl-track-lbl';lbl.style.height='var(--track-h)';
    lbl.title=`Track ${ti+1}`;
    lbl.innerHTML=`<span class="tl-track-num">V${ti+1}</span>`;
    sb.appendChild(lbl);
  });
  const al=document.createElement('div');al.className='tl-track-lbl';al.style.height='var(--audio-h)';al.title='Audio';
  al.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 4v16M12 7v10M15 4v16M6 9v6M18 9v6M3 11v2M21 11v2" stroke-linecap="round"/></svg>';
  sb.appendChild(al);
}
function collapseEmpty(){
  // Re-pack: remove empty tracks (except 0), shift sub tracks down to fill gaps
  const used=new Set(subs.map(s=>s.track));
  const sorted=[...used].sort((a,b)=>a-b);
  const remap=new Map();sorted.forEach((t,i)=>remap.set(t,i));
  // Always keep track 0
  if(!remap.has(0))remap.set(0,0);
  subs.forEach(s=>{if(remap.has(s.track))s.track=remap.get(s.track);});
  syncTracks();rebuildSidebar();renderTL();
}

// ═══════════════ TIMELINE ════════════════