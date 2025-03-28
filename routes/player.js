const express = require('express');
const router = express.Router();
const Player = require('../models/player');

// Get all players
router.get('/', async (req, res) => {
    try {
        const players = await Player.find();
        res.json(players);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get one player
router.get('/:id', getPlayer, (req, res) => {
    res.json(res.player);
});

// Create one player
router.post('/', async (req, res) => {
    const player = new Player({
        name: req.body.name,
        rating: req.body.rating
    });

    try {
        const newPlayer = await player.save();
        res.status(201).json(newPlayer);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Update one player
router.patch('/:id', getPlayer, async (req, res) => {
    if (req.body.name != null) {
        res.player.name = req.body.name;
    }
    if (req.body.rating != null) {
        res.player.rating = req.body.rating;
    }

    try {
        const updatedPlayer = await res.player.save();
        res.json(updatedPlayer);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete one player
router.delete('/:id', getPlayer, async (req, res) => {
    try {
        await res.player.remove();
        res.json({ message: 'Deleted Player' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/player_tournament', async (req, res) => {
    try {
        const tournaments = await Tournament.findAll(); // Fetch all tournaments
        const enrolledTournaments = await getEnrolledTournaments(req.user.id); // Fetch enrolled tournaments
        res.render('player/player_tournament', {
            tournaments,
            enrolledTournaments,
            walletBalance: req.user.walletBalance,
            currentSubscription: req.user.subscription,
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading tournaments');
    }
});

async function getPlayer(req, res, next) {
    let player;
    try {
        player = await Player.findById(req.params.id);
        if (player == null) {
            return res.status(404).json({ message: 'Cannot find player' });
        }
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }

    res.player = player;
    next();
}

module.exports = router;
