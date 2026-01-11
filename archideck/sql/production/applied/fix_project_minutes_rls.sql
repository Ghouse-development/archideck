-- =====================================================
-- project_minutes テーブルのRLS無効化
-- 議事録保存時の権限エラー（42501）を解決
-- =====================================================

-- RLSを無効化
ALTER TABLE project_minutes DISABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（クリーンアップ）
DROP POLICY IF EXISTS "Authenticated users can view project_minutes" ON project_minutes;
DROP POLICY IF EXISTS "Authenticated users can insert project_minutes" ON project_minutes;
DROP POLICY IF EXISTS "Authenticated users can update project_minutes" ON project_minutes;
DROP POLICY IF EXISTS "Authenticated users can delete project_minutes" ON project_minutes;
DROP POLICY IF EXISTS "Allow all for project_minutes" ON project_minutes;

-- 確認
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'project_minutes';

SELECT '✅ project_minutes RLS無効化完了' as result;
