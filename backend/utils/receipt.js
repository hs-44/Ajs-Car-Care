// utils/receipt.js — builds a simple branded PDF receipt

const PDFDocument = require('pdfkit');

function generateReceipt(booking, payment) {
  const doc = new PDFDocument({ margin: 50 });

  // Header
  doc.fontSize(20).fillColor('#E4202D').text('AJS Car Care', { continued: false });
  doc.fontSize(10).fillColor('#555').text('Baner-Pashan Link Road, Pune, Maharashtra 411045');
  doc.text('hello@ajscarcare.in  |  +91 98765 43210');
  doc.moveDown(1.5);

  doc.fontSize(14).fillColor('#000').text('Payment Receipt', { underline: true });
  doc.moveDown(0.5);

  const rows = [
    ['Booking Reference', booking.booking_ref],
    ['Customer Name', booking.customer_name],
    ['Phone', booking.phone],
    ['Email', booking.email],
    ['Car Model', booking.car_model],
    ['Service', booking.service_name],
    ['Booking Date', booking.booking_date],
    ['Time Slot', booking.time_slot],
    ['Amount Paid', `Rs. ${booking.price}`],
    ['Payment ID', payment ? payment.razorpay_payment_id : 'N/A'],
    ['Payment Status', payment ? payment.status.toUpperCase() : 'N/A'],
    ['Issued On', new Date().toLocaleString('en-IN')],
  ];

  doc.fontSize(11).fillColor('#000');
  rows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(String(value));
    doc.moveDown(0.3);
  });

  doc.moveDown(1);
  doc.fontSize(9).fillColor('#888').text(
    'This is a computer-generated receipt and does not require a signature. Thank you for choosing AJS Car Care.'
  );

  doc.end();
  return doc;
}

module.exports = { generateReceipt };
