// lib/calendly-sync.js
// Polls Calendly API every 30 minutes for new bookings
// No webhooks needed — works on Calendly free plan

const { saveBooking, cancelBooking, getBookings, listEnquiries, updateStatus, saveReply } = require('./db');

const CALENDLY_API = 'https://api.calendly.com';

async function getCalendlyUser(token) {
  const res = await fetch(`${CALENDLY_API}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Calendly user — check CALENDLY_TOKEN');
  const data = await res.json();
  return data.resource; // { uri, name, email, ... }
}

async function fetchInvitees(userUri, token) {
  const params = new URLSearchParams({
    user: userUri,
    count: 100,
    status: 'active',
  });
  const res = await fetch(`${CALENDLY_API}/scheduled_events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Calendly events');
  const data = await res.json();
  return data.collection || [];
}

async function fetchEventInvitees(eventUri, token) {
  const eventUuid = eventUri.split('/').pop();
  const res = await fetch(`${CALENDLY_API}/scheduled_events/${eventUuid}/invitees?count=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.collection || [];
}

async function syncBookings() {
  const token = process.env.CALENDLY_TOKEN;
  if (!token) {
    console.log('CALENDLY_TOKEN not set — skipping sync');
    return;
  }

  try {
    console.log('[Calendly sync] Starting...');
    const user      = await getCalendlyUser(token);
    const events    = await fetchInvitees(user.uri, token);
    const enquiries = listEnquiries();
    const existing  = getBookings();

    for (const event of events) {
      const invitees = await fetchEventInvitees(event.uri, token);

      for (const invitee of invitees) {
        const email     = invitee.email?.toLowerCase();
        const name      = invitee.name || '';
        const startTime = event.start_time;
        const status    = invitee.status === 'canceled' ? 'cancelled' : 'confirmed';

        // Skip if already saved
        const alreadySaved = existing.find(
          b => b.invitee_email?.toLowerCase() === email &&
               b.start_time === startTime
        );
        if (alreadySaved) continue;

        // Try to match to an enquiry by email
        const match = enquiries.find(e => e.email?.toLowerCase() === email);

        saveBooking({
          enquiry_id:    match?.id || null,
          invitee_name:  name,
          invitee_email: email,
          event_type:    'Free Site Visit',
          start_time:    startTime,
          status,
        });

        if (match && status === 'confirmed') {
          updateStatus(match.id, 'booked');
          saveReply({
            enquiry_id: match.id,
            from_name:  'Calendly',
            from_type:  'auto',
            body:       `📅 Site visit booked by ${name} for ${formatDate(startTime)}.`,
            now:        Date.now(),
          });
        }

        if (match && status === 'cancelled') {
          cancelBooking(email);
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
    }

    console.log(`[Calendly sync] Done — ${events.length} events checked`);
  } catch (err) {
    console.error('[Calendly sync] Error:', err.message);
  }
}

function formatDate(iso) {
  if (!iso) return 'unknown date';
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

// Run immediately on startup, then every 30 minutes
function startSync() {
  syncBookings();
  setInterval(syncBookings, 30 * 60 * 1000);
}

module.exports = { startSync, syncBookings };
