interface SpinnerProps {
  /** Уменьшенный спиннер (для кнопок/строк) */
  sm?: boolean
  className?: string
  /** Подпись под центрированным спиннером */
  label?: string
}

/** Единый индикатор загрузки в фирменном стиле. */
export default function Spinner({ sm = false, className = '', label }: SpinnerProps) {
  if (label) {
    return (
      <div className="loading-block" role="status" aria-live="polite">
        <span className={`spinner ${sm ? 'spinner-sm' : ''} ${className}`.trim()} />
        <span className="text-sm">{label}</span>
      </div>
    )
  }
  return (
    <span
      role="status"
      aria-label="Загрузка"
      className={`spinner ${sm ? 'spinner-sm' : ''} ${className}`.trim()}
    />
  )
}
