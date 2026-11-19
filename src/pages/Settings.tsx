import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { errMsg, supabase } from '../lib/supabase'
import AvatarPicker from '../components/AvatarPicker'
import { Avatar, Badge, Button, Card, Field, Notice, PageHeader, PageLoader, SectionTitle, SignInPrompt } from '../components/ui'

export default function Settings() {
  const { user, profile, loading, refreshProfile, signOut, isMod } = useAuth()
  const { games, showDemo, setShowDemo } = useApp()
  const toast = useToast()
  const nav = useNavigate()

  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState('bolt-violet')
  const [game, setGame] = useState('rocket-league')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setUsername(profile.username)
    setAvatar(profile.avatar_key)
    setGame(profile.main_game ?? 'rocket-league')
    setBio(profile.bio ?? '')
  }, [profile])

  if (loading) return <PageLoader />
  if (!user || !profile) {
    return (
      <>
        <PageHeader title="Settings" />
        <Card><SignInPrompt title="Sign in to manage your account" /></Card>
      </>
    )
  }

  const nameOk = /^[A-Za-z0-9_]{3,20}$/.test(username)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError(null)
    if (!nameOk) {
      setError('Username must be 3–20 characters: letters, numbers and underscores.')
      return
    }
    setBusy(true)
    try {
      // Players can edit only cosmetic fields. Wins, losses and rating live in a table
      // the database will not let them write to.
      const { error } = await supabase
        .from('profiles')
        .update({ username, avatar_key: avatar, main_game: game, bio: bio.trim() || null })
        .eq('id', profile.id)
      if (error) throw error
      await refreshProfile()
      toast.success('Profile saved')
    } catch (err) {
      const m = errMsg(err)
      setError(/duplicate|unique/i.test(m) ? 'That username is already taken.' : m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your gamer profile and preferences." />
      <div className="grid grid-main">
        <form className="stack" onSubmit={save}>
          <Card className="stack">
            <SectionTitle>Gamer profile</SectionTitle>
            {error && <Notice tone="red">{error}</Notice>}
            <div className="row"><Avatar k={avatar} size={64} /><div><strong>{username || 'Username'}</strong><div className="muted small">Preview</div></div></div>
            <Field label="Profile image"><AvatarPicker value={avatar} onChange={setAvatar} /></Field>
            <Field label="Username" hint="3–20 characters, letters/numbers/underscore">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} required />
            </Field>
            <Field label="Main game">
              <select className="select" value={game} onChange={(e) => setGame(e.target.value)}>
                {games.map((g) => <option key={g.id} value={g.id} disabled={!g.is_active}>{g.name}{!g.is_active ? ' — coming soon' : ''}</option>)}
              </select>
            </Field>
            <Field label="Bio" hint={`${bio.length}/280`}>
              <textarea className="textarea" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} placeholder="Playstyle, rank goals, favourite mode…" />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="submit" loading={busy}>Save changes</Button></div>
          </Card>
        </form>

        <div className="stack">
          <Card className="stack">
            <SectionTitle>Account</SectionTitle>
            <div className="spread"><span className="muted">Email</span><span>{user.email}</span></div>
            {isMod && <div className="spread"><span className="muted">Role</span><Badge tone="purple">Moderator</Badge></div>}
            <Button variant="secondary" onClick={async () => { await signOut(); nav('/') }}>Sign out</Button>
          </Card>

          <Card className="stack">
            <SectionTitle>Display</SectionTitle>
            <label className="toggle">
              <input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} />
              <span>
                <strong>Show demo data</strong>
                <div className="muted small">Sample players, teams and tournaments are always labelled DEMO and never affect real rankings.</div>
              </span>
            </label>
          </Card>

          <Card className="stack">
            <SectionTitle>Fair play</SectionTitle>
            <p className="muted small">
              Your wins, losses and rating can't be edited — they're updated only by the system when a duel result is confirmed by your opponent or a tournament match is recorded by its organizer.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
