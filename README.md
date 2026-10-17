# Money Tracker

A private dashboard of money in vs out across PNC, Wealthfront, Amex Gold, Prime Visa and Apple Card.
The **Pull latest** button reads your bank and card emails from Gmail (read-only), parses the amounts and
recalculates everything. It runs entirely on Vercel, so it works from any device.

## How the data pull works

`POST /api/data` → `lib/engine.ts` runs every source in `lib/sources.ts`:

| Source | Gmail emails | What's read |
|---|---|---|
| Amex Gold | "Your AutoPay Reminder" | monthly bill + pay date |
| Amex Gold | latest "weekly account snapshot" | bills not yet due |
| Prime Visa | Chase "statement is available", "credit card payment is scheduled" | bill paid on due date, extra payments |
| Apple Card | "payment has been received" | monthly payment |
| PNC | pre-authorized payment, deposit, Zelle sent/received, ATM alerts | each amount |
| Wealthfront | "You earned interest" | last month's interest |

Paychecks, one-time purchases and the default budget are in `config/manual.ts` (Gmail can't see them).
Each device keeps the last pull and pulls again automatically when it's more than 6 hours old.

## One-time setup (about 15 minutes)

### 1. Google OAuth client (lets the app read Gmail)
1. Go to https://console.cloud.google.com → create a project (e.g. "money-tracker").
2. **APIs & Services → Library** → enable **Gmail API**.
3. **OAuth consent screen** → External → fill in app name and your email → add scope
   `https://www.googleapis.com/auth/gmail.readonly` → add yourself as a test user.
   Then click **Publish app** (→ "In production"). If you leave it in "Testing", Google expires the
   sign-in every 7 days. You'll see an "unverified app" warning when you sign in; that's expected for a personal app.
4. **Credentials → Create credentials → OAuth client ID → Desktop app**. Copy the client ID and secret.

### 2. Get your refresh token (on your computer)
```bash
npm install
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy npm run token
```
Open the printed link, sign in with your Gmail, and copy the `GOOGLE_REFRESH_TOKEN=...` line it prints.

### 3. Run locally (optional)
Copy `.env.example` to `.env.local`, fill in the four values, then `npm run dev` and open http://localhost:3000.

### 4. Deploy to Vercel
1. Push this folder to a new **private** GitHub repo.
2. In Vercel: **Add New → Project** → import the repo (Next.js is detected automatically).
3. **Settings → Environment Variables**: add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REFRESH_TOKEN`, `APP_PASSWORD` (and optionally `ANTHROPIC_API_KEY`, see below). Redeploy.
4. Open your Vercel link. The browser asks for a username (anything) and your `APP_PASSWORD`.

## Optional: Claude analysis

The numbers never depend on AI. Gmail is read and parsed by fixed rules (`lib/sources.ts`),
so every pull gives the same answer for the same emails. On top of that you can turn on an
**Analyze with Claude** button that reads the finished numbers (not your emails) and returns
spending categories, trend insights and things to check.

- **Off by default.** It only appears when `ANTHROPIC_API_KEY` is set.
- **Separate from Claude Pro.** A Pro or Max subscription does not cover API calls. Create a key
  at [console.anthropic.com](https://console.anthropic.com), add a small amount of credit, and
  set a monthly spend limit there. Each run sends a few KB of numbers and costs a few cents.
- **Turn it on:** add `ANTHROPIC_API_KEY` in Vercel → Settings → Environment Variables, then redeploy.
- **Model:** `claude-opus-5-5` with server-side fallback on (`fallbacks: "default"`), so if the
  request is declined it is retried on Anthropic's recommended fallback model in the same call.
  Change the model in `lib/analyze.ts`.
- The route is `POST /api/analyze` and sits behind `APP_PASSWORD` like the rest of the site.
  Results are saved on each device until you re-analyze.

## Security
- Gmail access is read-only; the app can't send, delete or change email.
- Secrets live only in Vercel environment variables, never in the repo (`.env*.local` is git-ignored).
- The whole site, including the API, is behind `APP_PASSWORD` (see `middleware.ts`).
- To cut off access anytime: https://myaccount.google.com/permissions → remove the app.
