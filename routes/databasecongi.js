const sqlite3 = require("sqlite3").verbose();

// Connect to Users Database
const db = new sqlite3.Database("./users.db", (err) => {
    if (err) {
        console.error("Error opening users database:", err.message);
    } else {
        console.log("Connected to users database.");
    }
});

// Create Tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            dob DATE NOT NULL,
            gender TEXT CHECK(gender IN ('male', 'female', 'other')) NOT NULL,
            college TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            FIDE_ID INTEGER,
            AICF_ID INTEGER,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('admin','player', 'coordinator', 'organizer')) NOT NULL,
            isDeleted INTEGER DEFAULT 0  -- Added isDeleted column
        )
    `, (err) => {
        if (err) console.error("❌ Error creating users table:", err.message);
        else console.log("✅ Users table is ready.");
    });

    // Rest of the table creation remains unchanged
    db.run(`
        CREATE TABLE IF NOT EXISTS tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            location TEXT NOT NULL,
            entry_fee REAL NOT NULL,
            status TEXT DEFAULT 'Pending',
            added_by TEXT NOT NULL DEFAULT 'None',
            approved_by TEXT NOT NULL DEFAULT 'None',
            type TEXT NOT NULL DEFAULT 'Individual',
            no_of_rounds INTEGER NOT NULL DEFAULT 5,
            time TEXT NOT NULL DEFAULT '00:00'
        )
    `, (err) => {
        if (err) console.error("❌ Error creating tournaments table:", err.message);
        else console.log("✅ Tournaments table is ready.");
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS tournament_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER,
            username TEXT,
            college TEXT,
            gender TEXT,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
        )
    `, (err) => {
        if (err) console.error("❌ Error creating tournament_players table:", err.message);
        else console.log("✅ Tournament Players table is ready.");
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            image_url TEXT NOT NULL,
            coordinator TEXT NOT NULL,
            college TEXT NOT NULL,
            availability INTEGER NOT NULL DEFAULT 0 CHECK (availability>=0)
        )
    `, (err) => {
        if (err) console.error("❌ Error creating products table:", err.message);
        else console.log("✅ Products table is ready.");
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            buyer TEXT NOT NULL,
            college TEXT NOT NULL, 
            price REAL NOT NULL,
            purchase_date TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    `, (err) => {
        if (err) console.error("❌ Error creating sales table:", err.message);
        else console.log("✅ Sales table is ready.");
    });

    db.run(`CREATE TABLE IF NOT EXISTS meetingsdb (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        link TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin','player', 'coordinator', 'organizer')) NOT NULL,
        name TEXT NOT NULL
    )`, (err) => {
        if (err) {
            console.error("❌ Error creating meetings table:", err);
        } else {
            console.log('✅ Meetings table is ready.');
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS organizermeetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        link TEXT NOT NULL
    )`, (err) => {
        if (err) {
            console.error("❌ Error creating organizermeetings table:", err);
        } else {
            console.log('✅ OrganizerMeetings table is ready.');
        }
    });
    //added admin meetings table here
    db.run(`CREATE TABLE IF NOT EXISTS adminmeetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        link TEXT NOT NULL
    )`, (err) => {
        if (err) {
            console.error("❌ Error creating adminmeetings table:", err);
        } else {
            console.log('✅ AdminMeetings table is ready.');
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS subscriptionstable (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            plan TEXT NOT NULL,
            price REAL NOT NULL,
            start_date TEXT NOT NULL
        )
    `, (err) => {
        if (err) {
            console.error("❌ Error creating subscriptions table:", err.message);
        } else {
            console.log("✅ Subscriptions table is ready.");
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS user_balances (
            user_id INTEGER PRIMARY KEY,
            wallet_balance REAL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error("❌ Error creating user_balances table:", err.message);
        } else {
            console.log("✅ User Balances table is ready.");
        }
    });
    
    db.run(`
        CREATE TABLE IF NOT EXISTS player_stats (
            player_id INTEGER PRIMARY KEY,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            winRate REAL DEFAULT 0,
            gamesPlayed REAL DEFAULT 0,
            rating REAL DEFAULT 400,
            FOREIGN KEY (player_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error("❌ Error creating player_stats table:", err.message);
        } else {
            console.log("✅ Player Stats table is ready.");
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS contact (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            submission_date TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error("❌ Error creating contact table:", err.message);
        } else {
            console.log("✅ Contact table is ready.");
        }
    });
});

module.exports = db;