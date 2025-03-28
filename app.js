const express = require('express');
const path = require('path');
const session = require('express-session');
const authrouter = require('./routes/auth');
const db = require('./routes/databasecongi');

const app = express();
const PORT = 3000;

// Helper to extract messages
const getMessages = (req) => ({
    successMessage: req.query['success-message'] || null,
    errorMessage: req.query['error-message'] || null,
});

// Session and Static Middleware
app.use(session({
    secret: 'your_secret_key', // Replace with a secure key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Request Logger (commented out as needed)
app.use((req, res, next) => {
    // console.log(`Request URL: ${req.url}`);
    next();
});

// Set view engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Use authentication routes
app.use(authrouter);

// Prevent favicon errors
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Dashboard Routes (specific and prioritized)
const renderDashboard = (dashboard, req, res, extraData = {}) => {
    console.log(`Rendering ${dashboard}`);
    res.render(dashboard, { ...getMessages(req), ...extraData });
};

app.get('/', (req, res) => res.render('index', getMessages(req)));
app.get('/admin_dashboard', (req, res) => renderDashboard('admin/admin_dashboard', req, res));
app.get('/organizer_dashboard', (req, res) => renderDashboard('organizer/organizer_dashboard', req, res));
app.get('/coordinator_dashboard', (req, res) => renderDashboard('coordinator/coordinator_dashboard', req, res));
app.get('/player_dashboard', (req, res) => {
    const playerName = req.session.playerName || 'Guest'; // Fallback to 'Guest' if undefined
    
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

            // Fetch latest store items from the database (assuming a 'products' table)
            db.all(
                "SELECT name, price FROM products ORDER BY id DESC LIMIT 5",
                [],
                (err, items) => {
                    if (err) {
                        console.error("Database Error fetching store items:", err);
                        return res.redirect('/player_dashboard?error-message=Error fetching store items');
                    }
                    const latestItems = items || []; // Fallback to empty array if no items

                    // Render the dashboard with both tournaments and items
                    renderDashboard('player/player_dashboard', req, res, { 
                        playerName, 
                        latestTournaments, 
                        latestItems 
                    });
                }
            );
        }
    );
});


// Utility function for profile rendering
const renderUserProfile = (role, query, req, res, dbQuery, view) => {
    if (!req.session.userEmail) {
        console.log("No user email in session, redirecting to login");
        return res.redirect('/?error-message=Please log in');
    }
    db.get(dbQuery, [req.session.userEmail], (err, row) => {
        if (err) {
            console.error("Database Error:", err);
            return res.redirect(`/${role}_dashboard?error-message=Database Error`);
        }
        if (!row) {
            console.log(`No ${role} found for email:`, req.session.userEmail);
            return res.redirect(`/${role}_dashboard?error-message=${role.charAt(0).toUpperCase() + role.slice(1)} not found`);
        }
        console.log(`Rendering ${role}_profile with data:`, row);
        res.render(view, { 
            [role]: row, 
            ...getMessages(req)
        });
    });
};

// Dynamic Routing for role-specific subpages
app.get('/:role/:subpage', (req, res) => {
    const { role, subpage } = req.params;

    // Validate roles
    if (!['admin', 'organizer', 'coordinator', 'player'].includes(role)) {
        return res.redirect('/?error-message=Invalid Role');
    }
    console.log(`Rendering ${role}/${subpage}, Session Email: ${req.session.userEmail}`);

    // Role-based profile handling
    if (subpage === `${role}_profile`) {
        let query, view;
        switch (role) {
            case 'coordinator':
                query = "SELECT name, email, college FROM users WHERE email = ? AND role = 'coordinator'";
                view = 'coordinator/coordinator_profile';
                break;
            case 'organizer':
                query = "SELECT name, email, college FROM users WHERE email = ? AND role = 'organizer'";
                view = 'organizer/organizer_profile';
                break;
            case 'player':
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
            
                        // Ensure player_stats record exists
                        db.run(
                            `INSERT OR IGNORE INTO player_stats (player_id, wins, losses, draws, winRate, gamesPlayed, rating)
                             VALUES (?, 0, 0, 0, 0, 0, 400)`,
                            [playerId],
                            (err) => {
                                if (err) {
                                    console.error("Database Error:", err);
                                    return res.redirect("/player_dashboard?error-message=Error initializing player stats");
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
            
                                                // Fetch player stats
                                                db.get(
                                                    "SELECT gamesPlayed, wins, losses, draws, winRate, rating FROM player_stats WHERE player_id = ?",
                                                    [playerId],
                                                    (err, stats) => {
                                                        if (err) {
                                                            console.error("Database Error:", err);
                                                            return res.redirect("/player_dashboard?error-message=Error fetching stats");
                                                        }
                                                        row.wins = stats?.wins || 0;
                                                        row.losses = stats?.losses || 0;
                                                        row.winRate = stats?.winRate || 0;
                                                        row.draws = stats?.draws || 0;
                                                        row.gamesPlayed = stats?.gamesPlayed || 0;
                                                        row.rating = stats?.rating || 400;
            
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
                                                                row.sales = sales.map(sale => sale.name);
            
                                                                console.log("Rendering player_profile with data:", row);
                                                                res.render("player/player_profile", {
                                                                    player: row,
                                                                    successMessage: req.query["success-message"] || null,
                                                                    errorMessage: req.query["error-message"] || null
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
            return;
        }
        // For coordinator and organizer profiles:
        return renderUserProfile(role, req.query, req, res, query, view);
    }

    // Other async subpages
    if (subpage === 'coordinator_management' && (role === 'admin' || role === 'organizer')) {
        return db.all("SELECT name, email, college FROM users WHERE role = 'coordinator' AND isDeleted = 0", [], (err, rows) => {
            if (err) {
                console.error("Database Error:", err);
                return res.redirect('/admin_dashboard?error-message=Database Error');
            }
            res.render(`${role}/coordinator_management`, { 
                ...getMessages(req),
                coordinators: rows
            });
        });
    }
    if (subpage === 'organizer_management' && role === 'admin') {
        return db.all("SELECT name, email, college FROM users WHERE role = 'organizer' AND isDeleted = 0", [], (err, rows) => {
            if (err) {
                console.error("Database Error:", err);
                return res.redirect('/admin_dashboard?error-message=Database Error');
            }
            res.render(`${role}/${subpage}`, { 
                ...getMessages(req),
                organizers: rows
            });
        });
    }
    if (subpage === 'tournament_management' && role === 'coordinator') {
        return db.all("SELECT * FROM tournaments", [], (err, tournaments) => {
            if (err) {
                console.error("Database Error:", err);
                return res.redirect('/coordinator_dashboard?error-message=Database Error');
            }
            res.render('coordinator/tournament_management', { 
                tournaments,
                ...getMessages(req),
                tournamentName: '',
                tournamentDate: '',
                tournamentLocation: '',
                entryFee: ''
            });
        });
    }
    if (subpage === 'organizer_tournament' && role === 'organizer') {
        return db.all("SELECT * FROM tournaments", [], (err, tournaments) => {
            if (err) {
                console.error("Database Error:", err);
                return res.redirect('/organizer_dashboard?error-message=Database Error');
            }
            res.render('organizer/organizer_tournament', { 
                tournaments: tournaments || [], 
                ...getMessages(req)
            });
        });
    }
    if (subpage === 'admin_tournament_management' && role === 'admin') {
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
                    console.error("Database Error:", err);
                    return res.redirect('/admin_dashboard?error-message=Database Error');
                }
                console.log("Fetched tournaments for admin:", tournaments);
                res.render('admin/admin_tournament_management', { 
                    tournaments: tournaments || [],
                    ...getMessages(req)
                });
            }
        );
    }
    
    if (subpage === "player_tournament" && role === "player") {
        const username = req.session.username;
        return db.get("SELECT id FROM users WHERE name = ? AND role = 'player' AND isDeleted = 0", [username], (err, user) => {
            if (err || !user) {
                console.error("Error fetching user:", err);
                return res.redirect("/player_dashboard?error-message=Player not found");
            }
            db.get("SELECT wallet_balance FROM user_balances WHERE user_id = ?", [user.id], (err, balance) => {
                if (err) {
                    console.error("Error fetching wallet balance:", err);
                    return res.redirect("/player_dashboard?error-message=Error retrieving wallet balance");
                }
                const walletBalance = balance?.wallet_balance || 0;
                db.all("SELECT * FROM tournaments WHERE status = 'Approved'", [], (err, tournaments) => {
                    if (err) {
                        console.error("Error fetching tournaments:", err);
                        return res.status(500).send("Error retrieving tournaments.");
                    }
                    db.all(
                        `SELECT t.* FROM tournament_players tp 
                         JOIN tournaments t ON tp.tournament_id = t.id 
                         WHERE tp.username = ?`,
                        [username],
                        (err, enrolledTournaments) => {
                            if (err) {
                                console.error("Error fetching enrolled tournaments:", err);
                                return res.status(500).send("Error retrieving enrolled tournaments.");
                            }
                            // Fetch current subscription
                            db.get(
                                "SELECT plan, price, start_date FROM subscriptionstable WHERE username = ?",
                                [req.session.userEmail],
                                (err, subscription) => {
                                    if (err) {
                                        console.error("Error fetching subscription:", err);
                                        return res.status(500).send("Error retrieving subscription.");
                                    }
                                    res.render("player/player_tournament", {
                                        tournaments: tournaments || [],
                                        enrolledTournaments: enrolledTournaments || [],
                                        username,
                                        walletBalance,
                                        currentSubscription: subscription || null, // Will be null if no subscription exists
                                        ...getMessages(req)
                                    });
                                }
                            );
                        }
                    );
                });
            });
        });
    }
    if (subpage === 'store_management' && role === 'coordinator') {
        const query = "SELECT * FROM products WHERE college = ? "
        return db.all(query, [req.session.userCollege], (err, products) => {
            if (err) {
                console.error("Error fetching products:", err.message);
                return res.status(500).send("Could not retrieve products.");
            }
            res.render('coordinator/store_management', { products });
        });
    }
    if (subpage === "store" && role === "player") {
        return db.get("SELECT wallet_balance FROM user_balances WHERE user_id = ?", [req.session.userID], (err, balance) => {
                if (err) {
                    console.error("Database Error:", err);
                    return res.status(500).send("Error fetching wallet balance");
                }
                const walletBalance = balance?.wallet_balance || 0;
                // Fetch subscription details
                db.get(
                    "SELECT plan FROM subscriptionstable WHERE username = ?",
                    [req.session.userEmail],
                    (err, subscription) => {
                        if (err) {
                            console.error("Error fetching subscription:", err);
                            return res.status(500).send("Error fetching subscription");
                        }
                        console.log("Subscription for", req.session.username, ":", subscription); // Debug log
                        // Calculate discount based on subscription plan
                        let discountPercentage = 0;
                        if (subscription) {
                            if (subscription.plan === "Basic") {
                                discountPercentage = 10; // 10% discount for Basic plan
                            } else if (subscription.plan === "Premium") {
                                discountPercentage = 20; // 20% discount for Premium plan
                            }
                        }
                        const query = "SELECT * FROM products"
                        db.all(query, [], (err, products) => {
                            if (err) {
                                console.error("Database Error:", err);
                                return res.status(500).send("Error fetching products");
                            }
                            res.render("player/store", {
                                products: products || [],
                                walletBalance,
                                playerName: req.session.username, // Use username as playerName
                                playerCollege: req.session.userCollege,
                                subscription: subscription || null,
                                discountPercentage,
                                ...getMessages(req)
                            });
                        });
                    }
                );
            });
    }
    if (subpage === 'store_monitoring' && role === 'organizer') {
        const productsQuery = "SELECT id, name, price, coordinator, college, image_url FROM products";
        const salesQuery = 
            "SELECT p.name AS product, p.price, p.coordinator, s.college AS college, s.buyer, s.purchase_date " +
            "FROM sales s JOIN products p ON s.product_id = p.id;";
        return db.all(productsQuery, [], (err, products) => {
            if (err) {
                console.error("Error fetching products:", err);
                return res.status(500).send("Error fetching products.");
            }
            db.all(salesQuery, [], (err, sales) => {
                if (err) {
                    console.error("Error fetching sales:", err);
                    return res.status(500).send("Error fetching sales.");
                }
                res.render("organizer/store_monitoring", { products, sales });
            });
        });
    }
    if (subpage === "coordinator_meetings") {
        return db.all("SELECT * FROM meetingsdb WHERE role=? ORDER BY date, time", ['coordinator'], (err, yetToHost) => {
            if (err) {
                console.error('Error fetching meetings:', err);
                return res.status(500).send('Database error');
            }
    
            db.all("SELECT * FROM meetingsdb WHERE name!=? ORDER BY date, time", [req.session.username], (err, upcoming) => {
                if (err) {
                    console.error('Error fetching meetings:', err);
                    return res.status(500).send('Database error');
                }
    
                // Render only after both queries complete
                res.render('coordinator/coordinator_meetings', { meetings: yetToHost, upcomingMeetings: upcoming });
            });
        });
    }
    
    if (subpage === 'meetings') {
        return db.all("SELECT * FROM meetingsdb WHERE role =? ORDER BY date, time", ['organizer'], (err, yetToHost) => {
            if (err) {
                console.error('Error fetching meetings:', err);
                return res.status(500).send('Database error');
            }

            db.all("SELECT * FROM meetingsdb WHERE name!= ? ORDER BY date, time", [req.session.username], (err, upcoming) => {
                if (err) {
                    console.error('Error fetching meetings:', err);
                    return res.status(500).send('Database error');
                }
            res.render('organizer/meetings', { organizermeetings: yetToHost, upcomingMeetings:upcoming });
            });
        });
    }
    //added admin meetings route
    if (subpage === 'admin_meetings' && role === 'admin') {
        return db.all("SELECT * FROM meetingsdb WHERE role=? ORDER BY date, time", ['admin'], (err, results) => {
            if (err) {
                console.error('Error fetching meetings:', err);
                return res.status(500).send('Database error');
            }
            res.render('admin/admin_meetings', { adminmeetings: results });
        });
    }
    if (subpage === "subscription" && role === "player") {
        if (!req.session.userEmail) {
            return res.redirect("/?error-message=Please log in");
        }
        return db.get(`
            SELECT u.id, ub.wallet_balance 
            FROM users u 
            LEFT JOIN user_balances ub ON ub.user_id = u.id 
            WHERE u.email = ? AND u.role = 'player' AND u.isDeleted = 0
        `, [req.session.userEmail], (err, row) => {
            if (err || !row) {
                return res.redirect("/player_dashboard?error-message=User not found");
            }
            db.get("SELECT * FROM subscriptionstable WHERE username = ?", [req.session.userEmail], (err, subscription) => {
                res.render('player/subscription', {
                    walletBalance: row.wallet_balance || 0,
                    currentSubscription: subscription || null,
                    ...getMessages(req)
                });
            });
        });
    }
    if (subpage === "player_stats" && role === "coordinator"){
        const sql = `
            SELECT u.name, 
                ps.gamesPlayed, 
                ps.wins, 
                ps.losses, 
                ps.draws, 
                ps.rating 
            FROM player_stats ps
            INNER JOIN users u ON ps.player_id = u.id
            WHERE u.isDeleted = 0
            ORDER BY ps.rating DESC;
        `;
        db.all(sql, [], (err, players) => {
            if (err) {
                console.error("Database Error:", err);
                return res.render("coordinator/player_stats", { players: [] });
            }
            console.log("Fetched Players:", players);
            res.render("coordinator/player_stats", { players });
        });
        return;
    }
    if (subpage === "payments" && role === "admin")
    {
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
                console.error("Database Error:", err);
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
        db.get(statsSql, [playerEmail], (err, player) => {
            if (err) {
                console.error("Database Error:", err);
                return res.redirect("/player_dashboard?error-message=Database Error");
            }
            if (!player) {
                return res.redirect("/player_dashboard?error-message=Player stats not found");
            }
            // Log player data to debug
            console.log("Player Data:", player);
            // Ensure currentRating is a number, default to 400 if undefined/null
            const currentRating = player.rating && !isNaN(player.rating) ? player.rating : 400;
            // Log currentRating to debug
            console.log("Current Rating:", currentRating);
            // Mock rating history
            const ratingHistory = player.gamesPlayed > 0 ? [
                currentRating - 200,  // 6 months ago
                currentRating - 150,  // 5 months ago
                currentRating - 100,  // 4 months ago
                currentRating - 50,   // 3 months ago
                currentRating - 25,   // 2 months ago
                currentRating         // Current
            ] : [400, 400, 400, 400, 400, 400];
            // Log ratingHistory to debug
            console.log("Rating History:", ratingHistory);
            // Generate month labels (last 6 months)
            const chartLabels = Array.from({ length: 6 }, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - (5 - i));
                return date.toLocaleString('default', { month: 'short' });
            });
            // Log chartLabels to debug
            console.log("Chart Labels:", chartLabels);
            const winRate = isNaN(Math.round((player.wins / player.gamesPlayed) * 100))
                ? 0
                : Math.round((player.wins / player.gamesPlayed) * 100);
            // Log winRate to debug
            console.log("Win Rate:", winRate);
            res.render("player/growth", {
                player: {
                    ...player,
                    winRate: player.winRate || winRate
                },
                ratingHistory: ratingHistory,
                chartLabels: chartLabels
            });
        });
        return;
    }

    // Synchronous subpages with sample data
    let data = {};
    if (subpage === 'global_chat') {
        data.messages = [
            { sender: "John", text: "Hi everyone!" },
            { sender: "Jane", text: "Welcome to ChessHive!" }
        ];
    } else if (subpage === "chat" || subpage === "player_chat" || subpage === "coordinator_chat") {
        data.users = [{ username: "John" }, { username: "Jane" }];
        data.messages = [
            { sender: "John", text: "Hi everyone!" },
            { sender: "Jane", text: "Welcome to ChessHive!" }
        ];
        data.currentUser = "";
    } else if (subpage === 'college_stats') {
        data.collegePerformance = [
            { college: 'IIIT Hyderabad', tournaments: 10, wins: 6, losses: 3, draws: 1 },
            { college: 'IIIT Kurnool', tournaments: 8, wins: 5, losses: 2, draws: 1 },
            { college: 'IIIT Gwalior', tournaments: 12, wins: 7, losses: 4, draws: 1 }
        ];
        data.tournamentRecords = [
            { name: 'Spring Invitational', college: 'IIIT Hyderabad', format: 'Classical', position: 1, date: '2025-03-15' },
            { name: 'Classic', college: 'IIIT Kurnool', format: 'Classical', position: 3, date: '2025-03-10' },
            { name: 'Chess Blitz', college: 'IIIT Kurnool', format: 'Rapid', position: 1, date: '2025-04-15' },
            { name: 'Chess Champs', college: 'IIIT Gwalior', format: 'Blitz', position: 1, date: '2025-03-19' },
            { name: 'Rapid Challenge', college: 'IIIT Hyderabad', format: 'Rapid', position: 2, date: '2025-04-10' },
            { name: 'Blitz Masters', college: 'IIIT Hyderabad', format: 'Blitz', position: 3, date: '2025-05-20' }
        ];
        data.topCollegesByFormat = {
            classical: ['IIIT Hyderabad', 'IIIT Delhi', 'IIIT Kurnool'],
            rapid: ['IIIT Kurnool', 'IIIT Hyderabad', 'IIIT Kancheepuram'],
            blitz: ['IIIT Gwalior', 'IIIT Kottayam', 'IIIT Hyderabad']
        };
    }

    // Final render for unhandled synchronous subpages
    try {
        res.render(`${role}/${subpage}`, { 
            ...getMessages(req),
            ...data
        });
    } catch (err) {
        console.error(`Error rendering ${role}/${subpage}:`, err);
        res.redirect(`/${role}_dashboard?error-message=Page not found: ${subpage}`);
    }
});

// Login Handling
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ? AND password = ?", [email, password], (err, user) => {
        if (err) {
            console.error("Database Error:", err);
            return res.redirect('/?error-message=Database Error');
        }
        if (!user) {
            return res.redirect('/login?error-message=Invalid credentials');
        }
        if (user.isDeleted) {
            return res.redirect(`/login?error-message=Account has been deleted&deletedUserId=${user.id}`);
        }
        // Store session information
        req.session.userID = user.id;
        req.session.userEmail = user.email;
        req.session.userRole = user.role;
        req.session.username = user.name;
        req.session.playerName = user.name;
        req.session.userCollege = user.college;
        req.session.collegeName = user.college;
        console.log(`User Login: ${user.email}, Role: ${user.role}`);
        // Redirect based on role
        switch (user.role) {
            case 'admin':
                return res.redirect('/admin_dashboard?success-message=Admin Login Successful');
            case 'organizer':
                return res.redirect('/organizer_dashboard?success-message=Organizer Login Successful');
            case 'coordinator':
                return res.redirect('/coordinator_dashboard?success-message=Coordinator Login Successful');
            case 'player':
                return res.redirect('/player_dashboard?success-message=Player Login Successful');
            default:
                return res.redirect('/?error-message=Invalid Role');
        }
    });
});

// Authorization Middlewares
const isAdmin = (req, res, next) => {
    req.session.userRole === 'admin' ? next() : res.status(403).json({ success: false, message: 'Unauthorized' });
};

const isAdminOrOrganizer = (req, res, next) => {
    (req.session.userRole === 'admin' || req.session.userRole === 'organizer') ? next() : res.status(403).json({ success: false, message: 'Unauthorized' });
};

const isPlayer = (req, res, next) => {
    req.session.userRole === 'player' ? next() : res.status(403).json({ success: false, message: 'Unauthorized' });
};

// Soft Delete Player Route
app.post('/player/delete', isPlayer, (req, res) => {
    if (!req.session.userEmail) {
        return res.redirect('/?error-message=Please log in');
    }
    db.run(
        "UPDATE users SET isDeleted = 1 WHERE email = ? AND role = 'player'",
        [req.session.userEmail],
        function(err) {
            if (err) {
                console.error("Database Error:", err);
                return res.redirect('/player_dashboard?error-message=Database Error');
            }
            if (this.changes === 0) {
                return res.redirect('/player_dashboard?error-message=Player not found');
            }
            req.session.destroy((err) => {
                if (err) {
                    console.error("Session Destroy Error:", err);
                }
                res.redirect('/login?success-message=Account deleted successfully');
            });
        }
    );
});

// Restore Player Route
app.post('/player/restore/:id', (req, res) => {
    const { id } = req.params;
    db.run(
        "UPDATE users SET isDeleted = 0 WHERE id = ? AND role = 'player'",
        [id],
        function(err) {
            if (err) {
                console.error("Database Error:", err);
                return res.redirect('/login?error-message=Database Error');
            }
            if (this.changes === 0) {
                return res.redirect('/login?error-message=Player not found');
            }
            res.redirect('/login?success-message=Account restored successfully');
        }
    );
});

// Remove Coordinator Route
app.delete('/coordinators/remove/:email', isAdminOrOrganizer, (req, res) => {
    const { email } = req.params; // Fixed from req.get to req.params
    db.run("DELETE FROM users WHERE email = ? AND role = 'coordinator'", [email], function(err) {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).json({ success: false, message: 'Database Error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Coordinator not found' });
        }
        res.json({ success: true, message: 'Coordinator removed successfully' });
    });
});

// Remove Organizer Route
app.delete('/organizers/remove/:email', isAdmin, (req, res) => {
    const { email } = req.params;
    db.run("DELETE FROM users WHERE email = ? AND role = 'organizer'", [email], function(err) {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).json({ success: false, message: 'Database Error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Organizer not found' });
        }
        res.json({ success: true, message: 'Organizer removed successfully' });
    });
});

// General Static Pages (after specific routes)
app.get('/:page', (req, res) => {
    const { page } = req.params;
    console.log(`Rendering page: ${page}`);
    if (['admin_dashboard', 'organizer_dashboard', 'coordinator_dashboard', 'player_dashboard'].includes(page)) {
        return res.redirect(`/${page}`);
    }
    try {
        const messages = getMessages(req);
        res.render(page, {
            ...messages,
            deletedUserId: req.query.deletedUserId || null
        });
    } catch (err) {
        console.error(`❌ Error rendering template '${page}': ${err.message}`);
        res.status(404).send(`Page not found: ${page}`);
    }
});

// 404 Handler
app.use((  req, res) => {
    console.log(`404: ${req.url}`);
    res.status(404).redirect('/?error-message=Page not found');
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).redirect('/?error-message=Server error occurred');
});

// Start Server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));