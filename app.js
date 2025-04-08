const express = require('express');
const path = require('path');
const session = require('express-session');
const authrouter = require('./routes/auth');
const db = require('./routes/databasecongi');
const adminRouter = require('./admin_app');
const organizerRouter = require('./organizer_app');
const coordinatorRouter = require('./coordinator_app');
const playerRouter = require('./player_app');
const utils = require('./utils');

const app = express();
const PORT = 3000;

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(authrouter);

// Role Middleware
const isAdmin = (req, res, next) => {
  if (req.session.userRole === 'admin') {
    next();
  } else {
    res.status(403).send('Unauthorized');
  }
};

const isOrganizer = (req, res, next) => {
  if (req.session.userRole === 'organizer') {
    next();
  } else {
    res.status(403).send('Unauthorized');
  }
};

const isCoordinator = (req, res, next) => {
  if (req.session.userRole === 'coordinator') {
    next();
  } else {
    res.status(403).send('Unauthorized');
  }
};

const isPlayer = (req, res, next) => {
  if (req.session.userRole === 'player') {
    next();
  } else {
    res.status(403).send('Unauthorized');
  }
};

const isAdminOrOrganizer = (req, res, next) => {
  if (req.session.userRole === 'admin' || req.session.userRole === 'organizer') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Unauthorized' });
  }
};

// Mount Role-Specific Routers
app.use('/admin', isAdmin, adminRouter);
app.use('/organizer', isOrganizer, organizerRouter);
app.use('/coordinator', isCoordinator, coordinatorRouter);
app.use('/player', isPlayer, playerRouter);

// Common Routes
app.get('/', (req, res) => {
  res.render('index', utils.getMessages(req));
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get(
    'SELECT * FROM users WHERE email = ? AND password = ?',
    [email, password],
    (err, user) => {
      if (err) {
        return res.redirect('/?error-message=Database Error');
      }
      if (!user) {
        return res.redirect('/login?error-message=Invalid credentials');
      }
      if (user.isDeleted) {
        return res.redirect(`/login?error-message=Account has been deleted&deletedUserId=${user.id}`);
      }
      req.session.userID = user.id;
      req.session.userEmail = user.email;
      req.session.userRole = user.role;
      req.session.username = user.name;
      req.session.playerName = user.name;
      req.session.userCollege = user.college;
      req.session.collegeName = user.college;
      switch (user.role) {
        case 'admin':
          return res.redirect('/admin/admin_dashboard?success-message=Admin Login Successful');
        case 'organizer':
          return res.redirect('/organizer/organizer_dashboard?success-message=Organizer Login Successful');
        case 'coordinator':
          return res.redirect('/coordinator/coordinator_dashboard?success-message=Coordinator Login Successful');
        case 'player':
          return res.redirect('/player/player_dashboard?success-message=Player Login Successful');
        default:
          return res.redirect('/?error-message=Invalid Role');
      }
    }
  );
});

app.post('/player/restore/:id', (req, res) => {
  const { id } = req.params;
  db.run(
    'UPDATE users SET isDeleted = 0 WHERE id = ? AND role = "player"',
    [id],
    function (err) {
      if (err) {
        return res.redirect('/login?error-message=Database Error');
      }
      if (this.changes === 0) {
        return res.redirect('/login?error-message=Player not found');
      }
      res.redirect('/login?success-message=Account restored successfully');
    }
  );
});

app.delete('/coordinators/remove/:email', isAdminOrOrganizer, (req, res) => {
  const { email } = req.params;
  db.run(
    'DELETE FROM users WHERE email = ? AND role = "coordinator"',
    [email],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database Error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: 'Coordinator not found' });
      }
      res.json({ success: true, message: 'Coordinator removed successfully' });
    }
  );
});

app.delete('/organizers/remove/:email', isAdmin, (req, res) => {
  const { email } = req.params;
  db.run(
    'DELETE FROM users WHERE email = ? AND role = "organizer"',
    [email],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database Error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: 'Organizer not found' });
      }
      res.json({ success: true, message: 'Organizer removed successfully' });
    }
  );
});

app.get('/:page', (req, res) => {
  const { page } = req.params;
  if (['admin_dashboard', 'organizer_dashboard', 'coordinator_dashboard', 'player_dashboard'].includes(page)) {
    return res.redirect(`/${page}`);
  }
  try {
    const messages = utils.getMessages(req);
    res.render(page, { ...messages, deletedUserId: req.query.deletedUserId || null });
  } catch (err) {
    res.status(404).send(`Page not found: ${page}`);
  }
});

// Error Handling
app.use((req, res) => {
  res.status(404).redirect('/?error-message=Page not found');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});