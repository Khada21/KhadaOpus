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

// ═══════════════ BLOCK LOOP / NAVIGATION (SPACE + ARROWS) ═══════════════
let _blockLoopTimer = null;
let _blockPlaying = false; // true while a block is being played

function loopSelectedBlock(){
  const sub = subs.find(s=>s.id===selId);
  if(!sub) return;
  _startBlockPlay(sub);
}

function _startBlockPlay(sub){
  // Always (re)start from the beginning of the block
  if(_blockLoopTimer){ clearTimeout(_blockLoopTimer); _blockLoopTimer=null; }
  const dur2 = sub.endMs - sub.startMs;
  // Seek to block start
  if(player && player._video){
    player._video.currentTime = sub.startMs/1000;
    player.playVideo();
  } else {
    curMs = sub.startMs;
    playing = true;
    document.getElementById('play-icon').textContent = '⏸';
  }
  _blockPlaying = true;
  document.getElementById('btn-loop-block')?.classList.add('active');
  // Stop at block end — leave playhead there, don't loop
  _blockLoopTimer = setTimeout(()=>{
    _stopBlockPlay(sub.endMs);
  }, dur2);
}

function _stopBlockPlay(stopAtMs){
  _blockPlaying = false;
  if(_blockLoopTimer){ clearTimeout(_blockLoopTimer); _blockLoopTimer=null; }
  if(player && player._video){
    player.pauseVideo();
    if(stopAtMs !== undefined) player._video.currentTime = stopAtMs/1000;
  } else {
    playing = false;
    document.getElementById('play-icon').textContent = '▶';
    if(stopAtMs !== undefined) curMs = stopAtMs;
  }
  document.getElementById('btn-loop-block')?.classList.remove('active');
}

// Keep old name as alias for context-menu "Play This Block"
function _startBlockLoop(sub){ _startBlockPlay(sub); }
function _stopBlockLoop(){ _stopBlockPlay(); }

function navBlock(dir){
  // Navigate previous (-1) or next (1) block
  if(karaEditId){
    karNavSyl(dir);
    return;
  }
  const sorted = [...subs].sort((a,b)=>a.startMs-b.startMs);
  if(!sorted.length) return;
  const idx = sorted.findIndex(s=>s.id===selId);
  let next;
  if(idx === -1){
    next = dir > 0 ? sorted[0] : sorted[sorted.length-1];
  } else {
    next = sorted[idx + dir];
  }
  if(next){
    selSub(next.id);
    seekTo(next.startMs);
  }
}

function karNavSyl(dir){
  const sub = subs.find(s=>s.id===karaEditId);
  if(!sub||!sub.karaoke) return;
  const n = sub.karaoke.syllables.length;
  if(karaSelSyl===null) karaSelSyl = dir>0 ? 0 : n-1;
  else karaSelSyl = ((karaSelSyl + dir) + n) % n;
  karaSelSyls = new Set([karaSelSyl]);
  buildSylStrip(); reDrawKaraWave(); updKaraSelEdit();
}

// ── Patch onKey to support block loop + arrow nav ──
const _origOnKey = onKey;
onKey = function(e){
  if(kbRecordingId) return;
  const t = e.target.tagName;
  const isTextEntry = t==='TEXTAREA' || (t==='INPUT' && ['','text','search','number','email','password','url','tel'].includes((e.target.type||'').toLowerCase()));
  const k = keyEventToString(e);

  // Space: always play/pause video regardless of focused panel, except inside actual text fields
  if(keybinds['play']===k && !isTextEntry){
    e.preventDefault();
    if(karaEditId && karaSelSyl!==null){ karaPlaySyllable(); }
    else { togglePlay(); }
    return;
  }

  // Skip all other shortcuts when a form input is focused
  if(t==='TEXTAREA'||t==='INPUT') return;

  // Numpad 0: play selected syllable in karaoke edit mode
  if(e.code==='Numpad0' && karaEditId && karaSelSyl!==null){
    e.preventDefault();
    karaPlaySyllable();
    return;
  }

  // Play selected block (keybind, default Alt)
  if(keybinds['loop-block']===k){
    e.preventDefault();
    if(selId && !karaEditId){ loopSelectedBlock(); }
    return;
  }

  // Arrow navigation
  if(k==='arrowleft'||k==='arrowup'){
    e.preventDefault();
    if(karaEditId){ karNavSyl(-1); return; }
    navBlock(-1); return;
  }
  if(k==='arrowright'||k==='arrowdown'){
    e.preventDefault();
    if(karaEditId){ karNavSyl(1); return; }
    navBlock(1); return;
  }

  // Fall through to original handler for all other keys
  _origOnKey(e);
};

// ═══════════════ CONTEXT MENU ═══════════════
let _ctxTargetId = null;

function showBlockCtxMenu(e, subId){
  e.preventDefault();
  e.stopPropagation();
  _ctxTargetId = subId;
  // Select the block if not already
  if(!multi.has(subId) && selId !== subId){
    selId = subId; multi.clear();
    renderBlocks(); renderSL(); updInsp();
  }

  const menu = document.getElementById('block-ctx-menu');
  menu.innerHTML = '';

  const sub = subs.find(s=>s.id===subId);
  if(!sub) return;

  const isCompound = sub._compound && sub._compound.length > 0;
  const multiIds = multi.size > 1 ? [...multi] : null;

  // Helper to add menu item
  function addItem(label, icon, fn, cls){
    const item = document.createElement('div');
    item.className = 'ctx-item' + (cls?' '+cls:'');
    item.innerHTML = icon + `<span>${label}</span>`;
    item.onclick = ()=>{ closeCtxMenu(); fn(); };
    menu.appendChild(item);
  }
  function addSep(){
    const sep = document.createElement('div');
    sep.className = 'ctx-sep';
    menu.appendChild(sep);
  }

  // Compound block options
  if(isCompound){
    addItem('De-merge Compound',
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="1" y="1" width="9" height="9" rx="1.5"/><rect x="14" y="1" width="9" height="9" rx="1.5"/><rect x="1" y="14" width="9" height="9" rx="1.5"/><rect x="14" y="14" width="9" height="9" rx="1.5"/><path d="M10 5.5 L14 5.5 M10 18.5 L14 18.5" stroke-dasharray="2 1.5"/></svg>',
      ()=>{ demergeCompoundBlock(subId); });
    addSep();
  }

  if(multiIds && multiIds.length > 1 && !isCompound){
    addItem(`Make Compound (${multiIds.length} blocks)`,
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="1" y="1" width="9" height="9" rx="1.5"/><rect x="14" y="1" width="9" height="9" rx="1.5"/><rect x="1" y="14" width="9" height="9" rx="1.5"/><rect x="14" y="14" width="9" height="9" rx="1.5"/></svg>',
      ()=>{ makeCompoundBlock(); });
    addSep();
  }

  // Loop/play this block
  addItem('Play This Block',
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>',
    ()=>{ selSub(subId); loopSelectedBlock(); });

  addSep();

  // Effect toggles
  addItem(hasKaraoke(sub) ? 'Remove Karaoke' : 'Add Karaoke',
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    ()=>{
      snapshot();
      if(hasKaraoke(sub)){ removeKaraokeFromSub(sub); }
      else { applyKaraokeToSub(sub); openKaraEditor(sub.id); }
    });

  addItem(hasReverse(sub) ? 'Edit Reverse' : 'Add Reverse',
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="1" y="5" width="22" height="14" rx="2"/><path d="M5 8 L2 12 L5 16"/><path d="M9 12 L19 12"/></svg>',
    ()=>{
      snapshot();selId=sub.id;multi.clear();
      if(!hasReverse(sub)) applyReverseToSub(sub);
      openReverseEditor(sub.id);
    });

  addItem(hasFade(sub) ? 'Edit Fade' : 'Add Fade',
    '<svg width="13" height="13" viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="28" height="4" fill="currentColor" opacity="1"/><rect x="0" y="6" width="20" height="3" fill="currentColor" opacity="0.75"/><rect x="0" y="11" width="28" height="3" fill="currentColor" opacity="0.5"/><rect x="0" y="16" width="14" height="3" fill="currentColor" opacity="0.25"/></svg>',
    ()=>{
      snapshot();selId=sub.id;multi.clear();
      if(!hasFade(sub)) applyFadeToSub(sub);
      openFadeEditor(sub.id);
    });

  addItem(hasAdjust(sub) ? 'Edit Adjust' : 'Add Adjust',
    '<svg width="13" height="11" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 7 L7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="5 4 8 7 5 10" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M21 7 L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="17 4 14 7 17 10" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    ()=>{
      snapshot();selId=sub.id;multi.clear();
      if(!sub.adjust) applyAdjustToSub(sub);
      openAdjustEditor(sub.id);
    });

  addSep();

  addItem('Duplicate Block',
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    ()=>{
      const s = subs.find(x=>x.id===subId); if(!s) return;
      snapshot();
      const clone = JSON.parse(JSON.stringify(s));
      clone.id = uid();
      clone.startMs = s.endMs;
      clone.endMs = s.endMs + (s.endMs - s.startMs);
      subs.push(clone);
      selId = clone.id; multi.clear();
      syncTracks(); rebuildSidebar(); renderTL(); renderSL(); updInsp();
    });

  addSep();

  addItem('Delete Block',
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
    ()=>{ selId=subId; multi.clear(); deleteSel(); }, 'danger');

  // Position menu
  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 20);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.display = 'block';

  // Close on outside click — ignore clicks that land on the menu itself
  setTimeout(()=>{
    function outsideClose(ev){
      if(!ev.target.closest('#block-ctx-menu')){
        closeCtxMenu();
        document.removeEventListener('mousedown', outsideClose);
      }
    }
    document.addEventListener('mousedown', outsideClose);
  }, 10);

  // Reposition after render
  requestAnimationFrame(()=>{
    const mh = menu.offsetHeight;
    const mw = menu.offsetWidth;
    const ty = Math.min(e.clientY, window.innerHeight - mh - 8);
    const tx = Math.min(e.clientX, window.innerWidth - mw - 8);
    menu.style.top = Math.max(8, ty) + 'px';
    menu.style.left = Math.max(8, tx) + 'px';
  });
}

function closeCtxMenu(){
  document.getElementById('block-ctx-menu').style.display = 'none';
}

// Hook context menu via event delegation on tl-scroll (blocks are recreated each render)
(function initCtxDelegation(){
  function setup(){
    const scroll = document.getElementById('tl-scroll');
    if(!scroll) return;
    scroll.addEventListener('contextmenu', e=>{
      const block = e.target.closest('.sub-block');
      if(!block) return;
      showBlockCtxMenu(e, block.dataset.id);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();

// Also hook context menu on sl-body (subtitle list items)
(function initSlCtxDelegation(){
  function setup(){
    const body = document.getElementById('sl-body');
    if(!body) return;
    body.addEventListener('contextmenu', e=>{
      const item = e.target.closest('.sl-item');
      if(!item) return;
      showBlockCtxMenu(e, item.dataset.id);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();

// ═══════════════ COMPOUND BLOCK ═══════════════
function makeCompoundBlock(){
  const ids = multi.size > 1 ? [...multi] : (selId ? [selId] : []);
  if(ids.length < 2){ alert('Select 2 or more blocks first (Shift+click)'); return; }
  snapshot();
  // Gather and sort selected subs
  const selected = ids.map(id=>subs.find(s=>s.id===id)).filter(Boolean)
    .sort((a,b)=>a.startMs-b.startMs);
  if(selected.length < 2) return;

  // Build compound sub spanning all selected
  const merged = {
    id: uid(),
    startMs: selected[0].startMs,
    endMs: selected[selected.length-1].endMs,
    text: selected.map(s=>s.text).join(' '),
    track: selected[0].track,
    style: {...selected[0].style},
    _compound: selected.map(s=>JSON.parse(JSON.stringify(s))), // store originals
  };

  // Remove originals, add merged
  subs = subs.filter(s=>!ids.includes(s.id));
  subs.push(merged);
  selId = merged.id; multi.clear();
  syncTracks(); rebuildSidebar(); renderTL(); renderSL(); updInsp(); chkYtt();
}

function demergeCompoundBlock(id){
  const sub = subs.find(s=>s.id===id);
  if(!sub||!sub._compound||!sub._compound.length) return;
  snapshot();
  const originals = sub._compound;
  subs = subs.filter(s=>s.id!==id);
  originals.forEach(orig=>{
    // Ensure unique IDs in case of redo weirdness
    subs.push({...orig});
  });
  selId = originals[0]?.id || null; multi.clear();
  syncTracks(); rebuildSidebar(); renderTL(); renderSL(); updInsp(); chkYtt();
}

// Compound renderSL patch — keep only the sidebar list badge
const _origRenderSLForCompound = renderSL;
renderSL = function(){
  _origRenderSLForCompound.apply(this, arguments);
  subs.filter(s=>s._compound&&s._compound.length>0).forEach(s=>{
    const el = document.querySelector(`.sl-item[data-id="${s.id}"]`);
    if(!el) return;
    if(!el.querySelector('.sl-compound-btn')){
      const badge = document.createElement('button');
      badge.className = 'sl-compound-btn' + (s.id===selId?' active':'');
      badge.title = `Compound Block (${s._compound.length} sub-blocks)`;
      badge.textContent = '⊞';
      badge.onclick = ev=>{
        ev.stopPropagation();
        showBlockCtxMenu(ev, s.id);
      };
      el.appendChild(badge);
    }
  });
};

// ═══════════════ REVERSE EFFECT ═══════════════
let reverseEditId = null;

function hasReverse(sub){ return !!(sub && sub.reverse); }

function applyReverseToSub(sub){
  if(hasReverse(sub)) return;
  sub.reverse = {motion: false, text: false, timing: false};
  renderBlocks(); renderSL(); chkYtt();
}

function removeReverseFromSub(sub){
  if(!sub) return;
  snapshot();
  delete sub.reverse;
  renderBlocks(); renderSL(); chkYtt();
  closeReverseEditor();
}

function openReverseEditor(id){
  let panelH = 300;
  const insp = document.getElementById('inspector');
  const karaEd = document.getElementById('kara-editor');
  const moveEd = document.getElementById('move-editor');
  const mirEd = document.getElementById('mirror-editor');
  const fadEd = document.getElementById('fade-editor');
  const revEd = document.getElementById('reverse-editor');

  if(karaEditId){ if(karaEd&&karaEd.offsetHeight>0) panelH=karaEd.offsetHeight; closeKaraEditor(); }
  else if(moveEditId){ if(moveEd&&moveEd.offsetHeight>0) panelH=moveEd.offsetHeight; closeMoveEditor(); }
  else if(mirrorEditId){ if(mirEd&&mirEd.offsetHeight>0) panelH=mirEd.offsetHeight; closeMirrorEditor(); }
  else if(fadeEditId){ if(fadEd&&fadEd.offsetHeight>0) panelH=fadEd.offsetHeight; closeFadeEditor(); }
  else if(reverseEditId&&reverseEditId!==id){ if(revEd&&revEd.offsetHeight>0) panelH=revEd.offsetHeight; closeReverseEditor(); }
  else{ if(insp&&insp.offsetHeight>0) panelH=insp.offsetHeight; }

  reverseEditId = id;
  insp.style.display = 'none';
  if(karaEd) karaEd.style.display = 'none';
  if(moveEd) moveEd.style.display = 'none';
  if(mirEd) mirEd.style.display = 'none';
  if(fadEd) fadEd.style.display = 'none';
  revEd.style.display = 'flex';
  revEd.style.flex = 'none';
  revEd.style.height = Math.max(220, panelH) + 'px';

  const sub = subs.find(s=>s.id===id);
  if(sub && sub.reverse){
    const r = sub.reverse;
    document.getElementById('rev-motion-chk').checked = !!r.motion;
    document.getElementById('rev-text-chk').checked = !!r.text;
    document.getElementById('rev-timing-chk').checked = !!r.timing;
  }
  _updateReversePreview(id);
  renderBlocks(); renderSL();
}

function closeReverseEditor(){
  const revEd = document.getElementById('reverse-editor');
  const insp = document.getElementById('inspector');
  const h = revEd ? revEd.offsetHeight : 0;
  reverseEditId = null;
  if(revEd) revEd.style.display = 'none';
  insp.style.display = 'flex';
  insp.style.flex = 'none';
  if(h > 0) insp.style.height = h + 'px';
  renderBlocks(); renderSL();
}

function revSetMode(key, val){
  const sub = subs.find(s=>s.id===reverseEditId);
  if(!sub||!sub.reverse) return;
  snapshot();
  sub.reverse[key] = val;
  _updateReversePreview(reverseEditId);
  renderBlocks(); renderSL(); chkYtt();
}

function _updateReversePreview(id){
  const sub = subs.find(s=>s.id===id);
  const el = document.getElementById('rev-preview-text');
  if(!el || !sub) return;
  if(!sub.reverse){ el.textContent='—'; return; }
  const parts = [];
  if(sub.reverse.text) parts.push(`"${[...sub.text].reverse().join('')}"`);
  else parts.push(`"${sub.text}"`);
  if(sub.reverse.motion) parts.push('motion reversed');
  if(sub.reverse.timing) parts.push('timing reversed');
  el.textContent = parts.join(' · ') || '— no mode selected';
}

// _getDisplayText is defined near _updOvFast above (hoisted for correct call order)

// ── Reverse DnD ──
(function initReverseDnd(){
  function setup(){
    const card = document.getElementById('fx-reverse-card');
    if(!card) return;
    card.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain','reverse-effect');
      e.dataTransfer.effectAllowed = 'copy';
    });
    document.addEventListener('drop', e=>{
      if(e.dataTransfer.getData('text/plain')!=='reverse-effect') return;
      const block = e.target.closest('.sub-block');
      if(!block) return;
      e.preventDefault();
      const sub = subs.find(s=>s.id===block.dataset.id);
      if(!sub) return;
      snapshot();
      selId = sub.id; multi.clear();
      if(!hasReverse(sub)) applyReverseToSub(sub);
      openReverseEditor(sub.id);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup); else setup();
})();

// ── Patch renderSL to show Reverse badge ──
const _origRenderSLForRev = renderSL;
renderSL = function(){
  _origRenderSLForRev.apply(this, arguments);
  subs.filter(s=>hasReverse(s)).forEach(s=>{
    const el = document.querySelector(`.sl-item[data-id="${s.id}"]`);
    if(!el||el.querySelector('.sl-rev-btn')) return;
    const rb = document.createElement('button');
    rb.className = 'sl-rev-btn' + (reverseEditId===s.id?' active':'');
    rb.title = 'Edit Reverse';
    rb.innerHTML = '<svg width="10" height="9" viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="22" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5 5 L2 10 L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    rb.onclick = ev=>{
      ev.stopPropagation();
      selId = s.id; multi.clear();
      if(reverseEditId===s.id){ closeReverseEditor(); }
      else { openReverseEditor(s.id); }
    };
    el.appendChild(rb);
  });
};

// _getDisplayText is used directly in _updOvFast above — no further patching needed.

// ── Save/load: include reverse + compound ──
// (All new fields are included directly in the source functions above)

// ═══════════════ STOP BLOCK LOOP ON SELECTION CHANGE ═══════════════
const _origSelSubForLoop = selSub;
selSub = function(id, shift){
  _origSelSubForLoop(id, shift);
  if(_blockPlaying) _stopBlockPlay();
};

// ═══════════════ INIT PATCH: hook resize for reverse editor ═══════════════
(function patchResizeForReverse(){
  function setup(){
    const rIS = document.getElementById('resize-insp-sl');
    const revEd = document.getElementById('reverse-editor');
    const slPanel = document.getElementById('sub-list-panel');
    if(!rIS||!revEd||!slPanel) return;
    // The existing resize handler checks karaEd — we need to also handle revEd
    // Since the existing handler is already set up via closure, we add our own patch
    rIS.addEventListener('mousedown', function patchedDown(e2){
      // On any resize of inspector region, also update reverse editor height
      const activePanel = revEd.style.display!=='none' ? revEd : null;
      if(!activePanel) return;
      e2.preventDefault();
      e2.stopImmediatePropagation && e2.stopImmediatePropagation();
      rIS.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      const startY = e2.clientY;
      const startRevH = revEd.offsetHeight;
      const startSlH = slPanel.offsetHeight;
      const totalH = startRevH + startSlH;
      let latestY = startY, raf2 = null;
      function onMove2(e3){
        latestY = e3.clientY;
        if(raf2) return;
        raf2 = requestAnimationFrame(()=>{
          raf2 = null;
          const newRevH = Math.max(80, Math.min(totalH-60, startRevH+(latestY-startY)));
          revEd.style.height = newRevH+'px';
          const insp2 = document.getElementById('inspector');
          if(insp2) insp2.style.height = newRevH+'px';
          slPanel.style.height = (totalH-newRevH)+'px';
        });
      }
      function onUp2(){
        rIS.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove2);
        document.removeEventListener('mouseup', onUp2);
      }
      document.addEventListener('mousemove', onMove2);
      document.addEventListener('mouseup', onUp2);
    }, true); // capture phase so we run before existing handler when revEd is active
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup); else setup();
})();
