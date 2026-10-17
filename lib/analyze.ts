// Optional Claude analysis. The Gmail engine stays rule-based; this step only reads
// the numbers it already produced and adds categories and plain-English insights.
// Runs only when ANTHROPIC_API_KEY is set (billed per use on your Anthropic API account).

import Anthropic from "@anthropic-ai/sdk";
import type { Snapshot } from "./engine";
import { ONE_TIME, PAYCHECKS } from "@/config/manual";

export const MODEL = "claude-opus-5-5";

export type Analysis = {
  generatedAt: string;
  headline: string;
  status: "under" | "close" | "over";
  categories: { name: string; amount: number; note: string }[];
  labeled: { date: string; label: string; amount: number; category: string }[];
  insights: { title: string; detail: string }[];
  watch: string[];
};

export const analysisEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "status", "categories", "labeled", "insights", "watch"],
  properties: {
    headline: { type: "string", description: "One sentence on where this month stands." },
    status: { type: "string", enum: ["under", "close", "over"] },
    categories: {
      type: "array",
      description: "Spending this month and last, grouped into everyday categories.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount", "note"],
        properties: { name: { type: "string" }, amount: { type: "number" }, note: { type: "string" } },
      },
    },
    labeled: {
      type: "array",
      description: "Each recent transaction with a category.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "label", "amount", "category"],
        properties: {
          date: { type: "string" },
          label: { type: "string" },
          amount: { type: "number" },
          category: { type: "string" },
        },
      },
    },
    insights: {
      type: "array",
      description: "Three to five findings about trends, backed by numbers from the data.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: { title: { type: "string" }, detail: { type: "string" } },
      },
    },
    watch: { type: "array", items: { type: "string" }, description: "Things to check or decide, at most three." },
  },
} as const;

const SYSTEM = `You review one person's monthly money picture for them. The numbers come from a rule-based reader of their bank and card emails, so treat them as the source of truth and never invent amounts.

How the data works:
- Card spending (Amex Gold, Prime Visa, Apple Card) counts once, in the month the bill is paid. "pendingTotal" is a bill not yet paid that is expected that month.
- "PNC direct" is money leaving checking that is not a card payment: automatic payments, Zelle, ATM cash.
- Transfers between their own accounts are already excluded.
- "oneTime" amounts are big one-off purchases the person asked to keep out of the budget comparison.
- Paychecks do not send emails; they are entered by hand, so income before they appear is incomplete.
- The last month row is the current month and is a projection.

Write for the person directly, in plain, friendly sentences. Be concrete: cite months and dollar amounts. Card bills cannot be split into merchants from this data, so categorize what the labels allow (rent, transfers to people, subscriptions, cash, card bills) and say "card bill" rather than guessing what was bought.`;

export async function analyze(snap: Snapshot, budget: number): Promise<Analysis> {
  const client = new Anthropic();
  const input = {
    today: new Date().toISOString().slice(0, 10),
    monthlyBudget: budget,
    months: snap.months,
    recentTransactions: snap.recent.slice(0, 40).map(({ date, label, amount, kind }) => ({ date, label, amount, kind })),
    manualNotes: { paychecks: PAYCHECKS, oneTimePurchases: ONE_TIME },
  };

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `Here is my data as JSON. Analyze it.\n\n${JSON.stringify(input)}` }],
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === "refusal") throw new Error("Claude declined to analyze this data. Try again later.");
  if (msg.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off. Try again.");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { generatedAt: new Date().toISOString(), ...JSON.parse(text) };
}
