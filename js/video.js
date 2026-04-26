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
    mkSub(500,4000,'Welcome to Khada Opus ✧',0,{bold:true,textColor:'#ffe066',bgAlpha:70}),
    mkSub(4500,9500,'Press the ? button in the top-right corner to read the full guide.',0,{italic:true}),
    mkSub(10000,15000,'Any .ytt file exported from this site can be re-imported to continue editing.',0,{textColor:'#80e5ff'}),
  ];
  tracks=[0];
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
