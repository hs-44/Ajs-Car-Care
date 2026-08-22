// routes/services.js — public service list, admin can add/edit price or deactivate

const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/services — public, only active services
router.get('/', (req, res) => {
  const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY category, price').all();
  res.json({ services });
});

// GET /api/services/all — admin, includes inactive
router.get('/all', requireAdmin, (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY category, price').all();
  res.json({ services });
});

// POST /api/services — admin: create a new service
router.post('/', requireAdmin, (req, res) => {
  const { name, category, price } = req.body;
  if (!name || !category || !price) return res.status(400).json({ error: 'name, category and price are required.' });
  const result = db
    .prepare('INSERT INTO services (name, category, price) VALUES (?, ?, ?)')
    .run(name.trim(), category, Number(price));
  res.json({ id: result.lastInsertRowid });
});

// PUT /api/services/:id — admin: update price / name / active status
router.put('/:id', requireAdmin, (req, res) => {
  const { name, price, active } = req.body;
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Service not found.' });

  db.prepare('UPDATE services SET name = ?, price = ?, active = ? WHERE id = ?').run(
    name ?? existing.name,
    price !== undefined ? Number(price) : existing.price,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json({ success: true });
});

module.exports = router;
