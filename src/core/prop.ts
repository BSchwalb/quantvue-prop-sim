import type { DaySteps } from './equity'

/** Regeln eines Prop-Accounts. Alle Beträge in $ relativ zur Startbalance. */
export interface AccountRules {
  id: string
  name: string
  /** nur zur Anzeige, z. B. 25000 */
  startBalance: number
  /** Gewinnziel der Evaluation */
  profitTarget: number
  /** Trailing Max Drawdown */
  maxDrawdown: number
  /** Gewinn im Funded-Account, ab dem er als freigeschaltet gilt (inkl. Buffer) */
  bufferTarget: number
  /** Gesamtkosten pro gekauftem Account */
  cost: number
  builtin?: boolean
}

export type Outcome = 'unlocked' | 'lost_eval' | 'lost_funded' | 'open'

export interface AccountRun {
  n: number
  buyDay: string
  evalPassDay: string | null
  endDay: string | null
  outcome: Outcome
  /** Handelstage bis zum Ende (Evaluation + Funded) */
  tradingDays: number
}

interface State {
  phase: 'eval' | 'funded'
  bal: number
  peakEod: number
}

/**
 * Grenze (relativ zur Startbalance), bei deren Erreichen der Account verloren ist.
 * Trailing auf Basis des End-of-Day-Höchststands.
 *  Evaluation: trailt immer (peakEod - DD).
 *  Funded: trailt, bis die Grenze die Startbalance erreicht, danach fix bei 0.
 */
export function threshold(s: State, r: AccountRules): number {
  const t = s.peakEod - r.maxDrawdown
  return s.phase === 'funded' ? Math.min(t, 0) : t
}

type DayResult = 'none' | 'lost' | 'passed' | 'unlocked'

/** Einen Handelstag für einen Account abspielen. Mutiert state. */
function runDay(s: State, day: DaySteps, r: AccountRules): DayResult {
  const thr = threshold(s, r)
  const bal0 = s.bal
  const goal = s.phase === 'eval' ? r.profitTarget : r.bufferTarget
  for (const st of day.steps) {
    // konservativ: zuerst Tiefpunkt (inkl. offener Verluste) prüfen, dann Ziel
    if (bal0 + st.low <= thr) {
      s.bal = bal0 + st.low
      return 'lost'
    }
    if (bal0 + st.close >= goal) {
      s.bal = bal0 + st.close
      return s.phase === 'eval' ? 'passed' : 'unlocked'
    }
  }
  s.bal = bal0 + day.pnl
  s.peakEod = Math.max(s.peakEod, s.bal)
  return 'none'
}

export interface CampaignOptions {
  /** Index des ersten Handelstags */
  startIdx?: number
  /** nach der ersten Freischaltung aufhören */
  stopAfterFirstUnlock?: boolean
}

/**
 * Account kaufen → Evaluation → (nächster Handelstag) Funded/Freischaufeln → freigeschaltet oder verloren.
 * Nach jedem Ende wird am nächsten Handelstag ein neuer Account gekauft.
 */
export function simulateCampaign(days: DaySteps[], r: AccountRules, opts: CampaignOptions = {}): AccountRun[] {
  const runs: AccountRun[] = []
  let i = opts.startIdx ?? 0
  while (i < days.length) {
    const run: AccountRun = { n: runs.length + 1, buyDay: days[i].day, evalPassDay: null, endDay: null, outcome: 'open', tradingDays: 0 }
    runs.push(run)
    const s: State = { phase: 'eval', bal: 0, peakEod: 0 }
    let done = false
    for (; i < days.length; i++) {
      run.tradingDays++
      const res = runDay(s, days[i], r)
      if (res === 'lost') {
        run.outcome = s.phase === 'eval' ? 'lost_eval' : 'lost_funded'
        run.endDay = days[i].day
        done = true
      } else if (res === 'passed') {
        run.evalPassDay = days[i].day
        // Funded-Phase beginnt am nächsten Handelstag bei Startbalance
        s.phase = 'funded'
        s.bal = 0
        s.peakEod = 0
      } else if (res === 'unlocked') {
        run.outcome = 'unlocked'
        run.endDay = days[i].day
        done = true
      }
      if (done) {
        i++
        break
      }
    }
    if (done && run.outcome === 'unlocked' && opts.stopAfterFirstUnlock) break
  }
  return runs
}

const DAY_MS = 86400000
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS)

export interface Cycle {
  /** Kauf des ersten Accounts nach der vorherigen Freischaltung */
  startDay: string
  unlockDay: string
  /** Kalendertage vom Start bis zur Freischaltung */
  days: number
  accounts: number
  cost: number
}

export interface CampaignSummary {
  runs: AccountRun[]
  bought: number
  evalPassed: number
  lostEval: number
  lostFunded: number
  unlocked: number
  open: boolean
  totalCost: number
  costPerUnlock: number | null
  /** Ø Kalendertage Kauf → Freischaltung für erfolgreiche Accounts */
  avgDaysAccount: number | null
  cycles: Cycle[]
  /** Ø Kalendertage pro Freischaltung inkl. Fehlversuchen */
  avgCycleDays: number | null
  unlocksPerMonth: number
  evalPassRate: number | null
  fundedSuccessRate: number | null
}

export function summarize(runs: AccountRun[], r: AccountRules, periodFrom: string, periodTo: string): CampaignSummary {
  const finished = runs.filter((x) => x.outcome !== 'open')
  const unlockedRuns = runs.filter((x) => x.outcome === 'unlocked')
  const evalDecided = runs.filter((x) => x.evalPassDay || x.outcome === 'lost_eval')
  const fundedDecided = runs.filter((x) => x.outcome === 'unlocked' || x.outcome === 'lost_funded')

  const cycles: Cycle[] = []
  let cycleStart = 0
  runs.forEach((x, idx) => {
    if (x.outcome === 'unlocked') {
      const accounts = idx - cycleStart + 1
      cycles.push({
        startDay: runs[cycleStart].buyDay,
        unlockDay: x.endDay!,
        days: daysBetween(runs[cycleStart].buyDay, x.endDay!),
        accounts,
        cost: accounts * r.cost,
      })
      cycleStart = idx + 1
    }
  })

  const unlocked = unlockedRuns.length
  const totalCost = runs.length * r.cost
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const months = (daysBetween(periodFrom, periodTo) + 1) / (365.25 / 12)
  return {
    runs,
    bought: runs.length,
    evalPassed: runs.filter((x) => x.evalPassDay).length,
    lostEval: runs.filter((x) => x.outcome === 'lost_eval').length,
    lostFunded: runs.filter((x) => x.outcome === 'lost_funded').length,
    unlocked,
    open: finished.length < runs.length,
    totalCost,
    costPerUnlock: unlocked ? totalCost / unlocked : null,
    avgDaysAccount: avg(unlockedRuns.map((x) => daysBetween(x.buyDay, x.endDay!))),
    cycles,
    avgCycleDays: avg(cycles.map((c) => c.days)),
    unlocksPerMonth: unlocked / Math.max(months, 1e-9),
    evalPassRate: evalDecided.length ? runs.filter((x) => x.evalPassDay).length / evalDecided.length : null,
    fundedSuccessRate: fundedDecided.length ? unlocked / fundedDecided.length : null,
  }
}

export interface RollingPoint {
  startDay: string
  /** null = bis Datenende keine Freischaltung */
  days: number | null
  accounts: number
  cost: number
}

export interface RollingSummary {
  points: RollingPoint[]
  successRate: number
  medianDays: number | null
  p10Days: number | null
  p90Days: number | null
  avgAccounts: number | null
  avgCost: number | null
}

const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null)

/**
 * Rollierender Start: ab jedem Handelstag im Zeitraum bis zur ersten Freischaltung simulieren
 * (Daten bis zum Ende des Backtests werden genutzt).
 */
export function rollingStarts(days: DaySteps[], r: AccountRules, from: string, to: string): RollingSummary {
  const points: RollingPoint[] = []
  days.forEach((d, idx) => {
    if (d.day < from || d.day > to) return
    const runs = simulateCampaign(days, r, { startIdx: idx, stopAfterFirstUnlock: true })
    const last = runs[runs.length - 1]
    const ok = last?.outcome === 'unlocked'
    points.push({
      startDay: d.day,
      days: ok ? daysBetween(d.day, last.endDay!) : null,
      accounts: ok ? runs.length : runs.filter((x) => x.outcome !== 'open').length,
      cost: runs.length * r.cost,
    })
  })
  const ok = points.filter((p) => p.days !== null)
  const sortedDays = ok.map((p) => p.days!).sort((a, b) => a - b)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    points,
    successRate: points.length ? ok.length / points.length : 0,
    medianDays: quantile(sortedDays, 0.5),
    p10Days: quantile(sortedDays, 0.1),
    p90Days: quantile(sortedDays, 0.9),
    avgAccounts: avg(ok.map((p) => p.accounts)),
    avgCost: avg(ok.map((p) => p.cost)),
  }
}
