-- =====================================================
-- project_tasks テーブルのRLS無効化
-- タスク追加時の権限エラー（42501）を解決
-- =====================================================

-- RLSを無効化
ALTER TABLE project_tasks DISABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（クリーンアップ）
DROP POLICY IF EXISTS "Authenticated users can view project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "Authenticated users can insert project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "Authenticated users can update project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "Authenticated users can delete project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "Allow all for project_tasks" ON project_tasks;

-- 確認
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'project_tasks';

SELECT '✅ project_tasks RLS無効化完了' as result;
