const scriptURL = "https://script.google.com/macros/s/AKfycbyZ7XbB0T5xsrPKYJ_3vV5u3-k1hw9j_AK2Tp2cHXqBplsnbEtBMETGx8Vsft-_cfRU/exec";

const POINTS_CONFIG = {
  RegulationWin: 2,
  RegulationLoss: 0,
  ExtratimeWin: 2,
  ExtratimeLoss: 1,
  ShootoutWin: 2,
  ShootoutLoss: 1
};

let allPlayers = [];
let allTeams = [];

window.onload = async () => {
  await loadTeamsAndPlayers();
  populateTeamDropdowns();
  populatePlayerInputs();
  handleOpponentChange();

  // Toggle shootout stats visibility
  document.querySelectorAll('input[name="reg"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isShootout = document.querySelector('input[name="reg"]:checked').value === "Shootout";
      document.getElementById("shootoutStats").style.display = isShootout ? "block" : "none";
      populatePlayerInputs(); // ✅ re-render team
      handleOpponentChange(); // ✅ re-render opponent
    });
  });
  
  

  // Set today's date as default
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("date").value = today;

  document.getElementById("team").addEventListener("change", function() {
    populatePlayerInputs(); // Re-populate player inputs for the selected home team
    updateGoals(); // Update Team Goals based on the selected team
  });
};

// Function to load teams and players data
function loadTeamsAndPlayers() {
  return fetch(scriptURL + "?action=loadTeamsAndPlayers")
    .then(response => response.json())
    .then(data => {
      allTeams = data.teams;
      allPlayers = data.players;
      console.log("Teams and Players loaded successfully:", allTeams, allPlayers); // TESTING
    })
    .catch(error => console.error("Failed to load data:", error));
}

// Function to populate team dropdowns
function populateTeamDropdowns() {
  const teamSelect = document.getElementById("team");
  const opponentSelect = document.getElementById("opponent");

  teamSelect.innerHTML = "";
  opponentSelect.innerHTML = '<option value="Other">Other</option>';

  allTeams.forEach(team => {
    const opt1 = new Option(team, team);
    const opt2 = new Option(team, team);
    teamSelect.appendChild(opt1);
    opponentSelect.appendChild(opt2);
  });
}

function renderPlayers(playersList, containerId, prefix) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const isShootout = document.querySelector('input[name="reg"]:checked')?.value === "Shootout";

  // Sort alphabetically (case-insensitive)
  playersList
    .slice() // avoid mutating original array
    .sort((a, b) => a.PlayerName.localeCompare(b.PlayerName, undefined, { sensitivity: "base" }))
    .forEach(p => {
      const div = document.createElement("div");

      // searchable class + dataset
      div.classList.add("player-entry");
      div.dataset.name = p.PlayerName.toLowerCase();

      div.innerHTML = `
        <strong>${p.PlayerName}</strong>
        <div class="dual-input-row">
          <div class="input-group">
            <label>Goals</label>
            <div class="counter">
              <button type="button" onclick="adjust('${prefix}_g_${p.PlayerID}', -1)">−</button>
              <input type="number" value="0" id="${prefix}_g_${p.PlayerID}" oninput="updateGoals()">
              <button type="button" onclick="adjust('${prefix}_g_${p.PlayerID}', 1)">+</button>
            </div>
          </div>

          <div class="input-group">
            <label>Assists</label>
            <div class="counter">
              <button type="button" onclick="adjust('${prefix}_a_${p.PlayerID}', -1)">−</button>
              <input type="number" value="0" id="${prefix}_a_${p.PlayerID}">
              <button type="button" onclick="adjust('${prefix}_a_${p.PlayerID}', 1)">+</button>
            </div>
          </div>
        </div>

        ${isShootout ? `
          Shootout Attempt? <input type="checkbox" id="${prefix}_so_${p.PlayerID}" onchange="toggleSO(${p.PlayerID}, '${prefix}')">
          <span id="${prefix}_goal_label_${p.PlayerID}" style="display:none">
            Goal Scored? <input type="checkbox" id="${prefix}_so_goal_${p.PlayerID}" onchange="updateTeamShootoutStats()">
          </span><br>` : ""}
        <br>`;
      container.appendChild(div);
    });
}




// Function to calculate and update Team Goals and Goals Conceded
function updateGoals() {
  const team = document.getElementById("team").value;
  const opponent = document.getElementById("opponent").value;

  // Team goals = sum of team player goals
  const teamPlayers = allPlayers.filter(p => p.Team === team);
  const teamGoals = teamPlayers.reduce((sum, p) => {
    const el = document.getElementById("team_g_" + p.PlayerID);
    return sum + (parseInt(el?.value || 0) || 0);
  }, 0);
  document.getElementById("teamGoals").value = teamGoals;

  // Goals Conceded:
  // If opponent is tracked, auto-sum from their players.
  // If opponent is "Other", DO NOT overwrite (let the user enter manually).
  const concededInput = document.getElementById("goalsConceded");
  if (opponent !== "Other") {
    const opponentPlayers = allPlayers.filter(p => p.Team === opponent);
    const goalsConceded = opponentPlayers.reduce((sum, p) => {
      const el = document.getElementById("opponent_g_" + p.PlayerID);
      return sum + (parseInt(el?.value || 0) || 0);
    }, 0);
    concededInput.value = goalsConceded;
  }
}


function filterPlayers(prefix) {
  const searchTerm = document.getElementById(`${prefix}Search`).value.toLowerCase();
  const container = document.getElementById(`${prefix}Players`);
  const players = container.querySelectorAll('.player-entry');
  players.forEach(p => {
    const name = p.dataset.name;
    p.style.display = name.includes(searchTerm) ? "block" : "none";
  });
}

// SHOOTOUT STATS FOR PLAYERS
function toggleSO(playerId, prefix) {
  const label = document.getElementById(`${prefix}_goal_label_${playerId}`);
  const attemptChecked = document.getElementById(`${prefix}_so_${playerId}`).checked;
  label.style.display = attemptChecked ? "inline" : "none";

  updateTeamShootoutStats(); // recalculate totals
}


function updateTeamShootoutStats() {
  const team = document.getElementById("team").value;
  const opponent = document.getElementById("opponent").value;

  let teamAttempts = 0, teamGoals = 0;
  let oppAttempts = 0, oppGoals = 0;

  allPlayers.forEach(p => {
    // Team
    if (p.Team === team) {
      const so = document.getElementById("team_so_" + p.PlayerID);
      const goal = document.getElementById("team_so_goal_" + p.PlayerID);
      if (so?.checked) {
        teamAttempts++;
        if (goal?.checked) teamGoals++;
      }
    }

    // Opponent
    if (opponent !== "Other" && p.Team === opponent) {
      const so = document.getElementById("opponent_so_" + p.PlayerID);
      const goal = document.getElementById("opponent_so_goal_" + p.PlayerID);
      if (so?.checked) {
        oppAttempts++;
        if (goal?.checked) oppGoals++;
      }
    }
  });

  document.getElementById("teamShootOutAttempts").value = teamAttempts;
  document.getElementById("teamSOGoals").value = teamGoals;
  document.getElementById("oppShootOutAttempts").value = oppAttempts;
  document.getElementById("oppSOGoals").value = oppGoals;
}


// Populate player inputs for the selected team
function populatePlayerInputs() {
  const team = document.getElementById("team").value;
  const teamPlayers = allPlayers.filter(p => p.Team === team);
  renderPlayers(teamPlayers, "teamPlayers", "team");
  updateGoals();  // Update Team Goals when players are populated
  updateTeamShootoutStats();

}

// Handle opponent selection change
function handleOpponentChange() {
  const opponent = document.getElementById("opponent").value;
  const otherContainer = document.getElementById("otherTeamContainer");
  const opponentPlayersContainer = document.getElementById("opponentPlayersContainer");

  if (opponent === "Other") {
    otherContainer.style.display = "block";
    opponentPlayersContainer.style.display = "none";
  } else {
    otherContainer.style.display = "none";
    opponentPlayersContainer.style.display = "block";

    const players = allPlayers.filter(p => p.Team === opponent);
    renderPlayers(players, "opponentPlayers", "opponent");
    updateGoals();  // Update Goals when opponent is changed
    updateTeamShootoutStats();

  }
}

function adjust(inputId, delta) {
  const input = document.getElementById(inputId);
  let value = parseInt(input.value) || 0;
  value += delta;
  if (value < 0) value = 0;
  input.value = value;
  if (inputId.includes("_g_")) updateGoals();  // recalculate team goals if needed
}


// Submit the form with game data
async function submitForm(event) {
  event.preventDefault();

  const team = document.getElementById("team").value;
  const opponentValue = document.getElementById("opponent").value;
  const opponentType = opponentValue === "Other" ? "Other" : "Tracked";
  const opponentName = opponentType === "Other"
    ? document.getElementById("otherTeamName").value
    : opponentValue;

  const gameType = document.querySelector('input[name="reg"]:checked').value;
  const isShootout = gameType === "Shootout";

  // Initialize data object
  const data = {
    Date: document.getElementById("date").value,
    Team: team,
    Opponent: opponentValue,
    OpponentType: opponentType,
    OpponentTeamName: opponentName,
    GameType: gameType,
    TeamGoals: document.getElementById("teamGoals").value,
    GoalsConceded: document.getElementById("goalsConceded").value,
    ShootOutData: isShootout ? {
      teamShootOutAttempts: document.getElementById("teamShootOutAttempts").value,
      teamSOGoals: document.getElementById("teamSOGoals").value,
      oppShootOutAttempts: document.getElementById("oppShootOutAttempts").value,
      oppSOGoals: document.getElementById("oppSOGoals").value
    } : null,
    PlayerStats: []  // This will store player statistics
  };

  // Calculate points based on the game result
  const teamGoals = parseInt(data.TeamGoals || 0);
  const goalsConceded = parseInt(data.GoalsConceded || 0);
  let teamPoints = 0;
  let opponentPoints = 0;

  if (teamGoals > goalsConceded) {
    teamPoints = gameType === "Regulation" ? POINTS_CONFIG.RegulationWin :
                 gameType === "ExtraTime" ? POINTS_CONFIG.ExtratimeWin :
                 POINTS_CONFIG.ShootoutWin;
    opponentPoints = gameType === "Regulation" ? POINTS_CONFIG.RegulationLoss :
                     gameType === "ExtraTime" ? POINTS_CONFIG.ExtratimeLoss :
                     POINTS_CONFIG.ShootoutLoss;
  } else if (teamGoals < goalsConceded) {
    teamPoints = gameType === "Regulation" ? POINTS_CONFIG.RegulationLoss :
                 gameType === "ExtraTime" ? POINTS_CONFIG.ExtratimeLoss :
                 POINTS_CONFIG.ShootoutLoss;
    opponentPoints = gameType === "Regulation" ? POINTS_CONFIG.RegulationWin :
                     gameType === "ExtraTime" ? POINTS_CONFIG.ExtratimeWin :
                     POINTS_CONFIG.ShootoutWin;
  }

  // Add the calculated points to the data object
  data.TeamPoints = teamPoints;
  data.OpponentPoints = opponentPoints;

  // Collect player stats for the team
  const teamPlayers = allPlayers.filter(p => p.Team === team);
  teamPlayers.forEach(p => {
    const attempt = document.getElementById("team_so_" + p.PlayerID);
    const goal = document.getElementById("team_so_goal_" + p.PlayerID);
    data.PlayerStats.push({
      PlayerID: p.PlayerID,
      Team: team,
      Opponent: opponentName,
      Goals: document.getElementById("team_g_" + p.PlayerID).value,
      Assists: document.getElementById("team_a_" + p.PlayerID).value,
      ShootoutAttempts: attempt?.checked ? 1 : 0,
      ShootoutGoals: (attempt?.checked && goal?.checked) ? 1 : 0
    });
  });
  

  // If opponent is tracked, collect their player stats too
  if (opponentType === "Tracked") {
    const oppPlayers = allPlayers.filter(p => p.Team === opponentName);
    oppPlayers.forEach(p => {
      const attempt = document.getElementById("opponent_so_" + p.PlayerID);
      const goal = document.getElementById("opponent_so_goal_" + p.PlayerID);
      data.PlayerStats.push({
        PlayerID: p.PlayerID,
        Team: opponentName,
        Opponent: team,
        Goals: document.getElementById("opponent_g_" + p.PlayerID).value,
        Assists: document.getElementById("opponent_a_" + p.PlayerID).value,
        ShootoutAttempts: attempt?.checked ? 1 : 0,
        ShootoutGoals: (attempt?.checked && goal?.checked) ? 1 : 0
      });
    });
  }
  

  // Submit the data to Google Sheets
  const params = new URLSearchParams();
  for (const key in data) {
    if (key === "PlayerStats" || key === "ShootOutData") {
      params.append(key, JSON.stringify(data[key]));
    } else {
      params.append(key, data[key]);
    }
  }

  try {
    const response = await fetch(scriptURL, {
      method: "POST",
      body: params
    });

    const text = await response.text();
    alert(text); // Notify user of success
  } catch (err) {
    alert("Error submitting data: " + err.message); // Handle any errors
  }


}

