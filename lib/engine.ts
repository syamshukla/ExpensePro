import { search } from "./gmail";
import { SOURCES, shiftMonth, type Account, type Entry } from "./sources";
import { BUDGET, HISTORY_MONTHS, ONE_TIME, PAYCHECKS, RECURRING_PAY } from "@/config/manual";

export type MonthRow = {
  month: string;
  out: Record<Exclude<Account, "wealthfront" | "manual">, number | null>;
  outTotal: number;
  pendingTotal: number;
  inTotal: number;
  oneTime: number;
  oneTimeLabels: string[];
  projected: boolean;
};

export type SourceReport = { id: string; label: string; query: string; found: number; used: number };

export type Snapshot = {
  generatedAt: string;
  budget: number;
  months: MonthRow[];
  sources: SourceReport[];
  recent: Entry[];
  errors: string[];
};

const OUT_ACCOUNTS = ["amex", "prime", "apple", "pnc"] as const;

export async function buildSnapshot(): Promise<Snapshot> {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const firstMonth = shiftMonth(thisMonth, -(HISTORY_MONTHS - 1));
  // card bills are reported a few weeks before they're paid, so look slightly further back
  const afterWide = `${shiftMonth(firstMonth, -2).replace("-", "/")}/01`;

  const entries: Entry[] = [];
  const sources: SourceReport[] = [];
  const errors: string[] = [];

  for (const src of SOURCES) {
    try {
      const msgs = await search(`${src.query} after:${afterWide}`, { withBody: src.withBody, max: src.latestOnly ? 1 : 500 });
      const list = src.latestOnly ? msgs.slice(0, 1) : msgs;
      let used = 0;
      for (const m of list) {
        const got = src.parse(m);
        if (got?.length) {
          used++;
          got.forEach((e) => entries.push({ ...e, account: src.account, source: src.id }));
        }
      }
      sources.push({ id: src.id, label: src.label, query: src.query, found: list.length, used });
    } catch (e: any) {
      errors.push(`${src.label}: ${e.message}`);
      sources.push({ id: src.id, label: src.label, query: src.query, found: 0, used: 0 });
    }
  }

  // Paychecks from config
  const pay = [...PAYCHECKS];
  if (RECURRING_PAY) {
    for (let m = RECURRING_PAY.from; m <= shiftMonth(thisMonth, 1); m = shiftMonth(m, 1)) {
      for (const d of RECURRING_PAY.daysOfMonth) pay.push({ date: `${m}-${String(d).padStart(2, "0")}`, amount: RECURRING_PAY.amount, label: "Paycheck" });
    }
  }
  for (const p of pay) {
    entries.push({ date: p.date, month: p.date.slice(0, 7), account: "manual", kind: "in", label: p.label ?? "Paycheck", amount: p.amount, source: "manual" });
  }

  // Drop Amex "not yet due" amounts once the real bill for that month is known.
  const amexBilled = new Set(entries.filter((e) => e.account === "amex" && e.kind === "out").map((e) => e.month));
  const clean = entries.filter((e) => !(e.account === "amex" && e.kind === "pending" && amexBilled.has(e.month)));
  // Keep only one pending Amex amount per month (the larger: statement vs running charges).
  const best = new Map<string, Entry>();
  for (const e of clean) {
    if (e.account === "amex" && e.kind === "pending" && (best.get(e.month)?.amount ?? -1) < e.amount) best.set(e.month, e);
  }
  const final = clean.filter((e) => !(e.account === "amex" && e.kind === "pending") || best.get(e.month) === e);

  const months: MonthRow[] = [];
  for (let m = firstMonth; m <= thisMonth; m = shiftMonth(m, 1)) {
    const inMonth = final.filter((e) => e.month === m);
    const out = Object.fromEntries(
      OUT_ACCOUNTS.map((a) => {
        const xs = inMonth.filter((e) => e.account === a && e.kind !== "in");
        return [a, xs.length ? round(xs.reduce((s, e) => s + e.amount, 0)) : null];
      })
    ) as MonthRow["out"];
    const one = ONE_TIME.filter((o) => o.month === m);
    months.push({
      month: m,
      out,
      outTotal: round(inMonth.filter((e) => e.kind === "out" && e.account !== "manual").reduce((s, e) => s + e.amount, 0)),
      pendingTotal: round(inMonth.filter((e) => e.kind === "pending").reduce((s, e) => s + e.amount, 0)),
      inTotal: round(inMonth.filter((e) => e.kind === "in").reduce((s, e) => s + e.amount, 0)),
      oneTime: one.reduce((s, o) => s + o.amount, 0),
      oneTimeLabels: one.map((o) => o.label),
      projected: m === thisMonth,
    });
  }

  const recent = final
    .filter((e) => e.date <= now.toISOString().slice(0, 10) && e.account !== "manual")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40);

  return { generatedAt: now.toISOString(), budget: BUDGET, months, sources, recent, errors };
}

const round = (n: number) => Math.round(n * 100) / 100;
