import type { Leg, Period, RawTrade, ScaledTrade, StrategyMeta, Step } from './types'

export interface Library {
  meta: Record<string, StrategyMeta>
  trades: Record<string, RawTrade[]>
}

/** Trades aller Legs in $ umrechnen (Kontraktzahl × $/Punkt, minus Kosten pro Kontrakt). */
export function scaleLegs(lib: Library, legs: Leg[], period?: Period): ScaledTrade[] {
  const out: ScaledTrade[] = []
  for (const leg of legs) {
    const meta = lib.meta[leg.strategyId]
    const raw = lib.trades[leg.strategyId]
    if (!meta || !raw || leg.qty <= 0) continue
    const k = meta.pointValue * leg.qty
    const cost = meta.costPerContract * leg.qty
    for (const t of raw) {
      if (period && (t.day < period.from || t.day > period.to)) continue
      const pnl = t.pnlPoints * k - cost
      out.push({
        strategyId: t.strategyId,
        entryT: t.entryT,
        exitT: t.exitT,
        day: t.day,
        pnl,
        // Kosten fallen spätestens beim Exit an -> konservativ schon im MAE berücksichtigen
        mae: Math.min(t.maePoints * k - cost, pnl),
        mfe: Math.max(t.mfePoints * k - cost, pnl, 0),
        win: pnl > 0,
      })
    }
  }
  return out.sort((a, b) => a.entryT - b.entryT)
}

/**
 * Equity-Pfad über alle Trades (auch überlappende Trades mehrerer Algos).
 * Bei jedem Ein-/Ausstieg entsteht ein Step:
 *  close = realisierter Kontostand
 *  low   = close + Summe der MAE aller offenen Trades (Worst Case: alle MAEs gleichzeitig)
 *  high  = close + Summe der MFE aller offenen Trades
 */
export function buildSteps(trades: ScaledTrade[]): Step[] {
  type Ev = { t: number; open: boolean; tr: ScaledTrade }
  const evs: Ev[] = []
  for (const tr of trades) {
    evs.push({ t: tr.entryT, open: true, tr })
    evs.push({ t: tr.exitT, open: false, tr })
  }
  // gleiche Zeit: zuerst schließen, dann öffnen
  evs.sort((a, b) => a.t - b.t || Number(a.open) - Number(b.open))

  const open = new Set<ScaledTrade>()
  let bal = 0
  const steps: Step[] = []
  for (const e of evs) {
    if (e.open) open.add(e.tr)
    else {
      open.delete(e.tr)
      bal += e.tr.pnl
    }
    let lo = 0
    let hi = 0
    for (const o of open) {
      lo += o.mae
      hi += o.mfe
    }
    steps.push({ t: e.t, day: e.tr.day, close: bal, low: bal + lo, high: bal + hi })
  }
  return steps
}

export interface DaySteps {
  day: string
  /** Steps relativ zum Kontostand bei Tagesbeginn */
  steps: { close: number; low: number; high: number }[]
  /** Tagesergebnis */
  pnl: number
}

/** Steps nach Handelstag gruppieren, Werte relativ zum Tagesbeginn. */
export function groupByDay(steps: Step[]): DaySteps[] {
  const days: DaySteps[] = []
  let prevClose = 0
  let cur: DaySteps | null = null
  let dayOpen = 0
  for (const s of steps) {
    if (!cur || cur.day !== s.day) {
      if (cur) cur.pnl = prevClose - dayOpen
      dayOpen = prevClose
      cur = { day: s.day, steps: [], pnl: 0 }
      days.push(cur)
    }
    cur.steps.push({ close: s.close - dayOpen, low: s.low - dayOpen, high: s.high - dayOpen })
    prevClose = s.close
  }
  if (cur) cur.pnl = prevClose - dayOpen
  return days
}
