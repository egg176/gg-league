import { FormEvent, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_GAME, useApp } from '../context/AppContext'
import { errMsg, rpc, supabase } from '../lib/supabase'
import { useDebounced } from '../lib/useQuery'
import { Button, Field, Notice, Tabs } from '../components/ui'
import AvatarPicker from '../components/AvatarPicker'
import { Logo } from '../components/Layout'

export default function Auth() {
  const { user, profile } = useAuth()
  const { activeGames, games } = useApp()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState('bolt-violet')
  const [game, setGame] = useState(DEFAULT_GAME)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const debouncedName = useDebounced(username, 350)

  useEffect(() => {
    if (mode !== 'signup' || !/^[A-Za-z0-9_]{3,20}$/.test(debouncedName)) {
      setAvailable(null)
      return
    }
    let alive = true
    rpc<boolean>('username_available', { p_username: debouncedName })
      .then((ok) => alive && setAvailable(ok))
      .catch(() => alive && setAvailable(null))
    return () => {
      alive = false
    }
  }, [debouncedName, mode])

  if (user && profile) return <Navigate to="/" replace />

  const nameValid = /^[A-Za-z0-9_]{3,20}$/.test(username)
  const nameError =
    username && !nameValid
      ? '3–20 characters: letters, numbers and underscores'
      : nameValid && available === false
        ? 'That username is taken'
        : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (mode === 'signup' && (!nameValid || available === false)) {
      setError('Pick a valid, available username first.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, avatar_key: avatar, main_game: game } },
        })
        if (error) throw error
        if (!data.session) {
          setInfo('Account created! Check your email to confirm your address, then log in.')
          setMode('login')
        } else {
          nav('/')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        nav('/')
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-art">
        <Logo />
        <div>
          <h1>
            Compete. <em>Climb.</em> Repeat.
          </h1>
          <div className="auth-perks">
            <div>Join tournaments with live brackets</div>
            <div>Challenge anyone to a ranked 1v1 duel</div>
            <div>Verified results — no self-reported rankings</div>
            <div>Build a team and climb the ladders</div>
          </div>
        </div>
        <p className="muted small">Launching with Rocket League. More games coming soon.</p>
      </div>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div className="stack-sm">
            <h1>{mode === 'signup' ? 'Create your gamer profile' : 'Welcome back'}</h1>
            <p className="muted">{mode === 'signup' ? 'Free forever. Takes under a minute.' : 'Log in to pick up where you left off.'}</p>
          </div>
          <Tabs
            tabs={[
              { id: 'signup', label: 'Sign up' },
              { id: 'login', label: 'Log in' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m)
              setError(null)
            }}
          />

          {info && <Notice tone="green">{info}</Notice>}
          {error && <Notice tone="red">{error}</Notice>}

          {mode === 'signup' && (
            <Field label="Username" error={nameError} hint={nameValid && available ? '✓ Available' : '3–20 characters, letters/numbers/underscore'}>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={20} required />
            </Field>
          )}
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              required
            />
          </Field>

          {mode === 'signup' && (
            <>
              <Field label="Profile image">
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </Field>
              <Field label="Main game">
                <select className="select" value={game} onChange={(e) => setGame(e.target.value)}>
                  {(games.length ? games : activeGames).map((g) => (
                    <option key={g.id} value={g.id} disabled={!g.is_active}>
                      {g.name}
                      {!g.is_active ? ' — coming soon' : ''}
                    </option>
                  ))}
                  {games.length === 0 && <option value={DEFAULT_GAME}>Rocket League</option>}
                </select>
              </Field>
            </>
          )}

          <Button type="submit" size="lg" loading={busy}>
            {mode === 'signup' ? 'Create account' : 'Log in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
