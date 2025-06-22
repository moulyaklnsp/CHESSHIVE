const express = require('express');
const router = express.Router();
const { connectDB } = require('./databasecongi');
const { ObjectId } = require('mongodb');
const { swissPairing, Player } = require('../player_app');


router.post('/signup', async (req, res) => {
  const { name, dob, gender, college, email, phone, password, role, aicf_id, fide_id } = req.body;
  let errors = {};

  if (!name || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) errors.name = "Valid full name is required (letters only)";
  if (!dob) errors.dob = "Date of Birth is required";
  else {
    const birthDate = new Date(dob);
    const age = Math.floor((Date.now() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 16) errors.dob = "You must be at least 16 years old";
  }
  if (!gender || !['male', 'female', 'other'].includes(gender)) errors.gender = "Gender is required";
  if (!/^[A-Za-z\s']+$/.test(college.trim())) errors.college = "College name must contain only letters, spaces, or apostrophes";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.email = "Valid email is required";
  else if (/[A-Z]/.test(email)) errors.email = "Email should only contain lowercase letters";
  if (!phone || !/^[0-9]{10}$/.test(phone)) errors.phone = "Valid 10-digit phone number is required";
  if (!password || password.length < 8) errors.password = "Password must be at least 8 characters";
  if (!role || !['admin', 'organizer', 'coordinator', 'player'].includes(role)) errors.role = "Valid role is required";

  if (Object.keys(errors).length > 0) {
    console.log('Signup validation errors:', errors);
    return res.render('signup', { errors, name, dob, gender, college, email, phone, role });
  }

  const db = await connectDB();
  const existingUser = await db.collection('users').findOne({ email });
  if (existingUser) {
    errors.email = "Email already registered";
    console.log('Signup failed: Email already exists:', email);
    return res.render('signup', { errors, name, dob, gender, college, email, phone, role });
  }

  const user = {
    name,
    dob: new Date(dob),
    gender,
    college,
    email,
    phone,
    password,
    role,
    isDeleted: 0,
    AICF_ID: aicf_id || '',
    FIDE_ID: fide_id || ''
  };
  const result = await db.collection('users').insertOne(user);
  const userId = result.insertedId;
  console.log('New user signed up:', { email, role, userId });

  if (role === "player") {
    await db.collection('user_balances').insertOne({ user_id: userId, wallet_balance: 0 });
    console.log('Initialized wallet balance for player:', userId);
  }

  const users = await db.collection('users').find().toArray();
  console.log("\n=== Current Users Table Contents ===");
  console.table(users);
  console.log("=====================================\n");

  res.redirect("/login");
});

router.post('/contactus', async (req, res) => {
  const { name, email, message } = req.body || {};
  console.log("Raw req.body:", req.body);
  console.log("Destructured:", { name, email, message });
  let errors = {};

  // Validate name
  if (!name || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) {
    errors.name = "Name should only contain letters";
  }

  // Validate email
  if (!email || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    errors.email = "Please enter a valid email address";
  }

  // Validate message
  if (!message || message.trim() === '') {
    errors.message = "Message cannot be empty";
  } else {
    // Count words in the message
    const wordCount = message.trim().split(/\s+/).length;
    if (wordCount > 200) {
      errors.message = "Message cannot exceed 200 words";
    }
  }

  // If there are any validation errors, render the form with errors
  if (Object.keys(errors).length > 0) {
    console.log('Contact us validation errors:', errors);
    return res.render('contactus', { name, email, message, errors, successMessage: null });
  }

  // Connect to database and check if user is a registered player
  const db = await connectDB();
  // const user = await db.collection('users').findOne({ name, email, role: 'player', isDeleted: 0 });
  // if (!user) {
  //   errors.email = "Only registered players can submit messages. Please sign up or use a player account.";
  //   console.log('Contact us failed: Not a registered player:', { name, email });
  //   return res.render('contactus', { name, email, message, errors, successMessage: null });
  // }

  // Insert the message into the database
  await db.collection('contact').insertOne({ name, email, message, submission_date: new Date() });
  console.log('Contact message submitted:', { name, email });

  // Log current contact table contents
  const contacts = await db.collection('contact').find().toArray();
  console.log("\n=== Current Contact Table Contents ===");
  console.log("Total rows:", contacts.length);
  console.table(contacts);
  console.log("=====================================\n");

  // Redirect with success message
  res.redirect('/contactus?success-message=Message sent successfully!');
});

router.post('/player/add-funds', async (req, res) => {
  console.log('Add funds request body:', req.body); // Debug log
  if (!req.session.userEmail) {
    console.log('Add funds failed: User not logged in');
    return res.redirect('/player/store?error-message=Please log in to add funds');
  }

  const { amount, redirectTo } = req.body;
  const amountNum = parseFloat(amount);
  if (!amount || isNaN(amountNum) || amountNum <= 0) {
    console.log('Add funds failed: Invalid amount:', amount);
    return res.redirect(`${redirectTo}?error-message=Please enter a valid amount greater than 0`);
  }

  const db = await connectDB();
  const user = await db.collection('users').findOne({ email: req.session.userEmail, isDeleted: 0 });
  if (!user) {
    console.log('Add funds failed: User not found:', req.session.userEmail);
    return res.redirect(`${redirectTo}?error-message=User not found`);
  }

  try {
    await db.collection('user_balances').updateOne(
      { user_id: user._id },
      { $inc: { wallet_balance: amountNum } },
      { upsert: true }
    );
    console.log(`Funds added for user ${user.email}: ${amountNum}`);
    res.redirect(`${redirectTo}?success-message=Funds added successfully`);
  } catch (err) {
    console.error('Database error adding funds:', err);
    res.redirect(`${redirectTo}?error-message=Failed to add funds due to a server error`);
  }
});

// Subscribe Route
// Subscribe Route
router.post('/player/subscribe', async (req, res) => {
  if (!req.session.userEmail) {
    console.log('Subscription failed: User not logged in');
    return res.redirect('/?error-message=Please log in');
  }
  const { plan, price } = req.body;
  const priceNum = parseFloat(price);

  const db = await connectDB();
  const user = await db.collection('users').findOne({ email: req.session.userEmail, isDeleted: 0 });
  if (!user) {
    console.log('Subscription failed: User not found:', req.session.userEmail);
    return res.redirect('/player/subscription?error-message=User not found');
  }

  const balance = await db.collection('user_balances').findOne({ user_id: user._id });
  if (!balance || balance.wallet_balance < priceNum) {
    console.log('Subscription failed: Insufficient funds for', user.email);
    return res.redirect('/player/subscription?error-message=Insufficient funds');
  }

  // Check existing subscription and remove if expired
  const existingSubscription = await db.collection('subscriptionstable').findOne({ username: req.session.userEmail });
  if (existingSubscription && new Date() > new Date(existingSubscription.end_date)) {
    await db.collection('subscriptionstable').deleteOne({ username: req.session.userEmail });
    console.log(`Expired subscription removed for ${user.email}`);
  }

  // Proceed with new subscription
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 30); // Set expiry to 30 days from start

  await db.collection('user_balances').updateOne(
    { user_id: user._id },
    { $inc: { wallet_balance: -priceNum } }
  );
  await db.collection('subscriptionstable').updateOne(
    { username: req.session.userEmail },
    { 
      $set: { 
        plan, 
        price: priceNum, 
        start_date: startDate, 
        end_date: endDate 
      } 
    },
    { upsert: true }
  );
  console.log(`User ${user.email} subscribed to ${plan} plan for ${priceNum}, expires on ${endDate}`);
  res.redirect('/player/subscription?success-message=Subscribed successfully');
});

// Tournament Management Route
router.post('/tournament_management', async (req, res) => {
  const name = req.session.username;
  console.log('Adding tournament by:', name);
  console.log("Received request to add tournament:", req.body);
  const { tournamentName, tournamentDate, tournamentLocation, entryFee, type, noOfRounds, tournamentTime } = req.body;
  let errors = {};
  if (!tournamentName.trim()) errors.name = "Tournament Name is required.";
  if (!tournamentDate.trim()) errors.date = "Tournament Date is required.";
  if (!tournamentLocation.trim()) errors.location = "Location is required.";
  if (!entryFee || isNaN(entryFee) || entryFee < 0) errors.entryFee = "Valid Entry Fee is required.";

  const db = await connectDB();
  if (Object.keys(errors).length > 0) {
    console.log('Tournament addition failed due to validation errors:', errors);
    const tournaments = await db.collection('tournaments').find().toArray();
    return res.render('coordinator/tournament_management', {
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
  }

  await db.collection('tournaments').insertOne({
    name: tournamentName,
    date: new Date(tournamentDate),
    location: tournamentLocation,
    entry_fee: parseFloat(entryFee),
    status: 'Pending',
    added_by: name,
    type,
    no_of_rounds: parseInt(noOfRounds),
    time: tournamentTime
  });
  console.log('Tournament added:', { tournamentName, added_by: name });

  const tournaments = await db.collection('tournaments').find().toArray();
  console.table(tournaments);
  res.redirect("/coordinator/tournament_management?success-message=Tournament added successfully");
});

// Approve Tournament Route
router.post('/organizer/approve-tournament', async (req, res) => {
  const name = req.session.username;
  const { tournamentId } = req.body;

  // Step 1: Check if tournamentId exists
  if (!tournamentId) {
    console.log('Missing tournamentId in request body');
    return res.redirect('/organizer/organizer_tournament?error-message=Missing tournament ID');
  }

  // Step 2: Validate tournamentId format
  if (!ObjectId.isValid(tournamentId)) {
    console.log('Invalid tournamentId:', tournamentId);
    return res.redirect('/organizer/organizer_tournament?error-message=Invalid tournament ID');
  }

  // Step 3: Safely construct ObjectId and update the database
  const db = await connectDB();
  await db.collection('tournaments').updateOne(
    { _id: new ObjectId(tournamentId) },
    { $set: { status: 'Approved', approved_by: name } }
  );
  console.log(`Tournament ${tournamentId} approved by ${name}`);
  res.redirect('/organizer/organizer_tournament?success-message=Tournament approved successfully');
});

// Reject Tournament Route
router.post('/organizer/reject-tournament', async (req, res) => {
  const { tournamentId } = req.body;

  if (!tournamentId || !ObjectId.isValid(tournamentId)) {
    console.log('Invalid or missing tournamentId:', tournamentId);
    return res.redirect('/organizer/organizer_tournament?error-message=Invalid tournament ID');
  }

  const db = await connectDB();
  await db.collection('tournaments').updateOne(
    { _id: new ObjectId(tournamentId) },
    { $set: { status: 'Rejected' } }
  );
  console.log(`Tournament ${tournamentId} rejected`);
  res.redirect('/organizer/organizer_tournament?success-message=Tournament rejected successfully');
});

// Join Tournament Route
router.post("/player/join-tournament", async (req, res) => {
  const { tournamentId, player1, player2, player3 } = req.body;

  if (!req.session.userEmail) {
      console.log('Join tournament failed: User not logged in');
      return res.redirect("/player/player_tournament?error-message=Please log in");
  }

  if (!tournamentId || typeof tournamentId !== 'string' || !ObjectId.isValid(tournamentId)) {
      console.log('Invalid or missing tournamentId:', tournamentId);
      return res.redirect('/player/player_tournament?error-message=Invalid tournament ID');
  }

  const db = await connectDB();
  const user = await db.collection('users').findOne({ email: req.session.userEmail, role: 'player', isDeleted: 0 });
  if (!user) {
      console.log('Join tournament failed: User not found:', req.session.userEmail);
      return res.redirect('/player/player_tournament?error-message=User not found');
  }

  const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId), status: 'Approved' });
  if (!tournament) {
      console.log('Join tournament failed: Tournament not found or not approved:', tournamentId);
      return res.redirect('/player/player_tournament?error-message=Tournament not found or not approved');
  }

  const balance = await db.collection('user_balances').findOne({ user_id: user._id });
  const currentBalance = parseFloat(balance?.wallet_balance || 0);
  const entryFee = parseFloat(tournament.entry_fee);
  if (currentBalance < entryFee) {
      console.log('Join tournament failed: Insufficient balance for', user.email);
      return res.redirect('/player/player_tournament?error-message=Insufficient wallet balance');
  }

  const subscription = await db.collection('subscriptionstable').findOne({ username: req.session.userEmail });
  if (!subscription) {
      console.log('Join tournament failed: No subscription for', req.session.userEmail);
      return res.redirect('/player/player_tournament?error-message=Subscription required');
  }

  const newBalance = currentBalance - entryFee;
  await db.collection('user_balances').updateOne({ user_id: user._id }, { $set: { wallet_balance: newBalance } });

  if (player1 && player2 && player3) {
      let errors = {};
      if (!player1.trim()) errors.player1 = "Player 1 name is required";
      if (!player2.trim()) errors.player2 = "Player 2 name is required";
      if (!player3.trim()) errors.player3 = "Player 3 name is required";
      if (Object.keys(errors).length > 0) {
          console.log('Team join failed: Validation errors:', errors);
          return res.redirect("/player/player_tournament?error-message=All player names are required");
      }
      if (tournament.type !== 'Team') {
          console.log('Team join failed: Tournament is not a team event:', tournamentId);
          return res.redirect('/player/player_tournament?error-message=This is not a team tournament');
      }

      await db.collection('enrolledtournaments_team').insertOne({
          tournament_id: new ObjectId(tournamentId),
          captain_id: user._id,
          player1_name: player1,
          player2_name: player2,
          player3_name: player3,
          enrollment_date: new Date(),
          player1_approved: 0,
          player2_approved: 0,
          player3_approved: 0,
          approved: 0
      });
      console.log(`Team enrolled for tournament ${tournamentId} by captain ${user._id}`);
      res.redirect("/player/player_tournament?success-message=Team enrolled successfully");
  } else {
      if (tournament.type !== 'Individual') {
          console.log('Individual join failed: Tournament is not an individual event:', tournamentId);
          return res.redirect('/player/player_tournament?error-message=This is not an individual tournament');
      }

      await db.collection('tournament_players').insertOne({
          tournament_id: new ObjectId(tournamentId),
          username: req.session.username,
          college: user.college,
          gender: user.gender
      });
      console.log(`Player ${user.email} joined tournament ${tournamentId}`);

      const updatedPlayers = await db.collection('tournament_players')
          .find({ tournament_id: new ObjectId(tournamentId) })
          .toArray();

      const totalRounds = tournament.no_of_rounds || 5;
      const players = updatedPlayers.map(row => new Player(row._id, row.username, row.college, row.gender));
      const newPairings = swissPairing(players, totalRounds);

      await db.collection('tournament_pairings').updateOne(
          { tournament_id: new ObjectId(tournamentId) },
          {
              $set: {
                  totalRounds: totalRounds,
                  rounds: newPairings.map(round => ({
                      round: round.round,
                      pairings: round.pairings.map(pairing => ({
                          player1: {
                              id: pairing.player1.id,
                              username: pairing.player1.username,
                              score: pairing.player1.score
                          },
                          player2: {
                              id: pairing.player2.id,
                              username: pairing.player2.username,
                              score: pairing.player2.score
                          },
                          result: pairing.result
                      })),
                      byePlayer: round.byePlayer
                          ? { id: round.byePlayer.id, username: round.byePlayer.username, score: round.byePlayer.score }
                          : null
                  }))
              }
          },
          { upsert: true }
      );

      console.log(`Pairings regenerated and stored for tournament ${tournamentId}`);
      res.redirect("/player/player_tournament?success-message=Joined tournament successfully");
  }
});

// Approve Team Request Route
router.post('/player/approve-team-request', async (req, res) => {
  const { requestId } = req.body;
  const username = req.session.username;
  if (!req.session.userEmail) {
    console.log('Approve request failed: User not logged in');
    return res.redirect('/login?error-message=Please log in');
  }

  if (!requestId || !ObjectId.isValid(requestId)) {
    console.log('Approve request failed: Invalid requestId:', requestId);
    return res.redirect('/player/player_dashboard?error-message=Invalid request ID');
  }

  const db = await connectDB();
  try {
    const request = await db.collection('enrolledtournaments_team').findOne({ _id: new ObjectId(requestId) });
    if (!request) {
      console.log('Approve request failed: Request not found:', requestId);
      return res.redirect('/player/player_dashboard?error-message=Request not found');
    }

    let updateField = {};
    if (request.player1_name === username) updateField.player1_approved = 1;
    else if (request.player2_name === username) updateField.player2_approved = 1;
    else if (request.player3_name === username) updateField.player3_approved = 1;
    else {
      console.log('Approve request failed: User not part of team:', { username, request });
      return res.redirect('/player/player_dashboard?error-message=You are not part of this team');
    }

    const result = await db.collection('enrolledtournaments_team').updateOne(
      { _id: new ObjectId(requestId) },
      { $set: updateField }
    );

    if (result.modifiedCount === 0) {
      console.log('Approve request failed: No changes made:', { requestId, updateField });
      return res.redirect('/player/player_dashboard?error-message=Failed to approve request');
    }

    const updatedRequest = await db.collection('enrolledtournaments_team').findOne({ _id: new ObjectId(requestId) });
    if (updatedRequest.player1_approved && updatedRequest.player2_approved && updatedRequest.player3_approved) {
      await db.collection('enrolledtournaments_team').updateOne(
        { _id: new ObjectId(requestId) },
        { $set: { approved: 1 } }
      );
      console.log(`Team fully approved for request: ${requestId}`);
    }

    console.log(`Team request approved by ${username} for request: ${requestId}`);
    res.redirect('/player/player_dashboard?success-message=Request approved successfully');
  } catch (err) {
    console.error('Error approving team request:', err);
    res.redirect('/player/player_dashboard?error-message=An error occurred while approving the request');
  }
});

// Add Product Route
router.post('/coordinator/add-product', async (req, res) => {
  const { productName, productPrice, productImage, availability } = req.body;
  const coordinatorName = req.session.username;
  const collegeName = req.session.userCollege;
  if (!productName || !productPrice || !productImage) {
    console.log('Add product failed: Missing fields');
    return res.send("All fields are required.");
  }

  const db = await connectDB();
  await db.collection('products').insertOne({
    name: productName,
    price: parseFloat(productPrice),
    image_url: productImage,
    coordinator: coordinatorName,
    college: collegeName,
    availability: parseInt(availability)
  });
  console.log('Product added:', { productName, coordinator: coordinatorName });

  const products = await db.collection('products').find().toArray();
  console.log("Current Products Table Entries:");
  console.table(products);
  res.redirect('/coordinator/store_management');
});

router.post("/buy", async (req, res) => {
  console.log("req.body:", req.body);
  console.log('Session:', req.session);
  const { productId, price, buyer, college } = req.body;

  if (!req.session.userEmail || !req.session.username || !req.session.userID) {
    console.log('Buy product failed: User not logged in');
    return res.redirect("/player/store?error-message=Please log in to make a purchase");
  }

  if (!productId || !ObjectId.isValid(productId)) {
    console.log('Invalid or missing productId:', productId);
    return res.redirect("/player/store?error-message=Invalid product ID");
  }

  if (!price || !buyer || !college) {
    console.log('Buy product failed: Missing required fields:', req.body);
    return res.redirect("/player/store?error-message=Missing required fields");
  }

  const originalPrice = parseFloat(price);
  if (isNaN(originalPrice) || originalPrice <= 0) {
    console.log('Buy product failed: Invalid price:', price);
    return res.redirect("/player/store?error-message=Invalid price");
  }

  if (buyer !== req.session.username) {
    console.log('Buy product failed: Unauthorized purchase attempt by', buyer);
    return res.redirect("/player/store?error-message=Unauthorized purchase attempt");
  }

  const userId = req.session.userID;
  const db = await connectDB();

  try {
    const product = await db.collection('products').findOne({ _id: new ObjectId(productId) });
    if (!product || product.availability <= 0) {
      console.log('Buy product failed: Product unavailable:', productId, product);
      return res.redirect("/player/store?error-message=Product is out of stock");
    }

    const subscription = await db.collection('subscriptionstable').findOne({ username: req.session.userEmail });
    let discountPercentage = 0;
    if (subscription) {
      if (subscription.plan === "Basic") discountPercentage = 10;
      else if (subscription.plan === "Premium") discountPercentage = 20;
    }

    const discountAmount = (originalPrice * discountPercentage) / 100;
    const finalPrice = originalPrice - discountAmount;
    console.log('Price details:', { originalPrice, discountPercentage, discountAmount, finalPrice });

    const balance = await db.collection('user_balances').findOne({ user_id: new ObjectId(userId) });
    const walletBalance = balance?.wallet_balance || 0;
    console.log('User balance from DB:', { userId, walletBalance });

    if (walletBalance < finalPrice) {
      console.log('Buy product failed: Insufficient funds for', req.session.userEmail, { walletBalance, finalPrice });
      return res.redirect("/player/store?error-message=Insufficient funds");
    }

    await db.collection('user_balances').updateOne(
      { user_id: new ObjectId(userId) },
      { $inc: { wallet_balance: -finalPrice } }
    );
    await db.collection('products').updateOne(
      { _id: new ObjectId(productId) },
      { $inc: { availability: -1 } }
    );
    await db.collection('sales').insertOne({
      product_id: new ObjectId(productId),
      price: finalPrice,
      buyer,
      college,
      purchase_date: new Date()
    });

    console.log(`Product ${productId} purchased by ${buyer} for ${finalPrice}`);
    res.redirect("/player/store?success-message=Purchase successful");
  } catch (err) {
    console.error('Buy product failed: Database error:', err);
    res.redirect("/player/store?error-message=Failed to process purchase due to a server error");
  }
});

// Schedule Meeting Routes
router.post('/coordinator/coordinator_meetings/schedule', async (req, res) => {
  const { title, date, time, link } = req.body;
  const db = await connectDB();
  await db.collection('meetingsdb').insertOne({
    title,
    date: new Date(date),
    time,
    link,
    role: req.session.userRole,
    name: req.session.username
  });
  console.log('Meeting scheduled by coordinator:', { title, date });

  const meetings = await db.collection('meetingsdb').find().toArray();
  console.log('Current Meetings in DB:', meetings);
  res.redirect('/coordinator/coordinator_meetings');
});

router.post('/meetings/schedule', async (req, res) => {
  const { title, date, time, link } = req.body;
  const db = await connectDB();
  await db.collection('meetingsdb').insertOne({
    title,
    date: new Date(date),
    time,
    link,
    role: req.session.userRole,
    name: req.session.username
  });
  console.log('Meeting scheduled by organizer:', { title, date });

  const meetings = await db.collection('meetingsdb').find().toArray();
  console.log('Current Meetings in DB:', meetings);
  res.redirect('/organizer/meetings');
});

router.post('/admin_meetings/schedule', async (req, res) => {
  const { title, date, time, link } = req.body;
  const db = await connectDB();
  await db.collection('meetingsdb').insertOne({
    title,
    date: new Date(date),
    time,
    link,
    role: req.session.userRole,
    name: req.session.username
  });
  console.log('Meeting scheduled by admin:', { title, date });

  const meetings = await db.collection('meetingsdb').find().toArray();
  console.log('Current Meetings in DB:', meetings);
  res.redirect('/admin/admin_meetings');
});

module.exports = router;