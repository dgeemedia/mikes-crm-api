// mikes-crm-api/api/enquiries.js
// GET /api/enquiries — filtered list for CRM dashboard

const { listEnquiries } = require('../lib/db');

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { status, search } = req.query;
  const data = await listEnquiries({ status, search });
  res.json(data);
}

module.exports = handler;