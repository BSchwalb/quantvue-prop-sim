import { describe, expect, it } from 'vitest'
import { scaleLegs } from './equity'
import { computeMetrics } from './metrics'
import { comboGrid, makeEvaluator } from './optimize'
import { library } from './registry'

describe('Optimierer', () => {
  it('schnelle Auswertung = computeMetrics', () => {
    const ids = ['qorb_rhino', 'omega_es', 'profandy_optimus_zeus_prime']
    const period = { from: '2025-01-01', to: '2026-11-20' }
    const ev = makeEvaluator(library, ids, period)
    for (const qty of [
      [2, 3, 0],
      [1, 0, 7],
      [0, 10, 5],
      [3, 1, 2],
    ]) {
      const legs = ids.map((strategyId, i) => ({ strategyId, qty: qty[i] }))
      const m = computeMetrics(scaleLegs(library, legs, period), period)
      const f = ev.evaluate(qty)
      expect(f.netProfit).toBeCloseTo(m.netProfit, 6)
      expect(f.maxDrawdown).toBeCloseTo(m.maxDrawdown, 6)
    }
  })

  it('Kombinationsraster mit Limit', () => {
    expect(comboGrid([2, 1]).combos).toHaveLength(3 * 2 - 1)
    const g = comboGrid([30, 30, 30], 5000)
    expect(g.combos.length).toBeLessThanOrEqual(5000)
    expect(g.step).toBeGreaterThan(1)
  })
})
