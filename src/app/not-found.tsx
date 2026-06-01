import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="container py-16 sm:py-24">
      <div className="max-w-lg mx-auto text-center">
        <div
          className="text-[88px] sm:text-[120px] leading-none font-extrabold tracking-tight mb-2"
          style={{
            backgroundImage: 'linear-gradient(135deg,#0f2c4a,#1c8ce3)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          404
        </div>
        <h1 className="mb-2">Страница не найдена</h1>
        <p className="text-muted mb-7">
          Возможно, ссылка устарела или страницу переместили. Вернитесь на главную или загляните в каталог.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="btn btn-primary btn-lg">На главную</Link>
          <Link href="/catalog" className="btn btn-secondary btn-lg">В каталог</Link>
        </div>
      </div>
    </div>
  )
}
