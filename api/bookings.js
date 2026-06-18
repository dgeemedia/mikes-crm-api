// api/bookings.js
// GET /api/bookings

const { getBookings } = require('../lib/db');

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.json(await getBookings());
}

module.exports = handler;