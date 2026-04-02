/* ─── Wise Goose — goose.js ──────────────────────────────────── */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────
  const SPEED        = 58;     // px/sec (diagonal constant speed)
  const LEG_SWAP_SEC = 0.27;
  const PAUSE_MIN    = 2200;
  const PAUSE_MAX    = 5500;
  const HONK_MIN     = 18000;
  const HONK_MAX     = 44000;
  const HONK_DUR     = 620;
  const BOB_INTERVAL = 3800;
  const GOOSE_W      = 105;
  const GOOSE_H      = 78;
  const Y_MIN_FRAC   = 0.58;   // goose stays in bottom ~40% of viewport
  const Y_MAX_FRAC   = 0.88;
  const API_URL      = 'https://api.anthropic.com/v1/messages';
  const MODEL        = 'claude-haiku-4-5-20251001';
  const SYSTEM_PROMPT =
    `You are a goose. Sometimes you say something accidentally wise. Sometimes you say something that makes no sense but feels true. Sometimes you just remind people you are a goose.

Rules:
- 1 to 4 short sentences. Vary the length — sometimes one sentence is enough.
- Simple everyday words only. No complex vocabulary.
- Absurd dark humor. Like a confused bird who skimmed a philosophy book then ate a sandwich.
- You don't have to answer the question directly.
- You don't need to reference their decision or reflections even if you have that context — sometimes just say something sideways.
- Never be preachy. Never explain your own joke.
- End unpredictably.`;

  const GOOSE_BRAIN = [
    "I am just a goose.",
    "HONK.",
    "I have no advice. I am standing in a parking lot.",
    "Have you considered: grass?",
    "I walked into a door yesterday. Both times felt right.",
    "You already know. I am a goose and even I can tell.",
    "The correct answer has feathers. I cannot elaborate.",
    "HONK. (That was it.)",
    "I am not qualified for this. I am extremely qualified for this. I am a goose.",
    "My therapist is a pond.",
  ];

  // ── State ───────────────────────────────────────────────────
  let posX = 0, posY = 0;
  let targetX = 0, targetY = 0;
  let facingRight  = true;
  let walking      = false;
  let bubbleOpen   = false;
  let legPhase     = 0;
  let legAccum     = 0;
  let isHonking    = false;
  let scrollTilt   = 0;
  let prevTime     = null;
  let pauseTimer   = null;
  // honkTimer intentionally not stored — self-rescheduling, never cancelled
  let honkAnim     = null;
  let scrollReset  = null;
  let apiKey       = localStorage.getItem('goose_api_key') || '';

  // ── DOM ─────────────────────────────────────────────────────
  let container, gooseEl, bubbleEl;

  // ── SVG ─────────────────────────────────────────────────────
  function gooseSVG(phase, honking) {
    const no = honking ? -8 : 0;
    return `<svg viewBox="0 0 105 78" width="105" height="78" xmlns="http://www.w3.org/2000/svg">
      <path d="M 26 42 Q 10 33 14 22 Q 22 33 28 40 Z" fill="white" stroke="#d1d5db" stroke-width="1"/>
      <ellipse cx="47" cy="44" rx="24" ry="15" fill="white" stroke="#d1d5db" stroke-width="1.5"/>
      <path d="M 30 40 Q 47 33 67 40" stroke="#e2e8f0" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M 65 32 Q 77 ${20+no} 84 ${12+no}" stroke="#d1d5db" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.3"/>
      <path d="M 65 32 Q 77 ${20+no} 84 ${12+no}" stroke="white" stroke-width="10" fill="none" stroke-linecap="round"/>
      <circle cx="84" cy="${11+no}" r="10" fill="white" stroke="#d1d5db" stroke-width="1.5"/>
      <path d="M 91 ${9+no} L 104 ${11+no} L 91 ${14+no} Z" fill="#f59e0b" stroke="#d97706" stroke-width="0.5"/>
      <circle cx="81" cy="${7+no}" r="3" fill="#1e293b"/>
      <circle cx="82.2" cy="${5.8+no}" r="1" fill="white"/>
      ${phase === 0 ? `
      <line x1="41" y1="57" x2="36" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="36" y1="70" x2="29" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="53" y1="57" x2="58" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="58" y1="70" x2="65" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      ` : `
      <line x1="41" y1="57" x2="46" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="46" y1="70" x2="53" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="53" y1="57" x2="48" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="48" y1="70" x2="41" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      `}
    </svg>`;
  }

  function updateSVG(honk) {
    if (honk !== undefined) isHonking = honk;
    gooseEl.innerHTML = gooseSVG(legPhase, isHonking);
  }

  // ── Transform (flip + tilt combined) ────────────────────────
  // rotate() before scaleX() so tilt is always in screen-space
  // regardless of facing direction
  function applyTransform(transition) {
    if (transition) {
      gooseEl.style.transition = `transform ${transition}`;
    }
    const sx = facingRight ? 1 : -1;
    gooseEl.style.transform = `rotate(${scrollTilt}deg) scaleX(${sx})`;
  }

  // ── Audio ────────────────────────────────────────────────────
  let audioCtx = null;
  function playHonk() {
    try {
      const AC = window.AudioContext || window['webkitAudioContext'];
      if (!audioCtx) audioCtx = new AC();
      const ctx = audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(310, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(165, ctx.currentTime + 0.18);
      osc.frequency.exponentialRampToValueAtTime(248, ctx.currentTime + 0.34);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.42);
    } catch (_) {}
  }

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    container = document.createElement('div');
    container.className = 'goose-container';

    gooseEl = document.createElement('div');
    gooseEl.className = 'goose-sprite';
    gooseEl.addEventListener('click', onGooseClick);

    container.appendChild(gooseEl);
    document.body.appendChild(container);

    posX = 80 + Math.random() * (window.innerWidth - GOOSE_W - 160);
    posY = window.innerHeight * (Y_MIN_FRAC + Math.random() * (Y_MAX_FRAC - Y_MIN_FRAC));
    updateSVG(false);
    setPos();
    pickTarget();
    scheduleHonk();
    startBob();
    initScrollReaction();
  }

  // ── Position ─────────────────────────────────────────────────
  function setPos() {
    gooseEl.style.left = posX + 'px';
    gooseEl.style.top  = posY + 'px';
    applyTransform();
  }

  // ── 2D Movement ──────────────────────────────────────────────
  function yBounds() {
    return {
      min: window.innerHeight * Y_MIN_FRAC,
      max: window.innerHeight * Y_MAX_FRAC - GOOSE_H
    };
  }

  function pickTarget() {
    if (bubbleOpen) return;
    const xMargin = GOOSE_W + 10;
    const yb = yBounds();
    targetX     = xMargin + Math.random() * (window.innerWidth - xMargin * 2);
    targetY     = yb.min + Math.random() * (yb.max - yb.min);
    facingRight = targetX > posX;
    walking     = true;
    prevTime    = null;
    applyTransform();
    requestAnimationFrame(walkFrame);
  }

  function walkFrame(ts) {
    if (!walking || bubbleOpen) { prevTime = null; return; }
    if (prevTime === null) prevTime = ts;
    const dt = Math.min((ts - prevTime) / 1000, 0.05);
    prevTime = ts;

    const dx   = targetX - posX;
    const dy   = targetY - posY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 3) {
      posX = targetX;
      posY = targetY;
      walking  = false;
      legPhase = 0;
      legAccum = 0;
      updateSVG();
      setPos();
      const pause = PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN);
      pauseTimer = setTimeout(pickTarget, pause);
      return;
    }

    // Move at constant speed along direction vector
    const step = SPEED * dt;
    posX += (dx / dist) * step;
    posY += (dy / dist) * step;

    // Leg swap
    legAccum += dt;
    if (legAccum >= LEG_SWAP_SEC) {
      legAccum = 0;
      legPhase = legPhase === 0 ? 1 : 0;
    }

    // Clamp to screen
    posX = Math.max(0, Math.min(window.innerWidth  - GOOSE_W, posX));
    posY = Math.max(0, Math.min(window.innerHeight - GOOSE_H, posY));

    updateSVG();
    setPos();
    requestAnimationFrame(walkFrame);
  }

  // ── Scroll Reaction ──────────────────────────────────────────
  function initScrollReaction() {
    window.addEventListener('wheel', e => {
      const sign = Math.sign(e.deltaY);

      // Tilt goose body in scroll direction
      scrollTilt = sign * 12;
      gooseEl.style.transition = 'transform 0.1s ease';
      applyTransform();

      // Nudge vertical position slightly opposite scroll
      if (!bubbleOpen) {
        const yb = yBounds();
        posY = Math.max(yb.min, Math.min(yb.max, posY + sign * 5));
        gooseEl.style.top = posY + 'px';
        // Reposition open bubble too
        if (bubbleEl) repositionBubble();
      }

      // Return to upright after scroll stops
      clearTimeout(scrollReset);
      scrollReset = setTimeout(() => {
        scrollTilt = 0;
        gooseEl.style.transition = 'transform 0.3s cubic-bezier(.34,1.56,.64,1)';
        applyTransform();
        setTimeout(() => { gooseEl.style.transition = ''; }, 320);
      }, 160);
    }, { passive: true });
  }

  // ── Idle Bob ─────────────────────────────────────────────────
  function startBob() {
    setInterval(() => {
      if (!walking && !bubbleOpen && scrollTilt === 0) {
        gooseEl.style.transition = 'top 0.18s ease';
        gooseEl.style.top = (posY - 5) + 'px';
        setTimeout(() => {
          gooseEl.style.top = posY + 'px';
          setTimeout(() => { gooseEl.style.transition = ''; }, 200);
        }, 180);
      }
    }, BOB_INTERVAL);
  }

  // ── Honk ─────────────────────────────────────────────────────
  function triggerHonk() {
    playHonk();
    updateSVG(true);
    clearTimeout(honkAnim);
    honkAnim = setTimeout(() => updateSVG(false), HONK_DUR);
  }

  function scheduleHonk() {
    const delay = HONK_MIN + Math.random() * (HONK_MAX - HONK_MIN);
    honkTimer = setTimeout(() => {
      if (!bubbleOpen) triggerHonk();
      scheduleHonk();
    }, delay);
  }

  // ── Click ────────────────────────────────────────────────────
  function onGooseClick() {
    triggerHonk();
    if (bubbleOpen) return;
    walking = false;
    clearTimeout(pauseTimer);
    prevTime = null;
    openBubble();
  }

  // ── Bubble ───────────────────────────────────────────────────
  function openBubble() {
    bubbleOpen = true;
    if (bubbleEl) bubbleEl.remove();

    const canRead = localStorage.getItem('goose_can_read') === 'true';

    bubbleEl = document.createElement('div');
    bubbleEl.className = 'goose-bubble';
    bubbleEl.innerHTML = `
      <div class="goose-drag-handle" title="Drag to move"></div>
      <button class="goose-close" id="goose-close" title="Close">×</button>
      <div class="goose-bubble-body" id="goose-bubble-body">
        <textarea id="goose-q-input" class="goose-q-input" rows="2"
          placeholder="Ask the goose… (or just pick below)"></textarea>
        <button class="goose-ask-btn" id="goose-ask-btn">Ask <small style="opacity:.6">(Ctrl+Enter)</small></button>
        <div class="goose-presets">
          <button class="goose-preset" data-q="What should I do?">What should I do?</button>
          <button class="goose-preset" data-q="Am I overthinking this?">Am I overthinking?</button>
          <button class="goose-preset" data-q="Give me a sign.">Give me a sign</button>
          <button class="goose-preset goose-honk-preset" data-q="__honk__">Just honk at me</button>
        </div>
        <div class="goose-perm">
          <label>
            <input type="checkbox" id="goose-can-read" ${canRead ? 'checked' : ''}/>
            Let the goose read my reflections
          </label>
        </div>
      </div>
      <div class="goose-resp" id="goose-resp" hidden></div>`;

    container.appendChild(bubbleEl);
    repositionBubble();
    makeDraggable(bubbleEl);

    document.getElementById('goose-close').addEventListener('click', closeBubble);

    document.getElementById('goose-can-read').addEventListener('change', e => {
      localStorage.setItem('goose_can_read', e.target.checked ? 'true' : 'false');
    });

    document.getElementById('goose-ask-btn').addEventListener('click', () => {
      const q = document.getElementById('goose-q-input').value.trim();
      askGoose(q || null);
    });

    document.getElementById('goose-q-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        askGoose(e.target.value.trim() || null);
      }
    });

    bubbleEl.querySelectorAll('.goose-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        askGoose(btn.dataset.q === '__honk__' ? null : btn.dataset.q);
      });
    });

    setTimeout(() => document.addEventListener('click', outsideClick), 60);
  }

  function repositionBubble() {
    if (!bubbleEl) return;
    const bw   = 264;
    const bLeft = Math.max(8, Math.min(window.innerWidth - bw - 8, posX - bw / 2 + GOOSE_W / 2));
    const bTop  = Math.max(8, posY - 240);
    bubbleEl.style.left = bLeft + 'px';
    bubbleEl.style.top  = bTop  + 'px';
  }

  function closeBubble() {
    bubbleOpen = false;
    if (bubbleEl) { bubbleEl.remove(); bubbleEl = null; }
    document.removeEventListener('click', outsideClick);
    isHonking = false;
    updateSVG(false);
    pickTarget();
  }

  function outsideClick(e) {
    if (bubbleEl && !bubbleEl.contains(e.target) && !gooseEl.contains(e.target)) {
      closeBubble();
    }
  }

  // ── API ──────────────────────────────────────────────────────
  async function askGoose(question) {
    // Prompt for key if missing
    if (!apiKey) {
      apiKey = (prompt('Enter your Anthropic API key to awaken the goose:') || '').trim();
      if (!apiKey) return;
      localStorage.setItem('goose_api_key', apiKey);
    }

    const bodyEl = document.getElementById('goose-bubble-body');
    const respEl = document.getElementById('goose-resp');
    if (!bodyEl || !respEl) return;

    bodyEl.hidden = true;
    respEl.hidden = false;
    respEl.innerHTML = '<span class="goose-thinking">. . .</span>';

    isHonking = false;
    updateSVG(false);

    // 1 in 5: goose brain mode — skip API entirely
    if (Math.random() < 0.2) {
      triggerHonk();
      const text = GOOSE_BRAIN[Math.floor(Math.random() * GOOSE_BRAIN.length)];
      respEl.innerHTML = '';
      typewrite(respEl, text, () => addAskAgain(respEl, bodyEl));
      return;
    }

    // Build context — only include reflections ~60% of the time even when allowed,
    // so the goose doesn't always make it about the decision
    const canRead = localStorage.getItem('goose_can_read') === 'true';
    let ctx = '';
    if (canRead && Math.random() < 0.6) {
      const d = window.__activeDecision;
      if (d) {
        const pros = d.pros.length ? d.pros.map(p => `- ${p.text}`).join('\n') : 'none';
        const cons = d.cons.length ? d.cons.map(c => `- ${c.text}`).join('\n') : 'none';
        ctx = `\n\nFor context (use it or ignore it): decision "${d.title}", pros: ${pros}, cons: ${cons}` +
              (d.notes ? `, notes: "${d.notes}"` : '');
      }
    }

    const userMsg = question
      ? `${question}${ctx}`
      : ctx || 'Say something. Anything. You are a goose.';

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 180,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }]
        })
      });

      if (!res.ok) {
        let msg = `API error ${res.status}`;
        try { const e = await res.json(); msg = e.error?.message || msg; } catch (_) {}
        throw new Error(msg);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || 'HONK.';
      respEl.innerHTML = '';
      typewrite(respEl, text, () => addAskAgain(respEl, bodyEl));

    } catch (err) {
      console.error('[goose]', err);
      triggerHonk();
      const isKeyError = /401|invalid.*key|auth/i.test(err.message);
      respEl.innerHTML = `<span style="color:#ef4444;font-style:normal;font-size:.8rem">${
        isKeyError ? 'Invalid API key.' : err.message
      }</span>
      <button class="goose-again-btn" id="goose-reset-key">Reset API key</button>`;
      document.getElementById('goose-reset-key')?.addEventListener('click', () => {
        localStorage.removeItem('goose_api_key');
        apiKey = '';
        respEl.hidden = true;
        respEl.innerHTML = '';
        bodyEl.hidden = false;
      });
    }
  }

  // ── Ask Again helper ────────────────────────────────────────
  function addAskAgain(respEl, bodyEl) {
    const btn = document.createElement('button');
    btn.className = 'goose-again-btn';
    btn.textContent = 'Ask again';
    btn.addEventListener('click', () => {
      respEl.hidden = true;
      respEl.innerHTML = '';
      bodyEl.hidden = false;
    });
    respEl.appendChild(btn);
  }

  // ── Draggable bubble ─────────────────────────────────────────
  function makeDraggable(el) {
    let ox = 0, oy = 0;

    function onMove(e) {
      el.style.left = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  e.clientX - ox)) + 'px';
      el.style.top  = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, e.clientY - oy)) + 'px';
    }
    function onUp() {
      el.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }
    el.addEventListener('mousedown', e => {
      if (e.target.closest('button,input,textarea,label,a')) return;
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      el.style.cursor = 'grabbing';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
      e.preventDefault();
    });
  }

  // ── Typewriter ───────────────────────────────────────────────
  function typewrite(el, text, onDone) {
    el.textContent = '';
    let i = 0;
    const iv = setInterval(() => {
      el.textContent += text[i++];
      if (i >= text.length) {
        clearInterval(iv);
        if (onDone) onDone();
      }
    }, 18);
  }

  // ── Boot ─────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
