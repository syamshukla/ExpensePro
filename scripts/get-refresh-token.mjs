// One-time: sign in with Google on your computer and print a read-only Gmail refresh token.
// Usage: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run token
import http from "node:http";

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (from your Google Cloud OAuth client).");
  process.exit(1);
}
const PORT = 53682;
const redirect = `http://localhost:${PORT}`;
const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url.search = new URLSearchParams({
  client_id: id,
  redirect_uri: redirect,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/gmail.readonly",
  access_type: "offline",
  prompt: "consent",
}).toString();

http
  .createServer(async (req, res) => {
    const code = new URL(req.url, redirect).searchParams.get("code");
    if (!code) return res.end("No code in the response.");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
    });
    const j = await r.json();
    res.end(j.refresh_token ? "Done. Go back to your terminal." : "Something went wrong. Check your terminal.");
    if (j.refresh_token) console.log(`\nGOOGLE_REFRESH_TOKEN=${j.refresh_token}\n\nPaste that into Vercel > Settings > Environment Variables.`);
    else console.error(j);
    process.exit(0);
  })
  .listen(PORT, () => console.log(`Open this link and sign in with your Gmail account:\n\n${url}\n`));
