/* ─── Wise Goose — goose.js ──────────────────────────────────── */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────
  const SPEED          = 60;     // px/sec
  const LEG_SWAP_SEC   = 0.28;   // seconds per leg position
  const PAUSE_MIN      = 2000;   // ms pause at target
  const PAUSE_MAX      = 5000;
  const HONK_MIN       = 15000;  // ms random honk interval
  const HONK_MAX       = 45000;
  const HONK_DUR       = 600;    // ms honk animation
  const BOB_INTERVAL   = 3500;   // ms idle bob
  const GOOSE_W        = 105;
  const API_URL        = 'https://api.anthropic.com/v1/messages';
  const MODEL          = 'claude-haiku-4-5-20251001';

  // ── State ───────────────────────────────────────────────────
  let posX = 0, posY = 0, targetX = 0;
  let facingRight = true;
  let walking     = false;
  let bubbleOpen  = false;
  let legPhase    = 0;
  let legAccum    = 0;
  let isHonking   = false;
  let prevTime    = null;
  let pauseTimer  = null;
  let honkTimer   = null;
  let honkAnim    = null;
  let bobTimer    = null;
  let apiKey      = localStorage.getItem('goose_api_key') || '';

  // ── DOM ─────────────────────────────────────────────────────
  let container, gooseEl, bubbleEl;

  // ── SVG ─────────────────────────────────────────────────────
  function gooseSVG(phase, honking) {
    const no = honking ? -7 : 0; // neck lifts when honking
    return `<svg viewBox="0 0 105 78" width="105" height="78" xmlns="http://www.w3.org/2000/svg">
      <!-- Tail -->
      <path d="M 26 42 Q 10 33 14 22 Q 22 33 28 40 Z" fill="white" stroke="#d1d5db" stroke-width="1"/>
      <!-- Body -->
      <ellipse cx="47" cy="44" rx="24" ry="15" fill="white" stroke="#d1d5db" stroke-width="1.5"/>
      <!-- Wing detail -->
      <path d="M 30 40 Q 47 33 67 40" stroke="#e2e8f0" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- Neck shadow -->
      <path d="M 65 32 Q 77 ${20 + no} 84 ${12 + no}" stroke="#d1d5db" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.3"/>
      <!-- Neck -->
      <path d="M 65 32 Q 77 ${20 + no} 84 ${12 + no}" stroke="white" stroke-width="10" fill="none" stroke-linecap="round"/>
      <!-- Head -->
      <circle cx="84" cy="${11 + no}" r="10" fill="white" stroke="#d1d5db" stroke-width="1.5"/>
      <!-- Beak -->
      <path d="M 91 ${9 + no} L 104 ${11 + no} L 91 ${14 + no} Z" fill="#f59e0b" stroke="#d97706" stroke-width="0.5"/>
      <!-- Eye -->
      <circle cx="81" cy="${7 + no}" r="3" fill="#1e293b"/>
      <circle cx="82.2" cy="${5.8 + no}" r="1" fill="white"/>
      ${phase === 0 ? `
      <!-- Walk A: left fwd, right back -->
      <line x1="41" y1="57" x2="36" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="36" y1="70" x2="29" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="53" y1="57" x2="58" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <line x1="58" y1="70" x2="65" y2="70" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      ` : `
      <!-- Walk B: left back, right fwd -->
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

  // ── Audio ────────────────────────────────────────────────────
  let audioCtx = null;
  function playHonk() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx  = audioCtx;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(310, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(170, ctx.currentTime + 0.18);
      osc.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.34);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
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

    posX = Math.random() * (window.innerWidth - GOOSE_W);
    posY = window.innerHeight * (0.7 + Math.random() * 0.1);
    updateSVG(false);
    setPos();
    pickTarget();
    scheduleHonk();
    startBob();
  }

  // ── Movement ─────────────────────────────────────────────────
  function setPos() {
    gooseEl.style.left      = posX + 'px';
    gooseEl.style.top       = posY + 'px';
    gooseEl.style.transform = facingRight ? 'scaleX(1)' : 'scaleX(-1)';
  }

  function pickTarget() {
    if (bubbleOpen) return;
    const margin = GOOSE_W + 10;
    targetX      = margin + Math.random() * (window.innerWidth - margin * 2);
    facingRight  = targetX > posX;
    walking      = true;
    prevTime     = null;
    setPos();
    requestAnimationFrame(walkFrame);
  }

  function walkFrame(ts) {
    if (!walking || bubbleOpen) { prevTime = null; return; }
    if (prevTime === null) prevTime = ts;
    const dt = Math.min((ts - prevTime) / 1000, 0.05);
    prevTime = ts;

    // Move toward target
    const dir = targetX > posX ? 1 : -1;
    posX += dir * SPEED * dt;

    // Leg swap
    legAccum += dt;
    if (legAccum >= LEG_SWAP_SEC) {
      legAccum = 0;
      legPhase = legPhase === 0 ? 1 : 0;
    }

    if (Math.abs(posX - targetX) < 3) {
      posX     = targetX;
      walking  = false;
      legPhase = 0;
      legAccum = 0;
      updateSVG();
      setPos();
      const pause = PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN);
      pauseTimer = setTimeout(pickTarget, pause);
      return;
    }

    posX = Math.max(0, Math.min(window.innerWidth - GOOSE_W, posX));
    updateSVG();
    setPos();
    requestAnimationFrame(walkFrame);
  }

  // ── Idle bob ─────────────────────────────────────────────────
  function startBob() {
    bobTimer = setInterval(() => {
      if (!walking && !bubbleOpen) {
        gooseEl.style.transition = 'top 0.18s ease';
        gooseEl.style.top        = (posY - 5) + 'px';
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
    // Stop walking
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
      <button class="goose-close" id="goose-close" title="Close">×</button>
      <div class="goose-bubble-body" id="goose-bubble-body">
        <textarea id="goose-q-input" class="goose-q-input" rows="2"
          placeholder="Ask the goose something… (optional)"></textarea>
        <button class="goose-ask-btn" id="goose-ask-btn">Ask</button>
        <div class="goose-presets">
          <button class="goose-preset" data-q="What should I do?">What should I do?</button>
          <button class="goose-preset" data-q="Am I overthinking?">Am I overthinking?</button>
          <button class="goose-preset" data-q="Give me a sign">Give me a sign</button>
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

    // Position: above goose, clamped to viewport
    const bw    = 264;
    const bLeft = Math.max(8, Math.min(window.innerWidth - bw - 8, posX - bw / 2 + GOOSE_W / 2));
    const bTop  = Math.max(8, posY - 235);
    bubbleEl.style.left = bLeft + 'px';
    bubbleEl.style.top  = bTop  + 'px';

    container.appendChild(bubbleEl);

    // Events
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
        const q = e.target.value.trim();
        askGoose(q || null);
      }
    });

    bubbleEl.querySelectorAll('.goose-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        askGoose(q === '__honk__' ? null : q);
      });
    });

    // Click outside to close
    setTimeout(() => document.addEventListener('click', outsideClick), 60);
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
    if (!apiKey) {
      apiKey = prompt('Enter your Anthropic API key to awaken the goose:');
      if (!apiKey) return;
      localStorage.setItem('goose_api_key', apiKey.trim());
      apiKey = apiKey.trim();
    }

    const bodyEl = document.getElementById('goose-bubble-body');
    const respEl = document.getElementById('goose-resp');
    if (!bodyEl || !respEl) return;

    bodyEl.hidden = true;
    respEl.hidden = false;
    respEl.textContent = '...';

    // Thoughtful pause: stop honking, just stand still
    isHonking = false;
    updateSVG(false);

    const canRead = localStorage.getItem('goose_can_read') === 'true';
    let ctx = '';

    if (canRead) {
      const d = window.__activeDecision;
      if (d) {
        const prosStr = d.pros.length
          ? d.pros.map(p => `  - ${p.text} (${p.stars} stars)`).join('\n')
          : '  none';
        const consStr = d.cons.length
          ? d.cons.map(c => `  - ${c.text} (${c.stars} stars)`).join('\n')
          : '  none';
        ctx = `\n\nThe human is weighing a decision: "${d.title}"` +
          (d.tag ? ` (tagged: ${d.tag})` : '') +
          `.\nPros:\n${prosStr}\nCons:\n${consStr}` +
          (d.notes ? `\nTheir reflections: "${d.notes}"` : '') +
          (d.resolved ? '\nThey have already resolved this.' : '');
      }
    } else {
      ctx = "\n\nThe human has chosen not to share their thoughts with you. Acknowledge the bureaucratic impasse of knowing nothing.";
    }

    const userMsg = question
      ? `${question}${ctx}`
      : ctx || 'Drop an unsolicited piece of wisdom.';

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
          max_tokens: 200,
          system: `You are a wise goose. You speak in short, absurd, Kafka-esque observations — existential but not pretentious, dark but oddly comforting, like a bureaucrat who became enlightened. Max 3 sentences. Never explain yourself. Occasionally reference being a goose. End with something unexpected.`,
          messages: [{ role: 'user', content: userMsg }]
        })
      });

      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const text = data.content?.[0]?.text || 'HONK.';
      typewrite(respEl, text);
    } catch (err) {
      triggerHonk();
      respEl.textContent = 'HONK.';
    }
  }

  // ── Typewriter ───────────────────────────────────────────────
  function typewrite(el, text) {
    el.textContent = '';
    let i = 0;
    const iv = setInterval(() => {
      el.textContent += text[i++];
      if (i >= text.length) clearInterval(iv);
    }, 20);
  }

  // ── Boot ─────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
