const express = require('express');
const router = express.Router();
const db = require('./databasecongi');

router.post('/signup', (req, res) => {
    const { name, dob, gender, college, email, phone, password, role,aicf_id,fide_id} = req.body;
    let errors = {};

    if (!name || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) 
        errors.name = "Valid full name is required (letters only)";
    if (!dob) 
        errors.dob = "Date of Birth is required";
    else {
        const birthDate = new Date(dob);
        const age = Math.floor((Date.now() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 16) errors.dob = "You must be at least 16 years old";
    }
    if (!gender || !['male', 'female', 'other'].includes(gender)) 
        errors.gender = "Gender is required";
    if (!college?.trim()) 
        errors.college = "College is required";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        errors.email = "Valid email is required";
    }
    else if (/[A-Z]/.test(email)) {  
        errors.email = "Email should only contain lowercase letters"; // Reject uppercase emails
    }

    if (!phone || !/^[0-9]{10}$/.test(phone)) 
        errors.phone = "Valid 10-digit phone number is required";
    if (!password || password.length < 8) 
        errors.password = "Password must be at least 8 characters";
    if (!role || !['admin', 'organizer', 'coordinator', 'player'].includes(role)) 
        errors.role = "Valid role is required";

    if (Object.keys(errors).length > 0) {
        return res.render('signup', { 
            errors, 
            name, 
            dob, 
            gender, 
            college, 
            email, 
            phone, 
            role 
        });
    }
    // Check if email already exists
    db.get('SELECT email FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
            console.error(`Database error: ${err.message}`);
            return res.render('signup', { 
                errors: { server: "Database error occurred" },
                name, dob, gender, college, email, phone, role 
            });
        }

        if (row) {
            errors.email = "Email already registered";
            return res.render('signup', { 
                errors, 
                name, 
                dob, 
                gender, 
                college, 
                email, 
                phone, 
                role 
            });
        }

        // Insert new user
        db.run(
            `INSERT INTO users (name, dob, gender, college, email, phone, password, role, isDeleted,AICF_ID,FIDE_ID) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [name, dob, gender, college, email, phone, password, role,aicf_id,fide_id],
            function(err) {
                if (err) {
                    console.error(`Error inserting user: ${err.message}`);
                    return res.render('signup', { 
                        errors: { server: "Error creating account" },
                        name, dob, gender, college, email, phone, role 
                    });
                }
                const userId = this.lastID;
                if (role === "player") {
                    db.run(
                        `INSERT INTO user_balances (user_id, wallet_balance) VALUES (?, 0)`,
                        [userId],
                        (err) => {
                            if (err) {
                                console.error(`Error initializing balance: ${err.message}`);
                                // Note: User is already created at this point
                            }
                        }
                    );
                }
                db.all("SELECT * FROM users", [], (err, rows) => {
                    if (err) {
                        console.error("Error fetching users table rows:", err.message);
                    } else {
                        console.log("\n=== Current Users Table Contents ===");
                        console.table(rows);  // Displays table in a formatted way
                        console.log("=====================================\n");
                    }
                });
                res.redirect("/login");
            }
        );
    });
});

router.post('/contactus', (req, res) => {
    const { name, email, message } = req.body;
    let errors = {};
    // Server-side validation
    if (!name || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) {
        errors.name = "Name should only contain letters";
    }
    if (!email || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        errors.email = "Please enter a valid email address";
    }
    if (!message || message.trim() === '') {
        errors.message = "Message cannot be empty";
    }
    if (Object.keys(errors).length > 0) {
        return res.render('contactus', {
            name,
            email,
            message,
            errors,
            successMessage: null
        });
    }
    // Insert into database
    const stmt = db.prepare(`
        INSERT INTO contact (name, email, message) 
        VALUES (?, ?, ?)
    `);
    stmt.run(name, email, message, function(err) {
        if (err) {
            console.error("Error inserting contact message:", err.message);
            res.status(500).send("Server error");
        } else {
            stmt.finalize();
            
            // Query and display all rows from contact table
            db.all("SELECT * FROM contact", [], (err, rows) => {
                if (err) {
                    console.error("Error fetching contact table rows:", err.message);
                } else {
                    console.log("\n=== Current Contact Table Contents ===");
                    console.log("Total rows:", rows.length);
                    console.table(rows);  // Displays table in a formatted way
                    console.log("=====================================\n");
                }
            });  
            res.redirect('/contactus?success-message=Message sent successfully!');
        }
    });
});
// Add Funds Route
router.post('/player/add-funds', (req, res) => {
    if (!req.session.userEmail) {
        return res.redirect('/?error-message=Please log in');
    }

    const { amount, redirectTo } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.redirect(`${redirectTo}?error-message=Invalid amount`);
    }

    db.run(
        `UPDATE user_balances 
         SET wallet_balance = wallet_balance + ? 
         WHERE user_id = (SELECT id FROM users WHERE email = ? AND isDeleted = 0)`,
        [parseFloat(amount), req.session.userEmail],
        (err) => {
            if (err) {
                return res.redirect(`${redirectTo}?error-message=Database Error`);
            }
            res.redirect(`${redirectTo}?success-message=Funds added successfully`);
        }
    );
});

// Subscribe Route
router.post('/player/subscribe', (req, res) => {
    if (!req.session.userEmail) {
        return res.redirect('/?error-message=Please log in');
    }

    const { plan, price } = req.body;
    const priceNum = parseFloat(price);

    db.get(
        `SELECT wallet_balance FROM user_balances 
         WHERE user_id = (SELECT id FROM users WHERE email = ? AND isDeleted = 0)`, 
        [req.session.userEmail],
        (err, user) => {
            if (err || !user) {
                return res.redirect('/player/subscription?error-message=User not found');
            }

            if (user.wallet_balance < priceNum) {
                return res.redirect('/player/subscription?error-message=Insufficient funds');
            }

            db.run(
                `UPDATE user_balances 
                 SET wallet_balance = wallet_balance - ? 
                 WHERE user_id = (SELECT id FROM users WHERE email = ? AND isDeleted = 0)`,
                [priceNum, req.session.userEmail],
                (err) => {
                    if (err) {
                        return res.redirect('/player/subscription?error-message=Database Error');
                    }

                    db.run(
                        `INSERT OR REPLACE INTO subscriptionstable (username, plan, price, start_date) 
                         VALUES (?, ?, ?, date('now'))`,
                        [req.session.userEmail, plan, priceNum],
                        (err) => {
                            if (err) {
                                return res.redirect('/player/subscription?error-message=Subscription failed');
                            }
                            res.redirect('/player/subscription?success-message=Subscribed successfully');
                        }
                    );
                }
            );
        }
    );
});

router.post('/tournament_management', (req, res) => {
    const name=req.session.username;
    console.log(name);
    console.log("Received request to add tournament:", req.body);
    const { tournamentName, tournamentDate, tournamentLocation, entryFee, type, noOfRounds, tournamentTime} = req.body;
    let errors = {};
    if (!tournamentName.trim()) errors.name = "Tournament Name is required.";
    if (!tournamentDate.trim()) errors.date = "Tournament Date is required.";
    if (!tournamentLocation.trim()) errors.location = "Location is required.";
    if (!entryFee || isNaN(entryFee) || entryFee < 0) errors.entryFee = "Valid Entry Fee is required.";

    console.log(errors);
    if (Object.keys(errors).length > 0) {
        db.all("SELECT * FROM tournaments", [], (err, tournaments) => {
            if (err) {
                console.error("Error fetching tournaments:", err.message);
                return res.status(500).send("Error: Could not fetch tournaments.");
            }
            res.render('/coordinator/tournament_management', { 
                errors, 
                tournamentName, 
                tournamentDate, 
                tournamentLocation, 
                tournamentTime,
                entryFee,
                type,
                noOfRounds,
                tournaments,
                successMessage: '',
                errorMessage: 'Please correct the errors below'
            });
        });
        return;
    }
    db.run(
        "INSERT INTO tournaments (name, date, location, entry_fee, status, added_by, type, no_of_rounds, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [tournamentName, tournamentDate, tournamentLocation, entryFee, 'Pending',name, type, noOfRounds, tournamentTime],
        function (err) {
            if (err) {
                console.error("Error inserting tournament:", err.message);
                return res.status(500).send("Error: Could not add tournament.");
            }
            console.log("Tournament added successfully."); 
            db.all("SELECT * FROM tournaments", [], (err, rows) => {
                if (err) {
                    console.error("Error fetching tournaments:", err.message);
                    return res.status(500).send("Error: Could not fetch tournaments.");
                }
                console.table(rows); 
                res.redirect("/coordinator/tournament_management?success-message=Tournament added successfully"); 
            });
        }
    );
});

// New routes for approval/rejection
router.post('/organizer/approve-tournament', (req, res) => {
    const name = req.session.username;
    const { tournamentId } = req.body;

    db.run(
        "UPDATE tournaments SET status = 'Approved', approved_by = ? WHERE id = ?",
        [name, tournamentId],
        function (err) {
            if (err) {
                console.error("Error approving tournament:", err.message);
                return res.redirect('/organizer/organizer_tournament?error-message=Failed to approve tournament');
            }
            console.log(`Tournament ${tournamentId} approved by ${name}`);
            res.redirect('/organizer/organizer_tournament?success-message=Tournament approved successfully');
        }
    );
});

router.post('/organizer/reject-tournament', (req, res) => {
    const { tournamentId } = req.body;
    db.run(
        "UPDATE tournaments SET status = 'Rejected' WHERE id = ?",
        [tournamentId],
        function (err) {
            if (err) {
                console.error("Error rejecting tournament:", err.message);
                return res.redirect('/organizer/organizer_tournament?error-message=Failed to reject tournament');
            }
            console.log(`Tournament ${tournamentId} rejected`);
            res.redirect('/organizer/organizer_tournament?success-message=Tournament rejected successfully');
        }
    );
});

router.post("/player/join-tournament", (req, res) => {
    const { tournamentId } = req.body;

    // Check if user is logged in
    if (!req.session.username) {
        console.log("User not logged in.");
        return res.json({ success: false, message: "Please log in." });
    }

    // Step 1: Check if the player is subscribed
    db.get(
        "SELECT * FROM subscriptionstable WHERE username = ?",
        [req.session.userEmail],
        (err, subscription) => {
            if (err) {
                console.error("Error fetching subscription:", err.message);
                return res.status(500).send("Error retrieving Subscription.");
            }
            if (!subscription) {
                console.log(`Player ${req.session.username} is not subscribed.`);
                return res.redirect("/player/player_tournament?error-message=Player or tournament not found");
            }

            // Step 2: Fetch user details, wallet balance, and tournament details
            db.get(
                `SELECT u.id AS userId, u.college, u.gender, ub.wallet_balance, t.entry_fee 
                 FROM users u 
                 LEFT JOIN user_balances ub ON u.id = ub.user_id 
                 JOIN tournaments t ON t.id = ? 
                 WHERE u.name = ? AND u.role = 'player' AND u.isDeleted = 0 AND t.status = 'Approved'`,
                [tournamentId, req.session.username],
                (err, row) => {
                    if (err) {
                        console.error("Error fetching data:", err.message);
                        return res.status(500).send("Error retrieving data.");
                    }
                    if (!row) {
                        console.log("No player or valid tournament found:", { username: req.session.username, tournamentId });
                        return res.redirect("/player/player_tournament?error-message=Player or tournament not found");
                    }

                    const userId = row.userId;
                    const college = row.college;
                    const gender = row.gender;
                    const currentBalance = parseFloat(row.wallet_balance || 0);
                    const entryFee = parseFloat(row.entry_fee);

                    console.log("Fetched data:", { userId, college, gender, currentBalance, entryFee });

                    // Step 3: Check if the player has sufficient balance
                    if (currentBalance < entryFee) {
                        console.log(`Insufficient balance: ${currentBalance} < ${entryFee}`);
                        return res.redirect("/player/player_tournament?error-message=Insufficient wallet balance");
                    }

                    // Step 4: Calculate new balance
                    const newBalance = currentBalance - entryFee;
                    console.log(`New balance calculated: ${newBalance}`);

                    // Step 5: Update the wallet balance
                    db.run(
                        "UPDATE user_balances SET wallet_balance = ? WHERE user_id = ?",
                        [newBalance, userId],
                        function (err) {
                            if (err) {
                                console.error("Error updating wallet balance:", err.message);
                                return res.status(500).send("Error updating wallet balance.");
                            }

                            console.log(`Wallet balance updated: ${currentBalance} -> ${newBalance} for userId: ${userId}`);

                            // Step 6: Insert the player into the tournament_players table
                            db.run(
                                "INSERT INTO tournament_players (tournament_id, username, college, gender) VALUES (?, ?, ?, ?)",
                                [tournamentId, req.session.username, college, gender],
                                function (err) {
                                    if (err) {
                                        console.error("Error joining tournament:", err.message);
                                        // Rollback wallet balance update
                                        db.run(
                                            "UPDATE user_balances SET wallet_balance = ? WHERE user_id = ?",
                                            [currentBalance, userId],
                                            (rollbackErr) => {
                                                if (rollbackErr) {
                                                    console.error("Error rolling back balance:", rollbackErr.message);
                                                }
                                            }
                                        );
                                        return res.status(500).send("Error: Could not join tournament.");
                                    }

                                    console.log(`Player ${req.session.username} joined tournament ID: ${tournamentId}`);
                                    res.redirect("/player/player_tournament");
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

router.post('/coordinator/add-product', (req, res) => {
    const { productName, productPrice, productImage, availability } = req.body;
    const coordinatorName = req.session.username;
    const collegeName = req.session.userCollege; 
    if (!productName || !productPrice || !productImage) {
        return res.send("All fields are required.");
    }

    db.run(
        "INSERT INTO products (name, price, image_url, coordinator, college,availability) VALUES (?, ?, ?, ?, ?, ?)",
        [productName, productPrice, productImage, coordinatorName, collegeName,availability],
        function (err) {
            if (err) {
                console.error("Error adding product:", err.message);
                return res.send("Could not add product.");
            }
            db.all("SELECT * FROM products", [], (err, rows) => {
                if (err) {
                    console.error("Error fetching products:", err.message);
                    return;
                }
                console.log("Current Products Table Entries:");
                console.table(rows);
            });
            res.redirect('/coordinator/store_management');
        }
    );
});

router.post("/buy", (req, res) => {
    console.log("req.body:", req.body);
    const { productId, price, buyer, college } = req.body;

    if (!productId || !price || !buyer || !college) {
        return res.redirect("/player/store?error-message=Missing required fields");
    }

    const originalPrice = parseFloat(price);
    if (isNaN(originalPrice) || originalPrice <= 0) {
        return res.redirect("/player/store?error-message=Invalid price");
    }

    // Verify the buyer matches the logged-in user
    if (buyer !== req.session.username) {
        return res.redirect("/player/store?error-message=Unauthorized purchase attempt");
    }

    const userId = req.session.userID;
    console.log(req.session.userEmail);

    // Fetch subscription to determine discount
    db.get(
        "SELECT plan FROM subscriptionstable WHERE username = ?",
        [req.session.userEmail],
        (err, subscription) => {
            if (err) {
                console.error("Error fetching subscription:", err.message);
                return res.redirect("/player/store?error-message=Database error");
            }

            // Calculate discount based on subscription plan
            let discountPercentage = 0;
            if (subscription && subscription.plan === "Basic") {
                discountPercentage = 10;
            } else if (subscription && subscription.plan === "Premium") {
                discountPercentage = 20;
            }

            const discountAmount = (originalPrice * discountPercentage) / 100;
            const finalPrice = originalPrice - discountAmount;

            // Fetch wallet balance
            db.get(
                "SELECT wallet_balance FROM user_balances WHERE user_id = ?",
                [userId],
                (err, balanceRow) => {
                    if (err) {
                        console.error("Error fetching wallet balance:", err.message);
                        return res.redirect("/player/store?error-message=Database error");
                    }
                    console.log(balanceRow);

                    const walletBalance = balanceRow?.wallet_balance || 0;

                    if (walletBalance < finalPrice) {
                        return res.redirect("/player/store?error-message=Insufficient funds");
                    }

                    // Deduct amount from wallet
                    db.run(
                        "UPDATE user_balances SET wallet_balance = wallet_balance - ? WHERE user_id = ?",
                        [finalPrice, userId],
                        (err) => {
                            if (err) {
                                console.error("Error updating wallet balance:", err.message);
                                return res.redirect("/player/store?error-message=Database error");
                            }

                            // Decrement product availability
                            db.run(
                                "UPDATE products SET availability = availability - 1 WHERE id = ?",
                                [productId],
                                (err) => {
                                    if (err) {
                                        console.error("Error decrementing availability:", err.message);
                                        return res.redirect("/player/store?error-message=Database error");
                                    }

                                    // Insert purchase into sales table
                                    db.run(
                                        "INSERT INTO sales (product_id, price, buyer, college, purchase_date) VALUES (?, ?, ?, ?, datetime('now'))",
                                        [productId, finalPrice, buyer, college],
                                        (err) => {
                                            if (err) {
                                                console.error("Error inserting into sales:", err.message);
                                                return res.redirect("/player/store?error-message=Database error");
                                            }
                                            res.redirect("/player/store?success-message=Purchase successful");
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
});

// Route to schedule a new meeting (Coordinator-Specific)
router.post('/coordinator/coordinator_meetings/schedule', (req, res) => {
    const { title, date, time, link } = req.body;

    const query = `INSERT INTO meetingsdb (title, date, time, link, role, name) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [title, date, time, link, req.session.userRole, req.session.username], function (err) {
        if (err) {
            console.error('Error scheduling meeting:', err);
            return res.status(500).send('Database error');
        }
         // Fetch all entries from meetingsdb after inserting a new one
         db.all("SELECT * FROM meetingsdb", [], (err, rows) => {
            if (err) {
                console.error('Error retrieving meetings:', err);
            } else {
                console.log('Current Meetings in DB:', rows);
            }
        });
        res.redirect('/coordinator/coordinator_meetings');
    });
});

router.post('/meetings/schedule', (req, res) => {
    const { title, date, time, link } = req.body;

    const query = `INSERT INTO meetingsdb (title, date, time, link, role, name) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [title, date, time, link, req.session.userRole, req.session.username], function (err) {
        if (err) {
            console.error('Error scheduling meeting:', err);
            return res.status(500).send('Database error');
        }
         // Fetch all entries from meetingsdb after inserting a new one
        db.all("SELECT * FROM meetingsdb", [], (err, rows) => {
            if (err) {
                console.error('Error retrieving meetings:', err);
            } else {
                console.log('Current Meetings in DB:', rows);
            }
        });
        res.redirect('/organizer/meetings');
    });
});


//added admin meetings
router.post('/admin_meetings/schedule', (req, res) => {
    const { title, date, time, link } = req.body;

    const query = `INSERT INTO meetingsdb (title, date, time, link, role, name) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [title, date, time, link, req.session.userRole, req.session.username], function (err) {
        if (err) {
            console.error('Error scheduling meeting:', err);
            return res.status(500).send('Database error');
        }
         // Fetch all entries from meetingsdb after inserting a new one
        db.all("SELECT * FROM meetingsdb", [], (err, rows) => {
            if (err) {
                console.error('Error retrieving meetings:', err);
            } else {
                console.log('Current Meetings in DB:', rows);
            }
        });
        res.redirect('/admin/admin_meetings');
    });
});



module.exports = router;