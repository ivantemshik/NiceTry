// Лёгкий мок supabase-js query-builder для тестов серверных роутов.
// Поддерживает цепочки .select().eq().single()/.maybeSingle() и await (thenable),
// а также insert/update/delete. Результаты задаются per-table (можно очередью на
// последовательные вызовы одной таблицы).

export interface QueryResult {
  data?: unknown
  error?: unknown
}

type TableConfig = QueryResult | QueryResult[]

export interface MockDb {
  // Карта: имя таблицы → результат (или очередь результатов на повторные обращения).
  tables?: Record<string, TableConfig>
  // Записываем все мутации для проверок.
  calls?: Array<{ table: string; op: string; payload?: unknown }>
}

function nextResult(cfg: TableConfig | undefined): QueryResult {
  if (cfg === undefined) return { data: null, error: null }
  if (Array.isArray(cfg)) {
    if (cfg.length === 0) return { data: null, error: null }
    return cfg.length > 1 ? (cfg.shift() as QueryResult) : cfg[0]
  }
  return cfg
}

function makeBuilder(table: string, db: MockDb) {
  const result = () => nextResult(db.tables?.[table])
  const record = (op: string, payload?: unknown) => {
    db.calls = db.calls || []
    db.calls.push({ table, op, payload })
  }

  const builder: any = {
    select: () => builder,
    insert: (payload: unknown) => {
      record('insert', payload)
      return builder
    },
    update: (payload: unknown) => {
      record('update', payload)
      return builder
    },
    delete: () => {
      record('delete')
      return builder
    },
    upsert: (payload: unknown) => {
      record('upsert', payload)
      return builder
    },
    eq: () => builder,
    neq: () => builder,
    gt: () => builder,
    gte: () => builder,
    lt: () => builder,
    lte: () => builder,
    or: () => builder,
    ilike: () => builder,
    in: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    single: async () => result(),
    maybeSingle: async () => result(),
    // Делает builder awaitable: `await supabase.from('x').select()...`
    then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  }
  return builder
}

/** Мок сессионного клиента (`@/lib/supabase/server` createClient). */
export function makeSessionClient(opts: { user?: { id: string; email?: string } | null; db?: MockDb }) {
  const db = opts.db || {}
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: null }),
    },
    from: (table: string) => makeBuilder(table, db),
  }
}

/** Мок service-role клиента (`@/lib/supabase/admin` supabaseAdmin). */
export function makeAdminClient(db: MockDb) {
  return {
    from: (table: string) => makeBuilder(table, db),
    auth: { admin: {} },
  }
}
