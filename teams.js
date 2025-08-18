const tasksMetaURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRXcCLM3cYAIQGlGdsjlBVW2g8qjnYpUsl0Nn3ESq-0AkIfr54WrHp_JeaYZfA4cpYdr-ebnLPyPkCN/pub?gid=971568410&single=true&output=csv';
const dataURL = 'https://script.google.com/macros/s/AKfycbzKLcGk1-gq19BW74v6Dw8uIvJ3EHSwWJ99OkHESa2DU1WFbJQM8HM5oZmmB9NB7_dR/exec';

let taskMeta = {};

async function loadTaskMeta() {
  const res = await fetch(tasksMetaURL);
  const csv = await res.text();
  const rows = csv.trim().split('\n').map(r => r.split(','));
  // headers: [TaskID, Task, Target, CompletionPoint, FractionPoint, IsAvoidance, Max, ...]
  rows.slice(1).forEach(row => {
    const id = `T${row[0]}_Score`;
    taskMeta[id] = {
      Target: parseFloat(row[2]) || 0,
      Max: parseFloat(row[6]) || 0,
      IsAvoidance: (row[5] || '').toLowerCase() === 'true'
    };
  });
}

function normalizeShortWeek(sw) {
  // Expected: "7" | "6" | "5" | "4"
  // Legacy fallback:
  //  - "TRUE"  → assume 6d short week
  //  - "FALSE" → 7d
  if (sw === null || sw === undefined || sw === '') return 7;
  const n = parseInt(sw, 10);
  if (!isNaN(n) && [4,5,6,7].includes(n)) return n;

  const s = String(sw).trim().toLowerCase();
  if (s === 'true')  return 6;
  if (s === 'false') return 7;
  return 7;
}

async function loadData() {
  const res = await fetch(dataURL);
  const json = await res.json();

  const teamStats = {};

  json.forEach(entry => {
    const team = entry.Team;
    if (!teamStats[team]) {
      teamStats[team] = {
        gamesPlayed: 0,
        completions: 0,
        maxes: 0,
        totalTasks: 0,
        totalPoints: 0,
        d7: 0, d6: 0, d5: 0, d4: 0
      };
    }

    teamStats[team].gamesPlayed++;

    // Count short-week bucket from ShortWeek column
    const days = normalizeShortWeek(entry.ShortWeek);
    if (days === 7) teamStats[team].d7++;
    else if (days === 6) teamStats[team].d6++;
    else if (days === 5) teamStats[team].d5++;
    else if (days === 4) teamStats[team].d4++;

    // Per-task completion / max counts
    for (let i = 1; i <= 24; i++) {
      const key = `T${i}_Score`;
      const score = parseFloat(entry[key]);
      if (isNaN(score)) continue;

      teamStats[team].totalTasks++;

      const meta = taskMeta[key];
      if (meta) {
        if (score >= meta.Target) teamStats[team].completions++;
        if (score >= meta.Max) teamStats[team].maxes++;
      }
    }

    teamStats[team].totalPoints += parseFloat(entry["TotalPoints"]) || 0;
  });

  return teamStats;
}

function render(teamStats) {
  const tbody = document.querySelector("#teamTable tbody");
  tbody.innerHTML = '';

  const teams = Object.entries(teamStats).sort((a, b) => {
    if (a[1].gamesPlayed !== b[1].gamesPlayed) {
      return a[1].gamesPlayed - b[1].gamesPlayed; // Asc by games played
    }
    return a[1].totalPoints - b[1].totalPoints;   // Asc by total points
  });

  if (teams.length > 0) {
    const topTeam = teams[0][0];
    localStorage.setItem("currentTeam", topTeam);
  }

  teams.forEach(([team, stats]) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><a href="team-single.html?team=${team}">${team}</a></td>
      <td>${stats.gamesPlayed}</td>
      <td class="subinfo">${stats.d7}</td>
      <td class="subinfo">${stats.d6}</td>
      <td class="subinfo">${stats.d5}</td>
      <td class="subinfo">${stats.d4}</td>
      <td>${stats.completions}/${stats.totalTasks}</td>
      <td>${stats.maxes}/${stats.totalTasks}</td>
      <td>${stats.totalPoints.toFixed(2)}</td>
    `;
    tbody.appendChild(row);
  });
}

async function init() {
  await loadTaskMeta();
  const teamStats = await loadData();
  render(teamStats);
}

init();
