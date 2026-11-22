import { businessDays, drawPaths, runMonteCarlo, type McMode, type McResult } from './core/montecarlo'
import type { AccountRules } from './core/prop'
import { clampPeriod } from './core/registry'
import type { Period } from './core/types'
import { num2, pct } from './format'
import { daysFor, type Item } from './model'

export interface McSettings {
  n: number
  mode: McMode
  seed: number
}

const pathCache = new Map<string, number[][]>()
/** Ziehungen gecacht nach Pool-Länge/Einstellungen: gleiche Datenbasis = identische synthetische Jahre */
function pathsFor(poolLen: number, cfg: McSettings): number[][] {
  const key = `${poolLen}|${cfg.n}|${cfg.mode}|${cfg.seed}`
  let p = pathCache.get(key)
  if (!p) {
    p = drawPaths(poolLen, cfg.n, cfg.mode, cfg.seed)
    pathCache.set(key, p)
  }
  return p
}

/** Pool = Werktage im gewählten Zeitraum, beschränkt auf den Datenbereich des Algos/Stacks */
export function poolFor(item: Item, period: Period): string[] {
  const p = clampPeriod(item.legs, period)
  return p ? businessDays(p.from, p.to) : []
}

export function mcFor(item: Item, period: Period, cfg: McSettings, rules: AccountRules): McResult {
  const pool = poolFor(item, period)
  const byDay = new Map(daysFor(item.legs).map((d) => [d.day, d]))
  return runMonteCarlo(byDay, pool, pool.length ? pathsFor(pool.length, cfg) : [], rules)
}


/** Anteil der gekauften Accounts, die freigeschaltet werden (über alle Durchläufe) */
export function successRate(r: McResult): number | null {
  const bought = r.paths.reduce((a, p) => a + p.bought, 0)
  return bought ? r.paths.reduce((a, p) => a + p.unlocks, 0) / bought : null
}

export const range = (a: number, b: number, f: (n: number) => string) => `${f(a)} – ${f(b)}`
export const d0 = (n: number) => `${Math.round(n)} T`
/** Tage pro Freischaltung – sehr seltene Freischaltungen nicht als absurde Zahl anzeigen */
export const dpu = (n: number | null) => (n === null ? '–' : n > 730 ? '> 2 Jahre' : d0(n))
export const n1 = (n: number) => num2(n).replace(/,00$/, '')
export const rates = (r: McResult) =>
  `${r.evalPassRate === null ? '–' : pct(r.evalPassRate)} → ${r.fundedSuccessRate === null ? '–' : pct(r.fundedSuccessRate)}`
