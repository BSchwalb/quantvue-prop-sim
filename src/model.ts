import { useMemo } from 'react'
import { scaleLegs } from './core/equity'
import { computeMetrics, type Metrics } from './core/metrics'
import { library } from './core/registry'
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

export function metricsFor(legs: Leg[], period: Period): Metrics {
  return computeMetrics(scaleLegs(library, legs, period), period)
}

export function useMetrics(items: Item[], period: Period): Map<string, Metrics> {
  return useMemo(() => {
    const map = new Map<string, Metrics>()
    for (const it of items) map.set(it.key, metricsFor(it.legs, period))
    return map
  }, [items, period])
}
