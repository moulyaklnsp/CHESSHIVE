const express = require('express');
const router = express.Router();
const db = require('./routes/databasecongi');
const moment = require('moment');
const utils = require('./utils');

// Single route handler with if-else statements
router.get('/:subpage?', (req, res) => {
  const subpage = req.params.subpage || 'admin_dashboard';
  const adminName = req.session.username || "Admin";

  if (subpage === 'admin_dashboard') {
    const threeDaysLater = moment().add(3, 'days').format('YYYY-MM-DD');
    db.all("SELECT * FROM meetingsdb WHERE role = 'admin' AND date <= ?", [threeDaysLater], (err1, meetings) => {
      if (err1) {
        console.error("❌ Error fetching meetings:", err1);
        return res.status(500).send("Internal Server Error");
      }
      db.all("SELECT * FROM contact ORDER BY submission_date DESC", [], (err2, contactMessages) => {
        if (err2) {
          console.error("❌ Error fetching contact messages:", err2);
          return utils.renderDashboard('admin/admin_dashboard', req, res, {
            adminName,
            meetings,
            contactMessages: [],
            errorMessage: "Error fetching contact messages"
          });
        }
        utils.renderDashboard('admin/admin_dashboard', req, res, {
          adminName,
          meetings,
          contactMessages
        });
      });
    });
  }
  else if (subpage === 'admin_tournament_management') {
    db.all(
      `SELECT 
          t.id, 
          t.name, 
          t.date, 
          t.location, 
          t.entry_fee, 
          t.type,
          CASE 
              WHEN date(t.date) < date('now') THEN 'Completed'
              WHEN date(t.date) = date('now') THEN 'Running'
              ELSE 'Yet to Start'
          END AS status,
          CASE 
              WHEN t.type = 'Individual' THEN COUNT(tp.id)
              WHEN t.type = 'Team' THEN (
                  SELECT COUNT(*) * 4 
                  FROM enrolledtournaments_team et 
                  WHERE et.tournament_id = t.id 
                  AND et.approved = 1
              )
              ELSE 0
          END AS player_count
       FROM tournaments t 
       LEFT JOIN tournament_players tp ON t.id = tp.tournament_id AND t.type = 'Individual'
       GROUP BY t.id, t.name, t.date, t.location, t.entry_fee, t.type`,
      [],
      (err, tournaments) => {
        if (err) {
          return res.redirect("/admin/admin_dashboard?error-message=Database Error");
        }
        utils.renderDashboard("admin/admin_tournament_management", req, res, { tournaments: tournaments || [] });
      }
    );
}
  else if (subpage === 'organizer_management') {
    db.all(
      "SELECT name, email, college FROM users WHERE role = 'organizer' AND isDeleted = 0",
      [],
      (err, rows) => {
        if (err) {
          return res.redirect("/admin/admin_dashboard?error-message=Database Error");
        }
        utils.renderDashboard('admin/organizer_management', req, res, { organizers: rows });
      }
    );
  }
  else if (subpage === 'coordinator_management') {
    db.all(
      "SELECT name, email, college FROM users WHERE role = 'coordinator' AND isDeleted = 0",
      [],
      (err, rows) => {
        if (err) {
          return res.redirect("/admin/admin_dashboard?error-message=Database Error");
        }
        utils.renderDashboard('admin/coordinator_management', req, res, { coordinators: rows });
      }
    );
  }
  else if (subpage === 'admin_meetings') {
    db.all(
      "SELECT * FROM meetingsdb WHERE role='admin' ORDER BY date, time",
      [],
      (err, results) => {
        if (err) {
          return res.status(500).send("Database error");
        }
        utils.renderDashboard('admin/admin_meetings', req, res, { adminmeetings: results });
      }
    );
  }
  else if (subpage === 'payments') {
    const sql = `
      SELECT u.name AS name, s.plan, s.start_date
      FROM subscriptionstable s
      INNER JOIN users u ON s.username = u.email
      WHERE u.isDeleted = 0;
    `;
    db.all(sql, [], (err, players) => {
      if (err) {
        return utils.renderDashboard('admin/payments', req, res, { players: [] });
      }
      utils.renderDashboard('admin/payments', req, res, { players });
    });
  }
  else if (subpage === 'admin_profile') {
    if (!req.session.userEmail) {
      return res.redirect("/?error-message=Please log in");
    }
    const query = "SELECT name, email, college FROM users WHERE email = ? AND role = 'admin'";
    db.get(query, [req.session.userEmail], (err, row) => {
      if (err) {
        return res.redirect("/admin/admin_dashboard?error-message=Database Error");
      }
      if (!row) {
        return res.redirect("/admin/admin_dashboard?error-message=Admin not found");
      }
      utils.renderDashboard('admin/admin_profile', req, res, { admin: row });
    });
  }
  else {
    // Handle unknown subpages
    res.redirect('/admin/admin_dashboard?error-message=Page not found');
  }
});

module.exports = router;