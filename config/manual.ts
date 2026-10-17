// Things Gmail can't see. Edit and redeploy (or ask Claude to update).

export const BUDGET = 5500; // monthly spending budget, rent included

export const HISTORY_MONTHS = 13; // how far back to read Gmail

// Paychecks: no deposit email reaches Gmail, so list them here.
// "expected" ones count toward the month's projection until they land.
export const PAYCHECKS: { date: string; amount: number; label?: string }[] = [
  { date: "2026-10-01", amount: 4000, label: "Paycheck" },
  { date: "2026-10-30", amount: 3800, label: "Paycheck (expected)" },
];

// Recurring paycheck from November on: set to null to stop auto-adding.
export const RECURRING_PAY: { amount: number; daysOfMonth: number[]; from: string } | null = {
  amount: 3800,
  daysOfMonth: [15, 30],
  from: "2026-11",
};

// One-time purchases kept out of the over/under budget check.
export const ONE_TIME: { month: string; amount: number; label: string }[] = [
  { month: "2026-10", amount: 4500, label: "Cinema camera" },
];
