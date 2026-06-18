// api/enquiry-detail.js
// GET  /api/enquiries/:id        — fetch one enquiry + its reply thread
// PATCH /api/enquiries/:id/status — update status (new / replied / booked / closed)

const { getEnquiry, getReplies, updateStatus } = require('../lib/db');

async function handler(req, res) {
  const id = req.params.id;

  // ── GET — fetch enquiry + thread ──
  if (req.method === 'GET') {
    const enquiry = getEnquiry(id);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    const replies = getReplies(id);
    return res.json({ ...enquiry, replies });
  }

  // ── PATCH — update status ──
  if (req.method === 'PATCH' && req.path.endsWith('/status')) {
    const { status } = req.body;
    const valid = ['new', 'replied', 'booked', 'closed'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });
    }
    updateStatus(id, status);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

module.exports = handler;
