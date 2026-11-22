import { describe, expect, it } from 'vitest'
import { buildSteps, groupByDay, scaleLegs, type Library } from './equity'
import { computeMetrics } from './metrics'
import { clampPeriod, legsRange, library } from './registry'
import type { RawTrade, ScaledTrade } from './types'

const tr = (day: string, entryMin: number, exitMin: number, pnl: number, mae: number, mfe = 0): ScaledTrade => {
  const base = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 60000
  return { strategyId: 'x', entryT: base + entryMin, exitT: base + exitMin, day, exitDay: day, pnl, mae, mfe, win: pnl > 0 }
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
      exitDay: '2026-01-02', pnlPoints: 10, maePoints: -4, mfePoints: 12, exitReason: 'tp',
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

describe('Trades über Nacht', () => {
  it('werden am Ausstiegstag realisiert', () => {
    const t = tr('2026-01-05', 600, 600 + 20 * 60, 80, -30) // Ausstieg am nächsten Tag
    t.exitDay = '2026-01-06'
    const days = groupByDay(buildSteps([tr('2026-01-05', 540, 560, 10, -5), t]))
    expect(days.map((d) => d.day)).toEqual(['2026-01-05', '2026-01-06'])
    expect(days[0].pnl).toBe(10) // offener Trade nicht im EOD-Saldo
    expect(days[0].steps.at(-1)!.low).toBe(10 - 30) // offener Buchverlust zählt aber intraday
    expect(days[1].pnl).toBe(80)
  })
})

describe('echte Backtests', () => {
  it('sind geladen', () => {
    expect(Object.keys(library.meta).sort()).toEqual(['bubbagump_3', 'omega_es', 'omega_rty', 'profandy_optimus_zeus_prime', 'profandy_qorb_deadeye', 'jtn4_sharpshooter_qliquidity', 'qorb_jn', 'qorb_rhino'].sort())
    expect(library.trades.qorb_jn.length).toBe(326)
  })
})

describe('Datenbereich', () => {
  it('Stack wird auf die Schnittmenge der Algos beschränkt', () => {
    const zeus = legsRange([{ strategyId: 'profandy_optimus_zeus_prime', qty: 1 }])!
    const stack = legsRange([
      { strategyId: 'profandy_qorb_deadeye', qty: 1 },
      { strategyId: 'profandy_optimus_zeus_prime', qty: 1 },
    ])!
    expect(stack.from).toBe(zeus.from) // Zeus beginnt später als Deadeye
    expect(clampPeriod([{ strategyId: 'profandy_optimus_zeus_prime', qty: 1 }], { from: '2025-01-01', to: '2025-12-31' })).toBeNull()
    expect(clampPeriod([{ strategyId: 'profandy_qorb_deadeye', qty: 1 }], { from: '2000-01-01', to: '2099-12-31' })!.from).toBe('2024-01-01')
    // Zeus: letzter Trade 04.11., aber nahe am Datenende -> gilt bis zum Datenende
    expect(legsRange([{ strategyId: 'profandy_optimus_zeus_prime', qty: 1 }])!.to).toBe(stack.to)
    expect(stack.to >= '2026-11-13').toBe(true)
  })
})
