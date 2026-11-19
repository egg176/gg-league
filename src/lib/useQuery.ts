import { useCallback, useEffect, useRef, useState } from 'react'
import { errMsg } from './supabase'

interface State<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Tiny data-fetching hook: loading / error / data + manual reload.
 * Keeps the previous data on screen while reloading.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e) => alive && setState((s) => ({ data: s.data, loading: false, error: errMsg(e) })))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { ...state, reload }
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
