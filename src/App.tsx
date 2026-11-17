import { useMemo, useState } from 'react'
import { BUILTIN_STACKS, dataRange } from './core/registry'
import type { Period } from './core/types'
import { Overview } from './components/Overview'
import { Detail } from './components/Detail'
import { StackBuilder } from './components/StackBuilder'
import { buildItems, useMetrics } from './model'
import { usePersistent, useUserStacks } from './store'
import { fmtDate } from './format'

type Tab = 'overview' | 'builder'
type Preset = 'ytd' | 'prev' | 'all' | 'custom'

const RANGE = dataRange()
const CUR_YEAR = RANGE.to.slice(0, 4)
const PREV_YEAR = String(Number(CUR_YEAR) - 1)

function presetPeriod(p: Preset, custom: Period): Period {
  switch (p) {
    case 'ytd':
      return { from: `${CUR_YEAR}-01-01`, to: RANGE.to }
    case 'prev':
      return { from: `${PREV_YEAR}-01-01`, to: `${PREV_YEAR}-12-31` }
    case 'all':
      return RANGE
    case 'custom':
      return custom
  }
}

export default function App() {
  const [tab, setTab] = usePersistent<Tab>('qps.tab', 'overview')
  const [preset, setPreset] = usePersistent<Preset>('qps.preset', 'ytd')
  const [custom, setCustom] = usePersistent<Period>('qps.custom', { from: `${CUR_YEAR}-01-01`, to: RANGE.to })
  const [qtyOverrides, setQtyOverrides] = usePersistent<Record<string, number>>('qps.qty', {})
  const { stacks: userStacks, setStacks, save, remove } = useUserStacks()
  const [selected, setSelected] = useState<string | null>(null)

  const period = useMemo(() => presetPeriod(preset, custom), [preset, custom])
  const allStacks = useMemo(() => [...BUILTIN_STACKS, ...userStacks], [userStacks])
  const items = useMemo(() => buildItems(qtyOverrides, allStacks), [qtyOverrides, allStacks])
  const metrics = useMetrics(items, period)
  const selItem = items.find((i) => i.key === selected)

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1>Prop Sim</h1>
          <span className="muted">
            Daten {fmtDate(RANGE.from)} – {fmtDate(RANGE.to)}
          </span>
        </div>
        <nav>
          <button className={tab === 'overview' ? 'tab active' : 'tab'} onClick={() => setTab('overview')}>
            Übersicht
          </button>
          <button className={tab === 'builder' ? 'tab active' : 'tab'} onClick={() => setTab('builder')}>
            Stack-Builder
          </button>
          <button className="tab" disabled title="Kommt in Phase 3">
            Account-Simulation
          </button>
        </nav>
        <div className="period">
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            <option value="ytd">{CUR_YEAR} (bis {fmtDate(RANGE.to)})</option>
            <option value="prev">{PREV_YEAR}</option>
            <option value="all">Gesamter Backtest</option>
            <option value="custom">Eigener Zeitraum</option>
          </select>
          {preset === 'custom' && (
            <>
              <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </>
          )}
        </div>
      </header>

      <main>
        {tab === 'overview' &&
          (selItem && metrics.get(selItem.key) ? (
            <Detail item={selItem} m={metrics.get(selItem.key)!} onBack={() => setSelected(null)} />
          ) : (
            <Overview
              items={items}
              metrics={metrics}
              qtyOverrides={qtyOverrides}
              setQty={(id, q) => setQtyOverrides({ ...qtyOverrides, [id]: q })}
              onOpen={setSelected}
            />
          ))}
        {tab === 'builder' && (
          <StackBuilder
            builtin={BUILTIN_STACKS}
            user={userStacks}
            period={period}
            onSave={save}
            onDelete={remove}
            onImport={(list) => setStacks((prev) => [...prev.filter((p) => !list.some((l) => l.id === p.id)), ...list])}
          />
        )}
      </main>
    </div>
  )
}
