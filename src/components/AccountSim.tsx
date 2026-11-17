import { useMemo } from 'react'
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { rollingStarts, simulateCampaign, summarize, type AccountRules, type AccountRun, type CampaignSummary, type RollingSummary } from '../core/prop'
import { dataRange } from '../core/registry'
import type { Leg, Period } from '../core/types'
import type { AccountRulesState } from '../accounts'
import { SimSetup } from './SimSetup'
import { fmtDate, num2, pct, usd } from '../format'
import { daysFor, shortLegLabel, type Item } from '../model'

function runFor(legs: Leg[], rules: AccountRules, period: Period): { sum: CampaignSummary; roll: RollingSummary } {
  const all = daysFor(legs)
  const inPeriod = all.filter((d) => d.day >= period.from && d.day <= period.to)
  const runs = simulateCampaign(inPeriod, rules)
  return { sum: summarize(runs, rules, period.from, period.to), roll: rollingStarts(all, rules, period.from, period.to) }
}

const OUTCOME: Record<AccountRun['outcome'], { label: string; cls: string }> = {
  unlocked: { label: 'Freigeschaltet', cls: 'pos' },
  lost_eval: { label: 'Verloren (Evaluation)', cls: 'neg' },
  lost_funded: { label: 'Verloren (Freischaufeln)', cls: 'neg' },
  open: { label: 'Läuft noch', cls: 'muted' },
}

const days = (n: number | null) => (n === null ? '–' : `${Math.round(n)} T`)

interface Props {
  items: Item[]
  period: Period
  item: Item
  setItemKey: (k: string) => void
  acc: AccountRulesState
}

export function AccountSim({ items, period, item, setItemKey, acc }: Props) {
  const { rules } = acc
  const { sum, roll } = useMemo(() => runFor(item.legs, rules, period), [item, rules, period])
  const compare = useMemo(
    () => items.map((it) => ({ it, ...runFor(it.legs, rules, period) })).sort((a, b) => b.sum.unlocksPerMonth - a.sum.unlocksPerMonth),
    [items, rules, period],
  )

  const rollChart = roll.points.map((p) => ({ day: p.startDay, days: p.days, fail: p.days === null ? 0 : null }))

  return (
    <div className="sim">
      <SimSetup items={items} item={item} setItemKey={setItemKey} acc={acc}>
        <p className="hint">
          Zeitraum {fmtDate(period.from)} – {fmtDate(period.to)} (oben rechts änderbar). Evaluation: Grenze = EOD-Höchststand − {usd(rules.maxDrawdown)}, trailt bis
          zum Bestehen. Freischaufeln: Neustart bei {usd(rules.startBalance)}, Grenze trailt bis {usd(rules.startBalance)} und bleibt dort. Verletzt wird die
          Grenze intraday inkl. offener Verluste. Nach Ziel oder Verlust wird an diesem Tag nicht weitergehandelt; neuer Account am nächsten Handelstag.
        </p>
      </SimSetup>

      <div className="card">
        <h2>Historischer Durchlauf ab {fmtDate(period.from)}</h2>
        <div className="kpis">
          <div className="kpi highlight">
            <span>Freigeschaltet</span>
            <b>{sum.unlocked}</b>
            <small>{num2(sum.unlocksPerMonth)} pro Monat</small>
          </div>
          <div className="kpi">
            <span>Accounts gekauft</span>
            <b>{sum.bought}</b>
            <small>
              {sum.lostEval} in Eval verloren · {sum.lostFunded} beim Freischaufeln
            </small>
          </div>
          <div className="kpi">
            <span>Kosten gesamt</span>
            <b>{usd(sum.totalCost)}</b>
            <small>pro Freischaltung {sum.costPerUnlock === null ? '–' : usd(sum.costPerUnlock)}</small>
          </div>
          <div className="kpi">
            <span>Ø Dauer pro Freischaltung</span>
            <b>{days(sum.avgCycleDays)}</b>
            <small>inkl. Fehlversuche · erfolgreicher Account allein {days(sum.avgDaysAccount)}</small>
          </div>
          <div className="kpi">
            <span>Erfolg pro gekauftem Account</span>
            <b>{sum.bought ? pct(sum.unlocked / sum.bought) : '–'}</b>
            <small>
              {sum.bought} gekauft → {sum.evalPassed} Eval bestanden ({sum.evalPassRate === null ? '–' : pct(sum.evalPassRate)}) → {sum.unlocked} freigeschaltet (
              {sum.fundedSuccessRate === null ? '–' : pct(sum.fundedSuccessRate)} davon){sum.open ? ' · 1 läuft noch' : ''}
            </small>
          </div>
        </div>

        <h3>Accounts</h3>
        <div className="table-wrap">
          <table className="grid compact">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">Gekauft</th>
                <th className="left">Evaluation bestanden</th>
                <th className="left">Ergebnis</th>
                <th className="left">am</th>
                <th>Kalendertage</th>
                <th>Handelstage</th>
              </tr>
            </thead>
            <tbody>
              {sum.runs.map((r) => (
                <tr key={r.n}>
                  <td>{r.n}</td>
                  <td className="left">{fmtDate(r.buyDay)}</td>
                  <td className="left">{fmtDate(r.evalPassDay)}</td>
                  <td className={'left ' + OUTCOME[r.outcome].cls}>{OUTCOME[r.outcome].label}</td>
                  <td className="left">{fmtDate(r.endDay)}</td>
                  <td>{r.endDay ? Math.round((Date.parse(r.endDay) - Date.parse(r.buyDay)) / 86400000) : '–'}</td>
                  <td>{r.tradingDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Rollierender Start</h2>
        <p className="hint">
          Simulation ab jedem Handelstag im Zeitraum bis zur ersten Freischaltung (bei Bedarf mit Daten bis zum Backtest-Ende {fmtDate(dataRange().to)}).
          Zeigt, wie stark das Ergebnis vom Startzeitpunkt abhängt. Median, Accounts und Kosten zählen nur Starts mit Freischaltung – späte Starts,
          bei denen die Daten vorher enden (rote Punkte), fehlen, daher eher optimistisch. Für mehr Startpunkte oben „Gesamter Backtest“ wählen.
        </p>
        <div className="kpis">
          <div className="kpi">
            <span>Bis Datenende freigeschaltet</span>
            <b>{pct(roll.successRate)}</b>
            <small>
              von {roll.points.length} Startpunkten · {roll.points.filter((p) => p.days === null).length} erreichen das Datenende ohne Freischaltung
            </small>
          </div>
          <div className="kpi highlight">
            <span>Median Dauer bis Freischaltung</span>
            <b>{days(roll.medianDays)}</b>
            <small>
              10 % ≤ {days(roll.p10Days)} · 90 % ≤ {days(roll.p90Days)}
            </small>
          </div>
          <div className="kpi">
            <span>Ø Accounts bis Freischaltung</span>
            <b>{roll.avgAccounts === null ? '–' : num2(roll.avgAccounts)}</b>
          </div>
          <div className="kpi">
            <span>Ø Kosten bis Freischaltung</span>
            <b>{roll.avgCost === null ? '–' : usd(roll.avgCost)}</b>
          </div>
        </div>
        <h3>Kalendertage bis zur ersten Freischaltung je Startdatum</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={rollChart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="day" tickFormatter={fmtDate} minTickGap={40} stroke="var(--muted)" fontSize={12} />
            <YAxis stroke="var(--muted)" fontSize={12} width={50} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
              labelFormatter={(l) => 'Start ' + fmtDate(String(l))}
              formatter={(v, n) => (n === 'fail' ? ['keine Freischaltung bis Datenende', ''] : [`${v} Tage`, 'Dauer'])}
            />
            <Line isAnimationActive={false} type="monotone" dataKey="days" stroke="var(--accent)" dot={false} strokeWidth={2} connectNulls={false} />
            <Scatter isAnimationActive={false} dataKey="fail" fill="var(--neg)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Vergleich aller Strategien und Stacks</h2>
        <p className="hint">Gleiche Account-Regeln und gleicher Zeitraum, sortiert nach Freischaltungen pro Monat.</p>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="left">Name</th>
                <th className="left">Kontrakte</th>
                <th>Freigeschaltet</th>
                <th>pro Monat</th>
                <th>Gekauft</th>
                <th>Kosten / Freischaltung</th>
                <th>Ø Dauer / Freischaltung</th>
                <th>Rollierend: Median</th>
                <th>Rollierend: Erfolg</th>
              </tr>
            </thead>
            <tbody>
              {compare.map(({ it, sum: s, roll: r }) => (
                <tr key={it.key} className={'clickable' + (it.key === item.key ? ' selected' : '')} onClick={() => setItemKey(it.key)}>
                  <td className="left name">{it.name}</td>
                  <td className="left muted">{it.legs.map(shortLegLabel).join(' + ')}</td>
                  <td>{s.unlocked}</td>
                  <td className="key">{num2(s.unlocksPerMonth)}</td>
                  <td>{s.bought}</td>
                  <td>{s.costPerUnlock === null ? '–' : usd(s.costPerUnlock)}</td>
                  <td>{days(s.avgCycleDays)}</td>
                  <td>{days(r.medianDays)}</td>
                  <td>{pct(r.successRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

