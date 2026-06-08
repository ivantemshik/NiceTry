import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'

// POST /api/admin/products/[id]/keys - загрузка ключей для instant товара
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response
    const supabase = guard.admin

    // Проверяем, что товар существует и имеет тип instant
    const { data: product } = await supabase
      .from('products')
      .select('type')
      .eq('id', params.id)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (product.type !== 'instant') {
      return NextResponse.json(
        { error: 'Only instant products can have keys' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { keys } = body // массив строк

    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: 'Keys array is required' }, { status: 400 })
    }

    // Вставляем ключи
    const keysToInsert = keys.map((key: string) => ({
      product_id: params.id,
      key_value: key.trim(),
      is_used: false,
    }))

    const { data: insertedKeys, error } = await supabase
      .from('product_keys')
      .insert(keysToInsert)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Обновляем stock товара
    const { count: availableKeys } = await supabase
      .from('product_keys')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', params.id)
      .eq('is_used', false)

    await supabase
      .from('products')
      .update({ stock: availableKeys || 0 })
      .eq('id', params.id)

    return NextResponse.json({
      success: true,
      added: insertedKeys?.length || 0,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET /api/admin/products/[id]/keys - получение ключей товара
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response
    const supabase = guard.admin

    const { data: keys, error } = await supabase
      .from('product_keys')
      .select('*')
      .eq('product_id', params.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ keys })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
