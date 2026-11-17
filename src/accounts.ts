import { useMemo } from 'react'
import builtinAccounts from './data/accounts.json'
import type { AccountRules } from './core/prop'
import { usePersistent } from './store'

export const BUILTIN_ACCOUNTS: AccountRules[] = (builtinAccounts as AccountRules[]).map((a) => ({ ...a, builtin: true }))

const strip = (a: AccountRules) => JSON.stringify({ ...a, builtin: undefined })

/** Account-Vorlagen + aktuell eingestellte Regeln (gemeinsam für Account-Simulation und Monte Carlo) */
export function useAccountRules() {
  const [userAccounts, setUserAccounts] = usePersistent<AccountRules[]>('qps.accounts', [])
  const accounts = useMemo(() => [...BUILTIN_ACCOUNTS, ...userAccounts], [userAccounts])
  const [accId, setAccId] = usePersistent<string>('qps.accId', BUILTIN_ACCOUNTS[0].id)
  const base = accounts.find((a) => a.id === accId) ?? accounts[0]
  const [rules, setRules] = usePersistent<AccountRules>('qps.rules', base)

  const pick = (id: string) => {
    const a = accounts.find((x) => x.id === id)
    if (!a) return
    setAccId(id)
    setRules(a)
  }
  const saveAsNew = () => {
    const a: AccountRules = { ...rules, id: 'a' + Date.now().toString(36), builtin: undefined }
    a.name = `${Math.round(a.startBalance / 1000)}K · ${a.profitTarget} Target · ${a.maxDrawdown} DD · ${a.bufferTarget} Buffer · $${a.cost}`
    setUserAccounts([...userAccounts, a])
    setAccId(a.id)
    setRules(a)
  }
  const saveExisting = () => setUserAccounts(userAccounts.map((u) => (u.id === base.id ? { ...rules, id: base.id, name: base.name } : u)))
  const remove = () => {
    setUserAccounts(userAccounts.filter((u) => u.id !== base.id))
    pick(BUILTIN_ACCOUNTS[0].id)
  }

  return { accounts, base, rules, setRules, pick, saveAsNew, saveExisting, remove, dirty: strip(rules) !== strip(base) }
}

export type AccountRulesState = ReturnType<typeof useAccountRules>
