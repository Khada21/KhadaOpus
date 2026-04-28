function resetLayout(){
  // Restore inline-style defaults that were set in the HTML (clearing them would leave
  // no value at all since CSS doesn't define widths/heights for these elements).
  const el=id=>document.getElementById(id);
  const rc=el('right-col'),lp=el('left-pane');
  if(rc)rc.style.width='380px';
  if(lp)lp.style.width='calc(100% - 380px)';
  // Effects pane width is defined by CSS (155px), so just clear any inline override
  const ep=el('effects-pane');if(ep)ep.style.width='';
  // Video-area / timeline split
  const ur=el('upper-row');
  if(ur)ur.style.height='calc(100vh - 40px - 36px - 36px - 200px)';
  // Inspector / subtitle-list split
  const insp=el('inspector'),karaEd=el('kara-editor'),slp=el('sub-list-panel');
  if(insp){insp.style.flex='1';insp.style.height='';}
  if(karaEd)karaEd.style.height='';
  if(slp)slp.style.height='calc((100vh - 40px) / 2)';
  renderTL();
}

function toggleSnap(){
  snapEnabled=!snapEnabled;
  document.getElementById('btn-snap').classList.toggle('active',snapEnabled);
}
function toggleMagnet(){
  magnetEnabled=!magnetEnabled;
  document.getElementById('btn-magnet').classList.toggle('active',magnetEnabled);
}
function toggleFrameSnap(){
  frameSnapEnabled=!frameSnapEnabled;
  const btn=document.getElementById('btn-frame-snap');
  const sel=document.getElementById('frame-fps-sel');
  if(btn)btn.classList.toggle('active',frameSnapEnabled);
  if(sel)sel.style.opacity=frameSnapEnabled?'1':'0.4';
}
function setFrameSnapFps(fps){
  frameSnapFps=+fps||30;
}

// Apply snap + magnet to a millisecond value during drag
// side: 'start' or 'end', subId: current sub being dragged
function applySnapMagnet(ms,subId,side){
  const SNAP_MS=1000; // snap to nearest second
  const MAG_THRESH=Math.max(80,(80/pxS)*1000); // ~80px in ms

  // Frame snap runs first — highest precision, overridden by magnet if closer
  if(frameSnapEnabled){
    const frameDurMs=1000/Math.max(1,frameSnapFps);
    const snapped=Math.round(ms/frameDurMs)*frameDurMs;
    if(Math.abs(snapped-ms)<MAG_THRESH)ms=snapped;
  }

  if(snapEnabled){
    const snapped=Math.round(ms/SNAP_MS)*SNAP_MS;
    if(Math.abs(snapped-ms)<MAG_THRESH)ms=snapped;
  }

  if(magnetEnabled){
    // Collect all edge times from other subs
    const edges=[];
    subs.forEach(s=>{
      if(s.id===subId)return;
      edges.push(s.startMs,s.endMs);
    });
    let best=null,bestDist=MAG_THRESH;
    edges.forEach(e=>{
      const d=Math.abs(e-ms);
      if(d<bestDist){bestDist=d;best=e;}
    });
    if(best!==null)ms=best;
  }

  return Math.max(0,ms);
}

// ═══════════════ PANEL RESIZE ════════════════
(function(){
  function initResize(){
    // ── Effects ↔ Video (within upper row) ──
    const rEL=document.getElementById('resize-eff-lp');
    const effPane=document.getElementById('effects-pane');
    const upperRow=document.getElementById('upper-row');
    if(rEL && effPane && upperRow){
      rEL.addEventListener('mousedown',function(e){
        e.preventDefault();
        rEL.classList.add('dragging');
        document.body.style.cursor='col-resize';
        document.body.style.userSelect='none';
        const startX=e.clientX;
        const startEffW=effPane.offsetWidth;
        let latestX=startX,raf=null;
        function onMove(e){
          latestX=e.clientX;
          if(raf)return;
          raf=requestAnimationFrame(()=>{
            raf=null;
            const newW=Math.max(100,Math.min(400,startEffW+(latestX-startX)));
            effPane.style.width=newW+'px';
          });
        }
        function onUp(){
          rEL.classList.remove('dragging');
          document.body.style.cursor='';
          document.body.style.userSelect='';
          document.removeEventListener('mousemove',onMove);
          document.removeEventListener('mouseup',onUp);
          renderTL();
        }
        document.addEventListener('mousemove',onMove);
        document.addEventListener('mouseup',onUp);
      });
    }

    // ── Left ↔ Right column ──
    const rLR=document.getElementById('resize-lr');
    const rightCol=document.getElementById('right-col');
    const leftPane=document.getElementById('left-pane');
    const ws=document.getElementById('workspace');    rLR.addEventListener('mousedown',function(e){
      e.preventDefault();
      rLR.classList.add('dragging');
      document.body.style.cursor='col-resize';
      document.body.style.userSelect='none';
      const startX=e.clientX;
      const startW=rightCol.offsetWidth;
      const totalW=ws.offsetWidth;
      let latestX=startX,raf=null;
      function onMove(e){
        latestX=e.clientX;
        if(raf)return;
        raf=requestAnimationFrame(()=>{
          raf=null;
          const newW=Math.max(200,Math.min(700,startW+(startX-latestX)));
          rightCol.style.width=newW+'px';
          leftPane.style.width=(totalW-newW-4)+'px';
          if(typeof moveEditId!=='undefined'&&moveEditId&&typeof mvDrawOverlay==='function')mvDrawOverlay();
        });
      }
      function onUp(){
        rLR.classList.remove('dragging');
        document.body.style.cursor='';
        document.body.style.userSelect='';
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        renderTL();
      }
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });

    // ── Inspector / Karaoke Editor ↕ Subtitle list ──
    const rIS=document.getElementById('resize-insp-sl');
    const insp=document.getElementById('inspector');
    const karaEd=document.getElementById('kara-editor');
    const slPanel=document.getElementById('sub-list-panel');
    rIS.addEventListener('mousedown',function(e){
      e.preventDefault();
      rIS.classList.add('dragging');
      document.body.style.cursor='row-resize';
      document.body.style.userSelect='none';
      const startY=e.clientY;
      // Measure whichever panel is currently visible
      const activePanel=karaEd&&karaEd.style.display!=='none'?karaEd:insp;
      const startInspH=activePanel.offsetHeight;
      const startSlH=slPanel.offsetHeight;
      const totalH=startInspH+startSlH;
      let latestY=startY,raf=null;
      function onMove(e){
        latestY=e.clientY;
        if(raf)return;
        raf=requestAnimationFrame(()=>{
          raf=null;
          const newInspH=Math.max(80,Math.min(totalH-60,startInspH+(latestY-startY)));
          const newSlH=Math.max(60,totalH-newInspH);
          // Apply to both panels so switching doesn't jump
          insp.style.flex='none';
          insp.style.height=newInspH+'px';
          karaEd.style.height=newInspH+'px';
          slPanel.style.height=newSlH+'px';
        });
      }
      function onUp(){
        rIS.classList.remove('dragging');
        document.body.style.cursor='';
        document.body.style.userSelect='';
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
      }
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });

    // ── Video ↕ Timeline ──
    const rVT=document.getElementById('resize-video-tl');
    const videoArea=document.getElementById('upper-row');
    rVT.addEventListener('mousedown',function(e){
      e.preventDefault();
      rVT.classList.add('dragging');
      document.body.style.cursor='row-resize';
      document.body.style.userSelect='none';
      const startY=e.clientY;
      const startH=videoArea.offsetHeight;
      const paneH=leftPane.offsetHeight;
      let latestY=startY,raf=null;
      function onMove(e){
        latestY=e.clientY;
        if(raf)return;
        raf=requestAnimationFrame(()=>{
          raf=null;
          const newH=Math.max(80,Math.min(paneH-120,startH+(latestY-startY)));
          videoArea.style.height=newH+'px';
          if(typeof moveEditId!=='undefined'&&moveEditId&&typeof mvDrawOverlay==='function')mvDrawOverlay();
        });
      }
      function onUp(){
        rVT.classList.remove('dragging');
        document.body.style.cursor='';
        document.body.style.userSelect='';
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        renderTL();
      }
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initResize);
  } else {
    initResize();
  }
})();

// ═══════════════ MOVE EFFECT (Keyframe + Bezier) ════════════════