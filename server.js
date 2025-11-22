const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

(async () => {
  const db = await open({
    filename: './faapp.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      coins INTEGER DEFAULT 500
    );
    CREATE TABLE IF NOT EXISTS trees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      price INTEGER
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      tree_id INTEGER
    );
  `);

  await db.run(`
    INSERT OR IGNORE INTO trees (id, name, price)
    VALUES (1, 'Tölgy', 100), (2, 'Juhar', 80), (3, 'Nyár', 60)
  `);

  // Új felhasználó
  app.post('/users', async (req, res) => {
    const { name } = req.body;
    const result = await db.run('INSERT INTO users (name, coins) VALUES (?, ?)', [name, 500]);
    res.json({ id: result.lastID, name, coins: 500 });
  });

  // Felhasználó lekérdezése
  app.get('/users/:id', async (req, res) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található' });
    const count = await db.get('SELECT COUNT(*) as trees FROM orders WHERE user_id = ?', [req.params.id]);
    res.json({ ...user, trees: count.trees });
  });

  // Fa vásárlás
  app.post('/users/:id/buy/:treeId', async (req, res) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    const tree = await db.get('SELECT * FROM trees WHERE id = ?', [req.params.treeId]);

    if (!user || !tree) return res.status(404).json({ error: 'Felhasználó vagy fa nem található' });
    if (user.coins < tree.price) return res.status(400).json({ error: 'Nincs elég coin' });

    await db.run('UPDATE users SET coins = coins - ? WHERE id = ?', [tree.price, user.id]);
    await db.run('INSERT INTO orders (user_id, tree_id) VALUES (?, ?)', [user.id, tree.id]);

    const count = await db.get('SELECT COUNT(*) as trees FROM orders WHERE user_id = ?', [user.id]);
    const updated = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({ ok: true, coins: updated.coins, trees: count.trees });
  });

  // Coin vásárlás
  app.post('/users/:id/add-coins/:amount', async (req, res) => {
    const id = Number(req.params.id);
    const amount = Math.max(0, Number(req.params.amount) || 0);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található' });
    await db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [amount, id]);
    const updated = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    res.json({ ok: true, coins: updated.coins });
  });

  // Rangsor
  app.get('/leaderboard', async (req, res) => {
    const rows = await db.all(`
      SELECT u.id, u.name, u.coins, COUNT(o.id) AS trees
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id
      ORDER BY trees DESC, u.name ASC
    `);
    res.json(rows);
  });

  app.listen(3000, () => {
    console.log('Backend fut: http://localhost:3000');
  });
})();
