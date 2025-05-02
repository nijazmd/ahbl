const dataUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRXcCLM3cYAIQGlGdsjlBVW2g8qjnYpUsl0Nn3ESq-0AkIfr54WrHp_JeaYZfA4cpYdr-ebnLPyPkCN/pub?gid=0&single=true&output=csv';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch(dataUrl);
    const text = await res.text();
    const rows = text.trim().split('\n').map(row => row.split(','));

    const headers = rows[0];
    const data = rows.slice(1).map(row => Object.fromEntries(
      row.map((val, i) => [headers[i], val])
    ));

    const teamStats = {};

    data.forEach(entry => {
      const team = entry.Team;
      const points = parseFloat(entry['Total Points']);

      if (!isNaN(points)) {
        if (!teamStats[team]) {
          teamStats[team] = { totalPoints: 0, games: 0 };
        }
        teamStats[team].totalPoints += points;
        teamStats[team].games += 1;
      }
    });

    const sortedTeams = Object.entries(teamStats)
      .sort((a, b) => b[1].totalPoints - a[1].totalPoints);

    const tableBody = document.getElementById('standingsBody');
    sortedTeams.forEach(([team, stats], index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${team}</td>
        <td>${stats.totalPoints.toFixed(2)}</td>
        <td>${stats.games}</td>
      `;
      tableBody.appendChild(row);
    });
  } catch (err) {
    console.error('Failed to load standings:', err);
  }
});
