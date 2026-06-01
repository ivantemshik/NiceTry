import Link from 'next/link'
import { LEGAL } from '@/lib/legal'

/**
 * Обёртка страницы юридического документа: единая бело-голубая тема сайта,
 * читабельная типографика (ограниченная ширина колонки), бейдж раздела,
 * заголовок и дата действующей редакции. Контент документа передаётся в children
 * и оформляется классами .legal-prose (см. globals.css).
 *
 * Серверный компонент — статическая страница, работает и на сайте, и в Telegram Mini App.
 */
export default function LegalDoc({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="legal">
      <div className="container">
        <div className="legal-wrap">
          <nav className="legal-meta" aria-label="Хлебные крошки" style={{ marginBottom: 14 }}>
            <Link href="/" className="hover:underline" style={{ color: 'var(--blue-700)' }}>
              Главная
            </Link>{' '}
            / {title}
          </nav>

          <article className="legal-card">
            <span className="legal-eyebrow">{eyebrow}</span>
            <h1 className="legal-title">{title}</h1>
            <p className="legal-edition">
              {LEGAL.cityLine} · {LEGAL.editionLabel}
            </p>
            <hr className="legal-divider" />
            <div className="legal-prose">{children}</div>
          </article>
        </div>
      </div>
    </div>
  )
}

/** Блок реквизитов компании — единый для всех документов, данные из LEGAL. */
export function LegalRequisites({ title = 'Реквизиты' }: { title?: string }) {
  return (
    <div className="legal-req">
      <h3>{title}</h3>
      <dl>
        <dt>Организация</dt>
        <dd>{LEGAL.companyFull}</dd>
        <dt>БИН</dt>
        <dd>{LEGAL.bin}</dd>
        <dt>Юридический адрес</dt>
        <dd>{LEGAL.addressOneLine}</dd>
        <dt>Сайт</dt>
        <dd>
          <a href={LEGAL.url} target="_blank" rel="noopener noreferrer">
            {LEGAL.domain}
          </a>
        </dd>
        <dt>E-mail</dt>
        <dd>
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        </dd>
      </dl>
    </div>
  )
}
