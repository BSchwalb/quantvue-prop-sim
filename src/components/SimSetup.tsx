import type { ReactNode } from 'react'
import type { AccountRules } from '../core/prop'
import type { AccountRulesState } from '../accounts'
import { shortLegLabel, type Item } from '../model'

interface Props {
  items: Item[]
  item: Item
  setItemKey: (k: string) => void
  acc: AccountRulesState
  children?: ReactNode
}

/** Auswahl Strategie/Stack + Account-Regeln (geteilt von Account-Simulation und Monte Carlo) */
export function SimSetup({ items, item, setItemKey, acc, children }: Props) {
  const { rules, setRules, base } = acc
  const field = (k: keyof AccountRules, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={rules[k] as number} onChange={(e) => setRules({ ...rules, [k]: Number(e.target.value) || 0 })} />
    </label>
  )
  return (
    <div className="card sim-setup">
      <div className="sim-row">
        <label className="field wide">
          <span>Strategie / Stack</span>
          <select value={item.key} onChange={(e) => setItemKey(e.target.value)}>
            {items.map((it) => (
              <option key={it.key} value={it.key}>
                {it.kind === 'stack' ? 'Stack: ' : ''}
                {it.name} ({it.legs.map(shortLegLabel).join(' + ')})
              </option>
            ))}
          </select>
        </label>
        <label className="field wide">
          <span>Account-Vorlage{acc.dirty ? ' (geändert)' : ''}</span>
          <select value={base.id} onChange={(e) => acc.pick(e.target.value)}>
            {acc.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.builtin ? '' : ' (eigene)'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sim-row">
        {field('startBalance', 'Startbalance')}
        {field('profitTarget', 'Profit Target')}
        {field('maxDrawdown', 'Max DD (trailing)')}
        {field('bufferTarget', 'Freigeschaltet bei Gewinn')}
        {field('cost', 'Kosten / Account')}
        <div className="row-actions bottom">
          <button className="ghost" onClick={acc.saveAsNew}>
            Als Vorlage speichern
          </button>
          {!base.builtin && acc.dirty && <button onClick={acc.saveExisting}>Änderungen speichern</button>}
          {!base.builtin && (
            <button className="ghost danger" onClick={() => confirm(`Vorlage „${base.name}“ löschen?`) && acc.remove()}>
              Löschen
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
