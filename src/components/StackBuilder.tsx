import { useMemo, useRef, useState } from 'react'
import { library } from '../core/registry'
import type { Period, Stack } from '../core/types'
import { downloadJson } from '../store'
import { metricsFor, shortLegLabel } from '../model'
import { EquityCharts, Kpis } from './Detail'

interface Props {
  builtin: Stack[]
  user: Stack[]
  period: Period
  onSave: (s: Stack) => void
  onDelete: (id: string) => void
  onImport: (stacks: Stack[]) => void
}

const newId = () => 'u' + Date.now().toString(36)

function emptyStack(): Stack {
  return {
    id: newId(),
    name: 'Neuer Stack',
    legs: Object.values(library.meta).map((m) => ({ strategyId: m.id, qty: m.defaultQty })),
  }
}

export function StackBuilder({ builtin, user, period, onSave, onDelete, onImport }: Props) {
  const [draft, setDraft] = useState<Stack>(() => emptyStack())
  // Strategien, die im Entwurf aktiv sind (qty > 0); qty bleibt beim Abwählen erhalten
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(library.meta).map((id) => [id, true])),
  )
  const fileRef = useRef<HTMLInputElement>(null)

  const activeLegs = useMemo(() => draft.legs.filter((l) => enabled[l.strategyId] && l.qty > 0), [draft, enabled])
  const m = useMemo(() => metricsFor(activeLegs, period), [activeLegs, period])
  const isUserStack = user.some((u) => u.id === draft.id)

  const load = (s: Stack, asCopy: boolean) => {
    const legs = Object.values(library.meta).map((meta) => {
      const leg = s.legs.find((l) => l.strategyId === meta.id)
      return { strategyId: meta.id, qty: leg?.qty ?? meta.defaultQty }
    })
    setEnabled(Object.fromEntries(Object.keys(library.meta).map((id) => [id, s.legs.some((l) => l.strategyId === id)])))
    setDraft({ id: asCopy ? newId() : s.id, name: asCopy ? `${s.name} (Kopie)` : s.name, legs })
  }

  const save = () => onSave({ id: draft.id, name: draft.name.trim() || 'Stack', legs: activeLegs })

  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      if (!Array.isArray(data)) throw new Error('Kein Array')
      onImport(data.filter((s) => s && s.id && s.name && Array.isArray(s.legs)))
    } catch (e) {
      alert('Import fehlgeschlagen: ' + (e as Error).message)
    }
  }

  return (
    <div className="builder">
      <aside className="card">
        <h3>Gespeicherte Stacks</h3>
        <ul className="stack-list">
          {builtin.map((s) => (
            <li key={s.id}>
              <div>
                <b>{s.name}</b>
                <small className="muted">{s.legs.map(shortLegLabel).join(' + ')} · im Repo</small>
              </div>
              <button className="ghost" onClick={() => load(s, true)}>
                Kopieren
              </button>
            </li>
          ))}
          {user.map((s) => (
            <li key={s.id} className={s.id === draft.id ? 'active' : ''}>
              <div>
                <b>{s.name}</b>
                <small className="muted">{s.legs.map(shortLegLabel).join(' + ')} · im Browser</small>
              </div>
              <span className="row-actions">
                <button className="ghost" onClick={() => load(s, false)}>
                  Bearbeiten
                </button>
                <button className="ghost danger" onClick={() => confirm(`„${s.name}“ löschen?`) && onDelete(s.id)}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="row-actions wrap">
          <button
            className="ghost"
            onClick={() => {
              setDraft(emptyStack())
              setEnabled(Object.fromEntries(Object.keys(library.meta).map((id) => [id, true])))
            }}
          >
            + Neuer Stack
          </button>
          <button className="ghost" onClick={() => downloadJson('stacks.json', user)} disabled={!user.length}>
            Export
          </button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </div>
        <p className="hint">Selbst angelegte Stacks werden in diesem Browser gespeichert. Mit Export sicherst du sie als JSON.</p>
      </aside>

      <section className="card">
        <div className="builder-head">
          <input className="title-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <button onClick={save} disabled={!activeLegs.length}>
            {isUserStack ? 'Speichern' : 'Als Stack speichern'}
          </button>
        </div>
        <table className="grid compact legs">
          <thead>
            <tr>
              <th className="left">Algo</th>
              <th className="left">Instrument</th>
              <th>Kontrakte</th>
            </tr>
          </thead>
          <tbody>
            {draft.legs.map((l, i) => {
              const meta = library.meta[l.strategyId]
              return (
                <tr key={l.strategyId} className={enabled[l.strategyId] ? '' : 'disabled'}>
                  <td className="left">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!enabled[l.strategyId]}
                        onChange={(e) => setEnabled({ ...enabled, [l.strategyId]: e.target.checked })}
                      />{' '}
                      {meta.name}
                    </label>
                  </td>
                  <td className="left muted">
                    {meta.instrument} · ${meta.pointValue}/Pkt
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={l.qty}
                      disabled={!enabled[l.strategyId]}
                      onChange={(e) => {
                        const legs = [...draft.legs]
                        legs[i] = { ...l, qty: Math.max(1, Number(e.target.value) || 1) }
                        setDraft({ ...draft, legs })
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {activeLegs.length ? (
          <>
            <Kpis m={m} />
            <EquityCharts m={m} height={220} />
          </>
        ) : (
          <p className="muted">Mindestens einen Algo auswählen.</p>
        )}
      </section>
    </div>
  )
}
