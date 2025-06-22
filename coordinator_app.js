const express = require('express');
const router = express.Router();
const { connectDB } = require('./routes/databasecongi');
const moment = require('moment');
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

router.get('/:subpage?', async (req, res) => {
  const subpage = req.params.subpage || 'coordinator_dashboard';

  const db = await connectDB();
  if (subpage === 'coordinator_dashboard') {
    const threeDaysLater = moment().add(3, 'days').toDate();
    const meetings = await db.collection('meetingsdb').find({ date: { $lte: threeDaysLater } }).toArray();
    console.log('Coordinator dashboard loaded:', { meetingCount: meetings.length });
    utils.renderDashboard('coordinator/coordinator_dashboard', req, res, { meetings });
  } else if (subpage === 'tournament_management') {
    const tournaments = await db.collection('tournaments').find().toArray();
    console.log('Tournament management loaded:', { tournamentCount: tournaments.length });
    utils.renderDashboard('coordinator/tournament_management', req, res, { 
      tournaments, 
      tournamentName: "", 
      tournamentDate: "", 
      tournamentLocation: "", 
      entryFee: "" 
    });
  } else if (subpage === 'store_management') {
    const products = await db.collection('products').find({ college: req.session.userCollege }).toArray();
    console.log('Store management loaded:', { productCount: products.length });
    utils.renderDashboard('coordinator/store_management', req, res, { products });
  } else if (subpage === 'coordinator_meetings') {
    const yetToHost = await db.collection('meetingsdb').find({ role: 'coordinator' }).sort({ date: 1, time: 1 }).toArray();
    const upcoming = await db.collection('meetingsdb').find({ name: { $ne: req.session.username } }).sort({ date: 1, time: 1 }).toArray();
    console.log('Coordinator meetings loaded:', { yetToHostCount: yetToHost.length, upcomingCount: upcoming.length });
    utils.renderDashboard('coordinator/coordinator_meetings', req, res, { meetings: yetToHost, upcomingMeetings: upcoming });
  } else if (subpage === 'player_stats') {
    const players = await db.collection('player_stats').aggregate([
      { $lookup: { from: 'users', localField: 'player_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.isDeleted': 0, 'user.college': req.session.collegeName } },
      { $project: { name: '$user.name', gamesPlayed: 1, wins: 1, losses: 1, draws: 1, rating: 1 } }
    ]).sort({ rating: -1 }).toArray();
    console.log('Player stats loaded:', { playerCount: players.length });
    utils.renderDashboard('coordinator/player_stats', req, res, { players });
  } else if (subpage === 'enrolled_players') {
    const tournamentId = req.query.tournament_id;
    if (!tournamentId) {
      console.log('Enrolled players failed: No tournament specified');
      return res.redirect("/coordinator/coordinator_dashboard?error-message=No tournament specified");
    }
    const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
    if (!tournament) {
      console.log('Enrolled players failed: Tournament not found:', tournamentId);
      return res.redirect("/coordinator/coordinator_dashboard?error-message=Tournament not found");
    }
    const individualPlayers = await db.collection('tournament_players').find({ tournament_id: tournament._id }).toArray();
    const teamEnrollments = await db.collection('enrolledtournaments_team').aggregate([
      { $match: { tournament_id: tournament._id } },
      { $lookup: { from: 'users', localField: 'captain_id', foreignField: '_id', as: 'captain' } },
      { $unwind: '$captain' },
      { $project: { player1_name: 1, player2_name: 1, player3_name: 1, player1_approved: 1, player2_approved: 1, player3_approved: 1, captain_name: '$captain.name' } }
    ]).toArray();
    console.log('Enrolled players loaded for tournament:', tournamentId);
    utils.renderDashboard('coordinator/enrolled_players', req, res, { 
      tournamentName: tournament.name, 
      tournamentType: tournament.type, 
      individualPlayers: individualPlayers || [], 
      teamEnrollments: teamEnrollments || [] 
    });
  } else if (subpage === 'pairings') {
    const tournamentId = req.query.tournament_id;
    const totalRounds = parseInt(req.query.rounds) || 5;
    if (!tournamentId) {
        console.log('Pairings failed: No tournament ID provided');
        return res.status(400).send("Tournament ID is required.");
    }

    const rows = await db.collection('tournament_players').find({ tournament_id: new ObjectId(tournamentId) }).toArray();
    if (rows.length === 0) {
        console.log('Pairings failed: No players found for tournament:', tournamentId);
        return utils.renderDashboard('coordinator/pairings', req, res, { roundNumber: 1, allRounds: [] });
    }

    let storedPairings = await db.collection('tournament_pairings').findOne({ tournament_id: new ObjectId(tournamentId) });
    let allRounds = []; // Default to empty array

    if (!storedPairings) {
        let players = rows.map(row => new Player(row._id, row.username, row.college, row.gender));
        allRounds = swissPairing(players, totalRounds);

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

    console.log('allRounds before rendering:', allRounds); // Debug log
    utils.renderDashboard('coordinator/pairings', req, res, { 
        roundNumber: totalRounds, 
        allRounds: allRounds // Explicitly pass as array
    });
  }else if (subpage === 'rankings') {
      const tournamentId = req.query.tournament_id;
      if (!tournamentId) {
          console.log('Rankings failed: No tournament ID provided');
          return res.status(400).send("Tournament ID is required.");
      }
  
      const rows = await db.collection('tournament_players').find({ tournament_id: new ObjectId(tournamentId) }).toArray();
      if (rows.length === 0) {
          console.log('No players found for rankings:', tournamentId);
          return utils.renderDashboard('coordinator/rankings', req, res, { rankings: [], tournamentId });
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
      utils.renderDashboard('coordinator/rankings', req, res, { rankings, tournamentId });
  } else if (subpage === 'coordinator_profile') {
    if (!req.session.userEmail) {
      console.log('Coordinator profile failed: User not logged in');
      return res.redirect("/?error-message=Please log in");
    }
    const coordinator = await db.collection('users').findOne({ email: req.session.userEmail, role: 'coordinator' });
    if (!coordinator) {
      console.log('Coordinator profile failed: Coordinator not found:', req.session.userEmail);
      return res.redirect("/coordinator/coordinator_dashboard?error-message=Coordinator not found");
    }
    console.log('Coordinator profile loaded for:', coordinator.email);
    utils.renderDashboard('coordinator/coordinator_profile', req, res, { coordinator });
  } else {
    console.log('Coordinator subpage not found:', subpage);
    res.redirect('/coordinator/coordinator_dashboard?error-message=Page not found');
  }
});

module.exports = router;