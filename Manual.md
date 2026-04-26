# Khada Opus — Full System Documentation

> **For AI assistants and human developers alike.**
> Read this before touching anything. Update this file every time a new feature is added.

---

## ⚠️ CRITICAL: The `.ytt` Signature & XML — Read This First

The `.ytt` file format is the **heart** of how Khada Opus saves and restores everything — text, position, styling, effects, multi-track layout, karaoke timing, fade, mirror, move animations. If you add any new feature that introduces new data on a subtitle object, **you must update three places** or the feature will be silently lost on export/import:

### The Three Places You Must Update for Every New Feature

#### 1. `_wrapYTTWithSig()` in `js/import.js`
This function embeds the full project state as a base64-encoded JSON blob inside an XML comment at the top of the exported `.ytt` file. It looks like this:

```
<!--khada-opus-project:BASE64_ENCODED_JSON-->
<?xml version="1.0"...
```

The JSON contains a snapshot of every subtitle's data. If your new feature adds a property (e.g., `sub.myNewEffect`), you **must** include it here:

```js
function _wrapYTTWithSig(yttXml){
  const data={
    subs:subs.map(s=>({
      ...s,
      style:{...s.style},
      karaoke:s.karaoke?{...s.karaoke,...}:undefined,
      move:s.move?{...s.move,...}:undefined,
      mirror:s.mirror?{...s.mirror}:undefined,
      fade:s.fade?{...s.fade}:undefined,
      reverse:s.reverse?{...s.reverse}:undefined,          // ← Reverse effect
      _compound:s._compound?s._compound.map(c=>JSON.parse(JSON.stringify(c))):undefined, // ← Compound
      myNewEffect:s.myNewEffect?{...s.myNewEffect}:undefined, // ← ADD THIS
    })),
    tracks:[...tracks],
    name:...,
  };
```

#### 2. `saveProject()` in `js/core.js`
This saves to `localStorage`. Same rule — every new effect property must be included in the spread:

```js
function saveProject(){
  const data = {
    subs:subs.map(s=>({
      ...s,
      style:{...s.style},
      karaoke:...,
      move:...,
      mirror:...,
      fade:...,
      reverse:s.reverse?{...s.reverse}:undefined,          // ← Reverse effect
      _compound:s._compound?s._compound.map(c=>JSON.parse(JSON.stringify(c))):undefined, // ← Compound
      myNewEffect:s.myNewEffect?{...s.myNewEffect}:undefined, // ← ADD THIS
    })),
    tracks:[...tracks],
  };
```

#### 3. `deepCloneState()` in `js/core.js`
This handles undo/redo. If your new effect is not deep-cloned here, undo will corrupt it:

```js
function deepCloneState(){
  return JSON.stringify({
    subs:subs.map(s=>({
      ...s,
      style:{...s.style},
      karaoke:s.karaoke?{...s.karaoke,syllables:s.karaoke.syllables.map(sy=>({...sy}))}:undefined,
      reverse:s.reverse?{...s.reverse}:undefined,          // ← Reverse effect
      _compound:s._compound?s._compound.map(c=>JSON.parse(JSON.stringify(c))):undefined, // ← Compound
      myNewEffect:s.myNewEffect?{...s.myNewEffect}:undefined, // ← ADD THIS
    })),
    tracks:[...tracks],
  });
}
```

#### 4. The `.ytt` XML Body in `buildYTT()` (if your feature has a visual export)
If your new feature affects how the subtitle *looks* on YouTube (not just stored in the hidden comment), you also need to update `buildYTT()` so it emits the right XML. The YTT format uses `<pen>`, `<wp>`, `<ws>`, and `<p>` elements — see the YTT Format Reference section below.

**Rule of thumb:** *Any feature that adds a new key to a subtitle object needs to be threaded through all four of the above locations. No exceptions.*

---

## Changelog / Feature History

> **Update this section every time something new is added.**

| Version / Date | What Was Added |
|---|---|
| Initial release | Landing screen, video upload, SRT/VTT/YTT import, timeline with drag/resize, inspector (text, font, colors, position grid, shadow), multi-track auto-assignment, undo/redo (80 steps), export (.ytt, .srt, .vtt), multi-project localStorage persistence, karaoke effect, move (keyframe bezier) effect, mirror effect, fade effect, waveform display, box-select, snap/magnet, keybind customization, help modal |
| Patch 1 | **▶ Video button** in topbar — swap video mid-session without losing subtitles (`loadVideoMidSession()`). **Karaoke space fix** — spaces merged into preceding word via `_splitIntoWordSyllables()`; no standalone space syllables in `applyKaraokeToSub`, `karaAutoSplit`, `karaAutoSplitChars`. **Unified karaoke color** — single `preColor` tint across all syllable bands (Aegisub-style), no rotating `KARA_COLORS`. **Karaoke waveform** — `reDrawKaraWave()` draws real audio waveform scoped to subtitle time window with syllable overlays. CSS: removed `border-right` from `.ke-syl-seg`. |
| Patch 2 | **Karaoke waveform visibility fix** — `reDrawKaraWave()` was called before browser layout so `wrap.clientWidth` was 0. Fixed with double `requestAnimationFrame` wrap in `openKaraEditor()`. Wave area height increased to 120px with explicit `height`. Canvas switched to `position:absolute;inset:0`. Pre-karaoke color opacity slider now triggers live canvas redraw. |
| Patch 3 | **Block Loop Playback** — Space while a subtitle block is selected seeks to that block's start, plays through to its end, then auto-stops (no global play/pause). Pressing Space again while looping stops it. Functions: `loopSelectedBlock()`, `_startBlockLoop(sub)`, `_stopBlockLoop()`. State: `_blockLoopTimer`, `_blockLooping`. **Arrow Key Navigation** — ← / → / ↑ / ↓ navigate between subtitle blocks sorted by `startMs`. In karaoke editor mode, ← / → navigate syllables instead via `karNavSyl(dir)`. **Karaoke Syllable Nav Buttons** — visible ← Prev / ▶ Play Syllable / Next → button row (`.ke-nav-row`, `.ke-play-syl-btn`) added at top of karaoke editor bottom toolbar. **Navigation Buttons in Video Controls** — ◀ Prev Block, ▶ Next Block buttons + loop block button added to the `video-controls` bar (`#btn-prev-block`, `#btn-next-block`, `#btn-loop-block`). **Compound Block** — select 2+ blocks (Shift+click or box-select) then right-click → "Make Compound" or click the "Make Compound" button in the Effects panel. Calls `makeCompoundBlock()` which merges selected subs into one with `_compound: [originalSubs]` stored non-destructively. Right-click a compound block → "De-merge Compound" restores all originals via `demergeCompoundBlock(id)`. Badge: gold ⊞ (`.blk-compound`, `.sl-compound-btn`). **Reverse Effect** — new draggable effect card (red ↩). `sub.reverse = { motion: bool, text: bool, timing: bool }`. Three independent toggle modes: `motion` reverses Move keyframe order on export, `text` displays subtitle characters reversed via `_getDisplayText(sub)`, `timing` reverses karaoke syllable playback. Dedicated editor panel `#reverse-editor` with live preview. Functions: `hasReverse()`, `applyReverseToSub()`, `removeReverseFromSub()`, `openReverseEditor()`, `closeReverseEditor()`, `revSetMode()`. Badge: red ↩ (`.blk-rev`, `.sl-rev-btn`). **Right-Click Context Menu** — right-clicking any timeline block opens a dynamic `#block-ctx-menu` (`showBlockCtxMenu(e, subId)`) with options: Play Block, Make/De-merge Compound, Add/Edit Karaoke, Add/Edit Reverse, Add/Edit Fade, Duplicate Block, Delete Block. **deepCloneState patched** to include `reverse` and `_compound` in undo/redo snapshots. |
| Patch 5 | **Karaoke: click-to-split on waveform** — clicking anywhere on a syllable body in the waveform canvas now splits that syllable at the exact click position (proportional fraction of durMs, character split proportional to fraction). Cursor changes to `crosshair` inside a splittable syllable, `ew-resize` near a boundary handle, `pointer` on a single-char syllable. Helper: `_karaSplitAtPos(sylIdx, frac)`. **Karaoke: multi-select syllables** — Shift+click on syllable strip extends selection as a range from `karaSelSyl` to clicked index. State: `karaSelSyls` (Set of selected indices). Primary selection (`karaSelSyl`) + secondary multi-select shown with dashed outline in both strip and waveform canvas. Keyboard navigation (arrows, Tab/Shift+Tab) resets `karaSelSyls` to `{karaSelSyl}`. **Karaoke: Join multi-select** — `karaJoinSel()` now handles multi-select: merges all selected syllables into one if they are all adjacent (consecutive indices). If not adjacent, join is disabled. **Karaoke: right-click context menu on syllables** — right-click on syl strip segment opens `#kara-ctx-menu` via `_showKaraSylCtxMenu(e, sylIdx)`. Single-select menu: Split by words, Split by letters, Join with next, Delete. Multi-select menu: Join N syllables (disabled if not adjacent), Split selected by words, Split selected by letters, Delete N selected. All items are disabled/grayed when the operation doesn't make sense. **Karaoke: bulk split helpers** — `_karaSplitSelByWords()` and `_karaSplitSelByLetters()` process each selected syllable in reverse-index order so splices don't shift remaining indices. **Karaoke: disabled button states** — `updKaraSelEdit()` now sets `.disabled` on `#ke-btn-split` (disabled if single char or < 100 ms), `#ke-btn-join` (disabled if last syl in single-mode, or not adjacent in multi-mode; text updates to "⊞ Join (N)"), `#ke-btn-del` (disabled if only 1 syl), `#ke-btn-autochars` (disabled if subtitle text is a single char). CSS: `.ke-tbtn:disabled` fades to 35% opacity and sets `cursor:not-allowed`. `.ke-syl-seg.multi-sel` shows dashed outline. |
| Patch 6 | **Outline / Shadow color** — Inspector Shadow/Outline section replaced with an **Outline / Shadow** panel: edge-type dropdown (None / Hard Shadow / Bevel / Glow-Outline / Soft Shadow) + outline color picker + alpha slider. New style properties `outlineColor`, `outlineAlpha`, `outlineType` added to every subtitle object and exported as `et` + `ec` attributes on `<pen>` in YTT. Old shadow boolean fields (`shadowGlow` etc.) remain for backward compatibility when importing older `.ytt` files. **Style Keyframes** — small `◆` keyframe dot buttons appear in the inspector next to Text Color, Font Size, and Outline Color. Clicking a hollow dot records a keyframe for that property at the current playhead position. Clicking a filled dot removes it. On `.ytt` export, subtitles with keyframes are expanded at 10 fps into multiple `<p>` frames with linearly interpolated pen attributes, producing smooth animated color/size transitions on YouTube. Style keyframes are only applied to plain subs (Move or Karaoke subs are unaffected). New file: `js/stylekf.js`. Updated serialization in `_wrapYTTWithSig`, `saveProject`, `deepCloneState`. |
| Patch 7 | **AI Agent** — rainbow `✦ AI` button in topbar opens a chat panel powered by local Ollama that reads the full app state and executes commands (add/delete/edit subs, change styles, apply effects). Includes `↺ Undo AI` one-click revert, `?` help panel with CORS setup guide, model recommendations table, and user-configurable model input. New file: `js/ai.js`. **Chroma Effect** — HSL hue-cycling color animation similar to AegiSub's `{\chroma}` tag. Draggable effect card (`#fx-chroma-card`). Data shape: `sub.chroma = { speed, saturation, lightness, startHue, target }`. Dedicated editor `#chroma-editor` with animated rainbow preview swatch, cycle-speed slider, start-hue slider, saturation slider, lightness slider, target selector (text/outline/both). On YTT export: expanded at 10 fps (same technique as styleKfs / Fade) — produces rapid-fire `<p>` color frames. Works stacked with Fade, Mirror, Reverse. Incompatible with Move and Karaoke. New file: `js/chroma.js`. Updated serialization in `_wrapYTTWithSig`, `saveProject`, `deepCloneState`. |
| Patch 11 | **Karaoke Animation: Reveal** — new animation option `animation:'reveal'` added alongside `'none'` and `'ytk-fade'`. Letters are opacity=0 (invisible) until karaoke reaches them, then fade from fo=0 → fo=100% in N×67ms steps. In YTT export: `unsungText → invPenId` (fo=0 pen), active syl gets N opacity frames `Math.round((k+1)/_revSteps*100)`, `sungText → mainPenId`. In-app preview: unsunk spans have `opacity:0`, active syl interpolates `opacity:0→1`, sung is full color. Button "Reveal" added to Syllable Animation row in karaoke editor. **animSpeed slider** — "Smoothness" range input (1–8, default 4) added to karaoke editor; shown only for `ytk-fade` or `reveal`. Data field: `sub.karaoke.animSpeed` (default 4). Controls N steps for both effects: `N = min(animSpeed, floor(segDur/67))`. YTK Fade now uses `animSpeed` steps (was hardcoded 8). Pen pre-registration updated to register `animSpeed` pens instead of fixed 8. Functions: `karaSetAnimation` updated for 'reveal'; new `_updKaraAnimDesc(v)` and `karaSetAnimSpeed(v)`. **Tracker Effect** — new draggable effect card (purple TR badge). Allows user to select a region on the video preview and auto-track it across N frames using a SAD (sum of absolute differences) pixel-matching algorithm at 25% resolution. UI: "Draw Region on Video" button enters selection mode (cross-hair overlay on video), "Frames" slider (2–60), "Track size" checkbox (placeholder), "Track Object" async button. Result: `sub.tracker.keyframes` (same format as move.keyframes) stored, AND `sub.move` is synthesized from the keyframes so the normal Move export path handles the output. User can then open Move editor to refine the generated path. Data shape: `sub.tracker = { frameCount, trackSize, sel:{x,y,w,h}, keyframes:[], _generatedMove:bool }`. New file: `js/tracker.js`. Badge: purple TR (`.blk-tr`, `.sl-tr-btn`). **Compound block export fix** — `doExport()` in `export.js` now expands `_compound` subs to their originals before passing to `buildYTT`, so compound blocks export as their constituent sub-blocks instead of as a single merged block. SRT/VTT exports also expanded. **Timeline scrollbar** — horizontal scrollbar height increased from 6px to 14px (much easier to grab); thumb updated with border for visual contrast. **YTT warning banner** — replaced `( ˘︹˘ )` emoticon with an SVG warning triangle icon; text restructured with clearer wording ("export as .ytt to keep everything"). |
| Patch 10 | **Karaoke Animation: YTK Fade** — a per-syllable color-interpolation animation option inside the Karaoke editor. Selector (None / YTK Fade) added to a new "Syllable Animation" section at the top of `#kara-editor`. Data shape: `sub.karaoke.animation = 'none' | 'ytk-fade'` (default `'none'`). **Color semantics (applies to all karaoke modes)**: `preColor` = the "pre-karaoke" color — text NOT YET sung (waiting/right-side chars); `mainColor` (the subtitle's base text color) = text ALREADY SUNG. In YTT export: `unsungText → prePenId`, `sungText → mainPenId`. **YTK Fade export**: active syllable steps through `_lerpHex(preColor, mainColor, k/8)` for k=1..N, where N=`min(8, floor(segDur/67ms))`, all at full opacity. After N steps: hold frame shows sung text at `mainPenId`. Mirror ghost karaoke also uses the same pen-assignment (ghostPenId for sung, ghostPrePenId for unsunk). **In-app preview** (`playback.js`): normal karaoke shows `i<asi → mainColor` (sung), `i≥asi → preColor` (unsunk). YTK Fade additionally interpolates the active syl's color using `_lerpHex(preColor, mainColor, step/8)` at 67ms granularity. **FadeWorks reveal fix**: the reveal trail was emitting pens in wrong order (chars flickered 0%→83%→50%→17%→100%); fixed to 0%→17%→50%→83%→100% matching the hide animation (both use `fwPens[FW_TRAIL-i]` for the trail). Fixed in both `move.js` (export) and `playback.js` (preview). **Badge active state**: CH/FW/SK timeline badges now use a solid full-fill active state (matching the K/M/Fade badges) — `background:color; color:#fff` — instead of the previous 20%-opacity fill that was hard to distinguish. **Move overlay panel resize**: `mvDrawOverlay()` is now called during `resize-lr` and `resize-video-tl` panel drag (via RAF in `controls.js`), and also via a `ResizeObserver` on `#vwrap` in `move.js`, so the bezier path SVG redraws correctly when the video panel is resized. **Effect card icon fix**: Chroma, FadeWorks, and Shake fx-card icons updated to use semi-transparent style matching all other effect cards. |
| Patch 9 | **Drag Tool** — new toggle button in the timeline toolbar (between Magnet and the volume separator) and default shortcut `D` (configurable via ⌨ modal). When active, the `#vwrap` video preview gets class `drag-tool-active`, which enables `pointer-events:all` on all `.sub-overlay` divs via CSS. Clicking and dragging any visible subtitle overlay repositions it: for static subs (no Move effect) it sets `style.customX` / `style.customY` (% of video width/height), which already takes precedence over the named `position` (1–9) field in the overlay renderer; for Move subs it translates all keyframes and bezier control points (`x,y,cp1x,cp1y,cp2x,cp2y`) by the drag delta in %, keeping the motion path shape intact. The SVG move path overlay (`#move-overlay`) is refreshed live via `mvDrawOverlay()` when the Move editor is open. Undo snapshot is taken on the first real movement (not on mousedown), so click-to-select costs nothing. The tool is also auto-called in the `drag-tool` keybind entry in `keybinds.js`. Drag indicator: `cursor:grabbing` on `body` during drag; CSS selector `.drag-tool-dragging .sub-overlay{cursor:grabbing!important}`. New file: `js/dragtool.js`. No serialization changes needed — `customX`/`customY` already exist in the subtitle style object and are saved through all persistence paths; `move.keyframes` is already serialized. **FadeWorks direction + mode** — added `direction` ('ltr'|'rtl') and `mode` ('both'|'in-only'|'out-only') fields to the FadeWorks data shape. RTL wipes by reversing the char array so the same `fwReveal`/`fwHide` helpers work unchanged. Mode zeroes out `fwIn` for 'out-only' and `fwOut` for 'in-only'. Direction and mode buttons added to `#fadeworks-editor` with `.fw-dir-btn` / `.fw-mode-btn` styling. **Bug fixes**: FadeWorks+Shake co-existence fixed (`if(s.fadeworks&&!s.shake&&...)` in `move.js`); in-app preview added for FadeWorks (per-char opacity spans), Shake (CSS translate jitter via sin/cos), and Chroma (recomputed `textShadow` with RGB offset during flash window) — all in `playback.js` `_updOvFast()`. |
| Patch 8 | **FadeWorks Effect** — character-by-character left-to-right reveal/hide wipe with a 3-character trailing opacity glow (17% → 50% → 83% → 100%). Draggable effect card (`#fx-fadeworks-card`, cyan FW badge). Data shape: `sub.fadeworks = { inMs, outMs, accel, decel }`. `inMs` = reveal duration, `outMs` = hide duration (both 0 for instant), `accel` (0–1) = ease-in strength (starts slow → speeds up), `decel` (0–1) = ease-out strength (speeds up → slows down). Easing: power-curve blend `t^(1+a*2)` / `1-(1-t)^(1+d*2)`. Dedicated editor `#fadeworks-editor` with Reveal In slider, Hide Out slider, Acceleration slider, Deceleration slider. On YTT export: baked at ~15fps (~67ms frames) directly inside `move.js` `buildYTT` as per-character `<s>` spans with 5 pen opacity levels (0%, 17%, 50%, 83%, 100%). Mirror ghost supported (wipe at reduced opacity). Works stacked with Fade, Mirror, Reverse. Incompatible with Move and Karaoke. New file: `js/fadeworks.js`. Updated `move.js` (pen pre-registration + FadeWorks branch + mirror ghost branch). Updated serialization in `_wrapYTTWithSig`, `saveProject`, `deepCloneState`. **Chroma Effect redesigned** — replaced hue-cycling with chromatic aberration: three simultaneous R/G/B copies at horizontally-offset `wp` positions (±`offset` ah%), emitted at 50% opacity during a brief flash at subtitle start/end. Data shape changed to `sub.chroma = { flashMs, offset }`. Editor simplified to two sliders. `buildYTT` wrapper now emits virtual subs with `_chrAhOffset` property; `move.js` reads it to shift the `wp` position. `stylekf.js` updated to skip FadeWorks subs. **Shake Effect** — randomizes subtitle position at ~15fps using a deterministic seeded PRNG (same export every time). Draggable effect card (`#fx-shake-card`, orange SK badge). Data shape: `sub.shake = { intensity, radius }`. `intensity` (1–10) controls frame rate (1=200ms/frame, 10=50ms/frame), `radius` (1–20) controls max ah/av deviation. Mirror ghost shakes at same mirrored random positions. New file: `js/shake.js`. Updated `move.js` (Shake branch + mirror ghost). Updated serialization in `_wrapYTTWithSig`, `saveProject`, `deepCloneState`. |
| Patch 4 | **Space bar fix** — `keyEventToString()` in `js/keybinds.js` now normalizes `e.key` `' '` (space character) to `'space'` so the play keybind always fires and `e.preventDefault()` blocks timeline scroll. **Alt key / Play Selected Block** — block loop playback key moved from Space to Alt. `loop-block` action added to `KB_DEFAULTS` (default: `'alt'`) and is now part of the full keybind system (customizable via ⌨ modal). The hardcoded `e.key==='alt'` check in `js/features.js` replaced with `keybinds['loop-block']===k`. `tip-loop-key` carrier added to `updateTooltipKeys()` so the tooltip shows the current key. **Import Video button** — topbar video button renamed to "▶ Import Video" and styled green (`.tb-btn.success`). **No-video state** — "No video loaded · drop a video file to start" text replaced with a green ▶ Import Video button inside the `#no-video-state` overlay. **Help modal updated** — "Getting Started" section rewritten to reflect current UI (Upload Video / Import Subtitles / start blank / Import Video in topbar); removed outdated YouTube URL paste instruction. **Loop block button tooltip** — `data-tip` on `#btn-loop-block` updated from "Play selected block (Space when block selected)" to "Play selected block" with `data-tipkey-id="tip-loop-key"`. **Shortcut hint bar** updated to show `ALT=play block`. |

---

## Architecture Overview

Khada Opus is a **single-page web app** with zero build tools, zero dependencies, zero servers. It runs locally in the browser with no data leaving the machine except when exporting.

```
index.html      — All UI markup: landing screen, editor layout, all modals
style.css       — All visual styling: CSS custom properties, layout
js/             — All logic, split into 14 focused files (loaded in order)
app.js          — Legacy single-file backup (kept for reference; not loaded)
```

### JS File Structure

The JavaScript is split across 15 files under `js/`. They share a single global scope — no modules, no bundler. Each file is a logical section of the original `app.js`. **Load order matters**: each file may use globals defined in earlier files.

`index.html` loads them in this exact order:

```html
<script src="js/core.js"></script>       <!-- State, undo/redo, project persistence, utility functions -->
<script src="js/import.js"></script>     <!-- .ytt signature, file import, SRT/VTT/YTT parsers -->
<script src="js/video.js"></script>      <!-- Tooltip engine, video player, landing screen, init -->
<script src="js/playback.js"></script>   <!-- RAF loop, overlay rendering, track management -->
<script src="js/timeline.js"></script>   <!-- Timeline render, drag/resize, inspector, sub list, zoom -->
<script src="js/keybinds.js"></script>   <!-- Keyboard shortcut system, help modal, base onKey -->
<script src="js/export.js"></script>     <!-- Export modal, SRT/VTT/YTT export, base buildYTT -->
<script src="js/karaoke.js"></script>    <!-- Karaoke effect editor, waveform, syllable strip -->
<script src="js/controls.js"></script>   <!-- Snap/magnet, panel resize handles -->
<script src="js/move.js"></script>       <!-- Move (keyframe bezier) effect, SVG overlay, buildYTT monkey-patch -->
<script src="js/effects.js"></script>    <!-- Box select, mirror effect, fade effect -->
<script src="js/features.js"></script>   <!-- Block loop, Alt-key, onKey patch, context menu, compound block, reverse effect, selSub patch -->
<script src="js/chroma.js"></script>     <!-- Chroma (HSL hue-cycle) effect, buildYTT outermost wrapper -->
<script src="js/fadeworks.js"></script>  <!-- FadeWorks (character-wipe reveal/hide) effect, editor, badges -->
<script src="js/shake.js"></script>      <!-- Shake (random position jitter) effect, editor, badges -->
<script src="js/tracker.js"></script>    <!-- Tracker effect — region selection, SAD template matching, Move keyframe generation -->
<script src="js/dragtool.js"></script>   <!-- Drag Tool — reposition subtitle overlays directly on video preview -->
<script src="js/ai.js"></script>         <!-- AI Agent panel (Ollama-powered) -->
```

#### File-by-file contents

| File | Approximate lines | Responsibility |
|------|------------------|----------------|
| `js/core.js` | ~230 | Global state (`subs`, `tracks`, `selId`, `DS`, etc.), undo/redo stack, multi-project localStorage persistence, autosave hook, utility functions (`uid`, `mk`, `ms2x`, `x2ms`, `ha`, `msToDisp`, `msSRT`, `msVTT`, `pad`, `escH`, `escX`, etc.) |
| `js/import.js` | ~120 | `_wrapYTTWithSig()`, `importFile()`, `_processImport()`, `_showImportWarn()`, `_parseSRT()`, `_parseVTT()`, `_parseYTT()` |
| `js/video.js` | ~575 | Tooltip IIFE, `initVideo()`, `loadVideoMidSession()`, `_extractWaveform()`, waveform drawing, landing screen drag-drop, `handleFileLoad()`, `startBlank()`, `enterEditor()`, `togglePlay()`, `skipTime()`, `goHome()`, YouTube embed, `init()`, `loadDemos()` |
| `js/playback.js` | ~255 | `startRaf()`, `_updOvFast()`, `_hlActiveFast()`, `_getDisplayText()`, overlay pool (`_ovPool`), `posCSS_map`, track helpers (`autoAssignTrack`, `syncTracks`, `rebuildSidebar`, `collapseEmpty`) |
| `js/timeline.js` | ~345 | `renderTL()`, `renderRuler()`, `renderBlocks()`, drag (`blockMouseDown`, `onDrag`, `endDrag`), resize (`startRes`), `selSub()`, `updInsp()`, style/position updates, timing helpers (`updTiming`, `setIn`, `setOut`, `deleteSel`), ruler scrub, `renderSL()`, `addSubtitle()`, `chkYtt()`, zoom/vol |
| `js/keybinds.js` | ~200 | `KB_DEFAULTS`, `keybinds` map, `loadKeybinds()`, `saveKeybinds()`, `keyEventToString()`, `keyStringToDisplay()`, `updateTooltipKeys()`, help modal, keybind recorder modal, global keydown capture, base `onKey()` |
| `js/export.js` | ~190 | `openExport()`, `closeExport()`, `doExport()`, `showCopyModal()`, base `buildYTT()` (handles plain subs and karaoke; does not include move/fade/mirror — those are patched by `js/move.js`) |
| `js/karaoke.js` | ~795 | `hasKaraoke()`, karaoke DnD IIFE, `_splitIntoWordSyllables()`, `applyKaraokeToSub()`, `normalizeSylDurs()`, `removeKaraokeFromSub()`, `karaPlaySyllable()`, `openKaraEditor()`, `closeKaraEditor()`, `reDrawKaraWave()`, `buildSylStrip()`, boundary-drag handlers, `updKaraSelEdit()`, toolbar actions, `renderSL` K-badge monkey-patch, `renderBlocks` full monkey-patch (adds all effect badges) |
| `js/controls.js` | ~195 | `toggleSnap()`, `toggleMagnet()`, `applySnapMagnet()`, panel resize IIFE (effects↔video, left↔right columns, inspector↕list, video↕timeline) |
| `js/move.js` | ~1185 | Move effect variables, `hasMove()`, `applyMoveToSub()`, `removeMoveFromSub()`, `openMoveEditor()`, `closeMoveEditor()`, `mvBuildKfList()`, keyframe coord/ease/accel helpers, `mvBezierPoint()`, `mvEaseT()`, `getMoveFrames()`, SVG overlay helpers, `makeDraggable()`, move DnD IIFE, `buildYTT` monkey-patch (full replacement handling fade, mirror, karaoke, move export) |
| `js/dragtool.js` | ~95 | `toggleDragTool()`, drag IIFE — mousedown (capture) on `#vwrap` identifies `.sub-overlay` target, records element center as starting position; mousemove applies delta: Move subs translate all keyframes + control points, static subs set `style.customX`/`customY`; mouseup commits and calls `chkYtt()`. Snapshot taken on first real movement to make drag undoable without cost on click-to-select. |
| `js/effects.js` | ~375 | Box-select IIFE, mirror effect (`hasMirror`, `applyMirrorToSub`, `removeMirrorFromSub`, `openMirrorEditor`, `closeMirrorEditor`, `mirSetAxis`, `mirSetOpacity`, `mirSetOffset`, mirror DnD IIFE, `_renderMirrorOverlay`), fade effect (`hasFade`, `applyFadeToSub`, `removeFadeFromSub`, `openFadeEditor`, `closeFadeEditor`, `fadeSetIn`, `fadeSetOut`, fade DnD IIFE) |
| `js/features.js` | ~570 | Unsaved-changes warning IIFE, `loopSelectedBlock()`, `_startBlockPlay()`, `_stopBlockPlay()`, `navBlock()`, `karNavSyl()`, `onKey` monkey-patch (Alt→block loop, Space global fix, arrow navigation), context menu (`showBlockCtxMenu`, `closeCtxMenu`, delegation IIFEs), compound block (`makeCompoundBlock`, `demergeCompoundBlock`, `renderSL` compound patch), reverse effect (`hasReverse`, `applyReverseToSub`, `removeReverseFromSub`, `openReverseEditor`, `closeReverseEditor`, `revSetMode`, reverse DnD IIFE, `renderSL` reverse badge patch), `selSub` monkey-patch (stop block loop on selection change), resize patch for reverse editor |

#### Critical load-order dependency

`js/core.js` **must** be first. It contains a migration IIFE that calls `uid()` at parse time:

```js
// In core.js — runs immediately on parse
(function(){
  const id = uid();   // ← uid() must already exist
  ...
})();
```

This is why `uid()` and all other utility functions (`mk`, `ms2x`, etc.) are placed at the **bottom of `js/core.js`**, not in `js/karaoke.js` where they originally appeared in `app.js`. Every other file can safely assume utilities are available.

#### Monkey-patching pattern

Several files extend functions defined in earlier files by reassigning them:

```js
// Pattern used in karaoke.js, move.js, features.js:
const _origFn = fn;
fn = function(...args){
  // new logic before/after
  _origFn.apply(this, args);
};
```

Functions extended this way: `renderBlocks`, `renderSL`, `snapshot`, `onKey`, `selSub`, `buildYTT`, `deepCloneState`. The patching file must always load **after** the file that defines the original.

---

## How the App Is Structured (Mental Model)

```
Landing Screen
  ↓ (user uploads video or imports .ytt / starts blank)
Editor Screen
  ├── Topbar (save status, nav, export)
  ├── Left Pane
  │   ├── Effects Panel (drag-and-drop cards)
  │   ├── Video Preview + Overlay (subtitle rendering on video)
  │   ├── Video Controls (play, skip, timecode, FPS, zoom)
  │   └── Timeline (ruler, tracks, waveform, blocks)
  └── Right Column
      ├── Inspector / Effect Editors (stacked, only one visible at a time)
      └── Subtitle List Panel
```

---

## State Model

All mutable state lives in module-level variables (top of `js/core.js`):

```js
const DS = { /* Default Style */ bold, italic, underline, font, fontSize,
              textColor, textAlpha, bgColor, bgAlpha, position,
              customX, customY, shadowGlow, shadowBevel, shadowSoft, shadowHard };

let subs = [];       // Array of subtitle objects (the core data)
let tracks = [0];    // Array of track indices in use (e.g. [0,1,2])
let selId = null;    // ID of currently selected subtitle
let multi = new Set(); // IDs of multi-selected subtitles
let player = null;   // Video player reference
let playing = false;
let dur = 180000;    // Video duration in milliseconds
let curMs = 0;       // Current playhead position in ms
let pxS = 80;        // Pixels per second (timeline zoom)
```

### Subtitle Object Shape

Every subtitle is a plain object:

```js
{
  id: "a3f9bc12",        // Random uid string
  startMs: 1000,         // Start time in milliseconds
  endMs: 4500,           // End time in milliseconds
  text: "Hello world",   // Raw subtitle text
  track: 0,              // Track index (0 = top visible track)
  style: {
    bold: false,
    italic: false,
    underline: false,
    font: "Roboto",
    fontSize: 100,        // Percentage (100 = default)
    textColor: "#ffffff",
    textAlpha: 100,       // 0–100
    bgColor: "#000000",
    bgAlpha: 60,          // 0–100
    position: 2,          // 1–9 (numpad layout: 7=top-left, 5=center, 2=bottom-center)
    customX: null,        // Reserved for future drag-positioned X (% of screen)
    customY: null,        // Reserved for future drag-positioned Y (% of screen)
    shadowGlow: false,    // Legacy — kept for backward compat; use outlineType instead
    shadowBevel: false,
    shadowSoft: false,
    shadowHard: false,
    outlineColor: "#000000", // Edge/outline/shadow color → ec attribute in YTT pen
    outlineAlpha: 100,       // 0–100
    outlineType: 0,          // 0=none, 1=hard shadow, 2=bevel, 3=glow/outline, 4=soft shadow → et attribute
  },
  // Optional effect payloads — undefined when effect not applied:
  karaoke: { syllables: [{text, durMs}], preColor, preAlpha },
  move: { keyframes: [{x, y, ease, accel, decel}], fps },
  mirror: { axis, opacity, offsetX, offsetY },
  fade: { inMs, outMs },
  reverse: { motion: bool, text: bool, timing: bool },
  // Style keyframes — present only when keyframe dots have been set in the inspector:
  styleKfs: { frames: [{ms: 0, textColor?: string, textAlpha?: number, fontSize?: number, outlineColor?: string, outlineAlpha?: number}] },
  // Compound block — present only on merged compound blocks:
  _compound: [ /* array of original subtitle objects (full deep copies) */ ],
}
```

---

## Core Subsystems

### 1. Undo / Redo System

Every user action that mutates `subs` or `tracks` must call `snapshot()` **before** mutating. The snapshot serializes the full state as a JSON string and pushes it onto `undoStack`. Undo pops from that stack and calls `applyState()`.

```
snapshot()  →  JSON.stringify(deepCloneState())  →  undoStack.push(...)
doUndo()    →  redoStack.push(current)  →  applyState(undoStack.pop())
doRedo()    →  undoStack.push(current)  →  applyState(redoStack.pop())
```

Maximum history: 80 steps. `snapshot()` is monkey-patched on startup to also call `scheduleSave()`, so every undoable action also triggers autosave.

---

### 2. Project Persistence (localStorage)

Projects are stored in `localStorage` under two key patterns:

```
khadaOpus_projects_v2          → JSON array of {id, name, savedAt, subsCount} (index)
khadaOpus_proj_<uid>           → Full project JSON for each project
```

On every undoable action, `scheduleSave()` queues a 1.5s debounced `saveProject()` call. The project index is kept separately so the landing screen can list all projects without loading their full data.

A one-time migration from the old `khadaOpus_project_v1` key runs on startup.

---

### 3. The `.ytt` Signature System (Export/Import Roundtrip)

When exporting `.ytt`, the app calls `_wrapYTTWithSig(yttXml)` which prepends a hidden XML comment:

```xml
<!--khada-opus-project:BASE64==-->
<?xml version="1.0" encoding="utf-8"?><timedtext format="3">...
```

The base64 decodes to a JSON object containing the full `subs` array (with all effects) and `tracks`. When this `.ytt` is imported back, `_processImport()` checks for that comment first. If found, it restores from the JSON exactly — no data loss. If the comment is absent (external tool), it falls back to parsing the XML directly (basic timing/text only, effects lost).

**This is why you must update `_wrapYTTWithSig()` for every new effect.** If you don't, the roundtrip silently drops your data.

---

### 4. The `.ytt` XML Format (SRV3 / YouTube Timed Text)

The actual XML that YouTube reads uses this structure:

```xml
<?xml version="1.0" encoding="utf-8"?>
<timedtext format="3">
  <head>
    <pen id="0" b="1" fc="#FFFFFF" fo="255" bc="#000000" bo="153" fs="4" sz="100"/>
    <ws id="0" ju="2" pd="0" sd="0"/>
    <wp id="0" ap="7" ah="50" av="100"/>
  </head>
  <body>
    <p t="1000" d="3500" wp="0" ws="0"><s p="0">Hello world</s></p>
  </body>
</timedtext>
```

Key elements:

- **`<pen>`** — Defines a text style. Attributes: `id`, `b` (bold), `i` (italic), `u` (underline), `fc` (foreground color hex), `fo` (foreground opacity 0–255), `bc` (background color hex), `bo` (background opacity 0–255), `fs` (font: 1=Courier, 2=Times, 3=Lucida/DejaVu, 4=Roboto/Noto, 5=Comic Sans, 6=Corsiva, 7=Carrois), `sz` (font size %), `et` (edge type: 1=hard shadow, 2=bevel, 3=glow, 4=soft shadow).
- **`<ws>`** — Window style (text alignment and padding). `ju`: 0=left, 1=right, 2=center.
- **`<wp>`** — Window position. `ap`: 0–8 (anchor point, numpad layout). `ah`/`av`: horizontal/vertical anchor % (0–100).
- **`<p>`** — A subtitle paragraph. `t`=start ms, `d`=duration ms, `wp`=window position id, `ws`=window style id. Contains `<s>` (span) children, each referencing a `<pen>` by `p` attribute.

The `buildYTT()` function is **monkey-patched** by the Move effect module at startup. The Move module replaces `buildYTT` with a wrapper that handles keyframe animation export, fade steps, and mirror ghost frames on top of the base YTT.

**Position grid mapping (Inspector 3×3 grid → YTT):**

```
7(↖) 8(↑) 9(↗)      ap: 0  1  2      ah/av: [0,0]  [50,0]  [100,0]
4(←) 5(•) 6(→)  →   ap: 3  4  5             [0,50] [50,50] [100,50]
1(↙) 2(↓) 3(↘)      ap: 6  7  8             [0,100][50,100][100,100]
```

Default position is 2 (bottom-center, `ap=7, ah=50, av=100`).

---

### 5. Video Player & Waveform

The app uses the native HTML5 `<video>` element. YouTube URL support was removed (the `initYT()` / YouTube iframe API stubs remain in code but are unused).

On video load, `_extractWaveform()` uses the Web Audio API to decode the audio buffer and compute RMS peaks at 20ms resolution. These peaks are stored in `_waveformSamples` and resampled to the current zoom level in `_buildPeaksForZoom()` before painting on a `<canvas>` in the audio track row.

If waveform extraction fails, `_fakePeaks()` generates a randomized synthetic waveform so the UI is never blank.

The RAF (requestAnimationFrame) loop in `startRaf()` drives all real-time updates: playhead position, timecode display, subtitle overlay rendering on the video, and block highlight. The `setPreviewFps()` function throttles this loop (10/24/30/60/max options).

---

### 6. Timeline

The timeline renders:
- A **ruler** (`renderRuler()`) — tick marks and time labels, step size auto-selected to keep labels ≥60px apart.
- **Track rows** — one `<div.tl-track-row.sub-track>` per track, plus one for the waveform.
- **Subtitle blocks** (`renderBlocks()`) — positioned with `left: ms2x(startMs)px` and `width: ((endMs-startMs)/1000)*pxS px`.

**Zoom** is controlled by `pxS` (pixels per second). The zoom slider maps non-linearly: low end ~10px/s (wide view), high end ~500px/s (fine edit).

**Snap** (`snapEnabled`) snaps block edges to the nearest second grid. **Magnet** (`magnetEnabled`) additionally snaps to edges of other blocks within a tolerance. Both use `applySnapMagnet()`.

**Drag** — clicking a block starts `blockMouseDown()` → `onDrag()` → `endDrag()`. The drag state object `drag` tracks type (`move` or `res`), the original start/end times, and whether any movement occurred (to distinguish click-select from drag-move).

**Multi-select** — Shift+click adds to `multi` Set. Box-select (drag on empty timeline area) uses a floating `<div#box-sel-rect>` and hit-tests all blocks on mouseup.

---

### 7. Inspector

The Inspector panel on the right shows editable fields for the selected subtitle. Changes call `updSty()` or `updText()` or `updTiming()`, which modify `subs`, snapshot, and re-render.

The Inspector is replaced by specialized editors when editing effects:
- **Karaoke Editor** (`#kara-editor`) — shows waveform + syllable strip + syllable controls
- **Move Editor** (`#move-editor`) — shows keyframe list + bezier controls
- **Mirror Editor** (`#mirror-editor`) — shows axis selector, opacity, offset
- **Fade Editor** (`#fade-editor`) — shows fade-in/fade-out duration sliders

Only one editor is visible at a time. Closing an effect editor returns to the Inspector.

---

### 8. Effects System

Effects are drag-and-drop from the Effects panel onto timeline blocks. Each effect has:
1. A **DnD initializer** (e.g., `initKaraDnd()`) — listens for drag events on the effect card and drop events on subtitle blocks.
2. An **apply function** (e.g., `applyKaraokeToSub(sub)`) — adds the effect payload to `sub` and calls `snapshot()`.
3. A **remove function** (e.g., `removeKaraokeFromSub(sub)`) — deletes the payload.
4. An **open/close editor pair** (e.g., `openKaraEditor(id)` / `closeKaraEditor()`).
5. A **badge** on the timeline block (patched into `renderBlocks()`).
6. **Export logic** in `buildYTT()` (or its monkey-patch wrapper).

#### Karaoke Effect
`sub.karaoke = { syllables: [{text, durMs}], preColor, preAlpha }`

Syllables divide the subtitle text into timed chunks. On export, one `<p>` is emitted per syllable transition: the sung portion uses `preColor` and the unsung portion uses the main text color. The Karaoke Editor shows a canvas waveform with draggable syllable boundary handles.

#### Move Effect (Keyframe Bezier)
`sub.move = { keyframes: [{x, y, ease, accel, decel}], fps }`

Positions are in % of video dimensions. On export, the position is interpolated between keyframes using a cubic Bezier curve, then emitted as rapid-fire `<p>` elements (one per frame at the specified FPS) each with a different `<wp>` window position. This is how YouTube subtitle animation is achieved — there is no native animation in the YTT spec; you flood it with frames.

An SVG overlay on the video shows the motion path as a draggable bezier curve with diamond control handles.

#### Mirror Effect
`sub.mirror = { axis: 'x'|'y'|'xy', opacity: 0–100, offsetX: -50–50, offsetY: -50–50 }`

Renders a ghost copy of the subtitle flipped across the chosen axis. On export, this is implemented as a second batch of `<p>` frames for the ghost subtitle. The ghost inherits all effects (including karaoke coloring and move animation) from the original.

#### Fade Effect
`sub.fade = { inMs: 0–5000, outMs: 0–5000 }`

Stepped opacity animation using multiple overlapping `<p>` elements with different `fo` (foreground opacity) values on the `<pen>`. Uses 8 opacity steps. The fade-in emits frames from the subtitle's start, the fade-out from the end.

#### Reverse Effect
`sub.reverse = { motion: bool, text: bool, timing: bool }`

A non-destructive display modifier with three independent modes that can be toggled in any combination:

- **`motion`** — Reverses the Move effect keyframe order on export. The subtitle plays its motion path end-to-start instead of start-to-end. The underlying `sub.move.keyframes` array is not mutated; the reversal is applied during `buildYTT()`.
- **`text`** — Displays the subtitle's characters in reverse order in the video overlay and on the timeline block. Implemented via `_getDisplayText(sub)` which returns `[...sub.text].reverse().join('')` when `reverse.text` is true. The original `sub.text` string is never modified.
- **`timing`** — Reverses karaoke syllable playback order. The syllables array is not mutated; this is applied during playback and export.

The Reverse Editor (`#reverse-editor`) replaces the Inspector when active, showing three checkbox options and a live preview of the reversed text. Badge: red ↩ (`.blk-rev` on timeline, `.sl-rev-btn` in subtitle list).

Key functions: `hasReverse(sub)`, `applyReverseToSub(sub)`, `removeReverseFromSub(sub)`, `openReverseEditor(id)`, `closeReverseEditor()`, `revSetMode(key, val)`, `_updateReversePreview(id)`, `_getDisplayText(sub)`.

---

### 9. Compound Block

A Compound Block merges multiple subtitle blocks into a single timeline block, similar to a compound clip in video editing software. The original blocks are preserved inside `sub._compound` as deep copies.

**Creating:** Select 2+ blocks (Shift+click or box-select), then either:
- Right-click any selected block → **Make Compound**
- Click the **Make Compound** button in the Effects panel (enabled only when 2+ blocks are selected)

**De-merging:** Right-click the compound block → **De-merge Compound** — all original sub-blocks are restored to the timeline exactly as they were.

**Data model:** The compound block spans `startMs` of the first child to `endMs` of the last child. Its `text` is all child texts joined with spaces. It inherits the style of the first child. The `_compound` array contains full deep copies of all original subtitle objects (including their own effects). Compound blocks are included in undo/redo snapshots and localStorage saves.

**Visual:** Gold ⊞ badge on the timeline block and in the subtitle list. The block has a gold left border and subtle gradient background.

**Limitation:** Compound blocks export as a single plain subtitle (their merged text) in `.ytt`/`.srt`/`.vtt`. The internal `_compound` data is preserved in the `.ytt` signature comment for roundtrip fidelity.

---

### 10. Right-Click Context Menu

Right-clicking any subtitle block on the timeline calls `showBlockCtxMenu(e, subId)`, which builds a dynamic dropdown menu (`#block-ctx-menu`) positioned near the cursor. The menu adapts to the current block's state:

- If the block is a compound block → shows **De-merge Compound**
- If 2+ blocks are multi-selected → shows **Make Compound (N blocks)**
- **Play This Block** — seeks to the block's start and loops it
- **Add/Edit Karaoke**, **Add/Edit Reverse**, **Add/Edit Fade** — toggles or opens the respective effect editor
- **Duplicate Block** — clones the block immediately after itself
- **Delete Block** — deletes with undo support

The menu closes on any outside click. `closeCtxMenu()` hides it explicitly.

---

### 11. Block Loop Playback & Navigation

Subtitles are rendered on top of the video as `<div>` elements (`_ovPool` — a pool keyed by subtitle ID). Updated in the RAF loop by `_updOvFast()`. Position is determined by the `position` field (1–9 grid):

```
Position % (top/left of video):
7→(0%,0%)  8→(50%,0%)  9→(100%,0%)
4→(0%,50%) 5→(50%,50%) 6→(100%,50%)
1→(0%,100%)2→(50%,100%)3→(100%,100%)
```

CSS `transform: translate(-X%, -Y%)` is used to anchor the element at the correct corner.

The overlay uses `_getBaseStyle()` to compute the CSS from the subtitle's style object, and `_getOvEl()` to get/create the pool element.

---

### 12. Import / Export

**Import** (`importFile()` → `_processImport()`):
- `.ytt` / `.xml`: Check for Khada signature comment → restore from JSON. Otherwise fall back to `_parseYTT()` (extracts timing/text from XML).
- `.srt`: `_parseSRT()` — splits on double newlines, finds `-->` lines.
- `.vtt`: `_parseVTT()` — similar to SRT with `WEBVTT` header handling.

**Export** (`doExport(fmt)`):
- `.ytt`: `buildYTT(sorted)` → `_wrapYTTWithSig()` → download blob.
- `.srt`: Simple text generation with `HH:MM:SS,mmm --> HH:MM:SS,mmm` timing.
- `.vtt`: Same but `HH:MM:SS.mmm` format with `WEBVTT` header.

A YTT banner warning (`#ytt-banner`) appears in the editor when any YTT-only feature is active (styling, positioning, multi-track, effects), reminding the user that `.srt`/`.vtt` export will strip everything.

---

### 13. Keybind System

All keyboard shortcuts are stored in the `keybinds` object (populated from `KB_DEFAULTS`) and persisted to `localStorage` under `khadaOpus_keybinds_v1`. The Keybind Modal (`#kb-modal`) lists all actions and allows rebinding by clicking a key, then pressing the new combination.

Default bindings:

| Action | Default key |
|---|---|
| Play / Pause | Space |
| Play Selected Block | Alt |
| Skip Back 5s | Shift+← |
| Skip Forward 5s | Shift+→ |
| Set In Point | Q |
| Set Out Point | E |
| Add Block | N |
| Delete Block | Delete |
| Undo | Ctrl+Z |
| Redo | Ctrl+Y |
| Next Block | Tab |
| Previous Block | Shift+Tab |
| Toggle Snap | S |
| Toggle Magnet | M |
| Toggle Drag Tool | D |
| Show Shortcuts | ? |

Note: bare modifier keys (Alt, Ctrl, etc.) cannot be re-assigned back to themselves via the UI recorder — the recorder requires at least one non-modifier key. The default Alt binding for "Play Selected Block" works on load but if changed it cannot be re-assigned to bare Alt through the UI.

---

## Data Flow Summary

```
User action (click/drag/type)
  → snapshot()          [saves pre-action state to undoStack]
  → mutate subs[]       [or tracks[], or style properties]
  → renderTL()          [redraws timeline blocks]
  → renderSL()          [redraws subtitle list panel]
  → updInsp()           [updates inspector fields]
  → scheduleSave()      [queues autosave to localStorage]
  → (RAF loop renders overlay continuously)
```

---

## Files Reference

| File | Purpose | Notable Sections |
|---|---|---|
| `index.html` | UI skeleton | Landing screen, editor layout, all modal markup, effect editor panels |
| `style.css` | All styles | CSS custom properties (`:root`), `.sub-block`, `.fx-card`, `.ke-*` (karaoke editor), `.mir-*` (mirror), panel layout |
| `js/*.js` | All logic (12 files) | See **JS File Structure** section above for the full breakdown |

---

## Adding a New Effect — Step by Step Checklist

1. **Define the payload shape.** E.g., `sub.myEffect = { param1, param2 }`.
2. **Add a card to `#effects-body` in `index.html`** with `draggable="true"` and a matching `id`.
3. **Add an editor panel in `index.html`** (hidden by default, same pattern as `#fade-editor`).
4. **Add a new JS file** (e.g., `js/myeffect.js`) **or append to `js/features.js`** if it's small. Add the `<script>` tag to `index.html` after `js/effects.js` and before `js/features.js`.
   - `hasMyEffect(sub)` — returns true if effect is applied.
   - `applyMyEffectToSub(sub)` — adds payload, calls `snapshot()`.
   - `removeMyEffectFromSub(sub)` — deletes payload, calls `snapshot()`.
   - `openMyEffectEditor(id)` / `closeMyEffectEditor()` — show/hide editor panel.
   - `initMyEffectDnd()` — drag-and-drop from effects card to timeline block.
   - Any setter functions for the editor controls.
5. **Patch `renderBlocks()`** to add a badge on blocks that have the effect.
6. **Update `buildYTT()` (or its monkey-patch)** to emit the correct YTT XML.
7. **Update `_wrapYTTWithSig()`** — include `myEffect` in the subs spread.
8. **Update `saveProject()`** — include `myEffect` in the subs spread.
9. **Update `deepCloneState()`** — deep-clone `myEffect`.
10. **Add to this changelog table** at the top of this document.

---

## Known Patterns & Gotchas

- **`buildYTT()` is monkey-patched.** `js/move.js` replaces the `buildYTT` defined in `js/export.js` with a full wrapper that handles move frames, fade steps, mirror ghost frames, and karaoke. The base `buildYTT` in `js/export.js` is the fallback for plain subs and simple karaoke only.
- **`renderBlocks()` and `renderSL()` are multiply monkey-patched** — by the Karaoke module (K badge), Move module (M badge), Fade module (F badge), Mirror module (mirror badge), and now also by the Compound module (⊞ badge), Reverse module (↩ badge), and the Context Menu module (which attaches `contextmenu` listeners after every render). Each patch chains to the previous via a captured reference. The order of patching matters — patches applied later run first.
- **`snapshot()` is monkey-patched** to also call `scheduleSave()`.
- **`deepCloneState()` is monkey-patched** by Patch 3 to include `reverse` and `_compound` fields.
- **`onKey()` is monkey-patched** by Patch 3 to intercept arrow keys (block navigation / syllable navigation) and Space (block loop) before falling through to the original handler.
- **`selSub()` is monkey-patched twice** by Patch 3: once to update the "Make Compound" button disabled state, once to stop any active block loop.
- **`pxS`** (pixels per second) controls all timeline geometry. Changing it requires a full `renderTL()` call.
- **`ms2x(ms)`** and **`x2ms(x)`** are the coordinate conversion helpers — always use these, never do the math inline.
- **Position `customX`/`customY`** are set by the **Drag Tool** (`js/dragtool.js`) when the user drags a static subtitle overlay. Once set, they override the named `position` (1–9) field in the overlay renderer and in YTT `wp` coordinates. They are already serialized through all persistence paths (style spread).
- **Track 0 always exists.** `collapseEmpty()` re-packs tracks but always preserves index 0.
- **`uid()`** generates 8-character random base-36 strings. Used for subtitle IDs and project IDs.
- **Compound blocks export as plain subtitles.** The `_compound` array is stored in the `.ytt` signature comment for roundtrip fidelity, but the actual YTT XML body only contains the merged text. De-merge is only possible inside Khada Opus.
- **Reverse.text is display-only.** `_getDisplayText(sub)` returns reversed text for overlay rendering and block labels, but `sub.text` is never mutated. Export functions must call `_getDisplayText(sub)` instead of `sub.text` when `reverse.text` is true.
