// api/reply.js
// POST /api/enquiries/:id/reply
// Sends a real email to the customer from Blessing or Mo, saves to thread

const { getEnquiry, saveReply, updateStatus } = require('../lib/db');
const { sendReply }                           = require('../lib/mailer');
const { v4: uuid }                            = require('uuid');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const id      = req.params.id;
  const enquiry = getEnquiry(id);
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Reply body is required' });

  const sent = await sendReply({
    to:          enquiry.email,
    firstName:   enquiry.first_name,
    senderName:  req.user.name,
    body,
  });

  if (!sent) {
    return res.status(500).json({ error: 'Email failed to send — check SMTP settings in Render environment variables' });
  }

  // Save to thread
  saveReply({
    enquiry_id: id,
    from_name:  req.user.name,
    from_type:  'team',
    body,
    now:        Date.now(),
  });

  // Auto-advance status from new → replied
  if (enquiry.status === 'new') {
    updateStatus(id, 'replied');
  }

  res.json({ ok: true });
}

module.exports = handler;
