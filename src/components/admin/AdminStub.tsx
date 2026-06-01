interface AdminStubProps {
  title: string
  subtitle: string
  icon: JSX.Element
  features: string[]
}

/** Единая заглушка «раздел в разработке» для админских страниц. */
export default function AdminStub({ title, subtitle, icon, features }: AdminStubProps) {
  return (
    <div className="max-w-7xl">
      <div className="mb-6">
        <h1>{title}</h1>
        <p className="text-muted mt-1">{subtitle}</p>
      </div>

      <div className="card card-pad">
        <div className="flex flex-col items-center text-center py-10 px-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 text-blue-700 mb-4">
            <svg className="ic" style={{ width: 28, height: 28 }} viewBox="0 0 24 24">{icon}</svg>
          </div>
          <h3 className="mb-1.5">Раздел в разработке</h3>
          <p className="text-muted mb-6 max-w-md">Функционал будет добавлен в следующей версии.</p>
          <div className="text-sm text-muted-2 text-left bg-gray-bg rounded-lg p-4 w-full max-w-sm">
            <p className="font-semibold text-muted mb-2">Планируемые возможности</p>
            <ul className="space-y-1.5">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <svg className="ic ic-sm mt-0.5 flex-none text-blue-700" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
