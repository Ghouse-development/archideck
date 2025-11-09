-- =====================================================
-- タスク-業者 デフォルト紐づけデータ投入
-- =====================================================
--
-- このSQLは、よく使われるタスクと業者の組み合わせを
-- 事前に設定し、メールボタンをすぐに使えるようにします。
--
-- ⚠️ 実行前に：
-- 1. tasks テーブルと vendors_v2 テーブルにデータが存在することを確認
-- 2. 既存の紐づけを削除したい場合は TRUNCATE を実行
--

-- 既存の紐づけをクリア（必要に応じてコメント解除）
-- TRUNCATE TABLE task_vendor_mappings_v2;

-- =====================================================
-- 設計タスクの紐づけ
-- =====================================================

-- 換気図面 → パナソニック
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
WHERE t.task_key = 'ventilation'
  AND v.company LIKE '%パナソニック%'
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- 給排水設備図面 → 該当業者（設備カテゴリ）
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
CROSS JOIN vendor_categories vc
WHERE t.task_key = 'plumbing'
  AND v.category_id = vc.id
  AND vc.name IN ('設備', '給排水')
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- サッシプレゼン → サッシ業者
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
WHERE t.task_key = 'sash'
  AND (v.company LIKE '%サッシ%' OR v.company LIKE '%YKKAP%' OR v.company LIKE '%LIXIL%')
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- 太陽光依頼 → 太陽光業者
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
WHERE t.task_key = 'solar'
  AND v.company LIKE '%太陽光%'
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- エボルツ依頼 → エボルツ関連業者
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
WHERE t.task_key = 'evoltz'
  AND (v.company LIKE '%エボルツ%' OR v.company LIKE '%蓄電池%')
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- 構造依頼 → 構造設計事務所
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
CROSS JOIN vendor_categories vc
WHERE t.task_key = 'structure'
  AND v.category_id = vc.id
  AND vc.name = '構造'
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- =====================================================
-- ICタスクの紐づけ
-- =====================================================

-- 設備PB → 設備業者
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
CROSS JOIN vendor_categories vc
WHERE t.task_key = 'ic_equipment'
  AND v.category_id = vc.id
  AND vc.name = '設備'
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- 照明プラン → 照明業者
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
WHERE t.task_key = 'ic_lighting'
  AND v.company LIKE '%照明%'
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- 建具プレゼン → 建具業者
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
WHERE t.task_key = 'ic_tategu'
  AND v.company LIKE '%建具%'
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- アイアン階段手摺 → アイアン業者
INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id)
SELECT
  t.id as task_id,
  v.id as vendor_id
FROM tasks t
CROSS JOIN vendors_v2 v
WHERE t.task_key = 'ic_iron'
  AND v.company LIKE '%アイアン%'
ON CONFLICT (task_id, vendor_id) DO NOTHING;

-- =====================================================
-- 結果確認
-- =====================================================
SELECT
  t.task_name,
  t.category,
  COUNT(tvm.id) as vendor_count,
  STRING_AGG(v.company, ', ') as vendors
FROM tasks t
LEFT JOIN task_vendor_mappings_v2 tvm ON t.id = tvm.task_id
LEFT JOIN vendors_v2 v ON tvm.vendor_id = v.id
GROUP BY t.id, t.task_name, t.category
ORDER BY t.category, t.display_order;

SELECT '✅ タスク-業者紐づけデータ投入完了' as result;
