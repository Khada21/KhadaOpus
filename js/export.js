function openExport(){
  const has=chkYttBool();
  document.getElementById('ytt-note').classList.toggle('show',has);
  // Never disable formats — always let users download any format
  document.getElementById('exp-srt').classList.remove('off');
  document.getElementById('exp-vtt').classList.remove('off');
  document.getElementById('exp-modal').classList.add('open');
}
function chkYttBool(){return subs.some(s=>{const st=s.style;return st.bold||st.italic||st.underline||st.textColor!=='#ffffff'||st.bgColor!=='#000000'||st.bgAlpha!==60||st.textAlpha!==100||st.font!=='Roboto'||st.fontSize!==100||(st.position&&st.position!==2)||st.shadowGlow||st.shadowBevel||st.shadowSoft||st.shadowHard||st.outlineType>0||st.outlineAlpha>0||s.track>0||hasMove(s)||hasKaraoke(s)||(s.styleKfs&&s.styleKfs.frames&&s.styleKfs.frames.length>0)||(typeof hasAdjust==='function'&&hasAdjust(s));});}
function closeExport(){document.getElementById('exp-modal').classList.remove('open');}
function doExport(fmt){
  // Expand compound blocks to their originals before exporting
  const raw=[...subs].sort((a,b)=>a.startMs-b.startMs);
  const sorted=[];
  raw.forEach(s=>{
    if(s._compound&&s._compound.length>0){
      s._compound.forEach(c=>sorted.push(JSON.parse(JSON.stringify(c))));
    } else {
      sorted.push(s);
    }
  });
  sorted.sort((a,b)=>a.startMs-b.startMs);
  let content='';
  if(fmt==='srt')content=sorted.map((s,i)=>`${i+1}\n${msSRT(s.startMs)} --> ${msSRT(s.endMs)}\n${_getDisplayText(s)}\n`).join('\n');
  else if(fmt==='vtt')content='WEBVTT\n\n'+sorted.map((s,i)=>`${i+1}\n${msVTT(s.startMs)} --> ${msVTT(s.endMs)}\n${_getDisplayText(s)}\n`).join('\n');
  else { content=buildYTT(sorted); content='<!-- Made with Khada Opus -->\n'+content; }

  // Try Blob download first, fall back to data: URI, fall back to copy modal
  let downloaded=false;
  try{
    const mime=fmt==='vtt'?'text/vtt':fmt==='ytt'?'application/xml':'text/plain';
    const url=URL.createObjectURL(new Blob([content],{type:mime}));
    const a=document.createElement('a');a.href=url;a.download=`subtitles.${fmt}`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    downloaded=true;
  }catch(e){}

  if(!downloaded){
    try{
      const enc=encodeURIComponent(content);
      const a=document.createElement('a');
      a.href=`data:text/plain;charset=utf-8,${enc}`;
      a.download=`subtitles.${fmt}`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      downloaded=true;
    }catch(e){}
  }

  closeExport();

  if(!downloaded){
    // Last resort: show content in a copy modal
    showCopyModal(fmt,content);
  }
}

function showCopyModal(fmt,content){
  let cm=document.getElementById('copy-modal');
  if(cm)cm.remove();
  cm=document.createElement('div');
  cm.id='copy-modal';
  cm.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:300;display:flex;align-items:center;justify-content:center;';
  cm.innerHTML=`
    <div style="background:var(--panel);border:1px solid var(--border2);padding:24px;width:min(560px,92vw);display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">( ✧◡✧ ) Copy subtitles.${fmt}</span>
        <button onclick="document.getElementById('copy-modal').remove()" style="background:none;border:none;color:var(--text2);font-size:18px;cursor:pointer;line-height:1;">×</button>
      </div>
      <p style="font-size:11px;color:var(--text3);font-family:var(--mono);">( ˘︹˘ ) Download blocked in this environment. Select all &amp; copy, then save as <strong>subtitles.${fmt}</strong> ✧</p>
      <textarea id="copy-ta" readonly style="width:100%;height:220px;background:var(--panel2);border:1px solid var(--border2);padding:8px;font-family:var(--mono);font-size:11px;color:var(--text);resize:vertical;outline:none;">${escH(content)}</textarea>
      <button onclick="const ta=document.getElementById('copy-ta');ta.select();navigator.clipboard.writeText(ta.value).then(()=>{this.textContent='✓ Copied!';setTimeout(()=>this.textContent='Copy to clipboard',1500)}).catch(()=>{})" 
        style="padding:8px;background:var(--red);border:none;color:#fff;font-family:var(--sans);font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;">Copy to clipboard</button>
    </div>`;
  document.body.appendChild(cm);
  setTimeout(()=>{const ta=document.getElementById('copy-ta');if(ta)ta.select();},50);
}
function buildYTT(sorted){
  // ── Font name → fs enum ──
  const fontEnum={'Roboto':4,'Courier New':1,'Times New Roman':2,'Lucida Console':3,'Comic Sans MS':5,'Monotype Corsiva':6,'Carrois Gothic SC':7,'Noto Sans':4,'Deja Vu Sans Mono':3};
  // ── Position grid (1-9) → SRV3 ap + ah/av ──
  const posToAp={7:0,8:1,9:2,4:3,5:4,6:5,1:6,2:7,3:8};
  const posToAhAv={7:[0,0],8:[50,0],9:[100,0],4:[0,50],5:[50,50],6:[100,50],1:[0,100],2:[50,100],3:[100,100]};
  function alphaToFo(a){return Math.round((a/100)*255);}
  function fmtColor(hex){return '#'+hex.replace('#','').toUpperCase().padStart(6,'0').slice(0,6);}

  // ── Collect all pens needed ──
  // For karaoke subs we need 2 pens per sub: main-color pen and pre-karaoke-color pen
  // For normal subs: 1 pen per unique style
  const penKeys=[]; // ordered list of unique pen key strings
  const penIndex=new Map(); // key → pen id

  function getPenId(keyStr){
    if(penIndex.has(keyStr))return penIndex.get(keyStr);
    const id=penKeys.length;
    penKeys.push(keyStr);penIndex.set(keyStr,id);
    return id;
  }
  function styleToPenKey(st,colorOverride){
    // colorOverride: {fc, fo} to override text color/alpha
    return JSON.stringify({...st,...(colorOverride||{})});
  }
  function penXmlFromKey(k,id){
    const obj=JSON.parse(k);
    const st=obj; // style fields merged
    const b=st.bold?' b="1"':'';
    const it=st.italic?' i="1"':'';
    const u=st.underline?' u="1"':'';
    // Use fc/fo override if present, else from style
    const fc=` fc="${fmtColor(st._fc||st.textColor||'#ffffff')}"`;
    const fo=` fo="${alphaToFo(st._fo!==undefined?st._fo:(st.textAlpha!==undefined?st.textAlpha:100))}"`;
    const bc=` bc="${fmtColor(st.bgColor||'#000000')}"`;
    const bo=` bo="${alphaToFo(st.bgAlpha!==undefined?st.bgAlpha:60)}"`;
    const fsVal=fontEnum[st.font]!==undefined?fontEnum[st.font]:4;
    const fs=` fs="${fsVal}"`;
    const sz=` sz="${st.fontSize||100}"`;
    // Auto-apply glow outline when outlineAlpha > 0; explicit outlineType wins if set
    const et_v=st.outlineType>0?st.outlineType:((st.outlineAlpha>0)?3:(st.shadowGlow?3:st.shadowSoft?4:st.shadowHard?1:st.shadowBevel?2:0));
    const et=` et="${et_v}"`;
    const ec=` ec="${fmtColor(st.outlineColor||'#000000')}"`;
    return `<pen id="${id}"${b}${it}${u}${fc}${fo}${bc}${bo}${fs}${sz}${et}${ec}/>`;
  }

  // Pre-register all needed pens
  sorted.forEach(s=>{
    // Normal style pen
    const mainKey=JSON.stringify({...s.style,_fc:s.style.textColor,_fo:s.style.textAlpha});
    getPenId(mainKey);
    // Karaoke pre-color pen
    if(hasKaraoke(s)){
      const kd=s.karaoke;
      const preKey=JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:kd.preAlpha!==undefined?kd.preAlpha:100});
      getPenId(preKey);
    }
  });

  const pensXml=penKeys.map((k,id)=>penXmlFromKey(k,id)).join('\n  ');

  // ── Window positions ──
  const wpMap=new Map();
  sorted.forEach(s=>{const pos=s.style.position||2;if(!wpMap.has(pos))wpMap.set(pos,wpMap.size);});
  let wpsXml='';
  wpMap.forEach((id,pos)=>{
    const ap=posToAp[pos]!==undefined?posToAp[pos]:7;
    const[ah,av]=posToAhAv[pos]||[50,100];
    wpsXml+=`<wp id="${id}" ap="${ap}" ah="${ah}" av="${av}"/>`;
  });

  const wsXml='<ws id="0" ju="2" pd="0" sd="0"/>';

  // ── Body lines ──
  const lines=[];
  sorted.forEach(s=>{
    const wpId=wpMap.get(s.style.position||2)??0;
    const subDur=Math.max(1,s.endMs-s.startMs);
    const fad=(s.style.fadeIn||s.style.fadeOut)?` fad="${s.style.fadeIn||0},${s.style.fadeOut||0}"`:'';
    const mainKey=JSON.stringify({...s.style,_fc:s.style.textColor,_fo:s.style.textAlpha});
    const mainPenId=penIndex.get(mainKey)??0;

    if(!hasKaraoke(s)){
      // Plain subtitle — use _getDisplayText for reverse.text support
      const displayTxt=_getDisplayText(s);
      lines.push(`<p t="${s.startMs}" d="${subDur}" wp="${wpId}" ws="0"${fad}><s p="${mainPenId}">${escX(displayTxt)}</s></p>`);
      return;
    }

    // ── Karaoke export ──
    // Pattern from reference YTT: emit multiple <p> elements at each syllable boundary.
    // Each <p> shows the full line with sung portion in preColor and unsung in mainColor.
    // This is achieved by two <s> spans: <s p="prePen">sung_part</s><s p="mainPen">unsung_part</s>
    const kd=s.karaoke;
    // reverse.timing: play syllables in reverse order
    const revTiming=s.reverse&&s.reverse.timing;
    const rawSyls=kd.syllables;
    const syls=revTiming?[...rawSyls].reverse():rawSyls;
    const preKey=JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:kd.preAlpha!==undefined?kd.preAlpha:100});
    const prePenId=penIndex.get(preKey)??0;

    // Emit one <p> per syllable transition: at time = start of syl[i], show syls[0..i] in pre-color, rest in main
    let cumMs=0;
    syls.forEach((syl,i)=>{
      const tStart=s.startMs+cumMs;
      // Duration of this segment = remaining time until next syllable boundary (or end)
      const tEnd=i<syls.length-1?s.startMs+cumMs+syl.durMs:s.endMs;
      const segDur=Math.max(1,tEnd-tStart);
      const sungText=syls.slice(0,i+1).map(sv=>sv.text).join('');
      const unsungText=syls.slice(i+1).map(sv=>sv.text).join('');
      if(sungText&&unsungText){
        lines.push(`<p t="${tStart}" d="${segDur}" wp="${wpId}" ws="0"><s p="${prePenId}">${escX(sungText)}</s><s p="${mainPenId}">${escX(unsungText)}</s></p>`);
      } else if(sungText){
        lines.push(`<p t="${tStart}" d="${segDur}" wp="${wpId}" ws="0"><s p="${prePenId}">${escX(sungText)}</s></p>`);
      }
      cumMs+=syl.durMs;
    });
  });

  const bodyXml=lines.join('\n');
  const _ytt=`<?xml version="1.0" encoding="utf-8"?><timedtext format="3"><head>${pensXml}${wsXml}${wpsXml}</head><body>${bodyXml}</body></timedtext>`;
  return (typeof _wrapYTTWithSig==='function')?_wrapYTTWithSig(_ytt):_ytt;
}

// ═══════════════ KARAOKE ════════════════