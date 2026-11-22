import strategies from '../data/strategies.json'
import builtinStacks from '../data/stacks.json'
import { parseBacktestCsv } from './parse'
import type { Library } from './equity'
import type { Leg, Period, RawTrade, Stack, StrategyMeta } from './types'

const csvFiles = import.meta.glob('../data/strategies/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function load(): Library {
  const meta: Record<string, StrategyMeta> = {}
  const trades: Record<string, RawTrade[]> = {}
  for (const s of strategies as StrategyMeta[]) {
    const csv = csvFiles[`../data/strategies/${s.file}`]
    if (!csv) {
      console.warn(`CSV fehlt für ${s.id}: ${s.file}`)
      continue
    }
    meta[s.id] = s
    trades[s.id] = parseBacktestCsv(s.id, csv)
  }
  return { meta, trades }
}

export const library: Library = load()

export const BUILTIN_STACKS: Stack[] = (builtinStacks as Stack[]).map((s) => ({ ...s, builtin: true }))

/** Toleranz: liegt der letzte Trade eines Algos so nah am Datenende, gilt er bis zum Datenende als aktiv */
const ACTIVE_UNTIL_END_DAYS = 45

/**
 * Datenbereich eines Algos: ab dem Monatsersten des ersten Trades bis zum letzten Trade –
 * bzw. bis zum allgemeinen Datenende, wenn der letzte Trade weniger als 45 Tage davor liegt
 * (seltene Trades bedeuten nicht, dass der Backtest früher endet).
 */
export function strategyRange(id: string, lib: Library = library): Period | null {
  const ts = lib.trades[id]
  if (!ts?.length) return null
  const end = dataRange(lib).to
  const last = ts.reduce((m, t) => (t.exitDay > m ? t.exitDay : m), ts[ts.length - 1].exitDay)
  const gap = (Date.parse(end) - Date.parse(last)) / 86400000
  return { from: ts[0].day.slice(0, 8) + '01', to: gap <= ACTIVE_UNTIL_END_DAYS ? end : last }
}

/**
 * Datenbereich, in dem ALLE Algos der Legs Daten haben (Schnittmenge).
 * Ein Stack aus einem Algo ab 2024 und einem ab 2026 wird so nur ab 2026 bewertet.
 */
export function legsRange(legs: Leg[], lib: Library = library): Period | null {
  let from = '0000-01-01'
  let to = '9999-12-31'
  for (const l of legs) {
    const r = strategyRange(l.strategyId, lib)
    if (!r) continue
    if (r.from > from) from = r.from
    if (r.to < to) to = r.to
  }
  return from <= to ? { from, to } : null
}

/** Zeitraum auf den Datenbereich der Legs beschränken (null = keine Überschneidung) */
export function clampPeriod(legs: Leg[], period: Period, lib: Library = library): Period | null {
  const r = legsRange(legs, lib)
  if (!r) return null
  const from = period.from > r.from ? period.from : r.from
  const to = period.to < r.to ? period.to : r.to
  return from <= to ? { from, to } : null
}

/** Gesamter Datenbereich über alle Backtests */
export function dataRange(lib: Library = library): Period {
  let from = '9999-12-31'
  let to = '0000-01-01'
  for (const ts of Object.values(lib.trades)) {
    if (!ts.length) continue
    if (ts[0].day < from) from = ts[0].day
    const last = ts.reduce((m, t) => (t.exitDay > m ? t.exitDay : m), ts[ts.length - 1].exitDay)
    if (last > to) to = last
  }
  return { from, to }
}
