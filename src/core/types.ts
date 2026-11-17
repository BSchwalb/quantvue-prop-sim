/** Metadaten eines Backtests (= ein Algo). Gepflegt in src/data/strategies.json */
export interface StrategyMeta {
  id: string
  name: string
  /** Instrument-Symbol, z. B. MNQ, MES, M2K */
  instrument: string
  /** $ pro Punkt für 1 Kontrakt */
  pointValue: number
  /** Standard-Kontraktzahl, mit der der Algo gehandelt wird */
  defaultQty: number
  /** Kosten pro Kontrakt und Roundtrip inkl. Slippage, in $ */
  costPerContract: number
  /** Dateiname in src/data/strategies/ */
  file: string
  notes?: string
}

/** Ein Trade aus dem Backtest, Werte in Punkten pro 1 Kontrakt */
export interface RawTrade {
  strategyId: string
  index: number
  direction: 'long' | 'short'
  /** Minuten seit Epoch (Exchange-Lokalzeit als UTC behandelt) */
  entryT: number
  exitT: number
  /** YYYY-MM-DD */
  day: string
  pnlPoints: number
  maePoints: number
  mfePoints: number
  exitReason: string
}

/** Ein Algo mit Kontraktzahl als Teil eines Stacks */
export interface Leg {
  strategyId: string
  qty: number
}

export interface Stack {
  id: string
  name: string
  legs: Leg[]
  /** true = im Repo hinterlegt, false = im Browser angelegt */
  builtin?: boolean
}

/** Trade in $ nach Skalierung mit Kontraktzahl und Abzug der Kosten */
export interface ScaledTrade {
  strategyId: string
  entryT: number
  exitT: number
  day: string
  pnl: number
  mae: number
  mfe: number
  win: boolean
}

/**
 * Ein Punkt der Equity-Kurve (kumuliert ab 0).
 * close = realisierter Kontostand, low = schlechtester Stand inkl. offener Buchverluste (MAE),
 * high = bester Stand inkl. offener Buchgewinne (MFE).
 */
export interface Step {
  t: number
  day: string
  close: number
  low: number
  high: number
}

export interface Period {
  from: string // YYYY-MM-DD inklusive
  to: string // YYYY-MM-DD inklusive
}
