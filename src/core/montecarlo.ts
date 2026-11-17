import type { DaySteps } from './equity'
import { daysBetween, simulateCampaign, summarize, type AccountRules } from './prop'

/** Deterministischer Zufallsgenerator (mulberry32) – gleicher Seed = gleiche Ziehungen */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Alle Werktage (Mo–Fr) im Zeitraum – auch Tage ohne Trades, damit die Handelsfrequenz erhalten bleibt */
export function businessDays(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = new Date(from + 'T00:00:00Z'); iso(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) out.push(iso(d))
  }
  return out
}

/** Werktage pro Jahr (inkl. Feiertage, die im Pool als Tage ohne Trades vorkommen) */
export const YEAR_BUSINESS_DAYS = 261

/** Fortlaufende synthetische Werktags-Daten ab Montag 2001-01-01 (nur für Dauer-Berechnung in Kalendertagen) */
let synth: string[] = []
export function syntheticDates(n: number): string[] {
  if (synth.length < n) synth = businessDays('2001-01-01', `${2001 + Math.ceil(n / 250) + 1}-12-31`)
  return synth.slice(0, n)
}

export type McMode = 'bootstrap' | 'shuffle'

/**
 * Erzeugt N synthetische Jahre als Index-Folgen in den Werktags-Pool.
 *  bootstrap: Tage mit Zurücklegen ziehen, Länge 1 Jahr (261 Werktage) → Jahresergebnis variiert
 *  shuffle:   Pool neu mischen (gleiche Tage, andere Reihenfolge) → Gesamtgewinn identisch
 * Die Ziehungen hängen nur vom Pool und Seed ab, nicht vom Algo → alle Strategien/Stacks
 * werden auf denselben synthetischen Jahren verglichen (Tage bleiben über Algos hinweg synchron).
 */
export function drawPaths(poolSize: number, n: number, mode: McMode, seed: number): number[][] {
  const rng = makeRng(seed)
  const paths: number[][] = []
  for (let k = 0; k < n; k++) {
    if (mode === 'bootstrap') {
      paths.push(Array.from({ length: YEAR_BUSINESS_DAYS }, () => Math.floor(rng() * poolSize)))
    } else {
      const p = Array.from({ length: poolSize }, (_, i) => i)
      for (let i = p.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[p[i], p[j]] = [p[j], p[i]]
      }
      paths.push(p)
    }
  }
  return paths
}

export interface McPathResult {
  unlocks: number
  bought: number
  evalPassed: number
  lostEval: number
  lostFunded: number
  /** Kalendertage bis zur ersten Freischaltung, null = keine im Durchlauf */
  firstUnlockDays: number | null
  /** Dauer jedes abgeschlossenen Zyklus (Start bzw. letzte Freischaltung → nächste Freischaltung) in Kalendertagen */
  cycleDays: number[]
  /** Kalendertage des Durchlaufs */
  calendarDays: number
  netProfit: number
  maxDrawdown: number
}

export interface Dist {
  mean: number
  p10: number
  p50: number
  p90: number
}

export interface McResult {
  paths: McPathResult[]
  /** Länge eines Durchlaufs in Monaten */
  months: number
  unlocks: Dist
  bought: Dist
  netProfit: Dist
  maxDrawdown: Dist
  /** Anteil Durchläufe mit ≥ 1 Freischaltung */
  pAnyUnlock: number
  /** Gesamtkosten / Gesamtfreischaltungen über alle Durchläufe */
  costPerUnlock: number | null
  firstUnlockDays: Dist | null
  /** Ø Kalendertage pro Freischaltung = Gesamttage / Gesamtfreischaltungen (inkl. unfertiger Zyklen am Ende) */
  daysPerUnlock: number | null
  /** Verteilung der abgeschlossenen Zyklen */
  cycleDays: Dist | null
  /** Häufigkeit der Zyklusdauer in 15-Tage-Schritten */
  cycleHistogram: { from: number; share: number }[]
  evalPassRate: number | null
  fundedSuccessRate: number | null
  /** Häufigkeit: Anzahl Freischaltungen → Anteil Durchläufe */
  unlockHistogram: { unlocks: number; share: number }[]
}

export function dist(xs: number[]): Dist {
  if (!xs.length) return { mean: 0, p10: 0, p50: 0, p90: 0 }
  const s = [...xs].sort((a, b) => a - b)
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return { mean: s.reduce((a, b) => a + b, 0) / s.length, p10: q(0.1), p50: q(0.5), p90: q(0.9) }
}

const EMPTY_DAY = (day: string): DaySteps => ({ day, steps: [], pnl: 0 })

/**
 * Monte Carlo für einen Algo/Stack.
 * @param byDay Handelstage des Algos/Stacks (DaySteps relativ zum Tagesbeginn), nach Datum
 * @param pool  Werktags-Pool (Daten), aus dem gezogen wird
 * @param paths Index-Folgen aus drawPaths
 */
export function runMonteCarlo(byDay: Map<string, DaySteps>, pool: string[], paths: number[][], rules: AccountRules): McResult {
  const len = paths[0]?.length ?? 0
  const dates = syntheticDates(len)
  const results: McPathResult[] = []

  for (const path of paths) {
    const days: DaySteps[] = path.map((idx, i) => {
      const src = byDay.get(pool[idx])
      return src ? { ...src, day: dates[i] } : EMPTY_DAY(dates[i])
    })

    // Equity-Kennzahlen des synthetischen Jahres
    let bal = 0
    let peak = 0
    let maxDD = 0
    for (const d of days) {
      for (const st of d.steps) maxDD = Math.max(maxDD, peak - (bal + st.low))
      bal += d.pnl
      peak = Math.max(peak, bal)
    }

    const runs = simulateCampaign(days.filter((d) => d.steps.length), rules)
    const sum = summarize(runs, rules, dates[0], dates[dates.length - 1])
    results.push({
      unlocks: sum.unlocked,
      bought: sum.bought,
      evalPassed: sum.evalPassed,
      lostEval: sum.lostEval,
      lostFunded: sum.lostFunded,
      firstUnlockDays: sum.cycles[0]?.days ?? null,
      cycleDays: sum.cycles.map((c, k) => (k === 0 ? c.days : daysBetween(sum.cycles[k - 1].unlockDay, c.unlockDay))),
      calendarDays: daysBetween(dates[0], dates[dates.length - 1]) + 1,
      netProfit: bal,
      maxDrawdown: maxDD,
    })
  }

  const totU = results.reduce((a, r) => a + r.unlocks, 0)
  const totB = results.reduce((a, r) => a + r.bought, 0)
  const totPassed = results.reduce((a, r) => a + r.evalPassed, 0)
  const totLostEval = results.reduce((a, r) => a + r.lostEval, 0)
  const totLostFunded = results.reduce((a, r) => a + r.lostFunded, 0)
  const first = results.filter((r) => r.firstUnlockDays !== null).map((r) => r.firstUnlockDays!)
  const maxU = results.reduce((a, r) => Math.max(a, r.unlocks), 0)
  const hist = Array.from({ length: maxU + 1 }, (_, u) => ({
    unlocks: u,
    share: results.filter((r) => r.unlocks === u).length / Math.max(results.length, 1),
  }))

  const cyc = results.flatMap((r) => r.cycleDays)
  const totDays = results.reduce((a, r) => a + r.calendarDays, 0)
  const BIN = 15
  const cycleHistogram = Array.from({ length: cyc.length ? Math.floor(Math.max(...cyc) / BIN) + 1 : 0 }, (_, i) => ({ from: i * BIN, share: 0 }))
  for (const c of cyc) cycleHistogram[Math.floor(c / BIN)].share += 1 / cyc.length

  return {
    paths: results,
    daysPerUnlock: totU ? totDays / totU : null,
    cycleDays: cyc.length ? dist(cyc) : null,
    cycleHistogram,
    months: (len / YEAR_BUSINESS_DAYS) * 12,
    unlocks: dist(results.map((r) => r.unlocks)),
    bought: dist(results.map((r) => r.bought)),
    netProfit: dist(results.map((r) => r.netProfit)),
    maxDrawdown: dist(results.map((r) => r.maxDrawdown)),
    pAnyUnlock: results.length ? results.filter((r) => r.unlocks > 0).length / results.length : 0,
    costPerUnlock: totU ? (totB * rules.cost) / totU : null,
    firstUnlockDays: first.length ? dist(first) : null,
    evalPassRate: totPassed + totLostEval ? totPassed / (totPassed + totLostEval) : null,
    fundedSuccessRate: totU + totLostFunded ? totU / (totU + totLostFunded) : null,
    unlockHistogram: hist,
  }
}
