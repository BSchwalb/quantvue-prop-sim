import { useMemo } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import type { AccountRules, TraceRow } from '../core/prop'
import { fmtDate, usd } from '../format'

interface Point {
  x: number
  row?: TraceRow
  evalBal?: number | null
  fundedBal?: number | null
  thr?: number | null
  passed?: number | null
  unlocked?: number | null
  lost?: number | null
}

/** Chart-Daten: je Account/Phase ein eigenes Segment, das bei 0 beginnt (Lücke dazwischen) */
function toPoints(trace: TraceRow[]): Point[] {
  const pts: Point[] = []
  trace.forEach((t, i) => {
    const prev = trace[i - 1]
    if (!prev || prev.n !== t.n || prev.phase !== t.phase) {
      if (prev) pts.push({ x: i - 0.5, row: prev }) // Lücke
      const start: Point = { x: i - 0.35, thr: t.threshold, row: t }
      start[t.phase === 'eval' ? 'evalBal' : 'fundedBal'] = 0
      pts.push(start)
    }
    pts.push({
      x: i,
      row: t,
      evalBal: t.phase === 'eval' ? t.bal : null,
      fundedBal: t.phase === 'funded' ? t.bal : null,
      thr: t.threshold,
      passed: t.event === 'passed' ? t.bal : null,
      unlocked: t.event === 'unlocked' ? t.bal : null,
      lost: t.event === 'lost' ? t.bal : null,
    })
  })
  return pts
}

/** Punkt nur zeichnen, wenn an dieser Stelle wirklich ein Ereignis ist */
const dot =
  (key: 'passed' | 'unlocked' | 'lost', r: number, fill: string) =>
  (p: { cx?: number; cy?: number; payload?: Point }) =>
    p.cx === undefined || p.cy === undefined || p.payload?.[key] == null ? (
      <g />
    ) : (
      <circle cx={p.cx} cy={p.cy} r={r} fill={fill} stroke="var(--surface)" strokeWidth={1.5} />
    )

function TooltipBox({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const row = payload?.[0]?.payload.row
  if (!active || !row) return null
  const ev = { passed: 'Evaluation bestanden', unlocked: 'Freigeschaltet', lost: 'Verloren' }
  return (
    <div className="chart-tip">
      <b>{fmtDate(row.day)}</b> · Account #{row.n} · {row.phase === 'eval' ? 'Evaluation' : 'Freischaufeln'}
      <div>Kontostand: {usd(row.bal)}</div>
      <div>Tiefpunkt des Tages: {usd(row.low)}</div>
      <div>Verlustgrenze: {usd(row.threshold)}</div>
      {row.event && <div className={row.event === 'lost' ? 'neg' : 'pos'}>{ev[row.event]}</div>}
    </div>
  )
}

export function AccountEquity({ trace, rules }: { trace: TraceRow[]; rules: AccountRules }) {
  const pts = useMemo(() => toPoints(trace), [trace])
  if (!trace.length) return null
  const tick = (x: number) => {
    const t = trace[Math.min(trace.length - 1, Math.max(0, Math.round(x)))]
    return t ? fmtDate(t.day) : ''
  }
  return (
    <>
      <h3>Equity-Verlauf der Accounts</h3>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--accent)' }} /> Evaluation
        </span>
        <span>
          <i style={{ background: 'var(--violet)' }} /> Freischaufeln
        </span>
        <span>
          <i className="dash" /> Verlustgrenze
        </span>
        <span>
          <i className="dot small" /> Evaluation bestanden
        </span>
        <span>
          <i className="dot big" /> Freigeschaltet
        </span>
        <span>
          <i className="dot lost" /> Verloren
        </span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={pts} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickFormatter={tick} stroke="var(--muted)" fontSize={12} tickCount={10} />
          <YAxis tickFormatter={usd} stroke="var(--muted)" fontSize={12} width={70} />
          <Tooltip content={<TooltipBox />} />
          <ReferenceLine y={0} stroke="var(--muted)" strokeOpacity={0.6} />
          <ReferenceLine y={rules.profitTarget} stroke="var(--accent)" strokeDasharray="2 4" strokeOpacity={0.6} />
          <ReferenceLine y={rules.bufferTarget} stroke="var(--violet)" strokeDasharray="2 4" strokeOpacity={0.6} />
          <Line isAnimationActive={false} dataKey="thr" stroke="var(--neg)" strokeDasharray="5 4" strokeWidth={1.2} dot={false} connectNulls={false} type="stepAfter" />
          <Line isAnimationActive={false} dataKey="evalBal" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls={false} />
          <Line isAnimationActive={false} dataKey="fundedBal" stroke="var(--violet)" strokeWidth={2} dot={false} connectNulls={false} />
          <Scatter isAnimationActive={false} dataKey="passed" shape={dot('passed', 5, 'var(--pos)')} />
          <Scatter isAnimationActive={false} dataKey="unlocked" shape={dot('unlocked', 9, 'var(--pos)')} />
          <Scatter isAnimationActive={false} dataKey="lost" shape={dot('lost', 5, 'var(--neg)')} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="hint">
        Kontostand relativ zur Startbalance (0 = {usd(rules.startBalance)}) am Tagesende bzw. beim Ereignis. Gepunktete Linien: Profit Target ({usd(rules.profitTarget)})
        und Freischalt-Ziel ({usd(rules.bufferTarget)}). Nach jedem Phasenwechsel bzw. neuen Account startet die Linie wieder bei 0.
      </p>
    </>
  )
}
