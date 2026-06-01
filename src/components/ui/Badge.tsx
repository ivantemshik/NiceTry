interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'instant' | 'stock' | 'out' | 'sale' | 'amber' | 'new'
  /** Показать точку-индикатор слева (как у бейджа «В наличии») */
  dot?: boolean
  className?: string
}

export default function Badge({
  children,
  variant = 'default',
  dot = false,
  className = '',
}: BadgeProps) {
  const variantClass = {
    default: '',
    instant: 'badge-instant',
    stock: 'badge-stock',
    out: 'badge-out',
    sale: 'badge-sale',
    amber: 'badge-amber',
    new: 'badge-new',
  }[variant]

  return (
    <span className={`badge ${variantClass} ${className}`.trim()}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}
