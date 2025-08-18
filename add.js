/* add.js — AHbL Add Page (single draft, fixed status, robust restore) */

const currentRoundID = '1';

const tasksMetaURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRXcCLM3cYAIQGlGdsjlBVW2g8qjnYpUsl0Nn3ESq-0AkIfr54WrHp_JeaYZfA4cpYdr-ebnLPyPkCN/pub?gid=971568410&single=true&output=csv';
const postUrl      = 'https://script.google.com/macros/s/AKfycbzKLcGk1-gq19BW74v6Dw8uIvJ3EHSwWJ99OkHESa2DU1WFbJQM8HM5oZmmB9NB7_dR/exec';
const draftsGetUrl = `${postUrl}?sheet=AHbL_Drafts`;

let tasks = [];
const taskConfigByField = {};

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadTasksMeta();
    setDefaultStartingDate();
    setupListeners();
    await restoreDraftIfAny();        // restore the single draft if present
    updateLiveTotalPoints();          // sync totals after restore/defaults
  } catch (e) {
    console.error(e);
    setStatus("⚠️ Page init issue. Try reloading.", "warn");
  }
});

/* ---------- Status helper (fixed bar) ---------- */
function setStatus(msg, kind = "ok") {
  const el = document.getElementById("statusMsg") || document.getElementById("message");
  if (!el) return;
  el.classList && el.classList.remove("ok","warn","err");
  el.classList && el.classList.add(kind);
  el.textContent = msg;
}

/* ---------- Dates / Defaults ---------- */
function setDefaultStartingDate() {
  const input = document.getElementById('startingDate');
  if (!input) return;
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const offsetToLastMonday = ((day + 6) % 7) + 7;
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - offsetToLastMonday);
  input.value = lastMonday.toISOString().split('T')[0]; // YYYY-MM-DD
}

/* ---------- Tasks Meta & UI ---------- */
async function loadTasksMeta() {
  const res = await fetch(tasksMetaURL, { cache: "no-store" });
  const csvText = await res.text();
  const rows = csvText.trim().split('\n').map(r => r.split(','));
  const headers = rows[0].map(h => h.trim());

  tasks = rows.slice(1).map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  );

  const container = document.getElementById('taskInputs');
  container.innerHTML = '';

  tasks.forEach((task) => {
    const taskId = `T${task["TaskID"]}_Score`;
    const max = parseFloat(task.Max || 100);
    const frac = Math.abs(parseFloat(task.FractionPoint)) || 1;

    taskConfigByField[taskId] = { fraction: frac, max };

    container.insertAdjacentHTML('beforeend', `
      <label for="${taskId}">
        <span>${escapeHTML(task.Task || '')}</span>
        <span class="targets">Tar: ${escapeHTML(task.Target || '')} | Max: ${Number.isFinite(max) ? max : ''}</span>
      </label>
      <div class="task-input-row">
        <button type="button" class="step-btn" data-dir="-1" data-field="${taskId}">−</button>
        <input type="number" class="task-input" id="${taskId}" name="${taskId}" max="${max}" min="0" step="${frac}" inputmode="numeric" enterkeyhint="next" required />
        <button type="button" class="step-btn" data-dir="1" data-field="${taskId}">+</button>
      </div>
      <progress id="${taskId}_progress" value="0" max="${parseFloat(task.Target) || 0}"></progress>
      <span id="${taskId}_percent">0%</span>
      <span id="${taskId}_points" class="task-points">0 pts</span>
    `);
  });
}

/* ---------- Listeners ---------- */
function setupListeners() {
  // Enter → next input
  document.getElementById('taskInputs').addEventListener('keydown', (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const inputs = Array.from(document.querySelectorAll('.task-input'));
      const index = inputs.indexOf(e.target);
      if (index >= 0 && index < inputs.length - 1) inputs[index + 1].focus();
    }
  });

  // +/- controls
document.getElementById('taskInputs').addEventListener('click', (e) => {
  const btn = e.target.closest('.step-btn');
  if (!btn) return;
  const field = btn.dataset.field;
  const dir = parseInt(btn.dataset.dir, 10) || 0;
  const input = document.getElementById(field);
  if (!input) return;

  const maxAttr = Number(input.max);
  const max = Number.isFinite(maxAttr) ? maxAttr : (taskConfigByField[field]?.max ?? Infinity);

  const current = parseFloat(input.value) || 0;
  const step = dir > 0 ? 1 : -1;   // force +/- 1 for all inputs
  const next = clamp(current + step, 0, max);

  input.value = Number.isFinite(next) ? round6(next) : 0;
  updateLiveTotalPoints();
});


  // Total live updates
  document.getElementById('taskInputs').addEventListener('input', updateLiveTotalPoints);

  // Save/Submit bindings (Submit is the form's submit)
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.addEventListener('click', handleSave);

  const form = document.getElementById('adminForm');
  form.addEventListener('submit', handleSubmit);
}

/* ---------- Scoring ---------- */
function calculatePoints(scoreFieldName, rawScore) {
  const task = tasks.find(t => `T${t["TaskID"]}_Score` === scoreFieldName);
  if (!task) return 0;

  const score = parseFloat(rawScore);
  if (isNaN(score)) return 0;

  const target = parseFloat(task.Target);
  const completion = parseFloat(task.CompletionPoint);
  const fraction = parseFloat(task.FractionPoint);
  const isAvoidance = (task.IsAvoidance || "").toLowerCase() === 'true';

  if ([target, completion, fraction].some(v => isNaN(v))) return 0;

  if (isAvoidance) {
    const delta = target - score;
    return delta * fraction + (score <= target ? completion : 0);
  } else {
    return (score * fraction) + (score >= target ? completion : 0);
  }
}

function updateLiveTotalPoints() {
  const form = document.getElementById('adminForm');
  const formData = new FormData(form);
  let total = 0;

  tasks.forEach(task => {
    const scoreField = `T${task["TaskID"]}_Score`;
    const raw = formData.get(scoreField);
    const score = parseFloat(raw);

    const points = calculatePoints(scoreField, score);
    if (!isNaN(points)) total += points;

    // Update UI per task
    const progressBar = document.getElementById(`${scoreField}_progress`);
    const percentText = document.getElementById(`${scoreField}_percent`);
    const pointsSpan = document.getElementById(`${scoreField}_points`);
    const target = parseFloat(task.Target);

    const safeScore = isNaN(score) ? 0 : score;
    const percent = (!isNaN(target) && target !== 0)
      ? Math.min((safeScore / target) * 100, 100)
      : 0;

    if (progressBar) progressBar.value = safeScore;
    if (percentText) percentText.textContent = `${Math.round(percent)}%`;
    if (pointsSpan) pointsSpan.textContent = `${(points || 0).toFixed(2)} pts`;
  });

  const totalEl = document.getElementById("liveTotalPoints");
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

/* ---------- Payload + Actions ---------- */
function collectPayload(mode) {
  const form = document.getElementById('adminForm');
  const formData = new FormData(form);
  const team = formData.get("teamName");

  let totalPoints = 0;
  const scores = {};
  tasks.forEach(task => {
    const scoreField = `T${task["TaskID"]}_Score`;
    const val = parseFloat(formData.get(scoreField)) || 0;
    scores[scoreField] = val;
    totalPoints += calculatePoints(scoreField, val);
  });

  const shortWeekDays = parseInt(formData.get("ShortWeek") || "7", 10);

  return {
    Mode: mode,                               // "save" or "submit"
    RoundID: currentRoundID,
    StartingDate: formData.get("StartingDate") || "",
    Team: team || "",
    Player: "",
    ShortWeek: String(shortWeekDays),         // 7/6/5/4
    Comments: formData.get("comments") || "",
    TotalPoints: totalPoints.toFixed(2),
    ...scores,
    key: "asnLg_2@25"
  };
}

async function handleSave() {
  const team = document.getElementById('teamName').value;
  const startingDate = document.getElementById('startingDate').value;
  if (!team || !startingDate) {
    setStatus("⚠️ Pick Team and Starting Date before saving.", "warn");
    return;
  }
  const payload = collectPayload("save");
  postViaIframe(payload, () => setStatus("💾 Draft saved.", "ok"));
}

async function handleSubmit(e) {
  e.preventDefault();
  if (!confirm("Do you really want to submit?")) return;

  const payload = collectPayload("submit");
  postViaIframe(payload, async () => {
    setStatus("✅ Submitted!", "ok");
    await delay(250);
    await resetFormToDefaults();
  });
}

/* ---------- Draft restore ---------- */
async function restoreDraftIfAny() {
  try {
    const res = await fetch(draftsGetUrl, { cache: "no-store" });
    if (!res.ok) return;
    const drafts = await res.json();
    if (!Array.isArray(drafts) || drafts.length === 0) return;

    const raw = drafts[0]; // single draft row
    const map = {};
    Object.keys(raw).forEach(k => { map[normalizeKey_(k)] = raw[k]; });

    // Basic fields
    const sdRaw = map[normalizeKey_('StartingDate')];
    const teamRaw = map[normalizeKey_('Team')];
    if (sdRaw) document.getElementById('startingDate').value = toYMD_(sdRaw);
    if (teamRaw) document.getElementById('teamName').value = String(teamRaw);

    // ShortWeek radio (defaults to 7)
    const sw = String(map[normalizeKey_('ShortWeek')] ?? '7');
    const radio = document.querySelector(`input[name="ShortWeek"][value="${sw}"]`);
    if (radio) radio.checked = true;

    // Comments / Notes
    const comments = map[normalizeKey_('Comments')] ?? map[normalizeKey_('Notes')] ?? '';
    const commentsEl = document.getElementById('comments');
    if (commentsEl) commentsEl.value = String(comments);

    // Task inputs
    tasks.forEach(task => {
      const field = `T${task["TaskID"]}_Score`;
      const normField = normalizeKey_(field); // e.g., t1_score
      const valRaw = map[normField];
      if (valRaw !== undefined && valRaw !== '') {
        const val = parseFloat(valRaw);
        const input = document.getElementById(field);
        if (input) input.value = isNaN(val) ? 0 : val;
      }
    });

    updateLiveTotalPoints();
    setStatus("↩️ Draft restored.", "ok");
  } catch (err) {
    console.warn("Draft restore failed:", err);
  }
}

/* ---------- Reset after submit ---------- */
async function resetFormToDefaults() {
  const form = document.getElementById('adminForm');
  form.reset();

  setDefaultStartingDate();
  const regular = document.querySelector('input[name="ShortWeek"][value="7"]');
  if (regular) regular.checked = true;

  document.querySelectorAll('.task-input').forEach(inp => inp.value = '');
  updateLiveTotalPoints();

  setStatus("🆕 Ready for a new entry.", "ok");
}

/* ---------- Utils ---------- */
function postViaIframe(payload, onComplete) {
  try {
    const iframeName = "hidden_iframe_" + Date.now();
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    const tempForm = document.createElement("form");
    tempForm.method = "POST";
    tempForm.action = postUrl;
    tempForm.target = iframeName;
    tempForm.style.display = "none";

    for (let key in payload) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = payload[key];
      tempForm.appendChild(input);
    }

    document.body.appendChild(tempForm);
    tempForm.submit();

    setTimeout(() => {
      try { document.body.removeChild(tempForm); } catch {}
      try { document.body.removeChild(iframe); } catch {}
      if (typeof onComplete === 'function') onComplete();
    }, 1600);
  } catch (err) {
    console.error("🚨 Post failed:", err);
    setStatus("❌ Submission failed.", "err");
  }
}

function toYMD_(v) {
  // 1) Already YYYY-MM-DD
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // 2) Parseable date string
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d)) return d.toISOString().slice(0,10);
  }

  // 3) Google Sheets / Excel serial
  if (typeof v === 'number' && isFinite(v)) {
    const excelEpoch = Date.UTC(1899, 11, 30); // 1899-12-30
    const ms = excelEpoch + Math.round(v * 86400000);
    const d = new Date(ms);
    if (!isNaN(d)) return d.toISOString().slice(0,10);
  }

  // 4) Date object
  if (v instanceof Date && !isNaN(v)) {
    return v.toISOString().slice(0,10);
  }

  return '';
}

function normalizeKey_(k) {
  return String(k || '').replace(/\s+/g, '').replace(/[\r\n\t]+/g, '').toLowerCase();
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
