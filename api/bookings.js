// api/bookings.js
// GET /api/bookings — returns upcoming and recent bookings for the CRM bookings tab

const { getBookings } = require('../lib/db');

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const bookings = getBookings();
  res.json(bookings);
}

module.exports = handler;
