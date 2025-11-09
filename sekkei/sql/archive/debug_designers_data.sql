-- =====================================================
-- 設計士データの詳細診断SQL
-- =====================================================

-- 1. designersテーブルの全データを確認
SELECT
  id,
  name,
  email,
  category,
  length(category) as category_length,
  ascii(substring(category, 1, 1)) as first_char_ascii,
  created_at
FROM designers
ORDER BY category, name;

-- 2. categoryの値と件数を確認
SELECT
  category,
  length(category) as length,
  COUNT(*) as count
FROM designers
GROUP BY category
ORDER BY category;

-- 3. RLSポリシーを確認
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'designers'
ORDER BY policyname;

-- 4. テーブルのRLS状態を確認
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'designers';

-- 5. 現在のユーザーロールを確認
SELECT current_user, current_setting('role');
