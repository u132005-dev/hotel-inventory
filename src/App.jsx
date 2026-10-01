// 修正前のコード
const payload = {
  name: itemFormData.name.trim(),
  category: itemFormData.category.trim(),
  location_id: itemFormData.location_id ? itemFormData.location_id : null,
  stock_quantity: itemFormData.stock_quantity,
  reorder_point: itemFormData.reorder_point,
  unit: itemFormData.unit.trim(),
  jan_code: null // ← これが残っているため、Supabase側で「jan_code = null」として重複（またはエラー）と判定される場合があります
};