// routes/admin.js — admin dashboard endpoints (all require role: admin)

const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/bookings — all bookings, newest first, optional ?status= filter
router.get('/bookings', requireAdmin, (req, res) => {
  const { status, date } = req.query;
  let query = `
    SELECT b.*, s.name AS service_name, s.category, s.price,
           u.name AS customer_name, u.phone, u.email
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    JOIN users u ON u.id = b.user_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND b.status = ?'; params.push(status); }
  if (date) { query += ' AND b.booking_date = ?'; params.push(date); }
  query += ' ORDER BY b.booking_date DESC, b.id DESC';

  const bookings = db.prepare(query).all(...params);
  res.json({ bookings });
});

// PUT /api/admin/bookings/:id/status — mark completed / cancelled / confirmed
router.put('/bookings/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ['pending_payment', 'confirmed', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// GET /api/admin/stats — quick dashboard numbers
router.get('/stats', requireAdmin, (req, res) => {
  const totalBookings = db.prepare('SELECT COUNT(*) AS c FROM bookings').get().c;
  const confirmedToday = db
    .prepare(`SELECT COUNT(*) AS c FROM bookings WHERE booking_date = date('now') AND status IN ('confirmed','completed')`)
    .get().c;
  const revenue = db
    .prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status = 'paid'`)
    .get().total;
  const totalCustomers = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'customer'`).get().c;

  res.json({ totalBookings, confirmedToday, revenue, totalCustomers });
});

module.exports = router;
