import { useState } from 'react'
import type { Metrics } from '../core/metrics'
import { library } from '../core/registry'
import { fmtDate, num2, pct, ratio, usd } from '../format'
import { shortLegLabel, type Item } from '../model'

type SortKey = 'name' | 'trades' | 'netProfit' | 'maxDrawdown' | 'avgMonthly' | 'monthlyToDD' | 'winRate' | 'profitFactor' | 'worstDay'

const COLS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'netProfit', label: 'Gewinn' },
  { key: 'maxDrawdown', label: 'Max DD', title: 'Vom realisierten Höchststand bis zum Tiefpunkt inkl. offener Buchverluste (MAE)' },
  { key: 'avgMonthly', label: 'Ø / Monat' },
  { key: 'monthlyToDD', label: 'Monat / DD', title: 'Ø Monatsgewinn geteilt durch Max DD' },
  { key: 'trades', label: 'Trades' },
  { key: 'winRate', label: 'Win %' },
  { key: 'profitFactor', label: 'PF' },
  { key: 'worstDay', label: 'Schlechtester Tag' },
]

interface Props {
  items: Item[]
  metrics: Map<string, Metrics>
  qtyOverrides: Record<string, number>
  setQty: (id: string, qty: number) => void
  onOpen: (key: string) => void
}

export function Overview({ items, metrics, qtyOverrides, setQty, onOpen }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'monthlyToDD', dir: -1 })

  const val = (it: Item, k: SortKey): number | string => (k === 'name' ? it.name : (metrics.get(it.key)?.[k] ?? 0))
  const sorted = (list: Item[]) =>
    [...list].sort((a, b) => {
      const x = val(a, sort.key)
      const y = val(b, sort.key)
      return (typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)) * sort.dir
    })

  const head = (
    <tr>
      <th className="left" onClick={() => setSort({ key: 'name', dir: sort.key === 'name' ? (-sort.dir as 1 | -1) : 1 })}>Name</th>
      <th className="left">Kontrakte</th>
      {COLS.map((c) => (
        <th
          key={c.key}
          title={c.title}
          className={sort.key === c.key ? 'sorted' : ''}
          onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? (-sort.dir as 1 | -1) : -1 })}
        >
          {c.label}
          {sort.key === c.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
        </th>
      ))}
    </tr>
  )

  const row = (it: Item) => {
    const m = metrics.get(it.key)
    if (!m) return null
    const algoId = it.kind === 'algo' ? it.legs[0].strategyId : null
    const meta = algoId ? library.meta[algoId] : null
    return (
      <tr key={it.key} onClick={() => onOpen(it.key)} className="clickable">
        <td className="left name">{it.name}</td>
        <td className="left">
          {meta ? (
            <span className="qty" onClick={(e) => e.stopPropagation()}>
              <input
                type="number"
                min={1}
                value={qtyOverrides[meta.id] ?? meta.defaultQty}
                onChange={(e) => setQty(meta.id, Math.max(1, Number(e.target.value) || 1))}
              />
              × {meta.instrument}
            </span>
          ) : (
            <span className="muted">{it.legs.map(shortLegLabel).join(' + ')}</span>
          )}
        </td>
        <td className={m.netProfit >= 0 ? 'pos' : 'neg'}>{usd(m.netProfit)}</td>
        <td title={`am ${fmtDate(m.maxDrawdownDay)} · nur realisiert: ${usd(m.maxDrawdownClosed)}`}>{usd(m.maxDrawdown)}</td>
        <td>{usd(m.avgMonthly)}</td>
        <td className="key">{ratio(m.monthlyToDD)}</td>
        <td>{m.trades}</td>
        <td>{pct(m.winRate)}</td>
        <td>{num2(m.profitFactor)}</td>
        <td className="neg" title={fmtDate(m.worstDayDate)}>{usd(m.worstDay)}</td>
      </tr>
    )
  }

  const algos = items.filter((i) => i.kind === 'algo')
  const stacks = items.filter((i) => i.kind === 'stack')

  return (
    <div className="card">
      <div className="table-wrap">
        <table className="grid">
          <thead>{head}</thead>
          <tbody>
            <tr className="section">
              <td colSpan={10}>Strategien ({algos.length})</td>
            </tr>
            {sorted(algos).map(row)}
            <tr className="section">
              <td colSpan={10}>Stacks ({stacks.length})</td>
            </tr>
            {sorted(stacks).map(row)}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Zeile anklicken für Details. Die Kontraktzahl der Strategien ist direkt in der Tabelle änderbar (gilt für die Einzelansicht, Stacks
        haben eigene Mengen). Max DD = Höchststand bis Tiefpunkt inkl. offener Buchverluste; bei gleichzeitig offenen Trades werden die MAEs
        als gleichzeitig angenommen (Worst Case). Kosten: pro Kontrakt und Roundtrip abgezogen.
      </p>
    </div>
  )
}
