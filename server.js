const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const { run, get, all, init } = require('./database');

const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 12;

// Trust Render/Railway reverse proxy so secure cookies work over HTTPS
app.set('trust proxy', 1);

// Middleware
app.use(express.json());

app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: process.env.DATA_DIR || __dirname
  }),
  secret: process.env.SESSION_SECRET || 'daily-tracker-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── AUTH ROUTES ────────────────────────────────────────────────────────────

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (username.trim().length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters.' });
  }
  if (/\s/.test(username.trim())) {
    return res.status(400).json({ error: 'Username cannot contain spaces.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const existingUser = await get(
      'SELECT id FROM users WHERE username = ?',
      [username.trim()]
    );
    if (existingUser) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await run(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username.trim(), hashedPassword]
    );

    req.session.userId = result.lastID;
    req.session.username = username.trim();

    return res.status(201).json({ id: result.lastID, username: username.trim() });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = await get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    return res.json({ id: user.id, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out successfully.' });
  });
});

// GET /api/auth/me
app.get('/api/auth/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  try {
    const user = await get('SELECT id, username FROM users WHERE id = ?', [req.session.userId]);
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── TASK ROUTES ─────────────────────────────────────────────────────────────

// GET /api/tasks
app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const tasks = await all(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );
    return res.json(tasks);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load tasks.' });
  }
});

// POST /api/tasks
app.post('/api/tasks', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Task text is required.' });
  }
  try {
    const result = await run(
      'INSERT INTO tasks (user_id, text) VALUES (?, ?)',
      [req.session.userId, text.trim()]
    );
    const task = await get('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
    return res.status(201).json(task);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create task.' });
  }
});

// PATCH /api/tasks/:id
app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const { done } = req.body;
  const taskId = parseInt(req.params.id, 10);

  try {
    const task = await get(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, req.session.userId]
    );
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    await run(
      'UPDATE tasks SET done = ? WHERE id = ? AND user_id = ?',
      [done ? 1 : 0, taskId, req.session.userId]
    );
    const updated = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update task.' });
  }
});

// DELETE /api/tasks/:id
app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  try {
    const task = await get(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, req.session.userId]
    );
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    await run(
      'DELETE FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, req.session.userId]
    );
    return res.json({ message: 'Task deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// ─── EXPENSE ROUTES ──────────────────────────────────────────────────────────

// GET /api/expenses
app.get('/api/expenses', requireAuth, async (req, res) => {
  try {
    const expenses = await all(
      'SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC',
      [req.session.userId]
    );

    const totalRow = await get(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ?',
      [req.session.userId]
    );
    const total = totalRow ? totalRow.total : 0;

    const monthsRow = await get(
      "SELECT COUNT(DISTINCT strftime('%Y-%m', date)) as months FROM expenses WHERE user_id = ?",
      [req.session.userId]
    );
    const distinctMonths = monthsRow ? monthsRow.months : 0;
    const monthlyAverage = distinctMonths > 0 ? total / distinctMonths : 0;

    return res.json({ expenses, total, monthlyAverage });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load expenses.' });
  }
});

// POST /api/expenses
app.post('/api/expenses', requireAuth, async (req, res) => {
  const { amount, category, description, date } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'A valid positive amount is required.' });
  }
  if (!category || category.trim().length === 0) {
    return res.status(400).json({ error: 'Category is required.' });
  }
  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }

  try {
    const result = await run(
      'INSERT INTO expenses (user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, parseFloat(amount), category.trim(), description ? description.trim() : null, date]
    );
    const expense = await get('SELECT * FROM expenses WHERE id = ?', [result.lastID]);
    return res.status(201).json(expense);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create expense.' });
  }
});

// DELETE /api/expenses/:id
app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  const expenseId = parseInt(req.params.id, 10);
  try {
    const expense = await get(
      'SELECT * FROM expenses WHERE id = ? AND user_id = ?',
      [expenseId, req.session.userId]
    );
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    await run(
      'DELETE FROM expenses WHERE id = ? AND user_id = ?',
      [expenseId, req.session.userId]
    );
    return res.json({ message: 'Expense deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete expense.' });
  }
});

// ─── BUDGET ROUTES ───────────────────────────────────────────────────────────

// GET /api/budgets
app.get('/api/budgets', requireAuth, async (req, res) => {
  try {
    const budgets = await all(
      'SELECT * FROM budgets WHERE user_id = ? ORDER BY created_at ASC',
      [req.session.userId]
    );
    return res.json(budgets);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load budgets.' });
  }
});

// POST /api/budgets
app.post('/api/budgets', requireAuth, async (req, res) => {
  const { item, amount } = req.body;
  if (!item || item.trim().length === 0) {
    return res.status(400).json({ error: 'Item name is required.' });
  }
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'A valid positive amount is required.' });
  }
  try {
    const result = await run(
      'INSERT INTO budgets (user_id, item, amount) VALUES (?, ?, ?)',
      [req.session.userId, item.trim(), parseFloat(amount)]
    );
    const budget = await get('SELECT * FROM budgets WHERE id = ?', [result.lastID]);
    return res.status(201).json(budget);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create budget item.' });
  }
});

// DELETE /api/budgets/:id
app.delete('/api/budgets/:id', requireAuth, async (req, res) => {
  const budgetId = parseInt(req.params.id, 10);
  try {
    const budget = await get(
      'SELECT * FROM budgets WHERE id = ? AND user_id = ?',
      [budgetId, req.session.userId]
    );
    if (!budget) return res.status(404).json({ error: 'Budget item not found.' });
    await run('DELETE FROM budgets WHERE id = ? AND user_id = ?', [budgetId, req.session.userId]);
    return res.json({ message: 'Budget item deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete budget item.' });
  }
});

// ─── CATCH-ALL ────────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

init().then(() => {
  app.listen(PORT, () => {
    console.log(`DailyTracker running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
