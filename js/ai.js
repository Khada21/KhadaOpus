// ═══════════════════════════════════════════════════════
//  AI Agent — Ollama-powered subtitle assistant
// ═══════════════════════════════════════════════════════

let _aiOpen = false;
let _aiHistory = [];
let _aiBusy = false;
let _aiDidChange = false;
let _aiHelpOpen = false;

// ─── Panel management ────────────────────────────────────

function toggleAiPanel() {
  _aiOpen ? closeAiPanel() : _openAiPanel();
}

function _openAiPanel() {
  if (typeof karaEditId !== 'undefined' && karaEditId) closeKaraEditor();
  if (typeof moveEditId !== 'undefined' && moveEditId) closeMoveEditor();
  if (typeof mirrorEditId !== 'undefined' && mirrorEditId) closeMirrorEditor();
  if (typeof fadeEditId !== 'undefined' && fadeEditId) closeFadeEditor();
  if (typeof reverseEditId !== 'undefined' && reverseEditId) closeReverseEditor();
  if (typeof chromaEditId !== 'undefined' && chromaEditId) closeChromaEditor();
  if (typeof fadeWorksEditId !== 'undefined' && fadeWorksEditId) closeFadeWorksEditor();
  if (typeof shakeEditId !== 'undefined' && shakeEditId) closeShakeEditor();

  document.getElementById('inspector').style.display = 'none';
  document.getElementById('resize-insp-sl').style.display = 'none';
  document.getElementById('sub-list-panel').style.display = 'none';
  document.getElementById('ai-panel').style.display = 'flex';
  _aiOpen = true;
}

function closeAiPanel() {
  document.getElementById('ai-panel').style.display = 'none';
  document.getElementById('inspector').style.display = 'flex';
  document.getElementById('resize-insp-sl').style.display = '';
  document.getElementById('sub-list-panel').style.display = 'flex';
  _aiOpen = false;
}

function toggleAiHelp() {
  _aiHelpOpen = !_aiHelpOpen;
  document.getElementById('ai-help-panel').style.display = _aiHelpOpen ? 'block' : 'none';
  document.getElementById('ai-help-btn').classList.toggle('ai-help-btn-active', _aiHelpOpen);
}

// ─── Robust JSON extraction ──────────────────────────────
// LLMs often wrap output in markdown fences or add extra text.
// This tries multiple strategies before giving up.

function _aiExtractJSON(raw) {
  const strategies = [
    // 1. Direct parse
    () => JSON.parse(raw.trim()),
    // 2. Strip ```json ... ``` fences
    () => JSON.parse(raw.replace(/^```json\s*/im, '').replace(/```\s*$/m, '').trim()),
    // 3. Strip any ``` fences
    () => JSON.parse(raw.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim()),
    // 4. Bracket-match to find outermost JSON object
    () => {
      const start = raw.indexOf('{');
      if (start === -1) return null;
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < raw.length; i++) {
        const c = raw[i];
        if (esc) { esc = false; continue; }
        if (c === '\\' && inStr) { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
          return JSON.parse(raw.slice(start, i + 1));
        }
      }
      return null;
    }
  ];

  for (const fn of strategies) {
    try {
      const result = fn();
      if (result && typeof result === 'object') return result;
    } catch (_) {}
  }
  return null;
}

// Normalize the parsed object — handle different field names models use
function _aiNormalize(p) {
  if (!p || typeof p !== 'object') return null;

  // Type: normalize to lowercase, accept 'action'/'ACTION'/'Action'/'act' etc.
  const rawType = String(p.type || p.response_type || p.kind || '').toLowerCase().trim();
  const type = rawType.startsWith('action') ? 'action'
             : rawType.startsWith('quest')  ? 'question'
             : rawType;

  // Commands array: models use different field names
  const rawArr = p.commands || p.actions || p.action || p.steps
               || p.tasks || p.edits || p.operations || [];
  const arr = Array.isArray(rawArr) ? rawArr : (rawArr ? [rawArr] : []);

  // Normalize each command's verb field
  const commands = arr.map(c => {
    const verb = String(
      c.cmd || c.command || c.operation || c.action || c.type || c.name || ''
    ).toLowerCase().replace(/[\s\-]/g, '_');
    return { ...c, cmd: verb };
  });

  return {
    type,
    text: p.text || p.question || p.message || p.content || p.clarification || '',
    explanation: p.explanation || p.description || p.summary || p.plan || p.message || '',
    commands
  };
}

// ─── Subtitle lookup (tolerant of partial/wrong IDs) ─────

function _aiFindSub(id) {
  if (!id) return null;
  // Exact
  let s = subs.find(x => x.id === id);
  if (s) return s;
  // Partial (AI may truncate or extend the ID)
  s = subs.find(x => x.id.startsWith(id) || id.startsWith(x.id));
  return s || null;
}

// ─── System prompt ───────────────────────────────────────

function _aiSystemPrompt() {
  const state = {
    subtitleCount: subs.length,
    currentTimeMs: curMs,
    selectedId: selId,
    subtitles: subs.map(s => ({
      id: s.id,
      text: s.text,
      startMs: s.startMs,
      endMs: s.endMs,
      track: s.track,
      style: s.style,
      move: s.move || null,
      fade: s.fade || null,
      mirror: s.mirror || null,
      chroma: s.chroma || null,
      hasKaraoke: !!s.karaoke,
      hasReverse: !!s.reverse
    }))
  };

  return `You are an AI Agent embedded in a subtitle editor called Khada Opus.
You MUST respond with ONLY a single valid JSON object. No markdown. No code fences. No extra text. Just raw JSON.

CURRENT APP STATE:
${JSON.stringify(state, null, 1)}

VIDEO: 1920x1080px. Center=(960,540). All times in milliseconds.

SUBTITLE STYLE FIELDS:
textColor:"#rrggbb", textAlpha:0-255, fontSize:75-300(percent),
bold:bool, italic:bool, underline:bool, font:string,
bgColor:"#rrggbb", bgAlpha:0-255,
position:1-9 (7=top-left,8=top-center,9=top-right,4=mid-left,5=center,6=mid-right,1=bottom-left,2=bottom-center,3=bottom-right),
outlineColor:"#rrggbb", outlineAlpha:0-255, outlineType:"none"|"soft"|"bevel"|"hard", outlineSize:1-20

MOVE KEYFRAME: {x:number, y:number, ease:"linear"|"ease-in"|"ease-out"|"ease-in-out", accel:0, decel:0}

CIRCLE MOVEMENT (radius R, center cx/cy, 13 keyframes):
for i=0 to 12: angle=i*30 degrees; x=cx+R*cos(angle*PI/180); y=cy+R*sin(angle*PI/180)

RESPONSE FORMAT — output EXACTLY one of these two JSON shapes:

If you need clarification:
{"type":"question","text":"your question"}

If you will act:
{"type":"action","explanation":"what you are doing","commands":[...]}

AVAILABLE COMMANDS:
{"cmd":"add_subtitle","text":"...","startMs":N,"endMs":N,"track":0}
{"cmd":"set_text","id":"...","text":"..."}
{"cmd":"set_timing","id":"...","startMs":N,"endMs":N}
{"cmd":"set_style","id":"...","textColor":"#fff","fontSize":150,"bold":true}
{"cmd":"apply_move","id":"...","keyframes":[...],"fps":60}
{"cmd":"remove_move","id":"..."}
{"cmd":"apply_fade","id":"...","inMs":300,"outMs":300}
{"cmd":"remove_fade","id":"..."}
{"cmd":"apply_mirror","id":"...","axis":"x","opacity":40,"offsetX":0,"offsetY":0}
{"cmd":"remove_mirror","id":"..."}
{"cmd":"apply_chroma","id":"...","speed":1000,"saturation":85,"lightness":55,"startHue":0,"target":"text"}
{"cmd":"remove_chroma","id":"..."}
{"cmd":"delete_subtitle","id":"..."}
{"cmd":"delete_all"}
{"cmd":"select_subtitle","id":"..."}

RULES:
- Output raw JSON only — no backticks, no markdown, no explanation outside the JSON
- Use exact subtitle IDs from the state above
- "selected subtitle" = the one with id matching selectedId
- For delete all / erase all / clear all subtitles: use {"cmd":"delete_all"}
- Ask only when genuinely ambiguous — resolve obvious references from state`;
}

// ─── Command executor ────────────────────────────────────

async function _aiExecAll(commands) {
  for (const cmd of commands) {
    if (cmd.id) {
      selId = cmd.id;
      renderTL();
      await _aiSleep(200);
    }
    _aiExecOne(cmd);
    renderTL();
    renderSL();
    updInsp();
    try { chkYtt(); } catch (_) {}
    await _aiSleep(120);
  }
}

function _aiExecOne(cmd) {
  const name = (cmd.cmd || '').toLowerCase().replace(/[\s\-]/g, '_');

  if (name === 'delete_all' || name === 'clear_all' || name === 'deleteall' || name === 'clearall') {
    subs.length = 0;
    selId = null;
    multi.clear();
    try { syncTracks(); } catch (_) {}
    return;
  }

  switch (name) {
    case 'add_subtitle': {
      const uid = Math.random().toString(36).slice(2, 10);
      subs.push({
        id: uid,
        text: cmd.text || '',
        startMs: cmd.startMs ?? curMs,
        endMs: cmd.endMs ?? (curMs + 3000),
        track: cmd.track ?? 0,
        style: Object.assign({}, DS)
      });
      selId = uid;
      try { syncTracks(); } catch (_) {}
      break;
    }
    case 'set_text': {
      const s = _aiFindSub(cmd.id);
      if (s) s.text = cmd.text ?? s.text;
      break;
    }
    case 'set_timing': {
      const s = _aiFindSub(cmd.id);
      if (s) {
        if (cmd.startMs != null) s.startMs = cmd.startMs;
        if (cmd.endMs != null) s.endMs = cmd.endMs;
      }
      break;
    }
    case 'set_style': {
      const s = _aiFindSub(cmd.id);
      if (s) {
        const keys = ['textColor','textAlpha','fontSize','bold','italic','underline','font',
                      'bgColor','bgAlpha','position','outlineColor','outlineAlpha','outlineType',
                      'outlineSize','customX','customY'];
        keys.forEach(k => { if (cmd[k] != null) s.style[k] = cmd[k]; });
      }
      break;
    }
    case 'apply_move': {
      const s = _aiFindSub(cmd.id);
      if (s) s.move = { keyframes: cmd.keyframes || [], fps: cmd.fps || 60 };
      break;
    }
    case 'remove_move': {
      const s = _aiFindSub(cmd.id);
      if (s) delete s.move;
      break;
    }
    case 'apply_fade': {
      const s = _aiFindSub(cmd.id);
      if (s) s.fade = { inMs: cmd.inMs ?? 0, outMs: cmd.outMs ?? 0 };
      break;
    }
    case 'remove_fade': {
      const s = _aiFindSub(cmd.id);
      if (s) delete s.fade;
      break;
    }
    case 'apply_mirror': {
      const s = _aiFindSub(cmd.id);
      if (s) s.mirror = { axis: cmd.axis || 'x', opacity: cmd.opacity ?? 40, offsetX: cmd.offsetX ?? 0, offsetY: cmd.offsetY ?? 0 };
      break;
    }
    case 'remove_mirror': {
      const s = _aiFindSub(cmd.id);
      if (s) delete s.mirror;
      break;
    }
    case 'apply_chroma': {
      const s = _aiFindSub(cmd.id);
      if (s) s.chroma = { speed: cmd.speed ?? 1000, saturation: cmd.saturation ?? 85, lightness: cmd.lightness ?? 55, startHue: cmd.startHue ?? 0, target: cmd.target || 'text' };
      break;
    }
    case 'remove_chroma': {
      const s = _aiFindSub(cmd.id);
      if (s) delete s.chroma;
      break;
    }
    case 'delete_subtitle': {
      const idx = subs.findIndex(x => x.id === cmd.id);
      if (idx === -1 && cmd.id) {
        // Try partial match
        const s = _aiFindSub(cmd.id);
        if (s) { const i2 = subs.indexOf(s); if (i2 !== -1) subs.splice(i2, 1); }
      } else if (idx !== -1) {
        subs.splice(idx, 1);
      }
      if (selId === cmd.id) selId = null;
      try { syncTracks(); } catch (_) {}
      break;
    }
    case 'select_subtitle': {
      const s = _aiFindSub(cmd.id);
      if (s) selId = s.id;
      break;
    }
    default:
      console.warn('[AI Agent] Unknown command:', name, cmd);
  }
}

function _aiSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Chat UI ─────────────────────────────────────────────

function _aiEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function _aiAppendMsg(role, html) {
  const wrap = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = `ai-msg ai-msg-${role}`;
  div.innerHTML = `<span class="ai-msg-from">${role === 'user' ? 'You' : 'AI Agent'}</span><div class="ai-msg-body">${html}</div>`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

// ─── Main send ───────────────────────────────────────────

async function aiSend() {
  if (_aiBusy) return;
  const inp = document.getElementById('ai-input');
  const text = inp.value.trim();
  if (!text) return;

  inp.value = '';
  _aiBusy = true;
  document.getElementById('ai-send-btn').disabled = true;

  _aiAppendMsg('user', _aiEsc(text));
  _aiHistory.push({ role: 'user', content: text });

  // Streaming placeholder
  const wrap = document.getElementById('ai-messages');
  const streamDiv = document.createElement('div');
  streamDiv.className = 'ai-msg ai-msg-ai';
  streamDiv.innerHTML = '<span class="ai-msg-from">AI Agent</span><div class="ai-msg-body"><span class="ai-cursor">▊</span></div>';
  wrap.appendChild(streamDiv);
  wrap.scrollTop = wrap.scrollHeight;
  const bodyEl = streamDiv.querySelector('.ai-msg-body');

  const model = (document.getElementById('ai-model-input')?.value || 'llama3.2').trim();

  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: _aiSystemPrompt() },
          ..._aiHistory
        ],
        stream: true,
        format: 'json',
        options: { temperature: 0.1, num_predict: 2048 }
      })
    });

    if (!res.ok) throw new Error(`ollama_unreachable:${res.status}`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const ln of dec.decode(value).split('\n').filter(Boolean)) {
        try {
          const obj = JSON.parse(ln);
          if (obj.message?.content) {
            full += obj.message.content;
            bodyEl.innerHTML = _aiEsc(full) + '<span class="ai-cursor">▊</span>';
            wrap.scrollTop = wrap.scrollHeight;
          }
        } catch (_) {}
      }
    }

    bodyEl.querySelector('.ai-cursor')?.remove();

    // Log raw output so user can open DevTools to debug
    console.log('[AI Agent] raw response:', full);

    const parsed = _aiExtractJSON(full);
    const norm   = _aiNormalize(parsed);

    console.log('[AI Agent] parsed:', norm);

    if (!norm) {
      throw new Error(`Could not parse AI response as JSON. Raw output logged to console (F12). Try a larger model — llama3.2 (3B) may be too small for complex instructions.`);
    }

    _aiHistory.push({ role: 'assistant', content: full });

    if (norm.type === 'question') {
      bodyEl.innerHTML = `<span class="ai-q-badge">? Needs info</span>${_aiEsc(norm.text)}`;

    } else if (norm.type === 'action') {
      snapshot();
      _aiDidChange = true;
      document.getElementById('ai-undo-btn').disabled = false;

      bodyEl.innerHTML = `${_aiEsc(norm.explanation)}<div class="ai-exec-st" id="ai-exec-st">⟳ Executing ${norm.commands.length} command${norm.commands.length !== 1 ? 's' : ''}…</div>`;
      wrap.scrollTop = wrap.scrollHeight;

      await _aiExecAll(norm.commands);

      const st = document.getElementById('ai-exec-st');
      if (st) st.textContent = `✓ Done (${norm.commands.length} command${norm.commands.length !== 1 ? 's' : ''})`;
      wrap.scrollTop = wrap.scrollHeight;

    } else {
      // Unexpected type — show raw and log
      bodyEl.innerHTML = `<span class="ai-q-badge" style="border-color:rgba(255,59,48,.4);color:var(--red)">Unknown response type: ${_aiEsc(norm.type)}</span><br>${_aiEsc(norm.explanation || norm.text || full)}<br><br><small style="color:var(--text3);font-family:var(--mono)">Check console (F12) for raw output. The model may be too small — try llama3.1:8b or larger.</small>`;
    }

  } catch (err) {
    streamDiv.className = 'ai-msg ai-msg-error';
    const msg = err.message || '';
    if (msg.includes('ollama_unreachable') || msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('failed')) {
      bodyEl.innerHTML = `<b>Cannot reach Ollama.</b><br><br>
1. Start Ollama with CORS enabled:<br>
<code>set OLLAMA_ORIGINS=* &amp;&amp; ollama serve</code><br><br>
2. Make sure you pulled a model:<br>
<code>ollama pull llama3.2</code><br><br>
Click <b>?</b> for full setup guide.`;
    } else {
      bodyEl.innerHTML = `<b>Error:</b> ${_aiEsc(msg)}`;
    }
  }

  _aiBusy = false;
  document.getElementById('ai-send-btn').disabled = false;
}

// ─── Undo AI changes ─────────────────────────────────────

function aiUndo() {
  if (!_aiDidChange) return;
  doUndo();
  _aiDidChange = false;
  document.getElementById('ai-undo-btn').disabled = true;

  const wrap = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-ai';
  div.innerHTML = '<span class="ai-msg-from">AI Agent</span><div class="ai-msg-body">↩ AI changes have been undone.</div>';
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

// ─── Keyboard shortcut ───────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('ai-input');
  if (!inp) return;
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(); }
  });
});
