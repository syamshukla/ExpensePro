// Each source is one kind of email the engine reads. Add or tweak sources here.
// A source turns one email into zero or more entries. Amounts are always positive;
// `kind` says which way the money moved.

import type { GmailMessage } from "./gmail";

export type Account = "amex" | "prime" | "apple" | "pnc" | "wealthfront" | "manual";
export type Kind = "out" | "in" | "pending";

export type Entry = {
  date: string; // YYYY-MM-DD the money moved (or is expected to)
  month: string; // YYYY-MM the entry counts toward
  account: Account;
  kind: Kind;
  label: string;
  amount: number;
  source: string; // source id
};

export type Source = {
  id: string;
  account: Account;
  label: string; // shown on the Data sources list
  query: string; // Gmail search, without the date window
  withBody?: boolean;
  latestOnly?: boolean;
  parse: (m: GmailMessage) => Omit<Entry, "source" | "account">[] | null;
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export const money = (s: string) => Number(s.replace(/,/g, ""));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const ym = (d: string) => d.slice(0, 7);
const addDays = (iso: string, n: number) => ymd(new Date(new Date(iso).getTime() + n * 864e5));
export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/** "September 29, 2026" or "Sep 29, 2026" -> 2026-09-29 */
function longDate(s: string): string | null {
  const m = s.match(/([A-Za-z]{3,9})\.? (\d{1,2}), (\d{4})/);
  if (!m) return null;
  const idx = MONTHS.findIndex((n) => n.startsWith(m[1].toLowerCase().slice(0, 3)));
  if (idx < 0) return null;
  return `${m[3]}-${String(idx + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** "11/13/2026" -> 2026-11-13 */
function slashDate(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[1]}-${m[2]}`;
}

const one = (date: string, kind: Kind, label: string, amount: number, month = ym(date)) => [{ date, month, kind, label, amount }];

export const SOURCES: Source[] = [
  {
    id: "amex-autopay",
    account: "amex",
    label: "Amex Gold · AutoPay reminder (monthly bill)",
    query: 'from:americanexpress.com subject:("AutoPay Reminder" OR "AutoPay Payment Reminder")',
    parse: (m) => {
      const amt = m.snippet.match(/Payment amount: \$([\d,]+\.\d\d)/i);
      if (!amt) return null;
      const when = m.snippet.match(/process on:? (?:[A-Za-z]+, )?([A-Za-z]+ \d{1,2}, \d{4})/i);
      const date = (when && longDate(when[1])) || addDays(m.date, 6);
      return one(date, "out", "Amex Gold bill", money(amt[1]));
    },
  },
  {
    id: "amex-snapshot",
    account: "amex",
    label: "Amex Gold · weekly account snapshot (bills not yet due)",
    query: 'from:americanexpress.com subject:"weekly account snapshot"',
    withBody: true,
    latestOnly: true,
    parse: (m) => {
      const t = m.body || "";
      const out: Omit<Entry, "source" | "account">[] = [];
      const st = t.match(/Statement balance:?[\s|]*\$([\d,]+\.\d\d)[\s|]*closing date (?:[A-Za-z]+, )?([A-Za-z]+ \d{1,2}, \d{4})/i);
      if (st) {
        const close = longDate(st[2])!;
        out.push({ date: addDays(close, 15), month: ym(addDays(close, 15)), kind: "pending", label: "Amex Gold statement (due)", amount: money(st[1]) });
      }
      const rc = t.match(/Recent charges:?[\s|]*\$([\d,]+\.\d\d)[\s|]*since (?:[A-Za-z]+, )?([A-Za-z]+ \d{1,2}, \d{4})/i);
      if (rc) {
        const since = longDate(rc[2])!;
        const due = addDays(since, 44);
        out.push({ date: due, month: ym(due), kind: "pending", label: "Amex Gold charges so far this cycle", amount: money(rc[1]) });
      }
      return out.length ? out : null;
    },
  },
  {
    id: "chase-statement",
    account: "prime",
    label: "Prime Visa (Chase) · statement ready (paid on due date)",
    query: 'from:no.reply.alerts@chase.com subject:"statement is available"',
    parse: (m) => {
      const bal = m.snippet.match(/Statement balance \$([\d,]+\.\d\d)/i);
      const due = m.snippet.match(/Due date (\d{2}\/\d{2}\/\d{4})/i);
      if (!bal || !due) return null;
      const date = slashDate(due[1])!;
      return one(date, date <= ymd(new Date()) ? "out" : "pending", "Prime Visa bill", money(bal[1]));
    },
  },
  {
    id: "chase-extra",
    account: "prime",
    label: "Prime Visa (Chase) · extra payments you scheduled",
    query: 'from:no.reply.alerts@chase.com subject:"credit card payment is scheduled"',
    parse: (m) => {
      const amt = m.snippet.match(/Amount \$([\d,]+\.\d\d)/i);
      if (!amt) return null;
      return one(m.date.slice(0, 10), "out", "Prime Visa extra payment", money(amt[1]));
    },
  },
  {
    id: "apple-payment",
    account: "apple",
    label: "Apple Card · payment received",
    query: 'from:no_reply@post.applecard.apple subject:"payment has been received"',
    parse: (m) => {
      const amt = m.snippet.match(/payment of \$([\d,]+\.\d\d)/i);
      if (!amt) return null;
      const when = m.snippet.match(/made on ([A-Za-z]+ \d{1,2}, \d{4})/i);
      return one((when && longDate(when[1])) || m.date.slice(0, 10), "out", "Apple Card bill", money(amt[1]));
    },
  },
  {
    id: "pnc-preauth",
    account: "pnc",
    label: "PNC · pre-authorized (automatic) payments",
    query: "from:pncalerts@pnc.com subject:preauthorized",
    parse: (m) => {
      const amt = m.snippet.match(/A \$([\d,]+\.\d\d) pre-authorized/i);
      return amt ? one(m.date.slice(0, 10), "out", "PNC automatic payment", money(amt[1])) : null;
    },
  },
  {
    id: "pnc-zelle-out",
    account: "pnc",
    label: "PNC · Zelle you sent",
    query: 'from:pncalerts@pnc.com subject:"You sent a Zelle"',
    parse: (m) => {
      const amt = m.snippet.match(/Amount: \$([\d,]+\.\d\d)/i);
      const who = m.subject.match(/payment to (.+)$/i)?.[1] ?? "someone";
      return amt ? one(m.date.slice(0, 10), "out", `Zelle to ${title(who)}`, money(amt[1])) : null;
    },
  },
  {
    id: "pnc-atm",
    account: "pnc",
    label: "PNC · ATM cash withdrawals",
    query: 'from:pncalerts@pnc.com subject:"cash withdrawal"',
    parse: (m) => {
      const amt = m.snippet.match(/a \$([\d,]+\.\d\d) cash withdrawal/i);
      return amt ? one(m.date.slice(0, 10), "out", "ATM cash", money(amt[1])) : null;
    },
  },
  {
    id: "pnc-deposit",
    account: "pnc",
    label: "PNC · deposits (transfers from your own accounts skipped)",
    query: "from:pncalerts@pnc.com subject:deposit",
    parse: (m) => {
      if (/wealthfront/i.test(m.snippet)) return null; // moving your own money
      const amt = m.snippet.match(/\$([\d,]+\.\d\d) (?:deposit|was credited)/i);
      const by = m.snippet.match(/Deposit made by: (.+?)(?: Date:|$)/i)?.[1];
      return amt ? one(m.date.slice(0, 10), "in", by ? `Deposit: ${by.trim()}` : "PNC deposit", money(amt[1])) : null;
    },
  },
  {
    id: "pnc-zelle-in",
    account: "pnc",
    label: "PNC · Zelle you received",
    query: 'from:pncalerts@pnc.com subject:"sent you a Zelle"',
    parse: (m) => {
      const amt = m.snippet.match(/Amount: \$([\d,]+\.\d\d)/i);
      const who = m.subject.split(" sent you")[0];
      return amt ? one(m.date.slice(0, 10), "in", `Zelle from ${title(who)}`, money(amt[1])) : null;
    },
  },
  {
    id: "wealthfront-interest",
    account: "wealthfront",
    label: "Wealthfront · monthly interest earned",
    query: 'from:wealthfrontmail.com subject:"earned interest"',
    withBody: true,
    parse: (m) => {
      const amt = (m.body || m.snippet).match(/INTEREST EARNED LAST MONTH\D{0,6}\$([\d,]+\.\d\d)/i);
      if (!amt) return null;
      const month = shiftMonth(ym(m.date), -1);
      return one(`${month}-28`, "in", "Wealthfront interest", money(amt[1]), month);
    },
  },
];

function title(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
