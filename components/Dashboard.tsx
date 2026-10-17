"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Snapshot, MonthRow } from "@/lib/engine";
import type { Analysis } from "@/lib/analyze";

const KEYS = [
  ["amex", "Amex Gold", "--s1"],
  ["prime", "Prime Visa", "--s2"],
  ["apple", "Apple Card", "--s3"],
  ["pnc", "PNC direct", "--s4"],
] as const;
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const lab = (m: string) => `${MN[+m.slice(5) - 1]} '${m.slice(2, 4)}`;
const fmt = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const STALE_MS = 6 * 3600 * 1000;
const STORE = "snapshot-v1";

const totalOut = (r: MonthRow) => r.outTotal + r.pendingTotal;

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);

  const pull = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/data", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Pull failed (${res.status})`);
      setSnap(json);
      try { localStorage.setItem(STORE, JSON.stringify(json)); } catch {}
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let saved: Snapshot | null = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch {}
    try { const b = localStorage.getItem("budget"); if (b) setBudget(+b); } catch {}
    if (saved) setSnap(saved);
    if (!saved || Date.now() - new Date(saved.generatedAt).getTime() > STALE_MS) pull();
  }, [pull]);

  const b = budget ?? snap?.budget ?? 5500;
  const setB = (v: number) => { setBudget(v); try { localStorage.setItem("budget", String(v)); } catch {} };

  return (
    <div className="wrap">
      <header>
        <span className="eyebrow">Read from Gmail{snap ? ` · pulled ${new Date(snap.generatedAt).toLocaleString()}` : ""}</span>
        <h1>Syam&apos;s Money Tracker</h1>
        <p>Money coming in vs going out across PNC, Wealthfront, Amex Gold, Prime Visa and Apple Card. Card spending counts once, in the month the bill is paid.</p>
        <div className="toolbar">
          <button className="btn" onClick={pull} disabled={loading}>{loading ? "Reading Gmail…" : "Pull latest"}</button>
          <span className="sub">Reads your bank and card emails again and recalculates everything.</span>
        </div>
        {loading && <p className="sub" style={{ margin: 0 }} aria-live="polite">Reading about a year of bank and card emails. This usually takes 10–40 seconds.</p>}
        {error && <div className="err" role="alert">{error}</div>}
        {!error && snap && snap.errors.length > 0 && (
          <div className="err" role="alert">Some sources failed, so totals may be low: {snap.errors.join(" · ")}</div>
        )}
      </header>
      {!snap ? (
        <section className="panel"><h2>{loading ? "Getting your numbers" : "No numbers yet"}</h2><p className="sub">The first pull reads about a year of emails and takes 10–30 seconds.</p></section>
      ) : (
        <Body snap={snap} budget={b} setBudget={setB} />
      )}
    </div>
  );
}

function Body({ snap, budget, setBudget }: { snap: Snapshot; budget: number; setBudget: (n: number) => void }) {
  const months = snap.months;
  const cur = months[months.length - 1];
  const curOut = totalOut(cur);
  const reg = curOut - cur.oneTime;
  const net = cur.inTotal - curOut;
  const diff = reg - budget;
  const max = Math.max(curOut, budget) * 1.05 || 1;

  const past = months.slice(0, -1);
  const stats = useMemo(() => {
    const tot = past.reduce((s, r) => s + totalOut(r), 0);
    const avg = past.length ? tot / past.length : 0;
    const l3 = past.slice(-3).reduce((s, r) => s + totalOut(r), 0) / 3;
    const p3 = past.slice(-6, -3).reduce((s, r) => s + totalOut(r), 0) / 3;
    const amex = tot ? past.reduce((s, r) => s + (r.out.amex || 0), 0) / tot : 0;
    const big = past.reduce((a, r) => (totalOut(r) > totalOut(a) ? r : a), past[0] ?? cur);
    return { avg, l3, p3, ch: p3 ? ((l3 - p3) / p3) * 100 : 0, amex, big };
  }, [past, cur]);

  return (
    <>
      <section className="panel" aria-labelledby="now">
        <div className="verdict">
          <h2 id="now">{MN[+cur.month.slice(5) - 1]} {cur.month.slice(0, 4)} (projected)</h2>
          <span className={`pill ${diff > 0 ? (diff < 500 ? "warn" : "bad") : "good"}`}>
            {diff > 0 ? `Over budget by ${fmt(diff)}` : `Under budget by ${fmt(-diff)}`}
            {cur.oneTime ? " (one-time excluded)" : ""}
          </span>
        </div>
        <div className="stats">
          <div className="stat"><span className="eyebrow">Coming in</span><span className="num">{fmt(cur.inTotal)}</span><span className="sub">paychecks, deposits, interest</span></div>
          <div className="stat"><span className="eyebrow">Going out</span><span className="num">{fmt(curOut)}</span><span className="sub">{cur.pendingTotal ? `incl. ${fmt(cur.pendingTotal)} in bills not yet due` : "paid so far"}</span></div>
          <div className="stat"><span className="eyebrow">Left over</span><span className="num" style={{ color: net < 0 ? "var(--bad)" : "var(--good)" }}>{fmt(net)}</span><span className="sub">in minus out</span></div>
        </div>
        <div className="meter">
          <div className="bar">
            <span className="reg" style={{ width: `${(reg / max) * 100}%` }} />
            <span className="one" style={{ left: `${(reg / max) * 100}%`, width: `${(cur.oneTime / max) * 100}%` }} />
            <i className="mark" style={{ left: `calc(${(budget / max) * 100}% - 1px)` }} aria-hidden="true" />
          </div>
          <div className="legend">
            <span><i className="dot" style={{ background: "var(--accent)" }} />Regular spending <b className="num">{fmt(reg)}</b></span>
            {cur.oneTime > 0 && <span><i className="dot" style={{ background: "var(--warn)" }} />One-time: {cur.oneTimeLabels.join(", ")} <b className="num">{fmt(cur.oneTime)}</b></span>}
            <span><i className="tick" style={{ height: 10, width: 2, verticalAlign: -1 }} />Budget line</span>
          </div>
        </div>
        <label className="budget" htmlFor="budget">Monthly spending budget (rent included)
          <input id="budget" type="number" inputMode="numeric" min={0} step={100} value={budget} onChange={(e) => setBudget(Math.max(0, +e.target.value || 0))} />
        </label>
      </section>

      <section className="panel" aria-labelledby="tr">
        <h2 id="tr">Trends, last {months.length} months</h2>
        <div className="trend">
          <div className="stat"><span className="eyebrow">Avg out / month</span><span className="num">{fmt(stats.avg)}</span><span className="sub">{lab(past[0]?.month ?? cur.month)} – {lab(past[past.length - 1]?.month ?? cur.month)}</span></div>
          <div className="stat"><span className="eyebrow">Last 3 vs prior 3</span><span className="num" style={{ color: stats.ch > 0 ? "var(--bad)" : "var(--good)" }}>{stats.ch >= 0 ? "+" : "−"}{Math.abs(stats.ch).toFixed(0)}%</span><span className="sub">{fmt(stats.l3)} vs {fmt(stats.p3)} avg</span></div>
          <div className="stat"><span className="eyebrow">Amex share</span><span className="num">{Math.round(stats.amex * 100)}%</span><span className="sub">of spending</span></div>
          <div className="stat"><span className="eyebrow">Biggest month</span><span className="num">{fmt(totalOut(stats.big))}</span><span className="sub">{lab(stats.big.month)}</span></div>
        </div>
        <div className="legend" aria-hidden="true">
          {KEYS.map(([, n, c]) => <span key={n}><i className="dot" style={{ background: `var(${c})` }} />{n}</span>)}
          <span><i className="tick" />Money in</span>
        </div>
        <Chart months={months} budget={budget} />
      </section>

      <section className="panel" aria-labelledby="hist">
        <h2 id="hist">Month by month</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Month</th>{KEYS.map(([, n]) => <th key={n}>{n.split(" ")[0]}</th>)}<th>Out</th><th>In</th><th>vs budget</th></tr></thead>
          <tbody>
            {[...months].reverse().map((r) => {
              const d = totalOut(r) - r.oneTime - budget;
              return (
                <tr key={r.month} className={r.projected ? "cur" : ""}>
                  <td>{lab(r.month)}{r.projected ? " (proj.)" : ""}</td>
                  {KEYS.map(([k]) => r.out[k] == null ? <td key={k} className="num dim">—</td> : <td key={k} className="num">{fmt(r.out[k]!)}</td>)}
                  <td className="num">{fmt(totalOut(r))}</td>
                  <td className="num">{fmt(r.inTotal)}</td>
                  <td className={`num ${d > 0 ? "neg" : "pos"}`}>{d > 0 ? "+" : "−"}{fmt(Math.abs(d))}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p className="sub" style={{ margin: 0 }}>A dash means no email was found for that bill that month. One-time purchases are left out of &quot;vs budget&quot;.</p>
      </section>

      <ClaudeAnalysis snap={snap} budget={budget} />

      <section className="panel" aria-labelledby="recent">
        <h2 id="recent">Latest transactions found</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Date</th><th style={{ textAlign: "left" }}>What</th><th>Amount</th></tr></thead>
          <tbody>
            {snap.recent.slice(0, 15).map((e, i) => (
              <tr key={i}><td className="num dim">{e.date}</td><td className="l">{e.label}</td><td className={`num ${e.kind === "in" ? "pos" : ""}`}>{e.kind === "in" ? "+" : ""}{fmt(e.amount)}</td></tr>
            ))}
          </tbody>
        </table></div>
      </section>

      <section className="panel" aria-labelledby="src">
        <h2 id="src">Data sources from Gmail</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Source</th><th style={{ textAlign: "left" }}>Gmail search</th><th>Emails</th><th>Used</th></tr></thead>
          <tbody>
            {snap.sources.map((s) => (
              <tr key={s.id}><td className="l">{s.label}</td><td className="l"><code>{s.query}</code></td><td className="num">{s.found}</td><td className={`num ${s.found && !s.used ? "neg" : ""}`}>{s.used}</td></tr>
            ))}
          </tbody>
        </table></div>
        <ul className="notes">
          <li><b>Skipped on purpose:</b> transfers between your own accounts, card payments leaving PNC, marketing emails, and statement notices with no amount.</li>
          <li><b>From settings, not Gmail:</b> paychecks, one-time purchases and the default budget live in <code>config/manual.ts</code>.</li>
          {snap.errors.map((e) => <li key={e} style={{ color: "var(--bad)" }}>{e}</li>)}
        </ul>
      </section>
    </>
  );
}

function Chart({ months, budget }: { months: MonthRow[]; budget: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 860, H = 300, L = 52, R = 10, T = 14, B = 30;
  const peak = Math.max(budget, ...months.map((r) => Math.max(totalOut(r), r.inTotal)));
  const step = peak > 8000 ? 2000 : peak > 4000 ? 1000 : 500;
  const top = Math.ceil((peak * 1.05) / step) * step;
  const ih = H - T - B, iw = W - L - R, bw = iw / months.length;
  const y = (v: number) => T + ih - (v / top) * ih;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const w = Math.min(34, bw * 0.62);

  return (
    <div className="chartbox">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly money out by account, stacked, with money in marked">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v ? "gl" : "base"} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end">{v ? `$${v / 1000}k` : "$0"}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(budget)} y2={y(budget)} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="5 4" />
        <text x={W - R} y={y(budget) - 6} textAnchor="end" style={{ fill: "var(--ink)" }}>Budget {fmt(budget)}</text>
        {months.map((r, i) => {
          const cx = L + i * bw + bw / 2;
          let acc = 0;
          const segs = KEYS.filter(([k]) => r.out[k]);
          return (
            <g key={r.month} className="col" tabIndex={0} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <rect className="hit" x={L + i * bw + 2} y={T} width={bw - 4} height={ih} rx={4} fill="transparent" />
              {segs.map(([k, , c], j) => {
                const v = r.out[k]!;
                const y0 = y(acc + v), h = Math.max(0, y(acc) - y0 - (j ? 2 : 0));
                acc += v;
                const isTop = j === segs.length - 1, rr = Math.min(4, h, w / 2), x = cx - w / 2;
                return isTop
                  ? <path key={k} d={`M${x},${y0 + h}V${y0 + rr}Q${x},${y0} ${x + rr},${y0}H${x + w - rr}Q${x + w},${y0} ${x + w},${y0 + rr}V${y0 + h}Z`} fill={`var(${c})`} />
                  : <rect key={k} x={x} y={y0} width={w} height={h} fill={`var(${c})`} />;
              })}
              {r.projected && <rect x={cx - w / 2} y={y(totalOut(r))} width={w} height={y(0) - y(totalOut(r))} fill="none" stroke="var(--ink)" strokeDasharray="3 3" />}
              {r.inTotal > 0 && <line x1={cx - w / 2 - 5} x2={cx + w / 2 + 5} y1={y(r.inTotal)} y2={y(r.inTotal)} stroke="var(--inc)" strokeWidth={2.5} strokeLinecap="round" />}
              <text x={cx} y={H - 10} textAnchor="middle">{MN[+r.month.slice(5) - 1]}{r.month.endsWith("-01") || i === 0 ? ` '${r.month.slice(2, 4)}` : ""}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (() => {
        const r = months[hover];
        const left = (hover + 0.5) / months.length > 0.6 ? undefined : `calc(${((L + hover * bw + bw) / W) * 100}% + 6px)`;
        const right = left ? undefined : `calc(${(1 - (L + hover * bw) / W) * 100}% + 6px)`;
        return (
          <div className="tip" style={{ top: 8, left, right }}>
            <b>{lab(r.month)}{r.projected ? " (projected)" : ""}</b>
            {KEYS.map(([k, n, c]) => (
              <div className="r" key={k}><span><i className="dot" style={{ background: `var(${c})` }} />{n}</span><span className="num">{r.out[k] == null ? "—" : fmt(r.out[k]!)}</span></div>
            ))}
            <div className="r" style={{ borderTop: "1px solid var(--line)", paddingTop: 3 }}><span>Out</span><span className="num">{fmt(totalOut(r))}</span></div>
            <div className="r"><span>In</span><span className="num">{fmt(r.inTotal)}</span></div>
          </div>
        );
      })()}
    </div>
  );
}

const ASTORE = "analysis-v1";

function ClaudeAnalysis({ snap, budget }: { snap: Snapshot; budget: number }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [res, setRes] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analyze").then((r) => r.json()).then((j) => setEnabled(!!j.enabled)).catch(() => setEnabled(false));
    try { const a = JSON.parse(localStorage.getItem(ASTORE) || "null"); if (a) setRes(a); } catch {}
  }, []);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshot: snap, budget }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Analysis failed (${r.status})`);
      setRes(j);
      try { localStorage.setItem(ASTORE, JSON.stringify(j)); } catch {}
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (enabled === false && !res) {
    return (
      <section className="panel" aria-labelledby="ai">
        <h2 id="ai">Claude analysis</h2>
        <p className="sub" style={{ margin: 0 }}>Off. Add an <code>ANTHROPIC_API_KEY</code> in Vercel to get spending categories and trend insights. The numbers above work without it.</p>
      </section>
    );
  }
  const stale = res && new Date(res.generatedAt) < new Date(snap.generatedAt);
  return (
    <section className="panel" aria-labelledby="ai">
      <div className="verdict">
        <h2 id="ai">Claude analysis</h2>
        <button className="btn" onClick={run} disabled={busy || !enabled}>{busy ? "Analyzing…" : res ? "Re-analyze" : "Analyze with Claude"}</button>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      {!res ? (
        <p className="sub" style={{ margin: 0 }}>Sends the numbers on this page (not your emails) to Claude for categories and insights. Each run costs a few cents on your Anthropic API account.</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: "1.05rem" }}>
            <span className={`pill ${res.status === "over" ? "bad" : res.status === "close" ? "warn" : "good"}`} style={{ marginRight: 8 }}>{res.status === "over" ? "Over" : res.status === "close" ? "Close" : "Under"}</span>
            {res.headline}
          </p>
          <ul className="notes">
            {res.insights.map((x) => <li key={x.title}><b>{x.title}.</b> {x.detail}</li>)}
          </ul>
          {res.categories.length > 0 && (
            <div className="tablewrap"><table>
              <thead><tr><th style={{ textAlign: "left" }}>Category</th><th>Amount</th><th style={{ textAlign: "left" }}>Note</th></tr></thead>
              <tbody>{res.categories.map((c) => <tr key={c.name}><td className="l">{c.name}</td><td className="num">{fmt(c.amount)}</td><td className="l dim">{c.note}</td></tr>)}</tbody>
            </table></div>
          )}
          {res.watch.length > 0 && <ul className="notes">{res.watch.map((w) => <li key={w}><b>Check:</b> {w}</li>)}</ul>}
          <p className="sub" style={{ margin: 0 }}>Analyzed {new Date(res.generatedAt).toLocaleString()}{stale ? " · newer numbers were pulled since, re-analyze to refresh" : ""}.</p>
        </>
      )}
    </section>
  );
}
