// api/calendly-webhook.js
// POST /api/webhooks/calendly — receives booking events from Make/Calendly

const { listEnquiries, updateStatus, saveReply, saveBooking, cancelBooking } = require('../lib/db');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const event   = req.body?.event;
  const payload = req.body?.payload;
  if (!event || !payload) return res.status(400).json({ error: 'Invalid payload' });

  const name      = payload?.invitee?.name || '';
  const email     = payload?.invitee?.email?.toLowerCase() || '';
  const startTime = payload?.scheduled_event?.start_time;
  const eventType = payload?.event_type?.name || 'Free Site Visit';

  if (event === 'invitee.created') {
    const enquiries = await listEnquiries();
    const match     = enquiries.find(e => e.email?.toLowerCase() === email);

    await saveBooking({
      enquiry_id:    match?.id || null,
      invitee_name:  name,
      invitee_email: email,
      event_type:    eventType,
      start_time:    startTime,
      status:        'confirmed',
    });

    if (match) {
      await updateStatus(match.id, 'booked');
      await saveReply({
        enquiry_id: match.id, from_name: 'Calendly', from_type: 'auto',
        body: `📅 Site visit booked by ${name} for ${formatDate(startTime)}.`,
      });
    }
  }

  if (event === 'invitee.canceled') {
    await cancelBooking(email);
    const enquiries = await listEnquiries();
    const match     = enquiries.find(e => e.email?.toLowerCase() === email && e.status === 'booked');
    if (match) {
      await updateStatus(match.id, 'replied');
      await saveReply({
        enquiry_id: match.id, from_name: 'Calendly', from_type: 'auto',
        body: `❌ Site visit cancelled by ${name}.`,
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