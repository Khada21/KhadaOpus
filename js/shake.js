// ═══════════════ SHAKE EFFECT ════════════════
// Randomizes subtitle position at ~15fps within a given radius.
// Positions are deterministic (seeded from sub.startMs) — same every export.
//
// Data shape: sub.shake = { intensity: 5, radius: 5 }
//   intensity = 1–10, controls frame rate (1=~200ms/frame, 10=~50ms/frame)
//   radius    = 1–20, max deviation in ah/av percentage units
//
// On YTT export: handled directly inside move.js buildYTT.
// Works with Fade, Mirror, Reverse. Not compatible with Karaoke.

let shakeEditId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasShake(sub) { return !!(sub && sub.shake); }

// ── Apply / Remove ────────────────────────────────────────────────────────────

function applyShakeToSub(sub) {
  if (hasShake(sub)) return;
  sub.shake = { intensity: 5, radius: 5 };
  renderBlocks(); renderSL(); chkYtt();
}

function removeShakeFromSub(sub) {
  if (!sub) return;
  snapshot();
  delete sub.shake;
  renderBlocks(); renderSL(); chkYtt();
  closeShakeEditor();
}

// ── Editor open / close ───────────────────────────────────────────────────────

function openShakeEditor(id) {
  let panelH = 300;
  const insp = document.getElementById('inspector');
  const karaEd = document.getElementById('kara-editor');
  const moveEd = document.getElementById('move-editor');
  const mirEd  = document.getElementById('mirror-editor');
  const fadEd  = document.getElementById('fade-editor');
  const revEd  = document.getElementById('reverse-editor');
  const chrEd  = document.getElementById('chroma-editor');
  const fwEd   = document.getElementById('fadeworks-editor');
  const skEd   = document.getElementById('shake-editor');

  if (karaEditId)        { if (karaEd && karaEd.offsetHeight > 0) panelH = karaEd.offsetHeight; closeKaraEditor(); }
  else if (moveEditId)   { if (moveEd && moveEd.offsetHeight > 0) panelH = moveEd.offsetHeight; closeMoveEditor(); }
  else if (mirrorEditId) { if (mirEd && mirEd.offsetHeight > 0) panelH = mirEd.offsetHeight; closeMirrorEditor(); }
  else if (fadeEditId)   { if (fadEd && fadEd.offsetHeight > 0) panelH = fadEd.offsetHeight; closeFadeEditor(); }
  else if (reverseEditId){ if (revEd && revEd.offsetHeight > 0) panelH = revEd.offsetHeight; closeReverseEditor(); }
  else if (chromaEditId) { if (chrEd && chrEd.offsetHeight > 0) panelH = chrEd.offsetHeight; closeChromaEditor(); }
  else if (typeof fadeWorksEditId !== 'undefined' && fadeWorksEditId) { if (fwEd && fwEd.offsetHeight > 0) panelH = fwEd.offsetHeight; closeFadeWorksEditor(); }
  else if (shakeEditId && shakeEditId !== id) { if (skEd && skEd.offsetHeight > 0) panelH = skEd.offsetHeight; closeShakeEditor(); }
  else { if (insp && insp.offsetHeight > 0) panelH = insp.offsetHeight; }

  shakeEditId = id;
  insp.style.display = 'none';
  karaEd && (karaEd.style.display = 'none');
  moveEd && (moveEd.style.display = 'none');
  mirEd  && (mirEd.style.display  = 'none');
  fadEd  && (fadEd.style.display  = 'none');
  revEd  && (revEd.style.display  = 'none');
  chrEd  && (chrEd.style.display  = 'none');
  fwEd   && (fwEd.style.display   = 'none');
  skEd.style.display = 'flex';
  skEd.style.flex    = 'none';
  skEd.style.height  = Math.max(260, panelH) + 'px';

  const sub = subs.find(s => s.id === id);
  if (sub && sub.shake) {
    const sk = sub.shake;
    document.getElementById('sk-intensity').value = sk.intensity ?? 5;
    document.getElementById('sk-intensity-v').textContent = sk.intensity ?? 5;
    document.getElementById('sk-radius').value = sk.radius ?? 5;
    document.getElementById('sk-radius-v').textContent = sk.radius ?? 5;
  }
  renderBlocks(); renderSL();
}

function closeShakeEditor() {
  const skEd = document.getElementById('shake-editor');
  const insp = document.getElementById('inspector');
  const h = skEd ? skEd.offsetHeight : 0;
  shakeEditId = null;
  if (skEd) skEd.style.display = 'none';
  insp.style.display = 'flex';
  insp.style.flex = 'none';
  if (h > 0) insp.style.height = h + 'px';
  renderBlocks(); renderSL();
}

// ── Setters ───────────────────────────────────────────────────────────────────

function shakeSetIntensity(v) {
  const sub = subs.find(s => s.id === shakeEditId); if (!sub || !sub.shake) return;
  sub.shake.intensity = Math.max(1, Math.min(10, +v)); chkYtt();
}
function shakeSetRadius(v) {
  const sub = subs.find(s => s.id === shakeEditId); if (!sub || !sub.shake) return;
  sub.shake.radius = Math.max(1, Math.min(20, +v)); chkYtt();
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────────

(function initShakeDnd() {
  function setup() {
    const card = document.getElementById('fx-shake-card');
    if (!card) return;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', 'shake-effect');
      e.dataTransfer.effectAllowed = 'copy';
    });
    document.addEventListener('drop', e => {
      if (e.dataTransfer.getData('text/plain') !== 'shake-effect') return;
      const block = e.target.closest('.sub-block'); if (!block) return;
      e.preventDefault();
      const sub = subs.find(s => s.id === block.dataset.id); if (!sub) return;
      snapshot();
      selId = sub.id; multi.clear();
      if (!hasShake(sub)) applyShakeToSub(sub);
      openShakeEditor(sub.id);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();

// ── Patch renderBlocks: add SK badge ─────────────────────────────────────────

const _origRenderBlocksShake = renderBlocks;
renderBlocks = function() {
  _origRenderBlocksShake.apply(this, arguments);
  subs.filter(s => hasShake(s)).forEach(s => {
    const el = document.querySelector(`.sub-block[data-id="${s.id}"]`);
    if (!el) return;
    let badgeRow = el.querySelector('.blk-badge-row');
    if (!badgeRow) { badgeRow = document.createElement('div'); badgeRow.className = 'blk-badge-row'; el.appendChild(badgeRow); }
    const sb = document.createElement('span');
    sb.className = 'blk-sk' + (shakeEditId === s.id ? ' active' : '');
    sb.title = 'Shake — click to edit';
    sb.textContent = 'SK';
    sb.addEventListener('mousedown', e => { e.stopPropagation(); });
    sb.addEventListener('click', e => {
      e.stopPropagation(); selId = s.id; multi.clear();
      if (shakeEditId === s.id) { closeShakeEditor(); } else { openShakeEditor(s.id); }
    });
    badgeRow.appendChild(sb);
  });
};

// ── Patch renderSL: add SK badge in sidebar ───────────────────────────────────

const _origRenderSLShake = renderSL;
renderSL = function() {
  _origRenderSLShake.apply(this, arguments);
  subs.filter(s => hasShake(s)).forEach(s => {
    const el = document.querySelector(`.sl-item[data-id="${s.id}"]`);
    if (!el || el.querySelector('.sl-sk-btn')) return;
    const sb = document.createElement('button');
    sb.className = 'sl-sk-btn' + (shakeEditId === s.id ? ' active' : '');
    sb.title = 'Edit Shake';
    sb.textContent = 'SK';
    sb.onclick = ev => {
      ev.stopPropagation();
      selId = s.id; multi.clear();
      if (shakeEditId === s.id) { closeShakeEditor(); } else { openShakeEditor(s.id); }
    };
    el.appendChild(sb);
  });
};

// ── Patch existing openXEditor to close shake editor ─────────────────────────

const _patchCloseShake = fn => function(...args) {
  if (shakeEditId) closeShakeEditor();
  return fn.apply(this, args);
};
openMirrorEditor  = _patchCloseShake(openMirrorEditor);
openFadeEditor    = _patchCloseShake(openFadeEditor);
openReverseEditor = _patchCloseShake(openReverseEditor);
openMoveEditor    = _patchCloseShake(openMoveEditor);
openKaraEditor    = _patchCloseShake(openKaraEditor);
openChromaEditor  = _patchCloseShake(openChromaEditor);
openFadeWorksEditor = _patchCloseShake(openFadeWorksEditor);
