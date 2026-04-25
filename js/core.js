
// ═══════════════ STATE ════════════════
const DS={bold:false,italic:false,underline:false,font:'Roboto',fontSize:100,textColor:'#ffffff',textAlpha:100,bgColor:'#000000',bgAlpha:60,position:2,customX:null,customY:null,shadowGlow:false,shadowBevel:false,shadowSoft:false,shadowHard:false,outlineColor:'#000000',outlineAlpha:0,outlineType:0,outlineSize:3};
let subs=[],tracks=[0],selId=null,multi=new Set(),player=null,playing=false,dur=180000,curMs=0,pxS=80,raf=null,drag=null;
let snapEnabled=true,magnetEnabled=true;

// ── Undo / Redo ──
// Each stack entry is a JSON string of the full subs+tracks state (deep copy)
const undoStack=[],redoStack=[];
const MAX_HISTORY=80;

function deepCloneState(){
  // JSON round-trip is the safest deep copy for plain data objects
  return JSON.stringify({subs:subs.map(s=>({...s,style:{...s.style},
    karaoke:s.karaoke?{...s.karaoke,syllables:s.karaoke.syllables.map(sy=>({...sy}))}:undefined,
    reverse:s.reverse?{...s.reverse}:undefined,
    _compound:s._compound?s._compound.map(c=>JSON.parse(JSON.stringify(c))):undefined,
    styleKfs:s.styleKfs?{frames:s.styleKfs.frames.map(f=>({...f}))}:undefined,
  })),tracks:[...tracks]});
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
        reverse:s.reverse?{...s.reverse}:undefined,
        _compound:s._compound?s._compound.map(c=>JSON.parse(JSON.stringify(c))):undefined,
        styleKfs:s.styleKfs?{frames:s.styleKfs.frames.map(f=>({...f}))}:undefined,
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


// ── Utilities (hoisted here — called at parse time by the migration IIFE above) ──
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
