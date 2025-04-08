const express = require('express');
const router = express.Router();
const db = require('./routes/databasecongi');
const moment = require('moment');
const utils = require('./utils');

// Single route handler with if-else statements
router.get('/:subpage?', (req, res) => {
  const subpage = req.params.subpage || 'organizer_dashboard';

  if (subpage === 'organizer_dashboard') {
    const threeDaysLater = moment().add(3, 'days').format('YYYY-MM-DD');
    db.all("SELECT * FROM meetingsdb WHERE date <= ?", [threeDaysLater], (err, meetings) => {
      if (err) {
        console.error("❌ Error fetching meetings:", err);
        return res.status(500).send("Internal Server Error");
      }
      utils.renderDashboard('organizer/organizer_dashboard', req, res, { meetings });
    });
  }
  else if (subpage === 'organizer_tournament') {
    db.all("SELECT * FROM tournaments", [], (err, tournaments) => {
      if (err) {
        return res.redirect("/organizer/organizer_dashboard?error-message=Database Error");
      }
      utils.renderDashboard('organizer/organizer_tournament', req, res, { tournaments: tournaments || [] });
    });
  }
  else if (subpage === 'coordinator_management') {
    db.all(
      "SELECT name, email, college FROM users WHERE role = 'coordinator' AND isDeleted = 0",
      [],
      (err, rows) => {
        if (err) {
          return res.redirect("/organizer/organizer_dashboard?error-message=Database Error");
        }
        utils.renderDashboard('organizer/coordinator_management', req, res, { coordinators: rows });
      }
    );
  }
  else if (subpage === 'store_monitoring') {
    const productsQuery = "SELECT id, name, price, coordinator, college, image_url FROM products";
    const salesQuery = "SELECT p.name AS product, p.price, p.coordinator, s.college AS college, s.buyer, s.purchase_date FROM sales s JOIN products p ON s.product_id = p.id";
    db.all(productsQuery, [], (err, products) => {
      if (err) {
        return res.status(500).send("Error fetching products.");
      }
      db.all(salesQuery, [], (err, sales) => {
        if (err) {
          return res.status(500).send("Error fetching sales.");
        }
        utils.renderDashboard('organizer/store_monitoring', req, res, { products, sales });
      });
    });
  }
  else if (subpage === 'meetings') {
    db.all(
      "SELECT * FROM meetingsdb WHERE role='organizer' ORDER BY date, time",
      [],
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
            utils.renderDashboard('organizer/meetings', req, res, {
              organizermeetings: yetToHost,
              upcomingMeetings: upcoming
            });
          }
        );
      }
    );
  }
  else if (subpage === 'organizer_profile') {
    if (!req.session.userEmail) {
      return res.redirect("/?error-message=Please log in");
    }
    const query = "SELECT name, email, college FROM users WHERE email = ? AND role = 'organizer'";
    db.get(query, [req.session.userEmail], (err, row) => {
      if (err) {
        return res.redirect("/organizer/organizer_dashboard?error-message=Database Error");
      }
      if (!row) {
        return res.redirect("/organizer/organizer_dashboard?error-message=Organizer not found");
      }
      utils.renderDashboard('organizer/organizer_profile', req, res, { organizer: row });
    });
  }
  else if (subpage === 'college_stats') {
    const data = {};
    
    // College performance data
    data.collegePerformance = [
      {
        college: "IIIT Hyderabad",
        tournaments: 10,
        wins: 6,
        losses: 3,
        draws: 1,
      },
      { 
        college: "IIIT Kurnool", 
        tournaments: 8, 
        wins: 5, 
        losses: 2, 
        draws: 1 
      },
      {
        college: "IIIT Gwalior",
        tournaments: 12,
        wins: 7,
        losses: 4,
        draws: 1,
      },
    ];

    // Tournament records
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

    // Top colleges by format
    data.topCollegesByFormat = {
      classical: ["IIIT Hyderabad", "IIIT Delhi", "IIIT Kurnool"],
      rapid: ["IIIT Kurnool", "IIIT Hyderabad", "IIIT Kancheepuram"],
      blitz: ["IIIT Gwalior", "IIIT Kottayam", "IIIT Hyderabad"],
    };

    try {
      utils.renderDashboard('organizer/college_stats', req, res, data);
    } catch (err) {
      console.error("❌ Error rendering college stats:", err);
      res.redirect('/organizer/organizer_dashboard?error-message=Page not found: college_stats');
    }
  }
  else {
    res.redirect('/organizer/organizer_dashboard?error-message=Page not found');
  }
});

module.exports = router;