// routes/bookings.js — real slot availability + booking creation
// A booking starts as 'pending_payment' and only becomes 'confirmed'
// after the payment webhook verifies a successful Razorpay payment.

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALL_SLOTS = [
  '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM',
  '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM',
];

function generateBookingRef() {
  return 'AJS-' + Math.floor(100000 + Math.random() * 900000);
}

// GET /api/bookings/slots?date=YYYY-MM-DD
// Returns all slots with a flag for whether they're already taken.
router.get('/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param is required.' });

  const taken = db
    .prepare(
      `SELECT time_slot FROM bookings
       WHERE booking_date = ? AND status IN ('pending_payment','confirmed','completed')`
    )
    .all(date)
    .map((r) => r.time_slot);

  const slots = ALL_SLOTS.map((slot) => ({
    time: slot,
    available: !taken.includes(slot),
  }));
  res.json({ slots });
});

// POST /api/bookings — create a booking (requires login)
// This is where double-booking is actually prevented: the DB has a
// UNIQUE(booking_date, time_slot) constraint, so a race condition
// between two users booking the same slot at once is rejected safely.
router.post('/', requireAuth, (req, res) => {
  const { serviceId, carModel, date, timeSlot, notes } = req.body;

  if (!serviceId || !carModel || !date || !timeSlot) {
    return res.status(400).json({ error: 'serviceId, carModel, date and timeSlot are required.' });
  }
  if (!ALL_SLOTS.includes(timeSlot)) {
    return res.status(400).json({ error: 'Invalid time slot.' });
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(serviceId);
  if (!service) return res.status(404).json({ error: 'Service not found.' });

  const bookingRef = generateBookingRef();

  try {
    const result = db
      .prepare(
        `INSERT INTO bookings (booking_ref, user_id, service_id, car_model, booking_date, time_slot, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment')`
      )
      .run(bookingRef, req.user.id, service.id, carModel.trim(), date, timeSlot, notes || null);

    res.json({
      bookingId: result.lastInsertRowid,
      bookingRef,
      service,
      date,
      timeSlot,
      amount: service.price,
      status: 'pending_payment',
    });
  } catch (err) {
    // UNIQUE constraint violation = someone else just took this slot
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That slot was just booked by someone else. Please pick another.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not create booking. Please try again.' });
  }
});

// GET /api/bookings/mine — logged-in user's own bookings
router.get('/mine', requireAuth, (req, res) => {
  const bookings = db
    .prepare(
      `SELECT b.*, s.name AS service_name, s.category, s.price
       FROM bookings b JOIN services s ON s.id = b.service_id
       WHERE b.user_id = ? ORDER BY b.booking_date DESC, b.id DESC`
    )
    .all(req.user.id);
  res.json({ bookings });
});

// POST /api/bookings/:id/cancel — user can cancel their own upcoming booking
router.post('/:id/cancel', requireAuth, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking || booking.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  if (booking.status === 'completed') {
    return res.status(400).json({ error: 'Completed bookings cannot be cancelled.' });
  }
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
  res.json({ success: true });
});

module.exports = router;
