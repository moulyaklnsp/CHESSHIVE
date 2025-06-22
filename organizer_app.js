const express = require('express');
const router = express.Router();
const { connectDB } = require('./routes/databasecongi');
const moment = require('moment');
const utils = require('./utils');

router.get('/:subpage?', async (req, res) => {
  const subpage = req.params.subpage || 'organizer_dashboard';

  const db = await connectDB();
  if (subpage === 'organizer_dashboard') {
    const threeDaysLater = moment().add(3, 'days').toDate();
    const meetings = await db.collection('meetingsdb').find({ date: { $lte: threeDaysLater } }).toArray();
    console.log('Organizer dashboard loaded:', { meetingCount: meetings.length });
    utils.renderDashboard('organizer/organizer_dashboard', req, res, { meetings });
  } else if (subpage === 'organizer_tournament') {
    const tournaments = await db.collection('tournaments').find().toArray();
    console.log('Organizer tournaments loaded:', { tournamentCount: tournaments.length });
    utils.renderDashboard('organizer/organizer_tournament', req, res, { tournaments: tournaments || [] });
  } else if (subpage === 'coordinator_management') {
    const coordinators = await db.collection('users').find({ role: 'coordinator', isDeleted: 0 }).project({ name: 1, email: 1, college: 1 }).toArray();
    console.log('Coordinator management loaded:', { coordinatorCount: coordinators.length });
    utils.renderDashboard('organizer/coordinator_management', req, res, { coordinators });
  } else if (subpage === 'store_monitoring') {
    const products = await db.collection('products').find().toArray();
    const sales = await db.collection('sales').aggregate([
      { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { product: '$product.name', price: 1, coordinator: '$product.coordinator', college: 1, buyer: 1, purchase_date: 1 } }
    ]).toArray();
    console.log('Store monitoring loaded:', { productCount: products.length, saleCount: sales.length });
    utils.renderDashboard('organizer/store_monitoring', req, res, { products, sales });
  } else if (subpage === 'meetings') {
    const yetToHost = await db.collection('meetingsdb').find({ role: 'organizer' }).sort({ date: 1, time: 1 }).toArray();
    const upcoming = await db.collection('meetingsdb').find({ name: { $ne: req.session.username } }).sort({ date: 1, time: 1 }).toArray();
    console.log('Organizer meetings loaded:', { yetToHostCount: yetToHost.length, upcomingCount: upcoming.length });
    utils.renderDashboard('organizer/meetings', req, res, { organizermeetings: yetToHost, upcomingMeetings: upcoming });
  } else if (subpage === 'organizer_profile') {
    if (!req.session.userEmail) {
      console.log('Organizer profile failed: User not logged in');
      return res.redirect("/?error-message=Please log in");
    }
    const organizer = await db.collection('users').findOne({ email: req.session.userEmail, role: 'organizer' });
    if (!organizer) {
      console.log('Organizer profile failed: Organizer not found:', req.session.userEmail);
      return res.redirect("/organizer/organizer_dashboard?error-message=Organizer not found");
    }
    console.log('Organizer profile loaded for:', organizer.email);
    utils.renderDashboard('organizer/organizer_profile', req, res, { organizer });
  } else if (subpage === 'college_stats') {
    const data = {
      collegePerformance: [
        { college: "IIIT Hyderabad", tournaments: 10, wins: 6, losses: 3, draws: 1 },
        { college: "IIIT Kurnool", tournaments: 8, wins: 5, losses: 2, draws: 1 },
        { college: "IIIT Gwalior", tournaments: 12, wins: 7, losses: 4, draws: 1 }
      ],
      tournamentRecords: [
        { name: "Spring Invitational", college: "IIIT Hyderabad", format: "Classical", position: 1, date: "2025-03-15" },
        { name: "Classic", college: "IIIT Kurnool", format: "Classical", position: 3, date: "2025-03-10" },
        { name: "Chess Blitz", college: "IIIT Kurnool", format: "Rapid", position: 1, date: "2025-04-15" },
        { name: "Chess Champs", college: "IIIT Gwalior", format: "Blitz", position: 1, date: "2025-03-19" },
        { name: "Rapid Challenge", college: "IIIT Hyderabad", format: "Rapid", position: 2, date: "2025-04-10" },
        { name: "Blitz Masters", college: "IIIT Hyderabad", format: "Blitz", position: 3, date: "2025-05-20" }
      ],
      topCollegesByFormat: { 
        classical: ["IIIT Hyderabad", "IIIT Delhi", "IIIT Kurnool"], 
        rapid: ["IIIT Kurnool", "IIIT Hyderabad", "IIIT Kancheepuram"], 
        blitz: ["IIIT Gwalior", "IIIT Kottayam", "IIIT Hyderabad"] 
      }
    };
    console.log('College stats loaded (static data)');
    utils.renderDashboard('organizer/college_stats', req, res, data);
  } else {
    console.log('Organizer subpage not found:', subpage);
    res.redirect('/organizer/organizer_dashboard?error-message=Page not found');
  }
});

module.exports = router;