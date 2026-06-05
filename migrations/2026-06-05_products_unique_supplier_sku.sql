-- Миграция (AppRoute sync): DB-level защита от дублей товаров поставщика.
--
-- Контекст: scripts/sync-approute.mjs идемпотентен на уровне приложения — он префетчит
-- существующие approute-товары по бизнес-ключу (supplier_service_id, denomination_id) и
-- апсертит по первичному ключу id. Этот индекс — дополнительная гарантия на уровне БД:
-- два параллельных синка (или ручная вставка) не смогут создать дубль одного SKU.
--
-- ЧАСТИЧНЫЙ (partial) индекс: защищает ТОЛЬКО строки с непустым бизнес-ключом, т.е. реальные
-- SKU из фида поставщика (у них всегда есть supplier_service_id). Ручные approute-товары
-- (type=manual/topup_manual) имеют supplier_service_id=NULL и denomination_id=NULL — это НЕ дубли,
-- а разные позиции, и под ограничение они не попадают. Поэтому здесь НЕЛЬЗЯ использовать
-- NULLS NOT DISTINCT по всей таблице: он схлопнул бы любые две ручные approute-записи в "дубль".
--
-- denomination_id может быть NULL у dtu-сервисов — но supplier_service_id у них задан, так что
-- пара (supplier, service_id, NULL) уникальна сама по себе; NULLS NOT DISTINCT внутри WHERE-набора
-- не требуется, поскольку для dtu service_id всегда уникален на сервис.
--
-- Применять через service-role (psql / Supabase SQL editor). Идемпотентна (IF NOT EXISTS).

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_supplier_sku
  ON products (supplier, supplier_service_id, denomination_id)
  WHERE supplier_service_id IS NOT NULL;
