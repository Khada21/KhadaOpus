// ═══════════════ DRAG TOOL ════════════════
// When active, lets the user click and drag subtitle overlays on the video preview
// to reposition them. For static subs (no Move effect), sets style.customX / customY.
// For Move subs, translates all keyframes + bezier control points by the drag delta,
// keeping the motion path shape intact while moving it as a unit.
// Shortcut: configurable via keybind system (default: D).

let dragToolEnabled = false;

function toggleDragTool() {
  dragToolEnabled = !dragToolEnabled;
  const btn = document.getElementById('btn-drag-tool');
  if (btn) btn.classList.toggle('active', dragToolEnabled);
  const vwrap = document.getElementById('vwrap');
  if (vwrap) vwrap.classList.toggle('drag-tool-active', dragToolEnabled);
}

(function initDragTool() {
  function setup() {
    const vwrap = document.getElementById('vwrap');
    if (!vwrap) return;

    let _dragging = false;
    let _dragSub = null;
    let _hasMoved = false;
    let _startMouseXPct = 0, _startMouseYPct = 0;
    let _startElXPct = 0, _startElYPct = 0;
    let _origKfs = null; // snapshot of keyframes before drag starts

    // Capture phase so we intercept before the overlay's pointer-events:none kicks in
    vwrap.addEventListener('mousedown', function(e) {
      if (!dragToolEnabled) return;
      const el = e.target.closest('.sub-overlay');
      if (!el) return;
      const subId = el.dataset.subId;
      const sub = subs.find(s => s.id === subId);
      if (!sub) return;

      e.preventDefault();
      e.stopPropagation();

      _dragging = true;
      _hasMoved = false;
      _dragSub = sub;

      const vRect = vwrap.getBoundingClientRect();
      _startMouseXPct = (e.clientX - vRect.left) / vRect.width * 100;
      _startMouseYPct = (e.clientY - vRect.top) / vRect.height * 100;

      // Read rendered element center to use as starting drag origin
      const elRect = el.getBoundingClientRect();
      _startElXPct = (elRect.left + elRect.width / 2 - vRect.left) / vRect.width * 100;
      _startElYPct = (elRect.top + elRect.height / 2 - vRect.top) / vRect.height * 100;

      if (typeof hasMove === 'function' && hasMove(sub)) {
        _origKfs = sub.move.keyframes.map(kf => ({ ...kf }));
      } else {
        _origKfs = null;
      }

      // Select the dragged sub
      selId = sub.id;
      multi.clear();
      renderBlocks();

      document.body.style.cursor = 'grabbing';
      vwrap.classList.add('drag-tool-dragging');
    }, true);

    document.addEventListener('mousemove', function(e) {
      if (!_dragging || !_dragSub) return;

      const vRect = vwrap.getBoundingClientRect();
      const mouseXPct = (e.clientX - vRect.left) / vRect.width * 100;
      const mouseYPct = (e.clientY - vRect.top) / vRect.height * 100;
      const dxPct = mouseXPct - _startMouseXPct;
      const dyPct = mouseYPct - _startMouseYPct;

      // Take undo snapshot on the first real movement (not on mousedown, so click-to-select costs nothing)
      if (!_hasMoved && (Math.abs(dxPct) > 0.3 || Math.abs(dyPct) > 0.3)) {
        snapshot();
        _hasMoved = true;
      }
      if (!_hasMoved) return;

      if (_origKfs) {
        // Move sub — translate all keyframes and bezier control points as a unit
        _dragSub.move.keyframes.forEach((kf, i) => {
          const o = _origKfs[i];
          kf.x = Math.max(0, Math.min(100, o.x + dxPct));
          kf.y = Math.max(0, Math.min(100, o.y + dyPct));
          if (o.cp1x !== undefined) { kf.cp1x = o.cp1x + dxPct; kf.cp1y = o.cp1y + dyPct; }
          if (o.cp2x !== undefined) { kf.cp2x = o.cp2x + dxPct; kf.cp2y = o.cp2y + dyPct; }
        });
        // Keep SVG path overlay in sync if Move editor is open for this sub
        if (typeof moveEditId !== 'undefined' && moveEditId === _dragSub.id && typeof mvDrawOverlay === 'function') {
          mvDrawOverlay();
        }
      } else {
        // Static sub — set custom position (overrides named position 1–9)
        _dragSub.style.customX = Math.round(Math.max(0, Math.min(100, _startElXPct + dxPct)) * 10) / 10;
        _dragSub.style.customY = Math.round(Math.max(0, Math.min(100, _startElYPct + dyPct)) * 10) / 10;
      }
    });

    document.addEventListener('mouseup', function() {
      if (!_dragging) return;
      if (_hasMoved) chkYtt();
      _dragging = false;
      _dragSub = null;
      _origKfs = null;
      _hasMoved = false;
      document.body.style.cursor = '';
      vwrap.classList.remove('drag-tool-dragging');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
