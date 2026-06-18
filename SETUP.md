# Mikes Constructions CRM — Setup Guide

Two deployments, clean separation:
- **`mikes-crm-api/`** → Render (backend, database, emails, AI)
- **`mikes-crm-frontend/`** → Vercel (the dashboard Blessing & Mo log into)

Estimated time: 30–45 minutes.

---

## Project structure

```
mikes-crm-api/                   ← deploy to Render
├── server.js
├── api/
│   ├── enquiry.js               POST /api/enquiry  (website form intake)
│   ├── auth.js                  POST /api/login
│   ├── enquiries.js             GET  /api/enquiries
│   ├── enquiry-detail.js        GET/PATCH /api/enquiries/:id
│   ├── reply.js                 POST /api/enquiries/:id/reply
│   ├── ai-draft.js              POST /api/enquiries/:id/ai-draft
│   └── stats.js                 GET  /api/stats
├── lib/
│   ├── db.js                    all database queries
│   └── mailer.js                all email templates
├── .env.example
└── package.json

mikes-crm-frontend/              ← deploy to Vercel
├── index.html                   the CRM dashboard
└── vercel.json

mikes-site/js/updated-main.js   ← replace main.js on the website
```

---

## Step 1 — Collect your credentials

### A. Google Gemini API key (free — no credit card needed)
1. Go to https://aistudio.google.com/apikey → Sign in with Google → Create API key
2. Copy it — starts with `AIza`

### B. Gmail App Password
1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification
3. Search "App passwords" → Mail → Other → name it "Mikes CRM" → Generate
4. Copy the 16-character password

### C. Calendly booking link + API token
1. Go to **https://calendly.com** → your account (duoride89)
2. Your booking link is: `https://calendly.com/duoride89/free-site-visit`
3. Go to **https://calendly.com/integrations/api_webhooks** → **Personal access tokens**
4. Click **Get a token now** → name it `Mikes CRM` → Generate
5. Copy the token — you'll add it to Render as `CALENDLY_TOKEN`

> The CRM polls Calendly every 30 minutes automatically using this token.
> No webhooks or paid plans needed.

---

## Step 2 — Deploy the API to Render

### Push mikes-crm-api to GitHub
```bash
cd mikes-crm-api
git init
git add .
git commit -m "Mikes CRM API"
gh repo create mikes-crm-api --private --push --source=.
```

### Create Render Web Service
1. Go to https://render.com → New → Web Service
2. Connect GitHub → select `mikes-crm-api`
3. Settings:

| Setting | Value |
|---|---|
| Name | mikes-crm-api |
| Region | Frankfurt (EU) |
| Branch | main |
| Runtime | Node |
| Build Command | `pnpm install` |
| Start Command | `pnpm start` |
| Instance Type | Free |

4. Click **Advanced** → **Add Disk**:

| Setting | Value |
|---|---|
| Name | crm-data |
| Mount Path | /var/data |
| Size | 1 GB |

> Without this disk the database resets on every deploy. Don't skip it.

5. Click **Create Web Service**
6. Once deployed, copy your Render URL e.g. `https://mikes-crm-api.onrender.com`

### Set environment variables in Render
Render dashboard → your service → **Environment** tab:

| Variable | Value |
|---|---|
| `JWT_SECRET` | run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GEMINI_API_KEY` | your Gemini key from aistudio.google.com/apikey |
| `SMTP_HOST` | smtp.zoho.eu |
| `SMTP_PORT` | 587 |
| `SMTP_USER` | enquiry@mikes-constructions.co.uk |
| `SMTP_PASS` | your Zoho mailbox password |
| `FROM_EMAIL` | enquiry@mikes-constructions.co.uk |
| `FROM_NAME` | Mikes Constructions |
| `NOTIFY_EMAIL` | enquiry@mikes-constructions.co.uk |
| `CALENDAR_URL` | https://calendly.com/duoride89/free-site-visit |
| `CALENDLY_TOKEN` | your Calendly personal access token |
| `ADMIN_PASSWORD` | your own initial password (you'll change it on first login) |
| `MIKE_PASSWORD` | Mike's initial password (he'll change it on first login) |
| `BLESSING_PASSWORD` | Blessing's initial password (she'll change it on first login) |
| `MO_PASSWORD` | Mo's initial password (he'll change it on first login) |
| `CRM_URL` | https://mikes-crm.vercel.app (set after Step 3) |
| `DB_PATH` | /var/data/enquiries.db |

> **Important:** These passwords are only used the **first time** the server starts to create the user accounts. After that they are stored hashed in the database. Changing the env vars later has no effect — use the in-app password change feature instead.

---

## Step 3 — Deploy the frontend to Vercel

This is a separate Vercel project from the main website — Blessing and Mo
access it at `https://mikes-crm.vercel.app` and bookmark it on their phones.

### Via GitHub (recommended — easiest to redeploy later)
1. Push `mikes-crm-frontend` to a new private GitHub repo:
   ```bash
   cd mikes-crm-frontend
   git init
   git add .
   git commit -m "Mikes CRM frontend"
   gh repo create mikes-crm-frontend --private --push --source=.
   ```
2. Go to https://vercel.com → **Add New Project**
3. Import the `mikes-crm-frontend` repo
4. When prompted for project name, type exactly: **`mikes-crm`**
   This gives you `https://mikes-crm.vercel.app`
5. Framework preset: **Other** (plain HTML, no build step)
6. Click **Deploy**

### Via Vercel CLI (faster if you already have it)
```bash
cd mikes-crm-frontend
pnpm dlx vercel
```
When prompted:
- Project name: `mikes-crm`
- Framework: Other
- Build command: leave blank
- Output directory: `.` (current folder)

Your CRM will be live at `https://mikes-crm.vercel.app`

### After deploying the frontend
1. Open `mikes-crm-frontend/index.html`
2. Update line 2 of the script to your actual Render URL:
   ```js
   const API = 'https://mikes-crm-api.onrender.com';
   ```
3. Redeploy frontend

### Also update CORS on the backend
In `mikes-crm-api/server.js`, confirm your Vercel URL is in the CORS list:
```js
'https://mikes-crm.vercel.app',
```
If Vercel gave you a different URL, update it and push to trigger a Render redeploy.

### Update CRM_URL in Render
Go back to Render → Environment → set `CRM_URL` to your Vercel URL.
This makes the internal team notification email link directly to the right place.

---

## Step 4 — Custom domains (optional)

### CRM frontend — crm.mikes-constructions.co.uk
Vercel → your project → Settings → Domains → Add `crm.mikes-constructions.co.uk`
Add the CNAME record Vercel shows you in your domain registrar.

### API — api.mikes-constructions.co.uk (optional)
Render → Settings → Custom Domains → Add `api.mikes-constructions.co.uk`
If you do this, update `API` in `index.html` and `CRM_ENDPOINT` in `main.js` to match.

---

## Step 5 — Wire up the website

Open `updated-main.js`, update line 5:
```js
const CRM_ENDPOINT = 'https://mikes-crm-api.onrender.com/api/enquiry';
```
Replace `mikes-site/js/main.js` with `updated-main.js` and redeploy to Vercel.
`contact.html` needs no changes — field names already match.

---

## Step 6 — Test end to end

1. Submit a test enquiry on the website
2. Check:
   - ✅ Customer gets auto-reply email with calendar link
   - ✅ Team inbox gets notification with CRM link
   - ✅ Enquiry appears in CRM at your Vercel URL
3. Log in as `blessing`, open the enquiry, click **AI draft**, send reply
4. Confirm the customer receives it

---


---

## User management

The CRM has 4 users with two roles:

| Username | Role  | Who |
|---|---|---|
| `admin` | Admin | You (the developer) |
| `mike`  | Admin | The client |
| `blessing` | Staff | Blessing |
| `mo`    | Staff | Mo |

**Roles:**
- **Admin** — full access + can view all users and reset anyone's password
- **Staff** — can manage enquiries, reply, use AI draft, view bookings

**First login flow:**
1. Each user logs in with the initial password you set in the env vars
2. They are immediately prompted to set their own password
3. After that only they know their password — not even you

**Adding a new team member (e.g. Blessing leaves, new hire joins):**
1. Log in as `admin` or `mike`
2. Click **Users** in the left sidebar (only visible to admins)
3. Click **Add team member**
4. Fill in their name, username, role and a temporary password
5. Share the temporary password with them — they must change it on first login

**Deactivating someone who has left:**
1. Go to **Users** in the sidebar
2. Click **Deactivate** next to their name
3. They immediately cannot log in
4. Their name still shows on any replies they sent in the past (history preserved)
5. You can **Reactivate** them at any time if needed

**If someone forgets their password:**
1. Go to **Users** in the sidebar
2. Click **Reset password** next to their name
3. Enter a temporary password and share it with them
4. They log in and are immediately forced to change it

**Password rules:** minimum 8 characters. Users change their own password anytime via the "Change password" button in the top bar.

## Troubleshooting

**CORS error in browser console**
- Your Vercel URL is not in the CORS list in `server.js`
- Add it, push, Render redeploys automatically

**Database resets after deploy**
- Disk not added in Render, or `DB_PATH` not set to `/var/data/enquiries.db`

**Render free tier — slow first load**
- Free tier sleeps after 15 min inactivity, wakes in ~30 seconds
- Upgrade to Render Starter ($7/month) once live to keep it always on

**Emails not sending**
- App Password must be 16 chars, 2-Step Verification must be on
- Check Render logs: service → Logs tab
