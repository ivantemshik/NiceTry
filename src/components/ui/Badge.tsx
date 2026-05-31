interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'instant' | 'stock' | 'out' | 'sale' | 'amber'
  className?: string
}

export default function Badge({
  children,
  variant = 'default',
  className = '',
}: BadgeProps) {
  const variantClass = {
    default: '',
    instant: 'badge-instant',
    stock: 'badge-stock',
    out: 'badge-out',
    sale: 'badge-sale',
    amber: 'badge-amber',
  }[variant]

  return (
    <span className={`badge ${variantClass} ${className}`.trim()}>
      {children}
    </span>
  )
}
