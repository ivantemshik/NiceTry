import type { Metadata } from 'next'
import LegalDoc, { LegalRequisites } from '@/components/LegalDoc'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = {
  title: `Обратная связь — ${LEGAL.siteName}`,
  description: 'Контакты и реквизиты компании',
}

export default function ContactsPage() {
  return (
    <LegalDoc eyebrow="Контакты" title="Обратная связь">
      <p>
        По всем вопросам, связанным с оформлением заказов, возвратами и работой сервиса, вы можете
        связаться с нами удобным способом. Обращения по возвратам и претензиям направляйте по
        электронной почте или через каналы поддержки, указанные ниже.
      </p>

      <div className="legal-contact-grid">
        <div className="legal-contact-card">
          <p className="lc-label">E-mail</p>
          <p className="lc-value">
            <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
          </p>
        </div>
        <div className="legal-contact-card">
          <p className="lc-label">Сайт</p>
          <p className="lc-value">
            <a href={LEGAL.url} target="_blank" rel="noopener noreferrer">
              {LEGAL.domain}
            </a>
          </p>
        </div>
      </div>

      <h2>Реквизиты компании</h2>
      <p>{LEGAL.companyFull}</p>

      <LegalRequisites title="Реквизиты" />
    </LegalDoc>
  )
}
