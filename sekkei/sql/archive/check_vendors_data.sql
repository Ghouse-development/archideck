-- =====================================================
-- 業者データの確認
-- =====================================================

-- 業者データの件数確認
SELECT
  'vendors_v2' as table_name,
  COUNT(*) as record_count
FROM vendors_v2;

-- 業者データの詳細
SELECT
  v.id,
  v.company,
  v.contact,
  v.tel,
  v.email,
  vc.name as category_name,
  v.subject_format,
  CASE
    WHEN v.template_text IS NOT NULL THEN '✅ あり'
    ELSE '❌ なし'
  END as has_template
FROM vendors_v2 v
LEFT JOIN vendor_categories vc ON v.category_id = vc.id
ORDER BY v.company;

-- カテゴリ別の業者数
SELECT
  COALESCE(vc.name, '未分類') as category_name,
  COUNT(v.id) as vendor_count
FROM vendors_v2 v
LEFT JOIN vendor_categories vc ON v.category_id = vc.id
GROUP BY vc.name
ORDER BY vendor_count DESC;
