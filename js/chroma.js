// ═══════════════ CHROMA EFFECT ════════════════
// Chromatic aberration: three simultaneous R/G/B copies of the text at
// horizontally-offset positions, creating a prism/glitch split.
// Appears as a flash at the start and end of the subtitle.
//
// Data shape: sub.chroma = { flashMs: 100, offset: 4 }
//   flashMs = duration of RGB flash at start and end (ms, 0 = instant snap)
//   offset  = horizontal split distance in ah% units (0–20)
//
// YTT export: emits three simultaneous <p> elements during flash periods,
// each at a slightly different ah position with R/G/B colors at 50% opacity.
// Skipped for Move subs — position offsets are relative to the grid position.

// Position map (matches move.js posToAhAv — kept in sync)
const _chrPosToAhAv = {7:[0,0],8:[50,0],9:[100,0],4:[0,50],5:[50,50],6:[100,50],1:[0,100],2:[50,100],3:[100,100]};

let chromaEditId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasChroma(sub) { return !!(sub && sub.chroma); }

// ── Apply / Remove ────────────────────────────────────────────────────────────

function applyChromaToSub(sub) {
  if (hasChroma(sub)) return;
  sub.chroma = { flashMs: 100, offset: 4 };
  renderBlocks(); renderSL(); chkYtt();
}

function removeChromaFromSub(sub) {
  if (!sub) return;
  snapshot();
  delete sub.chroma;
  renderBlocks(); renderSL(); chkYtt();
  closeChromaEditor();
}

// ── Editor open / close ───────────────────────────────────────────────────────

function openChromaEditor(id) {
  let panelH = 300;
  const insp = document.getElementById('inspector');
  const karaEd = document.getElementById('kara-editor');
  const moveEd = document.getElementById('move-editor');
  const mirEd = document.getElementById('mirror-editor');
  const fadEd = document.getElementById('fade-editor');
  const revEd = document.getElementById('reverse-editor');
  const chrEd = document.getElementById('chroma-editor');

  if (karaEditId)       { if (karaEd && karaEd.offsetHeight > 0) panelH = karaEd.offsetHeight; closeKaraEditor(); }
  else if (moveEditId)  { if (moveEd && moveEd.offsetHeight > 0) panelH = moveEd.offsetHeight; closeMoveEditor(); }
  else if (mirrorEditId){ if (mirEd && mirEd.offsetHeight > 0) panelH = mirEd.offsetHeight; closeMirrorEditor(); }
  else if (fadeEditId)  { if (fadEd && fadEd.offsetHeight > 0) panelH = fadEd.offsetHeight; closeFadeEditor(); }
  else if (reverseEditId){ if (revEd && revEd.offsetHeight > 0) panelH = revEd.offsetHeight; closeReverseEditor(); }
  else if (chromaEditId && chromaEditId !== id) { if (chrEd && chrEd.offsetHeight > 0) panelH = chrEd.offsetHeight; closeChromaEditor(); }
  else if (typeof fadeWorksEditId !== 'undefined' && fadeWorksEditId) { const fwEd2 = document.getElementById('fadeworks-editor'); if (fwEd2 && fwEd2.offsetHeight > 0) panelH = fwEd2.offsetHeight; closeFadeWorksEditor(); }
  else if (typeof shakeEditId !== 'undefined' && shakeEditId) { const skEd2 = document.getElementById('shake-editor'); if (skEd2 && skEd2.offsetHeight > 0) panelH = skEd2.offsetHeight; closeShakeEditor(); }
  else { if (insp && insp.offsetHeight > 0) panelH = insp.offsetHeight; }

  chromaEditId = id;
  insp.style.display = 'none';
  karaEd && (karaEd.style.display = 'none');
  moveEd && (moveEd.style.display = 'none');
  mirEd  && (mirEd.style.display  = 'none');
  fadEd  && (fadEd.style.display  = 'none');
  revEd  && (revEd.style.display  = 'none');
  chrEd.style.display = 'flex';
  chrEd.style.flex    = 'none';
  chrEd.style.height  = Math.max(260, panelH) + 'px';

  const sub = subs.find(s => s.id === id);
  if (sub && sub.chroma) {
    const c = sub.chroma;
    document.getElementById('chr-flash').value = c.flashMs ?? 100;
    document.getElementById('chr-flash-v').textContent = (c.flashMs ?? 100) + 'ms';
    document.getElementById('chr-offset').value = c.offset ?? 4;
    document.getElementById('chr-offset-v').textContent = c.offset ?? 4;
  }
  renderBlocks(); renderSL();
}

function closeChromaEditor() {
  const chrEd = document.getElementById('chroma-editor');
  const insp = document.getElementById('inspector');
  const h = chrEd ? chrEd.offsetHeight : 0;
  chromaEditId = null;
  if (chrEd) chrEd.style.display = 'none';
  insp.style.display = 'flex';
  insp.style.flex = 'none';
  if (h > 0) insp.style.height = h + 'px';
  renderBlocks(); renderSL();
}

// ── Setters ───────────────────────────────────────────────────────────────────

function chromaSetFlash(v) {
  const sub = subs.find(s => s.id === chromaEditId); if (!sub || !sub.chroma) return;
  sub.chroma.flashMs = Math.max(0, +v); chkYtt();
}
function chromaSetOffset(v) {
  const sub = subs.find(s => s.id === chromaEditId); if (!sub || !sub.chroma) return;
  sub.chroma.offset = Math.max(0, Math.min(20, +v)); chkYtt();
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────────

(function initChromaDnd() {
  function setup() {
    const card = document.getElementById('fx-chroma-card');
    if (!card) return;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', 'chroma-effect');
      e.dataTransfer.effectAllowed = 'copy';
    });
    document.addEventListener('drop', e => {
      if (e.dataTransfer.getData('text/plain') !== 'chroma-effect') return;
      const block = e.target.closest('.sub-block'); if (!block) return;
      e.preventDefault();
      const sub = subs.find(s => s.id === block.dataset.id); if (!sub) return;
      snapshot();
      selId = sub.id; multi.clear();
      if (!hasChroma(sub)) applyChromaToSub(sub);
      openChromaEditor(sub.id);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();

// ── Patch renderBlocks: add CH badge ─────────────────────────────────────────

const _origRenderBlocksChroma = renderBlocks;
renderBlocks = function() {
  _origRenderBlocksChroma.apply(this, arguments);
  subs.filter(s => hasChroma(s)).forEach(s => {
    const el = document.querySelector(`.sub-block[data-id="${s.id}"]`);
    if (!el) return;
    let badgeRow = el.querySelector('.blk-badge-row');
    if (!badgeRow) { badgeRow = document.createElement('div'); badgeRow.className = 'blk-badge-row'; el.appendChild(badgeRow); }
    const cb = document.createElement('span');
    cb.className = 'blk-chr' + (chromaEditId === s.id ? ' active' : '');
    cb.title = 'Chroma — click to edit';
    cb.textContent = 'CH';
    cb.addEventListener('mousedown', e => { e.stopPropagation(); });
    cb.addEventListener('click', e => {
      e.stopPropagation(); selId = s.id; multi.clear();
      if (chromaEditId === s.id) { closeChromaEditor(); } else { openChromaEditor(s.id); }
    });
    badgeRow.appendChild(cb);
  });
};

// ── Patch renderSL: add chroma badge in sidebar ───────────────────────────────

const _origRenderSLChroma = renderSL;
renderSL = function() {
  _origRenderSLChroma.apply(this, arguments);
  subs.filter(s => hasChroma(s)).forEach(s => {
    const el = document.querySelector(`.sl-item[data-id="${s.id}"]`);
    if (!el || el.querySelector('.sl-chr-btn')) return;
    const cb = document.createElement('button');
    cb.className = 'sl-chr-btn' + (chromaEditId === s.id ? ' active' : '');
    cb.title = 'Edit Chroma';
    cb.textContent = 'CH';
    cb.onclick = ev => {
      ev.stopPropagation();
      selId = s.id; multi.clear();
      if (chromaEditId === s.id) { closeChromaEditor(); } else { openChromaEditor(s.id); }
    };
    el.appendChild(cb);
  });
};

// ── Patch existing openXEditor to close chroma editor ────────────────────────

const _patchCloseChroma = fn => function(...args) {
  if (chromaEditId) closeChromaEditor();
  return fn.apply(this, args);
};
openMirrorEditor  = _patchCloseChroma(openMirrorEditor);
openFadeEditor    = _patchCloseChroma(openFadeEditor);
openReverseEditor = _patchCloseChroma(openReverseEditor);
openMoveEditor    = _patchCloseChroma(openMoveEditor);
openKaraEditor    = _patchCloseChroma(openKaraEditor);

// ── buildYTT monkey-patch ─────────────────────────────────────────────────────
// For each chroma sub, emits three simultaneous RGB-split copies during the
// flash window at the start and end, plus the normal sub for the main body.
// The _chrAhOffset property is read by move.js to shift the wp position.

const _origBuildYTT_chr = buildYTT;
buildYTT = function(sorted) {
  const expanded = [];
  sorted.forEach(s => {
    if (!hasChroma(s) || hasMove(s) || hasKaraoke(s)) { expanded.push(s); return; }
    const c = s.chroma;
    const totalDur = Math.max(1, s.endMs - s.startMs);
    const flashMs = Math.max(0, Math.min(c.flashMs ?? 100, Math.floor(totalDur / 2)));
    const offset = Math.max(0, c.offset ?? 4);
    const [bah] = _chrPosToAhAv[s.style.position || 2] || [50, 100];

    function pushFlash(startMs, endMs) {
      const d = Math.max(1, endMs - startMs);
      // Red — offset right
      expanded.push({ ...s, startMs, endMs: startMs + d,
        style: { ...s.style, textColor: '#FF0000', textAlpha: 50 },
        _chrAhOffset: offset, chroma: undefined, styleKfs: undefined, fadeworks: undefined, shake: undefined, mirror: undefined });
      // Green — center
      expanded.push({ ...s, startMs, endMs: startMs + d,
        style: { ...s.style, textColor: '#00FF00', textAlpha: 50 },
        _chrAhOffset: 0, chroma: undefined, styleKfs: undefined, fadeworks: undefined, shake: undefined, mirror: undefined });
      // Blue — offset left
      expanded.push({ ...s, startMs, endMs: startMs + d,
        style: { ...s.style, textColor: '#0000FF', textAlpha: 50 },
        _chrAhOffset: -offset, chroma: undefined, styleKfs: undefined, fadeworks: undefined, shake: undefined, mirror: undefined });
    }

    if (flashMs > 0) {
      // Intro flash
      pushFlash(s.startMs, s.startMs + flashMs);
      // Main body
      const mainDur = totalDur - flashMs * 2;
      if (mainDur > 0) {
        expanded.push({ ...s, startMs: s.startMs + flashMs, endMs: s.endMs - flashMs,
          chroma: undefined, styleKfs: undefined });
      }
      // Outro flash
      pushFlash(s.endMs - flashMs, s.endMs);
    } else {
      // No flash — whole subtitle is the RGB split
      pushFlash(s.startMs, s.endMs);
    }
  });
  return _origBuildYTT_chr.call(this, expanded);
};
