const express = require('express');
const router = express.Router();
const db = require('./routes/databasecongi');
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
    players.sort((a, b) => b.score - a.score);
    let pairings = [];
    let byePlayer = null;
    let paired = new Set();
    if (players.length % 2 !== 0) {
      byePlayer = players.pop();
      byePlayer.score += 1;
    }
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
      }
    }
    if (byePlayer) players.push(byePlayer);
    allRounds.push({ round, pairings, byePlayer });
  }
  return allRounds;
}
// Player routes
router.route('/:subpage?')
  .get((req, res) => {
    const subpage = req.params.subpage || 'player_dashboard';

    if (subpage === 'player_dashboard') {
      const playerName = req.session.playerName || 'Guest';
      const username = req.session.username;

      db.all(
        "SELECT id, name, date FROM tournaments WHERE status = 'Approved' ORDER BY date DESC LIMIT 5",
        [],
        (err, tournaments) => {
          if (err) {
            console.error("Database Error fetching tournaments:", err);
            return res.redirect('/player/player_dashboard?error-message=Error fetching tournaments');
          }
          const latestTournaments = tournaments || [];
          db.all(
            "SELECT name, price FROM products ORDER BY id DESC LIMIT 5",
            [],
            (err, items) => {
              if (err) {
                console.error("Database Error fetching store items:", err);
                return res.redirect("/player/player_dashboard?error-message=Error fetching store items");
              }
              const latestItems = items || [];
              db.all(
                `SELECT et.*, t.name AS tournamentName, u.name AS captainName
                 FROM enrolledtournaments_team et
                 JOIN tournaments t ON et.tournament_id = t.id
                 JOIN users u ON et.captain_id = u.id
                 WHERE (et.player1_name = ? OR et.player2_name = ? OR et.player3_name = ?) 
                 AND et.approved = 0`,
                [username, username, username],
                (err, teamRequests) => {
                  if (err) {
                    console.error("Database Error fetching team requests:", err);
                    return res.redirect("/player/player_dashboard?error-message=Error fetching team requests");
                  }
                  const teamRequestsData = teamRequests || [];
                  utils.renderDashboard('player/player_dashboard', req, res, {
                    playerName,
                    latestTournaments,
                    latestItems,
                    teamRequests: teamRequestsData
                  });
                }
              );
            }
          );
        }
      );
    }
    else if (subpage === 'player_tournament') {
      const username = req.session.username;
      db.get(
        "SELECT id FROM users WHERE name = ? AND role = 'player' AND isDeleted = 0",
        [username],
        (err, user) => {
          if (err || !user) {
            return res.redirect("/player/player_dashboard?error-message=Player not found");
          }
          db.get(
            "SELECT wallet_balance FROM user_balances WHERE user_id = ?",
            [user.id],
            (err, balance) => {
              if (err) {
                return res.redirect("/player/player_dashboard?error-message=Error retrieving wallet balance");
              }
              const walletBalance = balance?.wallet_balance || 0;
              db.all(
                "SELECT * FROM tournaments WHERE status = 'Approved'",
                [],
                (err, tournaments) => {
                  if (err) {
                    return res.status(500).send("Error retrieving tournaments.");
                  }
                  db.all(
                    `SELECT t.* FROM tournament_players tp 
                     JOIN tournaments t ON tp.tournament_id = t.id 
                     WHERE tp.username = ?`,
                    [username],
                    (err, enrolledIndividualTournaments) => {
                      if (err) {
                        return res.status(500).send("Error retrieving enrolled individual tournaments.");
                      }
                      db.all(
                        `SELECT et.*, u.name AS captainName 
                         FROM enrolledtournaments_team et 
                         JOIN tournaments t ON et.tournament_id = t.id 
                         JOIN users u ON et.captain_id = u.id 
                         WHERE et.captain_id = ? 
                         OR et.player1_name = ? 
                         OR et.player2_name = ? 
                         OR et.player3_name = ?`,
                        [user.id, username, username, username],
                        (err, enrolledTeamTournaments) => {
                          if (err) {
                            return res.status(500).send("Error retrieving enrolled team tournaments.");
                          }
                          db.get(
                            "SELECT plan, price, start_date FROM subscriptionstable WHERE username = ?",
                            [req.session.userEmail],
                            (err, subscription) => {
                              if (err) {
                                return res.status(500).send("Error retrieving subscription.");
                              }
                              utils.renderDashboard('player/player_tournament', req, res, {
                                tournaments: tournaments || [],
                                enrolledIndividualTournaments: enrolledIndividualTournaments || [],
                                enrolledTeamTournaments: enrolledTeamTournaments || [],
                                username,
                                walletBalance,
                                currentSubscription: subscription || null
                              });
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
    else if (subpage === 'store') {
      db.get(
        "SELECT wallet_balance FROM user_balances WHERE user_id = ?",
        [req.session.userID],
        (err, balance) => {
          if (err) {
            return res.status(500).send("Error fetching wallet balance");
          }
          const walletBalance = balance?.wallet_balance || 0;
          db.get(
            "SELECT plan FROM subscriptionstable WHERE username = ?",
            [req.session.userEmail],
            (err, subscription) => {
              if (err) {
                return res.status(500).send("Error fetching subscription");
              }
              let discountPercentage = 0;
              if (subscription) {
                if (subscription.plan === "Basic") discountPercentage = 10;
                else if (subscription.plan === "Premium") discountPercentage = 20;
              }
              const query = "SELECT * FROM products";
              db.all(query, [], (err, products) => {
                if (err) {
                  return res.status(500).send("Error fetching products");
                }
                utils.renderDashboard('player/store', req, res, {
                  products: products || [],
                  walletBalance,
                  playerName: req.session.username,
                  playerCollege: req.session.userCollege,
                  subscription: subscription || null,
                  discountPercentage
                });
              });
            }
          );
        }
      );
    }
    else if (subpage === 'subscription') {
      if (!req.session.userEmail) {
        return res.redirect("/?error-message=Please log in");
      }
      db.get(
        "SELECT u.id, ub.wallet_balance FROM users u LEFT JOIN user_balances ub ON ub.user_id = u.id WHERE u.email = ? AND u.role = 'player' AND u.isDeleted = 0",
        [req.session.userEmail],
        (err, row) => {
          if (err || !row) {
            return res.redirect("/player/player_dashboard?error-message=User not found");
          }
          db.get(
            "SELECT * FROM subscriptionstable WHERE username = ?",
            [req.session.userEmail],
            (err, subscription) => {
              utils.renderDashboard('player/subscription', req, res, {
                walletBalance: row.wallet_balance || 0,
                currentSubscription: subscription || null
              });
            }
          );
        }
      );
    }
    else if (subpage === 'growth') {
      const playerEmail = req.session.userEmail;
      const statsSql = `
        SELECT u.name, p.gamesPlayed, p.wins, p.losses, p.draws, p.rating
        FROM player_stats p 
        INNER JOIN users u ON p.player_id = u.id 
        WHERE u.email = ? AND u.isDeleted = 0`;
      db.get(statsSql, [playerEmail], (err, player) => {
        if (err) {
          return res.redirect("/player/player_dashboard?error-message=Database Error");
        }
        if (!player) {
          return res.redirect("/player/player_dashboard?error-message=Player stats not found");
        }
        const currentRating = player.rating && !isNaN(player.rating) ? player.rating : 400;
        const ratingHistory = player.gamesPlayed > 0
          ? [currentRating - 200, currentRating - 150, currentRating - 100, currentRating - 50, currentRating - 25, currentRating]
          : [400, 400, 400, 400, 400, 400];
        const chartLabels = Array.from({ length: 6 }, (_, i) => {
          const date = new Date();
          date.setMonth(date.getMonth() - (5 - i));
          return date.toLocaleString("default", { month: "short" });
        });
        const winRate = isNaN(Math.round((player.wins / player.gamesPlayed) * 100))
          ? 0
          : Math.round((player.wins / player.gamesPlayed) * 100);
        utils.renderDashboard('player/growth', req, res, {
          player: { ...player, winRate: player.winRate || winRate },
          ratingHistory,
          chartLabels
        });
      });
    }
    else if (subpage === 'player_profile') {
      if (!req.session.userEmail) {
        return res.redirect("/?error-message=Please log in");
      }
      db.get(
        "SELECT id, name, dob, gender, college, email, phone, role, isDeleted, AICF_ID, FIDE_ID FROM users WHERE email = ? AND role = 'player'",
        [req.session.userEmail],
        (err, row) => {
          if (err) {
            console.error("Database Error:", err);
            return res.redirect("/player/player_dashboard?error-message=Database Error");
          }
          if (!row) {
            console.log("No player found for email:", req.session.userEmail);
            return res.redirect("/player/player_dashboard?error-message=Player not found");
          }
          const playerId = row.id;
          const gamesPlayed = Math.floor(Math.random() * 11) + 20;
          let wins = Math.floor(Math.random() * (gamesPlayed + 1));
          let losses = Math.floor(Math.random() * (gamesPlayed - wins + 1));
          let draws = gamesPlayed - (wins + losses);
          let rating = 400 + (wins * 10) - (losses * 10);
          let winRate = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(2) : 0;

          db.run(
            `INSERT INTO player_stats (player_id, gamesPlayed, wins, losses, draws, winRate, rating) 
             VALUES (?, ?, ?, ?, ?, ?, ?) 
             ON CONFLICT(player_id) DO UPDATE SET 
             gamesPlayed = excluded.gamesPlayed, 
             wins = excluded.wins, 
             losses = excluded.losses, 
             draws = excluded.draws, 
             winRate = excluded.winRate, 
             rating = excluded.rating`,
            [playerId, gamesPlayed, wins, losses, draws, winRate, rating],
            (err) => {
              if (err) {
                console.error("Database Error:", err);
                return res.redirect("/player/player_dashboard?error-message=Error updating player stats");
              }
              db.get(
                "SELECT s.plan, s.price, s.start_date FROM subscriptionstable s INNER JOIN users u ON s.username = u.email WHERE u.id = ?",
                [playerId],
                (err, subscription) => {
                  if (err) {
                    console.error("Database Error:", err);
                    return res.redirect("/player/player_dashboard?error-message=Error fetching subscription");
                  }
                  row.subscription = subscription || { plan: "None", price: 0, start_date: "N/A" };
                  db.get(
                    "SELECT wallet_balance FROM user_balances WHERE user_id = ?",
                    [playerId],
                    (err, balance) => {
                      if (err) {
                        console.error("Database Error:", err);
                        return res.redirect("/player/player_dashboard?error-message=Error fetching wallet balance");
                      }
                      row.walletBalance = balance?.wallet_balance || 0;
                      row.gamesPlayed = gamesPlayed;
                      row.wins = wins;
                      row.losses = losses;
                      row.draws = draws;
                      row.winRate = winRate;
                      row.rating = rating;
                      db.all(
                        "SELECT p.name FROM products p INNER JOIN sales s ON p.id = s.product_id WHERE s.buyer = ?",
                        [row.name],
                        (err, sales) => {
                          if (err) {
                            console.error("Database Error:", err);
                            return res.redirect("/player/player_dashboard?error-message=Error fetching purchases");
                          }
                          row.sales = sales.map(sale => sale.name);
                          utils.renderDashboard('player/player_profile', req, res, { player: row });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
    else if(subpage === 'pairings'){
      const tournamentId = req.query.tournament_id;
      const totalRounds = parseInt(req.query.rounds) || 5;
      
      if (!tournamentId) {
          return res.status(400).send("Tournament ID is required.");
      }
  
      db.all(
          'SELECT id, username, college, gender FROM tournament_players WHERE tournament_id = ?',
          [tournamentId],
          (err, rows) => {
              if (err) {
                  return res.status(500).send("Database error: " + err.message);
              }
              
              if (rows.length === 0) {
                  return utils.renderDashboard('player/pairings', req, res, { 
                      roundNumber: 1, 
                      pairings: [] 
                  });
              }
              
              let players = rows.map(row => new Player(row.id, row.username, row.college, row.gender));
              let allRounds = swissPairing(players, totalRounds);
              utils.renderDashboard('player/pairings', req, res, { 
                  roundNumber: totalRounds, 
                  allRounds 
              });
          }
      );
    }
    else if(subpage === 'rankings'){
      const tournamentId = req.query.tournament_id;
    
      if (!tournamentId) {
          return res.status(400).send("Tournament ID is required.");
      }
      
      db.all(
          'SELECT id, username, college, gender FROM tournament_players WHERE tournament_id = ?',
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
              
              utils.renderDashboard('player/rankings', req, res, { 
                  rankings: rankings || [], 
                  tournamentId 
              });
          }
      );
    }
    else {
      res.redirect('/player/player_dashboard?error-message=Page not found');
    }
  })
  .post((req, res) => {
    const subpage = req.params.subpage || 'player_dashboard';

    if (subpage === 'delete') {
      if (!req.session.userEmail) {
        return res.redirect("/?error-message=Please log in");
      }
      db.run(
        "UPDATE users SET isDeleted = 1 WHERE email = ? AND role = 'player'",
        [req.session.userEmail],
        function (err) {
          if (err) {
            return res.redirect("/player/player_dashboard?error-message=Database Error");
          }
          if (this.changes === 0) {
            return res.redirect("/player/player_dashboard?error-message=Player not found");
          }
          req.session.destroy((err) => {
            if (err) {
              console.error("Session destroy error:", err);
            }
            res.redirect("/login?success-message=Account deleted successfully");
          });
        }
      );
    }
    else {
      res.redirect('/player/player_dashboard?error-message=Invalid POST request');
    }
  });

module.exports = router;