// ═══════════════ CHROMA EFFECT ════════════════
// Cycles text/outline color through the full HSL hue wheel during a subtitle's duration.
// Data shape: sub.chroma = { speed:1000, saturation:85, lightness:55, startHue:0, target:'text' }
//   speed      = ms per full 360° hue cycle
//   saturation = 0–100 %
//   lightness  = 0–100 %
//   startHue   = 0–360 starting hue
//   target     = 'text' | 'outline' | 'both'
// On YTT export: expanded into 10fps frame segments (same technique as styleKfs / Fade).
// Skipped for Move subs and Karaoke subs — same restriction as styleKfs.

let chromaEditId = null;
let _chromaRaf = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function _hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  function f(n) {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  }
  return '#' + f(0) + f(8) + f(4);
}

function _chromaColorAt(chroma, msRel) {
  const hue = chroma.startHue + (msRel / Math.max(1, chroma.speed)) * 360;
  return _hslToHex(hue, chroma.saturation, chroma.lightness);
}

function hasChroma(sub) { return !!(sub && sub.chroma); }

// ── Apply / Remove ────────────────────────────────────────────────────────────

function applyChromaToSub(sub) {
  if (hasChroma(sub)) return;
  sub.chroma = { speed: 1000, saturation: 85, lightness: 55, startHue: 0, target: 'text' };
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

  if (karaEditId) { if (karaEd && karaEd.offsetHeight > 0) panelH = karaEd.offsetHeight; closeKaraEditor(); }
  else if (moveEditId) { if (moveEd && moveEd.offsetHeight > 0) panelH = moveEd.offsetHeight; closeMoveEditor(); }
  else if (mirrorEditId) { if (mirEd && mirEd.offsetHeight > 0) panelH = mirEd.offsetHeight; closeMirrorEditor(); }
  else if (fadeEditId) { if (fadEd && fadEd.offsetHeight > 0) panelH = fadEd.offsetHeight; closeFadeEditor(); }
  else if (reverseEditId) { if (revEd && revEd.offsetHeight > 0) panelH = revEd.offsetHeight; closeReverseEditor(); }
  else if (chromaEditId && chromaEditId !== id) { if (chrEd && chrEd.offsetHeight > 0) panelH = chrEd.offsetHeight; closeChromaEditor(); }
  else { if (insp && insp.offsetHeight > 0) panelH = insp.offsetHeight; }

  chromaEditId = id;
  insp.style.display = 'none';
  karaEd && (karaEd.style.display = 'none');
  moveEd && (moveEd.style.display = 'none');
  mirEd && (mirEd.style.display = 'none');
  fadEd && (fadEd.style.display = 'none');
  revEd && (revEd.style.display = 'none');
  chrEd.style.display = 'flex';
  chrEd.style.flex = 'none';
  chrEd.style.height = Math.max(260, panelH) + 'px';

  const sub = subs.find(s => s.id === id);
  if (sub && sub.chroma) {
    const c = sub.chroma;
    document.getElementById('chr-speed').value = c.speed;
    document.getElementById('chr-speed-v').textContent = c.speed + 'ms';
    document.getElementById('chr-sat').value = c.saturation;
    document.getElementById('chr-sat-v').textContent = c.saturation + '%';
    document.getElementById('chr-light').value = c.lightness;
    document.getElementById('chr-light-v').textContent = c.lightness + '%';
    document.getElementById('chr-hue').value = c.startHue;
    document.getElementById('chr-hue-v').textContent = c.startHue + '°';
    document.querySelectorAll('.chroma-target-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.target === c.target));
  }
  _startChromaPreview(id);
  renderBlocks(); renderSL();
}

function closeChromaEditor() {
  const chrEd = document.getElementById('chroma-editor');
  const insp = document.getElementById('inspector');
  const h = chrEd ? chrEd.offsetHeight : 0;
  chromaEditId = null;
  _stopChromaPreview();
  if (chrEd) chrEd.style.display = 'none';
  insp.style.display = 'flex';
  insp.style.flex = 'none';
  if (h > 0) insp.style.height = h + 'px';
  renderBlocks(); renderSL();
}

// ── Setters ───────────────────────────────────────────────────────────────────

function chromaSetSpeed(v) {
  const sub = subs.find(s => s.id === chromaEditId); if (!sub || !sub.chroma) return;
  sub.chroma.speed = Math.max(100, +v); chkYtt();
}
function chromaSetSat(v) {
  const sub = subs.find(s => s.id === chromaEditId); if (!sub || !sub.chroma) return;
  sub.chroma.saturation = +v; chkYtt();
}
function chromaSetLight(v) {
  const sub = subs.find(s => s.id === chromaEditId); if (!sub || !sub.chroma) return;
  sub.chroma.lightness = +v; chkYtt();
}
function chromaSetHue(v) {
  const sub = subs.find(s => s.id === chromaEditId); if (!sub || !sub.chroma) return;
  sub.chroma.startHue = +v; chkYtt();
}
function chromaSetTarget(target) {
  const sub = subs.find(s => s.id === chromaEditId); if (!sub || !sub.chroma) return;
  sub.chroma.target = target;
  document.querySelectorAll('.chroma-target-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.target === target));
  chkYtt();
}

// ── Animated preview swatch ───────────────────────────────────────────────────

function _startChromaPreview(id) {
  _stopChromaPreview();
  const el = document.getElementById('chr-preview-swatch');
  if (!el) return;
  let t = 0;
  const FPS = 30;
  const step = 1000 / FPS;
  function tick() {
    const sub = subs.find(s => s.id === id);
    if (!sub || !sub.chroma || !chromaEditId) { _stopChromaPreview(); return; }
    const c = sub.chroma;
    const col = _chromaColorAt(c, t);
    const col2 = _chromaColorAt(c, t + c.speed * 0.5);
    el.style.background = `linear-gradient(90deg, ${col}, ${col2}, ${col})`;
    t = (t + step) % Math.max(1, c.speed);
    _chromaRaf = requestAnimationFrame(tick);
  }
  _chromaRaf = requestAnimationFrame(tick);
}

function _stopChromaPreview() {
  if (_chromaRaf) { cancelAnimationFrame(_chromaRaf); _chromaRaf = null; }
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

// ── buildYTT monkey-patch: outermost wrapper ──────────────────────────────────
// Chroma wraps OUTSIDE stylekf.js, so the color-cycled frames also benefit from
// any styleKfs that were already baked in by the inner stylekf wrapper.
// Skipped for Move and Karaoke subs (same restriction as styleKfs).

const _origBuildYTT_chr = buildYTT;
buildYTT = function(sorted) {
  const expanded = [];
  sorted.forEach(s => {
    if (!hasChroma(s) || hasMove(s) || hasKaraoke(s)) { expanded.push(s); return; }
    const c = s.chroma;
    const FPS = 10;
    const frameDurMs = 1000 / FPS;
    const totalDur = Math.max(1, s.endMs - s.startMs);
    let t = 0;
    while (t < totalDur) {
      const segEnd = Math.min(t + frameDurMs, totalDur);
      const color = _chromaColorAt(c, t);
      const styleOverride = {};
      if (c.target === 'text' || c.target === 'both') styleOverride.textColor = color;
      if (c.target === 'outline' || c.target === 'both') styleOverride.outlineColor = color;
      expanded.push({
        ...s,
        startMs: s.startMs + Math.round(t),
        endMs: s.startMs + Math.round(segEnd),
        style: { ...s.style, ...styleOverride },
        chroma: undefined,
        styleKfs: undefined,
      });
      t += frameDurMs;
    }
  });
  return _origBuildYTT_chr.call(this, expanded);
};
