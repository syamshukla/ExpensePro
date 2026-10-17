// Minimal read-only Gmail client using a stored OAuth refresh token.
// Scope needed: https://www.googleapis.com/auth/gmail.readonly

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessage = {
  id: string;
  date: string; // ISO
  from: string;
  subject: string;
  snippet: string;
  body?: string; // plain text, only when requested
};

let cachedToken: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Gmail is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN.");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${json.error_description || json.error || res.status}. Re-run npm run token.`);
  cachedToken = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function gget(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gmail request failed (${res.status}) for ${path.split("?")[0]}`);
  return res.json();
}

function header(headers: { name: string; value: string }[], name: string) {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decode(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

function bodyText(payload: any): string {
  const parts: any[] = [];
  const walk = (p: any) => {
    if (!p) return;
    parts.push(p);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  const plain = parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (plain) return decode(plain.body.data).replace(/\s+/g, " ");
  const html = parts.find((p) => p.mimeType === "text/html" && p.body?.data);
  return html ? htmlToText(decode(html.body.data)) : "";
}

/** Search Gmail and return every matching message (paged), newest first. */
export async function search(q: string, opts: { withBody?: boolean; max?: number } = {}): Promise<GmailMessage[]> {
  const ids: string[] = [];
  let pageToken = "";
  const max = opts.max ?? 500;
  do {
    const page = await gget(`/messages?q=${encodeURIComponent(q)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`);
    (page.messages || []).forEach((m: any) => ids.push(m.id));
    pageToken = page.nextPageToken || "";
  } while (pageToken && ids.length < max);

  const out: GmailMessage[] = [];
  // Fetch in small batches to stay under Gmail's per-user rate limit.
  for (let i = 0; i < ids.length; i += 20) {
    const batch = await Promise.all(
      ids.slice(i, i + 20).map((id) =>
        gget(
          opts.withBody
            ? `/messages/${id}?format=full`
            : `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
        )
      )
    );
    for (const m of batch) {
      const h = m.payload?.headers ?? [];
      out.push({
        id: m.id,
        date: new Date(Number(m.internalDate)).toISOString(),
        from: header(h, "From"),
        subject: header(h, "Subject"),
        snippet: (m.snippet ?? "").replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
        body: opts.withBody ? bodyText(m.payload) : undefined,
      });
    }
  }
  return out;
}
