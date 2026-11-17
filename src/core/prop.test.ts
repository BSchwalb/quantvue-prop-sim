import { describe, expect, it } from 'vitest'
import type { DaySteps } from './equity'
import { rollingStarts, simulateCampaign, summarize, type AccountRules } from './prop'

const rules: AccountRules = { id: 't', name: 't', startBalance: 25000, profitTarget: 1250, maxDrawdown: 1000, bufferTarget: 3000, cost: 100 }

/** Tag mit einem Trade: Ergebnis pnl, Tiefpunkt mae (relativ zum Tagesbeginn) */
const day = (d: string, pnl: number, mae = Math.min(0, pnl)): DaySteps => ({
  day: d,
  steps: [
    { close: 0, low: mae, high: Math.max(0, pnl) },
    { close: pnl, low: pnl, high: pnl },
  ],
  pnl,
})

const dates = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10))

describe('simulateCampaign', () => {
  it('Evaluation bestanden → Funded ab nächstem Tag → freigeschaltet', () => {
    const d = dates(6)
    const days = [day(d[0], 700), day(d[1], 700), day(d[2], 1500), day(d[3], 1500), day(d[4], 100), day(d[5], 100)]
    const runs = simulateCampaign(days, rules)
    expect(runs[0].evalPassDay).toBe(d[1]) // 1400 >= 1250 an Tag 2
    expect(runs[0].outcome).toBe('unlocked') // Funded: 1500 + 1500 = 3000 an Tag 4
    expect(runs[0].endDay).toBe(d[3])
    expect(runs[1].buyDay).toBe(d[4])
    expect(runs[1].outcome).toBe('open')
  })

  it('Evaluation: Trailing auf EOD-Höchststand, kein Einfrieren', () => {
    const d = dates(3)
    // Tag 1 EOD +900 → Grenze -100; Tag 2 Tiefpunkt -1000 relativ → 900-1000 = -100 → verloren
    const days = [day(d[0], 900), day(d[1], 0, -1000), day(d[2], 0)]
    const runs = simulateCampaign(days, { ...rules, profitTarget: 5000 })
    expect(runs[0].outcome).toBe('lost_eval')
    expect(runs[0].endDay).toBe(d[1])
    expect(runs[1].buyDay).toBe(d[2])
  })

  it('Intraday-Hoch zählt nicht fürs Trailing (nur EOD)', () => {
    const d = dates(2)
    const days: DaySteps[] = [
      { day: d[0], steps: [{ close: 0, low: 0, high: 800 }, { close: 0, low: 0, high: 0 }], pnl: 0 },
      day(d[1], -900),
    ]
    const runs = simulateCampaign(days, { ...rules, profitTarget: 5000 })
    expect(runs[0].outcome).toBe('open') // Grenze bleibt -1000
  })

  it('Funded: Grenze friert bei Startbalance ein', () => {
    const d = dates(5)
    const days = [
      day(d[0], 1300), // Eval bestanden
      day(d[1], 1100), // Funded EOD +1100 → Grenze min(100, 0) = 0
      day(d[2], -1050), // Tiefpunkt 50 > 0 → überlebt
      day(d[3], -100), // 50 - 100 = -50 ≤ 0 → verloren
      day(d[4], 0),
    ]
    const runs = simulateCampaign(days, rules)
    expect(runs[0].outcome).toBe('lost_funded')
    expect(runs[0].endDay).toBe(d[3])
  })

  it('Ziel erreicht → Rest des Tages wird nicht mehr gehandelt', () => {
    const d = dates(2)
    const days: DaySteps[] = [
      { day: d[0], steps: [{ close: 1300, low: 1300, high: 1300 }, { close: 0, low: -2000, high: 0 }], pnl: 0 },
      day(d[1], 0),
    ]
    const runs = simulateCampaign(days, rules)
    expect(runs[0].evalPassDay).toBe(d[0])
    expect(runs[0].outcome).toBe('open')
  })
})

describe('trace', () => {
  it('protokolliert Phasen, Grenze und Ereignisse', () => {
    const d = dates(4)
    const days = [day(d[0], 1300), day(d[1], 500), day(d[2], -1200), day(d[3], 100)]
    const trace: import('./prop').TraceRow[] = []
    simulateCampaign(days, rules, { trace })
    expect(trace.map((t) => [t.n, t.phase, t.event])).toEqual([
      [1, 'eval', 'passed'],
      [1, 'funded', null],
      [1, 'funded', 'lost'], // Grenze -500 nach EOD +500
      [2, 'eval', null],
    ])
    expect(trace[2].threshold).toBe(-500)
    expect(trace[1].bal).toBe(500)
  })
})

describe('summarize & rolling', () => {
  it('Zyklen und Kosten', () => {
    const d = dates(8)
    const days = [
      day(d[0], -1000), // verloren
      day(d[1], 1300), // Eval ok
      day(d[2], 3000), // freigeschaltet
      day(d[3], 1300),
      day(d[4], 3000), // freigeschaltet
      day(d[5], 0),
      day(d[6], 0),
      day(d[7], 0),
    ]
    const runs = simulateCampaign(days, rules)
    const s = summarize(runs, rules, d[0], d[7])
    expect(s.unlocked).toBe(2)
    expect(s.bought).toBe(4)
    expect(s.cycles.map((c) => c.accounts)).toEqual([2, 1])
    expect(s.costPerUnlock).toBe(200)
    expect(s.evalPassRate).toBeCloseTo(2 / 3)

    const roll = rollingStarts(days, rules, d[0], d[7])
    expect(roll.points[0].days).toBe(2)
    expect(roll.points[0].accounts).toBe(2)
    expect(roll.points.at(-1)!.days).toBeNull()
  })
})
