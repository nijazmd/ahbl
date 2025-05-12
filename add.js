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


  tasks = rows.slice(1).map(row => Object.fromEntries(row.map((val, i) => [headers[i], val])));

  const container = document.getElementById('taskInputs');
  tasks.forEach((task) => {
    const taskId = `T${task["Task ID"]}_Score`;

    const max = parseInt(task.Max || 100, 10);
    container.innerHTML += `
  <label for="${taskId}">
    <span>${task.Task}</span>
    <span class="targets">Tar: ${task.Target} | Max: ${max}</span>
  </label>
  <input type="number" id="${taskId}" name="${taskId}" max="${max}" min="0" inputmode="numeric" enterkeyhint="next" required />
  <progress id="${taskId}_progress" value="0" max="${task.Target}"></progress>
  <span id="${taskId}_percent">0%</span>
  <span id="${taskId}_points" class="task-points">0 pts</span>
`;

  

  });
}

function setupListeners() {
  // Automatically focus the next input when 'Enter' is pressed
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
    // 🔁 Recalculate live total on any input change
    document.getElementById('taskInputs').addEventListener('input', updateLiveTotalPoints);

}

function calculateDateRange(weekNumber) {
  const base = new Date("2025-01-01");
  const start = new Date(base.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
}

function calculatePoints(taskId, rawScore) {
  const task = tasks.find(t => t["Task ID"] === taskId);
  if (!task) return 0;

  const target = parseFloat(task.Target) || 0;
  const completion = parseFloat(task["Completion Point"]) || 0;
  const fraction = parseFloat(task["Fraction Point"]) || 0;
  const isAvoidance = (task["IsAvoidance"] || "").toLowerCase() === 'true';
  const score = parseFloat(rawScore);
  
  if (isNaN(score)) return 0;  // ✅ Guard against invalid inputs

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
    const taskId = `T${task["Task ID"]}_Score`;
    const raw = formData.get(taskId);
    const score = parseFloat(raw);

    if (!isNaN(score)) {
      total += calculatePoints(task["Task ID"], score);

      // ✅ Update progress bar
      const progressBar = document.getElementById(`${taskId}_progress`);
      const percentText = document.getElementById(`${taskId}_percent`);
      const target = parseFloat(task.Target);
      const percent = Math.min((score / target) * 100, 100);

      if (progressBar) progressBar.value = score;
      if (percentText) percentText.textContent = `${Math.round(percent)}%`;
    }
    const pointsSpan = document.getElementById(`${taskId}_points`);
    const points = calculatePoints(task["Task ID"], score);
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
    const taskId = `T${task["Task ID"]}_Score`;
    const score = parseFloat(formData.get(taskId));
    scores[taskId] = score;
    totalPoints += calculatePoints(task["Task ID"], score);
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
  };
  payload.key = "key=asnLg_2@25";


  try {
    // ✅ Create a truly hidden iframe
    const iframeName = "hidden_iframe_" + Date.now();
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    // ✅ Create a temporary form targeting the iframe
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

    // ✅ Clean up after a short delay
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
