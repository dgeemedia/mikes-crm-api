// mikes-crm-api/api/enquiry.js
// POST /api/enquiry — receives contact form submission from the website

const { saveEnquiry, saveReply } = require('../lib/db');
const { sendAutoReply, sendInternalNotify } = require('../lib/mailer');
const { v4: uuid } = require('uuid');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { first_name, last_name, email, phone, project_type, message } = req.body;
  if (!first_name || !last_name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields: first_name, last_name, email, message' });
  }

  const id  = uuid();
  const now = Date.now();

  await saveEnquiry({ id, first_name, last_name, email, phone: phone||'', project: project_type||'', message, now });

  sendAutoReply({ id, first_name, email, project: project_type||'your project' })
    .then(async sent => {
      if (sent) {
        await saveReply({
          enquiry_id: id, from_name: 'Auto-reply', from_type: 'auto',
          body: `Automatic acknowledgement sent to ${email} with calendar booking link.`,
          now: now + 100,
        });
      }
    })
    .catch(err => console.error('Auto-reply failed:', err.message));

  sendInternalNotify({ first_name, last_name, email, phone, project: project_type, message })
    .catch(err => console.error('Internal notify failed:', err.message));

  res.json({ ok: true, id });
}

module.exports = handler;