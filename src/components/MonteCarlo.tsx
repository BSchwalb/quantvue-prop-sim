import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AccountRulesState } from '../accounts'
import { businessDays, dist, drawPaths, runMonteCarlo, type McMode, type McResult } from '../core/montecarlo'
import type { AccountRules } from '../core/prop'
import type { Period } from '../core/types'
import { fmtDate, num2, pct, ratio, usd } from '../format'
import { daysFor, shortLegLabel, type Item } from '../model'
import { usePersistent } from '../store'
import { SimSetup } from './SimSetup'

interface Props {
  items: Item[]
  period: Period
  item: Item
  setItemKey: (k: string) => void
  acc: AccountRulesState
}

interface McSettings {
  n: number
  mode: McMode
  seed: number
}

function mcFor(item: Item, pool: string[], paths: number[][], rules: AccountRules): McResult {
  const byDay = new Map(daysFor(item.legs).map((d) => [d.day, d]))
  return runMonteCarlo(byDay, pool, paths, rules)
}

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }
const range = (a: number, b: number, f: (n: number) => string) => `${f(a)} – ${f(b)}`
const d0 = (n: number) => `${Math.round(n)} T`
const n1 = (n: number) => num2(n).replace(/,00$/, '')

export function MonteCarlo({ items, period, item, setItemKey, acc }: Props) {
  const [cfg, setCfg] = usePersistent<McSettings>('qps.mc', { n: 500, mode: 'bootstrap', seed: 1 })
  const { rules } = acc

  const pool = useMemo(() => businessDays(period.from, period.to), [period])
  const paths = useMemo(() => drawPaths(pool.length, cfg.n, cfg.mode, cfg.seed), [pool, cfg])
  const mc = useMemo(() => mcFor(item, pool, paths, rules), [item, pool, paths, rules])
  const compare = useMemo(
    () => items.map((it) => ({ it, r: mcFor(it, pool, paths, rules) })).sort((a, b) => b.r.unlocks.mean - a.r.unlocks.mean),
    [items, pool, paths, rules],
  )

  const perMonthToDD = useMemo(() => dist(mc.paths.map((p) => (p.maxDrawdown > 0 ? p.netProfit / mc.months / p.maxDrawdown : 0))), [mc])
  const firstHist = useMemo(() => {
    const bin = 15
    const vals = mc.paths.map((p) => p.firstUnlockDays)
    const maxD = Math.max(0, ...vals.filter((v): v is number => v !== null))
    const bins = Array.from({ length: Math.floor(maxD / bin) + 1 }, (_, i) => ({ label: `${i * bin}–${i * bin + bin - 1}`, share: 0 }))
    for (const v of vals) if (v !== null) bins[Math.floor(v / bin)].share += 1 / vals.length
    bins.push({ label: 'keine', share: vals.filter((v) => v === null).length / Math.max(vals.length, 1) })
    return bins
  }, [mc])

  const yearLabel = cfg.mode === 'bootstrap' ? 'Jahr' : `Durchlauf (${num2(mc.months)} Mon.)`

  return (
    <div className="sim">
      <SimSetup items={items} item={item} setItemKey={setItemKey} acc={acc}>
        <div className="sim-row">
          <label className="field">
            <span>Durchläufe</span>
            <select value={cfg.n} onChange={(e) => setCfg({ ...cfg, n: Number(e.target.value) })}>
              {[100, 250, 500, 1000, 2000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Methode</span>
            <select value={cfg.mode} onChange={(e) => setCfg({ ...cfg, mode: e.target.value as McMode })}>
              <option value="bootstrap">Tage ziehen mit Zurücklegen (1 Jahr)</option>
              <option value="shuffle">Tage neu mischen (Zeitraum)</option>
            </select>
          </label>
          <label className="field">
            <span>Seed</span>
            <input type="number" value={cfg.seed} onChange={(e) => setCfg({ ...cfg, seed: Number(e.target.value) || 0 })} />
          </label>
        </div>
        <p className="hint">
          Datenbasis: {pool.length} Werktage im Zeitraum {fmtDate(period.from)} – {fmtDate(period.to)} (oben rechts änderbar), inkl. Tage ohne Trades. Es
          werden ganze Handelstage gezogen, damit Trades mehrerer Algos am selben Tag zusammenbleiben. Alle Strategien und Stacks laufen auf denselben
          {` ${cfg.n}`} synthetischen {cfg.mode === 'bootstrap' ? 'Jahren' : 'Durchläufen'} (gleicher Seed = gleiche Ergebnisse).{' '}
          {cfg.mode === 'shuffle' && 'Beim Mischen bleibt der Gesamtgewinn gleich, nur die Reihenfolge ändert sich.'}
        </p>
      </SimSetup>

      <div className="card">
        <h2>
          Ergebnis pro {yearLabel} · {item.name}
        </h2>
        <div className="kpis">
          <div className="kpi highlight">
            <span>Ø Freischaltungen</span>
            <b>{n1(mc.unlocks.mean)}</b>
            <small>80 % zwischen {range(mc.unlocks.p10, mc.unlocks.p90, n1)} · Median {n1(mc.unlocks.p50)}</small>
          </div>
          <div className="kpi">
            <span>Mind. 1 Freischaltung</span>
            <b>{pct(mc.pAnyUnlock)}</b>
            <small>Wahrscheinlichkeit pro {yearLabel}</small>
          </div>
          <div className="kpi">
            <span>Kosten / Freischaltung</span>
            <b>{mc.costPerUnlock === null ? '–' : usd(mc.costPerUnlock)}</b>
            <small>Ø {n1(mc.bought.mean)} Accounts gekauft</small>
          </div>
          <div className="kpi">
            <span>Dauer bis 1. Freischaltung</span>
            <b>{mc.firstUnlockDays ? d0(mc.firstUnlockDays.p50) : '–'}</b>
            <small>{mc.firstUnlockDays ? `Median · 80 % zwischen ${range(mc.firstUnlockDays.p10, mc.firstUnlockDays.p90, d0)}` : 'keine Freischaltung'}</small>
          </div>
          <div className="kpi">
            <span>Bestehensquote</span>
            <b>{mc.evalPassRate === null ? '–' : pct(mc.evalPassRate)}</b>
            <small>Freischaufeln danach {mc.fundedSuccessRate === null ? '–' : pct(mc.fundedSuccessRate)}</small>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span>Gewinn pro {yearLabel}</span>
            <b>{usd(mc.netProfit.p50)}</b>
            <small>Median · 80 % zwischen {range(mc.netProfit.p10, mc.netProfit.p90, usd)}</small>
          </div>
          <div className="kpi">
            <span>Max DD pro {yearLabel}</span>
            <b>{usd(mc.maxDrawdown.p50)}</b>
            <small>Median · 80 % zwischen {range(mc.maxDrawdown.p10, mc.maxDrawdown.p90, usd)}</small>
          </div>
          <div className="kpi">
            <span>Monat / DD</span>
            <b>{ratio(perMonthToDD.p50)}</b>
            <small>Median · 80 % zwischen {range(perMonthToDD.p10, perMonthToDD.p90, ratio)}</small>
          </div>
        </div>

        <div className="two-col">
          <div>
            <h3>Freischaltungen pro {yearLabel}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mc.unlockHistogram} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="unlocks" stroke="var(--muted)" fontSize={12} />
                <YAxis tickFormatter={(v) => pct(Number(v))} stroke="var(--muted)" fontSize={12} width={48} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `${l} Freischaltungen`} formatter={(v) => [pct(Number(v)), 'Anteil']} cursor={{ fill: 'var(--grid)' }} />
                <Bar isAnimationActive={false} dataKey="share" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h3>Kalendertage bis zur 1. Freischaltung</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={firstHist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => pct(Number(v))} stroke="var(--muted)" fontSize={12} width={48} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => (l === 'keine' ? 'keine Freischaltung' : `${l} Tage`)} formatter={(v) => [pct(Number(v)), 'Anteil']} cursor={{ fill: 'var(--grid)' }} />
                <Bar isAnimationActive={false} dataKey="share" fill="var(--pos)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Vergleich aller Strategien und Stacks</h2>
        <p className="hint">Gleiche Account-Regeln und dieselben synthetischen {cfg.mode === 'bootstrap' ? 'Jahre' : 'Durchläufe'}, sortiert nach Ø Freischaltungen.</p>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="left">Name</th>
                <th className="left">Kontrakte</th>
                <th>Ø Freischaltungen</th>
                <th>P10 – P90</th>
                <th>Mind. 1</th>
                <th>Kosten / Freischaltung</th>
                <th>Median bis 1.</th>
                <th>Bestehensquote</th>
                <th>Gewinn (Median)</th>
                <th>Max DD (Median)</th>
              </tr>
            </thead>
            <tbody>
              {compare.map(({ it, r }) => (
                <tr key={it.key} className={'clickable' + (it.key === item.key ? ' selected' : '')} onClick={() => setItemKey(it.key)}>
                  <td className="left name">{it.name}</td>
                  <td className="left muted">{it.legs.map(shortLegLabel).join(' + ')}</td>
                  <td className="key">{n1(r.unlocks.mean)}</td>
                  <td>{range(r.unlocks.p10, r.unlocks.p90, n1)}</td>
                  <td>{pct(r.pAnyUnlock)}</td>
                  <td>{r.costPerUnlock === null ? '–' : usd(r.costPerUnlock)}</td>
                  <td>{r.firstUnlockDays ? d0(r.firstUnlockDays.p50) : '–'}</td>
                  <td>{r.evalPassRate === null ? '–' : pct(r.evalPassRate)}</td>
                  <td>{usd(r.netProfit.p50)}</td>
                  <td>{usd(r.maxDrawdown.p50)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
