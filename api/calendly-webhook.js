// api/calendly-webhook.js
// POST /api/webhooks/calendly
// Calendly calls this URL every time a customer books or cancels a site visit
// Docs: https://developer.calendly.com/api-docs/ZG9jOjM2MzE2MDM4-webhook-signatures

const { listEnquiries, updateStatus, saveReply, saveBooking } = require('../lib/db');
const crypto = require('crypto');

function verifySignature(req) {
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (!secret) return true; // skip verification in dev if not set
  const signature = req.headers['calendly-webhook-signature'];
  if (!signature) return false;
  // Calendly signs with HMAC-SHA256 of the raw body
  const hmac = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
  return signature === `sha256=${hmac}`;
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event     = req.body?.event;
  const payload   = req.body?.payload;

  if (!event || !payload) return res.status(400).json({ error: 'Invalid payload' });

  const eventType   = payload?.event_type?.name || 'Site Visit';
  const startTime   = payload?.scheduled_event?.start_time;
  const invitee     = payload?.invitee;
  const name        = invitee?.name || '';
  const email       = invitee?.email || '';
  const [firstName] = name.split(' ');

  if (event === 'invitee.created') {
    // Try to match this booking to an existing enquiry by email
    const enquiries = listEnquiries();
    const match     = enquiries.find(e => e.email.toLowerCase() === email.toLowerCase());

    const bookingData = {
      invitee_name:  name,
      invitee_email: email,
      event_type:    eventType,
      start_time:    startTime,
      status:        'confirmed',
      enquiry_id:    match?.id || null,
    };

    // Save the booking record
    saveBooking(bookingData);

    // If we found a matching enquiry, mark it booked and add a thread note
    if (match) {
      updateStatus(match.id, 'booked');
      saveReply({
        enquiry_id: match.id,
        from_name:  'Calendly',
        from_type:  'auto',
        body:       `📅 Site visit booked by ${name} for ${formatDate(startTime)}.`,
        now:        Date.now(),
      });
    }
  }

  if (event === 'invitee.canceled') {
    const { cancelBooking } = require('../lib/db');
    cancelBooking(email);

    // If matched enquiry was booked, revert to replied
    const enquiries = listEnquiries();
    const match     = enquiries.find(e => e.email.toLowerCase() === email.toLowerCase() && e.status === 'booked');
    if (match) {
      updateStatus(match.id, 'replied');
      saveReply({
        enquiry_id: match.id,
        from_name:  'Calendly',
        from_type:  'auto',
        body:       `❌ Site visit cancelled by ${name}.`,
        now:        Date.now(),
      });
    }
  }

  res.json({ ok: true });
}

function formatDate(iso) {
  if (!iso) return 'unknown date';
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

module.exports = handler;
