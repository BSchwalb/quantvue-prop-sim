import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AccountRulesState } from '../accounts'
import { dist, type McMode, type McResult } from '../core/montecarlo'
import type { Period } from '../core/types'
import { fmtDate, num2, pct, ratio, usd } from '../format'
import { metricsFor, shortLegLabel, type Item } from '../model'
import { d0, dpu, mcFor, n1, poolFor, range, rates, type McSettings } from '../mc'
import { Optimizer } from './Optimizer'
import { library } from '../core/registry'
import { usePersistent } from '../store'
import { SimSetup } from './SimSetup'

interface Props {
  items: Item[]
  period: Period
  item: Item
  setItemKey: (k: string) => void
  acc: AccountRulesState
}

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }

export function MonteCarlo({ items, period, item, setItemKey, acc }: Props) {
  const [cfg, setCfg] = usePersistent<McSettings>('qps.mc', { n: 500, mode: 'bootstrap', seed: 1 })
  const { rules } = acc

  const pool = useMemo(() => poolFor(item, period), [item, period])

  // Temporäre Kontraktzahlen für den gewählten Algo/Stack (werden nicht gespeichert)
  const [ov, setOv] = useState<{ key: string; qty: Record<string, number> }>({ key: item.key, qty: {} })
  const qtyOv = ov.key === item.key ? ov.qty : {}
  const setQty = (id: string, q: number) => setOv({ key: item.key, qty: { ...qtyOv, [id]: q } })
  const variant = useMemo<Item | null>(() => {
    const legs = item.legs.map((l) => ({ ...l, qty: qtyOv[l.strategyId] ?? l.qty }))
    if (legs.every((l, i) => l.qty === item.legs[i].qty) || !legs.some((l) => l.qty > 0)) return null
    return { ...item, key: item.key + ':mod', name: item.name + ' (angepasst)', legs }
  }, [item, qtyOv])
  const active = variant ?? item
  // historische Kennzahlen (gewählter Zeitraum) für Original und Anpassung
  const histBase = useMemo(() => metricsFor(item.legs, period), [item, period])
  const histActive = useMemo(() => (variant ? metricsFor(variant.legs, period) : histBase), [variant, histBase, period])
  const currentQty = item.legs.map((l) => qtyOv[l.strategyId] ?? l.qty)

  const baseMc = useMemo(() => mcFor(item, period, cfg, rules), [item, period, cfg, rules])
  const mc = useMemo(() => (variant ? mcFor(variant, period, cfg, rules) : baseMc), [variant, baseMc, period, cfg, rules])
  const compare = useMemo(() => {
    const rows = items.map((it) => ({ it, r: mcFor(it, period, cfg, rules) }))
    if (variant) rows.push({ it: variant, r: mc })
    return rows.filter((x) => x.r.paths.length).sort((a, b) => b.r.unlocks.mean - a.r.unlocks.mean)
  }, [items, period, cfg, rules, variant, mc])

  const perMonthToDD = useMemo(() => dist(mc.paths.map((p) => (p.maxDrawdown > 0 ? p.netProfit / mc.months / p.maxDrawdown : 0))), [mc])
  const funnel = useMemo(() => {
    const n = Math.max(mc.paths.length, 1)
    const avg = (f: (p: McResult['paths'][number]) => number) => mc.paths.reduce((a, p) => a + f(p), 0) / n
    const bought = avg((p) => p.bought)
    const passed = avg((p) => p.evalPassed)
    const unlocked = avg((p) => p.unlocks)
    const open = bought - avg((p) => p.lostEval) - avg((p) => p.lostFunded) - unlocked
    return { bought, passed, unlocked, open }
  }, [mc])
  const cycleHist = mc.cycleHistogram.map((h) => ({ label: `${h.from}–${h.from + 14}`, share: h.share }))

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
          Datenbasis für {item.name}: {pool.length} Werktage {pool.length ? `(${fmtDate(pool[0])} – ${fmtDate(pool[pool.length - 1])})` : ''} – gewählter Zeitraum (oben rechts), beschränkt auf den Bereich, in dem alle Algos Daten haben; inkl. Tage ohne Trades. Es
          werden ganze Handelstage gezogen, damit Trades mehrerer Algos am selben Tag zusammenbleiben. Strategien und Stacks mit gleicher Datenbasis laufen auf denselben
          {` ${cfg.n}`} synthetischen {cfg.mode === 'bootstrap' ? 'Jahren' : 'Durchläufen'} (gleicher Seed = gleiche Ergebnisse).{' '}
          {cfg.mode === 'shuffle' && 'Beim Mischen bleibt der Gesamtgewinn gleich, nur die Reihenfolge ändert sich.'}
        </p>
      </SimSetup>

      <div className="card">
        <div className="row-head">
          <h2>Kontrakte testen</h2>
          {variant && (
            <button className="ghost" onClick={() => setOv({ key: item.key, qty: {} })}>
              Zurücksetzen
            </button>
          )}
        </div>
        <p className="hint">
          Nur temporär für diese Ansicht – ändert weder die Übersicht noch gespeicherte Stacks. 0 Kontrakte = Algo aus dem Stack nehmen.
        </p>
        <div className="sim-row">
          {item.legs.map((l) => {
            const m = library.meta[l.strategyId]
            const q = qtyOv[l.strategyId] ?? l.qty
            return (
              <div key={l.strategyId} className={'field leg-field' + (q !== l.qty ? ' changed' : '')}>
                <span>
                  {m?.name ?? l.strategyId} · {m?.instrument} (Original {l.qty})
                </span>
                <span className="stepper">
                  <button className="ghost" onClick={() => setQty(l.strategyId, Math.max(0, q - 1))}>
                    −
                  </button>
                  <input type="number" min={0} value={q} onChange={(e) => setQty(l.strategyId, Math.max(0, Number(e.target.value) || 0))} />
                  <button className="ghost" onClick={() => setQty(l.strategyId, q + 1)}>
                    +
                  </button>
                </span>
              </div>
            )
          })}
        </div>
        <div className="kpis compact-kpis">
          {[
            { label: 'Ø Gewinn / Monat', a: histActive.avgMonthly, b: histBase.avgMonthly, f: usd, better: 1 },
            { label: 'Max DD', a: histActive.maxDrawdown, b: histBase.maxDrawdown, f: usd, better: -1 },
            { label: 'Faktor (Monat / DD)', a: histActive.monthlyToDD, b: histBase.monthlyToDD, f: ratio, better: 1 },
          ].map(({ label, a, b, f, better }) => (
            <div key={label} className={'kpi' + (label.startsWith('Faktor') ? ' highlight' : '')}>
              <span>{label}</span>
              <b>{f(a)}</b>
              <small>
                {variant ? (
                  <>
                    Original {f(b)}{' '}
                    {a !== b && <em className={(a - b) * better > 0 ? 'pos' : 'neg'}>({a > b ? '+' : '−'}{f(Math.abs(a - b))})</em>}
                  </>
                ) : (
                  `historisch, ${fmtDate(histBase.period.from)} – ${fmtDate(histBase.period.to)}`
                )}
              </small>
            </div>
          ))}
        </div>
        {variant && (
          <div className="table-wrap">
            <table className="grid compact">
              <thead>
                <tr>
                  <th className="left"></th>
                  <th className="left">Kontrakte</th>
                  <th>Ø Freischaltungen</th>
                  <th>Alle … Tage</th>
                  <th>Kosten / Freischaltung</th>
                  <th>Eval → Freigeschaltet</th>
                  <th>Gewinn (Median)</th>
                  <th>Max DD (Median)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Original', it: item, r: baseMc },
                  { label: 'Angepasst', it: variant, r: mc },
                ].map(({ label, it, r }) => (
                  <tr key={label}>
                    <td className="left name">{label}</td>
                    <td className="left muted">{it.legs.filter((l) => l.qty > 0).map(shortLegLabel).join(' + ')}</td>
                    <td className="key">{n1(r.unlocks.mean)}</td>
                    <td>{dpu(r.daysPerUnlock)}</td>
                    <td>{r.costPerUnlock === null ? '–' : usd(r.costPerUnlock)}</td>
                    <td>{rates(r)}</td>
                    <td>{usd(r.netProfit.p50)}</td>
                    <td>{usd(r.maxDrawdown.p50)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Optimizer
        key={item.key}
        item={item}
        period={period}
        cfg={cfg}
        rules={rules}
        current={currentQty}
        currentDD={histActive.maxDrawdown}
        onApply={(qty) => {
          setOv({ key: item.key, qty: Object.fromEntries(item.legs.map((l, i) => [l.strategyId, qty[i]])) })
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />

      {!mc.paths.length && (
        <div className="card">
          <p className="muted">Für {item.name} gibt es im gewählten Zeitraum keine Daten. Bitte oben einen anderen Zeitraum wählen.</p>
        </div>
      )}

      {mc.paths.length > 0 && (
      <div className="card">
        <h2>
          Ergebnis pro {yearLabel} · {active.name}
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
            <span>Alle … Tage eine Freischaltung</span>
            <b>{dpu(mc.daysPerUnlock)}</b>
            <small>
              {mc.cycleDays
                ? `je Zyklus: Median ${d0(mc.cycleDays.p50)} · 80 % zwischen ${range(mc.cycleDays.p10, mc.cycleDays.p90, d0)}`
                : 'keine Freischaltung'}
            </small>
          </div>
          <div className="kpi">
            <span>Erfolg pro gekauftem Account</span>
            <b>{funnel.bought ? pct(funnel.unlocked / funnel.bought) : '–'}</b>
            <small>
              Ø {n1(funnel.bought)} gekauft → {n1(funnel.passed)} Eval bestanden ({mc.evalPassRate === null ? '–' : pct(mc.evalPassRate)}) →{' '}
              {n1(funnel.unlocked)} freigeschaltet ({mc.fundedSuccessRate === null ? '–' : pct(mc.fundedSuccessRate)} davon)
              {funnel.open >= 0.05 ? ` · ${n1(funnel.open)} laufen am Ende noch` : ''}
            </small>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span>Gewinn pro {yearLabel}</span>
            <b>{usd(mc.netProfit.p50)}</b>
            <small>Median · 80 % zwischen {range(mc.netProfit.p10, mc.netProfit.p90, usd)}</small>
          </div>
          <div className="kpi">
            <span>Ø Gewinn pro Monat</span>
            <b>{usd(mc.netProfit.mean / mc.months)}</b>
            <small>Median {usd(mc.netProfit.p50 / mc.months)} · 80 % zwischen {range(mc.netProfit.p10 / mc.months, mc.netProfit.p90 / mc.months, usd)}</small>
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
            <h3>Kalendertage pro Freischaltung (je Zyklus)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cycleHist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => pct(Number(v))} stroke="var(--muted)" fontSize={12} width={48} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `${l} Tage`} formatter={(v) => [pct(Number(v)), 'Anteil']} cursor={{ fill: 'var(--grid)' }} />
                <Bar isAnimationActive={false} dataKey="share" fill="var(--pos)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      )}

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
                <th>Alle … Tage</th>
                <th>Eval → Freigeschaltet</th>
                <th>Gewinn (Median)</th>
                <th>Max DD (Median)</th>
              </tr>
            </thead>
            <tbody>
              {compare.map(({ it, r }) => (
                <tr key={it.key} className={'clickable' + (it.key === item.key ? ' selected' : '')} onClick={() => setItemKey(it.key)}>
                  <td className="left name">{it.name}</td>
                  <td className="left muted">{it.legs.filter((l) => l.qty > 0).map(shortLegLabel).join(' + ')}</td>
                  <td className="key">{n1(r.unlocks.mean)}</td>
                  <td>{range(r.unlocks.p10, r.unlocks.p90, n1)}</td>
                  <td>{pct(r.pAnyUnlock)}</td>
                  <td>{r.costPerUnlock === null ? '–' : usd(r.costPerUnlock)}</td>
                  <td>{dpu(r.daysPerUnlock)}</td>
                  <td>{rates(r)}</td>
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
