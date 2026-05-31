import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export default function Input({
  error = false,
  className = '',
  ...props
}: InputProps) {
  return (
    <input
      className={`input ${error ? 'err' : ''} ${className}`.trim()}
      {...props}
    />
  )
}
