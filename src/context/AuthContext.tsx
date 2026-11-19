import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, rpc } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  isMod: boolean
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isMod, setIsMod] = useState(false)
  const [booting, setBooting] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setBooting(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id ?? null

  const loadProfile = useCallback(async () => {
    if (!uid) {
      setProfile(null)
      setIsMod(false)
      return
    }
    setProfileLoading(true)
    try {
      let { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      if (!data) {
        // The profile row is created by a database trigger; give it a moment on first sign-up.
        await new Promise((r) => setTimeout(r, 700))
        ;({ data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle())
      }
      setProfile((data as Profile) ?? null)
      try {
        setIsMod(Boolean(await rpc<boolean>('is_moderator')))
      } catch {
        setIsMod(false)
      }
    } finally {
      setProfileLoading(false)
    }
  }, [uid])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    isMod,
    loading: booting || (Boolean(uid) && profileLoading && !profile),
    refreshProfile: loadProfile,
    signOut: async () => {
      await supabase.auth.signOut()
      setProfile(null)
      setIsMod(false)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
