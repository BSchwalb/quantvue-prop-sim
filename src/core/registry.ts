import strategies from '../data/strategies.json'
import builtinStacks from '../data/stacks.json'
import { parseBacktestCsv } from './parse'
import type { Library } from './equity'
import type { Period, RawTrade, Stack, StrategyMeta } from './types'

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

/** Gesamter Datenbereich über alle Backtests */
export function dataRange(lib: Library = library): Period {
  let from = '9999-12-31'
  let to = '0000-01-01'
  for (const ts of Object.values(lib.trades)) {
    if (!ts.length) continue
    if (ts[0].day < from) from = ts[0].day
    const last = ts[ts.length - 1].day
    if (last > to) to = last
  }
  return { from, to }
}
