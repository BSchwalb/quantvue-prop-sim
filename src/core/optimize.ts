import type { Library } from './equity'
import type { Period } from './types'

/**
 * Schnelle Auswertung vieler Kontrakt-Kombinationen für feste Algos.
 *
 * Alle Werte skalieren linear mit der Kontraktzahl (auch MAE inkl. Kosten:
 * min(mae·k − c, pnl) = q · min(maeUnit, pnlUnit)), daher werden die Ereignisse
 * (Ein-/Ausstiege) einmal sortiert und pro Kombination nur noch mit den Mengen
 * gewichtet durchlaufen. Ergebnis ist identisch mit computeMetrics (Gewinn, Max DD).
 */
export interface FastEvaluator {
  /** Gewinn und Max DD (vom realisierten Höchststand bis Tiefpunkt inkl. offener Verluste) */
  evaluate(qty: number[]): { netProfit: number; maxDrawdown: number }
}

export function makeEvaluator(lib: Library, strategyIds: string[], period: Period): FastEvaluator {
  // Ereignisse: leg-Index, offen/zu, Einheitswerte für 1 Kontrakt
  type Ev = { t: number; open: boolean; leg: number; pnl: number; mae: number }
  const evs: Ev[] = []
  strategyIds.forEach((id, leg) => {
    const meta = lib.meta[id]
    const trades = lib.trades[id]
    if (!meta || !trades) return
    for (const t of trades) {
      if (t.day < period.from || t.day > period.to) continue
      const pnl = t.pnlPoints * meta.pointValue - meta.costPerContract
      const mae = Math.min(t.maePoints * meta.pointValue - meta.costPerContract, pnl)
      evs.push({ t: t.entryT, open: true, leg, pnl, mae })
      evs.push({ t: t.exitT, open: false, leg, pnl, mae })
    }
  })
  // gleiche Reihenfolge wie buildSteps: nach Zeit, bei Gleichstand zuerst schließen
  evs.sort((a, b) => a.t - b.t || Number(a.open) - Number(b.open))
  const n = strategyIds.length

  return {
    evaluate(qty: number[]) {
      const openMae = new Float64Array(n)
      let bal = 0
      let peak = 0
      let maxDD = 0
      for (const e of evs) {
        const q = qty[e.leg]
        if (!q) continue
        if (e.open) openMae[e.leg] += e.mae
        else {
          openMae[e.leg] -= e.mae
          bal += q * e.pnl
        }
        let low = bal
        for (let i = 0; i < n; i++) if (qty[i]) low += qty[i] * openMae[i]
        if (peak - low > maxDD) maxDD = peak - low
        if (bal > peak) peak = bal
      }
      return { netProfit: bal, maxDrawdown: maxDD }
    },
  }
}

/**
 * Alle Mengen-Kombinationen 0..max[i] (Schrittweite step), ohne die reine 0-Kombination.
 * Schrittweite so gewählt, dass höchstens `limit` Kombinationen entstehen.
 */
export function comboGrid(max: number[], limit = 60000): { step: number; combos: number[][] } {
  let step = 1
  const count = (s: number) => max.reduce((a, m) => a * (Math.floor(m / s) + 1), 1)
  while (count(step) > limit) step++
  const values = max.map((m) => {
    const v: number[] = []
    for (let q = 0; q <= m; q += step) v.push(q)
    return v
  })
  const combos: number[][] = []
  const rec = (i: number, cur: number[]) => {
    if (i === values.length) {
      if (cur.some((q) => q > 0)) combos.push([...cur])
      return
    }
    for (const q of values[i]) {
      cur.push(q)
      rec(i + 1, cur)
      cur.pop()
    }
  }
  rec(0, [])
  return { step, combos }
}
