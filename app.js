'use strict';

/* Training Week — offline weekly training tracker.
   Week runs Sunday → Saturday so Friday + Saturday (the weekend) sit together at the end. */

const STORE_KEY = 'trainingweek.sessions.v1';
const AREAS_KEY = 'trainingweek.areas.v1';
const WEEK_START = 0; // 0 = Sunday
const WEEKEND = [5, 6]; // Friday, Saturday
const DEFAULT_AREAS = ['Knee', 'Lower back', 'Shoulder', 'Ankle', 'Hip', 'Neck', 'Wrist'];
const CATEGORIES = [
  { id: 'training', label: 'Training', icon: '🏋️',
    items: ['Strength', 'Cardio', 'Mobility', 'Swim', 'Running', 'Cycling'] },
  { id: 'sport', label: 'Sports', icon: '⚽',
    items: ['Football', 'Padel tennis', 'Tennis', 'Squash', 'Basketball', 'Volleyball'] },
  { id: 'tendon', label: 'Tendon rehab', icon: '🦵',
    items: ['Functional training (tendon)', 'Isometrics', 'Eccentric loading', 'Heavy slow resistance', 'Plyometric return'] },
  { id: 'recovery', label: 'Recovery', icon: '🧊',
    items: ['Ice pack', 'Physio (clinic)', 'Home physio exercises', 'Massage', 'Stretching', 'Foam rolling', 'Heat / sauna', 'Rest day'] },
];
const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/* Shoulder-safe 3-day split (tendon inflammation + padel). Shown only for "Strength" sessions. */
const SPLITS = [
  { id: 'd1', label: 'Day 1', name: 'Chest + Back', icon: '💪', upper: true, items: [
    { id: 'row', name: 'Seated row machine', sets: '4 × 8–10', cue: 'Pull first to warm the shoulder. Squeeze blades, hold 1 s.' },
    { id: 'cpress', name: 'Chest press machine', sets: '4 × 8–10', cue: 'Stop when hands reach chest level. 3 s on the way back.' },
    { id: 'pulldown', name: 'Lat pulldown (neutral grip)', sets: '3 × 10–12', cue: 'Palms facing. No full overhead stretch at the top.' },
    { id: 'fly', name: 'Cable fly (mid height)', sets: '3 × 12–15', cue: 'Small range — hands never behind your body.' },
    { id: 'sapd', name: 'Cable straight-arm pulldown', sets: '3 × 12–15', cue: 'Start below shoulder height, arms straight.' },
  ] },
  { id: 'd2', label: 'Day 2', name: 'Shoulder health + Arms', icon: '🛡️', upper: true, items: [
    { id: 'facepull', name: 'Cable face pull (rope)', sets: '3 × 12–15', cue: 'First, while fresh. Pull rope apart toward ears.' },
    { id: 'extrot', name: 'Cable external rotation', sets: '3 × 12–15 / side', cue: 'Elbow pinned to side (towel under it). Rotate out slowly.' },
    { id: 'latraise', name: 'Cable lateral raise', sets: '3 × 12–15 / side', cue: 'Very light, arms slightly forward, stop at shoulder height.' },
    { id: 'curl', name: 'Cable curl (straight bar)', sets: '3 × 10–12', cue: 'Elbows fixed at your sides.' },
    { id: 'pushdown', name: 'Cable triceps pushdown (rope)', sets: '3 × 10–12', cue: 'Elbows tucked, spread the rope at the bottom.' },
    { id: 'hammer', name: 'Cable hammer curl (rope)', sets: '2 × 12', cue: 'Palms facing. Builds grip for padel.' },
    { id: 'sapush', name: 'Single-arm cable pushdown', sets: '2 × 12 / side', cue: 'Replaces overhead extension — no overhead load.' },
  ] },
  { id: 'd3', label: 'Day 3', name: 'Legs + Core', icon: '🦵', upper: false, items: [
    { id: 'legpress', name: 'Leg press', sets: '4 × 8–12', cue: 'Knees to ~90°, lower back stays on the pad.' },
    { id: 'legext', name: 'Leg extension', sets: '3 × 12–15', cue: 'Pause 1 s at the top, lower slowly.' },
    { id: 'legcurl', name: 'Leg curl machine', sets: '3 × 10–12', cue: 'Control the way back.' },
    { id: 'calf', name: 'Calf raise on leg press', sets: '4 × 12–15', cue: 'Full stretch, full squeeze.' },
    { id: 'crunch', name: 'Cable crunch (kneeling)', sets: '3 × 12–15', cue: 'Elbows toward knees, hips stay still.' },
    { id: 'rotation', name: 'Horizontal cable rotation', sets: '3 × 12 / side', cue: 'Chest height, arms long, rotate through hips.' },
  ] },
];
const SPLIT_BY_ID = Object.fromEntries(SPLITS.map((s) => [s.id, s]));
const isStrength = (title) => (title || '').trim().toLowerCase() === 'strength';
const isPadel = (title) => /padel/i.test(title || '');
function inferCategory(title) {
  const t = (title || '').trim().toLowerCase();
  const hit = CATEGORIES.find((c) => c.items.some((i) => i.toLowerCase() === t));
  return hit ? hit.id : 'other';
}
const catOf = (s) => (s.category && CAT_BY_ID[s.category] ? s.category : inferCategory(s.title));
// Pain colour from green (1) to red (10).
const painColor = (p) => `hsl(${Math.round(130 - (p - 1) * (130 / 9))} 70% 45%)`;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const $ = (id) => document.getElementById(id);

/* ---------- Storage ---------- */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { toast('Could not save — storage is full or blocked'); return false; }
}

let sessions = load(STORE_KEY, []);
let areas = load(AREAS_KEY, DEFAULT_AREAS.slice());
const persist = () => save(STORE_KEY, sessions);
const persistAreas = () => save(AREAS_KEY, areas);

/* ---------- Date helpers (local time, never UTC) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() - WEEK_START + 7) % 7;
  return addDays(x, -diff);
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
function fmtTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${pad(m)}`;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- State ---------- */
let weekStart = startOfWeek(new Date());
let editing = null; // session being edited (copy) or null
let draft = null;

/* ---------- Rendering ---------- */
function hourHeight() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 52;
}

function buildGutter() {
  const g = $('gutter');
  g.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const d = document.createElement('div');
    d.className = 'hl';
    d.innerHTML = `<span>${pad(h)}:00</span>`;
    g.appendChild(d);
  }
}

function render() {
  const today = ymd(new Date());
  const end = addDays(weekStart, 6);

  // Month label, Google-Calendar style ("November 2026" or "Nov – Dec 2026")
  const label = weekStart.getMonth() === end.getMonth()
    ? `${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${MONTHS[weekStart.getMonth()].slice(0, 3)} – ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
  $('monthLabel').textContent = label;

  // Day header
  const head = $('dayHead');
  head.innerHTML = '<div></div>';
  const days = $('days');
  days.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const key = ymd(d);
    const isWeekend = WEEKEND.includes(d.getDay());
    const isToday = key === today;

    const dh = document.createElement('div');
    dh.className = 'dh' + (isWeekend ? ' weekend' : '') + (isToday ? ' today' : '');
    dh.innerHTML = `<span class="dow">${DOW[d.getDay()]}</span><span class="dnum">${d.getDate()}</span>`;
    head.appendChild(dh);

    const col = document.createElement('div');
    col.className = 'col' + (isWeekend ? ' weekend' : '');
    col.dataset.date = key;
    days.appendChild(col);

    layoutDay(col, sessions.filter((s) => s.date === key));

    if (isToday) {
      const now = new Date();
      const line = document.createElement('div');
      line.className = 'now-line';
      line.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight()}px`;
      col.appendChild(line);
    }
  }
  renderSummary();
}

// Side-by-side layout for overlapping sessions (like Google Calendar).
function layoutDay(col, list) {
  list.sort((a, b) => a.start - b.start || b.duration - a.duration);
  const hh = hourHeight();
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach((s) => {
      let lane = lanes.findIndex((endMin) => endMin <= s.start);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = s.start + s.duration;
      s._lane = lane;
    });
    cluster.forEach((s) => drawEvent(col, s, s._lane, lanes.length, hh));
    cluster = [];
  };
  list.forEach((s) => {
    if (cluster.length && s.start >= clusterEnd) flush();
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.start + s.duration);
  });
  if (cluster.length) flush();
}

function drawEvent(col, s, lane, lanes, hh) {
  const el = document.createElement('button');
  const nowKey = ymd(new Date());
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isPast = s.date < nowKey || (s.date === nowKey && s.start + s.duration <= nowMin);
  el.className = `ev ${s.status}` + (s.status === 'planned' && isPast ? ' overdue' : '');
  const w = 100 / lanes;
  el.style.left = `calc(${lane * w}% + 1px)`;
  el.style.width = `calc(${w}% - 2px)`;
  el.style.top = `${(s.start / 60) * hh + 1}px`;
  el.style.height = `${Math.max((s.duration / 60) * hh - 2, 18)}px`;
  const areaTxt = s.areas && s.areas.length ? s.areas.join(', ') : '';
  const cat = CAT_BY_ID[catOf(s)];
  el.classList.add(`cat-${catOf(s)}`);
  const pain = s.status === 'done' && s.pain
    ? ` <b class="pain" style="background:${painColor(s.pain)}">${s.pain}</b>` : '';
  const split = s.split && SPLIT_BY_ID[s.split];
  const prog = split && s.status === 'planned' && doneCount(s)
    ? ` <b class="prog">${doneCount(s)}/${split.items.length}</b>` : '';
  el.innerHTML =
    `<span class="t"></span><span class="m">${cat ? cat.icon + ' ' : ''}${fmtTime(s.start)}${pain}${prog}</span>` +
    (areaTxt ? `<span class="a"></span>` : '');
  el.querySelector('.t').textContent = split ? split.name : (s.title || 'Session');
  if (areaTxt) el.querySelector('.a').textContent = '⚕ ' + areaTxt;
  el.setAttribute('aria-label', `${s.title || 'Session'} ${fmtTime(s.start)} ${s.status}`);
  el.addEventListener('click', (e) => { e.stopPropagation(); openEditor(s); });
  col.appendChild(el);
}

function renderSummary() {
  const keys = new Set([...Array(7)].map((_, i) => ymd(addDays(weekStart, i))));
  const wk = sessions.filter((s) => keys.has(s.date));
  const c = { planned: 0, done: 0, skipped: 0 };
  const areaCount = {};
  let doneMin = 0;
  const pains = [];
  wk.forEach((s) => {
    c[s.status]++;
    if (s.status === 'done') doneMin += s.duration;
    if (s.status === 'done' && s.pain) pains.push(s.pain);
    (s.areas || []).forEach((a) => { areaCount[a] = (areaCount[a] || 0) + 1; });
  });
  const sum = $('summary');
  if (!wk.length) {
    sum.innerHTML = '<span>No sessions this week — tap a time slot or + to book one.</span>';
    return;
  }
  const h = Math.floor(doneMin / 60), m = doneMin % 60;
  const top = Object.entries(areaCount).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([a, n]) => `${escapeHtml(a)} ×${n}`).join(', ');
  sum.innerHTML =
    `<span><i class="dot" style="background:var(--done)"></i><b>${c.done}</b> done${doneMin ? ` (${h ? h + 'h ' : ''}${m ? m + 'm' : ''})`.replace(' )', ')') : ''}</span>` +
    `<span><i class="dot" style="background:var(--planned)"></i><b>${c.planned}</b> planned</span>` +
    `<span><i class="dot" style="background:var(--skipped)"></i><b>${c.skipped}</b> skipped</span>` +
    (pains.length
      ? `<span>Pain avg <b>${(pains.reduce((a, b) => a + b, 0) / pains.length).toFixed(1)}</b> · max <b style="color:${painColor(Math.max(...pains))}">${Math.max(...pains)}</b></span>`
      : '') +
    (top ? `<span>⚕ ${top}</span>` : '');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/* ---------- Editor ---------- */
function openEditor(existing, preset) {
  editing = existing || null;
  draft = existing
    ? { ...existing, areas: [...(existing.areas || [])], log: cloneLog(existing.log) }
    : {
      id: uid(), title: '', date: preset.date, start: preset.start,
      duration: 60, areas: [], status: 'planned', reason: '', category: '', pain: null,
      split: null, log: {},
    };
  if (draft.pain === undefined) draft.pain = null;
  if (draft.split === undefined) draft.split = null;
  $('sheetTitle').textContent = existing ? 'Edit session' : 'New session';
  $('fTitle').value = draft.title;
  $('fDate').value = draft.date;
  $('fStart').value = toHHMM(draft.start);
  const durSel = $('fDur');
  if (![...durSel.options].some((o) => +o.value === draft.duration)) {
    const o = document.createElement('option');
    o.value = draft.duration; o.textContent = `${draft.duration} min`;
    durSel.appendChild(o);
  }
  durSel.value = String(draft.duration);
  $('fReason').value = draft.reason || '';
  $('deleteBtn').hidden = !existing;
  renderTitleChips();
  renderAreaChips();
  renderStatus();
  renderStrength();
  showSheet('sheet');
  if (!existing) setTimeout(() => $('fTitle').focus(), 250);
}

function renderTitleChips() {
  const box = $('titleChips');
  box.innerHTML = '';
  const current = $('fTitle').value;
  CATEGORIES.forEach((c) => {
    const group = document.createElement('div');
    group.className = 'chip-group';
    const h = document.createElement('div');
    h.className = 'chip-group-label';
    h.textContent = `${c.icon} ${c.label}`;
    group.appendChild(h);
    const row = document.createElement('div');
    row.className = 'chips';
    c.items.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (current === t ? ' on' : '');
      b.textContent = t;
      b.onclick = () => { $('fTitle').value = t; draft.category = c.id; renderTitleChips(); renderStrength(); };
      row.appendChild(b);
    });
    group.appendChild(row);
    box.appendChild(group);
  });
}

/* ---------- Strength split + checklist ---------- */
const cloneLog = (log) => Object.fromEntries(Object.entries(log || {}).map(([k, v]) => [k, { ...v }]));
function doneCount(s) {
  const split = SPLIT_BY_ID[s.split];
  if (!split) return 0;
  return split.items.filter((it) => s.log && s.log[it.id] && s.log[it.id].done).length;
}
const sortKey = (s) => `${s.date} ${pad(Math.floor(s.start / 60))}${pad(s.start % 60)}`;

// Next split in rotation after the last completed one; switch to legs if padel is within 24 h.
function suggestSplit(date, start) {
  const me = sortKey({ date, start });
  const past = sessions
    .filter((s) => s.id !== draft.id && s.split && s.status === 'done' && sortKey(s) < me)
    .sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));
  const order = SPLITS.map((s) => s.id);
  const next = past.length ? order[(order.indexOf(past[0].split) + 1) % order.length] : 'd1';
  const t0 = parseYmd(date).getTime() + start * 60000;
  const padel = sessions.find((s) => {
    if (!isPadel(s.title) || s.status === 'skipped') return false;
    const t = parseYmd(s.date).getTime() + s.start * 60000;
    return t > t0 && t - t0 <= 24 * 3600000;
  });
  if (padel && SPLIT_BY_ID[next].upper) {
    return { id: 'd3', why: `Padel within 24 h — legs today keeps your shoulder fresh (rotation says ${SPLIT_BY_ID[next].label}).` };
  }
  return { id: next, why: past.length ? `Next in rotation after ${SPLIT_BY_ID[past[0].split].label}.` : 'Start of the rotation.' };
}

// Most recent weight logged for an exercise in an earlier session of the same split.
function lastWeight(splitId, exId) {
  const me = sortKey(draft);
  const prev = sessions
    .filter((s) => s.id !== draft.id && s.split === splitId && s.log && s.log[exId] && s.log[exId].w && sortKey(s) < me)
    .sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1))[0];
  return prev ? prev.log[exId].w : '';
}

function renderStrength() {
  if (!draft) return;
  const on = isStrength($('fTitle').value);
  $('splitField').hidden = !on;
  if (!on) { $('checkField').hidden = true; return; }
  const sug = suggestSplit($('fDate').value || draft.date, $('fStart').value ? toMin($('fStart').value) : draft.start);
  if (!draft.split) draft.split = sug.id;
  const box = $('splitPick');
  box.innerHTML = '';
  SPLITS.forEach((sp) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'split-btn' + (draft.split === sp.id ? ' on' : '') + (sug.id === sp.id ? ' rec' : '');
    b.innerHTML = `<span class="si">${sp.icon}</span><b>${sp.label}</b><small></small>`;
    b.querySelector('small').textContent = sp.name;
    b.onclick = () => {
      if (draft.split !== sp.id && doneCount(draft) && !confirm('Switch split? Ticks on this session will be cleared.')) return;
      if (draft.split !== sp.id) draft.log = {};
      draft.split = sp.id; renderStrength();
    };
    box.appendChild(b);
  });
  $('splitHint').textContent = `★ Suggested: ${SPLIT_BY_ID[sug.id].label} — ${sug.why}`;
  renderChecklist();
}

function renderChecklist() {
  const split = SPLIT_BY_ID[draft.split];
  $('checkField').hidden = !split;
  if (!split) return;
  const list = $('checklist');
  list.innerHTML = '';
  split.items.forEach((it, i) => {
    const entry = draft.log[it.id] || {};
    const row = document.createElement('div');
    row.className = 'ex' + (entry.done ? ' done' : '');
    row.innerHTML =
      `<button type="button" class="tick" aria-label="Mark done">${entry.done ? '✓' : ''}</button>` +
      `<div class="ex-main"><div class="ex-name"></div><div class="ex-sets"></div><div class="ex-cue"></div></div>` +
      `<label class="ex-w"><input type="text" inputmode="decimal" maxlength="6" placeholder="kg"><small></small></label>`;
    row.querySelector('.ex-name').textContent = `${i + 1}. ${it.name}`;
    row.querySelector('.ex-sets').textContent = it.sets;
    row.querySelector('.ex-cue').textContent = it.cue;
    const last = lastWeight(split.id, it.id);
    row.querySelector('small').textContent = last ? `last ${last}` : '';
    const inp = row.querySelector('input');
    inp.value = entry.w || '';
    inp.oninput = () => {
      draft.log[it.id] = { ...(draft.log[it.id] || {}), w: inp.value.trim() };
    };
    const toggle = () => {
      const cur = draft.log[it.id] || {};
      draft.log[it.id] = { ...cur, done: !cur.done };
      afterTick();
    };
    row.querySelector('.tick').onclick = toggle;
    row.querySelector('.ex-main').onclick = toggle;
    list.appendChild(row);
  });
  const n = doneCount(draft), total = split.items.length;
  $('checkCount').textContent = `${n}/${total}`;
  $('checkBar').style.width = `${(n / total) * 100}%`;
}

function afterTick() {
  const split = SPLIT_BY_ID[draft.split];
  const all = doneCount(draft) === split.items.length;
  if (all && draft.status !== 'done') {
    draft.status = 'done';
    renderStatus();
    toast(split.upper ? 'Workout complete 💪 Log your shoulder pain below' : 'Workout complete 💪 Log your pain below');
  } else if (!all && draft.status === 'done' && doneCount(draft) === 0) {
    draft.status = 'planned';
    renderStatus();
  }
  renderChecklist();
}

function renderPain() {
  const box = $('painScale');
  box.innerHTML = '';
  for (let p = 1; p <= 10; p++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p;
    b.className = 'pain-btn' + (draft.pain === p ? ' on' : '');
    if (draft.pain === p) b.style.background = painColor(p);
    b.setAttribute('aria-label', `Pain ${p} of 10`);
    b.onclick = () => { draft.pain = draft.pain === p ? null : p; renderPain(); };
    box.appendChild(b);
  }
  $('painValue').textContent = draft.pain ? `${draft.pain}/10` : 'not recorded';
}

function renderAreaChips() {
  const box = $('areaChips');
  box.innerHTML = '';
  const all = [...new Set([...areas, ...draft.areas])];
  all.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (draft.areas.includes(a) ? ' on' : '');
    b.textContent = a;
    b.onclick = () => {
      draft.areas = draft.areas.includes(a) ? draft.areas.filter((x) => x !== a) : [...draft.areas, a];
      renderAreaChips();
    };
    box.appendChild(b);
  });
}

function renderStatus() {
  document.querySelectorAll('#statusSeg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === draft.status);
  });
  $('reasonField').hidden = draft.status !== 'skipped';
  $('painField').hidden = draft.status !== 'done';
  renderPain();
}

function addArea() {
  const v = $('newArea').value.trim();
  if (!v) return;
  if (!areas.some((a) => a.toLowerCase() === v.toLowerCase())) { areas.push(v); persistAreas(); }
  const canonical = areas.find((a) => a.toLowerCase() === v.toLowerCase());
  if (!draft.areas.includes(canonical)) draft.areas.push(canonical);
  $('newArea').value = '';
  renderAreaChips();
}

function saveDraft() {
  draft.title = $('fTitle').value.trim() || 'Session';
  draft.date = $('fDate').value;
  draft.start = $('fStart').value ? toMin($('fStart').value) : draft.start;
  draft.duration = Number($('fDur').value);
  draft.reason = draft.status === 'skipped' ? $('fReason').value.trim() : '';
  if (draft.status !== 'done') draft.pain = null;
  if (isStrength(draft.title) && SPLIT_BY_ID[draft.split]) {
    // Keep only entries with a tick or a weight.
    draft.log = Object.fromEntries(Object.entries(draft.log || {}).filter(([, v]) => v.done || v.w));
  } else { draft.split = null; draft.log = {}; }
  // A typed title that matches a preset gets that preset's category; otherwise keep a tapped chip's category.
  const inferred = inferCategory(draft.title);
  if (inferred !== 'other' || !draft.category) draft.category = inferred;
  if (!draft.date) { toast('Pick a date'); return; }
  if (draft.start + draft.duration > 24 * 60) draft.duration = 24 * 60 - draft.start;

  const i = sessions.findIndex((s) => s.id === draft.id);
  if (i >= 0) sessions[i] = draft; else sessions.push(draft);
  persist();
  // Jump to the week the session landed in if the date moved.
  weekStart = startOfWeek(parseYmd(draft.date));
  closeSheets();
  render();
}

function deleteDraft() {
  if (!editing) return;
  if (!confirm('Delete this session?')) return;
  sessions = sessions.filter((s) => s.id !== editing.id);
  persist();
  closeSheets();
  render();
}

/* ---------- Sheets ---------- */
function showSheet(id) {
  $('backdrop').hidden = false;
  $(id).hidden = false;
}
function closeSheets() {
  $('backdrop').hidden = true;
  $('sheet').hidden = true;
  $('menu').hidden = true;
  editing = null; draft = null;
  document.activeElement && document.activeElement.blur();
}

/* ---------- Menu actions ---------- */
function copyLastWeek() {
  const prevKeys = [...Array(7)].map((_, i) => ymd(addDays(weekStart, i - 7)));
  const src = sessions.filter((s) => prevKeys.includes(s.date));
  if (!src.length) { toast('Nothing booked last week'); return; }
  const curKeys = new Set([...Array(7)].map((_, i) => ymd(addDays(weekStart, i))));
  const exists = (s, date) => sessions.some((x) => curKeys.has(x.date) && x.date === date && x.start === s.start && x.title === s.title);
  let added = 0;
  src.forEach((s) => {
    const date = ymd(addDays(parseYmd(s.date), 7));
    if (exists(s, date)) return;
    sessions.push({ id: uid(), title: s.title, date, start: s.start, duration: s.duration,
      areas: [...(s.areas || [])], status: 'planned', reason: '', category: catOf(s), pain: null,
      split: s.split || null, log: {} });
    added++;
  });
  persist();
  closeSheets();
  render();
  toast(added ? `Copied ${added} session${added > 1 ? 's' : ''}` : 'Already copied');
}

function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'training-week', version: 1, exported: new Date().toISOString(), areas, sessions }, null, 2)],
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-backup-${ymd(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!Array.isArray(data.sessions)) throw new Error('bad');
      const valid = data.sessions.filter((s) => s && s.id && /^\d{4}-\d{2}-\d{2}$/.test(s.date)
        && Number.isFinite(s.start) && Number.isFinite(s.duration));
      if (!confirm(`Replace current data with ${valid.length} sessions from the backup?`)) return;
      sessions = valid.map((s) => ({
        id: String(s.id), title: String(s.title || 'Session'), date: s.date, start: s.start, duration: s.duration,
        areas: Array.isArray(s.areas) ? s.areas.map(String) : [],
        status: ['planned', 'done', 'skipped'].includes(s.status) ? s.status : 'planned',
        reason: String(s.reason || ''),
        category: CAT_BY_ID[s.category] ? s.category : inferCategory(s.title),
        pain: Number.isInteger(s.pain) && s.pain >= 1 && s.pain <= 10 ? s.pain : null,
        split: SPLIT_BY_ID[s.split] ? s.split : null,
        log: SPLIT_BY_ID[s.split] && s.log && typeof s.log === 'object'
          ? Object.fromEntries(Object.entries(s.log)
            .filter(([k, v]) => SPLIT_BY_ID[s.split].items.some((it) => it.id === k) && v && typeof v === 'object')
            .map(([k, v]) => [k, { done: !!v.done, w: String(v.w || '').slice(0, 6) }]))
          : {},
      }));
      if (Array.isArray(data.areas)) areas = data.areas.map(String);
      persist(); persistAreas();
      closeSheets(); render();
      toast('Backup imported');
    } catch { toast('That file is not a valid backup'); }
  };
  r.readAsText(file);
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- Events ---------- */
function goWeek(delta) { weekStart = addDays(weekStart, 7 * delta); render(); }

$('prevBtn').onclick = () => goWeek(-1);
$('nextBtn').onclick = () => goWeek(1);
$('todayBtn').onclick = () => { weekStart = startOfWeek(new Date()); render(); scrollToNow(); };
$('menuBtn').onclick = () => showSheet('menu');
$('menuClose').onclick = closeSheets;
$('backdrop').onclick = closeSheets;
$('cancelBtn').onclick = closeSheets;
$('saveBtn').onclick = saveDraft;
$('form').onsubmit = (e) => { e.preventDefault(); saveDraft(); };
$('deleteBtn').onclick = deleteDraft;
$('addAreaBtn').onclick = addArea;
$('newArea').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } });
$('fTitle').addEventListener('input', () => { renderTitleChips(); renderStrength(); });
$('fDate').addEventListener('change', renderStrength);
$('fStart').addEventListener('change', renderStrength);
$('statusSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !draft) return;
  draft.status = b.dataset.v;
  renderStatus();
});
$('copyWeekBtn').onclick = copyLastWeek;
$('exportBtn').onclick = exportData;
$('importInput').onchange = (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };

$('addBtn').onclick = () => {
  const today = new Date();
  const inWeek = today >= weekStart && today < addDays(weekStart, 7);
  const base = inWeek ? today : weekStart;
  const next = Math.min(Math.ceil((today.getHours() * 60 + today.getMinutes() + 1) / 60) * 60, 22 * 60);
  openEditor(null, { date: ymd(base), start: inWeek ? next : 18 * 60 });
};

// Tap an empty slot to book (snaps to 30 min). Ignore taps that were scrolls/swipes.
let tapStart = null;
$('days').addEventListener('pointerdown', (e) => { tapStart = { x: e.clientX, y: e.clientY, t: Date.now() }; });
$('days').addEventListener('click', (e) => {
  const col = e.target.closest('.col');
  if (!col || e.target.closest('.ev')) return;
  if (tapStart && (Math.abs(e.clientX - tapStart.x) > 10 || Math.abs(e.clientY - tapStart.y) > 10)) return;
  const rect = col.getBoundingClientRect();
  const y = e.clientY - rect.top;
  let start = Math.floor((y / hourHeight()) * 2) * 30;
  start = Math.max(0, Math.min(start, 23 * 60));
  showGhost(col, start);
  openEditor(null, { date: col.dataset.date, start });
});

function showGhost(col, start) {
  document.querySelectorAll('.ghost').forEach((g) => g.remove());
  const g = document.createElement('div');
  g.className = 'ghost';
  g.style.top = `${(start / 60) * hourHeight()}px`;
  g.style.height = `${hourHeight()}px`;
  col.appendChild(g);
}

// Horizontal swipe to change weeks.
let sw = null;
const scroller = $('scroller');
scroller.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  sw = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
scroller.addEventListener('touchend', (e) => {
  if (!sw) return;
  const dx = e.changedTouches[0].clientX - sw.x;
  const dy = e.changedTouches[0].clientY - sw.y;
  sw = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) goWeek(dx < 0 ? 1 : -1);
}, { passive: true });

function scrollToNow() {
  const h = new Date().getHours();
  const target = Math.max(0, Math.min(h - 1, 17));
  scroller.scrollTop = Math.max(target, 6) * hourHeight() - 8;
}

// Keep "now" line and overdue markers fresh; re-render when returning to the app.
setInterval(render, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !draft) render(); });

/* ---------- Boot ---------- */
buildGutter();
render();
scrollToNow();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
