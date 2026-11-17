import { useMemo } from 'react'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Metrics } from '../core/metrics'
import { fmtDate, fmtMonth, num2, pct, ratio, usd } from '../format'
import { legLabel, type Item } from '../model'

export function Kpis({ m }: { m: Metrics }) {
  return (
    <div className="kpis">
      <div className="kpi">
        <span>Gewinn</span>
        <b className={m.netProfit >= 0 ? 'pos' : 'neg'}>{usd(m.netProfit)}</b>
      </div>
      <div className="kpi">
        <span>Max DD (inkl. offen)</span>
        <b>{usd(m.maxDrawdown)}</b>
        <small>{fmtDate(m.maxDrawdownDay)} · realisiert {usd(m.maxDrawdownClosed)}</small>
      </div>
      <div className="kpi">
        <span>Ø Gewinn / Monat</span>
        <b>{usd(m.avgMonthly)}</b>
        <small>{num2(m.months)} Monate</small>
      </div>
      <div className="kpi highlight">
        <span>Monat / DD</span>
        <b>{ratio(m.monthlyToDD)}</b>
      </div>
      <div className="kpi">
        <span>Trades · Win %</span>
        <b>
          {m.trades} · {pct(m.winRate)}
        </b>
        <small>PF {num2(m.profitFactor)} · max {m.maxLosingStreak} Verluste in Folge</small>
      </div>
      <div className="kpi">
        <span>Schlechtester Tag</span>
        <b className="neg">{usd(m.worstDay)}</b>
        <small>{fmtDate(m.worstDayDate)}</small>
      </div>
    </div>
  )
}

export function dailySeries(m: Metrics) {
  const out: { day: string; close: number; low: number; dd: number }[] = []
  let peak = 0
  for (const s of m.steps) {
    const last = out[out.length - 1]
    if (last && last.day === s.day) {
      last.close = s.close
      last.low = Math.min(last.low, s.low)
    } else out.push({ day: s.day, close: s.close, low: s.low, dd: 0 })
  }
  for (const d of out) {
    d.dd = Math.min(0, d.low - peak)
    peak = Math.max(peak, d.close)
  }
  return out
}

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }

export function EquityCharts({ m, height = 260 }: { m: Metrics; height?: number }) {
  const data = useMemo(() => dailySeries(m), [m])
  return (
    <>
      <h3>Equity (realisiert) und Tiefpunkt inkl. offener Verluste</h3>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={fmtDate} minTickGap={40} stroke="var(--muted)" fontSize={12} />
          <YAxis tickFormatter={usd} stroke="var(--muted)" fontSize={12} width={70} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtDate(String(l))} formatter={(v, n) => [usd(Number(v)), n]} />
          <Line isAnimationActive={false} type="stepAfter" dataKey="low" name="Tiefpunkt" stroke="var(--neg)" strokeOpacity={0.55} dot={false} strokeWidth={1} />
          <Line isAnimationActive={false} type="stepAfter" dataKey="close" name="Kontostand" stroke="var(--accent)" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
      <h3>Drawdown vom Höchststand</h3>
      <ResponsiveContainer width="100%" height={Math.round(height * 0.55)}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={fmtDate} minTickGap={40} stroke="var(--muted)" fontSize={12} />
          <YAxis tickFormatter={usd} stroke="var(--muted)" fontSize={12} width={70} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtDate(String(l))} formatter={(v) => [usd(Number(v)), 'Drawdown']} />
          <ReferenceLine y={-m.maxDrawdown} stroke="var(--neg)" strokeDasharray="4 4" />
          <Area isAnimationActive={false} type="stepAfter" dataKey="dd" stroke="var(--neg)" fill="var(--neg)" fillOpacity={0.2} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}

export function MonthlyChart({ m }: { m: Metrics }) {
  return (
    <>
      <h3>Gewinn pro Monat</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={m.monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={fmtMonth} stroke="var(--muted)" fontSize={12} />
          <YAxis tickFormatter={usd} stroke="var(--muted)" fontSize={12} width={70} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtMonth(String(l))} formatter={(v) => [usd(Number(v)), 'Gewinn']} cursor={{ fill: 'var(--grid)' }} />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <Bar isAnimationActive={false} dataKey="pnl" radius={[3, 3, 0, 0]}>
            {m.monthly.map((r) => (
              <Cell key={r.month} fill={r.pnl >= 0 ? 'var(--pos)' : 'var(--neg)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  )
}

export function Detail({ item, m, onBack }: { item: Item; m: Metrics; onBack: () => void }) {
  return (
    <div className="card">
      <div className="detail-head">
        <button className="ghost" onClick={onBack}>
          ← Übersicht
        </button>
        <div>
          <h2>{item.name}</h2>
          <div className="muted">{item.legs.map(legLabel).join('  +  ')}</div>
        </div>
      </div>
      <Kpis m={m} />
      <EquityCharts m={m} />
      <MonthlyChart m={m} />
      <div className="table-wrap">
        <table className="grid compact">
          <thead>
            <tr>
              <th className="left">Monat</th>
              <th>Trades</th>
              <th>Gewinn</th>
            </tr>
          </thead>
          <tbody>
            {m.monthly.map((r) => (
              <tr key={r.month}>
                <td className="left">{fmtMonth(r.month)}</td>
                <td>{r.trades}</td>
                <td className={r.pnl >= 0 ? 'pos' : 'neg'}>{usd(r.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
