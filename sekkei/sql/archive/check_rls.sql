-- =====================================================
-- RLSポリシー診断SQL
-- データが取得できない原因を特定
-- =====================================================

-- 現在のRLSポリシーを確認
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 一時的にRLSを無効化してテスト（診断用）
-- 注意: これを実行するとセキュリティが無効になります
-- ALTER TABLE designers DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE email_templates DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE template_vendors DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE task_template_mappings DISABLE ROW LEVEL SECURITY;

-- データ件数確認
SELECT 'designers' AS table_name, COUNT(*) AS count FROM designers
UNION ALL
SELECT 'projects', COUNT(*) FROM projects
UNION ALL
SELECT 'email_templates', COUNT(*) FROM email_templates
UNION ALL
SELECT 'template_vendors', COUNT(*) FROM template_vendors
UNION ALL
SELECT 'task_template_mappings', COUNT(*) FROM task_template_mappings;
