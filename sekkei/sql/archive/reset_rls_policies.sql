-- =====================================================
-- RLSポリシーを完全にリセットして再作成
-- =====================================================

-- 1. 全ての既存ポリシーを削除
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

-- 2. RLSを有効化（念のため）
ALTER TABLE designers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_template_mappings ENABLE ROW LEVEL SECURITY;

-- 3. 新しいポリシーを作成（認証済みユーザー + anon）
-- designers
CREATE POLICY "designers_select_policy" ON designers
  FOR SELECT
  USING (true);  -- 認証済み・未認証両方に許可

-- projects
CREATE POLICY "projects_select_policy" ON projects
  FOR SELECT
  USING (true);

CREATE POLICY "projects_insert_policy" ON projects
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "projects_update_policy" ON projects
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "projects_delete_policy" ON projects
  FOR DELETE
  USING (true);

-- email_templates
CREATE POLICY "email_templates_select_policy" ON email_templates
  FOR SELECT
  USING (true);

-- template_vendors
CREATE POLICY "template_vendors_select_policy" ON template_vendors
  FOR SELECT
  USING (true);

-- task_template_mappings
CREATE POLICY "task_template_mappings_select_policy" ON task_template_mappings
  FOR SELECT
  USING (true);

-- 4. 確認
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('designers', 'projects', 'email_templates', 'template_vendors', 'task_template_mappings')
ORDER BY tablename, policyname;

-- 5. テーブルのRLS状態を確認
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('designers', 'projects', 'email_templates', 'template_vendors', 'task_template_mappings')
ORDER BY tablename;
