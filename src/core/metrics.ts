import type { Period, ScaledTrade, Step } from './types'
import { buildSteps } from './equity'

export interface MonthRow {
  month: string // YYYY-MM
  pnl: number
  trades: number
}

export interface Metrics {
  /** tatsächlich ausgewerteter Zeitraum (ggf. auf den Datenbereich beschränkt) */
  period: Period
  trades: number
  winRate: number
  profitFactor: number
  netProfit: number
  /** Max Drawdown vom realisierten Höchststand bis zum Tiefpunkt inkl. offener Buchverluste */
  maxDrawdown: number
  maxDrawdownDay: string | null
  /** Max Drawdown nur auf realisierte (geschlossene) Trades */
  maxDrawdownClosed: number
  months: number
  avgMonthly: number
  /** Ø Monatsgewinn / Max Drawdown – die Kernkennzahl */
  monthlyToDD: number
  worstDay: number
  worstDayDate: string | null
  maxLosingStreak: number
  monthly: MonthRow[]
  steps: Step[]
}

const DAY_MS = 86400000
const MONTH_DAYS = 365.25 / 12

export function periodMonths(p: Period): number {
  const d = (Date.parse(p.to) - Date.parse(p.from)) / DAY_MS + 1
  return Math.max(d, 1) / MONTH_DAYS
}

export function computeMetrics(trades: ScaledTrade[], period: Period): Metrics {
  const steps = buildSteps(trades)

  let peak = 0
  let maxDD = 0
  let maxDDDay: string | null = null
  let maxDDClosed = 0
  for (const s of steps) {
    const dd = peak - s.low
    if (dd > maxDD) {
      maxDD = dd
      maxDDDay = s.day
    }
    peak = Math.max(peak, s.close)
    maxDDClosed = Math.max(maxDDClosed, peak - s.close)
  }

  let wins = 0
  let grossWin = 0
  let grossLoss = 0
  let streak = 0
  let maxStreak = 0
  const byDay = new Map<string, number>()
  const byMonth = new Map<string, MonthRow>()
  for (const t of trades) {
    if (t.pnl > 0) {
      wins++
      grossWin += t.pnl
      streak = 0
    } else {
      grossLoss -= t.pnl
      if (t.pnl < 0) maxStreak = Math.max(maxStreak, ++streak)
    }
    // Gewinn/Verlust wird am Ausstiegstag realisiert
    byDay.set(t.exitDay, (byDay.get(t.exitDay) ?? 0) + t.pnl)
    const m = t.exitDay.slice(0, 7)
    const row = byMonth.get(m) ?? { month: m, pnl: 0, trades: 0 }
    row.pnl += t.pnl
    row.trades++
    byMonth.set(m, row)
  }

  // alle Monate des Zeitraums auflisten (auch ohne Trades)
  const monthly: MonthRow[] = []
  for (let d = new Date(period.from.slice(0, 7) + '-01'); d.toISOString().slice(0, 10) <= period.to; ) {
    const m = d.toISOString().slice(0, 7)
    monthly.push(byMonth.get(m) ?? { month: m, pnl: 0, trades: 0 })
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  }

  let worstDay = 0
  let worstDayDate: string | null = null
  for (const [d, v] of byDay) {
    if (v < worstDay) {
      worstDay = v
      worstDayDate = d
    }
  }

  const netProfit = grossWin - grossLoss
  const months = periodMonths(period)
  const avgMonthly = netProfit / months
  return {
    period,
    trades: trades.length,
    winRate: trades.length ? wins / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    netProfit,
    maxDrawdown: maxDD,
    maxDrawdownDay: maxDDDay,
    maxDrawdownClosed: maxDDClosed,
    months,
    avgMonthly,
    monthlyToDD: maxDD > 0 ? avgMonthly / maxDD : 0,
    worstDay,
    worstDayDate,
    maxLosingStreak: maxStreak,
    monthly,
    steps,
  }
}
