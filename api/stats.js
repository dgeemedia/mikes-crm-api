// api/stats.js
// GET /api/stats — totals for the CRM dashboard header

const { getStats } = require('../lib/db');

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.json(getStats());
}

module.exports = handler;
