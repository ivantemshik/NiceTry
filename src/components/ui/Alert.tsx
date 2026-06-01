interface AlertProps {
  children: React.ReactNode
  variant?: 'info' | 'success' | 'error' | 'warn'
  className?: string
}

// Иконки-штрихи под каждый тип уведомления
const ICONS: Record<NonNullable<AlertProps['variant']>, JSX.Element> = {
  info: <path d="M12 8h.01M11 12h1v4h1M12 3a9 9 0 100 18 9 9 0 000-18z" />,
  success: <path d="M20 6L9 17l-5-5" />,
  error: <path d="M12 8v5M12 16h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  warn: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
}

/** Единый блок уведомления (заменяет разнобой inline-сообщений). */
export default function Alert({ children, variant = 'info', className = '' }: AlertProps) {
  return (
    <div className={`alert alert-${variant} ${className}`.trim()} role="alert">
      <svg className="ic ic-sm" viewBox="0 0 24 24">
        {ICONS[variant]}
      </svg>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
