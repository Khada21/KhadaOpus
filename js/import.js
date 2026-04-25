// ═══════════════ SUBTITLE IMPORT ════════════════
const KHADA_SIG='khada-opus-project';

function _wrapYTTWithSig(yttXml){
  const data={
    subs:subs.map(s=>({...s,style:{...s.style},
      karaoke:s.karaoke?{...s.karaoke,syllables:s.karaoke.syllables.map(sy=>({...sy}))}:undefined,
      move:s.move?{...s.move,keyframes:s.move.keyframes.map(k=>({...k}))}:undefined,
      mirror:s.mirror?{...s.mirror}:undefined,
      fade:s.fade?{...s.fade}:undefined,
      reverse:s.reverse?{...s.reverse}:undefined,
      _compound:s._compound?s._compound.map(c=>JSON.parse(JSON.stringify(c))):undefined,
      styleKfs:s.styleKfs?{frames:s.styleKfs.frames.map(f=>({...f}))}:undefined,
      chroma:s.chroma?{...s.chroma}:undefined,
      fadeworks:s.fadeworks?{...s.fadeworks}:undefined,
      shake:s.shake?{...s.shake}:undefined,
    })),
    tracks:[...tracks],
    name:document.getElementById('topbar-title')?.textContent||'',
  };
  const sig='<!--'+KHADA_SIG+':'+btoa(unescape(encodeURIComponent(JSON.stringify(data))))+'-->';
  return sig+'\n'+yttXml;
}

function importFile(file){
  if(!file)return;
  const ext=file.name.split('.').pop().toLowerCase();
  const reader=new FileReader();
  reader.onload=e=>_processImport(e.target.result,ext,file.name);
  reader.readAsText(file,'utf-8');
}

function _processImport(text,ext,filename){
  let imported=null; let isExternal=false;
  if(ext==='ytt'||ext==='xml'){
    const m=text.match(/<!--khada-opus-project:([A-Za-z0-9+/=]+)-->/);
    if(m){
      try{ const d=JSON.parse(decodeURIComponent(escape(atob(m[1])))); imported={subs:d.subs,tracks:d.tracks,name:d.name}; }
      catch(e){ isExternal=true; }
    } else { isExternal=true; }
    if(isExternal){ imported=_parseYTT(text); imported._external=true; }
  } else if(ext==='srt'){
    imported=_parseSRT(text);
  } else if(ext==='vtt'){
    imported=_parseVTT(text);
  } else {
    alert('Unsupported file. Use .ytt, .srt, or .vtt');return;
  }
  if(!imported||!imported.subs||!imported.subs.length){ alert('No subtitles found in this file.'); return; }
  const doImport=()=>{
    _currentProjectId=null;
    subs=imported.subs; tracks=imported.tracks||[0];
    const name=imported.name||filename.replace(/\.[^.]+$/,'');
    document.getElementById('topbar-title').textContent=name;
    enterEditor(()=>{ init(null); syncTracks();rebuildSidebar();renderTL();renderSL(); setTimeout(()=>scheduleSave(),500); });
  };
  if(imported._external) _showImportWarn(filename,doImport);
  else doImport();
}

function _showImportWarn(filename,onConfirm){
  let m=document.getElementById('import-warn-modal');
  if(m)m.remove();
  m=document.createElement('div');
  m.id='import-warn-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;';
  m.innerHTML='<div style="background:var(--panel);border:1px solid rgba(255,159,10,.4);padding:24px;width:min(460px,90vw);display:flex;flex-direction:column;gap:14px;border-radius:4px;">'
    +'<div style="font-size:14px;font-weight:800;color:var(--orange)">⚠ External YTT File Detected</div>'
    +'<div style="font-family:var(--mono);font-size:11px;color:var(--text2);line-height:1.8"><b style="color:var(--text)">'+filename+'</b> was not created with Khada Opus.<br><br>'
    +'YTT files from other tools (Aegisub, etc.) use a different internal structure — timing and text will import as best as possible, but <b style="color:var(--orange)">effects, karaoke, and custom styling may not transfer correctly</b>.<br><br>'
    +'Only <b style="color:var(--green)">.ytt files exported from this app</b> restore perfectly.</div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end">'
    +'<button onclick="document.getElementById(\'import-warn-modal\').remove()" style="padding:7px 16px;background:none;border:1px solid var(--border2);color:var(--text2);font-family:var(--mono);font-size:11px;cursor:pointer;border-radius:2px">Cancel</button>'
    +'<button id="import-warn-ok" style="padding:7px 16px;background:var(--orange);border:none;color:#000;font-family:var(--sans);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;border-radius:2px">Import Anyway</button>'
    +'</div></div>';
  document.body.appendChild(m);
  document.getElementById('import-warn-ok').onclick=()=>{ m.remove(); onConfirm(); };
}

function _srtTimeToMs(s){
  const m=s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if(!m)return 0;
  return +m[1]*3600000 + +m[2]*60000 + +m[3]*1000 + +m[4].padEnd(3,'0').slice(0,3);
}

function _parseSRT(text){
  const result=[];
  const blocks=text.trim().split(/\n[ \t]*\n/);
  blocks.forEach(block=>{
    const lines=block.trim().split('\n');
    if(lines.length<2)return;
    const tl=lines.find(l=>l.includes('-->'));
    if(!tl)return;
    const[ss,es]=tl.split('-->').map(s=>s.trim());
    const startMs=_srtTimeToMs(ss), endMs=_srtTimeToMs(es);
    const txt=lines.slice(lines.indexOf(tl)+1).join(' ').replace(/<[^>]+>/g,'').trim();
    if(!txt)return;
    result.push({id:uid(),startMs,endMs,text:txt,track:0,style:{...DS}});
  });
  return {subs:result,tracks:[0]};
}

function _parseVTT(text){
  const cleaned=text.replace(/^WEBVTT[^\n]*/,'').replace(/^\d+\s*$/gm,'');
  return _parseSRT(cleaned);
}

function _parseYTT(text){
  const result=[];
  const pRe=/<p[^>]+t="(\d+)"[^>]+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while((m=pRe.exec(text))!==null){
    const startMs=+m[1], dur=+m[2];
    const txt=m[3].replace(/<s[^>]*>([\s\S]*?)<\/s>/g,'$1')
      .replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim();
    if(!txt)continue;
    const prev=result[result.length-1];
    if(prev&&prev.startMs===startMs&&prev.endMs===startMs+dur)continue;
    result.push({id:uid(),startMs,endMs:startMs+dur,text:txt,track:0,style:{...DS}});
  }
  return {subs:result,tracks:[0]};
}
