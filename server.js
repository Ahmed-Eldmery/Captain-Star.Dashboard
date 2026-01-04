// server.js
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// هنا
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


const JWT_SECRET = 'super_secret_key_change_this';

// ====== DB SETUP (SQLite) ======
const db = new sqlite3.Database('./dashboard.db');

// إنشاء الجداول لو مش موجودة
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner','admin','user')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logo_url TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      handle TEXT NOT NULL,
      url TEXT NOT NULL,
      label TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  // إنشاء Owner افتراضي لو مفيش يوزرز
  db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
    if (err) {
      console.error('Error counting users', err);
      return;
    }
    if (row.count === 0) {
      const name = 'Owner';
      const email = 'owner@company.com';
      const password = '123456';
      const role = 'owner';
      const password_hash = bcrypt.hashSync(password, 10);
      db.run(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)`,
        [name, email, password_hash, role],
        function (err2) {
          if (err2) {
            console.error('Error creating default owner', err2);
          } else {
            console.log('Default owner created: email=owner@company.com, password=123456');
          }
        }
      );
    }
  });
});

// ====== Middleware ======
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'No token' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Invalid token format' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Token invalid or expired' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

// ====== Auth Routes ======
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(400).json({ message: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token
    });
  });
});

// ====== Users (Owner فقط) ======
app.get('/users', authMiddleware, requireRole(['owner']), (req, res) => {
  db.all(`SELECT id, name, email, role, created_at FROM users`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(rows);
  });
});

app.post('/users', authMiddleware, requireRole(['owner']), (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'Missing fields' });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.run(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)`,
    [name, email, hash, role],
    function (err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json({ id: this.lastID, name, email, role });
    }
  );
});

app.put('/users/:id', authMiddleware, requireRole(['owner']), (req, res) => {
  const { name, email, password, role } = req.body;
  const { id } = req.params;

  db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, user) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const newName = name || user.name;
    const newEmail = email || user.email;
    const newRole = role || user.role;
    let newHash = user.password_hash;

    if (password) {
      newHash = bcrypt.hashSync(password, 10);
    }

    db.run(
      `UPDATE users SET name=?, email=?, password_hash=?, role=? WHERE id=?`,
      [newName, newEmail, newHash, newRole, id],
      function (err2) {
        if (err2) return res.status(500).json({ message: 'DB error' });
        res.json({ id, name: newName, email: newEmail, role: newRole });
      }
    );
  });
});

app.delete('/users/:id', authMiddleware, requireRole(['owner']), (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ success: true });
  });
});

// ====== Clients ======
app.get('/clients', authMiddleware, (req, res) => {
  db.all(
    `SELECT id, name, logo_url, notes, is_active, created_at FROM clients`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json(rows);
    }
  );
});

app.get('/clients/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  db.get(
    `SELECT id, name, logo_url, notes, is_active, created_at FROM clients WHERE id = ?`,
    [id],
    (err, client) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      if (!client) return res.status(404).json({ message: 'Client not found' });

      db.all(
        `SELECT * FROM social_accounts WHERE client_id = ?`,
        [id],
        (err2, accounts) => {
          if (err2) return res.status(500).json({ message: 'DB error' });
          res.json({ client, accounts });
        }
      );
    }
  );
});

app.post('/clients', authMiddleware, requireRole(['owner', 'admin']), (req, res) => {
  const { name, logo_url, notes, is_active = 1 } = req.body;
  if (!name) return res.status(400).json({ message: 'Name required' });

  db.run(
    `INSERT INTO clients (name, logo_url, notes, is_active) VALUES (?,?,?,?)`,
    [name, logo_url || null, notes || null, is_active ? 1 : 0],
    function (err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json({ id: this.lastID, name, logo_url, notes, is_active });
    }
  );
});

app.put('/clients/:id', authMiddleware, requireRole(['owner', 'admin']), (req, res) => {
  const { id } = req.params;
  const { name, logo_url, notes, is_active } = req.body;

  db.get(`SELECT * FROM clients WHERE id = ?`, [id], (err, client) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const newName = name || client.name;
    const newLogo = logo_url !== undefined ? logo_url : client.logo_url;
    const newNotes = notes !== undefined ? notes : client.notes;
    const newActive =
      is_active !== undefined ? (is_active ? 1 : 0) : client.is_active;

    db.run(
      `UPDATE clients SET name=?, logo_url=?, notes=?, is_active=? WHERE id=?`,
      [newName, newLogo, newNotes, newActive, id],
      function (err2) {
        if (err2) return res.status(500).json({ message: 'DB error' });
        res.json({
          id,
          name: newName,
          logo_url: newLogo,
          notes: newNotes,
          is_active: newActive
        });
      }
    );
  });
});

app.delete('/clients/:id', authMiddleware, requireRole(['owner']), (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM clients WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ success: true });
  });
});

// ====== Social Accounts ======
app.get('/social-accounts', authMiddleware, (req, res) => {
  const { platform, client_id, search } = req.query;

  let where = [];
  let params = [];

  if (platform) {
    where.push('platform = ?');
    params.push(platform);
  }
  if (client_id) {
    where.push('client_id = ?');
    params.push(client_id);
  }
  if (search) {
    where.push('(handle LIKE ? OR url LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  db.all(
    `SELECT sa.*, c.name as client_name 
     FROM social_accounts sa 
     JOIN clients c ON c.id = sa.client_id
     ${whereSql}
     ORDER BY c.name`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json(rows);
    }
  );
});

app.post(
  '/clients/:id/social-accounts',
  authMiddleware,
  requireRole(['owner', 'admin']),
  (req, res) => {
    const { id: client_id } = req.params;
    const { platform, handle, url, label, is_active = 1 } = req.body;
    if (!platform || !handle || !url) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    db.run(
      `INSERT INTO social_accounts (client_id, platform, handle, url, label, is_active) 
       VALUES (?,?,?,?,?,?)`,
      [client_id, platform, handle, url, label || null, is_active ? 1 : 0],
      function (err) {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json({
          id: this.lastID,
          client_id,
          platform,
          handle,
          url,
          label,
          is_active
        });
      }
    );
  }
);

app.put(
  '/social-accounts/:id',
  authMiddleware,
  requireRole(['owner', 'admin']),
  (req, res) => {
    const { id } = req.params;
    const { platform, handle, url, label, is_active } = req.body;

    db.get(`SELECT * FROM social_accounts WHERE id = ?`, [id], (err, acc) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      if (!acc) return res.status(404).json({ message: 'Account not found' });

      const newPlatform = platform || acc.platform;
      const newHandle = handle || acc.handle;
      const newUrl = url || acc.url;
      const newLabel = label !== undefined ? label : acc.label;
      const newActive =
        is_active !== undefined ? (is_active ? 1 : 0) : acc.is_active;

      db.run(
        `UPDATE social_accounts 
         SET platform=?, handle=?, url=?, label=?, is_active=? 
         WHERE id=?`,
        [newPlatform, newHandle, newUrl, newLabel, newActive, id],
        function (err2) {
          if (err2) return res.status(500).json({ message: 'DB error' });
          res.json({
            id,
            client_id: acc.client_id,
            platform: newPlatform,
            handle: newHandle,
            url: newUrl,
            label: newLabel,
            is_active: newActive
          });
        }
      );
    });
  }
);

app.delete(
  '/social-accounts/:id',
  authMiddleware,
  requireRole(['owner', 'admin']),
  (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM social_accounts WHERE id = ?`, [id], function (err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json({ success: true });
    });
  }
);

// ====== Start Server ======
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});

app.use(express.static(path.join(__dirname, 'public')));

