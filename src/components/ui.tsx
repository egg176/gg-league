import { ButtonHTMLAttributes, ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Tone } from '../lib/format'

/* ---------- Avatars (original, generated — no game artwork) ---------- */

const SHAPES: Record<string, ReactNode> = {
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  orbit: (
    <>
      <circle cx="12" cy="12" r="2.6" />
      <ellipse cx="12" cy="12" rx="10" ry="4.4" transform="rotate(-30 12 12)" />
    </>
  ),
  crown: <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />,
  flame: <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-6 1 2 2 2 3 0z" />,
  shield: <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />,
  star: <path d="M12 2l3 6.5 7 .9-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.9z" />,
  ghost: (
    <>
      <path d="M5 21V11a7 7 0 0 1 14 0v10l-3-2-2 2-2-2-2 2-2-2z" />
      <circle cx="9.5" cy="11" r="1" />
      <circle cx="14.5" cy="11" r="1" />
    </>
  ),
  wave: <path d="M2 11c3-6 5-6 8 0s5 6 8 0l4-3M2 18c3-6 5-6 8 0s5 6 8 0" />,
}

export const AVATAR_SHAPES = Object.keys(SHAPES)
export const AVATAR_COLORS: Record<string, [string, string]> = {
  violet: ['#8b5cf6', '#3b1d8a'],
  blue: ['#3b82f6', '#1e3a8a'],
  pink: ['#ec4899', '#7a1646'],
  cyan: ['#22d3ee', '#0e5c70'],
  green: ['#34d399', '#065f46'],
  amber: ['#fbbf24', '#8a4a0b'],
}

export function Avatar({ k, size = 40 }: { k: string; size?: number }) {
  const [shape, color] = k.split('-')
  const [c1, c2] = AVATAR_COLORS[color] ?? AVATAR_COLORS.violet
  const icon = SHAPES[shape] ?? SHAPES.bolt
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        boxShadow: `0 0 ${Math.round(size / 2.5)}px ${c1}33`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.56}
        height={size * 0.56}
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
    </span>
  )
}

export function PlayerLink({
  username,
  avatar,
  isDemo,
  size = 32,
  sub,
}: {
  username: string
  avatar: string
  isDemo?: boolean
  size?: number
  sub?: ReactNode
}) {
  return (
    <Link to={`/profile/${username}`} className="player-link">
      <Avatar k={avatar} size={size} />
      <span className="player-link-text">
        <span className="player-link-name">
          {username} {isDemo && <DemoBadge />}
        </span>
        {sub && <span className="muted small">{sub}</span>}
      </span>
    </Link>
  )
}

/* ---------- Buttons, badges, cards ---------- */

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, children, disabled, className = '', ...rest }: BtnProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="spinner spinner-sm" aria-hidden />}
      {children}
    </button>
  )
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function DemoBadge({ label = 'DEMO' }: { label?: string }) {
  return (
    <span className="badge badge-demo" title="Sample data — not a real player or result">
      {label}
    </span>
  )
}

export function Card({
  children,
  className = '',
  glow,
  padded = true,
}: {
  children: ReactNode
  className?: string
  glow?: boolean
  padded?: boolean
}) {
  return <div className={`card ${glow ? 'card-glow' : ''} ${padded ? '' : 'card-flush'} ${className}`}>{children}</div>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  )
}

/** Number that counts up from 0 when it first appears. Respects reduced motion. */
export function CountUp({ value, duration = 800 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || !Number.isFinite(value)) {
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(a + (value - a) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{shown}</>
}

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className={`stat-tile ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{typeof value === 'number' ? <CountUp value={value} /> : value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

/* ---------- Loading / error / empty ---------- */

export function Spinner({ size }: { size?: 'sm' }) {
  return <span className={`spinner ${size === 'sm' ? 'spinner-sm' : ''}`} aria-label="Loading" />
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="skeleton-page" role="status" aria-busy="true" aria-label={label}>
      <div className="skeleton skeleton-title" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
      <div className="skeleton skeleton-block" />
    </div>
  )
}

/** Pill-style single choice selector. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: { id: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.id)}
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          className={`seg ${value === o.id ? 'seg-active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-box state-error" role="alert">
      <div className="state-icon">!</div>
      <h3>Something went wrong</h3>
      <p className="muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="state-box">
      <div className="state-icon state-icon-empty">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
      </div>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  )
}

export function Notice({ tone = 'blue', children }: { tone?: 'blue' | 'amber' | 'red' | 'green'; children: ReactNode }) {
  return <div className={`notice notice-${tone}`}>{children}</div>
}

/* ---------- Forms & modal ---------- */

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: number; disabled?: boolean }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          disabled={t.disabled}
          className={`tab ${value === t.id ? 'tab-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {!!t.badge && <span className="tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export function SignInPrompt({ title = 'Sign in to continue', text }: { title?: string; text?: string }) {
  return (
    <EmptyState
      title={title}
      text={text ?? 'Create a free gamer profile to compete, track your results and climb the ladder.'}
      action={
        <Link to="/auth" className="btn btn-primary btn-md">
          Sign in / Sign up
        </Link>
      }
    />
  )
}
