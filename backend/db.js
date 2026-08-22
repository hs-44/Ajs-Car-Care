// db.js — SQLite database connection + schema + seed data
// Uses better-sqlite3: synchronous, file-based, zero external server needed.

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'data', 'ajscarcare.db'));
db.pragma('journal_mode = WAL');

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer', -- 'customer' | 'admin'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'wash' | 'care'
  price INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_ref TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  car_model TEXT NOT NULL,
  booking_date TEXT NOT NULL,   -- 'YYYY-MM-DD'
  time_slot TEXT NOT NULL,      -- e.g. '10:00 AM'
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  -- pending_payment | confirmed | completed | cancelled
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(service_id) REFERENCES services(id),
  UNIQUE(booking_date, time_slot) -- prevents double-booking the same slot
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  status TEXT NOT NULL DEFAULT 'created', -- created | paid | failed
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(booking_id) REFERENCES bookings(id)
);
`);

// ---------- Seed default services (only if table empty) ----------
const serviceCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
if (serviceCount === 0) {
  const insert = db.prepare(
    'INSERT INTO services (name, category, price) VALUES (?, ?, ?)'
  );
  const seed = db.transaction((rows) => {
    for (const row of rows) insert.run(row.name, row.category, row.price);
  });
  seed([
    { name: 'Full Wash', category: 'wash', price: 449 },
    { name: 'Body Wash Only', category: 'wash', price: 249 },
    { name: 'Interior Detailing', category: 'wash', price: 1499 },
    { name: 'Monthly Wash Plan', category: 'wash', price: 1699 },
    { name: 'Polishing & Paint Correction', category: 'care', price: 2999 },
    { name: 'Paint Protection Film (PPF)', category: 'care', price: 45000 },
    { name: 'Ceramic Coating', category: 'care', price: 12999 },
    { name: 'Waxing & Sealant', category: 'care', price: 1299 },
  ]);
  console.log('Seeded default services.');
}

// ---------- Seed default admin (only if none exists) ----------
const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
if (adminCount === 0) {
  const defaultEmail = process.env.ADMIN_EMAIL || 'admin@ajscarcare.in';
  const defaultPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const hash = bcrypt.hashSync(defaultPassword, 10);
  db.prepare(
    'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run('Admin', defaultEmail, '9999999999', hash, 'admin');
  console.log(`Seeded default admin account -> email: ${defaultEmail} / password: ${defaultPassword}`);
  console.log('IMPORTANT: change this password after first login.');
}

module.exports = db;
