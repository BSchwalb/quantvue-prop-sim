import { describe, expect, it } from 'vitest'
import { buildSteps, groupByDay, scaleLegs, type Library } from './equity'
import { computeMetrics } from './metrics'
import { library } from './registry'
import type { RawTrade, ScaledTrade } from './types'

const tr = (day: string, entryMin: number, exitMin: number, pnl: number, mae: number, mfe = 0): ScaledTrade => {
  const base = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 60000
  return { strategyId: 'x', entryT: base + entryMin, exitT: base + exitMin, day, pnl, mae, mfe, win: pnl > 0 }
}

describe('buildSteps', () => {
  it('summiert MAE überlappender Trades (Worst Case)', () => {
    const steps = buildSteps([tr('2026-01-02', 600, 630, 100, -200), tr('2026-01-02', 610, 640, -50, -150)])
    expect(Math.min(...steps.map((s) => s.low))).toBe(-350)
    expect(steps.at(-1)!.close).toBe(50)
  })

  it('schließt vor dem Öffnen bei gleicher Uhrzeit', () => {
    const steps = buildSteps([tr('2026-01-02', 600, 610, 100, -20), tr('2026-01-02', 610, 620, 10, -30)])
    // zweiter Trade öffnet nach Gutschrift des ersten -> low = 100 - 30
    expect(steps[2].low).toBe(70)
  })
})

describe('computeMetrics', () => {
  it('Drawdown vom Höchststand inkl. MAE', () => {
    const trades = [
      tr('2026-01-02', 600, 610, 1000, -100),
      tr('2026-01-05', 600, 610, -300, -800),
      tr('2026-01-06', 600, 610, 500, -50),
    ]
    const m = computeMetrics(trades, { from: '2026-01-01', to: '2026-01-31' })
    expect(m.netProfit).toBe(1200)
    expect(m.maxDrawdown).toBe(800) // Peak 1000, Tief 1000-800=200
    expect(m.maxDrawdownClosed).toBe(300)
    expect(m.monthly[0].pnl).toBe(1200)
  })
})

describe('scaleLegs', () => {
  it('skaliert mit Qty, $/Punkt und Kosten', () => {
    const raw: RawTrade = {
      strategyId: 's', index: 1, direction: 'long', entryT: 0, exitT: 5, day: '2026-01-02',
      pnlPoints: 10, maePoints: -4, mfePoints: 12, exitReason: 'tp',
    }
    const lib: Library = {
      meta: { s: { id: 's', name: 's', instrument: 'MNQ', pointValue: 2, defaultQty: 1, costPerContract: 2, file: '' } },
      trades: { s: [raw] },
    }
    const [t] = scaleLegs(lib, [{ strategyId: 's', qty: 3 }])
    expect(t.pnl).toBe(10 * 2 * 3 - 6)
    expect(t.mae).toBe(-4 * 2 * 3 - 6)
  })
})

describe('groupByDay', () => {
  it('Werte relativ zum Tagesbeginn', () => {
    const steps = buildSteps([tr('2026-01-02', 600, 610, 100, -20), tr('2026-01-05', 600, 610, -40, -60)])
    const days = groupByDay(steps)
    expect(days).toHaveLength(2)
    expect(days[1].steps[0].low).toBe(-60)
    expect(days[1].pnl).toBe(-40)
  })
})

describe('echte Backtests', () => {
  it('sind geladen', () => {
    expect(Object.keys(library.meta).sort()).toEqual(['omega_es', 'omega_rty', 'qorb_jn'])
    expect(library.trades.qorb_jn.length).toBe(326)
  })
})
