// ---------- Constants ----------
const STORAGE_KEY = 'workoutTrackerData';

const PRESET_EXERCISES = [
  'Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row',
  'Pull-up', 'Chin-up', 'Push-up', 'Dip', 'Lat Pulldown',
  'Seated Row', 'Leg Press', 'Leg Curl', 'Leg Extension', 'Lunge',
  'Bulgarian Split Squat', 'Hip Thrust', 'Romanian Deadlift', 'Calf Raise',
  'Bicep Curl', 'Hammer Curl', 'Tricep Pushdown', 'Skull Crusher',
  'Lateral Raise', 'Front Raise', 'Face Pull', 'Shrug',
  'Plank', 'Crunch', 'Russian Twist', 'Hanging Leg Raise',
  'Incline Bench Press', 'Dumbbell Fly', 'Cable Crossover',
  'Kettlebell Swing', 'Farmer Carry'
];

// ---------- Data layer ----------
function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  }
  return { exercises: [], weeks: {}, currentWeekKey: null };
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let state = loadData();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Week boundary logic ----------
// Returns the ISO date string (YYYY-MM-DD) of the most recent Monday 7:00 AM
// boundary that is <= now. This is used as the key for "the current week".
function getWeekKey(now = new Date()) {
  const boundary = new Date(now);
  boundary.setHours(7, 0, 0, 0);
  // getDay(): 0=Sun,1=Mon,...6=Sat
  const day = boundary.getDay();
  // Days since most recent Monday
  const daysSinceMonday = (day + 6) % 7;
  boundary.setDate(boundary.getDate() - daysSinceMonday);
  // If "now" is before this Monday 7am (i.e. we're earlier in the same
  // calendar day range before subtracting), and daysSinceMonday was 0 but
  // current time is before 7am, roll back one more week.
  if (now < boundary) {
    boundary.setDate(boundary.getDate() - 7);
  }
  const y = boundary.getFullYear();
  const m = String(boundary.getMonth() + 1).padStart(2, '0');
  const d = String(boundary.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatWeekLabel(weekKey) {
  const d = new Date(weekKey + 'T00:00:00');
  return `Week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// Ensure the current week exists in state.weeks, rolling over if needed.
function ensureCurrentWeek() {
  const key = getWeekKey();
  if (state.currentWeekKey !== key) {
    state.currentWeekKey = key;
  }
  if (!state.weeks[key]) {
    state.weeks[key] = {
      exercises: state.exercises.map(ex => ({
        exerciseId: ex.id,
        name: ex.name,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        targetWeight: ex.targetWeight,
        completed: false,
        actualSets: null,
        actualReps: null,
        actualWeight: null,
        completedAt: null
      }))
    };
    saveData(state);
  }
  return key;
}

// If exercises list changes, sync any exercises not yet present in the
// current (uncompleted-week) snapshot -- only additive, doesn't touch history.
function syncCurrentWeekWithActiveExercises() {
  const key = state.currentWeekKey;
  const week = state.weeks[key];
  if (!week) return;
  const existingIds = new Set(week.exercises.map(e => e.exerciseId));
  state.exercises.forEach(ex => {
    if (!existingIds.has(ex.id)) {
      week.exercises.push({
        exerciseId: ex.id,
        name: ex.name,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        targetWeight: ex.targetWeight,
        completed: false,
        actualSets: null,
        actualReps: null,
        actualWeight: null,
        completedAt: null
      });
    }
  });
  // Remove exercises from current week that were deleted from active list
  const activeIds = new Set(state.exercises.map(e => e.id));
  week.exercises = week.exercises.filter(e => activeIds.has(e.exerciseId));
  saveData(state);
}

// ---------- View navigation ----------
const views = {
  home: document.getElementById('homeView'),
  edit: document.getElementById('editView'),
  history: document.getElementById('historyView')
};

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  document.getElementById('navHome').classList.toggle('active', name === 'home');
  document.getElementById('navHistory').classList.toggle('active', name === 'history');
  if (name === 'home') renderHome();
  if (name === 'edit') renderEdit();
  if (name === 'history') renderHistory();
}

document.getElementById('editBtn').addEventListener('click', () => showView('edit'));
document.getElementById('navHome').addEventListener('click', () => showView('home'));
document.getElementById('navHistory').addEventListener('click', () => showView('history'));
document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => showView('home'));
});

// ---------- Home view ----------
function renderHome() {
  const key = ensureCurrentWeek();
  const week = state.weeks[key];
  document.getElementById('weekLabel').textContent = formatWeekLabel(key);

  const list = document.getElementById('exerciseList');
  list.innerHTML = '';
  const empty = document.getElementById('emptyState');

  if (!week.exercises.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  week.exercises.forEach((ex, idx) => {
    const li = document.createElement('li');
    li.className = 'exercise-card' + (ex.completed ? ' completed' : '');
    li.innerHTML = `
      <div class="check-circle">✓</div>
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <div class="exercise-target">Target: ${fmtTarget(ex.targetSets, ex.targetReps, ex.targetWeight)}</div>
        ${ex.completed ? `<div class="exercise-actual">Done: ${fmtTarget(ex.actualSets, ex.actualReps, ex.actualWeight)}</div>` : ''}
      </div>
    `;
    li.addEventListener('click', () => openLogModal(idx));
    list.appendChild(li);
  });
}

function fmtTarget(sets, reps, weight) {
  const parts = [];
  if (sets) parts.push(`${sets} sets`);
  if (reps) parts.push(`${reps} reps`);
  if (weight) parts.push(`${weight} kg`);
  return parts.length ? parts.join(' × ') : '—';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Log modal (mark complete) ----------
let logModalIndex = null;
const logModalOverlay = document.getElementById('logModalOverlay');

function openLogModal(idx) {
  const key = state.currentWeekKey;
  const ex = state.weeks[key].exercises[idx];
  logModalIndex = idx;
  document.getElementById('logModalTitle').textContent = ex.name;
  document.getElementById('logSets').value = ex.actualSets ?? ex.targetSets ?? '';
  document.getElementById('logReps').value = ex.actualReps ?? ex.targetReps ?? '';
  document.getElementById('logWeight').value = ex.actualWeight ?? ex.targetWeight ?? '';
  logModalOverlay.hidden = false;
}

document.getElementById('logCancelBtn').addEventListener('click', () => {
  logModalOverlay.hidden = true;
});

document.getElementById('logSaveBtn').addEventListener('click', () => {
  const key = state.currentWeekKey;
  const ex = state.weeks[key].exercises[logModalIndex];
  ex.actualSets = numOrNull(document.getElementById('logSets').value);
  ex.actualReps = numOrNull(document.getElementById('logReps').value);
  ex.actualWeight = numOrNull(document.getElementById('logWeight').value);
  ex.completed = true;
  ex.completedAt = new Date().toISOString();
  saveData(state);
  logModalOverlay.hidden = true;
  renderHome();
});

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Allow tapping a completed exercise to un-complete it via long-press-free simple toggle:
// (kept simple: reopening modal lets user re-save; add explicit uncheck via circle tap)
document.getElementById('exerciseList').addEventListener('click', (e) => {
  const circle = e.target.closest('.check-circle');
  if (!circle) return;
  e.stopPropagation();
  const card = circle.closest('.exercise-card');
  const list = Array.from(document.getElementById('exerciseList').children);
  const idx = list.indexOf(card);
  const key = state.currentWeekKey;
  const ex = state.weeks[key].exercises[idx];
  if (ex.completed) {
    ex.completed = false;
    ex.completedAt = null;
    saveData(state);
    renderHome();
  } else {
    openLogModal(idx);
  }
});

// ---------- Edit view ----------
function renderEdit() {
  const list = document.getElementById('activeExerciseList');
  list.innerHTML = '';
  state.exercises.forEach((ex, idx) => {
    const li = document.createElement('li');
    li.className = 'active-exercise-card';
    li.innerHTML = `
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <div class="exercise-target">${fmtTarget(ex.targetSets, ex.targetReps, ex.targetWeight)}</div>
      </div>
      <span style="color:var(--text-dim)">&rsaquo;</span>
    `;
    li.addEventListener('click', () => openEditTargetModal(idx));
    list.appendChild(li);
  });

  const presetList = document.getElementById('presetList');
  presetList.innerHTML = '';
  PRESET_EXERCISES.forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'preset-chip';
    chip.textContent = name;
    chip.addEventListener('click', () => {
      addExercise(name, null, null, null);
    });
    presetList.appendChild(chip);
  });
}

function addExercise(name, sets, reps, weight) {
  if (!name || !name.trim()) return;
  state.exercises.push({
    id: uid(),
    name: name.trim(),
    targetSets: sets,
    targetReps: reps,
    targetWeight: weight
  });
  saveData(state);
  syncCurrentWeekWithActiveExercises();
  renderEdit();
}

document.getElementById('addCustomBtn').addEventListener('click', () => {
  const name = document.getElementById('customName').value;
  const sets = numOrNull(document.getElementById('customSets').value);
  const reps = numOrNull(document.getElementById('customReps').value);
  const weight = numOrNull(document.getElementById('customWeight').value);
  addExercise(name, sets, reps, weight);
  document.getElementById('customName').value = '';
  document.getElementById('customSets').value = '';
  document.getElementById('customReps').value = '';
  document.getElementById('customWeight').value = '';
});

// ---------- Edit target modal (per-exercise) ----------
let editTargetIndex = null;
const editTargetModalOverlay = document.getElementById('editTargetModalOverlay');

function openEditTargetModal(idx) {
  editTargetIndex = idx;
  const ex = state.exercises[idx];
  document.getElementById('editTargetSets').value = ex.targetSets ?? '';
  document.getElementById('editTargetReps').value = ex.targetReps ?? '';
  document.getElementById('editTargetWeight').value = ex.targetWeight ?? '';
  editTargetModalOverlay.hidden = false;
}

document.getElementById('editTargetCancelBtn').addEventListener('click', () => {
  editTargetModalOverlay.hidden = true;
});

document.getElementById('editTargetSaveBtn').addEventListener('click', () => {
  const ex = state.exercises[editTargetIndex];
  ex.targetSets = numOrNull(document.getElementById('editTargetSets').value);
  ex.targetReps = numOrNull(document.getElementById('editTargetReps').value);
  ex.targetWeight = numOrNull(document.getElementById('editTargetWeight').value);
  saveData(state);
  editTargetModalOverlay.hidden = true;
  renderEdit();
});

document.getElementById('removeExerciseBtn').addEventListener('click', () => {
  state.exercises.splice(editTargetIndex, 1);
  saveData(state);
  syncCurrentWeekWithActiveExercises();
  editTargetModalOverlay.hidden = true;
  renderEdit();
});

// ---------- History view ----------
function renderHistory() {
  ensureCurrentWeek();
  const list = document.getElementById('historyList');
  list.innerHTML = '';
  const empty = document.getElementById('historyEmpty');

  const keys = Object.keys(state.weeks).sort().reverse();
  if (!keys.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  keys.forEach(key => {
    const week = state.weeks[key];
    const total = week.exercises.length;
    const done = week.exercises.filter(e => e.completed).length;

    const div = document.createElement('div');
    div.className = 'history-week';
    div.innerHTML = `
      <div class="history-week-header">
        <div>
          <div class="history-week-title">${formatWeekLabel(key)}</div>
          <div class="history-week-summary">${done}/${total} completed${key === state.currentWeekKey ? ' (current)' : ''}</div>
        </div>
        <span style="color:var(--text-dim)">&rsaquo;</span>
      </div>
      <div class="history-week-details">
        ${total === 0
          ? '<div class="history-exercise-row">No exercises this week.</div>'
          : week.exercises.map(ex => `
            <div class="history-exercise-row">
              <span class="history-exercise-name">${escapeHtml(ex.name)}</span>
              <span class="history-exercise-status ${ex.completed ? 'done' : 'missed'}">
                ${ex.completed ? fmtTarget(ex.actualSets, ex.actualReps, ex.actualWeight) : 'Not done'}
              </span>
            </div>
          `).join('')
        }
      </div>
    `;
    div.querySelector('.history-week-header').addEventListener('click', () => {
      div.classList.toggle('open');
    });
    list.appendChild(div);
  });
}

// ---------- Init ----------
ensureCurrentWeek();
showView('home');
