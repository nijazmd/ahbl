const tasksMetaURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRXcCLM3cYAIQGlGdsjlBVW2g8qjnYpUsl0Nn3ESq-0AkIfr54WrHp_JeaYZfA4cpYdr-ebnLPyPkCN/pub?gid=971568410&single=true&output=csv';
const dataURL = 'https://script.google.com/macros/s/AKfycbzKLcGk1-gq19BW74v6Dw8uIvJ3EHSwWJ99OkHESa2DU1WFbJQM8HM5oZmmB9NB7_dR/exec';

let taskMeta = {};

async function loadTaskMeta() {
  const res = await fetch(tasksMetaURL);
  const csv = await res.text();
  const rows = csv.trim().split('\n').map(r => r.split(','));
  const headers = rows[0];

  rows.slice(1).forEach(row => {
    const id = `T${row[0]}_Score`;
    taskMeta[id] = {
      Target: parseFloat(row[2]) || 0,
      Max: parseFloat(row[6]) || 0,
      IsAvoidance: (row[5] || '').toLowerCase() === 'true'
    };
  });
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
        totalPoints: 0
      };
    }

    teamStats[team].gamesPlayed++;


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
  const teams = Object.entries(teamStats).sort((a, b) => {
    if (a[1].gamesPlayed !== b[1].gamesPlayed) {
      return a[1].gamesPlayed - b[1].gamesPlayed; // Ascending by games played
    }
    return a[1].totalPoints - b[1].totalPoints; // Ascending by total points
  });


  teams.forEach(([team, stats]) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><a href="team-single.html?team=${team}">${team}</a></td>
      <td>${stats.gamesPlayed}</td>
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
