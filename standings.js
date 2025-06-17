const dataUrl = 'https://script.google.com/macros/s/AKfycbzKLcGk1-gq19BW74v6Dw8uIvJ3EHSwWJ99OkHESa2DU1WFbJQM8HM5oZmmB9NB7_dR/exec';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch(dataUrl);
    const data = await res.json(); // Uses the Apps Script doGet() JSON output

    const teamStats = {};

    data.forEach(entry => {
      const team = entry.Team;
      const points = parseFloat(entry['TotalPoints']) || 0;

      if (!teamStats[team]) {
        teamStats[team] = { totalPoints: 0, games: 0 };
      }

      teamStats[team].totalPoints += points;
      teamStats[team].games += 1;
    });

    const sortedTeams = Object.entries(teamStats)
    .sort((a, b) => {
      if (a[1].games !== b[1].games) {
        return a[1].games - b[1].games; // Ascending games played
      }
      return a[1].totalPoints - b[1].totalPoints; // Ascending total points
    });

  // ✅ Update the "Now: ..." section with the top team
  if (sortedTeams.length > 0) {
    const topTeam = sortedTeams[0][0];
    const currentTeamSpan = document.querySelector('.currentTeam span');
    if (currentTeamSpan) currentTeamSpan.textContent = topTeam;
  }

  // Render table
  const tableBody = document.getElementById('standingsBody');
  sortedTeams.forEach(([team, stats], index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><a href="team-single.html?team=${team}">${team}</a></td>
      <td>${stats.games}</td>
      <td>${stats.totalPoints.toFixed(2)}</td>
    `;
    tableBody.appendChild(row);
  });

  } catch (err) {
    console.error('Failed to load standings:', err);
    const fallback = document.getElementById('standingsBody');
    fallback.innerHTML = `<tr><td colspan="4">❌ Could not load standings data.</td></tr>`;
  }
});
