import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  /** Показать индикатор загрузки и заблокировать кнопку */
  loading?: boolean
  /** Растянуть на всю ширину контейнера */
  block?: boolean
  children: React.ReactNode
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''
  const classes = ['btn', VARIANTS[variant], sizeClass, block ? 'btn-block' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={classes}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
    </button>
  )
}
