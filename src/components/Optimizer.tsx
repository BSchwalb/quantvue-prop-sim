import { useMemo, useRef, useState } from 'react'
import type { McResult } from '../core/montecarlo'
import { periodMonths } from '../core/metrics'
import { comboGrid, makeEvaluator } from '../core/optimize'
import type { AccountRules } from '../core/prop'
import { clampPeriod, library } from '../core/registry'
import type { Period } from '../core/types'
import { pct, ratio, usd } from '../format'
import { dpu, mcFor, n1, successRate, type McSettings } from '../mc'
import type { Item } from '../model'

interface Props {
  item: Item
  period: Period
  cfg: McSettings
  rules: AccountRules
  /** aktuell im Block „Kontrakte testen“ eingestellte Mengen (Ausgangspunkt) */
  current: number[]
  /** Max DD der aktuellen Einstellung (für den Vorschlag des Budgets) */
  currentDD: number
  onApply: (qty: number[]) => void
}

type SortKey = 'profit' | 'unlocks' | 'success' | 'factor'

interface Candidate {
  qty: number[]
  netProfit: number
  maxDrawdown: number
  perMonth: number
  factor: number
  mc: McResult | null
}

/** wie viele Kandidaten (nach Gewinn/Monat) zusätzlich per Monte Carlo bewertet werden */
const MC_CANDIDATES = 25
const SHOW = 5

const tick = () => new Promise((r) => setTimeout(r, 0))

export function Optimizer({ item, period, cfg, rules, current, currentDD, onApply }: Props) {
  const ids = item.legs.map((l) => l.strategyId)
  const [budget, setBudget] = useState<number>(() => Math.ceil((currentDD * 1.4) / 50) * 50 || 1000)
  const [cap, setCap] = useState(20)
  const [sort, setSort] = useState<SortKey>('profit')
  const [status, setStatus] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ key: string; base: Candidate; list: Candidate[]; info: string } | null>(null)
  const runId = useRef(0)

  // Ergebnis gehört zu Algo/Zeitraum/Regeln – bei Änderung nicht mehr anzeigen
  const resultKey = JSON.stringify([ids, period, cfg, rules])
  const shown = result && result.key === resultKey ? result : null

  const run = async () => {
    const id = ++runId.current
    setRunning(true)
    const p = clampPeriod(item.legs, period)
    if (!p) {
      setStatus('Keine Daten im gewählten Zeitraum.')
      setRunning(false)
      return
    }
    const months = periodMonths(p)
    const ev = makeEvaluator(library, ids, p)
    const mkItem = (qty: number[]): Item => ({ ...item, key: `opt:${qty.join('-')}`, legs: ids.map((strategyId, i) => ({ strategyId, qty: qty[i] })) })
    const candidate = (qty: number[]): Candidate => {
      const r = ev.evaluate(qty)
      const perMonth = r.netProfit / months
      return { qty, ...r, perMonth, factor: r.maxDrawdown > 0 ? perMonth / r.maxDrawdown : 0, mc: null }
    }

    // Obergrenze je Algo: so viele Kontrakte, dass der Algo allein das Budget ca. 2× ausschöpfen würde
    const max = ids.map((_, i) => {
      const unit = ids.map((__, j) => (j === i ? 1 : 0))
      const dd1 = Math.max(1, ev.evaluate(unit).maxDrawdown)
      return Math.max(1, Math.min(cap, Math.floor((2 * budget) / dd1)))
    })
    const { step, combos } = comboGrid(max)

    const fit: Candidate[] = []
    for (let i = 0; i < combos.length; i++) {
      const c = candidate(combos[i])
      if (c.maxDrawdown <= budget && c.netProfit > 0) fit.push(c)
      if (i % 2000 === 0) {
        setStatus(`Prüfe Kombinationen … ${i.toLocaleString('de-DE')} / ${combos.length.toLocaleString('de-DE')}`)
        await tick()
        if (id !== runId.current) return
      }
    }
    fit.sort((a, b) => b.perMonth - a.perMonth)
    const top = fit.slice(0, MC_CANDIDATES)
    for (let i = 0; i < top.length; i++) {
      setStatus(`Monte Carlo für die besten Kandidaten … ${i + 1} / ${top.length}`)
      await tick()
      if (id !== runId.current) return
      top[i].mc = mcFor(mkItem(top[i].qty), period, cfg, rules)
    }
    const base = candidate(current)
    base.mc = mcFor(mkItem(current), period, cfg, rules)
    setResult({
      key: resultKey,
      base,
      list: top,
      info:
        `${combos.length.toLocaleString('de-DE')} Kombinationen geprüft (0–${max.join(' / ')} Kontrakte` +
        `${step > 1 ? `, in ${step}er-Schritten` : ''}), ${fit.length.toLocaleString('de-DE')} innerhalb des Budgets, ` +
        `die ${top.length} mit dem höchsten Gewinn/Monat per Monte Carlo bewertet.`,
    })
    setStatus('')
    setRunning(false)
  }

  const sorted = useMemo(() => {
    if (!shown) return []
    const val = (c: Candidate) =>
      sort === 'profit'
        ? c.perMonth
        : sort === 'factor'
          ? c.factor
          : sort === 'unlocks'
            ? (c.mc?.unlocks.mean ?? 0)
            : (successRate(c.mc!) ?? 0)
    return [...shown.list].sort((a, b) => val(b) - val(a) || b.perMonth - a.perMonth).slice(0, SHOW)
  }, [shown, sort])

  const qtyLabel = (qty: number[]) =>
    qty
      .map((q, i) => {
        const m = library.meta[ids[i]]
        const d = q - current[i]
        return { q, text: `${q}× ${m?.instrument ?? '?'}`, d }
      })
      .map(({ text, d }, i) => (
        <span key={i} className="opt-leg">
          {text}
          {d !== 0 && <em className={d > 0 ? 'pos' : 'neg'}> ({d > 0 ? '+' : '−'}{Math.abs(d)})</em>}
        </span>
      ))
      .concat(qty.every((q, i) => q === current[i]) ? [<span key="cur" className="muted"> · aktuell</span>] : [])

  const row = (label: string, c: Candidate, apply: boolean) => (
    <tr key={label + c.qty.join('-')} className={apply ? '' : 'total'}>
      <td className="left name">{label}</td>
      <td className="left">{qtyLabel(c.qty)}</td>
      <td>{usd(c.perMonth)}</td>
      <td>{usd(c.maxDrawdown)}</td>
      <td className={sort === 'factor' ? 'key' : ''}>{ratio(c.factor)}</td>
      <td className={sort === 'unlocks' ? 'key' : ''}>{c.mc ? n1(c.mc.unlocks.mean) : '–'}</td>
      <td className={sort === 'success' ? 'key' : ''}>{c.mc && successRate(c.mc) !== null ? pct(successRate(c.mc)!) : '–'}</td>
      <td>{c.mc ? dpu(c.mc.daysPerUnlock) : '–'}</td>
      <td>{c.mc?.costPerUnlock == null ? '–' : usd(c.mc.costPerUnlock)}</td>
      <td>
        {apply && (
          <button className="ghost" onClick={() => onApply(c.qty)}>
            Übernehmen
          </button>
        )}
      </td>
    </tr>
  )

  return (
    <div className="card">
      <h2>Kontrakte optimieren</h2>
      <p className="hint">
        Gib ein Max-DD-Budget vor: Das Tool prüft alle Kontrakt-Kombinationen der Algos in „{item.name}“, behält die, deren Max DD (gewählter Zeitraum, inkl. offener
        Verluste) im Budget liegt, und bewertet die besten zusätzlich per Monte Carlo mit den aktuellen Account-Regeln.
      </p>
      <div className="sim-row">
        <label className="field">
          <span>Max DD höchstens ($)</span>
          <input type="number" step={50} value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="field">
          <span>max. Kontrakte je Algo</span>
          <input type="number" min={1} value={cap} onChange={(e) => setCap(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label className="field">
          <span>Sortieren nach</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="profit">Ø Gewinn / Monat</option>
            <option value="unlocks">Freischaltungen / Jahr</option>
            <option value="success">Erfolg pro gekauftem Account</option>
            <option value="factor">Faktor (Monat / DD)</option>
          </select>
        </label>
        <div className="row-actions bottom">
          <button onClick={run} disabled={running || budget <= 0}>
            {running ? 'Läuft …' : 'Testen'}
          </button>
        </div>
      </div>
      <p className="hint">Aktueller Max DD: {usd(currentDD)}</p>
      {status && <p className="muted">{status}</p>}
      {shown && (
        <>
          <p className="hint">{shown.info}</p>
          {sorted.length === 0 ? (
            <p className="muted">Keine Kombination mit Gewinn liegt innerhalb von {usd(budget)} Max DD.</p>
          ) : (
            <div className="table-wrap">
              <table className="grid compact">
                <thead>
                  <tr>
                    <th className="left"></th>
                    <th className="left">Kontrakte (Änderung)</th>
                    <th>Ø Gewinn / Monat</th>
                    <th>Max DD</th>
                    <th>Faktor</th>
                    <th>Freischaltungen / Jahr</th>
                    <th>Erfolg / Account</th>
                    <th>Alle … Tage</th>
                    <th>Kosten / Freischaltung</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {row('Aktuell', shown.base, false)}
                  {sorted.map((c, i) => row(`#${i + 1}`, c, true))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
