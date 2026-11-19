import { AVATAR_COLORS, AVATAR_SHAPES, Avatar } from './ui'

export default function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [shape, color] = value.split('-')
  return (
    <div className="stack-sm">
      <div className="avatar-grid" role="radiogroup" aria-label="Profile image shape">
        {AVATAR_SHAPES.map((s) => (
          <button
            type="button"
            key={s}
            role="radio"
            aria-checked={s === shape}
            aria-label={s}
            className={`avatar-opt ${s === shape ? 'avatar-opt-active' : ''}`}
            onClick={() => onChange(`${s}-${color}`)}
          >
            <Avatar k={`${s}-${color}`} size={40} />
          </button>
        ))}
      </div>
      <div className="color-row" role="radiogroup" aria-label="Profile image colour">
        {Object.entries(AVATAR_COLORS).map(([name, [c1]]) => (
          <button
            type="button"
            key={name}
            role="radio"
            aria-checked={name === color}
            aria-label={name}
            className={`color-dot ${name === color ? 'color-dot-active' : ''}`}
            style={{ background: c1 }}
            onClick={() => onChange(`${shape}-${name}`)}
          />
        ))}
      </div>
    </div>
  )
}
