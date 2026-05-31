export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="mb-6">
          <svg
            width="150"
            viewBox="0 0 320 70"
            xmlns="http://www.w3.org/2000/svg"
            className="mx-auto"
          >
            <text x="0" y="52" fontFamily="Arial" fontWeight="900" fontSize="58" fill="#1C8CE3">N</text>
            <text x="38" y="52" fontFamily="Arial" fontWeight="900" fontSize="58" fill="#0F1E2E">T</text>
            <text x="92" y="40" fontFamily="'Segoe Script','Brush Script MT',cursive" fontStyle="italic" fontSize="40" fill="#1C8CE3">Nice</text>
            <text x="150" y="64" fontFamily="'Segoe Script','Brush Script MT',cursive" fontStyle="italic" fontSize="40" fill="#0F1E2E">try</text>
          </svg>
        </div>

        <h1 className="text-4xl font-bold text-navy mb-4">
          NiceTry — магазин цифровых товаров
        </h1>

        <p className="text-muted mb-8 max-w-2xl mx-auto">
          Этап 0: Подготовка завершена. Next.js + Supabase + Tailwind CSS.
          <br />
          Следующий этап: авторизация и бэкенд-каркас.
        </p>

        <div className="inline-flex items-center gap-3 px-6 py-3 bg-blue text-white rounded-lg shadow-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7"/>
          </svg>
          <span className="font-semibold">Проект инициализирован</span>
        </div>

        <div className="mt-12 text-sm text-muted-2">
          <p>Репозиторий: <code className="px-2 py-1 bg-gray-bg rounded">ivantemshik/NiceTry</code></p>
          <p className="mt-2">Деплой: Vercel (автодеплой из GitHub)</p>
        </div>
      </div>
    </div>
  )
}
