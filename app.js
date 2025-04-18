const express = require('express');
const path = require('path');
const session = require('express-session');
const authrouter = require('./routes/auth');
const { connectDB } = require('./routes/databasecongi');
const adminRouter = require('./admin_app');
const organizerRouter = require('./organizer_app');
const coordinatorRouter = require('./coordinator_app');
const playerRouter = require('./player_app');
const utils = require('./utils');
const { ObjectId } = require('mongodb');

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
  if (req.session.userRole === 'admin') next(); 
  else res.status(403).send('Unauthorized'); 
};
const isOrganizer = (req, res, next) => { 
  if (req.session.userRole === 'organizer') next(); 
  else res.status(403).send('Unauthorized'); 
};
const isCoordinator = (req, res, next) => { 
  if (req.session.userRole === 'coordinator') next(); 
  else res.status(403).send('Unauthorized'); 
};
const isPlayer = (req, res, next) => { 
  if (req.session.userRole === 'player') next(); 
  else res.status(403).send('Unauthorized'); 
};
const isAdminOrOrganizer = (req, res, next) => { 
  if (req.session.userRole === 'admin' || req.session.userRole === 'organizer') next(); 
  else res.status(403).json({ success: false, message: 'Unauthorized' }); 
};

// Mount Role-Specific Routers
app.use('/admin', isAdmin, adminRouter);
app.use('/organizer', isOrganizer, organizerRouter);
app.use('/coordinator', isCoordinator, coordinatorRouter);
app.use('/player', isPlayer, playerRouter.router);

// Common Routes
app.get('/', (req, res) => res.render('index', utils.getMessages(req)));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = await connectDB();
  const user = await db.collection('users').findOne({ email, password });
  if (!user) {
    console.log('Login failed: Invalid credentials for', email);
    return res.redirect('/login?error-message=Invalid credentials');
  }
  if (user.isDeleted) {
    console.log('Login failed: Account deleted for', email);
    return res.redirect(`/login?error-message=Account has been deleted&deletedUserId=${user._id}`);
  }
  req.session.userID = user._id;
  req.session.userEmail = user.email;
  req.session.userRole = user.role;
  req.session.username = user.name;
  req.session.playerName = user.name;
  req.session.userCollege = user.college;
  req.session.collegeName = user.college;
  console.log(`User logged in: ${email} as ${user.role}`);
  switch (user.role) {
    case 'admin': return res.redirect('/admin/admin_dashboard?success-message=Admin Login Successful');
    case 'organizer': return res.redirect('/organizer/organizer_dashboard?success-message=Organizer Login Successful');
    case 'coordinator': return res.redirect('/coordinator/coordinator_dashboard?success-message=Coordinator Login Successful');
    case 'player': return res.redirect('/player/player_dashboard?success-message=Player Login Successful');
    default: return res.redirect('/?error-message=Invalid Role');
  }
});

app.post('/player/restore/:id', async (req, res) => {
  const { id } = req.params;
  const db = await connectDB();
  
  try {
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(id), role: 'player' },
      { $set: { isDeleted: 0 } }
    );
    
    if (result.matchedCount === 0) {
      console.log('Restore failed: Player not found:', id);
      return res.redirect('/login?error-message=Player not found');
    }
    
    console.log(`Player account restored: ${id}`);
    res.redirect('/login?success-message=Account restored successfully');
  } catch (err) {
    if (err.code === 121) {
      console.log('Restore failed due to validation error:', err.errInfo);
      return res.redirect('/login?error-message=Account restoration failed due to validation error');
    }
    console.error('Unexpected error:', err);
    res.redirect('/login?error-message=An unexpected error occurred');
  }
});

app.delete('/coordinators/remove/:email', isAdminOrOrganizer, async (req, res) => {
  const { email } = req.params;
  const db = await connectDB();
  const result = await db.collection('users').deleteOne({ email, role: 'coordinator' });
  if (result.deletedCount === 0) {
    console.log('Remove coordinator failed: Not found:', email);
    return res.status(404).json({ success: false, message: 'Coordinator not found' });
  }
  console.log(`Coordinator removed: ${email}`);
  res.json({ success: true, message: 'Coordinator removed successfully' });
});

app.delete('/organizers/remove/:email', isAdmin, async (req, res) => {
  const { email } = req.params;
  const db = await connectDB();
  const result = await db.collection('users').deleteOne({ email, role: 'organizer' });
  if (result.deletedCount === 0) {
    console.log('Remove organizer failed: Not found:', email);
    return res.status(404).json({ success: false, message: 'Organizer not found' });
  }
  console.log(`Organizer removed: ${email}`);
  res.json({ success: true, message: 'Organizer removed successfully' });
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
    console.error('Page render error:', err);
    res.status(404).send(`Page not found: ${page}`);
  }
});

app.use((req, res) => res.status(404).redirect('/?error-message=Page not found'));

connectDB().catch(err => console.error('Database connection failed:', err));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));