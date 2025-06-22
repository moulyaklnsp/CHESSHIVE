const express = require('express');
const router = express.Router();
const { connectDB } = require('./routes/databasecongi');
const moment = require('moment');
const utils = require('./utils');

router.get('/:subpage?', async (req, res) => {
  const subpage = req.params.subpage || 'admin_dashboard';
  const adminName = req.session.username || "Admin";

  const db = await connectDB();
  if (subpage === 'admin_dashboard') {
    const threeDaysLater = moment().add(3, 'days').toDate();
    const meetings = await db.collection('meetingsdb').find({ role: 'admin', date: { $lte: threeDaysLater } }).toArray();
    const contactMessages = await db.collection('contact').find().sort({ submission_date: -1 }).toArray();
    console.log('Admin dashboard loaded:', { meetingsCount: meetings.length, messagesCount: contactMessages.length });
    utils.renderDashboard('admin/admin_dashboard', req, res, { adminName, meetings, contactMessages });
  } else if (subpage === 'admin_tournament_management') {
    const tournaments = await db.collection('tournaments').aggregate([
      {
        $match: {
          status: "Approved" // Filters for tournaments with status "approved"
        }
      },
      {
        $lookup: {
          from: 'tournament_players',
          localField: '_id',
          foreignField: 'tournament_id',
          as: 'players'
        }
      },
      {
        $lookup: {
          from: 'enrolledtournaments_team',
          localField: '_id',
          foreignField: 'tournament_id',
          as: 'enrolledTeams'
        }
      },
      {
        $project: {
          name: 1,
          date: 1,
          location: 1,
          entry_fee: 1,
          type: 1,
          status: 1, // Preserve the original status (e.g., "approved")
          current_state: { // New field for date-based status
            $cond: {
              if: { $lt: ['$date', new Date()] },
              then: 'Completed',
              else: {
                $cond: {
                  if: { $eq: ['$date', new Date()] },
                  then: 'Running',
                  else: 'Yet to Start'
                }
              }
            }
          },
          player_count: {
            $cond: {
              if: { $eq: ['$type', 'Individual'] },
              then: { $size: { $ifNull: ['$players', []] } },
              else: {
                $multiply: [
                  4,
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ['$enrolledTeams', []] },
                        as: 'team',
                        cond: { $eq: ['$$team.approved', 1] }
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    ]).toArray();    
    console.log('Tournament management loaded:', { tournamentCount: tournaments.length });
    utils.renderDashboard('admin/admin_tournament_management', req, res, { tournaments: tournaments || [] });
  } else if (subpage === 'organizer_management') {
    const organizers = await db.collection('users').find({ role: 'organizer', isDeleted: 0 }).project({ name: 1, email: 1, college: 1 }).toArray();
    console.log('Organizer management loaded:', { organizerCount: organizers.length });
    utils.renderDashboard('admin/organizer_management', req, res, { organizers });
  } else if (subpage === 'coordinator_management') {
    const coordinators = await db.collection('users').find({ role: 'coordinator', isDeleted: 0 }).project({ name: 1, email: 1, college: 1 }).toArray();
    console.log('Coordinator management loaded:', { coordinatorCount: coordinators.length });
    utils.renderDashboard('admin/coordinator_management', req, res, { coordinators });
  } else if (subpage === 'admin_meetings') {
    const adminmeetings = await db.collection('meetingsdb').find({ role: 'admin' }).sort({ date: 1, time: 1 }).toArray();
    console.log('Admin meetings loaded:', { meetingCount: adminmeetings.length });
    utils.renderDashboard('admin/admin_meetings', req, res, { adminmeetings });
  }else if (subpage === 'payments') {
    // Fetch subscription data
    const players = await db.collection('subscriptionstable').aggregate([
        { $lookup: { from: 'users', localField: 'username', foreignField: 'email', as: 'user' } },
        { $unwind: '$user' },
        { $match: { 'user.isDeleted': 0 } },
        { $project: { name: '$user.name', plan: 1, start_date: 1 } }
    ]).toArray();

    // Fetch product sales data
    const sales = await db.collection('sales').aggregate([
        { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $project: { product: '$product.name', price: 1, coordinator: '$product.coordinator', college: 1, buyer: 1, purchase_date: 1 } }
    ]).toArray();

    // Fetch tournament sales data (individual and team enrollments)
    const tournamentSales = await db.collection('tournaments').aggregate([
        // Lookup individual tournament enrollments
        {
            $lookup: {
                from: 'tournament_players',
                localField: '_id',
                foreignField: 'tournament_id',
                as: 'individual_enrollments'
            }
        },
        // Lookup team tournament enrollments (only approved teams)
        {
            $lookup: {
                from: 'enrolledtournaments_team',
                localField: '_id',
                foreignField: 'tournament_id',
                as: 'team_enrollments'
            }
        },
        // Project relevant fields and compute enrollments
        {
            $project: {
                name: 1,
                entry_fee: 1,
                type: 1,
                date: 1,
                individual_enrollments: {
                    $size: '$individual_enrollments'
                },
                team_enrollments: {
                    $size: {
                        $filter: {
                            input: '$team_enrollments',
                            as: 'team',
                            cond: { $eq: ['$$team.approved', 1] }
                        }
                    }
                }
            }
        },
        // Unwind to handle both individual and team tournaments
        {
            $facet: {
                individual: [
                    { $match: { type: 'Individual', individual_enrollments: { $gt: 0 } } },
                    {
                        $project: {
                            name: 1,
                            entry_fee: 1,
                            type: 1,
                            total_enrollments: '$individual_enrollments',
                            revenue: { $multiply: ['$entry_fee', '$individual_enrollments'] },
                            enrollment_date: '$date' // Use tournament date as fallback
                        }
                    }
                ],
                team: [
                    { $match: { type: 'Team', team_enrollments: { $gt: 0 } } },
                    {
                        $lookup: {
                            from: 'enrolledtournaments_team',
                            localField: '_id',
                            foreignField: 'tournament_id',
                            as: 'team_enrollments'
                        }
                    },
                    { $unwind: '$team_enrollments' },
                    { $match: { 'team_enrollments.approved': 1 } },
                    {
                        $group: {
                            _id: '$_id',
                            name: { $first: '$name' },
                            entry_fee: { $first: '$entry_fee' },
                            type: { $first: '$type' },
                            total_enrollments: { $sum: 1 },
                            enrollment_dates: { $push: '$team_enrollments.enrollment_date' }
                        }
                    },
                    {
                        $project: {
                            name: 1,
                            entry_fee: 1,
                            type: 1,
                            total_enrollments: 1,
                            revenue: { $multiply: ['$entry_fee', '$total_enrollments'] },
                            enrollment_date: { $arrayElemAt: ['$enrollment_dates', 0] } // Use earliest enrollment date
                        }
                    }
                ]
            }
        },
        // Combine individual and team results
        {
            $project: {
                combined: { $concatArrays: ['$individual', '$team'] }
            }
        },
        { $unwind: '$combined' },
        { $replaceRoot: { newRoot: '$combined' } },
        // Sort by enrollment_date descending
        { $sort: { enrollment_date: -1 } }
    ]).toArray();

    console.log('Payments loaded:', { playerCount: players.length, salesCount: sales.length, tournamentSalesCount: tournamentSales.length });
    utils.renderDashboard('admin/payments', req, res, { players, sales, tournamentSales });
}else if (subpage === 'admin_profile') {
    if (!req.session.userEmail) {
      console.log('Admin profile failed: User not logged in');
      return res.redirect("/?error-message=Please log in");
    }
    const admin = await db.collection('users').findOne({ email: req.session.userEmail, role: 'admin' });
    if (!admin) {
      console.log('Admin profile failed: Admin not found:', req.session.userEmail);
      return res.redirect("/admin/admin_dashboard?error-message=Admin not found");
    }
    console.log('Admin profile loaded for:', admin.email);
    utils.renderDashboard('admin/admin_profile', req, res, { admin });
  } else {
    console.log('Admin subpage not found:', subpage);
    res.redirect('/admin/admin_dashboard?error-message=Page not found');
  }
});

module.exports = router;