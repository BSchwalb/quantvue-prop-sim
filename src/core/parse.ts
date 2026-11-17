import Papa from 'papaparse'
import type { RawTrade } from './types'

/** "2026-01-07 09:35" -> Minuten seit Epoch, ohne Zeitzonen-Umrechnung */
export function toMinutes(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s.trim())
  if (!m) throw new Error(`Ungültiges Datum: ${s}`)
  const [, y, mo, d, h, mi] = m.map(Number)
  return Date.UTC(y, mo - 1, d, h, mi) / 60000
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Liest einen QuantVue-Backtest-Export (CSV).
 * Erwartete Spalten: direction, entry_date, exit_date, pnl_points, exit_reason, mae, mfe.
 * pnl_points, mae und mfe sind Punkte pro 1 Kontrakt; die Kontraktzahl wird erst
 * beim Skalieren (Leg.qty) angewendet.
 */
export function parseBacktestCsv(strategyId: string, csv: string): RawTrade[] {
  const res = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true })
  const trades: RawTrade[] = res.data.map((r, i) => {
    const entryT = toMinutes(r.entry_date)
    let exitT = toMinutes(r.exit_date)
    if (exitT <= entryT) exitT = entryT + 0.5
    return {
      strategyId,
      index: Number(r['#']) || i + 1,
      direction: r.direction === 'short' ? 'short' : 'long',
      entryT,
      exitT,
      day: r.entry_date.slice(0, 10),
      pnlPoints: num(r.pnl_points),
      maePoints: Math.min(0, num(r.mae)),
      mfePoints: Math.max(0, num(r.mfe)),
      exitReason: r.exit_reason ?? '',
    }
  })
  return trades.sort((a, b) => a.entryT - b.entryT)
}
