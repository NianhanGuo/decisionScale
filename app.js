/* ─── Data Shapes ────────────────────────────────────────────────
   Decision: { id, title, tag, notes, pros, cons, resolved, created }
   Item:     { id, text, stars }
─────────────────────────────────────────────────────────────────*/

// ─── State ────────────────────────────────────────────────────
let decisions = [];
let activeId = null;

// ─── Helpers ──────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

function save() {
  localStorage.setItem('decisions', JSON.stringify(decisions));
}

function load() {
  try {
    decisions = JSON.parse(localStorage.getItem('decisions')) || [];
  } catch {
    decisions = [];
  }
}

function getActive() {
  return decisions.find(d => d.id === activeId) || null;
}

// ─── DOM References ───────────────────────────────────────────
const searchInput    = document.getElementById('search-input');
const decisionList   = document.getElementById('decision-list');
const btnNew         = document.getElementById('btn-new');
const emptyState     = document.getElementById('empty-state');
const editor         = document.getElementById('editor');
const titleInput     = document.getElementById('title-input');
const tagInput       = document.getElementById('tag-input');
const btnResolve     = document.getElementById('btn-resolve');
const scaleBeam      = document.getElementById('scale-beam');
const proScore       = document.getElementById('pro-score');
const conScore       = document.getElementById('con-score');
const balanceScore   = document.getElementById('balance-score');
const verdictText    = document.getElementById('verdict-text');
const proInput       = document.getElementById('pro-input');
const conInput       = document.getElementById('con-input');
const btnAddPro      = document.getElementById('btn-add-pro');
const btnAddCon      = document.getElementById('btn-add-con');
const proList        = document.getElementById('pro-list');
const conList        = document.getElementById('con-list');
const notesInput     = document.getElementById('notes-input');

// ─── Sidebar Rendering ────────────────────────────────────────
function renderSidebar(filter = '') {
  const q = filter.toLowerCase();
  const filtered = decisions.filter(d =>
    d.title.toLowerCase().includes(q) || d.tag.toLowerCase().includes(q)
  );

  decisionList.innerHTML = '';

  filtered.forEach(d => {
    const proTotal = d.pros.reduce((s, i) => s + i.stars, 0);
    const conTotal = d.cons.reduce((s, i) => s + i.stars, 0);

    const li = document.createElement('li');
    li.className = 'decision-item' +
      (d.id === activeId ? ' active' : '') +
      (d.resolved ? ' resolved' : '');
    li.dataset.id = d.id;

    li.innerHTML = `
      <span class="decision-item-title">${escHtml(d.title) || 'Untitled'}</span>
      <span class="decision-item-meta">
        ${d.tag ? `<span class="tag-pill">${escHtml(d.tag)}</span>` : ''}
        ${d.resolved ? '<span class="resolved-badge">Resolved</span>' : ''}
        <span class="score-label">▲${proTotal} ▼${conTotal}</span>
      </span>`;

    li.addEventListener('click', () => selectDecision(d.id));
    decisionList.appendChild(li);
  });
}

// ─── Select / Populate ────────────────────────────────────────
function selectDecision(id) {
  activeId = id;
  const d = getActive();
  if (!d) return;

  emptyState.hidden = true;
  editor.hidden = false;

  titleInput.value = d.title;
  tagInput.value   = d.tag;
  notesInput.value = d.notes;

  btnResolve.textContent = d.resolved ? 'Mark Unresolved' : 'Mark Resolved';
  btnResolve.classList.toggle('is-resolved', d.resolved);

  renderItems();
  updateScale();
  renderSidebar(searchInput.value);
}

// ─── New Decision ─────────────────────────────────────────────
btnNew.addEventListener('click', () => {
  const d = {
    id: uid(),
    title: '',
    tag: '',
    notes: '',
    pros: [],
    cons: [],
    resolved: false,
    created: Date.now()
  };
  decisions.unshift(d);
  save();
  selectDecision(d.id);
  titleInput.focus();
});

// ─── Toggle Resolved ──────────────────────────────────────────
btnResolve.addEventListener('click', () => {
  const d = getActive();
  if (!d) return;
  d.resolved = !d.resolved;
  save();
  btnResolve.textContent = d.resolved ? 'Mark Unresolved' : 'Mark Resolved';
  btnResolve.classList.toggle('is-resolved', d.resolved);
  renderSidebar(searchInput.value);
});

// ─── Auto-save Inputs ─────────────────────────────────────────
titleInput.addEventListener('input', () => {
  const d = getActive(); if (!d) return;
  d.title = titleInput.value;
  save();
  renderSidebar(searchInput.value);
});

tagInput.addEventListener('input', () => {
  const d = getActive(); if (!d) return;
  d.tag = tagInput.value;
  save();
  renderSidebar(searchInput.value);
});

notesInput.addEventListener('input', () => {
  const d = getActive(); if (!d) return;
  d.notes = notesInput.value;
  save();
});

// ─── Add Items ────────────────────────────────────────────────
function addItem(side) {
  const d = getActive(); if (!d) return;
  const input = side === 'pro' ? proInput : conInput;
  const text  = input.value.trim();
  if (!text) return;
  const item = { id: uid(), text, stars: 0 };
  d[side === 'pro' ? 'pros' : 'cons'].push(item);
  input.value = '';
  save();
  renderItems();
  updateScale();
  renderSidebar(searchInput.value);
}

btnAddPro.addEventListener('click', () => addItem('pro'));
btnAddCon.addEventListener('click', () => addItem('con'));
proInput.addEventListener('keydown', e => { if (e.key === 'Enter') addItem('pro'); });
conInput.addEventListener('keydown', e => { if (e.key === 'Enter') addItem('con'); });

// ─── Render Item Cards ────────────────────────────────────────
function renderItems() {
  const d = getActive(); if (!d) return;
  proList.innerHTML = '';
  conList.innerHTML = '';
  d.pros.forEach(item => proList.appendChild(buildCard(item, 'pro')));
  d.cons.forEach(item => conList.appendChild(buildCard(item, 'con')));
}

function buildCard(item, side) {
  const card = document.createElement('div');
  card.className = 'item-card';

  const top = document.createElement('div');
  top.className = 'item-card-top';

  const textEl = document.createElement('span');
  textEl.className = 'item-text';
  textEl.textContent = item.text;

  const btnRm = document.createElement('button');
  btnRm.className = 'btn-remove';
  btnRm.title = 'Remove';
  btnRm.textContent = '×';
  btnRm.addEventListener('click', () => removeItem(item.id, side));

  top.append(textEl, btnRm);

  const starRow = document.createElement('div');
  starRow.className = 'star-row';

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = 'star ' + (i <= item.stars ? `filled-${side}` : 'empty');
    star.textContent = '★';
    star.addEventListener('click', () => setStars(item.id, side, i));
    starRow.appendChild(star);
  }

  card.append(top, starRow);
  return card;
}

// ─── Set Stars ────────────────────────────────────────────────
function setStars(itemId, side, stars) {
  const d = getActive(); if (!d) return;
  const arr = side === 'pro' ? d.pros : d.cons;
  const item = arr.find(i => i.id === itemId);
  if (!item) return;
  // clicking same star value toggles to 0
  item.stars = item.stars === stars ? 0 : stars;
  save();
  renderItems();
  updateScale();
  renderSidebar(searchInput.value);
}

// ─── Remove Item ──────────────────────────────────────────────
function removeItem(itemId, side) {
  const d = getActive(); if (!d) return;
  if (side === 'pro') {
    d.pros = d.pros.filter(i => i.id !== itemId);
  } else {
    d.cons = d.cons.filter(i => i.id !== itemId);
  }
  save();
  renderItems();
  updateScale();
  renderSidebar(searchInput.value);
}

// ─── Live Scale ───────────────────────────────────────────────
function updateScale() {
  const d = getActive();
  if (!d) {
    scaleBeam.style.transform = '';
    proScore.textContent = '0';
    conScore.textContent = '0';
    balanceScore.textContent = '0';
    verdictText.textContent = '';
    verdictText.className = 'verdict-text';
    return;
  }

  const proTotal = d.pros.reduce((s, i) => s + i.stars, 0);
  const conTotal = d.cons.reduce((s, i) => s + i.stars, 0);
  const balance  = proTotal - conTotal;

  proScore.textContent     = proTotal;
  conScore.textContent     = conTotal;
  balanceScore.textContent = balance > 0 ? `+${balance}` : balance;

  // Tilt: clamp to ±30deg; pro side goes up (negative), con side goes up (positive)
  const maxStars = Math.max(proTotal + conTotal, 1);
  const raw   = (balance / maxStars) * 30;
  const angle = Math.max(-30, Math.min(30, raw));
  // positive balance → pro is heavier → beam tilts so pro side goes down
  scaleBeam.style.transform = `rotate(${-angle}deg)`;

  // Verdict
  verdictText.className = 'verdict-text';
  if (proTotal === 0 && conTotal === 0) {
    verdictText.textContent = '';
  } else if (balance > 0) {
    verdictText.textContent = 'Leaning YES ✓';
    verdictText.classList.add('lean-yes');
  } else if (balance < 0) {
    verdictText.textContent = 'Leaning NO ✗';
    verdictText.classList.add('lean-no');
  } else {
    verdictText.textContent = 'Balanced ⚖';
    verdictText.classList.add('balanced');
  }
}

// ─── Search ───────────────────────────────────────────────────
searchInput.addEventListener('input', () => renderSidebar(searchInput.value));

// ─── Utility ──────────────────────────────────────────────────
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────
load();
renderSidebar();

// Re-select first decision on startup if any exist
if (decisions.length > 0) {
  selectDecision(decisions[0].id);
} else {
  emptyState.hidden = false;
  editor.hidden = true;
}
