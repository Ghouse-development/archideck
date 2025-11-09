-- =====================================================
-- テーブル確認SQL
-- =====================================================

-- テーブル存在確認
SELECT
  'vendor_categories' as table_name,
  (SELECT COUNT(*) FROM vendor_categories) as record_count
UNION ALL
SELECT
  'tasks',
  (SELECT COUNT(*) FROM tasks)
UNION ALL
SELECT
  'vendors_v2',
  (SELECT COUNT(*) FROM vendors_v2)
UNION ALL
SELECT
  'task_vendor_mappings_v2',
  (SELECT COUNT(*) FROM task_vendor_mappings_v2);

-- カテゴリ詳細
SELECT '=== 業者カテゴリ ===' as section;
SELECT * FROM vendor_categories ORDER BY display_order;

-- タスク詳細
SELECT '=== タスク ===' as section;
SELECT task_key, task_name, category, has_state FROM tasks ORDER BY category, display_order;

-- 業者詳細
SELECT '=== 業者 ===' as section;
SELECT company, email, (SELECT name FROM vendor_categories WHERE id = vendors_v2.category_id) as category
FROM vendors_v2 ORDER BY company;

-- タスク-業者紐づけ
SELECT '=== タスク-業者紐づけ ===' as section;
SELECT
  (SELECT task_name FROM tasks WHERE id = task_vendor_mappings_v2.task_id) as task,
  (SELECT company FROM vendors_v2 WHERE id = task_vendor_mappings_v2.vendor_id) as vendor
FROM task_vendor_mappings_v2;
