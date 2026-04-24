# Khada Opus — Full System Documentation

> **For AI assistants and human developers alike.**
> Read this before touching anything. Update this file every time a new feature is added.

---

## ⚠️ CRITICAL: The `.ytt` Signature & XML — Read This First

The `.ytt` file format is the **heart** of how Khada Opus saves and restores everything — text, position, styling, effects, multi-track layout, karaoke timing, fade, mirror, move animations. If you add any new feature that introduces new data on a subtitle object, **you must update three places** or the feature will be silently lost on export/import:

### The Three Places You Must Update for Every New Feature

#### 1. `_wrapYTTWithSig()` in `app.js`
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
      myNewEffect:s.myNewEffect?{...s.myNewEffect}:undefined, // ← ADD THIS
    })),
    tracks:[...tracks],
    name:...,
  };
```

#### 2. `saveProject()` in `app.js`
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
      myNewEffect:s.myNewEffect?{...s.myNewEffect}:undefined, // ← ADD THIS
    })),
    tracks:[...tracks],
  };
```

#### 3. `deepCloneState()` in `app.js`
This handles undo/redo. If your new effect is not deep-cloned here, undo will corrupt it:

```js
function deepCloneState(){
  return JSON.stringify({
    subs:subs.map(s=>({
      ...s,
      style:{...s.style},
      karaoke:s.karaoke?{...s.karaoke,syllables:s.karaoke.syllables.map(sy=>({...sy}))}:undefined,
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
| Patch 1 | **▶ Video button** in topbar — swap video mid-session without losing subtitles (`loadVideoMidSession()`). **Karaoke space fix** — spaces are now merged into preceding word (`_splitIntoWordSyllables()`), no standalone space syllables. **Unified karaoke color** — single preColor tint across all syllable bands (Aegisub-style). **Karaoke waveform** — `reDrawKaraWave()` now renders real audio waveform scoped to the subtitle's time window; syllable bands are drawn as transparent overlays on top. CSS: removed `border-right` from `.ke-syl-seg` to eliminate pixel gaps between segments. |

---

## Architecture Overview

Khada Opus is a **single-page web app** with zero build tools, zero dependencies, zero servers. It's three files:

```
index.html   — All UI markup: landing screen, editor layout, all modals
style.css    — All visual styling: CSS custom properties (design tokens), layout
app.js       — All logic: ~4,300 lines of vanilla JavaScript
```

Everything runs locally in the browser. No data leaves the machine except when exporting.

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

All mutable state lives in module-level variables in `app.js`:

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
    shadowGlow: false,
    shadowBevel: false,
    shadowSoft: false,
    shadowHard: false,
  },
  // Optional effect payloads — undefined when effect not applied:
  karaoke: { syllables: [{text, durMs}], preColor, preAlpha },
  move: { keyframes: [{x, y, ease, accel, decel}], fps },
  mirror: { axis, opacity, offsetX, offsetY },
  fade: { inMs, outMs },
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

---

### 9. Subtitle Overlay (Video Preview)

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

### 10. Import / Export

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

### 11. Keybind System

All keyboard shortcuts are stored in a `KEYBINDS` object and persisted to `localStorage` under `khadaOpus_keybinds`. The Keybind Modal (`#kb-modal`) lists all actions and allows rebinding by clicking a key, then pressing the new combination. Default bindings include: Space (play), Q (set in), E (set out), N (add block), Delete (delete block), Ctrl+Z (undo), Ctrl+Y (redo), etc.

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
| `app.js` | All logic | State vars, undo/redo, persistence, import/export, video, timeline, inspector, all 4 effects, overlay, keybinds |

---

## Adding a New Effect — Step by Step Checklist

1. **Define the payload shape.** E.g., `sub.myEffect = { param1, param2 }`.
2. **Add a card to `#effects-body` in `index.html`** with `draggable="true"` and a matching `id`.
3. **Add an editor panel in `index.html`** (hidden by default, same pattern as `#fade-editor`).
4. **In `app.js`:**
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

- **`buildYTT()` is monkey-patched.** The Move effect module (`// ═══ MOVE EFFECT`) replaces the original `buildYTT` with a wrapper on startup. The wrapper handles everything (move frames, fade steps, mirror ghost frames, karaoke), so the base `buildYTT` defined earlier in the file is the fallback only.
- **`renderBlocks()` and `renderSL()` are also monkey-patched** by the Karaoke module to add K/M/F badges.
- **`snapshot()` is monkey-patched** to also call `scheduleSave()`.
- **`pxS`** (pixels per second) controls all timeline geometry. Changing it requires a full `renderTL()` call.
- **`ms2x(ms)`** and **`x2ms(x)`** are the coordinate conversion helpers — always use these, never do the math inline.
- **Position `customX`/`customY`** are currently `null` and reserved for a future drag-to-position feature. Do not use these fields for anything else.
- **Track 0 always exists.** `collapseEmpty()` re-packs tracks but always preserves index 0.
- **`uid()`** generates 8-character random base-36 strings. Used for subtitle IDs and project IDs.
