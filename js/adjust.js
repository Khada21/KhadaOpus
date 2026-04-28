// ═══════════════ ADJUST EFFECT ════════════════
// Animates style properties (size, colors, alpha) over a time window within a subtitle.
// sub.adjust = { startMs, endMs, ease, toSize, toTextColor, toTextAlpha, toBgColor, toBgAlpha }

let adjustEditId=null;

function hasAdjust(sub){
  if(!sub||!sub.adjust)return false;
  const a=sub.adjust;
  return a.toSize!=null||a.toTextColor!=null||a.toTextAlpha!=null||a.toBgColor!=null||a.toBgAlpha!=null||a.toOutlineColor!=null||a.toOutlineAlpha!=null||a.toOutlineSize!=null;
}

function _adjEase(t,ease){
  t=Math.max(0,Math.min(1,t));
  if(ease==='ease-in')return t*t;
  if(ease==='ease-out')return t*(2-t);
  if(ease==='ease-in-out')return t<0.5?2*t*t:-1+(4-2*t)*t;
  return t;
}

function getAdjustAtMs(s,msRel){
  if(!hasAdjust(s))return null;
  const a=s.adjust;
  const subDur=Math.max(1,s.endMs-s.startMs);
  const adjStart=a.startMs||0;
  const adjEnd=a.endMs!=null?a.endMs:subDur;
  const st=s.style;
  const result={};
  function lerp(from,to,t){return from+(to-from)*t;}
  if(msRel>=adjEnd){
    if(a.toSize!=null)result.fontSize=a.toSize;
    if(a.toTextColor!=null)result.textColor=a.toTextColor;
    if(a.toTextAlpha!=null)result.textAlpha=a.toTextAlpha;
    if(a.toBgColor!=null)result.bgColor=a.toBgColor;
    if(a.toBgAlpha!=null)result.bgAlpha=a.toBgAlpha;
    if(a.toOutlineColor!=null)result.outlineColor=a.toOutlineColor;
    if(a.toOutlineAlpha!=null)result.outlineAlpha=a.toOutlineAlpha;
    if(a.toOutlineSize!=null)result.outlineSize=a.toOutlineSize;
  }else if(msRel>adjStart){
    const t=(msRel-adjStart)/Math.max(1,adjEnd-adjStart);
    const et=_adjEase(t,a.ease||'linear');
    if(a.toSize!=null)result.fontSize=Math.round(lerp(st.fontSize||100,a.toSize,et));
    if(a.toTextColor!=null)result.textColor=_lerpHex(st.textColor||'#ffffff',a.toTextColor,et);
    if(a.toTextAlpha!=null)result.textAlpha=Math.round(lerp(st.textAlpha!==undefined?st.textAlpha:100,a.toTextAlpha,et));
    if(a.toBgColor!=null)result.bgColor=_lerpHex(st.bgColor||'#000000',a.toBgColor,et);
    if(a.toBgAlpha!=null)result.bgAlpha=Math.round(lerp(st.bgAlpha!==undefined?st.bgAlpha:60,a.toBgAlpha,et));
    if(a.toOutlineColor!=null)result.outlineColor=_lerpHex(st.outlineColor||'#000000',a.toOutlineColor,et);
    if(a.toOutlineAlpha!=null)result.outlineAlpha=Math.round(lerp(st.outlineAlpha!==undefined?st.outlineAlpha:0,a.toOutlineAlpha,et));
    if(a.toOutlineSize!=null)result.outlineSize=Math.round(lerp(st.outlineSize!==undefined?st.outlineSize:3,a.toOutlineSize,et));
  }
  return Object.keys(result).length>0?result:null;
}

function applyAdjustToSub(sub){
  if(sub.adjust)return;
  sub.adjust={startMs:0,endMs:null,ease:'linear',toSize:null,toTextColor:null,toTextAlpha:null,toBgColor:null,toBgAlpha:null,toOutlineColor:null,toOutlineAlpha:null,toOutlineSize:null};
  renderBlocks();renderSL();chkYtt();
}

function removeAdjustFromSub(sub){
  if(!sub)return;
  snapshot();
  delete sub.adjust;
  renderBlocks();renderSL();chkYtt();
  closeAdjustEditor();
}

function openAdjustEditor(id){
  let panelH=300;
  const insp=document.getElementById('inspector');
  const karaEd=document.getElementById('kara-editor');
  const moveEd=document.getElementById('move-editor');
  const mirEd=document.getElementById('mirror-editor');
  const fadEd=document.getElementById('fade-editor');
  const adjEd=document.getElementById('adjust-editor');
  if(karaEditId){if(karaEd&&karaEd.offsetHeight>0)panelH=karaEd.offsetHeight;closeKaraEditor();}
  else if(moveEditId){if(moveEd&&moveEd.offsetHeight>0)panelH=moveEd.offsetHeight;closeMoveEditor();}
  else if(mirrorEditId){if(mirEd&&mirEd.offsetHeight>0)panelH=mirEd.offsetHeight;closeMirrorEditor();}
  else if(fadeEditId){if(fadEd&&fadEd.offsetHeight>0)panelH=fadEd.offsetHeight;closeFadeEditor();}
  else if(adjustEditId&&adjustEditId!==id){if(adjEd&&adjEd.offsetHeight>0)panelH=adjEd.offsetHeight;closeAdjustEditor();}
  else{if(insp&&insp.offsetHeight>0)panelH=insp.offsetHeight;}
  adjustEditId=id;
  insp.style.display='none';
  karaEd&&(karaEd.style.display='none');
  moveEd&&(moveEd.style.display='none');
  mirEd&&(mirEd.style.display='none');
  fadEd&&(fadEd.style.display='none');
  adjEd.style.display='flex';adjEd.style.flex='none';adjEd.style.height=Math.max(300,panelH)+'px';
  _syncAdjEditor();
  renderBlocks();renderSL();
}

function closeAdjustEditor(){
  const adjEd=document.getElementById('adjust-editor');
  const insp=document.getElementById('inspector');
  const h=adjEd?adjEd.offsetHeight:0;
  adjustEditId=null;
  if(adjEd)adjEd.style.display='none';
  insp.style.display='flex';insp.style.flex='none';
  if(h>0)insp.style.height=h+'px';
  renderBlocks();renderSL();
}

function _syncAdjEditor(){
  const sub=subs.find(s=>s.id===adjustEditId);if(!sub)return;
  if(!sub.adjust)return;
  const a=sub.adjust;
  const st=sub.style;
  const subDur=Math.max(1,sub.endMs-sub.startMs);
  document.getElementById('adj-start').value=a.startMs||0;
  document.getElementById('adj-end').value=a.endMs!=null?a.endMs:subDur;
  document.getElementById('adj-ease').value=a.ease||'linear';
  const _row=(id,on)=>{const el=document.getElementById(id);if(el)el.style.opacity=on?'1':'0.4';};
  const _val=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};
  // Size
  _val('adj-size-from',st.fontSize||100);
  _row('adj-size-row',a.toSize!=null);
  document.getElementById('adj-size-chk').checked=a.toSize!=null;
  _val('adj-size-to',a.toSize!=null?a.toSize:(st.fontSize||100));
  // Text color
  _val('adj-tc-from',st.textColor||'#ffffff');
  _row('adj-tc-row',a.toTextColor!=null);
  document.getElementById('adj-tc-chk').checked=a.toTextColor!=null;
  _val('adj-tc-to',a.toTextColor!=null?a.toTextColor:(st.textColor||'#ffffff'));
  // Text alpha
  _val('adj-ta-from',st.textAlpha!==undefined?st.textAlpha:100);
  _row('adj-ta-row',a.toTextAlpha!=null);
  document.getElementById('adj-ta-chk').checked=a.toTextAlpha!=null;
  _val('adj-ta-to',a.toTextAlpha!=null?a.toTextAlpha:(st.textAlpha!==undefined?st.textAlpha:100));
  // BG color
  _val('adj-bc-from',st.bgColor||'#000000');
  _row('adj-bc-row',a.toBgColor!=null);
  document.getElementById('adj-bc-chk').checked=a.toBgColor!=null;
  _val('adj-bc-to',a.toBgColor!=null?a.toBgColor:(st.bgColor||'#000000'));
  // BG alpha
  _val('adj-ba-from',st.bgAlpha!==undefined?st.bgAlpha:60);
  _row('adj-ba-row',a.toBgAlpha!=null);
  document.getElementById('adj-ba-chk').checked=a.toBgAlpha!=null;
  _val('adj-ba-to',a.toBgAlpha!=null?a.toBgAlpha:(st.bgAlpha!==undefined?st.bgAlpha:60));
  // Outline color
  _val('adj-oc-from',st.outlineColor||'#000000');
  _row('adj-oc-row',a.toOutlineColor!=null);
  document.getElementById('adj-oc-chk').checked=a.toOutlineColor!=null;
  _val('adj-oc-to',a.toOutlineColor!=null?a.toOutlineColor:(st.outlineColor||'#000000'));
  // Outline alpha
  _val('adj-oa-from',st.outlineAlpha!==undefined?st.outlineAlpha:0);
  _row('adj-oa-row',a.toOutlineAlpha!=null);
  document.getElementById('adj-oa-chk').checked=a.toOutlineAlpha!=null;
  _val('adj-oa-to',a.toOutlineAlpha!=null?a.toOutlineAlpha:(st.outlineAlpha!==undefined?st.outlineAlpha:0));
  // Outline size
  _val('adj-os-from',st.outlineSize!==undefined?st.outlineSize:3);
  _row('adj-os-row',a.toOutlineSize!=null);
  document.getElementById('adj-os-chk').checked=a.toOutlineSize!=null;
  _val('adj-os-to',a.toOutlineSize!=null?a.toOutlineSize:(st.outlineSize!==undefined?st.outlineSize:3));
}

function adjSetTime(which,v){
  const sub=subs.find(s=>s.id===adjustEditId);if(!sub||!sub.adjust)return;
  v=Math.max(0,+v);
  const subDur=Math.max(1,sub.endMs-sub.startMs);
  if(which==='start')sub.adjust.startMs=Math.min(v,subDur-1);
  else sub.adjust.endMs=(v>=subDur)?null:Math.max(1,v);
  chkYtt();
}

function adjSetEase(ease){
  const sub=subs.find(s=>s.id===adjustEditId);if(!sub||!sub.adjust)return;
  sub.adjust.ease=ease;chkYtt();
}

function adjToggleProp(prop,enabled){
  const sub=subs.find(s=>s.id===adjustEditId);if(!sub||!sub.adjust)return;
  const a=sub.adjust;const st=sub.style;
  if(!enabled){a[prop]=null;}
  else{
    if(prop==='toSize')a.toSize=st.fontSize||100;
    else if(prop==='toTextColor')a.toTextColor=st.textColor||'#ffffff';
    else if(prop==='toTextAlpha')a.toTextAlpha=st.textAlpha!==undefined?st.textAlpha:100;
    else if(prop==='toBgColor')a.toBgColor=st.bgColor||'#000000';
    else if(prop==='toBgAlpha')a.toBgAlpha=st.bgAlpha!==undefined?st.bgAlpha:60;
    else if(prop==='toOutlineColor')a.toOutlineColor=st.outlineColor||'#000000';
    else if(prop==='toOutlineAlpha')a.toOutlineAlpha=st.outlineAlpha!==undefined?st.outlineAlpha:0;
    else if(prop==='toOutlineSize')a.toOutlineSize=st.outlineSize!==undefined?st.outlineSize:3;
  }
  const rowMap={toSize:'adj-size-row',toTextColor:'adj-tc-row',toTextAlpha:'adj-ta-row',toBgColor:'adj-bc-row',toBgAlpha:'adj-ba-row',toOutlineColor:'adj-oc-row',toOutlineAlpha:'adj-oa-row',toOutlineSize:'adj-os-row'};
  const row=document.getElementById(rowMap[prop]);if(row)row.style.opacity=enabled?'1':'0.4';
  if(enabled){
    const toMap={toSize:'adj-size-to',toTextColor:'adj-tc-to',toTextAlpha:'adj-ta-to',toBgColor:'adj-bc-to',toBgAlpha:'adj-ba-to',toOutlineColor:'adj-oc-to',toOutlineAlpha:'adj-oa-to',toOutlineSize:'adj-os-to'};
    const el=document.getElementById(toMap[prop]);if(el)el.value=a[prop];
  }
  renderBlocks();renderSL();chkYtt();
}

function adjSetProp(prop,v){
  const sub=subs.find(s=>s.id===adjustEditId);if(!sub||!sub.adjust)return;
  sub.adjust[prop]=v;chkYtt();
}

function adjSetBase(prop,v){
  const sub=subs.find(s=>s.id===adjustEditId);if(!sub)return;
  snapshot();
  if(['textAlpha','bgAlpha','outlineAlpha','outlineSize','fontSize'].includes(prop))sub.style[prop]=Number(v);
  else sub.style[prop]=v;
  if(prop==='outlineAlpha'&&Number(v)>0&&!sub.style.outlineType)sub.style.outlineType=3;
  _syncAdjEditor();renderBlocks();chkYtt();
}

// ── Patch other open functions to close adjust editor first ──
const _patchCloseAdj=fn=>function(...args){if(adjustEditId)closeAdjustEditor();return fn.apply(this,args);};
openKaraEditor=_patchCloseAdj(openKaraEditor);
openMoveEditor=_patchCloseAdj(openMoveEditor);
openMirrorEditor=_patchCloseAdj(openMirrorEditor);
openFadeEditor=_patchCloseAdj(openFadeEditor);
if(typeof openReverseEditor==='function')openReverseEditor=_patchCloseAdj(openReverseEditor);

// ── Drag and drop ──
(function initAdjustDnd(){
  function setup(){
    const card=document.getElementById('fx-adjust-card');if(!card)return;
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','adjust-effect');e.dataTransfer.effectAllowed='copy';});
    document.addEventListener('drop',e=>{
      if(e.dataTransfer.getData('text/plain')!=='adjust-effect')return;
      const block=e.target.closest('.sub-block');if(!block)return;
      e.preventDefault();
      const sub=subs.find(s=>s.id===block.dataset.id);if(!sub)return;
      snapshot();selId=sub.id;multi.clear();
      if(!sub.adjust)applyAdjustToSub(sub);
      openAdjustEditor(sub.id);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

// ── buildYTT patch: expand adjust subs into 10fps stepped frames ──
const _origBuildYTT_adj=buildYTT;
buildYTT=function(sorted){
  const expanded=[];
  sorted.forEach(s=>{
    if(!hasAdjust(s)||hasMove(s)||hasKaraoke(s)||s.fadeworks||s.shake){expanded.push(s);return;}
    const FPS=10;
    const frameDurMs=1000/FPS;
    const totalDur=Math.max(1,s.endMs-s.startMs);
    let t=0;
    while(t<totalDur){
      const segEnd=Math.min(t+frameDurMs,totalDur);
      const midT=t+(segEnd-t)/2;
      const interp=getAdjustAtMs(s,midT);
      expanded.push({
        ...s,
        startMs:s.startMs+Math.round(t),
        endMs:s.startMs+Math.round(segEnd),
        style:interp?{...s.style,...interp}:{...s.style},
        adjust:undefined,
      });
      t+=frameDurMs;
    }
  });
  return _origBuildYTT_adj.call(this,expanded);
};
