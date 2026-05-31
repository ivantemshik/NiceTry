import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-white border-t border-border mt-auto">
      <div className="container py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* О проекте */}
          <div>
            <h4 className="font-bold text-navy mb-3">NiceTry</h4>
            <p className="text-sm text-muted">
              Магазин цифровых товаров с моментальной доставкой
            </p>
          </div>

          {/* Каталог */}
          <div>
            <h4 className="font-bold text-navy mb-3">Каталог</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/catalog" className="text-muted hover:text-blue transition-colors">
                  Все товары
                </Link>
              </li>
              <li>
                <Link href="/catalog?type=instant" className="text-muted hover:text-blue transition-colors">
                  Моментальные
                </Link>
              </li>
              <li>
                <Link href="/catalog?type=topup" className="text-muted hover:text-blue transition-colors">
                  Пополнения
                </Link>
              </li>
            </ul>
          </div>

          {/* Информация */}
          <div>
            <h4 className="font-bold text-navy mb-3">Информация</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-muted hover:text-blue transition-colors">
                  О нас
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-muted hover:text-blue transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/contacts" className="text-muted hover:text-blue transition-colors">
                  Контакты
                </Link>
              </li>
            </ul>
          </div>

          {/* Поддержка */}
          <div>
            <h4 className="font-bold text-navy mb-3">Поддержка</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://t.me/nicetry_support" className="text-muted hover:text-blue transition-colors">
                  Telegram
                </a>
              </li>
              <li>
                <Link href="/terms" className="text-muted hover:text-blue transition-colors">
                  Условия использования
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted hover:text-blue transition-colors">
                  Политика конфиденциальности
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border text-center text-sm text-muted">
          <p>&copy; {new Date().getFullYear()} NiceTry. Все права защищены.</p>
        </div>
      </div>
    </footer>
  )
}
