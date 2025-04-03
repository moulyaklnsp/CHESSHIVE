const express = require("express");
const path = require("path");
const session = require("express-session");
const authrouter = require("./routes/auth");
const db = require("./routes/databasecongi");

const app = express();
const PORT = 3000;

const getMessages = (req) => ({
  successMessage: req.query["success-message"] || null,
  errorMessage: req.query["error-message"] || null,
});

app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use((req, res, next) => {
  next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(authrouter);

app.get("/favicon.ico", (req, res) => res.status(204).end());

const renderDashboard = (dashboard, req, res, extraData = {}) => {
  res.render(dashboard, { ...getMessages(req), ...extraData });
};

app.get('/', (req, res) => res.render('index', getMessages(req)));
app.get('/admin_dashboard', (req, res) => {
    const adminName = req.session.username || "Admin"; // Fallback to "Admin" if no session username

    // Fetch contact messages from the database
    db.all("SELECT * FROM contact ORDER BY submission_date DESC", [], (err, contactMessages) => {
        if (err) {
            console.error("Error fetching contact messages:", err.message);
            return renderDashboard('admin/admin_dashboard', req, res, {
                adminName,
                contactMessages: [], // Fallback to empty array on error
                errorMessage: "Error fetching contact messages"
            });
        }

        // Render the dashboard with fetched data
        renderDashboard('admin/admin_dashboard', req, res, {
            adminName,
            contactMessages: contactMessages || [], // Ensure it’s an array even if no messages
            successMessage: req.query["success-message"] || null,
            errorMessage: req.query["error-message"] || null
        });
    });
});
app.get('/organizer_dashboard', (req, res) => renderDashboard('organizer/organizer_dashboard', req, res));
app.get('/coordinator_dashboard', (req, res) => renderDashboard('coordinator/coordinator_dashboard', req, res));
app.get('/player_dashboard', (req, res) => {
  const playerName = req.session.playerName || 'Guest'; // Fallback to 'Guest' if undefined
  const username = req.session.username; // Assuming username is stored in session

  // Fetch latest approved tournaments from the database
  db.all(
      "SELECT id, name, date FROM tournaments WHERE status = 'Approved' ORDER BY date DESC LIMIT 5",
      [],
      (err, tournaments) => {
          if (err) {
              console.error("Database Error fetching tournaments:", err);
              return res.redirect('/player_dashboard?error-message=Error fetching tournaments');
          }
          const latestTournaments = tournaments || []; // Fallback to empty array if no tournaments

          // Fetch latest store items from the database
          db.all(
              "SELECT name, price FROM products ORDER BY id DESC LIMIT 5",
              [],
              (err, items) => {
                  if (err) {
                      console.error("Database Error fetching store items:", err);
                      return res.redirect(
                          "/player_dashboard?error-message=Error fetching store items"
                      );
                  }
                  const latestItems = items || []; // Fallback to empty array if no items

                  // Fetch pending team requests where the player is a team member
                  db.all(
                      `SELECT et.*, t.name AS tournamentName, u.name AS captainName, 
                       FROM enrolledtournaments_team et
                       JOIN tournaments t ON et.tournament_id = t.id
                       JOIN users u ON et.captain_id = u.id
                       WHERE (et.player1_name = ? OR et.player2_name = ? OR et.player3_name = ?) 
                       AND et.approved = 0`,
                      [username, username, username],
                      (err, teamRequests) => {
                          if (err) {
                              console.error("Database Error fetching team requests:", err);
                              return res.redirect(
                                  "/player_dashboard?error-message=Error fetching team requests"
                              );
                          }
                          const teamRequestsData = teamRequests || []; // Fallback to empty array if no requests

                          // Render the dashboard with tournaments, items, and team requests
                          renderDashboard("player/player_dashboard", req, res, {
                              playerName,
                              latestTournaments,
                              latestItems,
                              teamRequests: teamRequestsData,
                          });
                      }
                  );
              }
          );
      }
  );
});

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

app.get("/coordinator/pairings", (req, res) => {
  const tournamentId = req.query.tournament_id;
  const totalRounds = parseInt(req.query.rounds) || 5;
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
      if (rows.length === 0) {
        return res.render("coordinator/pairings", {
          roundNumber: 1,
          pairings: [],
        });
      }
      let players = rows.map(
        (row) => new Player(row.id, row.username, row.college, row.gender)
      );
      let allRounds = swissPairing(players, totalRounds);
      res.render("coordinator/pairings", {
        roundNumber: totalRounds,
        allRounds,
      });
    }
  );
});

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
        if (
          !paired.has(players[j].id) &&
          !player1.opponents.has(players[j].id)
        ) {
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

app.get("/coordinator/rankings", (req, res) => {
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
        let players = rows.map(
          (row) => new Player(row.id, row.username, row.college, row.gender)
        );
        const totalRounds = 5;
        swissPairing(players, totalRounds);
        rankings = players.sort((a, b) => b.score - a.score);
      }
      res.render("coordinator/rankings", {
        rankings: rankings || [],
        tournamentId: tournamentId,
      });
    }
  );
});

const renderUserProfile = (role, query, req, res, dbQuery, view) => {
  if (!req.session.userEmail) {
    return res.redirect("/?error-message=Please log in");
  }
  db.get(dbQuery, [req.session.userEmail], (err, row) => {
    if (err) {
      return res.redirect(`/${role}_dashboard?error-message=Database Error`);
    }
    if (!row) {
      return res.redirect(
        `/${role}_dashboard?error-message=${
          role.charAt(0).toUpperCase() + role.slice(1)
        } not found`
      );
    }
    res.render(view, {
      [role]: row,
      ...getMessages(req),
    });
  });
};

app.get("/:role/:subpage", (req, res) => {
  const { role, subpage } = req.params;
  if (!["admin", "organizer", "coordinator", "player"].includes(role)) {
    return res.redirect("/?error-message=Invalid Role");
  }
  if (subpage === `${role}_profile`) {
    let query, view;
    switch (role) {
      case "coordinator":
        query =
          "SELECT name, email, college FROM users WHERE email = ? AND role = 'coordinator'";
        view = "coordinator/coordinator_profile";
        break;
      case "organizer":
        query =
          "SELECT name, email, college FROM users WHERE email = ? AND role = 'organizer'";
        view = "organizer/organizer_profile";
        break;
        case "player":
          db.get(
              "SELECT id, name, dob, gender, college, email, phone, role, isDeleted, AICF_ID, FIDE_ID FROM users WHERE email = ? AND role = 'player'",
              [req.session.userEmail],
              (err, row) => {
                  if (err) {
                      console.error("Database Error:", err);
                      return res.redirect("/player_dashboard?error-message=Database Error");
                  }
                  if (!row) {
                      console.log("No player found for email:", req.session.userEmail);
                      return res.redirect("/player_dashboard?error-message=Player not found");
                  }
      
                  const playerId = row.id;
      
                  // Generate random player stats
                  const gamesPlayed = Math.floor(Math.random() * 11) + 20; // Random number between 20-30
                  let wins = Math.floor(Math.random() * (gamesPlayed + 1)); 
                  let losses = Math.floor(Math.random() * (gamesPlayed - wins + 1)); 
                  let draws = gamesPlayed - (wins + losses); // Ensure total matches gamesPlayed
      
                  let rating = 400 + (wins * 10) - (losses * 10); // Rating changes
                  let winRate = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(2) : 0;
      
                  // Insert or update player stats
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
                              return res.redirect("/player_dashboard?error-message=Error updating player stats");
                          }
      
                          // Fetch subscription details
                          db.get(
                              `SELECT s.plan, s.price, s.start_date 
                               FROM subscriptionstable s 
                               INNER JOIN users u ON s.username = u.email 
                               WHERE u.id = ?`,
                              [playerId],
                              (err, subscription) => {
                                  if (err) {
                                      console.error("Database Error:", err);
                                      return res.redirect("/player_dashboard?error-message=Error fetching subscription");
                                  }
                                  row.subscription = subscription || { plan: "None", price: 0, start_date: "N/A" };
      
                                  // Fetch wallet balance
                                  db.get(
                                      "SELECT wallet_balance FROM user_balances WHERE user_id = ?",
                                      [playerId],
                                      (err, balance) => {
                                          if (err) {
                                              console.error("Database Error:", err);
                                              return res.redirect("/player_dashboard?error-message=Error fetching wallet balance");
                                          }
                                          row.walletBalance = balance?.wallet_balance || 0;
      
                                          // Assign generated stats
                                          row.gamesPlayed = gamesPlayed;
                                          row.wins = wins;
                                          row.losses = losses;
                                          row.draws = draws;
                                          row.winRate = winRate;
                                          row.rating = rating;
      
                                          // Fetch purchased products
                                          db.all(
                                              `SELECT p.name FROM products p 
                                               INNER JOIN sales s ON p.id = s.product_id 
                                               WHERE s.buyer = ?`,
                                              [row.name],
                                              (err, sales) => {
                                                  if (err) {
                                                      console.error("Database Error:", err);
                                                      return res.redirect("/player_dashboard?error-message=Error fetching purchases");
                                                  }
                                                  row.sales = sales.map((sale) => sale.name);
      
                                                  console.log("Rendering player_profile with data:", row);
                                                  res.render("player/player_profile", {
                                                      player: row,
                                                      successMessage: req.query["success-message"] || null,
                                                      errorMessage: req.query["error-message"] || null,
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
        return;
    }
    return renderUserProfile(role, req.query, req, res, query, view);
  }
  if (
    subpage === "coordinator_management" &&
    (role === "admin" || role === "organizer")
  ) {
    return db.all(
      "SELECT name, email, college FROM users WHERE role = 'coordinator' AND isDeleted = 0",
      [],
      (err, rows) => {
        if (err) {
          return res.redirect("/admin_dashboard?error-message=Database Error");
        }
        res.render(`${role}/coordinator_management`, {
          ...getMessages(req),
          coordinators: rows,
        });
      }
    );
  }
  if (subpage === "organizer_management" && role === "admin") {
    return db.all(
      "SELECT name, email, college FROM users WHERE role = 'organizer' AND isDeleted = 0",
      [],
      (err, rows) => {
        if (err) {
          return res.redirect("/admin_dashboard?error-message=Database Error");
        }
        res.render(`${role}/${subpage}`, {
          ...getMessages(req),
          organizers: rows,
        });
      }
    );
  }
  if (subpage === "tournament_management" && role === "coordinator") {
    return db.all("SELECT * FROM tournaments", [], (err, tournaments) => {
      if (err) {
        return res.redirect(
          "/coordinator_dashboard?error-message=Database Error"
        );
      }
      res.render("coordinator/tournament_management", {
        tournaments,
        ...getMessages(req),
        tournamentName: "",
        tournamentDate: "",
        tournamentLocation: "",
        entryFee: "",
      });
    });
  }
  if (subpage === "organizer_tournament" && role === "organizer") {
    return db.all("SELECT * FROM tournaments", [], (err, tournaments) => {
      if (err) {
        return res.redirect(
          "/organizer_dashboard?error-message=Database Error"
        );
      }
      res.render("organizer/organizer_tournament", {
        tournaments: tournaments || [],
        ...getMessages(req),
      });
    });
  }
  if (subpage === "admin_tournament_management" && role === "admin") {
    return db.all(
      `SELECT t.id, t.name, t.date, t.location, t.entry_fee, 
                    COUNT(tp.id) AS player_count, 
                    CASE 
                        WHEN date(t.date) < date('now') THEN 'Completed'
                        WHEN date(t.date) = date('now') THEN 'Running'
                        ELSE 'Yet to Start'
                    END AS status
             FROM tournaments t 
             LEFT JOIN tournament_players tp ON t.id = tp.tournament_id 
             GROUP BY t.id, t.name, t.date, t.location, t.entry_fee`,
      [],
      (err, tournaments) => {
        if (err) {
          return res.redirect("/admin_dashboard?error-message=Database Error");
        }
        res.render("admin/admin_tournament_management", {
          tournaments: tournaments || [],
          ...getMessages(req),
        });
      }
    );
  }
  if (subpage === "player_tournament" && role === "player") {
    const username = req.session.username;
    return db.get(
      "SELECT id FROM users WHERE name = ? AND role = 'player' AND isDeleted = 0",
      [username],
      (err, user) => {
        if (err || !user) {
          return res.redirect(
            "/player_dashboard?error-message=Player not found"
          );
        }
        db.get(
          "SELECT wallet_balance FROM user_balances WHERE user_id = ?",
          [user.id],
          (err, balance) => {
            if (err) {
              return res.redirect(
                "/player_dashboard?error-message=Error retrieving wallet balance"
              );
            }
            const walletBalance = balance?.wallet_balance || 0;
            db.all(
              "SELECT * FROM tournaments WHERE status = 'Approved'",
              [],
              (err, tournaments) => {
                if (err) {
                  return res.status(500).send("Error retrieving tournaments.");
                }
                // Fetch individual tournament enrollments
                db.all(
                  `SELECT t.* FROM tournament_players tp 
                         JOIN tournaments t ON tp.tournament_id = t.id 
                         WHERE tp.username = ?`,
                  [username],
                  (err, enrolledIndividualTournaments) => {
                    if (err) {
                      console.error(
                        "Error fetching enrolled individual tournaments:",
                        err
                      );
                      return res
                        .status(500)
                        .send("Error retrieving enrolled individual tournaments.");
                    }
                    // Fetch team tournament enrollments
                    db.all(
                      `SELECT et.* FROM enrolledtournaments_team et 
                       JOIN tournaments t ON et.tournament_id = t.id 
                       WHERE et.captain_id = ?`,
                      [user.id],
                      (err, enrolledTeamTournaments) => {
                        if (err) {
                          console.error(
                            "Error fetching enrolled team tournaments:",
                            err
                          );
                          return res
                            .status(500)
                            .send("Error retrieving enrolled team tournaments.");
                        }
                        // Fetch current subscription
                        db.get(
                          "SELECT plan, price, start_date FROM subscriptionstable WHERE username = ?",
                          [req.session.userEmail],
                          (err, subscription) => {
                            if (err) {
                              console.error("Error fetching subscription:", err);
                              return res
                                .status(500)
                                .send("Error retrieving subscription.");
                            }
                            res.render("player/player_tournament", {
                              tournaments: tournaments || [],
                              enrolledIndividualTournaments: enrolledIndividualTournaments || [],
                              enrolledTeamTournaments : enrolledTeamTournaments || [],
                              username,
                              walletBalance,
                              currentSubscription: subscription || null,
                              ...getMessages(req),
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
  if (subpage === "store_management" && role === "coordinator") {
    const query = "SELECT * FROM products WHERE college = ? ";
    return db.all(query, [req.session.userCollege], (err, products) => {
      if (err) {
        return res.status(500).send("Could not retrieve products.");
      }
      res.render("coordinator/store_management", { products });
    });
  }
  if (subpage === "store" && role === "player") {
    return db.get(
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
              if (subscription.plan === "Basic") {
                discountPercentage = 10;
              } else if (subscription.plan === "Premium") {
                discountPercentage = 20;
              }
            }
            const query = "SELECT * FROM products";
            db.all(query, [], (err, products) => {
              if (err) {
                return res.status(500).send("Error fetching products");
              }
              res.render("player/store", {
                products: products || [],
                walletBalance,
                playerName: req.session.username,
                playerCollege: req.session.userCollege,
                subscription: subscription || null,
                discountPercentage,
                ...getMessages(req),
              });
            });
          }
        );
      }
    );
  }
  if (subpage === "store_monitoring" && role === "organizer") {
    const productsQuery =
      "SELECT id, name, price, coordinator, college, image_url FROM products";
    const salesQuery =
      "SELECT p.name AS product, p.price, p.coordinator, s.college AS college, s.buyer, s.purchase_date " +
      "FROM sales s JOIN products p ON s.product_id = p.id;";
    return db.all(productsQuery, [], (err, products) => {
      if (err) {
        return res.status(500).send("Error fetching products.");
      }
      db.all(salesQuery, [], (err, sales) => {
        if (err) {
          return res.status(500).send("Error fetching sales.");
        }
        res.render("organizer/store_monitoring", { products, sales });
      });
    });
  }
  if (subpage === "coordinator_meetings") {
    return db.all(
      "SELECT * FROM meetingsdb WHERE role=? ORDER BY date, time",
      ["coordinator"],
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
            res.render("coordinator/coordinator_meetings", {
              meetings: yetToHost,
              upcomingMeetings: upcoming,
            });
          }
        );
      }
    );
  }
  if (subpage === "meetings") {
    return db.all(
      "SELECT * FROM meetingsdb WHERE role =? ORDER BY date, time",
      ["organizer"],
      (err, yetToHost) => {
        if (err) {
          return res.status(500).send("Database error");
        }
        db.all(
          "SELECT * FROM meetingsdb WHERE name!= ? ORDER BY date, time",
          [req.session.username],
          (err, upcoming) => {
            if (err) {
              return res.status(500).send("Database error");
            }
            res.render("organizer/meetings", {
              organizermeetings: yetToHost,
              upcomingMeetings: upcoming,
            });
          }
        );
      }
    );
  }
  if (subpage === "admin_meetings" && role === "admin") {
    return db.all(
      "SELECT * FROM meetingsdb WHERE role=? ORDER BY date, time",
      ["admin"],
      (err, results) => {
        if (err) {
          return res.status(500).send("Database error");
        }
        res.render("admin/admin_meetings", { adminmeetings: results });
      }
    );
  }
  if (subpage === "subscription" && role === "player") {
    if (!req.session.userEmail) {
      return res.redirect("/?error-message=Please log in");
    }
    return db.get(
      `
            SELECT u.id, ub.wallet_balance 
            FROM users u 
            LEFT JOIN user_balances ub ON ub.user_id = u.id 
            WHERE u.email = ? AND u.role = 'player' AND u.isDeleted = 0
        `,
      [req.session.userEmail],
      (err, row) => {
        if (err || !row) {
          return res.redirect("/player_dashboard?error-message=User not found");
        }
        db.get(
          "SELECT * FROM subscriptionstable WHERE username = ?",
          [req.session.userEmail],
          (err, subscription) => {
            res.render("player/subscription", {
              walletBalance: row.wallet_balance || 0,
              currentSubscription: subscription || null,
              ...getMessages(req),
            });
          }
        );
      }
    );
  }
  if (subpage === "player_stats" && role === "coordinator") {
    const sql = `
            SELECT u.name, 
                ps.gamesPlayed, 
                ps.wins, 
                ps.losses, 
                ps.draws, 
                ps.rating 
            FROM player_stats ps
            INNER JOIN users u ON ps.player_id = u.id
            WHERE u.isDeleted = 0 AND u.college = ?
            ORDER BY ps.rating DESC;
        `;
    db.all(sql, [req.session.collegeName], (err, players) => {
      if (err) {
        return res.render("coordinator/player_stats", { players: [] });
      }
      res.render("coordinator/player_stats", { players });
    });
    return;
  }
  if (subpage === "payments" && role === "admin") {
    const sql = `
        SELECT u.name AS name, 
               s.plan,
              s.start_date
        FROM subscriptionstable s
        INNER JOIN users u ON s.username = u.email
        WHERE u.isDeleted = 0;
        `;
    db.all(sql, [], (err, players) => {
      if (err) {
        return res.render("admin/payments", { players: [] });
      }
      res.render("admin/payments", { players });
    });
    return;
  }
  if (subpage === "growth" && role === "player") {
    const playerEmail = req.session.userEmail;
    const statsSql = `
            SELECT u.name, p.gamesPlayed, p.wins, p.losses, p.draws, p.rating
            FROM player_stats p 
            INNER JOIN users u ON p.player_id = u.id 
            WHERE u.email = ? AND u.isDeleted = 0`;
    Db.get(statsSql, [playerEmail], (err, player) => {
      if (err) {
        return res.redirect("/player_dashboard?error-message=Database Error");
      }
      if (!player) {
        return res.redirect(
          "/player_dashboard?error-message=Player stats not found"
        );
      }
      const currentRating =
        player.rating && !isNaN(player.rating) ? player.rating : 400;
      const ratingHistory =
        player.gamesPlayed > 0
          ? [
              currentRating - 200,
              currentRating - 150,
              currentRating - 100,
              currentRating - 50,
              currentRating - 25,
              currentRating,
            ]
          : [400, 400, 400, 400, 400, 400];
      const chartLabels = Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - i));
        return date.toLocaleString("default", { month: "short" });
      });
      const winRate = isNaN(
        Math.round((player.wins / player.gamesPlayed) * 100)
      )
        ? 0
        : Math.round((player.wins / player.gamesPlayed) * 100);
      res.render("player/growth", {
        player: {
          ...player,
          winRate: player.winRate || winRate,
        },
        ratingHistory: ratingHistory,
        chartLabels: chartLabels,
      });
    });
    return;
  }
  if (subpage === "enrolled_players" && role === "coordinator") {
    const tournamentId = req.query.tournament_id;
    if (!tournamentId) {
      return res.redirect(
        "/coordinator_dashboard?error-message=No tournament specified"
      );
    }
    db.get(
      "SELECT name FROM tournaments WHERE id = ?",
      [tournamentId],
      (err, tournament) => {
        if (err) {
          return res.redirect(
            "/coordinator_dashboard?error-message=Database Error"
          );
        }
        if (!tournament) {
          return res.redirect(
            "/coordinator_dashboard?error-message=Tournament not found"
          );
        }
        db.all(
          "SELECT username, college, gender FROM tournament_players WHERE tournament_id = ?",
          [tournamentId],
          (err, players) => {
            if (err) {
              return res.redirect(
                "/coordinator_dashboard?error-message=Database Error"
              );
            }
            res.render("coordinator/enrolled_players", {
              tournamentName: tournament.name,
              players: players || [],
            });
          }
        );
      }
    );
    return;
  }
  let data = {};
  if (subpage === "global_chat") {
    data.messages = [
      { sender: "John", text: "Hi everyone!" },
      { sender: "Jane", text: "Welcome to ChessHive!" },
    ];
  } else if (
    subpage === "chat" ||
    subpage === "player_chat" ||
    subpage === "coordinator_chat"
  ) {
    data.users = [{ username: "John" }, { username: "Jane" }];
    data.messages = [
      { sender: "John", text: "Hi everyone!" },
      { sender: "Jane", text: "Welcome to ChessHive!" },
    ];
    data.currentUser = "";
  } else if (subpage === "college_stats") {
    data.collegePerformance = [
      {
        college: "IIIT Hyderabad",
        tournaments: 10,
        wins: 6,
        losses: 3,
        draws: 1,
      },
      { college: "IIIT Kurnool", tournaments: 8, wins: 5, losses: 2, draws: 1 },
      {
        college: "IIIT Gwalior",
        tournaments: 12,
        wins: 7,
        losses: 4,
        draws: 1,
      },
    ];
    data.tournamentRecords = [
      {
        name: "Spring Invitational",
        college: "IIIT Hyderabad",
        format: "Classical",
        position: 1,
        date: "2025-03-15",
      },
      {
        name: "Classic",
        college: "IIIT Kurnool",
        format: "Classical",
        position: 3,
        date: "2025-03-10",
      },
      {
        name: "Chess Blitz",
        college: "IIIT Kurnool",
        format: "Rapid",
        position: 1,
        date: "2025-04-15",
      },
      {
        name: "Chess Champs",
        college: "IIIT Gwalior",
        format: "Blitz",
        position: 1,
        date: "2025-03-19",
      },
      {
        name: "Rapid Challenge",
        college: "IIIT Hyderabad",
        format: "Rapid",
        position: 2,
        date: "2025-04-10",
      },
      {
        name: "Blitz Masters",
        college: "IIIT Hyderabad",
        format: "Blitz",
        position: 3,
        date: "2025-05-20",
      },
    ];
    data.topCollegesByFormat = {
      classical: ["IIIT Hyderabad", "IIIT Delhi", "IIIT Kurnool"],
      rapid: ["IIIT Kurnool", "IIIT Hyderabad", "IIIT Kancheepuram"],
      blitz: ["IIIT Gwalior", "IIIT Kottayam", "IIIT Hyderabad"],
    };
  }
  try {
    res.render(`${role}/${subpage}`, {
      ...getMessages(req),
      ...data,
    });
  } catch (err) {
    res.redirect(`/${role}_dashboard?error-message=Page not found: ${subpage}`);
  }
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE email = ? AND password = ?",
    [email, password],
    (err, user) => {
      if (err) {
        return res.redirect("/?error-message=Database Error");
      }
      if (!user) {
        return res.redirect("/login?error-message=Invalid credentials");
      }
      if (user.isDeleted) {
        return res.redirect(
          `/login?error-message=Account has been deleted&deletedUserId=${user.id}`
        );
      }
      req.session.userID = user.id;
      req.session.userEmail = user.email;
      req.session.userRole = user.role;
      req.session.username = user.name;
      req.session.playerName = user.name;
      req.session.userCollege = user.college;
      req.session.collegeName = user.college;
      switch (user.role) {
        case "admin":
          return res.redirect(
            "/admin_dashboard?success-message=Admin Login Successful"
          );
        case "organizer":
          return res.redirect(
            "/organizer_dashboard?success-message=Organizer Login Successful"
          );
        case "coordinator":
          return res.redirect(
            "/coordinator_dashboard?success-message=Coordinator Login Successful"
          );
        case "player":
          return res.redirect(
            "/player_dashboard?success-message=Player Login Successful"
          );
        default:
          return res.redirect("/?error-message=Invalid Role");
      }
    }
  );
});

const isAdmin = (req, res, next) => {
  req.session.userRole === "admin"
    ? next()
    : res.status(403).json({ success: false, message: "Unauthorized" });
};

const isAdminOrOrganizer = (req, res, next) => {
  req.session.userRole === "admin" || req.session.userRole === "organizer"
    ? next()
    : res.status(403).json({ success: false, message: "Unauthorized" });
};

const isPlayer = (req, res, next) => {
  req.session.userRole === "player"
    ? next()
    : res.status(403).json({ success: false, message: "Unauthorized" });
};

app.post("/player/delete", isPlayer, (req, res) => {
  if (!req.session.userEmail) {
    return res.redirect("/?error-message=Please log in");
  }
  db.run(
    "UPDATE users SET isDeleted = 1 WHERE email = ? AND role = 'player'",
    [req.session.userEmail],
    function (err) {
      if (err) {
        return res.redirect("/player_dashboard?error-message=Database Error");
      }
      if (this.changes === 0) {
        return res.redirect("/player_dashboard?error-message=Player not found");
      }
      req.session.destroy((err) => {
        if (err) {
        }
        res.redirect("/login?success-message=Account deleted successfully");
      });
    }
  );
});

app.post("/player/restore/:id", (req, res) => {
  const { id } = req.params;
  db.run(
    "UPDATE users SET isDeleted = 0 WHERE id = ? AND role = 'player'",
    [id],
    function (err) {
      if (err) {
        return res.redirect("/login?error-message=Database Error");
      }
      if (this.changes === 0) {
        return res.redirect("/login?error-message=Player not found");
      }
      res.redirect("/login?success-message=Account restored successfully");
    }
  );
});

app.delete("/coordinators/remove/:email", isAdminOrOrganizer, (req, res) => {
  const { email } = req.params;
  db.run(
    "DELETE FROM users WHERE email = ? AND role = 'coordinator'",
    [email],
    function (err) {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "Database Error" });
      }
      if (this.changes === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Coordinator not found" });
      }
      res.json({ success: true, message: "Coordinator removed successfully" });
    }
  );
});

app.delete("/organizers/remove/:email", isAdmin, (req, res) => {
  const { email } = req.params;
  db.run(
    "DELETE FROM users WHERE email = ? AND role = 'organizer'",
    [email],
    function (err) {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "Database Error" });
      }
      if (this.changes === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Organizer not found" });
      }
      res.json({ success: true, message: "Organizer removed successfully" });
    }
  );
});

app.get("/:page", (req, res) => {
  const { page } = req.params;
  if (
    [
      "admin_dashboard",
      "organizer_dashboard",
      "coordinator_dashboard",
      "player_dashboard",
    ].includes(page)
  ) {
    return res.redirect(`/${page}`);
  }
  try {
    const messages = getMessages(req);
    res.render(page, {
      ...messages,
      deletedUserId: req.query.deletedUserId || null,
    });
  } catch (err) {
    res.status(404).send(`Page not found: ${page}`);
  }
});

app.use((req, res) => {
  res.status(404).redirect("/?error-message=Page not found");
});

app.listen(PORT, () => {});
