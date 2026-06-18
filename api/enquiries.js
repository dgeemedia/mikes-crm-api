// api/enquiries.js
// GET /api/enquiries — returns filtered list of enquiries for the CRM dashboard

const { listEnquiries } = require('../lib/db');

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { status, search } = req.query;
  const rows = listEnquiries({ status, search });
  res.json(rows);
}

module.exports = handler;
