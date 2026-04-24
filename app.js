
// ═══════════════ STATE ════════════════
const DS={bold:false,italic:false,underline:false,font:'Roboto',fontSize:100,textColor:'#ffffff',textAlpha:100,bgColor:'#000000',bgAlpha:60,position:2,customX:null,customY:null,shadowGlow:false,shadowBevel:false,shadowSoft:false,shadowHard:false};
let subs=[],tracks=[0],selId=null,multi=new Set(),player=null,playing=false,dur=180000,curMs=0,pxS=80,raf=null,drag=null;
let snapEnabled=true,magnetEnabled=true;

// ── Undo / Redo ──
// Each stack entry is a JSON string of the full subs+tracks state (deep copy)
const undoStack=[],redoStack=[];
const MAX_HISTORY=80;

function deepCloneState(){
  // JSON round-trip is the safest deep copy for plain data objects
  return JSON.stringify({subs:subs.map(s=>({...s,style:{...s.style},karaoke:s.karaoke?{...s.karaoke,syllables:s.karaoke.syllables.map(sy=>({...sy}))}:undefined})),tracks:[...tracks]});
}

function snapshot(){
  // Push CURRENT state onto undoStack BEFORE the mutation happens
  const state=deepCloneState();
  // Avoid duplicate consecutive snapshots (nothing changed)
  if(undoStack.length&&undoStack[undoStack.length-1]===state)return;
  undoStack.push(state);
  if(undoStack.length>MAX_HISTORY)undoStack.shift();
  // Any new action clears the redo stack
  redoStack.length=0;
  updUndoRedoBtns();
}

function applyState(stateStr){
  const parsed=JSON.parse(stateStr);
  subs=parsed.subs;
  tracks=parsed.tracks;
  selId=null;multi=new Set();
  syncTracks();rebuildSidebar();renderTL();renderSL();updInsp();chkYtt();updUndoRedoBtns();
}

function doUndo(){
  if(!undoStack.length)return;
  // Save current state to redo stack
  redoStack.push(deepCloneState());
  // Restore previous state
  applyState(undoStack.pop());
}

function doRedo(){
  if(!redoStack.length)return;
  // Save current state to undo stack
  undoStack.push(deepCloneState());
  // Restore next state
  applyState(redoStack.pop());
}

function updUndoRedoBtns(){
  const u=document.getElementById('btn-undo'),r=document.getElementById('btn-redo');
  if(u){u.disabled=!undoStack.length;}
  if(r){r.disabled=!redoStack.length;}
}

// ═══════════════ PROJECT PERSISTENCE (MULTI-PROJECT) ════════════════
const PROJECTS_INDEX_KEY = 'khadaOpus_projects_v2';
let _currentProjectId = null;
let _autosaveTimer = null;
let _videoObjectURL = null;

function _getIndex(){
  try{ return JSON.parse(localStorage.getItem(PROJECTS_INDEX_KEY)||'[]'); }catch(e){ return []; }
}
function _setIndex(idx){
  try{ localStorage.setItem(PROJECTS_INDEX_KEY,JSON.stringify(idx)); }catch(e){}
}
function _projectKey(id){ return 'khadaOpus_proj_'+id; }

function saveProject(){
  try{
    if(!_currentProjectId) _currentProjectId = uid();
    const name = document.getElementById('topbar-title')?.textContent?.trim()||'Untitled';
    const data = {
      id:_currentProjectId, name, savedAt:Date.now(), subsCount:subs.length,
      subs:subs.map(s=>({...s,style:{...s.style},
        karaoke:s.karaoke?{...s.karaoke,syllables:s.karaoke.syllables.map(sy=>({...sy}))}:undefined,
        move:s.move?{...s.move,keyframes:s.move.keyframes.map(k=>({...k}))}:undefined,
        mirror:s.mirror?{...s.mirror}:undefined,
        fade:s.fade?{...s.fade}:undefined,
      })),
      tracks:[...tracks],
    };
    localStorage.setItem(_projectKey(_currentProjectId),JSON.stringify(data));
    let idx=_getIndex();
    const ei=idx.findIndex(p=>p.id===_currentProjectId);
    const meta={id:_currentProjectId,name,savedAt:data.savedAt,subsCount:subs.length};
    if(ei>=0) idx[ei]=meta; else idx.unshift(meta);
    _setIndex(idx);
    _showSaveStatus('✦ Saved');
  }catch(e){ console.warn('Save failed:',e); }
}

function _showSaveStatus(msg){
  const el=document.getElementById('save-status');
  if(!el)return;
  el.textContent=msg; el.style.opacity='1';
  clearTimeout(el._t);
  el._t=setTimeout(()=>{ el.style.opacity='0'; },2000);
}

function scheduleSave(){
  clearTimeout(_autosaveTimer);
  _autosaveTimer=setTimeout(saveProject,1500);
}

function loadProjectById(id){
  try{
    const raw=localStorage.getItem(_projectKey(id));
    if(!raw)return false;
    const d=JSON.parse(raw);
    if(!d||!d.subs)return false;
    _currentProjectId=id;
    subs=d.subs; tracks=d.tracks||[0];
    return d.name||'Project';
  }catch(e){ return false; }
}

function deleteProjectById(id){
  try{
    localStorage.removeItem(_projectKey(id));
    _setIndex(_getIndex().filter(p=>p.id!==id));
  }catch(e){}
}

function getAllProjects(){ return _getIndex(); }

// Migrate old single-project save
(function(){
  try{
    const OLD='khadaOpus_project_v1';
    const raw=localStorage.getItem(OLD);
    if(!raw)return;
    const d=JSON.parse(raw);
    if(!d||!d.subs||!d.subs.length)return;
    const id=uid();
    d.id=id; d.name=d.videoName||'Restored Project'; d.subsCount=d.subs.length;
    localStorage.setItem(_projectKey(id),JSON.stringify(d));
    const idx=_getIndex();
    idx.unshift({id,name:d.name,savedAt:d.savedAt||Date.now(),subsCount:d.subsCount});
    _setIndex(idx);
    localStorage.removeItem(OLD);
  }catch(e){}
})();

// ── Project UI ──
function openProject(id){
  const name=loadProjectById(id);
  if(!name){ alert('Project not found.'); renderProjectsGrid(); return; }
  document.getElementById('topbar-title').textContent=name;
  enterEditor(()=>{ init(null); });
}

function deleteProject(id,e){
  if(e)e.stopPropagation();
  if(!confirm('Delete this project? Cannot be undone.'))return;
  deleteProjectById(id);
  renderProjectsGrid();
}

function startNewProject(){
  _currentProjectId=null;
  subs=[];
  document.getElementById('topbar-title').textContent='New Project';
  enterEditor(()=>{ init(null); });
}

function renderProjectsGrid(){
  const grid=document.getElementById('projects-grid');
  if(!grid)return;
  const projects=getAllProjects();
  if(!projects.length){ grid.style.display='none'; return; }
  grid.style.display='block';
  function age(ts){
    const a=Date.now()-ts;
    if(a<60000)return 'just now';
    if(a<3600000)return Math.round(a/60000)+'m ago';
    if(a<86400000)return Math.round(a/3600000)+'h ago';
    return Math.round(a/86400000)+'d ago';
  }
  grid.innerHTML='<div style="font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:10px">Saved Projects</div>'
    +'<div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto">'
    +projects.map(p=>'<div onclick="openProject(\''+p.id+'\')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--panel);border:1px solid var(--border2);cursor:pointer;border-radius:3px;transition:border-color .15s" onmouseover="this.style.borderColor=\'var(--green)\'" onmouseout="this.style.borderColor=\'var(--border2)\'">'
      +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+p.name+'</div>'
      +'<div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:2px">'+p.subsCount+' subtitle'+(p.subsCount!==1?'s':'')+' · '+age(p.savedAt)+'</div></div>'
      +'<div style="color:var(--green);font-size:11px;font-weight:700;font-family:var(--mono);white-space:nowrap">Open ✦</div>'
      +'<button onclick="deleteProject(\''+p.id+'\',event)" style="background:none;border:1px solid transparent;color:var(--text3);cursor:pointer;font-size:13px;padding:2px 5px;border-radius:2px;transition:all .15s;flex-shrink:0" onmouseover="this.style.borderColor=\'var(--red)\';this.style.color=\'var(--red)\'" onmouseout="this.style.borderColor=\'transparent\';this.style.color=\'var(--text3)\'" title="Delete">✕</button>'
      +'</div>').join('')
    +'</div>';
}

(function(){
  function run(){ renderProjectsGrid(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run);
  else run();
})();

// ── Hook snapshot to autosave ──
const _origSnap=snapshot;
snapshot=function(){
  _origSnap.apply(this,arguments);
  scheduleSave();
};

// ═══════════════ SUBTITLE IMPORT ════════════════
const KHADA_SIG='khada-opus-project';

function _wrapYTTWithSig(yttXml){
  const data={
    subs:subs.map(s=>({...s,style:{...s.style},
      karaoke:s.karaoke?{...s.karaoke,syllables:s.karaoke.syllables.map(sy=>({...sy}))}:undefined,
      move:s.move?{...s.move,keyframes:s.move.keyframes.map(k=>({...k}))}:undefined,
      mirror:s.mirror?{...s.mirror}:undefined,
      fade:s.fade?{...s.fade}:undefined,
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

// ═══════════════ TOOLTIP ENGINE ════════════════
// Uses a single fixed <div id="ui-tooltip"> — never clipped by overflow:hidden parents
(function initTooltips(){
  const tt=document.getElementById('ui-tooltip');
  if(!tt)return;
  let hideTimer=null;

  function showTip(el,x,y){
    const label=el.dataset.tip;
    const keyId=el.dataset.tipkeyId;
    if(!label)return;
    const keyText=keyId?document.getElementById(keyId)?.textContent||'':'';
    tt.innerHTML=label+(keyText?`<span class="tip-key">${keyText}</span>`:'');
    tt.style.display='flex';
    // Position: centered above the element
    const rect=el.getBoundingClientRect();
    const tx=rect.left+rect.width/2;
    const ty=rect.top-10;
    tt.style.left=tx+'px';
    tt.style.top=ty+'px';
    tt.style.transform='translateX(-50%) translateY(-100%)';
  }
  function hideTip(){
    tt.style.display='none';
  }

  // Attach to all data-tip elements — use event delegation on document
  document.addEventListener('mouseover',function(e){
    const el=e.target.closest('[data-tip]');
    if(el){
      if(hideTimer){clearTimeout(hideTimer);hideTimer=null;}
      showTip(el,e.clientX,e.clientY);
    }
  });
  document.addEventListener('mouseout',function(e){
    const el=e.target.closest('[data-tip]');
    if(el){
      hideTimer=setTimeout(hideTip,80);
    }
  });
  document.addEventListener('mousemove',function(e){
    if(tt.style.display==='flex'){
      const el=e.target.closest('[data-tip]');
      if(!el)hideTip();
    }
  });
  document.addEventListener('mousedown',function(){hideTip();});
})();

// ═══════════════ VIDEO PLAYER ════════════════
let _waveformPeaks=null, _waveformSamples=null;

function initVideo(url,name,file){
  document.getElementById('topbar-title').textContent=name||'Video';
  document.getElementById('no-video-state').style.display='none';
  const vid=document.getElementById('yt-player');
  vid.src=url; vid.style.display='block';
  const volSl=document.getElementById('vol-sl');
  vid.volume=volSl?+volSl.value/100:0.8;
  vid.addEventListener('loadedmetadata',()=>{
    dur=Math.round(vid.duration*1000);
    document.getElementById('dur-t').textContent=msToDisp(dur);
    renderTL();
    vid.currentTime=0.001;
    _extractWaveform(file||url);
  },{once:true});
  vid.addEventListener('play',()=>{ playing=true; document.getElementById('play-icon').textContent='⏸'; });
  vid.addEventListener('pause',()=>{ playing=false; document.getElementById('play-icon').textContent='▶'; });
  vid.addEventListener('ended',()=>{ playing=false; document.getElementById('play-icon').textContent='▶'; });
  player={
    _video:vid, _v:name,
    seekTo(s){ vid.currentTime=s; },
    playVideo(){ vid.play().catch(()=>{}); },
    pauseVideo(){ vid.pause(); },
    setVolume(v){ vid.volume=v/100; },
    getDuration(){ return vid.duration||0; },
    destroy(){ vid.pause(); vid.removeAttribute('src'); vid.load(); vid.style.display='none'; }
  };
}

// ── Load / swap video while keeping all subtitles ──
function loadVideoMidSession(file){
  if(!file)return;
  if(!file.type.startsWith('video/')&&!file.type.startsWith('audio/')){
    alert('( ˘︹˘ ) Please choose a video or audio file');return;
  }
  // Pause current playback
  if(player&&player._video&&!player._video.paused)player.pauseVideo();
  // Revoke old object URL
  if(_videoObjectURL)URL.revokeObjectURL(_videoObjectURL);
  _videoObjectURL=URL.createObjectURL(file);
  const name=file.name.replace(/\.[^.]+$/,'');
  // Reset waveform state
  _waveformPeaks=null;_waveformSamples=null;
  const wc=document.getElementById('tl-wave-canvas');
  if(wc){wc.width=0;}
  const wlbl=document.getElementById('audio-empty-lbl');
  if(wlbl){wlbl.style.display='';wlbl.textContent='( ✧◡✧ ) Analysing audio…';}
  // Swap the video — keep subs/tracks unchanged
  document.getElementById('topbar-title').textContent=name;
  initVideo(_videoObjectURL,name,file);
  // Flash save status to confirm
  _showSaveStatus('▶ Video swapped');
}

async function _extractWaveform(fileOrUrl){
  const lbl=document.getElementById('audio-empty-lbl');
  if(lbl)lbl.textContent='( ✧◡✧ ) Analysing audio…';
  try{
    const buf=(fileOrUrl instanceof File)?await fileOrUrl.arrayBuffer():await fetch(fileOrUrl).then(r=>r.arrayBuffer());
    const actx=new (window.AudioContext||window.webkitAudioContext)();
    const decoded=await actx.decodeAudioData(buf);
    actx.close();
    const sr=decoded.sampleRate, nc=decoded.numberOfChannels, len=decoded.length;
    const down=Math.max(1,Math.floor(sr/1000));
    const dlen=Math.ceil(len/down);
    const mix=new Float32Array(dlen);
    for(let i=0;i<dlen;i++){
      let rms=0; const s=i*down, e=Math.min(s+down,len);
      for(let c=0;c<nc;c++){ const ch=decoded.getChannelData(c); for(let j=s;j<e;j++) rms+=ch[j]*ch[j]; }
      mix[i]=Math.sqrt(rms/((e-s)*nc));
    }
    _waveformSamples=mix; _waveformPeaks=mix;
  }catch(e){ console.warn('Waveform failed:',e); _waveformPeaks=_fakePeaks(Math.ceil((dur||180000)/50)); }
  _drawWaveform();
  const ke=document.getElementById('ke-wave-empty'); if(ke)ke.style.display='none';
  if(typeof karaEditId!=='undefined'&&karaEditId)reDrawKaraWave();
}

function _fakePeaks(n){ const p=new Float32Array(n); let v=0.4; for(let i=0;i<n;i++){v=Math.max(.05,Math.min(1,v+(Math.random()-.5)*.3));p[i]=v;} return p; }

function _buildPeaksForZoom(){
  if(!_waveformSamples||!dur)return null;
  const W=Math.ceil(dur/1000*pxS), S=_waveformSamples.length;
  const peaks=new Float32Array(W);
  for(let px=0;px<W;px++){
    const s=Math.floor(px/W*S), e=Math.ceil((px+1)/W*S);
    let rms=0,n=0;
    for(let i=s;i<e&&i<S;i++){rms+=_waveformSamples[i]*_waveformSamples[i];n++;}
    peaks[px]=n>0?Math.sqrt(rms/n):0;
  }
  const mx=Math.max(...peaks,0.001);
  for(let i=0;i<peaks.length;i++)peaks[i]/=mx;
  return peaks;
}

function _drawWaveform(){
  const row=document.getElementById('audio-track'); if(!row||!dur)return;
  let c=document.getElementById('tl-wave-canvas');
  if(!c){c=document.createElement('canvas');c.id='tl-wave-canvas';row.appendChild(c);}
  const lbl=document.getElementById('audio-empty-lbl'); if(lbl)lbl.style.display='none';
  _paintWave(c);
}

function _paintWave(canvas){
  if(!canvas)return;
  const row=canvas.parentElement; if(!row||!dur)return;
  const W=Math.ceil(dur/1000*pxS), H=row.clientHeight||64;
  canvas.width=W; canvas.height=H;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const peaks=_waveformSamples?_buildPeaksForZoom():_fakePeaks(W);
  const mid=H/2;
  for(let x=0;x<W;x++){
    const amp=(peaks[x]||0)*mid*.92;
    ctx.fillStyle='rgba(48,209,88,0.65)';
    ctx.fillRect(x,mid-amp,1,amp*2||1);
  }
  ctx.fillStyle='rgba(48,209,88,0.12)';
  ctx.beginPath(); ctx.moveTo(0,mid);
  for(let x=0;x<W;x++){ ctx.lineTo(x,mid-(peaks[x]||0)*mid*.92); }
  ctx.lineTo(W,mid); ctx.closePath(); ctx.fill();
}

function _refreshWave(){
  const c=document.getElementById('tl-wave-canvas');
  if(c&&dur>0)_paintWave(c);
}

window.onYouTubeIframeAPIReady=function(){};

// ═══════════════ LANDING ════════════════
function handleFileLoad(file){
  if(!file)return;
  if(!file.type.startsWith('video/')&&!file.type.startsWith('audio/')){
    document.getElementById('proc-status').textContent='( ˘︹˘ ) Please upload a video or audio file';return;
  }
  if(_videoObjectURL)URL.revokeObjectURL(_videoObjectURL);
  _videoObjectURL=URL.createObjectURL(file);
  document.getElementById('proc-bar').classList.add('active');
  document.getElementById('proc-fill').style.width='40%';
  document.getElementById('proc-status').textContent='✧ Loading video…';
  setTimeout(()=>{
    document.getElementById('proc-fill').style.width='90%';
    document.getElementById('proc-status').textContent='✦ Preparing timeline…';
    setTimeout(()=>{
      document.getElementById('proc-status').textContent='( ✧◡✧ ) Ready!';
      const name=file.name.replace(/\.[^.]+$/,'');
      enterEditor(()=>{ init(null); initVideo(_videoObjectURL,name,file); });
    },250);
  },300);
}

function startBlank(){
  document.getElementById('topbar-title').textContent='Untitled Project';
  enterEditor(()=>init(null));
}

function startNewProject(){
  _currentProjectId=null; subs=[];
  document.getElementById('topbar-title').textContent='New Project';
  enterEditor(()=>init(null));
}

function enterEditor(cb){
  document.getElementById('landing').classList.add('out');
  const ed=document.getElementById('editor');
  ed.style.opacity='0'; ed.style.display='flex';
  setTimeout(()=>{
    document.getElementById('landing').style.display='none';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ ed.classList.add('visible'); ed.style.opacity=''; cb(); }));
  },600);
}

function dl(ms){ return new Promise(r=>setTimeout(r,ms)); }

function togglePlay(){
  if(player&&player._video){
    if(player._video.paused)player.playVideo(); else player.pauseVideo();
  } else { playing=!playing; document.getElementById('play-icon').textContent=playing?'⏸':'▶'; }
}

function skipTime(s){
  curMs=Math.max(0,Math.min(dur,curMs+s*1000));
  if(player&&player.seekTo)player.seekTo(curMs/1000);
}

function goHome(){
  // If there's unsaved work, ask user if they want to save first
  if(subs.length>0){
    _showSavePrompt(()=>_doGoHome());
  } else {
    _doGoHome();
  }
}

function _doGoHome(){
  subs=[];tracks=[0];selId=null;multi=new Set();
  mirrorEditId=null;fadeEditId=null;
  Object.keys(_ovPool).forEach(id=>{if(_ovPool[id].parentNode)_ovPool[id].parentNode.removeChild(_ovPool[id]);delete _ovPool[id];});
  Object.keys(_ovStyleCache).forEach(k=>delete _ovStyleCache[k]);
  if(raf)cancelAnimationFrame(raf);raf=null;
  playing=false;curMs=0;dur=180000;
  if(player&&player.destroy){try{player.destroy();}catch(e){}}
  player=null;
  _waveformPeaks=null;_waveformSamples=null;
  if(_videoObjectURL){URL.revokeObjectURL(_videoObjectURL);_videoObjectURL=null;}
  const wc=document.getElementById('tl-wave-canvas');if(wc)wc.remove();
  const wlbl=document.getElementById('audio-empty-lbl');
  if(wlbl){wlbl.style.display='';wlbl.textContent='( ✧◡✧ ) upload a video to see waveform';}
  const keW=document.getElementById('ke-wave-empty');if(keW)keW.style.display='';
  document.removeEventListener('keydown',onKey);
  document.getElementById('editor').classList.remove('visible');
  document.getElementById('editor').style.display='none';
  const l=document.getElementById('landing');l.style.display='flex';l.classList.remove('out');
  document.getElementById('proc-bar').classList.remove('active');
  document.getElementById('proc-fill').style.width='0';
  document.getElementById('proc-status').textContent='';
  document.getElementById('play-icon').textContent='▶';
  const vid=document.getElementById('yt-player');
  if(vid&&vid.tagName==='VIDEO'){vid.pause();vid.removeAttribute('src');vid.load();vid.style.display='none';}
  document.getElementById('no-video-state').style.display='flex';
  clearTimeout(_autosaveTimer);_currentProjectId=null;
  renderProjectsGrid();
}

// Drag-and-drop on upload zone
(function(){
  function setup(){
    const zone=document.getElementById('upload-drop-zone');if(!zone)return;
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag-over');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f)handleFileLoad(f);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();



// ── Save prompt before leaving ──
function _showSavePrompt(onContinue){
  const existing = document.getElementById('save-prompt-modal');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'save-prompt-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--panel);border:1px solid var(--border2);padding:24px;width:min(400px,88vw);display:flex;flex-direction:column;gap:16px;border-radius:4px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:14px;font-weight:800;';
  title.textContent = 'Save before leaving?';

  const desc = document.createElement('div');
  desc.style.cssText = 'font-family:var(--mono);font-size:11px;color:var(--text2);line-height:1.7';
  desc.innerHTML = 'Your current project has <b style="color:var(--text)">'+subs.length+' subtitle'+(subs.length!==1?'s':'')+'</b>. Save it before starting a new one?';

  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';

  const cancelBtn = document.createElement('button');
  cancelBtn.style.cssText = 'padding:7px 14px;background:none;border:1px solid var(--border2);color:var(--text2);font-family:var(--mono);font-size:11px;cursor:pointer;border-radius:2px';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => overlay.remove();

  const noSaveBtn = document.createElement('button');
  noSaveBtn.style.cssText = 'padding:7px 14px;background:none;border:1px solid rgba(255,59,48,.4);color:var(--red);font-family:var(--mono);font-size:11px;cursor:pointer;border-radius:2px';
  noSaveBtn.textContent = "Don't Save";
  noSaveBtn.onclick = () => { overlay.remove(); onContinue(); };

  const saveBtn = document.createElement('button');
  saveBtn.style.cssText = 'padding:7px 16px;background:var(--green);border:none;color:#000;font-family:var(--sans);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;border-radius:2px';
  saveBtn.textContent = 'Save ✦';
  saveBtn.onclick = () => { saveProject(); overlay.remove(); onContinue(); };

  btns.appendChild(cancelBtn); btns.appendChild(noSaveBtn); btns.appendChild(saveBtn);
  box.appendChild(title); box.appendChild(desc); box.appendChild(btns);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}


// ── Saved Projects modal (from topbar button) ──
function showProjectsModal(){
  const existing = document.getElementById('projects-modal');
  if(existing) existing.remove();

  const projects = getAllProjects();
  function age(ts){
    const a = Date.now()-ts;
    if(a<60000) return 'just now';
    if(a<3600000) return Math.round(a/60000)+'m ago';
    if(a<86400000) return Math.round(a/3600000)+'h ago';
    return Math.round(a/86400000)+'d ago';
  }

  // Build modal with DOM
  const overlay = document.createElement('div');
  overlay.id = 'projects-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--panel);border:1px solid var(--border2);width:min(540px,92vw);display:flex;flex-direction:column;border-radius:4px;overflow:hidden;max-height:90vh;';

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'height:48px;background:var(--panel2);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 18px;gap:10px;flex-shrink:0';
  hdr.innerHTML = '<span style="font-size:13px;font-weight:800;flex:1">✦ Saved Projects</span>';
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;line-height:1;padding:4px';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => overlay.remove();
  hdr.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.style.cssText = 'padding:16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px;';

  if(!projects.length){
    const empty = document.createElement('div');
    empty.style.cssText = 'font-family:var(--mono);font-size:11px;color:var(--text3);text-align:center;padding:24px 0';
    empty.textContent = '( ✧◡✧ ) No saved projects yet';
    body.appendChild(empty);
  } else {
    projects.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--panel2);border:1px solid var(--border2);cursor:pointer;border-radius:3px;transition:border-color .15s';
      row.onmouseover = () => row.style.borderColor = 'var(--green)';
      row.onmouseout  = () => row.style.borderColor = 'var(--border2)';
      row.onclick = () => _openProjectFromModal(p.id);

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0';
      info.innerHTML = '<div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+p.name+'</div>'
        +'<div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:2px">'+p.subsCount+' subtitle'+(p.subsCount!==1?'s':'')+' · '+age(p.savedAt)+'</div>';

      const openLbl = document.createElement('div');
      openLbl.style.cssText = 'color:var(--green);font-size:11px;font-weight:700;font-family:var(--mono);white-space:nowrap;flex-shrink:0';
      openLbl.textContent = 'Open ✦';

      const delBtn = document.createElement('button');
      delBtn.style.cssText = 'background:none;border:1px solid transparent;color:var(--text3);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:2px;flex-shrink:0;transition:all .15s';
      delBtn.title = 'Delete project';
      delBtn.textContent = '✕';
      delBtn.onmouseover = () => { delBtn.style.borderColor='var(--red)'; delBtn.style.color='var(--red)'; };
      delBtn.onmouseout  = () => { delBtn.style.borderColor='transparent'; delBtn.style.color='var(--text3)'; };
      delBtn.onclick = e => { e.stopPropagation(); _deleteFromModal(p.id); };

      row.appendChild(info); row.appendChild(openLbl); row.appendChild(delBtn);
      body.appendChild(row);
    });
  }

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:12px 16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;background:var(--panel2);flex-shrink:0';
  const doneBtn = document.createElement('button');
  doneBtn.style.cssText = 'padding:7px 18px;background:none;border:1px solid var(--border2);color:var(--text2);font-family:var(--sans);font-size:11px;font-weight:700;letter-spacing:.5px;cursor:pointer;border-radius:2px';
  doneBtn.textContent = 'Close';
  doneBtn.onclick = () => overlay.remove();
  footer.appendChild(doneBtn);

  box.appendChild(hdr); box.appendChild(body); box.appendChild(footer);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}


function _openProjectFromModal(id){
  document.getElementById('projects-modal')?.remove();
  // If we're in the editor with unsaved work, prompt first
  const inEditor = document.getElementById('editor')?.style.display !== 'none';
  if(inEditor && subs.length > 0){
    _showSavePrompt(()=>{ _loadAndOpenProject(id); });
  } else {
    _loadAndOpenProject(id);
  }
}

function _loadAndOpenProject(id){
  const name = loadProjectById(id);
  if(!name){ alert('Project not found.'); showProjectsModal(); return; }
  // If we're on landing, enterEditor; if already in editor, just reload state
  const inEditor = document.getElementById('editor')?.style.display !== 'none';
  if(inEditor){
    document.getElementById('topbar-title').textContent = name;
    syncTracks();rebuildSidebar();renderTL();renderSL();updInsp();
    _waveformPeaks=null;_waveformSamples=null;
    const wc=document.getElementById('tl-wave-canvas');if(wc)wc.remove();
    const wlbl=document.getElementById('audio-empty-lbl');
    if(wlbl){wlbl.style.display='';wlbl.textContent='( ✧◡✧ ) upload a video to see waveform';}
    _showSaveStatus('✦ Project loaded');
  } else {
    document.getElementById('topbar-title').textContent = name;
    enterEditor(()=>{ init(null); });
  }
}

function _deleteFromModal(id){
  if(!confirm('Delete this project?')) return;
  deleteProjectById(id);
  showProjectsModal(); // re-render modal
}

// ═══════════════ INIT ════════════════
function init(v){
  loadKeybinds();
  undoStack.length=0;redoStack.length=0;updUndoRedoBtns();
  if(!subs.length) loadDemos();
  syncTracks();rebuildSidebar();
  // Set initial zoom to fit-to-view after layout is painted
  requestAnimationFrame(()=>{
    pxS=fitPxS();syncZ();renderTL();renderSL();
  });
  startRaf();
  document.getElementById('tl-ruler').addEventListener('mousedown',rulerDown);
  document.addEventListener('keydown',onKey);
  window.addEventListener('resize',()=>{if(pxS<=fitPxS()*1.05){pxS=fitPxS();syncZ();}renderTL();_refreshWave();});
  // video loaded via initVideo
}
function mkSub(s,e,t,tr,ov){return{id:uid(),startMs:s,endMs:e,text:t,track:tr,style:{...DS,...ov}};}
function loadDemos(){
  subs=[
    mkSub(1200,4500,'Welcome to this video.',0,{bold:true,textColor:'#ffe066',bgAlpha:70}),
    mkSub(5000,8500,'Today we\'re talking about subtitle editing.',0,{}),
    mkSub(9000,13000,'No software needed — just your browser.',0,{italic:true}),
    mkSub(13500,17000,'Let\'s get right into it.',0,{}),
    mkSub(17500,22000,'Here\'s where it gets interesting.',0,{shadowGlow:true,textColor:'#00e5ff'}),
    mkSub(22500,27000,'Style each subtitle independently.',0,{}),
    mkSub(5000,9000,'♪ Music playing ♪',1,{italic:true,textColor:'#aaaaaa',position:7,bgAlpha:35}),
    mkSub(28000,33000,'Export as .ytt for full styling support.',0,{bold:true,shadowGlow:true}),
  ];
  tracks=[0,1];
}


// ═══════════════ YOUTUBE ════════════════
// Uses a plain <iframe> embed — works from file:// and any browser.
// If the iframe can't load (sandboxed env), shows a fallback with YouTube link.
function initYT(v){
  document.getElementById('no-video-state').style.display='none';
  // Build or replace the iframe
  let iframe=document.getElementById('yt-player');
  if(!iframe||iframe.tagName!=='IFRAME'){
    const container=document.getElementById('vwrap');
    if(iframe)iframe.remove();
    iframe=document.createElement('iframe');
    iframe.id='yt-player';
    container.appendChild(iframe);
  }
  iframe.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:none;display:block;z-index:1;';
  iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen=true;
  iframe.src=`https://www.youtube.com/embed/${v}?autoplay=0&controls=1&modestbranding=1&rel=0&cc_load_policy=0&iv_load_policy=3`;

  // Show fallback if iframe fails (e.g. sandboxed environment like claude.ai preview)
  const fallback=document.getElementById('yt-fallback');
  if(fallback)fallback.remove();
  const fb=document.createElement('div');
  fb.id='yt-fallback';
  fb.style.cssText='display:none;position:absolute;inset:0;z-index:2;background:#0a0a0b;flex-direction:column;align-items:center;justify-content:center;gap:10px;';
  fb.innerHTML=`
    <div style="font-size:28px;opacity:.3">📺</div>
    <div style="font-family:var(--mono);font-size:11px;color:var(--text3);letter-spacing:1px;text-align:center;line-height:1.8">
      ( ˘︹˘ ) VIDEO BLOCKED IN THIS ENVIRONMENT<br>
      <span style="font-size:10px;opacity:.6">Open this file locally in your browser ✧</span>
    </div>
    <a href="https://www.youtube.com/watch?v=${v}" target="_blank"
       style="margin-top:4px;padding:7px 18px;border:1px solid var(--red);color:var(--red);font-family:var(--sans);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none;transition:background .15s;"
       onmouseover="this.style.background='rgba(255,59,48,.12)'" onmouseout="this.style.background=''"
    >Open on YouTube ↗</a>
    <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
      <span style="font-family:var(--mono);font-size:10px;color:var(--text3)">✧ Set video duration:</span>
      <input id="dur-input" type="text" value="3:00" placeholder="m:ss"
        style="width:60px;background:var(--panel2);border:1px solid var(--border2);padding:3px 6px;font-family:var(--mono);font-size:11px;color:var(--text);outline:none;text-align:center;"
        onchange="setDurFromInput(this.value)" title="Set video duration for accurate timeline"/>
      <span style="font-family:var(--mono);font-size:10px;color:var(--text3)">for timeline</span>
    </div>`;
  document.getElementById('vwrap').appendChild(fb);

  // Check if iframe loaded; if it errors or stays empty, show fallback
  let loaded=false;
  iframe.onload=()=>{ loaded=true; };
  setTimeout(()=>{
    if(!loaded){fb.style.display='flex';}
    else{
      // Even if onload fired, youtube might show an error page — check with a secondary test
      try{
        const doc=iframe.contentDocument||iframe.contentWindow?.document;
        if(!doc||doc.body?.innerHTML===''){fb.style.display='flex';}
      } catch(e){
        // Cross-origin = blocked, but that means YouTube loaded fine (cross-origin is expected)
        // fb stays hidden
      }
    }
  },2500);

  player={_iframe:true,_v:v};
}

function setDurFromInput(val){
  const parts=val.split(':');
  if(parts.length===2){dur=(parseInt(parts[0])||0)*60000+(parseFloat(parts[1])||0)*1000;}
  else if(parts.length===3){dur=(parseInt(parts[0])||0)*3600000+(parseInt(parts[1])||0)*60000+(parseFloat(parts[2])||0)*1000;}
  document.getElementById('dur-t').textContent=msToDisp(dur);
  renderTL();
}
function togglePlay(){
  if(player&&player._video){
    if(player._video.paused) player.playVideo();
    else player.pauseVideo();
  } else {
    playing=!playing;
    document.getElementById('play-icon').textContent=playing?'⏸':'▶';
  }
}
function skipTime(s){
  curMs=Math.max(0,Math.min(dur,curMs+s*1000));
  if(player&&player.seekTo) player.seekTo(curMs/1000);
}

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

function _getBaseStyle(s,gi){
  const st=s.style;
  const key=`${s.id}_${st.bold}_${st.italic}_${st.underline}_${st.font}_${st.fontSize}_${st.textColor}_${st.textAlpha}_${st.bgColor}_${st.bgAlpha}_${gi}`;
  if(_ovStyleCache[s.id]===key)return null; // no change
  _ovStyleCache[s.id]=key;
  return `z-index:${20+gi};font-weight:${st.bold?700:400};font-style:${st.italic?'italic':'normal'};text-decoration:${st.underline?'underline':'none'};background:${ha(st.bgColor,st.bgAlpha)};font-family:'${st.font}',sans-serif;font-size:${16*(st.fontSize/100)}px;color:${ha(st.textColor,st.textAlpha)}`;
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

function _updOvFast(vwrap){
  const active=subs.filter(s=>curMs>=s.startMs&&curMs<=s.endMs);
  const activeIds=new Set(active.map(s=>s.id));

  // Hide divs for subs no longer active
  Object.keys(_ovPool).forEach(id=>{
    if(!activeIds.has(id)&&_ovPool[id].parentNode){
      _ovPool[id].parentNode.removeChild(_ovPool[id]);
      delete _ovStyleCache[id];
    }
  });

  if(!active.length)return;
  active.sort((a,b)=>a.track-b.track);

  active.forEach((s,gi)=>{
    const el=_getOvEl(s.id);
    const st=s.style;

    // Append if not in DOM
    if(!el.parentNode)vwrap.appendChild(el);

    // Update style only if changed
    const newBase=_getBaseStyle(s,gi);
    if(newBase)el.style.cssText='position:absolute;pointer-events:none;border-radius:2px;padding:5px 14px;max-width:82%;text-align:center;white-space:pre-wrap;will-change:transform;'+newBase;

    // ── Position — always clear all props first to avoid stale values ──
    el.style.left=''; el.style.right=''; el.style.top=''; el.style.bottom=''; el.style.transform='';
    if(s.move&&s.move.keyframes&&s.move.keyframes.length>=2){
      const subDur=s.endMs-s.startMs;
      const elapsed=Math.max(0,Math.min(subDur,curMs-s.startMs));
      const tG=subDur>0?elapsed/subDur:0;
      const kfs=s.move.keyframes;
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
      let cumMs=0,asi=-1;
      for(let i=0;i<syls.length;i++){if(elapsed>=cumMs&&elapsed<cumMs+syls[i].durMs){asi=i;break;}cumMs+=syls[i].durMs;}
      if(asi===-1&&elapsed>=cumMs)asi=syls.length;
      let html='';
      syls.forEach((syl,i)=>{html+=`<span style="color:${i<=asi?preColor:mainColor}">${escH(syl.text)}</span>`;});
      el.innerHTML=html;
    } else {
      if(el.textContent!==s.text){el.textContent=s.text;}
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
    el.innerHTML=`<div class="sub-block-icon" style="color:${sub.style.textColor||'#ccc'}">T</div><div class="sub-block-text" style="font-weight:${sub.style.bold?700:400};font-style:${sub.style.italic?'italic':'normal'}">${escH(sub.text)}</div>`;
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
    s.startMs=newStart;
    s.endMs=newStart+dur2;
    // Auto-assign track
    const best=autoAssignTrack(s);
    if(best!==s.track){
      s.track=best;
      ensureTrack(best);
      syncTracks();rebuildSidebar();renderTL();
    }
  }else{
    if(drag.side==='l'){
      let ns=Math.max(0,drag.oS+dms);
      ns=applySnapMagnet(ns,s.id,'start');
      s.startMs=Math.min(ns,s.endMs-200);
    } else {
      let ne=Math.max(s.startMs+200,drag.oE+dms);
      ne=applySnapMagnet(ne,s.id,'end');
      s.endMs=ne;
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
  document.getElementById('sh-glow').checked=st.shadowGlow;
  document.getElementById('sh-bevel').checked=st.shadowBevel;
  document.getElementById('sh-soft').checked=st.shadowSoft;
  document.getElementById('sh-hard').checked=st.shadowHard;
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
  else if(['textAlpha','bgAlpha','fontSize'].includes(p))s.style[p]=Number(v);
  else s.style[p]=v;
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
  const has=subs.some(s=>{const st=s.style;return st.bold||st.italic||st.underline||st.textColor!=='#ffffff'||st.bgColor!=='#000000'||st.bgAlpha!==60||st.textAlpha!==100||st.font!=='Roboto'||st.fontSize!==100||(st.position&&st.position!==2)||st.shadowGlow||st.shadowBevel||st.shadowSoft||st.shadowHard||s.track>0;});
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
const KB_STORAGE_KEY='khadaOpus_keybinds_v1';

// Default keybinds — each action has: label, description, defaultKey, currentKey
// Key format: modifiers+Key e.g. "ctrl+z", "shift+left", "space", "q"
const KB_DEFAULTS=[
  {id:'play',      label:'Play / Pause',        desc:'Toggle playback',               def:'space'},
  {id:'skip-back', label:'Skip Back 5s',         desc:'Rewind 5 seconds',              def:'shift+arrowleft'},
  {id:'skip-fwd',  label:'Skip Forward 5s',      desc:'Fast-forward 5 seconds',        def:'shift+arrowright'},
  {id:'set-in',    label:'Set In Point',         desc:'Set block start to playhead',   def:'q'},
  {id:'set-out',   label:'Set Out Point',        desc:'Set block end to playhead',     def:'e'},
  {id:'add',       label:'Add Block',            desc:'Add new subtitle block',        def:'n'},
  {id:'delete',    label:'Delete Block',         desc:'Delete selected block',         def:'delete'},
  {id:'snap',      label:'Toggle Snap',          desc:'Toggle snap to grid',           def:'s'},
  {id:'magnet',    label:'Toggle Magnet',        desc:'Toggle magnet to edges',        def:'m'},
  {id:'undo',      label:'Undo',                 desc:'Undo last action',              def:'ctrl+z'},
  {id:'redo',      label:'Redo',                 desc:'Redo last undone action',       def:'ctrl+y'},
  {id:'next-block',label:'Next Block',           desc:'Select next subtitle',          def:'tab'},
  {id:'prev-block',label:'Previous Block',       desc:'Select previous subtitle',      def:'shift+tab'},
  {id:'shortcuts', label:'Show Shortcuts',       desc:'Open this shortcuts panel',     def:'?'},
];

let keybinds={}; // id → key string

function loadKeybinds(){
  try{
    const stored=localStorage.getItem(KB_STORAGE_KEY);
    const saved=stored?JSON.parse(stored):{};
    keybinds={};
    KB_DEFAULTS.forEach(kb=>{keybinds[kb.id]=saved[kb.id]||kb.def;});
  }catch(e){
    keybinds={};KB_DEFAULTS.forEach(kb=>{keybinds[kb.id]=kb.def;});
  }
  updateTooltipKeys();
}
function saveKeybinds(){
  try{localStorage.setItem(KB_STORAGE_KEY,JSON.stringify(keybinds));}catch(e){}
}
function resetAllKeybinds(){
  KB_DEFAULTS.forEach(kb=>{keybinds[kb.id]=kb.def;});
  saveKeybinds();
  renderKbModal();
  updateTooltipKeys();
}

function keyEventToString(e){
  const parts=[];
  if(e.ctrlKey||e.metaKey)parts.push('ctrl');
  if(e.altKey)parts.push('alt');
  if(e.shiftKey)parts.push('shift');
  const k=e.key.toLowerCase();
  if(k!=='control'&&k!=='shift'&&k!=='alt'&&k!=='meta')parts.push(k);
  return parts.join('+');
}
function keyStringToDisplay(s){
  return s.replace('ctrl','Ctrl').replace('shift','Shift').replace('alt','Alt')
    .replace('arrowleft','←').replace('arrowright','→').replace('arrowup','↑').replace('arrowdown','↓')
    .replace('delete','Del').replace('backspace','Bksp').replace('space','Space')
    .replace('tab','Tab').replace('escape','Esc').replace(/\+/g,' + ');
}
function updateTooltipKeys(){
  // Map action id → button data-tipkey-id value store
  const map={
    'play':'tip-play-key','skip-back':'tip-skip-back-key','skip-fwd':'tip-skip-fwd-key',
    'snap':'tip-snap-key','magnet':'tip-magnet-key','add':'tip-add-key',
    'undo':'tip-undo-key','redo':'tip-redo-key',
  };
  // Write values into hidden <span> elements that the tooltip engine reads
  Object.entries(map).forEach(([id,elId])=>{
    let el=document.getElementById(elId);
    if(!el){
      // Create hidden carrier element if it doesn't exist
      el=document.createElement('span');
      el.id=elId;el.style.display='none';
      document.body.appendChild(el);
    }
    el.textContent=keyStringToDisplay(keybinds[id]||'');
  });
}

// ── Help Modal ──
function openHelpModal(){
  const ov=document.getElementById('help-modal-ov');
  const m=document.getElementById('help-modal');
  ov.style.opacity='1';ov.style.pointerEvents='all';
  if(m)m.style.transform='translateY(0)';
}
function closeHelpModal(){
  const ov=document.getElementById('help-modal-ov');
  const m=document.getElementById('help-modal');
  ov.style.opacity='0';ov.style.pointerEvents='none';
  if(m)m.style.transform='translateY(10px)';
}

// ── Keybind Modal ──
let kbRecordingId=null;
function openKbModal(){
  renderKbModal();
  document.getElementById('kb-modal-ov').classList.add('open');
}
function closeKbModal(){
  kbRecordingId=null;
  document.getElementById('kb-modal-ov').classList.remove('open');
}
function renderKbModal(){
  const body=document.getElementById('kb-body');
  body.innerHTML='';
  const sections=[
    {title:'Playback',ids:['play','skip-back','skip-fwd']},
    {title:'Editing',ids:['set-in','set-out','add','delete','undo','redo']},
    {title:'Timeline',ids:['snap','magnet','next-block','prev-block']},
    {title:'App',ids:['shortcuts']},
  ];
  sections.forEach(sec=>{
    const secEl=document.createElement('div');
    secEl.innerHTML=`<div class="kb-section-title">${sec.title}</div>`;
    sec.ids.forEach(id=>{
      const kb=KB_DEFAULTS.find(k=>k.id===id);if(!kb)return;
      const row=document.createElement('div');row.className='kb-row';
      row.innerHTML=`
        <div class="kb-label">${kb.label}</div>
        <div class="kb-desc">${kb.desc}</div>
        <input class="kb-input" id="kb-inp-${id}" readonly value="${keyStringToDisplay(keybinds[id]||kb.def)}"
          title="Click to rebind" data-id="${id}"/>`;
      secEl.appendChild(row);
      body.appendChild(secEl);
    });
  });
  // Attach click handlers
  body.querySelectorAll('.kb-input').forEach(inp=>{
    inp.addEventListener('click',()=>{
      // Stop any previous recording
      body.querySelectorAll('.kb-input.recording').forEach(r=>{r.classList.remove('recording');r.value=keyStringToDisplay(keybinds[r.dataset.id]);});
      kbRecordingId=inp.dataset.id;
      inp.classList.add('recording');
      inp.value='Press key combo…';
    });
  });
}
// Global key capture for recording
document.addEventListener('keydown',function(e){
  if(!kbRecordingId)return;
  e.preventDefault();e.stopPropagation();
  const k=keyEventToString(e);
  if(k==='escape'){
    // Cancel
    const inp=document.getElementById('kb-inp-'+kbRecordingId);
    if(inp){inp.classList.remove('recording');inp.value=keyStringToDisplay(keybinds[kbRecordingId]);}
    kbRecordingId=null;return;
  }
  if(['ctrl','shift','alt','meta'].includes(k)){return;} // only modifier pressed
  keybinds[kbRecordingId]=k;
  saveKeybinds();
  updateTooltipKeys();
  const inp=document.getElementById('kb-inp-'+kbRecordingId);
  if(inp){inp.classList.remove('recording');inp.value=keyStringToDisplay(k);}
  kbRecordingId=null;
},true);

// ═══════════════ KEYBOARD ════════════════
function onKey(e){
  if(kbRecordingId)return; // let the recorder handle it
  const t=e.target.tagName;if(t==='TEXTAREA'||t==='INPUT')return;
  const k=keyEventToString(e);

  function matches(id){return keybinds[id]===k;}

  if(matches('play')){
    e.preventDefault();
    if(karaEditId&&karaSelSyl!==null)karaPlaySyllable();
    else togglePlay();
  }
  else if(matches('skip-back')){e.preventDefault();skipTime(-5);}
  else if(matches('skip-fwd')){e.preventDefault();skipTime(5);}
  else if(matches('undo')){e.preventDefault();doUndo();}
  else if(matches('redo')){e.preventDefault();doRedo();}
  else if(matches('set-in'))setIn();
  else if(matches('set-out'))setOut();
  else if(matches('add')){e.preventDefault();addSubtitle();}
  else if(matches('snap')){e.preventDefault();toggleSnap();}
  else if(matches('magnet')){e.preventDefault();toggleMagnet();}
  else if(matches('delete')||k==='backspace'){if(selId){e.preventDefault();deleteSel();}}
  else if(matches('shortcuts')){e.preventDefault();openKbModal();}
  else if(matches('next-block')||matches('prev-block')){
    e.preventDefault();
    if(karaEditId){
      const sub=subs.find(s=>s.id===karaEditId);
      if(sub&&sub.karaoke){
        const n=sub.karaoke.syllables.length;
        if(karaSelSyl===null)karaSelSyl=0;
        else karaSelSyl=matches('prev-block')?(karaSelSyl-1+n)%n:(karaSelSyl+1)%n;
        buildSylStrip();reDrawKaraWave();updKaraSelEdit();
      }
      return;
    }
    const sorted=[...subs].sort((a,b)=>a.startMs-b.startMs);
    const idx=sorted.findIndex(s=>s.id===selId);
    const next=matches('prev-block')?sorted[idx-1]:sorted[idx+1];
    if(next)selSub(next.id);
  }
}

// ═══════════════ EXPORT ════════════════
function openExport(){
  const has=chkYttBool();
  document.getElementById('ytt-note').classList.toggle('show',has);
  // Never disable formats — always let users download any format
  document.getElementById('exp-srt').classList.remove('off');
  document.getElementById('exp-vtt').classList.remove('off');
  document.getElementById('exp-modal').classList.add('open');
}
function chkYttBool(){return subs.some(s=>{const st=s.style;return st.bold||st.italic||st.underline||st.textColor!=='#ffffff'||st.bgColor!=='#000000'||st.bgAlpha!==60||st.textAlpha!==100||st.font!=='Roboto'||st.fontSize!==100||(st.position&&st.position!==2)||st.shadowGlow||st.shadowBevel||st.shadowSoft||st.shadowHard||s.track>0||hasMove(s)||hasKaraoke(s);});}
function closeExport(){document.getElementById('exp-modal').classList.remove('open');}
function doExport(fmt){
  const sorted=[...subs].sort((a,b)=>a.startMs-b.startMs);
  let content='';
  if(fmt==='srt')content=sorted.map((s,i)=>`${i+1}\n${msSRT(s.startMs)} --> ${msSRT(s.endMs)}\n${s.text}\n`).join('\n');
  else if(fmt==='vtt')content='WEBVTT\n\n'+sorted.map((s,i)=>`${i+1}\n${msVTT(s.startMs)} --> ${msVTT(s.endMs)}\n${s.text}\n`).join('\n');
  else content=buildYTT(sorted);

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
    let et='';
    if(st.shadowGlow)et=' et="3"';else if(st.shadowSoft)et=' et="4"';else if(st.shadowHard)et=' et="1"';else if(st.shadowBevel)et=' et="2"';
    return `<pen id="${id}"${b}${it}${u}${fc}${fo}${bc}${bo}${fs}${sz}${et}/>`;
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
      // Plain subtitle
      lines.push(`<p t="${s.startMs}" d="${subDur}" wp="${wpId}" ws="0"${fad}><s p="${mainPenId}">${escX(s.text)}</s></p>`);
      return;
    }

    // ── Karaoke export ──
    // Pattern from reference YTT: emit multiple <p> elements at each syllable boundary.
    // Each <p> shows the full line with sung portion in preColor and unsung in mainColor.
    // This is achieved by two <s> spans: <s p="prePen">sung_part</s><s p="mainPen">unsung_part</s>
    const kd=s.karaoke;
    const syls=kd.syllables;
    const preKey=JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:kd.preAlpha!==undefined?kd.preAlpha:100});
    const prePenId=penIndex.get(preKey)??0;
    const fullText=syls.map(sv=>sv.text).join('');

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
let karaEditId=null,karaSelSyl=null,karaCursorX=null;
let karaSylTimer=null; // for space-key syllable preview

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
  sub.karaoke={syllables,preColor:'#5046EC',preAlpha:100};
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

// ── Space: preview-play selected syllable ──
function karaPlaySyllable(){
  const sub=subs.find(s=>s.id===karaEditId);
  if(!sub||!sub.karaoke||karaSelSyl===null)return;
  const syls=sub.karaoke.syllables;
  // Compute start offset of this syllable within the subtitle
  let offsetMs=sub.startMs;
  for(let i=0;i<karaSelSyl;i++)offsetMs+=syls[i].durMs;
  const durMs=syls[karaSelSyl].durMs;
  // Seek and play for durMs
  curMs=offsetMs;playing=true;
  document.getElementById('play-icon').textContent='⏸';
  if(karaSylTimer)clearTimeout(karaSylTimer);
  karaSylTimer=setTimeout(()=>{
    playing=false;document.getElementById('play-icon').textContent='▶';
    karaSylTimer=null;
  },durMs);
}

// ── Open / Close ──
function openKaraEditor(id){
  // Close whichever editor is currently open, capturing its height first
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

  karaEditId=id;karaSelSyl=null;karaCursorX=null;
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
  }
  // Always hide the "no audio" text overlay — canvas draws its own empty state
  const waveEmpty=document.getElementById('ke-wave-empty');
  if(waveEmpty)waveEmpty.style.display='none';
  // Defer draw until AFTER browser layout — clientWidth is 0 while display:none
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    reDrawKaraWave();
    buildSylStrip();
  }));
  renderBlocks();
}

function closeKaraEditor(){
  const karaEd=document.getElementById('kara-editor');
  const insp=document.getElementById('inspector');
  // Match inspector height to karaoke editor's current height before showing it
  const karaH=karaEd?karaEd.offsetHeight:0;
  karaEditId=null;karaSelSyl=null;karaCursorX=null;
  if(karaSylTimer){clearTimeout(karaSylTimer);karaSylTimer=null;playing=false;document.getElementById('play-icon').textContent='▶';}
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
  // clientWidth/Height can be 0 if called before layout — use parent or fallback
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

  // 2. Dim syllable tint bands (drawn before waveform so wave shows through)
  let bx=0;
  syls.forEach((syl,i)=>{
    const bw=(syl.durMs/totalDurMs)*W;
    ctx.fillStyle=i===karaSelSyl
      ?`rgba(${pr},${pg},${pb},0.30)`
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
    // Mirror waveform bars
    for(let px=0;px<W;px++){
      const amp=wavePeaks[px]*mid*0.90;
      ctx.fillStyle=`rgba(${pr},${pg},${pb},0.65)`;
      ctx.fillRect(px,mid-amp,1,amp*2||1);
    }
    // Bright edge lines
    ctx.strokeStyle=`rgba(${pr},${pg},${pb},0.95)`;
    ctx.lineWidth=1.5;
    ctx.beginPath();
    for(let px=0;px<W;px++){
      const y=mid-wavePeaks[px]*mid*0.90;
      px===0?ctx.moveTo(px,y):ctx.lineTo(px,y);
    }
    ctx.stroke();
    ctx.beginPath();
    for(let px=0;px<W;px++){
      const y=mid+wavePeaks[px]*mid*0.90;
      px===0?ctx.moveTo(px,y):ctx.lineTo(px,y);
    }
    ctx.stroke();
  } else {
    // No audio — dashed center placeholder
    ctx.strokeStyle=`rgba(${pr},${pg},${pb},0.3)`;
    ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(W,mid);ctx.stroke();
    ctx.setLineDash([]);
  }

  // 4. Selected syllable highlight on top of waveform
  bx=0;
  syls.forEach((syl,i)=>{
    const bw=(syl.durMs/totalDurMs)*W;
    if(i===karaSelSyl){
      ctx.fillStyle=`rgba(${pr},${pg},${pb},0.35)`;
      ctx.fillRect(Math.floor(bx),0,Math.ceil(bw),H);
      ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=2;
      ctx.strokeRect(Math.floor(bx)+1,1,Math.ceil(bw)-2,H-2);
    }
    bx+=bw;
  });

  // 5. Syllable labels bottom-anchored (shadow for readability over waveform)
  bx=0;
  syls.forEach((syl,i)=>{
    const bw=(syl.durMs/totalDurMs)*W;
    const isSel=i===karaSelSyl;
    const label=syl.text.trimEnd()||'·';
    ctx.font=(isSel?'bold ':'')+(H>60?'12':'10')+'px monospace';
    ctx.textAlign='center';ctx.textBaseline='bottom';
    ctx.shadowColor='rgba(0,0,0,0.95)';ctx.shadowBlur=5;
    ctx.fillStyle=isSel?'#ffffff':'rgba(255,255,255,0.7)';
    ctx.fillText(label.length>10?label.slice(0,9)+'…':label,Math.floor(bx)+Math.ceil(bw)/2,H-4);
    ctx.shadowBlur=0;
    bx+=bw;
  });

  // 6. Boundary dividers & drag arrows
  bx=0;
  syls.forEach((syl,i)=>{
    bx+=(syl.durMs/totalDurMs)*W;
    if(i<syls.length-1){
      ctx.strokeStyle='rgba(255,255,255,0.55)';ctx.lineWidth=2;
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
  row.innerHTML='';
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  if(!syls.length)return;
  const totalMs=syls.reduce((a,s)=>a+s.durMs,0)||1;

  // 1. Draw syllable segments (click to select)
  let leftPct=0;
  syls.forEach((syl,i)=>{
    const widthPct=(syl.durMs/totalMs)*100;
    const seg=document.createElement('div');
    seg.className='ke-syl-seg'+(i===karaSelSyl?' sel':'');
    seg.style.left=leftPct+'%';
    seg.style.width=widthPct+'%';
    const pc=(sub.karaoke&&sub.karaoke.preColor)||'#5046EC';
    seg.style.background=i===karaSelSyl?pc:'rgba(80,70,236,0.32)';
    seg.style.outline=i===karaSelSyl?`2px solid ${pc}`:'none';
    seg.style.outlineOffset='-2px';
    seg.style.color='#fff';
    seg.dataset.idx=i;
    seg.textContent=syl.text.trimEnd()||'·';  // show clean label; trailing space is timing-only
    seg.title=syl.text.trimEnd()+' · '+syl.durMs+'ms';
    seg.addEventListener('mousedown',e=>{
      e.preventDefault();e.stopPropagation();
      karaSelSyl=i;buildSylStrip();reDrawKaraWave();updKaraSelEdit();
    });
    row.appendChild(seg);
    leftPct+=widthPct;
  });

  // 2. Draw edge handles ON TOP at each internal boundary (between syl i and i+1)
  // These are siblings of the segs, absolutely positioned in the same row
  let edgePct=0;
  syls.forEach((syl,i)=>{
    edgePct+=(syl.durMs/totalMs)*100;
    if(i<syls.length-1){
      const edge=document.createElement('div');
      edge.className='ke-syl-edge';
      edge.style.left=edgePct+'%';
      edge.dataset.boundary=i; // boundary between syl[i] and syl[i+1]
      edge.addEventListener('mousedown',ev=>startSylBoundaryDrag(ev,i,edge));
      row.appendChild(edge);
    }
  });
  updKaraSelEdit();
}

// ── Drag time tooltip ──
function showDragTooltip(clientX,clientY,ms,sub){
  const tt=document.getElementById('ke-drag-tooltip');if(!tt)return;
  // Show absolute time = sub.startMs + cumMs at this boundary
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
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  const syls=sub.karaoke.syllables;
  const origA=syls[i].durMs,origB=syls[i+1].durMs,combined=origA+origB;
  const totalMs=syls.reduce((a,s)=>a+s.durMs,0)||1;
  const row=document.getElementById('ke-syl-row');
  const startX=e.clientX;
  edgeEl.classList.add('dragging');
  document.body.style.cursor='ew-resize';
  document.body.style.userSelect='none';

  // Snapshot all segs and this edge so we can update them in-place without full rebuild
  const segEls=row.querySelectorAll('.ke-syl-seg');
  const segA=segEls[i], segB=segEls[i+1];

  // Compute cumMs up to boundary i (end of syl[i])
  const cumMsAtBoundary=syls.slice(0,i+1).reduce((a,s)=>a+s.durMs,0);

  function onMove(ev){
    const stripW=row.getBoundingClientRect().width||300;
    const dx=ev.clientX-startX;
    const dms=Math.round((dx/stripW)*totalMs);
    const newA=Math.max(50,Math.min(combined-50,origA+dms));
    const newB=Math.max(50,combined-newA);
    syls[i].durMs=newA;
    syls[i+1].durMs=newB;

    // Update widths in-place (no DOM rebuild = no flicker, no event loss)
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

    // Show tooltip with absolute time at this boundary
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

// Canvas mousedown → drag boundary if near one, else select syllable
(function initWaveInteraction(){
  const SNAP_PX=10; // px threshold to detect "near a boundary"

  function getBoundaryData(sub,W){
    // Returns array of {x, i} where x is the pixel position of the boundary between syl[i] and syl[i+1]
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

      // Check if click is near any boundary
      const boundaries=getBoundaryData(sub,W);
      let nearBoundary=null;
      for(const b of boundaries){
        if(Math.abs(x-b.x)<=SNAP_PX){nearBoundary=b;break;}
      }

      if(nearBoundary!==null){
        // ── Drag boundary ──
        e.preventDefault();
        const i=nearBoundary.i;
        const origA=syls[i].durMs,origB=syls[i+1].durMs,combined=origA+origB;
        const startX=e.clientX;
        const row=document.getElementById('ke-syl-row');
        // set cursor on wrap for visual feedback
        wrap.style.cursor='ew-resize';
        document.body.style.userSelect='none';

        function onMove(ev){
          const curW=wrap.getBoundingClientRect().width||300;
          const dx=ev.clientX-startX;
          const dms=Math.round((dx/curW)*totalMs);
          syls[i].durMs=Math.max(50,Math.min(combined-50,origA+dms));
          syls[i+1].durMs=Math.max(50,combined-syls[i].durMs);
          // Update strip in-place
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
          // Show tooltip at boundary absolute time
          const newCumMs=syls.slice(0,i+1).reduce((a,s)=>a+s.durMs,0);
          showDragTooltip(ev.clientX,ev.clientY,newCumMs,sub);
          reDrawKaraWave();
          if(karaSelSyl===i||karaSelSyl===i+1)updKaraSelEdit();
        }
        function onUp(){
          wrap.style.cursor='pointer';
          hideDragTooltip();
          document.body.style.userSelect='';
          document.removeEventListener('mousemove',onMove);
          document.removeEventListener('mouseup',onUp);
          buildSylStrip();reDrawKaraWave();
        }
        document.addEventListener('mousemove',onMove);
        document.addEventListener('mouseup',onUp);

      } else {
        // ── Select syllable ──
        let px=0;
        for(let i=0;i<syls.length;i++){
          const w=(syls[i].durMs/totalMs)*W;
          if(x<px+w){karaSelSyl=i;break;}
          px+=w;
        }
        buildSylStrip();reDrawKaraWave();updKaraSelEdit();
      }
    });

    // Change cursor to ew-resize when hovering near a boundary
    wrap.addEventListener('mousemove',e=>{
      if(!karaEditId)return;
      const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
      const rect=wrap.getBoundingClientRect();
      const W=rect.width||300;
      const x=e.clientX-rect.left;
      const boundaries=getBoundaryData(sub,W);
      const near=boundaries.some(b=>Math.abs(x-b.x)<=SNAP_PX);
      wrap.style.cursor=near?'ew-resize':'pointer';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

function updKaraSelEdit(){
  // Guard: editor may be closed/hidden so elements might not be in DOM
  const noSel=document.getElementById('ke-no-sel');
  const selEdit=document.getElementById('ke-sel-edit');
  if(!noSel||!selEdit)return; // editor panel not in DOM yet
  const sub=karaEditId?subs.find(s=>s.id===karaEditId):null;
  if(!sub||!sub.karaoke||karaSelSyl===null||!sub.karaoke.syllables[karaSelSyl]){
    noSel.style.display='';selEdit.style.display='none';return;
  }
  const syl=sub.karaoke.syllables[karaSelSyl];
  noSel.style.display='none';selEdit.style.display='flex';
  const kt=document.getElementById('ke-text');
  const kd=document.getElementById('ke-dur');
  if(kt)kt.value=syl.text;
  if(kd)kd.value=syl.durMs;
}

// ── Toolbar actions ──
function karaSplitAtCursor(){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke||karaSelSyl===null)return;
  const syls=sub.karaoke.syllables,syl=syls[karaSelSyl];
  if(syl.durMs<100)return;
  const half=Math.floor(syl.durMs/2),halfTxt=Math.ceil(syl.text.length/2);
  syls.splice(karaSelSyl,1,{text:syl.text.slice(0,halfTxt),durMs:half},{text:syl.text.slice(halfTxt),durMs:syl.durMs-half});
  buildSylStrip();reDrawKaraWave();
}
function karaJoinSel(){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke||karaSelSyl===null)return;
  const syls=sub.karaoke.syllables;if(karaSelSyl>=syls.length-1)return;
  const a=syls[karaSelSyl],b=syls[karaSelSyl+1];
  syls.splice(karaSelSyl,2,{text:a.text+b.text,durMs:a.durMs+b.durMs});
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}
function karaDelSel(){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke||karaSelSyl===null)return;
  const syls=sub.karaoke.syllables;if(syls.length<=1)return;
  const dur=syls[karaSelSyl].durMs;syls.splice(karaSelSyl,1);
  const ni=Math.min(karaSelSyl,syls.length-1);syls[ni].durMs+=dur;
  karaSelSyl=ni;buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}
function karaAutoSplit(){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub)return;
  const totalMs=sub.endMs-sub.startMs;
  sub.karaoke.syllables=_splitIntoWordSyllables(sub.text,totalMs);
  karaSelSyl=null;
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();renderBlocks();renderSL();
}
function karaAutoSplitChars(){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub)return;
  const totalMs=sub.endMs-sub.startMs;
  const raw=[...sub.text];
  // Attach trailing spaces to the preceding non-space char
  const merged=[];
  raw.forEach(c=>{
    if(c===' '&&merged.length>0)merged[merged.length-1]+=c;
    else merged.push(c);
  });
  const chars=merged.filter(s=>s.trim().length>0);
  const syllables=(chars.length?chars:merged).map(c=>({text:c,durMs:Math.max(30,Math.round(totalMs/(chars.length||1)))}));
  normalizeSylDurs(syllables,totalMs);
  sub.karaoke.syllables=syllables;karaSelSyl=null;
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();renderBlocks();renderSL();
}
function karaAddSyl(){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  sub.karaoke.syllables.push({text:'?',durMs:200});
  karaSelSyl=sub.karaoke.syllables.length-1;
  buildSylStrip();reDrawKaraWave();updKaraSelEdit();
}
function karaUpdColor(key,val){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke)return;
  sub.karaoke[key]=val;
}
function karaSylUpd(key,val){
  const sub=subs.find(s=>s.id===karaEditId);if(!sub||!sub.karaoke||karaSelSyl===null)return;
  sub.karaoke.syllables[karaSelSyl][key]=key==='durMs'?Math.max(10,+val):val;
  buildSylStrip();reDrawKaraWave();
}

window.addEventListener('resize',()=>{if(karaEditId){reDrawKaraWave();buildSylStrip();}});

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
        if(karaEditId===s.id){
          closeKaraEditor();
        } else {
          openKaraEditor(s.id);
        }
      };
      el.appendChild(kb);
    }
    el.addEventListener('click',e=>{
      selSub(s.id,e.shiftKey);
      if(!e.shiftKey)seekTo(s.startMs);
    });
    // M badge in subtitle list
    if(hasMove(s)){
      const mb=document.createElement('button');
      mb.className='sl-k-btn'+(moveEditId===s.id?' active':'');
      mb.title='Edit Move';
      mb.style.cssText='color:var(--orange);border-color:var(--orange);margin-left:2px';
      mb.innerHTML='<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="5 9 2 12 5 15"/><polyline points="19 15 22 12 19 9"/></svg>';
      mb.onclick=e=>{
        e.stopPropagation();
        selId=s.id;multi.clear();
        if(moveEditId===s.id){
          closeMoveEditor();
        } else {
          openMoveEditor(s.id);
        }
      };
      el.appendChild(mb);
    }
    // Fade badge in subtitle list
    if(hasFade(s)){
      const fb=document.createElement('button');
      fb.className='sl-k-btn'+(fadeEditId===s.id?' active':'');
      fb.title='Edit Fade';
      fb.style.cssText='color:#30d158;border-color:#30d158;margin-left:2px;padding:0 3px';
      fb.innerHTML='<svg width="10" height="9" viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="28" height="5" fill="currentColor" opacity="1"/><rect x="0" y="7" width="20" height="4" fill="currentColor" opacity="0.75"/><rect x="0" y="13" width="28" height="4" fill="currentColor" opacity="0.5"/><rect x="0" y="19" width="14" height="4" fill="currentColor" opacity="0.25"/></svg>';
      fb.onclick=e=>{e.stopPropagation();selId=s.id;multi.clear();if(fadeEditId===s.id){closeFadeEditor();}else{openFadeEditor(s.id);}};
      el.appendChild(fb);
    }
    // Mirror badge in subtitle list
    if(hasMirror(s)){
      const xb=document.createElement('button');
      xb.className='sl-k-btn'+(mirrorEditId===s.id?' active':'');
      xb.title='Edit Mirror';
      xb.style.cssText='color:var(--purple);border-color:var(--purple);margin-left:2px;padding:0 3px';
      xb.innerHTML='<svg width="14" height="10" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="0" x2="10" y2="16" stroke="currentColor" stroke-width="2" stroke-dasharray="2 1.5"/><rect x="1" y="3" width="7" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none"/><rect x="12" y="3" width="7" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"/></svg>';
      xb.onclick=e=>{
        e.stopPropagation();
        selId=s.id;multi.clear();
        if(mirrorEditId===s.id){closeMirrorEditor();}
        else{openMirrorEditor(s.id);}
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
    el.innerHTML=`<div class="sub-block-icon" style="color:${sub.style.textColor||'#ccc'}">T</div><div class="sub-block-text" style="font-weight:${sub.style.bold?700:400};font-style:${sub.style.italic?'italic':'normal'}">${escH(sub.text)}</div>`;
    // K badge: bottom-right, hollow normally, filled when actively editing
    if(hasKaraoke(sub)){
      const kb=document.createElement('span');
      kb.className='blk-k'+(karaEditId===sub.id?' active':'');
      kb.textContent='K';kb.title='Karaoke — click to edit';
      kb.addEventListener('mousedown',e=>{e.stopPropagation();});
      kb.addEventListener('click',e=>{
        e.stopPropagation();
        selId=sub.id;multi.clear();
        if(karaEditId===sub.id){
          closeKaraEditor(); // toggle off
        } else {
          openKaraEditor(sub.id);
        }
      });
      el.appendChild(kb);
    }
    // M badge: next to K (or bottom-right if no K), orange
    if(hasMove(sub)){
      const mb=document.createElement('span');
      mb.className='blk-m'+(moveEditId===sub.id?' active':'');
      // shift left if K badge also present
      if(!hasKaraoke(sub))mb.style.right='3px';
      mb.title='Move — click to edit';
      mb.innerHTML='<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="5 9 2 12 5 15"/><polyline points="19 15 22 12 19 9"/></svg>';
      mb.addEventListener('mousedown',e=>{e.stopPropagation();});
      mb.addEventListener('click',e=>{
        e.stopPropagation();
        selId=sub.id;multi.clear();
        if(moveEditId===sub.id){
          closeMoveEditor(); // toggle off
        } else {
          openMoveEditor(sub.id);
        }
      });
      el.appendChild(mb);
    }
    // Fade badge
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
      el.appendChild(fb);
    }
    // Mirror badge
    if(hasMirror(sub)){
      const xb=document.createElement('span');
      xb.className='blk-mir'+(mirrorEditId===sub.id?' active':'');
      xb.title='Mirror — click to edit';
      xb.innerHTML='<svg width="14" height="10" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="0" x2="10" y2="16" stroke="currentColor" stroke-width="2" stroke-dasharray="2 1.5"/><rect x="1" y="3" width="7" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none"/><rect x="12" y="3" width="7" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"/></svg>';
      xb.addEventListener('mousedown',e=>{e.stopPropagation();});
      xb.addEventListener('click',e=>{
        e.stopPropagation();
        selId=sub.id;multi.clear();
        if(mirrorEditId===sub.id){closeMirrorEditor();}
        else{openMirrorEditor(sub.id);}
      });
      el.appendChild(xb);
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

// ── Close karaEditor / moveEditor if selection changes to different sub ──
// updInsp patch removed — editors are closed only via explicit badge/button clicks





function uid(){return Math.random().toString(36).slice(2,10);}
function mk(t,c){const e=document.createElement(t);e.className=c;return e;}
function ms2x(ms){return(ms/1000)*pxS;}
function x2ms(x){return(x/pxS)*1000;}
function ha(hex,alpha){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${(alpha/100).toFixed(2)})`;}
function msToDisp(ms){const s=ms/1000,m=Math.floor(s/60),sc=s%60,ms2=Math.round((sc%1)*1000);return`${m}:${pad(Math.floor(sc))}.${String(ms2).padStart(3,'0')}`;}
function dispToMs(str){try{const[mp,sp]=str.split(':');const[sc,ms='0']=sp.split('.');return+mp*60000+parseInt(sc)*1000+parseInt(ms.padEnd(3,'0'));}catch{return 0;}}
function msSRT(ms){const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000),ms2=ms%1000;return`${pad(h)}:${pad(m)}:${pad(s)},${String(ms2).padStart(3,'0')}`;}
function msVTT(ms){return msSRT(ms).replace(',','.');}
function msToHMS(ms){return secHMS(Math.floor(ms/1000));}
function msToTC(ms){const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000),f=Math.floor((ms%1000)/33);return`${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;}
function secHMS(s){return`${pad(Math.floor(s/3600))}:${pad(Math.floor((s%3600)/60))}:${pad(s%60)}`;}
function pad(n){return String(n).padStart(2,'0');}
function escH(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escX(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ═══════════════ SNAP / MAGNET ════════════════
function toggleSnap(){
  snapEnabled=!snapEnabled;
  document.getElementById('btn-snap').classList.toggle('active',snapEnabled);
}
function toggleMagnet(){
  magnetEnabled=!magnetEnabled;
  document.getElementById('btn-magnet').classList.toggle('active',magnetEnabled);
}

// Apply snap + magnet to a millisecond value during drag
// side: 'start' or 'end', subId: current sub being dragged
function applySnapMagnet(ms,subId,side){
  const SNAP_MS=1000; // snap to nearest second
  const MAG_THRESH=Math.max(80,(80/pxS)*1000); // ~80px in ms

  if(snapEnabled){
    const snapped=Math.round(ms/SNAP_MS)*SNAP_MS;
    if(Math.abs(snapped-ms)<MAG_THRESH)ms=snapped;
  }

  if(magnetEnabled){
    // Collect all edge times from other subs
    const edges=[];
    subs.forEach(s=>{
      if(s.id===subId)return;
      edges.push(s.startMs,s.endMs);
    });
    let best=null,bestDist=MAG_THRESH;
    edges.forEach(e=>{
      const d=Math.abs(e-ms);
      if(d<bestDist){bestDist=d;best=e;}
    });
    if(best!==null)ms=best;
  }

  return Math.max(0,ms);
}

// ═══════════════ PANEL RESIZE ════════════════
(function(){
  function initResize(){
    // ── Effects ↔ Video (within upper row) ──
    const rEL=document.getElementById('resize-eff-lp');
    const effPane=document.getElementById('effects-pane');
    const upperRow=document.getElementById('upper-row');
    if(rEL && effPane && upperRow){
      rEL.addEventListener('mousedown',function(e){
        e.preventDefault();
        rEL.classList.add('dragging');
        document.body.style.cursor='col-resize';
        document.body.style.userSelect='none';
        const startX=e.clientX;
        const startEffW=effPane.offsetWidth;
        let latestX=startX,raf=null;
        function onMove(e){
          latestX=e.clientX;
          if(raf)return;
          raf=requestAnimationFrame(()=>{
            raf=null;
            const newW=Math.max(100,Math.min(400,startEffW+(latestX-startX)));
            effPane.style.width=newW+'px';
          });
        }
        function onUp(){
          rEL.classList.remove('dragging');
          document.body.style.cursor='';
          document.body.style.userSelect='';
          document.removeEventListener('mousemove',onMove);
          document.removeEventListener('mouseup',onUp);
          renderTL();
        }
        document.addEventListener('mousemove',onMove);
        document.addEventListener('mouseup',onUp);
      });
    }

    // ── Left ↔ Right column ──
    const rLR=document.getElementById('resize-lr');
    const rightCol=document.getElementById('right-col');
    const leftPane=document.getElementById('left-pane');
    const ws=document.getElementById('workspace');    rLR.addEventListener('mousedown',function(e){
      e.preventDefault();
      rLR.classList.add('dragging');
      document.body.style.cursor='col-resize';
      document.body.style.userSelect='none';
      const startX=e.clientX;
      const startW=rightCol.offsetWidth;
      const totalW=ws.offsetWidth;
      let latestX=startX,raf=null;
      function onMove(e){
        latestX=e.clientX;
        if(raf)return;
        raf=requestAnimationFrame(()=>{
          raf=null;
          const newW=Math.max(200,Math.min(700,startW+(startX-latestX)));
          rightCol.style.width=newW+'px';
          leftPane.style.width=(totalW-newW-4)+'px';
        });
      }
      function onUp(){
        rLR.classList.remove('dragging');
        document.body.style.cursor='';
        document.body.style.userSelect='';
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        renderTL();
      }
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });

    // ── Inspector / Karaoke Editor ↕ Subtitle list ──
    const rIS=document.getElementById('resize-insp-sl');
    const insp=document.getElementById('inspector');
    const karaEd=document.getElementById('kara-editor');
    const slPanel=document.getElementById('sub-list-panel');
    rIS.addEventListener('mousedown',function(e){
      e.preventDefault();
      rIS.classList.add('dragging');
      document.body.style.cursor='row-resize';
      document.body.style.userSelect='none';
      const startY=e.clientY;
      // Measure whichever panel is currently visible
      const activePanel=karaEd&&karaEd.style.display!=='none'?karaEd:insp;
      const startInspH=activePanel.offsetHeight;
      const startSlH=slPanel.offsetHeight;
      const totalH=startInspH+startSlH;
      let latestY=startY,raf=null;
      function onMove(e){
        latestY=e.clientY;
        if(raf)return;
        raf=requestAnimationFrame(()=>{
          raf=null;
          const newInspH=Math.max(80,Math.min(totalH-60,startInspH+(latestY-startY)));
          const newSlH=Math.max(60,totalH-newInspH);
          // Apply to both panels so switching doesn't jump
          insp.style.flex='none';
          insp.style.height=newInspH+'px';
          karaEd.style.height=newInspH+'px';
          slPanel.style.height=newSlH+'px';
        });
      }
      function onUp(){
        rIS.classList.remove('dragging');
        document.body.style.cursor='';
        document.body.style.userSelect='';
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
      }
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });

    // ── Video ↕ Timeline ──
    const rVT=document.getElementById('resize-video-tl');
    const videoArea=document.getElementById('upper-row');
    rVT.addEventListener('mousedown',function(e){
      e.preventDefault();
      rVT.classList.add('dragging');
      document.body.style.cursor='row-resize';
      document.body.style.userSelect='none';
      const startY=e.clientY;
      const startH=videoArea.offsetHeight;
      const paneH=leftPane.offsetHeight;
      let latestY=startY,raf=null;
      function onMove(e){
        latestY=e.clientY;
        if(raf)return;
        raf=requestAnimationFrame(()=>{
          raf=null;
          const newH=Math.max(80,Math.min(paneH-120,startH+(latestY-startY)));
          videoArea.style.height=newH+'px';
        });
      }
      function onUp(){
        rVT.classList.remove('dragging');
        document.body.style.cursor='';
        document.body.style.userSelect='';
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        renderTL();
      }
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initResize);
  } else {
    initResize();
  }
})();

// ═══════════════ MOVE EFFECT (Keyframe + Bezier) ════════════════
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
    const et_v=st.shadowGlow?3:st.shadowSoft?4:st.shadowHard?1:st.shadowBevel?2:0;
    return `<pen id="${id}" b="${st.bold?1:0}" i="${st.italic?1:0}" u="${st.underline?1:0}"${fc}${fo}${bc}${bo} fs="${fsVal}" sz="${st.fontSize||100}" et="${et_v}"/>`;
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
    const kfs=s.move.keyframes;
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

    if(hasMove(s)){
      const totalDur=Math.max(1,s.endMs-s.startMs);
      const exportFps=s.move.exportFps||100;
      const SAMPLE_MS=Math.round(1000/exportFps); // high-res sampling interval
      const numSamples=Math.max(2,Math.ceil(totalDur/SAMPLE_MS));
      const kfs=s.move.keyframes;

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
        const kd=s.karaoke;const syls=kd.syllables;
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
            lines.push(`<p t="${t}" d="${step.ms}" wp="${startWpId}" ws="1"><s p="${fpid}">${escX2(s.text)}</s></p>`);
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
            if (d > 0) lines.push(`<p t="${pendingStart}" d="${d}" wp="${pendingWp}" ws="1"><s p="${mainPenId}">${escX2(s.text)}</s></p>`);
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
            lines.push(`<p t="${t}" d="${step.ms}" wp="${endWpId}" ws="1"><s p="${fpid}">${escX2(s.text)}</s></p>`);
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
      // Simple static subtitle — emit with stepped fade
      if(fadeIn>0||fadeOut>0){
        const mainStart=emitFadeIn(s,mainPenId,mainKey,wpId,'0',s.text,fadeIn,lines);
        emitWithFadeOut(s,mainPenId,mainKey,wpId,'0',s.text,fadeOut,mainStart,lines);
      } else {
        lines.push(`<p t="${s.startMs}" d="${subDur}" wp="${wpId}" ws="0"><s p="${mainPenId}">${escX2(s.text)}</s></p>`);
      }
      return;
    }
    // Karaoke — emit syllable frames (fade on karaoke: apply fade to first/last syllable timing)
    const kd=s.karaoke;const syls=kd.syllables;
    const preKey=JSON.stringify({...s.style,_fc:kd.preColor||'#5046EC',_fo:kd.preAlpha!==undefined?kd.preAlpha:100});
    const prePenId=penIndex.get(preKey)??0;
    // Fade-in pre-frames before first syllable
    if(fadeIn>0) emitFadeIn(s,mainPenId,mainKey,wpId,'0',s.text,fadeIn,lines);
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
      const kfs=s.move.keyframes;

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
            lines.push(`<p t="${t}" d="${step.ms}" wp="${startWpId}" ws="1"><s p="${gfpid}">${escX2(s.text)}</s></p>`);
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
            if(d>0)lines.push(`<p t="${pendingStart}" d="${d}" wp="${pendingWp}" ws="1"><s p="${ghostPenId}">${escX2(s.text)}</s></p>`);
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
            lines.push(`<p t="${t}" d="${step.ms}" wp="${endWpId}" ws="1"><s p="${gfpid}">${escX2(s.text)}</s></p>`);
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
              lines.push(`<p t="${t}" d="${step.ms}" wp="${ghostWpId}" ws="0"><s p="${gfpid}">${escX2(s.text)}</s></p>`);
              t += step.ms;
            }
            gMainStart = t;
          }
          const gFadeOutStart = (fadeOut > 0) ? Math.max(gMainStart, s.endMs - fadeOut) : s.endMs;
          const gMainD = Math.max(1, gFadeOutStart - gMainStart);
          lines.push(`<p t="${gMainStart}" d="${gMainD}" wp="${ghostWpId}" ws="0"><s p="${ghostPenId}">${escX2(s.text)}</s></p>`);
          if (fadeOut > 0) {
            let t = gFadeOutStart;
            for (const step of outStepsMir) {
              if (t + step.ms > s.endMs) break;
              const gfpid = getGhostFadePen(step.fo);
              lines.push(`<p t="${t}" d="${step.ms}" wp="${ghostWpId}" ws="0"><s p="${gfpid}">${escX2(s.text)}</s></p>`);
              t += step.ms;
            }
          }
        } else {
          lines.push(`<p t="${s.startMs}" d="${subDur}" wp="${ghostWpId}" ws="0"><s p="${ghostPenId}">${escX2(s.text)}</s></p>`);
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
    const kfs=s.move.keyframes;
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
(function(){
  function hasProgress(){
    return typeof subs !== 'undefined' && subs.length > 0;
  }
  window.addEventListener('beforeunload', function(e){
    if(hasProgress()){
      const msg = 'You have unsaved work — your subtitles will be lost if you leave. Export first!';
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    }
  });
})();
