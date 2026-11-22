import { useMemo, useState } from 'react'
import { BUILTIN_STACKS, dataRange } from './core/registry'
import type { Period } from './core/types'
import { Overview } from './components/Overview'
import { Detail } from './components/Detail'
import { StackBuilder } from './components/StackBuilder'
import { AccountSim } from './components/AccountSim'
import { MonteCarlo } from './components/MonteCarlo'
import { useAccountRules } from './accounts'
import { buildItems, useMetrics } from './model'
import { usePersistent, useUserStacks } from './store'
import { fmtDate } from './format'

type Tab = 'overview' | 'builder' | 'sim' | 'mc'
/** 'ytd' | 'all' | 'custom' | 'y2025' (einzelnes Jahr) */
type Preset = string

const RANGE = dataRange()
const CUR_YEAR = RANGE.to.slice(0, 4)
/** abgeschlossene Jahre mit Daten, neueste zuerst */
const PAST_YEARS = Array.from({ length: Number(CUR_YEAR) - Number(RANGE.from.slice(0, 4)) }, (_, i) => String(Number(CUR_YEAR) - 1 - i))

function presetPeriod(p: Preset, custom: Period): Period {
  if (p === 'all') return RANGE
  if (p === 'custom') return custom
  if (p === 'prev') p = `y${Number(CUR_YEAR) - 1}` // alter gespeicherter Wert
  if (/^y\d{4}$/.test(p)) return { from: `${p.slice(1)}-01-01`, to: `${p.slice(1)}-12-31` }
  return { from: `${CUR_YEAR}-01-01`, to: RANGE.to }
}

export default function App() {
  const [tab, setTab] = usePersistent<Tab>('qps.tab', 'overview')
  const [preset, setPreset] = usePersistent<Preset>('qps.preset', 'ytd')
  const [custom, setCustom] = usePersistent<Period>('qps.custom', { from: `${CUR_YEAR}-01-01`, to: RANGE.to })
  const [qtyOverrides, setQtyOverrides] = usePersistent<Record<string, number>>('qps.qty', {})
  const { stacks: userStacks, setStacks, save, remove } = useUserStacks()
  const [selected, setSelected] = useState<string | null>(null)
  const acc = useAccountRules()
  const [simItemKey, setSimItemKey] = usePersistent<string>('qps.simItem', '')

  const period = useMemo(() => presetPeriod(preset, custom), [preset, custom])
  const allStacks = useMemo(() => [...BUILTIN_STACKS, ...userStacks], [userStacks])
  const items = useMemo(() => buildItems(qtyOverrides, allStacks), [qtyOverrides, allStacks])
  const metrics = useMetrics(items, period)
  const selItem = items.find((i) => i.key === selected)
  const simItem = items.find((i) => i.key === simItemKey) ?? items[0]
  const simProps = { items, period, item: simItem, setItemKey: setSimItemKey, acc }

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
          <button className={tab === 'sim' ? 'tab active' : 'tab'} onClick={() => setTab('sim')}>
            Account-Simulation
          </button>
          <button className={tab === 'mc' ? 'tab active' : 'tab'} onClick={() => setTab('mc')}>
            Monte Carlo
          </button>
        </nav>
        <div className="period">
          <div className="segmented" role="group" aria-label="Zeitraum">
            <button className={preset === 'ytd' ? 'active' : ''} onClick={() => setPreset('ytd')} title={`01.01.${CUR_YEAR} – ${fmtDate(RANGE.to)}`}>
              {CUR_YEAR} YTD
            </button>
            <button className={preset === 'all' ? 'active' : ''} onClick={() => setPreset('all')} title={`${fmtDate(RANGE.from)} – ${fmtDate(RANGE.to)}`}>
              Gesamt
            </button>
            {PAST_YEARS.map((y) => (
              <button key={y} className={preset === `y${y}` || (preset === 'prev' && y === PAST_YEARS[0]) ? 'active' : ''} onClick={() => setPreset(`y${y}`)}>
                {y}
              </button>
            ))}
            <button className={preset === 'custom' ? 'active' : ''} onClick={() => setPreset('custom')}>
              Eigener
            </button>
          </div>
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
        {tab === 'sim' && <AccountSim {...simProps} />}
        {tab === 'mc' && <MonteCarlo {...simProps} />}
      </main>
    </div>
  )
}
