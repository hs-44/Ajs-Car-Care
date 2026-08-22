// routes/payments.js — Razorpay order creation + verification
//
// IMPORTANT: A payment is only ever trusted after verifying it on the
// SERVER using the signature Razorpay returns — never because the
// browser says "payment successful". This is what stops someone from
// faking a payment by editing the frontend.

const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { generateReceipt } = require('../utils/receipt');

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret',
});

// POST /api/payments/create-order — call this after a booking is created
router.post('/create-order', requireAuth, async (req, res) => {
  const { bookingId } = req.body;
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking || booking.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(booking.service_id);

  try {
    const order = await razorpay.orders.create({
      amount: service.price * 100, // Razorpay expects paise
      currency: 'INR',
      receipt: booking.booking_ref,
      notes: { bookingId: String(booking.id) },
    });

    db.prepare(
      'INSERT INTO payments (booking_id, amount, razorpay_order_id, status) VALUES (?, ?, ?, ?)'
    ).run(booking.id, service.price, order.id, 'created');

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
      bookingRef: booking.booking_ref,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not initiate payment. Check Razorpay API keys in .env.' });
  }
});

// POST /api/payments/verify — called by the frontend after Razorpay checkout succeeds
// This re-computes the signature server-side. Only if it matches do we
// mark the booking as confirmed. This is the step that must NEVER be skipped.
router.post('/verify', requireAuth, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const payment = db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(razorpay_order_id);
  if (!payment) return res.status(404).json({ error: 'Payment record not found.' });

  const secret = process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    db.prepare("UPDATE payments SET status = 'failed' WHERE id = ?").run(payment.id);
    return res.status(400).json({ error: 'Payment verification failed.' });
  }

  db.prepare(
    "UPDATE payments SET status = 'paid', razorpay_payment_id = ?, razorpay_signature = ? WHERE id = ?"
  ).run(razorpay_payment_id, razorpay_signature, payment.id);
  db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").run(payment.booking_id);

  res.json({ success: true, bookingId: payment.booking_id });
});

// GET /api/payments/:bookingId/receipt — generates & streams a PDF receipt
router.get('/:bookingId/receipt', requireAuth, (req, res) => {
  const booking = db
    .prepare(
      `SELECT b.*, s.name AS service_name, s.price, u.name AS customer_name, u.email, u.phone
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`
    )
    .get(req.params.bookingId);

  if (!booking || (booking.user_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  if (booking.status !== 'confirmed' && booking.status !== 'completed') {
    return res.status(400).json({ error: 'Receipt is only available for confirmed bookings.' });
  }

  const payment = db.prepare('SELECT * FROM payments WHERE booking_id = ? AND status = "paid"').get(booking.id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${booking.booking_ref}-receipt.pdf`);
  generateReceipt(booking, payment).pipe(res);
});

module.exports = router;
