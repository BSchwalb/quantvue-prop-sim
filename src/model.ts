import { useMemo } from 'react'
import { buildSteps, groupByDay, scaleLegs, type DaySteps } from './core/equity'
import { computeMetrics, type Metrics } from './core/metrics'
import { clampPeriod, library } from './core/registry'
import type { Leg, Period, Stack } from './core/types'

export interface Item {
  key: string
  kind: 'algo' | 'stack'
  name: string
  legs: Leg[]
  stack?: Stack
}

export function legLabel(l: Leg): string {
  const m = library.meta[l.strategyId]
  return m ? `${m.name} · ${l.qty}× ${m.instrument}` : `${l.strategyId} (fehlt)`
}

export function shortLegLabel(l: Leg): string {
  const m = library.meta[l.strategyId]
  return m ? `${l.qty}× ${m.instrument}` : '?'
}

export function buildItems(qtyOverrides: Record<string, number>, stacks: Stack[]): Item[] {
  const algos: Item[] = Object.values(library.meta).map((m) => ({
    key: `algo:${m.id}`,
    kind: 'algo',
    name: m.name,
    legs: [{ strategyId: m.id, qty: qtyOverrides[m.id] ?? m.defaultQty }],
  }))
  const st: Item[] = stacks.map((s) => ({ key: `stack:${s.id}`, kind: 'stack', name: s.name, legs: s.legs, stack: s }))
  return [...algos, ...st]
}

/**
 * Kennzahlen im Zeitraum – beschränkt auf den Bereich, in dem alle Algos Daten haben,
 * damit z. B. Ø/Monat bei „Gesamt“ nicht durch Monate ohne Backtest verwässert wird.
 */
export function metricsFor(legs: Leg[], period: Period): Metrics {
  const p = clampPeriod(legs, period) ?? period
  return computeMetrics(scaleLegs(library, legs, p), p)
}

/** Jahre (YYYY), in denen alle Algos der Legs Daten haben */
export function yearsFor(legs: Leg[]): string[] {
  const p = clampPeriod(legs, { from: '0000-01-01', to: '9999-12-31' })
  if (!p) return []
  const out: string[] = []
  for (let y = +p.from.slice(0, 4); y <= +p.to.slice(0, 4); y++) out.push(String(y))
  return out
}

export function useMetrics(items: Item[], period: Period): Map<string, Metrics> {
  return useMemo(() => {
    const map = new Map<string, Metrics>()
    for (const it of items) map.set(it.key, metricsFor(it.legs, period))
    return map
  }, [items, period])
}

const daysCache = new Map<string, DaySteps[]>()
/** Handelstage (DaySteps) über den gesamten Backtest, gecacht pro Leg-Kombination */
export function daysFor(legs: Leg[]): DaySteps[] {
  const key = JSON.stringify(legs)
  let d = daysCache.get(key)
  if (!d) {
    d = groupByDay(buildSteps(scaleLegs(library, legs)))
    daysCache.set(key, d)
  }
  return d
}
