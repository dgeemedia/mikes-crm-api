// mikes-crm-api/api/enquiry-detail.js
// GET   /api/enquiries/:id          — get a single enquiry with its replies
// PATCH /api/enquiries/:id/status   — update an enquiry's status

const { getEnquiry, getReplies, updateStatus } = require('../lib/db');

async function getDetail(req, res) {
  const { id } = req.params;
  const enquiry = await getEnquiry(id);
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

  const replies = await getReplies(id);
  res.json({ ...enquiry, replies });
}

async function patchStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body || {};

  const allowed = ['new', 'replied', 'booked', 'closed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const enquiry = await getEnquiry(id);
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

  await updateStatus(id, status);
  res.json({ ok: true, status });
}

module.exports = { getDetail, patchStatus };