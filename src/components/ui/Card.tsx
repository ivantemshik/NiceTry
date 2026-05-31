interface CardProps {
  children: React.ReactNode
  padding?: boolean
  className?: string
}

export default function Card({
  children,
  padding = true,
  className = '',
}: CardProps) {
  return (
    <div className={`card ${padding ? 'card-pad' : ''} ${className}`.trim()}>
      {children}
    </div>
  )
}
