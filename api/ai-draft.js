// api/ai-draft.js
// POST /api/enquiries/:id/ai-draft — generate reply draft using Gemini free API

const { getEnquiry } = require('../lib/db');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const enquiry = await getEnquiry(req.params.id);
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set in environment variables' });

  const prompt = `You are ${req.user.name} from Mikes Constructions Group Ltd, a trusted building and renovation company based in Crewe, Cheshire.

Write a warm, professional email reply to this customer enquiry.

Rules:
- Under 120 words
- Offer a free site visit
- Mention working hours: Mon–Fri 8am–6pm, Sat 9am–2pm
- Do NOT open with "Hi [name]" or "Dear [name]" — the email template adds this automatically
- Do NOT sign off with a name — the template handles that
- Write only the body paragraphs

Customer: ${enquiry.first_name} ${enquiry.last_name}
Project type: ${enquiry.project || 'General enquiry'}
Their message: ${enquiry.message}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Gemini API error:', err);
      return res.status(502).json({ error: 'Gemini API request failed — check GEMINI_API_KEY' });
    }

    const data  = await response.json();
    const draft = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!draft) return res.status(502).json({ error: 'Gemini returned an empty response' });

    res.json({ draft });
  } catch (err) {
    console.error('AI draft error:', err.message);
    res.status(500).json({ error: 'AI draft failed — check GEMINI_API_KEY in Render' });
  }
}

module.exports = handler;