import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Game } from '../lib/types'

interface AppState {
  games: Game[]
  activeGames: Game[]
  gamesLoading: boolean
  gameById: (id: string | null | undefined) => Game | undefined
  /** When true, clearly-labelled sample data is mixed into lists. Real data is always shown. */
  showDemo: boolean
  setShowDemo: (v: boolean) => void
}

const Ctx = createContext<AppState | null>(null)
const KEY = 'ggleague:showDemo'

export function AppProvider({ children }: { children: ReactNode }) {
  const [games, setGames] = useState<Game[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [showDemo, setShowDemoState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) !== '0'
    } catch {
      return true
    }
  })

  useEffect(() => {
    supabase
      .from('games')
      .select('*')
      .order('sort_order')
      .then(({ data }) => {
        setGames((data as Game[]) ?? [])
        setGamesLoading(false)
      })
  }, [])

  const setShowDemo = useCallback((v: boolean) => {
    setShowDemoState(v)
    try {
      localStorage.setItem(KEY, v ? '1' : '0')
    } catch {
      /* storage unavailable: preference just won't persist */
    }
  }, [])

  const value: AppState = {
    games,
    activeGames: games.filter((g) => g.is_active),
    gamesLoading,
    gameById: (id) => games.find((g) => g.id === id),
    showDemo,
    setShowDemo,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside AppProvider')
  return v
}

export const DEFAULT_GAME = 'rocket-league'
