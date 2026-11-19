import { ReactNode, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useQuery } from '../lib/useQuery'
import { fetchAttention } from '../lib/attention'
import { Avatar } from './ui'

const I = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)

const NAV = [
  { to: '/', label: 'Overview', end: true, icon: I(<><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>) },
  { to: '/tournaments', label: 'Tournaments', icon: I(<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></>) },
  { to: '/duels', label: 'Duels', icon: I(<><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" /><path d="M9.5 6.5 21 18v3h-3L6.5 9.5" opacity=".0" /></>) },
  { to: '/teams', label: 'Teams', icon: I(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c3 .2 5 2.3 5 5.3" /></>) },
  { to: '/leaderboards', label: 'Leaderboards', icon: I(<><path d="M5 21V11M12 21V4M19 21v-7" /></>) },
  { to: '/profile', label: 'Profile', icon: I(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>) },
  { to: '/settings', label: 'Settings', icon: I(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>) },
]

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="GGLeague home">
      <span className="logo-mark">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
      </span>
      <span className="logo-text">
        GG<span>League</span>
      </span>
    </Link>
  )
}

export default function Layout() {
  const { user, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => setOpen(false), [loc.pathname])

  const attention = useQuery(
    async () => (user ? fetchAttention(user.id) : null),
    [user?.id, loc.pathname],
  )
  const badge = attention.data?.total ?? 0

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <Logo />
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}>
              {n.icon}
              <span>{n.label}</span>
              {n.to === '/duels' && badge > 0 && <span className="nav-badge">{badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {user && profile ? (
            <Link to="/profile" className="me-chip">
              <Avatar k={profile.avatar_key} size={34} />
              <span>
                <strong>{profile.username}</strong>
                <small className="muted">View profile</small>
              </span>
            </Link>
          ) : (
            <Link to="/auth" className="btn btn-primary btn-md btn-block">
              Sign in
            </Link>
          )}
        </div>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Logo />
          {user && profile ? (
            <Link to="/profile" aria-label="Your profile">
              <Avatar k={profile.avatar_key} size={32} />
            </Link>
          ) : (
            <Link to="/auth" className="btn btn-primary btn-sm">
              Sign in
            </Link>
          )}
        </header>
        <main className="main">
          <div key={loc.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
        <footer className="footer muted small">
          GGLeague is an independent community platform. Not affiliated with or endorsed by any game publisher.
        </footer>
      </div>
    </div>
  )
}
