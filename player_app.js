const express = require('express');
const router = express.Router();
const { connectDB } = require('./routes/databasecongi');
const utils = require('./utils');
const { ObjectId } = require('mongodb');

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

router.route('/:subpage?')
  .get(async (req, res) => {
    const subpage = req.params.subpage || 'player_dashboard';

    const db = await connectDB();
    if (subpage === 'player_dashboard') {
      const username = req.session.username;
      const user = await db.collection('users').findOne({ name: username, role: 'player', isDeleted: 0 });
      if (!user) {
          return res.redirect("/login?error-message=Player not found");
      }
  
      // Fetch latest tournaments
      const latestTournaments = await db.collection('tournaments')
          .find({ status: 'Approved' })
          .sort({ date: -1 })
          .limit(5)
          .toArray();
  
      // Fetch latest store items
      const latestItems = await db.collection('products')
      .find({ availability: { $gt: 0 } })
      .sort({ _id: -1 })
      .limit(5)
      .toArray();
  
      // Fetch pending team requests
      const teamRequests = await db.collection('enrolledtournaments_team').aggregate([
          {
              $match: {
                  $or: [
                      { player1_name: username },
                      { player2_name: username },
                      { player3_name: username }
                  ],
                  approved: 0 // Only pending requests
              }
          },
          {
              $lookup: {
                  from: 'tournaments',
                  localField: 'tournament_id',
                  foreignField: '_id',
                  as: 'tournament'
              }
          },
          { $unwind: '$tournament' },
          {
              $lookup: {
                  from: 'users',
                  localField: 'captain_id',
                  foreignField: '_id',
                  as: 'captain'
              }
          },
          { $unwind: '$captain' },
          {
              $project: {
                  id: '$_id', // Use _id as requestId
                  tournamentName: '$tournament.name',
                  captainName: '$captain.name',
                  player1_name: 1,
                  player2_name: 1,
                  player3_name: 1,
                  player1_approved: 1,
                  player2_approved: 1,
                  player3_approved: 1
              }
          }
      ]).toArray();
  
      utils.renderDashboard('player/player_dashboard', req, res, {
          playerName: username,
          latestTournaments: latestTournaments || [],
          latestItems: latestItems || [],
          teamRequests: teamRequests || []
      });
  } else if (subpage === 'player_tournament') {
      const username = req.session.username;
      const user = await db.collection('users').findOne({ name: username, role: 'player', isDeleted: 0 });
      if (!user) {
        console.log('Player tournament failed: Player not found:', username);
        return res.redirect("/player/player_dashboard?error-message=Player not found");
      }
    
      const balance = await db.collection('user_balances').findOne({ user_id: user._id });
      const walletBalance = balance?.wallet_balance || 0;
      const tournaments = await db.collection('tournaments').find({ status: 'Approved' }).toArray();
    
      // Fetch individual tournament enrollments
      const enrolledIndividualTournaments = await db.collection('tournament_players').aggregate([
        { $match: { username } },
        { $lookup: { from: 'tournaments', localField: 'tournament_id', foreignField: '_id', as: 'tournament' } },
        { $unwind: '$tournament' },
        { $project: { tournament: 1 } } // Keep the full tournament object
      ]).toArray();
    
      // Fetch team tournament enrollments with all required fields
      const enrolledTeamTournaments = await db.collection('enrolledtournaments_team').aggregate([
        {
          $match: {
            $or: [
              { captain_id: user._id },
              { player1_name: username },
              { player2_name: username },
              { player3_name: username }
            ]
          }
        },
        { $lookup: { from: 'tournaments', localField: 'tournament_id', foreignField: '_id', as: 'tournament' } },
        { $lookup: { from: 'users', localField: 'captain_id', foreignField: '_id', as: 'captain' } },
        { $unwind: '$tournament' },
        { $unwind: '$captain' },
        {
          $project: {
            tournament_id: '$tournament_id', // Keep original tournament_id
            tournament: '$tournament',       // Full tournament object
            captainName: '$captain.name',    // Captain's name
            player1_name: 1,                 // Preserve team player fields
            player2_name: 1,
            player3_name: 1,
            player1_approved: 1,
            player2_approved: 1,
            player3_approved: 1,
            approved: 1,
            enrollment_date: 1
          }
        }
      ]).toArray();
    
      // Fetch subscription (assuming email is stored in req.session.userEmail)
      const subscription = await db.collection('subscriptionstable').findOne({ username: req.session.userEmail });
    
      console.log('Player tournament loaded:', {
        tournamentCount: tournaments.length,
        enrolledIndividualCount: enrolledIndividualTournaments.length,
        enrolledTeamCount: enrolledTeamTournaments.length
      });
    
      utils.renderDashboard('player/player_tournament', req, res, {
        tournaments: tournaments || [],
        enrolledIndividualTournaments: enrolledIndividualTournaments || [],
        enrolledTeamTournaments: enrolledTeamTournaments || [],
        username,
        walletBalance,
        currentSubscription: subscription || null
      });
    }else if (subpage === 'store') {
      if (!req.session.userEmail) {
        console.log('Store page failed: User not logged in');
        return res.redirect('/login?error-message=Please log in');
      }
    
      const db = await connectDB(); // Assuming db is available from outer scope
      const row = await db.collection('users').aggregate([
        { $match: { email: req.session.userEmail, role: 'player', isDeleted: 0 } },
        { $lookup: { from: 'user_balances', localField: '_id', foreignField: 'user_id', as: 'balance' } },
        { $unwind: { path: '$balance', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, name: 1, college: 1, wallet_balance: '$balance.wallet_balance' } }
      ]).next();
    
      if (!row) {
        console.log('Store page failed: User not found:', req.session.userEmail);
        return res.redirect('/player/player_dashboard?error-message=User not found');
      }
    
      // Sync session data
      req.session.userID = row._id.toString();
      req.session.username = row.name;
      req.session.userCollege = row.college;
    
      const subscription = await db.collection('subscriptionstable').findOne({ username: req.session.userEmail });
      let discountPercentage = 0;
      if (subscription) {
        if (subscription.plan === "Basic") discountPercentage = 10;
        else if (subscription.plan === "Premium") discountPercentage = 20;
      }
      const products = await db.collection('products').find().toArray();
    
      console.log('Store loaded for:', {
        email: req.session.userEmail,
        userID: req.session.userID,
        walletBalance: row.wallet_balance || 0,
        productCount: products.length
      });
    
      utils.renderDashboard('player/store', req, res, {
        products: products || [],
        walletBalance: row.wallet_balance || 0,
        playerName: req.session.username,
        playerCollege: req.session.userCollege,
        subscription: subscription || null,
        discountPercentage,
        successMessage: req.query['success-message'],
        errorMessage: req.query['error-message']
      });
    } else if (subpage === 'subscription') {
      if (!req.session.userEmail) {
        console.log('Subscription page failed: User not logged in');
        return res.redirect("/?error-message=Please log in");
      }
      const row = await db.collection('users').aggregate([
        { $match: { email: req.session.userEmail, role: 'player', isDeleted: 0 } },
        { $lookup: { from: 'user_balances', localField: '_id', foreignField: 'user_id', as: 'balance' } },
        { $unwind: { path: '$balance', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, wallet_balance: '$balance.wallet_balance' } }
      ]).next();
      if (!row) {
        console.log('Subscription page failed: User not found:', req.session.userEmail);
        return res.redirect("/player/player_dashboard?error-message=User not found");
      }
      const subscription = await db.collection('subscriptionstable').findOne({ username: req.session.userEmail });
      let currentSubscription = null;

      if (subscription) {
        const now = new Date();
        if (now > new Date(subscription.end_date)) {
          await db.collection('subscriptionstable').deleteOne({ username: req.session.userEmail });
          console.log(`Expired subscription removed for ${user.email}`);
        } else {
          currentSubscription = subscription; // Still active
        }
      }
      console.log('Subscription page loaded for:', req.session.userEmail);
      utils.renderDashboard('player/subscription', req, res, { walletBalance: row.wallet_balance || 0, currentSubscription: subscription || null });
    } else if (subpage === 'growth') {
      const playerEmail = req.session.userEmail;
      const player = await db.collection('player_stats').aggregate([
        { $lookup: { from: 'users', localField: 'player_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $match: { 'user.email': playerEmail, 'user.isDeleted': 0 } },
        { $project: { name: '$user.name', gamesPlayed: 1, wins: 1, losses: 1, draws: 1, rating: 1 } }
      ]).next();
      if (!player) {
        console.log('Growth page failed: Player stats not found:', playerEmail);
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
      const winRate = player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;
      console.log('Growth page loaded for:', playerEmail);
      utils.renderDashboard('player/growth', req, res, { player: { ...player, winRate: player.winRate || winRate }, ratingHistory, chartLabels });
    } else if (subpage === 'player_profile') {
      if (!req.session.userEmail) {
          console.log('Player profile failed: User not logged in');
          return res.redirect("/?error-message=Please log in");
      }
      const row = await db.collection('users').findOne({ email: req.session.userEmail, role: 'player' });
      if (!row) {
          console.log('Player profile failed: Player not found:', req.session.userEmail);
          return res.redirect("/player/player_dashboard?error-message=Player not found");
      }
      const playerId = row._id;
  
      // Check if player stats already exist
      let playerStats = await db.collection('player_stats').findOne({ player_id: playerId });
  
      if (!playerStats) {
          // Generate stats only if they don't exist
          const gamesPlayed = Math.floor(Math.random() * 11) + 20;
          let wins = Math.floor(Math.random() * (gamesPlayed + 1));
          let losses = Math.floor(Math.random() * (gamesPlayed - wins + 1));
          let draws = gamesPlayed - (wins + losses);
          let rating = 400 + (wins * 10) - (losses * 10);
          let winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
  
          try {
              await db.collection('player_stats').updateOne(
                  { player_id: playerId },
                  { $set: { gamesPlayed, wins, losses, draws, winRate, rating } },
                  { upsert: true }
              );
              playerStats = { gamesPlayed, wins, losses, draws, winRate, rating };
          } catch (err) {
              if (err.code === 121) {
                  console.log('Player stats update failed due to validation error:', err.errInfo);
                  return res.redirect('/player/player_dashboard?error-message=Failed to update player stats due to validation error');
              }
              console.error('Unexpected error updating player stats:', err);
              return res.redirect('/player/player_dashboard?error-message=An unexpected error occurred');
          }
      }
  
      const subscription = await db.collection('subscriptionstable').findOne({ username: req.session.userEmail });
      const balance = await db.collection('user_balances').findOne({ user_id: playerId });
      const sales = await db.collection('sales').aggregate([
          { $match: { buyer: row.name } },
          { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
          { $unwind: '$product' },
          { $project: { name: '$product.name' } }
      ]).toArray();
  
      row.subscription = subscription || { plan: "None", price: 0, start_date: "N/A" };
      row.walletBalance = balance?.wallet_balance || 0;
      row.gamesPlayed = playerStats.gamesPlayed;
      row.wins = playerStats.wins;
      row.losses = playerStats.losses;
      row.draws = playerStats.draws;
      row.winRate = playerStats.winRate;
      row.rating = playerStats.rating;
      row.sales = sales.map(sale => sale.name);
      console.log('Player profile loaded for:', row.email);
      utils.renderDashboard('player/player_profile', req, res, { player: row });
    }else if (subpage === 'pairings') {
      const tournamentId = req.query.tournament_id;
      const totalRounds = parseInt(req.query.rounds) || 5;
      if (!tournamentId) {
          console.log('Pairings failed: No tournament ID provided');
          return res.status(400).send("Tournament ID is required.");
      }
  
      const rows = await db.collection('tournament_players').find({ tournament_id: new ObjectId(tournamentId) }).toArray();
      if (rows.length === 0) {
          console.log('Pairings failed: No players found for tournament:', tournamentId);
          return utils.renderDashboard('player/pairings', req, res, { roundNumber: 1, pairings: [] });
      }
  
      // Check if pairings already exist for this tournament
      let storedPairings = await db.collection('tournament_pairings').findOne({ tournament_id: new ObjectId(tournamentId) });
      
      let allRounds;
      if (!storedPairings) {
          // Generate new pairings if they don't exist
          let players = rows.map(row => new Player(row._id, row.username, row.college, row.gender));
          allRounds = swissPairing(players, totalRounds);
  
          // Store the pairings in the database
          await db.collection('tournament_pairings').insertOne({
              tournament_id: new ObjectId(tournamentId),
              totalRounds: totalRounds,
              rounds: allRounds.map(round => ({
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
                  byePlayer: round.byePlayer ? {
                      id: round.byePlayer.id,
                      username: round.byePlayer.username,
                      score: round.byePlayer.score
                  } : null
              }))
          });
      } else {
          // Use stored pairings
          allRounds = storedPairings.rounds.map(round => {
              const pairings = round.pairings.map(pairing => {
                  const player1 = new Player(pairing.player1.id, pairing.player1.username);
                  player1.score = pairing.player1.score;
                  const player2 = new Player(pairing.player2.id, pairing.player2.username);
                  player2.score = pairing.player2.score;
                  return { player1, player2, result: pairing.result };
              });
              const byePlayer = round.byePlayer ? new Player(round.byePlayer.id, round.byePlayer.username) : null;
              if (byePlayer) byePlayer.score = round.byePlayer.score;
              return { round: round.round, pairings, byePlayer };
          });
      }
  
      console.log('Pairings loaded/generated for tournament:', tournamentId);
      utils.renderDashboard('player/pairings', req, res, { roundNumber: totalRounds, allRounds });
  } else if (subpage === 'rankings') {
    const tournamentId = req.query.tournament_id;
    if (!tournamentId) {
        console.log('Rankings failed: No tournament ID provided');
        return res.status(400).send("Tournament ID is required.");
    }

    const rows = await db.collection('tournament_players').find({ tournament_id: new ObjectId(tournamentId) }).toArray();
    if (rows.length === 0) {
        console.log('No players found for rankings:', tournamentId);
        return utils.renderDashboard('player/rankings', req, res, { rankings: [], tournamentId });
    }

    // Check if pairings exist in the database
    let storedPairings = await db.collection('tournament_pairings').findOne({ tournament_id: new ObjectId(tournamentId) });
    let rankings = [];

    if (!storedPairings) {
        // If no pairings exist, generate and store them
        const totalRounds = 5; // Default to 5 rounds, adjust if needed
        let players = rows.map(row => new Player(row._id, row.username, row.college, row.gender));
        const allRounds = swissPairing(players, totalRounds);

        // Store the pairings
        await db.collection('tournament_pairings').insertOne({
            tournament_id: new ObjectId(tournamentId),
            totalRounds: totalRounds,
            rounds: allRounds.map(round => ({
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
                byePlayer: round.byePlayer ? {
                    id: round.byePlayer.id,
                    username: round.byePlayer.username,
                    score: round.byePlayer.score
                } : null
            }))
        });

        // Use the generated players for rankings
        rankings = players.sort((a, b) => b.score - a.score);
    } else {
        // Use stored pairings to calculate rankings
        let playersMap = new Map(); // Map to store players by ID

        // Initialize players from tournament_players
        rows.forEach(row => {
            playersMap.set(row._id.toString(), new Player(row._id, row.username, row.college, row.gender));
        });

        // Update scores based on stored pairings
        storedPairings.rounds.forEach(round => {
            round.pairings.forEach(pairing => {
                const player1 = playersMap.get(pairing.player1.id.toString());
                const player2 = playersMap.get(pairing.player2.id.toString());
                player1.score = pairing.player1.score;
                player2.score = pairing.player2.score;
            });
            if (round.byePlayer) {
                const byePlayer = playersMap.get(round.byePlayer.id.toString());
                byePlayer.score = round.byePlayer.score;
            }
        });

        // Convert map to array and sort by score
        rankings = Array.from(playersMap.values()).sort((a, b) => b.score - a.score);
    }

    console.log('Rankings loaded for tournament:', tournamentId);
    utils.renderDashboard('player/rankings', req, res, { rankings, tournamentId });
} else {
      console.log('Player subpage not found:', subpage);
      res.redirect('/player/player_dashboard?error-message=Page not found');
    }
  })
  .post(async (req, res) => {
    const subpage = req.params.subpage || 'player_dashboard';

    const db = await connectDB();
    if (subpage === 'delete') {
      if (!req.session.userEmail) {
        console.log('Delete account failed: User not logged in');
        return res.redirect("/?error-message=Please log in");
      }
      const result = await db.collection('users').updateOne(
        { email: req.session.userEmail, role: 'player' }, 
        { $set: { isDeleted: 1 } }
      );
      if (result.matchedCount === 0) {
        console.log('Delete account failed: Player not found:', req.session.userEmail);
        return res.redirect("/player/player_dashboard?error-message=Player not found");
      }
      console.log(`Player account deleted: ${req.session.userEmail}`);
      req.session.destroy((err) => { if (err) console.error("Session destroy error:", err); });
      res.redirect("/login?success-message=Account deleted successfully");
    } else {
      console.log('Invalid POST request for subpage:', subpage);
      res.redirect('/player/player_dashboard?error-message=Invalid POST request');
    }
  });

// Export both the router and swissPairing
module.exports = {
  router,
  swissPairing,
  Player
};