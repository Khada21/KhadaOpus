// ═══════════════ FADEWORKS EFFECT ════════════════
// Character-by-character left-to-right reveal / hide wipe with trailing opacity glow.
// Data shape: sub.fadeworks = { inMs:500, outMs:500, accel:0, decel:0 }
//   inMs  = ms for full reveal wipe (0 = instant)
//   outMs = ms for full hide wipe   (0 = instant)
//   accel = 0-1 ease-in  strength (starts slow, speeds up)
//   decel = 0-1 ease-out strength (speeds up then slows)
// Skipped for Move subs and Karaoke subs.
// On YTT export: expanded into ~15fps per-character span frames inside move.js buildYTT.

let fadeWorksEditId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasFadeWorks(sub) { return !!(sub && sub.fadeworks); }

// ── Apply / Remove ────────────────────────────────────────────────────────────

function applyFadeWorksToSub(sub) {
  if (hasFadeWorks(sub)) return;
  sub.fadeworks = { inMs: 500, outMs: 500, accel: 0, decel: 0 };
  renderBlocks(); renderSL(); chkYtt();
}

function removeFadeWorksFromSub(sub) {
  if (!sub) return;
  snapshot();
  delete sub.fadeworks;
  renderBlocks(); renderSL(); chkYtt();
  closeFadeWorksEditor();
}

// ── Editor open / close ───────────────────────────────────────────────────────

function openFadeWorksEditor(id) {
  let panelH = 300;
  const insp = document.getElementById('inspector');
  const karaEd = document.getElementById('kara-editor');
  const moveEd = document.getElementById('move-editor');
  const mirEd = document.getElementById('mirror-editor');
  const fadEd = document.getElementById('fade-editor');
  const revEd = document.getElementById('reverse-editor');
  const chrEd = document.getElementById('chroma-editor');
  const fwEd  = document.getElementById('fadeworks-editor');

  if (karaEditId)       { if (karaEd && karaEd.offsetHeight > 0) panelH = karaEd.offsetHeight; closeKaraEditor(); }
  else if (moveEditId)  { if (moveEd && moveEd.offsetHeight > 0) panelH = moveEd.offsetHeight; closeMoveEditor(); }
  else if (mirrorEditId){ if (mirEd && mirEd.offsetHeight > 0) panelH = mirEd.offsetHeight; closeMirrorEditor(); }
  else if (fadeEditId)  { if (fadEd && fadEd.offsetHeight > 0) panelH = fadEd.offsetHeight; closeFadeEditor(); }
  else if (reverseEditId){ if (revEd && revEd.offsetHeight > 0) panelH = revEd.offsetHeight; closeReverseEditor(); }
  else if (chromaEditId){ if (chrEd && chrEd.offsetHeight > 0) panelH = chrEd.offsetHeight; closeChromaEditor(); }
  else if (fadeWorksEditId && fadeWorksEditId !== id) { if (fwEd && fwEd.offsetHeight > 0) panelH = fwEd.offsetHeight; closeFadeWorksEditor(); }
  else { if (insp && insp.offsetHeight > 0) panelH = insp.offsetHeight; }

  fadeWorksEditId = id;
  insp.style.display = 'none';
  karaEd && (karaEd.style.display = 'none');
  moveEd && (moveEd.style.display = 'none');
  mirEd  && (mirEd.style.display  = 'none');
  fadEd  && (fadEd.style.display  = 'none');
  revEd  && (revEd.style.display  = 'none');
  chrEd  && (chrEd.style.display  = 'none');
  fwEd.style.display = 'flex';
  fwEd.style.flex    = 'none';
  fwEd.style.height  = Math.max(260, panelH) + 'px';

  const sub = subs.find(s => s.id === id);
  if (sub && sub.fadeworks) {
    const fw = sub.fadeworks;
    document.getElementById('fw-in').value = fw.inMs;
    document.getElementById('fw-in-v').textContent = fw.inMs + 'ms';
    document.getElementById('fw-out').value = fw.outMs;
    document.getElementById('fw-out-v').textContent = fw.outMs + 'ms';
    document.getElementById('fw-accel').value = fw.accel;
    document.getElementById('fw-accel-v').textContent = Math.round(fw.accel * 100) + '%';
    document.getElementById('fw-decel').value = fw.decel;
    document.getElementById('fw-decel-v').textContent = Math.round(fw.decel * 100) + '%';
  }
  renderBlocks(); renderSL();
}

function closeFadeWorksEditor() {
  const fwEd = document.getElementById('fadeworks-editor');
  const insp = document.getElementById('inspector');
  const h = fwEd ? fwEd.offsetHeight : 0;
  fadeWorksEditId = null;
  if (fwEd) fwEd.style.display = 'none';
  insp.style.display = 'flex';
  insp.style.flex = 'none';
  if (h > 0) insp.style.height = h + 'px';
  renderBlocks(); renderSL();
}

// ── Setters ───────────────────────────────────────────────────────────────────

function fwSetIn(v) {
  const sub = subs.find(s => s.id === fadeWorksEditId); if (!sub || !sub.fadeworks) return;
  sub.fadeworks.inMs = Math.max(0, +v); chkYtt();
}
function fwSetOut(v) {
  const sub = subs.find(s => s.id === fadeWorksEditId); if (!sub || !sub.fadeworks) return;
  sub.fadeworks.outMs = Math.max(0, +v); chkYtt();
}
function fwSetAccel(v) {
  const sub = subs.find(s => s.id === fadeWorksEditId); if (!sub || !sub.fadeworks) return;
  sub.fadeworks.accel = Math.min(1, Math.max(0, +v)); chkYtt();
}
function fwSetDecel(v) {
  const sub = subs.find(s => s.id === fadeWorksEditId); if (!sub || !sub.fadeworks) return;
  sub.fadeworks.decel = Math.min(1, Math.max(0, +v)); chkYtt();
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────────

(function initFadeWorksDnd() {
  function setup() {
    const card = document.getElementById('fx-fadeworks-card');
    if (!card) return;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', 'fadeworks-effect');
      e.dataTransfer.effectAllowed = 'copy';
    });
    document.addEventListener('drop', e => {
      if (e.dataTransfer.getData('text/plain') !== 'fadeworks-effect') return;
      const block = e.target.closest('.sub-block'); if (!block) return;
      e.preventDefault();
      const sub = subs.find(s => s.id === block.dataset.id); if (!sub) return;
      snapshot();
      selId = sub.id; multi.clear();
      if (!hasFadeWorks(sub)) applyFadeWorksToSub(sub);
      openFadeWorksEditor(sub.id);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();

// ── Patch renderBlocks: add FW badge ─────────────────────────────────────────

const _origRenderBlocksFW = renderBlocks;
renderBlocks = function() {
  _origRenderBlocksFW.apply(this, arguments);
  subs.filter(s => hasFadeWorks(s)).forEach(s => {
    const el = document.querySelector(`.sub-block[data-id="${s.id}"]`);
    if (!el) return;
    let badgeRow = el.querySelector('.blk-badge-row');
    if (!badgeRow) { badgeRow = document.createElement('div'); badgeRow.className = 'blk-badge-row'; el.appendChild(badgeRow); }
    const fb = document.createElement('span');
    fb.className = 'blk-fw' + (fadeWorksEditId === s.id ? ' active' : '');
    fb.title = 'FadeWorks — click to edit';
    fb.textContent = 'FW';
    fb.addEventListener('mousedown', e => { e.stopPropagation(); });
    fb.addEventListener('click', e => {
      e.stopPropagation(); selId = s.id; multi.clear();
      if (fadeWorksEditId === s.id) { closeFadeWorksEditor(); } else { openFadeWorksEditor(s.id); }
    });
    badgeRow.appendChild(fb);
  });
};

// ── Patch renderSL: add FW badge in sidebar ───────────────────────────────────

const _origRenderSLFW = renderSL;
renderSL = function() {
  _origRenderSLFW.apply(this, arguments);
  subs.filter(s => hasFadeWorks(s)).forEach(s => {
    const el = document.querySelector(`.sl-item[data-id="${s.id}"]`);
    if (!el || el.querySelector('.sl-fw-btn')) return;
    const fb = document.createElement('button');
    fb.className = 'sl-fw-btn' + (fadeWorksEditId === s.id ? ' active' : '');
    fb.title = 'Edit FadeWorks';
    fb.textContent = 'FW';
    fb.onclick = ev => {
      ev.stopPropagation();
      selId = s.id; multi.clear();
      if (fadeWorksEditId === s.id) { closeFadeWorksEditor(); } else { openFadeWorksEditor(s.id); }
    };
    el.appendChild(fb);
  });
};

// ── Patch existing openXEditor to close FadeWorks editor ─────────────────────

const _patchCloseFW = fn => function(...args) {
  if (fadeWorksEditId) closeFadeWorksEditor();
  return fn.apply(this, args);
};
openMirrorEditor  = _patchCloseFW(openMirrorEditor);
openFadeEditor    = _patchCloseFW(openFadeEditor);
openReverseEditor = _patchCloseFW(openReverseEditor);
openMoveEditor    = _patchCloseFW(openMoveEditor);
openKaraEditor    = _patchCloseFW(openKaraEditor);
openChromaEditor  = _patchCloseFW(openChromaEditor);
