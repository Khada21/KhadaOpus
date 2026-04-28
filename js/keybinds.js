const KB_STORAGE_KEY='khadaOpus_keybinds_v1';

// Default keybinds — each action has: label, description, defaultKey, currentKey
// Key format: modifiers+Key e.g. "ctrl+z", "shift+left", "space", "q"
const KB_DEFAULTS=[
  {id:'play',      label:'Play / Pause',        desc:'Toggle playback',               def:'space'},
  {id:'skip-back', label:'Skip Back 5s',         desc:'Rewind 5 seconds',              def:'shift+arrowleft'},
  {id:'skip-fwd',  label:'Skip Forward 5s',      desc:'Fast-forward 5 seconds',        def:'shift+arrowright'},
  {id:'loop-block',label:'Play Selected Block',  desc:'Play selected block from start', def:'alt'},
  {id:'set-in',    label:'Set In Point',         desc:'Set block start to playhead',   def:'q'},
  {id:'set-out',   label:'Set Out Point',        desc:'Set block end to playhead',     def:'e'},
  {id:'add',       label:'Add Block',            desc:'Add new subtitle block',        def:'n'},
  {id:'delete',    label:'Delete Block',         desc:'Delete selected block',         def:'delete'},
  {id:'snap',      label:'Toggle Snap',          desc:'Toggle snap to grid',           def:'s'},
  {id:'magnet',    label:'Toggle Magnet',        desc:'Toggle magnet to edges',        def:'m'},
  {id:'frame-snap',label:'Toggle Frame Snap',     desc:'Snap block edges to exact video frame boundaries', def:'f'},
  {id:'drag-tool', label:'Toggle Drag Tool',     desc:'Drag subtitles to reposition on preview', def:'d'},
  {id:'undo',      label:'Undo',                 desc:'Undo last action',              def:'ctrl+z'},
  {id:'redo',      label:'Redo',                 desc:'Redo last undone action',       def:'ctrl+y'},
  {id:'next-block',label:'Next Block',           desc:'Select next subtitle',          def:'tab'},
  {id:'prev-block',label:'Previous Block',       desc:'Select previous subtitle',      def:'shift+tab'},
  {id:'frame-back',    label:'Step Back 1 Frame',    desc:'Move playhead back one video frame',  def:'1'},
  {id:'frame-fwd',     label:'Step Forward 1 Frame', desc:'Move playhead forward one video frame',def:'2'},
  {id:'shortcuts',     label:'Show Shortcuts',       desc:'Open this shortcuts panel',          def:'?'},
  {id:'reset-layout',  label:'Reset Layout',         desc:'Reset all panel sizes to default',   def:'`'},
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
  let k=e.key.toLowerCase();
  if(k===' ')k='space'; // normalize space character to match stored keybind string
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
    'loop-block':'tip-loop-key',
    'snap':'tip-snap-key','magnet':'tip-magnet-key','frame-snap':'tip-frame-snap-key','drag-tool':'tip-drag-key','add':'tip-add-key',
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
    {title:'Playback',ids:['play','skip-back','skip-fwd','loop-block']},
    {title:'Editing',ids:['set-in','set-out','add','delete','undo','redo']},
    {title:'Timeline',ids:['frame-back','frame-fwd','snap','magnet','frame-snap','drag-tool','next-block','prev-block']},
    {title:'App',ids:['shortcuts','reset-layout']},
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
  else if(matches('frame-back')){e.preventDefault();const fps=typeof _previewFps!=='undefined'?_previewFps:30;seekTo(Math.max(0,curMs-1000/fps));}
  else if(matches('frame-fwd')){e.preventDefault();const fps=typeof _previewFps!=='undefined'?_previewFps:30;seekTo(Math.min(dur,curMs+1000/fps));}
  else if(matches('undo')){e.preventDefault();doUndo();}
  else if(matches('redo')){e.preventDefault();doRedo();}
  else if(matches('set-in'))setIn();
  else if(matches('set-out'))setOut();
  else if(matches('add')){e.preventDefault();addSubtitle();}
  else if(matches('snap')){e.preventDefault();toggleSnap();}
  else if(matches('magnet')){e.preventDefault();toggleMagnet();}
  else if(matches('frame-snap')){e.preventDefault();toggleFrameSnap();}
  else if(matches('drag-tool')){e.preventDefault();toggleDragTool();}
  else if(matches('delete')||k==='backspace'){if(selId||multi.size>0){e.preventDefault();deleteSel();}}
  else if(matches('shortcuts')){e.preventDefault();openKbModal();}
  else if(matches('reset-layout')){e.preventDefault();resetLayout();}
  else if(matches('next-block')||matches('prev-block')){
    e.preventDefault();
    if(karaEditId){
      const sub=subs.find(s=>s.id===karaEditId);
      if(sub&&sub.karaoke){
        const n=sub.karaoke.syllables.length;
        if(karaSelSyl===null)karaSelSyl=0;
        else karaSelSyl=matches('prev-block')?(karaSelSyl-1+n)%n:(karaSelSyl+1)%n;
        karaSelSyls=new Set([karaSelSyl]);
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