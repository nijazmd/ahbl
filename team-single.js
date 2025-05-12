const urlParams = new URLSearchParams(window.location.search);
const selectedTeam = urlParams.get("team");

const tasksMetaURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRXcCLM3cYAIQGlGdsjlBVW2g8qjnYpUsl0Nn3ESq-0AkIfr54WrHp_JeaYZfA4cpYdr-ebnLPyPkCN/pub?gid=971568410&single=true&output=csv';
const dataURL = 'https://script.google.com/macros/s/AKfycbzKLcGk1-gq19BW74v6Dw8uIvJ3EHSwWJ99OkHESa2DU1WFbJQM8HM5oZmmB9NB7_dR/exec';

let taskMeta = {};

async function loadTasksMeta() {
  const res = await fetch(tasksMetaURL);
  const csv = await res.text();
  const rows = csv.trim().split('\n').map(r => r.split(','));
  const headers = rows[0];

  rows.slice(1).forEach(row => {
    const taskID = `T${row[0]}_Score`;
    taskMeta[taskID] = {
      name: row[1],
      target: parseFloat(row[2]) || 0,
      completion: parseFloat(row[3]) || 0,
      fraction: parseFloat(row[4]) || 0,
      isAvoidance: (row[5] || '').toLowerCase() === 'true',
      max: parseFloat(row[6]) || 0
    };
  });
}

async function loadTeamData() {
  const res = await fetch(dataURL);
  const rows = await res.json();

  const allTeamPoints = {};
  const teamEntries = [];

  rows.forEach(entry => {
    const team = entry.Team;
    const points = parseFloat(entry["TotalPoints"]) || 0;

    allTeamPoints[team] = (allTeamPoints[team] || 0) + points;

    if (team === selectedTeam) {
      teamEntries.push(entry);
    }
  });

  return { teamEntries, allTeamPoints };
}

function getRank(teamPointsMap, team) {
  const sorted = Object.entries(teamPointsMap).sort((a, b) => b[1] - a[1]);
  return sorted.findIndex(t => t[0] === team) + 1;
}

function renderSummary(teamEntries, rank, totalPoints) {
  document.getElementById("teamName").textContent = selectedTeam;
  document.getElementById("teamRank").textContent = `#${rank}`;
  document.getElementById("totalPoints").textContent = totalPoints.toFixed(2);
  document.getElementById("totalRounds").textContent = teamEntries.length;
}

function renderTaskStats(teamEntries) {
  const taskStats = {};

  for (let i = 1; i <= 24; i++) {
    const key = `T${i}_Score`;
    if (!taskMeta[key]) continue;

    taskStats[key] = {
      name: taskMeta[key].name,
      total: 0,
      completed: 0,
      maxed: 0,
      earnedPoints: 0,
      targetAvailable: 0,
      maxAvailable: 0
    };
  }

  teamEntries.forEach(entry => {
    for (let key in taskStats) {
      const score = parseFloat(entry[key]);
      if (isNaN(score)) continue;

      const meta = taskMeta[key];
      const stats = taskStats[key];
      stats.total++;

      if (meta.isAvoidance) {
        if (score <= meta.target) stats.completed++;      // avoided target
        if (score === 0) stats.maxed++;                   // perfect avoidance
      } else {
        if (score >= meta.target) stats.completed++;      // normal completion
        if (score >= meta.max) stats.maxed++;             // max performance
      }


      let earned = 0;
      if (meta.isAvoidance) {
        earned = (meta.target - score) * meta.fraction + (score <= meta.target ? meta.completion : 0);
      } else {
        earned = (score * meta.fraction) + (score >= meta.target ? meta.completion : 0);
      }

      stats.earnedPoints += earned;

      let targetPoints, maxPoints;
      if (meta.isAvoidance) {
        targetPoints = meta.completion; // full reward is just the completion bonus
        maxPoints = (meta.target * meta.fraction); // worst-case: you completely fail the avoidance
      } else {
        targetPoints = (meta.target * meta.fraction + meta.completion);
        maxPoints = (meta.max * meta.fraction + meta.completion);
      }


      stats.targetAvailable += targetPoints;
      stats.maxAvailable += maxPoints;
    }
  });

  const container = document.getElementById("taskStatsContainer");

  Object.entries(taskStats).forEach(([key, stats]) => {
    if (stats.total === 0) return;

    const earned = stats.earnedPoints || 0;
    const target = stats.targetAvailable || 1;
    const max = stats.maxAvailable || 1;

    const targetPercent = (earned / target) * 100;
    const maxPercent = (earned / max) * 100;

    const div = document.createElement("div");
    div.className = "task-card";
    div.innerHTML = `
      <h3>${stats.name}</h3>
      <p>Completions: ${stats.completed}/${stats.total}</p>
      <p>Max Achievements: ${stats.maxed}/${stats.total}</p>
      <p><strong>Target Achievement:</strong> ${earned.toFixed(2)} / ${target.toFixed(2)} / ${max.toFixed(2)}</p>
      <div class="triple-bar">
        <div class="target-bar" style="width: ${Math.min(maxPercent, 100)}%">
          <div class="achieved-bar" style="width: ${Math.min(targetPercent, 100)}%"></div>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

async function init() {
  if (!selectedTeam) {
    document.body.innerHTML = "<p>No team selected.</p>";
    return;
  }

  await loadTasksMeta();
  const { teamEntries, allTeamPoints } = await loadTeamData();
  const totalPoints = allTeamPoints[selectedTeam] || 0;
  const rank = getRank(allTeamPoints, selectedTeam);

  renderSummary(teamEntries, rank, totalPoints);
  renderTaskStats(teamEntries);
}

init();
