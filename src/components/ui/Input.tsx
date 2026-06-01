import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Подсветить поле как ошибочное (красная рамка + aria-invalid) */
  error?: boolean | string
}

export default function Input({
  error = false,
  className = '',
  ...props
}: InputProps) {
  const hasError = Boolean(error)
  return (
    <input
      className={`input ${hasError ? 'err' : ''} ${className}`.trim()}
      aria-invalid={hasError || undefined}
      {...props}
    />
  )
}
