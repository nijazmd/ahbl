const dataUrl = 'https://script.google.com/macros/s/AKfycbzKLcGk1-gq19BW74v6Dw8uIvJ3EHSwWJ99OkHESa2DU1WFbJQM8HM5oZmmB9NB7_dR/exec';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch(dataUrl);
    const data = await res.json();

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

    // Build array with PA
    const teamsArray = Object.entries(teamStats).map(([team, stats]) => {
      const pa = stats.games > 0 ? stats.totalPoints / stats.games : 0;
      return { team, games: stats.games, totalPoints: stats.totalPoints, pa };
    });

    // NEW: determine "Now" team -> lowest G, then lowest PA, then name asc
    const nowTeamObj = teamsArray.reduce((best, t) => {
      if (!best) return t;
      if (t.games !== best.games) return t.games < best.games ? t : best;
      if (t.pa !== best.pa) return t.pa < best.pa ? t : best;
      return t.team.localeCompare(best.team) < 0 ? t : best;
    }, null);
    const nowTeam = nowTeamObj ? nowTeamObj.team : null;

    // Sort table by PA (desc); tie-breakers: Pts desc, G desc, Team asc
    teamsArray.sort((a, b) => {
      if (b.pa !== a.pa) return b.pa - a.pa;
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.games !== a.games) return b.games - a.games;
      return a.team.localeCompare(b.team);
    });

    // Render table
    const tableBody = document.getElementById('standingsBody');
    tableBody.innerHTML = '';
    teamsArray.forEach((rowData, index) => {
      const row = document.createElement('tr');
      if (rowData.team === nowTeam) row.classList.add('active');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><a href="team-single.html?team=${encodeURIComponent(rowData.team)}">${rowData.team}</a></td>
        <td>${rowData.games}</td>
        <td>${rowData.pa.toFixed(2)}</td>
        <td>${rowData.totalPoints.toFixed(2)}</td>
      `;
      tableBody.appendChild(row);
    });

  } catch (err) {
    console.error('Failed to load standings:', err);
    const fallback = document.getElementById('standingsBody');
    fallback.innerHTML = `<tr><td colspan="5">❌ Could not load standings data.</td></tr>`;
  }
});
