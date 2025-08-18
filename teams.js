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

/* ===== Standings history (add below your existing code) ===== */

function standings_getRoundKey(e) {
  // Prefer RoundID, fallback to StartingDate
  return (e.RoundID !== undefined && e.RoundID !== null && e.RoundID !== '')
    ? e.RoundID
    : (e.StartingDate || '');
}

function standings_sortRoundKeys(a, b) {
  const na = Number(a), nb = Number(b);
  const aNum = !Number.isNaN(na), bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;               // numeric RoundID
  const da = new Date(a), db = new Date(b);
  const aDate = !isNaN(da), bDate = !isNaN(db);
  if (aDate && bDate) return da - db;             // date fallback
  return String(a).localeCompare(String(b));       // string fallback
}

async function buildStandingsHistoryChart() {
  // Fetch raw entries (separate from your aggregated teamStats)
  const res = await fetch(dataURL, { cache: 'no-store' });
  const entries = await res.json();

  // Unique teams
  const teams = Array.from(new Set(entries.map(e => e.Team).filter(Boolean))).sort();

  // Group by round key and sum points per team
  const rounds = new Map(); // rk -> Map(team -> roundPoints)
  for (const e of entries) {
    const rk = standings_getRoundKey(e);
    if (!rk || !e.Team) continue;
    if (!rounds.has(rk)) rounds.set(rk, new Map());
    const m = rounds.get(rk);
    const pts = parseFloat(e.TotalPoints) || 0;
    m.set(e.Team, (m.get(e.Team) || 0) + pts);
  }

  // Keep only rounds completed by ALL teams; then sort in order
  const completed = Array.from(rounds.entries())
    .filter(([rk, map]) => teams.every(t => map.has(t)))
    .sort((A, B) => standings_sortRoundKeys(A[0], B[0]));

  const msgEl = document.getElementById('standingsChartMsg');
  if (completed.length === 0) {
    if (msgEl) msgEl.textContent = 'No fully completed rounds yet.';
    return;
  }

  // Build cumulative totals and rank positions per completed round
  const labels = completed.map((_, i) => `R${i + 1}`);
  const cum = new Map(teams.map(t => [t, 0]));
  const series = Object.fromEntries(teams.map(t => [t, []]));

  for (const [, roundMap] of completed) {
    teams.forEach(t => cum.set(t, (cum.get(t) || 0) + (roundMap.get(t) || 0)));
    const ordered = Array.from(cum.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];      // desc totals
      return a[0].localeCompare(b[0]);            // tie-break by team code
    });
    const pos = new Map(ordered.map(([t], i) => [t, i + 1]));
    teams.forEach(t => series[t].push(pos.get(t)));
  }

// Build datasets with explicit team colors (fallback to a default palette)
// Team brand colors (edit these to whatever you like)
const TEAM_COLORS = {
  AMC: '#0000ff',
  BIS: '#3cb44b',
  BOS: '#ffe119',
  CAR: '#4363d8',
  FRE: '#f58231',
  HST: '#911eb4',
  GRE: '#46f0f0',
  OTT: '#f032e6',
  PNX: '#bcf60c',
  ZDG: '#fabebe',
};


const fallback = ['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6','#bcf60c','#fabebe'];
const colorFor = (team, i) => TEAM_COLORS[team] || fallback[i % fallback.length];

const datasets = teams.map((t, i) => {
  const c = colorFor(t, i);
  return {
    label: t,
    data: series[t],
    borderColor: c,
    backgroundColor: c,
    borderWidth: 2,
    tension: 0.25,
    pointRadius: 2,
    fill: false
  };
});


  // Render Chart.js
  const canvas = document.getElementById('standingsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (window._standingsChart) window._standingsChart.destroy();
  window._standingsChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
        tooltip: { intersect: false, mode: 'index' }
      },
      scales: {
        y: {
          min: 1,
          max: teams.length,
          reverse: true,            // 1 at top, N at bottom
          ticks: { stepSize: 1 },
          grid: { color: 'rgba(255,255,255,.1)' }
        },
        x: {
          title: { display: true, text: 'Round' },
          grid: { color: 'rgba(255,255,255,.05)' }
        }
      },
      elements: { point: { radius: 2, hitRadius: 8 } }
    }
  });

  if (msgEl) msgEl.textContent = '';
}


async function init() {
  await loadTaskMeta();
  const teamStats = await loadData();
  render(teamStats);

  // ADD THIS:
  await buildStandingsHistoryChart();
}

init();
