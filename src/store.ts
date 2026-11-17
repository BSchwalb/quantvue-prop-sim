import { useCallback, useEffect, useState } from 'react'
import type { Stack } from './core/types'

/** Im Browser gespeicherte Einstellungen (localStorage). Alles mit try/catch, da Storage fehlen kann. */
function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignorieren */
  }
}

export function usePersistent<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => read(key, initial))
  useEffect(() => write(key, val), [key, val])
  return [val, setVal]
}

export function useUserStacks() {
  const [stacks, setStacks] = usePersistent<Stack[]>('qps.stacks', [])
  const save = useCallback(
    (s: Stack) => setStacks((prev) => (prev.some((p) => p.id === s.id) ? prev.map((p) => (p.id === s.id ? s : p)) : [...prev, s])),
    [setStacks],
  )
  const remove = useCallback((id: string) => setStacks((prev) => prev.filter((p) => p.id !== id)), [setStacks])
  return { stacks, setStacks, save, remove }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
