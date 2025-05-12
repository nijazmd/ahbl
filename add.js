const currentRoundID = '1';

const tasksMetaURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRXcCLM3cYAIQGlGdsjlBVW2g8qjnYpUsl0Nn3ESq-0AkIfr54WrHp_JeaYZfA4cpYdr-ebnLPyPkCN/pub?gid=971568410&single=true&output=csv';
const postUrl = 'https://script.google.com/macros/s/AKfycbzKLcGk1-gq19BW74v6Dw8uIvJ3EHSwWJ99OkHESa2DU1WFbJQM8HM5oZmmB9NB7_dR/exec';

let tasks = [];

document.addEventListener("DOMContentLoaded", async () => {
  console.log("📦 DOMContentLoaded started");
  await loadTasksMeta();
  setupListeners();
  console.log("✅ Page setup complete");
});

async function loadTasksMeta() {
  console.log("📥 Loading tasksMeta...");
  const res = await fetch(tasksMetaURL);
  const csvText = await res.text();
  const rows = csvText.trim().split('\n').map(r => r.split(','));
  const headers = rows[0].map(h => h.trim());

  tasks = rows.slice(1).map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  );

  const container = document.getElementById('taskInputs');
  tasks.forEach((task) => {
    const taskId = `T${task["TaskID"]}_Score`;
    const max = parseFloat(task.Max || 100);
    container.innerHTML += `
      <label for="${taskId}">
        <span>${task.Task}</span>
        <span class="targets">Tar: ${task.Target} | Max: ${max}</span>
      </label>
      <input type="number" class="task-input" id="${taskId}" name="${taskId}" max="${max}" min="0" inputmode="numeric" enterkeyhint="next" required />
      <progress id="${taskId}_progress" value="0" max="${task.Target}"></progress>
      <span id="${taskId}_percent">0%</span>
      <span id="${taskId}_points" class="task-points">0 pts</span>
    `;
  });
}

function setupListeners() {
  document.getElementById('taskInputs').addEventListener('keydown', (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const inputs = Array.from(document.querySelectorAll('.task-input'));
      const index = inputs.indexOf(e.target);
      if (index >= 0 && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    }
  });

  console.log("🔧 setupListeners called");
  document.getElementById('adminForm').addEventListener('submit', handleSubmit);
  console.log("✅ Submit handler attached");

  document.getElementById('taskInputs').addEventListener('input', updateLiveTotalPoints);
}

function calculatePoints(scoreFieldName, rawScore) {
  const task = tasks.find(t => `T${t["TaskID"]}_Score` === scoreFieldName);
  if (!task) return 0;

  const score = parseFloat(rawScore);
  if (isNaN(score)) return 0;

  const target = parseFloat(task.Target);
  const completion = parseFloat(task.CompletionPoint);
  const fraction = parseFloat(task.FractionPoint);
  const isAvoidance = (task.IsAvoidance || "").toLowerCase() === 'true';

  if ([target, completion, fraction].some(v => isNaN(v))) {
    console.warn(`⚠️ Invalid task config for ${scoreFieldName}:`, task);
    return 0;
  }

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
    if (!isNaN(points)) {
      total += points;
    }

    // Update UI
    const progressBar = document.getElementById(`${scoreField}_progress`);
    const percentText = document.getElementById(`${scoreField}_percent`);
    const pointsSpan = document.getElementById(`${scoreField}_points`);
    const target = parseFloat(task.Target);

    const safeScore = isNaN(score) ? 0 : score;
    const percent = !isNaN(target) && target !== 0
      ? Math.min((safeScore / target) * 100, 100)
      : 0;

    if (progressBar) progressBar.value = safeScore;
    if (percentText) percentText.textContent = `${Math.round(percent)}%`;
    if (pointsSpan) pointsSpan.textContent = `${points.toFixed(2)} pts`;
  });

  document.getElementById("liveTotalPoints").textContent = total.toFixed(2);
}


async function handleSubmit(event) {
  event.preventDefault();
  console.log("📨 handleSubmit triggered");

  const form = document.getElementById('adminForm');
  const formData = new FormData(form);
  const weekNumber = parseInt(formData.get("weekNumber"), 10);
  const { startDate, endDate } = calculateDateRange(weekNumber);
  const team = formData.get("teamName");

  let totalPoints = 0;
  const scores = {};
  tasks.forEach(task => {
    const scoreField = `T${task["TaskID"]}_Score`;
    const score = parseFloat(formData.get(scoreField)) || 0;
    scores[scoreField] = score;
    totalPoints += calculatePoints(scoreField, score);
  });

  const payload = {
    RoundID: currentRoundID,
    WeekNumber: weekNumber,
    StartDate: startDate,
    EndDate: endDate,
    Team: team,
    Player: "",
    Comments: formData.get("comments") || "",
    TotalPoints: totalPoints.toFixed(2),
    ...scores,
    key: "asnLg_2@25"
  };

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
      document.body.removeChild(tempForm);
      document.body.removeChild(iframe);
    }, 2000);

    document.getElementById("message").textContent = "✅ Submitted!";
  } catch (err) {
    console.error("🚨 Fetch failed:", err);
    document.getElementById("message").textContent = "❌ Submission failed.";
  }
}

function calculateDateRange(weekNumber) {
  const base = new Date("2025-01-01");
  const start = new Date(base.getTime() + (weekNumber - 1) * 7 * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
}
