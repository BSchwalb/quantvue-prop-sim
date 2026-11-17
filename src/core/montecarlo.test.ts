import { describe, expect, it } from 'vitest'
import { buildSteps, groupByDay, scaleLegs } from './equity'
import { businessDays, drawPaths, makeRng, runMonteCarlo } from './montecarlo'
import type { AccountRules } from './prop'
import { library } from './registry'

const rules: AccountRules = { id: 't', name: 't', startBalance: 25000, profitTarget: 1250, maxDrawdown: 1000, bufferTarget: 3000, cost: 100 }

describe('Monte Carlo', () => {
  it('Seed ist reproduzierbar', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(drawPaths(100, 3, 'bootstrap', 7)).toEqual(drawPaths(100, 3, 'bootstrap', 7))
  })

  it('Werktage ohne Wochenende', () => {
    expect(businessDays('2026-01-02', '2026-01-06')).toEqual(['2026-01-02', '2026-01-05', '2026-01-06'])
  })

  it('Mischen erhält den Gesamtgewinn, Bootstrap hat Jahreslänge', () => {
    const legs = [{ strategyId: 'omega_es', qty: 1 }]
    const days = groupByDay(buildSteps(scaleLegs(library, legs, { from: '2026-01-01', to: '2026-11-13' })))
    const byDay = new Map(days.map((d) => [d.day, d]))
    const total = days.reduce((a, d) => a + d.pnl, 0)
    const pool = businessDays('2026-01-01', '2026-11-13')

    const shuffled = runMonteCarlo(byDay, pool, drawPaths(pool.length, 20, 'shuffle', 1), rules)
    for (const p of shuffled.paths) expect(p.netProfit).toBeCloseTo(total, 6)

    const boot = runMonteCarlo(byDay, pool, drawPaths(pool.length, 50, 'bootstrap', 1), rules)
    expect(boot.months).toBeCloseTo(12)
    expect(boot.paths).toHaveLength(50)
    expect(boot.netProfit.p10).toBeLessThan(boot.netProfit.p90)
  })
})
