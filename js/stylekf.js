// ═══════════════ STYLE KEYFRAMES ════════════════
// Per-property animated style keyframes for subtitle blocks.
//
// Data shape: sub.styleKfs = { frames: [{ms, textColor?, textAlpha?, fontSize?, outlineColor?, outlineAlpha?}] }
//   ms = milliseconds relative to sub.startMs
//
// Dot buttons in inspector allow recording a keyframe for a property group at the
// current playhead position. On YTT export, the sub is expanded into 10fps segments,
// each with the interpolated style, producing smooth color/size animation on YouTube.
// Only applies to plain subs — ignored on subs that also have Move or Karaoke effects.

function hasStyleKf(sub){
  return !!(sub&&sub.styleKfs&&sub.styleKfs.frames&&sub.styleKfs.frames.length>0);
}

// Linear interpolation between two #rrggbb hex colors at t (0–1).
function _lerpHex(c1,c2,t){
  if(!c1||!c2)return c1||c2||'#ffffff';
  const r1=parseInt(c1.slice(1,3),16),g1=parseInt(c1.slice(3,5),16),b1=parseInt(c1.slice(5,7),16);
  const r2=parseInt(c2.slice(1,3),16),g2=parseInt(c2.slice(3,5),16),b2=parseInt(c2.slice(5,7),16);
  const r=Math.round(r1+(r2-r1)*t),g=Math.round(g1+(g2-g1)*t),b=Math.round(b1+(b2-b1)*t);
  return '#'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');
}

// Return interpolated style overrides at msRel (ms from sub start).
// Only returns properties that have keyframes; caller merges with sub.style.
function getStyleKfAtMs(sub,msRel){
  if(!hasStyleKf(sub))return{};
  const frames=sub.styleKfs.frames;
  if(!frames.length)return{};
  const result={};
  ['textColor','textAlpha','fontSize','outlineColor','outlineAlpha'].forEach(prop=>{
    const pf=frames.filter(f=>f[prop]!==undefined);
    if(!pf.length)return;
    let lo=null,hi=null;
    for(let i=0;i<pf.length;i++){
      if(pf[i].ms<=msRel)lo=pf[i];
      if(pf[i].ms>=msRel&&!hi)hi=pf[i];
    }
    if(!lo&&hi){result[prop]=hi[prop];return;}
    if(lo&&!hi){result[prop]=lo[prop];return;}
    if(lo===hi){result[prop]=lo[prop];return;}
    const t=(msRel-lo.ms)/Math.max(1,hi.ms-lo.ms);
    if(prop==='textColor'||prop==='outlineColor'){result[prop]=_lerpHex(lo[prop],hi[prop],t);}
    else{result[prop]=Math.round(lo[prop]+(hi[prop]-lo[prop])*t);}
  });
  return result;
}

// Property keys belonging to each UI group name.
function _skfGroupProps(group){
  if(group==='textColor')return['textColor','textAlpha'];
  if(group==='fontSize')return['fontSize'];
  if(group==='outlineColor')return['outlineColor','outlineAlpha'];
  return[];
}

// True if a keyframe exists at curMs (±50 ms) for the given group.
function hasStyleKfDotAt(sub,group){
  if(!sub||!sub.styleKfs)return false;
  const msRel=Math.max(0,Math.min(sub.endMs-sub.startMs,Math.round(curMs-sub.startMs)));
  const frame=sub.styleKfs.frames.find(f=>Math.abs(f.ms-msRel)<50);
  if(!frame)return false;
  return _skfGroupProps(group).some(p=>frame[p]!==undefined);
}

// Toggle: add keyframe at current time if absent, remove if present.
function toggleStyleKfDot(group){
  const sub=subs.find(s=>s.id===selId);if(!sub)return;
  const msRel=Math.max(0,Math.min(sub.endMs-sub.startMs,Math.round(curMs-sub.startMs)));
  snapshot();
  if(!sub.styleKfs)sub.styleKfs={frames:[]};
  const idx=sub.styleKfs.frames.findIndex(f=>Math.abs(f.ms-msRel)<50);
  const props=_skfGroupProps(group);
  if(idx>=0){
    // Remove this group's props from the frame; delete frame if empty.
    props.forEach(p=>delete sub.styleKfs.frames[idx][p]);
    if(!Object.keys(sub.styleKfs.frames[idx]).filter(k=>k!=='ms').length)
      sub.styleKfs.frames.splice(idx,1);
  } else {
    // Record current style values for this group.
    const frame={ms:msRel};
    if(group==='textColor'){
      frame.textColor=sub.style.textColor||'#ffffff';
      frame.textAlpha=sub.style.textAlpha!==undefined?sub.style.textAlpha:100;
    } else if(group==='fontSize'){
      frame.fontSize=sub.style.fontSize||100;
    } else if(group==='outlineColor'){
      frame.outlineColor=sub.style.outlineColor||'#000000';
      frame.outlineAlpha=sub.style.outlineAlpha!==undefined?sub.style.outlineAlpha:100;
    }
    sub.styleKfs.frames.push(frame);
    sub.styleKfs.frames.sort((a,b)=>a.ms-b.ms);
  }
  if(!sub.styleKfs.frames.length)delete sub.styleKfs;
  _updKfDotBtns(sub);
  chkYtt();
}

// Update the filled/hollow visual state of all three kf-dot buttons.
function _updKfDotBtns(sub){
  ['textColor','fontSize','outlineColor'].forEach(group=>{
    const btn=document.getElementById('kf-'+group);
    if(!btn)return;
    const active=!!sub&&hasStyleKfDotAt(sub,group);
    btn.classList.toggle('active',active);
    btn.title=active
      ?'◆ Keyframe at current time — click to remove'
      :'Add keyframe for '+(group==='textColor'?'text color':group==='fontSize'?'font size':'outline color')+' at current time';
  });
}

// ── buildYTT monkey-patch ────────────────────────────────────────────────────
// For plain subs with styleKfs (no Move, no Karaoke), expand the subtitle into
// 10fps frame segments, each with an interpolated style applied, before the
// normal buildYTT pipeline processes them.  This produces multiple overlapping
// <p> elements on export — the same technique used by the Fade effect — giving
// smooth animated color and size transitions that play on YouTube.
const _origBuildYTT_skf=buildYTT;
buildYTT=function(sorted){
  const expanded=[];
  sorted.forEach(s=>{
    // Only expand plain subs; Move/Karaoke/FadeWorks/Shake subs pass through unchanged.
    if(!hasStyleKf(s)||hasMove(s)||hasKaraoke(s)||s.fadeworks||s.shake){expanded.push(s);return;}
    const FPS=10;
    const frameDurMs=1000/FPS;
    const totalDur=Math.max(1,s.endMs-s.startMs);
    let t=0;
    while(t<totalDur){
      const segEnd=Math.min(t+frameDurMs,totalDur);
      const interp=getStyleKfAtMs(s,t);
      // Build virtual sub: same identity but with interpolated style and no styleKfs
      // so it doesn't recurse.  Preserve all other effects (fade, mirror, reverse).
      expanded.push({
        ...s,
        startMs:s.startMs+Math.round(t),
        endMs:s.startMs+Math.round(segEnd),
        style:{...s.style,...interp},
        styleKfs:undefined,
      });
      t+=frameDurMs;
    }
  });
  return _origBuildYTT_skf.call(this,expanded);
};
