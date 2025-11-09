-- =====================================================
-- 全ての問題を一気に解決するSQL
-- =====================================================

-- ステップ1: 全テーブルのRLSを一旦無効化
ALTER TABLE designers DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE template_vendors DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_template_mappings DISABLE ROW LEVEL SECURITY;

-- ステップ2: 全ポリシーを削除
DROP POLICY IF EXISTS "designers_select_policy" ON designers;
DROP POLICY IF EXISTS "designers_anon_select" ON designers;
DROP POLICY IF EXISTS "projects_select_policy" ON projects;
DROP POLICY IF EXISTS "projects_insert_policy" ON projects;
DROP POLICY IF EXISTS "projects_update_policy" ON projects;
DROP POLICY IF EXISTS "projects_delete_policy" ON projects;
DROP POLICY IF EXISTS "email_templates_select_policy" ON email_templates;
DROP POLICY IF EXISTS "email_templates_anon_select" ON email_templates;
DROP POLICY IF EXISTS "template_vendors_select_policy" ON template_vendors;
DROP POLICY IF EXISTS "template_vendors_anon_select" ON template_vendors;
DROP POLICY IF EXISTS "task_template_mappings_select_policy" ON task_template_mappings;
DROP POLICY IF EXISTS "task_template_mappings_anon_select" ON task_template_mappings;

-- ステップ3: テーブルの確認
SELECT 'テーブル確認' as step;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('designers', 'projects', 'email_templates', 'template_vendors', 'task_template_mappings');

-- ステップ4: データ確認
SELECT 'designersデータ確認' as step;
SELECT COUNT(*) as designers_count FROM designers;

SELECT 'email_templatesデータ確認' as step;
SELECT COUNT(*) as templates_count FROM email_templates;

SELECT 'template_vendorsデータ確認' as step;
SELECT COUNT(*) as vendors_count FROM template_vendors;

-- ステップ5: RLS完全無効化の確認
SELECT 'RLS状態確認' as step;
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('designers', 'projects', 'email_templates', 'template_vendors', 'task_template_mappings');

-- 完了メッセージ
SELECT '✅ RLSを完全に無効化しました。これでデータが取得できるはずです。' as result;
