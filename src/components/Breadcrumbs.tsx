import Link from 'next/link'

export interface Crumb {
  label: string
  href?: string
}

/** Единые «хлебные крошки» для внутренних страниц. */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-[13px] text-muted mb-4">
      {items.map((item, i) => {
        const last = i === items.length - 1
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {item.href && !last ? (
              <Link href={item.href} className="hover:text-blue transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={last ? 'text-navy font-medium' : ''}>{item.label}</span>
            )}
            {!last && (
              <svg className="ic ic-sm text-muted-2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
          </span>
        )
      })}
    </nav>
  )
}
