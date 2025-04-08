const express = require('express');
const router = express.Router();
const db = require('./routes/databasecongi');
const moment = require('moment');
const utils = require('./utils');

class Player {
  constructor(id, username, college, gender) {
    this.id = id;
    this.username = username;
    this.college = college;
    this.gender = gender;
    this.score = 0;
    this.opponents = new Set();
  }
}

function swissPairing(players, totalRounds) {
  let allRounds = [];
  for (let round = 1; round <= totalRounds; round++) {
    console.log(`Round ${round}: Starting with ${players.length} players`);
    players.sort((a, b) => b.score - a.score);
    let pairings = [];
    let byePlayer = null;
    let paired = new Set();
    if (players.length % 2 !== 0) {
      byePlayer = players.pop();
      byePlayer.score += 1;
      console.log(`Round ${round}: Bye player is ${byePlayer.username}`);
    }
    console.log(`Round ${round}: Players to pair: ${players.map(p => p.username).join(", ")}`);
    for (let i = 0; i < players.length; i++) {
      if (paired.has(players[i].id)) continue;
      let player1 = players[i];
      let player2 = null;
      for (let j = i + 1; j < players.length; j++) {
        if (!paired.has(players[j].id) && !player1.opponents.has(players[j].id)) {
          player2 = players[j];
          break;
        }
      }
      if (!player2) {
        for (let j = i + 1; j < players.length; j++) {
          if (!paired.has(players[j].id)) {
            player2 = players[j];
            break;
          }
        }
      }
      if (player2) {
        paired.add(player1.id);
        paired.add(player2.id);
        player1.opponents.add(player2.id);
        player2.opponents.add(player1.id);
        let result = Math.random();
        let matchResult;
        if (result < 0.4) {
          player1.score += 1;
          matchResult = `${player1.username} Wins`;
        } else if (result < 0.8) {
          player2.score += 1;
          matchResult = `${player2.username} Wins`;
        } else {
          player1.score += 0.5;
          player2.score += 0.5;
          matchResult = "Draw";
        }
        pairings.push({ player1, player2, result: matchResult });
        console.log(`Round ${round}: Paired ${player1.username} vs ${player2.username} - ${matchResult}`);
      } else {
        console.log(`Round ${round}: Could not find a match for ${player1.username}`);
      }
    }
    if (byePlayer) players.push(byePlayer);
    allRounds.push({ round, pairings, byePlayer });
    console.log(`Round ${round}: Pairings created: ${pairings.length}`);
  }
  return allRounds;
}

// Single route handler with if-else statements
router.get('/:subpage?', (req, res) => {
  const subpage = req.params.subpage || 'coordinator_dashboard';

  if (subpage === 'coordinator_dashboard') {
    const threeDaysLater = moment().add(3, 'days').format('YYYY-MM-DD');
    db.all("SELECT * FROM meetingsdb WHERE date <= ?", [threeDaysLater], (err, meetings) => {
      if (err) {
        console.error("❌ Error fetching meetings:", err);
        return res.status(500).send("Internal Server Error");
      }
      utils.renderDashboard('coordinator/coordinator_dashboard', req, res, { meetings });
    });
  }
  else if (subpage === 'tournament_management') {
    db.all("SELECT * FROM tournaments", [], (err, tournaments) => {
      if (err) {
        return res.redirect("/coordinator/coordinator_dashboard?error-message=Database Error");
      }
      utils.renderDashboard('coordinator/tournament_management', req, res, {
        tournaments,
        tournamentName: "",
        tournamentDate: "",
        tournamentLocation: "",
        entryFee: ""
      });
    });
  }
  else if (subpage === 'store_management') {
    const query = "SELECT * FROM products WHERE college = ?";
    db.all(query, [req.session.userCollege], (err, products) => {
      if (err) {
        return res.status(500).send("Could not retrieve products.");
      }
      utils.renderDashboard('coordinator/store_management', req, res, { products });
    });
  }
  else if (subpage === 'coordinator_meetings') {
    db.all(
      "SELECT * FROM meetingsdb WHERE role='coordinator' ORDER BY date, time",
      [],
      (err, yetToHost) => {
        if (err) {
          return res.status(500).send("Database error");
        }
        db.all(
          "SELECT * FROM meetingsdb WHERE name!=? ORDER BY date, time",
          [req.session.username],
          (err, upcoming) => {
            if (err) {
              return res.status(500).send("Database error");
            }
            utils.renderDashboard('coordinator/coordinator_meetings', req, res, {
              meetings: yetToHost,
              upcomingMeetings: upcoming
            });
          }
        );
      }
    );
  }
  else if (subpage === 'player_stats') {
    const sql = `
      SELECT u.name, ps.gamesPlayed, ps.wins, ps.losses, ps.draws, ps.rating 
      FROM player_stats ps
      INNER JOIN users u ON ps.player_id = u.id
      WHERE u.isDeleted = 0 AND u.college = ?
      ORDER BY ps.rating DESC;
    `;
    db.all(sql, [req.session.collegeName], (err, players) => {
      if (err) {
        return utils.renderDashboard('coordinator/player_stats', req, res, { players: [] });
      }
      utils.renderDashboard('coordinator/player_stats', req, res, { players });
    });
  }
  else if (subpage === 'enrolled_players') {
    const tournamentId = req.query.tournament_id;
    if (!tournamentId) {
      return res.redirect("/coordinator/coordinator_dashboard?error-message=No tournament specified");
    }
    db.get("SELECT name, type FROM tournaments WHERE id = ?", [tournamentId], (err, tournament) => {
      if (err) {
        return res.redirect("/coordinator/coordinator_dashboard?error-message=Database Error");
      }
      if (!tournament) {
        return res.redirect("/coordinator/coordinator_dashboard?error-message=Tournament not found");
      }
      db.all(
        "SELECT username, college, gender FROM tournament_players WHERE tournament_id = ?",
        [tournamentId],
        (err, individualPlayers) => {
          if (err) {
            return res.redirect("/coordinator/coordinator_dashboard?error-message=Database Error");
          }
          db.all(
            `SELECT et.player1_name, et.player2_name, et.player3_name, 
                    et.player1_approved, et.player2_approved, et.player3_approved, 
                    u.name AS captain_name 
             FROM enrolledtournaments_team et 
             JOIN users u ON et.captain_id = u.id 
             WHERE et.tournament_id = ?`,
            [tournamentId],
            (err, teamEnrollments) => {
              if (err) {
                return res.redirect("/coordinator/coordinator_dashboard?error-message=Database Error");
              }
              utils.renderDashboard('coordinator/enrolled_players', req, res, {
                tournamentName: tournament.name,
                tournamentType: tournament.type,
                individualPlayers: individualPlayers || [],
                teamEnrollments: teamEnrollments || []
              });
            }
          );
        }
      );
    });
  }
  else if (subpage === 'pairings') {
    const tournamentId = req.query.tournament_id;
    const totalRounds = parseInt(req.query.rounds) || 5;
    console.log(`Fetching pairings for tournamentId: ${tournamentId}`);
    if (!tournamentId) {
      return res.status(400).send("Tournament ID is required.");
    }
    db.all(
      `SELECT id, username, college, gender FROM tournament_players WHERE tournament_id = ?`,
      [tournamentId],
      (err, rows) => {
        if (err) {
          return res.status(500).send("Database error: " + err.message);
        }
        console.log(`Players fetched for tournamentId ${tournamentId}: ${rows.map(row => row.username).join(", ")}`);
        if (rows.length === 0) {
          return utils.renderDashboard('coordinator/pairings', req, res, { roundNumber: 1, pairings: [] });
        }
        let players = rows.map(row => new Player(row.id, row.username, row.college, row.gender));
        let allRounds = swissPairing(players, totalRounds);
        utils.renderDashboard('coordinator/pairings', req, res, { roundNumber: totalRounds, allRounds });
      }
    );
  }
  else if (subpage === 'rankings') {
    const tournamentId = req.query.tournament_id;
    if (!tournamentId) {
      return res.status(400).send("Tournament ID is required.");
    }
    db.all(
      `SELECT id, username, college, gender FROM tournament_players WHERE tournament_id = ?`,
      [tournamentId],
      (err, rows) => {
        if (err) {
          return res.status(500).send("Database error: " + err.message);
        }
        let rankings = [];
        if (rows && rows.length > 0) {
          let players = rows.map(row => new Player(row.id, row.username, row.college, row.gender));
          const totalRounds = 5;
          swissPairing(players, totalRounds);
          rankings = players.sort((a, b) => b.score - a.score);
        }
        utils.renderDashboard('coordinator/rankings', req, res, { rankings: rankings || [], tournamentId });
      }
    );
  }
  else if (subpage === 'coordinator_profile') {
    if (!req.session.userEmail) {
      return res.redirect("/?error-message=Please log in");
    }
    const query = "SELECT name, email, college FROM users WHERE email = ? AND role = 'coordinator'";
    db.get(query, [req.session.userEmail], (err, row) => {
      if (err) {
        return res.redirect("/coordinator/coordinator_dashboard?error-message=Database Error");
      }
      if (!row) {
        return res.redirect("/coordinator/coordinator_dashboard?error-message=Coordinator not found");
      }
      utils.renderDashboard('coordinator/coordinator_profile', req, res, { coordinator: row });
    });
  }
  else {
    res.redirect('/coordinator/coordinator_dashboard?error-message=Page not found');
  }
});

module.exports = router;